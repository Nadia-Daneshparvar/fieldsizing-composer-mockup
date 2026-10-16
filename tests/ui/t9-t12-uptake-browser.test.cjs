'use strict';
// P4 (W-ASSUMP-UI) in the built page, driven headless: Step 2 · Model Assumptions → "Uptake by archetype".
//   T9  a preset change updates the chart and the FTE and writes one audit row (old → new)
//   T10 Custom rejects δ/γ/ρ ≤ 0 or non-numeric and needs a source note; edits are audited
//   T11 CS-7: flag off ⇒ today's message unchanged; flag on ⇒ one "All HCPs" row and value-only runs
//   T12 labels (archetype name in the accessible name), keyboard operation, visible focus, rq() tags
//   + the new sample defaults to Slow / Moderate / Steep from state.config (not the frozen seed); archetypes come from the data
//   (FR-47); the Administrator sees the section read-only (D4); the Scenario Summary shows the uptake and config version.
// Every expected string comes from FSFields. Skips cleanly when no headless browser is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const P = require('./p4-helpers.cjs');
const { FSFields: F, FSEngine: E } = load();
const R = F.RESPONSE_CURVE_LABELS, V = R.validation, C = F.RESPONSE_CURVE_CONFIG;
const B = P.B;
const presetLabel = id => C.presets.find(p => p.id === id).label;
// Today's CS-7 text (src/ui/app.js at the phase base), which must be shown unchanged while the flag is off.
const CS7_TITLE = 'Response Curve needs behavioural curves';
const CS7_TEXT = 'Response Curve needs behavioural response curves: a curve archetype for each HCP or segment, supplied with the Segmentation & Targeting data. Value-only segmentation is not yet supported for Response Curve, and no default curve is assumed. Use Affordable Coverage for value-only segmentation.';

const skip = B.available() ? false : 'no headless browser configured (.private/qc-env.json)';
let browser;
test.before(async () => { if (!skip) browser = await B.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const rowNames = page => page.$$eval('#rc-table tbody th[scope=row]', t => t.map(x => x.textContent.trim()));
const legend = page => page.$$eval('#curve-legend > span', s => s.map(x => x.textContent.trim()));
const points = (page, a) => page.$eval(`#curve-plot polyline[data-arch="${a}"]`, e => e.getAttribute('points')).catch(() => null);
const issuesText = page => page.$eval('#c-ascheck', e => e.innerText);
/* Forces an action the visible UI only offers elsewhere (as the P3 tests do): a hidden button with that data-act. */
async function forceAct(page, act) {
  await page.evaluate(a => { const b = document.createElement('button'); b.type = 'button'; b.id = `forced-${a}`; b.dataset.act = a; document.getElementById('main').appendChild(b); }, act);
  await B.click(page, `#forced-${act}`);
}

test('new sample: archetypes read from the data default to Slow / Moderate / Steep from the configuration; FR-47 data summary', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await B.click(page, '#load-sample-presets');
  // Step 1 data table: mix text lists the sample's archetypes, not the fixed reference set (P2 R-QC m1).
  await B.click(page, '#method-response');
  const mix = await page.$$eval('.data-t tbody td', t => t.map(x => x.textContent).filter(x => /%/.test(x)));
  assert.ok(mix.length > 0);
  mix.forEach(m => { assert.match(m, /^Prospects [\d.]+% · Trialists [\d.]+% · Early Leaders [\d.]+%$/); assert.ok(!/Loyalists/.test(m)); });
  await B.click(page, '#run-inputs');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
  assert.deepEqual(await rowNames(page), Object.keys(C.defaultAssignment));
  for (const [i, a] of Object.keys(C.defaultAssignment).entries()) assert.equal(await P.ddText(page, `rc-${i}-up`), presetLabel(C.defaultAssignment[a]));
  assert.deepEqual(await legend(page), Object.entries(C.defaultAssignment).map(([a, id]) => R.curveLegendPreset(a, presetLabel(id))));
  // Raw values are hidden by default (FR-44): no δ/γ/ρ inputs, Advanced collapsed.
  assert.equal(await page.$('[data-rc-param]'), null);
  assert.equal(await page.getAttribute('#rc-adv-btn', 'aria-expanded'), 'false');
  assert.equal(await page.$eval('#rc-adv', e => e.hidden), true);
  const calc = await P.checkAndCalc(page);
  assert.deepEqual(calc.result.errors, []);
  for (const [a, id] of Object.entries(C.defaultAssignment)) {
    const p = C.presets.find(x => x.id === id);
    assert.deepEqual(calc.inputs.methodAssumptions.curveParams[a], { delta: p.delta, gamma: p.gamma, rho: p.rho }, a);
    assert.deepEqual(calc.inputs.methodAssumptions.curveProvenance[a], { source: 'preset', presetId: id, label: p.label }, a);
  }
  assert.deepEqual(Object.keys(calc.inputs.methodAssumptions.curveParams), Object.keys(C.defaultAssignment), 'only the archetypes in the data');
  assert.equal(calc.inputs.methodAssumptions.customSourceNote, undefined, 'no note without a Custom curve');
  assert.deepEqual(errors, []);
  await page.close();
});

test('defaults come from state.config: an Administrator edit to the default assignment is used by the next sample load', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await B.walkToReview(page);
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.click('#cfg-tab-defaultAssignment'); await page.waitForTimeout(120);
  await page.selectOption('#cfg-da-0', 'baseline'); await page.waitForTimeout(150);   // Prospects → Baseline
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');
  await forceAct(page, 'loadSamplePresets');
  await B.click(page, '[data-act="nav"][data-arg="setup"]', { confirm: false });
  await B.click(page, '#method-response');
  await B.click(page, '#run-inputs');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
  assert.equal(await P.ddText(page, 'rc-0-up'), presetLabel('baseline'));
  assert.equal(await P.ddText(page, 'rc-1-up'), presetLabel('moderate'));
  const calc = await P.checkAndCalc(page);
  assert.equal(calc.inputs.methodAssumptions.curveProvenance.Prospects.presetId, 'baseline');
  assert.deepEqual(errors, []);
  await page.close();
});

