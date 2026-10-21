'use strict';
// P3 T7 (role gating) and T8 (configurator audit) in the built page, driven headless (same browser setup as QC Q8).
// T12 basics for the new controls: keyboard tablist, focus return to the header button, FR-46 (proposed) tag.
// Skips cleanly when no headless browser is configured; the controller runs it with one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const B = require('./browser.cjs');
const { FSFields: F, FSSample: SAMPLE } = load();
const R = F.RESPONSE_CURVE_LABELS;
const ROLE = F.ROLE_LABELS;

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const activeId = page => page.evaluate(() => document.activeElement && document.activeElement.id);
const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const meta = page => text(page, '#cfg-meta');
/* Clicks a control the current role does not have, as if invoked anyway: the app must refuse it. */
async function forceOpen(page) {
  await page.evaluate(() => { const b = document.createElement('button'); b.type = 'button'; b.id = 'forced-open'; b.dataset.act = 'openConfig'; document.getElementById('main').appendChild(b); });
  await page.click('#forced-open'); await page.waitForTimeout(120);
}
async function auditRows(page) {
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  await B.click(page, '#tab-audit', { confirm: false });
  return page.$$eval('.audit-t tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
}

test('T7: only the Administrator has the configurator; Analyst and Lead cannot open it; Admin stays read-only and cannot approve', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);   // a scenario in review, so approval rights are observable
  for (const role of ['analyst', 'lead']) {
    await B.setRole(page, role);
    assert.equal(await page.$('#open-config'), null, `${role}: no header entry`);
    await forceOpen(page);
    assert.equal(await page.$('#dlg'), null, `${role}: open refused`);
    assert.ok((await page.$$eval('.toast-txt', t => t.map(x => x.textContent))).includes(R.configuratorAdminOnly), `${role}: told why`);
  }
  await B.setRole(page, 'admin');
  assert.ok(await page.$('#open-config'), 'admin: header entry');
  assert.equal(await text(page, '#open-config'), R.configuratorOpen);
  assert.equal(await page.getAttribute('#rv-approve', 'aria-disabled'), 'true', 'admin cannot approve');
  await page.$eval('#rv-approve', e => e.click()); await page.waitForTimeout(120);   // invoked anyway
  assert.equal(await page.$('#dlg'), null, 'no approval dialog for admin');
  await B.click(page, '[data-act="nav"][data-arg="setup"]', { confirm: false });
  assert.equal(await page.$eval('#p-name', e => e.disabled), true, 'admin cannot edit project inputs');
  assert.equal(await page.getAttribute('#method-response', 'aria-disabled'), 'true');

  // Admin opens it from the header (on any page) and can edit it.
  await page.click('#open-config'); await page.waitForTimeout(150);
  assert.ok(await page.$('#dlg[role="dialog"][aria-modal="true"]'));
  assert.ok((await text(page, '#dlg-title')).startsWith(R.configuratorTitle));
  assert.equal(await activeId(page), 'cfg-tab-presets', 'focus starts on the selected tab');
  assert.deepEqual(await page.$$eval('#dlg [role="tab"]', t => t.map(x => x.textContent.trim())), ['presets', 'defaultAssignment', 'curveLibrary', 'flags'].map(k => R.tabs[k]));
  assert.equal(await page.$eval('#cfg-p-0-gamma', e => e.disabled), false, 'admin can edit inside the configurator');
  // Keyboard-operable tablist (arrow keys, Home, End).
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
  assert.equal(await activeId(page), 'cfg-tab-defaultAssignment');
  assert.equal(await page.getAttribute('#cfg-tab-defaultAssignment', 'aria-selected'), 'true');
  await page.keyboard.press('End'); await page.waitForTimeout(120);
  assert.equal(await activeId(page), 'cfg-tab-flags');
  await page.keyboard.press('Home'); await page.waitForTimeout(120);
  assert.equal(await activeId(page), 'cfg-tab-presets');
  // Escape closes and focus returns to the header button.
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  assert.equal(await page.$('#dlg'), null);
  assert.equal(await activeId(page), 'open-config');
  // Back to Analyst: the entry is gone again.
  await B.setRole(page, 'analyst');
  assert.equal(await page.$('#open-config'), null);
  assert.deepEqual(errors, []);
  await page.close();
});

