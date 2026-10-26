// Recruiting module: access control, privacy and automations.
// Runs against the local test database (./reset_local_db.sh), impersonating users the way
// Supabase does (role "authenticated" + JWT claims), like tests/isolation.test.mjs.
import pg from 'pg';

const pool = new pg.Pool({ host: '/tmp', port: 54329, user: 'postgres', database: 'wap_test', max: 4 });

const U = {
  ownerA: { id: '10000000-0000-4000-a000-00000000000a', email: 'rec.owner.a@test.dev' },
  supA:   { id: '10000000-0000-4000-a000-0000000000a3', email: 'rec.sup.a@test.dev' },
  ownerB: { id: '10000000-0000-4000-b000-00000000000b', email: 'rec.owner.b@test.dev' },
  outsider: { id: '10000000-0000-4000-c000-00000000000c', email: 'rec.outsider@test.dev' },
};

let passed = 0;
const failures = [];
const BLOCK_CODES = new Set(['42501', '23503', '23505', 'P0001', 'P0002', '23502', '23514']);

async function run(actor, fn, { commit = false } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (actor === 'anon') await c.query('set local role anon');
    else if (actor === 'service') await c.query('set local role service_role');
    else if (actor !== 'superuser') {
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: actor.id, role: 'authenticated', email: actor.email, aal: 'aal1' })]);
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
const one = async (actor, sql, params = [], opts) => (await q(actor, sql, params, opts)).rows[0];
const ok = (name, cond, detail = '') => { if (cond) passed++; else failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

async function blocked(name, actor, sql, params = [], opts) {
  try {
    const r = await q(actor, sql, params, opts);
    const n = r.command === 'SELECT' ? r.rows.length : r.rowCount;
    ok(name, n === 0, `expected to be blocked but ${r.command} returned ${n} row(s)`);
  } catch (e) {
    ok(name, BLOCK_CODES.has(e.code), `unexpected error ${e.code}: ${e.message}`);
  }
}
async function rejects(name, actor, sql, params, pattern, opts) {
  try { await q(actor, sql, params, opts); ok(name, false, 'expected an error, call succeeded'); }
  catch (e) { ok(name, pattern.test(e.message), `wrong error: ${e.code} ${e.message}`); }
}
async function allowed(name, actor, sql, params = [], minRows = 1, opts) {
  try {
    const r = await q(actor, sql, params, opts);
    const n = r.command === 'SELECT' ? r.rows.length : r.rowCount;
    ok(name, n >= minRows, `expected >= ${minRows} row(s), got ${n}`);
    return r;
  } catch (e) { ok(name, false, `unexpected error ${e.code}: ${e.message}`); }
}

const future = new Date(Date.now() + 30 * 864e5).toISOString();
const hotmart = (id, sub, email, plan) =>
  one('service', 'select billing.apply_hotmart_event($1,$2,$3,$4,$5,$6,$7,$8) as o',
      [id, 'PURCHASE_APPROVED', null, sub, null, email, plan, future], { commit: true });

const CAND = `insert into candidates (organization_id, warehouse_id, first_name, last_name, phone, email, consent_contact)
              values ($1,$2,$3,$4,$5,$6,true) returning id`;

async function setup() {
  for (const u of Object.values(U)) {
    await q('superuser', 'insert into auth.users (id, email, email_confirmed_at) values ($1,$2,now())', [u.id, u.email], { commit: true });
  }
  await hotmart('rec-a', 'REC-A', U.ownerA.email, 'business');
  await hotmart('rec-b', 'REC-B', U.ownerB.email, 'starter');
  const orgA = (await one(U.ownerA, "select public.claim_license('Rec A') as id", [], { commit: true })).id;
  const orgB = (await one(U.ownerB, "select public.claim_license('Rec B') as id", [], { commit: true })).id;
  const ins = async (actor, sql, params) => (await one(actor, sql + ' returning id', params, { commit: true })).id;
  const whA1 = await ins(U.ownerA, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgA, 'Florence']);
  const whA2 = await ins(U.ownerA, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgA, 'Walton']);
  const whB1 = await ins(U.ownerB, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgB, 'B1']);
  const shA1 = await ins(U.ownerA, "insert into shifts (organization_id, warehouse_id, name, start_time, end_time) values ($1,$2,'First','06:00','14:30')", [orgA, whA1]);
  const tok = (await one(U.ownerA, "select public.create_invitation($1,$2,'supervisor',$3) as t", [orgA, U.supA.email, [whA1]], { commit: true })).t;
  await q(U.supA, 'select public.accept_invitation($1)', [tok], { commit: true });
  return { orgA, orgB, whA1, whA2, whB1, shA1 };
}

