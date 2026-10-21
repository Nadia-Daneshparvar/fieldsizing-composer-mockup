'use strict';
// P4 fix 3 (R-QC #2 minors) in the built page, driven headless:
//   N1 a cloned earlier draft that reproduces its numbers adopts the recalculated result: a save without recalculating stores
//      a result whose inputs hash is the hash of the saved inputs, and the export's "Inputs hash" is that hash.
//   N2/m4 a mix that is short of 100%, or has a negative share, stays a Step 1 inputs error even with a no-default archetype.
//   N4 a rebuilt Custom uptake while custom curves are off: the result is stale and the assumptions check must run again.
//   m12 an edited earlier draft whose inputs do not reproduce its result is stale.
//   m6/m7 an earlier draft that carried preset provenance keeps the preset; one with custom provenance keeps its own note.
// Skips cleanly when no headless browser is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('../io/export-helpers.cjs');
const P = require('./p4-helpers.cjs');
const { F, E } = H;
const R = F.RESPONSE_CURVE_LABELS, C = F.RESPONSE_CURVE_CONFIG;
const B = P.B;
const preset = id => C.presets.find(p => p.id === id);

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const ddTexts = (page, n) => Promise.all(Array.from({ length: n }, (_, i) => P.ddText(page, `rc-${i}-up`)));
async function oldDraft(page, sample, spec) {
  await P.toAssumptions(page, sample, 'response');
  await P.checkAndCalc(page);
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await page.evaluate(sp => { window.__oldDraft = sp; }, spec);
  await B.click(page, '#save-snap', { confirm: false });
  return page.evaluate(() => window.__oldResult);
}
async function captureExport(page) {
  await page.evaluate(() => { const io = window.FSIO, f = io.exportWorkbook; io.exportWorkbook = a => { window.__exportArgs = JSON.parse(JSON.stringify(a)); return f.call(io, a); }; });
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  return { args: await page.evaluate(() => window.__exportArgs), wb: await H.parsed(new Uint8Array(fs.readFileSync(await dl.path()))) };
}
const hashRows = wb => wb.names.flatMap(n => wb.by[n].filter(r => r && r[0] === 'Inputs hash').map(r => r[1]));

