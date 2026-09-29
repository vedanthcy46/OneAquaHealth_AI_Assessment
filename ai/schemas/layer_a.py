"""
Pydantic schemas for Layer A — Image Quality Engine output.

Every check result carries:
  - score        : numeric, 0–100
  - passed       : bool
  - threshold    : the value compared against
  - value        : the actual measured value
  - reason       : human-readable explanation
  - processing_ms: time taken for this check (ms)

The unified LayerAResult carries all sub-results plus a single
composite quality_score and routing_decision.

Scoring weights (documented, deterministic):
  blur        → 30%  (from AquaGuard Build Plan Step 15)
  brightness  → 20%
  occlusion   → 20%
  relevance   → 30%

Duplicate detection is a hard-reject before scoring.
"""

from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


# ─────────────────────────────────────────────
# Individual check result models
# ─────────────────────────────────────────────

class BlurResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="0 = maximally blurry, 100 = sharp")
    passed: bool
    laplacian_variance: float = Field(..., description="Raw Laplacian variance measured")
    threshold: float = Field(80.0, description="Variance below this is considered blurry")
    reason: str
    processing_ms: float = 0.0


class BrightnessResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="0 = unusable brightness, 100 = ideal")
    passed: bool
    hsv_value_mean: float = Field(..., description="Mean of HSV Value channel (0–255)")
    low_threshold: float = Field(30.0, description="Below this = too dark")
    high_threshold: float = Field(220.0, description="Above this = overexposed")
    reason: str
    processing_ms: float = 0.0


class OcclusionResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="0 = fully occluded, 100 = clear view")
    passed: bool
    blocked_fraction: float = Field(..., description="Estimated fraction of image that is blocked (0.0–1.0)")
    threshold: float = Field(0.60, description="Blocked fraction above this fails the check")
    reason: str
    processing_ms: float = 0.0


class StreamRelevanceResult(BaseModel):
    score: int = Field(..., ge=0, le=100, description="0 = clearly irrelevant, 100 = clearly a stream")
    passed: bool
    confidence: float = Field(..., description="Model confidence that image shows a stream/water body")
    threshold: float = Field(0.70, description="Confidence below this fails the check")
    reason: str
    provider_used: str = Field("none", description="Which vision provider supplied this result")
    processing_ms: float = 0.0


class DuplicateResult(BaseModel):
    is_duplicate: bool
    similarity: Optional[float] = Field(None, description="Perceptual similarity 0.0–1.0 vs matched image")
    matched_media_id: Optional[str] = Field(None, description="ID of the image this matches")
    phash: Optional[str] = Field(None, description="pHash hex string of this image")
    threshold: float = Field(0.95, description="Similarity above this triggers hard rejection")
    reason: str
    processing_ms: float = 0.0


# ─────────────────────────────────────────────
# Routing decision
# ─────────────────────────────────────────────

class QualityRouting(str):
    RETAKE_REQUIRED = "retake_required"       # score < 40
    ACCEPTED_REVIEW = "accepted_review_required"  # 40 ≤ score ≤ 69
    GOOD = "good"                              # score ≥ 70
    HARD_REJECT = "hard_reject"                # duplicate detected


# ─────────────────────────────────────────────
# Unified Layer A result
# ─────────────────────────────────────────────

class LayerAResult(BaseModel):
    quality_score: int = Field(..., ge=0, le=100, description="Weighted composite score (0–100)")
    passed: bool = Field(..., description="True if score ≥ 40 AND not a duplicate")
    routing: str = Field(..., description="retake_required | accepted_review_required | good | hard_reject")
    feedback: List[str] = Field(default_factory=list, description="Actionable guidance for the citizen")

    blur: BlurResult
    brightness: BrightnessResult
    occlusion: OcclusionResult
    stream_relevance: StreamRelevanceResult
    duplicate: DuplicateResult

    total_processing_ms: float = 0.0

    model_config = ConfigDict(populate_by_name=True)

    # Scoring weights — documented class constants (not Pydantic fields)
    # These match AquaGuard Build Plan Step 15 exactly.
    WEIGHT_BLUR: float = 0.30
    WEIGHT_BRIGHTNESS: float = 0.20
    WEIGHT_OCCLUSION: float = 0.20
    WEIGHT_RELEVANCE: float = 0.30
