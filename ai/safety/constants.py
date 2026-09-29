"""
Central safety constants for the AquaGuard AI pipeline.

Keeping these in one place ensures every layer routes and degrades the same
way, and that the "cannot safely assess → REVIEW_REQUIRED" rule is enforced
consistently.
"""

from __future__ import annotations

# The single routing decision used whenever a safe AI assessment cannot be
# completed. AI failure must NEVER silently produce a normal VALID result.
REVIEW_REQUIRED = "REVIEW_REQUIRED"

# Routing values considered "safe to trust without a human".
VALID_ROUTINGS = frozenset({"VALID_HIGH", "VALID_MODERATE", "VALID"})

# Placeholder value used everywhere evidence is insufficient.
UNKNOWN = "unknown"
