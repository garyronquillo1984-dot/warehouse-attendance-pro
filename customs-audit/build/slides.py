"""F29 – one worksheet per presentation slide ("P" sheets) + 16 – Slide Data Index.

Each P sheet holds, in one place:
  A. the SLIDE TABLE (exactly what the slide shows, sorted by formula) and its chart,
  B. the CALCULATION block (every country / control, counted directly from the source sheets),
  C. a FORMULA GUIDE (the formula used in each column, as text) and the source chain.
No value on these sheets is typed by hand: all are formulas over the country answers
(07 – Source Data, built from the 32 country sheets) or the control matrix
(1. Data-Control Country Matrix).  Legacy sheets that feed old slides link to these tables."""
import json, os
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter as gl
from common import *

MXQ = "'1. Data-Control Country Matrix'"
LV = ['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A']
SHORT = ['Insufficient', 'Moderate', 'Under Control', 'N/A']
COL4 = ['FF0000', 'FFFF00', '00B050', 'BFBFBF']
CLMAP = ('{"CAR","Canada","Mexico","USA","Brazil","CSA","CSA"}', '{"Caribbean","CA","MX","US","BR","CO","CSA"}')
CLORD = '{"CAR","CSA","Canada","Mexico","USA","Brazil"}'
SLIDE_CL = ['CAR', 'CSA', 'Canada', 'Brazil', 'Mexico', 'USA']
H = 6          # header row of every slide table (data from row 7)
INPUT = 'FFF2CC'

P04 = 'P04 – Results by Scope'; P05 = 'P05 – Control per Country'; P09 = 'P09 – Key Countries IC-MC'
P10 = 'P10 – Results per Control'; P11 = 'P11 – Control Risk (AM)'; P13 = 'P13 – Compliance % Country'
P15 = 'P15 – Results per Cluster'; P26 = 'P26 – Key Countries Boxes'; SI = '16 – Slide Data Index'
SCOPE_SHEETS = [('1. About the DHL Express Global Customs Compliance Policy', 17, 'P17 – Scope 1 Policy', '1. About the DHL Express Global'),
                ('2. Customs Awareness & Risk Management', 18, 'P18 – Scope 2 Awareness-Risk', '2. Customs Awareness & Risk Man'),
                ('3. Regulatory Supervision', 19, 'P19 – Scope 3 Reg. Supervision', '3. Regulatory Supervision'),
                ('4. Customs Process Controls', 20, 'P20 – Scope 4 Process Controls', '4. Customs Process Controls'),
                ('5. Customs Representation', 21, 'P21 – Scope 5 Representation', '5. Customs Representation'),
                ('6. Reporting & Investigation of Material Violations', 22, 'P22 – Scope 6 Reporting', '6. Reporting & Investigation of'),
                ('7. Escalations', 23, 'P23 – Scope 7 Escalations', '7. Escalations '),
                ('Annex 1', 24, 'P24 – Annex 1 Procedures', 'Annex 1')]
assert SLIDE_SHEETS == [SI, P04, P05, P09, P10, P11, P13, P15] + [s[2] for s in SCOPE_SHEETS] + [P26]


def _hdr(ws, row, col0, heads, bg=NAVY):
    header_row(ws, row, col0, heads, bg=bg, height=32)


def _cell(ws, ref, v, fmt=None, bold=False, bg=None, size=9, wrap=False, align=None):
    c = ws[ref]; c.value = v
    cell_style(c, bold=bold, fmt=fmt, size=size, bg=bg, wrap=wrap, align=align)
    return c


def _intro(ws, slide, ttl, source, method):
    put(ws, 'A1', f'Slide {slide} – {ttl}', bold=True, size=15, color=NAVY)
    put(ws, 'A2', 'Source: ' + source, italic=True, size=9, color='595959')
    put(ws, 'A3', 'How it is calculated: ' + method, size=9, color='404040')
    c = ws['A4']; c.value = f'=HYPERLINK("#{q(SI)}!A1","« Slide Data Index")'
    c.font = Font(name=FONT, size=9, color='0563C1', underline='single')
    put(ws, 'C4', 'Every number on this sheet is a formula – no value is typed by hand.  Section A = what the slide shows; '
                  'section B = calculation for all items; section C = formula used in each column.', size=9, italic=True, color='7F6000', bg=INPUT)


def _sec(ws, row, text):
    put(ws, f'A{row}', text, bold=True, color=WHITE, bg=BLUE)
    for j in range(2, 12):
        ws.cell(row, j).fill = fill(BLUE)


def _guide(ws, row, items):
    """items: list of (column header, formula string of the first data row)."""
    _sec(ws, row, 'C. FORMULA GUIDE – formula used in the first data row of each column (copied down)')
    r = row + 1
    _hdr(ws, r, 1, ['Column', 'Formula (as text)'], bg=GREY[0]); ws.cell(r, 1).font = font(True, 9); ws.cell(r, 2).font = font(True, 9)
    for h, f in items:
        r += 1
        a = ws.cell(r, 1, h); cell_style(a, size=9, bold=True)
        b = ws.cell(r, 2, f); b.data_type = 's'; cell_style(b, size=8, wrap=False)
    return r + 1


