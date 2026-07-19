import { Link, Navigate, useParams } from 'react-router';
import {
  findVocabularyActivity,
  isVocabularyScope,
  vocabularyScopeLabels,
} from '@/features/vocabulary';

export function VocabularySetup() {
  const { activity: activityParam, scope: scopeParam } = useParams();
  const activity = findVocabularyActivity(activityParam);

  if (
    !activity ||
    activity.key === 'check' ||
    !isVocabularyScope(scopeParam) ||
    !activity.scopes.includes(scopeParam)
  ) {
    return <Navigate replace to="/study/vocabulary" />;
  }

  return (
    <div className="vocabulary-setup-page pb-12">
      <Link className="page-back-link" to="/study/vocabulary">
        <span aria-hidden="true">←</span> 単語・熟語帳
      </Link>

      <section className={`setup-placeholder vocabulary-tone-${activity.tone}`}>
        <div className="setup-choice-summary">
          <span>{activity.label}</span>
          <b aria-hidden="true">×</b>
          <span>{vocabularyScopeLabels[scopeParam]}</span>
        </div>
        <div className="setup-placeholder-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">Next step</p>
        <h1>ここで、学び方を細かく選びます。</h1>
        <p className="setup-placeholder-copy">
          出題範囲、件数、難易度などの設定を、次の実装でこのページに追加します。
        </p>
        <span className="placeholder-status">画面を準備中</span>
      </section>
    </div>
  );
}
