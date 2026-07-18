const roundStarts = { 1: 0, 2: 10, 3: 20 } as const;

export function AssessmentProgress({
  round,
  questionIndex,
}: {
  round: 1 | 2 | 3;
  questionIndex: number;
}) {
  const currentStep = roundStarts[round] + questionIndex;

  return (
    <div aria-label={`全25問中${currentStep + 1}問目`} className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <p className="font-utility text-xs font-extrabold tracking-[0.18em] text-teal-800 uppercase">
          Level check · Round {round}
        </p>
        <p className="font-utility text-sm font-black text-teal-950">
          {currentStep + 1}
          <span className="text-teal-600"> / 25</span>
        </p>
      </div>
      <div className="grid grid-cols-[2fr_2fr_1fr] gap-2" aria-hidden="true">
        {[10, 10, 5].map((count, roundIndex) => (
          <div className="flex gap-1" key={count + roundIndex}>
            {Array.from({ length: count }, (_, index) => {
              const absoluteIndex =
                (roundIndex === 0 ? 0 : roundIndex === 1 ? 10 : 20) + index;
              const active = absoluteIndex <= currentStep;
              return (
                <span
                  className={`h-2.5 flex-1 rounded-full border-2 border-teal-950 transition-colors ${
                    active ? 'bg-coral-500' : 'bg-white'
                  }`}
                  key={absoluteIndex}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
