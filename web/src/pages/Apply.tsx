import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LangProvider, LangToggle, useLang } from '../lib/i18n';
import { EXPERIENCE, EQUIPMENT, SHIFT_OPTIONS, POSITIONS } from '../lib/recruiting';
import { Field, Loading, Notice } from '../components/ui';

// Public, bilingual pre-registration form (QR code / link). Asks only for what a first
// contact needs, with explicit consent. No SSN, ID, bank, date of birth or health data.
interface Info { title: string; public_name: string; privacy_contact: string | null }

function Form() {
  const { token } = useParams();
  const { t, lang } = useLang();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [f, setF] = useState({
    first_name: '', last_name: '', phone: '', email: '', city: '', zip: '', available_from: '', experience_note: '', website: '',
    experience: [] as string[], equipment: [] as string[], shifts_available: [] as string[], positions_wanted: [] as string[],
    consent_contact: false, consent_sms: false, consent_whatsapp: false, consent_email: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('intake_form_public', { tok: token }).then(({ data }) => setInfo((data as Info | null) ?? null));
  }, [token]);
  useEffect(() => { document.title = info?.title ?? 'Pre-registration'; }, [info]);

  if (info === undefined) return <Loading label={t('Loading…', 'Cargando…')} />;
  if (info === null) return <Notice kind="info">{t('This form is closed or the link is not valid.', 'Este formulario está cerrado o el enlace no es válido.')}</Notice>;
  if (ref) return (
    <div className="stack">
      <div className="status-mark go" aria-hidden="true">✓</div>
      <h1>{t('Thank you! We received your registration.', '¡Gracias! Recibimos tu registro.')}</h1>
      <p>{t('Your reference: ', 'Tu referencia: ')}<strong className="mono">{ref}</strong></p>
      <p>{t('A recruiter will contact you when an authorized opening matches your availability. Registering does not guarantee a job.',
        'Un reclutador te contactará cuando una vacante autorizada coincida con tu disponibilidad. Registrarte no garantiza empleo.')}</p>
      <p className="small muted">{t('To update or delete your information, contact: ', 'Para actualizar o eliminar tu información, contacta a: ')}{info.privacy_contact ?? info.public_name}</p>
    </div>
  );

  const flip = (k: 'experience' | 'equipment' | 'shifts_available' | 'positions_wanted', v: string) =>
    setF({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] });
  const chips = (k: 'experience' | 'equipment' | 'shifts_available' | 'positions_wanted', opts: { key: string; en: string; es: string }[], legend: string) => (
    <fieldset className="chip-field"><legend>{legend}</legend>
      <div className="chips">{opts.map(o => <button type="button" key={o.key} className="chip" aria-pressed={f[k].includes(o.key)} onClick={() => flip(k, o.key)}>{o[lang]}</button>)}</div>
    </fieldset>
  );

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const digits = f.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!f.first_name.trim() || !f.last_name.trim()) return setErr(t('Please enter your first and last name.', 'Escribe tu nombre y apellido.'));
    if (!digits && !f.email.trim()) return setErr(t('Please enter a phone number or an email so we can reach you.', 'Escribe un teléfono o un correo para poder contactarte.'));
    if (digits && digits.length !== 10) return setErr(t('Phone numbers have 10 digits.', 'El teléfono debe tener 10 dígitos.'));
    if (!f.consent_contact) return setErr(t('We need your permission to contact you about jobs.', 'Necesitamos tu permiso para contactarte sobre empleos.'));
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_intake', { tok: token, d: { ...f, phone: digits, preferred_language: lang } });
    setBusy(false);
    if (error) {
      setErr(/intake_busy/.test(error.message) ? t('Many people are registering right now. Please try again in a few minutes.', 'Muchas personas se están registrando ahora. Intenta de nuevo en unos minutos.')
        : /intake_form_closed/.test(error.message) ? t('This form is closed.', 'Este formulario está cerrado.')
        : /intake_bad_phone/.test(error.message) ? t('Check your phone number.', 'Revisa tu número de teléfono.')
        : t('Something went wrong. Please try again.', 'Algo salió mal. Intenta de nuevo.'));
      return;
    }
    setRef(data as string);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">{info.public_name}</span>
        <h1>{info.title}</h1>
        <p className="muted">{t('Pre-registration for warehouse jobs. 2 minutes. Registering does not guarantee a job; we contact you when an authorized opening matches your availability.',
          'Preinscripción para trabajos de almacén. 2 minutos. Registrarte no garantiza empleo; te contactamos cuando una vacante autorizada coincida con tu disponibilidad.')}</p>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="two">
        <Field label={t('First name', 'Nombre')} name="first_name" autoComplete="given-name" value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} maxLength={80} required />
        <Field label={t('Last name', 'Apellido')} name="last_name" autoComplete="family-name" value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} maxLength={80} required />
        <Field label={t('Mobile phone', 'Teléfono celular')} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <Field label={t('Email (optional)', 'Correo (opcional)')} name="email" type="email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} maxLength={160} />
        <Field label={t('City', 'Ciudad')} name="city" autoComplete="address-level2" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} maxLength={80} />
        <Field label={t('ZIP code', 'Código postal')} name="zip" autoComplete="postal-code" inputMode="numeric" value={f.zip} onChange={e => setF({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
      </div>
      {chips('shifts_available', SHIFT_OPTIONS, t('Which shifts can you work?', '¿En qué turnos puedes trabajar?'))}
      <Field label={t('When can you start?', '¿Cuándo puedes empezar?')} name="available_from" type="date" value={f.available_from} onChange={e => setF({ ...f, available_from: e.target.value })} />
      {chips('positions_wanted', POSITIONS, t('Jobs you are interested in', 'Trabajos que te interesan'))}
      {chips('experience', EXPERIENCE, t('Warehouse experience', 'Experiencia en almacén'))}
      {chips('equipment', EQUIPMENT, t('Equipment you can use', 'Equipos que sabes usar'))}
      <Field label={t('Anything else about your work experience? (optional)', '¿Algo más sobre tu experiencia laboral? (opcional)')} name="experience_note" value={f.experience_note} onChange={e => setF({ ...f, experience_note: e.target.value })} maxLength={300} />
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -9999 }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></label>
      </div>
      <fieldset className="chip-field consent">
        <legend>{t('Permission to contact you', 'Permiso para contactarte')}</legend>
        <label className="check"><input type="checkbox" checked={f.consent_contact} onChange={e => setF({ ...f, consent_contact: e.target.checked })} />
          <span>{t(`I agree that ${info.public_name} may contact me about job opportunities and keep this information for that purpose.`,
            `Acepto que ${info.public_name} me contacte sobre oportunidades de empleo y guarde esta información con ese fin.`)}</span></label>
        {f.consent_contact && <>
          <label className="check"><input type="checkbox" checked={f.consent_sms} onChange={e => setF({ ...f, consent_sms: e.target.checked })} /><span>{t('You may text me. Message and data rates may apply. Reply STOP to stop.', 'Pueden enviarme mensajes de texto. Pueden aplicar cargos de mensajes y datos. Responde STOP para detenerlos.')}</span></label>
          <label className="check"><input type="checkbox" checked={f.consent_whatsapp} onChange={e => setF({ ...f, consent_whatsapp: e.target.checked })} /><span>{t('You may message me on WhatsApp.', 'Pueden escribirme por WhatsApp.')}</span></label>
          <label className="check"><input type="checkbox" checked={f.consent_email} onChange={e => setF({ ...f, consent_email: e.target.checked })} /><span>{t('You may email me.', 'Pueden enviarme correos.')}</span></label>
        </>}
      </fieldset>
      <p className="small muted">{t('Do not include your Social Security number, ID numbers, bank details, date of birth or health information. We will never ask for them in this form.',
        'No incluyas tu número de Seguro Social, números de identificación, datos bancarios, fecha de nacimiento ni información de salud. Nunca los pediremos en este formulario.')}
        {info.privacy_contact && <> {t('Questions or deletion requests: ', 'Preguntas o solicitudes de eliminación: ')}{info.privacy_contact}</>}</p>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Sending…', 'Enviando…') : t('Send registration', 'Enviar registro')}</button>
    </form>
  );
}

export default function Apply() {
  return (
    <LangProvider>
      <main className="auth">
        <div className="auth-panel apply-panel">
          <div className="row" style={{ justifyContent: 'flex-end' }}><LangToggle /></div>
          <Form />
        </div>
      </main>
    </LangProvider>
  );
}
