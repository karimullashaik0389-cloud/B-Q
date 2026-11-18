/* B&Q Duplicates builder (browser). Port of dup_tool/find_duplicates.py.
   Same grouping and Keep-fix / Check / Keep-no-fix / Delete (verified) rules.
   Live B&Q page checks and the optional AI second opinion cannot run in the browser,
   so Delete (verified) is empty and those rows go to Check — same as the Python tool without --live.
   No keys. Nothing is sent anywhere. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.BQDupsBuild = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIMILAR_PCT = 30, HIGH_SALES = 10, LOW_SIMILAR_UNITS = 2, FIX_BELOW = 6, OUR_SELLER = 'Diva Package';
  var BANNED_BRANDS = ['supergift', 'ovovo'];
  var COLOURS = setOf('black white red green blue yellow grey gray silver gold brown pink purple orange clear cream beige ivory oak walnut teak pine chrome brass copper bronze natural multicolour multicolor transparent navy charcoal anthracite mahogany ebony');
  var MATERIALS = setOf('steel stainless metal iron aluminium aluminum plastic wood wooden timber glass rubber pvc nylon cotton polyester ceramic resin concrete stone brass copper bamboo foam vinyl acrylic silicone latex leather fabric jute wax paper cardboard');
  var USE_WORDS = setOf('for indoor outdoor garden home kitchen bathroom shed fence decking wall floor door window car garage office christmas festive pet dog cat plants lawn diy wood metal interior exterior');
  var STOP = setOf('a an and the of with for in on to by from x pack set piece pcs');
  var PROMPT_LEAK = /no writing on the image|setting works best|keep the [a-z ]+ (large|visible)|main focus|image prompt|generate an image|photorealistic|softly blurred/i;
  var VARIANT_MERGES = {'WEE-PAT-1L-1':'WEE-PAT-CL1-1','FSH-BLD-BNE-1':'FSH-BLD-1KG-1','WES-HOU-10L-011':'WES-HOU-10L-1'};

  function setOf(s) { var o = {}; s.split(/\s+/).forEach(function (w) { o[w] = 1; }); return o; }
  function escEnt(s) {
    return String(s == null ? '' : s)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function strip(v) { return String(v == null ? '' : v).trim(); }

  function parseCSV(text) {
    var first = (text.split(/\r?\n/, 1)[0] || '');
    var sep = (first.split(';').length > first.split(',').length) ? ';' : ',';
    var rows = [], i = 0, cur = '', row = [], q = false;
    function pushCell() { row.push(cur); cur = ''; }
    function pushRow() { if (row.length > 1 || (row[0] && row[0] !== '')) rows.push(row); row = []; }
    while (i < text.length) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) pushCell();
      else if (c === '\n') { pushCell(); pushRow(); }
      else if (c !== '\r') cur += c;
      i++;
    }
    if (cur !== '' || row.length) { pushCell(); pushRow(); }
    if (!rows.length) return [];
    var heads = rows[0].map(function (h) { return String(h || '').replace(/^\uFEFF/, '').trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      heads.forEach(function (h, j) { o[h] = r[j] == null ? '' : r[j]; });
      return o;
    });
  }

  function needCols(rows, need, what, name) {
    if (!rows || !rows.length) throw new Error(what + ': ' + (name || 'that file') + ' has no rows.');
    var have = {};
    Object.keys(rows[0]).forEach(function (k) { have[k] = 1; });
    var miss = need.filter(function (c) { return !have[c]; });
    if (miss.length) throw new Error(what + ': ' + (name || 'that file') + ' is not the right export - missing columns: ' + miss.join(', '));
    return rows;
  }

  function gtinOk(e) {
    e = strip(e);
    if (!/^(?:\d{8}|\d{12,14})$/.test(e)) return false;
    var d = e.split('').map(Number), chk = d[d.length - 1], body = d.slice(0, -1).reverse();
    var s = 0;
    body.forEach(function (v, i) { s += v * (i % 2 === 0 ? 3 : 1); });
    return (10 - s % 10) % 10 === chk;
  }
  function normTokens(t) {
    t = escEnt(String(t || '')).toLowerCase();
    t = t.replace(/(\d+)\s*(ml|l|ltr|litre|litres|kg|g|mm|cm|m|ft|in|inch|w|v|pcs|pc|pack)\b/g, '$1$2');
    t = t.replace(/\b(supergift(\.com)?|ovovo|diva ?package)\b/g, ' ');
    return (t.match(/[a-z0-9]+(?:\.[0-9]+)?/g) || []).filter(function (w) { return !STOP[w]; });
  }
  function packOf(t) {
    t = String(t || '');
    var m = t.match(/^\s*(\d+)\s*x\s/i) || t.match(/\bpack of (\d+)\b(?!\s*(ml|l|g|kg|cm|mm|m)\b)/i) || t.match(/\b(\d+)\s*(?:pack|pk)\b/i);
    return m ? parseInt(m[1], 10) : null;
  }
  function skuStem(s) { return String(s).replace(/-\d+$/, ''); }

  function UF() { this.p = {}; }
  UF.prototype.f = function (x) {
    if (this.p[x] == null) this.p[x] = x;
    while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; }
    return x;
  };
  UF.prototype.u = function (a, b) {
    a = this.f(a); b = this.f(b);
    if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b);
  };

  function titleScore(title, ptype) {
    var t = escEnt(String(title || '')).trim(), L = t.length, pts = 0, why = [];
    if (L >= 110 && L <= 135) pts += 2;
    else if (L >= 70 && L <= 150) { pts += 1; why.push('length ' + L + ' (target 121-124)'); }
    else why.push('length ' + L + ' far from 121-124');
    var toks = normTokens(t), low = t.toLowerCase();
    var pt = normTokens(ptype).filter(function (w) { return w.length > 2; });
    if (pt.length && pt.every(function (w) { return low.indexOf(w.replace(/s$/, '')) >= 0; })) pts += 2;
    else if (pt.length && pt.some(function (w) { return low.indexOf(w.replace(/s$/, '')) >= 0; })) { pts += 1; why.push('product type only partly in title'); }
    else why.push('product type missing');
    if (/\d+(\.\d+)?\s*(ml|l|ltr|litre|kg|g|mm|cm|m|ft|in|inch|w|v|pcs|pack|x)\b|\bpack of\b|\d+\s*x\s/.test(low)) pts += 1;
    else why.push('no size/pack');
    var hitCM = toks.some(function (w) { return COLOURS[w] || MATERIALS[w]; });
    if (hitCM) pts += 1; else why.push('no colour/material');
    if (toks.some(function (w) { return USE_WORDS[w]; })) pts += 1; else why.push('no use words');
    var c = {};
    toks.forEach(function (w) { if (w.length > 3 && !/^\d+$/.test(w)) c[w] = (c[w] || 0) + 1; });
    var reps = Object.keys(c).filter(function (k) { return c[k] > 1; });
    if (!reps.length) pts += 1; else why.push('repeated words: ' + reps.join(','));
    if (!BANNED_BRANDS.some(function (b) { return low.indexOf(b) >= 0; })) pts += 1; else why.push('banned brand in title');
    if (t && !/(-|,|&|\(|\b(and|with|for|of|to|the))\s*$/i.test(t)) pts += 1; else why.push('looks cut off');
    return [pts, L, why.join('; ') || 'good'];
  }
  function descScore(desc, title) {
    var d = escEnt(String(desc || '').replace(/<[^>]+>/g, ' ')).trim();
    if (!d || d.toLowerCase() === 'nan') return [0, 0, 'no description'];
    var words = d.split(/\s+/).filter(Boolean), n = words.length, pts = 0, why = [];
    pts += n >= 150 ? 4 : n >= 100 ? 3 : n >= 60 ? 2 : n >= 25 ? 1 : 0;
    if (n < 100) why.push(n + ' words');
    var facts = (d.match(/\d+(\.\d+)?\s*(ml|l|kg|g|mm|cm|m|ft|w|v|%|pcs|hours?|years?|sq)/gi) || []).length;
    pts += facts >= 3 ? 2 : facts >= 1 ? 1 : 0;
    if (facts === 0) why.push('no product facts/measurements');
    var sents = d.split(/[.!?]\s+/).filter(function (s) { return s.split(/\s+/).filter(Boolean).length > 2; });
    var avg = n / Math.max(1, sents.length);
    if (avg >= 8 && avg <= 25) pts += 1; else why.push('hard to read (sentence length)');
    if (sents.length >= 3) pts += 1;
    if (!PROMPT_LEAK.test(d)) pts += 1; else why.push('contains image-prompt text, not shopper copy');
    if (d.trim().toLowerCase() !== String(title || '').trim().toLowerCase()) pts += 1;
    return [pts, n, why.join('; ') || 'good'];
  }
  function bulletScore(bullets) {
    var b = (bullets || []).filter(function (x) { return x && String(x).trim(); });
    var n = b.length;
    if (n === 0) return [0, 0, 'no key points'];
    var pts = n >= 7 ? 7 : n >= 5 ? 6 : n >= 3 ? 4 : 2, why = [];
    if (b.reduce(function (s, x) { return s + String(x).split(/\s+/).filter(Boolean).length; }, 0) / n >= 6) pts += 1;
    else why.push('very short points');
    var uniq = {};
    b.forEach(function (x) { uniq[String(x).toLowerCase().trim()] = 1; });
    if (Object.keys(uniq).length === n) pts += 1; else why.push('repeated points');
    if (b.some(function (x) { return /\d/.test(x); })) pts += 1; else why.push('no numbers/facts');
    return [Math.min(pts, 10), n, why.length ? (n + ' points; ' + why.join('; ')) : (n + ' points')];
  }
  function imageScore(n, mainPx) {
    var pts = Math.min(n, 8) + (n >= 1 ? 1 : 0);
    if (mainPx && mainPx >= 1000) pts += 1;
    return Math.min(pts, 10);
  }

  function buildGroups(T) {
    var uf = new UF(), links = {};
    function link(i, j, why) {
      if (i === j) return;
      uf.u(i, j);
      var k = i < j ? i + '\t' + j : j + '\t' + i;
      if (!links[k]) links[k] = {};
      links[k][why] = 1;
    }
    var byEan = {};
    T.forEach(function (r, i) {
      if (r.ean && r.ean.length) { (byEan[r.ean] || (byEan[r.ean] = [])).push(i); }
    });
    Object.keys(byEan).forEach(function (e) {
      var idx = byEan[e];
      for (var j = 1; j < idx.length; j++) link(idx[0], idx[j], 'same EAN');
    });
    var byVar = {};
    T.forEach(function (r, i) {
      var v = r.variant;
      if (typeof v === 'string' && v.trim()) {
        v = VARIANT_MERGES[v] || v;
        (byVar[v] || (byVar[v] = [])).push(i);
      }
    });
    Object.keys(byVar).forEach(function (v) {
      var idx = byVar[v];
      for (var j = 1; j < idx.length; j++) link(idx[0], idx[j], 'same variant code');
    });
    var byKey = {};
    T.forEach(function (r, i) {
      r._tok = normTokens(r.title);
      if (r._tok.length >= 3) {
        var nkey = r._tok.slice().sort().filter(function (w, ix, a) { return a.indexOf(w) === ix; }).join(' ');
        var st = skuStem(r.sku);
        var k = nkey + '\t' + st;
        (byKey[k] || (byKey[k] = [])).push(i);
      }
    });
    Object.keys(byKey).forEach(function (k) {
      var ii = byKey[k];
      for (var j = 1; j < ii.length; j++) link(ii[0], ii[j], 'same title');
    });
    var blocks = {};
    T.forEach(function (r, i) {
      var set = {};
      r._tok.forEach(function (w) { set[w] = 1; });
      var keys = Object.keys(set);
      if (keys.length >= 4) {
        var b = keys.filter(function (w) { return /\d/.test(w); }).sort().join(' ');
        (blocks[b] || (blocks[b] = [])).push(i);
      }
    });
    Object.keys(blocks).forEach(function (b) {
      var idx = blocks[b];
      var sets = idx.map(function (i) {
        var o = {};
        T[i]._tok.forEach(function (w) { o[w] = 1; });
        return o;
      });
      for (var x = 0; x < idx.length; x++) {
        for (var y = x + 1; y < idx.length; y++) {
          var i = idx[x], j = idx[y];
          if (skuStem(T[i].sku) !== skuStem(T[j].sku)) continue;
          var si = sets[x], sj = sets[y];
          var onlyI = Object.keys(si).filter(function (w) { return !sj[w]; });
          var onlyJ = Object.keys(sj).filter(function (w) { return !si[w]; });
          var dif = onlyI.concat(onlyJ);
          var inter = Object.keys(si).filter(function (w) { return sj[w]; }).length;
          if (dif.length > 0 && dif.length <= 2 && onlyI.length <= 1 && onlyJ.length <= 1 &&
              !dif.some(function (w) { return COLOURS[w] || MATERIALS[w]; }) &&
              !dif.some(function (w) { return /\d/.test(w); }) &&
              inter >= 5) link(i, j, 'near-identical title');
        }
      }
    });
    var groupsMap = {};
    T.forEach(function (_, i) {
      if (uf.p[i] != null) {
        var r = uf.f(i);
        (groupsMap[r] || (groupsMap[r] = [])).push(i);
      }
    });
    var groups = Object.keys(groupsMap).map(function (k) { return groupsMap[k]; })
      .filter(function (g) { return g.length > 1; })
      .map(function (g) { return g.slice().sort(function (a, b) { return T[a].sku < T[b].sku ? -1 : T[a].sku > T[b].sku ? 1 : 0; }); });
    groups.sort(function (a, b) { return T[a[0]].sku < T[b[0]].sku ? -1 : T[a[0]].sku > T[b[0]].sku ? 1 : 0; });
    return { groups: groups, links: links };
  }

  function parseDate(s) {
    s = strip(s);
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function fmtDT(d) {
    if (!d || isNaN(d)) return null;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function aoaFromXlsx(xlsx, buf, sheetName) {
    var wb = xlsx.read(buf, { type: 'array', raw: false, cellDates: false });
    var name = sheetName;
    if (name && wb.SheetNames.indexOf(name) < 0) throw new Error('no-sheet');
    var sh = wb.Sheets[name || wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
  }
  function rowsFromAoa(aoa) {
    if (!aoa || !aoa.length) return [];
    var heads = (aoa[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
    return aoa.slice(1).map(function (r) {
      var o = {};
      heads.forEach(function (h, j) { if (h) o[h] = r[j] == null ? '' : r[j]; });
      return o;
    });
  }
  function isXlsxName(n) { return /\.xlsx|\.xlsm|\.xls$/i.test(n || ''); }

  function tableFromFile(file, need, what) {
    var rows;
    if (file.rows) rows = file.rows;
    else if (isXlsxName(file.name)) {
      if (!file.xlsx) throw new Error(what + ': Excel support is not loaded.');
      try { rows = rowsFromAoa(aoaFromXlsx(file.xlsx, file.buf, file.sheet)); }
      catch (e) {
        if (e && e.message === 'no-sheet') throw new Error(what + ': ' + file.name + (file.sheet ? ' has no "' + file.sheet + '" sheet.' : ' could not be read.'));
        throw new Error(what + ': could not read ' + file.name + '. Is it a csv or xlsx export?');
      }
    } else {
      var text = file.text != null ? file.text : new TextDecoder('utf-8').decode(file.buf);
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      rows = parseCSV(text);
    }
    return needCols(rows, need, what, file.name);
  }

  function catalogFromFile(file) {
    if (!file) return null;
    if (!file.xlsx) throw new Error('Catalog export: Excel support is not loaded.');
    var aoa;
    try { aoa = aoaFromXlsx(file.xlsx, file.buf, 'Data'); }
    catch (e) {
      throw new Error('Catalog export: ' + (file.name || 'that file') + ' has no "Data" sheet - use Catalog > Export products (xlsx).');
    }
    if (!aoa.length) throw new Error('Catalog export: Data sheet is empty.');
    var labels = (aoa[0] || []).map(function (c) { return String(c == null ? '' : c); });
    if (labels.indexOf('Shop SKU') < 0 || labels.indexOf('EAN') < 0) throw new Error('Catalog export: Data sheet lacks Shop SKU / EAN columns.');
    var data = aoa.slice(2);
    function col(name) { var i = labels.indexOf(name); return i < 0 ? null : i; }
    var imgc = [], attrc = [];
    labels.forEach(function (lab, i) {
      if (/^(Main Image 1|Secondary Image \d+)$/.test(lab)) imgc.push(i);
      if (i > 13) attrc.push(i);
    });
    var ci = { sku: col('Shop SKU'), ean: col('EAN'), name: col('Name'), cat: col('Category'), desc: col('Body Copy'), sell: col('Selling Copy'), key: col('Key Feature'), ptype: col('Product type') };
    return data.map(function (r) {
      function cell(i) { return i == null ? '' : (r[i] == null ? '' : r[i]); }
      var imgs = 0, attrs = 0;
      imgc.forEach(function (i) { if (cell(i) !== '') imgs++; });
      attrc.forEach(function (i) { if (cell(i) !== '') attrs++; });
      return { cat_sku: strip(cell(ci.sku)), cat_ean: strip(cell(ci.ean)), cat_name: cell(ci.name), cat_category: cell(ci.cat), cat_desc: cell(ci.desc), cat_sell: cell(ci.sell), cat_keyfeat: cell(ci.key), cat_ptype: cell(ci.ptype), cat_images: imgs, cat_attrs: attrs };
    });
  }

  function clean(v) {
    if (typeof v === 'boolean') return v;
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? (Math.round(v) === v ? v : Math.round(v * 100) / 100) : null;
    return String(v);
  }

  function build(opts) {
    opts = opts || {};
    var warnings = [];
    var offersFile = opts.offers, prodFile = opts.products, accFile = opts.access;
    var orderFiles = opts.orders || [];
    if (!Array.isArray(orderFiles)) orderFiles = [orderFiles];
    orderFiles = orderFiles.filter(Boolean);
    if (!offersFile) throw new Error('No offer export found. Download Offers → Export (all offers, incl. inactive) from the B&Q portal.');

    var Oraw = tableFromFile(offersFile, ['Offer SKU', 'Product SKU', 'Product', 'Activated', 'Quantity', 'Price'], 'Offer export');
    var seenSku = {};
    var O = [];
    Oraw.forEach(function (r) {
      var sku = strip(r['Offer SKU']);
      if (!sku || seenSku[sku]) return;
      seenSku[sku] = 1;
      var ean = strip(r['Product SKU'] || r['EAN'] || '');
      O.push({
        sku: sku, ean: ean, title: r['Product'] || '', Product: r['Product'] || '',
        active: String(r['Activated'] || '').toLowerCase() === 'yes',
        qty: num(r['Quantity']), price: (r['Price'] === '' || r['Price'] == null) ? null : Number(r['Price']),
        category: r['Category Label'] || '', inactive_reason: r['Inactivity reason'] || '',
        variant: null
      });
    });
    var nInact = O.filter(function (o) { return !o.active; }).length;
    if (!nInact) warnings.push('Offer export has NO inactive offers - 0-stock listings are missing. Export ALL offers (incl. inactive).');
    if (!prodFile) warnings.push('No catalog (product) export - photo/description scores use the live page only.');
    if (!accFile) warnings.push('No Access export - variant-code links are not used; groups rely on EAN/title.');
    if (!orderFiles.length) warnings.push('No order files - nobody shows sales, so nothing can be deleted safely; deletes still need page checks.');

    var C = prodFile ? catalogFromFile(prodFile) : null;
    var CbyEan = {}, CbySku = {};
    if (C) C.forEach(function (c) { if (c.cat_ean && !CbyEan[c.cat_ean]) CbyEan[c.cat_ean] = c; if (c.cat_sku && !CbySku[c.cat_sku]) CbySku[c.cat_sku] = c; });
    function catRow(r) { return (r.ean && CbyEan[r.ean]) || CbySku[r.sku] || null; }

    var A = {};
    if (accFile) {
      var Arows = tableFromFile(accFile, ['sku', 'Variant code'], 'Access export');
      Arows.forEach(function (r) {
        var s = strip(r.sku);
        if (s && !A[s]) A[s] = { variant: r['Variant code'], reviews: r.Reviews, seller: r.seller, product_url: r.product_url };
      });
    }
    O.forEach(function (o) { var a = A[o.sku]; o.variant = a && a.variant ? a.variant : null; });

    var lines = {};
    orderFiles.forEach(function (f, fi) {
      var rows = tableFromFile(f, ['Date created', 'Order number', 'Quantity', 'Status', 'Amount', 'Product SKU', 'Offer SKU', 'Order line no.'], 'Orders file');
      rows.forEach(function (r) {
        var k = strip(r['Order line no.']);
        if (!k) return;
        lines[k] = { dt: r['Date created'], order: r['Order number'], q: r.Quantity, status: r.Status, amt: r.Amount, psku: r['Product SKU'], osku: r['Offer SKU'], _m: fi };
      });
    });
    var S = {}, SE = {}, orderMin = null, orderMax = null;
    Object.keys(lines).forEach(function (k) {
      var r = lines[k];
      if (String(r.status || '').toLowerCase() === 'cancelled') return;
      var dt = parseDate(r.dt);
      if (dt && (orderMin == null || dt < orderMin)) orderMin = dt;
      if (dt && (orderMax == null || dt > orderMax)) orderMax = dt;
      var osku = strip(r.osku);
      if (!S[osku]) S[osku] = { units: 0, orders: {}, revenue: 0, last_sale: null };
      S[osku].units += num(r.q);
      if (r.order) S[osku].orders[r.order] = 1;
      S[osku].revenue += num(r.amt);
      if (dt && (!S[osku].last_sale || dt > S[osku].last_sale)) S[osku].last_sale = dt;
      var e = strip(r.psku);
      if (e) SE[e] = (SE[e] || 0) + num(r.q);
    });
    Object.keys(S).forEach(function (k) { S[k].norders = Object.keys(S[k].orders).length; });

    var G = buildGroups(O);
    var groups = G.groups, links = G.links;
    if (!groups.length) throw new Error('No duplicate groups found in this offer export.');
    var prev = opts.prev || {};

    function linkOf(i) {
      var s = O[i].sku, a = A[s], u = a && a.product_url;
      if (typeof u === 'string' && u.indexOf('http') === 0) return u;
      return 'https://www.diy.com/departments/x/' + O[i].ean + '_BQ.prd';
    }

    var rows = [];
    groups.forEach(function (g, gi) {
      var gno = gi + 1;
      g.forEach(function (i) {
        var o = O[i], c = catRow(o), s = o.sku, acc = A[s] || {};
        var ptype = (c && c.cat_ptype) || o.category || '';
        var title = o.Product, desc = c ? (c.cat_desc || '') : '';
        if (c && typeof c.cat_sell === 'string') desc = (desc || '') + ' ' + c.cat_sell;
        var bullets = (c && typeof c.cat_keyfeat === 'string') ? [c.cat_keyfeat] : [];
        var nimg = c ? c.cat_images : 0;
        var r = {
          group: gno, sku: s, ean: o.ean, name: escEnt(String(o.Product)), link: linkOf(i),
          active: o.active ? 'Active' : 'Inactive', qty: o.qty | 0, inactive_reason: o.inactive_reason || '',
          price: o.price, variant: o.variant || '', ean_valid: gtinOk(o.ean),
          acc_reviews: acc.reviews === '' || acc.reviews == null ? null : Number(acc.reviews),
          acc_bb_seller: acc.seller || null,
          prev_group: prev[s] || '',
          units: S[s] ? S[s].units : 0,
          orders: S[s] ? S[s].norders : 0,
          revenue: S[s] ? Math.round(S[s].revenue * 100) / 100 : 0,
          last_sale: S[s] ? S[s].last_sale : null,
          ean_units_all_skus: SE[o.ean] || 0,
          in_catalog: !!c,
          cat_attrs: c ? c.cat_attrs : 0,
          cat_category: c ? (c.cat_category || '') : '',
          photos: nimg,
          live_status: '', live_reviews: null, live_signs: '', sales_signs: ''
        };
        r.img_score = imageScore(nimg, null);
        var ts = titleScore(title, ptype); r.title_score = ts[0]; r.title_len = ts[1]; r.title_why = ts[2];
        var ds = descScore(desc, title); r.desc_score = ds[0]; r.desc_words = ds[1]; r.desc_why = ds[2];
        var bs = bulletScore(bullets); r.bullet_score = bs[0]; r.bullets = bs[1]; r.bullet_why = bs[2];
        rows.push(r);
      });
    });

    var byG = {};
    rows.forEach(function (r) { (byG[r.group] || (byG[r.group] = [])).push(r); });
    Object.keys(byG).forEach(function (g) {
      var xs = byG[g], mx = 0;
      xs.forEach(function (r) { if (r.cat_attrs > mx) mx = r.cat_attrs; });
      xs.forEach(function (r) { r.attr_score = mx > 0 ? Math.round(10 * r.cat_attrs / mx) : 0; });
    });
    rows.forEach(function (r) {
      var pen = (r.ean_valid ? 0 : 5) + (/DO NOT USE/.test(r.cat_category || '') ? 5 : 0);
      r.strength = Math.max(0, (r.img_score + r.title_score + r.desc_score + r.bullet_score + r.attr_score) * 2 - pen * 2);
      var rev = r.acc_reviews;
      r.reviews = (rev == null || !isFinite(rev)) ? 0 : (rev | 0);
      r.winning_bb = (r.acc_bb_seller || '') === OUR_SELLER;
      r.has_sales = r.units > 0;
    });

    function fixes(r) {
      var f = [];
      if (r.img_score < FIX_BELOW) f.push('images (' + r.photos + ' photos, score ' + r.img_score + ')');
      if (r.title_score < FIX_BELOW) f.push('title (' + r.title_why + ')');
      if (r.desc_score < FIX_BELOW) f.push('description (' + r.desc_why + ')');
      if (r.bullet_score < FIX_BELOW) f.push('bullets (' + r.bullet_why + ')');
      if (String(r.desc_why).indexOf('image-prompt') >= 0 && !f.some(function (x) { return x.indexOf('description') === 0; })) f.push('description (contains image-prompt text)');
      return f;
    }
    function keepFlag(r) {
      var f = fixes(r); r.fix = f.join('; ');
      return f.length ? 'Keep - fix' : 'Keep - no fix';
    }
    function similar(u1, u2) {
      if (u1 >= HIGH_SALES && u2 >= HIGH_SALES) return Math.abs(u1 - u2) / Math.max(u1, u2) * 100 <= SIMILAR_PCT;
      if (u1 < HIGH_SALES && u2 < HIGH_SALES) return Math.abs(u1 - u2) <= LOW_SIMILAR_UNITS;
      return false;
    }
    function cmpRank(a, b) {
      var ka = [a.has_sales ? 1 : 0, a.units, a.active === 'Active' ? 1 : 0, a.strength, a.reviews, a.winning_bb ? 1 : 0, -(a.price == null || !isFinite(a.price) ? 1e9 : a.price)];
      var kb = [b.has_sales ? 1 : 0, b.units, b.active === 'Active' ? 1 : 0, b.strength, b.reviews, b.winning_bb ? 1 : 0, -(b.price == null || !isFinite(b.price) ? 1e9 : b.price)];
      for (var i = 0; i < ka.length; i++) { if (ka[i] !== kb[i]) return kb[i] - ka[i]; }
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    }

    var pos = {};
    O.forEach(function (o, i) { pos[o.sku] = i; });
    var out = [];
    Object.keys(byG).map(Number).sort(function (a, b) { return a - b; }).forEach(function (gno) {
      var g = byG[gno].slice().sort(cmpRank);
      var kept = g[0];
      var pk = g.map(function (r) { return packOf(r.name); });
      var packs = [];
      if (pk.some(function (p) { return p != null; })) {
        var seenP = {};
        pk.forEach(function (p) { var v = p == null ? 1 : (p | 0); if (!seenP[v]) { seenP[v] = 1; packs.push(v); } });
        packs.sort(function (a, b) { return a - b; });
      }
      var reasons = [];
      var eans = {};
      g.forEach(function (r) { eans[r.ean] = 1; });
      var eanN = Object.keys(eans).length;
      var oidx = g.map(function (r) { return pos[r.sku]; });
      var kinds = {};
      oidx.forEach(function (x) {
        oidx.forEach(function (y) {
          if (x < y) {
            var k = links[x + '\t' + y];
            if (k) Object.keys(k).forEach(function (w) { kinds[w] = 1; });
          }
        });
      });
      if (eanN < g.length) {
        var cntE = {};
        g.forEach(function (r) { cntE[r.ean] = (cntE[r.ean] || 0) + 1; });
        var dup = g.filter(function (r) { return cntE[r.ean] > 1; });
        var stems = {};
        dup.forEach(function (r) { stems[skuStem(r.sku)] = 1; });
        var ss = Object.keys(stems).length === 1
          ? dup.map(function (r) { return '-' + r.sku.split('-').pop(); }).join(' vs ')
          : dup.map(function (r) { return r.sku; }).join(' vs ');
        reasons.push('same EAN listed under ' + dup.length + ' offer SKUs (' + ss + ')');
      }
      if (eanN > 1 && kinds['same variant code']) reasons.push('new EAN created for same product (same variant code, different EAN)');
      if (eanN > 1 && kinds['same title']) reasons.push('same title, different EAN');
      if (eanN > 1 && kinds['near-identical title']) reasons.push('near-identical title, different EAN (same SKU stem)');
      if (packs.length > 1) reasons.push('pack size differs between copies (' + packs.map(function (p) { return p > 1 ? ('pack of ' + p) : 'single/not stated'; }).join(' vs ') + ') - pack size code variant');
      var why_dup = reasons.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; ');
      var n_sell = g.filter(function (r) { return r.has_sales; }).length;
      var case_ = n_sell <= 1 ? 'one seller or none' : '';
      var check_group = [];
      if (packs.length > 1) check_group.push('different pack sizes - may not be true duplicates');
      var rows_g = [];
      g.forEach(function (baseR, ix) {
        var r = {};
        Object.keys(baseR).forEach(function (k) { r[k] = baseR[k]; });
        r.why_dup = why_dup; r.fix = ''; r.keep_both = false;
        r.group_size = g.length; r.rank = ix + 1;
        r.kept_sku = kept.sku; r.kept_units = kept.units; r.kept_reviews = kept.reviews;
        r.kept_strength = kept.strength; r.kept_live = 'Not fetched';
        var unclear = ['live page not checked (run with --live)'];
        if (packs.length > 1) unclear.push('pack sizes differ');
        if (r.active === 'Active' && kept.active === 'Inactive') unclear.push('kept copy is inactive (0 stock) while this one is active');
        if (ix === 0) {
          r.role = 'Best'; r.decision = keepFlag(r);
          var whyBest = kept.has_sales ? 'has the most sales' : ((g.filter(function (x) { return x.active === 'Active'; }).length === 1 && kept.active === 'Active') ? 'only active copy' : 'strongest listing');
          r.why = whyBest + ' (units ' + (kept.units | 0) + ', strength ' + kept.strength + ', reviews ' + kept.reviews + ')';
        } else if (r.has_sales) {
          r.role = 'Normal';
          var u1 = kept.units, u2 = r.units;
          var tag = 'units ' + (u2 | 0) + ' vs ' + (u1 | 0) + ' on ' + kept.sku + '; reviews ' + r.reviews + ' vs ' + kept.reviews + '; strength ' + r.strength + ' vs ' + kept.strength;
          if (similar(u1, u2)) {
            r.decision = keepFlag(r); r.keep_both = true; r.why = 'Case 1 - similar sales, keep both; ' + tag;
            case_ = 'Case 1 similar sales';
          } else if (u1 >= HIGH_SALES && u2 < HIGH_SALES) {
            if (r.reviews > 0) r.decision = 'Check', r.why = 'Case 2 - lower seller has reviews; ' + tag;
            else if (r.strength <= kept.strength && r.reviews <= kept.reviews) {
              if (unclear.length) { r.decision = 'Check'; r.why = 'Case 2/3 - lower seller is weaker, but unclear: ' + unclear.join('; ') + '; ' + tag; }
              else if (r.ean_units_all_skus > r.units && r.ean !== kept.ean) { r.decision = 'Check'; r.why = 'EAN also sells under another SKU; ' + tag; }
              else { r.decision = 'Delete (verified)'; r.why = 'Case 2/3 - low seller (<' + HIGH_SALES + '), no reviews, weaker listing than ' + kept.sku + '; ' + tag; }
            } else {
              r.decision = 'Check'; r.why = 'Case 2 - lower seller has the stronger listing (strength ' + r.strength + ' vs ' + kept.strength + ') - move its content before deleting?; ' + tag;
            }
            case_ = case_ || 'Case 2/3 high vs low seller';
          } else {
            r.decision = 'Check'; r.why = 'both sell but sales not similar and not high-vs-low; ' + tag;
            case_ = case_ || 'not clear';
          }
        } else {
          r.role = 'Normal';
          var issues = [];
          if (r.reviews > 0) issues.push('has ' + r.reviews + ' reviews but no sales');
          if (r.sales_signs) issues.push('live page shows sales signs: ' + r.sales_signs);
          var base = (r.active === 'Inactive' && kept.active === 'Active') ? ('inactive copy while ' + kept.sku + ' is active') : ('weaker than ' + kept.sku + ' (strength ' + r.strength + ' vs ' + kept.strength + ')');
          if (issues.length) { r.decision = 'Check'; r.why = issues.join('; ') + ' - keep unless you are sure'; }
          else {
            if (r.strength > kept.strength && !kept.has_sales && !(r.active === 'Inactive' && kept.active === 'Active')) unclear.push('scores stronger than kept copy');
            if (r.strength > kept.strength && kept.has_sales) {
              base = 'no sales while ' + kept.sku + ' sells ' + (kept.units | 0) + ' units, but this listing scores stronger (' + r.strength + ' vs ' + kept.strength + ') - move content first?';
              unclear.push('stronger listing than kept copy');
            }
            if (r.ean_units_all_skus > 0 && r.ean !== kept.ean) unclear.push('EAN has sales under another SKU');
            if (unclear.length) { r.decision = 'Check'; r.why = base + '; unclear: ' + unclear.join('; '); }
            else { r.decision = 'Delete (verified)'; r.why = base + '; no sales in orders, no reviews or sales signs on live page, both pages checked live'; }
          }
        }
        rows_g.push(r);
      });
      if (rows_g.some(function (r) { return r.keep_both; })) {
        rows_g.forEach(function (r) {
          if (r.role === 'Best') { r.keep_both = true; r.why = 'Case 1 - similar sales, keep both; ' + r.why; }
        });
      }
      var grpNote = check_group.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; ');
      rows_g.forEach(function (r) {
        r.case = case_ || (n_sell === 1 ? 'one seller' : 'no sales');
        r.group_check = grpNote;
      });
      out = out.concat(rows_g);
    });

    // prev_status per group
    var gPrev = {};
    out.forEach(function (r) {
      if (!gPrev[r.group]) gPrev[r.group] = { any: false, all: true };
      if (r.prev_group) gPrev[r.group].any = true; else gPrev[r.group].all = false;
    });
    out.forEach(function (r) {
      var p = gPrev[r.group];
      r.prev_status = p.all && p.any ? 'In earlier list' : p.any ? 'Partly in earlier list' : 'New group';
    });

    function checkMask(r, keepsInGroup, keepBoth) {
      return r.decision === 'Check' || (r.group_check || '') !== '' || (keepsInGroup > 1 && !keepBoth);
    }
    var gMeta = {};
    out.forEach(function (r) {
      if (!gMeta[r.group]) gMeta[r.group] = { keeps: 0, keepBoth: false, rows: [] };
      if (String(r.decision).indexOf('Keep') === 0) gMeta[r.group].keeps++;
      if (r.keep_both) gMeta[r.group].keepBoth = true;
      gMeta[r.group].rows.push(r);
    });
    var cnt = {};
    out.forEach(function (r) { cnt[r.decision] = (cnt[r.decision] || 0) + 1; });
    var chk = out.filter(function (r) { var m = gMeta[r.group]; return checkMask(r, m.keeps, m.keepBoth); });
    var sizes = {};
    out.forEach(function (r) { sizes[r.group] = (sizes[r.group] || 0) + 1; });
    var sizeVals = Object.keys(sizes).map(function (k) { return sizes[k]; });
    var newGroups = 0, keepBothGroups = 0, chkGroups = {};
    Object.keys(gMeta).forEach(function (g) {
      if (gMeta[g].rows[0].prev_status === 'New group') newGroups++;
      if (gMeta[g].keepBoth) keepBothGroups++;
    });
    chk.forEach(function (r) { chkGroups[r.group] = 1; });

    function rowBase(r) {
      return { group: r.group, sku: r.sku, ean: r.ean, name: r.name, link: r.link, active: r.active, units: clean(r.units),
        reviews: clean(r.reviews), strength: clean(r.strength), live: clean(r.live_status) || null, decision: r.decision, why: r.why, fix: r.fix || null };
    }
    var groupsOut = Object.keys(gMeta).map(Number).sort(function (a, b) { return a - b; }).map(function (g) {
      var d = gMeta[g].rows.slice().sort(function (a, b) { return a.rank - b.rank; });
      var units = 0;
      d.forEach(function (r) { units += r.units; });
      return { group: g, size: d.length, why_duplicated: clean(d[0].why_dup) || null, vs_29_oct: clean(d[0].prev_status) || null,
        units: units | 0, keep_both: !!gMeta[g].keepBoth, note: d[0].group_check || '',
        offers: d.map(rowBase) };
    });
    var dl = out.filter(function (r) { return r.decision === 'Delete (verified)'; });
    var fl = out.filter(function (r) { return r.decision === 'Keep - fix'; });
    var date = opts.date || (function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    var offerName = (offersFile && offersFile.name) || 'offers';
    var notes = [
      'Warnings: ' + (warnings.join(' | ') || 'none'),
      'Offer export used: ' + offerName,
      'Order date range: ' + ((orderMin && orderMax) ? (fmtDT(orderMin) + ' to ' + fmtDT(orderMax) + ' (Mirakl export time, UK)') : 'none'),
      'Live check: NOT run (this browser cannot open B&Q product pages) - so nothing can be Delete (verified)'
    ];
    var data = {
      tool: 'B&Q duplicate finder',
      run_date: date,
      order_range: [fmtDT(orderMin), fmtDT(orderMax)],
      summary: {
        groups: Object.keys(gMeta).length, offers_in_groups: out.length,
        groups_of_2: sizeVals.filter(function (n) { return n === 2; }).length,
        groups_of_3: sizeVals.filter(function (n) { return n === 3; }).length,
        groups_of_4_plus: sizeVals.filter(function (n) { return n >= 4; }).length,
        new_groups: newGroups,
        delete: cnt['Delete (verified)'] || 0,
        check: cnt['Check'] || 0,
        check_groups: Object.keys(chkGroups).length,
        keep_fix: cnt['Keep - fix'] || 0,
        keep_no_fix: cnt['Keep - no fix'] || 0,
        keep_both_groups: keepBothGroups,
        live_checked: false,
        regression_29_oct: ''
      },
      notes: notes,
      delete_list: dl.map(function (r) {
        return Object.assign(rowBase(r), { kept_instead: clean(r.kept_sku), kept_units: clean(r.kept_units), kept_reviews: clean(r.kept_reviews), kept_strength: clean(r.kept_strength), kept_live: clean(r.kept_live) });
      }),
      fix_list: fl.map(function (r) {
        return Object.assign(rowBase(r), { title_score: clean(r.title_score), desc_score: clean(r.desc_score), bullet_score: clean(r.bullet_score), photo_score: clean(r.img_score) });
      }),
      check_list: chk.map(function (r) { return Object.assign(rowBase(r), { note: r.group_check || null }); }),
      groups: groupsOut
    };
    return { data: data, warnings: warnings, live: false };
  }

  return { build: build, parseCSV: parseCSV, constants: { HIGH_SALES: HIGH_SALES, SIMILAR_PCT: SIMILAR_PCT, LOW_SIMILAR_UNITS: LOW_SIMILAR_UNITS, FIX_BELOW: FIX_BELOW } };
});