for (const [name, spec] of [['edited (Loyalists γ 1.8)', { curveParams: { Loyalists: { gamma: 1.8 } } }], ['unedited', { curveParams: null }], ['unedited with explicit reference values', { curveParams: { Loyalists: { gamma: 1.6, rho: 15 } } }]]) {
  test(`N1: a cloned ${name} earlier draft adopts the recalculated result; saved hash = hash of the saved inputs, also in the export`, { skip }, async () => {
    const { page, errors } = await P.openProbed(browser);
    const old = await oldDraft(page, 'load-sample', spec);
    await B.click(page, '#clone-SC-001', { confirm: false });
    await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
    assert.equal(await page.$('#stale-banner'), null);
    await P.saveSnapshot(page);   // SC-002, saved without recalculating
    const { args, wb } = await captureExport(page);
    const sc = args.scenarios.find(x => x.id === 'SC-002');
    assert.equal(args.focusScenarioId, 'SC-002');
    const fresh = E.calculate(sc.inputs);
    assert.equal(sc.result.inputsHash, fresh.inputsHash, 'stored hash is the hash of the stored inputs');
    assert.deepEqual(sc.result.totals, old.totals, 'same numbers as the earlier draft');
    assert.deepEqual(sc.result.curves, JSON.parse(JSON.stringify(fresh.curves)), 'result.curves match the saved inputs');
    // Trace: the same steps and formulas as for the saved inputs (values to 1e-12: Node and Chromium may differ in the last bit).
    const tr = sc.result.trace, tf = JSON.parse(JSON.stringify(fresh.trace));
    assert.deepEqual(tr.map(x => [x.step, x.formula]), tf.map(x => [x.step, x.formula]), 'trace matches the saved inputs');
    tr.forEach((x, j) => { const y = tf[j].value; assert.ok(x.value === y || Math.abs(x.value - y) <= 1e-12 * Math.max(Math.abs(x.value), Math.abs(y)), `${x.step}`); });
    if (spec.curveParams) assert.notEqual(sc.result.inputsHash, old.inputsHash, 'the earlier hash is not carried over');
    assert.ok(hashRows(wb).includes(fresh.inputsHash), 'export "Inputs hash" is the saved inputs\' hash');
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('m12: an edited earlier draft whose inputs do not reproduce its stored result is stale', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await oldDraft(page, 'load-sample', { curveParams: { Loyalists: { gamma: 1.8 } }, resultCurveParams: { Loyalists: { gamma: 1.8 }, Splitters: { gamma: 2.5 } } });
  await B.click(page, '#clone-SC-001', { confirm: false });
  assert.equal(await P.ddText(page, 'rc-0-up'), R.custom);
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  assert.ok(await page.$('#stale-banner'), 'marked out of date');
  assert.deepEqual(errors, []);
  await page.close();
});

test('m6/m7: an earlier draft with preset provenance keeps the presets; one with custom provenance keeps its own note', { skip }, async () => {
  {
    const { page, errors } = await P.openProbed(browser);
    const curveParams = {}, provenance = {};
    for (const [a, id] of Object.entries(C.defaultAssignment)) { const p = preset(id); curveParams[a] = { delta: p.delta, gamma: p.gamma, rho: p.rho }; provenance[a] = { source: 'preset', presetId: id, label: p.label }; }
    const old = await oldDraft(page, 'load-sample-presets', { curveParams, provenance });
    assert.deepEqual(old.errors, []);
    await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
    await P.pick(page, 'rc-0-up', R.custom);   // change the working draft first
    await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
    await B.click(page, '#clone-SC-001', { confirm: false });
    assert.deepEqual(await ddTexts(page, 3), Object.values(C.defaultAssignment).map(id => preset(id).label));
    assert.equal(await page.$('#rc-note'), null, 'no Custom, no note');
    await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
    assert.equal(await page.$('#stale-banner'), null);
    assert.deepEqual(errors, []);
    await page.close();
  }
  {
    const { page, errors } = await P.openProbed(browser);
    await oldDraft(page, 'load-sample', { curveParams: { Loyalists: { delta: 5, gamma: 1.8, rho: 15 } }, provenance: { Loyalists: { source: 'custom', presetId: null, label: null } }, note: 'Synthetic study note from the earlier draft' });
    await B.click(page, '#clone-SC-001', { confirm: false });
    assert.equal(await P.ddText(page, 'rc-0-up'), R.custom);
    assert.equal(await page.inputValue('#rc-note'), 'Synthetic study note from the earlier draft');
    await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
    assert.equal(await page.$('#stale-banner'), null);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('N4: a rebuilt Custom uptake while custom curves are off is stale and must pass the assumptions check again', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await oldDraft(page, 'load-sample', { curveParams: { Loyalists: { gamma: 1.8 } } });
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  await page.click('#cfg-flag-allowCustomCurve'); await page.waitForTimeout(150);
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await B.click(page, '#clone-SC-001', { confirm: false });
  assert.equal(await P.ddText(page, 'rc-0-up'), R.custom);
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  assert.ok(await page.$('#stale-banner'), 'marked out of date');
  assert.equal(await page.getAttribute('#calc', 'aria-disabled'), 'true', 'the assumptions check is not pre-passed');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await B.click(page, '#run-assumptions');
  assert.ok((await page.$eval('#c-ascheck', e => e.innerText)).includes(R.customNotAllowed));
  assert.deepEqual(errors, []);
  await page.close();
});

test('N2/m4: with a no-default archetype, a mix short of 100% or with a negative share stays a Step 1 inputs error; a full mix passes', { skip }, async () => {
  const cases = [
    ['short of 100%', { Prospects: 20, Trialists: 35, Newcomers: 35 }, false],
    ['negative share', { Prospects: -10, Trialists: 65, Newcomers: 45 }, false],
    ['totals 100%', { Prospects: 20, Trialists: 35, Newcomers: 45 }, true]
  ];
  for (const [label, mix, ok] of cases) {
    const { page, errors } = await P.openProbed(browser, { presetMixes: { 0: mix } });
    await B.click(page, '#load-sample-presets');
    await B.click(page, '#method-response');
    await B.click(page, '#run-inputs');
    const txt = await page.$eval('#c-incheck', e => e.innerText);
    if (ok) assert.ok(await page.$('#go-assumptions'), `${label}: inputs check passes\n${txt}`);
    else {
      assert.equal(await page.$('#go-assumptions'), null, `${label}: inputs check fails`);
      assert.match(txt, /must total 100%/, `${label}: the mix total is reported on Step 1`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});
