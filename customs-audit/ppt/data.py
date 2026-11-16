import openpyxl,json,collections,pickle
cfg=json.load(open('build/config.json'))
F=openpyxl.load_workbook('Self-Assessment Matrix 2026 – FINAL IMPROVED.xlsx',read_only=True,data_only=True)
O=openpyxl.load_workbook('Self-Assessment_Matrix_2026___v1__DRAFT.xlsx',read_only=True,data_only=True)
d=pickle.load(open('/tmp/claude-0/cmp.pkl','rb')); MF,Q,cl=d['MF'],d['Q'],d['cl']
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
out['s10']=[[l]+share([Q[c][q] for c in Q for q in qctrl if qctrl[q]==l]) for l in labels]
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
    rows.sort(key=lambda r:(r[1]!='CAR',-r[2],-r[3],r[0]))
    sc_rows[s]=dict(controls=labs,rows=rows)
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
