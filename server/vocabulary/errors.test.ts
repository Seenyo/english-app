import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiresVocabularySessionRecovery,
  VocabularyApiError,
} from '../../src/features/vocabulary/errors.ts';

test('requires recovery for a non-retryable session rejection', () => {
  const error = new VocabularyApiError(
    'Item is not part of the session.',
    'item_not_in_vocabulary_session',
    false,
    400,
  );
  assert.equal(requiresVocabularySessionRecovery(error), true);
});

test('keeps transient network and server failures retryable', () => {
  const networkError = new VocabularyApiError(
    'Offline.',
    'network_error',
    true,
    null,
  );
  const serverError = new VocabularyApiError(
    'Unavailable.',
    'database_error',
    true,
    503,
  );
  assert.equal(requiresVocabularySessionRecovery(networkError), false);
  assert.equal(requiresVocabularySessionRecovery(serverError), false);
});
