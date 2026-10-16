'use strict';
// P4 fix 2 (R-QC #1) in the built page, driven headless:
//   F1 an earlier draft saved without an uptake (injected in the old snapshot shape) clones with its curves rebuilt so it
//      recalculates exactly as stored: unedited curves stay on the reference path, an edited curve (Loyalists γ 1.8) becomes
//      Custom with the FSFields carry-over note; a draft whose inputs do not reproduce its result is marked stale.
//   F5 the Scenario Summary states the reference curves (or the edited curve) for such a draft, and Custom with the note after.
//   F2 a blank Custom δ is reported like γ and ρ.
//   F3 Custom while custom curves are off is an issue (m16); an archetype with no default uptake does not block the Step 1
//      inputs check and is asked for on Step 2 (m17); a hidden preset is not offered on fresh rows but stays on a row using it.
// Skips cleanly when no headless browser is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const P = require('./p4-helpers.cjs');
const { FSFields: F, FSEngine: E } = load();
const R = F.RESPONSE_CURVE_LABELS, V = R.validation, C = F.RESPONSE_CURVE_CONFIG;
const B = P.B;
const presetLabel = id => C.presets.find(p => p.id === id).label;
const REF = Object.keys(E.ARCHETYPES);

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const ddTexts = (page, n) => Promise.all(Array.from({ length: n }, (_, i) => P.ddText(page, `rc-${i}-up`)));
const options = async (page, id) => { await page.click(`#${id}`); await page.waitForTimeout(80); const o = await page.$$eval(`#${id}-lb [role=option]`, x => x.map(e => e.textContent.trim())); await page.keyboard.press('Escape'); await page.waitForTimeout(60); return o; };
const issues = page => page.$eval('#c-ascheck', e => e.innerText);
const summaryCells = async page => (await page.$$eval('#cmp-main tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.innerText.trim())))).find(r => r[0] === R.summaryHeading);
async function forceAct(page, act) {
  await page.evaluate(a => { const b = document.createElement('button'); b.type = 'button'; b.id = `forced-${a}`; b.dataset.act = a; document.getElementById('main').appendChild(b); }, act);
  await B.click(page, `#forced-${act}`);
}
/* Single sample, Response Curve, calculated; the next snapshot is saved in the earlier draft shape given by spec. */
async function oldDraft(page, spec) {
  await P.toAssumptions(page, 'load-sample', 'response');
  await P.checkAndCalc(page);
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await page.evaluate(sp => { window.__oldDraft = sp; }, spec);
  await B.click(page, '#save-snap', { confirm: false });
  return page.evaluate(() => window.__oldResult);
}

test('F1/F5: an edited earlier draft (Loyalists γ 1.8) clones as Custom with the carry-over note and recalculates exactly as stored', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  const old = await oldDraft(page, { curveParams: { Loyalists: { gamma: 1.8 } } });
  assert.deepEqual(old.errors, []);
  assert.notEqual(old.totals.rawFte, BASE.cases['single-response'].outputs.totals.rawFte, 'the edit changes the result');
  // F5: the earlier draft states how each archetype got its curve, and has no configuration version.
  assert.deepEqual((await summaryCells(page))[1].split('\n'), REF.map(a => R.curveLegendPreset(a, a === 'Loyalists' ? R.editedCurve : R.referenceCurve)));
  await B.click(page, '#va-SC-001', { confirm: false });
  const va = await page.$$eval('#dlg .all-asm table', ts => { const t = ts.find(x => x.querySelector('thead') && /Shape/.test(x.querySelector('thead').textContent)); return [...t.tBodies[0].rows].map(r => [...r.cells].map(c => c.textContent.trim())); });
  assert.deepEqual(va[0], ['Loyalists', R.editedCurve, '5', '1.8', '15', Math.pow(15, 1 / 1.8).toFixed(2)]);
  assert.equal(va[1][1], R.referenceCurve);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // Change the working draft, then clone the earlier draft back.
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await P.pick(page, 'rc-1-up', presetLabel('steep'));
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await B.click(page, '#clone-SC-001', { confirm: false });
  assert.deepEqual(await ddTexts(page, 4), [R.custom, R.chooseUptake, R.chooseUptake, R.chooseUptake]);
  assert.deepEqual(await Promise.all(['delta', 'gamma', 'rho'].map(k => page.inputValue(`#rc-0-${k}`))), ['5', '1.8', '15']);
  assert.equal(await page.inputValue('#rc-note'), R.carriedOverNote);
  // The restored result is current (its inputs reproduce it) and Recalculate gives exactly the stored result.
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  assert.equal(await page.$('#stale-banner'), null);
  const re = await P.calcNow(page);
  assert.deepEqual(re.result.errors, []);
  assert.deepEqual([re.result.totals, re.result.segments.map(x => [x.rawFte, x.totalCalls, x.reached])], [old.totals, old.segments.map(x => [x.rawFte, x.totalCalls, x.reached])]);
  assert.deepEqual(re.inputs.methodAssumptions.curveParams, { Loyalists: { delta: 5, gamma: 1.8, rho: 15 } });
  assert.deepEqual(re.inputs.methodAssumptions.curveProvenance, { Loyalists: { source: 'custom', presetId: null, label: null } });
  assert.equal(re.inputs.methodAssumptions.customSourceNote, R.carriedOverNote);
  // F5: the new snapshot shows Custom with the carry-over note for Loyalists and the reference curve for the others.
  await P.saveSnapshot(page);
  assert.deepEqual((await summaryCells(page))[2].split('\n'), REF.map(a => R.curveLegendPreset(a, a === 'Loyalists' ? R.customWithNote(R.carriedOverNote) : R.referenceCurve)).concat(R.configVersionText(C.version)));
  assert.deepEqual(errors, []);
  await page.close();
});

test('F1: an unedited earlier draft (no curves, or reference values) clones with no uptake, no extra audit, and recalculates identically', { skip }, async () => {
  for (const spec of [{ curveParams: null }, { curveParams: { Loyalists: { gamma: 1.6, rho: 15 }, Dabblers: { delta: 5, gamma: 1.2, rho: 4.5 } } }]) {
    const { page, errors } = await P.openProbed(browser);
    const old = await oldDraft(page, spec);
    assert.equal(old.totals.rawFte, BASE.cases['single-response'].outputs.totals.rawFte, 'reference curves');
    const before = (await P.auditRows(page)).length;
    await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
    await B.click(page, '#clone-SC-001', { confirm: false });
    assert.deepEqual(await ddTexts(page, 4), Array(4).fill(R.chooseUptake));
    assert.equal(await page.$('[data-rc-param]'), null, 'no Custom rows');
    assert.equal(await page.$('#rc-note'), null, 'no source note');
    await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
    assert.equal(await page.$('#stale-banner'), null);
    const re = await P.calcNow(page);
    assert.deepEqual(re.result.totals, old.totals);
    assert.equal(re.inputs.methodAssumptions.curveParams, undefined, 'old-shape path: no curves sent');
    const rows = await P.auditRows(page);
    assert.deepEqual(rows.slice(0, rows.length - before).map(r => r[3]).sort(), ['Calculated', 'Cloned'].sort(), 'only the clone and the calculation');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('F1: an earlier draft whose inputs do not reproduce its stored result is restored as stale', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await oldDraft(page, { curveParams: null, resultCurveParams: { Splitters: { gamma: 2.5 } } });
  await B.click(page, '#clone-SC-001', { confirm: false });
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  assert.ok(await page.$('#stale-banner'), 'marked out of date');
  assert.deepEqual(errors, []);
  await page.close();
});

test('F2: a blank Custom δ is reported like γ and ρ (no silent δ = 5)', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  await P.pick(page, 'rc-0-up', R.custom);
  await page.fill('#rc-note', 'Synthetic note'); await page.keyboard.press('Tab'); await page.waitForTimeout(120);
  await page.fill('#rc-0-delta', ''); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  const msg = V['custom-curve-invalid']('Prospects', R.delta);
  assert.equal(await page.getAttribute('#rc-0-delta', 'aria-invalid'), 'true');
  assert.ok((await P.text(page, '#rc-errors')).includes(msg));
  await B.click(page, '#run-assumptions');
  assert.ok((await issues(page)).includes(msg));
  assert.equal(await page.getAttribute('[data-act="nav"][data-arg="result"]', 'aria-disabled'), 'true');
  await page.fill('#rc-0-delta', '5'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await page.$('#rc-errors'), null);
  assert.deepEqual(errors, []);
  await page.close();
});

test('F3: configuration rules in the analyst picker: hidden preset (m-hidden), custom curves off (m16), archetype with no default (m17)', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await B.walkToReview(page);
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.click('#cfg-tab-defaultAssignment'); await page.waitForTimeout(120);
  await page.selectOption('#cfg-da-0', 'baseline'); await page.waitForTimeout(150);   // Prospects → Baseline
  await page.click('#cfg-da-2-rm'); await page.waitForTimeout(150);                    // Early Leaders: no default
  await page.click('#cfg-tab-presets'); await page.waitForTimeout(120);
  await page.click('#cfg-p-3-pickerVisible'); await page.waitForTimeout(150);          // Baseline hidden from the picker
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  await page.click('#cfg-flag-allowCustomCurve'); await page.waitForTimeout(150);      // custom curves off
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');

  // m17: Early Leaders has no uptake; the Step 1 inputs check still passes and Step 2 asks for it.
  await forceAct(page, 'loadSamplePresets');
  await B.click(page, '[data-act="nav"][data-arg="setup"]', { confirm: false });
  await B.click(page, '#method-response');
  await B.click(page, '#run-inputs');
  assert.ok(await page.$('#go-assumptions'), 'inputs check passed');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
  assert.deepEqual(await ddTexts(page, 3), [presetLabel('baseline'), presetLabel('moderate'), R.chooseUptake]);
  // Hidden preset: still offered on the row using it, not on the others; Custom not offered (flag off).
  const visible = C.presets.filter(p => p.id !== 'baseline').map(p => p.label);
  assert.deepEqual(await options(page, 'rc-0-up'), visible.concat(presetLabel('baseline')));
  assert.deepEqual(await options(page, 'rc-1-up'), visible);
  assert.deepEqual(await options(page, 'rc-2-up'), visible);
  await B.click(page, '#run-assumptions');
  const iss = await issues(page);
  assert.ok(iss.includes(V.unassigned('Early Leaders')));
  assert.ok(!/Unknown curve archetype/.test(iss), 'the engine\'s unknown-archetype is not listed again');
  assert.ok(!/must total 100%/.test(iss), 'nor the mix total that follows from the missing uptake');
  assert.equal((await page.$$('#c-ascheck ul.issues > li')).length, 1, 'one item: choose an uptake for Early Leaders');

  // m16: the single sample's Custom rows while custom curves are off.
  await forceAct(page, 'loadSample');
  await B.click(page, '[data-act="nav"][data-arg="setup"]', { confirm: false });
  await B.click(page, '#method-response');
  await B.click(page, '#run-inputs');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
  assert.deepEqual(await ddTexts(page, 4), Array(4).fill(R.custom));
  assert.deepEqual(await options(page, 'rc-0-up'), visible.concat(R.custom), 'Custom stays on a row already using it');
  await B.click(page, '#run-assumptions');
  const iss2 = await issues(page);
  assert.equal(iss2.split(R.customNotAllowed).length - 1, 4, 'one issue per Custom row');
  assert.equal(await page.$('#go-result'), null, 'the assumptions check does not pass');
  assert.deepEqual(errors, []);
  await page.close();
});
