import { Navigate, Link } from 'react-router';
import type { CSSProperties } from 'react';
import type { AssessmentState } from '@shared/assessment/contracts';
import type {
  VocabularyCount,
  VocabularyOverview,
} from '@shared/vocabulary/contracts';
import { Spinner } from '@/components/ui/Spinner';
import { NavigationIcon } from '@/components/ui/NavigationIcon';
import { useAssessment } from '@/features/assessment';
import { useAuth } from '@/features/auth';
import { useLearning } from '@/features/learning';
import { useVocabulary } from '@/features/vocabulary';

export function Dashboard() {
  const { user } = useAuth();
  const { state, mode, isLoading, error, refresh } = useAssessment();
  const {
    overview,
    error: learningError,
    isSaving: isRetryingAnalysis,
    retryAnalysis,
  } = useLearning();
  const { overview: vocabularyOverview, isLoading: isVocabularyLoading } =
    useVocabulary();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!state || error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-center">
        <div className="result-card">
          <h1 className="text-2xl font-black text-teal-950">
            学習データを読み込めませんでした
          </h1>
          <p className="mt-3 font-medium text-teal-700">{error}</p>
          <button className="primary-link mt-6" onClick={() => void refresh()}>
            もう一度読み込む
          </button>
        </div>
      </div>
    );
  }
  const firstName =
    user?.user_metadata.full_name?.split(' ')[0] ??
    user?.email?.split('@')[0] ??
    'Learner';

  if (mode === 'dry-run') {
    if (state.status === 'not_started') {
      return <Navigate replace to="/assessment/profile" />;
    }
    if (state.status !== 'completed') {
      return <Navigate replace to="/assessment" />;
    }
    return <DryRunDashboard firstName={firstName} state={state} />;
  }

  if (state.status === 'not_started') {
    return <Navigate replace to="/assessment/profile" />;
  }
  if (
    state.status === 'answering' ||
    state.status === 'generating' ||
    state.status === 'failed'
  ) {
    return <Navigate replace to="/assessment" />;
  }

  return (
    <div className="space-y-7 pb-12 sm:space-y-9">
      <section className="dashboard-hero">
        <div className="relative z-10">
          <p className="eyebrow text-teal-900">Welcome back</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-teal-950 sm:text-5xl">
            {firstName}さん、今日も
            <br className="hidden sm:block" /> 一歩だけ進もう。
          </h1>
          <p className="mt-4 max-w-xl font-bold leading-7 text-teal-800">
            小さな積み重ねが、使える英語に変わります。次の学習メニューはここに追加されます。
          </p>
        </div>
        <div
          className="level-orbit"
          aria-label={`現在のCEFRレベル ${state.estimatedCefr}`}
        >
          <span>NOW</span>
          <strong>{state.estimatedCefr}</strong>
          <small>CEFR</small>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="panel-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Level map</p>
              <h2 className="mt-2 text-2xl font-black text-teal-950">
                現在地から目標まで
              </h2>
            </div>
            <span className="status-sticker">測定済み</span>
          </div>
          <div className="level-track mt-8">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
              <div
                className={
                  level === state.estimatedCefr
                    ? 'level-node active'
                    : 'level-node'
                }
                key={level}
              >
                <span>{level}</span>
              </div>
            ))}
          </div>
          <p className="mt-7 text-sm font-bold leading-6 text-teal-700">
            目標レベルと必要語彙数は、次のステップで設定できるようにします。
          </p>
        </div>

        <div className="panel-card bg-yellow-200">
          <p className="eyebrow">Assessment</p>
          <p className="mt-5 text-5xl font-black tracking-tight text-teal-950">
            {state.correct}
            <span className="text-2xl text-teal-700"> / {state.total}</span>
          </p>
          <p className="mt-2 font-black text-teal-900">レベル測定の正解数</p>
          <Link className="secondary-link mt-7" to="/assessment">
            測定結果を見る
          </Link>
        </div>
      </section>

      <VocabularyProgressCard
        isLoading={isVocabularyLoading}
        overview={vocabularyOverview}
      />

      <section className="home-feedback-section">
        <div className="home-feedback-heading">
          <div>
            <p className="eyebrow">Your learning record</p>
            <h2>フィードバック</h2>
          </div>
          <Link className="feedback-archive-link" to="/reports">
            <NavigationIcon name="feedback" />
            <span>これまでの記録</span>
            <b aria-hidden="true">→</b>
          </Link>
        </div>
        <AnalysisCard
          error={learningError}
          isRetrying={isRetryingAnalysis}
          overview={overview}
          onRetry={() => void retryAnalysis().catch(() => undefined)}
        />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Coming next</p>
            <h2 className="mt-2 text-2xl font-black text-teal-950">
              続けたくなる仕組み
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FutureCard icon="●" title="ログインスタンプ" color="bg-coral-200" />
          <FutureCard icon="↗" title="昨日との成長比較" color="bg-sky-200" />
          <FutureCard icon="Aa" title="覚えた単語・熟語" color="bg-green-200" />
        </div>
      </section>
    </div>
  );
}

