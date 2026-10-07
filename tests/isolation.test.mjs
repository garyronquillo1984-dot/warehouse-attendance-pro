// Tenant-isolation and access-control test suite.
// Runs against the local test database (./reset_local_db.sh) and impersonates real
// users exactly the way Supabase does: role "authenticated" + JWT claims.
// Every attack must be blocked; every legitimate action must work.
import pg from 'pg';

const pool = new pg.Pool({ host: '/tmp', port: 54329, user: 'postgres', database: 'wap_test', max: 4 });

// ---------- users ----------
const U = {
  ownerA:  { id: '00000000-0000-4000-a000-00000000000a', email: 'owner.a@test.dev' },
  adminA:  { id: '00000000-0000-4000-a000-0000000000a2', email: 'admin.a@test.dev' },
  supA:    { id: '00000000-0000-4000-a000-0000000000a3', email: 'sup.a@test.dev' },
  ownerB:  { id: '00000000-0000-4000-b000-00000000000b', email: 'owner.b@test.dev' },
  supB:    { id: '00000000-0000-4000-b000-0000000000b3', email: 'sup.b@test.dev' },
  outsider:{ id: '00000000-0000-4000-c000-00000000000c', email: 'outsider@test.dev' },
  unconf:  { id: '00000000-0000-4000-d000-00000000000d', email: 'unconfirmed@test.dev', unconfirmed: true },
  platform:{ id: '00000000-0000-4000-e000-00000000000e', email: 'platform@test.dev' },
};

// ---------- harness ----------
let passed = 0;
const failures = [];
const BLOCK_CODES = new Set(['42501', '23503', '23505', 'P0001', 'P0002', '40001', '23502']);

async function run(actor, fn, { commit = false, aal = 'aal1' } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (actor === 'anon') {
      await c.query('set local role anon');
    } else if (actor === 'service') {
      await c.query('set local role service_role');
    } else if (actor !== 'superuser') {
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: actor.id, role: 'authenticated', email: actor.email, aal })]);
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

