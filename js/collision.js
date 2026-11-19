/*
 * Choques entre edificios (aproximados).
 * Cada edificio es un rectángulo (o un círculo) alineado con la rejilla, girado con su yaw.
 * Reglas:
 *   - los clasificadores no chocan con edificios, pero dos clasificadores no pueden tocar la cinta en el mismo
 *     punto (a menos de media casilla); las cintas no chocan entre sí (puentes, cruces);
 *   - divisor, monitor, apilador y pulverizador aceptan cintas debajo o dentro;
 *   - estaciones: base de 7×7 con las esquinas recortadas (cabe una Tesla en cada una);
 *     las cintas solo pueden entrar por los carriles de los puertos (3 casillas centrales de cada lado);
 *   - altura: cada edificio ocupa desde su base (z) hasta z + HEIGHT (en niveles de cinta). Dos edificios chocan
 *     si además de solaparse en planta se solapan en altura; una cinta elevada choca con un edificio mientras
 *     no pase por encima de su altura (o por sus carriles de ese nivel). Solo se conoce la altura de los edificios
 *     que se apilan o se cruzan en tus blueprints (HEIGHT); los demás se consideran altos para las cintas (ninguna
 *     pasa por encima) y no se comprueban contra otros edificios a distinta altura;
 *   - ensambladora: cuerpo de 3,2 → con otra ensambladora al lado hace falta un hueco
 *     (cabe una torre Tesla en medio), pero una cinta o una Tesla pueden ir pegadas.
 */
