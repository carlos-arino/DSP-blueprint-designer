// Genera blueprints de prueba con lo mismo que haría el editor, para comprobarlos en el juego.
// Uso: node tools/make_tests.js  -> Ejemplos/generados/*.txt
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');
require('../js/templates.js');
const T = globalThis.DSPDefaultTemplates;

function make(name, desc) {
  const bp = BP.createEmpty(name);
  bp.header.desc = desc;
  const bs = bp.buildings;
  const add = (itemId, x, y, z = 0, yaw = 0, extra = {}) => {
    const t = T[itemId];
    const b = BP.newBuilding({
      itemId, modelIndex: t.modelIndex, x, y, z, yaw, x2: x, y2: y, z2: z, yaw2: yaw,
      parameters: (t.parameters || []).slice(),
      outputToSlot: t.outputToSlot, inputFromSlot: t.inputFromSlot, outputFromSlot: t.outputFromSlot, inputToSlot: t.inputToSlot,
      ...extra,
    });
    b.index = bs.length; bs.push(b); return b;
  };
  // cadena de cintas por puntos; devuelve [primera, última]
  const belt = (pts, yaw) => {
    const list = pts.map(([x, y], i) => add(2001, x, y, 0, yaw[i] ?? yaw[yaw.length - 1], { inputToSlot: 1 }));
    list.forEach((b, i) => { if (i + 1 < list.length) { b.outputObjIdx = list[i + 1].index; b.outputToSlot = 1; } });
    return list;
  };
  return { bp, add, belt };
}

(async () => {
  const outDir = path.join(__dirname, '..', 'Ejemplos', 'generados');
  fs.mkdirSync(outDir, { recursive: true });

  // 1) Estación con cinta de entrada (norte, hueco 0) y de salida (este, hueco 10),
  //    pila de almacenes con distribuidor encima, y pila de 2 laboratorios.
  {
    const { bp, add, belt } = make('Prueba app: estacion y pilas', 'Generado por DSP Blueprint Designer');
    const st = add(2103, 0, 0);
    const inn = belt([[1, 6], [1, 5], [1, 4], [1, 3], [1, 2.15]], [180]);
    const last = inn[inn.length - 1]; last.outputObjIdx = st.index; last.outputToSlot = 0;
    const out = belt([[2.15, 0], [3, 0], [4, 0], [5, 0], [6, 0]], [90]);
    out[0].inputObjIdx = st.index; out[0].inputFromSlot = 10;
    const s1 = add(2101, 12, 0);
    const s2 = add(2101, 12, 0, 2, 0, { inputObjIdx: s1.index });
    add(2107, 12, 0, 3.87, 0, { inputObjIdx: s2.index });
    const l1 = add(2901, 18, 0);
    add(2901, 18, 0, 3, 0, { inputObjIdx: l1.index });
    add(2201, 9, 3); add(2201, 15, 3);
    BP.normalize(bp);
    fs.writeFileSync(path.join(outDir, 'prueba_app_estacion_pilas.txt'), await BP.stringify(bp));
  }

  // 2) Ensambladoras Mk.II y Mk.III con los modelos supuestos (66 y 67), aparte por si el juego las rechaza.
  {
    const { bp, add } = make('Prueba app: ensambladoras', 'Mk.II modelo 66, Mk.III modelo 67 (supuestos)');
    add(2303, 0, 0); add(2304, 4, 0); add(2305, 8, 0); add(2201, 2, 2); add(2201, 6, 2);
    BP.normalize(bp);
    fs.writeFileSync(path.join(outDir, 'prueba_app_ensambladoras.txt'), await BP.stringify(bp));
  }

  for (const f of fs.readdirSync(outDir)) {
    const bp = await BP.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
    console.log(f, 'hash', bp.hashOk, 'edificios', bp.buildings.length);
  }
})();
