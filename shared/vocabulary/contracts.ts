import { z } from 'zod';

export const vocabularyKinds = ['word', 'idiom'] as const;
export const vocabularyKindSchema = z.enum(vocabularyKinds);
export type VocabularyKind = z.infer<typeof vocabularyKindSchema>;

export const vocabularyRatings = [
  'mastered',
  'mostly_known',
  'mostly_unknown',
  'unknown',
] as const;
export const vocabularyRatingSchema = z.enum(vocabularyRatings);
export type VocabularyRating = z.infer<typeof vocabularyRatingSchema>;

export const vocabularyCheckModes = ['continue', 'restart', 'recheck'] as const;
export const vocabularyCheckModeSchema = z.enum(vocabularyCheckModes);
export type VocabularyCheckMode = z.infer<typeof vocabularyCheckModeSchema>;

export const vocabularyCountSchema = z.object({
  total: z.number().int().nonnegative(),
  classified: z.number().int().nonnegative(),
  unclassified: z.number().int().nonnegative(),
  mastered: z.number().int().nonnegative(),
  mostlyKnown: z.number().int().nonnegative(),
  mostlyUnknown: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type VocabularyCount = z.infer<typeof vocabularyCountSchema>;

export const resumableVocabularySessionSchema = z.object({
  id: z.string().uuid(),
  kind: vocabularyKindSchema,
  mode: vocabularyCheckModeSchema,
  position: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});

export const vocabularyOverviewSchema = z.object({
  words: vocabularyCountSchema,
  idioms: vocabularyCountSchema,
  lastCheckedAt: z.string().datetime({ offset: true }).nullable(),
  resumableSessions: z.array(resumableVocabularySessionSchema).max(2),
});
export type VocabularyOverview = z.infer<typeof vocabularyOverviewSchema>;

export const vocabularyCardSchema = z.object({
  id: z.number().int().positive(),
  kind: vocabularyKindSchema,
  sourceOrder: z.number().int().positive(),
  term: z.string().min(1).max(300),
  meaningJa: z.string().min(1).max(2400),
  section: z.number().int().min(1).max(19).nullable(),
  part: z.number().int().min(1).max(3).nullable(),
  currentRating: vocabularyRatingSchema.nullable(),
});
export type VocabularyCard = z.infer<typeof vocabularyCardSchema>;

export const vocabularySessionSchema = z.object({
  id: z.string().uuid(),
  kind: vocabularyKindSchema,
  mode: vocabularyCheckModeSchema,
  status: z.enum(['active', 'paused']),
  position: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  windowStart: z.number().int().nonnegative(),
  cards: z.array(vocabularyCardSchema).max(100),
  sessionCounts: z.object({
    mastered: z.number().int().nonnegative(),
    mostlyKnown: z.number().int().nonnegative(),
    mostlyUnknown: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
});
export type VocabularySession = z.infer<typeof vocabularySessionSchema>;

export const startVocabularySessionResultSchema = z.discriminatedUnion(
  'outcome',
  [
    z.object({
      outcome: z.literal('session'),
      session: vocabularySessionSchema,
    }),
    z.object({ outcome: z.literal('completed') }),
  ],
);
export type StartVocabularySessionResult = z.infer<
  typeof startVocabularySessionResultSchema
>;

export const vocabularySessionConflictCodes = [
  'vocabulary_session_not_found',
  'vocabulary_session_not_resumable',
  'vocabulary_position_mismatch',
  'vocabulary_operation_out_of_order',
  'vocabulary_undo_out_of_order',
  'undo_target_not_found',
  'vocabulary_session_incomplete',
] as const;
export type VocabularySessionConflictCode =
  (typeof vocabularySessionConflictCodes)[number];

export function isVocabularySessionConflictCode(
  value: unknown,
): value is VocabularySessionConflictCode {
  return (
    typeof value === 'string' &&
    vocabularySessionConflictCodes.some((code) => code === value)
  );
}

export const startVocabularySessionRequestSchema = z
  .object({
    kind: vocabularyKindSchema,
    mode: vocabularyCheckModeSchema,
    skippedSections: z.array(z.number().int().min(1).max(19)).max(19),
    recheckRatings: z.array(vocabularyRatingSchema).max(4),
  })
  .superRefine((value, context) => {
    if (value.kind === 'idiom' && value.skippedSections.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['skippedSections'],
        message: 'Idioms do not have sections.',
      });
    }
    if (value.mode !== 'restart' && value.skippedSections.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['skippedSections'],
        message: 'Sections can only be skipped when starting over.',
      });
    }
    if (value.mode === 'recheck' && value.recheckRatings.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['recheckRatings'],
        message: 'Choose at least one rating to recheck.',
      });
    }
  });
export type StartVocabularySessionRequest = z.infer<
  typeof startVocabularySessionRequestSchema
>;

const classifyOperationSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('classify'),
  itemId: z.number().int().positive(),
  rating: vocabularyRatingSchema,
});

const undoOperationSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('undo'),
  itemId: z.number().int().positive(),
  targetOperationId: z.string().uuid(),
});

export const vocabularyOperationSchema = z.discriminatedUnion('action', [
  classifyOperationSchema,
  undoOperationSchema,
]);
export type VocabularyOperation = z.infer<typeof vocabularyOperationSchema>;

export const saveVocabularyOperationsRequestSchema = z.object({
  operations: z.array(vocabularyOperationSchema).min(1).max(100),
  position: z.number().int().nonnegative(),
});

export const finishVocabularySessionRequestSchema = z.object({
  status: z.enum(['paused', 'completed']),
  position: z.number().int().nonnegative(),
});
