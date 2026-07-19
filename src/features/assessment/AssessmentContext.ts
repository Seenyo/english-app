import { createContext } from 'react';
import type {
  AnswerSelection,
  AssessmentMode,
  AssessmentState,
  LearnerProfile,
} from '@shared/assessment/contracts';

export type AssessmentContextValue = {
  state: AssessmentState | null;
  mode: AssessmentMode | null;
  isLoading: boolean;
  isWorking: boolean;
  activity: AssessmentActivity;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  start: (profile: LearnerProfile) => Promise<void>;
  saveAnswer: (
    attemptId: string,
    round: 1 | 2 | 3,
    questionId: string,
    answer: AnswerSelection,
  ) => Promise<void>;
  completeRound: (attemptId: string, round: 1 | 2 | 3) => Promise<void>;
  retry: (attemptId: string) => Promise<void>;
  abandon: () => Promise<void>;
};

export type AssessmentActivity = 'starting' | 'adapting' | 'finalizing' | null;

export const AssessmentContext = createContext<
  AssessmentContextValue | undefined
>(undefined);
