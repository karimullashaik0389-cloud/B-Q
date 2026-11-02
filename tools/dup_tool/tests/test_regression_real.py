"""Box only: rebuild the 29 Oct list from its own source file and compare. Skips if the files are not present."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import regress
if not (os.path.exists(regress.REF) and os.path.exists(regress.SRC)):
    print('SKIP regression: reference files not on this computer'); sys.exit(0)
r = regress.run(verbose=False)[0]
v = regress.run(verbose=False, variant_only=True)[0]
print(r); print('variant-only:', v)
ok = r['missing'] == 0 and r['extra_groups'] == 0 and r['grown_groups'] <= 1 and r['offer_recall'] == 100.0 and v['group_exact_pct'] == 100.0
print('PASS' if ok else 'FAIL', '29 Oct regression'); sys.exit(0 if ok else 1)
