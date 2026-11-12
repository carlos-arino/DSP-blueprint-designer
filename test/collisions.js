// Comprueba que los blueprints de Ejemplos/ no dan avisos de choque.
// Uso: node test/collisions.js [carpeta]
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');
require('../js/items.js'); require('../js/geometry.js'); require('../js/shapes.js');
const COL = require('../js/collision.js').make(globalThis.DSPGeometry, globalThis.DSPItems);
const name = (id) => globalThis.DSPItems.itemName(id);
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.txt') ? [path.join(d, e.name)] : []); }
(async () => {
  const dir = process.argv[2] || path.join(__dirname, '..', 'Ejemplos');
  let total = 0;
  for (const f of walk(dir)) {
    const bp = await BP.parse(fs.readFileSync(f, 'utf8'));
    const pairs = COL.find(bp.buildings);
    total += pairs.length;
    console.log(`${pairs.length ? 'CHOQUE' : 'OK    '} ${path.relative(dir, f)}  ${pairs.length}`);
    for (const [a, b] of pairs.slice(0, 8)) console.log(`   ${name(a.itemId)} (${a.x.toFixed(2)},${a.y.toFixed(2)}) yaw ${Math.round(a.yaw)} ↔ ${name(b.itemId)} (${b.x.toFixed(2)},${b.y.toFixed(2)}) yaw ${Math.round(b.yaw)}  dz=${(a.z - b.z).toFixed(2)}`);
  }
  // casos sintéticos: deben chocar / no chocar
  const mk = (itemId, x, y, yaw = 0, z = 0) => ({ itemId, x, y, yaw, z });
  const cases = [
    ['ensambladoras pegadas (3)', mk(2303, 0, 0), mk(2303, 3, 0), true],
    ['ensambladoras con hueco (4)', mk(2303, 0, 0), mk(2303, 4, 0), false],
    ['Tesla en el hueco', mk(2303, 0, 0), mk(2201, 2, 0), false],
    ['cinta pegada a ensambladora', mk(2303, 0, 0), mk(2001, 2, 0), false],
    ['cinta dentro de ensambladora', mk(2303, 0, 0), mk(2001, 1, 0), true],
    ['hornos pegados (3)', mk(2302, 0, 0), mk(2302, 3, 0), false],
    ['hornos solapados (2)', mk(2302, 0, 0), mk(2302, 2, 0), true],
    ['cinta bajo divisor', mk(2020, 0, 0), mk(2001, 0, 0), false],
    ['almacén sobre divisor', mk(2020, 0, 0), mk(2101, 0, 0, 0, 1.3), false],
    ['Tesla en la esquina de la estación', mk(2103, 0, 0), mk(2201, 3, 3), false],
    ['Tesla dentro de la estación', mk(2103, 0, 0), mk(2201, 2, 3), true],
    ['cinta por el carril del puerto', mk(2103, 0, 0), mk(2001, 1, 3), false],
    ['cinta fuera de carril dentro de la base', mk(2103, 0, 0), mk(2001, 2, 3), true],
    ['cinta pegada al borde', mk(2103, 0, 0), mk(2001, 4, 2), false],
    ['cinta por la fila de munición de la torreta', mk(3005, 0, 0), mk(2001, 1, 0), false],
    ['cinta por otra fila de la torreta', mk(3005, 0, 0), mk(2001, 0, 1), true],
    ['cinta por el carril del intercambiador', mk(2209, 0, 0), mk(2001, 0, 1), false],
    ['cinta fuera del carril del intercambiador', mk(2209, 0, 0), mk(2001, 1, 1), true],
    ['cinta elevada sobre ensambladora', mk(2303, 0, 0), mk(2001, 1, 0, 0, 1), true],
    ['cinta elevada sobre estación (carril de suelo)', mk(2103, 0, 0), mk(2001, 1, 3, 0, 1), true],
    ['pulverizador: producto a nivel 0 por el centro', mk(2313, 0, 0), mk(2001, 0, 1), false],
    ['pulverizador: proliferador a nivel 1 por su fila', mk(2313, 0, 0), mk(2001, 0, -1, 0, 1), false],
    ['pulverizador: cinta a nivel 1 por otra fila', mk(2313, 0, 0), mk(2001, 0, 1, 0, 1), true],
    ['escudo (rombo): cinta en la esquina', mk(3008, 0, 0), mk(2001, 2, 2), false],
    ['escudo (rombo): cinta en la punta', mk(3008, 0, 0), mk(2001, 2, 0), true],
    ['torre de señal (cruz): cinta en la esquina', mk(3007, 0, 0), mk(2001, 2, 1), false],
  ];
  // clasificadores que dejan en el mismo punto de la cinta
  const so = (x, y, x2, y2, fromBelt) => ({ itemId: 2011, x, y, x2, y2, z: 0, z2: 0, yaw: 0, inputFromSlot: fromBelt ? -1 : 1, outputToSlot: fromBelt ? 7 : -1 });
  const sameSpot = COL.find([so(1, 6.79, 1, 8), so(1, 9.21, 1, 8)]).length === 1;
  const apart = COL.find([so(1, 6.79, 1, 8), so(1.86, 9.2, 1.86, 8)]).length === 0;
  console.log(`${sameSpot ? 'OK    ' : 'FALLO '} dos clasificadores en el mismo punto de la cinta: choca`);
  console.log(`${apart ? 'OK    ' : 'FALLO '} desplazados 0,86 (hueco 6): no choca`);
  if (!sameSpot || !apart) total++;
  for (const [label, a, b, want] of cases) {
    const got = COL.collides(a, b);
    if (got !== want) total++;
    console.log(`${got === want ? 'OK    ' : 'FALLO '} ${label}: ${got ? 'choca' : 'no choca'}`);
  }
  process.exit(total ? 1 : 0);
})();
