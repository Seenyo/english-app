import type { RoundSummary } from '@shared/assessment/contracts';
import { Button } from '@/components/ui/Button';

const labels = {
  vocabulary: '単語',
  idiom: '熟語',
  grammar: '文法',
} as const;

export function RoundResult({
  result,
  onContinue,
}: {
  result: RoundSummary;
  onContinue: () => void;
}) {
  return (
    <section className="result-card mx-auto max-w-2xl text-center">
      <div className="result-burst" aria-hidden="true">
        {result.correct}
        <span>/{result.total}</span>
      </div>
      <p className="mt-5 font-utility text-xs font-black tracking-[0.2em] text-teal-700 uppercase">
        Round {result.round} complete
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-teal-950 sm:text-4xl">
        ここまでの測定結果
      </h1>
      <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
        {result.categories.map((category) => (
          <div className="score-chip" key={category.category}>
            <span>{labels[category.category]}</span>
            <strong>
              {category.correct}/{category.total}
            </strong>
          </div>
        ))}
      </div>
      {result.unknown > 0 && (
        <p className="mt-4 text-sm font-bold text-teal-700">
          「わからない」を選んだ問題：{result.unknown}問
        </p>
      )}
      <Button className="mt-8 min-w-48" onClick={onContinue}>
        次のラウンドへ
      </Button>
    </section>
  );
}
