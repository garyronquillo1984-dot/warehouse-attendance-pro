import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import { STAGES, DEFAULT_SETTINGS, type Settings as S } from '../../lib/recruiting';
import { Field, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

export default function RecruitingSettings() {
  const { org, manage, setup } = useRecruiting();
  const { t, lang } = useLang();
  const [s, setS] = useState<S>(() => ({ organization_id: org.organization_id, ...DEFAULT_SETTINGS, ...(setup.settings ?? {}) }));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (!manage) return <Navigate to="/recruiting" replace />;

  const num = (k: keyof S, name: string, min: number, max: number, hint?: string) => (
    <Field label={name} name={k} type="number" min={min} max={max} value={String(s[k] ?? '')} hint={hint}
           onChange={e => setS({ ...s, [k]: Number(e.target.value) })} />
  );
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    // Only the editable columns (the table also carries organization_id and updated_at).
    const row = {
      public_name: s.public_name.trim() || 'Staffing team', privacy_contact: s.privacy_contact?.trim() || null,
      stale_days: s.stale_days, low_pool_threshold: s.low_pool_threshold, retention_months: s.retention_months,
      goal_contacts_day: s.goal_contacts_day, goal_prescreens_week: s.goal_prescreens_week, goal_interviews_week: s.goal_interviews_week,
      goal_show_rate: s.goal_show_rate, goal_retention_30: s.goal_retention_30, stage_labels: s.stage_labels, hidden_stages: s.hidden_stages,
    };
    const res = await supabase.from('recruitment_settings').update(row).eq('organization_id', s.organization_id);
    if (res.error) setMsg({ kind: 'error', text: friendlyError(res.error) });
    else { setMsg({ kind: 'ok', text: t('Saved.', 'Guardado.') }); setup.reload(); }
  }
  const setLabel = (key: string, l: 'en' | 'es', v: string) => {
    const cur = { ...(s.stage_labels as Record<string, Record<string, string>>) };
    cur[key] = { ...(cur[key] ?? {}), [l]: v };
    if (!v) delete cur[key][l];
    setS({ ...s, stage_labels: cur });
  };

  return (
    <form className="stack-lg narrow" onSubmit={save}>
      <div className="page-head"><h1>{t('Recruiting settings', 'Ajustes de reclutamiento')}</h1></div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <section className="panel">
        <h2>{t('Public form', 'Formulario público')}</h2>
        <Field label={t('Name shown to candidates', 'Nombre que ven los candidatos')} name="public_name" value={s.public_name} maxLength={120}
               onChange={e => setS({ ...s, public_name: e.target.value })} hint={t('Use your employer’s name only if authorized.', 'Usa el nombre de tu empleador solo si está autorizado.')} />
        <Field label={t('Privacy contact (email or phone for data requests)', 'Contacto de privacidad (correo o teléfono para solicitudes de datos)')} name="privacy_contact"
               value={s.privacy_contact ?? ''} maxLength={160} onChange={e => setS({ ...s, privacy_contact: e.target.value })} />
      </section>
      <section className="panel">
        <h2>{t('Activity goals (not hiring promises)', 'Metas de actividad (no promesas de contratación)')}</h2>
        <div className="two">
          {num('goal_contacts_day', t('People contacted per day', 'Personas contactadas por día'), 0, 1000)}
          {num('goal_prescreens_week', t('Pre-selected per week', 'Preseleccionados por semana'), 0, 1000)}
          {num('goal_interviews_week', t('Interviews per week', 'Entrevistas por semana'), 0, 1000)}
          {num('goal_show_rate', t('First-day show rate goal (%)', 'Meta de asistencia al primer día (%)'), 0, 100)}
          {num('goal_retention_30', t('30-day retention goal (%)', 'Meta de retención a 30 días (%)'), 0, 100)}
        </div>
      </section>
      <section className="panel">
        <h2>{t('Alerts and data retention', 'Alertas y conservación de datos')}</h2>
        <div className="two">
          {num('stale_days', t('Flag candidates without contact after (days)', 'Marcar candidatos sin contacto después de (días)'), 1, 60)}
          {num('low_pool_threshold', t('Low pool alert: fewer ready candidates than', 'Alerta de pocos candidatos: menos de'), 0, 500)}
          {num('retention_months', t('Delete untouched candidate records after (months)', 'Eliminar registros sin actividad después de (meses)'), 1, 84,
            t('Match your employer’s policy. People who started work are kept.', 'Ajústalo a la política de tu empleador. Las personas que empezaron a trabajar se conservan.'))}
        </div>
      </section>
      <section className="panel">
        <h2>{t('Pipeline stages', 'Etapas del pipeline')}</h2>
        <p className="small muted">{t('Rename stages to match your employer’s process, or hide the ones you don’t use. The order and the meaning of the phases stay the same.',
          'Cambia el nombre de las etapas según el proceso de tu empleador, u oculta las que no uses. El orden y el significado de las fases no cambian.')}</p>
        <table className="report-table">
          <thead><tr><th>#</th><th>English</th><th>Español</th><th>{t('Hide', 'Ocultar')}</th></tr></thead>
          <tbody>
            {STAGES.map((st, i) => {
              const cur = (s.stage_labels as Record<string, Record<string, string>>)[st.key] ?? {};
              const locked = ['new', 'started', 'closed', 'approved'].includes(st.key);
              return (
                <tr key={st.key}>
                  <td>{st.key === 'closed' ? '—' : i + 1}</td>
                  <td><input aria-label={`${st.en} (English)`} placeholder={st.en} value={cur.en ?? ''} maxLength={60} onChange={e => setLabel(st.key, 'en', e.target.value)} /></td>
                  <td><input aria-label={`${st.es} (Español)`} placeholder={st.es} value={cur.es ?? ''} maxLength={60} onChange={e => setLabel(st.key, 'es', e.target.value)} /></td>
                  <td>{!locked && <input type="checkbox" aria-label={`${t('Hide', 'Ocultar')} ${st[lang]}`} checked={s.hidden_stages.includes(st.key)}
                        onChange={e => setS({ ...s, hidden_stages: e.target.checked ? [...s.hidden_stages, st.key] : s.hidden_stages.filter(x => x !== st.key) })} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div><button className="btn btn-primary">{t('Save settings', 'Guardar ajustes')}</button></div>
    </form>
  );
}
