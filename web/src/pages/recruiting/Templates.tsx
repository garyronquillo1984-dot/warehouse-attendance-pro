import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../lib/i18n';
import { friendlyError } from '../../lib/errors';
import type { Template } from '../../lib/recruiting';
import { Field, Loading, Notice } from '../../components/ui';
import { useRecruiting } from './Layout';

const CHANNELS: Record<string, [string, string]> = {
  any: ['Any channel', 'Cualquier canal'], sms: ['Text message', 'Mensaje de texto'], whatsapp: ['WhatsApp', 'WhatsApp'], email: ['Email', 'Correo'],
  facebook: ['Facebook / social post', 'Facebook / publicación'], video_script: ['Video script', 'Guion de video'], flyer: ['Flyer text', 'Texto de folleto'],
};

export default function Templates() {
  const { org, manage } = useRecruiting();
  const { t, lang } = useLang();
  const [list, setList] = useState<Template[] | null>(null);
  const [edit, setEdit] = useState<Partial<Template> | null>(null);
  const [view, setView] = useState<'both' | 'en' | 'es'>('both');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('message_templates').select('*').eq('organization_id', org.organization_id).order('sort_order').order('lang');
    setList((data ?? []) as Template[]);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return <Loading label={t('Loading…', 'Cargando…')} />;

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const x = edit!;
    const row = { title: x.title?.trim(), body: x.body?.trim(), channel: x.channel ?? 'any', is_active: x.is_active ?? true, sort_order: x.sort_order ?? 50 };
    const res = x.id ? await supabase.from('message_templates').update(row).eq('id', x.id)
      : await supabase.from('message_templates').insert({ ...row, code: (x.code ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) || `custom_${Date.now() % 100000}`, lang: x.lang ?? lang, organization_id: org.organization_id });
    if (res.error) setErr(friendlyError(res.error)); else { setEdit(null); load(); }
  }
  async function copy(x: Template) { await navigator.clipboard.writeText(x.body); setCopied(x.id); setTimeout(() => setCopied(null), 1500); }

  const shown = list.filter(x => view === 'both' || x.lang === view);
  return (
    <div className="stack-lg">
      <div className="page-head row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t('Messages, ads and scripts', 'Mensajes, anuncios y guiones')}</h1>
          <p className="muted">{t('English and Spanish versions. Placeholders like {first_name} are filled on the candidate page. Never publish pay, schedules, bonuses or start dates that aren’t verified.',
            'Versiones en inglés y español. Los marcadores como {first_name} se completan en la página del candidato. Nunca publiques pagos, horarios, bonos o fechas de inicio no verificados.')}</p>
        </div>
        {manage && !edit && <button className="btn btn-primary" onClick={() => setEdit({ lang, channel: 'any', is_active: true })}>{t('Add template', 'Agregar plantilla')}</button>}
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="chips">
        {(['both', 'en', 'es'] as const).map(v => <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{v === 'both' ? t('Both languages', 'Ambos idiomas') : v.toUpperCase()}</button>)}
      </div>
      {edit && (
        <form className="panel" onSubmit={save}>
          <div className="two">
            <Field label={t('Title', 'Título')} name="t-title" value={edit.title ?? ''} onChange={e => setEdit({ ...edit, title: e.target.value })} required maxLength={120} />
            <div className="field"><label htmlFor="t-ch">{t('Channel', 'Canal')}</label>
              <select id="t-ch" value={edit.channel} onChange={e => setEdit({ ...edit, channel: e.target.value })}>
                {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v[lang === 'es' ? 1 : 0]}</option>)}</select></div>
            {!edit.id && <>
              <Field label={t('Code (same code links EN and ES versions)', 'Código (el mismo código une las versiones EN y ES)')} name="t-code" value={edit.code ?? ''} onChange={e => setEdit({ ...edit, code: e.target.value })} maxLength={40} />
              <div className="field"><label htmlFor="t-lang">{t('Language', 'Idioma')}</label>
                <select id="t-lang" value={edit.lang} onChange={e => setEdit({ ...edit, lang: e.target.value as 'en' | 'es' })}><option value="en">English</option><option value="es">Español</option></select></div>
            </>}
          </div>
          <div className="field"><label htmlFor="t-body">{t('Text', 'Texto')}</label>
            <textarea id="t-body" rows={7} maxLength={3000} value={edit.body ?? ''} onChange={e => setEdit({ ...edit, body: e.target.value })} required />
            <span className="hint">{'{first_name} {my_name} {my_phone} {company} {position} {shift} {date} {time} {place} {apply_link}'}</span></div>
          <label className="check"><input type="checkbox" checked={edit.is_active ?? true} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /><span>{t('Active', 'Activa')}</span></label>
          <div className="row"><button className="btn btn-primary">{t('Save', 'Guardar')}</button><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{t('Cancel', 'Cancelar')}</button></div>
        </form>
      )}
      <div className="template-grid">
        {shown.map(x => (
          <article key={x.id} className="panel template" data-inactive={!x.is_active || undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{x.title} <span className="tag">{x.lang.toUpperCase()}</span></h3>
              <span className="small muted">{CHANNELS[x.channel]?.[lang === 'es' ? 1 : 0]}</span>
            </div>
            <pre className="message-preview">{x.body}</pre>
            <div className="row">
              <button className="btn btn-ghost small" onClick={() => copy(x)}>{copied === x.id ? t('Copied', 'Copiado') : t('Copy', 'Copiar')}</button>
              {manage && <button className="btn btn-ghost small" onClick={() => setEdit(x)}>{t('Edit', 'Editar')}</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