function VocabularyProgressCard({
  overview,
  isLoading,
}: {
  overview: VocabularyOverview | null;
  isLoading: boolean;
}) {
  const total = (overview?.words.total ?? 0) + (overview?.idioms.total ?? 0);
  const classified =
    (overview?.words.classified ?? 0) + (overview?.idioms.classified ?? 0);
  const progress = total === 0 ? 0 : Math.round((classified / total) * 100);
  const ratingTotals = overview
    ? [
        {
          label: '完璧',
          value: overview.words.mastered + overview.idioms.mastered,
          className: 'rating-mastered',
        },
        {
          label: '覚えている',
          value: overview.words.mostlyKnown + overview.idioms.mostlyKnown,
          className: 'rating-mostly-known',
        },
        {
          label: '少し曖昧',
          value: overview.words.mostlyUnknown + overview.idioms.mostlyUnknown,
          className: 'rating-mostly-unknown',
        },
        {
          label: '分からない',
          value: overview.words.unknown + overview.idioms.unknown,
          className: 'rating-unknown',
        },
      ]
    : [];

  return (
    <section className="vocabulary-progress-card">
      <div className="vocabulary-progress-heading">
        <div>
          <p className="eyebrow">Vocabulary pulse</p>
          <h2>単語・熟語の現在地</h2>
          <p>
            {isLoading
              ? '進捗を読み込んでいます…'
              : total === 0
                ? 'カードデータを準備しています。'
                : `${classified.toLocaleString()} / ${total.toLocaleString()}件を分類しました。`}
          </p>
        </div>
        <div
          className="vocabulary-progress-ring"
          style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}
        >
          <strong>{progress}%</strong>
          <small>CHECKED</small>
        </div>
      </div>

      {overview && total > 0 && (
        <>
          <div className="vocabulary-source-progress">
            <VocabularySourceRow count={overview.words} label="単語" />
            <VocabularySourceRow count={overview.idioms} label="熟語" />
          </div>
          <div className="vocabulary-rating-summary">
            {ratingTotals.map((rating) => (
              <div className={rating.className} key={rating.label}>
                <small>{rating.label}</small>
                <strong>{rating.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      <Link className="vocabulary-progress-link" to="/study/vocabulary">
        習熟度チェックを開く <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function VocabularySourceRow({
  label,
  count,
}: {
  label: string;
  count: VocabularyCount;
}) {
  const progress =
    count.total === 0 ? 0 : (count.classified / count.total) * 100;
  return (
    <div className="vocabulary-source-row">
      <div>
        <strong>{label}</strong>
        <span>
          {count.classified.toLocaleString()} / {count.total.toLocaleString()}
        </span>
      </div>
      <div aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function DryRunDashboard({
  firstName,
  state,
}: {
  firstName: string;
  state: Extract<AssessmentState, { status: 'completed' }>;
}) {
  return (
    <div className="space-y-7 pb-12 sm:space-y-9">
      <section className="dry-run-home-hero">
        <div>
          <p className="eyebrow">Dry-run complete</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-teal-950 sm:text-5xl">
            {firstName}さん、
            <br className="hidden sm:block" /> 画面チェック完了です。
          </h1>
          <p className="mt-4 max-w-xl font-bold leading-7 text-teal-800">
            固定された25問で、保存・採点・ラウンド遷移を最後まで確認しました。この結果は通常の英語レベルには反映されていません。
          </p>
        </div>
        <div
          className="dry-run-result-seal"
          aria-label={`Dry-run推定 ${state.estimatedCefr}`}
        >
          <span>DRY</span>
          <strong>{state.estimatedCefr}</strong>
          <small>TEST ONLY</small>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel-card dry-run-result-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Latest dry-run</p>
              <h2 className="mt-2 text-2xl font-black text-teal-950">
                専用の採点結果
              </h2>
            </div>
            <span className="dry-run-status-sticker">CEFR未反映</span>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {state.completedRounds.map((round) => (
              <div className="score-chip" key={round.round}>
                <span>Round {round.round}</span>
                <strong>
                  {round.correct}/{round.total}
                </strong>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm font-bold leading-6 text-teal-700">
            「わからない」{state.unknown}
            問。回答履歴はDry-run専用領域に保存されています。
          </p>
          <p className="dry-run-analysis-note mt-4">
            Dry-runではCodex分析・フィードバック生成・プロフィール更新を行いません。
          </p>
        </div>

        <div className="panel-card bg-sky-200">
          <p className="eyebrow">Total score</p>
          <p className="mt-5 text-5xl font-black tracking-tight text-teal-950">
            {state.correct}
            <span className="text-2xl text-teal-700"> / {state.total}</span>
          </p>
          <p className="mt-2 font-black text-teal-900">固定問題の正解数</p>
          <Link className="primary-link mt-7" to="/assessment/profile">
            Dry-runをもう一度始める
          </Link>
        </div>
      </section>
    </div>
  );
}

function AnalysisCard({
  overview,
  error,
  isRetrying,
  onRetry,
}: {
  overview: ReturnType<typeof useLearning>['overview'];
  error: string | null;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const status = overview?.analysisStatus;
  const latestReport = overview?.latestReport;
  if (status === 'ready' && latestReport) {
    return (
      <section className="analysis-status-card analysis-ready">
        <div className="analysis-status-mark" aria-hidden="true">
          ✓
        </div>
        <div>
          <p className="eyebrow">Detailed feedback ready</p>
          <h2>25問から見つかった、次の一歩。</h2>
          <p>{latestReport.executiveSummaryJa}</p>
        </div>
        <Link className="primary-link" to={`/reports/${latestReport.id}`}>
          詳細フィードバックを見る
        </Link>
      </section>
    );
  }
  if (status === 'pending' || status === 'running') {
    return (
      <section
        className="analysis-status-card analysis-working"
        aria-live="polite"
      >
        <div className="analysis-pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <p className="eyebrow">Your AI is reading</p>
          <h2>専属AIが、25問を詳しく分析中です。</h2>
          <p>
            ホームを離れても大丈夫です。分析が終わると、ここから詳細を開けます。
          </p>
        </div>
      </section>
    );
  }
  if (status === 'failed') {
    return (
      <section className="analysis-status-card analysis-failed">
        <div>
          <p className="eyebrow">Analysis paused</p>
          <h2>スコアは保存済みです。詳細分析だけ再開できます。</h2>
          <p>{overview?.analysisMessage ?? error}</p>
        </div>
        <button
          className="secondary-link"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? '再開中…' : '詳細分析を再試行'}
        </button>
      </section>
    );
  }
  return null;
}

function FutureCard({
  icon,
  title,
  color,
}: {
  icon: string;
  title: string;
  color: string;
}) {
  return (
    <div className={`future-card ${color}`}>
      <span className="future-icon">{icon}</span>
      <h3>{title}</h3>
      <p>次の機能として実装予定</p>
    </div>
  );
}
