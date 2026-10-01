import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ai.schemas.base import AIEvidence, FollowUpQuestion
from ai.safety.pii import redact


QUESTION_RULES: Dict[str, Tuple[int, str, str, List[str]]] = {
    # ── Algal bloom ────────────────────────────────────────────────────────
    "algal_bloom": (1, "algae_smell", "Does the water have an unusual smell?", ["No unusual smell", "Earthy or plant-like", "Chemical or sewage-like", "Not sure"]),
    "algal_bloom_duration": (2, "algae_duration", "How long has the water looked this colour?", ["Less than a day", "1-7 days", "More than a week", "Not sure"]),
    "algal_bloom_animals": (3, "algae_dead_animals", "Have you seen any dead fish or animals nearby?", ["No", "Yes", "Not sure"]),
    # ── Debris / litter ───────────────────────────────────────────────────
    "debris_type": (1, "debris_type", "What type of litter or material is most common?", ["Leaves or plants", "Plastic or packaging", "Foam or oily material", "Other", "Not sure"]),
    "debris_amount": (2, "debris_amount", "Approximately how much debris is present?", ["A few pieces", "Several pieces", "Covers much of the area", "Not sure"]),
    "debris_duration": (3, "debris_duration", "Is this the first time you have seen debris here?", ["Yes", "No", "Not sure"]),
    # ── Turbidity / water clarity ─────────────────────────────────────────
    "turbidity_appearance": (1, "turbidity_appearance", "How would you describe the water's appearance?", ["Clear", "Slightly cloudy", "Very murky", "Not sure"]),
    "turbidity_duration": (2, "turbidity_duration", "How long has the water looked this cloudy?", ["Less than a day", "1-7 days", "More than a week", "Not sure"]),
    "turbidity_change": (3, "turbidity_change", "Is this cloudiness different from what is normal here?", ["No, it is usual", "Yes, it is more cloudy", "Yes, it is less cloudy", "Not sure"]),
    # ── Foam presence ─────────────────────────────────────────────────────
    "foam_location": (1, "foam_location", "Where is the foam or froth concentrated?", ["Along the banks", "In the middle of the stream", "Everywhere on the surface", "Not sure"]),
    "foam_duration": (2, "foam_duration", "How long has the foam been visible?", ["Just appeared", "Less than a day", "Several days", "Not sure"]),
    "foam_smell": (3, "foam_smell", "Does the foam have a noticeable smell?", ["No smell", "Mild earthy smell", "Strong chemical smell", "Not sure"]),
    # ── Water colour anomaly (brown / orange / grey) ───────────────────────
    "colour_description": (1, "colour_description", "What colour does the water appear?", ["Brown or muddy", "Orange or rust-coloured", "Grey or silvery", "Other unusual colour", "Not sure"]),
    "colour_duration": (2, "colour_duration", "How long has the water looked this colour?", ["Less than a day", "1-7 days", "More than a week", "Not sure"]),
    "colour_change": (3, "colour_change", "Has the colour changed compared to how this stream normally looks?", ["It always looks this way", "Yes, it changed recently", "Not sure"]),
    # ── Flow condition (stagnant / dry) ───────────────────────────────────
    "flow_recent_rain": (1, "flow_recent_rain", "Has there been heavy rain in the area recently?", ["Yes, in the last 24 hours", "Yes, in the last week", "No recent rain", "Not sure"]),
    "flow_normal": (2, "flow_normal", "Is the flow level normal for this time of year?", ["Yes, normal", "Lower than usual", "Higher than usual", "Not sure"]),
    "flow_blockage": (3, "flow_blockage", "Can you see anything that might be blocking or diverting the water?", ["No visible blockage", "Yes, a natural blockage", "Yes, a man-made structure", "Not sure"]),
    # ── Concrete channel ─────────────────────────────────────────────────
    "channel_condition": (1, "channel_condition", "Does the concrete channel look damaged or leaking?", ["No, it looks intact", "Yes, there are cracks", "Yes, there is water seeping", "Not sure"]),
    "channel_litter": (2, "channel_litter", "Is litter or waste trapped in the channel?", ["No litter", "A small amount", "A lot of litter", "Not sure"]),
    "channel_access": (3, "channel_access", "Is there easy public access to this part of the channel?", ["Yes, very accessible", "Partially accessible", "No, fenced off", "Not sure"]),
    # ── Natural channel ───────────────────────────────────────────────────
    "natural_bank_erosion": (1, "natural_bank_erosion", "Do the banks look eroded or collapsing?", ["No erosion visible", "Some erosion", "Heavy erosion", "Not sure"]),
    "natural_bank_vegetation": (2, "natural_bank_vegetation", "Is there vegetation on the banks that looks damaged?", ["Banks look healthy", "Some damage", "Significant damage", "Not sure"]),
    "natural_bank_trampling": (3, "natural_bank_trampling", "Do you see signs of people or animals walking along the banks?", ["No visible tracks", "Light use", "Heavy use", "Not sure"]),
    # ── Riparian vegetation (sparse / absent) ─────────────────────────────
    "vegetation_coverage": (1, "vegetation_coverage", "How much of the bank area has plant coverage?", ["Most of the bank", "About half", "Very little or none", "Not sure"]),
    "vegetation_condition": (2, "vegetation_condition", "Does the remaining vegetation look healthy?", ["Yes, healthy and green", "Some yellowing or dying", "Mostly dead or brown", "Not sure"]),
    "vegetation_cause": (3, "vegetation_cause", "Is there anything that might have removed the vegetation recently?", ["No obvious cause", "Looks like it was cleared", "Looks like it dried out", "Not sure"]),
}

