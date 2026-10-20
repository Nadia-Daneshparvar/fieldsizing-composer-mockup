// Deterministic QC gate (G1) for the Field Sizing mock-up. Dependency-free; Node 18+.
// Usage: node scripts/qc.mjs --phase P0..P7 [--base <git ref>] [--pr-body <file>] [--only Q1,Q2,...] [--require-browser]
//   --base is required from P1 on (the phase base commit); P0 defaults to merge-base with origin/main.
//   Q1 tests · Q2 reproducible build · Q3 write scope · Q4 confidentiality · Q5 self-contained HTML
//   Q6 version strings · Q7 requirement tags · Q8 headless console check (skipped when no browser is configured)
// Local-only inputs (never committed) live in .private/: qc-banned.txt (Q4 token list), qc-env.json (Q8 browser paths).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'index-no-ai-claude.html';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PHASE = arg('--phase', 'P0');
const PN = Number(String(PHASE).replace(/^P/i, ''));
if (!Number.isInteger(PN) || PN < 0 || PN > 7) { console.error('--phase must be P0..P7'); process.exit(2); }
let BASE = arg('--base', null);
if (!BASE && PN >= 1) { console.error('--base <phase base commit> is required from P1 on'); process.exit(2); }
if (!BASE) { try { BASE = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { BASE = null; } }
const PR_BODY = arg('--pr-body', null);
const REQUIRE_BROWSER = args.includes('--require-browser');
const ONLY = arg('--only', null) ? arg('--only').split(',') : null;

/* Lane write scopes (plan §0.3). index-no-ai-claude.html is the committed build output of src/, so every code lane may change it. */
const SCOPES = {
  P0: ['.gitignore', '.claude/agents/**', 'src/**', 'build.mjs', 'scripts/qc.mjs', 'tests/**', 'README.md'],
  P1: ['src/engine/**', 'tests/engine/**', TARGET],
  P2: ['src/contract/**', 'src/ui/sample-data.js', 'src/ui/app.js', 'tests/contract/**', TARGET],
  P3: ['src/ui/app.js', 'src/ui/configurator.js', 'build.mjs', 'tests/ui/**', 'tests/contract/**', 'src/contract/fields.js', 'src/shell/head.html', TARGET],   // D-RUN-07: fix cycle may add labels and one CSS rule
  P4: ['src/ui/app.js', 'src/ui/configurator.js', 'tests/ui/**', 'tests/contract/t6-app-labels.test.cjs', 'src/contract/fields.js', TARGET],   // D-RUN-10: retire the P2 bridge check; additive labels
  P5: ['src/io/**', 'tests/io/**', TARGET],
  P6: ['docs/requirements/**', 'docs/handoff/**'],
  P7: ['CHANGELOG.md', 'README.md', 'docs/review/**', TARGET, 'src/**', 'tests/**']
};

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const results = [];
const record = (id, ok, detail, skipped = false) => results.push({ id, status: skipped ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail });
const want = id => !ONLY || ONLY.includes(id);
const globRe = g => new RegExp('^' + g.split('**').map(s => s.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');

async function buildText() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'build.mjs')).href);
  return mod.build();
}