def _chart(ws, anchor, cat_ref, val_cols, hdr_row, r0, r1, title, bar=True, w=16, h=None, fmt='0%', stacked=True, colors=COL4):
    ch = BarChart(); ch.type = 'bar' if bar else 'col'
    if stacked:
        ch.grouping = 'percentStacked'; ch.overlap = 100
    ch.title = title; ch.style = 10
    for k, col in enumerate(val_cols):
        data = Reference(ws, min_col=col, min_row=hdr_row, max_row=r1)
        ch.add_data(data, titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=cat_ref, min_row=r0, max_row=r1))
    for k, s in enumerate(ch.series):
        s.graphicalProperties.solidFill = colors[k % len(colors)]
        s.graphicalProperties.line.solidFill = colors[k % len(colors)]
    ch.dataLabels = DataLabelList(); ch.dataLabels.showVal = True; ch.dataLabels.numFmt = fmt
    ch.dataLabels.showSerName = False; ch.dataLabels.showCatName = False; ch.dataLabels.showLegendKey = False
    if bar:
        ch.y_axis.scaling.orientation = 'minMax'; ch.x_axis.scaling.orientation = 'maxMin'
    ch.y_axis.number_format = '0%'; ch.y_axis.majorGridlines = None
    ch.x_axis.delete = False; ch.y_axis.delete = False
    ch.legend.position = 'b'
    ch.width = w; ch.height = h or max(7, 0.55 * (r1 - r0 + 1) + 3)
    ws.add_chart(ch, anchor)


def _cluster_formula(ref):
    return f'IFERROR(INDEX({CLMAP[0]},MATCH(INDEX(reg_Cluster,MATCH({ref},reg_Country,0)),{CLMAP[1]},0)),INDEX(reg_Cluster,MATCH({ref},reg_Country,0)))'


