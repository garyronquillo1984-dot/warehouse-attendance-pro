import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { addDays, todayIso } from '../lib/dates';
import { parseIdukayText, type ParsedTask } from '../lib/parser/idukay';
import { CSV_TEMPLATE, csvSource } from '../lib/csv';
import type { TaskInput } from '../lib/types';
import { TaskForm } from '../components/TaskForm';
import { Empty, Field, useToast } from '../components/ui';

type Draft = ParsedTask & { include: boolean };

// The review step shared by "paste from Idukay" and CSV import: nothing is saved until the
// parent confirms, and every field can be corrected first.
export function ReviewDrafts({ drafts, setDrafts, source, onSaved }: {
  drafts: Draft[]; setDrafts: (d: Draft[]) => void; source: 'paste' | 'import'; onSaved: (n: number) => void;
}) {
  const fam = useFamily();
  const { t } = useT();
  const [defaultDate, setDefaultDate] = useState(addDays(todayIso(), 1));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kids = fam.activeChildren;
  const included = drafts.filter(d => d.include);
  const update = (key: string, patch: Partial<Draft>) => setDrafts(drafts.map(d => (d.key === key ? { ...d, ...patch } : d)));

  const save = async () => {
    if (included.some(d => !d.childId)) { setErr(t.add.needChild); return; }
    if (included.some(d => !d.subject.trim())) { setErr(t.add.needSubject); return; }
    setErr(null); setBusy(true);
    const rows: TaskInput[] = included.map(d => ({
      child_id: d.childId!, subject: d.subject.trim(), title: d.title.trim(), description: d.description,
      due_date: d.dueDate || defaultDate || null, teacher: d.teacher, priority: d.priority, source,
    }));
    const n = await fam.createTasks(rows);
    setBusy(false);
    if (n) onSaved(n); else setErr(t.common.error);
  };

  return (
    <div className="stack">
      <h3>{t.add.review(included.length)}</h3>
      <div className="grid-2">
        {kids.length > 1 && (
          <Field label={t.add.setAllChild}>
            <select defaultValue="" onChange={e => e.target.value && setDrafts(drafts.map(d => ({ ...d, childId: e.target.value })))}>
              <option value="">—</option>
              {kids.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {drafts.some(d => !d.dueDate) && (
          <Field label={t.add.defaultDate}><input type="date" value={defaultDate} onChange={e => setDefaultDate(e.target.value)} /></Field>
        )}
      </div>
      <div className="card" data-testid="review">
        {drafts.map(d => (
          <div key={d.key} className={`review-row${d.include ? '' : ' off'}`}>
            <input type="checkbox" checked={d.include} aria-label={t.add.include} onChange={e => update(d.key, { include: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
            <div className="review-fields">
              <input className="wide" value={d.title} aria-label={t.task.title} onChange={e => update(d.key, { title: e.target.value })} maxLength={200} />
              <input className="wide" value={d.subject} aria-label={t.task.subject} placeholder={t.task.subject} list="subject-list" onChange={e => update(d.key, { subject: e.target.value })} maxLength={80} />
              <input type="date" value={d.dueDate ?? ''} aria-label={t.task.dueDate} onChange={e => update(d.key, { dueDate: e.target.value || null })} />
              {kids.length > 1 && (
                <select value={d.childId ?? ''} aria-label={t.task.child} onChange={e => update(d.key, { childId: e.target.value || null })}>
                  <option value="">{t.task.chooseChild}</option>
                  {kids.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select value={d.priority} aria-label={t.task.priority} onChange={e => update(d.key, { priority: e.target.value as Draft['priority'] })}>
                {(['low', 'normal', 'high'] as const).map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
              </select>
              {(d.description || d.teacher || d.warnings.length > 0) && (
                <div className="wide small muted">
                  {d.teacher && <span>👩‍🏫 {d.teacher} </span>}
                  {d.description && <span>· {d.description.slice(0, 120)}{d.description.length > 120 ? '…' : ''} </span>}
                  {!d.dueDate && <span className="warn">· {t.add.warnNoDate} </span>}
                  {!d.subject.trim() && <span className="warn">· {t.add.warnNoSubject} </span>}
                  {d.dueDate && d.dueDate < todayIso() && <span className="warn">· {t.add.warnPast}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <datalist id="subject-list">{fam.subjects.map(s => <option key={s} value={s} />)}</datalist>
      {err && <div className="form-error" role="alert">{err}</div>}
      <button type="button" className="btn big" disabled={busy || !included.length} onClick={save}>{busy ? t.common.saving : t.add.saveN(included.length)}</button>
    </div>
  );
}

export function PasteBox({ onSaved, compact }: { onSaved: (n: number) => void; compact?: boolean }) {
  const fam = useFamily();
  const { t } = useT();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const organize = () => {
    const parsed = parseIdukayText(text, {
      today: todayIso(), children: fam.activeChildren, knownSubjects: fam.subjects,
      defaultChildId: fam.selected !== 'all' ? fam.selected : null,
    });
    setDrafts(parsed.map(p => ({ ...p, include: true })));
    void supabase.rpc('track_event', { p_event: 'paste_parsed' });
  };
  if (drafts && drafts.length) return <ReviewDrafts drafts={drafts} setDrafts={setDrafts} source="paste" onSaved={n => { setDrafts(null); setText(''); onSaved(n); }} />;
  return (
    <div className="stack">
      {!compact && <><h2>{t.add.pasteTitle}</h2><p className="muted">{t.add.pasteHelp}</p></>}
      <textarea className="input" style={{ minHeight: 180, lineHeight: 1.5 }} value={text} onChange={e => setText(e.target.value)}
        placeholder={t.add.pastePh} aria-label={t.add.pasteTitle} data-testid="paste-input" />
      {drafts && drafts.length === 0 && <div className="form-error" role="alert">{t.add.nothingFound}</div>}
      <button type="button" className="btn big" disabled={!text.trim()} onClick={organize}>✨ {t.add.organize}</button>
      <p className="small faint">🔒 {t.add.privacyNote} {t.add.noIdukayPassword}</p>
    </div>
  );
}

function ImportBox({ onSaved }: { onSaved: (n: number) => void }) {
  const fam = useFamily();
  const { t } = useT();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const out = csvSource(todayIso(), fam.activeChildren).toDrafts(text) as ParsedTask[];
      setDrafts(out.map(p => ({ ...p, include: true })));
      setErr(out.length ? null : t.add.badFile);
    } catch { setErr(t.add.badFile); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tasks-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (drafts && drafts.length) return <ReviewDrafts drafts={drafts} setDrafts={setDrafts} source="import" onSaved={n => { setDrafts(null); onSaved(n); }} />;
  return (
    <div className="stack">
      <p className="muted">{t.add.importHelp}</p>
      <label className="btn secondary" style={{ position: 'relative' }}>
        {t.add.chooseFile}
        <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
      <button type="button" className="btn ghost" onClick={template}>{t.add.template}</button>
      {err && <div className="form-error" role="alert">{err}</div>}
    </div>
  );
}

export function AddTaskPage() {
  const fam = useFamily();
  const { t } = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'manual' | 'paste' | 'import' | null) ?? 'paste';
  const done = (n: number) => { toast(t.task.created_n(n)); nav('/app'); };
  if (!fam.loading && fam.activeChildren.length === 0) {
    return <Empty icon="👧" action={<button className="btn" onClick={() => nav('/app/children')}>{t.dashboard.addChild}</button>}>{t.dashboard.noChildren}</Empty>;
  }
  return (
    <div className="stack">
      <h1>{t.add.title}</h1>
      <div className="tabs" role="tablist">
        {(['paste', 'manual', 'import'] as const).map(k => (
          <button type="button" role="tab" key={k} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>
            {k === 'paste' ? t.add.paste : k === 'manual' ? t.add.manual : t.add.import}
          </button>
        ))}
      </div>
      <div className="card card-pad">
        {tab === 'paste' && <PasteBox onSaved={done} />}
        {tab === 'manual' && <TaskForm onSaved={() => done(1)} />}
        {tab === 'import' && <ImportBox onSaved={done} />}
      </div>
      <p className="small faint">{t.common.sourceNote}</p>
    </div>
  );
}
