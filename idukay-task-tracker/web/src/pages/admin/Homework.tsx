import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/i18n';
import { addDays, fmtDate, fmtDateTime } from '../../lib/dates';
import { parseIdukayText, type ParsedTask } from '../../lib/parser/idukay';
import { CSV_TEMPLATE, csvSource } from '../../lib/csv';
import type { Lang } from '../../lib/types';
import { useAdmin } from '../../components/AdminShell';
import { LanguageBadge } from '../../components/Homework';
import { Empty, Field, Spinner, useToast } from '../../components/ui';

interface Subject { id: string; name: string; language: Lang; emoji: string | null; sort_order: number }
interface Row {
  id: string; subject: string; title: string; instructions: string | null; parent_explanation: string | null; language: Lang;
  start_date: string; due_date: string; teacher: string | null; notes: string | null; attachments: Array<{ name: string; url?: string }>;
  source: string; revision: number; withdrawn_at: string | null; withdrawn_reason: string | null; created_at: string; updated_at: string;
}
const COLS = 'id, subject, title, instructions, parent_explanation, language, start_date, due_date, teacher, notes, attachments, source, revision, withdrawn_at, withdrawn_reason, created_at, updated_at';

export function useSubjects(classId: string) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const load = () => supabase.from('subjects').select('id, name, language, emoji, sort_order').eq('class_id', classId).order('sort_order').order('name')
    .then(({ data }) => setSubjects((data as Subject[]) ?? []));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId]);
  return { subjects, reload: load };
}
export const langOf = (subjects: Subject[], name: string): Lang | null =>
  subjects.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase())?.language ?? null;

