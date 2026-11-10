/* Excel (Microsoft 365) shows "We found a problem with some content" when a shared formula points at another sheet.
   The pricing workbook may only share same-sheet formulas. Made-up products only. */
'use strict';
const assert = require('assert'), path = require('path');
const X = require(path.join(__dirname, '..', '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const B = require(path.join(__dirname, '..', 'bq_book.js'));
const rows = [];
for (let i = 0; i < 12; i++) rows.push({ sku: 'S' + i, title: 'Item ' + i, ean: String(900 + i), cost: 2 + i % 3, price: 12 + i, bb: 9 + i, seller: i % 2 ? 'Rival' : 'Diva Packages', sup: i % 4 ? 'UK Ltd' : 'Ashian Homeware', w: 500, sales: i % 3, stock: 3 });
const d = P.decideAll(rows, {});
const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
const out = B.build(X, P, { bbr: bb, settings: P.BB_DEFAULT, asOf: '2026-11-10' });
const Z = X.CFB.read(out.bytes, { type: 'array' });
let shared = 0, cross = 0;
Z.FullPaths.forEach((p, i) => {
  if (!/xl\/worksheets\/sheet\d+\.xml$/.test(p)) return;
  const s = Buffer.from(Z.FileIndex[i].content).toString('utf8');
  const re = /<f t="shared" ref="[^"]*" si="\d+">([\s\S]*?)<\/f>/g; let m;
  while ((m = re.exec(s))) { shared++; if (m[1].replace(/&quot;[\s\S]*?&quot;/g, '').indexOf('!') >= 0) cross++; }
});
assert.strictEqual(cross, 0, 'a shared formula points at another sheet');
const wb = X.read(out.bytes, { type: 'array' });
assert.ok(wb.SheetNames.indexOf('6 Combined upload') >= 0);
console.log('shared formula test passed (same-sheet shared groups:', shared + ')');
