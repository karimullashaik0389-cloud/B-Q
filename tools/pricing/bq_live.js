/* Live pricing workbook. Yellow cells are the only inputs. Every profit, suggestion,
   Combined row and Final upload price is a formula matched by SKU. No macros.
   Blank input = no opinion. 0 postage is a real input. Two different numbers for one SKU = CONFLICT (neither is chosen). */
(function (root, f) { var m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.BQLive = m; })(this, function () {
  'use strict';
  var M = '£#,##0.00', PC = '0.0%', IN = '#,##0', YESF = '0;-0;0;@';
  var T1 = '1 All', T2 = '2 Winning in range', T3 = '3 Winning 0 sales', T4 = '4 Can win buy box', T5 = '5 Margin too low', T6 = '6 Combined upload', TC = 'China raises (review only)', T7A = '7a Final upload UK', T7B = '7b Final upload China', T8 = '8 Sells elsewhere not B&Q', T9 = '9 China 0 sales – listing check', T_LOSE = 'Losing although cheaper', T_CANT = "Losing – can't win above floor", T_FIX = 'Fix before it comes back', START = 'Start here', CALC = '_Calc', SET = '_Set';
  /* review-tab yellow inputs after the redesign: O postage review, T selling-price review, J your price, P include override */
  var SRC = [[T1, 'AO', 'AP', 'AQ', 'AR'], [T2, 'O', 'T', 'J', 'P'], [T3, 'O', 'T', 'J', 'P'], [T4, 'O', 'T', 'J', 'P'], [T5, 'O', 'T', 'J', 'P'], [T6, 'O', 'T', 'J', 'P'], [TC, 'O', 'T', 'J', 'P']];
  function L(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var t = String(v).replace(/[£,\s\u00a0]/g, ''); return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? +t : null; }
  function rnd2(n) { return Math.round(n * 100) / 100; }
  function xDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return null; return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000); }
  function moneyEq(a, b) { return a != null && b != null && Math.abs(a - b) < 0.005; }

  function outcome(P, rec, edit, S, classify) {
    edit = edit || {}; S = S || {};
    if (edit.conflict) return { check: 'CONFLICT', inc: 'No', upload: false, final: null, sugg: rec.engSugg, post: null, price: rec.basePrice, profitNow: rec.engProfit, floor: rec.engFloor, reason: 'Conflict on ' + edit.conflict };
    if (edit.invalid) return { check: 'INVALID', inc: 'No', upload: false, final: null, sugg: rec.engSugg, post: rec.basePost, price: rec.basePrice, profitNow: rec.engProfit, floor: rec.engFloor, reason: edit.invalid };
    var postE = edit.post == null ? null : edit.post, priceE = edit.priceNow == null ? null : edit.priceNow, yourE = edit.your == null ? null : edit.your, incE = edit.inc || null;
    function pack(o) {
      var inc = incE === 'No' ? 'No' : incE === 'Yes' ? (o.check === 'OK' ? 'Yes' : 'No') : (postE == null && priceE == null && yourE == null ? o.inc : (o.check === 'OK' ? 'Yes' : 'No'));
      o.inc = inc; o.upload = o.check === 'OK' && inc === 'Yes'; return o;
    }
    if (postE == null && priceE == null && yourE == null) return pack({ check: rec.engCheck, inc: rec.engInc, sugg: rec.engSugg, final: rec.engSugg, post: rec.basePost, price: rec.basePrice, profitNow: rec.engProfit, newProfit: rec.engNewProfit, floor: rec.engFloor, reason: rec.engReason });
    if (P.useRules) P.useRules(S);
    if (postE == null && priceE == null) { var jy = pack(judgeYour(P, rec, yourE, S)); if (P.clearRules) P.clearRules(); return jy; }
    var raw = { sku: rec.sku, title: rec.title, ean: rec.ean, cost: rec.cost, price: priceE != null ? priceE : rec.basePrice, bb: rec.bb, seller: rec.seller, sup: rec.sup, w: rec.w, sales: rec.sales, collab: rec.collab, stock: rec.stock, variant: '', pc: rec.accessPc, offerFlag: rec.offer, liveSeen: rec.liveSeen };
    if (postE != null) raw.postYour = postE;
    var d = P.decide(raw, {});
    var bbS = Object.assign({}, P.BB_DEFAULT || {}, S);
    var b = P.buyBox(d, { fresh: rec.fresh !== 0, rival: rec.rival != null ? { p: rec.rival, s: 'Other', d: '' } : null, seasonal: rec.seasonal === 1 }, bbS);
    b.o = d;
    var x = classify(P, [b], S)[0];
    var js = pack(judgeSim(P, x, yourE, S)); if (P.clearRules) P.clearRules(); return js;
  }
  function judgeYour(P, rec, your, S) {
    var o = { sugg: rec.engSugg, post: rec.basePost, price: rec.basePrice, profitNow: rec.engProfit, floor: rec.engFloor, final: your, inc: rec.engInc };
    if (rec.weekly) { o.check = 'WEEKLY HOLD'; return o; }
    if (rec.china && your > (rec.basePrice || 0) + 0.001) { o.check = 'CHINA RAISE'; return o; }
    if (rec.packCheck && !(S && S.checkPost)) { o.check = 'CHECK POSTAGE'; return o; }
    return finishMoney(P, rec, your, rec.basePost, rec.cat === 't5' && !rec.china ? rec.t5Min : rec.engFloor, rec.engCap, o, S);
  }
  function judgeSim(P, x, your, S) {
    var o = x.o, post = o.post, price = o.price;
    var out = { sugg: x.sugg, post: post, price: price, profitNow: o.profit, floor: o.floor, final: your != null ? your : x.sugg };
    if (x.weeklyHold) { out.check = 'WEEKLY HOLD'; out.final = null; out.sugg = null; return out; }
    var proposed = your != null ? your : x.sugg;
    if (o.china && proposed != null && proposed > price + 0.001) { out.check = 'CHINA RAISE'; out.final = proposed; return out; }
    if (o.check && !o.postChecked) { out.check = 'CHECK POSTAGE'; return out; }
    var final = your != null ? your : x.sugg;
    var floorRef = x.cat === 't5' && !o.china && x.t5Min != null ? x.t5Min : o.floor;
    var rec = { cost: o.cost, mult: o.mult, collab: o.collab || 0, basePrice: price, china: o.china ? 1 : 0 };
    return finishMoney(P, rec, final, post, floorRef, o.china ? null : o.ceil, out, S);
  }
  function finishMoney(P, rec, final, post, floorRef, cap, out, S) {
    out.final = final;
    if (final == null || !(post != null) || !(rec.cost > 0)) { out.check = 'NO CHANGE'; return out; }
    if (!(final > 0)) { out.check = 'NO PRICE'; return out; }
    var c = P.calc({ cost: rec.cost, mult: rec.mult, post: post, collab: rec.collab || 0 }, final);
    out.newProfit = c.profit; out.newPc = c.pc;
    var safe = (S && S.safeMin != null) ? S.safeMin : (P.safeOf ? P.safeOf() : 0.5);
    var chF = (S && S.chinaFloor != null) ? S.chinaFloor : (P.chinaFloorOf ? P.chinaFloorOf() : 1);
    var chk = floorRef != null && final < floorRef - 1e-5 ? 'UNDER FLOOR' : !(c.profit > 0) ? 'LOSS' : (cap != null && final > cap + 1e-5 && (rec.basePrice == null || final > rec.basePrice + 1e-5)) ? 'OVER CAP' : (c.pc < safe - 1e-9) ? 'UNDER FLOOR' : (rec.china && c.pc < chF - 1e-9) ? 'UNDER FLOOR' : (rec.china && rec.basePrice != null && final > rec.basePrice + 0.001) ? 'CHINA RAISE' : (rec.basePrice != null && rnd2(final) === rnd2(rec.basePrice)) ? 'NO CHANGE' : 'OK';
    out.check = chk; return out;
  }

  function make(recs, input, P, saved, S) {
    input = input || {}; saved = saved || {}; S = Object.assign({}, P.BB_DEFAULT || {}, S || {});
    var asOf = xDate(S.asOf || (input && input.asOf) || '');
    function sv(k, d) { return S[k] != null && S[k] !== '' ? S[k] : d; }
    var setRows = [['fee', sv('fee', 0.15)], ['ukMax', sv('ukMax', 0.8)], ['safeMin', sv('safeMin', 0.5)], ['minChange', sv('minChange', 0.1)], ['t3buf', sv('t3buf', 0.05)], ['t5cut', sv('t5cut', 0.05)], ['t5ukFloor', sv('t5ukFloor', 0.6)], ['t5ukMin', sv('t5ukMin', 0.65)], ['t5HoldDays', sv('t5HoldDays', 3)], ['step', sv('step', 0.01)], ['stepPct', S.stepPct || 0], ['minGain', S.minGain == null ? 0.1 : S.minGain], ['raisePct', S.raisePct == null ? 0.05 : S.raisePct], ['xmas', S.xmas === false ? 0 : 1], ['raiseNoSales', S.raiseNoSales ? 1 : 0], ['noStockKeep', S.noStockKeep === false ? 0 : 1], ['keepTrees', S.keepTrees === false ? 0 : 1], ['useStale', S.useStale ? 1 : 0], ['checkPost', S.checkPost ? 1 : 0], ['asOf', asOf == null ? '' : asOf], ['packGrams', sv('packGrams', 14999)], ['chinaFloor', sv('chinaFloor', 1)], ['ukSoldFloor', sv('ukSoldFloor', 0.5)], ['ukBand1', sv('ukBand1', 0.8)], ['ukBand5', sv('ukBand5', 0.7)], ['ukBand10', sv('ukBand10', 0.6)], ['ukBandRest', sv('ukBandRest', 0.5)], ['cost1', sv('cost1', 1)], ['cost5', sv('cost5', 5)], ['cost10', sv('cost10', 10)], ['closeHi', sv('closeHi', 0.10)], ['closeLo', sv('closeLo', 0.15)], ['zeroSalesRaise', sv('zeroSalesRaise', 0.5)], ['band1w', 2000], ['band1p', 1.75], ['band2w', 15200], ['band2p', 2.3], ['band3w', 20000], ['band3p', 8], ['band4w', 25000], ['band4p', 9], ['band5w', 30000], ['band5p', 10.5], ['overBand', sv('overBand', 15)]];
    if (Array.isArray(S.bands) && S.bands.length) {
      var bi; for (bi = 0; bi < 5 && bi < S.bands.length; bi++) {
        var pair = S.bands[bi];
        setRows.forEach(function (r) { if (r[0] === 'band' + (bi + 1) + 'w') r[1] = pair[0]; if (r[0] === 'band' + (bi + 1) + 'p') r[1] = pair[1]; });
      }
    }
    var SB = {}; setRows.forEach(function (r, i) { SB[r[0]] = "'" + SET + "'!$B$" + (i + 2); });
    var names = [];
    function add(name) { names.push(name); return names.length - 1; }
    ['sku','title','uk','cost','mult','collab','w','sales','stock','bb','win','seller','basePost','basePrice','china','tree','fresh','liveSeen','offer','packN','packCheck','lastChange','rival','seasonal','engSugg','engInc','engCheck','engReason','engProfit','engPc','engFloor','engCap','engNewProfit','noData','priceCheck','weeklyEng','t5Min','engAct','cat'].forEach(add);
    var mCols = [], pCols = [], rCols = [], yCols = [], iCols = [];
    for (var s = 0; s < 7; s++) { mCols.push(add('m' + s)); pCols.push(add('p' + s)); rCols.push(add('r' + s)); yCols.push(add('y' + s)); iCols.push(add('i' + s)); }
    var postN = add('postN'), postBad = add('postBad'), postMin = add('postMin'), postMax = add('postMax'), postStat = add('postStat'), postU = add('postU');
    var priceN = add('priceN'), priceBad = add('priceBad'), priceMin = add('priceMin'), priceMax = add('priceMax'), priceStat = add('priceStat'), priceU = add('priceU');
    var yourN = add('yourN'), yourBad = add('yourBad'), yourMin = add('yourMin'), yourMax = add('yourMax'), yourStat = add('yourStat'), yourU = add('yourU');
    var incN = add('incN'), incBad = add('incBad'), incFirst = add('incFirst'), incStat = add('incStat'), incVal = add('incVal');
    var fixed = add('fixed'), profitNow = add('profitNow'), pcNow = add('pcNow'), floorPct = add('floorPct'), floorP = add('floorP'), capP = add('capP'), t5MinP = add('t5MinP'), chinaMin = add('chinaMin');
    var stepAmt = add('stepAmt'), need = add('need'), tLow = add('tLow'), eC = add('eC'), eR = add('eR'), eQ = add('eQ'), eV = add('eV'), bbSugg = add('bbSugg');
    var raiseT = add('raiseT'), raiseC = add('raiseC'), gain = add('gain'), closePx = add('closePx'), act = add('act'), weekly = add('weekly');
    var t5ukR = add('t5ukR'), t5ukC = add('t5ukC'), t5cnR = add('t5cnR'), t5s = add('t5s');
    var t3q = add('t3q'), t3fb = add('t3fb'), t3m = add('t3m'), t3c = add('t3c'), t3s = add('t3s'), reSugg = add('reSugg');
    var showPost = add('showPost'), showPrice = add('showPrice'), showProfit = add('showProfit'), showPc = add('showPc'), showFloor = add('showFloor'), showSugg = add('showSugg'), showFinal = add('showFinal'), showNewP = add('showNewP'), showCheck = add('showCheck'), showInc = add('showInc'), showWhy = add('showWhy'), runUK = add('runUK'), runCN = add('runCN'), upUK = add('upUK'), upCN = add('upCN'), showCap = add('showCap'), showNewPc = add('showNewPc');
    function C(i, r) { return L(i) + r; }
    function ref(i) { return L(i); }
    function pull(m, sheet, col, range) { var rg = range.replace(/\$A/g, '$' + col); return 'IF(' + m + '="","",IF(LEN(TRIM(INDEX(\'' + sheet + '\'!' + rg + ',' + m + ')&""))=0,"",INDEX(\'' + sheet + '\'!' + rg + ',' + m + ')))'; }
    function normInc(cell) { return 'IF(' + cell + '="","",IF(OR(UPPER(TRIM(' + cell + '&""))="YES",UPPER(TRIM(' + cell + '&""))="Y"),"Yes",IF(OR(UPPER(TRIM(' + cell + '&""))="NO",UPPER(TRIM(' + cell + '&""))="N"),"No","BAD")))'; }
    function countF(ids, r) { return '(' + ids.map(function (i) { return '(' + C(i, r) + '<>"")'; }).join('+') + ')'; }
    function badNum(ids, r, pos) { return '(' + ids.map(function (i) { return 'IF(OR(' + C(i, r) + '="",AND(ISNUMBER(' + C(i, r) + '),' + C(i, r) + pos + ')),0,1)'; }).join('+') + ')'; }
    function minF(ids, r) { return 'MIN(' + ids.map(function (i) { return 'IF(' + C(i, r) + '="",1E99,' + C(i, r) + ')'; }).join(',') + ')'; }
    function maxF(ids, r) { return 'MAX(' + ids.map(function (i) { return 'IF(' + C(i, r) + '="",-1,' + C(i, r) + ')'; }).join(',') + ')'; }
    function statF(bad, n, mx, mn) { return 'IF(' + bad + '>0,"INVALID",IF(' + n + '=0,"BASE",IF(ABS(' + mx + '-' + mn + ')<0.001,"OK","CONFLICT")))'; }
    function priceFor(r, frac) { return 'ROUNDUP(ROUND((' + C(fixed, r) + '+' + C(names.indexOf('cost'), r) + '*(' + frac + '))/(1-' + SB.fee + '),6),2)'; }
    function priceMaxF(r, frac) { return 'ROUNDDOWN(ROUND((' + C(fixed, r) + '+' + C(names.indexOf('cost'), r) + '*(' + frac + '))/(1-' + SB.fee + '),6),2)'; }
    var costI = names.indexOf('cost'), multI = names.indexOf('mult'), colI = names.indexOf('collab'), chinaI = names.indexOf('china'), salesI = names.indexOf('sales'), bbI = names.indexOf('bb'), winI = names.indexOf('win'), stockI = names.indexOf('stock'), treeI = names.indexOf('tree'), freshI = names.indexOf('fresh'), packI = names.indexOf('packCheck'), lastI = names.indexOf('lastChange'), rivalI = names.indexOf('rival'), seaI = names.indexOf('seasonal'), basePostI = names.indexOf('basePost'), basePriceI = names.indexOf('basePrice'), noDataI = names.indexOf('noData'), pCheckI = names.indexOf('priceCheck'), engSuggI = names.indexOf('engSugg'), engIncI = names.indexOf('engInc'), engCheckI = names.indexOf('engCheck'), engReasonI = names.indexOf('engReason'), engProfitI = names.indexOf('engProfit'), engPcI = names.indexOf('engPc'), engFloorI = names.indexOf('engFloor'), engCapI = names.indexOf('engCap'), engNewI = names.indexOf('engNewProfit'), weeklyEngI = names.indexOf('weeklyEng'), t5MinI = names.indexOf('t5Min'), engActI = names.indexOf('engAct');

    recs = recs.slice().sort(function (a, b) {
      var pa = (a.engNewProfit != null && a.cost > 0) ? a.engNewProfit / a.cost : (a.engPc != null ? a.engPc : 999);
      var pb = (b.engNewProfit != null && b.cost > 0) ? b.engNewProfit / b.cost : (b.engPc != null ? b.engPc : 999);
      return pa - pb || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
    });
    var nAll = (input.aoa && input.aoa.length > 1) ? input.aoa.length - 1 : recs.length, nTab = { 2: 0, 3: 0, 4: 0, 5: 0, china: 0 };
    recs.forEach(function (rec) { if (nTab[rec.tab] != null) nTab[rec.tab]++; if (rec.cat === 'raise' && rec.china) nTab.china++; });
    function bound(n) { return '$A$3:$A$' + Math.max(4, 2 + (n || 0)); }
    var LOOK = [bound(nAll), bound(nTab[2]), bound(nTab[3]), bound(nTab[4]), bound(nTab[5]), bound(recs.length), bound(nTab.china)];
    function onSheet(rec, k) { return k === 0 || k === 5 || (k === 1 && rec.tab === 2) || (k === 2 && rec.tab === 3) || (k === 3 && rec.tab === 4) || (k === 4 && rec.tab === 5) || (k === 6 && rec.cat === 'raise' && rec.china); }
    var calcRows = recs.map(function (rec, idx) {
      var r = idx + 2, row = new Array(names.length);
      function setV(i, v, z) { if (v == null || v === '') return; row[i] = { t: typeof v === 'number' ? 'n' : 's', v: v, z: z }; }
      function setF(i, f, z) { row[i] = { t: 'n', f: f, z: z }; }
      var idle = null;
      function setH(i, f, z) { setF(i, 'IF(' + idle + ',"",' + f + ')', z); }
      setV(0, rec.sku); setV(1, rec.title); setV(2, rec.uk); setV(3, rec.cost, M); setV(4, rec.mult); setV(5, rec.collab || 0, M);
      setV(6, rec.w, IN); setV(7, rec.sales || 0, IN); setV(8, rec.stock, IN); setV(9, rec.bb, M); setV(10, rec.win ? 1 : 0); setV(11, rec.seller);
      setV(12, rec.basePost, M); setV(13, rec.basePrice, M); setV(14, rec.china ? 1 : 0); setV(15, rec.tree ? 1 : 0); setV(16, rec.fresh ? 1 : 0);
      setV(17, rec.liveSeen, M); setV(18, rec.offer || ''); setV(19, rec.packN); setV(20, rec.packCheck ? 1 : 0);
      if (rec.lastChange) setV(21, xDate(rec.lastChange)); setV(22, rec.rival, M); setV(23, rec.seasonal ? 1 : 0);
      setV(24, rec.engSugg, M); setV(25, rec.engInc || 'No'); setV(26, rec.engCheck || 'NO CHANGE'); setV(27, rec.engReason || '');
      setV(28, rec.engProfit, M); setV(29, rec.engPc, PC); setV(30, rec.engFloor, M); setV(31, rec.engCap, M); setV(32, rec.engNewProfit, M);
      setV(33, rec.noData ? 1 : 0); setV(34, rec.priceCheck ? 1 : 0); setV(35, rec.weekly ? 1 : 0); setV(36, rec.t5Min, M); setV(37, rec.act || ''); setV(38, rec.cat || '');
      SRC.forEach(function (src, k) {
        if (!onSheet(rec, k)) return;
        var m = C(mCols[k], r), rg = LOOK[k];
        if (k === 5) {
          var cr = r + 1;
          function direct(col) { return 'IF(\'' + src[0] + '\'!A' + cr + '=A' + r + ',IF(LEN(TRIM(\'' + src[0] + '\'!' + col + cr + '&""))=0,"",\'' + src[0] + '\'!' + col + cr + '),' + pull('IFERROR(MATCH(A' + r + ',\'' + src[0] + '\'!' + rg + ',0),"")', src[0], col, rg) + ')'; }
          setF(pCols[k], direct(src[1])); setF(rCols[k], direct(src[2])); setF(yCols[k], direct(src[3])); setF(iCols[k], normInc(direct(src[4])));
        } else {
          setF(mCols[k], 'IFERROR(MATCH(A' + r + ',\'' + src[0] + '\'!' + rg + ',0),"")');
          setF(pCols[k], pull(m, src[0], src[1], rg)); setF(rCols[k], pull(m, src[0], src[2], rg)); setF(yCols[k], pull(m, src[0], src[3], rg)); setF(iCols[k], normInc(pull(m, src[0], src[4], rg)));
        }
      });
      setF(postN, countF(pCols, r)); setF(postBad, badNum(pCols, r, '>=0')); setF(postMin, minF(pCols, r)); setF(postMax, maxF(pCols, r));
      setF(postStat, statF(C(postBad, r), C(postN, r), C(postMax, r), C(postMin, r)));
      setF(postU, 'IF(' + C(postStat, r) + '="OK",' + C(postMax, r) + ',IF(' + C(postStat, r) + '="BASE",IF(' + C(basePostI, r) + '="", "", ' + C(basePostI, r) + '),""))', M);
      idle = 'AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE")';
      setF(priceN, countF(rCols, r)); setF(priceBad, badNum(rCols, r, '>0')); setF(priceMin, minF(rCols, r)); setF(priceMax, maxF(rCols, r));
      setF(priceStat, statF(C(priceBad, r), C(priceN, r), C(priceMax, r), C(priceMin, r)));
      setF(priceU, 'IF(' + C(priceStat, r) + '="OK",' + C(priceMax, r) + ',IF(' + C(priceStat, r) + '="BASE",IF(' + C(basePriceI, r) + '="","",' + C(basePriceI, r) + '),""))', M);
      setF(yourN, countF(yCols, r)); setF(yourBad, badNum(yCols, r, '>0')); setF(yourMin, minF(yCols, r)); setF(yourMax, maxF(yCols, r));
      setF(yourStat, statF(C(yourBad, r), C(yourN, r), C(yourMax, r), C(yourMin, r)));
      setF(yourU, 'IF(' + C(yourStat, r) + '="OK",' + C(yourMax, r) + ',"")', M);
      setF(incN, countF(iCols, r));
      setF(incBad, '(' + iCols.map(function (i) { return 'IF(' + C(i, r) + '="BAD",1,0)'; }).join('+') + ')');
      var incFirstF = '""';
      for (var k = iCols.length - 1; k >= 0; k--) incFirstF = 'IF(OR(' + C(iCols[k], r) + '="",' + C(iCols[k], r) + '="BAD"),' + incFirstF + ',' + C(iCols[k], r) + ')';
      setF(incFirst, incFirstF);
      var same = iCols.map(function (i) { return 'OR(' + C(i, r) + '="",' + C(i, r) + '=' + C(incFirst, r) + ')'; }).join(',');
      setF(incStat, 'IF(' + C(incBad, r) + '>0,"INVALID",IF(' + C(incN, r) + '=0,"BASE",IF(AND(' + same + '),"OK","CONFLICT")))');
      setF(incVal, 'IF(' + C(incStat, r) + '="OK",' + C(incFirst, r) + ',"")');
      setF(fixed, 'IF(' + C(postU, r) + '="","",' + C(costI, r) + '*' + C(multI, r) + '+' + C(postU, r) + '+' + C(colI, r) + ')', M);
      setF(profitNow, 'IF(OR(' + C(postU, r) + '="",' + C(priceU, r) + '=""),"",ROUND(ROUND(' + C(priceU, r) + '*(1-' + SB.fee + ')-' + C(fixed, r) + ',6),2))', M);
      setF(pcNow, 'IF(OR(' + C(profitNow, r) + '="",' + C(costI, r) + '="",' + C(costI, r) + '<=0),"",(' + C(priceU, r) + '*(1-' + SB.fee + ')-' + C(fixed, r) + ')/' + C(costI, r) + ')', PC);
      setF(floorPct, 'IF(' + C(chinaI, r) + '=1,' + SB.chinaFloor + ',IF(' + C(salesI, r) + '>=1,' + SB.ukSoldFloor + ',IF(' + C(costI, r) + '<' + SB.cost1 + ',' + SB.ukBand1 + ',IF(' + C(costI, r) + '<' + SB.cost5 + ',' + SB.ukBand5 + ',IF(' + C(costI, r) + '<' + SB.cost10 + ',' + SB.ukBand10 + ',' + SB.ukBandRest + ')))))', PC);
      setF(floorP, 'IF(' + C(fixed, r) + '="","",IF(' + C(chinaI, r) + '=1,' + priceFor(r, C(floorPct, r)) + ',MIN(' + priceFor(r, C(floorPct, r)) + ',' + priceMaxF(r, SB.ukMax) + ')))', M);
      setF(capP, 'IF(OR(' + C(fixed, r) + '="",' + C(chinaI, r) + '=1),"",' + priceMaxF(r, SB.ukMax) + ')', M);
      setF(t5MinP, 'IF(OR(' + C(fixed, r) + '="",' + C(chinaI, r) + '=1),"",MIN(' + priceFor(r, SB.t5ukMin) + ',' + priceMaxF(r, SB.ukMax) + '))', M);
      setF(chinaMin, 'IF(OR(' + C(chinaI, r) + '<>1,' + C(fixed, r) + '=""),"",' + priceFor(r, '1.05') + ')', M);
      setH(stepAmt, 'MAX(0.01,ROUND(MAX(' + SB.step + ',IF(OR(' + C(bbI, r) + '="",NOT(ISNUMBER(' + C(bbI, r) + '))),0,' + C(bbI, r) + ')*' + SB.stepPct + '/100),2))');
      setH(need, 'IF(OR(' + C(bbI, r) + '="",NOT(ISNUMBER(' + C(bbI, r) + '))),"",ROUND(' + C(bbI, r) + '-' + C(stepAmt, r) + ',2))', M);
      setH(tLow, 'IF(' + C(need, r) + '="","",IF(' + C(capP, r) + '="",' + C(need, r) + ',IF(' + C(need, r) + '>' + C(capP, r) + ',' + C(capP, r) + ',' + C(need, r) + ')))', M);
      setH(eC, '""'); setH(eR, '""'); setH(eQ, '""'); setH(eV, '""');
      setH(bbSugg, 'IF(' + C(tLow, r) + '="","",' + C(tLow, r) + ')', M);
      setH(raiseT, 'IF(AND(ISNUMBER(' + C(rivalI, r) + '),' + C(rivalI, r) + '>' + C(priceU, r) + '),ROUND(' + C(rivalI, r) + '-' + C(stepAmt, r) + ',2),IF(AND(ISNUMBER(' + C(rivalI, r) + '),' + C(rivalI, r) + '<=' + C(priceU, r) + '),"",IF(AND(' + SB.xmas + '=1,' + C(seaI, r) + '=1),"",ROUNDDOWN(' + C(priceU, r) + '*(1+' + SB.raisePct + '),2))))', M);
      setH(raiseC, 'IF(' + C(raiseT, r) + '="","",IF(' + C(capP, r) + '="",' + C(raiseT, r) + ',IF(' + C(raiseT, r) + '>' + C(capP, r) + ',' + C(capP, r) + ',' + C(raiseT, r) + ')))', M);
      setH(gain, 'IF(OR(' + C(raiseC, r) + '="",' + C(priceU, r) + '=""),"",(' + C(raiseC, r) + '-' + C(priceU, r) + ')*(1-' + SB.fee + '))', M);
      var bbRound = 'ROUND(' + C(bbI, r) + ',2)';
      var closeHi = 'ROUND(' + bbRound + '-' + SB.closeHi + ',2)';
      var closeLo = 'ROUND(' + bbRound + '-' + SB.closeLo + ',2)';
      function down9f(expr) { var cents = 'ROUND((' + expr + ')*100,0)'; return '((' + cents + '-MOD(MOD(' + cents + ',10)-9+10,10))/100)'; }
      var closeIdeal = 'IF(' + down9f(closeHi) + '>=' + closeLo + '-0.000000001,' + down9f(closeHi) + ',' + closeHi + ')';
      var closeCap = 'IF(' + C(capP, r) + '="",' + closeIdeal + ',IF(' + closeIdeal + '<=' + C(capP, r) + '+0.000000001,' + closeIdeal + ',' + down9f(C(capP, r)) + '))';
      setH(closePx, 'IF(OR(' + C(bbI, r) + '="",NOT(ISNUMBER(' + C(bbI, r) + ')),' + C(bbI, r) + '<=0,' + C(priceU, r) + '="",' + C(salesI, r) + '<1),"",IF(AND(' + closeCap + '>' + C(priceU, r) + '+0.000000001,OR(' + C(floorP, r) + '="",' + closeCap + '>=' + C(floorP, r) + '-0.000000001)),' + closeCap + ',""))', M);
      var raiseLine = 'IF(' + C(chinaI, r) + '=1,' + C(floorPct, r) + ',IF(' + C(salesI, r) + '>=1,' + C(floorPct, r) + ',' + SB.zeroSalesRaise + '))';
      var already = 'IF(' + C(salesI, r) + '<1,"Keep",IF(AND(ISNUMBER(' + C(closePx, r) + '),' + C(closePx, r) + '>' + C(priceU, r) + '),"Closer","Keep"))';
      var actF = 'IF(' + C(noDataI, r) + '=1,"No data",IF(' + C(pCheckI, r) + '=1,"Price check",IF(OR(' + C(postU, r) + '="",' + C(priceU, r) + '="",NOT(ISNUMBER(' + C(costI, r) + ')),' + C(costI, r) + '<=0),"No data",IF(AND(' + C(freshI, r) + '=0,' + SB.useStale + '=0),"No data",IF(AND(ISNUMBER(' + C(stockI, r) + '),' + C(stockI, r) + '<=0,' + SB.noStockKeep + '=1),"Keep",IF(AND(' + C(treeI, r) + '=1,' + SB.keepTrees + '=1),"Keep",IF(' + C(winI, r) + '<>1,IF(OR(' + C(bbI, r) + '="",NOT(ISNUMBER(' + C(bbI, r) + ')),' + C(bbI, r) + '<=0),"No data",IF(' + C(priceU, r) + '<ROUND(' + C(bbI, r) + ',2),' + already + ',IF(' + C(tLow, r) + '="","",IF(' + C(tLow, r) + '<' + C(floorP, r) + ',"Can\'t win","Lower")))),IF(OR(' + C(pcNow, r) + '="",' + raiseLine + '=""),"Raise",IF(' + C(pcNow, r) + '<' + raiseLine + '-0.000000001,"Raise",IF(IF(' + C(capP, r) + '="",FALSE,' + C(priceU, r) + '>=' + C(capP, r) + '-0.000000001),"Keep",IF(AND(' + C(salesI, r) + '<1,' + SB.raiseNoSales + '=0),"Keep",IF(OR(' + C(raiseC, r) + '="",NOT(' + C(raiseC, r) + '>' + C(priceU, r) + ')),"Keep",IF(' + C(gain, r) + '<' + SB.minGain + ',"Keep","Raise")))))))))))))';
      setH(act, actF);
      setH(weekly, 'IF(OR(' + C(act, r) + '<>"Can\'t win",' + C(chinaI, r) + '=1,' + C(lastI, r) + '="",' + SB.asOf + '=""),0,IF(AND(' + SB.asOf + '-' + C(lastI, r) + '<' + SB.t5HoldDays + ',' + SB.asOf + '-' + C(lastI, r) + '>=0),1,0))');
      var prof = function (p) { return 'ROUND(ROUND((' + p + ')*(1-' + SB.fee + ')-' + C(fixed, r) + ',6),2)'; };
      var pcOf = function (p) { return '((' + p + ')*(1-' + SB.fee + ')-' + C(fixed, r) + ')/' + C(costI, r); };
      var okUK = function (p, fl) { return 'IF(OR(' + p + '="",' + fl + '=""),FALSE,AND(' + p + '>0,' + prof(p) + '>0,' + p + '>=' + fl + '-0.00001,IF(' + C(capP, r) + '="",TRUE,' + p + '<=' + C(capP, r) + '+0.00001),' + pcOf(p) + '>=' + SB.safeMin + '-0.000000001))'; };
      setH(t5ukR, 'IF(OR(' + C(t5MinP, r) + '="",' + C(priceU, r) + '=""),"",MAX(' + C(t5MinP, r) + ',ROUND(' + C(priceU, r) + '*(1-' + SB.t5cut + '),2)))', M);
      setH(t5ukC, 'IF(' + C(t5ukR, r) + '="","",IF(' + C(capP, r) + '="",' + C(t5ukR, r) + ',IF(' + C(t5ukR, r) + '>' + C(capP, r) + ',' + C(capP, r) + ',' + C(t5ukR, r) + ')))', M);
      setH(t5cnR, 'IF(OR(' + C(floorP, r) + '="",' + C(priceU, r) + '=""),"",MAX(' + C(floorP, r) + ',ROUND(' + C(priceU, r) + '*(1-' + SB.t5cut + '),2)))', M);
      setH(t5s, 'IF(OR(' + C(act, r) + '<>"Can\'t win",' + C(weekly, r) + '=1),"",IF(' + C(chinaI, r) + '=1,IF(' + C(t5cnR, r) + '="","",IF(' + C(priceU, r) + '-' + C(t5cnR, r) + '<' + SB.minChange + ',"",IF(AND(' + okUK(C(t5cnR, r), C(floorP, r)) + ',' + pcOf(C(t5cnR, r)) + '>=1-0.000000001),' + C(t5cnR, r) + ',""))),IF(' + C(t5ukC, r) + '="","",IF(OR(' + C(priceU, r) + '-' + C(t5ukC, r) + '<' + SB.minChange + ',' + C(t5ukC, r) + '<' + C(t5MinP, r) + '),"",IF(' + okUK(C(t5ukC, r), C(t5MinP, r)) + ',' + C(t5ukC, r) + ',"")))))', M);
      setH(t3q, 'IF(OR(' + C(floorP, r) + '="",' + C(priceU, r) + '=""),"",ROUND(' + C(priceU, r) + '-(' + C(priceU, r) + '-' + C(floorP, r) + ')/4,2))', M);
      setH(t3fb, 'IF(' + C(floorP, r) + '="","",IF(AND(' + C(chinaI, r) + '=1,' + C(salesI, r) + '<1,' + C(chinaMin, r) + '<>""),' + C(chinaMin, r) + ',ROUNDUP(' + C(floorP, r) + '*(1+' + SB.t3buf + '),2)))', M);
      setH(t3m, 'IF(OR(' + C(t3q, r) + '="",' + C(t3fb, r) + '=""),"",MAX(' + C(t3q, r) + ',' + C(t3fb, r) + '))', M);
      setH(t3c, 'IF(' + C(t3m, r) + '="","",IF(' + C(capP, r) + '="",' + C(t3m, r) + ',IF(' + C(t3m, r) + '>' + C(capP, r) + ',' + C(capP, r) + ',' + C(t3m, r) + ')))', M);
      setH(t3s, 'IF(OR(' + C(priceU, r) + '="",' + C(t3c, r) + '=""),"",IF(AND(' + C(chinaI, r) + '<>1,' + C(t3c, r) + '>=' + C(priceU, r) + '),"",IF(ABS(' + C(priceU, r) + '-' + C(t3c, r) + ')<' + SB.minChange + ',"",IF(' + okUK(C(t3c, r), C(t3fb, r)) + ',' + C(t3c, r) + ',""))))', M);
      var raisePx = 'IF(AND(' + C(chinaI, r) + '<>1,' + C(salesI, r) + '<1),' + priceFor(r, SB.zeroSalesRaise) + ',' + C(floorP, r) + ')';
      var up9r = '(ROUND(' + raisePx + '*100,0)+MOD(9-MOD(ROUND(' + raisePx + '*100,0),10)+10,10))/100';
      var raiseUp = 'IF(' + raisePx + '="","",IF(OR(' + up9r + '<=0,IF(' + C(capP, r) + '="",FALSE,' + up9r + '>' + C(capP, r) + ')),' + raisePx + ',' + up9r + '))';
      var raiseLine2 = 'IF(' + C(chinaI, r) + '=1,' + C(floorPct, r) + ',IF(' + C(salesI, r) + '>=1,' + C(floorPct, r) + ',' + SB.zeroSalesRaise + '))';
      setH(reSugg, 'IF(OR(' + C(act, r) + '="",' + C(act, r) + '="No data",' + C(act, r) + '="Price check"),"",IF(' + C(act, r) + '="Closer",' + C(closePx, r) + ',IF(' + C(act, r) + '="Lower",' + C(bbSugg, r) + ',IF(' + C(act, r) + '="Raise",IF(OR(' + C(pcNow, r) + '="",' + C(pcNow, r) + '<' + raiseLine2 + '),' + raiseUp + ',' + C(raiseC, r) + '),IF(' + C(act, r) + '="Can\'t win",' + C(t5s, r) + ',IF(AND(' + C(winI, r) + '=1,' + C(salesI, r) + '<1,' + C(treeI, r) + '<>1,OR(NOT(ISNUMBER(' + C(stockI, r) + ')),' + C(stockI, r) + '>0,' + SB.noStockKeep + '=0)),' + C(t3s, r) + ',""))))))', M);
      setF(showPost, 'IF(' + C(postU, r) + '="","",' + C(postU, r) + ')', M);
      setF(showPrice, 'IF(' + C(priceU, r) + '="","",' + C(priceU, r) + ')', M);
      setF(showProfit, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE"),IF(' + C(engProfitI, r) + '="","",' + C(engProfitI, r) + '),' + C(profitNow, r) + ')', M);
      setF(showPc, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE"),IF(' + C(engPcI, r) + '="","",' + C(engPcI, r) + '),' + C(pcNow, r) + ')', PC);
      setF(showFloor, 'IF(' + C(postStat, r) + '="BASE",IF(' + C(engFloorI, r) + '="","",' + C(engFloorI, r) + '),' + C(floorP, r) + ')', M);
      setF(showSugg, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE"),IF(' + C(engSuggI, r) + '="","",' + C(engSuggI, r) + '),' + C(reSugg, r) + ')', M);
      setF(showFinal, 'IF(' + C(yourStat, r) + '="OK",' + C(yourU, r) + ',IF(' + C(showSugg, r) + '="","",' + C(showSugg, r) + '))', M);
      var reNew = 'IF(OR(' + C(showFinal, r) + '="",' + C(fixed, r) + '=""),"",' + prof(C(showFinal, r)) + ')';
      setF(showNewP, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE",' + C(yourStat, r) + '="BASE"),IF(' + C(engNewI, r) + '="","",' + C(engNewI, r) + '),' + reNew + ')', M);
      var floorRef = 'IF(AND(' + C(act, r) + '="Can\'t win",' + C(chinaI, r) + '<>1,' + C(t5MinP, r) + '<>""),' + C(t5MinP, r) + ',' + C(floorP, r) + ')';
      var chinaUpNow = 'IF(OR(' + C(chinaI, r) + '<>1,' + C(showFinal, r) + '="",' + C(priceU, r) + '="",NOT(ISNUMBER(' + C(showFinal, r) + ')),NOT(ISNUMBER(' + C(priceU, r) + '))),FALSE,' + C(showFinal, r) + '>' + C(priceU, r) + '+0.001)';
      var reChk = 'IF(' + C(weekly, r) + '=1,"WEEKLY HOLD",IF(' + chinaUpNow + ',"CHINA RAISE",IF(AND(' + C(packI, r) + '=1,' + SB.checkPost + '=0,' + C(postStat, r) + '="BASE"),"CHECK POSTAGE",IF(OR(' + C(showFinal, r) + '="",NOT(ISNUMBER(' + C(showFinal, r) + '))),"NO CHANGE",IF(' + C(showFinal, r) + '<=0,"NO PRICE",IF(' + prof(C(showFinal, r)) + '<=0,"LOSS",IF(AND(' + floorRef + '<>"",' + C(showFinal, r) + '<' + floorRef + '-0.00001),"UNDER FLOOR",IF(AND(' + C(capP, r) + '<>"",' + C(showFinal, r) + '>' + C(capP, r) + '+0.00001,IF(' + C(priceU, r) + '="",TRUE,' + C(showFinal, r) + '>' + C(priceU, r) + '+0.00001)),"OVER CAP",IF(' + pcOf(C(showFinal, r)) + '<' + SB.safeMin + '-0.000000001,"UNDER FLOOR",IF(AND(' + C(chinaI, r) + '=1,' + pcOf(C(showFinal, r)) + '<1-0.000000001),"UNDER FLOOR",IF(AND(' + C(priceU, r) + '<>"",ROUND(' + C(showFinal, r) + ',2)=ROUND(' + C(priceU, r) + ',2)),"NO CHANGE","OK")))))))))))';
      var chinaUpYour = 'IF(OR(' + C(chinaI, r) + '<>1,' + C(yourU, r) + '="",' + C(basePriceI, r) + '="",NOT(ISNUMBER(' + C(yourU, r) + ')),NOT(ISNUMBER(' + C(basePriceI, r) + '))),FALSE,' + C(yourU, r) + '>' + C(basePriceI, r) + '+0.001)';
      var yourChk = 'IF(' + C(weeklyEngI, r) + '=1,"WEEKLY HOLD",IF(' + chinaUpYour + ',"CHINA RAISE",IF(AND(' + C(packI, r) + '=1,' + SB.checkPost + '=0),"CHECK POSTAGE",IF(' + C(yourU, r) + '<=0,"NO PRICE",IF(' + prof(C(yourU, r)) + '<=0,"LOSS",IF(AND(IF(' + C(t5MinI, r) + '<>"",' + C(t5MinI, r) + ',' + C(engFloorI, r) + ')<>"",' + C(yourU, r) + '<IF(' + C(t5MinI, r) + '<>"",' + C(t5MinI, r) + ',' + C(engFloorI, r) + ')-0.00001),"UNDER FLOOR",IF(AND(' + C(engCapI, r) + '<>"",' + C(yourU, r) + '>' + C(engCapI, r) + '+0.00001,IF(' + C(basePriceI, r) + '="",TRUE,' + C(yourU, r) + '>' + C(basePriceI, r) + '+0.00001)),"OVER CAP",IF((' + C(yourU, r) + '*(1-' + SB.fee + ')-(' + C(costI, r) + '*' + C(multI, r) + '+' + C(basePostI, r) + '+' + C(colI, r) + '))/' + C(costI, r) + '<' + SB.safeMin + ',"UNDER FLOOR",IF(AND(' + C(chinaI, r) + '=1,(' + C(yourU, r) + '*(1-' + SB.fee + ')-(' + C(costI, r) + '*' + C(multI, r) + '+' + C(basePostI, r) + '+' + C(colI, r) + '))/' + C(costI, r) + '<1),"UNDER FLOOR",IF(ROUND(' + C(yourU, r) + ',2)=ROUND(' + C(basePriceI, r) + ',2),"NO CHANGE","OK"))))))))))';
      setF(showCheck, 'IF(OR(' + C(postStat, r) + '="CONFLICT",' + C(priceStat, r) + '="CONFLICT",' + C(yourStat, r) + '="CONFLICT",' + C(incStat, r) + '="CONFLICT"),"CONFLICT",IF(OR(' + C(postStat, r) + '="INVALID",' + C(priceStat, r) + '="INVALID",' + C(yourStat, r) + '="INVALID",' + C(incStat, r) + '="INVALID"),"INVALID",IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE",' + C(yourStat, r) + '="BASE"),' + C(engCheckI, r) + ',IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE"),' + yourChk + ',' + reChk + '))))');
      setF(showInc, 'IF(OR(' + C(showCheck, r) + '="CONFLICT",' + C(showCheck, r) + '="INVALID"),"No",IF(' + C(incStat, r) + '="OK",IF(' + C(incVal, r) + '="No","No",IF(' + C(showCheck, r) + '="OK","Yes","No")),IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE",' + C(yourStat, r) + '="BASE"),' + C(engIncI, r) + ',IF(' + C(showCheck, r) + '="OK","Yes","No"))))');
      var whyCore = 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE",' + C(yourStat, r) + '="BASE",' + C(incStat, r) + '="BASE"),' + C(engReasonI, r) + ',IF(' + C(showCheck, r) + '="CONFLICT","Two tabs have different review numbers for this SKU. Clear one so only one value remains.",IF(' + C(showCheck, r) + '="INVALID","A review cell is not a valid number. Postage may be 0. Prices must be above 0.",IF(' + C(showCheck, r) + '="CHECK POSTAGE","Heavy pack: type the checked postage in Postage review (0 is allowed). Include Yes alone does not clear it.",IF(' + C(showCheck, r) + '="CHINA RAISE","China raise is review only and is not on the upload.",IF(' + C(showCheck, r) + '="WEEKLY HOLD","Margin too low (UK) was already changed in the last 3 days.",IF(' + C(showCheck, r) + '="OK",IF(' + C(yourStat, r) + '="OK","Your price (final override)","Suggestion recalculated from the review"),' + C(showCheck, r) + ')))))))';
      var bigNote = 'IF(OR(' + C(showFinal, r) + '="",' + C(priceU, r) + '="",' + C(priceU, r) + '=0),"",IF(ABS(' + C(showFinal, r) + '-' + C(priceU, r) + ')/ABS(' + C(priceU, r) + ')>0.2,"Big move: more than 20% change. ",""))';
      setF(showWhy, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE",' + C(yourStat, r) + '="BASE",' + C(incStat, r) + '="BASE"),' + C(engReasonI, r) + ',' + bigNote + '&(' + whyCore + '))');
      setF(showCap, 'IF(AND(' + C(postStat, r) + '="BASE",' + C(priceStat, r) + '="BASE"),IF(' + C(engCapI, r) + '="","",' + C(engCapI, r) + '),' + C(capP, r) + ')', M);
      setF(showNewPc, 'IF(OR(' + C(showNewP, r) + '="",' + C(costI, r) + '=""),"",' + C(showNewP, r) + '/' + C(costI, r) + ')', PC);
      var qualUK = 'AND(' + C(showInc, r) + '="Yes",' + C(showCheck, r) + '="OK",' + C(2, r) + '="UK")';
      var qualCN = 'AND(' + C(showInc, r) + '="Yes",' + C(showCheck, r) + '="OK",' + C(2, r) + '="China")';
      setF(runUK, (idx === 0 ? 'IF(' + qualUK + ',1,0)' : C(runUK, r - 1) + '+IF(' + qualUK + ',1,0)'));
      setF(runCN, (idx === 0 ? 'IF(' + qualCN + ',1,0)' : C(runCN, r - 1) + '+IF(' + qualCN + ',1,0)'));
      setF(upUK, 'IF(' + qualUK + ',' + C(runUK, r) + ',"")', IN);
      setF(upCN, 'IF(' + qualCN + ',' + C(runCN, r) + ',"")', IN);
      return row;
    });
    var calcHead = names.map(function (n) { return [n, null, 14, 'hide']; });
    calcHead[0] = ['SKU', null, 20];

    function v(val, z) { if (val == null || val === '') return null; return { t: typeof val === 'number' ? 'n' : 's', v: val, z: z }; }
    var calcLast = Math.max(4, recs.length + 1);
    function fml(col, rr, z, aligned) {
      if (!aligned) return { t: 'n', f: 'IFERROR(INDEX(\'' + CALC + '\'!$' + ref(col) + '$2:$' + ref(col) + '$' + calcLast + ',MATCH(A' + rr + ',\'' + CALC + '\'!$A$2:$A$' + calcLast + ',0)),"")', z: z };
      var cr = rr - 1;
      return { t: 'n', f: 'IF(\'' + CALC + '\'!A' + cr + '=A' + rr + ',\'' + CALC + '\'!' + ref(col) + cr + ',IFERROR(INDEX(\'' + CALC + '\'!$' + ref(col) + '$2:$' + ref(col) + '$' + calcLast + ',MATCH(A' + rr + ',\'' + CALC + '\'!$A$2:$A$' + calcLast + ',0)),""))', z: z };
    }
    function inputCell(rec, field, z) {
      var c = saved[rec.sku]; if (!c) return null;
      if (field === 'post' && c.post != null) return { t: 'n', v: c.post, z: z || M };
      if (field === 'priceNow' && c.priceNow != null) return { t: 'n', v: c.priceNow, z: M };
      if (field === 'your' && c.your != null) return { t: 'n', v: c.your, z: M };
      if (field === 'inc' && (c.inc === 'Yes' || c.inc === 'No')) return { t: 's', v: c.inc, z: YESF };
      return null;
    }
    var VIS = [
      ['B&Q SKU', null, 18], ['Product', null, 36], ['Check', null, 16], ['Estimated cost', M, 14], ['UK/China', null, 12],
      ['Selling price', M, 14], ['Floor price', M, 12], ['Suggested price', M, 14], ['Profit now %', PC, 12], ['Your price', M, 12],
      ['New profit %', PC, 12], ['Buy box seller', null, 18], ['Buy box price', M, 14], ['Postage used', M, 14], ['Postage review', M, 14],
      ['Include override', null, 14], ['Final price', M, 12], ['Reason', null, 44], ['B&Q 30d sales', IN, 12]
    ];
    var GRP = [
      ['Selling price review', M, 18], ['Profit now £', M, 12], ['New profit £', M, 12], ['Include used', null, 12],
      ['Upload UK #', IN, 12], ['Upload China #', IN, 12], ['Free stock', IN, 12], ['Cap price', M, 12]
    ];
    var REVNOTE = 'Yellow cells are the only place to type. Blank = keep the calculated value. Postage may be 0. Selling price review replaces the current price and the suggestion is worked out again. Your price is the final price you want instead of the suggestion. Include override is Yes or No (blank = automatic). Other columns are in the collapsed group on the right (click +).';
    var CF_KEY = 'Colour key on profit %: RED = loss · AMBER = under the floor · BLUE = over the 80% cap · no colour = fine.';
    function profitCf(last) {
      function rules(pc, used) {
        return [
          ['neg', 'AND(ISNUMBER(' + pc + '),' + pc + '<0)'],
          ['under', 'AND(ISNUMBER(' + pc + '),' + pc + '>=0,ISNUMBER(' + used + '),ISNUMBER($G3),' + used + '<$G3-0.00001)'],
          ['blue', 'AND(ISNUMBER(' + pc + '),' + pc + '>=0,ISNUMBER(' + used + '),ISNUMBER($AA3),' + used + '>$AA3+0.00001)']
        ];
      }
      return [
        { sqref: 'I3:I' + last, rules: rules('I3', '$F3') },
        { sqref: 'K3:K' + last, rules: rules('K3', '$Q3') }
      ];
    }
    function revSheet(name, list, top, opts) {
      opts = opts || {};
      var aligned = name === T6;
      var rows = list.map(function (rec, i) {
        var rr = i + 3;
        return [
          v(rec.sku), v(rec.title), fml(showCheck, rr, null, aligned), v(rec.cost, M), v(rec.uk),
          fml(showPrice, rr, M, aligned), fml(showFloor, rr, M, aligned), fml(showSugg, rr, M, aligned), fml(showPc, rr, PC, aligned),
          opts.readonly ? null : inputCell(rec, 'your', M),
          fml(showNewPc, rr, PC, aligned), v(rec.seller), v(rec.bb, M), fml(showPost, rr, M, aligned),
          opts.readonly ? null : inputCell(rec, 'post', M),
          opts.readonly ? null : inputCell(rec, 'inc'),
          fml(showFinal, rr, M, aligned), fml(showWhy, rr, null, aligned), v(rec.sales, IN),
          opts.readonly ? null : inputCell(rec, 'priceNow', M),
          fml(showProfit, rr, M, aligned), fml(showNewP, rr, M, aligned), fml(showInc, rr, null, aligned),
          fml(upUK, rr, IN, aligned), fml(upCN, rr, IN, aligned), v(rec.stock, IN), fml(showCap, rr, M, aligned)
        ];
      });
      var cols = VIS.map(function (c) { return c.slice(); }).concat(GRP.map(function (c) { return [c[0], c[1], c[2], 'group']; }));
      var last = Math.max(3, 2 + rows.length);
      var out = { name: name, top: (top || REVNOTE) + '  ' + CF_KEY, cols: cols, rows: rows, freeze: { x: 1, y: 2 }, filter: true, cf: profitCf(last), notes: { 'Postage review': 'Type a postage, or 0. Leave blank to keep Postage used.', 'Selling price review': 'Corrects the current selling price. The suggestion is recalculated. This is not Your price.', 'Your price': 'Optional final price. Safety rules still apply. Leave blank to use the suggestion.', 'Include override': 'Yes or No. Blank keeps the automatic decision. Yes cannot bypass a floor, a raise over the cap, a China raise, a weekly hold or postage that is still unchecked.' } };
      if (!opts.readonly) out.inputs = [14, 19, 9, 15];
      return out;
    }
    var byTab = { 2: [], 3: [], 4: [], 5: [], china: [] };
    recs.forEach(function (rec) { if (byTab[rec.tab]) byTab[rec.tab].push(rec); if (rec.cat === 'raise' && rec.china) byTab.china.push(rec); });
    var loseCheap = recs.filter(function (r) { return !r.win && r.bb > 0 && r.basePrice != null && r.basePrice < r.bb - 1e-9 && !r.noData; });
    var cantWin = recs.filter(function (r) { return r.act === "Can't win (floor)"; });
    var Book = (typeof BQBook !== 'undefined') ? BQBook : require('./bq_book.js');
    var inactivePack = Book.inactiveFix ? Book.inactiveFix(P, input.aoa || [], input.offers || (input.settings && input.settings.offers) || {}, S) : { rows: [] };
    var list = [];
    /* Calculation sheets first so a full pass resolves each SKU once, then the visible tabs read those results. Hidden, so the workbook still opens on Rules. */
    list.push({ name: SET, hide: true, cols: [['Setting', null, 20], ['Value', null, 16]], rows: setRows.map(function (r) { return [v(r[0]), r[1] === '' || r[1] == null ? null : { t: 'n', v: r[1] }]; }), freeze: { x: 0, y: 1 }, filter: false });
    list.push({ name: CALC, hide: true, cols: calcHead, rows: calcRows, freeze: { x: 1, y: 1 }, filter: false });
    list.push(Book.rulesSheet({ settings: S, recs: recs, asOf: S.asOf || input.asOf || '' }));
    list.push(revSheet(T6, recs, 'Every product, sorted by projected profit % (losses first). Filter Check to OK to see upload rows. A suggestion that appears after you type a review shows up here and on Final without retyping. Yellow cells are inputs; other columns are in the collapsed group on the right (click +).'));
    list.push(finalSheet(T7A, upUK, showFinal, recs.length, 'UK prices only. Formulas from Combined. Do not type on this tab. China raises are never listed. Losses and under-floor rows never appear here.'));
    list.push(finalSheet(T7B, upCN, showFinal, recs.length, 'China prices only. Raises are never listed. Do not type on this tab.'));
    list.push(revSheet(T4, byTab[4], 'Can win the buy box. Yellow Postage review and Selling price review flow to Combined and Final.'));
    list.push(revSheet(T3, byTab[3], 'Winning, 0 sales. A price review recalculates the quarter-gap suggestion. Yellow cells only.'));
    list.push(revSheet(T2, byTab[2], 'Winning and in range. Type in the yellow cells if a postage or the current price needs a correction.'));
    list.push(loseCheapSheet(loseCheap));
    list.push(cantWinSheet(cantWin));
    list.push(revSheet(T5, byTab[5], 'Margin too low. UK cut uses a 60% floor and a 65% minimum, 5% off, and will not repeat within 3 days. Exactly 3 days is allowed. Yellow cells only.'));
    list.push(tab1(recs, input.aoa, showPost, showPrice, showProfit, showPc, showFloor, showSugg, showCheck, showWhy));
    list.push(revSheet(TC, byTab.china, 'China raises — review only. They never go on the upload. Typing a higher price does not put them on Final.'));
    list.push(chinaListing(recs));
    list.push(inactiveSheet(inactivePack.rows || []));
    var counts = { all: recs.length, t6: recs.length, t7uk: 0, t7cn: 0, chinaRaiseReview: byTab.china.length, checkPost: 0, t9: recs.filter(function (r) { return r.china && !(r.sales >= 1); }).length, loseCheap: loseCheap.length, cantWin: cantWin.length, inactive: (inactivePack.rows || []).length, inactiveMeta: { compared: inactivePack.compared, differ: inactivePack.differ, same: inactivePack.same, skipped: inactivePack.skipped, accessN: inactivePack.accessN } };
    recs.forEach(function (rec) {
      if (rec.engCheck === 'OK' && rec.engInc === 'Yes') { if (rec.uk === 'China') counts.t7cn++; else counts.t7uk++; }
      if (rec.engCheck === 'CHECK POSTAGE') counts.checkPost++;
    });
    counts.t7 = counts.t7uk + counts.t7cn;
    return { list: list, counts: counts, cols: { showPost: showPost, showPrice: showPrice, showProfit: showProfit, showSugg: showSugg, showFinal: showFinal, showCheck: showCheck, showInc: showInc, upUK: upUK, upCN: upCN } };


    function loseCheapSheet(list) {
      var rows = list.map(function (rec) {
        var gap = (rec.bb != null && rec.basePrice != null) ? rec.Pgap != null ? rec.Pgap : Math.round((rec.bb - rec.basePrice) * 100) / 100 : null;
        return [v(rec.sku), v(rec.title), v(rec.seller), v(rec.bb, M), v(rec.basePrice, M), v(gap, M), v(rec.stock, IN), v(''), v(rec.sales, IN), v(rec.engSugg, M), v(rec.engReason || ''), v(rec.engCheck || '')];
      });
      if (!rows.length) rows.push([v(''), v('No products where we are cheaper than the buy box but still losing.'), v(''), null, null, null, null, v(''), null, null, v(''), v('')]);
      return { name: T_LOSE, top: 'REVIEW ONLY. We are cheaper than the buy box but still losing. This tab does not add rows to 7a or 7b. The 10–15p raise suggestion (ending in 9) is shown when the product sold on B&Q in the last 30 days and the rules allow it.', cols: [['B&Q SKU', null, 18], ['Product', null, 36], ['Buy box seller', null, 18], ['Buy box price', M, 14], ['Our price', M, 12], ['Gap', M, 10], ['Free stock', IN, 12], ['Reviews', IN, 10], ['B&Q 30d sales', IN, 12], ['Suggested 10–15p raise', M, 18], ['Reason', null, 44], ['Check', null, 14]], rows: rows, freeze: { x: 1, y: 2 }, filter: true };
    }
    function cantWinSheet(list) {
      var rows = list.map(function (rec) {
        var below = (rec.bb != null && rec.engFloor != null) ? Math.round((rec.engFloor - rec.bb) * 100) / 100 : null;
        var note = below == null ? 'Accept, find a cheaper supplier, or stop pushing this listing.' : (below <= 0.5 ? 'The rival is only a little under our floor. Accept the loss of the buy box, or look for a slightly cheaper supplier.' : 'The rival is well under our floor. Accept, find a cheaper supplier, or stop pushing this listing.');
        return [v(rec.sku), v(rec.title), v(rec.bb, M), v(rec.engFloor, M), v(below, M), v(rec.cost, M), v(rec.basePrice, M), v(rec.engPc, PC), v(note), v(rec.engReason || '')];
      });
      if (!rows.length) rows.push([v(''), v("No products where the rival is below our floor."), null, null, null, null, null, null, v(''), v('')]);
      return { name: T_CANT, top: "REVIEW ONLY. The rival's price is below our floor, so we cannot win the buy box without going under the floor. This tab does not add rows to 7a or 7b. Optional 5% cuts stay on tab 5 and Combined.", cols: [['B&Q SKU', null, 18], ['Product', null, 36], ['Rival price', M, 12], ['Our floor', M, 12], ['How far below the floor', M, 20], ['Estimated cost', M, 14], ['Our price', M, 12], ['Profit now %', PC, 12], ['Note', null, 70], ['Reason', null, 40]], rows: rows, freeze: { x: 1, y: 2 }, filter: true };
    }
    function inactiveSheet(list) {
      var rows = (list || []).map(function (r) {
        return [v(r.sku), v(r.title), v(r.stock, IN), v(r.price, M), v(r.cost, M), v(r.post, M), v(r.pc, PC), v(r.floor, M), v(r.sugg, M), v(r.reason || '')];
      });
      if (!rows.length) rows.push([v(''), v('No inactive products at a loss or under the floor.'), null, null, null, null, null, null, null, v('')]);
      return { name: T_FIX, top: 'REPORT ONLY. These products are out of stock or not in today’s active offers. Profit is at the current B&Q price (the offers price if we have it, otherwise the Access B&Q_INV.price). They never go on 7a. The suggested price is the floor, ending in 9.', cols: [['B&Q SKU', null, 18], ['Product', null, 36], ['Free stock', IN, 12], ['Our price', M, 12], ['Estimated cost', M, 14], ['Postage', M, 12], ['Profit now %', PC, 12], ['Floor price', M, 12], ['Suggested floor price', M, 18], ['Reason', null, 40]], rows: rows, freeze: { x: 1, y: 2 }, filter: true, cf: [{ sqref: 'G3:G' + Math.max(3, 2 + Math.max(rows.length, 1)), rules: [['neg', 'AND(ISNUMBER(G3),G3<0)'], ['under', 'AND(ISNUMBER(G3),G3>=0,ISNUMBER($D3),ISNUMBER($H3),$D3<$H3-0.00001)']] }] };
    }
    function startSheet(recs) {
      var lines = [
        ['How to use this workbook', ''],
        ['Where you type', 'Yellow cells only: Postage review, Selling price review, Your price, Include override. White cells are formulas.'],
        ['Blank cells', 'A blank yellow cell keeps the calculated value. It does not delete a saved check on the website.'],
        ['Zero postage', 'Type 0 if the real postage is zero. That is a real correction.'],
        ['Selling price review', 'This corrects the current selling price. The suggestion, profit and Final price are worked out again. It is not Your price.'],
        ['Your price', 'This is the final price you want, instead of the suggestion. Floors, the cap, China raises and the weekly hold still apply.'],
        ['One SKU, many tabs', 'Type the correction on the tab you are reviewing. Combined and Final follow that SKU. You do not retype it.'],
        ['If two tabs disagree', 'The row shows CONFLICT and stays off the upload. Clear one yellow cell so only one value is left. The file cannot tell which edit was last.'],
        ['Heavy packs', 'Multi-packs at or above 14999g, or with no weight, stay off the upload until Postage review has a number (0 is allowed).'],
        ['What never uploads', 'A loss, a price under the floor, a raise over the UK cap, a China raise, a UK margin cut repeated within 3 days, a conflict, or an invalid number.'],
        ['Losing, already cheaper', 'We are below the buy box but still losing. If the product sold on B&Q in the last 30 days, the suggestion rises to 10–15p under the buy box and ends in 9. With 0 sales the price stays. It never goes over the 80% cap or under the floor. A China increase stays on the review tab and is not uploaded.'],
        ['China, 0 sales', 'Tab 9 lists every China product with no B&Q sales in 30 days, so the listing can be checked. Listing notes and Done stay on that tab. They do not change Combined, the final prices, or the upload.'],
        ['Final tabs', '7a and 7b are the B&Q upload layout. They fill themselves. Do not type on them.'],
        ['This computer', 'Excel recalculates this file. You do not upload it to the website to see the new profit. The website remembers checks only after you use Import checked workbook, and only in that browser.'],
        ['Products', String(recs.length)]
      ];
      return { name: START, cols: [['Item', null, 28], ['What to do', null, 110]], rows: lines.map(function (r) { return [v(r[0]), v(r[1])]; }), freeze: { x: 0, y: 1 }, filter: false, wrap: true };
    }
    function tab1(recs, aoa, showPost, showPrice, showProfit, showPc, showFloor, showSugg, showCheck, showWhy) {
      var by = {}; recs.forEach(function (r) { by[r.sku] = r; });
      var hd = (aoa && aoa[0]) ? aoa[0].map(function (h) { return h == null ? '' : String(h); }) : ['sku', 'Variant description', 'Estimated cost', 'Weight', 'B&Q 30d', 'Main supplier name'];
      var skuAt = hd.indexOf('sku'); if (skuAt < 0) skuAt = 0;
      var cols = hd.map(function (h) { return [h || ' ', null, 16, 'raw']; }).concat([['Postage used', M, 12], ['Price now used', M, 12], ['Profit now £', M, 12], ['Profit now %', PC, 12], ['Floor price', M, 12], ['Suggested price', M, 14], ['Check', null, 16], ['Reason', null, 40]]);
      var t1In = 40;
      while (cols.length < t1In) cols.push([' ', null, 3, 'hide']);
      cols[t1In] = ['Postage review', M, 16]; cols[t1In + 1] = ['Selling price review', M, 18]; cols[t1In + 2] = ['Your price', M, 12]; cols[t1In + 3] = ['Include override', null, 16];
      SRC[0][1] = L(t1In); SRC[0][2] = L(t1In + 1); SRC[0][3] = L(t1In + 2); SRC[0][4] = L(t1In + 3);
      var body = [];
      var source = (aoa && aoa.length > 1) ? aoa.slice(1) : recs.map(function (r) { return [r.sku, r.title, r.cost, r.w, r.sales, r.sup]; });
      var seen = {};
      source.forEach(function (raw) {
        var sku = raw[skuAt] == null ? '' : String(raw[skuAt]).trim();
        if (!sku) return;
        var rr = body.length + 3;
        var dup = !!seen[sku]; seen[sku] = 1;
        var rec = by[sku];
        var line = hd.map(function (_, j) { return v(raw[j]); });
        while (line.length < cols.length) line.push(null);
        if (rec && !dup) {
          line[hd.length] = fml(showPost, rr, M); line[hd.length + 1] = fml(showPrice, rr, M); line[hd.length + 2] = fml(showProfit, rr, M); line[hd.length + 3] = fml(showPc, rr, PC); line[hd.length + 4] = fml(showFloor, rr, M); line[hd.length + 5] = fml(showSugg, rr, M); line[hd.length + 6] = fml(showCheck, rr); line[hd.length + 7] = fml(showWhy, rr);
          line[t1In] = inputCell(rec, 'post', M); line[t1In + 1] = inputCell(rec, 'priceNow', M); line[t1In + 2] = inputCell(rec, 'your', M); line[t1In + 3] = inputCell(rec, 'inc');
        } else if (dup) line[hd.length + 7] = v('Duplicate SKU — type on the first row of this SKU');
        body.push(line);
      });
      /* formulas on _Calc were built with AO before we might have moved t1In. If t1In isn't 40, rebuild is too late.
         Caller must keep access width under 40. We force inputs at 40 and hide gap columns. If hd is long, MATCH still uses column A only if sku is column A.
         Rebuild gather letters: if t1In!==40 the _Calc formulas already say AO. So we MUST place inputs at column 40 (AO). */
      return { name: T1, top: 'All products. Yellow Postage review, Selling price review, Your price and Include override are at columns AO–AR. Other columns are the Access paste or formulas. Duplicate SKUs: edit the first row only.', cols: cols, rows: body, freeze: { x: 1, y: 2 }, filter: true, inputs: [40, 41, 42, 43] };
    }
    function finalSheet(name, upCol, finCol, n, note) {
      var rows = [], N = Math.max(n, 1);
      var skuRg = "'" + CALC + "'!$A$2:$A$" + calcLast;
      var upRg = "'" + CALC + "'!$" + ref(upCol) + "$2:$" + ref(upCol) + "$" + calcLast;
      var finRg = "'" + CALC + "'!$" + ref(finCol) + "$2:$" + ref(finCol) + "$" + calcLast;
      for (var i = 0; i < N; i++) {
        rows.push([{ t: 's', f: 'IFERROR(INDEX(' + skuRg + ',MATCH(ROW()-2,' + upRg + ',0)),"")' }, { t: 'n', f: 'IFERROR(INDEX(' + finRg + ',MATCH(ROW()-2,' + upRg + ',0)),"")', z: '0.00' }]);
      }
      var T = (input.template && input.template.Data) || [['Offer SKU', 'Offer price', 'Discount price', 'Discount start date', 'Discount end date'], ['offer-sku', 'price', 'discount-price', 'discount-start-date', 'discount-end-date']];
      return { name: name, cols: [[T[0][0], null, 24], [T[0][1], null, 14], [T[0][2], null, 16], [T[0][3], null, 22], [T[0][4], null, 22]], head2: T[1], rows: rows, freeze: { x: 0, y: 2 }, filter: false, notes: { 0: note } };
    }
    function tab8(rows8) {
      var cols = [['B&Q SKU', null, 20], ['Product', null, 40], ['UK/China', null, 12], ['Estimated cost', M, 14], ['Postage', M, 12], ['Free stock', IN, 12], ['B&Q 30d sales', IN, 14], ['Price now', M, 12], ['Profit now £', M, 12], ['Profit now %', PC, 12], ['Buy box price', M, 14], ['Buy box seller', null, 18], ['Floor price', M, 12], ['Suggested price', M, 14], ['New profit £', M, 12], ['New profit %', PC, 12], ['Reason', null, 44], ['Other platform 30d sales', IN, 18]];
      var rows = (rows8 || []).map(function (e) {
        if (e && e.x && e.x.o) {
          var o = e.x.o;
          return [v(o.sku), v(o.title || ''), v(o.china ? 'China' : 'UK'), v(o.cost, M), v(o.post, M), v(o.stock, IN), v(o.sales || 0, IN), v(o.priceBlank ? null : o.price, M), v(o.profit, M), v(o.pc, PC), v(o.bb, M), v(o.seller || ''), v(o.floor, M), null, null, null, v(e.why || ''), v(e.s && e.s.other, IN)];
        }
        return [v(e.sku), v(e.title || ''), v(e.uk || ''), v(e.cost, M), v(e.post, M), v(e.stock, IN), v(e.sales, IN), v(e.price, M), v(e.profit, M), v(e.pc, PC), v(e.bb, M), v(e.seller || ''), v(e.floor, M), null, null, null, v(e.why || 'Report only'), v(e.other, IN)];
      });
      if (!rows.length) rows.push([v(''), v(''), v(''), null, null, null, null, null, null, null, null, v(''), null, null, null, null, v('No rows. This tab never feeds Combined or Final, even if you type here.'), null]);
      return { name: T8, top: 'REPORT ONLY. This tab does not change postage, prices, Combined or the upload. Typing here has no effect on Final.', cols: cols, rows: rows, freeze: { x: 1, y: 2 }, filter: true };
    }
    function linkCell(url) {
      var s = url == null ? '' : String(url).trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return { t: 's', v: s, l: { Target: s } };
      return v(s);
    }
    function chinaListing(list) {
      var rows = list.filter(function (r) { return r.china && !(r.sales >= 1); }).sort(function (a, b) {
        var as = a.stock == null ? -1e99 : +a.stock, bs = b.stock == null ? -1e99 : +b.stock;
        return bs - as || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
      }).map(function (r) {
        return [v(r.sku), v(r.title), v(r.ean || ''), linkCell(r.url), v(r.basePrice, M), v(r.bb, M), v(r.seller || ''), v(r.win ? 'Yes' : 'No'), v(r.stock, IN), v(r.engFloor, M), v(r.engPc, PC), v(r.engReason || ''), null, null];
      });
      if (!rows.length) rows.push([v(''), v('No China products with 0 B&Q sales.'), v(''), null, null, null, v(''), v(''), null, null, null, v(''), null, null]);
      return { name: T9, top: 'Listing check only. Every China product with no B&Q sales in 30 days. Listing notes and Done do not change Combined or the upload. A blank Done means not finished.', cols: [['SKU', null, 20], ['Product', null, 40], ['EAN', null, 16], ['Listing URL', null, 36], ['Price now', M, 12], ['Buy box price', M, 14], ['Buy box seller', null, 18], ['Winning?', null, 12], ['Free stock', IN, 12], ['Floor price', M, 12], ['Profit now %', PC, 12], ['Reason', null, 44], ['Listing notes', null, 28], ['Done', null, 12]], rows: rows, freeze: { x: 1, y: 2 }, filter: true, inputs: [12, 13], notes: { 'Listing notes': 'For you. This note is not imported and does not change a price.', 'Done': 'Type Yes when the listing has been checked. Leave blank until then.' } };
    }
  }

  function txt(u) { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u); return Buffer.from(u).toString('utf8'); }
  function bin(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); return new Uint8Array(Buffer.from(s, 'utf8')); }
  function forceCalc(X, bytes) {
    var Z = X.CFB.read(new Uint8Array(bytes), { type: 'array' });
    var i = Z.FullPaths.findIndex(function (q) { return q.slice(-'xl/workbook.xml'.length) === 'xl/workbook.xml'; });
    if (i < 0) return bytes;
    var s = txt(Z.FileIndex[i].content);
    if (/<calcPr[\s>]/.test(s)) s = s.replace(/<calcPr\b[^>]*\/?>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
    else s = s.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
    /* Hidden sheets still calculate in Excel. Gnumeric's test recalc also calculates them. */
    Z.FileIndex[i].content = bin(s);
    return new Uint8Array(X.CFB.write(Z, { fileType: 'zip', type: 'array', compression: true }));
  }

  function normStore(s) {
    var o = { v: 1, updated: (s && s.updated) || '', items: {} };
    var items = s && s.items || {};
    Object.keys(items).forEach(function (sku) {
      var it = items[sku]; if (!it || typeof it !== 'object') return;
      var k = String(sku).trim(); if (!k || k.length > 80) return;
      var n = {};
      if (it.post != null) { var p = num(it.post); if (p != null && p >= 0 && p < 1e7) n.post = rnd2(p); }
      if (it.priceNow != null) { var q = num(it.priceNow); if (q != null && q > 0 && q < 1e7) n.priceNow = rnd2(q); }
      if (it.your != null) { var y = num(it.your); if (y != null && y > 0 && y < 1e7) n.your = rnd2(y); }
      if (it.inc === 'Yes' || it.inc === 'No') n.inc = it.inc;
      if (n.post != null || n.priceNow != null || n.your != null || n.inc) { n.at = typeof it.at === 'string' ? it.at.slice(0, 40) : ''; o.items[k] = n; }
    });
    return o;
  }
  function applyPreview(store, preview) {
    var next = normStore(store); next.updated = new Date().toISOString();
    (preview.changes || []).forEach(function (ch) {
      if (!ch || ch.unknown || ch.dup || ch.conflict) return;
      var cur = next.items[ch.sku] ? Object.assign({}, next.items[ch.sku]) : {};
      [['post', 'postValue'], ['priceNow', 'priceValue'], ['your', 'yourValue'], ['inc', 'incValue']].forEach(function (pair) {
        var op = ch[pair[0]]; if (op === 'set') cur[pair[0]] = ch[pair[1]]; else if (op === 'clear') delete cur[pair[0]];
      });
      cur.at = next.updated;
      if (cur.post == null && cur.priceNow == null && cur.your == null && !cur.inc) delete next.items[ch.sku];
      else next.items[ch.sku] = cur;
    });
    return normStore(next);
  }
  function backup(store) { var s = normStore(store); return { bqCheckedBackup: 1, savedIn: 'this browser', exportedAt: new Date().toISOString(), note: 'Checks saved in one browser. Not synced to other devices. Not the pricing workbook.', items: s.items }; }
  function restoreBackup(obj) {
    if (!obj || obj.bqCheckedBackup !== 1 || !obj.items || typeof obj.items !== 'object' || Array.isArray(obj.items)) return { ok: false, error: 'This is not a checks backup.' };
    return { ok: true, store: normStore({ v: 1, items: obj.items, updated: obj.exportedAt || '' }) };
  }

  function headerKey(h) {
    h = String(h || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (h === 'b&q sku' || h === 'sku' || h === 'offer sku' || h === 'selling sku') return 'sku';
    if (h === 'postage review') return 'postIn';
    if (h === 'selling price review') return 'priceIn';
    if (h === 'your price' || h === 'your price (type here)') return 'your';
    if (h === 'include override') return 'incIn';
    if (h === 'include? (yes/no)' || h === 'include') return 'incLegacy';
    if (h === 'postage' || h === 'postage used') return 'postLegacy';
    if (h === 'postage auto' || h === 'postage written') return h === 'postage auto' ? 'postAuto' : 'postWritten';
    if (h === 'include default' || h === 'include written') return h === 'include default' ? 'incDefault' : 'incWritten';
    return null;
  }
  function readCell(cell) {
    if (!cell) return { blank: true };
    if (cell.f) return { formula: true };
    if (cell.v == null || cell.v === '') return { blank: true };
    return { v: cell.v };
  }
  function readMoney(cell, allow0) {
    var c = readCell(cell); if (c.blank) return c; if (c.formula) return c;
    var n = num(c.v); if (n == null) return { bad: 'not a number' };
    if (n < 0 || (!allow0 && !(n > 0)) || n > 1e7) return { bad: allow0 ? 'postage must be 0 or more' : 'price must be above 0' };
    return { value: rnd2(n) };
  }
  function readInc(cell) {
    var c = readCell(cell); if (c.blank) return c; if (c.formula) return c;
    var t = String(c.v).trim().toLowerCase();
    if (t === 'yes' || t === 'y') return { value: 'Yes' }; if (t === 'no' || t === 'n') return { value: 'No' };
    return { bad: 'not Yes or No' };
  }
  function findHeader(X, ws) {
    if (!ws || !ws['!ref']) return null;
    var range = X.utils.decode_range(ws['!ref']), best = null;
    for (var r = range.s.r; r <= Math.min(range.e.r, range.s.r + 6); r++) {
      var map = {}, dups = [];
      for (var c = range.s.c; c <= range.e.c; c++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })]; if (!cell || cell.v == null) continue;
        var k = headerKey(cell.v); if (!k) continue;
        if (map[k] != null) dups.push(k); map[k] = c;
      }
      if (map.sku != null && (map.postIn != null || map.postLegacy != null)) { best = { row: r, map: map, dups: dups }; break; }
    }
    return best;
  }
  function parseChecks(X, wb, ctx) {
    ctx = ctx || {}; var by = ctx.by || {}; var yourOn = !!ctx.yourPrice;
    var live = wb.Sheets[T6] && findHeader(X, wb.Sheets[T6]) && findHeader(X, wb.Sheets[T6]).map.postIn != null;
    var sheets = live ? [T1, T2, T3, T4, T5, T6, TC] : [T6];
    if (live && !wb.Sheets[T6]) return { ok: false, error: 'This workbook has no sheet “6 Combined upload”.' };
    if (!live && !wb.Sheets[T6]) return { ok: false, error: 'This is not the pricing workbook. Use the file from Pricing, sheet 6 Combined upload.' };
    var bag = {}, invalid = [], formulas = 0, blankKept = 0, rows = 0;
    sheets.forEach(function (name) {
      var ws = wb.Sheets[name]; if (!ws) return;
      if (name === T8) return;
      var hd = findHeader(X, ws); if (!hd) return;
      var blocking = hd.dups.filter(function (k) { return k === 'sku' || k === 'postIn' || k === 'priceIn' || k === 'your' || k === 'incIn'; });
      if (blocking.length) { invalid.push({ sku: '', field: 'header', why: name + ' has two ' + blocking[0] + ' columns' }); return; }
      var range = X.utils.decode_range(ws['!ref']);
      var seen = {};
      for (var r = hd.row + 1; r <= range.e.r; r++) {
        var skuCell = ws[X.utils.encode_cell({ r: r, c: hd.map.sku })];
        var sku = skuCell && skuCell.v != null ? String(skuCell.v).trim() : '';
        if (!sku) continue; rows++;
        if (seen[sku]) { if (!bag[sku]) bag[sku] = { sku: sku, fields: { post: [], priceNow: [], your: [], inc: [] }, dupSheets: {} }; bag[sku].dupSheets[name] = 1; continue; }
        seen[sku] = 1;
        if (!bag[sku]) bag[sku] = { sku: sku, fields: { post: [], priceNow: [], your: [], inc: [] }, dupSheets: {} };
        function take(field, col, reader) {
          if (col == null) return;
          var cell = ws[X.utils.encode_cell({ r: r, c: col })];
          var got = reader(cell);
          if (got.blank) { blankKept++; return; }
          if (got.formula) { formulas++; invalid.push({ sku: sku, field: field, why: 'formula ignored on ' + name }); return; }
          if (got.bad) { invalid.push({ sku: sku, field: field, why: got.bad + ' on ' + name }); return; }
          bag[sku].fields[field].push({ v: got.value, sheet: name });
        }
        if (live) {
          take('post', hd.map.postIn, function (c) { return readMoney(c, true); });
          take('priceNow', hd.map.priceIn, function (c) { return readMoney(c, false); });
          if (yourOn) take('your', hd.map.your, function (c) { return readMoney(c, false); });
          take('inc', hd.map.incIn, readInc);
        } else if (name === T6) {
          take('post', hd.map.postLegacy, function (c) { return readMoney(c, true); });
          if (yourOn) take('your', hd.map.your, function (c) { return readMoney(c, false); });
          take('inc', hd.map.incLegacy, readInc);
        }
      }
    });
    var changes = [], unknown = [], duplicate = [], conflicts = [];
    Object.keys(bag).forEach(function (sku) {
      var b = bag[sku];
      if (b.dupSheets && Object.keys(b.dupSheets).length) { duplicate.push(sku); changes.push({ sku: sku, dup: true }); return; }
      if (!by[sku]) { unknown.push(sku); changes.push({ sku: sku, unknown: true }); return; }
      var ch = { sku: sku, post: 'keep', priceNow: 'keep', your: 'keep', inc: 'keep' };
      function fold(field, auto) {
        var list = b.fields[field]; if (!list.length) return;
        var first = list[0].v, clash = list.some(function (x) { return typeof first === 'number' ? !moneyEq(x.v, first) : x.v !== first; });
        if (clash) { ch.conflict = field; conflicts.push(sku + ' ' + field); return; }
        if (field === 'post' && !live && auto != null && moneyEq(first, auto)) return;
        if (field === 'inc' && !live && auto != null && first === auto) return;
        if (field === 'priceNow' && !live && auto != null && moneyEq(first, auto)) return;
        ch[field] = 'set'; ch[field + 'Value'] = first;
      }
      var info = by[sku];
      fold('post', live ? null : info.postAuto);
      fold('priceNow', live ? null : info.priceNow);
      if (yourOn) fold('your', null);
      fold('inc', live ? null : info.incDefault);
      changes.push(ch);
    });
    var count = function (op, field) { return changes.filter(function (c) { return c[field] === op; }).length; };
    return { ok: true, live: !!live, sheet: live ? 'review tabs' : T6, where: 'this browser', rows: rows, changes: changes, unknown: unknown, duplicate: duplicate, conflicts: conflicts, invalid: invalid, formulas: formulas, blankKept: blankKept,
      counts: { postage: count('set', 'post'), sellingPrice: count('set', 'priceNow'), your: count('set', 'your'), include: count('set', 'inc'), unknown: unknown.length, duplicate: duplicate.length, conflict: conflicts.length, invalid: invalid.length, formulas: formulas, blank: blankKept } };
  }

  /* Same formula copied down a column is stored once (Excel shared formula). Relative refs still move with the row.
     Excel (Microsoft 365) rejects a shared formula that points at another sheet ('Sheet'!A1) and shows
     "We found a problem with some content". So only same-sheet formulas are shared; the rest stay written out in full (10 Nov 2026). */
  function noStrings(f) { return String(f).replace(/"(?:[^"]|"")*"/g, '""'); }
  function otherSheet(f) { return noStrings(f).indexOf('!') >= 0; }
  function adjustRef(formula, delta) {
    if (!delta) return formula;
    return String(formula).split(/("(?:[^"]|"")*"|&quot;[\s\S]*?&quot;)/).map(function (part, i) {
      if (i % 2) return part; /* text in quotes is never a cell reference */
      return part.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, function (all, ca, col, ra, row) {
        if (ra === '$') return all;
        return ca + col + String(+row + delta);
      });
    }).join('');
  }
  function shareSheetXml(xml) {
    var re = /<c r="([A-Z]+)(\d+)"([^>]*)><f([^>]*)>([\s\S]*?)<\/f>/g, groups = {}, m;
    while ((m = re.exec(xml))) {
      if (/t="shared"/.test(m[4])) continue;
      if (otherSheet(m[5].replace(/&apos;/g, "'").replace(/&quot;/g, '"'))) continue;
      var col = m[1];
      if (!groups[col]) groups[col] = [];
      groups[col].push({ row: +m[2], f: m[5], at: m.index, len: m[0].length, open: m[0] });
    }
    var reps = [], si = 0;
    Object.keys(groups).forEach(function (col) {
      var list = groups[col].sort(function (a, b) { return a.row - b.row; });
      var run = [];
      function flush() {
        if (run.length < 2) { run = []; return; }
        var master = run[0], ok = true;
        for (var i = 1; i < run.length; i++) {
          if (adjustRef(master.f, run[i].row - master.row) !== run[i].f) { ok = false; break; }
        }
        if (!ok) { run = []; return; }
        var ref = col + master.row + ':' + col + run[run.length - 1].row, id = si++;
        reps.push({ at: master.at, len: master.len, text: master.open.replace('<f>', '<f t="shared" ref="' + ref + '" si="' + id + '">') });
        for (var j = 1; j < run.length; j++) reps.push({ at: run[j].at, len: run[j].len, text: run[j].open.replace(/<f[^>]*>[\s\S]*<\/f>/, '<f t="shared" si="' + id + '"/>') });
        run = [];
      }
      for (var i = 0; i < list.length; i++) {
        if (run.length && list[i].row !== run[run.length - 1].row + 1) flush();
        run.push(list[i]);
      }
      flush();
    });
    reps.sort(function (a, b) { return a.at - b.at; });
    var out = [], prev = 0;
    reps.forEach(function (r) { out.push(xml.slice(prev, r.at)); out.push(r.text); prev = r.at + r.len; });
    out.push(xml.slice(prev));
    return out.join('');
  }
  function shareFormulas(X, bytes) {
    var Z = X.CFB.read(new Uint8Array(bytes), { type: 'array' });
    Z.FileIndex.forEach(function (f, i) {
      var p = Z.FullPaths[i] || '';
      if (!/xl\/worksheets\/sheet\d+\.xml$/.test(p)) return;
      var s = txt(f.content);
      var n = shareSheetXml(s);
      if (n !== s) f.content = bin(n);
    });
    return new Uint8Array(X.CFB.write(Z, { fileType: 'zip', type: 'array', compression: true }));
  }
  return { make: make, outcome: outcome, parseChecks: parseChecks, normStore: normStore, applyPreview: applyPreview, backup: backup, restoreBackup: restoreBackup, forceCalc: forceCalc, shareFormulas: shareFormulas, T6: T6, T8: T8, SRC: SRC };
});
