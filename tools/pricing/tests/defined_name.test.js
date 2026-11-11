/* Excel (Microsoft 365) shows "We found a problem with some content" and then
   "Removed Records: Named range from /xl/workbook.xml" when a defined name
   quotes a sheet name containing an apostrophe without doubling it.
   The "Losing – can't win above floor" tab must be quoted as 'Losing – can''t win above floor'!A2:J3.
   Made-up products only. */
'use strict';
const assert = require('assert'), path = require('path');
const X = require(path.join(__dirname, '..', '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const B = require(path.join(__dirname, '..', 'bq_book.js'));
const rows = [
  { sku: 'CANT', title: 'Rival under floor', ean: '111', cost: 8, price: 40, bb: 12, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 3, stock: 2 },
  { sku: 'WIN', title: 'Winner', ean: '100', cost: 2, price: 8, bb: 8, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, sales: 5, stock: 3 }
];
const d = P.decideAll(rows, {});
const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
const out = B.build(X, P, { bbr: bb, settings: P.BB_DEFAULT, asOf: '2026-11-10' });
const Z = X.CFB.read(out.bytes, { type: 'array' });
const i = Z.FullPaths.findIndex(p => /xl\/workbook\.xml$/.test(p));
const s = Buffer.from(Z.FileIndex[i].content).toString('utf8');
const names = [...s.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)];
assert.ok(names.length, 'expected autofilter defined names');
function xmlUnesc(t) { return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
let sawCant = false;
for (const m of names) {
  const body = xmlUnesc(m[2]);
  const bang = body.lastIndexOf('!');
  assert.ok(bang > 0, 'defined name has no range: ' + body);
  const left = body.slice(0, bang);
  if (left.charAt(0) === "'" && left.charAt(left.length - 1) === "'") {
    const inner = left.slice(1, -1);
    for (let k = 0; k < inner.length; k++) {
      if (inner[k] === "'") {
        assert.strictEqual(inner[k + 1], "'", 'apostrophe in defined name is not doubled: ' + body);
        k++;
      }
    }
  }
  if (body.indexOf("can't win") >= 0 || body.indexOf("can''t win") >= 0) {
    sawCant = true;
    assert.strictEqual(left, "'Losing – can''t win above floor'", body);
  }
}
assert.ok(sawCant, 'missing FilterDatabase for the can\'t-win tab');
const wb = X.read(out.bytes, { type: 'array' });
assert.ok(wb.SheetNames.indexOf("Losing – can't win above floor") >= 0);
console.log('defined name test passed (names:', names.length + ')');
