'use strict';
// P2 contract: FSFields.RESPONSE_CURVE_CONFIG seed (I-1), REFERENCE_PRESETS, reserved ids, labels and MAPPING_FIELDS (FR-47).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { FSFields: F } = load();
const C = F.RESPONSE_CURVE_CONFIG;

// Beghou reference presets (plan §5) in picker order: Baseline is last, not the middle option.
const SEED = [
  { id: 'slow', label: 'Slow uptake', delta: 5, gamma: 1.5, rho: 11 },
  { id: 'moderate', label: 'Moderate uptake', delta: 5, gamma: 1.1, rho: 3.5 },
  { id: 'steep', label: 'Steep uptake', delta: 5, gamma: 0.8, rho: 1.5 },
  { id: 'baseline', label: 'Baseline', delta: 5, gamma: 1.3, rho: 7 }
];
const LIBRARY = [
  ['+4 Max', 0.2], ['+3.5', 0.4], ['+3 Higher', 0.6], ['+2.5', 0.8], ['+2 Very High', 1.1], ['+1.5', 1.4], ['+1 High', 1.8], ['+0.5', 2.3],
  ['Base', 3.0], ['−0.5', 3.9], ['−1 Low', 5.0], ['−1.5', 6.5], ['−2 Very Low', 9.0], ['−2.5', 15], ['−3 Lower', 30],
  ['−3.5', 80], ['−4 Linear', 100000]
];

function isDeepFrozen(o, at = 'root') {
  if (!o || typeof o !== 'object') return;
  assert.ok(Object.isFrozen(o), `${at} is not frozen`);
  Object.keys(o).forEach(k => isDeepFrozen(o[k], `${at}.${k}`));
}

test('config: version 1, never updated, top-level keys exactly as I-1', () => {
  assert.deepEqual(Object.keys(C), ['version', 'updatedBy', 'updatedAt', 'presets', 'curveLibrary', 'defaultAssignment', 'flags']);
  assert.equal(C.version, 1);
  assert.equal(C.updatedBy, null);
  assert.equal(C.updatedAt, null);
});

test('config: four presets in picker order slow, moderate, steep, baseline with the exact §5 values', () => {
  assert.deepEqual(C.presets.map(p => p.id), ['slow', 'moderate', 'steep', 'baseline']);
  C.presets.forEach((p, i) => {
    const s = SEED[i];
    assert.deepEqual(Object.keys(p), ['id', 'label', 'description', 'delta', 'gamma', 'rho', 'origin', 'pickerVisible']);
    assert.equal(p.label, s.label);
    assert.equal(p.delta, s.delta); assert.equal(p.gamma, s.gamma); assert.equal(p.rho, s.rho);
    assert.equal(p.origin, 'beghou-reference');
    assert.equal(p.pickerVisible, true);
    assert.ok(typeof p.description === 'string' && p.description.length > 10 && p.description.length < 140, `${p.id} description`);
  });
  const baseline = C.presets.find(p => p.id === 'baseline');
  assert.ok(!/middle|medium|average|between/i.test(baseline.description), 'Baseline must not be described as the middle option');
});

test('config: the 17-step curve library (gamma 1, delta 5, typographic minus)', () => {
  assert.equal(C.curveLibrary.length, 17);
  C.curveLibrary.forEach((s, i) => {
    assert.deepEqual(s, { id: `lib-${String(i + 1).padStart(2, '0')}`, label: LIBRARY[i][0], delta: 5, gamma: 1, rho: LIBRARY[i][1] });
    assert.ok(!/-/.test(s.label.replace(/^lib/, '')), `${s.id} uses a hyphen-minus`);
  });
  assert.equal(C.curveLibrary[0].id, 'lib-01');
  assert.equal(C.curveLibrary[16].id, 'lib-17');
});

test('config: default assignment, flags and reserved ids', () => {
  assert.deepEqual(C.defaultAssignment, { Prospects: 'slow', Trialists: 'moderate', 'Early Leaders': 'steep' });
  assert.deepEqual(Object.keys(C.defaultAssignment), ['Prospects', 'Trialists', 'Early Leaders']);
  assert.deepEqual(C.flags, { allowValueOnlyResponse: false, allowCustomCurve: true });
  assert.deepEqual(F.RESPONSE_CURVE_RESERVED, { custom: 'custom', all: 'ALL' });
  // Reserved values never collide with a preset id or a default archetype name.
  assert.ok(!C.presets.some(p => p.id === F.RESPONSE_CURVE_RESERVED.custom));
  assert.ok(!Object.keys(C.defaultAssignment).includes(F.RESPONSE_CURVE_RESERVED.all));
  // Every default assignment points at a real preset (or the reserved custom value).
  Object.values(C.defaultAssignment).forEach(v => assert.ok(v === 'custom' || C.presets.some(p => p.id === v), v));
});

