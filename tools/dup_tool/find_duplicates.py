#!/usr/bin/env python3
"""B&Q (Mirakl) duplicate listings finder - report only, never changes anything.
Run:  python3 find_duplicates.py [--offers F] [--products F] [--access F] [--orders F ...] [--live] [--out DIR]
Missing arguments are auto-picked (newest suitable file on the box). See README.md.
"""
import argparse, glob, os, re, sys, json, time, html as H, datetime as dt, subprocess, hashlib
from collections import defaultdict, Counter
import numpy as np
import pandas as pd

# ================= CONFIG (thresholds Karimulla can change) =================
SIMILAR_PCT = 30        # two sellers with >= HIGH_SALES units are "similar" if within this % of each other
HIGH_SALES = 10         # units in the order range: >= this is a high seller, below it is a low seller
LOW_SIMILAR_UNITS = 2   # two low sellers are "similar" if within this many units
AI_MODEL = 'gemini-3.5-flash-lite'   # optional second opinion (--ai); uses env GEMINI_API_KEY, sends only public listing text
AI_MARGIN = 1           # if AI rates a delete candidate more than this many points above its kept copy, it goes to Check
FIX_BELOW = 6           # a kept listing needs a fix when its photo/title/description/key-points score is below this (out of 10)
# ===========================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
SEARCH_DIRS = ['/workspace/bq', '/workspace', os.path.expanduser('~/Downloads'), '/workspace/bq_2026-10-26', '/workspace/bq/live_export', '/workspace/bq/KEEP/pricing']
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
OUR_SELLER = 'Diva Package'
BANNED_BRANDS = ['supergift', 'ovovo']
COLOURS = set('black white red green blue yellow grey gray silver gold brown pink purple orange clear cream beige ivory oak walnut teak pine chrome brass copper bronze natural multicolour multicolor transparent navy charcoal anthracite mahogany ebony'.split())
MATERIALS = set('steel stainless metal iron aluminium aluminum plastic wood wooden timber glass rubber pvc nylon cotton polyester ceramic resin concrete stone brass copper bamboo foam vinyl acrylic silicone latex leather fabric jute wax paper cardboard'.split())
USE_WORDS = set('for indoor outdoor garden home kitchen bathroom shed fence decking wall floor door window car garage office christmas festive pet dog cat plants lawn diy wood metal interior exterior'.split())
STOP = set('a an and the of with for in on to by from x pack set piece pcs'.split())
PROMPT_LEAK = re.compile(r'(?i)(no writing on the image|setting works best|keep the [a-z ]+ (large|visible)|main focus|image prompt|generate an image|photorealistic|softly blurred)')

# ---------------------------------------------------------------- file discovery
def newest(patterns, check=None):
    c = []
    for d in SEARCH_DIRS:
        for p in patterns:
            c += glob.glob(os.path.join(d, p))
    c = sorted(set(c), key=lambda f: (file_date(f), f), reverse=True)
    for f in c:
        if check is None or check(f):
            return f
    return None

def file_date(f):
    """Data date of a file: a date written in its path (e.g. 20261026185745 or 2026-10-26), else the file time."""
    m = re.findall(r'(20\d\d)-?([01]\d)-?([0-3]\d)(?:[ _-]?([0-2]\d)([0-5]\d))?', f)
    if m:
        y, mo, d, hh, mm = m[-1]
        try: return dt.datetime(int(y), int(mo), int(d), int(hh or 23), int(mm or 59)).timestamp()
        except ValueError: pass
    return os.path.getmtime(f)

def head_cols(f):
    if f.endswith('.xlsx'):
        return []
    with open(f, encoding='utf-8-sig', errors='ignore') as fh:
        line = fh.readline()
    return [x.strip().strip('"') for x in re.split(r'[;,]', line)]

def is_offer_export(f):
    h = head_cols(f); return all(k in h for k in ('Offer SKU', 'Product SKU', 'Activated', 'Quantity'))

def is_orders(f):
    h = head_cols(f); return all(k in h for k in ('Order line no.', 'Offer SKU', 'Date created'))

def read_csv_any(f):
    if str(f).lower().endswith(('.xlsx', '.xlsm', '.xls')):
        return pd.read_excel(f, dtype=str)
    sep = ';' if ';' in open(f, encoding='utf-8-sig', errors='ignore').readline() else ','
    return pd.read_csv(f, sep=sep, dtype=str, encoding='utf-8-sig')

class InputError(Exception):
    pass

def load_table(f, need, what):
    """Read a csv/xlsx and check it has the columns we need; plain-English error if not."""
    if not f or not os.path.exists(f):
        raise InputError(f'{what}: file not found: {f}')
    try:
        d = read_csv_any(f)
    except Exception as ex:
        raise InputError(f'{what}: could not read {f} ({ex.__class__.__name__}). Is it a csv or xlsx export?')
    d.columns = [str(c).strip() for c in d.columns]
    miss = [c for c in need if c not in d.columns]
    if miss:
        raise InputError(f'{what}: {os.path.basename(f)} is not the right export - missing columns: {", ".join(miss)}')
    return d

# ---------------------------------------------------------------- helpers
def gtin_ok(e):
    e = str(e or '').strip()
    if not re.fullmatch(r'\d{8}|\d{12,14}', e): return False
    d = [int(x) for x in e]; chk = d[-1]; body = d[:-1][::-1]
    s = sum(v * (3 if i % 2 == 0 else 1) for i, v in enumerate(body))
    return (10 - s % 10) % 10 == chk

def norm_tokens(t):
    t = H.unescape(str(t or '')).lower()
    t = re.sub(r'(\d+)\s*(ml|l|ltr|litre|litres|kg|g|mm|cm|m|ft|in|inch|w|v|pcs|pc|pack)\b', r'\1\2', t)
    t = re.sub(r'\b(supergift(\.com)?|ovovo|diva ?package)\b', ' ', t)
    toks = [w for w in re.findall(r'[a-z0-9]+(?:\.[0-9]+)?', t) if w not in STOP]
    return toks

def pack_of(t):
    """Explicit pack count in a title ('2 x ...', 'pack of 6', '20pk'), else None (not stated)."""
    t = str(t or '')
    m = re.match(r'\s*(\d+)\s*x\s', t, re.I) or re.search(r'\bpack of (\d+)\b(?!\s*(ml|l|g|kg|cm|mm|m)\b)', t, re.I) or re.search(r'\b(\d+)\s*(?:pack|pk)\b', t, re.I)
    return int(m.group(1)) if m else None

def sku_stem(s):
    return re.sub(r'-\d+$', '', str(s))

class UF:
    def __init__(s): s.p = {}
    def f(s, x):
        s.p.setdefault(x, x)
        while s.p[x] != x:
            s.p[x] = s.p[s.p[x]]; x = s.p[x]
        return x
    def u(s, a, b):
        a, b = s.f(a), s.f(b)
        if a != b: s.p[max(a, b)] = min(a, b)

# ---------------------------------------------------------------- scoring
def title_score(title, ptype):
    t = H.unescape(str(title or '')).strip(); L = len(t); pts = 0; why = []
    if 110 <= L <= 135: pts += 2
    elif 70 <= L <= 150: pts += 1; why.append(f'length {L} (target 121-124)')
    else: why.append(f'length {L} far from 121-124')
    toks = norm_tokens(t); low = t.lower()
    pt = [w for w in norm_tokens(ptype) if len(w) > 2]
    if pt and all(w.rstrip('s') in low for w in pt): pts += 2
    elif pt and any(w.rstrip('s') in low for w in pt): pts += 1; why.append('product type only partly in title')
    else: why.append('product type missing')
    if re.search(r'\d+(\.\d+)?\s*(ml|l|ltr|litre|kg|g|mm|cm|m|ft|in|inch|w|v|pcs|pack|x)\b|\bpack of\b|\d+\s*x\s', low): pts += 1
    else: why.append('no size/pack')
    if set(toks) & (COLOURS | MATERIALS): pts += 1
    else: why.append('no colour/material')
    if set(toks) & USE_WORDS: pts += 1
    else: why.append('no use words')
    c = Counter(w for w in toks if len(w) > 3 and not w.isdigit())
    if not any(v > 1 for v in c.values()): pts += 1
    else: why.append('repeated words: ' + ','.join(k for k, v in c.items() if v > 1))
    if not any(b in low for b in BANNED_BRANDS): pts += 1
    else: why.append('banned brand in title')
    if t and not re.search(r'(-|,|&|\(|\b(and|with|for|of|to|the))\s*$', t, re.I): pts += 1
    else: why.append('looks cut off')
    return pts, L, '; '.join(why) or 'good'

