import {
  assessmentCategories,
  cefrLevels,
  type AssessmentCategory,
  type PreviousRoundResult,
  type RoundSummary,
} from '../../shared/assessment/contracts.ts';

export type ScoringQuestion = {
  round: 1 | 2 | 3;
  category: AssessmentCategory;
  cefrLevel: (typeof cefrLevels)[number];
  difficultyRank: number;
  learningPoint: string;
  correctOptionId: 'A' | 'B' | 'C' | 'D';
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  isUnknown: boolean;
};

export type ScoredRound = RoundSummary & {
  observedStrengths: string[];
  observedWeaknesses: string[];
};

export function scoreRound(
  round: 1 | 2 | 3,
  questions: readonly ScoringQuestion[],
): ScoredRound {
  const correctQuestions = questions.filter(isCorrect);
  const categories = assessmentCategories.map((category) => {
    const inCategory = questions.filter(
      (question) => question.category === category,
    );
    return {
      category,
      correct: inCategory.filter(isCorrect).length,
      total: inCategory.length,
      unknown: inCategory.filter((question) => question.isUnknown).length,
    };
  });

  const observedStrengths = categories
    .filter((result) => result.correct / result.total >= 2 / 3)
    .map(
      (result) =>
        `${humanizeCategory(result.category)}: ${result.correct}/${result.total} correct`,
    );
  const observedWeaknesses = questions
    .filter((question) => !isCorrect(question))
    .sort((left, right) => right.difficultyRank - left.difficultyRank)
    .map((question) => question.learningPoint)
    .filter((point, index, points) => points.indexOf(point) === index)
    .slice(0, 6);

  return {
    round,
    correct: correctQuestions.length,
    total: questions.length,
    unknown: questions.filter((question) => question.isUnknown).length,
    categories,
    observedStrengths,
    observedWeaknesses,
  };
}

export function toPreviousRoundResult(
  result: ScoredRound,
): PreviousRoundResult {
  if (result.round === 3) {
    throw new Error('Round 3 cannot be used as a previous adaptive round.');
  }
  return {
    round: result.round,
    correct: result.correct,
    total: result.total,
    unknown: result.unknown,
    categories: result.categories,
    observedStrengths: result.observedStrengths,
    observedWeaknesses: result.observedWeaknesses,
  };
}

export function estimateCefr(
  questions: readonly ScoringQuestion[],
): (typeof cefrLevels)[number] {
  if (questions.length === 0) return 'A1';

  let weightedEvidence = 0;
  let totalWeight = 0;
  for (const question of questions) {
    const level = cefrLevels.indexOf(question.cefrLevel);
    const roundWeight = [0, 0.7, 1.15, 1.6][question.round] ?? 1;
    const answerAdjustment = isCorrect(question) ? 0.35 : -0.55;
    weightedEvidence += (level + answerAdjustment) * roundWeight;
    totalWeight += roundWeight;
  }

  const estimatedIndex = Math.max(
    0,
    Math.min(cefrLevels.length - 1, Math.round(weightedEvidence / totalWeight)),
  );
  return cefrLevels[estimatedIndex] ?? 'A1';
}

function isCorrect(question: ScoringQuestion): boolean {
  return (
    !question.isUnknown &&
    question.selectedOptionId === question.correctOptionId
  );
}

function humanizeCategory(category: AssessmentCategory): string {
  switch (category) {
    case 'vocabulary':
      return 'Vocabulary';
    case 'idiom':
      return 'Idioms';
    case 'grammar':
      return 'Grammar';
  }
}
