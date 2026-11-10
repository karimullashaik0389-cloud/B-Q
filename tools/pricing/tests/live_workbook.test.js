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
  if (fs.existsSync('/usr/bin/ssconvert')) {
    execFileSync('ssconvert', ['--export-type=Gnumeric_Excel:xlsx2', src, out], { stdio: ['ignore', 'ignore', 'ignore'] });
  } else {
    const cdir = path.join(dir, 'lo'); fs.mkdirSync(cdir);
    execFileSync('soffice', ['--headless', '--nologo', '--nofirststartwizard', '--calc', '--convert-to', 'xlsx', '--outdir', cdir, src], { stdio: ['ignore', 'ignore', 'ignore'] });
    fs.copyFileSync(path.join(cdir, 'in.xlsx'), out);
  }
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

t('a review tab selling-price edit updates that tab, Combined and Final', () => {
  const built = workbook({ checks: { MTL: { priceNow: 25 } } });
  const wb = recalc(built.bytes);
  const o = B.outcome(P, built.records.find(r => r.sku === 'MTL'), { priceNow: 25 }, S0);
  const src = find(wb, '5 Margin too low', 'MTL');
  const comb = find(wb, '6 Combined upload', 'MTL');
  near(src[8], 25); near(src[10], o.profitNow); near(src[11], o.profitNow / 8); near(src[15], o.sugg); assert.strictEqual(src[22], o.check);
  near(comb[10], src[10]); near(comb[11], src[11]); near(comb[15], src[15]); near(comb[23], src[23]); assert.strictEqual(comb[22], src[22]);
  const hit = finals(wb, '7a Final upload UK').find(r => r[0] === 'MTL');
  if (o.upload) near(hit[1], o.final); else assert.ok(!hit);
});

