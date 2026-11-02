"""Run: python3 tests/test_tool.py   (synthetic data only, no internet)"""
import os, sys, shutil, tempfile, hashlib, time
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
import find_duplicates as fd, make_sample as ms

RESULTS = []
def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))

def run(d, files, extra=()):
    out = os.path.join(d, 'out')
    argv = ['--no-auto', '--offers', files['offers'], '--access', files['access'], '--orders', files['orders'],
            '--live', '--offline', '--cache', files['cache'], '--out', out, '--date', '2026-11-01', '--dashboard', os.path.join(out, 'dash.json')] + list(extra)
    xf, cf = fd.cli(argv)
    return xf, cf, {s: pd.read_excel(xf, sheet_name=s, dtype=str) for s in pd.ExcelFile(xf).sheet_names}

def flag(sh, sku):
    a = sh['All groups']; r = a[a['Offer SKU'] == sku]
    return r['Final flag'].iloc[0] if len(r) else 'NOT GROUPED'

def main():
    tmp = tempfile.mkdtemp(prefix='duptest_')
    try:
        f = ms.make(os.path.join(tmp, 'csv'))
        xf, cf, sh = run(os.path.join(tmp, 'csv'), f)
        a = sh['All groups']; g = a.groupby('Group no')
        check('sheets present', set(sh) >= {'DELETE LIST', 'All groups', 'Check', 'Summary', 'How it works', 'Keep both - fix', 'Fix list'}, str(list(sh)))
        check('same EAN -1/-01: inactive copy deleted', flag(sh, 'TST-AAA-01') == 'Delete (verified)' and flag(sh, 'TST-AAA-1').startswith('Keep'))
        why = a[a['Offer SKU'] == 'TST-AAA-1']['Why duplicated'].iloc[0]
        check('why duplicated names the -1 vs -01 suffix', 'same EAN' in why and '-1' in why and '-01' in why, why)
        bb = a[a['Offer SKU'].str.startswith('TST-BBB')]
        check('group of 4 found as one group', bb['Group no'].nunique() == 1 and len(bb) == 4)
        check('group of 4: seller kept, 3 weaker deleted', flag(sh, 'TST-BBB-1').startswith('Keep') and all(flag(sh, s) == 'Delete (verified)' for s in ['TST-BBB-01', 'TST-BBB-001', 'TST-BBB-0001']))
        mm = a[a['Offer SKU'].str.startswith('TST-MMM')]
        check('group of 3 (EAN + variant code, transitive) found as one group', mm['Group no'].nunique() == 1 and len(mm) == 3)
        check('group of 3: active kept, 2 inactive deleted', flag(sh, 'TST-MMM-1').startswith('Keep') and flag(sh, 'TST-MMM-01') == flag(sh, 'TST-MMM-001') == 'Delete (verified)')
        check('all-inactive group: strongest kept, weaker deleted', flag(sh, 'TST-CCC-1').startswith('Keep') and flag(sh, 'TST-CCC-01') == 'Delete (verified)')
        check('similar sales 12 vs 11: keep both', flag(sh, 'TST-DDD-1').startswith('Keep') and flag(sh, 'TST-DDD-01').startswith('Keep')
              and set(sh['Keep both - fix']['Offer SKU']) >= {'TST-DDD-1', 'TST-DDD-01'})
        check('keep-both weaker copy is Keep - fix with what to fix', flag(sh, 'TST-DDD-01') == 'Keep - fix' and 'TST-DDD-01' in set(sh['Fix list']['Offer SKU']))
        check('15 vs 3, no reviews, weaker: delete', flag(sh, 'TST-EEE-01') == 'Delete (verified)')
        check('15 vs 3, lower has reviews: Check', flag(sh, 'TST-FFF-01') == 'Check')
        check('candidate page 404: Check', flag(sh, 'TST-GGG-01') == 'Check')
        check('colour variants sharing a title are NOT grouped', flag(sh, 'TST-HHH-RED-1') == 'NOT GROUPED' and flag(sh, 'TST-HHH-BLU-1') == 'NOT GROUPED')
        check('15 vs 3, lower is stronger: Check', flag(sh, 'TST-III-01') == 'Check')
        check('same title same stem different EAN: grouped', flag(sh, 'TST-JJJ-02') != 'NOT GROUPED' and 'same title' in a[a['Offer SKU'] == 'TST-JJJ-02']['Why duplicated'].iloc[0])
        check('kept copy page missing: candidate goes to Check', flag(sh, 'TST-KKK-01') == 'Check')
        check('single listing not reported', flag(sh, 'TST-LLL-1') == 'NOT GROUPED')
        check('cancelled order not counted as a sale', a[a['Offer SKU'] == 'TST-AAA-01']['Units sold'].iloc[0] in ('0', '0.0'))
        keeps = a[a['Final flag'].str.startswith('Keep')].groupby('Group no').size()
        chk = set(sh['Check']['Group no']); kb = set(sh['Keep both - fix']['Group no'])
        bad = [gn for gn, n in keeps.items() if n != 1 and gn not in chk and gn not in kb]
        check('every group has exactly one Keep (or is on Check / Keep both)', not bad and set(a['Group no']) == set(keeps.index) | chk, str(bad))
        D = sh['DELETE LIST']
        need = ['Kept instead (Offer SKU)', 'Units (this)', 'Units (kept)', 'Reviews (this)', 'Reviews (kept)', 'Strength (this)', 'Strength (kept)', 'Live page (this)', 'Live page (kept)']
        check('DELETE LIST has all safety columns filled', all(c in D for c in need) and D[need].notna().all().all())
        check('DELETE LIST rows: 0 reviews, both pages live', (D['Reviews (this)'] == '0').all() and (D['Live page (this)'] == 'Live').all() and (D['Live page (kept)'] == 'Live').all())
        check('DELETE LIST: never stronger than kept', (D['Strength (this)'].astype(int) <= D['Strength (kept)'].astype(int)).all())
        c = pd.read_csv(cf, dtype=str)
        check('delete csv matches DELETE LIST', list(c['Offer SKU']) == list(D['Offer SKU']))
        import json
        dj = json.load(open(os.path.join(tmp, 'csv', 'out', 'dash.json')))
        check('dashboard JSON matches the workbook', dj['summary']['delete'] == len(D) and len(dj['delete_list']) == len(D)
              and dj['summary']['groups'] == a['Group no'].nunique() and len(dj['groups']) == dj['summary']['groups']
              and {o['sku'] for o in dj['check_list']} == set(sh['Check']['Offer SKU']) and len(dj['fix_list']) == len(sh['Fix list']))
        # determinism
        h1 = {s: pd.util.hash_pandas_object(v.fillna('')).sum() for s, v in sh.items()}; c1 = open(cf, 'rb').read()
        _, cf2, sh2 = run(os.path.join(tmp, 'csv'), f)
        h2 = {s: pd.util.hash_pandas_object(v.fillna('')).sum() for s, v in sh2.items()}
        check('rerun gives identical results (all sheets + csv)', h1 == h2 and c1 == open(cf2, 'rb').read())
        # xlsx offer export gives same result
        fx = ms.make(os.path.join(tmp, 'xlsx'), fmt='xlsx')
        _, _, shx = run(os.path.join(tmp, 'xlsx'), fx)
        check('xlsx offer export gives same result as csv', shx['All groups'][['Offer SKU', 'Final flag']].equals(a[['Offer SKU', 'Final flag']]))
        # wrong / missing files
        for nm, bad_f in [('missing offer file', os.path.join(tmp, 'nope.csv')), ('orders file passed as offers', f['orders'])]:
            try:
                run(os.path.join(tmp, 'csv'), dict(f, offers=bad_f)); ok = False; msg = 'no error'
            except fd.InputError as ex:
                ok = True; msg = str(ex)
            check(f'{nm}: clear error, no output', ok, msg)
        try:
            run(os.path.join(tmp, 'csv'), dict(f, orders=f['offers'])); ok = False
        except fd.InputError:
            ok = True
        check('offer file passed as orders: clear error', ok)
        import subprocess
        p = subprocess.run([sys.executable, os.path.join(os.path.dirname(HERE), 'find_duplicates.py'), '--no-auto', '--out', os.path.join(tmp, 'x'), '--dashboard', ''], capture_output=True, text=True)
        check('command line with no files: exit code 2 + plain STOPPED message, no traceback', p.returncode == 2 and 'STOPPED' in p.stderr and 'Traceback' not in p.stderr, p.stderr[-300:])
        # old export + no inactive offers -> warnings
        fo = ms.make(os.path.join(tmp, 'old'), inactive=False)
        old = time.time() - 10 * 86400; os.utime(fo['offers'], (old, old))
        _, _, sho = run(os.path.join(tmp, 'old'), fo)
        w = sho['Summary'].set_index('Item').loc['Warnings', 'Value']
        check('old export warned', 'days old' in w, w)
        check('export without inactive offers warned', 'NO inactive' in w, w)
        # without --live nothing is deleted
        out = os.path.join(tmp, 'nolive')
        xf3, _ = fd.cli(['--no-auto', '--offers', f['offers'], '--access', f['access'], '--orders', f['orders'], '--out', out, '--date', '2026-11-01', '--dashboard', ''])
        a3 = pd.read_excel(xf3, sheet_name='All groups', dtype=str)
        check('without --live: no Delete flags', not (a3['Final flag'] == 'Delete (verified)').any())
        # regression helper on synthetic reference (old method = same variant code)
        import regress
        src = os.path.join(tmp, 'ref_src.xlsx'); ref = os.path.join(tmp, 'ref_list.xlsx')
        rows = [r for r in ms.ROWS]
        pd.DataFrame([{'Variant code': r[5] or r[0], 'Variant description': r[2], 'product-id': ms.ean(r[1]), 'sku': r[0]} for r in rows]).to_excel(src, sheet_name='Paste Here', index=False)
        vc = pd.Series([r[5] or r[0] for r in rows]); multi = vc[vc.duplicated(keep=False)]
        pd.DataFrame([{'Group no': sorted(set(multi)).index(r[5]) + 1, 'Offer SKU': r[0]} for r in rows if r[5] in set(multi)]).to_excel(ref, sheet_name='Duplicates', index=False)
        res = regress.run(False, True, ref=ref, src=src)[0]
        check('regression helper reproduces a variant-code reference list 100%', res['group_exact_pct'] == 100.0, str(res))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    n = sum(ok for _, ok, _ in RESULTS)
    print(f'\n{n}/{len(RESULTS)} tests passed')
    return 0 if n == len(RESULTS) else 1

if __name__ == '__main__':
    sys.exit(main())
