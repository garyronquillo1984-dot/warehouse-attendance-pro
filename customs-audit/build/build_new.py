"""Builds the new analytical worksheets in a standalone workbook (new_sheets.xlsx).
merge.py then injects them into the ORIGINAL workbook package (so legacy charts,
PivotTables, comments and tables are preserved byte-for-byte)."""
import sys
from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.styles import Alignment, Font
from openpyxl.formatting.rule import FormulaRule, ColorScaleRule, CellIsRule, DataBarRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.shapes import GraphicalProperties
from common import *
import content

M = CFG['master']; CTRL = CFG['controls']; REG = CFG['reg']; API = CFG['apinfo']
for c in CTRL:
    if c['idx'] == 10: c['label'] = '2.8 Interaction with Authorities'
for m in M:
    m['control'] = CTRL[m['control_idx'] - 1]['label']
SCOPES = []
for m in M:
    if m['scope'] not in SCOPES: SCOPES.append(m['scope'])
NC = len(REG); NQ = len(M)

wb = Workbook()
wb.remove(wb.active)
WS = {n: wb.create_sheet(n) for n in NEW_SHEETS}
NAMES = {}


def name(n, sheet, ref):
    NAMES[n] = f"{q(sheet)}!{ref}"


def absr(col, r1, r2):
    return f"${col}${r1}:${col}${r2}"


# ======================================================================= 08 CONFIG
ws = WS[CF]
title(ws, 'Configuration & Methodology',
      'Single source of parameters, label mappings, country register and question master used by all analytical sheets. Yellow cells = editable inputs.')
nav(ws)
widths(ws, {'A': 8, 'B': 44, 'C': 16, 'D': 90, 'E': 34, 'F': 30, 'G': 18})
put(ws, 'A5', 'A. Analytical parameters (proposed analytical model – requires management validation; NOT official DHL scoring rules)', bold=True, color=NAVY, size=11)
header_row(ws, 6, 1, ['ID', 'Parameter', 'Value', 'Description / rationale', 'Source / status'])
PARAMS = [
    ('p_ReportDate', 'Report date (overdue calculation)', '=TODAY()', DATE, 'Date used to determine overdue actions. Defaults to TODAY(); overwrite with a fixed date to freeze a reporting cut-off.', 'Input (default TODAY)'),
    ('p_W_UC', 'Weight – UNDER CONTROL', "='Config - Configuracion'!B2", '0.00', 'Linked to the workbook\'s established value table (Config - Configuracion). Keeps one source of truth.', "Existing workbook value"),
    ('p_W_MC', 'Weight – MODERATE CONTROL', "='Config - Configuracion'!B3", '0.00', 'Established workbook value (0.75). Note: legacy sheet 4.Final-AM Risk Assessment used 0.50 – inconsistency documented in Audit Report.', "Existing workbook value"),
    ('p_W_IC', 'Weight – INSUFFICIENT CONTROL', "='Config - Configuracion'!B4", '0.00', 'Established workbook value (0).', "Existing workbook value"),
    ('p_A_UC', 'Sensitivity weight – UNDER CONTROL', 1, '0.00', 'Alternative stricter model (100/50/0) shown as a sensitivity column only.', 'Analytical proposal'),
    ('p_A_MC', 'Sensitivity weight – MODERATE CONTROL', 0.5, '0.00', 'Alternative stricter model (100/50/0).', 'Analytical proposal'),
    ('p_A_IC', 'Sensitivity weight – INSUFFICIENT CONTROL', 0, '0.00', 'Alternative stricter model (100/50/0).', 'Analytical proposal'),
    ('p_T_Strong', 'Strong environment – minimum score', 0.95, PCT, 'Strong = score ≥ 95% AND zero Insufficient Control answers. Adds a best-in-class tier above the workbook\'s 90% UNDER CONTROL threshold.', 'Analytical proposal'),
    ('p_T_Mod', 'Moderate environment – minimum score', 0.90, PCT, 'Aligned with the 0.90 UNDER CONTROL threshold used in 1. Data-Control Country Matrix.', 'Derived from workbook'),
    ('p_T_Weak', 'Weak environment – minimum score', 0.75, PCT, 'Aligned with the 0.75 MODERATE CONTROL threshold used in 1. Data-Control Country Matrix. Below this = Critical.', 'Derived from workbook'),
    ('p_IC_Mod', 'Moderate environment – max Insufficient %', 0.05, PCT, 'Guard rail: a high average score must not mask concentrated Insufficient Control answers.', 'Analytical proposal'),
    ('p_IC_Crit', 'Critical – Insufficient % at or above', 0.10, PCT, 'Countries with ≥10% of applicable questions at Insufficient Control are Critical regardless of score.', 'Analytical proposal'),
    ('p_MaxMissing', 'Insufficient data – max missing/invalid share', 0.10, PCT, 'If more than 10% of questions are missing or carry an invalid label the country is not classified.', 'Analytical proposal'),
    ('p_MinAppl', 'Insufficient data – min applicable share', 0.50, PCT, 'If fewer than 50% of questions are applicable (i.e. >50% N/A) the country is not classified.', 'Analytical proposal'),
    ('p_Sec_Strong', 'Policy Section – strong implementation from', 0.90, PCT, 'Section score thresholds (same 0.90 / 0.75 logic as the country matrix).', 'Derived from workbook'),
    ('p_Sec_Mod', 'Policy Section – moderate implementation from', 0.75, PCT, 'Below this = weak implementation.', 'Derived from workbook'),
    ('p_Sup_IC', 'Support priority HIGH – Insufficient answers ≥', 3, '0', 'Regional support prioritisation rule.', 'Analytical proposal'),
    ('p_Sup_Overdue', 'Support priority HIGH – overdue actions ≥', 3, '0', 'Regional support prioritisation rule.', 'Analytical proposal'),
    ('p_Sup_NoAP', 'Support priority MEDIUM – gaps without action plan ≥', 3, '0', 'Regional support prioritisation rule.', 'Analytical proposal'),
    ('p_HighNA', 'High N/A share flag at or above', 0.25, PCT, 'Countries declaring many questions N/A should have applicability validated by the RCCH.', 'Analytical proposal'),
    ('p_TrendTol', 'Trend tolerance (score change)', 0.02, PCT, 'Change in score vs prior snapshot below ±2 pp = Stable.', 'Analytical proposal'),
]
r = 7
for i, (n, lab, val, fmt, desc, src) in enumerate(PARAMS):
    put(ws, f'A{r}', f'P{i+1:02d}', border=True)
    put(ws, f'B{r}', lab, border=True)
    c = put(ws, f'C{r}', val, fmt=fmt, border=True, bg=INPUT_FILL if 'proposal' in src or 'Input' in src else None, align='right')
    put(ws, f'D{r}', desc, wrap=True, border=True)
    put(ws, f'E{r}', src, border=True, italic=True)
    name(n, CF, f'$C${r}')
    r += 1
r += 1


def maptable(r, label, rows, nraw, nstd, hdr=('Raw value (UPPER, trimmed)', 'Standardized value')):
    put(ws, f'A{r}', label, bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 2, list(hdr)); r += 1
    r0 = r
    for a, b in rows:
        put(ws, f'B{r}', a, border=True, bg=INPUT_FILL); put(ws, f'C{r}', b, border=True); r += 1
    name(nraw, CF, absr('B', r0, r - 1)); name(nstd, CF, absr('C', r0, r - 1))
    return r + 1


r = maptable(r, 'B. Control Level label mapping (English & Spanish labels accepted; anything else = INVALID, blank = MISSING)',
             [('UNDER CONTROL', 'UNDER CONTROL'), ('BAJO CONTROL', 'UNDER CONTROL'), ('EN CONTROL', 'UNDER CONTROL'),
              ('MODERATE CONTROL', 'MODERATE CONTROL'), ('CONTROL MODERADO', 'MODERATE CONTROL'),
              ('INSUFFICIENT CONTROL', 'INSUFFICIENT CONTROL'), ('CONTROL INSUFICIENTE', 'INSUFFICIENT CONTROL'),
              ('N/A', 'N/A'), ('NA', 'N/A'), ('NO APLICA', 'N/A')], 'rng_LblRaw', 'rng_LblStd')
r = maptable(r, 'C. Evidence mapping ("Evidence Uploaded to SharePoint")',
             [('YES', 'Uploaded'), ('SI', 'Uploaded'), ('SÍ', 'Uploaded'), ('Y', 'Uploaded'), ('NO', 'Not uploaded'),
              ('N/A', 'Not uploaded (N/A stated)'), ('NA', 'Not uploaded (N/A stated)')], 'rng_EvRaw', 'rng_EvStd')
r = maptable(r, 'D. Action status mapping',
             [('COMPLETED', 'Completed'), ('COMPLETADO', 'Completed'), ('CLOSED', 'Completed'), ('CERRADO', 'Completed'), ('DONE', 'Completed'),
              ('IN PROGRESS', 'In Progress'), ('EN PROCESO', 'In Progress'), ('EN PROGRESO', 'In Progress'), ('ONGOING', 'In Progress'), ('OPEN', 'In Progress'),
              ('NOT STARTED', 'Not Started'), ('NO INICIADO', 'Not Started'), ('PENDING', 'Not Started'), ('PENDIENTE', 'Not Started'),
              ('ON HOLD', 'On Hold'), ('CANCELLED', 'Cancelled'), ('CANCELADO', 'Cancelled')], 'rng_StRaw', 'rng_StStd')

put(ws, f'A{r}', 'E. Country register (canonical names; source worksheets; column layout detected in each country form)', bold=True, color=NAVY, size=11); r += 1
header_row(ws, r, 1, ['#', 'Country (canonical)', 'Code', 'Cluster', 'Assessment worksheet', 'Action Plan worksheet', 'Control Level column', 'Name in legacy sheets', 'Matrix control col.']); r += 1
REG_ROW0 = r
for i, c in enumerate(REG):
    vals = [i + 1, c['name'], c['code'], c['cluster'], c['sheet'], c['ap'], gl(c['cl'] + 1), c['name26'], c['matrix_col']]
    for j, v in enumerate(vals):
        put(ws, f'{gl(j+1)}{r}', v, border=True)
    r += 1
name('reg_Country', CF, absr('B', REG_ROW0, r - 1)); name('reg_Code', CF, absr('C', REG_ROW0, r - 1)); name('reg_Cluster', CF, absr('D', REG_ROW0, r - 1))
REG_ROWS = {c['name']: REG_ROW0 + i for i, c in enumerate(REG)}
ws.column_dimensions['H'].width = 24; ws.column_dimensions['I'].width = 14
r += 1
put(ws, f'A{r}', 'F. Question master (from "Config - Structure", merged cells filled down) and mapping to the 36 Policy Sections (controls) of "1. Data-Control Country Matrix"', bold=True, color=NAVY, size=11); r += 1
header_row(ws, r, 1, ['Q#', 'Scope (Policy chapter)', 'Policy Section (Control)', 'Question', 'Policy v2.0 sub-section']); r += 1
MQ0 = r
for m in M:
    for j, v in enumerate([m['q'], m['scope'], m['control'], m['question'], m['section']]):
        put(ws, f'{gl(j+1)}{r}', v, border=True, wrap=(j == 3))
    r += 1
for nm_, col in [('m_Q', 'A'), ('m_Scope', 'B'), ('m_Control', 'C'), ('m_Question', 'D'), ('m_Sub', 'E')]:
    name(nm_, CF, absr(col, MQ0, r - 1))
