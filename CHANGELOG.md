# Changelog

## Response curve uptake presets (fs-engine 1.11.0, fs-io 1.1.0)

Requirement IDs FR-44 to FR-48 are proposed and tagged in the page (turn on "Show requirement IDs").

### Added
- **Uptake by archetype (FR-44, FR-47).** On Model Assumptions, the Response Curve method lists the curve archetypes found in the data, never a fixed list, and each one gets an uptake preset: Slow, Moderate, Steep or Baseline (the Beghou reference presets). The curve chart's legend names the preset, and a collapsed "Advanced: curve details" table shows δ, γ, ρ and half of peak.
- **Custom curve (FR-45).** Custom (from marketing mix) takes δ, γ and ρ as plain decimals above 0 and needs one source note per project.
- **Response curve configuration (FR-46).** It is Administrator-only and opens from the header. It has four tabs:
  - **Presets:** label, description, δ/γ/ρ and picker visibility, with a mini-chart and "Reset to Beghou reference".
  - **Default assignment:** the uptake each archetype starts with.
  - **Curve library:** the read-only 17-step Beghou reference curve library, with "Copy into preset…".
  - **Flags:** value-only data for the response curve method (off by default) and Custom curves (on by default).

  Every change is audited and raises the configuration version.
- **Export and summary (FR-48).** The Scenario Summary shows the uptake per archetype, Custom with its source note, and the configuration version. Snapshots store the configuration and the uptake choices. The workbook adds a Configuration sheet and shows the uptake, source and effective curve values on the Assumptions and Response Curves sheets.
- **New synthetic sample.** "Load uptake presets synthetic sample" loads archetypes Prospects, Trialists and Early Leaders.
- **Engine (fs-engine 1.11.0).**
  - `resolveCurves` turns an uptake assignment into curve values with provenance.
  - Curve values that carry provenance are checked as numbers above 0, with no upper bound.
  - An archetype outside the reference set is valid when it has curve values.
  - Value-only data can run with a single "All HCPs" curve.
  - A curve source (provenance) without curve values is a validation error, so a preset label never sits on reference values.
- **Tests.** Engine, contract, io (including cell-for-cell back-compatibility with fs-io 1.0.0) and headless-browser UI tests.
- **Docs.**
  - `docs/requirements/field-sizing-response-curve-presets.md`
  - The developer handoff pack in `docs/handoff/response-curve-presets/`
  - `docs/review/click-through.md`

### Changed
- The inline γ/ρ table on Model Assumptions is replaced by the uptake picker. The original synthetic samples load their four archetypes as Custom with the earlier values (note "Synthetic sample reference curves"), so their results are unchanged.
- An archetype with no uptake chosen blocks the assumptions check; no curve is assumed silently.
- Earlier drafts reopen with their stored curves. A curve that was edited becomes Custom, with the note "Curve values carried over from an earlier draft", and recalculates to the same result.
- The page source is split into modules under `src/` and rebuilt by `node build.mjs`; the built file keeps its name.

### Unchanged
- Recommended FTE and every other result for the existing samples and methods. The Affordable Coverage and Workload Buildup methods are untouched.
- Value-only data for the Response Curve method stays blocked with the same message unless an Administrator turns the flag on.

### Known limitation
- File import still recognises only the four reference curve archetypes. Archetypes outside that set come from the synthetic samples for now.
