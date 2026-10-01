from typing import List, Dict, Any, Optional
from ai.schemas.base import AIEvidence
from ai.schemas.layer_d import ConsistencyResult, ConsistencyStatus

class CrossValidator:
    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    @staticmethod
    def _normalise_answers(citizen_answers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map the various citizen-answer vocabularies onto the canonical keys the
        deterministic rules use (water_clarity, water_flow, debris, smell).

        Sources reconciled:
          - Layer C answer IDs: turbidity_appearance, debris_type/amount, algae_smell
          - Shared contract envObservations: waterClarity, flowRate, debris, odour
          - Already-canonical keys pass through unchanged.

        The original keys are preserved; canonical keys are only *added* when not
        already present, so explicit canonical answers always win.
        """
        merged: Dict[str, Any] = dict(citizen_answers)

        # id/source key  →  canonical key
        alias_map = {
            "turbidity_appearance": "water_clarity",
            "waterclarity": "water_clarity",
            "flowrate": "water_flow",
            "flow_estimate": "water_flow",
            "debris_amount": "debris",
            "debris_type": "debris",
            "odour": "smell",
            "odor": "smell",
            "algae_smell": "smell",
        }
        for src, canonical in alias_map.items():
            # match case-insensitively against provided keys
            for key in citizen_answers:
                if key.lower() == src and canonical not in merged:
                    merged[canonical] = citizen_answers[key]
                    break
        return merged

    def validate_consistency(
        self, 
        evidence: List[AIEvidence], 
        citizen_answers: Dict[str, Any],
        historical_baseline: Optional[Dict[str, Any]] = None
    ) -> ConsistencyResult:
        """
        Validate consistency between AI evidence, citizen answers, and historical data.
        Citizen answers are first normalised so Layer C answer IDs and the shared
        envObservations vocabulary map onto the rule keys.
        """
        citizen_answers = self._normalise_answers(citizen_answers or {})
        conflicts = []
        supporting_evidence = []
        major_conflict = False
        minor_conflict = False
        
        # Determine conflicts and support deterministically
        for ev in evidence:
            indicator = ev.indicator.lower()
            present = ev.present
            reasoning = ev.reasoning.lower()
            
            if indicator == "turbidity" and "water_clarity" in citizen_answers:
                c_val = str(citizen_answers["water_clarity"]).lower()
                if "clear" in c_val and "opaque" in reasoning:
                    major_conflict = True
                    conflicts.append("Citizen says clear but AI says opaque")
                elif "clear" in c_val and not present:
                    supporting_evidence.append("Both indicate clear water")
                    
            if indicator == "water_flow" and "water_flow" in citizen_answers:
                c_val = str(citizen_answers["water_flow"]).lower()
                if "dry" in c_val and ("flowing" in reasoning or present):
                    major_conflict = True
                    conflicts.append("Citizen says dry but image evidence indicates flowing water")
                    
            if indicator == "debris" and "debris" in citizen_answers:
                c_val = str(citizen_answers["debris"]).lower()
                if c_val in ["none", "no debris", "false", "no"]:
                    if present and "substantial" in reasoning:
                        major_conflict = True
                        conflicts.append("Citizen denies visible debris when substantial debris is detected")
                    elif present:
                        minor_conflict = True
                        conflicts.append("Citizen says no debris but some is detected")
                elif "little" in c_val or "some" in c_val:
                    if "moderate" in reasoning:
                        minor_conflict = True
                        conflicts.append("Minor disagreement on debris amount (citizen: a little, AI: moderate)")
                    elif "substantial" in reasoning:
                        major_conflict = True
                        conflicts.append("Citizen says a little debris but substantial debris is detected")
                        
            if indicator == "algal_bloom" and "smell" in citizen_answers:
                c_val = str(citizen_answers["smell"]).lower()
                if "strong" in c_val and present:
                    supporting_evidence.append("Citizen reported strong smell, AI detected algal bloom (potentially consistent, do not claim causality).")
        
        # Missing citizen answers?
        if not citizen_answers and evidence:
            # Can't compare much
            pass

        # Handle historical baseline
        hist_comparison = "unavailable"
        if historical_baseline:
            hist_comparison = {}
            for k, v in historical_baseline.items():
                if k in citizen_answers:
                    if str(citizen_answers[k]).lower() != str(v).lower():
                        hist_comparison[k] = f"diverges from baseline ({v})"
                    else:
                        hist_comparison[k] = "matches baseline"

        # Arbitration logic (LLM could be used here if needed, but deterministic rules override)
        # We check the highest severity
        if major_conflict:
            status = ConsistencyStatus.MAJOR_CONFLICT
            score = 30
            requires_review = True
        elif minor_conflict:
            status = ConsistencyStatus.MINOR_CONFLICT
            score = 70
            requires_review = False
        else:
            status = ConsistencyStatus.CONSISTENT
            score = 100
            requires_review = False
            
        explanation = f"Cross-validation completed with status {status.value}."
        if conflicts:
            explanation += " Discrepancies found."
        elif supporting_evidence:
            explanation += " Evidence is consistent."

        return ConsistencyResult(
            status=status,
            score=score,
            conflicts=conflicts,
            supporting_evidence=supporting_evidence,
            historical_comparison=hist_comparison,
            explanation=explanation,
            requires_review=requires_review
        )