// Q1: full test suite (plus .private/tests when present).
function q1() {
  const dirs = ['tests'];
  if (fs.existsSync(path.join(ROOT, '.private', 'tests'))) dirs.push('.private/tests');
  // Explicit test files: Node 22+ treats a directory argument as a script, not a folder to search.
  const files = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${d}/${e.name}`) : /\.test\.c?js$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const r = spawnSync(process.execPath, ['--test', ...dirs.flatMap(files).sort()], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = k => { const x = out.match(new RegExp(`^# ${k} (\\d+)`, 'm')); return x ? +x[1] : null; };
  const pass = m('pass'), fail = m('fail');
  record('Q1', r.status === 0 && fail === 0 && pass > 0, `tests ${m('tests')} pass ${pass} fail ${fail}${dirs.length > 1 ? ' (includes .private/tests)' : ''}`);
  if (r.status !== 0) console.log(out.split('\n').filter(l => /^not ok|# Subtest|Error|expected|actual/.test(l)).slice(0, 40).join('\n'));
}

// Q2: two builds are identical and equal the committed file.
async function q2() {
  const a = await buildText(), b = await buildText();
  const h = s => crypto.createHash('sha256').update(s).digest('hex');
  const committed = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  record('Q2', h(a) === h(b) && h(a) === h(committed), `build sha256 ${h(a).slice(0, 16)}… committed ${h(committed).slice(0, 16)}…`);
}

// Q3: changed paths since --base (committed, staged, unstaged and untracked) are inside the phase write scope.
function q3() {
  if (!BASE) { record('Q3', false, 'no --base given and no merge-base with origin/main'); return; }
  const changed = new Set([
    ...git('diff', '--name-only', '--no-renames', BASE).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n')
  ].filter(Boolean));
  const scope = SCOPES[`P${PN}`].map(globRe);
  const out = [...changed].filter(f => !scope.some(re => re.test(f)));
  record('Q3', out.length === 0, out.length ? `outside scope: ${out.join(', ')}` : `${changed.size} changed paths, all in scope`);
}

// Reads every entry of a zip archive (stored or deflated) from its local headers; null when the archive cannot be read.
function zipParts(buf) {
  const out = [];
  let o = 0;
  try {
    while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
      const flags = buf.readUInt16LE(o + 6), method = buf.readUInt16LE(o + 8);
      let csize = buf.readUInt32LE(o + 18);
      const nlen = buf.readUInt16LE(o + 26), xlen = buf.readUInt16LE(o + 28);
      const name = buf.toString('utf8', o + 30, o + 30 + nlen);
      const start = o + 30 + nlen + xlen;
      if (flags & 8) {                                   // sizes in a data descriptor: find the next header via the central directory
        const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        let q = cd, found = false;
        while (q >= 0 && q + 46 <= buf.length && buf.readUInt32LE(q) === 0x02014b50) {
          const n2 = buf.readUInt16LE(q + 28), lo = buf.readUInt32LE(q + 42);
          if (lo === o) { csize = buf.readUInt32LE(q + 20); found = true; break; }
          q += 46 + n2 + buf.readUInt16LE(q + 30) + buf.readUInt16LE(q + 32);
        }
        if (!found) return null;
      }
      const raw = buf.subarray(start, start + csize);
      const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
      if (data === null) return null;
      out.push([name, data.toString('utf8')]);
      o = start + csize + ((flags & 8) ? (buf.readUInt32LE(start + csize) === 0x08074b50 ? 16 : 12) : 0);
    }
  } catch (e) { return null; }
  return out.length ? out : null;
}

// Q4: no banned token in tracked/untracked-unignored files, branch commit messages or the PR body draft.
function q4() {
  const listFile = path.join(ROOT, '.private', 'qc-banned.txt');
  if (!fs.existsSync(listFile)) { record('Q4', false, '.private/qc-banned.txt is missing (local-only list required)'); return; }
  const lines = fs.readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const allow = lines.filter(s => s.startsWith('allow:')).map(s => s.slice(6));
  const pats = lines.filter(s => !s.startsWith('allow:')).map(s => s.startsWith('re:') ? new RegExp(s.slice(3), 'g') : new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
  const hits = [];
  const scan = (label, text) => {
    for (const re of pats) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!allow.includes(m[0])) { hits.push(`${label}: pattern #${pats.indexOf(re) + 1}`); break; } } }
  };
  const files = [...new Set([...git('ls-files').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))];
  const unscannable = [];
  files.forEach(f => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return;
    const buf = fs.readFileSync(p);
    if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {            // zip container (pptx, xlsx, docx, …): scan every part
      const parts = zipParts(buf);
      if (parts === null) unscannable.push(f); else parts.forEach(([name, text]) => scan(`${f}!${name}`, text));
    } else if (/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf)$/i.test(f) || buf.includes(0)) {
      if (!/\.(png|jpe?g|gif|webp|ico)$/i.test(f)) unscannable.push(f);    // images carry no text; other binaries must not be committed unscanned
    } else scan(f, buf.toString('utf8'));
  });
  if (unscannable.length) hits.push(`unscannable binary: ${unscannable.join(', ')}`);
  let range = 'HEAD';
  try { git('rev-parse', '--verify', 'origin/main'); range = 'origin/main..HEAD'; } catch (e) { /* no remote ref: scan all */ }
  scan('commit messages', git('log', '--format=%B', range));
  if (PR_BODY) scan(`PR body ${PR_BODY}`, fs.readFileSync(path.resolve(PR_BODY), 'utf8'));
  // Report the file and the list position only, never the matched text.
  record('Q4', hits.length === 0, hits.length ? hits.slice(0, 20).join('; ') : `${files.length} files, commit messages${PR_BODY ? ', PR body' : ''} clean`);
}

