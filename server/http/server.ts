import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {
  saveAnswerRequestSchema,
  startAssessmentRequestSchema,
} from '../../shared/assessment/contracts.ts';
import { updatePersonaRequestSchema } from '../../shared/learning/contracts.ts';
import {
  answerVocabularyMemoryRequestSchema,
  finishVocabularySessionRequestSchema,
  isVocabularySessionConflictCode,
  saveVocabularyOperationsRequestSchema,
  startVocabularySessionRequestSchema,
  startVocabularyMemoryRequestSchema,
  vocabularyKindSchema,
} from '../../shared/vocabulary/contracts.ts';
import { AssessmentRepositoryError } from '../assessment/repository.ts';
import { createAssessmentRuntime } from '../assessment/runtime.ts';
import { createAssessmentThreadFactory } from '../assessment/generator.ts';
import type { AuthorizeRequest } from '../auth/authorize.ts';
import type { ServerConfig } from '../config.ts';
import { LearningRepositoryError } from '../learning/repository.ts';
import { LearningService } from '../learning/service.ts';
import { VocabularyRepositoryError } from '../vocabulary/repository.ts';
import { VocabularyService } from '../vocabulary/service.ts';
import { readJsonBody } from './body.ts';
import { HttpError } from './errors.ts';

export function createAiBridgeServer(
  config: ServerConfig,
  authorize: AuthorizeRequest,
) {
  const threadFactory =
    config.assessmentMode === 'live'
      ? createAssessmentThreadFactory(config)
      : null;
  const learningService = LearningService.create(config, threadFactory);
  const vocabularyService = VocabularyService.create(config);
  const assessmentRuntime = createAssessmentRuntime(
    config,
    threadFactory,
    learningService,
  );
  learningService.kick();

  return createServer(async (request, response) => {
    const origin = getAllowedOrigin(
      request,
      config.allowedOrigins,
      config.assessmentMode,
    );
    setCorsHeaders(response, origin);

    if (request.method === 'OPTIONS') {
      response.writeHead(origin ? 204 : 403).end();
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          assessmentMode: config.assessmentMode,
        });
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
        url.pathname === '/v1/vocabulary/overview'
      ) {
        sendJson(response, 200, await vocabularyService.getOverview(user));
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/v1/vocabulary/memory/overview'
      ) {
        sendJson(
          response,
          200,
          await vocabularyService.getMemoryOverview(user),
        );
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/vocabulary/memory/sessions'
      ) {
        const parsed = startVocabularyMemoryRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        sendJson(
          response,
          200,
          await vocabularyService.startMemorySession(user, parsed.data),
        );
        return;
      }

      const vocabularyMemoryAnswerRoute = url.pathname.match(
        /^\/v1\/vocabulary\/memory\/sessions\/([0-9a-f-]{36})\/answers$/i,
      );
      if (request.method === 'POST' && vocabularyMemoryAnswerRoute) {
        const parsed = answerVocabularyMemoryRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        sendJson(
          response,
          200,
          await vocabularyService.answerMemoryCard(
            user,
            vocabularyMemoryAnswerRoute[1]!,
            parsed.data,
          ),
        );
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/vocabulary/sessions'
      ) {
        const parsed = startVocabularySessionRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        sendJson(
          response,
          200,
          await vocabularyService.startSession(user, parsed.data),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/v1/vocabulary/sessions/current'
      ) {
        const kind = vocabularyKindSchema.safeParse(
          url.searchParams.get('kind'),
        );
        if (!kind.success) throw invalidRequest(kind.error.issues);
        sendJson(
          response,
          200,
          await vocabularyService.getResumableSession(user, kind.data),
        );
        return;
      }

      const vocabularySessionRoute = url.pathname.match(
        /^\/v1\/vocabulary\/sessions\/([0-9a-f-]{36})$/i,
      );
      if (request.method === 'GET' && vocabularySessionRoute) {
        sendJson(
          response,
          200,
          await vocabularyService.loadSession(user, vocabularySessionRoute[1]!),
        );
        return;
      }

      const vocabularyOperationsRoute = url.pathname.match(
        /^\/v1\/vocabulary\/sessions\/([0-9a-f-]{36})\/operations$/i,
      );
      if (request.method === 'PUT' && vocabularyOperationsRoute) {
        const parsed = saveVocabularyOperationsRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        await vocabularyService.saveOperations(
          user,
          vocabularyOperationsRoute[1]!,
          parsed.data.operations,
          parsed.data.position,
        );
        response.writeHead(204).end();
        return;
      }

      const vocabularyFinishRoute = url.pathname.match(
        /^\/v1\/vocabulary\/sessions\/([0-9a-f-]{36})\/finish$/i,
      );
      if (request.method === 'POST' && vocabularyFinishRoute) {
        const parsed = finishVocabularySessionRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        await vocabularyService.finishSession(
          user,
          vocabularyFinishRoute[1]!,
          parsed.data.status,
          parsed.data.position,
        );
        response.writeHead(204).end();
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/v1/learning/overview'
      ) {
        sendJson(response, 200, await learningService.getOverview(user));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/persona') {
        sendJson(response, 200, {
          persona: await learningService.getPersona(user),
        });
        return;
      }

      if (request.method === 'PUT' && url.pathname === '/v1/persona') {
        const parsed = updatePersonaRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        sendJson(response, 200, {
          persona: await learningService.updatePersona(
            user,
            parsed.data.expectedVersion,
            parsed.data.userAuthored,
          ),
        });
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/v1/assessment-reports'
      ) {
        sendJson(response, 200, await learningService.listReports(user));
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/assessment-reports/retry-latest'
      ) {
        await learningService.retryLatestAnalysis(user);
        response.writeHead(204).end();
        return;
      }

      const reportRoute = url.pathname.match(
        /^\/v1\/assessment-reports\/([0-9a-f-]{36})$/i,
      );
      if (request.method === 'GET' && reportRoute) {
        sendJson(
          response,
          200,
          await learningService.getReport(user, reportRoute[1]!),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/v1/assessments/current'
      ) {
        sendJson(response, 200, await assessmentRuntime.getSnapshot(user));
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
          await assessmentRuntime.start(user, parsed.data.profile),
        );
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/v1/assessments/abandon'
      ) {
        sendJson(response, 200, await assessmentRuntime.abandon(user));
        return;
      }

      const answerRoute = url.pathname.match(
        /^\/v1\/assessments\/([0-9a-f-]{36})\/rounds\/([1-3])\/answers\/(q-[1-9][0-9]*)$/i,
      );
      if (request.method === 'PUT' && answerRoute) {
        const parsed = saveAnswerRequestSchema.safeParse(
          await readJsonBody(request),
        );
        if (!parsed.success) throw invalidRequest(parsed.error.issues);
        await assessmentRuntime.saveAnswer(
          user,
          answerRoute[1]!,
          Number(answerRoute[2]) as 1 | 2 | 3,
          answerRoute[3]!,
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
          await assessmentRuntime.completeRound(
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
          await assessmentRuntime.retry(user, retryRoute[1]!),
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
  assessmentMode: ServerConfig['assessmentMode'],
): string | null {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return null;
  if (assessmentMode === 'live') return origin;
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' ? origin : null;
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
      'round_mismatch',
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

  if (error instanceof LearningRepositoryError) {
    const status =
      error.code === 'persona_version_conflict'
        ? 409
        : error.code === 'dry_run_unavailable' ||
            error.code === 'persona_not_found' ||
            error.code === 'assessment_not_found'
          ? 404
          : 500;
    sendJson(response, status, {
      error: {
        code: error.code ?? 'learning_data_error',
        message: error.message,
        retryable: true,
      },
    });
    return;
  }

  if (error instanceof VocabularyRepositoryError) {
    const invalidCodes = new Set([
      'invalid_vocabulary_kind',
      'invalid_vocabulary_mode',
      'idioms_have_no_sections',
      'invalid_vocabulary_operations',
      'invalid_vocabulary_position',
      'item_not_in_vocabulary_session',
      'invalid_vocabulary_rating',
      'invalid_vocabulary_action',
      'invalid_vocabulary_session_status',
      'invalid_memory_result',
      'invalid_memory_response_time',
    ]);
    const memoryConflictCodes = new Set([
      'memory_session_not_active',
      'memory_item_out_of_order',
      'memory_attempt_limit_reached',
    ]);
    const status =
      error.code === 'vocabulary_session_not_found' ||
      error.code === 'vocabulary_queue_empty' ||
      error.code === 'memory_session_not_found' ||
      error.code === 'vocabulary_memory_queue_empty'
        ? 404
        : isVocabularySessionConflictCode(error.code) ||
            memoryConflictCodes.has(error.code ?? '')
          ? 409
          : invalidCodes.has(error.code ?? '')
            ? 400
            : 500;
    sendJson(response, status, {
      error: {
        code: error.code ?? 'vocabulary_data_error',
        message: error.message,
        retryable: status >= 500,
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
