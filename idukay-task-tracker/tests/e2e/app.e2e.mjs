// End-to-end test in a real browser against the local stack (real Supabase Auth + PostgREST +
// our migrations + our sync handler), with the demo data from scripts/seed-demo.mjs.
// Parents use an emulated iPhone; the administrator uses a desktop browser.
//   tests/e2e/run.sh
import { chromium, devices } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:54321';
const SHOTS = process.argv[2] || 'tests/e2e/screenshots';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(SHOTS, { recursive: true });

const passed = [], failed = [];
const check = (name, cond, detail = '') => (cond ? passed : failed).push(name + (!cond && detail ? ` — ${detail}` : ''));
const psql = sql => execFileSync('psql', ['-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', 'itt_e2e', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql]).toString().trim();
const anonKey = execFileSync('node', ['scripts/localstack/keys.mjs', 'anon'], { env: { ...process.env, LS_JWT_SECRET: 'local-dev-only-jwt-secret-0123456789abcdef' } }).toString().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
async function noSideScroll(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`iPhone: no sideways scrolling on ${name}`, over <= 1, `${over}px`);
}
const FORBIDDEN = /\b(Editar|Eliminar|Borrar|Crear tarea|Modificar|Cambiar fecha|Edit|Delete|Create Task|Modify|Change Date)\b/;
const COMMERCIAL = /\$\s?\d|Hotmart|precio|suscrip|prueba gratis|pricing|subscription|free trial|paywall|pagar/i;

