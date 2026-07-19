import {
  vocabularyOverviewSchema,
  vocabularySessionSchema,
  type StartVocabularySessionRequest,
  type VocabularyKind,
  type VocabularyOperation,
  type VocabularyOverview,
  type VocabularySession,
} from '@shared/vocabulary/contracts';
import { aiBridgeUrl } from '@/config/env';

export function getVocabularyOverview(
  token: string,
): Promise<VocabularyOverview> {
  return requestJson(
    token,
    '/v1/vocabulary/overview',
    vocabularyOverviewSchema.parse,
  );
}

export function startVocabularySession(
  token: string,
  request: StartVocabularySessionRequest,
): Promise<VocabularySession> {
  return requestJson(
    token,
    '/v1/vocabulary/sessions',
    vocabularySessionSchema.parse,
    { method: 'POST', body: request },
  );
}

export function getResumableVocabularySession(
  token: string,
  kind: VocabularyKind,
): Promise<VocabularySession | null> {
  return requestJson(
    token,
    `/v1/vocabulary/sessions/current?kind=${encodeURIComponent(kind)}`,
    (value) => (value === null ? null : vocabularySessionSchema.parse(value)),
  );
}

export function getVocabularySession(
  token: string,
  sessionId: string,
): Promise<VocabularySession> {
  return requestJson(
    token,
    `/v1/vocabulary/sessions/${encodeURIComponent(sessionId)}`,
    vocabularySessionSchema.parse,
  );
}

export async function saveVocabularyOperations(
  token: string,
  sessionId: string,
  operations: VocabularyOperation[],
  position: number,
): Promise<void> {
  await request(
    token,
    `/v1/vocabulary/sessions/${encodeURIComponent(sessionId)}/operations`,
    { method: 'PUT', body: { operations, position } },
  );
}

export async function finishVocabularySession(
  token: string,
  sessionId: string,
  status: 'paused' | 'completed',
  position: number,
): Promise<void> {
  await request(
    token,
    `/v1/vocabulary/sessions/${encodeURIComponent(sessionId)}/finish`,
    { method: 'POST', body: { status, position } },
  );
}

async function requestJson<T>(
  token: string,
  path: string,
  parse: (value: unknown) => T,
  options?: RequestOptions,
): Promise<T> {
  const response = await request(token, path, options);
  return parse(await response.json());
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
};

async function request(
  token: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${aiBridgeUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new Error(
      '学習サーバーに接続できません。操作は端末内に保持されています。',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const error = new Error(
      body?.error?.message ?? `Request failed (${response.status}).`,
    );
    Object.assign(error, { code: body?.error?.code });
    throw error;
  }
  return response;
}
