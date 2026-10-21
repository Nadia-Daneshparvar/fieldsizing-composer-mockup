'use strict';
// T3 (P1 extension): every synthetic sample x method with the D6 explicit Custom curves (the four reference values, delta 5,
// custom provenance and the synthetic source note) reproduces the fs-engine 1.10.0 baseline outputs. The input hash changes
// legitimately (the curves are now explicit inputs), so both hashes are logged, not compared. The untouched-input hash check
// stays in t3-baseline.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { CASES, sampleInputs, comparable } = require('../helpers/sample-inputs.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const mods = load();
const { FSEngine } = mods;

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

// D6: the existing samples load with their four archetypes set to Custom, pre-filled with the reference values.
function withD6Custom(inputs) {
  const curveParams = {}, curveProvenance = {};
  for (const [n, a] of Object.entries(FSEngine.ARCHETYPES)) {
    curveParams[n] = { delta: 5, gamma: a.gamma, rho: a.rho };
    curveProvenance[n] = { source: 'custom', presetId: null, label: null };
  }
  inputs.methodAssumptions = Object.assign({}, inputs.methodAssumptions, { curveParams, curveProvenance, customSourceNote: 'Synthetic sample reference curves' });
  return inputs;
}

test('T3+ engine is fs-engine 1.11.0', () => { assert.equal(FSEngine.version, 'fs-engine 1.11.0'); });

for (const c of CASES) {
  test(`T3+ ${c.id} with D6 Custom curves reproduces the 1.10.0 baseline outputs`, t => {
    const inputs = withD6Custom(sampleInputs(c.kind, c.method, mods));
    const res = FSEngine.calculate(inputs);
    t.diagnostic(`${c.id}: inputsHash 1.10.0 baseline ${BASE.cases[c.id].inputsHash}, D6 Custom ${res.inputsHash}`);
    assert.deepEqual(res.errors, []);
    assertClose(comparable(res), BASE.cases[c.id].outputs, c.id);
    if (c.method === 'response') {
      const used = Object.keys(res.curves);
      assert.ok(used.length > 0);
      for (const n of used) {
        assert.equal(res.curves[n].source, 'custom');
        assert.equal(res.curves[n].presetId, null);
        assert.equal(res.curves[n].delta, 5);
      }
    }
  });
}
