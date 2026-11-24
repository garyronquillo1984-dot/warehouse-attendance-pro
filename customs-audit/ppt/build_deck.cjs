const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/0777aa91-7fb2-40be-a900-63cc359d604d_20ab9a28-fcf7-4580-a971-844b5fb97171/pptx/scripts/apply_theme.js');
const D = require('./data.json');
const THEME = { name: 'Self Assessment 2026', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '404040', lt2: 'F2F2F2', accent1: 'D40511', accent2: 'FFCC00', accent3: '00B050', accent4: 'FF0000', accent5: 'A6A6A6', accent6: '1F3864', hlink: '0563C1', folHlink: '954F72' } };
const RED = 'D40511', IC = 'FF0000', MC = 'FFFF00', UC = '00B050', NA = 'D9D9D9', GREY = '595959';
const pres = new pptxgen(); pres.layout = 'LAYOUT_4x3';
pres.theme = { headFontFace: 'Calibri', bodyFontFace: 'Calibri' };
pres.title = 'Country Customs Self-Assessment Program 2026 – corrected slides';
pres.defineSlideMaster({ title: 'CONTENT', background: { color: 'FFFFFF' },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.35, y: 0.7, w: 9.3, h: 0.55, fontSize: 20, bold: true, color: RED, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    { text: { text: 'DHL | Self Assessment Results | November 2026', options: { x: 0.35, y: 7.05, w: 5, h: 0.25, fontSize: 9, color: '000000', margin: 0 } } },
  ] });
const pct = v => Math.round(v * 100) + '%';
const fp = (s, t, orig, change, src) => {
  const sl = pres.addSlide({ masterName: 'CONTENT', sectionTitle: s });
  sl.addText(t, { placeholder: 'title' });
  if (orig) {
    sl.addText(String(orig), { x: 9.0, y: 7.05, w: 0.65, h: 0.25, fontSize: 9, align: 'right', margin: 0, isTextBox: true });
    sl.addText('CORRECTED – replaces slide ' + orig, { x: 7.0, y: 0.25, w: 2.65, h: 0.3, fontSize: 9, bold: true, color: 'FFFFFF', fill: { color: RED }, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  }
  if (src) sl.addText('Excel source: ' + src, { x: 4.6, y: 0.58, w: 5.05, h: 0.22, fontSize: 7.5, italic: true, color: '595959', align: 'right', margin: 0, isTextBox: true });
  if (change) sl.addNotes('Change vs. original slide ' + orig + ': ' + change + (src ? ' Excel source: ' + src + '.' : ''));
  return sl;
};
const chartBase = (o) => Object.assign({ barGrouping: 'percentStacked', chartColors: [IC, MC, UC, NA], showValue: true, dataLabelPosition: 'ctr', dataLabelFormatCode: '0%;;;',
  dataLabelFontSize: 7, dataLabelColor: '000000', catAxisLabelFontSize: 7, valAxisLabelFontSize: 7, valAxisLabelFormatCode: '0%', showLegend: true, legendPos: 'b', legendFontSize: 8,
  valGridLine: { color: 'E7E6E6', size: 0.5 }, catGridLine: { style: 'none' }, catAxisLabelFontFace: 'Calibri', valAxisLabelFontFace: 'Calibri', dataLabelFontFace: 'Calibri', legendFontFace: 'Calibri' }, o);
const series = (rows, idx0 = 1) => ['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A'].map((n, k) => ({ name: n, labels: rows.map(r => r[0]), values: rows.map(r => r[idx0 + k]) }));
const short = s => s.replace('1. About the DHL Express Global Customs Compliance Policy', '1. About the DHL Policy').replace('6. Reporting & Investigation of Material Violations', '6. Reporting & Investigation').replace('2. Customs Awareness & Risk Management', '2. Customs Awareness & Risk Mgmt');
const hdr = (arr, size = 8) => arr.map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: '1F3864' }, fontSize: size, align: 'center', valign: 'middle' } }));
const lvlCell = (v, size, bold) => { const m = { 'UNDER CONTROL': ['Under', 'C6EFCE', '006100'], 'MODERATE CONTROL': ['Moderate', 'FFEB9C', '7F6000'], 'INSUFFICIENT CONTROL': ['Insufficient', 'FFC7CE', '9C0006'], 'N/A': ['N/A', 'EDEDED', '595959'] }[v] || [v, 'FFFFFF', '000000'];
  return { text: m[0], options: { fill: { color: m[1] }, color: m[2], fontSize: size, align: 'center', bold: !!bold } }; };

