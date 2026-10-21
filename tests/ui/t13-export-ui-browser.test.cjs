'use strict';
// P4 T13 at the UI (FR-48, proposed): after the P4 snapshot and doExport changes, the workbook exported from the page for the
// uptake presets sample shows the same uptake per archetype, the same δ/γ/ρ and the same Recommended FTE as the UI, and its
// Configuration sheet is the project's configuration. The bytes are the real download; FSIO.parseFile reads them back.
// Skips cleanly when no headless browser is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('../io/export-helpers.cjs');
const P = require('./p4-helpers.cjs');
const { F } = H;
const R = F.RESPONSE_CURVE_LABELS, K = R.exportColumns, HD = R.exportHeadings, C = F.RESPONSE_CURVE_CONFIG;
const B = P.B;

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function exportBytes(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  return new Uint8Array(fs.readFileSync(await dl.path()));
}

test('T13 (UI): the exported workbook matches the page: uptake per archetype, δ/γ/ρ, Recommended FTE and the configuration', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  // One archetype on Custom (with a note) so both provenance kinds are exported.
  await P.pick(page, 'rc-2-up', R.custom);
  for (const [k, v] of [['gamma', '0.9'], ['rho', '2']]) { await page.fill(`#rc-2-${k}`, v); await page.keyboard.press('Tab'); await page.waitForTimeout(120); }
  await page.fill('#rc-note', 'Synthetic marketing-mix study for the export test'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  await page.click('#rc-adv-btn'); await page.waitForTimeout(120);
  // What the UI shows.
  const ui = await page.$$eval('#rc-adv-table tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const calc = await P.checkAndCalc(page);
  assert.deepEqual(calc.result.errors, []);
  const fte = Number(await page.$eval('#main', e => (e.innerText.match(/Recommended FTE\s*\n\s*([\d,.]+)/) || [])[1]));
  await P.saveSnapshot(page);
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  const wb = await H.parsed(await exportBytes(page));

  // Assumptions: the uptake-by-archetype table equals the UI rows (archetype, uptake, δ/γ/ρ) and the Custom note.
  const asg = H.sectionRows(wb.by.Assumptions, HD.assignment);
  assert.deepEqual(asg[0], [K.archetype, K.uptake, K.delta, K.gamma, K.rho, K.sourceNote]);
  assert.deepEqual(asg.slice(1).map(r => [r[0], r[1], String(r[2]), String(r[3]), String(r[4])]), ui.map(r => r.slice(0, 5)));
  assert.equal(asg[3][5], 'Synthetic marketing-mix study for the export test');
  assert.deepEqual(ui.map(r => r[1]), [C.presets[0].label, C.presets[1].label, R.custom]);
  // Response Curves: effective values with provenance, the same numbers.
  const all = H.sectionRows(wb.by['Response Curves'], HD.effectiveCurves).slice(1), eff = all.filter(r => r[0] !== K.sourceNote);
  assert.deepEqual(eff.map(r => [r[0], String(r[4]), String(r[5]), String(r[6])]), ui.map(r => [r[0], r[2], r[3], r[4]]));
  assert.deepEqual(eff.map(r => r[2]), [R.sourceLabel.preset, R.sourceLabel.preset, R.exportCustomSource]);   // P7 (P5-F5)
  assert.deepEqual(all.find(r => r[0] === K.sourceNote), [K.sourceNote, 'Synthetic marketing-mix study for the export test']);
  // Recommended FTE: the UI's.
  const rec = wb.by['Scenario Summary'].find(r => r && r[0] === F.RESULT_LABELS.recommendedFte());
  assert.equal(rec[1], fte);
  assert.equal(rec[1], calc.result.totals.recommendedFte);
  // Configuration: the project's configuration (version 1, never changed, the default assignment and the flags).
  const conf = wb.by[R.exportSheets.configuration];
  assert.deepEqual(H.sectionRows(conf, K.field), [[R.configVersion, C.version], [R.updatedBy, R.neverUpdated], [R.updatedAt, R.neverUpdated]]);
  assert.deepEqual(H.sectionRows(conf, HD.defaultAssignment).slice(1).map(r => r[0]), Object.keys(C.defaultAssignment));
  assert.equal(H.sectionRows(conf, HD.presets).length - 1, C.presets.length);
  assert.deepEqual(errors, []);
  await page.close();
});

test('T13 (UI): each snapshot keeps the configuration it was calculated with; an Administrator edit reaches the next snapshot and its export', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  await P.checkAndCalc(page);
  await P.saveSnapshot(page);   // SC-001 with configuration version 1
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.fill('#cfg-p-0-rho', '12'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);   // Slow uptake ρ 11 → 12: version 2
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');
  const calc = await P.checkAndCalc(page);
  assert.equal(calc.inputs.methodAssumptions.curveParams.Prospects.rho, 12, 'the edited preset value is what the engine receives');
  assert.equal(calc.inputs.methodAssumptions.curveProvenance.Prospects.presetId, 'slow');
  await P.saveSnapshot(page);   // SC-002 with configuration version 2
  const up = (await page.$$eval('#cmp-main tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.innerText.trim())))).find(r => r[0] === R.summaryHeading);
  assert.ok(up[1].endsWith(R.configVersionText(1)) && up[2].endsWith(R.configVersionText(2)), 'version per snapshot in the Scenario Summary');
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  // m5 (fix 2): doExport passes the project's configuration as args.config (the export's fallback for older snapshots).
  await page.evaluate(() => { const io = window.FSIO, f = io.exportWorkbook; io.exportWorkbook = a => { window.__exportArgs = JSON.parse(JSON.stringify(a)); return f.call(io, a); }; });
  const wb = await H.parsed(await exportBytes(page));   // focus: the latest snapshot (none is recommended)
  const args = await page.evaluate(() => window.__exportArgs);
  assert.ok(args && args.config, 'args.config present');
  assert.equal(args.config.version, 2);
  assert.equal(args.config.presets[0].rho, 12);
  assert.notEqual(args.config.updatedBy, null, 'stamped by the Administrator');
  assert.deepEqual(args.config, args.scenarios[1].responseCurveConfig, 'equals the configuration the latest snapshot saved');
  assert.equal(args.scenarios[0].responseCurveConfig.version, 1, 'the first snapshot keeps its own');
  const conf = wb.by[R.exportSheets.configuration];
  assert.equal(H.sectionRows(conf, K.field)[0][1], 2, 'configuration version 2 exported');
  assert.equal(H.sectionRows(conf, HD.presets)[1][5], 12);
  const asg = H.sectionRows(wb.by.Assumptions, HD.assignment);
  assert.deepEqual(asg[1].slice(0, 5), ['Prospects', C.presets[0].label, 5, C.presets[0].gamma, 12]);
  assert.deepEqual(errors, []);
  await page.close();
});