function ok(name, cond, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// The attack must raise a permission/integrity error, or touch zero rows.
async function blocked(name, actor, sql, params = [], opts) {
  try {
    const r = await q(actor, sql, params, opts);
    const n = r.command === 'SELECT' ? r.rows.length : r.rowCount;
    ok(name, n === 0, `expected to be blocked but ${r.command} returned ${n} row(s)`);
  } catch (e) {
    ok(name, BLOCK_CODES.has(e.code), `unexpected error ${e.code}: ${e.message}`);
  }
}
// The call must fail with a specific message (server-function rules).
async function rejects(name, actor, sql, params, pattern, opts) {
  try {
    await q(actor, sql, params, opts);
    ok(name, false, 'expected an error, call succeeded');
  } catch (e) {
    ok(name, pattern.test(e.message), `wrong error: ${e.code} ${e.message}`);
  }
}
async function allowed(name, actor, sql, params = [], minRows = 1, opts) {
  try {
    const r = await q(actor, sql, params, opts);
    const n = r.command === 'SELECT' ? r.rows.length : r.rowCount;
    ok(name, n >= minRows, `expected >= ${minRows} row(s), got ${n}`);
    return r;
  } catch (e) {
    ok(name, false, `unexpected error ${e.code}: ${e.message}`);
  }
}

const hotmart = (id, type, sub, email, plan, periodEnd = null, time = null) =>
  one('service', 'select billing.apply_hotmart_event($1,$2,$3,$4,$5,$6,$7,$8) as outcome',
      [id, type, time, sub, null, email, plan, periodEnd], { commit: true }).then(r => r.outcome);

const future = new Date(Date.now() + 30 * 864e5).toISOString();

// ---------- setup ----------
async function setup() {
  for (const u of Object.values(U)) {
    await q('superuser', 'insert into auth.users (id, email, email_confirmed_at) values ($1,$2,$3)',
      [u.id, u.email, u.unconfirmed ? null : new Date().toISOString()], { commit: true });
  }
  await q('superuser', 'insert into public.platform_admins (user_id) values ($1)', [U.platform.id], { commit: true });

  // Purchases arrive from Hotmart before the buyers have accounts.
  ok('webhook creates license A', await hotmart('evt-a1', 'PURCHASE_APPROVED', 'SUB-A', U.ownerA.email, 'professional', future) === 'license_created');
  ok('webhook creates license B', await hotmart('evt-b1', 'PURCHASE_APPROVED', 'SUB-B', U.ownerB.email, 'starter', future) === 'license_created');
  await hotmart('evt-u1', 'PURCHASE_APPROVED', 'SUB-U', U.unconf.email, 'starter', future);
  // Company A upgrades so it can have two warehouses.
  ok('webhook switches plan', await hotmart('evt-a2', 'SWITCH_PLAN', 'SUB-A', U.ownerA.email, 'business') === 'plan_changed');

  const orgA = (await one(U.ownerA, "select public.claim_license('Company A') as id", [], { commit: true })).id;
  const orgB = (await one(U.ownerB, "select public.claim_license('Company B') as id", [], { commit: true })).id;

  const ins = async (actor, sql, params) => (await one(actor, sql + ' returning id', params, { commit: true })).id;
  const whA1 = await ins(U.ownerA, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgA, 'A1']);
  const whA2 = await ins(U.ownerA, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgA, 'A2']);
  const whB1 = await ins(U.ownerB, 'insert into warehouses (organization_id, name) values ($1,$2)', [orgB, 'B1']);

  const shiftSql = "insert into shifts (organization_id, warehouse_id, name, start_time, end_time) values ($1,$2,$3,'06:00','15:45')";
  const shA1 = await ins(U.ownerA, shiftSql, [orgA, whA1, 'First Shift']);
  const shA2 = await ins(U.ownerA, shiftSql, [orgA, whA2, 'First Shift']);
  const shB1 = await ins(U.ownerB, shiftSql, [orgB, whB1, 'First Shift']);
  const deptA1 = await ins(U.ownerA, 'insert into departments (organization_id, warehouse_id, name) values ($1,$2,$3)', [orgA, whA1, 'Picking']);

  const empSql = 'insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name, shift_id) values ($1,$2,$3,$4,$5,$6)';
  const empA1 = await ins(U.ownerA, empSql, [orgA, whA1, '1001', 'Ana', 'Alpha', shA1]);
  const empA1b = await ins(U.ownerA, empSql, [orgA, whA1, '1002', 'Abel', 'Alpha', shA1]);
  const empA2 = await ins(U.ownerA, empSql, [orgA, whA2, '2001', 'Aria', 'Alpha', shA2]);
  const empB1 = await ins(U.ownerB, empSql, [orgB, whB1, '1001', 'Bea', 'Beta', shB1]); // same badge, other company: allowed

  // Team: invitations accepted by the right people.
  const tokAdmin = (await one(U.ownerA, "select public.create_invitation($1, $2, 'admin') as t", [orgA, U.adminA.email], { commit: true })).t;
  await q(U.adminA, 'select public.accept_invitation($1)', [tokAdmin], { commit: true });
  const tokSup = (await one(U.ownerA, "select public.create_invitation($1, $2, 'supervisor', $3) as t", [orgA, U.supA.email, [whA1]], { commit: true })).t;
  await q(U.supA, 'select public.accept_invitation($1)', [tokSup], { commit: true });
  const tokSupB = (await one(U.ownerB, "select public.create_invitation($1, $2, 'supervisor', $3) as t", [orgB, U.supB.email, [whB1]], { commit: true })).t;
  await q(U.supB, 'select public.accept_invitation($1)', [tokSupB], { commit: true });

  // Attendance: the browser only sends employee, date, status.
  const attSql = 'insert into attendance_records (employee_id, organization_id, warehouse_id, work_date, status) values ($1,$2,$3,$4,$5)';
  const attA1 = await ins(U.supA, attSql, [empA1, orgA, whA1, '2026-10-01', 'present']);
  await ins(U.ownerA, attSql, [empA1b, orgA, whA1, '2026-10-01', 'absent']);
  await ins(U.ownerA, attSql, [empA2, orgA, whA2, '2026-10-01', 'late']);
  const attB1 = await ins(U.ownerB, attSql, [empB1, orgB, whB1, '2026-10-01', 'present']);

  return { tokSup, orgA, orgB, whA1, whA2, whB1, shA1, shB1, deptA1, empA1, empA1b, empA2, empB1, attA1, attB1 };
}

