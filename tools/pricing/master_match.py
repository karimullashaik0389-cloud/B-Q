#!/usr/bin/env python3
"""TASK 2 – prove our shared engine (bq_price.js) = Diva's Master File formulas, every row.
Her files are only READ (md5 checked before/after). Her formulas are recalculated by LibreOffice on TEMP copies.
Rows where her T..Z formulas are missing get her exact row-2 formula pattern copied down in the TEMP copy only."""
import openpyxl, subprocess, os, sys, json, hashlib, re, tempfile, shutil, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import engine
FILES = ['/workspace/bq/KEEP/pricing/user_file_2026-10-29_1601.xlsx', '/workspace/bq/KEEP/pricing/BQ_Live_Prices_Reference_2026-10-28_1650.xlsx']
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/bq/pricing_tab/out/master_match.json'
md5 = lambda p: hashlib.md5(open(p, 'rb').read()).hexdigest()
def num(v):
    if v is None or isinstance(v, bool): return None
    if isinstance(v, (int, float)): return float(v)
    t = re.sub(r'[£,\s]', '', str(v))
    try: return float(t) if t else None
    except ValueError: return None
TOL = 0.005  # under 1p
report = {}
for f in FILES:
    before = md5(f); name = os.path.basename(f); R = report[name] = {'md5_before': before}
    td = tempfile.mkdtemp(prefix='mm_')
    wb = openpyxl.load_workbook(f)  # formulas
    P = wb['Paste Here']; W = wb['Working File']
    pat = {c: P[f'{c}2'].value for c in 'TUVWXYZ'}
    typed = collections.Counter(); extended = 0; formula_rows = 0; typed_cells = []
    for r in range(2, P.max_row + 1):
        if P[f'B{r}'].value in (None, '') and P[f'K{r}'].value in (None, ''): continue
        isf = {c: isinstance(P[f'{c}{r}'].value, str) and str(P[f'{c}{r}'].value).startswith('=') for c in 'TUVWXYZ'}
        if not any(isf.values()):
            extended += 1
            for c, v in pat.items(): P[f'{c}{r}'] = re.sub(r'([A-Z]+)2\b', lambda m: m.group(1) + str(r), v)
        else:
            formula_rows += 1
            for c in 'TUVWXYZ':
                if not isf[c]: typed[c] += 1; typed_cells.append(f'{c}{r}={P[f"{c}{r}"].value!r}')
    R['paste_rows_with_her_formulas'] = formula_rows; R['paste_rows_formula_copied_down_in_temp'] = extended
    R['paste_typed_over_cells'] = dict(typed); R['paste_typed_over_examples'] = typed_cells[:10]
    tmp = os.path.join(td, 'her.xlsx'); wb.save(tmp)
    subprocess.run(f'cd {td} && timeout 900 soffice --headless --calc --convert-to xlsx --outdir o her.xlsx >/dev/null 2>&1', shell=True, check=True)
    V = openpyxl.load_workbook(os.path.join(td, 'o', 'her.xlsx'), data_only=True, read_only=True)
    rowsP = [(i + 1, list(x)) for i, x in enumerate(V['Paste Here'].iter_rows(values_only=True))][1:]
    # also her cached values (as saved by Excel) for the same cells
    C = openpyxl.load_workbook(f, data_only=True, read_only=True)
    cachedP = [list(x) for x in C['Paste Here'].iter_rows(values_only=True)][1:]
    items = []; meta = []
    for (rn, x), cx in zip(rowsP, cachedP):
        cost, price = num(x[10]), num(x[7]); post = num(x[19])
        if cost is None and price is None: continue
        meta.append((rn, x, cx))
        items.append({'cost': cost or 0, 'price': price or 0, 'sup': x[5] or '', 'post': post or 0, 'collab': num(x[18]) or 0})
    ours = engine.calc(items)
    maxpen = [0]; maxex = [0]; mis = collections.Counter(); ex = []; nonnum = collections.Counter(); cache_diff = collections.Counter(); checked = 0; collab_rows = 0
    for (rn, x, cx), o, it in zip(meta, ours, items):
        if it['collab']: collab_rows += 1
        her = {'fee': x[20], 'company': x[22], 'total': x[23], 'profit': x[24], 'pct': x[25]}
        for k, col in (('fee', 20), ('company', 22), ('total', 23), ('profit', 24), ('pct', 25)):
            if num(x[col]) is not None and num(cx[col]) is not None and abs(num(x[col]) - num(cx[col])) > 1e-6: cache_diff[k] += 1
        if any(num(v) is None for v in her.values()) or num(x[19]) is None:
            nonnum[str([her['fee'], her['total'], her['profit'], her['pct']])[:60]] += 1; continue
        checked += 1
        d = {'fee': abs(o['fee'] - her['fee']), 'company': abs(o['company'] - her['company']), 'total': abs(o['total'] - her['total']),
             'profit': abs(o['pr'] - her['profit']), 'profit_penny': abs(o['profit'] - her['profit'])}
        bad = [k for k, v in d.items() if v > TOL + 1e-9]  # under/at half a penny = rounding only
        maxpen[0] = max(maxpen[0], d['profit_penny']); maxex[0] = max(maxex[0], d['profit'], d['total'], d['fee'], d['company'])
        if it['cost'] > 0:
            if o['pc'] is None or abs(o['pc'] - her['pct']) > 1e-6: bad.append('pct')
        for k in bad: mis[k] += 1
        if bad and len(ex) < 15: ex.append({'row': rn, 'sku': x[16], 'bad': bad, 'ours': {k: o[k] for k in ('fee', 'company', 'total', 'pr', 'profit', 'pc')}, 'hers': her})
    R['paste'] = {'rows_checked': checked, 'mismatches_by_field': dict(mis), 'examples': ex, 'rows_her_result_not_a_number': dict(nonnum),
                  'rows_with_collab_fee': collab_rows, 'max_diff_exact_money': maxex[0], 'max_diff_penny_rounded_profit': maxpen[0], 'excel_cache_vs_libreoffice_diffs': dict(cache_diff)}
    # postage differences: her T vs OUR rule (Access Postage Cost, else our weight bands)
    pin = [{'pc': x[13], 'w': x[14]} for rn, x, cx in meta]; op = engine.postage(pin)
    pd_ = collections.Counter(); pex = []
    for (rn, x, cx), p in zip(meta, op):
        h = num(x[19]); pcv = num(x[13])
        if p is None: kind = 'ours blank (no postage, no weight) – needs review'
        elif h is None: kind = 'hers not a number'
        elif abs(p - h) < 0.005: kind = 'same'
        elif pcv is not None and pcv > 0: kind = 'Access postage filled but differs?'
        else: kind = 'weight band differs (hers %s vs ours %s)' % (h, p)
        pd_[kind] += 1
        if kind != 'same' and len(pex) < 10: pex.append({'row': rn, 'sku': x[16], 'weight': x[14], 'access_postage': x[13], 'hers': h, 'ours': p})
    R['postage'] = {'rows': len(meta), 'by_kind': dict(sorted(pd_.items(), key=lambda t: -t[1])), 'differs_total': sum(v for k, v in pd_.items() if k != 'same'), 'examples': pex}
    # Working File: G price, M cost, S postage, T fee, U company, N total, O profit, P pct, V supplier (no collab column)
    rowsW = [list(x) for x in V['Working File'].iter_rows(min_row=2, values_only=True)]
    hdr = [c for c in next(V['Working File'].iter_rows(max_row=1, values_only=True))]
    ci = {k: i for i, k in enumerate(hdr)}
    # locate columns by header text (the two files differ: user_file has an extra 'B n Q 30Days' column)
    def col(*names):
        for n in names:
            if n in ci: return ci[n]
        raise KeyError(names)
    cG = col('B&Q_INV.price'); cM = col('Estimated cost'); cS = col('Postage cost final'); cT = col('B&Q %'); cU = col('Company Cost'); cN = col('Total Company Cost'); cO = col('Profit'); cP = col('Profit %'); cV = col('Main supplier name')
    wi = []; wm = []
    for i, x in enumerate(rowsW):
        if num(x[cG]) is None or num(x[cM]) is None or num(x[cS]) is None: continue
        wm.append((i + 2, x)); wi.append({'cost': num(x[cM]), 'price': num(x[cG]), 'sup': x[cV] or '', 'post': num(x[cS]), 'collab': 0})
    ow = engine.calc(wi); wmis = collections.Counter(); wex = []; wn = 0
    for (rn, x), o in zip(wm, ow):
        her = {'fee': num(x[cT]), 'company': num(x[cU]), 'total': num(x[cN]), 'profit': num(x[cO]), 'pct': num(x[cP])}
        if any(v is None for v in her.values()): continue
        wn += 1; bad = [k for k, a in (('fee', o['fee']), ('company', o['company']), ('total', o['total']), ('profit', o['pr'])) if abs(a - her[k]) > TOL + 1e-9]
        if o['pc'] is None or abs(o['pc'] - her['pct']) > 1e-6: bad.append('pct')
        for k in bad: wmis[k] += 1
        if bad and len(wex) < 10: wex.append({'row': rn, 'sku': x[2], 'bad': bad, 'ours': {k: o[k] for k in ('fee', 'company', 'total', 'pr', 'pc')}, 'hers': her})
    R['working'] = {'rows_checked': wn, 'mismatches_by_field': dict(wmis), 'examples': wex}
    R['md5_after'] = md5(f); R['unchanged'] = R['md5_after'] == before
    shutil.rmtree(td)
os.makedirs(os.path.dirname(OUT), exist_ok=True); json.dump(report, open(OUT, 'w'), indent=1, default=str)
for n, R in report.items():
    print(n, 'unchanged' if R['unchanged'] else 'CHANGED!!')
    print('  Paste Here: checked', R['paste']['rows_checked'], 'mismatches', R['paste']['mismatches_by_field'], 'max exact diff', R['paste']['max_diff_exact_money'], 'max penny diff', R['paste']['max_diff_penny_rounded_profit'], '| her formula rows', R['paste_rows_with_her_formulas'], 'copied down', R['paste_rows_formula_copied_down_in_temp'], 'typed-over', R['paste_typed_over_cells'], '| not-number', R['paste']['rows_her_result_not_a_number'], '| collab rows', R['paste']['rows_with_collab_fee'], '| cache vs LO', R['paste']['excel_cache_vs_libreoffice_diffs'])
    print('  Working File: checked', R['working']['rows_checked'], 'mismatches', R['working']['mismatches_by_field'])
    print('  Postage:', R['postage']['by_kind'])
