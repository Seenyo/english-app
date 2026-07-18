import type { AssessmentReport } from '../../shared/learning/contracts.ts';

export function renderAssessmentReportMarkdown(
  report: AssessmentReport,
): string {
  const lines = [
    `# 英語レベル測定フィードバック`,
    '',
    `- 測定日: ${new Date(report.createdAt).toLocaleString('ja-JP')}`,
    `- 推定CEFR: ${report.estimatedCefr}`,
    `- 正解数: ${report.correct} / ${report.total}`,
    `- 「わからない」: ${report.unknown}問`,
    '',
    '## 総評',
    '',
    report.executiveSummaryJa,
    '',
    '## スコアの読み方',
    '',
    report.scoreInterpretationJa,
    '',
    '## 強み',
    '',
    ...report.strengths.map((item) => `- ${item}`),
    '',
    '## 優先課題',
    '',
    ...report.priorities.map((item) => `- ${item}`),
    '',
    '## 学習プラン',
    '',
    `### 次の7日間`,
    '',
    report.studyPlan.next7DaysJa,
    '',
    `### 次の30日間`,
    '',
    report.studyPlan.next30DaysJa,
    '',
    `### 次回測定まで`,
    '',
    report.studyPlan.beforeNextAssessmentJa,
    '',
    '## 25問の回答と解説',
    '',
  ];

  for (const question of report.questions) {
    const selected = question.isUnknown
      ? 'わからない'
      : `${question.selectedOptionId}: ${optionText(question.selectedOptionId, question.options)}`;
    lines.push(
      `### ${question.key} · ${categoryLabel(question.category)} · ${question.cefrLevel}`,
      '',
      question.stem,
      '',
      ...question.options.map((option) => `- ${option.id}. ${option.text}`),
      '',
      `- あなたの回答: ${selected}`,
      `- 正解: ${question.correctOptionId}: ${optionText(question.correctOptionId, question.options)}`,
      `- 判定: ${question.isCorrect ? '正解' : '不正解'}`,
      `- 学習ポイント: ${question.learningPoint}`,
      '',
      question.explanationJa,
      '',
      `**個別フィードバック:** ${question.diagnosticCommentJa}`,
      '',
    );
  }
  return `${lines.join('\n').trim()}\n`;
}

function optionText(
  id: 'A' | 'B' | 'C' | 'D' | null,
  options: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string }>,
): string {
  return options.find((option) => option.id === id)?.text ?? '';
}

function categoryLabel(category: 'vocabulary' | 'idiom' | 'grammar'): string {
  return { vocabulary: '単語', idiom: '熟語', grammar: '文法' }[category];
}
