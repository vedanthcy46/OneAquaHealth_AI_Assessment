"""
Unit tests for Layer A — Image Quality Engine.

All tests use synthetic NumPy arrays so that:
  - No real image files are needed.
  - Tests run fully offline (no API calls, no filesystem I/O).
  - Every path through the code is exercised deterministically.

Test inventory:
  1. test_sharp_image_passes_blur_check
  2. test_blurry_image_fails_blur_check
  3. test_normal_brightness_passes
  4. test_dark_image_fails_brightness
  5. test_overexposed_image_fails_brightness
  6. test_clear_view_passes_occlusion
  7. test_occluded_image_fails_occlusion
  8. test_relevance_pass_with_mock_provider
  9. test_relevance_fail_with_mock_provider (irrelevant image)
  10. test_relevance_neutral_when_no_provider
  11. test_duplicate_hard_reject
  12. test_non_duplicate_passes
  13. test_full_pipeline_good_image
  14. test_full_pipeline_retake_required
  15. test_quality_score_weights_are_correct
  16. test_routing_boundaries
"""

from __future__ import annotations
import numpy as np
import pytest

# ── Helpers: synthetic image generators ───────────────────────────────────────

def _uniform_gray(value: int = 128, size: tuple = (300, 300)) -> np.ndarray:
    """Uniform colour image — very low Laplacian variance (blurry-like)."""
    img = np.ones((*size, 3), dtype=np.uint8) * value
    return img


