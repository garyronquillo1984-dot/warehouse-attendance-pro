// "Add Tasks from Idukay": turns text a parent copied from their school platform into task
// rows that the parent reviews and edits before anything is saved.
// Pure TypeScript, no browser APIs: the pasted text never leaves the device while parsing.
//
// Understands, in Spanish and English:
//   • one task per line:        "Matemática: resolver ejercicios 1-10."
//   • several in one paragraph: "Matemática: ejercicios 1-10. Lengua: leer capítulo 3."
//   • bullets / numbering:      "- Lengua: ...", "• ...", "1) ..."
//   • task cards copied from the platform (subject line, title line, "Fecha de entrega: …",
//     "Profesor: …", description lines)
//   • child headers:            "GAEL" / "Edric:" on their own line assigns the tasks below
//   • dates:                    hoy, mañana, pasado mañana, (para el) viernes, 12/10, 12/10/2026,
//                               2026-10-12, oct. 12, 2026, 12 de octubre, today, tomorrow, Friday,
//                               October 12

export interface ParsedTask {
  key: string;
  childId: string | null;
  subject: string;
  title: string;
  description: string | null;           // the ORIGINAL instructions, never translated
  parentExplanation: string | null;     // a translation/explanation found in the text, kept separate
  startDate: string | null;      // YYYY-MM-DD ("Fecha de publicación / asignación")
  language?: 'en' | 'es' | 'other' | null;   // set by the caller from the subject (or a CSV column)
  dueDate: string | null;        // YYYY-MM-DD
  teacher: string | null;
  priority: 'low' | 'normal' | 'high';
  warnings: Array<'no_date' | 'no_subject' | 'past_date' | 'long_title'>;
}

