const inheritedEnvironmentKeys = [
  'PATH',
  'HOME',
  'CODEX_HOME',
  'TMPDIR',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TERM',
] as const;

/**
 * Codex needs its login location and basic process settings, but it must not
 * inherit Supabase credentials or any other server secret.
 */
export function createCodexEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const key of inheritedEnvironmentKeys) {
    const value = source[key];
    if (value) environment[key] = value;
  }
  return environment;
}
