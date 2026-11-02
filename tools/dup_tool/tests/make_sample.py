"""Synthetic sample data for tests. Every SKU, EAN, price and order here is made up.
EANs use the GS1 '20' in-store prefix, so they can never be real products."""
import os, json, datetime as dt
import pandas as pd

def ean(n):
    body = f'200000{n:06d}'
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(body))
    return body + str((10 - s % 10) % 10)

def page(name, desc, n_img, bullets, reviews=0, rating=4.5, ours=True):
    imgs = [f'https://example.invalid/img/{len(name)}_{i}.jpg' for i in range(n_img)]
    offers = [{'@type': 'Offer', 'price': '9.99', 'availability': 'https://schema.org/InStock', 'seller': {'@type': 'Organization', 'name': 'Diva Package' if ours else 'Other Shop'}}]
    ld = {'@context': 'https://schema.org', '@type': 'Product', 'name': name, 'description': desc, 'image': imgs, 'offers': offers}
    feats = ''.join(f'<li>{b}</li>' for b in bullets)
    rev = f'<span>Product review rating: {rating} stars out of 5 from {reviews} product reviews</span>' if reviews else ''
    return (f'<html><head><title>{name}</title><script type="application/ld+json">{json.dumps(ld)}</script></head>'
            f'<body><h1>{name}</h1>{rev}<section id="features-and-benefits"><ul>{feats}</ul></section>'
            f'<p>Sold & shipped by</p><p>{"Diva Package" if ours else "Other Shop"}</p></body></html>')

GOOD_DESC = ('This sturdy test item is made for everyday use in the home and garden. ' * 6 +
             'It measures 30cm by 20cm and weighs 1.5kg. It holds 5l and comes with 2 spare parts. '
             'Clean it with a damp cloth. Store it indoors when not in use. ' * 3)
BAD_DESC = 'Test item.'
GOOD_B = [f'Useful point number {i} with a 10cm measurement and detail' for i in range(1, 9)]
BAD_B = ['Item']

def T(base, extra=''):
    return f'{base} Steel Grey 30cm Test Item for Home and Garden Indoor Outdoor Use Strong Durable {extra}'.strip()

# (sku, ean_no, title, active, qty, variant, units, reviews, page_quality, page_status)
ROWS = [
    # G1 same EAN under -1 / -01, one active + one inactive, no sales -> inactive deleted
    ('TST-AAA-1', 1, T('Alpha'), 'yes', 5, 'TST-AAA-1', 0, 0, 'good', 200),
    ('TST-AAA-01', 1, T('Alpha'), 'no', 0, 'TST-AAA-1', 0, 0, 'good', 200),
    # G2 group of 4 by variant code, one sells -> it is kept, 3 weaker non-sellers deleted
    ('TST-BBB-1', 2, T('Bravo'), 'yes', 5, 'TST-BBB-1', 3, 0, 'good', 200),
    ('TST-BBB-01', 3, T('Bravo'), 'yes', 5, 'TST-BBB-1', 0, 0, 'bad', 200),
    ('TST-BBB-001', 4, T('Bravo'), 'no', 0, 'TST-BBB-1', 0, 0, 'bad', 200),
    ('TST-BBB-0001', 5, T('Bravo'), 'no', 0, 'TST-BBB-1', 0, 0, 'bad', 200),
    # G3 all inactive, no sales -> strongest kept, weaker deleted
    ('TST-CCC-1', 6, T('Charlie'), 'no', 0, 'TST-CCC-1', 0, 0, 'good', 200),
    ('TST-CCC-01', 7, T('Charlie'), 'no', 0, 'TST-CCC-1', 0, 0, 'bad', 200),
    # G4 similar sales 12 vs 11 -> keep both
    ('TST-DDD-1', 8, T('Delta'), 'yes', 5, 'TST-DDD-1', 12, 0, 'good', 200),
    ('TST-DDD-01', 9, T('Delta'), 'yes', 5, 'TST-DDD-1', 11, 0, 'bad', 200),
    # G5 15 vs 3, lower has no reviews and is weaker -> delete
    ('TST-EEE-1', 10, T('Echo'), 'yes', 5, 'TST-EEE-1', 15, 4, 'good', 200),
    ('TST-EEE-01', 11, T('Echo'), 'yes', 5, 'TST-EEE-1', 3, 0, 'bad', 200),
    # G6 15 vs 3, lower has reviews -> Check
    ('TST-FFF-1', 12, T('Foxtrot'), 'yes', 5, 'TST-FFF-1', 15, 0, 'good', 200),
    ('TST-FFF-01', 13, T('Foxtrot'), 'yes', 5, 'TST-FFF-1', 3, 2, 'bad', 200),
    # G7 candidate page missing (404) -> Check
    ('TST-GGG-1', 14, T('Golf'), 'yes', 5, 'TST-GGG-1', 0, 0, 'good', 200),
    ('TST-GGG-01', 15, T('Golf'), 'no', 0, 'TST-GGG-1', 0, 0, 'bad', 404),
    # G8 colour variants share a title but different SKU stems, no variant link -> NOT a group
    ('TST-HHH-RED-1', 16, T('Hotel'), 'yes', 5, '', 0, 0, 'good', 200),
    ('TST-HHH-BLU-1', 17, T('Hotel'), 'yes', 5, '', 0, 0, 'good', 200),
    # G9 15 vs 3, lower has no reviews but is stronger -> Check
    ('TST-III-1', 18, T('India'), 'yes', 5, 'TST-III-1', 15, 0, 'bad', 200),
    ('TST-III-01', 19, T('India'), 'yes', 5, 'TST-III-1', 3, 0, 'good', 200),
    # G10 same title, same SKU stem, no variant code, different EAN -> grouped by title
    ('TST-JJJ-1', 20, T('Juliet'), 'yes', 5, '', 0, 0, 'good', 200),
    ('TST-JJJ-02', 21, T('Juliet'), 'no', 0, '', 0, 0, 'bad', 200),
    # G11 kept copy page missing -> Check
    ('TST-KKK-1', 22, T('Kilo'), 'yes', 5, 'TST-KKK-1', 5, 0, 'good', 404),
    ('TST-KKK-01', 23, T('Kilo'), 'no', 0, 'TST-KKK-1', 0, 0, 'bad', 200),
    # G12 group of 3: two share an EAN, third joined by variant code; one active, 2 inactive, no sales
    ('TST-MMM-1', 25, T('Mike'), 'yes', 5, 'TST-MMM-1', 0, 0, 'good', 200),
    ('TST-MMM-01', 25, T('Mike'), 'no', 0, 'TST-MMM-1', 0, 0, 'bad', 200),
    ('TST-MMM-001', 26, T('Mike'), 'no', 0, 'TST-MMM-1', 0, 0, 'bad', 200),
    # single listing, no duplicate
    ('TST-LLL-1', 24, T('Lima'), 'yes', 5, 'TST-LLL-1', 7, 0, 'good', 200),
]

