import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResumableSessionScope,
  resolveVocabularyRepositoryCode,
} from './repository.ts';

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

test('continues only a matching continue session', () => {
  assert.deepEqual(buildResumableSessionScope(undefined, 'continue'), {
    section: null,
    mode: 'continue',
  });
  assert.deepEqual(buildResumableSessionScope(9, 'continue'), {
    section: 9,
    mode: 'continue',
  });
  assert.deepEqual(buildResumableSessionScope(), {});
});
