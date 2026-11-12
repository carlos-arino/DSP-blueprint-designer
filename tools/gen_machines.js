// Genera js/machines.js: velocidad y consumo eléctrico de cada edificio.
// Fuente: datos de DSP de factoriolab (public/data/dsp/data.json), descargados con `gh api`.
//   usage: kW trabajando (negativo = genera) · drain: kW en reposo · speed: multiplicador de la receta
// Uso: node tools/gen_machines.js
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
require('../js/items.js');
const IT = globalThis.DSPItems;

// Generadores con combustible: factoriolab no da su potencia (wiki: Thermal Power Plant 2,16 MW,
// Mini Fusion Power Plant 9 MW, Artificial Star 72 MW)
const BURNERS = { 2204: -2160, 2211: -9000, 2210: -72000 };

const raw = execSync('gh api repos/factoriolab/factoriolab/contents/public/data/dsp/data.json -H "Accept: application/vnd.github.raw"',
  { encoding: 'utf8', maxBuffer: 64 << 20 });
const data = JSON.parse(raw);
const byName = new Map(Object.values(IT.BUILDINGS).map((b) => [b.en.toLowerCase(), b.id]));
const out = {}, unmatched = [];
for (const it of data.items) {
  const m = it.machine; if (!m) continue;
  const id = byName.get(it.name.toLowerCase());
  if (!id) { unmatched.push(it.name); continue; }
  const e = {};
  if (m.speed !== undefined) e.speed = m.speed;
  if (m.usage !== undefined) e.work = m.usage;
  if (m.drain !== undefined) e.idle = m.drain;
  if (BURNERS[id] !== undefined) e.work = BURNERS[id];
  out[id] = e;
}
const ROOT = path.join(__dirname, '..');
const lines = Object.entries(out).sort((a, b) => a[0] - b[0])
  .map(([id, e]) => `  ${id}: ${JSON.stringify(e).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},   // ${IT.BUILDINGS[id].en}`);
fs.writeFileSync(path.join(ROOT, 'js', 'machines.js'),
  `/* Velocidad y consumo de los edificios (tools/gen_machines.js, datos de factoriolab).
   speed: multiplicador de la velocidad de la receta · work: kW trabajando (negativo = genera) · idle: kW en reposo */
(typeof window !== 'undefined' ? window : globalThis).DSPMachines = {
${lines.join('\n')}
};
`);
console.log(`${Object.keys(out).length} edificios${unmatched.length ? ' · sin emparejar: ' + unmatched.join(', ') : ''}`);
