#!/usr/bin/env python3
"""Build tonight's B&Q pricing outputs from the newest Access B&QBB3 file (+ buy box run, + prices imported after it).
All price/profit decisions come from THE shared engine bq_price.js (run with node) – the same file the dashboard uses.
Outputs:  <OUTDIR>/B&Q Pricing <date>.xlsx  (Paste Here, Pricing, Pricing (values), B&Q Upload, Check postage, Notes)
          <OUTDIR>/B&Q Price Upload <date>.xlsx  (copy of BQ_price_template_MASTER.xlsx, only changed prices)
          optional --enc FILE : encrypted pricing.enc for the dashboard (BQE1, shared AUX salt)
          <WORK>/result.json (engine output, for the audit)
Never uploads or imports anything."""
import argparse, csv, datetime, glob, json, os, re, shutil, subprocess, sys
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.formatting.rule import FormulaRule
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import engine
TEMPLATE = '/workspace/bq/KEEP/pricing/BQ_price_template_MASTER.xlsx'
BBWORK = '/workspace/bq/hosting/buybox_work/'; REPO = '/workspace/bq/hosting/repo_B-Q/'
ap = argparse.ArgumentParser()
ap.add_argument('--access'); ap.add_argument('--out', default='/workspace/send/'); ap.add_argument('--date', default=datetime.date.today().isoformat())
ap.add_argument('--work', default=HERE + '/out/'); ap.add_argument('--enc'); ap.add_argument('--no-bb', action='store_true'); ap.add_argument('--bbfile')
ap.add_argument('--raw', default='/workspace/bq/hosting/build_out/raw_py.json', help='Sales/Orders raw json (30-day sales = Sales tab)'); ap.add_argument('--no-orders-sales', action='store_true')
ap.add_argument('--rows', type=int, default=10001, help='formula rows on the Pricing tab')
A = ap.parse_args(); os.makedirs(A.work, exist_ok=True); os.makedirs(A.out, exist_ok=True)
def engine_hdr():
    return json.loads(subprocess.run(['node', '-e', "process.stdout.write(JSON.stringify(Object.values(require('%s/bq_price.js').HDR)))" % HERE], capture_output=True, text=True, check=True).stdout)
def log(*m): print('[%s]' % datetime.datetime.now().strftime('%H:%M:%S'), *m, flush=True)

# ---------- inputs ----------
acc = A.access or max(glob.glob('/workspace/bq/KEEP/pricing/Access_*.xlsx'), key=lambda p: (re.findall(r'\d{4}-\d{2}-\d{2}', p) or [''])[0] + '%015.0f' % os.path.getmtime(p))
m = re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(acc)); acc_date = m.group(1) if m else datetime.date.fromtimestamp(os.path.getmtime(acc)).isoformat()
wb = openpyxl.load_workbook(acc, read_only=True, data_only=True)
ws = wb['B&QBB3'] if 'B&QBB3' in wb.sheetnames else wb.worksheets[0]
def jv(v):
    if isinstance(v, (datetime.datetime, datetime.date)): return v.isoformat()
    return v
aoa = [[jv(v) for v in r] for r in ws.iter_rows(values_only=True)]
while aoa and all(v in (None, '') for v in aoa[-1]): aoa.pop()
log('Access', acc, len(aoa) - 1, 'rows, sheet', ws.title)

# prices he imported AFTER this Access export (29 Oct files) – only if the Access file is not newer
imported = {}; imp_label = ''
IMPORTS = [('/workspace/bq/KEEP/pricing/imported_prices_2026-10-29.csv', '2026-10-29'), ('/workspace/bq/out_2026-10-30/B&Q Price Upload 2026-10-30.xlsx', '2026-10-29')]
for p, d in IMPORTS:
    if not os.path.exists(p) or acc_date > d: continue
    if p.endswith('.csv'):
        for r in csv.DictReader(open(p)): imported[r['offer-sku'].strip()] = float(r['price'])
    else:
        for r in openpyxl.load_workbook(p, read_only=True)['Data'].iter_rows(min_row=3, values_only=True):
            if r[0]: imported[str(r[0]).strip()] = float(r[1])
    imp_label = 'Imported 29 Oct'
log('imported prices applied:', len(imported))

