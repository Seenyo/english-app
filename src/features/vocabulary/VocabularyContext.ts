import { createContext } from 'react';
import type {
  StartVocabularySessionRequest,
  VocabularyKind,
  VocabularyOperation,
  VocabularyOverview,
  VocabularySession,
} from '@shared/vocabulary/contracts';

export type VocabularyContextValue = {
  overview: VocabularyOverview | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startSession: (
    request: StartVocabularySessionRequest,
  ) => Promise<VocabularySession>;
  resumeSession: (kind: VocabularyKind) => Promise<VocabularySession | null>;
  loadSession: (sessionId: string) => Promise<VocabularySession>;
  saveOperations: (
    sessionId: string,
    operations: VocabularyOperation[],
    position: number,
  ) => Promise<void>;
  finishSession: (
    sessionId: string,
    status: 'paused' | 'completed',
    position: number,
  ) => Promise<void>;
};

export const VocabularyContext = createContext<
  VocabularyContextValue | undefined
>(undefined);
