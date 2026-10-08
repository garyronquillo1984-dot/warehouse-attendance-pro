import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const db = await import('../src/db.js');
db.openDb();

const base = { student: 'Edric', subject: 'Matemática', title: 'Propiedades de la adición', assignedDate: '2026-09-23', dueDate: '2026-10-01', attachments: [], extra: {} };

test('hourly re-reads do not duplicate a task', () => {
  const a = db.upsertTask(base);
  const b = db.upsertTask(base);
  assert.equal(a.result, 'created');
  assert.equal(b.result, 'unchanged');
  assert.equal(a.id, b.id);
  assert.equal(db.allTasks().filter((t) => t.title === base.title).length, 1);
});

test('a rescheduled due date updates the task and keeps the history', () => {
  const r = db.upsertTask({ ...base, dueDate: '2026-10-12' });
  assert.equal(r.result, 'updated');
  const t = db.taskWithEvents(r.id);
  assert.equal(t.dueDate, '2026-10-12');
  const upd = t.events.find((e) => e.type === 'updated');
  assert.deepEqual(upd.changes.due_date, { antes: '2026-10-01', ahora: '2026-10-12' });
});

test('API read with an Idukay id matches the same task read from the page', () => {
  const page = db.upsertTask({ ...base, title: 'Amphibians', subject: 'Science', assignedDate: '2026-10-01', dueDate: '2026-10-09' });
  const api = db.upsertTask({ ...base, title: 'Amphibians', subject: 'Science', assignedDate: '2026-10-01', dueDate: '2026-10-09', idukayId: 'hw-1', description: 'Copy notes' });
  assert.equal(page.id, api.id);
  // later the title changes in Idukay: matched by id, still one row
  const renamed = db.upsertTask({ ...base, title: 'Amphibians (notes)', subject: 'Science', assignedDate: '2026-10-01', dueDate: '2026-10-09', idukayId: 'hw-1' });
  assert.equal(renamed.id, api.id);
  assert.equal(renamed.result, 'updated');
});

test('tasks not seen anymore are flagged, never deleted', () => {
  const keep = db.upsertTask({ ...base, title: 'Sigue', assignedDate: '2026-10-05' });
  const n = db.markMissing('Edric', [keep.id]);
  assert.ok(n >= 1);
  const all = db.allTasks();
  assert.ok(all.some((t) => t.title === 'Propiedades de la adición' && t.missingSince));
  assert.ok(all.find((t) => t.title === 'Sigue').missingSince === null);
  // it comes back
  const again = db.upsertTask({ ...base, dueDate: '2026-10-12' });
  assert.equal(db.taskWithEvents(again.id).missingSince, null);
});

test('parent can mark a task as done at home', () => {
  const t = db.allTasks()[0];
  assert.equal(db.setParentDone(t.id, true), true);
  assert.ok(db.taskWithEvents(t.id).parentDoneAt);
  db.setParentDone(t.id, false);
  assert.equal(db.taskWithEvents(t.id).parentDoneAt, null);
});
