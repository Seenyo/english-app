import type { IncomingMessage } from 'node:http';
import { HttpError } from './errors.ts';

const maximumBodyBytes = 128 * 1024;

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > maximumBodyBytes) {
      throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(
      400,
      'Request body must be valid JSON.',
      'invalid_json',
    );
  }
}
