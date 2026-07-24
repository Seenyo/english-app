import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type {
  VocabularyKind,
  VocabularyMemoryResult,
  VocabularyMemorySession,
} from '@shared/vocabulary/contracts';
import { VocabularyApiError, useVocabulary } from '@/features/vocabulary';
import { getMemoryDirection } from '@/features/vocabulary/components/memoryDirection';

export function VocabularyMemory() {
  const { scope, section: sectionParam } = useParams();
  const { startMemorySession, answerMemoryCard } = useVocabulary();
  const kind: VocabularyKind | null =
    scope === 'words' ? 'word' : scope === 'idioms' ? 'idiom' : null;
  const section = parseSection(sectionParam, kind);
  const [session, setSession] = useState<VocabularyMemorySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [answerMotion, setAnswerMotion] =
    useState<VocabularyMemoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(performance.now());
  const operationId = useRef(crypto.randomUUID());
  const startMemorySessionRef = useRef(startMemorySession);

  useEffect(() => {
    if (!kind || !section) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    void startMemorySessionRef
      .current({ kind, section })
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        shownAt.current = performance.now();
      })
      .catch((requestError) => {
        if (!active) return;
        setError(memoryErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, section]);

  const answer = async (result: VocabularyMemoryResult) => {
    const card = session?.currentCard;
    if (!card || isSaving || !isRevealed) return;
    setIsSaving(true);
    setAnswerMotion(result);
    setError(null);
    try {
      const nextSession = await answerMemoryCard(session.id, {
        operationId: operationId.current,
        itemId: card.id,
        result,
        responseMs: Math.min(
          600_000,
          Math.max(0, Math.round(performance.now() - shownAt.current)),
        ),
      });
      setSession(nextSession);
      setIsRevealed(false);
      operationId.current = crypto.randomUUID();
      shownAt.current = performance.now();
    } catch (requestError) {
      setError(memoryErrorMessage(requestError));
    } finally {
      setAnswerMotion(null);
      setIsSaving(false);
    }
  };

  if (!kind || !section) {
    return <Navigate replace to="/study/vocabulary" />;
  }

  if (isLoading) {
    return (
      <MemoryShell>
        <div className="memory-loading" role="status">
          <span aria-hidden="true">記</span>
          <p>今日の言葉を選んでいます…</p>
        </div>
      </MemoryShell>
    );
  }

  if (!session) {
    return (
      <MemoryShell>
        <div className="memory-empty-state">
          <span aria-hidden="true">✓</span>
          <h1>今日はここまで。</h1>
          <p>{error ?? '次に覚える言葉が届くまで、少し休みましょう。'}</p>
          <Link to="/study/vocabulary">単語・熟語帳へ戻る</Link>
        </div>
      </MemoryShell>
    );
  }

  if (session.status === 'completed') {
    return (
      <MemoryShell>
        <section className="memory-complete" aria-labelledby="memory-complete">
          <div className="memory-complete-mark" aria-hidden="true">
            ✓
          </div>
          <h1 id="memory-complete">おわり。</h1>
          <p>
            <strong>{session.rememberedCount}語</strong>
            は記憶に残りました。
            {session.againCount > 0 &&
              ` ${session.againCount}語は近いうちにもう一度確認します。`}
          </p>
          <Link className="memory-complete-link" to="/study/vocabulary">
            単語・熟語帳へ戻る <span aria-hidden="true">→</span>
          </Link>
        </section>
      </MemoryShell>
    );
  }

  const card = session.currentCard;
  if (!card) {
    return (
      <MemoryShell>
        <div className="memory-empty-state">
          <h1>カードを読み込めませんでした。</h1>
          <Link to="/study/vocabulary">単語・熟語帳へ戻る</Link>
        </div>
      </MemoryShell>
    );
  }

  const remaining = Math.max(1, session.total - session.position);
  const progress = Math.min(100, (session.position / session.total) * 100);
  const direction = getMemoryDirection(session.id, card.id, session.position);
  const isJapanesePrompt = direction === 'ja-to-en';
  const prompt = isJapanesePrompt ? card.meaningJa : card.term;
  const revealedAnswer = isJapanesePrompt ? card.term : card.meaningJa;
  const answerLanguage = isJapanesePrompt ? '英語' : '日本語';

  return (
    <MemoryShell>
      <section className="memory-session" aria-live="polite">
        <div className="memory-progress-row">
          <div
            aria-label={`暗記の進捗 ${Math.round(progress)}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(progress)}
            className="memory-progress"
            role="progressbar"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>あと {remaining}</small>
        </div>

        <button
          aria-label={
            isRevealed
              ? `${prompt}の答え：${revealedAnswer}`
              : `${prompt}の${answerLanguage}を見る`
          }
          className={`memory-card${isRevealed ? ' is-revealed' : ''}${
            answerMotion ? ` is-${answerMotion}` : ''
          }`}
          disabled={isSaving}
          onClick={() => setIsRevealed(true)}
          type="button"
        >
          <span className="memory-card-meta">
            {card.kind === 'word' ? '単語' : '熟語'}
            {card.section ? ` · ${card.section}` : ''}
          </span>
          <strong
            className={`memory-card-prompt${
              isJapanesePrompt ? ' is-japanese' : ''
            }`}
          >
            {prompt}
          </strong>
          <span className="memory-card-divider" aria-hidden="true" />
          <span
            className={`memory-card-answer${
              !isJapanesePrompt ? ' is-japanese' : ''
            }`}
          >
            {isRevealed ? revealedAnswer : `タップして${answerLanguage}を見る`}
          </span>
        </button>

        <div className="memory-response-area">
          {isRevealed && (
            <div className="memory-response-buttons">
              <button
                className="memory-again-button"
                disabled={isSaving}
                onClick={() => void answer('again')}
                type="button"
              >
                まだ
              </button>
              <button
                className="memory-remembered-button"
                disabled={isSaving}
                onClick={() => void answer('remembered')}
                type="button"
              >
                覚えてた
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="memory-inline-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </MemoryShell>
  );
}

function MemoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="memory-page pb-12">
      <header className="memory-topbar">
        <Link aria-label="単語・熟語帳へ戻る" to="/study/vocabulary">
          <span aria-hidden="true">←</span>
        </Link>
      </header>
      {children}
    </div>
  );
}

function parseSection(value: string | undefined, kind: VocabularyKind | null) {
  if (!value || !kind) return null;
  const section = Number(value);
  const maximum = kind === 'word' ? 19 : 17;
  return Number.isInteger(section) && section >= 1 && section <= maximum
    ? section
    : null;
}

function memoryErrorMessage(error: unknown) {
  if (
    error instanceof VocabularyApiError &&
    error.code === 'vocabulary_memory_queue_empty'
  ) {
    return '今日確認する言葉はありません。';
  }
  return error instanceof Error
    ? error.message
    : '暗記セッションを読み込めませんでした。';
}