def desc_score(desc, title):
    d = H.unescape(re.sub(r'<[^>]+>', ' ', str(desc or ''))).strip()
    if not d or d.lower() == 'nan': return 0, 0, 'no description'
    words = d.split(); n = len(words); pts = 0; why = []
    pts += 4 if n >= 150 else 3 if n >= 100 else 2 if n >= 60 else 1 if n >= 25 else 0
    if n < 100: why.append(f'{n} words')
    facts = len(re.findall(r'\d+(\.\d+)?\s*(ml|l|kg|g|mm|cm|m|ft|w|v|%|pcs|hours?|years?|sq)', d, re.I))
    pts += 2 if facts >= 3 else 1 if facts >= 1 else 0
    if facts == 0: why.append('no product facts/measurements')
    sents = [s for s in re.split(r'[.!?]\s+', d) if len(s.split()) > 2]
    avg = n / max(1, len(sents))
    if 8 <= avg <= 25: pts += 1
    else: why.append('hard to read (sentence length)')
    if len(sents) >= 3: pts += 1
    if not PROMPT_LEAK.search(d): pts += 1
    else: why.append('contains image-prompt text, not shopper copy')
    if d.strip().lower() != str(title).strip().lower(): pts += 1
    return pts, n, '; '.join(why) or 'good'

def bullet_score(bullets):
    b = [x for x in (bullets or []) if x and x.strip()]
    n = len(b)
    if n == 0: return 0, 0, 'no key points'
    pts = 7 if n >= 7 else 6 if n >= 5 else 4 if n >= 3 else 2; why = []
    if sum(len(x.split()) for x in b) / n >= 6: pts += 1
    else: why.append('very short points')
    if len(set(x.lower().strip() for x in b)) == n: pts += 1
    else: why.append('repeated points')
    if any(re.search(r'\d', x) for x in b): pts += 1
    else: why.append('no numbers/facts')
    return min(pts, 10), n, (f'{n} points; ' + '; '.join(why)) if why else f'{n} points'

def image_score(n, main_px=None):
    pts = min(n, 8) + (1 if n >= 1 else 0)
    if main_px and main_px >= 1000: pts += 1
    return min(pts, 10)

# ---------------------------------------------------------------- live page
def fetch_pages(eans_links, cache, delay=1.0, log=print, offline=False):
    os.makedirs(cache, exist_ok=True)
    meta_f = os.path.join(cache, '_fetch_log.tsv'); done = {}
    if os.path.exists(meta_f):
        for l in open(meta_f):
            p = l.rstrip('\n').split('\t')
            if len(p) >= 4: done[p[0]] = p
    todo = [(e, u) for e, u in eans_links if e not in done or not os.path.exists(os.path.join(cache, e + '.html'))]
    log(f'live pages: {len(eans_links)} needed, {len(eans_links)-len(todo)} in cache, fetching {len(todo)} (about {delay}s apart)')
    if offline: return done
    for i, (e, u) in enumerate(todo):
        out = os.path.join(cache, e + '.html')
        try:
            r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-A', UA, '-o', out, '-w', '%{http_code}\t%{url_effective}', u], capture_output=True, text=True, timeout=60)
            code, final = (r.stdout.split('\t') + [''])[:2]
        except Exception as ex:
            code, final = 'ERR', str(ex)[:80]
        with open(meta_f, 'a') as fh:
            fh.write(f'{e}\t{code}\t{final}\t{dt.datetime.now():%Y-%m-%d %H:%M}\n')
        done[e] = [e, code, final, f'{dt.datetime.now():%Y-%m-%d %H:%M}']
        if (i + 1) % 50 == 0: log(f'  fetched {i+1}/{len(todo)}')
        time.sleep(delay)
    return done

def main_image_px(url, cache):
    if not url: return None
    key = hashlib.md5(url.encode()).hexdigest()
    f = os.path.join(cache, '_img_' + key + '.txt')
    if not os.path.exists(f):
        try:
            r = subprocess.run(['curl', '-s', '--max-time', '20', '-A', UA, url + '?req=imageprops'], capture_output=True, text=True, timeout=30)
            open(f, 'w').write(r.stdout); time.sleep(0.5)
        except Exception:
            return None
    s = open(f).read()
    w = re.search(r'image\.width=(\d+)', s); h = re.search(r'image\.height=(\d+)', s)
    return max(int(w.group(1)), int(h.group(1))) if w and h else None

def vis_text(h):
    b = re.sub(r'<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>', '', h, flags=re.S)
    t = H.unescape(re.sub(r'<[^>]+>', '\n', b)); return re.sub(r'\n\s*\n+', '\n', t)

def parse_page(path, code):
    r = {'live_status': 'Not fetched'}
    if code == 'ERR' or not os.path.exists(path):
        r['live_status'] = 'Failed to load'; return r
    if str(code) == '404':
        r['live_status'] = 'Page missing (404)'; return r
    if str(code) != '200':
        r['live_status'] = f'HTTP {code}'; return r
    h = open(path, encoding='utf-8', errors='ignore').read(); prod = None
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try: j = json.loads(m.group(1))
        except Exception: continue
        if isinstance(j, dict) and j.get('@type') == 'Product': prod = j
    if not prod:
        r['live_status'] = 'Loaded but no product data'; return r
    r['live_status'] = 'Live'
    r['live_title'] = H.unescape(prod.get('name', '')).strip()
    r['live_desc'] = H.unescape(re.sub(r'<[^>]+>', ' ', prod.get('description', '') or '')).strip()
    offs = prod.get('offers') or []
    if isinstance(offs, dict):
        offs = offs.get('offers') or [] if offs.get('@type') == 'AggregateOffer' else [offs]
    sellers = list(dict.fromkeys((o.get('seller') or {}).get('name') for o in offs if isinstance(o, dict)))
    r['live_sellers'] = ', '.join(s for s in sellers if s)
    ours = [o for o in offs if isinstance(o, dict) and (o.get('seller') or {}).get('name') == OUR_SELLER]
    r['our_offer_shown'] = bool(ours)
    r['our_in_stock'] = any('InStock' in str(o.get('availability')) for o in ours)
    imgs = prod.get('image') or []
    imgs = [imgs] if isinstance(imgs, str) else imgs
    base = list(dict.fromkeys(H.unescape(u).split('?')[0] for u in imgs))
    r['live_images'] = len(base); r['live_main_img'] = base[0] if base else ''
    m = re.search(r'<section id="features-and-benefits">(.*?)</section>', h, re.S)
    r['live_bullets'] = [H.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in re.findall(r'<li[^>]*>(.*?)</li>', m.group(1), re.S)] if m else []
    t = vis_text(h)
    m = re.search(r'Product review rating: ([\d.]+) stars out of 5 from (\d+) product review', t)
    r['live_reviews'] = int(m.group(2)) if m else 0
    r['live_rating'] = float(m.group(1)) if m else None
    m = re.search(r'Sold (?:& )?shipped by\s*\n?\s*([^\n]+)', t)
    r['buybox_seller_live'] = m.group(1).strip() if m else (sellers[0] if sellers else '')
    sig = []
    for pat in [r'\d+ people bought this in \d+ hours', r'Sold \d+ times in the last[^\n]*', r'number \d+\s*best seller[^\n]*', r'\d+ people have repurchased[^\n]*', r'[Tt]rending now[^\n]*']:
        sig += [x.strip() for x in re.findall(pat, t) if '{' not in x]
    r['live_signs'] = '; '.join(dict.fromkeys(sig))
    return r

