import {
  assessmentBatchSchema,
  assessmentCategories,
  expectedQuestionCount,
  roundBlueprint,
  type AssessmentBatch,
} from '../../shared/assessment/contracts.ts';

export type BatchValidationResult =
  | { success: true; data: AssessmentBatch }
  | { success: false; issues: string[] };

export function parseAndValidateBatch(
  rawResponse: string,
  expectedRound: 1 | 2 | 3,
): BatchValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(rawResponse);
  } catch (error) {
    return {
      success: false,
      issues: [
        `The response is not valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`,
      ],
    };
  }

  const parsed = assessmentBatchSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      }),
    };
  }

  const issues: string[] = [];
  const batch = parsed.data;
  if (batch.round !== expectedRound) {
    issues.push(`round must be ${expectedRound}, received ${batch.round}`);
  }

  const expectedCount = expectedQuestionCount(expectedRound);
  if (batch.questions.length !== expectedCount) {
    issues.push(
      `questions must contain exactly ${expectedCount} items, received ${batch.questions.length}`,
    );
  }

  const identifiers = new Set<string>();
  for (const [index, question] of batch.questions.entries()) {
    if (identifiers.has(question.id)) {
      issues.push(`questions.${index}.id duplicates ${question.id}`);
    }
    identifiers.add(question.id);

    if ((question.stem.match(/_____/g) ?? []).length !== 1) {
      issues.push(
        `questions.${index}.stem must contain the blank marker _____ exactly once`,
      );
    }

    const expectedOptionIds = ['A', 'B', 'C', 'D'];
    const actualOptionIds = question.options.map((option) => option.id);
    if (
      actualOptionIds.some(
        (id, optionIndex) => id !== expectedOptionIds[optionIndex],
      )
    ) {
      issues.push(`questions.${index}.options must be ordered A, B, C, D`);
    }

    const optionTexts = new Set(
      question.options.map((option) => option.text.trim().toLowerCase()),
    );
    if (optionTexts.size !== 4) {
      issues.push(`questions.${index}.options must have unique text`);
    }
  }

  for (const category of assessmentCategories) {
    const categoryQuestions = batch.questions.filter(
      (question) => question.category === category,
    );
    const expectedCategoryCount = roundBlueprint[expectedRound][category];
    if (categoryQuestions.length !== expectedCategoryCount) {
      issues.push(
        `${category} must contain ${expectedCategoryCount} question(s), received ${categoryQuestions.length}`,
      );
    }

    for (let index = 1; index < categoryQuestions.length; index += 1) {
      const previous = categoryQuestions[index - 1];
      const current = categoryQuestions[index];
      if (
        previous &&
        current &&
        current.difficultyRank <= previous.difficultyRank
      ) {
        issues.push(
          `${category} difficultyRank must strictly increase in presentation order`,
        );
        break;
      }
    }
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: batch };
}