def make(d, fmt='csv', inactive=True):
    os.makedirs(d, exist_ok=True)
    rows = [r for r in ROWS if inactive or r[3] == 'yes']
    off = pd.DataFrame([{'Offer SKU': r[0], 'Product SKU': ean(r[1]), 'Category Label': 'Test Items', 'Product': r[2], 'Offer state': 'New',
                         'Price': '9.99', 'Quantity': r[4], 'Activated': r[3], 'EAN': ean(r[1]),
                         'Inactivity reason': '' if r[3] == 'yes' else 'Out of stock'} for r in rows])
    of = os.path.join(d, 'offers.' + fmt)
    off.to_csv(of, sep=';', index=False) if fmt == 'csv' else off.to_excel(of, index=False)
    acc = pd.DataFrame([{'sku': r[0], 'Variant code': r[5] or None, 'Reviews': r[7], 'seller': 'Diva Package', 'product_url': f'https://www.diy.com/departments/x/{ean(r[1])}_BQ.prd'} for r in rows])
    af = os.path.join(d, 'Access_sample.xlsx'); acc.to_excel(af, index=False)
    ords = []; n = 0
    for r in rows:
        for k in range(r[6]):
            n += 1
            ords.append({'Date created': f'{1 + k % 28:02d}/10/2026 - 10:00:00', 'Order number': f'ORD-{n:05d}', 'Quantity': 1, 'Status': 'Shipped',
                         'Amount': '9.99', 'Product SKU': ean(r[1]), 'Offer SKU': r[0], 'Order line no.': f'ORD-{n:05d}-1'})
    ords.append({'Date created': '02/10/2026 - 11:00:00', 'Order number': 'ORD-99999', 'Quantity': 0, 'Status': 'Cancelled', 'Amount': '0',
                 'Product SKU': ean(1), 'Offer SKU': 'TST-AAA-01', 'Order line no.': 'ORD-99999-1'})
    ordf = os.path.join(d, 'orders.csv'); pd.DataFrame(ords).to_csv(ordf, sep=';', index=False)
    cache = os.path.join(d, 'pages'); os.makedirs(cache, exist_ok=True)
    with open(os.path.join(cache, '_fetch_log.tsv'), 'w') as fh:
        for r in rows:
            e = ean(r[1]); good = r[8] == 'good'
            if r[9] == 200:
                open(os.path.join(cache, e + '.html'), 'w').write(page(r[2], GOOD_DESC if good else BAD_DESC, 8 if good else 1, GOOD_B if good else BAD_B, r[7]))
            else:
                open(os.path.join(cache, e + '.html'), 'w').write('<html>Not found</html>')
            fh.write(f'{e}\t{r[9]}\thttps://www.diy.com/departments/x/{e}_BQ.prd\t2026-11-01 09:00\n')
    return dict(offers=of, access=af, orders=ordf, cache=cache)

if __name__ == '__main__':
    import sys; print(make(sys.argv[1] if len(sys.argv) > 1 else 'sample'))
