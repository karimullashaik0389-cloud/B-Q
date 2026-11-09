/* Live workbook + checked-import tests. Recalculation is done by Gnumeric (ssconvert), not by reading formula text.
   Made-up products only. */
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const X = require(path.join(__dirname, '..', '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const B = require(path.join(__dirname, '..', 'bq_book.js'));
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const rows = [
  { sku: 'WIN', title: 'Winner', ean: '100', cost: 2, price: 8, bb: 8, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, sales: 5, stock: 3 },
  { sku: 'LOW', title: 'Can win', ean: '101', cost: 2, price: 12, bb: 9, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 4, stock: 3 },
  { sku: 'ZERO', title: 'Quiet winner', ean: '102', cost: 3, price: 20, bb: 20, seller: 'Diva Packages', sup: 'UK Ltd', w: 800, sales: 0, stock: 4 },
  { sku: 'MTL', title: 'Too dear', ean: '103', cost: 8, price: 40, bb: 12, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 3, stock: 2 },
  { sku: 'PACKL', title: '3 x Light', ean: '104', cost: 2, price: 12, bb: 9, seller: 'Rival', sup: 'UK Ltd', w: 14998, sales: 4, stock: 3 },
  { sku: 'PACKH', title: '3 x Heavy', ean: '105', cost: 2, price: 15, bb: 12, seller: 'Rival', sup: 'UK Ltd', w: 14999, sales: 4, stock: 3 },
  { sku: 'CN', title: 'China low', ean: '106', cost: 2, price: 6, bb: 6, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 500, sales: 2, stock: 5 },
  { sku: 'HELD', title: 'Held cut', ean: '108', cost: 8, price: 40, bb: 12, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 3, stock: 2 },
  { sku: 'SPEC', title: 'Guitar', ean: '107', cost: 5, price: 20, bb: 18, seller: 'Rival', sup: 'UK Ltd', w: 3000, sales: 2, stock: 1, variant: 'GUI-TAR-1' }
];
function workbook(extra) {
  const d = P.decideAll(rows, {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
  const S = Object.assign({}, P.BB_DEFAULT, { asOf: '2026-11-09', priceChanges: { HELD: { date: '2026-11-08' } } }, extra && extra.settings);
  return B.build(X, P, Object.assign({ bbr: bb, settings: S, asOf: '2026-11-09', priceChanges: S.priceChanges }, extra));
}
function recalc(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bqlive-'));
  const src = path.join(dir, 'in.xlsx'), out = path.join(dir, 'out.xlsx');
  fs.writeFileSync(src, Buffer.from(bytes));
  execFileSync('ssconvert', ['--export-type=Gnumeric_Excel:xlsx2', src, out], { stdio: ['ignore', 'ignore', 'ignore'] });
  return X.read(fs.readFileSync(out), { type: 'buffer' });
}
function sheetRows(wb, name) { const ws = wb.Sheets[name]; assert.ok(ws, name); return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }); }
function find(wb, name, sku) { return sheetRows(wb, name).find(r => r && String(r[0]) === sku); }
function finals(wb, name) { return sheetRows(wb, name).slice(2).filter(r => r && r[0]).map(r => [String(r[0]), Math.round(r[1] * 100) / 100]); }
function near(a, b) { if (a == null && b == null) return; assert.ok(Math.abs(a - b) < 0.02, a + ' vs ' + b); }
const S0 = Object.assign({}, P.BB_DEFAULT, { asOf: '2026-11-09', priceChanges: { HELD: { date: '2026-11-08' } } });

t('no-edit baseline matches the engine and does not upload China or the heavy pack', () => {
  const built = workbook();
  const wb = recalc(built.bytes);
  const uk = finals(wb, '7a Final upload UK'), cn = finals(wb, '7b Final upload China');
  assert.deepStrictEqual(cn, []);
  assert.ok(!uk.some(r => r[0] === 'CN' || r[0] === 'PACKH' || r[0] === 'HELD' || r[0] === 'WIN'));
  ['LOW', 'MTL', 'PACKL', 'SPEC'].forEach(sku => {
    const rec = built.records.find(r => r.sku === sku);
    const hit = uk.find(r => r[0] === sku);
    assert.ok(hit, sku); near(hit[1], rec.engSugg);
    const comb = find(wb, '6 Combined upload', sku);
    near(comb[4], rec.basePost); near(comb[10], rec.engProfit); assert.strictEqual(comb[22], rec.engCheck);
  });
  const heavy = find(wb, '6 Combined upload', 'PACKH');
  assert.strictEqual(heavy[22], 'CHECK POSTAGE'); assert.strictEqual(heavy[21], 'No');
  assert.strictEqual(find(wb, '6 Combined upload', 'PACKL')[22], 'OK');
  assert.strictEqual(find(wb, '6 Combined upload', 'HELD')[22], 'WEEKLY HOLD');
  assert.strictEqual(find(wb, '6 Combined upload', 'CN')[22], 'CHINA RAISE');
  near(find(wb, '6 Combined upload', 'SPEC')[4], 3.3);
  const errs = JSON.stringify(sheetRows(wb, '6 Combined upload')).match(/#REF!|Err:522|#VALUE!/g);
  assert.strictEqual(errs, null);
});

t('postage typed on the margin tab changes profit and suggestion on that tab, Combined and Final', () => {
  const built = workbook({ checks: { MTL: { post: 8 } } });
  const wb = recalc(built.bytes);
  const o = B.outcome(P, built.records.find(r => r.sku === 'MTL'), { post: 8 }, S0);
  for (const name of ['5 Margin too low', '6 Combined upload']) {
    const r = find(wb, name, 'MTL');
    near(r[4], 8); near(r[10], o.profitNow); near(r[15], o.sugg); near(r[17], o.newProfit); near(r[23], o.final); assert.strictEqual(r[22], 'OK');
  }
  const hit = finals(wb, '7a Final upload UK').find(r => r[0] === 'MTL');
  near(hit[1], o.final);
  assert.ok(!finals(wb, '7b Final upload China').length);
});

t('a heavy pack at 14999g stays held until postage is typed, including 0', () => {
  const held = workbook();
  assert.strictEqual(find(recalc(held.bytes), '6 Combined upload', 'PACKH')[22], 'CHECK POSTAGE');
  const cleared = workbook({ checks: { PACKH: { post: 0 } } });
  const wb = recalc(cleared.bytes);
  const o = B.outcome(P, cleared.records.find(r => r.sku === 'PACKH'), { post: 0 }, S0);
  const r = find(wb, '6 Combined upload', 'PACKH');
  assert.strictEqual(r[4], 0); near(r[10], o.profitNow); assert.strictEqual(r[22], o.check);
  if (o.upload) near(finals(wb, '7a Final upload UK').find(x => x[0] === 'PACKH')[1], o.final);
});

t('selling price review recalculates profit; Your price is a separate final and can be blocked', () => {
  const priced = workbook({ checks: { LOW: { priceNow: 30 } } });
  const wb = recalc(priced.bytes);
  const o = B.outcome(P, priced.records.find(r => r.sku === 'LOW'), { priceNow: 30 }, S0);
  const r = find(wb, '6 Combined upload', 'LOW');
  near(r[8], 30); near(r[10], o.profitNow); assert.strictEqual(r[22], o.check);
  const yours = workbook({ checks: { LOW: { your: 11 } } });
  const w2 = recalc(yours.bytes);
  const y = B.outcome(P, yours.records.find(r => r.sku === 'LOW'), { your: 11 }, S0);
  const row = find(w2, '4 Can win buy box', 'LOW');
  const comb = find(w2, '6 Combined upload', 'LOW');
  near(row[15], y.sugg); near(row[23], 11); assert.strictEqual(row[22], 'OVER CAP'); assert.strictEqual(comb[22], 'OVER CAP');
  assert.ok(!finals(w2, '7a Final upload UK').some(x => x[0] === 'LOW' && x[1] === 11));
});

t('two different postage reviews conflict and the old final price is not kept', () => {
  const built = workbook();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bqedit-'));
  const src = path.join(dir, 'in.xlsx'), dst = path.join(dir, 'edit.xlsx');
  fs.writeFileSync(src, Buffer.from(built.bytes));
  execFileSync('python3', [path.join(__dirname, 'poke_xlsx.py'), src, dst, '5 Margin too low|MTL|F|8', '6 Combined upload|MTL|F|3']);
  const out = recalc(fs.readFileSync(dst));
  const row = find(out, '6 Combined upload', 'MTL');
  assert.strictEqual(row[22], 'CONFLICT');
  assert.ok(!finals(out, '7a Final upload UK').some(r => r[0] === 'MTL'));
});

t('Include Yes does not clear postage, a China raise, or a weekly hold', () => {
  const built = workbook({ checks: { PACKH: { inc: 'Yes' }, CN: { inc: 'Yes', your: 12 }, HELD: { inc: 'Yes', your: 30 } } });
  const wb = recalc(built.bytes);
  assert.strictEqual(find(wb, '6 Combined upload', 'PACKH')[22], 'CHECK POSTAGE');
  assert.strictEqual(find(wb, '6 Combined upload', 'CN')[22], 'CHINA RAISE');
  assert.strictEqual(find(wb, '6 Combined upload', 'HELD')[22], 'WEEKLY HOLD');
  const uk = finals(wb, '7a Final upload UK').map(r => r[0]), cn = finals(wb, '7b Final upload China');
  assert.ok(!uk.includes('PACKH') && !uk.includes('HELD') && !uk.includes('CN'));
  assert.deepStrictEqual(cn, []);
});

t('a postage change can make a previously unchanged SKU eligible, and a bad postage removes one', () => {
  const before = finals(recalc(workbook().bytes), '7a Final upload UK').map(r => r[0]);
  assert.ok(!before.includes('WIN'));
  const after = workbook({ checks: { WIN: { post: 6 } } });
  const o = B.outcome(P, after.records.find(r => r.sku === 'WIN'), { post: 6 }, S0);
  const wb = recalc(after.bytes);
  const row = find(wb, '6 Combined upload', 'WIN');
  near(row[10], o.profitNow); assert.strictEqual(row[22], o.check);
  const uk = finals(wb, '7a Final upload UK');
  if (o.upload) { const hit = uk.find(r => r[0] === 'WIN'); assert.ok(hit); near(hit[1], o.final); }
  else assert.ok(!uk.some(r => r[0] === 'WIN'));
  const blocked = workbook({ checks: { LOW: { post: 50 } } });
  const ob = B.outcome(P, blocked.records.find(r => r.sku === 'LOW'), { post: 50 }, S0);
  const wb2 = recalc(blocked.bytes);
  assert.strictEqual(find(wb2, '6 Combined upload', 'LOW')[22], ob.check);
  if (!ob.upload) assert.ok(!finals(wb2, '7a Final upload UK').some(r => r[0] === 'LOW'));
});

t('tab 8 is not an input, formulas are not saved, blanks do not wipe a saved postage', () => {
  const built = workbook({ t8: [{ sku: 'LOW', title: 'x', why: 'report only' }] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq8-'));
  const src = path.join(dir, 'in.xlsx'), dst = path.join(dir, 'edit.xlsx');
  fs.writeFileSync(src, Buffer.from(built.bytes));
  execFileSync('python3', [path.join(__dirname, 'poke_xlsx.py'), src, dst, '8 Sells elsewhere not B&Q|LOW|B|1']);
  const out = recalc(fs.readFileSync(dst));
  near(find(out, '6 Combined upload', 'LOW')[4], 1.75);
  const by = {}; built.records.forEach(r => { by[r.sku] = { postAuto: r.basePost, priceNow: r.basePrice, incDefault: r.engInc }; });
  const fresh = X.read(Buffer.from(built.bytes), { type: 'buffer', cellFormula: true });
  const none = B.parseChecks(X, fresh, { by: by, yourPrice: true });
  assert.strictEqual(none.counts.postage, 0); assert.strictEqual(none.counts.include, 0); assert.strictEqual(none.counts.your, 0); assert.strictEqual(none.counts.sellingPrice, 0);
  function put(wsName, sku, col, cell) {
    const ws = fresh.Sheets[wsName], range = X.utils.decode_range(ws['!ref']);
    for (let r = 0; r <= range.e.r; r++) {
      const a = ws[X.utils.encode_cell({ r: r, c: 0 })];
      if (a && String(a.v) === sku) { ws[X.utils.encode_cell({ r: r, c: col })] = cell; return; }
    }
  }
  put('6 Combined upload', 'LOW', 5, { t: 'n', v: 4.5 });
  put('6 Combined upload', 'MTL', 5, { t: 'n', f: '1+1', v: 2 });
  put('5 Margin too low', 'MTL', 5, { t: 'n', v: 9 });
  put('6 Combined upload', 'PACKH', 16, { t: 'n', v: 11 });
  const prev = B.parseChecks(X, fresh, { by: by, yourPrice: false });
  assert.ok(prev.changes.some(c => c.sku === 'LOW' && c.post === 'set' && c.postValue === 4.5));
  assert.ok(prev.invalid.some(x => x.sku === 'MTL' && x.field === 'post'));
  assert.strictEqual(prev.counts.your, 0);
  const withYour = B.parseChecks(X, fresh, { by: by, yourPrice: true });
  assert.ok(withYour.changes.some(c => c.sku === 'PACKH' && c.your === 'set' && c.yourValue === 11));
  const saved = B.applyPreview({ v: 1, items: { LOW: { post: 4.5 } } }, { changes: [{ sku: 'LOW', post: 'keep' }, { sku: 'NOPE', unknown: true }] });
  assert.strictEqual(saved.items.LOW.post, 4.5);
  const dup = B.parseChecks(X, fresh, { by: by, yourPrice: false });
  put('6 Combined upload', 'LOW', 5, { t: 'n', v: 1 });
  const ws = fresh.Sheets['6 Combined upload'];
  const range = X.utils.decode_range(ws['!ref']);
  let copied = false;
  for (let r = range.e.r; r >= 0 && !copied; r--) {
    const a = ws[X.utils.encode_cell({ r: r, c: 0 })];
    if (a && String(a.v) === 'LOW') {
      const nr = range.e.r + 1;
      ws[X.utils.encode_cell({ r: nr, c: 0 })] = { t: 's', v: 'LOW' };
      ws[X.utils.encode_cell({ r: nr, c: 5 })] = { t: 'n', v: 9 };
      ws['!ref'] = X.utils.encode_range({ s: range.s, e: { r: nr, c: range.e.c } });
      copied = true;
    }
  }
  const dups = B.parseChecks(X, fresh, { by: by, yourPrice: false });
  assert.ok(dups.duplicate.indexOf('LOW') >= 0);
  const kept = B.applyPreview(saved, dups);
  assert.strictEqual(kept.items.LOW.post, 4.5);
  assert.ok(dup);
});

t('backup round-trip keeps 0 postage and drops a formula-like field', () => {
  const store = B.normStore({ items: { A: { post: 0, priceNow: 3.5, inc: 'Yes', your: 'nope', at: '2026-11-09' }, B: { post: -2 } } });
  assert.strictEqual(store.items.A.post, 0); assert.strictEqual(store.items.A.priceNow, 3.5); assert.strictEqual(store.items.A.your, undefined); assert.strictEqual(store.items.B, undefined);
  const back = JSON.parse(JSON.stringify(B.backup(store)));
  const again = B.restoreBackup(back);
  assert.strictEqual(again.ok, true); assert.strictEqual(again.store.items.A.post, 0);
  assert.strictEqual(B.restoreBackup({ items: {} }).ok, false);
});

t('negative postage is invalid and 14998g still uses the normal band', () => {
  assert.strictEqual(P.checkPost('3 x Bag', 14998), '');
  assert.strictEqual(P.postage(null, 14998, '3 x Bag', []), 2.3);
  assert.ok(/14999/.test(P.checkPost('3 x Bag', 14999)));
  const built = workbook();
  const wb = X.read(Buffer.from(built.bytes), { type: 'buffer', cellFormula: true });
  const ws = wb.Sheets['6 Combined upload'], range = X.utils.decode_range(ws['!ref']);
  for (let r = 0; r <= range.e.r; r++) {
    const a = ws[X.utils.encode_cell({ r: r, c: 0 })];
    if (a && String(a.v) === 'LOW') ws[X.utils.encode_cell({ r: r, c: 5 })] = { t: 'n', v: -3 };
  }
  const by = {}; built.records.forEach(r => { by[r.sku] = { postAuto: r.basePost, incDefault: r.engInc }; });
  const prev = B.parseChecks(X, wb, { by: by, yourPrice: false });
  assert.ok(prev.invalid.some(x => x.sku === 'LOW'));
  assert.ok(!prev.changes.some(c => c.sku === 'LOW' && c.post === 'set'));
});

console.log('live workbook tests passed:', n);
