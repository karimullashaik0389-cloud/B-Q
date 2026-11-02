/* node tests/pricing_engine.test.js  – unit + fuzz tests for bq_price.js (made-up data only) */
'use strict';
const assert = require('assert'), path = require('path');
const P0 = process.env.BQP_PATH || 'bq_price.js', B = require(path.isAbsolute(P0) ? P0 : path.join(__dirname, '..', P0));
let n = 0; const t = (name, f) => { f(); n++; };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, a + ' != ' + b);
const base = { sku: 'T-1', title: 'Test item', cost: 2, price: 9.99, bb: null, seller: '', sup: 'Some UK Ltd', pc: null, w: 500, sales: 0 };
const D = (o, opt) => B.decide(Object.assign({}, base, o), opt);
t('num parses money text', () => { assert.strictEqual(B.num('£8.70'), 8.7); assert.strictEqual(B.num('1,234.50'), 1234.5); assert.strictEqual(B.num(' 8.7 '), 8.7);
  assert.strictEqual(B.num(''), null); assert.strictEqual(B.num('abc'), null); assert.strictEqual(B.num(null), null); assert.strictEqual(B.num(0), 0); });
t('master-file row (Ashian, 0.38 cost, 3.32 price)', () => { const c = B.calc({ cost: .38, mult: 2, post: 1.75 }, 3.32); near(c.total, 3.008, 1e-9); near(c.pr, .312); near(c.pc, .312 / .38); });
t('UK company cost is half the cost', () => { const c = B.calc({ cost: 10, mult: 1.5, post: 2.3, collab: '' }, 30); near(c.company, 5); near(c.total, 10 + 5 + 4.5 + 2.3); });
t('collab fee counts, blank = 0', () => { near(B.calc({ cost: 1, mult: 1.5, post: 1, collab: '0.5' }, 5).total, 1 + .5 + .75 + 1 + .5); });
t('postage bands and override', () => {
  [[2000, 1.75], [2001, 2.3], [15200, 2.3], [15201, 8], [20000, 8], [25000, 9], [30000, 10.5], [30001, 15]].forEach(([w, p]) => assert.strictEqual(B.postage(null, w), p));
  assert.strictEqual(B.postage('£3.10', 99999), 3.1); assert.strictEqual(B.postage(0, 500), 1.75); assert.strictEqual(B.postage(null, null), null); });
t('floors', () => { assert.strictEqual(B.floorOf(true, 0, 3).f, 1); assert.strictEqual(B.floorOf(false, 1, .5).f, .5);
  [[.99, .8], [1, .7], [4.99, .7], [5, .6], [9.99, .6], [10, .5]].forEach(([c, f]) => assert.strictEqual(B.floorOf(false, 0, c).f, f)); });
t('priceFor gives at least the % (rounded up)', () => { for (let c = .1; c < 40; c += .37) { const a = { cost: c, mult: 1.5, post: 2.3, collab: 0 }; [.5, .6, .7, .8, 1].forEach(f => {
  const p = B.priceFor(a, f); assert.ok(B.calc(a, p).pc >= f - 1e-9); assert.ok(B.calc(a, Math.round(p * 100 - 1) / 100).pc < f + 1e-9); }); } });
