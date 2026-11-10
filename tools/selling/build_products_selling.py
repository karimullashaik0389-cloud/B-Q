#!/usr/bin/env python3
"""Build the Products selling dashboard and encrypt it like sales.enc / orders.enc.

The page is HTML. It is encrypted as BQE1 (AES-256-GCM, PBKDF2-SHA256, 600,000 rounds)
with the dashboard password. The password is never put on the command line. Set
BQ_PASSWORD or BQ_PASSWORD_FILE, the same way as tools/bqcrypt.py.

Nightly inputs
  --orders   Required. Either:
             * the Sales/Orders raw JSON the existing nightly build already writes
               ({"L": [[minutes, ..., units, ..., skuIndex, statusIndex], ...],
                "sku": [[sku, ...], ...], "st": ["status", ...]}), or
             * a CSV/XLSX export with columns for SKU, order date, quantity and status.
  --access   Optional Access / catalogue workbook. Used only to split UK and China
             (Main supplier name, or a UK/China column) and to count products with
             no B&Q sales. Without it, zero-sales and the UK/China split are omitted.
  --history  Optional JSON file of daily counts. This script appends today's counts.
             Keep it on the build machine (it is not committed). It stores counts, not SKUs.
  --html     Where to write the page before encryption (a private path, not the git repo).
  --enc      Where to write productselling.enc. Publish this next to sales.enc.

  python3 tools/selling/build_products_selling.py \
      --orders /path/to/orders-raw.json \
      --access /path/to/Access.xlsx \
      --history /workspace/bq/KEEP/products-selling-history.json \
      --html /tmp/productselling.html \
      --enc /path/published/productselling.enc

The 30-day window matches the Sales tab: not cancelled, and the order day is within
the newest order day and the 29 days before it. Yesterday is the day before that
newest order day. A newly selling SKU sold yesterday and in none of the 30 days before yesterday.
"""
import argparse, csv, datetime, html, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

DAY = 86400000

