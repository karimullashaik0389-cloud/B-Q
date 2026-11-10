#!/usr/bin/env node
/* Rebuild an already-exported pricing workbook as a live formula file.
   Usage: node tools/pricing/upgrade_snapshot.js <in.xlsx> <out.xlsx>
   Does not print product names or prices. */
'use strict';
const fs = require('fs'), path = require('path');
const X = require(path.join(__dirname, '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, 'bq_price.js'));
const B = require(path.join(__dirname, 'bq_book.js'));
const src = process.argv[2], dst = process.argv[3];
if (!src || !dst) { console.error('need in.xlsx out.xlsx'); process.exit(2); }
const wb = X.read(fs.readFileSync(src), { type: 'buffer' });
function grid(name) {
  const ws = wb.Sheets[name]; if (!ws) return [];
  return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}
function headerMap(row) {
  const m = {}; (row || []).forEach((h, i) => { if (h != null && m[String(h)] == null) m[String(h)] = i; }); return m;
}
function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; const t = String(v).replace(/[£,\s]/g, ''); return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? +t : null; }
const all = grid('1 All');
const h1 = headerMap(all[1] || []);
const comb = grid('6 Combined upload');
const hc = headerMap(comb[1] || []);
const bySheet = {};
[['2 Winning in range', 't2'], ['3 Winning 0 sales', 't3'], ['4 Can win buy box', 't4'], ['5 Margin too low', 't5'], ['China raises (review only)', 'raise']].forEach(([name, cat]) => {
  const g = grid(name), hm = headerMap(g[1] || []);
  for (let i = 2; i < g.length; i++) {
    const sku = g[i][hm['B&Q SKU']]; if (!sku) continue;
    bySheet[String(sku)] = { cat: cat, tab: cat === 'raise' ? 1 : +cat.slice(1), last: hm['Last price change'] != null ? g[i][hm['Last price change']] : '' };
  }
});
const fromComb = {};
for (let i = 2; i < comb.length; i++) {
  const sku = comb[i][hc['B&Q SKU']]; if (!sku) continue;
  fromComb[String(sku)] = {
    sugg: num(comb[i][hc['Suggested price']]), inc: comb[i][hc['Include? (Yes/No)']] || 'No',
    check: comb[i][hc.Check] || 'NO CHANGE', reason: comb[i][hc.Reason] || '',
    profit: num(comb[i][hc['Profit now £']]), np: num(comb[i][hc['New profit £']]),
    floor: num(comb[i][hc['Floor price']]), post: num(comb[i][hc.Postage]), price: num(comb[i][hc['Price now']]),
    last: hc['Last price change'] != null ? comb[i][hc['Last price change']] : ''
  };
}
const seen = {}, recs = [];
for (let i = 2; i < all.length; i++) {
  const row = all[i] || [];
  const sku = row[h1.sku]; if (sku == null || sku === '' || seen[sku]) continue;
  seen[sku] = 1;
  const title = row[h1['Variant description']] || '';
  const sup = row[h1['Main supplier name']] || '';
  const china = /ashian/i.test(String(sup));
  const seller = row[h1.seller] == null ? '' : String(row[h1.seller]);
  const w = num(row[h1.Weight]);
  const c = fromComb[String(sku)] || {};
  const place = bySheet[String(sku)] || { cat: 'keep', tab: 1, last: '' };
  const check = c.check || 'NO CHANGE';
  recs.push({
    sku: String(sku), title: String(title), uk: china ? 'China' : 'UK', cost: num(row[h1['Estimated cost']]),
    mult: china ? 2 : 1.5, collab: 0, w: w, sales: num(row[h1['B n Q 30Days']]) || 0, stock: num(row[h1['Free stock quantity']]),
    bb: num(row[h1['B&Q_BB.price']]), win: /diva package/i.test(seller) ? 1 : 0, seller: seller,
    basePost: c.post != null ? c.post : num(row[h1['Postage used']]), basePrice: c.price != null ? c.price : num(row[h1['Price now']]),
    china: china ? 1 : 0, tree: P.isXmasTree(title, sku) ? 1 : 0, fresh: 1, liveSeen: null, offer: '', packN: P.packN(title),
    packCheck: P.checkPost(title, w) ? 1 : 0, lastChange: c.last || place.last || row[h1['Last price change']] || '', rival: null,
    seasonal: P.isSeasonal(title, sku) ? 1 : 0, engSugg: c.sugg, engInc: c.inc || 'No', engCheck: check, engReason: c.reason || '',
    engProfit: c.profit != null ? c.profit : num(row[h1['Profit now £']]), engPc: num(row[h1['Profit now %']]),
    engFloor: c.floor != null ? c.floor : num(row[h1['Floor price']]), engCap: null, engNewProfit: c.np,
    ean: '', noData: 0, priceCheck: 0, weekly: check === 'WEEKLY HOLD' ? 1 : 0, t5Min: null, engAct: place.cat === 't4' ? 'Lower to win' : place.cat === 't5' ? "Can't win (floor)" : place.cat === 'raise' ? 'Raise' : 'Keep',
    cat: place.cat, tab: place.tab, sup: String(sup), accessPc: num(row[h1['Postage Cost']])
  });
}
const aoa = [all[1]].concat(all.slice(2));
const built = B.build(X, P, { records: recs, aoa: aoa, asOf: '2026-11-09', settings: P.BB_DEFAULT });
fs.writeFileSync(dst, Buffer.from(built.bytes));
const uk = recs.filter(r => r.engCheck === 'OK' && r.engInc === 'Yes' && r.uk === 'UK').length;
const cn = recs.filter(r => r.engCheck === 'OK' && r.engInc === 'Yes' && r.uk === 'China').length;
console.log(JSON.stringify({ products: recs.length, baselineUk: uk, baselineChina: cn, bytes: built.bytes.length }));
