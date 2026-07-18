import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assessmentStateSchema,
  cefrLevels,
  expectedQuestionCount,
  type AnswerSelection,
  type AssessmentState,
  type RoundSummary,
} from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import { AssessmentRepositoryError } from './repository.ts';
import {
  estimateCefr,
  scoreRound,
  type ScoredRound,
  type ScoringQuestion,
} from './scoring.ts';

type DryRunAttemptRow = {
  id: string;
  user_id: string;
  question_set_id: string;
  status: 'answering' | 'completed' | 'abandoned';
  current_round: 1 | 2 | 3;
  estimated_cefr: (typeof cefrLevels)[number] | null;
  correct_count: number | null;
  unknown_count: number | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

type DryRunQuestionRow = {
  id: string;
  question_set_id: string;
  external_id: string;
  round_number: 1 | 2 | 3;
  position: number;
  category: ScoringQuestion['category'];
  cefr_level: ScoringQuestion['cefrLevel'];
  difficulty_rank: number;
  stem: string;
  options: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string }>;
  correct_option_id: 'A' | 'B' | 'C' | 'D';
  explanation_ja: string;
  learning_point: string;
};

type DryRunResponseRow = {
  question_id: string;
  selected_option_id: 'A' | 'B' | 'C' | 'D' | null;
  is_unknown: boolean;
};

export class DryRunRepository {
  private readonly database: SupabaseClient;

