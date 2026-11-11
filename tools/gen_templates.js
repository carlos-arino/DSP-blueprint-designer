// Genera js/templates.js: plantilla por edificio (modelo, parámetros y huecos por defecto)
// sacada de los blueprints de Ejemplos/. Uso: node tools/gen_templates.js
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');

// Variantes iguales a otro edificio salvo el modelo (modelos de huww98/dsp_blueprint_editor, itemsData.ts)
const CLONES = {
  2304: [2303, 66], 2305: [2303, 67], 2318: [2303, 456],   // ensambladoras Mk.II, Mk.III, recompositora
  2315: [2302, 194], 2319: [2302, 457],                    // horno de plano, horno de negentropía
  2317: [2309, 376],                                       // planta química cuántica
  2902: [2901, 455],                                       // laboratorio autoevolutivo
  2003: [2002, 37],                                        // cinta Mk.III
  2014: [2013, 483],                                       // clasificador apilador
};

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.txt') ? [path.join(d, e.name)] : []);
}

(async () => {
  const out = {};
  for (const f of walk(path.join(__dirname, '..', 'Ejemplos')).sort()) {
    const bp = await BP.parse(fs.readFileSync(f, 'utf8'));
    for (const b of bp.buildings) {
      if (out[b.itemId]) continue;
      const belt = BP.BELTS.has(b.itemId), sorter = BP.SORTERS.has(b.itemId);
      // de los edificios, solo uno suelto (sin apilar ni conectar): sus huecos son los de por defecto
      // (el distribuidor siempre va encima de un almacén)
      if (!belt && !sorter && b.itemId !== 2107 && (b.inputObjIdx >= 0 || b.outputObjIdx >= 0 || b.z > 0.5)) continue;
      out[b.itemId] = {
        modelIndex: b.modelIndex,
        parameters: belt ? [] : b.parameters.slice(),
        outputToSlot: belt || sorter ? 0 : b.outputToSlot, inputFromSlot: belt || sorter ? 0 : b.inputFromSlot,
        outputFromSlot: belt || sorter ? 0 : b.outputFromSlot, inputToSlot: belt ? 1 : sorter ? 0 : b.inputToSlot,
      };
      if (b.itemId === 2303 || b.itemId === 2302) out[b.itemId].parameters = [0];
    }
  }
  for (const [id, [from, model]] of Object.entries(CLONES)) {
    if (!out[id] && out[from]) out[id] = { ...out[from], modelIndex: model, parameters: out[from].parameters.slice() };
  }
  const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => a[0] - b[0]));
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'templates.js'),
    '/* Plantillas por edificio sacadas de Ejemplos/ (tools/gen_templates.js). */\n' +
    "(typeof window !== 'undefined' ? window : globalThis).DSPDefaultTemplates = " + JSON.stringify(sorted) + ';\n');
  console.log(Object.entries(sorted).map(([id, t]) => `${id}:${t.modelIndex}`).join(' '));
})();
