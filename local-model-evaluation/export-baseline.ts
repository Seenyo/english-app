import { createClient } from '@supabase/supabase-js';
import {
  assessmentBatchSchema,
  assessmentQuestionSchema,
  learnerProfileSchema,
  previousRoundResultSchema,
  type AssessmentBatch,
} from '../shared/assessment/contracts.ts';
import { readServerConfig } from '../server/config.ts';
import {
  baselinePath,
  type BaselineArtifact,
  writePrivateJson,
} from './artifacts.ts';

const config = readServerConfig();
const database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: fixture, error: fixtureError } = await database
  .from('dry_run_question_sets')
  .select('label, source_attempt_id')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
if (fixtureError) throw fixtureError;
if (!fixture.source_attempt_id) {
  throw new Error('The active dry-run fixture has no source assessment.');
}

const attemptId = fixture.source_attempt_id as string;
const [attemptResult, roundsResult, questionsResult] = await Promise.all([
  database
    .from('assessment_attempts')
    .select('profile_snapshot, persona_snapshot, completed_at')
    .eq('id', attemptId)
    .single(),
  database
    .from('assessment_rounds')
    .select(
      'id, round_number, calibration_summary, result_payload, repair_count',
    )
    .eq('attempt_id', attemptId)
    .order('round_number', { ascending: true }),
  database
    .from('assessment_questions')
    .select(
      'id, round_id, external_id, position, category, cefr_level, difficulty_rank, stem, options, learning_point',
    )
    .eq('attempt_id', attemptId),
]);
if (attemptResult.error) throw attemptResult.error;
if (roundsResult.error) throw roundsResult.error;
if (questionsResult.error) throw questionsResult.error;

const questions = questionsResult.data;
const questionIds = questions.map((question) => question.id as string);
const { data: answerKeys, error: answerKeyError } = await database
  .from('assessment_answer_keys')
  .select('question_id, correct_option_id, explanation_ja')
  .in('question_id', questionIds);
if (answerKeyError) throw answerKeyError;

const keyByQuestionId = new Map(
  answerKeys.map((key) => [key.question_id as string, key]),
);
const batches: AssessmentBatch[] = roundsResult.data.map((round) => {
  const roundNumber = round.round_number as 1 | 2 | 3;
  const roundQuestions = questions
    .filter((question) => question.round_id === round.id)
    .sort((left, right) => Number(left.position) - Number(right.position))
    .map((question) => {
      const answerKey = keyByQuestionId.get(question.id as string);
      if (!answerKey) {
        throw new Error(
          `Missing answer key for ${String(question.external_id)}.`,
        );
      }
      return assessmentQuestionSchema.parse({
        id: question.external_id,
        category: question.category,
        cefrLevel: question.cefr_level,
        difficultyRank: question.difficulty_rank,
        stem: question.stem,
        options: question.options,
        correctOptionId: answerKey.correct_option_id,
        explanationJa: answerKey.explanation_ja,
        learningPoint: question.learning_point,
      });
    });
  return assessmentBatchSchema.parse({
    round: roundNumber,
    calibrationSummary:
      round.calibration_summary ?? `Codex baseline Round ${roundNumber}`,
    questions: roundQuestions,
  });
});

const artifact: BaselineArtifact = {
  exportedAt: new Date().toISOString(),
  source: {
    label: String(fixture.label),
    completedAt: attemptResult.data.completed_at as string | null,
  },
  profile: learnerProfileSchema.parse(attemptResult.data.profile_snapshot),
  canonicalPersona:
    (attemptResult.data.persona_snapshot as Record<string, unknown> | null) ??
    null,
  previousResults: roundsResult.data
    .filter((round) => Number(round.round_number) < 3)
    .map((round) => previousRoundResultSchema.parse(round.result_payload)),
  codexBatches: batches,
};

await writePrivateJson(baselinePath, artifact);
console.log(
  JSON.stringify({
    status: 'exported',
    path: baselinePath,
    questionCount: batches.reduce(
      (total, batch) => total + batch.questions.length,
      0,
    ),
    rounds: batches.map((batch) => batch.questions.length),
  }),
);
