// End-to-end test in a real browser (Chromium emulating an iPhone) against the local stack:
// real Supabase Auth + PostgREST + our migrations + our billing/webhook handlers.
// Runs the seven critical tests of the brief. Hotmart is simulated: the test sends the
// webhook Hotmart would send, signed with the local test token.
//   tests/e2e/run.sh
import { chromium, devices } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:54321';
const MAIL = path.join(os.homedir(), '.itt-localstack/mail');
const SHOTS = process.argv[2] || 'tests/e2e/screenshots';
const HOTTOK = 'local-test-hottok';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(SHOTS, { recursive: true });

const A = { email: 'parent.a@example.com', password: 'Familia-Segura-2026' };
const B = { email: 'parent.b@example.com', password: 'Otra-Familia-2026' };

const passed = [], failed = [];
const check = (name, cond, detail = '') => (cond ? passed : failed).push(name + (!cond && detail ? ` — ${detail}` : ''));
const psql = sql => execFileSync('psql', ['-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', 'itt_e2e', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql]).toString().trim();
const anonKey = execFileSync('node', ['scripts/localstack/keys.mjs', 'anon'], { env: { ...process.env, LS_JWT_SECRET: 'local-dev-only-jwt-secret-0123456789abcdef' } }).toString().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function mailLink(to, after, timeout = 15000) {
  const end = Date.now() + timeout;
  const tag = to.replace('@', '_at_');
  while (Date.now() < end) {
    const files = fs.readdirSync(MAIL).filter(f => f.endsWith(`_${tag}.eml`) && parseFloat(f) * 1000 > after).sort().reverse();
    for (const f of files) {
      const raw = fs.readFileSync(path.join(MAIL, f), 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      const m = raw.match(/href="([^"]*\/verify\?[^"]*)"/);
      if (m) return m[1].replace(/&amp;/g, '&');
    }
    execFileSync('sleep', ['0.3']);
  }
  throw new Error(`no email for ${to}`);
}

async function webhook(event, data) {
  const res = await fetch(`${API}/functions/v1/hotmart-webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hotmart-hottok': HOTTOK },
    body: JSON.stringify({ id: `evt-${event}-${Date.now()}`, event, version: '2.0.0', creation_date: Date.now(), data: { product: { id: 4242 }, ...data } }),
  });
  return { status: res.status, body: await res.json() };
}

async function noHorizontalScroll(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`iPhone: no sideways scrolling on ${name}`, over <= 1, `${over}px too wide`);
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }

const browser = await chromium.launch({ executablePath: CHROME });
const iphone = devices['iPhone 13'];
try {
  // =========================================================================
  // Landing → sign up → confirm → onboarding (on an iPhone)
  // =========================================================================
  const ctxA = await browser.newContext({ ...iphone, locale: 'es-EC', timezoneId: 'America/Guayaquil' });
  const page = await ctxA.newPage();
  page.on('dialog', d => d.accept());
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));

  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('landing headline', (await page.textContent('h1')).includes('Deja de buscar entre mensajes del colegio.'));
  check('landing says not affiliated with Idukay', (await page.textContent('footer')).includes('No está afiliado'));
  await shot(page, '01-landing');
  await noHorizontalScroll(page, 'landing');

  await page.getByRole('link', { name: /Empieza gratis por 7 días/ }).first().click();
  await page.waitForURL('**/signup');
  await page.getByLabel('Nombre del padre, madre o representante').fill('Parent A');
  await page.getByLabel('Correo electrónico').fill(A.email);
  await page.getByLabel('Teléfono').fill('+593 99 123 4567');
  await page.getByLabel('Contraseña').fill(A.password);
  await page.getByLabel('Nombre del hijo/a').fill('Maria');
  await page.getByLabel('Colegio').first().fill('Colegio Uno');
  await page.getByRole('button', { name: '+ Agregar otro hijo' }).click();
  await page.getByLabel('Nombre del hijo/a').nth(1).fill('Lucas');
  const pwFields = await page.locator('input[type=password]').count();
  check('sign-up never asks for an Idukay password (one password field)', pwFields === 1, `${pwFields}`);
  await shot(page, '02-signup');
  await page.getByRole('checkbox').check();
  const sentAt = Date.now() - 1000;
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByTestId('check-email').waitFor();
  check('sign-up asks to confirm e-mail', true);

  await page.goto(mailLink(A.email, sentAt));
  await page.getByTestId('onboarding-step-1').waitFor({ timeout: 15000 });
  check('confirmation link opens onboarding', true);
  await shot(page, '03-onboarding-welcome');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByTestId('onboarding-step-2').waitFor();
  check('children from the sign-up form are there', (await page.textContent('.onb')).includes('Maria') && (await page.textContent('.onb')).includes('Lucas'));
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByTestId('onboarding-step-3').waitFor();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByTestId('onboarding-step-4').waitFor();
  await page.getByTestId('paste-input').fill('MARIA\nMatemática: Math homework para hoy\nLucas\nLengua: leer capítulo 3 hoy\nCiencias: maqueta para mañana');
  await page.getByRole('button', { name: /Organizar tareas/ }).click();
  await page.getByTestId('review').waitFor();
  const reviewRows = await page.locator('.review-row').count();
  check('paste parser found 3 tasks to review', reviewRows === 3, `${reviewRows}`);
  await shot(page, '04-onboarding-review');
  await page.getByRole('button', { name: 'Guardar 3 tareas' }).click();
  await page.getByTestId('onboarding-step-5').waitFor();
  check('onboarding ends with the trial message', (await page.textContent('.onb')).includes('Tu prueba gratis de 7 días empieza hoy.'));
  await page.getByRole('button', { name: 'Ir a mi panel' }).click();
  await page.waitForURL('**/app');
  await page.getByTestId('kid-Maria').waitFor();
  await shot(page, '05-dashboard');
  await noHorizontalScroll(page, 'dashboard');
  check('trial banner shows 7 days', (await page.getByTestId('trial-banner').textContent()).includes('7 días'));
  check('dashboard greets the parent', (await page.textContent('h1')).includes('Parent'));

  // =========================================================================
  // TEST 5 — switching children shows only that child's tasks
  // =========================================================================
  await page.goto(`${BASE}/app/today`);
  await page.getByRole('tab', { name: 'Maria' }).click();
  await page.locator('.task-title', { hasText: 'Math homework' }).waitFor();
  check('TEST 5: Maria selected → her task shown', await page.locator('.task-title', { hasText: 'Math homework' }).isVisible());
  check('TEST 5: Maria selected → Lucas task hidden', (await page.locator('.task-title', { hasText: 'Leer capítulo 3' }).count()) === 0);
  await page.getByRole('tab', { name: 'Lucas' }).click();
  await page.locator('.task-title', { hasText: 'Leer capítulo 3' }).waitFor();
  check('TEST 5: Lucas selected → Maria task hidden', (await page.locator('.task-title', { hasText: 'Math homework' }).count()) === 0);
  await page.getByRole('tab', { name: 'Todos los hijos' }).click();

  // =========================================================================
  // TEST 1 — User B never sees Maria or her task
  // =========================================================================
  const signB = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: B.email, password: B.password, data: { full_name: 'Parent B', children: [{ name: 'Pedro' }] } }) });
  check('User B signs up', signB.ok);
  psql(`update auth.users set email_confirmed_at = now() where email = '${B.email}'`);
  psql(`update public.profiles set onboarded_at = now() where id = (select id from auth.users where email = '${B.email}')`);
  const ctxB = await browser.newContext({ ...iphone, locale: 'es-EC' });
  const pageB = await ctxB.newPage();
  pageB.on('dialog', d => d.accept());
  await pageB.goto(`${BASE}/login`);
  await pageB.getByLabel('Correo electrónico').fill(B.email);
  await pageB.getByLabel('Contraseña').fill(B.password);
  await pageB.getByRole('button', { name: 'Ingresar' }).click();
  await pageB.waitForURL('**/app');
  await pageB.getByTestId('kid-Pedro').waitFor();
  for (const p of ['/app', '/app/today', '/app/week', '/app/calendar', '/app/children', '/app/completed']) {
    await pageB.goto(BASE + p);
    await pageB.locator('main').waitFor();
    await sleep(400);
    const text = await pageB.textContent('main');
    check(`TEST 1: User B sees no Maria / Math homework on ${p}`, !text.includes('Maria') && !text.includes('Math homework'));
  }
  const taskId = psql("select id from public.tasks where title = 'Math homework'");
  const tokB = await pageB.evaluate(() => JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]).access_token);
  const hdr = { apikey: anonKey, authorization: `Bearer ${tokB}`, 'content-type': 'application/json', prefer: 'return=representation' };
  const peek = await (await fetch(`${API}/rest/v1/tasks?id=eq.${taskId}`, { headers: hdr })).json();
  check('TEST 1: User B reading A\'s task id through the API gets nothing', Array.isArray(peek) && peek.length === 0, JSON.stringify(peek));
  const poke = await (await fetch(`${API}/rest/v1/tasks?id=eq.${taskId}`, { method: 'PATCH', headers: hdr, body: JSON.stringify({ title: 'hacked' }) })).json();
  check('TEST 1: User B changing A\'s task through the API changes nothing', Array.isArray(poke) && poke.length === 0 && psql(`select title from public.tasks where id = '${taskId}'`) === 'Math homework');
  const kidsB = await (await fetch(`${API}/rest/v1/children?select=name`, { headers: hdr })).json();
  check('TEST 1: User B lists only Pedro', JSON.stringify(kidsB) === '[{"name":"Pedro"}]', JSON.stringify(kidsB));

  // =========================================================================
  // TEST 6 — ticking task #15 keeps the page exactly where it was
  // =========================================================================
  const userA = psql(`select id from auth.users where email = '${A.email}'`);
  const maria = psql(`select id from public.children where name = 'Maria' and user_id = '${userA}'`);
  psql(`insert into public.tasks (user_id, child_id, subject, title, due_date, created_at)
        select '${userA}', '${maria}', 'Lectura', 'Tarea número ' || g, (now() at time zone 'America/Guayaquil')::date, now() + g * interval '1 second'
        from generate_series(1, 30) g`);
  await page.goto(`${BASE}/app/today`);
  await page.getByRole('tab', { name: 'Maria' }).click();
  const row15 = page.locator('.task-row', { has: page.locator('.task-title', { hasText: /^Tarea número 15$/ }) });
  await row15.waitFor();
  await row15.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await sleep(300);
  const before = await page.evaluate(() => window.scrollY);
  const boxBefore = await row15.boundingBox();
  check('TEST 6: the page is scrolled down to task #15', before > 500, `scrollY ${before}`);
  await row15.locator('button.tick').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.task-row')].some(r => r.textContent.includes('Tarea número 15') && r.querySelector('.tick[aria-pressed="true"]')));
  await sleep(1200);   // let the server answer and React re-render
  const after = await page.evaluate(() => window.scrollY);
  const boxAfter = await row15.boundingBox();
  check('TEST 6: scroll position unchanged after ticking', Math.abs(after - before) <= 1, `${before} → ${after}`);
  check('TEST 6: task #15 did not move on screen', Math.abs(boxAfter.y - boxBefore.y) <= 1, `${boxBefore.y} → ${boxAfter.y}`);
  check('TEST 6: task #15 saved as completed', psql("select status from public.tasks where title = 'Tarea número 15'") === 'completed');
  await shot(page, '06-today-after-tick');
  // un-tick and open/close the detail sheet: still no jump
  await row15.locator('button.tick').click();
  await sleep(800);
  await row15.locator('button.task-main').click();
  await page.getByRole('dialog').waitFor();
  await shot(page, '07-task-sheet');
  await page.getByRole('button', { name: 'En progreso' }).click();
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(300);
  const afterSheet = await page.evaluate(() => window.scrollY);
  check('TEST 6: opening and closing a task keeps the position', Math.abs(afterSheet - before) <= 1, `${before} → ${afterSheet}`);
  check('status history recorded (pending → completed → pending → in progress)',
    psql("select string_agg(to_status::text, ',' order by h.id) from public.task_status_history h join public.tasks t on t.id = h.task_id where t.title = 'Tarea número 15'") === 'pending,completed,pending,in_progress');

  // =========================================================================
  // TEST 7 — every screen usable on an iPhone
  // =========================================================================
  for (const [p, name] of [['/app/week', '08-week'], ['/app/calendar', '09-calendar'], ['/app/children', '10-children'], ['/app/add', '11-add-paste'],
    ['/app/add?tab=manual', '12-add-manual'], ['/app/completed', '13-completed'], ['/app/overdue', '14-overdue'], ['/app/settings', '15-settings'], ['/app/subscription', '16-subscription']]) {
    await page.goto(BASE + p);
    await page.locator('main h1').first().waitFor();
    await sleep(300);
    await shot(page, name);
    await noHorizontalScroll(page, p);
  }
  const navBox = await page.locator('.bottom-nav').boundingBox();
  check('TEST 7: bottom navigation pinned to the bottom of the iPhone screen', navBox && Math.abs(navBox.y + navBox.height - iphone.viewport.height) <= 1, JSON.stringify(navBox));
  const tickBox = await page.goto(`${BASE}/app/today`).then(() => page.locator('button.tick').first().boundingBox());
  check('TEST 7: tick targets are at least 44×44 px', tickBox.width >= 44 && tickBox.height >= 44, JSON.stringify(tickBox));
  await page.goto(`${BASE}/app/week`);
  await page.getByTestId('week-strip').waitFor();
  check('week view shows Monday–Friday', (await page.locator('.day-btn').count()) === 5);
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('dialog').waitFor();
  await shot(page, '17-more-menu');
  await page.keyboard.press('Escape');

  // =========================================================================
  // TEST 2 — trial expires → premium locked, data kept
  // =========================================================================
  const tasksBefore = psql(`select count(*) from public.tasks where user_id = '${userA}'`);
  psql(`update public.trial_periods set ends_at = now() - interval '1 minute' where user_id = '${userA}'`);
  await page.goto(`${BASE}/app`);
  await page.getByTestId('paywall').waitFor();
  check('TEST 2: expired trial shows the paywall', (await page.textContent('[data-testid=paywall]')).includes('Tu prueba gratis de 7 días terminó.'));
  check('TEST 2: paywall offers $2.99/month', (await page.textContent('[data-testid=paywall]')).includes('$2.99'));
  await shot(page, '18-paywall');
  await page.goto(`${BASE}/app/today`);
  await page.getByTestId('paywall').waitFor();
  check('TEST 2: every premium screen is locked', true);
  check('TEST 2: no data was deleted', psql(`select count(*) from public.tasks where user_id = '${userA}'`) === tasksBefore);
  const sneak = await page.evaluate(async ([api, key]) => {
    const tok = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]).access_token;
    const r = await fetch(`${api}/rest/v1/tasks?title=eq.Math%20homework`, { method: 'PATCH', headers: { apikey: key, authorization: `Bearer ${tok}`, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'completed' }) });
    return r.status;
  }, [API, anonKey]);
  check('TEST 2: the database also refuses writes from a locked account', sneak >= 400 && psql("select status from public.tasks where title = 'Math homework'") === 'pending', `HTTP ${sneak}`);

  // =========================================================================
  // TEST 3 — verified Hotmart payment → ACTIVE
  // =========================================================================
  await page.goto(`${BASE}/app`);
  await page.getByRole('button', { name: 'Continuar con Premium' }).click();
  await page.waitForURL('**/fake-hotmart/checkout**');
  const checkoutUrl = new URL(page.url());
  const sck = checkoutUrl.searchParams.get('sck');
  check('TEST 3: checkout goes to Hotmart with our token and e-mail', /^[0-9a-f]{36}$/.test(sck ?? '') && checkoutUrl.searchParams.get('email') === A.email);
  check('TEST 3: nothing changes before Hotmart confirms', psql(`select status from public.subscriptions where user_id = '${userA}'`) === 'TRIAL');
  const bad = await fetch(`${API}/functions/v1/hotmart-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hotmart-hottok': 'wrong' }, body: '{}' });
  check('TEST 3: a forged webhook is refused', bad.status === 401);
  const nextCharge = Date.now() + 30 * 864e5;
  const ok = await webhook('PURCHASE_APPROVED', { buyer: { email: A.email }, purchase: { transaction: 'HP-1', status: 'APPROVED', date_next_charge: nextCharge, price: { value: 2.99, currency_value: 'USD' }, origin: { sck } }, subscription: { subscriber: { code: 'SUB-A' }, status: 'ACTIVE' } });
  check('TEST 3: webhook accepted', ok.status === 200 && ok.body.outcome === 'activated', JSON.stringify(ok));
  await page.goto(`${BASE}/app/subscription`);
  await page.getByTestId('sub-status').waitFor();
  check('TEST 3: subscription shows Active', (await page.getByTestId('sub-status').textContent()).includes('Activa'));
  await shot(page, '19-subscription-active');
  await page.goto(`${BASE}/app`);
  await page.getByTestId('kid-Maria').waitFor();
  check('TEST 3: the app is unlocked', (await page.getByTestId('paywall').count()) === 0);

  // =========================================================================
  // TEST 4 — cancellation → access until the paid period ends, then locked
  // =========================================================================
  const cancel = await webhook('SUBSCRIPTION_CANCELLATION', { subscriber: { code: 'SUB-A', email: A.email }, date_next_charge: nextCharge });
  check('TEST 4: cancellation webhook accepted', cancel.body.outcome === 'cancelled', JSON.stringify(cancel));
  await page.goto(`${BASE}/app/subscription`);
  await page.getByTestId('sub-status').waitFor();
  check('TEST 4: shows Cancelled with access until the end of the period', (await page.getByTestId('sub-status').textContent()).includes('Cancelada') && (await page.textContent('[data-testid=subscription-card]')).includes('Tienes acceso hasta'));
  await page.goto(`${BASE}/app`);
  await page.getByTestId('kid-Maria').waitFor();
  check('TEST 4: still usable during the paid period', (await page.getByTestId('paywall').count()) === 0);
  psql(`update public.subscriptions set current_period_end = now() - interval '1 second' where user_id = '${userA}'`);
  psql('select billing.expire_subscriptions()');
  await page.goto(`${BASE}/app`);
  await page.getByTestId('paywall').waitFor();
  check('TEST 4: after the period ends the account is locked', (await page.textContent('[data-testid=paywall]')).includes('Tu suscripción terminó.'));
  check('TEST 4: status is EXPIRED', psql(`select status from public.subscriptions where user_id = '${userA}'`) === 'EXPIRED');

  // =========================================================================
  // Admin dashboard (aggregates only)
  // =========================================================================
  psql(`insert into public.platform_admins (user_id) values ('${userA}')`);
  await page.goto(`${BASE}/app/admin`);
  await page.getByTestId('kpi-total_users').waitFor();
  const adminText = await page.textContent('main');
  check('admin dashboard shows totals', (await page.getByTestId('kpi-total_users').textContent()).startsWith('2'));
  check('admin dashboard shows no children names or task text', !/Maria|Lucas|Pedro|Math homework/.test(adminText));
  await shot(page, '20-admin');
  await noHorizontalScroll(page, '/app/admin');
  await pageB.goto(`${BASE}/app/admin`);
  await sleep(600);
  check('a normal parent cannot open the admin dashboard', (await pageB.textContent('main')).includes('solo para el dueño'));

  // =========================================================================
  // Account deletion (User B)
  // =========================================================================
  await pageB.goto(`${BASE}/app/settings`);
  await pageB.getByText('Eliminar mi cuenta').first().click();
  await pageB.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
  await pageB.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await pageB.waitForURL(u => !u.pathname.startsWith('/app'));
  check('account deletion removes the user and their children', psql(`select count(*) from auth.users where email = '${B.email}'`) === '0' && psql("select count(*) from public.children where name = 'Pedro'") === '0');

  // Desktop screenshots
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'es-EC' });
  const dp = await desk.newPage();
  await dp.goto(BASE);
  await dp.getByRole('heading', { level: 1 }).waitFor();
  await dp.screenshot({ path: path.join(SHOTS, '21-landing-desktop.png') });
  check('no JavaScript errors on the iPhone session', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) {
  failed.push(`crashed: ${e.stack || e}`);
} finally {
  await browser.close();
}

console.log(`\n${passed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log('  ✗ ' + f);
process.exit(failed.length ? 1 : 0);
