import { useEffect, useState } from 'react';
import { supabase, appUrl } from '../../lib/supabase';
import { useT } from '../../lib/i18n';
import { fmtDateTime } from '../../lib/dates';
import type { Lang } from '../../lib/types';
import { useAdmin } from '../../components/AdminShell';
import { Field, useToast } from '../../components/ui';
import { useSubjects } from './Homework';

// Class status, last synchronization and "Sync now".
export function StatusPage() {
  const { cls, reload } = useAdmin();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const when = (iso: string | null) => (iso ? fmtDateTime(iso, t.locale) : t.admin.status.never);
  const sync = async () => {
    setBusy(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('sync-homework', { body: {} });
    setBusy(false);
    const r = (data as { results?: Array<{ status: string; message?: string }> } | null)?.results?.[0];
    setResult(error ? t.common.error : r ? `${t.admin.status.runStatus[r.status] ?? r.status}${r.message ? ` — ${r.message}` : ''}` : '—');
    void reload();
  };
  const run = cls.last_run;
  return (
    <div className="stack">
      <div className="page-head"><h1>{cls.grade_label}</h1><p className="muted">Paralelo {cls.parallel}{cls.school_name ? ` · ${cls.school_name}` : ''}</p></div>
      <div className="kpis">
        <div className="card kpi"><div className="n">{cls.students}</div><div className="l">{t.admin.status.students}</div></div>
        <div className="card kpi"><div className="n">{cls.active_links}</div><div className="l">{t.admin.status.links}</div></div>
        <div className="card kpi"><div className="n">{cls.homework_total}</div><div className="l">{t.admin.status.homework}</div></div>
        <div className="card kpi"><div className="n">{cls.homework_active}</div><div className="l">{t.admin.status.activeToday}</div></div>
      </div>
      <div className="card card-pad stack-sm">
        <dl className="kv">
          <dt>{t.admin.status.lastSync}</dt><dd>{when(cls.last_sync_at)}</dd>
          <dt>{t.admin.status.lastChange}</dt><dd>{when(cls.data_updated_at)}</dd>
          {run && <><dt>{t.admin.status.lastRun}</dt><dd>{when(run.started_at)} · {run.source} · {t.admin.status.runStatus[run.status] ?? run.status}
            {run.status === 'ok' && ` · ${t.admin.status.runDetail(run.added, run.updated, run.unchanged)}`}{run.message && <div className="small muted">{run.message}</div>}</dd></>}
        </dl>
        {!cls.last_sync_at && <p className="small muted">ℹ️ {t.admin.status.notConfigured}</p>}
        <button type="button" className="btn secondary" disabled={busy} onClick={sync}>{busy ? t.admin.status.syncing : `🔄 ${t.admin.status.syncNow}`}</button>
        {result && <p className="small" data-testid="sync-result">{result}</p>}
      </div>
    </div>
  );
}

interface Student { id: string; first_name: string; is_active: boolean }
interface LinkRow { id: string; label: string; created_at: string; revoked_at: string | null; last_used_at: string | null; viewer_link_students: Array<{ student_id: string }> }

export function StudentsPage() {
  const { cls, reload } = useAdmin();
  const { t } = useT();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const load = async () => {
    const s = await supabase.from('students').select('id, first_name, is_active').eq('class_id', cls.class_id).order('first_name');
    setStudents((s.data as Student[]) ?? []);
    const l = await supabase.from('viewer_links').select('id, label, created_at, revoked_at, last_used_at, viewer_link_students(student_id)').order('created_at', { ascending: false });
    setLinks((l.data as LinkRow[]) ?? []);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cls.class_id]);
  const nameOf = (id: string) => students.find(s => s.id === id)?.first_name ?? '—';

  const addStudent = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('students').insert({ class_id: cls.class_id, first_name: name.trim() });
    if (error) toast(t.common.error, 'error'); else { setName(''); void load(); void reload(); }
  };
  const toggleActive = async (s: Student) => { await supabase.from('students').update({ is_active: !s.is_active }).eq('id', s.id); void load(); };
  const createLink = async () => {
    const { data, error } = await supabase.rpc('admin_create_link', { p_label: label.trim(), p_students: chosen });
    if (error) { toast(t.common.error, 'error'); return; }
    setNewUrl(appUrl(`/v/${(data as { token: string }).token}`)); setLabel(''); setChosen([]); void load(); void reload();
  };
  const revoke = async (id: string) => {
    if (!confirm(t.admin.students.revokeConfirm)) return;
    await supabase.rpc('admin_revoke_link', { p_id: id }); void load(); void reload();
  };

  return (
    <div className="stack">
      <h1>{t.admin.students.title}</h1>
      <div className="card card-pad stack-sm">
        <p className="small muted">🔒 {t.admin.students.privacy}</p>
        <form className="row" onSubmit={e => { e.preventDefault(); void addStudent(); }}>
          <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder={t.admin.students.firstName} maxLength={60} aria-label={t.admin.students.firstName} />
          <button className="btn">{t.admin.students.add}</button>
        </form>
        {students.map(s => (
          <div key={s.id} className="spread" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span>{s.first_name} {!s.is_active && <span className="pill neutral">{t.admin.students.inactive}</span>}</span>
            <button type="button" className="btn ghost small" onClick={() => toggleActive(s)}>{s.is_active ? t.admin.students.deactivate : t.admin.students.activate}</button>
          </div>
        ))}
      </div>

      <h2>{t.admin.students.links}</h2>
      {newUrl && (
        <div className="form-ok stack-sm" data-testid="new-link">
          <strong>{t.admin.students.created}</strong>
          <code className="link-code" data-testid="new-link-url">{newUrl}</code>
          <button type="button" className="btn small" onClick={() => { void navigator.clipboard?.writeText(newUrl); toast(t.admin.students.copied); }}>{t.admin.students.copy}</button>
        </div>
      )}
      <div className="card card-pad stack-sm">
        <Field label={t.admin.students.linkLabel}><input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} /></Field>
        <div className="field"><span>{t.admin.students.linkStudents}</span>
          <div className="row-wrap">{students.filter(s => s.is_active).map(s => (
            <label key={s.id} className="check"><input type="checkbox" checked={chosen.includes(s.id)}
              onChange={e => setChosen(c => (e.target.checked ? [...c, s.id] : c.filter(x => x !== s.id)))} />{s.first_name}</label>
          ))}</div>
        </div>
        <button type="button" className="btn" disabled={!label.trim() || chosen.length === 0} onClick={createLink}>{t.admin.students.newLink}</button>
      </div>
      {links.map(l => (
        <div key={l.id} className="card card-pad spread" style={{ opacity: l.revoked_at ? 0.55 : 1 }}>
          <div>
            <strong>{l.label}</strong> <span className="small muted">· {l.viewer_link_students.map(x => nameOf(x.student_id)).join(', ')}</span>
            <div className="small muted">{t.admin.students.lastUsed}: {l.last_used_at ? fmtDateTime(l.last_used_at, t.locale) : t.admin.students.neverUsed}</div>
          </div>
          {l.revoked_at ? <span className="pill neutral">{t.admin.students.revoked}</span>
            : <button type="button" className="btn ghost small" style={{ color: 'var(--red)' }} onClick={() => revoke(l.id)}>{t.admin.students.revoke}</button>}
        </div>
      ))}
    </div>
  );
}

