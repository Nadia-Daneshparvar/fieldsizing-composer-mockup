'use strict';
// Import (Codex review on PR #2): file import recognises the configuration archetypes (FSFields.MAPPING_FIELDS
// archetypeMix.*) as well as the four reference archetypes; reference-only files import exactly as before. Synthetic data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/modules.cjs');
const { FSIO, FSFields: F } = load();
const CONFIG = Object.keys(F.RESPONSE_CURVE_CONFIG.defaultAssignment);
const sheet = text => ({ name: 'Synthetic', rows: FSIO._internal.parseCsvText(text).rows });
const run = text => { const s = sheet(text); return FSIO.applyMapping(s, FSIO.detect(s, 'response'), 'response'); };

test('entity grain: configuration archetype names import (multi-word included); the mix holds only the names seen', () => {
  const r = run(['HCP ID,Decile,Value,Curve archetype,Reach %', `1,1,100,${CONFIG[0]},50`, `2,1,80,${CONFIG[1]},50`, `3,2,60,${CONFIG[2]},50`, `4,2,40,${CONFIG[2].toLowerCase()},50`].join('\n'));
  assert.deepEqual(r.errors, []);
  const bySeg = Object.fromEntries(r.segments.map(s => [s.segment, s.archetypeMix]));
  assert.deepEqual(bySeg, { 1: { [CONFIG[0]]: 50, [CONFIG[1]]: 50 }, 2: { [CONFIG[2]]: 100 } });
});

test('entity grain: an unknown name is still refused and the message lists every recognised archetype', () => {
  const r = run(`HCP ID,Decile,Value,Curve archetype,Reach %\n1,1,100,${CONFIG[0]},50\n2,1,90,Nobody,50\n`);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'unknown-archetype');
  CONFIG.concat(['Loyalists']).forEach(a => assert.ok(r.errors[0].message.includes(a), a));
});

test('entity grain: reference-only rows keep all four reference names, zeros included (as before)', () => {
  const r = run('HCP ID,Decile,Value,Curve archetype,Reach %\n1,1,100,Loyalists,50\n2,1,80,Splitter,50\n');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[0].archetypeMix, { Loyalists: 50, Splitters: 50, Dabblers: 0, Conservatives: 0 });
});

test('summary grain: configuration share columns are detected and read, not silently dropped', () => {
  const r = run(['Segment,Entities,Composite value,Reach %,' + CONFIG.map(a => a + ' %').join(','), 'D1,10,100,50,50,30,20'].join('\n'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.segments[0].archetypeMix, { [CONFIG[0]]: 50, [CONFIG[1]]: 30, [CONFIG[2]]: 20 });
  const frac = run(['Segment,Entities,Composite value,Reach %,' + CONFIG.map(a => a + ' %').join(','), 'D1,10,100,50,0.5,0.3,0.2'].join('\n'));
  assert.deepEqual(frac.segments[0].archetypeMix, { [CONFIG[0]]: 50, [CONFIG[1]]: 30, [CONFIG[2]]: 20 });
  assert.ok(frac.warnings.some(w => w.code === 'mix-fraction-converted'));
});

test('summary grain: reference-only share columns import as before (fractions converted, missing names zero)', () => {
  const r = run('Segment,Entities,Composite value,Reach %,Loyalists %,Splitters %,Dabblers %\nD1,10,100,50,0.5,0.3,0.2\n');
  assert.deepEqual(r.segments[0].archetypeMix, { Loyalists: 50, Splitters: 30, Dabblers: 20, Conservatives: 0 });
});

test('live configuration archetypes (an Administrator added one) are recognised when the page passes them', () => {
  const ent = sheet('HCP ID,Decile,Value,Curve archetype,Reach %\n1,1,100,Innovators,50\n2,1,80,Prospects,50\n');
  assert.equal(FSIO.applyMapping(ent, FSIO.detect(ent, 'response'), 'response').errors[0].code, 'unknown-archetype', 'not without the live list');
  const de = FSIO.detect(ent, 'response', { archetypes: ['Innovators'] });
  const re = FSIO.applyMapping(ent, Object.assign({}, de, { archetypes: ['Innovators'] }), 'response');
  assert.deepEqual(re.errors, []);
  assert.deepEqual(re.segments[0].archetypeMix, { Innovators: 50, Prospects: 50 });
  const sum = sheet('Segment,Entities,Composite value,Reach %,Innovators %,Prospects %\nD1,10,100,50,60,40\n');
  const ds = FSIO.detect(sum, 'response', { sheets: [sum], archetypes: ['Innovators'] });
  assert.equal(ds.mapping['archetypeMix.Innovators'], 4);
  assert.deepEqual(FSIO.applyMapping(sum, ds, 'response', { archetypes: ['Innovators'] }).segments[0].archetypeMix, { Innovators: 60, Prospects: 40 });
  // The list is scoped to the call: the next call without it is back to reference + seed configuration names.
  assert.equal(FSIO.detect(sum, 'response').mapping['archetypeMix.Innovators'], undefined);
});
