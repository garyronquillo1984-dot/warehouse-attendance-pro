// Data isolation, trial and subscription tests against the real migrations.
// Impersonates users exactly the way Supabase does (role "authenticated" + JWT claims).
// Every attack must be blocked; every legitimate action must work.
//   ./reset_local_db.sh && node tests/isolation.test.mjs
import pg from 'pg';

const pool = new pg.Pool({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: 'itt_test', max: 4,
  options: '-c TimeZone=America/Guayaquil' });   // current_date = the test parents' local date

const U = {
  a:     { id: '00000000-0000-4000-a000-00000000000a', email: 'parent.a@test.dev' },
  b:     { id: '00000000-0000-4000-b000-00000000000b', email: 'parent.b@test.dev' },
  c:     { id: '00000000-0000-4000-c000-00000000000c', email: 'parent.c@test.dev' },
  admin: { id: '00000000-0000-4000-e000-00000000000e', email: 'owner@test.dev' },
  late:  { id: '00000000-0000-4000-d000-00000000000d', email: 'Paid.Before@Test.dev' },
};

let passed = 0;
const failures = [];
const BLOCK_CODES = new Set(['42501', '23503', '23505', 'P0001', '42883', '3F000']);

async function run(actor, fn, { commit = true } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (actor === 'anon') await c.query('set local role anon');
    else if (actor === 'service') await c.query('set local role service_role');
    else if (actor !== 'superuser') {
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: actor.id, role: 'authenticated', email: actor.email })]);
    }
    const out = await fn(c);
    await c.query(commit ? 'commit' : 'rollback');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const q = (actor, sql, params = [], opts) => run(actor, c => c.query(sql, params), opts);
const one = async (actor, sql, params = []) => (await q(actor, sql, params)).rows[0];
const val = async (actor, sql, params = []) => Object.values((await one(actor, sql, params)) ?? {})[0];

