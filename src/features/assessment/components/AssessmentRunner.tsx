import { useRef, useState } from 'react';
import type {
  AnswerSelection,
  AssessmentState,
} from '@shared/assessment/contracts';
import { Button } from '@/components/ui/Button';
import { AssessmentProgress } from './AssessmentProgress';
import { QuestionCard } from './QuestionCard';

type AnsweringState = Extract<AssessmentState, { status: 'answering' }>;

export function AssessmentRunner({
  state,
  isWorking,
  onSaveAnswer,
  onComplete,
}: {
  state: AnsweringState;
  isWorking: boolean;
  onSaveAnswer: (questionId: string, answer: AnswerSelection) => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [questionIndex, setQuestionIndex] = useState(() =>
    initialQuestionIndex(state),
  );
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const question = state.questions[questionIndex];

  if (!question) return null;

  async function choose(answer: AnswerSelection) {
    if (saveLock.current || saving || isWorking) return;
    saveLock.current = true;
    setSaving(true);
    const answeredIndex = questionIndex;
    const answeredQuestionId = question.id;
    try {
      await onSaveAnswer(answeredQuestionId, answer);
      const isLast = answeredIndex === state.questions.length - 1;
      if (!isLast) {
        setQuestionIndex(answeredIndex + 1);
      }
    } catch {
      // The assessment provider displays the actionable error above the card.
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function goBack() {
    setQuestionIndex((index) => Math.max(0, index - 1));
  }

  const allAnswered = state.questions.every((item) => item.answer !== null);
  const isLastQuestion = questionIndex === state.questions.length - 1;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <AssessmentProgress round={state.round} questionIndex={questionIndex} />
      <QuestionCard
        key={question.id}
        answer={question.answer}
        disabled={saving || isWorking}
        onAnswer={(answer) => void choose(answer)}
        question={question}
      />
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
        <Button
          disabled={questionIndex === 0 || saving || isWorking}
          onClick={goBack}
          variant="ghost"
        >
          ← 戻る
        </Button>
        {!isLastQuestion && question.answer && (
          <Button
            disabled={saving || isWorking}
            onClick={() => setQuestionIndex((index) => index + 1)}
            variant="ghost"
          >
            次へ →
          </Button>
        )}
        {isLastQuestion && (
          <Button
            className="min-w-44"
            disabled={!allAnswered || saving || isWorking}
            onClick={() => void onComplete().catch(() => undefined)}
          >
            Round {state.round}を採点する
          </Button>
        )}
      </div>
    </div>
  );
}

function initialQuestionIndex(state: AnsweringState): number {
  const unanswered = state.questions.findIndex((question) => !question.answer);
  return unanswered === -1 ? state.questions.length - 1 : unanswered;
}
