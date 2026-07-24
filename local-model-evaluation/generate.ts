import { z } from 'zod';
import {
  assessmentBatchSchema,
  assessmentQuestionSchema,
  expectedQuestionCount,
  type AssessmentBatch,
  type AssessmentQuestion,
  type GenerateRoundRequest,
} from '../shared/assessment/contracts.ts';
import {
  buildGenerationPrompt,
  buildRepairPrompt,
} from '../server/assessment/prompt.ts';
import { parseAndValidateBatch } from '../server/assessment/validation.ts';
import {
  artifactDirectory,
  baselinePath,
  ensureArtifactDirectory,
  type BaselineArtifact,
  type LocalGenerationArtifact,
  type LocalRoundResult,
  readJson,
  writePrivateJson,
} from './artifacts.ts';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import {
  buildComparisonBlueprint,
  buildOptimizedItemPrompt,
  buildSelectiveReplacementPrompt,
  buildSemanticVerifierPrompt,
  buildVerifierRepairPrompt,
  optimizedGenerationSystemPrompt,
  semanticVerifierSystemPrompt,
  type ItemBlueprint,
} from './optimized-prompts.ts';
import {
  mergeRejectedQuestions,
  parseSemanticVerification,
  rejectedQuestionsFromVerification,
  rejectedQuestionsForDuplicateTargets,
  rejectedQuestionsForConstructShape,
  validateBatchAgainstBlueprint,
  validateReplacementQuestions,
} from './semantic-verifier.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const templateResponseSchema = z.object({ prompt: z.string().min(1) });

const completionResponseSchema = z.object({
  content: z.string(),
  tokens_evaluated: z.number().int().nonnegative(),
  tokens_predicted: z.number().int().nonnegative(),
});

const openAiCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
  }),
});

const protocol = parseProtocol(process.env.LOCAL_LLM_PROTOCOL ?? 'llama.cpp');
const structuredOutput =
  protocol === 'llama.cpp'
    ? 'native-schema'
    : parseStructuredOutput(
        process.env.LOCAL_LLM_STRUCTURED_OUTPUT ?? 'prompt-and-repair',
      );
const model =
  process.env.LOCAL_LLM_MODEL ??
  (protocol === 'llama.cpp'
    ? 'InternScience/Agents-A1-4B-Q8_0-GGUF:Q8_0'
    : 'mlx-community/gemma-4-12B-it-OptiQ-4bit');
const endpoint =
  process.env.LOCAL_LLM_BASE_URL ??
  (protocol === 'llama.cpp'
    ? 'http://127.0.0.1:18080'
    : 'http://127.0.0.1:18081');
const requestedSets = readIntegerFlag('--sets', 1, 1, 20);
const concurrency = readIntegerFlag('--concurrency', 3, 1, 16);
const itemConcurrency = readIntegerEnvironment(
  'LOCAL_LLM_ITEM_CONCURRENCY',
  3,
  1,
  10,
);
const strategy = parseStrategy(readStringFlag('--strategy', 'optimized'));
const semanticVerification =
  strategy === 'optimized' &&
  parseOnOffFlag('--semantic-verification', 'on') === 'on';
const maxSemanticRepairs = readIntegerFlag(
  '--max-semantic-repairs',
  semanticVerification ? 2 : 0,
  0,
  4,
);
const generationThinking =
  strategy === 'optimized' &&
  parseOnOff(
    process.env.LOCAL_LLM_GENERATION_THINKING ??
      process.env.LOCAL_LLM_THINKING ??
      'on',
  ) === 'on';
const verifierThinking =
  strategy === 'optimized' &&
  parseOnOff(process.env.LOCAL_LLM_VERIFIER_THINKING ?? 'on') === 'on';
const replacementThinking =
  strategy === 'optimized' &&
  parseOnOff(process.env.LOCAL_LLM_REPLACEMENT_THINKING ?? 'off') === 'on';
