import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang, type Lang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import {
  CANDIDATE_COLUMNS, STAGES, CLOSED_REASONS, POSITIONS, EXPERIENCE, EQUIPMENT, SHIFT_OPTIONS, LANGUAGES, AGENCY_CHECK,
  EVENT_KINDS, OUTCOMES, phaseOf, stageLabel, label, formatPhone, candidateName, readiness, READINESS_REASONS,
  fillTemplate, smsLink, waLink, mailLink, telLink, atLeast,
  type Candidate, type CandidateEvent, type Stage, type Task, type Template,
} from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

type Form = {
  warehouse_id: string; first_name: string; last_name: string; phone: string; email: string; city: string; zip: string;
  preferred_language: string; source_id: string; source_detail: string; owner_id: string;
  experience: string[]; experience_note: string; equipment: string[]; shifts_available: string[]; available_from: string;
  positions_wanted: string[]; opening_id: string; interview_at: string; first_day: string;
  next_action: string; next_action_due: string;
  consent_contact: boolean; consent_sms: boolean; consent_whatsapp: boolean; consent_email: boolean; consent_method: string;
  agency_check: string; agency_note: string; notes: string;
};

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function fromCandidate(c: Candidate): Form {
  return {
    warehouse_id: c.warehouse_id, first_name: c.first_name, last_name: c.last_name, phone: formatPhone(c.phone), email: c.email ?? '',
    city: c.city ?? '', zip: c.zip ?? '', preferred_language: c.preferred_language, source_id: c.source_id ?? '',
    source_detail: c.source_detail ?? '', owner_id: c.owner_id ?? '', experience: c.experience, experience_note: c.experience_note ?? '',
    equipment: c.equipment, shifts_available: c.shifts_available, available_from: c.available_from ?? '',
    positions_wanted: c.positions_wanted, opening_id: c.opening_id ?? '', interview_at: toLocalInput(c.interview_at),
    first_day: c.first_day ?? '', next_action: c.next_action ?? '', next_action_due: c.next_action_due ?? '',
    consent_contact: c.consent_contact, consent_sms: c.consent_sms, consent_whatsapp: c.consent_whatsapp, consent_email: c.consent_email,
    consent_method: c.consent_method ?? '', agency_check: c.agency_check, agency_note: c.agency_note ?? '', notes: c.notes ?? '',
  };
}

// My name and phone for message templates: remembered on this device only.
const ME_KEY = 'wap.recruiter';
const readMe = (): { name: string; phone: string; apply: string } => {
  try { return { name: '', phone: '', apply: '', ...JSON.parse(localStorage.getItem(ME_KEY) || '{}') }; } catch { return { name: '', phone: '', apply: '' }; }
};

