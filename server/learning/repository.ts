import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assessmentReportSchema,
  learnerPersonaSchema,
  personaAiInferredSchema,
  personaMetricsSchema,
  personaUserAuthoredSchema,
  type AssessmentReport,
  type AssessmentReportSummary,
  type LearnerPersona,
  type PersonaAiInferred,
  type PersonaMetrics,
  type PersonaUserAuthored,
} from '../../shared/learning/contracts.ts';
import type { LearnerProfile } from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import type {
  AnalysisQuestionInput,
  AssessmentAnalysisInput,
  AssessmentAnalysisOutput,
} from './analysis.ts';

type PersonaRow = {
  user_id: string;
  schema_version: number;
  version: number;
  initial_self_assessment: string;
  user_authored: unknown;
  ai_inferred: unknown;
  updated_at: string;
};

export type AnalysisJobRow = {
  id: string;
  user_id: string;
  attempt_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_count: number;
  next_retry_at: string;
  lease_expires_at: string | null;
};

type AttemptAnalysisRow = {
  id: string;
  user_id: string;
  status: string;
  codex_thread_id: string | null;
  profile_snapshot: LearnerProfile;
  estimated_cefr: AssessmentAnalysisInput['estimatedCefr'] | null;
  correct_count: number | null;
  unknown_count: number | null;
};

export class LearningRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'LearningRepositoryError';
  }
}

export class LearningRepository {
  private readonly database: SupabaseClient;

  constructor(config: Pick<ServerConfig, 'supabaseUrl' | 'supabaseSecretKey'>) {
    this.database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ensurePersona(userId: string, profile: LearnerProfile): Promise<void> {
    if (await this.isPersonaInitialized(userId)) return;
    const userAuthored = defaultUserAuthored(profile);
    const aiInferred = emptyAiInference();
    const { error } = await this.database.rpc('ensure_learner_persona', {
      p_user_id: userId,
      p_initial_self_assessment: profile.selfAssessment,
      p_user_authored: userAuthored,
      p_initial_ai_inferred: aiInferred,
      p_metrics: await this.getMetrics(userId),
    });
    if (error)
      throw repositoryError('Could not initialize learner persona.', error);
  }

  async ensurePersonaFromStoredProfile(userId: string): Promise<void> {
    if (await this.isPersonaInitialized(userId)) return;
    const { data, error } = await this.database
      .from('learner_profiles')
      .select('self_assessment, eiken_grade, toeic_score')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw repositoryError('Could not load learner profile.', error);
    if (!data) return;
    await this.ensurePersona(userId, {
      selfAssessment: data.self_assessment as string,
      eikenGrade: (data.eiken_grade as LearnerProfile['eikenGrade']) ?? null,
      toeicScore: (data.toeic_score as number | null) ?? null,
    });
  }

  async getPersona(userId: string): Promise<LearnerPersona | null> {
    const row = await this.getPersonaRow(userId);
    if (!row) return null;
    return learnerPersonaSchema.parse({
      schemaVersion: row.schema_version,
      version: row.version,
      initialSelfAssessment: row.initial_self_assessment,
      userAuthored: row.user_authored,
      aiInferred: row.ai_inferred,
      metrics: await this.getMetrics(userId),
      updatedAt: normalizeDatabaseTimestamp(row.updated_at),
    });
  }

  async updatePersonaUserAuthored(
    userId: string,
    expectedVersion: number,
    userAuthored: PersonaUserAuthored,
  ): Promise<LearnerPersona> {
    const parsed = personaUserAuthoredSchema.parse(userAuthored);
    const { error } = await this.database.rpc('update_persona_user_authored', {
      p_user_id: userId,
      p_expected_version: expectedVersion,
      p_user_authored: parsed,
      p_metrics: await this.getMetrics(userId),
    });
    if (error) {
      if (error.message.includes('persona_version_conflict')) {
        throw new LearningRepositoryError(
          'プロフィールが別の処理で更新されました。最新内容を読み込んでからもう一度保存してください。',
          'persona_version_conflict',
        );
      }
      throw repositoryError('Could not update learner persona.', error);
    }
    const updated = await this.getPersona(userId);
    if (!updated) {
      throw new LearningRepositoryError(
        'Persona was not found.',
        'persona_not_found',
      );
    }
    return updated;
  }

  async enqueueAssessmentAnalysis(
    userId: string,
    attemptId: string,
  ): Promise<void> {
    const { error } = await this.database
      .from('assessment_analysis_jobs')
      .upsert(
        { user_id: userId, attempt_id: attemptId },
        { onConflict: 'attempt_id', ignoreDuplicates: true },
      );
    if (error)
      throw repositoryError('Could not queue assessment analysis.', error);
  }

  async ensureLatestAssessmentAnalysis(userId: string): Promise<void> {
    const attemptId = await this.getLatestCompletedAttemptId(userId);
    if (!attemptId) return;
    const { data: report, error: reportError } = await this.database
      .from('assessment_reports')
      .select('id')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    if (reportError)
      throw repositoryError('Could not inspect feedback report.', reportError);
    if (!report) await this.enqueueAssessmentAnalysis(userId, attemptId);
  }

  async claimNextAnalysisJob(): Promise<AnalysisJobRow | null> {
    const now = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    let candidate = await this.findReadyJob(now);
    if (!candidate) {
      const { data, error } = await this.database
        .from('assessment_analysis_jobs')
        .select('*')
        .eq('status', 'running')
        .lt('lease_expires_at', now)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error)
        throw repositoryError('Could not recover analysis job.', error);
      candidate = (data as AnalysisJobRow | null) ?? null;
    }
    if (!candidate) return null;

    let claimQuery = this.database
      .from('assessment_analysis_jobs')
      .update({
        status: 'running',
        run_count: candidate.run_count + 1,
        lease_expires_at: leaseExpiresAt,
        last_error_code: null,
        last_error_message: null,
      })
      .eq('id', candidate.id)
      .eq('status', candidate.status);
    if (candidate.status === 'running' && candidate.lease_expires_at) {
      claimQuery = claimQuery.eq(
        'lease_expires_at',
        candidate.lease_expires_at,
      );
    }
    const { data, error } = await claimQuery.select('*').maybeSingle();
    if (error) throw repositoryError('Could not claim analysis job.', error);
    return (data as AnalysisJobRow | null) ?? null;
  }

