// Web server: serves the parent-facing app, a small JSON API, and runs the hourly sync.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cron from 'node-cron';
import { config, credentialsConfigured } from './config.js';
import { log, redact } from './log.js';
import * as db from './db.js';
import { runSync, isRunning, ERROR_MESSAGES } from './sync.js';
import { classify, isEnglish } from './tasks.js';
import { nextTopOfHour, todayISO } from './dates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

export function createApp() {
  db.openDb();
  db.closeStaleRuns();

  if (config.isProduction && !config.app.password) {
    throw new Error('APP_PASSWORD es obligatorio en producción (protege los datos de los niños).');
  }
  const sessionSecret = config.app.sessionSecret || persistentSecret();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  // ---- access control (one family password) ----
  const COOKIE = 'tareas_sess';
  const sign = (v) => crypto.createHmac('sha256', sessionSecret).update(v).digest('base64url');
  const makeToken = () => { const exp = String(Date.now() + 90 * 86400000); return `${exp}.${sign(exp)}`; };
  const validToken = (t) => {
    if (!t) return false;
    const [exp, mac] = t.split('.');
    if (!exp || !mac || Number(exp) < Date.now()) return false;
    const a = Buffer.from(mac), b = Buffer.from(sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2));
  const authed = (req) => !config.app.password || validToken(cookies(req)[COOKIE]);

  const attempts = new Map();
  app.post('/login', (req, res) => {
    const ip = req.ip;
    const a = attempts.get(ip) || { n: 0, since: Date.now() };
    if (Date.now() - a.since > 15 * 60000) { a.n = 0; a.since = Date.now(); }
    if (a.n >= 10) return res.redirect('/login?e=limit');
    const given = Buffer.from(String(req.body.password || ''));
    const want = Buffer.from(config.app.password);
    const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
    if (!ok) { a.n++; attempts.set(ip, a); return res.redirect('/login?e=1'); }
    attempts.delete(ip);
    res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}${req.secure ? '; Secure' : ''}`);
    res.redirect('/');
  });
  app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.redirect('/login');
  });
  app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get(['/styles.css', '/favicon.svg', '/manifest.webmanifest', '/login.js'], (req, res) => res.sendFile(path.join(publicDir, req.path)));

  // ---- external scheduler hook (for hosts without always-on processes) ----
  app.post('/api/cron/sync', (req, res) => {
    const auth = req.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!config.app.cronSecret || token.length !== config.app.cronSecret.length ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.app.cronSecret))) {
      return res.status(401).json({ error: 'no autorizado' });
    }
    const already = isRunning();
    const p = runSync('external');
    if (req.query.wait === '1') return p.then((r) => res.json(publicRun(r)));
    res.status(202).json({ started: !already, running: true });
  });

  app.use((req, res, next) => {
    if (authed(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Inicia sesión' });
    return res.redirect('/login');
  });

  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0 }));

  // ---- API ----
  app.get('/api/status', (req, res) => res.json(statusPayload()));

  app.get('/api/tasks', (req, res) => {
    const today = todayISO();
    const tasks = db.allTasks().map((t) => decorate(t, today));
    res.json({ today, students: config.idukay.students, historyDays: config.historyDays, tasks });
  });

  app.get('/api/tasks/:id', (req, res) => {
    const t = db.taskWithEvents(req.params.id);
    if (!t) return res.status(404).json({ error: 'No encontrada' });
    res.json(decorate(t, todayISO()));
  });

  app.post('/api/tasks/:id/done', (req, res) => {
    if (!db.setParentDone(req.params.id, Boolean(req.body.done))) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  });

  let lastManual = 0;
  app.post('/api/sync', (req, res) => {
    if (isRunning()) return res.status(202).json({ started: false, running: true });
    const wait = config.app.manualCooldownSec * 1000 - (Date.now() - lastManual);
    if (wait > 0) return res.status(429).json({ error: `Espera ${Math.ceil(wait / 1000)} s antes de volver a actualizar.` });
    lastManual = Date.now();
    runSync('manual');
    res.status(202).json({ started: true, running: true });
  });

  app.get('/api/runs', (req, res) => {
    const runs = db.lastRuns(15);
    res.json({ runs: runs.map((r) => ({ ...publicRunRow(r), logs: db.runLogs(r.id) })) });
  });

  app.use((err, req, res, _next) => {
    log.error('Error en la API: ' + redact(err?.message || String(err)));
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}

let scheduledTask = null;

function statusPayload() {
  const runs = db.lastRuns(1);
  const last = runs[0] || null;
  const lastOk = db.lastSuccessfulRun();
  let next = null;
  if (config.app.scheduler === 'internal') {
    try { next = scheduledTask?.getNextRun?.() || null; } catch { next = null; }
    if (!next) next = nextTopOfHour();
  }
  const reauthCodes = ['captcha_required', 'mfa_required', 'password_change_required', 'auth_failed'];
  return {
    running: isRunning(),
    timezone: config.timezone,
    credentialsConfigured: credentialsConfigured(),
    scheduler: config.app.scheduler,
    lastRun: last ? publicRunRow(last) : null,
    lastSuccessAt: lastOk ? lastOk.finished_at : null,
    nextSyncAt: next ? new Date(next).toISOString() : null,
    needsReauth: Boolean(last && last.status === 'error' && reauthCodes.includes(last.error_code)),
  };
}

function publicRunRow(r) {
  return {
    id: r.id, trigger: r.trigger, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status,
    errorCode: r.error_code, message: r.status === 'error' ? (r.message || ERROR_MESSAGES[r.error_code] || ERROR_MESSAGES.unexpected) : r.message,
    counts: r.counts,
  };
}

function publicRun(r) { return { status: r.status, errorCode: r.errorCode || null, message: r.message || null, counts: r.counts || null }; }

function decorate(t, today) {
  const c = classify(t, today);
  return { ...t, ...c, english: isEnglish(t.subject) };
}

function persistentSecret() {
  const f = path.join(config.dataDir, '.session-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

export function startScheduler() {
  if (config.app.scheduler !== 'internal') {
    log.info('Programador interno desactivado (SCHEDULER=external): usa POST /api/cron/sync');
    return;
  }
  scheduledTask = cron.schedule(config.app.cronExpression, () => { runSync('cron'); }, { timezone: config.timezone, name: 'idukay-sync' });
  log.info(`Sincronización automática programada: "${config.app.cronExpression}" (${config.timezone})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    log.info(`Tareas escolares escuchando en el puerto ${config.port}`);
    if (!config.app.password) log.warn('APP_PASSWORD no está definido: la app está abierta sin contraseña (solo para desarrollo).');
    if (!credentialsConfigured()) log.warn('IDUKAY_USERNAME / IDUKAY_PASSWORD no están configurados: no se podrá sincronizar.');
    startScheduler();
    if (config.app.syncOnStart && credentialsConfigured()) runSync('startup');
  });
}
