import { useState, type FormEvent } from 'react';
import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import type { Child } from '../lib/types';
import { Empty, Field, Sheet, Spinner, useToast } from '../components/ui';

export const CHILD_COLORS = ['#a2542f', '#2f6690', '#3f7d4f', '#8a4fa3', '#c1691f', '#2f6b63', '#b03a6b', '#5a6b2f'];

export function ChildForm({ child, onDone }: { child?: Child; onDone: () => void }) {
  const fam = useFamily();
  const { t } = useT();
  const toast = useToast();
  const school = child?.school_id ? fam.schools.find(s => s.id === child.school_id)?.name ?? '' : '';
  const [name, setName] = useState(child?.name ?? '');
  const [grade, setGrade] = useState(child?.grade ?? '');
  const [schoolName, setSchoolName] = useState(school);
  const [classroom, setClassroom] = useState(child?.classroom ?? '');
  const [teacher, setTeacher] = useState(child?.teacher ?? '');
  const [color, setColor] = useState(child?.color ?? CHILD_COLORS[fam.children.length % CHILD_COLORS.length]);
  const [active, setActive] = useState(child?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const school_id = schoolName.trim() ? await fam.ensureSchool(schoolName) : null;
    const saved = await fam.saveChild(child?.id ?? null, {
      name: name.trim(), grade: grade.trim() || null, school_id, classroom: classroom.trim() || null,
      teacher: teacher.trim() || null, color, is_active: active,
      ...(child ? {} : { sort_order: fam.children.length }),
    });
    setBusy(false);
    if (saved) { toast(t.children.saved); onDone(); } else toast(t.common.error, 'error');
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Field label={t.children.name}><input value={name} onChange={e => setName(e.target.value)} required maxLength={60} autoFocus={!child} /></Field>
      <div className="grid-2">
        <Field label={t.children.grade} optional><input value={grade} onChange={e => setGrade(e.target.value)} maxLength={60} /></Field>
        <Field label={t.children.school} optional>
          <input value={schoolName} onChange={e => setSchoolName(e.target.value)} list="school-list" maxLength={120} />
        </Field>
      </div>
      <datalist id="school-list">{fam.schools.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <div className="grid-2">
        <Field label={t.children.classroom} optional><input value={classroom} onChange={e => setClassroom(e.target.value)} maxLength={60} /></Field>
        <Field label={t.children.teacher} optional><input value={teacher} onChange={e => setTeacher(e.target.value)} maxLength={120} /></Field>
      </div>
      <div className="field"><span>{t.children.color}</span>
        <div className="row-wrap" role="radiogroup" aria-label={t.children.color}>
          {CHILD_COLORS.map(c => (
            <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} onClick={() => setColor(c)}
              style={{ width: 36, height: 36, borderRadius: 12, background: c, border: c === color ? '3px solid var(--text)' : '3px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      {child && <label className="check"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />{t.children.active}</label>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn secondary" onClick={onDone}>{t.common.cancel}</button>
        <button className="btn" disabled={busy}>{busy ? t.common.saving : t.common.save}</button>
      </div>
    </form>
  );
}

export function ChildrenPage() {
  const fam = useFamily();
  const { t } = useT();
  const toast = useToast();
  const [editing, setEditing] = useState<Child | 'new' | null>(null);
  if (fam.loading) return <Spinner />;

  const remove = async (c: Child) => {
    if (!confirm(t.children.deleteConfirm(c.name))) return;
    if (await fam.deleteChild(c.id)) setEditing(null); else toast(t.common.error, 'error');
  };

  return (
    <div className="stack">
      <div className="spread"><h1>{t.children.title}</h1><button type="button" className="btn" onClick={() => setEditing('new')}>+ {t.children.add}</button></div>
      {fam.children.length === 0 ? <Empty icon="👧">{t.children.empty}</Empty> : fam.children.map(c => {
        const open = fam.tasks.filter(x => x.child_id === c.id && x.status !== 'completed').length;
        const school = fam.schools.find(s => s.id === c.school_id)?.name;
        return (
          <div key={c.id} className="kid-card" style={{ opacity: c.is_active ? 1 : .6 }}>
            <div className="kid-head" style={{ background: `color-mix(in srgb, ${c.color} 14%, var(--surface))` }}>
              <div className="kid-name"><h3 style={{ color: c.color }}>{c.name}</h3>{c.is_sample && <span className="pill neutral">{t.common.sample}</span>}</div>
              <button type="button" className="btn secondary small" onClick={() => setEditing(c)}>{t.common.edit}</button>
            </div>
            <div className="card-pad small muted" style={{ paddingTop: 10 }}>
              {[c.grade, school, c.classroom, c.teacher].filter(Boolean).join(' · ') || '—'}
              <div style={{ marginTop: 4 }}>{t.children.tasksCount(open)}{!c.is_active && ` · ${t.children.inactive}`}</div>
            </div>
          </div>
        );
      })}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={<h2>{editing === 'new' ? t.children.add : editing?.name}</h2>}>
        {editing && <ChildForm child={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
        {editing && editing !== 'new' && (
          <button type="button" className="btn ghost small" style={{ color: 'var(--red)', marginTop: 12 }} onClick={() => remove(editing)}>{t.common.delete}</button>
        )}
      </Sheet>
    </div>
  );
}
