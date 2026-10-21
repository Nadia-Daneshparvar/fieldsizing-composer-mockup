'use strict';
// fs-engine 1.11.0 fix cycle 1: I-3 Amendments A1 (provenance rules), A2 (curveParams array), the value-only trace label,
// exact baseline totals and the summary-path archetype loop order. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { CASES, sampleInputs, comparable } = require('../helpers/sample-inputs.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const mods = load();
const { FSEngine } = mods;
const codes = v => v.errors.map(e => e.code);
const preset = (id, label) => ({ source: 'preset', presetId: id, label });

// F6: untouched 1.10.0-shaped inputs give totals and segment numbers EXACTLY (===) equal to the frozen baseline.
for (const c of CASES) {
  test(`F6 ${c.id}: untouched input reproduces the 1.10.0 baseline exactly (===)`, () => {
    const got = comparable(FSEngine.calculate(sampleInputs(c.kind, c.method, mods)));
    const want = BASE.cases[c.id].outputs;
    for (const k of Object.keys(want.totals)) assert.ok(Object.is(got.totals[k], want.totals[k]), `${c.id} totals.${k}: ${got.totals[k]} !== ${want.totals[k]}`);
    want.segments.forEach((w, j) => { for (const k of Object.keys(w)) assert.ok(Object.is(got.segments[j][k], w[k]), `${c.id} seg ${j}.${k}: ${got.segments[j][k]} !== ${w[k]}`); });
  });
}

// F6: the summary-path loop runs reference archetypes in ARCHETYPES order first, then the others in first-seen data order.
test('F6 summary loop order: reference archetypes first (reference order), then others in first-seen data order', () => {
  const i = sampleInputs('single', 'response', mods);
  i.segments.forEach((s, j) => {
    s.archetypeMix = j === 0 ? { 'Archetype Z': 10, Conservatives: 20, 'Archetype M': 30, Loyalists: 40 }
                             : { 'Archetype B': 10, Dabblers: 20, 'Archetype M': 30, Splitters: 40 };
  });
  i.methodAssumptions.curveParams = { 'Archetype B': { gamma: 1, rho: 3 }, 'Archetype M': { gamma: 1.2, rho: 4 }, 'Archetype Z': { gamma: 1.4, rho: 6 } };
  const res = FSEngine.calculate(i);
  assert.deepEqual(res.errors, []);
  const order = seg => res.trace.map(s => s.step).filter(n => n.startsWith(`Segment ${seg}, `)).map(n => n.slice(`Segment ${seg}, `.length));
  const s0 = i.segments[0].segment, s1 = i.segments[1].segment;
  assert.deepEqual(order(s0), ['Loyalists', 'Conservatives', 'Archetype Z', 'Archetype M']);
  assert.deepEqual(order(s1), ['Splitters', 'Dabblers', 'Archetype M', 'Archetype B']);
  assert.deepEqual(Object.keys(res.curves), ['Loyalists', 'Splitters', 'Dabblers', 'Conservatives', 'Archetype Z', 'Archetype M', 'Archetype B']);
});

// A2 (F1): a curveParams array is treated as {} (I-3 A2): no errors, the same outputs as a plain input and the same input
// hash rule. This is the 1.11.0 rule, not a replay of 1.10.0: an empty array was {} in 1.10.0 as well, but 1.10.0 validate
// (and so calculate) read a non-empty array's index keys ('0', ...) as archetype names and failed with archetype-unknown.
for (const arr of [[], [{ gamma: 3, rho: 9 }]]) {
  test(`A2 curveParams ${JSON.stringify(arr)} is treated as {} (1.11.0 rule; a non-empty array failed 1.10.0 validate)`, () => {
    const i = sampleInputs('single', 'response', mods);
    i.methodAssumptions.curveParams = arr;
    const res = FSEngine.calculate(i);
    assert.deepEqual(res.errors, []);
    const plain = FSEngine.calculate(sampleInputs('single', 'response', mods));
    assert.deepEqual(comparable(res), comparable(plain));
    assert.deepEqual(res.trace.map(s => s.formula), plain.trace.map(s => s.formula));
    assert.deepEqual({ ...FSEngine.archetypesFor(i.methodAssumptions).Loyalists }, { ...FSEngine.ARCHETYPES.Loyalists });
    // the hash is of the exact input object (which now carries the array), computed by the hash function unchanged since 1.10.0
    assert.equal(res.inputsHash, FSEngine._internal.fnv1a(FSEngine._internal.stableStringify(i)));
  });
}

