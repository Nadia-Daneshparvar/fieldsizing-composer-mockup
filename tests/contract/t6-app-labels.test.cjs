'use strict';
// P2 (§10 guardrail): the uptake presets sample code added to src/ui/app.js takes every user-facing string from
// FSFields.RESPONSE_CURVE_LABELS. Static check over the new lines; the browser walk itself is QC Q8.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, SRC } = require('../helpers/modules.cjs');
const { FSFields: F } = load();
const APP = fs.readFileSync(path.join(SRC, 'ui', 'app.js'), 'utf8');

// Structural string literals allowed in the new code: ids, action names, kinds, icons, audit/toast categories and method ids.
// 'new data loaded' is not structural: it is the existing shared aiGuard reason string (shown as-is in AI rejection audit
// rows, and the key of the existing reason-wording lookups) that every data loader already passed before P2; the presets
// branch reuses it rather than adding new wording.
const STRUCTURAL = new Set(['', 'load-sample-presets', 'loadSamplePresets', 'presets', 'multi', 'text', 'file', 'affordable', 'behaviour', 'project',
  'success']);
const EXISTING_SHARED = new Set(['new data loaded']);

// P4 (D-RUN-10): the P2 bridge loadPresetSampleProject() is folded into loadSampleProject(kind); its presets branch is checked.
function newCode() {
  const start = APP.indexOf('/* Uptake presets sample (P2)');
  assert.ok(start > 0, 'marker comment present');
  const loader = APP.indexOf('function loadSampleProject(kind)', start);
  assert.ok(loader > start, 'one loader follows the marker');
  const brStart = APP.indexOf('    if (presets) {', loader);
  const brEnd = APP.indexOf('\n    }\n', brStart);
  assert.ok(brStart > loader && brEnd > brStart, 'presets branch inside loadSampleProject');
  const head = APP.slice(start, loader);
  const body = APP.slice(brStart, brEnd);
  // The two Step 1 button rows only gain the call presetSampleBtn(), which carries no literal; the other new lines:
  const lines = APP.split('\n').filter(l => /loadSamplePresets|kind === 'presets'/.test(l));
  return [head, body].concat(lines).join('\n');
}
const literals = src => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);

test('new app.js lines use only structural string literals (labels come from FSFields)', () => {
  const lits = literals(newCode());
  const bad = lits.filter(s => !STRUCTURAL.has(s) && !EXISTING_SHARED.has(s));
  assert.deepEqual(bad, [], `user-facing literals in new app.js code: ${JSON.stringify(bad)}`);
  assert.ok(!/`[^`]*[A-Za-z]{3,}[^`]*`/.test(newCode().replace(/\/\*[\s\S]*?\*\//g, '')), 'no template-literal prose');
});

test('the third load button, its action and the presets loader read their text from RESPONSE_CURVE_LABELS', () => {
  const code = newCode();
  ['samplePresetsButton', 'samplePresetsData', 'samplePresetsAudit', 'samplePresetsToast'].forEach(k => {
    assert.ok(code.includes(`RCL.${k}`), `uses RCL.${k}`);
    if (k === 'samplePresetsAudit') return;   // P7 (P2-m2): a function of the archetype count, checked below
    assert.ok(typeof F.RESPONSE_CURVE_LABELS[k] === 'string' && F.RESPONSE_CURVE_LABELS[k].length > 0, k);
  });
  // P7 (P2-m2): the audit text counts the sample's archetypes instead of hard-coding 3.
  assert.ok(code.includes('RCL.samplePresetsAudit(src.archetypes.length)'), 'audit text takes the sample archetype count');
  assert.ok(/const RCL = \(F && F\.RESPONSE_CURVE_LABELS\)/.test(code));
  // The button sits next to the two existing load buttons in both Step 1 places.
  assert.equal((APP.match(/presetSampleBtn\(\)/g) || []).length, 2);
  assert.equal((APP.match(/id: 'load-sample-presets'/g) || []).length, 1);
  // P4: the bridge is retired. Curves are no longer written at load time; the sample seeds state.responseCurve, and
  // buildInputs resolves it against state.config.
  assert.ok(!/E\.resolveCurves\(cfg\.defaultAssignment/.test(APP), 'P2 bridge removed');
  assert.ok(!APP.includes('function loadPresetSampleProject('), 'no separate presets loader');
  assert.ok(code.includes("seedResponseCurve('presets')"), 'presets branch seeds the response curve');
});