# buy box run (newest of: finished run file, published buybox.enc, today's checkpoint)
bb_rows = []; bb_meta = {}
def load_enc(p):
    sys.path.insert(0, '/workspace/bq/hosting/build'); os.environ.setdefault('BQ_PASSWORD_FILE', '/workspace/bq/KEEP/secrets/dashboard_password.txt')
    import bqcrypt; return json.loads(bqcrypt.decrypt(open(p, 'rb').read()))
if not A.no_bb:
    cands = []
    for p in ([A.bbfile] if A.bbfile else [BBWORK + 'buybox.enc', REPO + 'buybox.enc'] + sorted(glob.glob(BBWORK + 'checkpoint_*.jsonl'))):
        if p and os.path.exists(p): cands.append((os.path.getmtime(p), p))
    if cands:
        _, p = max(cands)
        if p.endswith('.jsonl'):
            rows = [json.loads(l) for l in open(p) if l.strip()]; bb_meta = {'status': 'partial (run still going)', 'file': os.path.basename(p)}
        else:
            d = load_enc(p); rows = d['rows']; bb_meta = dict(d.get('run', {})); bb_meta['file'] = os.path.basename(p)
        bb_rows = [{'ean': r.get('ean'), 'seller': r.get('seller') or '', 'price': r.get('price'), 'fetched': r.get('fetched', '')} for r in rows]
log('buy box run rows:', len(bb_rows), bb_meta.get('status'), bb_meta.get('file'))

# 30-day sales: the SAME numbers as the Sales tab (newest B&Q orders export), if that data is not older than the Access file
sales30 = None; sales_label = ''; sales_last = ''
if not A.no_orders_sales and A.raw and os.path.exists(A.raw):
    S = engine.run({'op': 'sales30', 'raw': json.load(open(A.raw))})
    if S['last'] and S['last'] >= acc_date:
        sales30 = S['map']; sales_last = S['last']; sales_label = 'B&Q orders to %s' % S['last']
log('30-day sales:', sales_label or 'Access B n Q 30Days', len(sales30 or {}), 'SKUs sold')
OPT = {}  # defaults: 100+ raises held, check-postage rows off the upload
R = engine.from_access(aoa, {'bbRows': bb_rows, 'accessDate': acc_date, 'imported': imported, 'importedLabel': imp_label, 'sales30': sales30, 'salesLabel': sales_label}, OPT)
prep, res = R['prep'], R['res']; rows = res['rows']; bb_label = prep.get('bbLabel', ''); bb_meta['used_rows'] = prep['counts']['bbOverlay']
log('engine: rows', len(rows), 'dups', res['dups'], 'no sku', res['nosku'], 'overlay', prep['counts'])
json.dump({'access': os.path.basename(acc), 'access_date': acc_date, 'bb_meta': bb_meta, 'bb_label': bb_label, 'imported': len(imported), 'prep_counts': prep['counts'],
           'dups': res['dups'], 'nosku': res['nosku'], 'rows': rows}, open(A.work + 'result.json', 'w'), default=str)

# ---------- Excel: four tabs (+ Check postage, Notes) ----------
P_COLS = ['Variant ID', 'Variant code', 'Variant description', 'Total 30Days Sales', 'Free stock quantity', 'Main supplier name', 'Manufacturers part number', 'B&Q_INV.price', 'B&Q_BB.price', 'seller',
          'Estimated cost', 'product-id', 'product_url', 'Postage Cost', 'Weight', 'Reviews', 'sku', 'B n Q 30Days', 'Collab fee', 'Price source', 'Buy box source', 'Sales source', 'Access B n Q 30Days (not used)']
hf = PatternFill('solid', fgColor='1F3864'); gh = PatternFill('solid', start_color='FF548235', end_color='FF548235')
gf = PatternFill('solid', start_color='FFE2EFDA', end_color='FFE2EFDA'); yf = PatternFill('solid', fgColor='FFF2CC')
bf = PatternFill('solid', start_color='FFDDEBF7', end_color='FFDDEBF7'); bh = PatternFill('solid', start_color='FF2F75B5', end_color='FF2F75B5')
red = PatternFill(fill_type='solid', start_color='FFFFC7CE', end_color='FFFFC7CE', bgColor='FFFFC7CE')
cols = ['Selling SKU', 'Description', 'EAN', 'Estimated cost', 'Current selling price', 'Total profit £', 'Total profit %', 'Buy box winner price', 'Buy box winner name', 'Buy box winning price',
        'Postage (type here)', 'Your price (type here)', 'Projected profit £', 'Projected profit %', 'Floor price', 'Floor % used', 'Highest price (80%, UK only)', 'B&Q 30-day sales', 'Rule applied', 'Product URL']
