"""
AIAudit — the safety/reliability provenance object attached to every
AquaGuard AI assessment.

This object is the single source of truth for WHAT the AI did, HOW it
degraded, and WHETHER a human must review the result. It is preserved on
every pipeline output (success, degraded, or failure) so nothing about an
AI run is ever silent.

Exact shape required by the safety spec:
{
    "model_used": "...",
    "fallback_used": true/false,
    "prompt_version": "...",
    "warnings": [],
    "errors": [],
    "degraded_mode": false,
    "human_review_required": false
}

Design rules enforced here:
  - Any error recorded → degraded_mode is forced True.
  - degraded_mode True → human_review_required is forced True.
  - A safe assessment that cannot be completed MUST route to REVIEW_REQUIRED
    (see ai.safety.constants.REVIEW_REQUIRED); the audit records why.
  - Human reviewer decisions always take precedence (see `human_override`).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AIAudit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_used: str = Field(
        "unknown", description="Concrete model that produced the result."
    )
    fallback_used: bool = Field(
        False, description="True if a fallback provider answered after primary failure."
    )
    prompt_version: str = Field(
        "unknown", description="Versioned prompt identifier used for the AI call."
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal safety concerns (e.g. a claim was downgraded to unknown).",
    )
    errors: List[str] = Field(
        default_factory=list,
        description="Fatal failures (provider outage, timeout, malformed output, etc.).",
    )
    degraded_mode: bool = Field(
        False,
        description="True when the pipeline ran in a reduced/safe mode (errors present "
                    "or a required layer could not run normally).",
    )
    human_review_required: bool = Field(
        False,
        description="True when a human MUST review before the result is trusted.",
    )

    # ── Provenance the spec requires us to preserve ──
    processing_timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="UTC ISO-8601 timestamp of when the assessment ran.",
    )
    confidence_score: Optional[float] = Field(
        None, description="Final confidence score (0–100) if one was produced."
    )
    routing_decision: Optional[str] = Field(
        None, description="Final routing decision for the observation."
    )
    conflicts: List[str] = Field(
        default_factory=list, description="Conflicts surfaced by cross-validation (Layer D)."
    )
    human_override: Optional[str] = Field(
        None,
        description="If a human reviewer overrides the AI, their decision is recorded "
                    "here and ALWAYS takes precedence over AI routing.",
    )

    # ── Mutation helpers (keep invariants centralised) ──

    def add_warning(self, message: str) -> None:
        if message and message not in self.warnings:
            self.warnings.append(message)

    def add_error(self, message: str) -> None:
        if message and message not in self.errors:
            self.errors.append(message)
        # Any error means we are degraded and a human must look.
        self.degraded_mode = True
        self.human_review_required = True

    def mark_degraded(self, reason: Optional[str] = None) -> None:
        self.degraded_mode = True
        self.human_review_required = True
        if reason:
            self.add_warning(reason)

    def require_human_review(self, reason: Optional[str] = None) -> None:
        self.human_review_required = True
        if reason:
            self.add_warning(reason)

    def apply_human_override(self, decision: str, routing: Optional[str] = None) -> None:
        """
        Record a human reviewer's decision. Human decisions ALWAYS take
        precedence: routing is replaced with the reviewer's routing and
        human_review_required is cleared (the human HAS reviewed).
        """
        self.human_override = decision
        if routing is not None:
            self.routing_decision = routing
        self.human_review_required = False

    @model_validator(mode="after")
    def _enforce_invariants(self) -> "AIAudit":
        # Errors imply degraded + human review.
        if self.errors:
            self.degraded_mode = True
            self.human_review_required = True
        # Degraded implies human review (unless a human already overrode).
        if self.degraded_mode and self.human_override is None:
            self.human_review_required = True
        return self
