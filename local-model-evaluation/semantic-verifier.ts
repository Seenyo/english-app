import { z } from 'zod';
import {
  assessmentCategorySchema,
  assessmentQuestionSchema,
  cefrLevelSchema,
  optionIdSchema,
  type AssessmentBatch,
  type AssessmentQuestion,
} from '../shared/assessment/contracts.ts';
import { parseAndValidateBatch } from '../server/assessment/validation.ts';
import type { ItemBlueprint, RejectedQuestion } from './optimized-prompts.ts';

export const semanticVerdictSchema = z.object({
  id: z.string().regex(/^q-[1-9][0-9]*$/),
  bestOptionId: optionIdSchema.nullable(),
  viableOptionIds: z.array(optionIdSchema).max(4),
  inferredCategory: assessmentCategorySchema,
  estimatedCefrLevel: cefrLevelSchema,
  naturalness: z.number().int().min(1).max(5),
  uniqueness: z.number().int().min(1).max(5),
  distractorQuality: z.number().int().min(1).max(5),
  constructAlignment: z.number().int().min(1).max(5),
  fatalIssues: z.array(z.string().trim().min(1).max(500)).max(8),
  minorNotes: z.array(z.string().trim().min(1).max(500)).max(8),
});

export const semanticVerificationSchema = z.object({
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  verdicts: z.array(semanticVerdictSchema).min(1).max(10),
});

export type SemanticVerification = z.infer<typeof semanticVerificationSchema>;
export type SemanticVerdict = z.infer<typeof semanticVerdictSchema>;

export const replacementResponseSchema = z.object({
  questions: z.array(assessmentQuestionSchema).min(1),
});

export function parseJsonResponse(raw: string): unknown {
  let candidate = raw.trim();
  const thoughtEnd = candidate.lastIndexOf('<channel|>');
  if (thoughtEnd >= 0) candidate = candidate.slice(thoughtEnd + 10).trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidate = fenced[1].trim();

  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Report the original parse error because it points at the unmodified
        // model response and is more useful in the repair prompt.
      }
    }
    throw firstError;
  }
}

