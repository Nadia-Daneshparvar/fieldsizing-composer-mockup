---
domain: generic
app_name: Field Sizing · Response Curve Presets
brand: default
locale: en_US
audience: developers
must_have_policy: explicit-only
---

# Field Sizing · Response Curve Presets

## Step 2 · Uptake by archetype

- FR-44 (proposed), Must-Have: Uptake preset per archetype (Slow / Moderate / Steep / Baseline) with raw parameters hidden by default.
- FR-47 (proposed), Must-Have: Archetypes are read from the data (no fixed archetype list).
- The module shows this grid on the Model Assumptions step, in the Method-specific card for the Profitability / Response Curve method, under the heading "Uptake by archetype".
- The module shows displayed columns: Curve archetype, HCPs, Share, Uptake. The HCPs header follows the project grain (HCPs, Accounts or Sites).
- The module builds one row per curve archetype found in the data (entity rows first, else segment archetype mixes or single segment archetypes), plus a "No archetype supplied" row when some data carries none; the HCPs and Share cells are read-only.
- The module offers, in the Uptake picker, every preset marked "Show in the uptake picker" in the order Slow uptake, Moderate uptake, Steep uptake, Baseline, followed by Custom (from marketing mix); Baseline is never presented as the middle option.
- The module starts each archetype on its default assignment; an archetype without a default starts as "Not chosen".
- The module treats "Not chosen" as a blocking assumptions-check issue ("Choose an uptake for <archetype>."), so no hidden default curve is ever applied.
- The module writes one audit row per uptake change: "Uptake for <archetype>: <old> → <new>".
- The module plots the normalized response of each archetype's effective curve in the curve chart; the legend reads "<archetype>: <uptake label>".
- The module keeps "Advanced: curve details" collapsed and read-only, with Curve archetype, Uptake preset, Peak (δ), Shape (γ), Saturation (ρ) and Half of peak (calls).
- The module keeps the existing value-only message unchanged while value-only data is not allowed; when it is allowed, the module sends a single "All HCPs" curve and shows one "All HCPs" row.

## Step 2 · Custom curve

- FR-45 (proposed), Must-Have: Custom curve from marketing-mix output, with a required source note.
- The module offers Custom (from marketing mix) in the Uptake picker while "Allow custom curves" is on.
- The module shows displayed columns: Peak (δ), Shape (γ), Saturation (ρ), Source note for custom curves.
- The module opens inline inputs for Peak (δ), Shape (γ) and Saturation (ρ) in the archetype's row when Custom is chosen; it keeps any Custom values the archetype already has, and only when there are none does it start from the previously chosen preset's values (blank when no preset was chosen).
- The module accepts plain decimal numbers above 0 only; a blank value, a comma, a sign or an exponent shows the matching message next to the input.
- The module shows the "Source note for custom curves" text box once any archetype uses Custom; a blank note fails the assumptions check with "Enter a source note for the custom curves."
- The module updates the curve chart and "Advanced: curve details" live while values are typed.
- The module writes one audit row per committed value ("Custom curve for <archetype>, <parameter>: <old> → <new>") and per source note change ("Custom curve source note: <old> → <new>").
- The module flags an existing Custom choice as an assumptions-check issue when custom curves are switched off later.
- The module restores earlier drafts saved before uptake presets with their stored curves: an archetype on the engine's reference curve stays as it was, a stored preset choice whose preset still has the same values stays on that preset, and any other edited curve becomes Custom; an existing source note is kept, otherwise the note reads "Curve values carried over from an earlier draft".

## Admin configurator · Presets