# Variant codes found by hand to be the same product (e.g. from the 29 Oct list). Kept in a local file
# variant_merges.json next to this script ({"CODE-A": "CODE-B", ...}) so no real SKUs are in the code.
MERGES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'variant_merges.json')
VARIANT_MERGES = json.load(open(MERGES_FILE)) if os.path.exists(MERGES_FILE) else {}

def build_groups(T):
    """T: DataFrame with columns sku, ean, title, variant (index = row id). Returns (groups, links)."""
    uf = UF(); links = defaultdict(set)
    def link(i, j, why):
        if i == j: return
        uf.u(i, j); links[frozenset((i, j))].add(why)
    for _, g in T[T.ean.fillna('').str.len() > 0].groupby('ean'):
        idx = list(g.index)
        for j in idx[1:]: link(idx[0], j, 'same EAN')
    var = T.variant.map(lambda v: VARIANT_MERGES.get(v, v) if isinstance(v, str) and v.strip() else None)
    for v, g in T[var.notna()].groupby(var[var.notna()]):
        idx = list(g.index)
        for j in idx[1:]: link(idx[0], j, 'same variant code')
    tok = T['title'].map(norm_tokens)
    nkey = tok.map(lambda t: ' '.join(sorted(set(t))))
    ok = tok.map(len) >= 3
    for k, g in T[ok].groupby(nkey[ok]):
        for st, gg in g.groupby(g.sku.map(sku_stem)):   # same title only counts within the same SKU stem
            ii = list(gg.index)                         # (colour/size variants often share one title)
            for j in ii[1:]: link(ii[0], j, 'same title')
    blocks = defaultdict(list)
    for i, t in tok.items():
        if len(set(t)) >= 4: blocks[' '.join(sorted(w for w in set(t) if re.search(r'\d', w)))].append(i)
    for b, idx in blocks.items():
        sets = {i: set(tok[i]) for i in idx}
        for x in range(len(idx)):
            for y in range(x + 1, len(idx)):
                i, j = idx[x], idx[y]
                if sku_stem(T.at[i, 'sku']) != sku_stem(T.at[j, 'sku']): continue
                dif = sets[i] ^ sets[j]
                if 0 < len(dif) <= 2 and len(sets[i] - sets[j]) <= 1 and len(sets[j] - sets[i]) <= 1 and not (dif & (COLOURS | MATERIALS)) and not any(re.search(r'\d', w) for w in dif):
                    if len(sets[i] & sets[j]) >= 5: link(i, j, 'near-identical title')
    groups = defaultdict(list)
    for i in T.index:
        if i in uf.p: groups[uf.f(i)].append(i)
    groups = [sorted(g, key=lambda i: T.at[i, 'sku']) for g in groups.values() if len(g) > 1]
    groups.sort(key=lambda g: T.at[g[0], 'sku'])
    return groups, links

# ---------------------------------------------------------------- optional AI second opinion
def ai_score(title, desc, bullets, cache, log=print):
    """0-10 shopper-quality score from Gemini for public listing text. Cached; returns None if unavailable/invalid."""
    import urllib.request
    text = f'TITLE: {title}\nKEY POINTS: ' + ' | '.join(bullets or []) + f'\nDESCRIPTION: {str(desc)[:3000]}'
    key = hashlib.sha256((AI_MODEL + text).encode()).hexdigest()[:24]
    os.makedirs(cache, exist_ok=True); f = os.path.join(cache, key + '.json')
    if os.path.exists(f):
        v = json.load(open(f)).get('score'); return v if isinstance(v, int) else None
    k = os.environ.get('GEMINI_API_KEY')
    if not k: return None
    prompt = ('Rate this B&Q marketplace product listing for shopper quality (clear title, useful key points, factual readable description). '
              'Reply with JSON only: {"score": <integer 0-10>}.\n\n' + text)
    body = json.dumps({'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'}}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{AI_MODEL}:generateContent', data=body,
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': k})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.load(r)
            t = j['candidates'][0]['content']['parts'][0]['text']
            v = json.loads(re.search(r'\{.*\}', t, re.S).group(0)).get('score')
            v = int(v) if isinstance(v, (int, float)) and 0 <= v <= 10 else None
            json.dump({'score': v}, open(f, 'w')); time.sleep(4.5)
            return v
        except Exception as ex:
            code = getattr(ex, 'code', '')
            time.sleep(20 if code == 429 else 5)
    log('  AI score unavailable for one listing (kept rule-based result)')
    return None

def ai_pass(F, cache, log=print):
    dl = F[F.decision == 'Delete (verified)']
    need = set(dl.index) | set(F[F.sku.isin(dl.kept_sku) & (F.role == 'Best')].index)
    log(f'AI second opinion on {len(need)} listings ({AI_MODEL}) ...')
    F['ai_score'] = None
    for i in sorted(need):
        F.at[i, 'ai_score'] = ai_score(F.at[i, 'shown_title'], F.at[i, '_desc'], F.at[i, '_bul'], cache, log)
    best = F[F.role == 'Best'].set_index('group').ai_score.to_dict()
    for i in dl.index:
        a_, b_ = F.at[i, 'ai_score'], best.get(F.at[i, 'group'])
        if a_ is not None and b_ is not None and a_ > b_ + AI_MARGIN:
            F.at[i, 'decision'] = 'Check'
            F.at[i, 'why'] += f'; AI second opinion rates this listing stronger ({a_} vs {b_}) - check before deleting'
    return F

