import {
  startVocabularySessionResultSchema,
  vocabularyMemoryOverviewSchema,
  vocabularyMemorySessionSchema,
  vocabularyOverviewSchema,
  vocabularySessionSchema,
  type AnswerVocabularyMemoryRequest,
  type StartVocabularySessionRequest,
  type StartVocabularyMemoryRequest,
  type VocabularyKind,
  type VocabularyMemoryOverview,
  type VocabularyMemorySession,
  type VocabularyOperation,
  type VocabularyOverview,
  type StartVocabularySessionResult,
  type VocabularySession,
} from '@shared/vocabulary/contracts';
import { getAiBridgeUrl } from '@/config/env';
import { VocabularyApiError } from './errors';

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
): Promise<StartVocabularySessionResult> {
  return requestJson(
    token,
    '/v1/vocabulary/sessions',
    startVocabularySessionResultSchema.parse,
    { method: 'POST', body: request },
  );
}

export function getVocabularyMemoryOverview(
  token: string,
): Promise<VocabularyMemoryOverview> {
  return requestJson(
    token,
    '/v1/vocabulary/memory/overview',
    vocabularyMemoryOverviewSchema.parse,
  );
}

export function startVocabularyMemorySession(
  token: string,
  request: StartVocabularyMemoryRequest,
): Promise<VocabularyMemorySession> {
  return requestJson(
    token,
    '/v1/vocabulary/memory/sessions',
    vocabularyMemorySessionSchema.parse,
    {
      method: 'POST',
      body: request,
      networkErrorMessage:
        '暗記セッションを準備できませんでした。接続を確認して、もう一度お試しください。',
    },
  );
}

export function answerVocabularyMemoryCard(
  token: string,
  sessionId: string,
  input: AnswerVocabularyMemoryRequest,
): Promise<VocabularyMemorySession> {
  return requestJson(
    token,
    `/v1/vocabulary/memory/sessions/${encodeURIComponent(sessionId)}/answers`,
    vocabularyMemorySessionSchema.parse,
    {
      method: 'POST',
      body: input,
      networkErrorMessage:
        '暗記結果を保存できませんでした。接続を確認して、もう一度選んでください。',
    },
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
  networkErrorMessage?: string;
};

async function request(
  token: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${getAiBridgeUrl()}${path}`, {
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
    throw new VocabularyApiError(
      options.networkErrorMessage ??
        '学習サーバーに接続できません。操作は端末内に保持されています。',
      'network_error',
      true,
      null,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryable?: boolean };
    } | null;
    throw new VocabularyApiError(
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.code ?? 'request_failed',
      body?.error?.retryable ?? response.status >= 500,
      response.status,
    );
  }
  return response;
}
