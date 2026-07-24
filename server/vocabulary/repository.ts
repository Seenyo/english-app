import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  startVocabularySessionResultSchema,
  vocabularySessionConflictCodes,
  vocabularyMemoryOverviewSchema,
  vocabularyMemorySessionSchema,
  vocabularyOverviewSchema,
  vocabularySessionSchema,
  type AnswerVocabularyMemoryRequest,
  type StartVocabularyMemoryRequest,
  type StartVocabularySessionRequest,
  type StartVocabularySessionResult,
  type VocabularyCard,
  type VocabularyKind,
  type VocabularyMemoryOverview,
  type VocabularyMemorySession,
  type VocabularyOperation,
  type VocabularyOverview,
  type VocabularyRating,
  type VocabularySession,
} from '../../shared/vocabulary/contracts.ts';
import type { ServerConfig } from '../config.ts';

type SessionRow = {
  id: string;
  user_id: string;
  kind: VocabularyKind;
  section: number | null;
  mode: StartVocabularySessionRequest['mode'];
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  item_ids: number[];
  current_index: number;
};

type ItemRow = {
  id: number;
  kind: VocabularyKind;
  source_order: number;
  term: string;
  meaning_ja: string;
  section: number | null;
  part: number | null;
};

type MemorySessionRow = {
  id: string;
  kind: VocabularyKind;
  section: number;
  status: 'active' | 'completed' | 'abandoned';
  initial_item_ids: number[];
  queue_ids: number[];
  current_index: number;
  remembered_item_ids: number[];
  again_item_ids: number[];
};

export class VocabularyRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'VocabularyRepositoryError';
  }
}

export class VocabularyRepository {
  private readonly database: SupabaseClient;

