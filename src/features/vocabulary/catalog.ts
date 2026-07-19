export type VocabularyActivityKey = 'check' | 'memorize' | 'quiz';
export type VocabularyScopeKey = 'mixed' | 'words' | 'idioms';

export type VocabularyActivity = {
  key: VocabularyActivityKey;
  label: string;
  eyebrow: string;
  description: string;
  symbol: string;
  tone: 'coral' | 'green' | 'yellow';
  scopes: VocabularyScopeKey[];
};

export const vocabularyActivities: VocabularyActivity[] = [
  {
    key: 'check',
    label: '習熟度チェック',
    eyebrow: 'Sort your words',
    description: '知っている・まだ曖昧を分けて、学ぶ順番を整えます。',
    symbol: '✓',
    tone: 'coral',
    scopes: ['words', 'idioms'],
  },
  {
    key: 'memorize',
    label: '暗記',
    eyebrow: 'Build your memory',
    description: '意味を確かめながら、自分のペースで覚えます。',
    symbol: 'Aa',
    tone: 'green',
    scopes: ['mixed', 'words', 'idioms'],
  },
  {
    key: 'quiz',
    label: '問題',
    eyebrow: 'Test yourself',
    description: '覚えた内容を、選択問題などで確かめます。',
    symbol: '?',
    tone: 'yellow',
    scopes: ['mixed', 'words', 'idioms'],
  },
];

export const vocabularyScopeLabels: Record<VocabularyScopeKey, string> = {
  mixed: 'ランダム',
  words: '単語',
  idioms: '熟語',
};

export function findVocabularyActivity(value: string | undefined) {
  return vocabularyActivities.find((activity) => activity.key === value);
}

export function isVocabularyScope(
  value: string | undefined,
): value is VocabularyScopeKey {
  return value === 'mixed' || value === 'words' || value === 'idioms';
}
