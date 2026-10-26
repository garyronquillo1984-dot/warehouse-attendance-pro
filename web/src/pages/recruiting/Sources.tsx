import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import { SOURCE_KINDS, label, applyUrl, type Source } from '../../lib/recruiting';
import { Field, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

interface IntakeForm { id: string; warehouse_id: string; source_id: string | null; title: string; token: string; is_active: boolean; submissions: number; last_submission_at: string | null }

export default function Sources() {
  const { org, manage, ws, setup } = useRecruiting();
  const { t, lang } = useLang();
  const [forms, setForms] = useState<IntakeForm[]>([]);
  const [edit, setEdit] = useState<Partial<Source> | null>(null);
  const [newForm, setNewForm] = useState({ title: '', source_id: '', warehouse_id: ws.warehouses[0].id });
  const [kit, setKit] = useState<IntakeForm | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadForms() {
    const { data } = await supabase.from('intake_forms').select('*').eq('organization_id', org.organization_id).order('created_at', { ascending: false });
    setForms((data ?? []) as IntakeForm[]);
  }
  useEffect(() => { loadForms(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSource(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const s = edit!;
    const row = { name: s.name?.trim(), kind: s.kind ?? 'other', url: s.url?.trim() || null, contact_note: s.contact_note?.trim() || null,
      cost_note: s.cost_note?.trim() || null, monthly_cost: s.monthly_cost === null || s.monthly_cost === undefined || String(s.monthly_cost) === '' ? null : Number(s.monthly_cost),
      verified: !!s.verified, is_active: s.is_active ?? true };
    const res = s.id ? await supabase.from('recruitment_sources').update(row).eq('id', s.id)
      : await supabase.from('recruitment_sources').insert({ ...row, organization_id: org.organization_id });
    if (res.error) setErr(friendlyError(res.error)); else { setEdit(null); setup.reload(); }
  }
  async function addForm(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (!newForm.title.trim()) return;
    const { error } = await supabase.from('intake_forms').insert({ organization_id: org.organization_id, warehouse_id: newForm.warehouse_id,
      title: newForm.title.trim(), source_id: newForm.source_id || null });
    if (error) setErr(friendlyError(error)); else { setNewForm({ ...newForm, title: '' }); loadForms(); }
  }
  async function toggleForm(f: IntakeForm) {
    await supabase.from('intake_forms').update({ is_active: !f.is_active }).eq('id', f.id); loadForms();
  }
  const up = (p: Partial<Source>) => setEdit(x => x && { ...x, ...p });

  if (kit) return <Kit form={kit} onClose={() => setKit(null)} publicName={setup.settings?.public_name ?? ''} />;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>{t('Sources and pre-registration QR codes', 'Fuentes y códigos QR de preinscripción')}</h1>
        <p className="muted">{t('Each QR code / link records where people came from, so you can see which channels bring candidates who show up.',
          'Cada código QR / enlace registra de dónde vienen las personas, para ver qué canales traen candidatos que sí se presentan.')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {!setup.settings?.privacy_contact && manage && (
        <Notice kind="info">{t('Add a privacy contact in Settings before sharing a form: it is shown to people who register.', 'Agrega un contacto de privacidad en Ajustes antes de compartir un formulario: se muestra a quienes se registran.')}</Notice>
      )}

      <section className="panel">
        <h2>{t('Pre-registration forms', 'Formularios de preinscripción')}</h2>
        <p className="small muted">{t('Public, bilingual, works on any phone. Asks only for contact details, availability and job-related experience, with consent. Registering does not guarantee a job — the form says so.',
          'Público, bilingüe, funciona en cualquier teléfono. Pide solo contacto, disponibilidad y experiencia laboral, con consentimiento. Registrarse no garantiza empleo — el formulario lo dice.')}</p>
        {forms.length ? (
          <ul className="team-list">
            {forms.map(f => (
              <li key={f.id}>
                <div className="who">
                  <span className="name">{f.title}{!f.is_active && <span className="tag">{t('Closed', 'Cerrado')}</span>}</span>
                  <span className="meta">{setup.sources.find(s => s.id === f.source_id)?.name ?? t('No source', 'Sin fuente')} · {f.submissions} {t('registrations', 'registros')} · <a href={applyUrl(f.token)} target="_blank" rel="noopener">{applyUrl(f.token)}</a></span>
                </div>
                <div className="row">
                  <button className="btn btn-ghost small" onClick={() => setKit(f)}>{t('QR, flyer and card', 'QR, folleto y tarjeta')}</button>
                  {manage && <button className="btn btn-ghost small" onClick={() => toggleForm(f)}>{f.is_active ? t('Close', 'Cerrar') : t('Reopen', 'Reabrir')}</button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('No forms yet.', 'Aún no hay formularios.')}</p>}
        {manage && (
          <form className="row invite-form" onSubmit={addForm} style={{ alignItems: 'end' }}>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="nf-title">{t('Form name (shown on the form)', 'Nombre del formulario (se muestra)')}</label>
              <input id="nf-title" value={newForm.title} maxLength={120} onChange={e => setNewForm({ ...newForm, title: e.target.value })} placeholder={t('Warehouse jobs – Florence, KY', 'Trabajos de almacén – Florence, KY')} />
            </div>
            <div className="field"><label htmlFor="nf-src">{t('Source', 'Fuente')}</label>
              <select id="nf-src" value={newForm.source_id} onChange={e => setNewForm({ ...newForm, source_id: e.target.value })}>
                <option value="">—</option>{setup.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            {ws.warehouses.length > 1 && <div className="field"><label htmlFor="nf-wh">{t('Site', 'Sitio')}</label>
              <select id="nf-wh" value={newForm.warehouse_id} onChange={e => setNewForm({ ...newForm, warehouse_id: e.target.value })}>
                {ws.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
            <button className="btn btn-primary">{t('Create form', 'Crear formulario')}</button>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('Recruitment sources', 'Fuentes de reclutamiento')}</h2>
          {manage && !edit && <button className="btn btn-ghost" onClick={() => setEdit({ kind: 'other', is_active: true })}>{t('Add source', 'Agregar fuente')}</button>}
        </div>
        {edit && (
          <form className="stack member-edit" onSubmit={saveSource}>
            <div className="two">
              <Field label={t('Name', 'Nombre')} name="s-name" value={edit.name ?? ''} onChange={e => up({ name: e.target.value })} required maxLength={80} />
              <div className="field"><label htmlFor="s-kind">{t('Type', 'Tipo')}</label>
                <select id="s-kind" value={edit.kind} onChange={e => up({ kind: e.target.value })}>{SOURCE_KINDS.map(k => <option key={k.key} value={k.key}>{k[lang]}</option>)}</select></div>
              <Field label={t('Official link', 'Enlace oficial')} name="s-url" type="url" value={edit.url ?? ''} onChange={e => up({ url: e.target.value })} maxLength={300} />
              <Field label={t('Contact', 'Contacto')} name="s-contact" value={edit.contact_note ?? ''} onChange={e => up({ contact_note: e.target.value })} maxLength={300} />
              <Field label={t('Cost note', 'Nota de costo')} name="s-cost" value={edit.cost_note ?? ''} onChange={e => up({ cost_note: e.target.value })} maxLength={200} />
              <Field label={t('Real monthly spend ($)', 'Gasto mensual real ($)')} name="s-monthly" type="number" min={0} step="0.01" value={edit.monthly_cost ?? ''} onChange={e => up({ monthly_cost: e.target.value as unknown as number })}
                     hint={t('Only actual spend. Drives cost per candidate.', 'Solo gasto real. Calcula el costo por candidato.')} />
            </div>
            <label className="check"><input type="checkbox" checked={!!edit.verified} onChange={e => up({ verified: e.target.checked })} /><span>{t('Link and contact verified', 'Enlace y contacto verificados')}</span></label>
            <label className="check"><input type="checkbox" checked={edit.is_active ?? true} onChange={e => up({ is_active: e.target.checked })} /><span>{t('Active', 'Activa')}</span></label>
            <div className="row"><button className="btn btn-primary">{t('Save', 'Guardar')}</button><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{t('Cancel', 'Cancelar')}</button></div>
          </form>
        )}
        <ul className="team-list">
          {setup.sources.map(s => (
            <li key={s.id}>
              <div className="who">
                <span className="name">{s.name}{s.verified ? <span className="tag chip-go">{t('Verified', 'Verificada')}</span> : <span className="tag">{t('To confirm', 'Por confirmar')}</span>}{!s.is_active && <span className="tag">{t('Inactive', 'Inactiva')}</span>}</span>
                <span className="meta">{label(SOURCE_KINDS, s.kind, lang)}{s.cost_note ? ` · ${s.cost_note}` : ''}{s.monthly_cost != null ? ` · $${s.monthly_cost}/${t('mo', 'mes')}` : ''}{s.url ? <> · <a href={s.url} target="_blank" rel="noopener">{t('link', 'enlace')}</a></> : null}</span>
              </div>
              {manage && <button className="btn btn-ghost small" onClick={() => setEdit(s)}>{t('Edit', 'Editar')}</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Printable recruiting kit: bilingual flyer with QR, and a contact card. Uses the employer's
// name/brand only as typed in Settings → public name; nothing is added automatically.
function Kit({ form, onClose, publicName }: { form: IntakeForm; onClose: () => void; publicName: string }) {
  const { t } = useLang();
  const [qr, setQr] = useState('');
  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem('wap.recruiter') || '{}') as { name?: string; phone?: string }; } catch { return {}; } });
  const url = applyUrl(form.token);
  useEffect(() => {   // the QR library loads only when a kit is opened
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' })).then(setQr);
  }, [url]);
  return (
    <div className="stack-lg">
      <div className="row no-print">
        <button className="btn btn-ghost" onClick={onClose}>← {t('Back', 'Volver')}</button>
        <button className="btn btn-primary" onClick={() => window.print()}>{t('Print', 'Imprimir')}</button>
        {qr && <a className="btn btn-ghost" href={qr} download={`qr-${form.token}.png`}>{t('Download QR (PNG)', 'Descargar QR (PNG)')}</a>}
      </div>
      <div className="row no-print">
        <Field label={t('Name on the card', 'Nombre en la tarjeta')} name="k-name" value={me.name ?? ''} onChange={e => setMe({ ...me, name: e.target.value })} />
        <Field label={t('Phone on the card', 'Teléfono en la tarjeta')} name="k-phone" value={me.phone ?? ''} onChange={e => setMe({ ...me, phone: e.target.value })} />
      </div>
      <Notice kind="info"><span className="no-print">{t('Use your employer’s logo or brand only if they authorized it. Add confirmed pay or shifts by hand only when verified.',
        'Usa el logo o la marca de tu empleador solo si lo autorizó. Agrega pago o turnos a mano solo cuando estén verificados.')}</span></Notice>
      <article className="flyer">
        <p className="flyer-kicker">{publicName}</p>
        <h2>Warehouse jobs · Trabajos de almacén</h2>
        <p className="flyer-sub">Florence, KY · Picking · Packing · Sorting · Material handling</p>
        <div className="flyer-body">
          {qr && <img src={qr} alt={`QR code: ${url}`} width={260} height={260} />}
          <div className="stack">
            <p><strong>Scan to pre-register (2 minutes).</strong> We call you back when an authorized opening matches your availability.</p>
            <p><strong>Escanea para preinscribirte (2 minutos).</strong> Te llamamos cuando una vacante autorizada coincida con tu disponibilidad.</p>
            <p className="small mono">{url}</p>
          </div>
        </div>
        <p className="flyer-fine">Registering does not guarantee employment. Pay, shifts and start dates are confirmed by the recruiter for each opening. · Registrarte no garantiza empleo. El pago, los turnos y las fechas de inicio los confirma el reclutador para cada vacante.</p>
      </article>
      <article className="card-print">
        <div>
          <strong>{me.name || t('Your name', 'Tu nombre')}</strong>
          <span>{publicName}</span>
          <span>{me.phone || t('Work phone', 'Teléfono de trabajo')}</span>
          <span className="small">Hablamos español · We speak English</span>
        </div>
        {qr && <img src={qr} alt="" width={110} height={110} />}
      </article>
    </div>
  );
}
