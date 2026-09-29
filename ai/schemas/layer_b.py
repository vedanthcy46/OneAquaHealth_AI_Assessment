"""
Pydantic schemas for Layer B — Ecological Evidence Detection.

Layer B is a VISION-AI component. It detects ONLY visually observable
evidence from a stream photograph. It must never:
  - invent measurements
  - claim laboratory water-quality values
  - diagnose contamination
  - infer pollution sources
  - infer any fact that cannot be visually established

When evidence is insufficient, every indicator falls back to "unknown".

Design contract
───────────────
Each of the six indicators is modelled with a strict, closed vocabulary of
values (via string Enums). Every indicator carries:
  - value        : the observed category (always includes an "unknown" member)
  - confidence   : 0.0–1.0 model confidence in the stated value
  - evidence     : one-sentence description of the *visible* evidence only
  - uncertainty  : optional note on why the model is unsure (where applicable)

The unified `LayerBResult` bundles all indicators together with provenance:
  - model_used    : concrete model that produced the result (e.g. "gpt-4o")
  - provider_used : "openai" | "gemini" | ...
  - prompt_version: the versioned prompt identifier used
  - source_media_id / timestamp for traceability

`LayerBResult.to_ai_evidence()` converts the structured result into the
flat, storage-friendly `AIEvidence` rows defined in `ai.schemas.base`,
keeping Layer B output compatible with the rest of the pipeline / DB.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ai.schemas.base import AIEvidence


# ─────────────────────────────────────────────
# Closed vocabularies (string Enums)
# ─────────────────────────────────────────────

class Turbidity(str, Enum):
    CLEAR = "clear"
    CLOUDY = "cloudy"
    MURKY = "murky"
    OPAQUE = "opaque"
    UNKNOWN = "unknown"


class Presence(str, Enum):
    """Generic present / absent / unknown vocabulary."""
    PRESENT = "present"
    ABSENT = "absent"
    UNKNOWN = "unknown"


class AlgalSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class RiparianVegetation(str, Enum):
    DENSE = "dense"
    SPARSE = "sparse"
    ABSENT = "absent"
    UNKNOWN = "unknown"


class ConcreteChannel(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    UNKNOWN = "unknown"


class FlowCondition(str, Enum):
    FLOWING = "flowing"
    STAGNANT = "stagnant"
    DRY = "dry"
    UNKNOWN = "unknown"


# ─────────────────────────────────────────────
# Per-indicator models
# ─────────────────────────────────────────────

class _IndicatorBase(BaseModel):
    """Shared fields for every indicator. Strict: unknown keys rejected."""
    model_config = ConfigDict(extra="forbid")

    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model confidence in the stated value (0.0–1.0).",
    )
    evidence: str = Field(
        ...,
        min_length=1,
        description="One sentence describing ONLY the visible evidence. "
                    "No diagnoses, no inferred causes, no measurements.",
    )
    uncertainty: Optional[str] = Field(
        None,
        description="Optional note on why the model is unsure, when applicable.",
    )


class TurbidityIndicator(_IndicatorBase):
    value: Turbidity = Field(..., description="Observed water turbidity category.")


class DebrisIndicator(_IndicatorBase):
    value: Presence = Field(..., description="Whether litter/debris is visible.")
    estimated_coverage_pct: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description="Estimated fraction of the visible surface covered by debris "
                    "(0–100). Null when it cannot be visually estimated.",
    )


class AlgalBloomIndicator(_IndicatorBase):
    value: Presence = Field(..., description="Whether an algal bloom is visible.")
    severity: AlgalSeverity = Field(
        AlgalSeverity.UNKNOWN,
        description="Visible severity of the bloom; unknown if not determinable.",
    )


class RiparianVegetationIndicator(_IndicatorBase):
    value: RiparianVegetation = Field(
        ..., description="Density of bankside/riparian vegetation."
    )


class ConcreteChannelIndicator(_IndicatorBase):
    value: ConcreteChannel = Field(
        ..., description="Whether the channel appears artificially concreted."
    )


class FlowConditionIndicator(_IndicatorBase):
    value: FlowCondition = Field(
        ..., description="Observed flow condition of the water."
    )


# ─────────────────────────────────────────────
# Unified Layer B result
# ─────────────────────────────────────────────

class LayerBResult(BaseModel):
    """
    Strict, closed structure holding all six ecological indicators plus
    provenance. `extra="forbid"` guarantees the model cannot smuggle in
    extra, potentially-hallucinated fields.
    """
    model_config = ConfigDict(extra="forbid")

    turbidity: TurbidityIndicator
    debris: DebrisIndicator
    algal_bloom: AlgalBloomIndicator
    riparian_vegetation: RiparianVegetationIndicator
    concrete_channel: ConcreteChannelIndicator
    flow_condition: FlowConditionIndicator

    # ── Provenance / tracking ──
    model_used: str = Field(
        "unknown",
        description="Concrete model that produced this result (e.g. gpt-4o).",
    )
    provider_used: str = Field(
        "unknown",
        description="Provider that produced this result (openai | gemini | ...).",
    )
    prompt_version: str = Field(
        "unknown",
        description="Identifier of the versioned prompt used.",
    )
    source_media_id: Optional[str] = Field(
        None, description="ID of the analysed media, for traceability."
    )
    fallback_used: bool = Field(
        False,
        description="True if the primary provider failed and a fallback answered.",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="UTC ISO-8601 timestamp of when the result was produced.",
    )

    # ── Indicator → present-boolean mapping for AIEvidence compatibility ──
    _PRESENT_VALUES = {
        "turbidity": {Turbidity.CLOUDY, Turbidity.MURKY, Turbidity.OPAQUE},
        "debris": {Presence.PRESENT},
        "algal_bloom": {Presence.PRESENT},
        "riparian_vegetation": {RiparianVegetation.DENSE, RiparianVegetation.SPARSE},
        "concrete_channel": {ConcreteChannel.PRESENT},
        "flow_condition": {FlowCondition.FLOWING, FlowCondition.STAGNANT},
    }

    def to_ai_evidence(self) -> List[AIEvidence]:
        """
        Flatten this structured result into AIEvidence rows.

        `present` is True when the observed value is an affirmative/observed
        category, False when the value is an explicit "absent", and False for
        "unknown" (with the uncertainty reflected in `confidence`/`reasoning`).
        """
        rows: List[AIEvidence] = []

        def _row(indicator: str, ind: _IndicatorBase, present_set) -> AIEvidence:
            value = ind.value  # type: ignore[attr-defined]
            present = value in present_set
            reasoning = ind.evidence
            if ind.uncertainty:
                reasoning = f"{reasoning} (uncertainty: {ind.uncertainty})"
            # Prefix reasoning with the observed categorical value for clarity.
            reasoning = f"{indicator}={value.value}: {reasoning}"
            return AIEvidence(
                indicator=indicator,
                present=present,
                confidence=ind.confidence,
                reasoning=reasoning,
            )

        rows.append(_row("turbidity", self.turbidity, self._PRESENT_VALUES["turbidity"]))
        rows.append(_row("debris", self.debris, self._PRESENT_VALUES["debris"]))
        rows.append(_row("algal_bloom", self.algal_bloom, self._PRESENT_VALUES["algal_bloom"]))
        rows.append(_row("riparian_vegetation", self.riparian_vegetation, self._PRESENT_VALUES["riparian_vegetation"]))
        rows.append(_row("concrete_channel", self.concrete_channel, self._PRESENT_VALUES["concrete_channel"]))
        rows.append(_row("flow_condition", self.flow_condition, self._PRESENT_VALUES["flow_condition"]))
        return rows


# Fields the model is expected to return (provenance is filled in by the
# detector, not by the model itself).
LAYER_B_MODEL_FIELDS = (
    "turbidity",
    "debris",
    "algal_bloom",
    "riparian_vegetation",
    "concrete_channel",
    "flow_condition",
)
