import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAccount } from '../lib/account';
import { FamilyProvider, useFamily } from '../lib/family';
import { useT } from '../lib/i18n';
import { Field, Spinner, useToast } from '../components/ui';
import { CHILD_COLORS } from './Children';
import { PasteBox } from './AddTask';

const STEPS = 5;

// Welcome → children → school/grade → first tasks → ready.
export function OnboardingPage() {
  const { account, loading } = useAccount();
  if (loading) return <Spinner />;
  if (!account) return <Navigate to="/login" replace />;
  if (account.onboarded) return <Navigate to="/app" replace />;
  return <FamilyProvider><Wizard /></FamilyProvider>;
}

function Wizard() {
  const { t } = useT();
  const { refresh } = useAccount();
  const fam = useFamily();
  const toast = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  if (fam.loading) return <Spinner />;

  const addChild = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    await fam.saveChild(null, { name: newName.trim(), color: CHILD_COLORS[fam.children.length % CHILD_COLORS.length], sort_order: fam.children.length });
    setNewName(''); setBusy(false);
  };
  const finish = async () => {
    await supabase.rpc('complete_onboarding');
    await refresh();
    nav('/app', { replace: true });
  };
  const sample = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('load_sample_data');
    setBusy(false);
    if (error) toast(t.common.error, 'error'); else { await fam.reload(); setStep(5); }
  };

  return (
    <div className="onb" data-testid={`onboarding-step-${step}`}>
      <div className="stack-sm">
        <div className="dots" aria-hidden>{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i < step ? 'on' : ''} />)}</div>
        <span className="small muted">{t.onboarding.step(step, STEPS)}</span>
      </div>

      {step === 1 && (
        <div className="stack" style={{ marginTop: '8vh' }}>
          <div style={{ fontSize: 56 }} aria-hidden>👋</div>
          <h1>{t.onboarding.welcomeTitle}</h1>
          <p className="muted" style={{ fontSize: 17 }}>{t.onboarding.welcomeSub}</p>
          <p className="small faint">{t.common.sourceNote}</p>
          <button type="button" className="btn big" onClick={() => setStep(2)}>{t.onboarding.start}</button>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <h1>{t.onboarding.childrenTitle}</h1>
          <p className="muted">{t.onboarding.childrenSub}</p>
          {fam.children.map(c => (
            <div key={c.id} className="card card-pad row"><i className="kid-dot" style={{ background: c.color, width: 14, height: 14 }} /><strong className="grow">{c.name}</strong></div>
          ))}
          <form className="row" onSubmit={e => { e.preventDefault(); void addChild(); }}>
            <input className="input grow" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t.auth.childName} maxLength={60} aria-label={t.auth.childName} />
            <button className="btn secondary" disabled={busy || !newName.trim()}>{t.common.add}</button>
          </form>
          <button type="button" className="btn big" disabled={!fam.children.length} onClick={() => setStep(3)}>{t.common.next}</button>
        </div>
      )}

      {step === 3 && <SchoolStep onNext={() => setStep(4)} />}

      {step === 4 && (
        <div className="stack">
          <h1>{t.onboarding.tasksTitle}</h1>
          <p className="muted">{t.onboarding.tasksSub}</p>
          <div className="card card-pad"><PasteBox compact onSaved={n => { toast(t.task.created_n(n)); setStep(5); }} /></div>
          <button type="button" className="btn secondary" disabled={busy} onClick={sample}>🧪 {t.onboarding.trySample}</button>
          <button type="button" className="btn ghost" onClick={() => setStep(5)}>{t.onboarding.skipTasks}</button>
        </div>
      )}

      {step === 5 && (
        <div className="stack" style={{ marginTop: '8vh', textAlign: 'center' }}>
          <div style={{ fontSize: 56 }} aria-hidden>🎉</div>
          <h1>{t.onboarding.readyTitle}</h1>
          <p className="muted" style={{ fontSize: 17 }}>{t.onboarding.readySub}</p>
          <button type="button" className="btn big" onClick={finish}>{t.onboarding.goDashboard}</button>
        </div>
      )}

      {step > 1 && step < 5 && <button type="button" className="btn ghost small" onClick={() => setStep(s => s - 1)}>← {t.common.back}</button>}
    </div>
  );
}

function SchoolStep({ onNext }: { onNext: () => void }) {
  const { t } = useT();
  const fam = useFamily();
  const [rows, setRows] = useState(() => Object.fromEntries(fam.children.map(c => [c.id, {
    grade: c.grade ?? '', school: fam.schools.find(s => s.id === c.school_id)?.name ?? '',
  }])));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    for (const c of fam.children) {
      const r = rows[c.id];
      if (!r) continue;
      const school_id = r.school.trim() ? await fam.ensureSchool(r.school) : null;
      if (r.grade !== (c.grade ?? '') || school_id !== c.school_id) await fam.saveChild(c.id, { grade: r.grade.trim() || null, school_id });
    }
    setBusy(false);
    onNext();
  };
  return (
    <div className="stack">
      <h1>{t.onboarding.schoolTitle}</h1>
      <p className="muted">{t.onboarding.schoolSub}</p>
      <datalist id="school-list">{fam.schools.map(s => <option key={s.id} value={s.name} />)}</datalist>
      {fam.children.map(c => (
        <div key={c.id} className="card card-pad stack-sm">
          <strong style={{ color: c.color }}>{c.name}</strong>
          <div className="grid-2">
            <Field label={t.auth.school} optional><input value={rows[c.id]?.school ?? ''} list="school-list" onChange={e => setRows(r => ({ ...r, [c.id]: { ...r[c.id], school: e.target.value } }))} /></Field>
            <Field label={t.auth.grade} optional><input value={rows[c.id]?.grade ?? ''} onChange={e => setRows(r => ({ ...r, [c.id]: { ...r[c.id], grade: e.target.value } }))} /></Field>
          </div>
        </div>
      ))}
      <button type="button" className="btn big" disabled={busy} onClick={save}>{t.common.next}</button>
    </div>
  );
}
