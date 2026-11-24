"""Inject new sheets (new_sheets.xlsx) into the ORIGINAL workbook package and apply
legacy formula corrections at XML level.  Usage: merge.py original.xlsx new_sheets.xlsx out.xlsx"""
import sys, os, re, zipfile, shutil, json, html, collections
from lxml import etree
from openpyxl.formula.translate import Translator
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl
from common import CFG, NEW_SHEETS, D, CE, q, SLIDE_SHEETS, TA
import content

ORIG, NEW, OUT = sys.argv[1:4]
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
work = os.path.join(os.path.dirname(os.path.abspath(OUT)), '_merge_tmp')
shutil.rmtree(work, ignore_errors=True)
zipfile.ZipFile(ORIG).extractall(os.path.join(work, 'o'))
zipfile.ZipFile(NEW).extractall(os.path.join(work, 'n'))
O = os.path.join(work, 'o'); N = os.path.join(work, 'n')
rd = lambda p: open(p, encoding='utf-8').read()
def wr(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(s)

LOG = collections.defaultdict(list)
# ------------------------------------------------------------------ original sheet map
wbx = rd(f'{O}/xl/workbook.xml')
rels = rd(f'{O}/xl/_rels/workbook.xml.rels')
relmap = {}
for m in re.finditer(r'<Relationship [^>]*>', rels):
    t = m.group(0); i = re.search(r'Id="([^"]+)"', t).group(1); tg = re.search(r'Target="([^"]+)"', t).group(1); relmap[i] = tg
sheets = []  # (name, sheetId, rId, path, fulltag)
for m in re.finditer(r'<sheet [^>]*/>', wbx):
    t = m.group(0)
    nm = html.unescape(re.search(r'name="([^"]*)"', t).group(1))
    sheets.append(dict(name=nm, tag=t, rid=re.search(r'r:id="([^"]+)"', t).group(1),
                       sid=int(re.search(r'sheetId="(\d+)"', t).group(1))))
for s in sheets: s['path'] = f"{O}/xl/{relmap[s['rid']]}"
SP = {s['name']: s['path'] for s in sheets}

# shared strings of original (for cached-value reporting)
sst_o = etree.parse(f'{O}/xl/sharedStrings.xml').getroot()
SST = [''.join(si.itertext()) for si in sst_o.findall(f'{{{NS}}}si')]

CELL = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def cells(xml):
    out = {}
    for m in CELL.finditer(xml):
        out[m.group(1) + m.group(2)] = m
    return out


def cached(m):
    inner = m.group(4) or ''
    v = re.search(r'<v>(.*?)</v>', inner, re.S)
    if not v: return None
    v = html.unescape(v.group(1))
    if 't="s"' in m.group(3): return SST[int(v)]
    return v


def fxml(ref, attrs, formula):
    s = re.search(r' s="\d+"', attrs)
    return f'<c r="{ref}"{s.group(0) if s else ""}><f>{html.escape(formula[1:] if formula.startswith("=") else formula, quote=False)}</f></c>'


def blank(ref, attrs):
    s = re.search(r' s="\d+"', attrs)
    return f'<c r="{ref}"{s.group(0) if s else ""}/>'


ROW = re.compile(r'<row r="(\d+)"([^>]*?)(?:/>|>(.*?)</row>)', re.S)


def apply(xml, repl):
    """Replace existing cells; insert missing ones (keeping column order, creating rows if needed)."""
    done = set()
    def sub(m):
        ref = m.group(1) + m.group(2)
        if ref in repl:
            done.add(ref); v = repl[ref]
            return v(m) if callable(v) else v
        return m.group(0)
    xml = CELL.sub(sub, xml)
    todo = collections.defaultdict(list)
    for ref, v in repl.items():
        if ref not in done and not callable(v):
            mm = re.match(r'([A-Z]+)(\d+)', ref); todo[int(mm.group(2))].append((ci(mm.group(1)), v))
    if not todo: return xml
    def rsub(m):
        r = int(m.group(1))
        if r not in todo: return m.group(0)
        inner = m.group(3) or ''
        cl = [(ci(c.group(1)), c.group(0)) for c in CELL.finditer(inner)]
        cl += todo.pop(r); cl.sort(key=lambda t: t[0])
        attrs = re.sub(r' spans="[^"]*"', '', m.group(2))
        return f'<row r="{r}"{attrs}>' + ''.join(c for _, c in cl) + '</row>'
    xml = ROW.sub(rsub, xml)
    if todo:  # rows that do not exist yet
        rows = {int(m.group(1)): m.group(0) for m in ROW.finditer(xml)}
        for r, cl in todo.items():
            cl.sort(key=lambda t: t[0]); rows[r] = f'<row r="{r}">' + ''.join(c for _, c in cl) + '</row>'
        body = ''.join(rows[k] for k in sorted(rows))
        xml = re.sub(r'<sheetData>.*?</sheetData>|<sheetData/>', lambda _m: '<sheetData>' + body + '</sheetData>', xml, count=1, flags=re.S)
    return xml


def unshare(xml):
    masters = {}
    for m in CELL.finditer(xml):
        inner = m.group(4) or ''
        fm = re.search(r'<f t="shared" ref="[^"]*" si="(\d+)"[^>]*>(.*?)</f>', inner, re.S)
        if fm: masters[fm.group(1)] = (m.group(1) + m.group(2), html.unescape(fm.group(2)))
    def sub(m):
        inner = m.group(4) or ''
        if 't="shared"' not in inner: return m.group(0)
        si = re.search(r'si="(\d+)"', inner).group(1)
        ref = m.group(1) + m.group(2)
        mref, mf = masters[si]
        f = Translator('=' + mf, origin=mref).translate_formula(ref)[1:]
        newf = '<f>' + html.escape(f, quote=False) + '</f>'
        inner2 = re.sub(r'<f[^>]*/>|<f[^>]*>.*?</f>', newf, inner, count=1, flags=re.S)
        return f'<c r="{ref}"{m.group(3)}>{inner2}</c>'
    return CELL.sub(sub, xml)


# ================================================================== F26 DELETE 'Test questions' COLUMN (E) IN 6 FORMS
import delcol
for s_ in delcol.SHEETS:
    x = delcol.delete_column(rd(SP[s_]))
    r0 = 77 if s_ == 'USA' else 74          # TEST block rows (Yes / No / N/A), counts now in column F
    def _tb(m_, s_=s_, r0=r0):
        r_ = int(m_.group(2))
        if m_.group(1) == 'F' and r0 <= r_ <= r0 + 2:
            lab = ['Yes', 'No', 'N/A'][r_ - r0]
            return fxml(f'F{r_}', m_.group(3), delcol.archive_formula(s_, lab))
        return m_.group(0)
    x = CELL.sub(_tb, x)
    wr(SP[s_], x); LOG['test_col_deleted'].append(s_)
for s_ in sheets:
    if s_['name'] in delcol.SHEETS: continue
    x = rd(s_['path'])
    if any(n + '!' in x for n in delcol.SHEETS):
        x2 = re.sub(r'(<f(?:\s[^>]*)?(?<!/)>)(.*?)(</f>)', lambda k: k.group(1) + html.escape(delcol.shift_external(html.unescape(k.group(2))), quote=False) + k.group(3), x, flags=re.S)
        if x2 != x: wr(s_['path'], x2); LOG['ext_refs_shifted'].append(s_['name'])
for n_ in (3, 4):   # comments on Venezuela / Uruguay G63 -> F63
    cp = f'{O}/xl/comments{n_}.xml'; vp = f'{O}/xl/drawings/vmlDrawing{n_}.vml'
    wr(cp, rd(cp).replace('<comment ref="G63"', '<comment ref="F63"'))
    wr(vp, rd(vp).replace('<x:Column>6</x:Column>', '<x:Column>5</x:Column>'))
wbx = re.sub(r'(<definedName [^>]*>)([^<]*)(</definedName>)', lambda k: k.group(1) + delcol.shift_external(k.group(2)) + k.group(3), wbx)

# ================================================================== LEGACY FIXES
# F01-F03 AssessmentsTable / AssessmentsTable13
VL = re.compile(r'VLOOKUP\((AssessmentsTable\d*\[\[#This Row\],\[Question\s*Number\]\]),(.+?),(\d+),\)', re.S)
for sname in ['1. Data-All Assessments 2026', '1. Data-All Assessments TOP20']:
    x = rd(SP[sname]); repl = {}; nfix = 0; ncan = 0
    for ref, m in cells(x).items():
        inner = m.group(4) or ''
        fm = re.search(r'<f>(.*?)</f>', inner, re.S)
        if not fm: continue
        f = html.unescape(fm.group(1))
        col = re.match(r'[A-Z]+', ref).group(0)
        if "'Costa Rica'!$A$2:$H$62" in f:
            f = f.replace("'Costa Rica'!$A$2:$H$62", "'Costa Rica'!$A$2:$G$62")
            if col != 'J': repl[ref] = fxml(ref, m.group(3), f); continue
        if 'Canada!$A$2:$G$60' in f:
            f = f.replace('Canada!$A$2:$G$60', 'Canada!$A$2:$G$62'); ncan += 1
            if col != 'J': repl[ref] = fxml(ref, m.group(3), f); continue
        if col == 'J' and 'VLOOKUP' in f:
            v = VL.search(f)
            look = f'TRIM(T(VLOOKUP({v.group(1)},{v.group(2)},{v.group(3)},FALSE)))'
            nf = (f'IF(OR({look}="UNDER CONTROL",{look}="BAJO CONTROL"),"UNDER CONTROL",IF(OR({look}="MODERATE CONTROL",{look}="CONTROL MODERADO"),"MODERATE CONTROL",'
                  f'IF(OR({look}="INSUFFICIENT CONTROL",{look}="CONTROL INSUFICIENTE"),"INSUFFICIENT CONTROL",IF({look}="N/A","N/A",IF({look}="","MISSING","INVALID")))))')
            repl[ref] = fxml(ref, m.group(3), nf); nfix += 1
    wr(SP[sname], apply(x, repl))
    LOG['assess'].append((sname, nfix, ncan))

# F04-F07 matrix
mx = unshare(rd(SP['1. Data-Control Country Matrix']))
mc = cells(mx); repl = {}
merges = collections.defaultdict(dict)
for a, r1, b, r2 in re.findall(r'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/>', mx):
    merges[a][int(r1)] = int(r2)
mchanges = []
for c in CFG['reg']:
    ccol = c['matrix_col']; vcol = gl(ci(ccol) - 1); lcol = gl(ci(ccol) - 2)
    for r in range(2, 63):
        ref = f'{lcol}{r}'; m = mc.get(ref)
        if m and m.group(4) and '<f>' in m.group(4):
            f = html.unescape(re.search(r'<f>(.*?)</f>', m.group(4), re.S).group(1))
            f2 = f.replace('Canada!$A$2:$G$60', 'Canada!$A$2:$G$62').replace("'El Salvador'!$A$1:", "'El Salvador'!$A$2:")
            f2 = re.sub(r',(\d+)\)$', r',\1,FALSE)', f2)  # approximate (Venezuela) -> exact
            f2 = re.sub(r',(\d+),\)$', r',\1,FALSE)', f2)
            if f2 != f: repl[ref] = fxml(ref, m.group(3), f2)
    r = 2
    while r <= 62:
        r2 = merges[ccol].get(r, r)
        ref = f'{ccol}{r}'; m = mc[ref]
        rng = f'{vcol}{r}:{vcol}{r2}' if r2 > r else f'{vcol}{r}'
        old = cached(m); was_f = '<f' in (m.group(4) or '')
        repl[ref] = fxml(ref, m.group(3), f'IF(COUNT({rng})=0,"N/A",IF(AVERAGE({rng})>=0.9,"UNDER CONTROL",IF(AVERAGE({rng})>=0.75,"MODERATE CONTROL","INSUFFICIENT CONTROL")))')
        mchanges.append(dict(country=c['name'], row=r, ref=ref, old=old, hard=not was_f))
        for k in range(r + 1, r2 + 1):
            rk = f'{ccol}{k}'
            if rk in mc: repl[rk] = blank(rk, mc[rk].group(3))
        r = r2 + 1
wr(SP['1. Data-Control Country Matrix'], apply(mx, repl))
json.dump(mchanges, open('matrix_anchors.json', 'w'))

# F08-F09 Self Assessment Results
alias = {'Cayman Island': 'Cayman Islands', 'French Guyana': 'French Guiana', 'Panamá': 'Panama', 'Rep Dominicana': 'Dominican Republic',
         'Salvador': 'El Salvador', 'Virgin Islands (British)': 'British Virgin Islands', 'Trinidad': 'Trinidad and Tobago',
         'Trinidad and Tobago': 'Trinidad and Tobago'}
MCOL = {c['name']: c['matrix_col'] for c in CFG['reg']}
sx = unshare(rd(SP['Self Assessment Results'])); sc = cells(sx); repl = {}
def cv(ref):
    m = sc.get(ref); return cached(m) if m else None
for r in range(4, 36):
    for col, f in [('O', f'G{r}+I{r}+K{r}'), ('P', f'H{r}+J{r}+L{r}')]:
        repl[f'{col}{r}'] = fxml(f'{col}{r}', sc[f'{col}{r}'].group(3), f)
MX = "'1. Data-Control Country Matrix'"
for r in list(range(39, 71)) + list(range(73, 105)):
    nm = cv(f'B{r}'); nm = alias.get(nm, nm)
    col = MCOL[nm]; rg = f'{MX}!${col}$2:${col}$62'
    for k, lv in zip('EFGH', ['UNDER CONTROL', 'MODERATE CONTROL', 'INSUFFICIENT CONTROL', 'N/A']):
        repl[f'{k}{r}'] = fxml(f'{k}{r}', sc[f'{k}{r}'].group(3), f'COUNTIF({rg},"{lv}")')
    if r <= 70:
        for k, src in zip('IJKL', 'GFEH'):
            repl[f'{k}{r}'] = fxml(f'{k}{r}', sc[f'{k}{r}'].group(3), f'IF(SUM($E{r}:$H{r})=0,0,{src}{r}/SUM($E{r}:$H{r}))')
wr(SP['Self Assessment Results'], apply(sx, repl))

# 3.Final-DetailsControlCountries row index by control number
dx = cells(rd(SP['3.Final-DetailsControlCountries']))
def key(lbl):
    t = str(lbl).strip().split()[0].rstrip('.')
    return 'Annex 1' if t.lower().startswith('annex') else t
drow = {}
for r in range(2, 38):
    drow[key(cached(dx[f'A{r}']))] = r
DT = "'3.Final-DetailsControlCountries'"
# F10 3.Final-SAPerControl
px = unshare(rd(SP['3.Final-SAPerControl'])); pc = cells(px); repl = {}
fixnum = {('Duties & Taxes Process Accounting', '4.1'): '4.10', ('Customs Contract Clauses', '2.1'): '2.10'}
for r in range(2, 38):
    nm = cached(pc[f'A{r}']).strip(); num = cached(pc[f'B{r}']).strip()
    try:
        num = ('%.2f' % float(num)).rstrip('0').rstrip('.')
    except ValueError:
        pass
    num = fixnum.get((nm, num), num)
    num = re.sub(r'\.0$', '', num)
    dr = drow['Annex 1' if num.startswith('Annex') else num]
    for k, lv in zip('DEFG', ['UNDER CONTROL', 'MODERATE CONTROL', 'INSUFFICIENT CONTROL', 'N/A']):
        m = pc.get(f'{k}{r}')
        attrs = m.group(3) if m else ''
        repl[f'{k}{r}'] = fxml(f'{k}{r}', attrs, f'COUNTIF({DT}!$B${dr}:$AG${dr},"{lv}")')
    for k, src in zip('HIJK', 'DEFG'):
        repl[f'{k}{r}'] = fxml(f'{k}{r}', pc[f'{k}{r}'].group(3), f'({src}{r}*100%)/COUNTA({DT}!$B$1:$AG$1)')
wr(SP['3.Final-SAPerControl'], apply(px, repl))
# F11 4.Final-AM Risk Assessment
ax = unshare(rd(SP['4.Final-AM Risk Assessment'])); ac = cells(ax); repl = {}
for r in list(range(3, 39)) + list(range(55, 91)):
    lab = cached(ac[f'A{r}']) if f'A{r}' in ac else None
    if not lab: continue
    dr = drow[key(lab)]
    for k, lv in zip('BDFH', ['UNDER CONTROL', 'MODERATE CONTROL', 'INSUFFICIENT CONTROL', 'N/A']):
        attrs = ac[f'{k}{r}'].group(3) if f'{k}{r}' in ac else ''
        repl[f'{k}{r}'] = fxml(f'{k}{r}', attrs, f'COUNTIF({DT}!$B${dr}:$AG${dr},"{lv}")')
wr(SP['4.Final-AM Risk Assessment'], apply(ax, repl))
# F12 5.Compliance 2026
cx = rd(SP['5.Compliance 2026']); cc = cells(cx); repl = {}
for r in range(2, 34):
    if f'J{r}' in cc and '<f' in (cc[f'J{r}'].group(4) or ''):
        repl[f'J{r}'] = fxml(f'J{r}', cc[f'J{r}'].group(3), f'IF(K{r}="","N/A",IF(K{r}>=0.91,"UNDER CONTROL",IF(K{r}>=0.61,"MODERATE CONTROL","INSUFFICIENT CONTROL")))')
for r in range(2, 34):
    if f'C{r}' in cc and f'K{r}' in cc:
        repl[f'K{r}'] = fxml(f'K{r}', cc[f'K{r}'].group(3), f"IFERROR(INDEX('13 – Calc Engine'!$P$5:$P$36,MATCH(IF(C{r}=\"United States\",\"USA\",C{r}),'13 – Calc Engine'!$A$5:$A$36,0)),\"\")")
wr(SP['5.Compliance 2026'], apply(unshare(cx), repl))


# F18-F20 country-sheet summary blocks (SharePoint / TEST evidence counts, rows 63+)
YESF = re.compile(r'^COUNTIF\(\$?([A-Z])\$?\d+:\$?[A-Z]\$?\d+,"(?:Si|SI|si|Yes|YES|yes)"\)$')
OTHF = re.compile(r'^COUNTIF\(\$?([A-Z])\$?\d+:\$?[A-Z]\$?\d+,"(No|NO|N/A)"\)$')
for c in CFG['reg']:
    x = rd(SP[c['sheet']]); cs = cells(x); repl = {}
    for ref, m in cs.items():
        if int(m.group(2)) < 63 or not m.group(4) or '<f>' not in m.group(4): continue
        f = html.unescape(re.search(r'<f>(.*?)</f>', m.group(4), re.S).group(1))
        col_override = None
        my = YESF.match(f); mo = OTHF.match(f)
        if my:
            col = col_override or my.group(1); rg = f'${col}$2:${col}$62'
            nf = f'COUNTIF({rg},"Yes")+COUNTIF({rg},"Si")+COUNTIF({rg},"Sí")'
        elif mo:
            col = col_override or mo.group(1); nf = f'COUNTIF(${col}$2:${col}$62,"{mo.group(2)}")'
        elif c['sheet'] == 'USA' and ref == 'F73':
            nf = '61-F72'
        else:
            continue
        if nf != f:
            repl[ref] = fxml(ref, m.group(3), nf); LOG['summary_fix'].append(f"{c['sheet']}!{ref}: {f} -> {nf}")
    if repl: wr(SP[c['sheet']], apply(x, repl))


# F22 TableQuestions (2. SelfAssessmentPerQuestions and its copy): counts N:Q were hand-typed from the defective
# pivot; % columns S:V divided every row by row 6; total row 67 hand-typed.
SRC = "'1. Data-All Assessments 2026'"
for tq in ['2. SelfAssessmentPerQuestions', '2. SelfAssessmentPerQuestio (2)']:
    x = unshare(rd(SP[tq])); cs = cells(x); repl = {}
    attr = lambda ref: cs[ref].group(3) if ref in cs else ''
    for r in range(6, 67):
        for col, lv in zip('NOPQ', ['INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A']):
            repl[f'{col}{r}'] = fxml(f'{col}{r}', attr(f'{col}{r}'), f'COUNTIFS({SRC}!$C$3:$C$1954,$J{r},{SRC}!$J$3:$J$1954,"{lv}")')
    for col in 'NOPQ':
        repl[f'{col}67'] = fxml(f'{col}67', attr(f'{col}67'), f'SUM({col}6:{col}66)')
    for r in range(6, 68):
        for col, src in zip('STUV', 'NOPQ'):
            repl[f'{col}{r}'] = fxml(f'{col}{r}', attr(f'{col}{r}'), f'IF(SUM($N{r}:$Q{r})=0,0,{src}{r}/SUM($N{r}:$Q{r}))')
    wr(SP[tq], apply(x, repl)); LOG['tablequestions'].append((tq, len(repl)))

# F23 replace CONCAT (not available in Excel 2016) in '3. Data-Assessments control' column E
x = unshare(rd(SP['3. Data-Assessments control'])); cs = cells(x); repl = {}
for ref, mm in cs.items():
    if mm.group(1) == 'E' and mm.group(4) and '_xlfn.CONCAT' in mm.group(4):
        r_ = mm.group(2); repl[ref] = fxml(ref, mm.group(3), f'C{r_}&" "&D{r_}')
wr(SP['3. Data-Assessments control'], apply(x, repl)); LOG['concat_fix'].append(len(repl))

# F24 2.Final-byScope chart source (A16:E26) was a pasted copy of old pivot values -> formulas
TQ = "'2. SelfAssessmentPerQuestions'"
x = unshare(rd(SP['2.Final-byScope'])); cs = cells(x); repl = {}
for r in range(17, 27):
    for col, src in zip('BCDE', 'NOPQ'):
        a_ = cs[f'{col}{r}'].group(3) if f'{col}{r}' in cs else ''
        if r < 26:
            f_ = f'IFERROR(SUMIFS({TQ}!${src}$6:${src}$66,{TQ}!$K$6:$K$66,$A{r})/SUMIFS({TQ}!$R$6:$R$66,{TQ}!$K$6:$K$66,$A{r}),0)'
        else:
            f_ = f'IFERROR(SUM({TQ}!${src}$6:${src}$66)/SUM({TQ}!$R$6:$R$66),0)'
        repl[f'{col}{r}'] = fxml(f'{col}{r}', a_, f_)
wr(SP['2.Final-byScope'], apply(x, repl)); LOG['byscope_chart'].append(len(repl))

# F25 Self Assessment Results – cluster block B120:E126 (chart = presentation slide 15) hand-typed -> formulas
x = unshare(rd(SP['Self Assessment Results'])); cs = cells(x); repl = {}
tot = 'SUMIFS($E$39:$E$70,$D$39:$D$70,$B{r})+SUMIFS($F$39:$F$70,$D$39:$D$70,$B{r})+SUMIFS($G$39:$G$70,$D$39:$D$70,$B{r})+SUMIFS($H$39:$H$70,$D$39:$D$70,$B{r})'
for r in range(121, 127):
    for col, src in zip('CDE', 'GFE'):
        a_ = cs[f'{col}{r}'].group(3) if f'{col}{r}' in cs else ''
        repl[f'{col}{r}'] = fxml(f'{col}{r}', a_, f'IFERROR(SUMIFS(${src}$39:${src}$70,$D$39:$D$70,$B{r})/(' + tot.format(r=r) + '),0)')
wr(SP['Self Assessment Results'], apply(x, repl)); LOG['cluster_block'].append(len(repl))


# F27 '4. Customs Process Controls' per-control chart (A79:E109): hand-pasted 29 "areas" with shifted labels
#     -> 36 controls by formula from 13 – Calc Engine (weakest first); chart range extended; area labels fixed
LAYJ = json.load(open('layout.json')); X0, X1, TOTJ = LAYJ['X0'], LAYJ['X1'], LAYJ['TOT']
CEQ = "'13 – Calc Engine'"
cx_ = lambda c: f"{CEQ}!${c}${X0}:${c}${X1}"
def txml(ref, attrs, text):
    s_ = re.search(r' s="\d+"', attrs)
    return f'<c r="{ref}"{s_.group(0) if s_ else ""} t="inlineStr"><is><t>{html.escape(text, quote=False)}</t></is></c>'
x = unshare(rd(SP['4. Customs Process Controls'])); cs = cells(x); repl = {}
sty = {c_: (cs[f'{c_}108'].group(3) if f'{c_}108' in cs else '') for c_ in 'ABCDE'}
for k in range(1, 37):
    r = 79 + k; mt = f'MATCH({k},{cx_("U")},0)'
    a_ = lambda c_: cs[f'{c_}{r}'].group(3) if f'{c_}{r}' in cs else sty[c_]
    den = f'(INDEX({cx_("C")},{mt})+INDEX({cx_("G")},{mt}))'
    repl[f'A{r}'] = fxml(f'A{r}', a_('A'), f'INDEX({cx_("A")},{mt})')
    for c_, src in zip('BCDE', 'FEDG'):
        repl[f'{c_}{r}'] = fxml(f'{c_}{r}', a_(c_), f'IFERROR(INDEX({cx_(src)},{mt})/{den},0)')
r = 116
repl['A116'] = txml('A116', cs['A109'].group(3) if 'A109' in cs else '', 'Grand Total')
for c_, src in zip('BCDE', 'GFEH'):
    repl[f'{c_}116'] = fxml(f'{c_}116', cs[f'{c_}109'].group(3) if f'{c_}109' in cs else '', f'IFERROR({CEQ}!${src}${TOTJ}/{CEQ}!$D${TOTJ},0)')
wr(SP['4. Customs Process Controls'], apply(x, repl)); LOG['ctrl_chart'].append(len(repl))
cp = f'{O}/xl/charts/chart6.xml'; cxml = rd(cp)
cxml = re.sub(r"(\$[A-E]\$80:\$[A-E]\$)108", r"\g<1>115", cxml)
cxml = re.sub(r'<c:(?:num|str)Cache>.*?</c:(?:num|str)Cache>', '', cxml, flags=re.S)
wr(cp, cxml)
# F28/F29 legacy scope sheets (slides 17-24), Self Assessment Results cluster tables (slide 15) and the per-control chart (slide 10):
#   hand-typed values -> LINKS to the P-sheets (one worksheet per slide holds the formulas, see 16 – Slide Data Index)
LAYP = LAYJ['P']
NROWS = 32
FILL = {'B': 'FF0000', 'C': 'FFFF00', 'D': '00B050', 'E': 'BFBFBF', 'F': 'BFBFBF'}
ALIAS = {'Cayman Island': 'Cayman Islands', 'French Guyana': 'French Guiana', 'Panamá': 'Panama', 'Rep Dominicana': 'Dominican Republic',
         'Salvador': 'El Salvador', 'Virgin Islands (British)': 'British Virgin Islands', 'Trinidad': 'Trinidad and Tobago', 'Trinidad and Tobag': 'Trinidad and Tobago'}
CANON = {c['name'] for c in CFG['reg']}


def inrng(ref, rg):
    a, b = rg.split(':'); m = re.match(r'([A-Z]+)(\d+)', ref); ma = re.match(r'([A-Z]+)(\d+)', a); mb = re.match(r'([A-Z]+)(\d+)', b)
    return ci(ma.group(1)) <= ci(m.group(1)) <= ci(mb.group(1)) and int(ma.group(2)) <= int(m.group(2)) <= int(mb.group(2))


def overlaps(r1, r2):
    a, b = r1.split(':') if ':' in r1 else (r1, r1)
    return any(inrng(x, r2) for x in (a, b)) or any(inrng(x, r1) for x in r2.split(':'))


SECS = {'1. About the DHL Express Global': (9, ['I9:N41'], 'chart9.xml'), '2. Customs Awareness & Risk Man': (9, ['G9:L56'], 'chart8.xml'),
        '3. Regulatory Supervision': (8, ['I8:M43'], 'chart7.xml'), '4. Customs Process Controls': (8, ['G25:K38'], 'chart5.xml'),
        '5. Customs Representation': (8, ['H8:L44'], 'chart4.xml'), '6. Reporting & Investigation of': (8, ['A7:BZ90'], 'chart3.xml'),
        '7. Escalations ': (8, ['A7:BZ90'], 'chart2.xml'), 'Annex 1': (8, ['A7:BZ90'], 'chart1.xml')}
SECN = {}
for psh, lp in LAYP.items():
    if 'legacy' not in lp: continue
    sh = lp['legacy']; H, clear, chart = SECS[sh]; t0 = lp['t0']; c0, c1 = lp['c0'], lp['c1']; n = lp['n']
    PQ = q(psh)
    x = unshare(rd(SP[sh])); cs = cells(x); repl = {}
    for ref in cs:
        if any(inrng(ref, rg) for rg in clear): repl[ref] = ''
    dsty = {}
    for c_ in 'ABCDEF':
        for rr in range(H + 1, H + NROWS + 1):
            if f'{c_}{rr}' in cs and not any(inrng(f'{c_}{rr}', rg) for rg in clear): dsty[c_] = cs[f'{c_}{rr}'].group(3); break
    hsty = {c_: (cs[f'{c_}{H}'].group(3) if f'{c_}{H}' in cs else '') for c_ in 'ABCDEF'}
    for c_, t in zip('ABCDEF', ['COUNTRY', 'INSUFFICIENT CONTROL', 'MODERATE CONTROL', 'UNDER CONTROL', 'N/A', 'CLUSTER']):
        repl[f'{c_}{H}'] = txml(f'{c_}{H}', hsty[c_] or hsty['A'], t)
    for k in range(NROWS):
        r = H + 1 + k; pr = t0 + k
        for c_, src in zip('ABCDEF', 'BDEFGC'):
            st = cs[f'{c_}{r}'].group(3) if (f'{c_}{r}' in cs and not any(inrng(f'{c_}{r}', rg) for rg in clear)) else dsty.get(c_, dsty.get('B', ''))
            repl[f'{c_}{r}'] = fxml(f'{c_}{r}', st, f'IF({PQ}!{src}{pr}="","",{PQ}!{src}{pr})')
    # rows 2-5: share of the scope's controls per country (was typed by hand)
    hdr_names = {}
    for ref, m in cs.items():
        if m.group(2) == '1' and ref != 'A1':
            v = (cached(m) or '').strip(); v = ALIAS.get(v, v)
            if v in CANON: hdr_names[m.group(1)] = v
    lvcol = {'INSUF': 'I', 'MODER': 'J', 'UNDER': 'K', 'N/A': 'L'}
    for r in range(2, 6):
        lab = (cached(cs[f'A{r}']) if f'A{r}' in cs else '') or ''
        key = next((k for k in lvcol if lab.strip().upper().startswith(k)), None)
        if not key: continue
        for col, nm in hdr_names.items():
            ref = f'{col}{r}'
            st = cs[ref].group(3) if ref in cs else ''
            repl[ref] = fxml(ref, st, f'IFERROR(INDEX({PQ}!${lvcol[key]}${c0}:${lvcol[key]}${c1},MATCH("{nm}",{PQ}!$A${c0}:$A${c1},0)),0)')
    tl = clear[0].split(':')[0] if clear[0] != 'A7:BZ90' else 'H8'
    tc, tr = re.match(r'([A-Z]+)(\d+)', tl).groups(); tr = int(tr)
    repl[f'{tc}{tr}'] = txml(f'{tc}{tr}', '', f"Data of this sheet = links to '{psh}' (one sheet per slide: slide table, calculation for all countries and formula guide). "
                                             f"Table A{H}:F{H+NROWS} = slide {lp['slide']}; rows 2-5 = share of this scope's controls per country. Old typed values: 09 – Historical Archive.")
    repl[f'{tc}{tr+1}'] = fxml(f'{tc}{tr+1}', '', f'"Countries with gaps: "&COUNT(B{H+1}:B{H+NROWS})&"  |  chart rows: {n}"&IF(COUNT(B{H+1}:B{H+NROWS})>{n},"  -> extend the chart data range","  (OK)")')
    x = apply(x, repl)
    def mfix(m):
        return '' if any(overlaps(m.group(1), rg) for rg in clear) else m.group(0)
    x = re.sub(r'<mergeCell ref="([^"]+)"/>', mfix, x)
    cnt = len(re.findall(r'<mergeCell ref=', x))
    x = re.sub(r'<mergeCells count="\d+">', f'<mergeCells count="{cnt}">', x)
    x = re.sub(r'<mergeCells count="0">\s*</mergeCells>|<mergeCells count="0"/>', '', x)
    wr(SP[sh], x); LOG['scope_sheets_linked'].append((sh, psh, len(repl))); SECN[sh] = n
    cp = f'{O}/xl/charts/{chart}'; cx = rd(cp)
    shq = re.escape(html.escape(sh, quote=False))
    def ser(m):
        s_ = m.group(0)
        col = re.search(r'<c:val><c:numRef><c:f>[^<]*!\$([A-E])\$', s_).group(1)
        # value / category ranges must cover data rows; title refs point to header row
        s_ = re.sub(r'(<c:cat><c:(?:str|num)Ref><c:f>[^<]*!)\$A\$\d+(?::\$A\$\d+)?', lambda k: f'{k.group(1)}$A${H+1}:$A${H+n}', s_)
        s_ = re.sub(r'(<c:val><c:numRef><c:f>[^<]*!)\$([B-E])\$\d+(?::\$[B-E]\$\d+)?', lambda k: f'{k.group(1)}${k.group(2)}${H+1}:${k.group(2)}${H+n}', s_)
        s_ = re.sub(r'(<c:tx><c:strRef><c:f>[^<]*!)\$([B-E])\$\d+', lambda k: f'{k.group(1)}${k.group(2)}${H}', s_)
        if 'filteredSeriesTitle' in s_:
            s_ = re.sub(r'(</c:val>)<c:extLst>.*$', r'\1</c:ser>', s_, flags=re.S)
        if '<c:tx>' not in s_:
            s_ = re.sub(r'(<c:order val="\d+"/>)', lambda k: k.group(1) + f"<c:tx><c:strRef><c:f>'{html.escape(sh, quote=False)}'!${col}${H}</c:f></c:strRef></c:tx>", s_, count=1)
        s_ = re.sub(r'(<c:spPr>)<a:solidFill>.*?</a:solidFill>', lambda k: k.group(1) + f'<a:solidFill><a:srgbClr val="{FILL[col]}"/></a:solidFill>', s_, count=1, flags=re.S)
        return s_
    cx = re.sub(r'<c:(?:num|str)Cache>.*?</c:(?:num|str)Cache>', '', cx, flags=re.S)
    cx = re.sub(r'<c:ser>.*?</c:ser>', ser, cx, flags=re.S)
    wr(cp, cx)
json.dump(SECN, open('scope_chart_rows.json', 'w'))

# Self Assessment Results – cluster chart data C121:F126 and slide-15 table C133:F138 -> links to P15 (+ N/A column F and chart series)
P15Q = "'P15 – Results per Cluster'"; p15 = LAYP['P15']
x = unshare(rd(SP['Self Assessment Results'])); cs = cells(x); repl = {}
for hr, r0_ in [(120, 121), (132, 133)]:
    repl[f'F{hr}'] = txml(f'F{hr}', cs[f'E{hr}'].group(3) if f'E{hr}' in cs else '', 'N/A')
    for r in range(r0_, r0_ + 6):
        for col, src in zip('CDEF', 'BCDE'):
            a_ = cs[f'{col}{r}'].group(3) if f'{col}{r}' in cs else (cs[f'E{r}'].group(3) if f'E{r}' in cs else '')
            repl[f'{col}{r}'] = fxml(f'{col}{r}', a_, f'IFERROR(INDEX({P15Q}!${src}${p15["t0"]}:${src}${p15["t1"]},MATCH($B{r},{P15Q}!$A${p15["t0"]}:$A${p15["t1"]},0)),0)')
wr(SP['Self Assessment Results'], apply(x, repl)); LOG['cluster_linked'].append(len(repl))
cp = f'{O}/xl/charts/chart21.xml'; cx = rd(cp)
cx = re.sub(r'<c:(?:num|str)Cache>.*?</c:(?:num|str)Cache>', '', cx, flags=re.S)
sers = re.findall(r'<c:ser>.*?</c:ser>', cx, re.S)
if not any("$F$121" in s_ for s_ in sers):
    last = sers[-1]
    na = last.replace('$E$120', '$F$120').replace('$E$121:$E$126', '$F$121:$F$126')
    na = re.sub(r'<c:idx val="\d+"/>', f'<c:idx val="{len(sers)}"/>', na, count=1); na = re.sub(r'<c:order val="\d+"/>', f'<c:order val="{len(sers)}"/>', na, count=1)
    na = re.sub(r'(<c:spPr>)<a:solidFill>.*?</a:solidFill>', r'\1<a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill>', na, count=1, flags=re.S)
    na = re.sub(r'<c16:uniqueId val="\{[^}]*\}"/>', '<c16:uniqueId val="{00000003-0000-4000-8000-00000000F0A1}"/>', na)
    cx = cx.replace(last, last + na)
wr(cp, cx)

# 4. Customs Process Controls A80:E115 (slide 10 chart) -> links to P10
P10Q = "'P10 – Results per Control'"; p10 = LAYP['P10']
x = unshare(rd(SP['4. Customs Process Controls'])); cs = cells(x); repl = {}
for k in range(36):
    r = 80 + k; pr = p10['t0'] + k
    for col, src in zip('ABCDE', 'BCDEF'):
        repl[f'{col}{r}'] = fxml(f'{col}{r}', cs[f'{col}{r}'].group(3) if f'{col}{r}' in cs else '', f'{P10Q}!{src}{pr}')
wr(SP['4. Customs Process Controls'], apply(x, repl)); LOG['ctrl_chart_linked'].append(len(repl))

# shifted "Control Area" labels in 3.Final-SAPerControl (2.x block)
AREA = {'Customs Compliance Culture': 'Customs Awerness & Communication', 'Customs Regulatory Changes': 'Customs Awerness & Communication',
        'Country Self-Assessment & Action Plan': 'Risk Management - Self-Assessment', 'Personnel Training': 'Personal Training',
        'Fines & Penalties': 'F&P and Voluntary Disclosures', 'Voluntary Disclosures': 'F&P and Voluntary Disclosures',
        'Interaction with Authorities (Communications)': 'Cooperation with Authorities', 'Trusted Trader Programs': 'Trusted Trader Programs',
        'Customs Contract Clauses': 'Customs Contract Clauses'}
x = rd(SP['3.Final-SAPerControl']); cs = cells(x); repl = {}
for r in range(2, 38):
    nm = (cached(cs[f'A{r}']) or '').strip()
    if nm in AREA and f'C{r}' in cs:
        repl[f'C{r}'] = txml(f'C{r}', cs[f'C{r}'].group(3), AREA[nm])
wr(SP['3.Final-SAPerControl'], apply(x, repl)); LOG['area_labels'].append(len(repl))

# Data validation on country forms and action plans
DV_ORDER = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<customProperties',
            '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture', '<oleObjects', '<controls',
            '<webPublishItems', '<tableParts', '<extLst']