def day_of(ms):
    return (ms // DAY) * DAY

def iso(ms):
    return datetime.datetime.utcfromtimestamp(ms / 1000).strftime('%Y-%m-%d')

def load_orders(path):
    """-> (events [(ms, sku, qty, cancelled)], label)."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        doc = json.load(open(path, encoding='utf-8'))
        if isinstance(doc, dict) and 'L' in doc and 'sku' in doc and 'st' in doc:
            out = []
            for row in doc['L']:
                ms = int(row[0]) * 60000
                sku = str(doc['sku'][row[4]][0]).strip()
                qty = float(row[2] or 0)
                cancelled = doc['st'][row[5]] == 'Cancelled'
                if sku:
                    out.append((ms, sku, qty, cancelled))
            return out, 'orders raw JSON'
        raise SystemExit('orders JSON must be the Sales raw file (L, sku, st) or use a CSV/XLSX export')
    return load_table(path), os.path.basename(path)

def load_table(path):
    import datetime as dt
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xlsm', '.xls'):
        sys.path.insert(0, os.path.join(os.path.dirname(HERE), '..'))
        # openpyxl is enough; SheetJS is not required
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        rows = list(ws.iter_rows(values_only=True))
    else:
        with open(path, newline='', encoding='utf-8-sig') as f:
            rows = list(csv.reader(f))
    if not rows:
        raise SystemExit('orders file is empty')
    head = [str(c or '').strip().lower() for c in rows[0]]
    def col(*names):
        for n in names:
            if n in head:
                return head.index(n)
        return None
    i_sku = col('sku', 'b&q sku', 'offer sku')
    i_date = col('date', 'order date', 'created', 'order created', 'created at')
    i_qty = col('qty', 'quantity', 'units', 'qty ordered')
    i_status = col('status', 'order status')
    if i_sku is None or i_date is None:
        raise SystemExit('orders file needs a SKU column and a date column')
    out = []
    for r in rows[1:]:
        if i_sku >= len(r) or r[i_sku] is None:
            continue
        sku = str(r[i_sku]).strip()
        if not sku:
            continue
        raw = r[i_date]
        if isinstance(raw, dt.datetime):
            ms = int(raw.timestamp() * 1000)
        elif isinstance(raw, dt.date):
            ms = int(dt.datetime(raw.year, raw.month, raw.day).timestamp() * 1000)
        else:
            text = str(raw).strip()[:10]
            ms = int(dt.datetime.strptime(text, '%Y-%m-%d').timestamp() * 1000)
        qty = float(r[i_qty]) if i_qty is not None and i_qty < len(r) and r[i_qty] not in (None, '') else 1
        status = str(r[i_status]).strip().lower() if i_status is not None and i_status < len(r) and r[i_status] is not None else ''
        out.append((ms, sku, qty, status == 'cancelled'))
    return out

def load_catalogue(path):
    """-> {sku: 'UK'|'China'} from Access. Empty if no file."""
    if not path:
        return {}
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    name = 'B&QBB3' if 'B&QBB3' in wb.sheetnames else None
    if name is None:
        for n in wb.sheetnames:
            ws = wb[n]
            head = next(ws.iter_rows(max_row=8, values_only=True), None)
            if head and any(str(c or '').strip() == 'Estimated cost' for c in head):
                name = n
                break
    if name is None:
        name = '1 All' if '1 All' in wb.sheetnames else wb.sheetnames[0]
    ws = wb[name]
    rows = ws.iter_rows(values_only=True)
    header = None
    for row in rows:
        cells = [str(c or '').strip() for c in row]
        if 'sku' in [c.lower() for c in cells] or 'Estimated cost' in cells:
            header = cells
            break
    if not header:
        return {}
    low = [c.lower() for c in header]
    def find(*names):
        for n in names:
            if n.lower() in low:
                return low.index(n.lower())
        return None
    i_sku = find('sku', 'b&q sku')
    i_sup = find('main supplier name', 'supplier')
    i_uk = find('uk/china', 'uk china')
    out = {}
    if i_sku is None:
        return out
    for row in rows:
        sku = str(row[i_sku] or '').strip() if i_sku < len(row) else ''
        if not sku or sku in out:
            continue
        if i_uk is not None and i_uk < len(row) and str(row[i_uk] or '').strip():
            kind = 'China' if str(row[i_uk]).strip().lower().startswith('china') else 'UK'
        else:
            sup = str(row[i_sup] or '') if i_sup is not None and i_sup < len(row) else ''
            kind = 'China' if ('ashian' in sup.lower() or 'china' in sup.lower()) else 'UK'
        out[sku] = kind
    return out

def summarise(events, catalogue):
    live = [(ms, sku, qty) for ms, sku, qty, cancelled in events if not cancelled and qty]
    if not live:
        raise SystemExit('no orders left after cancelled rows are removed')
    last = max(ms for ms, _, _ in live)
    today = day_of(last)
    yday = today - DAY
    window = today - 29 * DAY
    prior_from = yday - 30 * DAY
    prior_to = yday - DAY
    sold30 = set()
    yday_skus = set()
    prior = set()
    by_day = defaultdict(set)
    for ms, sku, qty in live:
        d = day_of(ms)
        by_day[d].add(sku)
        if d >= window:
            sold30.add(sku)
        if d == yday:
            yday_skus.add(sku)
        if prior_from <= d <= prior_to:
            prior.add(sku)
    new = sorted(yday_skus - prior)
    def split(skus):
        if not catalogue:
            return None
        uk = sum(1 for s in skus if catalogue.get(s) == 'UK')
        cn = sum(1 for s in skus if catalogue.get(s) == 'China')
        known = uk + cn
        return {'uk': uk, 'china': cn, 'total': len(skus), 'unclassified': len(skus) - known}
    zero = None
    if catalogue:
        zero_skus = [s for s in catalogue if s not in sold30]
        zero = split(zero_skus)
    days = []
    # chart: up to 30 days ending on the newest order day
    for i in range(29, -1, -1):
        d = today - i * DAY
        days.append({'date': iso(d), 'sold': len(by_day.get(d, ()))})
    return {
        'asOf': iso(today),
        'yesterday': iso(yday),
        'sold30': split(sold30) or {'total': len(sold30)},
        'zero30': zero,
        'yesterdaySold': split(yday_skus) or {'total': len(yday_skus)},
        'newly': {'total': len(new), 'skus': new[:50], 'more': max(0, len(new) - 50)},
        'days': days,
        'catalogue': bool(catalogue),
    }

def load_history(path):
    if not path or not os.path.exists(path):
        return []
    doc = json.load(open(path, encoding='utf-8'))
    return list(doc.get('days') or [])

def save_history(path, summary, prev):
    by = {d['date']: d for d in prev}
    by[summary['asOf']] = {'date': summary['asOf'], 'sold': summary['sold30']['total'], 'new': summary['newly']['total']}
    days = [by[k] for k in sorted(by)][-120:]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    json.dump({'days': days}, open(path, 'w', encoding='utf-8'), indent=2)
    return days

def page(summary, history):
    def n(v):
        return '–' if v is None else f'{int(v):,}'
    def cells(block):
        if not block:
            return '<td>–</td><td>–</td><td>–</td>'
        return f"<td>{n(block.get('uk'))}</td><td>{n(block.get('china'))}</td><td>{n(block.get('total'))}</td>"
    bars = history or [{'date': d['date'], 'sold': d['sold']} for d in summary['days']]
    peak = max([1] + [int(d.get('sold') or 0) for d in bars])
    w, h, gap = 18, 120, 4
    svg = [f'<svg viewBox="0 0 {len(bars)*(w+gap)} {h+28}" role="img" aria-label="Distinct products sold per day">']
    for i, d in enumerate(bars):
        sold = int(d.get('sold') or 0)
        bh = int(round(sold / peak * h))
        x = i * (w + gap)
        svg.append(f'<rect x="{x}" y="{h-bh}" width="{w}" height="{bh}" fill="#FF6600"><title>{html.escape(d["date"])}: {sold}</title></rect>')
    svg.append('</svg>')
    note = '' if summary['catalogue'] else '<p class="note">UK / China and the zero-sales count need the Access file. This build did not have one.</p>'
    new_rows = ''.join(f'<li>{html.escape(s)}</li>' for s in summary['newly']['skus'])
    more = f"<p class=\"note\">And {summary['newly']['more']} more.</p>" if summary['newly']['more'] else ''
    return f'''<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B&amp;Q Products selling</title>
<style>
body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F8FAFC;color:#0F172A}}
main{{max-width:880px;margin:0 auto;padding:24px 16px 48px}}
h1{{font-size:28px;margin:0 0 4px}} .asof{{color:#475569;margin:0 0 18px}}
.cards{{display:flex;flex-wrap:wrap;gap:12px}} .card{{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 16px;min-width:180px;flex:1}}
.card b{{display:block;font-size:28px}} .card span{{color:#475569;font-size:14px}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin:18px 0}}
th,td{{padding:10px 12px;text-align:right;border-bottom:1px solid #E2E8F0}} th:first-child,td:first-child{{text-align:left}}
.chart{{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px;overflow-x:auto}}
svg{{width:100%;height:160px}} .note{{color:#475569;font-size:14px}}
</style></head><body><main>
<h1>Products selling</h1>
<p class="asof">Orders up to {html.escape(summary["asOf"])}. Counts are distinct SKUs. Cancelled orders are not included.</p>
{note}
<div class="cards">
<div class="card"><b>{n(summary["sold30"]["total"])}</b><span>Sold on B&amp;Q in the last 30 days</span></div>
<div class="card"><b>{n(summary["zero30"]["total"] if summary["zero30"] else None)}</b><span>No B&amp;Q sales in the last 30 days</span></div>
<div class="card"><b>{n(summary["yesterdaySold"]["total"])}</b><span>Sold yesterday ({html.escape(summary["yesterday"])})</span></div>
<div class="card"><b>{n(summary["newly"]["total"])}</b><span>Newly selling (yesterday, none in the 30 days before)</span></div>
</div>
<table><thead><tr><th></th><th>UK</th><th>China</th><th>Total</th></tr></thead><tbody>
<tr><td>Sold in the last 30 days</td>{cells(summary["sold30"])}</tr>
<tr><td>No sales in the last 30 days</td>{cells(summary["zero30"])}</tr>
<tr><td>Sold yesterday</td>{cells(summary["yesterdaySold"])}</tr>
</tbody></table>
<h2>Each day</h2>
<div class="chart">{''.join(svg)}</div>
<h2>Newly selling</h2>
<ul>{new_rows or '<li>None</li>'}</ul>
{more}
</main></body></html>'''

def main():
    ap = argparse.ArgumentParser(description='Build and encrypt the Products selling dashboard')
    ap.add_argument('--orders', required=True)
    ap.add_argument('--access')
    ap.add_argument('--history')
    ap.add_argument('--html', required=True)
    ap.add_argument('--enc')
    a = ap.parse_args()
    events, _ = load_orders(a.orders)
    cat = load_catalogue(a.access) if a.access else {}
    summary = summarise(events, cat)
    hist = load_history(a.history)
    if a.history:
        hist = save_history(a.history, summary, hist)
    html_text = page(summary, hist)
    os.makedirs(os.path.dirname(os.path.abspath(a.html)) or '.', exist_ok=True)
    open(a.html, 'w', encoding='utf-8').write(html_text)
    if a.enc:
        import bqcrypt
        os.makedirs(os.path.dirname(os.path.abspath(a.enc)) or '.', exist_ok=True)
        open(a.enc, 'wb').write(bqcrypt.encrypt(html_text.encode('utf-8')))
    print(json.dumps({'asOf': summary['asOf'], 'sold30': summary['sold30']['total'], 'zero30': None if not summary['zero30'] else summary['zero30']['total'], 'yesterday': summary['yesterdaySold']['total'], 'newly': summary['newly']['total']}))

if __name__ == '__main__':
    main()
