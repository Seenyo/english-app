import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { eikenGrades } from '@shared/assessment/contracts';
import type { PersonaUserAuthored } from '@shared/learning/contracts';
import { Spinner } from '@/components/ui/Spinner';
import { useLearning } from '@/features/learning';

export function Persona() {
  const { overview, isLoading, isSaving, error, savePersona } = useLearning();
  const persona = overview?.persona ?? null;
  const [draft, setDraft] = useState<PersonaUserAuthored | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (persona) setDraft(persona.userAuthored);
  }, [persona]);

  if (overview?.mode === 'dry-run') return <Navigate replace to="/" />;
  if (isLoading || !draft || !persona) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !persona) return;
    try {
      await savePersona(persona.version, draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      // The provider displays the localized validation or version-conflict error.
    }
  }

  return (
    <div className="persona-page space-y-6 pb-12">
      <section className="persona-passport-hero">
        <div>
          <p className="eyebrow">Learning passport · v{persona.version}</p>
          <h1>あなたを知るほど、学び方は変わる。</h1>
          <p>
            目標やモチベーションはあなたが更新できます。測定結果と学習記録は、アプリが根拠と一緒に育てます。
          </p>
        </div>
        <div
          className="persona-passport-stamp"
          aria-label={`現在のCEFR ${persona.metrics.currentCefr ?? '未測定'}`}
        >
          <span>CURRENT</span>
          <strong>{persona.metrics.currentCefr ?? '—'}</strong>
          <small>CEFR</small>
        </div>
      </section>

      <form className="persona-editor" onSubmit={(event) => void submit(event)}>
        <section className="panel-card persona-editable-card">
          <div className="persona-section-heading">
            <div>
              <p className="eyebrow">Written by you</p>
              <h2>自分で書き換えられること</h2>
            </div>
            <span className="editable-sticker">EDITABLE</span>
          </div>

          <PersonaTextarea
            label="現在の自己評価"
            minLength={20}
            required
            value={draft.currentSelfDescription}
            onChange={(value) =>
              setDraft({ ...draft, currentSelfDescription: value })
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            <PersonaTextarea
              label="短期目標"
              rows={4}
              value={draft.goals.shortTerm}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  goals: { ...draft.goals, shortTerm: value },
                })
              }
            />
            <PersonaTextarea
              label="中期目標"
              rows={4}
              value={draft.goals.mediumTerm}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  goals: { ...draft.goals, mediumTerm: value },
                })
              }
            />
            <PersonaTextarea
              label="長期目標"
              rows={4}
              value={draft.goals.longTerm}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  goals: { ...draft.goals, longTerm: value },
                })
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PersonaTextarea
              label="モチベーション"
              rows={4}
              value={draft.motivation}
              onChange={(value) => setDraft({ ...draft, motivation: value })}
            />
            <PersonaTextarea
              label="学習目的"
              rows={4}
              value={draft.studyPurpose}
              onChange={(value) => setDraft({ ...draft, studyPurpose: value })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PersonaListInput
              label="興味のあるテーマ"
              value={draft.interests}
              onChange={(value) => setDraft({ ...draft, interests: value })}
            />
            <label className="form-field">
              <span className="form-label">1日に使える時間（分）</span>
              <input
                className="text-input"
                min={0}
                max={1440}
                type="number"
                value={draft.dailyStudyMinutes ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dailyStudyMinutes:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <PersonaListInput
              label="好きな学習方法"
              value={draft.preferredMethods}
              onChange={(value) =>
                setDraft({ ...draft, preferredMethods: value })
              }
            />
            <PersonaListInput
              label="苦手な学習方法"
              value={draft.difficultMethods}
              onChange={(value) =>
                setDraft({ ...draft, difficultMethods: value })
              }
            />
            <label className="form-field">
              <span className="form-label">英検（任意）</span>
              <select
                className="text-input"
                value={draft.eikenGrade ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    eikenGrade:
                      event.target.value === ''
                        ? null
                        : (event.target
                            .value as PersonaUserAuthored['eikenGrade']),
                  })
                }
              >
                <option value="">未入力</option>
                {eikenGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {formatEiken(grade)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">TOEIC（任意）</span>
              <input
                className="text-input"
                min={10}
                max={990}
                step={5}
                type="number"
                value={draft.toeicScore ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    toeicScore:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <PersonaTextarea
            label="AI分析への補足・訂正"
            rows={3}
            value={draft.correctionNote}
            onChange={(value) => setDraft({ ...draft, correctionNote: value })}
          />
          {error && <p className="error-banner">{error}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <button className="primary-link" disabled={isSaving} type="submit">
              {isSaving ? '保存中…' : '変更を保存する'}
            </button>
            {saved && <span className="save-confirmation">保存しました</span>}
          </div>
        </section>
      </form>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel-card persona-readonly-card">
          <p className="eyebrow">Observed by AI</p>
          <h2>回答から見つかった傾向</h2>
          {persona.aiInferred.summaryJa ? (
            <>
              <p className="persona-summary">{persona.aiInferred.summaryJa}</p>
              <PersonaBulletGroup
                title="強み"
                items={persona.aiInferred.strengths}
              />
              <PersonaBulletGroup
                title="優先課題"
                items={persona.aiInferred.weaknesses}
              />
              <PersonaBulletGroup
                title="おすすめの重点項目"
                items={persona.aiInferred.recommendedFocus}
              />
            </>
          ) : (
            <p className="persona-empty-copy">
              詳細分析が完了すると、ここに強みや学習傾向が追加されます。
            </p>
          )}
        </div>
        <div className="panel-card persona-system-card">
          <p className="eyebrow">Measured by the app</p>
          <h2>変更できない学習記録</h2>
          <dl className="persona-metric-list">
            <Metric
              label="完了した測定"
              value={`${persona.metrics.assessmentsCompleted}回`}
            />
            <Metric
              label="回答した測定問題"
              value={`${persona.metrics.assessmentQuestionsAnswered}問`}
            />
            <Metric
              label="覚えた単語"
              value={`${persona.metrics.learnedWords}語`}
            />
            <Metric
              label="最終測定"
              value={formatDate(persona.metrics.lastAssessedAt)}
            />
            <Metric label="Persona更新" value={formatDate(persona.updatedAt)} />
          </dl>
        </div>
      </section>

      <section className="initial-note-card">
        <p className="eyebrow">First note · archived</p>
        <h2>最初に書いた自己評価</h2>
        <p>{persona.initialSelfAssessment}</p>
      </section>
    </div>
  );
}

function PersonaTextarea({
  label,
  value,
  onChange,
  rows = 5,
  minLength,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <textarea
        className="text-area"
        maxLength={4000}
        minLength={minLength}
        required={required}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PersonaListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        className="text-input"
        placeholder="カンマ区切りで入力"
        value={value.join(', ')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  );
}

function PersonaBulletGroup({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="persona-bullet-group">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ja-JP') : 'まだありません';
}

function formatEiken(grade: (typeof eikenGrades)[number]) {
  return `英検${grade.replace('pre-', '準')}級`;
}
