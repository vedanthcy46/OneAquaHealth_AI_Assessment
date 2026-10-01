"""
Layer A — ONNX Model Interface (Phase 7 Placeholder)

This module defines the `ImageQualityModel` abstract interface that a future
lightweight ONNX stream/non-stream binary classifier must implement.

STATUS: PLACEHOLDER — NO MODEL HAS BEEN TRAINED.
   The `PlaceholderImageQualityModel` class below raises `NotImplementedError`
   on every call. It exists solely to:
     1. Document the agreed interface so downstream callers can code against it.
     2. Satisfy the Phase 7 spec requirement without fabricating outputs.

Future replacement path:
   1. Train (or fine-tune) a small CNN on labelled stream / non-stream images.
   2. Export to ONNX (e.g. `torch.onnx.export` or `tf2onnx`).
   3. Subclass `ImageQualityModel`, load the `.onnx` file with `onnxruntime`,
      and implement `predict()`.
   4. Pass the instance as `relevance_provider` to `ImageQualityEngine`.

The existing `StreamRelevanceProvider` ABC in
`ai.layer_a.checks.stream_relevance` is the run-time integration point.
An ONNX model that subclasses `ImageQualityModel` should also subclass
`StreamRelevanceProvider` so it can be plugged directly into the engine:

    class ONNXStreamClassifier(ImageQualityModel, StreamRelevanceProvider):
        def predict(self, image_bgr: np.ndarray) -> ImageQualityResult: ...
        def classify(self, image_bgr: np.ndarray) -> tuple[float, str]: ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np


# ─────────────────────────────────────────────
# Result type
# ─────────────────────────────────────────────

@dataclass(frozen=True)
class ImageQualityResult:
    """
    Output of an ImageQualityModel prediction.

    Attributes:
        is_stream_relevant: True if the image appears to show a stream or
                            water body; False otherwise.
        confidence:         Model confidence in `is_stream_relevant` (0.0–1.0).
        reason:             One-sentence description of the visual evidence or
                            the model's uncertainty.  No diagnoses, no measurements.
    """
    is_stream_relevant: bool
    confidence: float         # 0.0 – 1.0
    reason: str


# ─────────────────────────────────────────────
# Abstract interface
# ─────────────────────────────────────────────

class ImageQualityModel(ABC):
    """
    Abstract base class for a lightweight ONNX image quality / stream-relevance
    classifier.

    Any concrete implementation MUST:
      - Load its weights once (in `__init__`), never on each `predict()` call.
      - Accept a BGR NumPy array as input (consistent with OpenCV / Layer A).
      - Return an `ImageQualityResult`; NEVER fabricate evidence.
      - Run in <50 ms per image on CPU (the spec target for offline use).
      - Raise `ai.utils.exceptions.AIProviderError` on any inference failure.
    """

    @abstractmethod
    def predict(self, image_bgr: np.ndarray) -> ImageQualityResult:
        """
        Run inference on a single BGR image.

        Args:
            image_bgr: NumPy uint8 array in BGR format (H × W × 3).

        Returns:
            ImageQualityResult with is_stream_relevant, confidence, and reason.

        Raises:
            ai.utils.exceptions.AIProviderError: on any model or I/O failure.
        """
        ...

    @property
    @abstractmethod
    def model_path(self) -> str:
        """Absolute path to the .onnx model file (or '' if not loaded)."""
        ...

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Human-readable version string (e.g. 'stream_classifier_v1.0')."""
        ...


# ─────────────────────────────────────────────
# Placeholder (NOT a trained model)
# ─────────────────────────────────────────────

class PlaceholderImageQualityModel(ImageQualityModel):
    """
    ⚠️  PLACEHOLDER — NOT A TRAINED MODEL.

    This class satisfies the `ImageQualityModel` interface but does NOT
    perform real inference. Every call to `predict()` raises `NotImplementedError`
    so that it is immediately obvious in logs and tests that no model has been
    loaded.

    Do NOT use this class in production without replacing it with a trained
    ONNX implementation.

    When to replace:
        Once a real .onnx file is available, create a subclass of
        `ImageQualityModel` (and `StreamRelevanceProvider`) that loads the file
        with `onnxruntime.InferenceSession` and implements `predict()`.
    """

    @property
    def model_path(self) -> str:
        return ""  # No file loaded

    @property
    def model_version(self) -> str:
        return "placeholder_v0.0_not_trained"

    def predict(self, image_bgr: np.ndarray) -> ImageQualityResult:
        raise NotImplementedError(
            "PlaceholderImageQualityModel: no ONNX model has been trained or loaded. "
            "Implement a concrete ImageQualityModel subclass with a real .onnx file "
            "before calling predict()."
        )
