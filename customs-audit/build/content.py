"""Text content: methodology, inventory, audit report, change log, archive index, key findings."""
import json, os, re
from common import *

TRACKER_ROWS = [(n, r) for r, n in [(37, 'Guyana'), (38, 'St. Maarten'), (40, 'Belize'), (41, 'Aruba'), (42, 'St. Lucia'), (43, 'St. Barthelemy'),
                                    (44, 'Antigua'), (45, 'Suriname'), (46, 'Dominica'), (47, 'St. Kitts'), (48, 'St. Vincent & Grenadines'),
                                    (49, 'Grenada'), (50, 'Anguilla'), (51, 'Nevis'), (52, 'Bonaire'), (53, 'Montserrat'), (54, 'St. Eustatius'),
                                    (55, 'Turks and Caicos Islands')]]
# Regional Actions Draft rows (aligned with section labels).  'Draft Regional Action Plan' column D is misaligned -> not used.
RAD = {'1.7 Independence': 2, 'Annex 1 Documentation of Local Procedures': 3, '2.3 Country Self-Assessment & Action Plan': 4,
       '2.5 Personnel Training': 5, '4.11 Unauthorized Release (URL)': 6, '4.12 Export Clearance': 7,
       '4.14 Regular Customs Declaration Quality Reviews': 8}


def regional_action_formula(cell):
    e = '""'
    for lab, r in reversed(list(RAD.items())):
        e = f"IF({cell}=\"{lab}\",IF('Regional Actions Draft'!C{r}=\"\",\"(section listed, no action text yet)\",'Regional Actions Draft'!C{r}),{e})"
    return e


METHODOLOGY = [
    ('Purpose', 'Provide a fair, transparent and reproducible comparison of the Customs Compliance control environment of the 32 Americas countries, based exclusively on the country self-assessment worksheets contained in this workbook.'),
    ('Authoritative source', 'The 32 country assessment worksheets (e.g. "USA", "Bahamas") are the authoritative source: they hold the country answer, evidence flag, Control Level and gap comments. All consolidated views (07 – Source Data and everything built on it) are LIVE formulas over those sheets. Legacy consolidations ("1. Data-All Assessments 2026", "1. Data-Control Country Matrix") were found to contain errors and are not used as sources.'),
    ('Unit of analysis', 'Question level (61 questions × 32 countries = 1,952 answers). Questions are grouped into 36 Policy Sections (controls) exactly as in "1. Data-Control Country Matrix", and into 8 Scopes (Policy chapters) as in "Config - Structure".'),
    ('Response categories', 'UNDER CONTROL, MODERATE CONTROL, INSUFFICIENT CONTROL (English or Spanish labels accepted, see mapping B), N/A (not applicable), MISSING (blank control level), INVALID (any other text). N/A, MISSING and INVALID are reported separately and are NEVER counted as failures.'),
    ('Denominator', 'Applicable answers = Under + Moderate + Insufficient. N/A and missing answers are excluded from all percentages and from the score, but are shown in separate columns.'),
    ('Percentages', 'UC % = Under Control / Applicable; MC % = Moderate / Applicable; IC % = Insufficient / Applicable. The three always add up to 100% of applicable answers.'),
    ('Control score', 'Weighted average over applicable answers using the workbook\'s established value table (Config - Configuracion): UNDER CONTROL = 1.00, MODERATE = 0.75, INSUFFICIENT = 0. A stricter 100/50/0 sensitivity score is shown alongside to test robustness of the ranking.'),
    ('Country classification', '1 Strong: score ≥ 95% and no Insufficient answer. 2 Moderate: score ≥ 90% and Insufficient ≤ 5% of applicable. 3 Weak: score ≥ 75% and Insufficient < 10%. 4 Critical Attention Required: otherwise. 5 Insufficient Data: >10% missing/invalid answers or <50% applicable questions (not forced into a performance category).'),
    ('Rationale for thresholds', '0.90 and 0.75 are the thresholds already used by the workbook to classify a control as UNDER / MODERATE (1. Data-Control Country Matrix). The 95% tier separates best-in-class countries. The Insufficient-% guard rails prevent a high average from masking concentrated Insufficient Control answers. All values are parameters (section A) and must be validated by Regional Management – they are NOT official DHL scoring rules.'),
    ('Control gap', 'Any applicable answer rated MODERATE or INSUFFICIENT. "Gap without action plan" = gap whose question number does not appear in any action of the country Action Plan.'),
    ('Evidence', '"Evidence Uploaded to SharePoint" standardized (Yes/Si → Uploaded; No / N/A / blank → not uploaded). A country is not assumed compliant because it answered: answers rated UNDER CONTROL without uploaded evidence are flagged for verification.'),
    ('Action plans', 'Consolidated from the 32 Action Plan sheets by live links. Due dates typed as text are interpreted (DD.MM.YYYY unless the second number > 12, in which case MM.DD.YYYY) and every interpretation is flagged; non-dates (e.g. "TBD", "Todo el Año") are not interpreted. Open = status not Completed/Cancelled (missing status = open and flagged). Overdue = open and interpreted due date before the report date.'),
    ('Support priority', 'HIGH: Critical classification, ≥3 Insufficient answers or ≥3 overdue actions. MEDIUM: Weak classification, any overdue action, ≥3 gaps without action plan, or an Insufficient answer without action plan. LOW: otherwise. DATA FOLLOW-UP: insufficient data.'),
    ('Trend', 'Compared with the undated backup snapshot "Assessments bkp" (answers reference 2023 evidence, i.e. a previous cycle). Δ ≥ +2 pp Improving, ≤ −2 pp Deteriorating, otherwise Stable. Because the snapshot is undated and unvalidated, trends are indicative only.'),
    ('Policy Section implementation', 'Section score ≥ 90% Strong, ≥ 75% Moderate, otherwise Weak (same scoring and thresholds as countries).'),
    ('Recalculation', 'Everything recalculates when a country sheet changes. The only volatile function is TODAY() in the report date parameter. Workbook is set to full recalculation on open; PivotTables in legacy sheets are set to refresh on open.'),
]

# ----------------------------------------------------------------------------- inventory
CAT = {'A': 'Essential source data', 'B': 'Country-level assessment', 'C': 'Country action plan', 'D': 'Regional analysis',
       'E': 'Dashboard & reporting', 'F': 'Configuration & mapping', 'G': 'Backup / historical', 'H': 'Redundant / removable'}
EMPTY = ['Final-ByScope', 'Sheet10', 'Sheet7', 'SelfAssessment', 'SelfAssessment 2026', 'Sheet6', 'Sheet3', 'Sheet2', 'Sheet5', 'Sheet33',
         'Countries 2026', 'Sheet4']
LEGACY = {
    '1. Data-Control Country Matrix': ('D', 'Question → 36-control matrix per country (VLOOKUP to country sheets, value lookup to Config - Configuracion).', 'Improve', 'Formula defects corrected (Canada range, approximate match, hardcoded N/A, inconsistent thresholds). Retained as legacy control-level view; superseded by 07/13.'),
    '1. Data-All Assessments 2026': ('D', 'Long table (AssessmentsTable) consolidating all answers; source of pivot caches 5 and 8.', 'Improve', 'Label-translation defect corrected (549 answers wrongly shown as N/A) and Canada #N/A fixed. Superseded by 07 – Source Data.'),
    '1. Data-All Assessments TOP20': ('G', 'Duplicate of AssessmentsTable with extra columns; source of pivot cache 1.', 'Archive', 'Same defects corrected as in 1. Data-All Assessments 2026; duplicate – archive.'),
    'Self Assessment Results': ('D', 'Country summary (question and control counts, quality rating) + 2 pivots.', 'Improve', 'Hardcoded counts replaced by formulas; superseded by 02 – Country Ranking.'),
    '2. SelfAssessmentPerQuestions': ('D', 'Pivot/table of answers per question (TableQuestions).', 'Consolidate', 'Superseded by 03 section C; retained.'),
    '2. SelfAssessmentPerQuestio (2)': ('G', 'Copy of 2. SelfAssessmentPerQuestions (TableQuestions14).', 'Archive', 'Duplicate – archived.'),
    'SelfAssessmentPerQuestions bkp': ('G', 'Older backup of per-question analysis (Table6, chart, pivot cache 2).', 'Archive', 'Backup – archived.'),
    'bySection bkp': ('G', 'Older backup of by-section pivot and chart.', 'Archive', 'Backup – archived.'),
    'Assessments bkp': ('G', 'Static snapshot of all answers from a previous cycle (2023 evidence references).', 'Archive', 'Used as prior snapshot for indicative trend analysis.'),
    '3. Data-Assessments control': ('D', 'Long table country × 36 controls (links to matrix); source of pivot caches 6/7.', 'Consolidate', 'Retained (feeds pivots); superseded by 13 – Calc Engine.'),
    '3.Final-DetailsControlCountries': ('D', 'Control × country matrix of control levels (links to matrix).', 'Consolidate', 'Retained; superseded by 05 heat map.'),
    '3.Final-SAPerControl': ('D', 'Regional distribution per control (charts).', 'Improve', 'Hardcoded counts replaced by COUNTIF formulas on 3.Final-DetailsControlCountries.'),
    '3.Final-SAPerControlAreas': ('D', 'Pivot of control areas %.', 'Consolidate', 'Pivot – refresh on open; superseded by 03.'),
    '3.FinalPiv-KeyCountriesControl': ('D', 'Pivot of key countries per control.', 'Consolidate', 'Pivot – refresh on open.'),
    '3.RawPivot-TopControl': ('D', 'Raw pivot over controls.', 'Consolidate', 'Pivot – refresh on open.'),
    '4.Final-AM Risk Assessment': ('D', 'Regional risk/control assessment per control (weights 1/0.5/0, thresholds 0.91/0.61).', 'Improve', 'Hardcoded counts replaced by formulas; methodology inconsistency documented; superseded by 05.'),
    '2. Final-TopQuestions': ('D', 'Static list of top questions.', 'Consolidate', 'Static values – superseded by 03 section C.'),
    '2. RawPivot-TopQuestions': ('D', 'Pivot over AssessmentsTable.', 'Consolidate', 'Pivot – refresh on open.'),
    '2. RawPivot-CountriesByPolSec': ('D', 'Pivot over AssessmentsTable.', 'Consolidate', 'Pivot – refresh on open.'),
    '2.Final-byScope': ('D', 'By-scope pivots and charts.', 'Consolidate', 'Superseded by 03 section A.'),
    'No-DetailsPerQuestionsCountries': ('D', 'Static question × country matrix (Table2).', 'Archive', 'Static values; superseded by 05/07.'),
    'DetailsScope': ('D', 'Scope details + pivot.', 'Archive', 'Legacy analysis.'),
    '1.RawPivot-ByScope': ('D', 'Raw pivot by scope.', 'Archive', 'Legacy pivot.'),
    '2.Formula-Details by Scope': ('D', 'Formula details by scope.', 'Archive', 'Legacy analysis.'),
    'Summary': ('E', 'Static summary of most frequent gaps (prior cycle).', 'Archive', 'Static, prior-cycle values.'),
    'Annex 1': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '7. Escalations ': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '6. Reporting & Investigation of': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '5. Customs Representation': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '4. Customs Process Controls': ('E', 'Scope presentation sheet with charts and formulas.', 'Archive', 'Presentation sheet.'),
    '3. Regulatory Supervision': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '2. Customs Awareness & Risk Man': ('E', 'Scope presentation sheet with chart.', 'Archive', 'Presentation sheet (static).'),
    '1. About the DHL Express Global': ('E', 'Scope presentation sheet with chart and formulas.', 'Archive', 'Presentation sheet.'),
    'PIVOT TABLAS': ('D', 'Two pivots over the results summary.', 'Archive', 'Legacy pivots – refresh on open.'),
    'Details': ('E', 'Static detail layout.', 'Archive', 'Static.'),
    'A': ('E', 'Static working table.', 'Archive', 'Static working sheet.'),
    'Scopes ': ('E', 'Static scope matrix (prior cycle).', 'Archive', 'Static.'),
    'Countries': ('E', 'Static country matrix (prior cycle).', 'Archive', 'Static.'),
    'Countries 2': ('E', 'Static country matrix.', 'Archive', 'Static.'),
    'Countries 3': ('E', 'Static country matrix.', 'Archive', 'Static.'),
    'matrix 1': ('E', 'Static matrix.', 'Archive', 'Static.'),
    'Matrix 2': ('E', 'Static matrix.', 'Archive', 'Static.'),
    'B': ('E', 'Static working table.', 'Archive', 'Static working sheet.'),
    'Quality': ('D', 'Quality evaluation of submissions (form / iShare / test).', 'Retain', 'Retained (management input).'),
    'Regional Action': ('E', 'Draft regional actions (by area).', 'Retain', 'Retained – management draft.'),
    'Regional Actions Draft': ('E', 'Draft regional actions by Policy Section.', 'Retain', 'Retained; texts surfaced in 03 section B.'),
    'Draft Regional Action Plan': ('E', 'Draft regional action plan by control ID.', 'Archive', 'Column D texts are misaligned with control IDs – not used; archived.'),
    '5.Policy Tracker 2026': ('E', 'Policy roll-out tracker per country (incl. agent countries).', 'Retain', 'Retained; non-assessed countries listed in 02.'),
    '5.Compliance 2026': ('E', 'Compliance % per country (hardcoded, unexplained source) + pivot and charts.', 'Improve', 'Threshold gap in formula corrected; source of K values unverifiable – flagged.'),
    'Sheet32': ('H', 'Pivot output without labels.', 'Archive', 'Contains a PivotTable – archived, not deleted.'),
    'Config - Structure': ('F', 'Question master (scope, section, question).', 'Retain', 'Retained; normalised copy in 08.'),
    'Config - Configuracion': ('F', 'Label → value table (weights) and quality rating scale.', 'Retain', 'Retained; weights linked from 08.'),
    'Mapping': ('F', 'Company code ↔ country mapping.', 'Retain', 'Retained.'),
}