test('T8: exactly one audit row per saved edit (old → new), version +1 per saved edit, reset restores the reference presets, config persists across sample loads', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);
  await B.setRole(page, 'admin');
  const admin = await page.$eval('.avatar', e => e.getAttribute('aria-label'));
  await page.click('#open-config'); await page.waitForTimeout(150);
  assert.ok((await meta(page)).startsWith(R.configVersionText(1)));
  assert.ok((await meta(page)).includes(R.neverUpdated));

  // Valid edit: saved on commit (Tab), focus moves on, version 2.
  await page.fill('#cfg-p-0-gamma', '1.7'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await activeId(page), 'cfg-p-0-rho', 'Tab still moves focus after a save');
  assert.ok((await meta(page)).startsWith(R.configVersionText(2)));
  assert.ok(admin.includes((await meta(page)).split(`${R.updatedBy}: `)[1].split(' · ')[0]), 'updatedBy = current user');
  assert.equal(await text(page, '#cfg-p-0 legend .chip'), R.origin.client);
  // Invalid edit: inline error, nothing saved.
  await page.fill('#cfg-p-1-rho', '0'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await text(page, '#cfg-p-1-rho-hint'), R.presetValueInvalid(R.rho));
  assert.equal(await page.getAttribute('#cfg-p-1-rho', 'aria-invalid'), 'true');
  assert.ok((await meta(page)).startsWith(R.configVersionText(2)));
  await page.fill('#cfg-p-1-label', ''); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await text(page, '#cfg-p-1-label-hint'), R.presetLabelRequired);
  // Re-entering the stored values clears the errors and is not an edit.
  await page.fill('#cfg-p-1-rho', '3.5'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  await page.fill('#cfg-p-1-label', 'Moderate uptake'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await page.$('#cfg-p-1-rho[aria-invalid]'), null);
  assert.ok((await meta(page)).startsWith(R.configVersionText(2)));

  // Reset to Beghou reference: §5 values exactly, version 3.
  await page.click('#cfg-reset'); await page.waitForTimeout(150);
  const vals = await page.$$eval('#dlg fieldset', fs => fs.map(f => ['label', 'delta', 'gamma', 'rho'].map(k => f.querySelector(`[id$="-${k}"]`).value)));
  assert.deepEqual(vals, F.REFERENCE_PRESETS.map(p => [p.label, String(p.delta), String(p.gamma), String(p.rho)]));
  assert.ok((await meta(page)).startsWith(R.configVersionText(3)));
  assert.equal(await text(page, '#cfg-p-0 legend .chip'), R.origin['beghou-reference']);

  // Curve library: copy step "Base" into Moderate uptake, version 4.
  await page.click('#cfg-tab-curveLibrary'); await page.waitForTimeout(120);
  assert.equal((await page.$$('[data-arg^="copyOpen:"]')).length, 17);
  await page.click('#cfg-lib-8'); await page.waitForTimeout(120);
  assert.equal(await page.getAttribute('#cfg-lib-8', 'aria-expanded'), 'true');
  await page.click('#cfg-lib-8-to-1'); await page.waitForTimeout(150);
  assert.ok((await meta(page)).startsWith(R.configVersionText(4)));

  // Default assignment: change one, add one (versions 5, 6).
  await page.click('#cfg-tab-defaultAssignment'); await page.waitForTimeout(120);
  await page.selectOption('#cfg-da-0', 'custom'); await page.waitForTimeout(150);
  // F2/F3: reserved and prototype names are refused inline; nothing is written.
  for (const n of ['all', 'Custom', '__proto__', 'constructor']) {
    await page.fill('#cfg-new-name', n); await page.click('#cfg-add'); await page.waitForTimeout(120);
    assert.equal(await text(page, '#cfg-new-name-hint'), R.archetypeNameReserved, n);
    assert.ok((await meta(page)).startsWith(R.configVersionText(5)), n);
  }
  await page.fill('#cfg-new-name', 'Newcomers'); await page.click('#cfg-add'); await page.waitForTimeout(150);
  assert.ok((await page.$$eval('#dlg tbody th', t => t.map(x => x.textContent))).includes('Newcomers'));
  assert.ok((await meta(page)).startsWith(R.configVersionText(6)));
  // Flags: value-only on (version 7).
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  assert.equal(await page.$eval('#cfg-flag-allowValueOnlyResponse', e => e.checked), false, 'off by default');
  await page.click('#cfg-flag-allowValueOnlyResponse'); await page.waitForTimeout(150);
  assert.ok((await meta(page)).startsWith(R.configVersionText(7)));
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  assert.equal(await activeId(page), 'open-config', 'focus returns to the header button');

  const rows = (await auditRows(page)).filter(r => r[3] === R.configuratorTitle);
  const da = R.tabs.defaultAssignment;
  const want = [
    R.audit.configEdit(`Slow uptake · ${R.gamma}`, '1.5', '1.7'),
    R.audit.configEdit(`Slow uptake · ${R.gamma}`, '1.7', '1.5'),
    R.audit.configEdit(R.audit.libraryCopy('Base', 'Moderate uptake'), `${R.delta} 5, ${R.gamma} 1.1, ${R.rho} 3.5`, `${R.delta} 5, ${R.gamma} 1, ${R.rho} 3`),
    R.audit.configEdit(`${da} · Prospects`, 'Slow uptake', R.custom),
    R.audit.configEdit(`${da} · Newcomers`, R.audit.blank, 'Slow uptake'),
    R.audit.configEdit(R.flagLabels.allowValueOnlyResponse, R.flagState.false, R.flagState.true)
  ];
  assert.deepEqual(rows.map(r => r[5]).sort(), want.slice().sort(), 'exactly one row per saved edit (origin is derived, never audited), none for invalid or reserved input');
  assert.ok(!rows.some(r => r[5].includes(R.originLabel)), 'no Origin rows');
  rows.forEach(r => assert.equal(r[2], ROLE.admin));

  // The configuration belongs to the project: loading a sample does not reset it.
  await B.setRole(page, 'analyst');
  // The load buttons only show on an empty project, so the sample loaders are invoked directly (both kinds).
  for (const act of ['loadSample', 'loadSamplePresets']) {
    await page.evaluate(a => { const b = document.createElement('button'); b.type = 'button'; b.id = `forced-${a}`; b.dataset.act = a; document.getElementById('main').appendChild(b); }, act);
    await B.click(page, `#forced-${act}`);
  }
  assert.ok((await auditRows(page)).some(r => r[5] === R.samplePresetsAudit(SAMPLE.presetSample.archetypes.length)), 'the presets sample really loaded');
  await B.setRole(page, 'admin');
  await B.click(page, '#show-req', { confirm: false });
  await page.click('#open-config'); await page.waitForTimeout(150);
  assert.ok((await meta(page)).startsWith(R.configVersionText(7)));
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  assert.equal(await page.$eval('#cfg-flag-allowValueOnlyResponse', e => e.checked), true);
  // "Show requirement IDs" on: the configurator heading shows FR-46 (proposed).
  assert.equal(await page.$eval('#dlg-title .req', e => getComputedStyle(e).display !== 'none' && e.textContent.trim()), 'FR-46 (proposed)');
  assert.deepEqual(errors, []);
  await page.close();
});

