import assert from 'node:assert/strict';
import test from 'node:test';
import { canContinueVocabularyCheck } from './continuation.ts';

const completedCounts = {
  total: 1900,
  classified: 1900,
  unclassified: 0,
  mastered: 1900,
  mostlyKnown: 0,
  mostlyUnknown: 0,
  unknown: 0,
};

const partialCounts = {
  ...completedCounts,
  classified: 885,
  unclassified: 1015,
  mastered: 885,
};

function overview(resumableSessions, words = completedCounts) {
  return {
    words,
    idioms: { ...completedCounts, total: 1684, classified: 1684 },
    lastCheckedAt: null,
    resumableSessions,
  };
}

test('offers continuation while unclassified items remain', () => {
  assert.equal(
    canContinueVocabularyCheck(overview([], partialCounts), 'word'),
    true,
  );
});

test('ignores restart and section-scoped sessions for global continuation', () => {
  assert.equal(
    canContinueVocabularyCheck(
      overview([
        {
          id: 'd9ebfc9e-7d5f-4caa-8860-88bcb94f40e8',
          kind: 'word',
          section: null,
          mode: 'restart',
          position: 12,
          total: 1900,
        },
        {
          id: 'cd26d375-ccaf-45b8-aa05-9155ec20cc42',
          kind: 'word',
          section: 9,
          mode: 'continue',
          position: 12,
          total: 100,
        },
      ]),
      'word',
    ),
    false,
  );
});

test('offers continuation for a matching global continue session', () => {
  assert.equal(
    canContinueVocabularyCheck(
      overview([
        {
          id: '5c996d68-770a-4ae7-a1e8-5925bc91c50f',
          kind: 'word',
          section: null,
          mode: 'continue',
          position: 12,
          total: 1900,
        },
      ]),
      'word',
    ),
    true,
  );
});
