'use strict';
// P3 review items carried into P4 (configurator.js): m1 the tab panel is not a tab stop with a hidden focus ring; m2 the wide
// configurator tables scroll in a focusable, labelled region (the audit-table pattern, label from FSFields); m4 the
// configurator dialog fits the viewport at 320, 375 and 1280 px on every tab (WCAG 1.4.10 reflow: no page-level horizontal
// scroll, the dialog inside the viewport, and only a labelled table region may scroll sideways inside the body).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const B = require('./browser.cjs');
const { FSFields: F } = load();
const R = F.RESPONSE_CURVE_LABELS;

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const TABS = ['presets', 'defaultAssignment', 'curveLibrary', 'flags'];

test('m1/m2: the configurator tab panel is not a tab stop; wide tables are focusable regions labelled from FSFields', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('#cfg-panel', 'tabindex'), null, 'm1: no tabindex on the panel');
  // From the selected tab, Tab goes straight into the panel's first control (not the panel itself).
  await page.keyboard.press('Tab'); await page.waitForTimeout(60);
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'cfg-panel');
  assert.ok(await page.evaluate(() => document.getElementById('cfg-panel').contains(document.activeElement)));
  for (const [tab, label] of [['defaultAssignment', R.tabs.defaultAssignment], ['curveLibrary', R.referenceLibrary]]) {
    await page.click(`#cfg-tab-${tab}`); await page.waitForTimeout(120);
    const wrap = await page.$eval('#cfg-panel table', t => { const w = t.closest('.grid-wrap'); return { tabindex: w.getAttribute('tabindex'), role: w.getAttribute('role'), label: w.getAttribute('aria-label') }; });
    assert.deepEqual(wrap, { tabindex: '0', role: 'region', label }, tab);
    await page.focus('#cfg-panel .grid-wrap'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(60);
    assert.notEqual(await page.$eval('#cfg-panel .grid-wrap', e => getComputedStyle(e).boxShadow), 'none', `${tab}: visible focus on the region`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('m4 (WCAG 1.4.10): the configurator dialog fits at 320, 375 and 1280 px on every tab', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);
  await B.setRole(page, 'admin');
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 720 }); await page.waitForTimeout(120);
    await page.click('#open-config'); await page.waitForTimeout(150);
    for (const tab of TABS) {
      const tag = `${tab} @ ${width}px`;
      await page.click(`#cfg-tab-${tab}`); await page.waitForTimeout(120);
      const m = await page.evaluate(() => {
        const dlg = document.getElementById('dlg'), body = dlg.querySelector('.dlg-body'), r = dlg.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        // Elements wider than the body that are not inside a scrolling table region.
        const over = [...body.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 0.5 || b.left < r.left - 0.5) && !e.closest('.grid-wrap'); }).map(e => e.id || e.tagName);
        return { vw, sw: document.documentElement.scrollWidth, l: r.left, r: r.right, bodyOverflow: body.scrollWidth - body.clientWidth, over: over.slice(0, 5) };
      });
      assert.ok(m.sw <= m.vw, `${tag}: no page-level horizontal scroll (${m.sw} > ${m.vw})`);
      assert.ok(m.l >= 0 && m.r <= m.vw, `${tag}: dialog inside the viewport ${JSON.stringify(m)}`);
      assert.ok(m.bodyOverflow <= 1, `${tag}: dialog body does not scroll sideways (${m.bodyOverflow}px)`);
      assert.deepEqual(m.over, [], `${tag}: nothing outside the dialog except inside a table region`);
    }
    await page.click('#cfg-close'); await page.waitForTimeout(120);
  }
  assert.deepEqual(errors, []);
  await page.close();
});