t('blank cost -> NEED YOUR REVIEW, never uploaded', () => { const o = D({ cost: '' , bb: 5, seller: 'X' }); assert.strictEqual(o.status, 'NEED YOUR REVIEW'); assert.ok(!o.upload); });
t('no postage and no weight -> review', () => { const o = D({ w: null, pc: null }); assert.strictEqual(o.status, 'NEED YOUR REVIEW'); assert.ok(/postage/.test(o.rule)); });
t('text price £8.70 is read', () => { const o = D({ price: '£8.70' }); assert.strictEqual(o.price, 8.7); });
t('blank / £0 price: Need review with suggestion, not uploaded', () => { const o = D({ price: '', bb: null }); assert.ok(o.priceBlank); assert.strictEqual(o.status, 'NEED YOUR REVIEW'); assert.ok(/suggested £/.test(o.rule)); assert.ok(!o.upload); const z = D({ price: 0 }); assert.ok(!z.upload); assert.strictEqual(z.status, 'NEED YOUR REVIEW'); const y = D({ price: 0, your: 9.99 }); assert.ok(y.status !== 'NEED YOUR REVIEW'); });
t('UK sold, competitor -> 1p under buy box', () => { const o = D({ cost: 3, sales: 3, bb: 9.5, seller: 'Rival', price: 9.99 }); assert.strictEqual(o.newp, 9.49); assert.ok(o.upload); assert.ok(o.fpc >= .5); });
t('UK sold, 1p under is above 80% -> capped at 80%', () => { const o = D({ sales: 3, bb: 20, seller: 'Rival', price: 19 }); assert.strictEqual(o.newp, o.ceil); assert.ok(/capped/.test(o.rule)); });
t('UK buy box below floor -> Margin too low, price kept', () => { const o = D({ sales: 3, bb: 3, seller: 'Rival', price: 9.99 }); assert.strictEqual(o.status, 'Margin too low'); assert.strictEqual(o.finalp, 9.99); assert.ok(!o.upload); });
t('UK sold, no competitor -> kept', () => { const o = D({ sales: 3, bb: '', seller: '' }); assert.strictEqual(o.status, 'No competitor – kept'); assert.ok(!o.upload); });
t('UK 0 sales floor uses cost band', () => { const o = D({ cost: 4, sales: 0 }); assert.strictEqual(o.floorPct, .7); });
t('winning -> kept', () => { const o = D({ seller: 'Diva Packages', bb: 9.99, sales: 5 }); assert.strictEqual(o.status, 'Already winning'); assert.ok(!o.upload); });
t('winning with 100+ sales -> +10% step held; with toggle uploaded; max 80%', () => {
  const r = { seller: 'Diva Packages', bb: 7, price: 7, sales: 150, cost: 2 }; const o = D(r); assert.strictEqual(o.status, 'Raise 10% – held for review'); assert.ok(!o.upload);
  const a = { cost: 2, mult: 1.5, post: 1.75, collab: 0 }; const pc = B.calc(a, 7).pc; const u = D(r, { raise100: true });
  assert.strictEqual(u.newp, B.priceFor(a, Math.min(.8, pc + .1))); assert.ok(u.upload); assert.ok(u.fpc <= .8 + .01);
  const top = D({ seller: 'Diva Packages', bb: 9, price: B.priceFor(a, .8), sales: 150, cost: 2 }, { raise100: true }); assert.ok(!top.upload); });
t('China: floor 100%, 1p under buy box', () => { const o = D({ sup: 'Ashian Homeware', sales: 2, bb: 12, seller: 'Rival', price: 13 }); assert.strictEqual(o.floorPct, 1); assert.strictEqual(o.newp, 11.99); assert.ok(o.fpc >= 1); });
t('China buy box below floor -> Margin too low, never raised to floor', () => { const o = D({ sup: 'ashian homeware', sales: 2, bb: 5, seller: 'Rival', price: 5.5 }); assert.strictEqual(o.status, 'Margin too low'); assert.strictEqual(o.finalp, 5.5); assert.ok(!o.upload); });
t('multi-pack and >30kg -> Check postage, not uploaded unless allowed', () => {
  assert.strictEqual(B.checkPost('3 x Bags', 100), 'Multi-pack x3'); assert.strictEqual(B.checkPost('1 x Bag', 100), ''); assert.strictEqual(B.checkPost('Box 3x', 100), '');
  assert.ok(/Over 30kg/.test(B.checkPost('Sand', 30001))); assert.strictEqual(B.checkPost('Sand', 30000), '');
  const r = { title: '4 x Spray', sales: 3, bb: 8.5, seller: 'Rival', price: 9.5 }; assert.strictEqual(D(r).why, 'Check postage first'); assert.ok(D(r, { checkPost: true }).upload); });
