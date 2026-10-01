import numpy as np

from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.providers.base import VisionResponse
from ai.schemas.layer_b import LayerBResult
from ai.utils.exceptions import AIProviderError


class FakeQuality:
    def __init__(self, score):
        self.quality_score = score

    def model_dump(self, mode="json"):
        return {"quality_score": self.quality_score, "routing": "good" if self.quality_score >= 40 else "retake_required"}


class FakeLayerA:
    def __init__(self, score):
        self.score = score
        self.calls = 0

    def evaluate(self, image):
        self.calls += 1
        return FakeQuality(self.score)


class FakeLayerB:
    model_used = "mock-vision"
    prompt_version = "mock-prompt-v1"

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = 0

    def detect(self, image_path, source_media_id=None):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def layer_b_result():
    return LayerBResult.model_validate({
        "turbidity": {"value": "murky", "confidence": 0.9, "evidence": "Water appears murky."},
        "debris": {"value": "present", "confidence": 0.8, "evidence": "Some floating material is visible.", "estimated_coverage_pct": 10},
        "algal_bloom": {"value": "absent", "confidence": 0.9, "evidence": "No green surface film is visible.", "severity": "unknown"},
        "riparian_vegetation": {"value": "dense", "confidence": 0.8, "evidence": "Bankside plants are visible."},
        "concrete_channel": {"value": "absent", "confidence": 0.8, "evidence": "No concrete channel is visible."},
        "flow_condition": {"value": "flowing", "confidence": 0.8, "evidence": "Ripples indicate flowing water."},
        "model_used": "mock-vision",
        "provider_used": "mock",
        "prompt_version": "mock-prompt-v1",
    })


def pipeline(layer_a, layer_b):
    return AIPipelineOrchestrator(
        layer_a=layer_a,
        layer_b=layer_b,
        layer_c=AdaptiveQuestionGenerator(),
    )


def observation(**overrides):
    value = {
        "observation_id": "obs-123",
        "image": np.zeros((20, 20, 3), dtype=np.uint8),
        "citizen_notes": "The water looks different today.",
        "site_baseline": {"water_clarity": "clear"},
    }
    value.update(overrides)
    return value


def test_quality_below_40_returns_retake_without_running_layer_b():
    layer_a = FakeLayerA(39)
    layer_b = FakeLayerB(layer_b_result())

    result = pipeline(layer_a, layer_b).assess_observation(observation())

    assert result["status"] == "RETAKE_REQUIRED"
    assert result["routing_decision"] == "RETAKE_REQUIRED"
    assert layer_b.calls == 0


def test_missing_answers_returns_waiting_with_questions():
    layer_b = FakeLayerB(layer_b_result())

    result = pipeline(FakeLayerA(80), layer_b).assess_observation(observation())

    assert result["status"] == "WAITING_FOR_ANSWERS"
    assert len(result["layer_c"]["questions"]) == 5
    assert result["layer_d"] is None
    assert result["confidence"] is None


def test_complete_observation_runs_layers_d_and_confidence():
    layer_b = FakeLayerB(layer_b_result())
    # Supply spec confidence inputs (good GPS, in-baseline z-score) so the run
    # can reach the VALID tier (>=80) per spec Step 37.
    result = pipeline(FakeLayerA(90), layer_b).assess_observation(observation(
        citizen_answers={
            "water_clarity": "murky",
            "debris": "some",
            "turbidity_appearance": "Very murky",
            "turbidity_duration": "1-7 days",
            "turbidity_change": "Yes, it is more cloudy",
        },
        gps_accuracy_m=5.0,
        historical_z_score=0.5,
        site_baseline=None,
    ))

    assert result["status"] == "VALID"
    assert result["routing_decision"] == "VALID"
    assert result["layer_d"]["status"] == "CONSISTENT"
    assert result["confidence"]["confidence_score"] >= 80
    assert result["model_used"] == "mock-vision"
    assert result["prompt_version"] == "mock-prompt-v1"


def test_layer_b_failure_routes_to_review_without_fabricated_evidence():
    layer_b = FakeLayerB(error=AIProviderError("provider unavailable"))

    result = pipeline(FakeLayerA(80), layer_b).assess_observation(observation())

    assert result["status"] == "REVIEW_REQUIRED"
    assert result["routing_decision"] == "REVIEW_REQUIRED"
    assert result["layer_b"] is None
    assert result["confidence"] is None
    assert "provider unavailable" in result["processing_metadata"]["errors"][0]