export default function CandidateDetail() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const { org, manage, ws, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const [cand, setCand] = useState<Candidate | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dupName, setDupName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    const [c, e, tk] = await Promise.all([
      supabase.from('candidates').select(CANDIDATE_COLUMNS).eq('id', id!).maybeSingle(),
      supabase.from('candidate_events').select('*').eq('candidate_id', id!).order('created_at', { ascending: false }).limit(200),
      supabase.from('recruitment_tasks').select('*').eq('candidate_id', id!).order('due_on'),
    ]);
    const row = c.data as unknown as Candidate | null;
    setCand(row);
    if (row) setForm(fromCandidate(row));
    setEvents((e.data ?? []) as CandidateEvent[]);
    setTasks((tk.data ?? []) as Task[]);
    if (row?.possible_duplicate_of) {
      const d = await supabase.from('candidates').select('first_name, last_name').eq('id', row.possible_duplicate_of).maybeSingle();
      setDupName(d.data ? candidateName(d.data) : t('a record in another warehouse', 'un registro de otro almacén'));
    } else setDupName(null);
    setLoaded(true);
  }, [id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isNew && !form) {
      setForm({
        warehouse_id: ws.warehouses[0]?.id ?? '', first_name: '', last_name: '', phone: '', email: '', city: '', zip: '',
        preferred_language: lang, source_id: '', source_detail: '', owner_id: '', experience: [], experience_note: '',
        equipment: [], shifts_available: [], available_from: '', positions_wanted: [], opening_id: '', interview_at: '',
        first_day: '', next_action: '', next_action_due: '', consent_contact: false, consent_sms: false,
        consent_whatsapp: false, consent_email: false, consent_method: 'verbal', agency_check: 'unknown', agency_note: '', notes: '',
      });
    }
  }, [isNew, form, ws.warehouses, lang]);

  if (!loaded || !form) return <Loading label={t('Loading…', 'Cargando…')} />;
  if (!isNew && !cand) return <Notice kind="error">{t('This candidate doesn’t exist or you can’t see them.', 'Este candidato no existe o no tienes acceso.')}</Notice>;

  const up = (patch: Partial<Form>) => setForm(f => f && ({ ...f, ...patch }));
  const flip = (k: 'experience' | 'equipment' | 'shifts_available' | 'positions_wanted', v: string) =>
    up({ [k]: form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v] } as Partial<Form>);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const f = form!;
    const digits = f.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!f.first_name.trim() || !f.last_name.trim()) return setMsg({ kind: 'error', text: t('Enter first and last name.', 'Escribe nombre y apellido.') });
    if (!digits && !f.email.trim()) return setMsg({ kind: 'error', text: t('Enter a phone number or an email.', 'Escribe un teléfono o un correo.') });
    if (digits && digits.length !== 10) return setMsg({ kind: 'error', text: t('Phone numbers have 10 digits.', 'El teléfono debe tener 10 dígitos.') });
    if (f.zip && !/^\d{5}$/.test(f.zip)) return setMsg({ kind: 'error', text: t('ZIP code has 5 digits.', 'El código postal tiene 5 dígitos.') });
    const row = {
      warehouse_id: f.warehouse_id, first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: digits || null,
      email: f.email.trim() || null, city: f.city.trim() || null, zip: f.zip || null, preferred_language: f.preferred_language,
      source_id: f.source_id || null, source_detail: f.source_detail.trim() || null, owner_id: f.owner_id || null,
      experience: f.experience, experience_note: f.experience_note.trim() || null, equipment: f.equipment,
      shifts_available: f.shifts_available, available_from: f.available_from || null, positions_wanted: f.positions_wanted,
      opening_id: f.opening_id || null, interview_at: f.interview_at ? new Date(f.interview_at).toISOString() : null,
      first_day: f.first_day || null, next_action: f.next_action.trim() || null, next_action_due: f.next_action_due || null,
      consent_contact: f.consent_contact, consent_sms: f.consent_contact && f.consent_sms,
      consent_whatsapp: f.consent_contact && f.consent_whatsapp, consent_email: f.consent_contact && f.consent_email,
      consent_method: f.consent_contact ? f.consent_method || 'other' : null,
      agency_check: f.agency_check, agency_note: f.agency_note.trim() || null, notes: f.notes.trim() || null,
    };
    setBusy(true);
    const res = isNew
      ? await supabase.from('candidates').insert({ ...row, organization_id: org.organization_id }).select('id').single()
      : await supabase.from('candidates').update(row).eq('id', id!).select('id').single();
    setBusy(false);
    if (res.error) return setMsg({ kind: 'error', text: friendlyError(res.error) });
    if (isNew) nav(`/recruiting/candidates/${res.data.id}`, { replace: true });
    else { setMsg({ kind: 'ok', text: t('Saved.', 'Guardado.') }); load(); }
  }

  const whShifts = ws.warehouses.find(w => w.id === form.warehouse_id)?.shifts ?? [];
  const openings = setup.openings.filter(o => o.warehouse_id === form.warehouse_id && (o.status === 'authorized' || o.id === form.opening_id));
  const chipGroup = (k: 'experience' | 'equipment' | 'shifts_available' | 'positions_wanted', opts: { key: string; en: string; es: string }[], legend: string) => (
    <fieldset className="chip-field">
      <legend>{legend}</legend>
      <div className="chips">
        {opts.map(o => <button type="button" key={o.key} className="chip" aria-pressed={form[k].includes(o.key)} onClick={() => flip(k, o.key)}>{o[lang]}</button>)}
      </div>
    </fieldset>
  );

  return (
    <div className="stack-lg narrow">
      <Link className="back" to="/recruiting/candidates">← {t('Candidates', 'Candidatos')}</Link>
      {cand ? (
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>{candidateName(cand)}
            {cand.is_sample && <span className="tag tag-sample">{t('Sample data', 'Dato de ejemplo')}</span>}
          </h1>
          <p className="muted">
            <span className={`stage stage-${phaseOf(cand.stage)}`}>{stageLabel(cand.stage, lang, setup.settings)}</span>
            {' · '}{t('Registered', 'Registrado')} {cand.registered_at.slice(0, 10)}
            {' · '}{t('Readiness', 'Preparación')} {readiness(cand, today).score}/100
            <span className="small"> ({readiness(cand, today).reasons.map(k => READINESS_REASONS[k][lang]).join(', ') || '—'})</span>
          </p>
          <QuickContact c={cand} lang={lang} />
        </div>
      ) : <div className="page-head" style={{ marginBottom: 0 }}><h1>{t('New candidate', 'Nuevo candidato')}</h1>
        <p className="muted">{t('Only what a first contact needs. Never ask for SSN, bank details, ID numbers, date of birth or health information here.',
          'Solo lo necesario para un primer contacto. Nunca pidas aquí número de Seguro Social, datos bancarios, números de identificación, fecha de nacimiento ni información médica.')}</p></div>}

      {cand?.possible_duplicate_of && (
        <Notice kind="info">
          {t('Possible duplicate of ', 'Posible duplicado de ')}
          <Link to={`/recruiting/candidates/${cand.possible_duplicate_of}`}>{dupName}</Link>.{' '}
          {t('Same phone, email, or name and ZIP. Keep one record: update the original and delete this one, or confirm they are different people.',
             'Mismo teléfono, correo, o nombre y código postal. Conserva un solo registro: actualiza el original y elimina este, o confirma que son personas distintas.')}{' '}
          <button className="btn-link" onClick={async () => { await supabase.from('candidates').update({ possible_duplicate_of: null }).eq('id', cand.id); load(); }}>
            {t('Not a duplicate', 'No es duplicado')}
          </button>
        </Notice>
      )}
      {cand?.agency_check === 'other_agency_reported' && (
        <Notice kind="error">{t('This person says another agency placed them at this client. Do not process or try to transfer them. Escalate to your supervisor and record the outcome in Agencies.',
          'Esta persona dice que otra agencia la colocó en este cliente. No la proceses ni intentes transferirla. Escala a tu supervisor y registra el resultado en Agencias.')}</Notice>
      )}

      {cand && <StageBox c={cand} onDone={load} />}
      {cand && manage && atLeast(cand.stage, 'approved') && !cand.employee_id && <HireBox c={cand} shifts={ws.warehouses.find(w => w.id === cand.warehouse_id)?.shifts ?? []} onDone={load} />}
      {cand?.employee_id && <Notice kind="ok">{t('Hired: linked to the employee roster. First day and retention are measured from attendance.', 'Contratado: vinculado a la lista de empleados. El primer día y la retención se miden con la asistencia.')}{' '}<Link to={`/employees/${cand.employee_id}`}>{t('Open employee', 'Abrir empleado')}</Link></Notice>}

      <form className="panel" onSubmit={save} noValidate>
        <h2>{t('Profile', 'Perfil')}</h2>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="two">
          <Field label={t('First name', 'Nombre')} name="first_name" value={form.first_name} onChange={e => up({ first_name: e.target.value })} required maxLength={80} autoComplete="off" />
          <Field label={t('Last name', 'Apellido')} name="last_name" value={form.last_name} onChange={e => up({ last_name: e.target.value })} required maxLength={80} autoComplete="off" />
          <Field label={t('Phone', 'Teléfono')} name="phone" type="tel" inputMode="tel" value={form.phone} onChange={e => up({ phone: e.target.value })} placeholder="(859) 555-0100" />
          <Field label="Email" name="email" type="email" value={form.email} onChange={e => up({ email: e.target.value })} maxLength={160} />
          <Field label={t('City', 'Ciudad')} name="city" value={form.city} onChange={e => up({ city: e.target.value })} maxLength={80} />
          <Field label={t('ZIP code', 'Código postal')} name="zip" inputMode="numeric" value={form.zip} onChange={e => up({ zip: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
          <div className="field">
            <label htmlFor="lang">{t('Preferred language', 'Idioma preferido')}</label>
            <select id="lang" value={form.preferred_language} onChange={e => up({ preferred_language: e.target.value })}>
              {LANGUAGES.map(x => <option key={x.key} value={x.key}>{x[lang]}</option>)}
            </select>
          </div>
          {ws.warehouses.length > 1 && (
            <div className="field">
              <label htmlFor="wh">{t('Recruited for (site)', 'Reclutado para (sitio)')}</label>
              <select id="wh" value={form.warehouse_id} onChange={e => up({ warehouse_id: e.target.value, opening_id: '' })}>
                {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <h3>{t('Source and owner', 'Fuente y responsable')}</h3>
        <div className="two">
          <div className="field">
            <label htmlFor="src">{t('Recruitment source', 'Fuente de reclutamiento')}</label>
            <select id="src" value={form.source_id} onChange={e => up({ source_id: e.target.value })}>
              <option value="">—</option>
              {setup.sources.filter(s => s.is_active || s.id === form.source_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Field label={t('Source detail', 'Detalle de la fuente')} name="source_detail" value={form.source_detail} onChange={e => up({ source_detail: e.target.value })} maxLength={120}
                 hint={t('e.g. group name, event, referring employee badge', 'p. ej. nombre del grupo, evento, gafete del empleado que refirió')} />
          {setup.members.length > 1 && (
            <div className="field">
              <label htmlFor="owner">{t('Internal owner', 'Responsable interno')}</label>
              <select id="owner" value={form.owner_id} onChange={e => up({ owner_id: e.target.value })}>
                <option value="">—</option>
                {setup.members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <h3>{t('Experience and availability', 'Experiencia y disponibilidad')}</h3>
        {chipGroup('experience', EXPERIENCE, t('Relevant experience', 'Experiencia relevante'))}
        <Field label={t('Experience note (job-related only)', 'Nota de experiencia (solo laboral)')} name="experience_note" value={form.experience_note} onChange={e => up({ experience_note: e.target.value })} maxLength={300} />
        {chipGroup('equipment', EQUIPMENT, t('Equipment they can use', 'Equipos que sabe usar'))}
        {chipGroup('shifts_available', SHIFT_OPTIONS, t('Shifts available', 'Turnos disponibles'))}
        {chipGroup('positions_wanted', POSITIONS, t('Positions of interest', 'Puestos de interés'))}
        <div className="two">
          <Field label={t('Can start from', 'Puede comenzar desde')} name="available_from" type="date" value={form.available_from} onChange={e => up({ available_from: e.target.value })} />
          <div className="field">
            <label htmlFor="opening">{t('Opening', 'Vacante')}</label>
            <select id="opening" value={form.opening_id} onChange={e => up({ opening_id: e.target.value })}>
              <option value="">—</option>
              {openings.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
          <Field label={t('Interview / appointment', 'Entrevista / cita')} name="interview_at" type="datetime-local" value={form.interview_at} onChange={e => up({ interview_at: e.target.value })} />
          <Field label={t('First day', 'Primer día')} name="first_day" type="date" value={form.first_day} onChange={e => up({ first_day: e.target.value })}
                 hint={whShifts.length ? undefined : ''} />
          <Field label={t('Next action', 'Próxima acción')} name="next_action" value={form.next_action} onChange={e => up({ next_action: e.target.value })} maxLength={160} />
          <Field label={t('Next action due', 'Fecha de la próxima acción')} name="next_action_due" type="date" value={form.next_action_due} onChange={e => up({ next_action_due: e.target.value })} />
        </div>

        <h3>{t('Consent to be contacted', 'Consentimiento de contacto')}</h3>
        <label className="check"><input type="checkbox" checked={form.consent_contact} onChange={e => up({ consent_contact: e.target.checked })} />
          <span>{t('The person agreed to be contacted about job opportunities.', 'La persona aceptó ser contactada sobre oportunidades de empleo.')}</span></label>
        {form.consent_contact && (
          <div className="row">
            <label className="check"><input type="checkbox" checked={form.consent_sms} onChange={e => up({ consent_sms: e.target.checked })} /><span>{t('Text messages', 'Mensajes de texto')}</span></label>
            <label className="check"><input type="checkbox" checked={form.consent_whatsapp} onChange={e => up({ consent_whatsapp: e.target.checked })} /><span>WhatsApp</span></label>
            <label className="check"><input type="checkbox" checked={form.consent_email} onChange={e => up({ consent_email: e.target.checked })} /><span>Email</span></label>
            <select aria-label={t('How consent was given', 'Cómo se dio el consentimiento')} value={form.consent_method} onChange={e => up({ consent_method: e.target.value })} style={{ width: 'auto' }}>
              <option value="verbal">{t('Verbal', 'Verbal')}</option>
              <option value="paper_form">{t('Paper form', 'Formulario en papel')}</option>
              <option value="web_form">{t('Web form', 'Formulario web')}</option>
              <option value="other">{t('Other', 'Otro')}</option>
            </select>
          </div>
        )}

        <h3>{t('Agency coordination', 'Coordinación entre agencias')}</h3>
        <div className="two">
          <div className="field">
            <label htmlFor="agency">{t('Already placed here by another agency?', '¿Ya colocado aquí por otra agencia?')}</label>
            <select id="agency" value={form.agency_check} onChange={e => up({ agency_check: e.target.value })}>
              {AGENCY_CHECK.map(a => <option key={a.key} value={a.key}>{a[lang]}</option>)}
            </select>
          </div>
          <Field label={t('Note (operational only)', 'Nota (solo operativa)')} name="agency_note" value={form.agency_note} onChange={e => up({ agency_note: e.target.value })} maxLength={200} />
        </div>

        <div className="field">
          <label htmlFor="notes">{t('Professional notes', 'Observaciones profesionales')}</label>
          <textarea id="notes" rows={3} maxLength={1000} value={form.notes} onChange={e => up({ notes: e.target.value })} />
          <span className="hint">{t('Job-related facts only. No health, family, immigration, religion or other personal details.',
            'Solo hechos laborales. Sin salud, familia, situación migratoria, religión ni otros datos personales.')}</span>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? t('Saving…', 'Guardando…') : isNew ? t('Add candidate', 'Agregar candidato') : t('Save changes', 'Guardar cambios')}</button>
        </div>
      </form>

      {cand && <LogContact c={cand} onDone={load} />}
      {cand && <Messages c={cand} onDone={load} />}
      {cand && <TaskBox c={cand} tasks={tasks} onDone={load} />}
      {cand && <Timeline events={events} />}
      {cand && manage && <DeleteBox c={cand} />}
    </div>
  );
}

// ---------- pieces ----------
function QuickContact({ c, lang: lg }: { c: Candidate; lang: Lang }) {
  const { t } = useLang();
  if (!c.consent_contact) return <p className="small t-absent">{lg === 'es' ? 'Sin consentimiento de contacto: no contactar.' : 'No consent to contact: do not reach out.'}</p>;
  return (
    <div className="row" style={{ marginTop: 8 }}>
      {c.phone && <a className="btn btn-ghost small" href={telLink(c.phone)}>{t('Call', 'Llamar')} {formatPhone(c.phone)}</a>}
      {c.email && c.consent_email && <a className="btn btn-ghost small" href={`mailto:${c.email}`}>Email</a>}
    </div>
  );
}

function StageBox({ c, onDone }: { c: Candidate; onDone: () => void }) {
  const { t, lang } = useLang();
  const { setup } = useRecruiting();
  const [stage, setStage] = useState<Stage>(c.stage);
  const [reason, setReason] = useState(c.closed_reason ?? 'not_interested');
  const [recontact, setRecontact] = useState(c.recontact_on ?? '');
  const [err, setErr] = useState<string | null>(null);
  const visible = STAGES.filter(s => !setup.settings?.hidden_stages.includes(s.key) || s.key === c.stage);
  async function apply() {
    setErr(null);
    const patch: Record<string, unknown> = { stage };
    if (stage === 'closed') { patch.closed_reason = reason; patch.recontact_on = recontact || null; }
    const { error } = await supabase.from('candidates').update(patch).eq('id', c.id);
    if (error) setErr(friendlyError(error)); else onDone();
  }
  return (
    <section className="panel">
      <h2>{t('Pipeline stage', 'Etapa del proceso')}</h2>
      <ol className="phase-strip" aria-label={t('Phases', 'Fases')}>
        {(['lead', 'preselected', 'authorized', 'working'] as const).map(p => (
          <li key={p} data-on={phaseOf(c.stage) === p || undefined}>{p === 'lead' ? t('Interested', 'Interesado') : p === 'preselected' ? t('Pre-selected', 'Preseleccionado') : p === 'authorized' ? t('Authorized to work', 'Autorizado para trabajar') : t('Working', 'Trabajando')}</li>
        ))}
      </ol>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field" style={{ flex: '1 1 260px' }}>
          <label htmlFor="stage">{t('Stage', 'Etapa')}</label>
          <select id="stage" value={stage} onChange={e => setStage(e.target.value as Stage)}>
            {visible.map((s, i) => <option key={s.key} value={s.key}>{s.key === 'closed' ? '—' : `${i + 1}.`} {stageLabel(s.key, lang, setup.settings)}</option>)}
          </select>
        </div>
        {stage === 'closed' && (
          <>
            <div className="field">
              <label htmlFor="reason">{t('Reason', 'Motivo')}</label>
              <select id="reason" value={reason} onChange={e => setReason(e.target.value)}>
                {CLOSED_REASONS.map(r => <option key={r.key} value={r.key}>{r[lang]}</option>)}
              </select>
            </div>
            <Field label={t('Recontact on', 'Recontactar el')} name="recontact" type="date" value={recontact} onChange={e => setRecontact(e.target.value)} />
          </>
        )}
        <button className="btn btn-primary" disabled={stage === c.stage && stage !== 'closed'} onClick={apply}>{t('Update stage', 'Actualizar etapa')}</button>
      </div>
      {atLeast(stage, 'approved') && !atLeast(c.stage, 'approved') && (
        <p className="small muted">{t('Only move someone to “Approved” when the employer’s hiring process has actually approved them.',
          'Mueve a alguien a “Aprobado” solo cuando el proceso de contratación del empleador realmente lo haya aprobado.')}</p>
      )}
    </section>
  );
}

function HireBox({ c, shifts, onDone }: { c: Candidate; shifts: { id?: string; name: string }[]; onDone: () => void }) {
  const { t } = useLang();
  const { today } = useRecruiting();
  const [badge, setBadge] = useState('');
  const [shift, setShift] = useState(shifts[0]?.id ?? '');
  const [start, setStart] = useState(c.first_day ?? today);
  const [err, setErr] = useState<string | null>(null);
  async function hire(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const { error } = await supabase.rpc('hire_candidate', { cand: c.id, badge, shift: shift || null, start_on: start || null });
    if (error) setErr(/badge_in_other_warehouse/.test(error.message) ? t('That badge belongs to an employee of another warehouse.', 'Ese gafete pertenece a un empleado de otro almacén.')
      : /badge_linked/.test(error.message) ? t('That badge is already linked to another candidate.', 'Ese gafete ya está vinculado a otro candidato.') : friendlyError(error));
    else onDone();
  }
  return (
    <form className="panel" onSubmit={hire}>
      <h2>{t('Add to the employee roster', 'Agregar a la lista de empleados')}</h2>
      <p className="muted small">{t('Creates (or links) the employee with this badge, so the first day and retention come from real attendance.',
        'Crea (o vincula) al empleado con este gafete, para que el primer día y la retención salgan de la asistencia real.')}</p>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="row" style={{ alignItems: 'end' }}>
        <Field label={t('Badge ID', 'Número de gafete')} name="badge" value={badge} onChange={e => setBadge(e.target.value)} required maxLength={40} />
        <div className="field">
          <label htmlFor="hshift">{t('Shift', 'Turno')}</label>
          <select id="hshift" value={shift} onChange={e => setShift(e.target.value)}>
            <option value="">—</option>
            {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <Field label={t('Start date', 'Fecha de inicio')} name="start" type="date" value={start} onChange={e => setStart(e.target.value)} />
        <button className="btn btn-go" disabled={!badge.trim()}>{t('Add to roster', 'Agregar')}</button>
      </div>
    </form>
  );
}

function LogContact({ c, onDone }: { c: Candidate; onDone: () => void }) {
  const { t, lang } = useLang();
  const [kind, setKind] = useState('call');
  const [outcome, setOutcome] = useState('reached');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function add(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const { error } = await supabase.from('candidate_events').insert({
      candidate_id: c.id, organization_id: c.organization_id, kind, outcome: kind === 'note' ? null : outcome, body: body.trim() || null,
    });
    if (error) setErr(friendlyError(error)); else { setBody(''); onDone(); }
  }
  return (
    <form className="panel" onSubmit={add}>
      <h2>{t('Log a contact', 'Registrar un contacto')}</h2>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field">
          <label htmlFor="ek">{t('Type', 'Tipo')}</label>
          <select id="ek" value={kind} onChange={e => setKind(e.target.value)}>
            {EVENT_KINDS.filter(k => !['stage_change', 'message_prepared'].includes(k.key)).map(k => <option key={k.key} value={k.key}>{k[lang]}</option>)}
          </select>
        </div>
        {kind !== 'note' && (
          <div className="field">
            <label htmlFor="eo">{t('Result', 'Resultado')}</label>
            <select id="eo" value={outcome} onChange={e => setOutcome(e.target.value)}>
              {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o[lang]}</option>)}
            </select>
          </div>
        )}
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="eb">{t('Summary', 'Resumen')}</label>
          <input id="eb" value={body} maxLength={500} onChange={e => setBody(e.target.value)} />
        </div>
        <button className="btn btn-primary">{t('Save', 'Guardar')}</button>
      </div>
    </form>
  );
}

function Messages({ c, onDone }: { c: Candidate; onDone: () => void }) {
  const { t } = useLang();
  const { setup } = useRecruiting();
  const [templates, setTemplates] = useState<Template[]>([]);
  const msgLang: Lang = c.preferred_language === 'es' ? 'es' : 'en';
  const [code, setCode] = useState('');
  const [me, setMe] = useState(readMe);
  const [extra, setExtra] = useState({ date: '', time: '', place: '' });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    supabase.from('message_templates').select('*').eq('organization_id', c.organization_id).eq('is_active', true).order('sort_order')
      .then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, [c.organization_id]);
  const forLang = templates.filter(x => x.lang === msgLang && !['facebook', 'video_script', 'flyer'].includes(x.channel));
  const tpl = forLang.find(x => x.code === code) ?? forLang[0];
  const opening = setup.openings.find(o => o.id === c.opening_id);
  const text = useMemo(() => tpl ? fillTemplate(tpl.body, {
    first_name: c.first_name, my_name: me.name || undefined, my_phone: me.phone || undefined,
    company: setup.settings?.public_name, position: opening ? label(POSITIONS, opening.position, msgLang) : undefined,
    shift: c.shifts_available.map(s => label(SHIFT_OPTIONS, s, msgLang)).join(' / ') || undefined,
    apply_link: me.apply || undefined, date: extra.date || undefined, time: extra.time || undefined, place: extra.place || undefined,
  }) : '', [tpl, me, extra, c, opening]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = [...new Set(text.match(/\{\w+\}/g) ?? [])];
  const saveMe = (patch: Partial<typeof me>) => { const n = { ...me, ...patch }; setMe(n); try { localStorage.setItem(ME_KEY, JSON.stringify(n)); } catch { /* ok */ } };
  async function logSent(channel: string) {
    await supabase.from('candidate_events').insert({ candidate_id: c.id, organization_id: c.organization_id, kind: channel, outcome: 'sent', body: `${tpl?.title}` });
    onDone();
  }
  if (!c.consent_contact) return null;
  return (
    <section className="panel">
      <h2>{t('Prepare a message', 'Preparar un mensaje')}</h2>
      <p className="small muted">{t(`Uses the ${msgLang === 'es' ? 'Spanish' : 'English'} version (the candidate’s language). Nothing is sent automatically: you review it and send it from your phone or email.`,
        `Usa la versión en ${msgLang === 'es' ? 'español' : 'inglés'} (idioma del candidato). Nada se envía automáticamente: tú lo revisas y lo envías desde tu teléfono o correo.`)}</p>
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="tpl">{t('Template', 'Plantilla')}</label>
          <select id="tpl" value={tpl?.code ?? ''} onChange={e => setCode(e.target.value)}>
            {forLang.map(x => <option key={x.id} value={x.code}>{x.title}</option>)}
          </select>
        </div>
        <Field label={t('My name', 'Mi nombre')} name="me_name" value={me.name} onChange={e => saveMe({ name: e.target.value })} />
        <Field label={t('My work phone', 'Mi teléfono de trabajo')} name="me_phone" value={me.phone} onChange={e => saveMe({ phone: e.target.value })} />
      </div>
      {/\{(date|time|place|apply_link)\}/.test(tpl?.body ?? '') && (
        <div className="row">
          {/\{date\}/.test(tpl!.body) && <Field label={t('Date', 'Fecha')} name="m_date" value={extra.date} onChange={e => setExtra({ ...extra, date: e.target.value })} />}
          {/\{time\}/.test(tpl!.body) && <Field label={t('Time', 'Hora')} name="m_time" value={extra.time} onChange={e => setExtra({ ...extra, time: e.target.value })} />}
          {/\{place\}/.test(tpl!.body) && <Field label={t('Place', 'Lugar')} name="m_place" value={extra.place} onChange={e => setExtra({ ...extra, place: e.target.value })} />}
          {/\{apply_link\}/.test(tpl!.body) && <Field label={t('Official application link', 'Enlace de la solicitud oficial')} name="m_apply" value={me.apply} onChange={e => saveMe({ apply: e.target.value })} />}
        </div>
      )}
      <pre className="message-preview">{text}</pre>
      {missing.length > 0 && <p className="small t-absent">{t('Fill in before sending: ', 'Completa antes de enviar: ')}{missing.join(' ')}</p>}
      <div className="row">
        <button className="btn btn-ghost" type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? t('Copied', 'Copiado') : t('Copy', 'Copiar')}
        </button>
        {c.phone && c.consent_sms && <a className="btn btn-ghost" href={smsLink(c.phone, text)} onClick={() => logSent('sms')}>{t('Open in Messages', 'Abrir en Mensajes')}</a>}
        {c.phone && c.consent_whatsapp && <a className="btn btn-ghost" href={waLink(c.phone, text)} target="_blank" rel="noopener" onClick={() => logSent('whatsapp')}>WhatsApp</a>}
        {c.email && c.consent_email && <a className="btn btn-ghost" href={mailLink(c.email, tpl?.title ?? '', text)} onClick={() => logSent('email')}>Email</a>}
      </div>
    </section>
  );
}

function TaskBox({ c, tasks: list, onDone }: { c: Candidate; tasks: Task[]; onDone: () => void }) {
  const { t } = useLang();
  const { today } = useRecruiting();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase.from('recruitment_tasks').insert({ organization_id: c.organization_id, candidate_id: c.id, kind: 'follow_up', title: title.trim(), due_on: due });
    setTitle(''); onDone();
  }
  async function toggle(task: Task) {
    await supabase.from('recruitment_tasks').update({ done_at: task.done_at ? null : new Date().toISOString() }).eq('id', task.id);
    onDone();
  }
  return (
    <section className="panel">
      <h2>{t('Tasks', 'Tareas')}</h2>
      {list.length ? (
        <ul className="task-list">
          {list.map(task => (
            <li key={task.id} data-done={!!task.done_at || undefined}>
              <label className="check"><input type="checkbox" checked={!!task.done_at} onChange={() => toggle(task)} />
                <span>{task.title} <span className={`small ${!task.done_at && task.due_on < today ? 't-absent' : 'muted'}`}>· {task.due_on}</span></span></label>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t('No tasks.', 'Sin tareas.')}</p>}
      <form className="row" onSubmit={add} style={{ alignItems: 'end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="nt">{t('New follow-up', 'Nuevo seguimiento')}</label>
          <input id="nt" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} />
        </div>
        <Field label={t('Due', 'Fecha')} name="due" type="date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="btn btn-ghost">{t('Add', 'Agregar')}</button>
      </form>
    </section>
  );
}

function Timeline({ events: list }: { events: CandidateEvent[] }) {
  const { t, lang } = useLang();
  const { setup } = useRecruiting();
  const name = (uid: string | null) => setup.members.find(m => m.user_id === uid)?.name ?? (uid ? t('Team member', 'Miembro del equipo') : t('Pre-registration form', 'Formulario de preinscripción'));
  return (
    <section className="panel">
      <h2>{t('History', 'Historial')}</h2>
      <ol className="timeline">
        {list.map(ev => (
          <li key={ev.id}>
            <span className="small muted">{new Date(ev.created_at).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })} · {name(ev.created_by)}</span>
            <span>
              <strong>{label(EVENT_KINDS, ev.kind, lang)}</strong>
              {ev.kind === 'stage_change' && <> → {ev.stage_to && stageLabel(ev.stage_to, lang, setup.settings)}</>}
              {ev.outcome && <> · {label(OUTCOMES, ev.outcome, lang)}</>}
              {ev.body && <> — {ev.body}</>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeleteBox({ c }: { c: Candidate }) {
  const { t } = useLang();
  const nav = useNavigate();
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    const { error } = await supabase.from('candidates').delete().eq('id', c.id);
    if (error) setErr(friendlyError(error)); else nav('/recruiting/candidates', { replace: true });
  }
  return (
    <section className="panel">
      <h2>{t('Delete this record', 'Eliminar este registro')}</h2>
      <p className="muted small">{t('For duplicates and for people who ask to be removed. Deletes the profile, contact history and tasks. Cannot be undone.',
        'Para duplicados y para personas que piden ser eliminadas. Borra el perfil, el historial de contacto y las tareas. No se puede deshacer.')}</p>
      {err && <Notice kind="error">{err}</Notice>}
      {sure ? (
        <div className="row">
          <button className="btn danger-fill" onClick={del}>{t('Yes, delete permanently', 'Sí, eliminar definitivamente')}</button>
          <button className="btn btn-ghost" onClick={() => setSure(false)}>{t('Cancel', 'Cancelar')}</button>
        </div>
      ) : <div><button className="btn btn-ghost danger" onClick={() => setSure(true)}>{t('Delete…', 'Eliminar…')}</button></div>}
    </section>
  );
}
