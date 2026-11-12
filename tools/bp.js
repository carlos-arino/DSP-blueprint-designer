#!/usr/bin/env node
// Herramienta de línea de comandos para blueprints de DSP (pensada también para IAs que editan archivos).
//
//   node tools/bp.js decode  BP.txt  [salida.json]   blueprint → JSON legible (con nombres de edificios)
//   node tools/bp.js encode  BP.json [salida.txt]    JSON → blueprint (hash recalculado)
//   node tools/bp.js check   BP.txt|BP.json          hash, choques, clasificadores sueltos y suministro
//   node tools/bp.js info    BP.txt|BP.json          resumen por tipo de edificio, balance por minuto y potencia
//   node tools/bp.js sim     BP.txt|BP.json [--open] simulación de flujo: máquinas por debajo del 100 %, entradas y salidas
//
// En el JSON, cada edificio lleva "_name" (solo informativo; se ignora al codificar). Las conexiones son índices
// en la lista "buildings": si borras o reordenas edificios, ajusta outputObjIdx/inputObjIdx (o usa -1).
// Ver API.md para el significado de cada campo.
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');
for (const f of ['recipes', 'items', 'geometry', 'shapes', 'machines']) require(`../js/${f}.js`);
const COL = require('../js/collision.js').make(globalThis.DSPGeometry, globalThis.DSPItems);
const IT = globalThis.DSPItems;
const PR = require('../js/props.js');
const RT = require('../js/rates.js');
const FL = require('../js/flow.js');
const SM = require('../js/sim.js');

const name = (id) => (IT.BUILDINGS[id] ? IT.BUILDINGS[id].en : IT.itemName(id));

async function read(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const j = JSON.parse(text);
    j.buildings = j.buildings.map((b, i) => {
      const c = { ...b }; delete c._name; delete c._props; c.index = i;
      if (b.props) { PR.write(c, b.props); delete c.props; }   // "props": cambios legibles (ver js/props.js)
      return c;
    });
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
    const j = { ...bp, buildings: bp.buildings.map((b) => { const p = PR.read(b); return { _name: name(b.itemId), ...(p ? { _props: p } : {}), ...b }; }) };
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
    // suministro: a cada máquina le llega lo que pide su receta; mezclas en cintas (no cambia el código de salida)
    const iss = FL.analyze(bs).issues, err = iss.filter((x) => x.level === 'error');
    console.log(`suministro: ${err.length} errores, ${iss.length - err.length} avisos`);
    for (const x of [...err, ...iss.filter((x) => x.level !== 'error')].slice(0, 40)) console.log(`  ${x.level === 'error' ? '✗' : '!'} #${x.i} ${name(bs[x.i].itemId)}: ${x.msg}`);
    process.exit(pairs.length || loose.length || badRef.length ? 2 : 0);
  } else if (cmd === 'info') {
    const c = new Map();
    for (const b of bp.buildings) c.set(b.itemId, (c.get(b.itemId) || 0) + 1);
    console.log(`${bp.header.shortDesc || '(sin nombre)'} · ${bp.buildings.length} edificios`);
    for (const [id, n] of [...c].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name(id)} (${id})`);
    // balance por minuto (máquinas sin parar, sin proliferador) y potencia
    const t = RT.totals(bp.buildings), f = (v) => (Math.round(v * 100) / 100).toString().padStart(9);
    const kw = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${v.toFixed(1)} kW`);
    if (t.items.length) {
      console.log(`
Balance por minuto (${t.machines} máquinas)        entra      sale      neto`);
      for (const [id, i, o] of t.items) console.log(`  ${name(id).padEnd(34).slice(0, 34)}${f(i)} ${f(o)} ${f(o - i)}`);
    }
    console.log(`
Consumo: ${kw(t.work)} trabajando · ${kw(t.idle)} en reposo${t.gen ? ` · genera ${kw(t.gen)}` : ''}`);
    if (t.notes.length) console.log(t.notes.join(' · '));
  } else if (cmd === 'sim') {
    // simulación de flujo en régimen estable (--open: las cintas sin salida retiran lo que llega)
    const bs = bp.buildings, r = SM.run(bs, { openEnds: process.argv.includes('--open') });
    const f = (v) => String(Math.round(v * 10) / 10), sumUp = (m) => { const o = {}; for (const v of m.values()) for (const k in v) o[k] = (o[k] || 0) + v[k]; return o; };
    const ms = [...r.machines], slow = ms.filter(([, m]) => m.r <= 0.995).sort((a, b) => a[1].r - b[1].r);
    const why = { input: 'le falta', sorter: 'clasificadores no dan abasto con', output: 'no le sacan' };
    console.log(`${ms.length - slow.length} de ${ms.length} máquinas al 100 % · ${r.iterations} vueltas${r.converged ? '' : ' (sin estabilizar)'}`);
    for (const [i, m] of slow.slice(0, 60)) console.log(`  ${String(Math.floor(m.r * 100)).padStart(3)} %  #${i} ${name(bs[i].itemId)}: ${m.limit.kind !== 'none' ? why[m.limit.kind] + ' ' + IT.itemName(m.limit.item) : ''}`);
    for (const j of r.jams.slice(0, 20)) console.log(`  atasco en la cinta #${j.i}: sobran ${f(j.rate)}/min de ${IT.itemName(j.item)}`);
    const show = (t, o) => { console.log(t); for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1])) console.log(`  ${IT.itemName(+k).padEnd(34)} ${f(v).padStart(8)}/min`); };
    show('Entra:', sumUp(r.sources)); show('Sale:', sumUp(r.sinks));
  } else {
    console.error(`Orden desconocida: ${cmd}`); process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
