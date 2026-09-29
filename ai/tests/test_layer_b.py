"""
Unit tests for Layer B — Ecological Evidence Detection.

All tests run fully offline: no real OpenAI/Gemini calls, no network, no image
decoding. Fake providers implement the VisionEvidenceProvider interface and
return canned model text, so every code path is deterministic.

Test inventory (maps to the task's required scenarios):
  clear water            → TestScenarios.test_clear_water
  murky water            → TestScenarios.test_murky_water
  algal bloom            → TestScenarios.test_algal_bloom
  debris                 → TestScenarios.test_debris
  multiple indicators    → TestScenarios.test_multiple_indicators
  ambiguous image        → TestScenarios.test_ambiguous_image_all_unknown
  provider failure       → TestFallback.* (OpenAI fails → Gemini answers)
  malformed model output → TestMalformed.*
"""

from __future__ import annotations

import json

import pytest

from ai.layer_b.evidence_detector import EcologicalEvidenceDetector, _extract_json
from ai.prompts.versions import LAYER_B_PROMPT_VERSION
from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.schemas.base import AIEvidence
from ai.schemas.layer_b import (
    AlgalSeverity,
    FlowCondition,
    LayerBResult,
    Presence,
    RiparianVegetation,
    Turbidity,
)
from ai.utils.exceptions import AIProviderError


# ── Canned payload helpers ──────────────────────────────────────────────────────

def _indicator(value, confidence=0.9, evidence="visible.", **extra):
    d = {"value": value, "confidence": confidence, "evidence": evidence, "uncertainty": None}
    d.update(extra)
    return d


def _full_payload(**overrides) -> dict:
    """A complete, valid Layer B payload; override individual indicators."""
    payload = {
        "turbidity": _indicator("clear", evidence="Streambed visible through water."),
        "debris": _indicator("absent", evidence="No litter seen.", estimated_coverage_pct=None),
        "algal_bloom": _indicator("absent", evidence="No green surface film.", severity="unknown"),
        "riparian_vegetation": _indicator("dense", evidence="Thick bankside plants."),
        "concrete_channel": _indicator("absent", evidence="Natural rock banks."),
        "flow_condition": _indicator("flowing", evidence="Ripples indicate movement."),
    }
    payload.update(overrides)
    return payload


def _all_unknown_payload() -> dict:
    return {
        "turbidity": _indicator("unknown", 0.2, "Water surface not clearly visible.", uncertainty="Glare on surface."),
        "debris": _indicator("unknown", 0.2, "Cannot tell if litter present.", estimated_coverage_pct=None),
        "algal_bloom": _indicator("unknown", 0.2, "Colour indeterminate.", severity="unknown"),
        "riparian_vegetation": _indicator("unknown", 0.2, "Banks out of frame."),
        "concrete_channel": _indicator("unknown", 0.2, "Channel edges not visible."),
        "flow_condition": _indicator("unknown", 0.2, "Motion not discernible."),
    }


# ── Fake providers ────────────────────────────────────────────────────────────

class FakeProvider(VisionEvidenceProvider):
    """Returns a fixed text payload. Optionally counts calls."""

    def __init__(self, text: str, name: str = "openai", model: str = "fake-model"):
        self._text = text
        self._name = name
        self._model = model
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return self._name

    @property
    def model_name(self) -> str:
        return self._model

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        self.calls += 1
        return VisionResponse(text=self._text, provider_name=self._name, model_used=self._model)


class FailingProvider(VisionEvidenceProvider):
    """Always raises AIProviderError (simulates outage/timeout)."""

    def __init__(self, name: str = "openai", model: str = "fake-model"):
        self._name = name
        self._model = model
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return self._name

    @property
    def model_name(self) -> str:
        return self._model

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        self.calls += 1
        raise AIProviderError(f"{self._name} simulated failure")


def _json_provider(payload: dict, name="openai", model="fake-model") -> FakeProvider:
    return FakeProvider(json.dumps(payload), name=name, model=model)


def _detector(provider, fallbacks=None):
    # max_retries=1 keeps failing-provider tests fast (no backoff sleeps stacked).
    return EcologicalEvidenceDetector(provider, fallbacks=fallbacks, max_retries=1)


