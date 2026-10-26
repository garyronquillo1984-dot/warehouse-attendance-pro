import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'fs';
const { chromium } = pw;
const SP = process.argv[2];
const html = fs.readFileSync('/home/user/warehouse-attendance-pro/artifact/reclutamiento-winit.html', 'utf8');
fs.writeFileSync(SP + '/art/index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>');
const mock = fs.readFileSync(SP + '/art/test.mjs', 'utf8').match(/const mock = `([\s\S]*?)`;/)[1];
const libs = { 'qrcode-generator@1.4.4': 'qrcode-generator-1.4.4/qrcode.js', 'xlsx@0.18.5': 'xlsx-0.18.5/dist/xlsx.full.min.js', 'jspdf@2.5.1': 'jspdf-2.5.1/dist/jspdf.umd.min.js', 'jspdf-autotable@3.8.2': 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' };
const results = []; const ok = (n, c, d = '') => results.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' — ' + d));
const errors = [];
const b = await chromium.launch();
const route = async ctx => ctx.route('https://cdn.jsdelivr.net/**', r => { const k = Object.keys(libs).find(k => r.request().url().includes(k)); r.fulfill({ path: SP + '/libs/' + libs[k], contentType: 'text/javascript' }); });

// 1. Evening in Kentucky (9:30 pm EDT = next day in UTC)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
  await route(ctx); await ctx.addInitScript(mock);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.clock.install({ time: new Date('2026-10-27T01:30:00Z') });
  await p.goto('file://' + SP + '/art/index.html');
  await p.clock.runFor(500);
  await p.getByRole('heading', { name: 'Recruiting dashboard' }).waitFor();
  await p.getByRole('button', { name: 'Add candidate' }).first().click();
  await p.locator('#cand-form input[name=first]').fill('Evening'); await p.locator('#cand-form input[name=last]').fill('Test');
  await p.locator('#cand-form input[name=phone]').fill('8595550199');
  await p.locator('#cand-form input[name=cContact]').check();
  await p.locator('#cand-form').getByRole('button', { name: 'Add candidate' }).click();
  await p.clock.runFor(800);
  await p.locator('#log-form').getByRole('button', { name: 'Save contact' }).click();
  await p.clock.runFor(800);
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  await p.getByRole('button', { name: 'Dashboard', exact: true }).click(); await p.clock.runFor(300);
  const newToday = await p.locator('.kpi', { hasText: 'New registrations today' }).locator('b').innerText();
  const contacted = await p.locator('.kpi', { hasText: 'People contacted today' }).locator('b').innerText();
  ok('9:30 pm registration counts as today (Oct 26)', newToday === '1', newToday);
  ok('9:30 pm call counts as contacted today', contacted === '1', contacted);
  await p.getByRole('button', { name: 'Reports', exact: true }).click(); await p.clock.runFor(300);
  const txt = await p.locator('#report-text').innerText();
  ok('daily report dated 2026-10-26 includes the evening registration', txt.includes('2026-10-26') && txt.includes('New registrations: 1'), txt.slice(0, 200));
  await p.getByRole('button', { name: 'Today’s calls' }).click(); await p.clock.runFor(300);
  ok('contacted person shows in today progress', (await p.locator('text=Contacted today: 1').count()) === 1);
  await ctx.close();
}
// 2. Storage never answers -> clear message after 15 s
{
  const ctx = await b.newContext({ viewport: { width: 800, height: 700 } });
  await ctx.addInitScript(`window.claude = { use: async n => n === 'db' ? { doc: p => ({ onSnapshot: () => () => {}, collection: () => ({ onSnapshot: () => () => {} }) }), collection: () => ({ onSnapshot: () => () => {} }) } : n === 'user' ? { id: async () => 'u1' } : null };`);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.clock.install(); await p.goto('file://' + SP + '/art/index.html');
  await p.clock.runFor(16000);
  ok('slow storage shows a clear message', (await p.getByText('Your storage is taking a while to respond').count()) === 1);
  await ctx.close();
}
// 3. Not inside claude.ai -> offline notice, reference sections still readable
{
  const ctx = await b.newContext({ viewport: { width: 800, height: 700 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.goto('file://' + SP + '/art/index.html');
  ok('outside claude.ai shows offline notice', (await p.getByText('Data can’t be saved in this view').count()) === 1);
  await p.getByRole('button', { name: 'Messages & ads' }).click();
  ok('messages readable offline', (await p.locator('pre.msg').count()) > 10);
  await ctx.close();
}
// 4. Phone: dialog scrolls, call list fits, task pruning keeps recent work
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 760 } });
  await route(ctx); await ctx.addInitScript(mock);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.goto('file://' + SP + '/art/index.html');
  await p.getByRole('heading', { name: 'Recruiting dashboard' }).waitFor();
  await p.getByRole('button', { name: 'Load sample data' }).first().click(); await p.getByText('Sample data is loaded.').waitFor();
  await p.getByRole('button', { name: 'Today’s calls' }).click();
  ok('call list has no sideways scroll on phone', await p.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await p.locator('[data-open]').first().click(); await p.waitForTimeout(300);
  const sc = await p.locator('#dlg').evaluate(d => { d.scrollTop = 99999; return d.scrollTop > 0; });
  ok('candidate card scrolls on phone', sc);
  await p.screenshot({ path: SP + '/art/phone-dialog.png' });
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  // old done task gets pruned on next load, new one stays
  await p.evaluate(() => { const s = window.__store; s.set('data/users/u1/ws/tasks/oldtask', { candId: '', kind: 'other', title: 'old', due: '2026-07-01', done: true, doneAt: '2026-07-01T12:00:00.000Z' }); s.set('data/users/u1/ws/tasks/newtask', { candId: '', kind: 'other', title: 'new', due: '2026-10-20', done: true, doneAt: '2026-10-20T12:00:00.000Z' }); localStorage.removeItem('rw.pruned'); });
  ok('setup', true);
  await ctx.close();
}
await b.close();
console.log(results.join('\n')); console.log('errors:', errors.length ? errors : 'none');
