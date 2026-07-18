import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { AnswerSelection } from '@shared/assessment/contracts';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAssessment } from '@/features/assessment';
import { AssessmentProcessing } from '@/features/assessment/components/AssessmentProcessing';
import { AssessmentRunner } from '@/features/assessment/components/AssessmentRunner';
import { RoundResult } from '@/features/assessment/components/RoundResult';

export function Assessment() {
  const {
    state,
    isLoading,
    isWorking,
    activity,
    error,
    clearError,
    saveAnswer,
    completeRound,
    retry,
  } = useAssessment();
  const [justCompletedRound, setJustCompletedRound] = useState<1 | 2 | null>(
    null,
  );

  if (activity) return <AssessmentProcessing mode={activity} />;
  if (isLoading || !state) return <AssessmentLoading />;
  if (state.status === 'not_started') {
    return <Navigate replace to="/assessment/profile" />;
  }

  if (state.status === 'generating') {
    return (
      <AssessmentProcessing
        mode={state.round === 1 ? 'starting' : 'adapting'}
        onRetry={() => void retry(state.attemptId).catch(() => undefined)}
      />
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center text-center">
        <section className="result-card">
          <span className="text-5xl" aria-hidden="true">
            ↻
          </span>
          <h1 className="mt-4 text-3xl font-black text-teal-950">
            ここから再開できます
          </h1>
          <p className="mt-3 font-medium leading-7 text-teal-700">
            {state.message}
          </p>
          <Button
            className="mt-7 min-w-44"
            disabled={isWorking}
            onClick={() => void retry(state.attemptId).catch(() => undefined)}
          >
            {isWorking ? '再開中…' : 'もう一度試す'}
          </Button>
        </section>
      </div>
    );
  }

  if (state.status === 'completed') {
    return (
      <div className="mx-auto max-w-3xl py-8 sm:py-14">
        <section className="result-card text-center">
          <p className="eyebrow">Level measured</p>
          <div className="cefr-medal mx-auto mt-5">{state.estimatedCefr}</div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-teal-950 sm:text-4xl">
            今の英語レベルが見えてきました
          </h1>
          <p className="mt-3 text-lg font-bold text-teal-700">
            {state.correct} / {state.total}問正解
            {state.unknown > 0 && ` ・ わからない ${state.unknown}問`}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {state.completedRounds.map((round) => (
              <div className="score-chip" key={round.round}>
                <span>Round {round.round}</span>
                <strong>
                  {round.correct}/{round.total}
                </strong>
              </div>
            ))}
          </div>
          <Link className="primary-link mt-8" to="/">
            ダッシュボードへ
          </Link>
        </section>
      </div>
    );
  }

  const answeringState = state;
  const completedResult = justCompletedRound
    ? answeringState.completedRounds.find(
        (round) => round.round === justCompletedRound,
      )
    : null;
  if (completedResult) {
    return (
      <div className="py-8 sm:py-14">
        <RoundResult
          onContinue={() => setJustCompletedRound(null)}
          result={completedResult}
        />
      </div>
    );
  }

  async function answer(questionId: string, selection: AnswerSelection) {
    await saveAnswer(answeringState.attemptId, questionId, selection);
  }

  async function finishRound() {
    const completed = answeringState.round;
    try {
      await completeRound(answeringState.attemptId, answeringState.round);
      if (completed === 1 || completed === 2) {
        setJustCompletedRound(completed);
      }
    } catch {
      // The provider keeps the current round and surfaces a retryable error.
    }
  }

  return (
    <div className="py-2 sm:py-8">
      {error && (
        <div className="error-banner mx-auto mb-5 max-w-3xl">
          <span>{error}</span>
          <button onClick={clearError} type="button">
            閉じる
          </button>
        </div>
      )}
      <AssessmentRunner
        key={`${answeringState.attemptId}:${answeringState.round}`}
        isWorking={isWorking}
        onComplete={finishRound}
        onSaveAnswer={answer}
        state={answeringState}
      />
    </div>
  );
}

function AssessmentLoading({
  detail = 'あなた専用のレベル測定を読み込んでいます。',
  retry,
}: {
  detail?: string;
  retry?: () => void;
}) {
  return (
    <div className="flex min-h-[65vh] items-center justify-center px-4 text-center">
      <div>
        <div className="loading-orbit mx-auto">
          <Spinner className="h-12 w-12 border-[5px]" />
        </div>
        <h1 className="mt-7 text-2xl font-black text-teal-950">考えています</h1>
        <p className="mt-2 max-w-md font-medium leading-7 text-teal-700">
          {detail}
        </p>
        {retry && (
          <button
            className="mt-8 text-sm font-black text-teal-700 underline decoration-2 underline-offset-4"
            onClick={retry}
            type="button"
          >
            止まっている場合は再開
          </button>
        )}
      </div>
    </div>
  );
}
