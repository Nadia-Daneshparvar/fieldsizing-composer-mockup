'use strict';
// T13 back-compat (P5, I-5): a snapshot without the new curve fields (old draft) exports cell-for-cell as fs-io 1.0.0
// except the added Configuration sheet, which reads the FSFields "No configuration recorded" message (D-RUN-09: also when
// args.config is passed). The 1.0.0 module is the committed fixture tests/io/fixtures/fs-io-1.0.0.js, byte-identical to
// src/io/io.js at commit cc3903a (the P0 baseline), loaded alongside the current one. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const H = require('./export-helpers.cjs');
const { CASES } = require('../helpers/sample-inputs.cjs');
const { F, FSIO, clone } = H;
const L = F.RESPONSE_CURVE_LABELS;
const CONFIG_SHEET = L.exportSheets.configuration;
const IO100 = require(path.join(__dirname, 'fixtures', 'fs-io-1.0.0.js'));

// P7 (P5-N1): the fixture is pinned by content, so an accidental edit to it cannot make the comparison vacuous.
const IO100_SHA256 = '9b77dc45658f7d633bf6fc0093af0e80f9cfeba4826df6cb80aad9f0985af84e';
test('the fs-io 1.0.0 fixture is byte-identical to the pinned copy (sha256)', () => {
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'fs-io-1.0.0.js'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), IO100_SHA256);
});

test('the comparison module is fs-io 1.0.0 and the current one is 1.1.0', () => {
  assert.equal(IO100.version, 'fs-io 1.0.0');
  assert.equal(FSIO.version, 'fs-io 1.1.0');
});

function assertSameExceptConfiguration(args, label) {
  const oldX = H.sheetXmlByName(IO100.exportWorkbook(clone(args)));
  const newX = H.sheetXmlByName(FSIO.exportWorkbook(clone(args)));
  assert.deepEqual(Object.keys(newX), Object.keys(oldX).concat([CONFIG_SHEET]), `${label}: sheet list`);
  Object.keys(oldX).forEach(n => assert.equal(newX[n], oldX[n], `${label}: sheet "${n}" differs from fs-io 1.0.0`));
}

for (const c of CASES) {
  test(`old draft ${c.id}: every sheet equals fs-io 1.0.0; Configuration says no configuration recorded`, async () => {
    const inputs = H.sampleInputs(c.kind, c.method, H.mods);
    assert.equal(inputs.methodAssumptions.curveProvenance, undefined);
    const args = H.argsOf(H.scenarioOf(inputs));
    assertSameExceptConfiguration(args, c.id);
    const wb = await H.parsed(FSIO.exportWorkbook(clone(args)));
    const rows = wb.by[CONFIG_SHEET].filter(r => r && r.some(v => v !== null && v !== ''));
    assert.deepEqual(rows, [[L.configuratorTitle], [L.noConfiguration]]);
  });
}

test('old draft with edited reference curves (no provenance) still equals fs-io 1.0.0', () => {
  const inputs = H.sampleInputs('single', 'response', H.mods);
  inputs.methodAssumptions.curveParams = { Loyalists: { gamma: 1.7, rho: 14 }, Dabblers: { gamma: 1.25, rho: 4 } };
  assertSameExceptConfiguration(H.argsOf(H.scenarioOf(inputs)), 'edited-reference');
});

test('old draft exported with args.config: Configuration still reads "No configuration recorded" (D-RUN-09)', async () => {
  const inputs = H.sampleInputs('multi', 'response', H.mods);
  const args = H.argsOf(H.scenarioOf(inputs), { config: clone(F.RESPONSE_CURVE_CONFIG) });
  assertSameExceptConfiguration(args, 'old-draft-with-config');
  const wb = await H.parsed(FSIO.exportWorkbook(clone(args)));
  const rows = wb.by[CONFIG_SHEET].filter(r => r && r.some(v => v !== null && v !== ''));
  assert.deepEqual(rows, [[L.configuratorTitle], [L.noConfiguration]]);
});

test('the 1.0.0 fixture is the P0 module (fs-io 1.0.0, no response-curve presets)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, 'fixtures', 'fs-io-1.0.0.js'), 'utf8');
  assert.match(src, /version: 'fs-io 1\.0\.0'/);
  assert.ok(!/RESPONSE_CURVE_LABELS/.test(src));
});

test('AI export of an old draft keeps every 1.0.0 sheet (Configuration after the AI sheets)', () => {
  const inputs = H.sampleInputs('single', 'response', H.mods);
  const sc = H.scenarioOf(inputs);
  sc.ai = { origin: 'ai-candidate', adopted: true };
  const args = H.argsOf(sc, { narratives: [], proposalSets: [] });
  assert.equal(FSIO.isAiExport(args), true);
  assertSameExceptConfiguration(args, 'ai-args');
});
