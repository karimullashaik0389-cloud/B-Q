#!/usr/bin/env python3
"""Synthetic counts for the Products selling page. No catalogue SKUs, no encrypted file in git."""
import calendar, datetime, json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_products_selling as B

DAY = 86400000

def minutes(iso):
    dt = datetime.datetime.strptime(iso, '%Y-%m-%d')
    return int(calendar.timegm(dt.timetuple()) * 1000) // 60000

def row(day, sku_i, qty, status_i):
    return [minutes(day), 0, qty, 0, sku_i, status_i]

def main():
    raw = {
        'sku': [['SOLD30'], ['NEW'], ['OLD'], ['CANCEL'], ['YDAY']],
        'st': ['Shipped', 'Cancelled'],
        'L': [
            row('2026-11-09', 0, 2, 0),   # today, not new
            row('2026-10-20', 0, 1, 0),   # inside 30 days
            row('2026-11-08', 1, 1, 0),   # yesterday, new
            row('2026-09-01', 2, 1, 0),   # outside 30 days
            row('2026-11-08', 3, 4, 1),   # cancelled yesterday
            row('2026-11-08', 4, 1, 0),   # yesterday but also sold earlier
            row('2026-10-15', 4, 1, 0),
        ],
    }
    d = tempfile.mkdtemp()
    orders = os.path.join(d, 'orders.json')
    json.dump(raw, open(orders, 'w'))
    events, _ = B.load_orders(orders)
    summary = B.summarise(events, {'SOLD30': 'UK', 'NEW': 'China', 'OLD': 'UK', 'YDAY': 'UK', 'NEVER': 'China'})
    assert summary['asOf'] == '2026-11-09', summary['asOf']
    assert summary['sold30']['total'] == 3, summary['sold30']  # SOLD30, NEW, YDAY
    assert summary['sold30']['uk'] == 2 and summary['sold30']['china'] == 1
    assert summary['zero30']['total'] == 2, summary['zero30']  # OLD, NEVER
    assert summary['zero30']['uk'] == 1 and summary['zero30']['china'] == 1
    assert summary['yesterdaySold']['total'] == 2, summary['yesterdaySold']  # NEW, YDAY
    assert summary['newly']['total'] == 1 and summary['newly']['skus'] == ['NEW']
    hist = os.path.join(d, 'history.json')
    html_path = os.path.join(d, 'page.html')
    os.environ['BQ_PASSWORD'] = 'synthetic-test-password'
    enc = os.path.join(d, 'productselling.enc')
    sys.argv = ['build', '--orders', orders, '--history', hist, '--html', html_path, '--enc', enc]
    B.main()
    page = open(html_path, encoding='utf-8').read()
    assert 'Sold on B&amp;Q in the last 30 days' in page
    assert '>3<' in page and '>1<' in page
    import bqcrypt
    plain = bqcrypt.decrypt(open(enc, 'rb').read()).decode('utf-8')
    assert 'Newly selling' in plain
    blob = open(enc, 'rb').read()
    assert blob[:4] == b'BQE1'
    assert 'SOLD30' not in open(os.path.join(HERE, 'build_products_selling.py'), encoding='utf-8').read()
    print('SELLING_OK', summary['sold30']['total'], summary['newly']['total'])

if __name__ == '__main__':
    main()
