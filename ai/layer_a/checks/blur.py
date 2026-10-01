"""
Layer A — Blur Detection Check

Method : Laplacian variance on the grayscale image.
Threshold: variance < 100 = fail (image is too blurry) — per spec Step 12.

Scoring:
  - Variance is clamped to [0, 500].
  - Score = min(100, (variance / 500) * 100) mapped to 0–100.
  - This gives a smooth, deterministic, proportional score.
  - A variance of 100 yields score = 20 (below the pass threshold).

References:
  - Build Plan Step 12: "Laplacian variance on grayscale | variance < 100 → blurry"
  - 500 is used as the normalisation ceiling to spread the score meaningfully.
"""

from __future__ import annotations
import time
import numpy as np
from ai.schemas.layer_a import BlurResult

# ── Constants ──────────────────────────────────────────────────────────────────
BLUR_FAIL_THRESHOLD: float = 100.0       # Laplacian variance below this = fail (spec Step 12)
BLUR_SCORE_CEILING: float = 500.0        # Variance above this = perfect score (100)


def compute_blur_score(image_bgr: np.ndarray) -> BlurResult:
    """
    Compute blur score using Laplacian variance.

    Args:
        image_bgr: NumPy array in BGR format (as returned by cv2.imread).

    Returns:
        BlurResult with score, pass/fail, raw variance, threshold, and reason.
    """
    import cv2  # deferred import so cv2 is only required when this check runs

    t_start = time.perf_counter()

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = float(laplacian.var())

    # Clamp and normalise to 0–100
    clamped = min(variance, BLUR_SCORE_CEILING)
    score = int((clamped / BLUR_SCORE_CEILING) * 100)

    passed = variance >= BLUR_FAIL_THRESHOLD

    if passed:
        reason = f"Image sharpness is acceptable (variance={variance:.1f} ≥ {BLUR_FAIL_THRESHOLD})"
    else:
        reason = (
            f"Image is too blurry (variance={variance:.1f} < threshold {BLUR_FAIL_THRESHOLD}). "
            "Please retake in better focus."
        )

    processing_ms = (time.perf_counter() - t_start) * 1000

    return BlurResult(
        score=score,
        passed=passed,
        laplacian_variance=variance,
        threshold=BLUR_FAIL_THRESHOLD,
        reason=reason,
        processing_ms=round(processing_ms, 2),
    )
