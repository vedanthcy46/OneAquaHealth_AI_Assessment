"""
Pydantic schemas for Layer E — AquaGuard Confidence Scoring.

Formula (from AquaGuard Build Plan, Phase 5):
  Confidence =
    (ImageQuality             × 0.25)
  + (EvidenceRichness         × 0.30)
  + (QuestionCompleteness     × 0.15)
  + (AnswerImageConsistency   × 0.20)
  + (HistoricalSiteConsistency× 0.10)

All components are normalised to 0–100.
Weights sum to exactly 1.00.

Routing:
   0–49  → REVIEW_REQUIRED
  50–74  → VALID_MODERATE
  75–100 → VALID_HIGH
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List

from pydantic import BaseModel, Field, model_validator


# ─────────────────────────────────────────────
# Routing decision vocabulary
# ─────────────────────────────────────────────

class ConfidenceRouting(str, Enum):
    REVIEW_REQUIRED = "REVIEW_REQUIRED"   #  0–49
    VALID_MODERATE  = "VALID_MODERATE"    # 50–74
    VALID_HIGH      = "VALID_HIGH"        # 75–100


# ─────────────────────────────────────────────
# Per-component scores (0–100, normalised)
# ─────────────────────────────────────────────

class ConfidenceComponents(BaseModel):
    """
    The five scored components that feed the confidence formula.

    Each value is on 0–100 scale.

    Missing-value policy
    ────────────────────
    historical_site_consistency may be None when no baseline data exists.
    The calculator must NOT substitute a high score; it uses the
    documented fallback value (DEFAULT_HISTORICAL_FALLBACK = 50).
    """

    image_quality: float = Field(
        ..., ge=0.0, le=100.0,
        description="Layer A composite quality score, 0–100."
    )
    evidence_richness: float = Field(
        ..., ge=0.0, le=100.0,
        description=(
            "How information-rich the AI evidence is: proportion of "
            "high-confidence indicators × mean confidence, 0–100."
        )
    )
    question_completeness: float = Field(
        ..., ge=0.0, le=100.0,
        description=(
            "Proportion of required questions answered by the citizen, 0–100. "
            "If no questions were generated, defaults to 100 (nothing to answer)."
        )
    )
    answer_image_consistency: float = Field(
        ..., ge=0.0, le=100.0,
        description=(
            "Layer D cross-validation consistency score, 0–100. "
            "Directly sourced from ConsistencyResult.score."
        )
    )
    historical_site_consistency: float = Field(
        ..., ge=0.0, le=100.0,
        description=(
            "How well current observation matches historical baseline, 0–100. "
            "Falls back to 50 (neutral) when no baseline is available."
        )
    )


# ─────────────────────────────────────────────
# Weight constants (DO NOT change without spec update)
# ─────────────────────────────────────────────

WEIGHT_IMAGE_QUALITY              = 0.25
WEIGHT_EVIDENCE_RICHNESS          = 0.30
WEIGHT_QUESTION_COMPLETENESS      = 0.15
WEIGHT_ANSWER_IMAGE_CONSISTENCY   = 0.20
WEIGHT_HISTORICAL_SITE_CONSISTENCY = 0.10

# Sum must equal 1.00 — validated at import time.
_WEIGHTS_SUM = (
    WEIGHT_IMAGE_QUALITY
    + WEIGHT_EVIDENCE_RICHNESS
    + WEIGHT_QUESTION_COMPLETENESS
    + WEIGHT_ANSWER_IMAGE_CONSISTENCY
    + WEIGHT_HISTORICAL_SITE_CONSISTENCY
)
assert abs(_WEIGHTS_SUM - 1.00) < 1e-9, (
    f"Confidence weights must sum to 1.00, got {_WEIGHTS_SUM}"
)

CONFIDENCE_WEIGHTS: Dict[str, float] = {
    "image_quality":               WEIGHT_IMAGE_QUALITY,
    "evidence_richness":           WEIGHT_EVIDENCE_RICHNESS,
    "question_completeness":       WEIGHT_QUESTION_COMPLETENESS,
    "answer_image_consistency":    WEIGHT_ANSWER_IMAGE_CONSISTENCY,
    "historical_site_consistency": WEIGHT_HISTORICAL_SITE_CONSISTENCY,
}

# Fallback used when historical baseline is unavailable.
# 50 = neutral, avoiding both false-high and false-low inflation.
DEFAULT_HISTORICAL_FALLBACK: float = 50.0


# ─────────────────────────────────────────────
# Unified Layer E result
# ─────────────────────────────────────────────

class LayerEResult(BaseModel):
    """
    Final output of Phase 5 — AquaGuard Confidence Scoring.

    Fields
    ──────
    confidence_score        : Weighted composite, rounded to 2 dp.
    routing                 : One of REVIEW_REQUIRED | VALID_MODERATE | VALID_HIGH.
    components              : The five normalised sub-scores (0–100 each).
    weights                 : The locked weighting constants.
    historical_baseline_used: True if real baseline data was available.
    missing_data_notes      : Human-readable notes on any substituted/defaulted values.
    """

    confidence_score: float = Field(
        ..., ge=0.0, le=100.0,
        description="Weighted composite confidence score, 0–100 (rounded to 2 dp)."
    )
    routing: ConfidenceRouting = Field(
        ...,
        description="Routing decision derived from confidence_score."
    )
    components: ConfidenceComponents
    weights: Dict[str, float] = Field(
        default_factory=lambda: dict(CONFIDENCE_WEIGHTS),
        description="The exact weights applied. Always mirrors CONFIDENCE_WEIGHTS."
    )
    historical_baseline_used: bool = Field(
        ...,
        description=(
            "True when real historical baseline data was available. "
            "False when the fallback value was substituted."
        )
    )
    missing_data_notes: List[str] = Field(
        default_factory=list,
        description=(
            "Ordered list of notes describing any missing data and "
            "the substitution strategy applied."
        )
    )

    @model_validator(mode="after")
    def _routing_matches_score(self) -> "LayerEResult":
        expected = _routing_from_score(self.confidence_score)
        if self.routing != expected:
            raise ValueError(
                f"routing={self.routing} does not match "
                f"confidence_score={self.confidence_score} (expected {expected})"
            )
        return self


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _routing_from_score(score: float) -> ConfidenceRouting:
    """
    Deterministic routing table (exclusive upper bounds):
      [0, 50)   → REVIEW_REQUIRED
      [50, 75)  → VALID_MODERATE
      [75, 100] → VALID_HIGH
    """
    if score < 50.0:
        return ConfidenceRouting.REVIEW_REQUIRED
    if score < 75.0:
        return ConfidenceRouting.VALID_MODERATE
    return ConfidenceRouting.VALID_HIGH