export function parseSemanticVerification(
  raw: string,
  round: 1 | 2 | 3,
  expectedIds: readonly string[],
):
  | { success: true; data: SemanticVerification }
  | {
      success: false;
      issues: string[];
    } {
  let value: unknown;
  try {
    value = normalizeVerifierOptionIds(parseJsonResponse(raw));
  } catch (error) {
    return {
      success: false,
      issues: [
        `Verifier output is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const parsed = semanticVerificationSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      }),
    };
  }
  const data: SemanticVerification = {
    ...parsed.data,
    verdicts: parsed.data.verdicts.map((verdict) =>
      verdict.bestOptionId !== null &&
      verdict.viableOptionIds.length === 0 &&
      verdict.uniqueness === 5 &&
      verdict.fatalIssues.length === 0
        ? { ...verdict, viableOptionIds: [verdict.bestOptionId] }
        : verdict,
    ),
  };
  const issues: string[] = [];
  if (data.round !== round) {
    issues.push(`round must be ${round}`);
  }
  const actualIds = data.verdicts.map((verdict) => verdict.id);
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    issues.push(
      `verdict ids must be exactly ${expectedIds.join(', ')} in that order`,
    );
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data };
}

function normalizeVerifierOptionIds(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('verdicts' in value)) {
    return value;
  }
  const verdicts = value.verdicts;
  if (!Array.isArray(verdicts)) return value;
  const validIds = new Set(['A', 'B', 'C', 'D']);
  return {
    ...value,
    verdicts: verdicts.map((verdict) => {
      if (!verdict || typeof verdict !== 'object') return verdict;
      const bestOptionId =
        'bestOptionId' in verdict &&
        typeof verdict.bestOptionId === 'string' &&
        validIds.has(verdict.bestOptionId)
          ? verdict.bestOptionId
          : null;
      const viableOptionIds =
        'viableOptionIds' in verdict && Array.isArray(verdict.viableOptionIds)
          ? verdict.viableOptionIds.filter(
              (id: unknown): id is string =>
                typeof id === 'string' && validIds.has(id),
            )
          : [];
      return { ...verdict, bestOptionId, viableOptionIds };
    }),
  };
}

export function validateBatchAgainstBlueprint(
  raw: string,
  round: 1 | 2 | 3,
  blueprint: readonly ItemBlueprint[],
):
  | { success: true; data: AssessmentBatch }
  | {
      success: false;
      issues: string[];
    } {
  let normalizedRaw = raw;
  try {
    normalizedRaw = JSON.stringify(
      normalizeAnswerPositions(parseJsonResponse(raw), blueprint),
    );
  } catch {
    // The application validator below provides its established parse error.
  }
  const validation = parseAndValidateBatch(normalizedRaw, round);
  if (!validation.success) return validation;
  const issues = blueprintIssues(validation.data.questions, blueprint);
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: validation.data };
}

export function validateReplacementQuestions(
  raw: string,
  blueprint: readonly ItemBlueprint[],
):
  | { success: true; data: AssessmentQuestion[] }
  | {
      success: false;
      issues: string[];
    } {
  let value: unknown;
  try {
    value = parseJsonResponse(raw);
  } catch (error) {
    return {
      success: false,
      issues: [
        `Replacement output is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  if (
    value &&
    typeof value === 'object' &&
    'questions' in value &&
    Array.isArray(value.questions)
  ) {
    value = {
      ...value,
      questions: value.questions.map((candidate) => {
        if (
          candidate &&
          typeof candidate === 'object' &&
          'question' in candidate
        ) {
          return candidate.question;
        }
        return candidate;
      }),
    };
  }
  value = normalizeAnswerPositions(value, blueprint);
  const parsed = replacementResponseSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      }),
    };
  }
  const issues = blueprintIssues(parsed.data.questions, blueprint);
  for (const [index, question] of parsed.data.questions.entries()) {
    if ((question.stem.match(/_____/g) ?? []).length !== 1) {
      issues.push(
        `questions.${index}.stem must contain the blank marker _____ exactly once`,
      );
    }
    const ids = question.options.map((option) => option.id).join(',');
    if (ids !== 'A,B,C,D') {
      issues.push(`questions.${index}.options must be ordered A, B, C, D`);
    }
    if (
      new Set(
        question.options.map((option) => option.text.trim().toLowerCase()),
      ).size !== 4
    ) {
      issues.push(`questions.${index}.options must have unique text`);
    }
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: parsed.data.questions };
}

