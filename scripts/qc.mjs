// Deterministic QC gate (G1) for the Field Sizing mock-up. Dependency-free; Node 18+.
// Usage: node scripts/qc.mjs --phase P0..P7 [--base <git ref>] [--pr-body <file>] [--only Q1,Q2,...]
//   Q1 tests · Q2 reproducible build · Q3 write scope · Q4 confidentiality · Q5 self-contained HTML
//   Q6 version strings · Q7 requirement tags · Q8 headless console check (skipped when no browser is configured)
// Local-only inputs (never committed) live in .private/: qc-banned.txt (Q4 token list), qc-env.json (Q8 browser paths).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const BASE = arg('--base', null);
const PR_BODY = arg('--pr-body', null);
const ONLY = arg('--only', null) ? arg('--only').split(',') : null;

/* Lane write scopes (plan §0.3). index-no-ai-claude.html is the committed build output of src/, so every code lane may change it. */
const SCOPES = {
  P0: ['.gitignore', '.claude/agents/**', 'src/**', 'build.mjs', 'scripts/qc.mjs', 'tests/**', 'README.md'],
  P1: ['src/engine/**', 'tests/engine/**', TARGET],
  P2: ['src/contract/**', 'src/ui/sample-data.js', 'src/ui/app.js', 'tests/contract/**', TARGET],
  P3: ['src/ui/app.js', 'src/ui/configurator.js', 'build.mjs', 'tests/ui/**', 'tests/contract/**', TARGET],
  P4: ['src/ui/app.js', 'src/ui/configurator.js', 'tests/ui/**', TARGET],
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
  const r = spawnSync(process.execPath, ['--test', ...dirs], { cwd: ROOT, encoding: 'utf8' });
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
  if (!BASE) { record('Q3', true, 'no --base given', true); return; }
  const changed = new Set([
    ...git('diff', '--name-only', BASE).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n')
  ].filter(Boolean));
  const scope = SCOPES[`P${PN}`].map(globRe);
  const out = [...changed].filter(f => !scope.some(re => re.test(f)));
  record('Q3', out.length === 0, out.length ? `outside scope: ${out.join(', ')}` : `${changed.size} changed paths, all in scope`);
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
  files.forEach(f => { const p = path.join(ROOT, f); if (fs.existsSync(p) && fs.statSync(p).isFile()) scan(f, fs.readFileSync(p, 'latin1')); });
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
  if (/<(img|iframe|source|video|audio|embed|object)\b[^>]*\b(src|data)\s*=\s*["']?(https?:)?\/\//i.test(html)) bad.push('external media');
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
  const missing = ids.filter(id => !new RegExp(`${id} \\(proposed\\)`).test(html));
  record('Q7', missing.length === 0, missing.length ? `missing "<id> (proposed)" tags: ${missing.join(', ')}` : `${ids.join(', ')} tagged (proposed)`);
}

// Q8: load the page and each synthetic sample flow headless; no console errors or page errors.
async function q8() {
  const envFile = path.join(ROOT, '.private', 'qc-env.json');
  const env = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8')) : {};
  const pwc = process.env.FS_PLAYWRIGHT_CORE || env.playwrightCore;
  const chrome = process.env.FS_CHROME || env.chrome;
  if (!pwc || !chrome || !fs.existsSync(pwc) || !fs.existsSync(chrome)) { record('Q8', true, 'no headless browser configured', true); return; }
  const { chromium } = createRequire(import.meta.url)(pwc);
  const libs = process.env.FS_LD_LIBRARY_PATH || env.ldLibraryPath;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, env: Object.assign({}, process.env, libs ? { LD_LIBRARY_PATH: libs } : {}) });
  const errs = [];
  const flows = ['load-sample', 'load-sample-multi', 'load-sample-presets'];
  let ran = 0;
  try {
    for (const id of [null, ...flows]) {
      const page = await browser.newPage();
      page.on('console', m => { if (m.type() === 'error') errs.push(`${id || 'load'}: ${m.text()}`); });
      page.on('pageerror', e => errs.push(`${id || 'load'}: ${e.message}`));
      await page.goto(pathToFileURL(path.join(ROOT, TARGET)).href);
      await page.waitForTimeout(300);
      if (id) {
        const el = await page.$('#' + id);
        if (!el) { if (id !== 'load-sample-presets' || PN >= 2) errs.push(`${id}: button not found`); await page.close(); continue; }
        await el.click(); await page.waitForTimeout(300);
        for (const m of ['affordable', 'response', 'workload']) {
          await page.evaluate(mm => { const b = document.querySelector(`[data-act="method"][data-v="${mm}"], #method-${mm}`); if (b) b.click(); }, m);
          await page.waitForTimeout(100);
        }
      }
      ran++;
      await page.close();
    }
  } finally { await browser.close(); }
  record('Q8', errs.length === 0, errs.length ? errs.slice(0, 10).join(' | ') : `${ran} page loads, no console errors`);
}

const order = [['Q1', q1], ['Q2', q2], ['Q3', q3], ['Q4', q4], ['Q5', q5], ['Q6', q6], ['Q7', q7], ['Q8', q8]];
for (const [id, fn] of order) if (want(id)) { try { await fn(); } catch (e) { record(id, false, `error: ${e.message}`); } }
console.log(`QC ${PHASE}${BASE ? ` (base ${BASE})` : ''}`);
results.forEach(r => console.log(`${r.status.padEnd(4)} ${r.id}  ${r.detail}`));
process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
