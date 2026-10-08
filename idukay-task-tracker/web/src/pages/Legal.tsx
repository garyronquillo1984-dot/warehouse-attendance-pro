// DRAFT texts. They must be reviewed by a qualified attorney (data controller, address,
// jurisdiction, Ecuador's LOPDP) before the app is shared with families.
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { SUPPORT_EMAIL } from '../lib/config';
import { BrandMark } from '../components/Icons';
import { PublicFooter } from './Welcome';

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
        <h2>Qué datos hay en la app</h2>
        <ul>
          <li>Las tareas de la clase (materia, instrucciones, fechas, idioma), publicadas por el administrador o por una fuente autorizada.</li>
          <li>De cada estudiante, solo el nombre y su clase (grado y paralelo).</li>
          <li>De los padres: nada. No hay cuentas, correos ni teléfonos de padres. Se accede con un enlace privado.</li>
          <li>Las marcas de "completada" se guardan solo en tu dispositivo, no en nuestros servidores.</li>
        </ul>
        <h2>Qué NO hacemos</h2>
        <p>No pedimos ni guardamos contraseñas de Idukay. No copiamos datos de Idukay sin autorización. No vendemos datos, no mostramos publicidad y no cobramos.</p>
        <h2>Quién ve qué</h2>
        <p>Cada enlace muestra solo las tareas de la clase de los estudiantes asignados a ese enlace. No se muestra la lista de la clase ni datos de otras familias. El administrador puede revocar un enlace en cualquier momento.</p>
        <h2>Contacto</h2>
        <p>Para dudas o para pedir que se retire el nombre de un estudiante: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </> : <>
        <h2>What data is in the app</h2>
        <ul>
          <li>The class homework (subject, instructions, dates, language), published by the administrator or an authorized source.</li>
          <li>For each student, only the first name and class (grade and parallel).</li>
          <li>About parents: nothing. There are no parent accounts, emails or phone numbers. Access is by private link.</li>
          <li>"Completed" marks are stored only on your device, not on our servers.</li>
        </ul>
        <h2>What we do NOT do</h2>
        <p>We never ask for or store Idukay passwords. We do not copy data from Idukay without authorization. We do not sell data, show ads or charge anything.</p>
        <h2>Who sees what</h2>
        <p>Each link shows only the homework of the class of the students assigned to it. The class roster and other families' data are never shown. The administrator can revoke a link at any time.</p>
        <h2>Contact</h2>
        <p>Questions, or to ask for a student's name to be removed: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </>}
    </LegalLayout>
  );
}

export function TermsPage() {
  const { t, lang } = useT();
  return (
    <LegalLayout title={t.legal.termsTitle}>
      {lang === 'es' ? <>
        <p>{t.common.appName} es una herramienta gratuita de apoyo para padres y representantes. Muestra las tareas de la clase de forma simple; no reemplaza la plataforma oficial del colegio, que siempre es la fuente válida.</p>
        <p>El acceso es de solo lectura mediante un enlace privado. No compartas tu enlace en grupos. Si se comparte por error, pide al administrador que lo revoque.</p>
        <p>Hacemos lo posible por que la información sea correcta, pero ante cualquier diferencia vale lo publicado por el colegio.</p>
      </> : <>
        <p>{t.common.appName} is a free support tool for parents and guardians. It shows the class homework simply; it does not replace the school's official platform, which is always the valid source.</p>
        <p>Access is read-only through a private link. Do not share your link in groups. If it is shared by mistake, ask the administrator to revoke it.</p>
        <p>We do our best to keep the information correct, but if anything differs, what the school published prevails.</p>
      </>}
    </LegalLayout>
  );
}

export function ContactPage() {
  const { t, lang } = useT();
  return (
    <LegalLayout title={t.legal.contactTitle}>
      <p>{lang === 'es' ? 'Escríbenos para soporte o temas de privacidad:' : 'Write to us for support or privacy questions:'}</p>
      <p><a className="btn" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
    </LegalLayout>
  );
}