// ---------- cover / index
pres.addSection({ title: 'Index' });
let s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Index' });
s.addText('Corrected slides – 2026 Self-Assessment presentation', { placeholder: 'title' });
s.addText('These slides replace the slides with the same number in "Country Customs Self-Assessment Program - 2026 UPDATED". All figures come from the corrected workbook "Self-Assessment Matrix 2026 – FINAL IMPROVED.xlsx" (sheet 14 – PPT Reconciliation shows every change). Text of opportunities and recommendations is kept as in the original; only data, country lists and labels were corrected.',
  { x: 0.35, y: 1.4, w: 9.3, h: 0.8, fontSize: 11, color: '000000', margin: 0, valign: 'top', isTextBox: true });
const idx = [['4', 'Overview per Section/Scope', 'Rebuilt from 2026 answers (9 countries were wrongly counted as N/A)'], ['5', 'Control per Country', '17 countries corrected (stale N/A in the matrix)'],
  ['6-8', 'Detailed results per country', '45 control results corrected (bold)'], ['9', 'Key Countries', 'Counts on one basis (questions); Bermuda 6, Paraguay added'],
  ['10', 'Results per Control', 'Rebuilt for the 36 Policy Sections'], ['11-12', 'Risk Assessment by Control', '25 of 36 rows corrected; 4 results change'],
  ['13', 'Self-Assessment Compliance', '6 countries corrected (Bermuda, Barbados, Cayman, Venezuela, Peru, Panama)'], ['15', 'Per Cluster', 'CAR, CSA, Canada corrected; N/A shown'],
  ['17-24', 'Results per Section/Scope', 'Rebuilt; slide 17 title/content fixed; countries with gaps complete'], ['26-33, 37', 'Key Countries boxes', 'Lists updated to 2026 answers'],
  ['39', 'Regional Action Plan 2026', '4.11 label corrected (Unauthorized Release); country list updated']];
s.addTable([hdr(['Slide', 'Topic', 'Correction'], 10)].concat(idx.map(r => r.map((t, j) => ({ text: t, options: { fontSize: 10, bold: j === 0, align: j === 0 ? 'center' : 'left' } })))),
  { x: 0.35, y: 2.35, w: 9.3, colW: [0.9, 2.8, 5.6], border: { type: 'solid', pt: 0.5, color: 'BFBFBF' }, rowH: 0.36, valign: 'middle' });