async function tests(d) {
  // ===== Defaults =====
  await rejects('supervisor cannot seed defaults', U.supA, 'select public.seed_recruitment_defaults($1)', [d.orgA], /not_allowed/);
  await allowed('owner seeds defaults', U.ownerA, 'select public.seed_recruitment_defaults($1)', [d.orgA], 1, { commit: true });
  await q(U.ownerA, 'select public.seed_recruitment_defaults($1)', [d.orgA], { commit: true });   // idempotent
  const counts = await one(U.ownerA, `select (select count(*) from recruitment_sources where organization_id = $1)::int s,
    (select count(*) from message_templates where organization_id = $1)::int t,
    (select count(*) from message_templates where organization_id = $1 and lang = 'es')::int es`, [d.orgA]);
  ok('defaults: sources and bilingual templates, no duplicates on re-run', counts.s === 16 && counts.t === counts.es * 2 && counts.es >= 12, JSON.stringify(counts));
  await allowed('supervisor reads templates', U.supA, 'select * from message_templates where organization_id = $1', [d.orgA]);
  await blocked('supervisor cannot edit templates', U.supA, "update message_templates set body = 'x' where organization_id = $1", [d.orgA]);
  await blocked('company B cannot read company A sources', U.ownerB, 'select * from recruitment_sources where organization_id = $1', [d.orgA]);

  // ===== Candidates: normalization, duplicates, automations =====
  const c1 = (await one(U.ownerA, CAND, [d.orgA, d.whA1, ' Maria ', 'Lopez', '(859) 555-0142', 'Maria@Example.com '], { commit: true })).id;
  const row1 = await one(U.ownerA, 'select * from candidates where id = $1', [c1]);
  ok('phone normalized to 10 digits, email lower-cased, names trimmed',
    row1.phone === '8595550142' && row1.email === 'maria@example.com' && row1.first_name === 'Maria', JSON.stringify([row1.phone, row1.email]));
  ok('consent time stamped automatically', row1.consent_at !== null);
  const ev = await one(U.ownerA, "select count(*)::int n from candidate_events where candidate_id = $1 and kind = 'stage_change'", [c1]);
  ok('stage history written on registration', ev.n === 1);
  const t1 = await one(U.ownerA, "select * from recruitment_tasks where candidate_id = $1 and auto_key = 'first_contact'", [c1]);
  ok('first-contact task created and tied to the warehouse', t1 && t1.done_at === null && t1.warehouse_id === d.whA1);

  const c2 = (await one(U.supA, CAND, [d.orgA, d.whA1, 'María', 'López', '+1 859-555-0142', null], { commit: true })).id;
  const dup = await one(U.ownerA, 'select possible_duplicate_of from candidates where id = $1', [c2]);
  ok('duplicate detected by phone in another format', dup.possible_duplicate_of === c1);
  const c3 = (await one(U.ownerA, CAND, [d.orgA, d.whA2, 'Joe', 'Smith', null, 'MARIA@example.com'], { commit: true })).id;
  ok('duplicate detected by email across warehouses',
    (await one(U.ownerA, 'select possible_duplicate_of from candidates where id = $1', [c3])).possible_duplicate_of === c1);

  await rejects('a candidate needs a phone or an email', U.ownerA, CAND, [d.orgA, d.whA1, 'No', 'Contact', null, null], /check/);

  // Contact log moves the pipeline and closes the first-contact task.
  await allowed('supervisor logs a call', U.supA,
    "insert into candidate_events (candidate_id, kind, outcome, body) values ($1,'call','reached','Interested in first shift')", [c1], 1, { commit: true });
  const after = await one(U.ownerA, 'select stage, last_contact_at from candidates where id = $1', [c1]);
  ok('reached by phone: stage becomes contacted, last contact set', after.stage === 'contacted' && after.last_contact_at !== null, JSON.stringify(after));
  ok('first-contact task closed automatically',
    (await one(U.ownerA, "select done_at from recruitment_tasks where candidate_id = $1 and auto_key = 'first_contact'", [c1])).done_at !== null);
  await blocked('stage history cannot be forged from the browser', U.ownerA,
    "insert into candidate_events (candidate_id, kind, stage_to) values ($1,'stage_change','approved')", [c1]);
  const evOrg = await one(U.ownerA, "select organization_id, created_by from candidate_events where candidate_id = $1 and kind = 'call'", [c1]);
  ok('server sets company and author on contact entries', evOrg.organization_id === d.orgA && evOrg.created_by === U.supA.id);

  await q(U.ownerA, "update candidates set stage = 'interested' where id = $1", [c1], { commit: true });
  ok('interested: pre-screen task created',
    !!(await one(U.ownerA, "select 1 from recruitment_tasks where candidate_id = $1 and auto_key = 'prescreen'", [c1])));
  await q(U.ownerA, "update candidates set interview_at = now() + interval '2 days' where id = $1", [c1], { commit: true });
  ok('interview reminder task created',
    !!(await one(U.ownerA, "select 1 from recruitment_tasks where candidate_id = $1 and kind = 'interview'", [c1])));
  await q(U.ownerA, "update candidates set stage = 'closed', recontact_on = current_date + 30 where id = $1", [c2], { commit: true });
  const closed = await one(U.ownerA, 'select stage, closed_reason from candidates where id = $1', [c2]);
  ok('closing without a reason records "other"', closed.closed_reason === 'other');
  ok('recontact task scheduled',
    !!(await one(U.ownerA, "select 1 from recruitment_tasks where candidate_id = $1 and kind = 'recontact'", [c2])));

  await q(U.ownerA, 'update candidates set consent_contact = false where id = $1', [c1], { commit: true });
  await q(U.ownerA, 'update candidates set consent_contact = true, consent_sms = true where id = $1', [c1], { commit: true });
  await q(U.ownerA, 'update candidates set consent_contact = false where id = $1', [c1], { commit: true });
  ok('withdrawing consent switches every channel off',
    (await one(U.ownerA, 'select consent_sms from candidates where id = $1', [c1])).consent_sms === false);
  await q(U.ownerA, 'update candidates set consent_contact = true where id = $1', [c1], { commit: true });

  // ===== Access control =====
  await blocked('supervisor cannot see candidates of another warehouse', U.supA, 'select * from candidates where id = $1', [c3]);
  await allowed('supervisor sees candidates of their warehouse', U.supA, 'select * from candidates where id = $1', [c1]);
  await blocked('supervisor cannot add a candidate to another warehouse', U.supA, CAND, [d.orgA, d.whA2, 'X', 'Y', '8595550100', null]);
  await blocked('supervisor cannot move a candidate to another warehouse', U.supA, 'update candidates set warehouse_id = $2 where id = $1', [c1, d.whA2]);
  await blocked('supervisor cannot delete candidates', U.supA, 'delete from candidates where id = $1', [c1]);
  await blocked('supervisor cannot see tasks of another warehouse', U.supA, 'select * from recruitment_tasks where candidate_id = $1', [c3]);
  await blocked('supervisor cannot read the contact log of another warehouse', U.supA, 'select * from candidate_events where candidate_id = $1', [c3]);
  await blocked('company B cannot read company A candidates', U.ownerB, 'select * from candidates where organization_id = $1', [d.orgA]);
  await blocked('company B cannot add candidates to company A', U.ownerB, CAND, [d.orgA, d.whA1, 'X', 'Y', '8595550101', null]);
  await blocked('company B cannot point a candidate at an A warehouse', U.ownerB, CAND, [d.orgB, d.whA1, 'X', 'Y', '8595550101', null]);
  await blocked('company B cannot log contacts on A candidates', U.ownerB,
    "insert into candidate_events (candidate_id, kind) values ($1,'note')", [c1]);
  await blocked('outsider sees nothing', U.outsider, 'select * from candidates', []);
  await blocked('anonymous visitors cannot read candidates', 'anon', 'select * from candidates', []);
  await blocked('nobody marks their own rows as sample data', U.ownerA,
    "insert into candidates (organization_id, warehouse_id, first_name, last_name, phone, is_sample) values ($1,$2,'S','S','8595550199',true)", [d.orgA, d.whA1]);
  await blocked('sample flag is not editable', U.ownerA, 'update candidates set is_sample = true where id = $1', [c1]);

  // ===== Audit without personal data =====
  const audit = await q(U.ownerA, "select old_data, new_data from audit_log where table_name = 'candidates' and record_id = $1", [c1]);
  const blob = JSON.stringify(audit.rows);
  ok('candidate audit trail exists', audit.rows.length >= 3);
  ok('candidate audit stores field names, never names/phones/emails', !/Maria|Lopez|8595550142|example\.com/i.test(blob), blob.slice(0, 200));
  await rejects('supervisor cannot record exports', U.supA, "select public.record_export($1,'candidates',5)", [d.orgA], /not_allowed/);
  await allowed('owner export is recorded', U.ownerA, "select public.record_export($1,'candidates',5)", [d.orgA], 1, { commit: true });
  ok('export appears in audit log', !!(await one(U.ownerA, "select 1 from audit_log where organization_id = $1 and action = 'export'", [d.orgA])));

  // ===== Public intake form =====
  const form = await one(U.ownerA, "insert into intake_forms (organization_id, warehouse_id, title) values ($1,$2,'Job fair') returning id, token", [d.orgA, d.whA1], { commit: true });
  await blocked('supervisor cannot create intake forms', U.supA, "insert into intake_forms (organization_id, warehouse_id, title) values ($1,$2,'x')", [d.orgA, d.whA1]);
  const info = await one('anon', 'select public.intake_form_public($1) as i', [form.token]);
  ok('public form info shows only title and public name', info.i && info.i.title === 'Job fair' && !JSON.stringify(info.i).includes(d.orgA));
  ok('unknown token reveals nothing', (await one('anon', 'select public.intake_form_public($1) as i', ['nope'])).i === null);
  const payload = {
    first_name: 'Luis', last_name: 'Rivera', phone: '859.555.0177', email: '', zip: '41042', preferred_language: 'es',
    experience: ['picking', 'hacking'], shifts_available: ['second'], consent_contact: true, consent_sms: true, consent_email: true,
  };
  const ref1 = (await one('anon', 'select public.submit_intake($1,$2) as r', [form.token, payload], { commit: true })).r;
  const ref2 = (await one('anon', 'select public.submit_intake($1,$2) as r', [form.token, payload], { commit: true })).r;
  ok('anonymous submission returns a reference', /^[0-9A-F]{8}$/.test(ref1));
  ok('same person twice in a day: same reference, one record', ref1 === ref2);
  const sub = await q(U.ownerA, "select * from candidates where intake_form_id = $1", [form.id]);
  ok('one candidate created from the form', sub.rows.length === 1);
  const s = sub.rows[0];
  ok('form answers kept, unknown options dropped', s.experience.join() === 'picking' && s.preferred_language === 'es' && s.stage === 'new');
  ok('email consent ignored without an email; SMS consent kept', s.consent_email === false && s.consent_sms === true && s.consent_method === 'web_form');
  ok('submission counter updated', (await one(U.ownerA, 'select submissions from intake_forms where id = $1', [form.id])).submissions === 1);
  await rejects('consent is required', 'anon', 'select public.submit_intake($1,$2)', [form.token, { ...payload, phone: '8595550178', consent_contact: false }], /intake_consent_required/);
  await rejects('bad phone rejected', 'anon', 'select public.submit_intake($1,$2)', [form.token, { ...payload, phone: '12345' }], /intake_bad_phone/);
  await rejects('name required', 'anon', 'select public.submit_intake($1,$2)', [form.token, { ...payload, first_name: ' ' }], /intake_missing_name/);
  await q('anon', 'select public.submit_intake($1,$2)', [form.token, { ...payload, phone: '8595550179', website: 'http://spam' }], { commit: true });
  ok('honeypot: bot submission stored nowhere',
    (await one(U.ownerA, "select count(*)::int n from candidates where phone = '8595550179'", [])).n === 0);
  await q(U.ownerA, 'update intake_forms set is_active = false where id = $1', [form.id], { commit: true });
  await rejects('closed form refuses submissions', 'anon', 'select public.submit_intake($1,$2)', [form.token, { ...payload, phone: '8595550180' }], /intake_form_closed/);
  await rejects('anonymous visitors cannot call staff functions', 'anon', "select public.record_export($1,'x',1)", [d.orgA], /permission denied/);

  // ===== Hiring → attendance → pipeline =====
  await rejects('supervisor cannot hire', U.supA, "select public.hire_candidate($1,'5001',$2,current_date)", [c1, d.shA1], /not_allowed/);
  await rejects('company B cannot hire A candidates', U.ownerB, "select public.hire_candidate($1,'5001',null,current_date)", [c1], /not_allowed/);
  const emp = (await one(U.ownerA, "select public.hire_candidate($1,'5001',$2,current_date) as e", [c1, d.shA1], { commit: true })).e;
  const hired = await one(U.ownerA, 'select stage, employee_id, first_day from candidates where id = $1', [c1]);
  ok('hire: employee created and linked, stage assigned', hired.employee_id === emp && hired.stage === 'assigned' && hired.first_day !== null);
  ok('hire: first-day tasks created',
    (await one(U.ownerA, "select count(*)::int n from recruitment_tasks where candidate_id = $1 and kind in ('confirm_first_day','first_day_check')", [c1])).n === 2);
  await rejects('a candidate is hired once', U.ownerA, "select public.hire_candidate($1,'5002',null,current_date)", [c1], /candidate_already_hired/);
  await q(U.supA, "insert into attendance_records (employee_id, work_date, status) values ($1, current_date, 'present')", [emp], { commit: true });
  ok('first attendance moves the candidate to "started"',
    (await one(U.ownerA, 'select stage from candidates where id = $1', [c1])).stage === 'started');
  ok('first-day tasks close once they show up',
    (await one(U.ownerA, "select count(*)::int n from recruitment_tasks where candidate_id = $1 and kind in ('confirm_first_day','first_day_check') and done_at is null", [c1])).n === 0);
  ok('retention check-ins scheduled at 7/30/60 days',
    (await one(U.ownerA, "select count(*)::int n from recruitment_tasks where candidate_id = $1 and kind = 'retention_check'", [c1])).n === 3);
  const out = await one(U.ownerA, 'select * from public.recruitment_outcomes($1) where candidate_id = $2', [d.orgA, c1]);
  ok('outcomes report first and last day worked', out && out.first_attendance_date !== null && out.last_worked_date !== null);

  // ===== Sample data =====
  await rejects('supervisor cannot load samples', U.supA, 'select public.load_recruitment_samples($1,$2)', [d.orgA, d.whA1], /not_allowed/);
  const n = (await one(U.ownerA, 'select public.load_recruitment_samples($1,$2) as n', [d.orgA, d.whA1], { commit: true })).n;
  const smp = await q(U.ownerA, 'select first_name, phone, email from candidates where organization_id = $1 and is_sample', [d.orgA]);
  ok('samples loaded and clearly labelled', n === 24 && smp.rows.every(r => r.first_name.startsWith('Sample') && r.phone.startsWith('85955501') && r.email.endsWith('@example.com')));
  await rejects('samples load once', U.ownerA, 'select public.load_recruitment_samples($1,$2)', [d.orgA, d.whA1], /samples_already_loaded/);
  const removed = (await one(U.ownerA, 'select public.remove_recruitment_samples($1) as n', [d.orgA], { commit: true })).n;
  ok('samples removed in one call, real candidates kept', removed === 24
    && (await one(U.ownerA, 'select count(*)::int n from candidates where organization_id = $1', [d.orgA])).n === 4);

  // ===== Erasure and retention =====
  await allowed('owner deletes a candidate on request', U.ownerA, 'delete from candidates where id = $1', [c3], 1, { commit: true });
  ok('deleted candidate leaves no tasks or contact log',
    (await one('superuser', 'select (select count(*) from recruitment_tasks where candidate_id = $1) + (select count(*) from candidate_events where candidate_id = $1) as n', [c3])).n === '0');
  await run('superuser', async c => {   // backdate without firing the updated_at trigger
    await c.query('set local session_replication_role = replica');
    await c.query("update candidates set updated_at = now() - interval '13 months' where organization_id = $1", [d.orgA]);
  }, { commit: true });
  const purged = (await one('superuser', 'select app.purge_recruitment() as n', [], { commit: true })).n;
  const left = await q('superuser', 'select stage from candidates where organization_id = $1', [d.orgA]);
  ok('retention purge removes stale candidates, keeps people who started work',
    purged === 2 && left.rows.length === 1 && left.rows[0].stage === 'started', `purged ${purged}, left ${JSON.stringify(left.rows)}`);
  await rejects('purge is not callable from the app', U.ownerA, 'select app.purge_recruitment()', [], /permission denied/);
}

try {
  const d = await setup();
  await tests(d);
} catch (e) {
  failures.push('HARNESS ERROR: ' + (e.stack || e.message));
} finally {
  await pool.end();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(' ✗ ' + f);
  process.exit(1);
}
console.log('All recruiting access-control, privacy and automation checks passed.');