def build(WS, g):
    REG, CTRL, SCOPES, M = g['REG'], g['CTRL'], g['SCOPES'], g['M']
    NC = len(REG); NCT = len(CTRL)
    R = g['R']
    try:
        prev = json.load(open(os.path.join(HERE, '..', 'ppt', 'data.json')))
        NROWS = {k: len(v['rows']) for k, v in prev['scope_tables'].items()}
    except Exception:
        NROWS = {}
    LAYP = {}
    index_rows = []

    # ------------------------------------------------------------------ P05 control per country (control level, 36 controls)
    ws = WS[P05]
    _intro(ws, 5, 'Control Level per Country (36 controls)',
           "1. Data-Control Country Matrix (one status per control and country, derived from the 61 answers of each country sheet).",
           'for each country, number of the 36 controls at each level / 36.  Sorted by Insufficient, then Moderate, then Under Control (descending).')
    n0 = H + 1; n1 = H + NC
    cb = n1 + 5; c0 = cb + 1; c1 = cb + NC
    _sec(ws, H - 1, 'A. SLIDE TABLE (sorted) – source of the slide table and chart')
    _hdr(ws, H, 1, ['#', 'Country', 'Cluster'] + LV)
    _sec(ws, cb - 1, 'B. CALCULATION – all countries (counts from the control matrix)')
    _hdr(ws, cb, 1, ['Country', 'Cluster', 'Matrix column'] + [f'{s} (n)' for s in SHORT] + ['Controls'] + [f'{s} %' for s in SHORT] + ['Sort key', 'Rank'])
    for i, c in enumerate(REG):
        r = c0 + i; col = c['matrix_col']; rg = f'{MXQ}!${col}$2:${col}$62'
        vals = [c['name'], '=' + _cluster_formula(f'A{r}'), col] + [f'=COUNTIF({rg},"{lv}")' for lv in LV] + [f'=SUM(D{r}:G{r})'] + \
               [f'=IF($H{r}=0,0,{x}{r}/$H{r})' for x in 'DEFG'] + \
               [f'=D{r}*10000+E{r}*100+F{r}+COUNTIF($A${c0}:$A${c1},">"&A{r})/1000', f'=RANK(M{r},$M${c0}:$M${c1},0)']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v, fmt=PCT if 9 <= j + 1 <= 12 else None)
    first = {h: v for h, v in zip(['Cluster', 'Insufficient (n)', 'Controls', 'Insufficient %', 'Sort key', 'Rank'],
                                   [ws[f'B{c0}'].value, ws[f'D{c0}'].value, ws[f'H{c0}'].value, ws[f'I{c0}'].value, ws[f'M{c0}'].value, ws[f'N{c0}'].value])}
    for k in range(1, NC + 1):
        r = H + k; mt = f'MATCH({k},$N${c0}:$N${c1},0)'
        _cell(ws, f'A{r}', k)
        _cell(ws, f'B{r}', f'=INDEX($A${c0}:$A${c1},{mt})', bold=True)
        _cell(ws, f'C{r}', f'=INDEX($B${c0}:$B${c1},{mt})')
        for j, src in enumerate('IJKL'):
            _cell(ws, f'{gl(4+j)}{r}', f'=INDEX(${src}${c0}:${src}${c1},{mt})', fmt=PCT)
    _chart(ws, 'I6', 2, [4, 5, 6, 7], H, n0, n1, 'Control level per country', w=18, h=22)
    _guide(ws, c1 + 3, [('B. Insufficient (n)', first['Insufficient (n)']), ('B. Controls', first['Controls']), ('B. Insufficient %', first['Insufficient %']),
                        ('B. Cluster', first['Cluster']), ('B. Sort key', first['Sort key']), ('B. Rank', first['Rank']),
                        ('A. Country (row 1)', ws[f'B{n0}'].value), ('A. Insufficient', ws[f'D{n0}'].value)])
    widths(ws, {'A': 22, 'B': 22, 'C': 10, 'D': 12, 'E': 12, 'F': 12, 'G': 10, 'H': 9})
    LAYP['P05'] = dict(t0=n0, t1=n1, c0=c0, c1=c1)
    index_rows.append((5, 'Control Level per Country', P05, f'A{H}:G{n1}', f'A{cb}:N{c1}', 'Bar chart (I6)', '1. Data-Control Country Matrix'))

    # ------------------------------------------------------------------ P15 cluster
    ws = WS[P15]
    _intro(ws, 15, 'Self-Assessment per Cluster', f"{P05} section B (control counts per country, from 1. Data-Control Country Matrix).",
           'controls at each level of all countries in the cluster / total controls of the cluster (countries × 36).')
    _sec(ws, H - 1, 'A. SLIDE TABLE – source of the slide table and chart')
    _hdr(ws, H, 1, ['Cluster'] + LV)
    cb = H + len(SLIDE_CL) + 5; cc0 = cb + 1
    _sec(ws, cb - 1, 'B. CALCULATION – control counts per cluster')
    _hdr(ws, cb, 1, ['Cluster', 'Countries'] + [f'{s} (n)' for s in SHORT] + ['Controls'])
    P5c = lambda col: f"{q(P05)}!${col}${LAYP['P05']['c0']}:${col}${LAYP['P05']['c1']}"
    for i, cl in enumerate(SLIDE_CL):
        r = cc0 + i
        vals = [cl, f'=COUNTIF({P5c("B")},A{r})'] + [f'=SUMIF({P5c("B")},$A{r},{P5c(x)})' for x in 'DEFGH']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v)
        rr = H + 1 + i
        _cell(ws, f'A{rr}', f'=A{r}', bold=True)
        for j, x in enumerate('CDEF'):
            _cell(ws, f'{gl(2+j)}{rr}', f'=IF($G{r}=0,0,{x}{r}/$G{r})', fmt=PCT)
    t1 = H + len(SLIDE_CL); cc1 = cc0 + len(SLIDE_CL) - 1
    r = cc1 + 1; _cell(ws, f'A{r}', 'Region', bold=True)
    for x in 'BCDEFG':
        _cell(ws, f'{x}{r}', f'=SUM({x}{cc0}:{x}{cc1})', bold=True)
    _chart(ws, 'H6', 1, [2, 3, 4, 5], H, H + 1, t1, 'Self-Assessment per Cluster', bar=False, w=16, h=10)
    _guide(ws, r + 3, [('B. Countries', ws[f'B{cc0}'].value), ('B. Insufficient (n)', ws[f'C{cc0}'].value), ('B. Controls', ws[f'G{cc0}'].value),
                       ('A. Insufficient %', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 18, 'B': 14, 'C': 14, 'D': 14, 'E': 12, 'F': 12, 'G': 10})
    LAYP['P15'] = dict(t0=H + 1, t1=t1, c0=cc0, c1=cc1)
    index_rows.append((15, 'Self-Assessment per Cluster', P15, f'A{H}:E{t1}', f'A{cb}:G{cc1+1}', 'Column chart (H6)', f'{P05} → 1. Data-Control Country Matrix'))

    # ------------------------------------------------------------------ P04 scope (answer level)
    ws = WS[P04]
    _intro(ws, 4, 'Overview Results per Section / Scope', '07 – Source Data (all 1,952 answers of the 32 country sheets; named ranges src_Scope / src_Std).',
           'answers of the scope at each level / all answers of the scope (32 countries × questions of the scope).')
    _sec(ws, H - 1, 'A. SLIDE TABLE – source of the slide table and chart')
    _hdr(ws, H, 1, ['Scope'] + LV)
    cb = H + len(SCOPES) + 5; s0 = cb + 1
    _sec(ws, cb - 1, 'B. CALCULATION – answers per scope')
    _hdr(ws, cb, 1, ['Scope'] + [f'{s} (n)' for s in SHORT] + ['Answers'])
    for i, s in enumerate(SCOPES):
        r = s0 + i
        vals = [s] + [f'=COUNTIFS(src_Scope,$A{r},src_Std,"{lv}")' for lv in LV] + [f'=COUNTIFS(src_Scope,$A{r})']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v)
        rr = H + 1 + i
        _cell(ws, f'A{rr}', f'=A{r}', bold=True)
        for j, x in enumerate('BCDE'):
            _cell(ws, f'{gl(2+j)}{rr}', f'=IF($F{r}=0,0,{x}{r}/$F{r})', fmt=PCT)
    t1 = H + len(SCOPES); s1 = s0 + len(SCOPES) - 1
    r = s1 + 1; _cell(ws, f'A{r}', 'Region', bold=True)
    for x in 'BCDEF':
        _cell(ws, f'{x}{r}', f'=SUM({x}{s0}:{x}{s1})', bold=True)
    _chart(ws, 'H6', 1, [2, 3, 4, 5], H, H + 1, t1, 'Results per Section / Scope', w=18, h=10)
    _guide(ws, r + 3, [('B. Insufficient (n)', ws[f'B{s0}'].value), ('B. Answers', ws[f'F{s0}'].value), ('A. Insufficient %', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 50, 'B': 13, 'C': 13, 'D': 13, 'E': 10, 'F': 10})
    LAYP['P04'] = dict(t0=H + 1, t1=t1)
    index_rows.append((4, 'Overview Results per Section/Scope', P04, f'A{H}:E{t1}', f'A{cb}:F{s1+1}', 'Bar chart (H6)', '07 – Source Data → 32 country sheets'))

    # ------------------------------------------------------------------ P09 key countries (answer level counts)
    ws = WS[P09]
    _intro(ws, 9, 'Key Countries – number of Insufficient / Moderate answers', '07 – Source Data (answers of the 32 country sheets).',
           'number of questions answered Insufficient (or Moderate) per country; listed when the count reaches the threshold in the yellow cells; sorted descending.')
    put(ws, 'A5', 'Threshold – Insufficient answers ≥', bold=True, size=9); _cell(ws, 'C5', 3, bg=INPUT, bold=True)
    put(ws, 'E5', 'Threshold – Moderate answers ≥', bold=True, size=9); _cell(ws, 'G5', 5, bg=INPUT, bold=True)
    _hdr(ws, H, 1, ['#', 'Country – Insufficient', 'Insufficient answers']); _hdr(ws, H, 5, ['#', 'Country – Moderate', 'Moderate answers'])
    cb = H + NC + 5; c0 = cb + 1; c1 = cb + NC
    _sec(ws, cb - 1, 'B. CALCULATION – answers per country')
    _hdr(ws, cb, 1, ['Country', 'Insufficient answers', 'Moderate answers', 'Key IC', 'Rank IC', 'Key MC', 'Rank MC'])
    for i, c in enumerate(REG):
        r = c0 + i
        vals = [c['name'], f'=COUNTIFS(src_Country,$A{r},src_Std,"INSUFFICIENT CONTROL")', f'=COUNTIFS(src_Country,$A{r},src_Std,"MODERATE CONTROL")',
                f'=IF(B{r}>=$C$5,B{r}+COUNTIF($A${c0}:$A${c1},">"&A{r})/1000,-1)', f'=IF(D{r}<0,"",RANK(D{r},$D${c0}:$D${c1},0))',
                f'=IF(C{r}>=$G$5,C{r}+COUNTIF($A${c0}:$A${c1},">"&A{r})/1000,-1)', f'=IF(F{r}<0,"",RANK(F{r},$F${c0}:$F${c1},0))']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v)
    for k in range(1, NC + 1):
        r = H + k
        for (a, b, c_, rk, cnt) in [('A', 'B', 'C', 'E', 'B'), ('E', 'F', 'G', 'G', 'C')]:
            mt = f'MATCH({k},${rk}${c0}:${rk}${c1},0)'
            _cell(ws, f'{a}{r}', f'=IF(ISNA({mt}),"",{k})')
            _cell(ws, f'{b}{r}', f'=IFERROR(INDEX($A${c0}:$A${c1},{mt}),"")', bold=True)
            _cell(ws, f'{c_}{r}', f'=IFERROR(INDEX(${cnt}${c0}:${cnt}${c1},{mt}),"")')
    _guide(ws, c1 + 3, [('B. Insufficient answers', ws[f'B{c0}'].value), ('B. Key IC', ws[f'D{c0}'].value), ('B. Rank IC', ws[f'E{c0}'].value),
                        ('A. Country – Insufficient', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 22, 'B': 24, 'C': 14, 'D': 10, 'E': 8, 'F': 24, 'G': 14})
    LAYP['P09'] = dict(t0=H + 1, t1=H + NC)
    index_rows.append((9, 'Key Countries (IC ≥ 3 / MC ≥ 5 answers)', P09, f'A{H}:G{H+NC}', f'A{cb}:G{c1}', '—', '07 – Source Data → 32 country sheets'))

    # ------------------------------------------------------------------ P10 per control (answer level, weakest first)
    ws = WS[P10]
    _intro(ws, 10, 'Results per Policy Section (36 controls)', '07 – Source Data (answers; named ranges src_Section / src_Std).',
           'answers of the control at each level / all answers of the control (incl. N/A).  Sorted by Under Control % from lowest to highest (ties: more Insufficient first, then more Moderate).')
    _sec(ws, H - 1, 'A. SLIDE TABLE (sorted by Under Control %, lowest to highest)')
    _hdr(ws, H, 1, ['#', 'Policy Section (control)'] + LV)
    cb = H + NCT + 5; c0 = cb + 1; c1 = cb + NCT
    _sec(ws, cb - 1, 'B. CALCULATION – answers per control')
    _hdr(ws, cb, 1, ['Policy Section (control)', 'Scope'] + [f'{s} (n)' for s in SHORT] + ['Answers'] + [f'{s} %' for s in SHORT] + ['Sort key (UC % ascending)', 'Rank'])
    for i, ct in enumerate(CTRL):
        r = c0 + i
        vals = [ct['label'], M[ct['qs'][0] - 1]['scope']] + [f'=COUNTIFS(src_Section,$A{r},src_Std,"{lv}")' for lv in LV] + [f'=SUM(C{r}:F{r})'] + \
               [f'=IF($G{r}=0,0,{x}{r}/$G{r})' for x in 'CDEF'] + [f'=J{r}-C{r}/100000-D{r}/10000000+ROW()/1000000000', f'=RANK(L{r},$L${c0}:$L${c1},1)']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v, fmt=PCT if 8 <= j + 1 <= 11 else None)
    for k in range(1, NCT + 1):
        r = H + k; mt = f'MATCH({k},$M${c0}:$M${c1},0)'
        _cell(ws, f'A{r}', k); _cell(ws, f'B{r}', f'=INDEX($A${c0}:$A${c1},{mt})', bold=True)
        for j, src in enumerate('HIJK'):
            _cell(ws, f'{gl(3+j)}{r}', f'=INDEX(${src}${c0}:${src}${c1},{mt})', fmt=PCT)
    _chart(ws, 'H6', 2, [3, 4, 5, 6], H, H + 1, H + NCT, 'Results per control (Under Control: lowest to highest)', w=20, h=24)
    _guide(ws, c1 + 3, [('B. Insufficient (n)', ws[f'C{c0}'].value), ('B. Insufficient %', ws[f'H{c0}'].value), ('B. Sort key (UC % ascending)', ws[f'L{c0}'].value),
                        ('B. Rank', ws[f'M{c0}'].value), ('A. Control', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 44, 'B': 44, 'C': 12, 'D': 12, 'E': 12, 'F': 10})
    LAYP['P10'] = dict(t0=H + 1, t1=H + NCT, c0=c0, c1=c1)
    index_rows.append((10, 'Results per Policy Section (controls)', P10, f'A{H}:F{H+NCT}', f'A{cb}:M{c1}', 'Bar chart (H6)', '07 – Source Data → 32 country sheets'))

    # ------------------------------------------------------------------ P11 control risk (country level, AM method)
    ws = WS[P11]
    _intro(ws, 11, 'Regional Risk / Control Assessment per control', '1. Data-Control Country Matrix (control status of each country).',
           'number of COUNTRIES at each level for the control; score = UC×w1 + MC×w2 + IC×w3; % = score / (UC+MC+IC); result: >91% Under, ≥61% Moderate, else Insufficient '
           '(method of the original sheet 4.Final-AM Risk Assessment; weights in the yellow cells).  Sorted lowest % first.')
    put(ws, 'A5', 'Weights (UC / MC / IC):', bold=True, size=9)
    _cell(ws, 'C5', 1, bg=INPUT, bold=True); _cell(ws, 'D5', 0.5, bg=INPUT, bold=True); _cell(ws, 'E5', 0, bg=INPUT, bold=True)
    put(ws, 'G5', 'Thresholds (Under > / Moderate ≥):', bold=True, size=9); _cell(ws, 'J5', 0.91, bg=INPUT, bold=True, fmt='0%'); _cell(ws, 'K5', 0.61, bg=INPUT, bold=True, fmt='0%')
    heads = ['#', 'Policy Section (control)', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Score', 'Total', '%', 'Result']
    _hdr(ws, H, 1, heads)
    cb = H + NCT + 5; c0 = cb + 1; c1 = cb + NCT
    _sec(ws, cb - 1, 'B. CALCULATION – countries per control (country columns of the matrix are every 3rd column, F … CU)')
    _hdr(ws, cb, 1, ['Policy Section (control)', 'Matrix row', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Score', 'Total', '%', 'Result', 'Sort key', 'Rank'])
    for i, ct in enumerate(CTRL):
        r = c0 + i; mr = ct['rows'][0]; rg = f'{MXQ}!$F${mr}:$CU${mr}'
        cnt = lambda lv: f'=SUMPRODUCT((MOD(COLUMN({rg}),3)=0)*({rg}="{lv}"))'
        vals = [ct['label'], mr, cnt('UNDER CONTROL'), cnt('MODERATE CONTROL'), cnt('INSUFFICIENT CONTROL'), cnt('N/A'),
                f'=C{r}*$C$5+D{r}*$D$5+E{r}*$E$5', f'=C{r}+D{r}+E{r}', f'=IF(H{r}=0,0,G{r}/H{r})',
                f'=IF(I{r}>$J$5,"UNDER CONTROL",IF(I{r}>=$K$5,"MODERATE CONTROL","INSUFFICIENT CONTROL"))',
                f'=I{r}+COUNTIF($A${c0}:$A${c1},"<"&A{r})/1000000', f'=RANK(K{r},$K${c0}:$K${c1},1)']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v, fmt=PCT if j == 8 else None)
    for k in range(1, NCT + 1):
        r = H + k; mt = f'MATCH({k},$L${c0}:$L${c1},0)'
        _cell(ws, f'A{r}', k)
        for j, src in enumerate('ACDEFGHIJ'):
            _cell(ws, f'{gl(2+j)}{r}', f'=INDEX(${src}${c0}:${src}${c1},{mt})', fmt=PCT if src == 'I' else None, bold=src == 'A')
    _guide(ws, c1 + 3, [('B. Under Control', ws[f'C{c0}'].value), ('B. Score', ws[f'G{c0}'].value), ('B. %', ws[f'I{c0}'].value),
                        ('B. Result', ws[f'J{c0}'].value), ('B. Rank', ws[f'L{c0}'].value), ('A. Control', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 44, 'B': 44, 'C': 12, 'D': 11, 'E': 11, 'F': 8, 'G': 8, 'H': 8, 'I': 8, 'J': 22})
    LAYP['P11'] = dict(t0=H + 1, t1=H + NCT)
    index_rows.append((11, 'Regional Risk / Control Assessment', P11, f'A{H}:J{H+NCT}', f'A{cb}:L{c1}', '—', '1. Data-Control Country Matrix'))

    # ------------------------------------------------------------------ P13 compliance %
    ws = WS[P13]
    _intro(ws, 13, '% Compliance per Country', '07 – Source Data (answers) + weights p_W_UC / p_W_MC / p_W_IC (08 – Config & Methodology); classification from 02 – Country Ranking.',
           'score = (UC×w_UC + MC×w_MC + IC×w_IC) / applicable answers (N/A excluded).  Sorted lowest score first.')
    _hdr(ws, H, 1, ['#', 'Country', '% Compliance (score)', 'Classification'])
    cb = H + NC + 5; c0 = cb + 1; c1 = cb + NC
    _sec(ws, cb - 1, 'B. CALCULATION – answers per country')
    _hdr(ws, cb, 1, ['Country'] + [f'{s} (n)' for s in SHORT] + ['Applicable', 'Score', 'Classification', 'Sort key', 'Rank'])
    for i, c in enumerate(REG):
        r = c0 + i
        vals = [c['name']] + [f'=COUNTIFS(src_Country,$A{r},src_Std,"{lv}")' for lv in LV] + [f'=B{r}+C{r}+D{r}',
                f'=IF(F{r}=0,"",(D{r}*p_W_UC+C{r}*p_W_MC+B{r}*p_W_IC)/F{r})',
                f"=IFERROR(INDEX({q(R)}!$P$6:$P${5+NC},MATCH(A{r},{q(R)}!$B$6:$B${5+NC},0)),\"\")",
                f'=IF(G{r}="",9,G{r})+COUNTIF($A${c0}:$A${c1},"<"&A{r})/1000000', f'=RANK(I{r},$I${c0}:$I${c1},1)']
        for j, v in enumerate(vals):
            _cell(ws, f'{gl(j+1)}{r}', v, fmt=PCT if j == 6 else None)
    for k in range(1, NC + 1):
        r = H + k; mt = f'MATCH({k},$J${c0}:$J${c1},0)'
        _cell(ws, f'A{r}', k); _cell(ws, f'B{r}', f'=INDEX($A${c0}:$A${c1},{mt})', bold=True)
        _cell(ws, f'C{r}', f'=INDEX($G${c0}:$G${c1},{mt})', fmt=PCT); _cell(ws, f'D{r}', f'=INDEX($H${c0}:$H${c1},{mt})')
    _chart(ws, 'F6', 2, [3], H, H + 1, H + NC, '% Compliance per country', w=16, h=20, fmt='0.0%', stacked=False, colors=['2F5597'])
    _guide(ws, c1 + 3, [('B. Insufficient (n)', ws[f'B{c0}'].value), ('B. Score', ws[f'G{c0}'].value), ('B. Classification', ws[f'H{c0}'].value),
                        ('B. Rank', ws[f'J{c0}'].value), ('A. Country', ws[f'B{H+1}'].value)])
    widths(ws, {'A': 22, 'B': 22, 'C': 16, 'D': 32, 'E': 10, 'F': 11, 'G': 10, 'H': 32})
    LAYP['P13'] = dict(t0=H + 1, t1=H + NC)
    index_rows.append((13, '% Compliance per Country', P13, f'A{H}:D{H+NC}', f'A{cb}:J{c1}', 'Bar chart (F6)', '07 – Source Data → 32 country sheets; 02 – Country Ranking'))

    # ------------------------------------------------------------------ P17-P24 scope slides
    for scope, slide, sh, legacy in SCOPE_SHEETS:
        ws = WS[sh]
        ctl = [c for c in CTRL if M[c['qs'][0] - 1]['scope'] == scope]
        ra, rb = min(c['rows'][0] for c in ctl), max(c['rows'][-1] for c in ctl)
        _intro(ws, slide, scope, f"1. Data-Control Country Matrix, rows {ra}-{rb} (controls: {'; '.join(c['label'] for c in ctl)}).",
               f'for each country, controls of this scope at each level / {len(ctl)} control(s).  The slide lists the countries with at least one Insufficient or '
               'Moderate control, sorted by cluster (CAR, CSA, Canada, Mexico, USA, Brazil), then Insufficient % and Moderate % (descending).')
        _sec(ws, H - 1, 'A. SLIDE TABLE – countries with Insufficient or Moderate Control (blank rows = no more countries)')
        _hdr(ws, H, 1, ['#', 'Country', 'Cluster'] + LV)
        cb = H + NC + 5; c0 = cb + 1; c1 = cb + NC
        _sec(ws, cb - 1, 'B. CALCULATION – all 32 countries')
        _hdr(ws, cb, 1, ['Country', 'Cluster', 'Cluster order'] + [f'{s} (n)' for s in SHORT] + ['Controls'] + [f'{s} %' for s in SHORT] + ['Gap (IC or MC)', 'Sort key', 'Rank'])
        for i, c in enumerate(REG):
            r = c0 + i; col = c['matrix_col']; rg = f'{MXQ}!${col}${ra}:${col}${rb}'
            vals = [c['name'], '=' + _cluster_formula(f'A{r}'), f'=IFERROR(MATCH(B{r},{CLORD},0),7)'] + [f'=COUNTIF({rg},"{lv}")' for lv in LV] + \
                   [len(ctl)] + [f'=IF($H{r}=0,0,{x}{r}/$H{r})' for x in 'DEFG'] + [f'=IF(D{r}+E{r}>0,1,0)',
                    f'=IF(M{r}=1,C{r}*1000+(1-I{r})*100+(1-J{r})+COUNTIF($A${c0}:$A${c1},"<"&A{r})/1000,99999)', f'=IF(M{r}=1,RANK(N{r},$N${c0}:$N${c1},1),"")']
            for j, v in enumerate(vals):
                _cell(ws, f'{gl(j+1)}{r}', v, fmt=PCT if 9 <= j + 1 <= 12 else None)
        for k in range(1, NC + 1):
            r = H + k; mt = f'MATCH({k},$O${c0}:$O${c1},0)'
            _cell(ws, f'A{r}', f'=IF(ISNA({mt}),"",{k})')
            _cell(ws, f'B{r}', f'=IFERROR(INDEX($A${c0}:$A${c1},{mt}),"")', bold=True)
            _cell(ws, f'C{r}', f'=IFERROR(INDEX($B${c0}:$B${c1},{mt}),"")')
            for j, src in enumerate('IJKL'):
                _cell(ws, f'{gl(4+j)}{r}', f'=IFERROR(INDEX(${src}${c0}:${src}${c1},{mt}),"")', fmt=PCT)
        n = max(1, NROWS.get(scope, 10))
        put(ws, 'I5', f'="Countries with gaps: "&SUM(M{c0}:M{c1})&"  |  chart rows: {n}"&IF(SUM(M{c0}:M{c1})>{n},"  -> extend the chart data range","  (OK)")', size=9, bold=True)
        _chart(ws, 'I6', 2, [4, 5, 6, 7], H, H + 1, H + n, scope, w=17, h=max(7, 0.6 * n + 3))
        _guide(ws, c1 + 3, [('B. Insufficient (n)', ws[f'D{c0}'].value), ('B. Insufficient %', ws[f'I{c0}'].value), ('B. Gap', ws[f'M{c0}'].value),
                            ('B. Sort key', ws[f'N{c0}'].value), ('B. Rank', ws[f'O{c0}'].value), ('B. Cluster', ws[f'B{c0}'].value),
                            ('A. Country', ws[f'B{H+1}'].value)])
        widths(ws, {'A': 22, 'B': 22, 'C': 10, 'D': 12, 'E': 12, 'F': 12, 'G': 10, 'H': 9})
        LAYP[sh] = dict(t0=H + 1, t1=H + NC, c0=c0, c1=c1, n=n, scope=scope, legacy=legacy, slide=slide)
        index_rows.append((slide, scope, sh, f'A{H}:G{H+NC}', f'A{cb}:O{c1}', 'Bar chart (I6)', f'1. Data-Control Country Matrix rows {ra}-{rb}'))

    # ------------------------------------------------------------------ P26 key-country boxes
    ws = WS[P26]
    T = json.load(open(os.path.join(HERE, '..', 'ppt', 'texts.json')))
    _intro(ws, '26-33, 37', 'Key Countries boxes (areas of opportunity)', '07 – Source Data (answers per question, control and country).',
           'a country is listed under "Insufficient" if at least one of its answers in the slide\'s control(s) is Insufficient; under "Moderate" if it has a Moderate '
           'answer and no Insufficient one.')
    _sec(ws, H - 1, 'A. SLIDE BOXES')
    _hdr(ws, H, 1, ['Slide', 'Topic', 'Control(s)', 'Insufficient Control – countries', 'Moderate Control – countries'])
    r = H + len(T) + 4
    for i, t in enumerate(T):
        _sec(ws, r, f'B{i+1}. CALCULATION – slide {t["slide"]}: {t["title"]}')
        _hdr(ws, r + 1, 1, ['Country', 'Insufficient answers', 'Moderate answers', 'Insufficient list (cumulative)', 'Moderate-only list (cumulative)'])
        b0 = r + 2; b1 = b0 + NC - 1
        for j, c in enumerate(REG):
            rr = b0 + j
            ic = '+'.join(f'COUNTIFS(src_Country,$A{rr},src_Section,"{ct}",src_Std,"INSUFFICIENT CONTROL")' for ct in t['controls'])
            mc = ic.replace('INSUFFICIENT CONTROL', 'MODERATE CONTROL')
            prevD = f'D{rr-1}&' if j else ''; prevE = f'E{rr-1}&' if j else ''
            vals = [c['name'], '=' + ic, '=' + mc, f'={prevD}IF(B{rr}>0,A{rr}&", ","")', f'={prevE}IF(AND(B{rr}=0,C{rr}>0),A{rr}&", ","")']
            for k_, v in enumerate(vals):
                _cell(ws, f'{gl(k_+1)}{rr}', v, size=8)
        rs = H + 1 + i
        _cell(ws, f'A{rs}', t['slide'], bold=True); _cell(ws, f'B{rs}', t['title'], wrap=True); _cell(ws, f'C{rs}', '; '.join(t['controls']), wrap=True)
        _cell(ws, f'D{rs}', f'=IF(D{b1}="","None",LEFT(D{b1},LEN(D{b1})-2))', wrap=True)
        _cell(ws, f'E{rs}', f'=IF(E{b1}="","None",LEFT(E{b1},LEN(E{b1})-2))', wrap=True)
        ws.row_dimensions[rs].height = 45
        if i == 0:
            g0 = dict(ic=ws[f'B{b0}'].value, lst=ws[f'D{b0+1}'].value, box=ws[f'D{rs}'].value)
        r = b1 + 3
    _guide(ws, r, [('B. Insufficient answers (slide 26)', g0['ic']), ('B. Insufficient list (cumulative)', g0['lst']), ('A. Box list', g0['box'])])
    widths(ws, {'A': 22, 'B': 34, 'C': 40, 'D': 60, 'E': 60})
    LAYP['P26'] = dict(t0=H + 1, t1=H + len(T))
    index_rows.append(('26-33, 37', 'Key Countries boxes', P26, f'A{H}:E{H+len(T)}', 'blocks B1…B9 below', '—', '07 – Source Data → 32 country sheets'))

    # ------------------------------------------------------------------ 16 index
    ws = WS[SI]
    title(ws, 'Slide Data Index – where every table and chart of the presentation comes from',
          'One worksheet per slide (P-sheets). Each P-sheet: A = slide table + chart, B = calculation for every country / control, C = formula guide. '
          'All values are formulas over the 32 country sheets (via 07 – Source Data) or 1. Data-Control Country Matrix.')
    nav(ws)
    extra = [(6, 'Control matrix by country (slides 6-8)', '1. Data-Control Country Matrix', 'B1:CU62', '—', '—', '32 country sheets (VLOOKUP of each answer)'),
             (39, 'Regional Action Plan 2026 (lowest scores)', P13, f'A{H}:D{H+5}', '—', '—', 'Regional Actions Draft (text) + P13 (5 lowest scores)')]
    rows = sorted(index_rows + extra, key=lambda x: int(str(x[0]).split('-')[0].split(',')[0]))
    _hdr(ws, 5, 1, ['Slide', 'Title', 'Worksheet (click)', 'Slide table', 'Calculation block', 'Chart', 'Source chain'])
    for i, (sl, t_, shn, tab, calc, chrt, src) in enumerate(rows):
        r = 6 + i
        vals = [sl, t_, f'=HYPERLINK("#{q(shn)}!A1","{shn}")', tab, calc, chrt, src]
        for j, v in enumerate(vals):
            c = _cell(ws, f'{gl(j+1)}{r}', v, wrap=j in (1, 6))
            if j == 2: c.font = Font(name=FONT, size=9, color='0563C1', underline='single')
    r = 6 + len(rows) + 2
    put(ws, f'A{r}', 'Legacy sheets that used to hold these tables now LINK to the P-sheets (no typed values):', bold=True, color=NAVY)
    leg = [('1. About the DHL Express Global … Annex 1, 6., 7. (rows 2-5 and slide tables A8/A9)', 'P17 … P24'),
           ('Self Assessment Results C121:F126 and C133:F138 (cluster chart / table)', P15),
           ('4. Customs Process Controls A80:E115 (per-control chart)', P10)]
    for i, (a, b) in enumerate(leg):
        _cell(ws, f'A{r+1+i}', a, wrap=True); ws.merge_cells(f'A{r+1+i}:D{r+1+i}'); _cell(ws, f'E{r+1+i}', b)
    widths(ws, {'A': 10, 'B': 40, 'C': 32, 'D': 14, 'E': 18, 'F': 14, 'G': 46})
    ws.freeze_panes = 'A6'
    for shn in SLIDE_SHEETS:
        WS[shn].sheet_view.showGridLines = False
    return LAYP
