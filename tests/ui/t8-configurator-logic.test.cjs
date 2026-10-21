'use strict';
// P3 T8 (logic level): FSConfigurator edit rules on a deep clone of the seed config. One change (= one audit row) per
// saved edit with old → new, version +1 / updatedBy / updatedAt per saved edit, invalid input changes nothing, and
// "Reset to Beghou reference" restores FSFields.REFERENCE_PRESETS exactly (one row per changed field).
// Also the §10 guardrail: configurator.js carries no user-facing string literals (they come from RESPONSE_CURVE_LABELS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, SRC } = require('../helpers/modules.cjs');
const { FSFields: F } = load();
const C = require(path.join(SRC, 'ui', 'configurator.js'));
const R = F.RESPONSE_CURVE_LABELS;

const fresh = () => JSON.parse(JSON.stringify(F.RESPONSE_CURVE_CONFIG));
const ctx = { user: 'Test Admin', at: '2026-01-02T03:04:05.000Z' };
const run = (cfg, ui, cmd, value) => C.command(cfg, ui, cmd, value, ctx);

test('a first edit to a reference preset writes exactly one row (old → new), derives origin, and stamps the config once', () => {
  const cfg = fresh(), ui = C.blankUi();
  const r = run(cfg, ui, 'preset:0:gamma', '1.7');
  assert.deepEqual(r.changes, [R.audit.configEdit(`Slow uptake · ${R.gamma}`, '1.5', '1.7')]);
  assert.equal(cfg.presets[0].gamma, 1.7);
  assert.equal(cfg.presets[0].origin, 'client');
  assert.equal(cfg.version, 2);
  assert.equal(cfg.updatedBy, 'Test Admin');
  assert.equal(cfg.updatedAt, ctx.at);
  // The frozen seed is untouched.
  assert.equal(F.RESPONSE_CURVE_CONFIG.presets[0].gamma, 1.5);
  assert.equal(F.RESPONSE_CURVE_CONFIG.version, 1);
  // Saving the same value again is not an edit.
  assert.deepEqual(run(cfg, ui, 'preset:0:gamma', '1.7').changes, []);
  assert.equal(cfg.version, 2);
});

test('inline validation: δ/γ/ρ must be numbers above 0, label non-blank; invalid input changes nothing', () => {
  const cfg = fresh(), ui = C.blankUi(), before = JSON.stringify(cfg);
  const plain = f => R.presetValuePlainDecimal(R[f]);
  for (const [field, raw, want] of [['delta', '0', R.presetValueInvalid(R.delta)], ['rho', '0.0', R.presetValueInvalid(R.rho)], ['gamma', '-1', plain('gamma')], ['rho', 'abc', plain('rho')],
    ['rho', '', plain('rho')], ['gamma', '1e999', plain('gamma')], ['gamma', '1 5', plain('gamma')], ['rho', '0x10', plain('rho')], ['delta', '1e1', plain('delta')],
    ['gamma', '+2', plain('gamma')], ['rho', '1,5', R.presetValueComma(R.rho)], ['rho', 'Infinity', plain('rho')], ['gamma', '1.2.3', plain('gamma')]]) {
    const r = run(cfg, ui, `preset:1:${field}`, raw);
    assert.equal(r.error, want, `${field}=${raw}`);
    assert.deepEqual(r.changes, []);
    assert.equal(ui.errors[`p-1-${field}`], r.error);
    assert.equal(ui.drafts[`p-1-${field}`], raw, 'the entered text is kept for correction');
  }
  const lr = run(cfg, ui, 'preset:1:label', '   ');
  assert.equal(lr.error, R.presetLabelRequired);
  assert.equal(JSON.stringify(cfg), before, 'config unchanged, version not bumped');
  // A valid entry clears the error; only the ends are trimmed; plain decimals with or without digits around the point pass.
  run(cfg, ui, 'preset:1:rho', '  4  ');
  assert.equal(ui.errors['p-1-rho'], undefined);
  assert.equal(cfg.presets[1].rho, 4);
  for (const [raw, v] of [['2.', 2], ['.5', 0.5], ['100000', 100000], ['1.25', 1.25]]) { run(cfg, ui, 'preset:1:gamma', raw); assert.equal(cfg.presets[1].gamma, v, raw); }
});

