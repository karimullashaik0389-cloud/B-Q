#!/usr/bin/env python3
"""B&Q buy box run for the dashboard's Access tab (GitHub Actions or Dora's computer).

Same lookups as Karimulla's bq_buybox_from_codes_excel.py (its parsing functions are imported unchanged):
for each EAN -> diy.com product page (search only when the link is not known yet) -> "Sold & shipped by"
seller, the first price after it, review count.

Input  : --codes FILE   encrypted codes list (data/codes_*.enc, made by the page or the box) or a plain
                        .xlsx/.csv (box only). Columns: EAN (product-id), SKU, our price, variant code.
         --prev FILE    previous buybox.enc (re-uses the known product links: 1 request per EAN, not 2)
         --all-variant FILE  newest data/all_variant_*.enc (adds Variant code by SKU when missing)
Output : --out FILE     encrypted buybox.enc (JSON) - nothing is written in plain text.
Polite : --rate requests/second for all workers together (default 1.0, his script ~0.7), --workers 3,
         retries with back-off on 429/5xx, stops early (status "blocked") if diy.com refuses repeatedly.
Time   : --max-minutes (default 320, under the 6h GitHub job limit); unfinished EANs -> status "partial".
The password comes from BQ_PASSWORD / BQ_PASSWORD_FILE and is never printed.
"""
import argparse, csv, datetime, importlib.util, io, json, os, random, re, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bqcrypt
import requests
from bs4 import BeautifulSoup

_spec = importlib.util.spec_from_file_location('his', os.path.join(HERE, 'bq_buybox_from_codes_excel.py'))
his = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(his)
OURS = ('diva package',)

