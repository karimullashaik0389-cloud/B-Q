/* bq_price.js – THE ONE shared B&Q price / profit engine (Diva Packages).
   Used by: Sales + Orders (app.js), the Pricing tab (pricing_v1.js) and the Python Excel builder (via node).
   Maths (Diva Master File + Karimulla's rules):
     total cost = cost + company cost (cost x1 Ashian Homeware, x0.5 others) + 15% of price + postage + collab fee (blank = 0)
     profit = price - total cost      profit % = profit / estimated cost
     postage (in this order): 1 your typed postage; 2 special fixed rules (Karimulla's seniors' list, 26 Oct + 2 Nov 2026 notes, see SPECIAL);
       3 description code H123/H063/H077 over 15.2kg: DPD 14 (<=20kg) / 15 (<=25kg) / 17 (<=30kg); 4 Access 'Postage Cost' if > 0;
       5 weight band on the (total pack) weight: <=2000g 1.90, <=15200g 2.45, <=20000g 8, <=25000g 9, <=30000g 10.50, else 15. A multi-pack is ONE parcel. Check-postage only for multi-packs with weight >=14999g (or missing weight).
       If Access postage equals an old band rate (£1.75 or £2.30, within 0.5p), it is used at the new rate (£1.90 or £2.45). Other Access amounts stay as they are. The mapping is in Settings.
   No data and no keys in this file. */
