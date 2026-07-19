import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import type {
  VocabularyCheckMode,
  VocabularyCount,
  VocabularyKind,
  VocabularyRating,
} from '@shared/vocabulary/contracts';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth';
import { cacheVocabularySession, useVocabulary } from '@/features/vocabulary';

const partGroups = [
  {
    part: 1,
    label: '常に試験に出る基本単語',
    sections: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    part: 2,
    label: '常に試験に出る重要単語',
    sections: [9, 10, 11, 12, 13, 14, 15],
  },
  {
    part: 3,
    label: 'ここで差がつく難単語',
    sections: [16, 17, 18, 19],
  },
];

const ratingChoices: {
  rating: VocabularyRating;
  label: string;
  className: string;
}[] = [
  {
    rating: 'mastered',
    label: '完璧に知っている',
    className: 'rating-mastered',
  },
  {
    rating: 'mostly_known',
    label: 'どちらかといえば覚えている',
    className: 'rating-mostly-known',
  },
  {
    rating: 'mostly_unknown',
    label: 'どちらかといえば覚えていない',
    className: 'rating-mostly-unknown',
  },
  {
    rating: 'unknown',
    label: 'まったく分からない',
    className: 'rating-unknown',
  },
];

export function VocabularyCheckSetup() {
  const { scope } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { overview, startSession } = useVocabulary();
  const startedAutomatically = useRef(false);
  const [skippedSections, setSkippedSections] = useState<number[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<VocabularyRating[]>(
    [],
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind: VocabularyKind | null =
    scope === 'words' ? 'word' : scope === 'idioms' ? 'idiom' : null;
  const mode = parseMode(searchParams.get('mode'));
  const counts = kind === 'word' ? overview?.words : overview?.idioms;

  const availableRatings = useMemo(
    () =>
      ratingChoices.filter((choice) => {
        if (!counts) return false;
        return ratingCount(counts, choice.rating) > 0;
      }),
    [counts],
  );

  const launch = useCallback(
    async (
      sessionKind: VocabularyKind,
      sessionMode: VocabularyCheckMode,
      sections: number[],
      ratings: VocabularyRating[],
    ) => {
      if (!user) return;
      setIsStarting(true);
      setError(null);
      try {
        const session = await startSession({
          kind: sessionKind,
          mode: sessionMode,
          skippedSections: sections,
          recheckRatings: ratings,
        });
        await cacheVocabularySession(user.id, session);
        navigate(`/study/vocabulary/check/${scope}/session`, {
          replace: sessionMode === 'continue',
          state: { session },
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : '習熟度チェックを開始できませんでした。',
        );
        setIsStarting(false);
      }
    },
    [navigate, scope, startSession, user],
  );

  useEffect(() => {
    if (mode !== 'recheck' || selectedRatings.length > 0) return;
    setSelectedRatings(availableRatings.map((choice) => choice.rating));
  }, [availableRatings, mode, selectedRatings.length]);

  useEffect(() => {
    if (!kind || mode !== 'continue' || startedAutomatically.current) return;
    startedAutomatically.current = true;
    void launch(kind, mode, [], []);
  }, [kind, launch, mode]);

  if (!kind || !mode) return <Navigate replace to="/study/vocabulary" />;

  if (mode === 'continue') {
    return (
      <LoadingSetup
        error={error}
        kind={kind}
        onRetry={() => launch(kind, mode, [], [])}
      />
    );
  }

  return (
    <div className="check-setup-page pb-12">
      <Link className="page-back-link" to="/study/vocabulary">
        <span aria-hidden="true">←</span> 単語・熟語帳
      </Link>

      <header className="check-setup-header">
        <p className="eyebrow">Before you begin</p>
        <h1>
          {mode === 'recheck'
            ? 'もう一度確かめるものを選ぶ。'
            : kind === 'word'
              ? '自信のあるSectionを省く。'
              : '熟語を最初から確かめる。'}
        </h1>
        <p>
          {mode === 'recheck'
            ? '選んだ習熟度の項目だけを、ランダムな順番で再チェックします。'
            : kind === 'word'
              ? '省いたSectionの100語は「完璧に知っている」として記録されます。'
              : '1684個を番号順に表示し、100個ごとにひと休みできます。'}
        </p>
      </header>

      {mode === 'restart' && kind === 'word' && (
        <div className="section-picker">
          {partGroups.map((group) => (
            <section className="section-part" key={group.part}>
              <div>
                <span>PART {group.part}</span>
                <h2>{group.label}</h2>
              </div>
              <div className="section-chip-grid">
                {group.sections.map((section) => {
                  const selected = skippedSections.includes(section);
                  return (
                    <button
                      aria-pressed={selected}
                      className="section-skip-chip"
                      key={section}
                      onClick={() =>
                        setSkippedSections((current) =>
                          selected
                            ? current.filter((value) => value !== section)
                            : [...current, section].sort((a, b) => a - b),
                        )
                      }
                      type="button"
                    >
                      <strong>Section {section}</strong>
                      <small>
                        {selected
                          ? '省く'
                          : `${(section - 1) * 100 + 1}–${section * 100}`}
                      </small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="section-skip-summary">
            {skippedSections.length === 0
              ? 'すべてのSectionをチェックします。'
              : `${skippedSections.length * 100}語を自己申告で「完璧」として省きます。`}
          </p>
        </div>
      )}

      {mode === 'recheck' && (
        <div className="recheck-rating-grid">
          {availableRatings.map((choice) => {
            const selected = selectedRatings.includes(choice.rating);
            return (
              <button
                aria-pressed={selected}
                className={`recheck-rating ${choice.className}`}
                key={choice.rating}
                onClick={() =>
                  setSelectedRatings((current) =>
                    selected
                      ? current.filter((rating) => rating !== choice.rating)
                      : [...current, choice.rating],
                  )
                }
                type="button"
              >
                <span aria-hidden="true">{selected ? '✓' : ''}</span>
                <strong>{choice.label}</strong>
                <small>{ratingCount(counts, choice.rating)}件</small>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      <button
        className="check-start-button"
        disabled={
          isStarting || (mode === 'recheck' && selectedRatings.length === 0)
        }
        onClick={() =>
          void launch(kind, mode, skippedSections, selectedRatings)
        }
        type="button"
      >
        {isStarting ? '準備中…' : '習熟度チェックを始める'}
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function LoadingSetup({
  kind,
  error,
  onRetry,
}: {
  kind: VocabularyKind;
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  return (
    <div className="check-launch-stage">
      <div className="check-launch-card">
        <Spinner />
        <p className="eyebrow">Picking up where you left off</p>
        <h1>{kind === 'word' ? '単語' : '熟語'}の続きを並べています。</h1>
        {error && (
          <>
            <p>{error}</p>
            <button onClick={() => void onRetry()} type="button">
              もう一度試す
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function parseMode(value: string | null): VocabularyCheckMode | null {
  return value === 'continue' || value === 'restart' || value === 'recheck'
    ? value
    : null;
}

function ratingCount(
  counts: VocabularyCount | undefined,
  rating: VocabularyRating,
) {
  if (!counts) return 0;
  if (rating === 'mastered') return counts.mastered;
  if (rating === 'mostly_known') return counts.mostlyKnown;
  if (rating === 'mostly_unknown') return counts.mostlyUnknown;
  return counts.unknown;
}
