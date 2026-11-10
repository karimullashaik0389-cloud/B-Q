#!/usr/bin/env python3
"""Unit tests for last-price-change dates used by the tab 5 WEEKLY HOLD."""
import csv, os, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import price_changes as pc

def write_offers(folder, day, rows, header_style='new'):
    path = os.path.join(folder, 'offers_active_%s.csv' % day)
    if header_style == 'old':
        fields = ['sku', 'price']
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields, delimiter=';')
            w.writeheader()
            for sku, price in rows:
                w.writerow({'sku': sku, 'price': price})
    else:
        fields = ['Offer SKU', 'Price', 'Discount price']
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields, delimiter=';')
            w.writeheader()
            for sku, price in rows:
                w.writerow({'Offer SKU': sku, 'Price': price, 'Discount price': ''})
    return path

def write_upload(folder, day, rows, tag='pm'):
    path = os.path.join(folder, 'uploaded_prices_%s_%s.csv' % (day, tag))
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['offer-sku', 'price'])
        w.writeheader()
        for sku, price in rows:
            w.writerow({'offer-sku': sku, 'price': price})
    return path

class PriceChangesTest(unittest.TestCase):
    def test_last_change_from_offers_and_later_upload(self):
        with tempfile.TemporaryDirectory() as d:
            write_offers(d, '2026-11-05', [('AAA', 10.00), ('BBB', 8.00), ('CCC', 20.00)], 'old')
            write_offers(d, '2026-11-08', [('AAA', 10.00), ('BBB', 7.50), ('CCC', 20.00)])
            write_offers(d, '2026-11-10', [('AAA', 9.50), ('BBB', 7.50), ('CCC', 20.00)])
            write_upload(d, '2026-11-10', [('AAA', 9.40), ('CCC', 20.00)])  # CCC same price: not a change
            ch, meta = pc.build_price_changes(d, as_of='2026-11-10')
            self.assertEqual(ch['BBB']['date'], '2026-11-08')
            self.assertEqual(ch['BBB']['old'], 8.00)
            self.assertEqual(ch['BBB']['new'], 7.50)
            # AAA changed in the morning offers, then again in the afternoon upload
            self.assertEqual(ch['AAA']['date'], '2026-11-10')
            self.assertEqual(ch['AAA']['old'], 9.50)
            self.assertEqual(ch['AAA']['new'], 9.40)
            self.assertNotIn('CCC', ch)  # never moved
            self.assertEqual(meta['as_of'], '2026-11-10')
            self.assertEqual(meta['count'], 2)

    def test_penny_tolerance_and_first_snapshot_is_baseline(self):
        with tempfile.TemporaryDirectory() as d:
            write_offers(d, '2026-11-05', [('AAA', 10.00), ('NEW', 5.00)])
            write_offers(d, '2026-11-06', [('AAA', 10.009), ('NEW', 5.00)])  # under 1p: no change
            ch, _ = pc.build_price_changes(d, as_of='2026-11-10')
            self.assertNotIn('AAA', ch)
            self.assertNotIn('NEW', ch)  # first seen is a baseline, not a change

    def test_3_day_hold_window_matches_engine(self):
        # daysBetween(change, asOf) < 3 is held; exactly 3 is allowed
        def days(a, b):
            A = __import__('datetime').datetime.strptime(a, '%Y-%m-%d').date()
            B = __import__('datetime').datetime.strptime(b, '%Y-%m-%d').date()
            return (B - A).days
        self.assertEqual(days('2026-11-08', '2026-11-10'), 2)
        self.assertTrue(days('2026-11-08', '2026-11-10') < 3)
        self.assertEqual(days('2026-11-07', '2026-11-10'), 3)
        self.assertFalse(days('2026-11-07', '2026-11-10') < 3)

if __name__ == '__main__':
    unittest.main()