const temperature = readNumberEnvironment(
  'LOCAL_LLM_TEMPERATURE',
  strategy === 'optimized' ? 0.7 : protocol === 'llama.cpp' ? 0.85 : 1,
  0,
  2,
);
const topP = readNumberEnvironment(
  'LOCAL_LLM_TOP_P',
  strategy === 'optimized' ? 0.9 : 0.95,
  0.01,
  1,
);
const topK = readIntegerEnvironment(
  'LOCAL_LLM_TOP_K',
  strategy === 'optimized' ? 64 : protocol === 'llama.cpp' ? 20 : 64,
  0,
  500,
);
const generationMaxTokens = readIntegerEnvironment(
  'LOCAL_LLM_GENERATION_MAX_TOKENS',
  readIntegerEnvironment(
    'LOCAL_LLM_MAX_TOKENS',
    generationThinking ? 8192 : strategy === 'optimized' ? 1536 : 4096,
    512,
    32768,
  ),
  512,
  32768,
);
const verifierMaxTokens = readIntegerEnvironment(
  'LOCAL_LLM_VERIFIER_MAX_TOKENS',
  verifierThinking ? 8192 : 1024,
  512,
  32768,
);
const replacementMaxTokens = readIntegerEnvironment(
  'LOCAL_LLM_REPLACEMENT_MAX_TOKENS',
  replacementThinking ? 8192 : 1536,
  512,
  32768,
);
const baseline = await readJson<BaselineArtifact>(baselinePath);
const localQuestionSchema = assessmentQuestionSchema.extend({
  stem: assessmentQuestionSchema.shape.stem.regex(
    /^.*_____.*$/,
    'The stem must contain the literal blank marker _____.',
  ),
});

type Task = { setIndex: number; round: 1 | 2 | 3 };
const tasks: Task[] = Array.from({ length: requestedSets }, (_, setIndex) =>
  ([1, 2, 3] as const).map((round) => ({ setIndex, round })),
).flat();

await assertServerReady();
const startedAt = performance.now();
const results =
  strategy === 'optimized'
    ? (
        await mapConcurrent(
          Array.from({ length: requestedSets }, (_, setIndex) => setIndex),
          Math.min(concurrency, requestedSets),
          generateOptimizedSet,
        )
      ).flat()
    : await mapConcurrent(tasks, concurrency, generateLegacyRound);
const wallClockMs = Math.round(performance.now() - startedAt);
const sets = Array.from({ length: requestedSets }, (_, index) => ({
  index,
  rounds: results
    .filter((result) => result.setIndex === index)
    .map((result) => result.roundResult)
    .sort((left, right) => left.round - right.round),
}));

const artifact: LocalGenerationArtifact = {
  generatedAt: new Date().toISOString(),
  model,
  endpoint,
  protocol,
  structuredOutput,
  strategy,
  settings: {
    generationThinking,
    verifierThinking,
    replacementThinking,
    temperature,
    topP,
    topK,
    generationMaxTokens,
    verifierMaxTokens,
    replacementMaxTokens,
    semanticVerification,
    maxSemanticRepairs,
    itemConcurrency,
    blueprintSource: 'codex-metadata-with-deduplicated-targets',
  },
  requestedSets,
  concurrency,
  wallClockMs,
  sets,
};
await ensureArtifactDirectory();
const timestamp = artifact.generatedAt.replaceAll(':', '-');
const outputPath = join(
  artifactDirectory,
  `local-generation-${timestamp}.json`,
);
await writePrivateJson(outputPath, artifact);

const successfulQuestions = sets.reduce(
  (total, set) =>
    total +
    set.rounds.reduce(
      (roundTotal, round) => roundTotal + (round.batch?.questions.length ?? 0),
      0,
    ),
  0,
);
const completionTokens = sets.reduce(
  (total, set) =>
    total +
    set.rounds.reduce(
      (roundTotal, round) => roundTotal + (round.completionTokens ?? 0),
      0,
    ),
  0,
);
console.log(
  JSON.stringify(
    {
      status:
        results.length === tasks.length &&
        results.every((result) => result.roundResult.batch)
          ? 'completed'
          : 'completed_with_failures',
      outputPath,
      strategy,
      semanticVerification,
      requests: tasks.length,
      successfulQuestions,
      wallClockMs,
      completionTokens,
      completionTokensPerSecond:
        wallClockMs > 0
          ? Number((completionTokens / (wallClockMs / 1000)).toFixed(2))
          : null,
    },
    null,
    2,
  ),
);

