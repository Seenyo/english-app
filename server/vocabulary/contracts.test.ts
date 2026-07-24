import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerVocabularyMemoryRequestSchema,
  isVocabularySessionConflictCode,
  startVocabularyMemoryRequestSchema,
  startVocabularySessionRequestSchema,
  startVocabularySessionResultSchema,
  vocabularyMemorySessionSchema,
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

test('validates the compact memorization session and idempotent answer payload', () => {
  const session = vocabularyMemorySessionSchema.parse({
    id: '00000000-0000-4000-8000-000000000020',
    kind: 'word',
    section: 1,
    status: 'active',
    position: 0,
    total: 10,
    initialCount: 10,
    currentCard: {
      id: 1,
      kind: 'word',
      sourceOrder: 1,
      term: 'create',
      meaningJa: '作る',
      section: 1,
      part: 1,
    },
    rememberedCount: 0,
    againCount: 0,
  });
  assert.equal(session.currentCard?.term, 'create');
  assert.equal(
    answerVocabularyMemoryRequestSchema.parse({
      operationId: '00000000-0000-4000-8000-000000000021',
      itemId: 1,
      result: 'remembered',
      responseMs: 1_250,
    }).result,
    'remembered',
  );
  assert.equal(
    startVocabularyMemoryRequestSchema.parse({
      kind: 'idiom',
      section: 17,
    }).section,
    17,
  );
  assert.equal(
    startVocabularySessionRequestSchema.parse({
      kind: 'word',
      section: 19,
      mode: 'restart',
      skippedSections: [],
      recheckRatings: [],
    }).section,
    19,
  );
  assert.equal(
    startVocabularySessionRequestSchema.parse({
      kind: 'idiom',
      mode: 'continue',
      skippedSections: [],
      recheckRatings: [],
    }).section,
    undefined,
  );
});
