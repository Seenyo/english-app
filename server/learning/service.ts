import type { User } from '@supabase/supabase-js';
import type { ThreadFactory } from '../assessment/generator.ts';
import type { ServerConfig } from '../config.ts';
import {
  learningOverviewSchema,
  type AssessmentReport,
  type LearnerPersona,
  type LearningOverview,
  type PersonaUserAuthored,
} from '../../shared/learning/contracts.ts';
import type { LearnerProfile } from '../../shared/assessment/contracts.ts';
import {
  assessmentAnalysisPromptVersion,
  generateAssessmentAnalysis,
} from './analysis.ts';
import { renderAssessmentReportMarkdown } from './markdown.ts';
import { LearningRepository, LearningRepositoryError } from './repository.ts';

export class LearningService {
  private processorRunning = false;
  private readonly retryTimer: ReturnType<typeof setInterval> | null;

  constructor(
    private readonly config: ServerConfig,
    private readonly repository: LearningRepository,
    private readonly threadFactory: ThreadFactory | null,
  ) {
    this.retryTimer =
      config.assessmentMode === 'live' && threadFactory
        ? setInterval(() => this.kick(), 15_000)
        : null;
    this.retryTimer?.unref();
  }

  static create(config: ServerConfig, threadFactory: ThreadFactory | null) {
    return new LearningService(
      config,
      new LearningRepository(config),
      threadFactory,
    );
  }

  async preparePersona(userId: string, profile: LearnerProfile): Promise<void> {
    if (this.config.assessmentMode === 'dry-run') return;
    await this.repository.ensurePersona(userId, profile);
  }

  async queueAssessmentAnalysis(
    userId: string,
    attemptId: string,
  ): Promise<void> {
    if (this.config.assessmentMode === 'dry-run') return;
    await this.repository.enqueueAssessmentAnalysis(userId, attemptId);
    this.kick();
  }

  async getOverview(user: User): Promise<LearningOverview> {
    if (this.config.assessmentMode === 'dry-run') {
      return learningOverviewSchema.parse({
        mode: 'dry-run',
        analysisStatus: 'unavailable',
        analysisMessage: 'Dry-runではCodex分析とプロフィール更新を行いません。',
        persona: null,
        latestReport: null,
      });
    }
    await this.repository.ensurePersonaFromStoredProfile(user.id);
    await this.repository.ensureLatestAssessmentAnalysis(user.id);
    this.kick();
    const analysis = await this.repository.getLatestAnalysisState(user.id);
    return learningOverviewSchema.parse({
      mode: 'live',
      analysisStatus: analysis.status,
      analysisMessage: analysis.message,
      persona: await this.repository.getPersona(user.id),
      latestReport: await this.repository.getLatestReport(user.id),
    });
  }

  async getPersona(user: User): Promise<LearnerPersona | null> {
    if (this.config.assessmentMode === 'dry-run') return null;
    await this.repository.ensurePersonaFromStoredProfile(user.id);
    return this.repository.getPersona(user.id);
  }

  async updatePersona(
    user: User,
    expectedVersion: number,
    userAuthored: PersonaUserAuthored,
  ): Promise<LearnerPersona> {
    if (this.config.assessmentMode === 'dry-run') {
      throw new LearningRepositoryError(
        'Dry-runではプロフィールを保存しません。',
        'dry_run_unavailable',
      );
    }
    return this.repository.updatePersonaUserAuthored(
      user.id,
      expectedVersion,
      userAuthored,
    );
  }

  async listReports(user: User) {
    if (this.config.assessmentMode === 'dry-run') return [];
    return this.repository.listReports(user.id);
  }

  async getReport(user: User, reportId: string): Promise<AssessmentReport> {
    if (this.config.assessmentMode === 'dry-run') {
      throw new LearningRepositoryError(
        'Dry-runではフィードバックを生成しません。',
        'dry_run_unavailable',
      );
    }
    return this.repository.getReport(user.id, reportId);
  }

  async retryLatestAnalysis(user: User): Promise<void> {
    if (this.config.assessmentMode === 'dry-run') return;
    await this.repository.retryLatestFailedAnalysis(user.id);
    this.kick();
  }

  kick(): void {
    if (
      this.config.assessmentMode === 'dry-run' ||
      !this.threadFactory ||
      this.processorRunning
    ) {
      return;
    }
    this.processorRunning = true;
    void this.processJobs().finally(() => {
      this.processorRunning = false;
    });
  }

  private async processJobs(): Promise<void> {
    if (!this.threadFactory) return;
    for (;;) {
      const job = await this.repository
        .claimNextAnalysisJob()
        .catch((error) => {
          console.error('Could not claim assessment analysis job:', error);
          return null;
        });
      if (!job) return;
      try {
        const input = await this.repository.loadAssessmentAnalysisInput(job);
        await this.repository.startAgentRun(
          input.userId,
          input.attemptId,
          input.codexThreadId,
          assessmentAnalysisPromptVersion,
        );
        const generated = await generateAssessmentAnalysis(input, {
          threadFactory: this.threadFactory,
          maxRepairAttempts: this.config.repairAttempts,
        });
        const feedbackByKey = new Map(
          generated.output.questionFeedback.map((feedback) => [
            feedback.questionKey,
            feedback.diagnosticCommentJa,
          ]),
        );
        await this.repository.completeAssessmentAnalysis(
          input,
          generated.output,
          generated.threadId,
          generated.repairCount,
          assessmentAnalysisPromptVersion,
          (id, createdAt) => ({
            id,
            attemptId: input.attemptId,
            createdAt,
            estimatedCefr: input.estimatedCefr,
            correct: input.correct,
            total: 25,
            unknown: input.unknown,
            executiveSummaryJa: generated.output.executiveSummaryJa,
            scoreInterpretationJa: generated.output.scoreInterpretationJa,
            strengths: generated.output.strengths,
            priorities: generated.output.priorities,
            studyPlan: generated.output.studyPlan,
            questions: input.questions.map((question) => ({
              ...question,
              diagnosticCommentJa: feedbackByKey.get(question.key) ?? '',
            })),
          }),
          renderAssessmentReportMarkdown,
        );
      } catch (error) {
        console.error(
          `Assessment analysis failed for attempt ${job.attempt_id}:`,
          error,
        );
        await this.repository
          .markAnalysisFailed(job, error)
          .catch((saveError) => {
            console.error(
              'Could not persist assessment analysis failure:',
              saveError,
            );
          });
      }
    }
  }
}
