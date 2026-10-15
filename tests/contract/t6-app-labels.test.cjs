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

// Structural string literals allowed in the new code: ids, action names, kinds, icons, audit/toast categories, method ids,
// and the existing shared aiGuard reason every sample loader already passes.
const STRUCTURAL = new Set(['', 'load-sample-presets', 'loadSamplePresets', 'presets', 'multi', 'text', 'file', 'affordable', 'behaviour', 'project',
  'success', 'new data loaded']);

function newCode() {
  const start = APP.indexOf('/* Uptake presets sample (P2)');
  assert.ok(start > 0, 'marker comment present');
  const fnStart = APP.indexOf('function loadPresetSampleProject()');
  const fnEnd = APP.indexOf('\n  }\n', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart);
  const head = APP.slice(start, APP.indexOf('function loadSampleProject(kind)', start));
  const body = APP.slice(fnStart, fnEnd);
  // The two Step 1 button rows only gain the call presetSampleBtn(), which carries no literal; the other new lines:
  const lines = APP.split('\n').filter(l => /loadSamplePresets|kind === 'presets'/.test(l));
  return [head, body].concat(lines).join('\n');
}
const literals = src => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);

test('new app.js lines use only structural string literals (labels come from FSFields)', () => {
  const lits = literals(newCode());
  const bad = lits.filter(s => !STRUCTURAL.has(s));
  assert.deepEqual(bad, [], `user-facing literals in new app.js code: ${JSON.stringify(bad)}`);
  assert.ok(!/`[^`]*[A-Za-z]{3,}[^`]*`/.test(newCode().replace(/\/\*[\s\S]*?\*\//g, '')), 'no template-literal prose');
});

test('the third load button, its action and the presets loader read their text from RESPONSE_CURVE_LABELS', () => {
  const code = newCode();
  ['samplePresetsButton', 'samplePresetsData', 'samplePresetsAudit', 'samplePresetsToast'].forEach(k => {
    assert.ok(code.includes(`RCL.${k}`), `uses RCL.${k}`);
    assert.ok(typeof F.RESPONSE_CURVE_LABELS[k] === 'string' && F.RESPONSE_CURVE_LABELS[k].length > 0, k);
  });
  assert.ok(/const RCL = \(F && F\.RESPONSE_CURVE_LABELS\)/.test(code));
  // The button sits next to the two existing load buttons in both Step 1 places.
  assert.equal((APP.match(/presetSampleBtn\(\)/g) || []).length, 2);
  assert.equal((APP.match(/id: 'load-sample-presets'/g) || []).length, 1);
  // Bridge until P4: curves come from the engine's resolveCurves on the configuration's default assignment.
  assert.ok(/E\.resolveCurves\(cfg\.defaultAssignment, cfg\.presets, \{\}\)/.test(code));
});