(function (root, f) { var m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BQP = m; })(this, function () {
  'use strict';
  var FEE = 0.15, ASHIAN = 2, OTHER = 1.5, UK_MAX = 0.8, CHINA_FLOOR = 1, SAFE_MIN = 0.5, RAISE_AT = 100, RAISE_STEP = 0.1, CHINA_CUT = 0.1;
  var BANDS = [[2000, 1.9, '≤2 kg'], [15200, 2.45, '≤15.2 kg'], [20000, 8, '≤20 kg'], [25000, 9, '≤25 kg'], [30000, 10.5, '≤30 kg']], OVER = [15, 'over 30 kg'];
  var _R = null;
  var DEFAULT_RULES = {
    fee: FEE, ukMax: UK_MAX, safeMin: SAFE_MIN, chinaFloor: CHINA_FLOOR, chinaCut: CHINA_CUT,
    ukSoldFloor: 0.5, ukBand1: 0.8, ukBand5: 0.7, ukBand10: 0.6, ukBandRest: 0.5,
    cost1: 1, cost5: 5, cost10: 10,
    t5cut: 0.05, t5ukFloor: 0.60, t5ukMin: 0.65, t5HoldDays: 3,
    minChange: 0.10, t3buf: 0.05, step: 0.01,
    closeHi: 0.10, closeLo: 0.15, packGrams: 14999,
    bands: BANDS.map(function (b) { return [b[0], b[1], b[2]]; }),
    overBand: OVER[0],
    accessMap: [[1.75, 1.9], [2.3, 2.45]],
    accessMapTol: 0.005,
    zeroSalesRaise: SAFE_MIN,
    floorLift: 1
  };
  function rulesOf(s) {
    var d = DEFAULT_RULES, o = s || {}, r = {};
    Object.keys(d).forEach(function (k) {
      if (k === 'bands') r.bands = Array.isArray(o.bands) && o.bands.length ? o.bands : d.bands;
      else if (k === 'accessMap') r.accessMap = accessMapFrom(o, d);
      else r[k] = o[k] != null && o[k] !== '' ? o[k] : d[k];
    });
    return r;
  }
  function rulesDiffer(s) {
    if (!s) return false;
    var r = rulesOf(s), d = DEFAULT_RULES, k;
    for (k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      if (k === 'bands') {
        var a = r.bands.map(function (b) { return [+b[0], +b[1]]; }), b = d.bands.map(function (x) { return [x[0], x[1]]; });
        if (JSON.stringify(a) !== JSON.stringify(b)) return true;
      } else if (k === 'accessMap') {
        var am = function (m) { return (m || []).map(function (p) { return [+p[0], +p[1]]; }); };
        if (JSON.stringify(am(r.accessMap)) !== JSON.stringify(am(d.accessMap))) return true;
      } else if (+r[k] !== +d[k] && String(r[k]) !== String(d[k])) return true;
    }
    return false;
  }
  function useRules(s) { _R = (s && rulesDiffer(s)) ? rulesOf(s) : null; return _R; }
  function clearRules() { _R = null; }
  function feeOf() { return _R ? _R.fee : FEE; }
  function ukMaxOf() { return _R ? _R.ukMax : UK_MAX; }
  function safeOf() { return _R ? _R.safeMin : SAFE_MIN; }
  function chinaFloorOf() { return _R ? _R.chinaFloor : CHINA_FLOOR; }
  function chinaCutOf() { return _R ? _R.chinaCut : CHINA_CUT; }
  function packGramsOf() { return _R ? _R.packGrams : 14999; }
  function closeHiOf(s) { return (s && s.closeHi != null) ? s.closeHi : (_R ? _R.closeHi : 0.10); }
  function closeLoOf(s) { return (s && s.closeLo != null) ? s.closeLo : (_R ? _R.closeLo : 0.15); }
  /* When on (default), a UK suggestion that would sit under its own floor is lifted to that floor
     (already rounded up to the penny). Cuts stay cuts, raises stay raises. Never over the 80% cap, never a loss.
     Floors themselves are unchanged. China is not lifted. Turn off with Settings floorLift = 0. */
  function floorLiftOf() {
    var r = _R || DEFAULT_RULES;
    if (r.floorLift === false || r.floorLift === 0 || r.floorLift === '0') return false;
    return true;
  }
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
  function band(w) { w = num(w); if (!(w > 0)) return null; var B = _R ? _R.bands : BANDS, O = _R ? _R.overBand : OVER[0]; for (var i = 0; i < B.length; i++) if (w <= B[i][0]) return { p: B[i][1], lab: B[i][2] || ('≤' + (B[i][0] / 1000) + ' kg') }; return { p: O, lab: 'over ' + (B.length ? (B[B.length - 1][0] / 1000) + ' kg' : 'band') }; }
  /* Settings mapping: Access postage that equals an old band rate (within accessMapTol, default 0.5p) is used at the new rate.
     Raw Access 'Postage Cost' is left unchanged on the row (accessPc). Applied in postInfo, so fromAccess + decideAll
     (dashboard Pricing tab and the nightly refresh_and_publish / build_pricing path) pick it up automatically. */
  function accessMapFrom(o, d) {
    o = o || {}; d = d || DEFAULT_RULES;
    if (Array.isArray(o.accessMap)) return o.accessMap;
    var pairs = [], i, a, b;
    for (i = 1; i <= 5; i++) {
      a = num(o['accessMap' + i + 'old']); b = num(o['accessMap' + i + 'new']);
      if (a != null && b != null) pairs.push([a, b]);
    }
    return pairs.length ? pairs : (d.accessMap || []);
  }
  function accessMapOf() {
    var r = _R || DEFAULT_RULES;
    return { map: r.accessMap || DEFAULT_RULES.accessMap || [], tol: r.accessMapTol != null ? r.accessMapTol : (DEFAULT_RULES.accessMapTol != null ? DEFAULT_RULES.accessMapTol : 0.005) };
  }
  function mapAccessPostage(p) {
    p = num(p);
    if (p == null || !(p > 0)) return { p: p, mapped: false };
    var M = accessMapOf(), tol = M.tol != null ? M.tol : 0.005, i, old, neu;
    for (i = 0; i < M.map.length; i++) {
      old = num(M.map[i][0]); neu = num(M.map[i][1]);
      if (old != null && neu != null && Math.abs(p - old) <= tol + 1e-12) return { p: neu, mapped: true, from: old };
    }
    return { p: p, mapped: false };
  }
  /* SPECIAL fixed postage (before Access / weight). Matched on the Variant description text (+ SKU / variant code prefix).
     Source: Karimulla's handwritten note 2 Nov 2026 (KEEP/special_postage_note_2026-11-02.jpg) and the seniors' list
     implemented 26 Oct 2026 (china_products_2026-10-26/work/pricing/build_v3.py). Fixed amounts are never multiplied by pack qty. */
  var SPECIAL = { petXL: ['Pet bed XL/XXL', 3.3], hbs2: ['High back stool X2', 3.3], hbs3: ['High back stool X3+', 8], fab2: ['Fabric folding chair X2', 4.3], fab3: ['Fabric folding chair X3+', 8],
    std2: ['Standard folding chair X2', 3.3], std3: ['Standard folding chair X3+', 8], suit20: ['Suitcase small 20in', 3.3], suitL: ['Suitcase 24in/28in', 8], suitSet: ['Suitcase set (large rate)', 8],
    tree8: ['Xmas tree 8ft', 3.3], tree10: ['Xmas tree 10ft', 4.3], tar1015: ['Tarpaulin 10x15m', 3.3], tar1215: ['Tarpaulin 12x15m', 3.3], tar1520: ['Tarpaulin 15x20m', 8],
    baby: ['Baby high chair', 3.3], guitar: ['Guitar', 3.3], bbq: ['BBQ table', 3.3], airer: ['3-tier clothes airer', 3.3], fryer: ['9L air fryer', 4.3], bin: ['Wheelie bin 240L', 27] };
  var HEAVY = [[20000, 14, '15-20kg'], [25000, 15, '20-25kg'], [30000, 17, '25-30kg']], HEAVY_FROM = 15200;
  function codes(c) { return (Array.isArray(c) ? c : [c]).filter(function (x) { return x != null && x !== ''; }).map(function (x) { return String(x).trim().toUpperCase(); }); }
  function pre(cs, re) { for (var i = 0; i < cs.length; i++) if (re.test(cs[i])) return true; return false; }
  function specialRule(title, code) {
    var t = title == null ? '' : String(title), l = t.toLowerCase(), cs = codes(code), n = packN(t) || 1, m;
    var pk = function (two, three) { return n >= 3 ? three : n === 2 ? two : null; };
    if (pre(cs, /^240-(BLK|BRW|GRE)-BIN/) || /^\s*240\s*l\s+(wheelie\s+)?bin\b/i.test(t)) return 'bin';
    if ((m = l.match(/\b(?:xmas|christmas)\s+tree\s+(\d+)\s*(?:ft|feet|foot)\b/)) || (m = cs.join(' ').match(/(?:^|\s)XMA-TRE-[A-Z]+-(\d+)FT/))) return m[1] === '8' ? 'tree8' : m[1] === '10' ? 'tree10' : null;
    if (/\b(?:pet|dog)\s+bed\b/.test(l) && /\b(?:xxl|xl|xlg)\b/.test(l)) return 'petXL';
    if (/high\s+back\s+stool/.test(l) || pre(cs, /^HOM074/)) return pk('hbs2', 'hbs3');
    if (/fabric\s+folding\s+chair/.test(l) || pre(cs, /^(FAB-FOL|HOM041)/)) return pk('fab2', 'fab3');
    if (/standard\s+folding\s+chair/.test(l) || pre(cs, /^HOM04[23]/)) return pk('std2', 'std3');
    if (/suitcase|luggage/.test(l)) {
      if (/\bset\b|\b\d+\s*pc\b|\d\s*\+\s*\d/.test(l)) return 'suitSet';
      var sz = [], re = /\b(\d{2})\s*(?:-|\s)?\s*(?:inch|in\b|["”])/g, q; while ((q = re.exec(l))) sz.push(q[1]);
      if (!sz.length) { var cj = cs.join(' '); if (/-20I-/.test(cj)) sz.push('20'); if (/-24I-/.test(cj)) sz.push('24'); if (/-28I-/.test(cj)) sz.push('28'); }
      if (sz.length && sz.every(function (x) { return x === '20'; })) return 'suit20';
      if (sz.some(function (x) { return x === '24' || x === '28'; })) return 'suitL';
      return null;
    }
    if (/tarpaulin|\btarp\b/.test(l) && (m = l.match(/(\d+)\s*m?\s*x\s*(\d+)\s*m\b/))) { var a = Math.min(+m[1], +m[2]), b = Math.max(+m[1], +m[2]);
      return a === 10 && b === 15 ? 'tar1015' : a === 12 && b === 15 ? 'tar1215' : a === 15 && b === 20 ? 'tar1520' : null; }
    if (/baby\s+high\s+chair/.test(l) || pre(cs, /^BAB-HIG/)) return 'baby';
    if (pre(cs, /^GUI-TAR/)) return 'guitar';
    if (pre(cs, /^SIL-BBQ-TAB/)) return 'bbq';
    if (/airer/.test(l) && /3[\s-]*tier/.test(l)) return 'airer';
    if (pre(cs, /^DUL-9L-AFY/)) return 'fryer';
    return null;
  }
  /* H123 / H063 / H077 = the code after the last '-' of the description (e.g. '... - 888436 - H077'; CH077 does NOT match) */
  function heavyCode(title) { var m = String(title == null ? '' : title).match(/(?:^|-)\s*(H123|H063|H077)\s*$/i); return m ? m[1].toUpperCase() : null; }
  /* full postage decision: {p, src, kind} ; ov = typed postage (wins over everything) */
  function postInfo(pc, w, title, code, ov) {
    var o = num(ov); if (o != null && o >= 0 && ov !== '') return { p: o, src: 'Your postage', kind: 'your' };
    var k = specialRule(title, code); if (k) return { p: SPECIAL[k][1], src: 'Special: ' + SPECIAL[k][0], kind: 'special', rule: k };
    var h = heavyCode(title), wt = num(w);
    if (h && wt > HEAVY_FROM && wt <= HEAVY[HEAVY.length - 1][0]) for (var i = 0; i < HEAVY.length; i++) if (wt <= HEAVY[i][0]) return { p: HEAVY[i][1], src: 'DPD ' + h + ' ' + HEAVY[i][2], kind: 'heavy' };
    var p = num(pc); if (p != null && p > 0) {
      var m = mapAccessPostage(p), src = 'Access postage';
      if (m.mapped) src += ' £' + rnd(p, 2).toFixed(2) + ' at the new rate £' + rnd(m.p, 2).toFixed(2);
      if (h) src += ' (' + h + ')';
      return { p: m.p, src: src, kind: 'access', accessMapped: !!m.mapped };
    }
    var b = band(w); return b ? { p: b.p, src: (b.p >= 8 && b.p <= 10.5 ? 'DPD ' : 'Weight band ') + b.lab + (packN(title) ? ' (pack weight, one parcel)' : ''), kind: 'band' } : { p: null, src: 'No postage or weight', kind: 'none' };
  }
  /* postage: (pc, w) = Access / weight only (old callers); (pc, w, title, code[, typed]) = all rules incl. special */
  function postage(pc, w, title, code, ov) { return postInfo(pc, w, title, code, ov).p; }
  function postageSrc(pc, w, title, code, ov) { return postInfo(pc, w, title, code, ov).src; }
  function isChina(sup) { return /ashian/i.test(sup || ''); }
  function multOf(sup) { return isChina(sup) ? ASHIAN : OTHER; }
  /* costs that do not depend on price: cost x mult + postage + collab */
  function fixedCost(a, q) { q = q == null ? 1 : q; return (a.cost * a.mult + a.post + (num(a.collab) || 0)) * q; }
  /* profit for amt = selling amount of q units. a = {cost, mult, post, collab}
     returns fee, company cost, total cost, exact profit (pr), profit rounded to the penny (profit), profit % on cost (pc) */
  function calc(a, amt, q) {
    q = q == null ? 1 : q; var col = (num(a.collab) || 0) * q, cost = a.cost * q, company = cost * (a.mult - 1), post = a.post * q;
    var feeAmt = feeOf() * amt;
    var total = cost + company + feeAmt + post + col, pr = r6(amt - total);
    return { cost: cost, company: company, fee: feeAmt, post: post, collab: col, total: total, pr: pr, profit: rnd(pr, 2), pc: cost > 0 ? pr / cost : null };
  }
  /* lowest price giving profit >= f x cost, rounded UP to the penny */
  /* floors / minimum prices round UP to the penny (never under the %); caps round DOWN (never over the %) */
  function priceFor(a, f) { return ceil2((a.cost * a.mult + a.post + (num(a.collab) || 0) + f * a.cost) / (1 - feeOf())); }
  function priceMax(a, f) { return floor2((a.cost * a.mult + a.post + (num(a.collab) || 0) + f * a.cost) / (1 - feeOf())); }
  /* floor price: China = round up; UK = round up but never above the 80% cap (only bites when floor and cap are both 80%) */
  function floorPrice(a, f, china) { var p = priceFor(a, f); return china ? p : Math.min(p, priceMax(a, ukMaxOf())); }
  /* floor % on cost: China 100%; UK sold in last 30 days 50%; UK no sales by cost <1 80%, <5 70%, <10 60%, else 50%.
     Tab 5 Margin-too-low UK uses a 60% floor (minimum 65%) for that optional cut only – see bq_book.js. */
  function floorOf(china, sales30, cost) {
    if (!_R) {
      if (china) return { f: CHINA_FLOOR, why: 'China product · 100% on cost' };
      if (sales30 > 0) return { f: 0.5, why: 'sold in the last 30 days' };
      return cost < 1 ? { f: 0.8, why: 'no sales lately · cost under £1' } : cost < 5 ? { f: 0.7, why: 'no sales lately · cost £1–£4.99' } : cost < 10 ? { f: 0.6, why: 'no sales lately · cost £5–£9.99' } : { f: 0.5, why: 'no sales lately · cost £10+' };
    }
    var R = _R;
    if (china) return { f: R.chinaFloor, why: 'China product · ' + Math.round(R.chinaFloor * 100) + '% on cost' };
    if (sales30 > 0) return { f: R.ukSoldFloor, why: 'sold in the last 30 days' };
    return cost < R.cost1 ? { f: R.ukBand1, why: 'no sales lately · cost under £' + R.cost1 } : cost < R.cost5 ? { f: R.ukBand5, why: 'no sales lately · cost under £' + R.cost5 } : cost < R.cost10 ? { f: R.ukBand10, why: 'no sales lately · cost under £' + R.cost10 } : { f: R.ukBandRest, why: 'no sales lately · cost £' + R.cost10 + '+' };
  }
  /* multi-pack: title starts with a number > 1 then 'x' (same as =IFERROR(--LEFT(C,SEARCH("x",C)-1)>1,FALSE)) */
  function packN(title) {
    var t = title == null ? '' : String(title), i = t.toLowerCase().indexOf('x'); if (i < 0) return null;
    var p = t.slice(0, i).trim(); if (!/^[+-]?((\d{1,3}(,\d{3})+|\d+)(\.\d*)?|\.\d+)$/.test(p)) return null;
    var v = parseFloat(p.replace(/,/g, '')); return v > 1 ? v : null;
  }
  /* Check-postage flag (Karimulla 9 Nov 2026): only multi-packs with Access Weight >= 14999g
     (or missing/blank weight) need review. Light multi-packs (<14999g) use normal postage and
     go to the upload. Special postage rules are unchanged (they still win in postInfo). Singles
     are never flagged here, even over 30kg. Weight is grams. */
  function checkPost(title, w) {
    var n = packN(title), out = [], wt = num(w);
    if (n) {
      if (wt == null || !(wt > 0)) out.push('Multi-pack x' + n + ' (no weight)');
      else if (wt >= packGramsOf()) out.push('Multi-pack x' + n + ' (≥' + packGramsOf() + 'g)');
    }
    return out.join(' | ');
  }
  /* ONE row -> price decision. r = {sku,title,ean,cost,price,bb,seller,sup,pc,w,sales,collab,url,your}
     opt = {raise100: include 100+ sales raises in the upload, checkPost: include 'Check postage' rows in the upload} */
  /* Optional penny trim: UK price set by the 80% CAP only (no buy box chase, no floor fix) and the current price is
     at most 5p (and at most 5% of price) above that cap price -> keep current price unless opt.pennyTrims. */
  var TRIM = 'Optional penny trim – kept', TRIM_P = 0.05, TRIM_PCT = 0.05;
  function isTrim(o, raw, cur, bb1) {
    if (o.china || o.win || o.ceil == null || raw !== o.ceil || !(bb1 == null || bb1 > o.ceil)) return false;
    var d = rnd(cur - raw, 2); return d > 0 && d <= TRIM_P + 1e-9 && d <= TRIM_PCT * cur + 1e-9;
  }
  function decide(r, opt) {
    opt = opt || {};
    var cost = num(r.cost), price = num(r.price), bb = num(r.bb), sales = num(r.sales) || 0, your = num(r.your);
    var china = isChina(r.sup), mult = china ? ASHIAN : OTHER, autoPI = postInfo(r.pc, r.w, r.title, [r.sku, r.variant]), PI = postInfo(r.pc, r.w, r.title, [r.sku, r.variant], r.postYour), post = PI.p, seller = (r.seller == null ? '' : String(r.seller)).trim();
    if (!(bb > 0)) bb = null;
    var o = { sku: r.sku, title: r.title || '', ean: r.ean || '', cost: cost, price: price == null ? 0 : price, priceBlank: price == null, bb: bb, seller: bb == null && !seller ? 'No competitor' : seller, sales: sales,
      china: china, mult: mult, post: post, postAuto: autoPI.p, postSrc: PI.src, postKind: PI.kind, postChecked: PI.kind === 'your', accessPc: num(r.pc), collab: num(r.collab) || 0, url: r.url || '', check: checkPost(r.title, r.w), your: your,
      srcPrice: r.srcPrice || '', srcBB: r.srcBB || '', srcSales: r.srcSales || 'Access B n Q 30Days', salesAccess: r.salesAccess == null ? null : num(r.salesAccess), sup: r.sup || '', w: num(r.w), variant: r.variant || '', stock: num(r.stock), liveSeen: r.liveSeen == null ? null : num(r.liveSeen), offerFlag: r.offerFlag || '', accessPrice: r.accessPrice == null ? null : num(r.accessPrice),
      ix: r.ix, win: /diva package/i.test(seller), status: '', rule: '', newp: null, finalp: null, upload: false, why: '' };
    var cur = o.price;
    if (!(cost > 0) || post == null) {
      o.rule = 'NEED YOUR REVIEW – ' + (!(cost > 0) ? 'no cost' : 'no postage or weight'); o.status = 'NEED YOUR REVIEW'; o.finalp = cur; o.why = 'Missing data'; return o;
    }
    var a = { cost: cost, mult: mult, post: post, collab: o.collab };
    o.a = a; o.fixed = fixedCost(a);
    var C = calc(a, cur); o.fee = C.fee; o.company = C.company; o.total = C.total; o.profit = C.profit; o.pr = C.pr; o.pc = C.pc;
    var Fl = floorOf(china, sales, cost); o.floorPct = Fl.f; o.floorWhy = Fl.why; o.floor = floorPrice(a, Fl.f, china); o.ceil = china ? null : priceMax(a, ukMaxOf());
    var bb1 = bb != null ? rnd(bb - 0.01, 2) : null, raw, step = false;
    /* China rules A and B (Karimulla 2 Nov 2026) run BEFORE 'already winning', so they apply winning or not.
       A: under the 100% floor -> raise to the floor price. Every China increase is review only and is never uploaded.
       B: no sales in 30 days -> cut 10% (round down), never below 105% profit on cost. If the price now is already under that 105% price, the lift is review only and is not uploaded. */
    if (china && cur > 0 && C.pc < chinaFloorOf() - 1e-9) {
      raw = o.floor; o.chinaUp = true; o.rule = 'A China under 100% floor – raise to floor';
      o.reason = 'China product at ' + Math.round(C.pc * 100) + '% – raise to 100% floor £' + o.floor.toFixed(2);
    } else if (china && cur > 0 && sales < 1) {
      var stop = priceFor(a, chinaFloorOf() + 0.05);
      o.chinaMin = stop;
      if (rnd(cur, 2) <= rnd(stop, 2)) {
        if (rnd(cur, 2) < rnd(stop, 2) - 0.001) { raw = stop; o.chinaUp = true; o.rule = 'B China 0 sales – 105% is above the price now, review only'; }
        else { raw = 'At 105% on cost – kept'; o.rule = 'B China 0 sales – already at 105% on cost'; }
      } else {
        var cut = floor2(cur * (1 - chinaCutOf()));
        raw = cut < stop ? stop : cut;
        if (!(rnd(raw, 2) < rnd(cur, 2) - 0.001)) { raw = 'At 105% on cost – kept'; o.rule = 'B China 0 sales – already at 105% on cost'; }
        else { o.chinaCut = true; o.rule = cut < stop ? 'B China 0 sales – cut 10%, stopped at 105% on cost' : 'B China 0 sales – cut 10%'; }
      }
      o.reason = 'China, no sales in 30 days – not below 105% on cost (£' + stop.toFixed(2) + ')';
    } else if (o.win) {
      raw = 'Already winning'; o.rule = '1 Already winning – kept';
      if (!china && sales >= RAISE_AT && C.pc < ukMaxOf() - 1e-9) {
        var sp = Math.min(priceFor(a, Math.min(ukMaxOf(), C.pc + RAISE_STEP)), priceMax(a, ukMaxOf()));
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
      else if (bb1 > o.ceil && !(bb1 < cur - 1e-9)) { raw = o.ceil; o.rule = '2 UK sold – capped at 80%'; }
      else { raw = bb1; o.rule = '2 UK sold – 1p under BB'; }
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
      else if (rnd(raw, 2) > rnd(cur, 2) && !(step && opt.raise100 && !china)) o.status = step ? 'Raise 10% – held for review' : 'Raise – held for review';
      else if (isTrim(o, raw, cur, bb1) && !opt.pennyTrims) { o.trim = true; o.status = TRIM; }
      else { if (isTrim(o, raw, cur, bb1)) o.trim = true; o.status = raw; }
    } else o.status = raw;
    o.newp = typeof o.status === 'number' ? o.status : null;
    o.finalp = your != null ? your : (o.newp != null ? o.newp : cur);
    var F = calc(a, o.finalp); o.fprofit = F.profit; o.fpr = F.pr; o.fpc = F.pc;
    o.changed = rnd(o.finalp, 2) !== rnd(cur, 2);
    /* ABSOLUTE SAFETY: a changed price must be > 0, profit > £0 and >= 50% on cost; China rule prices >= 100% */
    if (o.changed) {
      if (!(o.finalp > 0) || F.profit <= 0) { o.why = 'Loss – blocked'; if (your != null) o.status = 'Loss – blocked'; }
      else if (F.pc < safeOf() - 1e-9) { o.why = 'Under 50% – blocked'; if (your != null) o.status = 'Under 50% – blocked'; }
      else if (china && F.pc < chinaFloorOf() - 1e-9) { o.why = 'Under 100% China – blocked'; if (your != null) o.status = 'Under 100% China – blocked'; }
      else if (china && o.finalp > cur + 0.001) { o.why = 'China raise – review only'; if (your != null) o.status = 'Raise – held for review'; }
      else if (o.check && !opt.checkPost && !o.postChecked) o.why = 'Check postage first';
      else if (r.dup) o.why = 'Duplicate SKU';
      else { o.upload = true; o.why = your != null ? 'Your price' : 'Price change'; }
    } else o.why = typeof o.status === 'string' ? o.status : 'No change';
    if (your != null && !/ – blocked$/.test(o.why)) o.status = 'Your price';
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
        sup: g('sup') == null ? '' : String(g('sup')), w: g('w'), pc: g('pc'), sales: g('sales'), url: g('url') == null ? '' : String(g('url')), collab: g('collab'), variant: g('variant') == null ? '' : String(g('variant')), stock: g('stock'),
        srcPrice: 'Access', srcBB: 'Access', ix: j };
      if (ov.sales30) { r.salesAccess = r.sales; r.sales = ov.sales30[r.sku] || 0; r.srcSales = ov.salesLabel || 'B&Q orders'; if (r.sales > 0) nsold++; }
      /* 4 Nov: active offers export (REQUIRED in the pricing run) = the live price. Price now = live offer price (discount price when active today).
         Not in active offers, or Access price differs from the live offer by more than 1p -> flagged, never uploaded. */
      if (ov.offers) {
        var of = ov.offers[r.sku], ap = num(r.price);
        if (!of) r.offerFlag = 'not in the active offers export (' + (ov.offersLabel || 'offers') + ')';
        else {
          var lp = num(of[0]), dp = num(of[1]), td = ov.today || '', dOn = dp != null && dp > 0 && (!of[2] || String(of[2]).slice(0, 10) <= td) && (!of[3] || String(of[3]).slice(0, 10) >= td);
          if (!(Math.abs((lp || 0) - (ap || 0)) <= 0.0100001)) r.offerFlag = 'Access price £' + (ap == null ? '–' : rnd(ap, 2).toFixed(2)) + ' but live offer £' + (lp == null ? '–' : rnd(lp, 2).toFixed(2));
          r.accessPrice = ap; r.price = dOn ? dp : lp; r.srcPrice = (ov.offersLabel || 'Active offers') + (dOn ? ' (discount price)' : '');
        }
      }
      if (!ov.offers && imp[r.sku] != null) { r.price = imp[r.sku]; r.srcPrice = ov.importedLabel || 'Imported'; nimp++; }
      var b = bbm[r.ean];
      if (b && (b.seller || num(b.price) != null)) {
        r.bb = num(b.price); r.seller = b.seller || ''; r.srcBB = ov.bbLabel || 'Buy box run'; nbb++;
        /* 4 Nov: Price now is ALWAYS the Access B&Q_INV.price. If the buy box run saw our own offer at a different price (> 1p), flag it – never use it */
        if (/diva package/i.test(b.seller || '') && num(b.price) > 0 && !(Math.abs(num(b.price) - (num(r.price) || 0)) <= 0.0100001)) { r.liveSeen = num(b.price); nlive++; }
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

  /* ===== BUY BOX suggestion (3 Nov 2026) – one SKU, on top of decide() (same cost, postage, floor and 80% cap).
     o = decide(row) output.  x = {fresh: today's buy box check worked for this EAN, rival: {p, s, d} newest OTHER seller seen holding the box,
     seasonal: Christmas product}.  s = settings (BB_DEFAULT).  Returns {act, sugg, profit, pc, gain, why, need}.
     act: 'Lower to win' | 'Raise' | "Can't win (floor)" | 'Keep' | 'No data'.  sugg is only set for Lower to win / Raise, and is never
     under the floor, never a loss. A raise is never over the UK 80% cap. A CUT to 1p under the competitor, on a UK product with sales, may stay above the cap. 0-sales UK cuts still stop at the cap (checked again at the end – if not, act becomes Keep). */
  var BB_DEFAULT = { step: 0.01, stepPct: 0, minGain: 0.10, raisePct: 0.05, raiseNoSales: false, noStockKeep: true, useStale: false, xmas: true, keepTrees: true };
  /* Christmas trees (XMAS TREE 5/6/7/8/10FT, SKU XMA-TRE-GRE-…): Karimulla 3 Nov 2026 – keep the tree prices as they are (no raise, no lower). Not tree bags / stands / spray. */
  function isXmasTree(title, sku) { return /\b(?:xmas|christmas)\s+tree\s+\d+\s*(?:ft|feet|foot)\b/i.test(String(title || '')) || /^XMA-TRE-GRE-/i.test(String(sku || '')); }
  var XMAS_RE = /\b(christmas|xmas|advent|bauble|baubles|tinsel|nativity|santa|reindeer|snowman|snowflake|festive|stocking)\b/i;
  function isSeasonal(title, sku) { return XMAS_RE.test(String(title || '')) || /^XMA-/i.test(String(sku || '')); }
  function bbStep(bb, s) { var a = num(s.step) || 0, p = num(s.stepPct) || 0; return Math.max(0.01, rnd(Math.max(a, bb * p / 100), 2)); }
  /* Ending in 9 applies only to a price increase. A cut stays on the exact penny (1p under the buy box, or the normal 2dp cut). A 9-ending raise must not go through the cap or the floor. */
  function up9(x) { var c = Math.round(r6(x) * 100); return (c + ((9 - c % 10) + 10) % 10) / 100; }
  /* Highest price ending in 9 that is at or under x. */
  function down9(x) { var c = Math.round(r6(x) * 100); return (c - ((c % 10 - 9 + 10) % 10)) / 100; }
  /* Losing, but already cheaper than the buy box, and the SKU has sold. Raise into [buy box−15p, buy box−10p], highest price ending in 9; if none, buy box−10p. Never over the cap, never under the floor, and only when the result is above the current price. */
  function losingCloser(bb, cur, cap, fl, s) {
    var bb2 = rnd(bb, 2), hi = rnd(bb2 - closeHiOf(s), 2), lo = rnd(bb2 - closeLoOf(s), 2), nine = down9(hi);
    var target = nine + 1e-9 >= lo ? nine : hi;
    if (cap != null && target > cap + 1e-9) {
      var under = down9(cap);
      if (!(under > cur + 1e-9)) return { why: 'Losing – already cheaper, cap' };
      target = under;
    }
    if (!(target > cur + 1e-9)) return { why: 'Losing – already cheaper, no raise above the current price' };
    if (fl != null && target < fl - 1e-9) return { why: 'Losing – already cheaper, at floor' };
    return { price: rnd(target, 2) };
  }
  function end9(p, cur, fl, lim, cap) {
    if (!(p > cur)) return p;
    var c = Math.round(r6(p) * 100), q = c + ((9 - (c % 10) + 10) % 10), v = q / 100;
    if (q === c) return p;
    if (!(v > 0) || v < fl - 1e-9) return p;
    if (cap != null && v > cap + 1e-9) return p;
    if (lim != null && v > rnd(lim, 2) + 1e-9) return p;
    return v;
  }
  function buyBox(o, x, s) {
    s = Object.assign({}, BB_DEFAULT, s || {}); x = x || {};
    var r = { act: 'Keep', sugg: null, profit: null, pc: null, gain: null, why: '', need: null }, g = function (v) { return '£' + rnd(v, 2).toFixed(2); };
    var pc = function (v) { return Math.round(v * 100) + '%'; };
    if (o.dup) { r.why = 'Duplicate SKU row – only the first row is priced'; return r; }
    if (o.offerFlag) { r.act = 'Price check'; r.why = 'Price check: ' + o.offerFlag + ' – not in the upload'; return r; }
    if (!o.a) { r.act = 'No data'; r.why = 'No cost or postage in Access – fix the data first'; return r; }
    var a = o.a, cur = rnd(o.price, 2), fl = o.floor, cap = o.china ? null : o.ceil;
    if (!(cur > 0)) { r.act = 'No data'; r.why = 'No current price on the listing'; return r; }
    if (!x.fresh && !s.useStale) { r.act = 'No data'; r.why = "Today's buy box check failed for this product – not using older data"; return r; }
    if (o.liveSeen != null) { r.act = 'Price check'; r.why = 'Price check: buy box run saw £' + rnd(o.liveSeen, 2).toFixed(2) + ' but Access price is ' + g(cur) + ' – not in the upload'; return r; }
    var seller = String(o.seller || '').trim(), bb = o.bb;
    if (!o.win && !(bb > 0)) { r.act = 'No data'; r.why = 'No buy box price found'; return r; }
    if (s.noStockKeep && o.stock != null && o.stock <= 0) { r.why = 'No free stock – change the price when stock is back'; return r; }
    if (s.keepTrees && isXmasTree(o.title, o.sku)) { r.why = 'Christmas tree – price kept as it is (your decision 3 Nov)'; return r; }
    var C0 = calc(a, cur), set = function (act, p, why, lim, fl9) { p = end9(p, cur, fl9 == null ? fl : fl9, lim, cap); var C = calc(a, p); r.act = act; r.sugg = rnd(p, 2); r.profit = C.profit; r.pc = C.pc; r.gain = rnd(C.pr - C0.pr, 2); r.why = why; };
    if (!o.win) {
      if (cur < rnd(bb, 2)) {
        if (!(o.sales >= 1)) { r.why = 'Losing – already cheaper, 0 sales: kept'; return r; }
        var closer = losingCloser(bb, cur, cap, fl, s);
        if (closer.price == null) { r.why = closer.why; return r; }
        var Cc = calc(a, closer.price);
        if (!(Cc.profit > 0) || Cc.pc < safeOf() - 1e-9 || (o.china && Cc.pc < chinaFloorOf() - 1e-9)) { r.why = 'Losing – already cheaper, at floor'; return r; }
        r.act = 'Raise'; r.sugg = closer.price; r.profit = Cc.profit; r.pc = Cc.pc; r.gain = rnd(Cc.pr - C0.pr, 2);
        r.why = 'Losing – already cheaper: raise to 10–15p under buy box, ends in 9';
        return r;
      }
      var need = rnd(bb - bbStep(bb, s), 2), t = need, capped = false; r.need = need;
      /* 11 Nov 2026: UK with sales – a CUT to 1p under the competitor is not clamped to the 80% cap.
         The cap still blocks raises. 0-sales UK still clamps to the cap. China has no cap. */
      var soldCut = !o.china && o.sales >= 1 && t < cur - 1e-9;
      if (cap != null && t > cap && !soldCut) { t = cap; capped = true; }
      if (t < fl) { r.act = "Can't win (floor)"; r.why = 'To win we need ' + g(need) + ' (under ' + seller + ' ' + g(bb) + '), but our floor is ' + g(fl) + ' (' + pc(o.floorPct) + ' on cost)'; return r; }
      set('Lower to win', t, capped ? 'Under ' + seller + ' ' + g(bb) + ' at our 80% cap ' + g(t) : (need === rnd(bb - 0.01, 2) ? '1p' : g(bb - need)) + ' under ' + seller + ' ' + g(bb) + '; floor ' + g(fl), bb);
    } else {
      /* 10 Nov 2026: a product with 0 B&Q sales is raised only when profit is under 50% on cost, and only up to that 50% price. The 80/70/60% bands stay the floor for cuts, not for this raise. Products with sales still rise to their floor. */
      var zeroUk = !o.china && !(o.sales >= 1);
      var raiseAt = zeroUk ? (_R && _R.zeroSalesRaise != null ? _R.zeroSalesRaise : SAFE_MIN) : o.floorPct;
      var raisePx = zeroUk ? priceFor(a, (_R && _R.zeroSalesRaise != null ? _R.zeroSalesRaise : SAFE_MIN)) : fl;
      if (C0.pc < raiseAt - 1e-9) { set('Raise', raisePx, zeroUk ? '0 B&Q sales, profit under 50% on cost – raise only to 50%' : 'We win, but ' + pc(C0.pc) + ' is under our ' + pc(o.floorPct) + ' floor – raise to the floor', x.rival && x.rival.p > cur ? x.rival.p : null, zeroUk ? raisePx : null); }
      else if (zeroUk && C0.pc < o.floorPct - 1e-9) { r.why = '0 B&Q sales: profit already >= 50%, not raised'; return r; }
      else if (cap != null && cur >= cap) { r.why = 'We win at or above the 80% cap (' + g(cap) + ') – keep'; return r; }
      else if (!(o.sales >= 1) && !s.raiseNoSales) { r.why = 'We win but sold 0 in 30 days – a higher price will not help'; return r; }
      else {
        var rv = x.rival, t2, why;
        if (rv && rv.p > cur) { t2 = rnd(rv.p - bbStep(rv.p, s), 2); why = rv.s + ' was seen at ' + g(rv.p) + ' (' + rv.d + ') – go to ' + (t2 === rnd(rv.p - 0.01, 2) ? '1p' : g(rv.p - t2)) + ' under them'; }
        else if (rv) { r.why = 'We win, but ' + rv.s + ' was seen at ' + g(rv.p) + ' (' + rv.d + '), not above us – hold'; return r; }
        else if (s.xmas && x.seasonal) { r.why = 'Christmas mode: we win a seasonal product – hold the box, no blind raise'; return r; }
        else { t2 = floor2(cur * (1 + (num(s.raisePct) || 0))); why = 'We win and no other seller has been seen – try +' + (num(s.raisePct) * 100).toFixed(0) + '%'; }
        if (cap != null && t2 > cap) { t2 = cap; why += ' (stops at the 80% cap ' + g(cap) + ')'; }
        if (!(t2 > cur)) { r.why = 'We win – no room to raise'; return r; }
        var gain = rnd(calc(a, t2).pr - C0.pr, 2);
        if (gain < (num(s.minGain) || 0) - 1e-9) { r.why = 'We win – a raise would add only ' + g(gain) + ' profit (under the ' + g(s.minGain) + ' minimum)'; return r; }
        set('Raise', t2, why, rv && rv.p > cur ? rv.p : null);
      }
    }
    /* If a UK suggestion would sit under its own floor, lift it to the floor price (rounded up to the penny).
       Only when that keeps a raise a raise (or a cut a cut), stays at/under the cap, and is not a loss. China unchanged. */
    if (r.sugg != null && floorLiftOf() && !o.china && fl != null && r.sugg < fl - 1e-9) {
      var lift = fl;
      if (cap != null && lift > cap + 1e-9) lift = cap;
      var CLift = calc(a, lift);
      var stayRaise = (r.act === 'Raise' || r.sugg > cur + 1e-9) && lift > cur + 1e-9;
      var stayCut = (r.act === 'Lower to win' || r.sugg < cur - 1e-9) && lift < cur - 1e-9;
      if ((stayRaise || stayCut) && CLift.profit > 0 && CLift.pc >= safeOf() - 1e-9 && (cap == null || lift <= cap + 1e-9 || stayCut)) {
        r.sugg = rnd(lift, 2);
        r.profit = CLift.profit;
        r.pc = CLift.pc;
        r.gain = rnd(CLift.pr - C0.pr, 2);
        if (stayRaise && !(o.sales >= 1)) r.why = '0 B&Q sales, profit under 50% on cost – raise to the floor (just at/above the floor %)';
        else r.why = (r.why || '') + ' – lifted to the floor';
      }
    }
    /* absolute safety: never under the floor (when floorLift is on), never over the cap, never a loss, never under 50% (China 100%) */
    if (r.sugg != null) {
      var minPx = (!floorLiftOf() && r.act === 'Raise' && !o.china && !(o.sales >= 1)) ? priceFor(a, (_R && _R.zeroSalesRaise != null ? _R.zeroSalesRaise : SAFE_MIN)) : fl;
      var overCapRaise = cap != null && r.sugg > up9(cap) + 1e-9 && !(r.sugg < cur - 1e-9);
      var bad = !(r.sugg > 0) || !(r.profit > 0) || r.sugg < minPx - 1e-9 || overCapRaise || r.pc < safeOf() - 1e-9 || (o.china && r.pc < chinaFloorOf() - 1e-9);
      if (bad) { r.act = 'Keep'; r.why = 'Safety check stopped ' + g(r.sugg) + ' – kept'; r.sugg = null; r.profit = null; r.pc = null; r.gain = null; }
      else if (r.sugg === cur) { r.act = 'Keep'; r.why = 'Already at the suggested price'; r.sugg = null; r.profit = null; r.pc = null; r.gain = null; }
    }
    return r;
  }

  /* today's buy box scrape (doc.bbScrape from buybox_data.py) -> {map for fromAccess ov.bb, fresh: {ean:1} checked OK today, label}.
     Failed checks (HTTP 503/500, no product link, no seller) are NOT in the map and NOT fresh. A scrape older than the Access file is ignored. */
  function bbFromScrape(sc, accessDate) {
    var out = { map: {}, fresh: {}, n: 0, failed: 0, label: '', stale: false };
    if (!sc || !sc.rows) return out;
    /* a buy box check up to 1 day older than the Access file still counts (same rule as reload_access.sh) */
    var d1 = accessDate ? new Date(Date.parse(String(accessDate).slice(0, 10) + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10) : '';
    if (accessDate && String(sc.date) < d1) { out.stale = true; return out; }
    var rows = [];
    sc.rows.forEach(function (r) { var e = eanOf(r.ean); if (!e) return; if (r.ok) { out.fresh[e] = 1; rows.push({ ean: e, seller: r.seller, price: r.price, fetched: sc.date + 'T12:00:00' }); } else out.failed++; });
    var M = bbMap(rows, accessDate && accessDate < sc.date ? accessDate : null); out.map = M.map; out.n = M.n;
    out.label = 'Buy box check ' + sc.date; return out;
  }
  function buyBoxAll(rows, fresh, rivals, s) {
    fresh = fresh || {}; rivals = rivals || {};
    return rows.map(function (o) { var b = buyBox(o, { fresh: !!fresh[o.ean], rival: rivals[o.ean] || null, seasonal: isSeasonal(o.title, o.sku) }, s); b.o = o; return b; });
  }
  return { FEE: FEE, sales30: sales30, bbMap: bbMap, ukTime: ukTime, fromAccess: fromAccess, eanOf: eanOf, HDR: HDR, ASHIAN: ASHIAN, OTHER: OTHER, UK_MAX: UK_MAX, SAFE_MIN: SAFE_MIN, CHINA_FLOOR: CHINA_FLOOR, CHINA_CUT: CHINA_CUT, RAISE_AT: RAISE_AT, BANDS: BANDS, OVER: OVER,
    num: num, rnd: rnd, ceil2: ceil2, band: band, mapAccessPostage: mapAccessPostage, accessMapFrom: accessMapFrom, postage: postage, postageSrc: postageSrc, postInfo: postInfo, specialRule: specialRule, heavyCode: heavyCode, SPECIAL: SPECIAL, HEAVY: HEAVY, isChina: isChina, multOf: multOf, fixedCost: fixedCost,
    TRIM: TRIM, end9: end9, DEFAULT_RULES: DEFAULT_RULES, rulesOf: rulesOf, rulesDiffer: rulesDiffer, useRules: useRules, clearRules: clearRules, feeOf: feeOf, ukMaxOf: ukMaxOf, safeOf: safeOf, chinaFloorOf: chinaFloorOf, packGramsOf: packGramsOf, floorLiftOf: floorLiftOf, calc: calc, priceFor: priceFor, priceMax: priceMax, floorPrice: floorPrice, floor2: floor2, floorOf: floorOf, packN: packN, checkPost: checkPost, decide: decide, decideAll: decideAll, buyBox: buyBox, buyBoxAll: buyBoxAll, bbFromScrape: bbFromScrape, BB_DEFAULT: BB_DEFAULT, isSeasonal: isSeasonal, isXmasTree: isXmasTree, bbStep: bbStep, CHECK_G: 14999, VERSION: 'bq_price v9 2026-11-11 floor lift to own floor' };
});