t('your price: loss / under 50% blocked, good one uploaded', () => {
  assert.strictEqual(D({ your: 1 }).status, 'Loss – blocked'); assert.ok(!D({ your: 1 }).upload);
  const a = { cost: 2, mult: 1.5, post: 1.75 }; const p49 = B.priceFor(a, .49); assert.strictEqual(D({ your: p49 }).status, 'Under 50% – blocked');
  const ok = D({ your: '£9.00' }); assert.strictEqual(ok.status, 'Your price'); assert.ok(ok.upload); assert.strictEqual(ok.finalp, 9); });
t('duplicate SKUs: first kept, later flagged and never uploaded', () => { const r = B.decideAll([Object.assign({}, base, { sales: 3, bb: 8.5, seller: 'R', price: 9.5 }), Object.assign({}, base, { sales: 3, bb: 8.5, seller: 'R', price: 9.5 }), Object.assign({}, base, { sku: ' ' })]);
  assert.strictEqual(r.dups, 1); assert.strictEqual(r.nosku, 1); assert.ok(r.rows[0].upload); assert.ok(!r.rows[1].upload); assert.strictEqual(r.rows[1].why, 'Duplicate SKU'); });
t('fromAccess maps headers, overlays buy box run and imported prices', () => {
  const H = ['sku', 'Variant description', 'Estimated cost', 'B&Q_INV.price', 'B&Q_BB.price', 'seller', 'Main supplier name', 'Weight', 'Postage Cost', 'B n Q 30Days', 'product-id'];
  const P = B.fromAccess([H, ['A', 'x', 2, 9, '£9', 'Diva Packages', 'UK', 100, '', 0, 5012345678901], ['B', 'y', 2, 9, '£8', 'R', 'UK', 100, '', 0, '5012345678902'], []],
    { bb: { '5012345678901': { seller: 'Rival', price: 7.5 }, '5012345678902': { seller: 'Diva Packages Ltd', price: 8.25 } }, bbLabel: 'run', imported: { A: 8.8 }, importedLabel: 'imp' });
  assert.strictEqual(P.rows.length, 2); assert.strictEqual(P.rows[0].price, 8.8); assert.strictEqual(P.rows[0].bb, 7.5); assert.strictEqual(P.rows[0].seller, 'Rival');
  assert.strictEqual(P.rows[1].price, 8.25); assert.ok(/our live price/.test(P.rows[1].srcPrice)); assert.throws(() => B.fromAccess([['a', 'b']]), /not the Access/); });
t('FUZZ 50,000 random rows: nothing uploaded at a loss, under 50%, China under 100% (rule prices), dup, or check postage', () => {
  let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(R() * a.length)];
  const rows = []; for (let i = 0; i < 50000; i++) rows.push({ sku: 'S' + Math.floor(R() * 45000), title: pick(['Bag', '2 x Bag', '10 x Tape', 'Sand']), cost: pick([null, '', 0, R() * .9, R() * 4, R() * 9, R() * 60, '£' + (R() * 9).toFixed(2)]),
    price: pick(['', 0, '£' + (R() * 30).toFixed(2), +(R() * 40).toFixed(2), 'n/a']), bb: pick(['', null, +(R() * 40).toFixed(2), '£' + (R() * 30).toFixed(2)]), seller: pick(['', 'Diva Packages', 'Rival Ltd']),
    sup: pick(['Ashian Homeware', 'UK Co']), pc: pick([null, '', +(R() * 6).toFixed(2)]), w: pick([null, R() * 2500, R() * 40000]), sales: pick([0, '', 1, 5, 99, 100, 250]), collab: pick(['', 0, .3]), your: pick([null, null, null, null, +(R() * 30).toFixed(2)]) });
  [{}, { raise100: true, checkPost: true }].forEach(opt => { const out = B.decideAll(rows, opt); let up = 0;
    out.rows.forEach(o => { if (!o.upload) return; up++; const c = B.calc({ cost: o.cost, mult: o.mult, post: o.post, collab: o.collab }, o.finalp);
      assert.ok(c.profit > 0, o.sku); assert.ok(c.pc >= .5 - 1e-9, o.sku); assert.ok(!o.dup); if (!opt.checkPost) assert.ok(!o.check);
      if (o.china && o.your == null) assert.ok(c.pc >= 1 - 1e-9, 'china ' + o.sku + ' ' + c.pc);
      if (!o.china && o.your == null) assert.ok(c.pc <= .8 + 1e-9 || o.finalp <= o.price, 'uk over 80% ' + o.sku + ' ' + c.pc);
      if (typeof o.raw === 'number' && !o.china) assert.ok(B.calc(o.a || { cost: o.cost, mult: o.mult, post: o.post, collab: o.collab }, o.raw).pc <= .8 + 1e-9, 'raw over 80% ' + o.sku);
      assert.ok(o.finalp !== o.price); });
    assert.ok(up > 100, 'fuzz uploads ' + up); assert.strictEqual(new Set(out.rows.filter(o => o.upload).map(o => o.sku)).size, up); });
});

