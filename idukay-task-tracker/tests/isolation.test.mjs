// Access tests against the real migrations: VIEWER links are read-only and see only their
// students' class; ADMIN manages data; nobody deletes homework; archive keeps the original.
//   ./reset_local_db.sh && node tests/isolation.test.mjs
import pg from 'pg';

const pool = new pg.Pool({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 54329), user: 'postgres',
  database: 'itt_test', max: 4, options: '-c TimeZone=America/Guayaquil' });

const ADMIN = { id: '00000000-0000-4000-a000-00000000000a', email: 'admin@test.dev' };
const STRANGER = { id: '00000000-0000-4000-b000-00000000000b', email: 'someone@test.dev' };

let passed = 0;
const failures = [];
const BLOCK = new Set(['42501', '23514', '23503', '23505', 'P0001', '42883', '3F000', '22023']);

async function run(actor, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (actor === 'anon') await c.query('set local role anon');
    else if (actor === 'service') await c.query('set local role service_role');
    else if (actor !== 'superuser') {
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.id, role: 'authenticated', email: actor.email })]);
    }
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const q = (actor, sql, p = []) => run(actor, c => c.query(sql, p));
const val = async (actor, sql, p = []) => Object.values((await q(actor, sql, p)).rows[0] ?? {})[0];
const ok = (name, cond, detail = '') => { if (cond) passed++; else failures.push(`${name}${detail !== '' ? ' — ' + detail : ''}`); };
async function blocked(name, actor, sql, p = []) {
  try { const r = await q(actor, sql, p); ok(name, (r.rowCount ?? 0) === 0 || (r.rows.length === 1 && Object.values(r.rows[0])[0] === null), `affected ${r.rowCount}`); }
  catch (e) { ok(name, BLOCK.has(e.code), `unexpected ${e.code}: ${e.message}`); }
}
async function works(name, actor, sql, p = []) {
  try { return await q(actor, sql, p); } catch (e) { ok(name, false, `${e.code}: ${e.message}`); return { rows: [] }; }
}

// ---------------------------------------------------------------------------
console.log('setup');
await q('superuser', "insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, now())", [ADMIN.id, ADMIN.email, STRANGER.id, STRANGER.email]);
await q('superuser', 'insert into public.admins (user_id) values ($1)', [ADMIN.id]);
const c4a = await val('superuser', "select id from public.classes where grade_short = '4.º EGB' and parallel = 'A'");
ok('initial class 4.º EGB "A" exists with subjects', !!c4a && (await val('superuser', 'select count(*)::int from public.subjects where class_id = $1', [c4a])) >= 9);
ok('Science and Language Arts are done in English', (await val('superuser', "select string_agg(name || '=' || language, ',' order by name) from public.subjects where class_id = $1 and name in ('Science','Language Arts','Matemática')", [c4a])) === 'Language Arts=en,Matemática=es,Science=en');
const c3b = await val('superuser', "insert into public.classes (grade_label, grade_short, parallel) values ('Tercer Grado', '3.º EGB', 'B') returning id");

const gael  = (await works('admin adds Gael',  ADMIN, "insert into public.students (class_id, first_name) values ($1, 'Gael') returning id", [c4a])).rows[0]?.id;
const maria = (await works('admin adds Maria', ADMIN, "insert into public.students (class_id, first_name) values ($1, 'Maria') returning id", [c4a])).rows[0]?.id;
const edric = (await works('admin adds Edric', ADMIN, "insert into public.students (class_id, first_name) values ($1, 'Edric') returning id", [c3b])).rows[0]?.id;

const link = async (label, ids) => (await works(`admin creates link ${label}`, ADMIN, 'select public.admin_create_link($1, $2::uuid[]) as r', [label, ids])).rows[0]?.r;
const lGael = await link('Familia de Gael', [gael]);
const lFamily = await link('Gael y Edric', [gael, edric]);
const lMaria = await link('Familia de Maria', [maria]);
const lRevoked = await link('Revocado', [gael]);
ok('link token is long and URL-safe', /^[A-Za-z0-9_-]{32}$/.test(lGael.token), lGael.token);
ok('only the token hash is stored', (await val('superuser', 'select count(*)::int from public.viewer_links where token_hash = $1', [lGael.token])) === 0);
await works('admin revokes a link', ADMIN, 'select public.admin_revoke_link($1)', [lRevoked.id]);

// Homework (dates relative to the class's today)
const hw = async (cls, subject, title, start, due, extra = {}) => (await works(`admin adds ${title}`, ADMIN,
  `insert into public.homework (class_id, subject, title, instructions, parent_explanation, language, start_date, due_date)
   values ($1, $2, $3, $4, $5, $6, current_date + $7::int, current_date + $8::int) returning id`,
  [cls, subject, title, extra.instructions ?? null, extra.parent ?? null, extra.lang ?? 'es', start, due])).rows[0]?.id;
