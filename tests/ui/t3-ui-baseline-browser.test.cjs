'use strict';
// P4 T3 at the UI: the two existing synthetic samples, loaded and calculated in the built page, give the same results as the
// fs-engine 1.10.0 baseline for the six summary cases (sample × method), ±1e-9 relative on the comparable outputs. They now
// run with explicit D6 Custom curves (the four reference archetypes, the reference values, the synthetic source note),
// which the probe confirms from the inputs the UI actually sent. Skips cleanly when no headless browser is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { comparable } = require('../helpers/sample-inputs.cjs');
const BASE = require('../fixtures/baseline-fs-engine-1.10.0.json');
const P = require('./p4-helpers.cjs');
const { FSEngine: E, FSSample: S } = load();

const skip = P.B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await P.B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

function assertClose(got, want, where) {
  if (typeof want === 'number' && typeof got === 'number') {
    assert.ok(got === want || Math.abs(got - want) <= 1e-9 * Math.max(Math.abs(want), Math.abs(got)), `${where}: ${got} vs ${want}`);
  } else if (want && typeof want === 'object') {
    assert.equal(typeof got, 'object', `${where}: type`);
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${where}: keys`);
    for (const k of Object.keys(want)) assertClose(got[k], want[k], `${where}.${k}`);
  } else assert.equal(got, want, where);
}

const CASES = [['single', 'load-sample'], ['multi', 'load-sample-multi']].flatMap(([kind, btn]) => ['affordable', 'response', 'workload'].map(m => ({ id: `${kind}-${m}`, btn, method: m })));

for (const c of CASES) {
  test(`T3 (UI): ${c.id} calculated in the page reproduces the 1.10.0 baseline outputs`, { skip }, async t => {
    const { page, errors } = await P.openProbed(browser);
    await P.toAssumptions(page, c.btn, c.method);
    const calc = await P.checkAndCalc(page);
    assert.ok(calc, 'the UI ran the engine');
    t.diagnostic(`${c.id}: inputsHash baseline ${BASE.cases[c.id].inputsHash}, UI ${calc.result.inputsHash}`);
    assert.deepEqual(calc.result.errors, []);
    assertClose(comparable(calc.result), BASE.cases[c.id].outputs, c.id);
    const ma = calc.inputs.methodAssumptions;
    if (c.method === 'response') {
      // D6: explicit Custom curves for the four reference archetypes, with today's values and the synthetic note.
      const seed = S.responseCurveSeed(c.id.startsWith('multi') ? 'multi' : 'single');
      assert.deepEqual(Object.keys(ma.curveParams), Object.keys(E.ARCHETYPES));
      for (const [n, a] of Object.entries(E.ARCHETYPES)) {
        assert.deepEqual(ma.curveParams[n], { delta: a.delta, gamma: a.gamma, rho: a.rho }, n);
        assert.deepEqual(ma.curveProvenance[n], { source: 'custom', presetId: null, label: null }, n);
      }
      assert.equal(ma.customSourceNote, seed.customSourceNote);
      assert.ok(Object.values(calc.result.curves).every(x => x.source === 'custom'));
    } else {
      assert.equal(ma.curveParams, undefined, 'no curves outside Response Curve');
      assert.equal(ma.curveProvenance, undefined);
    }
    // The page shows the same Recommended FTE.
    const shown = await page.$eval('#main', e => (e.innerText.match(/Recommended FTE\s*\n\s*([\d,.]+)/) || [])[1]);
    assert.equal(Number(String(shown).replace(/,/g, '')), BASE.cases[c.id].outputs.totals.recommendedFte);
    assert.deepEqual(errors, []);
    await page.close();
  });
}