t('cap price rounds DOWN: never over 80%, and 1p more would be over', () => { let k = 0;
  for (let c = .05; c < 60; c += .0731) [1.5, 2].forEach(m => [0, 1.75, 2.3, 8].forEach(post => { const a = { cost: c, mult: m, post: post, collab: 0 };
    const p = B.priceMax(a, .8); assert.ok(B.calc(a, p).pc <= .8 + 1e-9, 'cap ' + c + ' ' + p); assert.ok(B.calc(a, Math.round(p * 100 + 1) / 100).pc > .8 - 1e-9); k++; }));
  assert.ok(k > 3000); });
t('floor price rounds UP: never under the floor (China and UK floors 50/60/70%)', () => {
  for (let c = .05; c < 60; c += .0731) [.5, .6, .7, 1].forEach(f => { const a = { cost: c, mult: f === 1 ? 2 : 1.5, post: 1.75, collab: 0 };
    const p = B.floorPrice(a, f, f === 1); assert.ok(B.calc(a, p).pc >= f - 1e-9, 'floor ' + c + ' ' + f); }); });
t('UK floor 80% = cap 80%: floor never above cap (cap wins, within 1p)', () => {
  for (let c = .05; c < 1; c += .0137) { const a = { cost: c, mult: 1.5, post: 1.75, collab: 0 }, fp = B.floorPrice(a, .8, false), cp = B.priceMax(a, .8);
    assert.ok(fp <= cp + 1e-9); assert.ok(B.calc(a, fp).pc <= .8 + 1e-9); assert.ok(B.calc(a, fp + .01).pc > .8 - 1e-9); } });
t('decide: no-competitor UK and 100+ step never over 80% after rounding', () => {
  for (let c = .3; c < 40; c += .113) {
    const o = D({ cost: c, price: 999, bb: null, sales: 0 }); assert.ok(o.ceil == null || B.calc({ cost: c, mult: 1.5, post: 1.75, collab: 0 }, o.ceil).pc <= .8 + 1e-9);
    const a = { cost: c, mult: 1.5, post: 1.75, collab: 0 }, p0 = B.priceFor(a, .75), s = D({ cost: c, price: p0, bb: p0, seller: 'Diva Packages', sales: 150 }, { raise100: true });
    if (typeof s.raw === 'number') assert.ok(B.calc(a, s.raw).pc <= .8 + 1e-9, 'step ' + c + ' ' + s.raw);
    const fl = D({ cost: c, price: 999, bb: 1, sales: 0 }); if (typeof fl.floor === 'number') assert.ok(B.calc(a, fl.floor).pc >= B.floorOf(false, 0, c).f - 1e-9 || B.floorOf(false, 0, c).f === .8); } });

