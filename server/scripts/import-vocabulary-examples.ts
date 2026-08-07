import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readServerConfig } from '../config.ts';
import { parseVocabularyExampleArtifacts } from '../vocabulary/example-importer.ts';

const correctedPath =
  process.argv[2] ??
  'local-model-evaluation/artifacts/glm52-full-qa/corrected-examples.json';
const reportPath =
  process.argv[3] ??
  'local-model-evaluation/artifacts/glm52-full-qa/qa-report.json';
const batchResultSchema = z.object({
  items: z.number().int().nonnegative(),
  examples: z.number().int().nonnegative(),
  corrections: z.number().int().nonnegative(),
});

const config = readServerConfig();
const database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [correctedText, reportText] = await Promise.all([
  readFile(correctedPath, 'utf8'),
  readFile(reportPath, 'utf8'),
]);
const artifact = parseVocabularyExampleArtifacts(correctedText, reportText);

let importedItems = 0;
let importedExamples = 0;
let importedCorrections = 0;
for (let index = 0; index < artifact.entries.length; index += 100) {
  const entries = artifact.entries.slice(index, index + 100);
  const { data, error } = await database.rpc(
    'import_vocabulary_example_batch',
    {
      p_entries: entries,
      p_generation_model: artifact.generationModel,
      p_qa_model: artifact.qaModel,
    },
  );
  if (error) {
    throw new Error(
      `Vocabulary example import failed for entries ${index + 1}-${index + entries.length}: ${error.message}`,
    );
  }
  const result = batchResultSchema.parse(data);
  if (
    result.items !== entries.length ||
    result.examples !== entries.length * 3
  ) {
    throw new Error(
      `Vocabulary example import returned unexpected counts for entries ${index + 1}-${index + entries.length}.`,
    );
  }
  importedItems += result.items;
  importedExamples += result.examples;
  importedCorrections += result.corrections;
}

if (
  importedItems !== artifact.entries.length ||
  importedExamples !== artifact.entries.length * 3 ||
  importedCorrections !== artifact.correctionCount
) {
  throw new Error(
    'Vocabulary example import totals did not match the validated artifacts.',
  );
}

const [
  { count: exampleCount, error: exampleCountError },
  { count: correctionCount, error: correctionCountError },
] = await Promise.all([
  database
    .from('vocabulary_examples')
    .select('*', { count: 'exact', head: true })
    .eq('generation_model', artifact.generationModel)
    .eq('qa_model', artifact.qaModel),
  database
    .from('vocabulary_source_corrections')
    .select('*', { count: 'exact', head: true })
    .eq('qa_model', artifact.qaModel),
]);
if (exampleCountError) {
  throw new Error(
    `Could not verify imported examples: ${exampleCountError.message}`,
  );
}
if (correctionCountError) {
  throw new Error(
    `Could not verify imported corrections: ${correctionCountError.message}`,
  );
}
if (exampleCount !== artifact.entries.length * 3) {
  throw new Error(
    `Expected 10752 imported examples, found ${exampleCount ?? 'unknown'}.`,
  );
}
if (correctionCount !== artifact.correctionCount) {
  throw new Error(
    `Expected ${artifact.correctionCount} imported corrections, found ${correctionCount ?? 'unknown'}.`,
  );
}

const correctedEntries = artifact.entries.filter(
  (entry) => entry.sourceCorrection,
);
for (let index = 0; index < correctedEntries.length; index += 50) {
  const expected = correctedEntries.slice(index, index + 50);
  const { data, error } = await database
    .from('vocabulary_items')
    .select('item_key, meaning_ja')
    .in(
      'item_key',
      expected.map((entry) => entry.itemKey),
    );
  if (error)
    throw new Error(`Could not verify corrected meanings: ${error.message}`);
  const meanings = new Map(data.map((row) => [row.item_key, row.meaning_ja]));
  for (const entry of expected) {
    if (meanings.get(entry.itemKey) !== entry.meaningJa) {
      throw new Error(`${entry.itemKey}: corrected meaning was not stored.`);
    }
  }
}

console.log(
  `Imported and verified ${importedExamples} examples for ${importedItems} entries with ${importedCorrections} source corrections.`,
);
