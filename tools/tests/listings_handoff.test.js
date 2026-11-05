/* Reproduces the two Listings faults: password asked again, and the tab bar blocked by CSP.
   Uses a made-up password and a tiny file. No catalogue. */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'bqnav.js'), 'utf8');
const desk = fs.readFileSync(path.join(root, 'listings/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'listings/phone/index.html'), 'utf8');
const tabs = ['Sales', 'Orders', 'Listings', 'Duplicates', 'Access', 'Pricing', 'Individual sales', 'Calculator'];

function csp(html) {
  const m = html.match(/Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'CSP missing');
  return m[1];
}
[desk, phone].forEach(function (html, i) {
  const name = i ? 'phone' : 'desktop';
  const policy = csp(html);
  assert.ok(policy.indexOf("script-src 'unsafe-inline'") >= 0, name + ' keeps inline scripts');
  assert.ok(!/script-src[^;]*'self'/.test(policy), name + ' must not allow every same-origin script');
  assert.ok(!/script-src[^;]*https:/.test(policy), name + ' must not allow remote scripts');
  assert.strictEqual(html.indexOf('src="../bqnav.js"'), -1);
  assert.strictEqual(html.indexOf('src="../../bqnav.js"'), -1);
  tabs.forEach(function (t) { assert.ok(html.indexOf('"' + t + '"') >= 0, name + ' bar missing ' + t); });
  assert.ok(html.indexOf('function toListings') >= 0, name + ' nav not inlined');
});
const navTabs = nav.match(/var T=(\[[\s\S]*?\]);/);
assert.ok(navTabs);
assert.ok(desk.indexOf(navTabs[1]) >= 0, 'desktop bar drifted from bqnav.js');
assert.ok(phone.indexOf(navTabs[1]) >= 0, 'phone bar drifted from bqnav.js');

assert.ok(index.indexOf('return addListingsKey(pw,nk).then(function(nk2){if(!nk2.listings)return nk2;return wrapStore(pw,nk2)') >= 0, 'remembered login must derive the listings key');
assert.ok(index.indexOf('goL.then(function(){location.href=$("listings")') >= 0, 'Sales/Orders open of Listings must stash first');
assert.ok(index.indexOf('function addListingsKey(pw,nk)') >= 0);

function grabLine(html, start, what) {
  const i = html.indexOf(start);
  assert.ok(i >= 0, what);
  const end = html.indexOf('\n', i);
  return html.slice(i, end === -1 ? html.length : end).trim();
}
function grabFn(html, start, until, what) {
  const i = html.indexOf(start);
  assert.ok(i >= 0, what);
  const j = html.indexOf(until, i);
  assert.ok(j > i, what + ' end');
  return html.slice(i, j + until.length);
}
const dashB64 = grabLine(index, 'function b64(u8){', 'dashboard b64');
const listB64 = grabLine(desk, 'function b64(u){', 'listings b64');
const listU8 = grabLine(desk, 'function u8(s){', 'listings u8');
const listDec = grabLine(desk, 'function dec(k,u){', 'listings dec');
const listRead = grabFn(desk, 'function sessionListings(u){', 'dec(k,u);});}', 'sessionListings');
const phoneRead = grabFn(phone, 'function sessionListings(u){', 'dec(k,u);});}', 'phone sessionListings');
assert.strictEqual(listRead, phoneRead, 'phone and desktop must read the same session shape');
const stashAssign = 'inner[d]={salt:b64(keys[d].salt),key:b64(new Uint8Array(raw))}';
assert.ok(index.indexOf(stashAssign) >= 0, 'stashSession write');

(async function () {
  const pw = 'test-password-not-real';
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await crypto.webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 1000 },
    await crypto.webcrypto.subtle.importKey('raw', Buffer.from(pw), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', key));
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, Buffer.from('{"ok":1}')));
  const file = new Uint8Array(32 + ct.length);
  file.set(Buffer.from('BQE1'), 0); file.set(salt, 4); file.set(iv, 20); file.set(ct, 32);

  const written = { v: 1, inner: {} };
  const vm = require('vm');
  const btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  const writer = vm.createContext({ keys: { listings: { salt: salt } }, raw: raw, inner: written.inner, d: 'listings', Uint8Array: Uint8Array, btoa: btoa });
  vm.runInContext(dashB64 + '\n' + stashAssign, writer);
  const saved = written.inner.listings;
  assert.ok(saved && saved.salt && saved.key, 'stashSession must write salt and key');
  assert.strictEqual(saved.s, undefined, 'stashSession does not write s');

  const store = { 'bqDashSession.v1': JSON.stringify(written) };
  const readerSrc = listB64 + '\n' + listU8 + '\n' + listDec + '\n' + listRead + '\nsessionListings(file)';
  const opened = await vm.runInNewContext(readerSrc, {
    sessionStorage: { getItem: function (k) { return store[k] || null; } },
    crypto: crypto.webcrypto,
    file: file,
    Uint8Array: Uint8Array,
    TextDecoder: TextDecoder,
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); }
  });
  assert.strictEqual(JSON.stringify(opened), '{"ok":1}', 'reader must accept the object stashSession writes');

  store['bqDashSession.v1'] = JSON.stringify({ v: 1, inner: { sales: { salt: 'aa', key: 'bb' } } });
  let missing = false;
  try { await vm.runInNewContext(readerSrc, {
    sessionStorage: { getItem: function (k) { return store[k] || null; } },
    crypto: crypto.webcrypto, file: file, Uint8Array: Uint8Array, TextDecoder: TextDecoder,
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); }
  }); } catch (e) { missing = true; }
  assert.ok(missing, 'a session with no listings key must not skip the password');

  const badRaw = crypto.randomBytes(32);
  const badInner = { v: 1, inner: {} };
  const badWriter = vm.createContext({ keys: { listings: { salt: salt } }, raw: badRaw, inner: badInner.inner, d: 'listings', Uint8Array: Uint8Array, btoa: btoa });
  vm.runInContext(dashB64 + '\n' + stashAssign, badWriter);
  store['bqDashSession.v1'] = JSON.stringify(badInner);
  let wrong = false;
  try { await vm.runInNewContext(readerSrc, {
    sessionStorage: { getItem: function (k) { return store[k] || null; } },
    crypto: crypto.webcrypto, file: file, Uint8Array: Uint8Array, TextDecoder: TextDecoder,
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); }
  }); } catch (e) { wrong = true; }
  assert.ok(wrong, 'a wrong key must not open the file');
  console.log('listings_handoff.test.js passed');
})().catch(function (e) { console.error(e); process.exit(1); });
