import { z } from 'zod';

const exampleSchema = z.object({
  english: z.string().trim().min(1).max(1200),
  japanese: z.string().trim().min(1).max(1200),
});

const correctedEntrySchema = z.object({
  id: z.string().regex(/^(target1900-6|idioms-v1):\d{4}$/),
  kind: z.enum(['word', 'idiom']),
  source_order: z.number().int().positive(),
  term: z.string().trim().min(1).max(300),
  meaning_ja: z.string().trim().min(1).max(2400),
  examples: z.array(exampleSchema).length(3),
});

const correctedDatasetSchema = z.object({
  model: z.string().trim().min(1).max(200),
  qa_model: z.string().trim().min(1).max(200),
  entries: z.array(correctedEntrySchema),
});

const correctionSchema = z.object({
  id: z.string().regex(/^(target1900-6|idioms-v1):\d{4}$/),
  kind: z.enum(['word', 'idiom']),
  term: z.string().trim().min(1).max(300),
  original_meaning_ja: z.string().trim().min(1).max(2400),
  corrected_meaning_ja: z.string().trim().min(1).max(2400),
  reason_ja: z.string().trim().min(1).max(4000),
});

const qaReportSchema = z.object({
  source_correction_count: z.number().int().nonnegative(),
  source_corrections: z.array(correctionSchema),
  unresolved_after_reqa_count: z.literal(0),
  unresolved_after_reqa: z.array(z.never()).length(0),
});

export type VocabularyExampleImportEntry = {
  itemKey: string;
  kind: 'word' | 'idiom';
  sourceOrder: number;
  term: string;
  meaningJa: string;
  examples: Array<{ english: string; japanese: string }>;
  sourceCorrection?: {
    originalMeaningJa: string;
    correctedMeaningJa: string;
    reasonJa: string;
  };
};

export type VocabularyExampleImport = {
  generationModel: string;
  qaModel: string;
  entries: VocabularyExampleImportEntry[];
  correctionCount: number;
};

export function parseVocabularyExampleArtifacts(
  correctedDatasetText: string,
  qaReportText: string,
): VocabularyExampleImport {
  const dataset = correctedDatasetSchema.parse(
    parseJson(correctedDatasetText, 'corrected example dataset'),
  );
  const report = qaReportSchema.parse(parseJson(qaReportText, 'QA report'));

  if (dataset.entries.length !== 3584) {
    throw new Error(
      `Corrected example dataset: expected 3584 entries, found ${dataset.entries.length}.`,
    );
  }
  if (report.source_corrections.length !== report.source_correction_count) {
    throw new Error(
      'QA report source correction count does not match its rows.',
    );
  }

  const corrections = new Map(
    report.source_corrections.map((correction) => {
      if (correction.original_meaning_ja === correction.corrected_meaning_ja) {
        throw new Error(
          `${correction.id}: source correction does not change the meaning.`,
        );
      }
      return [correction.id, correction] as const;
    }),
  );
  if (corrections.size !== report.source_corrections.length) {
    throw new Error('QA report contains duplicate source correction IDs.');
  }

  const seenIds = new Set<string>();
  const entries = dataset.entries.map((entry, index) => {
    const expected = expectedIdentity(index);
    if (
      entry.id !== expected.id ||
      entry.kind !== expected.kind ||
      entry.source_order !== expected.sourceOrder
    ) {
      throw new Error(
        `Corrected example dataset is out of sequence at index ${index}: expected ${expected.id}.`,
      );
    }
    if (seenIds.has(entry.id)) {
      throw new Error(
        `Corrected example dataset contains duplicate ID ${entry.id}.`,
      );
    }
    seenIds.add(entry.id);

    const correction = corrections.get(entry.id);
    if (correction) {
      if (correction.kind !== entry.kind || correction.term !== entry.term) {
        throw new Error(
          `${entry.id}: source correction identity does not match the dataset.`,
        );
      }
      if (correction.corrected_meaning_ja !== entry.meaning_ja) {
        throw new Error(
          `${entry.id}: corrected meaning does not match the final dataset.`,
        );
      }
    }

    return {
      itemKey: entry.id,
      kind: entry.kind,
      sourceOrder: entry.source_order,
      term: entry.term,
      meaningJa: entry.meaning_ja,
      examples: entry.examples,
      ...(correction
        ? {
            sourceCorrection: {
              originalMeaningJa: correction.original_meaning_ja,
              correctedMeaningJa: correction.corrected_meaning_ja,
              reasonJa: correction.reason_ja,
            },
          }
        : {}),
    };
  });

  for (const correctionId of corrections.keys()) {
    if (!seenIds.has(correctionId)) {
      throw new Error(
        `QA report correction ${correctionId} is missing from the dataset.`,
      );
    }
  }

  return {
    generationModel: dataset.model,
    qaModel: dataset.qa_model,
    entries,
    correctionCount: corrections.size,
  };
}

function expectedIdentity(index: number) {
  if (index < 1900) {
    const sourceOrder = index + 1;
    return {
      id: `target1900-6:${String(sourceOrder).padStart(4, '0')}`,
      kind: 'word' as const,
      sourceOrder,
    };
  }
  const sourceOrder = index - 1900 + 1;
  return {
    id: `idioms-v1:${String(sourceOrder).padStart(4, '0')}`,
    kind: 'idiom' as const,
    sourceOrder,
  };
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}
