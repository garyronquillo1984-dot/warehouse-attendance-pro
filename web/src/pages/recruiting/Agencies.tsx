import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import { POSITIONS, label, inPool, atLeast } from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates } from './data';

interface Agency { id: string; name: string; rep_name: string | null; phone: string | null; email: string | null; scope_note: string | null; is_active: boolean }
interface Entry { id: string; kind: string; occurred_on: string; title: string; agency_id: string | null; attendees: string | null; summary: string | null; decisions: string | null; follow_up: string | null; status: string; created_at: string }

const ENTRY_KINDS: Record<string, [string, string]> = {
  meeting: ['Coordination meeting', 'Reunión de coordinación'], client_request: ['Client request', 'Solicitud del cliente'],
  escalation: ['Escalation to supervisor', 'Escalamiento al supervisor'], handoff: ['Handoff / shared coverage', 'Traspaso / cobertura compartida'],
  agreement: ['Agreement', 'Acuerdo'], note: ['Note', 'Nota'],
};

export default function Agencies() {
  const { org, manage, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const { list } = useCandidates(org.organization_id);
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [agencyForm, setAgencyForm] = useState<Partial<Agency> | null>(null);
  const [entry, setEntry] = useState<Partial<Entry> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [a, e] = await Promise.all([
      supabase.from('partner_agencies').select('*').eq('organization_id', org.organization_id).order('name'),
      supabase.from('coordination_entries').select('*').eq('organization_id', org.organization_id).order('occurred_on', { ascending: false }).limit(300),
    ]);
    setAgencies((a.data ?? []) as Agency[]); setEntries((e.data ?? []) as Entry[]);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!agencies || !list) return <Loading label={t('Loading…', 'Cargando…')} />;

  async function saveAgency(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const a = agencyForm!;
    const row = { name: a.name?.trim(), rep_name: a.rep_name?.trim() || null, phone: a.phone?.trim() || null, email: a.email?.trim() || null, scope_note: a.scope_note?.trim() || null, is_active: a.is_active ?? true };
    const res = a.id ? await supabase.from('partner_agencies').update(row).eq('id', a.id) : await supabase.from('partner_agencies').insert({ ...row, organization_id: org.organization_id });
    if (res.error) setErr(friendlyError(res.error)); else { setAgencyForm(null); load(); }
  }
  async function saveEntry(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const x = entry!;
    const { data: u } = await supabase.auth.getUser();
    const row = { kind: x.kind ?? 'note', occurred_on: x.occurred_on || today, title: x.title?.trim(), agency_id: x.agency_id || null,
      attendees: x.attendees?.trim() || null, summary: x.summary?.trim() || null, decisions: x.decisions?.trim() || null, follow_up: x.follow_up?.trim() || null, status: x.status ?? 'open' };
    const res = x.id ? await supabase.from('coordination_entries').update(row).eq('id', x.id)
      : await supabase.from('coordination_entries').insert({ ...row, organization_id: org.organization_id, created_by: u.user?.id });
    if (res.error) setErr(friendlyError(res.error)); else { setEntry(null); load(); }
  }

  // Joint needs summary: openings and pool sizes only — never names or contact details.
  const authorized = setup.openings.filter(o => o.status === 'authorized');
  const needs = authorized.map(o => {
    const placed = list.filter(c => c.opening_id === o.id && atLeast(c.stage, 'assigned')).length;
    return `• ${o.title} (${label(POSITIONS, o.position, lang)}): ${t('needed', 'necesarias')} ${o.headcount}, ${t('placed by us', 'colocadas por nosotros')} ${placed}, ${t('our ready pool', 'nuestro grupo listo')} ${list.filter(c => inPool(c, o)).length}`;
  });
  const openIssues = entries.filter(x => x.status === 'open');
  const agenda = [
    t(`Weekly coordination — ${today}`, `Coordinación semanal — ${today}`),
    t('1. Client needs this week (from the site contact)', '1. Necesidades del cliente esta semana (según el contacto del sitio)'),
    ...(needs.length ? needs : [t('• (add authorized openings)', '• (agregar vacantes autorizadas)')]),
    t('2. Coverage: which agency covers which positions / shifts', '2. Cobertura: qué agencia cubre qué puestos / turnos'),
    t(`3. Open items: ${openIssues.length}`, `3. Pendientes abiertos: ${openIssues.length}`),
    ...openIssues.slice(0, 10).map(x => `• ${x.title}`),
    t('4. Attendance / first-day issues to report to the client (no personal data in shared notes)', '4. Problemas de asistencia / primer día para reportar al cliente (sin datos personales en notas compartidas)'),
    t('5. Agreements and owners', '5. Acuerdos y responsables'),
  ].join('\n');

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>{t('Inter-agency coordination', 'Coordinación entre agencias')}</h1>
        <p className="muted">{t('The client wants agencies to work together, not compete. This page keeps the shared operational picture; it never shares candidate data.',
          'El cliente quiere que las agencias trabajen juntas, no que compitan. Esta página mantiene la información operativa compartida; nunca comparte datos de candidatos.')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}

      <section className="panel">
        <h2>{t('Protocol — the rules we follow', 'Protocolo — las reglas que seguimos')}</h2>
        <ol className="protocol">
          <li>{t('Introduce yourself to each agency representative and the client contact in week 1. Agree on one channel for daily coordination.', 'Preséntate con cada representante de agencia y con el contacto del cliente en la semana 1. Acuerden un canal para la coordinación diaria.')}</li>
          <li>{t('Respect assignments: never contact a worker placed here by another agency to move them. If a candidate says they are with another agency here, mark “Agency hold” and escalate.', 'Respeta las asignaciones: nunca contactes a un trabajador colocado aquí por otra agencia para transferirlo. Si un candidato dice que está con otra agencia aquí, marca “Otra agencia” y escala.')}</li>
          <li>{t('Share only authorized operational information: openings, headcount, shifts, schedules, site rules. Do not share candidate lists or personal data without written authorization and a legal basis.', 'Comparte solo información operativa autorizada: vacantes, cantidad de personas, turnos, horarios, reglas del sitio. No compartas listas de candidatos ni datos personales sin autorización escrita y base legal.')}</li>
          <li>{t('Duplicates: check the candidate database before registering (the app flags same phone/email/name+ZIP). If a person is already in process with another agency, they stay with that agency.', 'Duplicados: revisa la base antes de registrar (la app marca mismo teléfono/correo/nombre+código postal). Si una persona ya está en proceso con otra agencia, se queda con esa agencia.')}</li>
          <li>{t('Client needs come from the client contact, recorded here as “Client request”, so every agency works from the same numbers.', 'Las necesidades del cliente vienen del contacto del cliente y se registran aquí como “Solicitud del cliente”, para que todas las agencias trabajen con las mismas cifras.')}</li>
          <li>{t('Problems you cannot solve between agencies go to your supervisor the same day (“Escalation”), with facts only.', 'Los problemas que no se resuelvan entre agencias van a tu supervisor el mismo día (“Escalamiento”), solo con hechos.')}</li>
          <li>{t('Weekly coordination meeting, same day and time each week. A joint needs report is shared only when the client and employers approve it.', 'Reunión de coordinación semanal, mismo día y hora. El reporte conjunto de necesidades se comparte solo si el cliente y los empleadores lo aprueban.')}</li>
          <li>{t('We measure service to the client (openings covered, first-day attendance, retention, response time) — never “wins” against other agencies.', 'Medimos el servicio al cliente (vacantes cubiertas, asistencia al primer día, retención, tiempo de respuesta) — nunca “victorias” contra otras agencias.')}</li>
        </ol>
      </section>

      <section className="panel">
        <h2>{t('Weekly meeting agenda (copy and share)', 'Agenda de la reunión semanal (copiar y compartir)')}</h2>
        <p className="small muted">{t('Contains openings and counts only — no names or contact details.', 'Contiene solo vacantes y cantidades — sin nombres ni datos de contacto.')}</p>
        <pre className="message-preview">{agenda}</pre>
        <div><button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(agenda); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? t('Copied', 'Copiado') : t('Copy agenda', 'Copiar agenda')}</button></div>
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('Coordination log', 'Registro de coordinación')}</h2>
          {!entry && <button className="btn btn-primary" onClick={() => setEntry({ kind: 'meeting', occurred_on: today, status: 'open' })}>{t('Add entry', 'Agregar registro')}</button>}
        </div>
        {entry && (
          <form className="stack member-edit" onSubmit={saveEntry}>
            <div className="two">
              <div className="field"><label htmlFor="e-kind">{t('Type', 'Tipo')}</label>
                <select id="e-kind" value={entry.kind} onChange={e => setEntry({ ...entry, kind: e.target.value })}>
                  {Object.entries(ENTRY_KINDS).map(([k, v]) => <option key={k} value={k}>{v[lang === 'es' ? 1 : 0]}</option>)}</select></div>
              <Field label={t('Date', 'Fecha')} name="e-date" type="date" value={entry.occurred_on ?? today} onChange={e => setEntry({ ...entry, occurred_on: e.target.value })} />
              <Field label={t('Title', 'Título')} name="e-title" value={entry.title ?? ''} onChange={e => setEntry({ ...entry, title: e.target.value })} required maxLength={160} />
              <div className="field"><label htmlFor="e-ag">{t('Agency', 'Agencia')}</label>
                <select id="e-ag" value={entry.agency_id ?? ''} onChange={e => setEntry({ ...entry, agency_id: e.target.value || null })}>
                  <option value="">—</option>{agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <Field label={t('Attendees (roles)', 'Asistentes (cargos)')} name="e-att" value={entry.attendees ?? ''} onChange={e => setEntry({ ...entry, attendees: e.target.value })} maxLength={300} />
              <div className="field"><label htmlFor="e-st">{t('Status', 'Estado')}</label>
                <select id="e-st" value={entry.status} onChange={e => setEntry({ ...entry, status: e.target.value })}>
                  <option value="open">{t('Open', 'Abierto')}</option><option value="resolved">{t('Resolved', 'Resuelto')}</option></select></div>
            </div>
            <div className="field"><label htmlFor="e-sum">{t('Summary (operational only, no candidate personal data)', 'Resumen (solo operativo, sin datos personales de candidatos)')}</label>
              <textarea id="e-sum" rows={3} maxLength={2000} value={entry.summary ?? ''} onChange={e => setEntry({ ...entry, summary: e.target.value })} /></div>
            <Field label={t('Decisions', 'Decisiones')} name="e-dec" value={entry.decisions ?? ''} onChange={e => setEntry({ ...entry, decisions: e.target.value })} maxLength={1000} />
            <Field label={t('Follow-up (who / when)', 'Seguimiento (quién / cuándo)')} name="e-fu" value={entry.follow_up ?? ''} onChange={e => setEntry({ ...entry, follow_up: e.target.value })} maxLength={500} />
            <div className="row"><button className="btn btn-primary">{t('Save', 'Guardar')}</button><button type="button" className="btn btn-ghost" onClick={() => setEntry(null)}>{t('Cancel', 'Cancelar')}</button></div>
          </form>
        )}
        {entries.length ? (
          <ul className="activity-list">
            {entries.map(x => (
              <li key={x.id} className="clickable" onClick={() => setEntry(x)} data-status={x.status}>
                <span className="mono small">{x.occurred_on}</span>
                <span><strong>{x.title}</strong> <span className="small muted">· {ENTRY_KINDS[x.kind][lang === 'es' ? 1 : 0]}{x.agency_id ? ` · ${agencies.find(a => a.id === x.agency_id)?.name}` : ''}</span>
                  {x.decisions && <span className="small"> — {x.decisions}</span>}</span>
                <span className={`status-pill s-${x.status === 'open' ? 'pending_confirmation' : 'done'}`}>{x.status === 'open' ? t('Open', 'Abierto') : t('Resolved', 'Resuelto')}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('No entries yet.', 'Aún no hay registros.')}</p>}
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('Agencies at this client', 'Agencias en este cliente')}</h2>
          {manage && !agencyForm && <button className="btn btn-ghost" onClick={() => setAgencyForm({ is_active: true })}>{t('Add agency', 'Agregar agencia')}</button>}
        </div>
        <p className="small muted">{t('Business contact details of the representatives only, as they shared them with you.', 'Solo datos de contacto laboral de los representantes, tal como te los compartieron.')}</p>
        {agencyForm && (
          <form className="stack member-edit" onSubmit={saveAgency}>
            <div className="two">
              <Field label={t('Agency', 'Agencia')} name="g-name" value={agencyForm.name ?? ''} onChange={e => setAgencyForm({ ...agencyForm, name: e.target.value })} required maxLength={120} />
              <Field label={t('Representative', 'Representante')} name="g-rep" value={agencyForm.rep_name ?? ''} onChange={e => setAgencyForm({ ...agencyForm, rep_name: e.target.value })} maxLength={120} />
              <Field label={t('Work phone', 'Teléfono de trabajo')} name="g-phone" value={agencyForm.phone ?? ''} onChange={e => setAgencyForm({ ...agencyForm, phone: e.target.value })} maxLength={40} />
              <Field label={t('Work email', 'Correo de trabajo')} name="g-email" value={agencyForm.email ?? ''} onChange={e => setAgencyForm({ ...agencyForm, email: e.target.value })} maxLength={160} />
            </div>
            <Field label={t('Coverage (positions / shifts they handle)', 'Cobertura (puestos / turnos que manejan)')} name="g-scope" value={agencyForm.scope_note ?? ''} onChange={e => setAgencyForm({ ...agencyForm, scope_note: e.target.value })} maxLength={500} />
            <div className="row"><button className="btn btn-primary">{t('Save', 'Guardar')}</button><button type="button" className="btn btn-ghost" onClick={() => setAgencyForm(null)}>{t('Cancel', 'Cancelar')}</button></div>
          </form>
        )}
        <ul className="team-list">
          {agencies.map(a => (
            <li key={a.id}>
              <div className="who"><span className="name">{a.name}</span>
                <span className="meta">{[a.rep_name, a.phone, a.email].filter(Boolean).join(' · ')}{a.scope_note ? ` — ${a.scope_note}` : ''}</span></div>
              {manage && <button className="btn btn-ghost small" onClick={() => setAgencyForm(a)}>{t('Edit', 'Editar')}</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
