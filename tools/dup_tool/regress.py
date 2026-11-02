"""Regression: rebuild the 29 Oct duplicate list from its own source file and compare."""
import sys, os, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import find_duplicates as fd
REF = os.environ.get('DUP_REF_LIST') or '/workspace/bq/out_2026-10-30/B&Q Duplicate Listings List 2026-10-29.xlsx'
SRC = os.environ.get('DUP_REF_SOURCE') or '/workspace/bq/KEEP/pricing/user_file_2026-10-29_1601.xlsx'

def run(verbose=True, variant_only=False, ref=None, src=None):
    ref_f = ref or REF; src_f = src or SRC
    P = pd.read_excel(src_f, sheet_name='Paste Here', dtype=str)
    P = P[P['Variant code'].notna()].drop_duplicates()          # same as dup2.py: drop fully identical rows
    T = pd.DataFrame({'sku': P['sku'].str.strip(), 'ean': P['product-id'].fillna('').str.strip(),
                      'title': P['Variant description'], 'variant': P['Variant code'].str.strip()})
    T = T.drop_duplicates('sku').reset_index(drop=True)
    if variant_only: T['ean'] = ''; T['title'] = ''
    groups, links = fd.build_groups(T)
    got = {frozenset(T.loc[g, 'sku']) for g in groups}
    R = pd.read_excel(ref_f, sheet_name='Duplicates', dtype=str)
    ref = {frozenset(x['Offer SKU'].str.strip()) for _, x in R.groupby('Group no')}
    exact = ref & got
    contained = {r for r in ref - exact if any(r < g for g in got)}
    missing = ref - exact - contained
    extra = {g for g in got if not any(r <= g for r in ref)}
    grown = {g for g in got if any(r < g for r in ref)}
    refsk = set().union(*ref); gotsk = set().union(*got)
    res = dict(ref_groups=len(ref), ref_offers=len(refsk), got_groups=len(got), got_offers=len(gotsk),
               exact=len(exact), contained=len(contained), missing=len(missing), extra_groups=len(extra), grown_groups=len(grown),
               offer_recall=round(100 * len(refsk & gotsk) / len(refsk), 1), group_exact_pct=round(100 * len(exact) / len(ref), 1))
    if verbose:
        print(res)
        for m in sorted(missing, key=sorted)[:20]: print('MISSING', sorted(m))
    return res, T, got, ref, links, extra, grown, missing

if __name__ == '__main__':
    run()
    print('variant-code only:', run(False, True)[0])
