"""
Adversarial + safety-hardening tests for the AquaGuard AI pipeline.

Covers the required adversarial scenarios and the 15 mandatory safety rules.
All tests run offline: fake layers are injected into the orchestrator, so no
image decoding, no network, no real provider calls.

Adversarial scenarios required by the spec:
  - irrelevant image
  - ambiguous image
  - contradictory citizen answers
  - missing baseline
  - malformed model response
  - provider timeout
  - provider outage
  - unsupported question request
  - image with insufficient evidence

Plus focused unit tests for the PII redactor, the output guard, and the
AIAudit invariants.
"""

from __future__ import annotations

import numpy as np
import pytest

from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.safety import guard, pii
from ai.safety.constants import REVIEW_REQUIRED
from ai.schemas.audit import AIAudit
from ai.schemas.base import AIEvidence
from ai.schemas.layer_a import (
    BlurResult, BrightnessResult, DuplicateResult, LayerAResult,
    OcclusionResult, StreamRelevanceResult,
)
from ai.utils.exceptions import AIProviderError


# ── Fake Layer A ────────────────────────────────────────────────────────────

def _layer_a_result(quality_score: int) -> LayerAResult:
    return LayerAResult(
        quality_score=quality_score,
        passed=quality_score >= 40,
        routing="good" if quality_score >= 70 else ("accepted_review_required" if quality_score >= 40 else "retake_required"),
        feedback=[],
        blur=BlurResult(score=90, passed=True, laplacian_variance=200.0, reason="sharp"),
        brightness=BrightnessResult(score=90, passed=True, hsv_value_mean=120.0, reason="ok"),
        occlusion=OcclusionResult(score=90, passed=True, blocked_fraction=0.1, reason="clear"),
        stream_relevance=StreamRelevanceResult(score=90, passed=True, confidence=0.9, reason="stream", provider_used="mock"),
        duplicate=DuplicateResult(is_duplicate=False, reason="unique"),
    )


class FakeLayerA:
    def __init__(self, quality_score: int = 85):
        self._score = quality_score

    def evaluate(self, image):
        return _layer_a_result(self._score)


# ── Fake Layer B (returns a LayerBResult-like object) ───────────────────────

class FakeLayerB:
    """
    Mimics EcologicalEvidenceDetector: has .detect() returning an object with
    .to_ai_evidence(), .model_used, .prompt_version, .fallback_used.
    """
    def __init__(self, evidence, model_used="gpt-4o", prompt_version="layer_b_evidence_v1",
                 fallback_used=False, raise_exc=None):
        self._evidence = evidence
        self.model_used = model_used
        self.prompt_version = prompt_version
        self.fallback_used = fallback_used
        self._raise = raise_exc

    def detect(self, image_ref, source_media_id=None):
        if self._raise is not None:
            raise self._raise
        return self  # acts as the result object too

    def to_ai_evidence(self):
        return list(self._evidence)


def _ev(indicator, present=True, confidence=0.9, reasoning="visible"):
    return AIEvidence(indicator=indicator, present=present, confidence=confidence, reasoning=reasoning)


def _orch(layer_a=None, layer_b=None):
    return AIPipelineOrchestrator(
        layer_a=layer_a or FakeLayerA(85),
        layer_b=layer_b or FakeLayerB([_ev("turbidity", present=False, reasoning="clear water")]),
        layer_c=AdaptiveQuestionGenerator(),
        layer_d=None,  # falls back to real CrossValidator via default? No — pass real one
    )