export function rejectedQuestionsFromVerification(
  batch: AssessmentBatch,
  blueprint: readonly ItemBlueprint[],
  verification: SemanticVerification,
): RejectedQuestion[] {
  const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
  const rejected: RejectedQuestion[] = [];
  for (const question of batch.questions) {
    const slot = blueprint.find((candidate) => candidate.id === question.id);
    const verdict = verification.verdicts.find(
      (candidate) => candidate.id === question.id,
    );
    if (!slot || !verdict) {
      throw new Error(
        `Semantic verification is incomplete for ${question.id}.`,
      );
    }
    const issues = [...verdict.fatalIssues];
    if (verdict.bestOptionId !== slot.correctOptionId) {
      issues.push(
        `Independent solver chose ${verdict.bestOptionId ?? 'no option'}; required key is ${slot.correctOptionId}.`,
      );
    }
    if (
      verdict.viableOptionIds.length !== 1 ||
      verdict.viableOptionIds[0] !== slot.correctOptionId
    ) {
      const viableOptions = verdict.viableOptionIds.map((optionId) => {
        const text = question.options.find(
          (option) => option.id === optionId,
        )?.text;
        return text ? `${optionId}=${JSON.stringify(text)}` : optionId;
      });
      issues.push(
        `Defensible options were [${viableOptions.join(', ')}], but exactly [${slot.correctOptionId}] is required. Replace every defensible distractor with a clearly wrong but grammatically parallel option.`,
      );
    }
    if (verdict.uniqueness < 5) {
      issues.push(
        `uniqueness must be 5/5 for a placement item; verifier scored ${verdict.uniqueness}/5.`,
      );
    }
    if (verdict.inferredCategory !== slot.category) {
      issues.push(
        `Verifier classified the construct as ${verdict.inferredCategory}, not ${slot.category}.`,
      );
    }
    const targetIndex = cefrOrder.indexOf(slot.cefrLevel);
    const estimatedIndex = cefrOrder.indexOf(verdict.estimatedCefrLevel);
    if (Math.abs(targetIndex - estimatedIndex) > 1) {
      issues.push(
        `Verifier estimated ${verdict.estimatedCefrLevel}, more than one level from target ${slot.cefrLevel}.`,
      );
    }
    for (const [label, score] of [
      ['naturalness', verdict.naturalness],
      ['uniqueness', verdict.uniqueness],
      ['distractor quality', verdict.distractorQuality],
      ['construct alignment', verdict.constructAlignment],
    ] as const) {
      if (score <= 2) {
        issues.push(`${label} score was critically low at ${score}/5.`);
      }
    }
    if (issues.length > 0) {
      rejected.push({
        blueprint: slot,
        question,
        issues: [
          ...new Set([
            ...issues,
            ...verdict.minorNotes.map((note) => `Verifier note: ${note}`),
          ]),
        ],
      });
    }
  }
  return rejected;
}

export function rejectedQuestionsForDuplicateTargets(
  batch: AssessmentBatch,
  blueprint: readonly ItemBlueprint[],
  priorQuestions: readonly AssessmentQuestion[],
): RejectedQuestion[] {
  const rejected: RejectedQuestion[] = [];
  for (const question of batch.questions) {
    const slot = blueprint.find((candidate) => candidate.id === question.id);
    if (!slot) {
      throw new Error(
        `No duplicate-check blueprint exists for ${question.id}.`,
      );
    }
    const answer = answerText(question);
    const learningTokens = significantTokens(question.learningPoint);
    const duplicates = priorQuestions.filter((prior) => {
      if (prior.category !== question.category) return false;
      if (answer && answer === answerText(prior)) return true;
      const priorTokens = significantTokens(prior.learningPoint);
      const intersection = [...learningTokens].filter((token) =>
        priorTokens.has(token),
      ).length;
      const union = new Set([...learningTokens, ...priorTokens]).size;
      return intersection > 0 && union > 0 && intersection / union >= 0.6;
    });
    if (duplicates.length > 0) {
      rejected.push({
        blueprint: slot,
        question,
        issues: [
          `Target duplicates an earlier assessment item (${duplicates
            .map((duplicate) => duplicate.learningPoint)
            .join(', ')}). Use a different construct or expression.`,
        ],
      });
    }
  }
  return rejected;
}

export function rejectedQuestionsForConstructShape(
  batch: AssessmentBatch,
  blueprint: readonly ItemBlueprint[],
): RejectedQuestion[] {
  const rejected: RejectedQuestion[] = [];
  for (const question of batch.questions) {
    const slot = blueprint.find((candidate) => candidate.id === question.id);
    if (!slot) {
      throw new Error(
        `No construct-check blueprint exists for ${question.id}.`,
      );
    }
    const optionWordCounts = question.options.map(
      (option) => option.text.trim().split(/\s+/).length,
    );
    const issues: string[] = [];
    if (
      question.category === 'vocabulary' &&
      optionWordCounts.some((count) => count !== 1)
    ) {
      issues.push(
        'Vocabulary options must each be one lexical word; this item drifts into a multiword-expression contrast.',
      );
    }
    if (
      question.category === 'idiom' &&
      optionWordCounts.some((count) => count < 2)
    ) {
      issues.push(
        'Idiom options must all be multiword expressions; at least one option is a single lexical word.',
      );
    }
    if (issues.length > 0) rejected.push({ blueprint: slot, question, issues });
  }
  return rejected;
}