def add_dv(path, sqref, items, prompt):
    x = rd(path)
    if '<dataValidations' in x: return False
    dv = (f'<dataValidations count="1"><dataValidation type="list" errorStyle="warning" allowBlank="1" showInputMessage="1" showErrorMessage="1" '
          f'errorTitle="Non-standard value" error="Use one of the standard values: {html.escape(", ".join(items))}" promptTitle="Standard values" prompt="{html.escape(prompt)}" '
          f'sqref="{sqref}"><formula1>"{",".join(items)}"</formula1></dataValidation></dataValidations>')
    pos = min([x.find(t) for t in DV_ORDER if x.find(t) > 0] + [x.find('</worksheet>')])
    wr(path, x[:pos] + dv + x[pos:]); return True
for c in CFG['reg']:
    col = gl(c['cl'] + 1)
    add_dv(SP[c['sheet']], f'{col}2:{col}62', ['UNDER CONTROL', 'MODERATE CONTROL', 'INSUFFICIENT CONTROL', 'N/A'], 'Select the Control Level')
    ai = CFG['apinfo'][c['ap']]
    add_dv(SP[c['ap']], f"{ai['cols']['status']}2:{ai['cols']['status']}{ai['last']+5}", ['NOT STARTED', 'IN PROGRESS', 'COMPLETED', 'ON HOLD', 'CANCELLED'], 'Select the action status')

