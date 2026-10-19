# Developer Handoff - Field Sizing · Response Curve Presets

> All data shown is synthetic for demonstration purposes.

## Design System

- Name: Beghou Open Edition Non-Kendo Design System
- Mode: non-kendo-static
- Source: design-beghou/non-kendo-static
- Prototype role: Static HTML review artifact using canonical non-Kendo visual principles

## Step 2 · Uptake by archetype (wizard)

Requirements: R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012

Fields:
- Curve archetype (`curve_archetype`): enum, required=true
- HCPs (`hcps`): text, required=true
- Share (`share`): text, required=true
- Uptake (`uptake`): text, required=true

Production component mapping:
- Application stepper or KendoReact TabStrip for staged entry
- KendoReact Form controls per step
- KendoReact Dialog for final confirmation

Mapping confidence: medium
States: not started, in progress, complete

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Step 2 · Custom curve (wizard)

Requirements: R013, R014, R015, R016, R017, R018, R019, R020, R021, R022

Fields:
- Peak (δ) (`peak`): text, required=true
- Shape (γ) (`shape`): text, required=true
- Saturation (ρ) (`saturation`): text, required=true
- Source note for custom curves (`source_note_for_custom_curves`): text, required=true

Production component mapping:
- Application stepper or KendoReact TabStrip for staged entry
- KendoReact Form controls per step
- KendoReact Dialog for final confirmation

Mapping confidence: medium
States: not started, in progress, complete

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Admin configurator · Presets (admin-config-panel)

Requirements: R023, R024, R025, R026, R027, R028, R029, R030, R031, R032, R033, R034, R035, R036

Fields:
- Label (`label`): text, required=true
- Description (`description`): text, required=true
- Peak (δ) (`peak`): text, required=true
- Shape (γ) (`shape`): text, required=true
- Saturation (ρ) (`saturation`): text, required=true
- Show in the uptake picker (`show_in_the_uptake_picker`): text, required=true
- Origin (`origin`): text, required=true
- Half of peak (calls) (`half_of_peak_calls`): text, required=true

Production component mapping:
- KendoReact Grid for rule lists
- KendoReact Form controls for configuration edits
- KendoReact Switch/Checkbox for binary settings

Mapping confidence: medium
States: list, create, edit, disabled

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Admin configurator · Default assignment (admin-config-panel)

Requirements: R037, R038, R039, R040, R041, R042, R043

Fields:
- Archetype name (`archetype_name`): enum, required=true
- Uptake preset (`uptake_preset`): text, required=true

Production component mapping:
- KendoReact Grid for rule lists
- KendoReact Form controls for configuration edits
- KendoReact Switch/Checkbox for binary settings

Mapping confidence: medium
States: list, create, edit, disabled

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Admin configurator · Curve library (admin-config-panel)

Requirements: R044, R045, R046, R047, R048

Fields:
- Step (`step`): text, required=true
- Peak (δ) (`peak`): text, required=true
- Shape (γ) (`shape`): text, required=true
- Saturation (ρ) (`saturation`): text, required=true
- Half of peak (calls) (`half_of_peak_calls`): text, required=true

Production component mapping:
- KendoReact Grid for rule lists
- KendoReact Form controls for configuration edits
- KendoReact Switch/Checkbox for binary settings

Mapping confidence: medium
States: list, create, edit, disabled

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Admin configurator · Flags (admin-config-panel)

Requirements: R049, R050, R051, R052, R053

Fields:
- Allow value-only data for the response curve method (`allow_value_only_data_for_the_response_curve_method`): text, required=true
- Allow custom curves (`allow_custom_curves`): text, required=true

Production component mapping:
- KendoReact Grid for rule lists
- KendoReact Form controls for configuration edits
- KendoReact Switch/Checkbox for binary settings

Mapping confidence: high
States: list, create, edit, disabled

Data notes: Synthetic generic records only; No source PII copied into prototype data

## Global Permissions

- Administrator: view
- Sizing Analyst: view
- Engagement Lead: view

## Open Questions

- FR-44 (proposed): confirm the ID and wording against the PRD.
- FR-45 (proposed): confirm the ID and wording against the PRD.
- FR-46 (proposed): confirm the ID and wording against the PRD.
- FR-47 (proposed): confirm the ID and wording against the PRD.
- FR-48 (proposed): confirm the ID and wording against the PRD.
- Confirm that the four Beghou reference presets are meant as generic presets.
- Confirm whether the Administrator may approve scenarios (TBD in the PRD).
- Confirm the deck numbering: R001 = FR-44, R002 = FR-47, R013 = FR-45, R023 = FR-46, R024 = FR-48 (FR-48 sits under Presets because there is no Export page).

## Risks

- Baseline sits between Slow and Moderate in steepness; presenting it as the middle option would mislead users.
- Allowing value-only data applies one curve to every HCP, so per-archetype differences are lost for that project.
- The generated permission tables (per-page Permissions slides, Permissions Matrix, Global Permissions) show every role as view-only on every page. Use the Permissions section: only the Administrator opens the configurator; the Sizing Analyst and Engagement Lead edit uptake and Custom curves.
- Field types, Required flags, page states and mock-up rows are generator defaults; read-only fields and behaviour are in the requirements document. The generated prototype is not shipped; the review mock-up is the prototype of record.

## Security Assumptions

- Backend authorization is the source of truth; frontend route guards are advisory only.
- Tenant isolation must be enforced server-side for every API and data access path.
- Audit logging should capture sensitive workflow decisions and administrative changes.
- Uploads and pasted documents must be sanitized before storage, parsing, or preview.
- Production deployments should enforce CSP and security headers; generated HTML includes only local artifacts, and screenshot capture blocks outbound network requests.
