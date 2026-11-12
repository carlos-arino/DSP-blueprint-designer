// Ritmos de producción y consumo eléctrico (para validar la producción final y la potencia de un blueprint).
// Datos: js/recipes.js (tiempo y cantidades de cada receta) y js/machines.js (velocidad y kW de cada edificio).
//
//   DSPRates.machine(b)  → { recipe, speed, cycle (s), in: [[objeto, /min]], out: [[objeto, /min]] } o null
//   DSPRates.power(b)    → { work, idle } en kW (negativo = genera) o null
//   DSPRates.totals(lista) → { items: [[objeto, entra/min, sale/min]], machines, work, idle, gen, notes }
//   DSPRates.sorter(b)   → objetos/min que puede mover un clasificador (viajes/s por casilla × 60 / casillas)
//
// Supone las máquinas trabajando sin parar y sin proliferador. El fraccionador no entra: su ritmo depende
// de la velocidad de la cinta (1 % de lo que pasa).
(function (root) {
  const R = root.DSPRecipes || {}, M = root.DSPMachines || {}, P = root.DSPProps;
  // Viajes por segundo y casilla (wiki: Mk.I 1,5; Mk.II y Mk.III más rápidos en la misma proporción que su
  // consumo, 18/36/72 kW). El apilador (144 kW) no viene en la wiki: 12 por la misma regla, sin comprobar.
  const SORTER_SPEED = { 2011: 1.5, 2012: 3, 2013: 6, 2014: 12 };
  // 1 casilla: Mk.I 90/min · 2 casillas: 45/min · 3 casillas: 30/min
  function sorter(b) {
    const v = SORTER_SPEED[b.itemId]; if (!v) return 0;
    const len = Math.max(1, Math.min(3, (b.parameters && b.parameters[0]) || 1));
    return v * 60 / len;
  }

  function machine(b) {
    const r = b.recipeId && R[b.recipeId];
    if (!r || !r.out || !r.time || b.itemId === 2314) return null;
    const speed = (M[b.itemId] && M[b.itemId].speed) || 1;
    const cycle = r.time / speed, k = 60 / cycle;
    return { recipe: b.recipeId, speed, base: r.time, cycle, in: r.in.map(([i, n]) => [i, n * k]), out: r.out.map(([i, n]) => [i, n * k]) };
  }

  function power(b) {
    const m = M[b.itemId];
    if (!m || (m.work === undefined && m.idle === undefined)) return null;
    let work = m.work || 0;
    // estaciones y distribuidor: lo que gastan trabajando es su potencia de carga configurada
    const p = P && (P.STATION_SLOTS[b.itemId] || b.itemId === 2107) ? P.read(b) : null;
    if (p && p.chargeMW) work = p.chargeMW * 1000;
    return { work, idle: m.idle || 0 };
  }

  function totals(list) {
    const items = new Map(), notes = [];
    let machines = 0, work = 0, idle = 0, gen = 0, fract = 0, noRecipe = 0;
    const add = (id, inn, out) => { const e = items.get(id) || [0, 0]; e[0] += inn; e[1] += out; items.set(id, e); };
    for (const b of list) {
      const m = machine(b);
      if (m) { machines++; m.in.forEach(([i, v]) => add(i, v, 0)); m.out.forEach(([i, v]) => add(i, 0, v)); }
      else if (b.itemId === 2314) fract++;
      else if (R && root.DSPItems && root.DSPItems.RECIPE_GROUP[b.itemId] && !b.recipeId) noRecipe++;
      const p = power(b);
      if (p) { if (p.work < 0) gen -= p.work; else { work += p.work; idle += p.idle; } }
    }
    const t = (k, v) => (root.DSPI18n ? root.DSPI18n.t(k, v) : k);
    if (fract) notes.push(t('rates.fract', { n: fract }));
    if (noRecipe) notes.push(t('rates.noRecipe', { n: noRecipe }));
    const rows = [...items].map(([id, [i, o]]) => [id, i, o]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]));
    return { items: rows, machines, work, idle, gen, notes };
  }

  root.DSPRates = { machine, power, totals, sorter, SORTER_SPEED };
  if (typeof module !== 'undefined') module.exports = root.DSPRates;
})(typeof window !== 'undefined' ? window : globalThis);
