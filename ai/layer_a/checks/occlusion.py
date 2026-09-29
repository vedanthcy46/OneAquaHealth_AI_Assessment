"""
Layer A — Occlusion Detection Check

Method  : Canny edge density on the centre 50% region of the image.
          A low edge-pixel fraction in the centre indicates a large
          foreground obstruction blocking the scene of interest.

Threshold: blocked_fraction > 0.60 → fail (> 60% of the view is blocked)

"blocked_fraction" is estimated as:
  1 - (edge_pixel_count / total_centre_pixels) normalised to 0–1.
  i.e. fewer edges in the centre → higher blocked fraction.

Scoring (documented, deterministic):
  score = max(0, 100 - int(blocked_fraction * 100))
  At blocked_fraction=0.60 → score = 40 (exactly at failure gate)
  At blocked_fraction=0.00 → score = 100 (no occlusion)
  At blocked_fraction=1.00 → score = 0   (fully occluded)

Canny parameters:
  low_threshold=50, high_threshold=150  (standard Canny defaults)
  These are tuning knobs; change them in CANNY_LOW / CANNY_HIGH.

References:
  - README Table: "Object segmentation coverage | > 60% blocked → fail | −20 pts"
  - Build Plan Step 12: "Edge density in centre 50% region | < 0.05 → occluded"
  (We adopt both signals: threshold from README spec, method from Build Plan.)
"""

from __future__ import annotations
import time
import numpy as np
from ai.schemas.layer_a import OcclusionResult

# ── Constants ──────────────────────────────────────────────────────────────────
OCCLUSION_FAIL_THRESHOLD: float = 0.60   # > 60% blocked = fail
CANNY_LOW: int = 50
CANNY_HIGH: int = 150
CENTRE_CROP_FRACTION: float = 0.50       # Analyse the inner 50% of the image


def compute_occlusion_score(image_bgr: np.ndarray) -> OcclusionResult:
    """
    Estimate visual occlusion via Canny edge density in the image centre.

    Args:
        image_bgr: NumPy array in BGR format.

    Returns:
        OcclusionResult with score, blocked_fraction, pass/fail, and reason.
    """
    import cv2

    t_start = time.perf_counter()

    h, w = image_bgr.shape[:2]

    # Crop the centre region
    margin_y = int(h * (1 - CENTRE_CROP_FRACTION) / 2)
    margin_x = int(w * (1 - CENTRE_CROP_FRACTION) / 2)
    centre = image_bgr[margin_y: h - margin_y, margin_x: w - margin_x]

    gray = cv2.cvtColor(centre, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, CANNY_LOW, CANNY_HIGH)

    total_pixels = edges.size
    edge_pixels = int(np.count_nonzero(edges))

    edge_density = edge_pixels / total_pixels if total_pixels > 0 else 0.0

    # A very low edge density means the centre is featureless → likely occluded.
    # We normalise edge_density against a "normal" reference of 0.10 (10% edges).
    # blocked_fraction = 1 - min(edge_density / 0.10, 1.0)
    REFERENCE_EDGE_DENSITY = 0.10
    blocked_fraction = max(0.0, 1.0 - min(edge_density / REFERENCE_EDGE_DENSITY, 1.0))

    passed = blocked_fraction <= OCCLUSION_FAIL_THRESHOLD
    score = max(0, 100 - int(blocked_fraction * 100))

    if not passed:
        reason = (
            f"Large foreground obstruction detected "
            f"(estimated {blocked_fraction*100:.1f}% blocked > threshold {OCCLUSION_FAIL_THRESHOLD*100:.0f}%). "
            "Please retake from further back or reposition to remove obstructions."
        )
    else:
        reason = (
            f"View is sufficiently clear "
            f"(estimated {blocked_fraction*100:.1f}% blocked ≤ threshold {OCCLUSION_FAIL_THRESHOLD*100:.0f}%)."
        )

    processing_ms = (time.perf_counter() - t_start) * 1000

    return OcclusionResult(
        score=score,
        passed=passed,
        blocked_fraction=round(blocked_fraction, 4),
        threshold=OCCLUSION_FAIL_THRESHOLD,
        reason=reason,
        processing_ms=round(processing_ms, 2),
    )
