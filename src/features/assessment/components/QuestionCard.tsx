import type {
  AnswerSelection,
  PublicAssessmentQuestion,
} from '@shared/assessment/contracts';
import { cn } from '../../../lib/utils';

const categoryLabels = {
  vocabulary: 'Vocabulary',
  idiom: 'Idiom',
  grammar: 'Grammar',
} as const;

export function QuestionCard({
  question,
  answer,
  disabled,
  onAnswer,
}: {
  question: PublicAssessmentQuestion;
  answer: AnswerSelection | null;
  disabled: boolean;
  onAnswer: (answer: AnswerSelection) => void;
}) {
  return (
    <section
      className="question-card"
      aria-busy={disabled}
      aria-labelledby={`question-stem-${question.id}`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className={`category-pill category-${question.category}`}>
          {categoryLabels[question.category]}
        </span>
        {disabled && (
          <span className="font-utility text-xs font-bold text-teal-600">
            保存中…
          </span>
        )}
      </div>

      <h1 id={`question-stem-${question.id}`} className="question-stem">
        {renderStem(question.stem)}
      </h1>

      <fieldset
        className="mt-8 grid gap-3"
        disabled={disabled}
        key={question.id}
      >
        <legend className="sr-only">答えを1つ選択してください</legend>
        {question.options.map((option) => {
          const selected =
            answer?.kind === 'option' && answer.optionId === option.id;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                'answer-option',
                selected && 'answer-option-selected',
              )}
              key={option.id}
              onClick={() =>
                onAnswer({ kind: 'option', optionId: option.id })
              }
              type="button"
            >
              <span className="answer-letter">{option.id}</span>
              <span>{option.text}</span>
            </button>
          );
        })}
        <button
          aria-pressed={answer?.kind === 'unknown'}
          className={cn(
            'answer-option answer-unknown',
            answer?.kind === 'unknown' && 'answer-option-selected',
          )}
          onClick={() => onAnswer({ kind: 'unknown' })}
          type="button"
        >
          <span className="answer-letter">?</span>
          <span>わからない</span>
        </button>
      </fieldset>
    </section>
  );
}

function renderStem(stem: string) {
  const [before, after] = stem.split('_____');
  return (
    <>
      {before}
      <span className="question-blank" aria-label="blank">
        _____
      </span>
      {after}
    </>
  );
}
