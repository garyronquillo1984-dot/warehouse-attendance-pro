import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import { POSITIONS, OPENING_STATUS, label, inPool, atLeast, type Opening } from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';
import { useCandidates } from './data';

type Form = Omit<Opening, 'id' | 'is_sample' | 'headcount'> & { id?: string; headcount: string };

export default function Openings() {
  const { org, manage, ws, setup, today } = useRecruiting();
  const { t, lang } = useLang();
  const { list } = useCandidates(org.organization_id);
  const [edit, setEdit] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!list) return <Loading label={t('Loading…', 'Cargando…')} />;

  const blank = (): Form => ({ warehouse_id: ws.warehouses[0].id, shift_id: null, title: '', position: 'picking', headcount: '1', status: 'draft',
    authorized_by: '', authorized_on: null, pay_note: '', schedule_note: '', requirements_note: '', opened_on: today, target_date: null, filled_on: null });
  const threshold = setup.settings?.low_pool_threshold ?? 3;

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const f = edit!;
    if (f.status === 'authorized' && (!f.authorized_by?.trim() || !f.authorized_on))
      return setErr(t('An authorized opening needs who authorized it and when.', 'Una vacante autorizada necesita quién la autorizó y cuándo.'));
    const row = {   // editable columns only
      title: f.title.trim(), position: f.position, shift_id: f.shift_id || null, headcount: Number(f.headcount) || 1, status: f.status,
      authorized_by: f.authorized_by?.trim() || null, authorized_on: f.authorized_on || null, pay_note: f.pay_note?.trim() || null,
      schedule_note: f.schedule_note?.trim() || null, requirements_note: f.requirements_note?.trim() || null, opened_on: f.opened_on,
      target_date: f.target_date || null, filled_on: f.status === 'filled' ? f.filled_on || today : f.filled_on || null,
    };
    const res = f.id
      ? await supabase.from('job_openings').update(row).eq('id', f.id)
      : await supabase.from('job_openings').insert({ ...row, organization_id: org.organization_id, warehouse_id: f.warehouse_id });
    if (res.error) setErr(friendlyError(res.error)); else { setEdit(null); setup.reload(); }
  }
  const up = (p: Partial<Form>) => setEdit(e => e && { ...e, ...p });
  const shifts = ws.warehouses.find(w => w.id === edit?.warehouse_id)?.shifts ?? [];

  return (
    <div className="stack-lg">
      <div className="page-head row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t('Authorized openings', 'Vacantes autorizadas')}</h1>
          <p className="muted">{t('Recruit only for openings the client and your employer have authorized. Pay, schedule and requirements: enter only verified information.',
            'Recluta solo para vacantes autorizadas por el cliente y tu empleador. Pago, horario y requisitos: registra solo información verificada.')}</p>
        </div>
        {manage && !edit && <button className="btn btn-primary" onClick={() => setEdit(blank())}>{t('Add opening', 'Agregar vacante')}</button>}
      </div>
      {err && <Notice kind="error">{err}</Notice>}

      {edit && (
        <form className="panel" onSubmit={save}>
          <h2>{edit.id ? t('Edit opening', 'Editar vacante') : t('New opening', 'Nueva vacante')}</h2>
          <div className="two">
            <Field label={t('Title', 'Título')} name="title" value={edit.title} onChange={e => up({ title: e.target.value })} required maxLength={120} />
            <div className="field"><label htmlFor="o-pos">{t('Role', 'Puesto')}</label>
              <select id="o-pos" value={edit.position} onChange={e => up({ position: e.target.value })}>{POSITIONS.map(p => <option key={p.key} value={p.key}>{p[lang]}</option>)}</select></div>
            {ws.warehouses.length > 1 && <div className="field"><label htmlFor="o-wh">{t('Warehouse', 'Almacén')}</label>
              <select id="o-wh" value={edit.warehouse_id} onChange={e => up({ warehouse_id: e.target.value, shift_id: null })} disabled={!!edit.id}>{ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
            <div className="field"><label htmlFor="o-shift">{t('Shift', 'Turno')}</label>
              <select id="o-shift" value={edit.shift_id ?? ''} onChange={e => up({ shift_id: e.target.value || null })}>
                <option value="">—</option>{shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <Field label={t('People needed', 'Personas necesarias')} name="headcount" type="number" min={1} max={1000} value={edit.headcount} onChange={e => up({ headcount: e.target.value })} />
            <div className="field"><label htmlFor="o-status">{t('Status', 'Estado')}</label>
              <select id="o-status" value={edit.status} onChange={e => up({ status: e.target.value })}>{OPENING_STATUS.map(s => <option key={s.key} value={s.key}>{s[lang]}</option>)}</select></div>
            <Field label={t('Authorized by (name / role)', 'Autorizada por (nombre / cargo)')} name="ab" value={edit.authorized_by ?? ''} onChange={e => up({ authorized_by: e.target.value })} maxLength={120} />
            <Field label={t('Authorized on', 'Fecha de autorización')} name="ao" type="date" value={edit.authorized_on ?? ''} onChange={e => up({ authorized_on: e.target.value || null })} />
            <Field label={t('Opened on', 'Abierta el')} name="op" type="date" value={edit.opened_on} onChange={e => up({ opened_on: e.target.value })} />
            <Field label={t('Target date', 'Fecha objetivo')} name="td" type="date" value={edit.target_date ?? ''} onChange={e => up({ target_date: e.target.value || null })} />
            <Field label={t('Verified pay (optional)', 'Pago verificado (opcional)')} name="pay" value={edit.pay_note ?? ''} onChange={e => up({ pay_note: e.target.value })} maxLength={200} hint={t('Leave blank until confirmed in writing.', 'Déjalo vacío hasta confirmarlo por escrito.')} />
            <Field label={t('Verified schedule (optional)', 'Horario verificado (opcional)')} name="sch" value={edit.schedule_note ?? ''} onChange={e => up({ schedule_note: e.target.value })} maxLength={200} />
          </div>
          <div className="field"><label htmlFor="o-req">{t('Real job requirements (from the client)', 'Requisitos reales del puesto (del cliente)')}</label>
            <textarea id="o-req" rows={3} maxLength={500} value={edit.requirements_note ?? ''} onChange={e => up({ requirements_note: e.target.value })} /></div>
          <div className="row">
            <button className="btn btn-primary">{t('Save', 'Guardar')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{t('Cancel', 'Cancelar')}</button>
          </div>
        </form>
      )}

      {!setup.openings.length ? <p className="muted">{t('No openings recorded yet. Confirm authorized openings with your supervisor, then add them here.', 'Aún no hay vacantes. Confirma las vacantes autorizadas con tu supervisor y agrégalas aquí.')}</p> : (
        <section className="panel flush">
          <table className="emp-table">
            <thead><tr><th>{t('Opening', 'Vacante')}</th><th>{t('Status', 'Estado')}</th><th>{t('Needed', 'Necesarias')}</th><th>{t('Ready pool', 'Disponibles')}</th><th>{t('Placed', 'Colocados')}</th></tr></thead>
            <tbody>
              {setup.openings.map(o => {
                const pool = list.filter(c => inPool(c, o)).length;
                const placed = list.filter(c => c.opening_id === o.id && atLeast(c.stage, 'assigned')).length;
                const low = o.status === 'authorized' && pool < Math.max(threshold, o.headcount - placed);
                return (
                  <tr key={o.id} className={manage ? 'clickable' : undefined} onClick={manage ? () => setEdit({ ...o, headcount: String(o.headcount) }) : undefined}>
                    <td data-label={t('Opening', 'Vacante')}><strong>{o.title}</strong>{o.is_sample && <span className="tag tag-sample">{t('Sample', 'Ejemplo')}</span>}
                      <div className="small muted">{label(POSITIONS, o.position, lang)}{ws.warehouses.length > 1 ? ` · ${ws.warehouses.find(w => w.id === o.warehouse_id)?.name}` : ''}{o.authorized_by ? ` · ${t('authorized by', 'autorizada por')} ${o.authorized_by}` : ''}</div></td>
                    <td data-label={t('Status', 'Estado')}>{label(OPENING_STATUS, o.status, lang)}</td>
                    <td data-label={t('Needed', 'Necesarias')}>{o.headcount}</td>
                    <td data-label={t('Ready pool', 'Disponibles')} className={low ? 't-absent' : undefined}>
                      <Link to={`/recruiting/candidates?phase=preselected`} onClick={e => e.stopPropagation()}>{pool}</Link>{low && ` · ${t('low', 'bajo')}`}</td>
                    <td data-label={t('Placed', 'Colocados')}>{placed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
