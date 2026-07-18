import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';

const sourceRoot = new URL('../src/', import.meta.url);
const forbiddenPatterns = [
  ['SUPABASE_SECRET_KEY', 'server-only Supabase key name'],
  ['service_role', 'legacy server-only Supabase role key'],
  ['auth.json', 'Codex credential cache'],
  ['@openai/codex-sdk', 'server-only Codex SDK'],
];
const failures = [];

for (const file of walk(sourceRoot)) {
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(extname(file.pathname)))
    continue;
  const contents = readFileSync(file, 'utf8');
  for (const [pattern, description] of forbiddenPatterns) {
    if (contents.includes(pattern)) {
      failures.push(
        `${relative(sourceRoot.pathname, file.pathname)} contains ${description} (${pattern})`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`Client/server boundary check failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Client/server boundary check passed.');
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(
      entry.name + (entry.isDirectory() ? '/' : ''),
      directory,
    );
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
