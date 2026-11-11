#!/usr/bin/env node
// Herramienta de línea de comandos para blueprints de DSP (pensada también para IAs que editan archivos).
//
//   node tools/bp.js decode  BP.txt  [salida.json]   blueprint → JSON legible (con nombres de edificios)
//   node tools/bp.js encode  BP.json [salida.txt]    JSON → blueprint (hash recalculado)
//   node tools/bp.js check   BP.txt|BP.json          hash, choques y clasificadores sueltos
//   node tools/bp.js info    BP.txt|BP.json          resumen por tipo de edificio
//
// En el JSON, cada edificio lleva "_name" (solo informativo; se ignora al codificar). Las conexiones son índices
// en la lista "buildings": si borras o reordenas edificios, ajusta outputObjIdx/inputObjIdx (o usa -1).
// Ver API.md para el significado de cada campo.
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');
for (const f of ['recipes', 'items', 'geometry', 'shapes']) require(`../js/${f}.js`);
const COL = require('../js/collision.js').make(globalThis.DSPGeometry, globalThis.DSPItems);
const IT = globalThis.DSPItems;

const name = (id) => (IT.BUILDINGS[id] ? IT.BUILDINGS[id].en : IT.itemName(id));

async function read(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const j = JSON.parse(text);
    j.buildings = j.buildings.map((b, i) => { const c = { ...b }; delete c._name; c.index = i; return c; });
    return j;
  }
  const bp = await BP.parse(text.trim());
  delete bp.rawBinary;
  return bp;
}
const out = (data, file) => (file ? fs.writeFileSync(file, data) : process.stdout.write(data + '\n'));

(async () => {
  const [cmd, file, dest] = process.argv.slice(2);
  if (!cmd || !file) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(1);
  }
  const bp = await read(file);
  if (cmd === 'decode') {
    const j = { ...bp, buildings: bp.buildings.map((b) => ({ _name: name(b.itemId), ...b })) };
    out(JSON.stringify(j, null, 1), dest);
  } else if (cmd === 'encode') {
    out(await BP.stringify(bp), dest);
  } else if (cmd === 'check') {
    const bs = bp.buildings, pairs = COL.find(bs);
    const loose = bs.filter((b) => BP.SORTERS.has(b.itemId) && (!bs[b.inputObjIdx] || !bs[b.outputObjIdx]));
    const badRef = bs.filter((b) => (b.outputObjIdx >= bs.length) || (b.inputObjIdx >= bs.length));
    console.log(`hash: ${bp.hashOk === false ? 'NO coincidía' : 'ok'} · edificios: ${bs.length}`);
    console.log(`choques: ${pairs.length}`);
    for (const [a, b] of pairs.slice(0, 20)) console.log(`  #${bs.indexOf(a)} ${name(a.itemId)} (${a.x},${a.y}) ↔ #${bs.indexOf(b)} ${name(b.itemId)} (${b.x},${b.y})`);
    console.log(`clasificadores sueltos: ${loose.length}${loose.length ? ' → ' + loose.map((b) => '#' + bs.indexOf(b)).join(' ') : ''}`);
    if (badRef.length) console.log(`conexiones a índices que no existen: ${badRef.map((b) => '#' + bs.indexOf(b)).join(' ')}`);
    process.exit(pairs.length || loose.length || badRef.length ? 2 : 0);
  } else if (cmd === 'info') {
    const c = new Map();
    for (const b of bp.buildings) c.set(b.itemId, (c.get(b.itemId) || 0) + 1);
    console.log(`${bp.header.shortDesc || '(sin nombre)'} · ${bp.buildings.length} edificios`);
    for (const [id, n] of [...c].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name(id)} (${id})`);
  } else {
    console.error(`Orden desconocida: ${cmd}`); process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
