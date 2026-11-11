/* FAST workbook structure: cached values, no fullCalcOnLoad, no comment shapes, no INDEX/MATCH on review tabs. */
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const X = require(path.join(__dirname, '..', '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const B = require(path.join(__dirname, '..', 'bq_book.js'));

const rows = [
  { sku: 'WIN', title: 'Winner', ean: '100', cost: 2, price: 8, bb: 8, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, sales: 5, stock: 3 },
  { sku: 'LOW', title: 'Can win', ean: '101', cost: 2, price: 12, bb: 9, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 4, stock: 3 },
  { sku: 'ZERO', title: 'Quiet winner', ean: '102', cost: 3, price: 20, bb: 20, seller: 'Diva Packages', sup: 'UK Ltd', w: 800, sales: 0, stock: 4 },
  { sku: 'CN', title: 'China low', ean: '106', cost: 2, price: 6, bb: 6, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 500, sales: 2, stock: 5 }
];

function workbook(extra) {
  const d = P.decideAll(rows, {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
  const S = Object.assign({}, P.BB_DEFAULT, { asOf: '2026-11-11' }, extra && extra.settings);
  return B.build(X, P, Object.assign({ bbr: bb, settings: S, asOf: '2026-11-11', aoa: [['sku', 'Variant description', 'Estimated cost', 'Weight', 'B&Q 30d', 'Main supplier name']].concat(rows.map(r => [r.sku, r.title, r.cost, r.w, r.sales, r.sup])) }, extra));
}

function unzipXml(bytes, name) {
  const Z = X.CFB.read(bytes, { type: 'array' });
  const i = Z.FullPaths.findIndex(p => p.slice(-name.length) === name);
  if (i < 0) return '';
  return Buffer.from(Z.FileIndex[i].content).toString('utf8');
}

const out = workbook();
const wb = X.read(out.bytes, { type: 'array', cellFormula: true });
assert.deepStrictEqual(wb.SheetNames.slice(0, 4), ['_Set', '_Calc', 'Rules', '6 Combined upload']);

const wxml = unzipXml(out.bytes, 'xl/workbook.xml');
assert.ok(/calcMode="auto"/.test(wxml), 'calcMode auto');
assert.ok(/fullCalcOnLoad="0"/.test(wxml), 'no fullCalcOnLoad');
assert.ok(/forceFullCalc="0"/.test(wxml), 'no forceFullCalc');
assert.ok(/iterate="0"/.test(wxml), 'iterate off');

const names = X.CFB.read(out.bytes, { type: 'array' }).FullPaths;
assert.ok(!names.some(p => /comments\d*\.xml$/.test(p) || /vmlDrawing/.test(p)), 'no comment/VML parts: ' + names.filter(p => /comment|vml/i.test(p)));

const comb = wb.Sheets['6 Combined upload'];
const c3 = comb.C3; // Check
assert.ok(c3 && c3.f, 'Check is a formula');
assert.ok(c3.f.indexOf('MATCH') < 0 && c3.f.indexOf('INDEX') < 0, 'Check has no INDEX/MATCH: ' + c3.f);
assert.ok(/_Calc/.test(c3.f) || /^IF\(AND\(/.test(c3.f), 'Check is _Calc or idle short-circuit: ' + c3.f);
assert.ok(c3.v != null && String(c3.v).length > 0, 'Check has a cached value: ' + c3.v);

const calc = wb.Sheets._Calc;
const a2 = calc.A2;
assert.ok(a2 && a2.v, 'calc SKU');
const sku = String(a2.v);
// gather formulas must be direct, not MATCH
let matchCount = 0, direct = 0;
Object.keys(calc).forEach(k => {
  if (!/^[A-Z]+2$/.test(k)) return;
  const f = calc[k] && calc[k].f;
  if (!f) return;
  if (/\bMATCH\(/.test(f) || /\bINDEX\(/.test(f)) matchCount++;
  if (/Winning 0 sales|Combined upload|Can win|1 All/.test(f)) direct++;
});
assert.strictEqual(matchCount, 0, 'no MATCH/INDEX on first _Calc data row');

// Combined prompt validation exists in sheet xml
let foundPrompt = false, foundComment = false;
const Z = X.CFB.read(out.bytes, { type: 'array' });
Z.FullPaths.forEach((p, i) => {
  if (!/xl\/worksheets\/sheet\d+\.xml$/.test(p)) return;
  const xml = Buffer.from(Z.FileIndex[i].content).toString('utf8');
  if (xml.indexOf('showInputMessage="1"') >= 0 && xml.indexOf('Your price') >= 0) foundPrompt = true;
  if (xml.indexOf('legacyDrawing') >= 0) foundComment = true;
});
assert.ok(foundPrompt, 'data-validation input prompt for Your price');
assert.ok(!foundComment, 'no legacyDrawing on sheets');

// AVR-style cap-cut not needed here; CN and WIN cached check should be strings
assert.ok(typeof c3.v === 'string' || typeof c3.v === 'number');
console.log('ok fast_workbook', { check: c3.v, checkF: c3.f, sku, size: out.bytes.length, counts: out.counts });
