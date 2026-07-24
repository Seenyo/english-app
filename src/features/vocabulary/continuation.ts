import type {
  VocabularyKind,
  VocabularyOverview,
} from '@shared/vocabulary/contracts';

export function canContinueVocabularyCheck(
  overview: VocabularyOverview | null,
  kind: VocabularyKind,
) {
  if (!overview) return false;

  const counts = kind === 'word' ? overview.words : overview.idioms;
  return (
    counts.unclassified > 0 ||
    overview.resumableSessions.some(
      (session) =>
        session.kind === kind &&
        session.mode === 'continue' &&
        session.section === null,
    )
  );
}