r += 1
METH_ROW = r
put(ws, f'A{r}', 'G. Methodology', bold=True, color=NAVY, size=11); r += 1
for line in content.METHODOLOGY:
    put(ws, f'B{r}', line[0], bold=True, wrap=True, border=True)
    ws.merge_cells(f'C{r}:E{r}')
    put(ws, f'C{r}', line[1], wrap=True, border=True)
    ws.row_dimensions[r].height = max(15, 13 * (len(line[1]) // 120 + 1))
    r += 1
ws.freeze_panes = 'A5'

# ======================================================================= 06 ACTION PLAN
ws = WS[AP]
title(ws, 'Regional Action Plan – consolidated view of the 32 country Action Plan worksheets',
      'All descriptive fields are LIVE LINKS to the country Action Plan sheets (original language preserved). Grey columns are calculated. Nothing has been invented: missing owners, dates or statuses are flagged, not filled.')
nav(ws)
AP_H = 8
heads = ['Action ID', 'Country', 'Source worksheet', 'Action #', 'Question #', 'Policy Section (as entered)', 'Policy Section (from Q#)',
         'Section check', 'Area of Improvement / Issue (original)', 'Issue Category', 'Action Description (original)', 'Responsible (original)',
         'Due date (as entered)', 'Due date (interpreted)', 'Date note', 'Status (as entered)', 'Status (standardized)', 'Open?',
         'Days overdue', 'Overdue (1/0)', 'Linked question control level', 'Priority', 'Comments (original)', 'Data-quality flags',
         'Is action (1/0)', 'Detail seq',
         'tech: date type', 'tech: normalised text', 'tech: part 1', 'tech: rest', 'tech: part 2', 'tech: part 3', 'tech: year']
header_row(ws, AP_H, 1, heads, height=45)
for j in range(26, 34):
    ws.cell(AP_H, j).fill = fill('808080')
apr = AP_H + 1
SEL = f"{q(CD)}!$C$4"
for c in REG:
    info = API[c['ap']]; cols = info['cols']; sh = q(c['ap'])
    spans = [tuple(s) for s in info['spans']] + [(info['last'] + k, info['last'] + k) for k in range(1, 6)]
    for (a, b) in spans:
        rr = apr
        L = lambda col, row=a: f"{sh}!{col}{row}"
        link = lambda col: f'=IF(TRIM({L(col)}&"")="","",{L(col)})'

        def cat(col):
            parts = [f'{sh}!{col}{k}' for k in range(a, b + 1)]
            if len(parts) == 1:
                return f'=IF(TRIM({parts[0]}&"")="","",{parts[0]})'
            e = parts[0] + '&""'
            for p_ in parts[1:]:
                e += f'&IF(TRIM({p_}&"")="",""," | "&{p_})'
            return f'=TRIM({e})'
        F = {
            'A': f'=IF(Y{rr}=1,"{c["code"]}-"&IF(D{rr}="",ROW()-{AP_H},D{rr}),"")',
            'B': c['name'], 'C': c['ap'],
            'D': link(cols['num']), 'E': link(cols['q']), 'F': link(cols['sec']),
            'G': f'=IF(E{rr}="","",IFERROR(INDEX(m_Control,MATCH(E{rr},m_Q,0)),"Q# not in master"))',
            'H': (f'=IF(Y{rr}=0,"",IF(E{rr}="","No question number",IF(OR(F{rr}="",G{rr}="Q# not in master"),"Cannot check",IF(AND(LEFT(TRIM(F{rr}),2)<>"An",NOT(ISNUMBER(VALUE(LEFT(TRIM(F{rr}),1))))),"Label without section number",'
                  f'IF(IF(LEFT(TRIM(F{rr}),2)="An","A",SUBSTITUTE(LEFT(TRIM(F{rr}),FIND(" ",TRIM(F{rr})&" ")-1),".",""))='
                  f'IF(LEFT(G{rr},2)="An","A",SUBSTITUTE(LEFT(G{rr},FIND(" ",G{rr}&" ")-1),".","")),"Match","Check: section differs")))))'),
            'I': cat(cols['issue']), 'J': link(cols['cat']) if cols['cat'] else '',
            'K': cat(cols['action']), 'L': link(cols['who']),
            'M': link(cols['when']),
            'N': (f'=IF(Y{rr}=0,"",IF(AA{rr}="num",M{rr},IF(OR(AC{rr}="",AE{rr}="",AG{rr}=""),"",IF(AND(AE{rr}>12,AC{rr}<=12,AE{rr}<=31),'
                  f'DATE(AG{rr},AC{rr},AE{rr}),IF(AND(AC{rr}<=31,AE{rr}<=12,AC{rr}>=1,AE{rr}>=1),DATE(AG{rr},AE{rr},AC{rr}),"")))))'),
            'O': (f'=IF(Y{rr}=0,"",IF(AA{rr}="blank","Missing due date",IF(AA{rr}="num","Valid date",IF(N{rr}="","Text not interpretable as date",'
                  f'IF(DAY(N{rr})<>IF(AND(AE{rr}>12,AC{rr}<=12),AE{rr},AC{rr}),"Invalid calendar date (rolled over)",'
                  f'IF(AND(AC{rr}<=12,AE{rr}<=12,AC{rr}<>AE{rr}),"Ambiguous text date – read as DD.MM.YYYY","Text date interpreted"))))))'),
            'P': link(cols['status']),
            'Q': f'=IF(Y{rr}=0,"",IF(TRIM(P{rr}&"")="","Not stated",IFERROR(INDEX(rng_StStd,MATCH(UPPER(TRIM(P{rr})),rng_StRaw,0)),"Non-standard: review")))',
            'R': f'=IF(Y{rr}=0,"",IF(OR(Q{rr}="Completed",Q{rr}="Cancelled"),"No","Yes"))',
            'S': f'=IF(AND(Y{rr}=1,R{rr}="Yes",ISNUMBER(N{rr})),MAX(0,p_ReportDate-N{rr}),"")',
            'T': f'=IF(AND(Y{rr}=1,ISNUMBER(S{rr})),IF(S{rr}>0,1,0),0)',
            'U': f'=IF(OR(Y{rr}=0,E{rr}=""),"",IFERROR(INDEX(src_Std,MATCH(B{rr}&"|"&E{rr},src_Key,0)),"Question not found"))',
            'V': f'=IF(Y{rr}=0,"",IF(OR(U{rr}="INSUFFICIENT CONTROL",T{rr}=1),"High",IF(U{rr}="MODERATE CONTROL","Medium",IF(U{rr}="","Not linked to a question","Low"))))',
            'W': cat(cols['comments'][0]) if len(cols['comments']) == 1 else
                 f'=TRIM(IF(TRIM({sh}!{cols["comments"][0]}{a}&"")="","",{sh}!{cols["comments"][0]}{a})&IF(TRIM({sh}!{cols["comments"][1]}{a}&"")="",""," | "&{sh}!{cols["comments"][1]}{a}))',
            'X': (f'=IF(Y{rr}=0,"",TRIM(IF(L{rr}="","Missing owner; ","")&IF(O{rr}<>"Valid date",O{rr}&"; ","")&IF(Q{rr}="Not stated","Missing status; ","")'
                  f'&IF(Q{rr}="Non-standard: review","Non-standard status; ","")&IF(H{rr}="Check: section differs","Section label differs from Q#; ","")'
                  f'&IF(H{rr}="No question number","No question number; ","")'
                  f'&IF(AND(Q{rr}="Completed",ISNUMBER(N{rr})),IF(N{rr}>p_ReportDate,"Completed ahead of due date – verify evidence; ",""),"")'
                  f'&IF(OR(U{rr}="UNDER CONTROL",U{rr}="N/A"),"Linked question rated "&U{rr}&"; ","")'
                  f'&IF(COUNTIFS(ap_Country,B{rr},ap_Q,E{rr},ap_IsAction,1)>1,"Multiple actions for this question; ","")))'),
            'Y': f'=IF(OR(TRIM(D{rr}&"")<>"",TRIM(E{rr}&"")<>"",TRIM(I{rr}&"")<>"",TRIM(K{rr}&"")<>""),1,0)',
            'Z': f'=IF(AND(Y{rr}=1,B{rr}={SEL}),COUNTIFS($B${AP_H+1}:B{rr},{SEL},$Y${AP_H+1}:Y{rr},1),"")',
            'AA': f'=IF(ISNUMBER(M{rr}),"num",IF(TRIM(M{rr}&"")="","blank","text"))',
            'AB': f'=SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(TRIM(M{rr}&""),"/","."),"-","."),",",".")," ",".")',
            'AC': f'=IF(AA{rr}<>"text","",IFERROR(VALUE(LEFT(AB{rr},FIND(".",AB{rr})-1)),""))',
            'AD': f'=IF(AA{rr}<>"text","",IFERROR(MID(AB{rr},FIND(".",AB{rr})+1,50),""))',
            'AE': f'=IF(AA{rr}<>"text","",IFERROR(VALUE(LEFT(AD{rr},FIND(".",AD{rr})-1)),""))',
            'AF': f'=IF(AA{rr}<>"text","",IFERROR(VALUE(MID(AD{rr},FIND(".",AD{rr})+1,10)),""))',
            'AG': f'=IF(AF{rr}="","",IF(AF{rr}<100,2000+AF{rr},AF{rr}))',
        }
        for col, v in F.items():
            cc = ws[f'{col}{rr}']; cc.value = v
            calc = col in ('A', 'G', 'H', 'N', 'O', 'Q', 'R', 'S', 'T', 'U', 'V', 'X', 'Y', 'Z') or len(col) == 2
            cell_style(cc, fmt=DATE if col in ('M', 'N') else ('0' if col in ('S',) else None),
                       wrap=col in ('I', 'K', 'W', 'X', 'F'), bg=PALE if calc else None, size=9)
        apr += 1
AP_LAST = apr - 1
for nm_, col in [('ap_Country', 'B'), ('ap_Q', 'E'), ('ap_StatusStd', 'Q'), ('ap_Open', 'R'), ('ap_Overdue', 'T'),
                 ('ap_IsAction', 'Y'), ('ap_Seq', 'Z'), ('ap_Prio', 'V'), ('ap_Days', 'S'), ('ap_Link', 'U')]:
    name(nm_, AP, absr(col, AP_H + 1, AP_LAST))
widths(ws, {'A': 9, 'B': 14, 'C': 18, 'D': 7, 'E': 8, 'F': 22, 'G': 26, 'H': 14, 'I': 40, 'J': 12, 'K': 46, 'L': 18, 'M': 12,
            'N': 12, 'O': 22, 'P': 13, 'Q': 13, 'R': 7, 'S': 8, 'T': 8, 'U': 18, 'V': 10, 'W': 36, 'X': 40, 'Y': 7, 'Z': 7})
for j in range(27, 34): ws.column_dimensions[gl(j)].width = 9
# summary block
put(ws, 'A5', 'Actions', bold=True); put(ws, 'B5', '=SUM(ap_IsAction)', bold=True, fmt='0')
put(ws, 'C5', 'Open', bold=True); put(ws, 'D5', '=COUNTIFS(ap_IsAction,1,ap_Open,"Yes")', bold=True, fmt='0')
put(ws, 'E5', 'Overdue', bold=True); put(ws, 'F5', '=SUM(ap_Overdue)', bold=True, fmt='0', color=RED[1])
put(ws, 'G5', 'Completed', bold=True); put(ws, 'H5', '=COUNTIFS(ap_IsAction,1,ap_StatusStd,"Completed")', bold=True, fmt='0')
put(ws, 'I5', 'Rows with data-quality flags', bold=True); put(ws, 'J5', f'=SUMPRODUCT((Y{AP_H+1}:Y{AP_LAST}=1)*(X{AP_H+1}:X{AP_LAST}<>""))', bold=True, fmt='0')
put(ws, 'A6', 'Rows with "Is action = 0" are empty spare slots that pick up new actions typed into the country Action Plan sheets (5 spare rows per country). Filter column Y = 1 to see actions only.', italic=True, size=9, color='595959')
ws.freeze_panes = ws[f'C{AP_H+1}']
tab = Table(displayName='tblRegionalActionPlan', ref=f'A{AP_H}:{gl(len(heads))}{AP_LAST}')
tab.tableStyleInfo = TableStyleInfo(name='TableStyleLight1', showRowStripes=False)
ws.add_table(tab)
rngQ = f'Q{AP_H+1}:Q{AP_LAST}'
for txt, col in [('Completed', GREEN), ('In Progress', YELLOW), ('Not Started', ORANGE), ('Not stated', GREY), ('Non-standard: review', RED)]:
    ws.conditional_formatting.add(rngQ, CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(col[0]), font=Font(color=col[1])))
ws.conditional_formatting.add(f'S{AP_H+1}:S{AP_LAST}', CellIsRule(operator='greaterThan', formula=['0'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
ws.conditional_formatting.add(f'V{AP_H+1}:V{AP_LAST}', CellIsRule(operator='equal', formula=['"High"'], fill=fill(RED[0]), font=Font(color=RED[1])))

# ======================================================================= 07 SOURCE DATA
ws = WS[SD]
title(ws, 'Source Data – consolidated question-level dataset (32 countries × 61 questions)',
      'Columns J–M are LIVE LINKS to the country assessment worksheets (original answers & language preserved). Columns N–W are calculated. This sheet is the single analytical source for sheets 01–05 and 13.')
nav(ws)
SD_H = 4
sh_heads = ['Key', 'Country', 'Code', 'Cluster', 'Q#', 'Scope', 'Policy Section (Control)', 'Policy v2.0 sub-section', 'Question',
            'Country Answer (original)', 'Evidence Uploaded (original)', 'Control Level (as submitted)', 'GAPs / Comments (original)',
            'Control Level (standardized)', 'Applicable (1/0)', 'Score', 'Gap (1/0)', 'Evidence status', 'Consistency flag',
            'Action plan linked (gaps)', 'Priority (analytical)', 'Prior snapshot level (Assessments bkp)', 'Detail seq']
header_row(ws, SD_H, 1, sh_heads, height=45)
rr = SD_H + 1
for c in REG:
    sh = q(c['sheet'])
    colr = lambda k: gl(c[k] + 1)
    for m in M:
        idx = f"MATCH($E{rr},{sh}!$A$2:$A$62,0)"
        def lk(k):
            col = colr(k)
            return f'=IFERROR(INDEX({sh}!${col}$2:${col}$62,{idx})&"","")'
        bk = c['name26']
        F = {
            'A': f'=B{rr}&"|"&E{rr}', 'B': c['name'],
            'C': f'=INDEX(reg_Code,MATCH(B{rr},reg_Country,0))', 'D': f'=INDEX(reg_Cluster,MATCH(B{rr},reg_Country,0))',
            'E': m['q'],
            'F': f'=INDEX(m_Scope,MATCH(E{rr},m_Q,0))', 'G': f'=INDEX(m_Control,MATCH(E{rr},m_Q,0))',
            'H': f'=INDEX(m_Sub,MATCH(E{rr},m_Q,0))', 'I': f'=INDEX(m_Question,MATCH(E{rr},m_Q,0))',
            'J': lk('ans'), 'K': lk('ev'), 'L': lk('cl'), 'M': lk('gap'),
            'N': f'=IF(TRIM(L{rr})="","MISSING",IFERROR(INDEX(rng_LblStd,MATCH(UPPER(TRIM(L{rr})),rng_LblRaw,0)),"INVALID"))',
            'O': f'=IF(OR(N{rr}="UNDER CONTROL",N{rr}="MODERATE CONTROL",N{rr}="INSUFFICIENT CONTROL"),1,0)',
            'P': f'=IF(N{rr}="UNDER CONTROL",p_W_UC,IF(N{rr}="MODERATE CONTROL",p_W_MC,IF(N{rr}="INSUFFICIENT CONTROL",p_W_IC,"")))',
            'Q': f'=IF(OR(N{rr}="MODERATE CONTROL",N{rr}="INSUFFICIENT CONTROL"),1,0)',
            'R': f'=IF(O{rr}=0,"Not applicable",IF(TRIM(K{rr})="","Not stated",IFERROR(INDEX(rng_EvStd,MATCH(UPPER(TRIM(K{rr})),rng_EvRaw,0)),"Non-standard value")))',
            'S': (f'=IF(N{rr}="INVALID","Invalid control level label",IF(N{rr}="MISSING","Missing control level",'
                  f'IF(AND(N{rr}="UNDER CONTROL",R{rr}<>"Uploaded"),"Under Control without uploaded evidence",'
                  f'IF(AND(Q{rr}=1,TRIM(M{rr})=""),"Gap without documented comment",""))))'),
            'T': f'=IF(Q{rr}=1,IF(COUNTIFS(ap_Country,B{rr},ap_Q,E{rr},ap_IsAction,1)>0,"Yes","No"),"")',
            'U': f'=IF(N{rr}="INSUFFICIENT CONTROL","P1 – High",IF(N{rr}="MODERATE CONTROL",IF(T{rr}="No","P2 – Medium (no action plan)","P3 – Medium"),""))',
            'V': (f"=IFERROR(IF(INDEX('Assessments bkp'!$C$3:$C$1954,MATCH(\"{bk}\",'Assessments bkp'!$B$3:$B$1954,0)+E{rr}-1)=E{rr},"
                  f"IFERROR(INDEX(rng_LblStd,MATCH(UPPER(TRIM(INDEX('Assessments bkp'!$J$3:$J$1954,MATCH(\"{bk}\",'Assessments bkp'!$B$3:$B$1954,0)+E{rr}-1))),rng_LblRaw,0)),\"\"),\"\"),\"\")"),
            'W': f'=IF(AND($B{rr}={SEL},Q{rr}=1),COUNTIFS($B${SD_H+1}:$B{rr},{SEL},$Q${SD_H+1}:$Q{rr},1),"")',
        }
        for col, v in F.items():
            cc = ws[f'{col}{rr}']; cc.value = v
            cell_style(cc, size=9, bg=PALE if col in 'NOPQRSTUVW' else None, fmt='0.00' if col == 'P' else None)
        rr += 1
SD_LAST = rr - 1
for nm_, col in [('src_Key', 'A'), ('src_Country', 'B'), ('src_Q', 'E'), ('src_Scope', 'F'), ('src_Section', 'G'), ('src_Std', 'N'),
                 ('src_Appl', 'O'), ('src_Score', 'P'), ('src_Gap', 'Q'), ('src_Evid', 'R'), ('src_Flag', 'S'), ('src_AP', 'T'),
                 ('src_Prio', 'U'), ('src_Prior', 'V'), ('src_Seq', 'W'), ('src_Answer', 'J'), ('src_EvRaw', 'K'), ('src_Gaptxt', 'M'),
                 ('src_Question', 'I'), ('src_Raw', 'L')]:
    name(nm_, SD, absr(col, SD_H + 1, SD_LAST))
widths(ws, {'A': 16, 'B': 16, 'C': 6, 'D': 10, 'E': 5, 'F': 26, 'G': 30, 'H': 24, 'I': 50, 'J': 50, 'K': 12, 'L': 18, 'M': 40,
            'N': 20, 'O': 8, 'P': 7, 'Q': 6, 'R': 18, 'S': 30, 'T': 10, 'U': 22, 'V': 18, 'W': 7})
ws.freeze_panes = ws[f'C{SD_H+1}']
tab = Table(displayName='tblSourceData', ref=f'A{SD_H}:W{SD_LAST}')
tab.tableStyleInfo = TableStyleInfo(name='TableStyleLight1', showRowStripes=False)
ws.add_table(tab)
rngN = f'N{SD_H+1}:N{SD_LAST}'


def level_cf(ws, rng):
    for txt, col in [('UNDER CONTROL', GREEN), ('MODERATE CONTROL', YELLOW), ('INSUFFICIENT CONTROL', RED), ('N/A', GREY),
                     ('MISSING', ORANGE), ('INVALID', ORANGE)]:
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(col[0]), font=Font(color=col[1])))


level_cf(ws, rngN)

# ======================================================================= 13 CALC ENGINE
ws = WS[CE]
title(ws, 'Calculation Engine (technical sheet – do not edit)',
      'All aggregations used by the dashboard and analysis sheets. Every figure is a live formula over 07 – Source Data and 06 – Regional Action Plan.')
nav(ws)
C0 = 5; C1 = C0 + NC - 1
ce_cols = ['Country', 'Code', 'Cluster', 'Total Q', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Missing', 'Invalid',
           'Applicable', 'UC %', 'MC %', 'IC %', 'N/A share', 'Score', 'Score (100/50/0)', 'Gaps (MC+IC)', 'Gaps w/o action plan',
           'Applicable w/o uploaded evidence', 'UC w/o evidence', 'Actions', 'Open actions', 'Overdue actions', 'Completed actions',
           'Prior UC', 'Prior MC', 'Prior IC', 'Prior applicable', 'Prior score', 'Δ score', 'Trend', 'Classification', 'Class order',
           'Sort key', 'Rank', 'Support priority', 'Support rationale', 'L1', 'L2', 'L3', 'L4', 'L5', 'key IC%', 'key gaps',
           'key overdue', 'key missing ev.', 'key no AP', 'IC w/o action plan', 'High N/A flag', 'Priority order', 'Sort key 2', 'Rank 2',
           'sorted list 1', 'sorted list 2', 'sorted list 3', 'sorted list 4', 'sorted list 5']
header_row(ws, C0 - 1, 1, ce_cols, height=40)
CEC = {h: gl(i + 1) for i, h in enumerate(ce_cols)}
for i, c in enumerate(REG):
    r = C0 + i
    cs = f'$A{r}'
    f = {
        'Country': f"={q(CF)}!$B${REG_ROWS[c['name']]}",
        'Code': f'=INDEX(reg_Code,MATCH(A{r},reg_Country,0))', 'Cluster': f'=INDEX(reg_Cluster,MATCH(A{r},reg_Country,0))',
        'Total Q': f'=COUNTIFS(src_Country,{cs})',
        'Under Control': f'=COUNTIFS(src_Country,{cs},src_Std,"UNDER CONTROL")',
        'Moderate': f'=COUNTIFS(src_Country,{cs},src_Std,"MODERATE CONTROL")',
        'Insufficient': f'=COUNTIFS(src_Country,{cs},src_Std,"INSUFFICIENT CONTROL")',
        'N/A': f'=COUNTIFS(src_Country,{cs},src_Std,"N/A")', 'Missing': f'=COUNTIFS(src_Country,{cs},src_Std,"MISSING")',
        'Invalid': f'=COUNTIFS(src_Country,{cs},src_Std,"INVALID")', 'Applicable': f'=E{r}+F{r}+G{r}',
        'UC %': f'=IF($K{r}=0,"",E{r}/$K{r})', 'MC %': f'=IF($K{r}=0,"",F{r}/$K{r})', 'IC %': f'=IF($K{r}=0,"",G{r}/$K{r})',
        'N/A share': f'=IF(D{r}=0,"",H{r}/D{r})',
        'Score': f'=IF(K{r}=0,"",(E{r}*p_W_UC+F{r}*p_W_MC+G{r}*p_W_IC)/K{r})',
        'Score (100/50/0)': f'=IF(K{r}=0,"",(E{r}*p_A_UC+F{r}*p_A_MC+G{r}*p_A_IC)/K{r})',
        'Gaps (MC+IC)': f'=F{r}+G{r}', 'Gaps w/o action plan': f'=COUNTIFS(src_Country,{cs},src_AP,"No")',
        'Applicable w/o uploaded evidence': f'=COUNTIFS(src_Country,{cs},src_Appl,1,src_Evid,"<>Uploaded")',
        'UC w/o evidence': f'=COUNTIFS(src_Country,{cs},src_Flag,"Under Control without uploaded evidence")',
        'Actions': f'=COUNTIFS(ap_Country,{cs},ap_IsAction,1)', 'Open actions': f'=COUNTIFS(ap_Country,{cs},ap_IsAction,1,ap_Open,"Yes")',
        'Overdue actions': f'=COUNTIFS(ap_Country,{cs},ap_IsAction,1,ap_Overdue,1)',
        'Completed actions': f'=COUNTIFS(ap_Country,{cs},ap_IsAction,1,ap_StatusStd,"Completed")',
        'Prior UC': f'=COUNTIFS(src_Country,{cs},src_Prior,"UNDER CONTROL")', 'Prior MC': f'=COUNTIFS(src_Country,{cs},src_Prior,"MODERATE CONTROL")',
        'Prior IC': f'=COUNTIFS(src_Country,{cs},src_Prior,"INSUFFICIENT CONTROL")', 'Prior applicable': f'=Z{r}+AA{r}+AB{r}',
        'Prior score': f'=IF(AC{r}=0,"",(Z{r}*p_W_UC+AA{r}*p_W_MC+AB{r}*p_W_IC)/AC{r})',
        'Δ score': f'=IF(OR(P{r}="",AD{r}=""),"",P{r}-AD{r})',
        'Trend': f'=IF(AE{r}="","No comparable data",IF(AE{r}>=p_TrendTol,"Improving",IF(AE{r}<=-p_TrendTol,"Deteriorating","Stable")))',
        'Classification': (f'=IF(OR(D{r}=0,(I{r}+J{r})/MAX(D{r},1)>p_MaxMissing,K{r}/MAX(D{r},1)<p_MinAppl),"5. Insufficient Data / Assessment Incomplete",'
                           f'IF(AND(P{r}>=p_T_Strong,G{r}=0),"1. Strong Control Environment",IF(AND(P{r}>=p_T_Mod,N{r}<=p_IC_Mod),"2. Moderate Control Environment",'
                           f'IF(AND(P{r}>=p_T_Weak,N{r}<p_IC_Crit),"3. Weak Control Environment","4. Critical Attention Required"))))'),
        'Class order': f'=VALUE(LEFT(AG{r},1))',
        'Sort key': f'=AH{r}*1000+IF(P{r}="",100,(1-P{r})*100)+IF(N{r}="",0,N{r})+ROW()/1000000',
        'Rank': f'=RANK(AI{r},$AI${C0}:$AI${C1},1)+COUNTIF($AI${C0}:AI{r},AI{r})-1',
        'Support priority': (f'=IF(AH{r}=5,"Data follow-up",IF(OR(AH{r}=4,G{r}>=p_Sup_IC,X{r}>=p_Sup_Overdue),"High",'
                             f'IF(OR(AH{r}=3,X{r}>0,S{r}>=p_Sup_NoAP,AW{r}>0),"Medium","Low")))'),
        'Support rationale': (f'=TRIM(IF(AH{r}=4,"Critical classification; ","")&IF(AH{r}=3,"Weak classification; ","")&IF(G{r}>0,G{r}&" Insufficient Control; ","")'
                              f'&IF(X{r}>0,X{r}&" overdue action(s); ","")&IF(S{r}>0,S{r}&" gap(s) without action plan; ","")'
                              f'&IF(T{r}>0,T{r}&" applicable question(s) without uploaded evidence; ","")&IF(AX{r}<>"","High N/A share; ",""))'),
        'L1': f'=IF($AH{r}=1,$A{r}&", ","")', 'L2': f'=IF($AH{r}=2,$A{r}&", ","")', 'L3': f'=IF($AH{r}=3,$A{r}&", ","")',
        'L4': f'=IF($AH{r}=4,$A{r}&", ","")', 'L5': f'=IF($AH{r}=5,$A{r}&", ","")',
        'key IC%': f'=IF(N{r}="",-1,N{r})+(100-ROW())/10000000', 'key gaps': f'=R{r}+(100-ROW())/1000000',
        'key overdue': f'=X{r}+(100-ROW())/1000000', 'key missing ev.': f'=T{r}+(100-ROW())/1000000', 'key no AP': f'=S{r}+(100-ROW())/1000000',
        'IC w/o action plan': f'=COUNTIFS(src_Country,{cs},src_Std,"INSUFFICIENT CONTROL",src_AP,"No")',
        'High N/A flag': f'=IF(O{r}="","",IF(O{r}>=p_HighNA,"High N/A share",""))',
        'Priority order': f'=MATCH(AK{r},{{"High","Medium","Data follow-up","Low"}},0)',
        'Sort key 2': f'=AY{r}*100+AJ{r}', 'Rank 2': f'=RANK(AZ{r},$AZ${C0}:$AZ${C1},1)+COUNTIF($AZ${C0}:AZ{r},AZ{r})-1',
    }
    for k in range(1, 6):
        rk = f"INDEX({q(R)}!$B$6:$B${5+NC},{i+1})"
        f[f'sorted list {k}'] = (f'=IF(LEFT(INDEX({q(R)}!$P$6:$P${5+NC},{i+1}),1)="{k}",{rk}&" ("&TEXT(INDEX({q(R)}!$N$6:$N${5+NC},{i+1}),"0.0%")&"), ","")')
    for h, v in f.items():
        cc = ws[f'{CEC[h]}{r}']; cc.value = v
        cell_style(cc, size=9, fmt=PCT if h in ('UC %', 'MC %', 'IC %', 'N/A share', 'Score', 'Score (100/50/0)', 'Prior score', 'Δ score') else None)
TOT = C1 + 2
put(ws, f'A{TOT}', 'REGION', bold=True)
for h in ['Total Q', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Missing', 'Invalid', 'Applicable', 'Gaps (MC+IC)', 'Gaps w/o action plan',
          'Applicable w/o uploaded evidence', 'UC w/o evidence', 'Actions', 'Open actions', 'Overdue actions', 'Completed actions',
          'Prior UC', 'Prior MC', 'Prior IC', 'Prior applicable', 'IC w/o action plan']:
    col = CEC[h]; put(ws, f'{col}{TOT}', f'=SUM({col}{C0}:{col}{C1})', bold=True, border=True)
put(ws, f'L{TOT}', f'=IF(K{TOT}=0,"",E{TOT}/K{TOT})', fmt=PCT, bold=True)
put(ws, f'M{TOT}', f'=IF(K{TOT}=0,"",F{TOT}/K{TOT})', fmt=PCT, bold=True)
put(ws, f'N{TOT}', f'=IF(K{TOT}=0,"",G{TOT}/K{TOT})', fmt=PCT, bold=True)
put(ws, f'O{TOT}', f'=IF(D{TOT}=0,"",H{TOT}/D{TOT})', fmt=PCT, bold=True)
put(ws, f'P{TOT}', f'=IF(K{TOT}=0,"",(E{TOT}*p_W_UC+F{TOT}*p_W_MC+G{TOT}*p_W_IC)/K{TOT})', fmt=PCT, bold=True)
put(ws, f'Q{TOT}', f'=IF(K{TOT}=0,"",(E{TOT}*p_A_UC+F{TOT}*p_A_MC+G{TOT}*p_A_IC)/K{TOT})', fmt=PCT, bold=True)
put(ws, f'AD{TOT}', f'=IF(AC{TOT}=0,"",(Z{TOT}*p_W_UC+AA{TOT}*p_W_MC+AB{TOT}*p_W_IC)/AC{TOT})', fmt=PCT, bold=True)
CER = lambda h: f"{q(CE)}!${CEC[h]}${C0}:${CEC[h]}${C1}"
CET = lambda h: f"{q(CE)}!${CEC[h]}${TOT}"
for k in range(1, 6):
    col = CEC[f'sorted list {k}']
    for rr_ in range(C0 + 1, C1 + 1):   # cumulative concatenation (Excel 2007+ compatible, no CONCAT)
        ws[f'{col}{rr_}'].value = f'={col}{rr_-1}&(' + ws[f'{col}{rr_}'].value[1:] + ')'
    put(ws, f'{col}{TOT}', f'=IF({col}{C1}="","None",LEFT({col}{C1},LEN({col}{C1})-2))')
    col2 = CEC[f'L{k}']
    put(ws, f'{col2}{TOT}', f'=COUNTIF({CEC["Class order"]}{C0}:{CEC["Class order"]}{C1},{k})', bold=True)
# completeness counters
put(ws, f'A{TOT+1}', 'Countries with complete assessment (no missing / invalid)', bold=True)
put(ws, f'D{TOT+1}', f'=SUMPRODUCT((I{C0}:I{C1}+J{C0}:J{C1}=0)*(D{C0}:D{C1}>0))', bold=True)
put(ws, f'A{TOT+2}', 'Countries with incomplete assessment', bold=True)
put(ws, f'D{TOT+2}', f'={NC}-D{TOT+1}', bold=True)

# ---- scope block
S0 = TOT + 6
put(ws, f'A{S0-2}', 'Scope (Policy chapter) metrics', bold=True, color=NAVY, size=11)
sc_cols = ['Scope', 'Applicable', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'UC %', 'MC %', 'IC %', 'Score', 'Implementation', 'Sort key', 'Rank', 'Questions']
header_row(ws, S0 - 1, 1, sc_cols)
for i, s in enumerate(SCOPES):
    r = S0 + i
    vals = [s, f'=COUNTIFS(src_Scope,$A{r},src_Appl,1)', f'=COUNTIFS(src_Scope,$A{r},src_Std,"UNDER CONTROL")',
            f'=COUNTIFS(src_Scope,$A{r},src_Std,"MODERATE CONTROL")', f'=COUNTIFS(src_Scope,$A{r},src_Std,"INSUFFICIENT CONTROL")',
            f'=COUNTIFS(src_Scope,$A{r},src_Std,"N/A")', f'=IF(B{r}=0,"",C{r}/B{r})', f'=IF(B{r}=0,"",D{r}/B{r})', f'=IF(B{r}=0,"",E{r}/B{r})',
            f'=IF(B{r}=0,"",(C{r}*p_W_UC+D{r}*p_W_MC+E{r}*p_W_IC)/B{r})',
            f'=IF(B{r}=0,"No data",IF(J{r}>=p_Sec_Strong,"Strong implementation",IF(J{r}>=p_Sec_Mod,"Moderate implementation","Weak implementation")))',
            f'=IF(J{r}="",9,1-J{r})+ROW()/1000000', f'=RANK(L{r},$L${S0}:$L${S0+len(SCOPES)-1},1)+COUNTIF($L${S0}:L{r},L{r})-1',
            f'=COUNTIF(m_Scope,A{r})']
    for j, v in enumerate(vals):
        cc = ws.cell(r, j + 1, v); cell_style(cc, size=9, fmt=PCT if 7 <= j + 1 <= 10 else None)
S1 = S0 + len(SCOPES) - 1

# ---- section (control) block
X0 = S1 + 5
NS = len(CTRL)
put(ws, f'A{X0-2}', 'Policy Section (control) metrics', bold=True, color=NAVY, size=11)
# matrices positions
MAT = {}
base = X0 + NS + 4
for k in ['UC', 'MC', 'IC', 'SCORE', 'ICTXT', 'MCTXT']:
    MAT[k] = base + 1  # first data row; header row = base
    base += NS + 4
sec_cols = ['Policy Section (Control)', 'Scope', 'Applicable', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'UC %', 'MC %', 'IC %',
            'Score', 'Implementation', '# countries with IC', '# countries with MC', 'Countries with Insufficient Control',
            'Countries with Moderate Control', 'Sort key', 'Rank (strongest = 1)', 'Questions', 'Weakness key', 'Weakness rank']
header_row(ws, X0 - 1, 1, sec_cols)
for i, ctl in enumerate(CTRL):
    r = X0 + i
    scope = M[ctl['qs'][0] - 1]['scope']
    icr = MAT['IC'] + i; mcr = MAT['MC'] + i; ict = MAT['ICTXT'] + i; mct = MAT['MCTXT'] + i
    vals = [ctl['label'], scope, f'=COUNTIFS(src_Section,$A{r},src_Appl,1)', f'=COUNTIFS(src_Section,$A{r},src_Std,"UNDER CONTROL")',
            f'=COUNTIFS(src_Section,$A{r},src_Std,"MODERATE CONTROL")', f'=COUNTIFS(src_Section,$A{r},src_Std,"INSUFFICIENT CONTROL")',
            f'=COUNTIFS(src_Section,$A{r},src_Std,"N/A")', f'=IF(C{r}=0,"",D{r}/C{r})', f'=IF(C{r}=0,"",E{r}/C{r})', f'=IF(C{r}=0,"",F{r}/C{r})',
            f'=IF(C{r}=0,"",(D{r}*p_W_UC+E{r}*p_W_MC+F{r}*p_W_IC)/C{r})',
            f'=IF(C{r}=0,"No data",IF(K{r}>=p_Sec_Strong,"Strong implementation",IF(K{r}>=p_Sec_Mod,"Moderate implementation","Weak implementation")))',
            f'=COUNTIF($D${icr}:${gl(3+NC)}${icr},">0")', f'=COUNTIF($D${mcr}:${gl(3+NC)}${mcr},">0")',
            f'=IF(${gl(3+NC)}${ict}="","",LEFT(${gl(3+NC)}${ict},LEN(${gl(3+NC)}${ict})-2))',
            f'=IF(${gl(3+NC)}${mct}="","",LEFT(${gl(3+NC)}${mct},LEN(${gl(3+NC)}${mct})-2))',
            f'=IF(K{r}="",9,1-K{r})-F{r}/100000+ROW()/10000000', f'=RANK(Q{r},$Q${X0}:$Q${X0+NS-1},1)+COUNTIF($Q${X0}:Q{r},Q{r})-1',
            f'=COUNTIF(m_Control,A{r})', f'=-(F{r}*1000+E{r})+ROW()/1000000', f'=RANK(T{r},$T${X0}:$T${X0+NS-1},1)+COUNTIF($T${X0}:T{r},T{r})-1']
    for j, v in enumerate(vals):
        cc = ws.cell(r, j + 1, v); cell_style(cc, size=9, fmt=PCT if 8 <= j + 1 <= 11 else None)
X1 = X0 + NS - 1
# matrices
mt = {'UC': ('Section × Country – UNDER CONTROL count', 'UNDER CONTROL'), 'MC': ('Section × Country – MODERATE CONTROL count', 'MODERATE CONTROL'),
      'IC': ('Section × Country – INSUFFICIENT CONTROL count', 'INSUFFICIENT CONTROL'), 'SCORE': ('Section × Country – section score', None),
      'ICTXT': ('Section × Country – IC list helper', None), 'MCTXT': ('Section × Country – MC list helper', None)}
for k, (lab, lvl) in mt.items():
    h = MAT[k] - 1
    put(ws, f'A{h-1}', lab, bold=True, color=NAVY)
    put(ws, f'C{h}', 'Policy Section', bold=True)
    for j, c in enumerate(REG):
        col = gl(4 + j)
        put(ws, f'{col}{h}', f"=$A${C0+j}", bold=True)
    for i, ctl in enumerate(CTRL):
        r = MAT[k] + i
        ws[f'C{r}'] = f'=$A${X0+i}'
        for j in range(NC):
            col = gl(4 + j)
            if lvl:
                v = f'=COUNTIFS(src_Country,{col}${h},src_Section,$C{r},src_Std,"{lvl}")'
            elif k == 'SCORE':
                u, m_, ic = (f'{col}{MAT[x]+i}' for x in ('UC', 'MC', 'IC'))
                v = f'=IF(({u}+{m_}+{ic})=0,"N/A",({u}*p_W_UC+{m_}*p_W_MC+{ic}*p_W_IC)/({u}+{m_}+{ic}))'
            elif k == 'ICTXT':
                v = f'=IF({col}{MAT["IC"]+i}>0,{col}${h}&" ("&{col}{MAT["IC"]+i}&"), ","")'
            else:
                v = f'=IF({col}{MAT["MC"]+i}>0,{col}${h}&" ("&{col}{MAT["MC"]+i}&"), ","")'
            if k in ('ICTXT', 'MCTXT') and j > 0:   # cumulative across countries (no CONCAT)
                v = f'={gl(3 + j)}{r}&(' + v[1:] + ')'
            cc = ws[f'{col}{r}']; cc.value = v
            cc.font = font(size=8)
            if k == 'SCORE': cc.number_format = '0%'
# question block
Q0 = base + 3
put(ws, f'A{Q0-2}', 'Question-level metrics (consistency of weaknesses across countries)', bold=True, color=NAVY, size=11)
q_cols = ['Q#', 'Policy Section (Control)', 'Question', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Applicable', 'Countries with gap',
          'Gap rate', 'Sort key', 'Deficiency rank']
header_row(ws, Q0 - 1, 1, q_cols)
for i, m in enumerate(M):
    r = Q0 + i
    vals = [m['q'], f'=INDEX(m_Control,MATCH(A{r},m_Q,0))', f'=INDEX(m_Question,MATCH(A{r},m_Q,0))',
            f'=COUNTIFS(src_Q,$A{r},src_Std,"UNDER CONTROL")', f'=COUNTIFS(src_Q,$A{r},src_Std,"MODERATE CONTROL")',
            f'=COUNTIFS(src_Q,$A{r},src_Std,"INSUFFICIENT CONTROL")', f'=COUNTIFS(src_Q,$A{r},src_Std,"N/A")', f'=D{r}+E{r}+F{r}',
            f'=E{r}+F{r}', f'=IF(H{r}=0,"",I{r}/H{r})', f'=-(I{r}*1000+F{r}*10)+ROW()/1000000',
            f'=RANK(K{r},$K${Q0}:$K${Q0+NQ-1},1)+COUNTIF($K${Q0}:K{r},K{r})-1']
    for j, v in enumerate(vals):
        cc = ws.cell(r, j + 1, v); cell_style(cc, size=9, fmt=PCT if j == 9 else None)
Q1 = Q0 + NQ - 1
# action status block
A0 = Q1 + 4
put(ws, f'A{A0-1}', 'Action plan status distribution', bold=True, color=NAVY, size=11)
STAT = ['Completed', 'In Progress', 'Not Started', 'On Hold', 'Cancelled', 'Not stated', 'Non-standard: review']
for i, s in enumerate(STAT):
    put(ws, f'A{A0+i}', s, border=True); put(ws, f'B{A0+i}', f'=COUNTIFS(ap_IsAction,1,ap_StatusStd,A{A0+i})', border=True)
put(ws, f'A{A0+len(STAT)}', 'of which overdue (open & past due)', border=True, bold=True)
put(ws, f'B{A0+len(STAT)}', '=SUM(ap_Overdue)', border=True, bold=True)
widths(ws, {'A': 34, 'B': 10, 'C': 30})
ws.freeze_panes = 'B5'
LAY = dict(C0=C0, C1=C1, TOT=TOT, S0=S0, S1=S1, X0=X0, X1=X1, MAT=MAT, Q0=Q0, Q1=Q1, A0=A0, NS=NS, CEC=CEC, AP_H=AP_H, AP_LAST=AP_LAST,
           SD_H=SD_H, SD_LAST=SD_LAST, REG_ROW0=REG_ROW0)

# ======================================================================= 02 COUNTRY RANKING
ws = WS[R]
title(ws, 'Country Ranking – Customs Compliance control environment (strongest → weakest)',
      'Sorted automatically by classification, then score. Score = weighted average over APPLICABLE questions only (N/A and missing excluded from the denominator and reported separately).')
nav(ws)
rk_cols = [('Rank', None, '0'), ('Country', 'Country', None), ('Cluster', 'Cluster', None), ('Total Q', 'Total Q', '0'), ('Applicable', 'Applicable', '0'),
           ('Under Control', 'Under Control', '0'), ('Moderate', 'Moderate', '0'), ('Insufficient', 'Insufficient', '0'), ('N/A', 'N/A', '0'),
           ('Missing / Invalid', None, '0'), ('UC %', 'UC %', PCT), ('MC %', 'MC %', PCT), ('IC %', 'IC %', PCT), ('Control score', 'Score', PCT),
           ('Score (100/50/0 sensitivity)', 'Score (100/50/0)', PCT), ('Classification', 'Classification', None), ('Control gaps', 'Gaps (MC+IC)', '0'),
           ('Gaps w/o action plan', 'Gaps w/o action plan', '0'), ('Applicable w/o uploaded evidence', 'Applicable w/o uploaded evidence', '0'),
           ('Actions', 'Actions', '0'), ('Open actions', 'Open actions', '0'), ('Overdue actions', 'Overdue actions', '0'),
           ('Prior score (bkp)', 'Prior score', PCT), ('Δ vs prior', 'Δ score', '+0.0%;-0.0%;0.0%'), ('Trend', 'Trend', None),
           ('Support priority', 'Support priority', None), ('Support rationale', 'Support rationale', None)]
header_row(ws, 5, 1, [h[0] for h in rk_cols], height=45)
for i in range(NC):
    r = 6 + i
    for j, (h, src, fmt) in enumerate(rk_cols):
        col = gl(j + 1)
        if h == 'Rank':
            v = i + 1
        elif h == 'Country':
            v = f'=INDEX({CER("Country")},MATCH($A{r},{CER("Rank")},0))'
        elif h == 'Missing / Invalid':
            v = f'=INDEX({CER("Missing")},MATCH($B{r},{CER("Country")},0))+INDEX({CER("Invalid")},MATCH($B{r},{CER("Country")},0))'
        else:
            v = f'=INDEX({CER(src)},MATCH($B{r},{CER("Country")},0))'
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, fmt=fmt, bold=h in ('Country', 'Classification'), wrap=h == 'Support rationale', size=9)
rT = 6 + NC
put(ws, f'B{rT}', 'REGION', bold=True, border=True)
for j, (h, src, fmt) in enumerate(rk_cols):
    col = gl(j + 1)
    if h in ('Total Q', 'Applicable', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'Missing / Invalid', 'Control gaps', 'Gaps w/o action plan',
             'Applicable w/o uploaded evidence', 'Actions', 'Open actions', 'Overdue actions'):
        put(ws, f'{col}{rT}', f'=SUM({col}6:{col}{rT-1})', bold=True, border=True, fmt='0')
for h, src in [('UC %', 'UC %'), ('MC %', 'MC %'), ('IC %', 'IC %'), ('Control score', 'Score'), ('Score (100/50/0 sensitivity)', 'Score (100/50/0)'), ('Prior score (bkp)', 'Prior score')]:
    j = [x[0] for x in rk_cols].index(h)
    put(ws, f'{gl(j+1)}{rT}', f'={CET(src)}', bold=True, border=True, fmt=PCT)


def class_cf(ws, rng, col_first):
    for k, colr in [('1', GREEN), ('2', YELLOW), ('3', ORANGE), ('4', RED), ('5', GREY)]:
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEFT(${col_first},1)="{k}"'], fill=fill(colr[0]), font=Font(color=colr[1], bold=True)))


class_cf(ws, f'P6:P{rT-1}', 'P6')
class_cf(ws, f'A6:B{rT-1}', 'P6')
ws.conditional_formatting.add(f'N6:N{rT-1}', DataBarRule(start_type='num', start_value=0.5, end_type='num', end_value=1, color='5B9BD5'))
for txt, colr in [('High', RED), ('Medium', ORANGE), ('Low', GREEN), ('Data follow-up', GREY)]:
    ws.conditional_formatting.add(f'Z6:Z{rT-1}', CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(colr[0]), font=Font(color=colr[1])))
