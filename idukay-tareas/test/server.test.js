// Full server against the TEST FIXTURE portal: app password, manual sync, API, no secret leaks.
import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.APP_PASSWORD = 'familia-secreta';
process.env.CRON_SECRET = 'cron-secreto-largo';
process.env.MANUAL_SYNC_COOLDOWN_SEC = '0';
const { config } = await import('../src/config.js');
const { startMockIdukay } = await import('./mock-idukay/server.js');
const { createApp } = await import('../src/server.js');

const mock = await startMockIdukay({ mode: 'json' });
config.idukay.loginUrl = mock.url;
const app = createApp();
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${srv.address().port}`;
test.after(() => { srv.close(); mock.server.close(); });

async function waitIdle(cookie) {
  for (let i = 0; i < 120; i++) {
    const s = await (await fetch(base + '/api/status', { headers: { cookie } })).json();
    if (!s.running) return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('sync did not finish');
}

test('the app is closed without the family password', async () => {
  const r = await fetch(base + '/api/tasks');
  assert.equal(r.status, 401);
  const bad = await fetch(base + '/login', { method: 'POST', body: new URLSearchParams({ password: 'x' }), redirect: 'manual' });
  assert.equal(bad.headers.get('location'), '/login?e=1');
});

test('manual sync stores real data and the API serves it', { timeout: 120000 }, async () => {
  const login = await fetch(base + '/login', { method: 'POST', body: new URLSearchParams({ password: 'familia-secreta' }), redirect: 'manual' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const start = await fetch(base + '/api/sync', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(start.status, 202);
  const status = await waitIdle(cookie);
  assert.equal(status.lastRun.status, 'ok', JSON.stringify(status.lastRun));
  assert.ok(status.lastSuccessAt);
  assert.ok(status.nextSyncAt);

  const { tasks } = await (await fetch(base + '/api/tasks', { headers: { cookie } })).json();
  assert.equal(tasks.filter((t) => t.student === 'Gael').length, 3);
  assert.equal(tasks.filter((t) => t.student === 'Edric').length, 2);
  const mapa = tasks.find((t) => t.title.startsWith('Mapa'));
  assert.equal(mapa.bucket, 'pendiente');
  assert.equal(tasks.find((t) => t.title === 'Spelling Quiz').bucket, 'proxima');
  assert.equal(tasks.find((t) => t.title === 'Propiedades de la adición').status, 'vencida');
  assert.equal(tasks.find((t) => t.title === 'Taller de divisiones').status, 'completada');

  // second run (external cron) → no duplicates
  const cron = await fetch(base + '/api/cron/sync?wait=1', { method: 'POST', headers: { authorization: 'Bearer cron-secreto-largo' } });
  const cr = await cron.json();
  assert.equal(cr.status, 'ok');
  assert.equal(cr.counts.created, 0);
  const again = await (await fetch(base + '/api/tasks', { headers: { cookie } })).json();
  assert.equal(again.tasks.length, 5);

  const runs = await (await fetch(base + '/api/runs', { headers: { cookie } })).text();
  assert.match(runs, /Login exitoso/);
  assert.match(runs, /Gael: 3 tareas encontradas/);
  for (const secret of ['clave-correcta', 'padre@example.com', 'familia-secreta', 'cron-secreto-largo', 'sid=']) {
    assert.ok(!runs.includes(secret), 'leaked ' + secret);
    assert.ok(!JSON.stringify(again).includes(secret), 'leaked ' + secret);
  }
});

test('cron endpoint rejects a wrong secret', async () => {
  const r = await fetch(base + '/api/cron/sync', { method: 'POST', headers: { authorization: 'Bearer nope' } });
  assert.equal(r.status, 401);
});