# ---------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description='Find duplicate B&Q listings (report only).')
    ap.add_argument('--offers'); ap.add_argument('--products'); ap.add_argument('--access')
    ap.add_argument('--orders', nargs='*'); ap.add_argument('--prev-list', help='earlier duplicates xlsx to compare (Group no / Offer SKU)')
    ap.add_argument('--live', action='store_true', help='check public B&Q pages (read-only, ~1 request/second)')
    ap.add_argument('--cache', help='folder for downloaded pages (default cache/pages_<date>)')
    ap.add_argument('--out', default='/workspace/send'); ap.add_argument('--date', default=dt.date.today().isoformat())
    ap.add_argument('--delay', type=float, default=1.0)
    ap.add_argument('--offline', action='store_true', help='with --live: use saved pages only, never go online (tests)')
    ap.add_argument('--no-auto', action='store_true', help='do not auto-pick files; use only the files given')
    ap.add_argument('--max-age-days', type=int, default=3, help='warn when the offer export is older than this')
    ap.add_argument('--dashboard', default=os.path.join(HERE, 'out', 'dashboard_dup.json'), help="dashboard JSON path ('' = do not write)")
    ap.add_argument('--ai', action='store_true', help='optional AI second opinion on delete rows (needs env GEMINI_API_KEY; works without it)')
    a = ap.parse_args(argv)
    log = lambda *x: print(*x, flush=True)
    a.warnings = []
    if a.no_auto:
        a.orders = a.orders or []
        globals()['SEARCH_DIRS'] = []

    a.offers = a.offers or newest(['offers*.csv', '*offer*.csv'], lambda f: is_offer_export(f) and 'inactive' not in os.path.basename(f) and 'duplicat' not in os.path.basename(f))
    a.products = a.products or newest(['export-products-*.xlsx', 'live_export/export-products-*.xlsx'])
    a.access = a.access or newest(['Access_*.xlsx'])
    if not a.orders:
        a.orders = sorted({f for d in SEARCH_DIRS + ['/home/box/Downloads/*'] for p in ['orders*.csv', '*/orders*.csv'] for f in glob.glob(os.path.join(d, p)) if is_orders(f)})
        x = newest(['orders_last90d.xlsx', '*/orders_last90d.xlsx'])
        if x: a.orders.append(x)
    a.prev_list = a.prev_list or newest(['out_*/B&Q Duplicate Listings List*.xlsx'])
    src = {'Offer export': a.offers, 'Catalog (product) export': a.products, 'Access export': a.access, 'Earlier duplicate list': a.prev_list}
    for k, v in src.items(): log(f'{k}: {v}')
    log(f'Order files: {len(a.orders)}')
    if not a.offers: raise InputError('No offer export found. Download Offers > Export (all offers, incl. inactive) from the B&Q portal and pass --offers.')

    # ---- offers
    O = load_table(a.offers, ['Offer SKU', 'Product SKU', 'Product', 'Activated', 'Quantity', 'Price'], 'Offer export')
    age = (time.time() - file_date(a.offers)) / 86400
    if age > a.max_age_days:
        a.warnings.append(f'Offer export is {age:.0f} days old - download a fresh full offer export for current stock/status.')
    if not O['Activated'].str.lower().eq('no').any():
        a.warnings.append('Offer export has NO inactive offers - 0-stock listings are missing. Export ALL offers (incl. inactive).')
    if not a.products: a.warnings.append('No catalog (product) export - photo/description scores use the live page only.')
    if not a.access: a.warnings.append('No Access export - variant-code links are not used; groups rely on EAN/title.')
    if not a.orders: a.warnings.append('No order files - nobody shows sales, so nothing can be deleted safely; deletes still need page checks.')
    for w_ in a.warnings: log('WARNING:', w_)
    O['sku'] = O['Offer SKU'].str.strip(); O['ean'] = O['Product SKU'].fillna(O.get('EAN')).str.strip()
    O['active'] = O['Activated'].str.lower().eq('yes')
    O['qty'] = pd.to_numeric(O['Quantity'], errors='coerce').fillna(0)
    O['price'] = pd.to_numeric(O['Price'], errors='coerce')
    O = O.drop_duplicates('sku').reset_index(drop=True)
    # ---- catalog
    C = None
    if a.products:
        if not os.path.exists(a.products): raise InputError(f'Catalog export: file not found: {a.products}')
        try: raw = pd.read_excel(a.products, sheet_name='Data', header=None, dtype=str)
        except Exception as ex: raise InputError(f'Catalog export: {os.path.basename(a.products)} has no "Data" sheet - use Catalog > Export products (xlsx).')
        if 'Shop SKU' not in list(raw.iloc[0]) or 'EAN' not in list(raw.iloc[0]): raise InputError('Catalog export: Data sheet lacks Shop SKU / EAN columns.')
        labels = list(raw.iloc[0]); raw = raw.iloc[2:].reset_index(drop=True)
        raw.columns = [f'{i}|{c}' for i, c in enumerate(labels)]
        col = lambda name: next((c for c in raw.columns if c.split('|', 1)[1] == name), None)
        imgc = [c for c in raw.columns if re.search(r'\|(Main Image 1|Secondary Image \d)$', c)]
        attrc = [c for c in raw.columns if int(c.split('|')[0]) > 13]
        C = pd.DataFrame({'cat_sku': raw[col('Shop SKU')], 'cat_ean': raw[col('EAN')], 'cat_name': raw[col('Name')],
                          'cat_category': raw[col('Category')], 'cat_desc': raw[col('Body Copy')], 'cat_sell': raw[col('Selling Copy')],
                          'cat_keyfeat': raw[col('Key Feature')], 'cat_ptype': raw[col('Product type')],
                          'cat_images': raw[imgc].notna().sum(axis=1), 'cat_attrs': raw[attrc].notna().sum(axis=1)})
    def cat_row(r):
        if C is None: return None
        m = C[C.cat_ean == r.ean]
        if m.empty: m = C[C.cat_sku == r.sku]
        return m.iloc[0] if not m.empty else None
    # ---- access (variant code, reviews, buy box)
    A = load_table(a.access, ['sku', 'Variant code'], 'Access export') if a.access else pd.DataFrame(columns=['sku'])
    A = A.drop_duplicates('sku').set_index('sku') if 'sku' in A else A
    # ---- orders
    L = []
    for f in a.orders:
        d = load_table(f, ['Date created', 'Order number', 'Quantity', 'Status', 'Amount', 'Product SKU', 'Offer SKU', 'Order line no.'], 'Orders file')
        d['_m'] = os.path.getmtime(f); L.append(d[['Date created', 'Order number', 'Quantity', 'Status', 'Amount', 'Product SKU', 'Offer SKU', 'Order line no.', '_m']])
    R = pd.concat(L).sort_values('_m', kind='stable').drop_duplicates('Order line no.', keep='last') if L else pd.DataFrame()
    if len(R):
        R['dt'] = pd.to_datetime(R['Date created'], format='%d/%m/%Y - %H:%M:%S', errors='coerce')
        R['dt'] = R.dt.fillna(pd.to_datetime(R['Date created'], dayfirst=True, errors='coerce'))
        R['q'] = pd.to_numeric(R.Quantity, errors='coerce').fillna(0); R['amt'] = pd.to_numeric(R.Amount, errors='coerce').fillna(0)
        R = R[R.Status.str.lower() != 'cancelled']
        R['osku'] = R['Offer SKU'].str.strip()
        S = R.groupby('osku').agg(units=('q', 'sum'), orders=('Order number', 'nunique'), revenue=('amt', 'sum'), last_sale=('dt', 'max'))
        SE = R.groupby('Product SKU').q.sum()
        order_range = (R.dt.min(), R.dt.max())
    else:
        S = pd.DataFrame(columns=['units', 'orders', 'revenue', 'last_sale']); SE = pd.Series(dtype=float); order_range = (None, None)

    # ---- grouping
    O['variant'] = O.sku.map(lambda s: A.loc[s, 'Variant code'] if s in A.index and 'Variant code' in A else None)
    O['title'] = O['Product']
    groups, links = build_groups(O)
    O['tok'] = O['title'].map(norm_tokens)
    log(f'offers: {len(O)} ({O.active.sum()} active, {(~O.active).sum()} inactive); duplicate groups: {len(groups)}')

    # ---- previous list
    prev = {}
    if a.prev_list:
        try:
            P = pd.read_excel(a.prev_list, sheet_name='Duplicates', dtype=str)
            prev = dict(zip(P['Offer SKU'].str.strip(), P['Group no']))
        except Exception as ex:
            log('could not read earlier list:', ex)

    # ---- live pages
    allidx = [i for g in groups for i in g]
    def link_of(i):
        s = O.at[i, 'sku']
        u = A.loc[s, 'product_url'] if s in A.index and 'product_url' in A else None
        return u if isinstance(u, str) and u.startswith('http') else f'https://www.diy.com/departments/x/{O.at[i, "ean"]}_BQ.prd'
    cache = a.cache or os.path.join(HERE, 'cache', f'pages_{a.date}')
    fetched = {}
    if a.live:
        need = list(dict.fromkeys((O.at[i, 'ean'], link_of(i)) for i in allidx))
        need = list({e: (e, u) for e, u in need}.values())
        fetched = fetch_pages(need, cache, a.delay, log, offline=a.offline)

    # ---- per-offer rows
    rows = []
    for gno, g in enumerate(groups, 1):
        for i in g:
            o = O.loc[i]; c = cat_row(o); s = o.sku
            r = dict(group=gno, sku=s, ean=o.ean, name=H.unescape(str(o['Product'])), link=link_of(i), category=o.get('Category Label'),
                     active='Active' if o.active else 'Inactive', qty=int(o.qty), inactive_reason=o.get('Inactivity reason') or '',
                     price=o.price, variant=o.variant or '', ean_valid=gtin_ok(o.ean),
                     acc_reviews=pd.to_numeric(A.loc[s, 'Reviews'], errors='coerce') if s in A.index and 'Reviews' in A else None,
                     acc_bb_seller=A.loc[s, 'seller'] if s in A.index and 'seller' in A else None,
                     prev_group=prev.get(s, ''))
            r['units'] = float(S.loc[s, 'units']) if s in S.index else 0.0
            r['orders'] = int(S.loc[s, 'orders']) if s in S.index else 0
            r['revenue'] = round(float(S.loc[s, 'revenue']), 2) if s in S.index else 0.0
            r['last_sale'] = S.loc[s, 'last_sale'] if s in S.index else None
            r['ean_units_all_skus'] = float(SE.get(o.ean, 0))
            ptype = (c['cat_ptype'] if c is not None else None) or o.get('Category Label') or ''
            title = o['Product']; desc = c['cat_desc'] if c is not None else ''
            if c is not None and isinstance(c['cat_sell'], str): desc = f"{desc or ''} {c['cat_sell']}"
            bullets = [c['cat_keyfeat']] if c is not None and isinstance(c['cat_keyfeat'], str) else []
            nimg = int(c['cat_images']) if c is not None else 0
            r['in_catalog'] = c is not None
            r['cat_attrs'] = int(c['cat_attrs']) if c is not None else 0
            r['cat_category'] = c['cat_category'] if c is not None else ''
            lv = {}
            if a.live:
                f = fetched.get(o.ean)
                lv = parse_page(os.path.join(cache, o.ean + '.html'), f[1] if f else 'ERR')
                lv['live_checked'] = f[3] if f else ''
                if lv.get('live_status') == 'Live':
                    title = lv['live_title'] or title; desc = lv['live_desc'] or desc
                    if lv['live_bullets']: bullets = lv['live_bullets']
                    nimg = lv['live_images']
                    lv['main_px'] = None if a.offline else main_image_px(lv.get('live_main_img'), cache)
            r.update({k: v for k, v in lv.items() if k not in ('live_desc', 'live_bullets', 'live_main_img')})
            r['photos'] = nimg
            r['img_score'] = image_score(nimg, lv.get('main_px'))
            r['title_score'], r['title_len'], r['title_why'] = title_score(title, ptype)
            r['desc_score'], r['desc_words'], r['desc_why'] = desc_score(desc, title)
            r['bullet_score'], r['bullets'], r['bullet_why'] = bullet_score(bullets)
            r['shown_title'] = H.unescape(str(title)); r['_desc'] = H.unescape(str(desc or '')); r['_bul'] = list(bullets)
            rows.append(r)
    D = pd.DataFrame(rows)
    if D.empty: raise InputError('No duplicate groups found in this offer export.')
    # attributes relative to the best in the group
    D['attr_score'] = D.groupby('group').cat_attrs.transform(lambda x: (10 * x / x.max()).round() if x.max() > 0 else 0).astype(int)
    pen = (~D.ean_valid) * 5 + D.cat_category.fillna('').str.contains('DO NOT USE') * 5
    D['strength'] = ((D.img_score + D.title_score + D.desc_score + D.bullet_score + D.attr_score) * 2 - pen * 2).clip(lower=0).astype(int)
    D['reviews'] = D.get('live_reviews', pd.Series(index=D.index, dtype=float)).where(D.get('live_status', '') == 'Live') if a.live else None
    D['reviews'] = D['reviews'].fillna(D.acc_reviews).fillna(0).astype(int) if 'reviews' in D else D.acc_reviews.fillna(0)
    D['winning_bb'] = (D.get('buybox_seller_live', pd.Series('', index=D.index)).fillna('').eq(OUR_SELLER)) | (D.acc_bb_seller.fillna('').eq(OUR_SELLER) & (D.get('live_status', '') != 'Live'))
    D['has_sales'] = D.units > 0
    D['sales_signs'] = D.get('live_signs', pd.Series('', index=D.index)).fillna('')

    # ---- decide
    def fixes(r):
        f = []
        if r['img_score'] < FIX_BELOW: f.append(f"images ({r['photos']} photos, score {r['img_score']})")
        if r['title_score'] < FIX_BELOW: f.append(f"title ({r['title_why']})")
        if r['desc_score'] < FIX_BELOW: f.append(f"description ({r['desc_why']})")
        if r['bullet_score'] < FIX_BELOW: f.append(f"bullets ({r['bullet_why']})")
        if 'image-prompt' in str(r['desc_why']) and not any(x.startswith('description') for x in f): f.append('description (contains image-prompt text)')
        return f
    def keep_flag(r):
        f = fixes(r); r['fix'] = '; '.join(f)
        return 'Keep - fix' if f else 'Keep - no fix'
    def similar(u1, u2):
        if u1 >= HIGH_SALES and u2 >= HIGH_SALES: return abs(u1 - u2) / max(u1, u2) * 100 <= SIMILAR_PCT
        if u1 < HIGH_SALES and u2 < HIGH_SALES: return abs(u1 - u2) <= LOW_SIMILAR_UNITS
        return False
    out = []
    for gno, g in D.groupby('group', sort=True):
        g = g.copy()
        g['_rank'] = list(zip(-g.has_sales.astype(int), -g.units, -g.active.eq('Active').astype(int), -g.strength, -g.reviews, -g.winning_bb.astype(int), g.price.fillna(1e9), g.sku))
        g = g.sort_values('_rank', key=lambda s: s.map(lambda x: x))
        keep = g.index[0]
        pk = [pack_of(t) for t in g.name]   # None = not stated (treated as a single item)
        packs = sorted({int(p) if p is not None else 1 for p in pk}) if any(p is not None for p in pk) else []
        reasons = []
        eans = g.ean.nunique(); pos = {sku: oi for oi, sku in O.sku.items()}
        oidx = [pos[x] for x in g.sku]
        kinds = set().union(*[links.get(frozenset((x, y)), set()) for x in oidx for y in oidx if x < y])
        if eans < len(g):
            dup = g[g.duplicated('ean', keep=False)]
            ss = ' vs '.join(dup.sku.map(lambda s: '-' + s.rsplit('-', 1)[-1]).tolist()) if dup.sku.map(sku_stem).nunique() == 1 else ' vs '.join(dup.sku)
            reasons.append(f'same EAN listed under {len(dup)} offer SKUs ({ss})')
        if eans > 1 and 'same variant code' in kinds: reasons.append('new EAN created for same product (same variant code, different EAN)')
        if eans > 1 and 'same title' in kinds: reasons.append('same title, different EAN')
        if eans > 1 and 'near-identical title' in kinds: reasons.append('near-identical title, different EAN (same SKU stem)')
        if len(packs) > 1: reasons.append('pack size differs between copies (' + ' vs '.join('pack of %d' % p if p > 1 else 'single/not stated' for p in packs) + ') - pack size code variant')
        why_dup = '; '.join(dict.fromkeys(reasons))
        live = a.live
        kept = g.loc[keep]
        kept_live_ok = (not live) or (kept.get('live_status') == 'Live')
        n_sell = int(g.has_sales.sum())
        case = 'one seller or none' if n_sell <= 1 else ''
        check_group = []
        if len(packs) > 1: check_group.append('different pack sizes - may not be true duplicates')
        if live and not kept_live_ok: check_group.append(f"kept copy page: {kept.get('live_status')}")
        rows_g = []
        for i in g.index:
            r = g.loc[i].to_dict(); r['why_dup'] = why_dup; r['fix'] = ''; r['keep_both'] = False
            r['group_size'] = len(g); r['rank'] = list(g.index).index(i) + 1
            r['kept_sku'] = kept.sku; r['kept_units'] = kept.units; r['kept_reviews'] = kept.reviews
            r['kept_strength'] = kept.strength; r['kept_live'] = kept.get('live_status', 'Not fetched')
            unclear = []
            if not live: unclear.append('live page not checked (run with --live)')
            else:
                if r.get('live_status') != 'Live': unclear.append(f"own page: {r.get('live_status')}")
                if not kept_live_ok: unclear.append(f"kept copy page: {kept.get('live_status')}")
            if len(packs) > 1: unclear.append('pack sizes differ')
            if r['active'] == 'Active' and kept.active == 'Inactive': unclear.append('kept copy is inactive (0 stock) while this one is active')
            if i == keep:
                r['role'] = 'Best'; r['decision'] = keep_flag(r)
                r['why'] = ('has the most sales' if kept.has_sales else 'only active copy' if (g.active == 'Active').sum() == 1 and kept.active == 'Active' else 'strongest listing') + f' (units {int(kept.units)}, strength {kept.strength}, reviews {kept.reviews})'
            elif r['has_sales']:
                # ---- 2+ copies sell: Karimulla's rules
                r['role'] = 'Normal'; u1, u2 = kept.units, r['units']
                tag = f"units {int(u2)} vs {int(u1)} on {kept.sku}; reviews {r['reviews']} vs {kept.reviews}; strength {r['strength']} vs {kept.strength}"
                if similar(u1, u2):
                    r['decision'] = keep_flag(r); r['keep_both'] = True; r['why'] = 'Case 1 - similar sales, keep both; ' + tag
                    case = 'Case 1 similar sales'
                elif u1 >= HIGH_SALES and u2 < HIGH_SALES:
                    if r['reviews'] > 0:
                        r['decision'] = 'Check'; r['why'] = 'Case 2 - lower seller has reviews; ' + tag
                    elif r['strength'] <= kept.strength and r['reviews'] <= kept.reviews:
                        if unclear: r['decision'] = 'Check'; r['why'] = 'Case 2/3 - lower seller is weaker, but unclear: ' + '; '.join(unclear) + '; ' + tag
                        elif r['ean_units_all_skus'] > r['units'] and r['ean'] != kept.ean: r['decision'] = 'Check'; r['why'] = 'EAN also sells under another SKU; ' + tag
                        else: r['decision'] = 'Delete (verified)'; r['why'] = f'Case 2/3 - low seller (<{HIGH_SALES}), no reviews, weaker listing than {kept.sku}; ' + tag
                    else:
                        r['decision'] = 'Check'; r['why'] = f'Case 2 - lower seller has the stronger listing (strength {r["strength"]} vs {kept.strength}) - move its content before deleting?; ' + tag
                    case = case or 'Case 2/3 high vs low seller'
                else:
                    r['decision'] = 'Check'; r['why'] = 'both sell but sales not similar and not high-vs-low; ' + tag
                    case = case or 'not clear'
            else:
                r['role'] = 'Normal'; issues = []
                if r['reviews'] > 0: issues.append(f"has {r['reviews']} reviews but no sales")
                if r['sales_signs']: issues.append('live page shows sales signs: ' + r['sales_signs'])
                base = ('inactive copy while ' + kept.sku + ' is active') if r['active'] == 'Inactive' and kept.active == 'Active' else f"weaker than {kept.sku} (strength {r['strength']} vs {kept.strength})"
                if issues:
                    r['decision'] = 'Check'; r['why'] = '; '.join(issues) + ' - keep unless you are sure'
                else:
                    if r['strength'] > kept.strength and not kept.has_sales and not (r['active'] == 'Inactive' and kept.active == 'Active'):
                        unclear.append('scores stronger than kept copy')
                    if r['strength'] > kept.strength and kept.has_sales:
                        base = f"no sales while {kept.sku} sells {int(kept.units)} units, but this listing scores stronger ({r['strength']} vs {kept.strength}) - move content first?"
                        unclear.append('stronger listing than kept copy')
                    if r['ean_units_all_skus'] > 0 and r['ean'] != kept.ean: unclear.append('EAN has sales under another SKU')
                    if unclear:
                        r['decision'] = 'Check'; r['why'] = base + '; unclear: ' + '; '.join(unclear)
                    else:
                        r['decision'] = 'Delete (verified)'; r['why'] = base + '; no sales in orders, no reviews or sales signs on live page, both pages checked live'
            rows_g.append(r)
        if any(r['keep_both'] for r in rows_g):
            for r in rows_g:
                if r['role'] == 'Best': r['keep_both'] = True; r['why'] = 'Case 1 - similar sales, keep both; ' + r['why']
        for r in rows_g:
            r['case'] = case or ('one seller' if n_sell == 1 else 'no sales')
            r['group_check'] = '; '.join(dict.fromkeys(check_group))
        out += rows_g
    F = pd.DataFrame(out)
    F['prev_status'] = F.groupby('group').prev_group.transform(lambda x: 'In earlier list' if (x != '').all() else ('Partly in earlier list' if (x != '').any() else 'New group'))
    a.ai_used = False
    if a.ai and a.live:
        F = ai_pass(F, os.path.join(HERE, 'cache', 'ai'), log); a.ai_used = F.ai_score.notna().any()
    return a, src, O, F, order_range, groups


