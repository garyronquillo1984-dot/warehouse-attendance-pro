// Diagnostic run against the REAL Idukay: logs in with the credentials from .env /
// environment, walks the same steps as the hourly sync and saves, in ./discovery:
//   NN-step.png            screenshots of every step (contain your children's data — keep private)
//   NN-step.outline.txt    the page structure (tags, classes, short texts)
//   api-endpoints.txt      the JSON endpoints Idukay's app called, with field NAMES only
// Nothing is written to the database. Use HEADFUL=true to watch the browser.
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../src/log.js';
import { scrapeIdukay } from '../src/idukay/scraper.js';

const dir = path.resolve('discovery');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
try {
  const r = await scrapeIdukay({ log, discoveryDir: dir });
  for (const [student, s] of Object.entries(r.students)) {
    log.info(`${student}: selector encontrado=${s.found} · sección de tareas=${s.section} · pestañas=${(s.tabs || []).join(', ') || '—'} · ${s.tasks.length} tareas (API ${s.fromApi ?? 0}, pantalla ${s.fromPage ?? 0})`);
    for (const t of s.tasks) log.info(`   - ${t.dueDate || 'sin fecha'} · ${t.subject || '¿materia?'} — ${t.title} [${t.idukayStatus || 'sin estado'}]`);
  }
} catch (e) {
  log.error(`[${e.code || 'error'}] ${e.message}`);
  process.exitCode = 1;
}
log.info(`Diagnóstico guardado en ${dir}`);
