"""
Pydantic schemas for Layer E — AquaGuard Confidence Scoring.

Aligned to AQUAGUARD_BUILD_PLAN.md Step 34 (Confidence Algorithm) and
Step 37 (Confidence-Based Routing).

Formula (Step 34):
  Confidence =
    (imageQuality           × 0.25)
  + (aiEvidenceAgreement    × 0.30)
  + (citizenConsistency     × 0.25)
  + (gpsValidity            × 0.10)
  + (historicalConsistency  × 0.10)

All components are normalised to 0–100. Weights sum to exactly 1.00.

Routing (Step 37):
   ≥ 80  → VALID           (auto-accepted, no reviewer needed)
  60–79  → REVIEW_REQUIRED (enters review queue)
   < 60  → HUMAN_REVIEW    (mandatory expert review)

Factor names mirror the shared `AIResult.confidenceFactors` contract in
TEAM_TASK_SPLIT.md Section 4 so the frontend can bind directly.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List

from pydantic import BaseModel, Field, model_validator


# ─────────────────────────────────────────────
# Routing decision vocabulary (Step 37)
# ─────────────────────────────────────────────

class ConfidenceRouting(str, Enum):
    VALID = "VALID"                     # ≥ 80
    REVIEW_REQUIRED = "REVIEW_REQUIRED" # 60–79
    HUMAN_REVIEW = "HUMAN_REVIEW"       # < 60


# ─────────────────────────────────────────────
# Per-component scores (0–100, normalised)
# ─────────────────────────────────────────────

class ConfidenceComponents(BaseModel):
    """
    The five scored components that feed the confidence formula.
    Field names match the shared AIResult.confidenceFactors contract.
    Each value is on a 0–100 scale.
    """

    imageQuality: float = Field(
        ..., ge=0.0, le=100.0,
        description="Layer A composite quality score, 0–100."
    )
    aiEvidenceAgreement: float = Field(
        ..., ge=0.0, le=100.0,
        description="How information-rich and self-consistent the AI evidence is, 0–100."
    )
    citizenConsistency: float = Field(
        ..., ge=0.0, le=100.0,
        description="100 minus 15 per unresolved citizen/AI conflict (spec Step 34)."
    )
    gpsValidity: float = Field(
        ..., ge=0.0, le=100.0,
        description="GPS accuracy score: <20m→100, <50m→70, else 30 (spec Step 34)."
    )
    historicalConsistency: float = Field(
        ..., ge=0.0, le=100.0,
        description="Z-score vs site baseline: <2→100, <3→60, else 20; 50 neutral when absent."
    )


# ─────────────────────────────────────────────
# Weight constants (spec Step 34 — DO NOT change without spec update)
# ─────────────────────────────────────────────

WEIGHT_IMAGE_QUALITY            = 0.25
WEIGHT_AI_EVIDENCE_AGREEMENT    = 0.30
WEIGHT_CITIZEN_CONSISTENCY      = 0.25
WEIGHT_GPS_VALIDITY             = 0.10
WEIGHT_HISTORICAL_CONSISTENCY   = 0.10

_WEIGHTS_SUM = (
    WEIGHT_IMAGE_QUALITY
    + WEIGHT_AI_EVIDENCE_AGREEMENT
    + WEIGHT_CITIZEN_CONSISTENCY
    + WEIGHT_GPS_VALIDITY
    + WEIGHT_HISTORICAL_CONSISTENCY
)
assert abs(_WEIGHTS_SUM - 1.00) < 1e-9, (
    f"Confidence weights must sum to 1.00, got {_WEIGHTS_SUM}"
)

CONFIDENCE_WEIGHTS: Dict[str, float] = {
    "imageQuality":          WEIGHT_IMAGE_QUALITY,
    "aiEvidenceAgreement":   WEIGHT_AI_EVIDENCE_AGREEMENT,
    "citizenConsistency":    WEIGHT_CITIZEN_CONSISTENCY,
    "gpsValidity":           WEIGHT_GPS_VALIDITY,
    "historicalConsistency": WEIGHT_HISTORICAL_CONSISTENCY,
}

# Fallback used when historical baseline is unavailable.
# 50 = neutral, avoiding both false-high and false-low inflation.
DEFAULT_HISTORICAL_FALLBACK: float = 50.0
# Points deducted per unresolved citizen/AI conflict (spec Step 34).
CITIZEN_CONFLICT_PENALTY: float = 15.0
# GPS accuracy thresholds (metres) and scores (spec Step 34).
GPS_GOOD_M, GPS_GOOD_SCORE = 20.0, 100.0
GPS_FAIR_M, GPS_FAIR_SCORE = 50.0, 70.0
GPS_POOR_SCORE = 30.0
# When GPS accuracy is unknown, use a neutral score (documented, not inflated).
GPS_UNKNOWN_SCORE: float = 70.0


# ─────────────────────────────────────────────
# Unified Layer E result
# ─────────────────────────────────────────────

class LayerEResult(BaseModel):
    """
    Final output of the AquaGuard Confidence Scoring layer.
    """

    confidence_score: float = Field(
        ..., ge=0.0, le=100.0,
        description="Weighted composite confidence score, 0–100 (rounded to 2 dp)."
    )
    routing: ConfidenceRouting = Field(
        ..., description="Routing decision derived from confidence_score (Step 37)."
    )
    components: ConfidenceComponents
    weights: Dict[str, float] = Field(
        default_factory=lambda: dict(CONFIDENCE_WEIGHTS),
        description="The exact weights applied. Always mirrors CONFIDENCE_WEIGHTS."
    )
    historical_baseline_used: bool = Field(
        ...,
        description="True when real historical baseline data was available."
    )
    missing_data_notes: List[str] = Field(
        default_factory=list,
        description="Notes describing any missing data and the substitution strategy."
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
    Deterministic routing table (spec Step 37):
      [80, 100] → VALID
      [60, 80)  → REVIEW_REQUIRED
      [0, 60)   → HUMAN_REVIEW
    """
    if score >= 80.0:
        return ConfidenceRouting.VALID
    if score >= 60.0:
        return ConfidenceRouting.REVIEW_REQUIRED
    return ConfidenceRouting.HUMAN_REVIEW
