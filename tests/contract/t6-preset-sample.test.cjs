'use strict';
// T6 (P2): the uptake presets synthetic sample runs end to end with the configuration's default assignment
// (Prospects -> Slow, Trialists -> Moderate, Early Leaders -> Steep), plus responseCurveSeed (I-2, D6) and the engine
// trace labels read from FSFields.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { METHODS, sampleInputs, clone } = require('../helpers/sample-inputs.cjs');
const mods = load();
const { FSFields: F, FSEngine: E, FSSample: S } = mods;
const C = F.RESPONSE_CURVE_CONFIG;
const codes = r => (r.errors || []).map(e => e.code);

/* Engine inputs after "Load uptake presets synthetic sample" (app.js loadPresetSampleProject): the single-sample inputs
   (shared, method assumptions) with presetSample's merged rows, filtered to the method's fields exactly as
   tests/helpers/sample-inputs.cjs does, and for Response Curve the curves resolved from the default assignment. */
function presetInputs(method) {
  const base = sampleInputs('single', method, mods);
  const src = S.presetSample;
  const a = src.segments('affordable'), w = src.segments('workload'), r = src.segments('response');
  const merged = a.map((s, i) => Object.assign({}, s, { plannedCalls: w[i].plannedCalls, archetypeMix: r[i].archetypeMix }));
  const ids = new Set(F.segmentFieldsFor(method, F.OPTION_DEFAULTS.allocation, 'summary').map(f => f.id));
  base.segments = merged.map(s => {
    const o = { segment: s.segment, entities: s.entities, compositeValue: null, reachPct: s.reachPct, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
    ['compositeValue', 'maxCalls', 'minCalls', 'plannedCalls', 'archetypeMix'].forEach(k => { if (ids.has(k)) o[k] = s[k] == null ? null : clone(s[k]); });
    if (ids.has('archetypeMix')) o.archetype = s.archetypeMix ? null : (s.archetype || null);
    return o;
  });
  if (method === 'response') {
    const rc = E.resolveCurves(C.defaultAssignment, C.presets, {});
    assert.deepEqual(rc.issues, []);
    base.methodAssumptions.curveParams = rc.curveParams;
    base.methodAssumptions.curveProvenance = rc.provenance;
  }
  return base;
}

test('presetSample has the multiSpecialty shape and synthetic content', () => {
  const P = S.presetSample;
  assert.equal(typeof P.segments, 'function');
  assert.equal(typeof P.entities, 'function');
  assert.ok(P.project && typeof P.project.name === 'string');
  assert.deepEqual(Object.keys(P.project), Object.keys(S.multiSpecialty.project));
  assert.notEqual(P.project.name, S.project.name);
  assert.notEqual(P.project.name, S.multiSpecialty.project.name);
  for (const m of METHODS) {
    const segs = P.segments(m);
    assert.equal(segs.length, 10);
    assert.deepEqual(Object.keys(segs[0]), Object.keys(S.segments(m)[0]));
    segs.forEach(s => {
      if (m === 'response') {
        assert.deepEqual(Object.keys(s.archetypeMix), Object.keys(C.defaultAssignment));
        assert.equal(Object.values(s.archetypeMix).reduce((x, y) => x + y, 0), 100);
      } else assert.equal(s.archetypeMix, null);
    });
  }
  // Fresh objects on each call; entity rows deterministic and only config archetypes.
  assert.notEqual(P.segments('response')[0].archetypeMix, P.segments('response')[0].archetypeMix);
  assert.deepEqual(P.entities(), P.entities());
  assert.ok(P.entities().every(e => Object.keys(C.defaultAssignment).includes(e.archetype)));
});

for (const m of METHODS) {
  test(`T6 presetSample x ${m} runs end to end with no validation errors`, () => {
    const inputs = presetInputs(m);
    assert.deepEqual(codes(E.validate(inputs)), []);
    const res = E.calculate(inputs);
    assert.deepEqual(codes(res), []);
    assert.ok(res.totals.recommendedFte > 0, 'recommends a field force');
    if (m === 'response') {
      assert.deepEqual(Object.keys(res.curves).sort(), ['Early Leaders', 'Prospects', 'Trialists']);
      const want = { Prospects: ['slow', 'Slow uptake'], Trialists: ['moderate', 'Moderate uptake'], 'Early Leaders': ['steep', 'Steep uptake'] };
      Object.keys(want).forEach(a => {
        const c = res.curves[a], p = C.presets.find(x => x.id === want[a][0]);
        assert.equal(c.source, 'preset'); assert.equal(c.presetId, want[a][0]); assert.equal(c.label, want[a][1]);
        assert.equal(c.delta, p.delta); assert.equal(c.gamma, p.gamma); assert.equal(c.rho, p.rho);
      });
    }
  });
}

test('responseCurveSeed: D6 Custom reference curves for the existing samples, empty for the presets sample', () => {
  const D6 = {
    assignment: { Loyalists: 'custom', Splitters: 'custom', Dabblers: 'custom', Conservatives: 'custom' },
    custom: { Loyalists: { delta: 5, gamma: 1.6, rho: 15 }, Splitters: { delta: 5, gamma: 1.1, rho: 2.5 },
      Dabblers: { delta: 5, gamma: 1.2, rho: 4.5 }, Conservatives: { delta: 5, gamma: 2, rho: 50 } },
    customSourceNote: 'Synthetic sample reference curves'
  };
  assert.deepEqual(S.responseCurveSeed('single'), D6);
  assert.deepEqual(S.responseCurveSeed('multi'), D6);
  assert.deepEqual(S.responseCurveSeed(), D6);
  assert.deepEqual(S.responseCurveSeed('presets'), { assignment: {}, custom: {}, customSourceNote: '' });
  // Fresh objects every call: mutating one seed never leaks into the next.
  const a = S.responseCurveSeed('single'), b = S.responseCurveSeed('single');
  assert.notEqual(a, b); assert.notEqual(a.custom, b.custom); assert.notEqual(a.custom.Loyalists, b.custom.Loyalists);
  a.custom.Loyalists.gamma = 9; a.assignment.Loyalists = 'slow';
  assert.deepEqual(S.responseCurveSeed('single'), D6);
  assert.notEqual(S.responseCurveSeed('presets').assignment, S.responseCurveSeed('presets').assignment);
  // Values agree with the engine's reference archetypes.
  Object.keys(E.ARCHETYPES).forEach(n => assert.deepEqual(D6.custom[n], { delta: E.ARCHETYPES[n].delta, gamma: E.ARCHETYPES[n].gamma, rho: E.ARCHETYPES[n].rho }));
});

test('responseCurveSeed through resolveCurves gives the 1.10.0 reference curve values', () => {
  const seed = S.responseCurveSeed('single');
  const rc = E.resolveCurves(seed.assignment, C.presets, seed.custom);
  assert.deepEqual(rc.issues, []);
  Object.keys(E.ARCHETYPES).forEach(n => {
    assert.deepEqual(rc.curveParams[n], { delta: E.ARCHETYPES[n].delta, gamma: E.ARCHETYPES[n].gamma, rho: E.ARCHETYPES[n].rho });
    assert.deepEqual(rc.provenance[n], { source: 'custom', presetId: null, label: null });
  });
  const ma = { curveParams: rc.curveParams, curveProvenance: rc.provenance };
  const eff = E.archetypesFor(ma), ref = E.archetypesFor({});
  Object.keys(E.ARCHETYPES).forEach(n => assert.deepEqual(eff[n], ref[n]));
  // And the seeded single-sample response run validates cleanly (the note satisfies custom-source-missing).
  const i = sampleInputs('single', 'response', mods);
  Object.assign(i.methodAssumptions, { curveParams: rc.curveParams, curveProvenance: rc.provenance, customSourceNote: seed.customSourceNote });
  assert.deepEqual(codes(E.calculate(i)), []);
});

test('engine trace labels come from FSFields: Custom label and All HCPs label', () => {
  const traceText = res => (res.trace || []).filter(s => s.step === 'Curve parameters').map(s => s.formula).join(' | ');
  // Custom archetype on the presets sample.
  const i = presetInputs('response');
  const rc = E.resolveCurves(Object.assign({}, C.defaultAssignment, { Prospects: 'custom' }), C.presets, { Prospects: { delta: 5, gamma: 1.4, rho: 9 } });
  Object.assign(i.methodAssumptions, { curveParams: rc.curveParams, curveProvenance: rc.provenance, customSourceNote: 'Synthetic marketing-mix note' });
  const r1 = E.calculate(i);
  assert.deepEqual(codes(r1), []);
  const t1 = traceText(r1);
  assert.ok(t1.includes(`Prospects: ${F.RESPONSE_CURVE_LABELS.custom},`), t1);
  assert.ok(t1.includes('Trialists: preset Moderate uptake'), t1);
  // Value-only with curveParams.ALL.
  const v = sampleInputs('single', 'response', mods);
  v.segments.forEach(s => { s.archetypeMix = null; s.archetype = null; });
  const rv = E.resolveCurves({ [F.RESPONSE_CURVE_RESERVED.all]: 'baseline' }, C.presets, {});
  Object.assign(v.methodAssumptions, { curveParams: rv.curveParams, curveProvenance: rv.provenance });
  const r2 = E.calculate(v);
  assert.deepEqual(codes(r2), []);
  const t2 = traceText(r2);
  assert.ok(t2.startsWith(`${F.RESPONSE_CURVE_LABELS.all}: preset Baseline`), t2);
});
