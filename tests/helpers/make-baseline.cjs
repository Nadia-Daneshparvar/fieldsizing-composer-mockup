'use strict';
// Writes tests/fixtures/baseline-fs-engine-<version>.json from the current src/ engine. Run once on the untouched engine.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./modules.cjs');
const { CASES, sampleInputs, comparable } = require('./sample-inputs.cjs');
const mods = load();
const out = { engineVersion: mods.FSEngine.version, cases: {} };
CASES.forEach(c => {
  const inputs = sampleInputs(c.kind, c.method, mods);
  const res = mods.FSEngine.calculate(inputs);
  out.cases[c.id] = { inputsHash: res.inputsHash, outputs: comparable(res) };
});
const file = path.join(__dirname, '..', 'fixtures', `baseline-${mods.FSEngine.version.replace(/ /g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', path.relative(process.cwd(), file));
