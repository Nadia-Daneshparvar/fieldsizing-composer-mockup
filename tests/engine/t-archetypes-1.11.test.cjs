'use strict';
// fs-engine 1.11.0 engine-level checks: any archetype id (summary mix and entity paths), the value-only 'ALL' curve,
// custom-curve-invalid, custom-source-missing and unknown-archetype. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { sampleInputs, comparable, clone } = require('../helpers/sample-inputs.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const mods = load();
const { FSEngine } = mods;
const codes = r => r.errors.map(e => e.code);

const REF = FSEngine.ARCHETYPES;
const THREE = { 'Archetype A': { delta: 5, gamma: 1.5, rho: 11 }, 'Archetype B': { delta: 5, gamma: 1.1, rho: 3.5 }, 'Archetype C': { delta: 5, gamma: 0.8, rho: 1.5 } };
const MAP3 = { Loyalists: 'Archetype A', Splitters: 'Archetype B', Dabblers: 'Archetype C', Conservatives: 'Archetype C' };

function remapMix(inputs, map) {
  inputs.segments.forEach(s => {
    const m = {};
    Object.entries(s.archetypeMix).forEach(([k, v]) => { m[map[k]] = (m[map[k]] || 0) + v; });
    s.archetypeMix = m;
  });
  return inputs;
}
function close(a, b) { return a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)); }

test('ARCHETYPES is exported unchanged', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(REF)), {
    Loyalists: { delta: 5, gamma: 1.6, rho: 15 }, Splitters: { delta: 5, gamma: 1.1, rho: 2.5 },
    Dabblers: { delta: 5, gamma: 1.2, rho: 4.5 }, Conservatives: { delta: 5, gamma: 2.0, rho: 50 } });
  assert.ok(Object.isFrozen(REF));
  assert.equal(typeof FSEngine.resolveCurves, 'function');
});

test('archetypesFor: reference set plus every curveParams key; delta overridable (default 5)', () => {
  const a = FSEngine.archetypesFor({ curveParams: { 'Archetype A': { gamma: 1.5, rho: 11 }, 'Archetype B': { delta: 3, gamma: 1, rho: 2 }, Loyalists: { delta: 7 } } });
  assert.deepEqual(Object.keys(a), ['Loyalists', 'Splitters', 'Dabblers', 'Conservatives', 'Archetype A', 'Archetype B']);
  assert.deepEqual({ ...a['Archetype A'] }, { delta: 5, gamma: 1.5, rho: 11 });
  assert.equal(a['Archetype B'].delta, 3);
  assert.deepEqual({ ...a.Loyalists }, { delta: 7, gamma: 1.6, rho: 15 });
  assert.deepEqual({ ...FSEngine.archetypesFor({}).Splitters }, { ...REF.Splitters });
});

test('summary mix path: three non-reference archetypes run with no errors', () => {
  const i = remapMix(sampleInputs('single', 'response', mods), MAP3);
  i.methodAssumptions.curveParams = clone(THREE);
  const res = FSEngine.calculate(i);
  assert.deepEqual(codes(res), []);
  assert.ok(res.totals.recommendedFte > 0);
  assert.deepEqual(Object.keys(res.curves), ['Archetype A', 'Archetype B', 'Archetype C']);
  assert.equal(res.curves['Archetype A'].source, null);
  assert.ok(res.trace.some(s => s.step === 'Normalization denominator, Archetype C'));
  assert.ok(!res.trace.some(s => s.step === 'Normalization denominator, Loyalists'));
});

test('entity path: three non-reference archetypes run with no errors', () => {
  const i = sampleInputs('entity', 'response', mods);
  i.entities.forEach(e => { e.archetype = MAP3[e.archetype]; });
  i.methodAssumptions.curveParams = clone(THREE);
  const res = FSEngine.calculate(i);
  assert.deepEqual(codes(res), []);
  assert.ok(res.totals.recommendedFte > 0);
  assert.equal(res.entityResults.length, i.entities.length);
});

