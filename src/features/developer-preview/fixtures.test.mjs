import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerDeveloperPreviewMemoryCard,
  createDeveloperPreviewMemoryState,
  developerPreviewAssessmentState,
  developerPreviewMemoryOverview,
  developerPreviewVocabularyOverview,
  toDeveloperPreviewMemorySession,
} from './fixtures.ts';

test('developer preview boots into a completed learner state', () => {
  assert.equal(developerPreviewAssessmentState.status, 'completed');
  assert.equal(developerPreviewVocabularyOverview.words.total, 1900);
  assert.equal(developerPreviewVocabularyOverview.idioms.total, 1684);
  assert.equal(developerPreviewMemoryOverview.recommendedCount, 10);
});

test('developer preview repeats a missed card after the initial ten', () => {
  const state = createDeveloperPreviewMemoryState('idiom', 17);
  assert.equal(toDeveloperPreviewMemorySession(state).kind, 'idiom');
  assert.equal(toDeveloperPreviewMemorySession(state).section, 17);
  const first = toDeveloperPreviewMemorySession(state).currentCard;
  assert.ok(first);

  answerDeveloperPreviewMemoryCard(state, first.id, 'again');
  for (let index = 1; index < 10; index += 1) {
    const card = toDeveloperPreviewMemorySession(state).currentCard;
    assert.ok(card);
    answerDeveloperPreviewMemoryCard(state, card.id, 'remembered');
  }

  const repeated = toDeveloperPreviewMemorySession(state);
  assert.equal(repeated.currentCard?.id, first.id);
  assert.equal(repeated.againCount, 1);

  const complete = answerDeveloperPreviewMemoryCard(
    state,
    first.id,
    'remembered',
  );
  assert.equal(complete.status, 'completed');
  assert.equal(complete.rememberedCount, 10);
  assert.equal(complete.againCount, 0);
});
