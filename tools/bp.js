#!/usr/bin/env node
// Command line tool for DSP blueprints (also meant for AIs that edit files).
//
//   node tools/bp.js decode  BP.txt  [out.json]      blueprint → readable JSON (with building names)
//   node tools/bp.js encode  BP.json [out.txt]       JSON → blueprint (hash recalculated)
//   node tools/bp.js check   BP.txt|BP.json          hash, collisions, loose sorters and supply
//   node tools/bp.js info    BP.txt|BP.json          count per building type, balance per minute and power
//   node tools/bp.js sim     BP.txt|BP.json [--open] flow simulation: machines below 100 %, inputs and outputs
//
// In the JSON, each building has "_name" (informative only; ignored when encoding). Connections are indices
// in the "buildings" list: if you delete or reorder buildings, fix outputObjIdx/inputObjIdx (or use -1).
// See API.md for the meaning of each field. Messages are in English; DSPBP_LANG=es gives Spanish names and messages.
const fs = require('fs'), path = require('path');
require('../js/i18n.js');
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
      if (b.props) { PR.write(c, b.props); delete c.props; }   // "props": readable changes (see js/props.js)
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
    console.log(`hash: ${bp.hashOk === false ? 'did NOT match' : 'ok'} · buildings: ${bs.length}`);
    console.log(`collisions: ${pairs.length}`);
    for (const [a, b] of pairs.slice(0, 20)) console.log(`  #${bs.indexOf(a)} ${name(a.itemId)} (${a.x},${a.y}) ↔ #${bs.indexOf(b)} ${name(b.itemId)} (${b.x},${b.y})`);
    console.log(`loose sorters: ${loose.length}${loose.length ? ' → ' + loose.map((b) => '#' + bs.indexOf(b)).join(' ') : ''}`);
    if (badRef.length) console.log(`connections to indices that do not exist: ${badRef.map((b) => '#' + bs.indexOf(b)).join(' ')}`);
    // supply: each machine gets what its recipe needs; mixes on belts (does not change the exit code)
    const iss = FL.analyze(bs).issues, err = iss.filter((x) => x.level === 'error');
    console.log(`supply: ${err.length} errors, ${iss.length - err.length} warnings`);
    for (const x of [...err, ...iss.filter((x) => x.level !== 'error')].slice(0, 40)) console.log(`  ${x.level === 'error' ? '✗' : '!'} #${x.i} ${name(bs[x.i].itemId)}: ${x.msg}`);
    process.exit(pairs.length || loose.length || badRef.length ? 2 : 0);
  } else if (cmd === 'info') {
    const c = new Map();
    for (const b of bp.buildings) c.set(b.itemId, (c.get(b.itemId) || 0) + 1);
    console.log(`${bp.header.shortDesc || '(unnamed)'} · ${bp.buildings.length} buildings`);
    for (const [id, n] of [...c].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name(id)} (${id})`);
    // balance per minute (machines non-stop, no proliferator) and power
    const t = RT.totals(bp.buildings), f = (v) => (Math.round(v * 100) / 100).toString().padStart(9);
    const kw = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${v.toFixed(1)} kW`);
    if (t.items.length) {
      console.log(`
Balance per minute (${t.machines} machines)           in       out       net`);
      for (const [id, i, o] of t.items) console.log(`  ${name(id).padEnd(34).slice(0, 34)}${f(i)} ${f(o)} ${f(o - i)}`);
    }
    console.log(`
Power: ${kw(t.work)} working · ${kw(t.idle)} idle${t.gen ? ` · generates ${kw(t.gen)}` : ''}`);
    if (t.notes.length) console.log(t.notes.join(' · '));
  } else if (cmd === 'sim') {
    // steady-state flow simulation (--open: belts with no exit remove what reaches them)
    const bs = bp.buildings, r = SM.run(bs, { openEnds: process.argv.includes('--open') });
    const f = (v) => String(Math.round(v * 10) / 10), sumUp = (m) => { const o = {}; for (const v of m.values()) for (const k in v) o[k] = (o[k] || 0) + v[k]; return o; };
    const ms = [...r.machines], slow = ms.filter(([, m]) => m.r <= 0.995).sort((a, b) => a[1].r - b[1].r);
    const why = { input: 'missing', sorter: 'sorters cannot keep up with', output: 'nothing takes out' };
    console.log(`${ms.length - slow.length} of ${ms.length} machines at 100 % · ${r.iterations} rounds${r.converged ? '' : ' (not settled)'}`);
    for (const [i, m] of slow.slice(0, 60)) console.log(`  ${String(Math.floor(m.r * 100)).padStart(3)} %  #${i} ${name(bs[i].itemId)}: ${m.limit.kind !== 'none' ? why[m.limit.kind] + ' ' + IT.itemName(m.limit.item) : ''}`);
    for (const j of r.jams.slice(0, 20)) console.log(`  jam on belt #${j.i}: ${f(j.rate)}/min of ${IT.itemName(j.item)} left over`);
    const show = (t, o) => { console.log(t); for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1])) console.log(`  ${IT.itemName(+k).padEnd(34)} ${f(v).padStart(8)}/min`); };
    show('In:', sumUp(r.sources)); show('Out:', sumUp(r.sinks));
  } else {
    console.error(`Unknown command: ${cmd}`); process.exit(1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
