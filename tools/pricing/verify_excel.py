#!/usr/bin/env python3
"""Check every row: the Excel formulas (recalculated by LibreOffice) give the same answers as the shared engine.
Also independent audit of the upload file (own Python maths, not the engine)."""
import json, sys, openpyxl, collections
pricing, upload, result = sys.argv[1:4]
R = json.load(open(result))['rows']
wb = openpyxl.load_workbook(pricing, data_only=True)
bad = collections.Counter(); ex = []
def eq(a, b, tol=0.005 + 1e-9):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool): return abs(a - b) <= tol
    return (a if a not in (None, '') else '') == (b if b not in (None, '') else '')
def chk(tab, r, f, a, b, tol=0.005 + 1e-9):
    if not eq(a, b, tol): bad[(tab, f)] += 1; ex.append((tab, r, f, a, b)) if len(ex) < 40 else None
def compare(ws, tab, rows):
    for i, x in enumerate(rows):
        r = i + 2; g = lambda c: ws[f'{c}{r}'].value
        chk(tab, r, 'A sku', g('A'), x['sku'])
        if x['status'] == 'NEED YOUR REVIEW':
            chk(tab, r, 'J status', g('J'), 'NEED YOUR REVIEW'); chk(tab, r, 'S rule', g('S'), x['rule']); continue
        chk(tab, r, 'K postage', g('K'), x['post']); chk(tab, r, 'E price', g('E'), x['price'])
        chk(tab, r, 'F profit', g('F'), x['profit']); chk(tab, r, 'G profit%', g('G'), x['pc'], 1e-6)
        chk(tab, r, 'O floor', g('O'), x['floor']); chk(tab, r, 'P floor%', g('P'), x['floorPct'], 1e-9)
        chk(tab, r, 'Q ceiling', g('Q'), x['ceil'] if x['ceil'] is not None else 'No ceiling')
        chk(tab, r, 'S rule', g('S'), x['rule']); chk(tab, r, 'J status', g('J'), x['status'])
        chk(tab, r, 'Y final', g('Y'), x['finalp']); chk(tab, r, 'M proj profit', g('M'), x['fprofit']); chk(tab, r, 'N proj %', g('N'), x['fpc'], 1e-6)
        chk(tab, r, 'Z upload?', isinstance(g('Z'), (int, float)) and g('Z') > 0, x['upload'])
        chk(tab, r, 'AD check', bool(g('AD')), bool(x['check'])); chk(tab, r, 'AE dup', g('AE') == 'Duplicate SKU', bool(x.get('dup')))
compare(wb['Pricing (values)'], 'values', R)
# live formula tab reads Paste Here directly (prep rows include every row, same order)
ws = wb['Pricing']; nrows = sum(1 for _ in R) + json.load(open(result))['nosku']
compare(ws, 'Pricing', [x for x in R])  # nosku == 0 tonight; if not, rows shift (checked below)
assert json.load(open(result))['nosku'] == 0, 'rows without SKU – Pricing tab alignment differs'
# upload tab inside the pricing workbook
U = wb['B&Q Upload']; tab_up = [(U[f'A{r}'].value, U[f'B{r}'].value) for r in range(3, U.max_row + 1) if U[f'A{r}'].value not in (None, '')]
eng_up = [(x['sku'], round(x['finalp'], 2)) for x in R if x['upload']]
u = openpyxl.load_workbook(upload)['Data']
file_up = [(u.cell(r, 1).value, u.cell(r, 2).value) for r in range(3, u.max_row + 1) if u.cell(r, 1).value not in (None, '')]
hdr = [[c.value for c in u[1]][:5], [c.value for c in u[2]][:5]]
t = openpyxl.load_workbook('/workspace/bq/KEEP/pricing/BQ_price_template_MASTER.xlsx')['Data']
same_hdr = hdr == [[c.value for c in t[1]][:5], [c.value for c in t[2]][:5]]
# independent audit: recompute profit with plain Python from the inputs (not the engine)
byk = {x['sku']: x for x in R if not x.get('dup')}
aud = []
for s, p in file_up:
    x = byk[s]; mult = 2 if 'ashian' in (x['sup'] or '').lower() else 1.5
    tot = x['cost'] * mult + x['post'] + (x['collab'] or 0) + 0.15 * p; prof = p - tot
    aud.append((s, p, round(prof, 6), prof / x['cost'], 'ashian' in (x['sup'] or '').lower()))
out = {'mismatch': {'%s|%s' % k: v for k, v in bad.items()}, 'examples': ex, 'rows_checked': len(R),
       'upload_tab_eq_engine': tab_up == eng_up, 'upload_file_eq_engine': file_up == eng_up, 'template_headers_same': same_hdr, 'sheet': u.title,
       'upload_rows': len(file_up), 'dup_skus_in_upload': len(file_up) - len(set(s for s, _ in file_up)),
       'min_profit': min((a[2] for a in aud), default=None), 'min_profit_pct': min((a[3] for a in aud), default=None),
       'loss_rows_in_upload': sum(1 for a in aud if a[2] <= 0), 'under50_in_upload': sum(1 for a in aud if a[3] < 0.5 - 1e-9),
       'china_rows': sum(1 for a in aud if a[4]), 'uk_rows': sum(1 for a in aud if not a[4]),
       'price_text_or_blank': sum(1 for a in aud if not isinstance(a[1], (int, float)))}
print(json.dumps(out, indent=1, default=str))