def inventory(cfg):
    inv = {}
    for line in open(os.path.join(HERE, 'inventory_raw.txt')):
        m = re.match(r"(\d+) '(.*)' (\w+) (\S+) f= (\d+) err= (\d+) piv= (\d+) tbl= (\[.*?\]) charts= (\d+) merged= (\d+) cf= (\d+) dv= (\d+)", line)
        if m:
            inv[m.group(2)] = dict(pos=int(m.group(1)), state=m.group(3), dim=m.group(4), f=int(m.group(5)), piv=int(m.group(7)),
                                   tbl=m.group(8), charts=int(m.group(9)), merged=int(m.group(10)), cf=int(m.group(11)))
    ctry = {c['sheet'] for c in cfg['reg']}; aps = {c['ap'] for c in cfg['reg']}
    rows = []
    for n, d in sorted(inv.items(), key=lambda x: x[1]['pos']):
        if n in ctry:
            cat, purpose, rec, action = 'B', 'Country self-assessment form (61 questions; answers, evidence, Control Level, gaps). AUTHORITATIVE SOURCE.', 'Retain', 'Retained unchanged; linked live into 07 – Source Data. Data validation added to the Control Level column.'
        elif n in aps:
            cat, purpose, rec, action = 'C', 'Country Action Plan.', 'Retain', 'Retained unchanged; linked live into 06 – Regional Action Plan. Data validation added to Status column.'
        elif n in EMPTY:
            cat, purpose, rec, action = 'H', 'Empty placeholder (no cells, no formulas, no references, no objects).', 'Remove', 'REMOVED (verified empty and unreferenced).'
        else:
            cat, purpose, rec, action = LEGACY.get(n, ('D', '', 'Archive', ''))
        rows.append([d['pos'], n, cat + ' – ' + CAT[cat], purpose, d['dim'], d['f'], d['piv'], d['tbl'].strip('[]').replace("'", ''), d['charts'], d['merged'], d['cf'], rec, action])
    return rows


def write_table(ws, r, headers, rows, widths_=None, wrapcols=(), height=None, fmt=None):
    header_row(ws, r, 1, headers, height=32)
    for i, row in enumerate(rows):
        for j, v in enumerate(row):
            c = ws.cell(r + 1 + i, j + 1, v)
            if isinstance(v, str) and v.startswith('=') and not v.startswith('=HYPERLINK'):
                c.value = v; c.data_type = 's'
            cell_style(c, wrap=(j in wrapcols), size=9, fmt=(fmt or {}).get(j))
    return r + 1 + len(rows)