// Q5: self-contained built HTML; filename kept; index.html redirects.
function q5() {
  const html = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  const bad = [];
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) bad.push('<script src>');
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) bad.push('<link rel=stylesheet>');
  if (/\bfetch\s*\(/.test(html)) bad.push('fetch(');
  if (/XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon/.test(html)) bad.push('network API');
  if (/@import\b/.test(html)) bad.push('@import');
  if (/@font-face/.test(html)) bad.push('@font-face');
  if (/url\(\s*["']?(https?:)?\/\//i.test(html)) bad.push('external url()');
  if (/<(?!a\b)[a-z][\w-]*\b[^>]*\b(src|href|srcset|data|poster)\s*=\s*["']?(https?:)?\/\//i.test(html)) bad.push('external src/href');
  if (/\bimport\s*\(|new\s+EventSource|\.src\s*=\s*["'`](https?:)?\/\//.test(html)) bad.push('dynamic import / EventSource / remote .src');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!new RegExp(`http-equiv="refresh"[^>]*url=${TARGET.replace(/\./g, '\\.')}`).test(idx)) bad.push('index.html redirect');
  record('Q5', bad.length === 0, bad.length ? bad.join(', ') : 'self-contained; index.html redirects');
}

// Q6: version strings for the phase.
function q6() {
  const html = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  const eng = (html.match(/const VERSION = 'fs-engine ([\d.]+)'/) || [])[1];
  const io = (html.match(/version: 'fs-io ([\d.]+)'/) || [])[1];
  const wantEng = PN >= 1 ? '1.11.0' : '1.10.0';
  const ioOk = PN >= 5 ? io === '1.1.0' : (io === '1.0.0' || io === '1.1.0');
  record('Q6', eng === wantEng && ioOk, `fs-engine ${eng} (want ${wantEng}); fs-io ${io} (want ${PN >= 5 ? '1.1.0' : '1.0.0 or 1.1.0'})`);
}

// Q7: requirement tags marked proposed. P3: FR-46 (configurator); P4: FR-44..47; P5 and later: FR-44..48.
function q7() {
  if (PN < 3) { record('Q7', true, 'not required before P3', true); return; }
  const html = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
  const ids = PN === 3 ? ['FR-46'] : PN === 4 ? ['FR-44', 'FR-45', 'FR-46', 'FR-47'] : ['FR-44', 'FR-45', 'FR-46', 'FR-47', 'FR-48'];
  const missing = ids.filter(id => !new RegExp(`rq\\(\\s*['"\`][^'"\`]*${id} \\(proposed\\)`).test(html));
  record('Q7', missing.length === 0, missing.length ? `missing "<id> (proposed)" tags: ${missing.join(', ')}` : `${ids.join(', ')} tagged (proposed)`);
}

// Q8: headless walk of every synthetic sample x method: load sample -> select method -> inputs check -> Model Assumptions
// -> assumptions check -> FTE Calculation -> calculate; asserts each step really happened and no console/page errors.
async function q8() {
  const envFile = path.join(ROOT, '.private', 'qc-env.json');
  const env = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8')) : {};
  const pwc = process.env.FS_PLAYWRIGHT_CORE || env.playwrightCore;
  const chrome = process.env.FS_CHROME || env.chrome;
  if (!pwc || !chrome || !fs.existsSync(pwc) || !fs.existsSync(chrome)) { record('Q8', !REQUIRE_BROWSER, 'no headless browser configured', !REQUIRE_BROWSER); return; }
  const { chromium } = createRequire(import.meta.url)(pwc);
  const libs = process.env.FS_LD_LIBRARY_PATH || env.ldLibraryPath;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, env: Object.assign({}, process.env, libs ? { LD_LIBRARY_PATH: libs } : {}) });
  const errs = [];
  const samples = ['load-sample', 'load-sample-multi'].concat(PN >= 2 ? ['load-sample-presets'] : []);
  const methods = ['affordable', 'response', 'workload'];
  const url = pathToFileURL(path.join(ROOT, TARGET)).href;
  let walked = 0;
  const step = async (page, sel, label) => {
    const el = await page.$(sel);
    if (!el) throw new Error(`${label}: ${sel} not found`);
    if (await el.getAttribute('aria-disabled') === 'true' || await el.isDisabled()) throw new Error(`${label}: ${sel} is disabled`);
    await el.click(); await page.waitForTimeout(120);
    const ok = await page.$('#dlg-ok'); if (ok) { await ok.click(); await page.waitForTimeout(120); }
  };
  try {
    { // bare page load
      const page = await browser.newPage();
      page.on('console', m => { if (m.type() === 'error') errs.push(`load: ${m.text()}`); });
      page.on('pageerror', e => errs.push(`load: ${e.message}`));
      await page.goto(url); await page.waitForTimeout(300); await page.close();
    }
    for (const sample of samples) for (const m of methods) {
      const tag = `${sample}/${m}`;
      const page = await browser.newPage();
      page.on('console', msg => { if (msg.type() === 'error') errs.push(`${tag}: ${msg.text()}`); });
      page.on('pageerror', e => errs.push(`${tag}: ${e.message}`));
      try {
        await page.goto(url); await page.waitForTimeout(200);
        await step(page, '#' + sample, tag);
        await step(page, `#method-${m}`, tag);
        if (await page.getAttribute(`#method-${m}`, 'aria-checked') !== 'true') throw new Error(`${tag}: method not selected`);
        await step(page, '#run-inputs', tag);
        await step(page, '[data-act="nav"][data-arg="assumptions"]', tag);
        await step(page, '#run-assumptions', tag);
        await step(page, '[data-act="nav"][data-arg="result"]', tag);
        await step(page, '#calc', tag);
        const done = await page.evaluate(() => {
          const cur = document.querySelector('[data-act="nav"][data-arg="result"][aria-current]');
          const txt = document.getElementById('main') ? document.getElementById('main').innerText : '';
          const errUi = document.querySelectorAll('#main .err[role="alert"], #toasts .toast-error').length;
          return { cur: !!cur, fte: /Recommended FTE/i.test(txt), stale: !!document.getElementById('calc-stale'), errUi };
        });
        if (!done.cur || !done.fte || done.stale || done.errUi) throw new Error(`${tag}: no result rendered (${JSON.stringify(done)})`);
        walked++;
      } catch (e) { errs.push(e.message); }
      await page.close();
    }
  } finally { await browser.close(); }
  record('Q8', errs.length === 0, errs.length ? errs.slice(0, 10).join(' | ') : `page load + ${walked}/${samples.length * methods.length} sample x method walks to a calculated result, no console errors`);
}

const order = [['Q1', q1], ['Q2', q2], ['Q3', q3], ['Q4', q4], ['Q5', q5], ['Q6', q6], ['Q7', q7], ['Q8', q8]];
for (const [id, fn] of order) if (want(id)) { try { await fn(); } catch (e) { record(id, false, `error: ${e.message}`); } }
console.log(`QC ${PHASE}${BASE ? ` (base ${BASE})` : ''}`);
results.forEach(r => console.log(`${r.status.padEnd(4)} ${r.id}  ${r.detail}`));
process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
