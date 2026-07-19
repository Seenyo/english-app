import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { readServerConfig } from '../config.ts';
import {
  parseIdiomsTsv,
  parseTarget1900Text,
  type ImportedVocabularyItem,
} from '../vocabulary/importer.ts';

const execFileAsync = promisify(execFile);
const targetPath = process.argv[2] ?? 'words-1900.pdf';
const idiomsPath = process.argv[3] ?? 'idioms.tsv';
const config = readServerConfig();
const database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [{ stdout: targetText }, idiomsText] = await Promise.all([
  execFileAsync('pdftotext', ['-layout', targetPath, '-'], {
    maxBuffer: 8 * 1024 * 1024,
  }),
  readFile(idiomsPath, 'utf8'),
]);
const items = [
  ...parseTarget1900Text(targetText),
  ...parseIdiomsTsv(idiomsText),
];

for (let index = 0; index < items.length; index += 400) {
  const batch = items.slice(index, index + 400).map(toDatabaseRow);
  const { error } = await database
    .from('vocabulary_items')
    .upsert(batch, { onConflict: 'item_key' });
  if (error) throw new Error(`Vocabulary import failed: ${error.message}`);
}

console.log(`Imported ${items.length} items (1900 words, 1684 idioms).`);

function toDatabaseRow(item: ImportedVocabularyItem) {
  return {
    item_key: item.itemKey,
    owner_user_id: null,
    kind: item.kind,
    source_name: item.sourceName,
    source_version: item.sourceVersion,
    source_order: item.sourceOrder,
    term: item.term,
    meaning_ja: item.meaningJa,
    section: item.section,
    part: item.part,
  };
}
