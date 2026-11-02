"""Make a MADE-UP 50,000-row Access file for the huge-file test (no real data).
Usage: python3 tests/make_big_testdata.py [out.xlsx]"""
import random, sys, os, openpyxl
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'testdata', 'Access_2026-11-05_big50k.xlsx')
H = ['sku','Variant description','Estimated cost','B&Q_INV.price','B&Q_BB.price','seller','Main supplier name','Weight','Postage Cost','B n Q 30Days','product-id','product_url','Collab fee','Variant code','Free stock quantity','Total 30Days Sales']
rnd = random.Random(42)
wb = openpyxl.Workbook(write_only=True); ws = wb.create_sheet('B&QBB3'); ws.append(H)
for i in range(50000):
    cost = round(rnd.uniform(0.3, 60), 2); price = round(cost * rnd.uniform(1.2, 4) + 2, 2)
    bb = None if rnd.random() < 0.05 else round(price * rnd.uniform(0.4, 1.3), 2)
    seller = None if bb is None else ('Diva Packages' if rnd.random() < 0.6 else 'Other Seller')
    desc = ('%dx ' % rnd.randint(2, 6) if rnd.random() < 0.1 else '') + 'Made-up item %d' % i
    sup = 'Ashian Homeware' if rnd.random() < 0.05 else rnd.choice(['UK Sup', 'UK Sup2'])
    sales = rnd.choice([0, 0, 0, 1, 2, 5, 20, 120])
    ws.append(['BIG-%05d' % i, desc, cost, price, bb, seller, sup, rnd.randint(50, 35000), None, sales, '91%011d' % i, None, None, None, 5, 0])
wb.save(out); print('saved', out)
