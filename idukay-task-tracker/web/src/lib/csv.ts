// CSV import (same review screen as the paste parser).
import Papa from 'papaparse';
import type { ParsedTask } from './parser/idukay';
import type { TaskSource } from './sources';
import { extractDate } from './parser/idukay';

export const CSV_TEMPLATE = 'subject,title,start_date,due_date,instructions,parent_explanation,language,teacher\n'
  + 'Matemática,Ejercicios 15–20,2026-10-08,2026-10-09,Resolver los ejercicios 15 al 20 de la página 42.,,es,\n'
  + 'Language Arts,Read Chapter 4,2026-10-08,2026-10-09,Read Chapter 4 and answer questions 1–5.,Lee el capítulo 4 y responde las preguntas 1–5.,en,\n';

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
        const asDate = (raw: string) => /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : (raw ? extractDate(raw, today).date : null);
        const date = asDate(pick(row, 'due_date', 'fecha', 'due', 'entrega'));
        const pr = pick(row, 'priority', 'prioridad').toLowerCase();
        const t: ParsedTask = {
          key: `c${i}`, childId: child?.id ?? null,
          subject: pick(row, 'subject', 'materia').slice(0, 80),
          title: pick(row, 'title', 'tarea', 'task').slice(0, 200),
          description: pick(row, 'instructions', 'description', 'descripcion', 'descripción', 'instrucciones') || null,
          parentExplanation: pick(row, 'parent_explanation', 'explicacion', 'explicación', 'traduccion', 'traducción') || null,
          startDate: asDate(pick(row, 'start_date', 'inicio', 'publicacion', 'publicación')),
          language: (['en', 'es', 'other'] as const).find(l => l === pick(row, 'language', 'idioma').toLowerCase()) ?? null,
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