test('label, description and picker visibility edits each write exactly one audit row', () => {
  const cfg = fresh(), ui = C.blankUi();
  assert.deepEqual(run(cfg, ui, 'preset:2:label', ' Fast uptake ').changes, [R.audit.configEdit(`Steep uptake · ${R.presetLabel}`, 'Steep uptake', 'Fast uptake')]);
  assert.equal(run(cfg, ui, 'preset:2:description', 'Synthetic note').changes.length, 1);
  assert.deepEqual(run(cfg, ui, 'preset:3:pickerVisible', false).changes, [R.audit.configEdit(`Baseline · ${R.pickerVisible}`, R.flagState.true, R.flagState.false)]);
  assert.equal(cfg.version, 4);
  assert.equal(cfg.presets[3].pickerVisible, false);
  // A hidden preset leaves the default-assignment choices (picker-visible presets plus Custom).
  assert.deepEqual(C.pickerOptions(cfg).map(o => o.value), ['slow', 'moderate', 'steep', 'custom']);
});

test('Reset to Beghou reference restores REFERENCE_PRESETS exactly, one row per changed user-editable field, no Origin row, version +1', () => {
  const cfg = fresh(), ui = C.blankUi();
  run(cfg, ui, 'preset:0:gamma', '2');
  run(cfg, ui, 'preset:1:label', 'Renamed');
  run(cfg, ui, 'preset:3:pickerVisible', false);
  run(cfg, ui, 'copy:8:2', undefined);   // library step "Base" into Steep uptake (γ 0.8 → 1, ρ 1.5 → 3)
  const v = cfg.version;
  const r = run(cfg, ui, 'reset');
  assert.deepEqual(cfg.presets, JSON.parse(JSON.stringify(F.REFERENCE_PRESETS)));
  assert.equal(cfg.version, v + 1);
  assert.equal(ui.notice, R.audit.configReset);
  const want = [
    R.audit.configEdit(`Slow uptake · ${R.gamma}`, '2', '1.5'),
    R.audit.configEdit(`Renamed · ${R.presetLabel}`, 'Renamed', 'Moderate uptake'),
    R.audit.configEdit(`Steep uptake · ${R.gamma}`, '1', '0.8'),
    R.audit.configEdit(`Steep uptake · ${R.rho}`, '3', '1.5'),
    R.audit.configEdit(`Baseline · ${R.pickerVisible}`, R.flagState.false, R.flagState.true),
  ];
  assert.deepEqual(r.changes, want);
  // §5 values exactly.
  const vals = Object.fromEntries(cfg.presets.map(p => [p.id, [p.delta, p.gamma, p.rho]]));
  assert.deepEqual(vals, { slow: [5, 1.5, 11], moderate: [5, 1.1, 3.5], steep: [5, 0.8, 1.5], baseline: [5, 1.3, 7] });
  assert.deepEqual(cfg.presets.map(p => p.id), ['slow', 'moderate', 'steep', 'baseline'], 'picker order kept');
  // Resetting an unchanged config is a no-op: no change, no version bump, and the notice says so (F8).
  assert.deepEqual(run(cfg, ui, 'reset').changes, []);
  assert.equal(cfg.version, v + 1);
  assert.equal(ui.notice, R.alreadyReference);
});