t('optional penny trims: cap-only, <=5p and <=5% -> kept (no upload) unless switched on', () => {
  const a = { cost: 2, mult: 1.5, post: 1.75, collab: 0 }, cap = B.priceMax(a, .8), r2 = x => Math.round(x * 100) / 100;
  [null, r2(cap + 1)].forEach(bb => [.01, .03, .05].forEach(d => {
    const o = D({ cost: 2, price: r2(cap + d), bb: bb, seller: bb ? 'Rival' : '', sales: 0 });
    assert.strictEqual(o.status, B.TRIM); assert.ok(o.trim && !o.upload && o.finalp === r2(cap + d));
    const on = D({ cost: 2, price: r2(cap + d), bb: bb, seller: bb ? 'Rival' : '', sales: 0 }, { pennyTrims: true });
    assert.ok(on.trim && on.upload && on.finalp === cap); assert.ok(B.calc(a, on.finalp).pc <= .8 + 1e-9); }));
  assert.ok(D({ cost: 2, price: r2(cap + .06), bb: null, sales: 0 }).upload, '6p is a real change');
  const s1 = D({ cost: 2, price: r2(cap + .03), bb: r2(cap + 1), seller: 'Rival', sales: 3 }); assert.ok(s1.trim && !s1.upload, 'UK sold capped');
  const chase = D({ cost: 2, price: r2(cap - .02), bb: r2(cap - .02), seller: 'Rival', sales: 0 }); assert.ok(!chase.trim && chase.upload, 'buy box chase is never a trim');
  const cheap = { cost: .1, mult: 1.5, post: 0, collab: 0 }, cc = B.priceMax(cheap, .8); // ~£0.27: 5% of price < 5p
  const o2 = D({ cost: .1, price: r2(cc + .02), bb: null, sales: 0, pc: 0.0001, w: 10 }); if (r2(cc + .02) * .05 < .02) assert.ok(!o2.trim, '5% rule');
  assert.ok(!D({ cost: 2, price: 30, bb: null, sup: 'Ashian Homeware co.,Ltd', sales: 0 }).trim, 'never China');
});
console.log('pricing engine: ' + n + ' tests passed');
// sales30: same rule as the Sales tab (not cancelled, newest order day - 29 days)
(() => { const D0 = Date.UTC(2026, 10, 2, 10) / 6e4, d = 1440;
  const RAW = { st: ['Received', 'Refunded', 'Cancelled'], sku: [['A'], ['B'], ['C']], L: [[D0, 'o1', 2, 9, 0, 0], [D0 - 29 * d, 'o2', 1, 9, 0, 1], [D0 - 30 * d, 'o3', 5, 9, 0, 0], [D0, 'o4', 3, 9, 1, 2], [D0 - 10 * d, 'o5', 4, 9, 2, 0]] };
  const S = B.sales30(RAW); assert.deepStrictEqual(S.map, { A: 3, C: 4 }); assert.strictEqual(S.last, '2026-11-02');
  const H = Object.values(B.HDR), row = H.map(() => null), set = (k, v) => { row[H.indexOf(B.HDR[k])] = v; };
  set('sku', 'B'); set('cost', 2); set('price', 9); set('bb', 8); set('seller', 'X'); set('sup', 'UK'); set('w', 500); set('sales', 7);
  const P = B.fromAccess([H, row], { sales30: S.map, salesLabel: 'B&Q orders to 2026-11-02' }); const o = B.decide(P.rows[0]);
  assert.strictEqual(o.sales, 0); assert.strictEqual(o.salesAccess, 7); assert.strictEqual(o.srcSales, 'B&Q orders to 2026-11-02'); assert.strictEqual(o.floorPct, 0.7);
  const P2 = B.fromAccess([H, row], {}); assert.strictEqual(B.decide(P2.rows[0]).sales, 7);
  console.log('pricing engine: sales30 tests passed'); })();
