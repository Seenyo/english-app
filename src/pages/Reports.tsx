import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { AssessmentReportSummary } from '@shared/learning/contracts';
import { Spinner } from '@/components/ui/Spinner';
import { listAssessmentReports, useLearning } from '@/features/learning';
import { useAuth } from '@/features/auth';

export function Reports() {
  const { session } = useAuth();
  const { overview } = useLearning();
  const [reports, setReports] = useState<AssessmentReportSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || overview?.mode !== 'live') return;
    listAssessmentReports(session.access_token)
      .then(setReports)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : '読み込めませんでした。',
        ),
      );
  }, [overview?.mode, session]);

  if (overview?.mode === 'dry-run') return <Navigate replace to="/" />;
  if (!reports && !error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="reports-page pb-12">
      <header className="reports-header">
        <p className="eyebrow">Assessment archive</p>
        <h1>測定ごとの、学びの記録。</h1>
        <p>
          スコアだけでなく、25問の回答と次に取り組む内容をいつでも振り返れます。
        </p>
      </header>
      {error && <div className="error-banner mt-6">{error}</div>}
      {reports?.length === 0 ? (
        <section className="panel-card mt-6 text-center">
          <h2 className="text-2xl font-black">
            まだ詳細フィードバックはありません
          </h2>
          <p className="mt-3 font-bold text-teal-700">
            測定後の分析が完了すると、ここに追加されます。
          </p>
        </section>
      ) : (
        <div className="report-list mt-7">
          {reports?.map((report, index) => (
            <Link
              className="report-ticket"
              key={report.id}
              to={`/reports/${report.id}`}
            >
              <span className="report-ticket-index">
                #{String(reports.length - index).padStart(2, '0')}
              </span>
              <div>
                <p className="eyebrow">
                  {new Date(report.createdAt).toLocaleDateString('ja-JP')}
                </p>
                <h2>
                  {report.estimatedCefr} · {report.correct}/{report.total}
                </h2>
                <p>{report.executiveSummaryJa}</p>
              </div>
              <span className="report-ticket-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
