import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentBatch } from '../shared/assessment/contracts.ts';
import {
  buildOptimizedGenerationPrompt,
  type ItemBlueprint,
} from './optimized-prompts.ts';
import {
  parseJsonResponse,
  parseSemanticVerification,
  rejectedQuestionsFromVerification,
  rejectedQuestionsForConstructShape,
  rejectedQuestionsForDuplicateTargets,
  validateReplacementQuestions,
} from './semantic-verifier.ts';

const blueprint: ItemBlueprint[] = [
  {
    id: 'q-1',
    category: 'grammar',
    cefrLevel: 'B2',
    difficultyRank: 1,
    correctOptionId: 'D',
    targetConstruct: 'inverted third conditional',
  },
];

const batch: AssessmentBatch = {
  round: 3,
  calibrationSummary: 'A focused boundary-checking grammar item.',
  questions: [
    {
      ...blueprint[0]!,
      stem: 'Had the forecast been accurate, we _____ the event.',
      options: [
        { id: 'A', text: 'postpone' },
        { id: 'B', text: 'had postponed' },
        { id: 'C', text: 'would postpone' },
        { id: 'D', text: 'would have postponed' },
      ],
      explanationJa:
        '過去の反実仮想なので、would have と過去分詞を用いる形が適切です。',
      learningPoint: 'inverted third conditional',
    },
  ],
};

test('extracts final JSON after a Gemma thought channel', () => {
  assert.deepEqual(
    parseJsonResponse('<|channel>thought\nprivate<channel|>{"ok":true}'),
    { ok: true },
  );
});

test('hides the final answer position and asks the model to generate the key at A', () => {
  const prompt = buildOptimizedGenerationPrompt(
    {
      round: 3,
      threadId: 'local-evaluation',
      profile: {
        selfAssessment: 'Intermediate English learner.',
        eikenGrade: null,
        toeicScore: null,
      },
      canonicalPersona: null,
      previousResults: [],
    },
    blueprint,
  );

  assert.match(prompt, /"generationCorrectOptionId": "A"/);
  assert.doesNotMatch(prompt, /"correctOptionId": "D"/);
});

test('enforces blueprint metadata and normalizes answer position', () => {
  const valid = validateReplacementQuestions(
    JSON.stringify({ questions: batch.questions }),
    blueprint,
  );
  assert.equal(valid.success, true);

  const relocated = validateReplacementQuestions(
    JSON.stringify({
      questions: [
        {
          ...batch.questions[0],
          correctOptionId: 'A',
          options: [
            { id: 'A', text: 'would have postponed' },
            { id: 'B', text: 'had postponed' },
            { id: 'C', text: 'would postpone' },
            { id: 'D', text: 'postpone' },
          ],
        },
      ],
    }),
    blueprint,
  );
  assert.equal(relocated.success, true);
  if (relocated.success) {
    assert.equal(relocated.data[0]!.correctOptionId, 'D');
    assert.equal(relocated.data[0]!.options[3]!.text, 'would have postponed');
  }

  const misplacedKey = validateReplacementQuestions(
    JSON.stringify({
      questions: [
        {
          ...batch.questions[0],
          correctOptionId: undefined,
          options: [
            { id: 'A', text: 'would have postponed', correctOptionId: 'A' },
            { id: 'B', text: 'had postponed', correctOptionId: 'B' },
            { id: 'C', text: 'would postpone', correctOptionId: 'C' },
            { id: 'D', text: 'postpone', correctOptionId: 'D' },
          ],
        },
      ],
    }),
    blueprint,
  );
  assert.equal(misplacedKey.success, true);
});

test('rejects an ambiguous verifier verdict', () => {
  const raw = JSON.stringify({
    round: 3,
    verdicts: [
      {
        id: 'q-1',
        bestOptionId: 'D',
        viableOptionIds: ['C', 'D'],
        inferredCategory: 'grammar',
        estimatedCefrLevel: 'B2',
        naturalness: 5,
        uniqueness: 2,
        distractorQuality: 3,
        constructAlignment: 5,
        fatalIssues: ['Two options remain defensible.'],
        minorNotes: [],
      },
    ],
  });
  const parsed = parseSemanticVerification(raw, 3, ['q-1']);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const rejected = rejectedQuestionsFromVerification(
    batch,
    blueprint,
    parsed.data,
  );
  assert.equal(rejected.length, 1);
  assert.match(rejected[0]!.issues.join('\n'), /exactly \[D\] is required/);
});

