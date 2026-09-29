"""
COMPREHENSIVE QA SUITE — AquaGuard AI module.

Authored as the module's QA engineer. Every test here maps to an explicit
item in the QA checklist. All external AI providers are MOCKED — there are no
live API calls, no network, and no real image files (synthetic NumPy arrays
only). This suite complements (does not replace) the existing per-layer tests.

Checklist → test-class mapping
──────────────────────────────
LAYER A     : TestLayerA_*         (blur, brightness, occlusion, relevance,
                                    duplicate, quality score, thresholds)
LAYER B     : TestLayerB_*         (every indicator, unknown, low confidence,
                                    malformed output, OpenAI failure, Gemini fallback)
LAYER C     : TestLayerC_*         (3q, 5q, <3, >5, duplicate, irrelevant, invalid options)
LAYER D     : TestLayerD_*         (consistent, minor, major, missing baseline, missing answers)
CONFIDENCE  : TestConfidence_*     (exact formula, boundaries 49/50/74/75, missing data)
PIPELINE    : TestPipeline_*       (success, retake, missing answers, provider failure,
                                    complete AI failure, review routing)
SAFETY      : TestSafety_*         (hallucination, unsupported claims, missing evidence,
                                    contradictory evidence)
"""

from __future__ import annotations

import asyncio
import json

import numpy as np
import pytest

# ── Layer A ──
from ai.layer_a.checks.blur import compute_blur_score, BLUR_FAIL_THRESHOLD
from ai.layer_a.checks.brightness import compute_brightness_score, BRIGHTNESS_LOW, BRIGHTNESS_HIGH
from ai.layer_a.checks.occlusion import compute_occlusion_score, OCCLUSION_FAIL_THRESHOLD
from ai.layer_a.checks.stream_relevance import (
    compute_stream_relevance_score, StreamRelevanceProvider, RELEVANCE_FAIL_THRESHOLD,
)
from ai.layer_a.checks.duplicate import compute_duplicate_score, _phash_from_array
from ai.layer_a.quality_engine import ImageQualityEngine, _determine_routing

# ── Layer B ──
from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.schemas.layer_b import Turbidity, Presence, AlgalSeverity, RiparianVegetation, FlowCondition

# ── Layer C ──
from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.schemas.base import AIEvidence, FollowUpQuestion

# ── Layer D ──
from ai.layer_d.cross_validator import CrossValidator
from ai.schemas.layer_d import ConsistencyStatus

# ── Confidence ──
from ai.confidence.calculator import calculate_confidence
from ai.schemas.layer_d import ConsistencyResult
from ai.schemas.layer_e import ConfidenceRouting, _routing_from_score, CONFIDENCE_WEIGHTS

# ── Pipeline / safety ──
from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.safety.constants import REVIEW_REQUIRED
from ai.utils.exceptions import AIProviderError


# ══════════════════════════════════════════════════════════════════════════════
# Shared synthetic-image + mock-provider helpers
# ══════════════════════════════════════════════════════════════════════════════

def _uniform(value=128, size=(120, 120)):
    return np.ones((*size, 3), np.uint8) * value


