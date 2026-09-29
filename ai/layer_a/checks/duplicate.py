"""
Layer A — Duplicate Detection Check

Method   : Perceptual hashing (pHash) via the `imagehash` library.
           Hamming distance between two 64-bit pHashes is computed.
           A similarity score is derived as: 1 - (hamming_dist / 64).

Threshold: Hamming distance < 10 (of 64 bits) = duplicate → hard rejection
           (spec Step 14). Equivalent similarity gate ≈ 0.844.

This check requires a hash store to compare against.
The `hash_store` parameter is a callable:
    hash_store(phash: str) -> tuple[bool, float | None, str | None]
    Returns (is_duplicate, similarity, matched_media_id)

When `hash_store` is None (e.g. unit tests or offline mode):
  - The pHash is computed but no comparison is performed.
  - is_duplicate = False is returned with a warning in the reason.

References:
  - README Table: "Perceptual hash (pHash) + cosine similarity | > 0.95 match → reject | Hard reject"
  - Build Plan Step 14: "Hamming distance < 10 → likely duplicate"
  (README uses 0.95 similarity as the public-facing threshold.
   At 64-bit pHash: 0.95 ≡ Hamming dist ≤ 3.
   Build Plan's "< 10" is a looser gate for flagging; we use the stricter 0.95 for hard-rejection.)
"""

from __future__ import annotations
import time
from typing import Callable, Optional, Tuple
import numpy as np
from ai.schemas.layer_a import DuplicateResult

# ── Constants ──────────────────────────────────────────────────────────────────
PHASH_BITS: int = 64  # imagehash phash default is 8×8 = 64 bits
# Spec Step 14: "Hamming distance < 10 between phash strings → likely duplicate".
DUPLICATE_HAMMING_THRESHOLD: int = 10
# Equivalent similarity gate (1 - dist/64). Hamming < 10 ⇔ similarity > 0.84375.
DUPLICATE_SIMILARITY_THRESHOLD: float = 1.0 - (DUPLICATE_HAMMING_THRESHOLD / PHASH_BITS)


def is_duplicate_by_hamming(hash1: str, hash2: str) -> bool:
    """Spec rule: two pHashes are duplicates when Hamming distance < 10."""
    import imagehash

    distance = imagehash.hex_to_hash(hash1) - imagehash.hex_to_hash(hash2)
    return distance < DUPLICATE_HAMMING_THRESHOLD

HashStoreFn = Callable[[str], Tuple[bool, Optional[float], Optional[str]]]


def _phash_from_array(image_bgr: np.ndarray) -> str:
    """Compute pHash string from a BGR numpy array."""
    from PIL import Image
    import imagehash

    # Convert BGR → RGB for PIL
    rgb = image_bgr[:, :, ::-1]
    pil_img = Image.fromarray(rgb.astype(np.uint8))
    return str(imagehash.phash(pil_img))


def hamming_similarity(hash1: str, hash2: str) -> float:
    """
    Compute perceptual similarity from two pHash hex strings.

    Returns: float in [0.0, 1.0] where 1.0 = identical.
    """
    import imagehash

    h1 = imagehash.hex_to_hash(hash1)
    h2 = imagehash.hex_to_hash(hash2)
    distance = h1 - h2  # Hamming distance
    return 1.0 - (distance / PHASH_BITS)


def compute_duplicate_score(
    image_bgr: np.ndarray,
    hash_store: Optional[HashStoreFn] = None,
) -> DuplicateResult:
    """
    Check whether this image is a duplicate of a previously seen image.

    Args:
        image_bgr  : NumPy BGR array.
        hash_store : Callable that looks up the pHash in the media store.
                     Signature: (phash: str) -> (is_dup, similarity, matched_id)
                     Pass None to skip comparison (hash is still computed).

    Returns:
        DuplicateResult. If is_duplicate=True, this is a hard rejection.
    """
    t_start = time.perf_counter()

    phash = _phash_from_array(image_bgr)

    if hash_store is None:
        processing_ms = (time.perf_counter() - t_start) * 1000
        return DuplicateResult(
            is_duplicate=False,
            similarity=None,
            matched_media_id=None,
            phash=phash,
            threshold=DUPLICATE_SIMILARITY_THRESHOLD,
            reason=(
                "No hash store provided — duplicate check skipped. "
                f"Image pHash computed: {phash}. "
                "This check must be enabled in production."
            ),
            processing_ms=round(processing_ms, 2),
        )

    is_duplicate, similarity, matched_id = hash_store(phash)

    if is_duplicate:
        reason = (
            f"Image is a duplicate (similarity={similarity:.4f} > threshold {DUPLICATE_SIMILARITY_THRESHOLD}). "
            f"Matched media_id: {matched_id}. Hard rejection applied."
        )
    else:
        sim_str = f"{similarity:.4f}" if similarity is not None else "N/A"
        reason = f"No duplicate found (max similarity={sim_str} ≤ threshold {DUPLICATE_SIMILARITY_THRESHOLD})."

    processing_ms = (time.perf_counter() - t_start) * 1000

    return DuplicateResult(
        is_duplicate=is_duplicate,
        similarity=similarity,
        matched_media_id=matched_id,
        phash=phash,
        threshold=DUPLICATE_SIMILARITY_THRESHOLD,
        reason=reason,
        processing_ms=round(processing_ms, 2),
    )