# ══════════════════════════════════════════════════════════════════════════════
# SCENARIO TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestScenarios:
    def test_clear_water(self):
        det = _detector(_json_provider(_full_payload()))
        result = det.detect("img.jpg")
        assert result.turbidity.value == Turbidity.CLEAR
        assert result.turbidity.confidence == 0.9
        assert result.debris.value == Presence.ABSENT

    def test_murky_water(self):
        payload = _full_payload(
            turbidity=_indicator("murky", 0.87, "Water appears murky; bed not visible.")
        )
        det = _detector(_json_provider(payload))
        result = det.detect("img.jpg")
        assert result.turbidity.value == Turbidity.MURKY
        assert result.turbidity.confidence == 0.87

    def test_algal_bloom(self):
        payload = _full_payload(
            algal_bloom=_indicator(
                "present", 0.81, "Green surface film across much of the water.",
                severity="high",
            )
        )
        det = _detector(_json_provider(payload))
        result = det.detect("img.jpg")
        assert result.algal_bloom.value == Presence.PRESENT
        assert result.algal_bloom.severity == AlgalSeverity.HIGH

    def test_debris(self):
        payload = _full_payload(
            debris=_indicator(
                "present", 0.72, "Scattered litter on the surface.",
                estimated_coverage_pct=25.0,
            )
        )
        det = _detector(_json_provider(payload))
        result = det.detect("img.jpg")
        assert result.debris.value == Presence.PRESENT
        assert result.debris.estimated_coverage_pct == 25.0

    def test_multiple_indicators(self):
        payload = _full_payload(
            turbidity=_indicator("murky", 0.8, "Cloudy water."),
            debris=_indicator("present", 0.7, "Floating litter.", estimated_coverage_pct=15.0),
            algal_bloom=_indicator("present", 0.65, "Green patches.", severity="medium"),
            concrete_channel=_indicator("present", 0.9, "Straight concrete banks."),
            flow_condition=_indicator("stagnant", 0.6, "No visible movement."),
        )
        det = _detector(_json_provider(payload))
        result = det.detect("img.jpg")
        assert result.turbidity.value == Turbidity.MURKY
        assert result.debris.value == Presence.PRESENT
        assert result.algal_bloom.severity == AlgalSeverity.MEDIUM
        assert result.concrete_channel.value.value == "present"
        assert result.flow_condition.value == FlowCondition.STAGNANT

        # AIEvidence compatibility: 11 rows (10 spec indicators; flow split into
        # low/high), present flags computed correctly.
        rows = result.to_ai_evidence()
        assert len(rows) == 11
        assert all(isinstance(r, AIEvidence) for r in rows)
        by_ind = {r.indicator: r for r in rows}
        assert by_ind["turbidity"].present is True
        assert by_ind["debris"].present is True
        assert by_ind["concrete_channel"].present is True

    def test_ambiguous_image_all_unknown(self):
        det = _detector(_json_provider(_all_unknown_payload()))
        result = det.detect("img.jpg")
        assert result.turbidity.value == Turbidity.UNKNOWN
        assert result.riparian_vegetation.value == RiparianVegetation.UNKNOWN
        assert result.flow_condition.value == FlowCondition.UNKNOWN
        # Unknown → present is False in AIEvidence, uncertainty preserved.
        rows = {r.indicator: r for r in result.to_ai_evidence()}
        assert rows["turbidity"].present is False
        assert "uncertainty" in rows["turbidity"].reasoning


# ══════════════════════════════════════════════════════════════════════════════
# PROVENANCE TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestProvenance:
    def test_prompt_version_recorded(self):
        det = _detector(_json_provider(_full_payload()))
        result = det.detect("img.jpg")
        assert result.prompt_version == LAYER_B_PROMPT_VERSION

    def test_model_and_provider_recorded(self):
        det = _detector(_json_provider(_full_payload(), name="openai", model="gpt-4o"))
        result = det.detect("img.jpg")
        assert result.provider_used == "openai"
        assert result.model_used == "gpt-4o"
        assert result.fallback_used is False

    def test_source_media_id_passthrough(self):
        det = _detector(_json_provider(_full_payload()))
        result = det.detect("img.jpg", source_media_id="media-xyz")
        assert result.source_media_id == "media-xyz"


# ══════════════════════════════════════════════════════════════════════════════
# FALLBACK TESTS (provider failure)
# ══════════════════════════════════════════════════════════════════════════════

