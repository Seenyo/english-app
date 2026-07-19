import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVocabularySessionConflictCode,
  startVocabularySessionResultSchema,
} from '../../shared/vocabulary/contracts.ts';

test('accepts an already-completed vocabulary start outcome', () => {
  assert.deepEqual(
    startVocabularySessionResultSchema.parse({ outcome: 'completed' }),
    { outcome: 'completed' },
  );
});

test('recognizes permanent session conflicts without treating validation errors as conflicts', () => {
  assert.equal(
    isVocabularySessionConflictCode('vocabulary_position_mismatch'),
    true,
  );
  assert.equal(
    isVocabularySessionConflictCode('invalid_vocabulary_rating'),
    false,
  );
  assert.equal(isVocabularySessionConflictCode(undefined), false);
});
