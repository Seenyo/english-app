import { useState } from 'react';
import { Link } from 'react-router';
import {
  vocabularyActivities,
  vocabularyScopeLabels,
  useVocabulary,
  type VocabularyActivityKey,
  type VocabularyScopeKey,
} from '@/features/vocabulary';
import { VocabularyHeaderIllustration } from '@/features/vocabulary/components/VocabularyIllustrations';

type CheckScope = Extract<VocabularyScopeKey, 'words' | 'idioms'>;
type SectionActivity = Extract<VocabularyActivityKey, 'check' | 'memorize'>;
type OpenSectionScope = {
  activity: SectionActivity;
  scope: CheckScope;
};

export function Vocabulary() {
  const [openActivity, setOpenActivity] =
    useState<VocabularyActivityKey | null>(null);
  const [openSectionScope, setOpenSectionScope] =
    useState<OpenSectionScope | null>(null);
  const [openSectionPicker, setOpenSectionPicker] =
    useState<OpenSectionScope | null>(null);

  const toggleActivity = (activity: VocabularyActivityKey) => {
    setOpenActivity((current) => (current === activity ? null : activity));
    setOpenSectionScope(null);
    setOpenSectionPicker(null);
  };

  return (
    <div className="vocabulary-page pb-12">
      <Link className="page-back-link" to="/study">
        <span aria-hidden="true">←</span> 学習メニュー
      </Link>

      <header className="vocabulary-header">
        <h1>単語・熟語帳</h1>
        <div className="vocabulary-header-mark">
          <VocabularyHeaderIllustration />
        </div>
      </header>

      <section className="vocabulary-activity-list" aria-label="学習方法">
        {vocabularyActivities.map((activity) => {
          const isOpen = openActivity === activity.key;
          const sectionActivity: SectionActivity | null =
            activity.key === 'check' || activity.key === 'memorize'
              ? activity.key
              : null;
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
                  {sectionActivity ? (
                    <SectionScopeChoices
                      activity={sectionActivity}
                      openScope={
                        openSectionScope?.activity === sectionActivity
                          ? openSectionScope.scope
                          : null
                      }
                      onToggle={(scope) =>
                        setOpenSectionScope(
                          scope ? { activity: sectionActivity, scope } : null,
                        )
                      }
                      openSectionPicker={
                        openSectionPicker?.activity === sectionActivity
                          ? openSectionPicker.scope
                          : null
                      }
                      onToggleSectionPicker={(scope) =>
                        setOpenSectionPicker(
                          scope ? { activity: sectionActivity, scope } : null,
                        )
                      }
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

function SectionScopeChoices({
  activity,
  openScope,
  onToggle,
  openSectionPicker,
  onToggleSectionPicker,
}: {
  activity: SectionActivity;
  openScope: CheckScope | null;
  onToggle: (scope: CheckScope | null) => void;
  openSectionPicker: CheckScope | null;
  onToggleSectionPicker: (scope: CheckScope | null) => void;
}) {
  const { overview, isLoading, error } = useVocabulary();

  return (
    <div className="check-scope-list">
      {(['words', 'idioms'] as const).map((scope) => {
        const isOpen = openScope === scope;
        const isSectionPickerOpen = openSectionPicker === scope;
        const sectionCount = scope === 'words' ? 19 : 17;
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
              onClick={() => {
                onToggle(isOpen ? null : scope);
                if (isOpen) onToggleSectionPicker(null);
              }}
              type="button"
            >
              <span>{vocabularyScopeLabels[scope]}</span>
              <b aria-hidden="true">{isOpen ? '−' : '+'}</b>
            </button>
            {isOpen && (
              <>
                {activity === 'check' && (
                  <div className="check-start-options">
                    {!isLoading && canContinue && (
                      <Link
                        className="check-start-option"
                        to={`/study/vocabulary/check/${scope}/setup?mode=continue`}
                      >
                        <strong>続きから</strong>
                        <b aria-hidden="true">→</b>
                      </Link>
                    )}
                    <Link
                      className="check-start-option"
                      to={`/study/vocabulary/check/${scope}/setup?mode=restart`}
                    >
                      <strong>初めから</strong>
                      <b aria-hidden="true">→</b>
                    </Link>
                    {!isLoading && canRecheck && (
                      <Link
                        className="check-start-option"
                        to={`/study/vocabulary/check/${scope}/setup?mode=recheck`}
                      >
                        <strong>再チェック</strong>
                        <b aria-hidden="true">↻</b>
                      </Link>
                    )}
                    <button
                      aria-expanded={isSectionPickerOpen}
                      className="check-start-option"
                      onClick={() =>
                        onToggleSectionPicker(
                          isSectionPickerOpen ? null : scope,
                        )
                      }
                      type="button"
                    >
                      <strong>セクションごと</strong>
                      <b aria-hidden="true">
                        {isSectionPickerOpen ? '−' : '+'}
                      </b>
                    </button>
                    {error && <p className="check-option-error">{error}</p>}
                  </div>
                )}
                {(activity === 'memorize' || isSectionPickerOpen) && (
                  <SectionGrid
                    activity={activity}
                    scope={scope}
                    sectionCount={sectionCount}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionGrid({
  activity,
  scope,
  sectionCount,
}: {
  activity: SectionActivity;
  scope: CheckScope;
  sectionCount: number;
}) {
  return (
    <div className="vocabulary-section-grid">
      {Array.from({ length: sectionCount }, (_, index) => {
        const section = index + 1;
        const start = index * 100 + 1;
        const end = scope === 'idioms' && section === 17 ? 1684 : section * 100;
        const target =
          activity === 'check'
            ? `/study/vocabulary/check/${scope}/setup?section=${section}`
            : `/study/vocabulary/memorize/${scope}/${section}`;
        return (
          <Link className="vocabulary-section-link" key={section} to={target}>
            <strong>{section}</strong>
            <small>
              {start}–{end}
            </small>
          </Link>
        );
      })}
    </div>
  );
}
