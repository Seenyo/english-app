import assert from 'node:assert/strict';
import test from 'node:test';
import { AssessmentRepositoryError, assertAnswerSaved } from './repository.ts';

test('assertAnswerSaved accepts the successful RPC outcome', () => {
  assert.doesNotThrow(() => assertAnswerSaved('saved', 'assessment'));
});

test('assertAnswerSaved preserves stale-round conflicts', () => {
  assert.throws(
    () => assertAnswerSaved('round_mismatch', 'assessment'),
    (error: unknown) =>
      error instanceof AssessmentRepositoryError &&
      error.code === 'round_mismatch',
  );
});

test('assertAnswerSaved rejects unexpected RPC outcomes', () => {
  assert.throws(
    () => assertAnswerSaved(null, 'dry-run'),
    (error: unknown) =>
      error instanceof AssessmentRepositoryError &&
      error.code === 'database_error',
  );
});