# pivot caches refresh on load
for fn in os.listdir(f'{O}/xl/pivotCache'):
    if fn.startswith('pivotCacheDefinition'):
        p = f'{O}/xl/pivotCache/{fn}'; x = rd(p)
        if 'refreshOnLoad' not in x:
            x = re.sub(r'<pivotCacheDefinition ', '<pivotCacheDefinition refreshOnLoad="1" ', x, count=1)
        wr(p, x)

# ================================================================== STYLES MERGE
so = rd(f'{O}/xl/styles.xml'); sn = rd(f'{N}/xl/styles.xml')
def section(x, tag):
    m = re.search(rf'<{tag}(?: [^>]*)?>(.*?)</{tag}>', x, re.S)
    return m.group(1) if m else ''
def items(body, tag):
    return re.findall(rf'<{tag}\b(?:[^>]*/>|[^>]*>.*?</{tag}>)', body, re.S)
off = {}
for tag, it in [('fonts', 'font'), ('fills', 'fill'), ('borders', 'border'), ('cellXfs', 'xf'), ('dxfs', 'dxf')]:
    off[tag] = len(items(section(so, tag), it))
# numFmts
onf = re.findall(r'<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/>', section(so, 'numFmts'))
nnf = re.findall(r'<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/>', section(sn, 'numFmts'))
nextid = max([int(i) for i, _ in onf] + [200]) + 1
fmtmap = {}; addfmt = []
for i, code in nnf:
    ex = [oi for oi, oc in onf if oc == code]
    if ex: fmtmap[i] = ex[0]
    else: fmtmap[i] = str(nextid); addfmt.append(f'<numFmt numFmtId="{nextid}" formatCode="{code}"/>'); nextid += 1