for txt, colr in [('Improving', GREEN), ('Deteriorating', RED), ('Stable', GREY)]:
    ws.conditional_formatting.add(f'Y6:Y{rT-1}', CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(colr[0]), font=Font(color=colr[1])))
ws.conditional_formatting.add(f'V6:V{rT-1}', CellIsRule(operator='greaterThan', formula=['0'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
widths(ws, {'A': 6, 'B': 22, 'C': 10, 'D': 7, 'E': 9, 'F': 8, 'G': 9, 'H': 10, 'I': 6, 'J': 8, 'K': 8, 'L': 8, 'M': 8, 'N': 10, 'O': 11,
            'P': 30, 'Q': 8, 'R': 9, 'S': 11, 'T': 8, 'U': 8, 'V': 8, 'W': 9, 'X': 8, 'Y': 14, 'Z': 12, 'AA': 60})
ws.freeze_panes = 'C6'
ws.auto_filter.ref = f'A5:AA{rT-1}'
# legend
lr = rT + 2
put(ws, f'B{lr}', 'Classification rules (parameters in 08 – Config & Methodology)', bold=True, color=NAVY)
for k, (txt, colr) in enumerate([('1. Strong Control Environment – score ≥ 95% and no Insufficient Control', GREEN),
                                 ('2. Moderate Control Environment – score ≥ 90% and Insufficient ≤ 5% of applicable', YELLOW),
                                 ('3. Weak Control Environment – score ≥ 75% and Insufficient < 10% of applicable', ORANGE),
                                 ('4. Critical Attention Required – score < 75% or Insufficient ≥ 10% of applicable', RED),
                                 ('5. Insufficient Data – > 10% missing/invalid answers or < 50% applicable questions', GREY)]):
    put(ws, f'B{lr+1+k}', txt, bg=colr[0], color=colr[1], bold=True)
    ws.merge_cells(f'B{lr+1+k}:H{lr+1+k}')
put(ws, f'B{lr+7}', 'Score uses the established workbook weights (Config - Configuracion: UNDER 1, MODERATE 0.75, INSUFFICIENT 0). The 100/50/0 column is a sensitivity check only. All thresholds are an ANALYTICAL MODEL that requires management validation – not official DHL scoring criteria.', italic=True, size=9, wrap=True)
ws.merge_cells(f'B{lr+7}:P{lr+8}'); ws.row_dimensions[lr+7].height = 26
# countries in tracker without assessment
tr_r = lr + 11
put(ws, f'B{tr_r}', 'Countries listed in "5.Policy Tracker 2026" without an assessment worksheet in this workbook (not ranked – shown for completeness)', bold=True, color=NAVY)
header_row(ws, tr_r + 1, 2, ['Country (tracker)', 'Cluster', 'Agent country', 'Self-Assessment status (tracker)', 'Comment (tracker)'])
regnames = {c['name'] for c in REG} | {'United States'}
trk = CFG['tracker']
import openpyxl as _o
rr = tr_r + 2
TRACK_ROW = content.TRACKER_ROWS  # row numbers in 5.Policy Tracker 2026 (set by content module)
for (tn, trow) in TRACK_ROW:
    for j, col in enumerate(['C', 'B', 'F', 'J', 'L']):
        cc = ws.cell(rr, 2 + j, f"=IF('5.Policy Tracker 2026'!{col}{trow}=\"\",\"\",'5.Policy Tracker 2026'!{col}{trow})")
        cell_style(cc, size=9)
    rr += 1
# stacked distribution chart
ch = BarChart(); ch.type = 'bar'; ch.grouping = 'percentStacked'; ch.overlap = 100
ch.title = 'Distribution of control levels by country (applicable questions)'
for j, (colx, colr) in enumerate([('F', '70AD47'), ('G', 'FFC000'), ('H', 'C00000')]):
    ref = Reference(ws, min_col=_o.utils.column_index_from_string(colx), min_row=5, max_row=5 + NC)
    ch.add_data(ref, titles_from_data=True)
    ch.series[j].graphicalProperties = GraphicalProperties(solidFill=colr)
ch.set_categories(Reference(ws, min_col=2, min_row=6, max_row=5 + NC))
ch.x_axis.scaling.orientation = 'maxMin'
ch.height = 16; ch.width = 22
ch.roundedCorners = False; ch.legend.position = 'b'; ch.legend.overlay = False; ch.title.overlay = False
ch.x_axis.delete = False; ch.y_axis.delete = False
ws.add_chart(ch, f'AC5')

# ======================================================================= 03 POLICY SECTION ANALYSIS
ws = WS[P]
title(ws, 'Policy Section Analysis – regional implementation of the Customs Compliance Policy',
      'Identifies systemic regional weaknesses. Percentages use applicable answers only (N/A excluded and shown separately).')
nav(ws)
put(ws, 'A5', 'A. By Scope (Policy chapter) – ranked strongest → weakest', bold=True, color=NAVY, size=11)
sc_v = ['Rank', 'Scope', 'Questions', 'Applicable', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'UC %', 'MC %', 'IC %', 'Score', 'Implementation']
header_row(ws, 6, 1, sc_v)
srcs = {'Scope': 'A', 'Questions': 'N', 'Applicable': 'B', 'Under Control': 'C', 'Moderate': 'D', 'Insufficient': 'E', 'N/A': 'F', 'UC %': 'G',
        'MC %': 'H', 'IC %': 'I', 'Score': 'J', 'Implementation': 'K'}
CEs = lambda col: f"{q(CE)}!${col}${S0}:${col}${S1}"
for i in range(len(SCOPES)):
    r = 7 + i
    for j, h in enumerate(sc_v):
        col = gl(j + 1)
        if h == 'Rank': v = i + 1
        elif h == 'Scope': v = f'=INDEX({CEs("A")},MATCH($A{r},{CEs("M")},0))'
        else: v = f'=INDEX({CEs(srcs[h])},MATCH($B{r},{CEs("A")},0))'
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, fmt=PCT if h in ('UC %', 'MC %', 'IC %', 'Score') else '0', bold=h == 'Scope', size=9)
P_SC1 = 6 + len(SCOPES)


def impl_cf(ws, rng):
    for txt, colr in [('Strong implementation', GREEN), ('Moderate implementation', YELLOW), ('Weak implementation', RED), ('No data', GREY)]:
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(colr[0]), font=Font(color=colr[1], bold=True)))


