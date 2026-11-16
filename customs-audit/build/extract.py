"""Extract workbook-specific configuration (country register, question master,
control mapping, action-plan anchors) from the ORIGINAL workbook -> config.json"""
import openpyxl, re, json, sys, collections
F = sys.argv[1]
wb = openpyxl.load_workbook(F, read_only=True, data_only=True)
names = wb.sheetnames

# ---------- question master (Config - Structure, merged cells filled down)
master = []
sc = sec = None
for r in wb['Config - Structure'].iter_rows(min_row=2, max_row=62, values_only=True):
    if r[0]: sc = ' '.join(str(r[0]).split())
    if r[1]: sec = ' '.join(str(r[1]).split())
    master.append(dict(q=r[2], scope=sc, section=sec, question=' '.join(str(r[3]).split())))

# ---------- control grouping (36 controls) from merges of matrix control column F
x = open(sys.argv[2]).read()   # sheet61.xml (matrix)
groups = [(int(a), int(b)) for a, b in re.findall(r'<mergeCell ref="F(\d+):F(\d+)"/>', x)]
row2ctrl = {}
anchors = []
r = 2
gmap = {a: b for a, b in groups}
while r <= 62:
    b = gmap.get(r, r)
    anchors.append((r, b))
    for k in range(r, b + 1): row2ctrl[k] = len(anchors) - 1
    r = b + 1
ctrl_rows = list(wb['3. Data-Assessments control'].iter_rows(min_row=3, max_row=38, values_only=True))
controls = []
for i, (a, b) in enumerate(anchors):
    cr = ctrl_rows[i]
    num = str(cr[2]).strip()
    nm = ' '.join(str(cr[3]).split())
    label = nm if num.lower().startswith(('6', '7')) and nm.lower().startswith(num[:1]) else f"{num} {nm}"
    controls.append(dict(idx=i + 1, num=num, name=nm, label=label, rows=[a, b], qs=list(range(a - 1, b))))
for m in master:
    m['control'] = controls[row2ctrl[m['q'] + 1]]['label']
    m['control_idx'] = row2ctrl[m['q'] + 1] + 1

# ---------- country register
tracker = {}
for rr in wb['5.Policy Tracker 2026'].iter_rows(min_row=6, max_row=60, values_only=True):
    if rr[2]: tracker[str(rr[2]).strip()] = rr
ctry_sheets = [n for n in names[names.index('Venezuela'):names.index('Mapping')] if 'Action Plan' not in n]
ap_sheets = [n for n in names[names.index('Venezuela'):names.index('Mapping')] if 'Action Plan' in n]
canon = {'Trinidad': 'Trinidad and Tobago'}
tracker_name = {'USA': 'United States', 'Trinidad': 'Trinidad and Tobago'}
t26 = {}   # names used in '1. Data-All Assessments 2026'
for rr in wb['1. Data-All Assessments 2026'].iter_rows(min_row=3, max_row=1954, values_only=True):
    t26.setdefault(rr[1], rr[0])
t26_names = list(t26)
alias26 = {'Cayman Islands': 'Cayman Island', 'French Guiana': 'French Guyana', 'Panama': 'Panamá',
           'Dominican Republic': 'Rep Dominicana', 'El Salvador': 'Salvador', 'Trinidad': 'Trinidad and Tobago',
           'British Virgin Islands': 'Virgin Islands (British)'}