const hToday   = await hw(c4a, 'Language Arts', 'Read Chapter 4', 0, 1, { lang: 'en', instructions: 'Read Chapter 4 and answer questions 1–5.', parent: 'Lee el capítulo 4 y responde las preguntas 1–5.' });
const hMath    = await hw(c4a, 'Matemática', 'Ejercicios 15–20', 0, 0);
const hYest    = await hw(c4a, 'Science', 'Ecosystem worksheet', -2, -1, { lang: 'en' });
const h10      = await hw(c4a, 'Estudios Sociales', 'Mapa de provincias', -12, -10);
const h20      = await hw(c4a, 'Lengua y Literatura', 'Leyendas', -22, -20);
const hSoon    = await hw(c4a, 'Science', 'Water cycle', 5, 7, { lang: 'en' });
const hFar     = await hw(c4a, 'Matemática', 'Proyecto final', 30, 35);
const h3b      = await hw(c3b, 'Matemática', 'Tarea de tercero', 0, 1);
const hGone    = await hw(c4a, 'Matemática', 'Duplicado por error', 0, 1);

// ---------------------------------------------------------------------------
console.log('VIEWER — scope');
const open = await val('anon', 'select public.viewer_open($1)', [lGael.token]);
ok('link opens without an account', open?.students?.length === 1 && open.students[0].first_name === 'Gael');
ok('link shows grade and parallel, no class roster', open.students[0].grade_short === '4.º EGB' && open.students[0].parallel === 'A' && !JSON.stringify(open).includes('Maria'));
ok('link reveals no hashes, ids of others or admin data', !/token|hash|created_by|admin/i.test(JSON.stringify(open)));
ok('family link covers two children in different classes', (await val('anon', 'select public.viewer_open($1)', [lFamily.token])).students.map(s => s.first_name).join() === 'Edric,Gael');
ok('unknown token opens nothing', (await val('anon', 'select public.viewer_open($1)', ['x'.repeat(32)])) === null);
ok('revoked link opens nothing', (await val('anon', 'select public.viewer_open($1)', [lRevoked.token])) === null);
ok('revoked link sees no homework', (await val('anon', 'select public.viewer_homework($1, $2, current_date, current_date)', [lRevoked.token, gael])) === null);

const list = await val('anon', 'select public.viewer_homework($1, $2, current_date - 14, current_date + 14)', [lGael.token, gael]);
const titles = list.map(h => h.title);
ok('viewer sees class homework of the last 14 days and next 14', ['Read Chapter 4', 'Ejercicios 15–20', 'Ecosystem worksheet', 'Mapa de provincias', 'Water cycle'].every(t => titles.includes(t)), titles.join(' | '));
ok('homework older than 14 days is not in the recent view', !titles.includes('Leyendas'));
ok('far-future homework is not shown', !titles.includes('Proyecto final'));
ok('another class\'s homework never appears', !titles.includes('Tarea de tercero'));
const wide = await val('anon', 'select public.viewer_homework($1, $2, current_date - 400, current_date + 400)', [lGael.token, gael]);
ok('asking for a wider window is clamped to ±14 days', !wide.some(h => h.title === 'Leyendas' || h.title === 'Proyecto final'));
const la = list.find(h => h.title === 'Read Chapter 4');
ok('English homework keeps original text, language and separate parent explanation',
  la.language === 'en' && la.instructions === 'Read Chapter 4 and answer questions 1–5.' && la.parent_explanation === 'Lee el capítulo 4 y responde las preguntas 1–5.');
ok('lifecycle: active / archived / upcoming computed from dates',
  la.status === 'active' && list.find(h => h.title === 'Ecosystem worksheet').status === 'archived' && list.find(h => h.title === 'Water cycle').status === 'upcoming');
ok('new homework is flagged NEW', la.is_new === true);
ok('subject emoji comes from the subject list', la.emoji === '📚', la.emoji);

await blocked('Gael\'s link cannot read Maria (same class, other family)', 'anon', 'select public.viewer_homework($1, $2, current_date, current_date)', [lGael.token, maria]);
await blocked('Gael\'s link cannot read Edric', 'anon', 'select public.viewer_homework($1, $2, current_date, current_date)', [lGael.token, edric]);
ok('family link reads Edric\'s class only for Edric', (await val('anon', 'select public.viewer_homework($1, $2, current_date - 14, current_date + 14)', [lFamily.token, edric])).map(h => h.title).join() === 'Tarea de tercero');
await blocked('detail of another class\'s homework via Gael\'s link', 'anon', 'select public.viewer_homework_detail($1, $2, $3)', [lGael.token, gael, h3b]);
ok('detail of own class homework, even archived', (await val('anon', 'select public.viewer_homework_detail($1, $2, $3)', [lGael.token, gael, h20]))?.title === 'Leyendas');