  constructor(config: Pick<ServerConfig, 'supabaseUrl' | 'supabaseSecretKey'>) {
    this.database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async findActiveAttempt(userId: string): Promise<DryRunAttemptRow | null> {
    const { data, error } = await this.database
      .from('dry_run_attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'answering')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dryRunError('Could not load active dry-run.', error);
    return (data as DryRunAttemptRow | null) ?? null;
  }

  async findLatestCompletedAttempt(
    userId: string,
  ): Promise<DryRunAttemptRow | null> {
    const { data, error } = await this.database
      .from('dry_run_attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dryRunError('Could not load dry-run history.', error);
    return (data as DryRunAttemptRow | null) ?? null;
  }

  async createAttempt(userId: string): Promise<DryRunAttemptRow> {
    const active = await this.findActiveAttempt(userId);
    if (active) return active;

    const { data: setData, error: setError } = await this.database
      .from('dry_run_question_sets')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (setError) throw dryRunError('Could not load dry-run fixture.', setError);
    if (!setData) {
      throw new AssessmentRepositoryError(
        'Dry-run用の固定問題がまだ準備されていません。セットアップ手順を実行してください。',
        'dry_run_fixture_missing',
      );
    }

    const questionSetId = (setData as { id: string }).id;
    await this.assertFixtureShape(questionSetId);
    const { data, error } = await this.database
      .from('dry_run_attempts')
      .insert({ user_id: userId, question_set_id: questionSetId })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        const concurrent = await this.findActiveAttempt(userId);
        if (concurrent) return concurrent;
      }
      throw dryRunError('Could not start dry-run.', error);
    }

    const attempt = data as DryRunAttemptRow;
    const { error: roundError } = await this.database
      .from('dry_run_rounds')
      .insert(
        ([1, 2, 3] as const).map((round) => ({
          attempt_id: attempt.id,
          user_id: userId,
          round_number: round,
          status: round === 1 ? 'answering' : 'pending',
        })),
      );
    if (roundError) {
      await this.database
        .from('dry_run_attempts')
        .update({ status: 'abandoned' })
        .eq('id', attempt.id);
      throw dryRunError('Could not prepare dry-run rounds.', roundError);
    }
    return attempt;
  }

  async abandonActiveAttempt(userId: string): Promise<void> {
    const { error } = await this.database
      .from('dry_run_attempts')
      .update({ status: 'abandoned' })
      .eq('user_id', userId)
      .eq('status', 'answering');
    if (error) throw dryRunError('Could not restart dry-run.', error);
  }

  async getOwnedAttempt(
    userId: string,
    attemptId: string,
  ): Promise<DryRunAttemptRow> {
    const { data, error } = await this.database
      .from('dry_run_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('user_id', userId)
      .single();
    if (error) throw dryRunError('Dry-run was not found.', error);
    return data as DryRunAttemptRow;
  }

  async saveAnswer(
    attempt: DryRunAttemptRow,
    questionExternalId: string,
    answer: AnswerSelection,
  ): Promise<void> {
    if (attempt.status !== 'answering') {
      throw new AssessmentRepositoryError(
        'The dry-run is not accepting answers.',
        'assessment_not_answering',
      );
    }
    const { data: question, error: questionError } = await this.database
      .from('dry_run_questions')
      .select('id')
      .eq('question_set_id', attempt.question_set_id)
      .eq('round_number', attempt.current_round)
      .eq('external_id', questionExternalId)
      .single();
    if (questionError) {
      throw dryRunError('Dry-run question was not found.', questionError);
    }

    const { error } = await this.database.from('dry_run_responses').upsert(
      {
        attempt_id: attempt.id,
        question_id: (question as { id: string }).id,
        user_id: attempt.user_id,
        selected_option_id: answer.kind === 'option' ? answer.optionId : null,
        is_unknown: answer.kind === 'unknown',
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'attempt_id,question_id' },
    );
    if (error) throw dryRunError('Could not save dry-run answer.', error);
  }

  async completeRound(
    attempt: DryRunAttemptRow,
    round: 1 | 2 | 3,
  ): Promise<void> {
    if (attempt.status !== 'answering' || attempt.current_round !== round) {
      throw new AssessmentRepositoryError(
        'This round does not match the current dry-run.',
        'round_mismatch',
      );
    }

    const questions = await this.loadRoundForScoring(attempt, round);
    const result = scoreRound(round, questions);
    const now = new Date().toISOString();
    const { error: roundError } = await this.database
      .from('dry_run_rounds')
      .update({
        status: 'completed',
        correct_count: result.correct,
        unknown_count: result.unknown,
        result_payload: result,
        completed_at: now,
      })
      .eq('attempt_id', attempt.id)
      .eq('round_number', round)
      .eq('status', 'answering');
    if (roundError) throw dryRunError('Could not score dry-run round.', roundError);

    if (round < 3) {
      const nextRound = (round + 1) as 2 | 3;
      const { error: nextRoundError } = await this.database
        .from('dry_run_rounds')
        .update({ status: 'answering' })
        .eq('attempt_id', attempt.id)
        .eq('round_number', nextRound)
        .eq('status', 'pending');
      if (nextRoundError) {
        throw dryRunError('Could not activate next dry-run round.', nextRoundError);
      }
      const { error: attemptError } = await this.database
        .from('dry_run_attempts')
        .update({ current_round: nextRound })
        .eq('id', attempt.id)
        .eq('user_id', attempt.user_id)
        .eq('status', 'answering');
      if (attemptError) {
        throw dryRunError('Could not continue dry-run.', attemptError);
      }
      return;
    }

    const allQuestions = await this.loadAllScoringQuestions(attempt);
    const correctCount = allQuestions.filter(
      (question) =>
        !question.isUnknown &&
        question.selectedOptionId === question.correctOptionId,
    ).length;
    const unknownCount = allQuestions.filter(
      (question) => question.isUnknown,
    ).length;
    const { error: attemptError } = await this.database
      .from('dry_run_attempts')
      .update({
        status: 'completed',
        estimated_cefr: estimateCefr(allQuestions),
        correct_count: correctCount,
        unknown_count: unknownCount,
        completed_at: now,
      })
      .eq('id', attempt.id)
      .eq('user_id', attempt.user_id)
      .eq('status', 'answering');
    if (attemptError) throw dryRunError('Could not complete dry-run.', attemptError);
  }

  async loadState(userId: string): Promise<AssessmentState> {
    const attempt =
      (await this.findActiveAttempt(userId)) ??
      (await this.findLatestCompletedAttempt(userId));
    if (!attempt) return { status: 'not_started' };

    const completedRounds = await this.getCompletedRoundSummaries(attempt.id);
    if (attempt.status === 'completed') {
      return assessmentStateSchema.parse({
        status: 'completed',
        attemptId: attempt.id,
        estimatedCefr: attempt.estimated_cefr,
        correct: attempt.correct_count,
        total: 25,
        unknown: attempt.unknown_count,
        completedRounds,
      });
    }

    const questions = await this.getQuestions(
      attempt.question_set_id,
      attempt.current_round,
    );
    const responses = await this.getResponses(
      attempt.id,
      questions.map((question) => question.id),
    );
    const responseByQuestion = new Map(
      responses.map((response) => [response.question_id, response]),
    );
    return assessmentStateSchema.parse({
      status: 'answering',
      attemptId: attempt.id,
      round: attempt.current_round,
      questions: questions.map((question) => {
        const response = responseByQuestion.get(question.id);
        return {
          id: question.external_id,
          category: question.category,
          stem: question.stem,
          options: question.options,
          answer: response
            ? response.is_unknown
              ? { kind: 'unknown' as const }
              : {
                  kind: 'option' as const,
                  optionId: response.selected_option_id,
                }
            : null,
        };
      }),
      completedRounds,
    });
  }

  private async loadRoundForScoring(
    attempt: DryRunAttemptRow,
    round: 1 | 2 | 3,
  ): Promise<ScoringQuestion[]> {
    const questions = await this.getQuestions(attempt.question_set_id, round);
    const responses = await this.getResponses(
      attempt.id,
      questions.map((question) => question.id),
    );
    if (responses.length !== questions.length) {
      throw new AssessmentRepositoryError(
        `Answer every question before completing Round ${round}.`,
        'round_incomplete',
      );
    }
    const responseByQuestion = new Map(
      responses.map((response) => [response.question_id, response]),
    );
    return questions.map((question) => {
      const response = responseByQuestion.get(question.id);
      if (!response) {
        throw new AssessmentRepositoryError(
          'Dry-run answer data is incomplete.',
          'answer_data_incomplete',
        );
      }
      return {
        round,
        category: question.category,
        cefrLevel: question.cefr_level,
        difficultyRank: question.difficulty_rank,
        learningPoint: question.learning_point,
        correctOptionId: question.correct_option_id,
        selectedOptionId: response.selected_option_id,
        isUnknown: response.is_unknown,
      };
    });
  }

  private async loadAllScoringQuestions(
    attempt: DryRunAttemptRow,
  ): Promise<ScoringQuestion[]> {
    const all: ScoringQuestion[] = [];
    for (const round of [1, 2, 3] as const) {
      all.push(...(await this.loadRoundForScoring(attempt, round)));
    }
    return all;
  }

  private async getQuestions(
    questionSetId: string,
    round: 1 | 2 | 3,
  ): Promise<DryRunQuestionRow[]> {
    const { data, error } = await this.database
      .from('dry_run_questions')
      .select('*')
      .eq('question_set_id', questionSetId)
      .eq('round_number', round)
      .order('position', { ascending: true });
    if (error) throw dryRunError('Could not load dry-run questions.', error);
    return data as DryRunQuestionRow[];
  }

  private async getResponses(
    attemptId: string,
    questionIds: string[],
  ): Promise<DryRunResponseRow[]> {
    if (questionIds.length === 0) return [];
    const { data, error } = await this.database
      .from('dry_run_responses')
      .select('question_id, selected_option_id, is_unknown')
      .eq('attempt_id', attemptId)
      .in('question_id', questionIds);
    if (error) throw dryRunError('Could not load dry-run answers.', error);
    return data as DryRunResponseRow[];
  }

  private async getCompletedRoundSummaries(
    attemptId: string,
  ): Promise<RoundSummary[]> {
    const { data, error } = await this.database
      .from('dry_run_rounds')
      .select('result_payload')
      .eq('attempt_id', attemptId)
      .eq('status', 'completed')
      .order('round_number', { ascending: true });
    if (error) throw dryRunError('Could not load dry-run results.', error);
    return (data as Array<{ result_payload: ScoredRound }>).map((row) => ({
      round: row.result_payload.round,
      correct: row.result_payload.correct,
      total: row.result_payload.total,
      unknown: row.result_payload.unknown,
      categories: row.result_payload.categories,
    }));
  }

  private async assertFixtureShape(questionSetId: string): Promise<void> {
    for (const round of [1, 2, 3] as const) {
      const { count, error } = await this.database
        .from('dry_run_questions')
        .select('id', { count: 'exact', head: true })
        .eq('question_set_id', questionSetId)
        .eq('round_number', round);
      if (error) throw dryRunError('Could not validate dry-run fixture.', error);
      if (count !== expectedQuestionCount(round)) {
        throw new AssessmentRepositoryError(
          `Dry-run fixture Round ${round} has ${count ?? 0} questions.`,
          'dry_run_fixture_invalid',
        );
      }
    }
  }
}

function dryRunError(
  message: string,
  error: { code?: string; message?: string },
): AssessmentRepositoryError {
  return new AssessmentRepositoryError(
    `${message} ${error.message ?? ''}`.trim(),
    error.code ?? null,
  );
}

export type { DryRunAttemptRow };