widths = [18, 50, 16, 11, 12, 12, 11, 12, 22, 14, 11, 13, 12, 12, 12, 10, 13, 11, 34, 40]
# hidden: U mult, V cost*mult+collab, W total cost (excl. 15% fee), X collab, Y final price, Z upload no., AA raw decision, AB/AC header lookup (rows 1-13 only)
# visible extra: AD Check postage, AE Duplicate SKU, AF 100+ raise price (hidden helper)
INPUTS = 'ABCDEHIKRTUX'
def calc(r, w):
    bb1 = f'ROUND(ROUND(H{r}-0.01,6),2)'; win = f'ISNUMBER(SEARCH("Diva Package",I{r}))'
    exact = lambda p: f'ROUND({p}*0.85-W{r},6)'
    return {
        'V': w(f'D{r}*U{r}+X{r}'),
        'W': w(f'IF(AND(ISNUMBER(K{r}),ISNUMBER(D{r})),IF(D{r}>0,V{r}+K{r},"NEED YOUR REVIEW"),"NEED YOUR REVIEW")'),
        'P': w(f'IF(NOT(ISNUMBER(W{r})),"NEED YOUR REVIEW",IF(U{r}=2,1,IF(R{r}>=1,0.5,IF(D{r}<1,0.8,IF(D{r}<5,0.7,IF(D{r}<10,0.6,0.5))))))'),
        'O': w(f'IF(ISNUMBER(W{r}),ROUNDUP(ROUND((W{r}+D{r}*P{r})/0.85,6),2),"NEED YOUR REVIEW")'),
        'Q': w(f'IF(ISNUMBER(W{r}),IF(U{r}=2,"No ceiling",ROUNDUP(ROUND((W{r}+D{r}*0.8)/0.85,6),2)),"NEED YOUR REVIEW")'),
        'F': w(f'IF(ISNUMBER(W{r}),ROUND({exact("E"+str(r))},2),"NEED YOUR REVIEW")'),
        'G': w(f'IF(ISNUMBER(W{r}),{exact("E"+str(r))}/D{r},"NEED YOUR REVIEW")'),
        'AF': w(f'IF(AND(ISNUMBER(W{r}),{win},U{r}=1.5,R{r}>=100),IF(G{r}<0.8-0.000000001,ROUNDUP(ROUND((W{r}+D{r}*MIN(0.8,G{r}+0.1))/0.85,6),2),""),"")'),
        'AA': w(f'IF(NOT(ISNUMBER(W{r})),"NEED YOUR REVIEW",IF({win},IF(AND(ISNUMBER(AF{r}),AF{r}>E{r}),AF{r},"Already winning"),IF(U{r}=2,IF(NOT(ISNUMBER(H{r})),O{r},IF({bb1}<O{r},"Margin too low",IF(R{r}<1,O{r},{bb1}))),IF(R{r}>=1,IF(NOT(ISNUMBER(H{r})),"No competitor – kept",IF({bb1}<O{r},"Margin too low",MIN(Q{r},{bb1}))),IF(NOT(ISNUMBER(H{r})),Q{r},IF({bb1}<O{r},"Margin too low",MIN(Q{r},{bb1})))))))'),
        'S': w(f'IF(NOT(ISNUMBER(W{r})),"NEED YOUR REVIEW – "&IF(AND(ISNUMBER(D{r}),D{r}>0),"no postage or weight","no cost"),IF({win},IF(AND(ISNUMBER(AF{r}),AF{r}>E{r}),"1 Winning, 100+ sales – raise 10% (max 80%)","1 Already winning – kept"),IF(U{r}=2,IF(NOT(ISNUMBER(H{r})),"4 China – no competitor, 100%",IF({bb1}<O{r},"4 China – margin too low, kept",IF(R{r}<1,"4 China – 0 sales, 100%","4 China – 1p under BB"))),IF(R{r}>=1,IF(NOT(ISNUMBER(H{r})),"2 UK sold – no competitor, kept",IF({bb1}<O{r},"2 UK sold – margin too low, kept",IF({bb1}>Q{r},"2 UK sold – capped at 80%","2 UK sold – 1p under BB"))),IF(NOT(ISNUMBER(H{r})),"3 UK 0 sales – no competitor, 80%",IF({bb1}<O{r},"3 UK 0 sales – margin too low, kept",IF({bb1}>Q{r},"3 UK 0 sales – capped at 80%","3 UK 0 sales – 1p under BB")))))))'),
        'J': w(f'IF(NOT(ISNUMBER(W{r})),"NEED YOUR REVIEW",IF(ISNUMBER(L{r}),IF(ROUND(L{r},2)=ROUND(E{r},2),"Your price",IF(ROUND({exact("L"+str(r))},2)<=0,"Loss – blocked",IF({exact("L"+str(r))}/D{r}<0.5-0.000000001,"Under 50% – blocked","Your price"))),IF(ISNUMBER(AA{r}),IF(ROUND({exact("AA"+str(r))},2)<=0,"Loss – blocked",IF(ROUND(AA{r},2)>ROUND(E{r},2),IF(ISNUMBER(AF{r}),"Raise 10% – held for review","Raise – held for review"),AA{r})),AA{r})))'),
        'Y': w(f'IF(ISNUMBER(L{r}),L{r},IF(ISNUMBER(J{r}),J{r},E{r}))'),
        'M': w(f'IF(ISNUMBER(W{r}),ROUND({exact("Y"+str(r))},2),"NEED YOUR REVIEW")'),
        'N': w(f'IF(ISNUMBER(W{r}),{exact("Y"+str(r))}/D{r},"NEED YOUR REVIEW")'),
        'Z': f'=IFERROR(IF(AND(ISNUMBER(W{r}),ROUND(Y{r},2)<>ROUND(E{r},2),ISNUMBER(M{r}),M{r}>0,N{r}>=0.5-0.000000001,AD{r}="",AE{r}<>"Duplicate SKU"),MAX($Z$1:Z{r-1})+1,""),"")'}
