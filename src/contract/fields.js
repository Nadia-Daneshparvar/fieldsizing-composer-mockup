/* ---- contract/fields.js ---- */
(function (root) {
  const GRAIN = {
    hcp: { one: 'HCP', many: 'HCPs' },
    account: { one: 'account', many: 'accounts' },
    site: { one: 'site', many: 'sites' }
  };

  const METHODS = {
    affordable: {
      label: 'Affordable Coverage',
      question: 'How many reps can the impactable value pay for at the required ROI?',
      needs: 'Entity counts, composite value, reach %, min/max calls, impactable value, ROI cutoff, capacity, cost.'
    },
    response: {
      label: 'Profitability / Response Curve',
      question: 'Up to which call does each additional call still pay for itself?',
      needs: 'Entity-level data with curve archetype, composite value, reach %, min/max calls, impactable value, marginal ROI cutoff, capacity, cost.'
    },
    workload: {
      label: 'Workload Buildup',
      question: 'How many reps does a planned call plan require?',
      needs: 'Entity counts, reach %, planned annual calls per segment, capacity. Cost is optional.'
    }
  };

  // owner: 'upstream' = Segmentation & Targeting input; 'sizing' = Field Sizing control.
  // methods: where the field is visible. Fields outside the selected method are not rendered at all.
  // optional: shown only when segmentFieldsFor(..., { includeOptional: true }) asks for it (v0.4: specialty, CS-3),
  //   so files without a specialty keep exactly the v0.3 columns.
  const SEGMENT_FIELDS = [
    { id: 'specialty', owner: 'upstream', unit: 'text', methods: ['affordable', 'response', 'workload'], optional: true,
      label: () => 'Specialty' },
    { id: 'segment', owner: 'upstream', unit: 'text', methods: ['affordable', 'response', 'workload'],
      label: () => 'Decile / segment' },
    { id: 'entities', owner: 'upstream', unit: 'count', methods: ['affordable', 'response', 'workload'],
      label: g => `Number of ${GRAIN[g].many}` },
    { id: 'compositeValue', owner: 'upstream', unit: 'number', methods: ['affordable', 'response'],
      label: () => 'Composite value' },
    { id: 'archetypeMix', owner: 'upstream', unit: 'mix', methods: ['response'], summaryOnly: true,
      label: () => 'Curve archetype mix' },
    { id: 'reachPct', owner: 'sizing', unit: 'percent', methods: ['affordable', 'response', 'workload'],
      label: () => 'Reach %' },
    { id: 'maxCalls', owner: 'sizing', unit: 'int', methods: ['affordable', 'response'],
      label: () => 'Maximum calls' },
    { id: 'minCalls', owner: 'sizing', unit: 'int', methods: ['affordable', 'response'],
      label: () => 'Minimum calls' },
    { id: 'plannedCalls', owner: 'sizing', unit: 'int', methods: ['workload'],
      label: g => `Planned annual calls per ${GRAIN[g].one}` }
    // customSharePct (Value share %, user-entered allocation) retired 2026-10-12.
  ];

  const RESULT_LABELS = {
    accessible: g => `Accessible ${GRAIN[g].many}`,
    reached: g => `Reached ${GRAIN[g].many}`,
    affordableCallsPerEntity: g => `Affordable calls per ${GRAIN[g].one}`,
    finalCallsPerEntity: g => `Final calls per ${GRAIN[g].one}`,
    totalCalls: () => 'Total annual calls',
    avgCallsPerReached: g => `Average calls per reached ${GRAIN[g].one}`,
    rawFte: () => 'Raw FTE',
    recommendedFte: () => 'Recommended FTE',
    entitiesPerRep: g => `${GRAIN[g].many[0].toUpperCase() + GRAIN[g].many.slice(1)} per rep`,
    fieldCost: () => 'Annual field cost',
    roi: () => 'ROI',
    planningAllocation: () => 'Planning split (FTE, not territory alignment)',
    coveredValue: () => 'Value in covered segments',
    poolValue: () => 'Impactable value pool',
    reallocatedValue: () => 'Value reallocated'
  };

  // Assumption labels (Calc Spec v0.2 CS-1 revised, CS-2). impactablePct is the withdrawn v0.4 multiplier; its label
  // stays only so the engine's impactable-withdrawn warning and old drafts can name it.
  const ASSUMPTION_LABELS = {
    impactablePct: 'Salesforce-impactable %',
    sfPct: 'Salesforce-impactable %',
    // v0.5.1 (CS-1 "the reference-workbook way"): read-only check columns from the engine's cohort fields.
    impliedSfPct: 'Implied Salesforce-impactable %',
    checkSumPct: 'Adds to',
    reallocateExcluded: 'Reallocate value from excluded segments'
  };

  const OPTION_LABELS = {
    allocation: { proportional: 'Proportional to composite value' },   // equal and user-entered retired 2026-10-12
    roiBasis: { gross: 'Gross ratio (value ÷ cost)', net: 'Net ROI ((value − cost) ÷ cost)' },
    stoppingRule: {
      'first-fail': 'Stop at first failing call (reference model)',
      'min-block': 'Minimum-block test, then add passing calls',
      'max-pass': 'Most calls that still pass'
    },
    costMode: { fullyLoaded: 'Fully loaded rep cost', layers: 'Explicit management layers' },
    costPerCallMethod: { 'single-window': 'Average of years 1–3, discounted', 'rolling-windows': 'Average of three overlapping 3-year windows' },
    fteRounding: { nearest: 'Nearest whole FTE', up: 'Round up to next whole FTE', none: 'No rounding (raw FTE)' },
    capacityInput: { direct: 'Enter annual capacity directly', derived: 'Calls per day × working days' },
    minimumBoundary: { inclusive: 'Keep a segment exactly at the minimum', strict: 'Require calls above the minimum' },
    cutoffTie: { include: 'Include a call exactly at the cutoff', exclude: 'Exclude a call exactly at the cutoff' },
    reachAppliesTo: { calls: 'Reach reduces calls and cost only', callsAndValue: 'Reach reduces calls, cost, and value' },
    maxCallsSource: { segment: 'Maximum calls per segment', entityAttribute: 'Maximum calls per entity (imported column)' },
    carryoverConvention: { receivingYear: 'Carryover recorded on the receiving year', sourceYear: 'Carryover recorded on the source year' },
    reallocateExcluded: { false: 'Off', true: 'On' },
    forecastMode: {
      'carryover+other': 'Carryover and other channels',
      'carryover+sf': 'Carryover and Salesforce-impactable',
      'other+sf': 'Other channels and Salesforce-impactable'
    }
  };

  const BINDING_LABELS = {
    max: 'Maximum calls cap',
    min: 'Minimum calls floor',
    profitability: 'Marginal ROI cutoff',
    affordability: 'Affordable budget at the ROI cutoff',
    planned: 'Planned calls',
    none: 'No constraint'
  };

  const EXCLUSION_LABELS = {
    'no-reach': () => 'Reach is 0%, so no one is accessible',
    'no-value': () => 'No value is allocated to this segment',
    'below-minimum': m => m === 'response' ? 'Profitable calls fall below the minimum' : 'Affordable calls fall below the minimum',
    'no-profitable-call': () => 'No call clears the ROI cutoff',
    'no-planned-calls': () => 'No planned calls'
  };

  const ROLE_LABELS = { analyst: 'Sizing Analyst', lead: 'Engagement Lead', admin: 'Administrator' };

  const OPTION_DEFAULTS = {
    allocation: 'proportional', roiBasis: 'gross', stoppingRule: 'first-fail', costMode: 'fullyLoaded',
    costPerCallMethod: 'single-window', fteRounding: 'nearest', capacityInput: 'derived', minimumBoundary: 'inclusive',
    cutoffTie: 'include', reachAppliesTo: 'calls', maxCallsSource: 'segment', carryoverConvention: 'receivingYear',
    reallocateExcluded: true, forecastMode: 'carryover+other'   // 2026-10-12 review (Kunal): reallocate by default, toggle kept (was false, D15)
  };
  // capacityInput 'derived' (v0.5, CS-5) is a UI default only: the engine still treats an absent capacityInput as direct.

  const MAPPING_FIELDS = [
    { id: 'entityId', label: 'Entity ID', aliases: ['id', 'entity id', 'hcp id', 'npi', 'account id', 'site id', 'customer id'] },
    { id: 'segment', label: 'Decile / segment', aliases: ['decile', 'segment', 'tier', 'final decile', 'site decile'] },
    { id: 'specialty', label: 'Specialty', optional: true, methods: ['affordable', 'response', 'workload'],
      aliases: ['specialty', 'specialty group', 'primary specialty', 'hcp specialty', 'physician specialty'] },
    { id: 'value', label: 'Valuation / composite score', aliases: ['value', 'composite', 'composite score', 'valuation', 'score', 'blended valuation'] },
    { id: 'archetype', label: 'Curve archetype', aliases: ['archetype', 'curve', 'curve archetype', 'segment archetype'] },
    { id: 'entities', label: 'Entity count', aliases: ['count', 'entities', 'hcps', 'number of hcps', 'number of sites', 'accounts', 'sites'] },
    { id: 'compositeValue', label: 'Composite value (segment total)', aliases: ['composite value', 'total value', 'value'] },
    { id: 'reachPct', label: 'Reach %', aliases: ['reach', 'reach %', 'access', 'access %', 'accessible %'] },
    { id: 'plannedCalls', label: 'Planned annual calls', aliases: ['planned calls', 'calls', 'average calls', 'calls per site', 'calls per hcp'] },
    { id: 'maxCalls', label: 'Maximum calls (entity/specialty)', optional: true, grain: 'entity', methods: ['response'],
      aliases: ['max calls', 'maximum calls', 'specialty max', 'specialty max calls', 'call cap'] },
    ...['Loyalists', 'Splitters', 'Dabblers', 'Conservatives'].map(a => ({
      id: `archetypeMix.${a}`, label: `${a} share %`, optional: true, grain: 'summary', methods: ['response'],
      aliases: [`${a.toLowerCase()} %`, `${a.toLowerCase()} share`, `% ${a.toLowerCase()}`, a.toLowerCase()] }))
  ];

  function requiredMapping(method, inputGrain) {
    if (inputGrain === 'entity') {
      if (method === 'workload') return ['entityId', 'segment'];
      if (method === 'response') return ['entityId', 'segment', 'value', 'archetype'];
      return ['entityId', 'segment', 'value'];
    }
    if (method === 'workload') return ['segment', 'entities'];
    return ['segment', 'entities', 'compositeValue'];
  }

  function segmentFieldsFor(method, allocation, inputGrain, opts) {
    const withOptional = !!(opts && opts.includeOptional);
    return SEGMENT_FIELDS.filter(f =>
      f.methods.includes(method) &&
      (!f.optional || withOptional) &&
      (!f.whenAllocation || f.whenAllocation === allocation) &&
      (!f.summaryOnly || inputGrain === 'summary'));
  }

  const FSFields = { GRAIN, METHODS, SEGMENT_FIELDS, RESULT_LABELS, ASSUMPTION_LABELS, OPTION_LABELS, OPTION_DEFAULTS, BINDING_LABELS, EXCLUSION_LABELS, ROLE_LABELS, MAPPING_FIELDS, requiredMapping, segmentFieldsFor };
  if (typeof module !== 'undefined') module.exports = FSFields; else root.FSFields = FSFields;
})(this);

;
