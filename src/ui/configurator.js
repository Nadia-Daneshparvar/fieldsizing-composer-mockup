/* ---- ui/configurator.js ---- */
/* FSConfigurator — the Administrator's response curve configuration (FR-46, proposed).
   View (HTML strings) and edit logic for the four tabs: Presets, Default assignment, Curve library, Flags.
   The app owns state, role gating, the dialog shell, audit rows and rendering; this module only reads and edits the
   config object it is given (state.config, a deep clone of FSFields.RESPONSE_CURVE_CONFIG).
   Every user-facing string comes from FSFields.RESPONSE_CURVE_LABELS. The mini-charts use the engine's responseCurve. */
(function (root) {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : root;
  const FF = () => G.FSFields;
  const L = () => FF().RESPONSE_CURVE_LABELS;
  const responseCurve = () => G.FSEngine && G.FSEngine._internal && G.FSEngine._internal.responseCurve;

  const TABS = ['presets', 'defaultAssignment', 'curveLibrary', 'flags'];
  const PARAMS = ['delta', 'gamma', 'rho'];
  const PRESET_FIELDS = ['label', 'description', 'delta', 'gamma', 'rho', 'pickerVisible'];
  const FLAGS = ['allowValueOnlyResponse', 'allowCustomCurve'];
  const CUSTOM = 'custom';
  const LABEL_MAX = 60, DESCRIPTION_MAX = 240, ARCHETYPE_MAX = 60;
  const DECIMAL = /^(\d+(\.\d*)?|\.\d+)$/;   // plain decimal: digits with an optional decimal point
  /* Names an archetype may not take: the reserved assignment values (FSFields.RESPONSE_CURVE_RESERVED: 'ALL', 'custom') and
     the object-prototype keys, which a plain map cannot store safely. Compared case-insensitively. */
  const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
  const reservedName = name => {
    const n = String(name).toLowerCase();
    const reserved = Object.values(FF().RESPONSE_CURVE_RESERVED || {}).map(x => String(x).toLowerCase());
    return reserved.concat(UNSAFE_KEYS).includes(n);
  };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const isNum = v => typeof v === 'number' && isFinite(v);
  const num = v => (isNum(v) ? String(v) : '');
  const round2 = v => (isNum(v) ? String(Math.round(v * 100) / 100) : '');
  const halfOfPeak = p => (p && isNum(p.gamma) && p.gamma > 0 && isNum(p.rho) && p.rho > 0 ? Math.pow(p.rho, 1 / p.gamma) : null);

  function blankUi(tab) {
    return { tab: TABS.includes(tab) ? tab : 'presets', drafts: {}, errors: {}, copyFrom: null, newName: '', newPreset: null, notice: '' };
  }

  /* ------------------------------------------------------------------ wording helpers (all from RESPONSE_CURVE_LABELS) */
  const fieldLabel = f => { const R = L(); return { label: R.presetLabel, description: R.presetDescription, delta: R.delta, gamma: R.gamma, rho: R.rho, pickerVisible: R.pickerVisible, origin: R.originLabel }[f]; };
  const fieldValue = (f, v) => {
    const R = L();
    if (f === 'pickerVisible') return R.flagState[String(!!v)];
    if (f === 'origin') return R.origin[v] || v;
    if (v == null || v === '') return R.audit.blank;
    return String(v);
  };
  const presetName = (cfg, id) => { const R = L(); if (id === CUSTOM) return R.custom; const p = (cfg.presets || []).find(x => x.id === id); return p ? p.label : id; };
  const curveText = p => { const R = L(); return PARAMS.map(k => `${R[k]} ${num(p[k])}`).join(', '); };
  const sep = (a, b) => `${a} · ${b}`;

  /* ------------------------------------------------------------------ edit logic (pure on the config it is given) */
  /* A saved edit returns change details for the audit (one per changed field) and stamps the config once:
     version + 1, updatedBy, updatedAt. Invalid input returns { error } and changes nothing. */
  function stamp(cfg, ctx) {
    cfg.version = (isNum(cfg.version) ? cfg.version : 0) + 1;
    cfg.updatedBy = ctx && ctx.user ? ctx.user : null;
    cfg.updatedAt = ctx && ctx.at ? ctx.at : new Date().toISOString();
  }
  function done(cfg, ctx, changes) { if (changes.length) stamp(cfg, ctx); return { changes }; }

  function validatePresetField(cfg, p, field, raw) {
    const R = L();
    if (field === 'label') {
      const v = String(raw == null ? '' : raw).trim();
      if (!v) return { error: R.presetLabelRequired };
      if (v.length > LABEL_MAX) return { error: R.presetLabelTooLong(LABEL_MAX) };
      if (v.toLowerCase() === String(R.custom).trim().toLowerCase()) return { error: R.presetLabelIsCustom };
      if ((cfg.presets || []).some(o => o !== p && String(o.label).trim().toLowerCase() === v.toLowerCase())) return { error: R.presetLabelDuplicate };
      return { value: v };
    }
    if (field === 'description') {
      const v = String(raw == null ? '' : raw).trim();
      return v.length > DESCRIPTION_MAX ? { error: R.presetDescriptionTooLong(DESCRIPTION_MAX) } : { value: v };
    }
    if (field === 'pickerVisible') {
      const v = !!raw;
      if (!v && p.pickerVisible && !(cfg.presets || []).some(o => o !== p && o.pickerVisible)) return { error: R.pickerVisibleLast };
      return { value: v };
    }
    if (PARAMS.includes(field)) {
      const t = String(raw == null ? '' : raw).trim();   // ends only
      if (t.includes(',')) return { error: R.presetValueComma(R[field]) };   // "1,5" is never read as 15
      if (!DECIMAL.test(t)) return { error: R.presetValuePlainDecimal(R[field]) };   // no signs, exponents, hex or inner spaces
      const n = Number(t);
      return isNum(n) && n > 0 ? { value: n } : { error: R.presetValueInvalid(R[field]) };
    }
    return { error: R.presetValueInvalid(field) };
  }
  /* Origin is derived, not audited (fix 2, N1): 'beghou-reference' while every field equals FSFields.REFERENCE_PRESETS,
     else 'client'. Recomputed on every edit, copy and reset, so each saved edit writes exactly one audit row. */
  function originOf(p) {
    const ref = (FF().REFERENCE_PRESETS || []).find(r => r.id === p.id);
    return ref && PRESET_FIELDS.every(f => ref[f] === p[f]) ? 'beghou-reference' : 'client';
  }
  function syncOrigin(p) { p.origin = originOf(p); }
  function setPresetField(cfg, presetId, field, raw, ctx) {
    const p = (cfg.presets || []).find(x => x.id === presetId);
    if (!p || !PRESET_FIELDS.includes(field)) return { changes: [] };
    const v = validatePresetField(cfg, p, field, raw);
    if (v.error) return { error: v.error, changes: [] };
    if (p[field] === v.value) return { changes: [] };
    const from = p[field];
    const change = L().audit.configEdit(sep(p.label, fieldLabel(field)), fieldValue(field, from), fieldValue(field, v.value));
    p[field] = v.value;
    syncOrigin(p);
    return done(cfg, ctx, [change]);
  }
  /* Restores FSFields.REFERENCE_PRESETS exactly; one audit row per changed user-editable field (origin is derived, no row). */
  function resetPresets(cfg, ctx) {
    const ref = clone(FF().REFERENCE_PRESETS);
    const changes = [];
    ref.forEach(r => {
      const cur = (cfg.presets || []).find(x => x.id === r.id);
      const name = cur ? cur.label : r.label;
      PRESET_FIELDS.forEach(f => {
        const from = cur ? cur[f] : undefined;
        if (from !== r[f]) changes.push(L().audit.configEdit(sep(name, fieldLabel(f)), fieldValue(f, from), fieldValue(f, r[f])));
      });
    });
    const same = JSON.stringify(cfg.presets) === JSON.stringify(ref);
    cfg.presets = ref;
    if (!changes.length && !same) changes.push(L().audit.configReset);
    return Object.assign(done(cfg, ctx, changes), { unchanged: same });
  }
  function setDefault(cfg, name, presetId, ctx) {
    const da = cfg.defaultAssignment || (cfg.defaultAssignment = {});
    if (!own(da, name)) return { changes: [] };
    if (!pickerOptions(cfg, da[name]).some(o => o.value === presetId)) return { changes: [] };
    if (da[name] === presetId) return { changes: [] };
    const change = L().audit.configEdit(sep(L().tabs.defaultAssignment, name), presetName(cfg, da[name]), presetName(cfg, presetId));
    da[name] = presetId;
    return done(cfg, ctx, [change]);
  }
  function addArchetype(cfg, rawName, presetId, ctx) {
    const R = L(), name = String(rawName == null ? '' : rawName).trim();
    if (!name) return { error: R.archetypeNameRequired, changes: [] };
    if (name.length > ARCHETYPE_MAX) return { error: R.archetypeNameTooLong(ARCHETYPE_MAX), changes: [] };
    if (reservedName(name)) return { error: R.archetypeNameReserved, changes: [] };
    const da = cfg.defaultAssignment || (cfg.defaultAssignment = {});
    if (Object.keys(da).some(k => k.toLowerCase() === name.toLowerCase())) return { error: R.archetypeNameDuplicate, changes: [] };
    const opts = pickerOptions(cfg);
    if (!opts.length) return { changes: [] };
    const pid = opts.some(o => o.value === presetId) ? presetId : opts[0].value;
    Object.defineProperty(da, name, { value: pid, enumerable: true, writable: true, configurable: true });
    return done(cfg, ctx, [R.audit.configEdit(sep(R.tabs.defaultAssignment, name), R.audit.blank, presetName(cfg, pid))]);
  }
  function removeArchetype(cfg, name, ctx) {
    const R = L(), da = cfg.defaultAssignment || {};
    if (!own(da, name)) return { changes: [] };
    const change = R.audit.configEdit(sep(R.tabs.defaultAssignment, name), presetName(cfg, da[name]), R.audit.blank);
    delete da[name];
    return done(cfg, ctx, [change]);
  }
  /* Copies a library step's δ/γ/ρ into a preset: one audit row naming the step and preset, old → new values. */
  function copyLibrary(cfg, libId, presetId, ctx) {
    const step = (cfg.curveLibrary || []).find(s => s.id === libId), p = (cfg.presets || []).find(x => x.id === presetId);
    if (!step || !p) return { changes: [] };
    if (PARAMS.every(k => p[k] === step[k])) return { changes: [] };
    const change = L().audit.configEdit(L().audit.libraryCopy(step.label, p.label), curveText(p), curveText(step));
    PARAMS.forEach(k => { p[k] = step[k]; });
    syncOrigin(p);
    return done(cfg, ctx, [change]);
  }
  function setFlag(cfg, key, value, ctx) {
    if (!FLAGS.includes(key)) return { changes: [] };
    const flags = cfg.flags || (cfg.flags = {});
    const v = !!value;
    if (!!flags[key] === v && typeof flags[key] === 'boolean') return { changes: [] };
    const R = L(), change = R.audit.configEdit(R.flagLabels[key], R.flagState[String(!!flags[key])], R.flagState[String(v)]);
    flags[key] = v;
    return done(cfg, ctx, [change]);
  }

  /* Default-assignment choices: picker-visible presets plus Custom (and the current value if it has since been hidden). */
  function pickerOptions(cfg, current) {
    const R = L();
    const opts = (cfg.presets || []).filter(p => p.pickerVisible || p.id === current).map(p => ({ value: p.id, label: p.label }));
    if (customAllowed(cfg) || current === CUSTOM) opts.push({ value: CUSTOM, label: R.custom });
    return opts;
  }
  const customAllowed = cfg => !(cfg.flags && cfg.flags.allowCustomCurve === false);
  /* Archetypes whose default is Custom while custom curves are off: warned about, never changed silently. */
  const customInUse = cfg => (customAllowed(cfg) ? [] : Object.keys(cfg.defaultAssignment || {}).filter(k => cfg.defaultAssignment[k] === CUSTOM));
  function customWarning(cfg) {
    const names = customInUse(cfg);
    return names.length ? `<div class="msg msg-warning" role="status" id="cfg-custom-warn"><div class="msg-body"><div>${esc(L().customOffInUse(names.join(', ')))}</div></div></div>` : '';
  }

  /* ------------------------------------------------------------------ command dispatch (strings from data-arg / data-cfg) */
  /* Returns { changes, error?, focus? }. ui holds the view state (tab, drafts, errors, copyFrom, add-row draft, notice). */
  function command(cfg, ui, cmd, value, ctx) {
    const parts = String(cmd || '').split(':');
    const op = parts[0];
    const pidOf = i => ((cfg.presets || [])[+i] || {}).id;
    const archOf = i => Object.keys(cfg.defaultAssignment || {})[+i];
    ui.notice = '';
    if (op === 'tab') { if (TABS.includes(parts[1])) { ui.tab = parts[1]; ui.copyFrom = null; } return { changes: [], focus: `cfg-tab-${ui.tab}` }; }
    if (op === 'preset') {
      const key = `p-${parts[1]}-${parts[2]}`;
      const r = setPresetField(cfg, pidOf(parts[1]), parts[2], value, ctx);
      if (r.error) { ui.errors[key] = r.error; ui.drafts[key] = value; } else { delete ui.errors[key]; delete ui.drafts[key]; }
      return r;
    }
    if (op === 'reset') {
      const r = resetPresets(cfg, ctx);
      ui.errors = {}; ui.drafts = {};
      ui.notice = r.unchanged ? L().alreadyReference : L().audit.configReset;
      return Object.assign(r, { focus: 'cfg-reset' });
    }
    if (op === 'assign') return setDefault(cfg, archOf(parts[1]), value, ctx);
    if (op === 'newName') { ui.newName = String(value == null ? '' : value); return { changes: [] }; }
    if (op === 'newPreset') { ui.newPreset = value; return { changes: [] }; }
    if (op === 'add') {
      if (value != null) ui.newName = String(value);
      const r = addArchetype(cfg, ui.newName, ui.newPreset, ctx);
      if (r.error) { ui.errors.newName = r.error; return Object.assign(r, { focus: 'cfg-new-name' }); }
      delete ui.errors.newName; ui.newName = '';
      return Object.assign(r, { focus: 'cfg-new-name' });
    }
    if (op === 'remove') { const r = removeArchetype(cfg, archOf(parts[1]), ctx); return Object.assign(r, { focus: 'cfg-new-name' }); }
    if (op === 'copyOpen') { const i = +parts[1]; ui.copyFrom = ui.copyFrom === i ? null : i; return { changes: [], focus: `cfg-lib-${i}` }; }
    if (op === 'copy') {
      const step = (cfg.curveLibrary || [])[+parts[1]];
      const r = copyLibrary(cfg, step && step.id, pidOf(parts[2]), ctx);
      ui.copyFrom = null;
      if (r.changes.length) ui.notice = r.changes[0];
      return Object.assign(r, { focus: `cfg-lib-${parts[1]}` });
    }
    if (op === 'flag') return setFlag(cfg, parts[1], value, ctx);
    return { changes: [] };
  }

  /* ------------------------------------------------------------------ view */
  function miniChart(p) {
    const R = L(), rc = responseCurve(), hp = halfOfPeak(p);
    const W0 = 200, H0 = 72, pad = 6, X = 24, w = W0 - 2 * pad, h = H0 - 2 * pad;
    const ok = rc && PARAMS.every(k => isNum(p[k]) && p[k] > 0);
    let pts = '';
    if (ok) {
      const top = rc(p, X);
      if (top > 0) { const out = []; for (let k = 0; k <= 48; k++) { const x = X * k / 48; out.push(`${(pad + x / X * w).toFixed(1)},${(pad + h - Math.min(1, rc(p, x) / top) * h).toFixed(1)}`); } pts = out.join(' '); }
    }
    return `<svg viewBox="0 0 ${W0} ${H0}" width="${W0}" height="${H0}" role="img" aria-label="${esc(`${p.label}: ${R.halfOfPeak} ${hp == null ? '—' : round2(hp)}`)}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto;background:var(--surface-raised);border:1px solid var(--border-container);border-radius:4px">
      <line x1="${pad}" x2="${W0 - pad}" y1="${H0 - pad}" y2="${H0 - pad}" stroke="rgba(2,4,52,0.4)"/><line x1="${pad}" x2="${pad}" y1="${pad}" y2="${H0 - pad}" stroke="rgba(2,4,52,0.4)"/>
      ${pts ? `<polyline fill="none" stroke="#3282FA" stroke-width="2" points="${pts}"/>` : ''}</svg>`;
  }
  function inputField({ id, label, value, error, cmd, kind = 'text', hint }) {
    const desc = error || hint ? ` aria-describedby="${id}-hint"` : '';
    const inv = error ? ' is-invalid' : '';
    const control = kind === 'textarea'
      ? `<textarea class="input ta${inv}" id="${id}" data-cfg="${esc(cmd)}" rows="2"${desc}${error ? ' aria-invalid="true"' : ''}>${esc(value)}</textarea>`
      : `<input class="input${inv}" type="text" id="${id}" data-cfg="${esc(cmd)}" value="${esc(value)}" ${kind === 'num' ? 'inputmode="decimal"' : ''} autocomplete="off"${desc}${error ? ' aria-invalid="true"' : ''}>`;
    return `<div class="field"><label class="lbl${inv}" for="${id}" id="${id}-lbl">${esc(label)}</label>${control}
      ${error ? `<div class="err" id="${id}-hint">${esc(error)}</div>` : hint ? `<div class="hint" id="${id}-hint">${esc(hint)}</div>` : ''}</div>`;
  }
  function checkField({ id, label, checked, cmd, hint, error }) {
    return `<div class="field"><label class="check" for="${id}"><input type="checkbox" id="${id}" data-cfg="${esc(cmd)}" ${checked ? 'checked' : ''}${hint || error ? ` aria-describedby="${id}-hint"` : ''}${error ? ' aria-invalid="true"' : ''}><span>${esc(label)}</span></label>
      ${error ? `<div class="err" id="${id}-hint">${esc(error)}</div>` : hint ? `<div class="hint" id="${id}-hint">${esc(hint)}</div>` : ''}</div>`;
  }
  function selectField({ id, options, value, cmd, labelledby, label }) {
    const sel = `<select class="input" id="${id}" data-cfg="${esc(cmd)}" ${labelledby ? `aria-labelledby="${labelledby}"` : ''}>${options.map(o => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    return label ? `<div class="field"><label class="lbl" for="${id}">${esc(label)}</label>${sel}</div>` : sel;
  }
  function notice(ui) { return ui.notice ? `<div class="msg msg-success" role="status"><div class="msg-body"><div>${esc(ui.notice)}</div></div></div>` : ''; }

  function presetsPanel(cfg, ui, h) {
    const R = L();
    const val = (i, f, v) => (Object.prototype.hasOwnProperty.call(ui.drafts, `p-${i}-${f}`) ? ui.drafts[`p-${i}-${f}`] : v);
    const err = (i, f) => ui.errors[`p-${i}-${f}`] || '';
    const cards = (cfg.presets || []).map((p, i) => {
      const id = f => `cfg-p-${i}-${f}`;
      const hp = halfOfPeak(p);
      return `<fieldset class="fs" id="cfg-p-${i}" style="border:1px solid var(--border-container);border-radius:4px;padding:12px 16px;margin:0">
        <legend class="lbl" id="cfg-p-${i}-legend" style="padding:0 4px">${esc(p.label)} <span class="chip chip-outline chip-sm"><span>${esc(R.origin[p.origin] || p.origin)}</span></span></legend>
        <div class="grid g2">
          ${inputField({ id: id('label'), label: R.presetLabel, value: val(i, 'label', p.label), error: err(i, 'label'), cmd: `preset:${i}:label` })}
          ${checkField({ id: id('pickerVisible'), label: R.pickerVisible, checked: !!p.pickerVisible, cmd: `preset:${i}:pickerVisible`, error: err(i, 'pickerVisible') })}
        </div>
        ${inputField({ id: id('description'), label: R.presetDescription, value: val(i, 'description', p.description), error: err(i, 'description'), cmd: `preset:${i}:description`, kind: 'textarea' })}
        <div class="grid g3">${PARAMS.map(k => inputField({ id: id(k), label: R[k], value: val(i, k, num(p[k])), error: err(i, k), cmd: `preset:${i}:${k}`, kind: 'num' })).join('')}</div>
        <div class="row-between" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <p class="hint" id="${id('half')}">${esc(R.halfOfPeak)}: <strong>${hp == null ? '—' : esc(round2(hp))}</strong></p>${miniChart(p)}</div>
      </fieldset>`;
    }).join('');
    return `<div class="row-between" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 class="sub-h" id="cfg-presets-h">${esc(R.referencePresets)}</h3>
        <button type="button" class="btn btn-outline btn-sm" id="cfg-reset" data-act="cfg" data-arg="reset">${h.icon('refresh')}<span>${esc(R.resetReference)}</span></button></div>
      ${notice(ui)}<div style="display:flex;flex-direction:column;gap:12px">${cards}</div>`;
  }
  function defaultsPanel(cfg, ui, h) {
    const R = L(), da = cfg.defaultAssignment || {}, names = Object.keys(da);
    const rows = names.map((n, i) => `<tr><th scope="row" class="rowh" id="cfg-da-${i}-n">${esc(n)}</th>
      <td>${selectField({ id: `cfg-da-${i}`, options: pickerOptions(cfg, da[n]), value: da[n], cmd: `assign:${i}`, labelledby: `cfg-da-${i}-n cfg-da-col` })}</td>
      <td><button type="button" class="ibtn" id="cfg-da-${i}-rm" data-act="cfg" data-arg="remove:${i}" aria-label="${esc(R.removeArchetype(n))}">${h.icon('trash')}</button></td></tr>`).join('');
    const opts = pickerOptions(cfg);
    const np = opts.some(o => o.value === ui.newPreset) ? ui.newPreset : (opts[0] || {}).value;
    ui.newPreset = np;
    return `<p class="hint" id="cfg-da-hint">${esc(R.defaultAssignmentHint)}</p>${customWarning(cfg)}
      <div class="grid-wrap" tabindex="0" role="region" aria-label="${esc(R.tabs.defaultAssignment)}"><table class="grid-t" aria-describedby="cfg-da-hint"><thead><tr><th scope="col">${esc(R.archetypeName)}</th><th scope="col" id="cfg-da-col">${esc(R.preset)}</th><th scope="col"><span class="sr-only">${esc(R.addArchetype)}</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div role="group" aria-labelledby="cfg-add-h" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
        <h3 class="sub-h sr-only" id="cfg-add-h">${esc(R.addArchetype)}</h3>
        ${inputField({ id: 'cfg-new-name', label: R.archetypeName, value: ui.newName, error: ui.errors.newName || '', cmd: 'newName' })}
        ${selectField({ id: 'cfg-new-preset', options: opts, value: np, cmd: 'newPreset', label: R.preset })}
        <div class="field"><button type="button" class="btn btn-outline" id="cfg-add" data-act="cfg" data-arg="add">${h.icon('plus')}<span>${esc(R.addArchetype)}</span></button></div></div>`;
  }
  function libraryPanel(cfg, ui) {
    const R = L();
    const rows = (cfg.curveLibrary || []).map((s, i) => {
      const open = ui.copyFrom === i;
      const pick = open ? `<tr id="cfg-lib-${i}-pick"><td colspan="6"><div role="group" aria-labelledby="cfg-lib-${i}-t" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="lbl" id="cfg-lib-${i}-t">${esc(R.copyTarget)}</span>
          ${(cfg.presets || []).map((p, k) => `<button type="button" class="btn btn-outline btn-sm" id="cfg-lib-${i}-to-${k}" data-act="cfg" data-arg="copy:${i}:${k}">${esc(p.label)}</button>`).join('')}</div></td></tr>` : '';
      return `<tr><th scope="row" class="rowh" id="cfg-lib-${i}-n">${esc(s.label)}</th><td class="num">${esc(num(s.delta))}</td><td class="num">${esc(num(s.gamma))}</td><td class="num">${esc(num(s.rho))}</td><td class="num">${esc(round2(halfOfPeak(s)))}</td>
        <td><button type="button" class="btn btn-text btn-sm" id="cfg-lib-${i}" data-act="cfg" data-arg="copyOpen:${i}" aria-expanded="${open}" ${open ? `aria-controls="cfg-lib-${i}-pick"` : ''} aria-describedby="cfg-lib-${i}-n">${esc(R.copyIntoPreset)}</button></td></tr>${pick}`;
    }).join('');
    return `<h3 class="sub-h" id="cfg-lib-h">${esc(R.referenceLibrary)}</h3><p class="hint" id="cfg-lib-hint">${esc(R.libraryHint)}</p>${notice(ui)}
      <div class="grid-wrap" tabindex="0" role="region" aria-label="${esc(R.referenceLibrary)}"><table class="grid-t" aria-labelledby="cfg-lib-h" aria-describedby="cfg-lib-hint"><thead><tr><th scope="col">${esc(R.libraryStep)}</th><th scope="col" class="num">${esc(R.delta)}</th><th scope="col" class="num">${esc(R.gamma)}</th><th scope="col" class="num">${esc(R.rho)}</th><th scope="col" class="num">${esc(R.halfOfPeak)}</th><th scope="col"><span class="sr-only">${esc(R.copyIntoPreset)}</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }
  function flagsPanel(cfg) {
    const R = L(), fl = cfg.flags || {};
    return FLAGS.map(k => checkField({ id: `cfg-flag-${k}`, label: R.flagLabels[k], checked: !!fl[k], cmd: `flag:${k}`, hint: R.flagHelp[k] })).join('') + customWarning(cfg);
  }

  /* The dialog body. h = { icon, fmtTime } from the app. The tab panel is not a tab stop: every panel starts with focusable
     controls (P3 review m1). Wide tables scroll in a focusable, labelled region, as the audit table does (m2). */
  function view(cfg, ui, h) {
    const R = L();
    const tab = TABS.includes(ui.tab) ? ui.tab : 'presets';
    const meta = `<p class="muted" id="cfg-meta">${esc(R.configVersionText(cfg.version))} · ${esc(R.updatedBy)}: ${esc(cfg.updatedBy || R.neverUpdated)}${cfg.updatedAt ? ` · ${esc(R.updatedAt)}: ${esc(h.fmtTime ? h.fmtTime(cfg.updatedAt) : cfg.updatedAt)}` : ''}</p>`;
    const tablist = `<div class="tabs" role="tablist" aria-label="${esc(R.configuratorTitle)}">${TABS.map(k => `<button type="button" role="tab" class="tab${tab === k ? ' selected' : ''}" id="cfg-tab-${k}" aria-selected="${tab === k}" aria-controls="cfg-panel" tabindex="${tab === k ? 0 : -1}" data-act="cfg" data-arg="tab:${k}">${esc(R.tabs[k])}</button>`).join('')}</div>`;
    const body = tab === 'presets' ? presetsPanel(cfg, ui, h) : tab === 'defaultAssignment' ? defaultsPanel(cfg, ui, h) : tab === 'curveLibrary' ? libraryPanel(cfg, ui) : flagsPanel(cfg);
    return `<p class="hint">${esc(R.configuratorHint)}</p>${meta}${tablist}
      <div role="tabpanel" id="cfg-panel" aria-labelledby="cfg-tab-${tab}" class="tabpanel" style="display:flex;flex-direction:column;gap:12px;padding-top:12px">${body}</div>`;
  }

  const FSConfigurator = Object.freeze({ TABS, LABEL_MAX, DESCRIPTION_MAX, ARCHETYPE_MAX, DECIMAL, blankUi, customInUse, view, command, pickerOptions, halfOfPeak,
    setPresetField, resetPresets, setDefault, addArchetype, removeArchetype, copyLibrary, setFlag });
  if (typeof module !== 'undefined' && module.exports) module.exports = FSConfigurator; else root.FSConfigurator = FSConfigurator;
})(this);

;
