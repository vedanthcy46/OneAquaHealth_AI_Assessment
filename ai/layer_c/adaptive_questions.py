import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ai.schemas.base import AIEvidence, FollowUpQuestion


QUESTION_RULES: Dict[str, Tuple[int, str, str, List[str]]] = {
    "algal_bloom": (1, "algae_smell", "Does the water have an unusual smell?", ["No unusual smell", "Earthy or plant-like", "Chemical or sewage-like", "Not sure"]),
    "algal_bloom_duration": (2, "algae_duration", "How long has the water looked this colour?", ["Less than a day", "1-7 days", "More than a week", "Not sure"]),
    "algal_bloom_animals": (3, "algae_dead_animals", "Have you seen any dead fish or animals nearby?", ["No", "Yes", "Not sure"]),
    "debris_type": (1, "debris_type", "What type of litter or material is most common?", ["Leaves or plants", "Plastic or packaging", "Foam or oily material", "Other", "Not sure"]),
    "debris_amount": (2, "debris_amount", "Approximately how much debris is present?", ["A few pieces", "Several pieces", "Covers much of the area", "Not sure"]),
    "debris_duration": (3, "debris_duration", "Is this the first time you have seen debris here?", ["Yes", "No", "Not sure"]),
    "turbidity_appearance": (1, "turbidity_appearance", "How would you describe the water's appearance?", ["Clear", "Slightly cloudy", "Very murky", "Not sure"]),
    "turbidity_duration": (2, "turbidity_duration", "How long has the water looked this cloudy?", ["Less than a day", "1-7 days", "More than a week", "Not sure"]),
    "turbidity_change": (3, "turbidity_change", "Is this cloudiness different from what is normal here?", ["No, it is usual", "Yes, it is more cloudy", "Yes, it is less cloudy", "Not sure"]),
}

RULE_GROUPS = {
    "algal_bloom": ["algal_bloom", "algal_bloom_duration", "algal_bloom_animals"],
    "algae_bloom": ["algal_bloom", "algal_bloom_duration", "algal_bloom_animals"],
    "debris": ["debris_type", "debris_amount", "debris_duration"],
    "floating_debris": ["debris_type", "debris_amount", "debris_duration"],
    "turbidity": ["turbidity_appearance", "turbidity_duration", "turbidity_change"],
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
        prompt = json.dumps({"allowed_questions": allowed, "citizen_notes": citizen_notes or ""})
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
