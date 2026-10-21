'use strict';
// T3 (P0 form): the current engine reproduces the fs-engine 1.10.0 baseline outputs and input hashes for every
// synthetic sample x method. Later phases extend this with the explicit-curve (Custom) form of the same inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { CASES, sampleInputs, comparable } = require('../helpers/sample-inputs.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const mods = load();

function assertClose(got, want, where) {
  if (typeof want === 'number' && typeof got === 'number') {
    const ok = got === want || Math.abs(got - want) <= 1e-9 * Math.max(Math.abs(want), Math.abs(got));
    assert.ok(ok, `${where}: ${got} vs ${want}`);
  } else if (want && typeof want === 'object') {
    assert.equal(typeof got, 'object', `${where}: type`);
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${where}: keys`);
    for (const k of Object.keys(want)) assertClose(got[k], want[k], `${where}.${k}`);
  } else assert.equal(got, want, where);
}

test('T3 baseline fixture covers every sample x method', () => {
  assert.deepEqual(Object.keys(BASE.cases).sort(), CASES.map(c => c.id).sort());
  assert.equal(BASE.engineVersion, 'fs-engine 1.10.0');
});
for (const c of CASES) {
  test(`T3 ${c.id} reproduces the 1.10.0 baseline`, () => {
    const res = mods.FSEngine.calculate(sampleInputs(c.kind, c.method, mods));
    assertClose(comparable(res), BASE.cases[c.id].outputs, c.id);
  });
  test(`T3 ${c.id} same input object gives the 1.10.0 input hash`, () => {
    const res = mods.FSEngine.calculate(sampleInputs(c.kind, c.method, mods));
    assert.equal(res.inputsHash, BASE.cases[c.id].inputsHash);
  });
}
module.exports = { assertClose };