function requestForTask(task: Task): GenerateRoundRequest {
  return {
    round: task.round,
    threadId: task.round === 1 ? null : 'local-evaluation',
    profile: baseline.profile,
    canonicalPersona: baseline.canonicalPersona,
    previousResults: baseline.previousResults.slice(0, task.round - 1),
  };
}

async function generateOptimizedSet(setIndex: number) {
  const results: Array<{
    setIndex: number;
    roundResult: LocalRoundResult;
  }> = [];
  const priorQuestions: AssessmentQuestion[] = [];
  for (const round of [1, 2, 3] as const) {
    const result = await generateOptimizedRound(
      { setIndex, round },
      priorQuestions,
    );
    results.push(result);
    console.error(
      JSON.stringify({
        event: 'optimized_round_finished',
        setIndex,
        round,
        success: result.roundResult.batch !== null,
        elapsedMs: result.roundResult.elapsedMs,
        repairs: result.roundResult.repairCount,
        error: result.roundResult.error,
      }),
    );
    if (result.roundResult.batch) {
      priorQuestions.push(...result.roundResult.batch.questions);
    } else {
      break;
    }
  }
  return results;
}

async function generateLegacyRound(task: Task): Promise<{
  setIndex: number;
  roundResult: LocalRoundResult;
}> {
  const request = requestForTask(task);
  const messages: ChatMessage[] = [
    { role: 'user', content: buildLocalGenerationPrompt(request) },
  ];
  const startedAt = performance.now();
  let lastIssues: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  const attempts: LocalRoundResult['attempts'] = [];

  try {
    for (let repairCount = 0; repairCount <= 2; repairCount += 1) {
      const completion = await complete(
        messages,
        task.round,
        20260722 + task.setIndex * 10 + task.round + repairCount * 1000,
        {
          enforceBatchSchema: true,
          thinking: false,
          maxTokens: generationMaxTokens,
        },
      );
      promptTokens += completion.promptTokens;
      completionTokens += completion.completionTokens;
      const raw = completion.content;
      const validation = parseAndValidateBatch(raw, task.round);
      attempts.push({
        attempt: repairCount + 1,
        kind: repairCount === 0 ? 'generation' : 'format-repair',
        rawResponse: raw,
        validationIssues: validation.success ? [] : validation.issues,
      });
      if (validation.success) {
        return {
          setIndex: task.setIndex,
          roundResult: {
            round: task.round,
            elapsedMs: Math.round(performance.now() - startedAt),
            repairCount,
            promptTokens,
            completionTokens,
            batch: validation.data,
            validationIssues: [],
            attempts,
            error: null,
          },
        };
      }
      lastIssues = validation.issues;
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: buildLocalRepairPrompt(task.round, validation.issues),
      });
    }
  } catch (error) {
    return {
      setIndex: task.setIndex,
      roundResult: {
        round: task.round,
        elapsedMs: Math.round(performance.now() - startedAt),
        repairCount: 2,
        promptTokens: promptTokens || null,
        completionTokens: completionTokens || null,
        batch: null,
        validationIssues: lastIssues,
        attempts,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return {
    setIndex: task.setIndex,
    roundResult: {
      round: task.round,
      elapsedMs: Math.round(performance.now() - startedAt),
      repairCount: 2,
      promptTokens: promptTokens || null,
      completionTokens: completionTokens || null,
      batch: null,
      validationIssues: lastIssues,
      attempts,
      error: 'The model did not produce an acceptable batch after 3 attempts.',
    },
  };
}

async function generateOptimizedRound(
  task: Task,
  priorQuestions: readonly AssessmentQuestion[],
): Promise<{
  setIndex: number;
  roundResult: LocalRoundResult;
}> {
  const request = requestForTask(task);
  const blueprint = buildComparisonBlueprint(baseline.codexBatches, task.round);
  const startedAt = performance.now();
  let lastIssues: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let formatRepairCount = 0;
  let semanticRepairCount = 0;
  let batch: AssessmentBatch;
  const attempts: LocalRoundResult['attempts'] = [];
  const semanticPasses: NonNullable<
    LocalRoundResult['semanticVerification']
  >['passes'] = [];

  try {
    const generated = await generateInitialQuestions(
      task,
      request,
      blueprint,
      priorQuestions,
    );
    promptTokens += generated.reduce(
      (total, result) => total + result.promptTokens,
      0,
    );
    completionTokens += generated.reduce(
      (total, result) => total + result.completionTokens,
      0,
    );
    formatRepairCount = generated.reduce(
      (total, result) => total + result.repairCount,
      0,
    );
    for (const result of generated) {
      for (const attempt of result.attempts) {
        attempts.push({ ...attempt, attempt: attempts.length + 1 });
      }
    }
    const failedItems = generated.filter((result) => !result.question);
    if (failedItems.length > 0) {
      lastIssues = failedItems.flatMap((result) => result.issues);
      return failedOptimizedRound(
        task,
        startedAt,
        formatRepairCount,
        promptTokens,
        completionTokens,
        lastIssues,
        attempts,
        semanticPasses,
        `The item generator could not produce ${failedItems.length} blueprint-valid question(s).`,
      );
    }
    const candidate = {
      round: task.round,
      calibrationSummary: `Round ${task.round} uses fixed category, CEFR, and target-construct slots calibrated from the same learner evidence as the Codex baseline.`,
      questions: generated.flatMap((result) =>
        result.question ? [result.question] : [],
      ),
    };
    const candidateValidation = validateBatchAgainstBlueprint(
      JSON.stringify(candidate),
      task.round,
      blueprint,
    );
    if (!candidateValidation.success) {
      lastIssues = candidateValidation.issues;
      return failedOptimizedRound(
        task,
        startedAt,
        formatRepairCount,
        promptTokens,
        completionTokens,
        lastIssues,
        attempts,
        semanticPasses,
        'Individually valid questions did not compose into a valid round.',
      );
    }
    batch = candidateValidation.data;

    if (semanticVerification) {
      let pendingBatch = batch;
      let pendingBlueprint = blueprint;
      for (let pass = 0; pass <= maxSemanticRepairs; pass += 1) {
        const verifier = await verifyBatch(
          task,
          pendingBlueprint,
          pendingBatch,
          pass,
        );
        promptTokens += verifier.promptTokens;
        completionTokens += verifier.completionTokens;
        const rejected = mergeRejectedQuestions(
          rejectedQuestionsFromVerification(
            pendingBatch,
            pendingBlueprint,
            verifier.verification,
          ),
          rejectedQuestionsForConstructShape(pendingBatch, pendingBlueprint),
          rejectedQuestionsForDuplicateTargets(
            pendingBatch,
            pendingBlueprint,
            priorQuestions,
          ),
        );
        console.error(
          JSON.stringify({
            event: 'semantic_verification_finished',
            setIndex: task.setIndex,
            round: task.round,
            pass: pass + 1,
            rejectedQuestionIds: rejected.map(
              (question) => question.question.id,
            ),
          }),
        );
        semanticPasses.push({
          pass: pass + 1,
          rejectedQuestionIds: rejected.map((question) => question.question.id),
          verification: verifier.verification,
        });
        if (rejected.length === 0) break;

        lastIssues = rejected.flatMap((question) =>
          question.issues.map((issue) => `${question.question.id}: ${issue}`),
        );
        if (pass === maxSemanticRepairs) {
          return failedOptimizedRound(
            task,
            startedAt,
            formatRepairCount + semanticRepairCount,
            promptTokens,
            completionTokens,
            lastIssues,
            attempts,
            semanticPasses,
            `Semantic verification still rejected ${rejected.length} question(s) after ${pass + 1} pass(es).`,
          );
        }

        const replacement = await generateReplacements(
          task,
          request,
          rejected,
          [
            ...priorQuestions,
            ...batch.questions.filter(
              (question) =>
                !rejected.some(
                  (candidate) => candidate.question.id === question.id,
                ),
            ),
          ],
          pass,
        );
        promptTokens += replacement.promptTokens;
        completionTokens += replacement.completionTokens;
        const replacementAttemptOffset = attempts.length;
        attempts.push(
          ...replacement.attempts.map((attempt, index) => ({
            ...attempt,
            attempt: replacementAttemptOffset + index + 1,
          })),
        );
        semanticRepairCount += 1;
        const replacementById = new Map(
          replacement.questions.map((question) => [question.id, question]),
        );
        const merged: AssessmentBatch = {
          ...batch,
          questions: batch.questions.map(
            (question) => replacementById.get(question.id) ?? question,
          ),
        };
        const mergedValidation = validateBatchAgainstBlueprint(
          JSON.stringify(merged),
          task.round,
          blueprint,
        );
        if (!mergedValidation.success) {
          throw new Error(
            `Selective replacements produced an invalid merged batch: ${mergedValidation.issues.join('; ')}`,
          );
        }
        batch = mergedValidation.data;
        const pendingIds = new Set(
          rejected.map((candidate) => candidate.question.id),
        );
        pendingBatch = {
          ...batch,
          questions: batch.questions.filter((question) =>
            pendingIds.has(question.id),
          ),
        };
        pendingBlueprint = blueprint.filter((slot) => pendingIds.has(slot.id));
      }
    }

    return {
      setIndex: task.setIndex,
      roundResult: {
        round: task.round,
        elapsedMs: Math.round(performance.now() - startedAt),
        repairCount: formatRepairCount + semanticRepairCount,
        promptTokens,
        completionTokens,
        batch,
        validationIssues: [],
        attempts,
        semanticVerification: {
          enabled: semanticVerification,
          passes: semanticPasses,
        },
        error: null,
      },
    };
  } catch (error) {
    return failedOptimizedRound(
      task,
      startedAt,
      formatRepairCount + semanticRepairCount,
      promptTokens,
      completionTokens,
      lastIssues,
      attempts,
      semanticPasses,
      error instanceof Error ? error.message : String(error),
    );
  }
}

type GeneratedQuestionResult = {
  question: AssessmentQuestion | null;
  repairCount: number;
  promptTokens: number;
  completionTokens: number;
  attempts: LocalRoundResult['attempts'];
  issues: string[];
};

async function generateInitialQuestions(
  task: Task,
  request: GenerateRoundRequest,
  blueprint: readonly ItemBlueprint[],
  priorQuestions: readonly AssessmentQuestion[],
): Promise<GeneratedQuestionResult[]> {
  return mapConcurrent(blueprint, itemConcurrency, async (slot) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: optimizedGenerationSystemPrompt },
      {
        role: 'user',
        content: buildOptimizedItemPrompt(
          request,
          slot,
          priorQuestions,
          blueprint
            .filter((candidate) => candidate.id !== slot.id)
            .map((candidate) => candidate.targetConstruct),
        ),
      },
    ];
    return generateSingleQuestion(
      task,
      slot,
      messages,
      'generation',
      20260800 + task.setIndex * 1000 + task.round * 100,
    );
  });
}