L_ = openpyxl.utils.get_column_letter
def style(ws, last):
    for i, (c, wd) in enumerate(zip(cols, widths)):
        L = L_(i + 1); h = ws[f'{L}1']; h.value = c; h.fill = hf; h.font = Font(bold=True, color='FFFFFF'); h.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
        ws.column_dimensions[L].width = wd
    for c, t, wd in (('AD', 'Check postage', 22), ('AE', 'Duplicate SKU', 13)):
        ws[f'{c}1'] = t; ws[f'{c}1'].fill = hf; ws[f'{c}1'].font = Font(bold=True, color='FFFFFF'); ws[f'{c}1'].alignment = Alignment(wrap_text=True, vertical='center', horizontal='center'); ws.column_dimensions[c].width = wd
    for c in 'EFG': ws[f'{c}1'].fill = gh
    ws['K1'].fill = bh; ws['L1'].fill = PatternFill('solid', fgColor='BF8F00')
    ws.row_dimensions[1].height = 34; ws['Z1'] = 0
    for r in range(2, last + 1):
        for c in 'DEFHJKLMOQ': ws[f'{c}{r}'].number_format = '£#,##0.00'
        for c in 'GNP': ws[f'{c}{r}'].number_format = '0%'
        ws[f'C{r}'].number_format = '@'
        for c in 'EFG': ws[f'{c}{r}'].fill = gf
        ws[f'K{r}'].fill = bf; ws[f'L{r}'].fill = yf
    for c in ['U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AF']: ws.column_dimensions[c].hidden = True
    ws.freeze_panes = 'C2'; ws.auto_filter.ref = f'A1:AE{last}'
    ws.conditional_formatting.add(f'A2:T{last}', FormulaRule(formula=['AND(ISNUMBER($F2),$F2<=0)'], fill=red))
    ws.conditional_formatting.add(f'AD2:AD{last}', FormulaRule(formula=['LEN($AD2)>0'], fill=red))
