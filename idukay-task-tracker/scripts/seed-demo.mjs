// DEMO DATA — local/staging only, never production.
// Creates: an administrator (demo.admin@example.com / Demo-Admin-2026), the student Gael in
// "4.º EGB — Paralelo A", the student Edric in a clearly-labelled DEMO class (his real grade is
// not known), one family link covering both, and fictional homework around today
// (today, the last 2 weeks, the archive and a few upcoming) in English and Spanish subjects.
//
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=... APP_URL=http://localhost:5173 node scripts/seed-demo.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, appUrl = process.env.APP_URL || 'http://localhost:5173';
if (!url || !service) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (/supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_DEMO) { console.error('Refusing to seed a hosted project (set ALLOW_REMOTE_DEMO=1 for staging).'); process.exit(1); }
const db = createClient(url, service, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Dates in the class's time zone, like the app.
const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
const day = n => { const d = new Date(`${todayLocal}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ago = days => new Date(Date.now() - days * 864e5).toISOString();

// Administrator
const ADMIN = { email: 'demo.admin@example.com', password: 'Demo-Admin-2026' };
let adminId;
const created = await db.auth.admin.createUser({ email: ADMIN.email, password: ADMIN.password, email_confirm: true, user_metadata: { demo: true } });
if (created.error) {
  const list = must(await db.auth.admin.listUsers());
  adminId = list.users.find(u => u.email === ADMIN.email)?.id;
} else adminId = created.data.user.id;
await db.from('admins').upsert({ user_id: adminId });

const c4a = must(await db.from('classes').select('id').eq('grade_short', '4.º EGB').eq('parallel', 'A').single()).id;
let demoClass = (await db.from('classes').select('id').eq('grade_short', 'DEMO').maybeSingle()).data?.id;
if (!demoClass) demoClass = must(await db.from('classes').insert({ grade_label: 'Clase de demostración (grado por confirmar)', grade_short: 'DEMO', parallel: '—' }).select('id').single()).id;

const student = async (cls, name) => (await db.from('students').select('id').eq('class_id', cls).eq('first_name', name).maybeSingle()).data?.id
  ?? must(await db.from('students').insert({ class_id: cls, first_name: name }).select('id').single()).id;
const gael = await student(c4a, 'Gael');
const edric = await student(demoClass, 'Edric');

// Fictional homework (no real school data). [subject, title, instructions, explanation, lang, start, due, createdDaysAgo]
const hw = [
  ['Language Arts', 'Read Chapter 4 and answer questions 1–5', 'Read Chapter 4 of your reader and answer questions 1–5 in your notebook. Use complete sentences.', 'Lee el capítulo 4 del libro de lectura y responde las preguntas 1–5 en el cuaderno, con oraciones completas.', 'en', 0, 1, 0.1],
  ['Science', 'Complete the ecosystem worksheet', 'Complete the worksheet about ecosystems. Label the producers, consumers and decomposers.', 'Completa la hoja de trabajo sobre ecosistemas. Señala productores, consumidores y descomponedores.', 'en', 0, 2, 1],
  ['Matemática', 'Resolver ejercicios 15–20', 'Resolver los ejercicios 15 al 20 de la página 42. Escribir los números de forma clara.', null, 'es', 0, 0, 1],
  ['Spelling', 'Spelling words 201–211', 'Study words 201–211 for Thursday\'s spelling lesson: knowledge, landed, laws, limit, literary, local, located, lot, manager, material, mechanical.', 'Estudiar las palabras 201–211 para la lección de spelling. La lección es en inglés.', 'en', -2, 0, 3],
  ['Estudios Sociales', 'Mapa conceptual de las provincias', 'Realizar un mapa conceptual de las provincias del Ecuador en el cuaderno.', null, 'es', -3, -1, 4],
  ['Lengua y Literatura', 'Leyendas tradicionales', 'Leer la leyenda del libro y responder las preguntas de comprensión.', null, 'es', -6, -5, 7],
  ['Science', 'Amphibians: notes and pictures', 'Copy the 3 characteristics of amphibians and draw a toad, a frog and a salamander. Write their names in English.', 'Copia las 3 características de los anfibios y dibuja un sapo, una rana y una salamandra. Los nombres van en inglés.', 'en', -8, -6, 9],
  ['Educación Cultural y Artística', 'Arte con reciclaje', 'Elaborar una obra artística usando materiales reciclados.', null, 'es', -13, -9, 14],
  ['Matemática', 'Taller de divisiones', 'Resolver 10 divisiones del cuaderno aplicando la prueba.', null, 'es', -25, -24, 26],
  ['Language Arts', 'Book report: my favorite character', 'Write five sentences about your favorite character from the book.', 'Escribe cinco oraciones sobre tu personaje favorito del libro (en inglés).', 'en', -30, -27, 31],
  ['Science', 'The water cycle', 'Describe the three stages of the water cycle.', 'Describe las tres etapas del ciclo del agua.', 'en', 3, 5, 0.5],
  ['Estudios Sociales', 'Exposición sobre Quito', 'Preparar una exposición de dos minutos sobre la ciudad de Quito.', null, 'es', 5, 8, 0.5],
];
const rows = hw.map(([subject, title, instructions, parent_explanation, language, s, d, createdAgo]) => ({
  class_id: c4a, subject, title, instructions, parent_explanation, language, start_date: day(s), due_date: day(d), source: 'manual',
  notes: 'DEMO', created_at: ago(createdAgo), created_by: adminId,
}));
rows.push({ class_id: demoClass, subject: 'Matemática', title: 'Tablas de multiplicar (demo)', instructions: 'Repetir las tablas del 1 al 12.', language: 'es',
  start_date: day(0), due_date: day(1), source: 'manual', notes: 'DEMO', created_at: ago(1), created_by: adminId });
const { error } = await db.from('homework').upsert(rows, { onConflict: 'class_id,subject,title,start_date,due_date', ignoreDuplicates: true });
if (error && !/duplicate|unique|ON CONFLICT/i.test(error.message)) throw new Error(error.message);
if (error) for (const r of rows) await db.from('homework').insert(r);   // the fingerprint index is an expression index: insert one by one, skipping duplicates

// One link for the family (both children)
const { data: link } = await (async () => {
  const sessionClient = createClient(url, process.env.SUPABASE_ANON_KEY || service, { auth: { persistSession: false } });
  if (process.env.SUPABASE_ANON_KEY) {
    must(await sessionClient.auth.signInWithPassword(ADMIN));
    return sessionClient.rpc('admin_create_link', { p_label: 'Familia de Gael y Edric (demo)', p_students: [gael, edric] });
  }
  return { data: null };
})();
console.log(`Admin: ${ADMIN.email} / ${ADMIN.password}`);
if (link) console.log(`Parent link: ${appUrl}/v/${link.token}`);
else console.log('Set SUPABASE_ANON_KEY to also create a parent link.');
