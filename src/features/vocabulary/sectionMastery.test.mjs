import assert from 'node:assert/strict';
import test from 'node:test';
import { isVocabularySectionMastered } from './sectionMastery.ts';

const overview = {
  sectionMastery: [
    {
      kind: 'word',
      section: 1,
      total: 100,
      mastered: 100,
      isMastered: true,
    },
    {
      kind: 'idiom',
      section: 17,
      total: 84,
      mastered: 83,
      isMastered: false,
    },
  ],
};

test('recognizes only a fully mastered matching section', () => {
  assert.equal(isVocabularySectionMastered(overview, 'word', 1), true);
  assert.equal(isVocabularySectionMastered(overview, 'word', 2), false);
  assert.equal(isVocabularySectionMastered(overview, 'idiom', 17), false);
  assert.equal(isVocabularySectionMastered(null, 'word', 1), false);
});
