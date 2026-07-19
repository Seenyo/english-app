import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  startVocabularySessionResultSchema,
  vocabularySessionConflictCodes,
  vocabularyOverviewSchema,
  vocabularySessionSchema,
  type StartVocabularySessionRequest,
  type StartVocabularySessionResult,
  type VocabularyCard,
  type VocabularyKind,
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
      const resumable = await this.findResumableSession(userId, request.kind);
      if (resumable) {
        return startVocabularySessionResultSchema.parse({
          outcome: 'session',
          session: await this.loadSession(userId, resumable.id),
        });
      }
    }
    const { data, error } = await this.database.rpc(
      'start_vocabulary_check_session',
      {
        p_user_id: userId,
        p_kind: request.kind,
        p_mode: request.mode,
        p_skipped_sections: request.skippedSections,
        p_recheck_ratings: request.recheckRatings,
      },
    );
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

  private async findResumableSession(userId: string, kind: VocabularyKind) {
    const { data, error } = await this.database
      .from('vocabulary_check_sessions')
      .select('id, user_id, kind, mode, status, item_ids, current_index')
      .eq('user_id', userId)
      .eq('kind', kind)
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw repositoryError('Could not inspect vocabulary session.', error);
    return (data as SessionRow | null) ?? null;
  }

  private async getSessionRow(userId: string, sessionId: string) {
    const { data, error } = await this.database
      .from('vocabulary_check_sessions')
      .select('id, user_id, kind, mode, status, item_ids, current_index')
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
  'invalid_vocabulary_mode',
  'idioms_have_no_sections',
  'invalid_vocabulary_operations',
  'invalid_vocabulary_position',
  'item_not_in_vocabulary_session',
  'invalid_vocabulary_rating',
  'invalid_vocabulary_action',
  'invalid_vocabulary_session_status',
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
