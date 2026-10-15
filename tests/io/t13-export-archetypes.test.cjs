'use strict';
// T13 / FR-47 (P5 resume): for a new-shape snapshot the workbook reads the archetypes from the data. Response Curves
// (parameter table, normalized-response columns, archetype mix table), the Assumptions segment-input mix columns and the
// Detailed Calculations curve-group table list every archetype in engine order: reference archetypes present first, then
// the others in first-seen order; 'ALL' shows as "All HCPs" and is never a share column. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./export-helpers.cjs');
const { F, E, FSIO, S, clone } = H;
const C = F.RESPONSE_CURVE_CONFIG;
const L = F.RESPONSE_CURVE_LABELS;
const CURVES = 'Response Curves';

// Uptake presets sample, curves resolved on the configuration's default assignment.
function presetSampleCase() {
  const rc = E.resolveCurves(C.defaultAssignment, C.presets, {});
  assert.deepEqual(rc.issues, []);
  const sc = H.scenarioOf(H.presetInputs(rc), { responseCurveConfig: clone(C) });
  assert.deepEqual(sc.result.errors, []);
  return { rc, sc, args: H.argsOf(sc) };
}

/* Mixed: the presets sample with part of each segment's Prospects share moved to the reference archetype Loyalists,
   listed after Prospects in the mix (so engine order differs from first-seen order), plus a value-only 'ALL' curve. */
const MIXED_ORDER = ['Loyalists', 'Prospects', 'Trialists', 'Early Leaders'];
function mixedCase() {
  const rc = E.resolveCurves({ Prospects: 'slow', Loyalists: 'custom', Trialists: 'moderate', 'Early Leaders': 'baseline', ALL: 'steep' }, C.presets,
    { Loyalists: { delta: 5, gamma: 1.4, rho: 9 } });
  assert.deepEqual(rc.issues, []);
  rc.customSourceNote = 'Synthetic marketing-mix study note';
  const inputs = H.presetInputs(rc);
  inputs.segments.forEach(s => {
    const m = s.archetypeMix, half = m.Prospects / 2;
    s.archetypeMix = { Prospects: m.Prospects - half, Loyalists: half, Trialists: m.Trialists, 'Early Leaders': m['Early Leaders'] };
  });
  const sc = H.scenarioOf(inputs, { responseCurveConfig: clone(C) });
  assert.deepEqual(sc.result.errors, []);
  return { rc, inputs, sc, args: H.argsOf(sc) };
}

const blank = r => !r || r.every(v => v === null || v === undefined || v === '');
function paramTable(rows) {
  const i = rows.findIndex(r => r && r[0] === 'Archetype parameters');
  const out = [];
  for (let k = i + 2; k < rows.length && !blank(rows[k]); k++) out.push({ row: k, cells: rows[k] });
  return out;
}

