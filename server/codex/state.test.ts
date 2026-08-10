import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeCodexState, persistCodexState } from './state.ts';

test('restores mirrored Codex state and prefers it over the auth seed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-state-'));
  try {
    const runtime = join(root, 'runtime');
    const mirror = join(root, 'mirror');
    const seed = join(root, 'seed.json');
    await mkdir(join(mirror, 'sessions', '2026'), { recursive: true });
    await writeFile(join(mirror, 'auth.json'), 'mirrored-auth');
    await writeFile(join(mirror, 'sessions', '2026', 'thread.jsonl'), 'turn');
    await writeFile(seed, 'seed-auth');

    await initializeCodexState({
      CODEX_HOME: runtime,
      CODEX_STATE_MIRROR_DIR: mirror,
      CODEX_AUTH_SEED_FILE: seed,
    });

    assert.equal(
      await readFile(join(runtime, 'auth.json'), 'utf8'),
      'mirrored-auth',
    );
    assert.equal(
      await readFile(join(runtime, 'sessions', '2026', 'thread.jsonl'), 'utf8'),
      'turn',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('seeds a new runtime and persists updated auth and sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-state-'));
  try {
    const runtime = join(root, 'runtime');
    const mirror = join(root, 'mirror');
    const seed = join(root, 'seed.json');
    await writeFile(seed, 'seed-auth');

    const environment = {
      CODEX_HOME: runtime,
      CODEX_STATE_MIRROR_DIR: mirror,
      CODEX_AUTH_SEED_FILE: seed,
    };
    await initializeCodexState(environment);
    await mkdir(join(runtime, 'sessions'), { recursive: true });
    await writeFile(join(runtime, 'auth.json'), 'refreshed-auth');
    await writeFile(join(runtime, 'sessions', 'thread.jsonl'), 'turn');

    await persistCodexState(environment);

    assert.equal(
      await readFile(join(mirror, 'auth.json'), 'utf8'),
      'refreshed-auth',
    );
    assert.equal(
      await readFile(join(mirror, 'sessions', 'thread.jsonl'), 'utf8'),
      'turn',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
