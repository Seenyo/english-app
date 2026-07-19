import assert from 'node:assert/strict';
import test from 'node:test';
import type { Thread } from '@openai/codex-sdk';
import type { GenerateRoundRequest } from '../../shared/assessment/contracts.ts';
import {
  AssessmentGenerationError,
  generateAssessmentRound,
  type AssessmentThread,
} from './generator.ts';

const request: GenerateRoundRequest = {
  round: 3,
  threadId: 'thread-existing',
  profile: {
    selfAssessment:
      'I can understand everyday English but struggle with nuanced vocabulary and grammar.',
    eikenGrade: null,
    toeicScore: null,
  },
  canonicalPersona: null,
  previousResults: [resultForRound(1), resultForRound(2)],
};

test('repairs malformed output by continuing the same thread', async () => {
  const prompts: string[] = [];
  const thread = fakeThread(
    ['not-json', JSON.stringify(validRoundThreeBatch())],
    prompts,
  );

  const result = await generateAssessmentRound(request, {
    threadFactory: {
      start: () => assert.fail('Round 3 must not start a thread'),
      resume: (threadId) => {
        assert.equal(threadId, 'thread-existing');
        return thread;
      },
    },
    maxRepairAttempts: 2,
  });

  assert.equal(result.threadId, 'thread-existing');
  assert.equal(result.repairCount, 1);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1] ?? '', /not valid JSON/);
});

test('repairs domain-invalid output even when it is valid JSON', async () => {
  const invalid = validRoundThreeBatch();
  invalid.questions[0]!.stem = 'This sentence has no blank.';
  const prompts: string[] = [];
  const thread = fakeThread(
    [JSON.stringify(invalid), JSON.stringify(validRoundThreeBatch())],
    prompts,
  );

  const result = await generateAssessmentRound(request, {
    threadFactory: { start: () => thread, resume: () => thread },
    maxRepairAttempts: 1,
  });

  assert.equal(result.repairCount, 1);
  assert.match(prompts[1] ?? '', /blank marker/);
});

test('returns a resumable error after the repair budget is exhausted', async () => {
  const thread = fakeThread(['{}', '{}', '{}'], []);

  await assert.rejects(
    generateAssessmentRound(request, {
      threadFactory: { start: () => thread, resume: () => thread },
      maxRepairAttempts: 2,
    }),
    (error) => {
      assert.ok(error instanceof AssessmentGenerationError);
      assert.equal(error.threadId, 'thread-existing');
      assert.ok(error.validationIssues.length > 0);
      return true;
    },
  );
});

test('rotates once when an existing Codex thread cannot be resumed', async () => {
  const replacement = fakeThreadWithId(
    'thread-replacement',
    [JSON.stringify(validRoundThreeBatch())],
    [],
  );
  let starts = 0;

  const result = await generateAssessmentRound(request, {
    threadFactory: {
      resume: () => ({
        id: 'thread-existing',
        async run() {
          throw new Error('thread not found');
        },
      }),
      start: () => {
        starts += 1;
        return replacement;
      },
    },
    maxRepairAttempts: 1,
  });

  assert.equal(starts, 1);
  assert.equal(result.threadId, 'thread-replacement');
  assert.equal(result.repairCount, 0);
});

function fakeThread(responses: string[], prompts: string[]): AssessmentThread {
  return fakeThreadWithId('thread-existing', responses, prompts);
}

function fakeThreadWithId(
  id: string,
  responses: string[],
  prompts: string[],
): AssessmentThread {
  let call = 0;
  return {
    id,
    async run(input) {
      prompts.push(String(input));
      const finalResponse = responses[call] ?? responses.at(-1) ?? '{}';
      call += 1;
      return { finalResponse, items: [], usage: null };
    },
  } satisfies Pick<Thread, 'id' | 'run'>;
}

function resultForRound(round: 1 | 2) {
  return {
    round,
    correct: 6,
    total: 10,
    unknown: 1,
    categories: [
      { category: 'vocabulary' as const, correct: 3, total: 4, unknown: 0 },
      { category: 'idiom' as const, correct: 1, total: 3, unknown: 1 },
      { category: 'grammar' as const, correct: 2, total: 3, unknown: 0 },
    ],
    observedStrengths: ['B1 vocabulary'],
    observedWeaknesses: ['multiword idioms'],
  };
}

function validRoundThreeBatch() {
  const categories = [
    ['vocabulary', 4],
    ['vocabulary', 7],
    ['idiom', 6],
    ['grammar', 5],
    ['grammar', 8],
  ] as const;
  return {
    round: 3 as const,
    calibrationSummary: 'Final questions target the learner boundary near B2.',
    questions: categories.map(([category, difficultyRank], index) => ({
      id: `q-${index + 1}`,
      category,
      cefrLevel: difficultyRank >= 7 ? ('C1' as const) : ('B2' as const),
      difficultyRank,
      stem: `The learner must choose the best word for _____ in sentence ${index + 1}.`,
      options: [
        { id: 'A' as const, text: `answer ${index}-A` },
        { id: 'B' as const, text: `answer ${index}-B` },
        { id: 'C' as const, text: `answer ${index}-C` },
        { id: 'D' as const, text: `answer ${index}-D` },
      ],
      correctOptionId: 'A' as const,
      explanationJa: 'この選択肢が文脈と文法の両方に合うため正解です。',
      learningPoint: `target-${index + 1}`,
    })),
  };
}
