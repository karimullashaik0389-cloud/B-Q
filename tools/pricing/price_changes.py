#!/usr/bin/env python3
"""Last selling-price change per SKU, for the tab 5 UK 3-day hold (WEEKLY HOLD).

Built from daily B&Q offers exports (offers_active_YYYY-MM-DD.csv / .xlsx) and later
uploaded price CSVs (uploaded_prices_YYYY-MM-DD*.csv / .xlsx). A date counts as a
change when the live selling price that day differs from the previous snapshot by
more than 1p. The first snapshot is only a baseline (it cannot show a change).
Same-day uploads are applied after that day's offers file.

The nightly refresh_and_publish.py run of build_pricing.py embeds the result in
pricing.enc as doc['priceChanges'] / doc['asOf'].
"""
from __future__ import print_function
import csv, glob, io, os, re, datetime

DEFAULT_INCOMING = '/workspace/bq/incoming'
PENNY = 0.0100001


def _num(v):
    if v is None or v == '':
        return None
    try:
        return float(str(v).replace('£', '').replace(',', '').strip())
    except Exception:
        return None


def _file_date(path):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(path))
    return m.group(1) if m else None


def _get(row, *names):
    lower = {str(k).strip().lower(): k for k in row if k is not None and str(k).strip() != ''}
    for n in names:
        k = lower.get(n.lower())
        if k is not None:
            return row[k]
    return None


def _read_csv_rows(path):
    with open(path, encoding='utf-8-sig', errors='replace', newline='') as fh:
        text = fh.read()
    if not text.strip():
        return []
    first = text.splitlines()[0]
    delim = ';' if first.count(';') >= first.count(',') else ','
    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def _read_xlsx_rows(path):
    try:
        import openpyxl
    except ImportError:
        return []
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return []
    hdr = [str(x).strip() if x is not None else '' for x in rows[0]]
    out = []
    for r in rows[1:]:
        if not r:
            continue
        out.append({hdr[i]: r[i] if i < len(r) else None for i in range(len(hdr)) if hdr[i]})
    return out


def _read_rows(path):
    if path.lower().endswith(('.xlsx', '.xlsm')):
        return _read_xlsx_rows(path)
    return _read_csv_rows(path)


def _prices_from_offers(path):
    """Live selling price that day: the Price / price column (already the discounted price when a discount is on)."""
    out = {}
    for r in _read_rows(path):
        sku = (_get(r, 'Offer SKU', 'offer-sku', 'sku') or '')
        sku = str(sku).strip()
        if not sku:
            continue
        p = _num(_get(r, 'Price', 'price', 'Offer price'))
        if p is None:
            continue
        if sku not in out:
            out[sku] = round(p, 2)
    return out


def _prices_from_upload(path):
    out = {}
    for r in _read_rows(path):
        sku = (_get(r, 'offer-sku', 'Offer SKU', 'sku') or '')
        sku = str(sku).strip()
        if not sku:
            continue
        p = _num(_get(r, 'price', 'Price', 'Offer price'))
        if p is None:
            continue
        out[sku] = round(p, 2)
    return out


def list_source_files(incoming=None):
    """[(date, kind, path)] sorted: date, then offers before uploads, then name."""
    incoming = incoming or DEFAULT_INCOMING
    found = []
    for kind, pattern, _reader in (
        ('offers', os.path.join(incoming, 'offers_active_*.csv'), None),
        ('offers', os.path.join(incoming, 'offers_active_*.xlsx'), None),
        ('upload', os.path.join(incoming, 'uploaded_prices*.csv'), None),
        ('upload', os.path.join(incoming, 'uploaded_prices*.xlsx'), None),
    ):
        for p in glob.glob(pattern):
            d = _file_date(p)
            if d:
                found.append((d, kind, p))
    found.sort(key=lambda x: (x[0], 0 if x[1] == 'offers' else 1, os.path.basename(x[2])))
    return found


def build_price_changes(incoming=None, as_of=None):
    """Return (priceChanges, meta).

    priceChanges: {sku: {'date': 'YYYY-MM-DD', 'old': float, 'new': float, 'src': basename}}
    """
    incoming = incoming or DEFAULT_INCOMING
    files = list_source_files(incoming)
    last = {}
    changes = {}
    used = []
    for d, kind, path in files:
        reader = _prices_from_offers if kind == 'offers' else _prices_from_upload
        prices = reader(path)
        nchg = 0
        src = os.path.basename(path)
        for sku, p in prices.items():
            prev = last.get(sku)
            if prev is not None and abs(p - prev) > PENNY:
                changes[sku] = {'date': d, 'old': prev, 'new': p, 'src': src}
                nchg += 1
            last[sku] = p
        used.append({'date': d, 'kind': kind, 'file': src, 'skus': len(prices), 'changes': nchg})
    as_of = as_of or datetime.date.today().isoformat()
    dates = {}
    for v in changes.values():
        dates[v['date']] = dates.get(v['date'], 0) + 1
    label = 'Last price change from %d daily offers / upload file%s (%d SKUs changed)' % (
        len(used), '' if len(used) == 1 else 's', len(changes))
    meta = {'as_of': as_of, 'label': label, 'files': used, 'count': len(changes), 'dates': dates}
    return changes, meta


if __name__ == '__main__':
    import json, sys
    incoming = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INCOMING
    ch, meta = build_price_changes(incoming)
    print(json.dumps({'count': meta['count'], 'as_of': meta['as_of'], 'dates': meta['dates'],
                      'files': meta['files'], 'label': meta['label']}, indent=2))
