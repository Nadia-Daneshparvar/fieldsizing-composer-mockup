'use strict';
// T4: FSEngine.resolveCurves turns per-archetype preset assignments into engine curve inputs with provenance.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { sampleInputs, clone } = require('../helpers/sample-inputs.cjs');
const mods = load();
const { FSEngine } = mods;

// Beghou reference presets (plan §5), in picker order.
const PRESETS = [
  { id: 'slow', label: 'Slow uptake', delta: 5, gamma: 1.5, rho: 11 },
  { id: 'moderate', label: 'Moderate uptake', delta: 5, gamma: 1.1, rho: 3.5 },
  { id: 'steep', label: 'Steep uptake', delta: 5, gamma: 0.8, rho: 1.5 },
  { id: 'baseline', label: 'Baseline', delta: 5, gamma: 1.3, rho: 7 }
];

test('T4 preset assignment resolves to the exact preset values with preset provenance', () => {
  const r = FSEngine.resolveCurves({ 'Archetype A': 'slow', 'Archetype B': 'moderate', 'Archetype C': 'steep', 'Archetype D': 'baseline' }, PRESETS, {});
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.curveParams, {
    'Archetype A': { delta: 5, gamma: 1.5, rho: 11 }, 'Archetype B': { delta: 5, gamma: 1.1, rho: 3.5 },
    'Archetype C': { delta: 5, gamma: 0.8, rho: 1.5 }, 'Archetype D': { delta: 5, gamma: 1.3, rho: 7 }
  });
  assert.deepEqual(r.provenance['Archetype A'], { source: 'preset', presetId: 'slow', label: 'Slow uptake' });
  assert.deepEqual(r.provenance['Archetype D'], { source: 'preset', presetId: 'baseline', label: 'Baseline' });
});

test('T4 custom assignment resolves to the entered values with custom provenance', () => {
  const r = FSEngine.resolveCurves({ 'Archetype A': 'custom', ALL: 'custom' }, PRESETS,
    { 'Archetype A': { delta: 4, gamma: 1.7, rho: 9 }, ALL: { gamma: 1.2, rho: 6 } });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.curveParams['Archetype A'], { delta: 4, gamma: 1.7, rho: 9 });
  assert.deepEqual(r.curveParams.ALL, { delta: 5, gamma: 1.2, rho: 6 });        // delta defaults to 5
  assert.deepEqual(r.provenance['Archetype A'], { source: 'custom', presetId: null, label: null });
});

test('T4 unassigned archetypes are absent', () => {
  const r = FSEngine.resolveCurves({ 'Archetype A': 'slow', 'Archetype B': null, 'Archetype C': '' }, PRESETS, {});
  assert.deepEqual(Object.keys(r.curveParams), ['Archetype A']);
  assert.deepEqual(Object.keys(r.provenance), ['Archetype A']);
  assert.deepEqual(FSEngine.resolveCurves(undefined, undefined, undefined), { curveParams: {}, provenance: {}, issues: [] });
});

test('T4 unknown preset id gives an unknown-preset issue and no curve', () => {
  const r = FSEngine.resolveCurves({ 'Archetype A': 'no-such-preset', 'Archetype B': 'steep' }, PRESETS, {});
  assert.deepEqual(r.issues.map(i => i.code), ['unknown-preset']);
  assert.equal(r.issues[0].path, 'responseCurve.assignment.Archetype A');
  assert.ok(!('Archetype A' in r.curveParams));
  assert.deepEqual(r.curveParams['Archetype B'], { delta: 5, gamma: 0.8, rho: 1.5 });
});

test('T4 custom missing or invalid gives custom-curve-invalid issues', () => {
  const r = FSEngine.resolveCurves({ A: 'custom', B: 'custom', C: 'custom' }, PRESETS,
    { B: { delta: 0, gamma: 'x', rho: 5 }, C: { delta: 5, gamma: 1, rho: -2 } });
  const paths = r.issues.filter(i => i.code === 'custom-curve-invalid').map(i => i.path).sort();
  assert.deepEqual(paths, ['responseCurve.custom.A.gamma', 'responseCurve.custom.A.rho', 'responseCurve.custom.B.delta',
    'responseCurve.custom.B.gamma', 'responseCurve.custom.C.rho']);
  assert.equal(r.provenance.A.source, 'custom');
});

test('T4 resolved curves run through the engine; an unassigned data archetype fails validate() with unknown-archetype', () => {
  const base = sampleInputs('single', 'response', mods);
  const map = { Loyalists: 'Archetype A', Splitters: 'Archetype B', Dabblers: 'Archetype C', Conservatives: 'Archetype D' };
  base.segments.forEach(s => { const m = {}; Object.entries(s.archetypeMix).forEach(([k, v]) => { m[map[k]] = v; }); s.archetypeMix = m; });
  const asg = { 'Archetype A': 'slow', 'Archetype B': 'moderate', 'Archetype C': 'steep', 'Archetype D': 'baseline' };
  const r = FSEngine.resolveCurves(asg, PRESETS, {});
  const ok = clone(base);
  Object.assign(ok.methodAssumptions, { curveParams: r.curveParams, curveProvenance: r.provenance });
  const res = FSEngine.calculate(ok);
  assert.deepEqual(res.errors, []);
  assert.ok(res.totals.recommendedFte > 0);
  assert.deepEqual(res.curves['Archetype A'], { delta: 5, gamma: 1.5, rho: 11, source: 'preset', presetId: 'slow', label: 'Slow uptake' });
  const cpStep = res.trace.find(s => s.step === 'Curve parameters');
  assert.match(cpStep.formula, /Archetype A: preset Slow uptake/);
  assert.match(cpStep.formula, /Archetype D: preset Baseline/);

  const r2 = FSEngine.resolveCurves(Object.assign({}, asg, { 'Archetype D': undefined }), PRESETS, {});
  const bad = clone(base);
  Object.assign(bad.methodAssumptions, { curveParams: r2.curveParams, curveProvenance: r2.provenance });
  const v = FSEngine.validate(bad);
  assert.ok(v.errors.some(e => e.code === 'unknown-archetype' && /archetypeMix\.Archetype D$/.test(e.path)), JSON.stringify(v.errors));
  assert.ok(!v.errors.some(e => e.code === 'archetype-unknown'));
});
