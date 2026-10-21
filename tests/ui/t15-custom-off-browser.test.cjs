'use strict';
// Codex review on PR #2: an Administrator turning custom curves off makes an existing Custom result stale at once, so it
// cannot be saved without rerunning the assumptions check. Synthetic sample. Skips cleanly without a headless browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const P = require('./p4-helpers.cjs');
const { FSFields: F } = load();
const R = F.RESPONSE_CURVE_LABELS;
const B = P.B;
const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

test('custom curves turned off: a calculated Custom result becomes stale and the assumptions check reports it', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  await P.pick(page, 'rc-0-up', R.custom);
  await page.fill('#rc-note', 'Synthetic marketing-mix study, test run'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  const calc = await P.checkAndCalc(page);
  assert.deepEqual(calc.result.errors, []);
  assert.equal(await page.$('#stale-banner'), null, 'current before the flag changes');
  await P.saveSnapshot(page);   // the demo role switcher lives on Review and Export, which opens once a snapshot exists
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  await page.click('#cfg-flag-allowCustomCurve'); await page.waitForTimeout(150);
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  assert.ok(await page.$('#stale-banner'), 'the Custom result is out of date');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await B.click(page, '#run-assumptions');
  assert.ok((await page.$eval('#c-ascheck', e => e.innerText)).includes(R.customNotAllowed));
  assert.deepEqual(errors, []);
  await page.close();
});
