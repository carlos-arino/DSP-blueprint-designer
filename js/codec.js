/*
 * Códec de blueprints de Dyson Sphere Program.
 *
 * Formato del texto:
 *   BLUEPRINT:<cabecera separada por comas>"<base64(gzip(binario))>"<MD5F en hex mayúsculas>
 *
 * Cabecera (0.10.x, 15 celdas):
 *   0: '1'  1: layout  2-6: iconos  7: '0'  8: ticks .NET  9: versión del juego
 *   10: nombre (urlencoded)  11-13: vacías  14: descripción (urlencoded)
 *   (formato antiguo: 12 celdas, descripción en la 11)
 *
 * El hash es un MD5 con estado inicial y 7 constantes K modificadas ("MD5F"),
 * calculado sobre todo el texto hasta la comilla final (excluida).
 *
 * Funciona en navegador (window.DSPBP) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- MD5F
  const K = new Uint32Array([
    0xd76aa478, 0xe8d7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304623, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b9f1122, 0xfd987193, 0xa679438e, 0x39b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xc9b6c7aa, 0xd62f105d, 0x02443453, 0xd8a1e681, 0xe7d3fbc8,
    0x21f1cde6, 0xc33707d6, 0xf4d50d87, 0x475a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  function md5f(bytes) {
    const len = bytes.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, (len * 8) >>> 0, true);
    dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefdcab89, c0 = 0x98badcfe, d0 = 0x10325746;
    const M = new Uint32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        const s = S[(i >> 4) * 4 + (i & 3)];
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new DataView(new ArrayBuffer(16));
    [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
    let hex = '';
    for (let i = 0; i < 16; i++) hex += out.getUint8(i).toString(16).padStart(2, '0');
    return hex.toUpperCase();
  }

  // ---------------------------------------------------------------- utilidades
  function strToLatin1(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  }
  function b64decode(s) {
    const bin = atob(s);
    return strToLatin1(bin);
  }
  function b64encode(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  async function streamAll(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  const gunzip = (b) => streamAll(b, new DecompressionStream('gzip'));
  const gzip = (b) => streamAll(b, new CompressionStream('gzip'));

  // Codificación tipo Uri.EscapeDataString (también escapa !'()*)
  function escapeData(s) {
    return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }
  function unescapeData(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  // Ticks .NET (100 ns desde 0001-01-01) <-> Date
  const EPOCH_TICKS = 621355968000000000n;
  function ticksToDate(t) {
    try { return new Date(Number((BigInt(t) - EPOCH_TICKS) / 10000n)); } catch (e) { return null; }
  }
  function nowTicks() {
    return (BigInt(Date.now()) * 10000n + EPOCH_TICKS).toString();
  }

  // ---------------------------------------------------------------- lector/escritor binario
  class Reader {
    constructor(bytes) { this.b = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.o = 0; }
    i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
    u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
    i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
    i32() { const v = this.dv.getInt32(this.o, true); this.o += 4; return v; }
    f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
    get left() { return this.b.length - this.o; }
  }
  class Writer {
    constructor() { this.buf = new Uint8Array(1 << 16); this.dv = new DataView(this.buf.buffer); this.o = 0; }
    ensure(n) {
      if (this.o + n <= this.buf.length) return;
      let sz = this.buf.length * 2; while (sz < this.o + n) sz *= 2;
      const nb = new Uint8Array(sz); nb.set(this.buf); this.buf = nb; this.dv = new DataView(nb.buffer);
    }
    i8(v) { this.ensure(1); this.dv.setInt8(this.o, v); this.o += 1; }
    u8(v) { this.ensure(1); this.dv.setUint8(this.o, v); this.o += 1; }
    i16(v) { this.ensure(2); this.dv.setInt16(this.o, v, true); this.o += 2; }
    i32(v) { this.ensure(4); this.dv.setInt32(this.o, v, true); this.o += 4; }
    f32(v) { this.ensure(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
    bytes(b) { this.ensure(b.length); this.buf.set(b, this.o); this.o += b.length; }
    result() { return this.buf.slice(0, this.o); }
  }

  // ---------------------------------------------------------------- edificios
  const BELTS = new Set([2001, 2002, 2003]);
  const SORTERS = new Set([2011, 2012, 2013, 2014]);
  // En el formato -102 el número de floats de posición depende del tipo de edificio
  function posFormat(itemId) {
    if (SORTERS.has(itemId)) return 'full';
    if (BELTS.has(itemId)) return 'belt';
    return 'basic';
  }

  function readBuilding(r) {
    const first = r.i32();
    const b = { magic: first };
    if (first === -102) {
      b.index = r.i32();
      b.itemId = r.i16();
      b.modelIndex = r.i16();
      b.areaIndex = r.i8();
      b.x = r.f32(); b.y = r.f32(); b.z = r.f32(); b.yaw = r.f32();
      const fmt = posFormat(b.itemId);
      if (fmt === 'full') {
        b.tilt = r.f32(); b.pitch = r.f32();
        b.x2 = r.f32(); b.y2 = r.f32(); b.z2 = r.f32(); b.yaw2 = r.f32(); b.tilt2 = r.f32(); b.pitch2 = r.f32();
      } else {
        b.tilt = fmt === 'belt' ? r.f32() : 0; b.pitch = 0;
        b.x2 = b.x; b.y2 = b.y; b.z2 = b.z; b.yaw2 = b.yaw; b.tilt2 = b.tilt; b.pitch2 = 0;
      }
    } else {
      // Formatos antiguos: v1 (sin magic), -100 (añade tilt), -101 (añade pitch/tilt2/pitch2)
      b.index = first <= -100 ? r.i32() : first;
      b.areaIndex = r.i8();
      b.x = r.f32(); b.y = r.f32(); b.z = r.f32();
      b.x2 = r.f32(); b.y2 = r.f32(); b.z2 = r.f32();
      b.yaw = r.f32(); b.yaw2 = r.f32();
      b.tilt = first <= -100 ? r.f32() : 0;
      if (first <= -101) { b.pitch = r.f32(); b.tilt2 = r.f32(); b.pitch2 = r.f32(); }
      else { b.pitch = 0; b.tilt2 = b.tilt; b.pitch2 = 0; }
      b.itemId = r.i16();
      b.modelIndex = r.i16();
    }
    b.outputObjIdx = r.i32();
    b.inputObjIdx = r.i32();
    b.outputToSlot = r.i8();
    b.inputFromSlot = r.i8();
    b.outputFromSlot = r.i8();
    b.inputToSlot = r.i8();
    b.outputOffset = r.i8();
    b.inputOffset = r.i8();
    b.recipeId = r.i16();
    b.filterId = r.i16();
    const n = r.i16();
    b.parameters = [];
    for (let i = 0; i < n; i++) b.parameters.push(r.i32());
    b.extra = first === -102 ? r.i32() : 0;
    return b;
  }

  function writeBuilding(w, b) {
    const magic = b.magic;
    if (magic === -102) {
      w.i32(-102); w.i32(b.index); w.i16(b.itemId); w.i16(b.modelIndex); w.i8(b.areaIndex);
      w.f32(b.x); w.f32(b.y); w.f32(b.z); w.f32(b.yaw);
      const fmt = posFormat(b.itemId);
      if (fmt === 'full') {
        w.f32(b.tilt); w.f32(b.pitch);
        w.f32(b.x2); w.f32(b.y2); w.f32(b.z2); w.f32(b.yaw2); w.f32(b.tilt2); w.f32(b.pitch2);
      } else if (fmt === 'belt') {
        w.f32(b.tilt);
      }
    } else {
      if (magic <= -100) { w.i32(magic); w.i32(b.index); } else w.i32(b.index);
      w.i8(b.areaIndex);
      w.f32(b.x); w.f32(b.y); w.f32(b.z); w.f32(b.x2); w.f32(b.y2); w.f32(b.z2);
      w.f32(b.yaw); w.f32(b.yaw2);
      if (magic <= -100) w.f32(b.tilt);
      if (magic <= -101) { w.f32(b.pitch); w.f32(b.tilt2); w.f32(b.pitch2); }
      w.i16(b.itemId); w.i16(b.modelIndex);
    }
    w.i32(b.outputObjIdx); w.i32(b.inputObjIdx);
    w.i8(b.outputToSlot); w.i8(b.inputFromSlot); w.i8(b.outputFromSlot); w.i8(b.inputToSlot);
    w.i8(b.outputOffset); w.i8(b.inputOffset);
    w.i16(b.recipeId); w.i16(b.filterId);
    w.i16(b.parameters.length);
    for (const p of b.parameters) w.i32(p);
    if (magic === -102) w.i32(b.extra || 0);
  }

  // ---------------------------------------------------------------- binario completo
  function decodeBinary(bytes) {
    const r = new Reader(bytes);
    const d = {};
    d.version = r.i32();
    d.cursorOffset = { x: r.i32(), y: r.i32() };
    d.cursorTargetArea = r.i32();
    d.dragBoxSize = { x: r.i32(), y: r.i32() };
    d.primaryAreaIdx = r.i32();
    const na = r.u8();
    d.areas = [];
    for (let i = 0; i < na; i++) {
      d.areas.push({
        index: r.i8(), parentIndex: r.i8(), tropicAnchor: r.i16(), areaSegments: r.i16(),
        anchorLocalOffset: { x: r.i16(), y: r.i16() }, size: { x: r.i16(), y: r.i16() },
      });
    }
    const nb = r.i32();
    d.buildings = [];
    for (let i = 0; i < nb; i++) d.buildings.push(readBuilding(r));
    // Datos finales (0.10.x escribe 01 00000000). Se conservan tal cual.
    d.trailer = Array.from(bytes.subarray(r.o));
    return d;
  }

  function encodeBinary(d) {
    const w = new Writer();
    w.i32(d.version);
    w.i32(d.cursorOffset.x); w.i32(d.cursorOffset.y);
    w.i32(d.cursorTargetArea);
    w.i32(d.dragBoxSize.x); w.i32(d.dragBoxSize.y);
    w.i32(d.primaryAreaIdx);
    w.u8(d.areas.length);
    for (const a of d.areas) {
      w.i8(a.index); w.i8(a.parentIndex); w.i16(a.tropicAnchor); w.i16(a.areaSegments);
      w.i16(a.anchorLocalOffset.x); w.i16(a.anchorLocalOffset.y); w.i16(a.size.x); w.i16(a.size.y);
    }
    w.i32(d.buildings.length);
    for (const b of d.buildings) writeBuilding(w, b);
    w.bytes(Uint8Array.from(d.trailer || []));
    return w.result();
  }

  // ---------------------------------------------------------------- texto completo
  const PREFIX = 'BLUEPRINT:';
  const tr = (k, fb) => (root.DSPI18n ? root.DSPI18n.t(k) : fb);

  async function parse(text) {
    text = text.trim();
    if (!text.startsWith(PREFIX)) throw new Error(tr('codec.prefix', 'The text does not start with BLUEPRINT:'));
    const q1 = text.indexOf('"');
    const q2 = text.lastIndexOf('"');
    if (q1 < 0 || q2 <= q1) throw new Error(tr('codec.quotes', 'Wrong format: the quotes are missing'));
    const hash = text.substring(q2 + 1);
    const computed = md5f(strToLatin1(text.substring(0, q2)));
    const cells = text.substring(PREFIX.length, q1).split(',');
    if (cells.length < 12) throw new Error(tr('codec.header', 'Incomplete header'));
    const raw = await gunzip(b64decode(text.substring(q1 + 1, q2)));
    const bp = decodeBinary(raw);
    bp.header = {
      cells,
      layout: parseInt(cells[1], 10),
      icons: cells.slice(2, 7).map((v) => parseInt(v, 10) || 0),
      time: cells[8],
      gameVersion: cells[9],
      shortDesc: unescapeData(cells[10]),
      desc: unescapeData(cells[cells.length - 1]),
    };
    bp.hashOk = hash.toUpperCase() === computed;
    bp.rawBinary = raw;
    return bp;
  }

  function buildHeader(h) {
    let cells = h.cells ? h.cells.slice() : ['1', '10', '0', '0', '0', '0', '0', '0', '0', '0.10.35.29151', '', '', '', '', ''];
    cells[1] = String(h.layout);
    for (let i = 0; i < 5; i++) cells[2 + i] = String(h.icons[i] || 0);
    cells[8] = h.time || nowTicks();
    cells[9] = h.gameVersion || cells[9];
    cells[10] = escapeData(h.shortDesc || '');
    cells[cells.length - 1] = escapeData(h.desc || '');
    return cells.join(',');
  }

  async function stringify(bp) {
    const bin = encodeBinary(bp);
    const body = PREFIX + buildHeader(bp.header) + '"' + b64encode(await gzip(bin));
    return body + '"' + md5f(strToLatin1(body));
  }

  function createEmpty(name) {
    return {
      header: {
        cells: null, layout: 10, icons: [0, 0, 0, 0, 0], time: nowTicks(),
        gameVersion: '0.10.35.29151', shortDesc: name || 'Nuevo', desc: '',
      },
      version: 2,
      cursorOffset: { x: 0, y: 0 }, cursorTargetArea: 0, dragBoxSize: { x: 1, y: 1 }, primaryAreaIdx: 0,
      areas: [{ index: 0, parentIndex: -1, tropicAnchor: 0, areaSegments: 200, anchorLocalOffset: { x: 0, y: 0 }, size: { x: 1, y: 1 } }],
      buildings: [],
      trailer: [1, 0, 0, 0, 0],
      hashOk: true,
    };
  }

  function newBuilding(props) {
    return Object.assign({
      magic: -102, index: 0, itemId: 0, modelIndex: 0, areaIndex: 0,
      x: 0, y: 0, z: 0, yaw: 0, tilt: 0, pitch: 0, x2: 0, y2: 0, z2: 0, yaw2: 0, tilt2: 0, pitch2: 0,
      outputObjIdx: -1, inputObjIdx: -1, outputToSlot: 0, inputFromSlot: 0, outputFromSlot: 0, inputToSlot: 0,
      outputOffset: 0, inputOffset: 0, recipeId: 0, filterId: 0, parameters: [], extra: 0,
    }, props);
  }

  /**
   * Prepara el blueprint para exportar: renumera índices, recalcula límites
   * (solo con una única área) y desplaza todo para que empiece en (0,0).
   */
  function normalize(bp, opts) {
    opts = opts || {};
    const bs = bp.buildings;
    bs.forEach((b, i) => { b.index = i; });
    if (bs.length === 0 || bp.areas.length !== 1 || opts.keepBounds) return bp;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bs) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
    }
    const sx = Math.round(minX), sy = Math.round(minY);
    if (sx !== 0 || sy !== 0) {
      for (const b of bs) { b.x -= sx; b.x2 -= sx; b.y -= sy; b.y2 -= sy; }
    }
    const w = Math.max(1, Math.round(maxX - minX) + 1);
    const h = Math.max(1, Math.round(maxY - minY) + 1);
    bp.areas[0].size = { x: w, y: h };
    bp.dragBoxSize = { x: w, y: h };
    bp.cursorOffset = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
    return bp;
  }

  const api = {
    md5f, parse, stringify, decodeBinary, encodeBinary, createEmpty, newBuilding, normalize,
    ticksToDate, nowTicks, posFormat, BELTS, SORTERS, strToLatin1,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DSPBP = api;
})(typeof window !== 'undefined' ? window : globalThis);
