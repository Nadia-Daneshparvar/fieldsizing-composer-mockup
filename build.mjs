// Rebuilds the single self-contained index-no-ai-claude.html from src/ by plain concatenation (no dependencies).
// Usage: node build.mjs [--out <file>] [--check]
//   --check  exit 1 when the committed index-no-ai-claude.html differs from the build output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PARTS = [
  'src/shell/head.html',
  'src/contract/fields.js',
  'src/engine/engine.js',
  'src/io/io.js',
  'src/ui/sample-data.js',
  'src/ui/app.js',
  'src/shell/tail.html',
];
export const TARGET = 'index-no-ai-claude.html';

export function build() {
  return PARTS.map(p => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = build();
  if (args.includes('--check')) {
    const committed = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
    if (committed !== out) { console.error(`${TARGET} differs from the build output; run node build.mjs`); process.exit(1); }
    console.log(`${TARGET} matches the build output`);
  } else {
    const i = args.indexOf('--out');
    const dest = i >= 0 ? args[i + 1] : TARGET;
    if (!dest || path.basename(dest) !== path.basename(dest).replace(/[^\w.-]/g, '')) { console.error('bad --out'); process.exit(2); }
    fs.writeFileSync(i >= 0 ? path.resolve(dest) : path.join(ROOT, TARGET), out);
    console.log(`wrote ${i >= 0 ? dest : TARGET} (${Buffer.byteLength(out)} bytes)`);
  }
}