def _orch_full(layer_a=None, layer_b=None):
    from ai.layer_d.cross_validator import CrossValidator
    return AIPipelineOrchestrator(
        layer_a=layer_a or FakeLayerA(85),
        layer_b=layer_b or FakeLayerB([_ev("turbidity", present=False, reasoning="clear water")]),
        layer_c=AdaptiveQuestionGenerator(),
        layer_d=CrossValidator(),
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADVERSARIAL SCENARIO TESTS (via orchestrator)
# ══════════════════════════════════════════════════════════════════════════════

class TestAdversarialPipeline:
    def test_insufficient_evidence_image_low_quality_retake(self):
        """Image quality too low → RETAKE_REQUIRED, no AI run, human review flagged."""
        orch = _orch_full(layer_a=FakeLayerA(20))
        out = orch.assess_observation({"observation_id": "o1", "image": np.zeros((10, 10, 3), np.uint8)})
        assert out["status"] == "RETAKE_REQUIRED"
        assert out["ai_audit"]["model_used"] == "not_run"
        assert out["ai_audit"]["human_review_required"] is True

    def test_irrelevant_image_still_routes_safely(self):
        """
        Irrelevant image: Layer B returns all-unknown/absent evidence. Pipeline
        must not fabricate a positive and must not auto-VALID without answers.
        """
        lb = FakeLayerB([_ev("turbidity", present=False, confidence=0.2, reasoning="not a stream")])
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({"observation_id": "o2", "image": np.zeros((10, 10, 3), np.uint8)})
        # No citizen answers yet → waiting, never VALID.
        assert out["status"] in ("WAITING_FOR_ANSWERS", REVIEW_REQUIRED)
        assert out["status"] != "VALID"

    def test_ambiguous_image_all_unknown_no_false_positive(self):
        lb = FakeLayerB([
            _ev("turbidity", present=False, confidence=0.2, reasoning="uncertain"),
            _ev("debris", present=False, confidence=0.2, reasoning="uncertain"),
        ])
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({
            "observation_id": "o3", "image": np.zeros((10, 10, 3), np.uint8),
            "citizen_answers": {"water_clarity": "not sure"},
        })
        assert out["status"] in ("VALID", "REVIEW_REQUIRED", "HUMAN_REVIEW")
        # low evidence agreement → confidence low → not auto-VALID
        assert out["status"] != "VALID"
        assert out["ai_audit"]["confidence_score"] is not None

    def test_contradictory_citizen_answers_force_review(self):
        """Citizen says dry, AI evidence says flowing → MAJOR conflict → REVIEW_REQUIRED."""
        lb = FakeLayerB([_ev("water_flow", present=True, confidence=0.9, reasoning="flowing water visible")])
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({
            "observation_id": "o4", "image": np.zeros((10, 10, 3), np.uint8),
            "citizen_answers": {"water_flow": "dry"},
        })
        assert out["status"] == REVIEW_REQUIRED
        assert out["anomaly_detected"] is True
        assert out["ai_audit"]["conflicts"]

    def test_missing_baseline_does_not_crash_or_inflate(self):
        lb = FakeLayerB([_ev("turbidity", present=False, confidence=0.9, reasoning="clear water")])
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({
            "observation_id": "o5", "image": np.zeros((10, 10, 3), np.uint8),
            "citizen_answers": {"water_clarity": "clear"},
            # no site_baseline
        })
        assert out["status"] in ("VALID", "REVIEW_REQUIRED", "HUMAN_REVIEW")
        assert out["confidence"] is not None

    def test_malformed_model_response_via_detector_triggers_review(self):
        """Layer B raises (all providers produced unusable output) → REVIEW_REQUIRED + error recorded."""
        lb = FakeLayerB([], raise_exc=AIProviderError("all providers returned malformed JSON"))
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({"observation_id": "o6", "image": np.zeros((10, 10, 3), np.uint8)})
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["errors"]
        assert out["ai_audit"]["degraded_mode"] is True

    def test_provider_timeout_triggers_review(self):
        lb = FakeLayerB([], raise_exc=AIProviderError("provider timed out after 30s"))
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({"observation_id": "o7", "image": np.zeros((10, 10, 3), np.uint8)})
        assert out["status"] == REVIEW_REQUIRED
        assert any("time" in e.lower() for e in out["ai_audit"]["errors"])

    def test_provider_outage_triggers_review(self):
        lb = FakeLayerB([], raise_exc=AIProviderError("connection refused"))
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({"observation_id": "o8", "image": np.zeros((10, 10, 3), np.uint8)})
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["human_review_required"] is True

    def test_no_layer_b_provider_configured_triggers_review(self):
        orch = AIPipelineOrchestrator(layer_a=FakeLayerA(85), layer_b=None)
        out = orch.assess_observation({"observation_id": "o9", "image": np.zeros((10, 10, 3), np.uint8)})
        assert out["status"] == REVIEW_REQUIRED
        assert out["ai_audit"]["errors"]

    def test_fallback_used_is_recorded(self):
        lb = FakeLayerB([_ev("turbidity", present=False, reasoning="clear")], fallback_used=True,
                        model_used="gemini-1.5-pro", prompt_version="layer_b_evidence_v1")
        orch = _orch_full(layer_b=lb)
        out = orch.assess_observation({"observation_id": "o10", "image": np.zeros((10, 10, 3), np.uint8),
                                       "citizen_answers": {"water_clarity": "clear"}})
        assert out["ai_audit"]["fallback_used"] is True
        assert out["ai_audit"]["model_used"] == "gemini-1.5-pro"


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT GUARD — forbidden-claim sanitisation (rules 1–9)
# ══════════════════════════════════════════════════════════════════════════════

class TestOutputGuard:
    def test_pollution_diagnosis_blocked(self):
        r = guard.scan_text("The water is polluted and contaminated.")
        assert "pollution_diagnosis" in r.categories

    def test_pollution_source_blocked(self):
        r = guard.scan_text("This was caused by industrial discharge from the factory upstream.")
        assert "pollution_source" in r.categories

    def test_invented_measurement_blocked(self):
        r = guard.scan_text("Measured turbidity of 45 NTU and pH of 6.2.")
        assert "invented_measurement" in r.categories

    def test_enforcement_recommendation_blocked(self):
        r = guard.scan_text("Authorities should prosecute and fine the responsible company.")
        assert "enforcement_recommendation" in r.categories

    def test_citizen_identification_blocked(self):
        r = guard.scan_text("The citizen identified as John Smith who lives nearby.")
        assert "citizen_identification" in r.categories

    def test_unhedged_certainty_blocked(self):
        r = guard.scan_text("This proves the stream is beyond recovery. It is a fact that pollution occurred.")
        assert "unhedged_certainty" in r.categories

    def test_safe_text_passes(self):
        r = guard.scan_text("The water appears murky with confidence 0.87.")
        assert not r.violated

    def test_sanitize_evidence_downgrades_unsafe_rows(self):
        ev = [
            _ev("turbidity", present=True, reasoning="The water is polluted by the nearby factory."),
            _ev("debris", present=True, reasoning="Scattered litter visible on the surface."),
        ]
        cleaned, agg = guard.sanitize_evidence(ev)
        assert agg.violated
        # unsafe row downgraded to not-present + hedged reasoning
        turb = next(e for e in cleaned if e.indicator == "turbidity")
        assert turb.present is False
        assert "human review" in turb.reasoning.lower()
        # safe row untouched
        deb = next(e for e in cleaned if e.indicator == "debris")
        assert deb.present is True


# ══════════════════════════════════════════════════════════════════════════════
# PII REDACTION (rules 6, 7)
# ══════════════════════════════════════════════════════════════════════════════

class TestPIIRedaction:
    def test_email_redacted(self):
        r = pii.redact("Contact me at jane.doe@example.com about this.")
        assert "jane.doe@example.com" not in r.text
        assert "email" in r.categories

    def test_phone_redacted(self):
        r = pii.redact("Call +1 (555) 123-4567 for details.")
        assert "555" not in r.text
        assert "phone" in r.categories

    def test_coordinates_redacted(self):
        r = pii.redact("Spotted at 51.507400, -0.127800 by the bridge.")
        assert "51.5074" not in r.text
        assert "coordinates" in r.categories

    def test_name_redacted_but_phrase_kept(self):
        r = pii.redact("My name is John Smith and I saw foam.")
        assert "John Smith" not in r.text
        assert "[REDACTED_NAME]" in r.text
        assert "name" in r.categories

    def test_url_redacted(self):
        r = pii.redact("See https://facebook.com/janedoe for photos.")
        assert "facebook.com/janedoe" not in r.text
        assert "url" in r.categories

    def test_clean_text_unchanged(self):
        r = pii.redact("The stream looked murky today.")
        assert not r.redacted
        assert r.text == "The stream looked murky today."


# ══════════════════════════════════════════════════════════════════════════════
# AIAudit INVARIANTS (rules 11, 13, 14, 15)
# ══════════════════════════════════════════════════════════════════════════════

class TestAIAudit:
    def test_error_forces_degraded_and_review(self):
        a = AIAudit()
        a.add_error("provider outage")
        assert a.degraded_mode is True
        assert a.human_review_required is True

    def test_degraded_forces_review(self):
        a = AIAudit()
        a.mark_degraded("something reduced")
        assert a.human_review_required is True

    def test_human_override_takes_precedence(self):
        a = AIAudit()
        a.add_error("provider outage")  # sets review required
        a.apply_human_override("Reviewer accepted after manual check", routing="VALID")
        assert a.human_override.startswith("Reviewer accepted")
        assert a.routing_decision == "VALID"
        assert a.human_review_required is False  # human HAS reviewed

    def test_preserves_required_provenance_fields(self):
        a = AIAudit(model_used="gpt-4o", prompt_version="layer_b_evidence_v1")
        a.confidence_score = 82.0
        a.routing_decision = "VALID"
        a.conflicts = ["citizen says dry but flowing"]
        dumped = a.model_dump()
        for field in ("model_used", "fallback_used", "prompt_version", "warnings",
                      "errors", "degraded_mode", "human_review_required",
                      "processing_timestamp", "confidence_score", "routing_decision", "conflicts"):
            assert field in dumped

    def test_audit_shape_matches_spec(self):
        a = AIAudit()
        dumped = a.model_dump()
        # exact required keys present
        for key in ("model_used", "fallback_used", "prompt_version", "warnings",
                    "errors", "degraded_mode", "human_review_required"):
            assert key in dumped


# ══════════════════════════════════════════════════════════════════════════════
# UNSUPPORTED QUESTION REQUEST (Layer C anti-hallucination)
# ══════════════════════════════════════════════════════════════════════════════

class TestUnsupportedQuestionRequest:
    def test_medical_language_rejected_by_validator(self):
        from ai.schemas.base import FollowUpQuestion
        bad = [
            FollowUpQuestion(id="q1", question="Can a laboratory diagnose the disease here?",
                             options=["Yes", "No"], evidence_basis=["turbidity"], priority=1),
            FollowUpQuestion(id="q2", question="How cloudy is the water?",
                             options=["Clear", "Cloudy"], evidence_basis=["turbidity"], priority=2),
            FollowUpQuestion(id="q3", question="Any smell?",
                             options=["Yes", "No"], evidence_basis=["turbidity"], priority=3),
        ]
        failures = AdaptiveQuestionGenerator.validate_questions(bad)
        assert any("unsupported medical or equipment language" in f for f in failures)

    def test_questions_only_reference_detected_evidence(self):
        gen = AdaptiveQuestionGenerator()
        qs = gen.generate_questions([_ev("debris", present=True, confidence=0.9)])
        assert all(q.evidence_basis for q in qs)
        assert all("debris" in q.evidence_basis for q in qs)


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER PII SCRUB (never expose PII to provider)
# ══════════════════════════════════════════════════════════════════════════════

class TestProviderPIIScrub:
    def test_layer_c_scrubs_citizen_notes_before_provider(self):
        """The async Layer C path must not pass raw PII into the provider prompt."""
        import asyncio

        captured = {}

        class SpyProvider:
            async def generate_text(self, prompt: str) -> str:
                captured["prompt"] = prompt
                return "not-json"  # force fallback

        gen = AdaptiveQuestionGenerator(SpyProvider())
        asyncio.run(gen.generate_questions_async(
            [_ev("turbidity", present=True, confidence=0.9)],
            citizen_notes="My name is Jane Doe, email jane@example.com",
        ))
        assert "prompt" in captured
        assert "jane@example.com" not in captured["prompt"]
        assert "Jane Doe" not in captured["prompt"]


if __name__ == "__main__":
    pytest.main(["-v", __file__])
