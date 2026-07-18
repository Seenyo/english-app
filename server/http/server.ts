import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {
  saveAnswerRequestSchema,
  startAssessmentRequestSchema,
} from '../../shared/assessment/contracts.ts';
import { createAssessmentThreadFactory } from '../assessment/generator.ts';
import { AssessmentRepositoryError } from '../assessment/repository.ts';
import { AssessmentService } from '../assessment/service.ts';
import type { AuthorizeRequest } from '../auth/authorize.ts';
import type { ServerConfig } from '../config.ts';
import { readJsonBody } from './body.ts';
import { HttpError } from './errors.ts';

export function createAiBridgeServer(
  config: ServerConfig,
  authorize: AuthorizeRequest,
) {
  const threadFactory = createAssessmentThreadFactory(config);
  const assessmentService = AssessmentService.create(config, threadFactory);

  return createServer(async (request, response) => {
    const origin = getAllowedOrigin(request, config.allowedOrigins);
    setCorsHeaders(response, origin);

    if (request.method === 'OPTIONS') {
      response.writeHead(origin ? 204 : 403).end();
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (!url.pathname.startsWith('/v1/')) {
        throw new HttpError(404, 'Route not found.', 'not_found');
      }
      if (!origin) {
        throw new HttpError(
          403,
          'Origin is not allowed.',
          'origin_not_allowed',
        );
      }

      const user = await authorize(request);
      if (
        request.method === 'GET' &&
        url.pathname === '/v1/assessments/current'
      ) {
        sendJson(response, 200, await assessmentService.getState(user));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/assessments') {
        const parsed = startAssessmentRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        sendJson(
          response,
          200,
          await assessmentService.start(user, parsed.data.profile),
        );
        return;
      }

      const answerRoute = url.pathname.match(
        /^\/v1\/assessments\/([0-9a-f-]{36})\/answers\/(q-[1-9][0-9]*)$/i,
      );
      if (request.method === 'PUT' && answerRoute) {
        const parsed = saveAnswerRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        await assessmentService.saveAnswer(
          user,
          answerRoute[1]!,
          answerRoute[2]!,
          parsed.data.answer,
        );
        response.writeHead(204).end();
        return;
      }

      const completeRoute = url.pathname.match(
        /^\/v1\/assessments\/([0-9a-f-]{36})\/rounds\/([1-3])\/complete$/i,
      );
      if (request.method === 'POST' && completeRoute) {
        sendJson(
          response,
          200,
          await assessmentService.completeRound(
            user,
            completeRoute[1]!,
            Number(completeRoute[2]) as 1 | 2 | 3,
          ),
        );
        return;
      }

      const retryRoute = url.pathname.match(
        /^\/v1\/assessments\/([0-9a-f-]{36})\/retry$/i,
      );
      if (request.method === 'POST' && retryRoute) {
        sendJson(
          response,
          200,
          await assessmentService.retry(user, retryRoute[1]!),
        );
        return;
      }

      throw new HttpError(404, 'Route not found.', 'not_found');
    } catch (error) {
      handleError(response, error);
    }
  });
}

function getAllowedOrigin(
  request: IncomingMessage,
  allowedOrigins: ReadonlySet<string>,
): string | null {
  const origin = request.headers.origin;
  return origin && allowedOrigins.has(origin) ? origin : null;
}

function setCorsHeaders(response: ServerResponse, origin: string | null) {
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function handleError(response: ServerResponse, error: unknown) {
  if (error instanceof HttpError) {
    sendJson(response, error.status, {
      error: { code: error.code, message: error.message, retryable: false },
    });
    return;
  }

  if (error instanceof AssessmentRepositoryError) {
    const conflictCodes = new Set([
      'assessment_not_answering',
      'round_incomplete',
      'answer_data_incomplete',
    ]);
    sendJson(response, conflictCodes.has(error.code ?? '') ? 409 : 500, {
      error: {
        code: error.code ?? 'database_error',
        message: error.message,
        retryable: true,
      },
    });
    return;
  }

  console.error(error);
  sendJson(response, 500, {
    error: {
      code: 'internal_error',
      message: 'The personal AI bridge could not complete the request.',
      retryable: true,
    },
  });
}

function invalidRequest(
  issues: readonly { path: PropertyKey[]; message: string }[],
): HttpError {
  return new HttpError(
    400,
    issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('; '),
    'invalid_request',
  );
}
