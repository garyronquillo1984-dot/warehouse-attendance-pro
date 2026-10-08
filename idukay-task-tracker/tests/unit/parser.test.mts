import { test, eq } from './harness.mts';
import { parseIdukayText, extractDate } from '../../web/src/lib/parser/idukay.ts';

const today = '2026-10-07';   // a Wednesday
const P = (text: string, extra = {}) => parseIdukayText(text, { today, ...extra });
const brief = (text: string, extra = {}) => P(text, extra).map(t => [t.subject, t.title, t.dueDate]);

test('parser: the example from the brief', () => {
  const r = P('Matemática: resolver ejercicios 1-10.\nLengua: leer capítulo 3.\nCiencias: completar actividad sobre ecosistemas.');
  eq(r.map(t => [t.subject, t.title, t.dueDate]), [
    ['Matemática', 'Resolver ejercicios 1-10', null],
    ['Lengua', 'Leer capítulo 3', null],
    ['Ciencias', 'Completar actividad sobre ecosistemas', null],
  ]);
  eq(r[0].warnings, ['no_date']);
});

test('parser: same tasks pasted as one paragraph', () => {
  eq(brief('Matemática: resolver ejercicios 1-10. Lengua: leer capítulo 3. Ciencias: completar actividad sobre ecosistemas.').length, 3);
});

test('parser: bullets and numbering', () => {
  eq(brief('- Lengua: leer capítulo 3\n• Arte: traer témperas\n2) Música: practicar flauta'), [
    ['Lengua', 'Leer capítulo 3', null], ['Arte', 'Traer témperas', null], ['Música', 'Practicar flauta', null],
  ]);
});

test('parser: Spanish relative dates', () => {
  eq(brief('Lengua: leer capítulo 3 para mañana\nCiencias: maqueta para el viernes\nMatemática: tablas (vence el lunes)\nArte: dibujo hoy\nInglés: vocabulario pasado mañana'), [
    ['Lengua', 'Leer capítulo 3', '2026-10-08'],
    ['Ciencias', 'Maqueta', '2026-10-09'],
    ['Matemática', 'Tablas', '2026-10-12'],
    ['Arte', 'Dibujo', '2026-10-07'],
    ['Inglés', 'Vocabulario', '2026-10-09'],
  ]);
});

test('parser: absolute dates in several formats', () => {
  eq(brief('Inglés: spelling 12/10\nEstudios Sociales: mapa 15 de octubre\nScience: amphibians October 9\nMatemática: página 67 - fecha de entrega: oct. 12, 2026 · 23:59\nLengua: resumen 2026-10-20'), [
    ['Inglés', 'Spelling', '2026-10-12'],
    ['Estudios Sociales', 'Mapa', '2026-10-15'],
    ['Science', 'Amphibians', '2026-10-09'],
    ['Matemática', 'Página 67', '2026-10-12'],
    ['Lengua', 'Resumen', '2026-10-20'],
  ]);
});

test('parser: English relative dates', () => {
  eq(brief('Art: drawing due Friday\nMath: worksheet tomorrow'), [['Art', 'Drawing', '2026-10-09'], ['Math', 'Worksheet', '2026-10-08']]);
});

test('parser: same weekday means next week', () => {
  eq(P('Lengua: lectura para el miércoles')[0].dueDate, '2026-10-14');
});

test('parser: task cards copied from the platform', () => {
  const r = P(`Vigentes
Matemática / Ed. Financiera
Propiedades de la adición
Fecha de entrega: oct. 12, 2026 · 23:59
Profesor: Karina Tapia
Realizar la página 67 del libro.
Escribir los números con claridad.

Science
Amphibians (notes and pictures)
Due: Oct 9
No contiene archivos adjuntos`);
  eq(r.map(t => [t.subject, t.title, t.dueDate, t.teacher, t.description]), [
    ['Matemática / Ed. Financiera', 'Propiedades de la adición', '2026-10-12', 'Karina Tapia', 'Realizar la página 67 del libro.\nEscribir los números con claridad.'],
    ['Science', 'Amphibians (notes and pictures)', '2026-10-09', null, null],
  ]);
});

test('parser: child headers assign the tasks below them', () => {
  const children = [{ id: 'g', name: 'Gael' }, { id: 'e', name: 'Edric' }];
  const r = P('GAEL\nMatemática: divisiones\nEdric:\nLengua: leyendas', { children });
  eq(r.map(t => [t.childId, t.title]), [['g', 'Divisiones'], ['e', 'Leyendas']]);
});

test('parser: single child is selected by default; several children leave it to the parent', () => {
  eq(P('Lengua: x', { children: [{ id: 'only', name: 'Ana' }] })[0].childId, 'only');
  eq(P('Lengua: x', { children: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Leo' }] })[0].childId, null);
});

test('parser: exams and oral lessons are high priority', () => {
  eq(P('Matemática: LECCIÓN ORAL de tablas\nLengua: leer')[0].priority, 'high');
  eq(P('Matemática: LECCIÓN ORAL de tablas\nLengua: leer')[1].priority, 'normal');
});

test('parser: lines without subject use the default and are flagged', () => {
  const r = P('Traer tres esferas de espuma flex', { defaultSubject: '' });
  eq([r[0].subject, r[0].title, r[0].warnings], ['', 'Traer tres esferas de espuma flex', ['no_subject', 'no_date']]);
});

test('parser: past dates are flagged, not dropped', () => {
  eq(P('Lengua: resumen 2026-10-01')[0].warnings, ['past_date']);
});

test('parser: noise and empty input', () => {
  eq(P(''), []); eq(P('Vigentes\n\nAnteriores\n---'), []);
});

test('dates: year rollover picks the near future', () => {
  eq(extractDate('5/1', '2026-12-20').date, '2027-01-05');
  eq(extractDate('25/12', '2026-12-20').date, '2026-12-25');
});
test('dates: month/day order when the day is above 12', () => {
  eq(extractDate('10/25', today).date, '2026-10-25');
});
test('dates: impossible dates are ignored', () => {
  eq(extractDate('31/02/2026', today).date, null);
});

test('parser: start date and a Spanish explanation are kept apart from the original', () => {
  const r = P(`Language Arts
Read Chapter 4
Fecha de publicación: oct. 6, 2026
Fecha de entrega: oct. 9, 2026
Read Chapter 4 and answer questions 1–5.
Traducción: Lee el capítulo 4 y responde las preguntas 1–5.`);
  eq(r.map(t => [t.subject, t.title, t.startDate, t.dueDate, t.description, t.parentExplanation]), [
    ['Language Arts', 'Read Chapter 4', '2026-10-06', '2026-10-09', 'Read Chapter 4 and answer questions 1–5.', 'Lee el capítulo 4 y responde las preguntas 1–5.'],
  ]);
});