async function generateSingleQuestion(
  task: Task,
  blueprint: ItemBlueprint,
  messages: ChatMessage[],
  initialKind: 'generation' | 'selective-replacement',
  seedBase: number,
): Promise<GeneratedQuestionResult> {
  let promptTokens = 0;
  let completionTokens = 0;
  let issues: string[] = [];
  const attempts: LocalRoundResult['attempts'] = [];
  for (let repair = 0; repair <= 2; repair += 1) {
    const completion = await complete(
      messages,
      task.round,
      seedBase + Number(blueprint.id.slice(2)) * 10 + repair,
      {
        enforceBatchSchema: false,
        thinking:
          repair === 0 && initialKind === 'generation'
            ? generationThinking
            : replacementThinking,
        maxTokens:
          repair === 0 && initialKind === 'generation'
            ? generationMaxTokens
            : replacementMaxTokens,
      },
    );
    promptTokens += completion.promptTokens;
    completionTokens += completion.completionTokens;
    const validation = validateReplacementQuestions(completion.content, [
      blueprint,
    ]);
    issues = validation.success ? [] : validation.issues;
    attempts.push({
      attempt: repair + 1,
      kind: repair === 0 ? initialKind : 'format-repair',
      rawResponse: completion.content,
      validationIssues: issues,
    });
    if (validation.success) {
      return {
        question: validation.data[0] ?? null,
        repairCount: repair,
        promptTokens,
        completionTokens,
        attempts,
        issues: [],
      };
    }
    messages.push({ role: 'assistant', content: completion.content });
    messages.push({
      role: 'user',
      content: `The one-question JSON failed validation:\n${issues
        .map((issue) => `- ${issue}`)
        .join(
          '\n',
        )}\n\nReturn exactly one complete corrected question as {"questions":[...]}. Preserve the immutable blueprint. The stem must contain exactly one _____, and each option must replace only that blank. Do not use paired blanks or slash-separated completions. Output JSON only.`,
    });
  }
  return {
    question: null,
    repairCount: 2,
    promptTokens,
    completionTokens,
    attempts,
    issues,
  };
}

