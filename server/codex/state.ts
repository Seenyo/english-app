import { chmod, cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const persistedEntries = [
  'auth.json',
  'sessions',
  'archived_sessions',
  'session_index.jsonl',
] as const;

let stateOperation: Promise<void> = Promise.resolve();

export function initializeCodexState(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return serialize(() => initialize(environment));
}

export function persistCodexState(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return serialize(() => persist(environment));
}

async function initialize(environment: NodeJS.ProcessEnv): Promise<void> {
  const locations = getLocations(environment);
  if (!locations) return;

  await mkdir(locations.runtime, { recursive: true, mode: 0o700 });
  for (const entry of persistedEntries) {
    await copyIfPresent(
      join(locations.mirror, entry),
      join(locations.runtime, entry),
    );
  }

  const runtimeAuth = join(locations.runtime, 'auth.json');
  if (
    !(await exists(runtimeAuth)) &&
    locations.authSeed &&
    (await exists(locations.authSeed))
  ) {
    await cp(locations.authSeed, runtimeAuth, { force: false });
  }
  if (await exists(runtimeAuth)) await chmod(runtimeAuth, 0o600);
}

async function persist(environment: NodeJS.ProcessEnv): Promise<void> {
  const locations = getLocations(environment);
  if (!locations) return;

  await mkdir(locations.mirror, { recursive: true });
  for (const entry of persistedEntries) {
    await copyIfPresent(
      join(locations.runtime, entry),
      join(locations.mirror, entry),
    );
  }
}

function getLocations(environment: NodeJS.ProcessEnv): {
  runtime: string;
  mirror: string;
  authSeed: string | null;
} | null {
  const mirrorValue = environment.CODEX_STATE_MIRROR_DIR?.trim();
  if (!mirrorValue) return null;

  const runtimeValue = environment.CODEX_HOME?.trim();
  if (!runtimeValue) {
    throw new Error(
      'CODEX_HOME is required when CODEX_STATE_MIRROR_DIR is configured.',
    );
  }

  const runtime = resolve(runtimeValue);
  const mirror = resolve(mirrorValue);
  if (runtime === mirror) {
    throw new Error(
      'CODEX_HOME and CODEX_STATE_MIRROR_DIR must be different directories.',
    );
  }

  const authSeedValue = environment.CODEX_AUTH_SEED_FILE?.trim();
  return {
    runtime,
    mirror,
    authSeed: authSeedValue ? resolve(authSeedValue) : null,
  };
}

async function copyIfPresent(source: string, destination: string) {
  if (!(await exists(source))) return;
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function serialize(operation: () => Promise<void>): Promise<void> {
  const result = stateOperation.then(operation, operation);
  stateOperation = result.catch(() => undefined);
  return result;
}
