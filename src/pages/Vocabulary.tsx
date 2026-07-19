import { useState } from 'react';
import { Link } from 'react-router';
import {
  vocabularyActivities,
  vocabularyScopeLabels,
  useVocabulary,
  type VocabularyActivityKey,
  type VocabularyScopeKey,
} from '@/features/vocabulary';

type CheckScope = Extract<VocabularyScopeKey, 'words' | 'idioms'>;

export function Vocabulary() {
  const [openActivity, setOpenActivity] =
    useState<VocabularyActivityKey | null>(null);
  const [openCheckScope, setOpenCheckScope] = useState<CheckScope | null>(null);

  const toggleActivity = (activity: VocabularyActivityKey) => {
    setOpenActivity((current) => (current === activity ? null : activity));
    if (activity !== 'check') setOpenCheckScope(null);
  };

  return (
    <div className="vocabulary-page pb-12">
      <Link className="page-back-link" to="/study">
        <span aria-hidden="true">←</span> 学習メニュー
      </Link>

      <header className="vocabulary-header">
        <div>
          <p className="eyebrow">Vocabulary notebook</p>
          <h1>単語・熟語帳</h1>
          <p>今の気分や進み具合に合わせて、取り組み方を選びましょう。</p>
        </div>
        <div className="vocabulary-header-mark" aria-hidden="true">
          <span>Aa</span>
          <small>
            WORDS
            <br />
            &amp; IDIOMS
          </small>
        </div>
      </header>

      <section className="vocabulary-activity-list" aria-label="学習方法">
        {vocabularyActivities.map((activity) => {
          const isOpen = openActivity === activity.key;
          return (
            <article
              className={`vocabulary-accordion vocabulary-tone-${activity.tone}`}
              key={activity.key}
            >
              <button
                aria-controls={`activity-${activity.key}`}
                aria-expanded={isOpen}
                className="vocabulary-accordion-trigger"
                onClick={() => toggleActivity(activity.key)}
                type="button"
              >
                <span className="vocabulary-activity-symbol" aria-hidden="true">
                  {activity.symbol}
                </span>
                <span className="vocabulary-activity-copy">
                  <small>{activity.eyebrow}</small>
                  <strong>{activity.label}</strong>
                  <span>{activity.description}</span>
                </span>
                <span className="vocabulary-chevron" aria-hidden="true">
                  ⌄
                </span>
              </button>

              {isOpen && (
                <div
                  className="vocabulary-accordion-body"
                  id={`activity-${activity.key}`}
                >
                  <p className="vocabulary-choice-label">
                    {activity.key === 'check'
                      ? 'チェックするものを選ぶ'
                      : '学ぶものを選ぶ'}
                  </p>
                  {activity.key === 'check' ? (
                    <CheckScopeChoices
                      openScope={openCheckScope}
                      onToggle={setOpenCheckScope}
                    />
                  ) : (
                    <div className="vocabulary-scope-grid">
                      {activity.scopes.map((scope) => (
                        <Link
                          className="vocabulary-scope-link"
                          key={scope}
                          to={`/study/vocabulary/${activity.key}/${scope}`}
                        >
                          <span>{vocabularyScopeLabels[scope]}</span>
                          <b aria-hidden="true">→</b>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function CheckScopeChoices({
  openScope,
  onToggle,
}: {
  openScope: CheckScope | null;
  onToggle: (scope: CheckScope | null) => void;
}) {
  const { overview, isLoading, error } = useVocabulary();
  return (
    <div className="check-scope-list">
      {(['words', 'idioms'] as const).map((scope) => {
        const isOpen = openScope === scope;
        const kind = scope === 'words' ? 'word' : 'idiom';
        const counts = scope === 'words' ? overview?.words : overview?.idioms;
        const resumable = overview?.resumableSessions.some(
          (session) => session.kind === kind,
        );
        const canContinue =
          resumable ||
          Boolean(counts && counts.classified > 0 && counts.unclassified > 0);
        const canRecheck = Boolean(counts && counts.classified > 0);
        return (
          <div className="check-scope-item" key={scope}>
            <button
              aria-expanded={isOpen}
              className="check-scope-trigger"
              onClick={() => onToggle(isOpen ? null : scope)}
              type="button"
            >
              <span>{vocabularyScopeLabels[scope]}</span>
              <b aria-hidden="true">{isOpen ? '−' : '+'}</b>
            </button>
            {isOpen && (
              <div className="check-start-options">
                {isLoading && (
                  <p className="check-option-loading">進捗を確認中…</p>
                )}
                {!isLoading && canContinue && (
                  <Link
                    className="check-start-option"
                    to={`/study/vocabulary/check/${scope}/setup?mode=continue`}
                  >
                    <span>
                      <strong>続きから</strong>
                      <small>次の未判定項目から再開</small>
                    </span>
                    <em aria-hidden="true">→</em>
                  </Link>
                )}
                <Link
                  className="check-start-option"
                  to={`/study/vocabulary/check/${scope}/setup?mode=restart`}
                >
                  <span>
                    <strong>{scope === 'words' ? '初めから' : 'すべて'}</strong>
                    <small>番号順に最初からチェック</small>
                  </span>
                  <em aria-hidden="true">→</em>
                </Link>
                {!isLoading && canRecheck && (
                  <Link
                    className="check-start-option"
                    to={`/study/vocabulary/check/${scope}/setup?mode=recheck`}
                  >
                    <span>
                      <strong>再チェック</strong>
                      <small>分類済みの項目を選んで確認</small>
                    </span>
                    <em aria-hidden="true">↻</em>
                  </Link>
                )}
                {error && <p className="check-option-error">{error}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
