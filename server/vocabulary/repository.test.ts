import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVocabularyRepositoryCode } from './repository.ts';

test('prefers a vocabulary domain conflict over the generic Postgres code', () => {
  assert.equal(
    resolveVocabularyRepositoryCode({
      code: '22023',
      message: 'vocabulary_position_mismatch',
    }),
    'vocabulary_position_mismatch',
  );
});

test('preserves an unknown Postgres code', () => {
  assert.equal(
    resolveVocabularyRepositoryCode({ code: '53300', message: 'overloaded' }),
    '53300',
  );
});
