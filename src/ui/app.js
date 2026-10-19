/* ---- ui/app.js ---- */
/* Field Sizing UI — Arc Composer prototype (deterministic engine, optional simulated AI assist).
   Consumes FSFields, FSEngine, FSIO and FSAssist only through the frozen data contracts. Implements no sizing formulas. */
(function () {
  'use strict';
  const W = window;
  const F = W.FSFields, E = W.FSEngine, IO = W.FSIO, SAMPLE = W.FSSample;

  /* ------------------------------------------------------------------ utilities */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => deepFreeze(o[k])); }
    return o;
  }
  const isNum = v => typeof v === 'number' && isFinite(v);
  const nowIso = () => new Date().toISOString();
  const fmtTime = iso => { if (!iso) return '—'; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const nf = (d0, d1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d0, maximumFractionDigits: d1 });
  const fmt = {
    int: n => (isNum(n) ? nf(0, 0).format(n) : '—'),
    num: (n, d = 2) => (isNum(n) ? nf(d, d).format(n) : '—'),
    num1: n => (isNum(n) ? nf(0, 1).format(n) : '—'),
    pct: n => (isNum(n) ? nf(0, 1).format(n) + '%' : '—'),
    money: n => (isNum(n) ? '$' + nf(0, 0).format(n) : '—'),
    moneyShort: n => (!isNum(n) ? '—' : Math.abs(n) >= 1e9 ? '$' + nf(1, 1).format(n / 1e9) + 'B' : Math.abs(n) >= 1e6 ? '$' + nf(1, 1).format(n / 1e6) + 'M' : Math.abs(n) >= 1e4 ? '$' + nf(0, 0).format(n / 1e3) + 'K' : '$' + nf(0, 0).format(n)),
    money2: n => (isNum(n) ? '$' + nf(2, 2).format(n) : '—'),
    roi: n => (isNum(n) ? nf(2, 2).format(n) : 'N/A'),
    input: n => (isNum(n) ? String(n) : ''),
    inputBig: n => (isNum(n) ? nf(0, 6).format(n) : '')
  };
  function parseNum(raw) {
    const s = String(raw == null ? '' : raw).replace(/[,$%\s]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  const slug = s => String(s || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario';
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const plural = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many || one + 's'}`;

  /* ------------------------------------------------------------------ icons (outline, 24 viewBox) */
  const P = {
    menu: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.2" y2="16.2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    waffle: '<circle cx="5" cy="5" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="19" cy="5" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="19" r="1.2"/><circle cx="12" cy="19" r="1.2"/><circle cx="19" cy="19" r="1.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16" y2="19"/><line x1="8" y1="19" x2="12" y2="19"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    review: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 14 11 16 15 12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    error: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    chevDown: '<polyline points="6 9 12 15 18 9"/>',
    chevRight: '<polyline points="9 18 15 12 9 6"/>',
    chevLeft: '<polyline points="15 18 9 12 15 6"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    dot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>',
    terms: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
  };
  const icon = (name, size = 16, cls = '') => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;

  /* ------------------------------------------------------------------ constants derived from the contract */
  const METHOD_IDS = ['affordable', 'response', 'workload'];
  const methodLabel = m => (m && F.METHODS[m] ? F.METHODS[m].label : 'No method');
  const grainOne = g => F.GRAIN[g || 'hcp'].one;
  const grainMany = g => F.GRAIN[g || 'hcp'].many;
  const SEG_FIELD = id => F.SEGMENT_FIELDS.find(f => f.id === id);
  const MAP_FIELD = id => F.MAPPING_FIELDS.find(f => f.id === id);

  const SECTIONS = [
    { id: 'setup', label: 'Project and Input', icon: 'folder', sub: 'Name the engagement, choose the sizing method, then bring in the upstream segment data.' },
    { id: 'assumptions', label: 'Model Assumptions', icon: 'sliders', sub: 'Set the sizing controls the chosen method needs. Upstream values are read-only; defects go back to Segmentation & Targeting.' },
    { id: 'result', label: 'FTE Calculation', icon: 'calc', sub: 'Run the deterministic engine and see how the field size was reached, segment by segment.' },
    { id: 'scenarios', label: 'Scenario Summary', icon: 'layers', sub: 'Save immutable snapshots, compare them side by side and mark the one you recommend.' },
    { id: 'review', label: 'Review and Export', icon: 'review', sub: 'Review the recommended snapshot, move it through approval and export the Excel workbook.' }
  ];
  const ROLE_LABEL = F.ROLE_LABELS;
  const STATUS = {
    draft: { label: 'Draft', cls: 'chip-base', icon: 'edit' },
    in_review: { label: 'In review', cls: 'chip-warning', icon: 'dot' },
    approved: { label: 'Approved', cls: 'chip-success', icon: 'check' },
    rejected: { label: 'Rejected', cls: 'chip-error', icon: 'x' }
  };
  const BINDING_LABEL = F.BINDING_LABELS;
  /* One wording for UI and export (FSIO.exclusionLabel); context from the inputs the result was calculated with. */
  const exclusionLabel = (m, r) => { const ri = state.resultInputs || {}, o = ri.methodAssumptions || {};
    return IO.exclusionLabel(m, r, { grain: ri.grain || state.project.grain, minimumBoundary: o.minimumBoundary, stoppingRule: o.stoppingRule }); };

  /* ------------------------------------------------------------------ state */
  const users = (SAMPLE && SAMPLE.users) || { analyst: { name: 'Analyst' }, lead: { name: 'Lead' }, admin: { name: 'Admin' } };
  function blankProject() {
    return { name: '', client: '', brand: '', planningPeriod: { start: '', end: '' }, grain: 'hcp', method: null, dataNotes: { assumptions: '', limitations: '', exclusions: '' } };
  }
  /* Disclosed defaults only (contract §1 + v1.1/v1.2). Everything else starts blank; sample values load only on request. */
  const OD = F.OPTION_DEFAULTS || {};
  const DEFAULTS = {
    costMode: OD.costMode, costPerCallMethod: OD.costPerCallMethod, allocation: OD.allocation, roiBasis: OD.roiBasis,
    /* CS-5 (v0.5): capacity is always entered as calls per day x working days (fields.js OPTION_DEFAULTS.capacityInput = 'derived').
       The engine still accepts a direct capacity; a draft cloned with one keeps it, shown read-only. */
    stoppingRule: OD.stoppingRule, fteRounding: OD.fteRounding, capacityMode: 'derived', minimumBoundary: OD.minimumBoundary,
    cutoffTie: OD.cutoffTie, reachAppliesTo: OD.reachAppliesTo, maxCallsSource: OD.maxCallsSource, carryoverConvention: OD.carryoverConvention,
    /* numeric defaults stated in the contract text (§1, v1.1) */
    windowYears: 3, tailYears: 2, grossMarginPct: 100, calibrationFactor: 1, cutoffGross: 1.0, scenarioMaxCalls: 48,
    reallocateExcluded: OD.reallocateExcluded === true    // CS-2 draft default: On since the 2026-10-12 review (was Off, D15). The engine still reads an absent key as Off, so the UI always sends it.
  };
  const OL = key => F.OPTION_LABELS[key] || {};
  function blankShared() {
    return { capacity: null, costMode: DEFAULTS.costMode, costPerCallMethod: DEFAULTS.costPerCallMethod, repCost: null,
      layers: { flmSpan: null, flmCost: null, slmSpan: null, slmCost: null }, inflationPct: null, discountRatePct: null,
      horizon: { windowYears: DEFAULTS.windowYears, tailYears: DEFAULTS.tailYears },
      fteRounding: DEFAULTS.fteRounding, capacityInput: { mode: DEFAULTS.capacityMode, callsPerDay: null, workingDays: null } };
  }
  const blankYear = () => ({ year: null, forecast: null, carryoverPct: null, otherChannelPct: null, sfPct: null });
  function blankYears(n) { return Array.from({ length: n }, blankYear); }
  function blankValue() { return { years: blankYears(DEFAULTS.windowYears + DEFAULTS.tailYears), sizingStartYear: null, grossMarginPct: DEFAULTS.grossMarginPct, calibrationFactor: DEFAULTS.calibrationFactor, annualValue: null, carryoverConvention: DEFAULTS.carryoverConvention }; }
  function methodDefaults() {
    return {
      // reallocateExcluded is written explicitly (default On since the 2026-10-12 review); the engine reads an absent key as Off.
      affordable: { value: blankValue(), allocation: DEFAULTS.allocation, totalRoiCutoff: null, minimumBoundary: DEFAULTS.minimumBoundary, reallocateExcluded: DEFAULTS.reallocateExcluded },
      response: { value: blankValue(), allocation: DEFAULTS.allocation, roiBasis: DEFAULTS.roiBasis, cutoff: DEFAULTS.cutoffGross, stoppingRule: DEFAULTS.stoppingRule, scenarioMaxCalls: DEFAULTS.scenarioMaxCalls,
        minimumBoundary: DEFAULTS.minimumBoundary, cutoffTie: DEFAULTS.cutoffTie, reachAppliesTo: DEFAULTS.reachAppliesTo, maxCallsSource: DEFAULTS.maxCallsSource, reallocateExcluded: DEFAULTS.reallocateExcluded },
      workload: {}
    };
  }
  const state = {
    role: 'analyst',
    leadKey: 'lead',         // which demo Engagement Lead is signed in when role = lead (O7: a second Lead can approve the first's recommendation)
    section: 'setup',
    drawerOpen: false,
    project: blankProject(),
    objective: (SAMPLE && SAMPLE.objectives[0]) || 'Balanced',
    inputGrain: 'summary',
    segments: [],            // working SegmentRow[] (all fields retained; projected per method for the engine)
    entities: null,
    shared: blankShared(),
    repCostByMode: {},       // FR-12: rep cost kept per cost mode (fully loaded vs rep only)
    methodStore: methodDefaults(),
    provenance: null,
    corrections: [],
    parentId: null,
    checkpoints: { inputs: null, assumptions: null },     // {sig, at} when passed
    checkRuns: { inputs: null, assumptions: null },       // last run issues for display
    result: null, resultSig: null, resultAt: null, resultInputs: null,
    scenarios: [],
    audit: [],
    seq: 0,
    importFlow: null,
    dialog: null,
    valueMode: { affordable: 'chain', response: 'chain' },
    workloadCost: true,
    showReq: false,
    ui: { traceOpen: false, advancedOpen: false, reviewTab: 'summary', notesOpen: true, compareSel: null },
    /* P3 (FR-46, proposed): the response curve configuration. A deep clone of the frozen FSFields seed, edited only by the
       Administrator in the configurator; it belongs to the project, so sample loads do not reset it. */
    config: clone(F.RESPONSE_CURVE_CONFIG),
    /* P4 (I-2): the analyst's uptake choice per archetype id (or 'ALL'), Custom curve values and their source note. Sample
       loads seed it (FSSample.responseCurveSeed); a new project starts empty; unassigned archetypes are absent. */
    responseCurve: { assignment: {}, custom: {}, customSourceNote: '' },
    respSegType: 'behaviour',   // CS-7: Response Curve segmentation type ('behaviour' = value + curve archetypes; 'value' = value only, not supported)
    /* Simulated AI assist (contract §7). Nothing here feeds buildInputs, the signatures or the export until a person adopts or accepts. */
    ai: { enabled: true, flow: null, sets: [], rev: 0, planStatus: {}, valueOrigins: [], pending: null, adoption: null, narratives: {}, entry: null, touched: {} }
  };

  /* Demo people: one per role, plus any extra Engagement Leads in the roster (users[k].role === 'lead'). The default Lead stays `lead`. */
  const LEAD_KEYS = Object.keys(users).filter(k => k === 'lead' || (users[k] && users[k].role === 'lead'));
  const curUser = () => users[state.role === 'lead' && users[state.leadKey] ? state.leadKey : state.role];
  const me = () => ({ user: curUser().name, role: state.role });
  const readOnly = () => state.role === 'admin';
  const ACTION_LABEL = { checkpoint: 'Validation check', methodology: 'Methodology option', assumption: 'Assumption changed', project: 'Project updated', 'data-entry': 'Data entered',
    ingest: 'Data ingested', upload: 'File selected', mapping: 'Column mapping', method: 'Method', correction: 'Upstream correction', calculate: 'Calculated', snapshot: 'Snapshot saved',
    rename: 'Renamed', clone: 'Cloned', recommend: 'Recommended', unrecommend: 'Recommendation removed', submit: 'Submitted for review', approve: 'Approved', reject: 'Rejected',
    export: 'Exported', 'role-switch': 'Role switched', config: (F.RESPONSE_CURVE_LABELS || {}).configuratorTitle,
    'ai-setting': 'AI assistance setting', 'ai-brief': 'AI brief captured', 'ai-proposed': 'AI candidates proposed', 'ai-blocked': 'AI candidate blocked',
    'ai-gap-filled': 'AI question answered', 'ai-adopt-start': 'AI candidate opened for review', 'ai-accepted': 'AI value accepted',
    'ai-edit-accepted': 'AI value edited and accepted', 'ai-rejected': 'AI value rejected', 'ai-adopted': 'AI candidate adopted',
    'ai-discarded': 'AI candidate discarded', 'ai-narrative': 'AI narrative generated' };
  function audit(action, detail, scenarioId) {
    state.audit.push({ at: nowIso(), user: curUser().name, role: state.role, action, label: ACTION_LABEL[action] || cap(action), scenarioId: scenarioId || null, detail: detail || '' });
  }

  /* ------------------------------------------------------------------ derived model */
  const method = () => state.project.method;
  const ma = () => (method() ? state.methodStore[method()] : {});
  const allocation = () => (ma() && ma().allocation) || null;
  const visibleFields = () => (method() ? F.segmentFieldsFor(method(), allocation(), state.inputGrain) : []);
  const visibleIds = () => visibleFields().map(f => f.id);
  /* CS-3: rows are specialty × decile pairs when any row carries a specialty (a string; '' while a manual row is unnamed).
     Without one the rows, engine inputs and every view are exactly the decile-only v0.3 shape. */
  const hasSpecKey = s => !!s && typeof s.specialty === 'string';
  const specOn = rows => (rows || state.segments).some(hasSpecKey);
  const specialtiesOf = rows => { const out = []; (rows || state.segments).forEach(s => { if (hasSpecKey(s) && !out.includes(s.specialty)) out.push(s.specialty); }); return out; };
  const specLabel = sp => (sp === '' ? '(no specialty)' : sp);
  const decileOf = s => (s && s.decile != null ? String(s.decile) : s ? String(s.segment) : '');

  /* Engine inputs: segment rows are projected to the fields the method uses; everything else is null. */
  function buildInputs() {
    const ids = new Set(visibleIds());
    /* D3 (P4): value-only with the configuration flag on sends no archetypes, so every row uses the single 'ALL' curve. */
    const vo = valueOnlyRuns();
    const rows = state.segments.map(s => {
      const r = { segment: s.segment, entities: s.entities, compositeValue: null, reachPct: s.reachPct, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
      ['compositeValue', 'maxCalls', 'minCalls', 'plannedCalls', 'archetypeMix'].forEach(k => { if (ids.has(k)) r[k] = s[k] == null ? null : clone(s[k]); });
      if (ids.has('archetypeMix')) r.archetype = s.archetypeMix ? null : (s.archetype || null);   // FR-14: single archetype; a mix wins
      if (vo) { r.archetypeMix = null; if (ids.has('archetypeMix')) r.archetype = null; }
      if (hasSpecKey(s)) { r.specialty = s.specialty; r.decile = s.decile == null ? null : String(s.decile); }   // CS-3 display keys (identity stays segment)
      return r;
    });
    const sh = clone(state.shared);
    if (sh.costMode !== 'layers') sh.layers = null;
    if (method() === 'workload' && !state.workloadCost) sh.repCost = null;   // Workload: cost is optional
    if (sh.capacityInput && sh.capacityInput.mode === 'derived') sh.capacity = null;   // engine derives it (v1.3)
    const ents = state.entities ? clone(state.entities) : null;
    if (ents && vo) ents.forEach(e => { if (e && typeof e === 'object') e.archetype = null; });
    const mas = projectMethodAssumptions();
    if (method() === 'response') withCurves(mas);
    return {
      method: method(), grain: state.project.grain, inputGrain: state.inputGrain,
      segments: rows, entities: ents,
      shared: sh, methodAssumptions: mas
    };
  }
  /* I-4: Response Curve curves come only from here: FSEngine.resolveCurves over the uptake assignment, restricted to the
     archetypes in the data (or 'ALL' for value-only), with the configuration's presets and the Custom values. A stored
     curveParams (older draft) is never sent; with nothing assigned the keys are left out (the engine's old-shape path). */
  function withCurves(m) {
    delete m.curveParams; delete m.curveProvenance; delete m.customSourceNote;
    const r = resolvedCurves();
    if (!Object.keys(r.curveParams).length) return m;
    m.curveParams = r.curveParams; m.curveProvenance = r.provenance;
    if (Object.keys(r.provenance).some(id => r.provenance[id].source === 'custom')) m.customSourceNote = state.responseCurve.customSourceNote;
    return m;
  }
  /* v1.1 ValueInputs: either direct annualValue or the forecast chain, never both.
     v0.5.1 (CS-1, delta §3): no mode choice. The chain always sends all three shares and never sends
     forecastMode: the engine sizes from carryover and other channels (fs-engine 1.7.0 = the reference workbook), and an
     entered Salesforce-impactable % is a check value only. A draft cloned from a v0.5 snapshot saved with a non-default
     forecastMode keeps it (shown read-only as an older draft) and sends it, with only the two shares that mode entered,
     so the saved result is reproduced. */
  const FORECAST_MODES = ['carryover+other', 'carryover+sf', 'other+sf'];
  const FC_DEFAULT_MODE = 'carryover+other';
  const legacyMode = v => (v && FORECAST_MODES.includes(v.forecastMode) && v.forecastMode !== FC_DEFAULT_MODE ? v.forecastMode : null);
  const DERIVED_KEY = { 'carryover+other': 'sfPct', 'carryover+sf': 'otherChannelPct', 'other+sf': 'carryoverPct' };
  function chainValue(v) {
    const lm = legacyMode(v), drop = lm ? DERIVED_KEY[lm] : null;
    const years = (v.years || []).map((y, i) => {
      const o = { year: isNum(v.sizingStartYear) ? v.sizingStartYear + i : y.year, forecast: y.forecast, carryoverPct: y.carryoverPct, otherChannelPct: y.otherChannelPct, sfPct: isNum(y.sfPct) ? y.sfPct : null };
      if (drop) o[drop] = null;
      return o;
    });
    const out = { years, sizingStartYear: v.sizingStartYear, grossMarginPct: v.grossMarginPct, calibrationFactor: v.calibrationFactor, carryoverConvention: v.carryoverConvention || DEFAULTS.carryoverConvention };
    if (lm) out.forecastMode = lm;   // older draft only; the UI never sends the default or a new mode
    return out;
  }
  function projectMethodAssumptions() {
    const m = clone(ma() || {});
    if (m.value) {
      const v = m.value;
      m.value = valueMode() === 'direct' ? { annualValue: v.annualValue, calibrationFactor: v.calibrationFactor } : chainValue(v);
    }
    return m;
  }
  const valueMode = () => state.valueMode[method()] || 'chain';
  const inputsSig = () => JSON.stringify({ p: state.project, g: state.inputGrain, s: state.segments.map(s => [s.segment, s.entities, s.compositeValue, s.archetypeMix, s.archetype]), e: state.entities ? state.entities.length : 0 });
  /* CS-7: a Response draft marked value-only cannot pass the assumptions check, so the choice is part of the signature. */
  const assumptionsSig = () => { const s = JSON.stringify(buildInputs()); return method() === 'response' && state.respSegType === 'value' ? s + (valueOnlyRuns() ? '|value-only-all' : '|value-only') : s; };
  const resultIsCurrent = () => !!state.result && state.resultSig === assumptionsSig();

  function stageStatus(id) {
    const inOk = !!state.checkpoints.inputs && state.checkpoints.inputs.sig === inputsSig();
    const asOk = inOk && !!state.checkpoints.assumptions && state.checkpoints.assumptions.sig === assumptionsSig();
    const resOk = asOk && resultIsCurrent() && !(state.result.errors || []).length;
    const anySnap = state.scenarios.length > 0;
    const rec = state.scenarios.find(s => s.recommended);
    switch (id) {
      case 'setup': return inOk ? 'complete' : state.checkpoints.inputs ? 'recheck' : 'open';   // passed once, inputs changed since
      case 'assumptions': return !inOk ? 'locked' : asOk ? 'complete' : state.checkpoints.assumptions ? 'recheck' : 'open';
      case 'result': return !asOk && !state.result ? 'locked' : resOk ? 'complete' : state.result && !resultIsCurrent() ? 'stale' : 'open';
      case 'scenarios': return !state.result && !anySnap && !aiHasCandidates() ? 'locked' : rec && rec.status !== 'rejected' ? 'complete' : 'open';   // a rejected recommendation needs a new one
      case 'review': return !anySnap ? 'locked' : rec && rec.status === 'approved' ? 'complete' : 'open';
    }
    return 'open';
  }
  const lockReason = {
    assumptions: 'Pass the inputs check on Project and Input first.',
    result: 'Pass the assumptions check on Model Assumptions first.',
    scenarios: 'Calculate a result first.',
    review: 'Save at least one scenario snapshot first.'
  };

  /* Classify an engine Issue into the inputs or the assumptions checkpoint using SEGMENT_FIELDS ownership. */
  function issueStage(issue) {
    /* FR-47 (P4): an archetype in the data with no uptake is an assumption to choose on Model Assumptions, not a data defect;
       likewise value-only rows waiting for the "All HCPs" uptake. */
    if (issue.code === 'unknown-archetype' || (issue.code === 'response-needs-entity-or-mix' && valueOnlyRuns()) || mixTotalFromUptake(issue)) return 'assumptions';
    const p = String(issue.path || '');
    const m = p.match(/^segments(?:\[(\d*)\])?\.(\w+)/);
    if (m) { const f = SEG_FIELD(m[2]); return f && f.owner === 'upstream' ? 'inputs' : 'assumptions'; }
    if (/^entities(\[|\.|$)/.test(p) || /^(method|grain|inputGrain|segments)$/.test(p)) return 'inputs';
    return 'assumptions';
  }
  /* The engine totals a mix over the archetypes it has curves for; with an archetype still waiting for its uptake, a mix that
     totals 100% as delivered is reported short. That follows from the missing uptake (Step 2), not from the data (fix 2). */
  function mixTotalFromUptake(issue) {
    const m = issue.code === 'archetype-mix-total' && String(issue.path || '').match(/^segments\[(\d+)\]\.archetypeMix$/);
    const mix = m && state.segments[+m[1]] && state.segments[+m[1]].archetypeMix;
    if (!mix || !Object.keys(mix).every(k => isNum(mix[k]) && mix[k] >= 0)) return false;   // N2: any other mix defect stays a Step 1 error
    const tot = Object.keys(mix).reduce((t, k) => t + (isNum(mix[k]) ? mix[k] : 0), 0);
    const cp = resolvedCurves().curveParams;
    return Math.abs(tot - 100) <= 1e-6 && Object.keys(mix).some(k => !E.ARCHETYPES[k] && !ownKey(cp, k));
  }
  function issueWhere(issue) {
    const p = String(issue.path || '');
    const m = p.match(/^segments\[(\d*)\]\.(\w+)/);
    if (m) {
      const f = SEG_FIELD(m[2]); const fl = f ? f.label(state.project.grain) : m[2];
      if (m[1] === '') return `All segments · ${fl}`;
      const s = state.segments[+m[1]];
      return `Segment ${s ? s.segment : +m[1] + 1} · ${fl}`;
    }
    const y = p.match(/^methodAssumptions\.value\.years\[(\d+)\]/);
    if (y) { const v0 = ma().value || {}; return `Forecast year ${isNum(v0.sizingStartYear) ? v0.sizingStartYear + +y[1] : +y[1] + 1}`; }
    const LOC = { 'shared.capacity': 'Effective annual calls per rep', 'shared.repCost': 'Annual rep cost', 'shared.layers': 'Management layers', 'shared.inflationPct': 'Cost inflation', 'shared.discountRatePct': 'Discount rate', 'methodAssumptions.value': 'Impactable value', 'methodAssumptions.value.years': 'Forecast years', 'methodAssumptions.value.sizingStartYear': 'Sizing start year', 'methodAssumptions.value.annualValue': 'Annual impactable value', 'methodAssumptions.value.forecastMode': 'Forecast inputs (older draft)', 'methodAssumptions.scenarioMaxCalls': 'Scenario maximum calls', 'shared.capacityInput': 'Calls per day and working days', 'methodAssumptions.totalRoiCutoff': 'ROI cutoff', 'methodAssumptions.cutoff': 'Marginal ROI cutoff', 'entities': 'Entity-level data', 'segments': 'Segment rows' };
    if (LOC[p]) return LOC[p];
    if (issue.label) return issue.label;
    if (!state.showReq) return 'Inputs';
    return p || '—';
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

  /* ------------------------------------------------------------------ component helpers */
  const dd = {};        // listbox registry rebuilt on every render: id -> {options, value, onSelect}
  const acts = {};      // click actions: name -> fn(el, ev)

  function field({ id, label, optional, hint, error, control, cls = '' }) {
    const hid = hint || error ? ` id="${id}-hint"` : '';
    return `<div class="field ${cls}">
      <label class="lbl${error ? ' is-invalid' : ''}" for="${id}" id="${id}-lbl">${esc(label)}${optional ? ' <span class="opt">(Optional)</span>' : ''}</label>
      ${control}
      ${error ? `<div class="err"${hid}>${esc(error)}</div>` : hint ? `<div class="hint"${hid}>${hint}</div>` : ''}
    </div>`;
  }
  function textInput({ id, bind, value, label, optional, hint, error, placeholder = '', cls = '', disabled, type = 'text', mode }) {
    const dis = disabled || readOnly();
    const control = `<input class="input${error ? ' is-invalid' : ''}" type="${type}" id="${id}" ${bind ? `data-bind="${bind}"` : ''} ${mode ? `inputmode="${mode}"` : ''}
      value="${esc(value)}" placeholder="${esc(placeholder)}" ${dis ? 'disabled' : ''} ${error ? 'aria-invalid="true"' : ''} ${hint || error ? `aria-describedby="${id}-hint"` : ''} autocomplete="off">`;
    return field({ id, label, optional, hint, error, control, cls });
  }
  /* Numeric input with optional prefix/suffix adornment ("$", "%", "calls"). kind: num | pct | money | int */
  function numInput({ id, bind, value, label, optional, hint, error, prefix, suffix, cls = '', disabled, big, ariaLabel, compact, placeholder }) {
    const dis = disabled || readOnly();
    const v = big ? fmt.inputBig(value) : fmt.input(value);
    const inp = `<input class="input${prefix ? ' has-pre' : ''}${suffix ? ' has-suf' : ''}${error ? ' is-invalid' : ''}" type="text" inputmode="decimal" id="${id}" ${bind ? `data-bind="${bind}" data-kind="num"` : ''}
      value="${esc(v)}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} ${dis ? 'disabled' : ''} ${error ? 'aria-invalid="true"' : ''} ${ariaLabel ? `aria-label="${esc(ariaLabel)}"` : ''} ${hint || error ? `aria-describedby="${id}-hint"` : ''} autocomplete="off">`;
    const control = `<div class="affix">${prefix ? `<span class="pre" aria-hidden="true">${esc(prefix)}</span>` : ''}${inp}${suffix ? `<span class="suf" aria-hidden="true">${esc(suffix)}</span>` : ''}</div>`;
    if (compact) return control;
    return field({ id, label, optional, hint, error, control, cls });
  }
  function textArea({ id, bind, value, label, optional, hint, rows = 3 }) {
    const control = `<textarea class="input ta" id="${id}" data-bind="${bind}" rows="${rows}" ${readOnly() ? 'disabled' : ''} ${hint ? `aria-describedby="${id}-hint"` : ''}>${esc(value)}</textarea>`;
    return field({ id, label, optional, hint, control });
  }
  /* Custom listbox dropdown (no native select). */
  function dropdown({ id, label, value, options, onSelect, placeholder = 'Select…', hint, error, disabled, compact, ariaLabel, cls = '' }) {
    dd[id] = { options, value, onSelect };
    const sel = options.find(o => o.value === value);
    const dis = disabled || readOnly();
    const btn = `<button type="button" class="dd${error ? ' is-invalid' : ''}" id="${id}" data-dd="${id}" aria-haspopup="listbox" aria-expanded="false"
        ${label ? `aria-labelledby="${id}-lbl ${id}"` : ariaLabel ? `aria-label="${esc(ariaLabel)}"` : ''} ${dis ? 'disabled' : ''} ${hint || error ? `aria-describedby="${id}-hint"` : ''}>
        <span class="dd-val${sel ? '' : ' is-ph'}">${esc(sel ? sel.label : placeholder)}</span>${icon('chevDown', 16, 'dd-chev')}</button>`;
    if (compact) return btn;
    return field({ id, label, hint, error, control: btn, cls });
  }
  function radioGroup({ name, label, value, options, onAct, inline, hint, describe }) {
    const dis = readOnly();
    return `<fieldset class="fs${inline ? ' inline' : ''}"><legend class="lbl">${esc(label)}</legend>
      ${hint ? `<div class="hint mb8">${hint}</div>` : ''}
      <div class="radios">${options.map(o => `<label class="radio"><input type="radio" name="${name}" value="${esc(o.value)}" data-radio="${onAct}" ${o.value === value ? 'checked' : ''} ${dis || o.disabled ? 'disabled' : ''}>
        <span class="rtext"><span class="rlabel">${esc(o.label)}${o.isDefault ? ' <span class="chip chip-outline chip-sm tag-default">Default</span>' : ''}</span>${describe && o.desc ? `<span class="rdesc">${esc(o.desc)}</span>` : ''}</span></label>`).join('')}</div></fieldset>`;
  }
  function checkbox({ id, label, checked, onAct, disabled, always }) {
    return `<label class="check" for="${id}"><input type="checkbox" id="${id}" data-check="${onAct}" ${checked ? 'checked' : ''} ${!always && (disabled || readOnly()) ? 'disabled' : ''}><span>${esc(label)}</span></label>`;
  }
  /* Buttons: disabled buttons use aria-disabled so they stay focusable and can explain why. */
  function btn({ label, act, arg = '', kind = 'outline', ic, id, reason, attrs = '', small }) {
    const dis = !!reason;
    return `<button type="button" class="btn btn-${kind}${small ? ' btn-sm' : ''}" ${id ? `id="${id}"` : ''} data-act="${act}" data-arg="${esc(arg)}"
      ${dis ? `aria-disabled="true" data-tip="${esc(reason)}" aria-describedby="tip-${esc(id || act)}"` : ''} ${attrs}>${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>${dis ? `<span class="sr-only" id="tip-${esc(id || act)}">${esc(reason)}</span>` : ''}`;
  }
  function iconBtn({ act, arg = '', ic, label, id, reason }) {
    return `<button type="button" class="ibtn" ${id ? `id="${id}"` : ''} data-act="${act}" data-arg="${esc(arg)}" aria-label="${esc(label)}" data-tip="${esc(reason || label)}" ${reason ? 'aria-disabled="true"' : ''}>${icon(ic)}</button>`;
  }
  const MSG_ICON = { info: 'info', success: 'ok', warning: 'warn', error: 'error', neutral: 'info' };
  function msg(kind, html, { title, actions, id } = {}) {
    return `<div class="msg msg-${kind}" ${id ? `id="${id}"` : ''} role="${kind === 'error' ? 'alert' : 'status'}">${icon(MSG_ICON[kind], 16, 'msg-ic')}
      <div class="msg-body">${title ? `<div class="msg-title">${esc(title)}</div>` : ''}<div>${html}</div>${actions ? `<div class="msg-actions">${actions}</div>` : ''}</div></div>`;
  }
  const chip = (text, cls = 'chip-outline', ic) => `<span class="chip ${cls}">${ic ? icon(ic, 14) : ''}<span>${esc(text)}</span></span>`;
  const statusChip = st => { const s = STATUS[st] || STATUS.draft; return chip(s.label, s.cls, s.icon); };
  const badge = (text, cls = 'badge-primary') => `<span class="badge ${cls}">${esc(text)}</span>`;
  const upstreamBadge = () => `<span class="badge badge-primary" title="Owned by Segmentation &amp; Targeting">Upstream</span>`;
  const sizingBadge = () => `<span class="chip chip-outline chip-sm">Sizing control</span>`;
  function card({ title, sub, body, id, actions, cls = '', step }) {
    return `<section class="card ${cls}" ${id ? `id="${id}" aria-labelledby="${id}-h"` : ''}>
      ${title ? `<header class="card-h"><div class="card-ht">${step ? `<span class="stepno" aria-hidden="true">${step}</span>` : ''}<div><h2 class="card-title" ${id ? `id="${id}-h"` : ''}>${step ? `<span class="sr-only">Step ${step}: </span>` : ''}${esc(title)}${REQ[id] ? rq(REQ[id]) : ''}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div></div>${actions ? `<div class="card-actions">${actions}</div>` : ''}</header>` : ''}
      ${!title && REQ[id] ? `<p class="req-line">${rq(REQ[id])}</p>` : ''}${body}</section>`;
  }
  function disclosure({ id, label, open, body, act }) {
    return `<div class="disc"><button type="button" class="btn-text disc-btn" id="${id}-btn" data-act="${act}" aria-expanded="${open}" aria-controls="${id}">${icon(open ? 'chevDown' : 'chevRight')}<span>${esc(label)}</span></button>
      <div id="${id}" class="disc-body" ${open ? '' : 'hidden'}>${body}</div></div>`;
  }
  const rq = t => `<span class="req"> ${esc(String(t).trim())}</span>`;
  const REQ = { 'c-project': 'FR-01, FR-05', 'c-method': 'FR-18, FR-19', 'c-data': 'FR-03, FR-08, FR-43', 'c-incheck': 'FR-04, FR-31, FR-33', 'c-upstream': 'FR-06',
    'c-shared': 'FR-10, FR-12', 'c-method-a': 'FR-13, FR-14, FR-17', 'c-sizing': 'FR-11, FR-17', 'c-cover': 'CS-2', 'c-resfilter': 'CS-3, CS-8',   /* 2026-10-12: were untraced; change-spec IDs from the code comments, PRD FR IDs to confirm */ 'c-ascheck': 'FR-15, FR-31, FR-33',
    'c-calc': 'FR-20, FR-24', 'c-hero': 'FR-22, FR-23, FR-28', 'c-why': 'FR-21, BR-07', 'c-segres': 'FR-21', 'c-trace': 'FR-21, BR-07', 'c-save': 'FR-25, FR-26, FR-36',
    'c-compare': 'FR-27, FR-29', 'c-role': 'PRD §4, BR-06', 'c-review': 'FR-32, FR-34, FR-35, FR-37, BR-06', 'c-export': 'FR-38, FR-39, FR-40, FR-41' };
  const REF_RE = /Spec §|PE-\d+|Decision \d+|decision \d+/;
  const srcText = t => (state.showReq || !REF_RE.test(String(t || '')) ? String(t || '') : 'Methodology');
  const kv = (k, v) => `<div class="kv"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

  /* ------------------------------------------------------------------ chrome */
  const sectionById = id => SECTIONS.find(s => s.id === id);
  function appBar() {
    const sec = sectionById(state.section);
    const u = curUser();
    const initials = u.name.split(' ').map(x => x[0]).join('').slice(0, 2);
    return `<header class="appbar" role="banner">
      <div class="hamb-zone"><button type="button" class="ibtn ibtn-24" id="hamburger" data-act="drawer" aria-label="${state.drawerOpen ? 'Close navigation' : 'Open navigation'}" aria-expanded="${state.drawerOpen}" aria-controls="drawer">${icon('menu', 24)}</button></div>
      <div class="logo" aria-label="Beghou Arc"><span class="logo-word">BEGHOU</span><svg class="logo-spark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#E60F65"/></svg><span class="logo-word">ARC</span></div>
      <span class="ab-div" aria-hidden="true"></span>
      <div class="page-id" title="Field Sizing / ${esc(sec.label)}">Field Sizing / ${esc(sec.label)}</div>
      <div class="ab-right">
        <div class="ab-icons">
          ${['search:Search', 'bell:Notifications', 'waffle:App switcher', 'settings:Settings'].map(x => { const [ic, l] = x.split(':'); return `<button type="button" class="ibtn ibtn-24 ab-ic" data-act="chrome" data-arg="${l}" aria-label="${l}">${icon(ic, 24)}</button>`; }).join('')}
        </div>
        ${configButton()}${aiToggleHtml()}
        <span class="avatar" role="img" aria-label="Signed in as ${esc(u.name)}, ${esc(ROLE_LABEL[state.role])}" title="${esc(u.name)} · ${esc(ROLE_LABEL[state.role])}">${esc(initials)}</span>
      </div>
    </header>`;
  }
  const STAGE_TXT = { complete: 'Complete', open: 'In progress', locked: 'Locked', stale: 'Needs recalculation', recheck: 'Needs re-check' };
  function drawer() {
    return `<nav class="drawer${state.drawerOpen ? ' open' : ''}" id="drawer" aria-label="Field Sizing sections">
      <ul class="dr-list">${SECTIONS.map((s, i) => {
        const st = stageStatus(s.id), act = s.id === state.section;
        return `<li><a href="#${s.id}" class="dr-item${act ? ' active' : ''}${st === 'locked' ? ' is-locked' : ''}" data-act="nav" data-arg="${s.id}" ${act ? 'aria-current="page"' : ''}
          ${st === 'locked' ? `aria-disabled="true"` : ''} aria-label="${i + 1}. ${esc(s.label)} — ${STAGE_TXT[st]}" ${!state.drawerOpen ? `data-tip="${esc(s.label)}" data-tip-pos="right"` : ''}>
          <span class="dr-ic">${icon(st === 'locked' ? 'lock' : s.icon)}</span><span class="dr-lbl">${esc(s.label)}</span></a></li>`;
      }).join('')}</ul>
      <div class="dr-foot"><a href="#terms" class="dr-item" data-act="chrome" data-arg="Terms & Conditions" aria-label="Terms &amp; Conditions" ${!state.drawerOpen ? 'data-tip="Terms &amp; Conditions" data-tip-pos="right"' : ''}><span class="dr-ic">${icon('terms')}</span><span class="dr-lbl">Terms &amp; Conditions</span></a></div>
    </nav>
    <div class="backdrop${state.drawerOpen ? ' show' : ''}" data-act="drawer" aria-hidden="true"></div>`;
  }
  /* FR-30: position in the workflow and which stages remain incomplete. */
  function stepper() {
    const idx = SECTIONS.findIndex(s => s.id === state.section);
    const remaining = SECTIONS.filter(s => stageStatus(s.id) !== 'complete').length;
    return `<nav class="stepper" aria-label="Workflow progress">
      <p class="stepper-sum">${rq('FR-30')}Step ${idx + 1} of ${SECTIONS.length} · ${esc(SECTIONS[idx].label)} <span class="muted">· ${remaining === 0 ? 'all stages complete' : `${remaining} ${remaining === 1 ? 'stage' : 'stages'} incomplete`}</span></p>
      <ol class="steps">${SECTIONS.map((s, i) => {
        const st = stageStatus(s.id), cur = i === idx;
        const ic = st === 'complete' ? 'check' : st === 'locked' ? 'lock' : st === 'stale' || st === 'recheck' ? 'warn' : cur ? 'dot' : 'circle';
        return `<li class="step st-${st}${cur ? ' current' : ''}"><button type="button" class="step-btn" data-act="nav" data-arg="${s.id}" ${cur ? 'aria-current="step"' : ''} ${st === 'locked' ? 'aria-disabled="true"' : ''}
          aria-label="Step ${i + 1}, ${esc(s.label)}: ${STAGE_TXT[st]}">
          <span class="step-ic">${icon(ic, 14)}</span><span class="step-txt"><span class="step-lbl">${esc(s.label)}</span><span class="step-st">${STAGE_TXT[st]}</span></span></button></li>`;
      }).join('')}</ol></nav>`;
  }

  /* ------------------------------------------------------------------ toasts (top centre, max 3) */
  const toasts = [];
  let toastSeq = 0;
  const toastQueue = [];
  function toast(text, kind = 'base') {
    if (state.dialog) { toastQueue.push([text, kind]); return; }
    const id = ++toastSeq;
    const live = document.getElementById('toast-live'); if (live) live.textContent = text;
    toasts.unshift({ id, text, kind });
    while (toasts.length > 3) toasts.pop();
    renderToasts();
    setTimeout(() => { const i = toasts.findIndex(t => t.id === id); if (i >= 0) { toasts.splice(i, 1); renderToasts(); } }, 4000);
  }
  function renderToasts() {
    const host = document.getElementById('toasts');
    if (!host) return;
    if (state.dialog) { host.innerHTML = ''; return; }
    const ic = { base: 'info', success: 'ok', warning: 'warn', error: 'error', info: 'info' };
    host.innerHTML = toasts.map(t => `<div class="toast toast-${t.kind}">${icon(ic[t.kind], 16)}<span class="toast-txt">${esc(t.text)}</span>
      <button type="button" class="toast-x" data-toast="${t.id}" aria-label="Dismiss notification">${icon('x', 16)}</button></div>`).join('');
  }

  /* ------------------------------------------------------------------ render loop */
  function focusKey(a) {
    if (!a || a === document.body) return null;
    if (a.id) return '#' + CSS.escape(a.id);
    if (a.dataset && a.dataset.act) return `[data-act="${a.dataset.act}"][data-arg="${CSS.escape(a.dataset.arg || '')}"]`;
    if (a.name && a.type === 'radio') return `input[name="${CSS.escape(a.name)}"][value="${CSS.escape(a.value)}"]`;
    return null;
  }
  function captureFocus() {
    const a = document.activeElement;
    const key = focusKey(a);
    if (!key) return null;
    const f = { key };
    try { if (typeof a.selectionStart === 'number') { f.s = a.selectionStart; f.e = a.selectionEnd; } } catch (e) { /* not a text input */ }
    return f;
  }
  function restoreFocus(f) {
    if (!f) return;
    let el = null; try { el = document.querySelector(f.key); } catch (e) { el = null; }
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (f.s != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(f.s, f.e); } catch (e) { /* ignore */ }
  }
  let pendingFocus = null;
  const focusAfter = id => { pendingFocus = id; };
  let pendingRender = false, pointerDown = false;
  /* Commit-time re-render is deferred until focus has moved (Tab) or the click has landed (pointer), so neither is lost. */
  function renderSoon() {
    pendingRender = true;
    if (!pointerDown) setTimeout(() => { if (pendingRender) render(); }, 0);
  }
  function render() {
    pendingRender = false;
    closeListbox(true); hideTip();
    Object.keys(dd).forEach(k => delete dd[k]);
    const root = document.getElementById('app');
    const f = captureFocus();
    const sec = sectionById(state.section);
    let view = '';
    try { view = VIEWS[state.section](); } catch (e) { view = msg('error', esc(e && e.message ? e.message : String(e)), { title: 'This view failed to render' }); if (W.console) console.error(e); }
    document.body.classList.toggle('show-req', state.showReq);
    root.innerHTML = appBar() + drawer() + `<main id="main" class="main" tabindex="-1">
        <div class="content"><div class="sticky-top">${stepper()}<div id="toasts" class="toasts"></div></div><p class="page-sub">${esc(sec.id === 'setup' && aiOn() ? AI_SETUP_SUB : sec.sub)}</p>${readOnly() ? msg('neutral', 'You are viewing as <strong>Administrator</strong>. Administrators can view every project but cannot edit inputs or approve (approval rights are TBD in the PRD). Switch role on Review and Export.') : ''}${view}</div>
        <footer class="foot"><span>All data shown is synthetic for demonstration purposes.</span><button type="button" class="switch" role="switch" id="show-req" aria-checked="${state.showReq}" data-act="showReq"><span class="sw-track" aria-hidden="true"><span class="sw-txt">${state.showReq ? 'ON' : 'OFF'}</span><span class="sw-thumb"></span></span><span class="sw-lbl">Show requirement IDs</span></button></footer></main>` + dialogHtml();
    if (pendingFocus) { const el = document.getElementById(pendingFocus); pendingFocus = null; if (el) el.focus(); else restoreFocus(f); }
    else restoreFocus(f);
    aiDecorate();
    if (state.dialog) setupDialogFocus();
    renderToasts();
  }
  const VIEWS = {};

  /* ================================================================== 1. PROJECT AND INPUT */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // Calendar-date check without timezone round-trips: parse and compare in UTC so the result is
  // the same in every browser time zone (local-midnight + toISOString shifted the day east of UTC).
  const validDate = s => {
    if (!DATE_RE.test(s || '')) return false;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  };
  function projectErrors() {
    const p = state.project, e = {};
    if (!p.name.trim()) e.name = 'This field is required';
    if (!p.client.trim()) e.client = 'This field is required';
    if (!p.brand.trim()) e.brand = 'This field is required';
    if (!p.planningPeriod.start) e.start = 'This field is required'; else if (!validDate(p.planningPeriod.start)) e.start = 'Enter a valid date (YYYY-MM-DD)';
    if (!p.planningPeriod.end) e.end = 'This field is required'; else if (!validDate(p.planningPeriod.end)) e.end = 'Enter a valid date (YYYY-MM-DD)';
    if (!e.start && !e.end && p.planningPeriod.end <= p.planningPeriod.start) e.end = 'End date must be after the start date';
    return e;
  }
  function blankRow(label) {
    return { segment: String(label), archetype: null, entities: null, compositeValue: null, reachPct: null, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
  }

  VIEWS.setup = function () {
    if (aiOn() && state.ai.flow && state.ai.flow.open) return aiIntakeView();
    if (aiEntryOnly()) return aiEntryCards();
    const showErr = !!state.checkRuns.inputs;
    const pe = showErr ? projectErrors() : {};
    const p = state.project;
    const intro = !state.project.name && !state.segments.length
      ? msg('neutral', 'New to field sizing? Load a complete synthetic project to see how every step fits together. You can change anything afterwards.', { actions: btn({ label: 'Load synthetic sample project', act: 'loadSample', kind: 'outline', ic: 'file', id: 'load-sample' }) + (SAMPLE && SAMPLE.multiSpecialty ? btn({ label: 'Load multi-specialty synthetic sample', act: 'loadSampleMulti', kind: 'text', ic: 'file', id: 'load-sample-multi' }) : '') + presetSampleBtn() })
      : '';
    const projectCard = card({
      id: 'c-project', step: 1, title: 'Project', sub: 'Who and what this sizing is for. The grain applies to every step and label.',
      body: `<div class="grid g3">
        ${textInput({ id: 'p-name', bind: 'project.name', value: p.name, label: 'Project name', error: pe.name })}
        ${textInput({ id: 'p-client', bind: 'project.client', value: p.client, label: 'Client', error: pe.client })}
        ${textInput({ id: 'p-brand', bind: 'project.brand', value: p.brand, label: 'Brand or product', error: pe.brand, hint: 'Used in default scenario names.' })}
        ${textInput({ id: 'p-start', bind: 'project.planningPeriod.start', value: p.planningPeriod.start, label: 'Planning period start', placeholder: 'YYYY-MM-DD', error: pe.start, hint: 'Use YYYY-MM-DD.' })}
        ${textInput({ id: 'p-end', bind: 'project.planningPeriod.end', value: p.planningPeriod.end, label: 'Planning period end', placeholder: 'YYYY-MM-DD', error: pe.end, hint: 'Use YYYY-MM-DD.' })}
        ${radioGroup({ name: 'grain', label: 'Sizing grain', value: p.grain, onAct: 'grain', inline: true, options: Object.keys(F.GRAIN).map(g => ({ value: g, label: g === 'hcp' ? 'HCP' : cap(F.GRAIN[g].one) })) })}
      </div>
      <div class="sep"></div>
      ${disclosure({ id: 'notes', act: 'toggleNotes', open: state.ui.notesOpen, label: 'Data notes: assumptions, limitations and exclusions', body: `<p class="hint mb8">Recorded against the project and carried into the export${rq('FR-02, FR-40')}.</p><div class="grid g3">
        ${textArea({ id: 'n-assumptions', bind: 'project.dataNotes.assumptions', value: p.dataNotes.assumptions, label: 'Data assumptions', optional: true })}
        ${textArea({ id: 'n-limitations', bind: 'project.dataNotes.limitations', value: p.dataNotes.limitations, label: 'Known limitations', optional: true })}
        ${textArea({ id: 'n-exclusions', bind: 'project.dataNotes.exclusions', value: p.dataNotes.exclusions, label: 'Exclusions', optional: true })}</div>` })}`
    });

    const methodCard = card({
      id: 'c-method', step: 2, title: 'Sizing method', sub: aiOn() ? AI_METHOD_SUB : 'Choose this before loading data: the method decides which columns and assumptions you will need. It is never inferred from the data.',
      body: `<div class="methods" role="radiogroup" aria-labelledby="c-method-h">${METHOD_IDS.map((m, i) => {
        const M = F.METHODS[m], sel = method() === m;
        const tab = sel || (!method() && i === 0) ? 0 : -1;
        return `<button type="button" class="mcard${sel ? ' selected' : ''}" role="radio" aria-checked="${sel}" tabindex="${tab}" id="method-${m}" data-act="method" data-arg="${m}" ${readOnly() ? 'aria-disabled="true"' : ''}>
          <span class="mcard-h"><span class="mcard-t">${esc(M.label)}</span>${sel ? chip('Selected', 'chip-selected', 'check') : ''}</span>
          <span class="mcard-l">Answers</span><span class="mcard-q">${esc(M.question)}</span>
          <span class="mcard-l">Needs</span><span class="mcard-n">${esc(M.needs)}</span></button>`;
      }).join('')}</div>
      ${showErr && !method() ? '<div class="err">Choose a sizing method.</div>' : ''}`
    });
    return aiEntryCards() + intro + projectCard + methodCard + dataCard() + inputsCheckCard();
  };

  function requiredColumnsText(m) {
    const lab = ids => ids.map(id => MAP_FIELD(id).label).join(', ');
    return `<ul class="req-list"><li><strong>Segment summary rows:</strong> ${esc(lab(F.requiredMapping(m, 'summary')))}</li>
      <li><strong>Entity rows (one per ${esc(grainOne(state.project.grain))}):</strong> ${esc(lab(F.requiredMapping(m, 'entity')))}</li></ul>`;
  }

  function dataCard() {
    const m = method();
    if (!m) return card({ id: 'c-data', step: 3, title: 'Segment data', sub: 'Upstream Segmentation & Targeting output, by file upload.', body: msg('neutral', 'Choose a sizing method first. It decides which columns the data needs.') });
    const fl = state.importFlow;
    const hasData = state.segments.length > 0;
    const prov = state.provenance;
    const src = hasData && prov ? `<p class="src-line">${icon('file')}<span>${prov.path === 'file' ? `Loaded from <strong>${esc(prov.fileName)}</strong> · sheet ${esc(prov.sheet)} · ${plural(prov.rowCount, 'row')} · ${prov.inputGrain === 'entity' ? 'entity rows' : 'segment summary'} · ${fmtTime(prov.importedAt)}` : `Synthetic sample data · ${plural(state.segments.length, 'segment')}`}</span></p>` : '';
    const dis = readOnly();
    /* CS-6 (D17): data arrives by upload only; the synthetic samples stay for demonstration. No manual entry grid. */
    const importPane = `<div class="pane" aria-labelledby="pane-import-h"><h3 class="pane-h" id="pane-import-h">${icon('upload')}<span>Import a file</span></h3>
      <p class="pane-sub">Upload the Segmentation &amp; Targeting extract. The HCP-level template is preferred; Affordable Coverage rolls it up to deciles. You confirm the sheet, header row and column mapping before anything is imported.</p>
      <div class="dropzone${dis ? ' is-disabled' : ''}" id="dropzone" data-drop="1">
        ${icon('upload', 24)}
        <p class="dz-main">Drag and drop a file here, or</p>
        <button type="button" class="btn btn-base" id="select-files" data-act="pickFile" ${dis ? 'aria-disabled="true"' : ''}>Select files…</button>
        <p class="dz-sub">Excel (.xlsx, .xlsm) or CSV. Legacy .xls and .xlsb files: save as .xlsx first.</p>
      </div>
      ${disclosure({ id: 'reqcols', act: 'toggleReqCols', open: !!state.ui.reqColsOpen, label: `Columns ${methodLabel(m)} needs`, body: requiredColumnsText(m) })}
    </div>`;
    const samplePane = `<div class="pane" aria-labelledby="pane-sample-h"><h3 class="pane-h" id="pane-sample-h">${icon('file')}<span>Use synthetic sample data</span></h3>
      <p class="pane-sub">For demonstration only. The sample files go through the same import steps as an upload.</p>
      <div class="pane-actions pane-stack">${btn({ label: 'Use a synthetic sample file', act: 'sampleFile', arg: 'summary', kind: 'text', ic: 'file', id: 'sample-file' })}
        ${m === 'response' ? btn({ label: 'Use a synthetic entity file', act: 'sampleFile', arg: 'entity', kind: 'text', ic: 'file', id: 'sample-entity' }) : ''}
        ${btn({ label: 'Sample file with row errors', act: 'sampleFile', arg: 'errors', kind: 'text', ic: 'warn', id: 'sample-errors' })}
        ${btn({ label: 'Load synthetic sample values', act: 'manualSample', kind: 'text', ic: 'file', id: 'manual-sample', reason: dis ? 'Read-only role' : '' })}</div>
      <p class="hint">Segment values are never typed or corrected here. Data defects go back to Segmentation &amp; Targeting.</p>
    </div>`;
    let below = '';
    if (fl) below = importWizard();
    else if (hasData) below = loadedDataTable();
    return card({
      id: 'c-data', step: 3, title: 'Segment data', sub: 'Upstream Segmentation & Targeting output. Field Sizing consumes it; it never builds the universe, segments or scores.',
      body: `${src}<p class="hint">${icon('info', 14)} The brand forecast and value assumptions (carryover, other channels, Salesforce-impactable share) are entered on the next step, Model Assumptions.</p><div class="panes">${importPane}<div class="pane-or" aria-hidden="true"><span>or</span></div>${samplePane}</div>${below}`
    });
  }

  /* ---------- import wizard ---------- */
  function mappingFieldsFor(m, grain, alloc) {
    const req = F.requiredMapping(m, grain);
    const segIds = new Set(F.segmentFieldsFor(m, alloc === undefined ? allocation() : alloc, grain).map(f => f.id));
    const base = F.MAPPING_FIELDS.filter(f => {
      if (req.includes(f.id)) return true;
      if (f.grain && f.grain !== grain) return false;
      if (f.methods && !f.methods.includes(m)) return false;
      if (f.id === 'specialty') return true;   // CS-3: optional, auto-detected, every method and input level
      if (f.optional && f.grain) return true;
      if (['entityId', 'value', 'archetype'].includes(f.id)) return false;
      if (grain === 'entity' && ['entities', 'compositeValue'].includes(f.id)) return false;
      return segIds.has(f.id);
    }).map(f => Object.assign({}, f, { required: req.includes(f.id) }));
    return base;
  }
  const flowSheet = () => state.importFlow.sheets[state.importFlow.sheetIndex];
  const headerCells = () => (flowSheet().rows[state.importFlow.headerRow] || []).map((c, i) => (c === '' || c == null ? `Column ${i + 1}` : String(c)));
  function confText(fid) {
    const fl = state.importFlow;
    if (fl.mapping[fid] == null) return `<span class="conf conf-none">${icon('circle', 14)}Not mapped</span>`;
    if (fl.manual[fid]) return `<span class="conf conf-user">${icon('user', 14)}Set by you</span>`;
    const c = fl.confidence[fid] || 0;
    const band = c >= 0.85 ? ['High', 'conf-high', 'ok'] : c >= 0.6 ? ['Medium', 'conf-med', 'warn'] : ['Low', 'conf-low', 'warn'];
    return `<span class="conf ${band[1]}">${icon(band[2], 14)}${band[0]} (${Math.round(c * 100)}%)</span>`;
  }
  function mappingIssues() {
    const fl = state.importFlow, m = method();
    const fields = mappingFieldsFor(m, fl.inputGrain);
    const missing = fields.filter(f => f.required && fl.mapping[f.id] == null);
    const used = {};
    fields.forEach(f => { const c = fl.mapping[f.id]; if (c != null && !(f.id === 'specialty' && fl.tabsOn)) (used[c] = used[c] || []).push(f.label); });
    const dups = Object.keys(used).filter(k => used[k].length > 1).map(k => `${headerCells()[k]} is mapped to ${used[k].join(' and ')}`);
    return { fields, missing, dups };
  }
  function importWizard() {
    const fl = state.importFlow;
    const steps = [['source', 'Sheet, header and grain'], ['mapping', 'Map columns'], ['preview', 'Preview and validate']];
    const cur = steps.findIndex(s => s[0] === fl.step);
    const ind = `<ol class="wiz-steps" aria-label="Import steps">${steps.map((s, i) => `<li class="${i < cur ? 'done' : i === cur ? 'current' : ''}" ${i === cur ? 'aria-current="step"' : ''}>${icon(i < cur ? 'check' : i === cur ? 'dot' : 'circle', 14)}<span>${i + 1}. ${s[1]}</span></li>`).join('')}</ol>`;
    let body = '', next = '';
    if (fl.error) body = msg('error', esc(fl.error), { title: 'This file could not be read' });
    else if (fl.step === 'source') { body = wizSource(); next = btn({ label: 'Next: map columns', act: 'wizGo', arg: 'mapping', kind: 'primary', id: 'wiz-next', ic: 'chevRight' }); }
    else if (fl.step === 'mapping') {
      body = wizMapping();
      const mi = mappingIssues();
      const reason = mi.missing.length ? `Map the required ${mi.missing.length === 1 ? 'column' : 'columns'}: ${mi.missing.map(f => f.label).join(', ')}` : !fl.reviewed ? 'Confirm that you have reviewed the mapping' : '';
      next = btn({ label: 'Next: preview', act: 'wizGo', arg: 'preview', kind: 'primary', id: 'wiz-next', ic: 'chevRight', reason });
    } else { body = wizPreview(); const n = (fl.applied.errors || []).length; next = btn({ label: `Import ${plural(fl.applied.rowCount, 'row')}`, act: 'wizImport', kind: 'primary', id: 'wiz-import', ic: 'check', reason: n ? `Resolve the ${plural(n, 'error')} first: fix the source file and upload it again, or adjust the mapping` : '' }); }
    const back = fl.step !== 'source' && !fl.error ? btn({ label: 'Back', act: 'wizGo', arg: steps[cur - 1][0], kind: 'outline', id: 'wiz-back', ic: 'chevLeft' }) : '';
    return `<section class="wizard" aria-labelledby="wiz-h"><div class="wiz-head"><h3 class="pane-h" id="wiz-h">${icon('file')}<span>Importing ${esc(fl.fileName)}</span></h3>${ind}</div>
      ${body}
      <div class="wiz-foot">${btn({ label: 'Cancel import', act: 'wizCancel', kind: 'text', id: 'wiz-cancel', ic: 'x' })}<span class="grow"></span>${back}${next}</div></section>`;
  }
  function wizSource() {
    const fl = state.importFlow, sh = flowSheet();
    const rows = sh.rows.slice(0, 8);
    const width = Math.min(8, Math.max(...rows.map(r => r.length), 1));
    return `<div class="grid g3">
      ${dropdown({ id: 'wiz-sheet', label: 'Sheet', value: fl.sheetIndex, options: fl.sheets.map((s, i) => ({ value: i, label: `${s.name} (${plural(s.rows.length, 'row')})` })), onSelect: v => { wizSetSheet(v); } })}
      ${dropdown({ id: 'wiz-header', label: 'Header row', value: fl.headerRow, hint: `Detected: row ${fl.detectedHeader + 1}. Rows above the header are ignored.`, options: sh.rows.slice(0, 10).map((r, i) => ({ value: i, label: `Row ${i + 1}: ${r.filter(c => c !== '' && c != null).slice(0, 3).join(', ') || '(blank)'}` })), onSelect: v => { fl.headerRow = v; fl.reviewed = false; render(); } })}
      ${radioGroup({ name: 'wiz-grain', label: 'Input grain', value: fl.inputGrain, onAct: 'wizGrain', hint: `Detected: ${fl.detectedGrain === 'entity' ? 'entity rows' : 'segment summary'}.`, options: [{ value: 'summary', label: 'Segment summary (one row per decile)' }, { value: 'entity', label: `Entity rows (one row per ${grainOne(state.project.grain)})` }] })}
    </div>
    ${fl.tabs ? `<div class="mt16">${radioGroup({ name: 'wiz-tabs', label: 'Specialty', value: fl.tabsOn ? 'tabs' : 'single', onAct: 'wizTabs', describe: true,
      hint: `Detected: ${plural(fl.tabs.length, 'sheet')} with the same columns (${esc(fl.tabs.join(', '))}).`, options: [
        { value: 'tabs', label: `One specialty per sheet (${plural(fl.tabs.length, 'sheet')})`, desc: `Stacks ${fl.tabs.join(', ')}; each sheet name becomes the specialty, so segments are specialty × decile.` },
        { value: 'single', label: 'Only this sheet, no specialty from sheet names', desc: `Reads ${flowSheet().name} alone.` }] })}</div>` : ''}
    <p class="lbl mt16">First rows of the sheet</p>
    <div class="grid-wrap"><table class="grid-t"><thead><tr><th scope="col" class="num">Row</th>${Array.from({ length: width }, (_, i) => `<th scope="col">Col ${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i === fl.headerRow ? 'is-header' : i < fl.headerRow ? 'is-skipped' : ''}"><td class="num">${i + 1}${i === fl.headerRow ? ' <span class="sr-only">(header row)</span>' : ''}</td>${Array.from({ length: width }, (_, c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${icon('info', 14)} The highlighted row is used as column headers.</p>`;
  }
  function wizMapping() {
    const fl = state.importFlow, heads = headerCells();
    const mi = mappingIssues();
    const data = flowSheet().rows.slice(fl.headerRow + 1, fl.headerRow + 4);
    const opts = [{ value: null, label: 'Not mapped' }].concat(heads.map((h, i) => ({ value: i, label: h })));
    return `<p class="pane-sub">We matched the file's columns to the fields ${esc(methodLabel(method()))} needs. Check each one, then confirm. Nothing is imported until you do.</p>
      <div class="grid-wrap"><table class="grid-t map-t"><thead><tr><th scope="col">Model field</th><th scope="col">Source column</th><th scope="col">Detection</th><th scope="col">First values</th></tr></thead>
      <tbody>${mi.fields.map(f => {
        if (f.id === 'specialty' && fl.tabsOn && fl.tabs) return `<tr><th scope="row" class="rowh">${esc(f.label)} ${chip('Optional', 'chip-outline chip-sm')}</th><td>Sheet names (one specialty per sheet)</td><td><span class="conf conf-high">${icon('ok', 14)}From the sheet step</span></td><td class="muted">${esc(fl.tabs.join(', '))}</td></tr>`;
        const c = fl.mapping[f.id];
        const err = f.required && c == null;
        return `<tr><th scope="row" class="rowh">${esc(f.label)} ${f.required ? badge('Required', 'badge-primary') : chip('Optional', 'chip-outline chip-sm')}</th>
          <td class="cell-in">${dropdown({ id: `map-${f.id}`, ariaLabel: `Source column for ${f.label}`, value: c == null ? null : c, options: opts, compact: true, error: err ? 'x' : '', onSelect: v => { fl.mapping[f.id] = v; if (v == null) delete fl.mapping[f.id]; fl.manual[f.id] = true; fl.reviewed = false; render(); } })}</td>
          <td>${confText(f.id)}</td><td class="muted">${c == null ? '—' : esc(data.map(r => r[c]).filter(v => v !== '' && v != null).join(', '))}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${mi.missing.length ? `<div class="err" role="alert">${icon('error', 14)} Required and not mapped: ${esc(mi.missing.map(f => f.label).join(', '))}</div>` : ''}
      ${mi.dups.length ? msg('warning', esc(mi.dups.join('; ')) + '. Each column should feed one field.') : ''}
      <div class="mt16">${checkbox({ id: 'wiz-reviewed', label: 'I have reviewed this column mapping', checked: fl.reviewed, onAct: 'wizReviewed', disabled: mi.missing.length > 0 })}</div>`;
  }
  function wizPreview() {
    const fl = state.importFlow, ap = fl.applied, heads = headerCells();
    const fields = mappingFieldsFor(method(), fl.inputGrain).filter(f => fl.mapping[f.id] != null);
    const rows = flowSheet().rows.slice(fl.headerRow + 1).filter(r => r.some(c => c !== '' && c != null)).slice(0, 5);
    const errs = ap.errors || [], warns = ap.warnings || [];
    const apSpec = specialtiesOf(ap.segments || []);
    const summary = `<div class="stat-row">${[
      ['Rows read', fmt.int(ap.rowCount)], ...(apSpec.length ? [['Specialties', fmt.int(apSpec.length)]] : []), ['Segments', fmt.int((ap.segments || []).length)],
      ...(ap.entities ? [['Entity rows', fmt.int(ap.entities.length)]] : []),
      ['Errors', fmt.int(errs.length)], ['Warnings', fmt.int(warns.length)]].map(([k, v]) => `<div class="stat"><span class="stat-k">${k}</span><span class="stat-v">${v}</span></div>`).join('')}</div>`;
    const g = state.project.grain;
    let preview;
    if (ap.entities && ap.entities.length) {
      const ecols = [['id', MAP_FIELD('entityId').label, e => esc(e.id)], ['segment', MAP_FIELD('segment').label, e => esc(e.segment)]];
      if (fl.mapping.value != null) ecols.push(['value', MAP_FIELD('value').label, e => fmt.num1(e.value)]);
      if (fl.mapping.archetype != null) ecols.push(['archetype', MAP_FIELD('archetype').label, e => esc(e.archetype || '—')]);
      preview = `<p class="lbl mt16">Preview: first 5 rows as they will be imported</p><div class="grid-wrap"><table class="grid-t"><thead><tr>${ecols.map(c => `<th scope="col">${esc(c[1])}</th>`).join('')}</tr></thead>
        <tbody>${ap.entities.slice(0, 5).map(e => `<tr>${ecols.map(c => `<td>${c[2](e)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else {
      const sf = F.segmentFieldsFor(method(), allocation(), 'summary', { includeOptional: apSpec.length > 0 }).filter(f => f.owner === 'upstream' || fields.some(x => x.id === f.id));
      const cell = (f, sg) => f.id === 'archetypeMix' ? (sg.archetypeMix ? esc(mixText(sg.archetypeMix)) : '—') : apSpec.length && f.id === 'segment' ? esc(decileOf(sg)) : f.unit === 'text' ? esc(sg[f.id]) : f.unit === 'percent' ? fmt.pct(sg[f.id]) : fmt.num1(sg[f.id]);
      const hl = f => (apSpec.length && f.id === 'segment' ? 'Decile' : f.label(g));
      preview = `<p class="lbl mt16">Preview: first 5 rows as they will be imported (values normalised, reach as %)</p><div class="grid-wrap"><table class="grid-t"><thead><tr>${sf.map(f => `<th scope="col" class="${f.unit === 'text' || f.unit === 'mix' ? '' : 'num'}">${esc(hl(f))}</th>`).join('')}</tr></thead>
        <tbody>${(ap.segments || []).slice(0, 5).map(sg => `<tr>${sf.map(f => `<td class="${f.unit === 'text' || f.unit === 'mix' ? '' : 'num'}">${cell(f, sg)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (errs.length) preview += `<p class="hint">${icon('info', 14)} Rows with errors are not shown in the preview; every one is listed below.</p>`;
    void rows; void heads;
    const errTable = errs.length ? `<div class="mt16">${msg('error', `${plural(errs.length, 'row-level error')} found. Nothing has been dropped or imported. Fix the source file and upload it again, or go back and adjust the mapping.`, { title: 'Import blocked' })}</div>
      <div class="grid-wrap"><table class="grid-t"><thead><tr><th scope="col">Where</th><th scope="col">Problem</th>${state.showReq ? '<th scope="col">Code</th>' : ''}</tr></thead>
      <tbody>${errs.map(e => `<tr><td>${esc(prettyPath(e.path, e.label))}</td><td>${esc(e.message)}</td>${state.showReq ? `<td class="muted mono">${esc(e.code)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : `<div class="mt16">${msg('success', `All ${plural(ap.rowCount, 'row')} passed import validation.`)}</div>`;
    const warnList = warns.length ? `<div class="mt8">${msg('warning', `<ul class="plain">${warns.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul>`, { title: 'Warnings (import can continue)' })}</div>` : '';
    return summary + preview + errTable + warnList;
  }
  function prettyPath(p, lbl) {
    const s = String(p || '');
    const m = s.match(/rows?[\[ ](\d+)\]?\.?([\w.]*)/);
    if (m) { const f = MAP_FIELD(m[2]); return `Row ${m[1]}${f ? ' · ' + f.label : lbl ? ' · ' + lbl : ''}`; }
    const mm = s.match(/^mapping\.([\w.]+)/);
    if (mm) { const f = MAP_FIELD(mm[1]); return `Mapping · ${f ? f.label : 'column'}`; }
    return lbl || (state.showReq ? s : 'File');
  }

  /* ---------- loaded data (upstream fields) ---------- */
  function mixText(mix) {
    if (!mix) return '';
    return segArchetypes().map(a => `${a} ${fmt.num1(mix[a] || 0)}%`).join(' · ');   // FR-47: the archetypes in the data
  }
  const archPicker = (m, i, s) => m === 'response' && state.inputGrain === 'summary';
  const archText = s => (s.archetypeMix ? mixText(s.archetypeMix) : s.archetype || 'Not supplied');
  /* CS-6: read-only data summary. Tabs: All (one row per specialty, plus the total) and one tab per specialty (its deciles).
     Without a specialty the deciles are shown directly. Values are shown as received; nothing here is editable. */
  const dataTab = () => { const t = state.ui.dataSpec; return t != null && specOn() && specialtiesOf().includes(t) ? t : null; };
  function specTabs(prefix, act, cur, sps, label) {
    return `<div class="tabs spec-tabs" role="tablist" aria-label="${esc(label)}">${[null].concat(sps).map((sp, k) => { const sel = sp === cur;
      return `<button type="button" role="tab" class="tab${sel ? ' selected' : ''}" id="${prefix}-${sp == null ? 'all' : k - 1}" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" data-act="${act}" data-arg="${sp == null ? '' : k - 1}">${esc(sp == null ? 'All specialties' : specLabel(sp))}</button>`; }).join('')}</div>`;
  }
  function loadedDataTable() {
    const g = state.project.grain, m = method();
    const spec = specOn(), sps = spec ? specialtiesOf() : [], tab = spec ? dataTab() : null;
    const withValue = m !== 'workload';
    const hasArch = archPicker(m);
    const rows = state.segments;
    const tot = rows.reduce((a, s) => a + (isNum(s.entities) ? s.entities : 0), 0);
    const sumOf = (list, k) => list.reduce((a, s) => a + (isNum(s[k]) ? s[k] : 0), 0);
    let table;
    if (spec && tab == null) {
      const body = sps.map(sp => { const list = rows.filter(s => s.specialty === sp);
        return `<tr><th scope="row" class="rowh">${esc(specLabel(sp))}</th><td class="num">${fmt.int(list.length)}</td><td class="num">${fmt.int(sumOf(list, 'entities'))}</td>${withValue ? `<td class="num">${fmt.num1(sumOf(list, 'compositeValue'))}</td>` : ''}</tr>`; }).join('');
      table = `<table class="grid-t data-t"><thead><tr><th scope="col">Specialty</th><th scope="col" class="num">Deciles</th><th scope="col" class="num">${esc(SEG_FIELD('entities').label(g))}</th>${withValue ? `<th scope="col" class="num">${esc(SEG_FIELD('compositeValue').label(g))}</th>` : ''}</tr></thead>
        <tbody>${body}</tbody><tfoot><tr><th scope="row" class="rowh">Total</th><td class="num">${fmt.int(rows.length)}</td><td class="num">${fmt.int(tot)}</td>${withValue ? `<td class="num">${fmt.num1(sumOf(rows, 'compositeValue'))}</td>` : ''}</tr></tfoot></table>`;
    } else {
      const list = rows.filter(s => tab == null || s.specialty === tab);
      const body = list.map(s => `<tr><th scope="row" class="rowh">${esc(spec ? decileOf(s) : s.segment)}</th><td class="num">${fmt.int(s.entities)}</td>${withValue ? `<td class="num">${fmt.num1(s.compositeValue)}</td>` : ''}${hasArch ? `<td>${esc(archText(s))}</td>` : ''}</tr>`).join('');
      table = `<table class="grid-t data-t"><thead><tr><th scope="col">${spec ? 'Decile' : esc(SEG_FIELD('segment').label(g))}</th><th scope="col" class="num">${esc(SEG_FIELD('entities').label(g))}</th>${withValue ? `<th scope="col" class="num">${esc(SEG_FIELD('compositeValue').label(g))}</th>` : ''}${hasArch ? `<th scope="col">${esc(SEG_FIELD('archetypeMix').label(g))}</th>` : ''}</tr></thead>
        <tbody>${body}</tbody>${spec ? `<tfoot><tr><th scope="row" class="rowh">Subtotal ${esc(specLabel(tab))}</th><td class="num">${fmt.int(sumOf(list, 'entities'))}</td>${withValue ? `<td class="num">${fmt.num1(sumOf(list, 'compositeValue'))}</td>` : ''}${hasArch ? '<td></td>' : ''}</tr></tfoot>` : ''}</table>`;
    }
    return `<div class="loaded"><div class="loaded-h"><h3 class="pane-h">${icon('table')}<span>Segment data ${upstreamBadge()}</span></h3>
      <span class="muted">${plural(rows.length, 'segment')}${spec ? ` (${plural(sps.length, 'specialty', 'specialties')})` : ''} · ${fmt.int(tot)} ${esc(grainMany(g))}${state.entities ? ` · ${plural(state.entities.length, 'entity row')}` : ''}</span></div>
      <p class="hint mb8">Read-only, as received from Segmentation &amp; Targeting${rq('FR-03, FR-07')}. Data defects go back upstream; they are not corrected here.${spec ? ' Each segment is one specialty and decile pair.' : ''}${hasArch ? ' Response Curve reads the curve archetypes supplied with the data.' : ''}</p>
      ${spec ? specTabs('data-tab', 'dataTab', tab, sps, 'Specialty') : ''}<div class="grid-wrap" ${spec ? 'role="tabpanel"' : ''}>${table}</div></div>`;
  }

  /* ---------- inputs checkpoint (FR-31) ---------- */
  /* After a correction: re-check upstream silently; keep Model Assumptions open if it still passes. */
  function revalidateUpstream() {
    if (!state.checkpoints.inputs) return;
    const v = safe(() => E.validate(buildInputs()), { errors: [] });
    if (!v.errors.some(e => issueStage(e) === 'inputs')) state.checkpoints.inputs = { sig: inputsSig(), at: state.checkpoints.inputs.at };
    else { state.checkpoints.inputs = null; toast('The corrected value fails the inputs check. Review it on Project and Input.', 'warning'); }
  }
  function runInputsCheck() {
    const issues = [];
    const pe = projectErrors();
    const lab = { name: 'Project name', client: 'Client', brand: 'Brand or product', start: 'Planning period start', end: 'Planning period end' };
    const tgt = { name: 'p-name', client: 'p-client', brand: 'p-brand', start: 'p-start', end: 'p-end' };
    Object.keys(pe).forEach(k => issues.push({ where: lab[k], message: pe[k], target: tgt[k] }));
    if (!method()) issues.push({ where: 'Sizing method', message: 'Choose a sizing method.', target: 'method-affordable' });
    if (!state.segments.length) issues.push({ where: 'Segment data', message: 'Import a file or enter segments manually.', target: 'select-files' });
    else if (method()) {
      const v = safe(() => E.validate(buildInputs()), { errors: [{ code: 'engine', path: '', message: 'Validation is unavailable.' }], warnings: [] });
      v.errors.filter(e => issueStage(e) === 'inputs').forEach(e => issues.push({ where: issueWhere(e), message: e.message }));
    }
    const at = nowIso();
    state.checkRuns.inputs = { at, issues };
    if (!issues.length) { state.checkpoints.inputs = { sig: inputsSig(), at }; audit('checkpoint', 'Inputs check passed'); }
    else { state.checkpoints.inputs = null; audit('checkpoint', `Inputs check failed: ${plural(issues.length, 'issue')}`); }
    return issues;
  }
  function checkList(issues) {
    return `<ul class="issues">${issues.map(i => `<li>${icon('error', 14)}<span><strong>${esc(i.where)}:</strong> ${esc(i.message)}</span>${i.target ? ` <button type="button" class="btn-text" data-act="focusField" data-arg="${i.target}">Go to field</button>` : ''}</li>`).join('')}</ul>`;
  }
  function inputsCheckCard() {
    const run = state.checkRuns.inputs;
    const passed = stageStatus('setup') === 'complete';
    const stale = !passed && state.checkpoints.inputs === null && run && !run.issues.length;
    let status;
    if (passed) status = msg('success', `Inputs check passed ${fmtTime(state.checkpoints.inputs.at)}. Model Assumptions is now available.`, { actions: btn({ label: 'Continue to Model Assumptions', act: 'nav', arg: 'assumptions', kind: 'primary', ic: 'chevRight', id: 'go-assumptions' }) });
    else if (run && run.issues.length) status = msg('error', checkList(run.issues), { title: `${plural(run.issues.length, 'item')} to resolve before continuing` });
    else if (run && !stale) status = msg('warning', 'Inputs changed since the last check. Run the check again.');
    else status = `<p class="muted">Checks the project details, the method choice and every upstream value the method needs. It must pass before Model Assumptions opens.</p>`;
    return card({
      id: 'c-incheck', title: 'Inputs check', sub: 'Validation checkpoint 1 of 2.',
      actions: rq('FR-31') + btn({ label: passed ? 'Run check again' : 'Run inputs check', act: 'runInputs', kind: passed ? 'outline' : 'primary', ic: 'check', id: 'run-inputs', reason: readOnly() ? 'Read-only role' : '' }),
      body: status
    });
  }

  /* ================================================================== 2. MODEL ASSUMPTIONS */
  function lockedView(id) {
    const back = id === 'assumptions' ? 'setup' : id === 'result' ? 'assumptions' : id === 'scenarios' ? 'result' : 'scenarios';
    return card({ body: msg('neutral', esc(lockReason[id]), { title: `${sectionById(id).label} is not available yet`, actions: btn({ label: `Go to ${sectionById(back).label}`, act: 'nav', arg: back, kind: 'primary', id: 'locked-go' }) }) });
  }
  function assumptionIssues() {
    const run = state.checkRuns.assumptions;
    const map = {};
    if (run) run.issues.forEach(x => { if (x.path) map[x.path] = x.message; });
    return map;
  }
  function liveCellError(s, fid) {
    const v = s[fid];
    if (fid === 'reachPct' && isNum(v) && (v < 0 || v > 100)) return 'Reach must be between 0% and 100%';
    if ((fid === 'maxCalls' || fid === 'minCalls' || fid === 'plannedCalls') && isNum(v) && (v < 0 || Math.round(v) !== v)) return 'Use a whole number of 0 or more';
    if (fid === 'minCalls' && isNum(v) && isNum(s.maxCalls) && v > s.maxCalls) return 'Minimum exceeds maximum';
    if (Number.isNaN(v)) return 'Enter a number';
    return '';
  }

  VIEWS.assumptions = function () {
    if (stageStatus('assumptions') === 'locked') return lockedView('assumptions');
    return aiReviewCard() + upstreamCard() + sharedCard() + methodCard() + sizingCard() + assumptionsCheckCard();
  };

  function upstreamCard() {
    const g = state.project.grain;
    const up = visibleFields().filter(f => f.owner === 'upstream');
    const spec = specOn(), sps = spec ? specialtiesOf() : [], tab = spec ? sizeTab() : null;
    /* F9 (v0.5 fix round): the table has the specialty tabs of the data page and shares the selected tab with Segment sizing
       controls. All specialties = one row per specialty (decile count and sums, as on the data page); a specialty tab = its deciles.
       CS-6 (v0.5): read-only, no in-app corrections (FR-07 amended). */
    const sumOf = (list, k) => list.reduce((a, s) => a + (isNum(s[k]) ? s[k] : 0), 0);
    const numCols = up.filter(f => f.id === 'entities' || f.id === 'compositeValue');
    let table;
    if (spec && tab == null) {
      const body = sps.map(sp => { const list = state.segments.filter(s => s.specialty === sp);
        return `<tr><th scope="row" class="rowh">${esc(specLabel(sp))}</th><td class="num">${fmt.int(list.length)}</td>${numCols.map(f => `<td class="num">${f.id === 'entities' ? fmt.int(sumOf(list, f.id)) : fmt.num1(sumOf(list, f.id))}</td>`).join('')}</tr>`; }).join('');
      table = `<table class="grid-t up-t"><thead><tr><th scope="col">Specialty</th><th scope="col" class="num">Deciles</th>${numCols.map(f => `<th scope="col" class="num">${esc(f.label(g))}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody><tfoot><tr><th scope="row" class="rowh">Total</th><td class="num">${fmt.int(state.segments.length)}</td>${numCols.map(f => `<td class="num">${f.id === 'entities' ? fmt.int(sumOf(state.segments, f.id)) : fmt.num1(sumOf(state.segments, f.id))}</td>`).join('')}</tr></tfoot></table>`;
    } else {
      const list = state.segments.filter(s => tab == null || s.specialty === tab);
      const body = list.map(s => `<tr>${up.map(f => {
        if (f.id === 'specialty') return '';
        if (f.id === 'segment') return `<th scope="row" class="rowh">${esc(spec ? decileOf(s) : s.segment)}</th>`;
        const shown = f.id === 'archetypeMix' ? (s.archetypeMix ? esc(mixText(s.archetypeMix)) : '<span class="muted">Not supplied</span>') : fmt.num1(s[f.id]);
        return `<td class="${f.id === 'archetypeMix' ? '' : 'num'}">${shown}</td>`;
      }).join('')}${archPicker(method()) ? `<td>${s.archetypeMix ? 'Mixed' : esc(s.archetype || 'Not set')}</td>` : ''}</tr>`).join('');
      table = `<table class="grid-t up-t"><thead><tr>${up.map(f => (f.id === 'specialty' ? '' : f.id === 'segment' ? `<th scope="col">${spec ? 'Decile' : esc(f.label(g))}</th>` : `<th scope="col" class="${f.id === 'archetypeMix' ? '' : 'num'}">${esc(f.label(g))}</th>`)).join('')}${archPicker(method()) ? '<th scope="col">Curve archetype</th>' : ''}</tr></thead>
        <tbody>${body}</tbody>${spec ? `<tfoot><tr><th scope="row" class="rowh">Subtotal ${esc(specLabel(tab))}</th>${up.filter(f => f.id !== 'specialty' && f.id !== 'segment').map(f => (f.id === 'entities' ? `<td class="num">${fmt.int(sumOf(list, f.id))}</td>` : f.id === 'compositeValue' ? `<td class="num">${fmt.num1(sumOf(list, f.id))}</td>` : '<td></td>')).join('')}${archPicker(method()) ? '<td></td>' : ''}</tr></tfoot>` : ''}</table>`;
    }
    const prov = state.provenance;
    return card({
      id: 'c-upstream', title: 'Upstream inputs', sub: `Owned by Segmentation & Targeting ${upstreamBadge()} Read-only. Values are used as received; a defect is fixed upstream and the file uploaded again.`,
      body: `${prov ? `<p class="src-line">${icon('file')}<span>${prov.path === 'file' ? `From ${esc(prov.fileName)} (${esc(prov.inputGrain === 'entity' ? 'entity rows' : 'segment summary')})` : 'Synthetic sample data'} · ${plural(state.segments.length, 'segment')}${state.entities ? ` · derived from ${plural(state.entities.length, 'entity row')}` : ''}</span></p>` : ''}
        ${spec ? `${specTabs('up-tab', 'sizeTab', tab, sps, 'Specialty')}<p class="hint mt8 mb8" id="upstream-filter">${icon('info', 14)} ${tab == null ? 'All specialties shows one row per specialty; open a specialty tab for its deciles.' : `Showing the ${plural(state.segments.filter(s => s.specialty === tab).length, 'decile')} of ${esc(specLabel(tab))}.`} The tab is shared with Segment sizing controls.</p>` : ''}
        <div class="grid-wrap"${spec ? ' role="tabpanel"' : ''}>${table}</div>`
    });
  }

  function sharedForEngine() { return buildInputs().shared; }
  function sharedCard() {
    const sh = state.shared, iss = assumptionIssues(), wl = method() === 'workload';
    const L = sh.layers || {};
    const cpc = isNum(sh.repCost) ? safe(() => E.costPerCall(sharedForEngine()), null) : null;   // no partial (manager-only) cost per call
    const costOn = !wl || state.workloadCost;
    const costFields = !costOn ? '' : sh.costMode === 'layers'
      ? `<div class="grid g3">${numInput({ id: 'sh-rep', bind: 'shared.repCost', value: sh.repCost, label: 'Annual cost per rep (rep only)', prefix: '$', big: true, error: iss['shared.repCost'] })}
          ${numInput({ id: 'sh-flmspan', bind: 'shared.layers.flmSpan', value: L.flmSpan, label: 'Reps per first-line manager', error: iss['shared.layers'] ? ' ' : '' })}
          ${numInput({ id: 'sh-flmcost', bind: 'shared.layers.flmCost', value: L.flmCost, label: 'Annual cost per first-line manager', prefix: '$', big: true })}
          ${numInput({ id: 'sh-slmspan', bind: 'shared.layers.slmSpan', value: L.slmSpan, label: 'First-line managers per second-line manager' })}
          ${numInput({ id: 'sh-slmcost', bind: 'shared.layers.slmCost', value: L.slmCost, label: 'Annual cost per second-line manager', prefix: '$', big: true })}</div>
          ${iss['shared.layers'] ? `<div class="err">${esc(iss['shared.layers'])}</div>` : ''}`
      : `<div class="grid g3">${numInput({ id: 'sh-rep', bind: 'shared.repCost', value: sh.repCost, label: 'Fully loaded annual cost per rep', prefix: '$', big: true, error: iss['shared.repCost'], hint: 'Includes management overhead. Plain currency, not thousands.' })}</div>`;
    const cpcBox = costOn ? `<div class="derived" id="sh-cpc" aria-live="polite"><span class="derived-k">Effective cost per call</span><span class="derived-v">${cpc && isNum(cpc.effective) ? fmt.money2(cpc.effective) : '—'}</span>
        <span class="derived-s">${cpc && cpc.perYear && cpc.perYear.length ? `${esc(CPC_LABEL[sh.costPerCallMethod] || '')}. Years 1–${cpc.perYear.length}: ${cpc.perYear.map(fmt.money2).join(' · ')}` : 'Enter capacity and cost to see it.'}</span></div>` : '';
    return card({
      id: 'c-shared', title: 'Shared cost and capacity', sub: 'Used by every method. Capacity is working days × calls per day; cost uses exactly one mode so management cost is never counted twice.',
      body: `<div class="grid g3">
          ${capacityFields(iss)}
        </div>
        ${wl ? `<div class="mt16">${checkbox({ id: 'wl-cost', label: 'Include annual field cost (optional for Workload Buildup; ROI is always N/A)', checked: state.workloadCost, onAct: 'workloadCost' })}</div>` : ''}
        ${costOn ? `<div class="sep"></div>
        ${radioGroup({ name: 'costMode', label: 'Cost mode', value: sh.costMode, onAct: 'costMode', describe: true, inline: true, options: [
          { value: 'fullyLoaded', isDefault: DEFAULTS.costMode === 'fullyLoaded', label: F.OPTION_LABELS.costMode.fullyLoaded, desc: 'One all-in annual cost per rep that already includes managers.' },
          { value: 'layers', isDefault: DEFAULTS.costMode === 'layers', label: F.OPTION_LABELS.costMode.layers, desc: 'Rep cost plus manager cost spread across their spans. Never added to a fully loaded cost.' }] })}
        ${costFields}
        <div class="grid g3 mt16">
          ${numInput({ id: 'sh-infl', bind: 'shared.inflationPct', value: sh.inflationPct, label: 'Annual cost inflation', suffix: '%', error: iss['shared.inflationPct'] })}
          ${numInput({ id: 'sh-disc', bind: 'shared.discountRatePct', value: sh.discountRatePct, label: 'Discount rate', suffix: '%', error: iss['shared.discountRatePct'] })}
        </div>
        ${cpcBox}` : ''}
        ${horizonDisplay(sh, wl, costOn, iss)}`
    });
  }
  /* F8 (v0.5 fix round, CS-5): the sizing horizon and the cost averaging window are fixed by the standard method. They are shown
     read-only (no inputs); the values still travel in the engine inputs, the snapshot and the export. A draft cloned from a
     scenario saved with other values keeps them, read-only, and says so. */
  function horizonDisplay(sh, wl, costOn, iss) {
    const H = sh.horizon || {}, W = H.windowYears, T = H.tailYears;
    const std = W === DEFAULTS.windowYears && (wl || T === DEFAULTS.tailYears);
    const note = std ? 'Standard method; not an input.' : 'Carried from the scenario this draft was cloned from; differs from the standard method. Not an input.';
    const err = iss['shared.horizon.windowYears'] ? `<div class="err">${esc(iss['shared.horizon.windowYears'])}</div>` : '';
    if (wl) return costOn ? `<div class="sep"></div><div class="derived std-method" id="sh-horizon"><span class="derived-k">Cost averaging window</span><span class="derived-v">${fmt.int(W)} years</span><span class="derived-s">${note} Cost per call is averaged over this many years.</span></div>${err}` : '';
    return `<div class="sep"></div><div class="derived std-method" id="sh-horizon"><span class="derived-k">Sizing horizon</span><span class="derived-v">${fmt.int(W)}-year window + ${fmt.int(T)}-year tail</span><span class="derived-s">${note} The forecast table below covers every year of the window and the tail.</span></div>${err}`;
  }

  /* FSEngine.impactableValue returns short internal messages (e.g. "sizingStartYear is required") or coded issues; never show raw keys. */
  const VALUE_ERR = {
    'derived-other-negative': y => `Other channels would be negative in ${y}: the Salesforce-impactable share plus carried-in sales exceed the forecast.`,
    'derived-carryover-negative': y => `Carried-in sales would be negative in ${y}: other channels plus the Salesforce-impactable share exceed the forecast.`,
    'first-year-carryover': y => `In ${y}, the first forecast year, nothing carries in, so other channels and the Salesforce-impactable share must add up to 100%.`,
    'derived-carryover-undefined': y => `${y} needs carried-in sales, but the year before has no Salesforce-attributable sales to carry over.`
  };
  /* F5 (v0.5 fix round): two engine messages carry unformatted amounts. The display layer rewords them with the app's currency
     formatter; the amounts are the engine's own (read from its message), nothing is recalculated here. */
  const AMT = '(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)';
  const VALUE_ERR_AMOUNTS = {
    'derived-other-negative': { re: new RegExp(`Carryover ${AMT} plus Salesforce-impactable ${AMT} exceed the (\\d{4}) forecast of ${AMT}`),
      text: (y, a) => `Other channels would be negative in ${a[2]}: carried-in sales of ${fmt.money(+a[0])} plus new Salesforce-impactable sales of ${fmt.money(+a[1])} exceed the ${a[2]} forecast of ${fmt.money(+a[3])}. Lower the Salesforce-impactable % or the carryover for that year.` },
    'derived-carryover-undefined': { re: new RegExp(`(\\d{4}) needs a carryover of ${AMT}, but no Salesforce-attributable sales exist in (\\d{4})`),
      text: (y, a) => `${a[0]} needs ${fmt.money(+a[1])} of carried-in sales, but ${a[2]} has no Salesforce-attributable sales to carry over.` }
  };
  const RAW_KEY_RE = /[a-z][A-Z][a-z]|\w+\[\d+\]|\.\w+\./;
  const RAW_AMOUNT_RE = /\d{4,}(?:\.\d+)?(?!\d)/g;   // an unformatted amount: four or more digits that are not a year
  const hasRawAmount = s => (String(s).match(RAW_AMOUNT_RE) || []).some(x => !/^(19|20)\d\d$/.test(x));
  function valueErrorText(e) {
    if (e && typeof e === 'object') {
      const y = valueErrYear(e);
      const fa = VALUE_ERR_AMOUNTS[e.code], fm = fa && e.message ? String(e.message).match(fa.re) : null;
      if (fm) return fa.text(y, fm.slice(1));
      if (e.message && VALUE_ERR[e.code] && !RAW_KEY_RE.test(e.message) && !hasRawAmount(e.message)) return String(e.message);   // the engine's own plain wording
      if (VALUE_ERR[e.code]) return VALUE_ERR[e.code](y);
      return e.message && !RAW_KEY_RE.test(e.message) ? String(e.message) : 'Complete the inputs above to see it.';
    }
    const s = String(e || '');
    if (/sizingStartYear/.test(s)) return 'Enter the sizing start year to see it.';
    const cov = s.match(/cover (\d{4})\.\.(\d{4})/);
    if (cov) return `The forecast table must cover ${cov[1]}–${cov[2]} (sizing window plus carryover tail).`;
    const code = Object.keys(VALUE_ERR).find(k => s.includes(k));
    if (code) { const yy = s.match(/\b(\d{4})\b/); return VALUE_ERR[code](yy ? yy[1] : 'one year'); }
    return 'Complete the inputs above to see it.';
  }
  const engineErrText = e => (e && VALUE_ERR[e.code] ? valueErrorText(e) : String((e && e.message) || ''));
  function valueErrYear(e) {
    if (isNum(e.year)) return String(e.year);
    const m = String(e.path || '').match(/years\[(\d+)\]/), v0 = (ma() && ma().value) || {};
    if (m) return isNum(v0.sizingStartYear) ? String(v0.sizingStartYear + +m[1]) : `forecast year ${+m[1] + 1}`;
    const yy = String(e.message || '').match(/\b(\d{4})\b/);
    return yy ? yy[1] : 'one year';
  }
  /* v0.5.1 CS-1 (reference-workbook calculation): three editable shares per year; sizing uses carryover and other channels, as in the
     reference model; an entered Salesforce-impactable % is a check. FC_LABEL names the modes of an older (v0.5) draft only. */
  const FC_LABEL = Object.assign({ 'carryover+other': 'Carryover and other channels', 'carryover+sf': 'Carryover and Salesforce-impactable', 'other+sf': 'Other channels and Salesforce-impactable' }, OL('forecastMode'));
  const FC_COLS = [['carryoverPct', 'c', 'Carryover into year (%)', 'carryover'], ['otherChannelPct', 'o', 'Other channels (%)', 'other'], ['sfPct', 's', null, 'sf']];
  const FC_HELP = 'Sizing uses carryover and other channels, as in the reference model. Salesforce-impactable is a check in the first year only: if it doesn\'t match the implied value, that year is flagged. From year 2 on, Salesforce impact keeps carrying over from earlier years, so the shares are not expected to add to 100%.';
  const FC_WARN_CODES = ['shares-not-100', 'sf-floored'];
  /* Forecast-inputs wording for the scenario detail and the review (no arithmetic). */
  const fcInputsText = v => { const lm = legacyMode(v); return lm ? `${FC_LABEL[lm]} (older draft)` : `${FC_LABEL[FC_DEFAULT_MODE]}; Salesforce-impactable is a check`; };
  /* The plain sentence for a forecast-check warning. Values are the engine's (warning fields, else its cohort fields); nothing is recalculated here. */
  const wv = (w, c, k) => (w && isNum(w[k]) ? w[k] : w && w.values && isNum(w.values[k]) ? w.values[k] : c && isNum(c[k]) ? c[k] : null);
  function fcWarnText(w, yr, c) {
    if (w.code === 'sf-floored') return `New Salesforce-impactable sales are set to 0 in ${yr} because carried-in sales plus other channels exceed the forecast.`;
    const sum = wv(w, c, 'checkSumPct'), imp = wv(w, c, 'impliedSfPct');
    if (isNum(sum) && isNum(imp)) return `${yr} (first year): Salesforce-impactable and other channels add to ${fmt.pct(+sum.toFixed(4))}, not 100%; other channels imply Salesforce-impactable of ${fmt.pct(+imp.toFixed(4))}.`;
    return `${yr}: the shares do not add to 100%.`;
  }
  function valueBlock() {
    const v = ma().value, iss = assumptionIssues(), mode = valueMode();
    const eng = projectMethodAssumptions().value;
    const iv = safe(() => E.impactableValue(eng, sharedForEngine()), null);
    const H = state.shared.horizon, W = H.windowYears || 0;
    const years = v.years || [];
    const lm = legacyMode(v), dKey = lm ? DERIVED_KEY[lm] : null;
    const cohorts = (iv && iv.cohorts) || [];
    const yearOf = i => (isNum(v.sizingStartYear) ? v.sizingStartYear + i : null);
    const yearTxt = i => (isNum(v.sizingStartYear) ? String(v.sizingStartYear + i) : `Year ${i + 1}`);
    const cohortOf = i => { const y = yearOf(i); return y == null ? null : cohorts.find(k => k.year === y) || null; };
    /* Read-only columns come from the engine's preview run of the value chain (cohort fields); the UI does no arithmetic.
       F5: a year the engine reports an error for shows "—". */
    const errRows = new Set(((iv && iv.issues) || []).map(x => { const m = String(x.path || '').match(/years\[(\d+)\]/); return m ? +m[1] : -1; }));
    const cohortVal = (i, k) => { if (errRows.has(i)) return null; const c = cohortOf(i); return c && isNum(c[k]) ? c[k] : null; };
    /* Non-blocking forecast-check warnings (shares-not-100, sf-floored), mapped to their row by the year path (or year). */
    const rowWarn = {};
    ((iv && iv.warnings) || []).filter(w => w && FC_WARN_CODES.includes(w.code)).forEach(w => {
      const m = String(w.path || '').match(/years\[(\d+)\]/);
      const i = m ? +m[1] : isNum(w.year) && isNum(v.sizingStartYear) ? w.year - v.sizingStartYear : -1;
      if (i < 0 || i >= years.length) return;
      const t = fcWarnText(w, yearTxt(i), cohortOf(i));
      (rowWarn[i] = rowWarn[i] || []); if (!rowWarn[i].includes(t)) rowWarn[i].push(t);
    });
    const warnRows = Object.keys(rowWarn).map(Number).sort((x, y) => x - y);
    /* F6: soft, non-blocking note for an entered Salesforce-impactable % of 90 or more. */
    const sfHigh = dKey === 'sfPct' ? [] : years.map((y, i) => (isNum(y.sfPct) && y.sfPct >= 90 && y.sfPct <= 100 ? (isNum(v.sizingStartYear) ? v.sizingStartYear + i : `year ${i + 1}`) : null)).filter(x => x != null);
    const colHead = k => (k === 'sfPct' ? `${IMP_LABEL} (%)` : FC_COLS.find(c => c[0] === k)[2]);
    const yearErr = i => iss[`methodAssumptions.value.years[${i}]`] || FC_COLS.map(c => iss[`methodAssumptions.value.years[${i}].${c[0]}`]).find(Boolean) || '';
    const roCell = (i, k, id, label) => { const d = cohortVal(i, k); return `<td class="num derived-cell${errRows.has(i) ? ' is-err' : ''}" id="${id}" aria-label="${esc(label)}, year ${i + 1}, from the engine${errRows.has(i) ? '; not available: this year has an error' : ''}">${d == null ? '<span class="muted">—</span>' : fmt.pct(+d.toFixed(4))}</td>`; };
    /* 2026-10-12 review: the "Adds to" column is removed. A flagged year's warning icon now sits on its Implied SF % cell. */
    const impCell = i => { const d = cohortVal(i, 'impliedSfPct'), ws = rowWarn[i];
      const ic = ws ? `<span class="fc-warn" id="vy-${i}-warn" tabindex="0" role="img" data-tip="${esc(ws.join(' '))}" aria-label="Warning: ${esc(ws.join(' '))}">${icon('warn', 14)}</span>` : '';
      return `<td class="num derived-cell fc-adds${errRows.has(i) ? ' is-err' : ''}${ws ? ' is-warn' : ''}" id="vy-${i}-imp" aria-label="Implied Salesforce-impactable %, year ${i + 1}, from the engine">${ic}${d == null ? '<span class="muted">—</span>' : fmt.pct(+d.toFixed(4))}</td>`; };
    const older = lm ? `<div class="derived std-method fc-older" id="fc-older"><span class="derived-k">Saved with forecast inputs</span><span class="derived-v">${esc(FC_LABEL[lm])} (older draft)</span>
        <span class="derived-s">Read-only. Carried from a scenario saved before the forecast check; the ${esc(dKey === 'otherChannelPct' ? 'other channels' : 'carryover')} column is derived by the engine for this draft, so the saved result is reproduced.</span></div>` : '';
    const chain = `<div class="grid g3">
        ${numInput({ id: 'v-start', bind: 'ma.value.sizingStartYear', value: v.sizingStartYear, label: 'Sizing start year', error: iss['methodAssumptions.value.sizingStartYear'] || (state.checkRuns.assumptions && !isNum(v.sizingStartYear) ? 'This field is required' : ''), hint: 'Required. First year of the sizing window. No default is assumed.' })}
        ${numInput({ id: 'v-gm', bind: 'ma.value.grossMarginPct', value: v.grossMarginPct, label: 'Gross margin', suffix: '%', hint: 'Default 100%.', error: iss['methodAssumptions.value.grossMarginPct'] })}
      </div>
      ${older}
      <p class="hint mt16" id="fc-help">${esc(FC_HELP)}</p>
      <div class="grid-wrap mt8"><table class="grid-t fc-t" id="fc-table"><thead><tr><th scope="col">Year</th><th scope="col">Role</th><th scope="col" class="num">Brand forecast ($)</th>${FC_COLS.map(c => `<th scope="col" class="num${c[0] === dKey ? ' is-derived' : ''}">${esc(colHead(c[0]))}${c[0] === dKey ? ' <span class="chip chip-outline chip-sm">Derived</span>' : ''}</th>`).join('')}<th scope="col" class="num is-derived">Implied SF %</th></tr></thead>
      <tbody>${years.map((y, i) => { const ye = yearErr(i); return `<tr class="${[ye ? 'has-err' : '', rowWarn[i] ? 'has-warn' : ''].filter(Boolean).join(' ')}"><th scope="row" class="rowh">${esc(yearTxt(i))}</th><td>${i < W ? `Window ${i + 1}` : `Tail ${i - W + 1}`}</td>
        <td class="cell-in num">${numInput({ id: `vy-${i}-f`, bind: `ma.value.years.${i}.forecast`, value: y.forecast, compact: true, big: true, ariaLabel: `Brand forecast, year ${i + 1}`, error: iss[`methodAssumptions.value.years[${i}]`] ? 'x' : '' })}</td>
        ${FC_COLS.map(c => c[0] === dKey
          ? roCell(i, dKey, `vy-${i}-${c[1]}-d`, `${colHead(c[0])}, derived`)
          : `<td class="cell-in num">${numInput({ id: `vy-${i}-${c[1]}`, bind: `ma.value.years.${i}.${c[0]}`, value: y[c[0]], compact: true, suffix: '%', placeholder: c[0] === 'sfPct' ? 'blank' : '', error: iss[`methodAssumptions.value.years[${i}].${c[0]}`] || (isNum(y[c[0]]) && (y[c[0]] < 0 || y[c[0]] > 100)) ? 'x' : '', ariaLabel: `${colHead(c[0]).replace(/ \(%\)$/, '')}, year ${i + 1}${c[0] === 'sfPct' ? ' (check value, blank allowed)' : ''}` })}</td>`).join('')}
        ${impCell(i)}</tr>`; }).join('')}</tbody></table></div>
      <p class="hint">Carryover: share of the previous year's Salesforce sales retained into this year. Other channels: share of the forecast not attributable to the field force. ${esc(IMP_LABEL)}: optional; the share of the forecast you expect to be new Salesforce-impactable sales, compared with the implied value in the first year. Implied SF % is calculated by the engine and is read-only.</p>
      ${years.some((y, i) => FC_COLS.some(c => c[0] !== dKey && isNum(y[c[0]]) && (y[c[0]] < 0 || y[c[0]] > 100))) ? `<div class="err">Shares must be between 0% and 100%.</div>` : ''}
      ${warnRows.length ? `<div class="soft-warn fc-check" id="fc-check" role="status">${icon('warn', 14)}<div><strong>${warnRows.length === 1 ? '1 forecast year is flagged' : `${warnRows.length} forecast years are flagged`}.</strong> This does not block the calculation; sizing uses carryover and other channels.<ul class="plain fc-check-list">${warnRows.map(i => rowWarn[i].map(t => `<li>${esc(t)}</li>`).join('')).join('')}</ul></div></div>` : ''}
      ${sfHigh.length ? `<div class="soft-warn" id="sf-high" role="status">${icon('warn', 14)}<span>Salesforce-impactable is rarely this high; check the value (${esc(sfHigh.join(', '))}). This does not block the calculation.</span></div>` : ''}`;
    const direct = `<div class="grid g3">${numInput({ id: 'v-annual', bind: 'ma.value.annualValue', value: v.annualValue, label: 'Annual impactable value', prefix: '$', big: true, error: iss['methodAssumptions.value.annualValue'] || iss['methodAssumptions.value'], hint: 'Annual value the field force can influence, already net of margin and of other channels.' })}</div>`;
    const ivList = iv ? ((iv.issues && iv.issues.length) ? iv.issues : (iv.errors || [])) : [];
    const ivErr = ivList.length ? [...new Set(ivList.map(valueErrorText))].join(' ') : '';
    const legacy = isNum(v.calibrationFactor) && v.calibrationFactor !== DEFAULTS.calibrationFactor;
    const legacyBox = legacy ? `<div class="derived legacy-cal" id="v-cal-legacy"><span class="derived-k">Legacy calibration factor</span><span class="derived-v">${fmt.num(v.calibrationFactor, 5).replace(/0+$/, '').replace(/\.$/, '')}</span>
        <span class="derived-s">Read-only. Carried from a saved scenario and still applied to the value pool; it is no longer an input. To size to the full forecast, set Value from excluded segments to reallocate.</span></div>` : '';
    const modeTxt = mode !== 'chain' ? '' : lm ? ` · ${esc(FC_LABEL[lm])} entered; ${esc(dKey === 'otherChannelPct' ? 'other channels' : 'carryover')} derived (older draft)` : ' · sized from carryover and other channels';
    return `<h3 class="sub-h">Impactable value</h3>
      ${radioGroup({ name: 'valueMode', label: 'How do you want to supply it?', value: mode, onAct: 'valueMode', inline: true, options: [{ value: 'chain', label: 'Build from forecast' }, { value: 'direct', label: 'Enter annual impactable value' }] })}
      ${mode === 'chain' ? chain : direct}
      ${legacyBox}
      <div class="derived" aria-live="polite"><span class="derived-k">Value pool</span><span class="derived-v" id="v-pool">${iv && isNum(iv.pool) ? fmt.money(iv.pool) : '—'}</span>
        <span class="derived-s">${iv && isNum(iv.annual) ? `Annual impactable value ${fmt.money(iv.annual)}${legacy ? ` × legacy calibration ${fmt.num(iv.calibrationFactor, 2)}` : ''}${modeTxt}` : ivErr ? esc(ivErr) : 'Complete the inputs above to see it.'}</span></div>
      ${mode === 'chain' && ivErr && iv && isNum(iv.annual) ? `<div class="err" role="alert">${esc(ivErr)}</div>` : ''}`;
  }

  /* ---------- P4 (FR-44, FR-45, FR-47, proposed): response curve uptake per archetype ----------
     The archetype list is read from the data (FR-47), never a fixed list: entity rows when present, else every segment's
     archetype mix keys and single archetype; reference archetypes first (the engine's order), then the others as first seen.
     The analyst chooses an uptake preset per archetype (or Custom, with δ/γ/ρ and one source note); the curves the engine
     receives come only from FSEngine.resolveCurves (buildInputs → withCurves). Strings: FSFields.RESPONSE_CURVE_LABELS (RCL). */
  const RC_ALL = (F.RESPONSE_CURVE_RESERVED || {}).all || 'ALL';
  const RC_CUSTOM = (F.RESPONSE_CURVE_RESERVED || {}).custom || 'custom';
  const RC_PARAMS = ['delta', 'gamma', 'rho'];
  const ownKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const blankResponseCurve = () => ({ assignment: {}, custom: {}, customSourceNote: '' });
  const rcName = id => (id === RC_ALL ? RCL.all : id);
  const refFirst = seen => { const ref = Object.keys((E && E.ARCHETYPES) || {}); return ref.filter(a => seen.includes(a)).concat(seen.filter(a => !ref.includes(a))); };
  const addArch = (seen, a) => { if (typeof a === 'string' && a !== '' && !seen.includes(a)) seen.push(a); };
  function segArchetypes() {
    const seen = [];
    state.segments.forEach(s => { if (s.archetypeMix) Object.keys(s.archetypeMix).forEach(a => addArch(seen, a)); else addArch(seen, s.archetype); });
    return refFirst(seen);
  }
  const entityRows = () => (state.entities && state.entities.length ? state.entities : null);
  function dataArchetypes() {
    const ents = entityRows();
    if (!ents) return segArchetypes();
    const seen = [];
    ents.forEach(e => addArch(seen, e && e.archetype));
    return refFirst(seen);
  }
  const rcFlags = () => (state.config && state.config.flags) || {};
  const respValueOnly = () => method() === 'response' && state.respSegType === 'value';
  /* D3: value-only stays blocked (CS-7) unless the configuration allows it; then one "All HCPs" row ('ALL') is sized. */
  const valueOnlyBlocked = () => respValueOnly() && rcFlags().allowValueOnlyResponse !== true;
  const valueOnlyRuns = () => respValueOnly() && rcFlags().allowValueOnlyResponse === true;
  const curveArchetypes = () => (valueOnlyRuns() ? [RC_ALL] : dataArchetypes());
  const rcPresets = () => (state.config && state.config.presets) || [];
  const uptakeLabel = a => (!a ? RCL.notAssigned : a === RC_CUSTOM ? RCL.custom : (rcPresets().find(p => p.id === a) || {}).label || a);
  /* Resolved curves for the archetypes in the data only (I-4); assignments for archetypes no longer in the data are kept, unsent. */
  function resolvedCurves() {
    const rc = state.responseCurve, ids = curveArchetypes(), asg = {};
    ids.forEach(id => { if (ownKey(rc.assignment, id) && rc.assignment[id]) asg[id] = rc.assignment[id]; });
    const out = E.resolveCurves(asg, rcPresets(), rc.custom);
    return { ids, assignment: asg, curveParams: out.curveParams, provenance: out.provenance, issues: out.issues };
  }
  /* Uptake issues as assumption-check items against the right row (path + "Go to field" target). resolveCurves issues
     (unknown-preset, custom-curve-invalid) are matched to their archetype by exact path; the UI adds "no uptake chosen"
     (no hidden default), Custom while custom curves are off, and the required source note (custom-source-missing). */
  function curveIssues(r) {
    if (method() !== 'response' || valueOnlyBlocked()) return [];
    r = r || resolvedCurves();
    const V = RCL.validation || {}, rc = state.responseCurve, out = [];
    const where = id => `${RCL.uptakeByArchetype} · ${rcName(id)}`;
    r.ids.forEach((id, i) => {
      const a = r.assignment[id], p = `responseCurve.assignment.${id}`;
      if (!a) out.push({ where: where(id), message: V.unassigned(rcName(id)), path: p, target: `rc-${i}-up`, unassigned: true });
      else if (a === RC_CUSTOM && rcFlags().allowCustomCurve === false) out.push({ where: where(id), message: RCL.customNotAllowed, path: p, target: `rc-${i}-up` });
      /* Fix 2 (F2): a blank Custom δ is an error like γ and ρ; the engine's default δ of 5 is never applied silently. */
      if (a === RC_CUSTOM) { const d = (rc.custom[id] || {}).delta; if (d === null || d === undefined || d === '')
        out.push({ where: where(id), message: V['custom-curve-invalid'](rcName(id), RCL.delta), path: `responseCurve.custom.${id}.delta`, target: `rc-${i}-delta` }); }
    });
    r.issues.forEach(x => {
      const p = String(x.path || '');
      const i = r.ids.findIndex(id => p === `responseCurve.assignment.${id}` || RC_PARAMS.some(k => p === `responseCurve.custom.${id}.${k}`));
      if (i < 0) return;
      const id = r.ids[i];
      if (x.code === 'unknown-preset') out.push({ where: where(id), message: V['unknown-preset'](rcName(id), r.assignment[id]), path: p, target: `rc-${i}-up` });
      else if (x.code === 'custom-curve-invalid') { const k = p.slice(p.lastIndexOf('.') + 1), fm = rcFmtOf(id, k);
        out.push({ where: where(id), message: fm ? `${rcName(id)} · ${fm}` : V['custom-curve-invalid'](rcName(id), RCL[k]), path: p, target: `rc-${i}-${k}` }); }
    });
    if (r.ids.some(id => r.assignment[id] === RC_CUSTOM) && !String(rc.customSourceNote || '').trim())
      out.push({ where: RCL.sourceNote, message: V['custom-source-missing'](), path: 'responseCurve.customSourceNote', target: 'rc-note' });
    return out;
  }

  /* Read-only count of entities by curve archetype, as supplied upstream (a mix spreads a segment's count by its shares). */
  function archetypeCounts(ids) {
    const out = {}; ids.forEach(a => { out[a] = 0; });
    const all = ids.length === 1 && ids[0] === RC_ALL;
    let none = 0;
    if (entityRows()) state.entities.forEach(e => { if (all) out[RC_ALL] += 1; else if (e.archetype && ownKey(out, e.archetype)) out[e.archetype] += 1; else none += 1; });
    else state.segments.forEach(s => {
      const n = isNum(s.entities) ? s.entities : 0;
      if (all) out[RC_ALL] += n;
      else if (s.archetypeMix) ids.forEach(a => { out[a] += n * (isNum(s.archetypeMix[a]) ? s.archetypeMix[a] : 0) / 100; });
      else if (s.archetype && ownKey(out, s.archetype)) out[s.archetype] += n; else none += n;
    });
    return { out, none };
  }
  /* The chart plots the engine's own normalized curve, Response(x) / Response(X), with the same formula, for the curve each
     archetype resolves to; nothing here feeds the calculation. */
  const CURVE_COLORS = { Loyalists: '#020434', Splitters: '#3282FA', Dabblers: '#11A13C', Conservatives: '#C77700' };
  const CURVE_PALETTE = ['#3282FA', '#11A13C', '#C77700', '#020434', '#8A3FFC', '#E60F65', '#00838F', '#6D4C41'];
  const curveColor = (a, i) => CURVE_COLORS[a] || CURVE_PALETTE[i % CURVE_PALETTE.length];
  const curveOk = p => !!p && isNum(p.delta) && p.delta > 0 && isNum(p.gamma) && p.gamma > 0 && isNum(p.rho) && p.rho > 0;
  const curveR = (p, x) => (x <= 0 ? 0 : Math.pow(p.delta * x, p.gamma) / (Math.pow(x, p.gamma) + p.rho));
  const halfAt = p => (curveOk(p) ? Math.pow(p.rho, 1 / p.gamma) : null);
  const rawNum = v => (isNum(v) ? String(v) : '—');
  function curvePlotSvg(r) {
    const X = isNum((ma() || {}).scenarioMaxCalls) && ma().scenarioMaxCalls > 0 ? ma().scenarioMaxCalls : DEFAULTS.scenarioMaxCalls;
    const A = r.curveParams, W0 = 460, H0 = 280, L = 44, R = 14, T = 14, B = 40, w = W0 - L - R, h = H0 - T - B;
    const sx = x => L + (x / X) * w, sy = y => T + h - Math.max(0, Math.min(1.05, y)) / 1.05 * h;
    const path = p => { const d = curveR(p, X); if (!(d > 0)) return ''; const pts = []; for (let k = 0; k <= 96; k++) { const x = X * k / 96; pts.push(`${sx(x).toFixed(1)},${sy(curveR(p, x) / d).toFixed(1)}`); } return pts.join(' '); };
    const xt = []; const stepX = X <= 24 ? 4 : X <= 60 ? 8 : 20; for (let x = 0; x <= X; x += stepX) xt.push(x); if (xt[xt.length - 1] !== X) xt.push(X);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(y => `<line x1="${L}" x2="${L + w}" y1="${sy(y)}" y2="${sy(y)}" stroke="rgba(2,4,52,0.08)"/><text x="${L - 6}" y="${sy(y) + 4}" text-anchor="end" font-size="11" fill="rgba(2,4,52,0.6)">${y === 0 ? '0' : y.toFixed(2).replace(/0$/, '')}</text>`).join('');
    const xl = xt.map(x => `<line x1="${sx(x)}" x2="${sx(x)}" y1="${T + h}" y2="${T + h + 4}" stroke="rgba(2,4,52,0.4)"/><text x="${sx(x)}" y="${T + h + 16}" text-anchor="middle" font-size="11" fill="rgba(2,4,52,0.6)">${x}</text>`).join('');
    const names = r.ids;
    const lines = names.map((a, i) => (curveOk(A[a]) ? `<polyline fill="none" stroke="${curveColor(a, i)}" stroke-width="2.25" data-arch="${esc(a)}" points="${path(A[a])}"><title>${esc(RCL.curveLegendPreset(rcName(a), uptakeLabel(r.assignment[a])))}</title></polyline>` : '')).join('');
    const label = `Normalized response by call count, 0 to ${X} calls, for ${names.map(rcName).join(', ')}. ${names.map(a => (curveOk(A[a]) ? `${RCL.curveLegendPreset(rcName(a), uptakeLabel(r.assignment[a]))}, half of peak response at about ${fmt.num1(halfAt(A[a]))} calls` : `${rcName(a)}: ${r.assignment[a] ? 'invalid parameters' : RCL.notAssigned}`)).join('; ')}.`;
    return `<svg viewBox="0 0 ${W0} ${H0}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">
      ${grid}<line x1="${L}" x2="${L + w}" y1="${T + h}" y2="${T + h}" stroke="rgba(2,4,52,0.4)"/>${xl}
      <text x="${L + w / 2}" y="${H0 - 6}" text-anchor="middle" font-size="11" fill="rgba(2,4,52,0.6)">Calls per ${esc(grainOne(state.project.grain))} per year</text>
      <text x="12" y="${T + h / 2}" text-anchor="middle" font-size="11" fill="rgba(2,4,52,0.6)" transform="rotate(-90 12 ${T + h / 2})">Response (1 = at ${X} calls)</text>
      ${lines}</svg>`;
  }
  /* Legend: the preset label per archetype (or Custom, or "Not chosen"). */
  function curveLegend(r) {
    return `<div class="curve-legend" id="curve-legend">${r.ids.map((a, i) => `<span><span class="sw" style="background:${curveColor(a, i)}"></span>${esc(RCL.curveLegendPreset(rcName(a), uptakeLabel(r.assignment[a])))}</span>`).join('')}</div>`;
  }
  /* Live update while typing a Custom value: chart, legend and the Advanced read-only values. */
  function refreshCurve() {
    const r = resolvedCurves();
    const pl = document.getElementById('curve-plot'); if (pl) pl.innerHTML = curvePlotSvg(r) + curveLegend(r);
    r.ids.forEach((a, i) => {
      const p = r.curveParams[a];
      RC_PARAMS.forEach(k => { const c = document.getElementById(`rc-adv-${i}-${k}`); if (c) c.textContent = p ? rawNum(p[k]) : '—'; });
      const c = document.getElementById(`rc-adv-${i}-half`); if (c) c.textContent = curveOk(p) ? fmt.num(halfAt(p), 2) : '—';
    });
  }
  /* Step 2 · Method-specific: Response Curve → "Uptake by archetype" (§6.3 1–5). Read-only for the Administrator (D4). */
  function uptakeSection() {
    const g = state.project.grain, r = resolvedCurves(), ids = r.ids, rc = state.responseCurve, asg = r.assignment;
    const vo = valueOnlyRuns(), ro = readOnly();
    const { out, none } = archetypeCounts(ids), total = ids.reduce((s, a) => s + out[a], 0) + none;
    /* Errors show live, except "no uptake chosen", which shows once the assumptions check has been run. */
    const run = assumptionIssues(), live = curveIssues(r), err = {};
    live.forEach(x => { if (!x.unassigned || run[x.path]) err[x.path] = x.message; });
    const anyCustom = ids.some(a => asg[a] === RC_CUSTOM);
    const rows = ids.map((a, i) => {
      const name = rcName(a), cur = asg[a] || null, pa = `responseCurve.assignment.${a}`;
      const opts = CFG && CFG.pickerOptions ? CFG.pickerOptions(state.config, cur) : rcPresets().filter(p => p.pickerVisible || p.id === cur).map(p => ({ value: p.id, label: p.label }));
      const pick = dropdown({ id: `rc-${i}-up`, label: name, compact: true, value: cur, options: opts, placeholder: RCL.chooseUptake, error: err[pa] ? 'x' : '', onSelect: v => { rcAssign(a, v); render(); } });
      const custErr = RC_PARAMS.some(k => err[`responseCurve.custom.${a}.${k}`]);
      const c = rc.custom[a] || {};
      const custom = cur === RC_CUSTOM ? `<tr class="rc-custom${custErr ? ' has-err' : ''}"><td colspan="4"><div class="rc-custom-in" role="group" aria-labelledby="rc-${i}-name" style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:flex-end;padding:4px 0 4px 20px">
          ${RC_PARAMS.map(k => { const raw = rcRawOf(a, k), h = numInput({ id: `rc-${i}-${k}`, value: c[k], compact: true, error: err[`responseCurve.custom.${a}.${k}`] ? 'x' : '', ariaLabel: `${name} · ${RCL[k]}` }).replace('<input ', `<input data-rc-arch="${i}" data-rc-param="${k}" `);
            return `<div class="field" style="margin:0"><label class="lbl" for="rc-${i}-${k}">${esc(RCL[k])}</label>${raw != null ? h.replace('value=""', `value="${esc(raw)}"`) : h}</div>`; }).join('')}</div></td></tr>` : '';
      return `<tr class="${err[pa] || custErr ? 'has-err' : ''}"><th scope="row" class="rowh" id="rc-${i}-name"><span class="sw" style="background:${curveColor(a, i)}"></span>${esc(name)}</th>
        <td class="num">${fmt.int(out[a])}</td><td class="num">${total > 0 ? fmt.pct(out[a] / total * 100) : '—'}</td>
        <td class="cell-in"><span class="sr-only" id="rc-${i}-up-lbl">${esc(`${name} · ${RCL.uptake}`)}</span>${pick}</td></tr>${custom}`;
    }).join('') + (none ? `<tr><th scope="row" class="rowh">${esc(RCL.noArchetype)}</th><td class="num">${fmt.int(none)}</td><td class="num">${total > 0 ? fmt.pct(none / total * 100) : '—'}</td><td></td></tr>` : '');
    const errs = Object.keys(err).filter(p => p !== 'responseCurve.customSourceNote').map(p => err[p]);
    const noteErr = err['responseCurve.customSourceNote'] || '';
    const note = anyCustom ? `<div class="field mt8" id="rc-note-field"><label class="lbl${noteErr ? ' is-invalid' : ''}" for="rc-note" id="rc-note-lbl">${esc(RCL.sourceNote)}</label>
        <textarea class="input ta${noteErr ? ' is-invalid' : ''}" id="rc-note" data-rc-note="1" rows="2" aria-required="true" aria-describedby="rc-note-hint" ${noteErr ? 'aria-invalid="true"' : ''} ${ro ? 'disabled' : ''}>${esc(rc.customSourceNote)}</textarea>
        ${noteErr ? `<div class="err" id="rc-note-hint">${esc(noteErr)}</div>` : `<div class="hint" id="rc-note-hint">${esc(RCL.sourceNoteHelp)}</div>`}</div>` : '';
    const adv = disclosure({ id: 'rc-adv', act: 'toggleCurveAdv', open: !!state.ui.curveAdvOpen, label: RCL.advanced,
      body: `<p class="hint mb8">${esc(RCL.advancedHint)}</p><div class="grid-wrap" tabindex="0" role="region" aria-label="${esc(RCL.advanced)}"><table class="grid-t" id="rc-adv-table"><thead><tr><th scope="col">${esc(RCL.archetype)}</th><th scope="col">${esc(RCL.preset)}</th>${RC_PARAMS.map(k => `<th scope="col" class="num">${esc(RCL[k])}</th>`).join('')}<th scope="col" class="num">${esc(RCL.halfOfPeak)}</th></tr></thead>
        <tbody>${ids.map((a, i) => { const p = r.curveParams[a]; return `<tr><th scope="row" class="rowh">${esc(rcName(a))}</th><td>${esc(uptakeLabel(asg[a]))}</td>${RC_PARAMS.map(k => `<td class="num" id="rc-adv-${i}-${k}">${p ? rawNum(p[k]) : '—'}</td>`).join('')}<td class="num" id="rc-adv-${i}-half">${curveOk(p) ? fmt.num(halfAt(p), 2) : '—'}</td></tr>`; }).join('')}</tbody></table></div>` });
    return `<div class="curve-blk" id="curve-params"><h3 class="sub-h" id="rc-h">${esc(RCL.uptakeByArchetype)}${rq('FR-44 (proposed)')}${rq('FR-45 (proposed)')}${rq('FR-47 (proposed)')}</h3>
      <p class="hint">${esc(RCL.uptakeHint)}</p>${vo ? `<p class="hint">${esc(RCL.valueOnlyRowHint)}</p>` : ''}
      <div class="curve-split"><div><div class="grid-wrap"><table class="grid-t curve-t" id="rc-table" aria-labelledby="rc-h"><thead><tr><th scope="col">${esc(RCL.archetype)}</th><th scope="col" class="num">${esc(cap(grainMany(g)))}</th><th scope="col" class="num">${esc(RCL.share)}</th><th scope="col">${esc(RCL.uptake)}</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><th scope="row" class="rowh">${esc(RCL.total)}</th><td class="num">${fmt.int(total)}</td><td></td><td></td></tr></tfoot></table></div>
        ${ids.some(a => !asg[a]) ? `<p class="hint">${esc(RCL.notAssignedHelp)}</p>` : ''}${anyCustom ? `<p class="hint">${esc(RCL.customHint)}</p>` : ''}
        ${errs.length ? `<div class="err" role="alert" id="rc-errors"><ul class="plain">${errs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${note}</div>
        <div class="curve-plot" id="curve-plot" aria-live="polite">${curvePlotSvg(r)}${curveLegend(r)}</div></div>
      <div class="mt16">${adv}</div></div>`;
  }
  /* Uptake change for one archetype: one audit row (old → new). Switching to Custom starts from the previous preset's values. */
  function rcAssign(a, v) {
    if (readOnly() || method() !== 'response') return;
    const rc = state.responseCurve, from = (ownKey(rc.assignment, a) && rc.assignment[a]) || null;
    if (v === from) return;
    if (v === RC_CUSTOM ? rcFlags().allowCustomCurve === false : !rcPresets().some(p => p.id === v)) return;
    if (v === RC_CUSTOM && !rc.custom[a]) { const p = rcPresets().find(x => x.id === from); rc.custom[a] = p ? { delta: p.delta, gamma: p.gamma, rho: p.rho } : { delta: null, gamma: null, rho: null }; }
    rc.assignment[a] = v;
    audit('assumption', RCL.audit.uptakeChange(rcName(a), from ? uptakeLabel(from) : RCL.audit.blank, uptakeLabel(v)));
  }
  /* Custom δ/γ/ρ and the source note: the store updates as you type (chart live); the audit row is written on commit. */
  const rcText = v => (v === '' || v == null ? RCL.audit.blank : v);
  /* What was typed into a Custom value that is not a number, so it stays visible (with its error) after a re-render. */
  const rcRawKey = (a, k) => `${a}\u0000${k}`;
  const rcRawOf = (a, k) => { const v = (state.ui.rcRaw || {})[rcRawKey(a, k)]; return v === undefined ? null : v; };
  const rcFmtOf = (a, k) => (state.ui.rcFmt || {})[rcRawKey(a, k)] || null;
  /* Fix 1: Custom δ/γ/ρ follow the configurator's plain-decimal rule (FSConfigurator.DECIMAL): only the ends are trimmed;
     digits with an optional decimal point; commas, inner spaces, exponents, hex and signs are rejected with the P3 messages.
     Blank is null (reported as "must be a number above 0"); the app's general parseNum is unchanged for every other field. */
  const RC_DECIMAL = (W.FSConfigurator && W.FSConfigurator.DECIMAL) || /^(\d+(\.\d*)?|\.\d+)$/;
  function rcDecimal(raw, k) {
    const t = String(raw == null ? '' : raw).trim();
    if (t === '') return { value: null };
    if (t.includes(',')) return { value: NaN, error: RCL.presetValueComma(RCL[k]) };
    if (!RC_DECIMAL.test(t)) return { value: NaN, error: RCL.presetValuePlainDecimal(RCL[k]) };
    return { value: Number(t) };
  }
  function rcInput(el) {
    if (readOnly()) return;
    const rc = state.responseCurve;
    if (el.dataset.rcNote) { rc.customSourceNote = el.value; return; }
    const a = curveArchetypes()[+el.dataset.rcArch], k = el.dataset.rcParam;
    if (a == null || !RC_PARAMS.includes(k)) return;
    const p = rcDecimal(el.value, k), raw = state.ui.rcRaw || (state.ui.rcRaw = {}), fe = state.ui.rcFmt || (state.ui.rcFmt = {});
    (rc.custom[a] = rc.custom[a] || {})[k] = p.value;
    if (p.error) { raw[rcRawKey(a, k)] = el.value; fe[rcRawKey(a, k)] = p.error; } else { delete raw[rcRawKey(a, k)]; delete fe[rcRawKey(a, k)]; }
    refreshCurve();
  }
  function rcCommit(el) {
    if (readOnly()) return;
    const orig = el.dataset.orig != null ? el.dataset.orig : '';
    if (el.value === orig) return;
    if (el.dataset.rcNote) { audit('assumption', RCL.audit.sourceNote(rcText(orig), rcText(el.value))); return; }
    const a = curveArchetypes()[+el.dataset.rcArch], k = el.dataset.rcParam;
    if (a == null || !RC_PARAMS.includes(k)) return;
    audit('assumption', RCL.audit.customValue(rcName(a), RCL[k], rcText(orig), rcText(el.value)));
    el.dataset.orig = el.value;
  }
  /* Sample loads seed the uptake from FSSample.responseCurveSeed(kind); an empty seed takes the configuration's default
     assignment for the archetypes in the data. New data (import, AI adoption) keeps the project's choices and fills only
     the archetypes with no uptake yet from the default assignment; others stay unassigned (no hidden default). */
  function fillDefaultUptake() {
    const rc = state.responseCurve, da = (state.config && state.config.defaultAssignment) || {};
    dataArchetypes().forEach(a => { if (!(ownKey(rc.assignment, a) && rc.assignment[a]) && ownKey(da, a) && da[a]) rc.assignment[a] = da[a]; });
  }
  function seedResponseCurve(kind) {
    const s = SAMPLE && SAMPLE.responseCurveSeed ? SAMPLE.responseCurveSeed(kind) : null;
    state.responseCurve = Object.assign(blankResponseCurve(), s ? clone(s) : {});
    state.ui.rcRaw = {}; state.ui.rcFmt = {};
    if (!Object.keys(state.responseCurve.assignment).length) fillDefaultUptake();
  }
  /* §6.4: a snapshot's uptake per archetype (from the inputs it was calculated with), Custom with its source note, and the
     configuration version. null for a non-response snapshot. */
  /* The archetypes a snapshot's inputs carry (entity rows, else segment mixes / single archetypes), reference ones first. */
  function inputArchetypes(i) {
    const seen = [];
    if (Array.isArray(i.entities) && i.entities.length) i.entities.forEach(e => addArch(seen, e && e.archetype));
    else (i.segments || []).forEach(x => { if (x && x.archetypeMix) Object.keys(x.archetypeMix).forEach(a => addArch(seen, a)); else if (x) addArch(seen, x.archetype); });
    return refFirst(seen);
  }
  const sameCurve = (p, q) => !!p && !!q && RC_PARAMS.every(k => p[k] === q[k]);
  /* How a snapshot's archetype got its curve: preset label, Custom with its note, or (an earlier draft without uptake
     choices, F5) the reference curve or an edited curve. */
  function curveSourceText(o, a) {
    const p = (o.curveProvenance || {})[a];
    if (p) return p.source === 'custom' ? RCL.customWithNote(o.customSourceNote || '') : p.label || p.presetId;
    return sameCurve(E.archetypesFor(o)[a], E.ARCHETYPES[a]) ? RCL.referenceCurve : RCL.editedCurve;
  }
  const snapArchetypes = i => { const o = i.methodAssumptions || {}, ids = inputArchetypes(i); Object.keys(o.curveParams || {}).forEach(a => addArch(ids, a)); return ids; };
  /* §6.4: a snapshot's uptake per archetype (from the inputs it was calculated with) and the configuration version. null for
     a non-response snapshot. */
  function uptakeSummary(s) {
    const i = s.inputs || {}, o = i.methodAssumptions || {};
    if (i.method !== 'response') return null;
    const lines = snapArchetypes(i).map(id => RCL.curveLegendPreset(rcName(id), curveSourceText(o, id)));
    if (s.responseCurveConfig && isNum(s.responseCurveConfig.version)) lines.push(RCL.configVersionText(s.responseCurveConfig.version));
    return lines;
  }
  /* F1 (fix 2): an earlier draft saved without an uptake (no snapshot.responseCurve). Archetypes whose stored curve is the
     engine's reference curve stay on the reference path (no uptake, exactly as before). Any other stored curve becomes a
     Custom assignment with the effective δ/γ/ρ the engine used (missing values from the reference) and the FSFields
     carry-over note; a stored preset provenance whose preset still has the same values is kept as that preset. */
  function legacyResponseCurve(o) {
    const rc = blankResponseCurve(), A = E.archetypesFor(o), pv = o.curveProvenance || {};
    const cp = o.curveParams && typeof o.curveParams === 'object' && !Array.isArray(o.curveParams) ? o.curveParams : {};
    Object.keys(cp).forEach(a => {
      const eff = A[a], p = pv[a];
      if (!eff) return;
      if (!p && sameCurve(eff, E.ARCHETYPES[a])) return;
      const preset = p && p.source === 'preset' ? rcPresets().find(x => x.id === p.presetId) : null;
      if (preset && sameCurve(preset, eff)) { rc.assignment[a] = preset.id; return; }
      rc.assignment[a] = RC_CUSTOM; rc.custom[a] = { delta: eff.delta, gamma: eff.gamma, rho: eff.rho };
    });
    if (Object.keys(rc.assignment).some(a => rc.assignment[a] === RC_CUSTOM))
      rc.customSourceNote = typeof o.customSourceNote === 'string' && o.customSourceNote.trim() ? o.customSourceNote : RCL.carriedOverNote;
    return rc;
  }
  const CS7_TEXT = 'Response Curve needs behavioural response curves: a curve archetype for each HCP or segment, supplied with the Segmentation & Targeting data. Value-only segmentation is not yet supported for Response Curve, and no default curve is assumed. Use Affordable Coverage for value-only segmentation.';
  /* CS-2 / CS-5: reallocation is the one remaining methodology choice, shown with the main assumptions (Affordable, Response). */
  function reallocControl() {
    const o = ma();
    return `<div class="realloc-ctl" id="realloc-ctl">${radioGroup({ name: 'realloc', label: 'Value from excluded segments', value: String(o.reallocateExcluded === true), onAct: 'realloc', describe: true,
      hint: 'Segments the ROI cutoff or the minimum calls exclude carry part of the value pool. By default it is re-shared over the covered segments; you can forfeit it instead. FTE Calculation shows what was reallocated and can turn it off.',
      options: [{ value: 'true', isDefault: DEFAULTS.reallocateExcluded === true, label: 'Reallocate it to covered segments', desc: 'The value pool is re-shared over the segments still covered, pass after pass, until no further segment drops out.' },
        { value: 'false', isDefault: DEFAULTS.reallocateExcluded === false, label: 'Forfeit it', desc: 'Value allocated to a segment that receives no calls is forfeited; FTE Calculation states the shortfall.' }] })}</div>`;
  }

  function methodCard() {
    const m = method(), o = ma(), iss = assumptionIssues();
    if (m === 'workload') return card({ id: 'c-method-a', title: `Method-specific: ${methodLabel(m)}`, body: msg('neutral', 'Workload Buildup needs nothing beyond reach % and planned annual calls per segment, set in the table below. There is no ROI cutoff, minimum or maximum, composite value, curve or allocation.') });
    /* 2026-10-12 review: allocation is fixed (proportional to composite value) for both value methods; shown read-only.
       An older draft that still carries a retired option is flagged here and blocked by the engine's validation. */
    const allocErr = iss['methodAssumptions.allocation'];
    const alloc = `<div class="derived std-method" id="alloc-fixed"><span class="derived-k">Value allocation across segments</span><span class="derived-v">${esc(F.OPTION_LABELS.allocation.proportional)}</span>
        <span class="derived-s">Standard method. Each segment gets value in line with its composite score.</span></div>${allocErr ? `<div class="err" id="alloc-err">${esc(allocErr)}</div>` : ''}`;
    let specific = '', segType = '';
    if (m === 'affordable') {
      specific = `<div class="grid g3">${numInput({ id: 'a-cut', bind: 'ma.totalRoiCutoff', value: o.totalRoiCutoff, label: 'Total ROI cutoff', error: iss['methodAssumptions.totalRoiCutoff'], hint: 'Value each $1 of field cost must return. 1.5 means $1.50 per $1.' })}</div>`;
    } else {
      /* CS-5: gross ROI basis, stop at the first failing call and the curve normalisation point are fixed; maximum calls come from the segment controls. */
      const gross = o.roiBasis !== 'net';
      specific = `<div class="grid g3">${numInput({ id: 'r-cut', bind: 'ma.cutoff', value: o.cutoff, label: gross ? 'Marginal ROI cutoff' : 'Marginal ROI cutoff (net ROI)', error: iss['methodAssumptions.cutoff'], hint: gross ? 'Default 1.0: each additional call must return at least its cost. Calls are added until the first one that misses the cutoff.' : 'Net ROI, carried from the scenario this draft was cloned from.' })}</div>`;
      segType = `${radioGroup({ name: 'segType', label: 'Segmentation type', value: state.respSegType, onAct: 'segType', describe: true, inline: true, options: [
          { value: 'value', label: 'Value only', desc: 'Deciles by value, no behavioural dimension.' },
          { value: 'behaviour', label: 'Value + behaviour', desc: 'Value deciles plus curve archetypes with their response curves.' }] })}
        ${valueOnlyBlocked() ? msg('warning', esc(CS7_TEXT), { title: 'Response Curve needs behavioural curves', id: 'cs7-msg' }) : uptakeSection()}<div class="sep"></div>`;
    }
    const realloc = '<div class="sep"></div>' + reallocControl();
    return card({ id: 'c-method-a', title: `Method-specific: ${methodLabel(m)}`, sub: esc(F.METHODS[m].question), body: segType + valueBlock() + '<div class="sep"></div>' + alloc + '<div class="sep"></div>' + specific + realloc });
  }

  const CPC_LABEL = OL('costPerCallMethod');
  const IMP_LABEL = String((F.ASSUMPTION_LABELS && (F.ASSUMPTION_LABELS.sfPct || F.ASSUMPTION_LABELS.impactablePct)) || 'Salesforce-impactable %').replace(/\s*%$/, '');
  const REALLOC_LABEL = (F.ASSUMPTION_LABELS && F.ASSUMPTION_LABELS.reallocateExcluded) || 'Reallocate value from excluded segments';
  /* CS-5: capacity is working days × calls per day; the annual capacity is derived by the engine (resolveCapacity) and shown.
     A draft cloned from a scenario saved with a directly entered capacity keeps it, read-only, until both inputs are entered. */
  function capacityFields(iss) {
    const ci = state.shared.capacityInput;
    const rc = E.resolveCapacity ? safe(() => E.resolveCapacity(sharedForEngine()), null) : null;
    const legacy = ci.mode !== 'derived';
    /* F-R2V5-02: resolveCapacity multiplies blanks to 0; show "—" until both inputs are numbers (a legacy direct capacity shows as is). */
    const derived = rc && isNum(rc.capacity) && (legacy || (isNum(ci.callsPerDay) && isNum(ci.workingDays))) ? rc.capacity : null;
    return `${numInput({ id: 'sh-days', bind: 'shared.capacityInput.workingDays', value: ci.workingDays, label: 'Working days per year', suffix: 'days', error: iss['shared.capacityInput'] ? ' ' : '' })}
      ${numInput({ id: 'sh-cpd', bind: 'shared.capacityInput.callsPerDay', value: ci.callsPerDay, label: 'Calls per day', error: iss['shared.capacityInput'] ? ' ' : '' })}
      <div class="derived derived-inline" aria-live="polite"><span class="derived-k">Effective annual calls per rep</span><span class="derived-v" id="sh-cap-derived">${derived == null ? '—' : fmt.int(derived)}</span><span class="derived-s">${legacy ? 'Entered directly in the scenario this draft was cloned from. Enter working days and calls per day to replace it.' : 'Working days × calls per day'}</span></div>
      ${iss['shared.capacityInput'] ? `<div class="err">${esc(iss['shared.capacityInput'])}</div>` : ''}${iss['shared.capacity'] ? `<div class="err">${esc(iss['shared.capacity'])}</div>` : ''}`;
  }
  /* Differences from the standard method, for the "Non-default methodology" chip. Works on engine inputs so snapshots can be checked too.
     F4 (v0.5 fix round): reallocation is a main assumption (CS-2 / CS-5), not a methodology option, so it is not listed here;
     it shows as its own assumption chip ("Reallocation: On"). */
  function nonDefaultList(inp) {
    if (!inp || !inp.shared) return [];
    const out = [], sh = inp.shared, o = inp.methodAssumptions || {}, m = inp.method;
    const chk = (cond, label) => { if (cond) out.push(label); };
    chk(sh.fteRounding && sh.fteRounding !== DEFAULTS.fteRounding, OL('fteRounding')[sh.fteRounding]);
    chk(sh.capacityInput && sh.capacityInput.mode && sh.capacityInput.mode !== DEFAULTS.capacityMode, OL('capacityInput')[sh.capacityInput && sh.capacityInput.mode]);
    chk((m !== 'workload' || sh.repCost != null) && sh.costPerCallMethod && sh.costPerCallMethod !== DEFAULTS.costPerCallMethod, OL('costPerCallMethod')[sh.costPerCallMethod]);
    chk(sh.horizon && (sh.horizon.windowYears !== DEFAULTS.windowYears || (m !== 'workload' && sh.horizon.tailYears !== DEFAULTS.tailYears)), `Horizon ${sh.horizon && sh.horizon.windowYears}+${sh.horizon && sh.horizon.tailYears} years`);
    if (m === 'affordable' || m === 'response') {
      chk(o.minimumBoundary && o.minimumBoundary !== DEFAULTS.minimumBoundary, OL('minimumBoundary')[o.minimumBoundary]);
      chk(o.value && o.value.carryoverConvention && o.value.carryoverConvention !== DEFAULTS.carryoverConvention, OL('carryoverConvention')[o.value && o.value.carryoverConvention]);
      chk(o.value && isNum(o.value.calibrationFactor) && o.value.calibrationFactor !== DEFAULTS.calibrationFactor, `Legacy calibration factor ${o.value && o.value.calibrationFactor}`);
    }
    if (m === 'response') {
      chk(o.stoppingRule && o.stoppingRule !== DEFAULTS.stoppingRule, OL('stoppingRule')[o.stoppingRule]);
      /* F-R2V5-01: the two other fixed Response settings, reachable only from a legacy scenario, are flagged too. */
      chk(o.roiBasis && o.roiBasis !== DEFAULTS.roiBasis, OL('roiBasis')[o.roiBasis] || `ROI basis ${o.roiBasis}`);
      chk(isNum(o.scenarioMaxCalls) && o.scenarioMaxCalls !== DEFAULTS.scenarioMaxCalls, `Normalization point ${o.scenarioMaxCalls} calls (standard ${DEFAULTS.scenarioMaxCalls})`);
      chk(o.cutoffTie && o.cutoffTie !== DEFAULTS.cutoffTie, OL('cutoffTie')[o.cutoffTie]);
      chk(o.reachAppliesTo && o.reachAppliesTo !== DEFAULTS.reachAppliesTo, OL('reachAppliesTo')[o.reachAppliesTo]);
      chk(o.maxCallsSource && o.maxCallsSource !== DEFAULTS.maxCallsSource, OL('maxCallsSource')[o.maxCallsSource]);
      /* 2026-10-12: edited response curve parameters are a non-default assumption. */
      /* P4: only an older draft's provenance-less curve edits; an uptake preset or a Custom curve is an assumption, shown with the uptake. */
      const pvs = o.curveProvenance || {};
      const ce = Object.keys(o.curveParams || {}).filter(a => { const r = E && E.ARCHETYPES && E.ARCHETYPES[a], u = o.curveParams[a] || {}; return r && !pvs[a] && ((isNum(u.gamma) && u.gamma !== r.gamma) || (isNum(u.rho) && u.rho !== r.rho)); });
      chk(ce.length, `Curve parameters edited (${ce.join(', ')})`);
    }
    return out;
  }
  const nonDefaultChip = list => (list.length ? `<span class="chip chip-warning" title="${esc(list.join('; '))}">${icon('warn', 14)}<span>Non-default methodology</span></span>` : '');
  /* CS-3: sizing controls stay per specialty × decile row. The "All specialties" tab shows every row; one tab per specialty
     narrows the table and offers "Apply to all deciles of <specialty>". Cell ids keep the global row index (s-<i>-<field>). */
  const sizeTab = () => { const t = state.ui.sizeSpec; return t != null && specOn() && specialtiesOf().includes(t) ? t : null; };
  function sizingCard() {
    const g = state.project.grain, iss = assumptionIssues();
    const fields = visibleFields().filter(f => f.owner === 'sizing');
    const spec = specOn(), sps = spec ? specialtiesOf() : [], tab = spec ? sizeTab() : null;
    const rowLabel = s => (!spec ? s.segment : tab == null ? `${specLabel(s.specialty)} · ${decileOf(s)}` : decileOf(s));
    const cellErrs = [];
    state.segments.forEach((s, i) => fields.forEach(f => { const e = liveCellError(s, f.id) || iss[`segments[${i}].${f.id}`] || ''; if (e) cellErrs.push(`Segment ${s.segment} · ${f.label(g)}: ${e}`); }));
    const shown = state.segments.map((s, i) => i).filter(i => tab == null || state.segments[i].specialty === tab);
    const body = shown.map(i => { const s = state.segments[i]; return `<tr><th scope="row" class="rowh">${esc(rowLabel(s))}</th>${fields.map(f => {
      const e = liveCellError(s, f.id) || iss[`segments[${i}].${f.id}`] || '';
      return `<td class="cell-in num">${numInput({ id: `s-${i}-${f.id}`, value: s[f.id], compact: true, suffix: f.unit === 'percent' ? '%' : '', error: e ? 'x' : '', ariaLabel: `${f.label(g)}, segment ${s.segment}` }).replace('<input ', `<input data-seg="${i}" data-field="${f.id}" `)}</td>`;
    }).join('')}</tr>`; }).join('');
    const anyEmpty = state.segments.some(s => fields.some(f => !isNum(s[f.id])));
    const tabs = spec ? specTabs('size-tab', 'sizeTab', tab, sps, 'Specialty') : '';   // v0.5: tabs without counts
    const applyFields = fields;
    const ap = state.ui.specApply || {};
    const apTitle = tab != null ? `Apply to all deciles of ${specLabel(tab)}` : 'Apply to all specialties';
    const apScope = tab != null ? `every decile of ${specLabel(tab)}` : 'every specialty × decile row';
    const apply = spec && !readOnly() ? `<div class="spec-apply" id="spec-apply-box"><p class="lbl">${esc(apTitle)}</p>
        <div class="spec-apply-row">${applyFields.map(f => `<div class="field"><label class="lbl" for="ap-${f.id}" id="ap-${f.id}-lbl">${esc(f.label(g))}</label>${numInput({ id: `ap-${f.id}`, value: parseNum(ap[f.id]), compact: true, suffix: f.unit === 'percent' ? '%' : '', ariaLabel: `${f.label(g)} for ${apScope}` }).replace('<input ', `<input data-apply="${f.id}" `)}</div>`).join('')}
        ${btn({ label: apTitle, act: 'specApply', kind: 'outline', ic: 'check', id: 'spec-apply' })}</div>
        <p class="hint">Writes the values you enter to ${esc(apScope)} (${plural(shown.length, 'row')}); blank fields are left as they are. Recorded once in the audit trail. Rows stay editable one by one below.</p>` : '';
    const note = spec && method() !== 'workload' ? msg('info', 'Value is allocated once across all specialty × decile rows by composite value; composite values must be on one scale across specialties.', { id: 'spec-note' }) : '';
    return card({
      id: 'c-sizing', title: 'Segment sizing controls', sub: `${sizingBadge()} Yours to set. Only the controls ${esc(methodLabel(method()))} uses are shown. Reach is a percent (85 means 85%).${spec ? ' Set per specialty × decile row.' : ''}`,
      actions: anyEmpty && SAMPLE && !readOnly() ? btn({ label: 'Fill empty cells with synthetic starter values', act: 'fillStarter', kind: 'text', ic: 'file', id: 'fill-starter' }) : '',
      body: `${note}${tabs}<div id="size-panel" ${spec ? `role="tabpanel" aria-labelledby="size-tab-${tab == null ? 'all' : sps.indexOf(tab)}"` : ''}>${apply}<div class="grid-wrap"><table class="grid-t sizing-t"><thead><tr><th scope="col">${esc(!spec ? SEG_FIELD('segment').label(g) : tab == null ? 'Specialty · decile' : 'Decile')}</th>${fields.map(f => `<th scope="col" class="num">${esc(f.label(g))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>
        ${cellErrs.length ? `<div class="err" role="alert"><ul class="plain">${cellErrs.slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}${cellErrs.length > 12 ? `<li>…and ${cellErrs.length - 12} more</li>` : ''}</ul></div>` : ''}`
    });
  }
  /* "Apply to all deciles of <specialty>": one audit row with the row count; each written cell drops its AI provenance. */
  function specApplyNow() {
    const tab = sizeTab(); if (!specOn() || readOnly()) return;   // tab null = the All specialties tab (F5): every row
    const g = state.project.grain, fields = visibleFields().filter(f => f.owner === 'sizing');
    const vals = {}, bad = [];
    fields.forEach(f => {
      const el = document.getElementById(`ap-${f.id}`), n = parseNum(el ? el.value : (state.ui.specApply || {})[f.id]);
      if (n == null) return;
      const e = Number.isNaN(n) ? 'Enter a number' : liveCellError({ [f.id]: n }, f.id);
      if (e) bad.push(`${f.label(g)}: ${e}`); else vals[f.id] = n;
    });
    if (bad.length) { toast(bad.join('; '), 'error'); return; }
    const keys = Object.keys(vals);
    if (!keys.length) { toast('Enter at least one value to apply.', 'warning'); return; }
    const rows = state.segments.map((s, i) => i).filter(i => tab == null || state.segments[i].specialty === tab);
    rows.forEach(i => keys.forEach(k => { state.segments[i][k] = vals[k]; }));
    aiManualEdit([].concat(...rows.map(i => keys.map(k => `segments[${i}].${k}`))));
    const what = keys.map(k => { const f = SEG_FIELD(k); return `${f.label(g)} ${f.unit === 'percent' ? fmt.pct(vals[k]) : fmt.num1(vals[k])}`; }).join(', ');
    audit('assumption', `${tab == null ? 'Applied to all specialties' : `Applied to all deciles of ${specLabel(tab)}`} (${plural(rows.length, 'row')}): ${what}`);
    state.ui.specApply = {};
    toast(tab == null ? `Applied to all ${plural(rows.length, 'specialty × decile row')}` : `Applied to ${plural(rows.length, 'decile row')} of ${specLabel(tab)}`, 'success');
  }

  function runAssumptionsCheck() {
    const issues = [];
    if (stageStatus('setup') !== 'complete') issues.push({ where: 'Inputs', message: 'Inputs changed since they were checked. Run the inputs check on Project and Input again.' });
    const aiWait = aiPendingCount();
    if (aiWait) issues.push({ where: 'AI values', message: `${plural(aiWait, 'AI value')} still pending. Accept, edit or reject each one first.` });
    const inp = buildInputs();
    if (valueOnlyBlocked()) issues.push({ where: 'Segmentation type', message: CS7_TEXT, target: 'c-method-a' });
    if (valueMode() === 'chain' && method() !== 'workload' && !isNum(ma().value.sizingStartYear)) issues.push({ where: 'Sizing start year', message: 'Enter the sizing start year; no default is assumed.', path: 'methodAssumptions.value.sizingStartYear', target: 'v-start' });
    const mine = new Set();
    state.segments.forEach((s, i) => visibleFields().filter(f => f.owner === 'sizing').forEach(f => {
      const lbl = f.label(state.project.grain), path = `segments[${i}].${f.id}`;
      const e = s[f.id] == null ? `${lbl} is required` : liveCellError(s, f.id);
      if (e) { issues.push({ where: `Segment ${s.segment} · ${lbl}`, message: e, path }); mine.add(path); }
    }));
    /* P4: uptake per archetype, against its row. The engine's custom-curve and source-note errors are the same rules (shown
       once, from the row); its unknown-archetype / value-only errors restate a missing uptake already listed here. */
    const cIss = curveIssues();
    cIss.forEach(x => { issues.push({ where: x.where, message: x.message, path: x.path, target: x.target }); mine.add(x.path); });
    const rowCovered = cIss.some(x => x.unassigned || /^responseCurve\.assignment\./.test(x.path));
    const covered = e => method() === 'response' && (e.code === 'custom-curve-invalid' || e.code === 'custom-source-missing'
      || (rowCovered && (e.code === 'unknown-archetype' || (e.code === 'response-needs-entity-or-mix' && valueOnlyRuns()) || mixTotalFromUptake(e))));
    const v = safe(() => E.validate(inp), { errors: [{ code: 'engine', path: '', message: 'Validation is unavailable.' }], warnings: [] });
    /* F5: forecast-split errors carry raw amounts in the engine's text; they are reworded with the app's currency formatter. */
    v.errors.filter(e => !mine.has(e.path) && !covered(e)).forEach(e => issues.push({ where: issueWhere(e), message: engineErrText(e), path: e.path }));
    const at = nowIso();
    state.checkRuns.assumptions = { at, issues, warnings: v.warnings };
    if (!issues.length) { state.checkpoints.assumptions = { sig: assumptionsSig(), at }; audit('checkpoint', 'Assumptions check passed'); }
    else { state.checkpoints.assumptions = null; audit('checkpoint', `Assumptions check failed: ${plural(issues.length, 'issue')}`); }
    return issues;
  }
  function assumptionsCheckCard() {
    const run = state.checkRuns.assumptions;
    const passed = stageStatus('assumptions') === 'complete';
    let status;
    if (passed) status = msg('success', `Assumptions check passed ${fmtTime(state.checkpoints.assumptions.at)}.`, { actions: btn({ label: 'Continue to FTE Calculation', act: 'nav', arg: 'result', kind: 'primary', ic: 'chevRight', id: 'go-result' }) }) + warnList(run && run.warnings);
    else if (run && run.issues.length) status = msg('error', checkList(run.issues.slice(0, 25)) + (run.issues.length > 25 ? `<p>…and ${run.issues.length - 25} more.</p>` : ''), { title: `${plural(run.issues.length, 'item')} to resolve before calculating` });
    else if (run) status = msg('warning', 'Assumptions changed since the last check. Run the check again.');
    else status = `<p class="muted">Checks every assumption the method needs for missing, inconsistent or out-of-range values. It must pass before FTE Calculation opens.</p>`;
    return card({ id: 'c-ascheck', title: 'Assumptions check', sub: 'Validation checkpoint 2 of 2.', actions: btn({ label: passed ? 'Run check again' : 'Run assumptions check', act: 'runAssumptions', kind: passed ? 'outline' : 'primary', ic: 'check', id: 'run-assumptions', reason: readOnly() ? 'Read-only role' : aiPendingCount() ? `${plural(aiPendingCount(), 'AI value')} still pending` : '' }), body: status });
  }
  function warnList(ws) {
    if (!ws || !ws.length) return '';
    return `<div class="mt8">${msg('info', `<ul class="plain">${ws.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul>`, { title: 'Notes from the engine' })}</div>`;
  }

  /* ================================================================== 3. FTE CALCULATION */
  function fmtDriver(d) {
    const v = d.value;
    if (typeof v === 'string') return esc(F.OPTION_LABELS.stoppingRule[v] || v);
    if (!isNum(v)) return '—';
    // ROI cutoffs are ratios. Tested first: the engine label carries the basis text "(value ÷ cost)", which matched the money rule below.
    if (/ROI cutoff/i.test(d.label)) return fmt.num(v, 2);
    if (/cost|value|pool|forfeit/i.test(d.label)) return Math.abs(v) < 1000 && v !== 0 ? fmt.money2(v) : fmt.money(v);
    if (/average reach|reach %/i.test(d.label)) return fmt.pct(v);
    if (/planned calls/i.test(d.label)) return `${fmt.num(v, 1)} calls`;
    if (/normalization point/i.test(d.label)) return `${fmt.int(v)} calls`;
    return Math.abs(v) >= 100 ? fmt.int(v) : fmt.num(v, 2);
  }
  function roiLabel(t) {
    if (!t) return F.RESULT_LABELS.roi();
    if (t.roiBasis === 'net') return `${F.RESULT_LABELS.roi()} (net)`;   // F3: gross is the standard basis and is not labelled; a legacy net basis is
    return F.RESULT_LABELS.roi();
  }
  /* F13 (v0.5 fix round): one label, "Targets per rep", on every surface; totals.targetsPerRep is the engine alias of HCPs per rep. */
  const tprTip = g => `Reached ${grainMany(g)} ÷ recommended FTE`;
  /* F2 (v0.5 fix round, controller decision): the reference-workbook range convention, stated in the label. */
  const rangeLabel = g => `Avg calls per reached ${grainOne(g)} (max – min across targets; 0 = not reached)`;
  function kpiTiles(r, g) {
    const t = r.totals, m = r.method;
    const roiSub = m === 'workload' ? 'Not applicable to Workload Buildup' : t.roi == null ? 'Not supported by these inputs' : t.roiBasis === 'net' && isNum(t.roiGross) ? `Gross ratio ${fmt.num(t.roiGross, 2)}` : m === 'affordable' ? 'Retained value ÷ field cost' : 'Contribution ÷ field cost';
    const tiles = [
      [F.RESULT_LABELS.reached(g), fmt.int(t.reached), `of ${fmt.int(t.entities)} ${grainMany(g)}`],
      [F.RESULT_LABELS.totalCalls(), fmt.int(t.totalCalls), 'per year'],
      [F.RESULT_LABELS.avgCallsPerReached(g), fmt.num(t.avgCallsPerReached, 1), 'calls per year'],
      ['Targets per rep', fmt.num(isNum(t.targetsPerRep) ? t.targetsPerRep : t.entitiesPerRep, 1), 'reached, per recommended FTE', tprTip(g)],
      [F.RESULT_LABELS.fieldCost(), t.fieldCost == null ? 'N/A' : { full: fmt.money(t.fieldCost), short: fmt.moneyShort(t.fieldCost) }, t.fieldCost == null ? 'No cost supplied' : isNum(t.costPerCall) ? `${fmt.money2(t.costPerCall)} per call` : ''],
      [roiLabel(t), fmt.roi(t.roi), roiSub]
    ];
    return `<ul class="kpis" aria-label="Supporting measures">${tiles.map(([k, v, s, tip]) => `<li class="kpi"><span class="kpi-k"${tip ? ` title="${esc(tip)}"` : ''}>${esc(k)}</span>${typeof v === 'object' ? `<span class="kpi-v" title="${esc(v.full)}"><span class="v-full">${esc(v.full)}</span><span class="v-short" aria-hidden="true">${esc(v.short)}</span></span>` : `<span class="kpi-v">${esc(v)}</span>`}<span class="kpi-s">${esc(s)}</span></li>`).join('')}</ul>`;
  }
  function heroCard(r) {
    const t = r.totals;
    const d = t.roundingDelta;
    const layers = t.layers ? `<p class="hero-note">${icon('info', 14)}<span>Management implied by spans: ${fmt.num(t.layers.firstLineManagers, 2)} first-line and ${fmt.num(t.layers.secondLineManagers, 2)} second-line managers. Their cost is already inside the cost per call.</span></p>` : '';
    const nd = nonDefaultList(state.resultInputs);
    const rmode = (state.resultInputs && state.resultInputs.shared.fteRounding) || DEFAULTS.fteRounding;
    const rtext = rmode === 'up' ? 'Rounded up to the next whole FTE.' : rmode === 'none' ? 'No rounding applied (methodology option).' : 'To the nearest whole FTE.';
    const raOn = !!(state.resultInputs && (state.resultInputs.methodAssumptions || {}).reallocateExcluded === true && r.method !== 'workload');
    return card({ id: 'c-hero', title: 'Field size', sub: `${esc(methodLabel(r.method))} · engine ${esc(r.engineVersion)} · calculated ${fmtTime(state.resultAt)}${nd.length ? ` · ${esc(nd.join('; '))}` : ''}`, actions: (raOn ? `<span id="hero-realloc">${chip('Reallocation: On', 'chip-info', 'refresh')}</span>` : '') + nonDefaultChip(nd),
      body: `<div class="hero" role="group" aria-label="Raw FTE ${fmt.num(t.rawFte, 2)}, rounded by ${fmt.num(d, 2)}, recommended FTE ${fmt.int(t.recommendedFte)}">
        <div class="hero-part"><span class="hero-k">${esc(F.RESULT_LABELS.rawFte())}</span><span class="hero-raw">${fmt.num(t.rawFte, 2)}</span><span class="hero-s">Sum of unrounded segment FTE</span></div>
        <span class="hero-arrow" aria-hidden="true">${icon('chevRight', 24)}</span>
        <div class="hero-part"><span class="hero-k">Rounding</span><span class="hero-mid">${d >= 0 ? '+' : '−'}${fmt.num(Math.abs(d), 2)}</span><span class="hero-s">${rtext} Segment rows are never rounded first.</span></div>
        <span class="hero-arrow" aria-hidden="true">${icon('chevRight', 24)}</span>
        <div class="hero-part hero-main"><span class="hero-k">${esc(F.RESULT_LABELS.recommendedFte())}</span><span class="hero-num">${rmode === 'none' ? fmt.num(t.recommendedFte, 2) : fmt.int(t.recommendedFte)}</span><span class="hero-s">${esc(grainMany(state.project.grain))}: ${fmt.int(t.reached)} reached</span></div>
      </div>${layers}${kpiTiles(r, state.project.grain)}` });
  }
  /* The engine's forfeited value covers every excluded segment (no reach, no value, below minimum), not only the minimum. */
  const DRIVER_LABEL = { 'Value forfeited below minimum': 'Value forfeited in excluded segments' };
  /* F1 / F3 / F12 (v0.5 fix round), display layer only (the engine's drivers are unchanged):
     - the stopping rule is fixed by the standard method (CS-5), so it is not a "top driver"; the trace keeps it under Standard method;
     - the ROI basis is no longer a choice, so the cutoff reads "Marginal ROI cutoff" (a legacy net basis still says so);
     - the normalization point stays, with a one-line explanation. */
  const DRIVER_HIDDEN = new Set(['Stopping rule']);
  const DRIVER_NOTE = { 'Normalization point (calls)': 'Fixed by the standard method: a scaling point for the response curves, not an input and not a limit on calls.' };
  function driverLabel(d, r) {
    if (/^Marginal ROI cutoff \(/.test(d.label)) return (r && r.totals && r.totals.roiBasis === 'net') ? 'Marginal ROI cutoff (net ROI)' : 'Marginal ROI cutoff';
    return DRIVER_LABEL[d.label] || d.label;
  }
  const shownDrivers = r => (r.drivers || []).filter(d => !DRIVER_HIDDEN.has(d.label));
  /* F4: with reallocation On, a segment dropped by a reallocation pass shows 0 affordable calls in the final run, so its
     reason would read as circular. The evidence comes from the engine's own Off run of the same inputs (a preview run on a
     copy, cached per inputs hash); the UI only words it. */
  function reallocOffRun(r) {
    const ra = r && r.totals && r.totals.reallocation, ri = state.resultInputs;
    if (!ra || !ra.on || !ri || !r.inputsHash) return null;
    const c = state.ui.reallocOffRun;
    if (c && c.hash === r.inputsHash) return c.result;
    const inp = clone(ri); inp.methodAssumptions = Object.assign({}, inp.methodAssumptions, { reallocateExcluded: false });
    const off = safe(() => E.calculate(inp), null);
    const ok = off && !(off.errors || []).length && (off.segments || []).length === r.segments.length ? off : null;
    state.ui.reallocOffRun = { hash: r.inputsHash, result: ok };
    return ok;
  }
  const lcFirst = x => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);
  function exclText(r, s, i) {
    const ra = r.totals.reallocation;
    const base = exclusionLabel(r.method, s.exclusionReason);
    if (!ra || !ra.on || !s.excluded || !isNum(s.excludedInPass) || s.exclusionReason === 'no-reach') return base;
    const off = reallocOffRun(r), o = off && off.segments[i];
    const pass = `Dropped in pass ${fmt.int(s.excludedInPass + 1)}`;
    if (!o) return `${pass}: ${lcFirst(base)}`;
    const one = grainOne((state.resultInputs && state.resultInputs.grain) || state.project.grain);
    const inSeg = ((state.resultInputs && state.resultInputs.segments) || [])[i] || {};
    const strict = ((state.resultInputs && state.resultInputs.methodAssumptions) || {}).minimumBoundary === 'strict';
    const perOne = isNum(o.affordableCallsPerEntity) ? o.affordableCallsPerEntity : null;
    if (o.excluded && o.exclusionReason === 'below-minimum' && isNum(perOne) && isNum(inSeg.minCalls))
      return `${pass}: ${fmt.num(perOne, 1)} calls per ${one}, ${strict ? 'not above' : 'below'} the minimum of ${fmt.num1(inSeg.minCalls)}`;
    if (o.excluded) return `${pass}: ${lcFirst(exclusionLabel(r.method, o.exclusionReason))}`;
    const first = isNum(perOne) ? perOne : o.finalCallsPerEntity;
    return `${pass}: ${lcFirst(base)} (first run ${fmt.num(first, 1)} calls per ${one})`;
  }
  /* CS-3: one specialty filter for Why this result, Segment detail and the trace (state.ui.resSpec; null = all). */
  const resSpecs = r => specialtiesOf(r.segments || []);
  const resSpec = r => { const t = state.ui.resSpec; return t != null && resSpecs(r).includes(t) ? t : null; };
  const inSpec = (r, s) => { const t = resSpec(r); return t == null || s.specialty === t; };
  /* CS-8: specialty tabs on the results. All = one row per specialty (engine rollups.bySpecialty); each specialty tab = its
     deciles. The tab also filters Why this result and the calculation trace. */
  function resFilterCard(r) {
    const sps = resSpecs(r);
    if (!sps.length) return '';
    /* 2026-10-12 review (Kunal): FTE by decile, one tab per specialty. The decile view already existed behind these tabs; the
       label and hint now say so, and each specialty row in the roll-up links to its tab. */
    return card({ id: 'c-resfilter', body: `<p class="lbl mb8">FTE by decile: pick a specialty</p>${specTabs('res-spec', 'resSpec', resSpec(r), sps, 'FTE by decile: pick a specialty')}
      <p class="hint mt8">All specialties shows one row per specialty. Each specialty tab shows its FTE and calls by decile, with the same columns. The tab also filters Why this result and the calculation trace. Totals, the field size and ROI are model-wide; the ROI cutoff is one value for the whole model.</p>` });
  }
  const rollupFor = (r, kind, key) => ((r.rollups && r.rollups[kind]) || []).find(x => x.key === key) || null;
  const callRange = x => (x && isNum(x.avgCallsPerReached) ? `${fmt.num(x.avgCallsPerReached, 1)}${isNum(x.maxCalls) && isNum(x.minCalls) ? ` (${fmt.num1(x.maxCalls)} – ${fmt.num1(x.minCalls)})` : ''}` : '—');
  function specialtyRollupCard(r) {
    const g = state.project.grain, L = F.RESULT_LABELS, t = r.totals, rows = (r.rollups && r.rollups.bySpecialty) || [];
    const spList = resSpecs(r);
    const spLink = x => { const k = spList.indexOf(x.key); return k < 0 ? esc(specLabel(x.key)) : `<button type="button" class="btn-text roll-link" data-act="resSpec" data-arg="${k}" aria-label="Show ${esc(specLabel(x.key))} by decile">${esc(specLabel(x.key))} <span class="muted">· by decile</span>${icon('chevRight', 14)}</button>`; };
    const cols = [['Specialty', spLink, false], [cap(grainMany(g)), x => fmt.int(x.entities), true], ['Accessible', x => fmt.num1(x.accessible), true], ['Reached', x => fmt.num1(x.reached), true],
      [rangeLabel(g), callRange, true], ['Total calls', x => fmt.int(x.totalCalls), true], ['Raw FTE', x => fmt.num(x.rawFte, 2), true],
      ...(r.method !== 'workload' ? [['Allocated value', x => fmt.money(x.allocatedValue), true]] : []), ['Field cost', x => (x.fieldCost == null ? 'N/A' : fmt.money(x.fieldCost)), true]];
    /* F10 (v0.5 fix round): the Total row's allocated value is the sum of the engine roll-up rows above it (the engine has no
       totals.allocatedValue), so the column reads the same as the rows that make it up. */
    const allocs = rows.map(x => x.allocatedValue).filter(isNum);
    const total = { key: 'Total', entities: t.entities, accessible: t.accessible, reached: t.reached, avgCallsPerReached: t.avgCallsPerReached, maxCalls: t.maxCalls, minCalls: t.minCalls, totalCalls: t.totalCalls, rawFte: t.rawFte,
      allocatedValue: allocs.length ? allocs.reduce((a, v) => a + v, 0) : null, fieldCost: t.fieldCost };
    const foot = cols.map((c, ci) => (ci === 0 ? '<th scope="row" class="rowh">Total</th>' : `<td class="num">${c[1](total)}</td>`)).join('');
    return card({ id: 'c-segres', title: 'Results by specialty', sub: `One row per specialty, rolled up by the engine from its specialty × decile rows. Select a specialty (or its tab above) to see its FTE by decile.`,
      body: `<div class="grid-wrap" tabindex="0" role="region" aria-label="Results by specialty"><table class="grid-t res-t roll-t"><thead><tr>${cols.map(c => `<th scope="col" class="${c[2] ? 'num' : ''}">${esc(c[0])}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(x => `<tr>${cols.map((c, ci) => (ci === 0 ? `<th scope="row" class="rowh">${c[1](x)}</th>` : `<td class="num">${c[1](x)}</td>`)).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr>${foot}</tr></tfoot></table></div>
        <ul class="plain notes"><li class="hint">${icon('info', 14)}<span>${esc(L.reached(g))} is expected reach, so it can be fractional. Max – min are the highest and lowest final calls per reached ${esc(grainOne(g))} across the target segments with reach; a segment that is not reached (excluded) counts as 0.</span></li></ul>` });
  }
  function whyCard(r) {
    const g = state.project.grain, t = r.totals;
    const groups = {};
    r.segments.filter(s => inSpec(r, s)).forEach(s => { const k = s.excluded ? 'excluded' : s.binding; (groups[k] = groups[k] || []).push(s); });
    const bindLines = Object.keys(groups).filter(k => k !== 'excluded' && k !== 'none').map(k => `<li><strong>${esc(BINDING_LABEL[k] || k)}</strong> sets the calls in ${plural(groups[k].length, 'segment')}: ${esc(groups[k].map(s => s.segment).join(', '))}</li>`);
    const excl = groups.excluded ? `<li><strong>Excluded</strong>: ${esc(groups.excluded.map(s => `${s.segment} (${exclText(r, s, r.segments.indexOf(s))})`).join('; '))}</li>` : '';
    const ra = t.reallocation;
    const forfeit = isNum(t.forfeitedValue) && t.forfeitedValue > 0 ? `<li><strong>Value forfeited</strong>: ${fmt.money(t.forfeitedValue)} of the ${fmt.money(t.valuePool)} value pool sat in excluded segments and is not redistributed${ra && ra.on === false ? ' (reallocation Off)' : ''}.</li>`
      : ra && ra.on && isNum(ra.reallocatedValue) && ra.reallocatedValue > 0 ? `<li><strong>${esc(F.RESULT_LABELS.reallocatedValue ? F.RESULT_LABELS.reallocatedValue() : 'Value reallocated')}</strong>: ${fmt.money(ra.reallocatedValue)} moved from excluded segments to the covered segments (reallocation On).</li>` : '';
    const notes = (r.warnings || []).filter(w => w.code !== 'value-forfeited');
    const method = notes.filter(w => w.code === 'reach-not-applied-to-contribution');
    const other = notes.filter(w => w.code !== 'reach-not-applied-to-contribution');
    /* 2026-10-12 review: not in the first view of the page. Top drivers moved to the Scenario Summary comparison;
       the binding constraints, value forfeited or reallocated, and the engine notes sit behind a click, like the trace. */
    const nEx = groups.excluded ? groups.excluded.length : 0;
    const label = `Why this result: binding constraints${nEx ? ` (${plural(nEx, 'segment')} excluded)` : ''}${resSpec(r) != null ? `, ${specLabel(resSpec(r))}` : ''}`;
    return card({ id: 'c-why', body: disclosure({ id: 'why', act: 'toggleWhy', open: !!state.ui.whyOpen, label,
      body: `<p class="hint mb8">The constraint that set calls in each segment, and why excluded segments receive no calls. Top drivers are compared across scenarios on Scenario Summary.</p>
        <ul class="why-list">${bindLines.join('')}${excl}${forfeit}${!bindLines.length && !excl ? '<li>No constraint binds.</li>' : ''}</ul>
        ${method.map(w => msg('info', esc(w.message), { title: 'Methodology note' })).join('')}
        ${other.length ? msg('info', `<ul class="plain">${other.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul>`, { title: 'Engine notes' }) : ''}` }) });
  }
  /* ---------- CS-2: value coverage (shortfall) and the optional reallocation, Affordable and Response only */
  const listLabels = (arr, n = 8) => (arr.length > n ? `${arr.slice(0, n).join(', ')} and ${arr.length - n} more` : arr.join(', '));
  function reallocPreviewFor(r) {
    const pv = state.ui.reallocPreview;
    return pv && pv.hash === r.inputsHash ? pv.result : null;
  }
  function coverageCard(r) {
    if (r.method === 'workload' || !isNum(r.totals.poolValue)) return '';
    const t = r.totals, ra = t.reallocation || { on: false, passes: 0, reallocatedValue: 0, excludedByPass: [[]] };
    const ex = r.segments.filter(s => s.excluded).map(s => s.segment);
    const X = fmt.money(t.coveredValue), Y = fmt.money(t.poolValue), Z = fmt.money(Math.max(0, t.poolValue - (t.coveredValue || 0)));
    const line = ra.on
      ? `Reallocation On: covered segments carry ${X} of ${Y} impactable value after ${plural(ra.passes, 'reallocation pass', 'reallocation passes')}; ${fmt.money(ra.reallocatedValue)} was reallocated from excluded segments${ex.length ? ` (${esc(listLabels(ex))})` : ''}.`
      : ex.length ? `Covered segments carry ${X} of ${Y} impactable value; ${Z} sits in excluded segments (${esc(listLabels(ex))}).` : `Covered segments carry ${X} of ${Y} impactable value; no segment is excluded.`;
    const cur = resultIsCurrent(), ro = readOnly();
    let rc = '';
    if (ra.on) {
      rc = `<div class="realloc is-on" id="realloc-card"><div class="row-between"><div><p class="realloc-t">${esc(REALLOC_LABEL)}</p><p class="realloc-state" id="realloc-state">${chip(`On · ${plural(ra.passes, 'pass', 'passes')} · ${fmt.money(ra.reallocatedValue)} reallocated`, 'chip-info', 'refresh')}</p></div>
        ${btn({ label: 'Turn off', act: 'reallocOff', kind: 'outline', ic: 'x', id: 'realloc-off', reason: ro ? 'Read-only role' : !cur ? 'Recalculate first' : '' })}</div>
        <p class="hint">Value of segments that receive no calls is re-spread over the covered segments until no further segment drops out. Turning it off restores the forfeited-value rule and recalculates.</p></div>`;
    } else if (ex.length && state.ui.reallocKept !== r.inputsHash) {
      const pv = cur ? reallocPreviewFor(r) : null;
      let cmp = '';
      if (pv && (pv.errors || []).length) cmp = msg('error', esc(pv.errors.map(engineErrText).join('; ')), { title: 'The preview could not be calculated' });
      else if (pv) {
        const a = r.totals, b = pv.totals, rnd = (state.resultInputs && state.resultInputs.shared.fteRounding) === 'none';
        const pr = pv.totals.reallocation || { passes: 0, excludedByPass: [] };
        const rows = [[F.RESULT_LABELS.rawFte(), x => fmt.num(x.rawFte, 2)], [F.RESULT_LABELS.recommendedFte(), x => (rnd ? fmt.num(x.recommendedFte, 2) : fmt.int(x.recommendedFte))],
          [F.RESULT_LABELS.fieldCost(), x => (x.fieldCost == null ? 'N/A' : fmt.money(x.fieldCost))], [roiLabel(a), x => fmt.roi(x.roi)],
          [F.RESULT_LABELS.coveredValue ? F.RESULT_LABELS.coveredValue() : 'Value in covered segments', x => fmt.money(x.coveredValue)], ['Value forfeited', x => fmt.money(x.forfeitedValue)]];
        const passes = (pr.excludedByPass || []).map((g, k) => `<li>Pass ${k + 1}: dropped ${esc(g.length ? listLabels(g, 12) : 'none')}</li>`).join('');
        cmp = `<div class="grid-wrap mt8"><table class="grid-t realloc-t" id="realloc-cmp"><thead><tr><th scope="col">Measure</th><th scope="col" class="num">Off (current)</th><th scope="col" class="num">On (preview)</th></tr></thead>
          <tbody>${rows.map(([k, fn]) => `<tr><th scope="row" class="rowh">${esc(k)}</th><td class="num">${fn(a)}</td><td class="num"><strong>${fn(b)}</strong></td></tr>`).join('')}
          <tr><th scope="row" class="rowh">Reallocation passes</th><td class="num">0</td><td class="num"><strong>${fmt.int(pr.passes)}</strong></td></tr></tbody></table></div>
          <p class="lbl mt8">Segments dropped per pass</p><ul class="plain realloc-passes">${passes || '<li>None</li>'}</ul>
          <div class="row-actions">${btn({ label: 'Apply', act: 'reallocApply', kind: 'primary', ic: 'check', id: 'realloc-apply', reason: ro ? 'Read-only role' : '' })}${btn({ label: 'Keep off', act: 'reallocKeep', kind: 'text', ic: 'x', id: 'realloc-keep' })}</div>
          <p class="hint">A preview on a copy of the inputs; nothing changes until you apply it. Applying records the choice, re-runs the assumptions check and recalculates.</p>`;
      }
      rc = `<div class="realloc" id="realloc-card"><div class="row-between"><div><p class="realloc-t">${esc(REALLOC_LABEL)}</p>
        <p class="hint">Optional: re-spread the value that sits in excluded segments over the segments that still receive calls, repeating until no further segment drops out; the ROI cutoff and call limits stay as they are.</p></div>
        ${pv ? '' : btn({ label: 'Preview', act: 'reallocPreview', kind: 'outline', ic: 'refresh', id: 'realloc-preview', reason: ro ? 'Read-only role' : !cur ? 'Recalculate first' : '' })}</div>${cmp}</div>`;
    } else if (ex.length) rc = `<p class="hint" id="realloc-kept">${icon('info', 14)} Reallocation kept Off. You can change it under Value from excluded segments on Model Assumptions.</p>`;
    return card({ id: 'c-cover', title: 'Value coverage', sub: 'How much of the impactable value pool the covered segments carry.',
      body: `<p class="cover-line" id="cover-line">${line}</p>${rc}` });
  }
  function segmentResultCard(r) {
    const g = state.project.grain, L = F.RESULT_LABELS, one = grainOne(g), many = grainMany(g);
    const showAff = r.segments.some(s => isNum(s.affordableCallsPerEntity));
    const spec = resSpecs(r).length > 0, cur = resSpec(r);
    const constraint = (s, i) => (s.excluded ? `<span class="flag">${icon('x', 14)}Excluded: ${esc(exclText(r, s, i))}</span>` : esc(BINDING_LABEL[s.binding] || s.binding));
    /* [key, short header, full label (tooltip), cell, numeric] */
    const cols = [
      ...(spec ? [...(cur == null ? [['specialty', 'Specialty', SEG_FIELD('specialty') ? SEG_FIELD('specialty').label(g) : 'Specialty', s => esc(specLabel(s.specialty)), false]] : []), ['decile', 'Decile', 'Decile', s => esc(decileOf(s)), false]]   // a specialty tab drops the repeated Specialty column
        : [['segment', 'Segment', SEG_FIELD('segment').label(g), s => esc(s.segment), false]]),
      ['entities', cap(many), SEG_FIELD('entities').label(g), s => fmt.int(s.entities), true],
      ['accessible', 'Accessible', L.accessible(g), s => fmt.num1(s.accessible), true],
      ['reached', 'Reached', L.reached(g), s => fmt.num1(s.reached), true],
      ...(showAff ? [['aff', `Affordable / ${one}`, L.affordableCallsPerEntity(g), s => fmt.num(s.affordableCallsPerEntity, 1), true]] : []),
      ['final', `Final / ${one}`, L.finalCallsPerEntity(g), s => fmt.num1(s.finalCallsPerEntity), true],
      ['calls', 'Total calls', L.totalCalls(), s => fmt.int(s.totalCalls), true],
      ['raw', 'Raw FTE', L.rawFte(), s => fmt.num(s.rawFte, 2), true],
      ...(r.method !== 'workload' ? [['alloc', 'Allocated value', 'Allocated value (engine)', s => fmt.money(s.allocatedValue), true]] : []),   // 2026-10-12: same column as the specialty roll-up
      ...(r.method !== 'workload' ? [['roi', 'ROI', L.roi(), s => fmt.roi(s.roi), true]] : []),
      ['split', 'Split', L.planningAllocation(), (s, i) => fmt.int(r.planningAllocation[i]), true],
      ['bind', 'Constraint', 'Binding constraint, or why the segment is excluded', constraint, false]
    ];
    const t = r.totals;
    const idx = r.segments.map((s, i) => i).filter(i => inSpec(r, r.segments[i]));
    const sum = fn => idx.reduce((a, i) => a + (isNum(fn(r.segments[i], i)) ? fn(r.segments[i], i) : 0), 0);
    const ru = cur == null ? null : rollupFor(r, 'bySpecialty', cur);   // CS-8: the specialty subtotal is the engine roll-up
    const totals = cur == null ? { entities: fmt.int(t.entities), accessible: fmt.num1(t.accessible), reached: fmt.num1(t.reached), calls: fmt.int(t.totalCalls), raw: fmt.num(t.rawFte, 2), split: fmt.int(r.planningAllocation.reduce((a, b) => a + b, 0)), alloc: fmt.money(sum(s => s.allocatedValue)) }
      : ru ? { entities: fmt.int(ru.entities), accessible: fmt.num1(ru.accessible), reached: fmt.num1(ru.reached), calls: fmt.int(ru.totalCalls), raw: fmt.num(ru.rawFte, 2), split: fmt.int(sum((s, i) => r.planningAllocation[i])), alloc: isNum(ru.allocatedValue) ? fmt.money(ru.allocatedValue) : fmt.money(sum(s => s.allocatedValue)) }
      : { entities: fmt.int(sum(s => s.entities)), accessible: fmt.num1(sum(s => s.accessible)), reached: fmt.num1(sum(s => s.reached)), calls: fmt.int(sum(s => s.totalCalls)), raw: fmt.num(sum(s => s.rawFte), 2), split: fmt.int(sum((s, i) => r.planningAllocation[i])), alloc: fmt.money(sum(s => s.allocatedValue)) };
    const notes = [`<strong>Reached</strong> is the expected number reached (${esc(many)} × reach %), so it can be fractional.`,
      `<strong>${esc(L.planningAllocation())}</strong>: whole FTE per segment that add up to the recommended FTE.`];
    const raOn = !!(t.reallocation && t.reallocation.on);
    if (r.method === 'response') notes.push(`<strong>Reached</strong> can be below <strong>Accessible</strong> because ${esc(many)} with no profitable call are excluded.`);
    if (r.method === 'affordable') notes.push(raOn ? `<strong>Reached</strong> equals <strong>Accessible</strong> unless the segment is excluded; an excluded segment reaches 0 and, with reallocation On, its value is re-spread over the covered segments.`
      : `<strong>Reached</strong> equals <strong>Accessible</strong> unless the segment is excluded; an excluded segment reaches 0 and its value is forfeited, not redistributed.`);
    if (cur != null) notes.push(`Showing the ${plural(idx.length, 'row')} of ${esc(specLabel(cur))}; the last row is their subtotal.`);
    const nc = spec && cur == null ? 2 : 1;
    return card({ id: 'c-segres', title: cur != null ? `FTE by decile: ${specLabel(cur)}` : 'Segment detail', sub: cur != null ? `Each decile of ${esc(specLabel(cur))}, with its subtotal. Hover a column header for its full name.` : 'Every segment behind the total. Hover a column header for its full name.',
      body: `<div class="grid-wrap" tabindex="0" role="region" aria-label="Segment results table"><table class="grid-t res-t"><thead><tr>${cols.map(c => `<th scope="col" class="${c[4] ? 'num' : ''}"><abbr title="${esc(c[2])}">${esc(c[1])}</abbr></th>`).join('')}</tr></thead>
        <tbody>${idx.map(i => { const s = r.segments[i]; return `<tr class="${s.excluded ? 'is-excluded' : ''}">${cols.map((c, ci) => ci === 0 ? `<th scope="row" class="rowh">${c[3](s, i)}</th>` : `<td class="${c[4] ? 'num' : ''}">${c[3](s, i)}</td>`).join('')}</tr>`; }).join('')}</tbody>
        <tfoot><tr>${cols.map((c, ci) => ci === 0 ? `<th scope="row" class="rowh">${cur == null ? 'Total' : `Subtotal ${esc(specLabel(cur))}`}</th>` : ci < nc ? '<td></td>' : `<td class="${c[4] ? 'num' : ''}">${totals[c[0]] || ''}</td>`).join('')}</tr></tfoot></table></div>
        <ul class="plain notes">${notes.map(n => `<li class="hint">${icon('info', 14)}<span>${n}</span></li>`).join('')}</ul>` });
  }
  /* F1 / F7b: fixed settings of the standard method (CS-5) stay in the trace, named as such rather than as choices. */
  const TRACE_STD = new Set(['Stopping rule', 'Carryover convention', 'Response options']);
  const traceStepLabel = s => (TRACE_STD.has(s.step) ? `Standard method · ${s.step}` : s.step);
  function traceCard(r) {
    const open = state.ui.traceOpen, cur = resSpec(r), all = r.trace || [];
    const steps = cur == null ? all.map((s, i) => [s, i]) : all.map((s, i) => [s, i]).filter(([s]) => `${s.step} ${s.formula}`.includes(`${cur} · `));
    return card({ id: 'c-trace', body: disclosure({ id: 'trace', act: 'toggleTrace', open, label: cur == null ? `Calculation trace (${plural(all.length, 'step')})` : `Calculation trace (${fmt.int(steps.length)} of ${plural(all.length, 'step')}, ${specLabel(cur)})`,
      body: `<p class="hint mb8">Every step the engine took, in order, with the formula as evaluated.${cur != null ? ` Filtered to the steps that name a ${esc(specLabel(cur))} segment; model-wide steps are shown under All specialties.` : ''}${rq(` Inputs hash ${r.inputsHash}.`)}</p>
        <div class="grid-wrap"><table class="grid-t trace-t"><thead><tr><th scope="col" class="num">#</th><th scope="col">Step</th><th scope="col">Formula</th><th scope="col" class="num">Value</th>${state.showReq ? '<th scope="col">Source</th>' : ''}</tr></thead>
        <tbody>${steps.map(([s, i]) => `<tr><td class="num">${i + 1}</td><td>${esc(traceStepLabel(s))}</td><td class="mono formula">${esc(s.formula)}</td><td class="num">${isNum(s.value) ? (Math.abs(s.value) >= 1000 ? fmt.int(s.value) : fmt.num(s.value, 4)) : '—'}</td>${state.showReq ? `<td class="muted">${esc(s.source)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` }) });
  }

  VIEWS.result = function () {
    if (stageStatus('result') === 'locked') return lockedView('result');
    const r = state.result, current = resultIsCurrent();
    const asOk = stageStatus('assumptions') === 'complete';
    const reason = readOnly() ? 'Read-only role' : valueOnlyBlocked() ? 'Response Curve needs value + behaviour segmentation (see Model Assumptions)' : !asOk ? 'Pass the assumptions check on Model Assumptions first' : '';
    const calcBtn = btn({ label: r ? 'Recalculate' : 'Calculate FTE', act: 'calculate', kind: 'primary', ic: r ? 'refresh' : 'calc', id: 'calc', reason });
    let top = card({ id: 'c-calc', title: 'Calculation', sub: `Deterministic: the same inputs always give the same field size. Method: ${esc(methodLabel(method()))}.`, actions: calcBtn,
      body: !r ? `<p class="muted">Nothing calculated yet. Calculate to see the field size and how it was reached.</p>` : `<p class="muted">Last calculated ${fmtTime(state.resultAt)} with ${esc(r.engineVersion)}.</p>` });
    if (r && !current) top += msg('warning', `Inputs or assumptions changed after this result was calculated (${fmtTime(state.resultAt)}). The figures below do not reflect the current inputs. Recalculate before saving a scenario.`, { title: 'Result is out of date', id: 'stale-banner', actions: asOk && !readOnly() ? btn({ label: 'Recalculate now', act: 'calculate', kind: 'outline', ic: 'refresh', id: 'calc-stale' }) : btn({ label: 'Go to Model Assumptions', act: 'nav', arg: 'assumptions', kind: 'outline', id: 'stale-go' }) });
    if (!r) return top;
    if ((r.errors || []).length) return top + msg('error', `<ul class="plain">${r.errors.map(e => `<li><strong>${esc(issueWhere(e))}:</strong> ${esc(engineErrText(e))}</li>`).join('')}</ul>`, { title: 'The engine could not calculate' });
    const next = current ? card({ body: `<div class="row-between"><span>Happy with this result? Save it as an immutable scenario snapshot to compare and recommend.</span>${btn({ label: 'Go to Scenario Summary', act: 'nav', arg: 'scenarios', kind: 'outline', ic: 'chevRight', id: 'go-scen' })}</div>` }) : '';
    const segCard = resSpecs(r).length && resSpec(r) == null && r.rollups && Array.isArray(r.rollups.bySpecialty) && r.rollups.bySpecialty.length ? specialtyRollupCard(r) : segmentResultCard(r);
    return `${top}<div class="${current ? '' : 'is-stale'}">${heroCard(r)}${coverageCard(r)}${resFilterCard(r)}${aiWhyCard(r)}${segCard}${whyCard(r)}${traceCard(r)}</div>${next}`;
  };

  /* ================================================================== 4. SCENARIO SUMMARY */
  const objectives = () => (SAMPLE && SAMPLE.objectives) || ['Balanced', 'Coverage-led', 'Efficiency-led'];
  const defaultName = v => `${state.project.brand || 'Untitled brand'} · ${methodLabel(method())} · ${aiAdoptionIdea() || state.objective} · v${v}`;
  const scen = id => state.scenarios.find(s => s.id === id);
  const recommended = () => state.scenarios.find(s => s.recommended) || null;
  function saveReason() {
    if (readOnly()) return 'Read-only role';
    if (!state.result) return 'Calculate a result first';
    if (!resultIsCurrent()) return 'The result is out of date. Recalculate first';
    if ((state.result.errors || []).length) return 'Resolve the calculation errors first';
    return '';
  }
  function recommendReason(s) {
    if (readOnly()) return 'Read-only role';
    if (!CAN_BUILD.includes(state.role)) return 'Only a Sizing Analyst or Engagement Lead marks the recommendation';
    const rec = recommended();
    if (s.recommended) return 'Already the recommended scenario';
    if (rec && rec.status === 'approved') return `${rec.name} is approved and locked as the recommendation. Clone it to revise.`;
    if (rec && rec.status === 'in_review') return `${rec.name} is in review. Wait for the decision before changing the recommendation.`;
    return '';
  }
  VIEWS.scenarios = function () {
    if (stageStatus('scenarios') === 'locked') return lockedView('scenarios');
    const v = state.seq + 1;
    const nameVal = state.draftName != null ? state.draftName : defaultName(v);
    const parent = state.parentId ? scen(state.parentId) : null;
    const reason = saveReason();
    const saveCard = card({ id: 'c-save', title: 'Save the current result as a scenario', sub: 'A snapshot freezes the inputs, assumptions, result and data source. It can never be edited; clone it to make changes.',
      body: `${parent ? `<p class="src-line">${icon('copy')}<span>Working draft cloned from <strong>${esc(parent.name)}</strong></span></p>` : ''}
        <div class="grid g3">
          <div class="obj-field">${textInput({ id: 'sc-objective', bind: 'objective', value: state.objective, label: 'Objective', hint: 'Free text: a label for the scenario’s intent. It does not change the calculation and nothing is ranked by it.' })}<div class="obj-sugg" role="group" aria-label="Objective suggestions"><span class="hint">Suggestions:</span> ${objectives().map((o, k) => btn({ label: o, act: 'setObjective', arg: o, kind: 'text', id: `obj-sugg-${k}`, small: true, reason: readOnly() ? 'Read-only role' : '' })).join('')}</div></div>
          ${textInput({ id: 'sc-name', bind: 'draftName', value: nameVal, label: 'Scenario name', hint: 'Default: brand · method · objective · version. Edit freely.', cls: 'span2' })}
        </div>
        <div class="row-actions">${btn({ label: 'Save snapshot', act: 'saveSnapshot', kind: 'primary', ic: 'save', id: 'save-snap', reason })}${rq('FR-25, FR-36')}${state.draftName != null ? btn({ label: 'Reset to default name', act: 'resetName', kind: 'text', id: 'reset-name' }) : ''}</div>
        ${reason && !readOnly() ? `<p class="hint">${icon('info', 14)} ${esc(reason)}.</p>` : ''}` });
    /* Before any candidate is adopted there is nothing to save; the AI path shows candidates and the (empty) comparison only. */
    const showSave = !(aiOn() && !state.result && !state.scenarios.length && !method());
    return aiCandidatesCard() + (showSave ? saveCard : '') + compareCard() + aiCompareCard();
  };
  /* CS-8: modelled on the reference "Sizing summary – scenarios": sizing assumptions, sizing outcomes (engine totals and
     roll-ups), then average calls per reached HCP by decile per scenario. The earlier long comparison stays under Scenario detail. */
  const capText = sh => (sh.capacityInput && sh.capacityInput.mode === 'derived' ? `${fmt.int(sh.capacityInput.workingDays)} days × ${fmt.num1(sh.capacityInput.callsPerDay)} calls/day` : `${fmt.int(sh.capacity)} calls (entered)`);
  const reallocText = s => (s.inputs.method === 'workload' ? 'Not applicable' : (s.inputs.methodAssumptions || {}).reallocateExcluded === true ? 'Reallocated to covered segments' : 'Forfeited');
  /* 2026-10-12 review (Melissa): top drivers live here, side by side, so their effect is read across scenarios rather than
     on one FTE page. Values are the engine's drivers for each snapshot; a value that differs from the first scenario is highlighted. */
  function driverRows(list) {
    const keyOf = (d, s) => driverLabel(d, s.result);
    const keys = [];
    list.forEach(s => shownDrivers(s.result || {}).forEach(d => { const k = keyOf(d, s); if (!keys.includes(k)) keys.push(k); }));
    if (!keys.length) return [];
    const valOf = (s, k) => { const d = shownDrivers(s.result || {}).find(x => keyOf(x, s) === k); return d ? fmtDriver(d) : '—'; };
    return [['Top drivers', null]].concat(keys.map(k => {
      const base = valOf(list[0], k);
      const eff = (shownDrivers(list[0].result || {}).find(x => keyOf(x, list[0]) === k) || {}).effect;
      return [k, s => { const v = valOf(s, k); return list.length > 1 && v !== base ? `<span class="cmp-diff">${v}</span>` : v; }, eff];
    }));
  }
  /* 2026-10-12 review (Kunal): the comparison shows key assumptions only; "View all" opens every assumption the snapshot
     was calculated with (read-only, from the saved inputs). Which assumptions stay in the table is pending Kunal's list. */
  function allAssumptionsHtml(sc) {
    const i = sc.inputs, sh = i.shared || {}, o = i.methodAssumptions || {}, g = state.project.grain, m = i.method;
    const row = (k, v) => `<tr><th scope="row" class="rowh">${esc(k)}</th><td>${v}</td></tr>`;
    const tbl = (h, rows) => rows.length ? `<h3 class="sub-h">${esc(h)}</h3><div class="grid-wrap"><table class="grid-t kv-t"><tbody>${rows.join('')}</tbody></table></div>` : '';
    const cost = [];
    cost.push(row('Method', esc(methodLabel(m))), row('Grain', esc(cap(grainMany(i.grain || g)))), row('Capacity', esc(capText(sh))));
    if (sh.repCost != null) {
      cost.push(row('Cost mode', esc(F.OPTION_LABELS.costMode[sh.costMode] || sh.costMode)), row('Annual rep cost', fmt.money(sh.repCost)));
      if (sh.costMode === 'layers' && sh.layers) cost.push(row('Reps per first-line manager', fmt.num1(sh.layers.flmSpan)), row('First-line manager cost', fmt.money(sh.layers.flmCost)), row('First-line managers per second-line manager', fmt.num1(sh.layers.slmSpan)), row('Second-line manager cost', fmt.money(sh.layers.slmCost)));
      cost.push(row('Annual cost inflation', fmt.pct(sh.inflationPct)), row('Discount rate', fmt.pct(sh.discountRatePct)));
    }
    if (sh.horizon) cost.push(row('Horizon', `${fmt.int(sh.horizon.windowYears)}-year window + ${fmt.int(sh.horizon.tailYears)}-year tail`));
    cost.push(row('FTE rounding', esc(OL('fteRounding')[sh.fteRounding || DEFAULTS.fteRounding] || sh.fteRounding)));
    const meth = [];
    if (m !== 'workload') {
      meth.push(row('Value allocation', esc(F.OPTION_LABELS.allocation[o.allocation] || o.allocation || '—')));
      if (m === 'affordable') meth.push(row('Total ROI cutoff', fmt.num(o.totalRoiCutoff, 2)));
      if (m === 'response') meth.push(row('Marginal ROI cutoff', `${fmt.num(o.cutoff, 2)}${o.roiBasis === 'net' ? ' (net)' : ''}`), row('Normalization point', `${fmt.int(o.scenarioMaxCalls)} calls`));
      meth.push(row('Value from excluded segments', esc(reallocText(sc))));
      const v = o.value || {};
      if (isNum(v.annualValue) && !Array.isArray(v.years)) meth.push(row('Annual impactable value', fmt.money(v.annualValue)));
      else { meth.push(row('Sizing start year', isNum(v.sizingStartYear) ? String(v.sizingStartYear) : '—'), row('Gross margin', fmt.pct(v.grossMarginPct))); }
    }
    const nd = nonDefaultList(i);
    meth.push(row('Methodology', nd.length ? esc(nd.join('; ')) : 'Standard method'));
    const v = o.value || {};
    const fc = m !== 'workload' && Array.isArray(v.years) && v.years.length ? `<h3 class="sub-h">Brand forecast and value build-up</h3><div class="grid-wrap"><table class="grid-t"><thead><tr><th scope="col">Year</th><th scope="col" class="num">Brand forecast</th><th scope="col" class="num">Carryover into year</th><th scope="col" class="num">Other channels</th><th scope="col" class="num">${esc(IMP_LABEL)} (entered)</th></tr></thead><tbody>${v.years.map(y => `<tr><th scope="row" class="rowh">${esc(String(y.year))}</th><td class="num">${fmt.money(y.forecast)}</td><td class="num">${fmt.pct(y.carryoverPct)}</td><td class="num">${fmt.pct(y.otherChannelPct)}</td><td class="num">${isNum(y.sfPct) ? fmt.pct(y.sfPct) : '<span class="muted">blank</span>'}</td></tr>`).join('')}</tbody></table></div>` : '';
    let curves = '';
    if (m === 'response' && E && E.archetypesFor) {
      /* P4 (§6.4): uptake per archetype with the effective δ/γ/ρ (archetypes from the snapshot's curves; an older snapshot
         without curves used the reference curves) and the configuration version. */
      const A = E.archetypesFor(o), list = snapArchetypes(i);
      const cfgV = sc.responseCurveConfig && isNum(sc.responseCurveConfig.version) ? `<p class="muted">${esc(RCL.configVersionText(sc.responseCurveConfig.version))}</p>` : '';
      curves = `<h3 class="sub-h">${esc(RCL.summaryHeading)}</h3>${cfgV}<div class="grid-wrap"><table class="grid-t"><thead><tr><th scope="col">${esc(RCL.archetype)}</th><th scope="col">${esc(RCL.preset)}</th>${RC_PARAMS.map(k => `<th scope="col" class="num">${esc(RCL[k])}</th>`).join('')}<th scope="col" class="num">${esc(RCL.halfOfPeak)}</th></tr></thead><tbody>${list.map(a => { const c = A[a] || {};
        return `<tr><th scope="row" class="rowh">${esc(rcName(a))}</th><td>${esc(curveSourceText(o, a))}</td>${RC_PARAMS.map(k => `<td class="num">${esc(rawNum(c[k]))}</td>`).join('')}<td class="num">${curveOk(c) ? fmt.num(halfAt(c), 2) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
    const segs = i.segments || [];
    const sc2 = m === 'workload' ? [['reachPct', 'Reach %', x => fmt.pct(x)], ['plannedCalls', 'Planned calls', x => fmt.int(x)]]
      : [['reachPct', 'Reach %', x => fmt.pct(x)], ['maxCalls', 'Maximum calls', x => fmt.int(x)], ['minCalls', 'Minimum calls', x => fmt.int(x)]];
    const segT = segs.length ? `<h3 class="sub-h">Segment sizing controls</h3><div class="grid-wrap"><table class="grid-t"><thead><tr><th scope="col">${segs.some(x => x.specialty != null) ? 'Specialty · decile' : 'Segment'}</th><th scope="col" class="num">${esc(cap(grainMany(g)))}</th>${sc2.map(c => `<th scope="col" class="num">${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${segs.map(x => `<tr><th scope="row" class="rowh">${esc(x.specialty != null ? `${specLabel(x.specialty)} · ${x.decile != null ? x.decile : x.segment}` : x.segment)}</th><td class="num">${fmt.int(x.entities)}</td>${sc2.map(c => `<td class="num">${c[2](x[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="all-asm"><p class="muted">${esc(sc.id)} · v${sc.version} · saved ${fmtTime(sc.createdAt)}. Read-only: these are the inputs the snapshot was calculated with.</p>
      ${tbl('Method, capacity and cost', cost)}${tbl('Method assumptions', meth)}${curves}${fc}${segT}</div>`;
  }
  function compareCard() {
    const list = state.scenarios;
    if (!list.length) return card({ id: 'c-compare', title: 'Scenario comparison', body: `<p class="muted">${aiOn() && !state.result && !method() ? 'No scenarios saved yet. Adopt a candidate above, or set up manually, to save a scenario; each one appears here side by side.' : 'No scenarios saved yet. Save a snapshot above; each one appears here side by side.'}</p>` });
    const g = state.project.grain, L = F.RESULT_LABELS;
    const opt = (s, k) => { const o = s.inputs.methodAssumptions || {}; return o[k]; };
    const T = s => s.result.totals;
    const fte = s => (s.inputs.shared.fteRounding === 'none' ? fmt.num(T(s).recommendedFte, 2) : fmt.int(T(s).recommendedFte));
    const tpr = s => { const t = T(s); return isNum(t.targetsPerRep) ? t.targetsPerRep : t.entitiesPerRep; };
    const sec = label => [label, null];
    const rows = [
      sec('Sizing assumptions'),
      ['Method', s => esc(methodLabel(s.inputs.method))],
      ['ROI cutoff', s => (s.inputs.method === 'affordable' ? fmt.num(opt(s, 'totalRoiCutoff'), 2) + ' total' : s.inputs.method === 'response' ? `${fmt.num(opt(s, 'cutoff'), 2)} ${opt(s, 'roiBasis') === 'net' ? 'net ' : ''}marginal` : 'Not applicable')],
      [`Target ${grainMany(g)} in scope`, s => fmt.int(T(s).entities)],
      ['Value from excluded segments', s => esc(reallocText(s))],
      ['All assumptions', s => btn({ label: 'View all assumptions', act: 'viewAssumptions', arg: s.id, kind: 'text', ic: 'info', id: `va-${s.id}`, small: true })],
      sec('Sizing outcomes'),
      ['Total reps (recommended FTE)', s => `<strong>${fte(s)}</strong>`],
      [`Reached targets (% reach)`, s => { const t = T(s); return `${fmt.int(t.reached)} <span class="muted">(${t.entities > 0 ? fmt.pct(t.reached / t.entities * 100) : '—'})</span>`; }],
      ['Total cost', s => (T(s).fieldCost == null ? 'N/A' : fmt.money(T(s).fieldCost))],
      [rangeLabel(g), s => callRange(T(s))],
      ['Targets per rep', s => fmt.num(tpr(s), 1), tprTip(g)],
      [L.roi(), s => `${fmt.roi(T(s).roi)}${T(s).roiBasis === 'net' ? ' <span class="muted">(net)</span>' : ''}`],
      ...driverRows(list),
      sec('Status'),
      ['Status', s => statusChip(s.status)],
      ['Recommended', s => (s.recommended ? `<span class="rec">${icon('star', 14)}<strong>Recommended</strong></span><span class="cmp-note">“${esc(s.recommendationNote)}” · ${esc(s.recommendedBy)}</span>` : '<span class="muted">No</span>')]
    ];
    /* Origin row only when an AI-proposed snapshot exists, so an AI-free comparison is unchanged. */
    if (list.some(s => s.ai)) rows.splice(1, 0, ['Origin', s => esc(aiOriginText(s))]);
    /* P4 (§6.4): uptake per archetype (Custom with its source note) and the configuration version, when a Response Curve snapshot is compared. */
    if (list.some(s => s.inputs.method === 'response')) rows.splice(rows.findIndex(r => r[0] === 'All assumptions'), 0, [RCL.summaryHeading, s => { const l = uptakeSummary(s); return !l ? esc(RCL.notApplicable) : l.length ? l.map(esc).join('<br>') : '—'; }]);
    const n = list.length + 1;
    const head = list.map(s => `<th scope="col" class="cmp-col"><span class="cmp-name">${esc(s.name)}</span><span class="cmp-meta">${esc(s.id)} · v${s.version}${s.parentId ? ` · from ${esc(s.parentId)}` : ''}</span></th>`).join('');
    const body = rows.map(([k, fn, tip]) => (fn ? `<tr><th scope="row" class="rowh"${tip ? ` title="${esc(tip)}"` : ''}>${esc(k)}</th>${list.map(s => `<td>${fn(s)}</td>`).join('')}</tr>` : `<tr class="cmp-sec"><th scope="colgroup" colspan="${n}">${esc(k)}</th></tr>`)).join('');
    const actions = `<tr class="cmp-actions"><th scope="row" class="rowh">Actions</th>${list.map(s => `<td><div class="act-stack">
        ${btn({ label: 'Mark as recommended', act: 'recommend', arg: s.id, kind: s.recommended ? 'outline' : 'outline', ic: 'star', id: `rec-${s.id}`, reason: recommendReason(s), small: true })}
        ${btn({ label: 'Clone to new draft', act: 'clone', arg: s.id, kind: 'text', ic: 'copy', id: `clone-${s.id}`, reason: readOnly() ? 'Read-only role' : '' })}
        ${btn({ label: 'Rename', act: 'rename', arg: s.id, kind: 'text', ic: 'edit', id: `ren-${s.id}`, reason: readOnly() ? 'Read-only role' : s.status === 'approved' ? 'Approved scenarios are locked' : s.status === 'in_review' ? 'In review: wait for the decision' : '' })}</div></td>`).join('')}</tr>`;
    /* Second table: average calls per reached entity by decile (engine rollups.byDecile), with its max – min range. */
    const keys = [];
    list.forEach(s => ((s.result.rollups && s.result.rollups.byDecile) || []).forEach(x => { if (!keys.includes(x.key)) keys.push(x.key); }));
    const decTable = keys.length ? `<h3 class="sub-h mt16">Avg calls per reached ${esc(grainOne(g))} by decile (max – min across targets; 0 = not reached)</h3>
      <div class="grid-wrap" tabindex="0" role="region" aria-label="Average calls by decile per scenario"><table class="grid-t cmp-t cmp-dec-t" id="cmp-decile"><thead><tr><th scope="col">Decile</th>${list.map(s => `<th scope="col" class="cmp-col num"><span class="cmp-name">${esc(s.name)}</span><span class="cmp-meta">${esc(s.id)}</span></th>`).join('')}</tr></thead>
      <tbody>${keys.map(k => `<tr><th scope="row" class="rowh">${esc(k)}</th>${list.map(s => `<td class="num">${callRange(rollupFor(s.result, 'byDecile', k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    /* Scenario detail: the earlier long comparison (also the "Scenario detail" export sheet), so nothing is lost. */
    const detailRows = [
      [L.rawFte(), s => fmt.num(T(s).rawFte, 2)],
      [L.totalCalls(), s => fmt.int(T(s).totalCalls)],
      ['Allocation', s => (opt(s, 'allocation') ? esc(F.OPTION_LABELS.allocation[opt(s, 'allocation')]) : '—')],
      ['Forecast inputs', s => { const v = opt(s, 'value'); return v && Array.isArray(v.years) ? esc(fcInputsText(v)) : v && isNum(v.annualValue) ? 'Annual impactable value entered' : '—'; }],
      ['Capacity', s => esc(capText(s.inputs.shared))],
      ['Cost mode', s => (s.inputs.shared.repCost == null ? 'No cost' : esc(F.OPTION_LABELS.costMode[s.inputs.shared.costMode]))],
      ['Methodology', s => { const nd = nonDefaultList(s.inputs); return nd.length ? `${nonDefaultChip(nd)}<span class="cmp-note">${esc(nd.join('; '))}</span>` : 'Standard method'; }],
      ['Data source', s => (s.provenance ? esc(s.provenance.path === 'file' ? s.provenance.fileName : 'Synthetic sample data') : '—')]
    ];
    const detail = disclosure({ id: 'cmp-detail', act: 'toggleCmpDetail', open: !!state.ui.cmpDetailOpen, label: 'Scenario detail', body: `<div class="grid-wrap" tabindex="0" role="region" aria-label="Scenario detail"><table class="grid-t cmp-t"><thead><tr><th scope="col">Measure</th>${head}</tr></thead>
      <tbody>${detailRows.filter(([, fn]) => list.some(s => fn(s) !== '—')).map(([k, fn]) => `<tr><th scope="row" class="rowh">${esc(k)}</th>${list.map(s => `<td>${fn(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` });
    return card({ id: 'c-compare', title: 'Scenario comparison', sub: 'Shown in the order saved. Nothing is scored or ranked; you decide which to recommend, with a short note.',
      body: `<div class="grid-wrap" tabindex="0" role="region" aria-label="Scenario comparison table, scrolls horizontally"><table class="grid-t cmp-t" id="cmp-main"><thead><tr><th scope="col">Measure</th>${head}</tr></thead><tbody>${body}${actions}</tbody></table></div>${decTable}<div class="mt16">${detail}</div>` });
  }

  /* ================================================================== 5. REVIEW AND EXPORT */
  /* PRD §4: the Engagement Lead has every analyst permission plus approve/reject. BR-06 is person-level:
     whoever recommended or submitted a scenario cannot approve it (compared by user, not by role). */
  const CAN_BUILD = ['analyst', 'lead'];
  const PERMS = {
    analyst: 'Builds scenarios, marks the recommendation, submits for review, exports. Cannot approve.',
    lead: 'Everything an analyst can do, including marking the recommendation and submitting for review, plus approving or rejecting. Cannot approve a scenario they recommended or submitted, and cannot edit an approved scenario.',
    admin: 'Views everything and manages access. Whether an administrator may approve is TBD in the PRD.'
  };
  /* BR-06 (person-level): the approver must not be the person who recommended or submitted the scenario. */
  function selfApprovalReason(s) {
    const who = curUser().name;
    const did = [s.recommendedBy === who ? 'recommended' : '', s.submittedBy === who ? 'submitted' : ''].filter(Boolean);
    const other = LEAD_KEYS.map(k => users[k].name).filter(n => n !== who && n !== s.recommendedBy && n !== s.submittedBy);
    const hint = state.role !== 'lead' ? '' : other.length ? ` In this demo, switch to ${other.join(' or ')} under Viewing as.` : ' No other Engagement Lead in this demo can approve it; reject it (this withdraws it) and recommend a clone.';
    return did.length ? `You ${did.join(' and ')} this scenario, so you cannot approve it. Another Engagement Lead must approve it (BR-06).${hint}` : '';
  }
  function reviewActions(s) {
    const role = state.role, st = s.status;
    const out = [];
    if (st === 'draft' || st === 'rejected') {
      const reason = role === 'admin' ? 'Read-only role' : !CAN_BUILD.includes(role) ? 'Only a Sizing Analyst or Engagement Lead submits for review.' : st === 'rejected' ? 'Rejected snapshots cannot be resubmitted. Clone, revise, save and recommend the new version.' : !s.recommended ? 'Only the recommended scenario is submitted' : (s.result.errors || []).length ? 'The snapshot has calculation errors' : '';
      out.push(btn({ label: 'Submit for review', act: 'submit', arg: s.id, kind: 'primary', ic: 'chevRight', id: 'rv-submit', reason }));
    }
    if (st === 'in_review') {
      let reason = '';
      if (role === 'admin') reason = 'TBD in PRD';
      else if (role === 'analyst') reason = 'Analysts cannot approve. Switch to Engagement Lead.';
      else if (role !== 'lead') reason = 'Only an Engagement Lead approves or rejects.';
      out.push(btn({ label: 'Reject', act: 'decide', arg: `${s.id}:rejected`, kind: 'outline', ic: 'x', id: 'rv-reject', reason }));
      out.push(btn({ label: 'Approve', act: 'decide', arg: `${s.id}:approved`, kind: 'primary', ic: 'check', id: 'rv-approve', reason: reason || selfApprovalReason(s) }) + rq('FR-32, FR-34, BR-06'));
    }
    if (st === 'approved' || st === 'rejected') out.push(btn({ label: 'Clone to new draft', act: 'clone', arg: s.id, kind: 'outline', ic: 'copy', id: 'rv-clone', reason: role === 'admin' ? 'Read-only role' : '' }));
    return out.join('');
  }
  function statusTrack(s) {
    const steps = [['draft', 'Draft'], ['in_review', 'In review'], [s.status === 'rejected' ? 'rejected' : 'approved', s.status === 'rejected' ? 'Rejected' : 'Approved']];
    const idx = s.status === 'draft' ? 0 : s.status === 'in_review' ? 1 : 2;
    return `<ol class="track" aria-label="Approval status (not interactive)">${steps.map(([k, l], i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}" ${i === idx ? 'aria-current="step"' : ''}>${icon(i < idx ? 'check' : i === idx ? (k === 'rejected' ? 'x' : k === 'approved' ? 'lock' : 'dot') : 'circle', 14)}<span>${l}</span></li>`).join('')}</ol>`;
  }
  function snapshotSummary(s) {
    const t = s.result.totals, g = state.project.grain, L = F.RESULT_LABELS, p = state.project;
    const i = s.inputs, o = i.methodAssumptions || {};
    const lock = s.status === 'approved' ? msg('success', `Approved by <strong>${esc(s.approvedBy)}</strong> on ${fmtTime(s.approvedAt)}. This snapshot is locked; changes need a clone${rq('FR-35')}.${s.reviewComment ? `<br>Comment: “${esc(s.reviewComment)}”` : ''}`, { title: 'Approved and locked' })
      : s.status === 'rejected' ? msg('error', `Rejected by ${esc(s.reviewedBy)} on ${fmtTime(s.reviewedAt)}: “${esc(s.reviewComment)}”. Clone it to revise.`, { title: 'Rejected' })
      : s.status === 'in_review' ? msg('warning', `Submitted by ${esc(s.submittedBy)} on ${fmtTime(s.submittedAt)}. Waiting for an Engagement Lead decision.`, { title: 'In review' }) : '';
    const nd = nonDefaultList(i);
    return `<div class="rv-head"><div><h3 class="rv-name">${icon('star')}<span>${esc(s.name)}</span></h3><p class="muted">${esc(s.id)} · v${s.version} · saved by ${esc(s.createdBy)} ${fmtTime(s.createdAt)}${s.parentId ? ` · cloned from ${esc(s.parentId)}` : ''}</p></div>${statusChip(s.status)}</div>
      ${statusTrack(s)}${lock}
      <div class="rv-grid">
        <dl class="kvs"><div class="kvs-h">Result</div>
          ${kv(L.rawFte(), fmt.num(t.rawFte, 2))}${kv(L.recommendedFte(), `<strong>${i.shared.fteRounding === 'none' ? fmt.num(t.recommendedFte, 2) : fmt.int(t.recommendedFte)}</strong>`)}${kv(L.reached(g), fmt.int(t.reached))}
          ${kv(L.totalCalls(), fmt.int(t.totalCalls))}${kv(L.avgCallsPerReached(g), fmt.num(t.avgCallsPerReached, 1))}${kv(L.fieldCost(), t.fieldCost == null ? 'N/A' : fmt.money(t.fieldCost))}${kv(L.roi(), fmt.roi(t.roi))}</dl>
        <dl class="kvs"><div class="kvs-h">Method and assumptions</div>
          ${kv('Method', esc(methodLabel(i.method)))}${o.allocation ? kv('Allocation', esc(F.OPTION_LABELS.allocation[o.allocation])) : ''}
          ${i.method === 'response' ? kv('Marginal ROI cutoff', `${fmt.num(o.cutoff, 2)}${o.roiBasis === 'net' ? ' net' : ''}`) : ''}
          ${i.method === 'affordable' ? kv('Total ROI cutoff', fmt.num(o.totalRoiCutoff, 2)) : ''}
          ${i.method !== 'workload' ? kv('Value from excluded segments', esc(reallocText(s))) : ''}
          ${o.value && Array.isArray(o.value.years) ? kv('Forecast inputs', esc(fcInputsText(o.value))) : ''}
          ${i.method === 'response' ? kv(RCL.summaryHeading, (uptakeSummary(s) || []).map(esc).join('<br>') || '—') : ''}
          ${kv('Capacity', esc(capText(i.shared)))}${kv('Cost', i.shared.repCost == null ? 'Not supplied' : esc(F.OPTION_LABELS.costMode[i.shared.costMode]))}
          ${kv('Methodology', nd.length ? `${nonDefaultChip(nd)} ${esc(nd.join('; '))}` : 'Standard method')}</dl>
        <dl class="kvs"><div class="kvs-h">Data and notes</div>
          ${kv('Source', s.provenance ? esc(s.provenance.path === 'file' ? `${s.provenance.fileName} (${s.provenance.inputGrain})` : 'Synthetic sample data') : '—')}
          ${kv('Assumptions', esc(p.dataNotes.assumptions || '—'))}${kv('Limitations', esc(p.dataNotes.limitations || '—'))}${kv('Exclusions', esc(p.dataNotes.exclusions || '—'))}${s.ai ? kv('Origin', esc(aiOriginText(s))) : ''}</dl>
      </div>${aiSnapshotValues(s)}
      <div class="rec-note">${icon('info', 14)}<span><strong>Why recommended</strong> (${esc(s.recommendedBy)}, ${esc(ROLE_LABEL[s.recommendedRole] || '')}): “${esc(s.recommendationNote)}”</span></div>`;
  }
  function auditTable() {
    const rows = state.audit.slice().reverse();
    if (!rows.length) return '<p class="muted">No actions recorded yet.</p>';
    return `<div class="grid-wrap" tabindex="0" role="region" aria-label="Audit trail, scrolls horizontally"><table class="grid-t audit-t"><thead><tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Role</th><th scope="col">Action</th><th scope="col">Scenario</th><th scope="col">Detail</th></tr></thead>
      <tbody>${rows.map(a => `<tr><td class="nowrap">${fmtTime(a.at)}</td><td>${esc(a.user)}</td><td>${esc(ROLE_LABEL[a.role] || a.role)}</td><td>${esc(a.label)}</td><td>${esc(a.scenarioId || '—')}</td><td>${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  /* O7: the second demo Lead is offered when it matters, i.e. once a Lead recommended or submitted a scenario (that Lead cannot
     approve it) or while the second Lead is signed in. Hidden otherwise, so the single-Lead walk-through reads as before. */
  function leadPicker() {
    if (state.role !== 'lead' || LEAD_KEYS.length < 2) return '';
    const names = new Set(LEAD_KEYS.map(k => users[k].name));
    if (state.leadKey === 'lead' && !state.scenarios.some(s => names.has(s.recommendedBy) || names.has(s.submittedBy))) return '';
    return `<div class="bgroup mt8" role="radiogroup" aria-label="Engagement Lead (demo person)">${LEAD_KEYS.map(k => `<button type="button" class="bg-btn${state.leadKey === k ? ' selected' : ''}" role="radio" aria-checked="${state.leadKey === k}" tabindex="${state.leadKey === k ? 0 : -1}" id="lead-${k}" data-act="leadPerson" data-arg="${k}">${icon('user')}<span>${esc(users[k].name)}</span></button>`).join('')}</div>
        <p class="hint mt8">Two fictional Engagement Leads, so one can approve what the other recommended or submitted (BR-06).</p>`;
  }
  VIEWS.review = function () {
    if (stageStatus('review') === 'locked') return lockedView('review');
    const rec = recommended();
    const focus = rec || state.scenarios[state.scenarios.length - 1];
    const roleCard = card({ id: 'c-role', title: 'Viewing as', sub: `${badge('Prototype only', 'badge-warning')} Role switcher for demonstration. In Arc, your role comes from your account.`,
      body: `<div class="bgroup" role="radiogroup" aria-label="Prototype role">${['analyst', 'lead', 'admin'].map(r => `<button type="button" class="bg-btn${state.role === r ? ' selected' : ''}" role="radio" aria-checked="${state.role === r}" tabindex="${state.role === r ? 0 : -1}" id="role-${r}" data-act="role" data-arg="${r}">${icon('user')}<span>${ROLE_LABEL[r]}</span></button>`).join('')}</div>
        ${leadPicker()}
        <p class="hint mt8">${esc(curUser().name)}: ${esc(PERMS[state.role])}</p>` });
    const tabs = [['summary', 'Recommended scenario'], ['audit', `Audit trail (${state.audit.length})`]];
    const tab = state.ui.reviewTab;
    const tablist = `<div class="tabs" role="tablist" aria-label="Review">${tabs.map(([k, l]) => `<button type="button" role="tab" class="tab${tab === k ? ' selected' : ''}" id="tab-${k}" aria-selected="${tab === k}" aria-controls="panel-${k}" tabindex="${tab === k ? 0 : -1}" data-act="tab" data-arg="${k}">${esc(l)}</button>`).join('')}</div>`;
    const summary = rec ? snapshotSummary(rec) + `<div class="row-actions">${reviewActions(rec)}</div>`
      : msg('neutral', 'No scenario is marked as recommended yet. Review works on the recommended snapshot, never on the working model.', { title: 'Nothing to review', actions: btn({ label: 'Go to Scenario Summary', act: 'nav', arg: 'scenarios', kind: 'primary', id: 'rv-go' }) });
    const panel = `<div role="tabpanel" id="panel-${tab}" aria-labelledby="tab-${tab}" tabindex="0" class="tabpanel">${tab === 'summary' ? summary : auditTable()}</div>`;
    const exp = card({ id: 'c-export', title: 'Export to Excel', sub: 'A multi-sheet workbook with assumptions, source and mapping, segment detail, scenario comparison and the audit record, with live formulas.',
      actions: rq('FR-48 (proposed)') + btn({ label: 'Export workbook', act: 'export', kind: 'primary', ic: 'download', id: 'export', reason: !focus ? 'Save a scenario first' : '' }),
      body: focus ? `<p class="muted">Exports <strong>${esc(focus.name)}</strong> ${rec ? '(the recommended snapshot)' : '(latest snapshot; none is recommended yet)'} together with all ${plural(state.scenarios.length, 'scenario')} and the audit trail, as <span class="mono">field-sizing-${esc(slug(focus.name))}.xlsx</span>. ${focus.status === 'approved' ? '' : `Status in the workbook: ${esc(STATUS[focus.status].label)}.`}</p>` : '' });
    return roleCard + card({ id: 'c-review', body: tablist + panel }) + aiReviewerCard(rec) + exp;
  };

  /* ================================================================== response curve configurator (P3, FR-46 proposed)
     Administrator only: the header button exists only for that role and every entry point re-checks it. The view and the
     edit rules live in FSConfigurator (src/ui/configurator.js); here: entry, role gating, dispatch, audit and render.
     Outside the configurator the Administrator stays read-only (readOnly() is unchanged). */
  const CFG = W.FSConfigurator;
  const canConfigure = () => state.role === 'admin' && !!CFG;
  function configButton() {
    if (!canConfigure()) return '';
    /* The visible text hides at narrow widths (head.html .ab-cfg); the aria-label keeps the same accessible name. */
    return `<button type="button" class="btn btn-outline btn-sm ab-cfg" id="open-config" data-act="openConfig" aria-haspopup="dialog" aria-label="${esc(RCL.configuratorOpen)}">${icon('settings')}<span class="ab-cfg-lbl">${esc(RCL.configuratorOpen)}</span></button>`;
  }
  function configRefused() { if (state.dialog && state.dialog.type === 'config') closeDialog(); toast(RCL.configuratorAdminOnly, 'error'); }
  function configRun(cmd, value, focusId) {
    const d = state.dialog;
    if (!canConfigure() || !d || d.type !== 'config') { configRefused(); return; }
    const r = CFG.command(state.config, d.ui, cmd, value, { user: curUser().name, at: nowIso() });
    r.changes.forEach(c => audit('config', c));
    focusAfter(r.focus || focusId || null);
  }
  function configChange(el) {
    const cmd = el.dataset.cfg;
    configRun(cmd, el.type === 'checkbox' ? el.checked : el.value, null);   // focus stays wherever Tab or the pointer moved it
    renderSoon();
  }
  Object.assign(acts, {
    openConfig: el => {
      if (!canConfigure()) { configRefused(); return; }
      openDialog({ type: 'config', ui: CFG.blankUi('presets'), returnFocus: (el && el.id) || 'open-config' });
    },
    cfg: el => {
      const arg = el.dataset.arg || '';
      const name = arg === 'add' ? document.getElementById('cfg-new-name') : null;
      configRun(arg, name ? name.value : undefined, el.id);
      render();
    }
  });

  /* ================================================================== dialogs */
  function openDialog(d) { d.returnFocus = d.returnFocus || (document.activeElement && document.activeElement.id) || null; state.dialog = d; render(); }
  function closeDialog() { const rf = state.dialog && state.dialog.returnFocus; state.dialog = null; if (rf) focusAfter(rf); render(); toastQueue.splice(0).forEach(([t, k]) => toast(t, k)); }
  function methodDiff(from, to) {
    const g = state.inputGrain, gr = state.project.grain;
    const a1 = (state.methodStore[from] || {}).allocation || null, a2 = (state.methodStore[to] || {}).allocation || null;
    const f1 = F.segmentFieldsFor(from, a1, g), f2 = F.segmentFieldsFor(to, a2, g);
    const id1 = new Set(f1.map(f => f.id)), id2 = new Set(f2.map(f => f.id));
    const added = f2.filter(f => !id1.has(f.id)), removed = f1.filter(f => !id2.has(f.id));
    const r1 = F.requiredMapping(from, g), r2 = F.requiredMapping(to, g);
    const newReq = r2.filter(x => !r1.includes(x)), noReq = r1.filter(x => !r2.includes(x));
    const empty = added.map(f => ({ f, n: state.segments.filter(s => s[f.id] == null).length })).filter(x => x.n > 0);
    return { added, removed, newReq, noReq, empty, gr };
  }
  function dialogHtml() {
    const d = state.dialog;
    if (!d) return '';
    let title = '', titleHtml = '', body = '', foot = '', wide = false, style = '';
    const cancel = btn({ label: 'Cancel', act: 'dlgCancel', kind: 'outline', id: 'dlg-cancel' });
    if (d.type === 'methodChange') {
      const from = method(), to = d.to, x = methodDiff(from, to);
      const li = (arr, fn) => arr.length ? `<ul class="plain dl-list">${arr.map(fn).join('')}</ul>` : '<p class="muted">None</p>';
      title = `Change method to ${methodLabel(to)}?`; wide = true;
      body = `<p>Your data stays. These changes follow from the new method:</p>
        <div class="diff"><div><h3 class="sub-h">${icon('plus', 14)} Newly required or shown</h3>${li(x.added, f => `<li>${esc(f.label(x.gr))}</li>`)}${x.newReq.length ? `<p class="hint">New required import columns: ${esc(x.newReq.map(i => MAP_FIELD(i).label).join(', '))}</p>` : ''}</div>
        <div><h3 class="sub-h">${icon('x', 14)} No longer used</h3>${li(x.removed, f => `<li>${esc(f.label(x.gr))} <span class="muted">(kept, but hidden and ignored)</span></li>`)}${x.noReq.length ? `<p class="hint">Import columns no longer required: ${esc(x.noReq.map(i => MAP_FIELD(i).label).join(', '))}</p>` : ''}</div></div>
        ${x.empty.length ? `<p class="mt8">${icon('warn', 14)} Still to fill: ${esc(x.empty.map(e => `${e.f.label(x.gr)} for ${plural(e.n, 'segment')}`).join('; '))}.</p>` : ''}
        <p class="mt8">Method assumptions switch to the ${esc(methodLabel(to))} set. Both validation checks must be run again.</p>${aiCarryNote(to)}`;
      foot = cancel + btn({ label: 'Change method', act: 'dlgConfirm', kind: 'primary', id: 'dlg-ok' });
    } else if (d.type === 'assumptions') {
      const sc = scen(d.id);
      title = `All assumptions: ${sc ? sc.name : d.id}`; wide = true;
      body = sc ? allAssumptionsHtml(sc) : '<p class="muted">This scenario is no longer available.</p>';
      foot = btn({ label: 'Close', act: 'dlgCancel', kind: 'primary', id: 'dlg-ok' });
    } else if (d.type === 'rename') {
      const s = scen(d.id);
      title = 'Rename scenario';
      body = textInput({ id: 'dlg-name', label: 'Scenario name', value: d.draft != null ? d.draft : s.name, error: d.error });
      foot = cancel + btn({ label: 'Save', act: 'dlgConfirm', kind: 'primary', id: 'dlg-ok' });
    } else if (d.type === 'recommend') {
      const s = scen(d.id), cur = recommended();
      title = 'Mark as recommended';
      body = `<p><strong>${esc(s.name)}</strong> becomes the recommendation.${cur ? ` ${esc(cur.name)} will no longer be recommended.` : ''} This is your judgement; the module does not score scenarios.</p>
        <div class="field"><label class="lbl${d.error ? ' is-invalid' : ''}" for="dlg-note">Why this scenario?</label><textarea class="input ta${d.error ? ' is-invalid' : ''}" id="dlg-note" rows="3" maxlength="280" aria-describedby="dlg-note-h">${esc(d.draft || '')}</textarea>
        ${d.error ? `<div class="err" id="dlg-note-h">${esc(d.error)}</div>` : '<div class="hint" id="dlg-note-h">Required, at least 3 characters. One or two sentences, carried into review and the export.</div>'}</div>`;
      foot = cancel + btn({ label: 'Mark as recommended', act: 'dlgConfirm', kind: 'primary', id: 'dlg-ok' });
    } else if (d.type === 'decide') {
      const s = scen(d.id), ok = d.decision === 'approved';
      title = ok ? 'Approve scenario' : 'Reject scenario';
      body = `<p>${ok ? 'Approving locks' : 'Rejecting returns'} <strong>${esc(s.name)}</strong>${ok ? '. It cannot be edited afterwards; changes need a clone.' : ' to whoever submitted it. It cannot be resubmitted; they clone and revise it.'}</p>
        <div class="field"><label class="lbl${d.error ? ' is-invalid' : ''}" for="dlg-note">Comment</label><textarea class="input ta${d.error ? ' is-invalid' : ''}" id="dlg-note" rows="3" maxlength="400" aria-describedby="dlg-note-h">${esc(d.draft || '')}</textarea>
        ${d.error ? `<div class="err" id="dlg-note-h">${esc(d.error)}</div>` : `<div class="hint" id="dlg-note-h">Required, at least 3 characters. Recorded with your name and the time.</div>`}</div>`;
      foot = cancel + btn({ label: ok ? 'Approve' : 'Reject', act: 'dlgConfirm', kind: ok ? 'primary' : 'danger', id: 'dlg-ok' });
    } else if (d.type === 'replace') {
      title = 'Replace the current data?';
      body = `<p>This replaces the ${plural(state.segments.length, 'segment')} already loaded${state.corrections.length ? ` and clears ${plural(state.corrections.length, 'correction')}` : ''}. Both validation checks must be run again.</p>`;
      foot = cancel + btn({ label: 'Replace data', act: 'dlgConfirm', kind: 'danger', id: 'dlg-ok' });
    } else if (d.type === 'aiDiscard') {
      title = `Discard ${plural(d.n, 'pending AI value')}?`;
      const why = { 'method changed': 'Changing the method', 'AI assistance turned off': 'Turning AI assistance off', 'new data loaded': 'Loading new data', 'another candidate adopted': 'Adopting another candidate', 'another scenario cloned': 'Cloning a scenario' }[d.reason] || 'This step';
      body = `<p>${esc(why)} ends the review of <strong>${esc(state.ai.adoption ? state.ai.adoption.idea : 'the adopted candidate')}</strong>. ${plural(d.n, 'value')} ${d.n === 1 ? 'is' : 'are'} still undecided.</p>
        <p>Discarding restores each one to its value from before the proposal and records one rejection per value in the audit trail. ${esc(aiDiscardKeptText(d.reason))}</p>`;
      foot = btn({ label: 'Keep reviewing', act: 'dlgCancel', kind: 'outline', id: 'dlg-cancel' }) + btn({ label: 'Discard pending AI values', act: 'dlgConfirm', kind: 'danger', id: 'dlg-ok' });
    } else if (d.type === 'aiReplace') {
      title = `Replace the working draft with “${d.idea}”?`;
      body = `<p>Unsaved changes in the working draft are lost; saved snapshots are kept.</p><ul class="plain">${d.corrections ? `<li>${plural(d.corrections, 'upstream correction')} ${d.corrections === 1 ? 'is' : 'are'} cleared.</li>` : ''}${d.n ? `<li>${plural(d.n, 'pending AI value')} ${d.n === 1 ? 'is' : 'are'} discarded; each is logged as a rejection.</li>` : ''}</ul>`;
      foot = cancel + btn({ label: 'Replace and review', act: 'dlgConfirm', kind: 'danger', id: 'dlg-ok' });
    } else if (d.type === 'aiEdit') {
      const x = aiEditDialog(d); title = x.title; body = x.body;
      foot = cancel + btn({ label: 'Accept your value', act: 'dlgConfirm', kind: 'primary', id: 'dlg-ok' });
    } else if (d.type === 'config') {
      if (!canConfigure()) return '';
      titleHtml = esc(RCL.configuratorTitle) + rq('FR-46 (proposed)'); wide = true; style = 'width:min(920px, calc(100vw - 24px))';
      body = CFG.view(state.config, d.ui, { icon, fmtTime });
      foot = btn({ label: RCL.configuratorClose, act: 'dlgCancel', kind: 'primary', id: 'cfg-close' });
    }
    return `<div class="overlay" data-act="dlgCancel" aria-hidden="true"></div>
      <div class="dialog${wide ? ' dialog-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-title" id="dlg"${style ? ` style="${style}"` : ''}>
        <div class="dlg-title"><h2 id="dlg-title">${titleHtml || esc(title)}</h2><button type="button" class="ibtn dlg-x" id="dlg-x" data-act="dlgCancel" aria-label="Close dialog">${icon('x')}</button></div>
        <div class="dlg-body">${body}</div><div class="dlg-foot">${foot}</div></div>`;
  }
  function setupDialogFocus() {
    const dlg = document.getElementById('dlg');
    if (!dlg || dlg.contains(document.activeElement)) return;
    const first = (state.dialog && state.dialog.type === 'config' ? dlg.querySelector('[role=tab][aria-selected=true]') : dlg.querySelector('.dlg-body input, .dlg-body textarea')) || dlg.querySelector('#dlg-ok');
    if (first) first.focus();
  }
  function dialogConfirm() {
    const d = state.dialog;
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    if (d.type === 'methodChange') { state.dialog = null; setMethod(d.to); focusAfter(`method-${d.to}`); render(); return; }
    if (d.type === 'rename') {
      const n = val('dlg-name').trim();
      if (!n) { d.error = 'This field is required'; d.draft = ''; render(); return; }
      const s = scen(d.id); updateScenario(d.id, { name: n }); audit('rename', `“${s.name}” → “${n}”`, d.id); closeDialog(); return;
    }
    if (d.type === 'recommend') {
      const note = val('dlg-note').trim();
      if (note.length < 3) { d.error = note.length ? 'Enter at least 3 characters' : 'This field is required. Enter at least 3 characters'; d.draft = note; render(); return; }
      state.scenarios.filter(s => s.recommended && s.id !== d.id).forEach(s => { updateScenario(s.id, { recommended: false }); audit('unrecommend', `${s.name} no longer recommended`, s.id); });
      updateScenario(d.id, { recommended: true, recommendationNote: note, recommendedBy: curUser().name, recommendedRole: state.role, recommendedAt: nowIso() });
      audit('recommend', `Marked as recommended: “${note}”`, d.id);
      toast('Recommendation recorded', 'success'); closeDialog(); return;
    }
    if (d.type === 'decide') {
      const note = val('dlg-note').trim();
      if (note.length < 3) { d.error = note.length ? 'Enter at least 3 characters' : 'This field is required. Enter at least 3 characters'; d.draft = note; render(); return; }
      const who = curUser().name, at = nowIso();
      if (d.decision === 'approved' && (state.role !== 'lead' || selfApprovalReason(scen(d.id)))) { toast(selfApprovalReason(scen(d.id)) || 'Only an Engagement Lead approves.', 'error'); closeDialog(); return; }
      if (d.decision === 'approved') updateScenario(d.id, { status: 'approved', approvedBy: who, approvedAt: at, reviewedBy: who, reviewedAt: at, reviewComment: note });
      else updateScenario(d.id, { status: 'rejected', reviewedBy: who, reviewedAt: at, reviewComment: note });
      audit(d.decision === 'approved' ? 'approve' : 'reject', note, d.id);
      toast(d.decision === 'approved' ? 'Scenario approved and locked' : 'Scenario rejected', d.decision === 'approved' ? 'success' : 'warning'); closeDialog(); return;
    }
    if (d.type === 'replace') { const then = d.then; state.dialog = null; then(); return; }
    if (d.type === 'aiEdit') { aiEditConfirm(d, val); return; }
    if (d.type === 'aiDiscard') { state.dialog = null; aiRevertPending(d.reason, d.reason === 'another scenario cloned' ? false : true); d.then(); render(); return; }
    if (d.type === 'aiReplace') { state.dialog = null; if (state.ai.pending) aiRevertPending('another candidate adopted'); aiAdoptNow(d.planId); return; }
  }
  function updateScenario(id, patch) {
    const i = state.scenarios.findIndex(s => s.id === id);
    if (i < 0) return;
    const old = state.scenarios[i];
    if (old.status === 'approved' && Object.keys(patch).some(k => k !== 'recommended' || patch.recommended !== true)) { toast('Approved scenarios are locked', 'error'); return; }
    state.scenarios[i] = deepFreeze(Object.assign({}, old, patch));
  }

  /* ================================================================== listbox (custom dropdown) */
  let lb = null;   // {id, el, idx}
  function openListbox(id) {
    const def = dd[id], trig = document.getElementById(id);
    if (!def || !trig) return;
    closeListbox(true);
    const el = document.createElement('ul');
    el.className = 'lb'; el.id = `${id}-lb`; el.setAttribute('role', 'listbox'); el.tabIndex = -1;
    const lbl = document.getElementById(`${id}-lbl`);
    if (lbl) el.setAttribute('aria-labelledby', `${id}-lbl`); else el.setAttribute('aria-label', trig.getAttribute('aria-label') || 'Options');
    let idx = def.options.findIndex(o => o.value === def.value);
    el.innerHTML = def.options.length ? def.options.map((o, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${o.value === def.value}" class="${o.value === def.value ? 'is-sel' : ''}">${esc(o.label)}</li>`).join('') : '<li class="lb-empty" aria-disabled="true">No data</li>';
    document.body.appendChild(el);
    lb = { id, el, idx: idx < 0 ? 0 : idx };
    placeListbox();
    trig.setAttribute('aria-expanded', 'true'); trig.setAttribute('aria-controls', el.id);
    setActive(lb.idx);
    el.focus();
  }
  function placeListbox() {
    if (!lb) return;
    const trig = document.getElementById(lb.id), el = lb.el;
    if (!trig) { closeListbox(true); return; }
    const r = trig.getBoundingClientRect();
    el.style.minWidth = r.width + 'px';
    const h = Math.min(el.scrollHeight, 240);
    const below = window.innerHeight - r.bottom;
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = (below < h + 8 && r.top > h + 8 ? r.top - h - 4 : r.bottom + 4) + 'px';
  }
  function setActive(i) {
    if (!lb) return;
    const items = lb.el.querySelectorAll('[role=option]');
    if (!items.length) return;
    lb.idx = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((it, k) => it.classList.toggle('is-active', k === lb.idx));
    const it = items[lb.idx];
    lb.el.setAttribute('aria-activedescendant', it.id);
    it.scrollIntoView({ block: 'nearest' });
  }
  function closeListbox(silent) {
    if (!lb) return;
    const id = lb.id;
    lb.el.remove(); lb = null;
    const trig = document.getElementById(id);
    if (trig) { trig.setAttribute('aria-expanded', 'false'); if (!silent) trig.focus(); }
  }
  function chooseListbox(i) {
    if (!lb) return;
    const id = lb.id, def = dd[id], o = def && def.options[i];
    closeListbox(true);
    focusAfter(id);
    if (o && o.value !== def.value) def.onSelect(o.value); else { const t = document.getElementById(id); if (t) t.focus(); pendingFocus = null; }
  }

  /* ================================================================== state helpers used by actions */
  function setPath(path, value) {
    if (path === 'draftName') { state.draftName = value; return; }
    if (path === 'objective') { state.objective = value; return; }
    if (path === 'ai.brief') { if (state.ai.flow) state.ai.flow.brief = value; return; }
    const parts = path.split('.');
    let obj = parts[0] === 'project' ? state.project : parts[0] === 'shared' ? state.shared : parts[0] === 'ma' ? ma() : null;
    if (!obj) return;
    for (let i = 1; i < parts.length - 1; i++) { if (obj[parts[i]] == null && parts[0] === 'ma') obj[parts[i]] = {}; obj = obj[parts[i]]; }   // ma.curveParams.<archetype> may not exist yet
    obj[parts[parts.length - 1]] = value;
  }
  function resizeYears() {
    const n = (state.shared.horizon.windowYears || 0) + (state.shared.horizon.tailYears || 0);
    ['affordable', 'response'].forEach(m => {
      const v = state.methodStore[m].value;
      if (!Number.isInteger(n) || n <= 0 || n > 20) return;
      while (v.years.length < n) v.years.push(blankYear());
      v.years.length = n;
    });
  }
  function setMethod(m) {
    const from = method();
    if (state.ai.adoption && state.ai.adoption.method !== m) aiRevertPending('method changed');
    const ad = state.ai.adoption, aiNote = ad && ad.method !== m ? aiMethodNote(from, m) : '';
    if (ad && ad.method !== m) { ad.proposedMethod = ad.proposedMethod || ad.method; ad.methodChangedFrom = m === ad.proposedMethod ? null : ad.method; ad.method = m; }
    state.project.method = m;
    if (state.importFlow && state.importFlow.step !== 'source') { state.importFlow.step = 'source'; state.importFlow.reviewed = false; state.importFlow.applied = null; }
    audit('method', (from ? `Method changed: ${methodLabel(from)} → ${methodLabel(m)}` : `Method selected: ${methodLabel(m)}`) + aiNote);
    
  }
  function mergedSampleRows(kind) {
    const src = kind === 'multi' && SAMPLE.multiSpecialty ? SAMPLE.multiSpecialty : kind === 'presets' && SAMPLE.presetSample ? SAMPLE.presetSample : SAMPLE;
    const a = src.segments('affordable'), w = src.segments('workload'), r = src.segments('response');
    return a.map((s, i) => Object.assign({}, s, { plannedCalls: w[i].plannedCalls, archetypeMix: r[i].archetypeMix }));
  }
  function setManualData(rows, note) {
    state.segments = rows; state.entities = null; state.inputGrain = 'summary'; state.corrections = [];
    state.provenance = { path: 'manual', fileName: null, sheet: null, headerRow: null, inputGrain: 'summary', mapping: {}, importedAt: nowIso(), rowCount: rows.length, warnings: note ? [note] : [] };
    state.importFlow = null; state.checkpoints.inputs = null; state.checkpoints.assumptions = null;
    aiResetDraft();
    audit('ingest', `Synthetic sample loaded: ${plural(rows.length, 'segment')}${note ? ` (${note})` : ''}`);   // CS-6: no manual entry remains
  }
  function confirmReplace(then) {
    if (state.segments.length) openDialog({ type: 'replace', then: () => { then(); render(); } });
    else { then(); render(); }
  }
  /* Uptake presets sample (P2): third Step 1 button; strings from FSFields.RESPONSE_CURVE_LABELS (RCL). */
  const RCL = (F && F.RESPONSE_CURVE_LABELS) || {};
  const presetSampleBtn = () => (SAMPLE && SAMPLE.presetSample ? btn({ label: RCL.samplePresetsButton, act: 'loadSamplePresets', kind: 'text', ic: 'file', id: 'load-sample-presets' }) : '');
  function loadSampleProject(kind) {
    /* One loader for the three synthetic samples ('multi', 'presets', else the single 10-decile sample). The response curve
       uptake is seeded per sample (FSSample.responseCurveSeed) and resolved from state.config at build time (I-2, I-4). */
    const multi = kind === 'multi' && !!SAMPLE.multiSpecialty, presets = kind === 'presets' && !!SAMPLE.presetSample;
    const src = multi ? SAMPLE.multiSpecialty : presets ? SAMPLE.presetSample : SAMPLE;
    state.project = Object.assign(blankProject(), clone(src.project), { method: 'affordable' });
    state.shared = Object.assign(blankShared(), SAMPLE.shared()); state.repCostByMode = {};
    if (SAMPLE.capacityInput) { state.shared.capacityInput = SAMPLE.capacityInput(); state.shared.capacity = null; }   // CS-5: days × calls per day
    aiClearStores();   // F-R2-10: the sample rewrites every store below; nothing AI-written may survive in them
    const md = methodDefaults();
    METHOD_IDS.forEach(m => { state.methodStore[m] = Object.assign(md[m], SAMPLE.methodAssumptions(m)); if (state.methodStore[m].value) state.methodStore[m].value = Object.assign(blankValue(), SAMPLE.methodAssumptions(m).value); });
    state.ui.sizeSpec = null; state.ui.resSpec = null; state.ui.dataSpec = null; state.respSegType = 'behaviour';
    if (presets) {
      setManualData(mergedSampleRows('presets'), RCL.samplePresetsData);
      seedResponseCurve('presets');
      audit('project', RCL.samplePresetsAudit(src.archetypes.length));
      toast(RCL.samplePresetsToast, 'success');
      return;
    }
    setManualData(mergedSampleRows(multi ? 'multi' : null), multi ? 'Synthetic multi-specialty sample data' : 'Synthetic sample data');
    seedResponseCurve(multi ? 'multi' : 'single');
    audit('project', multi ? `Synthetic multi-specialty sample project loaded (${plural(specialtiesOf().length, 'specialty', 'specialties')} × 10 deciles)` : 'Synthetic sample project loaded');
    toast(multi ? 'Synthetic multi-specialty sample loaded. Run the inputs check to continue.' : 'Synthetic sample project loaded. Run the inputs check to continue.', 'success');
  }
  function startImport(buf, fileName) {
    const m = method();
    Promise.resolve().then(() => IO.parseFile(buf, fileName)).then(res => {
      const sheets = (res && res.sheets) || [];
      if (!sheets.length) throw { message: 'The file has no readable sheets.' };
      let best = 0;
      if (typeof IO.rankSheets === 'function') { const rk = safe(() => IO.rankSheets(res, m), null); if (rk && rk.length) { const k = sheets.findIndex(x => x.name === rk[0].name); if (k >= 0) best = k; } }
      const det = IO.detect(sheets[best], m, { sheets });
      const tabs = Array.isArray(det.tabsAsSpecialties) && det.tabsAsSpecialties.length >= 2 ? det.tabsAsSpecialties.slice() : null;
      state.importFlow = { step: 'source', fileName, sheets, sheetIndex: best, headerRow: det.headerRow, detectedHeader: det.headerRow, inputGrain: det.inputGrain, detectedGrain: det.inputGrain,
        mapping: Object.assign({}, det.mapping), confidence: Object.assign({}, det.confidence || {}), manual: {}, reviewed: false, applied: null, error: null, tabs, tabsOn: !!tabs };
      audit('upload', `File selected: ${fileName} (${plural(sheets.length, 'sheet')})`);
      render(); focusAfter('wiz-h');
    }).catch(err => {
      state.importFlow = { step: 'source', fileName, sheets: [], error: (err && err.message) || String(err) };
      toast(`Could not read ${fileName}`, 'error'); render();
    });
  }
  function wizSetSheet(i) {
    const fl = state.importFlow; fl.sheetIndex = i;
    const det = IO.detect(fl.sheets[i], method(), { sheets: fl.sheets });
    const tabs = Array.isArray(det.tabsAsSpecialties) && det.tabsAsSpecialties.length >= 2 ? det.tabsAsSpecialties.slice() : null;
    Object.assign(fl, { headerRow: det.headerRow, detectedHeader: det.headerRow, inputGrain: det.inputGrain, detectedGrain: det.inputGrain, mapping: Object.assign({}, det.mapping), confidence: Object.assign({}, det.confidence || {}), manual: {}, reviewed: false, applied: null, tabs, tabsOn: !!tabs });
    render();
  }
  function wizApply() {
    const fl = state.importFlow;
    const mapping = {};
    mappingFieldsFor(method(), fl.inputGrain).forEach(f => { if (fl.mapping[f.id] != null) mapping[f.id] = fl.mapping[f.id]; });
    if (fl.tabsOn) delete mapping.specialty;   // CS-3 tabs mode: the specialty is the sheet name
    const extra = fl.tabsOn && fl.tabs ? { tabsAsSpecialties: true, sheets: fl.tabs.slice(), workbook: { sheets: fl.sheets } } : undefined;
    fl.applied = safe(() => IO.applyMapping(flowSheet(), { headerRow: fl.headerRow, inputGrain: fl.inputGrain, mapping }, method(), extra), { segments: [], entities: null, errors: [{ code: 'io', path: '', message: 'The import could not be applied.' }], warnings: [], rowCount: 0 });
    fl.usedMapping = mapping;
  }
  function wizImport() {
    const fl = state.importFlow, ap = fl.applied, heads = headerCells();
    const doIt = () => {
      state.segments = (ap.segments || []).map(r => Object.assign(blankRow(r.segment), r));
      state.entities = ap.entities && ap.entities.length ? ap.entities : null;
      state.inputGrain = fl.inputGrain; state.corrections = [];
      fillDefaultUptake();   // P4: archetypes new to the project start with the configuration's default uptake, if it has one
      const mapHeads = {}; Object.keys(fl.usedMapping).forEach(k => { mapHeads[k] = heads[fl.usedMapping[k]]; });
      const tabsOn = !!(fl.tabsOn && fl.tabs);
      state.provenance = { path: 'file', fileName: fl.fileName, sheet: tabsOn ? fl.tabs.join(', ') : flowSheet().name, headerRow: fl.headerRow, inputGrain: fl.inputGrain, mapping: mapHeads, importedAt: nowIso(), rowCount: ap.rowCount, warnings: (ap.warnings || []).map(w => w.message) };
      if (tabsOn) state.provenance.tabsAsSpecialties = fl.tabs.slice();
      state.ui.sizeSpec = null; state.ui.resSpec = null; state.ui.dataSpec = null;
      state.checkpoints.inputs = null; state.checkpoints.assumptions = null;
      aiResetDraft();
      audit('mapping', `Mapping confirmed: ${Object.keys(mapHeads).map(k => `${MAP_FIELD(k).label} ← ${mapHeads[k]}`).join('; ')}`);
      audit('ingest', `Imported ${fl.fileName} · ${tabsOn ? `one specialty per sheet (${fl.tabs.join(', ')})` : `sheet ${flowSheet().name}`} · header row ${fl.headerRow + 1} · ${fl.inputGrain} · ${plural(ap.rowCount, 'row')}${specOn() ? ` · ${plural(specialtiesOf().length, 'specialty', 'specialties')} × deciles = ${plural(state.segments.length, 'segment')}` : ''}`);
      state.importFlow = null;
      toast(`Imported ${plural(state.segments.length, 'segment')} from ${fl.fileName}`, 'success');
      focusAfter('run-inputs');
    };
    if (state.segments.length) openDialog({ type: 'replace', then: () => { doIt(); render(); } }); else { doIt(); render(); }
  }
  function cloneScenario(id) {
    const s = scen(id);
    const inp = clone(s.inputs);
    state.project.method = inp.method; state.project.grain = inp.grain || state.project.grain; state.inputGrain = inp.inputGrain;
    state.segments = inp.segments.map(r => Object.assign(blankRow(r.segment), r));
    state.entities = inp.entities;
    const layers = inp.shared.layers || state.shared.layers;
    state.shared = Object.assign(blankShared(), inp.shared, { layers: clone(layers) }); state.repCostByMode = {};
    if (inp.method === 'workload') { state.workloadCost = inp.shared.repCost != null; if (!state.workloadCost) state.shared.repCost = null; }
    if (inp.method !== 'workload') {
      const v = inp.methodAssumptions.value || {};
      state.valueMode[inp.method] = isNum(v.annualValue) ? 'direct' : 'chain';
      const merged = Object.assign(methodDefaults()[inp.method], inp.methodAssumptions);
      merged.value = Object.assign(blankValue(), state.ai.touched[inp.method] ? {} : state.methodStore[inp.method].value, v);   // F-R2-10: no hidden AI-written chain
      delete merged.curveParams; delete merged.curveProvenance; delete merged.customSourceNote;   // P4: curves come only from the uptake below
      state.methodStore[inp.method] = merged;
    }
    /* P4 (I-4): the snapshot's configuration and uptake come back with it. An older snapshot without them keeps the current
       configuration and starts with no uptake: its inputs carry no provenance, so the engine used the reference curves. */
    if (s.responseCurveConfig) state.config = clone(s.responseCurveConfig);
    state.responseCurve = Object.assign(blankResponseCurve(), s.responseCurve ? clone(s.responseCurve) : inp.method === 'response' ? legacyResponseCurve(inp.methodAssumptions || {}) : {}); state.ui.rcRaw = {}; state.ui.rcFmt = {};
    if (inp.method === 'response') state.respSegType = ownKey((inp.methodAssumptions || {}).curveParams, RC_ALL) ? 'value' : 'behaviour';
    state.provenance = clone(s.provenance); state.corrections = clone(s.corrections || []);
    state.parentId = s.id; state.objective = s.objective || state.objective; state.draftName = null;
    state.result = clone(s.result); state.resultInputs = clone(s.inputs); state.resultAt = s.createdAt;
    const at = nowIso();
    state.checkpoints.inputs = { sig: inputsSig(), at }; state.checkpoints.assumptions = { sig: assumptionsSig(), at };
    state.resultSig = assumptionsSig();
    /* F1 (fix 2) / N1, N4 (fix 3): an earlier draft's result stays current only if the rebuilt inputs reproduce its numbers
       exactly; then the recalculated result and its inputs are adopted, so the inputs hash, trace and curves match what a
       save stores. Otherwise, or when the rebuilt uptake needs Custom while custom curves are off, the result is stale and
       the assumptions check must be run again. */
    if (!s.responseCurve && inp.method === 'response') {
      const bi = buildInputs(), re = safe(() => E.calculate(bi), null), key = r => JSON.stringify(r && [r.errors, r.totals, r.segments]);
      const customOff = rcFlags().allowCustomCurve === false && Object.keys(state.responseCurve.assignment).some(a => state.responseCurve.assignment[a] === RC_CUSTOM);
      if (re && !customOff && key(re) === key(s.result)) { state.result = clone(re); state.resultInputs = clone(bi); }
      else { state.resultSig = null; if (customOff) state.checkpoints.assumptions = null; }
    }
    state.checkRuns = { inputs: null, assumptions: null };
    aiAfterClone(s);
    audit('clone', `Cloned “${s.name}” to a new working draft`, s.id);
    toast('Cloned to a new draft. Edit, recalculate and save it as a new version.', 'success');
    state.section = 'assumptions';
  }
  function saveSnapshot() {
    const v = ++state.seq;
    const name = ((state.draftName != null ? state.draftName : defaultName(v)) || defaultName(v)).trim();
    const draft = {
      id: 'SC-' + String(v).padStart(3, '0'), name, version: v, parentId: state.parentId, createdAt: nowIso(), createdBy: curUser().name,
      objective: state.objective, inputs: buildInputs(), result: clone(state.result), provenance: clone(state.provenance), corrections: clone(state.corrections),
      responseCurveConfig: clone(state.config), responseCurve: clone(state.responseCurve),   // P4 (I-4, FR-48): configuration and uptake as saved
      status: 'draft', recommended: false, recommendationNote: null, recommendedBy: null, recommendedRole: null, approvedBy: null, approvedAt: null
    };
    const aiTag = aiSnapshotTag(draft);   // contract §3 snapshot.ai, only when the draft came from an adopted candidate
    if (aiTag) draft.ai = aiTag;
    const snap = deepFreeze(draft);
    state.scenarios.push(snap); state.draftName = null;
    audit('snapshot', `Saved “${name}” (recommended FTE ${fmt.num(snap.result.totals.recommendedFte, 0)})`, snap.id);
    aiAfterSave(snap, aiTag);
    toast(`Saved ${snap.id}: ${name}`, 'success');
  }
  function doExport() {
    const rec = recommended(), focus = rec || state.scenarios[state.scenarios.length - 1];
    if (!focus) return;
    const fileName = `field-sizing-${slug(focus.name)}.xlsx`;
    audit('export', `Exported ${fileName}`, focus.id);
    let out;
    const args = { project: clone(state.project), scenarios: state.scenarios, focusScenarioId: focus.id, audit: state.audit.slice(), config: clone(state.config) };
    aiExportArgs(args);   // adds narratives / proposalSets only when AI was used; an AI-free export gets the baseline arguments
    try { out = IO.exportWorkbook(args); }
    catch (e) { toast(`Export failed: ${(e && e.message) || e}`, 'error'); return; }
    Promise.resolve(out).then(bytes => {
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fileName; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`Downloaded ${fileName}`, 'success'); render();
    }).catch(e => toast(`Export failed: ${(e && e.message) || e}`, 'error'));
  }
  function calculateNow() {
    if (valueOnlyBlocked()) { toast('Response Curve needs value + behaviour segmentation.', 'warning'); return null; }
    const inp = buildInputs();
    const r = safe(() => E.calculate(inp), null);
    if (!r) { toast('The engine failed to run.', 'error'); return null; }
    state.result = r; state.resultSig = assumptionsSig(); state.resultAt = nowIso(); state.resultInputs = clone(inp);
    audit('calculate', r.errors.length ? `Calculation blocked by ${plural(r.errors.length, 'error')}` : `Raw FTE ${fmt.num(r.totals.rawFte, 2)} → recommended ${fmt.num(r.totals.recommendedFte, 0)} (${r.engineVersion})`);
    if (r.errors.length) toast('The engine reported errors', 'error');
    return r;
  }
  /* CS-2 preview: FSEngine.calculate on a copy of the inputs the current result used, with reallocation On. Never the draft. */
  function reallocPreviewNow() {
    const r = state.result, ri = state.resultInputs;
    if (!r || !ri || !resultIsCurrent()) return;
    const inp = clone(ri); inp.methodAssumptions = Object.assign({}, inp.methodAssumptions, { reallocateExcluded: true });
    const pv = safe(() => E.calculate(inp), null);
    state.ui.reallocPreview = pv ? { hash: r.inputsHash, result: pv } : null;
    if (!pv) toast('The engine failed to run the preview.', 'error');
  }
  /* Apply / Turn off: record the option (audit `methodology`), re-run the assumptions check and recalculate when it passes. */
  function reallocSet(on, how) {
    if (readOnly() || (method() !== 'affordable' && method() !== 'response')) return;
    const pv = state.ui.reallocPreview && state.ui.reallocPreview.result, pr = pv && pv.totals && pv.totals.reallocation;
    ma().reallocateExcluded = on;
    aiManualEdit(['methodAssumptions.reallocateExcluded']);
    audit('assumption', `${REALLOC_LABEL}: ${on ? OL('reallocateExcluded').true || 'On' : OL('reallocateExcluded').false || 'Off'}${on === DEFAULTS.reallocateExcluded ? ' (default)' : ''}${how === 'apply' && pr ? ` (applied after preview: ${plural(pr.passes, 'pass', 'passes')}, ${fmt.money(pr.reallocatedValue)} reallocated)` : how === 'off' ? ' (turned off on FTE Calculation)' : ''}`);
    state.ui.reallocPreview = null; state.ui.reallocKept = null;
    const issues = runAssumptionsCheck();
    if (issues.length) { toast(`${REALLOC_LABEL} is ${on ? 'On' : 'Off'}. The assumptions check needs attention before recalculating.`, 'warning'); state.section = 'assumptions'; return; }
    const r = calculateNow();
    if (r && !r.errors.length) toast(on ? `Reallocation On: recalculated with ${plural(r.totals.reallocation ? r.totals.reallocation.passes : 0, 'pass', 'passes')}` : 'Reallocation Off: recalculated', 'success');
  }
  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.xlsm,.csv,.xls,.xlsb'; input.hidden = true;
    input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) f.arrayBuffer().then(b => startImport(b, f.name)); input.remove(); });
    document.body.appendChild(input); input.click();
  }
  function sampleFileFor(kind) {
    const m = method();
    const f = kind === 'entity' ? SAMPLE.files.entity() : kind === 'errors' ? SAMPLE.files.summaryWithErrors(m) : SAMPLE.files.summary(m);
    startImport(new TextEncoder().encode(f.text).buffer, f.fileName);
  }

  /* ================================================================== actions */
  const toggle = key => () => { state.ui[key] = !state.ui[key]; render(); };
  Object.assign(acts, {
    toggleCurveAdv: () => { state.ui.curveAdvOpen = !state.ui.curveAdvOpen; focusAfter('rc-adv-btn'); render(); },
    drawer: () => { state.drawerOpen = !state.drawerOpen; focusAfter('hamburger'); render(); },
    nav: el => {
      const id = el.dataset.arg;
      if (stageStatus(id) === 'locked') { toast(lockReason[id], 'warning'); return; }
      state.section = id; state.drawerOpen = false; toasts.length = 0; renderToasts(); render();
      window.scrollTo(0, 0);
      const main = document.getElementById('main'); if (main) main.focus({ preventScroll: true });
    },
    chrome: el => toast(`${el.dataset.arg} is not part of this prototype.`, 'base'),
    loadSample: () => aiGuard('new data loaded', () => { loadSampleProject(); render(); }),
    method: el => {
      const m = el.dataset.arg;
      if (readOnly() || m === method()) return;
      if (!method() || !state.segments.length) { setMethod(m); render(); return; }
      aiGuard('method changed', () => openDialog({ type: 'methodChange', to: m, returnFocus: el.id }));
    },
    pickFile: () => { if (!readOnly()) pickFile(); },
    sampleFile: el => sampleFileFor(el.dataset.arg),
    manualSample: () => aiGuard('new data loaded', () => confirmReplace(() => { state.ui.dataSpec = null; state.ui.sizeSpec = null; state.ui.resSpec = null; setManualData(mergedSampleRows(), 'Synthetic sample values'); seedResponseCurve('single'); })),
    wizGo: el => {
      const to = el.dataset.arg, fl = state.importFlow;
      if (to === 'preview') { wizApply(); audit('mapping', `Mapping reviewed for ${fl.fileName}`); }
      fl.step = to; focusAfter('wiz-h'); render();
    },
    wizImport: () => aiGuard('new data loaded', () => wizImport()),
    wizCancel: () => { state.importFlow = null; focusAfter('select-files'); render(); },
    runInputs: () => { const n = runInputsCheck().length; focusAfter(n ? 'c-incheck-h' : 'go-assumptions'); render(); },
    runAssumptions: () => { const n = runAssumptionsCheck().length; focusAfter(n ? 'c-ascheck-h' : 'go-result'); render(); },
    focusField: el => { const t = document.getElementById(el.dataset.arg); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } },
    dataTab: el => { const a = el.dataset.arg; state.ui.dataSpec = a === '' ? null : specialtiesOf()[+a]; focusAfter(el.id); render(); },
    sizeTab: el => { const a = el.dataset.arg; state.ui.sizeSpec = a === '' ? null : specialtiesOf()[+a]; state.ui.specApply = {}; focusAfter(el.id); render(); },
    specApply: () => { specApplyNow(); focusAfter('spec-apply'); render(); },
    resSpec: el => { const a = el.dataset.arg; state.ui.resSpec = a === '' ? null : resSpecs(state.result || { segments: [] })[+a]; focusAfter(el.id); render(); },
    reallocPreview: () => { if (readOnly()) return; reallocPreviewNow(); focusAfter('realloc-card'); render(); },
    reallocApply: () => { reallocSet(true, 'apply'); focusAfter('realloc-off'); render(); },
    reallocKeep: () => { const r = state.result; if (r && state.ui.reallocPreview) audit('assumption', `${REALLOC_LABEL}: kept Off after preview`); state.ui.reallocPreview = null; state.ui.reallocKept = r ? r.inputsHash : null; focusAfter('cover-line'); render(); },
    reallocOff: () => { reallocSet(false, 'off'); focusAfter('realloc-preview'); render(); },
    loadSampleMulti: () => aiGuard('new data loaded', () => { loadSampleProject('multi'); render(); }),
    loadSamplePresets: () => aiGuard('new data loaded', () => { loadSampleProject('presets'); render(); }),
    toggleNotes: toggle('notesOpen'), toggleReqCols: toggle('reqColsOpen'), toggleHorizon: toggle('horizonOpen'),
    toggleAdvanced: toggle('advancedOpen'), toggleTrace: toggle('traceOpen'), toggleWhy: toggle('whyOpen'), toggleCmpDetail: toggle('cmpDetailOpen'),
    fillStarter: () => {
      const byLabel = {}; mergedSampleRows().forEach(r => { byLabel[r.segment] = r; });
      if (SAMPLE.multiSpecialty) mergedSampleRows('multi').forEach(r => { byLabel[r.segment] = r; });
      let n = 0;
      state.segments.forEach(s => { const src = byLabel[s.segment] || (hasSpecKey(s) ? byLabel[decileOf(s)] : null); if (!src) return; visibleFields().filter(f => f.owner === 'sizing').forEach(f => { if (!isNum(s[f.id]) && isNum(src[f.id])) { s[f.id] = src[f.id]; n++; } }); });
      audit('assumption', `Filled ${plural(n, 'empty sizing control')} with synthetic starter values`);
      toast(n ? `Filled ${plural(n, 'cell')} with synthetic starter values` : 'No matching segment labels to fill', n ? 'success' : 'warning'); render();
    },
    calculate: () => { calculateNow(); focusAfter('calc'); render(); },
    saveSnapshot: () => { saveSnapshot(); focusAfter('c-compare-h'); render(); },
    resetName: () => { state.draftName = null; focusAfter('sc-name'); render(); },
    setObjective: el => { if (readOnly()) return; state.objective = el.dataset.arg; focusAfter('sc-objective'); render(); },
    rename: el => openDialog({ type: 'rename', id: el.dataset.arg }),
    viewAssumptions: el => openDialog({ type: 'assumptions', id: el.dataset.arg }),
    clone: el => { const id = el.dataset.arg; aiGuard('another scenario cloned', () => { cloneScenario(id); render(); window.scrollTo(0, 0); }); },
    recommend: el => openDialog({ type: 'recommend', id: el.dataset.arg }),
    submit: el => {
      const id = el.dataset.arg, s = scen(id);
      updateScenario(id, { status: 'in_review', submittedBy: curUser().name, submittedRole: state.role, submittedAt: nowIso() });
      audit('submit', `Submitted “${s.name}” for review`, id); toast('Submitted for review', 'success'); render();
    },
    decide: el => { const [id, decision] = el.dataset.arg.split(':'); openDialog({ type: 'decide', id, decision }); },
    leadPerson: el => { const k = el.dataset.arg; if (!LEAD_KEYS.includes(k) || k === state.leadKey || state.role !== 'lead') return; const from = curUser().name; state.leadKey = k; audit('role-switch', `Prototype user switched: ${from} → ${curUser().name} (${ROLE_LABEL.lead})`); focusAfter(`lead-${k}`); render(); },
    role: el => { const r = el.dataset.arg; if (r === state.role) return; const from = state.role; state.role = r; audit('role-switch', `Prototype role switched: ${ROLE_LABEL[from]} → ${ROLE_LABEL[r]}`); focusAfter(`role-${r}`); render(); },
    tab: el => { state.ui.reviewTab = el.dataset.arg; focusAfter(`tab-${el.dataset.arg}`); render(); },
    export: () => doExport(),
    showReq: () => { state.showReq = !state.showReq; focusAfter('show-req'); render(); },
    dlgCancel: () => closeDialog(),
    dlgConfirm: () => dialogConfirm()
  });
  const radioActs = {
    grain: v => { const from = state.project.grain; state.project.grain = v; audit('project', `Grain: ${grainOne(from)} → ${grainOne(v)}`); },
    wizGrain: v => { state.importFlow.inputGrain = v; state.importFlow.reviewed = false; },
    wizTabs: v => { state.importFlow.tabsOn = v === 'tabs'; state.importFlow.reviewed = false; },
    /* FR-12: the rep cost means different things per mode (fully loaded already includes managers; layers mode wants rep only).
       Keep one value per mode so a fully loaded cost is never reused as the rep-only cost and topped up with manager cost. */
    costMode: v => {
      const sh = state.shared, from = sh.costMode;
      if (from === v) return;
      const store = state.repCostByMode || (state.repCostByMode = {});
      store[from] = sh.repCost;
      const had = isNum(sh.repCost);
      sh.costMode = v; sh.repCost = isNum(store[v]) ? store[v] : null;
      audit('assumption', `Cost mode: ${F.OPTION_LABELS.costMode[v]}${had && !isNum(sh.repCost) ? (v === 'layers' ? ' (enter the rep-only cost; the fully loaded cost already includes managers)' : ' (enter the fully loaded cost; the rep-only cost excludes managers)') : ''}`);
      if (had && !isNum(sh.repCost)) toast(v === 'layers' ? 'Enter the annual cost per rep without managers. The fully loaded cost already includes them, so it is not reused.' : 'Enter the fully loaded annual cost per rep. The rep-only cost excludes managers, so it is not reused.', 'base');
    },
    valueMode: v => { state.valueMode[method()] = v; audit('assumption', `Impactable value: ${v === 'direct' ? 'entered directly' : 'built from forecast'}`); },
    allocation: v => { ma().allocation = v; audit('assumption', `Allocation: ${F.OPTION_LABELS.allocation[v]}`); },
    roiBasis: v => {
      const o = ma(), from = o.roiBasis;
      if (isNum(o.cutoff) && from !== v) { const eq = safe(() => E.roiEquivalent(from, o.cutoff), null); if (eq) { o.cutoff = +eq[v].toFixed(6); toast(`Cutoff converted to ${fmt.num(o.cutoff, 2)} ${v} to keep the same threshold`, 'base'); } }
      o.roiBasis = v; audit('assumption', `ROI basis: ${F.OPTION_LABELS.roiBasis[v]} (cutoff ${fmt.num(o.cutoff, 2)})`);
    },
    stoppingRule: v => { ma().stoppingRule = v; audit('assumption', `Stopping rule: ${F.OPTION_LABELS.stoppingRule[v]}`); },
    /* v0.5.1 CS-1: no forecast-mode choice (the v0.5 selector is removed; the UI never sends forecastMode). */
    /* CS-2 / CS-5: the visible "Value from excluded segments" control (audit row as the FTE Calculation Apply / Turn off). */
    realloc: v => { const on = v === 'true'; ma().reallocateExcluded = on; state.ui.reallocPreview = null; state.ui.reallocKept = null; audit('assumption', `${REALLOC_LABEL}: ${on ? OL('reallocateExcluded').true || 'On' : OL('reallocateExcluded').false || 'Off'}${on === DEFAULTS.reallocateExcluded ? ' (default)' : ''} (set on Model Assumptions)`); },
    /* CS-7: Response Curve segmentation type. Value only is explained and blocks the calculation; nothing is invented. */
    segType: v => { if (v !== 'value' && v !== 'behaviour') return; state.respSegType = v; audit('assumption', `Segmentation type: ${v === 'value' ? (rcFlags().allowValueOnlyResponse === true ? RCL.segTypeValueOnlyAllowed : 'Value only (Response Curve not available)') : 'Value + behaviour'}`); }
  };
  /* ================================================================== AI ASSIST (simulated, contract §7)
     FSAssist proposes and explains; FSEngine calculates; a person decides. FSAssist never sees `state`: it gets plain
     data (basisFor, sheets, brief text) and returns frozen plain data. Nothing from a proposal reaches the working draft
     until the user adopts a candidate, and no value is final until the user accepts, edits or rejects it. */
  const AS = W.FSAssist || null, PREC = W.FSPrecedent || null;
  const GLYPH = '✦';
  /* Review M4: AI-on wording only; with AI off the baseline copy is shown unchanged. */
  const AI_SETUP_SUB = 'Describe the engagement and bring in the data for the simulated assistant, or set up manually: name the engagement, choose the sizing method, then bring in the upstream segment data.';
  const AI_METHOD_SUB = 'Choose a method yourself, or let the simulated assistant propose candidates for each method your data supports. You pick; the method is never taken from the data without you.';
  const aiOn = () => !!(AS && state.ai.enabled);
  const aiSet = () => state.ai.sets[state.ai.sets.length - 1] || null;
  const aiHasCandidates = () => aiOn() && !!aiSet() && aiSet().plans.length > 0;
  /* Independent of the AI setting and of the method (review C1 / F-R2-01): any undecided AI value blocks the assumptions check. */
  const aiPendingCount = () => (state.ai.pending ? state.ai.pending.items.filter(x => x.status === 'pending').length : 0);
  const aiAdoptionIdea = () => (aiOn() && state.ai.adoption ? state.ai.adoption.idea : null);
  /* Narrative formatter: the app's own number formats (contract §4 renderNarrative(template, ctx, fmt)). */
  const NFMT = { int: fmt.int, num: n => (Number.isInteger(n) ? fmt.int(n) : fmt.num(n, 2)), money: fmt.money, pct: fmt.pct, roi: fmt.roi };
  const simTag = () => `<span class="chip chip-outline chip-sm ai-sim">Simulated</span>`;

  /* ---------- paths (contract §2 shapes) */
  function aiParse(path) {
    const toks = [];
    String(path).split('.').forEach(part => {
      const m = /^([^[\]]+)((?:\[(?:\d+|\*)\])*)$/.exec(part);
      if (!m) return;
      toks.push(m[1]);
      (m[2].match(/\[(\d+|\*)\]/g) || []).forEach(b => { const x = b.slice(1, -1); toks.push(x === '*' ? '*' : Number(x)); });
    });
    return toks;
  }
  function aiGet(obj, path) {
    let cur = obj;
    for (const t of aiParse(path)) { if (cur == null) return undefined; if (t === '*') return Array.isArray(cur) && cur.length ? cur[0] : undefined; cur = cur[t]; }
    return cur;
  }
  /* Current working-draft value of a change path, read from the engine projection (what a snapshot would store). */
  function aiDraftValue(path) {
    if (path === 'ui.valueMode') return valueMode();
    const v = aiGet(buildInputs(), path);
    return v === undefined ? null : v;
  }
  /* Write a change path into the working draft (state.shared / methodStore / segments / valueMode). */
  function aiSetDraft(path, value, forMethod) {
    const v = value == null ? null : clone(value), mm = forMethod || method();
    if (path === 'ui.valueMode') { if (mm) { state.valueMode[mm] = v || 'chain'; state.ai.touched[mm] = true; } return; }
    const toks = aiParse(path);
    let obj;
    if (toks[0] === 'shared') obj = state.shared;
    else if (toks[0] === 'methodAssumptions') { obj = mm ? state.methodStore[mm] : null; if (obj) state.ai.touched[mm] = true; }
    else if (toks[0] === 'segments') {
      const rows = toks[1] === '*' ? state.segments : [state.segments[toks[1]]].filter(Boolean);
      rows.forEach(r => { r[toks[2]] = v == null ? null : clone(v); });
      return;
    } else return;
    if (!obj) return;
    for (let i = 1; i < toks.length - 1; i++) { if (obj[toks[i]] == null || typeof obj[toks[i]] !== 'object') obj[toks[i]] = typeof toks[i + 1] === 'number' ? [] : {}; obj = obj[toks[i]]; }
    obj[toks[toks.length - 1]] = v;
    if (path === 'shared.capacityInput.mode' && v === 'derived') state.shared.capacity = null;
  }
  const ENUM_KEY = { 'shared.costMode': 'costMode', 'shared.fteRounding': 'fteRounding', 'shared.capacityInput.mode': 'capacityInput', 'methodAssumptions.allocation': 'allocation',
    'methodAssumptions.roiBasis': 'roiBasis', 'methodAssumptions.stoppingRule': 'stoppingRule', 'methodAssumptions.minimumBoundary': 'minimumBoundary', 'methodAssumptions.cutoffTie': 'cutoffTie',
    'methodAssumptions.reachAppliesTo': 'reachAppliesTo', 'methodAssumptions.maxCallsSource': 'maxCallsSource' };
  const REALLOC_PATH = 'methodAssumptions.reallocateExcluded';
  function aiEnumOptions(path) {
    if (path === 'ui.valueMode') return [{ value: 'chain', label: 'Build from forecast' }, { value: 'direct', label: 'Enter annual impactable value' }];
    if (path === REALLOC_PATH) return [{ value: false, label: OL('reallocateExcluded').false || 'Off' }, { value: true, label: OL('reallocateExcluded').true || 'On' }];
    const k = ENUM_KEY[path];
    return k ? Object.keys(OL(k)).map(v => ({ value: v, label: OL(k)[v] })) : null;
  }
  const aiLeaf = path => String(path).replace(/\[[^\]]*\]/g, '').split('.').pop();
  function aiValText(path, v) {
    if (path === REALLOC_PATH) return v === true ? (OL('reallocateExcluded').true || 'On') : (OL('reallocateExcluded').false || 'Off');   // engine: absent = Off; UI drafts default On (2026-10-12)
    if (v == null) return 'blank';
    const opts = aiEnumOptions(path);
    if (opts) { const o = opts.find(x => x.value === v); return o ? o.label : String(v); }
    if (typeof v !== 'number') return String(v);
    const leaf = aiLeaf(path);
    if (/Pct$/.test(leaf)) return fmt.pct(v);
    if (/repCost|annualValue|forecast|flmCost|slmCost/.test(leaf)) return fmt.money(v);
    if (/cutoff|RoiCutoff|calibrationFactor/i.test(leaf)) return fmt.num(v, 2);
    if (leaf === 'sizingStartYear') return String(v);
    return fmt.num1(v);
  }
  /* Field label: FSAssist.pathLabel (FSIO.pathLabel agrees for the two-argument form) plus the segment or year. */
  function aiPathLabel(path, segs) {
    const base = AS.pathLabel(path, state.project.grain);
    const m = /^segments\[(\d+|\*)\]/.exec(path);
    if (m) {
      if (m[1] === '*') return `${base} · all segments`;
      const rows = segs || state.segments, s = rows[+m[1]];
      return `${base} · segment ${s ? s.segment : +m[1] + 1}`;
    }
    const y = /years\[(\d+)\]/.exec(path);
    if (y) return `${base} · forecast year ${+y[1] + 1}`;
    return base;
  }

  /* ---------- intake data: one applied dataset per method (the method is not chosen yet) */
  function aiNewFlow() { return { open: true, step: 'brief', brief: '', exampleKey: null, basicsFilled: null, data: null, reviewed: false, check: null, error: null, done: false, gapError: null, audited: false }; }
  function aiProvenance(m) {
    const d = state.ai.flow && state.ai.flow.data, ds = d && d.byMethod[m];
    if (!ds) return null;
    if (d.kind === 'sample') return { path: 'manual', fileName: null, sheet: null, headerRow: null, inputGrain: 'summary', mapping: {}, importedAt: d.at, rowCount: ds.segments.length, warnings: ['Synthetic sample data'] };
    const mapHeads = {}; Object.keys(ds.mapping).forEach(k => { mapHeads[k] = ds.heads[ds.mapping[k]]; });
    return { path: 'file', fileName: d.fileName, sheet: ds.sheetName, headerRow: ds.headerRow, inputGrain: ds.inputGrain, mapping: mapHeads, importedAt: d.at, rowCount: ds.rowCount, warnings: ds.warnings };
  }
  /* basisFor(method): full engine inputs for that method from the intake data with blank/default assumptions.
     Same projection as buildInputs() on a blank draft (tests/ai/helpers.js is the reference). */
  function aiBasisFor(m) {
    const d = state.ai.flow && state.ai.flow.data, ds = d && d.byMethod[m];
    if (!ds) return null;
    const ids = new Set(F.segmentFieldsFor(m, DEFAULTS.allocation, ds.inputGrain).map(f => f.id));
    const segments = ds.segments.map(s => {
      const r = { segment: s.segment, entities: s.entities, compositeValue: null, reachPct: s.reachPct, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
      ['compositeValue', 'maxCalls', 'minCalls', 'plannedCalls', 'archetypeMix'].forEach(k => { if (ids.has(k)) r[k] = s[k] == null ? null : clone(s[k]); });
      if (ids.has('archetypeMix')) r.archetype = s.archetypeMix ? null : (s.archetype || null);
      if (hasSpecKey(s)) { r.specialty = s.specialty; r.decile = s.decile == null ? null : String(s.decile); }   // CS-3, as buildInputs (tests/ai/helpers.js)
      return r;
    });
    const sh = blankShared(); sh.layers = null;
    const md = methodDefaults()[m];
    if (md.value) md.value = chainValue(md.value);   // same projection as buildInputs (v0.5.1 CS-1: three shares, no forecastMode)
    return { method: m, grain: state.project.grain, inputGrain: ds.inputGrain, segments, entities: ds.entities || null, shared: sh, methodAssumptions: md };
  }
  /* One merged view of the upstream data for describeData / datasetKey / methodSupport. */
  function aiMerged() {
    const d = state.ai.flow && state.ai.flow.data;
    if (!d) return null;
    const ms = METHOD_IDS.filter(m => d.byMethod[m]);
    if (!ms.length) return { segments: [], entities: null, inputGrain: 'summary', grain: state.project.grain, provenance: { path: 'file', fileName: d.fileName }, sheets: d.sheets || [] };
    const pick = ['response', 'affordable', 'workload'].find(m => d.byMethod[m]);
    const base = d.byMethod[pick];
    const segments = base.segments.map((s, i) => {
      const r = Object.assign({}, s);
      ms.forEach(m => { const t = d.byMethod[m].segments[i]; if (!t) return; ['compositeValue', 'archetypeMix', 'archetype', 'reachPct', 'maxCalls', 'minCalls', 'plannedCalls'].forEach(k => { if (r[k] == null && t[k] != null) r[k] = clone(t[k]); }); });
      return r;
    });
    return { segments, entities: base.entities || null, inputGrain: base.inputGrain, grain: state.project.grain, provenance: aiProvenance(pick), sheets: d.sheets || [] };
  }
  const MISSING_FIELD = { value: 'compositeValue', archetype: 'archetypeMix', entityId: 'entities', segment: 'entities' };
  function aiSupport() {
    const d = state.ai.flow && state.ai.flow.data, mg = aiMerged();
    if (!d || !mg) return null;
    const sup = AS.methodSupport(mg), out = {};
    METHOD_IDS.forEach(m => {
      if (d.byMethod[m]) { out[m] = clone(sup[m]); return; }
      const miss = sup[m] && sup[m].missing && sup[m].missing.length ? sup[m].missing.slice() : (d.failed[m] || []).map(x => MISSING_FIELD[x] || x).filter(x => SEG_FIELD(x));
      out[m] = { ok: false, missing: miss.length ? miss : ['entities'] };
    });
    return out;
  }
  const aiSourceTexts = () => ({ brief: (aiSet() && aiSet().briefText) || (state.ai.flow ? state.ai.flow.brief : ''), sheets: (state.ai.flow && state.ai.flow.data && state.ai.flow.data.sheets) || [], answers: (aiSet() && aiSet().answers) || {} });
  const aiDatasetKey = () => { const mg = aiMerged(); return mg ? AS.datasetKey(mg) : null; };

  function aiStartImport(buf, fileName) {
    const fl = state.ai.flow;
    if (!fl) return;
    Promise.resolve().then(() => IO.parseFile(buf, fileName)).then(res => {
      const sheets = (res && res.sheets) || [];
      if (!sheets.length) throw { message: 'The file has no readable sheets.' };
      const byMethod = {}, failed = {};
      METHOD_IDS.forEach(m => {
        let k = 0;
        const rk = typeof IO.rankSheets === 'function' ? safe(() => IO.rankSheets(res, m), null) : null;
        if (rk && rk.length) { const j = sheets.findIndex(x => x.name === rk[0].name); if (j >= 0) k = j; }
        const sh = sheets[k], det = safe(() => IO.detect(sh, m), null);
        if (!det) { failed[m] = []; return; }
        const missing = F.requiredMapping(m, det.inputGrain).filter(x => det.mapping[x] == null);
        if (missing.length) { failed[m] = missing; return; }
        const mapping = {};
        mappingFieldsFor(m, det.inputGrain, DEFAULTS.allocation).forEach(f => { if (det.mapping[f.id] != null) mapping[f.id] = det.mapping[f.id]; });
        const ap = safe(() => IO.applyMapping(sh, { headerRow: det.headerRow, inputGrain: det.inputGrain, mapping }, m), null);
        if (!ap || (ap.errors || []).length || !(ap.segments || []).length) { failed[m] = []; return; }
        byMethod[m] = { sheetName: sh.name, headerRow: det.headerRow, inputGrain: det.inputGrain, mapping, confidence: Object.assign({}, det.confidence || {}),
          heads: (sh.rows[det.headerRow] || []).map((c, i) => (c === '' || c == null ? `Column ${i + 1}` : String(c))),
          segments: ap.segments.map(r => Object.assign(blankRow(r.segment), r)), entities: ap.entities && ap.entities.length ? ap.entities : null,
          rowCount: ap.rowCount, warnings: (ap.warnings || []).map(w => w.message) };
      });
      fl.data = { kind: 'file', fileName, sheets, byMethod, failed, at: nowIso() };
      fl.error = null; fl.reviewed = false; fl.check = null; fl.audited = false; fl.step = 'confirm';
      audit('upload', `File selected: ${fileName} (${plural(sheets.length, 'sheet')})`);
      focusAfter('c-ai-flow-h'); render();
    }).catch(err => { fl.error = `${fileName}: ${(err && err.message) || String(err)}`; toast(`Could not read ${fileName}`, 'error'); render(); });
  }
  function aiUseSample() {
    const fl = state.ai.flow, rows = mergedSampleRows(), byMethod = {};
    METHOD_IDS.forEach(m => { byMethod[m] = { sheetName: null, headerRow: null, inputGrain: 'summary', mapping: {}, confidence: {}, heads: [], segments: rows.map(r => Object.assign(blankRow(r.segment), clone(r))), entities: null, rowCount: rows.length, warnings: ['Synthetic sample data'] }; });
    fl.data = { kind: 'sample', fileName: null, sheets: [], byMethod, failed: {}, at: nowIso() };
    fl.error = null; fl.reviewed = true; fl.check = null; fl.audited = false; fl.step = 'confirm';
    audit('ingest', `Synthetic sample selected for AI intake: ${plural(rows.length, 'segment')}`);
  }
  function aiFillExample() {
    const fl = state.ai.flow, key = aiDatasetKey() || 'sample', text = AS.EXAMPLE_BRIEFS[key];
    if (!text) { toast('There is no example brief for this file. Describe the engagement in your own words.', 'base'); return; }
    fl.brief = text; fl.exampleKey = key;
    const ex = SAMPLE && SAMPLE.aiExamples && SAMPLE.aiExamples[key];
    const filled = [];
    if (ex) {
      const p = state.project;
      if (!p.name.trim()) { p.name = ex.name; filled.push('project name'); }
      if (!p.client.trim()) { p.client = ex.client; filled.push('client'); }
      if (!p.brand.trim()) { p.brand = ex.brand; filled.push('brand'); }
      if (!p.planningPeriod.start && !p.planningPeriod.end) { p.planningPeriod = { start: ex.start, end: ex.end }; filled.push('planning period'); }
      if (p.grain !== ex.grain) { p.grain = ex.grain; filled.push('grain'); }
      if (filled.length) audit('project', `Project basics filled from the example brief: ${filled.join(', ')}`);
    }
    fl.basicsFilled = filled.length ? filled : null;
    audit('ai-brief', `Example brief filled (${key === 'sample' ? 'synthetic sample' : 'this file'}) · ${plural(text.length, 'character')}`);
  }
  function aiCheckSig() { const d = state.ai.flow && state.ai.flow.data; return JSON.stringify({ p: state.project, k: d && d.kind, f: d && d.fileName, at: d && d.at }); }
  const aiCheckPassed = () => { const c = state.ai.flow && state.ai.flow.check; return !!c && !c.issues.length && c.sig === aiCheckSig(); };
  function aiIssueWhere(e, basis) {
    const m = String(e.path || '').match(/^segments\[(\d*)\]\.(\w+)/);
    if (m) { const f = SEG_FIELD(m[2]); const s = basis && basis.segments[+m[1]]; return `Segment ${s ? s.segment : +m[1] + 1} · ${f ? f.label(state.project.grain) : 'value'}`; }
    return issueWhere(e);
  }
  function aiRunCheck() {
    const fl = state.ai.flow, issues = [];
    const pe = projectErrors();
    const lab = { name: 'Project name', client: 'Client', brand: 'Brand or product', start: 'Planning period start', end: 'Planning period end' };
    Object.keys(pe).forEach(k => issues.push({ where: lab[k], message: pe[k] }));
    const sup = aiSupport() || {};
    const ms = METHOD_IDS.filter(m => sup[m] && sup[m].ok);
    if (!ms.length) issues.push({ where: 'Segment data', message: 'The data supports no sizing method. Check the mapping or use another file.' });
    ms.forEach(m => {
      const b = aiBasisFor(m);
      const v = safe(() => E.validate(b), { errors: [{ code: 'engine', path: '', message: 'Validation is unavailable.' }] });
      v.errors.filter(e => issueStage(e) === 'inputs').forEach(e => issues.push({ where: `${methodLabel(m)} · ${aiIssueWhere(e, b)}`, message: e.message }));
    });
    fl.check = { at: nowIso(), issues, sig: aiCheckSig() };
    audit('checkpoint', issues.length ? `Inputs check failed: ${plural(issues.length, 'issue')} (AI intake)` : `Inputs check passed (AI intake: ${ms.map(methodLabel).join(', ')})`);
  }
  function aiBuildReason() {
    const fl = state.ai.flow;
    if (readOnly()) return 'Read-only role';
    if (!fl.data) return 'Bring in the segment data first';
    if (!fl.brief.trim()) return 'Write or paste a brief first';
    if (fl.data.kind === 'file' && !fl.reviewed) return 'Confirm that you have reviewed the mapping';
    if (!aiCheckPassed()) return 'Run the inputs check first';
    return '';
  }
  function aiBuild() {
    const fl = state.ai.flow, d = fl.data;
    if (!fl.audited && d.kind === 'file') {
      METHOD_IDS.filter(m => d.byMethod[m]).forEach(m => { const pv = aiProvenance(m); audit('mapping', `Mapping confirmed (${methodLabel(m)}): ${Object.keys(pv.mapping).map(k => `${MAP_FIELD(k).label} ← ${pv.mapping[k]}`).join('; ')}`); });
      audit('ingest', `Read ${d.fileName} for AI intake · ${METHOD_IDS.filter(m => d.byMethod[m]).map(m => `${methodLabel(m)}: sheet ${d.byMethod[m].sheetName}, ${d.byMethod[m].inputGrain}`).join('; ')}`);
    }
    fl.audited = true;
    const text = fl.brief, sheets = d.sheets || [];
    let set;
    try {
      const brief = AS.readBrief(text), sheetFacts = AS.readSourceSheets(sheets, d.fileName), support = aiSupport();
      set = AS.propose({ briefText: text, brief, sheetFacts, support, basisFor: aiBasisFor, grain: state.project.grain, precedent: PREC, sheets, now: nowIso(), seq: state.ai.sets.length + 1 });
    } catch (e) { toast(`The simulated assistant failed: ${(e && e.message) || e}`, 'error'); return; }
    state.ai.sets.push(set); state.ai.rev++; state.ai.planStatus = {};
    audit('ai-brief', `Brief captured: ${plural(text.length, 'character')} · digest ${set.briefDigest}`);
    audit('ai-proposed', `${set.id}: ${plural(set.plans.length, 'candidate')} (${set.plans.map(p => `${p.id} ${methodLabel(p.method)}`).join(', ')}) · ${set.providerVersion}${set.gaps.length ? ` · ${plural(set.gaps.length, 'open question')}` : ''}`);
    set.plans.filter(p => A_STATUS(p) !== 'proposed').forEach(p => audit('ai-blocked', `${p.id} ${p.idea}: ${aiReasons(p).join('; ')}`));
    fl.gapError = null;
    if (set.gaps.length) { fl.step = 'build'; focusAfter('c-ai-flow-h'); render(); return; }
    aiFinishIntake();
  }
  function aiFinishIntake() {
    const fl = state.ai.flow;
    fl.done = true; fl.open = false; fl.step = 'build';
    state.section = 'scenarios'; state.drawerOpen = false;
    toast('Candidate scenarios are ready. Review and adopt one to continue.', 'success');
    render(); window.scrollTo(0, 0);
    const main = document.getElementById('main'); if (main) main.focus({ preventScroll: true });
  }
  function aiApplyGaps() {
    const fl = state.ai.flow, set = aiSet();
    const answers = {}, bad = [];
    set.gaps.forEach((g, k) => {
      const el = document.getElementById(`ai-gap-${k}`), n = parseNum(el ? el.value : '');
      if (n == null) return;
      if (Number.isNaN(n) || n <= 0) bad.push(g.label); else answers[g.path] = n;
    });
    if (bad.length) { fl.gapError = `Enter a number above 0 for: ${bad.join(', ')}`; render(); return; }
    if (!Object.keys(answers).length) { fl.gapError = 'Enter at least one answer, or skip for now.'; render(); return; }
    const next = AS.fillGaps(set, answers, { basisFor: aiBasisFor, sourceTexts: aiSourceTexts() });
    state.ai.sets[state.ai.sets.length - 1] = next; state.ai.rev++;
    Object.keys(answers).forEach(p => audit('ai-gap-filled', `${set.id} · ${AS.pathLabel(p, state.project.grain)}: ${aiValText(p, answers[p])} (typed by the user)`));
    fl.gapError = null;
    if (!next.gaps.length) { aiFinishIntake(); return; }
    render();
  }

  /* ---------- candidate state */
  const A_STATUS = p => (p.checks ? AS.statusOf(p.checks) : p.status);
  function aiReasons(p) {
    const c = p.checks || {}, out = [];
    if (c.blockedPaths && c.blockedPaths.length) out.push(`Proposes a value it may not change (${c.blockedPaths.length})`);
    if (c.quotes && c.quotes.failed) out.push(`${plural(c.quotes.failed, 'source quote')} could not be verified`);
    if (c.lint && !c.lint.ok) out.push('Wording check failed');
    if (c.unsourced && c.unsourced.length) out.push(`${plural(c.unsourced.length, 'value')} without a source`);
    if (c.derivedAboveLow && c.derivedAboveLow.length) out.push('Derived values are not marked low confidence');
    if (c.aboveCap && c.aboveCap.length) out.push('A reallocation proposal must be medium confidence or lower');
    if (c.basisOk === false) out.push('The data changed since this was proposed');
    if (c.pendingGaps && c.pendingGaps.length) out.push(`Waiting on ${plural(c.pendingGaps.length, 'answer')}: ${c.pendingGaps.map(x => AS.pathLabel(x, state.project.grain)).join(', ')}`);
    else if (c.validateErrors && c.validateErrors.length) out.push(`Engine check: ${c.validateErrors.slice(0, 2).map(e => e.message).join('; ')}`);
    if (c.needsGate) out.push('Needs re-checking');
    return out;
  }
  const aiReady = p => A_STATUS(p) === 'proposed' && p.checks && p.checks.ok;
  const aiPrevCache = new Map();
  /* Candidate preview: FSEngine.calculate on applyPlan(plan, basisFor(method)). A preview only: never saved, never the draft. */
  function aiPreview(p) {
    const key = `${state.ai.rev}:${p.id}:${state.project.grain}`;
    if (aiPrevCache.has(key)) return aiPrevCache.get(key);
    let r = null;
    const b = aiReady(p) ? aiBasisFor(p.method) : null;
    if (b) r = safe(() => E.calculate(clone(AS.applyPlan(p, b))), null);
    if (aiPrevCache.size > 40) aiPrevCache.clear();
    aiPrevCache.set(key, r);
    return r;
  }
  function aiSourcesOf(setId, planId) {
    const set = state.ai.sets.find(s => s.id === setId);
    const p = set && set.plans.find(x => x.id === planId);
    return p ? p.sources : ((state.ai.adoption && state.ai.adoption.planId === planId && state.ai.adoption.sources) || []);
  }
  /* Review F-R2-03: source quotes are the user's text; mask any that contain the banned term or a listed name before display. */
  function aiQuote(q) {
    const t = String(q == null ? '' : q);
    if (typeof AS.maskText === 'function') { const m = AS.maskText(t); if (!AS.lint(m).hits.includes('client-name')) return m; }
    const hits = AS.lint(t).hits;
    return hits.some(h => h === AS.BANNED_TERMS[0] || h === 'client-name') ? '[quote withheld by the wording check]' : t;
  }
  function aiSourceText(change, sources) {
    const ss = (change.sourceIds || []).map(id => sources.find(s => s.id === id)).filter(Boolean);
    return ss.map(s => `${s.title}${s.locator ? ` (${s.locator})` : ''}`).join('; ') || 'No source';
  }
  function aiTip(change, sources, extra) {
    const ss = (change.sourceIds || []).map(id => sources.find(s => s.id === id)).filter(Boolean);
    const src = ss.map(s => `${s.title}${s.locator ? ', ' + s.locator : ''}${s.quote ? `: “${aiQuote(s.quote).slice(0, 140)}”` : ''}${s.quoteVerified ? ' (quote verified)' : ''}`).join(' · ');
    return `Simulated AI. ${extra ? extra + ' ' : ''}Source: ${src || 'none'}. Confidence: ${change.confidence}.${change.derived ? ` Derived: ${change.derived.formula}, check it.` : ''}`;
  }

  /* ---------- adopt, decide, provenance */
  /* Review M3: ask before replacing a draft with unsaved edits, corrections or pending AI values (like the baseline replace dialog). */
  function aiAdopt(planId) {
    if (readOnly()) return;
    const set = aiSet(), p = set && set.plans.find(x => x.id === planId);
    if (!p) return;
    const unsaved = state.segments.length > 0 && !!method() && !state.scenarios.some(s => JSON.stringify(s.inputs) === assumptionsSig());
    const n = aiPendingCount(), corr = state.corrections.length;
    if (n || corr || unsaved) { openDialog({ type: 'aiReplace', planId, idea: p.idea, n, corrections: corr }); return; }
    aiAdoptNow(planId);
  }
  function aiAdoptNow(planId) {
    if (readOnly()) return;
    const set = aiSet(), p = set && set.plans.find(x => x.id === planId);
    if (!p) return;
    const basis = aiBasisFor(p.method);
    const checks = basis ? AS.gate(p, basis, aiSourceTexts()) : null;       // re-gate against the current data before adopting
    if (!checks || AS.statusOf(checks) !== 'proposed' || !checks.ok) { toast(`${p.id} cannot be adopted: ${aiReasons(Object.assign({}, p, { checks: checks || {} })).join('; ') || 'the data is no longer available'}`, 'error'); return; }
    aiClearStores();   // F-R2-10: an adoption replaces every method store a previous adoption wrote
    const inp = clone(AS.applyPlan(p, basis)), m = p.method, ds = state.ai.flow.data.byMethod[m];
    const ids = new Set(F.segmentFieldsFor(m, (inp.methodAssumptions && inp.methodAssumptions.allocation) || DEFAULTS.allocation, inp.inputGrain).map(f => f.id));
    state.project.method = m; state.inputGrain = inp.inputGrain;
    state.segments = ds.segments.map((s, i) => {
      const row = Object.assign(blankRow(s.segment), clone(s)), t = inp.segments[i] || {};
      ['reachPct', 'maxCalls', 'minCalls', 'plannedCalls'].forEach(k => { if (k === 'reachPct' || ids.has(k)) row[k] = t[k] == null ? null : t[k]; });
      return row;
    });
    state.entities = ds.entities ? clone(ds.entities) : null;
    fillDefaultUptake();   // P4: as for an import, archetypes new to the project start with the configuration's default uptake
    state.shared = Object.assign(blankShared(), inp.shared, { layers: Object.assign(blankShared().layers, inp.shared.layers || {}) }); state.repCostByMode = {};
    if (m === 'workload') state.workloadCost = inp.shared.repCost != null;
    else {
      const v = inp.methodAssumptions.value || {};
      state.valueMode[m] = Array.isArray(v.years) ? 'chain' : 'direct';
      const merged = Object.assign(methodDefaults()[m], inp.methodAssumptions);
      merged.value = Object.assign(blankValue(), v);
      state.methodStore[m] = merged; state.ai.touched[m] = true;
    }
    state.provenance = aiProvenance(m); state.corrections = []; state.parentId = null; state.draftName = null; state.importFlow = null;
    state.result = null; state.resultSig = null; state.resultAt = null; state.resultInputs = null;
    state.checkpoints.assumptions = null; state.checkRuns = { inputs: null, assumptions: null };
    const up = safe(() => E.validate(buildInputs()), { errors: [] }).errors.filter(e => issueStage(e) === 'inputs');
    const inOk = !Object.keys(projectErrors()).length && !up.length;
    state.checkpoints.inputs = inOk ? { sig: inputsSig(), at: nowIso() } : null;
    const who = me();
    state.ai.adoption = { planId: p.id, setId: set.id, idea: p.idea, method: m, startedBy: who.user, startedAt: nowIso(), sources: clone(p.sources) };
    state.ai.valueOrigins = [];
    const items = p.changes.filter(c => c.path !== 'method').map(c => ({ change: clone(c), status: 'pending', finalValue: null, decidedBy: null, decidedAt: null }));
    state.ai.pending = { planId: p.id, setId: set.id, items, bulkReviewed: false, checks };
    state.ai.planStatus[p.id] = 'adopted';
    const low = items.filter(x => x.change.confidence === 'low').length;
    audit('ai-adopt-start', `${p.id} · ${p.idea} · ${methodLabel(m)}: ${plural(items.length, 'AI value')} to review (${fmt.int(low)} low confidence)`);
    state.section = inOk ? 'assumptions' : 'setup';
    toast(inOk ? `${p.idea} is in the working draft. Review each AI value before the assumptions check.` : 'Complete the project details and run the inputs check, then review the AI values on Model Assumptions.', inOk ? 'success' : 'warning');
    render(); window.scrollTo(0, 0);
  }
  function aiRegate() {
    const pd = state.ai.pending, set = state.ai.sets.find(s => s.id === pd.setId), p = set && set.plans.find(x => x.id === pd.planId);
    const b = p && aiBasisFor(p.method);
    if (!p || !b) return;
    const decided = Object.assign({}, p, { changes: pd.items.filter(x => x.status === 'accepted' || x.status === 'edited').map(x => Object.assign({}, x.change, { to: x.finalValue })), pendingGaps: [] });
    pd.checks = safe(() => AS.gate(decided, b, aiSourceTexts()), pd.checks);
  }
  function aiDecide(i, kind, value) {
    const pd = state.ai.pending, it = pd && pd.items[i];
    if (!it || it.status !== 'pending' || readOnly()) return;
    const c = it.change, who = me(), at = nowIso(), src = aiSourceText(c, aiSourcesOf(pd.setId, pd.planId)), lbl = aiPathLabel(c.path);
    if (kind === 'reject') {
      aiSetDraft(c.path, c.from); it.status = 'rejected'; it.finalValue = c.from;
      audit('ai-rejected', `${lbl}: ${aiValText(c.path, c.to)} → ${aiValText(c.path, c.from)} (AI value rejected; ${src})`);
    } else {
      const final = kind === 'edit' ? value : c.to;
      aiSetDraft(c.path, final); it.status = kind === 'edit' ? 'edited' : 'accepted'; it.finalValue = final;
      state.ai.valueOrigins = state.ai.valueOrigins.filter(v => v.path !== c.path).concat({ path: c.path, origin: kind === 'edit' ? 'ai-edited' : 'ai-accepted', proposalSetId: pd.setId, planId: pd.planId,
        sourceIds: (c.sourceIds || []).slice(), confidence: c.confidence, decidedBy: who.user, decidedRole: who.role, decidedAt: at, aiValue: clone(c.to), finalValue: clone(final) });
      audit(kind === 'edit' ? 'ai-edit-accepted' : 'ai-accepted', `${lbl}: ${aiValText(c.path, c.from)} → ${aiValText(c.path, final)} (${src}${kind === 'edit' ? `; AI value ${aiValText(c.path, c.to)}` : ''})`);
    }
    it.decidedBy = who.user; it.decidedAt = at;
    aiRegate();
  }
  /* A manual edit of an AI-origin value removes its ValueOrigin (the audit keeps the history); a pending value edited by hand is replaced. */
  function aiManualEdit(paths) {
    if (!state.ai.valueOrigins.length && !state.ai.pending) return;
    (paths || []).filter(Boolean).forEach(path => {
      const hit = v => v === path || (/\[\*\]/.test(v) && new RegExp('^' + v.replace(/[.[\]*]/g, '\\$&').replace('\\[\\*\\]', '\\[\\d+\\]') + '$').test(path));
      state.ai.valueOrigins = state.ai.valueOrigins.filter(v => !hit(v.path));
      const pd = state.ai.pending;
      if (pd) pd.items.forEach(it => {
        if (it.status !== 'pending' || !hit(it.change.path)) return;
        it.status = 'replaced'; it.decidedBy = curUser().name; it.decidedAt = nowIso();
        audit('ai-rejected', `${aiPathLabel(it.change.path)}: AI value ${aiValText(it.change.path, it.change.to)} replaced by a manual edit`);
      });
    });
  }
  function aiBindPath(bind) {
    if (/^shared\./.test(bind)) return bind;
    if (/^ma\./.test(bind)) return 'methodAssumptions.' + bind.slice(3).replace(/\.years\.(\d+)\./, '.years[$1].');
    return null;
  }
  function aiRadioPaths(a) {
    const R = { costMode: ['shared.costMode', 'shared.repCost'], valueMode: ['ui.valueMode'], allocation: ['methodAssumptions.allocation'], roiBasis: ['methodAssumptions.roiBasis', 'methodAssumptions.cutoff'], stoppingRule: ['methodAssumptions.stoppingRule'],
      realloc: [REALLOC_PATH] };
    return R[a] || [];
  }
  /* Discard every still-pending AI value (review C1 / F-R2-01): restore the value from before the proposal, log one
     ai-rejected row per value, and drop the pending list. restore: true | 'nonSegments' (data already replaced) | false (draft already replaced).
     Decided values stay (with their provenance) only when the draft and method stay the same (AI switched off). */
  function aiRevertPending(reason, restore) {
    const pd = state.ai.pending, ad = state.ai.adoption, m = ad ? ad.method : method();
    const mode = restore === undefined ? true : restore;
    if (pd) pd.items.forEach(it => {
      if (it.status !== 'pending') return;
      const c = it.change, seg = /^segments\[/.test(c.path);
      if (mode === true || (mode === 'nonSegments' && !seg)) aiSetDraft(c.path, c.from, m);
      it.status = 'rejected'; it.finalValue = c.from; it.decidedBy = curUser().name; it.decidedAt = nowIso();
      const restored = mode === true || (mode === 'nonSegments' && !seg);
      audit('ai-rejected', `${aiPathLabel(c.path)}: AI value ${aiValText(c.path, c.to)} ${reason === 'another scenario cloned' ? 'discarded before cloning' : `discarded (${reason})`}${restored ? `; restored ${aiValText(c.path, c.from)}` : ''}`);
    });
    state.ai.pending = null;
    /* Review F-R2-07: a method change keeps the adoption and the accepted/edited origins (like AI off); only still-valid ones reach a snapshot. */
    const keep = reason === 'AI assistance turned off' || reason === 'method changed';
    if (!keep || !state.ai.valueOrigins.length) { state.ai.adoption = null; state.ai.valueOrigins = []; }
  }
  /* What happens to the values already accepted or edited, worded per reason so it is literally true (review Info / F-R2-10). */
  function aiDiscardKeptText(reason) {
    const home = state.ai.adoption ? methodLabel(state.ai.adoption.proposedMethod || state.ai.adoption.method) : 'the proposed method';
    return ({
      'AI assistance turned off': 'Values you already accepted or edited stay in the draft, with their AI provenance.',
      'method changed': `Values you already accepted or edited that also apply to the new method keep their AI provenance. The others stay with the ${home} assumptions (hidden and ignored) and get their provenance back if you return to ${home}.`,
      'new data loaded': 'Values you already accepted or edited lose their AI provenance: segment values are replaced by the new data, method assumptions are reset, and shared assumptions (capacity, cost, rates) stay in the draft as ordinary values unless the sample project replaces them.',
      'another candidate adopted': 'Values you already accepted or edited are replaced by the new candidate’s values, which you review again.',
      'another scenario cloned': 'Values you already accepted or edited are replaced by the cloned scenario’s values; only the AI provenance saved with that scenario, if any, carries over.'
    })[reason] || 'Values you already accepted or edited lose their AI provenance.';
  }
  /* Ask before a step that would drop pending AI values; `then` runs after the user chooses to discard them. */
  function aiGuard(reason, then) {
    const n = aiPendingCount();
    if (!n) { then(); return; }
    openDialog({ type: 'aiDiscard', reason, n, then });
  }
  /* F-R2-10: reset every method store (and value-entry mode) an AI adoption or decision wrote, except `keep`. `touched` is only
     ever set by aiSetDraft / aiAdoptNow, so with AI unused this is a no-op (AI-off parity). Not called on a method change:
     the kept adoption's hidden store must survive it (F-R2-07 round trip). */
  function aiClearStores(keep) {
    const t = state.ai.touched || (state.ai.touched = {});
    Object.keys(t).forEach(m => {
      if (m === keep) return;
      state.methodStore[m] = methodDefaults()[m];
      if (m !== 'workload') state.valueMode[m] = 'chain';
      delete t[m];
    });
  }
  function aiResetDraft(keep) { if (state.ai.pending) aiRevertPending('new data loaded', 'nonSegments'); state.ai.adoption = null; state.ai.pending = null; state.ai.valueOrigins = []; aiClearStores(keep); }
  function aiAfterClone(s) {
    const m = s.inputs.method;
    if (state.ai.pending) aiRevertPending('another scenario cloned', false);
    aiClearStores(m);
    if (s.ai) {
      /* F-R2-12: restore the structured method-change fields, so names, Origin wording and a later change on the clone stay right. */
      const changed = !!s.ai.methodChangedTo;
      state.ai.adoption = { planId: s.ai.planId, setId: s.ai.proposalSetId, idea: s.ai.candidateIdea || s.ai.idea, method: m, startedBy: s.ai.adoptedBy, startedAt: s.ai.adoptedAt, sources: clone(s.ai.sources || []), clonedFrom: s.id,
        proposedMethod: changed ? (s.ai.methodChangedFrom || m) : m, methodChangedFrom: changed ? (s.ai.methodChangedFrom || null) : null };
      state.ai.valueOrigins = clone(s.ai.valueOrigins || []); state.ai.pending = null;
      if (m !== 'workload') state.ai.touched[m] = true; else delete state.ai.touched[m];
    } else { aiResetDraft(m); delete state.ai.touched[m]; }
  }
  /* snapshot.ai (contract §3) with the sources each accepted value used, so the snapshot is self-contained. */
  /* Origins still valid for these engine inputs: the value is unchanged, and after a method change only paths that are not
     method-specific (shared.*, visible segment controls) carry over; method assumptions and the value-entry mode do not. */
  /* F-R2-13: one predicate for "this accepted AI value drives the result under method m" (dialog count, chips, snapshot, export,
     method audit row). Method assumptions and the value-entry mode apply only under the method they were proposed for; shared
     values apply everywhere except the cost inputs a Workload draft ignores with field cost unticked; segment values apply when
     the method shows that field (reach always). */
  const AI_WL_COST_RE = /^shared\.(repCost|inflationPct|discountRatePct|layers|costMode)/;
  function aiOriginApplies(v, m) {
    const ad = state.ai.adoption, home = ad ? (ad.proposedMethod || ad.method) : m;
    if (/^methodAssumptions\./.test(v.path) || v.path === 'ui.valueMode') return m === home && !(v.path === 'ui.valueMode' && m === 'workload');
    if (/^shared\./.test(v.path)) return !(m === 'workload' && !state.workloadCost && AI_WL_COST_RE.test(v.path));
    const sm = /^segments\[[^\]]+\]\.(\w+)$/.exec(v.path);
    if (sm) return sm[1] === 'reachPct' || new Set(F.segmentFieldsFor(m, (state.methodStore[m] || {}).allocation || DEFAULTS.allocation, state.inputGrain).map(f => f.id)).has(sm[1]);
    return true;
  }
  const aiOriginsUnder = m => (state.ai.adoption ? state.ai.valueOrigins.filter(v => aiOriginApplies(v, m)) : []);
  /* F-R2-07 (5): how many accepted AI values would keep their provenance under method `to`. */
  function aiCarryNote(to) {
    if (!state.ai.adoption || !state.ai.valueOrigins.length) return '';
    const n = aiOriginsUnder(to).length;
    return n ? `<p class="mt8">${icon('info', 14)} ${plural(n, 'accepted AI value')} that also ${n === 1 ? 'applies' : 'apply'} to ${esc(methodLabel(to))} keep their AI provenance.</p>` : '';
  }
  /* Origins still valid for these engine inputs: the shared predicate, and the value is unchanged. */
  function aiValidOrigins(inputs) {
    if (!state.ai.adoption) return [];
    return state.ai.valueOrigins.filter(v => {
      if (!aiOriginApplies(v, inputs.method)) return false;
      const cur = v.path === 'ui.valueMode' ? valueMode() : aiGet(inputs, v.path);
      return JSON.stringify(cur === undefined ? null : cur) === JSON.stringify(v.finalValue);
    });
  }
  /* F-R2-14: the reconciling note on the `method` audit row (which accepted AI values stop or start applying). */
  function aiMethodNote(from, to) {
    if (!from || !state.ai.adoption || !state.ai.valueOrigins.length) return '';
    const before = new Set(aiOriginsUnder(from).map(v => v.path)), after = aiOriginsUnder(to), afterSet = new Set(after.map(v => v.path));
    const lost = state.ai.valueOrigins.filter(v => before.has(v.path) && !afterSet.has(v.path)), back = after.filter(v => !before.has(v.path));
    let out = '';
    if (lost.length) out += ` · ${plural(lost.length, 'accepted AI value')} ${lost.length === 1 ? 'does' : 'do'} not apply under ${methodLabel(to)} and ${lost.length === 1 ? 'is' : 'are'} kept with the ${methodLabel(from)} assumptions (hidden and ignored): ${lost.map(v => aiPathLabel(v.path)).join(', ')}; ${fmt.int(after.length)} keep their AI provenance`;
    if (back.length) out += ` · ${plural(back.length, 'accepted AI value')} ${back.length === 1 ? 'applies' : 'apply'} again: ${back.map(v => aiPathLabel(v.path)).join(', ')}`;
    return out;
  }
  function aiSnapshotTag(draft) {
    const ad = state.ai.adoption;
    if (!ad) return null;
    const vos = aiValidOrigins(draft.inputs);
    if (ad.methodChangedFrom && !vos.length) return null;   // nothing AI-origin survives the method change
    const used = new Set([].concat(...vos.map(v => v.sourceIds)));
    const changed = ad.methodChangedFrom ? { methodChangedFrom: ad.proposedMethod, methodChangedTo: draft.inputs.method, candidateIdea: ad.idea } : {};
    /* `idea` carries the method-change note so the export (which prints snapshot.ai.idea) says the same as the UI. */
    return Object.assign({ origin: 'ai-proposed', planId: ad.planId, proposalSetId: ad.setId, idea: ad.methodChangedFrom ? `${ad.idea} (method changed to ${methodLabel(draft.inputs.method)})` : ad.idea,
      adoptedBy: ad.startedBy, adoptedAt: ad.startedAt, valueOrigins: clone(vos), sources: clone((ad.sources || []).filter(s => used.has(s.id))) }, changed);
  }
  function aiAfterSave(snap, tag) {
    const w = state.ai.narratives.working;
    if (w && w.why && snap.result && w.why.boundTo === snap.result.inputsHash) state.ai.narratives[snap.id] = { why: w.why };
    if (tag && !(state.ai.adoption && state.ai.adoption.clonedFrom)) audit('ai-adopted', `${snap.id} saved from ${tag.planId} · ${tag.idea}: ${plural(tag.valueOrigins.length, 'AI-origin value')}`, snap.id);
  }
  const aiOriginText = s => (!s.ai ? 'Analyst' : s.ai.methodChangedTo ? `AI-proposed · ${s.ai.candidateIdea} · adopted by ${s.ai.adoptedBy} (method changed to ${methodLabel(s.ai.methodChangedTo)})` : `AI-proposed · ${s.ai.idea} · adopted by ${s.ai.adoptedBy}`);
  function aiExportArgs(args) {
    const N = state.ai.narratives, out = {};
    Object.keys(N).forEach(k => {
      if (k === 'working') return;
      const e = N[k], list = [e.why, e.reviewer, e.comparison].filter(Boolean).map(n => ({ kind: n.kind, text: n.text, boundTo: n.boundTo, simulated: true }));
      if (list.length) out[k] = list.length === 1 ? list[0] : list;
    });
    if (Object.keys(out).length) args.narratives = out;
    if (state.scenarios.some(s => s.ai)) { const ps = {}; state.ai.sets.forEach(s => { ps[s.id] = s; }); args.proposalSets = ps; }
  }

  /* ---------- chips on Model Assumptions (after render; no-op unless an adopted candidate is in the draft) */
  const AI_INPUT_ID = { 'shared.capacity': 'sh-cap', 'shared.repCost': 'sh-rep', 'shared.inflationPct': 'sh-infl', 'shared.discountRatePct': 'sh-disc', 'shared.capacityInput.callsPerDay': 'sh-cpd',
    'shared.capacityInput.workingDays': 'sh-days', 'shared.layers.flmSpan': 'sh-flmspan', 'shared.layers.flmCost': 'sh-flmcost', 'shared.layers.slmSpan': 'sh-slmspan', 'shared.layers.slmCost': 'sh-slmcost',
    'methodAssumptions.value.annualValue': 'v-annual', 'methodAssumptions.value.sizingStartYear': 'v-start', 'methodAssumptions.value.grossMarginPct': 'v-gm',
    'methodAssumptions.totalRoiCutoff': 'a-cut', 'methodAssumptions.cutoff': 'r-cut' };
  const AI_RADIO = { 'shared.costMode': 'costMode', 'ui.valueMode': 'valueMode', 'methodAssumptions.allocation': 'allocation', 'methodAssumptions.roiBasis': 'roiBasis', 'methodAssumptions.stoppingRule': 'stop',
    'methodAssumptions.reallocateExcluded': 'realloc' };
  function aiMarkEl(text, tip, cls) {
    const s = document.createElement('span');
    s.className = `chip chip-sm chip-ai ${cls}`; s.tabIndex = 0; s.dataset.tip = tip; s.textContent = text; s.setAttribute('aria-label', `${text}. ${tip}`);
    return s;
  }
  function aiDecorate() {
    if (!aiOn() || state.section !== 'assumptions' || !state.ai.adoption) return;
    const ad = state.ai.adoption, srcs = ad.sources || [], marks = {};
    (state.ai.pending ? state.ai.pending.items : []).forEach(it => { if (it.status === 'pending') marks[it.change.path] = { text: `${GLYPH} AI · pending review`, tip: aiTip(it.change, srcs, `Proposed ${aiValText(it.change.path, it.change.to)}.`), cls: 'is-pending' }; });
    aiValidOrigins(buildInputs()).forEach(v => { marks[v.path] = { text: `${GLYPH} AI · ${v.origin === 'ai-edited' ? 'edited' : 'accepted'} by ${v.decidedBy}`, tip: aiTip(v, srcs, `AI value ${aiValText(v.path, v.aiValue)}.`), cls: '' }; });
    Object.keys(marks).forEach(path => {
      const mk = marks[path], seg = /^segments\[(\d+|\*)\]\.(\w+)$/.exec(path), yr = /^methodAssumptions\.value\.years\[(\d+)\]\.(forecast|carryoverPct|otherChannelPct|sfPct)$/.exec(path);
      const cells = seg ? (seg[1] === '*' ? state.segments.map((_, i) => `s-${i}-${seg[2]}`) : [`s-${seg[1]}-${seg[2]}`]) : yr ? [`vy-${yr[1]}-${{ forecast: 'f', carryoverPct: 'c', otherChannelPct: 'o', sfPct: 's' }[yr[2]]}`] : [];
      cells.forEach(id => { const el = document.getElementById(id), td = el && el.closest('td'); if (!td || td.querySelector('.chip-ai')) return; td.classList.add('ai-cell'); const c = aiMarkEl(GLYPH, `${mk.text}. ${mk.tip}`, `ai-dot ${mk.cls}`); c.setAttribute('aria-label', `${mk.text}. ${mk.tip}`); td.appendChild(c); });
      if (AI_INPUT_ID[path]) { const el = document.getElementById(AI_INPUT_ID[path]), fd = el && el.closest('.field'); if (fd && !fd.querySelector('.chip-ai')) { const w = document.createElement('div'); w.className = 'ai-mark'; w.appendChild(aiMarkEl(mk.text, mk.tip, mk.cls)); fd.appendChild(w); } }
      if (AI_RADIO[path]) { const el = document.querySelector(`input[name="${AI_RADIO[path]}"]`), lg = el && el.closest('fieldset') && el.closest('fieldset').querySelector('legend'); if (lg && !lg.querySelector('.chip-ai')) { lg.appendChild(document.createTextNode(' ')); lg.appendChild(aiMarkEl(mk.text, mk.tip, mk.cls)); } }
    });
  }

  /* ---------- views */
  function aiToggleHtml() {
    if (!AS) return '';
    const on = aiOn();
    return `<button type="button" class="switch ai-switch" role="switch" id="ai-toggle" data-ai-toggle="${on ? 'on' : 'off'}" aria-checked="${on}" data-act="aiToggle" ${readOnly() ? 'aria-disabled="true" data-tip="Read-only role"' : ''}>
      <span class="sw-track" aria-hidden="true"><span class="sw-txt">${on ? 'ON' : 'OFF'}</span><span class="sw-thumb"></span></span><span class="sw-lbl">AI assistance${on ? ' (simulated)' : ''}: ${on ? 'On' : 'Off'}</span></button>`;
  }
  /* Review m9: with AI on and nothing started, only the two entry cards show; "Set up manually" expands the form. */
  const aiEntryOnly = () => aiOn() && !state.ai.flow && state.ai.entry !== 'manual' && !state.segments.length && !state.project.method && !state.project.name;
  function aiEntryCards() {
    if (!aiOn()) return '';
    const fl = state.ai.flow;
    if (fl) {
      const set = aiSet();
      const status = fl.done && set ? `${plural(set.plans.length, 'candidate')} proposed from ${esc(fl.data && fl.data.kind === 'file' ? fl.data.fileName : 'the synthetic sample')}.` : `Stopped at step: ${esc((AI_STEPS.find(s => s[0] === fl.step) || AI_STEPS[0])[1])}.`;
      return card({ id: 'c-ai-resume', cls: 'ai-card', title: `${GLYPH} AI intake`, sub: `${simTag()} ${status}`,
        actions: `${fl.done && set ? btn({ label: 'Go to candidates', act: 'nav', arg: 'scenarios', kind: 'outline', id: 'ai-go-cands', ic: 'chevRight' }) : btn({ label: 'Resume AI intake', act: 'aiStart', kind: 'outline', id: 'ai-resume', reason: readOnly() ? 'Read-only role' : '' })}${btn({ label: 'Start a new AI intake', act: 'aiRestart', kind: 'text', id: 'ai-restart', reason: readOnly() ? 'Read-only role' : '' })}`, body: '' });
    }
    if (state.ai.entry === 'manual' || state.segments.length || state.project.method) return '';
    return `<div class="ai-entry">${card({ id: 'c-ai-entry', cls: 'ai-card', title: `${GLYPH} Start with AI assist`, sub: `${simTag()} Describe the engagement, bring in the segment data and confirm it. The simulated assistant proposes 3–4 candidate scenarios, each calculated by the engine. Nothing enters your model until you review and adopt it.`,
        body: `<div>${btn({ label: 'Start with AI assist', act: 'aiStart', kind: 'primary', id: 'ai-start', ic: 'chevRight', reason: readOnly() ? 'Read-only role' : '' })}</div>` })}
      ${card({ id: 'c-manual-entry', title: 'Set up manually', sub: 'Name the engagement, choose the sizing method and bring in the data yourself, step by step. New to field sizing? Load a complete synthetic project to see how every step fits together.', body: `<div class="row-actions">${btn({ label: 'Set up manually', act: 'aiManual', kind: 'outline', id: 'ai-manual' })}${btn({ label: 'Load synthetic sample project', act: 'loadSample', kind: 'text', ic: 'file', id: 'load-sample' })}${SAMPLE && SAMPLE.multiSpecialty ? btn({ label: 'Load multi-specialty synthetic sample', act: 'loadSampleMulti', kind: 'text', ic: 'file', id: 'load-sample-multi' }) : ''}${presetSampleBtn()}</div>` })}</div>`;
  }
  const AI_STEPS = [['brief', 'Brief'], ['data', 'Data'], ['confirm', 'Confirm data'], ['build', 'Candidates']];
  function aiIntakeView() {
    const fl = state.ai.flow, cur = AI_STEPS.findIndex(s => s[0] === fl.step);
    const ind = `<ol class="wiz-steps" aria-label="AI intake steps">${AI_STEPS.map((s, i) => `<li class="${i < cur ? 'done' : i === cur ? 'current' : ''}" ${i === cur ? 'aria-current="step"' : ''}>${icon(i < cur ? 'check' : i === cur ? 'dot' : 'circle', 14)}<span>${i + 1}. ${s[1]}</span></li>`).join('')}</ol>`;
    const head = card({ id: 'c-ai-flow', cls: 'ai-card', title: `${GLYPH} AI intake`, sub: `${simTag()} Step ${cur + 1} of ${AI_STEPS.length}. The simulated assistant reads only the brief and the data you give it here. It proposes; the engine calculates; you decide.`,
      actions: btn({ label: 'Leave AI intake', act: 'aiLeave', kind: 'text', id: 'ai-leave', ic: 'x' }), body: ind });
    const body = fl.step === 'brief' ? aiBriefStep() : fl.step === 'data' ? aiDataStep() : fl.step === 'confirm' ? aiConfirmStep() : aiBuildStep();
    return head + body;
  }
  function aiBriefStep() {
    const fl = state.ai.flow, p = state.project, key = fl.data ? aiDatasetKey() : null;
    const hasEx = key ? !!AS.EXAMPLE_BRIEFS[key] : true;
    const exLabel = key ? 'Use the example brief for this file' : 'Use the example brief for the synthetic sample';
    const basics = `<div class="grid g3">
        ${textInput({ id: 'p-name', bind: 'project.name', value: p.name, label: 'Project name' })}
        ${textInput({ id: 'p-client', bind: 'project.client', value: p.client, label: 'Client' })}
        ${textInput({ id: 'p-brand', bind: 'project.brand', value: p.brand, label: 'Brand or product', hint: 'Used in default scenario names.' })}
        ${textInput({ id: 'p-start', bind: 'project.planningPeriod.start', value: p.planningPeriod.start, label: 'Planning period start', placeholder: 'YYYY-MM-DD', hint: 'Use YYYY-MM-DD.' })}
        ${textInput({ id: 'p-end', bind: 'project.planningPeriod.end', value: p.planningPeriod.end, label: 'Planning period end', placeholder: 'YYYY-MM-DD', hint: 'Use YYYY-MM-DD.' })}
        ${radioGroup({ name: 'grain', label: 'Sizing grain', value: p.grain, onAct: 'grain', inline: true, options: Object.keys(F.GRAIN).map(g => ({ value: g, label: g === 'hcp' ? 'HCP' : cap(F.GRAIN[g].one) })) })}
      </div>${fl.basicsFilled ? `<p class="hint">${icon('info', 14)} Filled from the example: ${esc(fl.basicsFilled.join(', '))}. These are your fields; edit them freely.</p>` : ''}`;
    return card({ id: 'c-ai-brief', step: 1, title: 'Describe the engagement', sub: 'Plain language is fine: brand, grain, rep cost, calls per rep, value or forecast, ROI bar, priorities. Only text typed or pasted here is read.',
      actions: hasEx ? btn({ label: exLabel, act: 'aiExample', kind: 'text', ic: 'file', id: 'ai-example', reason: readOnly() ? 'Read-only role' : '' }) : '',
      body: `${textArea({ id: 'ai-brief', bind: 'ai.brief', value: fl.brief, label: 'Engagement brief', rows: 7, hint: fl.exampleKey ? 'Example brief (synthetic). Edit it as you like.' : 'For example: “Rep cost is $250K fully loaded and each rep makes about 1,500 calls per rep per year.”' })}
        <div class="sep"></div><h3 class="sub-h">Project basics</h3>${basics}
        <div class="row-actions">${btn({ label: 'Next: segment data', act: 'aiStep', arg: 'data', kind: 'primary', ic: 'chevRight', id: 'ai-next' })}</div>` });
  }
  function aiDataStep() {
    const fl = state.ai.flow, dis = readOnly(), d = fl.data;
    const loaded = d ? msg('success', `${d.kind === 'file' ? `Read <strong>${esc(d.fileName)}</strong>` : 'Synthetic sample selected'}. Continue to confirm it, or choose other data.`, { actions: btn({ label: 'Continue to confirm', act: 'aiStep', arg: 'confirm', kind: 'outline', id: 'ai-to-confirm', ic: 'chevRight' }) }) : '';
    return card({ id: 'c-ai-data', step: 2, title: 'Bring in the segment data', sub: 'Upstream Segmentation & Targeting output. The method is not chosen yet, so the file is read for every method it can support.',
      body: `${fl.error ? msg('error', esc(fl.error), { title: 'This file could not be read' }) : ''}${loaded}<div class="panes">
        <div class="pane"><h3 class="pane-h">${icon('upload')}<span>Import a file</span></h3><p class="pane-sub">Excel (.xlsx, .xlsm) or CSV. Every sheet is read; non-data sheets such as a suggested call plan can serve as sources.</p>
          <div class="dropzone${dis ? ' is-disabled' : ''}" data-drop="ai">${icon('upload', 24)}<p class="dz-main">Drag and drop a file here, or</p>
          <button type="button" class="btn btn-base" id="ai-pick-file" data-act="aiPickFile" ${dis ? 'aria-disabled="true" data-tip="Read-only role"' : ''}>Select files…</button></div></div>
        <div class="pane-or" aria-hidden="true"><span>or</span></div>
        <div class="pane"><h3 class="pane-h">${icon('table')}<span>Use the synthetic sample</span></h3><p class="pane-sub">Ten synthetic HCP deciles with composite value, reach, call limits, planned calls and archetype mixes, so every method is available.</p>
          <div class="pane-actions">${btn({ label: 'Use the synthetic sample', act: 'aiSample', kind: 'outline', ic: 'file', id: 'ai-sample', reason: dis ? 'Read-only role' : '' })}</div></div></div>
        <div class="row-actions">${btn({ label: 'Back', act: 'aiStep', arg: 'brief', kind: 'outline', ic: 'chevLeft', id: 'ai-back' })}</div>` });
  }
  function aiConfirmStep() {
    const fl = state.ai.flow, d = fl.data;
    if (!d) return aiDataStep();
    const mg = aiMerged(), sup = aiSupport(), g = state.project.grain;
    const desc = safe(() => AS.describeData(mg), { lines: [], flags: [] });
    let mapping = '';
    if (d.kind === 'file') {
      const fields = {};
      METHOD_IDS.filter(m => d.byMethod[m]).forEach(m => { const ds = d.byMethod[m]; Object.keys(ds.mapping).forEach(id => { const f = fields[id] = fields[id] || { id, col: ds.heads[ds.mapping[id]], conf: ds.confidence[id], sheet: ds.sheetName, methods: [] }; f.methods.push(methodLabel(m)); }); });
      const band = c => (c == null ? '—' : c >= 0.85 ? `High (${Math.round(c * 100)}%)` : c >= 0.6 ? `Medium (${Math.round(c * 100)}%)` : `Low (${Math.round(c * 100)}%)`);
      mapping = `<h3 class="sub-h">Column mapping</h3><p class="hint mb8">Detected per method from the sheet each method reads. Check each one.</p>
        <div class="grid-wrap"><table class="grid-t map-t"><thead><tr><th scope="col">Model field</th><th scope="col">Source column</th><th scope="col">Sheet</th><th scope="col">Detection</th><th scope="col">Used by</th></tr></thead>
        <tbody>${Object.keys(fields).map(k => { const f = fields[k]; return `<tr><th scope="row" class="rowh">${esc(MAP_FIELD(f.id) ? MAP_FIELD(f.id).label : f.id)}</th><td>${esc(f.col)}</td><td>${esc(f.sheet)}</td><td>${esc(band(f.conf))}</td><td>${esc(f.methods.join(', '))}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="mt8">${checkbox({ id: 'ai-reviewed', label: 'I have reviewed this column mapping', checked: fl.reviewed, onAct: 'aiReviewed' })}</div>
        <p class="hint">To change a mapping by hand, leave the AI intake and use Import a file under Set up manually.</p>`;
    } else mapping = `<p class="src-line">${icon('edit')}<span>Synthetic sample · ${plural(mg.segments.length, 'segment')} · entered in the module, so there is no column mapping.</span></p>`;
    const support = `<h3 class="sub-h">Methods the data supports</h3><ul class="ai-support">${METHOD_IDS.map(m => { const s = sup[m]; return `<li class="${s.ok ? 'is-ok' : 'is-no'}">${icon(s.ok ? 'ok' : 'x', 14)}<span><strong>${esc(methodLabel(m))}</strong>: ${s.ok ? 'supported' : `not supported, missing ${esc(s.missing.map(x => (SEG_FIELD(x) ? SEG_FIELD(x).label(g) : x).toLowerCase()).join(', '))}`}</span></li>`; }).join('')}</ul><p class="hint">Deterministic: read from the columns present, not guessed.</p>`;
    const flags = desc.flags.length ? msg('info', `<ul class="plain">${desc.flags.map(x => `<li>Segment ${esc(x.segment)} · ${esc(SEG_FIELD(x.field) ? SEG_FIELD(x.field).label(g) : x.field)}: ${esc(x.note)}</li>`).join('')}</ul>`, { title: 'Notes on upstream values (not changed)' }) : '';
    const about = `<h3 class="sub-h">About this data ${simTag()}</h3><ul class="plain ai-lines">${desc.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${flags}`;
    const ck = fl.check, passed = aiCheckPassed();
    const check = `<h3 class="sub-h">Inputs check</h3>${passed ? msg('success', `Inputs check passed ${fmtTime(ck.at)} for every supported method.`) : ck && ck.issues.length && ck.sig === aiCheckSig() ? msg('error', checkList(ck.issues.slice(0, 20)), { title: `${plural(ck.issues.length, 'item')} to resolve` }) : ck ? msg('warning', 'The project or data changed since the last check. Run it again.') : '<p class="muted">Checks the project details and every upstream value each supported method needs.</p>'}
      <div>${btn({ label: passed ? 'Run check again' : 'Run inputs check', act: 'aiRunCheck', kind: passed ? 'outline' : 'primary', ic: 'check', id: 'ai-run-check', reason: readOnly() ? 'Read-only role' : '' })}</div>`;
    const key = aiDatasetKey(), ex = key && AS.EXAMPLE_BRIEFS[key];
    const rb = fl.brief.trim() ? safe(() => AS.readBrief(fl.brief), null) : null;
    const brief = `<h3 class="sub-h">Brief</h3>${fl.brief.trim() ? `<blockquote class="ai-quote">${esc(aiQuote(fl.brief.length > 320 ? fl.brief.slice(0, 320) + '…' : fl.brief))}</blockquote>${rb ? aiBriefPanel(rb.facts.map(f => Object.assign({}, f, { label: AI_FACT_LABEL[f.key] || (f.path ? AS.pathLabel(f.path, state.project.grain) : 'Fact') })), rb.unused || rb.unknownSentences, false) : ''}` : '<p class="muted">No brief yet.</p>'}
      <div class="row-actions">${btn({ label: 'Edit brief', act: 'aiStep', arg: 'brief', kind: 'text', ic: 'edit', id: 'ai-edit-brief' })}${ex && ex !== fl.brief ? btn({ label: 'Use the example brief for this file', act: 'aiExample', kind: 'text', ic: 'file', id: 'ai-example', reason: readOnly() ? 'Read-only role' : '' }) : ''}</div>`;
    const reason = aiBuildReason();
    return card({ id: 'c-ai-confirm', step: 3, title: 'Confirm the data', sub: `${d.kind === 'file' ? esc(d.fileName) : 'Synthetic sample'} · ${esc(grainMany(g))}. Nothing is proposed until this step passes.`,
      body: `${aiGrainNote()}${mapping}<div class="sep"></div>${about}<div class="sep"></div>${support}<div class="sep"></div>${check}<div class="sep"></div>${brief}
        <div class="row-actions">${btn({ label: 'Back', act: 'aiStep', arg: 'data', kind: 'outline', ic: 'chevLeft', id: 'ai-back' })}${btn({ label: 'Build candidate scenarios', act: 'aiBuild', kind: 'primary', ic: 'chevRight', id: 'ai-build', reason })}</div>
` });
  }
  /* Review m4: the grain comes from the brief step; if the file's count or ID column names another grain, say so and offer it. */
  function aiDetectGrain() {
    const d = state.ai.flow && state.ai.flow.data;
    if (!d || d.kind !== 'file') return null;
    const heads = [];
    METHOD_IDS.forEach(m => { const ds = d.byMethod[m]; if (!ds) return; ['entities', 'entityId'].forEach(k => { if (ds.mapping[k] != null) heads.push(ds.heads[ds.mapping[k]]); }); });
    const t = heads.join(' ');
    return /account/i.test(t) ? 'account' : /site/i.test(t) ? 'site' : /\bhcp|physician|prescriber/i.test(t) ? 'hcp' : null;
  }
  function aiGrainNote() {
    const g = aiDetectGrain(), cur = state.project.grain;
    if (!g || g === cur || !F.GRAIN[g]) return '';
    return msg('warning', `The file's columns describe ${esc(grainMany(g))}, but the sizing grain is ${esc(grainOne(cur))}. Labels and the example brief follow the grain.`,
      { actions: btn({ label: `Use ${g === 'hcp' ? 'HCP' : grainOne(g)} grain`, act: 'aiSetGrain', arg: g, kind: 'outline', id: 'ai-set-grain', reason: readOnly() ? 'Read-only role' : '' }) });
  }
  /* Review M2: what the simulated reader took from the brief, and what it did not use. Quotes are masked for display. */
  const FACT_UNIT_TEXT = (f) => (f.value == null ? '' : f.unit === 'usd' ? fmt.money(f.value) : f.unit === 'pct' ? fmt.pct(f.value) : typeof f.value === 'number' ? fmt.num1(f.value) : String(f.value));
  const AI_FACT_LABEL = { budget: 'Budget ceiling', fteCap: 'FTE cap', protectTop: 'Protect top segments', emphasis: 'Emphasis', otherChannelPct: 'Other channels %', carryoverPct: 'Carryover %', forecast: 'Forecast' };
  function aiBriefPanel(read, unused, withUse) {
    const USE = { applied: 'Used in candidates', 'not-applied': 'Read, not used', context: 'Context only' };
    const rows = (read || []).map(f => `<li><strong>${esc(f.label || f.key)}</strong>${f.year ? ` (${esc(f.year)})` : ''}: ${esc(FACT_UNIT_TEXT(f))} <span class="ai-q">“${esc(aiQuote(f.quote))}”</span>${withUse && f.use ? ` ${chip(USE[f.use] || f.use, f.use === 'applied' ? 'chip-outline chip-sm' : 'chip-base chip-sm')}` : ''}</li>`).join('');
    const un = (unused || []).map(u => (typeof u === 'string' ? u : u && u.text)).filter(Boolean);
    return `<div class="ai-brief-use"><p class="lbl">Read from your brief ${simTag()}</p>${rows ? `<ul class="plain ai-lines">${rows}</ul>` : '<p class="muted">Nothing was recognised. Values the candidates need will be asked for.</p>'}
      ${un.length ? `<p class="lbl mt8">Not used</p><ul class="plain ai-lines muted">${un.map(u => `<li>${esc(aiQuote(u))}</li>`).join('')}</ul><p class="hint">The simulated reader recognises set phrasings only. If a figure above is missing, reword it or enter it when asked.</p>` : ''}</div>`;
  }
  function aiBuildStep() {
    const fl = state.ai.flow, set = aiSet();
    if (!set) return aiConfirmStep();
    if (!set.gaps.length) return card({ id: 'c-ai-gaps', step: 4, title: 'Candidates are ready', body: `<div>${btn({ label: 'Go to candidates', act: 'nav', arg: 'scenarios', kind: 'primary', ic: 'chevRight', id: 'ai-go-cands' })}</div>` });
    const affix = path => (/repCost|annualValue/.test(path) ? { prefix: '$', big: true } : /capacity$/.test(path) ? { suffix: 'calls', big: true } : /Pct$/.test(path) ? { suffix: '%' } : {});
    const rows = set.gaps.map((g, k) => {
      const h = g.hint && g.hint.text ? ` ${g.hint.text}` : g.hint ? (g.hint.range[0] === g.hint.range[1] ? ` Synthetic precedent value: ${aiValText(g.path, g.hint.range[0])}. A hint, not a value.` : ` Synthetic precedent range: ${aiValText(g.path, g.hint.range[0])}–${aiValText(g.path, g.hint.range[1])}. A hint, not a value.`) : '';
      return numInput(Object.assign({ id: `ai-gap-${k}`, label: g.label, value: null, hint: esc(g.why + h) }, affix(g.path)));
    }).join('');
    return card({ id: 'c-ai-gaps', step: 4, title: `${plural(set.gaps.length, 'question')} before the candidates can be calculated`, sub: `${simTag()} Nothing in the brief or the data supplies these firm-specific values, so none is invented. Your answers are recorded as your values.`,
      body: `${set.briefUse ? disclosure({ id: 'ai-bu-g', act: 'aiToggleBriefUse', open: !!state.ui.aiBriefUseOpen, label: 'What was read from the brief', body: aiBriefPanel(set.briefUse.read, set.briefUse.unused, true) }) : ''}<div class="grid g3">${rows}</div>${fl.gapError ? `<div class="err" role="alert">${esc(fl.gapError)}</div>` : ''}
        <div class="row-actions">${btn({ label: 'Apply answers and see candidates', act: 'aiApplyGaps', kind: 'primary', ic: 'check', id: 'ai-gaps-apply', reason: readOnly() ? 'Read-only role' : '' })}${btn({ label: 'Skip for now', act: 'aiSkipGaps', kind: 'text', id: 'ai-gaps-skip' })}</div>` });
  }

  function aiCandidatesCard() {
    if (!aiOn()) return '';
    const set = aiSet();
    if (!set) return '';
    const g = state.project.grain, L = F.RESULT_LABELS;
    const plans = set.plans.filter(p => state.ai.planStatus[p.id] !== 'discarded');
    const notes = set.notes.length ? disclosure({ id: 'ai-notes', act: 'aiToggleNotes', open: !!state.ui.aiNotesOpen, label: `Notes from the simulated assistant (${set.notes.length})`, body: `<ul class="plain ai-lines">${set.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` }) : '';
    const foot = `<p class="ai-foot">${icon('info', 14)} Not ranked. Every number is calculated by the deterministic engine. Simulated AI.</p>`;
    const gaps = set.gaps.length ? msg('warning', `${plural(set.gaps.length, 'question')} still open: ${esc(set.gaps.map(x => x.label).join(', '))}.`, { actions: btn({ label: 'Answer the open questions', act: 'aiOpenGaps', kind: 'outline', id: 'ai-open-gaps', reason: readOnly() ? 'Read-only role' : '' }) }) : '';
    const title = `${GLYPH} Candidate scenarios — proposed, not yet adopted`;
    if (!plans.length) return card({ id: 'c-cands', cls: 'ai-card', title, sub: simTag(), body: msg('neutral', set.plans.length ? 'Every candidate was discarded. Start a new AI intake on Project and Input to propose again.' : 'No candidate fits the data and brief.') + notes + foot });
    const R = p => aiPreview(p), T = p => { const r = R(p); return r && r.totals && !(r.errors || []).length ? r.totals : null; };
    const num = fn => p => { const t = T(p); return t ? fn(t, p) : '—'; };
    const rows = [
      ['What it tests', p => esc(p.thesis)],
      ['Method', p => esc(methodLabel(p.method))],
      [L.rawFte(), num(t => fmt.num(t.rawFte, 2))],
      [L.recommendedFte(), num((t, p) => `<strong>${aiPlanRounding(p) === 'none' ? fmt.num(t.recommendedFte, 2) : fmt.int(t.recommendedFte)}</strong>`)],
      [L.reached(g), num(t => fmt.int(t.reached))],
      [L.totalCalls(), num(t => fmt.int(t.totalCalls))],
      [L.avgCallsPerReached(g), num(t => fmt.num(t.avgCallsPerReached, 1))],
      [L.fieldCost(), num(t => (t.fieldCost == null ? 'N/A' : fmt.money(t.fieldCost)))],
      [L.roi(), num(t => `${fmt.roi(t.roi)}${t.roiBasis === 'net' ? ' <span class="muted">(net)</span>' : ''}`)],
      /* CS-2: the reallocation state of each preview (engine-reported passes and value moved). */
      ...(plans.some(p => p.method !== 'workload') ? [['Reallocation', p => { if (p.method === 'workload') return '<span class="muted">Not applicable</span>'; const t = T(p); if (!t) return '—'; const ra = t.reallocation;
        return ra && ra.on ? `${chip('On', 'chip-info')} <span class="cmp-note">${plural(ra.passes, 'pass', 'passes')} · ${fmt.money(ra.reallocatedValue)} reallocated</span>` : `Off${isNum(t.forfeitedValue) && t.forfeitedValue > 0 ? ` <span class="cmp-note">${fmt.money(t.forfeitedValue)} in excluded segments</span>` : ''}`; }]] : []),
      ['AI values', p => { const low = p.changes.filter(c => c.confidence === 'low').length; return `${fmt.int(p.changes.length)} (${fmt.int(low)} low)`; }],
      ['Against the brief', p => { const f = aiFit(p, T(p)); return f.lines.map(l => `<span class="ai-fit ${l.over ? 'is-over' : ''}">${l.over ? icon('warn', 14) : ''}${esc(l.text)}</span>`).join(''); }],
      ['Status', p => {
        const st = state.ai.planStatus[p.id], rs = aiReasons(p);
        const cur = state.ai.adoption && state.ai.adoption.planId === p.id && state.ai.adoption.setId === set.id;
        const saved = state.scenarios.filter(sc => sc.ai && sc.ai.planId === p.id && sc.ai.proposalSetId === set.id).map(sc => sc.id);
        if (cur) return chip('Adopted into the working draft', 'chip-selected', 'check') + (saved.length ? `<span class="cmp-note">Saved as ${esc(saved.join(', '))}</span>` : '');
        if (saved.length) return chip(`Saved as ${saved.join(', ')}`, 'chip-outline', 'check');
        if (st === 'adopted') return chip('Previously adopted, not saved', 'chip-outline');
        if (aiReady(p)) {
          const r = R(p);
          if (r && (r.errors || []).length) return `<span class="muted">Engine: ${esc(r.errors[0].message)}</span>`;
          const over = aiFit(p, T(p)).over;
          return chip('Ready to review', 'chip-outline') + (over ? `<span class="cmp-note">${icon('warn', 14)} Exceeds a limit stated in the brief (see Against the brief)</span>` : '');
        }
        return `${chip(A_STATUS(p) === 'blocked' ? 'Blocked' : A_STATUS(p) === 'stale' ? 'Out of date' : 'Waiting on answers', A_STATUS(p) === 'blocked' ? 'chip-error' : 'chip-warning', 'warn')}<span class="cmp-note">${esc(rs.join('; '))}</span>`;
      }]
    ];
    const head = plans.map(p => `<th scope="col" class="cmp-col"><span class="cmp-name">${GLYPH} ${esc(p.idea)}</span><span class="cmp-meta">${esc(p.id)} · ${esc(set.id)} · Simulated</span></th>`).join('');
    const body = rows.map(([k, fn]) => `<tr><th scope="row" class="rowh">${esc(k)}</th>${plans.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`).join('');
    const actions = `<tr class="cmp-actions"><th scope="row" class="rowh">Actions</th>${plans.map(p => {
      const cur = state.ai.adoption && state.ai.adoption.planId === p.id && state.ai.adoption.setId === set.id;
      const why = readOnly() ? 'Read-only role' : cur ? 'In the working draft now' : !aiReady(p) ? (aiReasons(p)[0] || 'Not ready') : '';
      return `<td><div class="act-stack">${btn({ label: 'Review & adopt', act: 'aiAdopt', arg: p.id, kind: 'primary', ic: 'chevRight', id: `cand-adopt-${p.id}`, reason: why, small: true })}
        ${btn({ label: 'Discard', act: 'aiDiscard', arg: p.id, kind: 'text', ic: 'x', id: `cand-discard-${p.id}`, reason: readOnly() ? 'Read-only role' : cur ? 'In the working draft now' : '' })}</div></td>`;
    }).join('')}</tr>`;
    return card({ id: 'c-cands', cls: 'ai-card', title, sub: `${simTag()} Previews on copies of your data. They are not saved scenarios and do not change the working draft. Open one to review its values.`,
      body: `${gaps}${set.briefUse ? disclosure({ id: 'ai-bu', act: 'aiToggleBriefUse', open: !!state.ui.aiBriefUseOpen, label: `What was read from the brief (${set.briefUse.read.length} read, ${set.briefUse.unused.length} not used)`, body: aiBriefPanel(set.briefUse.read, set.briefUse.unused, true) }) : ''}<div class="grid-wrap" tabindex="0" role="region" aria-label="Candidate scenarios, scrolls horizontally"><table class="grid-t cmp-t cand-t"><thead><tr><th scope="col">Measure</th>${head}</tr></thead><tbody>${body}${actions}</tbody></table></div>${notes}${foot}` });
  }
  /* Review M1: compare the engine's field cost and recommended FTE with the ceilings the brief states. A comparison, not a calculation. */
  const aiCeilingText = n => (n >= 1e6 && n % 1e5 === 0 ? `$${fmt.num1(n / 1e6)}M` : n >= 1e3 && n % 1e3 === 0 && n < 1e6 ? `$${fmt.int(n / 1e3)}K` : fmt.money(n));
  function aiFit(p, t) {
    const set = aiSet(), obj = safe(() => AS.readBrief((set && set.briefText) || '').objective, {}) || {};
    const lines = [];
    let over = false;
    if (!isNum(obj.budgetUsd) && !isNum(obj.fteCap)) return { lines: [{ text: 'No ceiling stated' }], over };
    if (!t) return { lines: [{ text: 'Shown once the candidate can be calculated' }], over };
    if (isNum(obj.budgetUsd)) {
      const c = aiCeilingText(obj.budgetUsd);
      if (t.fieldCost == null) lines.push({ text: `No field cost to compare with the ${c} ceiling` });
      else if (t.fieldCost > obj.budgetUsd) { over = true; lines.push({ over: true, text: `Over the ${c} ceiling by ${fmt.money(t.fieldCost - obj.budgetUsd)}` }); }
      else lines.push({ text: `Within the ${c} ceiling` });
    }
    if (isNum(obj.fteCap)) {
      const rf = aiPlanRounding(p) === 'none' ? fmt.num(t.recommendedFte, 2) : fmt.int(t.recommendedFte);
      if (t.recommendedFte > obj.fteCap) { over = true; lines.push({ over: true, text: `Above the ${fmt.int(obj.fteCap)} FTE cap (${rf} FTE)` }); }
      else lines.push({ text: `Within the ${fmt.int(obj.fteCap)} FTE cap` });
    }
    return { lines, over };
  }
  const aiPlanRounding = p => { const c = p.changes.find(x => x.path === 'shared.fteRounding'); return c ? c.to : DEFAULTS.fteRounding; };

  /* A value decided on its own: low confidence, or flagged `change.individual` (a reallocation proposal, contract §6). */
  const aiIndividual = it => it.change.confidence === 'low' || it.change.individual === true || it.change.path === REALLOC_PATH;
  function aiReviewCard() {
    const pd = state.ai.pending, ad = state.ai.adoption;
    if (!aiOn() || !pd || !ad) return '';
    const srcs = ad.sources || [];
    const order = pd.items.map((it, i) => ({ it, i })).sort((a, b) => (a.it.status === 'pending' ? 0 : 1) - (b.it.status === 'pending' ? 0 : 1) || (aiIndividual(a.it) ? 0 : 1) - (aiIndividual(b.it) ? 0 : 1) || a.i - b.i);
    const pend = pd.items.filter(x => x.status === 'pending'), low = pend.filter(aiIndividual), rest = pend.filter(x => !aiIndividual(x));
    const lowOnly = low.every(x => x.change.confidence === 'low');
    const lowText = n => (lowOnly ? plural(n, 'low-confidence value') : plural(n, 'value'));
    const ro = readOnly() ? 'Read-only role' : '';
    const DEC = { accepted: ['Accepted', 'chip-success', 'check'], edited: ['Edited', 'chip-info', 'edit'], rejected: ['Rejected', 'chip-base', 'x'], replaced: ['Replaced by a manual edit', 'chip-base', 'edit'] };
    const row = ({ it, i }) => {
      const c = it.change, ss = (c.sourceIds || []).map(id => srcs.find(s => s.id === id)).filter(Boolean);
      const src = ss.map(s => `<span class="ai-src"><strong>${esc(s.title)}</strong>${s.locator ? ` · ${esc(s.locator)}` : ''}${s.quote ? `<span class="ai-q">“${esc(aiQuote(s.quote).slice(0, 120))}${aiQuote(s.quote).length > 120 ? '…' : ''}”</span>` : ''}${s.quoteVerified ? ' <span class="muted">(quote verified)</span>' : ''}</span>`).join('');
      const conf = chip(cap(c.confidence), c.confidence === 'low' ? 'chip-warning' : 'chip-outline') + (c.individual ? `<span class="cmp-note">Decide individually</span>` : '');
      const dec = it.status === 'pending'
        ? `<div class="act-row">${btn({ label: 'Accept', act: 'aiAccept', arg: i, kind: 'outline', ic: 'check', id: `aiv-acc-${i}`, reason: ro, small: true })}${btn({ label: 'Edit', act: 'aiEdit', arg: i, kind: 'text', ic: 'edit', id: `aiv-edit-${i}`, reason: ro, small: true })}${btn({ label: 'Reject', act: 'aiReject', arg: i, kind: 'text', ic: 'x', id: `aiv-rej-${i}`, reason: ro, small: true })}</div>`
        : `${chip(`${DEC[it.status][0]}${it.decidedBy ? ` · ${it.decidedBy}` : ''}`, DEC[it.status][1], DEC[it.status][2])}${it.status === 'edited' ? `<span class="cmp-note">Your value ${esc(aiValText(c.path, it.finalValue))}</span>` : ''}`;
      return `<tr class="${it.status === 'pending' ? 'is-pending' : 'is-decided'}"><th scope="row" class="rowh">${esc(aiPathLabel(c.path))}<span class="cmp-note">${esc(c.rationale)}${c.derived ? ` Derived: ${esc(c.derived.formula)} (${esc(c.derived.note)}).` : ''}</span></th>
        <td class="num">${esc(aiValText(c.path, c.from))}</td><td class="num"><strong>${esc(aiValText(c.path, c.to))}</strong>${c.unchanged ? `<span class="cmp-note">Assumption used (unchanged)</span>` : ''}</td><td>${src || '<span class="muted">No source</span>'}</td><td>${conf}</td><td>${dec}</td></tr>`;
    };
    const table = `<div class="grid-wrap" tabindex="0" role="region" aria-label="AI values to review"><table class="grid-t ai-rev-t"><thead><tr><th scope="col">Value</th><th scope="col" class="num">Before</th><th scope="col" class="num">AI value</th><th scope="col">Source</th><th scope="col">Confidence</th><th scope="col">Decision</th></tr></thead><tbody>${order.map(row).join('')}</tbody></table></div>`;
    const bulk = rest.length ? msg('info', `${low.length ? `${lowText(low.length)} ${low.length === 1 ? 'needs' : 'need'} an individual decision${lowOnly ? '' : ' (low confidence, or a reallocation proposal)'}. ` : ''}The other ${plural(rest.length, 'value')} can be accepted together once reviewed; each is still logged as its own decision.
        <div class="mt8">${checkbox({ id: 'ai-bulk-reviewed', label: `I have reviewed these ${rest.length} values`, checked: !!pd.bulkReviewed, onAct: 'aiBulkReviewed' })}</div>`,
      { actions: btn({ label: `Accept the remaining ${rest.length} reviewed values`, act: 'aiAcceptRest', kind: 'primary', ic: 'check', id: 'ai-bulk-accept', reason: ro || (!pd.bulkReviewed ? `Tick “I have reviewed these ${rest.length} values” first` : '') }) })
      : low.length ? msg('warning', `${lowText(low.length)} still ${low.length === 1 ? 'needs' : 'need'} an individual decision${lowOnly ? '' : ' (low confidence, or a reallocation proposal)'}.`) : '';
    const done = !pend.length ? msg('success', `All ${plural(pd.items.length, 'AI value')} decided: ${fmt.int(pd.items.filter(x => x.status === 'accepted').length)} accepted, ${fmt.int(pd.items.filter(x => x.status === 'edited').length)} edited, ${fmt.int(pd.items.filter(x => x.status === 'rejected' || x.status === 'replaced').length)} rejected. Run the assumptions check below.`) : '';
    const gateNote = pd.checks && (!pd.checks.pathAllowed || (pd.checks.lint && !pd.checks.lint.ok)) ? msg('error', 'The re-check of the decided values failed. Reject the flagged values.') : '';
    return card({ id: 'c-ai-review', cls: 'ai-card', title: `${GLYPH} AI values to review`, sub: `${simTag()} ${esc(ad.idea)} (${esc(ad.planId)}) · ${esc(methodLabel(ad.method))}. The values below are loaded into the draft but not final: accept, edit or reject each one. Rejecting restores the value before the proposal.`,
      actions: pend.length ? chip(`${fmt.int(pend.length)} pending`, 'chip-warning', 'warn') : chip('All decided', 'chip-success', 'check'),
      body: `${done}${bulk}${gateNote}${pend.length ? table : disclosure({ id: 'ai-dec', act: 'aiToggleDecided', open: !!state.ui.aiDecidedOpen, label: `Decisions (${pd.items.length})`, body: table })}` });
  }
  function aiEditDialog(d) {
    const it = state.ai.pending.items[d.i], c = it.change, opts = aiEnumOptions(c.path);
    const body = `<p><strong>${esc(aiPathLabel(c.path))}</strong></p><dl class="kvs kvs-tight">${kv('AI value (simulated)', esc(aiValText(c.path, c.to)))}${kv('Before the proposal', esc(aiValText(c.path, c.from)))}</dl>
      ${opts ? dropdown({ id: 'dlg-enum', label: 'Your value', value: d.draft !== undefined ? d.draft : c.to, options: opts, onSelect: v => { d.draft = v; render(); } })
        : numInput({ id: 'dlg-val', label: 'Your value', value: d.draft !== undefined ? d.draft : c.to, error: d.error, big: true, hint: `Recorded as edited by ${esc(curUser().name)}, with the AI value kept in the audit trail.` })}`;
    return { title: 'Edit the AI value, then accept yours', body };
  }
  function aiEditConfirm(d, val) {
    const it = state.ai.pending.items[d.i], c = it.change, opts = aiEnumOptions(c.path);
    let v;
    if (opts) v = d.draft !== undefined ? d.draft : c.to;
    else {
      v = parseNum(val('dlg-val'));
      const pct = /Pct$/.test(aiLeaf(c.path));
      if (v == null || Number.isNaN(v) || v < 0 || (pct && v > 100)) { d.error = pct ? 'Enter a percent from 0 to 100' : 'Enter a number of 0 or more'; d.draft = Number.isNaN(v) ? undefined : v; render(); return; }
    }
    state.dialog = null;
    aiDecide(d.i, 'edit', v);
    closeDialog();
  }
  function aiNarrativeBlock(n, stale, genId, genLabel, reason, empty) {
    const body = n ? `${stale ? `<p>${chip('Out of date: the inputs changed after this was written', 'chip-warning', 'warn')}</p>` : ''}<p class="ai-text${stale ? ' is-stale' : ''}">${esc(n.text)}</p>` : `<p class="muted">${esc(empty)}</p>`;
    return { body, actions: btn({ label: n ? 'Regenerate' : genLabel, act: 'aiNarr', arg: genId, kind: 'outline', ic: n ? 'refresh' : 'file', id: `ai-${genId}-gen`, reason }) };
  }
  function aiWhyCard(r) {
    if (!aiOn() || !r || (r.errors || []).length) return '';
    const n = state.ai.narratives.working && state.ai.narratives.working.why;
    const x = aiNarrativeBlock(n, n && n.boundTo !== r.inputsHash, 'why', 'Explain in plain language', readOnly() ? 'Read-only role' : !resultIsCurrent() ? 'Recalculate first' : '', 'A short plain-language reading of the result above, written from the engine outputs.');
    return card({ id: 'c-ai-why', cls: 'ai-card', title: `${GLYPH} In plain language`, sub: `${simTag()} Explains the calculated result; it does not calculate. Every number is filled in from the engine output.`, actions: x.actions, body: x.body });
  }
  function aiCompareCard() {
    if (!aiOn() || state.scenarios.length < 2) return '';
    const n = state.ai.narratives.comparison && state.ai.narratives.comparison.comparison;
    const hashes = JSON.stringify(state.scenarios.map(s => s.result && s.result.inputsHash));
    const x = aiNarrativeBlock(n, n && JSON.stringify(n.boundTo) !== hashes, 'cmp', 'Describe the differences', readOnly() ? 'Read-only role' : '', 'A plain-language reading of how the saved snapshots differ. Not ranked.');
    return card({ id: 'c-ai-cmp', cls: 'ai-card', title: `${GLYPH} How these differ`, sub: `${simTag()} Over the saved snapshots in the comparison above. Not ranked; the recommendation stays yours.`, actions: x.actions, body: x.body });
  }
  function aiReviewerCard(rec) {
    if (!aiOn() || !rec) return '';
    const e = state.ai.narratives[rec.id], n = e && e.reviewer;
    const x = aiNarrativeBlock(n, n && n.boundTo !== (rec.result && rec.result.inputsHash), 'rb', 'Write the reviewer brief', readOnly() ? 'Read-only role' : '', 'A short brief for the Engagement Lead: AI-origin values first, then analyst settings, differences from the standard method and engine warnings.');
    const vos = rec.ai ? rec.ai.valueOrigins || [] : [];
    const list = vos.length ? `<h3 class="sub-h">AI-origin values (${vos.length})</h3><ul class="plain ai-vals">${vos.map(v => `<li><span>${esc(aiPathLabel(v.path, rec.inputs.segments))}: <strong>${esc(aiValText(v.path, v.finalValue))}</strong></span> ${aiChipHtml(v, rec.ai.sources || [])}</li>`).join('')}</ul>` : '';
    return card({ id: 'c-ai-rb', cls: 'ai-card', title: `${GLYPH} Reviewer brief`, sub: `${simTag()} For ${esc(rec.name)}. Explains the snapshot; it does not approve, reject or change it.`, actions: x.actions, body: list + x.body });
  }
  const aiChipHtml = (v, srcs) => `<span class="chip chip-sm chip-ai" tabindex="0" data-tip="${esc(aiTip(v, srcs, `AI value ${aiValText(v.path, v.aiValue)}.`))}">${GLYPH} AI · ${v.origin === 'ai-edited' ? 'edited' : 'accepted'} by ${esc(v.decidedBy)}</span>`;
  function aiSnapshotValues(s) {
    if (!aiOn() || !s.ai || !(s.ai.valueOrigins || []).length) return '';
    const vos = s.ai.valueOrigins;
    return `<div class="ai-snap"><p class="lbl">${GLYPH} AI-origin values in this snapshot (${vos.length}) ${simTag()}</p><ul class="plain ai-vals">${vos.slice(0, 40).map(v => `<li><span>${esc(aiPathLabel(v.path, s.inputs.segments))}: <strong>${esc(aiValText(v.path, v.finalValue))}</strong></span> ${aiChipHtml(v, s.ai.sources || [])}</li>`).join('')}${vos.length > 40 ? `<li class="muted">…and ${vos.length - 40} more</li>` : ''}</ul></div>`;
  }
  function aiGenerate(kind) {
    let n, key, sub, detail, sid = null;
    try {
      if (kind === 'why') { n = AS.whyResult(state.result, state.resultInputs, NFMT); key = 'working'; sub = 'why'; detail = `Why this result, in plain language · bound to inputs ${n.boundTo}`; }
      else if (kind === 'cmp') { n = AS.compare(state.scenarios.slice(), NFMT); key = 'comparison'; sub = 'comparison'; detail = `How ${plural(state.scenarios.length, 'snapshot')} differ · bound to ${state.scenarios.map(s => s.id).join(', ')}`; }
      else { const rec = recommended() || state.scenarios[state.scenarios.length - 1]; n = AS.reviewerBrief(rec, state.audit.slice(), NFMT); key = rec.id; sub = 'reviewer'; sid = rec.id; detail = `Reviewer brief for ${rec.id} · bound to inputs ${n.boundTo}`; }
    } catch (e) { toast(`The narrative could not be written: ${(e && e.message) || e}`, 'error'); return; }
    if (!n.lint.ok) { toast('The narrative failed the wording check and was not shown.', 'error'); return; }
    state.ai.narratives[key] = Object.assign({}, state.ai.narratives[key], { [sub]: n });
    audit('ai-narrative', detail, sid);
  }

  /* ---------- actions */
  Object.assign(acts, {
    aiToggle: () => {
      if (!AS) return;
      const flip = () => { state.ai.enabled = !state.ai.enabled; audit('ai-setting', `AI assistance (simulated): ${state.ai.enabled ? 'on' : 'off'}`); focusAfter('ai-toggle'); render(); };
      if (state.ai.enabled) aiGuard('AI assistance turned off', flip); else flip();
    },
    aiStart: () => { if (readOnly()) return; if (!state.ai.flow) state.ai.flow = aiNewFlow(); state.ai.flow.open = true; if (state.ai.flow.done) { state.ai.flow.done = false; state.ai.flow.step = 'confirm'; } focusAfter('c-ai-flow-h'); render(); window.scrollTo(0, 0); },
    aiRestart: () => { if (readOnly()) return; state.ai.flow = aiNewFlow(); focusAfter('c-ai-flow-h'); render(); window.scrollTo(0, 0); },
    aiManual: () => { state.ai.entry = 'manual'; focusAfter('p-name'); render(); },
    aiLeave: () => { if (state.ai.flow) state.ai.flow.open = false; focusAfter('main'); render(); window.scrollTo(0, 0); },
    aiStep: el => { state.ai.flow.step = el.dataset.arg; focusAfter('c-ai-flow-h'); render(); window.scrollTo(0, 0); },
    aiExample: () => { if (readOnly()) return; aiFillExample(); focusAfter('ai-brief'); render(); },
    aiPickFile: () => {
      if (readOnly()) return;
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.xlsx,.xlsm,.csv,.xls,.xlsb'; input.hidden = true;
      input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) f.arrayBuffer().then(b => aiStartImport(b, f.name)); input.remove(); });
      document.body.appendChild(input); input.click();
    },
    aiSample: () => { if (readOnly()) return; aiUseSample(); focusAfter('c-ai-flow-h'); render(); },
    aiRunCheck: () => { if (readOnly()) return; aiRunCheck(); focusAfter('ai-run-check'); render(); },
    aiBuild: () => { if (aiBuildReason()) return; aiBuild(); },
    aiApplyGaps: () => { if (readOnly()) return; aiApplyGaps(); },
    aiSkipGaps: () => aiFinishIntake(),
    aiOpenGaps: () => { if (!state.ai.flow) return; state.ai.flow.open = true; state.ai.flow.done = false; state.ai.flow.step = 'build'; state.section = 'setup'; render(); window.scrollTo(0, 0); },
    aiAdopt: el => aiAdopt(el.dataset.arg),
    aiDiscard: el => { if (readOnly()) return; const set = aiSet(), p = set.plans.find(x => x.id === el.dataset.arg); state.ai.planStatus[p.id] = 'discarded'; audit('ai-discarded', `${p.id} · ${p.idea} · ${methodLabel(p.method)} discarded (${set.id})`); render(); },
    aiAccept: el => { aiDecide(+el.dataset.arg, 'accept'); render(); },
    aiReject: el => { aiDecide(+el.dataset.arg, 'reject'); render(); },
    aiEdit: el => { if (readOnly()) return; openDialog({ type: 'aiEdit', i: +el.dataset.arg, returnFocus: el.id }); },
    aiAcceptRest: () => {
      const pd = state.ai.pending;
      if (!pd || !pd.bulkReviewed || readOnly()) return;
      pd.items.forEach((it, i) => { if (it.status === 'pending' && !aiIndividual(it)) aiDecide(i, 'accept'); });
      pd.bulkReviewed = false; render();
    },
    aiNarr: el => { if (readOnly()) return; aiGenerate(el.dataset.arg); focusAfter(`ai-${el.dataset.arg}-gen`); render(); },
    aiSetGrain: el => { if (readOnly()) return; const from = state.project.grain, g = el.dataset.arg; state.project.grain = g; audit('project', `Grain: ${grainOne(from)} → ${grainOne(g)}`); render(); },
    aiToggleNotes: toggle('aiNotesOpen'), aiToggleBriefUse: toggle('aiBriefUseOpen'), aiToggleDecided: toggle('aiDecidedOpen')
  });

  /* ================================================================== events */
  function fieldLabelOf(el) {
    const l = document.getElementById(el.id + '-lbl');
    return (l && l.textContent.trim()) || el.getAttribute('aria-label') || el.id;
  }
  function onClick(ev) {
    let t = ev.target;
    if (pendingRender && !t.closest('.lb')) {
      /* A commit (blur) is waiting: re-render now, then re-resolve the clicked control so the click is not lost. */
      const hit = t.closest('[data-act], [data-dd], [data-toast], input, label');
      const key = hit ? focusKey(hit) : null;
      render();
      if (key) { let n = null; try { n = document.querySelector(key); } catch (e) { n = null; } if (!n) return; t = n; if (n.matches('input, label')) { n.click(); return; } }
      else return;
    }
    const tx = t.closest('[data-toast]');
    if (tx) { const i = toasts.findIndex(x => String(x.id) === tx.dataset.toast); if (i >= 0) { toasts.splice(i, 1); renderToasts(); } return; }
    const opt = t.closest('.lb [role=option]');
    if (opt) { chooseListbox(+opt.dataset.i); return; }
    if (lb && !t.closest('.lb')) closeListbox(true);
    const ddb = t.closest('[data-dd]');
    if (ddb) { if (!ddb.disabled) openListbox(ddb.id); return; }
    const el = t.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'A') ev.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true') { const why = el.dataset.tip || (el.dataset.act === 'nav' ? lockReason[el.dataset.arg] : ''); if (why) toast(why, 'warning'); return; }
    const fn = acts[el.dataset.act];
    if (fn) fn(el, ev);
  }
  function onInput(ev) {
    const el = ev.target;
    if (el.dataset.bind) { setPath(el.dataset.bind, el.dataset.kind === 'num' ? parseNum(el.value) : el.value); return; }
    if (el.dataset.rcArch != null || el.dataset.rcNote) { rcInput(el); return; }
    if (el.dataset.apply) { (state.ui.specApply = state.ui.specApply || {})[el.dataset.apply] = el.value; return; }
    if (el.dataset.seg != null) {
      const s = state.segments[+el.dataset.seg], f = el.dataset.field;
      s[f] = el.dataset.kind === 'text' ? el.value : parseNum(el.value);
      return;
    }
  }
  function onChange(ev) {
    const el = ev.target;
    if (el.dataset.cfg != null) { configChange(el); return; }
    if (el.dataset.rcArch != null || el.dataset.rcNote) { rcCommit(el); renderSoon(); return; }
    if (el.dataset.radio) {
      const a = el.dataset.radio;
      aiManualEdit(aiRadioPaths(a));
      if (radioActs[a]) radioActs[a](el.value);
      focusAfter(el.id || null); render();
      const again = document.querySelector(`input[name="${el.name}"][value="${el.value}"]`); if (again) again.focus();
      return;
    }
    if (el.dataset.check) {
      if (el.dataset.check === 'showReq') state.showReq = el.checked;
      if (el.dataset.check === 'wizReviewed') state.importFlow.reviewed = el.checked;
      if (el.dataset.check === 'workloadCost') { state.workloadCost = el.checked; audit('assumption', `Workload field cost ${el.checked ? 'included' : 'excluded'}`); }
      if (el.dataset.check === 'aiReviewed' && state.ai.flow) state.ai.flow.reviewed = el.checked;
      if (el.dataset.check === 'aiBulkReviewed' && state.ai.pending) state.ai.pending.bulkReviewed = el.checked;
      render(); return;
    }
    if (el.dataset.bind || el.dataset.seg != null) {
      const orig = el.dataset.orig != null ? el.dataset.orig : '';
      if (el.value !== orig) {
        const where = el.dataset.bind ? el.dataset.bind : `segments.${el.dataset.field}`;
        const kind = where.startsWith('project') ? 'project' : where === 'draftName' || where === 'objective' || where.startsWith('ai.') ? null : where.startsWith('segments') && (el.dataset.field === 'decile' || (SEG_FIELD(el.dataset.field) && SEG_FIELD(el.dataset.field).owner === 'upstream')) ? 'data-entry' : 'assumption';
        if (kind) audit(kind, `${fieldLabelOf(el)}: ${orig || '(blank)'} → ${el.value || '(blank)'}`);
        if (el.dataset.bind === 'shared.horizon.windowYears' || el.dataset.bind === 'shared.horizon.tailYears') resizeYears();
        /* CS-5: a draft cloned with a directly entered capacity switches to working days × calls per day once both are entered. */
        const ci = state.shared.capacityInput;
        if (/^shared\.capacityInput\./.test(el.dataset.bind || '') && ci.mode !== 'derived' && isNum(ci.callsPerDay) && isNum(ci.workingDays)) { ci.mode = 'derived'; state.shared.capacity = null; audit('assumption', 'Capacity: working days × calls per day (replaces the capacity entered directly)'); }
        aiManualEdit([el.dataset.bind ? aiBindPath(el.dataset.bind) : `segments[${el.dataset.seg}].${el.dataset.field}`]);
      }
      renderSoon();
    }
  }
  function onFocusIn(ev) { const el = ev.target; if (el.dataset && (el.dataset.bind || el.dataset.seg != null || el.dataset.rcArch != null || el.dataset.rcNote)) el.dataset.orig = el.value; }
  function onKey(ev) {
    if (lb) {
      const n = lb.el.querySelectorAll('[role=option]').length;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(lb.idx + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(lb.idx - 1); }
      else if (ev.key === 'Home') { ev.preventDefault(); setActive(0); }
      else if (ev.key === 'End') { ev.preventDefault(); setActive(n - 1); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); chooseListbox(lb.idx); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeListbox(false); }
      else if (ev.key === 'Tab') { closeListbox(false); }
      else if (ev.key.length === 1) { const items = [...lb.el.querySelectorAll('[role=option]')]; const k = items.findIndex((it, i) => i > lb.idx && it.textContent.trim().toLowerCase().startsWith(ev.key.toLowerCase())); const k2 = k >= 0 ? k : items.findIndex(it => it.textContent.trim().toLowerCase().startsWith(ev.key.toLowerCase())); if (k2 >= 0) setActive(k2); }
      return;
    }
    const t = ev.target;
    if (t.matches && t.matches('[data-dd]') && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !t.disabled) { ev.preventDefault(); openListbox(t.id); return; }
    if (state.dialog) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeDialog(); return; }
      if (ev.key === 'Tab') {
        const dlg = document.getElementById('dlg');
        const f = [...dlg.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
      if (!(t.getAttribute && t.getAttribute('role') === 'tab' && t.closest('#dlg'))) return;   // P3: the configurator's tabs keep arrow-key roving
    }
    if (ev.key === 'Escape' && state.drawerOpen) { state.drawerOpen = false; focusAfter('hamburger'); render(); return; }
    /* Roving focus for radio-card groups, role switcher and tabs (arrow keys move focus; Enter/Space selects). */
    const group = t.closest && t.closest('[role=radiogroup], [role=tablist]');
    if (group && (t.getAttribute('role') === 'radio' || t.getAttribute('role') === 'tab') && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
      const items = [...group.querySelectorAll('[role=radio], [role=tab]')];
      let i = items.indexOf(t);
      i = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : (i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      ev.preventDefault(); items.forEach((x, k) => x.setAttribute('tabindex', k === i ? '0' : '-1')); items[i].focus();
      if (t.getAttribute('role') === 'tab') items[i].click();
    }
  }
  function onDrag(ev) {
    const dz = ev.target.closest && ev.target.closest('[data-drop]');
    if (!dz || readOnly()) return;
    ev.preventDefault();
    if (ev.type === 'dragover' || ev.type === 'dragenter') dz.classList.add('is-over');
    if (ev.type === 'dragleave') dz.classList.remove('is-over');
    if (ev.type === 'drop') { dz.classList.remove('is-over'); const f = ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) f.arrayBuffer().then(b => (dz.dataset.drop === 'ai' ? aiStartImport(b, f.name) : startImport(b, f.name))); }
  }

  /* ================================================================== tooltip (one element, clamped to the viewport, hidden on blur/leave/scroll) */
  let tipEl = null, tipFor = null;
  function showTip(el) {
    const text = el.dataset.tip; if (!text) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.id = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.innerHTML = '<span class="tip-t"></span><span class="tip-a"></span>'; document.body.appendChild(tipEl); }
    tipEl.querySelector('.tip-t').textContent = text; tipEl.style.display = 'block'; tipFor = el;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = document.documentElement.clientWidth;
    const right = el.dataset.tipPos === 'right' && r.right + w + 12 < vw;
    let left, top, below = false;
    if (right) { left = r.right + 8; top = r.top + r.height / 2 - h / 2; }
    else { left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8)); top = r.top - h - 8; if (top < 60) { top = r.bottom + 8; below = true; } }
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    tipEl.className = 'tip' + (right ? ' tip-right' : below ? ' tip-below' : '');
    const a = tipEl.querySelector('.tip-a');
    if (right) { a.style.left = ''; a.style.top = (h / 2 - 6) + 'px'; } else { a.style.top = ''; a.style.left = Math.max(6, Math.min(r.left + r.width / 2 - left - 6, w - 18)) + 'px'; }
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; tipFor = null; }
  function tipEvents() {
    document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el !== tipFor) { if (el.closest('.drawer.open')) return; showTip(el); } else if (!el) hideTip(); });
    document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
    document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); else hideTip(); });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('pointerdown', hideTip, true);
    window.addEventListener('scroll', hideTip, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  }

  /* ================================================================== init */
  function init() {
    const root = document.getElementById('app');
    if (!root) return;
    const missing = ['FSFields', 'FSEngine', 'FSIO'].filter(g => !W[g]);
    if (missing.length) { root.innerHTML = `<div class="fatal" role="alert"><strong>Field Sizing could not start.</strong> Missing module(s): ${esc(missing.join(', '))}.</div>`; return; }
    if (!document.getElementById('toast-live')) { const t = document.createElement('div'); t.id = 'toast-live'; t.className = 'sr-only'; t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    const old = document.body.querySelector(':scope > #toasts'); if (old) old.remove();
    document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
    document.addEventListener('pointerup', () => { pointerDown = false; setTimeout(() => { if (pendingRender) render(); }, 0); }, true);
    document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
    tipEvents();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKey);
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => document.addEventListener(e, onDrag));
    window.addEventListener('resize', () => closeListbox(true));
    window.addEventListener('scroll', e => { if (lb && e.target !== lb.el) placeListbox(); }, true);
    /* AI assistance defaults On in this build. `?ai=off` starts with it Off and writes no audit row (parity harness). */
    const q = safe(() => new URLSearchParams(location.search || ''), null);
    if (!W.FSAssist || (q && /^(off|0|false)$/i.test(q.get('ai') || ''))) state.ai.enabled = false;
    const hash = (location.hash || '').slice(1);
    if (SECTIONS.some(s => s.id === hash) && stageStatus(hash) !== 'locked') state.section = hash;
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