def _checkerboard(size=(120, 120), block=8):
    img = np.zeros((*size, 3), np.uint8)
    for r in range(0, size[0], block):
        for c in range(0, size[1], block):
            if (r // block + c // block) % 2 == 0:
                img[r:r + block, c:c + block] = 255
    return img


def _ev(indicator, present=True, confidence=0.9, reasoning="visible"):
    return AIEvidence(indicator=indicator, present=present, confidence=confidence, reasoning=reasoning)


class _RelPass(StreamRelevanceProvider):
    @property
    def provider_name(self): return "mock_pass"
    def classify(self, image_bgr): return 0.95, "stream visible"


class _RelFail(StreamRelevanceProvider):
    @property
    def provider_name(self): return "mock_fail"
    def classify(self, image_bgr): return 0.10, "no water body"


# Layer B mock providers (VisionEvidenceProvider)
def _b_payload(**overrides):
    p = {
        "turbidity": {"value": "clear", "confidence": 0.9, "evidence": "bed visible", "uncertainty": None},
        "debris": {"value": "absent", "confidence": 0.9, "evidence": "no litter", "uncertainty": None, "estimated_coverage_pct": None},
        "algal_bloom": {"value": "absent", "confidence": 0.9, "evidence": "no film", "uncertainty": None, "severity": "unknown"},
        "riparian_vegetation": {"value": "dense", "confidence": 0.9, "evidence": "plants", "uncertainty": None},
        "concrete_channel": {"value": "absent", "confidence": 0.9, "evidence": "natural banks", "uncertainty": None},
        "flow_condition": {"value": "flowing", "confidence": 0.9, "evidence": "ripples", "uncertainty": None},
    }
    p.update(overrides)
    return p


class _BFake(VisionEvidenceProvider):
    def __init__(self, payload, name="openai", model="gpt-4o"):
        self._t = json.dumps(payload); self._n = name; self._m = model; self.calls = 0
    @property
    def provider_name(self): return self._n
    @property
    def model_name(self): return self._m
    def analyze_image(self, image_path, prompt):
        self.calls += 1
        return VisionResponse(self._t, self._n, self._m)


class _BRaw(VisionEvidenceProvider):
    """Returns arbitrary raw text (for malformed-output tests)."""
    def __init__(self, text, name="openai", model="gpt-4o"):
        self._t = text; self._n = name; self._m = model; self.calls = 0
    @property
    def provider_name(self): return self._n
    @property
    def model_name(self): return self._m
    def analyze_image(self, image_path, prompt):
        self.calls += 1
        return VisionResponse(self._t, self._n, self._m)


class _BFail(VisionEvidenceProvider):
    def __init__(self, name="openai", model="gpt-4o"):
        self._n = name; self._m = model; self.calls = 0
    @property
    def provider_name(self): return self._n
    @property
    def model_name(self): return self._m
    def analyze_image(self, image_path, prompt):
        self.calls += 1
        raise AIProviderError(f"{self._n} failure")


def _detector(primary, fallbacks=None):
    return EcologicalEvidenceDetector(primary, fallbacks=fallbacks, max_retries=1)


def _consistency(score, status):
    return ConsistencyResult(
        status=status, score=score, conflicts=[], supporting_evidence=[],
        historical_comparison="unavailable", explanation="t", requires_review=score < 50,
    )


# ══════════════════════════════════════════════════════════════════════════════
# LAYER A
# ══════════════════════════════════════════════════════════════════════════════

class TestLayerA_Blur:
    def test_sharp_passes(self):
        assert compute_blur_score(_checkerboard()).passed is True

    def test_blurry_fails(self):
        r = compute_blur_score(_uniform(128))
        assert r.passed is False
        assert r.laplacian_variance < BLUR_FAIL_THRESHOLD


class TestLayerA_Brightness:
    def test_normal_passes(self):
        assert compute_brightness_score(_uniform(128)).passed is True

    def test_dark_fails(self):
        r = compute_brightness_score(_uniform(5))
        assert r.passed is False and r.hsv_value_mean < BRIGHTNESS_LOW

    def test_overexposed_fails(self):
        r = compute_brightness_score(_uniform(245))
        assert r.passed is False and r.hsv_value_mean > BRIGHTNESS_HIGH


class TestLayerA_Occlusion:
    def test_clear_passes(self):
        assert compute_occlusion_score(_checkerboard()).passed is True

    def test_uniform_flagged_occluded(self):
        r = compute_occlusion_score(_uniform(128))
        assert r.passed is False and r.blocked_fraction >= OCCLUSION_FAIL_THRESHOLD


class TestLayerA_Relevance:
    def test_pass_provider(self):
        r = compute_stream_relevance_score(_checkerboard(), _RelPass())
        assert r.passed is True and r.confidence >= RELEVANCE_FAIL_THRESHOLD

    def test_fail_provider(self):
        r = compute_stream_relevance_score(_checkerboard(), _RelFail())
        assert r.passed is False

    def test_no_provider_neutral(self):
        r = compute_stream_relevance_score(_checkerboard(), None)
        assert r.provider_used == "none"


class TestLayerA_Duplicate:
    def test_detected_duplicate(self):
        img = _checkerboard()
        ph = _phash_from_array(img)
        store = lambda p: (p == ph, 1.0 if p == ph else 0.0, "media-1" if p == ph else None)
        r = compute_duplicate_score(img, store)
        assert r.is_duplicate is True and r.matched_media_id == "media-1"

    def test_not_duplicate(self):
        store = lambda p: (False, 0.0, None)
        assert compute_duplicate_score(_checkerboard(), store).is_duplicate is False

    def test_no_store_skips(self):
        r = compute_duplicate_score(_checkerboard(), None)
        assert r.is_duplicate is False and r.phash


class TestLayerA_QualityScore:
    def test_good_image_scores_and_routes(self):
        engine = ImageQualityEngine(relevance_provider=_RelPass(), hash_store=lambda p: (False, 0.0, None))
        r = engine.evaluate(_checkerboard())
        assert 0 <= r.quality_score <= 100
        assert r.routing in ("good", "accepted_review_required")

    def test_duplicate_hard_rejects(self):
        img = _checkerboard()
        ph = _phash_from_array(img)
        engine = ImageQualityEngine(relevance_provider=_RelPass(),
                                    hash_store=lambda p: (p == ph, 1.0, "m1"))
        r = engine.evaluate(img)
        assert r.routing == "hard_reject" and r.quality_score == 0


class TestLayerA_Thresholds:
    def test_retake_below_40(self):
        assert _determine_routing(0) == "retake_required"
        assert _determine_routing(39) == "retake_required"

    def test_review_40_to_69(self):
        assert _determine_routing(40) == "accepted_review_required"
        assert _determine_routing(69) == "accepted_review_required"

    def test_good_at_70_plus(self):
        assert _determine_routing(70) == "good"
        assert _determine_routing(100) == "good"


# ══════════════════════════════════════════════════════════════════════════════
# LAYER B
# ══════════════════════════════════════════════════════════════════════════════

class TestLayerB_Indicators:
    def test_every_indicator_parsed(self):
        payload = _b_payload(
            turbidity={"value": "murky", "confidence": 0.8, "evidence": "murky", "uncertainty": None},
            debris={"value": "present", "confidence": 0.8, "evidence": "litter", "uncertainty": None, "estimated_coverage_pct": 30.0},
            algal_bloom={"value": "present", "confidence": 0.8, "evidence": "green", "uncertainty": None, "severity": "high"},
            riparian_vegetation={"value": "sparse", "confidence": 0.8, "evidence": "few plants", "uncertainty": None},
            concrete_channel={"value": "present", "confidence": 0.8, "evidence": "concrete", "uncertainty": None},
            flow_condition={"value": "stagnant", "confidence": 0.8, "evidence": "still", "uncertainty": None},
        )
        r = _detector(_BFake(payload)).detect("img.jpg")
        assert r.turbidity.value == Turbidity.MURKY
        assert r.debris.value == Presence.PRESENT and r.debris.estimated_coverage_pct == 30.0
        assert r.algal_bloom.severity == AlgalSeverity.HIGH
        assert r.riparian_vegetation.value == RiparianVegetation.SPARSE
        assert r.concrete_channel.value.value == "present"
        assert r.flow_condition.value == FlowCondition.STAGNANT

    def test_unknown_evidence(self):
        payload = _b_payload(turbidity={"value": "unknown", "confidence": 0.2, "evidence": "glare", "uncertainty": "surface glare"})
        r = _detector(_BFake(payload)).detect("img.jpg")
        assert r.turbidity.value == Turbidity.UNKNOWN
        assert r.turbidity.uncertainty == "surface glare"

    def test_low_confidence_preserved(self):
        payload = _b_payload(debris={"value": "present", "confidence": 0.15, "evidence": "maybe litter", "uncertainty": None, "estimated_coverage_pct": None})
        r = _detector(_BFake(payload)).detect("img.jpg")
        assert r.debris.confidence == 0.15

    def test_malformed_output_falls_back(self):
        primary = _BRaw("not valid json at all {{{", name="openai")
        fallback = _BFake(_b_payload(), name="gemini", model="gemini-1.5-pro")
        r = _detector(primary, fallbacks=[fallback]).detect("img.jpg")
        assert r.provider_used == "gemini" and r.fallback_used is True

    def test_openai_failure_triggers_gemini_fallback(self):
        primary = _BFail(name="openai")
        fallback = _BFake(_b_payload(), name="gemini", model="gemini-1.5-pro")
        r = _detector(primary, fallbacks=[fallback]).detect("img.jpg")
        assert r.provider_used == "gemini"
        assert r.model_used == "gemini-1.5-pro"
        assert r.fallback_used is True
        assert primary.calls >= 1 and fallback.calls == 1

    def test_all_providers_fail_raises(self):
        det = _detector(_BFail("openai"), fallbacks=[_BFail("gemini")])
        with pytest.raises(AIProviderError):
            det.detect("img.jpg")


# ══════════════════════════════════════════════════════════════════════════════
# LAYER C
# ══════════════════════════════════════════════════════════════════════════════

class TestLayerC_QuestionGeneration:
    def test_three_questions_single_indicator(self):
        qs = AdaptiveQuestionGenerator().generate_questions([_ev("debris", confidence=0.9)])
        assert len(qs) == 3
        assert not AdaptiveQuestionGenerator.validate_questions(qs)

    def test_five_questions_capped(self):
        qs = AdaptiveQuestionGenerator().generate_questions([
            _ev("turbidity", confidence=0.95),
            _ev("algal_bloom", confidence=0.85),
            _ev("debris", confidence=0.75),
        ])
        assert len(qs) == 5  # capped, even though 9 rules could trigger
        assert not AdaptiveQuestionGenerator.validate_questions(qs)

    def test_fewer_than_three_flagged_by_validator(self):
        # Manually construct a 2-question list → validator must object.
        qs = [
            FollowUpQuestion(id="a", question="Q a?", options=["x", "y"], evidence_basis=["debris"], priority=1),
            FollowUpQuestion(id="b", question="Q b?", options=["x", "y"], evidence_basis=["debris"], priority=2),
        ]
        failures = AdaptiveQuestionGenerator.validate_questions(qs)
        assert any("between 3 and 5" in f for f in failures)

    def test_more_than_five_flagged_by_validator(self):
        qs = [
            FollowUpQuestion(id=f"q{i}", question=f"Q {i}?", options=["x", "y"],
                             evidence_basis=["debris"], priority=i)
            for i in range(1, 7)  # 6 questions
        ]
        failures = AdaptiveQuestionGenerator.validate_questions(qs)
        assert any("between 3 and 5" in f for f in failures)

    def test_duplicate_questions_flagged(self):
        qs = [
            FollowUpQuestion(id="a", question="Same question?", options=["x", "y"], evidence_basis=["debris"], priority=1),
            FollowUpQuestion(id="b", question="Same question?", options=["x", "y"], evidence_basis=["debris"], priority=2),
            FollowUpQuestion(id="c", question="Different?", options=["x", "y"], evidence_basis=["debris"], priority=3),
        ]
        assert any("duplicate" in f for f in AdaptiveQuestionGenerator.validate_questions(qs))

    def test_irrelevant_questions_flagged_no_evidence_basis(self):
        qs = [
            FollowUpQuestion(id="a", question="Q a?", options=["x", "y"], evidence_basis=[], priority=1),
            FollowUpQuestion(id="b", question="Q b?", options=["x", "y"], evidence_basis=["debris"], priority=2),
            FollowUpQuestion(id="c", question="Q c?", options=["x", "y"], evidence_basis=["debris"], priority=3),
        ]
        assert any("no evidence basis" in f for f in AdaptiveQuestionGenerator.validate_questions(qs))

    def test_invalid_options_flagged(self):
        qs = [
            FollowUpQuestion(id="a", question="Q a?", options=[], evidence_basis=["debris"], priority=1),
            FollowUpQuestion(id="b", question="Q b?", options=["x"], evidence_basis=["debris"], priority=2),
            FollowUpQuestion(id="c", question="Q c?", options=["x"], evidence_basis=["debris"], priority=3),
        ]
        assert any("bounded choices" in f for f in AdaptiveQuestionGenerator.validate_questions(qs))

    def test_medical_language_flagged(self):
        qs = [
            FollowUpQuestion(id="a", question="Can a laboratory diagnose disease?", options=["x", "y"], evidence_basis=["debris"], priority=1),
            FollowUpQuestion(id="b", question="Q b?", options=["x", "y"], evidence_basis=["debris"], priority=2),
            FollowUpQuestion(id="c", question="Q c?", options=["x", "y"], evidence_basis=["debris"], priority=3),
        ]
        assert any("unsupported medical or equipment language" in f
                   for f in AdaptiveQuestionGenerator.validate_questions(qs))

    def test_no_evidence_yields_no_questions(self):
        assert AdaptiveQuestionGenerator().generate_questions([]) == []


# ══════════════════════════════════════════════════════════════════════════════
# LAYER D
# ══════════════════════════════════════════════════════════════════════════════

class TestLayerD_CrossValidation:
    def test_consistent(self):
        r = CrossValidator().validate_consistency(
            [_ev("turbidity", present=False, confidence=0.9, reasoning="clear water")],
            {"water_clarity": "clear"}, {"water_clarity": "clear"},
        )
        assert r.status == ConsistencyStatus.CONSISTENT and r.score == 100

    def test_minor_conflict(self):
        r = CrossValidator().validate_consistency(
            [_ev("debris", present=True, confidence=0.8, reasoning="moderate debris observed")],
            {"debris": "a little"}, {"debris": "none"},
        )
        assert r.status == ConsistencyStatus.MINOR_CONFLICT and r.score == 70

    def test_major_conflict(self):
        r = CrossValidator().validate_consistency(
            [_ev("water_flow", present=True, confidence=0.9, reasoning="flowing water")],
            {"water_flow": "dry"}, None,
        )
        assert r.status == ConsistencyStatus.MAJOR_CONFLICT and r.requires_review is True

    def test_missing_baseline(self):
        r = CrossValidator().validate_consistency(
            [_ev("turbidity", present=False, confidence=0.9, reasoning="clear")],
            {"water_clarity": "clear"}, None,
        )
        assert r.historical_comparison == "unavailable"

    def test_missing_answers(self):
        r = CrossValidator().validate_consistency(
            [_ev("turbidity", present=False, confidence=0.9, reasoning="clear")], {}, {"water_clarity": "clear"},
        )
        assert r.status == ConsistencyStatus.CONSISTENT and r.conflicts == []


# ══════════════════════════════════════════════════════════════════════════════
# CONFIDENCE
# ══════════════════════════════════════════════════════════════════════════════

class TestConfidence_Formula:
    def test_exact_formula(self):
        """iq=95 aea=95 cc=100 gps=100 hist=100 → 97.25 (VALID). Spec Step 34."""
        evidence = [_ev(f"i{i}", present=True, confidence=0.95) for i in range(4)]
        questions = [FollowUpQuestion(id=f"q{i}", question=f"Q{i}?", options=["a", "b"], evidence_basis=["x"], priority=1) for i in range(3)]
        answers = {"q0": "a", "q1": "b", "q2": "a"}
        r = calculate_confidence(95.0, evidence, questions, answers,
                                 _consistency(100, ConsistencyStatus.CONSISTENT), None,
                                 gps_accuracy_m=5.0, historical_z_score=0.5)
        assert r.confidence_score == pytest.approx(97.25, abs=0.01)
        assert r.routing == ConfidenceRouting.VALID

    def test_weights_sum_to_one(self):
        assert sum(CONFIDENCE_WEIGHTS.values()) == pytest.approx(1.0, abs=1e-9)


class TestConfidence_Boundaries:
    """Spec Step 37: <60 HUMAN_REVIEW, 60–79 REVIEW_REQUIRED, >=80 VALID."""
    def test_boundary_59_human_review(self):
        assert _routing_from_score(59.99) == ConfidenceRouting.HUMAN_REVIEW

    def test_boundary_60_review(self):
        assert _routing_from_score(60.0) == ConfidenceRouting.REVIEW_REQUIRED

    def test_boundary_79_review(self):
        assert _routing_from_score(79.99) == ConfidenceRouting.REVIEW_REQUIRED

    def test_boundary_80_valid(self):
        assert _routing_from_score(80.0) == ConfidenceRouting.VALID


class TestConfidence_MissingData:
    def test_missing_baseline_uses_neutral_fallback(self):
        r = calculate_confidence(70.0, [_ev("turbidity", True, 0.85)], [], {},
                                 _consistency(100, ConsistencyStatus.CONSISTENT), None)
        assert r.historical_baseline_used is False
        assert r.components.historicalConsistency == pytest.approx(50.0)
        assert r.missing_data_notes

    def test_empty_evidence_zero_agreement(self):
        r = calculate_confidence(90.0, [], [], {}, _consistency(100, ConsistencyStatus.CONSISTENT), None)
        assert r.components.aiEvidenceAgreement == pytest.approx(0.0)


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE (mocked layers — no live calls)
# ══════════════════════════════════════════════════════════════════════════════

class _FakeQuality:
    def __init__(self, score): self.quality_score = score
    def model_dump(self, mode="json"): return {"quality_score": self.quality_score}


class _FakeLayerA:
    def __init__(self, score): self.score = score
    def evaluate(self, image): return _FakeQuality(self.score)


class _FakeLayerB:
    def __init__(self, evidence, model="gpt-4o", fallback=False, error=None):
        self._e = evidence; self.model_used = model; self.prompt_version = "layer_b_evidence_v1"
        self.fallback_used = fallback; self._err = error; self.calls = 0
    def detect(self, ref, source_media_id=None):
        self.calls += 1
        if self._err: raise self._err
        return self
    def to_ai_evidence(self): return list(self._e)


def _pipeline(layer_a, layer_b):
    return AIPipelineOrchestrator(
        layer_a=layer_a, layer_b=layer_b,
        layer_c=AdaptiveQuestionGenerator(), layer_d=CrossValidator(),
    )


def _obs(**over):
    v = {"observation_id": "obs-1", "image": np.zeros((20, 20, 3), np.uint8)}
    v.update(over)
    return v


class TestPipeline_Flows:
    def test_successful_complete_run(self):
        # Strong evidence + good GPS + in-baseline z-score → should reach VALID.
        lb = _FakeLayerB([_ev(f"i{i}", present=True, confidence=0.95) for i in range(4)])
        out = _pipeline(_FakeLayerA(95), lb).assess_observation(_obs(
            citizen_answers={"water_clarity": "clear"},
            gps_accuracy_m=5.0, historical_z_score=0.5,
        ))
        assert out["status"] == "VALID"
        assert out["ai_audit"]["model_used"] == "gpt-4o"
        assert out["confidence"] is not None

    def test_layer_a_retake(self):
        lb = _FakeLayerB([_ev("turbidity")])
        out = _pipeline(_FakeLayerA(30), lb).assess_observation(_obs())
        assert out["status"] == "RETAKE_REQUIRED"
        assert lb.calls == 0  # Layer B never runs

    def test_missing_answers_waits(self):
        lb = _FakeLayerB([_ev("debris", present=True, confidence=0.9)])
        out = _pipeline(_FakeLayerA(85), lb).assess_observation(_obs())
        assert out["status"] == "WAITING_FOR_ANSWERS"
        assert out["layer_c"]["questions"]

    def test_provider_failure_routes_review(self):
        lb = _FakeLayerB([], error=AIProviderError("provider unavailable"))
        out = _pipeline(_FakeLayerA(85), lb).assess_observation(_obs(citizen_answers={"water_clarity": "clear"}))
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["errors"]

    def test_complete_ai_failure_no_provider(self):
        out = AIPipelineOrchestrator(layer_a=_FakeLayerA(85), layer_b=None).assess_observation(_obs())
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["degraded_mode"] is True

    def test_review_routing_on_major_conflict(self):
        lb = _FakeLayerB([_ev("water_flow", present=True, confidence=0.9, reasoning="flowing water")])
        out = _pipeline(_FakeLayerA(85), lb).assess_observation(_obs(citizen_answers={"water_flow": "dry"}))
        assert out["status"] == REVIEW_REQUIRED
        assert out["anomaly_detected"] is True


# ══════════════════════════════════════════════════════════════════════════════
# SAFETY
# ══════════════════════════════════════════════════════════════════════════════

class TestSafety_Guard:
    def test_hallucination_attempt_pollution_diagnosis(self):
        from ai.safety.guard import scan_text
        assert "pollution_diagnosis" in scan_text("The water is polluted.").categories

    def test_unsupported_claim_source_attribution(self):
        from ai.safety.guard import scan_text
        assert "pollution_source" in scan_text("Caused by discharge from the factory.").categories

    def test_missing_evidence_downgrades_unsafe_row(self):
        from ai.safety.guard import sanitize_evidence
        cleaned, agg = sanitize_evidence([_ev("turbidity", present=True, reasoning="the stream is contaminated")])
        assert agg.violated and cleaned[0].present is False

    def test_contradictory_evidence_forces_review_via_pipeline(self):
        lb = _FakeLayerB([_ev("water_flow", present=True, confidence=0.9, reasoning="flowing water")])
        out = _pipeline(_FakeLayerA(85), lb).assess_observation(_obs(citizen_answers={"water_flow": "dry"}))
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["conflicts"]

    def test_unsafe_ai_output_sanitised_in_pipeline(self):
        lb = _FakeLayerB([_ev("turbidity", present=True, confidence=0.9,
                              reasoning="The water is polluted by the factory upstream.")])
        out = _pipeline(_FakeLayerA(85), lb).assess_observation(_obs(citizen_answers={"water_clarity": "cloudy"}))
        # Never auto-VALID after sanitisation; must require a human.
        assert out["status"] != "VALID"
        assert out["ai_audit"]["degraded_mode"] is True
        assert out["ai_audit"]["human_review_required"] is True
        assert out["ai_audit"]["warnings"]


class TestSafety_PIINeverReachesProvider:
    def test_layer_c_async_scrubs_pii(self):
        captured = {}

        class Spy:
            async def generate_text(self, prompt):
                captured["p"] = prompt
                return "not-json"

        AdaptiveQuestionGenerator(Spy())  # ensure constructable
        asyncio.run(AdaptiveQuestionGenerator(Spy()).generate_questions_async(
            [_ev("turbidity", present=True, confidence=0.9)],
            citizen_notes="Contact jane@example.com or call 555-123-4567",
        ))
        assert "jane@example.com" not in captured["p"]
        assert "555-123-4567" not in captured["p"]


if __name__ == "__main__":
    pytest.main(["-v", __file__])