def build_text_sheets(WS, LAY, g):
    cfg = CFG
    narrative = json.load(open(os.path.join(HERE, 'narrative.json'))) if os.path.exists(os.path.join(HERE, 'narrative.json')) else {}
    inv = inventory(cfg)
    CE = g['CE']; R = g['R']; P = g['P']; CER = g['CER']; CET = g['CET']; CEC = LAY['CEC']

    # ------------------------------------------------------------ 09 archive
    ws = WS[AR]
    title(ws, 'Historical Archive – index of retained legacy, backup and draft worksheets',
          'Nothing in this list was deleted. These sheets are kept (grey tabs, placed after sheet 13) for traceability, for the PivotTables / charts they contain, and because some feed each other. Click a name to open it.')
    nav(ws)
    arch = [r for r in inv if r[11] in ('Archive', 'Consolidate', 'Improve', 'Retain') and not r[2].startswith(('B', 'C', 'F'))]
    rows = [[f'=HYPERLINK("#{q(r[1])}!A1","{r[1]}")', r[2], r[3], r[11], r[12], r[6], r[8]] for r in arch]
    write_table(ws, 5, ['Worksheet', 'Category', 'Purpose', 'Recommendation', 'Status / action taken', 'PivotTables', 'Charts'], rows,
                wrapcols=(2, 4))
    widths(ws, {'A': 34, 'B': 26, 'C': 60, 'D': 14, 'E': 60, 'F': 10, 'G': 8})
    ws.freeze_panes = 'A6'

    # ------------------------------------------------------------ 10 audit report
    ws = WS[AU]
    title(ws, 'Audit Report – Self-Assessment Matrix 2026 (Americas)  |  Deliverable 2',
          'Scope: complete audit of the workbook "Self-Assessment_Matrix_2026___v1__DRAFT.xlsx" (original preserved unchanged as a separate backup file).')
    nav(ws)
    r = 5
    for sec_title, paras in AUDIT_INTRO:
        put(ws, f'A{r}', sec_title, bold=True, color=NAVY, size=11); r += 1
        for p_ in paras:
            put(ws, f'A{r}', p_, wrap=True); ws.merge_cells(f'A{r}:H{r}')
            ws.row_dimensions[r].height = max(15, 14 * (len(p_) // 150 + 1)); r += 1
        r += 1
    put(ws, f'A{r}', '1. Workbook inventory – verified counts', bold=True, color=NAVY, size=11); r += 1
    r = write_table(ws, r, ['Item', 'Expected (prompt)', 'Verified in original', 'Comment'], INV_COUNTS, wrapcols=(3,)) + 1
    put(ws, f'A{r}', '2. Formula findings (problem → impact → corrected formula → implemented → validation)', bold=True, color=NAVY, size=11); r += 1
    r = write_table(ws, r, ['ID', 'Worksheet', 'Cell / range', 'Problem', 'Impact on the analysis', 'Corrected formula / treatment', 'Implemented', 'Validation'],
                    FINDINGS, wrapcols=(1, 2, 3, 4, 5, 7)) + 1
    put(ws, f'A{r}', '3. Data-quality findings', bold=True, color=NAVY, size=11); r += 1
    r = write_table(ws, r, ['ID', 'Area', 'Finding', 'Treatment in the improved workbook'], DQ, wrapcols=(1, 2, 3)) + 1
    put(ws, f'A{r}', '4. Live reconciliation checks (recalculate automatically)', bold=True, color=NAVY, size=11); r += 1
    checks = reconciliation_checks(LAY, g)
    header_row(ws, r, 1, ['#', 'Check', 'Value A', 'Value B', 'Result'])
    r += 1; c0 = r
    for i, (lab, a, b) in enumerate(checks):
        ws.cell(r, 1, i + 1); ws.cell(r, 2, lab); ws.cell(r, 3, a); ws.cell(r, 4, b)
        ws.cell(r, 5, f'=IF(ROUND(C{r}-D{r},9)=0,"PASS","FAIL")')
        for j in range(5): cell_style(ws.cell(r, j + 1), size=9, wrap=j == 1)
        r += 1
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Font as _F
    ws.conditional_formatting.add(f'E{c0}:E{r-1}', CellIsRule(operator='equal', formula=['"PASS"'], fill=fill(GREEN[0]), font=_F(color=GREEN[1], bold=True)))
    ws.conditional_formatting.add(f'E{c0}:E{r-1}', CellIsRule(operator='equal', formula=['"FAIL"'], fill=fill(RED[0]), font=_F(color=RED[1], bold=True)))
    r += 1
    put(ws, f'A{r}', '5. Worksheet inventory and disposition (129 original worksheets)', bold=True, color=NAVY, size=11); r += 1
    r = write_table(ws, r, ['#', 'Worksheet (original)', 'Category', 'Purpose', 'Used range', 'Formulas', 'Pivots', 'Tables', 'Charts', 'Merged', 'CF rules',
                            'Recommendation', 'Action taken'], inv, wrapcols=(3, 12)) + 1
    put(ws, f'A{r}', '6. Worksheets improved / consolidated / archived / removed', bold=True, color=NAVY, size=11); r += 1
    for k in ['Improve', 'Consolidate', 'Archive', 'Remove', 'Retain']:
        lst = [x[1] for x in inv if x[11] == k]
        put(ws, f'A{r}', f'{k} ({len(lst)})', bold=True); put(ws, f'B{r}', ', '.join(lst) if k not in ('Retain',) else ', '.join(lst[:12]) + (' … (+ 32 country and 32 action-plan sheets)' if len(lst) > 12 else ''), wrap=True)
        ws.merge_cells(f'B{r}:H{r}'); ws.row_dimensions[r].height = max(15, 14 * (len(', '.join(lst)) // 140 + 1)); r += 1
    r += 1
    put(ws, f'A{r}', '7. Improvements implemented', bold=True, color=NAVY, size=11); r += 1
    for p_ in IMPROVEMENTS:
        put(ws, f'A{r}', '▪ ' + p_, wrap=True); ws.merge_cells(f'A{r}:H{r}'); ws.row_dimensions[r].height = max(15, 14 * (len(p_) // 150 + 1)); r += 1
    r += 1
    put(ws, f'A{r}', '8. Remaining limitations', bold=True, color=NAVY, size=11); r += 1
    for p_ in LIMITATIONS:
        put(ws, f'A{r}', '▪ ' + p_, wrap=True); ws.merge_cells(f'A{r}:H{r}'); ws.row_dimensions[r].height = max(15, 14 * (len(p_) // 150 + 1)); r += 1
    widths(ws, {'A': 8, 'B': 30, 'C': 22, 'D': 48, 'E': 40, 'F': 50, 'G': 14, 'H': 36, 'I': 8, 'J': 8, 'K': 8, 'L': 14, 'M': 50})

    # ------------------------------------------------------------ 11 change log
    ws = WS[CL]
    title(ws, 'Change Log – significant changes  |  Deliverable 3', 'Every change applied to produce "Self-Assessment Matrix 2026 – FINAL IMPROVED.xlsx". Original file kept unchanged as backup.')
    nav(ws)
    write_table(ws, 5, ['#', 'Worksheet', 'Original situation', 'Problem identified', 'Action taken', 'Result'],
                [[i + 1] + list(x) for i, x in enumerate(CHANGES)], wrapcols=(1, 2, 3, 4, 5))
    md = json.load(open(os.path.join(HERE, 'matrix_diff.json'))) if os.path.exists(os.path.join(HERE, 'matrix_diff.json')) else None
    if md:
        r0 = 5 + len(CHANGES) + 3
        put(ws, f'A{r0}', f"Appendix – '1. Data-Control Country Matrix': control results that changed after replacing the {md['hard']} hardcoded cells ({len(md['diff'])} changes)", bold=True, color=NAVY, size=11)
        write_table(ws, r0 + 1, ['#', 'Country', 'Policy Section (Control)', 'Cell', 'Previous value', 'Corrected value (formula)', 'Previous cell type'],
                    [[i + 1] + d for i, d in enumerate(md['diff'])])
    widths(ws, {'A': 5, 'B': 30, 'C': 50, 'D': 50, 'E': 55, 'F': 45, 'G': 16})
    ws.freeze_panes = 'A6'

    # ------------------------------------------------------------ 12 key findings
    ws = WS[KF]
    title(ws, 'Key Regional Findings  |  Deliverable 4',
          'Results columns are LIVE formulas. "Analyst commentary" was written from the data as at the report date shown and must be re-read if source assessments change.')
    nav(ws)
    put(ws, 'A4', '="Report date: "&TEXT(p_ReportDate,"dd-mmm-yyyy")', italic=True)
    TOT = LAY['TOT']
    ce = lambda col, row: f"{q(CE)}!${col}${row}"
    X0, X1, Q0, Q1 = LAY['X0'], LAY['X1'], LAY['Q0'], LAY['Q1']
    CEx = lambda col: f"{q(CE)}!${col}${X0}:${col}${X1}"
    CEq = lambda col: f"{q(CE)}!${col}${Q0}:${col}${Q1}"
    def wsec(k):
        return (f'INDEX({CEx("A")},MATCH({k},{CEx("U")},0))&" – score "&TEXT(INDEX({CEx("K")},MATCH({k},{CEx("U")},0)),"0.0%")&"; Insufficient in "&INDEX({CEx("M")},MATCH({k},{CEx("U")},0))&" countries; Moderate in "&INDEX({CEx("N")},MATCH({k},{CEx("U")},0))')
    def wq(k):
        return (f'"Q"&INDEX({CEq("A")},MATCH({k},{CEq("L")},0))&" ("&INDEX({CEq("B")},MATCH({k},{CEq("L")},0))&"): gap in "&INDEX({CEq("I")},MATCH({k},{CEq("L")},0))&" of "&INDEX({CEq("H")},MATCH({k},{CEq("L")},0))&" applicable countries ("&INDEX({CEq("F")},MATCH({k},{CEq("L")},0))&" Insufficient, "&INDEX({CEq("E")},MATCH({k},{CEq("L")},0))&" Moderate)"')
    rows = [
        ('Top-performing countries (Strong)', f'={ce(CEC["sorted list 1"], TOT)}', f'="Count: "&{ce(CEC["L1"], TOT)}'),
        ('Countries with moderate control', f'={ce(CEC["sorted list 2"], TOT)}', f'="Count: "&{ce(CEC["L2"], TOT)}'),
        ('Countries with weak controls', f'={ce(CEC["sorted list 3"], TOT)}', f'="Count: "&{ce(CEC["L3"], TOT)}'),
        ('Countries requiring immediate attention (Critical)', f'={ce(CEC["sorted list 4"], TOT)}', f'="Count: "&{ce(CEC["L4"], TOT)}'),
        ('Countries with insufficient data', f'={ce(CEC["sorted list 5"], TOT)}', f'="Count: "&{ce(CEC["L5"], TOT)}'),
        ('Countries needing regional support (priority HIGH)', f"=IFERROR(LEFT(_xlfn.CONCAT({q(CE)}!$BG${LAY['C0']}:$BG${LAY['C1']}),LEN(_xlfn.CONCAT({q(CE)}!$BG${LAY['C0']}:$BG${LAY['C1']}))-2),\"None\")", '="See 05 – Regional Risk Assessment"'),
        ('Weakest Policy Section #1', '=' + wsec(1), ''), ('Weakest Policy Section #2', '=' + wsec(2), ''), ('Weakest Policy Section #3', '=' + wsec(3), ''),
        ('Weakest Policy Section #4', '=' + wsec(4), ''), ('Weakest Policy Section #5', '=' + wsec(5), ''),
        ('Most frequent control deficiency #1', '=' + wq(1), ''), ('Most frequent control deficiency #2', '=' + wq(2), ''),
        ('Most frequent control deficiency #3', '=' + wq(3), ''), ('Most frequent control deficiency #4', '=' + wq(4), ''),
        ('Most frequent control deficiency #5', '=' + wq(5), ''),
        ('Regional control profile', f'="Score "&TEXT({ce("P", TOT)},"0.0%")&" | UC "&TEXT({ce("L", TOT)},"0.0%")&" | MC "&TEXT({ce("M", TOT)},"0.0%")&" | IC "&TEXT({ce("N", TOT)},"0.0%")&" of "&{ce("K", TOT)}&" applicable answers ("&{ce("H", TOT)}&" N/A excluded)"', ''),
        ('Action plan execution', f'={ce(CEC["Actions"], TOT)}&" actions; "&{ce(CEC["Open actions"], TOT)}&" open; "&{ce(CEC["Overdue actions"], TOT)}&" overdue; "&{ce(CEC["Gaps w/o action plan"], TOT)}&" of "&{ce(CEC["Gaps (MC+IC)"], TOT)}&" gaps without a linked action"', ''),
        ('Evidence coverage', f'={ce(CEC["Applicable w/o uploaded evidence"], TOT)}&" applicable answers without uploaded evidence ("&{ce(CEC["UC w/o evidence"], TOT)}&" rated UNDER CONTROL)"', ''),
        ('Trend vs prior snapshot (indicative)', f'="Improving: "&COUNTIF({CER("Trend")},"Improving")&" | Stable: "&COUNTIF({CER("Trend")},"Stable")&" | Deteriorating: "&COUNTIF({CER("Trend")},"Deteriorating")&" | Regional score prior "&TEXT({ce(CEC["Prior score"], TOT)},"0.0%")&" → now "&TEXT({ce("P", TOT)},"0.0%")', ''),
    ]
    header_row(ws, 6, 1, ['Finding area', 'Result (live)', 'Supporting metric (live)', 'Analyst commentary (as at report date)'])
    for i, (a, b, c) in enumerate(rows):
        rr = 7 + i
        ws.cell(rr, 1, a); ws.cell(rr, 2, b); ws.cell(rr, 3, c); ws.cell(rr, 4, narrative.get(a, ''))
        for j in range(4): cell_style(ws.cell(rr, j + 1), wrap=True, size=9, bold=j == 0)
        ws.row_dimensions[rr].height = 45
    rr = 8 + len(rows)
    put(ws, f'A{rr}', 'Main regional improvement priorities (ANALYTICAL recommendations derived from the findings above)', bold=True, color=NAVY, size=11)
    for k, t in enumerate(narrative.get('_priorities', [])):
        put(ws, f'A{rr+1+k}', f'{k+1}.', bold=True); put(ws, f'B{rr+1+k}', t, wrap=True); ws.merge_cells(f'B{rr+1+k}:D{rr+1+k}')
        ws.row_dimensions[rr + 1 + k].height = 32
    widths(ws, {'A': 34, 'B': 70, 'C': 34, 'D': 70})
    ws.freeze_panes = 'A7'


def reconciliation_checks(LAY, g):
    CE_ = q(CE); TOT = LAY['TOT']; CEC = LAY['CEC']
    SDn = q(SD); APn = q(AP)
    return [
        ('Answers in 07 – Source Data = 32 countries × 61 questions', f'=COUNTA({SDn}!B{LAY["SD_H"]+1}:B{LAY["SD_LAST"]})', '=32*61'),
        ('Sum of country totals (13) = rows in Source Data', f'={CE_}!D{TOT}', f'=COUNTA({SDn}!B{LAY["SD_H"]+1}:B{LAY["SD_LAST"]})'),
        ('UC+MC+IC+N/A+Missing+Invalid = total answers', f'={CE_}!E{TOT}+{CE_}!F{TOT}+{CE_}!G{TOT}+{CE_}!H{TOT}+{CE_}!I{TOT}+{CE_}!J{TOT}', f'={CE_}!D{TOT}'),
        ('UNDER CONTROL in Source Data = direct COUNTIF over the 32 country sheets', f'=COUNTIF(src_Std,"UNDER CONTROL")', '=' + '+'.join(f"COUNTIF({q(c['sheet'])}!${gl(c['cl']+1)}$2:${gl(c['cl']+1)}$62,\"UNDER CONTROL\")" for c in CFG['reg'])),
        ('INSUFFICIENT in Source Data = direct COUNTIF over the 32 country sheets', f'=COUNTIF(src_Std,"INSUFFICIENT CONTROL")', '=' + '+'.join(f"COUNTIF({q(c['sheet'])}!${gl(c['cl']+1)}$2:${gl(c['cl']+1)}$62,\"INSUFFICIENT CONTROL\")" for c in CFG['reg'])),
        ('N/A in Source Data = direct COUNTIF over the 32 country sheets', f'=COUNTIF(src_Std,"N/A")', '=' + '+'.join(f"COUNTIF({q(c['sheet'])}!${gl(c['cl']+1)}$2:${gl(c['cl']+1)}$62,\"N/A\")" for c in CFG['reg'])),
        ('Regional UC% + MC% + IC% = 100%', f'={CE_}!L{TOT}+{CE_}!M{TOT}+{CE_}!N{TOT}', '=1'),
        ('Sum of scope applicable answers = regional applicable', f'=SUM({CE_}!B{LAY["S0"]}:B{LAY["S1"]})', f'={CE_}!K{TOT}'),
        ('Sum of Policy Section applicable answers = regional applicable', f'=SUM({CE_}!C{LAY["X0"]}:C{LAY["X1"]})', f'={CE_}!K{TOT}'),
        ('Section×country matrix total (UC) = regional UC', f'=SUM({CE_}!D{LAY["MAT"]["UC"]}:{gl(3+32)}{LAY["MAT"]["UC"]+35})', f'={CE_}!E{TOT}'),
        ('Section×country matrix total (IC) = regional IC', f'=SUM({CE_}!D{LAY["MAT"]["IC"]}:{gl(3+32)}{LAY["MAT"]["IC"]+35})', f'={CE_}!G{TOT}'),
        ('Question block gaps = regional gaps', f'=SUM({CE_}!I{LAY["Q0"]}:I{LAY["Q1"]})', f'={CE_}!R{TOT}'),
        ('Ranks 1..32 unique (sum of ranks = 528)', f'=SUM({CE_}!AJ{LAY["C0"]}:AJ{LAY["C1"]})', '=528'),
        ('Countries classified = 32', f'=SUM({CE_}!{CEC["L1"]}{TOT}:{CEC["L5"]}{TOT})', '=32'),
        ('Dashboard regional score = Calc Engine regional score', f"={q(D)}!K17", f'={CE_}!P{TOT}'),
        ('Ranking table UC total = Calc Engine UC total', f"=SUM({q(R)}!F6:F37)", f'={CE_}!E{TOT}'),
        ('Actions in 06 = action rows found in the 32 Action Plan sheets at build time (147)', '=SUM(ap_IsAction)', '=147'),
        ('Status distribution total = number of actions', f'=SUM({CE_}!B{LAY["A0"]}:B{LAY["A0"]+6})', '=SUM(ap_IsAction)'),
        ('Sum of country actions (13) = actions in 06', f'={CE_}!{CEC["Actions"]}{TOT}', '=SUM(ap_IsAction)'),
        ('No formula errors in Source Data standardized level (MISSING/INVALID count)', f'=COUNTIF(src_Std,"MISSING")+COUNTIF(src_Std,"INVALID")', '=0'),
    ]


INV_COUNTS = [
    ['Worksheets', '129', '129', 'All verified by direct inspection of workbook.xml.'],
    ['Hidden / very hidden worksheets', '0', '0', 'All 129 visible.'],
    ['PivotTables', '20', '20', 'On 16 worksheets; 11 pivot caches.'],
    ['Pivot caches', '11', '11', 'Last refreshed before the current answers were final – set to refresh on open.'],
    ['Defined names', '48', '48', 'All are sheet-level _FilterDatabase (AutoFilter) names; one (on "Details") pointed to #REF! and was removed.'],
    ['External links / data connections', '0 / 0', '0 / 0', 'No externalLinks or connections parts; no Power Query.'],
    ['Excel Tables', 'n/a', '12', 'AssessmentsTable, AssessmentsTable8, AssessmentsTable13, TableQuestions, TableQuestions14, Table2, Table4, Table5, Table6, TableCountryControl, KeyCountries, AssessmentControlTable.'],
    ['Charts', 'n/a', '21', 'In 17 drawings; all preserved (new sheets injected at file-package level so legacy objects are not rewritten).'],
    ['Formulas (cells)', 'n/a', '≈ 22,000', 'Largest: 1. Data-All Assessments 2026 / TOP20 (5,857 each), 1. Data-Control Country Matrix (4,875).'],
    ['Cached formula errors', 'n/a', '12', '#N/A in 1. Data-All Assessments 2026 and TOP20 (Canada Q60–61) – corrected.'],
    ['Empty worksheets', '"SelfAssessment 2026", "Countries 2026", "SelfAssessment", "Final-ByScope" + placeholders', '12 empty', 'Confirmed: Sheet2, Sheet3, Sheet4, Sheet5, Sheet6, Sheet7, Sheet10, Sheet33, SelfAssessment, SelfAssessment 2026, Countries 2026, Final-ByScope have no cells. Sheet32 is NOT empty (contains a PivotTable).'],
    ['Country assessment / action plan sheets', '≈30 / ≈30', '32 / 32', 'Each country sheet holds 61 questions, all with a Control Level (no missing answers).'],
]

AUDIT_INTRO = [
    ('Executive summary', [
        'The workbook contained the correct country answers, but several consolidated views did not reflect them. The most material defect: in "1. Data-All Assessments 2026" (and its copy "TOP20") the Control Level of 9 countries (Bolivia, Chile, Costa Rica, Ecuador, El Salvador, Mexico, Nicaragua, Panama, Venezuela – 549 answers) was displayed as "N/A" because the formula only recognised the Spanish labels (BAJO CONTROL / CONTROL MODERADO / CONTROL INSUFICIENTE) while those countries now answer in English. Every PivotTable built on that table therefore under-reported these countries.',
        'Other defects: a truncated lookup range for Canada (#N/A for Q60–61), an approximate-match VLOOKUP, hardcoded "N/A" text overwriting formulas, three different scoring/threshold schemes (0.75 vs 0.5 for Moderate; 0.90/0.75 vs 0.91/0.61 vs 91%/61–90%/≤60% thresholds), N/A included in percentage denominators, hardcoded counts in summary sheets, inconsistent country names, and action-plan dates stored as text in 25+ formats.',
        'All defects that could be corrected safely were corrected in place. A new formula-driven analytical layer (sheets 01–08 and 13) was added that reads directly from the 32 authoritative country sheets, applies one documented methodology and reconciles back to the country sheets (section 4 – live checks).',
    ]),
    ('Approach & technical method', [
        'Inventory and formula analysis were performed programmatically on every worksheet (formula text and cached values compared). Because common Python Excel libraries discard charts and drawings when saving, the improved workbook was produced by editing the original file package directly: new sheets were injected, specific legacy formulas rewritten at XML level, and the 21 charts, 20 PivotTables, comments, tables and formats of the original were left untouched. Formulas were recalculated with LibreOffice (Excel-compatible engine) to verify results and populate cached values; the file is flagged for full recalculation when opened in Microsoft Excel.',
    ]),
]

FINDINGS = [
    ['F01', '1. Data-All Assessments 2026 (AssessmentsTable), column J "Question Level"', 'J rows for Bolivia, Chile, Costa Rica, Ecuador, Mexico, Nicaragua, Panamá, Salvador, Venezuela (549 cells)',
     'Formula only translated Spanish labels; any other value (incl. the English labels now used) fell through to "N/A".',
     '9 countries showed 0 Under/Moderate/Insufficient answers – PivotTables (caches 5, 8) and every report built on them were wrong.',
     '=IF(OR(v="UNDER CONTROL",v="BAJO CONTROL"),"UNDER CONTROL",IF(OR(v="MODERATE CONTROL",v="CONTROL MODERADO"),"MODERATE CONTROL",IF(OR(v="INSUFFICIENT CONTROL",v="CONTROL INSUFICIENTE"),"INSUFFICIENT CONTROL",IF(v="N/A","N/A",IF(TRIM(v&"")="","MISSING","INVALID"))))) with v = VLOOKUP(Q#, country range, CL col, FALSE)',
     'Yes', 'Recalculated: distribution per country now equals direct counts on the country sheets (check #4–6).'],
    ['F02', '1. Data-All Assessments 2026, columns H:J (Canada)', 'Canada rows Q60, Q61 (6 cells)', 'Lookup range Canada!$A$2:$G$60 stops at Q59.', '#N/A errors; Canada Q60–61 missing from pivots.', 'Range extended to Canada!$A$2:$G$62.', 'Yes', 'No #N/A remaining.'],
    ['F03', '1. Data-All Assessments TOP20 (AssessmentsTable13)', 'Same cells as F01/F02', 'Duplicate table carries the same defects.', 'Pivot cache 1 wrong.', 'Same corrections as F01/F02.', 'Yes', 'Recalculated.'],
    ['F04', '1. Data-Control Country Matrix', 'CG2:CG62 (Canada)', 'VLOOKUP range $A$2:$G$60 excludes Q60–61.', 'Canada controls 6 and 7 (Reporting / Escalations) not evaluated.', '=VLOOKUP($C2,Canada!$A$2:$G$62,7,FALSE)', 'Yes', 'Recalculated.'],
    ['F05', '1. Data-Control Country Matrix', 'D2:D62 (Venezuela)', 'VLOOKUP without 4th argument = approximate match.', 'Silent wrong match if question order ever changes.', '=VLOOKUP($C2,Venezuela!$A$2:$H$62,8,FALSE)', 'Yes', 'Values unchanged (data sorted) – risk removed.'],
    ['F06', '1. Data-Control Country Matrix', 'AE2:AE62 (El Salvador)', 'Range starts at header row $A$1 (inconsistent with all other countries).', 'Low (header never matches), but inconsistent.', '=VLOOKUP($C2,\'El Salvador\'!$A$2:$G$62,7,FALSE)', 'Yes', 'Recalculated.'],
    ['F07', '1. Data-Control Country Matrix', 'All 32 "Control" columns (36 control cells each = 1,152 cells)',
     'Three formula variants (thresholds <0.9/≥0.9 vs <1/=1; N/A test "" vs " "); 179 of the 1,152 control cells contained the hardcoded text "N/A" instead of a formula, because N/A maps to a space (" ") and AVERAGE() then returns #DIV/0!.',
     'Hardcoded N/A never updates when a country changes an answer; inconsistent thresholds across rows.',
     '=IF(COUNT(Erange)=0,"N/A",IF(AVERAGE(Erange)>=0.9,"UNDER CONTROL",IF(AVERAGE(Erange)>=0.75,"MODERATE CONTROL","INSUFFICIENT CONTROL"))) – one formula for every control, N/A excluded via COUNT.',
     'Yes', 'All 1,152 control cells now formula-driven; 45 results changed (stale hardcoded N/A where the country has since answered) – listed in the Change Log.'],
    ['F08', 'Self Assessment Results', 'O4:P35', 'Hardcoded constants 61 and 36 ("=61-M4", "=36-N4").', 'Wrong if a question/control is added or an answer is missing.', 'O = G+I+K (applicable questions); P = H+J+L (applicable controls).', 'Yes', 'Same values today; now dynamic.'],
    ['F09', 'Self Assessment Results', 'E39:L70 and E73:H104', 'Hardcoded control counts/percentages from an earlier calculation (differ from the current matrix).', 'Pivot cache 4 and the related charts showed stale figures.', 'E..H = COUNTIF(matrix control column of the country,"UNDER CONTROL"/…); I..L (rows 39–70) = count / SUM(E:H).', 'Yes', 'Recalculated – sums to 100% per row.'],
    ['F10', '3.Final-SAPerControl', 'D2:G37; H2:K37', 'Counts hardcoded; percentages divided by a hardcoded 32 (N/A included in the denominator).', 'Stale and not reproducible; N/A diluted percentages.', 'D..G = COUNTIF(row of the control in 3.Final-DetailsControlCountries, level); /32 replaced by /COUNTA(country header). Percent-of-applicable provided in 03.', 'Yes', 'Recalculated.'],
    ['F11', '4.Final-AM Risk Assessment', 'B, D, F, H (counts); C/E/G weights; M thresholds', 'Counts hardcoded; Moderate weighted 0.5 (Config uses 0.75); thresholds 0.91 / 0.61 differ from matrix (0.90 / 0.75).', 'Regional risk conclusion depends on an undocumented, inconsistent methodology.', 'Counts linked by COUNTIF to 3.Final-DetailsControlCountries. Weights/thresholds left as authored (management choice) and flagged; harmonised model in 05 / 08.', 'Partly', 'Counts recalculated; methodology difference documented.'],
    ['F12', '5.Compliance 2026', 'J2:J33', 'Thresholds ≥91% / 61–90% / ≤60% leave gaps (e.g. 90.5% or 60.5% → "N/A").', 'Countries could be shown as N/A instead of a level.', '=IF(K2="","N/A",IF(K2>=0.91,"UNDER CONTROL",IF(K2>=0.61,"MODERATE CONTROL","INSUFFICIENT CONTROL")))', 'Yes', 'Recalculated.'],
    ['F13', '5.Compliance 2026 (source of presentation slide 13)', 'K2:K33', 'Compliance % typed as constants. Cross-check with the 2026 presentation showed they follow the workbook score method (weights 1 / 0.75 / 0 over applicable answers) for 26 of 32 countries, but 6 values are stale (Bermuda 81% vs 87.2%, Barbados 85% vs 89.9%, Cayman Islands 97% vs 94.0%, Venezuela, Peru, Panama).', 'Slide 13 and column J classification based on outdated values.', "K = INDEX('13 – Calc Engine' score, MATCH(country)) – linked to the corrected score.", 'Yes', 'Recalculated; see 14 – PPT Reconciliation table E.'],
    ['F22', '2. SelfAssessmentPerQuestions (TableQuestions) and its copy "2. SelfAssessmentPerQuestio (2)" – source of "2.Final-byScope" and presentation slide 4', 'N6:Q66, N67:Q67, S6:V67',
     'Counts per question typed by hand (copied from a pivot of the defective table, e.g. Q1 = 22 Under / 9 N/A instead of 31 Under / 1 Moderate); total row 67 typed by hand; % columns S:V divided every row by the total of row 6 ($N$6:$Q$6) – total row showed 112.5% / 3,537%.',
     'Slide 4 and the by-scope pivots showed 9 countries as N/A and wrong percentages.',
     'N:Q = COUNTIFS(Data-All Assessments 2026 Q#, level); row 67 = SUM; S:V = count / SUM($N r:$Q r) of the same row.', 'Yes',
     'Recalculated; per-question counts equal 13 – Calc Engine question block. Pivots in 2.Final-byScope refresh when opened in Excel.'],
    ['F14', 'Workbook defined names', '_FilterDatabase (sheet "Details")', 'Name refers to #REF!.', 'Broken reference.', 'Removed.', 'Yes', '—'],
    ['F15', 'Legacy PivotTables (20)', 'All pivot caches', 'Caches not refreshed after source corrections.', 'Pivots would display stale values.', 'refreshOnLoad set on all 11 caches (Excel refreshes when the file is opened).', 'Yes', 'Pivots refresh in Excel; not refreshable in the validation engine (see limitations).'],
    ['F16', '1. Data-All Assessments 2026', 'J1957', 'Unexplained arithmetic "=49/64".', 'Hardcoded figure of unknown meaning.', 'Left unchanged, documented.', 'No – flagged', '—'],
    ['F17', 'Several legacy reports (3.Final-*, Self Assessment Results)', 'Percent columns', 'Percentages calculated over all countries/controls including N/A.', 'Understates control levels of countries with many N/A answers.', 'New analysis uses applicable answers as denominator and reports N/A separately.', 'Yes (new sheets)', 'Check #7.'],
    ['F18', 'Country sheets – evidence summary block (rows 63+): Costa Rica, El Salvador, Paraguay (+ all 32 hardened)', 'Costa Rica F67, El Salvador F67, Paraguay F67; "Yes" counters in all 32 sheets',
     'Counter looked for only one label ("Si" or "Yes") while the country uses the other one.', 'Uploaded evidence reported as 0: Costa Rica (real 30), El Salvador (real 47), Paraguay (real 13).',
     '=COUNTIF(rng,"Yes")+COUNTIF(rng,"Si")+COUNTIF(rng,"Sí") applied to every "Yes" counter of the SharePoint and TEST blocks.', 'Yes', 'Recalculated; counts equal the evidence column.'],
    ['F19', 'El Salvador / Uruguay / Trinidad / USA – summary blocks', 'El Salvador F67:F69; Uruguay, Trinidad G74:G76; USA G70:G79', 'Ranges started at the header row ($F$1) or ran to row 63 instead of $2:$62.', 'Inconsistent ranges; risk of counting non-answer cells.', 'Ranges standardized to rows 2–62.', 'Yes', 'Recalculated.'],
    ['F20', 'USA – TEST block and "Total - N/a"', 'G73; G77:G79 (H77)', 'TEST counters pointed to the SharePoint column G instead of the test column E (H77 showed 461.5%); G73 used =61-COUNTIF(G3:G70,"N/A") (range includes the summary cells).', 'Wrong TEST result (>100%) and fragile total.', 'G77:G79 count column E; G73 = 61-G72.', 'Yes', 'H77 now ≤ 100%.'],
    ['F21', 'Haiti / Guatemala – "Ponderacion"', 'Haiti G71; Guatemala G68', 'Value 1 typed by hand while the other 30 countries use the formula =IF(Yes%=No%,2,IF(Yes%>No%,3,1)) (formula would give 3).', 'Possibly a deliberate manual rating – intent unknown.', 'Not changed (could be an intentional reviewer judgement); flagged for the RCCH to confirm.', 'No – flagged', '—'],
]

DQ = [
    ['D01', 'Country names', 'Inconsistent names across legacy sheets: "Cayman Island", "French Guyana", "Panamá", "Rep Dominicana", "Salvador", "Virgin Islands (British)", "Trinidad" vs "Trinidad and Tobago".', 'Canonical country register in 08 (section E) with legacy name mapping.'],
    ['D02', 'Colombia, Costa Rica forms', 'Header row has one more column than the data: the header "Control Level" sits over the gap-comment column; Control Level data are in column G.', 'Column layout detected from the data, not the header (08 section E). Headers left as submitted.'],
    ['D03', 'Country form layouts', 'Two layouts: 9 columns (Venezuela, Uruguay, Trinidad, USA, Argentina, Bolivia – Control Level in H) and 8 columns (others – Control Level in G).', 'Handled by the country register.'],
    ['D04', 'Evidence column', 'Values: Yes 764, N/A 675, Si 334, No 117, blank 30, YES 22, si 4, SI 3, NO 3.', 'Standardized mapping (08 section C).'],
    ['D05', 'Nicaragua Action Plan', 'Header has "Issue Category" but data are shifted one column left (status values sit under "by When").', 'Column mapping corrected in 06 (no data changed).'],
    ['D06', 'Ecuador / Brazil / Chile / Panama action plans', 'Merged cells across several rows per action (sub-steps).', 'One consolidated row per action; sub-step texts concatenated with " | ".'],
    ['D07', 'Action plan dates', 'Only 50 of 147 due dates are real dates; others are text in 25+ formats (30.09.2026, 03.30.2027, 31/08/2026, 15-9-2026, "Todo el Año", "TBD", "Ongoing"), incl. an invalid date "31/09/2026" and ambiguous dates (04.09.2026).', 'Interpreted with an explicit, flagged rule (06 columns N–O); nothing overwritten in the source.'],
    ['D08', 'Action plan statuses', 'Blank status cells exist only on merged sub-step rows (Ecuador, Brazil, Chile, Panama); once consolidated every action has a status. Nicaragua statuses sit in the "by When" column. 10 actions NOT STARTED (Barbados 6, Bahamas 3, Canada 1), 15 IN PROGRESS.', 'Standardized status; a missing status would be treated as open and flagged.'],
    ['D09', 'Action plan ↔ assessment', '1 action has no question number (Dominican Republic, "4.2 Manifest"); 13 actions carry a section label without a number (e.g. "Personnel Trianing", "Training") and 1 genuine conflict (2 actions): Canada Q50 labelled "4.13 Reconciliation" although Q50 belongs to 4.11 Unauthorized Release.', 'Section check column in 06; actions linked to the assessment via Country|Q# key.'],
    ['D10', '3.Final-SAPerControl / Draft Regional Action Plan', 'Control numbers 4.10 and 2.10 stored as numbers (shown as 4.1 / 2.1 → duplicates of other controls).', 'New sheets use text labels from the matrix control list.'],
    ['D11', 'Draft Regional Action Plan', 'Column D action texts are not aligned with the control IDs (e.g. "URL incidence" against 2.3; "export clearance" against 3.3).', 'Not used; "Regional Actions Draft" (aligned) used instead.'],
    ['D12', '5.Policy Tracker 2026', 'Lists 18 further countries (agents, Guyana, St. Maarten) without an assessment worksheet.', 'Listed separately in 02 – not ranked (no data).'],
    ['D13', 'Assessments bkp', 'Undated static snapshot of a previous cycle (2023 evidence references).', 'Used only for an indicative trend; labelled as such.'],
    ['D14', 'Questions / duplicates', 'All 32 forms contain questions 1–61 exactly once; no duplicate country; no missing Control Level.', 'Live checks in section 4.'],
]

IMPROVEMENTS = [
    '01 – Executive Dashboard: first sheet; live executive summary, 10 KPI tiles, ranked country table with colour coding, top-5 risk lists, policy-scope summary and 4 charts.',
    '02 – Country Ranking: all requested metrics per country, five-tier classification, sensitivity score, gaps without action plan, evidence coverage, open/overdue actions, indicative trend; sorted automatically.',
    '03 – Policy Section Analysis: 8 scopes and 36 Policy Sections ranked strongest → weakest with weakest countries per section and existing regional draft actions; top 15 systemic question-level weaknesses.',
    '04 – Country Details: select any country; KPIs, analytical recommendations (clearly labelled), list of Moderate/Insufficient questions with original answers/comments, the country\'s actions, and the full 61-question view.',
    '05 – Regional Risk Assessment: risk register ordered by support priority, top-5 lists per indicator, section × country heat map.',
    '06 – Regional Action Plan: 147 actions consolidated by live links (+5 spare slots per country), standardized status, interpreted due dates, overdue days, priority, link to assessment, data-quality flags.',
    '07 – Source Data: one auditable 1,952-row table linked live to the country forms, with standardized level, applicability, score, evidence status, consistency flags, action-plan linkage and prior-cycle value.',
    '08 – Config & Methodology: all parameters, mappings, country register and question master in one place; documented methodology.',
    '13 – Calc Engine: all aggregations as transparent formulas (no hardcoded results).',
    'Legacy sheets: formula defects corrected (F01–F15), PivotTables set to refresh on open, data validation added to Control Level (country forms) and Status (action plans), tabs colour-coded, workbook reordered (new sheets first, legacy/archived last).',
    '12 empty placeholder worksheets removed after confirming they held no data and were not referenced.',
]

LIMITATIONS = [
    'Legacy PivotTables cannot be refreshed by the validation engine used here (LibreOffice); they are set to refresh automatically when the workbook is opened in Microsoft Excel. Until refreshed, their displayed values are those cached in the original file.',
    'Scoring weights and classification thresholds are an analytical model proposed for management validation; they are not official DHL compliance scoring rules.',
    'Text due dates were interpreted with a documented rule; ambiguous dates (both parts ≤ 12) are read as DD.MM.YYYY and flagged – owners should confirm them in the country Action Plans.',
    'Trend analysis relies on the undated "Assessments bkp" snapshot and is indicative only.',
    'The hardcoded figure in "1. Data-All Assessments 2026"!J1957 could not be traced to a source and was left unchanged.',
    'Evidence quality was assessed from the "Evidence Uploaded" flag only; the documents on SharePoint were not reviewed.',
    'Haiti (G71) and Guatemala (G68) carry a hand-typed "Ponderacion" of 1 instead of the formula used by the other 30 countries; left unchanged because it may be an intentional reviewer rating.',
    'Five PivotTable item labels still show "#N/A" from the stale caches of the original file; they disappear when Excel refreshes the PivotTables on opening.',
    'Legacy presentation sheets (scope sheets, Countries, Matrix 1/2, Summary) contain static prior-cycle values; they were archived, not rebuilt.',
]

CHANGES = [
    ('(file)', 'Single draft workbook.', 'Original must not be overwritten.', 'Original copied unchanged to "…DRAFT - BACKUP ORIGINAL.xlsx"; deliverable saved as a new file.', 'Original preserved.'),
    ('01 – Executive Dashboard … 13 – Calc Engine', 'No reliable regional overview.', 'Answers to the management questions not visible.', '13 new worksheets added (dashboard, ranking, policy sections, country details, risk, action plan, source data, methodology, archive index, audit report, change log, key findings, calc engine).', 'Formula-driven management tool; reconciles to country sheets.'),
    ('1. Data-All Assessments 2026', 'Column J translated only Spanish labels.', '549 answers of 9 countries shown as N/A.', 'Formula rewritten to accept English and Spanish labels; blank → MISSING; other → INVALID.', 'Correct levels for all 32 countries.'),
    ('1. Data-All Assessments 2026', 'Canada lookups range $A$2:$G$60.', '#N/A for Q60–61 (6 cells).', 'Range extended to $G$62.', 'Errors removed.'),
    ('1. Data-All Assessments TOP20', 'Same as above (duplicate table).', 'Same defects.', 'Same corrections.', 'Consistent with corrected table.'),
    ('1. Data-Control Country Matrix', 'Canada range to row 60; Venezuela approximate match; El Salvador range from row 1.', 'Missing / fragile lookups.', 'Ranges and match type standardized (exact match, $A$2:$x$62).', 'All 32 countries evaluated on 61 questions.'),
    ('1. Data-Control Country Matrix', '1,152 control cells: 3 formula variants + hardcoded "N/A" texts.', 'Static values and inconsistent thresholds.', 'Single N/A-aware formula (0.90 / 0.75 thresholds) in every control cell.', 'See list of changed control results below.'),
    ('Self Assessment Results', 'Constants 61/36; hardcoded control counts in two blocks.', 'Stale figures feeding pivot cache 4 and charts.', 'Replaced with formulas linked to the corrected matrix.', 'Dynamic.'),
    ('3.Final-SAPerControl', 'Hardcoded counts; /32.', 'Stale; not reproducible.', 'COUNTIF formulas on 3.Final-DetailsControlCountries; /COUNTA(countries).', 'Dynamic.'),
    ('4.Final-AM Risk Assessment', 'Hardcoded counts.', 'Stale.', 'COUNTIF formulas; methodology difference flagged.', 'Dynamic counts.'),
    ('5.Compliance 2026', 'Threshold formula with gaps.', 'Values between bands returned N/A.', 'Contiguous thresholds.', 'Every value classified.'),
    ('Workbook names', '_FilterDatabase on "Details" = #REF!.', 'Broken name.', 'Removed.', 'No broken names.'),
    ('PivotTables (11 caches)', 'Caches stale.', 'Pivots show old values.', 'refreshOnLoad = 1.', 'Pivots refresh when opened in Excel.'),
    ('32 country assessment sheets', 'No data validation on Control Level.', 'Free text allowed (risk of invalid labels).', 'List validation (warning style) added: UNDER CONTROL, MODERATE CONTROL, INSUFFICIENT CONTROL, N/A.', 'Standardized input; existing answers untouched.'),
    ('32 Action Plan sheets', 'No validation on Status.', 'Inconsistent statuses.', 'List validation (warning style) added: NOT STARTED, IN PROGRESS, COMPLETED, ON HOLD, CANCELLED.', 'Standardized input; existing entries untouched.'),
    ('12 empty sheets', 'Sheet2, Sheet3, Sheet4, Sheet5, Sheet6, Sheet7, Sheet10, Sheet33, SelfAssessment, SelfAssessment 2026, Countries 2026, Final-ByScope.', 'Empty, unreferenced clutter.', 'Removed after dependency check.', '117 original sheets retained.'),
    ('Sheet order & tabs', 'Analysis, backups, drafts and country forms interleaved; 129 tabs.', 'Hard to navigate.', 'New sheets first, then country forms & action plans, configuration, documentation; legacy/backup sheets at the end with grey tabs; navigation links on every new sheet.', 'Clear structure.'),
    ('32 country assessment sheets – summary blocks', 'Evidence counters searched one label only; some ranges from header row or to row 63; USA TEST block pointed to the wrong column.', 'Costa Rica, El Salvador and Paraguay showed 0 uploaded evidence; USA TEST showed 461.5%.', '46 counter formulas standardized (Yes+Si+Sí, rows 2–62, USA TEST → column E, USA total → 61-G72). Original answers untouched.', 'Summary blocks consistent with the answers.'),
    ('5.Compliance 2026', 'Column K compliance % typed by hand (source of presentation slide 13).', '6 of 32 values stale vs. the answers.', 'K linked to the corrected country score (13 – Calc Engine).', 'Slide 13 can be refreshed from live values.'),
    ('14 – PPT Reconciliation (new)', 'No check between the workbook and the 2026 presentation.', 'Presentation built on the uncorrected workbook (slides 4, 5-8, 11-13, 15) and on outdated key-country lists.', 'New sheet: slide-by-slide findings + live comparison tables (slides 4, 5, 9, 11, 13, 15, 26-37).', 'Every slide figure can be updated from the corrected workbook.'),
    ('2. SelfAssessmentPerQuestions + copy (TableQuestions)', 'Per-question counts N:Q and total row typed by hand; % columns divided by row 6.', 'Stale counts (9 countries as N/A) feeding 2.Final-byScope and slide 4.', 'Counts linked by COUNTIFS to the corrected table; totals by SUM; % per own row.', 'Values consistent with the country sheets.'),
    ('Workbook calculation', 'calcChain present; manual expectation of recalculation.', 'Cached values could be stale after edits.', 'calcChain removed (Excel rebuilds it); full recalculation on load enabled.', 'Values recalculated on open.'),
]


# =============================================================================== 14 PPT reconciliation
PPT = 'Country Customs Self-Assessment Program - 2026 UPDATED (PDF, 40 slides)'
SL5 = {  # slide 5 – control level per country (IC, MC, UC, N/A %) as shown on the slide
    'Bahamas': (14, 3, 69, 14), 'Barbados': (14, 3, 69, 14), 'Bermuda': (14, 6, 53, 28), 'Cayman Islands': (8, 0, 69, 22), 'Canada': (6, 6, 75, 14),
    'Curacao': (6, 3, 75, 17), 'Haiti': (6, 11, 64, 19), 'Jamaica': (6, 3, 75, 17), 'Trinidad and Tobago': (6, 3, 67, 25), 'British Virgin Islands': (6, 3, 50, 42),
    'Guatemala': (3, 14, 64, 19), 'Mexico': (3, 3, 92, 3), 'Nicaragua': (3, 17, 64, 17), 'Panama': (3, 17, 75, 6), 'Paraguay': (3, 11, 64, 22), 'Uruguay': (3, 3, 67, 28),
    'Argentina': (0, 6, 81, 14), 'Bolivia': (0, 6, 81, 14), 'Brazil': (0, 6, 89, 6), 'Chile': (0, 11, 81, 8), 'Colombia': (0, 11, 83, 6), 'Costa Rica': (0, 3, 72, 25),
    'Ecuador': (0, 6, 75, 19), 'French Guiana': (0, 6, 69, 25), 'Guadeloupe': (0, 6, 75, 19), 'Honduras': (0, 3, 75, 22), 'Martinique': (0, 6, 78, 17), 'Peru': (0, 8, 83, 8),
    'Dominican Republic': (0, 11, 81, 8), 'El Salvador': (0, 8, 75, 17), 'USA': (0, 8, 92, 0), 'Venezuela': (0, 8, 75, 17)}
SL13 = {'Bermuda': .81, 'Barbados': .85, 'Bahamas': .88, 'Canada': .94, 'Haiti': .94, 'Paraguay': .94, 'Nicaragua': .94, 'Guatemala': .95, 'Panama': .95,
        'Curacao': .96, 'Mexico': .96, 'Jamaica': .96, 'British Virgin Islands': .96, 'Trinidad and Tobago': .96, 'Uruguay': .96, 'Chile': .97, 'Ecuador': .97,
        'Cayman Islands': .97, 'El Salvador': .98, 'Dominican Republic': .98, 'USA': .98, 'Venezuela': .98, 'Colombia': .98, 'Argentina': .99, 'Peru': .99,
        'Guadeloupe': .99, 'Costa Rica': .99, 'Bolivia': .99, 'Brazil': .99, 'Martinique': .99, 'French Guiana': .99, 'Honduras': .99}
SL4 = [('Annex 1', 'Annex 1', (13, 31, 28, 28)), ('7. Escalations', '7. Escalations', (3, 0, 66, 28)),
       ('2. Customs Awareness & Risk Management', '2. Customs Awareness & Risk Management', (3, 2, 60, 36)),
       ('1. About the DHL Express Global Customs Compliance Policy', '1. About the DHL Express Global Customs Compliance Policy', (2, 3, 67, 28)),
       ('4. Customs Process Controls', '4. Customs Process Controls', (1, 4, 59, 36)), ('3. Regulatory Supervision', '3. Regulatory Supervision', (1, 2, 58, 39)),
       ('4. Customs Process Controls (Import Clearence)', '4. Customs Process Controls', (1, 2, 63, 34)),
       ('6. Reporting & Investigation of Material Violations', '6. Reporting & Investigation of Material Violations', (0, 6, 50, 41)),
       ('5. Customs Representation', '5. Customs Representation', (0, 3, 20, 77))]
SL15 = [('CAR', 'Caribean', (6, 5, 69)), ('CSA', 'CSA', (1, 9, 74)), ('Canada', 'CA', (6, 6, 75)), ('Brazil', 'Brazil', (0, 6, 89)), ('Mexico', 'Mexico', (3, 3, 92)), ('USA', 'USA', (0, 8, 92))]
SL9 = [('Insufficient', 'Bahamas', 6), ('Insufficient', 'Barbados', 5), ('Insufficient', 'Bermuda', 3), ('Insufficient', 'Cayman Islands', 3),
       ('Moderate', 'Nicaragua', 6), ('Moderate', 'Panama', 4), ('Moderate', 'Guatemala', 4)]
# key-country boxes: (slide, topic, controls, red list on slide, yellow list on slide, status note)
KEYS = [
    (26, 'Annex 1 – Documentation of Local Procedures', ['Annex 1 Documentation of Local Procedures'], 'Caribbean countries, Guatemala, Nicaragua', 'Peru, Paraguay, Panama, Mexico, Canada',
     'Partly wrong: Guatemala, Peru, Paraguay, Mexico and Canada are UNDER CONTROL in 2026; Nicaragua is Moderate (not Insufficient). Missing: Chile, Colombia, Dominican Republic (Moderate).'),
    (27, '2.5 Personnel Training', ['2.5 Personnel Training'], 'Cayman Islands, Haiti, Paraguay, Trinidad, Virgin Islands (British)', 'Barbados, Bermuda, Curacao, Ecuador, Honduras',
     'Partly wrong: Paraguay, Ecuador and Honduras are UNDER CONTROL; Barbados, Bermuda and Curacao are Insufficient (not Moderate). Missing: Jamaica, Bahamas (Insufficient); Venezuela, Argentina, Bolivia, Chile, Costa Rica, Brazil (Moderate).'),
    (28, '1.6 / 1.7 Definitions & Independence', ['1.6 Definitions', '1.7 Independence'], 'Bahamas, Jamaica, Cayman Islands, Martinique, Virgin Islands', 'Curacao, Guadeloupe, Haiti, Trinidad & Tobago, Uruguay',
     'Mostly wrong: in 2026 only Cayman Islands (Insufficient, 1.7) and Guatemala (Moderate, 1.6 and 1.7) have gaps. Lists appear to come from an earlier cycle.'),
    (29, '3.5 Third Party Brokers Controls', ['3.5 Third Party Brokers Controls'], 'Haiti', 'Brazil, Ecuador, Mexico, Trinidad & Tobago',
     'Partly wrong: Trinidad and Tobago is Insufficient (not Moderate); Brazil and Ecuador are UNDER CONTROL / N/A. Haiti and Mexico confirmed.'),
    (30, '3.2 Customs Bonded Facility', ['3.2 Customs Bonded Facility'], 'Guatemala', 'Bermuda, Ecuador, Haiti',
     'Wrong: Bermuda is the only Insufficient; Guatemala and Colombia are Moderate; Ecuador and Haiti are UNDER CONTROL.'),
    (31, '4.8 Post Clearance Modifications (PCM)', ['4.8 Post Clearance Modifications (PCM)'], 'Curacao', 'Bahamas, Brazil, Costa Rica, Haiti, Salvador',
     'Wrong: only Ecuador has a gap (Moderate) in 2026; no Insufficient answers.'),
    (32, '4.11 Unauthorized Release (URL)', ['4.11 Unauthorized Release (URL)'], 'Bermuda, Nicaragua', 'Chile, Colombia, Costa Rica, Paraguay',
     'Partly wrong: Guatemala is the only Insufficient; Bermuda and Costa Rica have no gap; Nicaragua is Moderate. Missing: El Salvador, Peru, Canada, Brazil (Moderate).'),
    (33, '2.1 Customs Compliance Culture', ['2.1 Customs Compliance Culture'], '-', 'Bolivia, Costa Rica, Panama',
     'Wrong: Barbados is Insufficient; Bolivia, Costa Rica and Panama are UNDER CONTROL.'),
    (37, '4.14 Regular Customs Declaration Quality Reviews', ['4.14 Regular Customs Declaration Quality Reviews'], 'Virgin Islands (British)', 'Guatemala, Mexico, Trinidad & Tobago',
     'Incomplete: Mexico, Jamaica and Bahamas are also Insufficient; Trinidad has no gap. Missing Moderate: USA, Chile, El Salvador, Paraguay, Haiti.'),
]
ISSUES = [
    (4, 'Overview per Section/Scope', 'Values reproduce the defective legacy table "1. Data-All Assessments 2026" in which 9 countries were all N/A (Spanish-label defect F01): e.g. 28% N/A in Annex 1, 1. About and 7. Escalations = 9/32 countries. The bar "4. Customs Process Controls (Import Clearence)" duplicates part of scope 4.', 'Replace with corrected figures (table B below / 03 – Policy Section Analysis).'),
    (5, 'Control per Country', 'Identical to the ORIGINAL "1. Data-Control Country Matrix" (all 32 countries match). 179 control cells there were hardcoded N/A; after correction 17 countries change (table A).', 'Replace with corrected figures.'),
    ('6-8', 'Detailed Results per Country: Control', 'Same source as slide 5 (original matrix). 45 control results shown as N/A are now answered (mostly UNDER CONTROL) – see 11 – Change Log, appendix.', 'Refresh the three tables from the corrected matrix.'),
    (9, 'Key Countries', 'Mixes bases: Insufficient counts are question-level (Bahamas 6, Barbados 5, Cayman 3 confirmed) but Bermuda has 6 (slide: 3). Moderate counts are control-level for Nicaragua (6) but Panama = 6 and Guatemala = 5 (slide: 4 / 4). Paraguay (9 Moderate questions) is missing.', 'Use one basis (questions recommended) – table D.'),
    (10, 'Overview Results per Control', 'Built on a legacy pivot with an old control grouping ("Policy Implementation", "F&P and Voluntary Disclosures", "Risk Management - Self-Assessment"). Contradicts slide 11: e.g. Personnel Training shown 91% UNDER CONTROL / 0% Insufficient while 9 countries are Insufficient.', 'Rebuild from 03 – Policy Section Analysis (36 sections).'),
    (11, 'Risk Assessment by Control (Data)', 'Identical to the hardcoded counts of "4.Final-AM Risk Assessment" (stale). After correction 25 of 36 rows change (counts); 4.12, 5.2 and 2.9 move from MODERATE to UNDER CONTROL and 4.3 moves to MODERATE (same 0.91/0.61 thresholds). Moderate weighted 0.5 (Config uses 0.75).', 'Replace with corrected table C.'),
    (12, 'Risk Assessment by Control (chart)', 'Chart of slide 11 – same stale values.', 'Refresh with slide 11.'),
    (13, 'Self-Assessment Compliance', 'Values are the hand-typed column K of "5.Compliance 2026". The method matches the workbook score (weighted 1 / 0.75 / 0 over applicable answers) for 26 of 32 countries; 6 are stale: Bermuda 81% (actual 87.2%), Barbados 85% (89.9%), Cayman Islands 97% (94.0%), Venezuela 98% (97.3%), Peru 99% (98.0%), Panama 95% (94.2%). Bermuda and Barbados are therefore not as far behind Bahamas as shown, and Cayman Islands is lower.', 'Column K now linked to the corrected score; update chart (table E).'),
    (15, 'Self-Assessment per Cluster', 'Identical to the original matrix. Corrected: CAR Under Control 75% (slide 69%), Canada 83% (slide 75%); N/A share is not shown on the slide.', 'Replace with corrected table F.'),
    (17, 'About the DHL Express Global Customs Compliance Policy', 'Mislabelled: the table shows each country\'s OVERALL distribution (same numbers as slide 5), not scope 1. In scope 1 (1.6 / 1.7) only Cayman Islands (Insufficient) and Guatemala (Moderate) have gaps.', 'Correct title or content.'),
    (18, 'Customs Awareness & Risk Management', 'Mostly from the original matrix but incomplete and with errors: Bahamas shown 22% Insufficient (data 11%); BVI shown Moderate (data Insufficient); Ecuador listed without gaps; 10 countries with gaps omitted (Bolivia, Chile, Peru, Martinique, Jamaica, Guadeloupe, French Guiana, Canada, Brazil, Curacao).', 'Rebuild from 05 heat map / 03.'),
    (19, 'Regulatory Supervision', 'Lists countries without gaps (Cayman, Curacao, French Guyana, Guadeloupe, Costa Rica) and omits countries with gaps: Trinidad and Tobago (Insufficient, 3.5), Venezuela, Panama, Mexico, Honduras, Dominican Republic (Moderate). Chart legend shows "Series1-4".', 'Rebuild.'),
    (20, 'Customs Process Controls', 'Omits countries with Insufficient answers in scope 4 (Mexico, Jamaica, Barbados) and 9 countries with Moderate answers; lists Honduras, Uruguay and Trinidad which have no gap there. Bahamas shown 14% Insufficient (data 21%).', 'Rebuild.'),
    (21, 'Customs Representation', 'Curacao and Honduras have no gap in 5.1 / 5.2; USA (5.1) and Dominican Republic (5.2) are the Moderate ones, with Nicaragua.', 'Correct.'),
    (22, 'Reporting & Investigation of Material Violations', 'Contains a pivot "Grand Total" row; omits Uruguay and Paraguay (Moderate on Q60). N/A list differs from data (El Salvador, Jamaica, Bahamas, Barbados, BVI declare N/A).', 'Correct.'),
    (23, 'Escalations', 'Bahamas Insufficient – confirmed.', 'None.'),
    (24, 'Annex 1', 'Does not match 2026 answers: data shows Insufficient = Barbados, Bermuda, Cayman Islands, Curacao and Moderate = 13 countries (see table D). Only Chile, Jamaica, Dominican Republic and Cayman Islands coincide with the slide.', 'Rebuild from 03 (section Annex 1).'),
    ('26-37', 'Areas of opportunity – Key Countries boxes', 'Country lists do not match the 2026 answers nor the prior snapshot – see table D for each topic.', 'Update the boxes (live lists in table D).'),
    (39, 'Regional Action Plan 2026', '"4.11 Post Clearence Modification" is mislabelled (4.11 = Unauthorized Release; PCM = 4.8). The 4.11 regional actions in "Regional Actions Draft" are not shown. "Countries with more opportunities" (Nicaragua, BVI, Haiti, El Salvador, Cayman) does not match the data: lowest scores are Bermuda, Bahamas, Barbados, then Nicaragua and Paraguay; El Salvador is Strong (98%).', 'Correct label, add URL actions, update country list from 02 – Country Ranking.'),
    (2, 'Program Scope (32 countries, 61 questions, 36 controls, 7 scopes)', 'Confirmed by the workbook (Annex 1 is grouped with scope 1 on the slide).', 'None.'),
]


def build_ppt_sheet(WS, LAY, g):
    ws = WS[PR]
    CE_ = g['CE']; R_ = g['R']; CER = g['CER']; CEC = LAY['CEC']
    title(ws, 'Reconciliation with the 2026 presentation  |  ' + PPT,
          'Blue figures = values typed from the presentation (static). "Workbook (corrected)" columns are LIVE formulas. Status columns compare both at the report date.')
    nav(ws)
    widths(ws, {'A': 10, 'B': 34, 'C': 70, 'D': 44, 'E': 12, 'F': 12, 'G': 12, 'H': 12, 'I': 12, 'J': 12, 'K': 12, 'L': 12, 'M': 22})
    r = 5
    put(ws, f'A{r}', 'Summary – slide-by-slide assessment', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['Slide', 'Topic', 'Finding (presentation vs. corrected workbook)', 'Action for the presentation']); r += 1
    for s, t, f_, a in sorted(ISSUES, key=lambda x: int(str(x[0]).split('-')[0])):
        for j, v in enumerate([str(s), t, f_, a]):
            c = ws.cell(r, j + 1, v); cell_style(c, wrap=True, size=9, bold=j == 1)
        ws.row_dimensions[r].height = max(30, 13 * (len(f_) // 85 + 1)); r += 1
    BLUE_ = '0000FF'
    # ---------------- table A: slide 5
    r += 2
    put(ws, f'A{r}', 'A. Slide 5 – control level per country (% of 36 controls, N/A included as on the slide)', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['', 'Country', 'Slide IC / MC / UC / N/A', '', 'Corr. IC', 'Corr. MC', 'Corr. UC', 'Corr. N/A', 'Δ UC (pp)', 'Status'], height=30); r += 1
    MX = "'1. Data-Control Country Matrix'"
    reg = {c['name']: c for c in CFG['reg']}
    r0 = r
    for n, v in SL5.items():
        col = reg[n]['matrix_col']; rg = f'{MX}!${col}$2:${col}$62'
        ws.cell(r, 2, n); c = ws.cell(r, 3, ' / '.join(f'{x}%' for x in v)); c.font = font(color=BLUE_, size=9)
        ws.cell(r, 4, v[2] / 100).number_format = PCT
        for j, lv in enumerate(['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A']):
            cc = ws.cell(r, 5 + j, f'=COUNTIF({rg},"{lv}")/COUNTA({rg})'); cc.number_format = '0%'
        ws.cell(r, 9, f'=ROUND((G{r}-D{r})*100,0)').number_format = '+0;-0;0'
        ws.cell(r, 10, f'=IF(ROUND(G{r}*100,0)=D{r}*100,"Matches","Update slide")')
        for j in range(2, 11): cell_style(ws.cell(r, j), size=9, fmt=ws.cell(r, j).number_format)
        ws.cell(r, 3).font = font(color=BLUE_, size=9); ws.cell(r, 4).font = font(color=BLUE_, size=9)
        r += 1
    ws.cell(r0 - 1, 4, 'Slide UC')
    _status_cf(ws, f'J{r0}:J{r-1}')
    # ---------------- table B: slide 4
    r += 2
    put(ws, f'A{r}', 'B. Slide 4 – per Scope (% of all answers incl. N/A, as on the slide)', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['', 'Scope (slide label)', 'Slide IC / MC / UC / N/A', 'Slide N/A', 'Corr. IC', 'Corr. MC', 'Corr. UC', 'Corr. N/A', 'Δ N/A (pp)', 'Status'], height=30); r += 1
    S0, S1 = LAY['S0'], LAY['S1']
    sc = lambda col: f"{q(CE_)}!${col}${S0}:${col}${S1}"
    r0 = r
    for lab, key, v in SL4:
        ws.cell(r, 2, lab); ws.cell(r, 3, ' / '.join(f'{x}%' for x in v)); ws.cell(r, 4, v[3] / 100)
        tot = f'(INDEX({sc("C")},MATCH("{key}",{sc("A")},0))+INDEX({sc("D")},MATCH("{key}",{sc("A")},0))+INDEX({sc("E")},MATCH("{key}",{sc("A")},0))+INDEX({sc("F")},MATCH("{key}",{sc("A")},0)))'
        for j, col in enumerate(['E', 'D', 'C', 'F']):
            ws.cell(r, 5 + j, f'=INDEX({sc(col)},MATCH("{key}",{sc("A")},0))/{tot}')
        ws.cell(r, 9, f'=ROUND((H{r}-D{r})*100,0)')
        ws.cell(r, 10, f'=IF(ABS(I{r})<=1,"Matches","Update slide")')
        for j in range(2, 11):
            cell_style(ws.cell(r, j), size=9, fmt='0%' if j in (4, 5, 6, 7, 8) else ('+0;-0;0' if j == 9 else None))
        ws.cell(r, 3).font = font(color=BLUE_, size=9); ws.cell(r, 4).font = font(color=BLUE_, size=9)
        r += 1
    _status_cf(ws, f'J{r0}:J{r-1}')
    # ---------------- table C: slide 11
    r += 2
    put(ws, f'A{r}', 'C. Slides 11-12 – Risk Assessment by Control (count of countries; source "4.Final-AM Risk Assessment")', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['', 'Control', 'Slide UC / MC / IC / N/A', 'Slide %', 'Corr. UC', 'Corr. MC', 'Corr. IC', 'Corr. N/A', 'Corr. %', 'Status', 'Slide result', 'Corrected result'], height=30); r += 1
    am = json.load(open(os.path.join(HERE, 'ppt_am.json')))
    r0 = r
    for row in am:
        rr_ = row['row']
        ws.cell(r, 2, row['label']); ws.cell(r, 3, ' / '.join(str(x) for x in row['vals'])); ws.cell(r, 4, row['pct'])
        AM = "'4.Final-AM Risk Assessment'"
        for j, col in enumerate('BDFH'):
            ws.cell(r, 5 + j, f'={AM}!{col}{rr_}')
        ws.cell(r, 9, f'={AM}!L{rr_}'); ws.cell(r, 11, row['res']); ws.cell(r, 12, f'={AM}!M{rr_}')
        ws.cell(r, 10, f'=IF(AND(E{r}&" / "&F{r}&" / "&G{r}&" / "&H{r}=C{r},L{r}=K{r}),"Matches",IF(L{r}<>K{r},"Result changes","Counts change"))')
        for j in range(2, 13):
            cell_style(ws.cell(r, j), size=9, fmt='0%' if j in (4, 9) else None)
        for j in (3, 4, 11): ws.cell(r, j).font = font(color=BLUE_, size=9)
        r += 1
    _status_cf(ws, f'J{r0}:J{r-1}')
    # ---------------- table D: key countries
    r += 2
    put(ws, f'A{r}', 'D. Key-country lists (slides 9, 26-37) vs. 2026 answers (question level; live lists from 13 – Calc Engine)', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['Slide', 'Topic', 'Slide – red (Insufficient) / yellow (Moderate)', 'Workbook – Insufficient (live)', 'Workbook – Moderate (live)', '', '', '', '', 'Status'], height=30); r += 1
    X0, X1 = LAY['X0'], LAY['X1']
    cx = lambda col: f"{q(CE_)}!${col}${X0}:${col}${X1}"
    for sl, topic, labs, red, yel, note in KEYS:
        ws.cell(r, 1, str(sl)); ws.cell(r, 2, topic); ws.cell(r, 3, f'Red: {red}\nYellow: {yel}')
        def _j(col):
            parts = [f'INDEX({cx(col)},MATCH("{l}",{cx("A")},0))' for l in labs]
            if len(parts) == 1:
                return f'IF({parts[0]}="","None",{parts[0]})'
            a_, b_ = parts
            return f'IF(AND({a_}="",{b_}=""),"None",IF({a_}="",{b_},IF({b_}="",{a_},{a_}&"; "&{b_})))'
        ic = _j('O'); mc = _j('P')
        ws.cell(r, 4, '=' + ic); ws.cell(r, 5, '=' + mc); ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=9)
        ws.cell(r, 10, note)
        for j in range(1, 11): cell_style(ws.cell(r, j), size=9, wrap=True)
        ws.cell(r, 3).font = font(color=BLUE_, size=9)
        ws.row_dimensions[r].height = 75; r += 1
    ws.column_dimensions['J'].width = 60
    ws.cell(r, 1, '9'); ws.cell(r, 2, 'Key Countries (slide 9)')
    ws.cell(r, 3, 'Insufficient: Bahamas 6, Barbados 5, Bermuda 3, Cayman Island 3\nModerate: Nicaragua 6, Panama 4, Guatemala 4')
    lk = lambda h, n: f'INDEX({CER(h)},MATCH("{n}",{CER("Country")},0))'
    ws.cell(r, 4, '="Questions – Bahamas "&' + lk('Insufficient', 'Bahamas') + '&", Barbados "&' + lk('Insufficient', 'Barbados') + '&", Bermuda "&' + lk('Insufficient', 'Bermuda') + '&", Cayman Islands "&' + lk('Insufficient', 'Cayman Islands'))
    ws.cell(r, 5, '="Questions – Nicaragua "&' + lk('Moderate', 'Nicaragua') + '&", Paraguay "&' + lk('Moderate', 'Paraguay') + '&", Guatemala "&' + lk('Moderate', 'Guatemala') + '&", Panama "&' + lk('Moderate', 'Panama'))
    ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=9)
    ws.cell(r, 10, 'Bermuda has 6 Insufficient questions (slide 3). Moderate: Nicaragua 9, Paraguay 9, Guatemala 6, Panama 5 questions; Paraguay missing on the slide.')
    for j in range(1, 11): cell_style(ws.cell(r, j), size=9, wrap=True)
    ws.cell(r, 3).font = font(color=BLUE_, size=9); ws.row_dimensions[r].height = 60; r += 1
    # ---------------- table E: slide 13
    r += 2
    put(ws, f'A{r}', 'E. Slide 13 – Self-Assessment Compliance per country', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['', 'Country', 'Slide value', '', 'Corrected score', 'Δ (pp)', '', '', '', 'Status'], height=30); r += 1
    r0 = r
    for n, v in SL13.items():
        ws.cell(r, 2, n); ws.cell(r, 3, v)
        ws.cell(r, 5, f'=INDEX({CER("Score")},MATCH(B{r},{CER("Country")},0))')
        ws.cell(r, 6, f'=ROUND((E{r}-C{r})*100,1)')
        ws.cell(r, 10, f'=IF(ROUND(E{r},2)=C{r},"Matches","Update slide")')
        for j in range(2, 11): cell_style(ws.cell(r, j), size=9, fmt=PCT if j == 5 else ('0%' if j == 3 else ('+0.0;-0.0;0.0' if j == 6 else None)))
        ws.cell(r, 3).font = font(color=BLUE_, size=9); r += 1
    _status_cf(ws, f'J{r0}:J{r-1}')
    # ---------------- table F: slide 15
    r += 2
    put(ws, f'A{r}', 'F. Slide 15 – per Cluster (% of controls; source table "3. Data-Assessments control")', bold=True, color=NAVY, size=11); r += 1
    header_row(ws, r, 1, ['', 'Cluster', 'Slide IC / MC / UC', 'Slide UC', 'Corr. IC', 'Corr. MC', 'Corr. UC', 'Corr. N/A', 'Δ UC (pp)', 'Status'], height=30); r += 1
    DA = "'3. Data-Assessments control'"
    r0 = r
    for lab, key, v in SL15:
        ws.cell(r, 2, lab); ws.cell(r, 3, ' / '.join(f'{x}%' for x in v)); ws.cell(r, 4, v[2] / 100)
        for j, lv in enumerate(['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A']):
            ws.cell(r, 5 + j, f'=COUNTIFS({DA}!$A$3:$A$1154,"{key}",{DA}!$F$3:$F$1154,"{lv}")/COUNTIF({DA}!$A$3:$A$1154,"{key}")')
        ws.cell(r, 9, f'=ROUND((G{r}-D{r})*100,0)'); ws.cell(r, 10, f'=IF(ABS(I{r})<=1,"Matches","Update slide")')
        for j in range(2, 11): cell_style(ws.cell(r, j), size=9, fmt='0%' if j in (4, 5, 6, 7, 8) else ('+0;-0;0' if j == 9 else None))
        ws.cell(r, 3).font = font(color=BLUE_, size=9); ws.cell(r, 4).font = font(color=BLUE_, size=9); r += 1
    _status_cf(ws, f'J{r0}:J{r-1}')
    ws.freeze_panes = 'A5'


def _status_cf(ws, rng):
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Font as _F
    for t, colr in [('Matches', GREEN), ('Update slide', RED), ('Result changes', RED), ('Counts change', ORANGE)]:
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=[f'"{t}"'], fill=fill(colr[0]), font=_F(color=colr[1], bold=True)))