impl_cf(ws, f'M7:M{P_SC1}')
s0 = P_SC1 + 3
put(ws, f'A{s0-1}', 'B. By Policy Section (36 controls) – ranked strongest → weakest', bold=True, color=NAVY, size=11)
sv = ['Rank', 'Policy Section (Control)', 'Scope', 'Questions', 'Applicable', 'Under Control', 'Moderate', 'Insufficient', 'N/A', 'UC %', 'MC %',
      'IC %', 'Score', 'Implementation', '# countries IC', '# countries MC', 'Countries with Insufficient Control (count)',
      'Countries with Moderate Control (count)', 'Regional action already proposed (from legacy draft sheets)']
header_row(ws, s0, 1, sv, height=45)
ssrc = {'Policy Section (Control)': 'A', 'Scope': 'B', 'Questions': 'S', 'Applicable': 'C', 'Under Control': 'D', 'Moderate': 'E', 'Insufficient': 'F',
        'N/A': 'G', 'UC %': 'H', 'MC %': 'I', 'IC %': 'J', 'Score': 'K', 'Implementation': 'L', '# countries IC': 'M', '# countries MC': 'N',
        'Countries with Insufficient Control (count)': 'O', 'Countries with Moderate Control (count)': 'P'}
CEx = lambda col: f"{q(CE)}!${col}${X0}:${col}${X1}"
for i in range(NS):
    r = s0 + 1 + i
    for j, h in enumerate(sv):
        col = gl(j + 1)
        if h == 'Rank': v = i + 1
        elif h == 'Policy Section (Control)': v = f'=INDEX({CEx("A")},MATCH($A{r},{CEx("R")},0))'
        elif h.startswith('Regional action'):
            v = '=' + content.regional_action_formula(f'B{r}')
        else: v = f'=INDEX({CEx(ssrc[h])},MATCH($B{r},{CEx("A")},0))'
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, fmt=PCT if h in ('UC %', 'MC %', 'IC %', 'Score') else ('0' if j in (3, 4, 5, 6, 7, 8, 14, 15) else None),
                   bold=j == 1, wrap=j >= 16, size=9)