RULE_GROUPS = {
    # Algal bloom (and spelling variant)
    "algal_bloom": ["algal_bloom", "algal_bloom_duration", "algal_bloom_animals"],
    "algae_bloom": ["algal_bloom", "algal_bloom_duration", "algal_bloom_animals"],
    # Debris / litter (and variant)
    "debris": ["debris_type", "debris_amount", "debris_duration"],
    "floating_debris": ["debris_type", "debris_amount", "debris_duration"],
    # Turbidity
    "turbidity": ["turbidity_appearance", "turbidity_duration", "turbidity_change"],
    # Foam
    "foam_presence": ["foam_location", "foam_duration", "foam_smell"],
    # Water colour anomaly
    "water_color_anomaly": ["colour_description", "colour_duration", "colour_change"],
    # Flow condition (stagnant / dry / flowing all map here)
    "flow_condition": ["flow_recent_rain", "flow_normal", "flow_blockage"],
    "low_water_flow": ["flow_recent_rain", "flow_normal", "flow_blockage"],
    # Concrete channel
    "concrete_channel": ["channel_condition", "channel_litter", "channel_access"],
    # Natural channel
    "natural_channel": ["natural_bank_erosion", "natural_bank_vegetation", "natural_bank_trampling"],
    # Riparian vegetation (sparse / absent)
    "riparian_vegetation": ["vegetation_coverage", "vegetation_condition", "vegetation_cause"],
}



class AdaptiveQuestionGenerator:
    def __init__(self, provider: Optional[Any] = None):
        self.provider = provider

    def _question_plan(self, evidence: Sequence[AIEvidence]) -> List[str]:
        active = [item for item in evidence if item.present and item.confidence >= 0.6]
        active.sort(key=lambda item: item.confidence, reverse=True)
        selected: List[str] = []
        for item in active:
            for rule_id in RULE_GROUPS.get(item.indicator.lower(), []):
                if rule_id not in selected:
                    selected.append(rule_id)
                if len(selected) == 5:
                    return selected
        return selected

    def _deterministic_questions(self, evidence: Sequence[AIEvidence]) -> List[FollowUpQuestion]:
        basis_by_rule: Dict[str, List[str]] = {}
        for item in evidence:
            if item.present and item.confidence >= 0.6:
                for rule_id in RULE_GROUPS.get(item.indicator.lower(), []):
                    basis_by_rule.setdefault(rule_id, []).append(item.indicator)
        questions = []
        for sequence, rule_id in enumerate(self._question_plan(evidence), start=1):
            _, question_id, text, options = QUESTION_RULES[rule_id]
            questions.append(FollowUpQuestion(
                id=question_id,
                question=text,
                options=options,
                evidence_basis=sorted(set(basis_by_rule[rule_id])),
                priority=sequence,
                required=sequence == 1,
            ))
        return questions

    @staticmethod
    def validate_questions(questions: Sequence[FollowUpQuestion]) -> List[str]:
        failures: List[str] = []
        if not 3 <= len(questions) <= 5:
            failures.append("question count must be between 3 and 5")
        priorities = [question.priority for question in questions]
        if priorities != sorted(priorities):
            failures.append("questions must be in priority order")
        seen = set()
        for question in questions:
            normalized = question.question.strip().lower()
            if normalized in seen:
                failures.append("duplicate question")
            seen.add(normalized)
            if not question.evidence_basis:
                failures.append(f"{question.id} has no evidence basis")
            if question.type != "single_choice" or not question.options:
                failures.append(f"{question.id} must use bounded choices")
            lowered = question.question.lower()
            if any(term in lowered for term in ("diagnose", "disease", "laboratory", "test the water")):
                failures.append(f"{question.id} contains unsupported medical or equipment language")
        return failures

    def generate_questions(self, evidence: List[AIEvidence], citizen_notes: Optional[str] = None) -> List[FollowUpQuestion]:
        return self._deterministic_questions(evidence)

    async def generate_questions_async(self, evidence: List[AIEvidence], citizen_notes: Optional[str] = None) -> List[FollowUpQuestion]:
        fallback = self._deterministic_questions(evidence)
        if self.provider is None or not fallback:
            return fallback
        allowed = [question.model_dump() for question in fallback]
        # Never expose PII to the provider: scrub citizen free-text notes.
        safe_notes = redact(citizen_notes or "").text
        prompt = json.dumps({"allowed_questions": allowed, "citizen_notes": safe_notes})
        for _ in range(2):
            try:
                raw = await self.provider.generate_text(
                    "Rewrite only the allowed questions in plain language. Return a JSON array and preserve every field. " + prompt
                )
                generated = [FollowUpQuestion.model_validate(item) for item in json.loads(raw)]
                allowed_ids = {question.id for question in fallback}
                fallback_by_id = {question.id: question for question in fallback}
                preserves_rules = (
                    {item.id for item in generated} == allowed_ids
                    and all(
                        set(item.evidence_basis) == set(fallback_by_id[item.id].evidence_basis)
                        and item.priority == fallback_by_id[item.id].priority
                        and item.options == fallback_by_id[item.id].options
                        for item in generated
                    )
                )
                if not self.validate_questions(generated) and preserves_rules:
                    return generated
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
        return fallback
