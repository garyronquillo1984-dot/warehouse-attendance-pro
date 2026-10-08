// All configuration comes from environment variables (or a local .env file in
// development). Credentials are never hard-coded and never sent to the browser.
import fs from 'node:fs';
import path from 'node:path';

loadDotEnv();

function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return /^(1|true|yes|si|sí)$/i.test(v);
}

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  isProduction: env.NODE_ENV === 'production',
  timezone: env.TZ_APP || env.TZ || 'America/Guayaquil',
  dataDir: path.resolve(env.DATA_DIR || './data'),

  idukay: {
    loginUrl: env.IDUKAY_LOGIN_URL || 'https://idukay.net/colegios/#/login',
    // Optional: hash route of the tasks section once known (e.g. "#/tareas").
    tasksPath: env.IDUKAY_TASKS_PATH || '',
    username: env.IDUKAY_USERNAME || '',
    password: env.IDUKAY_PASSWORD || '',
    students: (env.STUDENTS || 'Gael,Edric').split(',').map((s) => s.trim()).filter(Boolean),
    openDetails: bool(env.IDUKAY_OPEN_DETAILS, true),
    logoutAfter: bool(env.IDUKAY_LOGOUT_AFTER, false),
    maxDetails: Number(env.IDUKAY_MAX_DETAILS || 40),
    // Optional JSON with CSS selectors that override the automatic detection.
    selectors: parseJson(env.IDUKAY_SELECTORS, {}),
    navTimeoutMs: Number(env.IDUKAY_TIMEOUT_MS || 30000),
    headless: !bool(env.HEADFUL, false),
    chromiumPath: env.CHROMIUM_PATH || undefined,
  },

  app: {
    // Password to open the web app. Required in production.
    password: env.APP_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    cronSecret: env.CRON_SECRET || '',
    // "internal": the server runs the hourly sync itself.
    // "external": an outside scheduler calls POST /api/cron/sync.
    scheduler: (env.SCHEDULER || 'internal').toLowerCase(),
    cronExpression: env.SYNC_CRON || '0 * * * *',
    syncOnStart: bool(env.SYNC_ON_START, true),
    manualCooldownSec: Number(env.MANUAL_SYNC_COOLDOWN_SEC || 60),
  },

  // Optional key that encrypts the saved Idukay browser session on disk.
  sessionEncryptionKey: env.SESSION_ENCRYPTION_KEY || '',

  historyDays: Number(env.HISTORY_DAYS || 14),
};

function parseJson(v, def) {
  if (!v) return def;
  try { return JSON.parse(v); } catch { return def; }
}

export function credentialsConfigured() {
  return Boolean(config.idukay.username && config.idukay.password);
}

// Values that must never appear in logs, API responses or error messages.
export function secretValues() {
  return [
    config.idukay.username,
    config.idukay.password,
    config.app.password,
    config.app.sessionSecret,
    config.app.cronSecret,
    config.sessionEncryptionKey,
  ].filter((s) => s && s.length >= 3);
}

fs.mkdirSync(config.dataDir, { recursive: true });