test('F9: a non-admin cannot edit through an injected cfg action or a data-cfg change event', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);
  for (const role of ['analyst', 'lead']) {
    await B.setRole(page, role);
    await page.evaluate(() => {
      const main = document.getElementById('main');
      const b = document.createElement('button'); b.type = 'button'; b.id = 'forced-cfg'; b.dataset.act = 'cfg'; b.dataset.arg = 'flag:allowValueOnlyResponse'; main.appendChild(b);
      const c = document.createElement('input'); c.type = 'checkbox'; c.id = 'forced-cfg-change'; c.dataset.cfg = 'flag:allowCustomCurve'; main.appendChild(c);
    });
    await page.click('#forced-cfg'); await page.waitForTimeout(120);
    await page.evaluate(() => { const c = document.getElementById('forced-cfg-change'); if (c) c.click(); });
    await page.waitForTimeout(150);
    assert.equal(await page.$('#dlg'), null, role);
    assert.ok((await page.$$eval('.toast-txt', t => t.map(x => x.textContent))).includes(R.configuratorAdminOnly), `${role}: refused with a reason`);
  }
  assert.equal((await auditRows(page)).filter(r => r[3] === R.configuratorTitle).length, 0, 'no configuration audit rows');
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  assert.ok((await meta(page)).startsWith(R.configVersionText(1)), 'configuration unchanged');
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  assert.equal(await page.$eval('#cfg-flag-allowValueOnlyResponse', e => e.checked), false);
  assert.equal(await page.$eval('#cfg-flag-allowCustomCurve', e => e.checked), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('F1/N5 (WCAG 1.4.10): for every role at 320, 375 and 1280 px the header fits; the Administrator entry and the avatar stay in view and the entry works', { skip }, async () => {
  const { page, errors } = await B.openApp(browser);
  await B.walkToReview(page);
  for (const role of ['analyst', 'lead', 'admin']) {
    await page.setViewportSize({ width: 1280, height: 700 }); await page.waitForTimeout(80);
    await B.setRole(page, role);
    for (const width of [320, 375, 1280]) {
      const tag = `${role} @ ${width}px`;
      await page.setViewportSize({ width, height: 700 }); await page.waitForTimeout(120);
      const box = await page.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        return { vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, btn: r('#open-config'), av: r('.avatar') };
      });
      assert.ok(box.sw <= box.vw, `${tag}: no horizontal scroll`);
      assert.ok(box.av && box.av.l >= 0 && box.av.r <= box.vw && box.av.t >= 0 && box.av.b <= 56, `${tag}: avatar fully visible ${JSON.stringify(box.av)}`);
      if (role !== 'admin') { assert.equal(box.btn, null, `${tag}: no entry`); continue; }
      assert.ok(box.btn.l >= 0 && box.btn.r <= box.vw && box.btn.t >= 0 && box.btn.b <= 56, `${tag}: entry inside the viewport ${JSON.stringify(box.btn)}`);
      assert.ok(box.btn.r <= box.av.l, `${tag}: entry and avatar do not overlap`);
      assert.equal(await page.getAttribute('#open-config', 'aria-label'), R.configuratorOpen, 'accessible name from FSFields');
      assert.equal(await page.$eval('#open-config .ab-cfg-lbl', e => getComputedStyle(e).display === 'none'), width <= 720, `${tag}: text label ${width <= 720 ? 'hidden' : 'shown'}`);
      await page.focus('#open-config'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      assert.ok(await page.$('#dlg'), `${tag}: opens`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(120);
      assert.equal(await activeId(page), 'open-config', `${tag}: focus returns`);
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});
