'use strict';
// T2: FSEngine._internal.responseCurve reproduces the reference-preset curve values (Beghou reference presets).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { FSEngine } = load();
const rc = FSEngine._internal.responseCurve;

const PRESETS = {
  slow: { delta: 5, gamma: 1.5, rho: 11 },
  baseline: { delta: 5, gamma: 1.3, rho: 7 },
  moderate: { delta: 5, gamma: 1.1, rho: 3.5 },
  steep: { delta: 5, gamma: 0.8, rho: 1.5 }
};
const EXPECTED = [
  ['slow', 1, 0.931695], ['slow', 24, 10.22383],
  ['moderate', 24, 5.309591],
  ['steep', 24, 3.24138],
  ['baseline', 1, 1.01291], ['baseline', 24, 7.284408]
];
for (const [id, x, want] of EXPECTED) {
  test(`T2 responseCurve ${id} at ${x} calls = ${want}`, () => {
    const got = rc(PRESETS[id], x);
    assert.ok(Math.abs(got - want) <= 1e-6, `${got} vs ${want}`);
  });
}
test('T2 responseCurve is 0 at 0 calls', () => { assert.equal(rc(PRESETS.slow, 0), 0); });