def add_items(x, tag, new):
    body = section(x, tag)
    cnt = len(items(body, tag[:-1] if tag != 'cellXfs' else 'xf')) + len(new)
    if tag == 'dxfs': cnt = len(items(body, 'dxf')) + len(new)
    x = re.sub(rf'<{tag}(?: [^>]*)?>', f'<{tag} count="{cnt}">', x, count=1)
    return x.replace(f'</{tag}>', ''.join(new) + f'</{tag}>', 1)
newfonts = items(section(sn, 'fonts'), 'font'); newfills = items(section(sn, 'fills'), 'fill')
newborders = items(section(sn, 'borders'), 'border'); newxfs = items(section(sn, 'cellXfs'), 'xf'); newdxfs = items(section(sn, 'dxfs'), 'dxf')
def remap_xf(xf):
    xf = re.sub(r'fontId="(\d+)"', lambda m: f'fontId="{int(m.group(1))+off["fonts"]}"', xf)
    xf = re.sub(r'fillId="(\d+)"', lambda m: f'fillId="{int(m.group(1))+off["fills"]}"', xf)
    xf = re.sub(r'borderId="(\d+)"', lambda m: f'borderId="{int(m.group(1))+off["borders"]}"', xf)
    xf = re.sub(r'numFmtId="(\d+)"', lambda m: f'numFmtId="{fmtmap.get(m.group(1), m.group(1))}"', xf)
    xf = re.sub(r'xfId="\d+"', 'xfId="0"', xf)
    return xf
