import asyncio
import json

from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.schemas.base import AIEvidence


def evidence(indicator: str, confidence: float = 0.9) -> AIEvidence:
    return AIEvidence(
        indicator=indicator,
        present=True,
        confidence=confidence,
        reasoning=f"Detected {indicator}",
    )


def assert_valid(questions):
    assert 3 <= len(questions) <= 5
    assert not AdaptiveQuestionGenerator.validate_questions(questions)
    assert len({question.question for question in questions}) == len(questions)
    assert all(question.evidence_basis for question in questions)
    assert all(question.type == "single_choice" for question in questions)


def test_algal_bloom_questions_are_adaptive_and_sequential():
    questions = AdaptiveQuestionGenerator().generate_questions([evidence("algal_bloom")])

    assert_valid(questions)
    assert [question.id for question in questions] == [
        "algae_smell", "algae_duration", "algae_dead_animals"
    ]
    assert all(question.evidence_basis == ["algal_bloom"] for question in questions)


def test_debris_questions_use_only_debris_concepts():
    questions = AdaptiveQuestionGenerator().generate_questions([evidence("debris")])

    assert_valid(questions)
    assert [question.id for question in questions] == [
        "debris_type", "debris_amount", "debris_duration"
    ]
    assert all("turbid" not in question.question.lower() for question in questions)


def test_mixed_evidence_is_capped_at_five_and_prioritized_by_confidence():
    questions = AdaptiveQuestionGenerator().generate_questions([
        evidence("turbidity", 0.95),
        evidence("algal_bloom", 0.80),
        evidence("debris", 0.70),
    ])

    assert_valid(questions)
    assert len(questions) == 5
    assert [question.id for question in questions[:3]] == [
        "turbidity_appearance", "turbidity_duration", "turbidity_change"
    ]


class InvalidThenValidProvider:
    def __init__(self):
        self.calls = 0

    async def generate_text(self, prompt: str) -> str:
        self.calls += 1
        if self.calls == 1:
            return json.dumps([
                {
                    "id": "bad",
                    "question": "Can you diagnose a disease with a laboratory test?",
                    "type": "single_choice",
                    "options": ["Yes"],
                    "evidence_basis": [],
                    "priority": 1,
                    "required": True,
                }
            ])
        return "not-json"


def test_invalid_llm_output_retries_once_then_falls_back():
    provider = InvalidThenValidProvider()
    questions = asyncio.run(AdaptiveQuestionGenerator(provider).generate_questions_async([
        evidence("turbidity")
    ]))

    assert provider.calls == 2
    assert_valid(questions)
    assert questions[0].id == "turbidity_appearance"