async function verifyBatch(
  task: Task,
  blueprint: readonly ItemBlueprint[],
  batch: AssessmentBatch,
  pass: number,
) {
  const results = await mapConcurrent(
    batch.questions,
    itemConcurrency,
    async (question) => {
      const slot = blueprint.find((candidate) => candidate.id === question.id);
      if (!slot)
        throw new Error(`No verifier blueprint exists for ${question.id}.`);
      const messages: ChatMessage[] = [
        { role: 'system', content: semanticVerifierSystemPrompt },
        {
          role: 'user',
          content: buildSemanticVerifierPrompt(task.round, [slot], [question]),
        },
      ];
      let promptTokens = 0;
      let completionTokens = 0;
      let lastIssues: string[] = [];
      for (let repair = 0; repair <= 1; repair += 1) {
        const completion = await complete(
          messages,
          task.round,
          20260900 +
            task.setIndex * 1000 +
            task.round * 100 +
            pass * 20 +
            Number(question.id.slice(2)) * 2 +
            repair,
          {
            enforceBatchSchema: false,
            thinking: verifierThinking,
            maxTokens: verifierMaxTokens,
          },
        );
        promptTokens += completion.promptTokens;
        completionTokens += completion.completionTokens;
        const parsed = parseSemanticVerification(
          completion.content,
          task.round,
          [question.id],
        );
        if (parsed.success) {
          const verdict = parsed.data.verdicts[0];
          if (!verdict) throw new Error(`Verifier omitted ${question.id}.`);
          return { verdict, promptTokens, completionTokens };
        }
        lastIssues = parsed.issues;
        messages.push({ role: 'assistant', content: completion.content });
        messages.push({
          role: 'user',
          content: buildVerifierRepairPrompt(
            task.round,
            [question.id],
            parsed.issues,
          ),
        });
      }
      throw new Error(
        `Semantic verifier did not return valid JSON for ${question.id}: ${lastIssues.join('; ')}`,
      );
    },
  );
  return {
    verification: {
      round: task.round,
      verdicts: results.map((result) => result.verdict),
    },
    promptTokens: results.reduce(
      (total, result) => total + result.promptTokens,
      0,
    ),
    completionTokens: results.reduce(
      (total, result) => total + result.completionTokens,
      0,
    ),
  };
}

