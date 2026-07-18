import type { User } from '@supabase/supabase-js';
import type {
  AnswerSelection,
  AssessmentState,
  LearnerProfile,
} from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import { HttpError } from '../http/errors.ts';
import {
  AssessmentGenerationError,
  generateAssessmentRound,
  type ThreadFactory,
} from './generator.ts';
import {
  AssessmentRepository,
  AssessmentRepositoryError,
  type AttemptRow,
} from './repository.ts';
import { estimateCefr, scoreRound } from './scoring.ts';

const retakeIntervalMilliseconds = 30 * 24 * 60 * 60 * 1000;

export class AssessmentService {
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: AssessmentRepository,
    private readonly threadFactory: ThreadFactory,
    private readonly repairAttempts: number,
  ) {}

  static create(config: ServerConfig, threadFactory: ThreadFactory) {
    return new AssessmentService(
      new AssessmentRepository(config),
      threadFactory,
      config.repairAttempts,
    );
  }

  async getState(user: User): Promise<AssessmentState> {
    return this.repository.loadState(user.id);
  }

  async start(user: User, profile: LearnerProfile): Promise<AssessmentState> {
    return this.runExclusive(async () => {
      const active = await this.repository.findActiveAttempt(user.id);
      if (active) return this.repository.loadState(user.id);

      const latest = await this.repository.findLatestCompletedAttempt(user.id);
      if (latest?.completed_at) {
        const availableAt =
          new Date(latest.completed_at).getTime() + retakeIntervalMilliseconds;
        if (availableAt > Date.now()) {
          throw new HttpError(
            409,
            `次回のレベル測定は${new Date(availableAt).toLocaleDateString('ja-JP')}から受けられます。`,
            'retake_not_available',
          );
        }
      }

      await this.repository.upsertProfile(user.id, profile);
      const attempt = await this.repository.createAttempt(user.id, profile);
      await this.generateRound(attempt, 1);
      return this.repository.loadState(user.id);
    });
  }

  async saveAnswer(
    user: User,
    attemptId: string,
    questionId: string,
    answer: AnswerSelection,
  ): Promise<void> {
    const attempt = await this.repository.getOwnedAttempt(user.id, attemptId);
    await this.repository.saveAnswer(attempt, questionId, answer);
  }

  async completeRound(
    user: User,
    attemptId: string,
    round: 1 | 2 | 3,
  ): Promise<AssessmentState> {
    return this.runExclusive(async () => {
      const attempt = await this.repository.getOwnedAttempt(user.id, attemptId);
      if (attempt.current_round !== round) {
        throw new HttpError(
          409,
          'このラウンドは現在の測定状態と一致しません。',
          'round_mismatch',
        );
      }

      const roundStatus = await this.repository.getRoundStatus(
        attempt.id,
        round,
      );
      if (roundStatus !== 'completed') {
        let questions;
        try {
          questions = await this.repository.loadRoundForScoring(attempt, round);
        } catch (error) {
          if (
            error instanceof AssessmentRepositoryError &&
            error.code === 'round_incomplete'
          ) {
            throw new HttpError(409, error.message, error.code);
          }
          throw error;
        }
        await this.repository.saveRoundScore(
          attempt,
          scoreRound(round, questions),
        );
      }

      if (round === 3) {
        const allQuestions =
          await this.repository.loadAllScoringQuestions(attempt);
        await this.repository.completeAttempt(
          attempt,
          estimateCefr(allQuestions),
        );
        return this.repository.loadState(user.id);
      }

      await this.generateRound(attempt, (round + 1) as 2 | 3);
      return this.repository.loadState(user.id);
    });
  }

  async retry(user: User, attemptId: string): Promise<AssessmentState> {
    return this.runExclusive(async () => {
      const attempt = await this.repository.getOwnedAttempt(user.id, attemptId);
      const staleGeneration =
        attempt.status === 'generating' &&
        Date.now() - new Date(attempt.updated_at).getTime() > 90_000;
      if (attempt.status !== 'failed' && !staleGeneration) {
        return this.repository.loadState(user.id);
      }
      await this.generateRound(attempt, attempt.current_round);
      return this.repository.loadState(user.id);
    });
  }

  private async generateRound(
    attempt: AttemptRow,
    round: 1 | 2 | 3,
  ): Promise<void> {
    await this.repository.markRoundGenerating(attempt, round);
    try {
      const previousResults = await this.repository.getPreviousResults(
        attempt.id,
      );
      const generated = await generateAssessmentRound(
        {
          round,
          threadId: round === 1 ? null : attempt.codex_thread_id,
          profile: attempt.profile_snapshot,
          previousResults,
        },
        {
          threadFactory: this.threadFactory,
          maxRepairAttempts: this.repairAttempts,
        },
      );
      await this.repository.saveGeneratedRound(
        attempt,
        generated.batch,
        generated.threadId,
        generated.repairCount,
      );
    } catch (error) {
      const threadId =
        error instanceof AssessmentGenerationError
          ? error.threadId
          : attempt.codex_thread_id;
      const code =
        error instanceof AssessmentGenerationError
          ? 'invalid_codex_output'
          : 'generation_failed';
      await this.repository.markGenerationFailed(
        attempt,
        round,
        code,
        threadId,
      );
    }
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release: () => void = () => undefined;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
