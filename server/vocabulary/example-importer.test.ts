import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVocabularyExampleArtifacts } from './example-importer.ts';

test('validates and joins complete corrected examples with source corrections', () => {
  const entries = buildEntries();
  entries[88]!.meaning_ja = '忍耐強い';
  const result = parseVocabularyExampleArtifacts(
    JSON.stringify({
      model: 'z-ai/glm-5.2',
      qa_model: 'z-ai/glm-5.2',
      entries,
    }),
    JSON.stringify({
      source_correction_count: 1,
      source_corrections: [
        {
          id: 'target1900-6:0089',
          kind: 'word',
          term: 'term-89',
          original_meaning_ja: '忍耐強い；勤勉な',
          corrected_meaning_ja: '忍耐強い',
          reason_ja: '語義の訂正',
        },
      ],
      unresolved_after_reqa_count: 0,
      unresolved_after_reqa: [],
    }),
  );

  assert.equal(result.entries.length, 3584);
  assert.equal(result.entries[1899]?.itemKey, 'target1900-6:1900');
  assert.equal(result.entries[1900]?.itemKey, 'idioms-v1:0001');
  assert.equal(result.entries[3583]?.itemKey, 'idioms-v1:1684');
  assert.equal(result.correctionCount, 1);
  assert.deepEqual(result.entries[88]?.sourceCorrection, {
    originalMeaningJa: '忍耐強い；勤勉な',
    correctedMeaningJa: '忍耐強い',
    reasonJa: '語義の訂正',
  });
});

test('rejects artifacts with unresolved QA findings', () => {
  assert.throws(() =>
    parseVocabularyExampleArtifacts(
      JSON.stringify({
        model: 'z-ai/glm-5.2',
        qa_model: 'z-ai/glm-5.2',
        entries: buildEntries(),
      }),
      JSON.stringify({
        source_correction_count: 0,
        source_corrections: [],
        unresolved_after_reqa_count: 1,
        unresolved_after_reqa: [{ id: 'target1900-6:0001' }],
      }),
    ),
  );
});

test('rejects an out-of-sequence corrected dataset', () => {
  const entries = buildEntries();
  [entries[0], entries[1]] = [entries[1]!, entries[0]!];
  assert.throws(
    () =>
      parseVocabularyExampleArtifacts(
        JSON.stringify({
          model: 'z-ai/glm-5.2',
          qa_model: 'z-ai/glm-5.2',
          entries,
        }),
        JSON.stringify({
          source_correction_count: 0,
          source_corrections: [],
          unresolved_after_reqa_count: 0,
          unresolved_after_reqa: [],
        }),
      ),
    /out of sequence/,
  );
});

function buildEntries() {
  return Array.from({ length: 3584 }, (_, index) => {
    const isWord = index < 1900;
    const sourceOrder = isWord ? index + 1 : index - 1900 + 1;
    const prefix = isWord ? 'target1900-6' : 'idioms-v1';
    return {
      id: `${prefix}:${String(sourceOrder).padStart(4, '0')}`,
      kind: isWord ? ('word' as const) : ('idiom' as const),
      source_order: sourceOrder,
      term: `term-${sourceOrder}`,
      meaning_ja: `意味-${sourceOrder}`,
      examples: [1, 2, 3].map((position) => ({
        english: `Example ${sourceOrder}-${position}.`,
        japanese: `例文 ${sourceOrder}-${position}。`,
      })),
    };
  });
}