async function generateReplacements(
  task: Task,
  request: GenerateRoundRequest,
  rejected: ReturnType<typeof rejectedQuestionsFromVerification>,
  reservedQuestions: readonly AssessmentQuestion[],
  pass: number,
) {
  const results = await mapConcurrent(rejected, itemConcurrency, (item) => {
    const messages: ChatMessage[] = [
      { role: 'system', content: optimizedGenerationSystemPrompt },
      {
        role: 'user',
        content: buildSelectiveReplacementPrompt(
          request,
          [item],
          reservedQuestions,
        ),
      },
    ];
    return generateSingleQuestion(
      task,
      item.blueprint,
      messages,
      'selective-replacement',
      20261000 + task.setIndex * 1000 + task.round * 100 + pass * 20,
    );
  });
  const failed = results.filter((result) => !result.question);
  if (failed.length > 0) {
    throw new Error(
      `Could not generate ${failed.length} valid selective replacement(s): ${failed
        .flatMap((result) => result.issues)
        .join('; ')}`,
    );
  }
  return {
    questions: results.flatMap((result) =>
      result.question ? [result.question] : [],
    ),
    promptTokens: results.reduce(
      (total, result) => total + result.promptTokens,
      0,
    ),
    completionTokens: results.reduce(
      (total, result) => total + result.completionTokens,
      0,
    ),
    attempts: results.flatMap((result) => result.attempts),
  };
}