console.log('VIEWER — archive');
const months = await val('anon', 'select public.viewer_archive_months($1, $2)', [lGael.token, gael]);
ok('archive months listed', months.length >= 1 && months.reduce((n, m) => n + m.count, 0) === 3, JSON.stringify(months));
let archived = [];
for (const m of months) archived = archived.concat(await val('anon', 'select public.viewer_archive($1, $2, $3::date)', [lGael.token, gael, m.month]));
ok('archive holds all past-due homework (including > 14 days)', ['Ecosystem worksheet', 'Mapa de provincias', 'Leyendas'].every(t => archived.some(h => h.title === t)) && archived.every(h => h.status === 'archived'));
ok('archive never includes current homework', !archived.some(h => ['Read Chapter 4', 'Ejercicios 15–20'].includes(h.title)));
const lastMonth = months.find(m => true).month;
ok('archive filter by subject', (await val('anon', "select public.viewer_archive($1, $2, $3::date, 'Science')", [lGael.token, gael, lastMonth])).every(h => h.subject === 'Science'));
ok('archive search by text', (await val('anon', "select public.viewer_archive($1, $2, $3::date, null, 'worksheet')", [lGael.token, gael, archived.find(h => h.title === 'Ecosystem worksheet').due_date.slice(0, 7) + '-01'])).map(h => h.title).join() === 'Ecosystem worksheet');
ok('archiving changes nothing in the record', (await val('superuser', 'select revision from public.homework where id = $1', [hYest])) === 1);

console.log('VIEWER — read-only');
for (const t of ['homework', 'students', 'classes', 'viewer_links', 'subjects', 'sync_runs', 'admins', 'audit_logs', 'homework_revisions']) {
  await blocked(`anon cannot read ${t}`, 'anon', `select * from public.${t}`);
}
await blocked('anon cannot create homework', 'anon', "insert into public.homework (class_id, subject, title, language, start_date, due_date) values ($1, 'x', 'x', 'es', current_date, current_date)", [c4a]);
await blocked('anon cannot change homework', 'anon', "update public.homework set title = 'Read pages 20–30' where id = $1", [hToday]);
await blocked('anon cannot delete homework', 'anon', 'delete from public.homework where id = $1', [hToday]);
await blocked('anon cannot create links', 'anon', "select public.admin_create_link('x', array[$1]::uuid[])", [gael]);
await blocked('anon cannot withdraw homework', 'anon', "select public.admin_withdraw_homework($1, 'x')", [hToday]);
await blocked('anon cannot import homework', 'anon', "select public.admin_import_homework($1, '[]'::jsonb)", [c4a]);
await blocked('anon cannot run the sync', 'anon', "select public.svc_sync_apply($1, 'x', '[]'::jsonb)", [c4a]);

console.log('signed-in non-admin');
for (const t of ['homework', 'students', 'classes', 'viewer_links', 'sync_runs']) {
  ok(`non-admin sees nothing in ${t}`, (await q(STRANGER, `select id from public.${t}`)).rows.length === 0);
}
await blocked('non-admin cannot create homework', STRANGER, "insert into public.homework (class_id, subject, title, language, start_date, due_date) values ($1, 'x', 'x', 'es', current_date, current_date)", [c4a]);
await blocked('non-admin cannot edit homework', STRANGER, "update public.homework set title = 'x' where id = $1", [hToday]);
await blocked('non-admin cannot create a link', STRANGER, "select public.admin_create_link('x', array[$1]::uuid[])", [gael]);
await blocked('non-admin cannot see admin status', STRANGER, 'select public.admin_status()');
await blocked('non-admin cannot make itself admin', STRANGER, 'insert into public.admins (user_id) values ($1)', [STRANGER.id]);

