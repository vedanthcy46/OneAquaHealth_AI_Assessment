"""Deterministic AquaGuard AI Golden Demo.

Run from the repository root:
    python scripts/aquaguard_golden_demo.py
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.schemas.layer_b import LayerBResult


FIXED_TIMESTAMP = "2026-09-29T00:00:00+00:00"


class GoldenLayerA:
    """Fixed, realistic good-quality result for the supplied demo photograph."""

    def evaluate(self, image: np.ndarray) -> Any:
        return self

    @property
    def quality_score(self) -> int:
        return 86

    def model_dump(self, mode: str = "json") -> dict[str, Any]:
        return {
            "quality_score": 86,
            "passed": True,
            "routing": "good",
            "feedback": [],
            "blur": {"score": 88, "passed": True, "reason": "Water surface and stream edges are focused."},
            "brightness": {"score": 84, "passed": True, "reason": "Lighting is suitable for visual assessment."},
            "occlusion": {"score": 89, "passed": True, "reason": "The water surface is largely unobstructed."},
            "stream_relevance": {"score": 86, "passed": True, "reason": "A stream is clearly visible."},
            "duplicate": {"is_duplicate": False, "similarity": 0.08},
            "total_processing_ms": 0.0,
        }


class GoldenLayerB:
    """Fixed Layer B evidence derived only from the stated demo inputs."""

    def detect(self, image_path: str, source_media_id: str | None = None) -> LayerBResult:
        return LayerBResult.model_validate({
            "turbidity": {
                "value": "murky",
                "confidence": 0.94,
                "evidence": "The water appears visibly murky.",
                "uncertainty": None,
            },
            "debris": {
                "value": "absent",
                "confidence": 0.95,
                "evidence": "No significant debris is visible on the water surface.",
                "uncertainty": None,
                "estimated_coverage_pct": 0.0,
            },
            "algal_bloom": {
                "value": "present",
                "confidence": 0.95,
                "evidence": "Green material is visibly present on the water surface.",
                "uncertainty": None,
                "severity": "high",
            },
            "riparian_vegetation": {
                "value": "dense",
                "confidence": 0.82,
                "evidence": "Bankside vegetation is visible.",
                "uncertainty": None,
            },
            "concrete_channel": {
                "value": "absent",
                "confidence": 0.84,
                "evidence": "No concrete channel is visible.",
                "uncertainty": None,
            },
            "flow_condition": {
                "value": "flowing",
                "confidence": 0.86,
                "evidence": "Surface movement indicates flowing water.",
                "uncertainty": None,
            },
            "model_used": "golden-demo-vision-fixture",
            "provider_used": "deterministic-demo",
            "prompt_version": "layer_b_evidence_v1",
            "source_media_id": source_media_id,
            "fallback_used": False,
            "timestamp": FIXED_TIMESTAMP,
        })


def build_demo_input() -> dict[str, Any]:
    return {
        "observation_id": "golden-demo-001",
        "image": np.zeros((32, 32, 3), dtype=np.uint8),
        "citizen_notes": "Green stuff on the surface and the water smells bad.",
        "site_baseline": {
            "water_clarity": "clear",
            "algal_bloom": "absent",
            "debris": "none",
        },
        "citizen_answers": {
            "algae_smell": "strong",
            "algae_duration": "ongoing",
            "algae_dead_animals": "yes",
            "discharge_pipe": "unsure",
            "smell": "strong",
            "turbidity_appearance": "Very murky",
            "turbidity_duration": "ongoing",
            "water_clarity": "murky",
            "debris": "none",
        },
    }


def run_demo() -> dict[str, Any]:
    pipeline = AIPipelineOrchestrator(
        layer_a=GoldenLayerA(),
        layer_b=GoldenLayerB(),
        layer_c=AdaptiveQuestionGenerator(),
    )
    result = pipeline.assess_observation(build_demo_input())

    # Freeze runtime-only metadata so repeated demo runs produce the same JSON.
    result["ai_audit"]["processing_timestamp"] = FIXED_TIMESTAMP
    result["processing_metadata"]["processing_ms"] = 0.0
    result["layer_b"]["timestamp"] = FIXED_TIMESTAMP
    return result


def main() -> None:
    logging.disable(logging.INFO)
    try:
        result = run_demo()
    finally:
        logging.disable(logging.NOTSET)
    print(json.dumps(result, indent=2, sort_keys=False))


if __name__ == "__main__":
    main()