  async loadAssessmentAnalysisInput(
    job: AnalysisJobRow,
  ): Promise<AssessmentAnalysisInput> {
    await this.ensurePersonaFromStoredProfile(job.user_id);
    const persona = await this.getPersona(job.user_id);
    if (!persona) {
      throw new LearningRepositoryError(
        'Assessment analysis requires a learner persona.',
        'persona_not_found',
      );
    }

    const { data: attemptData, error: attemptError } = await this.database
      .from('assessment_attempts')
      .select(
        'id, user_id, status, codex_thread_id, profile_snapshot, estimated_cefr, correct_count, unknown_count',
      )
      .eq('id', job.attempt_id)
      .eq('user_id', job.user_id)
      .single();
    if (attemptError)
      throw repositoryError('Could not load assessment.', attemptError);
    const attempt = attemptData as AttemptAnalysisRow;
    if (
      attempt.status !== 'completed' ||
      !attempt.codex_thread_id ||
      !attempt.estimated_cefr ||
      attempt.correct_count === null ||
      attempt.unknown_count === null
    ) {
      throw new LearningRepositoryError(
        'Assessment is not ready for detailed analysis.',
        'assessment_not_ready',
      );
    }

    const { data: rounds, error: roundError } = await this.database
      .from('assessment_rounds')
      .select('id, round_number')
      .eq('attempt_id', attempt.id)
      .eq('status', 'completed');
    if (roundError)
      throw repositoryError('Could not load assessment rounds.', roundError);
    const roundById = new Map(
      (rounds as Array<{ id: string; round_number: 1 | 2 | 3 }>).map(
        (round) => [round.id, round.round_number],
      ),
    );
    const { data: questions, error: questionError } = await this.database
      .from('assessment_questions')
      .select(
        'id, round_id, position, category, cefr_level, difficulty_rank, stem, options, learning_point',
      )
      .eq('attempt_id', attempt.id)
      .order('position', { ascending: true });
    if (questionError)
      throw repositoryError('Could not load questions.', questionError);
    if (questions.length !== 25) {
      throw new LearningRepositoryError(
        `Expected 25 assessment questions, found ${questions.length}.`,
        'assessment_questions_incomplete',
      );
    }
    const questionIds = questions.map((question) => question.id as string);
    const [keysResult, responsesResult] = await Promise.all([
      this.database
        .from('assessment_answer_keys')
        .select('question_id, correct_option_id, explanation_ja')
        .in('question_id', questionIds),
      this.database
        .from('assessment_responses')
        .select('question_id, selected_option_id, is_unknown')
        .in('question_id', questionIds),
    ]);
    if (keysResult.error)
      throw repositoryError('Could not load answer keys.', keysResult.error);
    if (responsesResult.error) {
      throw repositoryError(
        'Could not load learner answers.',
        responsesResult.error,
      );
    }
    const keyByQuestion = new Map(
      keysResult.data.map((key) => [key.question_id as string, key]),
    );
    const responseByQuestion = new Map(
      responsesResult.data.map((response) => [
        response.question_id as string,
        response,
      ]),
    );

    const preparedQuestions: AnalysisQuestionInput[] = questions
      .map((question) => {
        const round = roundById.get(question.round_id as string);
        const key = keyByQuestion.get(question.id as string);
        const response = responseByQuestion.get(question.id as string);
        if (!round || !key || !response) {
          throw new LearningRepositoryError(
            'Assessment detail data is incomplete.',
            'assessment_detail_incomplete',
          );
        }
        const selectedOptionId = response.selected_option_id as
          'A' | 'B' | 'C' | 'D' | null;
        const correctOptionId = key.correct_option_id as 'A' | 'B' | 'C' | 'D';
        const position = question.position as number;
        return {
          key: `r${round}-q${position}`,
          round,
          position,
          category: question.category as AnalysisQuestionInput['category'],
          cefrLevel: question.cefr_level as AnalysisQuestionInput['cefrLevel'],
          difficultyRank: question.difficulty_rank as number,
          stem: question.stem as string,
          options: question.options as AnalysisQuestionInput['options'],
          selectedOptionId,
          isUnknown: response.is_unknown as boolean,
          correctOptionId,
          isCorrect:
            !response.is_unknown && selectedOptionId === correctOptionId,
          explanationJa: key.explanation_ja as string,
          learningPoint: question.learning_point as string,
        };
      })
      .sort((a, b) => a.round - b.round || a.position - b.position);

    return {
      attemptId: attempt.id,
      userId: attempt.user_id,
      codexThreadId: attempt.codex_thread_id,
      profileSnapshot: attempt.profile_snapshot,
      persona,
      estimatedCefr: attempt.estimated_cefr,
      correct: attempt.correct_count,
      unknown: attempt.unknown_count,
      questions: preparedQuestions,
    };
  }

