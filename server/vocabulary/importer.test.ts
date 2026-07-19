import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdiomsTsv, parseTarget1900Text } from './importer.ts';

test('parses Target rows even when a long headword leaves one separator', () => {
  const text = Array.from({ length: 1900 }, (_, index) => {
    const order = index + 1;
    const term = order === 1099 ? 'simultaneously' : `word${order}`;
    return `${order} ${term} 日本語の意味${order}`;
  }).join('\n');
  const items = parseTarget1900Text(text);
  assert.equal(items.length, 1900);
  assert.deepEqual(items[1098], {
    itemKey: 'target1900-6:1099',
    kind: 'word',
    sourceName: 'English Vocabulary Target 1900',
    sourceVersion: '6th',
    sourceOrder: 1099,
    term: 'simultaneously',
    meaningJa: '日本語の意味1099',
    section: 11,
    part: 2,
  });
});

test('parses and validates 1684 idiom rows', () => {
  const text = [
    'No\t熟語\t意味',
    ...Array.from(
      { length: 1684 },
      (_, index) => `${index + 1}\tidiom ${index + 1}\t意味 ${index + 1}`,
    ),
  ].join('\n');
  const items = parseIdiomsTsv(text);
  assert.equal(items.length, 1684);
  assert.equal(items[1683]?.itemKey, 'idioms-v1:1684');
});