test('curve library: read-only ladder; "Copy into preset…" copies δ/γ/ρ in exactly one audit row', () => {
  const cfg = fresh(), ui = C.blankUi('curveLibrary');
  const lib = JSON.stringify(cfg.curveLibrary);
  run(cfg, ui, 'copyOpen:16');
  assert.equal(ui.copyFrom, 16);
  const r = run(cfg, ui, 'copy:16:1');   // −4 Linear into Moderate uptake
  assert.deepEqual(r.changes, [R.audit.configEdit(R.audit.libraryCopy('−4 Linear', 'Moderate uptake'),
    `${R.delta} 5, ${R.gamma} 1.1, ${R.rho} 3.5`, `${R.delta} 5, ${R.gamma} 1, ${R.rho} 100000`)]);
  assert.deepEqual([cfg.presets[1].delta, cfg.presets[1].gamma, cfg.presets[1].rho], [5, 1, 100000]);
  assert.equal(r.changes.length, 1, 'exactly one row');
  assert.equal(cfg.presets[1].origin, 'client', 'origin derived, not audited');
  assert.equal(ui.copyFrom, null);
  assert.equal(JSON.stringify(cfg.curveLibrary), lib, 'library unchanged');
  assert.equal(cfg.version, 2);
});

test('default assignment: change, add (validated) and remove an archetype name, each one audited change', () => {
  const cfg = fresh(), ui = C.blankUi('defaultAssignment');
  const tab = R.tabs.defaultAssignment;
  assert.deepEqual(run(cfg, ui, 'assign:0', 'custom').changes, [R.audit.configEdit(`${tab} · Prospects`, 'Slow uptake', R.custom)]);
  assert.equal(cfg.defaultAssignment.Prospects, 'custom');
  assert.deepEqual(run(cfg, ui, 'assign:0', 'no-such-preset').changes, []);
  run(cfg, ui, 'newPreset', 'baseline');
  assert.equal(run(cfg, ui, 'add', '  ').error, R.archetypeNameRequired);
  assert.equal(run(cfg, ui, 'add', 'trialists').error, R.archetypeNameDuplicate);
  assert.deepEqual(run(cfg, ui, 'add', 'Newcomers').changes, [R.audit.configEdit(`${tab} · Newcomers`, R.audit.blank, 'Baseline')]);
  assert.equal(cfg.defaultAssignment.Newcomers, 'baseline');
  assert.equal(ui.newName, '');
  const i = Object.keys(cfg.defaultAssignment).indexOf('Trialists');
  assert.deepEqual(run(cfg, ui, `remove:${i}`).changes, [R.audit.configEdit(`${tab} · Trialists`, 'Moderate uptake', R.audit.blank)]);
  assert.ok(!('Trialists' in cfg.defaultAssignment));
  assert.equal(cfg.version, 4);
});

test('flags: allowValueOnlyResponse defaults off, allowCustomCurve on; toggles audited', () => {
  const cfg = fresh(), ui = C.blankUi('flags');
  assert.deepEqual(cfg.flags, { allowValueOnlyResponse: false, allowCustomCurve: true });
  assert.deepEqual(run(cfg, ui, 'flag:allowValueOnlyResponse', true).changes, [R.audit.configEdit(R.flagLabels.allowValueOnlyResponse, R.flagState.false, R.flagState.true)]);
  assert.deepEqual(run(cfg, ui, 'flag:allowCustomCurve', false).changes, [R.audit.configEdit(R.flagLabels.allowCustomCurve, R.flagState.true, R.flagState.false)]);
  assert.deepEqual(run(cfg, ui, 'flag:notAFlag', true).changes, []);
  assert.equal(cfg.version, 3);
});