// F8: provenance-less reference entries keep the 1.10.0 bounds.
test('F8 gamma > 10 on a reference name with no provenance is rejected (1.10.0 rule)', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Loyalists: { gamma: 10.5 } };
  assert.deepEqual(codes(FSEngine.validate(i)), ['curve-gamma-invalid']);
  i.methodAssumptions.curveParams = { Loyalists: { gamma: 10 } };
  assert.deepEqual(codes(FSEngine.validate(i)), []);
});

// F8 / A1: a reference name assigned a preset follows the new rules (no upper bound; delta must be > 0).
test('F8 A1 rho 100000 is accepted on a reference name assigned a preset', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Loyalists: { delta: 5, gamma: 1, rho: 100000 } };
  i.methodAssumptions.curveProvenance = { Loyalists: preset('synthetic-linear', 'Synthetic linear') };
  assert.deepEqual(codes(FSEngine.validate(i)), []);
  const res = FSEngine.calculate(i);
  assert.deepEqual(res.errors, []);
  assert.equal(res.curves.Loyalists.rho, 100000);
});

test('F8 A1 a preset with delta <= 0 (or non-numeric) on a reference name is rejected, never a silent fallback', () => {
  for (const d of [0, -2, 'x']) {
    const i = sampleInputs('single', 'response', mods);
    i.methodAssumptions.curveParams = { Loyalists: { delta: d, gamma: 1.6, rho: 15 } };
    i.methodAssumptions.curveProvenance = { Loyalists: preset('synthetic', 'Synthetic') };
    const e = FSEngine.validate(i).errors;
    assert.deepEqual(e.map(x => x.code), ['curve-params-invalid'], `delta ${d}`);
    assert.equal(e[0].path, 'methodAssumptions.curveParams.Loyalists.delta');
    assert.equal(FSEngine.archetypesFor(i.methodAssumptions).Loyalists.delta, d);   // used as given, not replaced by 5
  }
});

test('A1 preset provenance codes: gamma/rho invalid or missing use curve-gamma-invalid / curve-rho-invalid on any name', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Splitters: { delta: 5, gamma: 0, rho: 3 }, 'Archetype P': { delta: 5, gamma: 1 } };
  i.methodAssumptions.curveProvenance = { Splitters: preset('a', 'A'), 'Archetype P': preset('b', 'B') };
  const e = FSEngine.validate(i).errors.map(x => `${x.code} ${x.path}`).sort();
  assert.deepEqual(e, ['curve-gamma-invalid methodAssumptions.curveParams.Splitters.gamma', 'curve-rho-invalid methodAssumptions.curveParams.Archetype P.rho']);
  assert.ok(!FSEngine.validate(i).errors.some(x => x.code === 'custom-curve-invalid'));
});

test('A1 custom provenance on a reference name: gamma above 10 accepted, missing rho rejected as custom-curve-invalid', () => {
  const i = sampleInputs('single', 'response', mods);
  i.methodAssumptions.curveParams = { Dabblers: { delta: 5, gamma: 12, rho: 4.5 }, Conservatives: { delta: 5, gamma: 2 } };
  i.methodAssumptions.curveProvenance = { Dabblers: { source: 'custom', presetId: null, label: null }, Conservatives: { source: 'custom', presetId: null, label: null } };
  i.methodAssumptions.customSourceNote = 'Synthetic note';
  const e = FSEngine.validate(i).errors;
  assert.deepEqual(e.map(x => `${x.code} ${x.path}`), ['custom-curve-invalid methodAssumptions.curveParams.Conservatives.rho']);
});