export interface ParseOptions {
  today: string;                                   // YYYY-MM-DD in the parent's time zone
  children?: Array<{ id: string; name: string }>;
  knownSubjects?: string[];                        // the family's subjects (improves card detection)
  defaultChildId?: string | null;
  defaultSubject?: string;                         // used when a line has no subject
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {   // ISO: Monday = 1
  lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

function parseIso(d: string): Date { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: string, n: number): string { const x = parseIso(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); }
function isoDow(d: string): number { const w = parseIso(d).getUTCDay(); return w === 0 ? 7 : w; }
function valid(y: number, m: number, d: number): boolean {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}
// Without a year, pick the one that puts the date closest to "now" (school work is near-term).
function withYear(m: number, d: number, today: string): string | null {
  const ty = Number(today.slice(0, 4));
  let best: string | null = null; let bestDist = Infinity;
  for (const y of [ty - 1, ty, ty + 1]) {
    if (!valid(y, m, d)) continue;
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // future dates are likelier than past ones: weigh the past 3×
    const diff = (parseIso(s).getTime() - parseIso(today).getTime()) / 864e5;
    const dist = diff < 0 ? -diff * 3 : diff;
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  return best;
}
const ymd = (y: number, m: number, d: number) => valid(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

const W = '[a-záéíóúñü]';
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const DAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

// Each rule: regex (case-insensitive) and how to turn the match into a date.
// The "lead" group swallows connecting words ("para el", "hasta el", "due", "vence el") so the
// title reads cleanly after the date is removed.
const LEAD = String.raw`(?:(?:\(|,|-|–)\s*)?(?:(?:para|hasta|entrega(?:r)?|vence|fecha(?: de entrega)?|due|by|on|el|la|this|este|next|pr[oó]ximo)\s*:?\s*)*`;
const RULES: Array<{ re: RegExp; date: (m: RegExpMatchArray, today: string) => string | null }> = [
  { re: new RegExp(String.raw`${LEAD}\b(\d{4})-(\d{1,2})-(\d{1,2})\b`, 'i'),
    date: m => ymd(+m[1], +m[2], +m[3]) },
  { re: new RegExp(String.raw`${LEAD}\b(${MONTH_RE})\.?\s+(\d{1,2}),?\s+(\d{4})\b`, 'i'),
    date: m => ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) },
  { re: new RegExp(String.raw`${LEAD}\b(\d{1,2})\s+(?:de\s+)?(${MONTH_RE})\.?(?:\s+(?:de\s+|del\s+)?(\d{4}))?(?!${W})`, 'i'),
    date: (m, t) => m[3] ? ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : withYear(MONTHS[m[2].toLowerCase()], +m[1], t) },
  { re: new RegExp(String.raw`${LEAD}\b(${MONTH_RE})\.?\s+(\d{1,2})(?!\d)`, 'i'),
    date: (m, t) => withYear(MONTHS[m[1].toLowerCase()], +m[2], t) },
  { re: new RegExp(String.raw`${LEAD}\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b`, 'i'),
    date: (m, t) => {
      let d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];   // 10/25 → October 25
      if (!m[3]) return withYear(mo, d, t);
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return ymd(y, mo, d);
    } },
  { re: new RegExp(String.raw`${LEAD}\b(pasado\s+mañana|day\s+after\s+tomorrow)(?!${W})`, 'i'), date: (_m, t) => addDays(t, 2) },
  { re: new RegExp(String.raw`${LEAD}\b(mañana|tomorrow)(?!${W})`, 'i'), date: (_m, t) => addDays(t, 1) },
  { re: new RegExp(String.raw`${LEAD}\b(hoy|today|tonight|esta\s+noche)(?!${W})`, 'i'), date: (_m, t) => t },
  { re: new RegExp(String.raw`${LEAD}\b(${DAY_RE})(?!${W})(?:\s+\d{1,2}(?!\d))?`, 'i'),
    date: (m, t) => {
      const want = WEEKDAYS[m[1].toLowerCase()];
      const ahead = ((want - isoDow(t)) + 7) % 7 || 7;   // the next one, never today
      return addDays(t, ahead);
    } },
];

/** Finds the first date in a piece of text. Returns the date and the text without it. */
export function extractDate(text: string, today: string): { date: string | null; rest: string } {
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    const date = r.date(m, today);
    if (!date) continue;
    let rest = text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length);
    rest = rest.replace(/\(\s*\)/g, ' ').replace(/·\s*\d{1,2}:\d{2}/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:)])/g, '$1').trim();
    rest = rest.replace(/[,;:\-–(]+$/g, '').trim();
    // the date may have taken the "(" of "(vence el lunes)" with it
    if ((rest.match(/\)/g) ?? []).length > (rest.match(/\(/g) ?? []).length) rest = rest.replace(/\s*\)([^)]*)$/, '$1').trim();
    return { date, rest };
  }
  return { date: null, rest: text };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------
