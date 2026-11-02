"""Make the Sales/Orders app (app_v5/src) use THE shared engine bq_price.js (window.BQP).
Usage: python3 apply_app_patch.py SRC_DIR   (patches app.js + build.py in SRC_DIR; idempotent; asserts exact matches)"""
import sys,re,os
D=sys.argv[1].rstrip('/')+'/'
ENGINE=os.environ.get('BQP_FILE','/workspace/bq/hosting/build/bq_price.js')
a=open(D+'app.js',encoding='utf-8').read()
if 'BQP.calc' not in a:
    i=a.index('var PRICE={FEE:');j=a.index('\n',a.index('function postage(pc,w){'))
    old=a[i:j]
    for must in ('function band(w)','function multOf(sup)','function profitAt(a,amt,q)','function priceFor(a,f)'): assert must in old,must
    new=("/* THE shared engine bq_price.js (window.BQP) – same code as the Pricing tab and the Excel builder. */\n"
     "var BQP=window.BQP;if(!BQP)throw new Error('bq_price.js missing');\n"
     "var PRICE={FEE:BQP.FEE,ASHIAN:BQP.ASHIAN,OTHER:BQP.OTHER,COLLAB:0,OVER_P:BQP.OVER[0],OVER_LAB:BQP.OVER[1]};\n"
     "var BANDS=BQP.BANDS.map(function(b){return [b[0],b[2],b[1]];});\n"
     "function band(w){return BQP.band(w);}\n"
     "function multOf(sup){return BQP.multOf(sup);}\n"
     "/* a = Access record {cost, mult, post, collab?}; amt = selling amount for q units (q defaults to 1) */\n"
     "function profitAt(a,amt,q){var C=BQP.calc(a,amt,q);return {fee:C.fee,over:C.company,post:C.post,collab:C.collab,cost:C.cost,total:C.total,pr:C.pr,pc:C.pc};}\n"
     "/* lowest price that gives profit >= f x cost (f=0 -> break-even), rounded up to the penny */\n"
     "function priceFor(a,f){return BQP.priceFor(a,f);}\n"
     "function postage(pc,w){return BQP.postage(pc,w);}")
    a=a[:i]+new+a[j:]
    m=re.search(r"function floorOf\(k\)\{.*?\n.*?\}\;\}",a)
    assert m and 'no sales lately' in m.group(0),'floorOf not found'
    a=a[:m.start()]+"function floorOf(k){return BQP.floorOf(isChina(k),U30[k.i]||0,k.a.cost);}"+a[m.end():]
    # collab fee from Access (index 11 of the sku record; blank = 0)
    old_k="a={price:r[2],cost:r[3],pc:r[4],w:r[5],sup:sup,stock:r[8],mult:multOf(sup),post:postage(r[4],r[5])};"
    assert a.count(old_k)==1,'K record'
    a=a.replace(old_k,"a={price:r[2],cost:r[3],pc:r[4],w:r[5],sup:sup,stock:r[8],collab:r[11]==null?null:r[11],mult:multOf(sup),post:postage(r[4],r[5])};")
    i=a.index('window.__v5={');j=a.index('};',i)
    assert 'calcAt' not in a[i:j]
    a=a[:j]+',calcAt:calcAt,floorOf:floorOf,U30:U30,profitAt:profitAt'+a[j:]
    open(D+'app.js','w',encoding='utf-8').write(a); print('app.js patched')
else: print('app.js already uses BQP')
b=open(D+'build.py',encoding='utf-8').read()
if 'bq_price.js' not in b:
    o1="data=open('data.js',encoding='utf-8').read();"
    assert b.count(o1)==1
    b=b.replace(o1,"bqp=open(%r,encoding='utf-8').read(); assert '</script' not in bqp.lower()\n"%ENGINE+o1)
    o2="'<script>window.BQ_START=\"'+kind+'\";</script>"
    assert b.count(o2)==1,'BQ_START'
    b=b.replace(o2,"'<script>'+bqp+'</script>"+o2[1:])
    o3="clean_n(r.get('Free stock quantity')),'',1]"
    assert b.count(o3)==1,'SK record'
    b=b.replace(o3,"clean_n(r.get('Free stock quantity')),'',1,clean_n(r.get('Collab fee'))]")
    open(D+'build.py','w',encoding='utf-8').write(b); print('build.py patched')
else: print('build.py already injects bq_price.js')
