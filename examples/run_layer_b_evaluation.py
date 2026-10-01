"""
Layer B evaluation runner (spec Day-5 deliverable).

Runs the Layer B detector over a labelled image dataset and prints
precision / recall / F1 per indicator plus macro averages.

Usage (from repo root), once you have a labelled dataset:
    python examples/run_layer_b_evaluation.py --data ai/evaluation/data

Provider selection:
    By default this uses the REAL OpenAI provider (primary) with Gemini
    fallback, so it needs OPENAI_API_KEY / GEMINI_API_KEY and network access.
    Pass --dry-run to exercise the harness with a deterministic fake provider
    and no network (useful to verify wiring; the numbers are meaningless).

STATUS: The harness is complete and tested. It has NOT been validated on real
stream imagery — no labelled dataset ships in this repo. Populate
ai/evaluation/data/ (see ai/evaluation/dataset.py) with ~20 labelled photos to
produce meaningful, validated metrics.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from ai.evaluation.dataset import load_labels
from ai.evaluation.metrics import evaluate_layer_b
from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
from ai.providers.base import VisionEvidenceProvider, VisionResponse


class _DryRunProvider(VisionEvidenceProvider):
    """Deterministic, offline provider — for wiring checks only (not a metric)."""

    @property
    def provider_name(self) -> str:
        return "dry-run"

    @property
    def model_name(self) -> str:
        return "dry-run-fixture"

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        payload = {
            "turbidity": {"value": "clear", "confidence": 0.9, "evidence": "bed visible"},
            "debris": {"value": "absent", "confidence": 0.9, "evidence": "none", "estimated_coverage_pct": None},
            "algal_bloom": {"value": "absent", "confidence": 0.9, "evidence": "none", "severity": "unknown"},
            "riparian_vegetation": {"value": "dense", "confidence": 0.9, "evidence": "plants"},
            "concrete_channel": {"value": "absent", "confidence": 0.9, "evidence": "natural"},
            "flow_condition": {"value": "flowing", "confidence": 0.9, "evidence": "ripples"},
        }
        return VisionResponse(json.dumps(payload), self.provider_name, self.model_name)


def _build_detector(dry_run: bool) -> EcologicalEvidenceDetector:
    if dry_run:
        return EcologicalEvidenceDetector(_DryRunProvider(), max_retries=1)
    # Real providers, lazily imported so --dry-run needs no SDKs.
    from ai.providers.openai_provider import OpenAIVisionProvider
    from ai.providers.gemini_provider import GeminiVisionProvider
    return EcologicalEvidenceDetector(
        OpenAIVisionProvider(), fallbacks=[GeminiVisionProvider()]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Layer B against labelled images.")
    parser.add_argument("--data", default="ai/evaluation/data", help="dataset directory")
    parser.add_argument("--dry-run", action="store_true", help="use offline fake provider")
    args = parser.parse_args()

    data_dir = Path(args.data)
    labels = load_labels(data_dir / "labels.json")
    if not labels:
        print(
            f"No labelled dataset found at {data_dir / 'labels.json'}.\n"
            "Add ~20 labelled real stream photos (see ai/evaluation/dataset.py) "
            "to produce validated metrics."
        )
        return

    detector = _build_detector(args.dry_run)
    predictions = []
    ground_truth = []
    for item in labels:
        image_path = str(data_dir / "images" / item.file)
        result = detector.detect(image_path, source_media_id=item.file)
        predictions.append(result.to_ai_evidence())
        ground_truth.append(item.labels)

    report = evaluate_layer_b(
        predictions, ground_truth,
        validated_on_real_imagery=(not args.dry_run),
    )
    print(json.dumps(report.as_dict(), indent=2))


if __name__ == "__main__":
    main()