def build(stage, TMP):
    wb = openpyxl.Workbook(); P = wb.active; P.title = 'Paste Here'
    hdr = [str(h).strip() if h is not None else '' for h in aoa[0]]
    P.append(P_COLS)
    pr = {id(x): x for x in prep['rows']}
    # Paste Here = Access rows with the price / buy box overlays applied (sources in the last 2 columns)
    k = 0
    for row in aoa[1:]:
        if all(v in (None, '') for v in row): continue
        x = prep['rows'][k]; k += 1
        d = dict(zip(hdr, row))
        d['B&Q_INV.price'] = x['price']; d['seller'] = x['seller']
        d['B&Q_BB.price'] = ('£%.2f' % x['bb']) if isinstance(x['bb'], (int, float)) else x['bb']
        d['Price source'] = x['srcPrice']; d['Buy box source'] = x['srcBB']
        if x.get('srcSales'): d['Access B n Q 30Days (not used)'] = d.get('B n Q 30Days'); d['B n Q 30Days'] = x['sales']; d['Sales source'] = x['srcSales']
        else: d['Sales source'] = 'Access B n Q 30Days'
        P.append([d.get(c) for c in P_COLS])
    for c in P[1]: c.font = Font(bold=True)
    Pr = wb.create_sheet('Pricing')
    need = {'sku': 1, 'Variant description': 2, 'Estimated cost': 3, 'B&Q_INV.price': 4, 'B&Q_BB.price': 5, 'seller': 6, 'Main supplier name': 7, 'Weight': 8, 'Postage Cost': 9, 'B n Q 30Days': 10, 'product-id': 11, 'product_url': 12, 'Collab fee': 13}
    for name, i in need.items(): Pr[f'AC{i}'] = f'=MATCH("{name}",\'Paste Here\'!$1:$1,0)'; Pr[f'AB{i}'] = name
    G = lambda c: f"INDEX('Paste Here'!$A:$AZ,ROW(),$AC${need[c]})"
    V = lambda c: f'IFERROR(VALUE(SUBSTITUTE({G(c)}&"","£","")),0)'
    Vb = lambda c: f'IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE({G(c)}&"","£",""),",","")),"")'
    for r in range(2, A.rows + 1):
        w = lambda x: f'=IF($A{r}="","",{x})'
        f = {'A': f'=IFERROR(IF(TRIM({G("sku")}&"")="","",TRIM({G("sku")}&"")),"")', 'B': w(f'{G("Variant description")}&""'), 'C': w(f'{G("product-id")}&""'),
             'D': w(f'IF(ISNUMBER({Vb("Estimated cost")}),{Vb("Estimated cost")},"")'), 'E': w(V("B&Q_INV.price")),
             'H': w(f'IF({V("B&Q_BB.price")}>0,{V("B&Q_BB.price")},"No competitor")'), 'I': w(f'IF(AND({G("seller")}&""="",NOT({V("B&Q_BB.price")}>0)),"No competitor",{G("seller")}&"")'),
             'R': w(V("B n Q 30Days")), 'T': w(f'{G("product_url")}&""'),
             'U': w(f'IF(ISNUMBER(SEARCH("ashian",{G("Main supplier name")}&"")),2,1.5)'), 'X': w(V("Collab fee")),
             'AD': w(f'IF(OR(IFERROR(--LEFT(B{r},SEARCH("x",B{r})-1)>1,FALSE),{V("Weight")}>30000),"Check postage","")'),
             'AE': w(f'IF(COUNTIF($A$2:A{r},A{r})>1,"Duplicate SKU","")')}
        wt = V("Weight"); pc = V("Postage Cost")
        f['K'] = w(f'IF({pc}>0,{pc},IF({wt}<=0,"NEED YOUR REVIEW",IF({wt}<=2000,1.75,IF({wt}<=15200,2.3,IF({wt}<=20000,8,IF({wt}<=25000,9,IF({wt}<=30000,10.5,15)))))))')
        f.update(calc(r, w))
        for kk, v in f.items(): Pr[f'{kk}{r}'] = v
    style(Pr, A.rows)
    T = wb.create_sheet('Pricing (values)'); U = wb.create_sheet('B&Q Upload')
    if stage == 2:
        # values = the engine's inputs (same as the Pricing tab reads), formulas = the same maths
        for i, x in enumerate(rows):
            r = i + 2
            vals = {'A': x['sku'], 'B': x['title'], 'C': x['ean'], 'D': x['cost'] if x['cost'] is not None else '', 'E': x['price'], 'H': x['bb'] if x['bb'] is not None else 'No competitor',
                    'I': x['seller'], 'K': x['post'] if x['post'] is not None else 'NEED YOUR REVIEW', 'R': x['sales'], 'T': x['url'], 'U': x['mult'], 'X': x['collab'],
                    'AD': 'Check postage: ' + x['check'] if x['check'] else '', 'AE': 'Duplicate SKU' if x.get('dup') else ''}
            for kk, v in vals.items(): T[f'{kk}{r}'] = v
            for kk, v in calc(r, lambda q: '=' + q).items(): T[f'{kk}{r}'] = v
        last = len(rows) + 1; style(T, last)
    U.append(['Offer SKU', 'Offer price', 'Discount price', 'Discount start date', 'Discount end date'])
    U.append(['offer-sku', 'price', 'discount-price', 'discount-start-date', 'discount-end-date'])
    TN = "'Pricing (values)'"
    for i in range(1, len(rows) + 1):
        U[f'A{i+2}'] = f'=IFERROR(INDEX({TN}!$A:$A,MATCH({i},{TN}!$Z:$Z,0)),"")'
        U[f'B{i+2}'] = f'=IFERROR(ROUND(INDEX({TN}!$Y:$Y,MATCH({i},{TN}!$Z:$Z,0)),2),"")'
    for c in list(U[1]) + list(U[2]): c.font = Font(bold=True)
    U.column_dimensions['A'].width = 20
    if stage == 2:
        C = wb.create_sheet('Check postage'); C.append(['Selling SKU', 'Description', 'Weight (g)', 'Postage used', 'Why', 'Rule price (not uploaded until checked)'])
        for x in rows:
            if x['check']: C.append([x['sku'], x['title'], next((rr[hdr.index('Weight')] for rr in [None] if False), None) if False else None, x['post'], x['check'], x['newp']])
        N = wb.create_sheet('Notes')
        for t in NOTES: N.append([t])
        N.column_dimensions['A'].width = 150
    wb.active = 2
    return wb
