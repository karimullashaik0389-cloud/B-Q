/* bq_price.js – THE ONE shared B&Q price / profit engine (Diva Packages).
   Used by: Sales + Orders (app.js), the Pricing tab (pricing_v1.js) and the Python Excel builder (via node).
   Maths (Diva Master File + Karimulla's rules):
     total cost = cost + company cost (cost x1 Ashian Homeware, x0.5 others) + 15% of price + postage + collab fee (blank = 0)
     profit = price - total cost      profit % = profit / estimated cost
     postage = Access 'Postage Cost' if > 0, else weight band: <=2000g 1.75, <=15200g 2.30, <=20000g 8, <=25000g 9, <=30000g 10.50, else 15
   No data and no keys in this file. */
(function (root, f) { var m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BQP = m; })(this, function () {
  'use strict';
  var FEE = 0.15, ASHIAN = 2, OTHER = 1.5, UK_MAX = 0.8, CHINA_FLOOR = 1, SAFE_MIN = 0.5, RAISE_AT = 100, RAISE_STEP = 0.1;
  var BANDS = [[2000, 1.75, '≤2 kg'], [15200, 2.3, '≤15.2 kg'], [20000, 8, '≤20 kg'], [25000, 9, '≤25 kg'], [30000, 10.5, '≤30 kg']], OVER = [15, 'over 30 kg'];
  /* number from 8.7, '8.70', '£8.70', '1,234.50', ' 8.7 '; blank / text -> null */
  function num(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return null;
    var t = String(v).replace(/[£,\s\u00a0]/g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    return parseFloat(t);
  }
  function r6(x) { return Number(x.toFixed(6)); }
  /* Excel ROUND(ROUND(x,6),d): half away from zero */
  function rnd(x, d) { var m = Math.pow(10, d), s = x < 0 ? -1 : 1, y = Number((Math.abs(r6(x)) * m).toFixed(6)); return s * Math.floor(y + 0.5) / m; }
  /* Excel ROUNDUP(ROUND(x,6),2) for x >= 0 */
  function ceil2(x) { return Math.ceil(Number((r6(x) * 100).toFixed(6))) / 100; }
  function floor2(x) { return Math.floor(Number((r6(x) * 100).toFixed(6))) / 100; }
  function band(w) { w = num(w); if (!(w > 0)) return null; for (var i = 0; i < BANDS.length; i++) if (w <= BANDS[i][0]) return { p: BANDS[i][1], lab: BANDS[i][2] }; return { p: OVER[0], lab: OVER[1] }; }
  /* postage: Access 'Postage Cost' if > 0, else weight band, else null (needs review) */
  function postage(pc, w) { var p = num(pc); if (p != null && p > 0) return p; var b = band(w); return b ? b.p : null; }
  function postageSrc(pc, w) { var p = num(pc); if (p != null && p > 0) return 'Access postage'; var b = band(w); return b ? 'Weight band ' + b.lab : 'No postage or weight'; }
  function isChina(sup) { return /ashian/i.test(sup || ''); }
  function multOf(sup) { return isChina(sup) ? ASHIAN : OTHER; }
  /* costs that do not depend on price: cost x mult + postage + collab */
  function fixedCost(a, q) { q = q == null ? 1 : q; return (a.cost * a.mult + a.post + (num(a.collab) || 0)) * q; }
  /* profit for amt = selling amount of q units. a = {cost, mult, post, collab}
     returns fee, company cost, total cost, exact profit (pr), profit rounded to the penny (profit), profit % on cost (pc) */
  function calc(a, amt, q) {
    q = q == null ? 1 : q; var col = (num(a.collab) || 0) * q, cost = a.cost * q, company = cost * (a.mult - 1), fee = FEE * amt, post = a.post * q;
    var total = cost + company + fee + post + col, pr = r6(amt - total);
    return { cost: cost, company: company, fee: fee, post: post, collab: col, total: total, pr: pr, profit: rnd(pr, 2), pc: cost > 0 ? pr / cost : null };
  }
  /* lowest price giving profit >= f x cost, rounded UP to the penny */
  /* floors / minimum prices round UP to the penny (never under the %); caps round DOWN (never over the %) */
  function priceFor(a, f) { return ceil2((a.cost * a.mult + a.post + (num(a.collab) || 0) + f * a.cost) / (1 - FEE)); }
  function priceMax(a, f) { return floor2((a.cost * a.mult + a.post + (num(a.collab) || 0) + f * a.cost) / (1 - FEE)); }
  /* floor price: China = round up; UK = round up but never above the 80% cap (only bites when floor and cap are both 80%) */
  function floorPrice(a, f, china) { var p = priceFor(a, f); return china ? p : Math.min(p, priceMax(a, UK_MAX)); }
  /* floor % on cost: China 100%; UK sold in last 30 days 50%; UK no sales by cost <1 80%, <5 70%, <10 60%, else 50% */
  function floorOf(china, sales30, cost) {
    if (china) return { f: CHINA_FLOOR, why: 'China product · 100% on cost' };
    if (sales30 > 0) return { f: 0.5, why: 'sold in the last 30 days' };
    return cost < 1 ? { f: 0.8, why: 'no sales lately · cost under £1' } : cost < 5 ? { f: 0.7, why: 'no sales lately · cost £1–£4.99' } : cost < 10 ? { f: 0.6, why: 'no sales lately · cost £5–£9.99' } : { f: 0.5, why: 'no sales lately · cost £10+' };
  }
  /* multi-pack: title starts with a number > 1 then 'x' (same as =IFERROR(--LEFT(C,SEARCH("x",C)-1)>1,FALSE)) */
  function packN(title) {
    var t = title == null ? '' : String(title), i = t.toLowerCase().indexOf('x'); if (i < 0) return null;
    var p = t.slice(0, i).trim(); if (!/^[+-]?((\d{1,3}(,\d{3})+|\d+)(\.\d*)?|\.\d+)$/.test(p)) return null;
    var v = parseFloat(p.replace(/,/g, '')); return v > 1 ? v : null;
  }
  function checkPost(title, w) {
    var n = packN(title), out = [], wt = num(w) || 0;
    if (n) out.push('Multi-pack x' + n); if (wt > 30000) out.push('Over 30kg (' + wt + 'g)'); return out.join(' | ');
  }
  /* ONE row -> price decision. r = {sku,title,ean,cost,price,bb,seller,sup,pc,w,sales,collab,url,your}
     opt = {raise100: include 100+ sales raises in the upload, checkPost: include 'Check postage' rows in the upload} */
  function decide(r, opt) {
    opt = opt || {};
    var cost = num(r.cost), price = num(r.price), bb = num(r.bb), sales = num(r.sales) || 0, your = num(r.your);
    var china = isChina(r.sup), mult = china ? ASHIAN : OTHER, post = postage(r.pc, r.w), seller = (r.seller == null ? '' : String(r.seller)).trim();
    if (!(bb > 0)) bb = null;
    var o = { sku: r.sku, title: r.title || '', ean: r.ean || '', cost: cost, price: price == null ? 0 : price, priceBlank: price == null, bb: bb, seller: bb == null && !seller ? 'No competitor' : seller, sales: sales,
      china: china, mult: mult, post: post, postSrc: postageSrc(r.pc, r.w), collab: num(r.collab) || 0, url: r.url || '', check: checkPost(r.title, r.w), your: your,
      srcPrice: r.srcPrice || '', srcBB: r.srcBB || '', srcSales: r.srcSales || 'Access B n Q 30Days', salesAccess: r.salesAccess == null ? null : num(r.salesAccess), sup: r.sup || '', w: num(r.w), variant: r.variant || '',
      win: /diva package/i.test(seller), status: '', rule: '', newp: null, finalp: null, upload: false, why: '' };
    var cur = o.price;
    if (!(cost > 0) || post == null) {
      o.rule = 'NEED YOUR REVIEW – ' + (!(cost > 0) ? 'no cost' : 'no postage or weight'); o.status = 'NEED YOUR REVIEW'; o.finalp = cur; o.why = 'Missing data'; return o;
    }
    var a = { cost: cost, mult: mult, post: post, collab: o.collab };
    o.a = a; o.fixed = fixedCost(a);
    var C = calc(a, cur); o.fee = C.fee; o.company = C.company; o.total = C.total; o.profit = C.profit; o.pr = C.pr; o.pc = C.pc;
    var Fl = floorOf(china, sales, cost); o.floorPct = Fl.f; o.floorWhy = Fl.why; o.floor = floorPrice(a, Fl.f, china); o.ceil = china ? null : priceMax(a, UK_MAX);
    var bb1 = bb != null ? rnd(bb - 0.01, 2) : null, raw, step = false;
    if (o.win) {
      raw = 'Already winning'; o.rule = '1 Already winning – kept';
      if (!china && sales >= RAISE_AT && C.pc < UK_MAX - 1e-9) {
        var sp = Math.min(priceFor(a, Math.min(UK_MAX, C.pc + RAISE_STEP)), priceMax(a, UK_MAX));
        if (sp > cur) { raw = sp; step = true; o.rule = '1 Winning, 100+ sales – raise 10% (max 80%)'; }
      }
    } else if (china) {
      if (bb == null) { raw = o.floor; o.rule = '4 China – no competitor, 100%'; }
      else if (bb1 < o.floor) { raw = 'Margin too low'; o.rule = '4 China – margin too low, kept'; }
      else if (sales < 1) { raw = o.floor; o.rule = '4 China – 0 sales, 100%'; }
      else { raw = bb1; o.rule = '4 China – 1p under BB'; }
    } else if (sales >= 1) {
      if (bb == null) { raw = 'No competitor – kept'; o.rule = '2 UK sold – no competitor, kept'; }
      else if (bb1 < o.floor) { raw = 'Margin too low'; o.rule = '2 UK sold – margin too low, kept'; }
      else { raw = Math.min(o.ceil, bb1); o.rule = bb1 > o.ceil ? '2 UK sold – capped at 80%' : '2 UK sold – 1p under BB'; }
    } else {
      if (bb == null) { raw = o.ceil; o.rule = '3 UK 0 sales – no competitor, 80%'; }
      else if (bb1 < o.floor) { raw = 'Margin too low'; o.rule = '3 UK 0 sales – margin too low, kept'; }
      else { raw = Math.min(o.ceil, bb1); o.rule = bb1 > o.ceil ? '3 UK 0 sales – capped at 80%' : '3 UK 0 sales – 1p under BB'; }
    }
    o.raw = raw; o.step = step;
    /* £0 or blank current price: never auto-change a broken listing – show the suggestion, you decide */
    if (!(cur > 0) && your == null) {
      o.rule += ' – no current price, check listing' + (typeof raw === 'number' ? ' (suggested £' + rnd(raw, 2).toFixed(2) + ')' : '');
      o.status = 'NEED YOUR REVIEW'; o.newp = null; o.finalp = cur; var Z = calc(a, cur); o.fprofit = Z.profit; o.fpr = Z.pr; o.fpc = Z.pc; o.changed = false; o.why = 'No current price'; return o;
    }
    /* status (build13 'Buy box winning price' column) */
    if (typeof raw === 'number') {
      var Rc = calc(a, raw);
      o.rawProfit = Rc.profit; o.rawPc = Rc.pc;
      if (Rc.profit <= 0) o.status = 'Loss – blocked';
      else if (rnd(raw, 2) > rnd(cur, 2) && !(step && opt.raise100)) o.status = step ? 'Raise 10% – held for review' : 'Raise – held for review';
      else o.status = raw;
    } else o.status = raw;
    o.newp = typeof o.status === 'number' ? o.status : null;
    o.finalp = your != null ? your : (o.newp != null ? o.newp : cur);
    var F = calc(a, o.finalp); o.fprofit = F.profit; o.fpr = F.pr; o.fpc = F.pc;
    o.changed = rnd(o.finalp, 2) !== rnd(cur, 2);
    /* ABSOLUTE SAFETY: a changed price must be > 0, profit > £0 and >= 50% on cost; China rule prices >= 100% */
    if (o.changed) {
      if (!(o.finalp > 0) || F.profit <= 0) { o.why = 'Loss – blocked'; if (your != null) o.status = 'Loss – blocked'; }
      else if (F.pc < SAFE_MIN - 1e-9) { o.why = 'Under 50% – blocked'; if (your != null) o.status = 'Under 50% – blocked'; }
      else if (o.check && !opt.checkPost) o.why = 'Check postage first';
      else if (r.dup) o.why = 'Duplicate SKU';
      else { o.upload = true; o.why = your != null ? 'Your price' : 'Price change'; }
    } else o.why = typeof o.status === 'string' ? o.status : 'No change';
    if (your != null && o.why !== 'Loss – blocked' && o.why !== 'Under 50% – blocked') o.status = 'Your price';
    return o;
  }
  /* many rows: first row of each SKU wins, later duplicates marked; rows with no SKU skipped */
  function decideAll(rows, opt) {
    var seen = {}, out = [], dups = 0, nosku = 0;
    rows.forEach(function (r) {
      var k = r.sku == null ? '' : String(r.sku).trim(); if (!k) { nosku++; return; }
      var d = !!seen[k]; seen[k] = 1; if (d) dups++;
      var x = decide(Object.assign({}, r, { sku: k, dup: d }), opt); x.dup = d; out.push(x);
    });
    return { rows: out, dups: dups, nosku: nosku };
  }

  /* Access B&QBB3 sheet (array of rows, row 0 = headers) -> engine rows. Columns found by header name.
     ov = {bb: {ean: {seller, price, fetched}} (buy box run, newer than Access), bbLabel,
           imported: {sku: price} (prices he imported after this Access file), importedLabel,
           sales30: {sku: units} (newest B&Q orders, same as the Sales tab; replaces 'B n Q 30Days'), salesLabel} */
  var HDR = { sku: 'sku', title: 'Variant description', cost: 'Estimated cost', price: 'B&Q_INV.price', bb: 'B&Q_BB.price', seller: 'seller', sup: 'Main supplier name',
    w: 'Weight', pc: 'Postage Cost', sales: 'B n Q 30Days', ean: 'product-id', url: 'product_url', collab: 'Collab fee', variant: 'Variant code', stock: 'Free stock quantity', sales_all: 'Total 30Days Sales' };
  function eanOf(v) { if (v == null || v === '') return ''; if (typeof v === 'number') return String(Math.round(v)); var t = String(v).trim(); return /^\d+(\.0+)?$/.test(t) ? t.replace(/\.0+$/, '') : t; }
  function fromAccess(aoa, ov) {
    ov = ov || {}; var h = (aoa[0] || []).map(function (x) { return x == null ? '' : String(x).trim(); }), ix = {}, miss = [];
    Object.keys(HDR).forEach(function (k) { var i = h.indexOf(HDR[k]); ix[k] = i; if (i < 0 && ['sku', 'cost', 'price', 'bb', 'seller', 'sup'].indexOf(k) >= 0) miss.push(HDR[k]); });
    if (miss.length) throw new Error('This is not the Access B&QBB3 file – missing column(s): ' + miss.join(', '));
    var bbm = ov.bb || {}, imp = ov.imported || {}, nbb = 0, nimp = 0, nlive = 0, nsold = 0, rows = [];
    for (var j = 1; j < aoa.length; j++) {
      var x = aoa[j] || [], g = function (k) { return ix[k] >= 0 ? x[ix[k]] : null; };
      if (x.every(function (v) { return v == null || v === ''; })) continue;
      var r = { sku: g('sku') == null ? '' : String(g('sku')).trim(), title: g('title') == null ? '' : String(g('title')), ean: eanOf(g('ean')), cost: g('cost'), price: g('price'), bb: g('bb'), seller: g('seller'),
        sup: g('sup') == null ? '' : String(g('sup')), w: g('w'), pc: g('pc'), sales: g('sales'), url: g('url') == null ? '' : String(g('url')), collab: g('collab'), variant: g('variant') == null ? '' : String(g('variant')),
        srcPrice: 'Access', srcBB: 'Access' };
      if (ov.sales30) { r.salesAccess = r.sales; r.sales = ov.sales30[r.sku] || 0; r.srcSales = ov.salesLabel || 'B&Q orders'; if (r.sales > 0) nsold++; }
      if (imp[r.sku] != null) { r.price = imp[r.sku]; r.srcPrice = ov.importedLabel || 'Imported'; nimp++; }
      var b = bbm[r.ean];
      if (b && (b.seller || num(b.price) != null)) {
        r.bb = num(b.price); r.seller = b.seller || ''; r.srcBB = ov.bbLabel || 'Buy box run'; nbb++;
        if (/diva package/i.test(b.seller || '') && num(b.price) > 0) { r.price = num(b.price); r.srcPrice = (ov.bbLabel || 'Buy box run') + ' (our live price)'; nlive++; }
      }
      rows.push(r);
    }
    return { rows: rows, counts: { rows: rows.length, bbOverlay: nbb, importedOverlay: nimp, livePrice: nlive, salesFromOrders: !!ov.sales30, soldSkus: nsold } };
  }

  /* units sold in the last 30 days per SKU from the Sales/Orders data (RAW = build.py raw json) – EXACTLY the Sales tab's U30:
     not cancelled, order day >= (day of the newest order) - 29 days. Returns {map: {sku: units}, last: 'yyyy-mm-dd'} */
  function sales30(RAW) {
    var DAY = 864e5, LAST = 0, map = {}, i, x, t;
    for (i = 0; i < RAW.L.length; i++) { t = RAW.L[i][0] * 6e4; if (t > LAST) LAST = t; }
    var TODAY = Math.floor(LAST / DAY) * DAY;
    for (i = 0; i < RAW.L.length; i++) {
      x = RAW.L[i]; t = x[0] * 6e4;
      if (RAW.st[x[5]] !== 'Cancelled' && Math.floor(t / DAY) * DAY >= TODAY - 29 * DAY) { var k = RAW.sku[x[4]][0]; map[k] = (map[k] || 0) + x[2]; }
    }
    return { map: map, last: LAST ? new Date(TODAY).toISOString().slice(0, 10) : '' };
  }
  /* buy box run rows ({ean, seller, price, fetched}) -> overlay map, only rows fetched AFTER the Access file date (yyyy-mm-dd) */
  function ukTime(iso) { var d = new Date(iso); if (isNaN(d)) return String(iso);
    return d.toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''); }
  function bbMap(rows, accessDate) {
    var m = {}, t0 = null, t1 = null, n = 0;
    (rows || []).forEach(function (r) {
      var e = eanOf(r.ean); if (!e) return;
      if (!(r.seller || num(r.price) != null)) return;
      if (r.fetched && accessDate && String(r.fetched).slice(0, 10) <= accessDate) return;
      m[e] = { seller: r.seller || '', price: num(r.price), fetched: r.fetched || '' }; n++;
      if (r.fetched) { if (t0 == null || r.fetched < t0) t0 = r.fetched; if (t1 == null || r.fetched > t1) t1 = r.fetched; }
    });
    return { map: m, n: n, from: t0, to: t1, label: n ? 'Buy box run ' + (t0 ? ukTime(t0) + '–' + ukTime(t1) + ' UK' : '') : '' };
  }
  return { FEE: FEE, sales30: sales30, bbMap: bbMap, ukTime: ukTime, fromAccess: fromAccess, eanOf: eanOf, HDR: HDR, ASHIAN: ASHIAN, OTHER: OTHER, UK_MAX: UK_MAX, SAFE_MIN: SAFE_MIN, RAISE_AT: RAISE_AT, BANDS: BANDS, OVER: OVER,
    num: num, rnd: rnd, ceil2: ceil2, band: band, postage: postage, postageSrc: postageSrc, isChina: isChina, multOf: multOf, fixedCost: fixedCost,
    calc: calc, priceFor: priceFor, priceMax: priceMax, floorPrice: floorPrice, floor2: floor2, floorOf: floorOf, packN: packN, checkPost: checkPost, decide: decide, decideAll: decideAll, VERSION: 'bq_price v2 2026-11-02' };
});