// F5: the value-only row in the trace uses the FSFields label (fallback "All HCPs").
test('F5 value-only trace label comes from RESPONSE_CURVE_LABELS.all (fallback "All HCPs")', () => {
  const i = sampleInputs('single', 'response', mods);
  i.segments.forEach(s => { s.archetypeMix = null; s.archetype = null; });
  i.methodAssumptions.curveParams = { ALL: { delta: 5, gamma: 1.3, rho: 7 } };
  i.methodAssumptions.curveProvenance = { ALL: preset('baseline', 'Baseline') };
  const f = FSEngine.calculate(i).trace.find(s => s.step === 'Curve parameters').formula;
  const L = mods.FSFields.RESPONSE_CURVE_LABELS;
  const want = (L && typeof L.all === 'string' && L.all) || 'All HCPs';
  assert.ok(f.startsWith(`${want}: preset Baseline`), f);
  assert.ok(!/value-only\)/.test(f));
});

// P7 (P1-m3): a curve source (provenance entry) with no matching curveParams entry is refused, never computed: on a
// reference name it would put a preset or Custom label on the reference defaults. resolveCurves never produces it.
test('P1-m3 a provenance entry with no curveParams entry is a validate() error (reference and other names, any source)', () => {
  const L = mods.FSFields.RESPONSE_CURVE_LABELS;
  const cases = [
    [{ Splitters: { delta: 5, gamma: 1.1, rho: 2.5 } }, { Loyalists: preset('slow', 'Slow uptake'), Splitters: preset('moderate', 'Moderate uptake') }, ['Loyalists']],
    [undefined, { Loyalists: preset('slow', 'Slow uptake') }, ['Loyalists']],
    [[], { 'Archetype Q': { source: 'custom', presetId: null, label: null } }, ['Archetype Q']],
  ];
  for (const [cp, pv, want] of cases) {
    const i = sampleInputs('single', 'response', mods);
    if (cp === undefined) delete i.methodAssumptions.curveParams; else i.methodAssumptions.curveParams = cp;
    i.methodAssumptions.curveProvenance = pv;
    i.methodAssumptions.customSourceNote = 'Synthetic note';
    const e = FSEngine.validate(i).errors.filter(x => x.path.startsWith('methodAssumptions.curveProvenance.'));
    assert.deepEqual(e.map(x => `${x.code} ${x.path}`), want.map(n => `curve-params-invalid methodAssumptions.curveProvenance.${n}`), JSON.stringify(pv));
    assert.equal(e[0].message, L.provenanceWithoutCurve(want[0]));
    assert.ok(FSEngine.calculate(i).errors.length > 0, 'calculate refuses it too');
  }
});

test('P1-m3 inputs from resolveCurves and old-shape inputs raise no provenance error', () => {
  const C = mods.FSFields.RESPONSE_CURVE_CONFIG;
  const i = sampleInputs('single', 'response', mods);
  const rc = FSEngine.resolveCurves({ Loyalists: 'slow', Splitters: 'custom', Dabblers: 'nope' }, C.presets, { Splitters: { gamma: 1.2, rho: 3 } });
  assert.deepEqual(rc.issues.map(x => x.code), ['unknown-preset']);
  i.methodAssumptions.curveParams = rc.curveParams; i.methodAssumptions.curveProvenance = rc.provenance; i.methodAssumptions.customSourceNote = 'Synthetic note';
  assert.deepEqual(codes(FSEngine.validate(i)), []);
  const old = sampleInputs('single', 'response', mods);
  old.methodAssumptions.curveParams = { Loyalists: { gamma: 1.4 } };
  assert.deepEqual(codes(FSEngine.validate(old)), []);
});
