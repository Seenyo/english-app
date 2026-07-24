import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  artifactDirectory,
  ensureArtifactDirectory,
  writePrivateJson,
} from './artifacts.ts';

type OptionId = 'A' | 'B' | 'C' | 'D';

type Blueprint = {
  id: string;
  task: 'vocabulary-quiz' | 'sentence-ordering' | 'reading-comprehension';
  finalAnswerPosition?: OptionId;
};

type GeneratedItem = {
  id: string;
  task: Blueprint['task'];
  correctOptionId?: OptionId;
  explanationJa: string;
  [key: string]: unknown;
};

type SuiteArtifact = {
  generatedAt: string;
  model: string;
  results: Array<{
    blueprint: Blueprint;
    item: GeneratedItem | null;
  }>;
};

const expectedIds = [
  ...Array.from({ length: 10 }, (_, index) => `quiz-${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `ordering-${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `reading-${index + 1}`),
];

const firstPass = 'learning-task-suite-2026-07-22T15-26-44.095Z.json';
const reviewedSourceById: Record<string, string> = {
  'quiz-1': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'quiz-2': firstPass,
  'quiz-3': firstPass,
  'quiz-4': firstPass,
  'quiz-5': firstPass,
  'quiz-6': firstPass,
  'quiz-7': firstPass,
  'quiz-8': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'quiz-9': firstPass,
  'quiz-10': firstPass,
  'ordering-1': 'learning-task-suite-2026-07-22T15-28-44.426Z.json',
  'ordering-2': 'learning-task-suite-2026-07-22T15-39-29.407Z.json',
  'ordering-3': firstPass,
  'ordering-4': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'ordering-5': 'learning-task-suite-2026-07-22T15-40-09.166Z.json',
  'ordering-6': firstPass,
  'ordering-7': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'ordering-8': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'ordering-9': 'learning-task-suite-2026-07-22T15-39-29.407Z.json',
  'ordering-10': firstPass,
  'reading-1': firstPass,
  'reading-2': firstPass,
  'reading-3': firstPass,
  'reading-4': firstPass,
  'reading-5': 'learning-task-suite-2026-07-22T15-34-59.544Z.json',
  'reading-6': 'learning-task-suite-2026-07-22T15-41-20.274Z.json',
  'reading-7': firstPass,
  'reading-8': 'learning-task-suite-2026-07-22T15-31-19.426Z.json',
  'reading-9': firstPass,
  'reading-10': 'learning-task-suite-2026-07-22T15-41-20.274Z.json',
};

const files = (await readdir(artifactDirectory))
  .filter(
    (file) =>
      file.startsWith('learning-task-suite-') &&
      !file.startsWith('learning-task-suite-reviewed-') &&
      file.endsWith('.json'),
  )
  .sort();

if (files.length === 0) {
  throw new Error('No learning-task-suite artifacts were found.');
}

const selected = new Map<
  string,
  {
    blueprint: Blueprint;
    item: GeneratedItem;
    sourceArtifact: string;
    sourceGeneratedAt: string;
  }
>();

for (const file of files) {
  const artifact = JSON.parse(
    await readFile(join(artifactDirectory, file), 'utf8'),
  ) as SuiteArtifact;
  for (const result of artifact.results) {
    if (!result.item || reviewedSourceById[result.blueprint.id] !== file) {
      continue;
    }
    selected.set(result.blueprint.id, {
      blueprint: result.blueprint,
      item: normalizeReviewedItem(result.item, result.blueprint, artifact),
      sourceArtifact: file,
      sourceGeneratedAt: artifact.generatedAt,
    });
  }
}

const missing = expectedIds.filter((id) => !selected.has(id));
if (missing.length > 0) {
  throw new Error(`Missing accepted items: ${missing.join(', ')}`);
}

const items = expectedIds.map((id) => selected.get(id)!);
const generatedAt = new Date().toISOString();
const outputPath = join(
  artifactDirectory,
  `learning-task-suite-reviewed-${generatedAt.replaceAll(':', '-')}.json`,
);

await ensureArtifactDirectory();
await writePrivateJson(outputPath, {
  generatedAt,
  model: 'mlx-community/gemma-4-12B-it-OptiQ-4bit',
  status: 'manually_reviewed',
  selectionPolicy:
    'Explicit source artifact selected for each immutable blueprint after manual review. Later unreviewed generations cannot replace accepted items.',
  counts: {
    vocabularyQuiz: items.filter(({ item }) => item.task === 'vocabulary-quiz')
      .length,
    sentenceOrdering: items.filter(
      ({ item }) => item.task === 'sentence-ordering',
    ).length,
    readingComprehension: items.filter(
      ({ item }) => item.task === 'reading-comprehension',
    ).length,
  },
  manualReview: {
    reviewer: 'Codex',
    criteria: [
      'one objectively defensible answer',
      'natural contemporary English',
      'assigned construct is genuinely tested',
      'answer and explanation agree',
      'passage evidence supports the keyed reading answer',
    ],
    initiallyRejected: {
      vocabularyQuiz: ['quiz-1', 'quiz-8'],
      sentenceOrdering: [
        'ordering-2',
        'ordering-4',
        'ordering-5',
        'ordering-7',
        'ordering-8',
        'ordering-9',
      ],
      readingComprehension: ['reading-5', 'reading-6', 'reading-10'],
    },
    disposition:
      'All listed items were regenerated with targeted guidance and re-reviewed. The 30 selected items are accepted for evaluation use.',
  },
  items,
});

console.log(
  JSON.stringify(
    {
      status: 'completed',
      outputPath,
      itemCount: items.length,
      sourceArtifactCount: new Set(
        items.map(({ sourceArtifact }) => sourceArtifact),
      ).size,
    },
    null,
    2,
  ),
);

function normalizeReviewedItem(
  original: GeneratedItem,
  blueprint: Blueprint,
  artifact: SuiteArtifact,
) {
  const item = structuredClone(original);
  const answerPosition = blueprint.finalAnswerPosition;
  const predatesExplanationRebalancing =
    artifact.generatedAt < '2026-07-22T15:34:00.000Z';
  if (
    answerPosition &&
    answerPosition !== 'A' &&
    predatesExplanationRebalancing
  ) {
    item.explanationJa = swapOptionReferences(
      item.explanationJa,
      'A',
      answerPosition,
    );
  }
  item.explanationJa = item.explanationJa.replaceAll('ガバンス', 'ガバナンス');
  return item;
}

function swapOptionReferences(value: string, left: OptionId, right: OptionId) {
  const marker = '__OPTION_POSITION_SWAP__';
  const replaceLabel = (text: string, label: string, replacement: string) =>
    text.replaceAll(
      new RegExp(`(?<![A-Za-z0-9])${label}(?![A-Za-z0-9])`, 'g'),
      replacement,
    );
  return replaceLabel(
    replaceLabel(replaceLabel(value, left, marker), right, left),
    marker,
    right,
  );
}