  async startAgentRun(
    userId: string,
    attemptId: string,
    threadId: string,
    promptVersion: string,
  ): Promise<void> {
    const { error } = await this.database.from('agent_runs').insert({
      user_id: userId,
      agent_kind: 'assessment',
      operation: 'assessment_analysis',
      source_id: attemptId,
      codex_thread_id: threadId,
      prompt_version: promptVersion,
      status: 'running',
    });
    if (error)
      throw repositoryError('Could not record Codex analysis run.', error);
  }

  async completeAssessmentAnalysis(
    input: AssessmentAnalysisInput,
    output: AssessmentAnalysisOutput,
    threadId: string,
    repairCount: number,
    promptVersion: string,
    buildReport: (id: string, createdAt: string) => AssessmentReport,
    reportMarkdown: (report: AssessmentReport) => string,
  ): Promise<AssessmentReport> {
    const reportId = randomUUID();
    const createdAt = new Date().toISOString();
    const report = assessmentReportSchema.parse(
      buildReport(reportId, createdAt),
    );
    const markdown = reportMarkdown(report);
    const metrics = await this.getMetrics(input.userId);
    const { error } = await this.database.rpc('complete_assessment_analysis', {
      p_user_id: input.userId,
      p_attempt_id: input.attemptId,
      p_expected_persona_version: input.persona.version,
      p_ai_inferred: personaAiInferredSchema.parse(output.personaInference),
      p_metrics: metrics,
      p_observation: {
        reportId,
        promptVersion,
        personaInference: output.personaInference,
      },
      p_report_id: reportId,
      p_prompt_version: promptVersion,
      p_codex_thread_id: threadId,
      p_report_payload: report,
      p_report_markdown: markdown,
      p_repair_count: repairCount,
    });
    if (error) {
      if (error.message.includes('persona_version_conflict')) {
        throw new LearningRepositoryError(
          'Persona changed while the assessment was being analyzed.',
          'persona_version_conflict',
        );
      }
      throw repositoryError('Could not save assessment analysis.', error);
    }
    return report;
  }

