import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { eikenGrades, type LearnerProfile } from '@shared/assessment/contracts';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAssessment } from '@/features/assessment';

const eikenLabels: Record<(typeof eikenGrades)[number], string> = {
  '5': '5級',
  '4': '4級',
  '3': '3級',
  'pre-2': '準2級',
  '2': '2級',
  'pre-1': '準1級',
  '1': '1級',
};

export function AssessmentProfile() {
  const navigate = useNavigate();
  const { state, isLoading, isWorking, error, start } = useAssessment();
  const [selfAssessment, setSelfAssessment] = useState('');
  const [eikenGrade, setEikenGrade] = useState('');
  const [toeicScore, setToeicScore] = useState('');

  if (isLoading) return <CenteredSpinner />;
  if (state && state.status !== 'not_started') {
    return <Navigate replace to="/assessment" />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const profile: LearnerProfile = {
      selfAssessment: selfAssessment.trim(),
      eikenGrade: eikenGrade
        ? (eikenGrade as LearnerProfile['eikenGrade'])
        : null,
      toeicScore: toeicScore ? Number(toeicScore) : null,
    };
    try {
      const startRequest = start(profile);
      navigate('/assessment', { replace: true });
      await startRequest;
    } catch {
      navigate('/assessment/profile', { replace: true });
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-10">
      <section className="lg:sticky lg:top-24">
        <p className="eyebrow">First step</p>
        <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight text-teal-950 sm:text-5xl">
          今の英語を、
          <span className="text-coral-600">言葉にする。</span>
        </h1>
        <p className="mt-5 max-w-md text-base font-medium leading-7 text-teal-800">
          ここで詳しく書くほど、最初の10問をあなたに合った難易度から始められます。日本語でも英語でも構いません。
        </p>
        <div className="mt-8 hidden rounded-[2rem] border-3 border-teal-950 bg-sky-200 p-6 shadow-[6px_6px_0_#173a3f] lg:block">
          <p className="font-utility text-xs font-black tracking-widest text-teal-800 uppercase">
            25 questions
          </p>
          <p className="mt-2 text-xl font-black text-teal-950">
            10問 → 10問 → 5問
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-teal-700">
            単語・熟語・文法を、回答に合わせて少しずつ絞り込みます。
          </p>
        </div>
      </section>

      <form className="form-card" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">自分で感じている英語レベル</span>
          <span className="form-help">
            読む・聞く・話す場面、得意なこと、困ることなどを自由に書いてください。
          </span>
          <textarea
            autoFocus
            maxLength={4000}
            minLength={20}
            onChange={(event) => setSelfAssessment(event.target.value)}
            placeholder="例：技術記事は読めますが、日常会話では熟語がすぐに出てきません。海外ドラマは英語字幕があれば半分ほど理解できます…"
            required
            rows={8}
            value={selfAssessment}
          />
          <span className="self-end font-utility text-xs font-bold text-teal-600">
            {selfAssessment.length} / 4000
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="form-field">
            <span className="form-label">
              英検 <span className="optional-label">任意</span>
            </span>
            <select
              onChange={(event) => setEikenGrade(event.target.value)}
              value={eikenGrade}
            >
              <option value="">選択しない</option>
              {eikenGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {eikenLabels[grade]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">
              TOEIC <span className="optional-label">任意</span>
            </span>
            <input
              inputMode="numeric"
              max={990}
              min={10}
              onChange={(event) => setToeicScore(event.target.value)}
              placeholder="例：750"
              type="number"
              value={toeicScore}
            />
          </label>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <Button
          className="h-14 w-full text-base sm:w-auto sm:min-w-56"
          disabled={isWorking || selfAssessment.trim().length < 20}
          type="submit"
        >
          {isWorking ? (
            <>
              <Spinner className="h-5 w-5 border-2" /> 最初の10問を作成中
            </>
          ) : (
            'レベル測定を始める →'
          )}
        </Button>
      </form>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