test('T9: a preset change updates the chart and the FTE and writes one audit row (old → new); the Administrator sees it read-only', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  const before = await P.checkAndCalc(page);
  assert.deepEqual(before.result.errors, []);
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  const pts0 = await points(page, 'Trialists');
  assert.ok(pts0);
  await P.pick(page, 'rc-1-up', presetLabel('steep'));
  assert.equal(await P.ddText(page, 'rc-1-up'), presetLabel('steep'));
  assert.ok((await legend(page)).includes(R.curveLegendPreset('Trialists', presetLabel('steep'))), 'legend shows the new preset');
  assert.notEqual(await points(page, 'Trialists'), pts0, 'the Trialists curve is redrawn');
  assert.equal(await points(page, 'Prospects'), await points(page, 'Prospects'));
  // The earlier result is now stale; recalculating uses the new preset and changes the FTE.
  const after = await P.checkAndCalc(page);
  const st = C.presets.find(p => p.id === 'steep');
  assert.deepEqual(after.inputs.methodAssumptions.curveParams.Trialists, { delta: st.delta, gamma: st.gamma, rho: st.rho });
  assert.equal(after.result.curves.Trialists.presetId, 'steep');
  assert.notEqual(after.result.totals.rawFte, before.result.totals.rawFte, 'FTE responds to the uptake choice');
  const shown = await page.$eval('#main', e => (e.innerText.match(/Recommended FTE\s*\n\s*([\d,.]+)/) || [])[1]);
  assert.equal(Number(shown), after.result.totals.recommendedFte);
  // Scenario Summary: uptake per archetype and the configuration version (§6.4).
  await P.saveSnapshot(page);
  const cmp = await page.$$eval('#cmp-main tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.innerText.trim())));
  const up = cmp.find(r => r[0] === R.summaryHeading);
  assert.ok(up, 'uptake row in the comparison');
  assert.deepEqual(up[1].split('\n'), [R.curveLegendPreset('Prospects', presetLabel('slow')), R.curveLegendPreset('Trialists', presetLabel('steep')),
    R.curveLegendPreset('Early Leaders', presetLabel('steep')), R.configVersionText(C.version)]);
  // Audit: exactly one uptake row, old → new.
  const rows = (await P.auditRows(page)).filter(r => r[5].startsWith('Uptake for'));
  assert.deepEqual(rows.map(r => r[5]), [R.audit.uptakeChange('Trialists', presetLabel('moderate'), presetLabel('steep'))]);
  assert.equal(rows[0][2], F.ROLE_LABELS.analyst);
  // D4: the Administrator sees the section read-only.
  await B.setRole(page, 'admin');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  assert.deepEqual(await page.$$eval('#rc-table [data-dd]', b => b.map(x => x.disabled)), [true, true, true]);
  assert.equal(await page.getAttribute('#rc-adv-btn', 'aria-expanded'), 'false', 'the Advanced details still open for reading');
  await page.click('#rc-adv-btn'); await page.waitForTimeout(120);
  assert.equal(await page.getAttribute('#rc-adv-btn', 'aria-expanded'), 'true');
  assert.deepEqual(errors, []);
  await page.close();
});