function ok(name, cond, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail !== '' ? ' — ' + detail : ''}`);
}
async function blocked(name, actor, sql, params = []) {
  try {
    const r = await q(actor, sql, params, { commit: false });
    ok(name, (r.rowCount ?? 0) === 0 && (!r.rows || r.rows.length === 0), `affected ${r.rowCount} rows`);
  } catch (e) {
    ok(name, BLOCK_CODES.has(e.code), `unexpected error ${e.code}: ${e.message}`);
  }
}
async function works(name, actor, sql, params = []) {
  try { return await q(actor, sql, params); }
  catch (e) { ok(name, false, `${e.code}: ${e.message}`); return null; }
}

async function signUp(u, meta) {
  await q('superuser', 'insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)',
    [u.id, u.email, JSON.stringify(meta)]);
}
const hotmart = (eventId, type, { token = null, sub = null, email = null, periodEnd = null, time = null, amount = 2.99 } = {}) =>
  val('service', `select public.svc_apply_hotmart_event($1, $2, $3, $4, $5, $6, $7, $8, $9, 'USD', '{}'::jsonb)`,
    [eventId, type, time, token, sub, 'HP' + eventId, email, periodEnd, amount]);
const access = (u) => val('superuser', 'select app.access_state($1)', [u.id]);

// ---------------------------------------------------------------------------
console.log('sign-up');
// A Hotmart purchase that arrives before the buyer has an account is kept and claimed later.
ok('purchase before account is unmatched', await hotmart('E-LATE-1', 'PURCHASE_APPROVED',
  { email: 'paid.before@test.dev', sub: 'SUB-LATE', periodEnd: new Date(Date.now() + 30 * 864e5).toISOString() }) === 'unmatched');

await signUp(U.a, { full_name: 'Parent A', phone: '+593 99 123 4567', country: 'ec', locale: 'es',
  children: [{ name: 'Maria', grade: '4th', school: 'Colegio Uno' }] });
await signUp(U.b, { full_name: 'Parent B', children: [{ name: 'Pedro' }] });
await signUp(U.c, { full_name: 'Parent C', children: [] });
await signUp(U.admin, { full_name: 'Product Owner' });
await signUp(U.late, { full_name: 'Paid Early' });
await q('superuser', 'insert into public.platform_admins (user_id) values ($1)', [U.admin.id]);

const accA = await val(U.a, 'select public.my_account()');
ok('profile created from sign-up form', accA.full_name === 'Parent A' && accA.country === 'EC' && accA.phone === '+593 99 123 4567');
ok('trial starts at sign-up', accA.status === 'TRIAL' && accA.access === 'trial');
const trialDays = (new Date(accA.trial_ends_at) - new Date(accA.trial_started_at)) / 864e5;
ok('trial lasts exactly 7 days', Math.abs(trialDays - 7) < 1e-6, trialDays);
ok('child from sign-up form created', (await val(U.a, 'select count(*)::int from public.children')) === 1);
ok('school from sign-up form created', (await val(U.a, "select count(*)::int from public.schools where name = 'Colegio Uno'")) === 1);
ok('purchase made before the account was claimed at sign-up', (await access(U.late)) === 'active' &&
  (await val('superuser', 'select status::text from public.subscriptions where user_id = $1', [U.late.id])) === 'ACTIVE');

// ---------------------------------------------------------------------------
console.log('TEST 1 — User B must not see User A\'s child or task');
const maria = await val(U.a, "select id from public.children where name = 'Maria'");
const task = await one(U.a, `insert into public.tasks (child_id, subject, title, due_date)
  values ($1, 'Math', 'Math homework', current_date) returning id, user_id, subject_id`, [maria]);
ok('A creates a task', !!task?.id);
ok('user_id comes from the session', task.user_id === U.a.id);
ok('subject resolved into the family subject list', !!task.subject_id);
const pedro = await val(U.b, "select id from public.children where name = 'Pedro'");

for (const t of ['children', 'tasks', 'subjects', 'schools', 'task_status_history', 'profiles', 'subscriptions', 'trial_periods', 'user_settings', 'notifications']) {
  const rows = (await q(U.b, `select * from public.${t}`)).rows;
  ok(`B sees no row of A in ${t}`, rows.every(r => (r.user_id ?? r.id) === U.b.id), JSON.stringify(rows).slice(0, 120));
}
ok('B cannot find Maria by name', (await val(U.b, "select count(*)::int from public.children where name = 'Maria'")) === 0);
await blocked('B reads A\'s task by id (URL tampering)', U.b, 'select * from public.tasks where id = $1', [task.id]);
await blocked('B reads A\'s child by id', U.b, 'select * from public.children where id = $1', [maria]);
await blocked('B updates A\'s task', U.b, "update public.tasks set title = 'hacked' where id = $1", [task.id]);
await blocked('B completes A\'s task', U.b, "update public.tasks set status = 'completed' where id = $1", [task.id]);
await blocked('B deletes A\'s task', U.b, 'delete from public.tasks where id = $1', [task.id]);
await blocked('B deletes A\'s child', U.b, 'delete from public.children where id = $1', [maria]);
await blocked('B adds a task to A\'s child', U.b, "insert into public.tasks (child_id, subject, title) values ($1, 'x', 'x')", [maria]);
await blocked('B moves own task to A\'s child', U.b,
  "with t as (insert into public.tasks (child_id, subject, title) values ($2, 'x', 'x') returning id) update public.tasks set child_id = $1 where id = (select id from t)", [maria, pedro]);
await blocked('B sets user_id to A on insert', U.b, "insert into public.children (user_id, name) values ($1, 'x')", [U.a.id]);
await blocked('B changes user_id of own child', U.b, 'update public.children set user_id = $1 where id = $2', [U.a.id, pedro]);
const schoolA = await val('superuser', 'select id from public.schools where user_id = $1', [U.a.id]);
await blocked('B links own child to A\'s school', U.b, 'update public.children set school_id = $1 where id = $2', [schoolA, pedro]);
await blocked('B reads A\'s profile', U.b, 'select * from public.profiles where id = $1', [U.a.id]);
await blocked('B edits A\'s profile', U.b, "update public.profiles set full_name = 'x' where id = $1", [U.a.id]);
await blocked('B writes status history', U.b, "insert into public.task_status_history (user_id, task_id, to_status) values ($1, $2, 'completed')", [U.a.id, task.id]);
await blocked('B inserts a sample-source task', U.b, "insert into public.tasks (child_id, subject, title, source) values ($1, 'x', 'x', 'sample')", [pedro]);
await blocked('B inserts an integration-source task', U.b, "insert into public.tasks (child_id, subject, title, source) values ($1, 'x', 'x', 'integration')", [pedro]);
await blocked('B gives itself a subscription', U.b, "update public.subscriptions set status = 'ACTIVE', current_period_end = now() + interval '1 year'");
await blocked('B extends its own trial', U.b, "update public.trial_periods set ends_at = now() + interval '1 year'");
await blocked('B inserts a subscription', U.b, "insert into public.subscriptions (user_id, status) values ($1, 'ACTIVE')", [U.b.id]);
for (const t of ['billing_events', 'checkout_sessions', 'audit_logs', 'analytics_events', 'platform_admins', 'used_trials', 'app_config']) {
  await blocked(`B cannot read ${t}`, U.b, `select * from public.${t}`);
}
await blocked('B makes itself admin', U.b, 'insert into public.platform_admins (user_id) values ($1)', [U.b.id]);
await blocked('B calls the webhook entry point', U.b,
  "select public.svc_apply_hotmart_event('x', 'PURCHASE_APPROVED', null, null, null, null, 'parent.b@test.dev', now() + interval '1 year', 1, 'USD', '{}')");
await blocked('B creates a checkout for A', U.b, 'select public.svc_create_checkout_session($1)', [U.a.id]);
await blocked('B reads A\'s billing profile', U.b, 'select public.svc_billing_profile($1)', [U.a.id]);
await blocked('B opens the admin dashboard', U.b, 'select public.admin_overview()');
await blocked('B runs the reminder job', U.b, 'select app.generate_reminders()');
await blocked('B calls billing directly', U.b, "select billing.apply_to_user($1, 'PURCHASE_APPROVED', null, null, null, now() + interval '1 year')", [U.b.id]);
const expB = await val(U.b, 'select public.export_my_data()');
ok('B export holds only B data', !JSON.stringify(expB).includes('Maria') && expB.children.length === 1);
await blocked('B notification read flag on A', U.b, 'update public.notifications set read_at = now() where user_id = $1', [U.a.id]);

console.log('anonymous visitor');
for (const t of ['children', 'tasks', 'profiles', 'subscriptions']) {
  await blocked(`anon cannot read ${t}`, 'anon', `select * from public.${t}`);
}
await blocked('anon cannot call my_account', 'anon', 'select public.my_account()');
await blocked('anon cannot insert a child', 'anon', "insert into public.children (user_id, name) values ($1, 'x')", [U.a.id]);

// ---------------------------------------------------------------------------
console.log('status history');
await works('A starts the task', U.a, "update public.tasks set status = 'in_progress' where id = $1", [task.id]);
await works('A completes the task', U.a, "update public.tasks set status = 'completed' where id = $1", [task.id]);
const hist = (await q(U.a, 'select from_status, to_status from public.task_status_history where task_id = $1 order by id', [task.id])).rows;
ok('history: created → in progress → completed', hist.map(h => `${h.from_status}>${h.to_status}`).join(',') === 'null>pending,pending>in_progress,in_progress>completed', JSON.stringify(hist));
ok('completed_at set', !!(await val(U.a, 'select completed_at from public.tasks where id = $1', [task.id])));
await works('A reopens the task', U.a, "update public.tasks set status = 'pending' where id = $1", [task.id]);
ok('completed_at cleared on reopen', (await val(U.a, 'select completed_at from public.tasks where id = $1', [task.id])) === null);
ok('first task events recorded', (await val('superuser',
  "select count(*)::int from public.analytics_events where user_id = $1 and event in ('first_child_added','first_task_added','first_task_completed')", [U.a.id])) === 3);

// ---------------------------------------------------------------------------
console.log('TEST 5 — two children, each with only their own tasks');
const lucas = (await works('A adds a second child', U.a, "insert into public.children (name, color) values ('Lucas', '#2f6690') returning id")).rows[0].id;
await works('A adds Lucas task', U.a, "insert into public.tasks (child_id, subject, title, due_date) values ($1, 'Lengua', 'Leer capítulo 3', current_date)", [lucas]);
const forMaria = (await q(U.a, 'select title from public.tasks where child_id = $1', [maria])).rows.map(r => r.title);
const forLucas = (await q(U.a, 'select title from public.tasks where child_id = $1', [lucas])).rows.map(r => r.title);
ok('Maria\'s list has only her task', forMaria.join() === 'Math homework', forMaria.join());
ok('Lucas\'s list has only his task', forLucas.join() === 'Leer capítulo 3', forLucas.join());
ok('subjects are shared per family, not duplicated', (await val(U.a, 'select count(*)::int from public.subjects')) === 2);

// ---------------------------------------------------------------------------
console.log('reminders');
await works('A wants reminders now', 'superuser', "update public.user_settings set morning_time = '00:00', evening_time = '00:00', tomorrow_time = '00:00' where user_id = $1", [U.a.id]);
await works('A tomorrow task', U.a, "insert into public.tasks (child_id, subject, title, due_date) values ($1, 'Ciencias', 'Ecosistemas', current_date + 1)", [maria]);
const noonish = "date_trunc('day', now() at time zone 'America/Guayaquil') + interval '11 hours'";
const made1 = await val('superuser', `select app.generate_reminders((${noonish}) at time zone 'America/Guayaquil')`);
const made2 = await val('superuser', `select app.generate_reminders((${noonish}) at time zone 'America/Guayaquil')`);
const notes = (await q(U.a, 'select kind, body from public.notifications order by kind')).rows;
ok('reminders created for A (morning, evening, tomorrow)', notes.map(n => n.kind).join() === 'evening,morning,tomorrow', JSON.stringify(notes));
ok('reminders sent at most once a day', made1 >= 3 && made2 === 0, `${made1}/${made2}`);
ok('morning text counts today\'s tasks', notes.find(n => n.kind === 'morning')?.body === 'Hoy hay 2 tareas escolares.', notes.find(n => n.kind === 'morning')?.body);
ok('tomorrow text names the child', notes.find(n => n.kind === 'tomorrow')?.body === 'Mañana: Maria tiene 1 tarea.', notes.find(n => n.kind === 'tomorrow')?.body);
ok('B got none of A\'s reminders', (await val(U.b, 'select count(*)::int from public.notifications')) === 0);
await works('A marks reminders read', U.a, 'select public.mark_all_notifications_read()');
ok('reminders marked read', (await val(U.a, 'select count(*)::int from public.notifications where read_at is null')) === 0);

// ---------------------------------------------------------------------------
console.log('TEST 2 — trial expires → premium locked, data kept');
await q('superuser', "update public.trial_periods set ends_at = now() - interval '1 minute' where user_id = $1", [U.c.id]);
const kidC = await q('superuser', "insert into public.children (user_id, name) values ($1, 'Sofia') returning id", [U.c.id]);
const taskC = await q('superuser', "insert into public.tasks (user_id, child_id, subject, title) values ($1, $2, 'Arte', 'Dibujo') returning id", [U.c.id, kidC.rows[0].id]);
ok('expired trial is locked', (await access(U.c)) === 'locked');
ok('my_account says locked', (await val(U.c, 'select public.my_account()')).access === 'locked');
await blocked('locked: cannot add a child', U.c, "insert into public.children (name) values ('x')");
await blocked('locked: cannot add a task', U.c, "insert into public.tasks (child_id, subject, title) values ($1, 'x', 'x')", [kidC.rows[0].id]);
await blocked('locked: cannot complete a task', U.c, "update public.tasks set status = 'completed' where id = $1", [taskC.rows[0].id]);
await blocked('locked: cannot load sample data', U.c, 'select public.load_sample_data()');
ok('locked: data still readable (nothing deleted)', (await val(U.c, 'select count(*)::int from public.tasks')) === 1);
ok('locked: export still works', (await val(U.c, 'select public.export_my_data()')).tasks.length === 1);

// ---------------------------------------------------------------------------
console.log('TEST 3 — verified Hotmart purchase → ACTIVE');
const token = await val('service', 'select public.svc_create_checkout_session($1)', [U.c.id]);
ok('checkout token created', /^[0-9a-f]{36}$/.test(token));
ok('checkout_clicked tracked', (await val('superuser', "select count(*)::int from public.analytics_events where user_id = $1 and event = 'checkout_clicked'", [U.c.id])) === 1);
ok('waiting payment does not unlock', await hotmart('E1', 'PURCHASE_BILLET_PRINTED', { token, time: new Date(Date.now() - 6e4).toISOString() }) === 'pending' && (await access(U.c)) === 'locked');
const nextCharge = new Date(Date.now() + 30 * 864e5).toISOString();
ok('approved purchase activates', await hotmart('E2', 'PURCHASE_APPROVED', { token, sub: 'SUB-C', periodEnd: nextCharge }) === 'activated');
ok('access is active after verified payment', (await access(U.c)) === 'active');
ok('subscription row says ACTIVE until next charge', (await val(U.c, 'select status::text from public.subscriptions')) === 'ACTIVE');
ok('same event again is a duplicate', await hotmart('E2', 'PURCHASE_APPROVED', { token, sub: 'SUB-C', periodEnd: nextCharge }) === 'duplicate');
await works('active: can complete a task again', U.c, "update public.tasks set status = 'completed' where id = $1", [taskC.rows[0].id]);
ok('an older event cannot undo a newer one', await hotmart('E-OLD', 'PURCHASE_CANCELED', { sub: 'SUB-C', time: new Date(Date.now() - 864e5).toISOString() }) === 'stale' && (await access(U.c)) === 'active');

// ---------------------------------------------------------------------------
console.log('TEST 4 — cancellation → access ends with the paid period');
ok('cancellation recorded', await hotmart('E3', 'SUBSCRIPTION_CANCELLATION', { sub: 'SUB-C' }) === 'cancelled');
ok('cancelled but paid period running → still active', (await access(U.c)) === 'active' &&
  (await val(U.c, 'select status::text from public.subscriptions')) === 'CANCELLED');
await q('superuser', "update public.subscriptions set current_period_end = now() - interval '1 second' where user_id = $1", [U.c.id]);
ok('period over → locked', (await access(U.c)) === 'locked');
await q('superuser', 'select billing.expire_subscriptions()');
ok('daily job marks it EXPIRED', (await val(U.c, 'select status::text from public.subscriptions')) === 'EXPIRED');
ok('resubscribing reactivates', await hotmart('E4', 'PURCHASE_APPROVED', { sub: 'SUB-C', periodEnd: nextCharge }) === 'activated' && (await access(U.c)) === 'active');

console.log('payment failure and refund');
ok('failed renewal recorded', await hotmart('E5', 'PURCHASE_DELAYED', { sub: 'SUB-C' }) === 'payment_failed');
await q('superuser', "update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1", [U.c.id]);
ok('failed payment inside grace period → grace', (await access(U.c)) === 'grace');
await q('superuser', "update public.subscriptions set current_period_end = now() - interval '4 days' where user_id = $1", [U.c.id]);
ok('failed payment after grace → locked', (await access(U.c)) === 'locked');
ok('renewal approved → active', await hotmart('E6', 'PURCHASE_APPROVED', { sub: 'SUB-C', periodEnd: nextCharge }) === 'activated' && (await access(U.c)) === 'active');
ok('refund revokes paid access immediately', await hotmart('E7', 'PURCHASE_REFUNDED', { sub: 'SUB-C' }) === 'revoked' && (await access(U.c)) === 'locked');
ok('refund during a running trial keeps the trial', await hotmart('E8', 'PURCHASE_CHARGEBACK', { email: U.b.email }) === 'revoked' && (await access(U.b)) === 'trial');
ok('events for unknown buyers are kept as unmatched', await hotmart('E9', 'PURCHASE_APPROVED', { email: 'nobody@test.dev' }) === 'unmatched');
ok('billing changes are audited', (await val('superuser', "select count(*)::int from public.audit_logs where user_id = $1 and action like 'billing_%'", [U.c.id])) >= 6);

// ---------------------------------------------------------------------------
console.log('sample data');
await works('B loads sample family', U.b, 'select public.load_sample_data()');
ok('sample children are labelled', (await val(U.b, 'select count(*)::int from public.children where is_sample')) === 2);
ok('sample tasks created', (await val(U.b, "select count(*)::int from public.tasks where source = 'sample'")) === 9);
ok('sample data does not count as a first task', (await val('superuser', "select count(*)::int from public.analytics_events where user_id = $1 and event = 'first_task_added'", [U.b.id])) === 0);
await works('B removes sample family', U.b, 'select public.remove_sample_data()');
ok('sample data removed, real child kept', (await val(U.b, 'select count(*)::int from public.children')) === 1);

// ---------------------------------------------------------------------------
console.log('admin dashboard');
const ov = await val(U.admin, 'select public.admin_overview()');
ok('admin sees totals', ov.total_users === 5 && ov.children >= 3 && ov.tasks >= 4, JSON.stringify(ov).slice(0, 200));
ok('admin sees no children names or task text', !/Maria|Lucas|Sofia|Math homework|Dibujo/.test(JSON.stringify(ov)));
ok('admin sees subscribers and trials', ov.active_trials >= 3 && ov.active_subscribers === 1, `${ov.active_trials} trials, ${ov.active_subscribers} subs`);
ok('admin sees MRR estimate', Number(ov.mrr_estimate_usd) === 2.99, ov.mrr_estimate_usd);

// ---------------------------------------------------------------------------
console.log('data wipe and account deletion');
await works('A wipes data', U.a, 'select public.wipe_my_data()');
ok('wipe removes children, tasks, history', (await val('superuser',
  'select (select count(*) from public.children where user_id = $1) + (select count(*) from public.tasks where user_id = $1) + (select count(*) from public.task_status_history where user_id = $1)', [U.a.id])) == 0);
ok('wipe keeps the account', (await val(U.a, 'select public.my_account()')).full_name === 'Parent A');
await works('C deletes account', U.c, 'select public.delete_my_account()');
const left = await val('superuser', `select (select count(*) from auth.users where id = $1) + (select count(*) from public.profiles where id = $1)
  + (select count(*) from public.children where user_id = $1) + (select count(*) from public.tasks where user_id = $1)
  + (select count(*) from public.subscriptions where user_id = $1) + (select count(*) from public.trial_periods where user_id = $1)`, [U.c.id]);
ok('account deletion removes every personal row', left == 0, left);
ok('deletion is audited', (await val('superuser', "select count(*)::int from public.audit_logs where user_id = $1 and action = 'account_deleted'", [U.c.id])) === 1);
await signUp({ id: '00000000-0000-4000-c000-0000000000c2', email: U.c.email }, { full_name: 'Parent C again' });
ok('a deleted e-mail cannot start a second free trial', (await access({ id: '00000000-0000-4000-c000-0000000000c2' })) === 'locked');

// ---------------------------------------------------------------------------
await pool.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
