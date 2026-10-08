// One synchronization run: Idukay → normalized tasks → database, with a run record and logs.
import { config, credentialsConfigured } from './config.js';
import { log as baseLog, addLogSink } from './log.js';
import * as db from './db.js';
import { scrapeIdukay as realScrape, IdukayError } from './idukay/scraper.js';

let running = null;
let scrapeImpl = realScrape;
export function setScraperForTests(fn) { scrapeImpl = fn || realScrape; }

export const ERROR_MESSAGES = {
  config_missing: 'Faltan las credenciales de Idukay en la configuración del servidor.',
  auth_failed: 'Idukay rechazó el usuario o la contraseña. Si la cambiaste, actualiza IDUKAY_PASSWORD.',
  captcha_required: 'Se requiere volver a autenticar Idukay (pide un CAPTCHA).',
  mfa_required: 'Se requiere volver a autenticar Idukay (pide un código de verificación).',
  password_change_required: 'Idukay pide cambiar la contraseña. Cámbiala en Idukay y actualiza IDUKAY_PASSWORD.',
  session_expired: 'La sesión de Idukay se cerró durante la sincronización. Se reintentará en la próxima hora.',
  network_error: 'No se pudo conectar con Idukay. Se reintentará en la próxima hora.',
  structure_changed: 'La página de Idukay cambió y no se pudieron leer las tareas. Revisa el diagnóstico.',
  browser_error: 'No se pudo iniciar el navegador automatizado del servidor.',
  unexpected: 'Error inesperado durante la sincronización.',
};

export function isRunning() { return Boolean(running); }

/** Starts a sync unless one is running. Resolves with the run summary. */
export function runSync(trigger = 'manual') {
  if (running) return running;
  running = doSync(trigger).finally(() => { running = null; });
  return running;
}

async function doSync(trigger) {
  const runId = db.startRun(trigger);
  const remove = addLogSink((level, msg) => db.addRunLog(runId, level, msg));
  const log = baseLog;
  const started = Date.now();
  try {
    log.info(`Inicio de sincronización (${triggerLabel(trigger)})`);
    if (!credentialsConfigured()) throw new IdukayError('config_missing', ERROR_MESSAGES.config_missing);

    const result = await scrapeImpl({ log });
    const now = new Date().toISOString();
    const counts = { students: {}, created: 0, updated: 0, unchanged: 0, missing: 0 };
    const warnings = [...(result.warnings || [])];

    for (const student of config.idukay.students) {
      const r = result.students[student];
      if (!r || !r.section) {
        warnings.push(`${student}: no se encontró la sección de tareas`);
        log.warn(`${student}: no se encontró la sección de tareas en Idukay`);
        continue;
      }
      if (!r.found) log.warn(`${student}: no se encontró un selector de estudiante; se usó la vista actual`);
      const seen = [];
      for (const t of r.tasks) {
        const { result: res, id } = db.upsertTask({ ...t, student }, now);
        counts[res]++;
        seen.push(id);
      }
      // Only flag "no longer in Idukay" when this read clearly worked for the student.
      if (r.tasks.length) counts.missing += db.markMissing(student, seen, now);
      counts.students[student] = r.tasks.length;
      log.info(`${student}: ${r.tasks.length} tarea${r.tasks.length === 1 ? '' : 's'} encontrada${r.tasks.length === 1 ? '' : 's'}` +
        (r.fromApi !== undefined ? ` (datos de Idukay: ${r.fromApi} vía API, ${r.fromPage} en pantalla)` : ''));
    }

    const okStudents = Object.keys(counts.students).length;
    if (okStudents === 0) throw new IdukayError('structure_changed', 'No se pudo leer la sección de tareas de ningún estudiante.');
    const status = warnings.length ? 'partial' : 'ok';
    log.info(`Sincronización completada: ${counts.created} nuevas, ${counts.updated} actualizadas, ${counts.unchanged} sin cambios (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    db.finishRun(runId, { status, message: warnings.join(' · ') || null, counts });
    return { runId, status, counts, warnings };
  } catch (e) {
    const code = e instanceof IdukayError ? e.code : 'unexpected';
    const message = e instanceof IdukayError ? e.message : ERROR_MESSAGES.unexpected;
    log.error(`Sincronización fallida [${code}]: ${message}`);
    db.finishRun(runId, { status: 'error', errorCode: code, message });
    return { runId, status: 'error', errorCode: code, message };
  } finally {
    remove();
    db.pruneLogs();
  }
}

function triggerLabel(t) {
  return { cron: 'automática', manual: 'manual', startup: 'al iniciar', external: 'cron externo' }[t] || t;
}
