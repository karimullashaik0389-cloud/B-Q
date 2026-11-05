/* Listings unlock must write the same session the dashboard reads, and #go= must survive until unlock.
   Made-up password and tiny files only. */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'bqnav.js'), 'utf8');
const desk = fs.readFileSync(path.join(root, 'listings/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'listings/phone/index.html'), 'utf8');

function between(html, a, b, what) {
  const i = html.indexOf(a), j = html.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, what);
  return html.slice(i, j);
}
const pubDesk = between(desk, 'function dashRoot()', 'function sessionListings', 'desktop publish');
const pubPhone = between(phone, 'function dashRoot()', 'function sessionListings', 'phone publish');
assert.strictEqual(pubDesk, pubPhone, 'phone and desktop must publish the same session');
assert.ok(pubDesk.indexOf('inner.listings={salt:b64(listSalt),key:b64(listRaw)}') >= 0);
assert.ok(desk.indexOf("sessionStorage.setItem('bqDashGo'") >= 0);
assert.ok(phone.indexOf("sessionStorage.setItem('bqDashGo'") >= 0);
assert.ok(index.indexOf('sessionStorage.removeItem("bqDashGo")') >= 0, 'Lock must clear the deep link');
assert.ok(nav.indexOf('function readGo()') >= 0);
assert.ok(desk.indexOf(nav) >= 0 && phone.indexOf(nav) >= 0, 'inlined bar drifted');

function b64src(html, sig) {
  const i = html.indexOf(sig);
  assert.ok(i >= 0, sig);
  return html.slice(i, html.indexOf('\n', i)).trim();
}

const AUX = '94ccba845e4963161cceda2f070f59d4';
function auxBytes() {
  const u = new Uint8Array(16);
  for (let i = 0; i < 16; i++) u[i] = parseInt(AUX.substr(i * 2, 2), 16);
  return u;
}
async function encFile(pw, salt, text) {
  const iv = crypto.randomBytes(12);
  const key = await crypto.webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 600000 },
    await crypto.webcrypto.subtle.importKey('raw', Buffer.from(pw), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, Buffer.from(text)));
  const out = new Uint8Array(32 + ct.length);
  out.set(Buffer.from('BQE1'), 0); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32);
  return out;
}

(async function () {
  const pw = 'test-password-not-real';
  const salesSalt = crypto.randomBytes(16), ordersSalt = crypto.randomBytes(16), listSalt = crypto.randomBytes(16);
  const files = {
    'sales.enc': await encFile(pw, salesSalt, 'sales-ok'),
    'orders.enc': await encFile(pw, ordersSalt, 'orders-ok'),
    'lookup.enc': await encFile(pw, auxBytes(), 'lookup-ok')
  };
  let fetches = 0;
  const store = {};
  const ctx = {
    location: { pathname: '/B-Q/listings/index.html' },
    sessionStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    fetch: function (url) {
      fetches++;
      const name = String(url).split('/').pop();
      const buf = files[name];
      if (!buf) return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true, arrayBuffer: function () { return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); } });
    },
    crypto: crypto.webcrypto,
    Uint8Array: Uint8Array,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    Promise: Promise,
    parseInt: parseInt,
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); }
  };
  const src = b64src(desk, 'function b64(u){') + '\n' + pubDesk + '\npublishDashSession(pw, listSalt, listRaw)';
  const listRaw = crypto.randomBytes(32);
  ctx.pw = pw; ctx.listSalt = listSalt; ctx.listRaw = listRaw;
  await vm.runInNewContext(src, ctx);
  const saved = JSON.parse(store['bqDashSession.v1']);
  assert.strictEqual(saved.v, 1);
  ['sales', 'orders', 'aux', 'listings'].forEach(function (k) {
    assert.ok(saved.inner[k].salt && saved.inner[k].key, k);
    assert.strictEqual(saved.inner[k].s, undefined);
  });
  assert.ok(store['bqDashSession.v1'].indexOf(pw) < 0, 'password must not be stored');
  const salesKey = await crypto.webcrypto.subtle.importKey('raw', Buffer.from(saved.inner.sales.key, 'base64'), { name: 'AES-GCM' }, false, ['decrypt']);
  const salesFile = files['sales.enc'];
  const salesPlain = Buffer.from(await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: salesFile.subarray(20, 32) }, salesKey, salesFile.subarray(32))).toString();
  assert.strictEqual(salesPlain, 'sales-ok');
  const auxKey = await crypto.webcrypto.subtle.importKey('raw', Buffer.from(saved.inner.aux.key, 'base64'), { name: 'AES-GCM' }, false, ['decrypt']);
  const look = files['lookup.enc'];
  assert.strictEqual(Buffer.from(await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: look.subarray(20, 32) }, auxKey, look.subarray(32))).toString(), 'lookup-ok');
  const before = fetches;
  await vm.runInNewContext(src, ctx);
  assert.strictEqual(fetches, before, 'a complete session is not rebuilt');

  store['bqDashSession.v1'] = '';
  ctx.pw = 'wrong-password-not-real';
  await vm.runInNewContext(src, ctx);
  assert.ok(!store['bqDashSession.v1'], 'a wrong password must not write a session');

  const goSrc = between(nav, 'var ALLOW=', 'if(!MAIN)', 'readGo') + '\nreadGo()';
  function runGo(hash, storedGo) {
    const box = { 'bqDashGo': storedGo };
    return vm.runInNewContext(goSrc, {
      location: { hash: hash },
      sessionStorage: { getItem: function () { return box['bqDashGo'] || null; } },
      ALLOW: null
    });
  }
  assert.strictEqual(runGo('#go=lookup', 'sales'), 'lookup', 'the URL wins over a stale saved tab');
  assert.strictEqual(runGo('', 'pricing'), 'pricing', 'a saved tab is used when the hash was dropped');
  assert.strictEqual(runGo('#go=nope', 'sales'), 'sales', 'an unknown hash does not win');
  assert.strictEqual(runGo('#go=evil', ''), '', 'unknown destinations are ignored');
  assert.strictEqual(runGo('#go=home', 'lookup'), 'home');
  console.log('listings_return.test.js passed');
})().catch(function (e) { console.error(e); process.exit(1); });
