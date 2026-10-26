import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import { STAGES, PHASES, SHIFT_OPTIONS, stageLabel, candidateName, readiness, type Stage } from '../../lib/recruiting';
import { Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates } from './data';

// Board by stage, grouped into the four phases. Moving a card is one select away.
export default function Pipeline() {
  const { org, ws, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const { list, reload } = useCandidates(org.organization_id);
  const [wh, setWh] = useState('');
  const [shift, setShift] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const hidden = setup.settings?.hidden_stages ?? [];

  const byStage = useMemo(() => {
    const m = new Map<Stage, NonNullable<typeof list>>();
    (list ?? []).filter(c => (!wh || c.warehouse_id === wh) && (!shift || c.shifts_available.includes(shift)))
      .forEach(c => m.set(c.stage, [...(m.get(c.stage) ?? []), c]));
    m.forEach(v => v.sort((a, b) => readiness(b, today).score - readiness(a, today).score));
    return m;
  }, [list, wh, shift, today]);

  if (!list) return <Loading label={t('Loading…', 'Cargando…')} />;

  async function move(id: string, stage: Stage) {
    setErr(null);
    const { error } = await supabase.from('candidates').update(stage === 'closed' ? { stage, closed_reason: 'other' } : { stage }).eq('id', id);
    if (error) setErr(friendlyError(error)); else reload();
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>{t('Selection and hiring pipeline', 'Pipeline de selección y contratación')}</h1>
        <p className="muted">{t('Interested, pre-selected and authorized to work are separate phases. Cards are sorted by readiness.',
          'Interesado, preseleccionado y autorizado para trabajar son fases distintas. Las tarjetas se ordenan por preparación.')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="filters">
        {ws.warehouses.length > 1 && (
          <div className="field"><label htmlFor="p-wh">{t('Warehouse', 'Almacén')}</label>
            <select id="p-wh" value={wh} onChange={e => setWh(e.target.value)}>
              <option value="">{t('All', 'Todos')}</option>{ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
        )}
        <div className="field"><label htmlFor="p-shift">{t('Shift', 'Turno')}</label>
          <select id="p-shift" value={shift} onChange={e => setShift(e.target.value)}>
            <option value="">{t('Any', 'Cualquiera')}</option>{SHIFT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s[lang]}</option>)}
          </select></div>
      </div>
      {PHASES.filter(p => p.key !== 'closed').map(p => (
        <section key={p.key} className="stack" aria-labelledby={`ph-${p.key}`}>
          <div>
            <h2 id={`ph-${p.key}`} className={`phase-title phase-${p.key}`}>{p[lang]}</h2>
            <p className="small muted">{p.hint[lang]}</p>
          </div>
          <div className="board">
            {STAGES.filter(s => s.phase === p.key && !hidden.includes(s.key)).map(s => {
              const cards = byStage.get(s.key) ?? [];
              return (
                <div key={s.key} className="column">
                  <h3>{stageLabel(s.key, lang, setup.settings)} <span className="muted">{cards.length}</span></h3>
                  <ul>
                    {cards.slice(0, 60).map(c => (
                      <li key={c.id} className="card">
                        <Link to={`/recruiting/candidates/${c.id}`}>{candidateName(c)}</Link>
                        {c.is_sample && <span className="tag tag-sample">{t('Sample', 'Ejemplo')}</span>}
                        <span className="small muted">{t('Readiness', 'Preparación')} {readiness(c, today).score}{c.next_action_due ? ` · ${c.next_action_due}` : ''}</span>
                        <select aria-label={t('Move to stage', 'Mover a etapa')} value={c.stage} onChange={e => move(c.id, e.target.value as Stage)}>
                          {STAGES.filter(x => !hidden.includes(x.key) || x.key === c.stage).map(x => <option key={x.key} value={x.key}>{stageLabel(x.key, lang, setup.settings)}</option>)}
                        </select>
                      </li>
                    ))}
                    {cards.length > 60 && <li className="small muted">+{cards.length - 60}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="small muted"><Link to="/recruiting/candidates?phase=closed">{t('See closed candidates', 'Ver candidatos cerrados')}</Link> · {(byStage.get('closed') ?? []).length}</p>
    </div>
  );
}
