"""
Layer A — Stream Relevance Check

Architecture: Provider interface pattern.

This module defines the abstract `StreamRelevanceProvider` base class.
The quality engine accepts any concrete implementation at runtime.
This means:
  - In Phase 1 (now): tests use `MockStreamRelevanceProvider`.
  - In Phase 2: `GeminiRelevanceProvider` or `OpenAIRelevanceProvider` plugs in
    without touching this file or the quality engine.

Threshold: confidence < 0.70 → fail
Score    : int(confidence * 100) clamped to 0–100

If no provider is supplied:
  - A neutral score of 70 is returned (borderline pass).
  - A warning is embedded in the reason field.
  - This assumption is documented so reviewers are aware.

References:
  - README Table: "Binary classifier (stream/no stream) | Confidence < 0.7 → fail | −30 pts"
"""

from __future__ import annotations
import time
from abc import ABC, abstractmethod
import numpy as np
from ai.schemas.layer_a import StreamRelevanceResult

# ── Constants ──────────────────────────────────────────────────────────────────
RELEVANCE_FAIL_THRESHOLD: float = 0.70
NEUTRAL_SCORE_WHEN_NO_PROVIDER: int = 70  # documented assumption


# ── Abstract provider interface ────────────────────────────────────────────────

class StreamRelevanceProvider(ABC):
    """
    Abstract base class for stream-relevance classifiers.

    Any vision model integration (Gemini, OpenAI, custom ONNX) must subclass
    this and implement `classify`.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable name for logging and provenance."""
        ...

    @abstractmethod
    def classify(self, image_bgr: np.ndarray) -> tuple[float, str]:
        """
        Classify whether the image contains a stream or water body.

        Args:
            image_bgr: NumPy BGR image array.

        Returns:
            (confidence, reason) where confidence is 0.0–1.0.
        """
        ...


# ── Check function ─────────────────────────────────────────────────────────────

def compute_stream_relevance_score(
    image_bgr: np.ndarray,
    provider: StreamRelevanceProvider | None = None,
) -> StreamRelevanceResult:
    """
    Evaluate whether the image is relevant to stream/water observation.

    Args:
        image_bgr  : NumPy BGR image array.
        provider   : A StreamRelevanceProvider implementation.
                     If None, a neutral pass score is returned with a warning.

    Returns:
        StreamRelevanceResult
    """
    t_start = time.perf_counter()

    if provider is None:
        # ASSUMPTION: When no provider is available (e.g. unit tests, offline mode),
        # we return a neutral borderline-pass score of 70 rather than failing the image.
        # This prevents penalising observations when the vision model is unavailable.
        # The reason field makes this transparent to any downstream reviewer.
        confidence = NEUTRAL_SCORE_WHEN_NO_PROVIDER / 100.0
        reason = (
            "No stream-relevance provider was configured. "
            f"Neutral score of {NEUTRAL_SCORE_WHEN_NO_PROVIDER} applied — "
            "this check should be re-run with a vision provider before production use."
        )
        provider_name = "none"
    else:
        confidence, reason = provider.classify(image_bgr)
        provider_name = provider.provider_name

    passed = confidence >= RELEVANCE_FAIL_THRESHOLD
    score = int(min(100.0, max(0.0, confidence * 100)))

    if not passed and provider is not None:
        reason = (
            f"Image does not appear to show a stream or water body "
            f"(confidence={confidence:.2f} < threshold {RELEVANCE_FAIL_THRESHOLD}). "
            "Please submit a photo that clearly shows the waterway you are reporting on. "
            f"[Provider: {provider_name}]"
        )

    processing_ms = (time.perf_counter() - t_start) * 1000

    return StreamRelevanceResult(
        score=score,
        passed=passed,
        confidence=round(confidence, 4),
        threshold=RELEVANCE_FAIL_THRESHOLD,
        reason=reason,
        provider_used=provider_name,
        processing_ms=round(processing_ms, 2),
    )