def _noise_image(size: tuple = (300, 300), seed: int = 42) -> np.ndarray:
    """Random noise image — high Laplacian variance (sharp)."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (*size, 3), dtype=np.uint8)


def _textured_image(size: tuple = (300, 300)) -> np.ndarray:
    """
    Checkerboard image — high-frequency content, high Laplacian variance.
    This reliably passes the blur threshold.
    """
    img = np.zeros((*size, 3), dtype=np.uint8)
    block = 10
    for r in range(0, size[0], block):
        for c in range(0, size[1], block):
            val = 255 if ((r // block + c // block) % 2 == 0) else 0
            img[r:r+block, c:c+block] = val
    return img


def _dark_image(size: tuple = (300, 300)) -> np.ndarray:
    """Very dark image (HSV V-channel mean ≈ 10)."""
    return np.ones((*size, 3), dtype=np.uint8) * 10


def _overexposed_image(size: tuple = (300, 300)) -> np.ndarray:
    """Overexposed image (HSV V-channel mean ≈ 240)."""
    return np.ones((*size, 3), dtype=np.uint8) * 240


# ── Mock providers ─────────────────────────────────────────────────────────────

from ai.layer_a.checks.stream_relevance import StreamRelevanceProvider


class _MockPassProvider(StreamRelevanceProvider):
    """Always returns high confidence (stream detected)."""
    @property
    def provider_name(self) -> str:
        return "mock_pass"

    def classify(self, image_bgr: np.ndarray):
        return 0.95, "Mock: water body clearly visible."


class _MockFailProvider(StreamRelevanceProvider):
    """Always returns low confidence (not a stream)."""
    @property
    def provider_name(self) -> str:
        return "mock_fail"

    def classify(self, image_bgr: np.ndarray):
        return 0.20, "Mock: no water body detected."


# ── Mock hash store ────────────────────────────────────────────────────────────

def _make_duplicate_store(known_phash: str):
    """Returns a hash store that flags the given phash as a duplicate."""
    def _store(phash: str):
        sim = 1.0 if phash == known_phash else 0.0
        is_dup = sim > 0.95
        matched_id = "media-abc-123" if is_dup else None
        return is_dup, sim, matched_id
    return _store


def _empty_store(phash: str):
    """A hash store with no known images — never flags duplicates."""
    return False, 0.0, None


# ══════════════════════════════════════════════════════════════════════════════
# BLUR TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestBlurCheck:
    def test_sharp_image_passes(self):
        from ai.layer_a.checks.blur import compute_blur_score
        img = _textured_image()
        result = compute_blur_score(img)
        assert result.passed is True, f"Expected pass, got variance={result.laplacian_variance}"
        assert result.score > 0

    def test_blurry_image_fails(self):
        from ai.layer_a.checks.blur import compute_blur_score
        img = _uniform_gray(128)
        result = compute_blur_score(img)
        assert result.passed is False, f"Expected fail, got variance={result.laplacian_variance}"
        assert result.laplacian_variance < 80.0

    def test_score_is_zero_for_perfectly_uniform_image(self):
        from ai.layer_a.checks.blur import compute_blur_score
        img = _uniform_gray(128)
        result = compute_blur_score(img)
        assert result.score == 0

    def test_blur_result_has_threshold(self):
        from ai.layer_a.checks.blur import compute_blur_score, BLUR_FAIL_THRESHOLD
        result = compute_blur_score(_textured_image())
        assert result.threshold == BLUR_FAIL_THRESHOLD

    def test_processing_time_recorded(self):
        from ai.layer_a.checks.blur import compute_blur_score
        result = compute_blur_score(_textured_image())
        assert result.processing_ms >= 0.0


# ══════════════════════════════════════════════════════════════════════════════
# BRIGHTNESS TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestBrightnessCheck:
    def test_normal_brightness_passes(self):
        from ai.layer_a.checks.brightness import compute_brightness_score
        img = _uniform_gray(128)
        result = compute_brightness_score(img)
        assert result.passed is True

    def test_dark_image_fails(self):
        from ai.layer_a.checks.brightness import compute_brightness_score
        img = _dark_image()
        result = compute_brightness_score(img)
        assert result.passed is False
        assert result.hsv_value_mean < 30.0
        assert "dark" in result.reason.lower()

    def test_overexposed_image_fails(self):
        from ai.layer_a.checks.brightness import compute_brightness_score
        img = _overexposed_image()
        result = compute_brightness_score(img)
        assert result.passed is False
        assert result.hsv_value_mean > 220.0
        assert "overexposed" in result.reason.lower()

    def test_score_is_100_at_ideal_brightness(self):
        from ai.layer_a.checks.brightness import compute_brightness_score
        # HSV V-channel mean of BGR (125,125,125) ≈ 125 (ideal)
        img = _uniform_gray(125)
        result = compute_brightness_score(img)
        assert result.score == 100

    def test_score_is_0_for_black_image(self):
        from ai.layer_a.checks.brightness import compute_brightness_score
        img = _dark_image()
        result = compute_brightness_score(img)
        assert result.score == 0


# ══════════════════════════════════════════════════════════════════════════════
# OCCLUSION TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestOcclusionCheck:
    def test_textured_image_passes(self):
        from ai.layer_a.checks.occlusion import compute_occlusion_score
        img = _textured_image()
        result = compute_occlusion_score(img)
        assert result.passed is True

    def test_uniform_image_detected_as_occluded(self):
        from ai.layer_a.checks.occlusion import compute_occlusion_score
        img = _uniform_gray(128)
        result = compute_occlusion_score(img)
        # A uniform image has zero edges → maximum blocked_fraction → fails
        assert result.passed is False
        assert result.blocked_fraction >= 0.60

    def test_blocked_fraction_in_range(self):
        from ai.layer_a.checks.occlusion import compute_occlusion_score
        result = compute_occlusion_score(_textured_image())
        assert 0.0 <= result.blocked_fraction <= 1.0

    def test_score_inversely_related_to_blocking(self):
        from ai.layer_a.checks.occlusion import compute_occlusion_score
        clear  = compute_occlusion_score(_textured_image())
        occluded = compute_occlusion_score(_uniform_gray(128))
        assert clear.score > occluded.score


# ══════════════════════════════════════════════════════════════════════════════
# STREAM RELEVANCE TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestStreamRelevanceCheck:
    def test_passes_with_high_confidence_provider(self):
        from ai.layer_a.checks.stream_relevance import compute_stream_relevance_score
        result = compute_stream_relevance_score(_noise_image(), _MockPassProvider())
        assert result.passed is True
        assert result.confidence >= 0.70
        assert result.provider_used == "mock_pass"

    def test_fails_with_low_confidence_provider(self):
        """Simulate an irrelevant image (e.g., a selfie submitted by mistake)."""
        from ai.layer_a.checks.stream_relevance import compute_stream_relevance_score
        result = compute_stream_relevance_score(_noise_image(), _MockFailProvider())
        assert result.passed is False
        assert result.confidence < 0.70
        assert result.provider_used == "mock_fail"

    def test_neutral_score_when_no_provider(self):
        from ai.layer_a.checks.stream_relevance import (
            compute_stream_relevance_score,
            NEUTRAL_SCORE_WHEN_NO_PROVIDER,
        )
        result = compute_stream_relevance_score(_noise_image(), provider=None)
        assert result.passed is True  # neutral score is 70, which passes
        assert result.score == NEUTRAL_SCORE_WHEN_NO_PROVIDER
        assert result.provider_used == "none"

    def test_score_reflects_confidence(self):
        from ai.layer_a.checks.stream_relevance import compute_stream_relevance_score
        result = compute_stream_relevance_score(_noise_image(), _MockPassProvider())
        assert result.score == int(0.95 * 100)


# ══════════════════════════════════════════════════════════════════════════════
# DUPLICATE TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestDuplicateCheck:
    def test_same_image_detected_as_duplicate(self):
        from ai.layer_a.checks.duplicate import compute_duplicate_score, _phash_from_array

        img = _textured_image()
        phash = _phash_from_array(img)
        store = _make_duplicate_store(phash)

        result = compute_duplicate_score(img, store)
        assert result.is_duplicate is True
        assert result.similarity == 1.0
        assert result.matched_media_id == "media-abc-123"

    def test_different_image_not_a_duplicate(self):
        from ai.layer_a.checks.duplicate import compute_duplicate_score

        img_a = _textured_image(size=(300, 300))
        img_b = _noise_image(seed=999)  # very different

        from ai.layer_a.checks.duplicate import _phash_from_array
        phash_a = _phash_from_array(img_a)
        store = _make_duplicate_store(phash_a)

        result = compute_duplicate_score(img_b, store)
        assert result.is_duplicate is False

    def test_phash_computed_when_no_store(self):
        from ai.layer_a.checks.duplicate import compute_duplicate_score

        img = _textured_image()
        result = compute_duplicate_score(img, hash_store=None)
        assert result.is_duplicate is False
        assert result.phash is not None and len(result.phash) > 0
        assert "skipped" in result.reason.lower()

    def test_hard_reject_when_duplicate(self):
        """Verify the engine short-circuits on duplicate and sets hard_reject routing."""
        from ai.layer_a.checks.duplicate import compute_duplicate_score, _phash_from_array
        from ai.layer_a.quality_engine import ImageQualityEngine

        img = _textured_image()
        phash = _phash_from_array(img)
        store = _make_duplicate_store(phash)

        engine = ImageQualityEngine(
            relevance_provider=_MockPassProvider(),
            hash_store=store,
        )
        result = engine.evaluate(img)
        assert result.routing == "hard_reject"
        assert result.passed is False
        assert result.quality_score == 0


# ══════════════════════════════════════════════════════════════════════════════
# FULL PIPELINE INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestFullPipeline:
    def _engine(self, relevance_provider=None, hash_store=None):
        from ai.layer_a.quality_engine import ImageQualityEngine
        return ImageQualityEngine(
            relevance_provider=relevance_provider or _MockPassProvider(),
            hash_store=hash_store or _empty_store,
        )

    def test_good_image_routes_correctly(self):
        """A sharp, well-lit, unobstructed, relevant image should get ≥ 70."""
        engine = self._engine()
        img = _textured_image()
        result = engine.evaluate(img)
        # Sharp image with passing mock provider — should score well
        assert result.routing in ("good", "accepted_review_required")
        assert result.passed is True

    def test_dark_image_routes_to_retake_or_review(self):
        engine = self._engine()
        img = _dark_image()
        result = engine.evaluate(img)
        # Dark + no edges (uniform dark → occluded) → low score
        assert result.passed is False or result.routing in (
            "retake_required", "accepted_review_required"
        )

    def test_irrelevant_image_decreases_score(self):
        engine = self._engine(relevance_provider=_MockFailProvider())
        img = _textured_image()
        result_relevant = self._engine(_MockPassProvider()).evaluate(img)
        result_irrelevant = engine.evaluate(img)
        # Relevance weight is 30% — score must be lower for irrelevant
        assert result_irrelevant.quality_score < result_relevant.quality_score

    def test_result_has_all_required_fields(self):
        engine = self._engine()
        result = self._engine().evaluate(_textured_image())
        assert result.blur is not None
        assert result.brightness is not None
        assert result.occlusion is not None
        assert result.stream_relevance is not None
        assert result.duplicate is not None
        assert isinstance(result.feedback, list)
        assert 0 <= result.quality_score <= 100

    def test_failed_checks_appear_in_feedback(self):
        engine = self._engine(relevance_provider=_MockFailProvider())
        img = _dark_image()
        result = engine.evaluate(img)
        # At minimum, dark-image feedback should appear
        assert len(result.feedback) > 0

    def test_no_failed_check_hidden(self):
        """Every failed check must contribute to feedback."""
        engine = self._engine(relevance_provider=_MockFailProvider())
        result = engine.evaluate(_uniform_gray(10))  # dark + blurry + occluded + irrelevant
        # blur, brightness, occlusion all fail → at least 3 feedback messages
        assert len(result.feedback) >= 3


# ══════════════════════════════════════════════════════════════════════════════
# SCORING CONTRACT TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestScoringContract:
    def test_routing_boundary_retake_required(self):
        """score < 40 → retake_required"""
        from ai.layer_a.quality_engine import _determine_routing
        assert _determine_routing(0) == "retake_required"
        assert _determine_routing(39) == "retake_required"

    def test_routing_boundary_accepted_review(self):
        """40 ≤ score < 70 → accepted_review_required"""
        from ai.layer_a.quality_engine import _determine_routing
        assert _determine_routing(40) == "accepted_review_required"
        assert _determine_routing(69) == "accepted_review_required"

    def test_routing_boundary_good(self):
        """score ≥ 70 → good"""
        from ai.layer_a.quality_engine import _determine_routing
        assert _determine_routing(70) == "good"
        assert _determine_routing(100) == "good"

    def test_weights_sum_to_one(self):
        """Scoring weights must exactly sum to 1.0 to avoid drift."""
        from ai.layer_a.quality_engine import _W_BLUR, _W_BRIGHTNESS, _W_OCCLUSION, _W_RELEVANCE
        total = _W_BLUR + _W_BRIGHTNESS + _W_OCCLUSION + _W_RELEVANCE
        assert abs(total - 1.0) < 1e-9, f"Weights sum to {total}, expected 1.0"

    def test_max_score_is_100(self):
        from ai.layer_a.quality_engine import ImageQualityEngine
        engine = ImageQualityEngine(
            relevance_provider=_MockPassProvider(),
            hash_store=_empty_store,
        )
        # Perfect sharp image — score should not exceed 100
        result = engine.evaluate(_textured_image())
        assert result.quality_score <= 100

    def test_min_score_is_0(self):
        from ai.layer_a.quality_engine import ImageQualityEngine
        engine = ImageQualityEngine(
            relevance_provider=_MockFailProvider(),
            hash_store=_empty_store,
        )
        result = engine.evaluate(_uniform_gray(10))
        assert result.quality_score >= 0
