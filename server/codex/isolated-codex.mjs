#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const codexScript = fileURLToPath(
  new URL('../../node_modules/@openai/codex/bin/codex.js', import.meta.url),
);
const codexArguments = process.argv.slice(2);
if (codexArguments[0] === 'exec') {
  codexArguments.splice(1, 0, '--ignore-user-config');
}
const child = spawn(
  process.execPath,
  [codexScript, ...codexArguments],
  { env: process.env, stdio: 'inherit' },
);

child.on('error', (error) => {
  console.error(`Could not start the isolated Codex runtime: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
