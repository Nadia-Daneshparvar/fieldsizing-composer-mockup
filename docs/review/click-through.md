# Click-through: response curve uptake presets

For the sizing SME reviewers. About 15 minutes. All data is synthetic.

Open `index-no-ai-claude.html`. Turn on **Show requirement IDs** in the header to see the FR-44 to FR-48 (proposed) tags next to each part of the feature.

| # | Do this | You should see |
|---|---|---|
| 1 | On **Project and Input**, select **Load uptake presets synthetic sample**, then choose the method **Profitability / Response Curve**. | A synthetic project whose data has three curve archetypes: Prospects, Trialists and Early Leaders. The data table's mix summary names those three, not a fixed list (FR-47). |
| 2 | Select **Run inputs check**, then go to **Model Assumptions**. | The **Uptake by archetype** table lists the three archetypes from the data, with their counts and shares. Each starts from the configured default: Prospects = Slow uptake, Trialists = Moderate uptake, Early Leaders = Steep uptake (FR-44). |
| 3 | Look at the curve chart beside the table, then open **Advanced: curve details**. | One curve per archetype, with a legend naming the chosen preset ("Prospects: Slow uptake"). The read-only details table shows each archetype's preset, Peak (δ), Shape (γ), Saturation (ρ) and **Half of peak (calls)**. |
| 4 | Select **Run assumptions check**, go to **FTE Calculation**, select **Calculate FTE** and note the Recommended FTE. Open the calculation trace. | A calculated result. The trace names the uptake preset used for each archetype. |
| 5 | Back on **Model Assumptions**, change **Trialists** from Moderate uptake to **Slow uptake**. Run the assumptions check and select **Recalculate**. | The Trialists curve and the Recommended FTE change. |
| 6 | Change **Early Leaders** to **Custom (from marketing mix)**. Enter Peak (δ) 0 and Shape (γ) 1,5. Then enter δ 5, γ 1.2, ρ 6, leave **Source note for custom curves** blank and run the assumptions check. Finally add a note (for example "Synthetic test values"), run the check again and recalculate. | δ 0 is rejected ("must be a number above 0") and 1,5 is rejected ("use a point for decimals"). With a blank note the check lists one item to resolve. With the note added, Custom is accepted and the result recalculates (FR-45). |
| 7 | Go to **Scenario Summary** and select **Save snapshot**. Then on **Review and Export**, open the audit trail and select **Export workbook**. | The summary's **Uptake by archetype** line lists each archetype's preset, Custom with its source note, and the configuration version. The audit trail has one row per change, old → new (uptake, each Custom value, the note). The workbook's Assumptions and Response Curves sheets show the same preset, δ, γ and ρ per archetype and the same Recommended FTE as the screen; its **Configuration** sheet records the presets, curve library, default assignment and flags (FR-48). |
| 8 | On **Review and Export**, under **Viewing as**, switch to **Administrator**, then select **Response curve configuration** in the header. | Only the Administrator has this entry. It opens on four tabs: **Presets**, **Default assignment**, **Curve library**, **Flags** (FR-46). Outside the configurator the Administrator stays read-only. |
| 9 | On **Presets**, change Slow uptake's Shape (γ). Select **Reset to Beghou reference**. Look at **Curve library** and **Flags**. Back on **Presets**, clear **Show in the uptake picker** for Baseline, then close the configurator. | Each saved change raises the configuration version and records who changed it and when; the mini-chart updates. Reset restores the four Beghou reference presets exactly. The curve library is read-only, with **Copy into preset…** on each step. |
| 10 | Switch back to **Sizing Analyst**. Go to **Model Assumptions** and open the uptake picker for any archetype. | The configurator entry is gone for the Sizing Analyst. The picker now offers Slow, Moderate and Steep uptake and Custom; Baseline, hidden by the Administrator, is no longer offered. |

## Also worth a look

- **Existing samples are unchanged.** Load the original synthetic sample: its four archetypes start as Custom with the earlier curve values and the note "Synthetic sample reference curves". Its Recommended FTE is the same as before this change, for every method.
- **Value-only data.** With **Allow value-only data for the response curve method** off (the default), value-only data shows the same message as today. With it on, a single **All HCPs** uptake row appears and the calculation runs.
- **No hidden default.** An archetype in the data that the default assignment does not list (for example after an Administrator removes it from the default assignment) starts as **Not chosen**, and the assumptions check asks you to choose an uptake for it. No curve is assumed silently.
- **Earlier drafts.** A draft saved before this change reopens with its stored curves. A curve that was edited becomes Custom with the note "Curve values carried over from an earlier draft", and recalculates to the same result.

## Questions for the reviewers

These are open points to decide. They are not defects.

1. **Keeping the reference curve on earlier drafts.** In an earlier draft, an archetype that used the reference curve has no uptake chosen. After any edit, the assumptions check asks for one, and none of the four presets equals the reference curve. Should there be a one-click way to keep it?
2. **The mix message when an archetype has no uptake.** While an archetype in the data has no uptake chosen, the mix message reports only the share of the archetypes that do have one. Is that wording acceptable?
3. **The Result page on very narrow screens.** At 320 px wide, the reallocation table on the Result page is wider than the screen. This was already the case before this change.