// Shared checks: param table names/values, normalized-response header, mix tables on both sheets, live curve groups.
async function checkWorkbook(args, inputs, rc, expected) {
  const bytes = FSIO.exportWorkbook(args);
  const wb = await H.parsed(bytes);
  const names = expected.map(a => (a === 'ALL' ? L.all : a));
  const mixNames = expected.filter(a => a !== 'ALL');
  // Response Curves parameter table: every archetype, engine order, δ/γ/ρ equal to the curveParams passed
  const P = paramTable(wb.by[CURVES]);
  assert.deepEqual(P.map(x => x.cells[0]), names);
  P.forEach((x, i) => {
    const p = rc.curveParams[expected[i]];
    assert.deepEqual(x.cells.slice(1, 4), [p.delta, p.gamma, p.rho], expected[i]);
  });
  // normalized response columns
  const hdr = wb.by[CURVES].find(r => r && r[0] === 'Calls');
  assert.deepEqual(hdr.slice(1), names);
  const atX = wb.by[CURVES].find(r => r && r[0] === inputs.methodAssumptions.scenarioMaxCalls);
  atX.slice(1).forEach(v => assert.ok(Math.abs(v - 1) < 1e-12, 'normalized response is 1 at the normalization point'));
  // archetype mix by segment (Response Curves) and segment-input mix columns (Assumptions), shares as fractions
  const mixHdr = mixNames.map(a => `${a} %`);
  const rcMix = H.sectionRows(wb.by[CURVES], 'Archetype mix by segment (summary input)');
  assert.deepEqual(rcMix[0].slice(1), mixHdr);
  inputs.segments.forEach((s, i) => assert.deepEqual(rcMix[i + 1].slice(1), mixNames.map(a => s.archetypeMix[a] / 100)));
  const asm = H.sectionRows(wb.by.Assumptions, 'Segment inputs');
  const c0 = asm[0].indexOf(mixHdr[0]);
  assert.ok(c0 > 0, 'mix columns present');
  assert.deepEqual(asm[0].slice(c0, c0 + mixNames.length), mixHdr);
  assert.ok(!asm[0].some(h => /^(Splitters|Dabblers|Conservatives) %$/.test(h) && !mixNames.includes(h.slice(0, -2))), 'no unused reference columns');
  inputs.segments.forEach((s, i) => assert.deepEqual(asm[i + 1].slice(c0, c0 + mixNames.length), mixNames.map(a => s.archetypeMix[a] / 100)));
  // Detailed Calculations: live curve-group table for every data archetype, normalized-response formula pointing at the
  // archetype's own Response Curves parameter row
  const D = wb.by['Detailed Calculations'];
  const gi = D.findIndex(r => r && r[0] === 'Calls chosen per curve archetype group');
  assert.ok(gi > 0, 'curve-group table written (live formulas)');
  const groups = [];
  for (let k = gi + 3; k < D.length && !blank(D[k]); k++) groups.push({ row: k, cells: D[k] });
  assert.deepEqual([...new Set(groups.map(g => g.cells[1]))], mixNames);
  const xml = H.sheetXmlByName(bytes)['Detailed Calculations'];
  const paramRow = Object.fromEntries(P.map((x, i) => [expected[i], x.row + 1]));
  groups.forEach(g => {
    const rowXml = (xml.match(new RegExp(`<row r="${g.row + 1}">([\\s\\S]*?)</row>`)) || [])[1];
    assert.ok(rowXml, `row ${g.row + 1}`);
    const q = paramRow[g.cells[1]];
    assert.ok(rowXml.includes(`'${CURVES}'!$B$${q}`) && rowXml.includes(`'${CURVES}'!$E$${q}`), `${g.cells[1]} formula uses parameter row ${q}`);
  });
  return wb;
}

test('presets sample: Response Curves and Assumptions show Prospects / Trialists / Early Leaders with their shares and δ/γ/ρ', async () => {
  const { rc, sc, args } = presetSampleCase();
  const expected = Object.keys(C.defaultAssignment);
  assert.deepEqual(expected, ['Prospects', 'Trialists', 'Early Leaders']);
  // the sample's archetypes come from FSSample.presetSample
  assert.deepEqual(Object.keys(S.presetSample.segments('response')[0].archetypeMix), expected);
  await checkWorkbook(args, sc.inputs, rc, expected);
});

test('mixed reference + non-reference (+ ALL): engine order, All HCPs label, no ALL share column', async () => {
  const { rc, inputs, args } = mixedCase();
  const wb = await checkWorkbook(args, inputs, rc, MIXED_ORDER.concat(['ALL']));
  // the custom reference archetype keeps its entered values (not the reference defaults)
  const P = paramTable(wb.by[CURVES]);
  assert.deepEqual(P[0].cells.slice(0, 4), ['Loyalists', 5, 1.4, 9]);
  assert.ok(!H.sectionRows(wb.by.Assumptions, 'Segment inputs')[0].includes(`${L.all} %`));
});
