// Saca la forma exacta (casillas ocupadas) de los edificios rodeados con un anillo de cintas en los blueprints
// de prueba, y la guarda en js/shapes.js. Uso: node tools/gen_shapes.js [--show]
//
// Interior = casillas a las que no se llega desde fuera sin cruzar una cinta. Las cintas que atraviesan el
// edificio (fila de munición de las torretas) cuentan como interior si caen dentro del contorno.
const fs = require('fs'), path = require('path');
const BP = require('../js/codec.js');

// solo blueprints donde los edificios están rodeados a propósito con un anillo de cintas
const SOURCES = ['Ejemplos/pruebas/especiales.txt'];
const R = 10;  // radio de búsqueda alrededor del edificio (el silo llega a 7 casillas del centro)

(async () => {
  const shapes = {};
  const show = process.argv.includes('--show');
  for (const src of SOURCES) {
    const bp = await BP.parse(fs.readFileSync(path.join(__dirname, '..', src), 'utf8'));
    const B = bp.buildings;
    const beltCells = new Set(B.filter((b) => BP.BELTS.has(b.itemId)).map((b) => `${Math.round(b.x)},${Math.round(b.y)}`));
    for (const st of B) {
      if (BP.BELTS.has(st.itemId) || BP.SORTERS.has(st.itemId) || shapes[st.itemId] || st.z > 0.5) continue;
      if (Math.round(st.yaw) % 360 !== 0) continue;
      const cx = Math.round(st.x), cy = Math.round(st.y);
      const wall = (x, y) => beltCells.has(`${cx + x},${cy + y}`);
      // relleno desde el centro (y sus vecinas) por casillas sin cinta; un trozo que llega al borde de la
      // búsqueda es que el anillo está abierto y se descarta
      const inside = new Set();
      for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
        if (wall(sx, sy) || inside.has(sx + ',' + sy)) continue;
        const comp = new Set(), q = [[sx, sy]];
        let leak = false;
        while (q.length && !leak) {
          const [x, y] = q.pop(), k = x + ',' + y;
          if (comp.has(k) || wall(x, y)) continue;
          if (Math.abs(x) >= R || Math.abs(y) >= R) { leak = true; break; }
          comp.add(k);
          q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        if (!leak) comp.forEach((k) => inside.add(k));
      }
      if (!inside.size) continue;
      const has = (x, y) => inside.has(x + ',' + y);
      // cintas que cruzan por dentro (fila de munición): con interior a ambos lados
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        if (wall(x, y) && ((has(x - 1, y) && has(x + 1, y)) || (has(x, y - 1) && has(x, y + 1)))) inside.add(x + ',' + y);
      }
      // si el centro no queda dentro es que una mitad se ha escapado por un hueco del anillo: no fiable
      if (!has(0, 0)) continue;
      const cells = [...inside].map((k) => k.split(',').map(Number));
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      shapes[st.itemId] = { cells: cells.sort((a, b) => b[1] - a[1] || a[0] - b[0]) };
      if (show) {
        const rows = [];
        for (let y = y1; y >= y0; y--) {
          let r = '';
          for (let x = x0; x <= x1; x++) r += x === 0 && y === 0 ? '@' : cells.some((c) => c[0] === x && c[1] === y) ? '█' : '·';
          rows.push(r);
        }
        console.log(st.itemId, `${x1 - x0 + 1}×${y1 - y0 + 1}`, cells.length, 'casillas\n' + rows.join('\n'));
      }
    }
  }
  // Correcciones a mano (anillo incompleto en la plantilla, confirmado en el juego)
  const rect = (x0, x1, y0, y1) => { const c = []; for (let y = y1; y >= y0; y--) for (let x = x0; x <= x1; x++) c.push([x, y]); return c; };
  shapes[3003] = { cells: rect(-2, 2, -3, 3) };   // cañón de implosión: 5×7 (una fila más arriba y abajo que el anillo visible)
  if (show) console.log('3003 5×7 (a mano)');

  fs.writeFileSync(path.join(__dirname, '..', 'js', 'shapes.js'),
    '/* Formas exactas (casillas ocupadas, en local con yaw 0) medidas con anillos de cintas (tools/gen_shapes.js). */\n' +
    "(typeof window !== 'undefined' ? window : globalThis).DSPShapes = " + JSON.stringify(shapes) + ';\n');
  console.log(Object.keys(shapes).length, 'formas:', Object.keys(shapes).join(' '));
})();
