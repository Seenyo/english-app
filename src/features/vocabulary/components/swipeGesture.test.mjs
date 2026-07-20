import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommittedSwipeDirection } from './swipeGesture.ts';

test('requires a deliberate swipe distance in all four directions', () => {
  assert.equal(getCommittedSwipeDirection(130, 10, 350), 'right');
  assert.equal(getCommittedSwipeDirection(-130, 10, 350), 'left');
  assert.equal(getCommittedSwipeDirection(10, -130, 350), 'up');
  assert.equal(getCommittedSwipeDirection(10, 130, 350), 'down');
  assert.equal(getCommittedSwipeDirection(100, 0, 350), null);
});

test('rejects long but ambiguous diagonal drags', () => {
  assert.equal(getCommittedSwipeDirection(140, 120, 350), null);
  assert.equal(getCommittedSwipeDirection(-130, -120, 350), null);
});
