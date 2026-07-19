import {
  assessmentReportSchema,
  learnerPersonaSchema,
  learningOverviewSchema,
  reportListSchema,
  type AssessmentReport,
  type LearnerPersona,
  type LearningOverview,
  type PersonaUserAuthored,
} from '@shared/learning/contracts';
import { aiBridgeUrl } from '@/config/env';

export function getLearningOverview(token: string): Promise<LearningOverview> {
  return requestJson(
    token,
    '/v1/learning/overview',
    learningOverviewSchema.parse,
  );
}

export function getPersona(token: string): Promise<LearnerPersona | null> {
  return requestJson(token, '/v1/persona', (value) => {
    const body = value as { persona?: unknown };
    return body.persona ? learnerPersonaSchema.parse(body.persona) : null;
  });
}

export function updatePersona(
  token: string,
  expectedVersion: number,
  userAuthored: PersonaUserAuthored,
): Promise<LearnerPersona> {
  return requestJson(
    token,
    '/v1/persona',
    (value) =>
      learnerPersonaSchema.parse((value as { persona: unknown }).persona),
    {
      method: 'PUT',
      body: { expectedVersion, userAuthored },
    },
  );
}

export function listAssessmentReports(token: string) {
  return requestJson(token, '/v1/assessment-reports', reportListSchema.parse);
}

export function getAssessmentReport(
  token: string,
  reportId: string,
): Promise<AssessmentReport> {
  return requestJson(
    token,
    `/v1/assessment-reports/${encodeURIComponent(reportId)}`,
    assessmentReportSchema.parse,
  );
}

export async function retryLatestAnalysis(token: string): Promise<void> {
  await request(token, '/v1/assessment-reports/retry-latest', {
    method: 'POST',
  });
}

async function requestJson<T>(
  token: string,
  path: string,
  parse: (value: unknown) => T,
  options?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown },
): Promise<T> {
  const response = await request(token, path, options);
  return parse(await response.json());
}

async function request(
  token: string,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
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
      '個人用AIブリッジに接続できません。MacでAIサーバーが起動しているか確認してください。',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? `Request failed (${response.status}).`,
    );
  }
  return response;
}
