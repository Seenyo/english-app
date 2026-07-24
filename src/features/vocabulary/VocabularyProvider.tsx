import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AnswerVocabularyMemoryRequest,
  StartVocabularyMemoryRequest,
  StartVocabularySessionRequest,
  VocabularyMemoryOverview,
  VocabularyOverview,
} from '@shared/vocabulary/contracts';
import { useAuth } from '@/features/auth';
import {
  answerDeveloperPreviewMemoryCard,
  createDeveloperPreviewMemoryState,
  developerPreviewMemoryOverview,
  developerPreviewVocabularyOverview,
  isDeveloperPreview,
  toDeveloperPreviewMemorySession,
  type DeveloperPreviewMemoryState,
} from '@/features/developer-preview';
import { useLearning } from '@/features/learning';
import {
  answerVocabularyMemoryCard,
  finishVocabularySession,
  getResumableVocabularySession,
  getVocabularyMemoryOverview,
  getVocabularyOverview,
  getVocabularySession,
  saveVocabularyOperations,
  startVocabularyMemorySession,
  startVocabularySession,
} from './api';
import {
  VocabularyContext,
  type VocabularyContextValue,
} from './VocabularyContext';

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { refresh: refreshLearning } = useLearning();
  const sessionRef = useRef(session);
  const loadedUserId = useRef<string | null>(null);
  const previewMemoryState = useRef<DeveloperPreviewMemoryState | null>(null);
  const [overview, setOverview] = useState<VocabularyOverview | null>(
    isDeveloperPreview ? developerPreviewVocabularyOverview : null,
  );
  const [memoryOverview, setMemoryOverview] =
    useState<VocabularyMemoryOverview | null>(
      isDeveloperPreview ? developerPreviewMemoryOverview : null,
    );
  const [isLoading, setIsLoading] = useState(
    isDeveloperPreview ? false : Boolean(session),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refresh = useCallback(async () => {
    if (isDeveloperPreview) {
      setOverview(developerPreviewVocabularyOverview);
      setMemoryOverview(developerPreviewMemoryOverview);
      setIsLoading(false);
      setError(null);
      return;
    }
    const current = sessionRef.current;
    if (!current) {
      setOverview(null);
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const [nextOverview, nextMemoryOverview] = await Promise.all([
        getVocabularyOverview(current.access_token),
        getVocabularyMemoryOverview(current.access_token),
      ]);
      setOverview(nextOverview);
      setMemoryOverview(nextMemoryOverview);
    } catch (requestError) {
      setError(humanizeError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      loadedUserId.current = null;
      setOverview(null);
      setMemoryOverview(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (loadedUserId.current === userId) return;
    loadedUserId.current = userId;
    setIsLoading(true);
    void refresh();
  }, [refresh, session?.user.id]);

  const value = useMemo<VocabularyContextValue>(
    () => ({
      overview,
      memoryOverview,
      isLoading,
      error,
      refresh,
      async startSession(request: StartVocabularySessionRequest) {
        if (isDeveloperPreview) {
          void request;
          throw new Error(
            '習熟度チェックのPreview fixtureはまだ追加されていません。',
          );
        }
        const current = requireSession(sessionRef.current);
        const result = await startVocabularySession(
          current.access_token,
          request,
        );
        await refresh();
        if (result.outcome === 'completed') await refreshLearning(false);
        return result;
      },
      async resumeSession(kind) {
        if (isDeveloperPreview) {
          void kind;
          return null;
        }
        const current = requireSession(sessionRef.current);
        return getResumableVocabularySession(current.access_token, kind);
      },
      async loadSession(sessionId) {
        if (isDeveloperPreview) {
          void sessionId;
          throw new Error(
            '習熟度チェックのPreview fixtureはまだ追加されていません。',
          );
        }
        const current = requireSession(sessionRef.current);
        return getVocabularySession(current.access_token, sessionId);
      },
      async saveOperations(sessionId, operations, position) {
        if (isDeveloperPreview) {
          void sessionId;
          void operations;
          void position;
          return;
        }
        const current = requireSession(sessionRef.current);
        await saveVocabularyOperations(
          current.access_token,
          sessionId,
          operations,
          position,
        );
      },
      async finishSession(sessionId, status, position) {
        if (isDeveloperPreview) {
          void sessionId;
          void status;
          void position;
          return;
        }
        const current = requireSession(sessionRef.current);
        await finishVocabularySession(
          current.access_token,
          sessionId,
          status,
          position,
        );
        await Promise.all([refresh(), refreshLearning(false)]);
      },
      async startMemorySession(request: StartVocabularyMemoryRequest) {
        if (isDeveloperPreview) {
          let current = previewMemoryState.current;
          if (
            !current ||
            current.kind !== request.kind ||
            current.section !== request.section ||
            toDeveloperPreviewMemorySession(current).status === 'completed'
          ) {
            current = createDeveloperPreviewMemoryState(
              request.kind,
              request.section,
            );
            previewMemoryState.current = current;
          }
          setMemoryOverview((overview) =>
            overview ? { ...overview, hasActiveSession: true } : overview,
          );
          return toDeveloperPreviewMemorySession(current);
        }
        const current = requireSession(sessionRef.current);
        const memorySession = await startVocabularyMemorySession(
          current.access_token,
          request,
        );
        setMemoryOverview((overview) =>
          overview ? { ...overview, hasActiveSession: true } : overview,
        );
        return memorySession;
      },
      async answerMemoryCard(
        sessionId: string,
        input: AnswerVocabularyMemoryRequest,
      ) {
        if (isDeveloperPreview) {
          const current = previewMemoryState.current;
          if (!current || current.sessionId !== sessionId) {
            throw new Error('Preview暗記セッションが見つかりません。');
          }
          const memorySession = answerDeveloperPreviewMemoryCard(
            current,
            input.itemId,
            input.result,
          );
          if (memorySession.status === 'completed') {
            setMemoryOverview((overview) =>
              overview
                ? {
                    ...overview,
                    hasActiveSession: false,
                    streakDays: Math.max(1, overview.streakDays),
                    lastMemorizedAt: new Date().toISOString(),
                  }
                : overview,
            );
          }
          return memorySession;
        }
        const current = requireSession(sessionRef.current);
        const memorySession = await answerVocabularyMemoryCard(
          current.access_token,
          sessionId,
          input,
        );
        if (memorySession.status === 'completed') {
          await refresh();
        }
        return memorySession;
      },
    }),
    [error, isLoading, memoryOverview, overview, refresh, refreshLearning],
  );

  return (
    <VocabularyContext.Provider value={value}>
      {children}
    </VocabularyContext.Provider>
  );
}

function requireSession<T>(session: T | null): T {
  if (!session) throw new Error('ログインが必要です。');
  return session;
}

function humanizeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : '単語・熟語の進捗を読み込めませんでした。';
}