test('T10: Custom rejects δ/γ/ρ ≤ 0 or non-numeric, needs a source note, and every edit is audited', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  // Custom is offered (flag allowCustomCurve on) after the picker-visible presets, in configuration order.
  await page.click('#rc-0-up'); await page.waitForTimeout(80);
  assert.deepEqual(await page.$$eval('#rc-0-up-lb [role=option]', o => o.map(x => x.textContent.trim())), C.presets.filter(p => p.pickerVisible).map(p => p.label).concat(R.custom));
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  await P.pick(page, 'rc-0-up', R.custom);
  // Switching to Custom starts from the previous preset's values and asks for the source note.
  const slow = C.presets.find(p => p.id === 'slow');
  assert.deepEqual(await Promise.all(['delta', 'gamma', 'rho'].map(k => page.inputValue(`#rc-0-${k}`))), [slow.delta, slow.gamma, slow.rho].map(String));
  assert.equal(await P.text(page, '#rc-note-hint'), V['custom-source-missing']());
  assert.equal(await page.getAttribute('#rc-note', 'aria-invalid'), 'true');
  // ≤ 0 is rejected (custom-curve-invalid); so is anything that is not a plain decimal, with the configurator's P3 messages
  // (Fix 1): commas, inner spaces, exponents, hex and signs. The value is not taken: the curve shows no ρ until it is fixed.
  const plain = k => `Prospects · ${R.presetValuePlainDecimal(R[k])}`;
  const RAW = [['gamma', '0', V['custom-curve-invalid']('Prospects', R.gamma)], ['rho', '1,5', `Prospects · ${R.presetValueComma(R.rho)}`],
    ['rho', '1 5', plain('rho')], ['rho', '1e1', plain('rho')], ['rho', '0x10', plain('rho')], ['rho', '+2', plain('rho')], ['rho', '-1', plain('rho')],
    ['delta', 'abc', plain('delta')]];
  await page.click('#rc-adv-btn'); await page.waitForTimeout(120);
  for (const [k, raw, want] of RAW) {
    await page.fill(`#rc-0-${k}`, raw); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    assert.equal(await page.getAttribute(`#rc-0-${k}`, 'aria-invalid'), 'true', `${k} ${raw}`);
    assert.equal(await page.inputValue(`#rc-0-${k}`), raw, `${k} ${raw}: what was typed stays visible`);
    assert.ok((await P.text(page, '#rc-errors')).includes(want), `${k} ${raw}: ${want}`);
    if (k === 'rho') assert.equal(await P.text(page, '#rc-adv-0-rho'), '—', `${raw} is not read as a number`);
  }
  await B.click(page, '#run-assumptions');
  const iss = await issuesText(page);
  for (const want of [V['custom-curve-invalid']('Prospects', R.gamma), plain('rho'), plain('delta')]) assert.ok(iss.includes(want), want);
  assert.ok(iss.includes(V['custom-source-missing']()));
  assert.equal((await page.$$('#c-ascheck ul.issues > li')).length, 4, 'three values and the note, each once (the engine\'s same errors are not repeated)');
  assert.equal(await page.getAttribute('[data-act="nav"][data-arg="result"]', 'aria-disabled'), 'true', 'FTE Calculation stays locked');
  // Valid values and a note: the check passes and the custom curve is what the engine receives.
  for (const [k, v] of [['delta', '5'], ['gamma', '1.7'], ['rho', '9']]) { await page.fill(`#rc-0-${k}`, v); await page.keyboard.press('Tab'); await page.waitForTimeout(120); }
  await page.fill('#rc-note', 'Synthetic marketing-mix study, test run'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await page.$('#rc-errors'), null);
  const calc = await P.checkAndCalc(page);
  assert.deepEqual(calc.result.errors, []);
  assert.deepEqual(calc.inputs.methodAssumptions.curveParams.Prospects, { delta: 5, gamma: 1.7, rho: 9 });
  assert.deepEqual(calc.inputs.methodAssumptions.curveProvenance.Prospects, { source: 'custom', presetId: null, label: null });
  assert.equal(calc.inputs.methodAssumptions.customSourceNote, 'Synthetic marketing-mix study, test run');
  // Audit: the uptake change, each committed custom value (old → new) and the source note.
  await P.saveSnapshot(page);
  const rows = (await P.auditRows(page)).map(r => r[5]);
  const want = [
    R.audit.uptakeChange('Prospects', presetLabel('slow'), R.custom),
    R.audit.customValue('Prospects', R.gamma, '1.5', '0'), R.audit.customValue('Prospects', R.delta, '5', 'abc'),
    ...[['11', '1,5'], ['1,5', '1 5'], ['1 5', '1e1'], ['1e1', '0x10'], ['0x10', '+2'], ['+2', '-1'], ['-1', '9']].map(([from, to]) => R.audit.customValue('Prospects', R.rho, from, to)),
    R.audit.customValue('Prospects', R.delta, 'abc', '5'), R.audit.customValue('Prospects', R.gamma, '0', '1.7'),
    R.audit.sourceNote(R.audit.blank, 'Synthetic marketing-mix study, test run')
  ];
  const got = rows.filter(r => r.startsWith('Uptake for') || r.startsWith('Custom curve'));
  assert.deepEqual(got.slice().sort(), want.slice().sort());
  assert.deepEqual(errors, []);
  await page.close();
});