test('rejects a verifier verdict that admits less than perfect uniqueness', () => {
  const parsed = parseSemanticVerification(
    JSON.stringify({
      round: 3,
      verdicts: [
        {
          id: 'q-1',
          bestOptionId: 'D',
          viableOptionIds: ['D'],
          inferredCategory: 'grammar',
          estimatedCefrLevel: 'B2',
          naturalness: 5,
          uniqueness: 4,
          distractorQuality: 4,
          constructAlignment: 5,
          fatalIssues: [],
          minorNotes: ['Another form may be acceptable in some varieties.'],
        },
      ],
    }),
    3,
    ['q-1'],
  );
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const rejected = rejectedQuestionsFromVerification(
    batch,
    blueprint,
    parsed.data,
  );
  assert.match(rejected[0]?.issues.join('\n') ?? '', /uniqueness must be 5\/5/);
});

test('normalizes an omitted viable option when the verdict is otherwise uniquely valid', () => {
  const parsed = parseSemanticVerification(
    JSON.stringify({
      round: 3,
      verdicts: [
        {
          id: 'q-1',
          bestOptionId: 'D',
          viableOptionIds: [],
          inferredCategory: 'grammar',
          estimatedCefrLevel: 'B2',
          naturalness: 5,
          uniqueness: 5,
          distractorQuality: 4,
          constructAlignment: 5,
          fatalIssues: [],
          minorNotes: [],
        },
      ],
    }),
    3,
    ['q-1'],
  );
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.verdicts[0]?.viableOptionIds, ['D']);
  }
});

test('treats an invalid verifier answer id as no independently solved answer', () => {
  const parsed = parseSemanticVerification(
    JSON.stringify({
      round: 3,
      verdicts: [
        {
          id: 'q-1',
          bestOptionId: 'none',
          viableOptionIds: ['none'],
          inferredCategory: 'grammar',
          estimatedCefrLevel: 'B2',
          naturalness: 3,
          uniqueness: 1,
          distractorQuality: 2,
          constructAlignment: 5,
          fatalIssues: ['No option is defensible.'],
          minorNotes: [],
        },
      ],
    }),
    3,
    ['q-1'],
  );
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.verdicts[0]?.bestOptionId, null);
    assert.deepEqual(parsed.data.verdicts[0]?.viableOptionIds, []);
  }
});

test('unwraps a replacement question echoed with its rejection metadata', () => {
  const parsed = validateReplacementQuestions(
    JSON.stringify({
      questions: [
        { blueprint: blueprint[0], question: batch.questions[0], issues: [] },
      ],
    }),
    blueprint,
  );
  assert.equal(parsed.success, true);
});

test('rejects single-word idiom options and repeated targets', () => {
  const idiomBlueprint: ItemBlueprint[] = [
    {
      id: 'q-1',
      category: 'idiom',
      cefrLevel: 'C1',
      difficultyRank: 1,
      correctOptionId: 'C',
      targetConstruct: 'underscore importance',
    },
  ];
  const idiomBatch: AssessmentBatch = {
    round: 3,
    calibrationSummary: 'A construct-validation fixture for an idiom item.',
    questions: [
      {
        ...idiomBlueprint[0]!,
        stem: 'The speech was intended to _____ the importance of innovation.',
        options: [
          { id: 'A', text: 'play down' },
          { id: 'B', text: 'call off' },
          { id: 'C', text: 'underscore' },
          { id: 'D', text: 'bear out' },
        ],
        explanationJa:
          '重要性を強調するという意味で underscore が適切とされています。',
        learningPoint: 'underscore importance',
      },
    ],
  };
  assert.equal(
    rejectedQuestionsForConstructShape(idiomBatch, idiomBlueprint).length,
    1,
  );
  assert.equal(
    rejectedQuestionsForDuplicateTargets(
      idiomBatch,
      idiomBlueprint,
      idiomBatch.questions,
    ).length,
    1,
  );
});