console.log('ADMIN');
await blocked('even the admin cannot delete homework', ADMIN, 'delete from public.homework where id = $1', [hToday]);
await blocked('admin cannot read token hashes', ADMIN, 'select token_hash from public.viewer_links');
await blocked('admin cannot move homework to another class', ADMIN, 'update public.homework set class_id = $1 where id = $2', [c3b, hToday]);
await blocked('admin cannot fake an API source', ADMIN, "insert into public.homework (class_id, subject, title, language, start_date, due_date, source) values ($1, 'x', 'x', 'es', current_date, current_date, 'idukay_api')", [c4a]);
await blocked('due date before start date is rejected', ADMIN, "insert into public.homework (class_id, subject, title, language, start_date, due_date) values ($1, 'x', 'x', 'es', current_date, current_date - 1)", [c4a]);
await works('admin corrects a typo', ADMIN, "update public.homework set title = 'Read Chapter 4 (pages 20–25)' where id = $1", [hToday]);
ok('correction keeps the previous version', (await val('superuser', "select data->>'title' from public.homework_revisions where homework_id = $1", [hToday])) === 'Read Chapter 4'
  && (await val('superuser', 'select revision from public.homework where id = $1', [hToday])) === 2);
ok('every parent sees the same corrected text, marked as revised', (await val('anon', 'select public.viewer_homework_detail($1, $2, $3)', [lMaria.token, maria, hToday])).title === 'Read Chapter 4 (pages 20–25)'
  && (await val('anon', 'select public.viewer_homework_detail($1, $2, $3)', [lGael.token, gael, hToday])).revised === true);
await works('admin withdraws a duplicate', ADMIN, "select public.admin_withdraw_homework($1, 'duplicate')", [hGone]);
ok('withdrawn homework disappears for parents', !(await val('anon', 'select public.viewer_homework($1, $2, current_date, current_date)', [lGael.token, gael])).some(h => h.title === 'Duplicado por error'));
ok('withdrawn homework is still in the database', (await val('superuser', 'select count(*)::int from public.homework where id = $1', [hGone])) === 1);
const rows = JSON.stringify([
  { subject: 'Science', title: 'Plant parts', language: 'en', start_date: '2026-10-08', due_date: '2026-10-09', parent_explanation: 'Partes de la planta.' },
  { subject: 'Matemática', title: 'Sumas', language: 'es', start_date: '2026-10-08', due_date: '2026-10-08' }]);
const imp1 = await val(ADMIN, 'select public.admin_import_homework($1, $2::jsonb)', [c4a, rows]);
const imp2 = await val(ADMIN, 'select public.admin_import_homework($1, $2::jsonb)', [c4a, rows]);
ok('pasted homework is saved', imp1.added === 2 && imp1.duplicates === 0, JSON.stringify(imp1));
ok('pasting the same homework again adds no duplicates', imp2.added === 0 && imp2.duplicates === 2, JSON.stringify(imp2));
const st = await val(ADMIN, 'select public.admin_status()');
ok('admin status shows the class, students and links', st.find(c => c.class_id === c4a)?.students === 2 && st.find(c => c.class_id === c4a)?.active_links >= 3, JSON.stringify(st).slice(0, 200));
ok('data_updated_at moves when homework changes', (await val('superuser', 'select data_updated_at is not null from public.classes where id = $1', [c4a])) === true);

console.log('automatic synchronization');
const items = JSON.stringify([
  { external_id: 'idk-1', subject: 'Science', title: 'Water cycle stages', instructions: 'Describe the three stages of the water cycle.', start_date: '2026-10-08', due_date: '2026-10-10' },
  { external_id: 'idk-2', subject: 'Matemática', title: 'Página 42', instructions: 'Resolver los ejercicios 15 al 20.', start_date: '2026-10-08', due_date: '2026-10-09' }]);
ok('first sync adds', JSON.stringify(await val('service', "select public.svc_sync_apply($1, 'idukay_api', $2::jsonb)", [c4a, items])) === '{"added":2,"updated":0,"unchanged":0}');
ok('repeat sync adds no duplicates', JSON.stringify(await val('service', "select public.svc_sync_apply($1, 'idukay_api', $2::jsonb)", [c4a, items])) === '{"added":0,"updated":0,"unchanged":2}');
ok('language taken from the subject (Science → English)', (await val('superuser', "select language::text from public.homework where external_id = 'idk-1'")) === 'en');
const changed = items.replace('15 al 20', '15 al 25');
ok('modified homework is updated', JSON.stringify(await val('service', "select public.svc_sync_apply($1, 'idukay_api', $2::jsonb)", [c4a, changed])) === '{"added":0,"updated":1,"unchanged":1}');
ok('modified homework keeps its previous version', (await val('superuser', "select count(*)::int from public.homework_revisions r join public.homework h on h.id = r.homework_id where h.external_id = 'idk-2'")) === 1);
ok('last sync time recorded', (await val('superuser', 'select last_sync_at is not null from public.classes where id = $1', [c4a])) === true);
await blocked('admin cannot call the service sync', ADMIN, "select public.svc_sync_apply($1, 'idukay_api', '[]'::jsonb)", [c4a]);

await pool.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