def now(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

# ---------- inputs ----------
def norm_ean(v):
    s = str(v if v is not None else '').strip()
    if re.fullmatch(r'\d+\.0', s): s = s[:-2]
    if re.fullmatch(r'\d+(\.\d+)?[eE]\+?\d+', s):
        try: s = '%d' % int(float(s))
        except Exception: pass
    return s if re.fullmatch(r'\d{8,14}', s) else ''

def price_num(v):
    try:
        f = float(str(v).replace('£', '').replace(',', '').strip())
        return round(f, 2) if f > 0 else None
    except Exception:
        return None

def load_codes(path):
    """-> (rows [{ean, sku, our_price, variant}], meta)."""
    raw = open(path, 'rb').read()
    if raw[:4] == b'BQE1':
        d = json.loads(bqcrypt.decrypt(raw).decode('utf-8'))
        rows = [dict(ean=norm_ean(r[0]), sku=(r[1] or '') if len(r) > 1 else '', our_price=price_num(r[2]) if len(r) > 2 else None,
                     variant=(r[3] or '') if len(r) > 3 else '', url=(r[4] or '') if len(r) > 4 else '') for r in d['rows']]
        return [r for r in rows if r['ean']], d.get('meta', {})
    import pandas as pd
    df = pd.read_csv(path, dtype=str) if path.lower().endswith('.csv') else pd.read_excel(path, dtype=str)
    rows, meta = codes_from_frame(df)
    meta['source'] = os.path.basename(path)
    return rows, meta

def _col(cols, *names):
    low = {re.sub(r'[^a-z0-9&]', '', str(c).lower()): c for c in cols}
    for n in names:
        if n in low: return low[n]
    return None

def codes_from_frame(df):
    """Accepts: Access/B&Q_INV export (product-id, sku, B&Q_INV.price, Variant code), Mirakl offers export
    (Offer SKU, EAN/Product SKU, Price, Activated - only active offers kept) or a one-column codes file."""
    cols = list(df.columns)
    ean = _col(cols, 'productid', 'ean', 'code', 'productsku', 'ean13', 'barcode')
    sku = _col(cols, 'sku', 'offersku', 'shopsku')
    pr = _col(cols, 'b&qinvprice', 'price', 'ourprice', 'offerprice')
    var = _col(cols, 'variantcode')
    url = _col(cols, 'producturl', 'url', 'link')
    act = _col(cols, 'activated')
    if ean is None: ean = cols[0]
    if act is not None:
        df = df[df[act].astype(str).str.strip().str.lower().isin(['true', 'yes', '1'])]
    rows, seen = [], set()
    for _, r in df.iterrows():
        e = norm_ean(r[ean])
        if not e or e in seen: continue
        seen.add(e)
        rows.append(dict(ean=e, sku=str(r[sku]).strip() if sku is not None and str(r[sku]) != 'nan' else '',
                         our_price=price_num(r[pr]) if pr is not None else None,
                         variant=str(r[var]).strip() if var is not None and str(r[var]) != 'nan' else '',
                         url=str(r[url]).strip() if url is not None and '_BQ.prd' in str(r[url]) else ''))
    return rows, {'rows': len(rows), 'active_only': act is not None}

def load_prev(path):
    try:
        d = json.loads(bqcrypt.decrypt(open(path, 'rb').read()).decode('utf-8'))
        return {r['ean']: r['url'] for r in d.get('rows', []) if r.get('url') and '_BQ.prd' in r['url']}
    except Exception as e:
        print('previous result not used:', type(e).__name__, flush=True); return {}

def load_all_variant(path):
    """data/all_variant_*.enc -> {sku or ean: variant code}. Finds the 'Variant code' header in the first 10 rows of any sheet."""
    try:
        import pandas as pd
        plain = bqcrypt.decrypt(open(path, 'rb').read())
        meta, xb = split_av(plain)
        sheets = pd.read_excel(io.BytesIO(xb), sheet_name=None, header=None, dtype=str)
        order = sorted(sheets, key=lambda n: n != meta.get('sheet'))
        for name in order:
            raw = sheets[name]
            for h in range(min(10, len(raw))):
                cols = [str(c) for c in raw.iloc[h].tolist()]
                vc = _col(cols, 'variantcode')
                if vc is None: continue
                sk = _col(cols, 'sku', 'offersku', 'shopsku', 'b&qsku', 'bqsku', 'bnqsku')
                en = _col(cols, 'ean', 'productid', 'barcode', 'gtin')
                out = {}
                for _, r in raw.iloc[h + 1:].iterrows():
                    v = str(r.iloc[cols.index(vc)]).strip()
                    if not v or v == 'nan': continue
                    for key in (sk, en):
                        if key is not None and key != vc:
                            k = str(r.iloc[cols.index(key)]).strip()
                            if k.endswith('.0'): k = k[:-2]
                            if k and k != 'nan': out.setdefault(k, v)
                return out
        return {}
    except Exception as e:
        print('All variant file not used:', type(e).__name__, flush=True); return {}

def split_av(plain):
    """All variant container: b'BQAV1\\n' + JSON meta + b'\\n' + original xlsx bytes."""
    if not plain.startswith(b'BQAV1\n'): raise ValueError('not an All variant container')
    nl = plain.index(b'\n', 6)
    return json.loads(plain[6:nl].decode('utf-8')), plain[nl + 1:]

# ---------- polite networking ----------
class Pace:
    def __init__(self, rate): self.gap = 1.0 / rate; self.lock = threading.Lock(); self.next = time.monotonic()
    def wait(self):
        with self.lock:
            t = max(time.monotonic(), self.next); self.next = t + self.gap * random.uniform(0.85, 1.15)
        d = t - time.monotonic()
        if d > 0: time.sleep(d)

_local = threading.local()
def session():
    if not hasattr(_local, 's'):
        s = requests.Session(); s.headers.update(his.HEADERS); _local.s = s
    return _local.s

class Blocked(Exception): pass
refusals = {'n': 0}; rlock = threading.Lock()

NO_CACHE = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
def bust(url):
    """Fresh page every time: add _ts=<epoch ms> (replacing an old _ts) so no cache can serve an old price."""
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
    u = urlsplit(url); q = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != '_ts']
    q.append(('_ts', str(int(time.time() * 1000))))
    return urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), u.fragment))

