import assert from 'node:assert/strict';
import test from 'node:test';
import { getMemoryDirection } from './memoryDirection.ts';

test('keeps a memory card direction stable for the same presentation', () => {
  const direction = getMemoryDirection(
    'b28cd933-29fc-44e1-82ec-7b45e5bd91eb',
    42,
    3,
  );

  assert.equal(
    getMemoryDirection('b28cd933-29fc-44e1-82ec-7b45e5bd91eb', 42, 3),
    direction,
  );
});

test('distributes a session across both recall directions', () => {
  const directions = new Set(
    Array.from({ length: 10 }, (_, position) =>
      getMemoryDirection(
        'b28cd933-29fc-44e1-82ec-7b45e5bd91eb',
        100 + position,
        position,
      ),
    ),
  );

  assert.deepEqual(directions, new Set(['en-to-ja', 'ja-to-en']));
});
