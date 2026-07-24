import { Link } from 'react-router';
import {
  StudyHeroIllustration,
  VocabularyDeckIllustration,
} from '@/features/vocabulary/components/VocabularyIllustrations';

export function Study() {
  return (
    <div className="study-page pb-12">
      <header className="study-header">
        <div>
          <h1>今日は、何を学ぼう？</h1>
          <p>やりたい学習をひとつ選んで、短い一歩から始めましょう。</p>
        </div>
        <div className="study-header-tiles">
          <StudyHeroIllustration />
        </div>
      </header>

      <section className="study-library" aria-labelledby="study-library-title">
        <div className="study-section-heading">
          <div>
            <h2 id="study-library-title">学習メニュー</h2>
          </div>
          <p>今後、並び替えや長文問題もここに追加します。</p>
        </div>

        <div className="study-menu-grid">
          <Link className="study-feature-card" to="/study/vocabulary">
            <div className="vocabulary-deck">
              <VocabularyDeckIllustration />
            </div>
            <div className="study-feature-copy">
              <h2>単語・熟語帳</h2>
              <p>
                習熟度チェック、暗記、問題から、今日の取り組み方を選べます。
              </p>
              <span className="study-feature-action">
                メニューを開く <b aria-hidden="true">→</b>
              </span>
            </div>
          </Link>

          <div
            className="study-future-stack"
            aria-label="今後追加する学習メニュー"
          >
            <div className="study-future-item">
              <span aria-hidden="true">↕</span>
              <div>
                <strong>並び替え問題</strong>
                <small>このあと追加予定</small>
              </div>
            </div>
            <div className="study-future-item">
              <span aria-hidden="true">¶</span>
              <div>
                <strong>長文問題</strong>
                <small>このあと追加予定</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
