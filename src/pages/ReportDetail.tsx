import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type { AssessmentReport } from '@shared/learning/contracts';
import { Spinner } from '@/components/ui/Spinner';
import {
  getAssessmentReport,
  getAssessmentReportMarkdown,
  useLearning,
} from '@/features/learning';
import { useAuth } from '@/features/auth';

export function ReportDetail() {
  const { reportId } = useParams();
  const { session } = useAuth();
  const { overview } = useLearning();
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!session || !reportId || overview?.mode !== 'live') return;
    getAssessmentReport(session.access_token, reportId)
      .then(setReport)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : '読み込めませんでした。',
        ),
      );
  }, [overview?.mode, reportId, session]);

  if (overview?.mode === 'dry-run') return <Navigate replace to="/" />;
  if (!report && !error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!report) {
    return (
      <div className="result-card mx-auto mt-10 max-w-xl">
        <h1>フィードバックを開けませんでした</h1>
        <p>{error}</p>
      </div>
    );
  }

  async function downloadMarkdown() {
    if (!session || !reportId) return;
    setIsDownloading(true);
    setError(null);
    try {
      const markdown = await getAssessmentReportMarkdown(
        session.access_token,
        reportId,
      );
      const url = URL.createObjectURL(
        new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `assessment-feedback-${reportId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'ダウンロードできませんでした。',
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <article className="report-detail pb-14">
      <Link className="back-link" to="/reports">
        ← フィードバック一覧
      </Link>
      <header className="report-cover mt-5">
        <div>
          <p className="eyebrow">English assessment workbook</p>
          <h1>
            {new Date(report.createdAt).toLocaleDateString('ja-JP')}の測定
          </h1>
          <p>{report.executiveSummaryJa}</p>
        </div>
        <div className="report-score-seal">
          <span>CEFR {report.estimatedCefr}</span>
          <strong>{report.correct}</strong>
          <small>/ {report.total}</small>
        </div>
      </header>
      <div className="report-actions">
        <button
          className="secondary-link"
          disabled={isDownloading}
          onClick={() => void downloadMarkdown()}
          type="button"
        >
          {isDownloading ? '準備中…' : 'Markdownで保存'}
        </button>
        {error && <span className="error-banner">{error}</span>}
      </div>

      <section className="grid gap-4 mt-6 lg:grid-cols-2">
        <div className="panel-card bg-green-200">
          <p className="eyebrow">Strengths</p>
          <h2>今回見つかった強み</h2>
          <ul className="report-bullets">
            {report.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="panel-card bg-yellow-200">
          <p className="eyebrow">Priorities</p>
          <h2>次に優先すること</h2>
          <ul className="report-bullets">
            {report.priorities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel-card mt-6">
        <p className="eyebrow">Study route</p>
        <h2>次回測定までの道筋</h2>
        <div className="study-route-grid">
          <StudyRoute label="7 DAYS" text={report.studyPlan.next7DaysJa} />
          <StudyRoute label="30 DAYS" text={report.studyPlan.next30DaysJa} />
          <StudyRoute
            label="NEXT TEST"
            text={report.studyPlan.beforeNextAssessmentJa}
          />
        </div>
      </section>

      <section className="mt-9">
        <p className="eyebrow">All 25 answers</p>
        <h2 className="mt-2 text-3xl font-black">問題・回答・個別解説</h2>
        <div className="question-review-list mt-5">
          {report.questions.map((question) => (
            <details
              className={
                question.isCorrect
                  ? 'question-review correct'
                  : 'question-review incorrect'
              }
              key={question.key}
            >
              <summary>
                <span>{question.key}</span>
                <strong>{question.stem}</strong>
                <em>
                  {question.isCorrect
                    ? '正解'
                    : question.isUnknown
                      ? 'わからない'
                      : '要復習'}
                </em>
              </summary>
              <div className="question-review-body">
                <ul>
                  {question.options.map((option) => (
                    <li key={option.id}>
                      {option.id}. {option.text}
                    </li>
                  ))}
                </ul>
                <p>
                  <b>あなたの回答:</b>{' '}
                  {question.isUnknown
                    ? 'わからない'
                    : question.selectedOptionId}
                </p>
                <p>
                  <b>正解:</b> {question.correctOptionId}
                </p>
                <p>{question.explanationJa}</p>
                <div className="diagnostic-note">
                  <b>専属AIから:</b> {question.diagnosticCommentJa}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}

function StudyRoute({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}
