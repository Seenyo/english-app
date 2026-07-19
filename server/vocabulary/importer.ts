export type ImportedVocabularyItem = {
  itemKey: string;
  kind: 'word' | 'idiom';
  sourceName: string;
  sourceVersion: string;
  sourceOrder: number;
  term: string;
  meaningJa: string;
  section: number | null;
  part: number | null;
};

export function parseTarget1900Text(text: string): ImportedVocabularyItem[] {
  const items: ImportedVocabularyItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = line.match(/^\s*(\d{1,4})\s+(.+)$/);
    if (!row) continue;
    const sourceOrder = Number(row[1]);
    if (sourceOrder < 1 || sourceOrder > 1900) continue;
    const remainder = row[2]!;
    const meaningStart = Array.from(remainder).findIndex(
      (character) => character.charCodeAt(0) > 127,
    );
    if (meaningStart < 1) continue;
    const term = remainder.slice(0, meaningStart).trim();
    const meaningJa = remainder.slice(meaningStart).trim();
    if (!term || !meaningJa) continue;
    const section = Math.ceil(sourceOrder / 100);
    items.push({
      itemKey: `target1900-6:${String(sourceOrder).padStart(4, '0')}`,
      kind: 'word',
      sourceName: 'English Vocabulary Target 1900',
      sourceVersion: '6th',
      sourceOrder,
      term,
      meaningJa,
      section,
      part: section <= 8 ? 1 : section <= 15 ? 2 : 3,
    });
  }
  assertCompleteSequence(items, 1900, 'Target 1900');
  return items;
}

export function parseIdiomsTsv(text: string): ImportedVocabularyItem[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift()?.split('\t');
  if (header?.join('\t') !== 'No\t熟語\t意味') {
    throw new Error('idioms.tsv has an unexpected header.');
  }
  const items = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const columns = line.split('\t');
      if (columns.length !== 3) {
        throw new Error(`Invalid idiom row: ${line}`);
      }
      const sourceOrder = Number(columns[0]);
      return {
        itemKey: `idioms-v1:${String(sourceOrder).padStart(4, '0')}`,
        kind: 'idiom' as const,
        sourceName: 'Personal Idioms List',
        sourceVersion: 'v1',
        sourceOrder,
        term: columns[1]!.trim(),
        meaningJa: columns[2]!.trim(),
        section: null,
        part: null,
      };
    });
  assertCompleteSequence(items, 1684, 'idioms.tsv');
  return items;
}

function assertCompleteSequence(
  items: ImportedVocabularyItem[],
  expected: number,
  label: string,
) {
  if (items.length !== expected) {
    throw new Error(
      `${label}: expected ${expected} rows, found ${items.length}.`,
    );
  }
  const orders = new Set(items.map((item) => item.sourceOrder));
  for (let order = 1; order <= expected; order += 1) {
    if (!orders.has(order)) throw new Error(`${label}: missing No. ${order}.`);
  }
}
