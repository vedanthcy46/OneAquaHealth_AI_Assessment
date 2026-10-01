"""
Tests for the JSON service boundary (ai/service.py).

Uses an injected orchestrator with mocked layers — no live API calls.
"""

from __future__ import annotations

import numpy as np

from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.layer_d.cross_validator import CrossValidator
from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.schemas.base import AIEvidence
from ai.service import assess_json


class _FakeQuality:
    def __init__(self, score): self.quality_score = score
    def model_dump(self, mode="json"): return {"quality_score": self.quality_score}


class _FakeLayerA:
    def __init__(self, score=90): self.score = score
    def evaluate(self, image): return _FakeQuality(self.score)


class _FakeLayerB:
    model_used = "gpt-4o"
    prompt_version = "layer_b_evidence_v2"
    fallback_used = False

    def detect(self, ref, source_media_id=None):
        return self

    def to_ai_evidence(self):
        return [AIEvidence(indicator=f"i{i}", present=True, confidence=0.95, reasoning="v") for i in range(4)]


def _orch():
    return AIPipelineOrchestrator(
        layer_a=_FakeLayerA(95), layer_b=_FakeLayerB(),
        layer_c=AdaptiveQuestionGenerator(), layer_d=CrossValidator(),
    )


def test_assess_json_returns_serialisable_dict():
    payload = {
        "observation_id": "svc-1",
        "image": np.zeros((10, 10, 3), np.uint8),
        "citizen_answers": {"water_clarity": "clear"},
        "gps_accuracy_m": 5.0,
        "historical_z_score": 0.5,
    }
    out = assess_json(payload, orchestrator=_orch())
    assert out["observation_id"] == "svc-1"
    assert out["status"] in ("VALID", "REVIEW_REQUIRED", "HUMAN_REVIEW")
    assert "ai_audit" in out
    assert out["ai_audit"]["input_hash"].startswith("sha256:")


def test_input_hash_is_deterministic():
    payload = {
        "observation_id": "svc-2",
        "image": np.zeros((10, 10, 3), np.uint8),
        "citizen_answers": {"water_clarity": "clear"},
    }
    a = assess_json(dict(payload), orchestrator=_orch())["ai_audit"]["input_hash"]
    b = assess_json(dict(payload), orchestrator=_orch())["ai_audit"]["input_hash"]
    assert a == b
