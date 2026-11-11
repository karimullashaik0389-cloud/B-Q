/* UK-only tab-3 rule: winning, 0 sales, already over the 80% cap -> drop to the cap
   even when the cap sits below the floor+5% buffer. China rows must be unchanged.
   Made-up products only. */
'use strict';
const assert = require('assert'), path = require('path');
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const Book = require(path.join(__dirname, '..', 'bq_book.js'));

function row(o) {
  return Object.assign({
    sku: 'X', title: 'Test item', ean: '100', cost: 1.25, price: 5.59,
    bb: 5.59, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, pc: 1.70,
    sales: 0, stock: 5, post: 1.70
  }, o);
}
function go(extra, settings) {
  const d = P.decide(row(extra));
  const bb = P.buyBox(d, { fresh: true }, P.BB_DEFAULT);
  bb.o = d;
  const x = Book.classify(P, [bb], settings || {})[0];
  const st = Book.snapshotStatus(P, x, settings || {});
  return { d, bb, x, st };
}

// AVR-like: cost £1.25, postage £1.75, sell £5.59, 0 sales, we win.
const uk = go({ sku: 'AVR-SLT-GRE-01', title: 'Slate grey', cost: 1.25, price: 5.59, bb: 5.59, pc: 1.70, post: 1.70, sales: 0, stock: 8 });
assert.strictEqual(uk.d.china, false);
assert.ok(uk.d.win, 'should be winning the buy box');
assert.ok(!(uk.d.sales >= 1));
assert.ok(uk.d.price > uk.d.ceil + 1e-9, 'current should be over the cap');
assert.ok(uk.d.ceil >= uk.d.floor - 1e-9, 'cap is never below the floor');
const fb = P.ceil2(uk.d.floor * 1.05);
assert.ok(uk.d.ceil < fb - 1e-9, 'this case is the one the buffer used to block');
assert.strictEqual(uk.x.cat, 't3');
assert.strictEqual(uk.x.sugg, P.rnd(uk.d.ceil, 2));
assert.ok(uk.x.ukCapDrop);
assert.strictEqual(uk.x.why, 'UK, 0 sales, over the 80% cap – drop to the cap price');
assert.strictEqual(uk.x.short, 'UK, 0 sales, over the 80% cap – drop to the cap price');
assert.ok(uk.x.sugg >= uk.d.floor - 1e-9, 'never below the floor');
assert.ok(uk.d.price - uk.x.sugg >= 0.10 - 1e-9, 'at least 10p');
assert.ok(Book.ok(P, uk.d, uk.x.sugg));
const after = P.calc(uk.d.a, uk.x.sugg);
assert.ok(after.profit > 0);
assert.ok(after.pc >= 0.50 - 1e-9);
assert.ok(after.pc <= 0.80 + 1e-9);
assert.ok(uk.st.chk === 'OK' || uk.st.chk === 'NO CHANGE');

// Drop under 10p: no suggestion
const tiny = go({ sku: 'TINY', cost: 1.25, price: P.rnd(uk.d.ceil + 0.05, 2), bb: P.rnd(uk.d.ceil + 0.05, 2), sales: 0 });
assert.strictEqual(tiny.x.sugg, null, 'under 10p must not change');
assert.ok(!tiny.x.ukCapDrop);

// Has sales: must not use the 0-sales cap cut
const sold = go({ sku: 'SOLD', cost: 1.25, price: 5.59, bb: 5.59, sales: 3 });
assert.ok(sold.x.cat !== 't3', 'rows with sales stay off tab 3');
assert.ok(!sold.x.ukCapDrop);

// Not over the cap: existing near-floor "no cut" still applies when already at/near buffer
const near = go({ sku: 'NEAR', cost: 1.25, price: 5.57, bb: 5.57, sales: 0 });
// 5.57 is the buffer; cap is 5.44 so this IS still over the cap and the drop to 5.44 is 13p, so this WOULD change.
// Pick a price at or under the cap instead.
const underCap = go({ sku: 'UNDER', cost: 1.25, price: uk.d.ceil, bb: uk.d.ceil, sales: 0 });
assert.ok(underCap.d.price <= underCap.d.ceil + 1e-9);
assert.strictEqual(underCap.x.sugg, null, 'already at the cap: no cut (buffer still applies)');
assert.ok(!underCap.x.ukCapDrop);

// Quarter-gap cut still works when there is room above the buffer and we are not relying on the new rule
// Use a clearly high price well above floor+5% and also above cap... wait, if above cap, s3 clips to cap.
// So a quarter-gap (non-cap-drop) case must have current > buffer+10p AND cap >= the quarter/buffer suggestion.
const high = go({ sku: 'HIGH', cost: 10, price: 30, bb: 30, post: 1.70, pc: 1.70, sales: 0 });
// cost 10, 0 sales, floor 50%, cap 80%. Plenty of room. Quarter-gap should fire, and if cap is above the buffer, reason is the old quarter-gap text (unless clipped below buffer).
assert.strictEqual(high.x.cat, 't3');
if (high.x.sugg != null && !high.x.ukCapDrop) {
  assert.ok(/quarter of the way/.test(high.x.why) || /quarter-gap/.test(high.x.short));
  assert.ok(high.x.sugg >= P.ceil2(high.d.floor * 1.05) - 1e-9);
}