  constructor(config: Pick<ServerConfig, 'supabaseUrl' | 'supabaseSecretKey'>) {
    this.database = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getOverview(userId: string): Promise<VocabularyOverview> {
    const { data, error } = await this.database.rpc(
      'get_vocabulary_check_overview',
      { p_user_id: userId },
    );
    if (error)
      throw repositoryError('Could not load vocabulary progress.', error);
    return vocabularyOverviewSchema.parse(data);
  }

  async startSession(
    userId: string,
    request: StartVocabularySessionRequest,
  ): Promise<StartVocabularySessionResult> {
    if (request.mode === 'continue') {
      const resumable = await this.findResumableSession(
        userId,
        request.kind,
        request.section,
        request.mode,
      );
      if (resumable) {
        return startVocabularySessionResultSchema.parse({
          outcome: 'session',
          session: await this.loadSession(userId, resumable.id),
        });
      }
    }
    const { data, error } =
      request.section === undefined
        ? await this.database.rpc('start_vocabulary_check_session', {
            p_user_id: userId,
            p_kind: request.kind,
            p_mode: request.mode,
            p_skipped_sections: request.skippedSections,
            p_recheck_ratings: request.recheckRatings,
          })
        : await this.database.rpc('start_vocabulary_check_section_session', {
            p_user_id: userId,
            p_kind: request.kind,
            p_section: request.section,
            p_mode: request.mode,
            p_recheck_ratings: request.recheckRatings,
          });
    if (error)
      throw repositoryError('Could not start vocabulary check.', error);
    const sessionId = String(data);
    const row = await this.getSessionRow(userId, sessionId);
    if (!row) {
      throw new VocabularyRepositoryError(
        '作成した習熟度チェックを読み込めませんでした。',
        'vocabulary_session_not_found',
      );
    }
    return startVocabularySessionResultSchema.parse(
      row.status === 'completed'
        ? { outcome: 'completed' }
        : {
            outcome: 'session',
            session: await this.loadSession(userId, sessionId),
          },
    );
  }

  async getResumableSession(
    userId: string,
    kind: VocabularyKind,
  ): Promise<VocabularySession | null> {
    const row = await this.findResumableSession(userId, kind);
    return row ? this.loadSession(userId, row.id) : null;
  }

  async loadSession(
    userId: string,
    sessionId: string,
  ): Promise<VocabularySession> {
    const row = await this.getSessionRow(userId, sessionId);
    if (!row || row.status === 'completed' || row.status === 'abandoned') {
      throw new VocabularyRepositoryError(
        'この習熟度チェックは再開できません。',
        'vocabulary_session_not_found',
      );
    }
    const windowStart = Math.floor(row.current_index / 100) * 100;
    const windowIds = row.item_ids.slice(windowStart, windowStart + 100);
    const [items, classifications, sessionCounts] = await Promise.all([
      this.loadItems(windowIds),
      this.loadClassifications(userId, windowIds),
      this.loadSessionCounts(sessionId),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const ratingById = new Map(
      classifications.map((entry) => [entry.item_id, entry.rating]),
    );
    const cards = windowIds.map((id) => {
      const item = itemById.get(id);
      if (!item) {
        throw new VocabularyRepositoryError(
          `Vocabulary item ${id} is missing.`,
          'vocabulary_item_missing',
        );
      }
      return mapCard(item, ratingById.get(id) ?? null);
    });
    return vocabularySessionSchema.parse({
      id: row.id,
      kind: row.kind,
      section: row.section,
      mode: row.mode,
      status: row.status,
      position: row.current_index,
      total: row.item_ids.length,
      windowStart,
      cards,
      sessionCounts,
    });
  }

  async saveOperations(
    userId: string,
    sessionId: string,
    operations: VocabularyOperation[],
    position: number,
  ): Promise<void> {
    const { error } = await this.database.rpc('apply_vocabulary_operations', {
      p_user_id: userId,
      p_session_id: sessionId,
      p_operations: operations,
      p_position: position,
    });
    if (error)
      throw repositoryError('Could not save vocabulary progress.', error);
  }

  async finishSession(
    userId: string,
    sessionId: string,
    status: 'paused' | 'completed',
    position: number,
  ): Promise<void> {
    const { error } = await this.database.rpc(
      'finish_vocabulary_check_session',
      {
        p_user_id: userId,
        p_session_id: sessionId,
        p_status: status,
        p_position: position,
      },
    );
    if (error)
      throw repositoryError('Could not finish vocabulary check.', error);
  }

  async getMemoryOverview(userId: string): Promise<VocabularyMemoryOverview> {
    const { data, error } = await this.database.rpc(
      'get_vocabulary_memory_overview',
      { p_user_id: userId },
    );
    if (error)
      throw repositoryError('Could not load memorization overview.', error);
    return vocabularyMemoryOverviewSchema.parse(data);
  }

  async startMemorySession(
    userId: string,
    request: StartVocabularyMemoryRequest,
  ): Promise<VocabularyMemorySession> {
    const { data, error } = await this.database.rpc(
      'start_vocabulary_memory_section_session',
      {
        p_user_id: userId,
        p_kind: request.kind,
        p_section: request.section,
      },
    );
    if (error?.code === '23505') {
      const activeSessionId = await this.findActiveMemorySessionId(userId);
      if (activeSessionId) {
        return this.loadMemorySession(userId, activeSessionId);
      }
    }
    if (error)
      throw repositoryError('Could not start memorization session.', error);
    return this.loadMemorySession(userId, String(data));
  }

  async answerMemoryCard(
    userId: string,
    sessionId: string,
    input: AnswerVocabularyMemoryRequest,
  ): Promise<VocabularyMemorySession> {
    const { error } = await this.database.rpc('answer_vocabulary_memory_card', {
      p_user_id: userId,
      p_session_id: sessionId,
      p_operation_id: input.operationId,
      p_item_id: input.itemId,
      p_result: input.result,
      p_response_ms: input.responseMs,
    });
    if (error)
      throw repositoryError('Could not save memorization result.', error);
    return this.loadMemorySession(userId, sessionId);
  }

  async loadMemorySession(
    userId: string,
    sessionId: string,
  ): Promise<VocabularyMemorySession> {
    const { data, error } = await this.database
      .from('vocabulary_memory_sessions')
      .select(
        'id, kind, section, status, initial_item_ids, queue_ids, current_index, remembered_item_ids, again_item_ids',
      )
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not load memorization session.', error);
    const row = (data as MemorySessionRow | null) ?? null;
    if (!row || row.status === 'abandoned') {
      throw new VocabularyRepositoryError(
        'この暗記セッションは読み込めません。',
        'memory_session_not_found',
      );
    }

    const currentItemId =
      row.status === 'active' ? row.queue_ids[row.current_index] : undefined;
    const items =
      currentItemId === undefined ? [] : await this.loadItems([currentItemId]);
    const currentItem = items[0];
    if (currentItemId !== undefined && !currentItem) {
      throw new VocabularyRepositoryError(
        `Vocabulary item ${currentItemId} is missing.`,
        'vocabulary_item_missing',
      );
    }

    return vocabularyMemorySessionSchema.parse({
      id: row.id,
      kind: row.kind,
      section: row.section,
      status: row.status,
      position: row.current_index,
      total: row.queue_ids.length,
      initialCount: row.initial_item_ids.length,
      currentCard: currentItem ? mapMemoryCard(currentItem) : null,
      rememberedCount: row.remembered_item_ids.length,
      againCount: row.again_item_ids.length,
    });
  }

  private async findResumableSession(
    userId: string,
    kind: VocabularyKind,
    section?: number,
    mode?: StartVocabularySessionRequest['mode'],
  ) {
    const scope = buildResumableSessionScope(section, mode);
    let query = this.database
      .from('vocabulary_check_sessions')
      .select(
        'id, user_id, kind, section, mode, status, item_ids, current_index',
      )
      .eq('user_id', userId)
      .eq('kind', kind);
    if (scope.mode !== undefined) {
      query = query.eq('mode', scope.mode);
    }
    if (scope.section === null) {
      query = query.is('section', null);
    } else if (scope.section !== undefined) {
      query = query.eq('section', scope.section);
    }
    const { data, error } = await query
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not inspect vocabulary session.', error);
    return (data as SessionRow | null) ?? null;
  }

  private async findActiveMemorySessionId(userId: string) {
    const { data, error } = await this.database
      .from('vocabulary_memory_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not inspect memorization session.', error);
    return (data as { id: string } | null)?.id ?? null;
  }

  private async getSessionRow(userId: string, sessionId: string) {
    const { data, error } = await this.database
      .from('vocabulary_check_sessions')
      .select(
        'id, user_id, kind, section, mode, status, item_ids, current_index',
      )
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not load vocabulary session.', error);
    return (data as SessionRow | null) ?? null;
  }

  private async loadItems(ids: number[]): Promise<ItemRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.database
      .from('vocabulary_items')
      .select('id, kind, source_order, term, meaning_ja, section, part')
      .in('id', ids);
    if (error) throw repositoryError('Could not load vocabulary cards.', error);
    return (data as ItemRow[]) ?? [];
  }

  private async loadClassifications(userId: string, ids: number[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.database
      .from('vocabulary_classifications')
      .select('item_id, rating')
      .eq('user_id', userId)
      .in('item_id', ids);
    if (error) throw repositoryError('Could not load classifications.', error);
    return (data ?? []) as { item_id: number; rating: VocabularyRating }[];
  }

  private async loadSessionCounts(sessionId: string) {
    const ratings: VocabularyRating[] = [
      'mastered',
      'mostly_known',
      'mostly_unknown',
      'unknown',
    ];
    const results = await Promise.all(
      ratings.map((rating) =>
        this.database
          .from('vocabulary_classification_operations')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .eq('action', 'classify')
          .eq('rating', rating)
          .is('reverted_at', null),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error)
      throw repositoryError('Could not count session results.', failed.error);
    return {
      mastered: results[0]!.count ?? 0,
      mostlyKnown: results[1]!.count ?? 0,
      mostlyUnknown: results[2]!.count ?? 0,
      unknown: results[3]!.count ?? 0,
    };
  }
}

function mapCard(
  item: ItemRow,
  currentRating: VocabularyRating | null,
): VocabularyCard {
  return {
    id: item.id,
    kind: item.kind,
    sourceOrder: item.source_order,
    term: item.term,
    meaningJa: item.meaning_ja,
    section: item.section,
    part: item.part,
    currentRating,
  };
}

function mapMemoryCard(item: ItemRow) {
  return {
    id: item.id,
    kind: item.kind,
    sourceOrder: item.source_order,
    term: item.term,
    meaningJa: item.meaning_ja,
    section: item.section,
    part: item.part,
  };
}

function repositoryError(
  message: string,
  error: { code?: string; message?: string },
) {
  return new VocabularyRepositoryError(
    `${message} ${error.message ?? ''}`.trim(),
    resolveVocabularyRepositoryCode(error),
  );
}

const vocabularyRepositoryDomainCodes = [
  ...vocabularySessionConflictCodes,
  'vocabulary_queue_empty',
  'invalid_vocabulary_kind',
  'invalid_vocabulary_section',
  'invalid_vocabulary_mode',
  'idioms_have_no_sections',
  'invalid_vocabulary_operations',
  'invalid_vocabulary_position',
  'item_not_in_vocabulary_session',
  'invalid_vocabulary_rating',
  'invalid_vocabulary_action',
  'invalid_vocabulary_session_status',
  'vocabulary_memory_queue_empty',
  'memory_session_not_found',
  'memory_session_not_active',
  'memory_item_out_of_order',
  'memory_attempt_limit_reached',
  'invalid_memory_result',
  'invalid_memory_response_time',
] as const;

export function resolveVocabularyRepositoryCode(error: {
  code?: string;
  message?: string;
}): string | null {
  return (
    vocabularyRepositoryDomainCodes.find((code) =>
      error.message?.includes(code),
    ) ??
    error.code ??
    null
  );
}

export function buildResumableSessionScope(
  section?: number,
  mode?: StartVocabularySessionRequest['mode'],
) {
  return {
    ...(mode === undefined
      ? section === undefined
        ? {}
        : { section }
      : { section: section ?? null }),
    ...(mode === undefined ? {} : { mode }),
  };
}