// ---------------------------------------------------------------------------
export function HomeworkListPage() {
  const { cls } = useAdmin();
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const filter = params.get('f') ?? 'active';
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    setRows(null);
    let query = supabase.from('homework').select(COLS).eq('class_id', cls.class_id).order('due_date', { ascending: false }).limit(500);
    if (filter === 'active') query = query.is('withdrawn_at', null).gte('due_date', cls.today);
    if (filter === 'archived') query = query.is('withdrawn_at', null).lt('due_date', cls.today);
    if (filter === 'withdrawn') query = query.not('withdrawn_at', 'is', null);
    query.then(({ data }) => setRows((data as Row[]) ?? []));
  }, [cls.class_id, cls.today, filter]);
  const shown = (rows ?? []).filter(r => !q || `${r.subject} ${r.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="spread"><h1>{t.admin.hw.list}</h1><Link className="btn" to="/admin/tareas/nueva">+ {t.admin.hw.new}</Link></div>
      <div className="row-wrap">
        {(['active', 'archived', 'withdrawn', 'all'] as const).map(f => (
          <button type="button" key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setParams({ f }, { replace: true })}>
            {f === 'active' ? t.admin.hw.filterActive : f === 'archived' ? t.admin.hw.filterArchived : f === 'withdrawn' ? t.admin.hw.filterWithdrawn : t.admin.hw.filterAll}
          </button>
        ))}
        <input className="input grow" style={{ minWidth: 160 }} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.common.search} />
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? <Empty icon="📭">—</Empty> : (
        <div className="card admin-list">
          {shown.map(r => (
            <Link key={r.id} to={`/admin/tareas/${r.id}`} className="admin-row">
              <div className="grow">
                <div className="row-wrap" style={{ gap: 6 }}><strong>{r.subject}</strong><LanguageBadge lang={r.language} />
                  {r.withdrawn_at && <span className="pill overdue">{t.admin.hw.withdrawn}</span>}{r.revision > 1 && <span className="pill neutral">v{r.revision}</span>}</div>
                <div>{r.title}</div>
              </div>
              <div className="small muted num" style={{ textAlign: 'right' }}>{fmtDate(r.start_date, t.locale)}<br />→ {fmtDate(r.due_date, t.locale)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function HomeworkEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'nueva';
  const { cls, reload } = useAdmin();
  const { t } = useT();
  const toast = useToast();
  const nav = useNavigate();
  const { subjects } = useSubjects(cls.class_id);
  const [row, setRow] = useState<Row | null>(null);
  const [revisions, setRevisions] = useState<Array<{ revision: number; data: Row; changed_at: string }>>([]);
  const [f, setF] = useState({ subject: '', title: '', instructions: '', parent_explanation: '', language: 'es' as Lang, start_date: cls.today, due_date: addDays(cls.today, 1), teacher: '', notes: '', attachments: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    supabase.from('homework').select(COLS).eq('id', id).single().then(({ data }) => {
      const r = data as Row; setRow(r);
      setF({ subject: r.subject, title: r.title, instructions: r.instructions ?? '', parent_explanation: r.parent_explanation ?? '', language: r.language,
        start_date: r.start_date, due_date: r.due_date, teacher: r.teacher ?? '', notes: r.notes ?? '',
        attachments: r.attachments.map(a => (a.url ? `${a.name} | ${a.url}` : a.name)).join('\n') });
    });
    supabase.from('homework_revisions').select('revision, data, changed_at').eq('homework_id', id).order('revision', { ascending: false })
      .then(({ data }) => setRevisions((data as typeof revisions) ?? []));
  }, [id, isNew]);

  const set = (k: keyof typeof f, v: string) => setF(x => {
    const next = { ...x, [k]: v };
    if (k === 'subject') { const l = langOf(subjects, v); if (l) next.language = l; }   // language follows the subject
    return next;
  });
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const attachments = f.attachments.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, url] = l.split('|').map(x => x.trim()); return url && /^https?:\/\//.test(url) ? { name, url } : { name };
    });
    const payload = { subject: f.subject.trim(), title: f.title.trim(), instructions: f.instructions.trim() || null, parent_explanation: f.parent_explanation.trim() || null,
      language: f.language, start_date: f.start_date, due_date: f.due_date, teacher: f.teacher.trim() || null, notes: f.notes.trim() || null, attachments };
    const { error } = isNew
      ? await supabase.from('homework').insert({ ...payload, class_id: cls.class_id, source: 'manual' })
      : await supabase.from('homework').update(payload).eq('id', id);
    setBusy(false);
    if (error) { setErr(error.code === '23505' ? 'Ya existe una tarea igual (misma materia, título y fechas).' : error.code === '23514' ? 'La fecha de entrega no puede ser anterior al inicio.' : t.common.error); return; }
    toast(t.admin.hw.saved); void reload(); nav('/admin/tareas');
  };
  const withdraw = async () => {
    const reason = prompt(t.admin.hw.withdrawReason); if (reason === null) return;
    await supabase.rpc('admin_withdraw_homework', { p_id: id, p_reason: reason }); void reload(); nav('/admin/tareas');
  };
  const restore = async () => { await supabase.rpc('admin_restore_homework', { p_id: id }); void reload(); nav('/admin/tareas'); };

  if (!isNew && !row) return <Spinner />;
  return (
    <div className="stack">
      <h1>{isNew ? t.admin.hw.new : t.admin.hw.edit}</h1>
      <form className="card card-pad stack" onSubmit={save}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="grid-2">
          <Field label={t.admin.hw.subject}><input value={f.subject} onChange={e => set('subject', e.target.value)} list="subjects" required maxLength={80} /></Field>
          <Field label={t.admin.hw.language}>
            <select value={f.language} onChange={e => set('language', e.target.value)}>
              <option value="en">{t.langNames.en}</option><option value="es">{t.langNames.es}</option><option value="other">{t.langNames.other}</option>
            </select>
          </Field>
        </div>
        <datalist id="subjects">{subjects.map(s => <option key={s.id} value={s.name} />)}</datalist>
        <p className="small faint" style={{ marginTop: -6 }}>{t.admin.hw.languageHint}</p>
        <Field label={t.admin.hw.title}><input value={f.title} onChange={e => set('title', e.target.value)} required maxLength={300} /></Field>
        <Field label={t.admin.hw.instructions} optional><textarea value={f.instructions} onChange={e => set('instructions', e.target.value)} maxLength={6000} /></Field>
        <Field label={t.admin.hw.explanation} optional><textarea value={f.parent_explanation} onChange={e => set('parent_explanation', e.target.value)} maxLength={6000} /></Field>
        <div className="grid-2">
          <Field label={t.admin.hw.start}><input type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} required /></Field>
          <Field label={t.admin.hw.due}><input type="date" value={f.due_date} min={f.start_date} onChange={e => set('due_date', e.target.value)} required /></Field>
          <Field label={t.admin.hw.teacher} optional><input value={f.teacher} onChange={e => set('teacher', e.target.value)} maxLength={120} /></Field>
          <Field label={t.admin.hw.notes} optional><input value={f.notes} onChange={e => set('notes', e.target.value)} maxLength={2000} /></Field>
        </div>
        <Field label={t.admin.hw.attachments} optional><textarea value={f.attachments} onChange={e => set('attachments', e.target.value)} style={{ minHeight: 60 }} /></Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {!isNew ? (row!.withdrawn_at
            ? <button type="button" className="btn ghost" onClick={restore}>{t.admin.hw.restore}</button>
            : <button type="button" className="btn ghost" style={{ color: 'var(--red)' }} onClick={withdraw}>{t.admin.hw.withdraw}</button>) : <span />}
          <button className="btn" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>
        </div>
      </form>
      {revisions.length > 0 && (
        <div className="card card-pad stack-sm">
          <h3>{t.admin.hw.revisions}</h3>
          {revisions.map(r => (
            <details key={r.revision}><summary>{t.admin.hw.revisionN(r.revision)} · {fmtDateTime(r.changed_at, t.locale)}</summary>
              <div className="desc small">{r.data.subject} — {r.data.title}{'\n'}{r.data.start_date} → {r.data.due_date} · {r.data.language}{r.data.instructions ? `\n\n${r.data.instructions}` : ''}</div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
type Draft = ParsedTask & { include: boolean; language: Lang; startDate: string | null };

export function AddHomeworkPage() {
  const { cls, reload } = useAdmin();
  const { t } = useT();
  const toast = useToast();
  const { subjects } = useSubjects(cls.class_id);
  const [tab, setTab] = useState<'paste' | 'csv'>('paste');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [defStart, setDefStart] = useState(cls.today);
  const [defDue, setDefDue] = useState(addDays(cls.today, 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const known = useMemo(() => subjects.map(s => s.name), [subjects]);

  const withLang = (ps: ParsedTask[]): Draft[] => ps.map(p => ({
    ...p, include: true, startDate: p.startDate,
    language: (p.language ?? langOf(subjects, p.subject) ?? (/^(science|english|language arts|spelling|reading)/i.test(p.subject) ? 'en' : 'es')) as Lang,
  }));
  const organize = () => setDrafts(withLang(parseIdukayText(text, { today: cls.today, knownSubjects: known })));
  const onFile = async (file?: File) => { if (file) setDrafts(withLang(csvSource(cls.today, []).toDrafts(await file.text()) as ParsedTask[])); };
  const upd = (k: string, p: Partial<Draft>) => setDrafts(ds => ds!.map(d => (d.key === k ? { ...d, ...p, ...(p.subject !== undefined ? { language: langOf(subjects, p.subject) ?? d.language } : {}) } : d)));

  const publish = async () => {
    const rows = drafts!.filter(d => d.include).map(d => {
      const start = d.startDate ?? defStart; let due = d.dueDate ?? defDue;
      if (due < start) due = start;
      return { subject: d.subject.trim(), title: d.title.trim(), instructions: d.description, parent_explanation: d.parentExplanation,
        language: d.language, start_date: start, due_date: due, teacher: d.teacher };
    });
    if (rows.some(r => !r.subject || !r.title)) { setErr(t.admin.hw.subject + ' / ' + t.admin.hw.title); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('admin_import_homework', { p_class: cls.class_id, p_rows: rows, p_source: tab === 'paste' ? 'idukay_paste' : 'manual' });
    setBusy(false);
    if (error) { setErr(t.common.error); return; }
    const r = data as { added: number; duplicates: number };
    toast(t.admin.add.result(r.added, r.duplicates)); setDrafts(null); setText(''); void reload();
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'homework-template.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="stack">
      <h1>{t.admin.nav.add}</h1>
      <div className="tabs">
        <button type="button" className={tab === 'paste' ? 'on' : ''} onClick={() => { setTab('paste'); setDrafts(null); }}>{t.admin.add.paste}</button>
        <button type="button" className={tab === 'csv' ? 'on' : ''} onClick={() => { setTab('csv'); setDrafts(null); }}>{t.admin.add.csv}</button>
        <Link to="/admin/tareas/nueva" className="tab-link">{t.admin.add.manual}</Link>
      </div>
      {!drafts ? (
        <div className="card card-pad stack">
          {tab === 'paste' ? <>
            <p className="muted">{t.admin.add.pasteHelp}</p>
            <textarea className="input" style={{ minHeight: 220 }} value={text} onChange={e => setText(e.target.value)} data-testid="admin-paste" />
            <button type="button" className="btn big" disabled={!text.trim()} onClick={organize}>✨ {t.admin.add.organize}</button>
          </> : <>
            <p className="muted">{t.admin.add.csvHelp}</p>
            <label className="btn secondary" style={{ position: 'relative' }}>{t.admin.add.chooseFile}
              <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} /></label>
            <button type="button" className="btn ghost" onClick={template}>{t.admin.add.template}</button>
          </>}
          <p className="small faint">🔒 {t.admin.add.noPassword}</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="stack"><div className="form-error">{t.admin.add.nothing}</div><button className="btn secondary" onClick={() => setDrafts(null)}>{t.common.back}</button></div>
      ) : (
        <div className="stack">
          <h3>{t.admin.add.review(drafts.filter(d => d.include).length)}</h3>
          <div className="grid-2">
            <Field label={t.admin.add.defaultStart}><input type="date" value={defStart} onChange={e => setDefStart(e.target.value)} /></Field>
            <Field label={t.admin.add.defaultDue}><input type="date" value={defDue} onChange={e => setDefDue(e.target.value)} /></Field>
          </div>
          <div className="card" data-testid="admin-review">
            {drafts.map(d => (
              <div key={d.key} className={`review-row${d.include ? '' : ' off'}`}>
                <input type="checkbox" checked={d.include} aria-label={t.admin.add.include} onChange={e => upd(d.key, { include: e.target.checked })} style={{ width: 22, height: 22 }} />
                <div className="review-fields">
                  <input className="wide" value={d.title} aria-label={t.admin.hw.title} onChange={e => upd(d.key, { title: e.target.value })} />
                  <input className="wide" value={d.subject} aria-label={t.admin.hw.subject} list="subjects" onChange={e => upd(d.key, { subject: e.target.value })} />
                  <input type="date" value={d.startDate ?? ''} aria-label={t.admin.hw.start} onChange={e => upd(d.key, { startDate: e.target.value || null })} />
                  <input type="date" value={d.dueDate ?? ''} aria-label={t.admin.hw.due} onChange={e => upd(d.key, { dueDate: e.target.value || null })} />
                  <select className="wide" value={d.language} aria-label={t.admin.hw.language} onChange={e => setDrafts(ds => ds!.map(x => (x.key === d.key ? { ...x, language: e.target.value as Lang } : x)))}>
                    <option value="en">{t.langNames.en}</option><option value="es">{t.langNames.es}</option><option value="other">{t.langNames.other}</option>
                  </select>
                  {(d.description || d.parentExplanation) && <div className="wide small muted">{d.description}{d.parentExplanation && <><br />💬 {d.parentExplanation}</>}</div>}
                </div>
              </div>
            ))}
          </div>
          <datalist id="subjects">{subjects.map(s => <option key={s.id} value={s.name} />)}</datalist>
          {err && <div className="form-error">{err}</div>}
          <button type="button" className="btn big" disabled={busy || !drafts.some(d => d.include)} onClick={publish}>{t.admin.add.publish(drafts.filter(d => d.include).length)}</button>
          <button type="button" className="btn ghost" onClick={() => setDrafts(null)}>{t.common.back}</button>
        </div>
      )}
    </div>
  );
}
