import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assessmentStateSchema,
  cefrLevels,
  previousRoundResultSchema,
  type AnswerSelection,
  type AssessmentBatch,
  type AssessmentState,
  type LearnerProfile,
  type PreviousRoundResult,
  type RoundSummary,
} from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import type { ScoredRound, ScoringQuestion } from './scoring.ts';

type AttemptRow = {
  id: string;
  user_id: string;
  status: 'generating' | 'answering' | 'completed' | 'failed' | 'abandoned';
  current_round: 1 | 2 | 3;
  codex_thread_id: string | null;
  profile_snapshot: LearnerProfile;
  persona_version: number | null;
  persona_snapshot: Record<string, unknown> | null;
  estimated_cefr: (typeof cefrLevels)[number] | null;
  correct_count: number | null;
  unknown_count: number | null;
  error_code: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

type RoundRow = {
  id: string;
  attempt_id: string;
  round_number: 1 | 2 | 3;
  status: 'generating' | 'answering' | 'completed' | 'failed';
  result_payload: unknown | null;
};

type QuestionRow = {
  id: string;
  round_id: string;
  external_id: string;
  position: number;
  category: ScoringQuestion['category'];
  cefr_level: ScoringQuestion['cefrLevel'];
  difficulty_rank: number;
  stem: string;
  options: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string }>;
  learning_point: string;
};

type AnswerKeyRow = {
  question_id: string;
  correct_option_id: 'A' | 'B' | 'C' | 'D';
};

type ResponseRow = {
  question_id: string;
  selected_option_id: 'A' | 'B' | 'C' | 'D' | null;
  is_unknown: boolean;
};

export class AssessmentRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'AssessmentRepositoryError';
  }
}

export class AssessmentRepository {
  private readonly database: SupabaseClient;