// ---------- slide 4
pres.addSection({ title: 'Overview results' });
s = fp('Overview results', 'Overview Results Per Section/Scope', 4, 'Original used the defective consolidated table (9 countries all N/A).', 'P04 – Results by Scope');
const s4 = [...D.s4].sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
s.addChart(pres.charts.BAR, series(s4.map(r => [short(r[0])].concat(r.slice(1)))), chartBase({ x: 0.35, y: 1.4, w: 9.3, h: 5.4, barDir: 'col', catAxisLabelFontSize: 8, dataLabelFontSize: 8 }));
// ---------- slide 5
s = fp('Overview results', 'Overview Results: Control Per Country', 5, 'Corrected control matrix (36 controls; N/A shown).', 'P05 – Control per Country');
s.addChart(pres.charts.BAR, series(D.s5), chartBase({ x: 0.2, y: 1.35, w: 9.6, h: 5.55, barDir: 'col', catAxisLabelRotate: 315, dataLabelFontSize: 6 }));
// ---------- slides 6-8
const countries = Object.keys(D.matrix).sort();
const groups = [countries.slice(0, 10), countries.slice(10, 21), countries.slice(21)];
groups.forEach((g, gi) => {
  s = fp('Overview results', 'Detailed Results Per Country: Control', 6 + gi, 'Bold cells = corrected vs. the original matrix.', '1. Data-Control Country Matrix');
  const rows = [hdr(['Control'].concat(g), 6.5)];
  D.labels.forEach((l, i) => rows.push([{ text: l, options: { fontSize: 6, align: 'left' } }].concat(g.map(c => lvlCell(D.matrix[c][i], 6, D.matrix[c][i] !== D.matrix_orig[c][i])))));
  s.addTable(rows, { x: 0.2, y: 1.35, w: 9.6, colW: [2.3].concat(g.map(() => 7.3 / g.length)), rowH: 0.145, border: { type: 'solid', pt: 0.3, color: 'BFBFBF' }, margin: 0.01, valign: 'middle' });
  s.addText('Bold = value corrected compared with the previous version (hardcoded N/A replaced by the country\'s actual answer).', { x: 0.2, y: 6.75, w: 9.6, h: 0.22, fontSize: 8, italic: true, color: GREY, margin: 0, isTextBox: true });
});
// ---------- slide 9
s = fp('Overview results', 'Key Countries', 9, 'Question-level counts for both lists; Bermuda 6 (not 3); Paraguay added.', 'P09 – Key Countries IC-MC');
s.addText('Controls – number of questions per country (2026 answers)', { x: 0.35, y: 1.35, w: 9, h: 0.3, fontSize: 11, bold: true, color: RED, margin: 0, isTextBox: true });
const kt = (x, title, list, col) => {
  s.addTable([[{ text: title, options: { bold: true, fontSize: 14, color: '000000', align: 'left' } }, { text: '', options: {} }]].concat(list.map(r => [{ text: r[0], options: { fontSize: 12 } }, { text: String(r[1]), options: { fontSize: 12, align: 'center', bold: true } }])),
    { x, y: 2.0, w: 3.6, colW: [2.8, 0.8], rowH: 0.42, border: { type: 'solid', pt: 1, color: col }, valign: 'middle' });
};
kt(1.0, 'Insufficient Control', D.s9_ic, IC); kt(5.2, 'Moderate Control', D.s9_mc, 'FFC000');
s.addText('Insufficient: countries with ≥ 3 Insufficient answers. Moderate: countries with ≥ 5 Moderate answers. Source: 02 – Country Ranking.', { x: 1.0, y: 5.6, w: 8, h: 0.4, fontSize: 9, italic: true, color: GREY, margin: 0, isTextBox: true });
// ---------- slide 10
s = fp('Overview results', 'Overview Results per Control', 10, 'Rebuilt for the 36 Policy Sections of the questionnaire (share of answers incl. N/A).', 'P10 – Results per Control');
const s10 = D.s10;  // same order and values as P10 (Under Control % ascending)
s.addChart(pres.charts.BAR, series(s10), chartBase({ x: 0.2, y: 1.35, w: 9.6, h: 5.6, barDir: 'bar', catAxisOrientation: 'maxMin', catAxisLabelFontSize: 6.5, dataLabelFontSize: 6 }));
// ---------- slide 11
pres.addSection({ title: 'Risk assessment' });
s = fp('Risk assessment', 'Risk Assessment by Control (Data)', 11, 'Counts recalculated from the corrected matrix; same weights and thresholds as the original sheet.', 'P11 – Control Risk (AM)');
const resCol = r => r === 'UNDER CONTROL' ? ['00B050', 'FFFFFF'] : r === 'MODERATE CONTROL' ? ['FFC000', '000000'] : ['FF0000', 'FFFFFF'];
const t11 = [hdr(['CONTROL', 'UNDER CONTROL v.', 'MODERATE CONTROL v.', 'INSUFFICIENT CONTROL v.', 'N/A v.', 'Score', 'Percentage', 'Regional Risk/Control Assessment'], 6.5)];
D.s11.forEach(r => { const c = resCol(r[8]); t11.push([{ text: r[0], options: { fontSize: 6.5, bold: true } }].concat([r[1], r[2], r[3], r[4]].map(v => ({ text: v ? String(v) : '', options: { fontSize: 6.5, align: 'center' } })),
  [{ text: String(r[5]).replace('.', ','), options: { fontSize: 6.5, align: 'center' } }, { text: pct(r[7]), options: { fontSize: 6.5, align: 'center' } }, { text: r[8], options: { fontSize: 6.5, fill: { color: c[0] }, color: c[1] } }])); });
s.addTable(t11, { x: 0.3, y: 1.35, w: 9.4, colW: [3.1, 0.85, 0.95, 1.05, 0.55, 0.55, 0.7, 1.65], rowH: 0.148, border: { type: 'solid', pt: 0.3, color: 'BFBFBF' }, margin: 0.01, valign: 'middle' });
// ---------- slide 12
s = fp('Risk assessment', 'Risk Assessment by Control', 12, 'Chart of corrected slide 11.', 'P11 – Control Risk (AM)');
const cls = ['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL'];
s.addChart(pres.charts.BAR, cls.map(c => ({ name: c, labels: D.s11.map(r => r[0]), values: D.s11.map(r => r[8] === c ? r[7] : 0) })),
  chartBase({ x: 0.2, y: 1.35, w: 9.6, h: 5.6, barDir: 'col', barGrouping: 'stacked', chartColors: [IC, MC, UC], dataLabelFormatCode: '0%;;;', dataLabelPosition: 'inEnd', valAxisMinVal: 0, valAxisMaxVal: 1, catAxisLabelRotate: 315, catAxisLabelFontSize: 6, dataLabelFontSize: 6, showTitle: true, title: 'Key Controls', titleFontSize: 12, titleFontFace: 'Calibri' }));
