'use strict';
// P4 browser helpers (W-ASSUMP-UI): open the built page with a read-only probe on FSEngine.calculate, so a test can compare
// what the UI calculated (inputs and full-precision result) with fixtures; and the Step 1 → Step 3 walk for one sample and
// method. The probe wraps the frozen engine object before any module loads; the app and the samples see the same engine.
const B = require('./browser.cjs');

/* Installed with page.addInitScript: window.FSEngine becomes a plain copy whose calculate() records a JSON copy of every call. */
function engineProbe() {
  window.__calcs = [];
  let wrapped = null;
  Object.defineProperty(window, 'FSEngine', {
    configurable: true,
    get() { return wrapped; },
    set(real) {
      window.__realEngine = real;
      wrapped = Object.assign({}, real, {
        calculate(inputs) {
          const result = real.calculate(inputs);
          window.__calcs.push(JSON.parse(JSON.stringify({ inputs, result })));
          return result;
        }
      });
    }
  });
}

/* Old-draft injection (fix 2, F1): with window.__oldDraft = { curveParams } set, the next snapshot the app saves is turned
   into the shape an earlier build saved — no responseCurve / responseCurveConfig, no curveProvenance / customSourceNote,
   curveParams as given (or none) — with the result the real engine gives for those inputs. It hooks Object.freeze, which the
   app's deepFreeze calls on the new snapshot before freezing its parts. Test-only; the app is unchanged. */
function oldDraftProbe() {
  const freeze = Object.freeze;
  Object.freeze = function (o) {
    const spec = window.__oldDraft;
    if (spec && o && typeof o === 'object' && typeof o.id === 'string' && o.inputs && o.result && !Object.isFrozen(o)) {
      window.__oldDraft = null;
      delete o.responseCurve; delete o.responseCurveConfig;
      const ma = o.inputs.methodAssumptions;
      delete ma.curveProvenance; delete ma.customSourceNote; delete ma.curveParams;
      if (spec.curveParams) ma.curveParams = JSON.parse(JSON.stringify(spec.curveParams));
      // resultCurveParams: store a result calculated with other curves (a draft whose inputs do not reproduce its result).
      const rin = spec.resultCurveParams ? JSON.parse(JSON.stringify(o.inputs)) : o.inputs;
      if (spec.resultCurveParams) rin.methodAssumptions.curveParams = spec.resultCurveParams;
      o.result = window.__realEngine.calculate(rin);
      window.__oldResult = JSON.parse(JSON.stringify(o.result));
    }
    return freeze(o);
  };
}

async function openProbed(browser, { width = 1400, height = 1000 } = {}) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(engineProbe);
  await page.addInitScript(oldDraftProbe);
  await page.goto(require('node:url').pathToFileURL(require('node:path').join(__dirname, '..', '..', 'index-no-ai-claude.html')).href);
  await page.waitForTimeout(200);
  return { page, errors };
}
const lastCalc = page => page.evaluate(() => window.__calcs[window.__calcs.length - 1] || null);
const calcCount = page => page.evaluate(() => window.__calcs.length);

/* Sample button id -> method -> inputs check -> Model Assumptions (stops there). */
async function toAssumptions(page, sampleId, method) {
  await B.click(page, '#' + sampleId);
  await B.click(page, `#method-${method}`);   // a confirm dialog (method change) is accepted by B.click
  await B.click(page, '#run-inputs');
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]');
}
/* Model Assumptions -> assumptions check -> FTE Calculation -> calculate. Returns the calculation the Calculate button ran
   (the first engine call after the click; the result view may run more, e.g. the reallocation comparison). */
async function checkAndCalc(page) {
  await B.click(page, '[data-act="nav"][data-arg="assumptions"]', { confirm: false });
  await B.click(page, '#run-assumptions');
  await B.click(page, '[data-act="nav"][data-arg="result"]');
  return calcNow(page);
}
async function calcNow(page, sel = '#calc') {
  const n = await calcCount(page);
  await B.click(page, sel);
  return page.evaluate(k => window.__calcs[k] || null, n);
}
/* Picks an option of a custom listbox dropdown by its visible label (pointer). */
async function pick(page, ddId, label) {
  await page.click('#' + ddId); await page.waitForTimeout(80);
  const opts = await page.$$(`#${ddId}-lb [role=option]`);
  for (const o of opts) if ((await o.textContent()).trim() === label) { await o.click(); await page.waitForTimeout(120); return; }
  throw new Error(`${ddId}: no option "${label}"`);
}
const ddText = (page, ddId) => page.$eval(`#${ddId} .dd-val`, e => e.textContent.trim());
const text = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
/* Rows of the audit trail (Review and Export → Audit trail): [when, user, role, action, scenario, detail]. */
async function auditRows(page) {
  await B.click(page, '[data-act="nav"][data-arg="review"]', { confirm: false });
  await B.click(page, '#tab-audit', { confirm: false });
  return page.$$eval('.audit-t tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
}
/* Current result -> Scenario Summary -> save snapshot. */
async function saveSnapshot(page) {
  await B.click(page, '[data-act="nav"][data-arg="scenarios"]', { confirm: false });
  await B.click(page, '#save-snap', { confirm: false });
}
/* The accessible name parts of an element labelled by aria-labelledby (text of each referenced element). */
const labelledByText = (page, sel) => page.$eval(sel, e => (e.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
  .map(id => { const n = document.getElementById(id); return n ? (n.classList.contains('dd') ? n.querySelector('.dd-val').textContent : n.textContent) : ''; }).join(' ').replace(/\s+/g, ' ').trim());

module.exports = { B, openProbed, lastCalc, calcCount, toAssumptions, checkAndCalc, calcNow, pick, ddText, text, auditRows, saveSnapshot, labelledByText };
