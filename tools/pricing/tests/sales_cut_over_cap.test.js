/* UK with sales: a cut to 1p under the competitor is not clamped to the 80% cap.
   0-sales still stops at the cap. China unchanged. Made-up data only. */
'use strict';
const assert = require('assert'), path = require('path');
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const Book = require(path.join(__dirname, '..', 'bq_book.js'));

function go(extra) {
  const row = Object.assign({
    sku: 'T', title: 'Test', ean: '1', cost: 1.5, price: 6.99, bb: 6.98, seller: 'Ample-Store',
    sup: 'UK Ltd', w: 500, sales: 28, stock: 5, pc: 1.75
  }, extra);
  const o = P.decide(row, {});
  const r = P.buyBox(o, { fresh: true }, P.BB_DEFAULT);
  r.o = o;
  const x = Book.classify(P, [r], Object.assign({}, P.BB_DEFAULT, { asOf: '2026-11-11' }))[0];
  return { o, r, x };
}

/* RAP-SPY-GLU-01 shape: 28 sales, we are 1p above the box, both above the cap */
{
  const { o, r, x } = go({});
  assert.strictEqual(o.accessPc, 1.75);
  assert.strictEqual(o.post, 1.9);
  assert.ok(Math.abs(o.ceil - P.priceMax(o.a, 0.8)) < 1e-9, 'cap got ' + o.ceil);
  assert.ok(Math.abs(o.floor - P.floorPrice(o.a, 0.5, false)) < 1e-9, 'floor got ' + o.floor);
  assert.ok(6.97 > o.ceil + 1e-9, '1p-under is still above the cap');
  assert.ok(6.97 >= o.floor - 1e-9, '1p-under is still at/above the floor');
  assert.strictEqual(r.act, 'Lower to win');
  assert.strictEqual(r.sugg, 6.97);
  assert.strictEqual(x.sugg, 6.97);
  assert.strictEqual(x.cat, 't4');
  assert.ok(/1p under/.test(x.short), x.short);
  assert.ok(!/80% cap/.test(x.short), x.short);
  assert.strictEqual(o.newp, 6.97);
}

/* 0-sales still clamps to the cap when 1p-under is above it */
{
  const { o, r, x } = go({ sku: 'HG', sales: 0, price: 11.98, bb: 10.99, seller: 'Homecare Essentials Ltd', cost: 2.5, pc: 1.75 });
  assert.ok(10.98 > o.ceil, 'setup: 1p under is above cap ' + o.ceil);
  assert.strictEqual(r.act, 'Lower to win');
  assert.strictEqual(r.sugg, o.ceil);
  assert.ok(/80% cap/.test(x.short), '0-sales reason should mention cap: ' + x.short);
}

/* competitor-1p exactly at the floor -> Lower to win at the floor */
{
  const fl = P.floorPrice({ cost: 1.5, mult: 1.5, post: 1.9, collab: 0 }, 0.5, false);
  const { r, x } = go({ sales: 4, price: fl + 2, bb: P.rnd(fl + 0.01, 2), seller: 'Rival' });
  assert.strictEqual(r.act, 'Lower to win');
  assert.strictEqual(r.sugg, fl);
  assert.strictEqual(x.cat, 't4');
}

/* competitor-1p below the floor -> Can't win (existing floor behaviour) */
{
  const fl = P.floorPrice({ cost: 1.5, mult: 1.5, post: 1.9, collab: 0 }, 0.5, false);
  const { r, x } = go({ sales: 4, price: 8, bb: P.rnd(fl - 0.20, 2), seller: 'Rival' });
  assert.strictEqual(r.act, "Can't win (floor)");
  assert.notStrictEqual(x.cat, 't4');
}

/* suggestion must not be a loss or under 50% */
{
  const { o, r } = go({ cost: 20, price: 25, bb: 24.9, seller: 'Rival', sales: 3, pc: 8, w: 20000 });
  if (r.sugg != null) {
    const c = P.calc(o.a, r.sugg);
    assert.ok(c.profit > 0, 'suggestion must not be a loss');
    assert.ok(c.pc >= 0.5 - 1e-9, 'suggestion must be at least 50%');
  }
}

/* cap still blocks a RAISE above the cap (already cheaper than a high buy box) */
{
  const o = P.decide({ sku: 'T-1', title: 'Test item', cost: 2, price: 19, bb: 20, seller: 'Rival', sup: 'Some UK Ltd', pc: null, w: 500, sales: 3 }, {});
  assert.strictEqual(o.newp, o.ceil);
  assert.ok(/capped/.test(o.rule));
}

/* China: still 1p under, no UK cap */
{
  const o = P.decide({ sku: 'CN', title: 'c', cost: 2, price: 13, bb: 12, seller: 'Rival', sup: 'Ashian Homeware', w: 500, sales: 2, stock: 5 }, {});
  assert.strictEqual(o.floorPct, 1);
  assert.strictEqual(o.newp, 11.99);
  assert.strictEqual(o.ceil, null);
}

console.log('ok sales_cut_over_cap tests');