P_S1 = s0 + NS
impl_cf(ws, f'N{s0+1}:N{P_S1}')
ws.conditional_formatting.add(f'M{s0+1}:M{P_S1}', ColorScaleRule(start_type='num', start_value=0.7, start_color='F8696B', mid_type='num', mid_value=0.9, mid_color='FFEB84', end_type='num', end_value=1, end_color='63BE7B'))
q0 = P_S1 + 3
put(ws, f'A{q0-1}', 'C. Controls consistently weak across multiple countries – top 15 questions by number of countries with a gap', bold=True, color=NAVY, size=11)
qv = ['Rank', 'Q#', 'Policy Section (Control)', 'Question', 'Countries with gap', 'Insufficient', 'Moderate', 'N/A', 'Applicable', 'Gap rate']
header_row(ws, q0, 1, qv, height=30)
CEq = lambda col: f"{q(CE)}!${col}${Q0}:${col}${Q1}"
qsrc = {'Policy Section (Control)': 'B', 'Question': 'C', 'Countries with gap': 'I', 'Insufficient': 'F', 'Moderate': 'E', 'N/A': 'G', 'Applicable': 'H', 'Gap rate': 'J'}
for i in range(15):
    r = q0 + 1 + i
    for j, h in enumerate(qv):
        col = gl(j + 1)
        if h == 'Rank': v = i + 1
        elif h == 'Q#': v = f'=INDEX({CEq("A")},MATCH($A{r},{CEq("L")},0))'
        else: v = f'=INDEX({CEq(qsrc[h])},MATCH($B{r},{CEq("A")},0))'
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, fmt=PCT if h == 'Gap rate' else None, wrap=h == 'Question', size=9)
P_Q1 = q0 + 15
widths(ws, {'A': 6, 'B': 40, 'C': 30, 'D': 50, 'E': 10, 'F': 9, 'G': 9, 'H': 9, 'I': 7, 'J': 8, 'K': 8, 'L': 8, 'M': 9, 'N': 22, 'O': 9, 'P': 9,
            'Q': 45, 'R': 45, 'S': 60})
