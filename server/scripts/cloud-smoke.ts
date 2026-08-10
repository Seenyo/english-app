import type {
  GenerateRoundRequest,
  PreviousRoundResult,
} from '../../shared/assessment/contracts.ts';
import {
  createAssessmentThreadFactory,
  generateAssessmentRound,
} from '../assessment/generator.ts';
import { initializeCodexState } from '../codex/state.ts';
import { readServerConfig } from '../config.ts';

await initializeCodexState();

const config = readServerConfig();
const threadFactory = createAssessmentThreadFactory(config);
const profile: GenerateRoundRequest['profile'] = {
  selfAssessment:
    'I am a Japanese adult learner who reads technical English comfortably but wants a precise assessment of vocabulary, idioms, and grammar.',
  eikenGrade: null,
  toeicScore: null,
};
const previousResults: PreviousRoundResult[] = [];
const threadIds: string[] = [];
const questionCounts: number[] = [];
const repairCounts: number[] = [];

for (const round of [1, 2, 3] as const) {
  const result = await generateAssessmentRound(
    {
      round,
      threadId: threadIds.at(-1) ?? null,
      profile,
      canonicalPersona: null,
      previousResults,
    },
    {
      threadFactory,
      maxRepairAttempts: config.repairAttempts,
    },
  );
  threadIds.push(result.threadId);
  questionCounts.push(result.batch.questions.length);
  repairCounts.push(result.repairCount);
  if (round === 1 || round === 2) {
    previousResults.push(simulatedResult(round));
  }
}

if (new Set(threadIds).size !== 1) {
  throw new Error('Cloud smoke test did not resume one Codex thread.');
}
if (questionCounts.reduce((total, count) => total + count, 0) !== 25) {
  throw new Error('Cloud smoke test did not generate 25 questions.');
}

console.log(
  JSON.stringify({
    status: 'ok',
    threadId: threadIds[0],
    questionCounts,
    repairCounts,
    resumedOneThread: true,
  }),
);

function simulatedResult(round: 1 | 2): PreviousRoundResult {
  const correct = round === 1 ? 7 : 8;
  return {
    round,
    correct,
    total: 10,
    unknown: 1,
    categories: [
      { category: 'vocabulary', correct: 3, total: 4, unknown: 0 },
      { category: 'idiom', correct: 2, total: 3, unknown: 1 },
      {
        category: 'grammar',
        correct: correct - 5,
        total: 3,
        unknown: 0,
      },
    ],
    observedStrengths: ['Technical vocabulary and core grammar'],
    observedWeaknesses: ['Less frequent idiomatic expressions'],
  };
}
