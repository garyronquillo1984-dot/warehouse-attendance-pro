// Exports a report table as CSV, Excel or PDF. The heavy libraries load only when used.
import type { ReportTable } from './reports';

export interface ExportContext {
  company: string;
  scope: string;        // "DC-1 Columbus · First Shift"
  period: string;       // "Oct 1, 2026 – Oct 7, 2026"
  from: string;
  to: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fileBase = (t: ReportTable, c: ExportContext) =>
  `${slug(t.title)}_${c.from === c.to ? c.from : `${c.from}_to_${c.to}`}`;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Cells that start with = + - @ are prefixed so spreadsheet apps never run them as formulas.
const safe = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function exportCsv(t: ReportTable, c: ExportContext) {
  const esc = (v: string | number) => { const s = String(safe(v)); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [t.columns, ...t.rows].map(r => r.map(esc).join(','));
  save(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), fileBase(t, c) + '.csv');
}

export async function exportXlsx(t: ReportTable, c: ExportContext) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const title = [{ value: t.title, fontWeight: 'bold' as const, fontSize: 14 }];
  const meta = [{ value: `${c.company} · ${c.scope} · ${c.period}` }];
  const header = t.columns.map(h => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#E6E9E4' }));
  const body = t.rows.map(r => r.map(v => ({ value: safe(v) })));
  const widths = t.columns.map((h, i) => ({ width: Math.min(40, Math.max(h.length, ...t.rows.slice(0, 500).map(r => String(r[i] ?? '').length)) + 2) }));
  const blob = await writeXlsxFile([title, meta, [], header, ...body], {
    sheet: t.title.slice(0, 31), columns: widths, stickyRowsCount: 4,
  }).toBlob();
  save(blob, fileBase(t, c) + '.xlsx');
}

export async function exportPdf(t: ReportTable, c: ExportContext) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: t.wide ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  doc.setFillColor(242, 194, 48); doc.rect(40, 36, 6, 40, 'F');               // the floor-tape mark
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(28, 35, 33);
  doc.text(t.title, 56, 52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(91, 101, 96);
  doc.text(`${c.company} · ${c.scope}`, 56, 68);
  doc.text(c.period, 56, 82);
  autoTable(doc, {
    startY: 100,
    head: [t.columns],
    body: t.rows.length ? t.rows : [[{ content: 'No rows for this period.', colSpan: t.columns.length }]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, lineColor: [211, 216, 210], lineWidth: 0.5, textColor: [28, 35, 33] },
    headStyles: { fillColor: [28, 35, 33], textColor: [238, 240, 236], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 247, 244] },
    columnStyles: Object.fromEntries((t.numeric ?? []).map(i => [i, { halign: 'right' as const }])),
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(91, 101, 96);
      doc.text(`Warehouse Attendance Pro · Generated ${generated}`, 40, H - 20);
      doc.text(`Page ${doc.getNumberOfPages()}`, W - 40, H - 20, { align: 'right' });
    },
  });
  save(doc.output('blob'), fileBase(t, c) + '.pdf');
}
