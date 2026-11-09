/* bq_price.js – THE ONE shared B&Q price / profit engine (Diva Packages).
   Used by: Sales + Orders (app.js), the Pricing tab (pricing_v1.js) and the Python Excel builder (via node).
   Maths (Diva Master File + Karimulla's rules):
     total cost = cost + company cost (cost x1 Ashian Homeware, x0.5 others) + 15% of price + postage + collab fee (blank = 0)
     profit = price - total cost      profit % = profit / estimated cost
     postage (in this order): 1 your typed postage; 2 special fixed rules (Karimulla's seniors' list, 26 Oct + 2 Nov 2026 notes, see SPECIAL);
       3 description code H123/H063/H077 over 15.2kg: DPD 14 (<=20kg) / 15 (<=25kg) / 17 (<=30kg); 4 Access 'Postage Cost' if > 0;
       5 weight band on the (total pack) weight: <=2000g 1.75, <=15200g 2.30, <=20000g 8, <=25000g 9, <=30000g 10.50, else 15. A multi-pack is ONE parcel. Check-postage only for multi-packs with weight >=14999g (or missing weight).
   No data and no keys in this file. */
(function (root, f) { var m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BQP = m; })(this, function () {
  'use strict';
  var FEE = 0.15, ASHIAN = 2, OTHER = 1.5, UK_MAX = 0.8, CHINA_FLOOR = 1, SAFE_MIN = 0.5, RAISE_AT = 100, RAISE_STEP = 0.1, CHINA_CUT = 0.1;
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
    var p = num(pc); if (p != null && p > 0) return { p: p, src: 'Access postage' + (h ? ' (' + h + ')' : ''), kind: 'access' };
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
  /* floor % on cost: China 100%; UK sold in last 30 days 50%; UK no sales by cost <1 80%, <5 70%, <10 60%, else 50%.
     Tab 5 Margin-too-low UK uses a 60% floor (minimum 65%) for that optional cut only – see bq_book.js. */
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
  /* Check-postage flag (Karimulla 9 Nov 2026): only multi-packs with Access Weight >= 14999g
     (or missing/blank weight) need review. Light multi-packs (<14999g) use normal postage and
     go to the upload. Special postage rules are unchanged (they still win in postInfo). Singles
     are never flagged here, even over 30kg. Weight is grams. */
  function checkPost(title, w) {
    var n = packN(title), out = [], wt = num(w);
    if (n) {
      if (wt == null || !(wt > 0)) out.push('Multi-pack x' + n + ' (no weight)');
      else if (wt >= 14999) out.push('Multi-pack x' + n + ' (≥14999g)');
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
    var Fl = floorOf(china, sales, cost); o.floorPct = Fl.f; o.floorWhy = Fl.why; o.floor = floorPrice(a, Fl.f, china); o.ceil = china ? null : priceMax(a, UK_MAX);
    var bb1 = bb != null ? rnd(bb - 0.01, 2) : null, raw, step = false;
    /* China rules A and B (Karimulla 2 Nov 2026) run BEFORE 'already winning', so they apply winning or not.
       A: under the 100% floor -> raise to the floor price (held for review unless opt.chinaRaise).
       B: no sales in 30 days and above floor +1p -> cut 10% (round down), never to/below the floor: stops at floor +1p. */
    if (china && cur > 0 && C.pc < CHINA_FLOOR - 1e-9) {
      raw = o.floor; o.chinaUp = true; o.rule = 'A China under 100% floor – raise to floor';
      o.reason = 'China product at ' + Math.round(C.pc * 100) + '% – raise to 100% floor £' + o.floor.toFixed(2);
    } else if (china && cur > 0 && sales < 1) {
      var stop = rnd(o.floor + 0.01, 2);
      if (rnd(cur, 2) <= stop) { raw = 'Just above floor – kept'; o.rule = 'B China 0 sales – at floor +1p, kept'; }
      else {
        var cut = floor2(cur * (1 - CHINA_CUT)); o.chinaCut = true;
        if (cut <= o.floor) { raw = stop; o.rule = 'B China 0 sales – cut 10%, stopped at floor +1p'; } else { raw = cut; o.rule = 'B China 0 sales – cut 10%'; }
        o.reason = 'China, no sales in 30 days – cut 10% (stops just above 100% floor £' + o.floor.toFixed(2) + ')';
      }
    } else if (o.win) {
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
      else if (rnd(raw, 2) > rnd(cur, 2) && !(step && opt.raise100) && !(o.chinaUp && opt.chinaRaise)) o.status = step ? 'Raise 10% – held for review' : 'Raise – held for review';
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
      else if (F.pc < SAFE_MIN - 1e-9) { o.why = 'Under 50% – blocked'; if (your != null) o.status = 'Under 50% – blocked'; }
      else if (china && F.pc < CHINA_FLOOR - 1e-9) { o.why = 'Under 100% China – blocked'; if (your != null) o.status = 'Under 100% China – blocked'; }
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
     under the floor, never over the UK 80% cap, never a loss (checked again at the end – if not, act becomes Keep). */
  var BB_DEFAULT = { step: 0.01, stepPct: 0, minGain: 0.10, raisePct: 0.05, raiseNoSales: false, noStockKeep: true, useStale: false, xmas: true, keepTrees: true };
  /* Christmas trees (XMAS TREE 5/6/7/8/10FT, SKU XMA-TRE-GRE-…): Karimulla 3 Nov 2026 – keep the tree prices as they are (no raise, no lower). Not tree bags / stands / spray. */
  function isXmasTree(title, sku) { return /\b(?:xmas|christmas)\s+tree\s+\d+\s*(?:ft|feet|foot)\b/i.test(String(title || '')) || /^XMA-TRE-GRE-/i.test(String(sku || '')); }
  var XMAS_RE = /\b(christmas|xmas|advent|bauble|baubles|tinsel|nativity|santa|reindeer|snowman|snowflake|festive|stocking)\b/i;
  function isSeasonal(title, sku) { return XMAS_RE.test(String(title || '')) || /^XMA-/i.test(String(sku || '')); }
  function bbStep(bb, s) { var a = num(s.step) || 0, p = num(s.stepPct) || 0; return Math.max(0.01, rnd(Math.max(a, bb * p / 100), 2)); }
  /* 4 Nov: every changed price ends in 9p – rises round UP to …9, cuts round DOWN to …9; must stay under lim (buy box / rival), at or under cap, at or above floor, else keep the unrounded price */
  /* the cap allows only the ending-9 overshoot: cap rounded up to the next …9 (4 Nov user rule) */
  function up9(x) { var c = Math.round(r6(x) * 100); return (c + ((9 - c % 10) + 10) % 10) / 100; }
  function end9(p, cur, fl, lim, cap) {
    var c = Math.round(r6(p) * 100), q = p > cur ? c + ((9 - c % 10) + 10) % 10 : c - ((c % 10 - 9 + 10) % 10), v = q / 100;
    if (q === c) return p;
    if (p > cur) return v > 0 ? v : p; /* 4 Nov user rule: rises ALWAYS round up to the next …9, even a few pence over the cap or limit */
    if (v < fl - 1e-9 || (lim != null && v > rnd(lim, 2) - 0.005) || (cap != null && v > cap + 1e-9) || !(v > 0)) return p;
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
    var C0 = calc(a, cur), set = function (act, p, why, lim) { p = end9(p, cur, fl, lim, cap); var C = calc(a, p); r.act = act; r.sugg = rnd(p, 2); r.profit = C.profit; r.pc = C.pc; r.gain = rnd(C.pr - C0.pr, 2); r.why = why; };
    if (!o.win) {
      if (cur < rnd(bb, 2)) { r.why = 'We are already cheaper (' + g(cur) + ') than ' + seller + ' (' + g(bb) + ') – B&Q picked them for another reason'; return r; }
      var need = rnd(bb - bbStep(bb, s), 2), t = need, capped = false; r.need = need;
      if (cap != null && t > cap) { t = cap; capped = true; }
      if (t < fl) { r.act = "Can't win (floor)"; r.why = 'To win we need ' + g(need) + ' (under ' + seller + ' ' + g(bb) + '), but our floor is ' + g(fl) + ' (' + pc(o.floorPct) + ' on cost)'; return r; }
      set('Lower to win', t, capped ? 'Under ' + seller + ' ' + g(bb) + ' at our 80% cap ' + g(t) : (need === rnd(bb - 0.01, 2) ? '1p' : g(bb - need)) + ' under ' + seller + ' ' + g(bb) + '; floor ' + g(fl), bb);
    } else {
      if (C0.pc < o.floorPct - 1e-9) { set('Raise', fl, 'We win, but ' + pc(C0.pc) + ' is under our ' + pc(o.floorPct) + ' floor – raise to the floor', x.rival && x.rival.p > cur ? x.rival.p : null); }
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
    /* absolute safety: never under the floor, never over the cap, never a loss, never under 50% (China 100%) */
    if (r.sugg != null) {
      var bad = !(r.sugg > 0) || !(r.profit > 0) || r.sugg < fl - 1e-9 || (cap != null && r.sugg > up9(cap) + 1e-9) || r.pc < SAFE_MIN - 1e-9 || (o.china && r.pc < CHINA_FLOOR - 1e-9);
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
    num: num, rnd: rnd, ceil2: ceil2, band: band, postage: postage, postageSrc: postageSrc, postInfo: postInfo, specialRule: specialRule, heavyCode: heavyCode, SPECIAL: SPECIAL, HEAVY: HEAVY, isChina: isChina, multOf: multOf, fixedCost: fixedCost,
    TRIM: TRIM, end9: end9, calc: calc, priceFor: priceFor, priceMax: priceMax, floorPrice: floorPrice, floor2: floor2, floorOf: floorOf, packN: packN, checkPost: checkPost, decide: decide, decideAll: decideAll, buyBox: buyBox, buyBoxAll: buyBoxAll, bbFromScrape: bbFromScrape, BB_DEFAULT: BB_DEFAULT, isSeasonal: isSeasonal, isXmasTree: isXmasTree, bbStep: bbStep, CHECK_G: 14999, VERSION: 'bq_price v5 2026-11-09 pack14999 checks' };
});