(function (root) {
  'use strict';
  const EPS = 0.05;
  const CELL = 0.42;   // media casilla de las formas por casillas
  const BELTS = new Set([2001, 2002, 2003]);
  const SORTERS = new Set([2011, 2012, 2013, 2014]);
  // edificios que dejan pasar cintas por debajo o por sus puertos
  const BELT_OK = new Set([2020, 2030, 2040, 2105, 2107]);
  // edificios por encima de los que puede pasar un clasificador (las Tesla no: el clasificador choca con ellas)
  const OVER_OK = new Set([2313]);
  // Carriles: la cinta solo puede entrar en el edificio por estas líneas (puntos de entrada/salida).
  // [eje, valor, nivel] en local (yaw 0): ['x', v] = cintas con x local ≈ v (carril norte-sur), ['y', v] = con y ≈ v
  // (este-oeste). El nivel (por defecto 0) es la altura de la cinta respecto al edificio.
  const ROW = [['y', 0]], CROSS = [['x', 0], ['y', 0]];
  const LANES = {
    2103: [['x', -1], ['x', 0], ['x', 1], ['y', -1], ['y', 0], ['y', 1]],   // estaciones: 3 puertos por lado
    2104: [['x', -1], ['x', 0], ['x', 1], ['y', -1], ['y', 0], ['y', 1]],
    2209: CROSS,            // intercambiador de energía: un puerto por lado
    2314: CROSS,            // fraccionador: norte, este y oeste
    2208: [['x', 0]],       // receptor de rayos: norte y sur
    // torretas y torre de interferencias: la munición entra por la fila central
    3001: ROW, 3003: ROW, 3004: ROW, 3005: ROW, 3006: ROW, 3010: ROW,
    // pulverizador: el producto lo recorre a nivel 0 por el centro (entra por los lados estrechos) y la cinta de
    // proliferador lo cruza a nivel 1 por una sola fila, a una casilla del centro (Ejemplos: super-magnetic, Almacenes)
    2313: [['x', 0, 0], ['y', -1, 1]],
  };

  // Altura de cada edificio en niveles de cinta (1 nivel = lo que sube una cinta elevada). Medida en blueprints
  // reales: a esa altura se apila otro edificio encima (almacén sobre almacén a z = 2, laboratorio sobre laboratorio
  // a 3…) o pasan cintas por encima (divisor: cintas a nivel 2). Los que no están aquí no tienen dato: se tratan
  // como altos (Infinity) y nada puede pasar por encima.
  const HEIGHT = {
    2020: 2,                        // divisor: almacén encima a z = 2; cintas cruzando a nivel 2
    2101: 2, 2102: 3, 2106: 3,      // almacén Mk.I / Mk.II y tanque: el siguiente de la pila
    2901: 3, 2902: 3,               // laboratorios apilados
  };
  const heightOf = (id) => (HEIGHT[id] === undefined ? Infinity : HEIGHT[id]);
  const ZTOL = 0.25;   // el distribuidor va a z = 1,87 sobre un almacén de altura 2

  // Cuerpo de colisión en local (yaw 0). Sobrescribe la huella de dibujo cuando hace falta.
  const BODY = {
    2001: { w: 0.8, h: 0.8 }, 2002: { w: 0.8, h: 0.8 }, 2003: { w: 0.8, h: 0.8 },
    2201: { w: 0.8, h: 0.8 },
    2020: { w: 1, h: 1 },         // divisor: el almacén puede ir pegado (o encima)
    2313: { w: 0.9, h: 3.4 },     // pulverizador: se encadenan uno por casilla sobre la cinta   // Tesla: cabe en el hueco de 1 entre dos ensambladoras
    2103: { w: 7, h: 7, cut: 1 }, 2104: { w: 7, h: 7, cut: 1 },   // base octogonal (Ejemplos/pruebas/Almacenes.txt)
    2105: { r: 3.5 },
  };

  function make(geo, items) {
    const SHAPES = root.DSPShapes || {};
    function body(b) {
      const id = b.itemId;
      if (SORTERS.has(id)) return null;
      // forma exacta por casillas (js/shapes.js), girada con el edificio (BODY tiene prioridad: Tesla)
      if (SHAPES[id] && !BODY[id]) {
        const a = (b.yaw || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
        const cells = SHAPES[id].cells.map(([lx, ly]) => [b.x + lx * c + ly * sn, b.y - lx * sn + ly * c]);
        const xs = cells.map((p) => p[0]), ys = cells.map((p) => p[1]);
        const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
        return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, cells, z: b.z || 0 };
      }
      let s = BODY[id];
      if (!s) {
        const g = (geo && geo[id]) || (items && items.buildingInfo(id)) || { w: 1, h: 1 };
        s = { w: g.w, h: g.h, ox: g.ox || 0, oy: g.oy || 0 };
      }
      const a = BELTS.has(id) ? 0 : (b.yaw || 0) * Math.PI / 180,  // cinta: casilla fija aunque vaya en diagonal
         c = Math.cos(a), sn = Math.sin(a);
      const ox = s.ox || 0, oy = s.oy || 0;
      const cx = b.x + ox * c + oy * sn, cy = b.y - ox * sn + oy * c;
      if (s.r) return { cx, cy, r: s.r, z: b.z || 0 };
      // caja envolvente del rectángulo girado (los edificios suelen ir a 0/90/180/270)
      const ac = Math.abs(c), as = Math.abs(sn);
      return { cx, cy, hw: (s.w * ac + s.h * as) / 2, hh: (s.w * as + s.h * ac) / 2, cut: s.cut || 0, z: b.z || 0 };
    }

    function exempt(a, b) {
      const ba = BELTS.has(a.itemId), bb = BELTS.has(b.itemId);
      if (ba && bb) return true;
      if ((ba && BELT_OK.has(b.itemId)) || (bb && BELT_OK.has(a.itemId))) return true;
      // cinta en un carril de entrada/salida del edificio
      const bl = ba ? a : bb ? b : null, st = bl === a ? b : a;
      const lanes = bl && LANES[st.itemId];
      if (lanes) {
        const ang = (st.yaw || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
        const dx = bl.x - st.x, dy = bl.y - st.y, lx = dx * c - dy * sn, ly = dx * sn + dy * c;
        const lvl = Math.round((bl.z || 0) - (st.z || 0));
        return lanes.some(([axis, v, l = 0]) => l === lvl && Math.abs((axis === 'x' ? lx : ly) - v) < 0.3);
      }
      return false;
    }

    function overlap(p, q) {
      if (p.r && q.r) return Math.hypot(p.cx - q.cx, p.cy - q.cy) < p.r + q.r - EPS;
      if (p.r || q.r) {
        const c = p.r ? p : q, k = p.r ? q : p;
        const dx = Math.max(Math.abs(c.cx - k.cx) - k.hw, 0), dy = Math.max(Math.abs(c.cy - k.cy) - k.hh, 0);
        return Math.hypot(dx, dy) < c.r - EPS;
      }
      if (!(p.hw + q.hw - Math.abs(p.cx - q.cx) > EPS && p.hh + q.hh - Math.abs(p.cy - q.cy) > EPS)) return false;
      // base con esquinas recortadas: no choca si lo que se solapa cae entero en una esquina
      for (const [o, k] of [[p, q], [q, p]]) {
        if (!o.cut) continue;
        const x0 = Math.max(o.cx - o.hw, k.cx - k.hw), x1 = Math.min(o.cx + o.hw, k.cx + k.hw);
        const y0 = Math.max(o.cy - o.hh, k.cy - k.hh), y1 = Math.min(o.cy + o.hh, k.cy + k.hh);
        const inX = x0 >= o.cx + o.hw - o.cut - EPS || x1 <= o.cx - o.hw + o.cut + EPS;
        const inY = y0 >= o.cy + o.hh - o.cut - EPS || y1 <= o.cy - o.hh + o.cut + EPS;
        if (inX && inY) return false;
      }
      // formas por casillas: basta con que se solape una casilla
      if (p.cells || q.cells) {
        // cada casilla algo por dentro de su borde (0,84), como las cintas: se puede pegar a una ensambladora (3,2)
        const boxes = (o) => (o.cells ? o.cells.map(([x, y]) => ({ cx: x, cy: y, hw: CELL, hh: CELL })) : [o]);
        const bq = boxes(q);
        return boxes(p).some((m) => bq.some((n) => m.hw + n.hw - Math.abs(m.cx - n.cx) > EPS && m.hh + n.hh - Math.abs(m.cy - n.cy) > EPS));
      }
      return true;
    }

    function collides(a, b) {
      if (a === b || exempt(a, b)) return false;
      const p = body(a), q = body(b);
      if (!p || !q) return false;
      const az = a.z || 0, bz = b.z || 0;
      if (BELTS.has(a.itemId) !== BELTS.has(b.itemId)) {
        // cinta contra edificio: choca desde la base del edificio hasta su altura (los de altura desconocida, siempre)
        const bl = BELTS.has(a.itemId) ? a : b, bd = bl === a ? b : a, dz = (bl.z || 0) - (bd.z || 0);
        if (dz <= -0.5 || dz > heightOf(bd.itemId) - ZTOL) return false;
      } else if (Math.abs(az - bz) > 0.5) {
        // dos edificios a distinta altura: chocan si el de arriba empieza antes de que acabe el de abajo.
        // Si no se sabe la altura del de abajo no se avisa (en tus blueprints hay torres Tesla bajo el vuelo
        // de un almacén elevado, y no hay dato para decir si el juego lo admite).
        const lo = az < bz ? a : b, hi = lo === a ? b : a;
        if (HEIGHT[lo.itemId] === undefined || (hi.z || 0) - (lo.z || 0) > HEIGHT[lo.itemId] - ZTOL) return false;
      }
      return overlap(p, q);
    }

    // Pares que chocan. `others` (opcional): comprobar solo `list` contra `others`.
    function find(list, others) {
      const CELL = 8, grid = new Map(), key = (i, j) => i + ',' + j;
      const pool = others || list;
      pool.forEach((b) => {
        if (SORTERS.has(b.itemId)) return;
        const k = key(Math.floor(b.x / CELL), Math.floor(b.y / CELL));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      });
      const pairs = [], ord = new Map(list.map((b, i) => [b, i]));
      for (const a of list) {
        if (SORTERS.has(a.itemId)) continue;
        const i0 = Math.floor(a.x / CELL), j0 = Math.floor(a.y / CELL);
        for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
          for (const b of grid.get(key(i, j)) || []) {
            if (!others && ord.get(b) <= ord.get(a)) continue;
            if (collides(a, b)) pairs.push([a, b]);
          }
        }
      }
      // clasificadores que tocan la cinta en el mismo punto
      const ends = (b) => {
        const e = [];
        if (b.inputFromSlot === -1) e.push([b.x, b.y, b.z || 0]);
        if (b.outputToSlot === -1) e.push([b.x2, b.y2, b.z2 || 0]);
        return e;
      };
      const sl = list.filter((b) => SORTERS.has(b.itemId)), sp = others ? others.filter((b) => SORTERS.has(b.itemId)) : sl;
      const sord = new Map(sl.map((b, i) => [b, i]));
      for (const a of sl) {
        const ea = ends(a); if (!ea.length) continue;
        for (const b of sp) {
          if (a === b || (!others && sord.get(b) <= sord.get(a))) continue;
          if (Math.abs(a.x - b.x) > 4 || Math.abs(a.y - b.y) > 4) continue;
          const eb = ends(b);
          if (ea.some(([x, y, z]) => eb.some(([u, v, w]) => Math.hypot(x - u, y - v) < 0.5 - EPS && Math.abs(z - w) < 0.5))) pairs.push([a, b]);
        }
      }
      // clasificadores que atraviesan un edificio (también el suyo: entrar por un lado y llegar a un hueco del otro).
      // Pueden pasar por encima de cintas, pero no por dentro de un edificio.
      const solids = (arr) => arr.filter((b) => !SORTERS.has(b.itemId) && !BELTS.has(b.itemId) && !BELT_OK.has(b.itemId) && !OVER_OK.has(b.itemId));
      const near = (s, b) => Math.abs(s.x - b.x) < 8 && Math.abs(s.y - b.y) < 8;
      const check = (ss, bb) => {
        for (const s of ss) for (const b of bb) if (near(s, b) && crosses(s, b)) pairs.push([s, b]);
      };
      if (others) { check(sl, solids(others)); check(sp, solids(list)); } else check(sl, solids(list));
      return pairs;
    }

    function inside(k, x, y) {
      if (k.r) return Math.hypot(x - k.cx, y - k.cy) < k.r - 0.1;
      if (k.cells) return k.cells.some(([cx, cy]) => Math.abs(x - cx) < CELL && Math.abs(y - cy) < CELL);
      if (Math.abs(x - k.cx) > k.hw - 0.1 || Math.abs(y - k.cy) > k.hh - 0.1) return false;
      if (k.cut && Math.abs(x - k.cx) > k.hw - k.cut && Math.abs(y - k.cy) > k.hh - k.cut) return false;
      return true;
    }
    // ¿El clasificador pasa por dentro del edificio?
    //  - si un extremo es un hueco de este edificio (en el juego queda dentro, junto al borde), desde ahí tiene que
    //    alejarse del centro: llegar a un hueco desde el otro lado es atravesar el edificio. En las esquinas vale
    //    cualquiera de los dos lados (tus blueprints);
    //  - si no, el tramo (sin sus extremos) no puede pasar por dentro.
    function crosses(s, b) {
      const z = Math.max(s.z || 0, s.z2 || 0);
      if ((b.z || 0) > z + 0.5) return false;   // edificio apilado por encima
      const k = body(b); if (!k) return false;
      const dx = s.x2 - s.x, dy = s.y2 - s.y, len = Math.hypot(dx, dy);
      if (len < 1e-6) return false;
      let own = false;
      for (const [x, y, slot, sg] of [[s.x, s.y, s.inputFromSlot, 1], [s.x2, s.y2, s.outputToSlot, -1]]) {
        if (!(slot >= 0) || !inside(k, x, y)) continue;
        own = true;
        const rx = x - k.cx, ry = y - k.cy, rl = Math.hypot(rx, ry);
        if (rl > 1e-3 && (rx * dx + ry * dy) * sg / (rl * len) < 0.2) return true;
      }
      if (own) return false;
      for (let d = 0.35; d <= len - 0.35 + 1e-9; d += 0.1) {
        if (inside(k, s.x + dx * d / len, s.y + dy * d / len)) return true;
      }
      return false;
    }

    return { body, collides, find };
  }

  root.DSPCollision = { make, BODY, BELT_OK, LANES, HEIGHT, heightOf };
  if (typeof module !== 'undefined') module.exports = root.DSPCollision;
})(typeof window !== 'undefined' ? window : globalThis);
