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

const ratingChoices: {
  rating: VocabularyRating;
  label: string;
  className: string;
}[] = [
  {
    rating: 'mastered',
    label: '完璧',
    className: 'rating-mastered',
  },
  {
    rating: 'mostly_known',
    label: '覚えている',
    className: 'rating-mostly-known',
  },
  {
    rating: 'mostly_unknown',
    label: '曖昧',
    className: 'rating-mostly-unknown',
  },
  {
    rating: 'unknown',
    label: '知らない',
    className: 'rating-unknown',
  },
];

export function VocabularyCheckSetup() {
  const { scope } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { overview, startSession } = useVocabulary();
  const started = useRef(false);
  const [selectedRatings, setSelectedRatings] = useState<VocabularyRating[]>(
    [],
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind: VocabularyKind | null =
    scope === 'words' ? 'word' : scope === 'idioms' ? 'idiom' : null;
  const section = parseSection(searchParams.get('section'), kind);
  const mode = section
    ? ('restart' as const)
    : parseMode(searchParams.get('mode'));
  const counts = kind === 'word' ? overview?.words : overview?.idioms;
  const availableRatings = useMemo(
    () =>
      ratingChoices.filter((choice) => ratingCount(counts, choice.rating) > 0),
    [counts],
  );

  const launch = useCallback(
    async (ratings: VocabularyRating[] = []) => {
      if (!user || !kind || !mode) return;
      setIsStarting(true);
      setError(null);
      try {
        const result = await startSession({
          kind,
          ...(section ? { section } : {}),
          mode,
          skippedSections: [],
          recheckRatings: ratings,
        });
        if (result.outcome === 'completed') {
          navigate('/', { replace: true });
          return;
        }
        await cacheVocabularySession(user.id, result.session);
        navigate(`/study/vocabulary/check/${scope}/session`, {
          replace: mode === 'continue' || Boolean(section),
          state: { session: result.session },
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
    [kind, mode, navigate, scope, section, startSession, user],
  );

  useEffect(() => {
    if (mode !== 'recheck' || selectedRatings.length > 0) return;
    setSelectedRatings(availableRatings.map((choice) => choice.rating));
  }, [availableRatings, mode, selectedRatings.length]);

  useEffect(() => {
    if (!mode || mode === 'recheck' || started.current) return;
    started.current = true;
    void launch();
  }, [launch, mode]);

  if (!kind || !mode || (searchParams.has('section') && !section)) {
    return <Navigate replace to="/study/vocabulary" />;
  }

  if (mode === 'recheck') {
    return (
      <div className="check-setup-page pb-12">
        <Link
          aria-label="単語・熟語帳へ戻る"
          className="page-back-link"
          to="/study/vocabulary"
        >
          <span aria-hidden="true">←</span>
        </Link>
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
                <small>{ratingCount(counts, choice.rating)}</small>
              </button>
            );
          })}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button
          className="check-start-button"
          disabled={isStarting || selectedRatings.length === 0}
          onClick={() => void launch(selectedRatings)}
          type="button"
        >
          {isStarting ? '準備中…' : '始める'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  return (
    <div className="check-launch-stage">
      <Link
        aria-label="単語・熟語帳へ戻る"
        className="page-back-link"
        to="/study/vocabulary"
      >
        <span aria-hidden="true">←</span>
      </Link>
      <div className="check-launch-card">
        <Spinner />
        {error && (
          <>
            <p>{error}</p>
            <button onClick={() => void launch()} type="button">
              再試行
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

function parseSection(value: string | null, kind: VocabularyKind | null) {
  if (!value || !kind) return null;
  const section = Number(value);
  const maximum = kind === 'word' ? 19 : 17;
  return Number.isInteger(section) && section >= 1 && section <= maximum
    ? section
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