function failedOptimizedRound(
  task: Task,
  startedAt: number,
  repairCount: number,
  promptTokens: number,
  completionTokens: number,
  issues: string[],
  attempts: LocalRoundResult['attempts'],
  semanticPasses: NonNullable<
    LocalRoundResult['semanticVerification']
  >['passes'],
  error: string,
) {
  return {
    setIndex: task.setIndex,
    roundResult: {
      round: task.round,
      elapsedMs: Math.round(performance.now() - startedAt),
      repairCount,
      promptTokens: promptTokens || null,
      completionTokens: completionTokens || null,
      batch: null,
      validationIssues: issues,
      attempts,
      semanticVerification: {
        enabled: semanticVerification,
        passes: semanticPasses,
      },
      error,
    },
  } satisfies {
    setIndex: number;
    roundResult: LocalRoundResult;
  };
}

function outputSchemaForRound(round: 1 | 2 | 3): z.core.JSONSchema.JSONSchema {
  return z.toJSONSchema(
    assessmentBatchSchema.extend({
      // lm-format-enforcer 0.11.3 crashes on numeric `const` values. The
      // equivalent closed numeric range preserves token-level enforcement;
      // application validation still requires the exact round literal.
      round: z.number().int().min(round).max(round),
      questions: z
        .array(localQuestionSchema)
        .length(expectedQuestionCount(round)),
    }),
  );
}

function lmFormatEnforcerSchema(
  round: 1 | 2 | 3,
): z.core.JSONSchema.JSONSchema {
  return removeUnsupportedSchemaCombinations(
    outputSchemaForRound(round),
  ) as z.core.JSONSchema.JSONSchema;
}

function removeUnsupportedSchemaCombinations(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUnsupportedSchemaCombinations);
  }
  if (value === null || typeof value !== 'object') return value;

  const sanitized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      removeUnsupportedSchemaCombinations(child),
    ]),
  );
  // lm-format-enforcer 0.11.3 rejects a string schema that combines a regex
  // with length bounds. Keep the stronger shape constraint here and enforce
  // lengths with the application's normal Zod validation immediately after.
  if (typeof sanitized.pattern === 'string') {
    delete sanitized.minLength;
    delete sanitized.maxLength;
  }
  return sanitized;
}

function buildLocalGenerationPrompt(request: GenerateRoundRequest): string {
  return `${buildGenerationPrompt(request)}\n\n${jsonShapeInstruction(request.round)}`;
}

function buildLocalRepairPrompt(
  round: 1 | 2 | 3,
  issues: readonly string[],
): string {
  const base = buildRepairPrompt(round, issues);
  const blankClarification = issues.some((issue) =>
    issue.includes('blank marker'),
  )
    ? '\n\nBlank-marker clarification: write exactly five consecutive ASCII underscore characters directly in every stem, without backslashes, brackets, or Markdown escaping. Correct example: She _____ to school every day.'
    : '';
  return `${base}\n\n${jsonShapeInstruction(round)}${blankClarification}`;
}

function jsonShapeInstruction(round: 1 | 2 | 3): string {
  return `The output schema supplied by the application has the following exact JSON shape. Use these exact property names and types, with no wrapper object and no additional properties. Repeat the question object exactly ${expectedQuestionCount(round)} times. Options must be an array of four {id,text} objects, never an object or string array.

{
  "round": ${round},
  "calibrationSummary": "concise calibration summary",
  "questions": [
    {
      "id": "q-1",
      "category": "vocabulary",
      "cefrLevel": "B1",
      "difficultyRank": 1,
      "stem": "She _____ to school every day.",
      "options": [
        { "id": "A", "text": "go" },
        { "id": "B", "text": "goes" },
        { "id": "C", "text": "went" },
        { "id": "D", "text": "going" }
      ],
      "correctOptionId": "B",
      "explanationJa": "三人称単数の現在形なので goes が適切です。",
      "learningPoint": "third-person singular present tense"
    }
  ]
}`;
}

async function assertServerReady(): Promise<void> {
  const path = protocol === 'llama.cpp' ? '/health' : '/v1/models';
  const response = await fetch(`${endpoint}${path}`);
  if (!response.ok) {
    throw new Error(`Local model server is not ready: ${response.status}.`);
  }
}

