'use strict';
// T13 (P5, FR-48 proposed): fs-io 1.1.0 exports the uptake presets. Assumptions gets the uptake-by-archetype table,
// Response Curves the effective curve values with provenance for every archetype in curveParams (including non-reference
// archetypes and 'ALL'), Formula Documentation the preset-resolution rule, and a new Configuration sheet the configuration
// snapshot. Arguments mirror app.js doExport; P4 adds scenario.responseCurveConfig and args.config. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./export-helpers.cjs');
const { F, E, FSIO, clone } = H;
const C = F.RESPONSE_CURVE_CONFIG;
const L = F.RESPONSE_CURVE_LABELS;
const K = L.exportColumns, HD = L.exportHeadings, CS = L.curveSheetColumns;
const CONFIG_SHEET = L.exportSheets.configuration;

// Default assignment of the uptake presets sample, config snapshot on the scenario (I-4 draft.responseCurveConfig).
function presetCase() {
  const rc = E.resolveCurves(C.defaultAssignment, C.presets, {});
  assert.deepEqual(rc.issues, []);
  const sc = H.scenarioOf(H.presetInputs(rc), { responseCurveConfig: clone(C) });
  return { rc, sc, args: H.argsOf(sc) };
}

// Mixed: preset, custom (with source note) and the value-only 'ALL' row; edited configuration passed only as args.config.
function mixedConfig() {
  const cfg = clone(C);
  cfg.version = 3; cfg.updatedBy = 'Synthetic Admin'; cfg.updatedAt = '2026-10-14T09:30:00Z';
  cfg.presets[0].label = 'Slow uptake (synthetic edit)'; cfg.presets[0].rho = 12; cfg.presets[0].origin = 'client'; cfg.presets[3].pickerVisible = false;
  cfg.defaultAssignment.Trialists = 'custom';
  cfg.flags.allowValueOnlyResponse = true;
  return cfg;
}
function mixedCase() {
  const cfg = mixedConfig();
  const rc = E.resolveCurves({ Prospects: 'slow', Trialists: 'custom', 'Early Leaders': 'baseline', ALL: 'moderate' }, cfg.presets,
    { Trialists: { delta: 4.5, gamma: 1.25, rho: 6 } });
  assert.deepEqual(rc.issues, []);
  rc.customSourceNote = 'Synthetic marketing-mix study note';
  const sc = H.scenarioOf(H.presetInputs(rc));
  assert.deepEqual(sc.result.errors, []);
  return { cfg, rc, sc, args: H.argsOf(sc, { config: cfg }) };
}

const archName = id => (id === F.RESPONSE_CURVE_RESERVED.all ? L.all : id);
const uptakeOf = (pv, cfg) => (pv.source === 'custom' ? L.custom : cfg.presets.find(p => p.id === pv.presetId).label);

test('FSIO version is fs-io 1.1.0', () => {
  assert.equal(FSIO.version, 'fs-io 1.1.0');
});

test('presets export: workbook opens, sheet list and package parts include Configuration', async () => {
  const { args } = presetCase();
  const bytes = FSIO.exportWorkbook(args);
  const wb = await H.parsed(bytes);
  assert.deepEqual(wb.names, ['Scenario Summary', 'Source Data', 'Assumptions', 'Detailed Calculations', 'Response Curves', 'Scenario Comparison',
    'Scenario detail', 'Formula Documentation', 'Audit and Approval', CONFIG_SHEET]);
  const parts = H.zipParts(bytes);
  const n = wb.names.length;
  assert.ok(parts[`xl/worksheets/sheet${n}.xml`], 'Configuration worksheet part');
  assert.match(parts['xl/workbook.xml'], new RegExp(`<sheet name="${CONFIG_SHEET}" sheetId="${n}" r:id="rId${n}"/>`));
  assert.match(parts['xl/_rels/workbook.xml.rels'], new RegExp(`Id="rId${n}" [^>]*Target="worksheets/sheet${n}.xml"`));
  assert.match(parts['[Content_Types].xml'], new RegExp(`/xl/worksheets/sheet${n}.xml`));
});

test('presets export: Assumptions has the uptake-by-archetype table (archetype, uptake, δ/γ/ρ)', async () => {
  const { rc, args } = presetCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const rows = H.sectionRows(wb.by.Assumptions, HD.assignment);
  assert.ok(rows, 'assignment section present');
  assert.deepEqual(rows[0], [K.archetype, K.uptake, K.delta, K.gamma, K.rho, K.sourceNote]);
  const body = rows.slice(1);
  assert.deepEqual(body.map(r => r[0]), Object.keys(rc.curveParams));
  body.forEach(r => {
    const p = rc.curveParams[r[0]], pv = rc.provenance[r[0]];
    assert.equal(r[1], uptakeOf(pv, C));
    assert.deepEqual(r.slice(2, 5), [p.delta, p.gamma, p.rho]);
    assert.ok(r[5] === undefined || r[5] === null || r[5] === '', 'no source note for a preset row');
  });
});