  constructor(config: Pick<ServerConfig, 'supabaseUrl' | 'supabaseSecretKey'>) {
    this.database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async upsertProfile(userId: string, profile: LearnerProfile): Promise<void> {
    const { error } = await this.database.from('learner_profiles').upsert(
      {
        user_id: userId,
        self_assessment: profile.selfAssessment,
        eiken_grade: profile.eikenGrade,
        toeic_score: profile.toeicScore,
      },
      { onConflict: 'user_id' },
    );
    if (error) throw repositoryError('Could not save learner profile.', error);
  }

  async findActiveAttempt(userId: string): Promise<AttemptRow | null> {
    const { data, error } = await this.database
      .from('assessment_attempts')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['generating', 'answering', 'failed'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not load active assessment.', error);
    return (data as AttemptRow | null) ?? null;
  }

  async findLatestCompletedAttempt(userId: string): Promise<AttemptRow | null> {
    const { data, error } = await this.database
      .from('assessment_attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not load assessment history.', error);
    return (data as AttemptRow | null) ?? null;
  }

  async createAttempt(
    userId: string,
    profile: LearnerProfile,
  ): Promise<AttemptRow> {
    const [threadResult, personaResult] = await Promise.all([
      this.database
        .from('learning_agent_threads')
        .select('codex_thread_id')
        .eq('user_id', userId)
        .eq('agent_kind', 'assessment')
        .eq('scope_key', 'default')
        .eq('status', 'active')
        .maybeSingle(),
      this.database
        .from('learner_personas')
        .select(
          'schema_version, version, initial_self_assessment, user_authored, ai_inferred, updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (threadResult.error) {
      throw repositoryError(
        'Could not load assessment Codex thread.',
        threadResult.error,
      );
    }
    if (personaResult.error) {
      throw repositoryError(
        'Could not load learner persona.',
        personaResult.error,
      );
    }
    const persona = personaResult.data
      ? {
          schemaVersion: personaResult.data.schema_version,
          version: personaResult.data.version,
          initialSelfAssessment: personaResult.data.initial_self_assessment,
          userAuthored: personaResult.data.user_authored,
          aiInferred: personaResult.data.ai_inferred,
          updatedAt: personaResult.data.updated_at,
        }
      : null;
    const { data, error } = await this.database
      .from('assessment_attempts')
      .insert({
        user_id: userId,
        profile_snapshot: profile,
        codex_thread_id: threadResult.data?.codex_thread_id ?? null,
        persona_version: personaResult.data?.version ?? null,
        persona_snapshot: persona,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        const active = await this.findActiveAttempt(userId);
        if (active) return active;
      }
      throw repositoryError('Could not start assessment.', error);
    }
    return data as AttemptRow;
  }

  async getOwnedAttempt(
    userId: string,
    attemptId: string,
  ): Promise<AttemptRow> {
    const { data, error } = await this.database
      .from('assessment_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('user_id', userId)
      .single();
    if (error) throw repositoryError('Assessment was not found.', error);
    return data as AttemptRow;
  }

  async markRoundGenerating(
    attempt: AttemptRow,
    round: 1 | 2 | 3,
  ): Promise<void> {
    const { error: deleteError } = await this.database
      .from('assessment_rounds')
      .delete()
      .eq('attempt_id', attempt.id)
      .eq('round_number', round);
    if (deleteError) {
      throw repositoryError('Could not reset assessment round.', deleteError);
    }

    const { error: roundError } = await this.database
      .from('assessment_rounds')
      .insert({
        attempt_id: attempt.id,
        user_id: attempt.user_id,
        round_number: round,
        status: 'generating',
      });
    if (roundError) {
      throw repositoryError('Could not prepare assessment round.', roundError);
    }

    const { error: attemptError } = await this.database
      .from('assessment_attempts')
      .update({
        status: 'generating',
        current_round: round,
        error_code: null,
      })
      .eq('id', attempt.id)
      .eq('user_id', attempt.user_id);
    if (attemptError) {
      throw repositoryError('Could not prepare assessment.', attemptError);
    }
  }

  async saveGeneratedRound(
    attempt: AttemptRow,
    batch: AssessmentBatch,
    threadId: string,
    repairCount: number,
  ): Promise<void> {
    const { data: roundData, error: roundLookupError } = await this.database
      .from('assessment_rounds')
      .select('id')
      .eq('attempt_id', attempt.id)
      .eq('round_number', batch.round)
      .single();
    if (roundLookupError) {
      throw repositoryError(
        'Could not locate assessment round.',
        roundLookupError,
      );
    }
    const roundId = (roundData as { id: string }).id;

    const questionRows = batch.questions.map((question, index) => ({
      attempt_id: attempt.id,
      round_id: roundId,
      user_id: attempt.user_id,
      external_id: question.id,
      position: index + 1,
      category: question.category,
      cefr_level: question.cefrLevel,
      difficulty_rank: question.difficultyRank,
      stem: question.stem,
      options: question.options,
      learning_point: question.learningPoint,
    }));
    const { data: insertedQuestions, error: questionError } =
      await this.database
        .from('assessment_questions')
        .insert(questionRows)
        .select('id, external_id');
    if (questionError) {
      throw repositoryError(
        'Could not save generated questions.',
        questionError,
      );
    }

    const questionIds = new Map(
      (insertedQuestions as Array<{ id: string; external_id: string }>).map(
        (question) => [question.external_id, question.id],
      ),
    );
    const answerKeys = batch.questions.map((question) => {
      const questionId = questionIds.get(question.id);
      if (!questionId) {
        throw new AssessmentRepositoryError(
          `Missing stored id for ${question.id}.`,
          'question_id_missing',
        );
      }
      return {
        question_id: questionId,
        correct_option_id: question.correctOptionId,
        explanation_ja: question.explanationJa,
      };
    });
    const { error: answerKeyError } = await this.database
      .from('assessment_answer_keys')
      .insert(answerKeys);
    if (answerKeyError) {
      throw repositoryError('Could not save answer keys.', answerKeyError);
    }

    const { error: roundError } = await this.database
      .from('assessment_rounds')
      .update({
        status: 'answering',
        calibration_summary: batch.calibrationSummary,
        repair_count: repairCount,
        generated_at: new Date().toISOString(),
      })
      .eq('id', roundId);
    if (roundError) {
      throw repositoryError('Could not activate assessment round.', roundError);
    }

    const { error: attemptError } = await this.database
      .from('assessment_attempts')
      .update({
        status: 'answering',
        current_round: batch.round,
        codex_thread_id: threadId,
        error_code: null,
      })
      .eq('id', attempt.id)
      .eq('user_id', attempt.user_id);
    if (attemptError) {
      throw repositoryError('Could not activate assessment.', attemptError);
    }

    const { error: threadError } = await this.database
      .from('learning_agent_threads')
      .upsert(
        {
          user_id: attempt.user_id,
          agent_kind: 'assessment',
          scope_key: 'default',
          codex_thread_id: threadId,
          status: 'active',
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,agent_kind,scope_key' },
      );
    if (threadError) {
      throw repositoryError(
        'Could not remember assessment Codex thread.',
        threadError,
      );
    }
  }

  async markGenerationFailed(
    attempt: AttemptRow,
    round: 1 | 2 | 3,
    code: string,
    threadId: string | null,
  ): Promise<void> {
    await this.database
      .from('assessment_rounds')
      .update({ status: 'failed' })
      .eq('attempt_id', attempt.id)
      .eq('round_number', round);
    const { error } = await this.database
      .from('assessment_attempts')
      .update({
        status: 'failed',
        current_round: round,
        error_code: code,
        ...(threadId ? { codex_thread_id: threadId } : {}),
      })
      .eq('id', attempt.id)
      .eq('user_id', attempt.user_id);
    if (error)
      throw repositoryError('Could not save generation failure.', error);
  }

  async saveAnswer(
    attempt: AttemptRow,
    questionExternalId: string,
    answer: AnswerSelection,
  ): Promise<void> {
    if (attempt.status !== 'answering') {
      throw new AssessmentRepositoryError(
        'The assessment is not accepting answers.',
        'assessment_not_answering',
      );
    }

    const round = await this.getRound(attempt.id, attempt.current_round);
    const { data: questionData, error: questionError } = await this.database
      .from('assessment_questions')
      .select('id')
      .eq('round_id', round.id)
      .eq('external_id', questionExternalId)
      .single();
    if (questionError) {
      throw repositoryError('Question was not found.', questionError);
    }

    const { error } = await this.database.from('assessment_responses').upsert(
      {
        question_id: (questionData as { id: string }).id,
        attempt_id: attempt.id,
        user_id: attempt.user_id,
        selected_option_id: answer.kind === 'option' ? answer.optionId : null,
        is_unknown: answer.kind === 'unknown',
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'question_id' },
    );
    if (error) throw repositoryError('Could not save answer.', error);
  }

  async getRoundStatus(
    attemptId: string,
    roundNumber: 1 | 2 | 3,
  ): Promise<RoundRow['status']> {
    return (await this.getRound(attemptId, roundNumber)).status;
  }

  async loadRoundForScoring(
    attempt: AttemptRow,
    roundNumber: 1 | 2 | 3,
  ): Promise<ScoringQuestion[]> {
    const round = await this.getRound(attempt.id, roundNumber);
    const questions = await this.getQuestions(round.id);
    const questionIds = questions.map((question) => question.id);
    const [answerKeys, responses] = await Promise.all([
      this.getAnswerKeys(questionIds),
      this.getResponses(questionIds),
    ]);
    const keyByQuestion = new Map(
      answerKeys.map((key) => [key.question_id, key]),
    );
    const responseByQuestion = new Map(
      responses.map((response) => [response.question_id, response]),
    );

    if (responses.length !== questions.length) {
      throw new AssessmentRepositoryError(
        `Answer every question before completing Round ${roundNumber}.`,
        'round_incomplete',
      );
    }

    return questions.map((question) => {
      const key = keyByQuestion.get(question.id);
      const response = responseByQuestion.get(question.id);
      if (!key || !response) {
        throw new AssessmentRepositoryError(
          'Assessment answer data is incomplete.',
          'answer_data_incomplete',
        );
      }
      return {
        round: roundNumber,
        category: question.category,
        cefrLevel: question.cefr_level,
        difficultyRank: question.difficulty_rank,
        learningPoint: question.learning_point,
        correctOptionId: key.correct_option_id,
        selectedOptionId: response.selected_option_id,
        isUnknown: response.is_unknown,
      };
    });
  }

  async saveRoundScore(
    attempt: AttemptRow,
    result: ScoredRound,
  ): Promise<void> {
    const { error } = await this.database
      .from('assessment_rounds')
      .update({
        status: 'completed',
        correct_count: result.correct,
        unknown_count: result.unknown,
        result_payload: result,
        completed_at: new Date().toISOString(),
      })
      .eq('attempt_id', attempt.id)
      .eq('round_number', result.round);
    if (error) throw repositoryError('Could not save round result.', error);
  }

  async getPreviousResults(attemptId: string): Promise<PreviousRoundResult[]> {
    const { data, error } = await this.database
      .from('assessment_rounds')
      .select('result_payload')
      .eq('attempt_id', attemptId)
      .eq('status', 'completed')
      .lt('round_number', 3)
      .order('round_number', { ascending: true });
    if (error) throw repositoryError('Could not load prior results.', error);

    return (data as Array<{ result_payload: unknown }>).map((row) =>
      previousRoundResultSchema.parse(row.result_payload),
    );
  }

  async completeAttempt(
    attempt: AttemptRow,
    estimatedCefr: (typeof cefrLevels)[number],
  ): Promise<void> {
    const questions = await this.loadAllScoringQuestions(attempt);
    const correctCount = questions.filter(
      (question) =>
        !question.isUnknown &&
        question.selectedOptionId === question.correctOptionId,
    ).length;
    const unknownCount = questions.filter(
      (question) => question.isUnknown,
    ).length;
    const now = new Date().toISOString();

    const { error: attemptError } = await this.database
      .from('assessment_attempts')
      .update({
        status: 'completed',
        estimated_cefr: estimatedCefr,
        correct_count: correctCount,
        unknown_count: unknownCount,
        completed_at: now,
        error_code: null,
      })
      .eq('id', attempt.id)
      .eq('user_id', attempt.user_id);
    if (attemptError) {
      throw repositoryError('Could not complete assessment.', attemptError);
    }

    const { error: profileError } = await this.database
      .from('learner_profiles')
      .update({ current_cefr: estimatedCefr, assessed_at: now })
      .eq('user_id', attempt.user_id);
    if (profileError) {
      throw repositoryError('Could not update learner level.', profileError);
    }
  }

  async loadAllScoringQuestions(
    attempt: AttemptRow,
  ): Promise<ScoringQuestion[]> {
    const rounds = await this.getRounds(attempt.id);
    const all: ScoringQuestion[] = [];
    for (const round of rounds) {
      if (round.status !== 'completed') continue;
      all.push(
        ...(await this.loadRoundForScoring(attempt, round.round_number)),
      );
    }
    return all;
  }

  async loadState(userId: string): Promise<AssessmentState> {
    const attempt =
      (await this.findActiveAttempt(userId)) ??
      (await this.findLatestCompletedAttempt(userId));
    if (!attempt) return { status: 'not_started' };

    if (attempt.status === 'generating') {
      return {
        status: 'generating',
        attemptId: attempt.id,
        round: attempt.current_round,
      };
    }
    if (attempt.status === 'failed') {
      return {
        status: 'failed',
        attemptId: attempt.id,
        round: attempt.current_round,
        retryable: true,
        message:
          '問題の生成を完了できませんでした。Codexの接続を確認して再試行してください。',
      };
    }

    const completedRounds = await this.getCompletedRoundSummaries(attempt.id);
    if (attempt.status === 'completed') {
      const state = {
        status: 'completed' as const,
        attemptId: attempt.id,
        estimatedCefr: attempt.estimated_cefr,
        correct: attempt.correct_count,
        total: 25,
        unknown: attempt.unknown_count,
        completedRounds,
      };
      return assessmentStateSchema.parse(state);
    }

    const round = await this.getRound(attempt.id, attempt.current_round);
    const questions = await this.getQuestions(round.id);
    const responses = await this.getResponses(
      questions.map((question) => question.id),
    );
    const responseByQuestion = new Map(
      responses.map((response) => [response.question_id, response]),
    );
    return {
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
                  optionId: response.selected_option_id!,
                }
            : null,
        };
      }),
      completedRounds,
    };
  }

  private async getRound(
    attemptId: string,
    roundNumber: 1 | 2 | 3,
  ): Promise<RoundRow> {
    const { data, error } = await this.database
      .from('assessment_rounds')
      .select('*')
      .eq('attempt_id', attemptId)
      .eq('round_number', roundNumber)
      .single();
    if (error) throw repositoryError('Assessment round was not found.', error);
    return data as RoundRow;
  }

  private async getRounds(attemptId: string): Promise<RoundRow[]> {
    const { data, error } = await this.database
      .from('assessment_rounds')
      .select('*')
      .eq('attempt_id', attemptId)
      .order('round_number', { ascending: true });
    if (error)
      throw repositoryError('Could not load assessment rounds.', error);
    return data as RoundRow[];
  }

  private async getQuestions(roundId: string): Promise<QuestionRow[]> {
    const { data, error } = await this.database
      .from('assessment_questions')
      .select('*')
      .eq('round_id', roundId)
      .order('position', { ascending: true });
    if (error)
      throw repositoryError('Could not load assessment questions.', error);
    return data as QuestionRow[];
  }

  private async getAnswerKeys(questionIds: string[]): Promise<AnswerKeyRow[]> {
    const { data, error } = await this.database
      .from('assessment_answer_keys')
      .select('question_id, correct_option_id')
      .in('question_id', questionIds);
    if (error) throw repositoryError('Could not load answer keys.', error);
    return data as AnswerKeyRow[];
  }

  private async getResponses(questionIds: string[]): Promise<ResponseRow[]> {
    if (questionIds.length === 0) return [];
    const { data, error } = await this.database
      .from('assessment_responses')
      .select('question_id, selected_option_id, is_unknown')
      .in('question_id', questionIds);
    if (error) throw repositoryError('Could not load responses.', error);
    return data as ResponseRow[];
  }

  private async getCompletedRoundSummaries(
    attemptId: string,
  ): Promise<RoundSummary[]> {
    const { data, error } = await this.database
      .from('assessment_rounds')
      .select('result_payload')
      .eq('attempt_id', attemptId)
      .eq('status', 'completed')
      .order('round_number', { ascending: true });
    if (error) throw repositoryError('Could not load round results.', error);

    return (data as Array<{ result_payload: ScoredRound }>).map((row) => ({
      round: row.result_payload.round,
      correct: row.result_payload.correct,
      total: row.result_payload.total,
      unknown: row.result_payload.unknown,
      categories: row.result_payload.categories,
    }));
  }
}

function repositoryError(
  message: string,
  error: { code?: string; message?: string },
): AssessmentRepositoryError {
  return new AssessmentRepositoryError(
    `${message} ${error.message ?? ''}`.trim(),
    error.code ?? null,
  );
}

export type { AttemptRow };
