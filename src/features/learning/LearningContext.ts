import { createContext } from 'react';
import type {
  LearnerPersona,
  LearningOverview,
  PersonaUserAuthored,
} from '@shared/learning/contracts';

export type LearningContextValue = {
  overview: LearningOverview | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  refresh: (showLoading?: boolean) => Promise<void>;
  savePersona: (
    expectedVersion: number,
    userAuthored: PersonaUserAuthored,
  ) => Promise<LearnerPersona>;
  retryAnalysis: () => Promise<void>;
};

export const LearningContext = createContext<LearningContextValue | undefined>(
  undefined,
);