async function complete(
  messages: ChatMessage[],
  round: 1 | 2 | 3,
  seed: number,
  options: {
    enforceBatchSchema: boolean;
    thinking: boolean;
    maxTokens: number;
  },
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  if (protocol === 'llama.cpp') {
    const prompt = await applyChatTemplate(messages, options.thinking);
    const response = await fetch(`${endpoint}/completion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        temperature,
        top_p: topP,
        top_k: topK,
        min_p: 0,
        presence_penalty: 1.1,
        repeat_penalty: 1,
        n_predict: options.maxTokens,
        seed,
        cache_prompt: true,
        ...(options.enforceBatchSchema
          ? { json_schema: outputSchemaForRound(round) }
          : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `llama.cpp returned ${response.status}: ${await response.text()}`,
      );
    }
    const completion = completionResponseSchema.parse(await response.json());
    return {
      content: completion.content,
      promptTokens: completion.tokens_evaluated,
      completionTokens: completion.tokens_predicted,
    };
  }

  const body = {
    model,
    messages,
    temperature,
    top_p: topP,
    top_k: topK,
    max_tokens: options.maxTokens,
    // mlx-lm deliberately routes seeded requests through its single-request
    // path. Omitting the seed is required to exercise continuous batching.
    chat_template_kwargs: { enable_thinking: options.thinking },
    ...(structuredOutput === 'native-schema' && options.enforceBatchSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: `assessment_round_${round}`,
              strict: true,
              schema: lmFormatEnforcerSchema(round),
            },
          },
        }
      : {}),
  };
  const response = await postJson(`${endpoint}/v1/chat/completions`, body);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`OptiQ returned ${response.status}: ${response.text}`);
  }
  const completion = openAiCompletionResponseSchema.parse(
    JSON.parse(response.text),
  );
  const choice = completion.choices[0];
  if (!choice) throw new Error('OptiQ returned no completion choice.');
  return {
    content: choice.message.content,
    promptTokens: completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
  };
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const target = new URL(url);
  if (target.protocol !== 'http:') {
    throw new Error('The local evaluation client only permits an HTTP URL.');
  }
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      target,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        response.setEncoding('utf8');
        let text = '';
        response.on('data', (chunk: string) => {
          text += chunk;
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, text });
        });
      },
    );
    request.on('error', reject);
    request.end(payload);
  });
}

async function applyChatTemplate(
  messages: ChatMessage[],
  requestThinking: boolean,
): Promise<string> {
  const response = await fetch(`${endpoint}/apply-template`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages,
      chat_template_kwargs: { enable_thinking: requestThinking },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `llama.cpp could not apply the chat template (${response.status}): ${await response.text()}`,
    );
  }
  return templateResponseSchema.parse(await response.json()).prompt;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) output[index] = await worker(value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, runWorker),
  );
  return output;
}

function readIntegerFlag(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function readStringFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseStrategy(value: string): 'legacy' | 'optimized' {
  if (value === 'legacy' || value === 'optimized') return value;
  throw new Error('--strategy must be legacy or optimized.');
}

function parseOnOffFlag(name: string, fallback: 'on' | 'off'): 'on' | 'off' {
  return parseOnOff(readStringFlag(name, fallback));
}

function parseOnOff(value: string): 'on' | 'off' {
  if (value === 'on' || value === 'off') return value;
  throw new Error('Expected on or off.');
}

function readNumberEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function readIntegerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = readNumberEnvironment(name, fallback, minimum, maximum);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function parseProtocol(value: string): 'llama.cpp' | 'openai-compatible' {
  if (value === 'llama.cpp' || value === 'openai-compatible') return value;
  throw new Error('LOCAL_LLM_PROTOCOL must be llama.cpp or openai-compatible.');
}

function parseStructuredOutput(
  value: string,
): 'native-schema' | 'prompt-and-repair' {
  if (value === 'native-schema' || value === 'prompt-and-repair') return value;
  throw new Error(
    'LOCAL_LLM_STRUCTURED_OUTPUT must be native-schema or prompt-and-repair.',
  );
}
