"""
AquaGuard AI pipeline orchestrator (hardened).

Safety/reliability guarantees enforced here:
  - Every result carries an AIAudit object (model_used, fallback_used,
    prompt_version, warnings, errors, degraded_mode, human_review_required,
    processing_timestamp, confidence_score, routing_decision, conflicts).
  - AI failure NEVER silently yields a VALID result. Any failure, degraded
    mode, or guard violation routes to REVIEW_REQUIRED.
  - Provider fallback (OpenAI → Gemini) happens inside Layer B; the audit
    records whether a fallback answered.
  - AI-produced free text (evidence reasoning, Layer D explanation) is passed
    through the output safety guard; forbidden claims are sanitised and force
    human review.
  - Human reviewer decisions always take precedence (apply_human_override).
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from ai.confidence.calculator import calculate_confidence
from ai.layer_a.quality_engine import ImageQualityEngine
from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.layer_d.cross_validator import CrossValidator
from ai.safety.constants import REVIEW_REQUIRED, VALID_ROUTINGS
from ai.safety.guard import sanitize_evidence, sanitize_text
from ai.schemas.audit import AIAudit
from ai.utils.logger import get_logger

logger = get_logger(__name__)


class AIPipelineOrchestrator:
    def __init__(self, provider=None, layer_a=None, layer_b=None, layer_c=None, layer_d=None, confidence=None):
        self.layer_a = layer_a or ImageQualityEngine()
        self.layer_b = layer_b or (EcologicalEvidenceDetector(provider) if provider else None)
        self.layer_c = layer_c or AdaptiveQuestionGenerator()
        self.layer_d = layer_d or CrossValidator()
        self.confidence = confidence or calculate_confidence

    # ── Serialisation helper ──────────────────────────────────────────────────

    @staticmethod
    def _dump(value: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, "model_dump"):
            return value.model_dump(mode="json")
        if isinstance(value, list):
            return [AIPipelineOrchestrator._dump(item) for item in value]
        if isinstance(value, dict):
            return {key: AIPipelineOrchestrator._dump(item) for key, item in value.items()}
        return value

    @staticmethod
    def _load_image(image: Any) -> np.ndarray:
        if isinstance(image, np.ndarray):
            return image
        if not isinstance(image, (str, Path)):
            raise ValueError("image must be a BGR numpy array or an image path")
        image_bgr = cv2.imread(str(image))
        if image_bgr is None:
            raise ValueError(f"Unable to read image: {image}")
        return image_bgr

    # ── Result builders ───────────────────────────────────────────────────────

    def _envelope(
        self,
        observation_id: str,
        started: float,
        status: str,
        audit: AIAudit,
        layer_a: Any = None,
        layer_b: Any = None,
        layer_c: Any = None,
        layer_d: Any = None,
        confidence: Any = None,
        anomaly: bool = False,
    ) -> Dict[str, Any]:
        audit.routing_decision = status
        return {
            "observation_id": observation_id,
            "status": status,
            "routing_decision": status,
            "layer_a": self._dump(layer_a),
            "layer_b": self._dump(layer_b),
            "layer_c": layer_c,
            "layer_d": self._dump(layer_d),
            "confidence": self._dump(confidence),
            "anomaly_detected": anomaly,
            # Provenance kept at top level for convenience AND in the audit.
            "model_used": audit.model_used,
            "prompt_version": audit.prompt_version,
            "ai_audit": audit.model_dump(mode="json"),
            "processing_metadata": {
                "processing_ms": round((time.perf_counter() - started) * 1000, 2),
                "errors": list(audit.errors),
                "warnings": list(audit.warnings),
            },
        }

    def _error_result(
        self,
        observation_id: str,
        started: float,
        message: str,
        audit: Optional[AIAudit] = None,
        layer_a: Any = None,
        layer_b: Any = None,
    ) -> Dict[str, Any]:
        audit = audit or AIAudit()
        audit.add_error(message)  # forces degraded_mode + human_review_required
        if layer_b is not None:
            audit.model_used = getattr(layer_b, "model_used", audit.model_used)
            audit.prompt_version = getattr(layer_b, "prompt_version", audit.prompt_version)
            audit.fallback_used = bool(getattr(layer_b, "fallback_used", audit.fallback_used))
        return self._envelope(
            observation_id, started, REVIEW_REQUIRED, audit,
            layer_a=layer_a, layer_b=layer_b, anomaly=True,
        )

    # ── Main entry point ──────────────────────────────────────────────────────

    def assess_observation(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """Run the complete assessment without database or transport coupling."""
        started = time.perf_counter()
        audit = AIAudit()

        observation_id = str(observation.get("observation_id", ""))
        if not observation_id or "image" not in observation:
            return self._error_result(observation_id, started, "observation_id and image are required", audit)

        # ── Layer A ──
        try:
            image = self._load_image(observation["image"])
            layer_a = self.layer_a.evaluate(image)
        except Exception as exc:
            logger.exception("Layer A failed for observation %s", observation_id)
            return self._error_result(observation_id, started, f"Layer A failed: {exc}", audit)

        if layer_a.quality_score < 40:
            # Not an error — a legitimate, safe routing outcome. No AI ran.
            audit.model_used = "not_run"
            audit.prompt_version = "not_run"
            audit.require_human_review("Image quality too low for AI assessment; retake requested.")
            return self._envelope(
                observation_id, started, "RETAKE_REQUIRED", audit,
                layer_a=layer_a, anomaly=False,
            )

        if self.layer_b is None:
            return self._error_result(
                observation_id, started, "Layer B provider is not configured", audit, layer_a=layer_a
            )

        # ── Layer B (vision, with provider fallback inside) ──
        image_reference = observation["image"] if isinstance(observation["image"], (str, Path)) else observation_id
        try:
            layer_b = self.layer_b.detect(str(image_reference), source_media_id=observation_id)
            evidence = layer_b.to_ai_evidence()
        except Exception as exc:
            logger.exception("Layer B failed for observation %s", observation_id)
            return self._error_result(
                observation_id, started, f"Layer B failed safely: {exc}", audit, layer_a=layer_a
            )

        # Record Layer B provenance (rule 15) + fallback state (rule 12).
        audit.model_used = getattr(layer_b, "model_used", "unknown")
        audit.prompt_version = getattr(layer_b, "prompt_version", "unknown")
        audit.fallback_used = bool(getattr(layer_b, "fallback_used", False))
        if audit.fallback_used:
            audit.add_warning("Primary vision provider failed; a fallback provider produced this result.")

        # ── Output safety guard on AI evidence (rules 1–7, 9) ──
        evidence, guard = sanitize_evidence(evidence)
        if guard.violated:
            for msg in guard.messages:
                audit.add_warning(msg)
            audit.mark_degraded("AI output contained unsafe claims that were sanitised.")

        # ── Layer C ──
        try:
            questions = self.layer_c.generate_questions(evidence, observation.get("citizen_notes"))
        except Exception as exc:
            logger.exception("Layer C failed for observation %s", observation_id)
            return self._error_result(
                observation_id, started, f"Layer C failed safely: {exc}", audit, layer_a=layer_a, layer_b=layer_b
            )

        citizen_answers = observation.get("citizen_answers")
        if not citizen_answers:
            # Legitimate pause point — waiting for the citizen, not a failure.
            return self._envelope(
                observation_id, started, "WAITING_FOR_ANSWERS", audit,
                layer_a=layer_a, layer_b=layer_b,
                layer_c={"questions": self._dump(questions)}, anomaly=False,
            )

        # ── Layer D + confidence ──
        try:
            layer_d = self.layer_d.validate_consistency(
                evidence, citizen_answers, observation.get("site_baseline")
            )
            # Guard the Layer D explanation too (rules 3–6, 9).
            safe_explanation, d_guard = sanitize_text(layer_d.explanation)
            if d_guard.violated:
                for msg in d_guard.messages:
                    audit.add_warning(f"[layer_d] {msg}")
                layer_d.explanation = safe_explanation
                audit.mark_degraded("Cross-validation explanation was sanitised.")

            confidence = self._run_confidence(
                layer_a, evidence, questions, citizen_answers, layer_d,
                observation.get("site_baseline"),
            )
        except Exception as exc:
            logger.exception("Layer D / confidence failed for observation %s", observation_id)
            return self._error_result(
                observation_id, started,
                f"Assessment could not be safely completed: {exc}",
                audit, layer_a=layer_a, layer_b=layer_b,
            )

        # ── Routing (rule 11 & 13: never VALID on failure/degradation) ──
        confidence_score = self._extract_score(confidence)
        audit.confidence_score = confidence_score
        audit.conflicts = list(getattr(layer_d, "conflicts", []) or [])

        review_needed = (
            audit.degraded_mode
            or audit.human_review_required
            or layer_d.requires_review
            or confidence_score is None
            or float(confidence_score) < 50.0
        )
        status = REVIEW_REQUIRED if review_needed else "VALID"
        if status not in VALID_ROUTINGS:
            audit.require_human_review()

        return self._envelope(
            observation_id, started, status, audit,
            layer_a=layer_a, layer_b=layer_b,
            layer_c={"questions": self._dump(questions), "answers": citizen_answers},
            layer_d=layer_d, confidence=confidence,
            anomaly=bool(layer_d.conflicts) or layer_d.requires_review,
        )

    # ── Confidence adapter (tolerates class-based or functional API) ──

    def _run_confidence(self, layer_a, evidence, questions, citizen_answers, layer_d, baseline):
        conf = self.confidence
        if hasattr(conf, "calculate"):
            return conf.calculate(layer_a, evidence, [])
        return conf(
            layer_a.quality_score, evidence, questions, citizen_answers, layer_d, baseline
        )

    @staticmethod
    def _extract_score(confidence: Any) -> Optional[float]:
        for attr in ("confidence_score", "score"):
            val = getattr(confidence, attr, None)
            if val is not None:
                return float(val)
        if isinstance(confidence, dict):
            for key in ("confidence_score", "score"):
                if key in confidence:
                    return float(confidence[key])
        return None

    # ── Async wrapper kept for backward compatibility ──

    async def process_observation(
        self, image_path: str, citizen_answers: Dict[str, Any], historical_baseline: Dict[str, Any]
    ):
        logger.info("Starting AI pipeline for image: %s", image_path)
        return self.assess_observation({
            "observation_id": str(image_path),
            "image": image_path,
            "citizen_answers": citizen_answers,
            "site_baseline": historical_baseline,
        })


def assess_observation(observation: Dict[str, Any], **dependencies: Any) -> Dict[str, Any]:
    """Convenience function for callers that want a pure service entry point."""
    return AIPipelineOrchestrator(**dependencies).assess_observation(observation)
