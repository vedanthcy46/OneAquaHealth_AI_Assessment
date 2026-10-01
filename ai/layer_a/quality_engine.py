"""
Layer A — Image Quality Engine

Orchestrates all five checks (blur, brightness, occlusion, stream relevance,
duplicate) and produces a single unified LayerAResult.

Scoring weights (from AquaGuard Build Plan Step 15):
  quality_score = (blur_score    × 0.30)
                + (brightness    × 0.20)
                + (occlusion     × 0.20)
                + (relevance     × 0.30)

Duplicate detection is a hard-reject gate evaluated BEFORE scoring.
If a duplicate is found, processing stops immediately and a LayerAResult
with routing="hard_reject" is returned — no other checks are run.

Routing thresholds (from specification):
  < 40  → retake_required           (citizen must retake)
  40–69 → accepted_review_required  (accepted but flagged for human review)
  ≥ 70  → good                      (high-quality, auto-accepted)

Feedback messages are collected from every failed check so that
citizens receive a complete, actionable list of improvements.
"""

from __future__ import annotations
import time
from typing import Optional, List

import numpy as np

from ai.layer_a.checks import (
    compute_blur_score,
    compute_brightness_score,
    compute_occlusion_score,
    compute_stream_relevance_score,
    compute_duplicate_score,
    StreamRelevanceProvider,
)
from ai.layer_a.checks.duplicate import HashStoreFn
from ai.schemas.layer_a import LayerAResult, QualityRouting
from ai.utils.logger import get_logger

logger = get_logger(__name__)

# ── Scoring weights (must match spec; change here and nowhere else) ─────────────
_W_BLUR        = 0.30
_W_BRIGHTNESS  = 0.20
_W_OCCLUSION   = 0.20
_W_RELEVANCE   = 0.30


def _determine_routing(score: int) -> str:
    if score < 40:
        return QualityRouting.RETAKE_REQUIRED
    if score < 70:
        return QualityRouting.ACCEPTED_REVIEW
    return QualityRouting.GOOD


class ImageQualityEngine:
    """
    Evaluates the quality of a citizen-submitted image.

    Usage:
        engine = ImageQualityEngine(
            relevance_provider=MyVisionProvider(),
            hash_store=my_hash_store_fn,
        )
        result = engine.evaluate(image_bgr)
    """

    def __init__(
        self,
        relevance_provider: Optional[StreamRelevanceProvider] = None,
        hash_store: Optional[HashStoreFn] = None,
    ):
        """
        Args:
            relevance_provider: Vision-model provider for stream-relevance check.
                                 If None, a neutral 70-score is applied (documented).
            hash_store        : Callable for duplicate lookup.
                                 Signature: (phash) -> (is_dup, similarity, media_id)
                                 If None, duplicate check is skipped (hash still computed).
        """
        self.relevance_provider = relevance_provider
        self.hash_store = hash_store

    def evaluate(self, image_bgr: np.ndarray) -> LayerAResult:
        """
        Run all quality checks on a BGR image array.

        Args:
            image_bgr: NumPy uint8 array in BGR format (from cv2.imread or equivalent).

        Returns:
            LayerAResult — the complete, unified quality assessment.
        """
        t_pipeline_start = time.perf_counter()
        logger.info("Layer A: starting image quality evaluation")

        feedback: List[str] = []

        # ── Step 1: Duplicate detection (hard-reject gate) ─────────────────────
        dup_result = compute_duplicate_score(image_bgr, self.hash_store)
        if dup_result.is_duplicate:
            logger.warning("Layer A: duplicate detected — hard reject")
            total_ms = (time.perf_counter() - t_pipeline_start) * 1000

            # We still need placeholder results for the other checks.
            # Return immediately with minimal data; other checks are not run.
            blur_ph        = compute_blur_score(image_bgr)
            brightness_ph  = compute_brightness_score(image_bgr)
            occlusion_ph   = compute_occlusion_score(image_bgr)
            relevance_ph   = compute_stream_relevance_score(image_bgr, self.relevance_provider)

            return LayerAResult(
                quality_score=0,
                passed=False,
                routing=QualityRouting.HARD_REJECT,
                feedback=["This image has already been submitted. Please use a new photograph."],
                blur=blur_ph,
                brightness=brightness_ph,
                occlusion=occlusion_ph,
                stream_relevance=relevance_ph,
                duplicate=dup_result,
                total_processing_ms=round(total_ms, 2),
            )

        # ── Step 2: Individual quality checks ──────────────────────────────────
        blur_result       = compute_blur_score(image_bgr)
        brightness_result = compute_brightness_score(image_bgr)
        occlusion_result  = compute_occlusion_score(image_bgr)
        relevance_result  = compute_stream_relevance_score(image_bgr, self.relevance_provider)

        # ── Step 3: Composite score (documented weights) ───────────────────────
        quality_score = int(
            blur_result.score        * _W_BLUR
            + brightness_result.score  * _W_BRIGHTNESS
            + occlusion_result.score   * _W_OCCLUSION
            + relevance_result.score   * _W_RELEVANCE
        )
        quality_score = max(0, min(100, quality_score))

        # ── Step 4: Collect feedback from every failed check ───────────────────
        if not blur_result.passed:
            feedback.append(blur_result.reason)
        if not brightness_result.passed:
            feedback.append(brightness_result.reason)
        if not occlusion_result.passed:
            feedback.append(occlusion_result.reason)
        if not relevance_result.passed:
            feedback.append(relevance_result.reason)

        # ── Step 5: Routing decision ───────────────────────────────────────────
        routing = _determine_routing(quality_score)
        passed  = quality_score >= 40  # consistent with routing logic

        if routing == QualityRouting.RETAKE_REQUIRED and not feedback:
            feedback.append(
                f"Overall quality score is too low ({quality_score}/100). "
                "Please retake the photo in good lighting with a clear, focused view of the stream."
            )

        total_ms = (time.perf_counter() - t_pipeline_start) * 1000
        logger.info(
            f"Layer A: complete | score={quality_score} | routing={routing} | "
            f"passed={passed} | time={total_ms:.1f}ms"
        )

        return LayerAResult(
            quality_score=quality_score,
            passed=passed,
            routing=routing,
            feedback=feedback,
            blur=blur_result,
            brightness=brightness_result,
            occlusion=occlusion_result,
            stream_relevance=relevance_result,
            duplicate=dup_result,
            total_processing_ms=round(total_ms, 2),
        )
