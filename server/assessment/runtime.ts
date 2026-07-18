import type { User } from '@supabase/supabase-js';
import type {
  AnswerSelection,
  AssessmentSnapshot,
  LearnerProfile,
} from '../../shared/assessment/contracts.ts';
import type { ServerConfig } from '../config.ts';
import { HttpError } from '../http/errors.ts';
import { DryRunAssessmentService } from './dry-run-service.ts';
import { createAssessmentThreadFactory } from './generator.ts';
import { AssessmentService } from './service.ts';
import type { ThreadFactory } from './generator.ts';
import type { LearningService } from '../learning/service.ts';

export type AssessmentRuntime = {
  getSnapshot(user: User): Promise<AssessmentSnapshot>;
  start(user: User, profile: LearnerProfile): Promise<AssessmentSnapshot>;
  saveAnswer(
    user: User,
    attemptId: string,
    questionId: string,
    answer: AnswerSelection,
  ): Promise<void>;
  completeRound(
    user: User,
    attemptId: string,
    round: 1 | 2 | 3,
  ): Promise<AssessmentSnapshot>;
  retry(user: User, attemptId: string): Promise<AssessmentSnapshot>;
  abandon(user: User): Promise<AssessmentSnapshot>;
};

export function createAssessmentRuntime(
  config: ServerConfig,
  threadFactory: ThreadFactory | null,
  learningService: LearningService,
): AssessmentRuntime {
  if (config.assessmentMode === 'dry-run') {
    return DryRunAssessmentService.create(config);
  }

  const service = AssessmentService.create(
    config,
    threadFactory ?? createAssessmentThreadFactory(config),
  );
  return {
    async getSnapshot(user) {
      return { mode: 'live', state: await service.getState(user) };
    },
    async start(user, profile) {
      await learningService.preparePersona(user.id, profile);
      return { mode: 'live', state: await service.start(user, profile) };
    },
    saveAnswer(user, attemptId, questionId, answer) {
      return service.saveAnswer(user, attemptId, questionId, answer);
    },
    async completeRound(user, attemptId, round) {
      const state = await service.completeRound(user, attemptId, round);
      if (round === 3 && state.status === 'completed') {
        try {
          await learningService.queueAssessmentAnalysis(user.id, attemptId);
        } catch (error) {
          // Scoring is already committed. Never trap the learner on Question 25
          // because the separate analysis queue is temporarily unavailable;
          // the home overview backfills this durable job on its next request.
          console.error(
            'Could not queue completed assessment analysis:',
            error,
          );
        }
      }
      return {
        mode: 'live',
        state,
      };
    },
    async retry(user, attemptId) {
      return { mode: 'live', state: await service.retry(user, attemptId) };
    },
    async abandon() {
      throw new HttpError(
        404,
        'Restarting an active attempt is available only in dry-run mode.',
        'route_not_available',
      );
    },
  };
}
