/* Banned words must block a Listings export. No catalogue data. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const files = [
  'listings/index.html',
  'listings/phone/index.html',
  'downloads/BQ_Listings_v3.5.19_Windows.html',
  'downloads/BQ_Listings_v3.5.18_Windows.html'
];

function extract(src) {
  const m = src.match(/function bannedWord\(s\)\{[^}]*\}/);
  assert.ok(m, 'bannedWord missing');
  return m[0];
}

const bodies = files.map(function (f) {
  return extract(fs.readFileSync(path.join(root, f), 'utf8'));
});
bodies.forEach(function (b, i) {
  assert.strictEqual(b, bodies[0], files[i] + ' bannedWord differs from listings/index.html');
});

const bannedWord = vm.runInNewContext(bodies[0] + '\nbannedWord');
function hit(s) { return bannedWord(s); }

assert.strictEqual(hit('Garden aerosol cleaner'), 'aerosol');
assert.strictEqual(hit('AEROSOL'), 'AEROSOL');
assert.strictEqual(hit('two aerosols here'), 'aerosols');
assert.strictEqual(hit('pet excrement bag'), 'excrement');
assert.strictEqual(hit('Excrement'), 'Excrement');
assert.strictEqual(hit('dog excrements'), 'excrements');
assert.strictEqual(hit('excellent outdoor mat'), '');
assert.strictEqual(hit('exercise band'), '');
assert.strictEqual(hit(''), '');
assert.strictEqual(hit(null), '');

files.forEach(function (f) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  assert.ok(src.indexOf("n.push('banned word “'+bwT+'” in the title')") >= 0, f + ' title');
  assert.ok(src.indexOf("n.push('banned word “'+bwB+'” in the bullets')") >= 0, f + ' bullets');
  assert.ok(src.indexOf("n.push('banned word “'+bwD+'” in the description')") >= 0, f + ' description');
  assert.ok(src.indexOf("banned word “'+bw+'” in the '+place") >= 0, f + ' preCheck');
  assert.ok(src.indexOf('window.__bannedWord=bannedWord') >= 0, f + ' export hook');
  assert.ok(/banned word/.test(src) && src.indexOf("!/different title|banned word/") >= 0, f + ' not auto-fixed away');
});

/* Same gate the export uses: a blocked row never becomes a clean export line. */
function rowBlocked(cells) {
  const places = [['title', cells.name], ['description', cells.body], ['description', cells.selling]];
  (cells.bullets || []).forEach(function (b) { places.push(['bullets', b]); });
  return places.filter(function (p) { return p[1] && hit(p[1]); }).map(function (p) { return p[0]; });
}
assert.deepStrictEqual(rowBlocked({ name: 'Plain mat', body: 'A long description.', bullets: ['Soft feel.'] }), []);
assert.ok(rowBlocked({ name: 'Aerosol can', body: 'Fine', bullets: [] }).indexOf('title') >= 0);
assert.ok(rowBlocked({ name: 'Mat', body: 'Contains excrement.', bullets: [] }).indexOf('description') >= 0);
assert.ok(rowBlocked({ name: 'Mat', body: 'Fine', bullets: ['Uses an aerosol spray.'] }).indexOf('bullets') >= 0);

console.log('banned_words.test.js passed');
