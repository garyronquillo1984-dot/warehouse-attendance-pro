// Turns what Idukay sends (JSON API responses and/or rendered page items) into
// normalized task objects. Pure functions: no browser, no database — easy to test.
import { parseDate } from '../dates.js';
import { normalizeText, completedFromIdukay } from '../tasks.js';

const nk = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

const KEYS = {
  id: ['_id', 'id', 'uuid', 'homeworkid', 'taskid', 'idtarea', 'activityid', 'tareaid'],
  title: ['title', 'titulo', 'name', 'nombre', 'tarea', 'homeworkname', 'taskname', 'activityname', 'nombretarea', 'tema', 'topic', 'asunto'],
  due: ['duedate', 'due', 'deadline', 'fechaentrega', 'fechalimite', 'fechadeentrega', 'enddate', 'fechafin', 'deliverydate',
    'dateend', 'end', 'hasta', 'limitdate', 'expirationdate', 'closedate', 'vence', 'fechavencimiento', 'duedatetime',
    'submissiondeadline', 'endat', 'dueat', 'entrega', 'finishdate', 'fechamaxima', 'maxdate'],
  assigned: ['assigneddate', 'createdat', 'created', 'fechacreacion', 'startdate', 'fechainicio', 'publishdate', 'publishedat',
    'fechapublicacion', 'date', 'fecha', 'startat', 'begin', 'creationdate', 'sentat', 'desde', 'fechaasignacion', 'start'],
  description: ['description', 'descripcion', 'content', 'contenido', 'detail', 'detalle', 'details', 'body', 'text', 'texto',
    'observacion', 'observaciones', 'comment', 'comentario', 'message', 'mensaje', 'summary', 'resumen'],
  instructions: ['instructions', 'instrucciones', 'indicaciones', 'consigna'],
  subject: ['subject', 'materia', 'asignatura', 'subjectname', 'course', 'coursename', 'area', 'clase', 'class', 'classname',
    'nombremateria', 'nombreasignatura', 'signature'],
  teacher: ['teacher', 'profesor', 'docente', 'teachername', 'createdby', 'author', 'autor', 'owner', 'sender', 'remitente', 'profesornombre'],
  status: ['status', 'estado', 'state', 'deliverystatus', 'estadoentrega', 'submissionstatus', 'deliverystate'],
  completedFlag: ['delivered', 'entregado', 'submitted', 'completed', 'iscompleted', 'isdelivered', 'done', 'realizado', 'finalizado'],
  attachments: ['attachments', 'files', 'archivos', 'adjuntos', 'resources', 'recursos', 'links', 'enlaces', 'documents', 'documentos', 'materiales'],
  student: ['student', 'estudiante', 'alumno', 'studentname', 'child', 'hijo', 'pupil', 'nombreestudiante'],
  grade: ['grade', 'calificacion', 'nota', 'score', 'qualification'],
  type: ['type', 'tipo', 'category', 'categoria', 'kind'],
};

function findKey(obj, list) {
  const map = {};
  for (const k of Object.keys(obj)) map[nk(k)] = k;
  for (const want of list) if (map[want] !== undefined && obj[map[want]] != null && obj[map[want]] !== '') return map[want];
  return null;
}

function get(obj, list) {
  const k = findKey(obj, list);
  return k ? obj[k] : undefined;
}

/** Human-readable string out of a string, number, or a {name} / {first,last} object. */
export function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const first = get(v, ['firstname', 'nombres', 'nombre', 'first', 'givenname']);
    const last = get(v, ['lastname', 'apellidos', 'apellido', 'last', 'surname', 'familyname']);
    const full = get(v, ['fullname', 'nombrecompleto', 'displayname', 'name', 'title', 'titulo', 'label']);
    if (typeof full === 'string') return full.trim();
    if (first || last) return [asText(first), asText(last)].filter(Boolean).join(' ');
  }
  return '';
}

export function htmlToText(s) {
  if (!s || typeof s !== 'string' || !/<[a-z][\s\S]*>/i.test(s)) return (s || '').trim();
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

function linksFromHtml(s) {
  if (!s || typeof s !== 'string') return [];
  const out = [];
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(s))) out.push({ name: htmlToText(m[2]) || m[1], url: m[1] });
  return out;
}