  async markAnalysisFailed(job: AnalysisJobRow, error: unknown): Promise<void> {
    const runCount = job.run_count;
    const terminal = runCount >= 3;
    const nextRetryAt = new Date(
      Date.now() + 2 ** runCount * 30_000,
    ).toISOString();
    const code =
      error instanceof LearningRepositoryError
        ? error.code
        : error instanceof Error
          ? error.name
          : 'analysis_failed';
    const message =
      error instanceof Error ? error.message : 'Unknown analysis failure';
    const { error: jobError } = await this.database
      .from('assessment_analysis_jobs')
      .update({
        status: 'failed',
        next_retry_at: terminal ? '9999-12-31T23:59:59.000Z' : nextRetryAt,
        lease_expires_at: null,
        last_error_code: code,
        last_error_message: message.slice(0, 2000),
      })
      .eq('id', job.id);
    if (jobError)
      throw repositoryError('Could not save analysis failure.', jobError);
    await this.database
      .from('agent_runs')
      .update({
        status: 'failed',
        error_code: code,
        completed_at: new Date().toISOString(),
      })
      .eq('source_id', job.attempt_id)
      .eq('operation', 'assessment_analysis')
      .eq('status', 'running');
  }

  async retryLatestFailedAnalysis(userId: string): Promise<void> {
    const latest = await this.getLatestCompletedAttemptId(userId);
    if (!latest) {
      throw new LearningRepositoryError(
        'Completed assessment not found.',
        'assessment_not_found',
      );
    }
    const { error } = await this.database
      .from('assessment_analysis_jobs')
      .update({
        status: 'pending',
        run_count: 0,
        next_retry_at: new Date().toISOString(),
        lease_expires_at: null,
        last_error_code: null,
        last_error_message: null,
      })
      .eq('attempt_id', latest)
      .eq('user_id', userId)
      .eq('status', 'failed');
    if (error)
      throw repositoryError('Could not retry assessment analysis.', error);
  }

  async getLatestAnalysisState(userId: string): Promise<{
    status: 'not_started' | 'pending' | 'running' | 'ready' | 'failed';
    message: string | null;
  }> {
    const attemptId = await this.getLatestCompletedAttemptId(userId);
    if (!attemptId) return { status: 'not_started', message: null };
    const { data: report, error: reportError } = await this.database
      .from('assessment_reports')
      .select('id')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    if (reportError)
      throw repositoryError('Could not load report status.', reportError);
    if (report) return { status: 'ready', message: null };
    const { data: job, error: jobError } = await this.database
      .from('assessment_analysis_jobs')
      .select('status, last_error_message')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    if (jobError)
      throw repositoryError('Could not load analysis status.', jobError);
    if (!job) return { status: 'not_started', message: null };
    return {
      status: job.status as 'pending' | 'running' | 'failed',
      message:
        job.status === 'failed'
          ? '詳細分析を完了できませんでした。再試行できます。'
          : null,
    };
  }

  async listReports(userId: string): Promise<AssessmentReportSummary[]> {
    const { data, error } = await this.database
      .from('assessment_reports')
      .select('report_payload')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw repositoryError('Could not load feedback history.', error);
    return data.map((row) =>
      summarizeReport(assessmentReportSchema.parse(row.report_payload)),
    );
  }

  async getLatestReport(
    userId: string,
  ): Promise<AssessmentReportSummary | null> {
    const reports = await this.listReports(userId);
    return reports[0] ?? null;
  }

  async getReport(userId: string, reportId: string): Promise<AssessmentReport> {
    const { data, error } = await this.database
      .from('assessment_reports')
      .select('report_payload')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();
    if (error) throw repositoryError('Feedback report was not found.', error);
    return assessmentReportSchema.parse(data.report_payload);
  }

