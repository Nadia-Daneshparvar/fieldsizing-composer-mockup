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

  /* ---- Response curve uptake presets (FR-44..FR-48, proposed) ----
     RESPONSE_CURVE_CONFIG is the frozen seed; the app deep-clones it into project state and the administrator edits the clone.
     Preset values are the Beghou reference presets. Picker order is slow, moderate, steep, baseline: Baseline is not the
     middle option. The curve library is an administrator reference only and never appears in the analyst picker. */
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  const RESPONSE_CURVE_RESERVED = deepFreeze({ custom: 'custom', all: 'ALL' });
  const PRESET_SEEDS = [
    { id: 'slow', label: 'Slow uptake', description: 'Response builds slowly: it takes more calls before the response levels off.', delta: 5, gamma: 1.5, rho: 11 },
    { id: 'moderate', label: 'Moderate uptake', description: 'Response builds at a steady pace and levels off after a moderate number of calls.', delta: 5, gamma: 1.1, rho: 3.5 },
    { id: 'steep', label: 'Steep uptake', description: 'Response builds quickly: the first few calls do most of the work.', delta: 5, gamma: 0.8, rho: 1.5 },
    { id: 'baseline', label: 'Baseline', description: 'A general reference curve for when no archetype-specific uptake is known.', delta: 5, gamma: 1.3, rho: 7 }
  ];
  const presetSeed = p => Object.assign({}, p, { origin: 'beghou-reference', pickerVisible: true });
  const CURVE_LIBRARY_STEPS = [
    ['+4 Max', 0.2], ['+3.5', 0.4], ['+3 Higher', 0.6], ['+2.5', 0.8], ['+2 Very High', 1.1], ['+1.5', 1.4], ['+1 High', 1.8], ['+0.5', 2.3],
    ['Base', 3.0], ['−0.5', 3.9], ['−1 Low', 5.0], ['−1.5', 6.5], ['−2 Very Low', 9.0], ['−2.5', 15], ['−3 Lower', 30], ['−3.5', 80], ['−4 Linear', 100000]
  ];
  const RESPONSE_CURVE_CONFIG = deepFreeze({
    version: 1,
    updatedBy: null,
    updatedAt: null,
    presets: PRESET_SEEDS.map(presetSeed),
    curveLibrary: CURVE_LIBRARY_STEPS.map(([label, rho], i) => ({ id: `lib-${String(i + 1).padStart(2, '0')}`, label, delta: 5, gamma: 1, rho })),
    defaultAssignment: { Prospects: 'slow', Trialists: 'moderate', 'Early Leaders': 'steep' },
    flags: { allowValueOnlyResponse: false, allowCustomCurve: true }
  });
  // "Reset to Beghou reference" restores exactly these (a separate frozen copy, so edits to the config never reach it).
  const REFERENCE_PRESETS = deepFreeze(PRESET_SEEDS.map(presetSeed));

  // Every user-facing string for the response curve presets feature. `custom` and `all` are read by the engine trace.
  const RESPONSE_CURVE_LABELS = deepFreeze({
    // Picker and Model Assumptions (Step 2)
    custom: 'Custom (from marketing mix)',
    all: 'All HCPs',
    uptake: 'Uptake',
    uptakeByArchetype: 'Uptake by archetype',
    uptakeHint: 'Choose how quickly each archetype responds to calls. The curve values behind each choice are shown under "Advanced: curve details".',
    chooseUptake: 'Choose uptake',
    notAssigned: 'Not chosen',
    notAssignedHelp: 'No uptake is assumed: choose one for every archetype before checking assumptions.',
    archetype: 'Curve archetype',
    preset: 'Uptake preset',
    advanced: 'Advanced: curve details',
    advancedHint: 'Read-only. The curve values each uptake choice uses.',
    halfOfPeak: 'Half of peak (calls)',
    delta: 'Peak (δ)',
    gamma: 'Shape (γ)',
    rho: 'Saturation (ρ)',
    customHint: 'Enter the curve values from your marketing-mix analysis. All three must be numbers above 0.',
    customNotAllowed: 'Custom curves are turned off in the configuration.',
    sourceNote: 'Source note for custom curves',
    sourceNoteHelp: 'Say where the custom curve values come from, for example the marketing-mix study and its date.',
    sourceNoteRequired: 'Enter a source note for the custom curves.',
    curveLegendPreset: (archetype, preset) => `${archetype}: ${preset}`,
    valueOnlyRowHint: 'The data has no archetypes, so one uptake applies to all HCPs.',
    // Administrator configurator
    configuratorTitle: 'Response curve configuration',
    configuratorOpen: 'Response curve configuration',
    configuratorHint: 'Set the uptake presets analysts can choose, the default uptake per archetype, and the feature flags. Every change is recorded in the audit trail.',
    configuratorClose: 'Close',
    configuratorAdminOnly: 'Only an Administrator can open the response curve configuration.',
    tabs: { presets: 'Presets', defaultAssignment: 'Default assignment', curveLibrary: 'Curve library', flags: 'Flags' },
    presetLabel: 'Label',
    presetDescription: 'Description',
    presetLabelRequired: 'Enter a label for the preset.',
    presetValueInvalid: param => `${param} must be a number above 0.`,
    pickerVisible: 'Show in the uptake picker',
    origin: { 'beghou-reference': 'Beghou reference', client: 'Edited for this project' },
    originLabel: 'Origin',
    resetReference: 'Reset to Beghou reference',
    copyIntoPreset: 'Copy into preset…',
    copyTarget: 'Copy into which preset?',
    referencePresets: 'Beghou reference presets',
    referenceLibrary: 'Beghou reference curve library',
    libraryStep: 'Step',
    libraryHint: 'Reference only. Analysts never see this list; copy a step into a preset to make it available.',
    defaultAssignmentHint: 'The uptake each archetype starts with when it appears in the data. An archetype not listed here starts with no uptake chosen.',
    addArchetype: 'Add archetype',
    archetypeName: 'Archetype name',
    removeArchetype: name => `Remove ${name}`,
    archetypeNameRequired: 'Enter an archetype name.',
    archetypeNameDuplicate: 'That archetype is already listed.',
    // P3 fix cycle 1 (additive): configurator validation and notices
    archetypeNameReserved: 'That name is reserved by the tool. Choose another archetype name.',
    presetValueComma: param => `${param}: use a point for decimals, not a comma (for example 1.5).`,
    presetLabelTooLong: max => `Keep the label to ${max} characters or fewer.`,
    presetDescriptionTooLong: max => `Keep the description to ${max} characters or fewer.`,
    presetLabelDuplicate: 'Another preset already has that label.',
    pickerVisibleLast: 'At least one preset must stay in the uptake picker.',
    customOffInUse: names => `Custom curves are now off, but the default assignment still uses Custom for: ${names}. Choose a preset for each of them.`,
    alreadyReference: 'The presets already match the Beghou reference. Nothing was changed.',
    // P3 fix cycle 2 (additive)
    presetValuePlainDecimal: param => `${param} must be a plain decimal number, for example 1.5 (digits and an optional decimal point only).`,
    presetLabelIsCustom: 'That label is used for custom curves. Choose another label.',
    archetypeNameTooLong: max => `Keep the archetype name to ${max} characters or fewer.`,
    flagLabels: {
      allowValueOnlyResponse: 'Allow value-only data for the response curve method',
      allowCustomCurve: 'Allow custom curves'
    },
    flagHelp: {
      allowValueOnlyResponse: 'Off by default: value-only data stays blocked for the response curve method. When on, data without archetypes uses one "All HCPs" uptake.',
      allowCustomCurve: 'When on, analysts can enter their own curve values from a marketing-mix analysis, with a source note.'
    },
    flagState: { true: 'On', false: 'Off' },
    configVersion: 'Configuration version',
    configVersionText: v => `Configuration version ${v}`,
    updatedBy: 'Last changed by',
    updatedAt: 'Last changed',
    neverUpdated: 'Not changed since setup',
    // Audit wording
    audit: {
      configEdit: (field, from, to) => `${field}: ${from} → ${to}`,
      configReset: 'Presets reset to Beghou reference',
      libraryCopy: (step, preset) => `Curve library step ${step} copied into ${preset}`,
      uptakeChange: (archetype, from, to) => `Uptake for ${archetype}: ${from} → ${to}`,
      customValue: (archetype, param, from, to) => `Custom curve for ${archetype}, ${param}: ${from} → ${to}`,
      sourceNote: (from, to) => `Custom curve source note: ${from} → ${to}`,
      blank: '(blank)'
    },
    // Validation messages (keyed by the engine issue code)
    validation: {
      'custom-curve-invalid': (archetype, param) => `${archetype}: the custom curve ${param} must be a number above 0.`,
      'custom-source-missing': () => 'Enter a source note for the custom curves.',
      'unknown-archetype': archetype => `${archetype} has no uptake in this project. Choose an uptake for it.`,
      'unknown-preset': (archetype, preset) => `${archetype}: the uptake "${preset}" is no longer in the configuration. Choose another.`,
      unassigned: archetype => `Choose an uptake for ${archetype}.`
    },
    // Scenario summary and export
    summaryHeading: 'Uptake by archetype',
    customWithNote: note => `Custom (from marketing mix); source: ${note}`,
    exportSheets: { configuration: 'Configuration' },
    noConfiguration: 'No configuration recorded',
    exportHeadings: {
      assignment: 'Uptake by archetype',
      effectiveCurves: 'Effective curve values',
      presets: 'Presets',
      curveLibrary: 'Curve library',
      defaultAssignment: 'Default assignment',
      flags: 'Flags',
      resolutionRule: 'Uptake preset resolution'
    },
    exportColumns: {
      archetype: 'Curve archetype', uptake: 'Uptake', source: 'Source', presetId: 'Preset id', label: 'Label', description: 'Description',
      delta: 'Peak (δ)', gamma: 'Shape (γ)', rho: 'Saturation (ρ)', halfOfPeak: 'Half of peak (calls)', origin: 'Origin',
      pickerVisible: 'Shown in picker', sourceNote: 'Source note', step: 'Step', flag: 'Flag', value: 'Value', field: 'Field'
    },
    resolutionRule: 'Each archetype uses the curve values of its chosen uptake preset from the configuration. Custom uses the values entered from a marketing-mix analysis, with a required source note. An archetype with no uptake chosen is not sized and is reported as a validation error.',
    sourceLabel: { preset: 'Preset', custom: 'Custom (from marketing mix)' },
    // Step 1: third synthetic sample
    samplePresetsButton: 'Load uptake presets synthetic sample',
    samplePresetsData: 'Synthetic uptake presets sample data',
    samplePresetsAudit: 'Synthetic uptake presets sample project loaded (3 archetypes with default uptake)',
    samplePresetsToast: 'Synthetic uptake presets sample loaded. Run the inputs check to continue.',
    // P4 fix 1 (additive): Segmentation type audit wording when value-only data is allowed (one "All HCPs" uptake)
    segTypeValueOnlyAllowed: 'Value only (one "All HCPs" uptake)',
    // P4 fix 2 (additive): Step 2 table and Scenario Summary wording; earlier drafts without uptake choices
    share: 'Share',
    total: 'Total',
    noArchetype: 'No archetype supplied',
    notApplicable: 'Not applicable',
    referenceCurve: 'Reference curve (earlier draft without an uptake choice)',
    editedCurve: 'Edited curve (earlier draft without an uptake choice)',
    carriedOverNote: 'Curve values carried over from an earlier draft'
  });

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
  // FR-47 (proposed): share columns for the configuration's archetypes too, read from the config (no new literals), de-duplicated.
  Object.keys(RESPONSE_CURVE_CONFIG.defaultAssignment).forEach(a => {
    if (MAPPING_FIELDS.some(f => f.id === `archetypeMix.${a}`)) return;
    MAPPING_FIELDS.push({ id: `archetypeMix.${a}`, label: `${a} share %`, optional: true, grain: 'summary', methods: ['response'],
      aliases: [`${a.toLowerCase()} %`, `${a.toLowerCase()} share`, `% ${a.toLowerCase()}`, a.toLowerCase()] });
  });

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

  const FSFields = { GRAIN, METHODS, SEGMENT_FIELDS, RESULT_LABELS, ASSUMPTION_LABELS, OPTION_LABELS, OPTION_DEFAULTS, BINDING_LABELS, EXCLUSION_LABELS, ROLE_LABELS, MAPPING_FIELDS, requiredMapping, segmentFieldsFor,
    RESPONSE_CURVE_CONFIG, REFERENCE_PRESETS, RESPONSE_CURVE_LABELS, RESPONSE_CURVE_RESERVED };
  if (typeof module !== 'undefined') module.exports = FSFields; else root.FSFields = FSFields;
})(this);

;
