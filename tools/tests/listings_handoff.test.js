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

function b64(u8) {
  return Buffer.from(u8).toString('base64');
}
async function listingsFile(pw) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await crypto.webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 1000 },
    await crypto.webcrypto.subtle.importKey('raw', Buffer.from(pw), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.webcrypto.subtle.exportKey('raw', key);
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, Buffer.from('{"ok":1}')));
  const out = new Uint8Array(32 + ct.length);
  out.set(Buffer.from('BQE1'), 0); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32);
  return { out: out, salt: salt, raw: new Uint8Array(raw) };
}
function sessionListingsWouldAccept(session, file) {
  const L = session && session.inner && session.inner.listings;
  if (!L || !L.key || !L.s) return false;
  return L.s === b64(file.out.subarray(4, 20));
}
(async function () {
  const pw = 'test-password-not-real';
  const file = await listingsFile(pw);
  const without = { v: 1, inner: { sales: { salt: 'aa', key: 'bb' }, orders: { salt: 'aa', key: 'bb' }, aux: { salt: 'aa', key: 'bb' } } };
  assert.strictEqual(sessionListingsWouldAccept(without, file), false, 'session with no listings key must not skip the password');
  const withKey = { v: 1, inner: { listings: { s: b64(file.salt), key: b64(file.raw) } } };
  assert.strictEqual(sessionListingsWouldAccept(withKey, file), true);
  const key = await crypto.webcrypto.subtle.importKey('raw', file.raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = Buffer.from(await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: file.out.subarray(20, 32) }, key, file.out.subarray(32))).toString();
  assert.strictEqual(plain, '{"ok":1}');
  const bad = await crypto.webcrypto.subtle.importKey('raw', crypto.randomBytes(32), { name: 'AES-GCM' }, false, ['decrypt']);
  let rejected = false;
  try {
    await crypto.webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: file.out.subarray(20, 32) }, bad, file.out.subarray(32));
  } catch (e) { rejected = true; }
  assert.ok(rejected, 'a wrong key must not open the file');
  console.log('listings_handoff.test.js passed');
})().catch(function (e) { console.error(e); process.exit(1); });