# ---------------------------------------------------------------- output
COLS = [('group', 'Group no'), ('prev_status', 'New vs earlier list'), ('prev_group', 'Earlier group no'), ('group_size', 'Copies in group'),
        ('why_dup', 'Why duplicated'), ('sku', 'Offer SKU'), ('ean', 'EAN'), ('name', 'Product name'), ('link', 'B&Q link'),
        ('active', 'Activated'), ('qty', 'Quantity'), ('inactive_reason', 'Inactivity reason'), ('price', 'Our price'), ('variant', 'Variant code'),
        ('units', 'Units sold'), ('orders', 'Orders'), ('revenue', 'Revenue £ (inc VAT)'), ('last_sale', 'Last sale'), ('sales_status', 'Sales status'),
        ('live_checked', 'Live check date'), ('live_status', 'Live page status'), ('our_offer_shown', 'Our offer on page'), ('our_in_stock', 'Our offer in stock'),
        ('buybox_seller_live', 'Buy box seller'), ('reviews', 'Reviews'), ('live_rating', 'Rating'), ('sales_signs', 'Live sales signs'),
        ('photos', 'Photos'), ('main_px', 'Main image px'), ('img_score', 'Photo score /10'), ('title_len', 'Title length'), ('title_score', 'Title score /10'),
        ('title_why', 'Title notes'), ('desc_words', 'Description words'), ('desc_score', 'Description score /10'), ('desc_why', 'Description notes'),
        ('bullets', 'Key points'), ('bullet_score', 'Key points score /10'), ('bullet_why', 'Key points notes'), ('attr_score', 'Attributes score /10'),
        ('ean_valid', 'EAN check digit OK'), ('in_catalog', 'In catalog export'), ('strength', 'Strength /100'), ('rank', 'Rank in group'),
        ('ai_score', 'AI second opinion /10'), ('case', 'Sales case'),
        ('role', 'Recommendation (Best/Normal)'), ('decision', 'Final flag'), ('fix', 'What to fix'), ('why', 'Why'), ('group_check', 'Group note')]