weights = {}
hdr0 = [str(h).strip() if h is not None else '' for h in aoa[0]]
up = [x for x in rows if x['upload']]
NOTES = [
 'B&Q Pricing %s – built %s UK from %s%s.' % (A.date, datetime.datetime.now().strftime('%d %b %Y %H:%M'), os.path.basename(acc), (' + ' + bb_label) if bb_label else ''),
 'One shared engine (bq_price.js) makes every number here, on the dashboard Pricing tab and on Sales/Orders. Excel formulas repeat the same maths so you can change Your price / Postage.',
 'Total cost = cost + company cost (Ashian Homeware: 1 x cost, others 0.5 x cost) + 15%% of price + postage + collab fee (blank = 0).  Profit = price − total cost.  Profit %% = profit ÷ estimated cost.',
 'Postage = Access Postage Cost if filled, else weight: up to 2000g £1.75, 15200g £2.30, 20000g £8, 25000g £9, 30000g £10.50, above £15. Blank weight and postage = NEED YOUR REVIEW.',
 'Rules: 1 Winning the buy box – keep (UK with 100+ B&Q 30-day sales: a +10%% step up to 80%% is shown but HELD for review). 2 UK sold: 1p under buy box, floor 50%%, max 80%%. 3 UK no sales: floor by cost (<£1 80%%, <£5 70%%, <£10 60%%, else 50%%), max 80%%. 4 China (Ashian): 1p under buy box, floor 100%%.',
 'Buy box 1p under is below the floor = "Margin too low" – price kept, never raised to the floor. A rule price above the current price = "Raise – held for review" (not in the upload).',
 'Safety: a changed price must have profit above £0 AND at least 50%% profit on cost, or it is blocked. Check postage rows (multi-pack or over 30kg) and duplicate SKUs are NOT in the upload until checked.',
 'Current price: %s. Buy box: %s.' % ('Access B&Q_INV.price, replaced by the price you imported on 29 Oct (%d SKUs) and by our live price on B&Q where we win the buy box (%d SKUs)' % (prep['counts']['importedOverlay'], prep['counts']['livePrice']), ('the buy box run (%d SKUs), else Access' % prep['counts']['bbOverlay']) if bb_label else 'Access'),
 '30-day sales (floor and 100+ rule): %s.' % (('B&Q orders up to %s – the same numbers as the Sales tab (%d SKUs sold); Access B n Q 30Days is kept in Paste Here as "not used"' % (sales_last, len(sales30))) if sales30 is not None else 'Access B n Q 30Days'),
 'Upload: %d SKUs change price (tab B&Q Upload and the separate B&Q Price Upload file). Nothing was imported to B&Q – you import it yourself.' % len(up),
]
TMP = A.work + 'xl_tmp'; shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
build(1, TMP)  # (stage 1 not needed – values come from the engine; kept for structure parity)
wb2 = build(2, TMP)
# fill Check postage weights properly
C = wb2['Check postage']; wi = hdr0.index('Weight') if 'Weight' in hdr0 else None
wmap = {}
for row in aoa[1:]:
    s = row[hdr0.index('sku')]
    if s is not None and str(s).strip() not in wmap and wi is not None: wmap[str(s).strip()] = row[wi]
