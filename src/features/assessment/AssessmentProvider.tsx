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
  AssessmentState,
  LearnerProfile,
} from '@shared/assessment/contracts';
import { useAuth } from '@/features/auth';
import {
  completeAssessmentRound,
  getAssessmentState,
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
      setState(await getAssessmentState(currentSession.access_token));
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
          setState(
            await startAssessment(currentSession.access_token, profile),
          );
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
        setActivity(round === 3 ? 'finalizing' : 'adapting');
        setError(null);
        try {
          setState(
            await completeAssessmentRound(
              currentSession.access_token,
              attemptId,
              round,
            ),
          );
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
          setState(
            await retryAssessmentGeneration(
              currentSession.access_token,
              attemptId,
            ),
          );
        } catch (requestError) {
          setError(humanizeError(requestError));
          throw requestError;
        } finally {
          setActivity(null);
          setIsWorking(false);
        }
      },
    }),
    [activity, error, isLoading, isWorking, refresh, state],
  );

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
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
