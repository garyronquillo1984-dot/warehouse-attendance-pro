import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import {
  STAGES, PHASES, SHIFT_OPTIONS, POSITIONS, LANGUAGES, AGENCY_CHECK, phaseOf, stageLabel, label, formatPhone,
  candidateName, readiness, READINESS_REASONS, type Candidate, type Phase,
} from '../../lib/recruiting';
import { Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates, exportTable } from './data';

const daysSince = (iso: string | null, today: string) => iso ? Math.floor((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 864e5) : null;

export default function Candidates() {
  const { org, manage, ws, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const nav = useNavigate();
  const { list, error } = useCandidates(org.organization_id);
  const [params, setParams] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const stale = setup.settings?.stale_days ?? 3;
  const sourceName = useMemo(() => Object.fromEntries(setup.sources.map(s => [s.id, s.name])), [setup.sources]);

  const filtered = useMemo(() => {
    const needle = get('q').trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return (list ?? []).filter(c => {
      const phase = get('phase'); const stage = get('stage');
      if (phase ? phaseOf(c.stage) !== phase : !stage && !get('all') && c.stage === 'closed') return false;
      if (stage && c.stage !== stage) return false;
      if (get('wh') && c.warehouse_id !== get('wh')) return false;
      if (get('source') && c.source_id !== get('source')) return false;
      if (get('shift') && !c.shifts_available.includes(get('shift'))) return false;
      if (get('position') && !c.positions_wanted.includes(get('position')) && !c.experience.includes(get('position'))) return false;
      if (get('lang') && c.preferred_language !== get('lang')) return false;
      if (get('ready') && c.available_from && c.available_from > today) return false;
      if (get('dup') && !c.possible_duplicate_of) return false;
      if (get('hold') && c.agency_check !== 'other_agency_reported') return false;
      if (get('stale')) {
        const d = daysSince(c.last_contact_at ?? c.registered_at, today);
        if (c.stage === 'closed' || phaseOf(c.stage) === 'working' || d === null || d < stale) return false;
      }
      if (needle && !(`${c.first_name} ${c.last_name}`.toLowerCase().includes(needle)
          || (c.email ?? '').includes(needle) || (digits.length >= 3 && (c.phone ?? '').includes(digits)))) return false;
      return true;
    });
  }, [list, params, today, stale]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list) return <Loading label={t('Loading…', 'Cargando…')} />;

  const whName = (id: string) => ws.warehouses.find(w => w.id === id)?.name ?? '';
  const rows = filtered.map(c => [
    candidateName(c), formatPhone(c.phone), c.email ?? '', c.city ?? '', c.zip ?? '', label(LANGUAGES, c.preferred_language, lang),
    stageLabel(c.stage, lang, setup.settings), c.source_id ? sourceName[c.source_id] ?? '' : '', c.registered_at.slice(0, 10),
    c.shifts_available.map(s => label(SHIFT_OPTIONS, s, lang)).join(', '), c.available_from ?? '',
    c.last_contact_at?.slice(0, 10) ?? '', c.next_action ?? '', c.consent_contact ? t('Yes', 'Sí') : t('No', 'No'),
    c.is_sample ? 'SAMPLE' : '',
  ]);
  async function doExport(kind: 'csv' | 'xlsx') {
    setMsg(null);
    try {
      await exportTable(org.organization_id, kind, {
        title: t('Candidates', 'Candidatos'), description: '', wide: true,
        columns: [t('Name', 'Nombre'), t('Phone', 'Teléfono'), 'Email', t('City', 'Ciudad'), 'ZIP', t('Language', 'Idioma'),
          t('Stage', 'Etapa'), t('Source', 'Fuente'), t('Registered', 'Registro'), t('Shifts', 'Turnos'), t('Available from', 'Disponible desde'),
          t('Last contact', 'Último contacto'), t('Next action', 'Próxima acción'), t('Consent', 'Consentimiento'), t('Sample', 'Ejemplo')],
        rows,
      }, { company: org.name, scope: t('Candidates (filtered)', 'Candidatos (filtrados)'), period: today, from: today, to: today });
    } catch (e) { setMsg(friendlyError(e)); }
  }

  const sel = (k: string, name: string, opts: [string, string][], all: string) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{name}</label>
      <select id={`f-${k}`} value={get(k)} onChange={e => set(k, e.target.value)}>
        <option value="">{all}</option>
        {opts.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </div>
  );
  const toggle = (k: string, text: string) => (
    <button type="button" className="chip" aria-pressed={!!get(k)} onClick={() => set(k, get(k) ? '' : '1')}>{text}</button>
  );

  return (
    <div className="stack-lg">
      <div className="page-head row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t('Candidates', 'Candidatos')}</h1>
          <p className="muted">{t(`${filtered.length} of ${list.length} shown`, `${filtered.length} de ${list.length} mostrados`)}</p>
        </div>
        <div className="row">
          {manage && <button className="btn btn-ghost" onClick={() => doExport('csv')}>CSV</button>}
          {manage && <button className="btn btn-ghost" onClick={() => doExport('xlsx')}>Excel</button>}
          <Link className="btn btn-primary" to="/recruiting/candidates/new">{t('Add candidate', 'Agregar candidato')}</Link>
        </div>
      </div>
      {(error || msg) && <Notice kind="error">{error || msg}</Notice>}

      <div className="filters">
        <div className="field grow">
          <label htmlFor="f-q">{t('Search', 'Buscar')}</label>
          <input id="f-q" type="search" value={get('q')} onChange={e => set('q', e.target.value)}
                 placeholder={t('Name, phone or email', 'Nombre, teléfono o correo')} />
        </div>
        {sel('phase', t('Phase', 'Fase'), PHASES.map(p => [p.key, p[lang]]), t('All open', 'Todos abiertos'))}
        {sel('stage', t('Stage', 'Etapa'), STAGES.map(s => [s.key, stageLabel(s.key, lang, setup.settings)]), t('Any stage', 'Cualquier etapa'))}
        {ws.warehouses.length > 1 && sel('wh', t('Warehouse', 'Almacén'), ws.warehouses.map(w => [w.id, w.name]), t('All', 'Todos'))}
        {sel('source', t('Source', 'Fuente'), setup.sources.map(s => [s.id, s.name]), t('All sources', 'Todas las fuentes'))}
        {sel('shift', t('Shift', 'Turno'), SHIFT_OPTIONS.map(s => [s.key, s[lang]]), t('Any shift', 'Cualquier turno'))}
        {sel('position', t('Role / experience', 'Puesto / experiencia'), POSITIONS.map(p => [p.key, p[lang]]), t('Any', 'Cualquiera'))}
        {sel('lang', t('Language', 'Idioma'), LANGUAGES.map(x => [x.key, x[lang]]), t('Any', 'Cualquiera'))}
      </div>
      <div className="chips">
        {toggle('ready', t('Available now', 'Disponibles ya'))}
        {toggle('stale', t(`No contact in ${stale}+ days`, `Sin contacto ${stale}+ días`))}
        {toggle('dup', t('Possible duplicates', 'Posibles duplicados'))}
        {toggle('hold', t('Agency hold', 'En espera (otra agencia)'))}
        {toggle('all', t('Include closed', 'Incluir cerrados'))}
      </div>

      {!list.length ? (
        <section className="panel empty">
          <h2>{t('No candidates yet', 'Aún no hay candidatos')}</h2>
          <p className="muted">{t('Add people as you meet them, or share a pre-registration QR code from “Sources & QR”. To try the screens first, load the sample data from the Dashboard.',
            'Agrega personas a medida que las conoces, o comparte un código QR de preinscripción desde “Fuentes y QR”. Para probar las pantallas, carga los datos de ejemplo desde el Panel.')}</p>
        </section>
      ) : (
        <section className="panel flush">
          {!filtered.length ? <p className="muted pad">{t('No one matches these filters.', 'Nadie coincide con estos filtros.')}</p> : (
            <table className="emp-table">
              <thead><tr>
                <th>{t('Name', 'Nombre')}</th><th>{t('Stage', 'Etapa')}</th><th>{t('Phone', 'Teléfono')}</th>
                <th>{t('Shifts', 'Turnos')}</th><th>{t('Last contact', 'Último contacto')}</th><th>{t('Next action', 'Próxima acción')}</th>
              </tr></thead>
              <tbody>
                {filtered.slice(0, 500).map(c => <Row key={c.id} c={c} today={today} onOpen={() => nav(`/recruiting/candidates/${c.id}`)} whName={ws.warehouses.length > 1 ? whName(c.warehouse_id) : ''} />)}
              </tbody>
            </table>
          )}
          {filtered.length > 500 && <p className="muted pad small">{t('Showing the first 500. Narrow the filters to see the rest.', 'Se muestran los primeros 500. Ajusta los filtros para ver el resto.')}</p>}
        </section>
      )}
    </div>
  );
}

function Row({ c, today, onOpen, whName: wn }: { c: Candidate; today: string; onOpen: () => void; whName: string }) {
  const { t, lang } = useLang();
  const { setup } = useRecruiting();
  const d = daysSince(c.last_contact_at, today);
  const r = readiness(c, today);
  const phase: Phase = phaseOf(c.stage);
  return (
    <tr className="clickable" onClick={onOpen}>
      <td data-label={t('Name', 'Nombre')}>
        <Link to={`/recruiting/candidates/${c.id}`} onClick={e => e.stopPropagation()}>{candidateName(c)}</Link>
        {c.is_sample && <span className="tag tag-sample">{t('Sample', 'Ejemplo')}</span>}
        {c.possible_duplicate_of && <span className="tag tag-warn">{t('Possible duplicate', 'Posible duplicado')}</span>}
        {c.agency_check === 'other_agency_reported' && <span className="tag tag-warn" title={label(AGENCY_CHECK, c.agency_check, lang)}>{t('Agency hold', 'Otra agencia')}</span>}
        {wn && <span className="tag">{wn}</span>}
        <div className="small muted" title={r.reasons.map(k => READINESS_REASONS[k][lang]).join(', ')}>
          {t('Readiness', 'Preparación')} {r.score}
        </div>
      </td>
      <td data-label={t('Stage', 'Etapa')}><span className={`stage stage-${phase}`}>{stageLabel(c.stage, lang, setup.settings)}</span></td>
      <td data-label={t('Phone', 'Teléfono')} className="mono">{formatPhone(c.phone) || <span className="muted">{c.email}</span>}</td>
      <td data-label={t('Shifts', 'Turnos')}>{c.shifts_available.map(s => label(SHIFT_OPTIONS, s, lang)).join(', ') || <span className="muted">—</span>}</td>
      <td data-label={t('Last contact', 'Último contacto')}>
        {d === null ? <span className="muted">{t('Never', 'Nunca')}</span> : d === 0 ? t('Today', 'Hoy') : t(`${d} d ago`, `hace ${d} d`)}
      </td>
      <td data-label={t('Next action', 'Próxima acción')}>
        {c.next_action ? <>{c.next_action}{c.next_action_due && <span className={`small ${c.next_action_due < today ? 't-absent' : 'muted'}`}> · {c.next_action_due}</span>}</> : <span className="muted">—</span>}
      </td>
    </tr>
  );
}
