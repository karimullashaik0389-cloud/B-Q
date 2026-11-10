/* Browser round trip for Import checked workbook. Synthetic products only.
   Run from the repo root:
   NODE_PATH=/tmp/pw/node_modules node tools/pricing/tests/import_browser.js
   Needs Google Chrome and playwright-core. Does not open the live site or the real catalogue. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const X = require(path.join(__dirname, '..', '..', '..', 'lib', 'xlsx.full.min.js'));
const P = require(path.join(__dirname, '..', 'bq_price.js'));
const B = require(path.join(__dirname, '..', 'bq_book.js'));
const { chromium } = require('playwright-core');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bqimp-'));
const rows = [
  { sku: 'ZA', title: 'Synthetic mug', ean: '9001', cost: 2, price: 12, bb: 9, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 4, stock: 3 },
  { sku: 'ZB', title: 'Synthetic bowl', ean: '9002', cost: 2, price: 8, bb: 8, seller: 'Diva Packages', sup: 'UK Ltd', w: 500, sales: 5, stock: 3 },
  { sku: 'ZC', title: 'Synthetic china', ean: '9003', cost: 4, price: 20, bb: 20, seller: 'Diva Packages', sup: 'Ashian Homeware', w: 400, sales: 0, stock: 4 },
  { sku: 'ZD', title: '3 x Synthetic', ean: '9004', cost: 2, price: 15, bb: 12, seller: 'Rival', sup: 'UK Ltd', w: 14999, sales: 4, stock: 3 },
  { sku: 'ZE', title: 'Synthetic conflict', ean: '9005', cost: 2, price: 11, bb: 10, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 3, stock: 2 },
  { sku: 'ZF', title: 'Synthetic bad', ean: '9006', cost: 2, price: 11, bb: 10, seller: 'Rival', sup: 'UK Ltd', w: 500, sales: 3, stock: 2 }
];
const hd = ['sku', 'Variant description', 'Estimated cost', 'B&Q_INV.price', 'B&Q_BB.price', 'seller', 'Main supplier name', 'Weight', 'Postage Cost', 'B n Q 30Days', 'product-id', 'Variant code', 'Free stock quantity'];
const aoa = [hd].concat(rows.map(r => [r.sku, r.title, r.cost, r.price, r.bb, r.seller, r.sup, r.w, 1.75, r.sales, r.ean, '', r.stock]));
const accessWb = X.utils.book_new();
X.utils.book_append_sheet(accessWb, X.utils.aoa_to_sheet(aoa), 'B&QBB3');
const accessPath = path.join(dir, 'Access_synthetic.xlsx');
fs.writeFileSync(accessPath, X.write(accessWb, { type: 'buffer', bookType: 'xlsx' }));

function workbook() {
  const d = P.decideAll(rows, {});
  const bb = P.buyBoxAll(d.rows, Object.fromEntries(d.rows.map(o => [o.ean, 1])), {}, P.BB_DEFAULT);
  return B.build(X, P, { bbr: bb, aoa: aoa, settings: P.BB_DEFAULT });
}
const goodPath = path.join(dir, 'checked_good.xlsx');
const badPath = path.join(dir, 'checked_bad.xlsx');
fs.writeFileSync(goodPath, Buffer.from(workbook().bytes));
fs.writeFileSync(badPath, Buffer.from(workbook().bytes));

function applyEditsFile(src, dest, list) {
  const script = path.join(dir, 'apply.py');
  const spec = path.join(dir, 'edits.json');
  fs.writeFileSync(spec, JSON.stringify(list));
  fs.writeFileSync(script, String.raw`
import zipfile, re, html, json, sys
src, dest, spec = sys.argv[1:]
edits = json.load(open(spec))
zin = zipfile.ZipFile(src)
rels = zin.read('xl/_rels/workbook.xml.rels').decode()
wb = zin.read('xl/workbook.xml').decode()
rid = {m.group(1): 'xl/worksheets/'+m.group(2) for m in re.finditer(r'Id="(rId\d+)"[^>]*Target="worksheets/([^"]+)"', rels)}
names = {html.unescape(m.group(1)): rid[m.group(2)] for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb)}
by = {}
for e in edits:
    by.setdefault(names[e['sheet']], []).append(e)
changed = {}
for pth, items in by.items():
    xml = zin.read(pth).decode()
    for e in items:
        cell, val, kind = e['cell'], e['value'], e['kind']
        xml = re.sub(r'<c r="%s"[^>]*>.*?</c>' % cell, '', xml, flags=re.S)
        row = re.search(r'\d+', cell).group(0)
        if kind == 'f':
            node = '<c r="%s"><f>%s</f><v>2</v></c>' % (cell, val)
        elif kind == 's':
            node = '<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % (cell, val)
        else:
            node = '<c r="%s"><v>%s</v></c>' % (cell, val)
        xml2, n = re.subn(r'(<row r="%s"[^>]*>)(.*?)(</row>)' % row,
            lambda m, node=node, cell=cell: m.group(1)+re.sub(r'<c r="%s".*?</c>'%cell,'',m.group(2),flags=re.S)+node+m.group(3),
            xml, count=1, flags=re.S)
        if n != 1:
            raise SystemExit('missing row '+cell)
        xml = xml2
    changed[pth] = xml
zout = zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = changed.get(item.filename, zin.read(item.filename))
    if isinstance(data, str):
        data = data.encode()
    zout.writestr(item, data)
zout.close(); zin.close()
`);
  execFileSync('python3', [script, src, dest, spec]);
}

const baseBytes = path.join(dir, 'base.xlsx');
fs.writeFileSync(baseBytes, Buffer.from(workbook().bytes));
applyEditsFile(baseBytes, goodPath, [
  { sheet: '6 Combined upload', cell: 'F3', value: 0, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'F4', value: 2.5, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'U4', value: 'Yes', kind: 's' },
  { sheet: '6 Combined upload', cell: 'Q5', value: 25, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'U6', value: 'Yes', kind: 's' }
]);
applyEditsFile(baseBytes, badPath, [
  { sheet: '1 All', cell: 'AO7', value: 9, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'F7', value: 1, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'F8', value: -3, kind: 'n' },
  { sheet: '6 Combined upload', cell: 'J8', value: '1+1', kind: 'f' }
]);

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, u === '/' ? 'index.html' : u);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const root = path.join(__dirname, '..', '..', '..');
  const server = await serve(root);
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const shots = '/opt/cursor/artifacts';
  const log = [];
  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: path.join(shots, 'dashboard-locked.png') });
    const locked = await page.locator('#pw').count();
    log.push('branch index.html shows a password field: ' + (locked === 1));

    const t0 = Date.now();
    await page.goto('http://127.0.0.1:' + port + '/tools/pricing/tests/import_harness.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    log.push('harness ready ms ' + (Date.now() - t0));
    await page.screenshot({ path: path.join(shots, 'import-harness.png') });

    const tAccess = Date.now();
    await page.setInputFiles('#pzfile', accessPath);
    await page.waitForFunction(() => /Using /.test((document.getElementById('pzfmsg') || {}).textContent || ''), null, { timeout: 20000 });
    log.push('access import ms ' + (Date.now() - tAccess));

    await page.check('#pzchkyour');
    const tChk = Date.now();
    await page.setInputFiles('#pzchkfile', goodPath);
    await page.waitForSelector('#pzchksave', { timeout: 20000 });
    const preview = await page.locator('#pzchkprev').innerText();
    log.push('checked import preview ms ' + (Date.now() - tChk));
    if (!/Postage corrections: 2/.test(preview)) throw new Error('postage count: ' + preview);
    if (!/Include decisions: 2/.test(preview)) throw new Error('include count: ' + preview);
    if (!/Your price: 1/.test(preview)) throw new Error('your price count: ' + preview);
    await page.click('#pzchksave');
    await page.waitForSelector('#pzchkmsg');
    const saved = await page.locator('#pzchkmsg').innerText();
    if (!/Saved in this browser/.test(saved)) throw new Error(saved);
    const listed = await page.locator('#pzchkrev').innerText();
    if (!/£0\.00/.test(listed) || !listed.includes('ZA')) throw new Error('saved list missing zero postage');
    await page.screenshot({ path: path.join(shots, 'import-saved-checks.png') });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-ready="1"]');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bqChecked1') || 'null'));
    if (!stored || !stored.items || stored.items.ZA.post !== 0) throw new Error('reload lost the saved postage 0');

    await page.setInputFiles('#pzfile', accessPath);
    await page.waitForFunction(() => /Using /.test((document.getElementById('pzfmsg') || {}).textContent || ''));
    const applied = await page.evaluate(() => {
      const st = window.BQPricing.state();
      const za = st.res.rows.find(r => r.sku === 'ZA');
      const zd = st.res.rows.find(r => r.sku === 'ZD');
      return { zaPost: za && za.post, zaUpload: za && za.upload, zdWhy: zd && zd.why, zdUpload: zd && zd.upload, checks: st.checks.items.ZA };
    });
    if (applied.zaPost !== 0) throw new Error('postage 0 was not applied after reload, got ' + applied.zaPost);
    if (applied.checks.post !== 0) throw new Error('stored postage was not 0');
    if (applied.zdUpload) throw new Error('Include Yes cleared a heavy pack');
    log.push('reload and new Access kept postage 0 and the heavy-pack hold');

    const tBook = Date.now();
    const produced = await page.evaluate(() => {
      const out = window.BQPricing.book7(window.XLSX);
      const names = [];
      return { bytes: Array.from(out.bytes), uk: out.counts.t7uk, cn: out.counts.t7cn };
    });
    log.push('workbook from saved checks ms ' + (Date.now() - tBook) + ' uk ' + produced.uk + ' cn ' + produced.cn);
    const made = path.join(dir, 'from_browser.xlsx');
    fs.writeFileSync(made, Buffer.from(produced.bytes));
    const calc = path.join(dir, 'from_browser_calc.xlsx');
    const tCalc = Date.now();
    execFileSync('ssconvert', ['--export-type=Gnumeric_Excel:xlsx2', made, calc], { stdio: ['ignore', 'ignore', 'ignore'] });
    log.push('synthetic recalc ms ' + (Date.now() - tCalc));
    const wb = X.read(fs.readFileSync(calc), { type: 'buffer' });
    const comb = X.utils.sheet_to_json(wb.Sheets['6 Combined upload'], { header: 1, raw: true, defval: null });
    const hdr = comb[1];
    const col = {}; hdr.forEach((h, i) => { if (h) col[h] = i; });
    const by = {};
    comb.slice(2).forEach(r => { if (r[0]) by[String(r[0])] = r; });
    if (Math.abs(by.ZA[col['Postage used']] - 0) > 0.001) throw new Error('ZA postage after recalc ' + by.ZA[col['Postage used']]);
    const cn = X.utils.sheet_to_json(wb.Sheets['7b Final upload China'], { header: 1, raw: true, defval: null }).slice(2).filter(r => r[0]);
    if (cn.some(r => String(r[0]) === 'ZC')) throw new Error('China raise was on the final tab');
    if (String(by.ZC[col.Check]) !== 'CHINA RAISE') throw new Error('ZC check ' + by.ZC[col.Check]);
    const ukHead = X.utils.sheet_to_json(wb.Sheets['7a Final upload UK'], { header: 1, raw: true, defval: null })[0].slice(0, 5).join('|');
    if (ukHead !== 'Offer SKU|Offer price|Discount price|Discount start date|Discount end date') throw new Error(ukHead);
    log.push('recalc confirms postage 0, China raise off the upload, five-column final');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#pzchkexp');
    const download = await downloadPromise;
    const backupPath = path.join(dir, 'backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (backup.bqCheckedBackup !== 1 || backup.items.ZA.post !== 0) throw new Error('backup missing postage 0');

    page.once('dialog', d => d.accept());
    await page.click('#pzchkclr');
    await page.waitForFunction(() => /Removed the saved checks/.test(document.getElementById('pzchkmsg').innerText));
    const tBack = Date.now();
    await page.setInputFiles('#pzchkbin', backupPath);
    await page.waitForFunction(() => /Merged the backup/.test(document.getElementById('pzchkmsg').innerText));
    log.push('backup round trip ms ' + (Date.now() - tBack));
    const restored = await page.locator('#pzchkrev').innerText();
    if (!/£0\.00/.test(restored)) throw new Error('backup restore lost zero postage');

    await page.setInputFiles('#pzchkfile', badPath);
    await page.waitForSelector('#pzchkprev p');
    const bad = await page.locator('#pzchkprev').innerText();
    if (!/Conflicts \(not saved\): 1/.test(bad)) throw new Error('conflict: ' + bad);
    if (!/Invalid values: 2/.test(bad)) throw new Error('invalid: ' + bad);
    if (!/Formulas ignored: 1/.test(bad)) throw new Error('formula: ' + bad);
    await page.screenshot({ path: path.join(shots, 'import-conflict-invalid.png') });
    log.push('conflict, invalid postage and a formula cell were reported and not offered as a clean save');
    console.log(log.join('\n'));
    console.log('BROWSER_OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => { console.error('BROWSER_FAIL', err && err.stack || err); process.exit(1); });