def check_mask(F):
    """Rows for the Check sheet: flagged Check, a group note, or a group with 2+ keeps that is not a keep-both group."""
    multi = F.groupby('group').decision.transform(lambda x: x.str.startswith('Keep').sum()) > 1
    return (F.decision == 'Check') | (F.group_check.fillna('') != '') | (multi & ~F.keep_both.astype(bool))

def write(a, src, O, F, order_range, groups):
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment
    from openpyxl.utils import get_column_letter
    os.makedirs(a.out, exist_ok=True)
    F = F.copy()
    if 'ai_score' not in F: F['ai_score'] = ''
    F['sales_status'] = F.units.map(lambda u: 'Selling' if u > 0 else 'No sales')
    for c, _ in COLS:
        if c not in F: F[c] = ''
    F['last_sale'] = F.last_sale.map(lambda x: x.strftime('%Y-%m-%d %H:%M') if pd.notna(x) and x != '' else '')
    F = F.sort_values(['group', 'rank']).reset_index(drop=True)
    A = F[[c for c, _ in COLS]].rename(columns=dict(COLS))
    kept_link = F.set_index('sku').link.to_dict()
    DL = F[F.decision == 'Delete (verified)']
    DEL = pd.DataFrame({'Offer SKU': DL.sku, 'EAN': DL.ean, 'Product name': DL.name, 'B&Q link': DL.link,
                        'Kept instead (Offer SKU)': DL.kept_sku, 'Kept instead link': DL.kept_sku.map(kept_link),
                        'Units (this)': DL.units.astype(int), 'Units (kept)': DL.kept_units.astype(int),
                        'Reviews (this)': DL.reviews, 'Reviews (kept)': DL.kept_reviews,
                        'Strength (this)': DL.strength, 'Strength (kept)': DL.kept_strength,
                        'Live page (this)': DL.live_status, 'Live page (kept)': DL.kept_live, 'Live check date': DL.live_checked,
                        'Group no': DL.group, 'Reason': DL.why_dup + ' | ' + DL.why})
    KB = F[F.keep_both][[c for c, _ in COLS]].rename(columns=dict(COLS))
    FX = F[F.decision == 'Keep - fix'][['group', 'sku', 'ean', 'name', 'link', 'units', 'reviews', 'strength', 'img_score', 'title_score', 'desc_score', 'bullet_score', 'fix']].rename(columns=dict(COLS))
    CHK = F[check_mask(F)]
    CH = CHK[[c for c, _ in COLS]].rename(columns=dict(COLS))
    sizes = F.groupby('group').size()
    gs = F.groupby('group').agg(units=('units', 'sum'), rev=('revenue', 'sum'), n=('sku', 'size'), why=('why_dup', 'first'),
                                skus=('sku', lambda x: ', '.join(x)), keep=('kept_sku', 'first')).sort_values(['units', 'rev'], ascending=False)
    top = gs.head(10)
    fails = F[F.live_status.fillna('').ne('Live') & F.live_status.fillna('').ne('')]
    allinact = int(F.groupby('group').active.apply(lambda x: (x == 'Inactive').all()).sum())
    allact = int(F.groupby('group').active.apply(lambda x: (x == 'Active').all()).sum())
    prevskus = set()
    if src.get('Earlier duplicate list'):
        try: prevskus = set(pd.read_excel(src['Earlier duplicate list'], sheet_name='Duplicates', dtype=str)['Offer SKU'].str.strip())
        except Exception: pass
    prev_missing_offer = sorted(prevskus - set(O.sku)); prev_not_grouped = sorted((prevskus & set(O.sku)) - set(F.sku))
    gsum = F.groupby('group').agg(st=('prev_status', 'first'))
    r0, r1 = order_range
    summ = [
        ('Run date', a.date),
        ('Warnings', ' | '.join(getattr(a, 'warnings', [])) or 'none'),
        ('Offer export used', f"{src['Offer export']} (data date {dt.datetime.fromtimestamp(file_date(src['Offer export'])):%d %b %Y %H:%M})"),
        ('Offers in export', f'{len(O)} ({int(O.active.sum())} active, {int((~O.active).sum())} inactive - inactive offers ARE included)' if (~O.active).any() else f'{len(O)} - NO inactive offers in this export: fetch a full export (all offers) from the portal'),
        ('Catalog export used', f"{src['Catalog (product) export']} (data date {dt.datetime.fromtimestamp(file_date(src['Catalog (product) export'])):%d %b %Y %H:%M})" if src['Catalog (product) export'] else 'none found'),
        ('Access export used (variant codes, old reviews/buy box)', src['Access export'] or 'none'),
        ('Order files merged (deduped by order line)', len(a.orders)),
        ('Order date range', f'{r0:%d %b %Y %H:%M} to {r1:%d %b %Y %H:%M} (Mirakl export time, UK)' if r0 is not None else 'no orders'),
        ('Sales rule', 'Cancelled lines excluded; refunded lines still count as a sale. Matched by Offer SKU.'),
        ('Live check', 'yes - public B&Q pages, read-only, ~1 request/second' if a.live else 'NOT run (use --live) - so nothing can be Delete (verified)'),
        ('Duplicate groups', len(sizes)),
        ('  groups of 2 / 3 / 4+', f'{(sizes == 2).sum()} / {(sizes == 3).sum()} / {(sizes >= 4).sum()}'),
        ('  offers in groups', len(F)),
        ('  groups new vs earlier list', f"{(gsum.st == 'New group').sum()} new, {(gsum.st == 'In earlier list').sum()} same as earlier, {(gsum.st == 'Partly in earlier list').sum()} partly (grew or merged)"),
        ('  earlier-list SKUs no longer in offer export', f"{len(prev_missing_offer)}: {', '.join(prev_missing_offer[:30])}"),
        ('  earlier-list SKUs not grouped now', f"{len(prev_not_grouped)}: {', '.join(prev_not_grouped[:40])}"),
        ('  all copies active / all inactive', f'{allact} / {allinact}'),
        ('Thresholds', f'HIGH_SALES={HIGH_SALES} units, SIMILAR_PCT={SIMILAR_PCT}%, LOW_SIMILAR_UNITS={LOW_SIMILAR_UNITS}, FIX_BELOW={FIX_BELOW}/10'),
        ('AI second opinion', f'{AI_MODEL} on delete rows and their kept copies' if getattr(a, 'ai_used', False) else 'not used (rule-based scoring only)'),
        ('Regression vs earlier list', getattr(a, 'regression', 'not run')),
        ('Final flag: Keep - no fix', int((F.decision == 'Keep - no fix').sum())),
        ('Final flag: Keep - fix', int((F.decision == 'Keep - fix').sum())),
        ('Groups keeping both (Case 1 similar sales)', int(F[F.keep_both].group.nunique())),
        ('Final flag: Delete (verified)', int((F.decision == 'Delete (verified)').sum())),
        ('Final flag: Check', int((F.decision == 'Check').sum())),
        ('Groups needing a look (Check sheet)', int(CHK.group.nunique())),
        ('Groups with exactly one Keep', int((F[F.decision.str.startswith('Keep')].groupby('group').size() == 1).sum())),
        ('Offers selling / no sales', f"{int((F.units > 0).sum())} / {int((F.units == 0).sum())}"),
        ('Groups where more than one copy sells', int((F[F.units > 0].groupby('group').size() > 1).sum())),
        ('Best pick differs from earlier list Suggested keep', ''),
        ('Pages not live / failed', f"{len(fails)}: " + ', '.join(f'{r.ean} ({r.live_status})' for r in fails.itertuples())),
        ('', ''), ('Top 10 groups by units sold', '')]
    summ += [(f'Group {g}', f'{int(r.units)} units, £{r.rev:,.2f} - {r.skus} - keep {r.keep}') for g, r in top.iterrows()]
    # compare with earlier Suggested keep
    try:
        P = pd.read_excel(src['Earlier duplicate list'], sheet_name='Duplicates', dtype=str)
        pk = set(P.loc[P['Suggested keep'] == 'Keep', 'Offer SKU'].str.strip())
        best = F[F.role == 'Best']; comp = best[best.prev_status == 'In earlier list']
        diff = int((~comp.sku.isin(pk)).sum())
        summ = [(k, f'{diff} of {len(comp)} unchanged groups' if k.startswith('Best pick differs') else v) for k, v in summ]
    except Exception: pass
    how = [(x,) for x in open(os.path.join(HERE, 'README.md')).read().splitlines()] if os.path.exists(os.path.join(HERE, 'README.md')) else [('See README.md',)]
    xf = os.path.join(a.out, f'B&Q Duplicates Final {a.date}.xlsx')
    with pd.ExcelWriter(xf, engine='openpyxl') as w:
        DEL.to_excel(w, sheet_name='DELETE LIST', index=False)
        A.to_excel(w, sheet_name='All groups', index=False)
        CH.to_excel(w, sheet_name='Check', index=False)
        KB.to_excel(w, sheet_name='Keep both - fix', index=False)
        FX.to_excel(w, sheet_name='Fix list', index=False)
        pd.DataFrame(summ, columns=['Item', 'Value']).to_excel(w, sheet_name='Summary', index=False)
        pd.DataFrame(how, columns=['How it works']).to_excel(w, sheet_name='How it works', index=False)
    wb = openpyxl.load_workbook(xf)
    fills = {'Keep - no fix': 'C6EFCE', 'Keep - fix': 'E2EFDA', 'Delete (verified)': 'FFC7CE', 'Check': 'FFEB9C'}
    for ws in wb.worksheets:
        ws.freeze_panes = 'A2'
        if ws.max_row > 1 and ws.title not in ('How it works',): ws.auto_filter.ref = ws.dimensions
        for c in ws[1]: c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='D9E1F2'); c.alignment = Alignment(wrap_text=True, vertical='top')
        for i, col in enumerate(ws.columns, 1):
            hdr = str(col[0].value or '')
            wdt = 60 if hdr in ('Why', 'Why duplicated', 'Reason', 'Product name', 'Group note', 'Value', 'How it works') else 45 if 'link' in hdr.lower() else 14
            ws.column_dimensions[get_column_letter(i)].width = wdt
        hdrs = [c.value for c in ws[1]]
        if 'Final flag' in hdrs:
            k = hdrs.index('Final flag')
            for row in ws.iter_rows(min_row=2):
                f = fills.get(row[k].value)
                if f:
                    for c in row: c.fill = PatternFill('solid', fgColor=f)
        if ws.title == 'DELETE LIST':
            for row in ws.iter_rows(min_row=2):
                for c in row: c.fill = PatternFill('solid', fgColor='FFC7CE')
        for hn in ('B&Q link', 'Kept instead link'):
            if hn in hdrs:
                k = hdrs.index(hn)
                for row in ws.iter_rows(min_row=2):
                    if row[k].value: row[k].hyperlink = row[k].value; row[k].font = Font(color='0563C1', underline='single')
    wb.properties.created = dt.datetime(2000, 1, 1); wb.properties.modified = dt.datetime(2000, 1, 1)
    wb.save(xf)
    cf = os.path.join(a.out, f'delete_list_{a.date}.csv')
    DEL.drop(columns=['Product name']).to_csv(cf, index=False)
    print(f'\nWROTE {xf}\nWROTE {cf}')
    if getattr(a, 'dashboard', ''):
        write_dashboard(a, F, summ, order_range); print(f'WROTE {a.dashboard}')
    for k, v in summ: print(f'{k}: {v}' if k else '')
    return xf, cf

