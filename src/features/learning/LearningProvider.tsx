import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  LearnerPersona,
  LearningOverview,
  PersonaUserAuthored,
} from '@shared/learning/contracts';
import { useAssessment } from '@/features/assessment';
import { useAuth } from '@/features/auth';
import { getLearningOverview, retryLatestAnalysis, updatePersona } from './api';
import { LearningContext, type LearningContextValue } from './LearningContext';

export function LearningProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { state: assessmentState } = useAssessment();
  const sessionRef = useRef(session);
  const loadedUserId = useRef<string | null>(null);
  const lastCompletedAttempt = useRef<string | null>(null);
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refresh = useCallback(async (showLoading = true) => {
    const current = sessionRef.current;
    if (!current) {
      setOverview(null);
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      setOverview(await getLearningOverview(current.access_token));
    } catch (requestError) {
      setError(humanizeError(requestError));
    } finally {
      if (showLoading) setIsLoading(false);
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
    void refresh();
  }, [refresh, session?.user.id]);

  useEffect(() => {
    if (assessmentState?.status !== 'completed') return;
    if (lastCompletedAttempt.current === assessmentState.attemptId) return;
    lastCompletedAttempt.current = assessmentState.attemptId;
    void refresh(false);
  }, [assessmentState, refresh]);

  useEffect(() => {
    if (
      overview?.analysisStatus !== 'pending' &&
      overview?.analysisStatus !== 'running'
    ) {
      return;
    }
    const interval = window.setInterval(() => void refresh(false), 5_000);
    return () => window.clearInterval(interval);
  }, [overview?.analysisStatus, refresh]);

  const value = useMemo<LearningContextValue>(
    () => ({
      overview,
      isLoading,
      isSaving,
      error,
      refresh,
      async savePersona(
        expectedVersion: number,
        userAuthored: PersonaUserAuthored,
      ): Promise<LearnerPersona> {
        const current = sessionRef.current;
        if (!current) throw new Error('ログインが必要です。');
        setIsSaving(true);
        setError(null);
        try {
          const persona = await updatePersona(
            current.access_token,
            expectedVersion,
            userAuthored,
          );
          setOverview((previous) =>
            previous ? { ...previous, persona } : previous,
          );
          return persona;
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setIsSaving(false);
        }
      },
      async retryAnalysis() {
        const current = sessionRef.current;
        if (!current) return;
        setIsSaving(true);
        setError(null);
        try {
          await retryLatestAnalysis(current.access_token);
          await refresh(false);
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setIsSaving(false);
        }
      },
    }),
    [error, isLoading, isSaving, overview, refresh],
  );

  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  );
}

function humanizeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '学習データを読み込めませんでした。';
}
