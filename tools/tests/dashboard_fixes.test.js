/* Checks the dashboard fixes without opening private catalogues. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'bqnav.js'), 'utf8');
const list = fs.readFileSync(path.join(root, 'listings/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'listings/phone/index.html'), 'utf8');

const tabs = ['Sales', 'Orders', 'Listings', 'Duplicates', 'Access', 'Pricing', 'Individual sales', 'Calculator'];
tabs.forEach(function (name) {
  assert.ok(nav.indexOf('"' + name + '"') >= 0, 'nav missing ' + name);
});
assert.ok(nav.indexOf('flex-wrap:wrap') >= 0, 'mobile bar should wrap so later tabs stay on screen');
assert.ok(index.indexOf('src="bqnav.js"') >= 0, 'dashboard should use the shared bar');
assert.ok(list.indexOf('function toListings') >= 0, 'listings desktop inlines the bar (external script is blocked)');
assert.ok(phone.indexOf('function toListings') >= 0, 'listings phone inlines the bar');
assert.strictEqual(list.indexOf('src="../bqnav.js"'), -1);
assert.strictEqual(phone.indexOf('src="../../bqnav.js"'), -1);

assert.ok(index.indexOf('bqDashReturn') >= 0, 'dashboard restores a listings return');
assert.ok(index.indexOf('function stashSession') >= 0);
assert.ok(list.indexOf("sessionStorage.setItem('bqDashReturn','1')") >= 0);
assert.ok(phone.indexOf("sessionStorage.setItem('bqDashReturn','1')") >= 0);
assert.ok(list.indexOf('function sessionListings') >= 0);
assert.ok(phone.indexOf('function sessionListings') >= 0);
assert.ok(index.indexOf('clearSession') >= 0 && index.indexOf('bqListKey.v1') >= 0, 'lock clears the listings key');

assert.ok(index.indexOf('saveLocked') >= 0, 'encrypted upload uses the desktop-safe save');
assert.ok(index.indexOf('showSaveFilePicker') >= 0);
assert.ok(index.indexOf('120000') >= 0, 'blob URL is kept long enough for a desktop download');
assert.ok(index.indexOf('function encName') >= 0, 'desktop .enc.txt names are still recognised');
assert.ok(index.indexOf('files.slice(0,8)') >= 0, 'a bad newest file does not hide the good one');

function blocks(needs, titleLen) {
  var n = needs.slice();
  if (titleLen >= 1 && titleLen <= 130) n = n.filter(function (x) { return x !== 'title length'; });
  return n;
}
assert.deepStrictEqual(blocks(['title length'], 110), [], 'a title B&Q accepts is not held out of the file');
assert.deepStrictEqual(blocks(['title length'], 128), []);
assert.deepStrictEqual(blocks(['title length', 'weight'], 110), ['weight']);
assert.deepStrictEqual(blocks(['title length'], 140), ['title length'], 'over the 130 limit stays held');
assert.deepStrictEqual(blocks(['title'], 0), ['title']);
assert.ok(list.indexOf("x!=='title length'") >= 0);
assert.ok(phone.indexOf("x!=='title length'") >= 0);

function encName(n) { return String(n || '').replace(/\.txt$/i, ''); }
function keep(name, prefix) {
  var n = encName(name);
  return n.indexOf(prefix) === 0 && /\.enc$/i.test(n);
}
assert.strictEqual(keep('all_variant_2026-11-05_120000.enc', 'all_variant_'), true);
assert.strictEqual(keep('all_variant_2026-11-05_120000.enc.txt', 'all_variant_'), true);
assert.strictEqual(keep('notes.txt', 'all_variant_'), false);
assert.strictEqual(keep('codes_2026-11-05_120000.enc', 'all_variant_'), false);

assert.ok(index.indexOf("object-src 'none'") >= 0);
assert.ok(index.indexOf('no-referrer') >= 0);
assert.ok(!/ghp_[A-Za-z0-9]{20,}/.test(index + nav), 'no GitHub token in the pages');

console.log('dashboard_fixes.test.js passed');
