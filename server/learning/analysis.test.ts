import assert from 'node:assert/strict';
import test from 'node:test';
import type { Thread } from '@openai/codex-sdk';
import type { LearnerPersona } from '../../shared/learning/contracts.ts';
import type { AssessmentThread } from '../assessment/generator.ts';
import {
  generateAssessmentAnalysis,
  validateAnalysisOutput,
  type AssessmentAnalysisInput,
} from './analysis.ts';

test('rejects analysis when any of the 25 question keys is duplicated or missing', () => {
  const output = validOutput();
  output.questionFeedback[24]!.questionKey = 'r1-q1';

  const validation = validateAnalysisOutput(
    JSON.stringify(output),
    expectedKeys(),
  );

  assert.equal(validation.success, false);
  if (!validation.success) {
    assert.ok(validation.issues.some((issue) => issue.includes('duplicate')));
    assert.ok(validation.issues.some((issue) => issue.includes('r3-q5')));
  }
});

test('repairs invalid analysis JSON in the same resumed thread', async () => {
  const prompts: string[] = [];
  const thread = fakeThread(
    'assessment-thread',
    ['not-json', JSON.stringify(validOutput())],
    prompts,
  );

  const result = await generateAssessmentAnalysis(input(), {
    threadFactory: {
      resume: () => thread,
      start: () => assert.fail('A valid resumable thread should not rotate'),
    },
    maxRepairAttempts: 1,
  });

  assert.equal(result.threadId, 'assessment-thread');
  assert.equal(result.repairCount, 1);
  assert.match(prompts[1] ?? '', /not valid JSON/);
});

test('rotates once when the assessment thread no longer exists', async () => {
  const replacement = fakeThread(
    'replacement-thread',
    [JSON.stringify(validOutput())],
    [],
  );
  let starts = 0;

  const result = await generateAssessmentAnalysis(input(), {
    threadFactory: {
      resume: () => ({
        id: 'assessment-thread',
        async run() {
          throw new Error('thread not found');
        },
      }),
      start: () => {
        starts += 1;
        return replacement;
      },
    },
    maxRepairAttempts: 1,
  });

  assert.equal(starts, 1);
  assert.equal(result.threadId, 'replacement-thread');
});

function input(): AssessmentAnalysisInput {
  const keys = expectedKeys();
  return {
    attemptId: '1670bfc0-0c39-45ab-83de-32e581072bc6',
    userId: '2752d803-af91-44d4-b2fe-1569b040ba62',
    codexThreadId: 'assessment-thread',
    profileSnapshot: {
      selfAssessment:
        'I understand daily English but need stronger grammar and nuanced vocabulary.',
      eikenGrade: null,
      toeicScore: null,
    },
    persona: persona(),
    estimatedCefr: 'B1',
    correct: 16,
    unknown: 2,
    questions: keys.map((key, index) => ({
      key,
      round: index < 10 ? 1 : index < 20 ? 2 : 3,
      position: index < 10 ? index + 1 : index < 20 ? index - 9 : index - 19,
      category:
        index % 3 === 0 ? 'vocabulary' : index % 3 === 1 ? 'idiom' : 'grammar',
      cefrLevel: 'B1',
      difficultyRank: 5,
      stem: `Choose the best answer for _____ (${key}).`,
      options: ['A', 'B', 'C', 'D'].map((id) => ({
        id: id as 'A' | 'B' | 'C' | 'D',
        text: `${id} option`,
      })),
      selectedOptionId: 'A',
      isUnknown: false,
      correctOptionId: index % 2 === 0 ? 'A' : 'B',
      isCorrect: index % 2 === 0,
      explanationJa: '文脈と文法に合う選択肢を選びます。',
      learningPoint: `point-${index + 1}`,
    })),
  };
}

