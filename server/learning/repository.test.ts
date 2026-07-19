import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAnalysisJob } from './repository.ts';

test('keeps polling while a failed analysis has automatic retries left', () => {
  for (const runCount of [1, 2]) {
    assert.deepEqual(
      describeAnalysisJob({ status: 'failed', run_count: runCount }),
      {
        status: 'pending',
        message: '詳細分析で一時的なエラーが発生しました。自動で再試行します。',
      },
    );
  }
});

test('exposes a terminal failure after the automatic retry budget is exhausted', () => {
  assert.deepEqual(describeAnalysisJob({ status: 'failed', run_count: 3 }), {
    status: 'failed',
    message: '詳細分析を完了できませんでした。再試行できます。',
  });
});

test('preserves active analysis states', () => {
  assert.deepEqual(describeAnalysisJob({ status: 'pending', run_count: 0 }), {
    status: 'pending',
    message: null,
  });
  assert.deepEqual(describeAnalysisJob({ status: 'running', run_count: 1 }), {
    status: 'running',
    message: null,
  });
});
