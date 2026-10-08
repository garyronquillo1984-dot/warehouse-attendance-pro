// Interface text in Spanish (default) and English. This translates the APP, never the
// homework: homework is always shown exactly as published, in its original language.
// The English dictionary is typed against the Spanish one, so a missing key fails the build.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { APP_NAME, HISTORY_DAYS } from './config';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const es = {
  locale: 'es-EC',
  common: {
    appName: APP_NAME, free: 'GRATIS PARA PADRES',
    purpose: 'Ayudamos a las familias a organizarse con las tareas diarias de sus hijos.',
    loading: 'Cargando…', retry: 'Reintentar', close: 'Cerrar', back: 'Volver', save: 'Guardar', saving: 'Guardando…', cancel: 'Cancelar',
    error: 'Algo salió mal. Inténtalo de nuevo.', search: 'Buscar', all: 'Todas', optional: 'opcional',
    notOfficial: 'Esta app no reemplaza la plataforma oficial del colegio. Ante cualquier duda, revisa Idukay o consulta al docente.',
    notAffiliated: 'No está afiliada ni respaldada por Idukay. Idukay es una marca de su respectivo dueño.',
    readOnly: 'Solo lectura',
  },
  nav: { today: 'Hoy', twoWeeks: 'Últimas 2 semanas', archive: 'Archivo', menu: 'Menú', language: 'English', forget: 'Olvidar este enlace en este dispositivo', child: 'Hijo/a' },
  status: {
    completed: '🟢 Completada', pending: '🟡 Pendiente', overdue: '🔴 Vencida', upcoming: '🔵 Próxima', archived: '📁 Archivada',
    dueToday: 'Vence hoy', dueTomorrow: 'Vence mañana', new: '🆕 NUEVA',
  },
  lang: { homeworkIn: { en: 'Tarea — EN INGLÉS', es: 'Tarea — EN ESPAÑOL', other: 'Tarea' },
    answerEnglish: 'Tu hijo/a debe hacer esta tarea EN INGLÉS. La explicación en español es solo para ayudarte a entenderla.',
    parentHelp: 'Explicación para padres', noParentHelp: 'Todavía no hay una explicación en español para esta tarea.',
    original: 'Instrucciones originales' },
  today: {
    greeting: { morning: '¡Buenos días! 👋', afternoon: '¡Buenas tardes! 👋', evening: '¡Buenas noches! 👋' },
    title: 'Tareas de hoy',
    count: (n: number) => `${n} ${plural(n, 'TAREA', 'TAREAS')}`,
    completed: (n: number) => `${n} ${plural(n, 'completada', 'completadas')}`,
    pending: (n: number) => `${n} ${plural(n, 'pendiente', 'pendientes')}`,
    overdue: (n: number) => `${n} ${plural(n, 'vencida', 'vencidas')}`,
    summary: (name: string, n: number) => n === 0 ? `Hoy no hay tareas registradas para ${name}.` : `Hoy ${name} tiene ${n} ${plural(n, 'tarea', 'tareas')}.`,
    stillPending: (n: number) => `${plural(n, 'Todavía falta', 'Todavía faltan')} ${n} por completar.`,
    allDone: '¡Muy bien! Las tareas de hoy están completas. 🎉',
    newToday: (subjects: string) => `🆕 Hoy se agregó tarea de ${subjects}.`,
    marksNote: 'Marcar como completada solo se guarda en este dispositivo y no cambia la tarea oficial.',
    thisWeek: 'Esta semana', upcoming: 'Próximas', upcomingHint: 'Tareas que empiezan en los próximos días.',
    noUpcoming: 'No hay tareas próximas registradas.',
  },
  hw: {
    start: 'Inicio', due: 'Entrega', status: 'Estado', teacher: 'Docente', notes: 'Notas', attachments: 'Adjuntos',
    source: 'Fuente', details: 'Ver detalles', markDone: 'Marcar como completada', unmark: 'Quitar marca de completada',
    personal: 'Solo en este dispositivo', revised: 'El administrador corrigió esta tarea después de publicarla.',
    sources: { manual: 'Ingresada por el administrador', idukay_paste: 'Copiada de Idukay por el administrador', idukay_api: 'Idukay (integración autorizada)' },
    notFound: 'No encontramos esta tarea.', noInstructions: 'Sin instrucciones adicionales.',
  },
  weeks: {
    title: 'Últimas 2 semanas', subtitle: `Tareas de los últimos ${HISTORY_DAYS} días`, thisWeek: 'Esta semana', earlier: 'Días anteriores',
    count: (n: number) => `${n}`, tasks: (n: number) => `${n} ${plural(n, 'tarea', 'tareas')}`, today: 'Hoy', empty: 'No hay tareas para este día.',
  },
  archive: {
    title: '📁 Archivo de tareas', subtitle: 'Todas las tareas cuya fecha de entrega ya pasó. Nunca se borran.',
    month: 'Mes', subject: 'Materia', search: 'Buscar en el archivo…', date: 'Ir a una fecha', empty: 'No hay tareas archivadas con estos filtros.',
    noArchive: 'Todavía no hay tareas archivadas.',
    week: (from: string, to: string) => `Semana del ${from} al ${to}`, results: (n: number) => `${n} ${plural(n, 'tarea', 'tareas')}`,
  },
  updated: {
    last: (when: string) => `Última actualización: ${when}`, never: 'Todavía no hay información publicada.',
    stale: (ago: string) => `La información de tareas se actualizó por última vez ${ago}.`,
  },
  link: {
    welcomeTitle: 'Las tareas de tu hijo, en un solo lugar',
    welcomeText: 'Abre el enlace privado que te envió el colegio o el administrador para ver las tareas de tu hijo. No necesitas crear una cuenta ni usar contraseña.',
    howTitle: 'Cómo funciona', how: ['Abre tu enlace privado.', 'Mira las tareas de hoy, de las últimas 2 semanas y el archivo.', 'Ayuda a tu hijo/a y marca lo que ya hizo.'],
    invalidTitle: 'Este enlace no es válido', invalid: 'Puede que haya sido reemplazado. Pide un enlace nuevo al administrador.',
    keepPrivate: 'Tu enlace es privado: no lo compartas en grupos.', opening: 'Abriendo…', adminLogin: 'Acceso de administrador',
    forgetConfirm: '¿Olvidar este enlace en este dispositivo? Necesitarás abrirlo de nuevo para ver las tareas.',
  },
  admin: {
    title: 'Administración', login: 'Ingresar', email: 'Correo', password: 'Contraseña', loggingIn: 'Ingresando…', badLogin: 'Correo o contraseña incorrectos.',
    notAdmin: 'Esta cuenta no tiene permisos de administrador.', signOut: 'Cerrar sesión', forgot: '¿Olvidaste tu contraseña?',
    nav: { status: 'Estado', homework: 'Tareas', add: 'Agregar tareas', students: 'Estudiantes y enlaces', subjects: 'Materias' },
    status: {
      students: 'Estudiantes', links: 'Enlaces activos', homework: 'Tareas', activeToday: 'Activas hoy',
      lastSync: 'Última sincronización', lastChange: 'Último cambio', lastRun: 'Último proceso', never: 'Nunca',
      syncNow: 'Sincronizar ahora', syncing: 'Sincronizando…', notConfigured: 'Sin integración autorizada con Idukay: las tareas se ingresan desde "Agregar tareas".',
      runStatus: { ok: 'Correcto', error: 'Error', not_configured: 'Sin configurar', running: 'En curso' } as Record<string, string>,
      runDetail: (a: number, u: number, s: number) => `${a} nuevas · ${u} actualizadas · ${s} sin cambios`,
    },
    hw: {
      list: 'Tareas de la clase', new: 'Nueva tarea', edit: 'Corregir tarea', subject: 'Materia', title: 'Tarea (título)',
      instructions: 'Instrucciones originales (tal como las publicó el docente)', explanation: 'Explicación para padres (opcional, p. ej. en español)',
      language: 'Idioma en que se hace la tarea', start: 'Fecha de inicio', due: 'Fecha de entrega', teacher: 'Docente', notes: 'Notas',
      attachments: 'Adjuntos (uno por línea: nombre | enlace)', withdraw: 'Retirar (no se borra)', withdrawReason: 'Motivo del retiro', restore: 'Restaurar',
      withdrawn: 'Retirada', revisions: 'Versiones anteriores', saved: 'Tarea guardada.', revisionN: (n: number) => `Versión ${n}`,
      filterAll: 'Todas', filterActive: 'Activas', filterArchived: 'Archivadas', filterWithdrawn: 'Retiradas', languageHint: 'Se completa con el idioma de la materia.',
    },
    add: {
      paste: 'Pegar de Idukay', manual: 'Una por una', csv: 'Archivo CSV',
      pasteHelp: 'Copia el texto de las tareas desde Idukay y pégalo aquí. Revisa cada tarea antes de publicarla. Los duplicados se omiten.',
      organize: 'Organizar tareas', nothing: 'No se encontraron tareas en el texto.', review: (n: number) => `Revisa ${n} ${plural(n, 'tarea', 'tareas')} antes de publicar`,
      publish: (n: number) => `Publicar ${n} ${plural(n, 'tarea', 'tareas')}`, result: (a: number, d: number) => `${a} publicadas · ${d} duplicadas omitidas`,
      defaultStart: 'Inicio para las que no tienen', defaultDue: 'Entrega para las que no tienen', include: 'Incluir',
      csvHelp: 'Columnas: subject, title, start_date, due_date, instructions, parent_explanation, language (en/es), teacher.', template: 'Descargar plantilla', chooseFile: 'Elegir archivo CSV',
      noPassword: 'Nunca uses ni guardes contraseñas de Idukay en esta app.',
    },
    students: {
      title: 'Estudiantes', add: 'Agregar estudiante', firstName: 'Nombre', privacy: 'Solo el nombre. No guardes apellidos, cédulas ni datos de contacto.',
      inactive: 'Inactivo', deactivate: 'Desactivar', activate: 'Activar',
      links: 'Enlaces para padres', newLink: 'Crear enlace', linkLabel: 'Nombre del enlace (p. ej. "Familia de Gael")', linkStudents: 'Estudiantes que verá este enlace',
      created: 'Enlace creado. Cópialo ahora: por seguridad no se volverá a mostrar.', copy: 'Copiar', copied: 'Copiado',
      revoke: 'Revocar', revoked: 'Revocado', revokeConfirm: '¿Revocar este enlace? Quien lo tenga dejará de ver las tareas.', lastUsed: 'Último uso', neverUsed: 'Sin uso',
    },
    subjects: { title: 'Materias', name: 'Materia', language: 'Idioma de la tarea', emoji: 'Ícono', add: 'Agregar materia' },
  },
  langNames: { en: '🇺🇸 ENGLISH', es: '🇪🇸 ESPAÑOL', other: '🌐 OTRO' },
  legal: { privacyTitle: 'Privacidad', termsTitle: 'Condiciones de uso', contactTitle: 'Contacto', draft: 'Borrador — pendiente de revisión legal.' },
};

