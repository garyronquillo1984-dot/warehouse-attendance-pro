// Reads an employee list from Excel (.xlsx) or CSV and maps its columns to ours.
// Parsing happens in the browser; the database re-checks every row on import.

export interface ImportRow {
  line: number;                // row number as the person sees it in their spreadsheet
  employee_code: string;
  first_name: string;
  last_name: string;
  shift: string;
  department: string;
  hire_date: string;           // YYYY-MM-DD or '' (raw text kept when unreadable; the server reports it)
  status: string;              // 'active' | 'inactive' | ''
}

export type Field = 'employee_code' | 'first_name' | 'last_name' | 'full_name' | 'shift' | 'department' | 'hire_date' | 'status';

const ALIASES: Record<Field, string[]> = {
  employee_code: ['badge', 'badge id', 'badge #', 'badge number', 'badge no', 'employee id', 'employee code', 'employee #',
                  'employee number', 'emp id', 'associate id', 'id', 'code', 'file number', 'gafete', 'numero de empleado'],
  first_name: ['first name', 'first', 'given name', 'firstname', 'nombre', 'nombres'],
  last_name: ['last name', 'last', 'surname', 'family name', 'lastname', 'apellido', 'apellidos'],
  full_name: ['name', 'full name', 'employee name', 'associate name', 'employee', 'associate', 'nombre completo'],
  shift: ['shift', 'shift name', 'turno'],
  department: ['department', 'dept', 'area', 'departamento'],
  hire_date: ['hire date', 'start date', 'date hired', 'hired', 'fecha de ingreso'],
  status: ['status', 'estado', 'active'],
};

export const FIELD_LABELS: Record<Field, string> = {
  employee_code: 'Badge ID', first_name: 'First name', last_name: 'Last name', full_name: 'Full name',
  shift: 'Shift', department: 'Department', hire_date: 'Hire date', status: 'Status',
};

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[_\-.:]+/g, ' ').replace(/\s+/g, ' ').trim();

export function detectColumns(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const h = header.map(norm);
  (Object.keys(ALIASES) as Field[]).forEach(field => {
    // Aliases are in order of preference: "Badge ID" wins over a generic "ID" column.
    for (const alias of ALIASES[field]) {
      const idx = h.findIndex((col, i) => col === alias && !Object.values(map).includes(i));
      if (idx >= 0) { map[field] = idx; break; }
    }
  });
  return map;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

function toIsoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);         // US: month/day/year
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return s;
}

function splitName(full: string): [string, string] {
  const s = full.replace(/\s+/g, ' ').trim();
  if (s.includes(',')) {                                       // "Last, First"
    const [last, first] = s.split(',', 2).map(x => x.trim());
    return [first, last];
  }
  const parts = s.split(' ');
  if (parts.length === 1) return [parts[0], ''];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

function statusText(v: unknown): string {
  const s = norm(cellText(v));
  if (!s) return '';
  if (['inactive', 'terminated', 'no', 'false', 'inactivo', 'baja', 'n'].includes(s)) return 'inactive';
  return 'active';
}

export interface ParsedFile {
  header: string[];
  data: unknown[][];              // rows after the header
  headerLine: number;             // 1-based line of the header in the file
}

// The header is the first row (of the first 10) that names a badge column.
function findHeader(rows: unknown[][]): ParsedFile {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const header = rows[i].map(cellText);
    if (detectColumns(header).employee_code !== undefined) return { header, data: rows.slice(i + 1), headerLine: i + 1 };
  }
  const header = (rows[0] ?? []).map(cellText);
  return { header, data: rows.slice(1), headerLine: 1 };
}

export async function readFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = (await readSheet(file)) as unknown[][];
    return findHeader(rows);
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    return findHeader(res.data as unknown[][]);
  }
  if (name.endsWith('.xls')) throw new Error('OLD_EXCEL');
  throw new Error('UNSUPPORTED_FILE');
}

export function mapRows(file: ParsedFile, cols: Partial<Record<Field, number>>): ImportRow[] {
  const get = (r: unknown[], f: Field) => (cols[f] === undefined ? undefined : r[cols[f]!]);
  const out: ImportRow[] = [];
  file.data.forEach((r, i) => {
    if (!r.some(c => cellText(c) !== '')) return;              // skip blank lines
    let first = cellText(get(r, 'first_name'));
    let last = cellText(get(r, 'last_name'));
    if ((!first || !last) && cols.full_name !== undefined) {
      const [f, l] = splitName(cellText(get(r, 'full_name')));
      first = first || f; last = last || l;
    }
    out.push({
      line: file.headerLine + i + 1,
      employee_code: cellText(get(r, 'employee_code')).replace(/\.0+$/, ''),
      first_name: first,
      last_name: last,
      shift: cellText(get(r, 'shift')),
      department: cellText(get(r, 'department')),
      hire_date: toIsoDate(get(r, 'hire_date')),
      status: statusText(get(r, 'status')),
    });
  });
  return out;
}

export const IMPORT_ERRORS: Record<string, string> = {
  missing_badge: 'No badge ID',
  duplicate_in_file: 'Badge appears twice in the file',
  missing_name: 'First or last name missing',
  too_long: 'A value is too long',
  unknown_shift: 'Shift name doesn’t match any shift of this warehouse',
  bad_date: 'Hire date isn’t a date',
  other_warehouse: 'This badge belongs to an employee of another warehouse',
};

export const TEMPLATE_CSV = 'Badge ID,First name,Last name,Shift,Department,Hire date\n' +
  '10234,Maria,Lopez,First Shift,Picking,2026-09-14\n10235,James,Carter,Second Shift,Receiving,\n';
