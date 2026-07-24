import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  assessmentCategories,
  cefrLevels,
  type AssessmentBatch,
} from '../shared/assessment/contracts.ts';
import { parseAndValidateBatch } from '../server/assessment/validation.ts';
import {
  baselinePath,
  latestGenerationPath,
  type BaselineArtifact,
  type LocalGenerationArtifact,
  readJson,
} from './artifacts.ts';

const generationPaths =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [await latestGenerationPath()];
const [baseline, generations] = await Promise.all([
  readJson<BaselineArtifact>(baselinePath),
  Promise.all(
    generationPaths.map((path) => readJson<LocalGenerationArtifact>(path)),
  ),
]);
const codexMetrics = summarize(baseline.codexBatches);
const localResults = generations.map((generation) => {
  const firstCompleteSet = generation.sets.find((set) =>
    set.rounds.every((round) => round.batch !== null),
  );
  if (!firstCompleteSet) {
    throw new Error(
      `${generation.model} contains no complete 25-question set.`,
    );
  }
  return {
    generation,
    metrics: summarize(firstCompleteSet.rounds.map((round) => round.batch!)),
  };
});
const report = buildMarkdown(codexMetrics, localResults);
const outputPath = join(dirname(generationPaths.at(-1)!), 'comparison.md');
await writeFile(outputPath, report, { encoding: 'utf8', mode: 0o600 });
console.log(
  JSON.stringify(
    {
      status: 'compared',
      outputPath,
      codex: codexMetrics,
      local: localResults.map(({ generation, metrics }) => ({
        model: generation.model,
        metrics,
      })),
    },
    null,
    2,
  ),
);

type Metrics = ReturnType<typeof summarize>;

function summarize(batches: AssessmentBatch[]) {
  const questions = batches.flatMap((batch) => batch.questions);
  const validationIssues = batches.flatMap((batch) => {
    const result = parseAndValidateBatch(JSON.stringify(batch), batch.round);
    return result.success
      ? []
      : result.issues.map((issue) => `Round ${batch.round}: ${issue}`);
  });
  const normalizedStems = questions.map((question) =>
    question.stem.toLowerCase().replaceAll(/\s+/g, ' ').trim(),
  );
  const duplicateStems = normalizedStems.filter(
    (stem, index) => normalizedStems.indexOf(stem) !== index,
  );
  const average = (values: number[]) =>
    values.length === 0
      ? 0
      : Number(
          (
            values.reduce((total, value) => total + value, 0) / values.length
          ).toFixed(2),
        );
  const answerPositionDistribution = Object.fromEntries(
    (['A', 'B', 'C', 'D'] as const).map((option) => [
      option,
      questions.filter((question) => question.correctOptionId === option)
        .length,
    ]),
  );
  return {
    validRounds:
      batches.length -
      new Set(validationIssues.map((issue) => issue.split(':', 1)[0])).size,
    validationIssues,
    questionCount: questions.length,
    categories: Object.fromEntries(
      assessmentCategories.map((category) => [
        category,
        questions.filter((question) => question.category === category).length,
      ]),
    ),
    cefrDistribution: Object.fromEntries(
      cefrLevels.map((level) => [
        level,
        questions.filter((question) => question.cefrLevel === level).length,
      ]),
    ),
    answerPositionDistribution,
    largestAnswerPositionShare: Number(
      (
        Math.max(...Object.values(answerPositionDistribution)) /
        questions.length
      ).toFixed(2),
    ),
    averageStemWords: average(
      questions.map((question) => question.stem.trim().split(/\s+/).length),
    ),
    averageExplanationCharacters: average(
      questions.map((question) => question.explanationJa.length),
    ),
    uniqueLearningPoints: new Set(
      questions.map((question) => question.learningPoint.toLowerCase()),
    ).size,
    duplicateStemCount: new Set(duplicateStems).size,
  };
}

function buildMarkdown(
  codex: Metrics,
  localResults: Array<{
    generation: LocalGenerationArtifact;
    metrics: Metrics;
  }>,
): string {
  const columns = [
    { label: 'Codex baseline', metrics: codex },
    ...localResults.map(({ generation, metrics }) => ({
      label: generation.model.split('/').at(-1) ?? generation.model,
      metrics,
    })),
  ];
  const metricRows = [
    [
      'Schema/domain-valid rounds',
      (metrics: Metrics) => `${metrics.validRounds}/3`,
    ],
    ['Questions', (metrics: Metrics) => metrics.questionCount],
    ['Average stem words', (metrics: Metrics) => metrics.averageStemWords],
    [
      'Average explanation characters',
      (metrics: Metrics) => metrics.averageExplanationCharacters,
    ],
    [
      'Unique learning points',
      (metrics: Metrics) => metrics.uniqueLearningPoints,
    ],
    ['Duplicate stems', (metrics: Metrics) => metrics.duplicateStemCount],
    [
      'Largest answer-position share',
      (metrics: Metrics) =>
        `${Math.round(metrics.largestAnswerPositionShare * 100)}%`,
    ],
  ] as const;
  const header = columns.map((column) => column.label).join(' | ');
  const alignment = columns.map(() => '---:').join(' | ');
  const categoryRows = assessmentCategories
    .map(
      (category) =>
        `| ${category} | ${columns.map(({ metrics }) => metrics.categories[category]).join(' | ')} |`,
    )
    .join('\n');
  const cefrRows = cefrLevels
    .map(
      (level) =>
        `| ${level} | ${columns.map(({ metrics }) => metrics.cefrDistribution[level]).join(' | ')} |`,
    )
    .join('\n');
  const answerRows = (['A', 'B', 'C', 'D'] as const)
    .map(
      (position) =>
        `| ${position} | ${columns.map(({ metrics }) => metrics.answerPositionDistribution[position]).join(' | ')} |`,
    )
    .join('\n');
  const warnings = localResults
    .map(({ generation, metrics }) => {
      const label = generation.model.split('/').at(-1) ?? generation.model;
      return metrics.largestAnswerPositionShare > 0.5
        ? `- ${label}: answer keys are strongly position-biased; one option contains ${Math.round(metrics.largestAnswerPositionShare * 100)}% of correct answers.`
        : `- ${label}: no answer-position concentration above 50% was detected.`;
    })
    .join('\n');
  const runtime = localResults
    .map(
      ({ generation }) =>
        `- ${generation.model}: ${generation.concurrency} concurrent requests, ${(generation.wallClockMs / 1000).toFixed(2)} seconds total, ${generation.structuredOutput ?? 'structured-output mode not recorded'}`,
    )
    .join('\n');
  return `# Codex and local-model comparison

Generated at: ${new Date().toISOString()}

| Metric | ${header} |
| --- | ${alignment} |
${metricRows
  .map(
    ([label, read]) =>
      `| ${label} | ${columns.map(({ metrics }) => read(metrics)).join(' | ')} |`,
  )
  .join('\n')}

## Category distribution

| Category | ${header} |
| --- | ${alignment} |
${categoryRows}

## CEFR distribution

| CEFR | ${header} |
| --- | ${alignment} |
${cefrRows}

## Correct-answer position distribution

| Position | ${header} |
| --- | ${alignment} |
${answerRows}

## Runtime

${runtime}

## Automated warnings

${warnings}

## Scope of this automated comparison

This report verifies schema compliance, application validation rules,
composition, level distribution, answer-key balance, duplication, and basic
content-shape statistics. Whether each item has exactly one defensible answer,
targets the claimed CEFR level, and uses pedagogically strong distractors still
requires a blind human review.
`;
}
