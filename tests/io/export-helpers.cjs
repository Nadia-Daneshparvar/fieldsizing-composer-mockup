'use strict';
// Shared helpers for the fs-io 1.1.0 export tests (T13, P5). Builds FSIO.exportWorkbook arguments the way ui/app.js
// doExport does ({ project, scenarios, focusScenarioId, audit }), with scenarios shaped like saveSnapshot's draft, and
// reads the resulting workbook back (FSIO.parseFile for values, raw stored ZIP parts for cell-level comparison).
// Synthetic data only.
const { load } = require('../helpers/modules.cjs');
const { sampleInputs, clone } = require('../helpers/sample-inputs.cjs');

const mods = load();
const { FSFields: F, FSEngine: E, FSIO, FSSample: S } = mods;
const EXPORTED_AT = '2026-10-15T12:00:00Z';

/* Engine inputs after "Load uptake presets synthetic sample" (same construction as tests/contract/t6-preset-sample):
   single-sample shared/method inputs with presetSample's segments; Response Curve curves from resolveCurves. */
function presetInputs(rc) {
  const base = sampleInputs('single', 'response', mods);
  const src = S.presetSample;
  const a = src.segments('affordable'), w = src.segments('workload'), r = src.segments('response');
  const merged = a.map((s, i) => Object.assign({}, s, { plannedCalls: w[i].plannedCalls, archetypeMix: r[i].archetypeMix }));
  const ids = new Set(F.segmentFieldsFor('response', F.OPTION_DEFAULTS.allocation, 'summary').map(f => f.id));
  base.segments = merged.map(s => {
    const o = { segment: s.segment, entities: s.entities, compositeValue: null, reachPct: s.reachPct, maxCalls: null, minCalls: null, plannedCalls: null, archetypeMix: null };
    ['compositeValue', 'maxCalls', 'minCalls', 'plannedCalls', 'archetypeMix'].forEach(k => { if (ids.has(k)) o[k] = s[k] == null ? null : clone(s[k]); });
    if (ids.has('archetypeMix')) o.archetype = s.archetypeMix ? null : (s.archetype || null);
    return o;
  });
  base.methodAssumptions.curveParams = rc.curveParams;
  base.methodAssumptions.curveProvenance = rc.provenance;
  if (typeof rc.customSourceNote === 'string') base.methodAssumptions.customSourceNote = rc.customSourceNote;
  return base;
}

// A scenario in the shape app.js saveSnapshot stores (extra: e.g. { responseCurveConfig }).
function scenarioOf(inputs, extra) {
  const result = E.calculate(inputs);
  return Object.assign({ id: 'SC-001', name: 'Synthetic export scenario', version: 1, parentId: null, createdAt: EXPORTED_AT, createdBy: 'Synthetic Analyst',
    objective: null, inputs, result, provenance: null, corrections: null, status: 'draft', recommended: false, recommendationNote: null,
    recommendedBy: null, recommendedRole: null, approvedBy: null, approvedAt: null }, extra || {});
}

function argsOf(scenario, extra) {
  const project = clone(S.project);
  project.method = scenario.inputs.method;
  return Object.assign({ project, scenarios: [scenario], focusScenarioId: scenario.id,
    audit: [{ at: EXPORTED_AT, user: 'Synthetic Analyst', role: 'analyst', action: 'calculate', detail: 'Synthetic calculation' }],
    exportedAt: EXPORTED_AT }, extra || {});
}

async function parsed(bytes) {
  const wb = await FSIO.parseFile(bytes, 'export.xlsx');
  const by = {};
  wb.sheets.forEach(s => { by[s.name] = s.rows; });
  return { names: wb.sheets.map(s => s.name), by };
}

// Raw parts of a STORE zip written by FSIO (method 0), keyed by entry name.
function zipParts(u8) {
  const dir = FSIO._internal.readZipDirectory(u8);
  const out = {};
  Object.keys(dir.entries).forEach(n => {
    const e = dir.entries[n], dv = dir.dv;
    if (e.method !== 0) throw new Error(`unexpected compression in ${n}`);
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    out[n] = new TextDecoder().decode(u8.subarray(start, start + e.csize));
  });
  return out;
}

const xmlUnescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/* Every worksheet's XML keyed by sheet name, with shared-string indices replaced by the strings themselves, so two
   workbooks compare cell-for-cell (value, style, formula, column widths, views) independent of string-table order. */
function sheetXmlByName(u8) {
  const p = zipParts(u8);
  const sst = [];
  (p['xl/sharedStrings.xml'] || '').replace(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g, (m, t) => { sst.push(xmlUnescape(t)); return m; });
  const rels = {};
  p['xl/_rels/workbook.xml.rels'].replace(/<Relationship Id="([^"]+)"[^>]*Target="([^"]+)"/g, (m, id, t) => { rels[id] = t; return m; });
  const out = {};
  p['xl/workbook.xml'].replace(/<sheet name="([^"]+)" sheetId="\d+" r:id="([^"]+)"\/>/g, (m, name, rid) => {
    const xml = p[`xl/${rels[rid]}`];
    out[xmlUnescape(name)] = xml.replace(/(<c r="[A-Z]+\d+"(?: s="\d+")? t="s"><v>)(\d+)(<\/v>)/g, (mm, a, i, b) => `${a}${JSON.stringify(sst[+i])}${b}`);
    return m;
  });
  return out;
}

// Rows from the first row whose column A equals `heading` up to the next blank row (exclusive of the heading row).
function sectionRows(rows, heading) {
  const i = rows.findIndex(r => r && r[0] === heading);
  if (i < 0) return null;
  const out = [];
  for (let k = i + 1; k < rows.length; k++) {
    const r = rows[k];
    if (!r || r.every(v => v === null || v === undefined || v === '')) break;
    out.push(r);
  }
  return out;
}

module.exports = { mods, F, E, FSIO, S, EXPORTED_AT, presetInputs, scenarioOf, argsOf, parsed, zipParts, sheetXmlByName, sectionRows, clone, sampleInputs };
