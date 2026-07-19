import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  StartVocabularySessionRequest,
  VocabularyOverview,
} from '@shared/vocabulary/contracts';
import { useAuth } from '@/features/auth';
import {
  finishVocabularySession,
  getResumableVocabularySession,
  getVocabularyOverview,
  getVocabularySession,
  saveVocabularyOperations,
  startVocabularySession,
} from './api';
import {
  VocabularyContext,
  type VocabularyContextValue,
} from './VocabularyContext';

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const sessionRef = useRef(session);
  const loadedUserId = useRef<string | null>(null);
  const [overview, setOverview] = useState<VocabularyOverview | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) {
      setOverview(null);
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      setOverview(await getVocabularyOverview(current.access_token));
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
      isLoading,
      error,
      refresh,
      async startSession(request: StartVocabularySessionRequest) {
        const current = requireSession(sessionRef.current);
        const result = await startVocabularySession(
          current.access_token,
          request,
        );
        void refresh();
        return result;
      },
      async resumeSession(kind) {
        const current = requireSession(sessionRef.current);
        return getResumableVocabularySession(current.access_token, kind);
      },
      async loadSession(sessionId) {
        const current = requireSession(sessionRef.current);
        return getVocabularySession(current.access_token, sessionId);
      },
      async saveOperations(sessionId, operations, position) {
        const current = requireSession(sessionRef.current);
        await saveVocabularyOperations(
          current.access_token,
          sessionId,
          operations,
          position,
        );
      },
      async finishSession(sessionId, status, position) {
        const current = requireSession(sessionRef.current);
        await finishVocabularySession(
          current.access_token,
          sessionId,
          status,
          position,
        );
        await refresh();
      },
    }),
    [error, isLoading, overview, refresh],
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