test('the view renders four tabs with labels from RESPONSE_CURVE_LABELS and a mini-chart per preset', () => {
  globalThis.FSEngine = globalThis.FSEngine || require(path.join(SRC, 'engine', 'engine.js'));
  const cfg = fresh(), h = { icon: () => '', fmtTime: x => x };
  const html = C.view(cfg, C.blankUi('presets'), h);
  ['presets', 'defaultAssignment', 'curveLibrary', 'flags'].forEach(k => assert.ok(html.includes(`>${R.tabs[k]}</button>`), k));
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/<polyline /g) || []).length, 4, 'one curve per preset');
  assert.ok(html.includes(R.resetReference) && html.includes(R.referencePresets));
  const lib = C.view(cfg, C.blankUi('curveLibrary'), h);
  assert.equal((lib.match(/data-arg="copyOpen:/g) || []).length, 17);
  assert.ok(lib.includes(R.referenceLibrary) && lib.includes('−4 Linear'));
  const flags = C.view(cfg, C.blankUi('flags'), h);
  assert.ok(flags.includes(R.flagHelp.allowValueOnlyResponse.replace(/"/g, '&quot;')) && !/id="cfg-flag-allowValueOnlyResponse"[^>]*checked/.test(flags));
  // Every input, textarea and select is labelled.
  const all = [html, lib, flags, C.view(cfg, C.blankUi('defaultAssignment'), h)].join('');
  for (const m of all.matchAll(/<(input|textarea|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    assert.ok(all.includes(`for="${m[2]}"`) || /aria-label(ledby)?="/.test(m[0]), `${m[2]} is labelled`);
  }
});

test('configurator.js has no user-facing string literals (labels come from RESPONSE_CURVE_LABELS)', () => {
  const src = fs.readFileSync(path.join(SRC, 'ui', 'configurator.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const lits = [...src.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
  // Prose = two or more words of letters (ids, commands, CSS and attribute fragments are single tokens or markup).
  const prose = lits.filter(s => s !== 'use strict' && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s) && !/^[\w\s-]+:[\w\s-]+$/.test(s) && !/[=<>;]/.test(s));
  assert.deepEqual(prose, []);
  // HTML text nodes in the markup templates carry only interpolations and punctuation.
  const texts = [...src.matchAll(/>([^<>]*)</g)].map(m => { let t = m[1], prev; do { prev = t; t = t.replace(/\$\{[^{}]*\}/g, ''); } while (t !== prev); return t.trim(); });
  assert.deepEqual(texts.filter(t => /[A-Za-z]{2,}/.test(t) && !/[=(){}`]/.test(t)), []);
});

test('the app.js configurator wiring takes its text from RESPONSE_CURVE_LABELS and tags FR-46 (proposed)', () => {
  const app = fs.readFileSync(path.join(SRC, 'ui', 'app.js'), 'utf8');
  const a = app.indexOf('response curve configurator (P3, FR-46 proposed)'), b = app.indexOf('/* ================================================================== dialogs */');
  assert.ok(a > 0 && b > a, 'wiring block present');
  const block = app.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const lits = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
  assert.deepEqual(lits.filter(s => /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s)), []);
  assert.ok(block.includes('RCL.configuratorOpen') && block.includes('RCL.configuratorAdminOnly'));
  assert.ok(/titleHtml = esc\(RCL\.configuratorTitle\) \+ rq\('FR-46 \(proposed\)'\)/.test(app), 'configurator heading carries rq(FR-46 (proposed))');
  assert.ok(/label: RCL\.configuratorClose/.test(app));
  assert.ok(/config: clone\(F\.RESPONSE_CURVE_CONFIG\)/.test(app), 'state.config is a deep clone of the seed');
  assert.ok(/const readOnly = \(\) => state\.role === 'admin';/.test(app), 'readOnly() unchanged');
});

test('F4/F7: commas rejected in δ/γ/ρ; label ≤ 60 and description ≤ 240 characters; preset labels unique (case-insensitive)', () => {
  const cfg = fresh(), ui = C.blankUi(), before = JSON.stringify(cfg);
  assert.equal(run(cfg, ui, 'preset:0:gamma', '1,5').error, R.presetValueComma(R.gamma));
  assert.equal(run(cfg, ui, 'preset:0:rho', '1,000').error, R.presetValueComma(R.rho));
  assert.equal(run(cfg, ui, 'preset:0:label', 'x'.repeat(61)).error, R.presetLabelTooLong(60));
  assert.equal(run(cfg, ui, 'preset:0:description', 'y'.repeat(241)).error, R.presetDescriptionTooLong(240));
  assert.equal(run(cfg, ui, 'preset:0:label', ' moderate UPTAKE ').error, R.presetLabelDuplicate);
  assert.equal(JSON.stringify(cfg), before, 'nothing saved');
  assert.equal(run(cfg, ui, 'preset:0:label', 'x'.repeat(60)).changes.length, 1);
  assert.equal(run(cfg, ui, 'preset:0:description', 'y'.repeat(240)).changes.length, 1);
  assert.equal(C.LABEL_MAX, 60); assert.equal(C.DESCRIPTION_MAX, 240);
});

test('F5: the last picker-visible preset cannot be hidden', () => {
  const cfg = fresh(), ui = C.blankUi();
  ['0', '1', '2'].forEach(i => run(cfg, ui, `preset:${i}:pickerVisible`, false));
  const v = cfg.version;
  const r = run(cfg, ui, 'preset:3:pickerVisible', false);
  assert.equal(r.error, R.pickerVisibleLast);
  assert.equal(ui.errors['p-3-pickerVisible'], R.pickerVisibleLast);
  assert.equal(cfg.presets[3].pickerVisible, true);
  assert.equal(cfg.version, v);
});

test('F5: with custom curves off, Custom leaves the choices; archetypes already on Custom are warned about, not changed', () => {
  const cfg = fresh(), ui = C.blankUi('defaultAssignment'), h = { icon: () => '', fmtTime: x => x };
  run(cfg, ui, 'assign:1', 'custom');   // Trialists -> Custom
  run(cfg, ui, 'flag:allowCustomCurve', false);
  assert.equal(cfg.defaultAssignment.Trialists, 'custom', 'not silently changed');
  assert.deepEqual(C.customInUse(cfg), ['Trialists']);
  assert.ok(!C.pickerOptions(cfg).some(o => o.value === 'custom'));
  assert.ok(C.pickerOptions(cfg, 'custom').some(o => o.value === 'custom'), 'the current value stays visible on its own row');
  const warn = R.customOffInUse('Trialists');
  assert.ok(C.view(cfg, C.blankUi('flags'), h).includes(warn));
  assert.ok(C.view(cfg, C.blankUi('defaultAssignment'), h).includes(warn));
  const v = cfg.version;
  assert.deepEqual(run(cfg, ui, 'assign:0', 'custom').changes, [], 'Custom cannot be newly assigned');
  run(cfg, ui, 'newPreset', 'custom');
  run(cfg, ui, 'add', 'Newcomers');
  assert.equal(cfg.defaultAssignment.Newcomers, 'slow', 'falls back to the first picker preset');
  assert.equal(cfg.version, v + 1);
  run(cfg, ui, 'assign:1', 'moderate');
  assert.deepEqual(C.customInUse(cfg), []);
  assert.ok(!C.view(cfg, C.blankUi('flags'), h).includes('cfg-custom-warn'));
});

test('F2/F3: reserved (ALL, custom; any case) and prototype names are rejected as archetype names; nothing written', () => {
  const cfg = fresh(), ui = C.blankUi('defaultAssignment'), before = JSON.stringify(cfg);
  for (const n of ['ALL', 'all', 'Custom', 'CUSTOM', F.RESPONSE_CURVE_RESERVED.all, F.RESPONSE_CURVE_RESERVED.custom, '__proto__', 'constructor', 'prototype', 'Constructor']) {
    const r = run(cfg, ui, 'add', n);
    assert.equal(r.error, R.archetypeNameReserved, n);
    assert.deepEqual(r.changes, [], n);
  }
  assert.equal(JSON.stringify(cfg), before, 'no version bump, no phantom entry');
  assert.equal(Object.getPrototypeOf(cfg.defaultAssignment), Object.prototype);
  assert.deepEqual(run(cfg, ui, 'remove:99').changes, []);
});

test('N1: origin is derived (not audited) on edit, copy and reset; every saved edit writes exactly one row', () => {
  const cfg = fresh(), ui = C.blankUi();
  assert.deepEqual(run(cfg, ui, 'preset:2:rho', '2').changes, [R.audit.configEdit(`Steep uptake · ${R.rho}`, '1.5', '2')]);
  assert.equal(cfg.presets[2].origin, 'client');
  assert.deepEqual(run(cfg, ui, 'preset:2:rho', '1.5').changes, [R.audit.configEdit(`Steep uptake · ${R.rho}`, '2', '1.5')], 'back to the reference values: one row');
  assert.equal(cfg.presets[2].origin, 'beghou-reference', 'origin derived back');
  assert.deepEqual(cfg.presets, JSON.parse(JSON.stringify(F.REFERENCE_PRESETS)));
  assert.equal(run(cfg, ui, 'copy:8:0').changes.length, 1, 'library copy: one row');
  assert.equal(cfg.presets[0].origin, 'client');
  assert.equal(run(cfg, ui, 'copy:8:0').changes.length, 0, 'same values again: no row');
  const r = run(cfg, ui, 'reset');
  assert.deepEqual(r.changes, [R.audit.configEdit(`Slow uptake · ${R.gamma}`, '1', '1.5'), R.audit.configEdit(`Slow uptake · ${R.rho}`, '3', '11')]);
  assert.equal(cfg.presets[0].origin, 'beghou-reference');
  assert.deepEqual(run(cfg, ui, 'reset').changes, []);
  assert.equal(ui.notice, R.alreadyReference);
});

test('N3: a preset label may not equal the Custom label (trimmed, case-insensitive)', () => {
  const cfg = fresh(), ui = C.blankUi(), before = JSON.stringify(cfg);
  for (const v of [R.custom, `  ${R.custom.toUpperCase()} `, R.custom.toLowerCase()]) assert.equal(run(cfg, ui, 'preset:0:label', v).error, R.presetLabelIsCustom, v);
  assert.equal(JSON.stringify(cfg), before);
});

test('N4: archetype names are capped at 60 characters', () => {
  const cfg = fresh(), ui = C.blankUi('defaultAssignment'), before = JSON.stringify(cfg);
  assert.equal(C.ARCHETYPE_MAX, 60);
  assert.equal(run(cfg, ui, 'add', 'a'.repeat(61)).error, R.archetypeNameTooLong(60));
  assert.equal(JSON.stringify(cfg), before);
  assert.equal(run(cfg, ui, 'add', ` ${'a'.repeat(60)} `).changes.length, 1);
});

// P7 (P3-m3): a preset label may not start with the Custom word (the first word of the Custom label from FSFields),
// case-insensitive and as a whole word; words that merely begin with the same letters stay allowed.
test('P3-m3: a preset label may not start with the Custom word', () => {
  const cfg = fresh(), ui = C.blankUi(), before = JSON.stringify(cfg);
  const word = R.custom.trim().split(/\s+/)[0];
  assert.equal(word, 'Custom');
  for (const v of [word, `${word} 2`, ` ${word.toUpperCase()} uptake`, `${word.toLowerCase()}-fast`, `${word}: steep`]) {
    assert.equal(run(cfg, ui, 'preset:0:label', v).error, R.presetLabelStartsCustom(word), v);
  }
  assert.equal(R.presetLabelStartsCustom(word), `Labels starting with "${word}" are kept for custom curves. Choose another label.`);
  assert.equal(run(cfg, ui, 'preset:0:label', R.custom).error, R.presetLabelIsCustom, 'the full Custom label keeps its own message');
  assert.equal(JSON.stringify(cfg), before, 'refused labels change nothing');
  for (const ok of ['Customer uptake', 'Customised slow', 'Slow custom uptake']) {
    assert.equal(run(cfg, ui, 'preset:0:label', ok).changes.length, 1, ok);
    assert.equal(cfg.presets[0].label, ok);
  }
});
