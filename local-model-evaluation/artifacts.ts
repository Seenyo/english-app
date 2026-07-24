import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AssessmentBatch,
  LearnerProfile,
  PreviousRoundResult,
} from '../shared/assessment/contracts.ts';
import type { SemanticVerification } from './semantic-verifier.ts';

const experimentDirectory = dirname(fileURLToPath(import.meta.url));
export const artifactDirectory = join(experimentDirectory, 'artifacts');
export const baselinePath = join(artifactDirectory, 'codex-baseline.json');

export type BaselineArtifact = {
  exportedAt: string;
  source: {
    label: string;
    completedAt: string | null;
  };
  profile: LearnerProfile;
  canonicalPersona: Record<string, unknown> | null;
  previousResults: PreviousRoundResult[];
  codexBatches: AssessmentBatch[];
};

export type LocalRoundResult = {
  round: 1 | 2 | 3;
  elapsedMs: number;
  repairCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  batch: AssessmentBatch | null;
  validationIssues: string[];
  attempts: Array<{
    attempt: number;
    kind?: 'generation' | 'format-repair' | 'selective-replacement';
    rawResponse: string;
    validationIssues: string[];
  }>;
  semanticVerification?: {
    enabled: boolean;
    passes: Array<{
      pass: number;
      rejectedQuestionIds: string[];
      verification: SemanticVerification;
    }>;
  };
  error: string | null;
};

export type LocalGenerationArtifact = {
  generatedAt: string;
  model: string;
  endpoint: string;
  protocol?: 'llama.cpp' | 'openai-compatible';
  structuredOutput?: 'native-schema' | 'prompt-and-repair';
  strategy?: 'legacy' | 'optimized';
  settings?: {
    thinking?: boolean;
    generationThinking?: boolean;
    verifierThinking?: boolean;
    replacementThinking?: boolean;
    temperature: number;
    topP: number;
    topK: number;
    maxTokens?: number;
    generationMaxTokens?: number;
    verifierMaxTokens?: number;
    replacementMaxTokens?: number;
    semanticVerification: boolean;
    maxSemanticRepairs: number;
    itemConcurrency?: number;
    blueprintSource:
      'codex-metadata' | 'codex-metadata-with-deduplicated-targets';
  };
  requestedSets: number;
  concurrency: number;
  wallClockMs: number;
  sets: Array<{
    index: number;
    rounds: LocalRoundResult[];
  }>;
};

export async function ensureArtifactDirectory(): Promise<void> {
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writePrivateJson(
  path: string,
  value: unknown,
): Promise<void> {
  await ensureArtifactDirectory();
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function latestGenerationPath(): Promise<string> {
  await ensureArtifactDirectory();
  const entries = (await readdir(artifactDirectory))
    .filter((entry) => /^local-generation-.*\.json$/.test(entry))
    .sort();
  const latest = entries.at(-1);
  if (!latest) {
    throw new Error(
      'No local generation artifact exists. Run generate.ts first.',
    );
  }
  return join(artifactDirectory, latest);
}
