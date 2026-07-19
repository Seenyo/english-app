import { z } from 'zod';
import {
  assessmentCategorySchema,
  cefrLevelSchema,
  eikenGrades,
  optionIdSchema,
} from '../assessment/contracts.ts';
import { vocabularyCountSchema } from '../vocabulary/contracts.ts';

const optionalNote = z.string().trim().max(1200);

export const personaUserAuthoredSchema = z.object({
  currentSelfDescription: z.string().trim().min(20).max(4000),
  goals: z.object({
    shortTerm: optionalNote,
    mediumTerm: optionalNote,
    longTerm: optionalNote,
  }),
  motivation: optionalNote,
  interests: z.array(z.string().trim().min(1).max(120)).max(12),
  studyPurpose: optionalNote,
  dailyStudyMinutes: z.number().int().min(0).max(1440).nullable(),
  preferredMethods: z.array(z.string().trim().min(1).max(120)).max(12),
  difficultMethods: z.array(z.string().trim().min(1).max(120)).max(12),
  correctionNote: optionalNote,
  eikenGrade: z.enum(eikenGrades).nullable(),
  toeicScore: z.number().int().min(10).max(990).nullable(),
});
export type PersonaUserAuthored = z.infer<typeof personaUserAuthoredSchema>;

export const personaSkillEstimateSchema = z.object({
  cefr: cefrLevelSchema,
  confidence: z.number().min(0).max(1),
  rationaleJa: z.string().trim().min(1).max(1200),
});

export const personaAiInferredSchema = z.object({
  summaryJa: z.string().trim().max(2400),
  skillEstimates: z
    .object({
      vocabulary: personaSkillEstimateSchema,
      idiom: personaSkillEstimateSchema,
      grammar: personaSkillEstimateSchema,
    })
    .nullable(),
  strengths: z.array(z.string().trim().min(1).max(400)).max(10),
  weaknesses: z.array(z.string().trim().min(1).max(400)).max(10),
  errorPatterns: z
    .array(
      z.object({
        patternJa: z.string().trim().min(1).max(600),
        evidenceQuestionKeys: z.array(z.string().trim().min(1).max(40)).max(25),
        recommendationJa: z.string().trim().min(1).max(600),
      }),
    )
    .max(10),
  recommendedFocus: z.array(z.string().trim().min(1).max(400)).max(10),
  evidenceSummaryJa: z.string().trim().max(2400),
});
export type PersonaAiInferred = z.infer<typeof personaAiInferredSchema>;

export const personaMetricsSchema = z.object({
  currentCefr: cefrLevelSchema.nullable(),
  assessmentsCompleted: z.number().int().nonnegative(),
  assessmentQuestionsAnswered: z.number().int().nonnegative(),
  learnedWords: z.number().int().nonnegative(),
  totalStudyMinutes: z.number().int().nonnegative(),
  lastAssessedAt: z.string().datetime().nullable(),
  lastActivityAt: z.string().datetime().nullable(),
  vocabularyCheck: z.object({
    words: vocabularyCountSchema,
    idioms: vocabularyCountSchema,
    lastCheckedAt: z.string().datetime().nullable(),
  }),
});
export type PersonaMetrics = z.infer<typeof personaMetricsSchema>;

export const learnerPersonaSchema = z.object({
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  initialSelfAssessment: z.string().min(20).max(4000),
  userAuthored: personaUserAuthoredSchema,
  aiInferred: personaAiInferredSchema,
  metrics: personaMetricsSchema,
  updatedAt: z.string().datetime(),
});
export type LearnerPersona = z.infer<typeof learnerPersonaSchema>;

export const analysisStatusSchema = z.enum([
  'not_started',
  'pending',
  'running',
  'ready',
  'failed',
  'unavailable',
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const reportQuestionSchema = z.object({
  key: z.string().min(1),
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  position: z.number().int().positive(),
  category: assessmentCategorySchema,
  cefrLevel: cefrLevelSchema,
  difficultyRank: z.number().int().min(1).max(10),
  stem: z.string(),
  options: z
    .array(z.object({ id: optionIdSchema, text: z.string() }))
    .length(4),
  selectedOptionId: optionIdSchema.nullable(),
  isUnknown: z.boolean(),
  correctOptionId: optionIdSchema,
  isCorrect: z.boolean(),
  explanationJa: z.string(),
  learningPoint: z.string(),
  diagnosticCommentJa: z.string(),
});

export const assessmentReportSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid(),
  createdAt: z.string().datetime(),
  estimatedCefr: cefrLevelSchema,
  correct: z.number().int().nonnegative(),
  total: z.literal(25),
  unknown: z.number().int().nonnegative(),
  executiveSummaryJa: z.string(),
  scoreInterpretationJa: z.string(),
  strengths: z.array(z.string()),
  priorities: z.array(z.string()),
  studyPlan: z.object({
    next7DaysJa: z.string(),
    next30DaysJa: z.string(),
    beforeNextAssessmentJa: z.string(),
  }),
  questions: z.array(reportQuestionSchema).length(25),
});
export type AssessmentReport = z.infer<typeof assessmentReportSchema>;

export const assessmentReportSummarySchema = assessmentReportSchema.pick({
  id: true,
  attemptId: true,
  createdAt: true,
  estimatedCefr: true,
  correct: true,
  total: true,
  unknown: true,
  executiveSummaryJa: true,
});
export type AssessmentReportSummary = z.infer<
  typeof assessmentReportSummarySchema
>;

export const learningOverviewSchema = z.object({
  mode: z.enum(['live', 'dry-run']),
  analysisStatus: analysisStatusSchema,
  analysisMessage: z.string().nullable(),
  persona: learnerPersonaSchema.nullable(),
  latestReport: assessmentReportSummarySchema.nullable(),
});
export type LearningOverview = z.infer<typeof learningOverviewSchema>;

export const updatePersonaRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  userAuthored: personaUserAuthoredSchema,
});

export const reportListSchema = z.array(assessmentReportSummarySchema);