// ---------- slide 13
s = fp('Risk assessment', 'Self-Assessment Compliance', 13, 'Corrected weighted score per country (Under 1, Moderate 0.75, Insufficient 0; N/A excluded).', 'P13 – Compliance % Country');
s.addChart(pres.charts.BAR, [{ name: 'MODERATE CONTROL (< 91%)', labels: D.s13.map(r => r[0]), values: D.s13.map(r => r[1] < 0.91 ? r[1] : 0) }, { name: 'UNDER CONTROL (≥ 91%)', labels: D.s13.map(r => r[0]), values: D.s13.map(r => r[1] >= 0.91 ? r[1] : 0) }],
  chartBase({ x: 0.2, y: 1.35, w: 9.6, h: 5.6, barDir: 'col', barGrouping: 'stacked', chartColors: [MC, UC], dataLabelPosition: 'inEnd', dataLabelFormatCode: '0%;;;', valAxisMinVal: 0, valAxisMaxVal: 1, catAxisLabelRotate: 315, dataLabelFontSize: 6.5 }));
// ---------- slide 15
pres.addSection({ title: 'Results by cluster and section' });
s = fp('Results by cluster and section', 'Self-Assessment Per Cluster', 15, 'Corrected matrix; N/A column added.', 'P15 – Results per Cluster');
s.addTable([hdr(['CLUSTER', 'INSUFFICIENT', 'MODERATE', 'UNDER', 'N/A'], 9)].concat(D.s15.map(r => [{ text: r[0], options: { fontSize: 10, bold: true } }].concat(r.slice(1).map(v => ({ text: v ? pct(v) : '', options: { fontSize: 10, align: 'center' } }))))),
  { x: 0.3, y: 2.3, w: 4.2, colW: [1.0, 0.9, 0.8, 0.75, 0.75], rowH: 0.35, border: { type: 'solid', pt: 0.5, color: 'BFBFBF' }, valign: 'middle' });
s.addChart(pres.charts.BAR, series(D.s15), chartBase({ x: 4.7, y: 1.35, w: 5.1, h: 5.5, barDir: 'col', dataLabelFontSize: 8 }));
// ---------- slides 17-24
const scopeSlides = [['1. About the DHL Express Global Customs Compliance Policy', 17, 'About the DHL Express Global Customs Compliance Policy (1.6 / 1.7)'], ['2. Customs Awareness & Risk Management', 18, 'Customs Awareness & Risk Management'],
  ['3. Regulatory Supervision', 19, 'Regulatory Supervision'], ['4. Customs Process Controls', 20, 'Customs Process Controls'], ['5. Customs Representation', 21, 'Customs Representation'],
  ['6. Reporting & Investigation of Material Violations', 22, 'Reporting & Investigation of Material Violations'], ['7. Escalations', 23, 'Escalations'], ['Annex 1', 24, 'Annex 1 – Documentation of Local Procedures']];