export function mergeRejectedQuestions(
  ...groups: readonly RejectedQuestion[][]
): RejectedQuestion[] {
  const merged = new Map<string, RejectedQuestion>();
  for (const group of groups) {
    for (const rejected of group) {
      const existing = merged.get(rejected.question.id);
      merged.set(
        rejected.question.id,
        existing
          ? {
              ...existing,
              issues: [...new Set([...existing.issues, ...rejected.issues])],
            }
          : rejected,
      );
    }
  }
  return [...merged.values()];
}

function blueprintIssues(
  questions: readonly AssessmentQuestion[],
  blueprint: readonly ItemBlueprint[],
): string[] {
  const issues: string[] = [];
  if (questions.length !== blueprint.length) {
    issues.push(
      `questions must contain ${blueprint.length} item(s), received ${questions.length}`,
    );
  }
  const fields = [
    'id',
    'category',
    'cefrLevel',
    'difficultyRank',
    'correctOptionId',
  ] as const;
  for (const [index, slot] of blueprint.entries()) {
    const question = questions[index];
    if (!question) continue;
    for (const field of fields) {
      if (question[field] !== slot[field]) {
        issues.push(
          `questions.${index}.${field} must be ${String(slot[field])}, received ${String(question[field])}`,
        );
      }
    }
    if (question.learningPoint !== slot.targetConstruct) {
      issues.push(
        `questions.${index}.learningPoint must exactly match targetConstruct ${JSON.stringify(slot.targetConstruct)}`,
      );
    }
  }
  return issues;
}

function normalizeAnswerPositions(
  value: unknown,
  blueprint: readonly ItemBlueprint[],
): unknown {
  if (!value || typeof value !== 'object' || !('questions' in value)) {
    return value;
  }
  const questions = value.questions;
  if (!Array.isArray(questions)) return value;
  return {
    ...value,
    questions: questions.map((candidate, index) => {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('options' in candidate) ||
        !Array.isArray(candidate.options)
      ) {
        return candidate;
      }
      const slot = blueprint[index];
      if (!slot) return candidate;
      // The optimized generator is deliberately required to place its answer
      // at A before the host rebalances positions. Some small/local models put
      // correctOptionId inside every option and omit it at question level; the
      // generation contract makes that structural mistake safe to normalize.
      const generatedKey =
        'correctOptionId' in candidate &&
        typeof candidate.correctOptionId === 'string'
          ? candidate.correctOptionId
          : 'A';
      if (generatedKey === slot.correctOptionId) {
        return { ...candidate, correctOptionId: slot.correctOptionId };
      }
      const options: Array<Record<string, unknown>> = candidate.options.map(
        (option: unknown) =>
          option && typeof option === 'object' ? { ...option } : {},
      );
      const generatedOption = options.find(
        (option: Record<string, unknown>) => option.id === generatedKey,
      );
      const requiredOption = options.find(
        (option: Record<string, unknown>) => option.id === slot.correctOptionId,
      );
      if (!generatedOption || !requiredOption) return candidate;
      const generatedText = generatedOption.text;
      generatedOption.text = requiredOption.text;
      requiredOption.text = generatedText;
      return {
        ...candidate,
        correctOptionId: slot.correctOptionId,
        options,
      };
    }),
  };
}

function answerText(question: AssessmentQuestion): string {
  return normalize(
    question.options.find((option) => option.id === question.correctOptionId)
      ?.text ?? '',
  );
}

function significantTokens(value: string): Set<string> {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'for',
    'form',
    'in',
    'of',
    'the',
    'to',
    'usage',
    'using',
    'vs',
    'with',
  ]);
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}