test('T10: the existing samples load as Custom with the reference values and the synthetic note; a blank note blocks the check', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample', 'response');
  assert.deepEqual(await rowNames(page), Object.keys(E.ARCHETYPES), 'same archetypes, same order as before');
  for (let i = 0; i < 4; i++) assert.equal(await P.ddText(page, `rc-${i}-up`), R.custom);
  assert.equal(await page.inputValue('#rc-0-gamma'), String(E.ARCHETYPES.Loyalists.gamma));
  // Fix 1: only the ends are trimmed; a plain decimal is accepted.
  await page.fill('#rc-0-gamma', ' 1.7 '); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('#rc-0-gamma', 'aria-invalid'), null);
  assert.equal(await P.text(page, '#rc-adv-0-gamma'), '1.7');
  await page.fill('#rc-0-gamma', String(E.ARCHETYPES.Loyalists.gamma)); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  await page.fill('#rc-note', ''); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  assert.equal(await P.text(page, '#rc-note-hint'), R.sourceNoteRequired);
  await B.click(page, '#run-assumptions');
  assert.ok((await issuesText(page)).includes(V['custom-source-missing']()));
  assert.equal(await page.getAttribute('[data-act="nav"][data-arg="result"]', 'aria-disabled'), 'true', 'FTE Calculation stays locked');
  assert.deepEqual(errors, []);
  await page.close();
});