function persona(): LearnerPersona {
  return {
    schemaVersion: 1,
    version: 2,
    initialSelfAssessment:
      'I understand daily English but need stronger grammar and nuanced vocabulary.',
    userAuthored: {
      currentSelfDescription:
        'I understand daily English but need stronger grammar and nuanced vocabulary.',
      goals: { shortTerm: '', mediumTerm: '', longTerm: '' },
      motivation: '',
      interests: [],
      studyPurpose: '',
      dailyStudyMinutes: null,
      preferredMethods: [],
      difficultMethods: [],
      correctionNote: '',
      eikenGrade: null,
      toeicScore: null,
    },
    aiInferred: {
      summaryJa: '',
      skillEstimates: null,
      strengths: [],
      weaknesses: [],
      errorPatterns: [],
      recommendedFocus: [],
      evidenceSummaryJa: '',
    },
    metrics: {
      currentCefr: 'B1',
      assessmentsCompleted: 1,
      assessmentQuestionsAnswered: 25,
      learnedWords: 0,
      totalStudyMinutes: 0,
      lastAssessedAt: '2026-07-18T00:00:00.000Z',
      lastActivityAt: '2026-07-18T00:00:00.000Z',
      vocabularyCheck: {
        words: {
          total: 1900,
          classified: 0,
          unclassified: 1900,
          mastered: 0,
          mostlyKnown: 0,
          mostlyUnknown: 0,
          unknown: 0,
        },
        idioms: {
          total: 1684,
          classified: 0,
          unclassified: 1684,
          mastered: 0,
          mostlyKnown: 0,
          mostlyUnknown: 0,
          unknown: 0,
        },
        lastCheckedAt: null,
      },
    },
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

function validOutput() {
  return {
    executiveSummaryJa:
      '今回の測定では、日常的な語彙と基本文法を安定して理解できています。一方で、抽象語彙と複数語からなる熟語では意味の近い選択肢を区別する精度に改善の余地があります。',
    scoreInterpretationJa:
      '25問の回答から、基礎事項は定着しているものの、難度が上がると文脈より語の見た目に引かれる傾向が確認できました。わからないを選べた問題も含め、今後の学習境界が明確です。',
    strengths: ['基本語彙を文脈の中で正しく選べる'],
    priorities: ['似た意味を持つ熟語の使い分けを増やす'],
    studyPlan: {
      next7DaysJa: '毎日10分、今回間違えた熟語を例文と一緒に復習します。',
      next30DaysJa:
        '週ごとに語彙・熟語・文法を回し、短い確認問題で定着を測ります。',
      beforeNextAssessmentJa:
        '次回測定までに誤答の理由を説明できる状態を目指します。',
    },
    questionFeedback: expectedKeys().map((questionKey) => ({
      questionKey,
      diagnosticCommentJa:
        '選択理由と正解の根拠を比べると、次回の判断基準が明確になります。',
    })),
    personaInference: {
      summaryJa: '基礎を土台に、類義表現の精度を高める段階です。',
      skillEstimates: {
        vocabulary: {
          cefr: 'B1',
          confidence: 0.8,
          rationaleJa: '基本語彙が安定しています。',
        },
        idiom: {
          cefr: 'A2',
          confidence: 0.7,
          rationaleJa: '熟語の誤答が見られました。',
        },
        grammar: {
          cefr: 'B1',
          confidence: 0.8,
          rationaleJa: '基本文法が安定しています。',
        },
      },
      strengths: ['基本語彙'],
      weaknesses: ['熟語の使い分け'],
      errorPatterns: [
        {
          patternJa: '意味が近い熟語を混同する',
          evidenceQuestionKeys: ['r1-q2'],
          recommendationJa: '対比例文で覚える',
        },
      ],
      recommendedFocus: ['熟語'],
      evidenceSummaryJa: '25問の正誤とわからない回答を根拠にしています。',
    },
  };
}

function expectedKeys() {
  return [
    ...Array.from({ length: 10 }, (_, index) => `r1-q${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `r2-q${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `r3-q${index + 1}`),
  ];
}

function fakeThread(
  id: string,
  responses: string[],
  prompts: string[],
): AssessmentThread {
  let call = 0;
  return {
    id,
    async run(prompt) {
      prompts.push(String(prompt));
      const finalResponse = responses[call] ?? responses.at(-1) ?? '{}';
      call += 1;
      return { finalResponse, items: [], usage: null };
    },
  } satisfies Pick<Thread, 'id' | 'run'>;
}
