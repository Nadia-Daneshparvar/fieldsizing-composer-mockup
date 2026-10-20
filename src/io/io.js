/* ---- io/io.js ---- */
/* FSIO — Field Sizing file input (xlsx/xlsm/csv) and analyst-workbook export (xlsx).
 * Plain browser JS, no imports. Also loads in Node 18 for tests.
 * Depends on the global FSFields (contract/fields.js). Uses FSEngine.ARCHETYPES when present (Response Curves sheet).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Globals from other lanes (resolved lazily so load order / Node tests both work)
  // ---------------------------------------------------------------------------
  function G(name) {
    if (root && root[name]) return root[name];
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    return null;
  }
  function fields() {
    const f = G('FSFields');
    if (!f) throw new Error('FSIO needs FSFields (contract/fields.js) loaded first.');
    return f;
  }

  const isNum = v => typeof v === 'number' && isFinite(v);
  const sum = a => a.reduce((s, x) => s + (isNum(x) ? x : 0), 0);

  function ioError(code, message, extra) {
    const e = new Error(message);
    e.code = code;
    e.label = 'File';
    if (extra) Object.assign(e, extra);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Byte helpers, CRC32, UTF-8
  // ---------------------------------------------------------------------------
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function utf8(s) { return enc.encode(s); }
  function decodeUtf8(u8) { return new TextDecoder('utf-8').decode(u8); }

  let CRC_TABLE = null;
  function crc32(u8) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------------------------------------------------------------------------
  // Inflate (raw DEFLATE). DecompressionStream('deflate-raw') when available, else pure JS.
  // ---------------------------------------------------------------------------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huff(lengths, n) {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
    for (let s = 0; s < n; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
    return { count, symbol };
  }

  function inflateRawJS(data, sizeHint) {
    let pos = 0, bitbuf = 0, bitcnt = 0;
    let out = new Uint8Array(Math.max(1024, sizeHint || data.length * 4));
    let outLen = 0;
    function need(n) {
      if (outLen + n <= out.length) return;
      let cap = out.length * 2;
      while (cap < outLen + n) cap *= 2;
      const nb = new Uint8Array(cap); nb.set(out.subarray(0, outLen)); out = nb;
    }
    function bits(n) {
      while (bitcnt < n) {
        if (pos >= data.length) throw ioError('PARSE_ERROR', 'Compressed data ended unexpectedly.');
        bitbuf |= data[pos++] << bitcnt; bitcnt += 8;
      }
      const v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n; bitcnt -= n;
      return v;
    }
    function decode(h) {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len <= 15; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.symbol[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw ioError('PARSE_ERROR', 'Invalid compressed data (bad Huffman code).');
    }
    let fixedL = null, fixedD = null;
    function codes(lh, dh) {
      for (;;) {
        let sym = decode(lh);
        if (sym < 256) { need(1); out[outLen++] = sym; }
        else if (sym === 256) return;
        else {
          sym -= 257;
          if (sym >= 29) throw ioError('PARSE_ERROR', 'Invalid compressed data (length code).');
          const len = LBASE[sym] + bits(LEXT[sym]);
          const ds = decode(dh);
          if (ds >= 30) throw ioError('PARSE_ERROR', 'Invalid compressed data (distance code).');
          const dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > outLen) throw ioError('PARSE_ERROR', 'Invalid compressed data (distance too far).');
          need(len);
          for (let k = 0; k < len; k++) { out[outLen] = out[outLen - dist]; outLen++; }
        }
      }
    }
    let last = 0;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > data.length) throw ioError('PARSE_ERROR', 'Compressed data ended unexpectedly.');
        const len = data[pos] | (data[pos + 1] << 8), nlen = data[pos + 2] | (data[pos + 3] << 8);
        pos += 4;
        if ((len ^ 0xFFFF) !== nlen) throw ioError('PARSE_ERROR', 'Invalid stored block.');
        if (pos + len > data.length) throw ioError('PARSE_ERROR', 'Compressed data ended unexpectedly.');
        need(len); out.set(data.subarray(pos, pos + len), outLen); outLen += len; pos += len;
      } else if (type === 1) {
        if (!fixedL) {
          const l = new Uint8Array(288);
          for (let i = 0; i < 144; i++) l[i] = 8;
          for (let i = 144; i < 256; i++) l[i] = 9;
          for (let i = 256; i < 280; i++) l[i] = 7;
          for (let i = 280; i < 288; i++) l[i] = 8;
          fixedL = huff(l, 288);
          const d = new Uint8Array(30).fill(5);
          fixedD = huff(d, 30);
        }
        codes(fixedL, fixedD);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const lengths = new Uint8Array(320);
        for (let i = 0; i < ncode; i++) lengths[CLORDER[i]] = bits(3);
        for (let i = ncode; i < 19; i++) lengths[CLORDER[i]] = 0;
        const lencode = huff(lengths, 19);
        let idx = 0;
        const all = new Uint8Array(nlen + ndist);
        while (idx < nlen + ndist) {
          let sym = decode(lencode);
          if (sym < 16) all[idx++] = sym;
          else {
            let len = 0, rep;
            if (sym === 16) {
              if (idx === 0) throw ioError('PARSE_ERROR', 'Invalid compressed data (repeat).');
              len = all[idx - 1]; rep = 3 + bits(2);
            } else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (idx + rep > nlen + ndist) throw ioError('PARSE_ERROR', 'Invalid compressed data (too many lengths).');
            while (rep--) all[idx++] = len;
          }
        }
        codes(huff(all.subarray(0, nlen), nlen), huff(all.subarray(nlen), ndist));
      } else throw ioError('PARSE_ERROR', 'Invalid compressed data (block type).');
    } while (!last);
    return out.slice(0, outLen);
  }

  let FORCE_JS_INFLATE = false;
  async function inflateRaw(u8, sizeHint) {
    if (!FORCE_JS_INFLATE && typeof DecompressionStream === 'function') {
      let ds = null;
      try { ds = new DecompressionStream('deflate-raw'); } catch (e) { ds = null; }   // Node 18: format unsupported
      if (ds) {
        try {
          const w = ds.writable.getWriter();
          w.write(u8).catch(() => {}); w.close().catch(() => {});
          const r = ds.readable.getReader();
          const chunks = []; let total = 0;
          for (;;) { const x = await r.read(); if (x.done) break; chunks.push(x.value); total += x.value.length; }
          const res = new Uint8Array(total); let o = 0;
          chunks.forEach(c => { res.set(c, o); o += c.length; });
          return res;
        } catch (e) { /* fall through to the JS inflater */ }
      }
    }
    return inflateRawJS(u8, sizeHint);
  }

  // ---------------------------------------------------------------------------
  // ZIP reader / writer
  // ---------------------------------------------------------------------------
  function readZipDirectory(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw ioError('PARSE_ERROR', 'The file is not a valid .xlsx package (no ZIP directory found).');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    if (off === 0xFFFFFFFF) throw ioError('PARSE_ERROR', 'ZIP64 workbooks are not supported. Save a smaller copy as .xlsx and re-upload.');
    const entries = {};
    for (let n = 0; n < count; n++) {
      if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) throw ioError('PARSE_ERROR', 'The .xlsx ZIP directory is damaged.');
      const flags = dv.getUint16(off + 8, true);
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
      const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const nameBytes = u8.subarray(off + 46, off + 46 + nlen);
      const name = (flags & 0x800) ? decodeUtf8(nameBytes) : Array.from(nameBytes, b => String.fromCharCode(b)).join('');
      entries[name.replace(/\\/g, '/')] = { name, method, csize, usize, lho, flags };
      off += 46 + nlen + xlen + clen;
    }
    return { entries, dv };
  }

  async function zipRead(u8, dir, name) {
    const e = dir.entries[name];
    if (!e) return null;
    const dv = dir.dv;
    if (dv.getUint32(e.lho, true) !== 0x04034b50) throw ioError('PARSE_ERROR', `Damaged ZIP entry ${name}.`);
    if (e.flags & 1) throw ioError('UNSUPPORTED_FORMAT', 'The workbook is encrypted. Remove the password, save as .xlsx and re-upload.');
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const raw = u8.subarray(start, start + e.csize);
    if (e.method === 0) return raw.slice();
    if (e.method === 8) return inflateRaw(raw, e.usize);
    throw ioError('PARSE_ERROR', `Unsupported ZIP compression method ${e.method} in ${name}.`);
  }

  // files: [{name, data:Uint8Array}] -> Uint8Array (STORE, CRC32, UTF-8 names)
  function zipStore(files) {
    const parts = [], central = [];
    let offset = 0;
    const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01 00:00 — deterministic output
    files.forEach(f => {
      const nameB = utf8(f.name), data = f.data, crc = crc32(data);
      const lh = new Uint8Array(30 + nameB.length), ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true); ldv.setUint16(4, 20, true); ldv.setUint16(6, 0x800, true); ldv.setUint16(8, 0, true);
      ldv.setUint16(10, DOS_TIME, true); ldv.setUint16(12, DOS_DATE, true); ldv.setUint32(14, crc, true);
      ldv.setUint32(18, data.length, true); ldv.setUint32(22, data.length, true);
      ldv.setUint16(26, nameB.length, true); ldv.setUint16(28, 0, true); lh.set(nameB, 30);
      const ch = new Uint8Array(46 + nameB.length), cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(8, 0x800, true);
      cdv.setUint16(10, 0, true); cdv.setUint16(12, DOS_TIME, true); cdv.setUint16(14, DOS_DATE, true); cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true); cdv.setUint32(24, data.length, true); cdv.setUint16(28, nameB.length, true);
      cdv.setUint32(42, offset, true); ch.set(nameB, 46);
      parts.push(lh, data); central.push(ch);
      offset += lh.length + data.length;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22), edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, files.length, true); edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true); edv.setUint32(16, offset, true);
    const all = parts.concat(central, [eocd]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; all.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Minimal XML scanner (namespace prefixes stripped from element names)
  // ---------------------------------------------------------------------------
  function xmlDecode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
      if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch (x) { return ''; }
    });
  }
  function ooxmlUnescape(s) { return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))); }

  const TAG_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)(?:[A-Za-z_][\w.\-]*:)?([A-Za-z_][\w.\-]*)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const ATTR_RE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  function parseAttrs(s) {
    const a = {};
    if (!s) return a;
    let m; ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(s))) {
      const full = m[1], val = xmlDecode(m[2] !== undefined ? m[2] : m[3]);
      a[full] = val;
      const local = full.indexOf(':') >= 0 ? full.slice(full.indexOf(':') + 1) : full;
      if (!(local in a)) a[local] = val;
    }
    return a;
  }
  function scanXml(xml, h) {
    let last = 0, m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(xml))) {
      if (m.index > last && h.text) h.text(xmlDecode(xml.slice(last, m.index)));
      last = TAG_RE.lastIndex;
      if (m[1] !== undefined) { if (h.text) h.text(m[1]); continue; }
      if (!m[3]) continue;
      if (m[2] === '/') { if (h.close) h.close(m[3]); }
      else {
        if (h.open) h.open(m[3], parseAttrs(m[4]), m[5] === '/');
        if (m[5] === '/' && h.close) h.close(m[3]);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // XLSX reading
  // ---------------------------------------------------------------------------
  function colIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }
  function colName(i) {
    let s = ''; i += 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function parseSharedStrings(xml) {
    const out = [];
    let inSi = false, rph = 0, inT = false, buf = '';
    scanXml(xml, {
      open(n, a, self) {
        if (n === 'si') { inSi = true; buf = ''; }
        else if (n === 'rPh') rph++;
        else if (n === 't' && inSi && !rph && !self) inT = true;
      },
      close(n) {
        if (n === 'si') { out.push(ooxmlUnescape(buf)); inSi = false; }
        else if (n === 'rPh') rph--;
        else if (n === 't') inT = false;
      },
      text(t) { if (inT) buf += t; }
    });
    return out;
  }

  function parseRels(xml) {
    const rels = {};
    scanXml(xml || '', { open(n, a) { if (n === 'Relationship') rels[a.Id] = { target: a.Target, type: a.Type || '', mode: a.TargetMode }; } });
    return rels;
  }
  function resolvePath(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    const parts = (base ? base.split('/') : []).concat(target.split('/'));
    const out = [];
    parts.forEach(p => { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); });
    return out.join('/');
  }

  const MAX_ROWS = 1048576, MAX_COLS = 16384;
  function parseWorksheet(xml, sst) {
    const rows = [];
    let r = -1, c = -1, cell = null, inV = false, inIs = false, inT = false, rph = 0, vbuf = '', tbuf = '';
    scanXml(xml, {
      open(n, a, self) {
        if (n === 'row') { r = a.r ? parseInt(a.r, 10) - 1 : r + 1; c = -1; }
        else if (n === 'c') {
          if (a.r) { const m = /^([A-Z]+)(\d+)$/.exec(a.r); if (m) { c = colIndex(m[1]); r = parseInt(m[2], 10) - 1; } else c++; }
          else c++;
          cell = { t: a.t || 'n' }; vbuf = ''; tbuf = '';
          if (self) cell = null;
        } else if (n === 'v' && cell) { inV = true; vbuf = ''; }
        else if (n === 'is' && cell) { inIs = true; }
        else if (n === 'rPh') rph++;
        else if (n === 't' && inIs && !rph) inT = true;
      },
      close(n) {
        if (n === 'v') inV = false;
        else if (n === 'is') inIs = false;
        else if (n === 't') inT = false;
        else if (n === 'rPh') rph--;
        else if (n === 'c' && cell) {
          let v = null;
          const t = cell.t;
          if (t === 's') { const i = parseInt(vbuf, 10); v = sst && i >= 0 && i < sst.length ? sst[i] : null; }
          else if (t === 'inlineStr') v = ooxmlUnescape(tbuf);
          else if (t === 'b') v = vbuf.trim() === '1' || vbuf.trim().toLowerCase() === 'true';
          else if (t === 'str' || t === 'e' || t === 'd') v = vbuf === '' ? null : ooxmlUnescape(vbuf);
          else { const s = vbuf.trim(); if (s !== '') { const x = Number(s); v = isFinite(x) ? x : s; } }
          if (v !== null && v !== '' && r >= 0 && r < MAX_ROWS && c >= 0 && c < MAX_COLS) {
            while (rows.length <= r) rows.push([]);
            const row = rows[r];
            while (row.length < c) row.push(null);
            row[c] = v;
          }
          cell = null;
        }
      },
      text(t) { if (inV) vbuf += t; else if (inT) tbuf += t; }
    });
    return rows;
  }

  async function parseXlsx(u8, fileName) {
    const dir = readZipDirectory(u8);
    const E = dir.entries;
    const rootRels = parseRels(E['_rels/.rels'] ? decodeUtf8(await zipRead(u8, dir, '_rels/.rels')) : '');
    let wbPath = 'xl/workbook.xml';
    Object.keys(rootRels).forEach(k => { if (/\/officeDocument$/.test(rootRels[k].type)) wbPath = resolvePath('', rootRels[k].target); });
    if (/\.bin$/i.test(wbPath) || E['xl/workbook.bin']) throw ioError('UNSUPPORTED_FORMAT', 'Save as .xlsx and re-upload');
    if (!E[wbPath]) throw ioError('PARSE_ERROR', `${fileName || 'The file'} is not an Excel workbook (xl/workbook.xml missing).`);
    const wbDir = wbPath.indexOf('/') >= 0 ? wbPath.slice(0, wbPath.lastIndexOf('/')) : '';
    const relsPath = (wbDir ? wbDir + '/' : '') + '_rels/' + wbPath.slice(wbPath.lastIndexOf('/') + 1) + '.rels';
    const rels = parseRels(E[relsPath] ? decodeUtf8(await zipRead(u8, dir, relsPath)) : '');
    let sstPath = null;
    Object.keys(rels).forEach(k => { if (/\/sharedStrings$/.test(rels[k].type)) sstPath = resolvePath(wbDir, rels[k].target); });
    if (!sstPath && E[(wbDir ? wbDir + '/' : '') + 'sharedStrings.xml']) sstPath = (wbDir ? wbDir + '/' : '') + 'sharedStrings.xml';
    const sst = sstPath && E[sstPath] ? parseSharedStrings(decodeUtf8(await zipRead(u8, dir, sstPath))) : [];
    const wbXml = decodeUtf8(await zipRead(u8, dir, wbPath));
    const sheetDefs = [];
    scanXml(wbXml, { open(n, a) { if (n === 'sheet') sheetDefs.push({ name: a.name, rid: a['r:id'] || a.id, state: a.state || 'visible' }); } });
    const sheets = [];
    for (const d of sheetDefs) {
      const rel = rels[d.rid];
      if (!rel || !/\/worksheet$/.test(rel.type)) continue;          // chartsheets, dialog sheets, macro sheets
      const p = resolvePath(wbDir, rel.target);
      const data = await zipRead(u8, dir, p);
      if (!data) continue;
      const s = { name: d.name, rows: parseWorksheet(decodeUtf8(data), sst) };
      if (d.state !== 'visible') s.hidden = true;
      sheets.push(s);
    }
    if (!sheets.length) throw ioError('PARSE_ERROR', 'The workbook has no worksheets.');
    return { sheets };
  }

  // ---------------------------------------------------------------------------
  // CSV reading
  // ---------------------------------------------------------------------------
  function decodeText(u8) {
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    const body = u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF ? u8.subarray(3) : u8;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch (e) { return new TextDecoder('windows-1252').decode(body); }
  }
  function detectDelimiter(text) {
    const cands = [',', ';', '\t'];
    const counts = { ',': [], ';': [], '\t': [] };
    let inQ = false, line = { ',': 0, ';': 0, '\t': 0 }, lines = 0;
    for (let i = 0; i < text.length && lines < 10; i++) {
      const ch = text[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cands.forEach(d => counts[d].push(line[d])); line = { ',': 0, ';': 0, '\t': 0 }; lines++;
      } else if (!inQ && line[ch] !== undefined) line[ch]++;
    }
    if (lines < 10) cands.forEach(d => counts[d].push(line[d]));
    let best = ',', bestScore = -1;
    cands.forEach(d => {
      const c = counts[d].filter((x, i) => i < counts[d].length);
      const nonzero = c.filter(x => x > 0).length;
      const score = nonzero * 1000 + (c[0] || 0);
      if (score > bestScore) { best = d; bestScore = score; }
    });
    return best;
  }
  function parseCsvText(text) {
    text = text.replace(/^﻿/, '');
    let delimiter = null;
    const sep = /^sep=(.)\r?\n/i.exec(text);
    if (sep) { delimiter = sep[1]; text = text.slice(sep[0].length); }
    if (!delimiter) delimiter = detectDelimiter(text);
    const rows = [];
    let row = [], field = '', inQ = false, quoted = false, i = 0;
    const pushField = () => {
      const v = quoted ? field : field.trim();
      row.push(v === '' && !quoted ? null : (v === '' ? null : v));
      field = ''; quoted = false;
    };
    const pushRow = () => { pushField(); rows.push(row); row = []; };
    while (i < text.length) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field.trim() === '') { inQ = true; quoted = true; field = ''; i++; continue; }
      if (ch === delimiter) { pushField(); i++; continue; }
      if (ch === '\r' || ch === '\n') { pushRow(); i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1; continue; }
      field += ch; i++;
    }
    if (field !== '' || quoted || row.length) pushRow();
    // trim trailing all-empty rows and trailing nulls
    rows.forEach(r => { while (r.length && r[r.length - 1] === null) r.pop(); });
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    return { rows, delimiter };
  }

  // ---------------------------------------------------------------------------
  // parseFile
  // ---------------------------------------------------------------------------
  function toU8(buf) {
    if (buf instanceof Uint8Array) return buf;
    if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    if (buf && buf.buffer instanceof ArrayBuffer) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    throw ioError('PARSE_ERROR', 'parseFile expects an ArrayBuffer.');
  }
  async function parseFile(arrayBuffer, fileName) {
    const name = String(fileName || '');
    const ext = (/\.([A-Za-z0-9]+)$/.exec(name) || [, ''])[1].toLowerCase();
    const u8 = toU8(arrayBuffer);
    if (ext === 'xls' || ext === 'xlsb') throw ioError('UNSUPPORTED_FORMAT', 'Save as .xlsx and re-upload');
    if (!u8.length) throw ioError('EMPTY_FILE', 'The file is empty.');
    const isZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4B;
    const isOle = u8.length > 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0;
    if (isOle) throw ioError('UNSUPPORTED_FORMAT', 'Save as .xlsx and re-upload');   // legacy .xls or encrypted package
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || (!isZip && ext !== 'xlsx' && ext !== 'xlsm')) {
      if (isZip) throw ioError('UNSUPPORTED_FORMAT', 'Save as .xlsx and re-upload');
      const p = parseCsvText(decodeText(u8));
      const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || 'Sheet1';
      return { sheets: [{ name: base, rows: p.rows, delimiter: p.delimiter }] };
    }
    if (!isZip) throw ioError('PARSE_ERROR', `${name || 'The file'} is not a valid .xlsx workbook.`);
    return parseXlsx(u8, name);
  }

  // ---------------------------------------------------------------------------
  // Header / grain / mapping detection
  // ---------------------------------------------------------------------------
  const ARCH = ['Loyalists', 'Splitters', 'Dabblers', 'Conservatives'];
  function norm(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase()
      .replace(/[_\-\/.:()#\[\]]+/g, ' ').replace(/\s*%/g, ' %').replace(/\s+/g, ' ').trim();
  }
  /* Archetypes the importer recognises: the four reference names plus every configuration archetype the mapping fields
     list (FSFields.MAPPING_FIELDS archetypeMix.*). Reference-only files import exactly as before. */
  function importArch() {
    const extra = mappingFields(fields()).map(f => f.id).filter(id => id.startsWith('archetypeMix.')).map(id => id.slice(13));
    return ARCH.concat(extra.filter((a, i) => !ARCH.includes(a) && extra.indexOf(a) === i));
  }
  function archetypeName(v) {
    const n = norm(v).replace(/ %$/, '').replace(/\s+/g, '');
    for (const a of importArch()) { const l = a.toLowerCase().replace(/\s+/g, ''); if (n === l || n === l.slice(0, -1)) return a; }
    return null;
  }
  const NEG_TOKENS = /\b(max|maximum|min|minimum|mix|share)\b/;
  function fieldScore(header, field) {
    const h = norm(header);
    if (!h) return 0;
    const cands = field.aliases.concat([field.label]).map(norm);
    if (cands.includes(h)) return 1;
    let best = 0;
    for (const a of cands) {
      if (!a || a.length < 2) continue;
      if ((' ' + h + ' ').indexOf(' ' + a + ' ') >= 0) {
        if (NEG_TOKENS.test(h) && !NEG_TOKENS.test(a)) continue;
        best = Math.max(best, Math.min(0.9, 0.6 + 0.3 * (a.length / h.length)));
      }
    }
    return best;
  }
  function isBlankRow(row) { return !row || row.every(v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')); }
  function cellStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v).trim();
  }

  /* CS-3 (v0.4): optional Specialty mapping. fields.js carries a `specialty` MAPPING_FIELD (v0.4); this local fallback with
     the same id is used only when an older fields.js is loaded. Segments become (specialty, decile) pairs with segment = "<specialty> · <decile>". */
  const SPECIALTY_FALLBACK = { id: 'specialty', label: 'Specialty', optional: true,
    aliases: ['specialty', 'hcp specialty', 'physician specialty', 'prescriber specialty', 'primary specialty', 'speciality'] };
  const SPEC_SEP = ' · ';
  function specialtyField(F) { return F.MAPPING_FIELDS.find(f => f.id === 'specialty') || SPECIALTY_FALLBACK; }
  function mappingFields(F) { return F.MAPPING_FIELDS.some(f => f.id === 'specialty') ? F.MAPPING_FIELDS : F.MAPPING_FIELDS.concat([SPECIALTY_FALLBACK]); }
  const composeSegment = (spec, decile) => `${spec}${SPEC_SEP}${decile}`;

  function candidateFields(method, grain) {
    const F = fields();
    const ids = grain === 'entity'
      ? ['entityId', 'segment', 'value', 'archetype', 'reachPct', 'plannedCalls', 'maxCalls', 'specialty']
      : ['segment', 'entities', 'compositeValue', 'reachPct', 'plannedCalls', 'specialty'];
    return mappingFields(F).filter(f => ids.includes(f.id) &&
      !(f.id === 'plannedCalls' && method !== 'workload') &&
      !(f.id === 'archetype' && method !== 'response') &&
      !((f.id === 'value' || f.id === 'compositeValue') && method === 'workload') &&
      !(f.grain && f.grain !== grain) && !(Array.isArray(f.methods) && !f.methods.includes(method)));
  }

  function assign(headers, fieldsList) {
    const pairs = [];
    headers.forEach((h, ci) => fieldsList.forEach(f => { const s = fieldScore(h, f); if (s >= 0.6) pairs.push({ ci, id: f.id, s }); }));
    pairs.sort((a, b) => b.s - a.s || a.ci - b.ci);
    const mapping = {}, confidence = {}, used = new Set();
    pairs.forEach(p => { if (!(p.id in mapping) && !used.has(p.ci)) { mapping[p.id] = p.ci; confidence[p.id] = p.s; used.add(p.ci); } });
    return { mapping, confidence, used };
  }

  /* detect(sheet, method, workbook?) — workbook ({sheets} or an array of sheets) is optional. When given, and two or more
     visible sheets (this one included) share this sheet's data header shape, the result carries
     tabsAsSpecialties: [sheet names] (CS-3 "one tab per specialty"). Without a workbook the result is as before. */
  function detect(sheet, method, workbook) {
    const d = detectOne(sheet, method);
    const list = workbook && (Array.isArray(workbook) ? workbook : workbook.sheets);
    if (Array.isArray(list) && list.length > 1 && !('specialty' in d.mapping) && isNum(d.mapping.segment)) {
      const tabs = tabsSharingShape(sheet, d, list, method);
      if (tabs.length >= 2) d.tabsAsSpecialties = tabs.map(s => s.name);
    }
    return d;
  }
  const headerShape = (sh, headerRow) => {
    const h = ((sh && sh.rows && sh.rows[headerRow]) || []).map(v => norm(cellStr(v)));
    while (h.length && h[h.length - 1] === '') h.pop();
    return h.join('\u0001');
  };
  // Visible sheets with data whose header row (as detected) matches `sheet`'s header row, in workbook order.
  function tabsSharingShape(sheet, d, list, method) {
    const shape = headerShape(sheet, d.headerRow);
    if (!shape) return [];
    return list.filter(sh => {
      if (!sh || (sh.hidden && sh !== sheet)) return false;
      if (sh === sheet || sh.name === (sheet && sheet.name)) return true;
      const rows = sh.rows || [];
      if (!rows.some(r => !isBlankRow(r))) return false;
      const dd = detectOne(sh, method);
      return headerShape(sh, dd.headerRow) === shape && rows.slice(dd.headerRow + 1).some(r => !isBlankRow(r));
    });
  }

  function detectOne(sheet, method) {
    const F = fields();
    const rows = (sheet && sheet.rows) || [];
    const allFields = mappingFields(F);
    // 1. header row = best alias-matching row among the first 30
    let headerRow = -1, bestScore = 0;
    for (let r = 0; r < Math.min(30, rows.length); r++) {
      const row = rows[r] || [];
      let score = 0;
      row.forEach(v => { if (typeof v === 'string' && v.trim()) { let b = 0; allFields.forEach(f => { b = Math.max(b, fieldScore(v, f)); }); if (archetypeName(v)) b = Math.max(b, 0.6); if (b >= 0.6) score += b; } });
      if (score > bestScore + 1e-9) { bestScore = score; headerRow = r; }
    }
    if (headerRow < 0) headerRow = rows.findIndex(r => !isBlankRow(r));
    if (headerRow < 0) headerRow = 0;
    const headers = (rows[headerRow] || []).map(cellStr);
    const data = rows.slice(headerRow + 1).filter(r => !isBlankRow(r));
    const colValues = ci => data.map(r => cellStr(r[ci])).filter(v => v !== '');
    const uniqueRatio = ci => { const v = colValues(ci); return v.length ? new Set(v).size / v.length : 0; };

    // 2. grain
    const idField = allFields.find(f => f.id === 'entityId'), segField = allFields.find(f => f.id === 'segment');
    const bestCol = f => { let b = -1, bs = 0; headers.forEach((h, ci) => { const s = fieldScore(h, f); if (s > bs) { bs = s; b = ci; } }); return { ci: b, s: bs }; };
    let idc = bestCol(idField);
    const segc = bestCol(segField);
    // With a Specialty column, a segment is a (specialty, decile) pair, so distinctness is counted on the pair.
    const specc = bestCol(specialtyField(F));
    const pairCi = specc.s >= 0.6 && specc.ci >= 0 && specc.ci !== segc.ci && specc.ci !== idc.ci ? specc.ci : -1;
    const segDistinct = segc.ci < 0 ? 0 : (pairCi < 0 ? new Set(colValues(segc.ci)).size
      : new Set(data.map(r => cellStr(r[pairCi]).toLowerCase() + '\u0000' + cellStr(r[segc.ci])).filter(k => !/\u0000$/.test(k))).size);
    let inputGrain = 'summary', idGuess = null;
    if (idc.s >= 0.9 && segc.s >= 0.6 && data.length > Math.max(segDistinct, 1) && uniqueRatio(idc.ci) >= 0.5) inputGrain = 'entity';
    else if (idc.s >= 0.6 && uniqueRatio(idc.ci) >= 0.95 && data.length > Math.max(segDistinct, 1)) inputGrain = 'entity';
    else if (segc.s >= 0.6 && (data.length <= 40 || pairCi >= 0) && segDistinct >= data.length * 0.9) inputGrain = 'summary';
    else if (data.length > 40) {
      const ci = headers.findIndex((h, i) => i !== segc.ci && i !== pairCi && colValues(i).length === data.length && uniqueRatio(i) === 1);
      if (ci >= 0) { inputGrain = 'entity'; idGuess = ci; }
    }
    // 3. mapping
    const res = assign(headers, candidateFields(method, inputGrain));
    if (inputGrain === 'entity' && !('entityId' in res.mapping) && idGuess !== null && !res.used.has(idGuess)) {
      res.mapping.entityId = idGuess; res.confidence.entityId = 0.5;
    }
    if (inputGrain === 'entity' && 'entityId' in res.mapping) res.confidence.entityId *= Math.max(0.5, uniqueRatio(res.mapping.entityId));
    if (inputGrain === 'summary' && method === 'response') {
      headers.forEach((h, ci) => {
        const a = archetypeName(h);
        if (a && !res.used.has(ci) && !(('archetypeMix.' + a) in res.mapping)) { res.mapping['archetypeMix.' + a] = ci; res.confidence['archetypeMix.' + a] = 1; res.used.add(ci); }
      });
    }
    const confidence = {};
    allFields.forEach(f => { confidence[f.id] = res.confidence[f.id] ? Math.round(res.confidence[f.id] * 100) / 100 : 0; });
    Object.keys(res.confidence).forEach(k => { if (k.indexOf('archetypeMix.') === 0) confidence[k] = res.confidence[k]; });
    return { headerRow, inputGrain, mapping: res.mapping, confidence };
  }

  // ---------------------------------------------------------------------------
  // applyMapping
  // ---------------------------------------------------------------------------
  // returns {n:number|null, pct:bool, bad:bool}
  function parseNumber(v, decimalComma) {
    if (v === null || v === undefined) return { n: null, pct: false, bad: false };
    if (typeof v === 'number') return isFinite(v) ? { n: v, pct: false, bad: false } : { n: null, pct: false, bad: true };
    if (typeof v === 'boolean') return { n: null, pct: false, bad: true };
    let s = String(v).replace(/[\s ]+/g, '');
    if (s === '') return { n: null, pct: false, bad: false };
    let neg = false, pct = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/%$/.test(s)) { pct = true; s = s.slice(0, -1); }
    s = s.replace(/^[$€£]|[$€£]$/g, '');
    const hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      if (!decimalComma && /^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
      else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    }
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { n: null, pct, bad: true };
    let n = Number(s);
    if (neg) n = -n;
    return isFinite(n) ? { n, pct, bad: false } : { n: null, pct, bad: true };
  }
  function idStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v).trim();
  }
  const TOTAL_RE = /^(grand\s+)?(total|totals|sum|all)$/i;

  /* applyMapping(sheet, opts, method, extra?) — extra (or opts) may carry { tabsAsSpecialties: true, sheets } (CS-3): the
     listed sheets (sheet objects, or names resolved against extra.workbook / opts.workbook; with only a workbook, the tabs
     detect reports) share one header shape and are stacked with specialty = sheet name. A mapped `specialty` column gives
     the same result from a single sheet. Either way segments are (specialty, decile) pairs:
     { segment: "<specialty> · <decile>", specialty, decile, ... }, and entity rows carry the same composed segment key.
     With no specialty the result is exactly as before (no specialty/decile keys). */
  function applyMapping(sheet, opts, method, extra) {
    const F = fields();
    const rows = (sheet && sheet.rows) || [];
    const o = opts || {};
    const x = extra || {};
    // opt-in only: detect's tabsAsSpecialties array on opts (a detect result passed as opts) does not switch it on
    const tabsOn = x.tabsAsSpecialties === true || o.tabsAsSpecialties === true;
    const headerRow = isNum(o.headerRow) ? o.headerRow : 0;
    const inputGrain = o.inputGrain === 'entity' ? 'entity' : 'summary';
    const mapping = tabsOn && o.mapping && 'specialty' in o.mapping ? Object.assign({}, o.mapping) : (o.mapping || {});
    const decimalComma = sheet && sheet.delimiter === ';';
    const errors = [], warnings = [];
    const err = (code, path, message) => errors.push({ code, path, message });
    const warn = (code, path, message) => warnings.push({ code, path, message });
    const headers = (rows[headerRow] || []).map(cellStr);
    const label = id => { const f = mappingFields(F).find(y => y.id === id); return f ? f.label : id; };
    if (tabsOn && 'specialty' in mapping) {
      delete mapping.specialty;
      warn('specialty-column-ignored', 'mapping.specialty', 'Each sheet is read as one specialty (the sheet name), so the mapped Specialty column was not used.');
    }
    const colLabel = id => { const ci = mapping[id]; return headers[ci] ? `"${headers[ci]}"` : `column ${colName(ci)}`; };

    const required = F.requiredMapping(method, inputGrain);
    required.forEach(id => {
      if (!isNum(mapping[id])) err('mapping-required', `mapping.${id}`, `Map a column to "${label(id)}"; it is required for this method and input level.`);
    });
    Object.keys(mapping).forEach(id => {
      if (isNum(mapping[id]) && (mapping[id] < 0 || mapping[id] >= Math.max(headers.length, 1) + 200)) err('mapping-invalid', `mapping.${id}`, `Mapped column for "${label(id)}" is out of range.`);
    });
    if (errors.length) return finishIssues({ segments: [], entities: null, errors, warnings, rowCount: 0, preview: [] }, F, method);

    // Tabs mode: resolve the sheets to stack and check that they share the header shape.
    let tabs = null;
    if (tabsOn) {
      const wbList = (x.workbook && x.workbook.sheets) || (o.workbook && o.workbook.sheets) || [];
      // sheets to stack: extra.sheets / opts.sheets (objects or names); else the tabs detect finds in the workbook
      const raw = Array.isArray(x.sheets) ? x.sheets : (Array.isArray(o.sheets) ? o.sheets
        : (wbList.length ? (detect(sheet, method, { sheets: wbList }).tabsAsSpecialties || []) : []));
      const list = raw.map(t => (typeof t === 'string' ? wbList.find(w => w && w.name === t) || (sheet && sheet.name === t ? sheet : null) : t));
      if (list.some(t => !t) || list.length < 2) {
        err('tabs-missing', 'sheets', 'Reading one specialty per sheet needs at least two sheets with the same columns.');
        return finishIssues({ segments: [], entities: null, errors, warnings, rowCount: 0, preview: [] }, F, method);
      }
      const shape = headerShape(sheet, headerRow);
      tabs = [];
      list.forEach(t => {
        let hr = (t === sheet || (sheet && t.name === sheet.name)) ? headerRow : detectOne(t, method).headerRow;
        if (headerShape(t, hr) !== shape && headerShape(t, headerRow) === shape) hr = headerRow;
        if (headerShape(t, hr) !== shape) err('tab-shape-mismatch', 'sheets', `Sheet "${t.name}" does not have the same columns as sheet "${sheet && sheet.name}", so it cannot be read as a specialty tab.`);
        else tabs.push({ sheet: t, headerRow: hr, spec: String(t.name === undefined || t.name === null ? '' : t.name).trim() });
      });
      if (errors.length) return finishIssues({ segments: [], entities: null, errors, warnings, rowCount: 0, preview: [] }, F, method);
    }
    const dataRows = [];
    let blankInside = 0;
    (tabs || [{ sheet, headerRow, spec: null }]).forEach(tb => {
      const trows = (tb.sheet && tb.sheet.rows) || [];
      const start = dataRows.length;
      let inside = 0;
      for (let r = tb.headerRow + 1; r < trows.length; r++) {
        if (isBlankRow(trows[r])) { inside++; continue; }
        dataRows.push(tabs ? { r, row: trows[r], sheet: tb.sheet.name, spec: tb.spec } : { r, row: trows[r] });
      }
      // trailing blanks do not count as "inside"
      if (dataRows.length > start) { let t = 0; for (let r = trows.length - 1; r > dataRows[dataRows.length - 1].r; r--) t++; inside -= t; }
      blankInside += inside;
    });
    if (blankInside > 0) warn('blank-rows-skipped', 'rows', `${blankInside} blank row(s) between data rows were skipped.`);
    const get = (row, id) => (isNum(mapping[id]) ? row[mapping[id]] : undefined);
    const has = id => isNum(mapping[id]);
    const sheetRow = r => r + 1;
    // Row wording: "Row 5" as before; in tabs mode the sheet is named ("Sheet "Endocrinology" row 5").
    const RW = d => (d.sheet !== undefined ? `Sheet "${d.sheet}" row ${d.r + 1}` : `Row ${d.r + 1}`);
    const RP = d => `row ${d.r + 1}`;
    const RS = d => (d.sheet !== undefined ? `${d.r + 1} in sheet "${d.sheet}"` : d.r + 1);
    // Specialty: from the sheet name (tabs) or a mapped column; case-insensitive, first spelling kept.
    const specOn = !!tabs || has('specialty');
    const specSpell = new Map();
    let specMerged = false;
    const specOf = d => {
      const raw = tabs ? d.spec : idStr(get(d.row, 'specialty'));
      if (!raw) return '';
      const k = raw.toLowerCase();
      if (!specSpell.has(k)) specSpell.set(k, raw); else if (specSpell.get(k) !== raw) specMerged = true;
      return specSpell.get(k);
    };

    // Reach: column-level unit decision (all numeric values <= 1 and none written with % => fractions)
    let reachFraction = false, reachMixed = false;
    if (has('reachPct')) {
      const vals = dataRows.map(d => get(d.row, 'reachPct')).filter(v => v !== null && v !== undefined && v !== '');
      const parsed = vals.map(v => parseNumber(v, decimalComma)).filter(p => !p.bad && p.n !== null);
      const plain = dataRows.map(d => ({ r: RS(d), p: parseNumber(get(d.row, 'reachPct'), decimalComma) }))
        .filter(x => !x.p.bad && x.p.n !== null && !x.p.pct);
      const small = plain.filter(x => x.p.n > 0 && x.p.n <= 1), big = plain.filter(x => x.p.n > 1);
      if (small.length && big.length) {
        const list = a => a.slice(0, 15).map(x => x.r).join(', ') + (a.length > 15 ? ` and ${a.length - 15} more` : '');
        err('reach-mixed-scale', 'reachPct', `Reach values in ${colLabel('reachPct')} mix fractions and percents: rows ${list(small)} are 1 or less (fraction scale), rows ${list(big)} are above 1 (percent scale). Use one percent scale for the whole column (for example 85 or 85%).`);
        reachMixed = true;
      }
      reachFraction = !reachMixed && plain.length > 0 && parsed.every(p => !p.pct) && small.length > 0 && !big.length;
      if (reachFraction) warn('reach-fraction-converted', 'reachPct', `Reach values in ${colLabel('reachPct')} were on a 0 to 1 scale; they were multiplied by 100 and stored as percent (for example 85%).`);
    }
    function readReach(d) {
      const v = get(d.row, 'reachPct');
      const p = parseNumber(v, decimalComma);
      if (p.n === null && !p.bad) return null;
      if (p.bad) { err('non-numeric', `${RP(d)}.reachPct`, `${RW(d)}: Reach % "${v}" is not a number.`); return undefined; }
      if (reachMixed) return undefined;
      let n = p.pct ? p.n : (reachFraction ? p.n * 100 : p.n);
      if (reachFraction) n = Math.round(n * 1e9) / 1e9;
      if (n < 0 || n > 100) { err('reach-out-of-range', `${RP(d)}.reachPct`, `${RW(d)}: Reach % ${cellStr(v)} must be between 0% and 100%.`); return undefined; }
      return n;
    }
    function readNum(d, id, opt) {
      const v = get(d.row, id);
      const p = parseNumber(v, decimalComma);
      const nm = opt.name || label(id);
      if (p.bad || (p.pct && !opt.allowPct)) { err('non-numeric', `${RP(d)}.${id}`, `${RW(d)}: ${nm} "${cellStr(v)}" is not a number.`); return undefined; }
      if (p.n === null) { if (opt.required) err('value-missing', `${RP(d)}.${id}`, `${RW(d)}: ${nm} is empty.`); return opt.required ? undefined : null; }
      if (p.n < 0) { err('negative-value', `${RP(d)}.${id}`, `${RW(d)}: ${nm} cannot be negative (${cellStr(v)}).`); return undefined; }
      return p.n;
    }
    function isTotalRow(d) {
      const s = idStr(get(d.row, 'segment'));
      if (TOTAL_RE.test(s)) return true;
      if (!specOn || tabs) return false;
      const sp = idStr(get(d.row, 'specialty'));           // a specialty "Total" row with no decile, or "Total" / "Total"
      return TOTAL_RE.test(sp) && (!s || TOTAL_RE.test(s));
    }
    const totalText = d => { const s = idStr(get(d.row, 'segment')); return s || (specOn && !tabs ? idStr(get(d.row, 'specialty')) : s); };
    // (specialty, decile) → composed segment label; without specialty the label is the decile/segment text itself.
    const specErr = d => err('value-missing', `${RP(d)}.specialty`, `${RW(d)}: ${label('specialty')} is empty.`);

    const blankSeg = () => ({ segment: '', entities: 0, compositeValue: null, reachPct: null, maxCalls: null, minCalls: null,
      plannedCalls: null, archetypeMix: null });
    const needValue = method !== 'workload';
    let segments = [], entities = null, rowCount = 0;

    if (inputGrain === 'entity') {
      entities = [];
      const bySeg = new Map();
      const idSeen = new Map();       // id -> [{segment,row}]
      const attrCols = headers.map((h, ci) => ci).filter(ci => !Object.keys(mapping).some(k => mapping[k] === ci) && headers[ci]);
      dataRows.forEach(d => {
        if (isTotalRow(d)) { warn('total-row-excluded', `${RP(d)}`, `${RW(d)} looks like a total row ("${totalText(d)}") and was not imported.`); return; }
        rowCount++;
        const id = idStr(get(d.row, 'entityId'));
        const seg = idStr(get(d.row, 'segment'));
        const spec = specOn ? specOf(d) : null;
        const segKey = specOn && spec && seg ? composeSegment(spec, seg) : seg;
        let ok = true;
        if (!id) { err('value-missing', `${RP(d)}.entityId`, `${RW(d)}: Entity ID is empty.`); ok = false; }
        if (specOn && !spec) { specErr(d); ok = false; }
        if (!seg) { err('value-missing', `${RP(d)}.segment`, `${RW(d)}: Decile / segment is empty.`); ok = false; }
        let value = null;
        if (has('value')) { value = readNum(d, 'value', { required: needValue && required.includes('value') }); if (value === undefined) { ok = false; value = null; } }
        let archetype = null;
        if (has('archetype')) {
          const raw = get(d.row, 'archetype');
          archetype = archetypeName(raw);
          if (!archetype && method === 'response') { err('unknown-archetype', `${RP(d)}.archetype`, `${RW(d)}: Curve archetype "${cellStr(raw)}" is not one of ${importArch().join(', ')}.`); ok = false; }
          if (!archetype && raw !== null && raw !== undefined && method !== 'response') archetype = cellStr(raw);
        }
        const reach = has('reachPct') ? readReach(d) : null;
        const planned = has('plannedCalls') ? readNum(d, 'plannedCalls', { required: false }) : null;
        const maxc = has('maxCalls') ? readNum(d, 'maxCalls', { required: false }) : null;
        if (isNum(maxc) && !Number.isInteger(maxc)) { err('not-whole', `${RP(d)}.maxCalls`, `${RW(d)}: ${label('maxCalls')} must be a whole number (${maxc}).`); ok = false; }
        if (reach === undefined || planned === undefined || maxc === undefined) ok = false;
        if (id) { if (!idSeen.has(id)) idSeen.set(id, []); idSeen.get(id).push({ segment: segKey, row: RS(d) }); }
        const attrs = {};
        attrCols.forEach(ci => { if (d.row[ci] !== null && d.row[ci] !== undefined) attrs[headers[ci]] = d.row[ci]; });
        if (isNum(maxc)) attrs.maxCalls = maxc;
        if (!ok) return;
        entities.push(specOn ? { id, segment: segKey, specialty: spec, decile: seg, value, archetype, attrs } : { id, segment: seg, value, archetype, attrs });
        if (!bySeg.has(segKey)) bySeg.set(segKey, { n: 0, value: 0, hasValue: false, reach: [], planned: [], arch: {}, spec, decile: seg });
        const a = bySeg.get(segKey);
        a.n++; if (isNum(value)) { a.value += value; a.hasValue = true; }
        if (isNum(reach)) a.reach.push(reach);
        if (isNum(planned)) a.planned.push(planned);
        if (archetype) a.arch[archetype] = (a.arch[archetype] || 0) + 1;
      });
      // duplicate IDs
      const cross = [], same = [];
      idSeen.forEach((list, id) => {
        if (list.length < 2) return;
        const segs = Array.from(new Set(list.map(x => x.segment)));
        const where = list.map(x => `row ${x.row} (segment ${x.segment})`).join(', ');
        if (segs.length > 1) cross.push(`${id}: ${where}`); else same.push(`${id}: ${where}`);
      });
      if (cross.length) err('duplicate-entity-id', 'entityId', `Entity IDs appear in more than one segment: ${cross.slice(0, 20).join('; ')}${cross.length > 20 ? `; and ${cross.length - 20} more` : ''}.`);
      if (same.length) err('duplicate-entity-id-same-segment', 'entityId', `Entity IDs appear more than once: ${same.slice(0, 20).join('; ')}${same.length > 20 ? `; and ${same.length - 20} more` : ''}.`);
      // segments ordered: numeric labels descending (decile 10 first), else first appearance
      let keys = Array.from(bySeg.keys());
      if (!specOn) { if (keys.length && keys.every(k => /^-?\d+(\.\d+)?$/.test(k))) keys.sort((x, y) => Number(y) - Number(x)); }
      else {
        // specialties in order of first appearance; within a specialty the decile rule above
        const order = [], bySpec = new Map();
        keys.forEach(k => { const sp = bySeg.get(k).spec; if (!bySpec.has(sp)) { bySpec.set(sp, []); order.push(sp); } bySpec.get(sp).push(k); });
        keys = [];
        order.forEach(sp => {
          const ks = bySpec.get(sp);
          if (ks.every(k => /^-?\d+(\.\d+)?$/.test(bySeg.get(k).decile))) ks.sort((x, y) => Number(bySeg.get(y).decile) - Number(bySeg.get(x).decile));
          keys.push(...ks);
        });
      }
      segments = keys.map(k => {
        const a = bySeg.get(k), s = blankSeg();
        s.segment = k; s.entities = a.n; s.compositeValue = a.hasValue ? a.value : null;
        if (specOn) { s.specialty = a.spec; s.decile = a.decile; }
        if (a.reach.length) {
          const same = a.reach.every(x => x === a.reach[0]);
          s.reachPct = same ? a.reach[0] : sum(a.reach) / a.reach.length;
          if (!same) warn('reach-varies-in-segment', `segments.${k}.reachPct`, `Segment ${k}: reach differs between entities; the average (${Math.round(s.reachPct * 10) / 10}%) is used for the segment.`);
          if (a.reach.length < a.n) warn('reach-partly-missing', `segments.${k}.reachPct`, `Segment ${k}: ${a.n - a.reach.length} entities have no reach value; the segment reach uses the entities that do.`);
        }
        if (a.planned.length) {
          const same = a.planned.every(x => x === a.planned[0]);
          s.plannedCalls = same ? a.planned[0] : sum(a.planned) / a.planned.length;
          if (!same) warn('planned-calls-vary-in-segment', `segments.${k}.plannedCalls`, `Segment ${k}: planned calls differ between entities; the average (${Math.round(s.plannedCalls * 100) / 100}) is used and must be a whole number before calculating.`);
        }
        const archTotal = Object.keys(a.arch).reduce((t, x) => t + a.arch[x], 0);
        if (archTotal > 0) { s.archetypeMix = {}; (Object.keys(a.arch).every(x => ARCH.includes(x)) ? ARCH : Object.keys(a.arch)).forEach(x => { s.archetypeMix[x] = 100 * (a.arch[x] || 0) / archTotal; }); }
        return s;
      });
      if (!has('reachPct')) warn('reach-not-supplied', 'reachPct', 'No reach column was mapped; enter Reach % for each segment before calculating.');
    } else {
      const seen = new Map();
      const mixCols = importArch().filter(a => isNum(mapping['archetypeMix.' + a]));
      dataRows.forEach(d => {
        if (isTotalRow(d)) { warn('total-row-excluded', `${RP(d)}`, `${RW(d)} looks like a total row ("${totalText(d)}") and was not imported.`); return; }
        rowCount++;
        const seg = idStr(get(d.row, 'segment'));
        const spec = specOn ? specOf(d) : null;
        const segKey = specOn && spec && seg ? composeSegment(spec, seg) : seg;
        let ok = true;
        if (specOn && !spec) { specErr(d); ok = false; }
        if (!seg) { err('value-missing', `${RP(d)}.segment`, `${RW(d)}: Decile / segment is empty.`); ok = false; }
        else if (seen.has(segKey)) { err('duplicate-segment', `${RP(d)}.segment`, specOn ? `${RW(d)}: ${label('specialty').toLowerCase()} "${spec}" with decile "${seg}" already appears on row ${seen.get(segKey)}.` : `${RW(d)}: segment "${seg}" already appears on row ${seen.get(segKey)}.`); ok = false; }
        else if (specOn && !spec) { /* reported above */ }
        else seen.set(segKey, RS(d));
        const n = readNum(d, 'entities', { required: true });
        const cv = has('compositeValue') ? readNum(d, 'compositeValue', { required: required.includes('compositeValue') }) : null;
        const reach = has('reachPct') ? readReach(d) : null;
        const planned = has('plannedCalls') ? readNum(d, 'plannedCalls', { required: false }) : null;
        if (n === undefined || cv === undefined || reach === undefined || planned === undefined) ok = false;
        let mix = null;
        if (mixCols.length) {
          mix = {};
          mixCols.forEach(a => {
            const p = parseNumber(d.row[mapping['archetypeMix.' + a]], decimalComma);
            if (p.bad) { err('non-numeric', `${RP(d)}.archetypeMix.${a}`, `${RW(d)}: ${a} mix "${cellStr(d.row[mapping['archetypeMix.' + a]])}" is not a number.`); ok = false; return; }
            mix[a] = p.n === null ? 0 : p.n;
          });
          if (ok) {
            const tot = Object.keys(mix).reduce((t, a) => t + (mix[a] || 0), 0);
            if (tot > 0 && tot <= 1.0000001 && !mixCols.some(a => /%/.test(String(d.row[mapping['archetypeMix.' + a]])))) {
              Object.keys(mix).forEach(a => { mix[a] = Math.round(mix[a] * 100 * 1e9) / 1e9; });
              warn('mix-fraction-converted', `${RP(d)}.archetypeMix`, `${RW(d)}: archetype mix looked like fractions and was converted to percent.`);
            }
            if (mixCols.every(a => ARCH.includes(a))) ARCH.forEach(a => { if (!(a in mix)) mix[a] = 0; });   // reference-only files as before
          }
        }
        if (!ok) return;
        const s = blankSeg();
        s.segment = segKey; s.entities = n; s.compositeValue = cv; s.reachPct = reach; s.plannedCalls = planned; s.archetypeMix = mix;
        if (specOn) { s.specialty = spec; s.decile = seg; }
        segments.push(s);
      });
      segments.forEach(s => { if (isNum(s.entities) && !Number.isInteger(s.entities)) warn('entities-not-whole', `segments.${s.segment}.entities`, `Segment ${s.segment}: entity count ${s.entities} is not a whole number.`); });
      if (!has('reachPct')) warn('reach-not-supplied', 'reachPct', 'No reach column was mapped; enter Reach % for each segment before calculating.');
    }
    if (specOn) {
      if (specMerged) warn('specialty-case-merged', 'specialty', `Some ${label('specialty')} values differ only in upper or lower case; they were read as one ${label('specialty').toLowerCase()} (first spelling kept).`);
      const lab = new Map();
      segments.forEach(sg => {
        const k = sg.segment;
        if (lab.has(k)) err('duplicate-segment', `segments.${k}.segment`, `Two ${label('specialty').toLowerCase()} and decile pairs give the same segment label "${k}"; rename one of them.`);
        lab.set(k, true);
      });
    }
    if (!rowCount) err('no-data-rows', 'rows', 'No data rows were found below the header row.');
    // Preview: the first rows as they will be read (normalised: reach 85 not 0.85, canonical archetypes, trimmed ids).
    const PREVIEW_MAX = isNum(o.previewRows) ? o.previewRows : 50;
    const preview = [];
    for (const d of dataRows) {
      if (preview.length >= PREVIEW_MAX) break;
      const values = {}, problems = [];
      Object.keys(mapping).forEach(id => {
        if (!isNum(mapping[id])) return;
        const raw = d.row[mapping[id]];
        let v;
        if (id === 'entityId' || id === 'segment' || id === 'specialty') v = idStr(raw) || null;
        else if (id === 'archetype') v = archetypeName(raw) || (raw === null || raw === undefined ? null : cellStr(raw));
        else {
          const p = parseNumber(raw, decimalComma);
          if (p.bad) { v = null; problems.push(id); }
          else if (id === 'reachPct') v = p.n === null ? null : (p.pct ? p.n : (reachFraction ? Math.round(p.n * 100 * 1e9) / 1e9 : p.n));
          else v = p.n;
        }
        values[id] = v;
      });
      if (tabs) values.specialty = d.spec || null;
      const pr = { row: sheetRow(d.r), values, labels: Object.keys(values).reduce((m, id) => { m[id] = label(id); return m; }, {}), problems,
        excluded: isTotalRow(d) ? 'Total row, not imported' : null };
      if (tabs) pr.sheet = d.sheet;
      preview.push(pr);
    }
    return finishIssues({ segments, entities, errors, warnings, rowCount, preview }, F, method);
  }

  // Every Issue carries a human message plus the field label it concerns (contract v1.7); codes and paths stay for the detail toggle.
  function issueLabel(F, path) {
    const p = String(path || '');
    const MF = mappingFields(F);
    const ids = MF.map(f => f.id).sort((a, b) => b.length - a.length);
    for (const id of ids) if (new RegExp('(^|[.\\s])' + id.replace('.', '\\.') + '($|[.\\s])').test(p)) return MF.find(f => f.id === id).label;
    const seg = F.SEGMENT_FIELDS.find(f => new RegExp('(^|[.])' + f.id + '($|[.])').test(p));
    if (seg) return seg.label('hcp');
    if (/^mapping/.test(p)) return 'Column mapping';
    if (/^row \d+/.test(p)) return 'Row';
    return 'Rows';
  }
  function finishIssues(res, F, method) {
    const add = x => { if (!x.label) x.label = issueLabel(F, x.path); return x; };
    res.errors.forEach(add); res.warnings.forEach(add);
    return res;
  }

  function previewRows(sheet, opts, method, limit) {
    const o = Object.assign({}, opts || {}, { previewRows: isNum(limit) ? limit : 20 });
    return applyMapping(sheet, o, method).preview;
  }

  function rankSheets(workbook, method) {
    const F = fields();
    const sheets = (workbook && workbook.sheets) || [];
    const out = sheets.map((sh, idx) => {
      const rows = sh.rows || [];
      if (!rows.some(r => !isBlankRow(r))) return { name: sh.name, score: 0, idx };
      const d = detect(sh, method);
      const req = F.requiredMapping(method, d.inputGrain);
      const mapped = req.filter(id => isNum(d.mapping[id]));
      const dataRows = rows.slice(d.headerRow + 1).filter(r => !isBlankRow(r)).length;
      const conf = mapped.length ? mapped.reduce((t, id) => t + (d.confidence[id] || 0), 0) / mapped.length : 0;
      let score = dataRows === 0 ? 0 : 0.6 * (mapped.length / req.length) + 0.2 * Math.min(1, dataRows / 5) + 0.2 * conf;
      if (sh.hidden) score *= 0.5;
      return { name: sh.name, score: Math.round(score * 1000) / 1000, idx, headerRow: d.headerRow, inputGrain: d.inputGrain, dataRows };
    });
    return out.sort((a, b) => b.score - a.score || a.idx - b.idx).map(x => { const y = Object.assign({}, x); delete y.idx; return y; });
  }

  // ---------------------------------------------------------------------------
  // XLSX writer
  // ---------------------------------------------------------------------------
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  function clean(s) {
    s = String(s);
    // XML 1.0 forbids most control chars; also drop lone surrogates
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
    if (s.length > 32767) s = s.slice(0, 32760) + ' [...]';
    return s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // style ids (cellXfs order)
  const ST = { DEF: 0, HDR: 1, TITLE: 2, NOTE: 3, LABEL: 4, INT: 5, NUM: 6, FTE: 7, PCT: 8, PCT1: 9, CURVE: 10, WRAP: 11,
    B_INT: 12, B_NUM: 13, B_FTE: 14, SECTION: 15, DEC: 16, B_DEC: 17, ENG_NUM: 18, ENG_INT: 19, ENG_CURVE: 20, ENG_TXT: 21 };
  function stylesXml() {
    const xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
      '<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>',
      '<xf numFmtId="4" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>',
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>',
      '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
      '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="167" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>',
      '<xf numFmtId="4" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>',
      '<xf numFmtId="3" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>',
      '<xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>'
    ];
    const font = (extra) => `<font>${extra}<sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<styleSheet xmlns="${NS}">` +
      '<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.000"/><numFmt numFmtId="165" formatCode="0.0%"/>' +
      '<numFmt numFmtId="166" formatCode="0.0000"/><numFmt numFmtId="167" formatCode="#,##0.0000"/></numFmts>' +
      '<fonts count="5">' + font('') + font('<b/>') +
      '<font><b/><sz val="14"/><color rgb="FF020434"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FF020434"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '</fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE3E6F0"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF020434"/></bottom><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color rgb="FF020434"/></top><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
      '</styleSheet>';
  }

  function SheetB(name) { this.name = name; this.rows = []; this.freeze = 0; this.r = 0; this.minW = {}; this.maxW = {}; }
  SheetB.prototype.set = function (r, c, v, s, f) {
    (this.rows[r] || (this.rows[r] = []))[c] = { v: v === undefined ? null : v, s: s || 0, f: f || null };
    return colName(c) + (r + 1);
  };
  SheetB.prototype.addr = function (r, c, abs) { return abs ? `$${colName(c)}$${r + 1}` : colName(c) + (r + 1); };
  SheetB.prototype.ref = function (r, c) { return `${sheetRef(this.name)}!$${colName(c)}$${r + 1}`; };
  // put a row at the cursor; items: value | {v,s,f}
  SheetB.prototype.line = function (items, style) {
    const r = this.r++;
    (items || []).forEach((it, c) => {
      if (it === undefined) return;
      if (it !== null && typeof it === 'object' && ('v' in it || 'f' in it)) this.set(r, c, it.v, it.s !== undefined ? it.s : style, it.f);
      else if (it !== null) this.set(r, c, it, style);
    });
    return r;
  };
  SheetB.prototype.skip = function (n) { this.r += n === undefined ? 1 : n; };
  function sheetRef(name) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`; }

  function sheetXml(sh, sst, selected) {
    let maxC = 0;
    const widths = [];
    sh.rows.forEach(row => {
      if (!row) return;
      row.forEach((cell, c) => {
        if (!cell) return;
        maxC = Math.max(maxC, c);
        if (cell.s === ST.TITLE || cell.s === ST.NOTE || cell.s === ST.SECTION) return;
        let len;
        const v = cell.v;
        if (typeof v === 'number') len = Math.min(16, String(Math.round(v * 1000) / 1000).length + 3);
        else if (v === null || v === undefined) len = 6;
        else len = Math.max.apply(null, String(v).split('\n').map(x => x.length));
        if (cell.s === ST.HDR) len = Math.min(len, 22) * 0.9 + 2;
        widths[c] = Math.max(widths[c] || 0, len);
      });
    });
    const cols = [];
    for (let c = 0; c <= maxC; c++) {
      let w = Math.max(sh.minW[c] || 9, Math.min(sh.maxW[c] || 60, (widths[c] || 8) + 2));
      cols.push(`<col min="${c + 1}" max="${c + 1}" width="${Math.round(w * 100) / 100}" customWidth="1"/>`);
    }
    let lastRow = 0;
    const rowsXml = [];
    sh.rows.forEach((row, r) => {
      if (!row) return;
      const cells = [];
      row.forEach((cell, c) => {
        if (!cell) return;
        const ref = colName(c) + (r + 1);
        let s = cell.s;
        const v = cell.v;
        if (s === ST.DEF && typeof v === 'string' && (v.length > 60 || v.indexOf('\n') >= 0)) s = ST.WRAP;
        const sa = s ? ` s="${s}"` : '';
        if (cell.f) {
          const fx = `<f>${esc(clean(cell.f))}</f>`;
          if (isNum(v)) cells.push(`<c r="${ref}"${sa}>${fx}<v>${v}</v></c>`);
          else if (typeof v === 'boolean') cells.push(`<c r="${ref}"${sa} t="b">${fx}<v>${v ? 1 : 0}</v></c>`);
          else if (typeof v === 'string') cells.push(`<c r="${ref}"${sa} t="str">${fx}<v>${esc(clean(v))}</v></c>`);
          else cells.push(`<c r="${ref}"${sa}>${fx}</c>`);
        } else if (isNum(v)) cells.push(`<c r="${ref}"${sa}><v>${v}</v></c>`);
        else if (typeof v === 'boolean') cells.push(`<c r="${ref}"${sa} t="b"><v>${v ? 1 : 0}</v></c>`);
        else if (v !== null && v !== undefined && String(v) !== '') cells.push(`<c r="${ref}"${sa} t="s"><v>${sst.idx(clean(v))}</v></c>`);
        else if (s) cells.push(`<c r="${ref}"${sa}/>`);
      });
      if (cells.length) { rowsXml.push(`<row r="${r + 1}">${cells.join('')}</row>`); lastRow = r; }
    });
    const dim = rowsXml.length ? `A1:${colName(maxC)}${lastRow + 1}` : 'A1';
    let view = `<sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}`;
    if (sh.freeze > 0) {
      const tl = `A${sh.freeze + 1}`;
      view += `><pane ySplit="${sh.freeze}" topLeftCell="${tl}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${tl}" sqref="${tl}"/></sheetView>`;
    } else view += '/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<worksheet xmlns="${NS}" xmlns:r="${NSR}"><dimension ref="${dim}"/><sheetViews>${view}</sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols.length ? `<cols>${cols.join('')}</cols>` : '') +
      (rowsXml.length ? `<sheetData>${rowsXml.join('')}</sheetData>` : '<sheetData/>') +
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
  }

  function buildXlsx(sheets) {
    const list = [], map = new Map();
    const sst = { idx(s) { this.count++; if (!map.has(s)) { map.set(s, list.length); list.push(s); } return map.get(s); }, count: 0 };
    const sheetXmls = sheets.map((sh, i) => sheetXml(sh, sst, i === 0));
    const sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<sst xmlns="${NS}" count="${sst.count}" uniqueCount="${list.length}">` +
      list.map(s => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${esc(s)}</t></si>`).join('') + '</sst>';
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';
    const n = sheets.length;
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${NSR}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="${NSR}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${n + 2}" Type="${NSR}/sharedStrings" Target="sharedStrings.xml"/>` +
      '</Relationships>';
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<workbook xmlns="${NS}" xmlns:r="${NSR}"><workbookPr/>` +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(clean(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>Field Sizing workbook</dc:title><dc:creator>Field Sizing prototype</dc:creator></cp:coreProperties>';
    const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Microsoft Excel</Application></Properties>';
    const files = [
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rootRels) },
      { name: 'docProps/core.xml', data: utf8(core) },
      { name: 'docProps/app.xml', data: utf8(app) },
      { name: 'xl/workbook.xml', data: utf8(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(wbRels) },
      { name: 'xl/styles.xml', data: utf8(stylesXml()) }
    ];
    sheetXmls.forEach((x, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(x) }));
    files.push({ name: 'xl/sharedStrings.xml', data: utf8(sstXml) });
    return zipStore(files);
  }

  // ---------------------------------------------------------------------------
  // Export content
  // ---------------------------------------------------------------------------
  const SHEETS = {
    summary: 'Scenario Summary', source: 'Source Data', assumptions: 'Assumptions', calc: 'Detailed Calculations',
    curves: 'Response Curves', compare: 'Scenario Comparison', detail: 'Scenario detail', formulas: 'Formula Documentation', audit: 'Audit and Approval'
  };
  const STATUS = { draft: 'Draft', in_review: 'In review', approved: 'Approved', rejected: 'Rejected' };
  function bindingLabel(F, k) { return (F.BINDING_LABELS && F.BINDING_LABELS[k]) || humanKey(k); }
  /* Exclusion reasons in plain words, shared by the UI (via FSIO.exclusionLabel) and the export so both read the same.
     ctx: { grain, minimumBoundary, stoppingRule }. Accurate for every case the engine emits: 'no-reach' covers 0% reach
     and segments with no entities; 'below-minimum' follows the minimum boundary and, for Response, the min-block rule. */
  function exclusionLabel(F, k, method, ctx) {
    const x = ctx || {};
    const G = (F.GRAIN && F.GRAIN[x.grain]) || (F.GRAIN && F.GRAIN.hcp) || { one: 'entity', many: 'entities' };
    const strict = x.minimumBoundary === 'strict';
    switch (k) {
      case 'no-reach': return `No accessible ${G.many}: reach is 0% or the segment has no ${G.many}`;
      case 'no-value': return 'No value is allocated to this segment';
      case 'below-minimum':
        if (method === 'response' && x.stoppingRule === 'min-block') return 'The minimum call block does not clear the marginal ROI cutoff';
        return `${method === 'response' ? 'Profitable' : 'Affordable'} calls per ${G.one} are ${strict ? 'not above' : 'below'} the minimum`;
      case 'no-profitable-call': return 'No call clears the marginal ROI cutoff';
      case 'no-planned-calls': return 'Planned calls are 0';
    }
    const L = F.EXCLUSION_LABELS && F.EXCLUSION_LABELS[k];
    return L ? (typeof L === 'function' ? L(method) : L) : (k ? humanKey(k) : 'Excluded');
  }
  const exclCtx = c => ({ grain: c.g, minimumBoundary: c.ma.minimumBoundary, stoppingRule: c.ma.stoppingRule || 'first-fail' });
  function roleLabel(F, k) { return (F.ROLE_LABELS && F.ROLE_LABELS[k]) || humanKey(k); }
  // last-resort readable text for an unknown key: "no-profitable-call" -> "No profitable call"
  function humanKey(k) {
    if (k === null || k === undefined || k === '') return '';
    const t = String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const ACTIONS = { create: 'Created', created: 'Created', edit: 'Edited', update: 'Edited', clone: 'Cloned', submit: 'Submitted for review',
    approve: 'Approved', reject: 'Rejected', recommend: 'Marked as recommended', unrecommend: 'Recommendation removed',
    export: 'Exported', import: 'Imported', calculate: 'Calculated', comment: 'Commented' };
  // contract §5 AI actions: used only in AI exports and only when an audit row carries no label of its own
  // (a no-AI export keeps the exact Lane F rendering, even for an unlabelled 'ai-setting' row)
  const AI_ACTIONS = {
    'ai-setting': 'AI assistance setting', 'ai-brief': 'AI brief captured', 'ai-proposed': 'AI candidates proposed', 'ai-blocked': 'AI proposal blocked',
    'ai-gap-filled': 'AI gap filled', 'ai-adopt-start': 'AI candidate review started', 'ai-accepted': 'AI value accepted',
    'ai-edit-accepted': 'AI value edited and accepted', 'ai-rejected': 'AI value rejected', 'ai-adopted': 'AI candidate saved as snapshot',
    'ai-discarded': 'AI candidate discarded', 'ai-narrative': 'AI narrative generated' };
  function actionLabel(a) { return ACTIONS[a] || humanKey(a); }
  function detailText(d) {
    if (d === null || d === undefined) return '';
    if (typeof d !== 'object') return String(d);
    return Object.keys(d).map(k => `${humanKey(k)}: ${typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k]}`).join('; ');
  }
  // timestamps: local time with UTC offset, e.g. "2026-09-25 12:00 UTC+02:00"
  function fmtTime(v) {
    if (v === null || v === undefined || v === '') return '';
    // A bare calendar date has no time or zone; return it unchanged (new Date('YYYY-MM-DD') is UTC
    // midnight and local getters would show the previous day west of UTC).
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = v instanceof Date ? v : (typeof v === 'number' ? new Date(v) : (/^\d{4}-\d{2}-\d{2}/.test(String(v)) ? new Date(String(v)) : null));
    if (!d || isNaN(d.getTime())) return String(v);
    const p2 = n => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset(), sg = off >= 0 ? '+' : '-', ao = Math.abs(off);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())} UTC${sg}${p2(Math.floor(ao / 60))}:${p2(ao % 60)}`;
  }
  const txt = v => (v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const num = v => (isNum(v) ? v : null);
  const close = (a, b) => isNum(a) && isNum(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

  function ctxFor(scenario, project) {
    const F = fields();
    const inp = scenario.inputs || {};
    const res = scenario.result || {};
    const method = inp.method || res.method || project.method;
    const g = F.GRAIN[inp.grain] ? inp.grain : (F.GRAIN[project.grain] ? project.grain : 'hcp');
    const ma = inp.methodAssumptions || {};
    const opts = {
      allocation: ma.allocation || 'proportional',
      roiBasis: ma.roiBasis || 'gross',
      cutoff: method === 'response' ? (isNum(ma.cutoff) ? ma.cutoff : (ma.roiBasis === 'net' ? 0 : 1)) : (isNum(ma.totalRoiCutoff) ? ma.totalRoiCutoff : null),
      stoppingRule: ma.stoppingRule || 'first-fail',
      scenarioMaxCalls: isNum(ma.scenarioMaxCalls) ? ma.scenarioMaxCalls : 48,
      calibrationFactor: ma.value && isNum(ma.value.calibrationFactor) ? ma.value.calibrationFactor : 1
    };
    const totals = res.totals || {};
    const valued = method === 'affordable' || method === 'response';
    /* v0.4: the reallocation (CS-2) block and its comparison columns only when reallocation is On (fs-engine 1.8 also
       reports { on: false, ... } for Off). The option row itself is recorded on every Affordable/Response export, Off by
       default (CS-2.1: "recorded in ... the export"). Specialty columns (CS-3) only when a row has a specialty. */
    const realloc = valued && totals.reallocation && typeof totals.reallocation === 'object' && totals.reallocation.on === true ? totals.reallocation : null;
    const hasSpec = x => x && x.specialty !== undefined && x.specialty !== null && String(x.specialty) !== '';
    const spec = (inp.segments || []).some(hasSpec) || (res.segments || []).some(hasSpec);
    return { F, inp, res, method, g, ma, opts, sh: inp.shared || {}, totals, realloc, spec,
      showCalib: method !== 'workload' && opts.calibrationFactor !== 1,
      showRealloc: valued };
  }
  // CS-2 option text: On / Off (fields.js labels when present)
  function reallocText(F, v) {
    const L = F.OPTION_LABELS && F.OPTION_LABELS.reallocateExcluded;
    if (L && L[String(!!v)]) return L[String(!!v)];
    return v ? 'On' : 'Off';
  }
  const REALLOC_LABEL = 'Reallocate value from excluded segments';
  function resultLabel(F, key, fallback, g) {
    const L = F.RESULT_LABELS && F.RESULT_LABELS[key];
    return typeof L === 'function' ? L(g || 'hcp') : (typeof L === 'string' ? L : fallback);
  }
  function optLabel(F, key, val) {
    const L = F.OPTION_LABELS && F.OPTION_LABELS[key];
    if (L && L[val]) return L[val];
    return txt(val);
  }
  /* v0.5 (CS-5): the methodology choices are fixed defaults, recorded as "Standard method" rows (FR-39). The capacity
     input mode is no longer listed (capacity is shown on Assumptions as entered). Reallocation (CS-2) stays a user choice:
     it is listed last with main: true and is written with the main assumptions, not in the Standard method block.
     [{key, label, value, def, text, defText, changed, main?}] */
  function methodologyOptions(c) {
    const { F, method, sh, ma } = c;
    const out = [];
    const D = F.OPTION_DEFAULTS || {};
    const add = (key, label, value, def0, fmtFn, main) => {
      const def = D[key] !== undefined ? D[key] : def0;
      const f = fmtFn || (v => optLabel(F, key, v));
      if (value === undefined || value === null) value = def;
      const o = { key, label, value, def, text: f(value), defText: f(def), changed: value !== def };
      if (main) o.main = true;
      out.push(o);
    };
    if (method !== 'workload' || isNum(sh.repCost)) add('costPerCallMethod', 'Cost per call method', costMethodOf(sh), 'single-window');
    add('fteRounding', 'FTE rounding (applied to the summed raw FTE)', sh.fteRounding, 'nearest');
    if (method === 'affordable' || method === 'response') add('minimumBoundary', 'Minimum calls boundary', ma.minimumBoundary, 'inclusive');
    if (method === 'response') {
      add('roiBasis', 'ROI basis', ma.roiBasis, 'gross');
      add('stoppingRule', 'Stopping rule', ma.stoppingRule, 'first-fail');
      add('cutoffTie', 'Marginal ROI cutoff ties', ma.cutoffTie, 'include');
      add('reachAppliesTo', 'Reach applies to', ma.reachAppliesTo, 'calls');
      add('maxCallsSource', 'Maximum calls source', ma.maxCallsSource, 'segment');
    }
    if (method === 'affordable' || method === 'response') add('carryoverConvention', 'Carryover convention (forecast chain)', ma.value && ma.value.carryoverConvention, 'receivingYear');
    // Legacy calibration factor (CS-2): no longer a user input; listed only when a saved scenario carries a value other than 1.
    if (c.showCalib) add('calibrationFactor', 'Calibration factor', c.opts.calibrationFactor, 1, v => String(v));
    if (c.showRealloc) add('reallocateExcluded', REALLOC_LABEL, ma.reallocateExcluded === true, (F.OPTION_DEFAULTS || {}).reallocateExcluded === true, v => reallocText(F, v), true);   // default On since 2026-10-12
    return out;
  }
  const UPSTREAM_READ_ONLY = 'Upstream values are read-only (amended FR-07); no corrections are possible.';
  const standardRows = c => methodologyOptions(c).filter(o => !o.main);
  /* v0.5 fix round (F8, F-R2V5-01, F1, F3): fixed values of the standard method that keep a row of their own (the
     sizing horizon feeds live formulas; the normalization point feeds the response curves). The note column says
     "Standard method", or flags a saved scenario that differs, so the sheet shape and every formula address stay. */
  const STD_WINDOW = 3, STD_TAIL = 2, STD_XNORM = 48;
  const DIFFERS = 'Yes: differs from the standard method';
  const stdNote = (value, std, what) => (value === std ? `Standard method. ${what}` : `${DIFFERS} (${std}). ${what}`);
  const xnormDiffers = opts => isNum(opts.scenarioMaxCalls) && opts.scenarioMaxCalls !== STD_XNORM;
  // F1: the standard method stops at the first call that misses the marginal cutoff; a saved scenario with another rule is named
  const stopText = (F, opts) => ((opts.stoppingRule || 'first-fail') === 'first-fail'
    ? 'the marginal ROI test of the standard method, which stops at the first call that misses the marginal cutoff'
    : `the marginal ROI test with the saved stopping rule "${optLabel(F, 'stoppingRule', opts.stoppingRule)}" (differs from the standard method)`);
  // F3: ROI basis is no longer a choice, so the standard (gross) ROI is labelled "ROI"; a saved net basis keeps its label
  const roiLabel = (F, g, opts) => (opts.roiBasis === 'net' ? `ROI (${optLabel(F, 'roiBasis', 'net')})` : F.RESULT_LABELS.roi(g));
  // F13: one label for reached ÷ recommended FTE (the engine's entitiesPerRep, aliased as targetsPerRep)
  const TPR_LABEL = 'Targets per rep';
  const tprNote = (F, g) => `Reached ${F.GRAIN[g].many} ÷ recommended FTE`;
  function capacityOf(sh) {
    const ci = sh && sh.capacityInput;
    if (ci && ci.mode === 'derived' && isNum(ci.callsPerDay) && isNum(ci.workingDays)) return ci.callsPerDay * ci.workingDays;
    return num(sh && sh.capacity);
  }
  function costMethodOf(sh) { return sh && sh.costPerCallMethod ? sh.costPerCallMethod : 'single-window'; }
  function costMethodLabel(F, m) {
    return optLabel(F, 'costPerCallMethod', m);
  }
  function methodLabel(F, m) { return F.METHODS[m] ? F.METHODS[m].label : txt(m); }
  function segLabel(F, id, g) { const f = F.SEGMENT_FIELDS.find(x => x.id === id); return f ? f.label(g) : id; }
  function fieldLabel(F, id, g) {
    const s = F.SEGMENT_FIELDS.find(x => x.id === id); if (s) return s.label(g);
    const m = mappingFields(F).find(x => x.id === id); if (m) return m.label;
    if (/^archetypeMix\./.test(id)) return `Curve archetype mix: ${id.split('.')[1]}`;
    return id;
  }
  function responseCurve(a, x) { return x <= 0 ? 0 : Math.pow(a.delta * x, a.gamma) / (Math.pow(x, a.gamma) + a.rho); }

  // prov (AI export, Assumptions sheet only): adds a Provenance column E
  function optionsBlock(S, c, prov) {
    S.line(['Standard method'], ST.SECTION);
    S.line(['Fixed settings of the standard method (not user inputs); a saved scenario that differs is flagged.'], ST.NOTE);
    const h = S.line(['Setting', 'Value', 'Standard', 'Differs from the standard method'], ST.HDR);
    if (prov) S.set(h, 4, 'Provenance', ST.HDR);
    standardRows(c).forEach(o => {
      const r = S.line([o.label, o.text, o.defText, o.changed ? { v: 'Yes: differs from the standard method', s: ST.LABEL } : 'No']);
      if (prov) S.set(r, 4, prov.option(optionPath(o.key), o.changed));
    });
  }

  const ENGINE_NOTE = 'Calculated by the sizing engine (entity-level selection)';
  const SPEC_LABEL = 'Specialty', DECILE_LABEL = 'Decile';
  /* v0.5 CS-1 revised: "enter two, derive the third". forecastMode absent = 'carryover+other' (fs-engine 1.7.0 behaviour). */
  const FORECAST_MODES = ['carryover+other', 'carryover+sf', 'other+sf'];
  const MODE_DERIVED = { 'carryover+other': 'sf', 'carryover+sf': 'other', 'other+sf': 'carryover' };
  const MODE_TEXT = { 'carryover+other': 'Carryover and other channels', 'carryover+sf': 'Carryover and Salesforce-impactable', 'other+sf': 'Other channels and Salesforce-impactable' };
  const forecastModeOf = v => (v && FORECAST_MODES.includes(v.forecastMode) ? v.forecastMode : 'carryover+other');
  const forecastModeText = (F, m) => (F.OPTION_LABELS && F.OPTION_LABELS.forecastMode && F.OPTION_LABELS.forecastMode[m]) || MODE_TEXT[m];
  const SF_LABEL = 'Salesforce-impactable %';
  /* v0.5.1 (CS-1 "the reference-workbook way"): Salesforce-impactable % is a check value; a v0.5 draft with a non-default forecastMode
     is shown read-only as an older draft (same wording as the UI). */
  const SF_CHECK_LABEL = 'Salesforce-impactable % (check)';
  const SF_CHECK_HELP = "Sizing uses carryover and other channels, as in the reference model. Salesforce-impactable is a check in the first year only: if it doesn't match the implied value, that year is flagged. Later years carry over from earlier cohorts and are not expected to add to 100%.";
  const LEGACY_MODE_LABEL = 'Saved with forecast inputs';
  const legacyModeText = (F, m) => `${forecastModeText(F, m)} (older draft)`;
  const isLegacyMode = v => forecastModeOf(v) !== 'carryover+other';
  const impliedLabel = F => (F.ASSUMPTION_LABELS && F.ASSUMPTION_LABELS.impliedSfPct) || 'Implied Salesforce-impactable %';
  const CHECK_TOL = 0.005;                                   // 0.5 percentage points (CS-1 check threshold)
  const shareLabel = k => (k === 'carryover' ? 'Carryover %' : k === 'other' ? 'Other channel %' : SF_LABEL);
  const RA_NOTE = 'calculated by the sizing engine (reallocation passes)';
  // decile label of a (specialty, decile) segment: the decile key, else the segment label with the "<specialty> · " prefix removed
  function decileOf(s) {
    if (!s) return '';
    if (s.decile !== undefined && s.decile !== null && String(s.decile) !== '') return s.decile;
    const lab = txt(s.segment), sp = s.specialty === undefined || s.specialty === null ? '' : String(s.specialty);
    return sp && lab.indexOf(sp + SPEC_SEP) === 0 ? lab.slice(sp.length + SPEC_SEP.length) : lab;
  }
  const specOfRow = s => (s && s.specialty !== undefined && s.specialty !== null ? txt(s.specialty) : '');

  /* fs-io 1.1.0 (FR-48, proposed): uptake presets. Reads only methodAssumptions.{curveParams, curveProvenance,
     customSourceNote}, the scenario's responseCurveConfig (else args.config) and result.curves. A snapshot in the 1.10.0
     shape (no provenance, reference archetype keys only; the engine's own legacy rule) adds nothing to the existing sheets,
     so an old draft exports as fs-io 1.0.0 apart from the Configuration sheet, which then reads "No configuration recorded"
     (D-RUN-09: the current configuration did not size it). Every label comes from FSFields. */
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const rcLabels = F => F.RESPONSE_CURVE_LABELS || {};
  const RC_ALL = F => (F.RESPONSE_CURVE_RESERVED && F.RESPONSE_CURVE_RESERVED.all) || 'ALL';
  const RC_CUSTOM = F => (F.RESPONSE_CURVE_RESERVED && F.RESPONSE_CURVE_RESERVED.custom) || 'custom';
  const rcArchName = (F, id) => (id === RC_ALL(F) && rcLabels(F).all ? rcLabels(F).all : txt(id));
  function rcConfigOf(scenario, args) {
    if (isObj(scenario && scenario.responseCurveConfig)) return scenario.responseCurveConfig;
    return isObj(args && args.config) ? args.config : null;
  }
  function presetLabelOf(cfg, id) {
    const p = cfg && Array.isArray(cfg.presets) ? cfg.presets.find(x => x && x.id === id) : null;
    return p && p.label !== undefined && p.label !== null && String(p.label) !== '' ? txt(p.label) : txt(id);
  }
  // { rows: [{ id, name, delta, gamma, rho, source, presetId, uptake }], note, anyCustom } or null for a 1.10.0-shaped input
  function curveRowsOf(c) {
    const { F, ma, res, method } = c;
    if (method !== 'response') return null;
    const cp = isObj(ma.curveParams) ? ma.curveParams : {};
    const keys = Object.keys(cp);
    if (!isObj(ma.curveProvenance) && keys.every(k => ARCH.includes(k))) return null;
    const L = rcLabels(F), SL = L.sourceLabel || {};
    const prov = isObj(ma.curveProvenance) ? ma.curveProvenance : {};
    const used = isObj(res && res.curves) ? res.curves : {};
    const EN = G('FSEngine');
    const eff = EN && EN.archetypesFor ? EN.archetypesFor(ma) : {};
    const rows = keys.map(id => {
      const pv = isObj(prov[id]) ? prov[id] : (isObj(used[id]) && used[id].source ? used[id] : null);
      const e = isObj(eff[id]) ? eff[id] : (isObj(cp[id]) ? cp[id] : {});
      const source = pv && (pv.source === 'preset' || pv.source === 'custom') ? pv.source : null;
      const presetId = source === 'preset' && pv.presetId !== undefined && pv.presetId !== null ? txt(pv.presetId) : '';
      const uptake = source === 'custom' ? txt(L.custom) : source === 'preset'
        ? (pv.label !== undefined && pv.label !== null && String(pv.label) !== '' ? txt(pv.label) : presetLabelOf(c.cfg, presetId)) : '';
      return { id, name: rcArchName(F, id), delta: num(e.delta), gamma: num(e.gamma), rho: num(e.rho), source, presetId, uptake,
        sourceText: source ? txt(SL[source]) : '' };
    });
    const note = typeof ma.customSourceNote === 'string' ? ma.customSourceNote.trim() : '';
    return { rows, note, anyCustom: rows.some(r => r.source === 'custom') };
  }
  /* FR-47 (proposed): the archetypes of a new-shape snapshot, in engine order: reference archetypes present first, then the
     others in first-seen order (segment archetypeMix keys and archetypes, entity archetypes, then curveParams keys).
     A 1.10.0-shaped snapshot keeps the fixed reference list, so its sheets stay exactly fs-io 1.0.0. */
  function archListOf(c) {
    if (!c.rcRows) return ARCH;
    const seen = [];
    const add = a => { if (a !== undefined && a !== null && String(a) !== '' && !seen.includes(String(a))) seen.push(String(a)); };
    (c.inp.segments || []).forEach(s => { if (!s) return; if (isObj(s.archetypeMix)) Object.keys(s.archetypeMix).forEach(add); add(s.archetype); });
    (Array.isArray(c.inp.entities) ? c.inp.entities : []).forEach(e => { if (e) add(e.archetype); });
    c.rcRows.rows.forEach(r => add(r.id));
    return ARCH.filter(a => seen.includes(a)).concat(seen.filter(a => !ARCH.includes(a)));
  }
  // F4: a segment's archetype mix; for new-shape value-only data (no mix, no archetype) with an 'ALL' curve it is 100% ALL,
  // as in the engine. Old-shape snapshots keep the 1.0.0 rule.
  function segMixOf(c, s) {
    const m = s.archetypeMix || (s.archetype ? { [s.archetype]: 100 } : null);
    if (m || !c.rcRows || !c.arch.includes(RC_ALL(c.F))) return m;
    return { [RC_ALL(c.F)]: 100 };
  }
  function assignmentBlock(c, S) {
    const R = c.rcRows;
    if (!R) return;
    const L = rcLabels(c.F), H = L.exportHeadings || {}, K = L.exportColumns || {};
    S.skip();
    S.line([txt(H.assignment)], ST.SECTION);
    S.line([K.archetype, K.uptake, K.delta, K.gamma, K.rho, K.sourceNote].map(txt), ST.HDR);
    R.rows.forEach(x => S.line([x.name, x.uptake, { v: x.delta, s: ST.NUM }, { v: x.gamma, s: ST.NUM }, { v: x.rho, s: ST.NUM },
      x.source === 'custom' ? R.note : '']));
  }
  function effectiveCurvesBlock(c, S) {
    const R = c.rcRows;
    if (!R) return;
    const L = rcLabels(c.F), H = L.exportHeadings || {}, K = L.exportColumns || {};
    S.skip();
    S.line([txt(H.effectiveCurves)], ST.SECTION);
    // P7 (P5-F5): parameter headings match the sheet's Archetype parameters table; a Custom row's Source names the
    // marketing-mix analysis instead of repeating the Custom uptake label (new-shape snapshots only; R is null otherwise).
    const CS = L.curveSheetColumns || {};
    const srcOf = x => (x.source === 'custom' && L.exportCustomSource ? txt(L.exportCustomSource) : x.sourceText);
    S.line([K.archetype, K.uptake, K.source, K.presetId, CS.delta || K.delta, CS.gamma || K.gamma, CS.rho || K.rho].map(txt), ST.HDR);
    R.rows.forEach(x => S.line([x.name, x.uptake, srcOf(x), x.presetId, { v: x.delta, s: ST.NUM }, { v: x.gamma, s: ST.NUM }, { v: x.rho, s: ST.NUM }]));
    if (R.anyCustom) S.line([txt(K.sourceNote), R.note]);
  }
  // New sheet (fs-io 1.1.0): the configuration snapshot a new-shape scenario was sized with (c.cfg is null for an old-shape one)
  function buildConfiguration(c) {
    const F = c.F, L = rcLabels(F), H = L.exportHeadings || {}, K = L.exportColumns || {};
    const S = new SheetB(txt((L.exportSheets || {}).configuration));
    const cfg = c.cfg;
    S.line([txt(L.configuratorTitle)], ST.TITLE);
    if (!cfg) { S.line([txt(L.noConfiguration)]); S.minW[0] = 24; return S; }
    const onOff = v => txt((L.flagState || {})[String(v === true)]);
    const never = txt(L.neverUpdated);
    S.skip();
    S.line([K.field, K.value].map(txt), ST.HDR);
    S.line([txt(L.configVersion), isNum(cfg.version) ? cfg.version : txt(cfg.version)]);
    S.line([txt(L.updatedBy), cfg.updatedBy ? txt(cfg.updatedBy) : never]);
    S.line([txt(L.updatedAt), cfg.updatedAt ? fmtTime(cfg.updatedAt) : never]);
    S.skip();
    S.line([txt(H.presets)], ST.SECTION);
    S.line([K.presetId, K.label, K.description, K.delta, K.gamma, K.rho, K.origin, K.pickerVisible].map(txt), ST.HDR);
    (Array.isArray(cfg.presets) ? cfg.presets : []).forEach(p => {
      if (!isObj(p)) return;
      S.line([txt(p.id), txt(p.label), txt(p.description), { v: num(p.delta), s: ST.NUM }, { v: num(p.gamma), s: ST.NUM }, { v: num(p.rho), s: ST.NUM },
        txt((L.origin || {})[p.origin] || p.origin), onOff(p.pickerVisible)]);
    });
    S.skip();
    S.line([txt(H.curveLibrary)], ST.SECTION);
    S.line([K.step, K.label, K.delta, K.gamma, K.rho].map(txt), ST.HDR);
    (Array.isArray(cfg.curveLibrary) ? cfg.curveLibrary : []).forEach((p, i) => {
      if (!isObj(p)) return;
      S.line([{ v: i + 1, s: ST.INT }, txt(p.label), { v: num(p.delta), s: ST.NUM }, { v: num(p.gamma), s: ST.NUM }, { v: num(p.rho), s: ST.NUM }]);
    });
    S.skip();
    S.line([txt(H.defaultAssignment)], ST.SECTION);
    S.line([K.archetype, K.uptake, K.presetId].map(txt), ST.HDR);
    const da = isObj(cfg.defaultAssignment) ? cfg.defaultAssignment : {};
    Object.keys(da).forEach(a => {
      const v = da[a];
      S.line([rcArchName(F, a), v === RC_CUSTOM(F) ? txt(L.custom) : presetLabelOf(cfg, v), txt(v)]);
    });
    S.skip();
    S.line([txt(H.flags)], ST.SECTION);
    S.line([K.flag, K.value].map(txt), ST.HDR);
    const fl = isObj(cfg.flags) ? cfg.flags : {};
    Object.keys(fl).forEach(k => S.line([txt((L.flagLabels || {})[k] || k), onOff(fl[k])]));
    S.minW[0] = 24; S.maxW[2] = 70;
    return S;
  }

  function buildAssumptions(c, scenario) {
    const { F, inp, method, g, ma, opts, sh } = c;
    const S = new SheetB(SHEETS.assumptions);
    const A = { segRows: [], segCols: {}, live: {} };
    const B = r => `$B$${r + 1}`;
    /* AI export only (c.prov set): a Provenance column after the last column of each input section. Adds cells to existing
       rows only, never rows, so every formula address is unchanged. */
    const PV = c.prov || null;
    const pv = (row, text, col) => { if (PV && row !== undefined && row !== null) S.set(row, col === undefined ? 3 : col, text); };
    const pvh = (row, col) => { if (PV) S.set(row, col === undefined ? 3 : col, 'Provenance', ST.HDR); };
    const OD = F.OPTION_DEFAULTS || {};
    S.line([`Assumptions: ${txt(scenario.name)}`], ST.TITLE);
    S.line(['Inputs used by the focus scenario. Cost per call, the value pool and every calculation on Detailed Calculations are live formulas built from these cells, so edits flow through on recalculation.'], ST.NOTE);
    S.skip();
    S.line(['Shared assumptions'], ST.SECTION);
    pvh(S.line(['Assumption', 'Value', 'Note'], ST.HDR));
    let r;
    const ci = sh.capacityInput;
    const K = capacityOf(sh);
    if (ci && ci.mode === 'derived') {
      const r1 = S.line(['Calls per day', { v: num(ci.callsPerDay), s: ST.NUM }]);
      const r2 = S.line(['Working days per year', { v: num(ci.workingDays), s: ST.NUM }]);
      r = S.line(['Effective annual capacity (calls per rep)', { v: K, s: ST.INT, f: `${B(r1)}*${B(r2)}` }, 'Calls per day × working days. Raw FTE = total calls ÷ capacity']);
      if (PV) { pv(r1, PV.input('shared.capacityInput.callsPerDay')); pv(r2, PV.input('shared.capacityInput.workingDays')); pv(r, PV.calc()); }
    } else {
      r = S.line(['Effective annual capacity (calls per rep)', { v: K, s: ST.INT }, 'Entered directly. Raw FTE = total calls ÷ capacity']);
      if (PV) pv(r, PV.input('shared.capacity'));
    }
    A.cap = S.ref(r, 1); const capL = B(r);
    const hasCost = isNum(sh.repCost);
    const W = sh.horizon && Number.isInteger(sh.horizon.windowYears) && sh.horizon.windowYears > 0 ? sh.horizon.windowYears : 3;
    const tail = sh.horizon && Number.isInteger(sh.horizon.tailYears) && sh.horizon.tailYears >= 0 ? sh.horizon.tailYears : 2;
    let rRep, rFs, rFc, rSs, rSc, rInf, rDisc;
    const infl = isNum(sh.inflationPct) ? sh.inflationPct / 100 : 0, dsc = isNum(sh.discountRatePct) ? sh.discountRatePct / 100 : 0;
    if (hasCost) {
      const rMode = S.line(['Cost mode', optLabel(F, 'costMode', sh.costMode || 'fullyLoaded')]);
      if (PV) pv(rMode, PV.option('shared.costMode', (sh.costMode || 'fullyLoaded') !== (OD.costMode || 'fullyLoaded')));
      rRep = S.line([sh.costMode === 'layers' ? 'Year-1 annual rep cost (rep only)' : 'Year-1 annual rep cost (fully loaded)', { v: sh.repCost, s: ST.INT }]);
      if (sh.costMode === 'layers' && sh.layers) {
        rFs = S.line(['First-line manager span (reps per manager)', { v: num(sh.layers.flmSpan), s: ST.NUM }]);
        rFc = S.line(['First-line manager annual cost', { v: num(sh.layers.flmCost), s: ST.INT }]);
        rSs = S.line(['Second-line manager span (first-line managers per manager)', { v: num(sh.layers.slmSpan), s: ST.NUM }]);
        rSc = S.line(['Second-line manager annual cost', { v: num(sh.layers.slmCost), s: ST.INT }]);
        A.flmSpan = S.ref(rFs, 1); A.slmSpan = S.ref(rSs, 1);
        if (PV) { pv(rFs, PV.input('shared.layers.flmSpan')); pv(rFc, PV.input('shared.layers.flmCost')); pv(rSs, PV.input('shared.layers.slmSpan')); pv(rSc, PV.input('shared.layers.slmCost')); }
      }
      rInf = S.line(['Cost inflation % per year', { v: infl, s: ST.PCT1 }]);
      rDisc = S.line(['Discount rate %', { v: dsc, s: ST.PCT1 }]);
      if (PV) { pv(rRep, PV.input('shared.repCost')); pv(rInf, PV.input('shared.inflationPct', !isNum(sh.inflationPct))); pv(rDisc, PV.input('shared.discountRatePct', !isNum(sh.discountRatePct))); }
    } else {
      pv(S.line(['Annual rep cost', 'Not entered', 'Cost is optional for Workload Buildup; field cost is not shown.']), PROV_TEXT.none);
    }
    // F8: the sizing horizon is a fixed "Standard method" setting (CS-5), recorded here because the build-ups use it
    const rW = S.line(['Sizing window (years)', { v: W, s: ST.INT }, stdNote(W, STD_WINDOW, method === 'workload' ? 'Cost averaging window: sets the structure of the cost build-up; changing it needs a new export' : 'Sets the structure of the cost and value build-ups; changing it needs a new export')]);
    const rT = S.line(['Carryover tail (years)', { v: tail, s: ST.INT }, stdNote(tail, STD_TAIL, 'Sets the structure of the value build-up; changing it needs a new export')]);
    if (PV) { pv(rW, PV.input('shared.horizon.windowYears')); pv(rT, PV.input('shared.horizon.tailYears')); }
    // ---- cost per call build-up (live) ----
    if (hasCost && isNum(c.totals.costPerCall)) {
      S.skip();
      S.line(['Cost per call build-up'], ST.SECTION);
      S.line(['Step', 'Value', 'Formula in words'], ST.HDR);
      const layers = sh.costMode === 'layers' && sh.layers;
      const loaded = layers ? sh.repCost + sh.layers.flmCost / sh.layers.flmSpan + sh.layers.slmCost / (sh.layers.flmSpan * sh.layers.slmSpan) : sh.repCost;
      const rL = S.line(['Loaded annual cost per rep (year 1)', { v: loaded, s: ST.INT,
        f: layers ? `${B(rRep)}+${B(rFc)}/${B(rFs)}+${B(rSc)}/(${B(rFs)}*${B(rSs)})` : `${B(rRep)}` },
        layers ? 'Rep cost + first-line manager cost ÷ span + second-line manager cost ÷ (both spans)' : 'Fully loaded rep cost']);
      const cm = costMethodOf(sh);
      const nYears = cm === 'rolling-windows' ? 2 * W - 1 : W;
      const cy = [], cyRow = [];
      for (let t = 0; t < nYears; t++) {
        const v = loaded * Math.pow(1 + infl, t) / K;
        cy.push(v);
        cyRow.push(S.line([`Cost per call, year ${t + 1}`, { v, s: ST.NUM, f: `${B(rL)}*(1+${B(rInf)})^${t}/${capL}` }, `Loaded cost × (1 + inflation)^${t} ÷ capacity`]));
      }
      const win = a => { let v = 0; for (let t = 0; t < W; t++) v += cy[a + t] / Math.pow(1 + dsc, t); return v / W; };
      const winF = a => '(' + Array.from({ length: W }, (_, t) => (t === 0 ? B(cyRow[a]) : `${B(cyRow[a + t])}/(1+${B(rDisc)})^${t}`)).join('+') + `)/${W}`;
      let rEff, eff;
      if (cm === 'rolling-windows') {
        const wr = [], wv = [];
        for (let a = 0; a < W; a++) { wv.push(win(a)); wr.push(S.line([`Discounted ${W}-year window starting year ${a + 1}`, { v: wv[a], s: ST.NUM, f: winF(a) }, 'Window costs discounted to its first year, averaged'])); }
        eff = wv.reduce((s2, x) => s2 + x, 0) / W;
        rEff = S.line(['Effective cost per call', { v: eff, s: ST.B_NUM, f: `(${wr.map(B).join('+')})/${W}` }, `${optLabel(F, 'costPerCallMethod', cm)}`]);
      } else {
        eff = win(0);
        rEff = S.line(['Effective cost per call', { v: eff, s: ST.B_NUM, f: winF(0) }, `${optLabel(F, 'costPerCallMethod', cm)}`]);
      }
      if (!close(eff, c.totals.costPerCall)) {                 // safety net: never disagree with the engine
        S.set(rEff, 1, c.totals.costPerCall, ST.ENG_NUM); S.set(rEff, 2, 'Calculated by the sizing engine (the build-up above did not reproduce it)', ST.NOTE);
      } else A.live.cpc = true;
      A.cpc = S.ref(rEff, 1);
    }
    S.skip();
    optionsBlock(S, c, PV);
    S.skip();
    S.line([`Method assumptions: ${methodLabel(F, method)}`], ST.SECTION);
    pvh(S.line(['Assumption', 'Value', 'Note'], ST.HDR));
    if (method === 'affordable' || method === 'response') {
      const rAl = S.line(['Value allocation', optLabel(F, 'allocation', opts.allocation)]);
      if (PV) pv(rAl, PV.option('methodAssumptions.allocation', opts.allocation !== (OD.allocation || 'proportional')));
      if (method === 'affordable') {
        r = S.line(['Total ROI cutoff', { v: opts.cutoff, s: ST.NUM }, 'Affordable calls = allocated value ÷ (cost per call × cutoff)']);
        A.cutoff = S.ref(r, 1);
        if (PV) pv(r, PV.input('methodAssumptions.totalRoiCutoff'));
      } else {
        // v0.5 (CS-5): ROI basis and stopping rule are Standard method rows; the normalization point stays (live curve formulas)
        r = S.line(['Marginal ROI cutoff', { v: opts.cutoff, s: ST.NUM }, opts.roiBasis === 'net' ? `Net ${opts.cutoff} equals gross ${opts.cutoff + 1}` : `Gross ${opts.cutoff} equals net ${Math.round((opts.cutoff - 1) * 1e6) / 1e6}`]);
        A.cutoff = S.ref(r, 1);
        if (PV) pv(r, PV.input('methodAssumptions.cutoff', !isNum(ma.cutoff)));
        // F12 / F-R2V5-01: a fixed standard-method value with a one-line explanation; a saved scenario that differs is flagged
        r = S.line(['Normalization point (calls)', { v: opts.scenarioMaxCalls, s: ST.INT }, stdNote(opts.scenarioMaxCalls, STD_XNORM, 'Response curves are scaled to 1 at this call count; it is not a cap on calls')]);
        A.xnorm = S.ref(r, 1); A.xnormRow = r;
        if (PV) pv(r, PV.input('methodAssumptions.scenarioMaxCalls', !isNum(ma.scenarioMaxCalls)));
      }
      // v0.5 (CS-5): reallocation is a main assumption for Affordable Coverage and Response Curve
      const rRa = S.line([REALLOC_LABEL, reallocText(F, ma.reallocateExcluded === true), ma.reallocateExcluded === true
        ? 'On: the value pool is re-shared over the segments still covered until no further segment drops out'
        : 'Off: value allocated to excluded segments is forfeited']);
      if (PV) pv(rRa, PV.option('methodAssumptions.reallocateExcluded', ma.reallocateExcluded === true));
      const v = ma.value || {};
      const chain = Array.isArray(v.years) && v.years.length > 0 && !isNum(v.annualValue);
      // Legacy calibration factor: written (and used by the pool formula) only when it is not 1 (CS-2).
      let calibL = null;
      if (c.showCalib) {
        r = S.line(['Calibration factor', { v: opts.calibrationFactor, s: ST.DEC }, 'Default 1.0; applied to the value pool']);
        A.calib = S.ref(r, 1); calibL = B(r);
        if (PV) pv(r, PV.input('methodAssumptions.value.calibrationFactor', !(v && isNum(v.calibrationFactor))));
      }
      const withCalib = f => (calibL ? `${f}*${calibL}` : f);
      const rVp = S.line(['Value input path', chain ? 'Forecast chain by year' : 'Annual impactable value entered directly']);
      if (PV) pv(rVp, PV.input('ui.valueMode'));
      let poolV = null, poolF = null;
      if (!chain && isNum(v.annualValue)) {
        const ra = S.line(['Annual impactable value (entered)', { v: v.annualValue, s: ST.INT }]);
        poolV = v.annualValue * opts.calibrationFactor; poolF = withCalib(`${B(ra)}`);
        if (PV) pv(ra, PV.input('methodAssumptions.value.annualValue'));
      } else if (chain) {
        const gm = isNum(v.grossMarginPct) ? v.grossMarginPct / 100 : 1;
        const rGm = S.line(['Gross margin %', { v: gm, s: ST.PCT1 }]);
        const rSy = S.line(['Sizing start year', isNum(v.sizingStartYear) ? v.sizingStartYear : 'Not entered', 'Selects which cohorts form the sizing window; changing it needs a new export']);
        if (PV) { pv(rGm, PV.input('methodAssumptions.value.grossMarginPct', !isNum(v.grossMarginPct))); pv(rSy, isNum(v.sizingStartYear) ? PV.input('methodAssumptions.value.sizingStartYear') : PROV_TEXT.none); }
        const conv = v.carryoverConvention === 'sourceYear' ? 'sourceYear' : 'receivingYear';
        let dRef, dV;
        if (isNum(v.discountRatePct)) { const rd = S.line(['Value discount rate %', { v: v.discountRatePct / 100, s: ST.PCT1 }]); dRef = B(rd); dV = v.discountRatePct / 100; pv(rd, PV && PV.input('methodAssumptions.value.discountRatePct')); }
        else if (rDisc !== undefined) { dRef = B(rDisc); dV = dsc; }
        else { const rd = S.line(['Value discount rate %', { v: 0, s: ST.PCT1 }]); dRef = B(rd); dV = 0; pv(rd, PROV_TEXT.def); }
        const ys = v.years.slice().sort((a, b) => a.year - b.year), n = ys.length;
        /* v0.5.1 CS-1 "the reference-workbook way" (fs-engine 1.9.1): the default chain is the reference workbook. Carryover % (rate),
           other channel % and Salesforce-impactable % are all inputs (Salesforce-impactable may be blank); sizing uses
           carryover and other channels, and Salesforce-impactable % is a check value only. Live columns: Other channel,
           Carryover from earlier cohorts, New = MAX(0, B - Other - CarryIn), Implied Salesforce-impactable % = New / B,
           Check (first year only, 2026-10-12 review; the Adds to column is removed) = IF(ABS(IF(entered blank, implied, entered) + other % + CarryIn / B - 1) > 0.005, ...).
           A v0.5 snapshot saved with a non-default forecastMode (dormant engine modes B/C) keeps the v0.5 layout, read-only
           and labelled as an older draft. The withdrawn v0.4 impactablePct multiplier is ignored (the engine warns). */
        const mode = forecastModeOf(v);
        const legacy = mode !== 'carryover+other';
        const der = MODE_DERIVED[mode];
        const effConv = mode === 'other+sf' ? 'receivingYear' : conv;   // the derived rate is defined on the receiving year
        if (legacy) {
          const rMode = S.line([LEGACY_MODE_LABEL, legacyModeText(F, mode), `${shareLabel(der)} is derived (read-only): Forecast = other channel + carryover from earlier cohorts + new Salesforce-impactable`]);
          if (PV) pv(rMode, PV.input('methodAssumptions.value.forecastMode', v.forecastMode === undefined));
        } else S.line([SF_CHECK_LABEL, SF_CHECK_HELP]);
        S.skip();
        S.line(['Impactable value build-up by year'], ST.SECTION);
        const hdrs = legacy
          ? ['Year', 'Forecast'].concat(['carryover', 'other', 'sf'].map(k => shareLabel(k) + (k === der ? ' (derived)' : '')), ['Other channel', 'Carryover from earlier cohorts', 'New field-impactable'])
          : ['Year', 'Forecast', 'Carryover %', 'Other channel %', SF_LABEL, 'Other channel', 'Carryover from earlier cohorts', 'New field-impactable', impliedLabel(F), 'Check (first year)'];
        const pvCol = legacy ? 8 : 10;
        pvh(S.line(hdrs, ST.HDR), pvCol);
        const entered = { carryover: ['carryoverPct', 'Carryover %'], other: ['otherChannelPct', 'Other channel %'], sf: ['sfPct', 'Salesforce-impactable %'] };
        if (PV) ys.forEach((y, i) => {
          const oi = v.years.indexOf(y);
          const keys = legacy ? ['carryover', 'other', 'sf'].filter(k => k !== der) : ['carryover', 'other'].concat(isNum(y.sfPct) ? ['sf'] : []);
          pv(S.r + i, PV.group([['forecast', 'Forecast']].concat(keys.map(k => entered[k])).map(([k, label]) => ({ label, text: PV.year(oi, k) }))), pvCol);
        });
        const yr = [];
        for (let i = 0; i < n; i++) yr.push(S.r + i);
        const mTop = S.r + n + 2;                            // cohort matrix starts after the year table, a blank row and its header
        const mCell = (i, j) => `${colName(1 + j)}${mTop + i + 1}`;
        const M = ys.map(() => new Array(n).fill(0)), sf = new Array(n).fill(0), cin = new Array(n).fill(0), rate = new Array(n).fill(0);
        const pct = x => (isNum(x) ? x / 100 : 0);
        for (let i = 0; i < n; i++) {
          const y = ys[i], Fv = isNum(y.forecast) ? y.forecast : 0, R = yr[i] + 1;
          let carry = 0; for (let s2 = 0; s2 < i; s2++) carry += M[s2][i];
          let other, oSh, sSh, cRate;
          if (mode === 'carryover+sf') {
            sf[i] = Fv * pct(y.sfPct); other = Fv - sf[i] - carry; cin[i] = carry;
            cRate = pct(y.carryoverPct); oSh = Fv === 0 ? 0 : other / Fv; sSh = pct(y.sfPct);
          } else if (mode === 'other+sf') {
            other = Fv * pct(y.otherChannelPct); sf[i] = Fv * pct(y.sfPct); cin[i] = Fv - other - sf[i];
            const prev = i === 0 ? 0 : sf[i - 1] + cin[i - 1];
            cRate = i === 0 || prev === 0 ? 0 : cin[i] / prev; oSh = pct(y.otherChannelPct); sSh = pct(y.sfPct);
          } else {
            other = Fv * pct(y.otherChannelPct); cin[i] = carry; sf[i] = Math.max(0, Fv - other - carry);
            cRate = pct(y.carryoverPct); oSh = pct(y.otherChannelPct); sSh = isNum(y.sfPct) ? y.sfPct / 100 : null;
          }
          rate[i] = cRate;
          M[i][i] = sf[i];
          S.set(yr[i], 0, y.year, ST.DEF); S.set(yr[i], 1, Fv, ST.INT);
          const carryF = i === 0 ? '0' : `SUM(${colName(1 + i)}${mTop + 1}:${colName(1 + i)}${mTop + i})`;
          if (mode === 'carryover+sf') {
            S.set(yr[i], 2, cRate, ST.PCT1); S.set(yr[i], 4, sSh, ST.PCT1);
            S.set(yr[i], 3, oSh, ST.PCT1, `IF(B${R}=0,0,F${R}/B${R})`);
            S.set(yr[i], 5, other, ST.INT, `B${R}-H${R}-G${R}`);
            S.set(yr[i], 6, carry, ST.INT, carryF);
            S.set(yr[i], 7, sf[i], ST.INT, `B${R}*E${R}`);
          } else if (mode === 'other+sf') {
            S.set(yr[i], 3, oSh, ST.PCT1); S.set(yr[i], 4, sSh, ST.PCT1);
            S.set(yr[i], 2, cRate, ST.PCT1, i === 0 ? '0' : `IF((H${R - 1}+G${R - 1})=0,0,G${R}/(H${R - 1}+G${R - 1}))`);
            S.set(yr[i], 5, other, ST.INT, `B${R}*D${R}`);
            S.set(yr[i], 6, cin[i], ST.INT, `B${R}-F${R}-H${R}`);
            S.set(yr[i], 7, sf[i], ST.INT, `B${R}*E${R}`);
          } else {
            // inputs C, D, E (E blank when no Salesforce-impactable % is entered); F to K are live formulas
            S.set(yr[i], 2, cRate, ST.PCT1); S.set(yr[i], 3, oSh, ST.PCT1); S.set(yr[i], 4, sSh, ST.PCT1);
            S.set(yr[i], 5, other, ST.INT, `B${R}*D${R}`);
            S.set(yr[i], 6, carry, ST.INT, carryF);
            S.set(yr[i], 7, sf[i], ST.INT, `MAX(0,B${R}-F${R}-G${R})`);
            const implied = Fv === 0 ? '' : sf[i] / Fv;
            S.set(yr[i], 8, implied, ST.PCT1, `IF(B${R}=0,"",H${R}/B${R})`);
            // 2026-10-12 review: the "Adds to" column is removed; only the first year must reconcile to 100% (later years carry over).
            if (i === 0) {
              const adds = Fv === 0 ? '' : (sSh === null ? implied : sSh) + oSh + carry / Fv;
              S.set(yr[i], 9, Fv === 0 ? '' : (Math.abs(adds - 1) > CHECK_TOL + 1e-11 ? 'Check' : 'OK'), ST.DEF, `IF(B${R}=0,"",IF(ABS(IF(E${R}="",I${R},E${R})+D${R}+G${R}/B${R}-1)>${CHECK_TOL}+1E-11,"Check","OK"))`);   // slack matches the engine's (R2 v0.5.1)
            } else S.set(yr[i], 9, 'n/a', ST.DEF);
          }
          // cohort i's later years (entered rates): receiving year reads the rate stored on year j; source year (legacy) on year j-1
          if (mode !== 'other+sf') for (let j = i + 1; j < n; j++) M[i][j] = M[i][j - 1] * pct(ys[effConv === 'sourceYear' ? j - 1 : j].carryoverPct);
        }
        // other+sf: the receiving-year rate of year j is derived from year j-1, so the matrix is filled once every rate is known
        if (mode === 'other+sf') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) M[i][j] = M[i][j - 1] * rate[j];
        S.r = yr[n - 1] + 2;
        S.line([`Cohort value by year (${effConv === 'sourceYear' ? 'carryover % read from the source year' : 'carryover % read from the receiving year'})`].concat(ys.map(y => y.year)), ST.HDR);
        for (let i = 0; i < n; i++) {
          const rr = S.r++;
          S.set(rr, 0, `Cohort ${ys[i].year}`, ST.LABEL);
          for (let j = i; j < n; j++) {
            const rateRow = yr[effConv === 'sourceYear' ? j - 1 : j];
            S.set(rr, 1 + j, M[i][j], ST.INT, j === i ? `H${yr[i] + 1}` : `${mCell(i, j - 1)}*C${rateRow + 1}`);
          }
        }
        S.skip();
        S.line(['Sizing year', `Cohort value incl. ${tail}-year carryover, discounted`], ST.HDR);
        const npvRows = []; let ok = isNum(v.sizingStartYear);
        const npvs = [];
        for (let k = 0; k < W && ok; k++) {
          const i = ys.findIndex(y => y.year === v.sizingStartYear + k);
          if (i < 0 || i + tail >= n) { ok = false; break; }
          let npv = sf[i]; const terms = [`H${yr[i] + 1}`];
          for (let t = 1; t <= tail; t++) { npv += M[i][i + t] / Math.pow(1 + dV, t); terms.push(`${mCell(i, i + t)}/(1+${dRef})^${t}`); }
          npvs.push(npv);
          npvRows.push(S.line([ys[i].year, { v: npv, s: ST.INT, f: terms.join('+') }]));
        }
        if (ok) {
          const annual = npvs.reduce((s2, x) => s2 + x, 0) * gm / W;
          const ra = S.line(['Annual impactable margin', { v: annual, s: ST.INT, f: `SUM(B${npvRows[0] + 1}:B${npvRows[npvRows.length - 1] + 1})*${B(rGm)}/${W}` }, 'Sum of cohort values × gross margin ÷ window']);
          poolV = annual * opts.calibrationFactor; poolF = withCalib(`${B(ra)}`);
        }
      }
      if (isNum(c.totals.valuePool)) {
        const live = poolF && close(poolV, c.totals.valuePool);
        r = S.line(['Value pool', live ? { v: c.totals.valuePool, s: ST.B_INT, f: poolF } : { v: c.totals.valuePool, s: ST.ENG_INT },
          live ? (chain ? `Annual impactable margin${calibL ? ' × calibration factor' : ''}` : `Annual impactable value${calibL ? ' × calibration factor' : ''}`) : 'Calculated by the sizing engine (the build-up did not reproduce it)']);
        if (PV) pv(r, PV.calc());
        A.pool = S.ref(r, 1); A.poolV = c.totals.valuePool; A.live.pool = !!live;
      }
    } else {
      pv(S.line(['Workload drivers', 'Per segment', 'Reach % and planned annual calls are on the segment rows below; capacity is above.']), 'See the segment rows below');
    }
    assignmentBlock(c, S);   // fs-io 1.1.0: uptake per archetype (nothing for a 1.10.0-shaped snapshot)
    S.skip();
    S.line(['Segment inputs'], ST.SECTION);
    // specialty / decile are display keys written by this exporter (CS-3), never as fields.js segment columns
    const flds = F.segmentFieldsFor(method, opts.allocation, inp.inputGrain || 'summary').filter(f => f.id !== 'specialty' && f.id !== 'decile');
    const cols = [];
    flds.forEach(f => {
      if (f.id === 'archetypeMix') c.mixArch.forEach(a => cols.push({ id: 'mix.' + a, label: `${a} %`, unit: 'mixpct' }));
      else if (f.id === 'segment' && c.spec) cols.push({ id: 'specialty', label: SPEC_LABEL, unit: 'text' }, { id: 'decile', label: DECILE_LABEL, unit: 'text' });
      else cols.push({ id: f.id, label: f.label(g), unit: f.unit });
    });
    if (method === 'response' && (inp.segments || []).some(sg => sg && sg.archetype)) cols.splice(c.spec ? 2 : 1, 0, { id: 'archetype', label: 'Curve archetype', unit: 'text' });
    pvh(S.line(cols.map(x => x.label), ST.HDR), cols.length);
    cols.forEach((x, i) => { A.segCols[x.id] = i; });
    A.segVals = inp.segments || [];
    (inp.segments || []).forEach((s, si) => {
      const row = cols.map(x => {
        if (x.unit === 'mixpct') { const m = s.archetypeMix && s.archetypeMix[x.id.slice(4)]; return { v: isNum(m) ? m / 100 : null, s: ST.PCT }; }
        const val = x.id === 'decile' ? decileOf(s) : s[x.id];
        if (x.id === 'segment' || x.unit === 'text') return txt(val);
        if (x.unit === 'percent') return { v: isNum(val) ? val / 100 : null, s: ST.PCT };
        return { v: num(val), s: ST.INT };
      });
      A.segRows.push({ segment: String(s.segment), row: S.line(row) });
      if (PV) {
        const pairs = cols.map(x => {
          const fid = x.unit === 'mixpct' ? 'archetypeMix' : x.id;
          return { label: x.unit === 'mixpct' ? segLabel(F, 'archetypeMix', g) : x.label, text: PV.seg(si, s, fid) };
        });
        pv(A.segRows[A.segRows.length - 1].row, PV.group(pairs), cols.length);
      }
    });
    if (A.segRows.length) { A.segFirst = A.segRows[0].row; A.segLast = A.segRows[A.segRows.length - 1].row; }
    A.sheet = S;
    return A;
  }

  /* FR-39, Response Curve with segment-summary input: within a segment every entity on the same curve archetype has the
     same value, so the engine's marginal ROI search yields one call count per (segment, archetype) group (trace step
     "Segment <s>, <archetype>"). Those selected calls are the only engine values; reached, calls, the normalized response
     (from the Response Curves parameters) and contribution become live formulas. Written only when every rebuilt group sum
     reproduces the engine's segment values; otherwise the grey engine cells stay as they are. Entity-level input keeps the
     grey cells (one search per entity row). */
  const SEARCH_NOTE = 'Calculated by the sizing engine (marginal ROI search)';
  function liveResponseGroups(c, A, S, curves, k) {
    const { F, res, g, ma } = c;
    const { segs, inSeg, C, L, hdrRow, first } = k;
    if (!curves || !curves.curveRows || (Array.isArray(c.inp.entities) && c.inp.entities.length)) return false;
    const P = curves.curveRows, X = c.opts.scenarioMaxCalls;
    const withValue = ma.reachAppliesTo === 'callsAndValue';
    const byStep = new Map((res.trace || []).map(t => [t.step, t.value]));
    const plan = segs.map((sg, i) => {
      const s = inSeg(i), mix = segMixOf(c, s);
      const ents = num(s.entities), reach = isNum(s.reachPct) ? s.reachPct / 100 : 0;
      const K = ents > 0 && isNum(sg.allocatedValue) ? sg.allocatedValue / ents : 0;
      const groups = [];
      c.arch.forEach(a => {
        const calls = byStep.get(`Segment ${sg.segment}, ${a}`);
        if (calls === undefined) return;
        const m = mix && isNum(mix[a]) ? mix[a] / 100 : 0;
        const n = ents * m, p = P[a] && P[a].p;
        const norm = p && calls > 0 ? responseCurve(p, calls) / responseCurve(p, X) : 0;
        groups.push({ a, m, n, calls, fromMix: !!s.archetypeMix, reached: calls > 0 ? n * reach : 0, totalCalls: calls * n * reach, norm, contrib: K * norm * n * (withValue ? reach : 1) });
      });
      return { groups, ok: groups.every(x => isNum(x.calls) && P[x.a]) && close(sum(groups.map(x => x.reached)), num(sg.reached)) && close(sum(groups.map(x => x.totalCalls)), num(sg.totalCalls)) && close(sum(groups.map(x => x.contrib)), num(sg.contribution)) };
    });
    if (!plan.every(x => x.ok)) return false;
    const cv = sheetRef(SHEETS.curves);
    const CL = k => colName(colIndex(k) + (c.spec ? 1 : 0));        // CS-3: Specialty + Decile replace the segment column
    const one = F.GRAIN[g].one, many = F.GRAIN[g].many;
    S.skip();
    S.line(['Calls chosen per curve archetype group'], ST.SECTION);
    S.line([`Within a segment every ${one} on the same curve archetype has the same value, so the marginal ROI test picks one call count per group. Only the selected calls (grey) come from the sizing engine's search; the other cells are live formulas from Assumptions and Response Curves.`], ST.NOTE);
    S.line((c.spec ? [SPEC_LABEL, DECILE_LABEL] : [segLabel(F, 'segment', g)]).concat(['Curve archetype', 'Share of segment', `${many.charAt(0).toUpperCase() + many.slice(1)} in group`, `Selected calls per ${one}: ${SEARCH_NOTE.charAt(0).toLowerCase() + SEARCH_NOTE.slice(1)}`,
      F.RESULT_LABELS.reached(g), F.RESULT_LABELS.totalCalls(g), 'Normalized response at selected calls', 'Contribution']), ST.HDR);
    plan.forEach((pl, i) => {
      const mr = first + i, rows = [];
      pl.groups.forEach(x => {
        const r = S.r, R = n => `${n}${r + 1}`, q = P[x.a].r + 1;
        const ak = A.segRows.findIndex(y => y.segment === String(segs[i].segment));
        const mixRef = x.fromMix && A.segCols['mix.' + x.a] !== undefined && ak >= 0 ? A.sheet.ref(A.segRows[ak].row, A.segCols['mix.' + x.a]) : null;
        S.line((c.spec ? [k.rowSpec(i), k.rowDec(i)] : [txt(segs[i].segment)]).concat([rcArchName(F, x.a), { v: x.m, s: ST.PCT, f: mixRef },
          { v: x.n, s: ST.NUM, f: `${L(mr, 'entities')}*${R(CL('C'))}` },
          { v: x.calls, s: ST.ENG_INT },
          { v: x.reached, s: ST.NUM, f: `IF(${R(CL('E'))}>0,${R(CL('D'))}*${L(mr, 'reach')},0)` },
          { v: x.totalCalls, s: ST.NUM, f: `${R(CL('E'))}*${R(CL('D'))}*${L(mr, 'reach')}` },
          { v: x.norm, s: ST.CURVE, f: `IF(${R(CL('E'))}=0,0,((${cv}!$B$${q}*${R(CL('E'))})^${cv}!$C$${q}/(${R(CL('E'))}^${cv}!$C$${q}+${cv}!$D$${q}))/${cv}!$E$${q})` },
          { v: x.contrib, s: ST.INT, f: `IF(${L(mr, 'entities')}>0,${L(mr, 'alloc')}/${L(mr, 'entities')},0)*${R(CL('D'))}*${R(CL('H'))}${withValue ? `*${L(mr, 'reach')}` : ''}` }]));
        rows.push(r + 1);
      });
      const rng = col => (rows.length ? `SUM(${col}${rows[0]}:${col}${rows[rows.length - 1]})` : '0');
      S.set(mr, C.reached, num(segs[i].reached), ST.NUM, rng(CL('F')));
      S.set(mr, C.final, num(segs[i].finalCallsPerEntity), ST.CURVE, rows.length ? `IF(${L(mr, 'reached')}>0,${rng(CL('G'))}/${L(mr, 'reached')},0)` : '0');
      S.set(mr, C.contrib, num(segs[i].contribution), ST.INT, rng(CL('I')));
    });
    S.set(hdrRow, C.reached, F.RESULT_LABELS.reached(g), ST.HDR);
    S.set(hdrRow, C.final, `${F.RESULT_LABELS.finalCallsPerEntity(g)} (average per reached)`, ST.HDR);
    S.set(hdrRow, C.contrib, 'Contribution', ST.HDR);
    S.set(hdrRow, C.binding, `Binding constraint: ${SEARCH_NOTE}`, ST.HDR);
    S.set(hdrRow, C.excl, `Exclusion reason: ${SEARCH_NOTE}`, ST.HDR);
    S.set(1, 0, 'One row per segment. Every calculated cell is a live formula built from Assumptions, Response Curves and the curve-group table below. Grey cells come from the sizing engine: the calls its marginal ROI search selects per group, the binding constraint and exclusion reason it reports, and the planning split.', ST.NOTE);
    c.responseLive = true;
    return true;
  }

  const money = v => (isNum(v) ? `${v < 0 ? '-' : ''}$${numText(Math.round(Math.abs(v)))}` : 'N/A');
  /* CS-2 block on Detailed Calculations (reallocation On only): setting, passes and value reallocated (engine), pool,
     covered and excluded value (live), and the segments dropped before each pass. Formulas are written only where they
     reproduce the engine value. */
  function reallocationBlock(c, A, S, K, k) {
    const { F, g } = c, T = c.totals, RA = c.realloc;
    const { segs, C, first, last } = k;
    const rng = key => `${colName(C[key])}${first + 1}:${colName(C[key])}${last + 1}`;
    const byPass = Array.isArray(RA.excludedByPass) ? RA.excludedByPass.map(x => (Array.isArray(x) ? x.map(txt) : [])) : [];
    const pool = isNum(T.poolValue) ? T.poolValue : num(T.valuePool);
    const covJs = sum(segs.map(sg => (isNum(sg.totalCalls) && sg.totalCalls > 0 && isNum(sg.allocatedValue) ? sg.allocatedValue : 0)));
    const covered = isNum(T.coveredValue) ? T.coveredValue : covJs;
    S.skip();
    S.line([REALLOC_LABEL], ST.SECTION);
    const nDrop = byPass.reduce((t, x) => t + x.length, 0);
    S.line([`Reallocation On: after ${num(RA.passes) || 0} reallocation pass${RA.passes === 1 ? '' : 'es'}, covered segments carry ${money(covered)} of ${money(pool)} impactable value.`], ST.NOTE);
    S.line(['Measure', 'Value', 'Formula'], ST.HDR);
    const row = (label, cell, note) => { const r = S.r++; S.set(r, 0, label, ST.LABEL); S.set(r, 1, cell.v, cell.s, cell.f || null); S.set(r, 2, cell.f ? 'Formula: ' + cell.f : note, ST.NOTE); return S.addr(r, 1); };
    row('Setting', { v: reallocText(F, true), s: ST.DEF }, `Main assumption: ${REALLOC_LABEL}`);
    K.reallocPasses = row('Reallocation passes', { v: num(RA.passes), s: ST.ENG_INT }, 'Calculated by the sizing engine: passes after the first run until no further segment drops out');
    K.reallocated = row(resultLabel(F, 'reallocatedValue', 'Value reallocated', g), { v: num(RA.reallocatedValue), s: ST.ENG_INT }, 'Calculated by the sizing engine: value moved from excluded segments to covered segments');
    const poolLive = A.pool && close(pool, A.poolV);
    K.poolValue = row(resultLabel(F, 'poolValue', 'Impactable value pool', g), poolLive ? { v: pool, s: ST.INT, f: A.pool } : { v: pool, s: ST.ENG_INT }, 'Calculated by the sizing engine');
    const covF = C.calls !== undefined && C.alloc !== undefined && segs.length ? `SUMIF(${rng('calls')},">0",${rng('alloc')})` : null;
    K.covered = row(resultLabel(F, 'coveredValue', 'Value in covered segments', g), covF && close(covJs, covered) ? { v: covered, s: ST.INT, f: covF } : { v: covered, s: ST.ENG_INT },
      'Calculated by the sizing engine');
    // rounded to cents: pool and covered value are large and nearly equal, so the raw difference is floating-point noise
    const xlRound2 = x => Math.sign(x) * Math.round(Math.abs(x) * 100) / 100;
    const exV = isNum(pool) && isNum(covered) ? xlRound2(pool - covered) : null;
    K.excludedValue = row('Value in excluded segments', { v: exV, s: ST.INT, f: isNum(exV) ? `ROUND(${K.poolValue}-${K.covered},2)` : null }, 'Not available');
    S.skip();
    // excludedByPass[k] = segments dropped before reallocation pass k + 1 (k = 0 includes segments that are not eligible)
    S.line(['Reallocation pass', 'Segments dropped before this pass', 'Number of segments'], ST.HDR);
    if (!nDrop) S.line(['No segment was excluded']);
    byPass.forEach((list, p) => { if (list.length) S.line([`Pass ${p + 1}`, list.join(', '), { v: list.length, s: ST.INT }]); });
  }
  /* CS-3: "By specialty" subtotals of the segment rows (live SUMIF over the Specialty column). */
  function specialtySubtotals(c, S, k) {
    const { F, g, method } = c;
    const { segs, C, first, last, rowSpec } = k;
    if (!segs.length) return;
    const order = [];
    segs.forEach((sg, i) => { const sp = rowSpec(i); if (!order.includes(sp)) order.push(sp); });
    const keys = [['entities', segLabel(F, 'entities', g), ST.INT], ['accessible', F.RESULT_LABELS.accessible(g), ST.NUM], ['alloc', 'Allocated value', ST.INT],
      ['reached', F.RESULT_LABELS.reached(g), ST.NUM], ['calls', F.RESULT_LABELS.totalCalls(g), ST.NUM], ['fte', F.RESULT_LABELS.rawFte(g), ST.FTE],
      ['contrib', method === 'affordable' ? 'Retained value' : 'Contribution', ST.INT]].filter(x => C[x[0]] !== undefined && !(method === 'workload' && x[0] === 'accessible'));
    const field = { entities: 'entities', accessible: 'accessible', alloc: 'allocatedValue', reached: 'reached', calls: 'totalCalls', fte: 'rawFte', contrib: 'contribution' };
    const rng = key => `$${colName(C[key])}$${first + 1}:$${colName(C[key])}$${last + 1}`;
    const specRng = rng('specialty');
    S.skip();
    S.line(['By specialty'], ST.SECTION);
    S.line(['Subtotals of the segment rows above by specialty. Totals are unchanged in definition; the value pool is allocated once across all specialty and decile rows.'], ST.NOTE);
    S.line([SPEC_LABEL].concat(keys.map(x => x[1])), ST.HDR);
    const top = S.r;
    order.forEach(sp => {
      const r = S.r++;
      S.set(r, 0, sp, ST.DEF);
      // a criterion from the cell reads * ? ~ as wildcards and a leading = < > as an operator; escape those names
      const crit = /[*?~]|^[=<>]/.test(sp) ? `"=${sp.replace(/[~*?]/g, '~$&').replace(/"/g, '""')}"` : `$A${r + 1}`;
      keys.forEach(([key, , st], j) => {
        const v = sum(segs.map((sg, i) => (rowSpec(i) === sp ? num(sg[field[key]]) : 0)));
        S.set(r, 1 + j, v, st, `SUMIF(${specRng},${crit},${rng(key)})`);
      });
    });
    const tr = S.r++;
    S.set(tr, 0, 'Total', ST.LABEL);
    keys.forEach(([key, , st], j) => {
      const L0 = colName(1 + j);
      S.set(tr, 1 + j, sum(segs.map(sg => num(sg[field[key]]))), st === ST.FTE ? ST.B_FTE : st === ST.NUM ? ST.B_NUM : ST.B_INT, `SUM(${L0}${top + 1}:${L0}${tr})`);
    });
  }

  function buildCalc(c, A, curves) {
    const { F, res, method, g } = c;
    const S = new SheetB(SHEETS.calc);
    const T = c.totals;
    const segs = res.segments || [];
    const inSegs = c.inp.segments || [];
    const aref = (i, id) => {
      const seg = segs[i];
      let k = A.segRows.findIndex(x => x.segment === String(seg.segment));
      if (k < 0) k = i;
      const ci = A.segCols[id];
      if (ci === undefined || !A.segRows[k]) return null;
      return A.sheet.ref(A.segRows[k].row, ci);
    };
    const inSeg = i => inSegs.find(s => String(s.segment) === String(segs[i].segment)) || inSegs[i] || {};
    S.line([`Detailed Calculations: ${methodLabel(F, method)}`], ST.TITLE);
    S.line([method === 'response'
      ? `One row per segment. All cells are live formulas except the grey cells: ${ENGINE_NOTE.charAt(0).toLowerCase() + ENGINE_NOTE.slice(1)}, which a row formula cannot express (see Formula Documentation).`
      : 'One row per segment. Every calculated cell is a live formula built from Assumptions; grey cells are planning aids calculated by the sizing engine.'], ST.NOTE);
    S.skip();
    const hdrRow = S.r;
    // column specs: {h, s, val(i,r,cols)->{v,f}}
    const cols = [];
    const C = {};
    const add = (key, h, s, fn) => { C[key] = cols.length; cols.push({ key, h, s, fn }); };
    const L = (r, key) => colName(C[key]) + (r + 1);
    const refOr = (i, id, cached) => { const rf = aref(i, id); return rf ? { v: cached, f: rf } : { v: cached }; };
    // CS-3: Specialty and Decile columns replace the segment label when any row has a specialty.
    const rowSpec = i => specOfRow(segs[i]) || specOfRow(inSeg(i));
    const rowDec = i => txt(segs[i].decile !== undefined && segs[i].decile !== null && String(segs[i].decile) !== '' ? segs[i].decile
      : decileOf(Object.assign({}, inSeg(i), { segment: segs[i].segment, specialty: rowSpec(i) })));
    if (c.spec) {
      add('specialty', SPEC_LABEL, ST.DEF, i => ({ v: rowSpec(i) }));
      add('decile', DECILE_LABEL, ST.DEF, i => ({ v: rowDec(i) }));
    } else add('segment', segLabel(F, 'segment', g), ST.DEF, i => ({ v: txt(segs[i].segment) }));
    add('entities', segLabel(F, 'entities', g), ST.INT, i => refOr(i, 'entities', num(segs[i].entities)));
    add('reach', 'Reach %', ST.PCT, i => refOr(i, 'reachPct', isNum(inSeg(i).reachPct) ? inSeg(i).reachPct / 100 : null));
    const cpc = A.cpc, cut = A.cutoff, cap = A.cap;
    /* CS-2 reallocation On: the final-pass covered flag (1/0) is a fixed engine value; the pool is shared over the covered
       set by live formulas (SUMIF / COUNTIFS over the flag). Needs the Assumptions segment rows in the same order. */
    const RA = c.realloc;
    const raOn = !!RA;                                          // c.realloc is set only when reallocation is On
    const dataRow0 = hdrRow + 1;
    const sameOrder = A.segRows.length === segs.length && segs.every((sg, i) => A.segRows[i].segment === String(sg.segment));
    const coveredOf = i => (segs[i].excluded ? 0 : 1);
    const dropped = i => raOn && coveredOf(i) === 0;
    if (raOn) {
      add('covered', `Covered in final pass (1 = yes): ${RA_NOTE}`, ST.ENG_INT, i => ({ v: coveredOf(i) }));
      // excludedInPass = k means dropped before reallocation pass k + 1 (the numbering of the pass table below)
      add('pass', `Dropped before reallocation pass: ${RA_NOTE}`, ST.ENG_INT, i => ({ v: Number.isInteger(segs[i].excludedInPass) && segs[i].excluded ? segs[i].excludedInPass + 1 : null }));
    }
    const flagR = raOn ? `$${colName(C.covered)}$${dataRow0 + 1}:$${colName(C.covered)}$${dataRow0 + segs.length}` : null;
    const flagC = i => `${colName(C.covered)}${dataRow0 + i + 1}`;
    // Allocated value = pool × share as a live formula when it reproduces the engine value; else an engine constant.
    const segIdx = i => { const k = A.segRows.findIndex(x => x.segment === String(segs[i].segment)); return k < 0 ? i : k; };
    const aCell = (id, k) => (A.segCols[id] === undefined || !A.segRows[k] ? null : A.sheet.ref(A.segRows[k].row, A.segCols[id]));
    const aRange = id => `${sheetRef(A.sheet.name)}!$${colName(A.segCols[id])}$${A.segFirst + 1}:$${colName(A.segCols[id])}$${A.segLast + 1}`;
    const allocCells = segs.map((sg, i) => {
      const cached = num(sg.allocatedValue);
      if (!A.pool || cached === null || method === 'workload') return { v: cached };
      const k = segIdx(i), sv = A.segVals[k] || {}, alloc = c.opts.allocation;
      let jsV = null, f = null;
      if (raOn) {
        if (!sameOrder) return { v: cached };
        const cov = coveredOf(i);
        const covSum = key => sum(A.segVals.map((x, j) => (coveredOf(j) && isNum(x[key]) ? x[key] : 0)));
        if (alloc === 'proportional' && A.segCols.compositeValue !== undefined && isNum(sv.compositeValue)) {
          const tot = covSum('compositeValue');
          jsV = cov && tot > 0 ? A.poolV * sv.compositeValue / tot : 0;
          const S1 = `SUMIF(${flagR},1,${aRange('compositeValue')})`;
          f = `IF(${flagC(i)}=1,IF(${S1}>0,${A.pool}*${aCell('compositeValue', k)}/${S1},0),0)`;
        }
        return f && close(jsV, cached) ? { v: cached, f } : { v: cached };
      }
      if (alloc === 'proportional' && A.segCols.compositeValue !== undefined && isNum(sv.compositeValue)) {
        const tot = sum(A.segVals.map(x => x.compositeValue));
        jsV = tot > 0 ? A.poolV * sv.compositeValue / tot : 0;
        f = `IF(SUM(${aRange('compositeValue')})>0,${A.pool}*${aCell('compositeValue', k)}/SUM(${aRange('compositeValue')}),0)`;
      }   // proportional is the only allocation since 2026-10-12 (equal and user-entered retired)
      return f && close(jsV, cached) ? { v: cached, f } : { v: cached };
    });
    const allocLive = allocCells.some(x => x.f);
    const allocHdr = allocLive ? (raOn ? 'Allocated value (pool × share of the covered segments)' : 'Allocated value (pool × share)') : 'Allocated value (calculated by the sizing engine)';
    const q = t => `"${String(t).replace(/"/g, '""')}"`;
    if (method === 'affordable') {
      add('accessible', F.RESULT_LABELS.accessible(g), ST.NUM, (i, r) => ({ v: num(segs[i].accessible), f: `${L(r, 'entities')}*${L(r, 'reach')}` }));
      add('alloc', allocHdr, ST.INT, i => allocCells[i]);
      add('affCalls', 'Affordable calls', ST.NUM, (i, r) => ({ v: num(segs[i].affordableCalls), f: cpc && cut ? `${L(r, 'alloc')}/(${cpc}*${cut})` : null }));
      add('affPer', F.RESULT_LABELS.affordableCallsPerEntity(g), ST.NUM, (i, r) => ({ v: num(segs[i].affordableCallsPerEntity), f: `IF(${L(r, 'accessible')}>0,${L(r, 'affCalls')}/${L(r, 'accessible')},0)` }));
      add('max', segLabel(F, 'maxCalls', g), ST.INT, i => refOr(i, 'maxCalls', num(inSeg(i).maxCalls)));
      add('min', segLabel(F, 'minCalls', g), ST.INT, i => refOr(i, 'minCalls', num(inSeg(i).minCalls)));
      add('final', F.RESULT_LABELS.finalCallsPerEntity(g), ST.INT, (i, r) => ({ v: num(segs[i].finalCallsPerEntity),
        f: `IF(${L(r, 'accessible')}>0,IF(MIN(${L(r, 'affPer')},${L(r, 'max')})${c.ma.minimumBoundary === 'strict' ? '>' : '>='}${L(r, 'min')},ROUNDDOWN(MIN(${L(r, 'affPer')},${L(r, 'max')}),0),0),0)` }));
      add('reached', F.RESULT_LABELS.reached(g), ST.NUM, (i, r) => ({ v: num(segs[i].reached), f: `IF(${L(r, 'final')}>0,${L(r, 'accessible')},0)` }));
    } else if (method === 'response') {
      add('accessible', F.RESULT_LABELS.accessible(g), ST.NUM, (i, r) => ({ v: num(segs[i].accessible), f: `${L(r, 'entities')}*${L(r, 'reach')}` }));
      add('alloc', allocHdr, ST.INT, i => allocCells[i]);
      add('max', segLabel(F, 'maxCalls', g), ST.INT, i => refOr(i, 'maxCalls', num(inSeg(i).maxCalls)));
      add('min', segLabel(F, 'minCalls', g), ST.INT, i => refOr(i, 'minCalls', num(inSeg(i).minCalls)));
      add('reached', `${F.RESULT_LABELS.reached(g)}: ${ENGINE_NOTE}`, ST.ENG_NUM, i => ({ v: num(segs[i].reached) }));
      add('final', `${F.RESULT_LABELS.finalCallsPerEntity(g)} (average per reached): ${ENGINE_NOTE}`, ST.ENG_CURVE, i => ({ v: num(segs[i].finalCallsPerEntity) }));
    } else {
      add('reached', F.RESULT_LABELS.reached(g), ST.NUM, (i, r) => ({ v: num(segs[i].reached), f: `${L(r, 'entities')}*${L(r, 'reach')}` }));
      add('final', segLabel(F, 'plannedCalls', g), ST.INT, i => refOr(i, 'plannedCalls', num(segs[i].finalCallsPerEntity)));
    }
    add('calls', F.RESULT_LABELS.totalCalls(g), ST.NUM, (i, r) => ({ v: num(segs[i].totalCalls), f: `${L(r, 'reached')}*${L(r, 'final')}` }));
    add('fte', F.RESULT_LABELS.rawFte(g), ST.FTE, (i, r) => ({ v: num(segs[i].rawFte), f: cap ? `${L(r, 'calls')}/${cap}` : null }));
    add('plan', `${F.RESULT_LABELS.planningAllocation(g)}: calculated by the sizing engine (largest-remainder split)`, ST.ENG_INT, i => ({ v: num((res.planningAllocation || [])[i]) }));
    if (method !== 'workload') {
      if (method === 'affordable') add('contrib', 'Retained value', ST.INT, (i, r) => ({ v: num(segs[i].contribution), f: `IF(${L(r, 'final')}>0,${L(r, 'alloc')},0)` }));
      else add('contrib', `Contribution: ${ENGINE_NOTE}`, ST.ENG_INT, i => ({ v: num(segs[i].contribution) }));
      const net = method === 'response' && c.opts.roiBasis === 'net';
      add('roi', method === 'response' && net ? 'ROI (net)' : F.RESULT_LABELS.roi(g), ST.NUM, (i, r) => {
        const cached = isNum(segs[i].roi) ? segs[i].roi : '';
        const numer = method === 'affordable' ? L(r, 'alloc') : L(r, 'contrib');
        return { v: cached, f: cpc ? `IF(${L(r, 'calls')}>0,${numer}/(${L(r, 'calls')}*${cpc})${net ? '-1' : ''},"")` : null };
      });
      if (method === 'affordable') add('binding', 'Binding constraint', ST.DEF, (i, r) => (dropped(i) ? { v: bindingLabel(F, segs[i].binding), s: ST.ENG_TXT } : { v: bindingLabel(F, segs[i].binding),
        f: `IF(${L(r, 'final')}=0,IF(OR(${L(r, 'accessible')}<=0,${L(r, 'alloc')}<=0),${q(bindingLabel(F, 'none'))},${q(bindingLabel(F, 'min'))}),IF(${L(r, 'affPer')}>=${L(r, 'max')},${q(bindingLabel(F, 'max'))},${q(bindingLabel(F, 'affordability'))}))` }));
      else add('binding', `Binding constraint: ${ENGINE_NOTE}`, ST.ENG_TXT, i => ({ v: bindingLabel(F, segs[i].binding) }));
    }
    const exclV = i => (segs[i].excluded ? exclusionLabel(F, segs[i].exclusionReason, method, exclCtx(c)) : '');
    // reallocation On: a segment dropped in an earlier pass keeps that pass's reason, which the final-pass row cannot
    // re-derive, so its binding constraint and exclusion reason are fixed engine values (grey)
    if (method === 'affordable') add('excl', 'Exclusion reason', ST.DEF, (i, r) => (dropped(i) ? { v: exclV(i), s: ST.ENG_TXT } : { v: exclV(i),
      f: `IF(${L(r, 'final')}>0,"",IF(${L(r, 'accessible')}<=0,${q(exclusionLabel(F, 'no-reach', method, exclCtx(c)))},IF(${L(r, 'alloc')}<=0,${q(exclusionLabel(F, 'no-value', method, exclCtx(c)))},${q(exclusionLabel(F, 'below-minimum', method, exclCtx(c)))})))` }));
    else if (method === 'workload') add('excl', 'Exclusion reason', ST.DEF, (i, r) => ({ v: exclV(i),
      f: `IF(${L(r, 'calls')}=0,IF(${L(r, 'reached')}=0,${q(exclusionLabel(F, 'no-reach', method, exclCtx(c)))},${q(exclusionLabel(F, 'no-planned-calls', method, exclCtx(c)))}),"")` }));
    else add('excl', `Exclusion reason: ${ENGINE_NOTE}`, ST.ENG_TXT, i => ({ v: exclV(i) }));
    S.line(cols.map(x => x.h), ST.HDR);
    S.freeze = hdrRow + 1;
    const first = S.r;
    segs.forEach((seg, i) => {
      const r = S.r++;
      cols.forEach((col, ci) => {
        const cell = col.fn(i, r);
        const st = cell.s !== undefined ? cell.s : col.s;
        if (cell.f) S.set(r, ci, cell.v, st, cell.f);
        else S.set(r, ci, cell.v, st);
      });
    });
    const last = S.r - 1;
    const tr = S.r++;
    const R = {};
    const sumCol = (key, cached, style) => {
      if (C[key] === undefined) return;
      const L0 = colName(C[key]);
      const f = segs.length ? `SUM(${L0}${first + 1}:${L0}${last + 1})` : null;
      S.set(tr, C[key], cached, style, f);
      R[key] = `${L0}${tr + 1}`;
    };
    S.set(tr, 0, 'Total', ST.LABEL);
    sumCol('entities', num(T.entities), ST.B_INT);
    sumCol('accessible', num(T.accessible), ST.B_NUM);
    sumCol('alloc', sum(segs.map(s => s.allocatedValue)), ST.B_INT);
    sumCol('affCalls', sum(segs.map(s => s.affordableCalls)), ST.B_NUM);
    sumCol('reached', num(T.reached), ST.B_NUM);
    sumCol('calls', num(T.totalCalls), ST.B_NUM);
    sumCol('fte', num(T.rawFte), ST.B_FTE);
    sumCol('plan', sum(res.planningAllocation || []), ST.B_INT);
    sumCol('contrib', method === 'workload' ? null : sum(segs.map(s => s.contribution)), ST.B_INT);
    S.skip();
    S.line(['Totals and KPIs'], ST.SECTION);
    S.line(['Measure', 'Value', 'Formula'], ST.HDR);
    const kpi = (label, v, f, s) => { const r = S.r++; S.set(r, 0, label, ST.LABEL); S.set(r, 1, v, s, f); S.set(r, 2, f ? 'Formula: ' + f : (v === 'N/A' ? 'Not applicable' : 'Calculated by the sizing engine'), ST.NOTE); return S.addr(r, 1); };
    const K = {};
    const cRaw = kpi(F.RESULT_LABELS.rawFte(g), num(T.rawFte), R.fte, ST.FTE);
    const rounding = c.sh.fteRounding || 'nearest';
    const recF = rounding === 'up' ? `MAX(0,ROUNDUP(${R.fte}-1E-9,0))` : rounding === 'none' ? `${R.fte}` : `ROUND(${R.fte},0)`;
    const cRec = kpi(F.RESULT_LABELS.recommendedFte(g), num(T.recommendedFte), recF, rounding === 'none' ? ST.B_FTE : ST.B_INT);
    kpi('Rounding delta (recommended − raw)', num(T.roundingDelta), `${cRec}-${cRaw}`, ST.FTE);
    K.avg = kpi(F.RESULT_LABELS.avgCallsPerReached(g), isNum(T.avgCallsPerReached) ? T.avgCallsPerReached : '', `IF(${R.reached}>0,${R.calls}/${R.reached},"")`, ST.NUM);
    K.perRep = kpi(TPR_LABEL, isNum(T.entitiesPerRep) ? T.entitiesPerRep : '', `IF(${cRec}>0,${R.reached}/${cRec},"")`, ST.NUM);
    let cCost = null;
    if (cpc) cCost = K.cost = kpi(F.RESULT_LABELS.fieldCost(g), num(T.fieldCost), `${R.calls}*${cpc}`, ST.INT);
    if (method === 'workload') kpi(F.RESULT_LABELS.roi(g), 'N/A', null, ST.DEF);
    else if (cCost) {
      const net = method === 'response' && c.opts.roiBasis === 'net';
      K.roi = kpi(method === 'response' && net ? 'ROI (net)' : F.RESULT_LABELS.roi(g), isNum(T.roi) ? T.roi : 'N/A',
        `IF(${cCost}>0,${R.contrib}/${cCost}${net ? '-1' : ''},"N/A")`, ST.NUM);
      if (net) K.roiGross = kpi('ROI (gross ratio)', isNum(T.roiGross) ? T.roiGross : 'N/A', `IF(${cCost}>0,${R.contrib}/${cCost},"N/A")`, ST.NUM);
    } else kpi(F.RESULT_LABELS.roi(g), isNum(T.roi) ? T.roi : 'N/A', null, ST.NUM);
    if (method === 'affordable' && isNum(T.forfeitedValue)) K.forfeited = kpi('Value forfeited in excluded segments', T.forfeitedValue, raOn && A.pool ? `ROUND(${A.pool}-${R.contrib},2)` : `${R.alloc}-${R.contrib}`, ST.INT);
    if (T.layers && A.flmSpan) {
      K.flm = kpi('First-line managers (from span)', num(T.layers.firstLineManagers), `${cRaw}/${A.flmSpan}`, ST.NUM);
      K.slm = kpi('Second-line managers (from span)', num(T.layers.secondLineManagers), `${K.flm}/${A.slmSpan}`, ST.NUM);
    }
    if (RA) reallocationBlock(c, A, S, K, { segs, C, first, last });
    if (c.spec) specialtySubtotals(c, S, { segs, C, first, last, rowSpec });
    if (method === 'response') liveResponseGroups(c, A, S, curves, { segs, inSeg, C, L, hdrRow, first, rowSpec, rowDec });
    S.maxW[0] = 28;
    const abs = a => (a ? `${sheetRef(S.name)}!$${a.replace(/\d+$/, '')}$${a.replace(/^[A-Z]+/, '')}` : null);
    const refs = { raw: abs(cRaw), rec: abs(cRec) };
    ['entities', 'accessible', 'reached', 'calls'].forEach(k => { refs[k] = abs(R[k]); });
    Object.keys(K).forEach(k => { refs[k] = abs(K[k]); });
    return { sheet: S, rawRef: refs.raw, recRef: refs.rec, refs };
  }

  function buildSummary(c, scenario, project, calc) {
    const { F, method, g, opts, sh, totals: T, res } = c;
    const S = new SheetB(SHEETS.summary);
    S.line(['Field Sizing: Scenario Summary'], ST.TITLE);
    S.line([txt(project.name)], ST.NOTE);
    S.skip();
    const kv = (k, v, s) => S.line([{ v: k, s: ST.LABEL }, v === null || v === undefined ? '' : (typeof v === 'object' && v && 'v' in v ? v : { v, s: s || ST.DEF })]);
    S.line(['Project'], ST.SECTION);
    kv('Project', txt(project.name)); kv('Client', txt(project.client)); kv('Brand', txt(project.brand));
    if (project.planningPeriod) kv('Planning period', `${txt(project.planningPeriod.start)} to ${txt(project.planningPeriod.end)}`);
    kv('Entity grain', F.GRAIN[g].many);
    S.skip();
    S.line(['Focus scenario'], ST.SECTION);
    kv('Scenario', txt(scenario.name)); kv('Version', txt(scenario.version));
    kv('Status', STATUS[scenario.status] || txt(scenario.status));
    kv('Marked as recommended', scenario.recommended ? 'Yes' : 'No');
    if (scenario.recommendationNote) kv('Recommendation note', txt(scenario.recommendationNote));
    if (scenario.objective) kv('Objective', txt(scenario.objective));
    if (scenario.recommendedBy) kv('Recommended by', `${txt(scenario.recommendedBy)}${scenario.recommendedRole ? ` (${roleLabel(F, scenario.recommendedRole)})` : ''}`);
    if (scenario.submittedBy) { kv('Submitted by', txt(scenario.submittedBy)); kv('Submitted at', fmtTime(scenario.submittedAt)); }
    if (scenario.reviewedBy) { kv('Reviewed by', txt(scenario.reviewedBy)); kv('Reviewed at', fmtTime(scenario.reviewedAt)); }
    if (scenario.reviewComment) kv('Review comment', txt(scenario.reviewComment));
    kv('Approved by', txt(scenario.approvedBy) || 'Not approved'); kv('Approved at', fmtTime(scenario.approvedAt));
    kv('Created by', txt(scenario.createdBy)); kv('Created at', fmtTime(scenario.createdAt));
    kv('Exported at', fmtTime(c.exportedAt));
    S.skip();
    S.line(['Method and main assumptions'], ST.SECTION);
    kv('Method', methodLabel(F, method));
    if (F.METHODS[method]) kv('Question answered', F.METHODS[method].question);
    kv('Effective annual capacity (calls per rep)', { v: capacityOf(sh), s: ST.INT, f: (c.A || {}).cap });
    if (isNum(sh.repCost)) {
      kv('Cost mode', F.OPTION_LABELS.costMode[sh.costMode] || txt(sh.costMode));
    }
    const vIn = c.ma.value || {};
    if (method !== 'workload') {
      kv('Value input path', Array.isArray(vIn.years) && vIn.years.length ? 'Forecast chain by year' : 'Annual impactable value entered directly');
      if (Array.isArray(vIn.years) && vIn.years.length) {
        if (isLegacyMode(vIn)) kv(LEGACY_MODE_LABEL, legacyModeText(F, forecastModeOf(vIn)));
        else if (!isNum(vIn.annualValue)) kv(SF_CHECK_LABEL, SF_CHECK_HELP);   // the forecast chain is used (not a direct annual value)
        kv('Sizing start year', isNum(vIn.sizingStartYear) ? vIn.sizingStartYear : 'Not entered');
      }
    }
    if (method === 'affordable' || method === 'response') kv('Value allocation', F.OPTION_LABELS.allocation[opts.allocation] || opts.allocation);
    if (method === 'affordable') kv('Total ROI cutoff', opts.cutoff, ST.NUM);
    if (method === 'response') {
      kv('Marginal ROI cutoff', opts.cutoff, ST.NUM);
      const rX = kv('Normalization point (calls)', opts.scenarioMaxCalls, ST.INT);
      S.set(rX, 2, stdNote(opts.scenarioMaxCalls, STD_XNORM, 'Response curves are scaled to 1 at this call count'), xnormDiffers(opts) ? ST.LABEL : ST.NOTE);
    }
    if (c.showRealloc) kv(REALLOC_LABEL, reallocText(F, c.ma.reallocateExcluded === true));
    if (c.showCalib) kv('Calibration factor', opts.calibrationFactor, ST.DEC);
    S.skip();
    optionsBlock(S, c);
    S.skip();
    S.line(['Results'], ST.SECTION);
    const R = calc.refs, A = c.A || {};
    const live = (label, v, ref, st) => kv(label, isNum(v) || typeof v === 'string' ? (ref ? { v, s: st, f: ref } : { v, s: st }) : 'N/A');
    live(F.RESULT_LABELS.rawFte(g), num(T.rawFte), R.raw, ST.FTE);
    live(F.RESULT_LABELS.recommendedFte(g), num(T.recommendedFte), R.rec, sh.fteRounding === 'none' ? ST.B_FTE : ST.B_INT);
    live(`Number of ${F.GRAIN[g].many}`, num(T.entities), R.entities, ST.INT);
    if (method !== 'workload') live(F.RESULT_LABELS.accessible(g), num(T.accessible), R.accessible, ST.NUM);
    live(F.RESULT_LABELS.reached(g), num(T.reached), R.reached, ST.NUM);
    live(F.RESULT_LABELS.totalCalls(g), num(T.totalCalls), R.calls, ST.NUM);
    live(F.RESULT_LABELS.avgCallsPerReached(g), num(T.avgCallsPerReached), R.avg, ST.NUM);
    S.set(live(TPR_LABEL, num(T.entitiesPerRep), R.perRep, ST.NUM), 2, tprNote(F, g), ST.NOTE);
    if (isNum(T.costPerCall)) live('Effective cost per call', T.costPerCall, A.cpc, ST.NUM);
    if (isNum(T.fieldCost)) live(F.RESULT_LABELS.fieldCost(g), T.fieldCost, R.cost, ST.INT);
    if (method === 'workload') kv(F.RESULT_LABELS.roi(g), 'N/A');
    else live(roiLabel(F, g, opts), isNum(T.roi) ? T.roi : null, R.roi, ST.NUM);
    if (method === 'response' && opts.roiBasis === 'net') live('ROI (gross ratio)', isNum(T.roiGross) ? T.roiGross : null, R.roiGross, ST.NUM);
    if (method !== 'workload') live('Value pool', num(T.valuePool), A.pool, ST.INT);
    if (method === 'affordable') live('Value forfeited in excluded segments', num(T.forfeitedValue), R.forfeited, ST.INT);
    if (c.realloc) {
      live(resultLabel(F, 'coveredValue', 'Value in covered segments', g), num(T.coveredValue), R.covered, ST.INT);
      live(resultLabel(F, 'reallocatedValue', 'Value reallocated', g), num(c.realloc.reallocatedValue), R.reallocated, ST.INT);
      live('Reallocation passes', num(c.realloc.passes), R.reallocPasses, ST.INT);
    }
    if (T.layers) {
      live('First-line managers (from span)', num(T.layers.firstLineManagers), R.flm, ST.NUM);
      live('Second-line managers (from span)', num(T.layers.secondLineManagers), R.slm, ST.NUM);
    }
    kv('Engine version', txt(res.engineVersion)); kv('Inputs hash', txt(res.inputsHash));
    const dn = project.dataNotes || {};
    S.skip();
    S.line(['Data notes'], ST.SECTION);
    kv('Assumptions', txt(dn.assumptions)); kv('Limitations', txt(dn.limitations)); kv('Exclusions', txt(dn.exclusions));
    const warns = (res.warnings || []).concat((res.errors || []).map(e => Object.assign({ error: true }, e)));
    if (warns.length) {
      S.skip();
      S.line(['Calculation messages'], ST.SECTION);
      warns.forEach(w => kv(w.error ? 'Error' : 'Warning', w.code === 'value-forfeited' ? txt(w.message).replace('allocated to segments below the minimum', 'allocated to excluded segments') : txt(w.message)));
    }
    S.skip();
    S.line(['All data shown is synthetic for demonstration purposes.'], ST.NOTE);
    S.maxW[0] = 42; S.minW[1] = 24; S.maxW[1] = 80;
    return S;
  }

  function buildSource(c, scenario) {
    const { F, g } = c;
    const p = scenario.provenance || {};
    const S = new SheetB(SHEETS.source);
    S.line(['Source Data'], ST.TITLE);
    S.line(['Where the segment inputs came from and how columns were mapped. Upstream values are read-only after import.'], ST.NOTE);
    S.skip();
    S.line(['Provenance'], ST.SECTION);
    const kv = (k, v, s) => S.line([{ v: k, s: ST.LABEL }, { v: v === undefined ? null : v, s: s || ST.DEF }]);
    kv('Input path', p.path === 'file' ? 'Uploaded file' : (p.path === 'manual' ? 'Synthetic sample data (demonstration)' : txt(p.path)));
    kv('File name', txt(p.fileName)); kv('Sheet', txt(p.sheet));
    kv('Header row (sheet row number)', isNum(p.headerRow) ? p.headerRow + 1 : '', ST.DEF);
    kv('Input level', p.inputGrain === 'entity' ? `Entity level (one row per ${F.GRAIN[g].one})` : (p.inputGrain === 'summary' ? 'Segment summary' : txt(p.inputGrain)));
    kv('Imported at', fmtTime(p.importedAt)); kv('Rows imported', num(p.rowCount), ST.INT);
    // CS-3 tabs mode (written only when the provenance records it)
    if (Array.isArray(p.tabsAsSpecialties) && p.tabsAsSpecialties.length) kv('Specialty read from sheet names', p.tabsAsSpecialties.map(txt).join(', '));
    S.skip();
    S.line(['Column mapping'], ST.SECTION);
    S.line(['Field', 'Source column'], ST.HDR);
    const mp = p.mapping || {};
    const keys = Object.keys(mp);
    if (keys.length) keys.forEach(k => S.line([fieldLabel(F, k, g), txt(mp[k])]));
    else S.line(['No column mapping (manual entry)', '']);
    S.skip();
    S.line(['Import warnings'], ST.SECTION);
    const w = p.warnings || [];
    if (w.length) w.forEach(x => S.line([typeof x === 'string' ? x : txt(x && x.message ? x.message : x)]));
    else S.line(['None']);
    // F7 (CS-6, FR-07 amended): corrections were removed, so the corrections log is replaced by one note
    S.skip();
    S.line([UPSTREAM_READ_ONLY], ST.NOTE);
    S.maxW[0] = 44; S.maxW[1] = 70;
    return S;
  }

  function buildCurves(c, A) {
    const { F, inp } = c;
    const S = new SheetB(SHEETS.curves);
    const EN = G('FSEngine');
    // the scenario's own curve parameters (2026-10-12: gamma and rho are inputs; defaults when not edited)
    const arch = EN && (EN.archetypesFor ? EN.archetypesFor(inp.methodAssumptions || {}) : EN.ARCHETYPES);
    S.line(['Response Curves'], ST.TITLE);
    S.line(['Response(x) = (δ·x)^γ ÷ (x^γ + ρ); normalized response = Response(x) ÷ Response(X), where X is the normalization point.'], ST.NOTE);
    S.skip();
    if (!arch) { S.line(['Archetype parameters were not available to the exporter (sizing engine not loaded).']); effectiveCurvesBlock(c, S); S.curveRows = null; return S; }
    const X = c.opts.scenarioMaxCalls;
    S.line(['Archetype parameters'], ST.SECTION);
    S.line(['Curve archetype', 'δ (delta)', 'γ (gamma)', 'ρ (rho)', 'Response at X'], ST.HDR);
    const P = {};
    c.arch.forEach(a => {
      const p = arch[a]; if (!p) return;
      const r = S.r;
      const xr = A.xnorm || String(X);
      S.line([rcArchName(F, a), { v: p.delta, s: ST.NUM }, { v: p.gamma, s: ST.NUM }, { v: p.rho, s: ST.NUM },
        { v: responseCurve(p, X), s: ST.CURVE, f: `(B${r + 1}*${xr})^C${r + 1}/(${xr}^C${r + 1}+D${r + 1})` }]);
      P[a] = { r, p };
    });
    effectiveCurvesBlock(c, S);   // fs-io 1.1.0: every archetype in curveParams with its provenance (nothing for a 1.10.0-shaped snapshot)
    S.skip();
    const maxSeg = Math.max(0, ...(inp.segments || []).map(s => (isNum(s.maxCalls) ? s.maxCalls : 0)));
    const top = Math.min(200, Math.max(X, maxSeg));
    S.line([`Normalized response by call count (0 to ${top})`], ST.SECTION);
    const names = c.arch.filter(a => P[a]);
    const hr = S.line(['Calls'].concat(names.map(a => rcArchName(F, a))), ST.HDR);
    S.freeze = 0;
    for (let x = 0; x <= top; x++) {
      const r = S.r;
      const row = [{ v: x, s: ST.INT }];
      names.forEach(a => {
        const q = P[a].r + 1, p = P[a].p;
        row.push({ v: x === 0 ? 0 : responseCurve(p, x) / responseCurve(p, X), s: ST.CURVE,
          f: `IF($A${r + 1}=0,0,(($B$${q}*$A${r + 1})^$C$${q}/($A${r + 1}^$C$${q}+$D$${q}))/$E$${q})` });
      });
      S.line(row);
    }
    void hr;
    const mixOf = s => s.archetypeMix || (s.archetype ? { [s.archetype]: 100 } : null);
    const mixSegs = (inp.segments || []).filter(s => mixOf(s));
    if (mixSegs.length) {
      S.skip();
      S.line([inp.inputGrain === 'entity' ? 'Archetype mix by segment (from entity rows, for information)' : 'Archetype mix by segment (summary input)'], ST.SECTION);
      S.line((c.spec ? [SPEC_LABEL, DECILE_LABEL] : [segLabel(F, 'segment', c.g)]).concat(c.mixArch.map(a => `${a} %`)), ST.HDR);
      mixSegs.forEach(s => { const m = mixOf(s); S.line((c.spec ? [specOfRow(s), txt(decileOf(s))] : [txt(s.segment)]).concat(c.mixArch.map(a => ({ v: isNum(m[a]) ? m[a] / 100 : 0, s: ST.PCT })))); });
    }
    S.minW[0] = 16;
    S.curveRows = P;          // parameter rows, used by the live curve-group formulas on Detailed Calculations
    return S;
  }

  /* v0.5 (CS-8): the Scenario Comparison in the reference "Sizing summary – scenarios" shape, scenarios as columns:
     sizing assumptions, sizing outcomes, then average calls per reached entity by decile. Values come from the engine
     result (fs-engine 1.9 roll-ups and totals); a snapshot without them (an earlier engine) is rolled up here from its
     segment rows with the same rules. The previous one-row-per-scenario table is kept on "Scenario detail". */
  const callsText = x => (isNum(x) ? String(Math.round(x * 10) / 10) : '');
  /* "avg (max – min)" with the screen's tokens (F2, F11): the average to one decimal, the range to at most one decimal,
     and "—" for a group with no reached entity (or no row in that scenario). Excluded segments count as 0 in the range
     (reference-workbook convention, delta §1b); the label says so. */
  const NO_REACH = '—';
  const RANGE_LABEL = G => `Avg calls per reached ${G.one} (max – min across targets; 0 = not reached)`;
  const RANGE_DECILE_LABEL = G => `Avg calls per reached ${G.one} by decile (max – min across targets; 0 = not reached)`;
  const rangeText = (avg, mn, mx) => {
    if (!isNum(avg)) return NO_REACH;
    const rg = isNum(mn) && isNum(mx) ? ` (${callsText(mx)} – ${callsText(mn)})` : '';
    return `${(Math.round(avg * 10) / 10).toFixed(1)}${rg}`;
  };
  // one roll-up group from segment rows: min/max over segments with accessible entities (reach > 0), excluded counted as 0 (delta §1b)
  function rollGroup(rows) {
    let reached = 0, calls = 0, mn = null, mx = null;
    rows.forEach(({ row }) => {
      reached += isNum(row.reached) ? row.reached : 0; calls += isNum(row.totalCalls) ? row.totalCalls : 0;
      if (!(isNum(row.accessible) && row.accessible > 0)) return;      // segments with reach (accessible > 0), as fs-engine 1.9
      const v = row.excluded ? 0 : (isNum(row.finalCallsPerEntity) ? row.finalCallsPerEntity : 0);
      mn = mn === null ? v : Math.min(mn, v); mx = mx === null ? v : Math.max(mx, v);
    });
    return { avgCallsPerReached: reached > 0 ? calls / reached : null, minCalls: mn, maxCalls: mx };
  }
  function rollupsOf(x) {
    const T = x.totals, res = x.res, segIn = x.inp.segments || [];
    const rows = (res.segments || []).map((row, i) => ({ row, seg: segIn[i] }));
    const all = rollGroup(rows);
    const tot = {
      avgCallsPerReached: isNum(T.avgCallsPerReached) ? T.avgCallsPerReached : all.avgCallsPerReached,
      minCalls: isNum(T.minCalls) ? T.minCalls : all.minCalls,
      maxCalls: isNum(T.maxCalls) ? T.maxCalls : all.maxCalls,
      targetsPerRep: isNum(T.targetsPerRep) ? T.targetsPerRep : (isNum(T.entitiesPerRep) ? T.entitiesPerRep : (isNum(T.recommendedFte) && T.recommendedFte > 0 && isNum(T.reached) ? T.reached / T.recommendedFte : null))
    };
    let byDecile;
    if (res.rollups && Array.isArray(res.rollups.byDecile)) byDecile = res.rollups.byDecile.map(d => ({ key: txt(d.key), avgCallsPerReached: num(d.avgCallsPerReached), minCalls: num(d.minCalls), maxCalls: num(d.maxCalls) }));
    else {
      const keys = [], by = {};
      rows.forEach(r => {
        const k = r.row.decile !== undefined && r.row.decile !== null && String(r.row.decile) !== '' ? txt(r.row.decile) : txt(r.row.segment);
        if (!(k in by)) { by[k] = []; keys.push(k); }
        by[k].push(r);
      });
      byDecile = keys.map(k => Object.assign({ key: k }, rollGroup(by[k])));
    }
    return { tot, byDecile };
  }
  function buildComparison(scenarios, project, focusId, ai) {
    const F = fields();
    const S = new SheetB(SHEETS.compare);
    S.line(['Scenario Comparison'], ST.TITLE);
    S.line([`All scenarios in the project, one column each. "Recommended" is set by the analyst, never automatically. Every value is from the sizing engine; the full comparison is on ${SHEETS.detail}.`], ST.NOTE);
    S.skip();
    const ctxs = scenarios.map((s, i) => Object.assign(ctxFor(s, project), { s }));
    const g = ctxs[0] ? ctxs[0].g : 'hcp', G = F.GRAIN[g];
    const R = ctxs.map(rollupsOf);
    const valued = x => x.method === 'affordable' || x.method === 'response';
    const row = (label, fn, style) => S.line([{ v: label, s: style || ST.LABEL }].concat(ctxs.map((x, i) => fn(x, i))));
    S.line(['Scenario'].concat(ctxs.map(x => txt(x.s.name))), ST.HDR);
    S.freeze = S.r;
    row('Version', x => txt(x.s.version));
    row('Status', x => STATUS[x.s.status] || txt(x.s.status));
    row('Recommended', x => (x.s.recommended ? 'Yes' : 'No'));
    row('Focus scenario', x => (x.s.id === focusId ? 'Yes' : ''));
    S.skip();
    S.line(['Sizing assumptions'], ST.SECTION);
    row('Method', x => methodLabel(F, x.method));
    row('ROI cutoff', x => (valued(x) && isNum(x.opts.cutoff) ? { v: x.opts.cutoff, s: ST.NUM } : 'N/A'));
    row(`Target ${G.many} in scope`, x => ({ v: num(x.totals.entities), s: ST.INT }));
    row(REALLOC_LABEL, x => (valued(x) ? reallocText(F, x.ma.reallocateExcluded === true) : 'N/A'));
    S.skip();
    S.line(['Sizing outcomes'], ST.SECTION);
    row('Total reps (recommended FTE)', x => ({ v: num(x.totals.recommendedFte), s: x.sh.fteRounding === 'none' ? ST.B_FTE : ST.B_INT }));
    row(F.RESULT_LABELS.reached(g), x => ({ v: num(x.totals.reached), s: ST.NUM }));
    row('% reach', x => (isNum(x.totals.reached) && isNum(x.totals.entities) && x.totals.entities > 0 ? { v: x.totals.reached / x.totals.entities, s: ST.PCT1 } : 'N/A'));
    row('Total cost', x => (isNum(x.totals.fieldCost) ? { v: x.totals.fieldCost, s: ST.INT } : 'N/A'));
    row(RANGE_LABEL(G), (x, i) => rangeText(R[i].tot.avgCallsPerReached, R[i].tot.minCalls, R[i].tot.maxCalls));
    row(TPR_LABEL, (x, i) => ({ v: num(R[i].tot.targetsPerRep), s: ST.NUM }));
    row(F.RESULT_LABELS.roi(g), x => (x.method !== 'workload' && isNum(x.totals.roi) ? { v: x.totals.roi, s: ST.NUM } : 'N/A'));
    S.skip();
    S.line([RANGE_DECILE_LABEL(G)], ST.SECTION);
    S.line([DECILE_LABEL].concat(ctxs.map(x => txt(x.s.name))), ST.HDR);   // scenario names, as the main table (F11)
    const keys = [];
    R.forEach(r => r.byDecile.forEach(d => { if (!keys.includes(d.key)) keys.push(d.key); }));
    if (!keys.length) S.line(['No segment rows']);
    keys.forEach(k => S.line([{ v: k, s: ST.LABEL }].concat(R.map(r => { const d = r.byDecile.find(z => z.key === k); return d ? rangeText(d.avgCallsPerReached, d.minCalls, d.maxCalls) : NO_REACH; }))));
    S.skip();
    S.line([`${TPR_LABEL} = ${tprNote(F, g).charAt(0).toLowerCase() + tprNote(F, g).slice(1)}.`], ST.NOTE);
    S.line(['Rx and patients covered by targets are not shown: they need client claims data that this module does not take.'], ST.NOTE);
    // AI export only: the origin row comes last, so every cell above sits where it does in the AI-free workbook
    if (ai) { S.skip(); row('Origin', x => (x.s.ai ? aiStr(`AI-proposed · adopted by ${txt(x.s.ai.adoptedBy) || 'an unnamed user'}`
      + (x.s.ai.methodChangedTo ? ` (method changed to ${methodLabel(F, x.s.ai.methodChangedTo)})` : '')) : 'Analyst')); }
    S.minW[0] = 34; S.maxW[0] = 48;
    ctxs.forEach((x, i) => { S.minW[i + 1] = 18; });
    return S;
  }

  // The previous long comparison (one row per scenario), kept so nothing is lost (v0.5, CS-8).
  function buildDetail(scenarios, project, focusId, ai) {
    const F = fields();
    const S = new SheetB(SHEETS.detail);
    S.line(['Scenario detail'], ST.TITLE);
    S.line(['All scenarios in the project, one row each, with every input setting and result. "Recommended" is set by the analyst, never automatically.'], ST.NOTE);
    S.skip();
    const ctxs = scenarios.map(s => ctxFor(s, project));
    const methods = new Set(ctxs.map(x => x.method));
    const anyVal = methods.has('affordable') || methods.has('response');
    const anyResp = methods.has('response');
    const g = ctxs[0] ? ctxs[0].g : 'hcp';
    const cols = [
      ['Scenario', x => txt(x.s.name)], ['Version', x => txt(x.s.version)], ['Status', x => STATUS[x.s.status] || txt(x.s.status)],
      ['Recommended', x => (x.s.recommended ? 'Yes' : 'No')], ['Focus scenario', x => (x.s.id === focusId ? 'Yes' : '')],
      ['Method', x => methodLabel(F, x.method)]
    ];
    if (anyVal) {
      cols.push(['Value allocation', x => (x.method === 'workload' ? '' : F.OPTION_LABELS.allocation[x.opts.allocation] || x.opts.allocation)]);
      cols.push(['ROI cutoff', x => (x.method === 'workload' ? '' : { v: x.opts.cutoff, s: ST.NUM })]);
    }
    if (anyResp) {
      cols.push(['ROI basis', x => (x.method === 'response' ? F.OPTION_LABELS.roiBasis[x.opts.roiBasis] : '')]);
      cols.push(['Stopping rule', x => (x.method === 'response' ? F.OPTION_LABELS.stoppingRule[x.opts.stoppingRule] : '')]);
      // F-R2V5-01: a saved normalization point other than the standard 48 is flagged like the other option columns
      cols.push(['Normalization point (calls)', x => (x.method !== 'response' ? '' : xnormDiffers(x.opts) ? `${x.opts.scenarioMaxCalls} (changed)` : { v: x.opts.scenarioMaxCalls, s: ST.INT })]);
    }
    if (anyVal && ctxs.some(x => x.showCalib)) cols.push(['Calibration factor', x => (x.method === 'workload' ? '' : { v: x.opts.calibrationFactor, s: ST.DEC })]);
    cols.push(['Capacity (calls per rep)', x => ({ v: capacityOf(x.sh), s: ST.INT })]);
    const optKeys = [];
    ctxs.forEach(x => methodologyOptions(x).forEach(o => { if (!optKeys.some(k => k.key === o.key) && !['roiBasis', 'stoppingRule', 'calibrationFactor'].includes(o.key)) optKeys.push({ key: o.key, label: o.label }); }));
    optKeys.forEach(k => cols.push([k.label, x => { const o = methodologyOptions(x).find(y => y.key === k.key); return o ? o.text + (o.changed ? ' (changed)' : '') : ''; }]));
    if (anyVal) cols.push(['Sizing start year', x => (x.method !== 'workload' && x.ma.value && Array.isArray(x.ma.value.years) && x.ma.value.years.length ? (isNum(x.ma.value.sizingStartYear) ? x.ma.value.sizingStartYear : 'Not entered') : (x.method === 'workload' ? '' : 'Annual value entered'))]);
    // v0.5.1: the column appears only for a v0.5 draft saved with a non-default forecastMode (older draft)
    const legacyOf = x => x.method !== 'workload' && x.ma.value && Array.isArray(x.ma.value.years) && x.ma.value.years.length && !isNum(x.ma.value.annualValue) && isLegacyMode(x.ma.value);
    if (anyVal && ctxs.some(legacyOf)) cols.push([`${LEGACY_MODE_LABEL} (older draft)`, x => (legacyOf(x) ? forecastModeText(F, forecastModeOf(x.ma.value)) : '')]);
    cols.push([F.RESULT_LABELS.rawFte(g), x => ({ v: num(x.totals.rawFte), s: ST.FTE })]);
    cols.push([F.RESULT_LABELS.recommendedFte(g), x => ({ v: num(x.totals.recommendedFte), s: ST.B_INT })]);
    cols.push([F.RESULT_LABELS.reached(g), x => ({ v: num(x.totals.reached), s: ST.NUM })]);
    cols.push([F.RESULT_LABELS.totalCalls(g), x => ({ v: num(x.totals.totalCalls), s: ST.NUM })]);
    cols.push([F.RESULT_LABELS.avgCallsPerReached(g), x => ({ v: num(x.totals.avgCallsPerReached), s: ST.NUM })]);
    cols.push([F.RESULT_LABELS.fieldCost(g), x => (isNum(x.totals.fieldCost) ? { v: x.totals.fieldCost, s: ST.INT } : 'N/A')]);
    if (anyVal) cols.push(['Value pool', x => (x.method !== 'workload' && isNum(x.totals.valuePool) ? { v: x.totals.valuePool, s: ST.INT } : 'N/A')]);
    if (ctxs.some(x => x.realloc)) {                           // CS-2, per scenario (the setting itself is a methodology option column)
      // Off Affordable/Response scenarios show their real covered value, 0 passes and $0 reallocated (F2 / F-R2V4-01)
      const valuedX = x => x.method === 'affordable' || x.method === 'response';
      cols.push(['Value in covered segments', x => (valuedX(x) && isNum(x.totals.coveredValue) ? { v: x.totals.coveredValue, s: ST.INT } : 'N/A')]);
      cols.push(['Reallocation passes', x => (x.realloc ? (isNum(x.realloc.passes) ? { v: x.realloc.passes, s: ST.INT } : 'N/A') : (valuedX(x) ? { v: 0, s: ST.INT } : 'N/A'))]);
      cols.push(['Value reallocated', x => (x.realloc ? (isNum(x.realloc.reallocatedValue) ? { v: x.realloc.reallocatedValue, s: ST.INT } : 'N/A') : (valuedX(x) ? { v: 0, s: ST.INT } : 'N/A'))]);
    }
    cols.push([F.RESULT_LABELS.roi(g), x => (x.method !== 'workload' && isNum(x.totals.roi) ? { v: x.totals.roi, s: ST.NUM } : 'N/A')]);
    if (anyResp) cols.push(['ROI (gross ratio)', x => (x.method === 'response' && isNum(x.totals.roiGross) ? { v: x.totals.roiGross, s: ST.NUM } : (x.method === 'affordable' && isNum(x.totals.roi) ? { v: x.totals.roi, s: ST.NUM } : 'N/A'))]);
    if (ai) cols.push(['Origin', x => (x.s.ai ? aiStr(`AI-proposed · adopted by ${txt(x.s.ai.adoptedBy) || 'an unnamed user'}`
      + (x.s.ai.methodChangedTo ? ` (method changed to ${methodLabel(F, x.s.ai.methodChangedTo)})` : '')) : 'Analyst')]);
    S.line(cols.map(k => k[0]), ST.HDR);
    S.freeze = S.r;
    ctxs.forEach((x, i) => { x.s = scenarios[i]; S.line(cols.map(k => k[1](x))); });
    return S;
  }

  // Engine trace text uses option keys in a few places; show option labels instead (no raw keys in the export).
  function traceText(c, t) {
    const F = c.F;
    let f = txt(t.formula);
    const OL = F.OPTION_LABELS || {};
    for (const grp of Object.keys(OL)) if (OL[grp][f]) return OL[grp][f];                       // whole text is a key
    f = f.replace(/^(proportional):/, (m, k) => `${OL.allocation[k]}:`)
      .replace(/^(gross|net):/, (m, k) => `${OL.roiBasis[k]}:`);
    if (t.step === 'Response options') {
      const ma = c.ma, D = F.OPTION_DEFAULTS || {};
      const o = k => optLabel(F, k, ma[k] || D[k]);
      f = `${o('minimumBoundary')}; ${o('cutoffTie')}; ${o('reachAppliesTo')}`;
    }
    return f;
  }

  function buildFormulas(c) {
    const { F, method, g, res, opts } = c;
    const S = new SheetB(SHEETS.formulas);
    const one = F.GRAIN[g].one;
    S.line([`Formula Documentation: ${methodLabel(F, method)}`], ST.TITLE);
    S.line(['Each calculation in words and symbols, and where it appears in this workbook.'], ST.NOTE);
    S.skip();
    S.line(['#', 'Quantity', 'In words', 'Symbol form', 'Where'], ST.HDR);
    const rows = [];
    const add = (q, w, sym, where) => rows.push([q, w, sym, where]);
    if (method !== 'workload' || isNum(c.sh.repCost)) {
      add('Loaded annual rep cost', c.sh.costMode === 'layers' ? 'Rep cost plus first-line manager cost spread over the span, plus second-line manager cost spread over both spans' : 'Fully loaded annual cost per rep, entered directly',
        c.sh.costMode === 'layers' ? 'R = R_rep + C_FLM ÷ S_FLM + C_SLM ÷ (S_FLM × S_SLM)' : 'R = R_fully loaded', 'Assumptions');
      const cm = costMethodOf(c.sh);
      add('Cost per call by year', 'Year-1 cost inflated to year t, divided by capacity', 'c_t = R × (1+i)^t ÷ K', 'Assumptions (cost per call build-up)');
      add(`Effective cost per call: single window${cm === 'single-window' ? ' (used)' : ' (not used)'}`,
        'Costs per call for the W years of the sizing window, discounted to the first year and averaged (default)',
        'c = [c_0 + c_1/(1+d) + … + c_(W−1)/(1+d)^(W−1)] ÷ W', 'Assumptions (cost per call build-up)');
      add(`Effective cost per call: rolling windows${cm === 'rolling-windows' ? ' (used)' : ' (not used)'}`,
        'Average of W overlapping W-year discounted windows, each starting one year later',
        'c = (1/W) × Σ_a [ Σ_t c_(a+t)/(1+d)^t ÷ W ], a = 0..W−1, t = 0..W−1', 'Assumptions (cost per call build-up)');
    }
    const vv = c.ma.value || {};
    if (method !== 'workload') {
      if (Array.isArray(vv.years) && vv.years.length && !isNum(vv.annualValue)) {
        const fm = forecastModeOf(vv);
        const src = vv.carryoverConvention === 'sourceYear' && fm !== 'other+sf';
        if (fm !== 'carryover+other') {
          add('Forecast identity', 'Each forecast year is other channels plus carryover from earlier cohorts plus new Salesforce-impactable value. Two shares are entered and the third is derived', 'F_t = O_t + CarryIn_t + S_t', 'Assumptions (value build-up)');
          add(`${LEGACY_MODE_LABEL}: ${legacyModeText(F, fm)}`, `${shareLabel(MODE_DERIVED[fm])} is derived as a live formula (the derived column)`, MODE_DERIVED[fm] === 'other' ? 'o_t = O_t ÷ F_t' : 'carry_t = CarryIn_t ÷ (S_(t−1) + CarryIn_(t−1))', 'Assumptions (value build-up)');
        }
        add('Cohort carryover', `Each cohort keeps a share of its prior-year value; the carryover % is read from the ${src ? 'source' : 'receiving'} year`,
          src ? 'M_i,j = M_i,j−1 × carry_(j−1)' : 'M_i,j = M_i,j−1 × carry_j', 'Assumptions (value build-up)');
        if (fm === 'carryover+sf') {
          add('Carryover from earlier cohorts', 'Sum of the earlier cohorts carried into the year', 'CarryIn_t = Σ_(i<t) M_i,t', 'Assumptions (value build-up)');
          add('New field-impactable value', 'Forecast times the Salesforce-impactable %', 'S_t = F_t × s_t', 'Assumptions (value build-up)');
          add('Other channel (derived)', 'Forecast minus new Salesforce-impactable value minus carryover from earlier cohorts; must not be negative', 'O_t = F_t − S_t − CarryIn_t', 'Assumptions (value build-up)');
        } else if (fm === 'other+sf') {
          add('Other channel', 'Forecast times the other-channel share', 'O_t = F_t × o_t', 'Assumptions (value build-up)');
          add('New field-impactable value', 'Forecast times the Salesforce-impactable %', 'S_t = F_t × s_t', 'Assumptions (value build-up)');
          add('Carryover from earlier cohorts (derived)', 'Forecast minus other channel minus new Salesforce-impactable value; must not be negative and is 0 in the first forecast year', 'CarryIn_t = F_t − O_t − S_t', 'Assumptions (value build-up)');
        } else {
          add('Other channel', 'Forecast times the other-channel share', 'O_t = F_t × o_t', 'Assumptions (value build-up)');
          add('Carryover from earlier cohorts', 'Sum of the earlier cohorts carried into the year', 'CarryIn_t = Σ_(i<t) M_i,t', 'Assumptions (value build-up)');
          add('New field-impactable value', 'Forecast minus other channel minus carryover from earlier cohorts, not below zero', 'S_t = MAX(0, F_t − O_t − CarryIn_t)', 'Assumptions (value build-up)');
          // v0.5.1 CS-1: the Salesforce-impactable check (never changes a number)
          add(impliedLabel(F), 'New Salesforce-impactable value as a share of the forecast; blank when the forecast is 0', 's_t = S_t ÷ F_t', 'Assumptions (value build-up)');
          add('Check (first year)', 'First forecast year only: entered Salesforce-impactable % (the implied value when blank) plus the other-channel share must be within 0.5 percentage points of 100%. Later years are not checked because Salesforce impact keeps carrying over from earlier cohorts. Non-blocking; sizing uses carryover and other channels', 'IF(ABS((entered s_1, else implied s_1) + o_1 − 1) > 0.005, "Check", "OK")', 'Assumptions (value build-up)');
        }
        add('Cohort value', 'New value plus its carryover tail, discounted', 'NPV_t = S_t + Σ_(k=1..tail) M_t,t+k ÷ (1+d)^k', 'Assumptions (value build-up)');
        add('Annual impactable margin', 'Sum of the sizing-window cohort values times gross margin, divided by the window', 'V_annual = Σ NPV_t × GM ÷ W', 'Assumptions (value build-up)');
      }
      if (c.showCalib) add('Value pool', 'Annual impactable value times the calibration factor', 'V = V_annual × k', 'Assumptions');
      else add('Value pool', 'Value pool equals the annual impactable value', 'V = V_annual', 'Assumptions');
    }
    if (method === 'affordable') {
      add(`Accessible ${F.GRAIN[g].many}`, `Number of ${F.GRAIN[g].many} in the segment times reach % (for example 310 × 90%)`, 'A_s = N_s × r_s%', 'Detailed Calculations');
      add('Allocated value', `Value pool times the segment share (${F.OPTION_LABELS.allocation[opts.allocation] || opts.allocation})`,
        'V_s = V × CV_s ÷ Σ CV',
        'Detailed Calculations');
      add('Affordable calls', 'Allocated value divided by cost per call times the total ROI cutoff', 'AC_s = V_s ÷ (c × ROI*)', 'Detailed Calculations');
      add(F.RESULT_LABELS.affordableCallsPerEntity(g), `Affordable calls divided by accessible ${F.GRAIN[g].many}`, 'a_s = AC_s ÷ A_s', 'Detailed Calculations');
      const strict = c.ma.minimumBoundary === 'strict';
      add(F.RESULT_LABELS.finalCallsPerEntity(g), `Affordable calls per entity capped at the maximum, rounded down; zero if ${strict ? 'not above' : 'below'} the minimum (minimum boundary ${strict ? 'strict' : 'inclusive'})`,
        `f_s = ROUNDDOWN(MIN(a_s, max_s), 0) if MIN(a_s, max_s) ${strict ? '>' : '≥'} min_s, else 0`, 'Detailed Calculations');
      add(F.RESULT_LABELS.reached(g), 'Accessible entities when the segment receives calls, otherwise zero', 'Reached_s = A_s if f_s > 0, else 0', 'Detailed Calculations');
      add('Retained value', c.realloc ? 'Allocated value of segments that receive calls; with reallocation On the pool is shared over the covered segments only, so no value is forfeited' : 'Allocated value of segments that receive calls; the value of excluded segments is forfeited, not redistributed', 'RV_s = V_s if f_s > 0, else 0', 'Detailed Calculations');
    } else if (method === 'response') {
      add(`Accessible ${F.GRAIN[g].many}`, `Number of ${F.GRAIN[g].many} in the segment times reach % (for example 310 × 90%)`, 'A_s = N_s × r_s%', 'Detailed Calculations');
      add('Response curve', 'Share of maximum response reached after x calls for an archetype', 'Response(x) = (δ·x)^γ ÷ (x^γ + ρ)', 'Response Curves');
      add('Normalized response', 'Response scaled so the normalization point equals 1', 'n(x) = Response(x) ÷ Response(X)', 'Response Curves');
      if (c.rcRows) {           // fs-io 1.1.0: the uptake preset resolution rule (FSFields wording)
        const L = rcLabels(F);
        add(txt((L.exportHeadings || {}).resolutionRule), txt(L.resolutionRule), '', `${SHEETS.curves}, ${txt((L.exportSheets || {}).configuration)}`);
      }
      add(`Value per ${one}`, `Value pool times the ${one}'s share (${F.OPTION_LABELS.allocation[opts.allocation] || opts.allocation})`, 'K_e = V × share_e', 'Sizing engine, per entity');
      add('Contribution after x calls', `Value per ${one} times the normalized response`, 'C_e(x) = K_e × n(x)', 'Sizing engine, per entity');
      add('Marginal ROI test', opts.roiBasis === 'net' ? 'Net: incremental contribution minus incremental cost, divided by incremental cost, must reach the cutoff' : 'Gross: incremental contribution divided by incremental cost must reach the cutoff',
        opts.roiBasis === 'net' ? '(C_e(x) − C_e(x−1) − c) ÷ c ≥ cutoff' : '(C_e(x) − C_e(x−1)) ÷ c ≥ cutoff', 'Sizing engine, per entity');
      add(`Calls per ${one} (standard method)`, (opts.stoppingRule || 'first-fail') === 'first-fail' ? 'Chosen on the marginal ROI test; stops at the first call that misses the marginal cutoff' : `Saved stopping rule: ${optLabel(F, 'stoppingRule', opts.stoppingRule)} (differs from the standard method)`, 'calls_e chosen on the marginal ROI test, capped at max_s; zero if below min_s', 'Sizing engine, per entity');
      if (c.responseLive) {
        const many = F.GRAIN[g].many;
        add(`${many.charAt(0).toUpperCase() + many.slice(1)} in group`, `Number of ${many} in the segment times the curve archetype's share of the segment`, 'n_g = N_s × mix_g', 'Detailed Calculations (curve-group table)');
        add('Selected calls per group', `Calls per ${one} chosen by ${stopText(F, opts)}; every ${one} in a group has the same value, so one search per group`, 'calls_g (sizing engine search)', 'Detailed Calculations (curve-group table, grey)');
        add('Contribution per group', `Segment value per ${one} times ${many} in the group times the normalized response at the selected calls${c.ma.reachAppliesTo === 'callsAndValue' ? ', times reach %' : ''}`,
          `C_g = (V_s ÷ N_s) × n_g × n(calls_g)${c.ma.reachAppliesTo === 'callsAndValue' ? ' × r_s%' : ''}; C_s = Σ_g C_g`, 'Detailed Calculations (curve-group table)');
        add(F.RESULT_LABELS.reached(g), `${many.charAt(0).toUpperCase() + many.slice(1)} in groups that receive at least one call, times reach %`, 'Reached_s = Σ_g n_g × r_s% × [calls_g > 0]', 'Detailed Calculations (curve-group table)');
        add(F.RESULT_LABELS.finalCallsPerEntity(g), `Average calls per reached ${one}`, 'f_s = Σ_g calls_g × n_g × r_s% ÷ Reached_s', 'Detailed Calculations');
        add('Why some cells are grey', `The call count for each curve archetype group comes from a search over calls (${stopText(F, opts)}), which a cell formula cannot express. Those selected calls, the binding constraint and the exclusion reason are ${SEARCH_NOTE.charAt(0).toLowerCase() + SEARCH_NOTE.slice(1)}. Everything built on them (reached ${many}, calls, contribution, raw FTE, recommended FTE, cost, ROI) is live. If you change value, capacity or cost here, those cells move, but the selected calls do not re-optimise until you recalculate in the sizing tool.`,
          'Grey = value from the sizing engine', 'Detailed Calculations');
      } else {
      add(F.RESULT_LABELS.reached(g), `Reach-weighted count of ${F.GRAIN[g].many} that receive at least one call`, 'Reached_s = Σ_e r_s% × [calls_e > 0]', 'Detailed Calculations (grey cells)');
      add(F.RESULT_LABELS.finalCallsPerEntity(g), `Average calls per reached ${one}`, 'f_s = Σ_e r_s% × calls_e ÷ Reached_s', 'Detailed Calculations (grey cells)');
      add('Why some cells are grey', `Each ${one} gets its own call count from its value, curve archetype and ${stopText(F, opts)}. That is a search over calls for every ${one}, which one row formula per segment cannot express. So reached ${F.GRAIN[g].many}, average calls per reached ${one}, contribution, binding constraint and exclusion reason are ${ENGINE_NOTE.charAt(0).toLowerCase() + ENGINE_NOTE.slice(1)}. Everything after them (total calls, raw FTE, recommended FTE, cost, ROI) stays live. If you change capacity or cost here, FTE and cost move, but the call counts do not re-optimise until you recalculate in the sizing tool.`,
        'Grey = value from the sizing engine', 'Detailed Calculations');
      }
    } else {
      add(F.RESULT_LABELS.reached(g), `Number of ${F.GRAIN[g].many} times reach % (for example 310 × 90%)`, 'Reached_s = N_s × r_s%', 'Detailed Calculations');
      add(segLabel(F, 'plannedCalls', g), 'Entered per segment (whole number)', 'f_s = planned_s', 'Assumptions');
    }
    if (c.realloc) {
      const al = opts.allocation;
      add('Reallocation passes', 'Run the segment calculation, drop the segments that receive no calls, re-share the whole value pool over the remaining segments and repeat until no further segment drops out', 'E_(p+1) = E_p − X_p; stop when X_p is empty', 'Sizing engine; Detailed Calculations (reallocation block)');
      add('Covered in final pass', 'Segments that still receive calls after the last pass (1 = yes); a fixed value from the sizing engine', 'cov_s ∈ {0, 1}', 'Detailed Calculations (grey)');
      add('Allocated value (reallocation On)', `Value pool times the segment share among covered segments (${F.OPTION_LABELS.allocation[al] || al})`,
        'V_s = V × CV_s ÷ Σ_(cov) CV if cov_s = 1, else 0', 'Detailed Calculations');
      add('Value in covered segments', 'Allocated value of the segments that receive calls in the final pass', 'V_cov = Σ_s V_s × [Calls_s > 0]', 'Detailed Calculations (reallocation block)');
      add('Value in excluded segments', 'Value pool minus the value in covered segments', 'V − V_cov', 'Detailed Calculations (reallocation block)');
    }
    add(F.RESULT_LABELS.totalCalls(g), `Reached ${F.GRAIN[g].many} times final calls per ${one}`, 'Calls_s = Reached_s × f_s', 'Detailed Calculations');
    add('Raw FTE (segment)', 'Total annual calls divided by effective annual capacity per rep', 'FTE_s = Calls_s ÷ K', 'Detailed Calculations');
    add(F.RESULT_LABELS.rawFte(g), 'Sum of unrounded segment raw FTE', 'FTE = Σ_s FTE_s', 'Detailed Calculations (Total row)');
    const rnd = c.sh.fteRounding || 'nearest';
    add(F.RESULT_LABELS.recommendedFte(g), rnd === 'up' ? 'Raw FTE rounded up to a whole FTE after summing (rows are never rounded first)' : rnd === 'none' ? 'Raw FTE, not rounded' : 'Raw FTE rounded to the nearest whole FTE after summing (rows are never rounded first)',
      rnd === 'up' ? 'FTE_rec = ROUNDUP(FTE, 0)' : rnd === 'none' ? 'FTE_rec = FTE' : 'FTE_rec = ROUND(FTE, 0)', 'Detailed Calculations, Scenario Summary');
    if (c.spec) add('Specialty subtotal', 'Sum of the segment rows with the same specialty (a segment is one specialty and decile pair)', 'X_sp = Σ_(s in sp) X_s', 'Detailed Calculations (By specialty)');
    add(F.RESULT_LABELS.planningAllocation(g), 'Recommended FTE split across segments by largest remainder; a planning aid, not a territory alignment', 'Σ_s split_s = FTE_rec', 'Detailed Calculations (grey cells)');
    add(F.RESULT_LABELS.avgCallsPerReached(g), `Total calls divided by reached ${F.GRAIN[g].many}`, 'Calls ÷ Reached', 'Detailed Calculations');
    add(TPR_LABEL, `Reached ${F.GRAIN[g].many} divided by recommended FTE`, 'Reached ÷ FTE_rec', 'Detailed Calculations');
    if (method !== 'workload' || isNum(c.sh.repCost)) add(F.RESULT_LABELS.fieldCost(g), 'Total annual calls times effective cost per call', 'Cost = Calls × c', 'Detailed Calculations');
    if (method === 'affordable') add(F.RESULT_LABELS.roi(g), 'Retained value (allocated value of segments that receive calls) divided by field cost', 'ROI = Σ_s V_s[f_s > 0] ÷ Cost', 'Detailed Calculations');
    else if (method === 'response') add(roiLabel(F, g, opts), opts.roiBasis === 'net' ? 'Contribution divided by field cost, minus 1' : 'Contribution divided by field cost', opts.roiBasis === 'net' ? 'ROI = Σ C ÷ Cost − 1' : 'ROI = Σ C ÷ Cost', 'Detailed Calculations');
    else add(F.RESULT_LABELS.roi(g), 'Not applicable to Workload Buildup (no value input)', 'N/A', 'Scenario Summary');
    rows.forEach((r, i) => S.line([i + 1].concat(r)));
    S.skip();
    S.line(['Standard method and reallocation setting (focus scenario)'], ST.SECTION);
    S.line(['#', 'Setting', 'Setting used', 'Alternatives and effect', 'Standard'], ST.HDR);
    const EFFECT = {
      costPerCallMethod: 'Single window: [c_0 + c_1/(1+d) + c_2/(1+d)^2] ÷ 3. Rolling windows: average of three overlapping discounted 3-year windows.',
      fteRounding: 'Nearest: ROUND(FTE,0). Up: ROUNDUP(FTE,0) (1E-9 tolerance for summing noise). None: FTE_rec = raw FTE. Always applied to the sum, never to rows.',
      minimumBoundary: 'Inclusive: calls equal to the minimum are retained (≥). Strict: calls must exceed the minimum (>).',
      roiBasis: 'Gross: value ÷ cost. Net: (value − cost) ÷ cost = gross − 1.',
      stoppingRule: 'First failing call stops; minimum block tested first; or the most calls that still pass.',
      cutoffTie: 'Include: a marginal ROI equal to the cutoff passes (≥). Exclude: it must exceed the cutoff (>).',
      reachAppliesTo: 'Calls only: reach scales calls, cost and entities, not contribution. Calls and value: reach also scales contribution.',
      calibrationFactor: 'Multiplies the value pool: V = V_annual × k.',
      reallocateExcluded: 'Off: value allocated to excluded segments is forfeited. On: the value pool is re-shared over the segments still covered, pass after pass, until no further segment drops out.',
      maxCallsSource: 'Segment: every entity uses the segment maximum. Entity attribute: a maximum-calls column imported with the entity rows overrides the segment maximum for that entity.',
      carryoverConvention: 'Receiving year: the carryover % on year t applies to prior cohorts flowing into year t. Source year: the % on year t applies to cohort t flowing into year t+1. Only used with the forecast chain.'
    };
    // standard method rows first, then the reallocation setting (a main assumption, CS-5)
    methodologyOptions(c).forEach((o, i) => S.line([i + 1, o.label, o.text + (o.changed ? (o.main ? ' (changed from default)' : ' (differs from the standard method)') : ''), EFFECT[o.key] || '', o.defText]));
    const tr = res.trace || [];
    if (tr.length) {
      S.skip();
      S.line(['Calculation trace (focus scenario)'], ST.SECTION);
      S.line(['#', 'Step', 'Formula with values', 'Value'], ST.HDR);
      tr.forEach((t, i) => S.line([i + 1, txt(t.step), traceText(c, t), isNum(t.value) ? { v: t.value, s: ST.CURVE } : txt(t.value)]));
    }
    S.maxW[0] = 6; S.minW[0] = 5; S.maxW[1] = 36; S.maxW[2] = 70; S.maxW[3] = 70; S.maxW[4] = 30;
    return S;
  }

  function buildAudit(scenarios, focus, audit, ai) {
    const S = new SheetB(SHEETS.audit);
    S.line(['Audit and Approval'], ST.TITLE);
    S.line(['Approval state of every scenario and the full audit trail. Approved scenarios are immutable snapshots.'], ST.NOTE);
    S.skip();
    S.line(['Approval state'], ST.SECTION);
    S.line(['Scenario', 'Version', 'Status', 'Approved by', 'Approved at', 'Recommended', 'Recommendation note', 'Inputs hash', 'Engine version'], ST.HDR);
    scenarios.forEach(s => S.line([txt(s.name) + (s.id === focus.id ? ' (focus)' : ''), txt(s.version), STATUS[s.status] || txt(s.status), txt(s.approvedBy), fmtTime(s.approvedAt),
      s.recommended ? 'Yes' : 'No', txt(s.recommendationNote), txt(s.result && s.result.inputsHash), txt(s.result && s.result.engineVersion)]));
    S.skip();
    S.line(['Audit trail'], ST.SECTION);
    S.line(['Time', 'User', 'Role', 'Action', 'Scenario', 'Detail'], ST.HDR);
    const byId = new Map(scenarios.map(s => [s.id, s]));
    const ev = (audit || []).slice();
    if (!ev.length) S.line(['No audit events recorded']);
    ev.forEach(e => {
      const s = byId.get(e.scenarioId);
      const row = [fmtTime(e.at), txt(e.user), roleLabel(fields(), e.role), e.label ? txt(e.label) : ((ai && AI_ACTIONS[e.action]) || actionLabel(e.action)), s ? `${txt(s.name)} (v${txt(s.version)})` : txt(e.scenarioId), detailText(e.detail)];
      if (ai && /^ai-/.test(String(e.action))) { row[3] = aiStr(row[3]); row[5] = aiStr(row[5]); }   // AI rows pass the export wording check
      S.line(row);
    });
    S.maxW[6] = 50; S.maxW[5] = 60;
    return S;
  }

  // ---------------------------------------------------------------------------
  // AI export extensions (contract §6). Only used when the export involves AI; an AI-free export never reaches this code.
  // ---------------------------------------------------------------------------
  /* Field labels for change paths (contract §2). The base label equals FSAssist.pathLabel(path, grain) for every allowlisted
     path (tested); unknown paths get a readable fallback, never the raw key. With a third argument (engine inputs, or
     { segments, years }) the label is qualified: "Reach % · segment 10", "Forecast · year 2027", "Reach % · all segments". */
  const AI_PATH_LABELS = {
    'shared.capacity': 'Effective annual capacity', 'shared.repCost': 'Annual rep cost', 'shared.inflationPct': 'Cost inflation %',
    'shared.discountRatePct': 'Discount rate %', 'shared.costMode': 'Cost mode', 'shared.fteRounding': 'FTE rounding',
    'shared.capacityInput.mode': 'Capacity input', 'shared.capacityInput.callsPerDay': 'Calls per day', 'shared.capacityInput.workingDays': 'Working days',
    'methodAssumptions.value.annualValue': 'Annual impactable value', 'methodAssumptions.value.calibrationFactor': 'Calibration factor',
    'methodAssumptions.value.grossMarginPct': 'Gross margin %', 'methodAssumptions.value.sizingStartYear': 'First sizing year',
    'methodAssumptions.allocation': 'Allocation', 'methodAssumptions.totalRoiCutoff': 'ROI cutoff', 'methodAssumptions.cutoff': 'Marginal ROI cutoff',
    'methodAssumptions.roiBasis': 'ROI basis', 'methodAssumptions.stoppingRule': 'Stopping rule', 'methodAssumptions.scenarioMaxCalls': 'Normalization point (calls)',
    'methodAssumptions.minimumBoundary': 'Minimum boundary', 'methodAssumptions.cutoffTie': 'Cutoff tie', 'methodAssumptions.reachAppliesTo': 'Reach applies to',
    'methodAssumptions.maxCallsSource': 'Maximum calls source', 'ui.valueMode': 'Impactable value entry', method: 'Method',
    'methodAssumptions.value.years.forecast': 'Forecast', 'methodAssumptions.value.years.carryoverPct': 'Carryover %',
    'methodAssumptions.value.years.otherChannelPct': 'Other channel %', 'shared.layers': 'Management layers',
    'methodAssumptions.value.years.impactablePct': 'Salesforce-impactable %', 'methodAssumptions.reallocateExcluded': REALLOC_LABEL,
    // v0.5 (CS-1 revised); the same wording source and fallbacks as FSAssist.pathLabel
    'methodAssumptions.value.years.sfPct': SF_LABEL, 'methodAssumptions.value.forecastMode': 'Forecast inputs'
  };
  // FSFields wording wins when present (FSAssist reads the same ASSUMPTION_LABELS keys)
  const AL_KEYS = { 'methodAssumptions.value.years.sfPct': 'sfPct', 'methodAssumptions.value.forecastMode': 'forecastMode' };
  const LAYER_LABELS = { flmSpan: 'first-line manager span', flmCost: 'first-line manager annual cost', slmSpan: 'second-line manager span', slmCost: 'second-line manager annual cost' };
  function basePathLabel(F, path, grain) {
    if (typeof path !== 'string' || !path) return 'Unnamed field';
    const flat = path.replace(/\[[^\]]*\]/g, '');
    if (AL_KEYS[flat] && F.ASSUMPTION_LABELS && typeof F.ASSUMPTION_LABELS[AL_KEYS[flat]] === 'string') return F.ASSUMPTION_LABELS[AL_KEYS[flat]];
    if (AI_PATH_LABELS[flat]) return AI_PATH_LABELS[flat];
    const m = /^segments\.(\w+)$/.exec(flat);
    if (m) { const f = F.SEGMENT_FIELDS.find(x => x.id === m[1]); if (f) return f.label(F.GRAIN[grain] ? grain : 'hcp'); }
    if (/^shared\.layers\./.test(flat)) return AI_PATH_LABELS['shared.layers'];
    const last = flat.split('.').filter(Boolean).pop();
    return last ? humanKey(last) : 'Unnamed field';
  }
  function pathLabel(path, grain, ctx) {
    const F = fields();
    const base = basePathLabel(F, path, grain);
    if (ctx === undefined || ctx === null || typeof path !== 'string') return base;
    const x = typeof ctx === 'object' ? ctx : {};
    const segs = Array.isArray(x.segments) ? x.segments : [];
    const years = Array.isArray(x.years) ? x.years : (x.methodAssumptions && x.methodAssumptions.value && Array.isArray(x.methodAssumptions.value.years) ? x.methodAssumptions.value.years : []);
    let m = /^segments\[(\d+|\*)\]/.exec(path);
    if (m) {
      if (m[1] === '*') return `${base} · all segments`;
      const s = segs[Number(m[1])];
      return `${base} · segment ${s && s.segment !== undefined && s.segment !== null && String(s.segment) !== '' ? txt(s.segment) : Number(m[1]) + 1}`;
    }
    m = /^methodAssumptions\.value\.years\[(\d+)\]/.exec(path);
    if (m) { const y = years[Number(m[1])]; return `${base} · year ${y && isNum(y.year) ? y.year : Number(m[1]) + 1}`; }
    m = /^shared\.layers\.(\w+)$/.exec(path);
    if (m && LAYER_LABELS[m[1]]) return `${base} · ${LAYER_LABELS[m[1]]}`;
    return base;
  }

  // Local text check for AI strings in the export: the banned term is masked (the literal is assembled so it never appears
  // in this file) and AI-authored text in the first person is withheld (INV-8, INV-9).
  const AI_BANNED_RE = new RegExp('fre' + 'quen[A-Za-z]*', 'gi');
  const AI_FIRST_PERSON_RE = /(^|[^A-Za-z'’])(I|I['’](?:ve|m|d|ll))(?![A-Za-z'’])|\b(my|mine|myself)\b/i;
  function aiLint(text) {
    const t = txt(text), hits = [];
    AI_BANNED_RE.lastIndex = 0;
    if (AI_BANNED_RE.test(t)) hits.push('banned-term');
    if (AI_FIRST_PERSON_RE.test(t)) hits.push('first-person');
    return { ok: !hits.length, hits };
  }
  // authored: text written by the (simulated) AI, so first person is not allowed; source quotes are only masked
  function aiStr(v, authored) {
    const t = txt(v).replace(AI_BANNED_RE, '[term withheld]');
    if (authored && AI_FIRST_PERSON_RE.test(t)) return '[text withheld: failed the export wording check (first person)]';
    return t;
  }
  // 'ai-setting' (assistance switched on/off) is not AI content: toggling alone keeps the exact no-AI workbook.
  function isAiExport(a) {
    const scen = Array.isArray(a.scenarios) ? a.scenarios : [];
    const nar = a.narratives && typeof a.narratives === 'object' ? a.narratives : null;
    return scen.some(s => s && s.ai) || (Array.isArray(a.audit) && a.audit.some(e => e && /^ai-/.test(String(e.action)) && e.action !== 'ai-setting')) ||
      !!(nar && Object.keys(nar).some(k => nar[k]));
  }

  const PROV_TEXT = { upstream: 'Upstream', analyst: 'Analyst', def: 'Default', either: 'Analyst or default',
    imported: 'Imported or analyst', calc: 'Calculated', none: 'Not entered' };
  function aiOriginText(vo) {
    const by = txt(vo.decidedBy) || 'an unnamed user';
    return vo.origin === 'ai-edited' ? `AI-proposed, edited by ${by}` : `AI-proposed, accepted by ${by}`;
  }
  // Provenance for the focus scenario's inputs. Absent value origin ⇒ the no-AI semantics the workbook can know.
  function makeProv(F, scenario) {
    const vos = scenario.ai && Array.isArray(scenario.ai.valueOrigins) ? scenario.ai.valueOrigins.filter(v => v && typeof v.path === 'string') : [];
    const mapped = (scenario.provenance && scenario.provenance.mapping) || {};
    const find = paths => { let hit = null; vos.forEach(v => { if (paths.includes(v.path)) hit = v; }); return hit; };   // latest decision wins
    const P = {
      input(path, defaulted) { const v = find([path]); return v ? aiStr(aiOriginText(v)) : (defaulted ? PROV_TEXT.def : PROV_TEXT.either); },
      option(path, changed) { const v = find([path]); return v ? aiStr(aiOriginText(v)) : (changed ? PROV_TEXT.analyst : PROV_TEXT.def); },
      calc: () => PROV_TEXT.calc,
      seg(i, s, fieldId) {
        const v = find([`segments[${i}].${fieldId}`, `segments[*].${fieldId}`]);
        if (v) return aiStr(aiOriginText(v));
        const f = F.SEGMENT_FIELDS.find(x => x.id === fieldId);
        if (!f || f.owner === 'upstream' || fieldId === 'archetype') return PROV_TEXT.upstream;
        return fieldId in mapped ? PROV_TEXT.imported : PROV_TEXT.either;
      },
      year(idx, key) { const v = find([`methodAssumptions.value.years[${idx}].${key}`]); return v ? aiStr(aiOriginText(v)) : PROV_TEXT.either; },
      // [{label, text}] -> "Reach %: AI-proposed, accepted by X; Maximum calls, Minimum calls: Analyst or default"
      group(pairs) {
        const order = [], by = {};
        pairs.forEach(p => { if (!(p.text in by)) { by[p.text] = []; order.push(p.text); } if (!by[p.text].includes(p.label)) by[p.text].push(p.label); });
        return order.map(t => `${by[t].join(', ')}: ${t}`).join('; ');
      }
    };
    return P;
  }
  const OPTION_PATH = { costPerCallMethod: 'shared.costPerCallMethod', fteRounding: 'shared.fteRounding', capacityInput: 'shared.capacityInput.mode',
    carryoverConvention: 'methodAssumptions.value.carryoverConvention', calibrationFactor: 'methodAssumptions.value.calibrationFactor' };
  const optionPath = k => OPTION_PATH[k] || `methodAssumptions.${k}`;

  // Value text for the AI Proposals sheet (text only; option keys shown as their labels).
  const PCT_KEYS = new Set(['reachPct', 'inflationPct', 'discountRatePct', 'grossMarginPct', 'carryoverPct', 'otherChannelPct', 'impactablePct', 'sfPct']);
  const OPTION_GROUP = { costMode: 'costMode', fteRounding: 'fteRounding', mode: 'capacityInput', allocation: 'allocation', roiBasis: 'roiBasis',
    stoppingRule: 'stoppingRule', minimumBoundary: 'minimumBoundary', cutoffTie: 'cutoffTie', reachAppliesTo: 'reachAppliesTo', maxCallsSource: 'maxCallsSource', forecastMode: 'forecastMode' };
  function numText(v) {
    const r = Math.round(v * 1e6) / 1e6;
    const neg = r < 0, s = String(Math.abs(r)), dot = s.indexOf('.');
    const ip = dot < 0 ? s : s.slice(0, dot), fp = dot < 0 ? '' : s.slice(dot);
    return (neg ? '-' : '') + (/e/i.test(s) ? s : ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + fp);
  }
  function aiValueText(F, path, v) {
    if (v === null || v === undefined || v === '') return 'Not set';
    const key = String(path || '').replace(/\[[^\]]*\]/g, '').split('.').pop();
    if (Array.isArray(v)) return v.map(x => aiValueText(F, path, x)).join(', ');
    if (path === 'method') return methodLabel(F, v);
    if (path === 'ui.valueMode') return v === 'chain' ? 'Forecast chain by year' : (v === 'direct' ? 'Annual impactable value entered directly' : aiStr(v));
    if (typeof v === 'number') {
      if (!isFinite(v)) return 'Not set';
      if (key === 'sizingStartYear') return String(v);
      return PCT_KEYS.has(key) ? `${numText(v)}%` : numText(v);
    }
    if (typeof v === 'boolean') return key === 'reallocateExcluded' ? reallocText(F, v) : (v ? 'Yes' : 'No');
    if (typeof v === 'string') {
      const grp = OPTION_GROUP[key];
      if (grp && F.OPTION_LABELS[grp] && F.OPTION_LABELS[grp][v]) return F.OPTION_LABELS[grp][v];
      if (key === 'forecastMode' && MODE_TEXT[v]) return MODE_TEXT[v];
      return aiStr(v);
    }
    if (typeof v === 'object') return Object.keys(v).map(k => `${humanKey(k)}: ${aiValueText(F, `${path}.${k}`, v[k])}`).join('; ');
    return aiStr(v);
  }
  const DECISION = { 'ai-accepted': 'Accepted', 'ai-edited': 'Edited, then accepted' };
  const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' };
  // Source objects for a value origin: on the origin, on snapshot.ai, or in the proposal set passed to the export.
  function sourcesFor(s, vo, sets) {
    const ids = Array.isArray(vo.sourceIds) ? vo.sourceIds.map(String) : [];
    let pool = [];
    if (Array.isArray(vo.sources)) pool = pool.concat(vo.sources);
    if (s.ai && Array.isArray(s.ai.sources)) pool = pool.concat(s.ai.sources);
    const setId = vo.proposalSetId || (s.ai && s.ai.proposalSetId), planId = vo.planId || (s.ai && s.ai.planId);
    (sets || []).forEach(set => {
      if (!set || set.id !== setId) return;
      (set.plans || []).forEach(p => { if (p && p.id === planId && Array.isArray(p.sources)) pool = pool.concat(p.sources); });
    });
    if (!ids.length) return Array.isArray(vo.sources) ? vo.sources.filter(Boolean) : [];
    return ids.map(id => pool.find(x => x && String(x.id) === id) || { id, title: `Source ${id} (details not kept with the scenario)`, locator: '', quote: null, quoteVerified: null });
  }
  function joinSrc(list, fn) {
    if (!list.length) return '';
    const parts = list.map(fn);
    return list.length === 1 ? parts[0] : parts.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }
  function verifiedText(src) {
    if (src.quote === null || src.quote === undefined || src.quote === '') return 'No quote';
    return src.quoteVerified === true ? 'Yes' : (src.quoteVerified === false ? 'No' : 'Not checked');
  }

  function buildAiProposals(scenarios, project, sets) {
    const F = fields();
    const S = new SheetB('AI Proposals');
    const T = v => aiStr(v);
    S.line(['AI Proposals'], ST.TITLE);
    S.line(['Values proposed by Simulated AI and decided by a named user. Text only: no formula reads this sheet, and every number on the calculation sheets comes from the sizing engine. Candidates are not ranked.'], ST.NOTE);
    S.skip();
    const aiScen = scenarios.filter(s => s && s.ai);
    S.line(['Adopted candidate scenarios'], ST.SECTION);
    S.line(['Scenario ID', 'Scenario', 'Version', 'Plan', 'Proposal set', 'Idea', 'Adopted by', 'Adopted at', 'AI-proposed values'], ST.HDR);
    if (!aiScen.length) S.line(['No scenario in this workbook was adopted from an AI candidate.']);
    aiScen.forEach(s => {
      const ai = s.ai, n = Array.isArray(ai.valueOrigins) ? ai.valueOrigins.length : 0;
      S.line([T(s.id), T(s.name), T(s.version), T(ai.planId), T(ai.proposalSetId), aiStr(ai.idea, true), T(ai.adoptedBy), fmtTime(ai.adoptedAt), { v: n, s: ST.INT }]);
    });
    S.skip();
    S.line(['AI-proposed values'], ST.SECTION);
    S.line(['Scenario ID', 'Scenario', 'Plan', 'Idea', 'Field', 'AI value', 'Final value', 'Decision', 'By', 'Role', 'At', 'Confidence',
      'Source title', 'Locator', 'Quote', 'Quote verified'], ST.HDR);
    S.freeze = 0;
    let rows = 0;
    aiScen.forEach(s => {
      const g = ctxFor(s, project).g, inp = s.inputs || {};
      (Array.isArray(s.ai.valueOrigins) ? s.ai.valueOrigins : []).forEach(vo => {
        if (!vo) return;
        const src = sourcesFor(s, vo, sets);
        rows++;
        S.line([T(s.id), T(s.name), T(vo.planId || s.ai.planId), aiStr(s.ai.idea, true), pathLabel(vo.path, g, inp),
          aiValueText(F, vo.path, vo.aiValue), aiValueText(F, vo.path, vo.finalValue), DECISION[vo.origin] || humanKey(vo.origin),
          T(vo.decidedBy), vo.decidedRole ? roleLabel(F, vo.decidedRole) : '', fmtTime(vo.decidedAt), CONFIDENCE[vo.confidence] || humanKey(vo.confidence),
          src.length ? joinSrc(src, x => T(x.title) || 'Untitled source') : 'No source recorded', joinSrc(src, x => T(x.locator) || 'None'),
          joinSrc(src, x => (x.quote === null || x.quote === undefined || x.quote === '' ? 'None' : T(x.quote))), joinSrc(src, verifiedText)]);
      });
    });
    if (!rows && aiScen.length) S.line(['No AI-proposed values were accepted in these scenarios.']);
    S.skip();
    S.line(['Provenance labels (Assumptions sheet)'], ST.SECTION);
    S.line(['Label', 'Meaning'], ST.HDR);
    [['AI-proposed, accepted by <user>', 'Proposed by Simulated AI; the named user accepted the value unchanged.'],
      ['AI-proposed, edited by <user>', 'Proposed by Simulated AI; the named user changed the value before accepting it.'],
      ['Upstream', 'Delivered by Segmentation & Targeting (imported as delivered); read-only, no corrections are possible.'],
      ['Analyst', 'Setting chosen by the analyst that differs from the default (for a Standard method row: a saved scenario that differs from the standard method).'],
      ['Default', 'Module default in use.'],
      ['Analyst or default', 'Entered or kept by the analyst; the workbook does not record whether the value is the module default.'],
      ['Imported or analyst', 'Sizing input read from the uploaded file; the analyst may have edited it after import.'],
      ['Calculated', 'Result of a formula or the sizing engine, not an input.']].forEach(r => S.line(r));
    S.maxW[3] = 40; S.maxW[4] = 40; S.maxW[12] = 40; S.maxW[13] = 30; S.maxW[14] = 60;
    return S;
  }

  const NARRATIVE_KIND = { 'why-result': 'Why this result', comparison: 'How the scenarios differ', 'reviewer-brief': 'Reviewer brief' };
  const NARRATIVE_NOTE = 'Explains calculated outputs; not a calculation. Simulated AI.';
  function buildNarrative(scenarios, narratives) {
    const S = new SheetB('Narrative');
    S.line(['Narrative'], ST.TITLE);
    S.line([NARRATIVE_NOTE], ST.NOTE);
    S.skip();
    S.line(['Scenario ID', 'Scenario', 'Kind', 'Text', 'Bound inputs hash', 'Current inputs hash', 'Status', 'Note'], ST.HDR);
    const nar = narratives && typeof narratives === 'object' ? narratives : {};
    const byId = new Map(scenarios.map(s => [s.id, s]));
    const hashes = new Set(scenarios.map(s => s.result && s.result.inputsHash).filter(Boolean));
    const list = v => {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(Boolean);
      if (typeof v === 'object' && ('text' in v || 'kind' in v)) return [v];
      if (typeof v === 'object') return Object.keys(v).map(k => v[k]).filter(x => x && typeof x === 'object');
      return [];
    };
    const keys = scenarios.map(s => s.id).filter(id => id in nar).concat(Object.keys(nar).filter(k => !byId.has(k)));
    let n = 0;
    keys.forEach(k => {
      const s = byId.get(k);
      list(nar[k]).forEach(x => {
        n++;
        const bound = Array.isArray(x.boundTo) ? x.boundTo.map(txt) : (x.boundTo ? [txt(x.boundTo)] : []);
        const cur = s && s.result ? txt(s.result.inputsHash) : '';
        const current = bound.length > 0 && (s && !Array.isArray(x.boundTo) ? bound[0] === cur : bound.every(h => hashes.has(h)));
        S.line([s ? aiStr(s.id) : '', s ? aiStr(s.name) : 'Across scenarios', NARRATIVE_KIND[x.kind] || humanKey(x.kind) || 'Narrative',
          aiStr(x.text, true), bound.join(', '), s ? cur : Array.from(hashes).join(', '),
          current ? 'Current' : 'Stale: the inputs changed after this text was generated', NARRATIVE_NOTE]);
      });
    });
    if (!n) S.line(['No narratives were generated.']);
    S.minW[3] = 50; S.maxW[3] = 90; S.maxW[7] = 40;
    return S;
  }

  function exportWorkbook(args) {
    const a = args || {};
    const project = a.project || {};
    const scenarios = Array.isArray(a.scenarios) ? a.scenarios : [];
    if (!scenarios.length) throw ioError('EXPORT_NO_SCENARIO', 'There is no scenario to export.');
    const focus = scenarios.find(s => s.id === a.focusScenarioId) || scenarios[0];
    const ai = isAiExport(a);                                     // false ⇒ the workbook is exactly the no-AI workbook
    const c = ctxFor(focus, project);
    /* fs-io 1.1.0 (D-RUN-09): a new-shape scenario records the configuration it was sized with (its responseCurveConfig,
       else args.config). An old-shape scenario (1.10.0 curve inputs, or not Response Curve) was not sized with any uptake
       configuration, so its Configuration sheet reads "No configuration recorded" even when args.config is passed. */
    c.cfg = rcConfigOf(focus, a);
    c.rcRows = curveRowsOf(c);
    if (!c.rcRows) c.cfg = null;
    c.arch = archListOf(c);                                       // FR-47: archetypes from the data (reference list for a 1.10.0-shaped snapshot)
    c.mixArch = c.arch.filter(x => x !== RC_ALL(c.F));            // 'ALL' is a curve, never a share of a segment
    c.exportedAt = a.exportedAt ? new Date(a.exportedAt) : new Date();
    if (ai) c.prov = makeProv(c.F, focus);
    const A = buildAssumptions(c, focus);
    c.A = A;
    const curves = c.method === 'response' ? buildCurves(c, A) : null;   // built first so Detailed Calculations can reference its parameter rows
    const calc = buildCalc(c, A, curves);
    const sheets = [buildSummary(c, focus, project, calc), buildSource(c, focus), A.sheet, calc.sheet];
    if (curves) sheets.push(curves);
    sheets.push(buildComparison(scenarios, project, focus.id, ai), buildDetail(scenarios, project, focus.id, ai), buildFormulas(c), buildAudit(scenarios, focus, a.audit, ai));
    if (ai) sheets.push(buildAiProposals(scenarios, project, Array.isArray(a.proposalSets) ? a.proposalSets : []), buildNarrative(scenarios, a.narratives));
    sheets.push(buildConfiguration(c));                           // fs-io 1.1.0: always last, so every 1.0.0 sheet keeps its position
    return buildXlsx(sheets);
  }

  const FSIO = {
    version: 'fs-io 1.1.0',   // 1.1.0 (2026-10-15, FR-48 proposed): uptake presets in Assumptions, Response Curves and Formula Documentation; new Configuration sheet
    parseFile, detect, applyMapping, exportWorkbook, rankSheets, previewRows,
    exclusionLabel: (method, reason, ctx) => exclusionLabel(fields(), reason, method, ctx),
    pathLabel,
    isAiExport: args => isAiExport(args || {}),
    SHEET_NAMES: SHEETS,
    _internal: {
      inflateRawJS, crc32, zipStore, readZipDirectory, parseCsvText, parseNumber, fieldScore, colName, colIndex,
      setForceJsInflate(v) { FORCE_JS_INFLATE = !!v; }, clean, aiLint, aiValueText: (path, v) => aiValueText(fields(), path, v)
    }
  };
  if (typeof module !== 'undefined') module.exports = FSIO; else root.FSIO = FSIO;
})(this);

;
