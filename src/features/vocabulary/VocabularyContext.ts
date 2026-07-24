import { createContext } from 'react';
import type {
  AnswerVocabularyMemoryRequest,
  StartVocabularySessionRequest,
  StartVocabularyMemoryRequest,
  StartVocabularySessionResult,
  VocabularyKind,
  VocabularyMemoryOverview,
  VocabularyMemorySession,
  VocabularyOperation,
  VocabularyOverview,
  VocabularySession,
} from '@shared/vocabulary/contracts';

export type VocabularyContextValue = {
  overview: VocabularyOverview | null;
  memoryOverview: VocabularyMemoryOverview | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startSession: (
    request: StartVocabularySessionRequest,
  ) => Promise<StartVocabularySessionResult>;
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
  startMemorySession: (
    request: StartVocabularyMemoryRequest,
  ) => Promise<VocabularyMemorySession>;
  answerMemoryCard: (
    sessionId: string,
    input: AnswerVocabularyMemoryRequest,
  ) => Promise<VocabularyMemorySession>;
};

export const VocabularyContext = createContext<
  VocabularyContextValue | undefined
>(undefined);