function attachmentsFrom(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((a) => {
    if (typeof a === 'string') return /^https?:/i.test(a) ? { name: a.split('/').pop() || a, url: a } : { name: a, url: null };
    if (a && typeof a === 'object') {
      const url = get(a, ['url', 'href', 'link', 'path', 'downloadurl', 'fileurl', 'src', 'location']);
      const name = asText(get(a, ['name', 'nombre', 'filename', 'originalname', 'title', 'titulo', 'label'])) || (typeof url === 'string' ? url.split('/').pop() : '');
      return { name: name || 'Archivo', url: typeof url === 'string' ? url : null };
    }
    return null;
  }).filter((a) => a && a.name && !/no contiene archivos/i.test(a.name));
}

export function matchStudent(text, students) {
  const t = ' ' + normalizeText(text) + ' ';
  return students.find((s) => t.includes(' ' + normalizeText(s) + ' ')) || null;
}

const TASKY_URL = /homework|tarea|task|activit|deber|assignment|agenda|tasks|trabajo/i;
const MESSAGEY_URL = /message|mensaje|chat|notification|notificacion|inbox|circular/i;

/** Walk any JSON value and return the task-like objects it contains. */
export function tasksFromJson(data, { url = '', ctxStudent = null, students = [] } = {}) {
  const out = [];
  const tasky = TASKY_URL.test(url);
  const seen = new Set();
  const walk = (v, depth) => {
    if (depth > 9 || v == null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const t = objectToTask(v, { tasky, url, ctxStudent, students });
    if (t) { out.push(t); return; }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(data, 0);
  return out;
}

function objectToTask(o, { tasky, url, ctxStudent, students }) {
  const titleRaw = get(o, KEYS.title);
  const title = htmlToText(asText(titleRaw));
  if (!title || title.length < 2 || title.length > 300) return null;
  if (students.some((s) => normalizeText(s) === normalizeText(title))) return null; // a student object

  const due = parseDate(get(o, KEYS.due));
  const assigned = parseDate(get(o, KEYS.assigned));
  const descRaw = get(o, KEYS.description);
  const description = htmlToText(asText(descRaw));
  const hasTaskWords = Object.keys(o).some((k) => /homework|tarea|deber|entrega|deadline|due/i.test(k));

  // Accept: an explicit due date, or a task-looking endpoint/object that at least has a date.
  const accept = Boolean(due) || ((tasky || hasTaskWords) && Boolean(assigned));
  if (!accept) return null;
  // Messages/notifications without a due date are not tasks.
  if (!due && MESSAGEY_URL.test(url) && !hasTaskWords) return null;

  const instrRaw = get(o, KEYS.instructions);
  const statusRaw = get(o, KEYS.status);
  const flagKey = findKey(o, KEYS.completedFlag);
  const flagVal = flagKey ? o[flagKey] : undefined;
  const idukayStatus = asText(statusRaw) || (typeof flagVal === 'boolean' ? (flagVal ? 'Entregada' : 'No entregada') : '');

  let student = matchStudent(asText(get(o, KEYS.student)), students);
  if (!student) student = ctxStudent || null;

  const attachments = [
    ...attachmentsFrom(get(o, KEYS.attachments)),
    ...linksFromHtml(typeof descRaw === 'string' ? descRaw : ''),
    ...linksFromHtml(typeof instrRaw === 'string' ? instrRaw : ''),
  ];

  const extra = {};
  const grade = asText(get(o, KEYS.grade));
  if (grade) extra.calificacion = grade;
  const type = asText(get(o, KEYS.type));
  if (type && type.length < 60) extra.tipo = type;

  const idVal = get(o, KEYS.id);
  return {
    idukayId: (typeof idVal === 'string' || typeof idVal === 'number') ? String(idVal) : null,
    student,
    subject: htmlToText(asText(get(o, KEYS.subject))) || null,
    title,
    description: description || null,
    instructions: htmlToText(asText(instrRaw)) || null,
    teacher: asText(get(o, KEYS.teacher)) || null,
    assignedDate: assigned?.date || null,
    dueDate: due?.date || null,
    dueTime: due?.time && due.time !== '00:00' ? due.time : null,
    idukayStatus: idukayStatus || null,
    completedByIdukay: completedFromIdukay(idukayStatus, { completed: flagVal === true }),
    attachments: dedupeAttachments(attachments),
    extra,
    source: 'api',
  };
}

function dedupeAttachments(list) {
  const seen = new Set();
  return list.filter((a) => {
    const k = (a.url || '') + '|' + a.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- rendered page ----------

const LABEL_DUE = /(entrega|vence|vencimiento|l[ií]mite|hasta|due|deadline|plazo)/i;
const LABEL_ASSIGNED = /(asignad|publicad|cread|enviad|desde|inicio|assigned|created|posted|fecha de env)/i;
const LABEL_SUBJECT = /^(materia|asignatura|subject|clase|curso)\s*:?\s*/i;
const LABEL_TEACHER = /^(prof(?:esor|esora)?\.?|docente|teacher|lic\.|msc\.?)\s*:?\s*/i;
const STATUS_WORDS = /(no entregad[ao]|entregad[ao]|pendiente|vencid[ao]|calificad[ao]|completad[ao]|vigente|atrasad[ao]|a[uú]n no est[aá] disponible|no disponible|revisad[ao]|sin entregar)/i;
const SUBJECT_WORDS = /\b(matem[aá]tica|lengua|literatura|science|ciencias|estudios sociales|social studies|ingl[eé]s|english|language arts|educaci[oó]n|arte|art[ií]stica|m[uú]sica|fe\b|religi[oó]n|f[ií]sica|qu[ií]mica|biolog[ií]a|computaci[oó]n|inform[aá]tica|spelling|phonics|valores|cambridge|lectura|historia|geograf[ií]a|franc[eé]s|tecnolog[ií]a)/i;

const UI_WORDS = /^(ver m[aá]s|ver detalle|abrir|cerrar|close|aceptar|ok|volver|regresar|descargar|×|x|✕|detalle(s)?( de la (tarea|actividad))?|informaci[oó]n de la tarea)$/i;

function hasDate(s) { return Boolean(parseDate(s)) && /\d/.test(s); }

/**
 * items: [{ lines: string[], headings: string[], links: [{text, href}], statusHints: string[], subjectHints: string[] }]
 */
export function tasksFromDomItems(items, { ctxStudent = null, students = [], tab = null } = {}) {
  return items.map((it) => domItemToTask(it, { ctxStudent, students, tab })).filter(Boolean);
}

export function domItemToTask(it, { ctxStudent, students, tab }) {
  const lines = (it.lines || []).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) return null;
  const used = new Set();

  // Dates: labelled first (label on the same line or on the line before), then by order.
  let due = null, assigned = null;
  const dated = [];
  lines.forEach((l, i) => {
    if (!hasDate(l)) return;
    const prev = i > 0 ? lines[i - 1] : '';
    const labelLine = LABEL_DUE.test(l) || LABEL_ASSIGNED.test(l) ? l : (prev.length < 40 ? prev : '');
    dated.push({ i, d: parseDate(l), label: labelLine });
  });
  for (const x of dated) {
    if (!due && LABEL_DUE.test(x.label)) { due = x.d; used.add(x.i); }
    else if (!assigned && LABEL_ASSIGNED.test(x.label)) { assigned = x.d; used.add(x.i); }
  }
  const unlabeled = dated.filter((x) => !used.has(x.i));
  if (!due && unlabeled.length) {
    const latest = unlabeled.reduce((a, b) => (b.d.date > a.d.date ? b : a));
    due = latest.d; used.add(latest.i);
  }
  if (!assigned) {
    const rest = dated.filter((x) => !used.has(x.i));
    if (rest.length) { const e = rest.reduce((a, b) => (b.d.date < a.d.date ? b : a)); if (!due || e.d.date <= due.date) { assigned = e.d; used.add(e.i); } }
  }
  // Pure label lines that preceded a date are consumed too.
  for (const x of dated) if (used.has(x.i) && x.i > 0 && lines[x.i - 1].length < 40 && (LABEL_DUE.test(lines[x.i - 1]) || LABEL_ASSIGNED.test(lines[x.i - 1])) && !hasDate(lines[x.i - 1])) used.add(x.i - 1);

  // Status
  let idukayStatus = (it.statusHints || []).map((s) => s.trim()).find((s) => STATUS_WORDS.test(s)) || null;
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    if (l.length < 60 && STATUS_WORDS.test(l) && !LABEL_SUBJECT.test(l)) { if (!idukayStatus) idukayStatus = l; used.add(i); }
  });

  // Subject
  let subject = (it.subjectHints || []).map((s) => s.trim()).find(Boolean) || null;
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    if (LABEL_SUBJECT.test(l)) { if (!subject) subject = l.replace(LABEL_SUBJECT, '').trim(); used.add(i); }
  });
  if (subject) lines.forEach((l, i) => { if (!used.has(i) && l === subject) used.add(i); });

  // Teacher
  let teacher = null;
  lines.forEach((l, i) => {
    if (used.has(i) || teacher) return;
    if (LABEL_TEACHER.test(l)) { teacher = l.replace(LABEL_TEACHER, '').trim(); used.add(i); }
    else if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*, [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*$/.test(l) && l.length < 70) { teacher = l; used.add(i); }
  });

  // Title: heading that is not a date/status/subject; else first free line.
  let title = (it.headings || []).map((h) => h.trim()).find((h) => h && !hasDate(h) && !STATUS_WORDS.test(h) && h !== subject && h.length <= 200) || null;
  if (title) lines.forEach((l, i) => { if (!used.has(i) && l === title) used.add(i); });
  if (!subject) {
    const idx = lines.findIndex((l, i) => !used.has(i) && l !== title && l.length < 80 && SUBJECT_WORDS.test(l));
    if (idx >= 0) { subject = lines[idx]; used.add(idx); }
  }
  if (!title) {
    const idx = lines.findIndex((l, i) => !used.has(i) && l.length >= 3 && l.length <= 200);
    if (idx >= 0) { title = lines[idx]; used.add(idx); }
  }
  if (!title) return null;

  // Student shown on the item itself (combined lists) wins over the selected one.
  let student = null;
  lines.forEach((l, i) => {
    if (used.has(i) || student) return;
    const s = matchStudent(l, students);
    if (s && l.length < 60) { student = s; used.add(i); }
  });
  student = student || ctxStudent;

  const attachments = (it.links || [])
    .filter((a) => a.href && !/^(javascript:|#|mailto:)/i.test(a.href) && !/^https?:\/\/[^/]*idukay\.net\/colegios\/?#\/(?!.*(file|archivo|download|descarga))/i.test(a.href))
    .map((a) => ({ name: (a.text || '').trim() || a.href.split('/').pop(), url: a.href }));
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    if (/no contiene archivos adjuntos/i.test(l)) { used.add(i); return; }
    if (/\.(pdf|docx?|pptx?|xlsx?|jpe?g|png|mp4|mp3)\b/i.test(l) && l.length < 160) {
      if (!attachments.some((a) => a.name === l)) attachments.push({ name: l, url: null });
      used.add(i);
    }
  });

  const description = lines.filter((l, i) => !used.has(i) && !UI_WORDS.test(l)).join('\n') || null;
  const extra = {};
  if (tab) extra.pestana = tab;

  return {
    idukayId: it.id || null,
    student,
    subject,
    title,
    description,
    instructions: null,
    teacher,
    assignedDate: assigned?.date || null,
    dueDate: due?.date || null,
    dueTime: due?.time && due.time !== '00:00' ? due.time : null,
    idukayStatus,
    completedByIdukay: completedFromIdukay(idukayStatus),
    attachments: dedupeAttachments(attachments),
    extra,
    source: 'page',
  };
}

/** Merge API and page results for one student; API data wins, page fills gaps. */
export function mergeTasks(apiTasks, pageTasks) {
  const out = [];
  const same = (a, b) => normalizeText(a.student) === normalizeText(b.student) &&
    normalizeText(a.title) === normalizeText(b.title) &&
    (!a.dueDate || !b.dueDate || a.dueDate === b.dueDate);
  const absorb = (existing, t) => {
    for (const f of ['idukayId', 'subject', 'description', 'teacher', 'assignedDate', 'dueDate', 'dueTime', 'idukayStatus']) {
      if (!existing[f] && t[f]) existing[f] = t[f];
    }
    if (t.description && existing.description && t.description.length > existing.description.length && t.source === existing.source) existing.description = t.description;
    if (t.attachments.length) existing.attachments = dedupeAttachments([...existing.attachments, ...t.attachments]);
    existing.completedByIdukay = existing.completedByIdukay || t.completedByIdukay;
    existing.extra = { ...t.extra, ...existing.extra };
  };
  for (const t of [...apiTasks, ...pageTasks]) {
    const existing = out.find((x) => same(x, t));
    if (existing) absorb(existing, t);
    else out.push({ ...t, attachments: [...t.attachments], extra: { ...t.extra } });
  }
  return out;
}
