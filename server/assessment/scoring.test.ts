import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCefr, scoreRound, type ScoringQuestion } from './scoring.ts';

test('scores options and unknown answers mechanically by category', () => {
  const result = scoreRound(3, [
    question('vocabulary', 'B2', 'A', 'A'),
    question('vocabulary', 'C1', 'B', 'A'),
    question('idiom', 'B2', 'C', null, true),
    question('grammar', 'B2', 'D', 'D'),
    question('grammar', 'C1', 'A', 'A'),
  ]);

  assert.equal(result.correct, 3);
  assert.equal(result.unknown, 1);
  assert.deepEqual(
    result.categories.map(({ category, correct, total, unknown }) => ({
      category,
      correct,
      total,
      unknown,
    })),
    [
      { category: 'vocabulary', correct: 1, total: 2, unknown: 0 },
      { category: 'idiom', correct: 0, total: 1, unknown: 1 },
      { category: 'grammar', correct: 2, total: 2, unknown: 0 },
    ],
  );
});

test('later adaptive rounds have more influence on the CEFR estimate', () => {
  const questions = [
    ...Array.from({ length: 10 }, () =>
      question('vocabulary', 'A2', 'A', 'A', false, 1),
    ),
    ...Array.from({ length: 5 }, () =>
      question('grammar', 'B2', 'A', 'A', false, 3),
    ),
  ];

  assert.equal(estimateCefr(questions), 'B1');
});

function question(
  category: ScoringQuestion['category'],
  cefrLevel: ScoringQuestion['cefrLevel'],
  correctOptionId: ScoringQuestion['correctOptionId'],
  selectedOptionId: ScoringQuestion['selectedOptionId'],
  isUnknown = false,
  round: 1 | 2 | 3 = 3,
): ScoringQuestion {
  return {
    round,
    category,
    cefrLevel,
    difficultyRank: 5,
    learningPoint: `${category} target`,
    correctOptionId,
    selectedOptionId,
    isUnknown,
  };
}
