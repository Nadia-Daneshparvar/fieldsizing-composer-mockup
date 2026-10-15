'use strict';
// Engine inputs for the synthetic samples, built the way ui/app.js builds them after "Load synthetic sample project"
// (loadSampleProject -> mergedSampleRows -> buildInputs -> projectMethodAssumptions/chainValue). Kept independent of the
// DOM so engine fixtures can be produced and compared in Node.
const { load } = require('./modules.cjs');
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
const isNum = v => typeof v === 'number' && isFinite(v);

const METHODS = ['affordable', 'response', 'workload'];

function methodDefaults(OD) {
  const blankValue = () => ({ years: Array.from({ length: 5 }, () => ({ year: null, forecast: null, carryoverPct: null, otherChannelPct: null, sfPct: null })),
    sizingStartYear: null, grossMarginPct: 100, calibrationFactor: 1, annualValue: null, carryoverConvention: OD.carryoverConvention });
  return {
    blankValue,
    affordable: { value: blankValue(), allocation: OD.allocation, totalRoiCutoff: null, minimumBoundary: OD.minimumBoundary, reallocateExcluded: OD.reallocateExcluded === true },
    response: { value: blankValue(), allocation: OD.allocation, roiBasis: OD.roiBasis, cutoff: 1.0, stoppingRule: OD.stoppingRule, scenarioMaxCalls: 48,
      minimumBoundary: OD.minimumBoundary, cutoffTie: OD.cutoffTie, reachAppliesTo: OD.reachAppliesTo, maxCallsSource: OD.maxCallsSource, reallocateExcluded: OD.reallocateExcluded === true },
    workload: {}
  };
}

function chainValue(v, OD) {
  const years = (v.years || []).map((y, i) => ({ year: isNum(v.sizingStartYear) ? v.sizingStartYear + i : y.year, forecast: y.forecast, carryoverPct: y.carryoverPct,
    otherChannelPct: y.otherChannelPct, sfPct: isNum(y.sfPct) ? y.sfPct : null }));
  return { years, sizingStartYear: v.sizingStartYear, grossMarginPct: v.grossMarginPct, calibrationFactor: v.calibrationFactor, carryoverConvention: v.carryoverConvention || OD.carryoverConvention };
}

/* kind: 'single' (10-decile sample), 'multi' (specialty x decile sample) or 'entity' (single sample with the synthetic
   HCP entity rows, Response Curve only). Returns the inputs object the UI would send to FSEngine.calculate. */
function sampleInputs(kind, method, mods) {
  const { FSFields: F, FSSample: S } = mods || load();
  const OD = F.OPTION_DEFAULTS;
  const src = kind === 'multi' ? S.multiSpecialty : S;
  const a = src.segments('affordable'), w = src.segments('workload'), r = src.segments('response');
  const merged = a.map((s, i) => Object.assign({}, s, { plannedCalls: w[i].plannedCalls, archetypeMix: r[i].archetypeMix }));
  const inputGrain = kind === 'entity' ? 'entity' : 'summary';
  const ids = new Set(F.segmentFieldsFor(method, OD.allocation, inputGrain).map(f => f.id));
  const segments = merged.map(s => {
    const o = { segment: s.segment, entities: s.entities, compositeValue: null, reachPct: s.reachPct, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
    ['compositeValue', 'maxCalls', 'minCalls', 'plannedCalls', 'archetypeMix'].forEach(k => { if (ids.has(k)) o[k] = s[k] == null ? null : clone(s[k]); });
    if (ids.has('archetypeMix')) o.archetype = s.archetypeMix ? null : (s.archetype || null);
    if (typeof s.specialty === 'string') { o.specialty = s.specialty; o.decile = s.decile == null ? null : String(s.decile); }
    return o;
  });
  const md = methodDefaults(OD);
  const m = Object.assign(md[method], clone(S.methodAssumptions(method)));
  if (m.value) m.value = chainValue(Object.assign(md.blankValue(), S.methodAssumptions(method).value), OD);
  const sh = Object.assign({ capacity: null, costMode: OD.costMode, costPerCallMethod: OD.costPerCallMethod, repCost: null,
    layers: { flmSpan: null, flmCost: null, slmSpan: null, slmCost: null }, inflationPct: null, discountRatePct: null,
    horizon: { windowYears: 3, tailYears: 2 }, fteRounding: OD.fteRounding, capacityInput: { mode: 'derived', callsPerDay: null, workingDays: null } }, S.shared());
  sh.capacityInput = S.capacityInput(); sh.capacity = null;
  if (sh.costMode !== 'layers') sh.layers = null;
  const entities = kind === 'entity' ? S.entities().map(e => ({ id: e.id, segment: e.segment, value: e.value, archetype: e.archetype, attrs: clone(e.attrs) })) : null;
  return { method, grain: 'hcp', inputGrain, segments, entities, shared: sh, methodAssumptions: m };
}

/* Every sample x method case covered by the baseline (entity grain applies to Response Curve only). */
const CASES = [
  ...METHODS.map(m => ({ id: `single-${m}`, kind: 'single', method: m })),
  ...METHODS.map(m => ({ id: `multi-${m}`, kind: 'multi', method: m })),
  { id: 'entity-response', kind: 'entity', method: 'response' }
];

/* The comparable outputs (T3): FTE, calls, reach, contribution, ROI, binding constraint and exclusion reasons. */
function comparable(res) {
  const t = res.totals || {};
  return {
    errors: (res.errors || []).map(e => e.code),
    totals: { rawFte: t.rawFte, recommendedFte: t.recommendedFte, totalCalls: t.totalCalls, reached: t.reached, accessible: t.accessible,
      contribution: t.contribution === undefined ? null : t.contribution, roi: t.roi === undefined ? null : t.roi, fieldCost: t.fieldCost, valuePool: t.valuePool === undefined ? null : t.valuePool },
    segments: (res.segments || []).map(r => ({ segment: r.segment, rawFte: r.rawFte, totalCalls: r.totalCalls, reached: r.reached, accessible: r.accessible,
      finalCallsPerEntity: r.finalCallsPerEntity, contribution: r.contribution === undefined ? null : r.contribution, roi: r.roi === undefined ? null : r.roi,
      binding: r.binding, excluded: !!r.excluded, exclusionReason: r.exclusionReason || null }))
  };
}

module.exports = { METHODS, CASES, sampleInputs, comparable, clone };
