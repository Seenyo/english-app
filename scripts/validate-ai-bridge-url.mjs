import { pathToFileURL } from 'node:url';

export function validateAiBridgeUrl(value) {
  if (!value || value !== value.trim()) {
    throw new TypeError(
      'VITE_AI_BRIDGE_URL must be a non-empty URL without surrounding whitespace.',
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('VITE_AI_BRIDGE_URL must be a valid absolute URL.');
  }

  if (url.protocol !== 'https:' || !url.hostname) {
    throw new TypeError(
      'VITE_AI_BRIDGE_URL must use HTTPS and include a hostname.',
    );
  }
  if (url.username || url.password) {
    throw new TypeError('VITE_AI_BRIDGE_URL must not include credentials.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError(
      'VITE_AI_BRIDGE_URL must be an origin without a path, query, or fragment.',
    );
  }

  return url.origin;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validateAiBridgeUrl(process.env.VITE_AI_BRIDGE_URL);
    console.log('AI bridge URL is valid.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
