import type { User } from '@supabase/supabase-js';
import type {
  AnswerSelection,
  AssessmentSnapshot,
  LearnerProfile,
} from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import { HttpError } from '../http/errors.ts';
import { DryRunRepository } from './dry-run-repository.ts';
import { AssessmentRepositoryError } from './repository.ts';

export class DryRunAssessmentService {
  private operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly repository: DryRunRepository) {}

  static create(config: ServerConfig) {
    return new DryRunAssessmentService(new DryRunRepository(config));
  }

  async getSnapshot(user: User): Promise<AssessmentSnapshot> {
    return { mode: 'dry-run', state: await this.repository.loadState(user.id) };
  }

  async start(user: User, profile: LearnerProfile): Promise<AssessmentSnapshot> {
    void profile;
    return this.runExclusive(async () => {
      await this.repository.createAttempt(user.id);
      return this.getSnapshot(user);
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
  ): Promise<AssessmentSnapshot> {
    return this.runExclusive(async () => {
      const attempt = await this.repository.getOwnedAttempt(user.id, attemptId);
      try {
        await this.repository.completeRound(attempt, round);
      } catch (error) {
        if (
          error instanceof AssessmentRepositoryError &&
          (error.code === 'round_incomplete' || error.code === 'round_mismatch')
        ) {
          throw new HttpError(409, error.message, error.code);
        }
        throw error;
      }
      return this.getSnapshot(user);
    });
  }

  async retry(user: User): Promise<AssessmentSnapshot> {
    return this.getSnapshot(user);
  }

  async abandon(user: User): Promise<AssessmentSnapshot> {
    return this.runExclusive(async () => {
      await this.repository.abandonActiveAttempt(user.id);
      return { mode: 'dry-run', state: { status: 'not_started' } };
    });
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
