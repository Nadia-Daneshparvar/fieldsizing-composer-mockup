'use strict';
// Headless-browser helper for the UI tests. Uses the local playwright-core and Chrome named in .private/qc-env.json
// (or FS_PLAYWRIGHT_CORE / FS_CHROME / FS_LD_LIBRARY_PATH), the same way scripts/qc.mjs Q8 does.
// available() is false when no browser is configured, so the tests skip cleanly; the controller runs them with one.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = path.join(ROOT, 'index-no-ai-claude.html');
function env() {
  const f = path.join(ROOT, '.private', 'qc-env.json');
  const e = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  return { pwc: process.env.FS_PLAYWRIGHT_CORE || e.playwrightCore, chrome: process.env.FS_CHROME || e.chrome, libs: process.env.FS_LD_LIBRARY_PATH || e.ldLibraryPath };
}
function available() { const e = env(); return !!(e.pwc && e.chrome && fs.existsSync(e.pwc) && fs.existsSync(e.chrome)); }
async function launch() {
  const e = env();
  const { chromium } = require(e.pwc);
  return chromium.launch({ executablePath: e.chrome, headless: true, env: Object.assign({}, process.env, e.libs ? { LD_LIBRARY_PATH: e.libs } : {}) });
}
async function openApp(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(TARGET).href); await page.waitForTimeout(200);
  return { page, errors };
}
async function click(page, sel, { confirm = true } = {}) {
  const el = await page.$(sel);
  if (!el) throw new Error(`${sel} not found`);
  if (await el.getAttribute('aria-disabled') === 'true') throw new Error(`${sel} is disabled`);
  await el.click(); await page.waitForTimeout(100);
  if (confirm) { const ok = await page.$('#dlg-ok'); if (ok) { await ok.click(); await page.waitForTimeout(100); } }
}
/* Sample -> Affordable -> checks -> calculate -> snapshot -> recommend -> submit, ending on Review and Export as the Analyst. */
async function walkToReview(page) {
  await click(page, '#load-sample');
  await click(page, '#method-affordable');
  await click(page, '#run-inputs');
  await click(page, '[data-act="nav"][data-arg="assumptions"]');
  await click(page, '#run-assumptions');
  await click(page, '[data-act="nav"][data-arg="result"]');
  await click(page, '#calc');
  await click(page, '[data-act="nav"][data-arg="scenarios"]');
  await click(page, '#save-snap');
  await click(page, '[data-act="recommend"]', { confirm: false });
  await page.fill('#dlg-note', 'Synthetic test recommendation');
  await click(page, '#dlg-ok', { confirm: false });
  await click(page, '[data-act="nav"][data-arg="review"]');
  await click(page, '#rv-submit');
}
/* The demo role switcher on Review and Export ("Switch role on Review and Export"). */
async function setRole(page, role) {
  if (!(await page.$(`#role-${role}`))) await click(page, '[data-act="nav"][data-arg="review"]');
  await click(page, `#role-${role}`, { confirm: false });
}
module.exports = { available, launch, openApp, click, walkToReview, setRole };