newxfs = [remap_xf(x) for x in newxfs]
newdxfs = [re.sub(r'numFmtId="(\d+)"', lambda m: f'numFmtId="{fmtmap.get(m.group(1), m.group(1))}"', d) for d in newdxfs]
so = add_items(so, 'fonts', newfonts); so = add_items(so, 'fills', newfills); so = add_items(so, 'borders', newborders)
so = add_items(so, 'cellXfs', newxfs); so = add_items(so, 'dxfs', newdxfs)
if addfmt:
    if '<numFmts' in so:
        cnt = len(onf) + len(addfmt)
        so = re.sub(r'<numFmts count="\d+">', f'<numFmts count="{cnt}">', so).replace('</numFmts>', ''.join(addfmt) + '</numFmts>', 1)
    else:
        so = so.replace('<fonts', f'<numFmts count="{len(addfmt)}">{"".join(addfmt)}</numFmts><fonts', 1)
wr(f'{O}/xl/styles.xml', so)

# ================================================================== INJECT NEW SHEETS
sst_n = etree.parse(f'{N}/xl/sharedStrings.xml').getroot() if os.path.exists(f'{N}/xl/sharedStrings.xml') else None
NSST = [''.join(si.itertext()) for si in sst_n.findall(f'{{{NS}}}si')] if sst_n is not None else []
nwb = rd(f'{N}/xl/workbook.xml'); nrels = rd(f'{N}/xl/_rels/workbook.xml.rels')
nrelmap = {re.search(r'Id="([^"]+)"', t).group(1): re.search(r'Target="([^"]+)"', t).group(1) for t in re.findall(r'<Relationship [^>]*>', nrels)}
nsheets = [(html.unescape(re.search(r'name="([^"]*)"', t).group(1)), re.search(r'r:id="([^"]+)"', t).group(1)) for t in re.findall(r'<sheet [^>]*/>', nwb)]
ct = rd(f'{O}/[Content_Types].xml')
def maxnum(folder, prefix):
    p = f'{O}/xl/{folder}'
    nums = [int(re.search(r'(\d+)', f).group(1)) for f in os.listdir(p) if f.startswith(prefix) and f.endswith('.xml')] if os.path.isdir(p) else []
    return max(nums + [0])