test('renamed reference curves (four invented names, same values) reproduce the 1.10.0 baseline in both paths', () => {
  const map = { Loyalists: 'Archetype A', Splitters: 'Archetype B', Dabblers: 'Archetype C', Conservatives: 'Archetype D' };
  const cp = {};
  Object.entries(map).forEach(([r, n]) => { cp[n] = { delta: 5, gamma: REF[r].gamma, rho: REF[r].rho }; });
  for (const [kind, id] of [['single', 'single-response'], ['multi', 'multi-response'], ['entity', 'entity-response']]) {
    const i = sampleInputs(kind, 'response', mods);
    if (kind === 'entity') i.entities.forEach(e => { e.archetype = map[e.archetype]; }); else remapMix(i, map);
    i.methodAssumptions.curveParams = clone(cp);
    const got = comparable(FSEngine.calculate(i)), want = BASE.cases[id].outputs;
    assert.deepEqual(got.errors, []);
    for (const k of Object.keys(want.totals)) assert.ok(close(got.totals[k], want.totals[k]), `${id} totals.${k}: ${got.totals[k]} vs ${want.totals[k]}`);
    want.segments.forEach((w, j) => {
      for (const k of Object.keys(w)) {
        const g = got.segments[j][k];
        if (typeof w[k] === 'number') assert.ok(close(g, w[k]), `${id} seg ${j}.${k}: ${g} vs ${w[k]}`); else assert.equal(g, w[k], `${id} seg ${j}.${k}`);
      }
    });
  }
});

function valueOnly(kind) {
  const i = sampleInputs(kind, 'response', mods);
  if (kind === 'entity') i.entities.forEach(e => { e.archetype = null; });
  else i.segments.forEach(s => { s.archetypeMix = null; s.archetype = null; });
  return i;
}
for (const kind of ['single', 'entity']) {
  test(`value-only (${kind}): runs with curveParams.ALL and errors without it`, () => {
    const without = FSEngine.calculate(valueOnly(kind));
    assert.ok(codes(without).includes('response-needs-entity-or-mix'), JSON.stringify(codes(without)));
    const i = valueOnly(kind);
    i.methodAssumptions.curveParams = { ALL: { delta: 5, gamma: 1.3, rho: 7 } };
    i.methodAssumptions.curveProvenance = { ALL: { source: 'preset', presetId: 'baseline', label: 'Baseline' } };
    const res = FSEngine.calculate(i);
    assert.deepEqual(codes(res), []);
    assert.ok(res.totals.recommendedFte > 0);
    assert.deepEqual(Object.keys(res.curves), ['ALL']);
    assert.equal(res.curves.ALL.presetId, 'baseline');
    assert.ok(!FSEngine.validate(i).warnings.some(w => w.code === 'archetype-mix-approximation'));
  });
}

test('custom-curve-invalid: delta, gamma or rho <= 0, non-numeric, or gamma/rho missing', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = {
    Loyalists: { delta: 0, gamma: 1.6, rho: 15 }, Splitters: { delta: 5, gamma: -1, rho: 2.5 },
    Dabblers: { delta: 5, gamma: 1.2, rho: 'x' }, 'Archetype Z': { delta: 5, rho: 3 } };
  i.methodAssumptions.curveProvenance = { Loyalists: { source: 'custom', presetId: null, label: null },
    Splitters: { source: 'custom', presetId: null, label: null }, Dabblers: { source: 'custom', presetId: null, label: null } };
  i.methodAssumptions.customSourceNote = 'Synthetic note';
  const paths = FSEngine.validate(i).errors.filter(e => e.code === 'custom-curve-invalid').map(e => e.path).sort();
  assert.deepEqual(paths, ['methodAssumptions.curveParams.Archetype Z.gamma', 'methodAssumptions.curveParams.Dabblers.rho',
    'methodAssumptions.curveParams.Loyalists.delta', 'methodAssumptions.curveParams.Splitters.gamma']);
  assert.ok(!FSEngine.validate(i).errors.some(e => e.code === 'curve-gamma-invalid' || e.code === 'curve-rho-invalid'));
});