test('T11: CS-7 with the flag off shows today\'s message unchanged; with it on, one "All HCPs" row and value-only runs', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await B.walkToReview(page);   // a saved scenario, so the role switcher (and the Administrator) is reachable
  await B.click(page, '[data-act="nav"][data-arg="setup"]', { confirm: false });
  await B.click(page, '#method-response');
  await B.click(page, '#run-inputs');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
  await page.click('input[name="segType"][value="value"]'); await page.waitForTimeout(150);
  // Flag off: exactly today's CS-7 message, no uptake section; the check reports it and calculation stays blocked.
  assert.equal(await page.$('#curve-params'), null);
  assert.equal(await page.$eval('#cs7-msg .msg-title', e => e.textContent), CS7_TITLE);
  assert.equal(await page.$eval('#cs7-msg .msg-body > div:last-child', e => e.textContent), CS7_TEXT);
  assert.equal(await page.$eval('#cs7-msg', e => e.getAttribute('class') + '|' + e.getAttribute('role')), 'msg msg-warning|status');
  await B.click(page, '#run-assumptions');
  assert.ok((await issuesText(page)).includes(CS7_TEXT));
  // The Administrator turns the flag on.
  await B.setRole(page, 'admin');
  await page.click('#open-config'); await page.waitForTimeout(150);
  await page.click('#cfg-tab-flags'); await page.waitForTimeout(120);
  await page.click('#cfg-flag-allowValueOnlyResponse'); await page.waitForTimeout(150);
  await page.click('#cfg-close'); await page.waitForTimeout(120);
  await B.setRole(page, 'analyst');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  assert.equal(await page.$('#cs7-msg'), null);
  assert.deepEqual(await rowNames(page), [R.all]);
  assert.ok((await page.$eval('#curve-params', e => e.innerText)).includes(R.valueOnlyRowHint));
  assert.equal(await P.ddText(page, 'rc-0-up'), R.chooseUptake, 'ALL starts unassigned (no hidden default)');
  await B.click(page, '#run-assumptions');
  assert.ok((await issuesText(page)).includes(V.unassigned(R.all)));
  await P.pick(page, 'rc-0-up', presetLabel('moderate'));
  const calc = await P.checkAndCalc(page);
  assert.deepEqual(calc.result.errors, []);
  const m = C.presets.find(p => p.id === 'moderate');
  assert.deepEqual(calc.inputs.methodAssumptions.curveParams, { [F.RESPONSE_CURVE_RESERVED.all]: { delta: m.delta, gamma: m.gamma, rho: m.rho } });
  assert.ok(calc.inputs.segments.every(s => s.archetypeMix === null && !s.archetype), 'value-only: no archetypes are sent');
  assert.ok(calc.result.totals.recommendedFte > 0);
  assert.deepEqual(Object.keys(calc.result.curves), [F.RESPONSE_CURVE_RESERVED.all]);
  // Fix 1: the Segmentation type audit row keeps today's wording with the flag off and uses the FSFields label with it on.
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await page.click('input[name="segType"][value="behaviour"]'); await page.waitForTimeout(150);
  await page.click('input[name="segType"][value="value"]'); await page.waitForTimeout(150);
  const seg = (await P.auditRows(page)).map(r => r[5]).filter(d => d.startsWith('Segmentation type: Value only'));
  assert.deepEqual(seg.reverse(), ['Segmentation type: Value only (Response Curve not available)', `Segmentation type: ${R.segTypeValueOnlyAllowed}`]);
  assert.deepEqual(errors, []);
  await page.close();
});

