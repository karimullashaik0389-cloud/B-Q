/* B&Q dashboard – "7-tab pricing workbook" (4 Nov 2026). One shared file for the browser (window.BQBook) and the Node tests.
   Input = the Pricing tab's buy box results (BQP.buyBoxAll rows), the Access B&QBB3 sheet (array of rows) and the B&Q template header rows.
   All maths comes from bq_price.js (window.BQP / require). No data, keys or passwords in this file. Nothing is sent anywhere. */
(function (root, f) { var m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BQBook = m; })(this, function () {
  'use strict';
  var VERSION = 'bq_book 2026-11-09 live checks';
  var MIN_CHANGE = 0.10;      /* a suggested change must move the price by at least 10p (same 10p minimum as the buy box view) */
  var T3_BUF = 0.05;          /* tab 3: never below the floor + 5% of the floor price (rounded UP to the penny) */
  var T5_CUT = 0.05;          /* tab 5: 5% off the price now */
  var T5_UK_FLOOR = 0.60;     /* tab 5 UK only (9 Nov): special 60% floor on cost */
  var T5_UK_MIN = 0.65;       /* tab 5 UK: never below floor+5pp = 65% on cost */
  var WEEKLY_DAYS = 7;        /* tab 5 UK: no second cut within 7 days of last price change */
  var NAMES = ['1 All', '2 Winning in range', '3 Winning 0 sales', '4 Can win buy box', '5 Margin too low', '6 Combined upload', '7a Final upload UK', '7b Final upload China', '8 Sells elsewhere not B&Q'];
  var REVIEW_CHINA = 'China raises (review only)';
  var START = 'Start here';
  var KEY = [['neg', 'Loss'], ['under', 'Under floor'], ['amber', 'Near floor'], ['green', 'Fine'], ['blue', 'Over cap']];
  var T8_MIN_OTHER = 5;       /* tab 8: other-platform 30-day sales at least this many */
  var T8_MAX_SHARE = 0.10;    /* tab 8: ...and B&Q sold 0, or B&Q share of all 30-day sales under this */
  var ALL_COL = 'Total 30Days Sales';   /* Access column with 30-day sales on all platforms (OrderWise) */
  var AMBER_PP = 0.05;        /* colours: amber when profit % is within 5 points above the floor % */
  var COL = { cost: 'FFE0E0E0', price: 'FFD6EAF8', profit: 'FFD5F5E3', pct: 'FFE8DAEF' };   /* header bands */
  var STK = ['neg', 'under', 'blue', 'amber', 'green'], ST = { neg: { fill: 'FFD32F2F', font: 'FFFFFFFF' }, under: { fill: 'FFF8BBD0' }, blue: { fill: 'FFBBDEFB' }, amber: { fill: 'FFFFE082' }, green: { fill: 'FFC8E6C9' } };
  var LEGEND = 'Colours on profit cells: SOLID RED = loss (below £0) · PINK = under the floor · AMBER = within 5 points above the floor % · GREEN = floor + 5 up to the cap · BLUE = over the 80% cap. Header bands: grey = estimated cost, blue = selling price, green = profit £, purple = profit %.';
  var RULE3 = 'We win but sold 0 on B&Q in 30 days. Suggested = price now minus a quarter of the gap to the floor (selling − (selling − floor)/4), rounded to the penny, but never below the floor + 5% (rounded up), never over the 80% cap, and only if the price drops by at least 10p. Projected profit and % are at that price.';
  var RULE5 = 'OPTIONAL – Margin too low. UK (9 Nov 2026): uses a 60% floor on cost for this cut only (other tabs keep the normal cost-band floors); suggested = 5% off price now, rounded to the penny, never below the 65% price (floor + 5 points), never over the 80% cap, only if the drop is at least 10p, and not if the price changed in the last 7 days (weekly). China: 5% off, never below the normal 100% floor. Does not win the buy box – it only makes the price more attractive.';
  var M = '£#,##0.00', PC = '0.0%', IN = '#,##0', EAN = '0', HDRF = '@', YESF = '0;-0;0;@', YOURF = '"£"#,##0.00';

  function cls(P, r, S) {
    var o = r.o, x = { r: r, o: o, cat: 'keep', tab: 1, sugg: null, why: r.why || '', inc: 'Yes', label: '' };
    var stockOut = S.noStockKeep !== false && o.stock != null && o.stock <= 0, tree = S.keepTrees !== false && P.isXmasTree(o.title, o.sku);
    var chk = !!o.check && !S.checkPost && !o.postChecked;
    if (o.dup) { x.label = 'Duplicate SKU row – not priced'; return x; }
    if (r.act === 'No data') { x.label = 'No data'; return x; }
    if (r.act === 'Price check') { x.label = 'Price check – not in the upload'; x.why = r.why; return x; }
    var cur = P.rnd(o.price, 2), fl = o.floor, cap = o.china ? null : o.ceil;
    if (r.act === 'Raise') {
      x.cat = 'raise'; x.sugg = r.sugg; x.label = o.china ? 'Raise – China (review only, never uploaded)' : 'Raise (already winning)';
      if (o.china) x.inc = 'No';   /* China raises never go to Final upload – review tab only */
      if (chk) x.inc = 'No'; return x;
    }
    if (r.act === 'Lower to win') { x.cat = 't4'; x.tab = 4; x.sugg = r.sugg; x.label = 'Can win the buy box'; if (chk) x.inc = 'No'; return x; }
    if (r.act === "Can't win (floor)") {
      x.cat = 't5'; x.tab = 5; x.label = 'Margin too low (optional cut)';
      /* UK tab 5 only (9 Nov): 60% floor for this cut, never below 65% on cost, weekly 7-day hold. China keeps prior rule. */
      var chLog = (S.priceChanges && S.priceChanges[o.sku]) || null;
      x.lastChange = chLog ? chLog.date : '';
      if (!o.china && o.a) {
        var fl60 = P.floorPrice(o.a, T5_UK_FLOOR, false), fb = P.floorPrice(o.a, T5_UK_MIN, false);
        x.t5Floor = fl60; x.t5Min = fb;
        var need = r.need != null ? P.rnd(r.need, 2) : (o.bb != null ? P.rnd(o.bb - 0.01, 2) : null);
        if (need != null && need >= fb - 1e-9) x.couldWinAt50 = true; /* flag: 1p-under would clear the tab-5 min (reported; stay on tab 5) */
        if (chLog && S.asOf && daysBetween(chLog.date, S.asOf) < WEEKLY_DAYS) {
          x.weeklyHold = true; x.inc = 'No'; x.sugg = null;
          x.why = 'Changed ' + chLog.date + ' – next change after ' + addDays(chLog.date, WEEKLY_DAYS) + ' (weekly rule for Margin too low UK). ' + r.why;
        } else {
          var s5 = Math.max(fb, P.rnd(cur * (1 - T5_CUT), 2)); if (cap != null && s5 > cap) s5 = cap; s5 = P.rnd(s5, 2);
          if (cur - s5 >= MIN_CHANGE - 1e-9 && s5 >= fb - 1e-9 && okAt(P, o, s5, fb)) {
            x.sugg = s5; x.why = 'OPTIONAL UK – 5% off using 60% floor (min 65% on cost)' + (s5 === P.rnd(fb, 2) ? ', at the 65% minimum' : '') + '. Does not win the buy box. ' + r.why;
          } else x.why = 'No cut suggested – already within 10p of the 65% minimum (or under it). ' + r.why;
        }
      } else {
        var s5c = Math.max(fl, P.rnd(cur * (1 - T5_CUT), 2)); if (cap != null && s5c > cap) s5c = cap; s5c = P.rnd(s5c, 2);
        if (cur - s5c >= MIN_CHANGE - 1e-9 && s5c >= fl - 1e-9 && ok(P, o, s5c)) { x.sugg = s5c; x.why = 'OPTIONAL – ' + (s5c === P.rnd(fl, 2) ? 'down to the floor' : '5% off') + ' to attract sales (does not win the buy box). ' + r.why; }
        else x.why = 'No cut suggested – the price now is already within 10p of the floor (or under it). ' + r.why;
      }
      if (chk) x.inc = 'No'; return x;
    }
    /* Keep rows */
    if (stockOut || tree) { x.label = tree ? 'Christmas tree – kept' : 'No free stock – kept'; return x; }
    if (o.win) {
      if (!(o.sales >= 1)) {
        x.cat = 't3'; x.tab = 3; x.label = 'Winning, 0 sales';
        var min105 = o.china ? P.priceFor(o.a, P.CHINA_FLOOR + 0.05) : null;
        var fb = o.china ? min105 : P.ceil2(fl * (1 + T3_BUF)), qtr = P.rnd(cur - (cur - fl) / 4, 2), s3 = Math.max(qtr, fb);
        if (cap != null && s3 > cap) s3 = cap; s3 = P.rnd(s3, 2);
        if (o.china && s3 < min105) s3 = min105;
        var gap = cur - s3;
        if (o.china && s3 > cur + 0.001) {
          x.cat = 'raise'; x.tab = 1; x.inc = 'No'; x.label = 'Raise – China (review only, never uploaded)';
          x.sugg = (s3 - cur >= MIN_CHANGE - 1e-9 && ok(P, o, s3)) ? s3 : null;
          x.why = 'China raise – review only. The 105% minimum does not put a higher price on the upload.';
          return x;
        }
        if (gap >= MIN_CHANGE - 1e-9 && s3 >= fb - 1e-9 && ok(P, o, s3)) { x.sugg = s3; x.why = o.china ? 'China, no sales – cut toward the floor, not below 105% on cost.' : 'We win but sold 0 in 30 days – lower a quarter of the way toward the floor (stops at floor + 5%).'; }
        else { x.why = o.china ? 'China, no sales – already at or within 10p of the 105% minimum.' : 'We win but sold 0 in 30 days – no cut suggested: the price is already close to the floor (within 10p of floor + 5%, or already at/under floor + 5%).'; }
        if (chk) x.inc = 'No'; return x;
      }
      if (o.pc != null && o.pc >= o.floorPct - 1e-9 && (cap == null || cur <= cap + 1e-9)) { x.cat = 't2'; x.tab = 2; x.label = 'Winning, in range'; return x; }
      x.label = cap != null && cur > cap ? 'Winning above the 80% cap – kept' : 'Winning – kept'; return x;
    }
    x.label = /already cheaper/.test(r.why) ? 'Losing – we are already cheaper' : 'Keep'; return x;
  }
  /* engine check of a price: > 0, profit > £0, at/above the floor, UK at/below the cap, >= 50% (China 100%) */
  function ok(P, o, p) {
    var c = P.calc(o.a, p); return p > 0 && c.profit > 0 && p >= o.floor - 1e-9 && (o.china || o.ceil == null || p <= o.ceil + 1e-9) && c.pc >= P.SAFE_MIN - 1e-9 && (!o.china || c.pc >= P.CHINA_FLOOR - 1e-9);
  }
  /* like ok(), but the minimum price is minFl (tab 5 UK 65% price) instead of o.floor */
  function okAt(P, o, p, minFl) {
    var c = P.calc(o.a, p); return p > 0 && c.profit > 0 && p >= minFl - 1e-9 && (o.china || o.ceil == null || p <= o.ceil + 1e-9) && c.pc >= P.SAFE_MIN - 1e-9 && (!o.china || c.pc >= P.CHINA_FLOOR - 1e-9);
  }
  function parseYMD(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function daysBetween(a, b) { var A = parseYMD(a), B = parseYMD(b); if (!A || !B) return 9999; return Math.round((B - A) / 864e5); }
  function addDays(d, n) { var A = parseYMD(d); if (!A) return d; A.setUTCDate(A.getUTCDate() + n); return A.toISOString().slice(0, 10); }
  function shortOf(P, x, S) {
    var o = x.o, k = x.cat, s;
    if (o.dup) s = 'Duplicate SKU row – not priced';
    else if (x.label === 'No data') s = 'No buy box data';
    else if (k === 'raise') s = o.china ? 'China raise – review only (never in Final upload)' : (o.pc != null && o.floorPct != null && o.pc < o.floorPct - 1e-9 ? 'Raise to floor (profit under floor %)' : 'Raise: winning with room to the cap');
    else if (k === 't4') s = 'Win buy box: 1p under ' + (o.seller || 'rival');
    else if (k === 't5') {
      if (x.weeklyHold) s = 'Margin too low UK – weekly hold until ' + addDays(x.lastChange, WEEKLY_DAYS);
      else if (x.sugg != null) s = !o.china ? ('Optional UK: 5% off (60% floor, min 65%)') : ('Optional: ' + (x.sugg === P.rnd(o.floor, 2) ? 'down to the floor' : '5% off') + ' to attract sales');
      else s = "Can't win above floor – no change";
    }
    else if (k === 't3') {
      if (x.sugg == null) s = o.china ? 'China, no sales – already at the 105% minimum' : '0 B&Q sales: already near the floor';
      else if (o.china && o.price != null && x.sugg > o.price + 0.001) s = 'China, no sales – lift to 105% profit on cost';
      else if (o.china) s = 'China, no sales – cut toward the floor, not below 105% on cost';
      else s = '0 B&Q sales: quarter-gap cut toward the floor';
    }
    else if (k === 't2') s = 'Winning, in range – no change';
    else s = x.label || 'Keep';
    if (o.check && !S.checkPost && !o.postChecked && x.sugg != null) s += ' · check postage (' + o.check + ')';
    return s;
  }
  /* Saved Include is applied after the rule default. Yes cannot bypass a guard. */
  function applySavedInc(x, S) {
    x.incDefault = x.inc;
    var c = S && S.checks && S.checks[x.o.sku];
    if (!c || (c.inc !== 'Yes' && c.inc !== 'No')) return x;
    x.incSaved = c.inc;
    if (c.inc === 'No') { x.inc = 'No'; x.incFrom = 'saved'; return x; }
    var block = '';
    if (x.o.dup) block = 'duplicate';
    else if (x.o.china && (x.cat === 'raise' || (x.sugg != null && x.o.price != null && x.sugg > x.o.price + 0.001))) block = 'China raise';
    else if (x.weeklyHold) block = 'weekly hold';
    else if (x.o.check && !S.checkPost && !x.o.postChecked) block = 'check postage';
    else if (x.sugg == null && x.o.your == null) block = 'no price';
    if (block) { x.inc = 'No'; x.incBlocked = block; x.incFrom = 'saved'; }
    else { x.inc = 'Yes'; x.incFrom = 'saved'; }
    return x;
  }
  function classify(P, R, S) { S = S || {}; return R.map(function (r) { var x = cls(P, r, S); if (!x.lastChange && S.priceChanges && S.priceChanges[x.o.sku]) x.lastChange = S.priceChanges[x.o.sku].date; x = applySavedInc(x, S); x.short = shortOf(P, x, S); return x; }); }
  /* What the value workbook would have put in Check / Final for this row, before any typed review. */
  function snapshotStatus(P, x, S) {
    var o = x.o, J = x.sugg;
    if (x.weeklyHold) return { J: null, chk: 'WEEKLY HOLD', prof: null };
    if (x.cat === 'raise' && o.china) return { J: J, chk: 'CHINA RAISE', prof: null };
    if (!o.a || J == null || !(J > 0)) return { J: null, chk: 'NO CHANGE', prof: null };
    var A = o.a, fixed = A.cost * A.mult + A.post + (P.num(A.collab) || 0);
    var prof = P.rnd(P.rnd(J * (1 - P.FEE) - fixed, 6), 2);
    var floorRef = x.t5Min != null ? x.t5Min : o.floor;
    var chk = (o.check && !S.checkPost && !o.postChecked) ? 'CHECK POSTAGE' : J < floorRef - 1e-5 ? 'UNDER FLOOR' : prof <= 0 ? 'LOSS' : (!o.china && o.ceil != null && J > o.ceil + 1e-5) ? 'OVER CAP' : P.rnd(J, 2) === P.rnd(o.price, 2) ? 'NO CHANGE' : 'OK';
    return { J: J, chk: chk, prof: prof, floorRef: floorRef };
  }

  /* Access text numbers -> real numbers ("£3.32" -> 3.32, "260" -> 260); leading-zero / long codes stay text */
  var TXT = { 'Variant code': 1, 'Variant description': 1, 'sku': 1, 'Main supplier name': 1, 'seller': 1, 'product_url': 1 };
  function cellOf(h, v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return { t: 'n', v: v, z: h === 'product-id' ? EAN : /price|cost/i.test(h) ? M : undefined };
    var s = String(v).trim();
    if (!TXT[h]) {
      var m = /^£\s*(-?[\d,]*\.?\d+)$/.exec(s); if (m) return { t: 'n', v: +m[1].replace(/,/g, ''), z: M };
      if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return { t: 'n', v: +s, z: h === 'product-id' ? EAN : /price|cost/i.test(h) ? M : undefined };
    }
    return { t: 's', v: s };
  }
  function c(v, z) { if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return null; return typeof v === 'number' ? { t: 'n', v: v, z: z } : { t: 's', v: String(v) }; }
  function uk(o) { return o.china ? 'China' : 'UK'; }
  /* colour of a profit cell at price p: neg = below £0, under = under the floor, blue = over the 80% cap, amber = within 5 points above the floor %, green = the rest */
  function status(o, p, profit, pc) {
    if (profit == null || !isFinite(profit)) return null;
    if (profit < 0) return 'neg';
    if (p != null && o.floor != null && p < o.floor - 1e-9) return 'under';
    if (p != null && !o.china && o.ceil != null && p > o.ceil + 1e-9) return 'blue';
    if (pc != null && o.floorPct != null && pc < o.floorPct + AMBER_PP - 1e-9) return 'amber';
    return 'green';
  }
  /* header band colour by column name */
  function htype(h) {
    h = String(h || '');
    if (/^(estimated cost|item cost)$/i.test(h)) return 'cost';
    if (/profit/i.test(h)) return /%/.test(h) ? 'pct' : 'profit';
    if (/floor|cap|buy box|bb\.price|change|needed|short|room|from/i.test(h)) return null;
    if (/price/i.test(h)) return 'price';
    return null;
  }
  /* 30-day sales: all platforms (Access "Total 30Days Sales") vs the B&Q figure the engine used */
  function salesOf(aoa, iAll, o) {
    var raw = aoa[o.ix] || [], all = iAll >= 0 ? (num(raw[iAll]) || 0) : null, bq = o.sales == null ? 0 : +o.sales || 0;
    return { all: all, bq: bq, other: all == null ? null : Math.max(0, all - bq), share: all > 0 ? Math.min(1, bq / all) : null };
  }
  function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var t = String(v).replace(/[£,\s\u00a0]/g, ''); return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? +t : null; }
  /* tab 8: sells on other platforms, not on B&Q (REPORT ONLY) */
  function sells(P, X, aoa) {
    var hd = (aoa[0] || []).map(function (h) { return h == null ? '' : String(h); }), iAll = hd.indexOf(ALL_COL), out = [];
    if (iAll < 0) return out;
    X.forEach(function (x) {
      var o = x.o; if (o.dup || !o.sku) return;
      var s = salesOf(aoa, iAll, o);
      if (!(s.other >= T8_MIN_OTHER) || !(s.bq === 0 || (s.share != null && s.share < T8_MAX_SHARE))) return;
      var cur = o.priceBlank ? null : P.rnd(o.price, 2), hasBB = x.r.act !== 'No data' && o.bb != null && !!o.seller, k, why;
      if (o.stock != null && o.stock <= 0) { k = 'No stock'; why = 'No free stock'; }
      else if (hasBB && !o.win) { k = 'Losing buy box'; why = cur != null && o.bb < cur - 1e-9 ? 'Losing buy box – ' + o.seller + ' is cheaper (£' + o.bb.toFixed(2) + ')' : 'Losing buy box to ' + o.seller + ' (not on price)'; }
      else if (hasBB && o.win && o.floor != null && cur != null && cur - P.ceil2(o.floor * (1 + T3_BUF)) >= MIN_CHANGE - 1e-9) { k = 'Price above floor'; why = 'Winning but £' + (cur - o.floor).toFixed(2) + ' above the floor – room to lower'; }
      else if (!hasBB || !o.url) { k = 'No buy box data'; why = 'No buy box data / link missing – check the listing'; }
      else { k = 'Check listing'; why = 'Check listing (title / images / category)'; }
      out.push({ x: x, s: s, key: k, why: why });
    });
    out.sort(function (a, b) { return b.s.other - a.s.other || b.s.all - a.s.all || (a.x.o.sku < b.x.o.sku ? -1 : 1); });
    return out;
  }
  var REASONS8 = ['No stock', 'Losing buy box', 'Price above floor', 'No buy box data', 'Check listing'];

  /* build the sheet specs: {name, top: note row, cols:[[header, fmt, width?, 'hide'?]], rows:[[cell...]], freeze:{x,y}, filter, notes:{col:text}, cf} */
  function sheets(P, input) {
    var S = Object.assign({}, input.settings || {}); if (input.priceChanges) S.priceChanges = input.priceChanges; if (input.asOf) S.asOf = input.asOf;
    var R = input.bbr, aoa = input.aoa || [], X = classify(P, R, S), hd = (aoa[0] || []).map(function (h) { return h == null ? '' : String(h); });
    var byTab = { 2: [], 3: [], 4: [], 5: [] }, comb = [];
    X.forEach(function (x) { if (byTab[x.tab]) byTab[x.tab].push(x); });
    var cs = function (v, z, s) { var q = c(v, z); if (q && s) q.st = s; return q; };
    var now = function (o) { if (!o.a || o.priceBlank) return [null, null]; var s = status(o, o.price, o.profit, o.pc); return [cs(o.profit, M, s), cs(o.pc, PC, s)]; };
    var at = function (o, p) { if (p == null || !o.a) return [null, null]; var k = P.calc(o.a, p), s = status(o, p, k.profit, k.pc); return [cs(k.profit, M, s), cs(k.pc, PC, s)]; };
    var L = {
      sku: [['B&Q SKU', null, 20], function (x) { return c(x.o.sku); }],
      prod: [['Product', null, 44], function (x) { return c(x.o.title); }],
      uk: [['UK/China', null, 9], function (x) { return c(uk(x.o)); }],
      cost: [['Estimated cost', M, 10], function (x) { return c(x.o.cost, M); }],
      post: [['Postage', M, 9], function (x) { return c(x.o.post, M); }],
      stock: [['Free stock', IN, 8], function (x) { return c(x.o.stock, IN); }],
      sales: [['B&Q 30d sales', IN, 9], function (x) { return c(x.o.sales, IN); }],
      price: [['Price now', M, 10], function (x) { return c(x.o.priceBlank ? null : x.o.price, M); }],
      pnow: [['Profit now £', M, 10], function (x) { return now(x.o)[0]; }],
      pcnow: [['Profit now %', PC, 9], function (x) { return now(x.o)[1]; }],
      bb: [['Buy box price', M, 10], function (x) { return c(x.o.bb, M); }],
      seller: [['Buy box seller', null, 18], function (x) { return c(x.o.seller); }],
      floor: [['Floor price', M, 10], function (x) { return c(x.o.floor, M); }],
      sugg: [['Suggested price', M, 10], function (x) { return c(x.sugg, M); }],
      np: [['New profit £', M, 10], function (x) { return at(x.o, x.sugg)[0]; }],
      npc: [['New profit %', PC, 9], function (x) { return at(x.o, x.sugg)[1]; }],
      why: [['Reason', null, 44], function (x) { return c(x.short); }],
      lastCh: [['Last price change', null, 14], function (x) { return c(x.lastChange || ''); }]
    };
    var lean = function (keys, xs, over) { return { cols: keys.map(function (k) { return (over && over[k]) || L[k][0]; }), rows: xs.map(function (x) { return keys.map(function (k) { return L[k][1](x); }); }) }; };
    var ALLK = ['sku', 'prod', 'uk', 'cost', 'post', 'stock', 'sales', 'price', 'pnow', 'pcnow', 'bb', 'seller', 'floor', 'sugg', 'np', 'npc', 'why'];
    /* ---- 1 All: Access columns as pasted + 6 ---- */
    var calcH = [['Postage used', M, 9], ['Price now', M, 10], ['Profit now £', M, 10], ['Profit now %', PC, 9], ['Floor price', M, 10], ['Action', null, 40], ['Last price change', null, 14]];
    var cols1 = hd.map(function (h) { return [h || ' ', null, 'raw']; }).concat(calcH);
    var seenIx = {}, rows1 = [];
    X.forEach(function (x) {
      var o = x.o, raw = aoa[o.ix] || [], pn = now(o); seenIx[o.ix] = 1;
      rows1.push(hd.map(function (h, j) { return cellOf(h, raw[j]); }).concat([c(o.post, M), c(o.priceBlank ? null : o.price, M), pn[0], pn[1], c(o.floor, M), c(x.short), c(x.lastChange || '')]));
    });
    for (var j = 1; j < aoa.length; j++) { var rw = aoa[j] || []; if (seenIx[j] || rw.every(function (v) { return v == null || v === ''; })) continue;
      rows1.push(hd.map(function (h, k) { return cellOf(h, rw[k]); }).concat([null, null, null, null, null, c('No SKU – skipped'), null])); }
    var t2 = lean(ALLK, byTab[2]);
    var t3 = lean(ALLK, byTab[3]);
    var t4 = lean(ALLK, byTab[4]);
    var t5 = lean(ALLK.concat(['lastCh']), byTab[5]);
    /* ---- 6 Combined upload: lean set + Your price / Final / Check / Include, helpers hidden at the right ----
       China raises (Ashian, under floor → raise to floor) are NOT in Combined / Final upload – they go to the review-only tab. */
    var chinaRaises = X.filter(function (x) { return x.cat === 'raise' && x.o.china; });
    [['t4', byTab[4]], ['t3', byTab[3]], ['t5', byTab[5]], ['raise', X.filter(function (x) { return x.cat === 'raise' && !x.o.china; })]].forEach(function (g) { g[1].forEach(function (x) { if (x.sugg != null) comb.push(x); }); });
    var F = P.FEE, base6 = ALLK.slice(0, 14), H0 = 2;   /* row 1 note, row 2 header, data from row 3 */
    var h6 = base6.map(function (k) { return L[k][0]; }).concat([['Your price', YOURF, 10], L.np[0], L.npc[0], L.why[0], ['Include? (Yes/No)', YESF, 9], ['Final price', M, 10, 'hide'], ['Check', null, 14, 'hide'],
      ['Upload UK # (helper)', IN, 8, 'hide'], ['Fixed costs (helper)', M, 8, 'hide'], ['Cap price (helper)', M, 8, 'hide'], ['Floor % (helper)', PC, 8, 'hide'], ['Check postage (helper)', null, 8, 'hide'],
      ['Upload China # (helper)', IN, 8, 'hide'], ['Last price change', null, 14]]);
    var okUK = 0, okCN = 0, rows6 = comb.map(function (x, i) {
      var o = x.o, n = i + H0 + 1, A = o.a, fixed = A.cost * A.mult + A.post + (P.num(A.collab) || 0);
      var J = x.sugg, k = P.calc(A, J), prof = P.rnd(P.rnd(J * (1 - F) - fixed, 6), 2), pc = (J * (1 - F) - fixed) / A.cost, s = status(o, J, prof, pc);
      var floorRef = x.t5Min != null ? x.t5Min : o.floor;
      var chk = J == null || !(J > 0) ? 'NO PRICE' : o.check && !S.checkPost && !o.postChecked ? 'CHECK POSTAGE' : J < floorRef - 1e-5 ? 'UNDER FLOOR' : prof <= 0 ? 'LOSS' : (!o.china && o.ceil != null && J > o.ceil + 1e-5) ? 'OVER CAP' : P.rnd(J, 2) === P.rnd(o.price, 2) ? 'NO CHANGE' : 'OK';
      var up = x.inc === 'Yes' && chk === 'OK', upU = up && !o.china, upC = up && !!o.china;
      if (upU) okUK++; if (upC) okCN++;
      var f = function (q) { return q.replace(/#/g, n); };
      var UPF = f('IF(AND(S#="Yes",U#="OK",C#="UK"),COUNTIFS($S$3:S#,"Yes",$U$3:U#,"OK",$C$3:C#,"UK"),"")');
      var CNF = f('IF(AND(S#="Yes",U#="OK",C#="China"),COUNTIFS($S$3:S#,"Yes",$U$3:U#,"OK",$C$3:C#,"China"),"")');
      return base6.map(function (key) {
        if (key === 'cost') return c(A.cost, M);
        if (key === 'floor' && x.t5Min != null) return c(x.t5Min, M); /* tab5 UK: show 65% minimum used for the cut */
        return L[key][1](x);
      }).concat([null,
        { t: 'n', v: prof, f: f('IFERROR(ROUND(ROUND(T#*(1-' + F + ')-W#,6),2),"")'), z: M, st: s },
        { t: 'n', v: pc, f: f('IFERROR((T#*(1-' + F + ')-W#)/D#,"")'), z: PC, st: s },
        c(x.short), { t: 's', v: x.inc, z: YESF },
        { t: 'n', v: J, f: f('IF(O#="",N#,ROUND(O#,2))'), z: M },
        { t: 's', v: chk, f: f('IF(ISERROR(T#),"BAD PRICE",IF(OR(T#="",T#<=0),"NO PRICE",IF(Z#<>"","CHECK POSTAGE",IF(T#<M#-0.00001,"UNDER FLOOR",IF(P#<=0,"LOSS",IF(AND(X#<>"",T#>X#+0.00001),"OVER CAP",IF(ROUND(T#,2)=ROUND(H#,2),"NO CHANGE","OK")))))))') },
        upU ? { t: 'n', v: okUK, f: UPF, z: IN } : { t: 's', v: '', f: UPF },
        c(fixed, M), o.china ? null : c(o.ceil, M), c(o.floorPct, PC), c(o.check && !S.checkPost && !o.postChecked ? o.check : ''),
        upC ? { t: 'n', v: okCN, f: CNF, z: IN } : { t: 's', v: '', f: CNF },
        c(x.lastChange || '')]);
    });
    var last6 = H0 + rows6.length, cf6 = rows6.length ? { sqref: 'P3:Q' + last6, rules: [
      ['neg', 'AND(ISNUMBER($P3),$P3<0)'], ['under', 'AND(ISNUMBER($T3),$T3<$M3-0.00001)'], ['blue', 'AND(ISNUMBER($T3),$X3<>"",$T3>$X3+0.00001)'],
      ['amber', 'AND(ISNUMBER($Q3),$Q3<$Y3+' + AMBER_PP + '-0.000001)'], ['green', 'ISNUMBER($Q3)']] } : null;
    /* ---- 7a / 7b Final upload (B&Q template, formulas from tab 6; UK vs China) ---- */
    var T = (input.template && input.template.Data) || [['Offer SKU', 'Offer price', 'Discount price', 'Discount start date', 'Discount end date'], ['offer-sku', 'price', 'discount-price', 'discount-start-date', 'discount-end-date']];
    var q = "'" + NAMES[5] + "'!";
    function finalRows(colUpload, nOk) {
      var rows = [], i, hit;
      for (i = 0; i < Math.max(nOk, 0); i++) {
        rows.push([
          { t: 's', v: '', f: 'IFERROR(INDEX(' + q + '$A:$A,MATCH(ROW()-2,' + q + '$' + colUpload + ':$' + colUpload + ',0)),"")' },
          { t: 'n', v: null, f: 'IFERROR(INDEX(' + q + '$T:$T,MATCH(ROW()-2,' + q + '$' + colUpload + ':$' + colUpload + ',0)),"")', z: '0.00' }
        ]);
      }
      /* seed cached values for Node/openpyxl readers (formulas still win in Excel) */
      var seq = 0;
      comb.forEach(function (x) {
        var o = x.o, wantCN = colUpload === 'AA';
        if (!!o.china !== wantCN) return;
        if (!(x.inc === 'Yes')) return;
        /* mirror Check=OK using same rules as rows6 seed */
        var J = x.sugg, A = o.a, fixed = A.cost * A.mult + A.post + (P.num(A.collab) || 0);
        var prof = P.rnd(P.rnd(J * (1 - F) - fixed, 6), 2);
        var floorRef = x.t5Min != null ? x.t5Min : o.floor;
      var chk = J == null || !(J > 0) ? 'NO PRICE' : o.check && !S.checkPost && !o.postChecked ? 'CHECK POSTAGE' : J < floorRef - 1e-5 ? 'UNDER FLOOR' : prof <= 0 ? 'LOSS' : (!o.china && o.ceil != null && J > o.ceil + 1e-5) ? 'OVER CAP' : P.rnd(J, 2) === P.rnd(o.price, 2) ? 'NO CHANGE' : 'OK';
        if (chk !== 'OK') return;
        if (seq < rows.length) { rows[seq][0].v = o.sku; rows[seq][1].v = J; rows[seq][1].t = 'n'; }
        seq++;
      });
      if (!rows.length) rows.push([{ t: 's', v: '', f: 'IFERROR(INDEX(' + q + '$A:$A,MATCH(ROW()-2,' + q + '$' + colUpload + ':$' + colUpload + ',0)),"")' }, { t: 's', v: '', f: 'IFERROR(INDEX(' + q + '$T:$T,MATCH(ROW()-2,' + q + '$' + colUpload + ':$' + colUpload + ',0)),"")' }]);
      return rows;
    }
    var rows7a = finalRows('V', okUK), rows7b = finalRows('AA', okCN);
    var finalCols = [[T[0][0], null, 24], [T[0][1], null, 12], [T[0][2], null, 14], [T[0][3], null, 20], [T[0][4], null, 20]];
    var finalNotesUK = { 0: 'B&Q price import layout (UK only). Filled from tab 6 rows with Include = Yes, Check = OK and UK/China = UK. China raises are never here.' };
    var finalNotesCN = { 0: 'B&Q price import layout (China / Ashian Homeware only). Filled from tab 6 rows with Include = Yes, Check = OK and UK/China = China. China raises (under-floor raises) are never here – see the review-only tab.' };
    /* ---- China raises review-only (never uploaded) ---- */
    var tRaise = lean(ALLK, chinaRaises);
    /* ---- 8 Sells elsewhere, not on B&Q (report only) ---- */
    var E8 = sells(P, X, aoa), inComb = {}; comb.forEach(function (x) { inComb[x.o.sku] = 1; });
    var h8 = ALLK.map(function (k) { return L[k][0]; }).concat([['Other platform 30d sales', IN, 10]]);
    var rows8 = E8.map(function (e) { var x = e.x; return ALLK.map(function (k) { return k === 'why' ? c(e.why) : L[k][1](x); }).concat([c(e.s.other, IN)]); });
    var why8 = {}; REASONS8.forEach(function (k) { why8[k] = 0; }); E8.forEach(function (e) { why8[e.key]++; });
    var t8inComb = E8.filter(function (e) { return inComb[e.x.o.sku]; }).length;
    var t5uk = byTab[5].filter(function (x) { return !x.o.china; });
    var counts = { all: rows1.length, t2: t2.rows.length, t3: t3.rows.length, t3sugg: byTab[3].filter(function (x) { return x.sugg != null; }).length, t4: t4.rows.length, t5: t5.rows.length, t5sugg: byTab[5].filter(function (x) { return x.sugg != null; }).length,
      t5uk: t5uk.length, t5weeklyHold: t5uk.filter(function (x) { return !!x.weeklyHold; }).length,
      t5couldWinAt65: t5uk.filter(function (x) { return !!x.couldWinAt50; }).length, /* name kept; means 1p-under >= tab5 min (65%) */
      raise: X.filter(function (x) { return x.cat === 'raise'; }).length, chinaRaiseHeld: chinaRaises.length,
      t6: rows6.length, t7: okUK + okCN, t7uk: okUK, t7cn: okCN, chinaRaiseReview: chinaRaises.length,
      checkPost: comb.filter(function (x) { return x.o.check && !S.checkPost && !x.o.postChecked; }).length, t8: rows8.length, t8why: why8, t8alsoInComb: t8inComb };
    var fz = { x: 1, y: 2 };
    var ky = ALLK.indexOf('floor'), info = [
      [NAMES[0], 'Everything: your Access paste exactly as it came, plus postage, price now, profit now, floor and the action.', counts.all, 'Look up any SKU.'],
      [NAMES[1], 'We hold the buy box, it sells, profit is between the floor and the 80% cap.', counts.t2, 'Nothing – no change.'],
      [NAMES[2], 'We hold the buy box but sold 0 on B&Q in 30 days.', counts.t3, 'Optional price cut (goes to tab 6). ' + RULE3],
      [NAMES[3], 'A rival holds the buy box; we can go 1p under and stay above the floor.', counts.t4, 'Suggested price = 1p under the buy box (or our 80% cap if lower), never under the floor (goes to tab 6).'],
      [NAMES[4], 'We cannot win the buy box under the normal floor. UK optional cut uses 60% floor (min 65%), weekly (7 days).', counts.t5, RULE5 + ' Price changes are weekly for this tab.'],
      [NAMES[5], 'Every suggested change in one list (except China raises). Type your own price in yellow "Your price" (blank = suggested); set Include Yes/No.', counts.t6, 'Rows with Include = Yes that pass the checks go to tab 7a (UK) or 7b (China). China under-floor raises are NOT here – see the review-only tab. Check-postage rows never go. Hidden helper columns do the maths – leave them.'],
      [REVIEW_CHINA, 'China (Ashian) products under the 100% floor – proposed raise to the floor. REVIEW ONLY.', counts.chinaRaiseReview, 'Never uploaded. Decide offline; do not use Include to push these into Final upload.'],
      [NAMES[6], 'B&Q price upload layout – UK SKUs only.', counts.t7uk, 'Save and upload this tab to B&Q for UK prices.'],
      [NAMES[7], 'B&Q price upload layout – China (Ashian Homeware) SKUs only (cuts / can-win etc).', counts.t7cn, 'Save and upload this tab to B&Q for China prices. China raises are not included.'],
      [NAMES[8], 'REPORT ONLY: sells on other platforms but hardly on B&Q.', counts.t8, 'Other platforms sold ' + T8_MIN_OTHER + '+ in 30 days and B&Q sold 0 or under ' + Math.round(T8_MAX_SHARE * 100) + '% of all sales (all = Access "' + ALL_COL + '"). Does not feed tab 6 or Final upload. Reason says what to check.']];
    var rows0 = (input.dataUsed ? [[c(input.dataUsed)], [null]] : []).concat(info.map(function (r) { return [c(r[0]), c(r[1]), c(r[2], IN), c(r[3])]; })).concat([[null], [c('Colour key (profit cells)')]])
      .concat(KEY.map(function (k) { var q = c(k[1]); q.st = k[0]; return [q, c({ neg: 'Profit below £0', under: 'Price under the floor', amber: 'Within 5 points above the floor %', green: 'Floor + 5 points up to the cap', blue: 'Over the 80% cap (UK)' }[k[0]])]; }))
      .concat([[c('Header colours')], [c('grey = cost · blue = selling price · green = profit £ · purple = profit %')]]);
    return { counts: counts, X: X, comb: comb, E8: E8, chinaRaises: chinaRaises, list: [
      { name: START, top: 'Start here – what each tab is and what to do. Same columns on tabs 2–6 and 8.', cols: [['Tab', null, 24], ['What it is', null, 60], ['Rows', IN, 8], ['What to do / rule', null, 90]], rows: rows0, freeze: { x: 0, y: 2 }, filter: false, wrap: true },
      { name: NAMES[0], top: 'All rows – your Access paste, then the price/profit/floor/action columns.', key: hd.length + 1, cols: cols1, rows: rows1, freeze: fz, filter: true },
      { name: NAMES[1], top: 'Winning and selling, profit in range – no change.', key: ky, cols: t2.cols, rows: t2.rows, freeze: fz, filter: true },
      { name: NAMES[2], top: 'Winning but 0 B&Q sales – optional cut a quarter of the gap toward the floor.', key: ky, cols: t3.cols, rows: t3.rows, freeze: fz, filter: true },
      { name: NAMES[3], top: 'Rival has the buy box – suggested = 1p under them.', key: ky, cols: t4.cols, rows: t4.rows, freeze: fz, filter: true },
      { name: NAMES[4], top: 'Margin too low – optional 5% cut. UK: 60% floor (min 65%), weekly 7-day rule. China: normal floor.', key: ky, cols: t5.cols, rows: t5.rows, freeze: fz, filter: true },
      { name: NAMES[5], top: 'All changes except China raises – type in yellow Your price, set Include; OK UK → 7a, OK China → 7b.', key: ky, cols: h6, rows: rows6, freeze: fz, filter: true, your: 14, inc: 18, cf: cf6 },
      { name: REVIEW_CHINA, top: 'China raises to the 100% floor – REVIEW ONLY. Never uploaded to B&Q.', key: ky, cols: tRaise.cols, rows: tRaise.rows, freeze: fz, filter: true },
      { name: NAMES[6], cols: finalCols, head2: T[1], rows: rows7a, freeze: { x: 0, y: 2 }, filter: false, notes: finalNotesUK },
      { name: NAMES[7], cols: finalCols, head2: T[1], rows: rows7b, freeze: { x: 0, y: 2 }, filter: false, notes: finalNotesCN },
      { name: NAMES[8], top: 'REPORT ONLY – sells elsewhere, hardly on B&Q. Does not feed Combined or Final upload.', key: ky, cols: h8, rows: rows8, freeze: fz, filter: true }] };
  }

  /* SheetJS workbook from the specs, then a small zip edit for what the free SheetJS cannot write */
  function buildValues(X, P, input) {
    var B = sheets(P, input), wb = X.utils.book_new(), enc = function (r, k) { return X.utils.encode_cell({ r: r, c: k }); };
    B.list.forEach(function (sh) {
      var head = sh.cols.map(function (q) { return q[0]; }); sh._mk = {}; var top = sh.top ? 1 : 0, hr = top, hrows = [head].concat(sh.head2 ? [sh.head2] : []), R0 = top + hrows.length, ws = {};
      sh._hd = {}; sh._hr = hr;
      if (top) ws.A1 = { t: 's', v: sh.top };
      if (top && sh.key != null) KEY.forEach(function (k, i) { var a = enc(0, sh.key + i); ws[a] = { t: 's', v: k[1] }; sh._mk[a] = k[0]; });
      hrows.forEach(function (row, r) { row.forEach(function (v, k) { ws[enc(r + top, k)] = { t: 's', v: v == null ? '' : String(v), z: HDRF }; }); });
      head.forEach(function (h, k) { var t = htype(h); if (t) sh._hd[enc(hr, k)] = t; });
      sh.rows.forEach(function (row, i) { row.forEach(function (cl, k) { if (!cl) return; var o = { t: cl.t, v: cl.v }; if (cl.z) o.z = cl.z; if (cl.f) o.f = cl.f; var a = enc(R0 + i, k); ws[a] = o; if (cl.st) sh._mk[a] = cl.st; }); });
      var nr = R0 + sh.rows.length; ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(nr - 1, R0 - 1), c: head.length - 1 } });
      ws['!cols'] = sh.cols.map(function (q, k) {
        var o;
        if (q[2] && q[2] !== 'raw') o = { wch: q[2] };
        else { var w = String(q[0]).length * (q[2] === 'raw' ? 1 : 0.9) + 2; for (var i = 0; i < Math.min(sh.rows.length, 400); i++) { var cl = sh.rows[i][k]; if (!cl) continue; var L = cl.t === 'n' ? (cl.z === PC ? 6 : cl.z === EAN ? 14 : String(Math.round(cl.v * 100) / 100).length + 2) : String(cl.v).length; if (L > w) w = L; }
          o = { wch: Math.max(8, Math.min(Math.ceil(w) + 1, q[2] === 'raw' ? 40 : 46)) }; }
        if (q[3] === 'hide') o.hidden = true; return o; });
      if (sh.filter && sh.rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: hr, c: 0 }, e: { r: nr - 1, c: head.length - 1 } }) };
      Object.keys(sh.notes || {}).forEach(function (k) { var j = /^\d+$/.test(k) ? +k : head.indexOf(k); if (j < 0) return; var a = enc(hr, j); ws[a].c = [{ a: 'Pricing tab', t: sh.notes[k] }]; ws[a].c.hidden = true; });
      X.utils.book_append_sheet(wb, ws, sh.name);
    });
    wb.Props = { Title: 'B&Q pricing – 8 tabs', Author: 'B&Q dashboard' };
    var bytes = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    return { bytes: polish(X, new Uint8Array(bytes), B.list), counts: B.counts, B: B };
  }

  function txt(u) { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u); return Buffer.from(u).toString('utf8'); }
  function bin(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); return new Uint8Array(Buffer.from(s, 'utf8')); }
  var solid = function (rgb) { return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>'; };
  function polish(X, bytes, list) {
    var Z = X.CFB.read(bytes, { type: 'array' }), get = function (p) { var i = Z.FullPaths.findIndex(function (q) { return q.slice(-p.length) === p; }); return i < 0 ? null : i; };
    var si = get('xl/styles.xml'), st = txt(Z.FileIndex[si].content);
    var idOf = function (code) { var esc = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;'), m = new RegExp('numFmtId="(\\d+)" formatCode="' + esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').exec(st); return m ? m[1] : null; };
    var yesId = idOf(YESF), moneyId = idOf(M) || '0';
    st = st.replace(/<fonts count="(\d+)">([\s\S]*?)<\/fonts>/, function (_, n, b) { return '<fonts count="' + (+n + 2) + '">' + b + '<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>'; });
    var nfo = +/<fonts count="(\d+)"/.exec(st)[1], nf = nfo - 2, nfWhite = nfo - 1;
    var fillList = ['FFFFE0B2', 'FFFFF59D'].concat(['cost', 'price', 'profit', 'pct'].map(function (k) { return COL[k]; })).concat(STK.map(function (k) { return ST[k].fill; }));
    st = st.replace(/<fills count="(\d+)">([\s\S]*?)<\/fills>/, function (_, n, b) { return '<fills count="' + (+n + fillList.length) + '">' + b + fillList.map(solid).join('') + '</fills>'; });
    var nfill = +/<fills count="(\d+)"/.exec(st)[1], f0 = nfill - fillList.length, fHead = f0, fYel = f0 + 1, fCol = { cost: f0 + 2, price: f0 + 3, profit: f0 + 4, pct: f0 + 5 }, fSt = {}; STK.forEach(function (k, i) { fSt[k] = f0 + 6 + i; });
    var xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st), list2 = xfs[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g);
    list2 = list2.map(function (x) {
      if (/numFmtId="49"/.test(x)) return '<xf numFmtId="49" fontId="' + nf + '" fillId="' + fHead + '" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>';
      if (yesId && new RegExp('numFmtId="' + yesId + '"').test(x)) return '<xf numFmtId="' + yesId + '" fontId="0" fillId="' + fYel + '" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>';
      return x; });
    list2.push('<xf numFmtId="' + moneyId + '" fontId="0" fillId="' + fYel + '" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>');
    var yourXf = list2.length - 1, yesXf = yesId ? list2.findIndex(function (x) { return new RegExp('numFmtId="' + yesId + '"').test(x); }) : -1, cache = {};
    var clone = function (base, fill, font) { var key = base + '|' + fill + '|' + (font == null ? '' : font); if (cache[key] != null) return cache[key];
      var x = list2[base] || list2[0]; x = x.replace(/fillId="\d+"/, 'fillId="' + fill + '"'); if (!/applyFill=/.test(x)) x = x.replace('<xf ', '<xf applyFill="1" ');
      if (font != null) { x = x.replace(/fontId="\d+"/, 'fontId="' + font + '"'); if (!/applyFont=/.test(x)) x = x.replace('<xf ', '<xf applyFont="1" '); }
      list2.push(x); return (cache[key] = list2.length - 1); };
    var jobs = list.map(function () { return null; });
    list.forEach(function (sh, i) { jobs[i] = function (s) {
      return s.replace(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?/g, function (m0, ref, sv) {
        var h = sh._hd && sh._hd[ref], k = sh._mk && sh._mk[ref]; if (!h && !k) return m0; var base = sv ? +sv : 0;
        var nx = h ? clone(base, fCol[h]) : clone(base, fSt[k], k === 'neg' ? nfWhite : null); return '<c r="' + ref + '" s="' + nx + '"'; }); }; });
    var firstVisible = 0;
    for (var vi = 0; vi < list.length; vi++) { if (!list[vi].hide) { firstVisible = vi; break; } }
    var sheetsXml = list.map(function (sh, i) { var k = get('xl/worksheets/sheet' + (i + 1) + '.xml'); return k == null ? null : { k: k, s: jobs[i](txt(Z.FileIndex[k].content)) }; });
    var dx = STK.map(function (k) { var o = ST[k]; return '<dxf>' + (o.font ? '<font><b/><color rgb="' + o.font + '"/></font>' : '') + '<fill><patternFill patternType="solid"><fgColor rgb="' + o.fill + '"/><bgColor rgb="' + o.fill + '"/></patternFill></fill></dxf>'; });
    st = st.replace(xfs[0], '<cellXfs count="' + list2.length + '">' + list2.join('') + '</cellXfs>');
    st = /<dxfs count="0"\/>/.test(st) ? st.replace('<dxfs count="0"/>', '<dxfs count="' + dx.length + '">' + dx.join('') + '</dxfs>') : st.replace('</cellStyles>', '</cellStyles><dxfs count="' + dx.length + '">' + dx.join('') + '</dxfs>');
    Z.FileIndex[si].content = bin(st);
    list.forEach(function (sh, i) {
      var sx = sheetsXml[i]; if (!sx) return; var s = sx.s, fz = sh.freeze, pane;
      if (fz.x && fz.y) { var tl = X.utils.encode_cell({ r: fz.y, c: fz.x }); pane = '<pane xSplit="' + fz.x + '" ySplit="' + fz.y + '" topLeftCell="' + tl + '" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="' + tl + '" sqref="' + tl + '"/>'; }
      else { var tl2 = 'A' + (fz.y + 1); pane = '<pane ySplit="' + fz.y + '" topLeftCell="' + tl2 + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="' + tl2 + '" sqref="' + tl2 + '"/>'; }
      s = s.replace(/<sheetView ([^>]*?)\/>/, '<sheetView $1' + (i === firstVisible ? ' tabSelected="1"' : '') + '>' + pane + '</sheetView>');
      s = s.replace(/<sheetFormatPr [^>]*\/>/, '').replace('<cols>', '<sheetFormatPr defaultRowHeight="16"/><cols>');
      s = s.replace(/<col min="(\d+)" max="(\d+)"([^>]*)\/>/g, function (m0, a) { var j = +a - 1; if (sh.cols[j] && sh.cols[j][3] === 'hide' && !/hidden=/.test(m0)) m0 = m0.replace('/>', ' hidden="1"/>'); var inp = sh.inputs && sh.inputs.indexOf(j) >= 0; if (inp || j === sh.your) return m0.replace('/>', ' style="' + yourXf + '"/>'); if (j === sh.inc && yesXf >= 0) return m0.replace('/>', ' style="' + yesXf + '"/>'); return m0; });
      s = s.replace('<row r="' + (sh._hr + 1) + '"', '<row r="' + (sh._hr + 1) + '" ht="34" customHeight="1"');
      if (sh.cf) { var cfx = '<conditionalFormatting sqref="' + sh.cf.sqref + '">' + sh.cf.rules.map(function (r, p) { return '<cfRule type="expression" dxfId="' + STK.indexOf(r[0]) + '" priority="' + (p + 1) + '" stopIfTrue="1"><formula>' + r[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</formula></cfRule>'; }).join('') + '</conditionalFormatting>';
        var mm = /<(dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|ignoredErrors|drawing|legacyDrawing|tableParts|extLst)[ >\/]/.exec(s); s = mm ? s.slice(0, mm.index) + cfx + s.slice(mm.index) : s.replace('</worksheet>', cfx + '</worksheet>'); }
      Z.FileIndex[sx.k].content = bin(s);
    });
    var sh33 = Z.FullPaths.findIndex(function (p) { return /Sh33tJ5$/.test(p); }); if (sh33 >= 0) X.CFB.utils.cfb_del(Z, Z.FullPaths[sh33]);
    return new Uint8Array(X.CFB.write(Z, { fileType: 'zip', type: 'array', compression: true }));
  }
  /* edited workbook -> B&Q upload rows. Reads 7a (UK) + 7b (China); rejects China raises. */
  function fromEdited(X, P, wbIn, byS, S) {
    S = S || {};
    var names = [NAMES[6], NAMES[7]], out = [], bad = [], seen = {}, ni, ws, a, i, sku, p, o, why;
    for (ni = 0; ni < names.length; ni++) {
      ws = wbIn.Sheets[names[ni]]; if (!ws) throw new Error('This is not the pricing workbook – no sheet “' + names[ni] + '”.');
      a = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      for (i = 2; i < a.length; i++) {
        sku = a[i][0] == null ? '' : String(a[i][0]).trim(); p = P.num(a[i][1]); if (!sku && (p == null)) continue;
        o = byS[sku];
        why = !o ? 'SKU not in the data' : seen[sku] ? 'twice' : !(p > 0) ? 'no price' : (o.check && !S.checkPost && !o.postChecked) ? 'check postage' : (S.blocks && S.blocks[sku]) ? S.blocks[sku] : !o.a ? 'no cost' : (o.china && ni === 0) ? 'China SKU on UK tab' : (!o.china && ni === 1) ? 'UK SKU on China tab' : !ok(P, o, P.rnd(p, 2)) ? 'under floor / loss / over cap' : '';
        /* China under-floor raises must never be imported even if someone pasted them */
        if (!why && o && o.china && P.rnd(p, 2) > P.rnd(o.price, 2) + 1e-9) why = 'China raise – review only';
        seen[sku] = 1; if (why) bad.push(sku + ' (' + why + ')'); else out.push([sku, P.rnd(p, 2)]);
      }
    }
    return { rows: out, bad: bad };
  }
  function liveApi() {
    if (typeof BQLive !== 'undefined') return BQLive;
    if (typeof require === 'function') { try { return require('./bq_live.js'); } catch (e) { return null; } }
    return null;
  }
  function pureSettings(input) {
    var S = Object.assign({}, (input && input.settings) || {});
    if (input && input.priceChanges) S.priceChanges = input.priceChanges;
    if (input && input.asOf) S.asOf = input.asOf;
    delete S.checks;
    return S;
  }
  /* One canonical row per SKU. Engine results are the no-edit baseline. Saved checks are typed into the yellow review cells, not baked into the baseline. */
  function liveRecords(P, input) {
    input = input || {};
    var S = pureSettings(input);
    var bbS = Object.assign({}, P.BB_DEFAULT || {}, S);
    var rivals = input.rivals || {}, freshIn = input.fresh || {};
    var pureB = (input.bbr || []).map(function (b) {
      var o = b.o || b;
      if (!o || o.dup || !o.sku) return null;
      var raw = { sku: o.sku, title: o.title, ean: o.ean, cost: o.cost, price: o.priceEngine != null ? o.priceEngine : o.price,
        bb: o.bb, seller: o.seller, sup: o.sup, w: o.w, sales: o.sales, collab: o.collab, stock: o.stock,
        variant: o.variant || '', pc: o.accessPc, offerFlag: o.offerFlag, liveSeen: o.liveSeen, url: o.url, ix: o.ix };
      var d = P.decide(raw, {});
      var fr = Object.prototype.hasOwnProperty.call(freshIn, o.ean) ? !!freshIn[o.ean] : b.act !== 'No data';
      var nb = P.buyBox(d, { fresh: fr, rival: rivals[o.ean] || null, seasonal: P.isSeasonal(d.title, d.sku) }, bbS);
      nb.o = d; return nb;
    }).filter(Boolean);
    var X = classify(P, pureB, S);
    var seen = {}, recs = [];
    X.forEach(function (x) {
      var o = x.o;
      if (!o.sku || o.dup || seen[o.sku]) return;
      seen[o.sku] = 1;
      var st = snapshotStatus(P, x, S);
      var rv = rivals[o.ean] || null;
      recs.push({
        sku: String(o.sku), title: o.title || '', uk: o.china ? 'China' : 'UK', cost: o.cost, mult: o.mult, collab: o.collab || 0,
        w: o.w == null ? null : o.w, sales: o.sales || 0, stock: o.stock == null ? null : o.stock, bb: o.bb, win: o.win ? 1 : 0, seller: o.seller || '',
        basePost: o.postAuto != null ? o.postAuto : o.post, basePrice: o.priceBlank ? null : o.price, china: o.china ? 1 : 0,
        tree: P.isXmasTree(o.title, o.sku) ? 1 : 0, fresh: Object.prototype.hasOwnProperty.call(freshIn, o.ean) ? (freshIn[o.ean] ? 1 : 0) : (x.r && x.r.act === 'No data' ? 0 : 1),
        liveSeen: o.liveSeen == null ? null : o.liveSeen, offer: o.offerFlag || '', packN: P.packN(o.title), packCheck: o.check ? 1 : 0,
        lastChange: x.lastChange || '', rival: rv && rv.p != null ? rv.p : null, seasonal: P.isSeasonal(o.title, o.sku) ? 1 : 0,
        engSugg: x.sugg, engInc: st.chk === 'OK' || st.chk === 'OVER CAP' || st.chk === 'CHECK POSTAGE' || st.chk === 'CHINA RAISE' || st.chk === 'WEEKLY HOLD' ? (x.incDefault || x.inc) : 'No', engCheck: st.chk, engReason: x.short || '',
        engProfit: o.profit == null ? null : o.profit, engPc: o.pc == null ? null : o.pc, engFloor: o.floor == null ? null : o.floor,
        engCap: o.china ? null : o.ceil, engFinal: x.sugg, engNewProfit: st.prof,
        ean: o.ean || '', noData: x.r && x.r.act === 'No data' ? 1 : 0, priceCheck: x.r && x.r.act === 'Price check' ? 1 : 0,
        sup: o.sup || '', tab: x.tab, cat: x.cat, act: x.r ? x.r.act : '', weekly: x.weeklyHold ? 1 : 0, floorPct: o.floorPct, t5Min: x.t5Min == null ? null : x.t5Min,
        ix: o.ix, accessPc: o.accessPc == null ? null : o.accessPc
      });
    });
    return { recs: recs, X: X, S: S };
  }
  function build(X, P, input) {
    var Live = liveApi();
    if (!Live) return buildValues(X, P, input);
    input = input || {};
    var pack = input.records ? { recs: input.records, S: pureSettings(input), X: [] } : liveRecords(P, input);
    /* Tab 8 is a report. The formula download used to leave it blank because it never ran the elsewhere-sales list. */
    if (input.t8 == null && pack.X && pack.X.length && input.aoa) input = Object.assign({}, input, { t8: sells(P, pack.X, input.aoa) });
    var saved = input.checks || (input.settings && input.settings.checks) || {};
    var made = Live.make(pack.recs, input, P, saved, pack.S);
    var bytes = new Uint8Array(writeBook(X, made.list));
    bytes = polish(X, bytes, made.list);
    bytes = Live.forceCalc ? Live.forceCalc(X, bytes, made.list) : bytes;
    bytes = Live.shareFormulas ? Live.shareFormulas(X, bytes) : bytes;
    return { bytes: bytes, counts: made.counts, B: made, records: pack.recs };
  }
  function writeBook(X, list) {
    var wb = X.utils.book_new(), enc = function (r, k) { return X.utils.encode_cell({ r: r, c: k }); };
    list.forEach(function (sh) {
      var head = sh.cols.map(function (q) { return q[0]; }); sh._mk = {}; var top = sh.top ? 1 : 0, hr = top, hrows = [head].concat(sh.head2 ? [sh.head2] : []), R0 = top + hrows.length, ws = {};
      sh._hd = {}; sh._hr = hr;
      if (top) ws.A1 = { t: 's', v: sh.top };
      if (top && sh.key != null) KEY.forEach(function (k, i) { var a = enc(0, sh.key + i); ws[a] = { t: 's', v: k[1] }; sh._mk[a] = k[0]; });
      hrows.forEach(function (row, r) { row.forEach(function (v, k) { ws[enc(r + top, k)] = { t: 's', v: v == null ? '' : String(v), z: HDRF }; }); });
      head.forEach(function (h, k) { var t = htype(h); if (t) sh._hd[enc(hr, k)] = t; });
      sh.rows.forEach(function (row, i) { row.forEach(function (cl, k) { if (!cl) return; var o = { t: cl.t || 's' }; if (cl.v != null && cl.v !== '') o.v = cl.v; else if (!cl.f) return; if (cl.z) o.z = cl.z; if (cl.f) o.f = cl.f; var a = enc(R0 + i, k); ws[a] = o; if (cl.st) sh._mk[a] = cl.st; }); });
      var nr = R0 + sh.rows.length; ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(nr - 1, R0 - 1), c: Math.max(head.length - 1, 0) } });
      ws['!cols'] = sh.cols.map(function (q, k) {
        var o;
        if (q[2] && q[2] !== 'raw') o = { wch: q[2] };
        else { var w = String(q[0] || '').length + 2; o = { wch: Math.max(8, Math.min(w, 46)) }; }
        if (q[3] === 'hide') o.hidden = true; return o;
      });
      if (sh.filter && sh.rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: hr, c: 0 }, e: { r: nr - 1, c: head.length - 1 } }) };
      Object.keys(sh.notes || {}).forEach(function (k) { var j = /^\d+$/.test(k) ? +k : head.indexOf(k); if (j < 0) return; var a = enc(hr, j); if (!ws[a]) ws[a] = { t: 's', v: head[j] || '' }; ws[a].c = [{ a: 'Pricing', t: sh.notes[k] }]; ws[a].c.hidden = true; });
      X.utils.book_append_sheet(wb, ws, sh.name);
    });
    if (!wb.Workbook) wb.Workbook = {};
    wb.Workbook.Sheets = list.map(function (sh) { return sh.hide ? { Hidden: 1 } : {}; });
    wb.Props = { Title: 'B&Q pricing workbook', Author: 'B&Q dashboard' };
    return X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  }
  function blocks(P, R, S) {
    var m = {};
    classify(P, R, S || {}).forEach(function (x) {
      if (x.weeklyHold) m[x.o.sku] = 'weekly hold';
      else if (x.cat === 'raise' && x.o.china) m[x.o.sku] = 'China raise';
      else if (x.o.check && !(S && S.checkPost) && !x.o.postChecked) m[x.o.sku] = 'check postage';
    });
    return m;
  }
  return { VERSION: VERSION, NAMES: NAMES, REVIEW_CHINA: REVIEW_CHINA, START: START, RULE3: RULE3, RULE5: RULE5, classify: classify, sheets: sheets, build: build, buildValues: buildValues, fromEdited: fromEdited, ok: ok, okAt: okAt, sells: sells, status: status, snapshotStatus: snapshotStatus, liveRecords: liveRecords, blocks: blocks, applySavedInc: applySavedInc, MIN_CHANGE: MIN_CHANGE, T5_UK_FLOOR: T5_UK_FLOOR, T5_UK_MIN: T5_UK_MIN, WEEKLY_DAYS: WEEKLY_DAYS, T8_MIN_OTHER: T8_MIN_OTHER, T8_MAX_SHARE: T8_MAX_SHARE, ALL_COL: ALL_COL, REASONS8: REASONS8,
    parseChecks: function (X, wb, ctx) { var L = liveApi(); if (!L) throw new Error('calculator missing'); return L.parseChecks(X, wb, ctx); },
    normStore: function (s) { var L = liveApi(); return L ? L.normStore(s) : { v: 1, items: {} }; },
    applyPreview: function (store, preview) { return liveApi().applyPreview(store, preview); },
    backup: function (store) { return liveApi().backup(store); },
    restoreBackup: function (obj) { return liveApi().restoreBackup(obj); },
    outcome: function (P, rec, edit, S) { return liveApi().outcome(P, rec, edit, S, classify); } };
});