// China winning, 0 sales: outcome must follow the old China rule (no ukCapDrop, no cap)
const cn = go({ sku: 'CN-01', title: 'China item', cost: 1.25, price: 8.5, bb: 8.5, sales: 0, sup: 'Ashian Homeware co.,Ltd', post: 1.70, pc: 1.70 });
assert.strictEqual(cn.d.china, true);
assert.strictEqual(cn.d.ceil, null);
assert.ok(!cn.x.ukCapDrop, 'China must never use the UK cap-drop flag');
assert.ok(!/80% cap/.test(cn.x.why || ''));
assert.ok(!/80% cap/.test(cn.x.short || ''));
if (cn.x.sugg != null) {
  const min105 = P.priceFor(cn.d.a, P.CHINA_FLOOR + 0.05);
  assert.ok(cn.x.sugg >= min105 - 1e-9, 'China never below 105%');
}

// China already at/near 105%: still no cut, same reason family
const cnNear = go({ sku: 'CN-NEAR', title: 'China near min', cost: 2, price: P.priceFor({ cost: 2, mult: 2, post: 1.70, collab: 0 }, 1.05), bb: 0, sales: 0, sup: 'Ashian Homeware', post: 1.70, pc: 1.70, seller: 'Diva Packages' });
// set bb to the same price so we win
const cnNearPrice = cnNear.d.price;
const cnNear2 = go({ sku: 'CN-NEAR', title: 'China near min', cost: 2, price: cnNearPrice, bb: cnNearPrice, sales: 0, sup: 'Ashian Homeware', post: 1.70, pc: 1.70, seller: 'Diva Packages' });
assert.strictEqual(cnNear2.d.china, true);
assert.ok(cnNear2.d.win);
assert.ok(!cnNear2.x.ukCapDrop);
if (cnNear2.x.sugg == null) assert.ok(/105%/.test(cnNear2.x.why));


// UK not winning: must not use the cap-drop rule
const lose = go({ sku: 'LOSE', cost: 1.25, price: 5.59, bb: 5.00, seller: 'Rival', sales: 0 });
assert.ok(!lose.d.win, 'this row must not be winning');
assert.ok(!lose.x.ukCapDrop, 'not-winning UK must not use the cap-drop rule');

// CHECK POSTAGE: a heavy UK multi-pack, winning, 0 sales, over the cap.
// The cap cut may be suggested, but Check stays CHECK POSTAGE and it is not included.
const pack = go({ sku: 'PACK-01', title: '2x Heavy pack slate', cost: 1.25, price: 15.00, bb: 15.00, sales: 0, w: 15000, post: 8, pc: 8 });
assert.strictEqual(pack.d.china, false);
assert.ok(pack.d.win);
assert.ok(!(pack.d.sales >= 1));
assert.ok(pack.d.check, 'should be flagged check postage: ' + pack.d.check);
assert.strictEqual(pack.st.chk, 'CHECK POSTAGE');
assert.strictEqual(pack.x.inc, 'No');
if (pack.x.ukCapDrop) {
  assert.strictEqual(pack.x.sugg, P.rnd(pack.d.ceil, 2));
  assert.ok(pack.x.sugg >= pack.d.floor - 1e-9);
}

// Cap is never below the floor for UK (floor is pulled down to the cap when both are 80%).
const tight = go({ sku: 'TIGHT', cost: 0.14, price: 2.56, bb: 2.56, sales: 0, post: 1.70, pc: 1.70 });
assert.ok(tight.d.ceil + 1e-9 >= tight.d.floor, 'UK cap must not sit below the floor');
assert.strictEqual(tight.d.floor, tight.d.ceil);

console.log('uk capcut extra edge cases passed');

console.log('uk capcut tests passed');
console.log(JSON.stringify({
  avr: { price: uk.d.price, floor: uk.d.floor, cap: uk.d.ceil, fb: fb, sugg: uk.x.sugg, why: uk.x.why, pcNow: uk.d.pc, pcAfter: after.pc, chk: uk.st.chk },
  tiny: { price: tiny.d.price, cap: tiny.d.ceil, sugg: tiny.x.sugg },
  sold: { cat: sold.x.cat, sugg: sold.x.sugg, label: sold.x.label },
  underCap: { price: underCap.d.price, sugg: underCap.x.sugg },
  high: { price: high.d.price, floor: high.d.floor, cap: high.d.ceil, sugg: high.x.sugg, ukCapDrop: !!high.x.ukCapDrop, why: high.x.why },
  cn: { price: cn.d.price, floor: cn.d.floor, sugg: cn.x.sugg, cat: cn.x.cat, why: cn.x.why, short: cn.x.short }
}, null, 2));
