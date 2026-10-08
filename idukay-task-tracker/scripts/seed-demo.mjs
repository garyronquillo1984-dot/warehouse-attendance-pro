// DEMO DATA — creates the reference demo family (parent "Gary", children Gael and Edric) with
// fictional school tasks for the current week, through the real API (so every row passes the
// same security rules as a real parent's). For local/staging projects only; never production.
//
//   SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
//
// Login afterwards: demo.gary@example.com / Demo-Familia-2026
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (/supabase\.co/.test(url) && !process.env.ALLOW_REMOTE_DEMO) {
  console.error('Refusing to seed a hosted project. Set ALLOW_REMOTE_DEMO=1 for a staging project.'); process.exit(1);
}

const EMAIL = 'demo.gary@example.com';
const PASSWORD = 'Demo-Familia-2026';
const admin = createClient(url, service, { auth: { persistSession: false } });
const user = createClient(url, anon, { auth: { persistSession: false } });

const { data: created, error: ce } = await admin.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: {
    demo: true,                                   // internal label: this is demo data
    full_name: 'Gary (demo)', country: 'EC', locale: 'es', timezone: 'America/Guayaquil',
    children: [{ name: 'Gael', grade: '5.º de básica', school: 'Colegio Demo' }, { name: 'Edric', grade: '3.º de básica', school: 'Colegio Demo' }],
  },
});
if (ce && !/already/i.test(ce.message)) throw ce;
if (ce) console.log('demo user already exists, adding tasks again');
const { error: se } = await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (se) throw se;
await user.rpc('complete_onboarding');

const { data: kids } = await user.from('children').select('id, name');
const id = name => kids.find(k => k.name === name)?.id;
// Dates in the family's time zone (not the machine's), like the app computes them.
const TZ = 'America/Guayaquil';
const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());   // YYYY-MM-DD
const day = offset => { const d = new Date(`${todayLocal}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const monday = 1 - (new Date(`${todayLocal}T12:00:00Z`).getUTCDay() || 7);

// Fictional tasks inspired by a typical week (no real school data).
const tasks = [
  ['Gael', 'Matemática', 'Taller de divisiones aplicando la prueba', 'Resolver 10 divisiones del cuaderno, aplicar la prueba e indicar si es exacta o inexacta.', day(0), 'high', 'pending', 40],
  ['Gael', 'Estudios Sociales', 'Mapa conceptual de las provincias', 'Hacer un mapa conceptual en el cuaderno.', day(1), 'normal', 'pending', 45],
  ['Gael', 'Lengua y Literatura', 'Leyendas tradicionales', 'Lectura y preguntas de comprensión.', day(0), 'normal', 'completed', 25],
  ['Gael', 'English', 'Spelling quiz: words 275–285', 'Study the 10 words for the quiz.', day(monday + 4), 'high', 'pending', 15],
  ['Gael', 'Educación Cultural y Artística', 'Arte con reciclaje', 'Obra artística con materiales reciclados.', day(9), 'low', 'pending', 60],
  ['Edric', 'Matemática', 'Tablas de multiplicar del 1 al 12', 'Repetir 3 veces las tablas en el cuaderno.', day(0), 'normal', 'in_progress', 30],
  ['Edric', 'Science', 'Amphibians: notes and pictures', 'Copy the 3 characteristics and add a picture of a toad, a frog and a salamander. (In English.)', day(1), 'normal', 'pending', 30],
  ['Edric', 'Language Arts', 'Spelling lesson: words 201–211', 'Review the 11 words at home.', day(monday + 3), 'high', 'pending', 15],
  ['Edric', 'Estudios Sociales', 'Reservas naturales', 'Actividad sobre las reservas naturales.', day(-1), 'normal', 'pending', 20],
  ['Edric', 'Educación en la Fe', 'Elaboración de una camándula', 'Traer 3 esferas de espuma flex pintadas.', day(monday + 1), 'normal', 'completed', 30],
];
const rows = tasks.map(([kid, subject, title, description, due_date, priority, status, estimated_minutes]) =>
  ({ child_id: id(kid), subject, title, description, due_date, priority, status, estimated_minutes, notes: 'DEMO', source: 'manual' }));
const { error: te } = await user.from('tasks').insert(rows);
if (te) throw te;
console.log(`Demo family ready: ${EMAIL} / ${PASSWORD} (${rows.length} tasks)`);
