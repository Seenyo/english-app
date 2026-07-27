import type {
  VocabularyKind,
  VocabularyOverview,
} from '@shared/vocabulary/contracts';

export function isVocabularySectionMastered(
  overview: VocabularyOverview | null,
  kind: VocabularyKind,
  section: number,
): boolean {
  return (
    overview?.sectionMastery.some(
      (entry) =>
        entry.kind === kind && entry.section === section && entry.isMastered,
    ) ?? false
  );
}
