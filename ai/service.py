"""
Service-boundary entrypoint for the AquaGuard AI pipeline.

WHY THIS EXISTS
───────────────
The project spec assigns Member B's module to a TypeScript/Node worker, but the
implementation is Python. Rather than rewrite (which would discard the tested
Python pipeline), this module exposes a stable JSON-in / JSON-out boundary so
the Node worker can invoke the pipeline as a subprocess:

    const { execFile } = require("node:child_process");
    execFile("python", ["-m", "ai.service"], (err, stdout) => {...});
    // write the observation JSON to stdin, read the assessment JSON from stdout

Contract
────────
stdin  : a JSON object matching the orchestrator observation shape:
           {
             "observation_id": "...",
             "image": "<path to image file>",     # path, not raw bytes
             "citizen_answers": {...},             # optional
             "site_baseline": {...},               # optional
             "citizen_notes": "...",               # optional
             "gps_accuracy_m": 5.0,                # optional
             "historical_z_score": 0.5             # optional
           }
stdout : the assessment result JSON (status, layer_*, confidence, ai_audit, ...).
exit   : 0 on success (including a REVIEW_REQUIRED assessment — that is a valid
         result, not an error); non-zero only on transport/parse failure.

By default the real OpenAI→Gemini provider chain is used (needs API keys). This
is an integration boundary, not a unit — it is dependent on external APIs.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Dict

from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.layer_d.cross_validator import CrossValidator
from ai.pipeline.orchestrator import AIPipelineOrchestrator


def _build_orchestrator() -> AIPipelineOrchestrator:
    """
    Wire the pipeline with the real provider chain (OpenAI primary, Gemini
    fallback). Providers are imported lazily so a caller can still import this
    module in environments without the SDKs (e.g. to reuse `assess_json`).
    """
    from ai.layer_a.quality_engine import ImageQualityEngine
    from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
    from ai.providers.openai_provider import OpenAIVisionProvider
    from ai.providers.gemini_provider import GeminiVisionProvider

    layer_b = EcologicalEvidenceDetector(
        OpenAIVisionProvider(), fallbacks=[GeminiVisionProvider()]
    )
    return AIPipelineOrchestrator(
        layer_a=ImageQualityEngine(),
        layer_b=layer_b,
        layer_c=AdaptiveQuestionGenerator(),
        layer_d=CrossValidator(),
    )


def assess_json(payload: Dict[str, Any], orchestrator: AIPipelineOrchestrator | None = None) -> Dict[str, Any]:
    """
    Run one assessment from a plain dict and return a plain dict.

    An orchestrator can be injected (e.g. for tests with mocked layers); when
    omitted, the real provider chain is constructed.
    """
    orch = orchestrator or _build_orchestrator()
    return orch.assess_observation(payload)


def main(argv: list[str] | None = None) -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("input must be a JSON object")
    except (json.JSONDecodeError, ValueError) as exc:
        json.dump({"error": f"invalid input JSON: {exc}"}, sys.stdout)
        return 2

    try:
        result = assess_json(payload)
    except Exception as exc:  # transport-level failure only
        json.dump({"error": f"assessment failed: {exc}"}, sys.stdout)
        return 1

    json.dump(result, sys.stdout, default=str)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
