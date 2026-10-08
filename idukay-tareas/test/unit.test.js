import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { parseDate, todayISO, addDays } = await import('../src/dates.js');
const { classify, completedFromIdukay, contentKey } = await import('../src/tasks.js');
const { tasksFromJson, domItemToTask } = await import('../src/idukay/extract.js');
const { redact } = await import('../src/log.js');

test('parses Idukay date formats', () => {
  assert.deepEqual(parseDate('oct. 12, 2026 · 23:59'), { date: '2026-10-12', time: '23:59' });
  assert.deepEqual(parseDate('12 de octubre de 2026'), { date: '2026-10-12', time: null });
  assert.deepEqual(parseDate('jueves 8 oct. 2026'), { date: '2026-10-08', time: null });
  assert.deepEqual(parseDate('08/10/2026'), { date: '2026-10-08', time: null });
  assert.deepEqual(parseDate('2026-10-09T23:59:00'), { date: '2026-10-09', time: '23:59' });
  // explicit UTC instant → converted to Ecuador (UTC-5)
  assert.deepEqual(parseDate('2026-10-10T03:00:00Z'), { date: '2026-10-09', time: '22:00' });
  assert.equal(parseDate('Tarea sin fecha'), null);
});

test('classifies tasks into the main-screen buckets', () => {
  const today = '2026-10-08';
  assert.equal(classify({ dueDate: '2026-10-08' }, today).bucket, 'pendiente');
  assert.equal(classify({ dueDate: '2026-10-09' }, today).bucket, 'pendiente');
  assert.equal(classify({ dueDate: '2026-10-12' }, today).bucket, 'proxima');
  const past = classify({ dueDate: '2026-10-07' }, today);
  assert.equal(past.bucket, 'archivo');
  assert.equal(past.status, 'vencida');
  const done = classify({ dueDate: '2026-10-07', completedByIdukay: true }, today);
  assert.equal(done.bucket, 'archivo');
  assert.equal(done.status, 'completada');
  assert.equal(classify({ dueDate: '2026-10-12', completedByIdukay: true }, today).bucket, 'completada');
});

test('only marks completed when Idukay says so', () => {
  assert.equal(completedFromIdukay('Entregada'), true);
  assert.equal(completedFromIdukay('No entregada'), false);
  assert.equal(completedFromIdukay('Vigente'), false);
  assert.equal(completedFromIdukay(null), false);
  assert.equal(completedFromIdukay('', { delivered: true }), true);
});

test('content key ignores due-date changes when assigned date is known', () => {
  const a = { student: 'Edric', subject: 'Matemática', title: 'Propiedades de la adición', assignedDate: '2026-09-23', dueDate: '2026-10-01' };
  assert.equal(contentKey(a), contentKey({ ...a, dueDate: '2026-10-12' }));
  assert.notEqual(contentKey(a), contentKey({ ...a, student: 'Gael' }));
});

test('finds tasks inside arbitrary API JSON', () => {
  const json = { ok: true, data: { items: [
    { _id: 'x1', titulo: 'Amphibians', materia: { nombre: 'Science' }, profesor: { nombres: 'Pablo', apellidos: 'Castillo' },
      descripcion: '<p>Copy the notes</p><a href="https://e.org/a.pdf">a.pdf</a>', fecha_entrega: '2026-10-09T23:59:00', fecha_creacion: '2026-10-01', entregado: false },
    { _id: 'm1', nombre: 'Circular', mensaje: 'Reunión de padres' },
  ] } };
  const out = tasksFromJson(json, { url: 'https://idukay.net/api/tareas', ctxStudent: 'Edric', students: ['Gael', 'Edric'] });
  assert.equal(out.length, 1);
  const t = out[0];
  assert.equal(t.title, 'Amphibians');
  assert.equal(t.subject, 'Science');
  assert.equal(t.teacher, 'Pablo Castillo');
  assert.equal(t.dueDate, '2026-10-09');
  assert.equal(t.dueTime, '23:59');
  assert.equal(t.assignedDate, '2026-10-01');
  assert.equal(t.student, 'Edric');
  assert.equal(t.idukayStatus, 'No entregada');
  assert.equal(t.completedByIdukay, false);
  assert.deepEqual(t.attachments, [{ name: 'a.pdf', url: 'https://e.org/a.pdf' }]);
});

test('parses a rendered task card', () => {
  const t = domItemToTask({
    lines: ['Matemática / Ed. Financiera', 'Propiedades de la adición', 'Tapia Aparicio, Karina Elizabeth', 'Asignada: sep. 23, 2026', 'Entrega: oct. 12, 2026 · 23:59', 'Vigente', 'Realizar la página 67 del libro.', 'No contiene archivos adjuntos'],
    headings: ['Propiedades de la adición'], subjectHints: ['Matemática / Ed. Financiera'], statusHints: ['Vigente'], links: [],
  }, { ctxStudent: 'Edric', students: ['Gael', 'Edric'], tab: 'Vigentes' });
  assert.equal(t.title, 'Propiedades de la adición');
  assert.equal(t.subject, 'Matemática / Ed. Financiera');
  assert.equal(t.teacher, 'Tapia Aparicio, Karina Elizabeth');
  assert.equal(t.assignedDate, '2026-09-23');
  assert.equal(t.dueDate, '2026-10-12');
  assert.equal(t.dueTime, '23:59');
  assert.equal(t.idukayStatus, 'Vigente');
  assert.equal(t.description, 'Realizar la página 67 del libro.');
  assert.equal(t.student, 'Edric');
});

test('redacts secrets from log lines', () => {
  const s = redact('login padre@example.com con clave-correcta token=abc123 Cookie: sid=zzz https://x.net/a?token=1');
  assert.ok(!s.includes('padre@example.com'));
  assert.ok(!s.includes('clave-correcta'));
  assert.ok(!s.includes('abc123'));
  assert.ok(!s.includes('zzz'));
  assert.ok(!s.includes('token=1'));
});

test('today and addDays use the app time zone', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
});