const NOISE = /^(vigentes?|anteriores|tareas?|tasks?|pendientes?|ver m[aá]s|see more|calificaci[oó]n.*|adjuntos?|attachments?|no contiene archivos adjuntos.*|sin adjuntos|comentarios?|comments?|entregar|submit|\d{1,2}:\d{2}(\s*[ap]\.?m\.?)?|[-–—•·*_=]+)$/i;
// The value is always capture group 1.
const META_DUE = /^(?:fecha\s+(?:de\s+)?entrega|fecha\s+l[ií]mite|entrega|vence|due(?:\s+date)?|deadline)\s*:?\s*(.*)$/i;
const META_TEACHER = /^(?:profesor(?:a)?|docente|maestr[oa]|teacher|tutor(?:a)?|prof\.)\s*:?\s*(.+)$/i;
const META_ASSIGNED = /^(?:fecha\s+de\s+(?:publicaci[oó]n|asignaci[oó]n|creaci[oó]n)|publicad[oa]|asignad[oa]|assigned|posted)\s*:?\s*(.*)$/i;
const META_DESC = /^(?:descripci[oó]n|instrucciones|instructions|description|detalle)\s*:?\s*(.*)$/i;
// A translation or explanation for parents. Everything after it (until the card ends) is kept
// apart from the original instructions.
const META_EXPLAIN = /^(?:traducci[oó]n|en espa[nñ]ol|explicaci[oó]n(?:\s+para\s+(?:padres|representantes))?|para\s+padres|spanish(?:\s+translation)?|ayuda\s+para\s+padres)\s*:\s*(.*)$/i;
const BULLET = /^\s*(?:[-–—•·*▪►✓✔☐□]|\d{1,2}[.)]|[a-z][.)])\s+/i;
// "Subject: task" — the subject is short and has no sentence punctuation.
const SUBJECT_COLON = /^([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9 .&/()'-]{1,44}?)\s*[:–—]\s+(.{2,})$/;
const HIGH = /\b(urgente|importante|examen|prueba|evaluaci[oó]n|lecci[oó]n|test|exam|quiz|urgent|important)\b/i;

const COMMON_SUBJECTS = [
  'matemática', 'matemáticas', 'matematica', 'math', 'maths', 'mathematics', 'lengua', 'lengua y literatura', 'lenguaje',
  'literatura', 'language', 'language arts', 'english', 'inglés', 'ingles', 'spelling', 'reading', 'lectura',
  'ciencias', 'ciencias naturales', 'science', 'estudios sociales', 'sociales', 'social studies', 'historia', 'history',
  'geografía', 'geography', 'arte', 'art', 'música', 'music', 'educación física', 'physical education', 'pe',
  'educación cultural y artística', 'ecaa', 'religión', 'educación en la fe', 'computación', 'informática',
  'computing', 'tecnología', 'technology', 'francés', 'french', 'química', 'chemistry', 'física', 'physics', 'biología',
  'biology', 'filosofía', 'emprendimiento', 'robótica', 'robotics', 'valores', 'catequesis',
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 /]/g, ' ').replace(/\s+/g, ' ').trim();
const cap = (s: string) => s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
const cleanTitle = (s: string) => cap(s.replace(BULLET, '').replace(/^[\s:;,\-–—]+/, '').replace(/[\s.;,]+$/, '').replace(/\s{2,}/g, ' ').trim());

function subjectMatcher(known: string[]) {
  const list = [...new Set([...known, ...COMMON_SUBJECTS].map(norm))];
  return (line: string): boolean => {
    const n = norm(line);
    if (!n || n.length > 50) return false;
    // "Matemática / Ed. Financiera", "Lengua y Literatura / A. a la Lectura"
    return list.some(s => n === s || n.startsWith(s + ' /') || n.startsWith(s + ' y ') || n.startsWith(s + ' - '));
  };
}

function childHeader(line: string, children: Array<{ id: string; name: string }>): string | null {
  const n = norm(line.replace(/[:\-–—]+$/, ''));
  for (const c of children) {
    const cn = norm(c.name);
    if (cn && (n === cn || n === `tareas de ${cn}` || n === `tasks for ${cn}` || n === `${cn} tareas`)) return c.id;
  }
  return null;
}

// Splits "Matemática: x. Lengua: y." into one segment per "Subject:".
function splitParagraph(line: string): string[] {
  return line.split(/(?<=[.;!?])\s+(?=[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑÜáéíóúñü .&/()'-]{1,40}:\s)/);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function parseIdukayText(text: string, opts: ParseOptions): ParsedTask[] {
  const children = opts.children ?? [];
  const isSubject = subjectMatcher(opts.knownSubjects ?? []);
  const defaultSubject = opts.defaultSubject ?? '';
  const out: ParsedTask[] = [];
  let child: string | null = opts.defaultChildId ?? (children.length === 1 ? children[0].id : null);
  let seq = 0;

  // Card mode state: a subject line opened a card; following lines fill it.
  let card: ParsedTask | null = null;
  let cardDescription: string[] = [];
  let cardExplain: string[] | null = null;
  const closeCard = () => {
    if (card) {
      if (cardDescription.length) card.description = cardDescription.join('\n');
      if (cardExplain?.length) card.parentExplanation = cardExplain.join('\n');
      if (card.title) out.push(card);
    }
    card = null; cardDescription = []; cardExplain = null;
  };
  const newTask = (subject: string, title: string, dueDate: string | null): ParsedTask => ({
    key: `p${++seq}`, childId: child, subject, title, description: null, parentExplanation: null, startDate: null, dueDate, teacher: null,
    priority: HIGH.test(title) ? 'high' : 'normal', warnings: [],
  });

  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map(l => l.trim());
  for (const raw of lines) {
    if (!raw) { closeCard(); continue; }
    if (NOISE.test(raw)) continue;

    const kid = childHeader(raw, children);
    if (kid) { closeCard(); child = kid; continue; }

    // Metadata lines belong to the open card (or to the last task).
    const target: ParsedTask | null = card ?? out[out.length - 1] ?? null;
    let m: RegExpMatchArray | null;
    if (target && (m = raw.match(META_DUE))) {
      const { date } = extractDate(m[1] || raw, opts.today);
      if (date) target.dueDate = date;
      continue;
    }
    if (target && (m = raw.match(META_TEACHER))) { target.teacher = cleanTitle(m[1]).slice(0, 120); continue; }
    if (m = raw.match(META_ASSIGNED)) {
      const { date } = extractDate(m[1] || '', opts.today);
      if (target && date) target.startDate = date;
      continue;
    }
    if (card && (m = raw.match(META_EXPLAIN))) { cardExplain = m[1] ? [m[1]] : []; continue; }
    if (card && cardExplain && (card as ParsedTask).title) { cardExplain.push(raw); continue; }
    if (card && (m = raw.match(META_DESC))) { if (m[1]) cardDescription.push(m[1]); continue; }

    // A bare subject line starts a card.
    const unbulleted = raw.replace(BULLET, '');
    if (isSubject(unbulleted) && !SUBJECT_COLON.test(unbulleted)) {
      closeCard();
      card = newTask(cleanTitle(unbulleted), '', null);
      continue;
    }
    // Inside a card: first free line is the title, the rest is description.
    if (card) {
      const c: ParsedTask = card;
      if (!c.title) {
        const { date, rest } = extractDate(unbulleted, opts.today);
        c.title = cleanTitle(rest);
        if (date && !c.dueDate) c.dueDate = date;
        if (HIGH.test(c.title)) c.priority = 'high';
      } else {
        cardDescription.push(unbulleted);
        if (!c.dueDate) { const { date } = extractDate(unbulleted, opts.today); if (date) c.dueDate = date; }
      }
      continue;
    }

    // Line mode: one or more "Subject: task" segments, or a bare task.
    for (const seg of splitParagraph(unbulleted)) {
      const s = seg.replace(BULLET, '').trim();
      if (!s || NOISE.test(s)) continue;
      const sc = s.match(SUBJECT_COLON);
      let subject = defaultSubject, body = s;
      if (sc && !/^(https?|www)/i.test(sc[1])) { subject = cleanTitle(sc[1]); body = sc[2]; }
      const { date, rest } = extractDate(body, opts.today);
      out.push(newTask(subject, cleanTitle(rest), date));
    }
  }
  closeCard();

  for (const t of out) {
    if (!t.subject) t.warnings.push('no_subject');
    if (!t.dueDate) t.warnings.push('no_date');
    else if (t.dueDate < opts.today) t.warnings.push('past_date');
    if (t.title.length > 200) { t.title = t.title.slice(0, 200); t.warnings.push('long_title'); }
    if (t.subject.length > 80) t.subject = t.subject.slice(0, 80);
  }
  return out.filter(t => t.title);
}