test('T12: labelled, keyboard-operable controls with visible focus; rq() tags shown with "Show requirement IDs"', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  // Every uptake picker's accessible name carries the archetype name (and the current value).
  for (const [i, a] of Object.keys(C.defaultAssignment).entries()) {
    const name = await P.labelledByText(page, `#rc-${i}-up`);
    assert.ok(name.startsWith(`${a} · ${R.uptake}`) && name.endsWith(presetLabel(C.defaultAssignment[a])), name);
    assert.equal(await page.getAttribute(`#rc-${i}-up`, 'aria-haspopup'), 'listbox');
  }
  // Keyboard: focus the picker, open with ArrowDown, move, choose with Enter; focus returns to the picker.
  await page.focus('#rc-0-up'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rc-1-up', 'Tab order follows the rows');
  assert.notEqual(await page.$eval('#rc-1-up', e => getComputedStyle(e).boxShadow), 'none', 'visible focus on the picker');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rc-1-up-lb');
  assert.equal(await page.getAttribute('#rc-1-up-lb', 'aria-labelledby'), 'rc-1-up-lbl');
  await page.keyboard.press('End'); await page.waitForTimeout(60);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rc-1-up');
  assert.equal(await P.ddText(page, 'rc-1-up'), R.custom);
  // Custom inputs and the note are labelled; the archetype name is in each input's accessible name.
  for (const k of ['delta', 'gamma', 'rho']) {
    assert.equal(await page.getAttribute(`#rc-1-${k}`, 'aria-label'), `Trialists · ${R[k]}`);
    assert.equal(await P.text(page, `label[for="rc-1-${k}"]`), R[k]);
  }
  assert.equal(await P.text(page, 'label[for="rc-note"]'), R.sourceNote);
  await page.focus('#rc-1-delta'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rc-1-gamma');
  assert.notEqual(await page.$eval('#rc-1-gamma', e => getComputedStyle(e).boxShadow), 'none', 'visible focus on a custom value');
  // The Advanced disclosure is a button with aria-expanded, operable from the keyboard; read-only values per archetype.
  await page.focus('#rc-adv-btn');
  assert.equal(await page.$eval('#rc-adv-btn', e => e.tagName), 'BUTTON');
  assert.equal(await page.getAttribute('#rc-adv-btn', 'aria-controls'), 'rc-adv');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('#rc-adv-btn', 'aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'rc-adv-btn', 'focus stays on the disclosure');
  assert.notEqual(await page.$eval('#rc-adv-btn', e => getComputedStyle(e).boxShadow), 'none', 'visible focus on the disclosure');
  assert.deepEqual(await page.$$eval('#rc-adv-table thead th', t => t.map(x => x.textContent.trim())), [R.archetype, R.preset, R.delta, R.gamma, R.rho, R.halfOfPeak]);
  const adv = await page.$$eval('#rc-adv-table tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const slow = C.presets.find(p => p.id === 'slow');
  assert.deepEqual(adv[0], ['Prospects', slow.label, String(slow.delta), String(slow.gamma), String(slow.rho), Math.pow(slow.rho, 1 / slow.gamma).toFixed(2)]);
  assert.equal(adv[1][1], R.custom);
  assert.equal(await page.$eval('#rc-adv-table', e => e.closest('[role=region]').getAttribute('aria-label')), R.advanced);
  // rq() tags: hidden by default, shown with "Show requirement IDs".
  assert.equal(await page.$eval('#rc-h .req', e => getComputedStyle(e).display), 'none');
  await B.click(page, '#show-req', { confirm: false });
  const tags = await page.$$eval('#rc-h .req', t => t.filter(x => getComputedStyle(x).display !== 'none').map(x => x.textContent.trim()));
  assert.deepEqual(tags, ['FR-44 (proposed)', 'FR-45 (proposed)', 'FR-47 (proposed)']);
  // FR-48 on the export control (Review and Export).
  await page.fill('#rc-note', 'Synthetic note'); await page.keyboard.press('Tab'); await page.waitForTimeout(120);
  await P.checkAndCalc(page);
  await P.saveSnapshot(page);
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  assert.equal(await page.$eval('#c-export .card-actions .req', e => getComputedStyle(e).display !== 'none' && e.textContent.trim()), 'FR-48 (proposed)');
  assert.deepEqual(errors, []);
  await page.close();
});

test('snapshot and clone (I-4): a cloned snapshot restores its uptake and configuration and recalculates to the same result', { skip }, async () => {
  const { page, errors } = await P.openProbed(browser);
  await P.toAssumptions(page, 'load-sample-presets', 'response');
  await P.pick(page, 'rc-0-up', presetLabel('baseline'));
  const first = await P.checkAndCalc(page);
  await P.saveSnapshot(page);   // SC-001: Prospects Baseline
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await P.pick(page, 'rc-0-up', presetLabel('steep'));
  await P.pick(page, 'rc-1-up', R.custom);
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await B.click(page, '#clone-SC-001', { confirm: false });
  // Back on Model Assumptions with SC-001's uptake.
  assert.deepEqual([await P.ddText(page, 'rc-0-up'), await P.ddText(page, 'rc-1-up'), await P.ddText(page, 'rc-2-up')],
    [presetLabel('baseline'), presetLabel('moderate'), presetLabel('steep')]);
  assert.equal(await page.$('[data-rc-param]'), null, 'no Custom rows after the clone');
  await B.click(page, '[data-act="nav"][data-arg="result"]', { confirm: false });
  const again = await P.calcNow(page);
  assert.deepEqual(again.inputs.methodAssumptions.curveParams, first.inputs.methodAssumptions.curveParams);
  assert.equal(again.result.totals.rawFte, first.result.totals.rawFte);
  assert.deepEqual(errors, []);
  await page.close();
});
