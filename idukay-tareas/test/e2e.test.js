// End-to-end: real Chromium + the automation, against the local TEST FIXTURE portal.
import { dataDir } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { config } = await import('../src/config.js');
const { startMockIdukay } = await import('./mock-idukay/server.js');
const { scrapeIdukay } = await import('../src/idukay/scraper.js');
const { clearSession } = await import('../src/session-store.js');
const quiet = { info() {}, warn() {}, error() {} };

async function withMock(opts, fn) {
  const { server, url } = await startMockIdukay(opts);
  config.idukay.loginUrl = url;
  clearSession();
  try { return await fn(); } finally { server.close(); }
}

test('reads both students from the portal API (JSON mode)', { timeout: 90000 }, async () => {
  await withMock({ mode: 'json' }, async () => {
    const r = await scrapeIdukay({ log: quiet });
    const g = r.students.Gael.tasks, e = r.students.Edric.tasks;
    assert.deepEqual(g.map((t) => t.title).sort(), ['Mapa conceptual de las provincias', 'Spelling Quiz', 'Taller de divisiones']);
    assert.deepEqual(e.map((t) => t.title).sort(), ['Amphibians', 'Propiedades de la adición']);
    const mapa = g.find((t) => t.title.startsWith('Mapa'));
    assert.equal(mapa.subject, 'Estudios Sociales');
    assert.equal(mapa.teacher, 'Ana Pérez');
    assert.equal(mapa.dueTime, '23:59');
    assert.ok(mapa.attachments.some((a) => a.url === 'https://example.org/guia.pdf'));
    assert.equal(g.find((t) => t.title === 'Taller de divisiones').completedByIdukay, true);
    assert.ok(e.find((t) => t.title === 'Amphibians').attachments.some((a) => a.name === 'amphibians.pdf'));
  });
});

test('reads the rendered page when there is no JSON (HTML mode)', { timeout: 90000 }, async () => {
  await withMock({ mode: 'html' }, async () => {
    const r = await scrapeIdukay({ log: quiet });
    const e = r.students.Edric.tasks;
    assert.deepEqual(e.map((t) => t.title).sort(), ['Amphibians', 'Propiedades de la adición']);
    const p = e.find((t) => t.title === 'Propiedades de la adición');
    assert.equal(p.subject, 'Matemática / Ed. Financiera');
    assert.equal(p.idukayStatus, 'No entregada');
    assert.equal(p.completedByIdukay, false);
    assert.ok(p.dueDate && p.assignedDate);
    assert.match(p.description || '', /Página 67/); // came from the detail dialog
    assert.equal(r.students.Gael.tasks.find((t) => t.title === 'Taller de divisiones').completedByIdukay, true);
  });
});

test('reuses the saved session on the next run', { timeout: 90000 }, async () => {
  const { server, url } = await startMockIdukay({ mode: 'json' });
  config.idukay.loginUrl = url;
  clearSession();
  try {
    const lines = [];
    const log = { info: (m) => lines.push(m), warn() {}, error() {} };
    await scrapeIdukay({ log });
    lines.length = 0;
    await scrapeIdukay({ log });
    assert.ok(lines.some((l) => /Sesión guardada todavía válida/.test(l)), lines.join('\n'));
    assert.ok(fs.existsSync(path.join(dataDir, 'idukay-session.bin')));
  } finally { server.close(); }
});

test('rejected password is reported as auth_failed', { timeout: 60000 }, async () => {
  await withMock({ password: 'otra' }, async () => {
    await assert.rejects(scrapeIdukay({ log: quiet }), (e) => e.code === 'auth_failed' && !e.message.includes('clave-correcta'));
  });
});

test('CAPTCHA is detected and not bypassed', { timeout: 60000 }, async () => {
  await withMock({ captcha: true }, async () => {
    await assert.rejects(scrapeIdukay({ log: quiet }), (e) => e.code === 'captcha_required');
  });
});

test('MFA is detected', { timeout: 60000 }, async () => {
  await withMock({ mfa: true }, async () => {
    await assert.rejects(scrapeIdukay({ log: quiet }), (e) => e.code === 'mfa_required');
  });
});

test('connection problems are reported as network_error', { timeout: 60000 }, async () => {
  config.idukay.loginUrl = 'http://127.0.0.1:9/colegios/#/login';
  clearSession();
  await assert.rejects(scrapeIdukay({ log: quiet }), (e) => e.code === 'network_error');
});