ws.freeze_panes = 'C7'
ch = BarChart(); ch.type = 'bar'; ch.title = 'Policy Section score (strongest → weakest)'
ch.add_data(Reference(ws, min_col=13, min_row=s0, max_row=P_S1), titles_from_data=True)
ch.set_categories(Reference(ws, min_col=2, min_row=s0 + 1, max_row=P_S1))
ch.x_axis.scaling.orientation = 'maxMin'; ch.y_axis.scaling.min = 0.5; ch.y_axis.scaling.max = 1; ch.y_axis.number_format = '0%'
ch.series[0].graphicalProperties = GraphicalProperties(solidFill='2F5597')
ch.height = 18; ch.width = 20; ch.legend = None
ch.roundedCorners = False; ch.title.overlay = False; ch.x_axis.delete = False; ch.y_axis.delete = False
ws.add_chart(ch, 'U5')

# ======================================================================= 05 REGIONAL RISK
ws = WS[RK]
title(ws, 'Regional Risk Assessment – control gaps, risk indicators and priority countries',
      'Support priority rules: HIGH = Critical classification, ≥3 Insufficient answers or ≥3 overdue actions; MEDIUM = Weak classification, any overdue action, ≥3 gaps without action plan, or an Insufficient answer without action plan.')
nav(ws)
put(ws, 'A5', 'A. Country risk register – ordered by support priority, then ranking', bold=True, color=NAVY, size=11)
rv = [('#', None, '0'), ('Country', 'Country', None), ('Support priority', 'Support priority', None), ('Classification', 'Classification', None),
      ('Control score', 'Score', PCT), ('Insufficient', 'Insufficient', '0'), ('IC %', 'IC %', PCT), ('Control gaps', 'Gaps (MC+IC)', '0'),
      ('Gaps w/o action plan', 'Gaps w/o action plan', '0'), ('IC w/o action plan', 'IC w/o action plan', '0'),
      ('Applicable w/o uploaded evidence', 'Applicable w/o uploaded evidence', '0'), ('UC w/o evidence', 'UC w/o evidence', '0'),
      ('Open actions', 'Open actions', '0'), ('Overdue actions', 'Overdue actions', '0'), ('N/A share', 'N/A share', PCT),
      ('Trend vs prior', 'Trend', None), ('Rationale', 'Support rationale', None)]
header_row(ws, 6, 1, [x[0] for x in rv], height=45)
for i in range(NC):
    r = 7 + i
    for j, (h, src, fmt) in enumerate(rv):
        col = gl(j + 1)
        if h == '#': v = i + 1
        elif h == 'Country': v = f'=INDEX({CER("Country")},MATCH($A{r},{CER("Rank 2")},0))'
        else: v = f'=INDEX({CER(src)},MATCH($B{r},{CER("Country")},0))'
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, fmt=fmt, bold=j == 1, wrap=h == 'Rationale', size=9)
RK1 = 6 + NC
for txt, colr in [('High', RED), ('Medium', ORANGE), ('Low', GREEN), ('Data follow-up', GREY)]:
    ws.conditional_formatting.add(f'C7:C{RK1}', CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(colr[0]), font=Font(color=colr[1], bold=True)))
