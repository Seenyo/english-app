import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import {
  vocabularySessionSchema,
  type VocabularyCard,
  type VocabularyKind,
  type VocabularyOperation,
  type VocabularyRating,
  type VocabularySession,
} from '@shared/vocabulary/contracts';
import { Spinner } from '@/components/ui/Spinner';
import { NavigationIcon } from '@/components/ui/NavigationIcon';
import { useAuth } from '@/features/auth';
import {
  cacheVocabularySession,
  readCachedVocabularySession,
  readQueuedVocabularyOperations,
  removeCachedVocabularySession,
  removeQueuedVocabularyOperations,
  requiresVocabularySessionRecovery,
  queueVocabularyProgress,
  useVocabulary,
} from '@/features/vocabulary';
import { SwipeVocabularyCard } from '@/features/vocabulary/components/SwipeVocabularyCard';

type LastClassification = {
  operationId: string;
  card: VocabularyCard;
  rating: VocabularyRating;
};

type FlushResult = 'synced' | 'offline' | 'recovery';
type SyncState = 'saved' | 'queued' | 'saving' | 'offline' | 'recovery';
const recoveryMessage =
  '進捗をそのまま同期できませんでした。端末内の未同期分を確認して、サーバーの進捗から再読み込みしてください。';

export function VocabularyCheckSession() {
  const { scope } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    overview,
    refresh,
    loadSession,
    resumeSession,
    saveOperations,
    finishSession,
  } = useVocabulary();
  const kind: VocabularyKind | null =
    scope === 'words' ? 'word' : scope === 'idioms' ? 'idiom' : null;
  const initialSession = vocabularySessionSchema.safeParse(
    (location.state as { session?: unknown } | null)?.session,
  );
  const initialSessionRef = useRef<VocabularySession | null>(
    initialSession.success ? initialSession.data : null,
  );
  const [session, setSession] = useState<VocabularySession | null>(
    initialSessionRef.current,
  );
  const [isLoading, setIsLoading] = useState(!initialSession.success);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('saved');
  const [lastClassification, setLastClassification] =
    useState<LastClassification | null>(null);
  const flushPromise = useRef<Promise<FlushResult> | null>(null);
  const flushTimer = useRef<number | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    document.documentElement.classList.add('vocabulary-swipe-mode');
    return () => {
      document.documentElement.classList.remove('vocabulary-swipe-mode');
    };
  }, []);

  const flush = useCallback(async (): Promise<FlushResult> => {
    if (!user || !sessionRef.current) return 'synced';
    if (flushPromise.current) return flushPromise.current;
    const currentSession = sessionRef.current;
    flushPromise.current = (async () => {
      try {
        for (;;) {
          const pending = await readQueuedVocabularyOperations(
            user.id,
            currentSession.id,
          );
          if (pending.length === 0) break;
          setSyncState('saving');
          const batch = pending.slice(0, 100);
          await saveOperations(
            currentSession.id,
            batch.map((entry) => entry.operation),
            batch.at(-1)!.position,
          );
          await removeQueuedVocabularyOperations(
            batch.map((entry) => entry.id),
          );
        }
        setSyncState('saved');
        return 'synced';
      } catch (requestError) {
        if (requiresVocabularySessionRecovery(requestError)) {
          setSyncState('recovery');
          setError(recoveryMessage);
          return 'recovery';
        }
        setSyncState('offline');
        return 'offline';
      }
    })().finally(() => {
      flushPromise.current = null;
    });
    return flushPromise.current;
  }, [saveOperations, user]);

  useEffect(() => {
    if (!kind || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [remoteResult, cached] = await Promise.all([
          resumeSession(kind).then(
            (value) => ({ online: true as const, value }),
            () => ({ online: false as const, value: null }),
          ),
          readCachedVocabularySession(user.id, kind),
        ]);
        const remote = remoteResult.value;
        const initial = initialSessionRef.current;
        if (remoteResult.online && !remote) {
          await removeCachedVocabularySession(user.id, kind);
          if (!cancelled) {
            setSession(null);
            setError('再開できるチェックがありません。');
          }
          return;
        }
        const currentId = remote?.id ?? cached?.id ?? initial?.id;
        const matchingCached =
          cached && cached.id === currentId ? cached : null;
        const pending = currentId
          ? await readQueuedVocabularyOperations(user.id, currentId)
          : [];
        const candidates = [
          remote,
          matchingCached,
          initial &&
          initial.id === currentId &&
          (!remoteResult.online || initial.id === remote?.id)
            ? initial
            : null,
        ].filter((candidate): candidate is VocabularySession =>
          Boolean(candidate),
        );
        const selected =
          pending.length > 0 && matchingCached
            ? matchingCached
            : (candidates.sort(
                (left, right) => right.position - left.position,
              )[0] ?? null);
        if (!cancelled) {
          setSession(selected);
          setError(selected ? null : '再開できるチェックがありません。');
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'チェックを読み込めませんでした。',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, resumeSession, user]);

  useEffect(() => {
    if (!session || !user) return;
    void cacheVocabularySession(user.id, session);
  }, [session, user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [flush]);

  useEffect(
    () => () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    },
    [],
  );

  const currentCard = useMemo(() => {
    if (!session) return null;
    return session.cards[session.position - session.windowStart] ?? null;
  }, [session]);
  const atCheckpoint = Boolean(
    session && session.position >= session.windowStart + session.cards.length,
  );
  const atEnd = Boolean(session && session.position >= session.total);
  const kindOverview = kind === 'word' ? overview?.words : overview?.idioms;
  const newlyClassified = useMemo(() => {
    if (!session) return 0;
    return session.cards
      .slice(0, Math.max(0, session.position - session.windowStart))
      .filter((card) => card.currentRating === null).length;
  }, [session]);
  const overallClassified = Math.min(
    kindOverview?.total ?? 0,
    (kindOverview?.classified ?? 0) + newlyClassified,
  );

  const scheduleFlush = useCallback(async () => {
    if (!user || !sessionRef.current) return;
    const pending = await readQueuedVocabularyOperations(
      user.id,
      sessionRef.current.id,
    );
    if (pending.length >= 10) {
      void flush();
      return;
    }
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => void flush(), 2_000);
  }, [flush, user]);

  const activeSessionId = session?.id ?? null;

  useEffect(() => {
    if (!user || !activeSessionId) return;
    let cancelled = false;
    void (async () => {
      const pending = await readQueuedVocabularyOperations(
        user.id,
        activeSessionId,
      );
      if (cancelled || pending.length === 0) return;
      setSyncState('queued');
      const flushResult = await flush();
      if (flushResult !== 'synced' || cancelled) return;
      await refresh();
      const recovered = await loadSession(activeSessionId).catch(() => null);
      if (recovered && !cancelled) setSession(recovered);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, flush, loadSession, refresh, user]);

  const classify = useCallback(
    (rating: VocabularyRating) => {
      const current = sessionRef.current;
      const card =
        current?.cards[current.position - current.windowStart] ?? null;
      if (!current || !card || !user) return;
      const operation: VocabularyOperation = {
        id: crypto.randomUUID(),
        action: 'classify',
        itemId: card.id,
        rating,
      };
      const nextPosition = current.position + 1;
      const nextSession = {
        ...current,
        position: nextPosition,
        sessionCounts: adjustCount(current.sessionCounts, rating, 1),
      };
      setLastClassification({
        operationId: operation.id,
        card,
        rating,
      });
      sessionRef.current = nextSession;
      setSession(nextSession);
      setSyncState('queued');
      void queueVocabularyProgress(
        {
          id: operation.id,
          userId: user.id,
          sessionId: current.id,
          operation,
          position: nextPosition,
          queuedAt: Date.now(),
        },
        nextSession,
      ).then(scheduleFlush);
    },
    [scheduleFlush, user],
  );

  const undo = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !lastClassification || !user || current.position <= 0)
      return;
    const operation: VocabularyOperation = {
      id: crypto.randomUUID(),
      action: 'undo',
      itemId: lastClassification.card.id,
      targetOperationId: lastClassification.operationId,
    };
    const nextPosition = current.position - 1;
    const cardIndex = nextPosition - current.windowStart;
    const cards = current.cards.map((card, index) =>
      index === cardIndex
        ? { ...card, currentRating: lastClassification.card.currentRating }
        : card,
    );
    const nextSession = {
      ...current,
      cards,
      position: nextPosition,
      sessionCounts: adjustCount(
        current.sessionCounts,
        lastClassification.rating,
        -1,
      ),
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    setLastClassification(null);
    setSyncState('queued');
    void queueVocabularyProgress(
      {
        id: operation.id,
        userId: user.id,
        sessionId: current.id,
        operation,
        position: nextPosition,
        queuedAt: Date.now(),
      },
      nextSession,
    ).then(scheduleFlush);
  }, [lastClassification, scheduleFlush, user]);

  async function continueAfterCheckpoint() {
    if (!session) return;
    setIsLoading(true);
    const flushResult = await flush();
    if (flushResult !== 'synced') {
      if (flushResult === 'offline') {
        setError('次の100件を開くには、一度オンラインに戻る必要があります。');
      }
      setIsLoading(false);
      return;
    }
    try {
      await refresh();
      const next = await loadSession(session.id);
      setSession(next);
      setLastClassification(null);
      setError(null);
    } catch (requestError) {
      if (requiresVocabularySessionRecovery(requestError)) {
        setSyncState('recovery');
        setError(recoveryMessage);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : '次のカードを読み込めませんでした。',
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  function leaveSession() {
    const current = sessionRef.current;
    navigate('/', { replace: true });
    if (!current || !user) return;
    void (async () => {
      const flushResult = await flush();
      if (flushResult === 'synced') {
        await finishSession(current.id, 'paused', current.position).catch(
          () => undefined,
        );
      }
    })();
  }

  async function completeAndLeave() {
    const current = sessionRef.current;
    if (!current || !user) return;
    setIsLoading(true);
    const flushResult = await flush();
    const completed = current.position >= current.total;
    if (flushResult !== 'synced') {
      if (flushResult === 'offline') {
        setError(
          '進捗をサーバーへ保存できませんでした。接続を確認して、もう一度お試しください。',
        );
      }
      setIsLoading(false);
      return;
    }
    try {
      await finishSession(
        current.id,
        completed ? 'completed' : 'paused',
        current.position,
      );
      if (completed) {
        await removeCachedVocabularySession(user.id, current.kind);
      }
      navigate('/', { replace: true });
    } catch (requestError) {
      if (requiresVocabularySessionRecovery(requestError)) {
        setSyncState('recovery');
        setError(recoveryMessage);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'チェックを終了できませんでした。もう一度お試しください。',
        );
      }
      setIsLoading(false);
    }
  }

  async function recoverSession() {
    const current = sessionRef.current;
    if (!current || !user || !kind) return;
    setIsLoading(true);
    try {
      const remote = await resumeSession(kind);
      const pending = await readQueuedVocabularyOperations(user.id, current.id);
      await removeQueuedVocabularyOperations(pending.map((entry) => entry.id));
      if (!remote) {
        await removeCachedVocabularySession(user.id, kind);
        navigate('/study/vocabulary', { replace: true });
        return;
      }
      await cacheVocabularySession(user.id, remote);
      setSession(remote);
      setLastClassification(null);
      setSyncState('saved');
      setError(null);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'サーバーの進捗を読み込めませんでした。',
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (!kind) return <Navigate replace to="/study/vocabulary" />;
  if (isLoading && !session) {
    return (
      <div className="swipe-session-loading">
        <Spinner />
        <p>カードを準備しています…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="swipe-session-loading">
        <p>{error ?? '再開できるチェックがありません。'}</p>
        <Link to="/study/vocabulary">単語・熟語帳へ戻る</Link>
      </div>
    );
  }

  return (
    <div className="swipe-session-page">
      <header className="swipe-session-toolbar">
        <button
          aria-label="ホームへ戻る"
          onClick={leaveSession}
          title="ホームへ戻る"
          type="button"
        >
          <NavigationIcon name="home" />
        </button>
        <div className="swipe-session-progress-copy">
          <strong>
            {session.kind === 'word' ? '単語' : '熟語'}・判定済み{' '}
            {overallClassified.toLocaleString()}
          </strong>
          <span>
            {syncState === 'saved'
              ? '保存済み'
              : syncState === 'queued'
                ? '端末に保存済み'
                : syncState === 'saving'
                  ? '保存中…'
                  : syncState === 'offline'
                    ? 'オフライン保存済み'
                    : '同期の確認が必要'}
          </span>
        </div>
        <button
          aria-label="最後の分類を元に戻す"
          disabled={!lastClassification || syncState === 'recovery'}
          onClick={undo}
          title="最後の分類を元に戻す"
          type="button"
        >
          ←
        </button>
      </header>

      <div className="swipe-overall-progress" aria-hidden="true">
        <span
          style={{
            width: `${kindOverview?.total ? (overallClassified / kindOverview.total) * 100 : 0}%`,
          }}
        />
      </div>

      {error && (
        <div className="swipe-session-error">
          <span>{error}</span>
          {syncState === 'recovery' && (
            <button
              disabled={isLoading}
              onClick={() => void recoverSession()}
              type="button"
            >
              端末の未同期分を破棄して再読み込み
            </button>
          )}
        </div>
      )}
      {atCheckpoint ? (
        <CheckpointSummary
          atEnd={atEnd}
          isLoading={isLoading}
          onComplete={() => void completeAndLeave()}
          onContinue={() => void continueAfterCheckpoint()}
          session={session}
        />
      ) : currentCard ? (
        <main className="swipe-session-main">
          <div className="swipe-item-meta">
            <span>
              No. {currentCard.sourceOrder.toLocaleString()} /{' '}
              {currentCard.kind === 'word' ? '1,900' : '1,684'}
            </span>
            {currentCard.section && (
              <span>
                Section {currentCard.section}・
                {partShortLabel(currentCard.part)}
              </span>
            )}
          </div>
          <SwipeVocabularyCard
            card={currentCard}
            disabled={isLoading || syncState === 'recovery'}
            key={currentCard.id}
            onClassify={classify}
          />
        </main>
      ) : null}
    </div>
  );
}

function CheckpointSummary({
  session,
  atEnd,
  isLoading,
  onContinue,
  onComplete,
}: {
  session: VocabularySession;
  atEnd: boolean;
  isLoading: boolean;
  onContinue: () => void;
  onComplete: () => void;
}) {
  return (
    <main className="swipe-checkpoint">
      <div className="checkpoint-seal" aria-hidden="true">
        {atEnd ? '✓' : '100'}
      </div>
      <p className="eyebrow">Checkpoint</p>
      <h1>{atEnd ? 'すべて確認しました。' : '100個、進みました。'}</h1>
      <div className="checkpoint-counts">
        <span className="rating-mastered">
          <small>完璧</small>
          <strong>{session.sessionCounts.mastered}</strong>
        </span>
        <span className="rating-mostly-known">
          <small>覚えている</small>
          <strong>{session.sessionCounts.mostlyKnown}</strong>
        </span>
        <span className="rating-mostly-unknown">
          <small>少し曖昧</small>
          <strong>{session.sessionCounts.mostlyUnknown}</strong>
        </span>
        <span className="rating-unknown">
          <small>分からない</small>
          <strong>{session.sessionCounts.unknown}</strong>
        </span>
      </div>
      <div className="checkpoint-actions">
        {!atEnd && (
          <button disabled={isLoading} onClick={onContinue} type="button">
            {isLoading ? '準備中…' : '次の100個へ'}
          </button>
        )}
        <button
          className="checkpoint-finish"
          disabled={isLoading}
          onClick={onComplete}
          type="button"
        >
          {atEnd ? 'ホームへ' : '今日はここまで'}
        </button>
      </div>
    </main>
  );
}

function adjustCount(
  counts: VocabularySession['sessionCounts'],
  rating: VocabularyRating,
  amount: 1 | -1,
) {
  if (rating === 'mastered') {
    return { ...counts, mastered: Math.max(0, counts.mastered + amount) };
  }
  if (rating === 'mostly_known') {
    return { ...counts, mostlyKnown: Math.max(0, counts.mostlyKnown + amount) };
  }
  if (rating === 'mostly_unknown') {
    return {
      ...counts,
      mostlyUnknown: Math.max(0, counts.mostlyUnknown + amount),
    };
  }
  return { ...counts, unknown: Math.max(0, counts.unknown + amount) };
}

function partShortLabel(part: number | null) {
  if (part === 1) return '基本単語';
  if (part === 2) return '重要単語';
  return '難単語';
}