matrix_hdr = [c for c in next(wb['1. Data-Control Country Matrix'].iter_rows(min_row=1, max_row=1, values_only=True))]
reg = []
for i, n in enumerate(ctry_sheets):
    rows = [list(v) + [None] * 12 for v in wb[n].iter_rows(min_row=1, max_row=62, values_only=True)]
    LV = {'UNDER CONTROL', 'MODERATE CONTROL', 'INSUFFICIENT CONTROL', 'N/A', 'BAJO CONTROL', 'CONTROL MODERADO', 'CONTROL INSUFICIENTE'}
    cnt = [sum(1 for v in rows[1:] if isinstance(v[j], str) and v[j].strip().upper() in LV) for j in range(12)]
    ci = max(range(12), key=lambda j: cnt[j])
    tr = tracker.get(tracker_name.get(n, n)) or tracker.get(canon.get(n, n))
    # action plan sheet for this country: same position (sheet right after)
    ap = names[names.index(n) + 1]
    assert 'Action Plan' in ap, (n, ap)
    hdr = [str(h or '') for h in rows[0]]
    reg.append(dict(sheet=n, name=canon.get(n, n), ap=ap, code=tr[3] if tr else None,
                    cluster=tr[1] if tr else None, rank2023=tr[4] if tr else None,
                    cl=ci, ans=ci - 2, ev=ci - 1, gap=ci + 1, header=hdr,
                    header_ok=('Control Level' in hdr[ci] or 'Nivel de Control' in hdr[ci]),
                    name26=alias26.get(n, n), matrix_col=None))
# matrix control column for each sheet (3rd col of triple whose header = country)
from openpyxl.utils import get_column_letter as gl
mh = {}
for j, h in enumerate(matrix_hdr):
    if h and j >= 3 and (j - 3) % 3 == 0: mh[h] = gl(j + 3)
mh_alias = {'French Guiana': 'French Guyana'}
for r_ in reg:
    r_['matrix_col'] = mh[mh_alias.get(r_['sheet'], r_['sheet'])]

# ---------- action plans: anchors and spans, column layout
apinfo = {}
wbf = openpyxl.load_workbook(F, data_only=True)  # full mode for merges (AP sheets only used)
for r_ in reg:
    ws = wbf[r_['ap']]
    hdr = [str(c.value or '') for c in ws[1]]
    shifted = ('Issue Category' not in hdr) or r_['ap'] == 'Nicaragua Action Plan'
    # Nicaragua: headers say Issue Category but data are shifted (no category column)
    if shifted:
        cols = dict(num='A', q='B', sec='C', issue='D', cat=None, action='E', who='F', when='G', status='H', comments=['I', 'J'])
    else:
        cols = dict(num='A', q='B', sec='C', issue='D', cat='E', action='F', who='G', when='H', status='I', comments=['J'])
    merged = {}
    for mr in ws.merged_cells.ranges:
        for rr in range(mr.min_row + 1, mr.max_row + 1):
            for cc in range(mr.min_col, mr.max_col + 1): merged[(rr, cc)] = mr.min_row
    last = 1
    for row in ws.iter_rows(min_row=2):
        if any(c.value not in (None, '') for c in row[:10]): last = row[0].row
    rows_used = []
    r = 2
    while r <= last:
        a = ws.cell(r, 1).value
        cont = merged.get((r, 1))
        anyval = any(ws.cell(r, c).value not in (None, '') for c in range(2, 6))
        if a not in (None, '') or (cont is None and anyval):
            # span end = max merged row of column A or B
            end = r
            for mr in ws.merged_cells.ranges:
                if mr.min_row == r and mr.min_col <= 2: end = max(end, mr.max_row)
            # also include following rows that are continuation (no A, no B, but text in action/comment)
            k = end + 1
            while k <= last and ws.cell(k, 1).value in (None, '') and ws.cell(k, 2).value in (None, '') and merged.get((k, 1)) is None \
                    and any(ws.cell(k, c).value not in (None, '') for c in range(3, 11)) and not ws.cell(k,4).value:
                end = k; k += 1
            rows_used.append([r, end])
            r = end + 1
        else:
            r += 1
    apinfo[r_['ap']] = dict(cols=cols, spans=rows_used, last=last, shifted=shifted, header=hdr)
json.dump(dict(master=master, controls=controls, reg=reg, apinfo=apinfo, names=names,
               tracker=[[str(v) if v is not None else None for v in t[:12]] for t in tracker.values()]),
          open('config.json', 'w'), indent=1, default=str)
print(len(master), len(controls), len(reg), sum(len(v['spans']) for v in apinfo.values()))
for k, v in apinfo.items(): print(k, v['spans'], v['shifted'])
for r_ in reg: print(r_['sheet'], r_['name'], r_['code'], r_['cluster'], 'CL=', gl(r_['cl'] + 1), r_['header_ok'], r_['matrix_col'], r_['name26'] in t26_names)
