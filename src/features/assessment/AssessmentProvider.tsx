import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AnswerSelection,
  AssessmentMode,
  AssessmentState,
  LearnerProfile,
} from '@shared/assessment/contracts';
import { useAuth } from '@/features/auth';
import {
  abandonDryRun,
  completeAssessmentRound,
  getAssessmentSnapshot,
  retryAssessmentGeneration,
  saveAssessmentAnswer,
  startAssessment,
} from './api';
import {
  AssessmentContext,
  type AssessmentActivity,
  type AssessmentContextValue,
} from './AssessmentContext';

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const sessionRef = useRef(session);
  const loadedUserId = useRef<string | null>(null);
  const [state, setState] = useState<AssessmentState | null>(null);
  const [mode, setMode] = useState<AssessmentMode | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [isWorking, setIsWorking] = useState(false);
  const [activity, setActivity] = useState<AssessmentActivity>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const loadState = useCallback(async (showLoading: boolean) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      setState(null);
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const snapshot = await getAssessmentSnapshot(currentSession.access_token);
      setMode(snapshot.mode);
      setState(snapshot.state);
    } catch (requestError) {
      setError(humanizeError(requestError));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => loadState(true), [loadState]);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      loadedUserId.current = null;
      setState(null);
      setMode(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (loadedUserId.current === userId) return;
    loadedUserId.current = userId;
    void refresh();
  }, [refresh, session?.user.id]);

  useEffect(() => {
    if (state?.status !== 'generating' || activity) return;
    const interval = window.setInterval(() => {
      void loadState(false);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [activity, loadState, state?.status]);

  const value = useMemo<AssessmentContextValue>(
    () => ({
      state,
      mode,
      isLoading,
      isWorking,
      activity,
      error,
      clearError: () => setError(null),
      refresh,
      async start(profile: LearnerProfile) {
        const currentSession = sessionRef.current;
        if (!currentSession) return;
        setIsWorking(true);
        setActivity('starting');
        setError(null);
        try {
          const requestStartedAt = Date.now();
          const snapshot = await startAssessment(
            currentSession.access_token,
            profile,
          );
          if (snapshot.mode === 'dry-run') {
            await waitForMinimumDuration(requestStartedAt, 10_000);
          }
          setMode(snapshot.mode);
          setState(snapshot.state);
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setActivity(null);
          setIsWorking(false);
        }
      },
      async saveAnswer(
        attemptId: string,
        questionId: string,
        answer: AnswerSelection,
      ) {
        const currentSession = sessionRef.current;
        if (!currentSession) return;
        setError(null);
        try {
          await saveAssessmentAnswer(
            currentSession.access_token,
            attemptId,
            questionId,
            answer,
          );
          setState((current) => updateAnswer(current, questionId, answer));
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        }
      },
      async completeRound(attemptId: string, round: 1 | 2 | 3) {
        const currentSession = sessionRef.current;
        if (!currentSession) return;
        setIsWorking(true);
        const shouldShowActivity = mode !== 'dry-run' || round < 3;
        setActivity(
          shouldShowActivity
            ? round === 3
              ? 'finalizing'
              : 'adapting'
            : null,
        );
        setError(null);
        try {
          const requestStartedAt = Date.now();
          const snapshot = await completeAssessmentRound(
            currentSession.access_token,
            attemptId,
            round,
          );
          if (snapshot.mode === 'dry-run' && round < 3) {
            await waitForMinimumDuration(requestStartedAt, 10_000);
          }
          setMode(snapshot.mode);
          setState(snapshot.state);
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setActivity(null);
          setIsWorking(false);
        }
      },
      async retry(attemptId: string) {
        const currentSession = sessionRef.current;
        if (!currentSession) return;
        setIsWorking(true);
        setActivity(
          state?.status === 'failed' && state.round === 1
            ? 'starting'
            : 'adapting',
        );
        setError(null);
        try {
          const snapshot = await retryAssessmentGeneration(
            currentSession.access_token,
            attemptId,
          );
          setMode(snapshot.mode);
          setState(snapshot.state);
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setActivity(null);
          setIsWorking(false);
        }
      },
      async abandon() {
        const currentSession = sessionRef.current;
        if (!currentSession || mode !== 'dry-run') return;
        setIsWorking(true);
        setError(null);
        try {
          const snapshot = await abandonDryRun(currentSession.access_token);
          setMode(snapshot.mode);
          setState(snapshot.state);
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setIsWorking(false);
        }
      },
    }),
    [activity, error, isLoading, isWorking, mode, refresh, state],
  );

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
}

async function waitForMinimumDuration(
  startedAt: number,
  minimumMilliseconds: number,
): Promise<void> {
  const remaining = minimumMilliseconds - (Date.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
}

function updateAnswer(
  state: AssessmentState | null,
  questionId: string,
  answer: AnswerSelection,
): AssessmentState | null {
  if (state?.status !== 'answering') return state;
  return {
    ...state,
    questions: state.questions.map((question) =>
      question.id === questionId ? { ...question, answer } : question,
    ),
  };
}

function humanizeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'レベル測定を続けられませんでした。';
}
