import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Codex, type Thread, type ThreadOptions } from '@openai/codex-sdk';
import { z } from 'zod';
import {
  assessmentBatchSchema,
  type AssessmentBatch,
  type GenerateRoundRequest,
} from '../../shared/assessment/contracts.ts';
import { createCodexEnvironment } from '../codex/environment.ts';
import type { ServerConfig } from '../config.ts';
import { buildGenerationPrompt, buildRepairPrompt } from './prompt.ts';
import { parseAndValidateBatch } from './validation.ts';

export type AssessmentThread = Pick<Thread, 'id' | 'run'>;

export type ThreadFactory = {
  start: () => AssessmentThread;
  resume: (threadId: string) => AssessmentThread;
};

export type GeneratedAssessmentRound = {
  threadId: string;
  repairCount: number;
  batch: AssessmentBatch;
};

export class AssessmentGenerationError extends Error {
  constructor(
    message: string,
    readonly threadId: string | null,
    readonly validationIssues: readonly string[],
  ) {
    super(message);
    this.name = 'AssessmentGenerationError';
  }
}

export function createAssessmentThreadFactory(
  config: Pick<ServerConfig, 'codexModel' | 'codexReasoningEffort'>,
): ThreadFactory {
  const runtimeDirectory = join(tmpdir(), 'english-study-codex-runtime');
  mkdirSync(runtimeDirectory, { recursive: true });

  const codex = new Codex({
    codexPathOverride: fileURLToPath(
      new URL('../codex/isolated-codex.mjs', import.meta.url),
    ),
    env: createCodexEnvironment(),
    config: { web_search: 'disabled' },
  });
  const threadOptions: ThreadOptions = {
    workingDirectory: runtimeDirectory,
    skipGitRepoCheck: true,
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    webSearchMode: 'disabled',
    modelReasoningEffort: config.codexReasoningEffort,
    ...(config.codexModel ? { model: config.codexModel } : {}),
  };

  return {
    start: () => codex.startThread(threadOptions),
    resume: (threadId) => codex.resumeThread(threadId, threadOptions),
  };
}

export async function generateAssessmentRound(
  request: GenerateRoundRequest,
  options: {
    threadFactory: ThreadFactory;
    maxRepairAttempts: number;
  },
): Promise<GeneratedAssessmentRound> {
  let thread = request.threadId
    ? options.threadFactory.resume(request.threadId)
    : options.threadFactory.start();
  const outputSchema = z.toJSONSchema(assessmentBatchSchema);
  let prompt = buildGenerationPrompt(request);
  let lastIssues: readonly string[] = [];
  let rotatedAfterResumeFailure = false;

  for (
    let repairCount = 0;
    repairCount <= options.maxRepairAttempts;
    repairCount += 1
  ) {
    let result;
    try {
      result = await thread.run(prompt, { outputSchema });
    } catch (error) {
      if (!request.threadId || repairCount !== 0 || rotatedAfterResumeFailure) {
        throw error;
      }
      // A local Codex thread can become unavailable after cleanup or an SDK
      // upgrade. Start a replacement only after resume fails; the complete
      // profile, canonical persona, and prior results remain in this prompt.
      thread = options.threadFactory.start();
      rotatedAfterResumeFailure = true;
      result = await thread.run(prompt, { outputSchema });
    }
    const validation = parseAndValidateBatch(
      result.finalResponse,
      request.round,
    );
    if (validation.success) {
      if (!thread.id) {
        throw new AssessmentGenerationError(
          'Codex returned a valid assessment without a resumable thread id.',
          null,
          [],
        );
      }
      return {
        threadId: thread.id,
        repairCount,
        batch: validation.data,
      };
    }

    lastIssues = validation.issues;
    prompt = buildRepairPrompt(request.round, validation.issues);
  }

  throw new AssessmentGenerationError(
    `Codex could not produce a valid Round ${request.round} assessment after ${options.maxRepairAttempts + 1} attempt(s).`,
    thread.id,
    lastIssues,
  );
}

export function stripAnswerKeys(batch: AssessmentBatch) {
  return {
    round: batch.round,
    questions: batch.questions.map((question) => ({
      id: question.id,
      category: question.category,
      stem: question.stem,
      options: question.options,
    })),
  };
}
