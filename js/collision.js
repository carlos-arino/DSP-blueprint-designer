/*
 * Choques entre edificios (aproximados).
 * Cada edificio es un rectángulo (o un círculo) alineado con la rejilla, girado con su yaw.
 * Reglas:
 *   - los clasificadores no chocan con nada; las cintas no chocan entre sí (puentes, cruces);
 *   - divisor, monitor, apilador y pulverizador aceptan cintas debajo o dentro;
 *   - estaciones: base de 7×7 con las esquinas recortadas (cabe una Tesla en cada una);
 *     las cintas solo pueden entrar por los carriles de los puertos (3 casillas centrales de cada lado);
 *   - piezas a distinta altura (almacén sobre divisor…) no chocan;
 *   - ensambladora: cuerpo de 3,2 → con otra ensambladora al lado hace falta un hueco
 *     (cabe una torre Tesla en medio), pero una cinta o una Tesla pueden ir pegadas.
 */
(function (root) {
  'use strict';
  const EPS = 0.05;
  const BELTS = new Set([2001, 2002, 2003]);
  const SORTERS = new Set([2011, 2012, 2013, 2014]);
  // edificios que dejan pasar cintas por debajo o por sus puertos
  const BELT_OK = new Set([2020, 2030, 2040, 2313, 2105, 2107]);
  // Carriles: la cinta solo puede entrar en el edificio por estas líneas (puntos de entrada/salida).
  // [eje, valor] en local (yaw 0): ['x', v] = cintas con x local ≈ v (carril norte-sur), ['y', v] = con y ≈ v (este-oeste).
  const ROW = [['y', 0]], CROSS = [['x', 0], ['y', 0]];
  const LANES = {
    2103: [['x', -1], ['x', 0], ['x', 1], ['y', -1], ['y', 0], ['y', 1]],   // estaciones: 3 puertos por lado
    2104: [['x', -1], ['x', 0], ['x', 1], ['y', -1], ['y', 0], ['y', 1]],
    2209: CROSS,            // intercambiador de energía: un puerto por lado
    2314: CROSS,            // fraccionador: norte, este y oeste
    2208: [['x', 0]],       // receptor de rayos: norte y sur
    // torretas y torre de interferencias: la munición entra por la fila central
    3001: ROW, 3003: ROW, 3004: ROW, 3005: ROW, 3006: ROW, 3010: ROW,
  };

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
    function body(b) {
      const id = b.itemId;
      if (SORTERS.has(id)) return null;
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
        return lanes.some(([axis, v]) => Math.abs((axis === 'x' ? lx : ly) - v) < 0.3);
      }
      return false;
    }

    function overlap(p, q) {
      if (Math.abs(p.z - q.z) > 0.5) return false;
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
      return true;
    }

    function collides(a, b) {
      if (a === b || exempt(a, b)) return false;
      const p = body(a), q = body(b);
      return !!(p && q && overlap(p, q));
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
      return pairs;
    }

    return { body, collides, find };
  }

  root.DSPCollision = { make, BODY, BELT_OK, LANES };
  if (typeof module !== 'undefined') module.exports = root.DSPCollision;
})(typeof window !== 'undefined' ? window : globalThis);