  private async findReadyJob(now: string): Promise<AnalysisJobRow | null> {
    const { data, error } = await this.database
      .from('assessment_analysis_jobs')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lte('next_retry_at', now)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw repositoryError('Could not load pending analysis.', error);
    return (data as AnalysisJobRow | null) ?? null;
  }

  private async getPersonaRow(userId: string): Promise<PersonaRow | null> {
    const { data, error } = await this.database
      .from('learner_personas')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw repositoryError('Could not load learner persona.', error);
    return (data as PersonaRow | null) ?? null;
  }

  private async isPersonaInitialized(userId: string): Promise<boolean> {
    const [persona, revision] = await Promise.all([
      this.database
        .from('learner_personas')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),
      this.database
        .from('persona_revisions')
        .select('id')
        .eq('user_id', userId)
        .eq('version', 1)
        .maybeSingle(),
    ]);
    if (persona.error) {
      throw repositoryError(
        'Could not inspect learner persona.',
        persona.error,
      );
    }
    if (revision.error) {
      throw repositoryError(
        'Could not inspect persona history.',
        revision.error,
      );
    }
    return Boolean(persona.data && revision.data);
  }

  private async getMetrics(userId: string): Promise<PersonaMetrics> {
    const [attempts, responses, latest] = await Promise.all([
      this.database
        .from('assessment_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed'),
      this.database
        .from('assessment_responses')
        .select('question_id', { count: 'exact', head: true })
        .eq('user_id', userId),
      this.database
        .from('assessment_attempts')
        .select('estimated_cefr, completed_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (attempts.error)
      throw repositoryError('Could not count assessments.', attempts.error);
    if (responses.error)
      throw repositoryError('Could not count answers.', responses.error);
    if (latest.error)
      throw repositoryError('Could not load latest assessment.', latest.error);
    const rawLastAssessedAt =
      (latest.data?.completed_at as string | null) ?? null;
    const lastAssessedAt = rawLastAssessedAt
      ? normalizeDatabaseTimestamp(rawLastAssessedAt)
      : null;
    return personaMetricsSchema.parse({
      currentCefr: latest.data?.estimated_cefr ?? null,
      assessmentsCompleted: attempts.count ?? 0,
      assessmentQuestionsAnswered: responses.count ?? 0,
      learnedWords: 0,
      totalStudyMinutes: 0,
      lastAssessedAt,
      lastActivityAt: lastAssessedAt,
    });
  }

  private async getLatestCompletedAttemptId(
    userId: string,
  ): Promise<string | null> {
    const { data, error } = await this.database
      .from('assessment_attempts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not load latest assessment.', error);
    return (data?.id as string | undefined) ?? null;
  }
}

export function defaultUserAuthored(
  profile: LearnerProfile,
): PersonaUserAuthored {
  return personaUserAuthoredSchema.parse({
    currentSelfDescription: profile.selfAssessment,
    goals: { shortTerm: '', mediumTerm: '', longTerm: '' },
    motivation: '',
    interests: [],
    studyPurpose: '',
    dailyStudyMinutes: null,
    preferredMethods: [],
    difficultMethods: [],
    correctionNote: '',
    eikenGrade: profile.eikenGrade,
    toeicScore: profile.toeicScore,
  });
}

export function emptyAiInference(): PersonaAiInferred {
  return personaAiInferredSchema.parse({
    summaryJa: '',
    skillEstimates: null,
    strengths: [],
    weaknesses: [],
    errorPatterns: [],
    recommendedFocus: [],
    evidenceSummaryJa: '',
  });
}

function summarizeReport(report: AssessmentReport): AssessmentReportSummary {
  return {
    id: report.id,
    attemptId: report.attemptId,
    createdAt: report.createdAt,
    estimatedCefr: report.estimatedCefr,
    correct: report.correct,
    total: report.total,
    unknown: report.unknown,
    executiveSummaryJa: report.executiveSummaryJa,
  };
}

function repositoryError(
  message: string,
  error: { code?: string; message?: string },
): LearningRepositoryError {
  return new LearningRepositoryError(
    `${message} ${error.message ?? ''}`.trim(),
    error.code ?? null,
  );
}

function normalizeDatabaseTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new LearningRepositoryError(
      'Supabase returned an invalid timestamp.',
      'invalid_database_timestamp',
    );
  }
  return timestamp.toISOString();
}
