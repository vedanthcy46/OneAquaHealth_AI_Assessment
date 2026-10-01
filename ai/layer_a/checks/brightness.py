"""
Layer A — Brightness Check

Method : Convert image to HSV colour space; measure mean of the Value channel.
Thresholds (spec Step 12):
  - Mean < 50  → too dark  (fail)
  - Mean > 210 → overexposed (fail)
  - 50–210      → acceptable (pass)

Scoring (deterministic, documented):
  The ideal mean is 130 (midpoint of 50–210). The score is highest at 130
  and falls off linearly toward either threshold:

    score = 100 × (1 - |mean - 130| / 80)   clamped to [0, 100]

  At mean=50  → score = 0 (exactly at low threshold)
  At mean=130 → score = 100 (ideal)
  At mean=210 → score = 0 (exactly at high threshold)

References:
  - Build Plan Step 12: "Pixel histogram mean | mean < 50 (dark) or > 210 (blown)"
"""

from __future__ import annotations
import time
import numpy as np
from ai.schemas.layer_a import BrightnessResult

# ── Constants ──────────────────────────────────────────────────────────────────
BRIGHTNESS_LOW: float = 50.0      # Below this = too dark (spec Step 12)
BRIGHTNESS_HIGH: float = 210.0    # Above this = overexposed (spec Step 12)
BRIGHTNESS_IDEAL: float = 130.0   # Midpoint used for linear scoring ((50+210)/2)
BRIGHTNESS_HALF_RANGE: float = 80.0  # (IDEAL - LOW) == (HIGH - IDEAL)


def compute_brightness_score(image_bgr: np.ndarray) -> BrightnessResult:
    """
    Compute brightness score using the HSV Value-channel mean.

    Args:
        image_bgr: NumPy array in BGR format.

    Returns:
        BrightnessResult with score, pass/fail, HSV mean, thresholds, and reason.
    """
    import cv2

    t_start = time.perf_counter()

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    value_channel = hsv[:, :, 2]
    mean_value = float(value_channel.mean())

    passed = BRIGHTNESS_LOW <= mean_value <= BRIGHTNESS_HIGH

    # Linear score centred on ideal, clamped to 0–100
    deviation = abs(mean_value - BRIGHTNESS_IDEAL)
    raw_score = 1.0 - (deviation / BRIGHTNESS_HALF_RANGE)
    score = int(max(0.0, min(100.0, raw_score * 100)))

    if mean_value < BRIGHTNESS_LOW:
        reason = (
            f"Image is too dark (HSV mean={mean_value:.1f} < threshold {BRIGHTNESS_LOW}). "
            "Please retake in brighter lighting or move to an area with more natural light."
        )
    elif mean_value > BRIGHTNESS_HIGH:
        reason = (
            f"Image is overexposed (HSV mean={mean_value:.1f} > threshold {BRIGHTNESS_HIGH}). "
            "Please retake avoiding direct sunlight or reducing camera exposure."
        )
    else:
        reason = f"Brightness is acceptable (HSV mean={mean_value:.1f}, range {BRIGHTNESS_LOW}–{BRIGHTNESS_HIGH})."

    processing_ms = (time.perf_counter() - t_start) * 1000

    return BrightnessResult(
        score=score,
        passed=passed,
        hsv_value_mean=round(mean_value, 2),
        low_threshold=BRIGHTNESS_LOW,
        high_threshold=BRIGHTNESS_HIGH,
        reason=reason,
        processing_ms=round(processing_ms, 2),
    )