test('custom curves have no upper bound; reference entries without custom provenance keep the 1.10.0 rules', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Loyalists: { delta: 5, gamma: 1, rho: 100000 } };
  i.methodAssumptions.curveProvenance = { Loyalists: { source: 'custom', presetId: null, label: null } };
  i.methodAssumptions.customSourceNote = 'Synthetic note';
  assert.deepEqual(FSEngine.validate(i).errors, []);
  delete i.methodAssumptions.curveProvenance;
  assert.deepEqual(FSEngine.validate(i).errors.map(e => e.code), ['curve-rho-invalid']);
  i.methodAssumptions.curveParams = { Loyalists: { gamma: 0 } };
  assert.deepEqual(FSEngine.validate(i).errors.map(e => e.code), ['curve-gamma-invalid']);
});

test('custom-source-missing: a custom curve needs a source note', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Loyalists: { delta: 5, gamma: 1.6, rho: 15 } };
  i.methodAssumptions.curveProvenance = { Loyalists: { source: 'custom', presetId: null, label: null } };
  for (const note of [undefined, '', '   ']) {
    i.methodAssumptions.customSourceNote = note;
    const e = FSEngine.validate(i).errors.filter(x => x.code === 'custom-source-missing');
    assert.equal(e.length, 1, `note ${JSON.stringify(note)}`);
    assert.equal(e[0].path, 'methodAssumptions.customSourceNote');
  }
  i.methodAssumptions.customSourceNote = 'Synthetic note';
  assert.deepEqual(FSEngine.validate(i).errors, []);
  i.methodAssumptions.curveProvenance = { Loyalists: { source: 'preset', presetId: 'slow', label: 'Slow uptake' } };
  i.methodAssumptions.customSourceNote = '';
  assert.deepEqual(FSEngine.validate(i).errors, []);
});

test('unknown-archetype replaces archetype-unknown (entity, segment archetype, mix key); curveParams keys are never unknown', () => {
  const e = sampleInputs('entity', 'response', mods);
  e.entities[0].archetype = 'Archetype Q';
  assert.deepEqual(codes(FSEngine.validate(e)), ['unknown-archetype']);
  const s = sampleInputs('single', 'response', mods);
  s.segments[0].archetypeMix = null; s.segments[0].archetype = 'Archetype Q';
  s.segments[1].archetypeMix = { Loyalists: 50, 'Archetype R': 50 };
  const v = FSEngine.validate(s).errors.filter(x => x.code === 'unknown-archetype');   // the unknown mix key also leaves the mix short of 100% (1.10.0 behaviour)
  assert.equal(v.length, 2);
  assert.deepEqual(v.map(x => x.path), ['segments[0].archetype', 'segments[1].archetypeMix.Archetype R']);
  s.methodAssumptions.curveParams = { 'Archetype Q': { gamma: 1, rho: 3 }, 'Archetype R': { gamma: 1.2, rho: 4 } };
  assert.deepEqual(FSEngine.calculate(s).errors, []);
});

test('legacy input (no provenance, reference keys only) keeps the 1.10.0 trace wording', () => {
  const res = FSEngine.calculate(sampleInputs('single', 'response', mods));
  const st = res.trace.find(s => s.step === 'Curve parameters');
  assert.equal(st.formula, 'reference defaults (decision 9) for every archetype');
  assert.equal(res.trace.filter(s => /^Normalization denominator, /.test(s.step)).length, 4);
  assert.equal(res.curves.Loyalists.source, null);
  assert.equal(FSEngine.calculate(sampleInputs('single', 'workload', mods)).curves, null);
});
