# Field Sizing Composer mockup

Deterministic (no-AI) prototype of Arc Composer Field Sizing: one self-contained offline HTML file.

- `index-no-ai-claude.html` is the prototype (2026-10-12 review build: fs-engine 1.10.0, fs-io 1.0.0).
- `index.html` redirects to it for GitHub Pages.

The 2026-10-12 review build follows the v0.5.1 sizing SME review of 2026-10-05 and adds:
- response curve shape (gamma) and saturation (rho) editable per curve archetype;
- value allocated in proportion to composite value only;
- reallocation of value from excluded segments on by default;
- a first-year-only "adds to 100%" check on the forecast shares.

## Source and build

The HTML file is built from the modules in `src/` by plain concatenation; there are no dependencies.

| Path | Global | Role |
|---|---|---|
| `src/contract/fields.js` | `FSFields` | Labels, options and the data contract |
| `src/engine/engine.js` | `FSEngine` | Calculation engine (pure functions) |
| `src/io/io.js` | `FSIO` | File import and workbook export |
| `src/ui/sample-data.js` | `FSSample` | Synthetic demonstration data |
| `src/ui/app.js` | — | User interface |
| `src/shell/*.html` | — | Page head (styles) and closing tags |

```sh
node build.mjs            # rebuild index-no-ai-claude.html from src/
node build.mjs --check    # fail if the committed file differs from the build
node --test tests/        # tests (node:test, Node 18+)
node scripts/qc.mjs --phase P0   # deterministic QC checks
```

All data shown is synthetic for demonstration purposes.
