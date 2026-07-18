import type { AssessmentActivity } from '../AssessmentContext';

const copy = {
  starting: {
    eyebrow: 'Building your level check',
    title: 'あなたに合う問題を、\nじっくり選んでいます。',
    detail:
      '最初の10問を、自己紹介・英検・TOEICを手がかりに組み立てています。数分かかることがあります。ずっと見ていなくて大丈夫です。あとでこの画面に戻ってきてください。',
    note: 'このタブを閉じても、MacでAIサーバーが動いていれば生成は続きます。',
    accent: 'processing-coral',
  },
  adapting: {
    eyebrow: 'Tuning the next round',
    title: '答えの輪郭から、\n次の問題を調整中。',
    detail:
      'ここまでの正解・不正解・「わからない」を読み取り、次のラウンドを今のレベル付近に絞っています。数分後に戻ってきても大丈夫です。',
    note: '難しすぎず、簡単すぎない境目を探しています。',
    accent: 'processing-sky',
  },
  finalizing: {
    eyebrow: 'Measuring your level',
    title: '25問をまとめて、\n現在地を測っています。',
    detail:
      '問題の作成は完了しました。3ラウンドの回答を重みづけして、現在のCEFRレベルとカテゴリ別の結果を計算しています。',
    note: 'もうすぐ測定結果を表示します。',
    accent: 'processing-yellow',
  },
} as const;

export function AssessmentProcessing({
  mode,
  onRetry,
}: {
  mode: Exclude<AssessmentActivity, null>;
  onRetry?: () => void;
}) {
  const content = copy[mode];

  return (
    <div className="processing-stage">
      <section className={`processing-card ${content.accent}`}>
        <div className="processing-illustration" aria-hidden="true">
          <svg viewBox="0 0 320 250" role="img">
            <path
              className="processing-orbit-line"
              d="M48 119c8-62 69-94 132-82 65 13 103 64 86 118-16 51-79 76-138 58-57-18-87-53-80-94Z"
            />
            <g className="processing-tile processing-tile-a">
              <rect x="35" y="63" width="62" height="52" rx="15" />
              <text x="66" y="97" textAnchor="middle">A</text>
            </g>
            <g className="processing-tile processing-tile-b">
              <rect x="220" y="45" width="66" height="54" rx="16" />
              <text x="253" y="80" textAnchor="middle">B</text>
            </g>
            <g className="processing-tile processing-tile-c">
              <rect x="224" y="170" width="62" height="52" rx="15" />
              <text x="255" y="204" textAnchor="middle">C</text>
            </g>
            <g className="processing-book">
              <path d="M74 126c30-13 58-8 86 13v73c-27-18-55-23-86-11v-75Z" />
              <path d="M246 126c-30-13-58-8-86 13v73c27-18 55-23 86-11v-75Z" />
              <path className="processing-book-spine" d="M160 139v73" />
              <path className="processing-book-line" d="M91 151c19-5 36-2 52 7" />
              <path className="processing-book-line" d="M177 158c16-9 33-12 52-7" />
              <path className="processing-book-line" d="M91 174c19-5 36-2 52 7" />
              <path className="processing-book-line" d="M177 181c16-9 33-12 52-7" />
            </g>
            <g className="processing-spark processing-spark-one">
              <path d="M151 66v22M140 77h22" />
            </g>
            <g className="processing-spark processing-spark-two">
              <path d="M113 41v13M106.5 47.5h13" />
            </g>
          </svg>
        </div>

        <div className="processing-copy">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{renderLines(content.title)}</h1>
          <p className="processing-detail">{content.detail}</p>
          <div className="processing-note">
            <span className="processing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{content.note}</span>
          </div>
          {onRetry && (
            <button className="processing-retry" onClick={onRetry} type="button">
              90秒以上変わらない場合は再開する
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function renderLines(value: string) {
  const [first, second] = value.split('\n');
  return (
    <>
      {first}
      {second && (
        <>
          <br />
          {second}
        </>
      )}
    </>
  );
}
