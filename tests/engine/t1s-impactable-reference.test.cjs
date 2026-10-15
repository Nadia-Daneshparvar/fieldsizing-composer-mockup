'use strict';
// T1s: FSEngine.impactableValue against an independent reference implementation of the reference-workbook value chain,
// on synthetic inputs only. The reference below is written from the formula statement, not from engine.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { FSEngine } = load();

/* other = F x other%; new SF = max(0, F - other - carry-in); every cohort decays by the receiving year's carryover rate;
   cohort value = new SF + sum(t = 1..tail) retained / (1 + d)^t; annual = sum(window cohorts) x GM / window. */
function reference({ forecast, carryPct, otherPct, firstYear, startYear, discountPct, gmPct, window, tail }) {
  const n = forecast.length;
  const retained = [];          // retained[c][y]: cohort c still selling in year y
  const newSF = [];
  for (let y = 0; y < n; y++) {
    const rate = carryPct[y] / 100;
    let carryIn = 0;
    for (let c = 0; c < y; c++) { retained[c][y] = retained[c][y - 1] * rate; carryIn += retained[c][y]; }
    const other = forecast[y] * otherPct[y] / 100;
    newSF[y] = Math.max(0, forecast[y] - other - carryIn);
    retained[y] = new Array(n).fill(0);
    retained[y][y] = newSF[y];
  }
  const d = discountPct / 100;
  const perYear = [];
  for (let k = 0; k < window; k++) {
    const c = startYear - firstYear + k;
    let v = newSF[c];
    for (let t = 1; t <= tail; t++) v += retained[c][c + t] / Math.pow(1 + d, t);
    perYear.push(v);
  }
  return { perYear, annual: perYear.reduce((a, b) => a + b, 0) * (gmPct / 100) / window, newSF };
}

function engine(s) {
  const value = { years: s.forecast.map((f, i) => ({ year: s.firstYear + i, forecast: f, carryoverPct: s.carryPct[i], otherChannelPct: s.otherPct[i] })),
    sizingStartYear: s.startYear, grossMarginPct: s.gmPct, forecastMode: 'carryover+other' };
  return FSEngine.impactableValue(value, { discountRatePct: s.discountPct, horizon: { windowYears: s.window, tailYears: s.tail } });
}

const close = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

const SCENARIOS = {
  'steady growth': { forecast: [40e6, 55e6, 70e6, 80e6, 85e6, 0], carryPct: [0, 40, 40, 45, 50, 0], otherPct: [20, 20, 25, 25, 30, 0], firstYear: 2030, startYear: 2031, discountPct: 8, gmPct: 85, window: 3, tail: 2 },
  'launch from zero': { forecast: [0, 12e6, 30e6, 45e6, 50e6], carryPct: [0, 0, 35, 35, 35], otherPct: [0, 5, 10, 10, 15], firstYear: 2040, startYear: 2040, discountPct: 12, gmPct: 100, window: 3, tail: 2 },
  'new SF floors at 0': { forecast: [100e6, 60e6, 50e6, 45e6, 40e6], carryPct: [0, 90, 90, 90, 90], otherPct: [10, 50, 50, 50, 50], firstYear: 2050, startYear: 2050, discountPct: 5, gmPct: 70, window: 3, tail: 2 }
};

for (const [name, s] of Object.entries(SCENARIOS)) {
  test(`T1s impactable value matches the independent reference: ${name}`, () => {
    const ref = reference(s), got = engine(s);
    assert.deepEqual(got.errors, []);
    assert.equal(got.perYear.length, s.window);
    got.perYear.forEach((v, i) => assert.ok(close(v, ref.perYear[i]), `perYear[${i}] ${v} vs ${ref.perYear[i]}`));
    assert.ok(close(got.annual, ref.annual), `annual ${got.annual} vs ${ref.annual}`);
  });
}

test('T1s the floor scenario really floors new SF at 0', () => {
  const ref = reference(SCENARIOS['new SF floors at 0']);
  assert.ok(ref.newSF.some(v => v === 0), 'reference has a floored year');
  const got = engine(SCENARIOS['new SF floors at 0']);
  assert.ok(got.cohorts.some(c => c.floored && c.newImpactable === 0), 'engine reports a floored cohort');
});
