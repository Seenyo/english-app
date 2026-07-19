import { createClient } from '@supabase/supabase-js';
import { assessmentQuestionSchema } from '../../shared/assessment/contracts.ts';
import { readServerConfig } from '../config.ts';

const sourceEmail = process.env.DRY_RUN_FIXTURE_SOURCE_EMAIL?.trim().toLowerCase();
if (!sourceEmail) {
  throw new Error(
    'Set DRY_RUN_FIXTURE_SOURCE_EMAIL in .env.server before seeding.',
  );
}

const config = readServerConfig();
const database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sourceUserId = await findUserIdByEmail(sourceEmail);
const { data: attempt, error: attemptError } = await database
  .from('assessment_attempts')
  .select('id, completed_at')
  .eq('user_id', sourceUserId)
  .eq('status', 'completed')
  .order('completed_at', { ascending: false })
  .limit(1)
  .maybeSingle();
if (attemptError) throw attemptError;
if (!attempt) throw new Error('No completed source assessment was found.');

const { data: rounds, error: roundError } = await database
  .from('assessment_rounds')
  .select('id, round_number')
  .eq('attempt_id', attempt.id)
  .eq('status', 'completed')
  .order('round_number', { ascending: true });
if (roundError) throw roundError;
if (rounds.length !== 3) {
  throw new Error(`Expected 3 completed rounds, found ${rounds.length}.`);
}

const roundById = new Map(
  rounds.map((round) => [
    round.id as string,
    round.round_number as 1 | 2 | 3,
  ]),
);
const roundIds = [...roundById.keys()];
const { data: questions, error: questionError } = await database
  .from('assessment_questions')
  .select(
    'id, round_id, external_id, position, category, cefr_level, difficulty_rank, stem, options, learning_point',
  )
  .in('round_id', roundIds)
  .order('position', { ascending: true });
if (questionError) throw questionError;
if (questions.length !== 25) {
  throw new Error(`Expected 25 source questions, found ${questions.length}.`);
}

const questionIds = questions.map((question) => question.id as string);
const { data: keys, error: keyError } = await database
  .from('assessment_answer_keys')
  .select('question_id, correct_option_id, explanation_ja')
  .in('question_id', questionIds);
if (keyError) throw keyError;
if (keys.length !== 25) {
  throw new Error(`Expected 25 source answer keys, found ${keys.length}.`);
}
const keyByQuestionId = new Map(
  keys.map((key) => [key.question_id as string, key]),
);

const fixtureQuestions = questions.map((question) => {
  const round = roundById.get(question.round_id as string);
  const answerKey = keyByQuestionId.get(question.id as string);
  if (!round || !answerKey) throw new Error('Source question data is incomplete.');
  const parsed = assessmentQuestionSchema.parse({
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
  return { parsed, round, position: question.position as number };
});

for (const [round, expected] of [
  [1, 10],
  [2, 10],
  [3, 5],
] as const) {
  const count = fixtureQuestions.filter((question) => question.round === round).length;
  if (count !== expected) {
    throw new Error(`Round ${round} requires ${expected} questions; found ${count}.`);
  }
}

const { data: questionSet, error: setError } = await database
  .from('dry_run_question_sets')
  .insert({
    source_attempt_id: attempt.id,
    label: `Imported ${new Date().toISOString().slice(0, 10)}`,
    is_active: false,
  })
  .select('id')
  .single();
if (setError) throw setError;

const { error: fixtureError } = await database.from('dry_run_questions').insert(
  fixtureQuestions.map(({ parsed, round, position }) => ({
    question_set_id: questionSet.id,
    external_id: parsed.id,
    round_number: round,
    position,
    category: parsed.category,
    cefr_level: parsed.cefrLevel,
    difficulty_rank: parsed.difficultyRank,
    stem: parsed.stem,
    options: parsed.options,
    correct_option_id: parsed.correctOptionId,
    explanation_ja: parsed.explanationJa,
    learning_point: parsed.learningPoint,
  })),
);
if (fixtureError) throw fixtureError;

const { error: deactivateError } = await database
  .from('dry_run_question_sets')
  .update({ is_active: false })
  .eq('is_active', true);
if (deactivateError) throw deactivateError;
const { error: activateError } = await database
  .from('dry_run_question_sets')
  .update({ is_active: true })
  .eq('id', questionSet.id);
if (activateError) throw activateError;

console.log(
  JSON.stringify({
    status: 'seeded',
    questionSetId: questionSet.id,
    questionCount: fixtureQuestions.length,
    rounds: [10, 10, 5],
  }),
);

async function findUserIdByEmail(email: string): Promise<string> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await database.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  throw new Error('The source account was not found in Supabase Auth.');
}