def _clean(v):
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating, float)): return None if pd.isna(v) else (int(v) if float(v).is_integer() else round(float(v), 2))
    if isinstance(v, (np.bool_, bool)): return bool(v)
    if v is None or (not isinstance(v, str) and pd.isna(v)): return None
    return str(v)

def write_dashboard(a, F, summ, order_range):
    """Data for the Duplicates card/tab of the dashboard (public B&Q links only, no keys)."""
    def rows(df, cols):
        return [{k: _clean(r[c]) for k, c in cols.items()} for _, r in df.iterrows()]
    base = {'group': 'group', 'sku': 'sku', 'ean': 'ean', 'name': 'name', 'link': 'link', 'active': 'active', 'units': 'units',
            'reviews': 'reviews', 'strength': 'strength', 'live': 'live_status', 'decision': 'decision', 'why': 'why', 'fix': 'fix'}
    dl = F[F.decision == 'Delete (verified)']
    chk = F[check_mask(F)]
    cnt = F.decision.value_counts()
    groups = []
    for g, d in F.sort_values(['group', 'rank']).groupby('group', sort=True):
        groups.append({'group': int(g), 'size': int(len(d)), 'why_duplicated': _clean(d.why_dup.iloc[0]), 'vs_29_oct': _clean(d.prev_status.iloc[0]),
                       'units': int(d.units.sum()), 'keep_both': bool(d.keep_both.any()), 'note': _clean(d.group_check.iloc[0]) or '',
                       'offers': rows(d, base)})
    out = {'tool': 'B&Q duplicate finder', 'run_date': a.date,
           'order_range': [order_range[0].strftime('%Y-%m-%d %H:%M') if order_range[0] is not None and pd.notna(order_range[0]) else None,
                           order_range[1].strftime('%Y-%m-%d %H:%M') if order_range[1] is not None and pd.notna(order_range[1]) else None],
           'summary': {'groups': int(F.group.nunique()), 'offers_in_groups': int(len(F)),
                       'groups_of_2': int((F.groupby('group').size() == 2).sum()), 'groups_of_3': int((F.groupby('group').size() == 3).sum()),
                       'groups_of_4_plus': int((F.groupby('group').size() >= 4).sum()),
                       'new_groups': int((F.groupby('group').prev_status.first() == 'New group').sum()),
                       'delete': int(cnt.get('Delete (verified)', 0)), 'check': int(cnt.get('Check', 0)), 'check_groups': int(chk.group.nunique()),
                       'keep_fix': int(cnt.get('Keep - fix', 0)), 'keep_no_fix': int(cnt.get('Keep - no fix', 0)),
                       'keep_both_groups': int(F[F.keep_both].group.nunique()), 'live_checked': bool(a.live),
                       'regression_29_oct': getattr(a, 'regression', '')},
           'notes': [f'{k}: {v}' for k, v in summ if k in ('Warnings', 'Offer export used', 'Order date range', 'Live check', 'Regression vs earlier list')],
           'delete_list': [dict(r, kept_instead=_clean(k), kept_units=_clean(u), kept_reviews=_clean(rv), kept_strength=_clean(st), kept_live=_clean(kl))
                           for r, k, u, rv, st, kl in zip(rows(dl, base), dl.kept_sku, dl.kept_units, dl.kept_reviews, dl.kept_strength, dl.kept_live)],
           'fix_list': rows(F[F.decision == 'Keep - fix'], dict(base, title_score='title_score', desc_score='desc_score', bullet_score='bullet_score', photo_score='img_score')),
           'check_list': rows(chk, dict(base, note='group_check')),
           'groups': groups}
    os.makedirs(os.path.dirname(os.path.abspath(a.dashboard)), exist_ok=True)
    with open(a.dashboard, 'w') as fh: json.dump(out, fh, indent=1, ensure_ascii=False)

def cli(argv=None):
    res = main(argv)
    a = res[0]
    try:   # regression: rebuild the earlier list from its own source and compare
        import regress
        if a.prev_list and getattr(a, 'prev_source', None) is not False and os.path.exists(regress.SRC):
            r = regress.run(verbose=False, ref=a.prev_list)[0]
            a.regression = (f"{r['exact']} of {r['ref_groups']} groups identical ({r['group_exact_pct']}%), {r['contained']} grew, {r['missing']} missing; "
                            f"offers {r['offer_recall']}% found ({r['got_offers']} vs {r['ref_offers']})")
        else:
            a.regression = 'not run (earlier list or its source file not found)'
    except Exception as ex:
        a.regression = f'not run ({ex.__class__.__name__})'
    return write(*res)

if __name__ == '__main__':
    try:
        cli()
    except InputError as ex:
        print('\nSTOPPED:', ex, file=sys.stderr); sys.exit(2)
