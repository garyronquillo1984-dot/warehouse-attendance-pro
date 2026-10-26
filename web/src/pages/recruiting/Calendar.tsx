import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { addDays, isoWeekday } from '../../lib/time';
import { friendlyError } from '../../lib/errors';
import { ACTIVITY_KINDS, ACTIVITY_STATUS, label } from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

interface Activity {
  id: string; title: string; kind: string; status: string; starts_on: string; ends_on: string | null; start_time: string | null;
  location: string | null; owner_name: string | null; partner: string | null; est_cost: number | null; actual_cost: number | null;
  target_candidates: number | null; materials: string | null; permits: string | null; verification_url: string | null;
  results_note: string | null; source_id: string | null;
}
type Form = Omit<Activity, 'id'> & { id?: string };

// Suggested 90-day plan. Every item starts unconfirmed: dates are proposals to verify,
// partners are organizations to contact, not agreements.
function suggestedPlan(start: string): Omit<Activity, 'id' | 'ends_on' | 'start_time' | 'actual_cost' | 'results_note' | 'source_id'>[] {
  const monday = addDays(start, (8 - isoWeekday(start)) % 7);
  const d = (n: number) => addDays(monday, n);
  const base = { location: null, owner_name: null, est_cost: null, target_candidates: null, materials: null, permits: null, verification_url: null };
  const items: ReturnType<typeof suggestedPlan> = [
    { ...base, title: 'Meet client site contact; confirm authorized openings, requirements and rules / Reunión con el contacto del cliente', kind: 'org_contact', status: 'pending_confirmation', starts_on: start, partner: 'Client site (Win.It America, Florence)' },
    { ...base, title: 'Introduce yourself to the other agency representatives / Presentarse con los representantes de las otras agencias', kind: 'agency_meeting', status: 'pending_confirmation', starts_on: addDays(start, 1), partner: null },
    { ...base, title: 'Register employer account on Focus Talent (KY Career Center job bank) — needs employer authorization', kind: 'digital_campaign', status: 'idea', starts_on: addDays(start, 2), partner: 'Kentucky Career Center', verification_url: 'https://apps.kcc.ky.gov/employer/focustalent.aspx', est_cost: 0 },
    { ...base, title: 'Call KY Career Center – Florence business services: hiring events on site / Eventos de contratación', kind: 'org_contact', status: 'idea', starts_on: addDays(start, 3), partner: 'Kentucky Career Center – Florence, 8020 Veterans Memorial Dr', target_candidates: null },
    { ...base, title: 'Launch approved Facebook post (EN + ES) with pre-registration link', kind: 'digital_campaign', status: 'idea', starts_on: d(7), partner: null, est_cost: 0, target_candidates: 15 },
    { ...base, title: 'QR flyer at approved locations (site entrance, break room if allowed)', kind: 'digital_campaign', status: 'idea', starts_on: d(8), partner: null, materials: 'Printed QR flyers EN/ES', permits: 'Client permission for each location' },
    { ...base, title: 'Contact Esperanza Latino Center (Covington): bilingual job-readiness referrals', kind: 'org_contact', status: 'idea', starts_on: d(9), partner: 'Esperanza Latino Center, 234 Pike St, Covington' },
    { ...base, title: 'Contact Gateway CTC career services: post through Handshake', kind: 'school_meeting', status: 'idea', starts_on: d(10), partner: 'Gateway CTC · gw-careerservices@kctcs.edu · (859) 442-1609' },
    { ...base, title: 'Contact Brighton Center – Center for Employment Training', kind: 'org_contact', status: 'idea', starts_on: d(14), partner: 'Brighton Center' },
    { ...base, title: 'Contact Life Learning Center (Covington): fair-chance / reentry referrals', kind: 'org_contact', status: 'idea', starts_on: d(15), partner: 'Life Learning Center, 20 W 18th St, Covington' },
    { ...base, title: 'Ask Boone County Public Library about posting flyers / job-seeker events', kind: 'community_visit', status: 'idea', starts_on: d(16), partner: 'Boone County Public Library' },
    { ...base, title: 'TikTok / Reels video (EN + ES) — only with employer approval', kind: 'digital_campaign', status: 'idea', starts_on: d(17), partner: null, est_cost: 0 },
    { ...base, title: 'Check NKY job fair listings (KCC, NKY Chamber, Gateway) and add confirmed ones', kind: 'job_fair', status: 'idea', starts_on: d(21), partner: null },
    { ...base, title: 'Channel review: which sources produce people who show up? Adjust campaigns', kind: 'other', status: 'idea', starts_on: d(25), partner: null },
    { ...base, title: 'Monthly results review with supervisor / Revisión mensual con el supervisor', kind: 'other', status: 'idea', starts_on: d(32), partner: null },
    { ...base, title: 'Check NKY job fair listings for December–January', kind: 'job_fair', status: 'idea', starts_on: d(35), partner: null },
    { ...base, title: 'Recontact closed candidates who asked to be called later (with consent)', kind: 'event_follow_up', status: 'idea', starts_on: d(42), partner: null },
    { ...base, title: 'Monthly results review with supervisor / Revisión mensual con el supervisor', kind: 'other', status: 'idea', starts_on: d(60), partner: null },
    { ...base, title: 'Check NKY job fair listings for February', kind: 'job_fair', status: 'idea', starts_on: d(63), partner: null },
    { ...base, title: '90-day review: results, best channels, recommendations / Revisión de 90 días', kind: 'other', status: 'idea', starts_on: d(84), partner: null },
  ];
  for (let w = 0; w < 13; w++) {
    items.push({ ...base, title: 'Weekly agency coordination meeting / Reunión semanal de coordinación', kind: 'agency_meeting', status: 'pending_confirmation', starts_on: d(w * 7 + 2), partner: null });
  }
  for (const n of [17, 45, 73]) {
    items.push({ ...base, title: 'Interview / hiring day (only if authorized; place to confirm)', kind: 'interview_day', status: 'idea', starts_on: d(n), partner: null, target_candidates: 10, materials: 'QR flyers, sign-in sheet (no sensitive data), laptop/tablet', permits: 'Employer authorization + venue confirmation' });
    items.push({ ...base, title: 'Follow up every person met at the interview day', kind: 'event_follow_up', status: 'idea', starts_on: d(n + 1), partner: null });
  }
  return items.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

export default function Calendar() {
  const { org, manage, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [edit, setEdit] = useState<Form | null>(null);
  const [status, setStatus] = useState('');
  const [past, setPast] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('recruitment_activities').select('*').eq('organization_id', org.organization_id).order('starts_on').limit(2000);
    if (error) setErr(friendlyError(error));
    setItems((data ?? []) as Activity[]);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const weeks = useMemo(() => {
    const list = (items ?? []).filter(a => (!status || a.status === status) && (past || (a.ends_on ?? a.starts_on) >= today || a.status === 'pending_confirmation'));
    const m = new Map<string, Activity[]>();
    list.forEach(a => { const wk = addDays(a.starts_on, 1 - isoWeekday(a.starts_on)); m.set(wk, [...(m.get(wk) ?? []), a]); });
    return [...m.entries()];
  }, [items, status, past, today]);

  if (!items) return <Loading label={t('Loading…', 'Cargando…')} />;

  async function loadPlan() {
    const rows = suggestedPlan(today).map(r => ({ ...r, organization_id: org.organization_id }));
    const { error } = await supabase.from('recruitment_activities').insert(rows);
    if (error) setErr(friendlyError(error)); else load();
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const f = edit!;
    if (f.status === 'confirmed' && !f.verification_url?.trim() && !f.partner?.trim())
      return setErr(t('To mark it confirmed, record who confirmed it (partner) or the official link.', 'Para marcarlo como confirmado, registra quién lo confirmó (organización) o el enlace oficial.'));
    const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
    const row = {   // editable columns only
      title: f.title.trim(), kind: f.kind, status: f.status, starts_on: f.starts_on, ends_on: f.ends_on || null, start_time: f.start_time || null,
      location: f.location?.trim() || null, owner_name: f.owner_name?.trim() || null, partner: f.partner?.trim() || null,
      est_cost: num(f.est_cost), actual_cost: num(f.actual_cost), target_candidates: num(f.target_candidates),
      materials: f.materials?.trim() || null, permits: f.permits?.trim() || null, verification_url: f.verification_url?.trim() || null,
      results_note: f.results_note?.trim() || null, source_id: f.source_id || null,
    };
    const res = f.id ? await supabase.from('recruitment_activities').update(row).eq('id', f.id)
      : await supabase.from('recruitment_activities').insert({ ...row, organization_id: org.organization_id });
    if (res.error) setErr(friendlyError(res.error)); else { setEdit(null); load(); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from('recruitment_activities').delete().eq('id', id);
    if (error) setErr(friendlyError(error)); else { setEdit(null); load(); }
  }
  const up = (p: Partial<Form>) => setEdit(x => x && { ...x, ...p });
  const blank: Form = { title: '', kind: 'job_fair', status: 'pending_confirmation', starts_on: today, ends_on: null, start_time: null, location: '', owner_name: '',
    partner: '', est_cost: null, actual_cost: null, target_candidates: null, materials: '', permits: '', verification_url: '', results_note: '', source_id: null };

  return (
    <div className="stack-lg">
      <div className="page-head row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t('Recruiting calendar (90 days)', 'Calendario de reclutamiento (90 días)')}</h1>
          <p className="muted">{t('Only mark an event “Confirmed” after checking it with the organizer. Unverified dates stay “Pending confirmation”.',
            'Marca un evento como “Confirmado” solo después de verificarlo con el organizador. Las fechas sin verificar quedan “Pendiente de confirmación”.')}</p>
        </div>
        {manage && !edit && (
          <div className="row">
            {!items.length && <button className="btn btn-ghost" onClick={loadPlan}>{t('Load suggested 90-day plan', 'Cargar plan sugerido de 90 días')}</button>}
            <button className="btn btn-primary" onClick={() => setEdit(blank)}>{t('Add activity', 'Agregar actividad')}</button>
          </div>
        )}
      </div>
      {err && <Notice kind="error">{err}</Notice>}

      {edit && (
        <form className="panel" onSubmit={save}>
          <h2>{edit.id ? t('Edit activity', 'Editar actividad') : t('New activity', 'Nueva actividad')}</h2>
          <Field label={t('Title', 'Título')} name="a-title" value={edit.title} onChange={e => up({ title: e.target.value })} required maxLength={160} />
          <div className="two">
            <div className="field"><label htmlFor="a-kind">{t('Type', 'Tipo')}</label>
              <select id="a-kind" value={edit.kind} onChange={e => up({ kind: e.target.value })}>{ACTIVITY_KINDS.map(k => <option key={k.key} value={k.key}>{k[lang]}</option>)}</select></div>
            <div className="field"><label htmlFor="a-status">{t('Status', 'Estado')}</label>
              <select id="a-status" value={edit.status} onChange={e => up({ status: e.target.value })}>{ACTIVITY_STATUS.map(k => <option key={k.key} value={k.key}>{k[lang]}</option>)}</select></div>
            <Field label={t('Date', 'Fecha')} name="a-start" type="date" value={edit.starts_on} onChange={e => up({ starts_on: e.target.value })} required />
            <Field label={t('Time', 'Hora')} name="a-time" type="time" value={edit.start_time ?? ''} onChange={e => up({ start_time: e.target.value })} />
            <Field label={t('Location', 'Lugar')} name="a-loc" value={edit.location ?? ''} onChange={e => up({ location: e.target.value })} maxLength={200} />
            <Field label={t('Responsible', 'Responsable')} name="a-owner" value={edit.owner_name ?? ''} onChange={e => up({ owner_name: e.target.value })} maxLength={120} />
            <Field label={t('Partner / organizer', 'Organización / organizador')} name="a-partner" value={edit.partner ?? ''} onChange={e => up({ partner: e.target.value })} maxLength={160} />
            <Field label={t('Official link (verification)', 'Enlace oficial (verificación)')} name="a-url" type="url" value={edit.verification_url ?? ''} onChange={e => up({ verification_url: e.target.value })} maxLength={300} />
            <Field label={t('Estimated cost ($)', 'Costo estimado ($)')} name="a-est" type="number" min={0} step="0.01" value={edit.est_cost ?? ''} onChange={e => up({ est_cost: e.target.value as unknown as number })} />
            <Field label={t('Actual cost ($)', 'Costo real ($)')} name="a-act" type="number" min={0} step="0.01" value={edit.actual_cost ?? ''} onChange={e => up({ actual_cost: e.target.value as unknown as number })} />
            <Field label={t('Candidate goal', 'Meta de candidatos')} name="a-target" type="number" min={0} value={edit.target_candidates ?? ''} onChange={e => up({ target_candidates: e.target.value as unknown as number })} />
            <div className="field"><label htmlFor="a-src">{t('Source for attribution', 'Fuente para atribución')}</label>
              <select id="a-src" value={edit.source_id ?? ''} onChange={e => up({ source_id: e.target.value || null })}>
                <option value="">—</option>{setup.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <Field label={t('Materials', 'Materiales')} name="a-mat" value={edit.materials ?? ''} onChange={e => up({ materials: e.target.value })} maxLength={500} />
          <Field label={t('Permits / approvals needed', 'Permisos / aprobaciones necesarias')} name="a-perm" value={edit.permits ?? ''} onChange={e => up({ permits: e.target.value })} maxLength={500} />
          <div className="field"><label htmlFor="a-res">{t('Results', 'Resultados')}</label>
            <textarea id="a-res" rows={2} maxLength={1000} value={edit.results_note ?? ''} onChange={e => up({ results_note: e.target.value })} /></div>
          <div className="row">
            <button className="btn btn-primary">{t('Save', 'Guardar')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{t('Cancel', 'Cancelar')}</button>
            {edit.id && <button type="button" className="btn btn-ghost danger" onClick={() => remove(edit.id!)}>{t('Delete', 'Eliminar')}</button>}
          </div>
        </form>
      )}

      <div className="filters">
        <div className="field"><label htmlFor="c-status">{t('Status', 'Estado')}</label>
          <select id="c-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">{t('All', 'Todos')}</option>{ACTIVITY_STATUS.map(s => <option key={s.key} value={s.key}>{s[lang]}</option>)}</select></div>
        <button className="chip" aria-pressed={past} onClick={() => setPast(!past)}>{t('Include past', 'Incluir pasadas')}</button>
      </div>

      {!weeks.length ? <p className="muted">{t('Nothing scheduled.', 'Nada programado.')}</p> : weeks.map(([wk, list]) => (
        <section key={wk} className="panel">
          <h2>{t('Week of', 'Semana del')} {wk}</h2>
          <ul className="activity-list">
            {list.map(a => (
              <li key={a.id} data-status={a.status} className={manage ? 'clickable' : undefined} onClick={manage ? () => setEdit({ ...a }) : undefined}>
                <span className="mono small">{a.starts_on}{a.start_time ? ` ${a.start_time.slice(0, 5)}` : ''}</span>
                <span><strong>{a.title}</strong>
                  <span className="small muted"> · {label(ACTIVITY_KINDS, a.kind, lang)}{a.partner ? ` · ${a.partner}` : ''}{a.target_candidates ? ` · ${t('goal', 'meta')} ${a.target_candidates}` : ''}{a.est_cost != null ? ` · $${a.est_cost}` : ''}</span>
                  {a.results_note && <span className="small"> — {a.results_note}</span>}
                </span>
                <span className={`status-pill s-${a.status}`}>{label(ACTIVITY_STATUS, a.status, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