test('config and REFERENCE_PRESETS are deep-frozen', () => {
  isDeepFrozen(C, 'RESPONSE_CURVE_CONFIG');
  isDeepFrozen(F.REFERENCE_PRESETS, 'REFERENCE_PRESETS');
  isDeepFrozen(F.RESPONSE_CURVE_LABELS, 'RESPONSE_CURVE_LABELS');
  isDeepFrozen(F.RESPONSE_CURVE_RESERVED, 'RESPONSE_CURVE_RESERVED');
  assert.throws(() => { 'use strict'; C.presets[0].rho = 99; }, TypeError);
  assert.equal(C.presets[0].rho, 11);
});

test('REFERENCE_PRESETS equals the seed presets but is a separate copy', () => {
  assert.deepEqual(F.REFERENCE_PRESETS, C.presets);
  assert.notEqual(F.REFERENCE_PRESETS, C.presets);
  F.REFERENCE_PRESETS.forEach((p, i) => assert.notEqual(p, C.presets[i]));
  // A deep clone (what the app keeps in state) can be edited without touching the reference.
  const cfg = JSON.parse(JSON.stringify(C));
  cfg.presets[0].rho = 42;
  assert.equal(F.REFERENCE_PRESETS[0].rho, 11);
});

test('RESPONSE_CURVE_LABELS: engine keys and the I-1 label list', () => {
  const L = F.RESPONSE_CURVE_LABELS;
  assert.equal(L.custom, 'Custom (from marketing mix)');
  assert.equal(L.all, 'All HCPs');
  assert.equal(L.advanced, 'Advanced: curve details');
  assert.equal(L.halfOfPeak, 'Half of peak (calls)');
  assert.equal(L.uptake, 'Uptake');
  assert.equal(L.resetReference, 'Reset to Beghou reference');
  assert.equal(L.copyIntoPreset, 'Copy into preset…');
  assert.equal(L.referencePresets, 'Beghou reference presets');
  assert.equal(L.referenceLibrary, 'Beghou reference curve library');
  assert.equal(L.noConfiguration, 'No configuration recorded');
  assert.equal(L.exportSheets.configuration, 'Configuration');
  assert.deepEqual(L.tabs, { presets: 'Presets', defaultAssignment: 'Default assignment', curveLibrary: 'Curve library', flags: 'Flags' });
  ['sourceNote', 'sourceNoteHelp', 'sourceNoteRequired', 'configuratorTitle', 'pickerVisible', 'configVersion', 'samplePresetsButton', 'samplePresetsData', 'samplePresetsAudit', 'samplePresetsToast']
    .forEach(k => assert.ok(typeof L[k] === 'string' && L[k].trim(), k));
  Object.keys(C.flags).forEach(k => { assert.ok(L.flagLabels[k], `flag label ${k}`); assert.ok(L.flagHelp[k], `flag help ${k}`); });
  ['custom-curve-invalid', 'custom-source-missing', 'unknown-archetype', 'unknown-preset'].forEach(k => assert.equal(typeof L.validation[k], 'function', k));
  assert.equal(L.audit.configEdit('Slow uptake rho', 11, 12), 'Slow uptake rho: 11 → 12');
  assert.equal(typeof L.configVersionText(3), 'string');
  // Plain language: no reference-workbook naming in any label.
  const all = JSON.stringify(L, (k, v) => (typeof v === 'function' ? v.toString() : v));
  assert.ok(!/workbook|S2\b|spreadsheet/i.test(all));
});

test('MAPPING_FIELDS: four reference archetype fields unchanged, config archetypes appended, no duplicate ids', () => {
  const ref = ['Loyalists', 'Splitters', 'Dabblers', 'Conservatives'];
  const mixFields = F.MAPPING_FIELDS.filter(f => f.id.startsWith('archetypeMix.'));
  ref.forEach((a, i) => assert.deepEqual(mixFields[i], {
    id: `archetypeMix.${a}`, label: `${a} share %`, optional: true, grain: 'summary', methods: ['response'],
    aliases: [`${a.toLowerCase()} %`, `${a.toLowerCase()} share`, `% ${a.toLowerCase()}`, a.toLowerCase()] }));
  assert.deepEqual(mixFields.map(f => f.id.slice('archetypeMix.'.length)), ref.concat(Object.keys(C.defaultAssignment)));
  const leaders = F.MAPPING_FIELDS.find(f => f.id === 'archetypeMix.Early Leaders');
  assert.deepEqual(leaders, { id: 'archetypeMix.Early Leaders', label: 'Early Leaders share %', optional: true, grain: 'summary', methods: ['response'],
    aliases: ['early leaders %', 'early leaders share', '% early leaders', 'early leaders'] });
  const ids = F.MAPPING_FIELDS.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length);
  // The fields before the archetype block are untouched (same ids in the same order as before P2).
  assert.deepEqual(ids.slice(0, 10), ['entityId', 'segment', 'specialty', 'value', 'archetype', 'entities', 'compositeValue', 'reachPct', 'plannedCalls', 'maxCalls']);
});
