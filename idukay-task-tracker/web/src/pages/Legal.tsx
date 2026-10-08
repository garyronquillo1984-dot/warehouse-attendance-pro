// DRAFT legal texts for the prototype. They must be reviewed and completed by a qualified
// attorney (company name, address, jurisdiction, LOPDP/GDPR specifics) before launch.
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { PRICE_LABEL, SUPPORT_EMAIL, TRIAL_DAYS } from '../lib/config';
import { BrandMark } from '../components/Icons';
import { PublicFooter } from './Landing';

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="public">
      <header className="public-nav"><Link to="/" className="brand"><BrandMark />{t.common.appName}</Link></header>
      <main className="public-main"><article className="legal stack">
        <h1>{title}</h1>
        <p className="form-error">{t.legal.draft}</p>
        {children}
      </article></main>
      <PublicFooter />
    </div>
  );
}

export function PrivacyPage() {
  const { t, lang } = useT();
  return (
    <LegalLayout title={t.legal.privacyTitle}>
      {lang === 'es' ? <>
        <h2>Qué datos guardamos</h2>
        <ul>
          <li>Del padre, madre o representante: nombre, correo, teléfono, país, idioma y zona horaria.</li>
          <li>De cada hijo: nombre, y si los agregas, grado, colegio, paralelo y tutor.</li>
          <li>Las tareas que tú agregas: materia, título, descripción, fechas, estado y notas.</li>
          <li>El estado de tu suscripción que nos informa Hotmart. <strong>Nunca</strong> recibimos ni guardamos datos de tarjeta.</li>
        </ul>
        <h2>Qué datos NO pedimos</h2>
        <p>Nunca pedimos tu usuario ni contraseña de Idukay ni de ninguna plataforma escolar, y no accedemos a ellas.</p>
        <h2>Para qué los usamos</h2>
        <p>Solo para mostrarte tu panel, enviarte los recordatorios que actives y gestionar tu acceso. No vendemos datos, no mostramos publicidad y no usamos los datos de tus hijos para ningún otro fin. Las métricas del producto son agregadas y no contienen nombres ni tareas.</p>
        <h2>Quién puede verlos</h2>
        <p>Solo tú. Cada cuenta está aislada en la base de datos. Nuestros proveedores (alojamiento de base de datos y de la web, y Hotmart para pagos) procesan datos en nuestro nombre.</p>
        <h2>Tus derechos</h2>
        <p>Puedes descargar todos tus datos, borrar hijos y tareas, o eliminar tu cuenta en cualquier momento desde Ajustes. También puedes escribirnos a <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        <h2>Conservación</h2>
        <p>Guardamos tus datos mientras tengas una cuenta. Si eliminas la cuenta, se borran. Conservamos un registro mínimo de pagos por obligaciones contables y un resumen cifrado (hash) de tu correo para evitar pruebas gratis repetidas.</p>
      </> : <>
        <h2>What we store</h2>
        <ul>
          <li>About the parent or representative: name, email, phone, country, language and time zone.</li>
          <li>About each child: name, and if you add them, grade, school, classroom and teacher.</li>
          <li>The tasks you add: subject, title, description, dates, status and notes.</li>
          <li>Your subscription status as reported by Hotmart. We <strong>never</strong> receive or store card details.</li>
        </ul>
        <h2>What we do NOT ask for</h2>
        <p>We never ask for your Idukay (or any school platform) username or password, and we do not access those platforms.</p>
        <h2>What we use it for</h2>
        <p>Only to show your dashboard, send the reminders you turn on and manage your access. We do not sell data, show ads, or use your children's data for anything else. Product metrics are aggregated and contain no names or tasks.</p>
        <h2>Who can see it</h2>
        <p>Only you. Every account is isolated in the database. Our providers (database and web hosting, and Hotmart for payments) process data on our behalf.</p>
        <h2>Your rights</h2>
        <p>You can download all your data, delete children and tasks, or delete your account at any time from Settings. You can also write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        <h2>Retention</h2>
        <p>We keep your data while you have an account. If you delete the account, it is erased. We keep a minimal payment record for accounting and a hashed form of your email to prevent repeated free trials.</p>
      </>}
    </LegalLayout>
  );
}

export function TermsPage() {
  const { t, lang } = useT();
  return (
    <LegalLayout title={t.legal.termsTitle}>
      {lang === 'es' ? <>
        <h2>El servicio</h2>
        <p>{t.common.appName} es un organizador personal de tareas escolares para padres y representantes. No es un servicio de Idukay ni de tu colegio; la información oficial siempre es la de tu colegio.</p>
        <h2>Prueba y precio</h2>
        <p>Las cuentas nuevas tienen {TRIAL_DAYS} días de prueba gratis con todas las funciones. Después, el acceso Premium cuesta {PRICE_LABEL} USD al mes, cobrado por Hotmart, que renueva automáticamente cada mes hasta que canceles.</p>
        <h2>Cancelación</h2>
        <p>Puedes cancelar cuando quieras. Mantienes el acceso hasta el final del período pagado. Los reembolsos siguen la política de garantía de Hotmart.</p>
        <h2>Tus datos</h2>
        <p>Tú eres responsable de la información que ingresas y de tener derecho a ingresarla. Si no continúas después de la prueba, tus datos se conservan y puedes descargarlos o eliminarlos.</p>
        <h2>Responsabilidad</h2>
        <p>Hacemos lo posible por que la app sea precisa, pero las fechas y tareas dependen de lo que tú ingresas. Revisa siempre la fuente oficial de tu colegio.</p>
      </> : <>
        <h2>The service</h2>
        <p>{t.common.appName} is a personal school-task organizer for parents and representatives. It is not a service of Idukay or your school; the official information is always your school's.</p>
        <h2>Trial and price</h2>
        <p>New accounts get a {TRIAL_DAYS}-day free trial with every feature. After that, Premium costs {PRICE_LABEL} USD per month, charged by Hotmart, renewing monthly until you cancel.</p>
        <h2>Cancellation</h2>
        <p>You can cancel anytime. You keep access until the end of the paid period. Refunds follow Hotmart's guarantee policy.</p>
        <h2>Your data</h2>
        <p>You are responsible for the information you enter and for having the right to enter it. If you do not continue after the trial, your data is kept and you can download or delete it.</p>
        <h2>Liability</h2>
        <p>We do our best to keep the app accurate, but dates and tasks depend on what you enter. Always check your school's official source.</p>
      </>}
    </LegalLayout>
  );
}

export function ContactPage() {
  const { t, lang } = useT();
  return (
    <LegalLayout title={t.legal.contactTitle}>
      <p>{lang === 'es' ? 'Escríbenos para soporte, privacidad o pedidos de eliminación de datos:' : 'Write to us for support, privacy or data deletion requests:'}</p>
      <p><a className="btn" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      <p className="small muted">{lang === 'es' ? 'También puedes descargar o eliminar tus datos tú mismo en Ajustes → Privacidad y datos.' : 'You can also download or delete your data yourself in Settings → Privacy and data.'}</p>
    </LegalLayout>
  );
}
