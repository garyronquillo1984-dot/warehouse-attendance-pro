// SQLite storage. Tasks are upserted by a stable key, never deleted; every change
// is recorded in task_events so the history survives even if Idukay changes a task.
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { contentKey, idukayKey } from './tasks.js';

let db;

export function openDb(file = path.join(config.dataDir, 'tareas.db')) {
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      content_key TEXT NOT NULL,
      idukay_id TEXT,
      student TEXT NOT NULL,
      subject TEXT,
      title TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      teacher TEXT,
      assigned_date TEXT,
      due_date TEXT,
      due_time TEXT,
      idukay_status TEXT,
      completed_by_idukay INTEGER NOT NULL DEFAULT 0,
      attachments TEXT NOT NULL DEFAULT '[]',
      extra TEXT NOT NULL DEFAULT '{}',
      source TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_changed_at TEXT NOT NULL,
      missing_since TEXT,
      parent_done_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tasks_content_key ON tasks(content_key);
    CREATE INDEX IF NOT EXISTS tasks_student_due ON tasks(student, due_date);

    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      changes TEXT
    );
    CREATE INDEX IF NOT EXISTS task_events_task ON task_events(task_id, at);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      error_code TEXT,
      message TEXT,
      counts TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES sync_runs(id),
      at TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

const TRACKED = [
  ['subject', 'subject'], ['title', 'title'], ['description', 'description'],
  ['instructions', 'instructions'], ['teacher', 'teacher'], ['assignedDate', 'assigned_date'],
  ['dueDate', 'due_date'], ['dueTime', 'due_time'], ['idukayStatus', 'idukay_status'],
];

/**
 * Insert or update one scraped task. Returns 'created' | 'updated' | 'unchanged'.
 * Matching order: Idukay's own id → content key. This prevents duplicates when the
 * same task is read once from the API (with id) and once from the page (without id).
 */
export function upsertTask(t, now = new Date().toISOString()) {
  const d = getDb();
  const ck = contentKey(t);
  const ik = idukayKey(t);
  let row = null;
  if (ik) row = d.prepare('SELECT * FROM tasks WHERE id = ? OR (idukay_id = ? AND student = ?)').get(ik, String(t.idukayId), t.student);
  if (!row) row = d.prepare('SELECT * FROM tasks WHERE content_key = ? OR id = ?').get(ck, ck);
  // Same idukay task whose title was edited: content key changes but id does not (handled above).

  const attachments = JSON.stringify(t.attachments || []);
  const extra = JSON.stringify(t.extra || {});
  const completed = t.completedByIdukay ? 1 : 0;

  if (!row) {
    const id = ik || ck;
    d.prepare(`INSERT INTO tasks (id, content_key, idukay_id, student, subject, title, description, instructions,
        teacher, assigned_date, due_date, due_time, idukay_status, completed_by_idukay, attachments, extra, source,
        first_seen_at, last_seen_at, last_changed_at)
      VALUES (@id, @ck, @idukayId, @student, @subject, @title, @description, @instructions, @teacher, @assignedDate,
        @dueDate, @dueTime, @idukayStatus, @completed, @attachments, @extra, @source, @now, @now, @now)`).run({
      id, ck, idukayId: t.idukayId ? String(t.idukayId) : null, student: t.student,
      subject: t.subject || null, title: t.title, description: t.description || null,
      instructions: t.instructions || null, teacher: t.teacher || null,
      assignedDate: t.assignedDate || null, dueDate: t.dueDate || null, dueTime: t.dueTime || null,
      idukayStatus: t.idukayStatus || null, completed, attachments, extra, source: t.source || null, now,
    });
    addEvent(id, 'created', null, now);
    return { result: 'created', id };
  }

  const changes = {};
  for (const [k, col] of TRACKED) {
    const nv = t[k] ?? null;
    // Never wipe a value we already have just because this read did not include it.
    if ((nv === null || nv === '') && row[col]) continue;
    if ((nv ?? null) !== (row[col] ?? null)) changes[col] = { antes: row[col], ahora: nv };
  }
  if (completed !== row.completed_by_idukay) changes.completed_by_idukay = { antes: row.completed_by_idukay, ahora: completed };
  if ((t.attachments || []).length && attachments !== row.attachments) changes.attachments = { antes: JSON.parse(row.attachments), ahora: t.attachments };

  const reappeared = Boolean(row.missing_since);
  const sets = ['last_seen_at = @now', 'missing_since = NULL'];
  const params = { id: row.id, now };
  if (t.idukayId && !row.idukay_id) { sets.push('idukay_id = @idukayId'); params.idukayId = String(t.idukayId); }
  for (const col of Object.keys(changes)) {
    sets.push(`${col} = @${col}`);
    params[col] = col === 'attachments' ? attachments : col === 'completed_by_idukay' ? completed : changes[col].ahora;
  }
  if (Object.keys(changes).length) {
    sets.push('last_changed_at = @now', 'content_key = @ck', 'extra = @extra');
    params.ck = contentKey({ ...rowToTask(row), ...t });
    params.extra = extra;
  }
  d.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (reappeared) addEvent(row.id, 'reappeared', null, now);
  if (Object.keys(changes).length) {
    addEvent(row.id, 'updated', changes, now);
    return { result: 'updated', id: row.id };
  }
  return { result: 'unchanged', id: row.id };
}

