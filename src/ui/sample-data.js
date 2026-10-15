/* ---- ui/sample-data.js ---- */
/* FSSample — synthetic demonstration data for the Field Sizing UI.
   Every name and number here is invented. Nothing is taken from a client engagement or a reference workbook. */
(function (root) {
  const DECILES = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
  const COUNTS = [310, 460, 620, 780, 960, 1180, 1450, 1790, 2240, 2810];      // HCPs per decile
  const VALUE_PER = [1450, 980, 720, 540, 410, 300, 215, 150, 95, 50];          // composite score per HCP
  const REACH = [90, 88, 85, 82, 80, 75, 70, 65, 60, 55];
  const MAX_CALLS = [26, 24, 22, 20, 18, 15, 12, 10, 8, 6];
  const MIN_CALLS = [12, 10, 10, 8, 8, 6, 6, 4, 4, 2];
  const PLANNED = [24, 22, 20, 18, 15, 12, 10, 8, 6, 4];
  const MIXES = [
    { Loyalists: 40, Splitters: 30, Dabblers: 20, Conservatives: 10 },
    { Loyalists: 38, Splitters: 30, Dabblers: 20, Conservatives: 12 },
    { Loyalists: 35, Splitters: 30, Dabblers: 22, Conservatives: 13 },
    { Loyalists: 32, Splitters: 30, Dabblers: 23, Conservatives: 15 },
    { Loyalists: 30, Splitters: 28, Dabblers: 25, Conservatives: 17 },
    { Loyalists: 27, Splitters: 28, Dabblers: 26, Conservatives: 19 },
    { Loyalists: 24, Splitters: 27, Dabblers: 27, Conservatives: 22 },
    { Loyalists: 21, Splitters: 26, Dabblers: 28, Conservatives: 25 },
    { Loyalists: 18, Splitters: 25, Dabblers: 29, Conservatives: 28 },
    { Loyalists: 15, Splitters: 24, Dabblers: 30, Conservatives: 31 }
  ];

  function segments(method) {
    return DECILES.map((d, i) => ({
      segment: d,
      entities: COUNTS[i],
      compositeValue: method === 'workload' ? null : COUNTS[i] * VALUE_PER[i],
      reachPct: REACH[i],
      maxCalls: method === 'workload' ? null : MAX_CALLS[i],
      minCalls: method === 'workload' ? null : MIN_CALLS[i],
      plannedCalls: method === 'workload' ? PLANNED[i] : null,
      archetypeMix: method === 'response' ? Object.assign({}, MIXES[i]) : null
    }));
  }

  // Deterministic pseudo-random generator so the entity file is identical on every load.
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const ENTITY_PER_DECILE = 30;
  function entities() {
    const r = rng(20270101);
    const out = [];
    DECILES.forEach((d, i) => {
      const mix = MIXES[i];
      const order = ['Loyalists', 'Splitters', 'Dabblers', 'Conservatives'];
      for (let k = 0; k < ENTITY_PER_DECILE; k++) {
        const p = r() * 100;
        let acc = 0, arche = order[order.length - 1];
        for (const a of order) { acc += mix[a]; if (p < acc) { arche = a; break; } }
        const v = Math.round(VALUE_PER[i] * (0.8 + r() * 0.4));
        out.push({ id: 'HCP-' + String(10001 + out.length), segment: d, value: v, archetype: arche, attrs: { specialty: ['Rheumatology', 'Dermatology', 'Internal medicine'][out.length % 3] } });
      }
    });
    return out;
  }

  const shared = {
    capacity: 1600,
    costMode: 'fullyLoaded',
    costPerCallMethod: 'single-window',
    repCost: 265000,
    layers: { flmSpan: 8, flmCost: 310000, slmSpan: 6, slmCost: 380000 },
    inflationPct: 3,
    discountRatePct: 8,
    horizon: { windowYears: 3, tailYears: 2 }
  };

  // Contract v1.1 ValueInputs: forecast chain covering the 3-year window plus the 2-year tail.
  function valueInputs() {
    return {
      years: [
        { year: 2027, forecast: 60000000, carryoverPct: 0, otherChannelPct: 60 },
        { year: 2028, forecast: 85000000, carryoverPct: 30, otherChannelPct: 60 },
        { year: 2029, forecast: 105000000, carryoverPct: 30, otherChannelPct: 60 },
        { year: 2030, forecast: 115000000, carryoverPct: 30, otherChannelPct: 60 },
        { year: 2031, forecast: 120000000, carryoverPct: 30, otherChannelPct: 60 }
      ],
      sizingStartYear: 2027,
      grossMarginPct: 82,
      calibrationFactor: 1.0,
      annualValue: 30000000        // used only when the user picks direct entry
    };
  }

  function methodAssumptions(method) {
    if (method === 'affordable') return { value: valueInputs(), allocation: 'proportional', totalRoiCutoff: 1.5 };
    if (method === 'response') return { value: valueInputs(), allocation: 'proportional', roiBasis: 'gross', cutoff: 1.0, stoppingRule: 'first-fail', scenarioMaxCalls: 48 };
    return {};
  }

  const project = {
    name: 'Veltrana FY2027 field size',
    client: 'Harborline Therapeutics (synthetic)',
    brand: 'Veltrana',
    planningPeriod: { start: '2027-01-01', end: '2027-12-31' },
    grain: 'hcp',
    method: null,
    dataNotes: {
      assumptions: 'Decile assignment and composite scores are taken as delivered by Segmentation & Targeting (synthetic extract).',
      limitations: 'Reach % reflects a single access survey wave; no-see institutions are not separated.',
      exclusions: 'HCPs flagged as retired or no-contact upstream are excluded before delivery.'
    }
  };

  function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'; }

  // Sample files exercise the real import path (FSIO.parseFile → detect → applyMapping).
  // A title row sits above the header so the header-row step has something to do.
  const files = {
    summary(method) {
      const head = ['Decile', 'Number of HCPs'];
      if (method !== 'workload') head.push('Composite value');
      head.push('Reach %');
      if (method === 'workload') head.push('Planned calls');
      const rows = [['Synthetic segment extract - demonstration only'], head];
      segments(method).forEach(s => {
        const r = [s.segment, s.entities];
        if (method !== 'workload') r.push(s.compositeValue);
        r.push(s.reachPct);
        if (method === 'workload') r.push(s.plannedCalls);
        rows.push(r);
      });
      return { fileName: 'synthetic-decile-summary.csv', text: toCsv(rows) };
    },
    summaryWithErrors(method) {
      const f = files.summary(method);
      const lines = f.text.trim().split('\n');
      lines[4] = lines[4].replace(/^[^,]*,/, ',');          // blank decile label
      lines[7] = lines[7].replace(/^([^,]*),[^,]*/, '$1,n/a'); // non-numeric entity count
      return { fileName: 'synthetic-decile-summary-with-errors.csv', text: lines.join('\n') + '\n' };
    },
    entity() {
      const rows = [['Synthetic HCP extract - demonstration only'], ['HCP ID', 'Final decile', 'Composite score', 'Curve archetype', 'Specialty']];
      entities().forEach(e => rows.push([e.id, e.segment, e.value, e.archetype, e.attrs.specialty]));
      return { fileName: 'synthetic-hcp-entities.csv', text: toCsv(rows) };
    }
  };

  /* CS-3 multi-specialty sample: 3 fictional-neutral specialties × 10 deciles. Composite value = HCPs × a value per HCP on
     ONE scale across specialties (as Segmentation & Targeting supplies prioritisation scores), so the value pool can be
     allocated once across all 30 rows. Every number is invented. The single-specialty sample above stays the default. */
  const SPECIALTIES = [
    { name: 'Primary care', counts: [520, 760, 1020, 1300, 1600, 1950, 2400, 2950, 3700, 4600], valuePer: [760, 520, 380, 280, 210, 155, 112, 78, 50, 26], reachAdj: 0, capAdj: 0 },
    { name: 'Endocrinology', counts: [90, 130, 175, 225, 280, 340, 420, 510, 640, 800], valuePer: [2650, 1850, 1320, 990, 740, 540, 390, 270, 170, 88], reachAdj: 4, capAdj: 2 },
    { name: 'Gastroenterology', counts: [140, 200, 270, 340, 420, 520, 640, 790, 980, 1220], valuePer: [1700, 1150, 850, 640, 480, 350, 250, 175, 110, 58], reachAdj: -3, capAdj: 0 }
  ];
  const clamp100 = v => Math.max(0, Math.min(100, v));
  function multiSegments(method) {
    const out = [];
    SPECIALTIES.forEach(sp => DECILES.forEach((d, i) => out.push({
      segment: sp.name + ' · ' + d, specialty: sp.name, decile: d,
      entities: sp.counts[i],
      compositeValue: method === 'workload' ? null : sp.counts[i] * sp.valuePer[i],
      reachPct: clamp100(REACH[i] + sp.reachAdj),
      maxCalls: method === 'workload' ? null : MAX_CALLS[i] + sp.capAdj,
      minCalls: method === 'workload' ? null : MIN_CALLS[i],
      plannedCalls: method === 'workload' ? PLANNED[i] + sp.capAdj : null,
      archetypeMix: method === 'response' ? Object.assign({}, MIXES[i]) : null
    })));
    return out;
  }
  const multiSpecialty = {
    project: Object.assign({}, project, {
      name: 'Veltrana FY2027 field size (specialty × decile)',
      dataNotes: {
        assumptions: 'Specialty and decile as delivered by Segmentation & Targeting (synthetic extract); composite scores are on one scale across specialties.',
        limitations: project.dataNotes.limitations,
        exclusions: project.dataNotes.exclusions
      }
    }),
    specialties: SPECIALTIES.map(s => s.name),
    segments: multiSegments
  };

  /* Uptake presets sample (D6): 10 deciles whose archetype mix uses the configuration's archetypes Prospects / Trialists /
     Early Leaders, so it loads with their default uptake presets (Slow / Moderate / Steep). Every name and number is invented. */
  const PRESET_ARCHS = ['Prospects', 'Trialists', 'Early Leaders'];
  const PRESET_COUNTS = [240, 370, 510, 660, 820, 1010, 1240, 1530, 1910, 2400];
  const PRESET_VALUE_PER = [1620, 1080, 790, 590, 440, 320, 230, 160, 100, 55];
  const PRESET_MIXES = [
    [20, 35, 45], [22, 36, 42], [25, 36, 39], [28, 37, 35], [32, 36, 32],
    [36, 35, 29], [40, 34, 26], [45, 32, 23], [50, 30, 20], [56, 27, 17]
  ].map(m => { const o = {}; PRESET_ARCHS.forEach((a, k) => { o[a] = m[k]; }); return o; });
  function presetSegments(method) {
    return DECILES.map((d, i) => ({
      segment: d,
      entities: PRESET_COUNTS[i],
      compositeValue: method === 'workload' ? null : PRESET_COUNTS[i] * PRESET_VALUE_PER[i],
      reachPct: REACH[i],
      maxCalls: method === 'workload' ? null : MAX_CALLS[i],
      minCalls: method === 'workload' ? null : MIN_CALLS[i],
      plannedCalls: method === 'workload' ? PLANNED[i] : null,
      archetypeMix: method === 'response' ? Object.assign({}, PRESET_MIXES[i]) : null
    }));
  }
  function presetEntities() {
    const r = rng(20270707);
    const out = [];
    DECILES.forEach((d, i) => {
      const mix = PRESET_MIXES[i];
      for (let k = 0; k < ENTITY_PER_DECILE; k++) {
        const p = r() * 100;
        let acc = 0, arche = PRESET_ARCHS[PRESET_ARCHS.length - 1];
        for (const a of PRESET_ARCHS) { acc += mix[a]; if (p < acc) { arche = a; break; } }
        const v = Math.round(PRESET_VALUE_PER[i] * (0.8 + r() * 0.4));
        out.push({ id: 'HCP-' + String(20001 + out.length), segment: d, value: v, archetype: arche, attrs: { specialty: ['Neurology', 'Primary care'][out.length % 2] } });
      }
    });
    return out;
  }
  const presetSample = {
    project: Object.assign({}, project, {
      name: 'Kelvorin FY2027 field size (uptake presets)',
      brand: 'Kelvorin',
      dataNotes: {
        assumptions: 'Decile assignment, composite scores and archetype shares are taken as delivered by Segmentation & Targeting (synthetic extract).',
        limitations: project.dataNotes.limitations,
        exclusions: project.dataNotes.exclusions
      }
    }),
    archetypes: PRESET_ARCHS.slice(),
    segments: presetSegments,
    entities: presetEntities
  };

  /* Per-sample response-curve seeds (I-2): { assignment, custom, customSourceNote }. The existing samples keep today's reference
     curves as Custom (D6), so their outputs are unchanged; the uptake presets sample starts empty and the app fills it from
     the configuration's default assignment. Reference values come from the engine when it is loaded, else from this constant. */
  const REFERENCE_CURVES = { Loyalists: { delta: 5, gamma: 1.6, rho: 15 }, Splitters: { delta: 5, gamma: 1.1, rho: 2.5 },
    Dabblers: { delta: 5, gamma: 1.2, rho: 4.5 }, Conservatives: { delta: 5, gamma: 2.0, rho: 50 } };
  const engineRef = (root && root.FSEngine) || (typeof globalThis !== 'undefined' && globalThis.FSEngine) || null;
  const REF_SOURCE = (engineRef && engineRef.ARCHETYPES) || REFERENCE_CURVES;
  const SAMPLE_CURVE_NOTE = 'Synthetic sample reference curves';
  function responseCurveSeed(kind) {
    if (kind === 'presets') return { assignment: {}, custom: {}, customSourceNote: '' };
    const assignment = {}, custom = {};
    Object.keys(REF_SOURCE).forEach(a => {
      const c = REF_SOURCE[a];
      assignment[a] = 'custom';
      custom[a] = { delta: c.delta, gamma: c.gamma, rho: c.rho };
    });
    return { assignment, custom, customSourceNote: SAMPLE_CURVE_NOTE };
  }

  const FSSample = {
    project,
    users: {
      analyst: { name: 'Priya Raman', role: 'analyst' },
      lead: { name: 'Marcus Hale', role: 'lead' },
      lead2: { name: 'Elena Varga', role: 'lead' },   // second fictional Engagement Lead (O7/D13): approves what the first one recommended
      admin: { name: 'Dana Ortiz', role: 'admin' }
    },
    objectives: ['Balanced', 'Coverage-led', 'Efficiency-led'],
    // Project basics that pair with each FSAssist example brief (AI intake "Use the example brief"). All invented.
    aiExamples: {
      sample: { name: 'Veltrana FY2027 field size', client: project.client, brand: 'Veltrana', start: '2027-01-01', end: '2027-12-31', grain: 'hcp' },
      nerovia: { name: 'Nerovia launch year 2 field size', client: 'Synthetic client (demo)', brand: 'Nerovia', start: '2027-01-01', end: '2027-12-31', grain: 'hcp' },
      lumarex: { name: 'Lumarex FY2027 field size', client: 'Synthetic client (demo)', brand: 'Lumarex', start: '2027-01-01', end: '2027-12-31', grain: 'hcp' },
      accounts: { name: 'Account program FY2027 field size', client: 'Synthetic client (demo)', brand: 'Account program', start: '2027-01-01', end: '2027-12-31', grain: 'account' },
      clarivue: { name: 'Clarivue FY2027 field size', client: 'Synthetic client (demo)', brand: 'Clarivue', start: '2027-01-01', end: '2027-12-31', grain: 'site' }
    },
    segments,
    multiSpecialty,
    presetSample,
    responseCurveSeed,
    entities,
    shared: () => JSON.parse(JSON.stringify(shared)),
    // CS-5 (v0.5): the UI enters capacity as working days x calls per day (200 x 8 = the 1,600 calls above). Kept apart from
    // shared() so engine fixtures built from shared() are unchanged.
    capacityInput: () => ({ mode: 'derived', callsPerDay: 8, workingDays: 200 }),
    methodAssumptions,
    files
  };
  if (typeof module !== 'undefined') module.exports = FSSample; else root.FSSample = FSSample;
})(this);

;