class TestFallback:
    def test_openai_failure_triggers_gemini(self):
        primary = FailingProvider(name="openai", model="gpt-4o")
        fallback = _json_provider(_full_payload(), name="gemini", model="gemini-1.5-pro")
        det = _detector(primary, fallbacks=[fallback])

        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"
        assert result.model_used == "gemini-1.5-pro"
        assert result.fallback_used is True
        assert primary.calls >= 1  # primary was actually attempted
        assert fallback.calls == 1

    def test_all_providers_fail_raises(self):
        primary = FailingProvider(name="openai")
        fallback = FailingProvider(name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        with pytest.raises(AIProviderError) as exc:
            det.detect("img.jpg")
        assert "openai" in str(exc.value) and "gemini" in str(exc.value)

    def test_no_fallback_when_primary_succeeds(self):
        primary = _json_provider(_full_payload(), name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "openai"
        assert fallback.calls == 0


# ══════════════════════════════════════════════════════════════════════════════
# MALFORMED OUTPUT TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestMalformed:
    def test_json_wrapped_in_markdown_fences_is_recovered(self):
        fenced = "```json\n" + json.dumps(_full_payload()) + "\n```"
        det = _detector(FakeProvider(fenced, name="openai"))
        result = det.detect("img.jpg")
        assert result.turbidity.value == Turbidity.CLEAR

    def test_json_with_surrounding_prose_is_recovered(self):
        noisy = "Here is the analysis you asked for:\n" + json.dumps(_full_payload()) + "\nHope that helps!"
        det = _detector(FakeProvider(noisy, name="openai"))
        result = det.detect("img.jpg")
        assert result.flow_condition.value == FlowCondition.FLOWING

    def test_totally_malformed_json_falls_back(self):
        primary = FakeProvider("not json at all { broken", name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"
        assert result.fallback_used is True

    def test_missing_indicator_falls_back(self):
        incomplete = _full_payload()
        del incomplete["algal_bloom"]  # required field missing
        primary = _json_provider(incomplete, name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"

    def test_invalid_enum_value_falls_back(self):
        bad = _full_payload(turbidity=_indicator("sludgy", 0.9, "made-up value"))
        primary = _json_provider(bad, name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"

    def test_confidence_out_of_range_falls_back(self):
        bad = _full_payload(debris=_indicator("present", 1.5, "conf too high", estimated_coverage_pct=10.0))
        primary = _json_provider(bad, name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"

    def test_extra_hallucinated_field_falls_back(self):
        """Anti-hallucination: model smuggling in an extra field is rejected."""
        bad = _full_payload()
        bad["turbidity"]["lab_ph"] = 6.2  # invented measurement → extra=forbid
        primary = _json_provider(bad, name="openai")
        fallback = _json_provider(_full_payload(), name="gemini")
        det = _detector(primary, fallbacks=[fallback])
        result = det.detect("img.jpg")
        assert result.provider_used == "gemini"


# ══════════════════════════════════════════════════════════════════════════════
# JSON EXTRACTION UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestExtractJson:
    def test_clean_json(self):
        assert _extract_json('{"a": 1}') == {"a": 1}

    def test_fenced_json(self):
        assert _extract_json('```json\n{"a": 1}\n```') == {"a": 1}

    def test_prose_wrapped_json(self):
        assert _extract_json('blah {"a": 1} blah') == {"a": 1}

    def test_no_json_raises(self):
        with pytest.raises(AIProviderError):
            _extract_json("there is no json here")

    def test_none_raises(self):
        with pytest.raises(AIProviderError):
            _extract_json(None)  # type: ignore[arg-type]


# ══════════════════════════════════════════════════════════════════════════════
# detect_evidence (AIEvidence-compatible) TESTS
# ══════════════════════════════════════════════════════════════════════════════

class TestDetectEvidence:
    def test_returns_ai_evidence_rows(self):
        det = _detector(_json_provider(_full_payload()))
        rows = det.detect_evidence("img.jpg", source_media_id="m1")
        # 10 spec indicators; flow_condition + low/high water flow → 11 rows.
        assert len(rows) == 11
        assert all(isinstance(r, AIEvidence) for r in rows)
        indicators = {r.indicator for r in rows}
        # The six core indicators must always be present.
        assert {
            "turbidity", "debris", "algal_bloom",
            "riparian_vegetation", "concrete_channel", "flow_condition",
        }.issubset(indicators)
        # Plus the additional spec indicators.
        assert {
            "natural_channel", "foam_presence", "water_color_anomaly",
            "low_water_flow", "high_water_flow",
        }.issubset(indicators)