scopeSlides.forEach(([key, n, ttl]) => {
  const st = D.scope_tables[key];
  s = fp('Results by cluster and section', ttl, n, 'Countries with at least one Moderate/Insufficient control in this section, corrected matrix.', st.excel ? st.excel.split('!')[0].replace(/'/g, '') : '');
  const rows = [hdr(['COUNTRY', 'CLUSTER', 'INSUFF.', 'MODERATE', 'UNDER', 'N/A'], 8)].concat(st.rows.map(r => [{ text: r[0], options: { fontSize: 8 } }, { text: r[1], options: { fontSize: 8, align: 'center' } }].concat(r.slice(2).map((v, k) => ({ text: v ? pct(v) : '', options: { fontSize: 8, align: 'center', bold: k < 2 && v > 0, color: k === 0 && v > 0 ? 'C00000' : '000000' } })))));
  const rh = Math.min(0.24, 5.0 / rows.length);
  s.addTable(rows, { x: 0.3, y: 1.4, w: 4.6, colW: [1.55, 0.75, 0.6, 0.65, 0.55, 0.5], rowH: rh, border: { type: 'solid', pt: 0.4, color: 'BFBFBF' }, valign: 'middle', margin: 0.02 });
  s.addText(`${st.controls.length} control(s) in this section: ${st.controls.join('; ')}.`, { x: 0.3, y: 6.55, w: 9.4, h: 0.4, fontSize: 8, italic: true, color: GREY, margin: 0, valign: 'top', isTextBox: true });
  s.addChart(pres.charts.BAR, series(st.rows.map(r => [r[0]].concat(r.slice(2)))), chartBase({ x: 5.1, y: 1.35, w: 4.7, h: Math.min(5.15, 1.0 + 0.32 * st.rows.length), barDir: 'bar', catAxisOrientation: 'maxMin', dataLabelFontSize: 7, catAxisLabelFontSize: 7 }));
});
// ---------- key country slides
pres.addSection({ title: 'Areas of opportunity' });
const T = require('./texts.json');
const box = (sl, ic, mc) => {
  const items = [{ text: 'Key Countries', options: { bold: true, fontSize: 13, breakLine: true } }, { text: 'Insufficient Control', options: { bold: true, fontSize: 10, color: 'C00000', breakLine: true } },
    { text: (ic.length ? ic.join(', ') : 'None'), options: { fontSize: 10, breakLine: true } }, { text: ' ', options: { fontSize: 5, breakLine: true } },
    { text: 'Moderate Control', options: { bold: true, fontSize: 10, color: 'B8860B', breakLine: true } }, { text: (mc.length ? mc.join(', ') : 'None'), options: { fontSize: 10 } }];
  sl.addText(items, { x: 6.9, y: 1.5, w: 2.8, h: 3.2, align: 'center', valign: 'top', margin: 0.15, line: { color: RED, width: 1.5 }, isTextBox: true });
};
T.forEach(t => {
  const ic = [], mc = [];
  const kb = D.keybox[String(t.slide)]; kb.ic.forEach(c => ic.push(c)); kb.mc.forEach(c => mc.push(c));
  s = fp('Areas of opportunity', t.title, t.slide, 'Key Countries box updated to 2026 answers (question level). Text unchanged.', 'P26 – Key Countries Boxes');
  const runs = [];
  t.blocks.forEach(b => { runs.push({ text: b.head, options: { bold: true, fontSize: 11, breakLine: true, paraSpaceBefore: 4 } }); b.items.forEach(it => runs.push({ text: it, options: { bullet: true, fontSize: 10, breakLine: true } })); });
  runs[runs.length - 1].options.breakLine = false;
  s.addText(runs, { x: 0.35, y: 1.5, w: 6.3, h: 5.3, valign: 'top', margin: 0, paraSpaceAfter: 2, isTextBox: true });
  box(s, ic, mc);
});
// ---------- slide 39
pres.addSection({ title: 'Regional actions' });
s = fp('Regional actions', 'Country Self Assessments – Regional Action Plan 2026', 39, '4.11 relabelled Unauthorized Release (URL) with its draft regional actions; country list from corrected scores.', 'Regional Actions Draft + P13 – Compliance % Country');
const R = D.rad; const act = r => (R.find(x => x[1] && x[1].trim().startsWith(r)) || [])[2] || '';
const t39 = [hdr(['Section', 'Area of Opportunity', 'Regional Actions'], 9),
  ['1. About the DHL Express Global Customs Compliance Policy', '1.7 Independence', act('1.7')], ['Annex 1', 'Documentation of Local Procedures', act('Documentation')],
  ['2. Customs Awareness & Risk Management', '2.3 Country Self-Assessment & Action Plan', act('2.3')], ['', '2.5 Personnel Training', act('2.5')],
  ['4. Customs Process Controls', '4.11 Unauthorized Release (URL)', act('4.11')], ['', '4.12 Export Clearance', act('4.12')], ['', '4.14 Regular Customs Declaration Quality Reviews', act('4.14')]]
  .map((r, i) => i === 0 ? r : r.map((v, j) => ({ text: (v || '').replace(/\n+$/, ''), options: { fontSize: 8.5, bold: j === 0, fill: j === 0 && v ? { color: 'FFE699' } : undefined } })));
s.addTable(t39, { x: 0.35, y: 1.4, w: 9.3, colW: [2.6, 2.6, 4.1], border: { type: 'solid', pt: 0.5, color: 'BFBFBF' }, valign: 'middle' });
const low = D.s13.slice(0, 5).map(r => `${r[0]} (${(r[1] * 100).toFixed(1)}%)`).join(', ');
s.addText([{ text: 'Countries with more opportunities identified (% Compliance, lowest first):', options: { fontSize: 11, bold: true, breakLine: true } }, { text: low, options: { fontSize: 11 } }],
  { x: 0.35, y: 6.0, w: 9.3, h: 0.7, margin: 0, valign: 'top', isTextBox: true });
(async () => { await pres.writeFile({ fileName: 'Country Customs Self-Assessment Program - 2026 CORRECTED SLIDES.pptx' }); await applyTheme('Country Customs Self-Assessment Program - 2026 CORRECTED SLIDES.pptx', THEME); console.log('ok'); })();
