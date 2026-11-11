'use strict';
const assert = require('assert'), path = require('path');
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const Book = require(path.join(__dirname, '..', 'bq_book.js'));

function go(extra, settings) {
  const row = Object.assign({
    sku: 'X', title: 'Test item', ean: '100', cost: 5.75, price: 15.15,
    bb: 15.15, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, pc: 1.7,
    sales: 0, stock: 8, post: 1.7
  }, extra);
  const d = P.decide(row);
  const bb = P.buyBox(d, { fresh: true }, P.BB_DEFAULT);
  bb.o = d;
  const x = Book.classify(P, [bb], settings || {})[0];
  const st = Book.snapshotStatus(P, x, settings || {});
  return { d, bb, x, st };
}

// PEC-SUE-like: 0 sales, we win, profit under 50%, 50% price is under the 60% band floor.
const pec = go({ sku: 'PEC-SUE-8PK-1', cost: 5.75, price: 15.15, bb: 15.15, sales: 0, post: 1.7, pc: 1.7 });
assert.strictEqual(pec.d.china, false);
assert.ok(pec.d.win);
assert.ok(!(pec.d.sales >= 1));
assert.ok(pec.d.floorPct > 0.5, 'band floor is above 50%');
const p50 = P.priceFor(pec.d.a, 0.5);
assert.ok(p50 < pec.d.floor - 1e-9, 'the old 50% raise would sit under the floor');
assert.strictEqual(pec.bb.act, 'Raise');
assert.strictEqual(pec.bb.sugg, pec.d.floor);
assert.ok(pec.bb.sugg + 1e-9 >= pec.d.floor, 'suggestion is not under the floor');
if (pec.d.ceil != null) assert.ok(pec.bb.sugg <= pec.d.ceil + 1e-9, 'not over the cap');
const after = P.calc(pec.d.a, pec.bb.sugg);
assert.ok(after.profit > 0, 'not a loss');
assert.ok(after.pc + 1e-9 >= pec.d.floorPct, 'profit just at/above the floor %');
assert.ok(/raise to the floor/.test(pec.bb.why) || /raise to the floor/.test(pec.x.short));
assert.ok(pec.st.chk === 'OK' || pec.st.chk === 'NO CHANGE');
assert.notStrictEqual(pec.st.chk, 'UNDER FLOOR');

// AUT-FRA-like: cheap item, floor and cap both 80%. Lift to the floor (at the cap), not over it.
const aut = go({ sku: 'AUT-FRA-TRO-02', cost: 0.88, price: 4.08, bb: 4.08, sales: 0, post: 1.9, pc: 1.9 });
assert.ok(Math.abs(aut.d.floorPct - 0.8) < 1e-9);
assert.ok(aut.d.ceil != null && aut.d.floor <= aut.d.ceil + 1e-9);
assert.strictEqual(aut.bb.act, 'Raise');
assert.ok(aut.bb.sugg + 1e-9 >= aut.d.floor);
assert.ok(aut.bb.sugg <= aut.d.ceil + 1e-9);
assert.notStrictEqual(aut.st.chk, 'UNDER FLOOR');
assert.notStrictEqual(aut.st.chk, 'OVER CAP');
assert.notStrictEqual(aut.st.chk, 'LOSS');

// Already at/above the floor: no change to a cut that stays above the floor (sold item 1p-under).
const sold = go({ sku: 'SOLD-OK', cost: 2, price: 8, bb: 7.5, seller: 'Rival', sales: 4, post: 1.7, pc: 1.7 });
assert.strictEqual(sold.bb.act, 'Lower to win');
assert.ok(sold.bb.sugg + 1e-9 >= sold.d.floor);
assert.strictEqual(sold.bb.sugg, P.rnd(7.5 - 0.01, 2));

// Turning floorLift off restores the old 50% raise under the floor.
P.useRules({ floorLift: 0 });
const off = go({ sku: 'PEC-OFF', cost: 5.75, price: 15.15, bb: 15.15, sales: 0, post: 1.7, pc: 1.7 });
assert.ok(off.bb.sugg + 1e-9 >= P.priceFor(off.d.a, 0.5));
assert.ok(off.bb.sugg < off.d.floor - 1e-9);
assert.strictEqual(off.st.chk, 'UNDER FLOOR');
P.clearRules();

// China unchanged: a China raise is still a China raise (review only, never lifted by this rule).
const cn = go({ sku: 'CN-01', title: 'China item', cost: 1.25, price: 6.2, bb: 6.2, sales: 0, sup: 'Ashian Homeware co.,Ltd', post: 1.7, pc: 1.7 });
assert.strictEqual(cn.d.china, true);
assert.ok(cn.d.floorPct >= 1 - 1e-9);
if (cn.bb.act === 'Raise') {
  assert.ok(cn.st.chk === 'CHINA RAISE' || cn.x.inc === 'No');
}

console.log('ok floor_lift tests', {
  pec: { floor: pec.d.floor, cap: pec.d.ceil, sugg: pec.bb.sugg, p50, chk: pec.st.chk, pc: after.pc },
  aut: { floor: aut.d.floor, cap: aut.d.ceil, sugg: aut.bb.sugg, chk: aut.st.chk }
});