nsheet = maxnum('worksheets', 'sheet'); ndraw = maxnum('drawings', 'drawing'); nchart = maxnum('charts', 'chart'); ntab = maxnum('tables', 'table')
tabid = 1000
rid_next = max(int(re.sub(r'\D', '', k)) for k in relmap) + 1
added = []  # (name, rid, sheetId)
maxsid = max(s['sid'] for s in sheets)
overrides = []
def inline(m):
    attrs = m.group(3)
    inner = m.group(4) or ''
    if 't="s"' in attrs:
        idx = int(re.search(r'<v>(\d+)</v>', inner).group(1))
        txt = html.escape(NSST[idx], quote=False)
        attrs = attrs.replace('t="s"', 't="inlineStr"')
        return f'<c r="{m.group(1)}{m.group(2)}"{attrs}><is><t xml:space="preserve">{txt}</t></is></c>'
    return m.group(0)
for nm, rid in nsheets:
    src = f"{N}/xl/{nrelmap[rid].lstrip('/').replace('xl/', '')}"
    x = rd(src)
    x = CELL.sub(inline, x)
    x = re.sub(r'(<c [^>]*?) s="(\d+)"', lambda m: f'{m.group(1)} s="{int(m.group(2))+off["cellXfs"]}"', x)
    x = re.sub(r'(<row [^>]*?) s="(\d+)"', lambda m: f'{m.group(1)} s="{int(m.group(2))+off["cellXfs"]}"', x)
    x = re.sub(r'(<col [^>]*?) style="(\d+)"', lambda m: f'{m.group(1)} style="{int(m.group(2))+off["cellXfs"]}"', x)
    x = re.sub(r'dxfId="(\d+)"', lambda m: f'dxfId="{int(m.group(1))+off["dxfs"]}"', x)
    nsheet += 1
    newpath = f'worksheets/sheet{nsheet}.xml'
    # sheet rels
    relsrc = os.path.join(os.path.dirname(src), '_rels', os.path.basename(src) + '.rels')
    if os.path.exists(relsrc):
        rx = rd(relsrc); out_rels = []
        for t in re.findall(r'<Relationship [^>]*>', rx):
            tg = re.search(r'Target="([^"]+)"', t).group(1); rr = re.search(r'Id="([^"]+)"', t).group(1); ty = re.search(r'Type="([^"]+)"', t).group(1)
            if '/drawings/' in tg:
                ndraw += 1
                dsrc = f"{N}/{tg.lstrip('/')}"
                dx_ = rd(dsrc)
                drel = os.path.join(os.path.dirname(dsrc), '_rels', os.path.basename(dsrc) + '.rels')
                drx = rd(drel); dout = []
                for t2 in re.findall(r'<Relationship [^>]*>', drx):
                    tg2 = re.search(r'Target="([^"]+)"', t2).group(1); i2 = re.search(r'Id="([^"]+)"', t2).group(1); ty2 = re.search(r'Type="([^"]+)"', t2).group(1)
                    nchart += 1
                    shutil.copy(f"{N}/{tg2.lstrip('/')}", f'{O}/xl/charts/chart{nchart}.xml')
                    overrides.append(f'<Override PartName="/xl/charts/chart{nchart}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>')
                    dout.append(f'<Relationship Id="{i2}" Type="{ty2}" Target="../charts/chart{nchart}.xml"/>')
                wr(f'{O}/xl/drawings/drawing{ndraw}.xml', dx_)
                wr(f'{O}/xl/drawings/_rels/drawing{ndraw}.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(dout) + '</Relationships>')
                overrides.append(f'<Override PartName="/xl/drawings/drawing{ndraw}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>')
                out_rels.append(f'<Relationship Id="{rr}" Type="{ty}" Target="../drawings/drawing{ndraw}.xml"/>')
            elif '/tables/' in tg:
                ntab += 1; tabid += 1
                tx = rd(f"{N}/{tg.lstrip('/')}")
                tx = re.sub(r'(<table [^>]*?)\bid="\d+"', lambda m: f'{m.group(1)}id="{tabid}"', tx, count=1)
                wr(f'{O}/xl/tables/table{ntab}.xml', tx)
                overrides.append(f'<Override PartName="/xl/tables/table{ntab}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>')
                out_rels.append(f'<Relationship Id="{rr}" Type="{ty}" Target="../tables/table{ntab}.xml"/>')
            else:
                raise SystemExit('unexpected rel ' + tg)
        wr(f'{O}/xl/worksheets/_rels/sheet{nsheet}.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(out_rels) + '</Relationships>')
    wr(f'{O}/xl/{newpath}', x)
    overrides.append(f'<Override PartName="/xl/{newpath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    maxsid += 1; nr = f'rId{rid_next}'; rid_next += 1
    rels = rels.replace('</Relationships>', f'<Relationship Id="{nr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="{newpath}"/></Relationships>')
    added.append(dict(name=nm, rid=nr, sid=maxsid, path=f'{O}/xl/{newpath}',
                      tag=f'<sheet name="{html.escape(nm)}" sheetId="{maxsid}" r:id="{nr}"/>'))

# ================================================================== REMOVE EMPTY SHEETS
removed = []
for s in list(sheets):
    if s['name'] in content.EMPTY:
        x = rd(s['path'])
        assert '<f>' not in x and '<v>' not in x and 'drawing' not in x, s['name']
        os.remove(s['path'])
        rels = re.sub(rf'<Relationship [^>]*Id="{s["rid"]}"[^>]*/>', '', rels)
        part = '/xl/' + relmap[s['rid']]
        ct = ct.replace(f'<Override PartName="{part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>', '')
        rp = os.path.join(os.path.dirname(s['path']), '_rels', os.path.basename(s['path']) + '.rels')
        if os.path.exists(rp): os.remove(rp)
        sheets.remove(s); removed.append(s['name'])

# ================================================================== ORDER
oldnames = [s['name'] for s in sheets]
byname = {s['name']: s for s in sheets + added}
order = NEW_SHEETS[:7] + SLIDE_SHEETS
ctry_block = [n for n in oldnames if n in {c['sheet'] for c in CFG['reg']} | {c['ap'] for c in CFG['reg']}]
order += ctry_block
order += [NEW_SHEETS[7], 'Config - Structure', 'Config - Configuracion', 'Mapping']
order += [n for n in NEW_SHEETS[8:] if n not in order]
retain_front = ['Quality', 'Regional Actions Draft', 'Regional Action', '5.Policy Tracker 2026', '5.Compliance 2026']
order += retain_front
order += [n for n in oldnames if n not in order]
assert sorted(order) == sorted(oldnames + [a['name'] for a in added]), set(order) ^ set(oldnames + NEW_SHEETS)
# defined names: remap localSheetId
orig_order = [html.unescape(re.search(r'name="([^"]*)"', t).group(1)) for t in re.findall(r'<sheet [^>]*/>', wbx)]
dn = re.search(r'<definedNames>(.*?)</definedNames>', wbx, re.S).group(1)
newdn = []
for m in re.finditer(r'<definedName ([^>]*)>(.*?)</definedName>', dn, re.S):
    attrs, val = m.group(1), m.group(2)
    if '#REF!' in val:
        LOG['names_removed'].append(attrs); continue
    ls = re.search(r'localSheetId="(\d+)"', attrs)
    if ls:
        nm = orig_order[int(ls.group(1))]
        if nm not in order: continue
        attrs = attrs.replace(ls.group(0), f'localSheetId="{order.index(nm)}"')
    newdn.append(f'<definedName {attrs}>{val}</definedName>')
for m in re.finditer(r'<definedName ([^>]*)>(.*?)</definedName>', re.search(r'<definedNames>(.*?)</definedNames>', nwb, re.S).group(1), re.S):
    newdn.append(m.group(0))
wbx = wbx.replace(re.search(r'<definedNames>.*?</definedNames>', wbx, re.S).group(0), '<definedNames>' + ''.join(newdn) + '</definedNames>')
wbx = re.sub(r'<sheets>.*?</sheets>', '<sheets>' + ''.join(byname[n]['tag'] for n in order) + '</sheets>', wbx, flags=re.S)
wbx = re.sub(r'firstSheet="\d+"', 'firstSheet="0"', wbx); wbx = re.sub(r'activeTab="\d+"', 'activeTab="0"', wbx)
wbx = re.sub(r'<calcPr[^>]*/>', '<calcPr calcId="191028" fullCalcOnLoad="1"/>', wbx)
wr(f'{O}/xl/workbook.xml', wbx)
# tabSelected only on dashboard; tab colours on legacy sheets
LEG_GREY = set(order[order.index(TA) + 1 + len(retain_front):])
for s in sheets:
    x = rd(s['path'])
    x = re.sub(r' tabSelected="1"', '', x)
    if s['name'] in LEG_GREY:
        if re.search(r'<sheetPr[^>]*/>', x):
            x = re.sub(r'<sheetPr([^>]*)/>', r'<sheetPr\1><tabColor rgb="FFA6A6A6"/></sheetPr>', x, count=1)
        elif '<sheetPr' in x:
            if '<tabColor' in x: x = re.sub(r'<tabColor [^>]*/>', '<tabColor rgb="FFA6A6A6"/>', x, count=1)
            else: x = re.sub(r'(<sheetPr[^>]*>)', r'\1<tabColor rgb="FFA6A6A6"/>', x, count=1)
        else:
            x = re.sub(r'(<worksheet [^>]*>)', r'\1<sheetPr><tabColor rgb="FFA6A6A6"/></sheetPr>', x, count=1)
    wr(s['path'], x)
# calcChain removal
if os.path.exists(f'{O}/xl/calcChain.xml'):
    os.remove(f'{O}/xl/calcChain.xml')
    rels = re.sub(r'<Relationship [^>]*calcChain[^>]*/>', '', rels)
    ct = re.sub(r'<Override PartName="/xl/calcChain.xml"[^>]*/>', '', ct)
wr(f'{O}/xl/_rels/workbook.xml.rels', rels)
ct = ct.replace('</Types>', ''.join(overrides) + '</Types>')
wr(f'{O}/[Content_Types].xml', ct)
# app.xml: drop stale sheet title list
ap = rd(f'{O}/docProps/app.xml')
ap = re.sub(r'<HeadingPairs>.*?</HeadingPairs>', '', ap, flags=re.S); ap = re.sub(r'<TitlesOfParts>.*?</TitlesOfParts>', '', ap, flags=re.S)
wr(f'{O}/docProps/app.xml', ap)

# zip
if os.path.exists(OUT): os.remove(OUT)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    first = ['[Content_Types].xml']
    for root, _, files in os.walk(O):
        for f in files:
            p = os.path.join(root, f); a = os.path.relpath(p, O)
            if a not in first: pass
    z.write(os.path.join(O, '[Content_Types].xml'), '[Content_Types].xml')
    for root, _, files in os.walk(O):
        for f in files:
            p = os.path.join(root, f); a = os.path.relpath(p, O)
            if a != '[Content_Types].xml': z.write(p, a)
json.dump(dict(log=LOG, removed=removed, order=order), open('merge_log.json', 'w'), indent=1, default=str)
print('OK sheets', len(order), 'removed', len(removed), dict(LOG))
