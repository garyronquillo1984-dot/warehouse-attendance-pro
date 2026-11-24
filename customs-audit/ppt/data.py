import openpyxl,json,collections,pickle
cfg=json.load(open('build/config.json'))
F=openpyxl.load_workbook('Self-Assessment Matrix 2026 – FINAL IMPROVED.xlsx',read_only=True,data_only=True)
O=openpyxl.load_workbook('Self-Assessment_Matrix_2026___v1__DRAFT.xlsx',read_only=True,data_only=True)
d=pickle.load(open('/tmp/claude-0/cmp.pkl','rb')); cl=d['cl']
# read answers and corrected matrix from the LATEST improved workbook (country forms now all 8 columns)
Q={}
for c in cfg['reg']:
    Q[c['name']]={r[0]:str(r[c['cl']]).strip().upper() for r in F[c['sheet']].iter_rows(min_row=2,max_row=62,values_only=True)}
mv={}
for row in F['1. Data-Control Country Matrix'].iter_rows(min_row=1,max_row=62):
    for c_ in row:
        if hasattr(c_,'coordinate') and c_.value is not None: mv[c_.coordinate]=c_.value
MF={c['name']:{ct['label']:str(mv.get(f"{c['matrix_col']}{ct['rows'][0]}",'')).strip() for ct in cfg['controls']} for c in cfg['reg']}
L=['INSUFFICIENT CONTROL','MODERATE CONTROL','UNDER CONTROL','N/A']
def share(v):
    c=collections.Counter(v); n=len(v); return [round(c[l]/n,4) for l in L]
labels=[c['label'] for c in cfg['controls']]
cscope={c['label']:[m['scope'] for m in cfg['master'] if m['q']==c['qs'][0]][0] for c in cfg['controls']}
qctrl={m['q']:cfg['controls'][m['control_idx']-1]['label'] for m in cfg['master']}
qscope={m['q']:m['scope'] for m in cfg['master']}
scopes=list(dict.fromkeys(qscope.values()))
out={}
out['s4']=[[s]+share([Q[c][q] for c in Q for q in qscope if qscope[q]==s]) for s in scopes]
out['s5']=sorted([[c]+share(list(MF[c].values())) for c in MF],key=lambda r:(-r[1],-r[2],-r[3]))
out['matrix']={c:[MF[c][l] for l in labels] for c in MF}
out['labels']=labels
out['matrix_orig']={c:[d['MO'][c][l] for l in labels] for c in d['MO']}
out['s10']=[[str(r[0])]+[float(x or 0) for x in r[1:5]] for r in F['4. Customs Process Controls'].iter_rows(min_row=80,max_row=115,max_col=5,values_only=True)]
am=[]
for r in F['4.Final-AM Risk Assessment'].iter_rows(min_row=3,max_row=38,max_col=13,values_only=True):
    am.append([' '.join(str(r[0]).split()),r[1],r[3],r[5],r[7],r[8],r[9],r[11],r[12]])
out['s11']=sorted(am,key=lambda x:(x[7],x[0]))
sc=[[r[1],r[13],r[15]] for r in F['02 – Country Ranking'].iter_rows(min_row=6,max_row=37,values_only=True)]
out['s13']=sorted(sc,key=lambda x:x[1])
clus=collections.defaultdict(list)
for c in MF: clus[cl[c]]+=list(MF[c].values())
out['s15']=[[k]+share(clus[k]) for k in ['CAR','CSA','Canada','Brazil','Mexico','USA']]
out['cluster']=cl
sc_rows={}
for s in scopes:
    labs=[l for l in labels if cscope[l]==s]; rows=[]
    for c in MF:
        v=[MF[c][l] for l in labs]; sh=share(v)
        if sh[0] or sh[1]: rows.append([c,cl[c]]+sh)
    CO={'CAR':1,'CSA':2,'Canada':3,'Mexico':4,'USA':5,'Brazil':6}
    rows.sort(key=lambda r:(CO.get(r[1],7),-r[2],-r[3],r[0]))
    sc_rows[s]=dict(controls=labs,rows=rows)
# F28: slides 17-21 read the formula tables of the scope sheets (same order); cross-check with the matrix
SEC={'1. About the DHL Express Global Customs Compliance Policy':('1. About the DHL Express Global',9),'2. Customs Awareness & Risk Management':('2. Customs Awareness & Risk Man',9),
     '3. Regulatory Supervision':('3. Regulatory Supervision',8),'4. Customs Process Controls':('4. Customs Process Controls',8),'5. Customs Representation':('5. Customs Representation',8)}
for s,(sh,H) in SEC.items():
    xr=[]
    for r in F[sh].iter_rows(min_row=H+1,max_row=H+32,max_col=6,values_only=True):
        if r[0]: xr.append([r[0],r[5]]+[round(float(v or 0),4) for v in r[1:5]])
    assert [[a[0]]+a[2:] for a in xr]==[[b[0]]+b[2:] for b in sc_rows[s]['rows']], (s,xr[:3],sc_rows[s]['rows'][:3])
    sc_rows[s]['rows']=xr; sc_rows[s]['excel']=f"'{sh}'!A{H}:F{H+32}"
out['scope_tables']=sc_rows
# key countries question level per control
kc={}
for l in labels:
    qs=[q for q in qctrl if qctrl[q]==l]
    kc[l]=dict(ic=[c for c in Q if any(Q[c][q]=='INSUFFICIENT CONTROL' for q in qs)],
               mc=[c for c in Q if not any(Q[c][q]=='INSUFFICIENT CONTROL' for q in qs) and any(Q[c][q]=='MODERATE CONTROL' for q in qs)])
out['keyc']=kc
qc={c:collections.Counter(Q[c].values()) for c in Q}
out['s9_ic']=sorted([[c,qc[c]['INSUFFICIENT CONTROL']] for c in Q if qc[c]['INSUFFICIENT CONTROL']>=3],key=lambda x:-x[1])
out['s9_mc']=sorted([[c,qc[c]['MODERATE CONTROL']] for c in Q if qc[c]['MODERATE CONTROL']>=5],key=lambda x:-x[1])
ra=[[r[0],r[1],r[2]] for r in O['Regional Actions Draft'].iter_rows(min_row=1,max_row=8,max_col=3,values_only=True)]
out['rad']=ra
json.dump(out,open('ppt/data.json','w'),indent=1,ensure_ascii=False,default=str)
print(out['s4'][:2], out['s9_ic'], out['s9_mc'], out['s13'][:4], out['s15'])