const browser = await chromium.launch({ executablePath: CHROME });
const iphone = devices['iPhone 13'];
try {
  // =========================================================================
  // Public page: free, no commercial content
  // =========================================================================
  const pub = await (await browser.newContext({ ...iphone, locale: 'es-EC' })).newPage();
  await pub.goto(BASE);
  await pub.getByRole('heading', { level: 1 }).waitFor();
  const pubText = await pub.textContent('body');
  check('welcome says it is free for parents', pubText.includes('GRATIS PARA PADRES'));
  check('no pricing, subscription, Hotmart or trial anywhere on the welcome page', !COMMERCIAL.test(pubText), pubText.match(COMMERCIAL)?.[0]);
  check('no sign-up form for parents', (await pub.locator('input[type=password]').count()) === 0);
  await shot(pub, '01-welcome');
  await noSideScroll(pub, 'welcome');

  // =========================================================================
  // ADMIN (desktop): status, sync, students, links, paste homework
  // =========================================================================
  const admin = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-EC', timezoneId: 'America/Guayaquil' })).newPage();
  admin.on('dialog', d => d.accept());
  await admin.goto(`${BASE}/admin`);
  await admin.getByLabel('Correo').fill('demo.admin@example.com');
  await admin.getByLabel('Contraseña').fill('Demo-Admin-2026');
  await admin.getByRole('button', { name: 'Ingresar' }).click();
  await admin.getByRole('heading', { name: 'Cuarto Grado de Educación General Básica' }).waitFor();
  check('admin sees the class 4.º EGB "A"', true);
  await admin.getByRole('button', { name: /Sincronizar ahora/ }).click();
  await admin.getByTestId('sync-result').waitFor();
  check('sync reports honestly that no Idukay integration is configured', (await admin.getByTestId('sync-result').textContent()).includes('Sin configurar'));
  await shot(admin, '10-admin-status');

  await admin.goto(`${BASE}/admin/estudiantes`);
  await admin.getByLabel('Nombre', { exact: true }).fill('Maria');
  await admin.getByRole('button', { name: 'Agregar estudiante' }).click();
  await admin.locator('label.check', { hasText: 'Maria' }).waitFor();
  const makeLink = async (label, kids) => {
    await admin.getByLabel(/Nombre del enlace/).fill(label);
    for (const k of kids) await admin.locator('label.check', { hasText: k }).locator('input').check();
    await admin.getByRole('button', { name: 'Crear enlace' }).click();
    await admin.getByTestId('new-link-url').waitFor();
    const url = (await admin.getByTestId('new-link-url').textContent()).trim();
    await admin.reload(); await admin.getByLabel(/Nombre del enlace/).waitFor();
    return url;
  };
  const linkGael = await makeLink('Familia de Gael (prueba)', ['Gael']);
  const linkMaria = await makeLink('Familia de Maria', ['Maria']);
  check('admin gets a private parent link', /\/v\/[A-Za-z0-9_-]{32}$/.test(linkGael), linkGael);
  check('the link token is not stored in the database', psql(`select count(*) from public.viewer_links where token_hash = '${linkGael.split('/v/')[1]}'`) === '0');

  await admin.goto(`${BASE}/admin/agregar`);
  const paste = `Science
Plant parts
Fecha de entrega: ${psql("select to_char((now() at time zone 'America/Guayaquil')::date + 2, 'YYYY-MM-DD')")}
Label the parts of a plant: root, stem, leaves and flower.
Traducción: Señala las partes de una planta: raíz, tallo, hojas y flor.

Matemática: Sumas y restas de la página 50 para mañana`;
  await admin.getByTestId('admin-paste').fill(paste);
  await admin.getByRole('button', { name: /Organizar tareas/ }).click();
  await admin.getByTestId('admin-review').waitFor();
  const reviewText = await admin.getByTestId('admin-review').innerHTML();
  check('paste: Science detected as ENGLISH and Matemática as ESPAÑOL',
    (await admin.locator('[data-testid=admin-review] select').nth(0).inputValue()) === 'en' && (await admin.locator('[data-testid=admin-review] select').nth(1).inputValue()) === 'es');
  check('paste: Spanish explanation kept apart from the original', reviewText.includes('💬 Señala las partes'));
  await shot(admin, '11-admin-review');
  await admin.getByRole('button', { name: /Publicar 2 tareas/ }).click();
  await admin.getByText('2 publicadas · 0 duplicadas omitidas').waitFor();
  check('admin publishes pasted homework', true);
  await admin.getByTestId('admin-paste').fill(paste);
  await admin.getByRole('button', { name: /Organizar tareas/ }).click();
  await admin.getByRole('button', { name: /Publicar 2 tareas/ }).click();
  await admin.getByText('0 publicadas · 2 duplicadas omitidas').waitFor();
  check('pasting the same homework again creates no duplicates', psql("select count(*) from public.homework where title = 'Plant parts'") === '1');

  // =========================================================================
  // PARENT (iPhone): open the private link
  // =========================================================================
  const ctx = await browser.newContext({ ...iphone, locale: 'es-EC', timezoneId: 'America/Guayaquil' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto(linkGael);
  await page.waitForURL('**/hoy');
  check('the token leaves the address bar after opening', !page.url().includes('/v/'));
  await page.getByTestId('today-counter').waitFor();
  const counter = await page.getByTestId('today-counter').textContent();
  const nToday = Number(counter.match(/(\d+) TAREAS?/)?.[1]);
  check('Today shows "Gael — 4.º EGB — Paralelo A"', counter.includes('Gael — 4.º EGB — Paralelo A'), counter);
  check('Today counter shows a number of assignments', nToday >= 4, counter);
  check('Today shows completed / pending / overdue', /completad/.test(counter) && /pendiente/.test(counter) && /vencida/.test(counter));
  check('one-sentence summary', (await page.getByTestId('today-summary').textContent()).startsWith(`Hoy Gael tiene ${nToday} tareas.`));
  check('NEW homework banner', (await page.getByTestId('new-banner').textContent()).includes('Hoy se agregó tarea de'));
  check('last updated is shown', (await page.getByTestId('last-updated').textContent()).includes('Última actualización'));
  await shot(page, '02-today');
  await noSideScroll(page, 'today');

  const bodyText = await page.textContent('body');
  check('parents see no edit / delete / create controls', !FORBIDDEN.test(bodyText), bodyText.match(FORBIDDEN)?.[0]);
  check('parents see nothing commercial', !COMMERCIAL.test(bodyText), bodyText.match(COMMERCIAL)?.[0]);
  check('parent navigation is exactly Today · Last 2 Weeks · Archive', (await page.locator('.viewer-tabs a').allTextContents()).join('|') === '🏠 Hoy|📅 Últimas 2 semanas|📁 Archivo');

  const la = page.locator('[data-testid=hw-card]', { hasText: 'Read Chapter 4' });
  const mat = page.locator('[data-testid=hw-card]', { hasText: 'Resolver ejercicios 15–20' });
  check('English subject shows 🇺🇸 ENGLISH', (await la.getByTestId('lang-badge').textContent()) === '🇺🇸 ENGLISH');
  check('Spanish subject shows 🇪🇸 ESPAÑOL', (await mat.getByTestId('lang-badge').textContent()) === '🇪🇸 ESPAÑOL');
  check('card shows start and due dates', /Inicio: .*Entrega: /s.test(await la.textContent()));

  // Personal completion mark — scroll position and official record unchanged
  await mat.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await sleep(200);
  const y0 = await page.evaluate(() => window.scrollY);
  const box0 = await mat.boundingBox();
  await mat.getByRole('button', { name: /Marcar como completada/ }).click();
  await sleep(500);
  const y1 = await page.evaluate(() => window.scrollY);
  const box1 = await mat.boundingBox();
  check('marking completed keeps the scroll position', Math.abs(y1 - y0) <= 1, `${y0} → ${y1}`);
  check('marking completed does not move the card', Math.abs(box1.y - box0.y) <= 1, `${box0.y} → ${box1.y}`);
  check('counter updates after marking', /🟢 1 completada/.test(await page.getByTestId('today-counter').textContent()));
  check('the official homework did not change', psql("select h.revision = 1 and not exists (select 1 from public.homework_revisions r where r.homework_id = h.id) from public.homework h where title = 'Resolver ejercicios 15–20'") === 't');
  await page.reload();
  await page.getByTestId('today-counter').waitFor();
  check('the personal mark stays on this device', /🟢 1 completada/.test(await page.getByTestId('today-counter').textContent()));

  // Detail page: original English homework + separate Spanish explanation
  await la.getByRole('link', { name: 'Ver detalles' }).click();
  await page.getByTestId('hw-detail').waitFor();
  const detail = await page.getByTestId('hw-detail').textContent();
  check('detail: "Tarea — EN INGLÉS" with the original instructions', detail.includes('Tarea — EN INGLÉS') && (await page.getByTestId('original').textContent()).startsWith('Read Chapter 4 of your reader'));
  check('detail: the student must answer in English', (await page.getByTestId('english-banner').textContent()).includes('EN INGLÉS'));
  check('detail: Spanish explanation shown separately, original not replaced', (await page.getByTestId('parent-explanation').textContent()).startsWith('Lee el capítulo 4'));
  check('detail: start and due dates', detail.includes('Inicio') && detail.includes('Entrega'));
  check('detail: no edit controls', !FORBIDDEN.test(detail));
  await shot(page, '03-detail-english');
  await noSideScroll(page, 'detail');
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByTestId('today-counter').waitFor();

  // Last 2 weeks
  await page.getByRole('link', { name: /Últimas 2 semanas/ }).click();
  await page.getByTestId('week-strip').waitFor();
  check('this week shows Monday–Friday with counts', (await page.locator('[data-testid=week-strip] .day-btn').count()) === 5);
  const fiveAgo = psql("select ((now() at time zone 'America/Guayaquil')::date - 5)::text");
  const dayBtn = page.locator(`[data-day="${fiveAgo}"]`);
  await dayBtn.click();
  await page.locator('[data-testid=hw-card]', { hasText: 'Leyendas tradicionales' }).waitFor();
  check('a day from last week shows its homework', true);
  check('days older than 14 are not offered', (await page.locator(`[data-day="${psql("select ((now() at time zone 'America/Guayaquil')::date - 15)::text")}"]`).count()) === 0);
  await shot(page, '04-two-weeks');
  await noSideScroll(page, 'last 2 weeks');

  // Archive
  await page.getByRole('link', { name: /Archivo/ }).click();
  await page.getByTestId('archive-month').waitFor();
  const months = await page.locator('[data-testid=archive-month] option').count();
  let foundOld = false;
  for (let i = 0; i < months && !foundOld; i++) {
    await page.locator('[data-testid=archive-month]').selectOption({ index: i });
    await sleep(500);
    foundOld = (await page.locator('[data-testid=hw-card]', { hasText: 'Taller de divisiones' }).count()) > 0;
  }
  check('archive keeps homework older than two weeks', foundOld);
  check('archive is grouped by week', (await page.getByTestId('archive-week').count()) >= 1 && (await page.getByTestId('archive-week').first().textContent()).startsWith('Semana del'));
  check('archived items say Archivada', (await page.locator('[data-testid=hw-card]', { hasText: 'Taller de divisiones' }).textContent()).includes('Archivada'));
  await page.getByTestId('archive-search').fill('divisiones');
  await sleep(900);
  check('archive search', (await page.locator('[data-testid=hw-card]').count()) === 1);
  await shot(page, '05-archive');
  await noSideScroll(page, 'archive');
  await page.locator('[data-testid=hw-card]').first().getByRole('link', { name: 'Ver detalles' }).click();
  await page.getByTestId('hw-detail').waitFor();
  check('archived homework opens with its original details', (await page.getByTestId('original').textContent()).includes('Resolver 10 divisiones'));

  // Family link with two children: never mixed
  const fam = await (await browser.newContext({ ...iphone, locale: 'es-EC', timezoneId: 'America/Guayaquil' })).newPage();
  const famLink = process.env.FAMILY_LINK;
  if (famLink) {
    await fam.goto(famLink); await fam.waitForURL('**/hoy');
    await fam.getByRole('tab', { name: 'Edric' }).click();
    await sleep(800);
    const edricText = await fam.textContent('main');
    check('child selection: Edric sees only his homework', edricText.includes('Tablas de multiplicar (demo)') && !edricText.includes('Read Chapter 4'));
    await fam.getByRole('tab', { name: 'Gael' }).click();
    await sleep(800);
    check('child selection: Gael sees only his homework', !(await fam.textContent('main')).includes('Tablas de multiplicar (demo)'));
    await shot(fam, '06-family-two-children');
  }

  // Another family: isolation, then revocation
  const other = await (await browser.newContext({ ...iphone, locale: 'es-EC' })).newPage();
  await other.goto(linkMaria); await other.waitForURL('**/hoy');
  await other.getByTestId('today-counter').waitFor();
  const otherText = await other.textContent('body');
  check('another family sees only their child', otherText.includes('Maria') && !otherText.includes('Gael') && !otherText.includes('Edric'));
  check('homework is the same for every family of the class', otherText.includes('Read Chapter 4'));
  await admin.goto(`${BASE}/admin/estudiantes`);
  await admin.locator('.card', { hasText: 'Familia de Maria' }).getByRole('button', { name: 'Revocar' }).click();
  await sleep(600);
  await other.reload();
  await other.getByTestId('invalid-link').waitFor();
  check('a revoked link stops working', true);

  // Direct API attempts with the public key
  const h = { apikey: anonKey, 'content-type': 'application/json' };
  const r1 = await fetch(`${API}/rest/v1/homework?select=title`, { headers: h });
  check('the public key cannot list homework', r1.status === 401 || r1.status === 403, `HTTP ${r1.status}`);
  const r2 = await fetch(`${API}/rest/v1/homework?title=eq.Plant%20parts`, { method: 'PATCH', headers: h, body: JSON.stringify({ title: 'hacked' }) });
  check('the public key cannot change homework', r2.status >= 400 && psql("select title from public.homework where title like 'Plant%'") === 'Plant parts', `HTTP ${r2.status}`);
  const r3 = await fetch(`${API}/rest/v1/rpc/viewer_homework`, { method: 'POST', headers: h, body: JSON.stringify({ p_token: 'x'.repeat(32), p_student: psql("select id from public.students where first_name = 'Gael'"), p_from: null, p_to: null }) });
  check('a guessed token gets nothing', (await r3.text()) === 'null');

  // Admin correction is versioned and seen by every parent
  const laId = psql("select id from public.homework where title = 'Read Chapter 4 and answer questions 1–5'");
  await admin.goto(`${BASE}/admin/tareas/${laId}`);
  await admin.getByLabel(/Tarea \(título\)/).fill('Read Chapter 4 and answer questions 1–6');
  await admin.getByRole('button', { name: 'Guardar' }).click();
  await admin.waitForURL('**/admin/tareas');
  check('admin correction keeps the previous version', psql(`select count(*) from public.homework_revisions where homework_id = '${laId}'`) === '1');
  await page.goto(`${BASE}/tarea/${laId}`);
  await page.getByTestId('hw-detail').waitFor();
  check('parents see the corrected text and a correction note', (await page.textContent('main')).includes('1–6') && (await page.textContent('main')).includes('corrigió'));

  check('no JavaScript errors in the parent app', jsErrors.length === 0, jsErrors.join(' | '));
} catch (e) {
  failed.push(`crashed: ${e.stack || e}`);
} finally {
  await browser.close();
}
console.log(`\n${passed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log('  ✗ ' + f);
process.exit(failed.length ? 1 : 0);
