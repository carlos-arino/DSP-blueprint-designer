// Qué productos llegan a cada sitio del blueprint (sin ritmos todavía): se propagan por cintas, divisores,
// clasificadores, máquinas, almacenes y estaciones hasta que no cambia nada.
//
//   DSPFlow.analyze(buildings) → {
//     items:    Map(índice → Set de objetos) en cintas, almacenes y estaciones
//     supplied: Map(índice de máquina → Set de objetos que le llegan)
//     moves:    Map(índice de clasificador → Set de objetos que mueve)
//     issues:   [{ level: 'error' | 'warn', kind, i, msg, items }]
//   }
//
// Fuentes de productos: cintas con etiqueta (se supone que traen ese producto), puertos de salida de
// estaciones (el producto elegido), salidas de máquinas (su receta), almacenes (lo que les entra y sus filtros)
// y monitores de tráfico en modo «generar». Un monitor en modo «consumir» retira de la cinta lo filtrado (o todo):
// lo que le llega queda en sinks.
(function (root) {
  const IT = root.DSPItems, R = root.DSPRecipes || {}, P = root.DSPProps, RT = root.DSPRates;
  const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const isBelt = (b) => b && b.itemId >= 2001 && b.itemId <= 2003;
  const isSorter = (b) => b && b.itemId >= 2011 && b.itemId <= 2014;
  const DEPOT = new Set([2101, 2102, 2106]);
  const recipeOf = (b) => (b && b.recipeId && R[b.recipeId] && R[b.recipeId].in ? R[b.recipeId] : null);
  const name = (id) => (IT ? IT.itemName(id) : '#' + id);
  const names = (s) => [...s].map(name).join(', ');

  function analyze(bs) {
    const items = new Map(), supplied = new Map(), sinks = new Map(), moves = new Map(), issues = [];
    const get = (m, i) => { if (!m.has(i)) m.set(i, new Set()); return m.get(i); };
    let changed = true;
    const addAll = (m, i, src) => { const s = get(m, i); for (const x of src) if (x && !s.has(x)) { s.add(x); changed = true; } };

    // almacenes apilados: un solo contenedor (el de abajo)
    const base = (i) => { let b = bs[i], n = 0; while (b && DEPOT.has(b.itemId) && bs[b.inputObjIdx] && DEPOT.has(bs[b.inputObjIdx].itemId) && n++ < 20) { i = b.inputObjIdx; b = bs[i]; } return i; };
    // conexiones de cada edificio con cintas por puerto
    const beltsIn = new Map(), beltsOut = new Map();   // edificio → [[slot, cinta]]
    bs.forEach((b, i) => {
      if (!isBelt(b)) return;
      const o = bs[b.outputObjIdx], f = bs[b.inputObjIdx];
      if (o && !isBelt(o)) get(beltsIn, b.outputObjIdx).add([b.outputToSlot, i]);
      if (f && !isBelt(f)) get(beltsOut, b.inputObjIdx).add([b.inputFromSlot, i]);
    });

    // monitores de tráfico: van encima de una cinta (misma casilla y nivel)
    const beltAtCell = new Map();
    bs.forEach((b, i) => { if (isBelt(b)) beltAtCell.set(`${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.z)}`, i); });
    const consumers = new Map();   // cinta → monitor que consume
    bs.forEach((b, i) => {
      if (b.itemId !== 2030 || !P) return;
      const p = P.read(b);
      if (p.mode === 'none') return;
      const bi = beltAtCell.get(`${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.z)}`);
      if (bi === undefined) { issues.push({ level: 'warn', kind: 'monitor', i, msg: 'No está encima de ninguna cinta', items: [] }); return; }
      if (p.mode === 'generate') {
        if (p.item) addAll(items, bi, [p.item]);
        else issues.push({ level: 'warn', kind: 'monitor', i, msg: 'Genera, pero no tiene producto elegido', items: [] });
      } else consumers.set(bi, { i, item: p.item });
    });
    // lo que sigue por la cinta después de pasar por un monitor que consume
    const after = (bi) => {
      const s = get(items, bi), c = consumers.get(bi);
      if (!c) return s;
      addAll(sinks, c.i, c.item ? [...s].filter((x) => x === c.item) : s);
      return c.item ? new Set([...s].filter((x) => x !== c.item)) : new Set();
    };

    // fuentes fijas
    bs.forEach((b, i) => {
      if (isBelt(b) && b.parameters && b.parameters[0] > 0) addAll(items, i, [b.parameters[0]]);
      if (DEPOT.has(b.itemId) && P) { const p = P.read(b); if (p && p.filters) addAll(items, base(i), p.filters.filter(Boolean)); }
      if (b.itemId === 2107 && b.filterId && bs[b.inputObjIdx] && DEPOT.has(bs[b.inputObjIdx].itemId)) addAll(items, base(b.inputObjIdx), [b.filterId]);
      if (P && P.STATION_SLOTS[b.itemId]) {
        const p = P.read(b);
        for (const [slot, bi] of beltsOut.get(i) || []) {
          const st = p.ports[slot] && p.ports[slot].storage, it = st && p.slots[st - 1] ? p.slots[st - 1].item : 0;
          if (it) addAll(items, bi, [it]);
          else issues.push({ level: 'warn', kind: 'port', i, msg: `Puerto de salida ${slot} sin producto elegido`, items: [] });
        }
      }
    });

    // lo que un clasificador coge de su origen
    const take = (s) => {
      const src = bs[s.inputObjIdx]; if (!src) return new Set();
      let out;
      if (isBelt(src)) out = new Set(get(items, s.inputObjIdx));
      else if (DEPOT.has(src.itemId)) out = new Set(get(items, base(s.inputObjIdx)));
      else { const r = recipeOf(src); out = new Set(r ? r.out.map(([id]) => id) : []); }
      if (s.filterId) out = new Set(out.has(s.filterId) ? [s.filterId] : []);
      // hacia una máquina solo coge lo que pide su receta
      const dst = bs[s.outputObjIdx], r = recipeOf(dst);
      if (r && !isBelt(dst)) { const need = new Set(r.in.map(([id]) => id)); out = new Set([...out].filter((x) => need.has(x))); }
      return out;
    };

    for (let it = 0; changed && it < 500; it++) {
      changed = false;
      bs.forEach((b, i) => {
        if (isBelt(b)) {
          const o = bs[b.outputObjIdx];
          if (isBelt(o)) addAll(items, b.outputObjIdx, after(i));
          else after(i);
        } else if (isSorter(b)) {
          const got = take(b), dst = bs[b.outputObjIdx];
          addAll(moves, i, got);
          if (!dst) return;
          if (isBelt(dst)) addAll(items, b.outputObjIdx, got);
          else if (DEPOT.has(dst.itemId)) addAll(items, base(b.outputObjIdx), got);
          else addAll(supplied, b.outputObjIdx, got);
        } else if (beltsIn.has(i) || beltsOut.has(i)) {
          // edificios con puertos de cinta
          const inSet = new Set(); for (const [, bi] of beltsIn.get(i) || []) for (const x of after(bi)) inSet.add(x);
          if (P && P.STATION_SLOTS[b.itemId]) { addAll(supplied, i, inSet); return; }
          let pass = inSet;
          if (b.itemId === 2314) { const r = recipeOf(b); pass = new Set([...inSet, ...(r && [...inSet].some((x) => r.in.some(([id]) => id === x)) ? r.out.map(([id]) => id) : [])]); }
          const outs = [...(beltsOut.get(i) || [])];
          if (b.itemId === 2020 && b.filterId && P) {
            // divisor con filtro: lo filtrado va a la salida con prioridad; el resto, a las demás
            const pr = P.read(b).priority;
            for (const [slot, bi] of outs) addAll(items, bi, pr[slot] ? [...pass].filter((x) => x === b.filterId) : pass);
          } else for (const [, bi] of outs) addAll(items, bi, pass);
        }
      });
    }

    // comprobaciones
    bs.forEach((b, i) => {
      const r = recipeOf(b);
      if (r && !isBelt(b) && !isSorter(b) && !(P && P.STATION_SLOTS[b.itemId]) && b.itemId !== 2314) {
        const got = get(supplied, i), miss = r.in.map(([id]) => id).filter((id) => !got.has(id));
        if (miss.length) issues.push({ level: 'error', kind: 'missing', i, msg: `Le falta ${names(miss)}`, items: miss });
        const outSorters = bs.some((s) => isSorter(s) && s.inputObjIdx === i);
        if (!outSorters) issues.push({ level: 'warn', kind: 'noout', i, msg: 'Nadie saca lo que fabrica', items: r.out.map(([id]) => id) });
        // ¿dan abasto los clasificadores? (lo que pide o fabrica la máquina por minuto contra lo que pueden mover)
        const m = RT && RT.machine(b);
        if (m) {
          const cap = (list, id) => list.filter((s) => get(moves, bs.indexOf(s)).has(id)).reduce((a, s) => a + RT.sorter(s), 0);
          const ins = bs.filter((s) => isSorter(s) && s.outputObjIdx === i), outs = bs.filter((s) => isSorter(s) && s.inputObjIdx === i);
          const slow = (rows, list, word) => rows.forEach(([id, need]) => {
            const c = cap(list, id);
            if (c > 0 && c + 1e-6 < need) issues.push({ level: 'warn', kind: 'sorter', i, items: [id],
              msg: `Los clasificadores ${word} ${name(id)} mueven ${fmt(c)}/min y hacen falta ${fmt(need)}/min (la máquina va al ${Math.floor(c / need * 100)} %)` });
          });
          slow(m.in, ins, 'que le traen');
          if (outSorters) slow(m.out, outs, 'que sacan');
        }
      }
      if (P && P.STATION_SLOTS[b.itemId]) {
        const p = P.read(b), have = new Set(p.slots.map((s) => s.item).filter(Boolean));
        const bad = [...get(supplied, i)].filter((x) => !have.has(x));
        if (bad.length) issues.push({ level: 'error', kind: 'station', i, msg: `Le entra ${names(bad)}, que no tiene en ninguna casilla`, items: bad });
      }
    });
    // mezclas: una entrada por línea de cinta (la primera cinta de la línea donde aparece la mezcla)
    const seen = new Set();
    bs.forEach((b, i) => {
      if (!isBelt(b)) return;
      const s = get(items, i);
      if (s.size < 2) return;
      const prev = bs.find((x, j) => isBelt(x) && x.outputObjIdx === i && get(items, j).size === s.size);
      const key = [...s].sort().join(',');
      if (prev || seen.has(key + ':' + (b.outputObjIdx))) return;
      seen.add(key + ':' + b.outputObjIdx);
      const label = b.parameters && b.parameters[0];
      issues.push({ level: 'warn', kind: 'mix', i, msg: `Mezcla ${names(s)}${label ? ` (etiqueta: ${name(label)})` : ''}`, items: [...s] });
    });
    return { items, supplied, sinks, moves, issues };
  }

  root.DSPFlow = { analyze };
  if (typeof module !== 'undefined') module.exports = root.DSPFlow;
})(typeof window !== 'undefined' ? window : globalThis);
