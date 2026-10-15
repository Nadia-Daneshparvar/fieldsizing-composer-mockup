'use strict';
// Loads the browser modules from src/ in Node. FSIO resolves FSFields / FSEngine through globalThis, as in the page.
const path = require('node:path');
const SRC = path.join(__dirname, '..', '..', 'src');
const p = rel => path.join(SRC, rel);
function load() {
  const FSFields = require(p('contract/fields.js'));
  const FSEngine = require(p('engine/engine.js'));
  globalThis.FSFields = FSFields;
  globalThis.FSEngine = FSEngine;
  const FSIO = require(p('io/io.js'));
  const FSSample = require(p('ui/sample-data.js'));
  return { FSFields, FSEngine, FSIO, FSSample };
}
module.exports = { SRC, load };