def get(url, pace, tries=4, fresh=False):
    r = err = None
    for k in range(tries):
        pace.wait()
        try: r = session().get(bust(url) if fresh else url, timeout=25, headers=NO_CACHE); err = None
        except Exception as e: r, err = None, e
        if r is not None and r.status_code not in (403, 429, 500, 502, 503, 504):
            with rlock: refusals['n'] = 0
            return r, None
        if r is not None and r.status_code in (403, 429):
            with rlock:
                refusals['n'] += 1
                if refusals['n'] >= 25: raise Blocked('diy.com refused %d requests in a row (HTTP %d)' % (refusals['n'], r.status_code))
        if k < tries - 1:
            ra = r.headers.get('Retry-After') if r is not None else None
            time.sleep(min(float(ra) if ra and ra.isdigit() else 2 ** (k + 1) + random.random(), 60))
    return r, err

def parse_product(html):
    soup = BeautifulSoup(html, 'html.parser')
    text = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True)); reviews = ''
    for pat in [r'from\s+(\d+)\s+product reviews', r'from\s+(\d+)\s+reviews', r'\((\d+)\)\s*reviews?']:
        m = re.search(pat, text, re.IGNORECASE)
        if m: reviews = m.group(1); break
    else:
        m = re.search(r'\((\d+)\)', text)
        if m and m.group(1) != '0': reviews = m.group(1)
    his.remove_scripts_and_styles(soup)
    node = his.find_sold_text_node(soup)
    if not node: return '', '', reviews, "No 'Sold & shipped by' text"
    seller = his.extract_seller_from_container(node.parent) or 'UNKNOWN'
    price = his.find_price_near_container(node.parent)
    return seller, price, reviews, 'OK' if price else 'Price not found'