t('Include Yes does not replace a special postage; typing the same postage clears a heavy pack', () => {
  const heavy = { sku: 'GTR', title: '3 x Guitar', ean: '199', cost: 5, price: 40, bb: 18, seller: 'Rival', sup: 'UK Ltd', w: 14999, sales: 2, stock: 2, variant: 'GUI-TAR-1' };
  const d = P.decideAll(rows.concat([heavy]), {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
  const built = B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09', priceChanges: S0.priceChanges, checks: { GTR: { inc: 'Yes' } } });
  const rec = built.records.find(r => r.sku === 'GTR');
  near(rec.basePost, 3.3);
  const held = recalc(built.bytes);
  const row = find(held, '6 Combined upload', 'GTR');
  near(row[4], 3.3); assert.strictEqual(row[22], 'CHECK POSTAGE'); assert.strictEqual(row[21], 'No');
  const cleared = B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09', priceChanges: S0.priceChanges, checks: { GTR: { post: 3.3, inc: 'Yes' } } });
  const wb = recalc(cleared.bytes);
  const o = B.outcome(P, rec, { post: 3.3, inc: 'Yes' }, S0);
  const src = find(wb, '4 Can win buy box', 'GTR') || find(wb, '5 Margin too low', 'GTR') || find(wb, '6 Combined upload', 'GTR');
  const comb = find(wb, '6 Combined upload', 'GTR');
  near(src[4], 3.3); near(comb[4], 3.3); assert.notStrictEqual(comb[4], 2.3); assert.notStrictEqual(comb[4], 8);
  assert.strictEqual(comb[22], o.check); near(comb[10], o.profitNow); near(comb[15], o.sugg);
  if (o.upload) near(finals(wb, '7a Final upload UK').find(r => r[0] === 'GTR')[1], o.final);
});

t('selling price review recalculates profit; a raise over the cap is blocked, a cut that stays over the cap is allowed', () => {
  const priced = workbook({ checks: { LOW: { priceNow: 30 } } });
  const wb = recalc(priced.bytes);
  const o = B.outcome(P, priced.records.find(r => r.sku === 'LOW'), { priceNow: 30 }, S0);
  const r = find(wb, '6 Combined upload', 'LOW');
  near(r[8], 30); near(r[10], o.profitNow); assert.strictEqual(r[22], o.check);
  const cut = workbook({ checks: { LOW: { your: 11, inc: 'Yes' } } });
  const wCut = recalc(cut.bytes);
  const yCut = B.outcome(P, cut.records.find(r => r.sku === 'LOW'), { your: 11, inc: 'Yes' }, S0);
  const rowCut = find(wCut, '4 Can win buy box', 'LOW');
  const combCut = find(wCut, '6 Combined upload', 'LOW');
  near(rowCut[15], yCut.sugg); near(rowCut[23], 11); assert.strictEqual(yCut.check, 'OK'); assert.strictEqual(rowCut[22], 'OK'); assert.strictEqual(combCut[22], 'OK');
  near(finals(wCut, '7a Final upload UK').find(x => x[0] === 'LOW')[1], 11);
  const raise = workbook({ checks: { LOW: { your: 13, inc: 'Yes' } } });
  const wRaise = recalc(raise.bytes);
  const yRaise = B.outcome(P, raise.records.find(r => r.sku === 'LOW'), { your: 13, inc: 'Yes' }, S0);
  assert.strictEqual(yRaise.check, 'OVER CAP');
  assert.strictEqual(find(wRaise, '4 Can win buy box', 'LOW')[22], 'OVER CAP');
  assert.strictEqual(find(wRaise, '6 Combined upload', 'LOW')[22], 'OVER CAP');
  assert.ok(!finals(wRaise, '7a Final upload UK').some(x => x[0] === 'LOW' && x[1] === 13));
});

t('a cut from an already over-cap price is OK and goes into 7a; a raise above the cap stays blocked', () => {
  const row = { sku: 'CAPCUT', title: 'AX Snow Foam 800ml', ean: '200', cost: 0.68, price: 4.99, bb: 4.99, seller: 'Diva Packages', sup: 'UK Ltd', w: 855, sales: 2, stock: 10 };
  const d = P.decideAll([row], {});
  const bb = P.buyBoxAll(d.rows, { '200': 1 }, {}, P.BB_DEFAULT);
  const rec0 = B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09' }).records.find(r => r.sku === 'CAPCUT');
  assert.ok(rec0.engCap != null && rec0.basePrice > rec0.engCap, 'fixture is already over the cap');
  assert.notStrictEqual(rec0.engCheck, 'OK');
  const oCut = B.outcome(P, rec0, { your: 3.99, inc: 'Yes' }, S0);
  assert.strictEqual(oCut.check, 'OK'); assert.strictEqual(oCut.inc, 'Yes'); assert.ok(oCut.upload); near(oCut.final, 3.99);
  assert.ok(oCut.newPc > 0.8 && oCut.newPc < 1, 'cut stays above the 80% cap: ' + oCut.newPc);
  const oRaise = B.outcome(P, rec0, { your: 5.49, inc: 'Yes' }, S0);
  assert.strictEqual(oRaise.check, 'OVER CAP'); assert.ok(!oRaise.upload);
  const w0 = recalc(B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09' }).bytes);
  assert.ok(!finals(w0, '7a Final upload UK').some(x => x[0] === 'CAPCUT'), 'engine does not auto-cut an over-cap keep');
  const wCut = recalc(B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09', checks: { CAPCUT: { your: 3.99, inc: 'Yes' } } }).bytes);
  const comb = find(wCut, '6 Combined upload', 'CAPCUT');
  near(comb[23], 3.99); assert.strictEqual(comb[22], 'OK'); assert.strictEqual(comb[21], 'Yes');
  near(finals(wCut, '7a Final upload UK').find(x => x[0] === 'CAPCUT')[1], 3.99);
  const wRaise = recalc(B.build(X, P, { bbr: bb, settings: S0, asOf: '2026-11-09', checks: { CAPCUT: { your: 5.49, inc: 'Yes' } } }).bytes);
  assert.strictEqual(find(wRaise, '6 Combined upload', 'CAPCUT')[22], 'OVER CAP');
  assert.ok(!finals(wRaise, '7a Final upload UK').some(x => x[0] === 'CAPCUT' && x[1] === 5.49));
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

t('the dashboard pages include the import control and the live calculator', () => {
  ['index.html', 'sales.html', 'orders.html'].forEach(function (name) {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', name), 'utf8');
    assert.ok(html.indexOf('Import checked workbook') > 0, name);
    assert.ok(html.indexOf('Postage review') > 0, name);
    assert.ok(html.indexOf('Selling price review') > 0, name);
    assert.ok(html.indexOf('function shareFormulas') > 0 || html.indexOf('shareFormulas') > 0, name);
    assert.ok(html.indexOf('saved in this browser') > 0 || html.indexOf('this browser only') > 0, name);
  });
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

t('a China price above the 100% floor is not raised onto the upload', () => {
  const a = { cost: 4, mult: 2, post: 1.75, collab: 0 };
  const floor = P.priceFor(a, 1), stop = P.priceFor(a, 1.05);
  const mid = P.rnd((floor + stop) / 2, 2);
  const chinaRows = [
    { sku: 'MID', title: 'China mid', ean: '201', cost: 4, price: mid, bb: mid, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 400, sales: 0, stock: 4 },
    { sku: 'CUT', title: 'China high', ean: '202', cost: 4, price: 40, bb: 40, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 400, sales: 0, stock: 4 },
    { sku: 'LOWC', title: 'China under', ean: '203', cost: 4, price: 10, bb: 10, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 400, sales: 2, stock: 4 }
  ];
  function built(extra) {
    const d = P.decideAll(chinaRows, {});
    const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
    return B.build(X, P, Object.assign({ bbr: bb, settings: P.BB_DEFAULT }, extra));
  }
  const plain = built();
  const midRec = plain.records.find(r => r.sku === 'MID');
  assert.strictEqual(midRec.engCheck, 'CHINA RAISE');
  assert.ok(midRec.engInc !== 'Yes');
  const wb = recalc(plain.bytes);
  const cn = finals(wb, '7b Final upload China');
  assert.ok(!cn.some(r => r[0] === 'MID' || r[0] === 'LOWC'));
  const cut = cn.find(r => r[0] === 'CUT');
  assert.ok(cut); assert.ok(cut[1] < 40); assert.ok(cut[1] >= stop - 0.02);
  const cell = wb.Sheets['7b Final upload China'];
  const hit = Object.keys(cell).find(k => cell[k] && cell[k].v === 'CUT');
  assert.ok(hit && cell[hit].f && cell[hit].v === 'CUT');
  const over = built({ checks: { MID: { your: stop, inc: 'Yes' }, LOWC: { your: floor, inc: 'Yes' } } });
  const wb2 = recalc(over.bytes);
  assert.strictEqual(find(wb2, '6 Combined upload', 'MID')[22], 'CHINA RAISE');
  assert.ok(!finals(wb2, '7b Final upload China').some(r => r[0] === 'MID' || r[0] === 'LOWC'));
});

t('weekly hold is tab 5 UK only: 2 days held, exactly 3 days not held', () => {
  function one(changes) {
    const d = P.decideAll(rows, {});
    const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
    const S = Object.assign({}, P.BB_DEFAULT, { asOf: '2026-11-09', priceChanges: changes });
    return B.build(X, P, { bbr: bb, settings: S, asOf: '2026-11-09', priceChanges: changes }).records;
  }
  const two = one({ HELD: { date: '2026-11-07' }, ZERO: { date: '2026-11-07' }, CN: { date: '2026-11-07' } });
  const rec = sku => two.find(r => r.sku === sku);
  assert.strictEqual(rec('HELD').weekly, 1);
  assert.strictEqual(rec('HELD').engCheck, 'WEEKLY HOLD');
  assert.strictEqual(rec('ZERO').weekly, 0);
  assert.notStrictEqual(rec('ZERO').engCheck, 'WEEKLY HOLD');
  assert.strictEqual(rec('CN').weekly, 0);
  const three = one({ HELD: { date: '2026-11-06' } }).find(r => r.sku === 'HELD');
  assert.strictEqual(three.weekly, 0);
  assert.notStrictEqual(three.engCheck, 'WEEKLY HOLD');
});

t('a normal download fills tab 8 from other-platform sales and does not invent an upload', () => {
  const aoa = [['sku', 'Variant description', 'Estimated cost', 'B&Q_INV.price', 'B&Q_BB.price', 'seller', 'Main supplier name', 'Weight', 'B n Q 30Days', 'Total 30Days Sales', 'Free stock quantity'],
    ['ELSE', 'Sells elsewhere', 2, 10, 9, 'Rival', 'UK Ltd', 500, 0, 12, 4],
    ['HOME', 'Only here', 2, 12, 9, 'Rival', 'UK Ltd', 500, 4, 4, 3]];
  const raw = aoa.slice(1).map(function (r, i) { return { sku: r[0], title: r[1], cost: r[2], price: r[3], bb: r[4], seller: r[5], sup: r[6], w: r[7], sales: r[8], stock: r[10], ean: 'E' + r[0], ix: i + 1 }; });
  const d = P.decideAll(raw, {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(function (o) { return [o.ean, 1]; })), {}, P.BB_DEFAULT);
  const built = B.build(X, P, { bbr: bb, aoa: aoa, settings: P.BB_DEFAULT });
  const wb = X.read(Buffer.from(built.bytes), { type: 'buffer' });
  const t8 = X.utils.sheet_to_json(wb.Sheets['8 Sells elsewhere not B&Q'], { header: 1, raw: true, defval: null });
  const skus = t8.slice(2).map(function (r) { return r[0]; }).filter(Boolean);
  assert.deepStrictEqual(skus, ['ELSE']);
  assert.strictEqual(t8.find(function (r) { return r[0] === 'ELSE'; })[17], 12);
  const formulas = JSON.stringify(wb.Sheets['6 Combined upload']);
  assert.ok(formulas.indexOf('8 Sells elsewhere') < 0);
});

t('china zero-sales listing tab does not feed Combined or the finals', () => {
  const mine = [
    { sku: 'C0A', title: 'China none A', ean: '501', cost: 2, price: 12, bb: 11, seller: 'Rival', sup: 'Ashian Homeware', w: 500, sales: 0, stock: 2, url: 'https://www.diy.com/departments/a_BQ.prd' },
    { sku: 'C0B', title: 'China none B', ean: '502', cost: 2, price: 12, bb: 11, seller: 'Rival', sup: 'Ashian Homeware', w: 500, sales: 0, stock: 9, url: 'https://www.diy.com/departments/b_BQ.prd' },
    { sku: 'C1', title: 'China sold', ean: '503', cost: 2, price: 12, bb: 11, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 500, sales: 3, stock: 20, url: 'https://www.diy.com/departments/c_BQ.prd' },
    { sku: 'U0', title: 'UK none', ean: '504', cost: 2, price: 12, bb: 11, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 0, stock: 50, url: 'https://www.diy.com/departments/u_BQ.prd' }
  ];
  const d = P.decideAll(mine, {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
  const built = B.build(X, P, { bbr: bb, settings: P.BB_DEFAULT });
  const name = '9 China 0 sales – listing check';
  assert.ok(name.length <= 31, name.length);
  assert.strictEqual(built.counts.t9, 2);
  const wb = X.read(Buffer.from(built.bytes), { type: 'buffer', cellFormula: true });
  assert.ok(wb.Sheets[name]);
  const g = sheetRows(wb, name);
  assert.deepStrictEqual(g[1].slice(0, 14), ['SKU', 'Product', 'EAN', 'Listing URL', 'Price now', 'Buy box price', 'Buy box seller', 'Winning?', 'Free stock', 'Floor price', 'Profit now %', 'Reason', 'Listing notes', 'Done']);
  const body = g.slice(2).filter(r => r && r[0]);
  assert.deepStrictEqual(body.map(r => r[0]), ['C0B', 'C0A']);
  assert.strictEqual(body[0][8], 9);
  assert.strictEqual(body[0][7], 'No');
  const link = wb.Sheets[name].D3;
  assert.ok(link && link.l && link.l.Target.indexOf('diy.com') > 0, JSON.stringify(link && link.l));
  const start = JSON.stringify(sheetRows(wb, 'Start here'));
  assert.ok(start.indexOf('Tab 9 lists every China product') > 0);
  assert.ok(JSON.stringify(wb.Sheets['6 Combined upload']).indexOf(name) < 0);
  assert.ok(JSON.stringify(wb.Sheets._Calc).indexOf(name) < 0);
  const ws = wb.Sheets[name];
  ws.M3 = { t: 's', v: 'checked the photos' };
  ws.N3 = { t: 's', v: 'Yes' };
  const by = {}; built.records.forEach(r => { by[r.sku] = { postAuto: r.basePost, priceNow: r.basePrice, incDefault: r.engInc }; });
  const prev = B.parseChecks(X, wb, { by: by, yourPrice: true });
  assert.strictEqual(prev.counts.conflict, 0);
  assert.ok(!prev.changes.some(c => (c.sku === 'C0A' || c.sku === 'C0B') && (c.post === 'set' || c.inc === 'set' || c.priceNow === 'set' || c.your === 'set')));
  const wb2 = recalc(built.bytes);
  ['C0A', 'C0B'].forEach(function (sku) {
    const rec = built.records.find(r => r.sku === sku);
    const row = find(wb2, '6 Combined upload', sku);
    assert.strictEqual(row[22], rec.engCheck);
    assert.strictEqual(String(row[19] || ''), String(rec.engReason || ''));
  });
  assert.ok(!finals(wb2, '7a Final upload UK').some(r => r[0] === 'C0A' || r[0] === 'C0B'));
});

t('a pasted Postage used column does not stop import of the yellow review cells', () => {
  function aoa(name, rows) {
    const ws = X.utils.aoa_to_sheet(rows);
    X.utils.book_append_sheet(wb, ws, name);
  }
  var wb = X.utils.book_new();
  aoa('1 All', [
    ['All products'],
    ['sku', 'Postage used', 'Price now', 'Postage used', 'Postage review', 'Selling price review', 'Your price', 'Include override'],
    ['ONE', 1.75, 9, 1.75, null, 9.5, null, null]
  ]);
  aoa('6 Combined upload', [
    ['Combined'],
    ['B&Q SKU', 'Postage review', 'Selling price review', 'Your price', 'Include override'],
    ['ONE', null, 9, null, null]
  ]);
  const prev = B.parseChecks(X, wb, { by: { ONE: { postAuto: 1.75, priceNow: 9, incDefault: 'Yes' } }, yourPrice: true });
  assert.strictEqual(prev.ok, true);
  assert.ok(prev.conflicts.some(c => c.indexOf('ONE') === 0 && c.indexOf('priceNow') > 0), JSON.stringify(prev.conflicts));
  assert.ok(!prev.invalid.some(x => /Postage used|postLegacy/.test(x.why || '')));
});

console.log('live workbook tests passed:', n);
