import { join } from 'node:path';
import type {
  AssessmentBatch,
  AssessmentQuestion,
  GenerateRoundRequest,
} from '../shared/assessment/contracts.ts';
import {
  artifactDirectory,
  baselinePath,
  ensureArtifactDirectory,
  readJson,
  writePrivateJson,
  type BaselineArtifact,
} from './artifacts.ts';
import {
  buildComparisonBlueprint,
  buildOptimizedItemPrompt,
  buildSelectiveReplacementPrompt,
  buildSemanticVerifierPrompt,
  buildVerifierRepairPrompt,
  optimizedGenerationSystemPrompt,
  semanticVerifierSystemPrompt,
  type ItemBlueprint,
  type RejectedQuestion,
} from './optimized-prompts.ts';
import {
  mergeRejectedQuestions,
  parseSemanticVerification,
  rejectedQuestionsFromVerification,
  rejectedQuestionsForConstructShape,
  validateReplacementQuestions,
} from './semantic-verifier.ts';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const endpoint = process.env.LOCAL_LLM_BASE_URL ?? 'http://127.0.0.1:18081';
const model =
  process.env.LOCAL_LLM_MODEL ?? 'mlx-community/gemma-4-12B-it-OptiQ-4bit';
const selectors = readSelectors();
const baseline = await readJson<BaselineArtifact>(baselinePath);

const results = await Promise.all(selectors.map(runSelector));
await ensureArtifactDirectory();
const generatedAt = new Date().toISOString();
const outputPath = join(
  artifactDirectory,
  `focused-regression-${generatedAt.replaceAll(':', '-')}.json`,
);
await writePrivateJson(outputPath, {
  generatedAt,
  model,
  endpoint,
  settings: {
    thinking: false,
    temperature: 0.7,
    topP: 0.9,
    topK: 64,
    generationMaxTokens: 1536,
    verifierMaxTokens: 1024,
  },
  results,
});
console.log(
  JSON.stringify(
    {
      status: results.every((result) => result.question !== null)
        ? 'completed'
        : 'completed_with_failures',
      outputPath,
      results: results.map(({ selector, question, passes, error }) => ({
        selector,
        success: question !== null,
        passes,
        error,
      })),
    },
    null,
    2,
  ),
);

async function runSelector(selector: string) {
  const [roundText, id] = selector.split(':');
  const round = Number(roundText) as 1 | 2 | 3;
  if (![1, 2, 3].includes(round) || !id) {
    throw new Error(`Invalid selector ${selector}; expected ROUND:q-N.`);
  }
  const blueprint = buildComparisonBlueprint(baseline.codexBatches, round);
  const slot = blueprint.find((candidate) => candidate.id === id);
  if (!slot) throw new Error(`No blueprint slot exists for ${selector}.`);
  const request = requestForRound(round);
  let rejected: RejectedQuestion | null = null;
  const attempts: Array<Record<string, unknown>> = [];
  for (let pass = 0; pass <= 4; pass += 1) {
    const generated = await generateQuestion(
      request,
      slot,
      rejected,
      pass,
      attempts,
    );
    if (!generated) continue;
    const verification = await verifyQuestion(round, slot, generated, pass);
    const oneQuestionBatch: AssessmentBatch = {
      round,
      calibrationSummary: 'Focused regression for a target-specific prompt.',
      questions: [generated],
    };
    const rejectedQuestions = mergeRejectedQuestions(
      rejectedQuestionsFromVerification(oneQuestionBatch, [slot], verification),
      rejectedQuestionsForConstructShape(oneQuestionBatch, [slot]),
    );
    attempts.push({
      pass: pass + 1,
      kind: 'semantic-verification',
      verification,
      rejectedIssues: rejectedQuestions[0]?.issues ?? [],
    });
    if (rejectedQuestions.length === 0) {
      return {
        selector,
        passes: pass + 1,
        question: generated,
        attempts,
        error: null,
      };
    }
    rejected = rejectedQuestions[0] ?? null;
  }
  return {
    selector,
    passes: 5,
    question: null,
    attempts,
    error: rejected?.issues.join('; ') ?? 'No valid question was generated.',
  };
}

async function generateQuestion(
  request: GenerateRoundRequest,
  slot: ItemBlueprint,
  rejected: RejectedQuestion | null,
  pass: number,
  attempts: Array<Record<string, unknown>>,
): Promise<AssessmentQuestion | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: optimizedGenerationSystemPrompt },
    {
      role: 'user',
      content: rejected
        ? buildSelectiveReplacementPrompt(request, [rejected])
        : buildOptimizedItemPrompt(request, slot),
    },
  ];
  for (let repair = 0; repair <= 2; repair += 1) {
    const raw = await complete(messages, 1536);
    const validation = validateReplacementQuestions(raw, [slot]);
    attempts.push({
      pass: pass + 1,
      repair,
      kind: rejected ? 'replacement' : 'generation',
      raw,
      validationIssues: validation.success ? [] : validation.issues,
    });
    if (validation.success) return validation.data[0] ?? null;
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: `Correct every validation error and return exactly {"questions":[one complete question]}. The stem must have one _____ and options replace only that blank. Errors:\n${validation.issues.join('\n')}`,
    });
  }
  return null;
}

async function verifyQuestion(
  round: 1 | 2 | 3,
  slot: ItemBlueprint,
  question: AssessmentQuestion,
  pass: number,
) {
  const messages: ChatMessage[] = [
    { role: 'system', content: semanticVerifierSystemPrompt },
    {
      role: 'user',
      content: buildSemanticVerifierPrompt(round, [slot], [question]),
    },
  ];
  let issues: string[] = [];
  for (let repair = 0; repair <= 1; repair += 1) {
    const raw = await complete(messages, 1024);
    const parsed = parseSemanticVerification(raw, round, [question.id]);
    if (parsed.success) return parsed.data;
    issues = parsed.issues;
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: buildVerifierRepairPrompt(round, [question.id], issues),
    });
  }
  throw new Error(
    `Verifier JSON failed for ${question.id} pass ${pass + 1}: ${issues.join('; ')}`,
  );
}

async function complete(messages: ChatMessage[], maxTokens: number) {
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 64,
      max_tokens: maxTokens,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `OptiQ returned ${response.status}: ${await response.text()}`,
    );
  }
  const value = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = value.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new Error('OptiQ returned no content.');
  return content;
}

function requestForRound(round: 1 | 2 | 3): GenerateRoundRequest {
  return {
    round,
    threadId: round === 1 ? null : 'focused-local-regression',
    profile: baseline.profile,
    canonicalPersona: baseline.canonicalPersona,
    previousResults: baseline.previousResults.slice(0, round - 1),
  };
}

function readSelectors(): string[] {
  const index = process.argv.indexOf('--items');
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  return (raw ?? '1:q-5,2:q-6,3:q-2')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
