import { useState } from 'react';
import { Link } from 'react-router';
import {
  vocabularyActivities,
  vocabularyScopeLabels,
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
  return (
    <div className="check-scope-list">
      {(['words', 'idioms'] as const).map((scope) => {
        const isOpen = openScope === scope;
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
                <button disabled type="button">
                  <span>
                    <strong>続きから</strong>
                    <small>前回の続きからチェック</small>
                  </span>
                  <em>準備中</em>
                </button>
                <button disabled type="button">
                  <span>
                    <strong>初めから</strong>
                    <small>最初の項目からチェック</small>
                  </span>
                  <em>準備中</em>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
