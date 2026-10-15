'use strict';
// T13 back-compat (P5, I-5): a snapshot without the new curve fields (old draft) exports cell-for-cell as fs-io 1.0.0
// except the added Configuration sheet, which reads the FSFields "No configuration recorded" message. The 1.0.0 module is
// taken from git (commit cc3903a, the P0 baseline) and loaded alongside the current one. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const H = require('./export-helpers.cjs');
const { CASES } = require('../helpers/sample-inputs.cjs');
const { F, FSIO, clone } = H;
const L = F.RESPONSE_CURVE_LABELS;
const CONFIG_SHEET = L.exportSheets.configuration;
const BASE_COMMIT = 'cc3903a';

function loadIo100() {
  const repo = path.join(__dirname, '..', '..');
  const src = execFileSync('git', ['show', `${BASE_COMMIT}:src/io/io.js`], { cwd: repo, encoding: 'utf8' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-io-1.0.0-'));
  const file = path.join(dir, 'io-1.0.0.js');
  fs.writeFileSync(file, src);
  try { return require(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const IO100 = loadIo100();

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

test('old draft exported with args.config: only the Configuration sheet changes', async () => {
  const inputs = H.sampleInputs('multi', 'response', H.mods);
  const args = H.argsOf(H.scenarioOf(inputs), { config: clone(F.RESPONSE_CURVE_CONFIG) });
  assertSameExceptConfiguration(args, 'old-draft-with-config');
  const wb = await H.parsed(FSIO.exportWorkbook(clone(args)));
  assert.equal(H.sectionRows(wb.by[CONFIG_SHEET], L.exportHeadings.curveLibrary).length - 1, 17);
});

test('AI export of an old draft keeps every 1.0.0 sheet (Configuration after the AI sheets)', () => {
  const inputs = H.sampleInputs('single', 'response', H.mods);
  const sc = H.scenarioOf(inputs);
  sc.ai = { origin: 'ai-candidate', adopted: true };
  const args = H.argsOf(sc, { narratives: [], proposalSets: [] });
  assert.equal(FSIO.isAiExport(args), true);
  assertSameExceptConfiguration(args, 'ai-args');
});