def lookup(code, known, pace):
    url, how = known, 'known link'
    if not url:
        how = 'search'
        r, e = get('https://www.diy.com/search?term=' + his.quote_plus(code), pace)
        if r is None: return dict(url='', seller='', price='', reviews='', status='search failed: %s' % type(e).__name__)
        if r.status_code != 200: return dict(url='', seller='', price='', reviews='', status='HTTP %d on search' % r.status_code)
        link = BeautifulSoup(r.text, 'html.parser').find('a', href=lambda h: h and '_BQ.prd' in h)
        if not link: return dict(url='', seller='', price='', reviews='', status='Not found on diy.com')
        href = link['href']; url = his.normalize_product_url(href if href.startswith('http') else 'https://www.diy.com' + href)
    r, e = get(url, pace, fresh=True); fetched = now()
    if how == 'known link' and r is not None and r.status_code in (404, 410):
        return lookup(code, None, pace)
    if r is None: return dict(url=url, seller='', price='', reviews='', status='page failed: %s' % type(e).__name__, fetched=fetched)
    if r.status_code != 200: return dict(url=url, seller='', price='', reviews='', status='HTTP %d on product page' % r.status_code, fetched=fetched)
    s, p, rv, st = parse_product(r.text)
    return dict(url=url, seller=s, price=p, reviews=rv, status=st, fetched=fetched)

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--codes', required=True); ap.add_argument('--prev'); ap.add_argument('--all-variant')
    ap.add_argument('--out', required=True); ap.add_argument('--runner', default='box')
    ap.add_argument('--rate', type=float, default=1.0); ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--max-minutes', type=float, default=320); ap.add_argument('--limit', type=int)
    ap.add_argument('--checkpoint', help='resume file (plain text, keep OUTSIDE the repo)')
    ap.add_argument('--fresh-links', action='store_true', help='ignore known links (search every EAN like his script)')
    a = ap.parse_args()
    t0 = time.time(); started = now()
    rows, meta = load_codes(a.codes)
    if a.limit: rows = rows[:a.limit]
    known = {} if a.fresh_links or not a.prev or not os.path.exists(a.prev) else load_prev(a.prev)
    if not a.fresh_links:
        for r in rows:
            if r.get('url') and r['ean'] not in known: known[r['ean']] = r['url']
    vmap = load_all_variant(a.all_variant) if a.all_variant and os.path.exists(a.all_variant) else {}
    done = {}
    if a.checkpoint and os.path.exists(a.checkpoint):
        for line in open(a.checkpoint):
            try: d = json.loads(line); done[d['ean']] = d
            except Exception: pass
    todo = [r for r in rows if r['ean'] not in done]
    print('%d EANs (%s), %d already done, %d to look up, %d with known link, All variant map %d keys' %
          (len(rows), meta.get('source', '?'), len(done), len(todo), sum(r['ean'] in known for r in todo), len(vmap)), flush=True)
    pace = Pace(a.rate); stop = {'why': None}; lock = threading.Lock(); n = 0
    ck = open(a.checkpoint, 'a') if a.checkpoint else None
    def work(r):
        if stop['why']: return r['ean'], None
        if time.time() - t0 > a.max_minutes * 60: stop['why'] = stop['why'] or 'time limit'; return r['ean'], None
        try: return r['ean'], lookup(r['ean'], known.get(r['ean']), pace)
        except Blocked as b: stop['why'] = 'blocked: %s' % b; return r['ean'], None
        except Exception as e: return r['ean'], dict(url='', seller='', price='', reviews='', status='error %s' % type(e).__name__)
    with ThreadPoolExecutor(a.workers) as ex:
        for fu in as_completed([ex.submit(work, r) for r in todo]):
            ean, res = fu.result()
            if res is None: continue
            res['ean'] = ean
            with lock:
                done[ean] = res; n += 1
                if ck: ck.write(json.dumps(res) + '\n'); ck.flush()
                if n % 100 == 0: print('%d/%d  %.0fs' % (n, len(todo), time.time() - t0), flush=True)
    out = []
    for r in rows:
        d = done.get(r['ean'])
        bp = price_num(d['price']) if d else None
        win = '' if not d or not d.get('seller') else ('Yes' if d['seller'].strip().lower().startswith(OURS) else 'No')
        out.append(dict(ean=r['ean'], sku=r['sku'], variant=r['variant'] or vmap.get(r['sku'], '') or vmap.get(r['ean'], ''), url=d['url'] if d else '',
                        seller=d['seller'] if d else '', price=bp, our_price=r['our_price'], winning=win,
                        reviews=d['reviews'] if d else '', status=d['status'] if d else 'not checked (%s)' % (stop['why'] or 'stopped'),
                        fetched=(d.get('fetched') or '') if d else ''))
    checked = sum(1 for r in out if not r['status'].startswith('not checked'))
    status = 'complete' if checked == len(out) else ('blocked' if (stop['why'] or '').startswith('blocked') else 'partial')
    run = dict(runner=a.runner, started=started, finished=now(), status=status, stop_reason=stop['why'] or '',
               codes_source=meta.get('source', ''), codes_created=meta.get('created', ''), total=len(out), checked=checked,
               with_seller=sum(1 for r in out if r['seller']), winning=sum(1 for r in out if r['winning'] == 'Yes'),
               losing=sum(1 for r in out if r['winning'] == 'No'), minutes=round((time.time() - t0) / 60, 1))
    open(a.out, 'wb').write(bqcrypt.encrypt(json.dumps({'run': run, 'rows': out}, separators=(',', ':')).encode('utf-8')))
    print('RESULT', json.dumps(run), flush=True)
    return 0 if status != 'blocked' else 3

if __name__ == '__main__':
    sys.exit(main())