for r in range(2, C.max_row + 1): C[f'C{r}'] = wmap.get(C[f'A{r}'].value)
pricing_path = os.path.join(A.out, 'B&Q Pricing %s.xlsx' % A.date)
raw_path = os.path.join(TMP, 'formulas.xlsx'); wb2.save(raw_path)
subprocess.run(f'cd "{TMP}" && rm -rf o && timeout 900 soffice --headless --calc --convert-to xlsx --outdir o formulas.xlsx >/dev/null 2>&1', shell=True, check=True)
shutil.copy(os.path.join(TMP, 'o', 'formulas.xlsx'), pricing_path)
log('saved', pricing_path, '(LibreOffice-recalculated, formulas kept)')
# ---------- the B&Q upload file (template copy) ----------
up_path = os.path.join(A.out, 'B&Q Price Upload %s.xlsx' % A.date)
shutil.copy(TEMPLATE, up_path); u = openpyxl.load_workbook(up_path); D = u['Data']
assert [c.value for c in D[2]][:5] == ['offer-sku', 'price', 'discount-price', 'discount-start-date', 'discount-end-date'], 'template changed'
for r in range(3, D.max_row + 1):
    for c in range(1, 6): D.cell(r, c).value = None
for i, x in enumerate(up):
    D.cell(i + 3, 1).value = x['sku']; D.cell(i + 3, 2).value = round(x['finalp'], 2)
u.save(up_path); log('saved', up_path, len(up), 'rows')
if A.enc:
    sys.path.insert(0, '/workspace/bq/hosting/build'); os.environ.setdefault('BQ_PASSWORD_FILE', '/workspace/bq/KEEP/secrets/dashboard_password.txt'); import bqcrypt
    names = [h for h in engine_hdr() if h in hdr0]; ix = [hdr0.index(h) for h in names]
    tw = openpyxl.load_workbook(TEMPLATE)
    tpl = {n: [[c.value for c in r] for r in tw[n].iter_rows()] for n in tw.sheetnames}
    tpl['Data'] = tpl['Data'][:2]
    doc = {'meta': {'created': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'access': os.path.basename(acc), 'access_date': acc_date,
                    'imported_label': imp_label, 'sales_label': sales_label, 'sales_last': sales_last, 'imported': len(imported), 'engine': 'bq_price v1', 'built_with_bb': bb_label, 'upload_rows_at_build': len(up)},
           'aoa': [names] + [[jv(r[k]) if k < len(r) else None for k in ix] for r in aoa[1:]], 'imported': imported, 'sales30': sales30, 'template': tpl}
    open(A.enc, 'wb').write(bqcrypt.encrypt(json.dumps(doc, separators=(',', ':'), default=str).encode('utf-8'))); log('saved', A.enc)
print(json.dumps({'pricing': pricing_path, 'upload': up_path, 'upload_rows': len(up)}))
