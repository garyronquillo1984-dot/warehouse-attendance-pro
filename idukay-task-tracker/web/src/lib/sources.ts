// Ways homework can enter the app. Each source turns some input into draft rows that the
// ADMINISTRATOR reviews before publishing (parents never write anything).
//
//   manual  — the admin homework form
//   paste   — text copied from Idukay → parser/idukay.ts
//   import  — CSV file → csv.ts (a PDF adapter would extract text, then reuse the paste parser)
//   integration — a future, AUTHORIZED school-platform API. It would run server-side and
//                 upsert by (user_id, source, external_id); it must never scrape or use the
//                 parent's school credentials.
import type { ParsedTask } from './parser/idukay';

export interface TaskSource<Input> {
  id: 'paste' | 'import' | 'integration';
  toDrafts(input: Input): ParsedTask[] | Promise<ParsedTask[]>;
}