- FR-46 (proposed), Must-Have: Admin configurator: presets, default assignment, curve library, flags.
- FR-48 (proposed), Must-Have: Export of curve provenance and the configuration snapshot.
- The module opens the "Response curve configuration" dialog from a header button that only the Administrator sees; the dialog has four tabs: Presets, Default assignment, Curve library, Flags.
- The module shows the configuration version, "Last changed by" and "Last changed" above the tabs; every saved configuration edit raises the version and stamps both fields.
- The module shows displayed columns: Label, Description, Peak (δ), Shape (γ), Saturation (ρ), Show in the uptake picker, Origin, Half of peak (calls).
- The module seeds four Beghou reference presets: Slow uptake (δ 5, γ 1.5, ρ 11), Moderate uptake (δ 5, γ 1.1, ρ 3.5), Steep uptake (δ 5, γ 0.8, ρ 1.5), Baseline (δ 5, γ 1.3, ρ 7).
- The module shows one admin card per preset with its fields, an Origin chip, Half of peak (calls) and a mini-chart.
- The module validates admin preset edits: label not blank, at most 60 characters, unique, and not the Custom label; description at most 240 characters; δ, γ and ρ plain decimals above 0 with no upper bound; at least one preset stays in the uptake picker.
- The module restores the four reference presets exactly with "Reset to Beghou reference", writing one audit row per changed field.
- The module derives the Origin chip ("Beghou reference" while a preset equals its reference values, otherwise "Edited for this project"); origin changes are not audited.
- The module writes one configuration audit row per saved admin edit: "<preset> · <field>: <old> → <new>".
- The module adds to the exported workbook (fs-io 1.1.0): the uptake-by-archetype assignment and source note on the Assumptions sheet, effective curve values with provenance for every archetype on the Response Curves sheet, the preset resolution rule in Formula Documentation, and a new Configuration sheet with the configuration snapshot.
- The module exports earlier drafts as before, except that their Configuration sheet reads "No configuration recorded".
- The module shows, on Scenario Summary, the uptake per archetype, Custom with its source note, and the configuration version of each snapshot.

## Admin configurator · Default assignment

- The module's Default assignment tab (part of FR-46, proposed) sets the uptake each archetype starts with when it appears in the data.
- The module shows displayed columns: Archetype name, Uptake preset.
- The module seeds the default assignment for the synthetic sample archetypes: Prospects to Slow uptake, Trialists to Moderate uptake, Early Leaders to Steep uptake.
- The module offers picker-visible presets plus Custom (from marketing mix), when custom curves are allowed, as admin choices.
- The module lets the admin add an archetype name (at most 60 characters, unique ignoring case, not a reserved name) and remove one; each change writes one configuration audit row.
- The module starts an archetype missing from the default assignment with no uptake chosen.
- The module warns when custom curves are off but a default still uses Custom, and changes nothing silently.

## Admin configurator · Curve library

- The module's Curve library tab (part of FR-46, proposed) shows the read-only Beghou reference curve library to the admin.
- The module shows displayed columns: Step, Peak (δ), Shape (γ), Saturation (ρ), Half of peak (calls).
- The module provides 17 steps from "+4 Max" to "−4 Linear", each with γ 1 and δ 5.
- The module copies a step's δ, γ and ρ into a chosen preset with "Copy into preset…", writing one configuration audit row naming the step and the preset.
- The module never offers the curve library in the analysts' Uptake picker.

## Admin configurator · Flags

- The module's Flags tab (part of FR-46, proposed) holds two admin configuration switches.
- The module shows displayed columns: Allow value-only data for the response curve method, Allow custom curves.
- The module sets "Allow value-only data for the response curve method" Off in the default configuration; when On, data without archetypes uses one "All HCPs" uptake.
- The module sets "Allow custom curves" On in the default configuration; when Off, Custom leaves the pickers and existing Custom choices are flagged.
- The module writes one configuration audit row per flag change: "<flag>: Off → On" or "On → Off".

## Permissions

- Administrator must be the only role that opens and edits the Response curve configuration; outside it the Administrator stays read-only, cannot edit project inputs and cannot approve (approval rights stay TBD in the PRD).
- Sizing Analyst must be able to choose an uptake per archetype and enter Custom curves with a source note; the configuration button is not shown and the configuration cannot be opened.
- Engagement Lead must have the same uptake and Custom curve rights as the Sizing Analyst and cannot open the configuration.

## Assumptions

- Screens in this deck are generated references; the review mock-up is the UI source of truth.
- Requirement IDs FR-44, FR-45, FR-46, FR-47 and FR-48 are provisional and tagged "(proposed)" until they are checked against the PRD.
- The four uptake presets are Beghou reference presets; analysts see curve values only under "Advanced: curve details".
- All HCP, segment and archetype data in the review mock-up is synthetic.
- The origin of the configuration is derived from its values and is not audited.
- Market-context recommendation of curves (rules or AI) is backlog and not part of this build.
- A client self-serve persona is deferred to the PRD.
- The generated permission tables (per-page Permissions slides, Permissions Matrix, Global Permissions) show every role as view-only on every page. Use the Permissions section: only the Administrator opens the configurator; the Sizing Analyst and Engagement Lead edit uptake and Custom curves.

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
