# Field Sizing Composer mockup

Deterministic (no-AI) prototype of Arc Composer Field Sizing: one self-contained offline HTML file.

- `index-no-ai-claude.html` is the prototype (response curve uptake presets build: fs-engine 1.11.0, fs-io 1.1.0).
- `index.html` redirects to it for GitHub Pages.

The response curve uptake presets build adds, on top of the 2026-10-12 review build:
- an uptake preset per curve archetype on Model Assumptions (Slow, Moderate, Steep, Baseline), with archetypes read from the data;
- a Custom curve with a required source note;
- an Administrator-only response curve configuration (presets, default assignment, curve library, flags);
- the configuration and the uptake per archetype in the Scenario Summary, the audit trail and the exported workbook.

See `CHANGELOG.md`, the requirements in `docs/requirements/field-sizing-response-curve-presets.md`, the developer handoff pack in `docs/handoff/response-curve-presets/` and the reviewer click-through in `docs/review/click-through.md`.

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
| `src/ui/configurator.js` | `FSConfigurator` | Response curve configuration (Administrator) |
| `src/ui/app.js` | — | User interface |
| `src/shell/*.html` | — | Page head (styles) and closing tags |

```sh
node build.mjs            # rebuild index-no-ai-claude.html from src/
node build.mjs --check    # fail if the committed file differs from the build
node --test tests/        # tests (node:test, Node 18+); browser tests skip without a configured headless Chrome
node scripts/qc.mjs --phase P7 --base main   # deterministic QC checks
```

Tests live in `tests/engine`, `tests/contract`, `tests/io` and `tests/ui` (headless-browser walks of the page).

The developer handoff deck numbers requirements with generated ids: R001 = FR-44, R002 = FR-47, R013 = FR-45, R023 = FR-46, R024 = FR-48. Its generated permission tables show every role as view-only; the Permissions section of the requirements document is authoritative (only the Administrator opens the configurator and is read-only elsewhere; the Sizing Analyst and Engagement Lead edit uptake and Custom curves).

All data shown is synthetic for demonstration purposes.
