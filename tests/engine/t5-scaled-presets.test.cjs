'use strict';
// T5: the Beghou reference presets, scaled so the response at 24 calls = 1, match plan §5 at 1 and 6 calls (±1e-6).
// This checks the scaling arithmetic only; the engine keeps its 48-call normalization point.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { FSEngine } = load();
const rc = FSEngine._internal.responseCurve;

const PRESETS = [
  { id: 'slow', label: 'Slow uptake', delta: 5, gamma: 1.5, rho: 11 },
  { id: 'moderate', label: 'Moderate uptake', delta: 5, gamma: 1.1, rho: 3.5 },
  { id: 'steep', label: 'Steep uptake', delta: 5, gamma: 0.8, rho: 1.5 },
  { id: 'baseline', label: 'Baseline', delta: 5, gamma: 1.3, rho: 7 }
];
const EXPECTED = { slow: [0.091130, 0.625442], baseline: [0.139052, 0.661539], moderate: [0.245807, 0.743545], steep: [0.447204, 0.823434] };

const asg = Object.fromEntries(PRESETS.map(p => [`Archetype ${p.id}`, p.id]));
const { curveParams } = FSEngine.resolveCurves(asg, PRESETS, {});
for (const p of PRESETS) {
  test(`T5 ${p.id}: response at 1 and 6 calls / response at 24 calls`, () => {
    const a = FSEngine.archetypesFor({ curveParams })[`Archetype ${p.id}`];
    const at24 = rc(a, 24);
    const [w1, w6] = EXPECTED[p.id];
    assert.ok(Math.abs(rc(a, 1) / at24 - w1) <= 1e-6, `${p.id} x=1: ${rc(a, 1) / at24} vs ${w1}`);
    assert.ok(Math.abs(rc(a, 6) / at24 - w6) <= 1e-6, `${p.id} x=6: ${rc(a, 6) / at24} vs ${w6}`);
  });
}
test('T5 normalization point default stays 48 calls', () => {
  const { sampleInputs } = require('../helpers/sample-inputs.cjs');
  const i = sampleInputs('single', 'response');
  delete i.methodAssumptions.scenarioMaxCalls;
  const res = FSEngine.calculate(i);
  assert.ok(res.trace.some(s => s.step === 'Response curve' && /Response\(48\)/.test(s.formula)));
});