export type Dict = typeof es;

const en: Dict = {
  locale: 'en-US',
  common: {
    appName: APP_NAME, free: 'FREE FOR PARENTS',
    purpose: "Helping families stay organized with their children's daily homework.",
    loading: 'Loading…', retry: 'Retry', close: 'Close', back: 'Back', save: 'Save', saving: 'Saving…', cancel: 'Cancel',
    error: 'Something went wrong. Please try again.', search: 'Search', all: 'All', optional: 'optional',
    notOfficial: "This app does not replace the school's official platform. If in doubt, check Idukay or ask the teacher.",
    notAffiliated: 'Not affiliated with or endorsed by Idukay. Idukay is a trademark of its respective owner.',
    readOnly: 'Read only',
  },
  nav: { today: 'Today', twoWeeks: 'Last 2 Weeks', archive: 'Archive', menu: 'Menu', language: 'Español', forget: 'Forget this link on this device', child: 'Child' },
  status: {
    completed: '🟢 Completed', pending: '🟡 Still Pending', overdue: '🔴 Overdue', upcoming: '🔵 Upcoming', archived: '📁 Archived',
    dueToday: 'Due Today', dueTomorrow: 'Due Tomorrow', new: '🆕 NEW',
  },
  lang: { homeworkIn: { en: 'Homework — ENGLISH', es: 'Homework — SPANISH', other: 'Homework' },
    answerEnglish: 'Your child must do this homework IN ENGLISH. The Spanish explanation is only to help you understand it.',
    parentHelp: 'Parent Explanation', noParentHelp: 'There is no Spanish explanation for this homework yet.',
    original: 'Original instructions' },
  today: {
    greeting: { morning: 'Good morning! 👋', afternoon: 'Good afternoon! 👋', evening: 'Good evening! 👋' },
    title: "Today's Homework",
    count: (n: number) => `${n} ${plural(n, 'ASSIGNMENT', 'ASSIGNMENTS')}`,
    completed: (n: number) => `${n} completed`,
    pending: (n: number) => `${n} pending`,
    overdue: (n: number) => `${n} overdue`,
    summary: (name: string, n: number) => n === 0 ? `No homework is registered for ${name} today.` : `Today ${name} has ${n} homework ${plural(n, 'assignment', 'assignments')}.`,
    stillPending: (n: number) => `${n} ${plural(n, 'assignment still needs', 'assignments still need')} to be completed.`,
    allDone: "Great! Today's homework is complete. 🎉",
    newToday: (subjects: string) => `🆕 ${subjects} homework was added today.`,
    marksNote: 'Marking as completed is saved on this device only and does not change the official homework.',
    thisWeek: 'This week', upcoming: 'Upcoming', upcomingHint: 'Homework starting in the next few days.',
    noUpcoming: 'No upcoming homework registered.',
  },
  hw: {
    start: 'Start', due: 'Due', status: 'Status', teacher: 'Teacher', notes: 'Notes', attachments: 'Attachments',
    source: 'Source', details: 'View Details', markDone: 'Mark as Completed', unmark: 'Remove completed mark',
    personal: 'On this device only', revised: 'The administrator corrected this homework after publishing it.',
    sources: { manual: 'Entered by the administrator', idukay_paste: 'Copied from Idukay by the administrator', idukay_api: 'Idukay (authorized integration)' },
    notFound: 'We could not find this homework.', noInstructions: 'No additional instructions.',
  },
  weeks: {
    title: 'Last 2 Weeks', subtitle: `Homework from the last ${HISTORY_DAYS} days`, thisWeek: 'This week', earlier: 'Earlier days',
    count: (n: number) => `${n}`, tasks: (n: number) => `${n} ${plural(n, 'assignment', 'assignments')}`, today: 'Today', empty: 'No homework for this day.',
  },
  archive: {
    title: '📁 Homework Archive', subtitle: 'Every assignment whose due date has passed. Nothing is ever deleted.',
    month: 'Month', subject: 'Subject', search: 'Search the archive…', date: 'Go to a date', empty: 'No archived homework with these filters.',
    noArchive: 'No archived homework yet.',
    week: (from: string, to: string) => `Week of ${from}–${to}`, results: (n: number) => `${n} ${plural(n, 'assignment', 'assignments')}`,
  },
  updated: {
    last: (when: string) => `Last updated: ${when}`, never: 'No homework information has been published yet.',
    stale: (ago: string) => `Homework information was last updated ${ago}.`,
  },
  link: {
    welcomeTitle: "Your child's homework, in one place",
    welcomeText: "Open the private link the school or administrator sent you to see your child's homework. No account or password needed.",
    howTitle: 'How it works', how: ['Open your private link.', "See today's homework, the last 2 weeks and the archive.", 'Help your child and tick off what is done.'],
    invalidTitle: 'This link is not valid', invalid: 'It may have been replaced. Ask the administrator for a new link.',
    keepPrivate: 'Your link is private: do not share it in groups.', opening: 'Opening…', adminLogin: 'Administrator access',
    forgetConfirm: 'Forget this link on this device? You will need to open it again to see the homework.',
  },
  admin: {
    title: 'Administration', login: 'Log in', email: 'Email', password: 'Password', loggingIn: 'Logging in…', badLogin: 'Wrong email or password.',
    notAdmin: 'This account does not have administrator permissions.', signOut: 'Sign out', forgot: 'Forgot your password?',
    nav: { status: 'Status', homework: 'Homework', add: 'Add homework', students: 'Students & links', subjects: 'Subjects' },
    status: {
      students: 'Students', links: 'Active links', homework: 'Homework', activeToday: 'Active today',
      lastSync: 'Last synchronization', lastChange: 'Last change', lastRun: 'Last run', never: 'Never',
      syncNow: 'Sync now', syncing: 'Syncing…', notConfigured: 'No authorized Idukay integration: homework is entered from "Add homework".',
      runStatus: { ok: 'OK', error: 'Error', not_configured: 'Not configured', running: 'Running' },
      runDetail: (a: number, u: number, s: number) => `${a} new · ${u} updated · ${s} unchanged`,
    },
    hw: {
      list: 'Class homework', new: 'New homework', edit: 'Correct homework', subject: 'Subject', title: 'Homework (title)',
      instructions: 'Original instructions (exactly as the teacher published them)', explanation: 'Parent explanation (optional, e.g. in Spanish)',
      language: 'Language the homework is done in', start: 'Start date', due: 'Due date', teacher: 'Teacher', notes: 'Notes',
      attachments: 'Attachments (one per line: name | link)', withdraw: 'Withdraw (not deleted)', withdrawReason: 'Reason for withdrawing', restore: 'Restore',
      withdrawn: 'Withdrawn', revisions: 'Previous versions', saved: 'Homework saved.', revisionN: (n: number) => `Version ${n}`,
      filterAll: 'All', filterActive: 'Active', filterArchived: 'Archived', filterWithdrawn: 'Withdrawn', languageHint: "Filled from the subject's language.",
    },
    add: {
      paste: 'Paste from Idukay', manual: 'One by one', csv: 'CSV file',
      pasteHelp: 'Copy the homework text from Idukay and paste it here. Review each item before publishing. Duplicates are skipped.',
      organize: 'Organize homework', nothing: 'No homework found in the text.', review: (n: number) => `Review ${n} ${plural(n, 'item', 'items')} before publishing`,
      publish: (n: number) => `Publish ${n} ${plural(n, 'item', 'items')}`, result: (a: number, d: number) => `${a} published · ${d} duplicates skipped`,
      defaultStart: 'Start date when missing', defaultDue: 'Due date when missing', include: 'Include',
      csvHelp: 'Columns: subject, title, start_date, due_date, instructions, parent_explanation, language (en/es), teacher.', template: 'Download template', chooseFile: 'Choose CSV file',
      noPassword: 'Never use or store Idukay passwords in this app.',
    },
    students: {
      title: 'Students', add: 'Add student', firstName: 'First name', privacy: 'First name only. Do not store surnames, ID numbers or contact details.',
      inactive: 'Inactive', deactivate: 'Deactivate', activate: 'Activate',
      links: 'Parent links', newLink: 'Create link', linkLabel: 'Link name (e.g. "Gael\'s family")', linkStudents: 'Students this link can see',
      created: 'Link created. Copy it now: for security it will not be shown again.', copy: 'Copy', copied: 'Copied',
      revoke: 'Revoke', revoked: 'Revoked', revokeConfirm: 'Revoke this link? Whoever has it will stop seeing the homework.', lastUsed: 'Last used', neverUsed: 'Never used',
    },
    subjects: { title: 'Subjects', name: 'Subject', language: 'Homework language', emoji: 'Icon', add: 'Add subject' },
  },
  langNames: { en: '🇺🇸 ENGLISH', es: '🇪🇸 ESPAÑOL', other: '🌐 OTHER' },
  legal: { privacyTitle: 'Privacy', termsTitle: 'Terms of use', contactTitle: 'Contact', draft: 'Draft — pending legal review.' },
};

export type UiLang = 'es' | 'en';
const DICTS: Record<UiLang, Dict> = { es, en };
const KEY = 'itt.lang';

function initialLang(): UiLang {
  try { const saved = localStorage.getItem(KEY); if (saved === 'es' || saved === 'en') return saved; } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

const Ctx = createContext<{ lang: UiLang; t: Dict; setLang: (l: UiLang) => void }>({ lang: 'es', t: es, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initialLang);
  const setLang = (l: UiLang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <Ctx.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