class_cf(ws, f'D7:D{RK1}', 'D7')
ws.conditional_formatting.add(f'N7:N{RK1}', CellIsRule(operator='greaterThan', formula=['0'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
# B. top-5 lists
t0 = RK1 + 3
put(ws, f'A{t0-1}', 'B. Top 5 countries per risk indicator', bold=True, color=NAVY, size=11)
TOPS = [('Highest Insufficient Control %', 'key IC%', 'IC %', PCT), ('Most control gaps (MC+IC)', 'key gaps', 'Gaps (MC+IC)', '0'),
        ('Most overdue actions', 'key overdue', 'Overdue actions', '0'), ('Most applicable questions w/o uploaded evidence', 'key missing ev.', 'Applicable w/o uploaded evidence', '0'),
        ('Most gaps without action plan', 'key no AP', 'Gaps w/o action plan', '0')]
for t, (lab, key, val, fmt) in enumerate(TOPS):
    c0 = 1 + t * 3
    put(ws, f'{gl(c0)}{t0}', lab, bold=True, bg=LIGHT, wrap=True, border=True); ws.merge_cells(f'{gl(c0)}{t0}:{gl(c0+1)}{t0}')
    ws.row_dimensions[t0].height = 30
    for k in range(5):
        r = t0 + 1 + k
        cn = f'=INDEX({CER("Country")},MATCH(LARGE({CER(key)},{k+1}),{CER(key)},0))'
        put(ws, f'{gl(c0)}{r}', cn, border=True)
        put(ws, f'{gl(c0+1)}{r}', f'=INDEX({CER(val)},MATCH({gl(c0)}{r},{CER("Country")},0))', border=True, fmt=fmt)
# C. heatmap
h0 = t0 + 9
put(ws, f'A{h0-1}', 'C. Heat map – Policy Section score by country (countries in ranking order; grey = all answers N/A)', bold=True, color=NAVY, size=11)
put(ws, f'B{h0}', 'Policy Section (Control)', bold=True, bg=NAVY, color=WHITE, border=True)
for j in range(NC):
    col = gl(3 + j)
    cc = ws[f'{col}{h0}']; cc.value = f"={q(R)}!$B${6+j}"
    cc.font = font(True, 8, WHITE); cc.fill = fill(NAVY); cc.alignment = Alignment(text_rotation=90, horizontal='center')
    ws.column_dimensions[col].width = 5.2
ws.row_dimensions[h0].height = 110
scmat = f"{q(CE)}!$D${MAT['SCORE']}:${gl(3+NC)}${MAT['SCORE']+NS-1}"
schdr = f"{q(CE)}!$D${MAT['SCORE']-1}:${gl(3+NC)}${MAT['SCORE']-1}"
for i in range(NS):
    r = h0 + 1 + i
    put(ws, f'B{r}', f"={q(CE)}!$A${X0+i}", size=8, border=True)
    for j in range(NC):
        col = gl(3 + j)
        cc = ws[f'{col}{r}']; cc.value = f'=INDEX({scmat},{i+1},MATCH({col}${h0},{schdr},0))'
        cc.number_format = '0%'; cc.font = font(size=8); cc.alignment = Alignment(horizontal='center'); cc.border = BORDER
H1 = h0 + NS
hr = f'C{h0+1}:{gl(2+NC)}{H1}'
ws.conditional_formatting.add(hr, FormulaRule(formula=[f'ISTEXT(C{h0+1})'], fill=fill('E7E6E6'), font=Font(color='808080'), stopIfTrue=True))
ws.conditional_formatting.add(hr, ColorScaleRule(start_type='num', start_value=0.5, start_color='F8696B', mid_type='num', mid_value=0.875, mid_color='FFEB84', end_type='num', end_value=1, end_color='63BE7B'))
widths(ws, {'A': 22, 'B': 38})
for col in 'CDEFGHIJKLMNOPQ': pass
ws.column_dimensions['Q'].width = 50
ws.freeze_panes = 'C7'

# ======================================================================= 04 COUNTRY DETAILS
ws = WS[CD]
title(ws, 'Country Details – select a country in the yellow cell', 'Original country answers and comments are shown unchanged (original language). Items labelled "ANALYTICAL" are generated by this tool, not part of the country assessment.')
nav(ws)
put(ws, 'B4', 'Select country ►', bold=True, align='right')
put(ws, 'C4', 'Bahamas', bold=True, size=12, bg=INPUT_FILL, border=True)
dv = DataValidation(type='list', formula1=f"={q(CF)}!$B${REG_ROW0}:$B${REG_ROW0+NC-1}", allow_blank=False)
dv.error = 'Select a country from the list'; dv.errorTitle = 'Country'
ws.add_data_validation(dv); dv.add('C4')
lk = lambda h: f'=IFERROR(INDEX({CER(h)},MATCH($C$4,{CER("Country")},0)),"")'
kpis = [('Classification', 'Classification', None), ('Control score', 'Score', PCT), ('Rank (of 32)', 'Rank', '0'), ('Support priority', 'Support priority', None),
        ('Cluster', 'Cluster', None), ('Total questions', 'Total Q', '0'), ('Applicable', 'Applicable', '0'), ('Under Control', 'Under Control', '0'),
        ('Moderate Control', 'Moderate', '0'), ('Insufficient Control', 'Insufficient', '0'), ('N/A', 'N/A', '0'), ('Missing', 'Missing', '0'),
        ('Invalid', 'Invalid', '0'), ('UC %', 'UC %', PCT), ('MC %', 'MC %', PCT), ('IC %', 'IC %', PCT), ('Control gaps', 'Gaps (MC+IC)', '0'),
        ('Gaps without action plan', 'Gaps w/o action plan', '0'), ('Applicable w/o uploaded evidence', 'Applicable w/o uploaded evidence', '0'),
        ('Actions (total)', 'Actions', '0'), ('Open actions', 'Open actions', '0'), ('Overdue actions', 'Overdue actions', '0'),
        ('Prior score (bkp)', 'Prior score', PCT), ('Trend', 'Trend', None)]
for k, (lab, src, fmt) in enumerate(kpis):
    row = 6 + k % 12; c0 = 2 + (k // 12) * 3
    put(ws, f'{gl(c0)}{row}', lab, bold=True, bg=LIGHT, border=True)
    put(ws, f'{gl(c0+1)}{row}', lk(src), fmt=fmt, border=True, bold=k < 4)
class_cf(ws, 'C6', 'C6')
put(ws, 'H6', 'ANALYTICAL – recommended improvement priorities (generated from the data; not part of the country assessment)', bold=True, color=NAVY)
recs = [
    '=IF(C4="","",IF(F15>0,"1) Remediate "&F15&" Insufficient Control question(s) first (priority P1) – see list below.","1) No Insufficient Control answers recorded."))',
    '=IF(C4="","",IF(F17+0>0,"2) Define/link action plans for "&INDEX(' + CER('Gaps w/o action plan') + ',MATCH($C$4,' + CER('Country') + ',0))&" control gap(s) that have no action in the country Action Plan.","2) Every control gap has at least one linked action."))',
    '=IF(C4="","",IF(INDEX(' + CER('Overdue actions') + ',MATCH($C$4,' + CER('Country') + ',0))>0,"3) Follow up "&INDEX(' + CER('Overdue actions') + ',MATCH($C$4,' + CER('Country') + ',0))&" overdue open action(s): confirm status with owners or re-baseline dates.","3) No overdue open actions."))',
    '=IF(C4="","",IF(INDEX(' + CER('Applicable w/o uploaded evidence') + ',MATCH($C$4,' + CER('Country') + ',0))>0,"4) Upload evidence for "&INDEX(' + CER('Applicable w/o uploaded evidence') + ',MATCH($C$4,' + CER('Country') + ',0))&" applicable question(s) (of which "&INDEX(' + CER('UC w/o evidence') + ',MATCH($C$4,' + CER('Country') + ',0))&" rated UNDER CONTROL) – ratings without evidence cannot be relied on.","4) Evidence reported as uploaded for all applicable questions."))',
    '=IF(C4="","",IF(INDEX(' + CER('N/A share') + ',MATCH($C$4,' + CER('Country') + ',0))>=p_HighNA,"5) "&TEXT(INDEX(' + CER('N/A share') + ',MATCH($C$4,' + CER('Country') + ',0)),"0%")&" of questions declared N/A – RCCH to validate applicability.","5) N/A share within normal range."))',
]
for k, f_ in enumerate(recs):
    put(ws, f'H{7+k}', f_, wrap=True, italic=True)
    ws.merge_cells(f'H{7+k}:N{7+k}'); ws.row_dimensions[7 + k].height = 28
# fix references used in recs: F15 = Insufficient count cell
ws['H7'].value = '=IF(C4="","",IF(C15>0,"1) Remediate "&C15&" Insufficient Control question(s) first (priority P1) – see list below.","1) No Insufficient Control answers recorded."))'
ws['H8'].value = recs[1].replace('F17+0>0', 'F11>0')
g0 = 20
put(ws, f'B{g0-1}', 'Control weaknesses – questions rated MODERATE or INSUFFICIENT (original country answer and comments)', bold=True, color=NAVY, size=11)
gh = ['#', 'Q#', 'Policy Section (Control)', 'Question', 'Control Level', 'Evidence status', 'Country Answer (original)', 'GAPs / Comments (original)',
      'Action plan linked?', 'ANALYTICAL priority']
header_row(ws, g0, 1, gh, height=30)
gsrc = {'Q#': 'src_Q', 'Policy Section (Control)': 'src_Section', 'Question': 'src_Question', 'Control Level': 'src_Std', 'Evidence status': 'src_Evid',
        'Country Answer (original)': 'src_Answer', 'GAPs / Comments (original)': 'src_Gaptxt', 'Action plan linked?': 'src_AP', 'ANALYTICAL priority': 'src_Prio'}
NG = 30
for i in range(NG):
    r = g0 + 1 + i
    ws[f'A{r}'] = i + 1
    for j, h in enumerate(gh[1:]):
        col = gl(j + 2)
        ws[f'{col}{r}'] = f'=IFERROR(INDEX({gsrc[h]},MATCH($A{r},src_Seq,0))&"","")'
    for j in range(len(gh)):
        cell_style(ws.cell(r, j + 1), wrap=j in (3, 6, 7), size=9)
level_cf(ws, f'E{g0+1}:E{g0+NG}')
ws.conditional_formatting.add(f'I{g0+1}:I{g0+NG}', CellIsRule(operator='equal', formula=['"No"'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
a0 = g0 + NG + 3
put(ws, f'B{a0-1}', 'Action plans of the selected country (from 06 – Regional Action Plan; original text)', bold=True, color=NAVY, size=11)
ah = ['#', 'Q#', 'Issue (original)', 'Action (original)', 'Responsible', 'Due date (interpreted)', 'Status (standardized)', 'Days overdue', 'Priority', 'Data-quality flags']
header_row(ws, a0, 1, ah, height=30)
apcol = {'Q#': 'E', 'Issue (original)': 'I', 'Action (original)': 'K', 'Responsible': 'L', 'Due date (interpreted)': 'N', 'Status (standardized)': 'Q',
         'Days overdue': 'S', 'Priority': 'V', 'Data-quality flags': 'X'}
NA_ = 20
for i in range(NA_):
    r = a0 + 1 + i
    ws[f'A{r}'] = i + 1
    for j, h in enumerate(ah[1:]):
        col = gl(j + 2); src = f"{q(AP)}!${apcol[h]}${AP_H+1}:${apcol[h]}${AP_LAST}"
        ws[f'{col}{r}'] = f'=IFERROR(INDEX({src},MATCH($A{r},ap_Seq,0)),"")'
    for j in range(len(ah)):
        cell_style(ws.cell(r, j + 1), wrap=j in (2, 3, 9), size=9, fmt=DATE if j == 5 else None)
ws.conditional_formatting.add(f'H{a0+1}:H{a0+NA_}', CellIsRule(operator='greaterThan', formula=['0'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
f0 = a0 + NA_ + 3
put(ws, f'B{f0-1}', 'Full assessment of the selected country – all 61 questions (original answers; filterable)', bold=True, color=NAVY, size=11)
fh = ['Q#', 'Scope', 'Policy Section (Control)', 'Question', 'Control Level (std)', 'As submitted', 'Evidence status', 'Country Answer (original)', 'GAPs / Comments (original)', 'Consistency flag']
header_row(ws, f0, 1, fh, height=30)
fsrc = {'Scope': 'src_Scope', 'Policy Section (Control)': 'src_Section', 'Question': 'src_Question', 'Control Level (std)': 'src_Std', 'As submitted': 'src_Raw',
        'Evidence status': 'src_Evid', 'Country Answer (original)': 'src_Answer', 'GAPs / Comments (original)': 'src_Gaptxt', 'Consistency flag': 'src_Flag'}
for i in range(NQ):
    r = f0 + 1 + i
    ws[f'A{r}'] = i + 1
    for j, h in enumerate(fh[1:]):
        col = gl(j + 2)
        ws[f'{col}{r}'] = f'=IFERROR(INDEX({fsrc[h]},MATCH($C$4&"|"&$A{r},src_Key,0))&"","")'
    for j in range(len(fh)):
        cell_style(ws.cell(r, j + 1), wrap=j in (3, 7, 8), size=9)
level_cf(ws, f'E{f0+1}:E{f0+NQ}')
ws.auto_filter.ref = f'A{f0}:J{f0+NQ}'
widths(ws, {'A': 5, 'B': 30, 'C': 28, 'D': 48, 'E': 20, 'F': 16, 'G': 44, 'H': 44, 'I': 16, 'J': 26, 'K': 12, 'L': 10, 'M': 10, 'N': 10})
ws.freeze_panes = 'A5'

# ======================================================================= 01 DASHBOARD
ws = WS[D]
ws.sheet_view.showGridLines = False
put(ws, 'B1', 'Americas Region – Customs Compliance Self-Assessment 2026', bold=True, size=18, color=NAVY)
put(ws, 'B2', '="Regional Customs Compliance Control Dashboard  |  Report date: "&TEXT(p_ReportDate,"dd-mmm-yyyy")&"  |  32 country self-assessments, 61 questions, 36 Policy Sections"', italic=True, size=10, color='595959')
links = [(D, 'Dashboard'), (R, '02 Country Ranking'), (P, '03 Policy Sections'), (CD, '04 Country Details'), (RK, '05 Regional Risk'), (AP, '06 Action Plan'),
         (SD, '07 Source Data'), (CF, '08 Methodology'), (AR, '09 Archive'), (AU, '10 Audit Report'), (CL, '11 Change Log'), (KF, '12 Key Findings'), (PR, '14 PPT Check')]
spans = [('B', 'C'), ('D', 'E'), ('F', 'G'), ('H', 'I'), ('J', 'L'), ('M', 'M'), ('N', 'N')]
for k, (s_, lab) in enumerate(links[1:] + [(D, '')][:0]):
    pass
for k, (s_, lab) in enumerate(links[1:]):
    row = 3 + k // 6 if k < 12 else 3; a, b = spans[k % 6] if k < 12 else spans[6]
    c = ws[f'{a}{row}']; c.value = f'=HYPERLINK("#{q(s_)}!A1","► {lab}")'
    c.font = Font(name=FONT, size=9, color='0563C1', underline='single'); c.alignment = Alignment(horizontal='left')
    if a != b: ws.merge_cells(f'{a}{row}:{b}{row}')
ws.sheet_view.tabSelected = True
put(ws, 'B5', 'EXECUTIVE SUMMARY (live – recalculates with the source assessments; detail in 12 – Key Regional Findings)', bold=True, color=WHITE, bg=NAVY)
ws.merge_cells('B5:P5')
CEXr = lambda col, row: f"{q(CE)}!${col}${row}"
sumlines = [
    f'="▪ Strong control environment ("&{CEXr(CEC["L1"], TOT)}&" countries): "&{CEXr(CEC["sorted list 1"], TOT)}',
    f'="▪ Moderate control environment ("&{CEXr(CEC["L2"], TOT)}&"): "&{CEXr(CEC["sorted list 2"], TOT)}',
    f'="▪ Weak control environment ("&{CEXr(CEC["L3"], TOT)}&"): "&{CEXr(CEC["sorted list 3"], TOT)}',
    f'="▪ Critical attention required ("&{CEXr(CEC["L4"], TOT)}&"): "&{CEXr(CEC["sorted list 4"], TOT)}&IF({CEXr(CEC["L5"], TOT)}>0,"   |   Insufficient data: "&{CEXr(CEC["sorted list 5"], TOT)},"")',
    (f'="▪ Weakest Policy Sections: "&INDEX({CEx("A")},MATCH(1,{CEx("U")},0))&" ("&TEXT(INDEX({CEx("K")},MATCH(1,{CEx("U")},0)),"0%")&"), "'
     f'&INDEX({CEx("A")},MATCH(2,{CEx("U")},0))&" ("&TEXT(INDEX({CEx("K")},MATCH(2,{CEx("U")},0)),"0%")&"), "'
     f'&INDEX({CEx("A")},MATCH(3,{CEx("U")},0))&" ("&TEXT(INDEX({CEx("K")},MATCH(3,{CEx("U")},0)),"0%")&") – ranked by number of Insufficient answers"'),
    (f'="▪ Most frequent deficiency: Q"&INDEX({CEq("A")},MATCH(1,{CEq("L")},0))&" ("&INDEX({CEq("B")},MATCH(1,{CEq("L")},0))&") – gap in "&INDEX({CEq("I")},MATCH(1,{CEq("L")},0))&" countries ("&INDEX({CEq("F")},MATCH(1,{CEq("L")},0))&" Insufficient)."'),
    (f'="▪ Action plans: "&{CET("Actions")}&" actions, "&{CET("Open actions")}&" open, "&{CET("Overdue actions")}&" overdue. "&{CET("Gaps w/o action plan")}&" of "&{CET("Gaps (MC+IC)")}&" control gaps have no linked action ("&{CET("IC w/o action plan")}&" of them Insufficient)."'),
    (f'="▪ Evidence: "&{CET("Applicable w/o uploaded evidence")}&" applicable answers have no uploaded evidence, incl. "&{CET("UC w/o evidence")}&" rated UNDER CONTROL – these ratings need verification."'),
]
for k, f_ in enumerate(sumlines):
    put(ws, f'B{6+k}', f_, size=10, wrap=True)
    ws.merge_cells(f'B{6+k}:P{6+k}'); ws.row_dimensions[6 + k].height = 28
kr = 15
put(ws, f'B{kr}', 'A. REGIONAL OVERVIEW', bold=True, color=WHITE, bg=NAVY); ws.merge_cells(f'B{kr}:P{kr}')
tiles = [('Countries assessed', f'=COUNTIF({CER("Total Q")},">0")', '0'), ('Complete assessments', f"={q(CE)}!$D${TOT+1}", '0'),
         ('Incomplete assessments', f"={q(CE)}!$D${TOT+2}", '0'), ('Regional control score', f'={CET("Score")}', PCT),
         ('Under Control %', f'={CET("UC %")}', PCT), ('Moderate Control %', f'={CET("MC %")}', PCT), ('Insufficient Control %', f'={CET("IC %")}', PCT),
         ('Control gaps (MC+IC)', f'={CET("Gaps (MC+IC)")}', '0'), ('Open actions', f'={CET("Open actions")}', '0'), ('Overdue actions', f'={CET("Overdue actions")}', '0')]
for k, (lab, f_, fmt) in enumerate(tiles):
    row = kr + 1 + (k // 5) * 2; col = 2 + (k % 5) * 3
    put(ws, f'{gl(col)}{row}', lab, bold=True, size=9, color='595959', bg=LIGHT, align='center')
    ws.merge_cells(f'{gl(col)}{row}:{gl(col+2)}{row}')
    put(ws, f'{gl(col)}{row+1}', f_, bold=True, size=16, color=NAVY, bg=PALE, fmt=fmt, align='center')
    ws.merge_cells(f'{gl(col)}{row+1}:{gl(col+2)}{row+1}')
    ws.row_dimensions[row + 1].height = 28
ws[f'{gl(2+4*3)}{kr+4}'].font = font(True, 16, RED[1])
cr = kr + 7
put(ws, f'B{cr}', 'B. COUNTRY PERFORMANCE (ranked)', bold=True, color=WHITE, bg=NAVY); ws.merge_cells(f'B{cr}:P{cr}')
dh = ['Rank', 'Country', 'Cluster', 'Score', 'UC %', 'MC %', 'IC %', 'IC #', 'Gaps', 'No AP', 'Overdue', 'Classification', '', 'Support priority', 'Trend']
header_row(ws, cr + 1, 2, dh, height=30)
ws.merge_cells(f'M{cr+1}:N{cr+1}')
dsrc = {'Country': 'B', 'Cluster': 'C', 'Score': 'N', 'UC %': 'K', 'MC %': 'L', 'IC %': 'M', 'IC #': 'H', 'Gaps': 'Q', 'No AP': 'R',
        'Overdue': 'V', 'Classification': 'P', 'Support priority': 'Z', 'Trend': 'Y'}
for i in range(NC):
    r = cr + 2 + i
    for j, h in enumerate(dh):
        col = gl(2 + j)
        if h == '': continue
        v = i + 1 if h == 'Rank' else f"={q(R)}!${dsrc[h]}${6+i}"
        cc = ws[f'{col}{r}']; cc.value = v
        cell_style(cc, size=9, fmt=PCT if h in ('Score', 'UC %', 'MC %', 'IC %') else None, bold=h in ('Country', 'Classification'))
    ws.merge_cells(f'M{r}:N{r}')
DB1 = cr + 1 + NC
class_cf(ws, f'M{cr+2}:N{DB1}', f'M{cr+2}')
class_cf(ws, f'B{cr+2}:C{DB1}', f'M{cr+2}')
for txt, colr in [('High', RED), ('Medium', ORANGE), ('Low', GREEN), ('Data follow-up', GREY)]:
    ws.conditional_formatting.add(f'O{cr+2}:O{DB1}', CellIsRule(operator='equal', formula=[f'"{txt}"'], fill=fill(colr[0]), font=Font(color=colr[1], bold=True)))
ws.conditional_formatting.add(f'E{cr+2}:E{DB1}', DataBarRule(start_type='num', start_value=0.5, end_type='num', end_value=1, color='5B9BD5'))
ws.conditional_formatting.add(f'L{cr+2}:L{DB1}', CellIsRule(operator='greaterThan', formula=['0'], fill=fill(RED[0]), font=Font(color=RED[1], bold=True)))
lg = DB1 + 1
for k, (txt, colr) in enumerate([('Strong', GREEN), ('Moderate', YELLOW), ('Weak', ORANGE), ('Critical', RED), ('Insufficient data / N/A', GREY)]):
    put(ws, f'{gl(2+k*3)}{lg}', txt, bg=colr[0], color=colr[1], bold=True, size=9, align='center'); ws.merge_cells(f'{gl(2+k*3)}{lg}:{gl(4+k*3)}{lg}')
rr0 = lg + 2
put(ws, f'B{rr0}', 'C. REGIONAL RISK OVERVIEW – top 5 per indicator', bold=True, color=WHITE, bg=NAVY); ws.merge_cells(f'B{rr0}:P{rr0}')
for t, (lab, key, val, fmt) in enumerate(TOPS):
    c0 = 2 + t * 3
    put(ws, f'{gl(c0)}{rr0+1}', lab, bold=True, size=9, bg=LIGHT, wrap=True); ws.merge_cells(f'{gl(c0)}{rr0+1}:{gl(c0+2)}{rr0+1}')
    for k in range(5):
        r = rr0 + 2 + k
        put(ws, f'{gl(c0)}{r}', f"={q(RK)}!{gl(1+t*3)}{t0+1+k}", size=9); ws.merge_cells(f'{gl(c0)}{r}:{gl(c0+1)}{r}')
        put(ws, f'{gl(c0+2)}{r}', f"={q(RK)}!{gl(2+t*3)}{t0+1+k}", size=9, fmt=fmt, bold=True)
ws.row_dimensions[rr0 + 1].height = 30
put(ws, f'B{rr0+8}', f'="Countries requiring regional intervention (support priority HIGH): "&IF({q(CE)}!$BG${C1}="","None",LEFT({q(CE)}!$BG${C1},LEN({q(CE)}!$BG${C1})-2))', bold=True, color=RED[1], wrap=True)
ws.merge_cells(f'B{rr0+8}:P{rr0+8}'); ws.row_dimensions[rr0 + 8].height = 30
pr0 = rr0 + 10
put(ws, f'B{pr0}', 'D. POLICY SECTION ANALYSIS', bold=True, color=WHITE, bg=NAVY); ws.merge_cells(f'B{pr0}:P{pr0}')
header_row(ws, pr0 + 1, 2, ['Rank', 'Scope (Policy chapter)', '', '', 'Score', 'UC %', 'MC %', 'IC %', 'Implementation', ''], height=20)
ws.merge_cells(f'C{pr0+1}:E{pr0+1}'); ws.merge_cells(f'J{pr0+1}:K{pr0+1}')
for i in range(len(SCOPES)):
    r = pr0 + 2 + i
    for col, src, fmt in [('B', 'A', '0'), ('C', 'B', None), ('F', 'L', PCT), ('G', 'I', PCT), ('H', 'J', PCT), ('I', 'K', PCT), ('J', 'M', None)]:
        cc = ws[f'{col}{r}']; cc.value = f"={q(P)}!${src}${7+i}"; cell_style(cc, size=9, fmt=fmt)
    ws.merge_cells(f'C{r}:E{r}'); ws.merge_cells(f'J{r}:K{r}')
impl_cf(ws, f'J{pr0+2}:K{pr0+1+len(SCOPES)}')
put(ws, f'L{pr0+1}', '5 weakest Policy Sections (by score)', bold=True, bg=NAVY, color=WHITE); ws.merge_cells(f'L{pr0+1}:P{pr0+1}')
for k in range(5):
    r = pr0 + 2 + k
    put(ws, f'L{r}', f"={q(P)}!$B${P_S1-k}&\"  (\"&TEXT({q(P)}!$M${P_S1-k},\"0%\")&\"; IC in \"&{q(P)}!$O${P_S1-k}&\" countries)\"", size=9)
    ws.merge_cells(f'L{r}:P{r}')
# chart data area (far right) & charts
cdc = 'AC'
put(ws, f'{cdc}5', 'Chart data (do not edit)', bold=True, size=8, color='808080')
for k, (lab, h) in enumerate([('Under Control', 'Under Control'), ('Moderate Control', 'Moderate'), ('Insufficient Control', 'Insufficient'), ('N/A', 'N/A')]):
    put(ws, f'AC{6+k}', lab, size=8); put(ws, f'AD{6+k}', f'={CET(h)}', size=8)
for k, s in enumerate(STAT[:6]):
    put(ws, f'AC{12+k}', s, size=8); put(ws, f'AD{12+k}', f"={q(CE)}!$B${A0+k}", size=8)
put(ws, 'AC18', 'Overdue', size=8); put(ws, 'AD18', f"={q(CE)}!$B${A0+len(STAT)}", size=8)
ch = BarChart(); ch.type = 'bar'; ch.title = 'Country control score (ranked)'
ch.add_data(Reference(ws, min_col=5, min_row=cr + 1, max_row=DB1), titles_from_data=True)
ch.set_categories(Reference(ws, min_col=3, min_row=cr + 2, max_row=DB1))
ch.x_axis.scaling.orientation = 'maxMin'; ch.y_axis.scaling.min = 0.7; ch.y_axis.scaling.max = 1; ch.y_axis.number_format = '0%'
ch.series[0].graphicalProperties = GraphicalProperties(solidFill='2F5597'); ch.legend = None
ch.height = 17; ch.width = 15; ch.roundedCorners = False; ch.title.overlay = False; ch.x_axis.delete = False; ch.y_axis.delete = False
ws.add_chart(ch, f'R{cr}')
pc = PieChart(); pc.title = 'Regional distribution of answers (1,952)'
pc.add_data(Reference(ws, min_col=30, min_row=6, max_row=9)); pc.set_categories(Reference(ws, min_col=29, min_row=6, max_row=9))
from openpyxl.chart.series import DataPoint
for k, colr in enumerate(['70AD47', 'FFC000', 'C00000', 'A6A6A6']):
    pt = DataPoint(idx=k); pt.graphicalProperties.solidFill = colr; pc.series[0].dPt.append(pt)
pc.dataLabels = DataLabelList(); pc.dataLabels.showPercent = True
pc.height = 8; pc.width = 12; pc.roundedCorners = False; pc.title.overlay = False; pc.legend.position = 'r'; pc.legend.overlay = False
ws.add_chart(pc, 'R5')
bc = BarChart(); bc.type = 'col'; bc.title = 'Action plan status'
bc.add_data(Reference(ws, min_col=30, min_row=12, max_row=18)); bc.set_categories(Reference(ws, min_col=29, min_row=12, max_row=18))
bc.series[0].graphicalProperties = GraphicalProperties(solidFill='2F5597'); bc.legend = None
bc.dataLabels = DataLabelList(); bc.dataLabels.showVal = True
bc.height = 8; bc.width = 15; bc.roundedCorners = False; bc.title.overlay = False; bc.x_axis.delete = False; bc.y_axis.delete = False
ws.add_chart(bc, f'R{rr0}')
sc = BarChart(); sc.type = 'bar'; sc.title = 'Score by Scope'
sc.add_data(Reference(ws, min_col=6, min_row=pr0 + 1, max_row=pr0 + 1 + len(SCOPES)), titles_from_data=True)
sc.set_categories(Reference(ws, min_col=3, min_row=pr0 + 2, max_row=pr0 + 1 + len(SCOPES)))
sc.x_axis.scaling.orientation = 'maxMin'; sc.y_axis.scaling.min = 0.7; sc.y_axis.scaling.max = 1; sc.y_axis.number_format = '0%'
sc.series[0].graphicalProperties = GraphicalProperties(solidFill='70AD47'); sc.legend = None
sc.height = 8; sc.width = 15; sc.roundedCorners = False; sc.title.overlay = False; sc.x_axis.delete = False; sc.y_axis.delete = False
ws.add_chart(sc, f'R{pr0}')
widths(ws, {'A': 2, 'B': 6, 'C': 20, 'D': 10, 'E': 9, 'F': 8, 'G': 8, 'H': 8, 'I': 7, 'J': 7, 'K': 7, 'L': 8, 'M': 16, 'N': 14, 'O': 13, 'P': 13, 'Q': 2})
# high-priority list helper in CE (col BG)
wsce = WS[CE]
put(wsce, f'BG{C0-1}', 'High-priority list helper', bold=True, size=9)
for i in range(NC):
    r = C0 + i
    wsce[f'BG{r}'] = (f'=BG{r-1}&IF(AK{r}="High",A{r}&", ","")' if i > 0 else f'=IF(AK{r}="High",A{r}&", ","")')

# ======================================================================= text sheets
content.build_text_sheets(WS, LAY, globals())
content.build_ppt_sheet(WS, LAY, globals())
content.build_test_archive(WS)

for w in WS.values():
    w.page_setup.orientation = 'landscape'; w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 0
    w.sheet_properties.pageSetUpPr.fitToPage = True
    w.print_options.gridLines = False
for n, ref in NAMES.items():
    wb.defined_names[n] = DefinedName(n, attr_text=ref)
for w in WS.values():
    w.sheet_properties.tabColor = {D: 'C00000', R: '1F3864', P: '1F3864', CD: '1F3864', RK: '1F3864', AP: '1F3864',
                                   SD: '548235', CF: '7F7F7F', AR: 'A6A6A6', AU: 'BF8F00', CL: 'BF8F00', KF: 'BF8F00', CE: '7F7F7F', PR: 'C00000', TA: 'A6A6A6'}[w.title]
out = sys.argv[1] if len(sys.argv) > 1 else 'new_sheets.xlsx'
wb.save(out)
import json
json.dump({k: (v if not isinstance(v, dict) else v) for k, v in LAY.items()}, open('layout.json', 'w'), indent=1)
print('saved', out, LAY['AP_LAST'], LAY['SD_LAST'])
