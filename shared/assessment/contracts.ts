import { z } from 'zod';

export const assessmentModes = ['live', 'dry-run'] as const;
export const assessmentModeSchema = z.enum(assessmentModes);
export type AssessmentMode = z.infer<typeof assessmentModeSchema>;

export const assessmentCategories = ['vocabulary', 'idiom', 'grammar'] as const;
export const assessmentCategorySchema = z.enum(assessmentCategories);
export type AssessmentCategory = z.infer<typeof assessmentCategorySchema>;

export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const cefrLevelSchema = z.enum(cefrLevels);

export const eikenGrades = ['5', '4', '3', 'pre-2', '2', 'pre-1', '1'] as const;

export const learnerProfileSchema = z.object({
  selfAssessment: z.string().trim().min(20).max(4000),
  eikenGrade: z.enum(eikenGrades).nullable(),
  toeicScore: z.number().int().min(10).max(990).nullable(),
});
export type LearnerProfile = z.infer<typeof learnerProfileSchema>;

export const optionIdSchema = z.enum(['A', 'B', 'C', 'D']);

export const assessmentOptionSchema = z.object({
  id: optionIdSchema,
  text: z.string().trim().min(1).max(240),
});

export const assessmentQuestionSchema = z.object({
  id: z.string().regex(/^q-[1-9][0-9]*$/),
  category: assessmentCategorySchema,
  cefrLevel: cefrLevelSchema,
  difficultyRank: z.number().int().min(1).max(10),
  stem: z.string().trim().min(8).max(500),
  options: z.array(assessmentOptionSchema).length(4),
  correctOptionId: optionIdSchema,
  explanationJa: z.string().trim().min(10).max(1000),
  learningPoint: z.string().trim().min(2).max(240),
});
export type AssessmentQuestion = z.infer<typeof assessmentQuestionSchema>;

export const publicAssessmentQuestionSchema = assessmentQuestionSchema.pick({
  id: true,
  category: true,
  stem: true,
  options: true,
});
export type PublicAssessmentQuestion = z.infer<
  typeof publicAssessmentQuestionSchema
>;

export const answerSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), optionId: optionIdSchema }),
  z.object({ kind: z.literal('unknown') }),
]);
export type AnswerSelection = z.infer<typeof answerSelectionSchema>;

export const assessmentBatchSchema = z.object({
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  calibrationSummary: z.string().trim().min(10).max(1200),
  questions: z.array(assessmentQuestionSchema).min(5).max(10),
});
export type AssessmentBatch = z.infer<typeof assessmentBatchSchema>;

export const categoryResultSchema = z.object({
  category: assessmentCategorySchema,
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  unknown: z.number().int().nonnegative(),
});

export const previousRoundResultSchema = z.object({
  round: z.union([z.literal(1), z.literal(2)]),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  unknown: z.number().int().nonnegative(),
  categories: z.array(categoryResultSchema).length(3),
  observedStrengths: z.array(z.string().trim().min(1).max(240)).max(6),
  observedWeaknesses: z.array(z.string().trim().min(1).max(240)).max(6),
});
export type PreviousRoundResult = z.infer<typeof previousRoundResultSchema>;

export const generateRoundRequestSchema = z
  .object({
    round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    threadId: z.string().min(1).nullable(),
    profile: learnerProfileSchema,
    canonicalPersona: z.record(z.string(), z.unknown()).nullable(),
    previousResults: z.array(previousRoundResultSchema).max(2),
  })
  .superRefine((value, context) => {
    const expectedPreviousRounds = value.round - 1;
    if (value.previousResults.length !== expectedPreviousRounds) {
      context.addIssue({
        code: 'custom',
        path: ['previousResults'],
        message: `Round ${value.round} requires ${expectedPreviousRounds} previous result(s).`,
      });
    }
    if (value.round > 1 && value.threadId === null) {
      context.addIssue({
        code: 'custom',
        path: ['threadId'],
        message: `Round ${value.round} must resume its assessment thread.`,
      });
    }
  });
export type GenerateRoundRequest = z.infer<typeof generateRoundRequestSchema>;

export const generateRoundResponseSchema = z.object({
  threadId: z.string().min(1),
  repairCount: z.number().int().nonnegative(),
  batch: z.object({
    round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    questions: z.array(publicAssessmentQuestionSchema).min(5).max(10),
  }),
});
export type GenerateRoundResponse = z.infer<typeof generateRoundResponseSchema>;

export const startAssessmentRequestSchema = z.object({
  profile: learnerProfileSchema,
});

export const saveAnswerRequestSchema = z.object({
  answer: answerSelectionSchema,
});

export const roundSummarySchema = z.object({
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  unknown: z.number().int().nonnegative(),
  categories: z.array(categoryResultSchema).length(3),
});
export type RoundSummary = z.infer<typeof roundSummarySchema>;

export const assessmentStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_started') }),
  z.object({
    status: z.literal('generating'),
    attemptId: z.string().uuid(),
    round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.object({
    status: z.literal('answering'),
    attemptId: z.string().uuid(),
    round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    questions: z.array(
      publicAssessmentQuestionSchema.extend({
        answer: answerSelectionSchema.nullable(),
      }),
    ),
    completedRounds: z.array(roundSummarySchema),
  }),
  z.object({
    status: z.literal('failed'),
    attemptId: z.string().uuid(),
    round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    retryable: z.boolean(),
    message: z.string(),
  }),
  z.object({
    status: z.literal('completed'),
    attemptId: z.string().uuid(),
    estimatedCefr: cefrLevelSchema,
    correct: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    unknown: z.number().int().nonnegative(),
    completedRounds: z.array(roundSummarySchema).length(3),
  }),
]);
export type AssessmentState = z.infer<typeof assessmentStateSchema>;

export const assessmentSnapshotSchema = z.object({
  mode: assessmentModeSchema,
  state: assessmentStateSchema,
});
export type AssessmentSnapshot = z.infer<typeof assessmentSnapshotSchema>;

export const roundBlueprint = {
  1: { vocabulary: 4, idiom: 3, grammar: 3 },
  2: { vocabulary: 4, idiom: 3, grammar: 3 },
  3: { vocabulary: 2, idiom: 1, grammar: 2 },
} as const satisfies Record<1 | 2 | 3, Record<AssessmentCategory, number>>;

export function expectedQuestionCount(round: 1 | 2 | 3): number {
  return Object.values(roundBlueprint[round]).reduce(
    (total, count) => total + count,
    0,
  );
}
