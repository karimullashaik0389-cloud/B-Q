/* Access postage equal to an old band rate is used at the new rate (Settings mapping). Made-up data only. */
'use strict';
const assert = require('assert'), path = require('path');
const P = require(path.join(__dirname, '..', 'bq_price.js'));

t('1.75 maps to 1.90 and the reason names both amounts', () => {
  const i = P.postInfo(1.75, 500, 'Thing', []);
  assert.strictEqual(i.p, 1.9);
  assert.strictEqual(i.kind, 'access');
  assert.ok(i.accessMapped);
  assert.ok(/£1\.75/.test(i.src) && /£1\.90/.test(i.src), i.src);
  assert.ok(/new rate/.test(i.src), i.src);
});
t('2.30 maps to 2.45', () => {
  const i = P.postInfo(2.3, 4000, 'Thing', []);
  assert.strictEqual(i.p, 2.45);
  assert.ok(/£2\.30/.test(i.src) && /£2\.45/.test(i.src), i.src);
});
t('within 0.5p still maps; 1p away does not', () => {
  assert.strictEqual(P.mapAccessPostage(1.754).p, 1.9);
  assert.strictEqual(P.mapAccessPostage(1.746).p, 1.9);
  const stay = P.mapAccessPostage(1.76);
  assert.strictEqual(stay.p, 1.76);
  assert.strictEqual(stay.mapped, false);
  assert.strictEqual(P.mapAccessPostage(2.295).p, 2.45);
  assert.strictEqual(P.mapAccessPostage(2.294).p, 2.294);
  assert.strictEqual(P.mapAccessPostage(2.31).p, 2.31);
});
t('other Access amounts are left as they are', () => {
  [3.3, 4.3, 8, 9, 10.5, 14, 15, 27, 1.9, 2.45].forEach(p => {
    const i = P.postInfo(p, 500, 'Thing', []);
    assert.strictEqual(i.p, p, 'must not map ' + p);
    assert.strictEqual(i.kind, 'access');
    assert.ok(!i.accessMapped, p);
    assert.ok(!/new rate/.test(i.src), i.src);
  });
});
t('special list and DPD still win over a mapped Access amount', () => {
  const tree = P.postInfo(1.75, 5900, 'XMAS TREE 8FT- CH901', ['XMA-TRE-GRE-8FT-T2']);
  assert.strictEqual(tree.p, 3.3);
  assert.strictEqual(tree.kind, 'special');
  const dpd = P.postInfo(2.3, 18000, 'Compost 75L- 888436 - H077', []);
  assert.strictEqual(dpd.p, 14);
  assert.strictEqual(dpd.kind, 'heavy');
});
t('typed postage still wins, and blank Access still uses the weight band', () => {
  assert.strictEqual(P.postInfo(1.75, 500, 'Thing', [], 5).p, 5);
  assert.strictEqual(P.postInfo(1.75, 500, 'Thing', [], 5).kind, 'your');
  assert.strictEqual(P.postInfo(null, 500, 'Thing', []).p, 1.9);
  assert.strictEqual(P.postInfo(null, 500, 'Thing', []).kind, 'band');
  assert.strictEqual(P.postInfo(0, 500, 'Thing', []).p, 1.9);
});
t('an empty Settings map turns the mapping off; a custom map is used', () => {
  P.useRules({ accessMap: [] });
  assert.strictEqual(P.postInfo(1.75, 500, 'Thing', []).p, 1.75);
  P.useRules({ accessMap: [[1.75, 2]] });
  assert.strictEqual(P.postInfo(1.75, 500, 'Thing', []).p, 2);
  assert.strictEqual(P.postInfo(2.3, 4000, 'Thing', []).p, 2.3);
  P.clearRules();
  assert.strictEqual(P.postInfo(1.75, 500, 'Thing', []).p, 1.9);
});
t('Settings accessMap1old/new keys are accepted', () => {
  P.useRules({ accessMap1old: 1.75, accessMap1new: 3, accessMap2old: 2.3, accessMap2new: 4 });
  assert.strictEqual(P.mapAccessPostage(1.75).p, 3);
  assert.strictEqual(P.mapAccessPostage(2.3).p, 4);
  P.clearRules();
});
t('decide keeps the raw Access figure on accessPc and uses the mapped postage', () => {
  const o = P.decide({ sku: 'T', title: 't', cost: 2, price: 10, pc: 1.75, w: 500, sup: 'UK Ltd', sales: 2 }, {});
  assert.strictEqual(o.accessPc, 1.75);
  assert.strictEqual(o.post, 1.9);
  assert.ok(/new rate/.test(o.postSrc), o.postSrc);
});

function t(name, f) { f(); }
console.log('ok access_map tests');
