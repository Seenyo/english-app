import {
  assessmentSnapshotSchema,
  type AnswerSelection,
  type AssessmentSnapshot,
  type LearnerProfile,
} from '@shared/assessment/contracts';
import { getAiBridgeUrl } from '@/config/env';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
};

export class AssessmentApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AssessmentApiError';
  }
}

export function getAssessmentSnapshot(
  token: string,
): Promise<AssessmentSnapshot> {
  return requestSnapshot(token, '/v1/assessments/current');
}

export function startAssessment(
  token: string,
  profile: LearnerProfile,
): Promise<AssessmentSnapshot> {
  return requestSnapshot(token, '/v1/assessments', {
    method: 'POST',
    body: { profile },
  });
}

export async function saveAssessmentAnswer(
  token: string,
  attemptId: string,
  round: 1 | 2 | 3,
  questionId: string,
  answer: AnswerSelection,
): Promise<void> {
  await request(
    token,
    `/v1/assessments/${encodeURIComponent(attemptId)}/rounds/${round}/answers/${encodeURIComponent(questionId)}`,
    { method: 'PUT', body: { answer } },
  );
}

export function completeAssessmentRound(
  token: string,
  attemptId: string,
  round: 1 | 2 | 3,
): Promise<AssessmentSnapshot> {
  return requestSnapshot(
    token,
    `/v1/assessments/${encodeURIComponent(attemptId)}/rounds/${round}/complete`,
    { method: 'POST' },
  );
}

export function retryAssessmentGeneration(
  token: string,
  attemptId: string,
): Promise<AssessmentSnapshot> {
  return requestSnapshot(
    token,
    `/v1/assessments/${encodeURIComponent(attemptId)}/retry`,
    { method: 'POST' },
  );
}

export function abandonDryRun(token: string): Promise<AssessmentSnapshot> {
  return requestSnapshot(token, '/v1/assessments/abandon', { method: 'POST' });
}

async function requestSnapshot(
  token: string,
  path: string,
  options?: RequestOptions,
): Promise<AssessmentSnapshot> {
  const response = await request(token, path, options);
  return assessmentSnapshotSchema.parse(await response.json());
}

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
    throw new AssessmentApiError(
      '個人用AIブリッジに接続できません。しばらく待ってから再度お試しください。',
      'bridge_unreachable',
      true,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryable?: boolean };
    } | null;
    throw new AssessmentApiError(
      body?.error?.message ?? 'レベル測定を続けられませんでした。',
      body?.error?.code ?? 'unknown_error',
      body?.error?.retryable ?? response.status >= 500,
    );
  }
  return response;
}
