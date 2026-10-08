// CSV import (same review screen as the paste parser).
import Papa from 'papaparse';
import type { ParsedTask } from './parser/idukay';
import type { TaskSource } from './sources';
import { extractDate } from './parser/idukay';

export const CSV_TEMPLATE = 'subject,title,due_date,description,child,priority,teacher\n'
  + 'Matemática,Resolver ejercicios 1-10,2026-10-12,Página 45,Gael,high,\n'
  + 'Lengua,Leer capítulo 3,2026-10-13,,Edric,normal,\n';

const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) { const v = row[k]; if (v && v.trim()) return v.trim(); }
  return '';
};

export function csvSource(today: string, children: Array<{ id: string; name: string }>): TaskSource<string> {
  return {
    id: 'import',
    toDrafts(text: string): ParsedTask[] {
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() });
      return parsed.data.slice(0, 500).map((row, i) => {
        const childName = pick(row, 'child', 'hijo', 'estudiante', 'student').toLowerCase();
        const child = children.find(c => c.name.toLowerCase() === childName) ?? (children.length === 1 ? children[0] : null);
        const rawDate = pick(row, 'due_date', 'fecha', 'due', 'entrega');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : (rawDate ? extractDate(rawDate, today).date : null);
        const pr = pick(row, 'priority', 'prioridad').toLowerCase();
        const t: ParsedTask = {
          key: `c${i}`, childId: child?.id ?? null,
          subject: pick(row, 'subject', 'materia').slice(0, 80),
          title: pick(row, 'title', 'tarea', 'task').slice(0, 200),
          description: pick(row, 'description', 'descripcion', 'descripción') || null,
          dueDate: date, teacher: pick(row, 'teacher', 'profesor') || null,
          priority: pr === 'high' || pr === 'alta' ? 'high' : pr === 'low' || pr === 'baja' ? 'low' : 'normal',
          warnings: [],
        };
        if (!t.subject) t.warnings.push('no_subject');
        if (!t.dueDate) t.warnings.push('no_date');
        else if (t.dueDate < today) t.warnings.push('past_date');
        return t;
      }).filter(t => t.title);
    },
  };
}