test('presets export: Response Curves effective values equal curveParams, with provenance', async () => {
  const { rc, args } = presetCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const rows = H.sectionRows(wb.by['Response Curves'], HD.effectiveCurves);
  assert.ok(rows, 'effective curves section present');
  assert.deepEqual(rows[0], [K.archetype, K.uptake, K.source, K.presetId, CS.delta, CS.gamma, CS.rho]);
  // P7 (P5-F5): the parameter headings are the sheet's existing Archetype parameters headings (fs-io 1.0.0 wording).
  const paramHdr = wb.by['Response Curves'].find(r => r && r[0] === 'Curve archetype');
  assert.deepEqual(paramHdr.slice(1, 4), [CS.delta, CS.gamma, CS.rho]);
  const body = rows.slice(1);
  assert.deepEqual(body.map(r => r[0]), Object.keys(rc.curveParams));
  body.forEach(r => {
    const p = rc.curveParams[r[0]], pv = rc.provenance[r[0]];
    assert.deepEqual(r, [r[0], pv.label, L.sourceLabel.preset, pv.presetId, p.delta, p.gamma, p.rho]);
  });
});

test('presets export: Formula Documentation states the preset-resolution rule once', async () => {
  const { args } = presetCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const hits = wb.by['Formula Documentation'].filter(r => r && r[1] === HD.resolutionRule);
  assert.equal(hits.length, 1);
  assert.equal(hits[0][2], L.resolutionRule);
  assert.match(hits[0][4], new RegExp(CONFIG_SHEET));
});

test('presets export: Configuration lists version, presets (4), curve library (17), default assignment and flags', async () => {
  const { args } = presetCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const R = wb.by[CONFIG_SHEET];
  assert.equal(R[0][0], L.configuratorTitle);
  const kv = H.sectionRows(R, K.field);
  assert.deepEqual(kv, [[L.configVersion, C.version], [L.updatedBy, L.neverUpdated], [L.updatedAt, L.neverUpdated]]);
  const presets = H.sectionRows(R, HD.presets);
  assert.deepEqual(presets[0], [K.presetId, K.label, K.description, K.delta, K.gamma, K.rho, K.origin, K.pickerVisible]);
  assert.equal(presets.length - 1, 4);
  presets.slice(1).forEach((r, i) => {
    const p = C.presets[i];
    assert.deepEqual(r, [p.id, p.label, p.description, p.delta, p.gamma, p.rho, L.origin[p.origin], L.flagState.true]);
  });
  const lib = H.sectionRows(R, HD.curveLibrary);
  assert.deepEqual(lib[0], [K.step, K.label, K.delta, K.gamma, K.rho]);
  assert.equal(lib.length - 1, 17);
  lib.slice(1).forEach((r, i) => { const s = C.curveLibrary[i]; assert.deepEqual(r, [i + 1, s.label, s.delta, s.gamma, s.rho]); });
  const da = H.sectionRows(R, HD.defaultAssignment);
  assert.deepEqual(da.slice(1), Object.entries(C.defaultAssignment).map(([a, id]) => [a, C.presets.find(p => p.id === id).label, id]));
  const fl = H.sectionRows(R, HD.flags);
  assert.deepEqual(fl.slice(1), Object.entries(C.flags).map(([k, v]) => [L.flagLabels[k], L.flagState[String(v)]]));
});

