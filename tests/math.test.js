// Run from the repo root: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { priceAt, levelAt, stopped, ownLevel } = require('../math.js');

test('long mini: price, level and stop agree', () => {
  const m = { long: true, fin: 100, stop: 105, parity: 10, fx: 2 };
  assert.equal(priceAt(m, 110), 2);
  assert.equal(levelAt(m, 2), 110);
  assert.equal(stopped(m, 105), true);
  assert.equal(stopped(m, 106), false);
});

test('short mini: the formulas flip', () => {
  const m = { long: false, fin: 200, stop: 190, parity: 1, fx: 1 };
  assert.equal(priceAt(m, 180), 20);
  assert.equal(levelAt(m, 20), 180);
  assert.equal(stopped(m, 190), true);
  assert.equal(stopped(m, 185), false);
  assert.equal(priceAt(m, 250), 0); // never below zero
});

test('1x tracker follows its underlying, never stops', () => {
  const m = { k: 0.01 };
  assert.equal(priceAt(m, 50000), 500);
  assert.equal(levelAt(m, 500), 50000);
  assert.equal(stopped(m, 1), false);
});

test('underlying level solved from leverage', () => {
  assert.equal(ownLevel(2, 50, false), 100); // 100 / (100 - 50) = 2
  assert.equal(ownLevel(2, 150, true), 100); // 100 / (150 - 100) = 2
  assert.equal(ownLevel(1, 50, false), null);
});
