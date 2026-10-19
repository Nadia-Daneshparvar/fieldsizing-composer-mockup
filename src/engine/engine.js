/* ---- engine/engine.js ---- */
/* Field Sizing calculation engine (deterministic, no AI).
 * Implements contract/data-contract.md §2. Pure functions; no DOM; the only global is FSEngine.
 * Formula authority: Field Sizing Calculation Specification v0.1 plus the locked product decisions
 * recorded in engine/NOTES.md. No reference-case values live in this file.
 */
(function (root) {
  'use strict';

  const VERSION = 'fs-engine 1.11.0';   // 1.11.0 (2026-10-15): any curve archetype id, delta input, resolveCurves presets, value-only ALL curve, result.curves

  // Locked methodology (decision 9). delta cancels under normalization; kept for traceability.
  const ARCHETYPES = Object.freeze({
    Loyalists: Object.freeze({ delta: 5, gamma: 1.6, rho: 15 }),
    Splitters: Object.freeze({ delta: 5, gamma: 1.1, rho: 2.5 }),
    Dabblers: Object.freeze({ delta: 5, gamma: 1.2, rho: 4.5 }),
    Conservatives: Object.freeze({ delta: 5, gamma: 2.0, rho: 50 })
  });
  const ARCH_NAMES = Object.keys(ARCHETYPES);
  // 2026-10-12 SME review: gamma and rho are user inputs per archetype (methodAssumptions.curveParams), defaulting to the
  // values above. Decision 9 is amended: the defaults stay the reference values, but the user can change the curve shape.
  // delta cancels under normalization, so it is not an input. Absent or partial curveParams fall back to the defaults.
  // fs-engine 1.11.0 (response-curve presets): curveParams may name ANY archetype id (FR-47). delta is now an input (default 5).
  // I-3 A1: an entry WITH provenance (preset or custom), whatever its name, is used exactly as given (delta defaults to 5 only
  // when absent) and validate() requires delta/gamma/rho > 0 with no upper bound. Only a provenance-less entry on a reference
  // name keeps the 1.10.0 rules: per-parameter fallback to the reference default (delta: absent or non-positive -> 5).
  // Every other key brings its own gamma and rho. I-3 A2: a curveParams array is treated as {} (1.10.0 failed a non-empty one).
  // 'ALL' is the reserved id of the value-only "All HCPs" curve (D3). Key order: reference archetypes, then curveParams order.
  const DEFAULT_DELTA = 5;
  const ALL_ID = 'ALL';
  const curveParamsOf = ma => ((ma && ma.curveParams && typeof ma.curveParams === 'object' && !Array.isArray(ma.curveParams)) ? ma.curveParams : {});
  const deltaOf = (u, d) => (isNum(u.delta) && u.delta > 0 ? u.delta : d);
  const asGiven = u => Object.freeze({ delta: u.delta === undefined || u.delta === null ? DEFAULT_DELTA : u.delta, gamma: u.gamma, rho: u.rho });
  function archetypesFor(ma) {
    const cp = curveParamsOf(ma), prov = provenanceOf(ma);
    const hasProv = n => !!(prov[n] && typeof prov[n] === 'object');
    const out = {};
    ARCH_NAMES.forEach(n => {
      const d = ARCHETYPES[n], u = (cp[n] && typeof cp[n] === 'object') ? cp[n] : {};
      out[n] = hasProv(n) && cp[n] ? asGiven(u)
        : Object.freeze({ delta: deltaOf(u, d.delta), gamma: isNum(u.gamma) ? u.gamma : d.gamma, rho: isNum(u.rho) ? u.rho : d.rho });
    });
    Object.keys(cp).forEach(n => {
      if (ARCHETYPES[n]) return;
      out[n] = asGiven((cp[n] && typeof cp[n] === 'object') ? cp[n] : {});
    });
    return Object.freeze(out);
  }
  // True when the input uses only the 1.10.0 shape (reference keys, no provenance): trace text then stays exactly 1.10.0.
  const legacyCurves = ma => !(ma && ma.curveProvenance && typeof ma.curveProvenance === 'object') && Object.keys(curveParamsOf(ma)).every(n => ARCHETYPES[n]);
  const provenanceOf = ma => ((ma && ma.curveProvenance && typeof ma.curveProvenance === 'object' && !Array.isArray(ma.curveProvenance)) ? ma.curveProvenance : {});
  const blankArch = a => a === undefined || a === null || a === '';

  // Resolve per-archetype preset assignments into engine curve inputs (pure; I-3).
  //   assignment: { [archetypeId | 'ALL']: presetId | 'custom' } (unassigned archetypes are absent or blank)
  //   presets:    [ { id, label, delta, gamma, rho, ... } ]      custom: { [archetypeId]: { delta?, gamma, rho } }
  // Returns { curveParams, provenance, issues }. A Custom entry is passed through as entered (delta defaults to 5) even when
  // invalid, so validate() reports it against the archetype; an unknown preset id is left out of curveParams.
  const CUSTOM_ID = 'custom';
  function resolveCurves(assignment, presets, custom) {
    const asg = assignment && typeof assignment === 'object' && !Array.isArray(assignment) ? assignment : {};
    const list = Array.isArray(presets) ? presets : [];
    const cus = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
    const curveParams = {}, provenance = {}, issues = [];
    Object.keys(asg).forEach(id => {
      const a = asg[id];
      if (blankArch(a)) return;
      if (a === CUSTOM_ID) {
        const c = cus[id] && typeof cus[id] === 'object' ? cus[id] : {};
        const delta = c.delta === undefined || c.delta === null ? DEFAULT_DELTA : c.delta;
        const gamma = c.gamma === undefined ? null : c.gamma, rho = c.rho === undefined ? null : c.rho;
        curveParams[id] = { delta, gamma, rho };
        provenance[id] = { source: 'custom', presetId: null, label: null };
        [['delta', delta], ['gamma', gamma], ['rho', rho]].forEach(([k, x]) => {
          if (!isNum(x) || x <= 0) issues.push({ code: 'custom-curve-invalid', path: `responseCurve.custom.${id}.${k}`,
            message: `${id}: custom curve ${EXTRA_LABELS[k]} must be a number above 0.` });
        });
        return;
      }
      const p = list.find(x => x && x.id === a);
      if (!p) { issues.push({ code: 'unknown-preset', path: `responseCurve.assignment.${id}`, message: `${id}: uptake preset "${a}" is not in the configuration.` }); return; }
      curveParams[id] = { delta: p.delta, gamma: p.gamma, rho: p.rho };
      provenance[id] = { source: 'preset', presetId: p.id, label: p.label === undefined ? null : p.label };
    });
    return { curveParams, provenance, issues };
  }
  const curveParamsEdited = ma => { const a = archetypesFor(ma); return ARCH_NAMES.filter(n => a[n].gamma !== ARCHETYPES[n].gamma || a[n].rho !== ARCHETYPES[n].rho); };

  const METHODS = ['affordable', 'response', 'workload'];
  const GRAINS = ['hcp', 'account', 'site'];
  // 2026-10-12 review: value is always allocated in proportion to composite value. 'equal' and 'custom' (user-entered
  // shares) are retired for Affordable Coverage and Response Curve; a saved input that still carries them fails validation.
  const ALLOCATIONS = ['proportional'];
  const BASES = ['gross', 'net'];
  const RULES = ['first-fail', 'min-block', 'max-pass'];
  const COST_MODES = ['fullyLoaded', 'layers'];
  const COST_METHODS = ['single-window', 'rolling-windows'];
  const FTE_ROUNDING = ['nearest', 'up', 'none'];
  const CAPACITY_MODES = ['direct', 'derived'];
  const MIN_BOUNDARIES = ['inclusive', 'strict'];
  const CUTOFF_TIES = ['include', 'exclude'];
  const REACH_APPLIES = ['calls', 'callsAndValue'];
  const MAX_SOURCES = ['segment', 'entityAttribute'];
  const CARRY_CONVENTIONS = ['receivingYear', 'sourceYear'];
  const SHARE_TOL = 1e-6;       // archetype mix must total 100 within this
  const TIE_TOL = 1e-12;        // relative tolerance on the >= cutoff comparison (PE-03)
  const MAX_ISSUES_PER_CODE = 20;

  // ---------- small helpers ----------
  const isNum = x => typeof x === 'number' && Number.isFinite(x);
  const isInt = x => isNum(x) && Math.floor(x) === x;
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  function fmt(n) {
    if (n === null || n === undefined) return 'n/a';
    if (!isNum(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    const a = Math.abs(n);
    if (a >= 1000) return n.toFixed(2);
    if (a >= 1) return n.toFixed(4);
    return n.toPrecision(6);
  }
  // User-visible wording comes from FSFields (loaded first in the browser; required in Node).
  const FL = (root && root.FSFields) || (typeof require === 'function' ? (() => { try { return require('../contract/fields.js'); } catch (e) { return null; } })() : null);
  const optLabel = (group, key) => (FL && FL.OPTION_LABELS && FL.OPTION_LABELS[group] && FL.OPTION_LABELS[group][key]) || String(key);
  const optChoices = group => (FL && FL.OPTION_LABELS && FL.OPTION_LABELS[group] ? Object.values(FL.OPTION_LABELS[group]).map(l => `"${l}"`).join(' or ') : '');
  const bindLabel = key => (FL && FL.BINDING_LABELS && FL.BINDING_LABELS[key]) || String(key);
  const provenanceWithoutCurve = n => (FL && FL.RESPONSE_CURVE_LABELS && typeof FL.RESPONSE_CURVE_LABELS.provenanceWithoutCurve === 'function'
    ? FL.RESPONSE_CURVE_LABELS.provenanceWithoutCurve(n) : `${n}: the curve source has no curve values.`);
  const EXTRA_LABELS = { capacity: 'Effective annual capacity', capacityInput: 'Capacity input', callsPerDay: 'Calls per day', workingDays: 'Working days',
    repCost: 'Annual rep cost', costMode: 'Cost mode', costPerCallMethod: 'Cost per call method', fteRounding: 'FTE rounding', inflationPct: 'Cost inflation %',
    discountRatePct: 'Discount rate %', layers: 'Management layers', windowYears: 'Sizing window (years)', annualValue: 'Annual impactable value',
    value: 'Impactable value', years: 'Forecast years', carryoverPct: 'Carryover %', otherChannelPct: 'Other channel %', sizingStartYear: 'First sizing year',
    carryoverConvention: 'Carryover convention', calibrationFactor: 'Calibration factor', grossMarginPct: 'Gross margin %', allocation: 'Allocation',
    totalRoiCutoff: 'ROI cutoff', roiBasis: 'ROI basis', cutoff: 'Marginal ROI cutoff', stoppingRule: 'Stopping rule', scenarioMaxCalls: 'Normalization point (calls)',
    minimumBoundary: 'Minimum boundary', cutoffTie: 'Cutoff tie', reachAppliesTo: 'Reach applies to', maxCallsSource: 'Maximum calls source',
    method: 'Method', grain: 'Grain', segments: 'Segments', entities: 'Entity rows', id: 'Entity ID', archetype: 'Curve archetype',
    impactablePct: (FL && FL.ASSUMPTION_LABELS && FL.ASSUMPTION_LABELS.impactablePct) || 'Salesforce-impactable %',
    sfPct: (FL && FL.ASSUMPTION_LABELS && FL.ASSUMPTION_LABELS.sfPct) || 'Salesforce-impactable %', forecastMode: 'Forecast inputs',
    reallocateExcluded: (FL && FL.ASSUMPTION_LABELS && FL.ASSUMPTION_LABELS.reallocateExcluded) || 'Reallocate value from excluded segments',
    specialty: 'Specialty', decile: 'Decile', curveParams: 'Response curve parameters', gamma: 'Curve shape (gamma)', rho: 'Curve saturation (rho)',
    delta: 'Curve scale (delta)', curveProvenance: 'Response curve source', customSourceNote: 'Custom curve source note' };
  function fieldLabel(path, grain) {
    const ids = String(path || '').replace(/\[[^\]]*\]/g, '').split('.').filter(Boolean);
    const g = FL && FL.GRAIN && FL.GRAIN[grain] ? grain : 'hcp';
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i];
      if (FL && FL.OPTION_LABELS && ARCHETYPES[id]) continue;
      if (i > 0 && (ids[i - 1] === 'curveParams' || ids[i - 1] === 'archetypeMix' || ids[i - 1] === 'curveProvenance')) continue;   // archetype id, not a field
      const sf = FL && FL.SEGMENT_FIELDS && FL.SEGMENT_FIELDS.find(f => f.id === id);
      if (sf && !(ids[0] === 'entities' && id === 'segment')) return sf.label(g);
      const mf = FL && FL.MAPPING_FIELDS && ids[0] === 'entities' && FL.MAPPING_FIELDS.find(f => f.id === id || (id === 'id' && f.id === 'entityId'));
      if (mf) return mf.label;
      if (EXTRA_LABELS[id]) return EXTRA_LABELS[id];
    }
    return null;
  }
  const pct = reachPct => `${fmt(reachPct)}%`;           // reach is always displayed as a percent (v1.6)
  // v1.6 invariant: an excluded segment's binding follows its exclusion reason.
  const BINDING_FOR_REASON = { 'no-profitable-call': 'profitability', 'below-minimum': 'min', 'no-reach': 'none', 'no-value': 'none', 'no-planned-calls': 'none' };
  const bindingForReason = r => BINDING_FOR_REASON[r] || 'none';
  function step(stepName, formula, value, source) { return { step: stepName, formula, value, source: source || 'Calculation' }; }

  function IssueList(grain) {
    const list = []; const counts = {};
    return {
      list,
      add(code, path, message, extra) {
        counts[code] = (counts[code] || 0) + 1;
        if (counts[code] <= MAX_ISSUES_PER_CODE) list.push(Object.assign({ code, path, message, label: fieldLabel(path, grain) }, extra || {}));
        else if (counts[code] === MAX_ISSUES_PER_CODE + 1) list.push({ code, path: '*', message: 'Further issues of this type suppressed.', label: null });
      },
      has() { return list.length > 0; }
    };
  }

  // Stable stringify + FNV-1a 32-bit (hash of the exact inputs used for the run).
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ---------- defaults for method assumptions ----------
  function responseOptions(ma) {
    const m = ma || {};
    const roiBasis = m.roiBasis === undefined ? 'gross' : m.roiBasis;
    const cutoff = m.cutoff === undefined ? (roiBasis === 'net' ? 0 : 1.0) : m.cutoff;
    return {
      roiBasis, cutoff,
      stoppingRule: m.stoppingRule === undefined ? 'first-fail' : m.stoppingRule,
      scenarioMaxCalls: m.scenarioMaxCalls === undefined ? 48 : m.scenarioMaxCalls,
      allocation: m.allocation === undefined ? 'proportional' : m.allocation,
      minimumBoundary: m.minimumBoundary === undefined ? 'inclusive' : m.minimumBoundary,
      cutoffTie: m.cutoffTie === undefined ? 'include' : m.cutoffTie,
      reachAppliesTo: m.reachAppliesTo === undefined ? 'calls' : m.reachAppliesTo,
      maxCallsSource: m.maxCallsSource === undefined ? 'segment' : m.maxCallsSource
    };
  }

  // ---------- shared: effective annual capacity (direct or derived, v1.3) ----------
  function resolveCapacity(shared) {
    const s = shared || {};
    const ci = s.capacityInput;
    if (ci && ci.mode === 'derived') {
      const c = ci.callsPerDay * ci.workingDays;
      return { capacity: c, mode: 'derived', trace: [step('Effective annual capacity (derived)', `${fmt(ci.callsPerDay)} calls per day x ${fmt(ci.workingDays)} working days = ${fmt(c)}`, c, 'Capacity option: derived')] };
    }
    return { capacity: s.capacity, mode: 'direct', trace: [step('Effective annual capacity (entered)', `${fmt(s.capacity)}`, s.capacity, 'Spec §2.1')] };
  }
  function withCapacity(shared) { return Object.assign({}, shared, { capacity: resolveCapacity(shared).capacity }); }

  // ---------- shared: cost per call (Spec §2.2, PE-06 structure) ----------
  function loadedRepCost(shared) {
    if (shared.costMode === 'layers') {
      const L = shared.layers || {};
      // flmSpan = reps per first-line manager; slmSpan = first-line managers per second-line manager.
      return shared.repCost + L.flmCost / L.flmSpan + L.slmCost / (L.flmSpan * L.slmSpan);
    }
    return shared.repCost;
  }

  function costPerCall(shared) {
    const s = withCapacity(shared || {});
    const trace = [];
    const W = (s.horizon && isInt(s.horizon.windowYears) && s.horizon.windowYears > 0) ? s.horizon.windowYears : 3;
    const infl = (isNum(s.inflationPct) ? s.inflationPct : 0) / 100;
    const d = (isNum(s.discountRatePct) ? s.discountRatePct : 0) / 100;
    const year1 = loadedRepCost(s);
    if (!isNum(year1) || !isNum(s.capacity) || s.capacity <= 0) {
      return { perYear: [], effective: null, loadedRepCost: null, trace: [step('Cost per call', 'unavailable: rep cost and capacity required', null)] };
    }
    if (s.costMode === 'layers') {
      const L = s.layers;
      trace.push(step('Loaded annual cost per rep (year 1)',
        `${fmt(s.repCost)} + ${fmt(L.flmCost)} / ${fmt(L.flmSpan)} + ${fmt(L.slmCost)} / (${fmt(L.flmSpan)} x ${fmt(L.slmSpan)}) = ${fmt(year1)}`, year1, 'Spec §2.3 layers'));
    } else {
      trace.push(step('Fully loaded annual cost per rep (year 1)', `${fmt(year1)}`, year1, 'Spec §2.3 fully loaded'));
    }
    const method = s.costPerCallMethod === undefined ? 'single-window' : s.costPerCallMethod;
    const nYears = method === 'rolling-windows' ? 2 * W - 1 : W;
    const perYear = [];
    for (let t = 0; t < nYears; t++) {
      const c = year1 * Math.pow(1 + infl, t) / s.capacity;
      perYear.push(c);
      trace.push(step(`Cost per call, year ${t + 1}`, `${fmt(year1)} x (1 + ${fmt(infl)})^${t} / ${fmt(s.capacity)} = ${fmt(c)}`, c, 'Spec §2.2'));
    }
    // One W-year window starting at year index a: [c(a) + c(a+1)/(1+d) + ...] / W
    const windowAvg = a => {
      let v = 0;
      for (let t = 0; t < W; t++) v += perYear[a + t] / Math.pow(1 + d, t);
      return v / W;
    };
    const windowText = a => '[' + perYear.slice(a, a + W).map((c, t) => t === 0 ? fmt(c) : `${fmt(c)}/(1+${fmt(d)})^${t}`).join(' + ') + `] / ${W}`;
    let effective;
    if (method === 'rolling-windows') {
      const wins = [];
      for (let a = 0; a < W; a++) {
        const w = windowAvg(a);
        wins.push(w);
        trace.push(step(`Discounted ${W}-year window starting year ${a + 1}`, `${windowText(a)} = ${fmt(w)}`, w, 'Cost option: rolling windows'));
      }
      effective = sum(wins) / W;
      trace.push(step('Effective cost per call (rolling windows)', `(${wins.map(fmt).join(' + ')}) / ${W} = ${fmt(effective)}`, effective, 'Cost option: rolling windows'));
    } else {
      effective = windowAvg(0);
      trace.push(step('Effective cost per call (single window)', `${windowText(0)} = ${fmt(effective)}`, effective, 'Spec §2.2 / PE-06'));
    }
    return { perYear, effective, method, loadedRepCost: year1, trace };
  }

  // ---------- shared: impactable value (Spec §2; cohort/carryover chain) ----------
  // value = { annualValue? | years:[{year, forecast, carryoverPct, otherChannelPct, sfPct?}], forecastMode?, sizingStartYear,
  //           grossMarginPct (default 100), calibrationFactor (default 1), discountRatePct? }
  // carryoverPct on year t = share of each earlier cohort's prior-year sales retained INTO year t (receiving year).
  // CS-1 revised (fs-engine 1.9): Forecast(t) = Other(t) + CarryIn(t) + SFnew(t); the user enters two, the engine derives the third.
  //   'carryover+other' (default; absent = default): SFnew = max(0, F - Other - CarryIn)   exactly fs-engine 1.7.0
  //   'carryover+sf':  SFnew = F x sf;  Other = F - SFnew - CarryIn        (error derived-other-negative if < 0)
  //   'other+sf':      SFnew = F x sf;  CarryIn = F - Other - SFnew        (error derived-carryover-negative if < 0;
  //                    year 1 must be 0, else first-year-carryover); rate(t) = CarryIn / TotalSF(t-1)
  // The v0.4 impactablePct multiplier is withdrawn: the key is ignored (validate warns impactable-withdrawn).
  // Not applied in direct annualValue mode.
  // v0.5.1 (fs-engine 1.9.1, CS-1 "the reference-workbook way"): the UI and AI always use the default chain; the B/C modes stay as
  // dormant, tested capability. In the default mode years[i].sfPct is a CHECK value only and never changes a number.
  // Additive per-cohort fields (every mode): impliedSfPct = SFnew / F x 100; carryoverSharePct = CarryIn / F x 100;
  // sfPctEntered (number or null); checkSumPct = (sfPctEntered ?? impliedSfPct) + otherChannelPct + carryoverSharePct;
  // floored = F - Other - CarryIn < 0 (default mode only; tolerance amountTol(F) so float noise at exactly 100% is not a floor).
  // F = 0: shares and checkSumPct are null and nothing is checked. Non-blocking warnings (default mode only):
  //   shares-not-100 when |checkSumPct - 100| > 0.5, first forecast year only (2026-10-12 review) (not raised for a floored year with no entered sfPct: there the gap is
  //   the floor itself, which sf-floored reports); sf-floored when floored.
  // F1 (v0.4 fix round): the calibration factor is legacy (default 1, not a client input). At exactly 1 the pool text
  // drops the calibration wording; any other saved value keeps the "x calibration k" wording.
  function poolFormula(annual, calib, pool) {
    return calib === 1 ? `Annual impactable value ${fmt(annual)} = value pool ${fmt(pool)}` : `${fmt(annual)} x calibration ${fmt(calib)} = ${fmt(pool)}`;
  }
  function poolEffect(calib) { return calib === 1 ? 'Annual impactable value' : `Annual impactable value x calibration ${fmt(calib)}`; }
  const DERIVED_FOR_MODE = Object.freeze({ 'carryover+other': 'sf', 'carryover+sf': 'other', 'other+sf': 'carryover' });
  const FORECAST_MODES = Object.keys(DERIVED_FOR_MODE);
  const forecastModeOf = v => (v && v.forecastMode !== undefined && v.forecastMode !== null ? v.forecastMode : 'carryover+other');
  const amountTol = F => 1e-9 * Math.max(1, Math.abs(F));   // absolute tolerance on derived amounts (relative to the forecast)
  const CHECK_TOL_PTS = 0.5;                                    // shares-not-100 threshold, percentage points (CS-1); +1e-9 float slack at the boundary
  const pct1 = x => `${Math.round(x * 10) / 10}%`;              // check-warning display: at most one decimal
  function impactableValue(value, shared) {
    const v = value || {};
    const sh = shared || {};
    const trace = [];
    const calib = isNum(v.calibrationFactor) ? v.calibrationFactor : 1.0;
    const gm = (isNum(v.grossMarginPct) ? v.grossMarginPct : 100) / 100;
    const W = (sh.horizon && isInt(sh.horizon.windowYears) && sh.horizon.windowYears > 0) ? sh.horizon.windowYears : 3;
    const tail = (sh.horizon && isInt(sh.horizon.tailYears) && sh.horizon.tailYears >= 0) ? sh.horizon.tailYears : 2;
    const mode = forecastModeOf(v);
    if (isNum(v.annualValue)) {
      const pool = v.annualValue * calib;
      trace.push(step('Annual impactable value (entered)', `${fmt(v.annualValue)}`, v.annualValue, 'user input'));
      trace.push(step('Value pool', poolFormula(v.annualValue, calib, pool), pool, 'Spec §3.3 calibration'));
      return { annual: v.annualValue, pool, calibrationFactor: calib, forecastMode: mode, perYear: [], cohorts: [], errors: [], issues: [], warnings: [], trace };
    }
    const errors = [];
    const years = Array.isArray(v.years) ? v.years.slice().sort((a, b) => a.year - b.year) : [];
    if (!years.length) return { annual: null, pool: null, calibrationFactor: calib, forecastMode: mode, perYear: [], cohorts: [], errors: ['no value inputs'], issues: [], warnings: [], trace };
    const d = (isNum(v.discountRatePct) ? v.discountRatePct : (isNum(sh.discountRatePct) ? sh.discountRatePct : 0)) / 100;
    if (!isInt(v.sizingStartYear)) return { annual: null, pool: null, calibrationFactor: calib, forecastMode: mode, perYear: [], cohorts: [], errors: ['sizingStartYear is required'], issues: [], warnings: [], trace };
    if (!FORECAST_MODES.includes(mode)) return { annual: null, pool: null, calibrationFactor: calib, forecastMode: mode, perYear: [], cohorts: [], errors: ['forecastMode is not recognised'], issues: [], warnings: [], trace };
    const start = v.sizingStartYear;
    const n = years.length;
    const modeC = mode === 'other+sf';
    const sourceConv = v.carryoverConvention === 'sourceYear' && !modeC;     // mode C derives the receiving-year rate
    const explicitMode = v.forecastMode !== undefined && v.forecastMode !== null;   // absent mode keeps the 1.7.0 trace
    trace.push(step('Carryover convention', sourceConv ? 'rate recorded on the source year' : (modeC ? 'rate recorded on the receiving year (derived)' : 'rate recorded on the receiving year'), null, 'Value option'));
    const M = years.map(() => new Array(n).fill(0));  // M[cohort][year]
    const sf = new Array(n).fill(0);
    const totalSF = new Array(n).fill(0);
    const cohorts = [];
    const issues = [], warns = [];
    const yPath = (y, k) => `methodAssumptions.value.years[${v.years.indexOf(y)}].${k}`;
    for (let i = 0; i < n; i++) {
      const y = years[i];
      const F = y.forecast || 0;
      let other, carry = 0, rateFrac, carryPctEff, otherPctEff, sfPctEff;
      if (!modeC) {
        // Column i of the cohort matrix: every earlier cohort retained into year i (receivingYear: rate on year i;
        // sourceYear: rate on year i-1). Same products, in the same order, as fs-engine 1.7.0.
        const rateYear = sourceConv ? years[i - 1] : years[i];
        rateFrac = rateYear ? ((rateYear.carryoverPct || 0) / 100) : 0;
        carryPctEff = rateYear ? (rateYear.carryoverPct || 0) : 0;
        for (let s = 0; s < i; s++) M[s][i] = M[s][i - 1] * rateFrac;
        for (let s = 0; s < i; s++) carry += M[s][i];
      }
      if (mode === 'carryover+other') {
        other = F * ((y.otherChannelPct || 0) / 100);
        sf[i] = Math.max(0, F - other - carry);
        otherPctEff = y.otherChannelPct || 0;
        sfPctEff = F ? 100 * sf[i] / F : 0;
      } else if (mode === 'carryover+sf') {
        sf[i] = F * (y.sfPct / 100);
        other = F - sf[i] - carry;
        if (other < -amountTol(F)) issues.push({ code: 'derived-other-negative', path: yPath(y, 'sfPct'),
          message: `Carryover ${fmt(carry)} plus Salesforce-impactable ${fmt(sf[i])} exceed the ${y.year} forecast of ${fmt(F)}, so the derived other-channel share would be negative.` });
        other = Math.max(0, other);
        otherPctEff = F ? 100 * other / F : 0;
        sfPctEff = y.sfPct;
      } else {
        sf[i] = F * (y.sfPct / 100);
        other = F * ((y.otherChannelPct || 0) / 100);
        carry = F - other - sf[i];
        if (i === 0) {
          if (Math.abs(carry) > amountTol(F)) issues.push({ code: 'first-year-carryover', path: yPath(y, 'sfPct'),
            message: `${y.year} is the first forecast year, so it has no carryover: other channels and Salesforce-impactable must total 100% (they total ${fmt((y.otherChannelPct || 0) + y.sfPct)}%).` });
          carry = 0;
        } else if (carry < -amountTol(F)) {
          issues.push({ code: 'derived-carryover-negative', path: yPath(y, 'sfPct'),
            message: `Other channels and Salesforce-impactable exceed the ${y.year} forecast, so the derived carryover would be negative.` });
          carry = 0;
        } else carry = Math.max(0, carry);
        const prior = i > 0 ? totalSF[i - 1] : 0;
        if (i > 0 && prior <= 0 && carry > amountTol(F)) {
          issues.push({ code: 'derived-carryover-undefined', path: yPath(y, 'sfPct'),
            message: `${y.year} needs a carryover of ${fmt(carry)}, but no Salesforce-attributable sales exist in ${years[i - 1].year} to carry over.` });
          carry = 0;
        }
        rateFrac = prior > 0 ? carry / prior : 0;
        carryPctEff = 100 * rateFrac;
        if (carryPctEff > 100) warns.push({ code: 'carryover-above-100', path: yPath(y, 'carryoverPct'), message: `Derived carryover into ${y.year} is ${fmt(carryPctEff)}%, above 100%.` });
        for (let s = 0; s < i; s++) M[s][i] = M[s][i - 1] * rateFrac;
        otherPctEff = y.otherChannelPct || 0;
        sfPctEff = y.sfPct;
      }
      M[i][i] = sf[i];
      totalSF[i] = sf[i];
      for (let s = 0; s < i; s++) totalSF[i] += M[s][i];
      const derived = DERIVED_FOR_MODE[mode];
      // CS-1 check (additive; never feeds back into any number above or below).
      const sfEntered = isNum(y.sfPct) ? y.sfPct : null;
      const impliedSfPct = F ? 100 * sf[i] / F : null;
      const carryoverSharePct = F ? 100 * carry / F : null;
      const checkSumPct = F ? (sfEntered !== null ? sfEntered : impliedSfPct) + otherPctEff + carryoverSharePct : null;
      const floored = mode === 'carryover+other' && F - other - carry < -amountTol(F);
      if (mode === 'carryover+other' && F) {
        // 2026-10-12 SME review: only the first year must reconcile to 100%. From year 2 on, Salesforce impact keeps
        // carrying over (diminishing) from earlier cohorts, so an entered Salesforce-impactable % is not expected to add up.
        if (i === 0 && Math.abs(checkSumPct - 100) > CHECK_TOL_PTS + 1e-9 && !(floored && sfEntered === null))
          warns.push({ code: 'shares-not-100', path: yPath(y, 'sfPct'),
            message: `${y.year} adds to ${pct1(checkSumPct)}; carryover and other channels imply Salesforce-impactable of ${pct1(impliedSfPct)}.`,
            year: y.year, checkSumPct, impliedSfPct });
        if (floored)
          warns.push({ code: 'sf-floored', path: `methodAssumptions.value.years[${v.years.indexOf(y)}]`,
            message: `New Salesforce-impactable sales are set to 0 in ${y.year} because carried-in sales plus other channels exceed the forecast.`,
            year: y.year, checkSumPct, impliedSfPct, carryoverSharePct, otherChannelPct: otherPctEff });
      }
      if (explicitMode) {
        const f = derived === 'sf'
          ? `carryover and other channels entered; derived Salesforce-impactable = max(0, ${fmt(F)} - other ${fmt(other)} - carry-in ${fmt(carry)}) = ${fmt(sf[i])} (${fmt(sfPctEff)}%)`
          : derived === 'other'
            ? `carryover and Salesforce-impactable entered; derived other channels = ${fmt(F)} - Salesforce-impactable ${fmt(sf[i])} - carry-in ${fmt(carry)} = ${fmt(other)} (${fmt(otherPctEff)}%)`
            : `other channels and Salesforce-impactable entered; derived carry-in = ${fmt(F)} - other ${fmt(other)} - Salesforce-impactable ${fmt(sf[i])} = ${fmt(carry)}; rate ${i > 0 ? `${fmt(carry)} / prior Salesforce total ${fmt(totalSF[i - 1])}` : '(first year)'} = ${fmt(carryPctEff)}%`;
        trace.push(step(`Forecast split ${y.year}`, f, derived === 'sf' ? sf[i] : derived === 'other' ? other : carry, 'Calc Spec v0.2 CS-1'));
      }
      cohorts.push({ year: y.year, forecast: y.forecast, otherChannel: other, carryover: carry, newImpactable: sf[i],
                     sfImpactablePct: y.forecast ? sf[i] / y.forecast : 0,
                     otherChannelPct: otherPctEff, carryoverPct: carryPctEff, sfPct: sfPctEff, derived,
                     impliedSfPct, carryoverSharePct, sfPctEntered: sfEntered, checkSumPct, floored });
    }
    if (issues.length) return { annual: null, pool: null, calibrationFactor: calib, forecastMode: mode, perYear: [], cohorts, errors: issues.map(x => x.message), issues, warnings: warns, trace };
    const perYear = [];
    for (let k = 0; k < W; k++) {
      const i = years.findIndex(y => y.year === start + k);
      if (i < 0 || i + tail >= n) { errors.push(`forecast years must cover ${start}..${start + W - 1 + tail}`); break; }
      let npv = sf[i];
      const parts = [fmt(sf[i])];
      for (let t = 1; t <= tail; t++) { npv += M[i][i + t] / Math.pow(1 + d, t); parts.push(`${fmt(M[i][i + t])}/(1+${fmt(d)})^${t}`); }
      cohorts[i].npv = npv;
      perYear.push(npv);
      trace.push(step(`Cohort ${start + k} impactable value incl. ${tail}-year carryover`, `${parts.join(' + ')} = ${fmt(npv)}`, npv, 'Spec §2 value chain'));
    }
    if (errors.length) return { annual: null, pool: null, calibrationFactor: calib, forecastMode: mode, perYear, cohorts, errors, issues: [], warnings: warns, trace };
    const ltdr = sum(perYear);
    const annual = ltdr * gm / W;
    const pool = annual * calib;
    trace.push(step('Annual impactable margin', `(${perYear.map(fmt).join(' + ')}) x ${fmt(gm)} / ${W} = ${fmt(annual)}`, annual, 'Spec §2 value chain'));
    trace.push(step('Value pool', poolFormula(annual, calib, pool), pool, 'Spec §3.3 calibration'));
    return { annual, pool, calibrationFactor: calib, forecastMode: mode, perYear, cohorts, errors, issues: [], warnings: warns, trace };
  }

  // ---------- rounding helpers ----------
  function planningAllocation(segmentRawFte, total) {
    const raw = (segmentRawFte || []).map(x => (isNum(x) && x > 0 ? x : 0));
    const n = raw.length;
    const out = raw.map(Math.floor);
    if (!n) return out;
    let rem = Math.round(total) - sum(out);
    const order = raw.map((x, i) => i).sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]) || raw[b] - raw[a] || a - b);
    let guard = 0;
    while (rem > 0 && guard < 10 * n + 10) { out[order[guard % n]] += 1; rem--; guard++; }
    const rev = order.slice().reverse();
    guard = 0;
    while (rem < 0 && guard < 10 * n + 10) { const i = rev[guard % n]; if (out[i] > 0) { out[i] -= 1; rem++; } guard++; }
    return out;
  }

  function roiEquivalent(basis, cutoff) {
    if (basis === 'net') return { gross: cutoff + 1, net: cutoff };
    return { gross: cutoff, net: cutoff - 1 };
  }

  // ---------- validation ----------
  function validate(inputs) {
    const g0 = inputs && typeof inputs === 'object' ? inputs.grain : undefined;
    const E = IssueList(g0), W = IssueList(g0);
    if (!inputs || typeof inputs !== 'object') { E.add('inputs-missing', '', 'Scenario inputs are missing.'); return { errors: E.list, warnings: W.list }; }
    const method = inputs.method;
    if (!METHODS.includes(method)) E.add('method-invalid', 'method', `Method must be ${FL && FL.METHODS ? Object.values(FL.METHODS).map(m => `"${m.label}"`).join(', ') : 'one of the three sizing methods'}.`);
    if (inputs.grain !== undefined && !GRAINS.includes(inputs.grain)) E.add('grain-invalid', 'grain', `Grain must be ${FL && FL.GRAIN ? Object.values(FL.GRAIN).map(x => x.one).join(', ') : 'HCP, account or site'}.`);
    const segs = inputs.segments;
    if (!Array.isArray(segs) || segs.length === 0) { E.add('segments-missing', 'segments', 'At least one segment row is required.'); return { errors: E.list, warnings: W.list }; }
    const sh = inputs.shared || {};
    const ma = inputs.methodAssumptions || {};
    const seen = new Set();
    const fractional = [];
    segs.forEach((s, i) => {
      const p = `segments[${i}]`;
      if (!s || typeof s !== 'object') { E.add('segment-invalid', p, 'Segment row is not an object.'); return; }
      const label = String(s.segment);
      if (s.segment === undefined || s.segment === null || label === '') E.add('segment-label-missing', `${p}.segment`, 'Segment label is required.');
      if (seen.has(label)) E.add('segment-duplicate', `${p}.segment`, `Segment "${label}" appears more than once.`);
      seen.add(label);
      // CS-3 display keys: optional, string or null. Identity stays `segment`.
      ['specialty', 'decile'].forEach(k => {
        if (s[k] !== undefined && s[k] !== null && typeof s[k] !== 'string') E.add(`${k}-invalid`, `${p}.${k}`, `${EXTRA_LABELS[k]} must be text or empty.`);
      });
      const entityPath = method === 'response' && Array.isArray(inputs.entities) && inputs.entities.length > 0;
      if (!entityPath && (!isNum(s.entities) || s.entities < 0)) E.add('entities-invalid', `${p}.entities`, 'Entity count must be a number of zero or more.');
      if (!isNum(s.reachPct) || s.reachPct < 0 || s.reachPct > 100) E.add('reach-out-of-range', `${p}.reachPct`, 'Reach % must be between 0 and 100.');
      else if (s.reachPct > 0 && s.reachPct <= 1) fractional.push(label);
      if (method === 'affordable' || method === 'response') {
        if (!isInt(s.maxCalls) || s.maxCalls < 0) E.add('max-calls-invalid', `${p}.maxCalls`, 'Maximum calls must be a whole number of zero or more.');
        if (!isInt(s.minCalls) || s.minCalls < 0) E.add('min-calls-invalid', `${p}.minCalls`, 'Minimum calls must be a whole number of zero or more.');
        if (isInt(s.maxCalls) && isInt(s.minCalls) && s.minCalls > s.maxCalls) E.add('min-exceeds-max', `${p}.minCalls`, 'Minimum calls cannot exceed maximum calls.');
      }
      if (method === 'workload') {
        if (!isNum(s.plannedCalls)) E.add('planned-calls-missing', `${p}.plannedCalls`, 'Planned annual calls are required.');
        else if (!isInt(s.plannedCalls) || s.plannedCalls < 0) E.add('planned-calls-not-whole', `${p}.plannedCalls`, 'Planned annual calls must be a whole number of zero or more.');
      }
    });
    if (fractional.length) W.add('reach-looks-fractional', 'segments[].reachPct',
      `Reach is entered as a percent (85 means 85%). Segment(s) ${fractional.join(', ')} have reach between 0 and 1, which may be a fraction entered by mistake.`);

    const ci = sh.capacityInput;
    if (ci !== undefined && ci !== null && (typeof ci !== 'object' || !CAPACITY_MODES.includes(ci.mode === undefined ? 'direct' : ci.mode)))
      E.add('capacity-mode-invalid', 'shared.capacityInput.mode', `Capacity input must be ${optChoices('capacityInput')}.`);
    if (ci && ci.mode === 'derived') {
      if (!isNum(ci.callsPerDay) || ci.callsPerDay <= 0 || !isNum(ci.workingDays) || ci.workingDays <= 0)
        E.add('capacity-derived-invalid', 'shared.capacityInput', 'Derived capacity needs calls per day and working days above zero.');
      else if (isNum(sh.capacity) && Math.abs(sh.capacity - ci.callsPerDay * ci.workingDays) > 1e-9)
        W.add('capacity-overridden', 'shared.capacity', `Derived capacity ${fmt(ci.callsPerDay * ci.workingDays)} is used; the entered ${fmt(sh.capacity)} is ignored.`);
    } else if (!isNum(sh.capacity) || sh.capacity <= 0) E.add('capacity-invalid', 'shared.capacity', 'Effective annual capacity must be greater than zero.');
    if (sh.fteRounding !== undefined && !FTE_ROUNDING.includes(sh.fteRounding)) E.add('fte-rounding-invalid', 'shared.fteRounding', `FTE rounding must be ${optChoices('fteRounding')}.`);
    const needsCost = method === 'affordable' || method === 'response';
    const hasCost = sh.repCost !== undefined && sh.repCost !== null;
    if (needsCost || hasCost) {
      if (!COST_MODES.includes(sh.costMode)) E.add('cost-mode-invalid', 'shared.costMode', `Cost mode must be ${optChoices('costMode')}.`);
      if (sh.costPerCallMethod !== undefined && !COST_METHODS.includes(sh.costPerCallMethod)) E.add('cost-method-invalid', 'shared.costPerCallMethod', `Cost per call method must be ${optChoices('costPerCallMethod')}.`);
      if (!isNum(sh.repCost) || sh.repCost <= 0) E.add('rep-cost-invalid', 'shared.repCost', 'Annual rep cost must be greater than zero.');
      if (!isNum(sh.inflationPct)) E.add('inflation-invalid', 'shared.inflationPct', 'Cost inflation % is required.');
      if (!isNum(sh.discountRatePct) || sh.discountRatePct <= -100) E.add('discount-invalid', 'shared.discountRatePct', 'Discount rate % is required.');
      if (sh.costMode === 'layers') {
        const L = sh.layers;
        if (!L || !isNum(L.flmSpan) || L.flmSpan <= 0 || !isNum(L.slmSpan) || L.slmSpan <= 0 || !isNum(L.flmCost) || L.flmCost < 0 || !isNum(L.slmCost) || L.slmCost < 0)
          E.add('cost-layers-invalid', 'shared.layers', 'Management layers need first and second line spans above zero and costs of zero or more.');
      } else if (sh.layers) {
        W.add('layers-ignored', 'shared.layers', 'Fully loaded cost mode: management layers are not added, so they are ignored.');
      }
    }
    if (sh.horizon && (!isInt(sh.horizon.windowYears) || sh.horizon.windowYears <= 0)) E.add('horizon-invalid', 'shared.horizon.windowYears', 'Sizing window must be a whole number of years.');

    if (method === 'affordable' || method === 'response') {
      const opts = method === 'response' ? responseOptions(ma) : { allocation: ma.allocation === undefined ? 'proportional' : ma.allocation };
      const val = ma.value || {};
      if (isNum(val.annualValue)) { if (val.annualValue < 0) E.add('value-invalid', 'methodAssumptions.value.annualValue', 'Annual impactable value cannot be negative.'); }
      else if (!Array.isArray(val.years) || !val.years.length) E.add('value-missing', 'methodAssumptions.value', 'Enter an annual impactable value or the forecast years.');
      else {
        // CS-1 revised: only the two inputs the forecast mode enters are validated; the derived one is ignored if present.
        const fmode = forecastModeOf(val);
        const modeOk = FORECAST_MODES.includes(fmode);
        const usesCarry = fmode !== 'other+sf', usesOther = fmode !== 'carryover+sf', usesSf = modeOk && fmode !== 'carryover+other';
        val.years.forEach((y, i) => {
          const p = `methodAssumptions.value.years[${i}]`;
          if (!y || !isInt(y.year) || !isNum(y.forecast) || y.forecast < 0) E.add('value-year-invalid', p, 'Each forecast year needs a year and a forecast of zero or more.');
          else {
            if (usesCarry) {
              if (y.carryoverPct !== undefined && y.carryoverPct !== null && (!isNum(y.carryoverPct) || y.carryoverPct < 0)) E.add('carryover-invalid', `${p}.carryoverPct`, 'Carryover % must be zero or more.');
              else if (isNum(y.carryoverPct) && y.carryoverPct > 100) W.add('carryover-above-100', `${p}.carryoverPct`, `Carryover into ${y.year} is ${fmt(y.carryoverPct)}%, above 100%.`);
            }
            if (usesOther && y.otherChannelPct !== undefined && y.otherChannelPct !== null && (!isNum(y.otherChannelPct) || y.otherChannelPct < 0 || y.otherChannelPct > 100)) E.add('other-channel-invalid', `${p}.otherChannelPct`, 'Other channel % must be between 0 and 100.');
            if (usesSf && (!isNum(y.sfPct) || y.sfPct < 0 || y.sfPct > 100))
              E.add('sf-pct-invalid', `${p}.sfPct`, `${EXTRA_LABELS.sfPct} for ${y.year} is required in this forecast mode and must be between 0 and 100.`);
            else if (modeOk && !usesSf && y.sfPct !== undefined && y.sfPct !== null && (!isNum(y.sfPct) || y.sfPct < 0 || y.sfPct > 100))
              E.add('sf-pct-invalid', `${p}.sfPct`, `${EXTRA_LABELS.sfPct} for ${y.year} is a check value: enter a number between 0 and 100, or leave it blank.`);
          }
        });
        if (!isInt(val.sizingStartYear)) E.add('sizing-start-year-missing', 'methodAssumptions.value.sizingStartYear', 'Enter the first year of the sizing window; it is not assumed.');
        if (!E.has() && modeOk) {
          const iv = impactableValue(val, sh);
          if (iv.issues.length) iv.issues.forEach(x => E.add(x.code, x.path, x.message));
          else if (iv.errors.length) E.add('value-years-insufficient', 'methodAssumptions.value.years', iv.errors.join('; '));
          iv.warnings.forEach(({ code, path, message, ...extra }) => W.add(code, path, message, extra));
        }
      }
      if (val.forecastMode !== undefined && val.forecastMode !== null && !FORECAST_MODES.includes(val.forecastMode))
        E.add('forecast-mode-invalid', 'methodAssumptions.value.forecastMode', `Forecast inputs must be ${optChoices('forecastMode') || FORECAST_MODES.join(', ')}.`);
      else if (val.forecastMode === 'other+sf' && val.carryoverConvention === 'sourceYear' && !isNum(val.annualValue))
        W.add('carryover-convention-ignored', 'methodAssumptions.value.carryoverConvention', 'The carryover rate is derived on the receiving year in this forecast mode; the source-year convention is ignored.');
      // v0.4 multiplier withdrawn (CS-1 revised): ignored, with a warning.
      const withdrawn = Array.isArray(val.years) ? val.years.filter(y => y && y.impactablePct !== undefined && y.impactablePct !== null) : [];
      if (withdrawn.length) W.add('impactable-withdrawn', 'methodAssumptions.value.years[].impactablePct',
        `The v0.4 ${EXTRA_LABELS.impactablePct} multiplier is withdrawn and ignored (${withdrawn.map(y => y.year).join(', ')}). Enter carryover and other channels for each year; ${EXTRA_LABELS.sfPct} is an optional check value.`);
      if (val.carryoverConvention !== undefined && !CARRY_CONVENTIONS.includes(val.carryoverConvention)) E.add('carryover-convention-invalid', 'methodAssumptions.value.carryoverConvention', `Carryover convention must be ${optChoices('carryoverConvention')}.`);
      if (val.calibrationFactor !== undefined && (!isNum(val.calibrationFactor) || val.calibrationFactor <= 0)) E.add('calibration-invalid', 'methodAssumptions.value.calibrationFactor', 'Calibration factor must be greater than zero (default 1.0).');
      if (val.grossMarginPct !== undefined && (!isNum(val.grossMarginPct) || val.grossMarginPct < 0 || val.grossMarginPct > 100)) E.add('gross-margin-invalid', 'methodAssumptions.value.grossMarginPct', 'Gross margin % must be between 0 and 100.');
      if (!ALLOCATIONS.includes(opts.allocation)) E.add('allocation-invalid', 'methodAssumptions.allocation', `Allocation must be ${optChoices('allocation')}; equal and user-entered allocation were retired on 2026-10-12.`);
      const entityPath = method === 'response' && Array.isArray(inputs.entities) && inputs.entities.length > 0;
      if (opts.allocation === 'proportional' && !entityPath) {
        let tot = 0;
        segs.forEach((s, i) => {
          if (!isNum(s.compositeValue) || s.compositeValue < 0) E.add('composite-value-invalid', `segments[${i}].compositeValue`, 'Composite value must be a number of zero or more for proportional allocation.');
          else tot += s.compositeValue;
        });
        if (tot <= 0 && !E.list.some(e => e.code === 'composite-value-invalid')) E.add('composite-value-zero', 'segments[].compositeValue', 'Composite values total zero, so proportional allocation is undefined.');
      }
    }
    if ((method === 'affordable' || method === 'response') && ma.minimumBoundary !== undefined && !MIN_BOUNDARIES.includes(ma.minimumBoundary))
      E.add('minimum-boundary-invalid', 'methodAssumptions.minimumBoundary', `Minimum boundary must be ${optChoices('minimumBoundary')}.`);
    if (method === 'response') {
      if (ma.cutoffTie !== undefined && !CUTOFF_TIES.includes(ma.cutoffTie)) E.add('cutoff-tie-invalid', 'methodAssumptions.cutoffTie', `Cutoff tie handling must be ${optChoices('cutoffTie')}.`);
      if (ma.maxCallsSource !== undefined && !MAX_SOURCES.includes(ma.maxCallsSource)) E.add('max-calls-source-invalid', 'methodAssumptions.maxCallsSource', `Maximum calls source must be ${optChoices('maxCallsSource')}.`);
      if (ma.maxCallsSource === 'entityAttribute' && Array.isArray(inputs.entities)) inputs.entities.forEach((e, i) => {
        const m = e && e.attrs ? e.attrs.maxCalls : undefined;
        if (m !== undefined && m !== null && (!isInt(m) || m < 0)) E.add('entity-max-calls-invalid', `entities[${i}].attrs.maxCalls`, `Entity ${e.id} maximum calls must be a whole number of zero or more.`);
      });
      if (ma.reachAppliesTo !== undefined && !REACH_APPLIES.includes(ma.reachAppliesTo)) E.add('reach-applies-invalid', 'methodAssumptions.reachAppliesTo', `Reach handling must be ${optChoices('reachAppliesTo')}.`);
    }
    // CS-2 option: boolean; Affordable and Response only.
    if (ma.reallocateExcluded !== undefined && ma.reallocateExcluded !== null && typeof ma.reallocateExcluded !== 'boolean')
      E.add('reallocation-invalid', 'methodAssumptions.reallocateExcluded', `${EXTRA_LABELS.reallocateExcluded} must be ${optChoices('reallocateExcluded') || 'On or Off'}.`);
    else if (method === 'workload' && ma.reallocateExcluded === true)
      W.add('reallocation-not-applicable', 'methodAssumptions.reallocateExcluded', `${EXTRA_LABELS.reallocateExcluded} applies to ${FL && FL.METHODS ? `${FL.METHODS.affordable.label} and ${FL.METHODS.response.label}` : 'value-based methods'} only; it is ignored for ${FL && FL.METHODS ? FL.METHODS.workload.label : 'this method'}.`);
    if (method === 'affordable') {
      if (!isNum(ma.totalRoiCutoff) || ma.totalRoiCutoff <= 0) E.add('roi-cutoff-invalid', 'methodAssumptions.totalRoiCutoff', 'ROI cutoff must be greater than zero.');
    }
    if (method === 'response') {
      const o = responseOptions(ma);
      if (!BASES.includes(o.roiBasis)) E.add('roi-basis-invalid', 'methodAssumptions.roiBasis', `ROI basis must be ${optChoices('roiBasis')}.`);
      if (!isNum(o.cutoff) || (o.roiBasis === 'gross' && o.cutoff <= 0) || (o.roiBasis === 'net' && o.cutoff <= -1))
        E.add('cutoff-invalid', 'methodAssumptions.cutoff', 'Cutoff must be above 0 (gross ratio) or above -1 (net ROI).');
      if (!RULES.includes(o.stoppingRule)) E.add('stopping-rule-invalid', 'methodAssumptions.stoppingRule', `Stopping rule must be ${optChoices('stoppingRule')}.`);
      if (!isInt(o.scenarioMaxCalls) || o.scenarioMaxCalls <= 0) E.add('scenario-max-invalid', 'methodAssumptions.scenarioMaxCalls', 'Normalization point must be a whole number of calls above zero.');
      const prov = provenanceOf(ma);
      if (ma.curveParams !== undefined && ma.curveParams !== null && !Array.isArray(ma.curveParams)) {   // I-3 A2: an array is {} (1.11.0 rule)
        if (typeof ma.curveParams !== 'object') E.add('curve-params-invalid', 'methodAssumptions.curveParams', 'Response curve parameters must be given per curve archetype.');
        else Object.keys(ma.curveParams).forEach(n => {
          const u = ma.curveParams[n] && typeof ma.curveParams[n] === 'object' ? ma.curveParams[n] : {};
          const pv = prov[n] && typeof prov[n] === 'object' ? prov[n] : null;
          if (pv || !ARCHETYPES[n]) {
            // 1.11.0 / I-3 A1: entries with provenance (any name) and non-reference archetypes carry their own curve.
            // gamma and rho are required, delta optional (5); every given value must be a number above 0, no upper bound.
            // Codes: custom provenance or no provenance -> custom-curve-invalid; preset provenance -> the per-parameter codes.
            const preset = pv && pv.source === 'preset';
            const codeFor = k => (!preset ? 'custom-curve-invalid' : k === 'gamma' ? 'curve-gamma-invalid' : k === 'rho' ? 'curve-rho-invalid' : 'curve-params-invalid');
            ['delta', 'gamma', 'rho'].forEach(k => {
              const x = u[k];
              if (k === 'delta' && (x === undefined || x === null)) return;
              if (!isNum(x) || x <= 0) E.add(codeFor(k), `methodAssumptions.curveParams.${n}.${k}`, `${n}: ${EXTRA_LABELS[k]} must be a number above 0.`);
            });
            return;
          }
          if (u.gamma !== undefined && u.gamma !== null && (!isNum(u.gamma) || u.gamma <= 0 || u.gamma > 10)) E.add('curve-gamma-invalid', `methodAssumptions.curveParams.${n}.gamma`, `${n}: shape (gamma) must be above 0 and at most 10.`);
          if (u.rho !== undefined && u.rho !== null && (!isNum(u.rho) || u.rho <= 0 || u.rho > 10000)) E.add('curve-rho-invalid', `methodAssumptions.curveParams.${n}.rho`, `${n}: saturation (rho) must be above 0 and at most 10,000.`);
        });
      }
      if (ma.curveProvenance !== undefined && ma.curveProvenance !== null) {
        if (typeof ma.curveProvenance !== 'object' || Array.isArray(ma.curveProvenance)) E.add('curve-params-invalid', 'methodAssumptions.curveProvenance', 'Response curve sources must be given per curve archetype.');
        else Object.keys(ma.curveProvenance).forEach(n => {
          const pv = ma.curveProvenance[n];
          if (!pv || typeof pv !== 'object' || (pv.source !== 'preset' && pv.source !== 'custom'))
            E.add('curve-params-invalid', `methodAssumptions.curveProvenance.${n}`, `${n}: the curve source must be a preset or a custom curve.`);
          // P7 (P1-m3): a source with no curveParams entry would label reference defaults (or nothing) with a preset or
          // Custom; resolveCurves never produces it, so it is refused rather than computed.
          else if (!Object.prototype.hasOwnProperty.call(curveParamsOf(ma), n))
            E.add('curve-params-invalid', `methodAssumptions.curveProvenance.${n}`, provenanceWithoutCurve(n));
        });
      }
      const note = ma.customSourceNote;
      const noteBlank = typeof note !== 'string' || note.trim() === '';
      if (Object.keys(prov).some(n => prov[n] && prov[n].source === 'custom') && noteBlank)
        E.add('custom-source-missing', 'methodAssumptions.customSourceNote', 'A custom response curve needs a source note (for example, the marketing mix study it comes from).');
      else if (note !== undefined && note !== null && typeof note !== 'string')
        E.add('custom-source-missing', 'methodAssumptions.customSourceNote', `${EXTRA_LABELS.customSourceNote} must be text.`);
      // Data archetypes resolve against archetypesFor(ma): the reference set plus every curveParams key (I-3).
      const AR = archetypesFor(ma);
      const known = a => Object.prototype.hasOwnProperty.call(AR, a);
      const hasAll = known(ALL_ID);
      const archList = () => Object.keys(AR).join(', ');
      const ents = inputs.entities;
      if (Array.isArray(ents) && ents.length > 0) {
        const ids = new Set();
        let missingVal = 0;
        ents.forEach((e, i) => {
          const p = `entities[${i}]`;
          if (!e || typeof e !== 'object') { E.add('entity-invalid', p, 'Entity row is not an object.'); return; }
          if (ids.has(String(e.id))) E.add('entity-duplicate', `${p}.id`, `Entity ID ${e.id} appears more than once.`);
          ids.add(String(e.id));
          if (!seen.has(String(e.segment))) E.add('entity-segment-unknown', `${p}.segment`, `Entity ${e.id} belongs to segment "${e.segment}", which has no segment row.`);
          if (blankArch(e.archetype)) { if (!hasAll) E.add('response-needs-entity-or-mix', `${p}.archetype`, `Entity ${e.id} has no curve archetype, and no "${ALL_ID}" curve is given for value-only rows.`); }
          else if (!known(e.archetype)) E.add('unknown-archetype', `${p}.archetype`, `Entity ${e.id} has curve archetype "${e.archetype}"; expected one of ${archList()}.`);
          if (e.value === null || e.value === undefined) missingVal++;
          else if (!isNum(e.value) || e.value < 0) E.add('entity-value-invalid', `${p}.value`, `Entity ${e.id} value must be a number of zero or more.`);
        });
        if (missingVal) W.add('entity-value-missing', 'entities[].value', `${missingVal} entities have no value and are treated as zero value.`);
      } else {
        let allMix = true;
        segs.forEach((s, i) => {
          if (s && s.archetypeMix && s.archetype !== undefined && s.archetype !== null && s.archetype !== '')
            W.add('archetype-and-mix', `segments[${i}]`, `Segment ${s.segment} has both a single archetype and an archetype mix; the mix is used.`);
          if (s && !s.archetypeMix && s.archetype !== undefined && s.archetype !== null && s.archetype !== '' && !known(s.archetype)) {
            E.add('unknown-archetype', `segments[${i}].archetype`, `Unknown curve archetype "${s.archetype}"; expected one of ${archList()}.`); return;
          }
          const mix = mixFor(s, hasAll);
          if (!mix) { allMix = false; return; }
          let tot = 0;
          Object.keys(mix).forEach(k => {
            if (!known(k)) E.add('unknown-archetype', `segments[${i}].archetypeMix.${k}`, `Unknown curve archetype "${k}"; expected one of ${archList()}.`);
            else if (!isNum(mix[k]) || mix[k] < 0) E.add('archetype-mix-invalid', `segments[${i}].archetypeMix.${k}`, 'Archetype mix % must be zero or more.');
            else tot += mix[k];
          });
          if (Math.abs(tot - 100) > SHARE_TOL) E.add('archetype-mix-total', `segments[${i}].archetypeMix`, `Archetype mix must total 100%; it totals ${fmt(tot)}%.`);
        });
        if (!allMix) E.add('response-needs-entity-or-mix', 'entities', 'Response curve sizing needs one row per entity (with archetype and value), or an archetype or archetype mix on every segment.');
        else if (segs.some(sg => { const m = effectiveMix(sg); return m && Object.keys(m).filter(k => isNum(m[k]) && m[k] > 0).length > 1; }))
          W.add('archetype-mix-approximation', 'segments[].archetypeMix',
            'Summary input: segments with an archetype mix are split into one group per archetype, with value split by the mix and equal value per entity. This approximates sizing from one row per entity.');
      }
    }
    return { errors: E.list, warnings: W.list };
  }

  // Summary Response: archetypeMix wins; a single SegmentRow.archetype equals a 100% mix (v1.6).
  function effectiveMix(s) {
    if (s && s.archetypeMix) return s.archetypeMix;
    if (s && s.archetype !== undefined && s.archetype !== null && s.archetype !== '') { const m = {}; m[s.archetype] = 100; return m; }
    return null;
  }
  // 1.11.0 (D3): a segment with no archetype or mix uses the value-only 'ALL' curve when one is given.
  function mixFor(s, hasAll) {
    const m = effectiveMix(s);
    if (m || !hasAll) return m;
    const a = {}; a[ALL_ID] = 100; return a;
  }

  // ---------- allocation of the value pool to segments (Spec §2.4) ----------
  // Proportional to composite value only (2026-10-12 review); validate() rejects any other allocation.
  function segmentShares(segs, allocation, segValues) {
    const tot = sum(segValues);
    return segValues.map(v => (tot > 0 ? v / tot : 0));
  }

  // CS-2: the same allocation over a restricted eligible set E (a Set of segment indices):
  //   composite / sum of composite over E.
  function restrictedShares(segs, allocation, segValues, E) {
    const inE = i => E.has(i);
    const tot = sum(segValues.map((v, i) => (inE(i) ? v : 0)));
    return segValues.map((v, i) => (inE(i) && tot > 0 ? v / tot : 0));
  }
  const allocShares = (segs, allocation, segValues, restrict) => (restrict ? restrictedShares(segs, allocation, segValues, restrict) : segmentShares(segs, allocation, segValues));
  const restrictNote = (restrict, n) => (restrict ? `; over ${restrict.size} of ${n} segments (reallocation)` : '');

  function upstreamStep(segs, withValue) {
    const n = sum(segs.map(s => (isNum(s.entities) ? s.entities : 0)));
    const v = sum(segs.map(s => (isNum(s.compositeValue) ? s.compositeValue : 0)));
    return step('Segment data supplied', `${segs.length} segments; ${fmt(n)} entities${withValue ? `; composite value total ${fmt(v)}` : ''}`, n, 'Upstream input');
  }

  function emptyResult(inputs, v) {
    return {
      method: inputs && inputs.method, engineVersion: VERSION, inputsHash: fnv1a(stableStringify(inputs === undefined ? null : inputs)),
      errors: v.errors, warnings: v.warnings, segments: [],
      totals: { entities: 0, accessible: 0, reached: 0, totalCalls: 0, avgCallsPerReached: null, rawFte: 0, recommendedFte: 0, roundingDelta: 0,
                entitiesPerRep: null, costPerCall: null, fieldCost: null, contribution: null, roi: null, poolValue: null, coveredValue: null,
                minCalls: null, maxCalls: null, targetsPerRep: null },
      rollups: { bySpecialty: [], byDecile: [] },
      planningAllocation: [], drivers: [], trace: [], entityResults: null, curves: null
    };
  }

  // ---------- CS-8 roll-ups: deterministic aggregation of engine rows (no new calculation) ----------
  // minCalls / maxCalls: over the rows with accessible entities (entities x reach > 0), excluded rows counted as 0 calls;
  // null when no row qualifies. Calls per row = final calls per reached entity (Response: the segment's average).
  function callRange(rows) {
    const c = rows.filter(r => isNum(r.accessible) && r.accessible > 0).map(r => (r.excluded ? 0 : r.finalCallsPerEntity));
    return c.length ? { minCalls: Math.min(...c), maxCalls: Math.max(...c) } : { minCalls: null, maxCalls: null };
  }
  function rollupGroup(key, rows, cpc) {
    const reached = sum(rows.map(r => r.reached));
    const totalCalls = sum(rows.map(r => r.totalCalls));
    const vals = rows.map(r => r.allocatedValue).filter(isNum);
    const range = callRange(rows);
    return {
      key, entities: sum(rows.map(r => r.entities)), accessible: sum(rows.map(r => r.accessible)), reached, totalCalls,
      rawFte: sum(rows.map(r => r.rawFte)), fieldCost: isNum(cpc) ? totalCalls * cpc : null,
      allocatedValue: vals.length ? sum(vals) : null,
      avgCallsPerReached: reached > 0 ? totalCalls / reached : null,
      minCalls: range.minCalls, maxCalls: range.maxCalls
    };
  }
  function rollupBy(rows, keyOf, cpc) {
    const groups = new Map();
    rows.forEach(r => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    return Array.from(groups, ([k, rs]) => rollupGroup(k, rs, cpc));
  }
  const blankKey = k => k === undefined || k === null || k === '';
  function rollups(rows, cpc) {
    const anySpecialty = rows.some(r => !blankKey(r.specialty));
    return {
      bySpecialty: anySpecialty ? rollupBy(rows, r => (blankKey(r.specialty) ? null : r.specialty), cpc) : [],
      byDecile: rollupBy(rows, r => (blankKey(r.decile) ? r.segment : r.decile), cpc)
    };
  }

  function finishTotals(segRows, capacity, cpc, trace, fteRounding) {
    const rawFte = sum(segRows.map(r => r.rawFte));
    const mode = fteRounding === undefined ? 'nearest' : fteRounding;
    // Always applied to the unrounded SUM, never to rows (decision 1; v1.3 option).
    const recommendedFte = mode === 'up' ? Math.ceil(rawFte - 1e-9) : mode === 'none' ? rawFte : Math.round(rawFte);
    const reached = sum(segRows.map(r => r.reached));
    const totalCalls = sum(segRows.map(r => r.totalCalls));
    trace.push(step('Raw FTE', `sum of segment raw FTE (unrounded) = ${fmt(rawFte)}`, rawFte, 'Spec §3.2 / §5'));
    trace.push(step('Recommended FTE', `${mode === 'up' ? 'roundup' : mode === 'none' ? 'no rounding' : 'round'}(${fmt(rawFte)}) = ${fmt(recommendedFte)}`, recommendedFte, `FTE rounding option: ${mode}`));
    return {
      entities: sum(segRows.map(r => r.entities)),
      accessible: sum(segRows.map(r => r.accessible)),
      reached, totalCalls,
      avgCallsPerReached: reached > 0 ? totalCalls / reached : null,
      rawFte, recommendedFte, roundingDelta: recommendedFte - rawFte,
      entitiesPerRep: recommendedFte > 0 ? reached / recommendedFte : null,
      costPerCall: cpc, fieldCost: cpc === null ? null : totalCalls * cpc
    };
  }

  // ---------- Affordable Coverage (Spec §3) ----------
  function calcAffordable(inputs, trace, warnings, restrict) {
    const sh = inputs.shared, ma = inputs.methodAssumptions;
    const allocation = ma.allocation === undefined ? 'proportional' : ma.allocation;
    const cost = costPerCall(sh); trace.push(...cost.trace);
    const iv = impactableValue(ma.value, sh); trace.push(...iv.trace);
    const cpc = cost.effective, cutoff = ma.totalRoiCutoff, cap = sh.capacity;
    const strictMin = ma.minimumBoundary === 'strict';
    const segs = inputs.segments;
    trace.push(upstreamStep(segs, true));
    const shares = allocShares(segs, allocation, segs.map(s => (isNum(s.compositeValue) ? s.compositeValue : 0)), restrict);
    trace.push(step('Allocation', `${optLabel('allocation', allocation)}: segment value = pool ${fmt(iv.pool)} x share${restrictNote(restrict, segs.length)}`, null, 'Spec §2.4'));
    let forfeited = 0;
    const rows = segs.map((s, i) => {
      const reach = s.reachPct / 100;
      const accessible = s.entities * reach;
      const allocatedValue = iv.pool * shares[i];
      const affordableCalls = allocatedValue / (cpc * cutoff);
      const perEntity = accessible > 0 ? affordableCalls / accessible : 0;
      const capped = Math.min(perEntity, s.maxCalls);
      const meetsMin = strictMin ? capped > s.minCalls : capped >= s.minCalls;   // inclusive default = PE-04
      const constrained = meetsMin ? capped : 0;
      const finalCalls = accessible > 0 ? Math.floor(constrained) : 0;
      const reached = finalCalls > 0 ? accessible : 0;
      const totalCalls = reached * finalCalls;
      const rawFte = totalCalls / cap;
      const excluded = finalCalls === 0;
      let exclusionReason = null, binding;
      if (excluded) {
        exclusionReason = accessible <= 0 ? 'no-reach' : (allocatedValue <= 0 ? 'no-value' : 'below-minimum');
        binding = bindingForReason(exclusionReason);
        forfeited += allocatedValue;
      } else binding = perEntity >= s.maxCalls ? 'max' : 'affordability';
      const lbl = s.segment;
      trace.push(step(`Segment ${lbl}`,
        `accessible ${fmt(s.entities)} x ${pct(s.reachPct)} = ${fmt(accessible)}; affordable calls ${fmt(allocatedValue)} / (${fmt(cpc)} x ${fmt(cutoff)}) = ${fmt(affordableCalls)}; ` +
        `per entity ${fmt(perEntity)}; capped at ${s.maxCalls} -> ${fmt(capped)}; minimum ${s.minCalls} (${strictMin ? 'strict' : 'inclusive'}) ${meetsMin ? 'met' : 'not met'}; ` +
        `final ${finalCalls}; calls ${fmt(reached)} x ${finalCalls} = ${fmt(totalCalls)}; raw FTE ${fmt(totalCalls)} / ${fmt(cap)} = ${fmt(rawFte)}`,
        rawFte, 'Spec §3.2'));
      return {
        segment: lbl, entities: s.entities, accessible, reached, allocatedValue, affordableCalls, affordableCallsPerEntity: perEntity,
        finalCallsPerEntity: finalCalls, totalCalls, rawFte,
        contribution: excluded ? 0 : allocatedValue,
        roi: totalCalls > 0 ? allocatedValue / (totalCalls * cpc) : null,
        excluded, exclusionReason, binding
      };
    });
    if (forfeited > 0) warnings.push({ code: 'value-forfeited', path: 'segments', message: `Value of ${fmt(forfeited)} allocated to segments below the minimum is forfeited, not redistributed.` });
    const totals = finishTotals(rows, cap, cpc, trace, sh.fteRounding);
    totals.contribution = sum(rows.map(r => r.contribution));
    totals.roi = totals.fieldCost > 0 ? totals.contribution / totals.fieldCost : null;
    totals.forfeitedValue = forfeited;
    totals.valuePool = iv.pool;
    trace.push(step('Total ROI', `retained value ${fmt(totals.contribution)} / (calls ${fmt(totals.totalCalls)} x ${fmt(cpc)}) = ${fmt(totals.roi)}`, totals.roi, 'Decision 3 (unweighted)'));
    const drivers = [
      { label: 'Effective annual capacity', value: cap, effect: 'Raw FTE = total calls / capacity' },
      { label: 'Effective cost per call', value: cpc, effect: `Higher cost buys fewer affordable calls (${optLabel('costPerCallMethod', cost.method)})` },
      { label: 'ROI cutoff', value: cutoff, effect: 'Affordable calls = allocated value / (cost per call x cutoff)' },
      { label: 'Value pool', value: iv.pool, effect: poolEffect(iv.calibrationFactor) },
      { label: 'Value forfeited below minimum', value: forfeited, effect: 'Not redistributed to other segments' }
    ];
    return { rows, totals, drivers };
  }

  // ---------- Profitability / Response Curve (Spec §4) ----------
  function responseCurve(a, x) { return x <= 0 ? 0 : Math.pow(a.delta * x, a.gamma) / (Math.pow(x, a.gamma) + a.rho); }

  // Returns { calls, selected, reason, binding } for one entity with allocated value K.
  function selectCalls(K, arch, denom, cpc, o, maxCalls, minCalls) {
    const contrib = n => K * responseCurve(arch, n) / denom;
    const thr = o.roiBasis === 'net' ? o.cutoff + 1 : o.cutoff;        // compare on the gross ratio
    const tol = TIE_TOL * Math.max(1, Math.abs(thr));
    const passRatio = o.cutoffTie === 'exclude' ? (r => r > thr + tol) : (r => r >= thr - tol);
    // strict minimum: calls must exceed the minimum, i.e. the whole-call threshold is min + 1 (min-block tests that block).
    const minRule = o.minimumBoundary === 'strict' && minCalls > 0 ? minCalls + 1 : minCalls;
    const marg = n => (contrib(n) - contrib(n - 1)) / cpc;
    let calls = 0, selected = 0, reason = null, binding = 'profitability';
    if (o.stoppingRule === 'first-fail') {
      let k = 0;
      while (k < maxCalls && passRatio(marg(k + 1))) k++;
      selected = k;                                                      // v1.7 option A: call 1 fails -> 0 calls (no forced call)
      if (k === 0) reason = 'no-profitable-call';
      if (selected >= maxCalls && k === maxCalls) binding = 'max';
      calls = selected > maxCalls ? maxCalls : (selected < minRule ? 0 : selected);
      if (calls === 0 && !reason) reason = 'below-minimum';
    } else if (o.stoppingRule === 'min-block') {
      let k = 0;
      if (minRule >= 1) {
        const blockRatio = (contrib(minRule) - contrib(0)) / (minRule * cpc);
        if (minRule <= maxCalls && passRatio(blockRatio)) k = minRule; else reason = 'below-minimum';
      }
      if (!reason) {
        while (k < maxCalls && passRatio(marg(k + 1))) k++;
        if (k === 0) reason = 'no-profitable-call';
        if (k === maxCalls && k > 0) binding = 'max';
      }
      selected = k; calls = k;
    } else { // max-pass
      let best = 0;
      for (let n = 1; n <= maxCalls; n++) if (passRatio(marg(n))) best = n;
      selected = best;
      if (best === 0) reason = 'no-profitable-call';
      else if (best === maxCalls) binding = 'max';
      calls = best < minRule ? 0 : best;
      if (calls === 0 && !reason) reason = 'below-minimum';
    }
    if (calls === 0) binding = bindingForReason(reason);
    return { calls, selected, reason, binding, contribution: contrib(calls) };
  }

  function calcResponse(inputs, trace, warnings, restrict) {
    const sh = inputs.shared, ma = inputs.methodAssumptions || {};
    const o = responseOptions(ma);
    const cost = costPerCall(sh); trace.push(...cost.trace);
    const iv = impactableValue(ma.value, sh); trace.push(...iv.trace);
    const cpc = cost.effective, cap = sh.capacity;
    const X = o.scenarioMaxCalls;
    const AR = archetypesFor(ma), edited = curveParamsEdited(ma);
    const segs = inputs.segments;
    const ents = Array.isArray(inputs.entities) && inputs.entities.length > 0 ? inputs.entities : null;
    const hasAll = Object.prototype.hasOwnProperty.call(AR, ALL_ID);
    const archOf = e => (blankArch(e.archetype) ? ALL_ID : e.archetype);     // value-only entity rows use the ALL curve (D3)
    // Archetypes used by the data, reference order first (float-exact 1.10.0 sums), then first-seen data order (I-3).
    const seenArch = [];
    const see = a => { if (!seenArch.includes(a)) seenArch.push(a); };
    if (ents) ents.forEach(e => see(archOf(e)));
    else segs.forEach(sg => { const m = mixFor(sg, hasAll) || {}; Object.keys(m).forEach(k => { if (isNum(m[k]) && m[k] > 0) see(k); }); });
    const used = ARCH_NAMES.filter(n => seenArch.includes(n)).concat(seenArch.filter(n => !ARCHETYPES[n]));
    const loopArch = ARCH_NAMES.concat(seenArch.filter(n => !ARCHETYPES[n]));   // summary path: every reference archetype, then the others
    const legacy = legacyCurves(ma), prov = provenanceOf(ma);
    const denoms = {};
    Object.keys(AR).forEach(n => { denoms[n] = responseCurve(AR[n], X); });
    trace.push(step('Response curve', 'Response(x) = (delta x x)^gamma / (x^gamma + rho); normalized = Response(x) / Response(' + X + ')', null, 'Spec §4.1'));
    if (legacy) trace.push(step('Curve parameters', edited.length ? `edited for ${edited.join(', ')}; ${ARCH_NAMES.map(n => `${n} gamma ${fmt(AR[n].gamma)}, rho ${fmt(AR[n].rho)}`).join('; ')}` : 'reference defaults (decision 9) for every archetype', edited.length, 'Response curve inputs (2026-10-12)'));
    else {
      const customLbl = (FL && FL.RESPONSE_CURVE_LABELS && typeof FL.RESPONSE_CURVE_LABELS.custom === 'string' && FL.RESPONSE_CURVE_LABELS.custom) || 'Custom';
      const srcText = n => { const pv = prov[n]; if (!pv) return ARCHETYPES[n] ? 'reference default' : 'entered'; return pv.source === 'custom' ? customLbl : `preset ${pv.label || pv.presetId}`; };
      const note = typeof ma.customSourceNote === 'string' && ma.customSourceNote.trim() ? `; custom source note: ${ma.customSourceNote.trim()}` : '';
      const allLbl = (FL && FL.RESPONSE_CURVE_LABELS && typeof FL.RESPONSE_CURVE_LABELS.all === 'string' && FL.RESPONSE_CURVE_LABELS.all) || 'All HCPs';
      trace.push(step('Curve parameters', used.map(n => `${n === ALL_ID ? allLbl : n}: ${srcText(n)}, delta ${fmt(AR[n].delta)}, gamma ${fmt(AR[n].gamma)}, rho ${fmt(AR[n].rho)}`).join('; ') + note,
        used.length, 'Response curve presets (fs-engine 1.11.0)'));
    }
    (legacy ? ARCH_NAMES : used).forEach(n => trace.push(step(`Normalization denominator, ${n}`,
      `(${AR[n].delta} x ${X})^${AR[n].gamma} / (${X}^${AR[n].gamma} + ${AR[n].rho}) = ${fmt(denoms[n])}`, denoms[n], 'Spec §4.2')));
    const curves = {};
    used.forEach(n => {
      const pv = prov[n] || null;
      curves[n] = { delta: AR[n].delta, gamma: AR[n].gamma, rho: AR[n].rho, source: pv ? pv.source : null,
        presetId: pv && pv.presetId !== undefined ? pv.presetId : null, label: pv && pv.label !== undefined ? pv.label : null };
    });
    const eq = roiEquivalent(o.roiBasis, o.cutoff);
    trace.push(step('Marginal ROI test', `${optLabel('roiBasis', o.roiBasis)}: ${o.roiBasis === 'gross' ? 'incremental contribution / incremental cost' : '(incremental contribution - incremental cost) / incremental cost'} ${o.cutoffTie === 'exclude' ? '>' : '>='} ${fmt(o.cutoff)} (gross ratio ${fmt(eq.gross)}, net ROI ${fmt(eq.net)})`, o.cutoff, 'Decision 4 / PE-03'));
    trace.push(step('Stopping rule', optLabel('stoppingRule', o.stoppingRule), null, 'Decision 5'));
    trace.push(step('Response options', `${optLabel('minimumBoundary', o.minimumBoundary)}; ${optLabel('cutoffTie', o.cutoffTie)}; ${optLabel('reachAppliesTo', o.reachAppliesTo)}`, null, 'Contract v1.3 options'));
    const segIndex = new Map(segs.map((s, i) => [String(s.segment), i]));
    const acc = segs.map(s => ({ entities: 0, accessible: 0, reached: 0, calls: 0, contribution: 0, alloc: 0, bind: {}, reasons: {} }));
    let entityResults = null;
    const tally = (a, key, w) => { a[key] = (a[key] || 0) + w; };
    if (ents) {
      const segVal = segs.map(() => 0), segCount = segs.map(() => 0);
      ents.forEach(e => { const i = segIndex.get(String(e.segment)); segVal[i] += isNum(e.value) ? e.value : 0; segCount[i] += 1; });
      const totalVal = sum(segVal);
      const totE = restrict ? sum(segVal.filter((x, i) => restrict.has(i))) : totalVal;
      trace.push(step('Entity data supplied', `${ents.length} entity rows with value and curve archetype across ${segs.length} segments; value total ${fmt(totalVal)}`, ents.length, 'Upstream input'));
      trace.push(step('Allocation', `${optLabel('allocation', o.allocation)}: entity value = pool ${fmt(iv.pool)} x entity value / total entity value${restrictNote(restrict, segs.length)}`, null, 'Spec §2.4'));
      entityResults = new Array(ents.length);
      let capOverrides = 0;
      for (let j = 0; j < ents.length; j++) {
        const e = ents[j];
        const i = segIndex.get(String(e.segment));
        const s = segs[i];
        const v = isNum(e.value) ? e.value : 0;
        let K;
        if (restrict && !restrict.has(i)) K = 0;                    // CS-2: segment dropped in an earlier pass
        else K = totE > 0 ? iv.pool * (v / totE) : 0;            // proportional to entity value (only allocation since 2026-10-12)
        const eCap = o.maxCallsSource === 'entityAttribute' && e.attrs && isInt(e.attrs.maxCalls) ? e.attrs.maxCalls : s.maxCalls;
        if (eCap !== s.maxCalls) capOverrides++;
        const ea = archOf(e);
        const r = selectCalls(K, AR[ea], denoms[ea], cpc, o, eCap, s.minCalls);
        const reach = s.reachPct / 100;
        const reachedWeight = r.calls > 0 ? reach : 0;
        const a = acc[i];
        a.entities += 1; a.accessible += reach; a.reached += reachedWeight; a.calls += r.calls * reach;
        a.contribution += o.reachAppliesTo === 'callsAndValue' ? r.contribution * reach : r.contribution; a.alloc += K;   // decision 6 default: reach not applied
        if (r.calls > 0) tally(a.bind, r.binding, 1); else tally(a.reasons, r.reason, 1);
        entityResults[j] = { id: e.id, segment: e.segment, archetype: e.archetype, calls: r.calls, reachedWeight };
      }
      trace.push(step('Maximum calls source', o.maxCallsSource === 'entityAttribute' ? `${optLabel('maxCallsSource', o.maxCallsSource)}, else the segment maximum (${capOverrides} entities use their own cap); normalization point stays ${X} calls` : optLabel('maxCallsSource', o.maxCallsSource), capOverrides, 'Response option'));
    } else {
      trace.push(upstreamStep(segs, true));
      trace.push(step('Curve archetypes supplied', segs.map(sg => `segment ${sg.segment}: ${Object.entries(mixFor(sg, hasAll) || {}).filter(([, m]) => m > 0).map(([a, m]) => `${a} ${fmt(m)}%`).join(', ')}`).join('; '), null, 'Upstream input'));
      const shares = allocShares(segs, o.allocation, segs.map(s => (isNum(s.compositeValue) ? s.compositeValue : 0)), restrict);
      trace.push(step('Allocation', `${optLabel('allocation', o.allocation)}: segment value = pool ${fmt(iv.pool)} x share; split into one group per archetype by mix${restrictNote(restrict, segs.length)}`, null, 'Decision 7 (approximation)'));
      segs.forEach((s, i) => {
        const segAlloc = iv.pool * shares[i];
        const reach = s.reachPct / 100;
        const a = acc[i];
        a.entities = s.entities; a.accessible = s.entities * reach; a.alloc = segAlloc;
        loopArch.forEach(name => {
          const mixE = mixFor(s, hasAll);
          const m = (mixE && isNum(mixE[name]) ? mixE[name] : 0) / 100;
          if (m <= 0 || s.entities <= 0) return;
          const n = s.entities * m;
          const K = segAlloc / s.entities;                          // value split by mix => equal value per entity
          const r = selectCalls(K, AR[name], denoms[name], cpc, o, s.maxCalls, s.minCalls);
          a.reached += r.calls > 0 ? n * reach : 0;
          a.calls += r.calls * n * reach;
          a.contribution += r.contribution * n * (o.reachAppliesTo === 'callsAndValue' ? reach : 1);
          if (r.calls > 0) tally(a.bind, r.binding, n); else tally(a.reasons, r.reason, n);
          trace.push(step(`Segment ${s.segment}, ${name}`, `${fmt(n)} entities, value per entity ${fmt(K)} -> ${r.calls} calls; reached ${fmt(n)} x ${pct(s.reachPct)}`, r.calls, 'Decision 7'));
        });
      });
    }
    const top = obj => { let best = null, bw = -1; Object.keys(obj).forEach(k => { if (obj[k] > bw) { bw = obj[k]; best = k; } }); return best; };
    const rows = segs.map((s, i) => {
      const a = acc[i];
      const rawFte = a.calls / cap;
      const excluded = a.reached === 0;
      const reason = excluded ? (a.accessible === 0 ? 'no-reach' : (top(a.reasons) || 'no-profitable-call')) : null;
      return {
        segment: s.segment, entities: a.entities, accessible: a.accessible, reached: a.reached, allocatedValue: a.alloc,
        affordableCalls: null, affordableCallsPerEntity: null,
        finalCallsPerEntity: a.reached > 0 ? a.calls / a.reached : 0,
        totalCalls: a.calls, rawFte, contribution: a.contribution,
        roi: a.calls > 0 ? (a.contribution / (a.calls * cpc)) - (o.roiBasis === 'net' ? 1 : 0) : null,
        excluded, exclusionReason: reason,
        binding: excluded ? bindingForReason(reason) : (top(a.bind) || 'profitability')
      };
    });
    const totals = finishTotals(rows, cap, cpc, trace, sh.fteRounding);
    totals.contribution = sum(rows.map(r => r.contribution));
    totals.roiGross = totals.fieldCost > 0 ? totals.contribution / totals.fieldCost : null;
    totals.roiBasis = o.roiBasis;
    totals.roi = totals.roiGross === null ? null : (o.roiBasis === 'net' ? totals.roiGross - 1 : totals.roiGross);
    totals.valuePool = iv.pool;
    trace.push(step('Total ROI', `contribution ${fmt(totals.contribution)} / (calls ${fmt(totals.totalCalls)} x ${fmt(cpc)})${o.roiBasis === 'net' ? ' - 1' : ''} = ${fmt(totals.roi)}`, totals.roi, 'Spec §4.4'));
    if (o.reachAppliesTo === 'calls') warnings.push({ code: 'reach-not-applied-to-contribution', path: 'segments[].reachPct',
      message: 'Reach reduces calls, cost and entity counts but not contribution, as in the reference model. ROI may be overstated where reach is below 100%.' });
    const drivers = [
      { label: 'Effective annual capacity', value: cap, effect: 'Raw FTE = total calls / capacity' },
      { label: 'Effective cost per call', value: cpc, effect: `Higher cost lowers every marginal ROI (${optLabel('costPerCallMethod', cost.method)})` },
      { label: `Marginal ROI cutoff (${optLabel('roiBasis', o.roiBasis)})`, value: o.cutoff, effect: 'Calls are added while each additional call clears the cutoff' },
      { label: 'Stopping rule', value: optLabel('stoppingRule', o.stoppingRule), effect: 'How the call count is chosen on the marginal ROI curve' },
      { label: 'Value pool', value: iv.pool, effect: poolEffect(iv.calibrationFactor) },
      { label: 'Normalization point (calls)', value: X, effect: 'Response curves are scaled so contribution at this call count equals allocated value' }
    ];
    return { rows, totals, drivers, entityResults, curves };
  }

  // ---------- Workload Buildup (Spec §5) ----------
  function calcWorkload(inputs, trace) {
    const sh = inputs.shared, cap = sh.capacity;
    let cpc = null;
    if (isNum(sh.repCost) && sh.repCost > 0) { const c = costPerCall(sh); cpc = c.effective; trace.push(...c.trace); }
    trace.push(upstreamStep(inputs.segments, false));
    const rows = inputs.segments.map(s => {
      const reach = s.reachPct / 100;
      const reached = s.entities * reach;
      const totalCalls = reached * s.plannedCalls;
      const rawFte = totalCalls / cap;
      const excluded = totalCalls === 0;
      trace.push(step(`Segment ${s.segment}`,
        `reached ${fmt(s.entities)} x ${pct(s.reachPct)} = ${fmt(reached)}; calls ${fmt(reached)} x ${s.plannedCalls} = ${fmt(totalCalls)}; raw FTE ${fmt(totalCalls)} / ${fmt(cap)} = ${fmt(rawFte)}`,
        rawFte, 'Spec §5'));
      return {
        segment: s.segment, entities: s.entities, accessible: reached, reached, allocatedValue: null, affordableCalls: null, affordableCallsPerEntity: null,
        finalCallsPerEntity: s.plannedCalls, totalCalls, rawFte, contribution: null, roi: null,
        excluded, exclusionReason: excluded ? (reached === 0 ? 'no-reach' : 'no-planned-calls') : null, binding: excluded ? 'none' : 'planned'
      };
    });
    const totals = finishTotals(rows, cap, cpc, trace, sh.fteRounding);
    totals.contribution = null; totals.roi = null;                   // decision 10: ROI N/A
    const drivers = [
      { label: 'Effective annual capacity', value: cap, effect: 'Raw FTE = total calls / capacity' },
      { label: 'Planned calls (weighted average per reached entity)', value: totals.avgCallsPerReached, effect: 'Calls scale linearly with the call plan' },
      { label: 'Average reach %', value: totals.entities > 0 ? 100 * totals.reached / totals.entities : null, effect: 'Reached entities = entities x reach' }
    ];
    if (cpc !== null) drivers.push({ label: 'Effective cost per call', value: cpc, effect: 'Annual field cost = total calls x cost per call; ROI not applicable' });
    return { rows, totals, drivers };
  }

  // ---------- CS-2: reallocation of value from excluded segments (Affordable and Response) ----------
  // Wrapper around the per-method calculation. Off: one run, exactly v1.7. On: re-run the method over a shrinking
  // eligible set until no segment in the set receives zero calls. E0 = segments with entities (or entity rows) and reach above 0.
  // passes = number of runs whose allocation set is narrower than all segments; excludedByPass[k] = segments dropped before
  // pass k + 1 (k = 0 holds the not-eligible segments when there are any); rows carry excludedInPass = k.
  const REALLOC_NOT_CONVERGED = 'reallocation-not-converged';
  function eligibleIndices(inputs) {
    const segs = inputs.segments;
    const ents = inputs.method === 'response' && Array.isArray(inputs.entities) && inputs.entities.length > 0 ? inputs.entities : null;
    let count = null;
    if (ents) {
      const idx = new Map(segs.map((s, i) => [String(s.segment), i]));
      count = segs.map(() => 0);
      ents.forEach(e => { count[idx.get(String(e.segment))] += 1; });
    }
    const out = [];
    segs.forEach((s, i) => {
      const n = count ? count[i] : s.entities;
      if (isNum(n) && n > 0 && isNum(s.reachPct) && s.reachPct > 0) out.push(i);
    });
    return out;
  }
  function coveredSum(rows) { return sum(rows.map(r => (r.excluded ? 0 : (isNum(r.allocatedValue) ? r.allocatedValue : 0)))); }

  function withReallocation(calcFn, inputs, trace, warnings) {
    const ma = inputs.methodAssumptions || {};
    const segs = inputs.segments;
    const n = segs.length;
    if (ma.reallocateExcluded !== true) {
      const out = calcFn(inputs, trace, warnings);
      out.rows.forEach(r => { r.excludedInPass = r.excluded ? 0 : null; });
      const pool = out.totals.valuePool;
      out.totals.poolValue = pool;
      out.totals.coveredValue = coveredSum(out.rows);
      if (out.totals.forfeitedValue === undefined) out.totals.forfeitedValue = sum(out.rows.map(r => (r.excluded && isNum(r.allocatedValue) ? r.allocatedValue : 0)));
      out.totals.reallocation = { on: false, passes: 0, reallocatedValue: 0, excludedByPass: [out.rows.filter(r => r.excluded).map(r => r.segment)] };
      return out;
    }
    // v1.7 allocation (the Off run) is the reference for the value moved.
    const offRun = calcFn(inputs, [], []);
    const groups = [];                       // [{ idx: [..], remaining }]
    const dropped = new Map();               // segment index -> { pass, reason }
    let E = eligibleIndices(inputs);
    if (E.length < n) {
      const inE = new Set(E);
      groups.push({ idx: segs.map((s, i) => i).filter(i => !inE.has(i)), remaining: E.length });
    }
    let out, tr, wr, runs = 0;
    for (;;) {
      if (++runs > n + 1) { const err = new Error('Reallocation did not converge within the pass limit.'); err.code = REALLOC_NOT_CONVERGED; throw err; }
      tr = []; wr = [];
      out = calcFn(inputs, tr, wr, E.length === n ? null : new Set(E));
      if (runs === 1 && groups.length) groups[0].idx.forEach(i => dropped.set(i, { pass: 0, reason: out.rows[i].exclusionReason }));
      const X = E.filter(i => out.rows[i].excluded);
      if (!X.length) break;
      X.forEach(i => dropped.set(i, { pass: groups.length, reason: out.rows[i].exclusionReason }));
      const xs = new Set(X);
      E = E.filter(i => !xs.has(i));
      groups.push({ idx: X, remaining: E.length });
    }
    const pool = out.totals.valuePool;
    out.rows.forEach((r, i) => {
      const d = dropped.get(i);
      if (d) { r.exclusionReason = d.reason; r.binding = bindingForReason(d.reason); r.excludedInPass = d.pass; }
      else r.excludedInPass = r.excluded ? 0 : null;
    });
    const covered = coveredSum(out.rows);
    const anyCovered = out.rows.some(r => !r.excluded);
    const offCovered = sum(out.rows.map((r, i) => (r.excluded ? 0 : (isNum(offRun.rows[i].allocatedValue) ? offRun.rows[i].allocatedValue : 0))));
    const reallocatedValue = anyCovered ? Math.max(0, covered - offCovered) : 0;
    const labels = g => g.idx.map(i => segs[i].segment);
    const passSteps = groups.map((g, k) => step(`Reallocation pass ${k + 1}`,
      `dropped ${labels(g).join(', ')}; value re-spread across ${g.remaining} segments`, g.remaining, 'Calc Spec v0.2 CS-2'));
    passSteps.unshift(step('Reallocation of excluded value', `on; ${groups.length} pass${groups.length === 1 ? '' : 'es'}; value reallocated ${fmt(reallocatedValue)} of pool ${fmt(pool)}`, reallocatedValue, 'Calc Spec v0.2 CS-2'));
    const at = tr.findIndex(s => s.step === 'Raw FTE');
    tr.splice(at < 0 ? tr.length : at, 0, ...passSteps);
    trace.push(...tr);
    warnings.push(...wr);
    if (!anyCovered && pool > 0) warnings.push({ code: 'reallocation-nothing-covered', path: 'segments', message: `No segment receives calls after reallocation; the value pool of ${fmt(pool)} is not carried by any segment.` });
    out.totals.poolValue = pool;
    out.totals.coveredValue = covered;
    out.totals.forfeitedValue = anyCovered ? 0 : pool;
    out.totals.reallocation = { on: true, passes: groups.length, reallocatedValue, excludedByPass: groups.length ? groups.map(labels) : [[]] };
    const rl = (FL && FL.RESULT_LABELS && FL.RESULT_LABELS.reallocatedValue) ? FL.RESULT_LABELS.reallocatedValue() : 'Value reallocated';
    const drv = { label: rl, value: reallocatedValue, effect: `Value of excluded segments re-spread over covered segments (${groups.length} pass${groups.length === 1 ? '' : 'es'})` };
    const fi = out.drivers.findIndex(d => d.label === 'Value forfeited below minimum');
    if (fi >= 0) out.drivers[fi] = drv; else out.drivers.push(drv);
    return out;
  }

  function layerCounts(sh, rawFte) {
    if (sh.costMode !== 'layers' || !sh.layers) return null;
    const flm = rawFte / sh.layers.flmSpan;
    const slm = flm / sh.layers.slmSpan;
    return { reps: rawFte, firstLineManagers: flm, secondLineManagers: slm };
  }

  function calculate(inputs) {
    const v = validate(inputs);
    if (v.errors.length) return emptyResult(inputs, v);
    const inputsHash = fnv1a(stableStringify(inputs));
    const trace = [], warnings = v.warnings.slice();
    const capInfo = resolveCapacity(inputs.shared);
    trace.push(...capInfo.trace);
    inputs = Object.assign({}, inputs, { shared: Object.assign({}, inputs.shared, { capacity: capInfo.capacity }) });
    let out;
    try {
      if (inputs.method === 'affordable') out = withReallocation(calcAffordable, inputs, trace, warnings);
      else if (inputs.method === 'response') out = withReallocation(calcResponse, inputs, trace, warnings);
      else {
        out = calcWorkload(inputs, trace);
        out.rows.forEach(r => { r.excludedInPass = null; });
        out.totals.poolValue = null; out.totals.coveredValue = null; out.totals.reallocation = null;
      }
    } catch (e) {
      if (e && e.code === REALLOC_NOT_CONVERGED) return emptyResult(inputs, { errors: [{ code: e.code, path: 'methodAssumptions.reallocateExcluded', message: e.message, label: fieldLabel('methodAssumptions.reallocateExcluded', inputs.grain) }], warnings: v.warnings });
      throw e;
    }
    // CS-3: echo the display keys on result rows (identity stays `segment`).
    out.rows.forEach((r, i) => {
      const s = inputs.segments[i];
      r.specialty = s.specialty === undefined ? null : s.specialty;
      r.decile = s.decile === undefined ? null : s.decile;
    });
    // CS-8 additive totals. targetsPerRep = reached / recommended FTE, which is the existing entitiesPerRep value
    // (same formula, same null rule), so it is an alias of it.
    const range = callRange(out.rows);
    out.totals.minCalls = range.minCalls;
    out.totals.maxCalls = range.maxCalls;
    out.totals.targetsPerRep = out.totals.entitiesPerRep;
    const lc = layerCounts(inputs.shared, out.totals.rawFte);
    if (lc) {
      out.totals.layers = lc;
      trace.push(step('Management layers', `first line managers ${fmt(out.totals.rawFte)} / ${inputs.shared.layers.flmSpan} = ${fmt(lc.firstLineManagers)}; second line managers ${fmt(lc.firstLineManagers)} / ${inputs.shared.layers.slmSpan} = ${fmt(lc.secondLineManagers)} (cost already inside cost per call)`, lc.firstLineManagers, 'Spec §2.3'));
    }
    return {
      method: inputs.method, engineVersion: VERSION, inputsHash,
      errors: [], warnings,
      segments: out.rows, totals: out.totals, rollups: rollups(out.rows, out.totals.costPerCall),
      planningAllocation: planningAllocation(out.rows.map(r => r.rawFte), out.totals.recommendedFte),
      drivers: out.drivers, trace, entityResults: out.entityResults || null, curves: out.curves || null
    };
  }

  const FSEngine = Object.freeze({
    version: VERSION, ARCHETYPES, archetypesFor, resolveCurves,
    validate, calculate, resolveCapacity, costPerCall, impactableValue, planningAllocation, roiEquivalent,
    _internal: Object.freeze({ responseCurve, selectCalls, stableStringify, fnv1a })
  });
  if (typeof module !== 'undefined') module.exports = FSEngine; else root.FSEngine = FSEngine;
})(this);

;