test('mixed export: custom row with source note, non-reference archetypes and All HCPs; args.config fallback', async () => {
  const { cfg, rc, args } = mixedCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const ids = Object.keys(rc.curveParams);
  assert.ok(ids.includes('ALL') && ids.includes('Trialists'));
  // Assumptions
  const asg = H.sectionRows(wb.by.Assumptions, HD.assignment).slice(1);
  assert.deepEqual(asg.map(r => r[0]), ids.map(archName));
  asg.forEach((r, i) => {
    const id = ids[i], p = rc.curveParams[id], pv = rc.provenance[id];
    assert.equal(r[1], uptakeOf(pv, cfg));
    assert.deepEqual(r.slice(2, 5), [p.delta, p.gamma, p.rho]);
    if (pv.source === 'custom') assert.equal(r[5], rc.customSourceNote);
    else assert.ok(r[5] === undefined || r[5] === null || r[5] === '', `${id}: source note blank on a preset row (F3)`);
  });
  assert.equal(asg.find(r => r[0] === L.all)[1], 'Moderate uptake');
  // Response Curves: numbers equal the curveParams passed, provenance per row, source note line
  const eff = H.sectionRows(wb.by['Response Curves'], HD.effectiveCurves).slice(1);
  const curveRows = eff.filter(r => r[0] !== K.sourceNote);
  assert.deepEqual(curveRows.map(r => r[0]), ids.map(archName));
  curveRows.forEach((r, i) => {
    const id = ids[i], p = rc.curveParams[id], pv = rc.provenance[id];
    assert.deepEqual(r.slice(4, 7), [p.delta, p.gamma, p.rho], id);
    // P7 (P5-F5): a Custom row's Source does not repeat its Uptake label
    assert.equal(r[2], pv.source === 'custom' ? L.exportCustomSource : L.sourceLabel[pv.source]);
    assert.notEqual(r[2], r[1], `${id}: Source repeats Uptake`);
    assert.equal(r[3] == null ? null : r[3], pv.presetId);
  });
  assert.equal(curveRows.find(r => r[0] === 'Trialists')[1], L.custom);
  assert.deepEqual(eff.find(r => r[0] === K.sourceNote), [K.sourceNote, rc.customSourceNote]);
  assert.deepEqual(curveRows.find(r => r[0] === 'Prospects').slice(1, 4), ['Slow uptake (synthetic edit)', L.sourceLabel.preset, 'slow']);
  assert.equal(curveRows.find(r => r[0] === 'Prospects')[6], 12);
  // Configuration from args.config
  const R = wb.by[CONFIG_SHEET];
  const kv = H.sectionRows(R, K.field);
  assert.equal(kv[0][1], 3);
  assert.equal(kv[1][1], 'Synthetic Admin');
  assert.notEqual(kv[2][1], L.neverUpdated);
  assert.match(kv[2][1], /^2026-10-14 /);
  const presets = H.sectionRows(R, HD.presets).slice(1);
  assert.deepEqual(presets[0].slice(0, 2), ['slow', 'Slow uptake (synthetic edit)']);
  assert.equal(presets[0][6], L.origin.client);
  assert.equal(presets[3][7], L.flagState.false);
  const da = H.sectionRows(R, HD.defaultAssignment).slice(1);
  assert.deepEqual(da.find(r => r[0] === 'Trialists'), ['Trialists', L.custom, F.RESPONSE_CURVE_RESERVED.custom]);
  const fl = H.sectionRows(R, HD.flags).slice(1);
  assert.deepEqual(fl.find(r => r[0] === L.flagLabels.allowValueOnlyResponse), [L.flagLabels.allowValueOnlyResponse, L.flagState.true]);
});

test('scenario.responseCurveConfig takes precedence over args.config', async () => {
  const { sc } = presetCase();
  const other = mixedConfig();
  const wb = await H.parsed(FSIO.exportWorkbook(H.argsOf(sc, { config: other })));
  const kv = H.sectionRows(wb.by[CONFIG_SHEET], K.field);
  assert.equal(kv[0][1], C.version);
  assert.equal(H.sectionRows(wb.by[CONFIG_SHEET], HD.presets)[1][1], C.presets[0].label);
});

test('new and changed sheets use FSFields wording for every new heading', async () => {
  const { args } = mixedCase();
  const wb = await H.parsed(FSIO.exportWorkbook(args));
  const has = (sheet, v) => wb.by[sheet].some(r => r && r.includes(v));
  assert.ok(has('Assumptions', HD.assignment));
  assert.ok(has('Response Curves', HD.effectiveCurves));
  for (const h of [L.configuratorTitle, HD.presets, HD.curveLibrary, HD.defaultAssignment, HD.flags]) assert.ok(has(CONFIG_SHEET, h), h);
});

test('a non-response export keeps the method sheets unchanged; its Configuration reads "No configuration recorded" (D-RUN-09)', async () => {
  const inputs = H.sampleInputs('single', 'affordable', H.mods);
  const sc = H.scenarioOf(inputs, { responseCurveConfig: clone(C) });
  const wb = await H.parsed(FSIO.exportWorkbook(H.argsOf(sc)));
  assert.ok(!wb.names.includes('Response Curves'));
  assert.equal(wb.names[wb.names.length - 1], CONFIG_SHEET);
  assert.equal(H.sectionRows(wb.by.Assumptions, HD.assignment), null);
  assert.equal(H.sectionRows(wb.by[CONFIG_SHEET], HD.presets), null);
  assert.ok(wb.by[CONFIG_SHEET].some(r => r && r[0] === L.noConfiguration));
});