export function SubjectsPage() {
  const { cls } = useAdmin();
  const { t } = useT();
  const { subjects, reload } = useSubjects(cls.class_id);
  const [name, setName] = useState('');
  const [lang, setLang] = useState<Lang>('es');
  const update = async (id: string, patch: Record<string, unknown>) => { await supabase.from('subjects').update(patch).eq('id', id); void reload(); };
  const add = async () => {
    if (!name.trim()) return;
    await supabase.from('subjects').insert({ class_id: cls.class_id, name: name.trim(), language: lang, sort_order: 50 });
    setName(''); void reload();
  };
  return (
    <div className="stack">
      <h1>{t.admin.subjects.title}</h1>
      <div className="card">
        {subjects.map(s => (
          <div key={s.id} className="admin-row" style={{ gap: 8 }}>
            <input className="input" style={{ width: 56, textAlign: 'center' }} defaultValue={s.emoji ?? ''} aria-label={t.admin.subjects.emoji} onBlur={e => update(s.id, { emoji: e.target.value || null })} />
            <strong className="grow">{s.name}</strong>
            <select className="input" style={{ width: 'auto' }} value={s.language} aria-label={t.admin.subjects.language} onChange={e => update(s.id, { language: e.target.value })}>
              <option value="en">{t.langNames.en}</option><option value="es">{t.langNames.es}</option><option value="other">{t.langNames.other}</option>
            </select>
          </div>
        ))}
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); void add(); }}>
        <input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder={t.admin.subjects.name} />
        <select className="input" style={{ width: 'auto' }} value={lang} onChange={e => setLang(e.target.value as Lang)}>
          <option value="en">{t.langNames.en}</option><option value="es">{t.langNames.es}</option><option value="other">{t.langNames.other}</option>
        </select>
        <button className="btn">{t.admin.subjects.add}</button>
      </form>
    </div>
  );
}