/** Tasks of a student that were not in this (successful) read are flagged, not deleted. */
export function markMissing(student, seenIds, now = new Date().toISOString()) {
  const d = getDb();
  const rows = d.prepare('SELECT id FROM tasks WHERE student = ? AND missing_since IS NULL').all(student);
  const seen = new Set(seenIds);
  let n = 0;
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    d.prepare('UPDATE tasks SET missing_since = ? WHERE id = ?').run(now, r.id);
    addEvent(r.id, 'missing', null, now);
    n++;
  }
  return n;
}

export function setParentDone(id, done, now = new Date().toISOString()) {
  const d = getDb();
  const r = d.prepare('UPDATE tasks SET parent_done_at = ? WHERE id = ?').run(done ? now : null, id);
  if (r.changes) addEvent(id, done ? 'parent_done' : 'parent_undone', null, now);
  return r.changes > 0;
}

export function addEvent(taskId, type, changes, at = new Date().toISOString()) {
  getDb().prepare('INSERT INTO task_events (task_id, at, type, changes) VALUES (?, ?, ?, ?)')
    .run(taskId, at, type, changes ? JSON.stringify(changes) : null);
}

export function rowToTask(r) {
  return {
    id: r.id,
    idukayId: r.idukay_id,
    student: r.student,
    subject: r.subject,
    title: r.title,
    description: r.description,
    instructions: r.instructions,
    teacher: r.teacher,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    dueTime: r.due_time,
    idukayStatus: r.idukay_status,
    completedByIdukay: Boolean(r.completed_by_idukay),
    attachments: JSON.parse(r.attachments || '[]'),
    extra: JSON.parse(r.extra || '{}'),
    source: r.source,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastChangedAt: r.last_changed_at,
    missingSince: r.missing_since,
    parentDoneAt: r.parent_done_at,
  };
}

export function allTasks() {
  return getDb().prepare('SELECT * FROM tasks ORDER BY due_date IS NULL, due_date, student').all().map(rowToTask);
}

export function taskWithEvents(id) {
  const r = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!r) return null;
  const events = getDb().prepare('SELECT at, type, changes FROM task_events WHERE task_id = ? ORDER BY at DESC, id DESC').all(id)
    .map((e) => ({ ...e, changes: e.changes ? JSON.parse(e.changes) : null }));
  return { ...rowToTask(r), events };
}

// ---- sync runs & logs ----
export function startRun(trigger) {
  const r = getDb().prepare('INSERT INTO sync_runs (trigger, started_at) VALUES (?, ?)').run(trigger, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function finishRun(id, { status, errorCode = null, message = null, counts = null }) {
  getDb().prepare('UPDATE sync_runs SET finished_at = ?, status = ?, error_code = ?, message = ?, counts = ? WHERE id = ?')
    .run(new Date().toISOString(), status, errorCode, message, counts ? JSON.stringify(counts) : null, id);
}

export function addRunLog(runId, level, message) {
  getDb().prepare('INSERT INTO sync_logs (run_id, at, level, message) VALUES (?, ?, ?, ?)')
    .run(runId, new Date().toISOString(), level, message);
}

export function lastRuns(limit = 20) {
  return getDb().prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?').all(limit)
    .map((r) => ({ ...r, counts: r.counts ? JSON.parse(r.counts) : null }));
}

export function lastSuccessfulRun() {
  return getDb().prepare("SELECT * FROM sync_runs WHERE status IN ('ok','partial') ORDER BY id DESC LIMIT 1").get() || null;
}

export function runLogs(runId) {
  return getDb().prepare('SELECT at, level, message FROM sync_logs WHERE run_id = ? ORDER BY id').all(runId);
}

export function pruneLogs(keepRuns = 500) {
  getDb().prepare('DELETE FROM sync_logs WHERE run_id NOT IN (SELECT id FROM sync_runs ORDER BY id DESC LIMIT ?)').run(keepRuns);
}

/** Recover runs left as "running" by a crash or restart. */
export function closeStaleRuns() {
  getDb().prepare("UPDATE sync_runs SET status = 'error', error_code = 'interrupted', message = 'La sincronización se interrumpió (reinicio del servidor).', finished_at = ? WHERE status = 'running'")
    .run(new Date().toISOString());
}