// ---------- tests ----------
async function tests(d) {
  // ===== 0. Employee import and attendance capture functions =====
  const imp = 'select public.import_employees($1,$2,$3,$4::jsonb) as r';
  const rowsA = JSON.stringify([
    { employee_code: '3001', first_name: 'Nina', last_name: 'New', shift: 'first shift', department: 'Receiving' },
    { employee_code: '1001', first_name: 'Ana', last_name: 'Changed' },          // existing: update
    { employee_code: '1002', first_name: 'Abel', last_name: 'Alpha' },           // existing: unchanged
    { employee_code: '3002', first_name: 'Ulla', last_name: 'X', shift: 'Night' }, // unknown shift
    { employee_code: '3001', first_name: 'Nina', last_name: 'Again' },           // duplicate in file
    { employee_code: '3003', first_name: '', last_name: 'Nameless' },            // missing name
    { employee_code: '2001', first_name: 'Aria', last_name: 'Alpha' },           // belongs to warehouse A2
    { employee_code: '3004', first_name: 'Bad', last_name: 'Date', hire_date: '31/31/2026' },
  ]);
  const res = await one(U.adminA, imp, [d.orgA, d.whA1, 'staff.xlsx', rowsA]).catch(e => ({ r: { error: e.message } }));
  const errs = (res.r.errors || []).map(e => e.error).sort().join(',');
  ok('import: new, updated and unchanged counted by badge', res.r.new === 1 && res.r.updated === 1 && res.r.unchanged === 1, JSON.stringify(res.r));
  ok('import: each bad row explained', errs === 'bad_date,duplicate_in_file,missing_name,other_warehouse,unknown_shift', errs);
  await run(U.adminA, async c => {
    await c.query(imp, [d.orgA, d.whA1, 'staff.xlsx', rowsA]);
    const e = (await c.query("select e.last_name, d.name dept, s.name shift from employees e left join departments d on d.id = e.department_id left join shifts s on s.id = e.shift_id where e.organization_id = $1 and e.employee_code in ('1001','3001') order by e.employee_code", [d.orgA])).rows;
    ok('import: update keeps saved shift when the file leaves it blank', e[0].last_name === 'Changed' && e[0].shift === 'First Shift', JSON.stringify(e[0]));
    ok('import: unknown department is created, shift matched by name', e[1].dept === 'Receiving' && e[1].shift === 'First Shift', JSON.stringify(e[1]));
    ok('import: history row written', (await c.query("select rows_new, rows_error from import_batches where organization_id = $1 and kind = 'employees'", [d.orgA])).rows[0]?.rows_error === 5);
  });
  await rejects('import: A owner cannot import into company B', U.ownerA, imp, [d.orgB, d.whB1, 'x.csv', rowsA], /not_allowed/);
  await rejects('import: A owner cannot import into a B warehouse', U.ownerA, imp, [d.orgA, d.whB1, 'x.csv', rowsA], /warehouse_not_found/);
  await rejects('import: supervisor cannot import', U.supA, imp, [d.orgA, d.whA1, 'x.csv', rowsA], /not_allowed/);
  await rejects('import: anonymous cannot call', 'anon', imp, [d.orgA, d.whA1, 'x.csv', rowsA], /permission denied/);

  const rec = 'select public.record_attendance(current_date, $1::jsonb) as n';
  const entry = (id, status, extra = {}) => JSON.stringify([{ employee_id: id, status, ...extra }]);
  await run(U.supA, async c => {
    await c.query(rec, [entry(d.empA1, 'present', { reason_code: 'personal' })]);
    await c.query(rec, [entry(d.empA1, 'absent', { reason_code: 'no_call_no_show' })]);
    const rows = (await c.query('select status, reason_code, recorded_by, organization_id from attendance_records where employee_id = $1 and work_date = current_date', [d.empA1])).rows;
    ok('attendance: re-marking replaces the status (one row per day)', rows.length === 1 && rows[0].status === 'absent' && rows[0].reason_code === 'no_call_no_show', JSON.stringify(rows));
    ok('attendance: author and company set by the server', rows[0].recorded_by === U.supA.id && rows[0].organization_id === d.orgA);
  });
  await run(U.supA, async c => {
    await c.query(rec, [entry(d.empA1b, 'present', { reason_code: 'personal' })]);
    const r = (await c.query('select reason_code from attendance_records where employee_id = $1 and work_date = current_date', [d.empA1b])).rows[0];
    ok('attendance: a reason is only kept for absences', r.reason_code === null);
  });
  await blocked('attendance: supervisor cannot mark an employee of another warehouse', U.supA, rec, [entry(d.empA2, 'present')]);
  await blocked('attendance: A cannot mark a B employee', U.ownerA, rec, [entry(d.empB1, 'present')]);
  await rejects('attendance: B reason codes cannot be used by A', U.ownerA, rec, [entry(d.empA1, 'absent', { reason_code: 'made_up' })], /foreign key/);
  await rejects('attendance: far-future dates rejected', U.supA,
    "select public.record_attendance(current_date + 30, $1::jsonb)", [entry(d.empA1, 'present')], /work_date_out_of_range/);
  await rejects('attendance: anonymous cannot call', 'anon', rec, [entry(d.empA1, 'present')], /permission denied/);

  // Reports: the grid only ever contains rows the caller may see.
  const grid = 'select public.report_grid($1, $2, $3::date, $4::date) as g';
  const gA = (await one(U.ownerA, grid, [d.orgA, null, '2026-10-01', new Date().toISOString().slice(0, 10)])).g;
  ok('report: owner sees records of all her warehouses', gA.some(r => r[1] === d.empA2 && r[0] === '2026-10-01' && r[3] === 'late')
     && gA.some(r => r[1] === d.empA1b && r[3] === 'absent'), JSON.stringify(gA));
  ok('report: "no record" rows never come before the employee existed', gA.every(r => r[3] !== 'none' || r[0] >= new Date(Date.now() - 864e5).toISOString().slice(0, 10)));
  const gS = (await one(U.supA, grid, [d.orgA, null, '2026-10-01', '2026-10-07'])).g;
  ok('report: supervisor only gets her warehouse', gS.length > 0 && !gS.some(r => r[1] === d.empA2), JSON.stringify(gS));
  ok('report: A gets nothing from company B', (await one(U.ownerA, grid, [d.orgB, null, '2026-10-01', '2026-10-07'])).g.length === 0);
  ok('report: outsider gets nothing', (await one(U.outsider, grid, [d.orgA, null, '2026-10-01', '2026-10-07'])).g.length === 0);
  await rejects('report: range longer than 3 months refused', U.ownerA, grid, [d.orgA, null, '2026-01-01', '2026-10-07'], /range_too_long/);
  await rejects('report: anonymous cannot call', 'anon', grid, [d.orgA, null, '2026-10-01', '2026-10-07'], /permission denied/);


  // Team screen, invitations, super admin extras, webhook entry point.
  const team = await q(U.ownerA, 'select * from public.team_members($1)', [d.orgA]);
  ok('team: owner sees members with emails', team.rows.some(r => r.email === U.supA.email && r.role === 'supervisor' && r.warehouse_ids.includes(d.whA1)));
  await rejects('team: supervisor cannot list the team', U.supA, 'select * from public.team_members($1)', [d.orgA], /not_allowed/);
  await rejects('team: A cannot list B team', U.ownerA, 'select * from public.team_members($1)', [d.orgB], /not_allowed/);
  await run(U.ownerA, async c => {
    const tok = (await c.query("select public.create_invitation($1, 'late@test.dev', 'supervisor') as t", [d.orgA])).rows[0].t;
    const inv = (await c.query("select id from invitations where email = 'late@test.dev'")).rows[0].id;
    await c.query('select public.revoke_invitation($1)', [inv]);
    ok('invitation revoked = expired now', (await c.query('select expires_at <= now() as x from invitations where id = $1', [inv])).rows[0].x && !!tok);
  });
  const invB = (await one(U.ownerB, "select public.create_invitation($1, 'x2@test.dev', 'supervisor') as t", [d.orgB], { commit: true })).t;
  const invBId = (await one('superuser', "select id from invitations where email = 'x2@test.dev'")).id;
  await rejects('A cannot revoke B invitation', U.ownerA, 'select public.revoke_invitation($1)', [invBId], /not_allowed/);
  ok('am_platform_admin: true only for the platform owner',
     (await one(U.platform, 'select public.am_platform_admin() as x')).x === true && (await one(U.ownerA, 'select public.am_platform_admin() as x')).x === false && !!invB);
  await rejects('admin billing log needs two-step sign-in', U.platform, 'select * from public.admin_billing_events()', [], /not_allowed/);
  await allowed('admin billing log with two-step sign-in', U.platform, 'select * from public.admin_billing_events()', [], 1, { aal: 'aal2' });
  await rejects('customers cannot read the billing log', U.ownerA, 'select * from public.admin_billing_events()', [], /not_allowed/, { aal: 'aal2' });
  await rejects('signed-in users cannot fake a Hotmart event', U.ownerA,
    "select public.hotmart_apply_event('x','PURCHASE_APPROVED',now(),'S',null,'owner.a@test.dev','business',null,null)", [], /permission denied/);
  await rejects('anonymous cannot fake a Hotmart event', 'anon',
    "select public.hotmart_apply_event('x','PURCHASE_APPROVED',now(),'S',null,'a@test.dev','business',null,null)", [], /permission denied/);
  ok('the webhook entry point works for the server', (await one('service',
    "select public.hotmart_apply_event('evt-svc','PURCHASE_APPROVED',now(),'SUB-SVC',null,'svc@test.dev','professional',null,null) as o")).o === 'license_created');

  // ===== 1. Company A trying to reach Company B =====
  const crossReads = [
    ['employees', 'select * from employees where organization_id = $1'],
    ['attendance', 'select * from attendance_records where organization_id = $1'],
    ['warehouses', 'select * from warehouses where organization_id = $1'],
    ['shifts', 'select * from shifts where organization_id = $1'],
    ['departments', 'select * from departments where organization_id = $1'],
    ['absence reasons', 'select * from absence_reasons where organization_id = $1'],
    ['organization', 'select * from organizations where id = $1'],
    ['memberships', 'select * from memberships where organization_id = $1'],
    ['member warehouses', 'select * from member_warehouses where organization_id = $1'],
    ['import batches', 'select * from import_batches where organization_id = $1'],
    ['invitations', 'select * from invitations where organization_id = $1'],
    ['audit log', 'select * from audit_log where organization_id = $1'],
  ];
  for (const [label, sql] of crossReads) {
    await blocked(`A owner cannot read B ${label}`, U.ownerA, sql, [d.orgB]);
    await blocked(`A supervisor cannot read B ${label}`, U.supA, sql, [d.orgB]);
  }
  await allowed('control: B owner reads own employees', U.ownerB, 'select * from employees where organization_id = $1', [d.orgB]);
  await allowed('control: B owner reads own attendance', U.ownerB, 'select * from attendance_records where organization_id = $1', [d.orgB]);

  await blocked('A cannot read B employee by id (URL tampering)', U.ownerA, 'select * from employees where id = $1', [d.empB1]);
  await blocked('A cannot read B profile', U.ownerA, 'select * from profiles where user_id = $1', [U.ownerB.id]);
  await allowed('control: A owner sees teammate profile', U.ownerA, 'select * from profiles where user_id = $1', [U.adminA.id]);
  await blocked('A cannot update B employee', U.ownerA, "update employees set first_name = 'X' where id = $1", [d.empB1]);
  await blocked('A cannot delete B attendance', U.ownerA, 'delete from attendance_records where id = $1', [d.attB1]);
  await blocked('A cannot update B attendance', U.ownerA, "update attendance_records set status = 'absent' where id = $1", [d.attB1]);
  await blocked('A cannot rename B company', U.ownerA, "update organizations set name = 'X' where id = $1", [d.orgB]);
  await blocked('A cannot insert employee into B', U.ownerA,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'9','X','Y')", [d.orgB, d.whB1]);
  await blocked('A cannot insert employee into own org but B warehouse', U.ownerA,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'9','X','Y')", [d.orgA, d.whB1]);
  await blocked('A cannot record attendance for B employee (forged A ids)', U.ownerA,
    "insert into attendance_records (employee_id, organization_id, warehouse_id, work_date, status) values ($1,$2,$3,'2026-10-02','present')",
    [d.empB1, d.orgA, d.whA1]);
  await blocked('A cannot move own attendance to B employee', U.ownerA,
    'update attendance_records set employee_id = $1 where id = $2', [d.empB1, d.attA1]);
  await blocked('A cannot move own employee to company B', U.ownerA,
    'update employees set organization_id = $1 where id = $2', [d.orgB, d.empA1]);
  await blocked('A cannot add shift to B warehouse', U.ownerA,
    "insert into shifts (organization_id, warehouse_id, name, start_time, end_time) values ($1,$2,'X','06:00','14:00')", [d.orgB, d.whB1]);
  await blocked('A cannot use B shift for own employee', U.ownerA,
    'update employees set shift_id = $1 where id = $2', [d.shB1, d.empA1]);
  await blocked('A cannot add herself to B memberships', U.ownerA,
    "insert into memberships (organization_id, user_id, role) values ($1,$2,'owner')", [d.orgB, U.ownerA.id]);
  await blocked('A cannot grant herself a B warehouse', U.ownerA,
    'insert into member_warehouses (organization_id, user_id, warehouse_id) values ($1,$2,$3)', [d.orgA, U.ownerA.id, d.whB1]);
  await rejects('A cannot invite people into B', U.ownerA, "select public.create_invitation($1,'x@test.dev','supervisor')", [d.orgB], /not_allowed/);
  await rejects('A cannot change B members', U.ownerA, "select public.update_member($1,$2,'admin')", [d.orgB, U.supB.id], /not_allowed/);
  await rejects('A cannot remove B members', U.ownerA, 'select public.remove_member($1,$2)', [d.orgB, U.supB.id], /not_allowed/);
  await blocked('A cannot see B license', U.ownerA, 'select * from public.my_license($1)', [d.orgB]);
  const myOrgs = await q(U.ownerA, 'select * from public.my_organizations()');
  ok('A sees only her own companies', myOrgs.rows.length === 1 && myOrgs.rows[0].organization_id === d.orgA);

  // ===== 2. Privilege escalation inside a company =====
  await blocked('admin cannot insert memberships directly', U.adminA,
    "insert into memberships (organization_id, user_id, role) values ($1,$2,'supervisor')", [d.orgA, U.outsider.id]);
  await blocked('supervisor cannot promote herself directly', U.supA,
    "update memberships set role = 'owner' where user_id = $1", [U.supA.id]);
  await blocked('admin cannot raise the plan', U.adminA, "update organizations set plan_code = 'business' where id = $1", [d.orgA]);
  await blocked('owner cannot raise the plan', U.ownerA, "update organizations set plan_code = 'business' where id = $1", [d.orgA]);
  await blocked('nobody reads licenses table', U.ownerA, 'select * from licenses');
  await blocked('nobody reads billing events', U.ownerA, 'select * from billing_events');
  await blocked('nobody writes audit log', U.ownerA,
    "insert into audit_log (organization_id, action, table_name) values ($1,'insert','x')", [d.orgA]);
  await blocked('nobody calls billing functions', U.ownerA,
    "select billing.apply_hotmart_event('x','PURCHASE_APPROVED',null,'SUB-Z',null,'owner.a@test.dev','business',null)");
  await blocked('nobody calls private access functions with forged org', U.outsider, 'select 1 where app.license_ok($1)', [d.orgA]);
  await rejects('supervisor cannot promote herself via RPC', U.supA, "select public.update_member($1,$2,'admin')", [d.orgA, U.supA.id], /not_allowed/);
  await rejects('supervisor cannot invite', U.supA, "select public.create_invitation($1,'x@test.dev','supervisor')", [d.orgA], /not_allowed/);
  await rejects('admin cannot invite admins', U.adminA, "select public.create_invitation($1,'x@test.dev','admin')", [d.orgA], /only_owner_can_invite_admins/);
  await rejects('admin cannot promote supervisor to admin', U.adminA, "select public.update_member($1,$2,'admin')", [d.orgA, U.supA.id], /only_owner_can_manage_admins/);
  await rejects('admin cannot remove the owner', U.adminA, 'select public.remove_member($1,$2)', [d.orgA, U.ownerA.id], /owner_cannot_be_removed/);
  await rejects('owner cannot remove herself', U.ownerA, 'select public.remove_member($1,$2)', [d.orgA, U.ownerA.id], /owner_cannot_be_removed/);
  await rejects('admin cannot transfer ownership', U.adminA, 'select public.transfer_ownership($1,$2)', [d.orgA, U.adminA.id], /only_owner/);
  await rejects('invite cannot target a foreign warehouse', U.ownerA, "select public.create_invitation($1,'x@test.dev','supervisor',$2)", [d.orgA, [d.whB1]], /warehouse_not_in_organization/);

  // ===== 3. Supervisor scope =====
  await allowed('supervisor sees her warehouse employees', U.supA, 'select * from employees where warehouse_id = $1', [d.whA1], 2);
  await blocked('supervisor cannot see other warehouse employees', U.supA, 'select * from employees where warehouse_id = $1', [d.whA2]);
  await blocked('supervisor cannot see other warehouse attendance', U.supA, 'select * from attendance_records where warehouse_id = $1', [d.whA2]);
  await blocked('supervisor cannot record attendance in other warehouse', U.supA,
    "insert into attendance_records (employee_id, work_date, status) values ($1,'2026-10-02','present')", [d.empA2]);
  await allowed('supervisor records attendance in her warehouse', U.supA,
    "insert into attendance_records (employee_id, work_date, status) values ($1,'2026-10-02','late')", [d.empA1]);
  await blocked('supervisor cannot add employees', U.supA,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'77','X','Y')", [d.orgA, d.whA1]);
  await blocked('supervisor cannot edit employees', U.supA, "update employees set first_name = 'X' where id = $1", [d.empA1]);
  await blocked('supervisor cannot read audit log', U.supA, 'select * from audit_log where organization_id = $1', [d.orgA]);
  await blocked('supervisor cannot read invitations', U.supA, 'select * from invitations where organization_id = $1', [d.orgA]);
  const supMembers = await q(U.supA, 'select * from memberships where organization_id = $1', [d.orgA]);
  ok('supervisor sees only her own membership', supMembers.rows.length === 1 && supMembers.rows[0].user_id === U.supA.id);
  await blocked('supervisor cannot create warehouses', U.supA, "insert into warehouses (organization_id, name) values ($1,'X')", [d.orgA]);

  // ===== 4. Strangers and anonymous visitors =====
  await blocked('outsider sees no employees', U.outsider, 'select * from employees');
  await blocked('outsider sees no companies', U.outsider, 'select * from organizations');
  await rejects('outsider cannot claim without a purchase', U.outsider, "select public.claim_license('Mine')", [], /no_license_for_this_email/);
  const tokOther = (await one(U.ownerA, "select public.create_invitation($1,'someone.else@test.dev','supervisor') as t", [d.orgA], { commit: true })).t;
  await rejects('outsider cannot use an invitation for another email', U.outsider, 'select public.accept_invitation($1)', [tokOther], /invitation_for_another_email/);
  await rejects('invitation tokens are single use', U.supA, 'select public.accept_invitation($1)', [d.tokSup], /invitation_invalid_or_expired/);
  await rejects('unconfirmed email cannot claim a purchase', U.unconf, "select public.claim_license('Mine')", [], /email_not_confirmed/);
  await rejects('a claimed license cannot be claimed again', U.ownerA, "select public.claim_license('Again')", [], /no_license_for_this_email/);
  await blocked('anonymous cannot read employees', 'anon', 'select * from employees');
  await blocked('anonymous cannot read plans', 'anon', 'select * from plans');
  await blocked('anonymous cannot call RPCs', 'anon', 'select * from public.my_organizations()');

  // ===== 5. Platform owner panel =====
  await rejects('super admin panel requires MFA', U.platform, 'select * from public.admin_overview()', [], /not_allowed/);
  await rejects('customers cannot open the super admin panel', U.ownerA, 'select * from public.admin_overview()', [], /not_allowed/, { aal: 'aal2' });
  const overview = await q(U.platform, 'select * from public.admin_overview()', [], { aal: 'aal2' });
  ok('super admin sees totals for every company', overview.rows.length === 2);
  ok('super admin overview carries no employee names',
    !JSON.stringify(overview.rows).match(/Ana|Abel|Aria|Bea|Alpha|Beta/));
  await blocked('super admin has no direct access to employees', U.platform, 'select * from employees', [], { aal: 'aal2' });

  // ===== 6. Integrity =====
  const att = await one(U.ownerA, 'select organization_id, warehouse_id, recorded_by from attendance_records where id = $1', [d.attA1]);
  ok('server fills company, warehouse and author on attendance',
    att.organization_id === d.orgA && att.warehouse_id === d.whA1 && att.recorded_by === U.supA.id);
  const emps = await q(U.ownerA, 'select employee_code, first_attendance_date from employees where organization_id = $1 order by employee_code', [d.orgA]);
  const fa = Object.fromEntries(emps.rows.map(r => [r.employee_code, r.first_attendance_date]));
  ok('NEW detection: first present/late date recorded', fa['1001'] !== null && fa['2001'] !== null);
  ok('NEW detection: absent-only employee not yet "new"', fa['1002'] === null);
  await blocked('same badge twice in one company is rejected', U.ownerA,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'1001','Dup','Dup')", [d.orgA, d.whA1]);
  await run(U.ownerA, c => c.query('delete from attendance_records where id = $1', [d.attA1]), { commit: true });
  const audit = await q(U.ownerA, "select * from audit_log where record_id = $1 and action = 'delete'", [d.attA1]);
  ok('"No Record" (delete) is kept in the audit log with the old value',
    audit.rows.length === 1 && audit.rows[0].old_data.status === 'present' && audit.rows[0].actor_id === U.ownerA.id);

  // ===== 7. License lifecycle (Hotmart) =====
  ok('duplicate webhook event is ignored', await hotmart('evt-b1', 'PURCHASE_APPROVED', 'SUB-B', U.ownerB.email, 'starter', future) === 'duplicate');
  ok('refund cancels the license', await hotmart('evt-b2', 'PURCHASE_REFUNDED', 'SUB-B', U.ownerB.email, null, null, new Date().toISOString()) === 'license_cancelled');
  ok('stale event arriving late is ignored', await hotmart('evt-b0', 'PURCHASE_APPROVED', 'SUB-B', U.ownerB.email, 'starter', future, '2020-01-01T00:00:00Z') === 'stale');
  const licB = await one(U.ownerB, 'select * from public.my_license($1)', [d.orgB]);
  ok('owner sees status only (no email, no Hotmart ids)', licB.status === 'cancelled' && !('buyer_email' in licB));
  await allowed('cancelled: owner can still read to export (30 days)', U.ownerB, 'select * from employees where organization_id = $1', [d.orgB]);
  await blocked('cancelled: owner cannot write', U.ownerB,
    "insert into attendance_records (employee_id, work_date, status) values ($1,'2026-10-03','present')", [d.empB1]);
  await blocked('cancelled: supervisor loses access', U.supB, 'select * from employees where organization_id = $1', [d.orgB]);
  await rejects('cancelled: cannot invite', U.ownerB, "select public.create_invitation($1,'x@test.dev','supervisor')", [d.orgB], /not_allowed/);
  ok('new purchase reactivates', await hotmart('evt-b3', 'PURCHASE_APPROVED', 'SUB-B', U.ownerB.email, 'starter', future, new Date(Date.now() + 1000).toISOString()) === 'license_activated');
  await allowed('reactivated: owner can write again', U.ownerB,
    "insert into attendance_records (employee_id, work_date, status) values ($1,'2026-10-03','present')", [d.empB1]);
  await allowed('reactivated: supervisor back in', U.supB, 'select * from employees where organization_id = $1', [d.orgB]);

  // Late payment: grace, then suspension by the daily job.
  ok('late payment starts grace', await hotmart('evt-b4', 'PURCHASE_DELAYED', 'SUB-B', U.ownerB.email, null, null, new Date(Date.now() + 2000).toISOString()) === 'grace_started');
  await q('superuser', "update licenses set current_period_end = now() - interval '1 day' where provider_subscriber_code = 'SUB-B'", [], { commit: true });
  await allowed('in grace: still has access', U.supB, 'select * from employees where organization_id = $1', [d.orgB]);
  await q('superuser', "update licenses set grace_until = now() - interval '1 minute' where provider_subscriber_code = 'SUB-B'", [], { commit: true });
  await q('service', 'select billing.expire_licenses()', [], { commit: true });
  ok('after grace the license is suspended', (await one(U.ownerB, 'select status from public.my_license($1)', [d.orgB])).status === 'suspended');
  await blocked('suspended: supervisor has no access', U.supB, 'select * from employees where organization_id = $1', [d.orgB]);

  // Cancellation at period end.
  ok('subscription cancellation keeps access until period end', await hotmart('evt-a3', 'SUBSCRIPTION_CANCELLATION', 'SUB-A', U.ownerA.email, null, null, new Date(Date.now() + 3000).toISOString()) === 'cancel_at_period_end');
  await allowed('cancel at period end: still active today', U.supA, 'select * from employees where warehouse_id = $1', [d.whA1]);

  // ===== 8. Plan limits =====
  await hotmart('evt-b5', 'PURCHASE_APPROVED', 'SUB-B', U.ownerB.email, 'starter', future, new Date(Date.now() + 4000).toISOString());
  await q('superuser', "update plans set max_employees = 2 where code = 'starter'", [], { commit: true });
  await allowed('within plan limit: employee added', U.ownerB,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'1002','Ben','Beta')", [d.orgB, d.whB1], 1, { commit: true });
  await rejects('over plan limit: employee rejected', U.ownerB,
    "insert into employees (organization_id, warehouse_id, employee_code, first_name, last_name) values ($1,$2,'1003','Bo','Beta')", [d.orgB, d.whB1], /plan_limit_employees/);
  await rejects('starter plan: second warehouse rejected', U.ownerB, "insert into warehouses (organization_id, name) values ($1,'B2')", [d.orgB], /plan_limit_warehouses/);
  const tokThird = (await one(U.ownerB, "select public.create_invitation($1,$2,'supervisor') as t", [d.orgB, U.outsider.email], { commit: true })).t;
  await rejects('starter plan: third user rejected', U.outsider, 'select public.accept_invitation($1)', [tokThird], /plan_limit_users/);
  await q('superuser', "update plans set max_employees = 50 where code = 'starter'", [], { commit: true });

  // ===== 9. Ownership transfer =====
  await allowed('owner transfers ownership', U.ownerA, 'select public.transfer_ownership($1,$2)', [d.orgA, U.adminA.id], 1, { commit: true });
  const roles = await q('superuser', 'select user_id, role from memberships where organization_id = $1', [d.orgA]);
  const r = Object.fromEntries(roles.rows.map(x => [x.user_id, x.role]));
  ok('exactly one owner after transfer', r[U.adminA.id] === 'owner' && r[U.ownerA.id] === 'admin'
    && roles.rows.filter(x => x.role === 'owner').length === 1);
}

// ---------- main ----------
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
console.log('All tenant-isolation and access-control checks passed.');
