import type { Session } from '@supabase/supabase-js';
import {
  assessmentStateSchema,
  type AssessmentState,
} from '../../../shared/assessment/contracts.ts';
import {
  learningOverviewSchema,
  type LearningOverview,
} from '../../../shared/learning/contracts.ts';
import {
  vocabularyMemoryOverviewSchema,
  vocabularyMemorySessionSchema,
  vocabularyOverviewSchema,
  type VocabularyMemoryCard,
  type VocabularyKind,
  type VocabularyMemoryOverview,
  type VocabularyMemoryResult,
  type VocabularyMemorySession,
  type VocabularyOverview,
} from '../../../shared/vocabulary/contracts.ts';
import { developerPreviewUserId } from './runtime';
import { developerPreviewMemoryCards } from './vocabularyMemoryCards';

const previewDate = '2026-07-21T12:00:00.000Z';

export const developerPreviewSession: Session = {
  access_token: 'developer-preview-only',
  token_type: 'bearer',
  expires_in: 86_400,
  expires_at: 4_102_444_800,
  refresh_token: 'developer-preview-only',
  user: {
    id: developerPreviewUserId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'preview@localhost',
    email_confirmed_at: previewDate,
    confirmed_at: previewDate,
    last_sign_in_at: previewDate,
    app_metadata: { provider: 'preview', providers: ['preview'] },
    user_metadata: { full_name: 'Preview Learner' },
    identities: [],
    created_at: previewDate,
    updated_at: previewDate,
    is_anonymous: false,
  },
};

export const developerPreviewAssessmentState: AssessmentState =
  assessmentStateSchema.parse({
    status: 'completed',
    attemptId: '00000000-0000-4000-8000-000000000002',
    estimatedCefr: 'B1',
    correct: 17,
    total: 25,
    unknown: 3,
    completedRounds: [
      previewRound(1, 7, 10, 1),
      previewRound(2, 7, 10, 1),
      previewRound(3, 3, 5, 1),
    ],
  });

export const developerPreviewLearningOverview: LearningOverview =
  learningOverviewSchema.parse({
    mode: 'live',
    analysisStatus: 'unavailable',
    analysisMessage: 'Developer PreviewではAI分析と保存を行いません。',
    persona: null,
    latestReport: null,
  });

export const developerPreviewVocabularyOverview: VocabularyOverview =
  vocabularyOverviewSchema.parse({
    words: {
      total: 1900,
      classified: 742,
      unclassified: 1158,
      mastered: 218,
      mostlyKnown: 264,
      mostlyUnknown: 171,
      unknown: 89,
    },
    idioms: {
      total: 1684,
      classified: 386,
      unclassified: 1298,
      mastered: 72,
      mostlyKnown: 119,
      mostlyUnknown: 126,
      unknown: 69,
    },
    sectionMastery: [
      ...Array.from({ length: 19 }, (_, index) => ({
        kind: 'word' as const,
        section: index + 1,
        total: 100,
        mastered: index === 0 ? 100 : 0,
        isMastered: index === 0,
      })),
      ...Array.from({ length: 17 }, (_, index) => ({
        kind: 'idiom' as const,
        section: index + 1,
        total: index === 16 ? 84 : 100,
        mastered: index === 0 ? 100 : 0,
        isMastered: index === 0,
      })),
    ],
    lastCheckedAt: previewDate,
    resumableSessions: [],
  });

export const developerPreviewMemoryOverview: VocabularyMemoryOverview =
  vocabularyMemoryOverviewSchema.parse({
    recommendedCount: 10,
    estimatedMinutes: 3,
    streakDays: 6,
    hasActiveSession: false,
    lastMemorizedAt: '2026-07-20T12:00:00.000Z',
  });

export type DeveloperPreviewMemoryState = {
  sessionId: string;
  kind: VocabularyKind;
  section: number;
  cards: VocabularyMemoryCard[];
  queue: number[];
  position: number;
  attempts: Map<number, number>;
  remembered: Set<number>;
  again: Set<number>;
};

export function createDeveloperPreviewMemoryState(
  kind: VocabularyKind = 'word',
  section = 1,
): DeveloperPreviewMemoryState {
  const cards = developerPreviewMemoryCards
    .filter((card) => card.kind === kind)
    .slice(0, 10)
    .map((card, index) => ({
      ...card,
      id: (kind === 'word' ? 10_000 : 20_000) + section * 100 + index,
      sourceOrder: (section - 1) * 100 + index + 1,
      section,
      part: kind === 'word' ? (section <= 8 ? 1 : section <= 15 ? 2 : 3) : null,
    }));
  return {
    sessionId: '00000000-0000-4000-8000-000000000020',
    kind,
    section,
    cards,
    queue: cards.map((card) => card.id),
    position: 0,
    attempts: new Map(),
    remembered: new Set(),
    again: new Set(),
  };
}

export function answerDeveloperPreviewMemoryCard(
  state: DeveloperPreviewMemoryState,
  itemId: number,
  result: VocabularyMemoryResult,
) {
  if (state.queue[state.position] !== itemId) {
    throw new Error('Preview暗記カードの順序が一致しません。');
  }
  const attempt = (state.attempts.get(itemId) ?? 0) + 1;
  state.attempts.set(itemId, attempt);
  if (result === 'remembered') {
    state.remembered.add(itemId);
    state.again.delete(itemId);
  } else {
    state.remembered.delete(itemId);
    state.again.add(itemId);
    if (attempt < 3) state.queue.push(itemId);
  }
  state.position += 1;
  return toDeveloperPreviewMemorySession(state);
}

export function toDeveloperPreviewMemorySession(
  state: DeveloperPreviewMemoryState,
): VocabularyMemorySession {
  const cardId = state.queue[state.position];
  return vocabularyMemorySessionSchema.parse({
    id: state.sessionId,
    kind: state.kind,
    section: state.section,
    status: cardId === undefined ? 'completed' : 'active',
    position: state.position,
    total: state.queue.length,
    initialCount: state.cards.length,
    currentCard: state.cards.find((card) => card.id === cardId) ?? null,
    rememberedCount: state.remembered.size,
    againCount: state.again.size,
  });
}

function previewRound(
  round: 1 | 2 | 3,
  correct: number,
  total: number,
  unknown: number,
) {
  return {
    round,
    correct,
    total,
    unknown,
    categories: [
      { category: 'vocabulary' as const, correct: 3, total: 4, unknown: 0 },
      { category: 'idiom' as const, correct: 2, total: 3, unknown: 1 },
      { category: 'grammar' as const, correct: 2, total: 3, unknown: 0 },
    ],
  };
}
