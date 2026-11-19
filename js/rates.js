// Ritmos de producción y consumo eléctrico (para validar la producción final y la potencia de un blueprint).
// Datos: js/recipes.js (tiempo y cantidades de cada receta) y js/machines.js (velocidad y kW de cada edificio).
//
//   DSPRates.machine(b, nivel)  → { recipe, speed, cycle (s), in: [[objeto, /min]], out: [[objeto, /min]], inc, mode } o null
//   DSPRates.power(b, nivel)    → { work, idle } en kW (negativo = genera) o null
//   DSPRates.totals(lista, nivelDe) → { items: [[objeto, entra/min, sale/min]], machines, work, idle, gen, notes }
//   DSPRates.accMode(b)         → 'extra' | 'speed': qué hace la máquina con el proliferador
//
// Proliferador (nivel 0 = sin proliferar, 1…3 = Mk.I…Mk.III; lo da DSPFlow.analyze(...).inc.machines):
//   · productos extra: +12,5 % / +20 % / +25 % de lo que sale, con las mismas entradas y el mismo tiempo
//   · acelerar: +25 % / +50 % / +100 % de velocidad (entra y sale más)
//   · en los dos casos la máquina gasta +30 % / +70 % / +150 % de energía trabajando
// La máquina hace productos extra salvo que se le haya puesto «acelerar» (parámetro 0 del edificio; el 1 en los
// laboratorios) o que la receta no los admita (NO_EXTRA).
//   DSPRates.sorter(b)   → objetos/min que puede mover un clasificador (viajes/s por casilla × 60 / casillas)
//
// Supone las máquinas trabajando sin parar. El fraccionador no entra: su ritmo depende
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

  // Efecto del proliferador por nivel (0 = nada, 1…3 = Mk.I…Mk.III) y rociados que da cada unidad
  const INC = { extra: [0, 0.125, 0.2, 0.25], speed: [0, 0.25, 0.5, 1], power: [0, 0.3, 0.7, 1.5], sprays: [0, 12, 24, 60] };
  const PROLIF = { 1141: 1, 1142: 2, 1143: 3 };   // objeto → nivel
  // Recetas que no admiten productos extra (solo acelerar): las que fabrican edificios o unidades y, de memoria
  // (sin comprobar con el juego), el craqueo por rayos X, el refinado por reformado y el almacenamiento de masa-energía.
  const NO_EXTRA = new Set([58, 121, 74]);
  const isUnit = (id) => (id >= 2000 && id < 4000) || (id >= 5001 && id < 5200);
  const canExtra = (rid) => { const r = R[rid]; return !!r && !!r.out && !NO_EXTRA.has(+rid) && !r.out.some(([id]) => isUnit(id)); };
  const isLab = (b) => b.itemId === 2901 || b.itemId === 2902;
  const accForced = (b) => !!b.parameters && b.parameters[isLab(b) ? 1 : 0] === 1;
  const accMode = (b) => (accForced(b) || !canExtra(b.recipeId) ? 'speed' : 'extra');
  // rociados que da una unidad de proliferador (rociada ella misma con nivel own, da más: 12→13, 24→28, 60→75)
  const sprays = (item, own) => Math.floor(INC.sprays[PROLIF[item] || 0] * (1 + INC.extra[own || 0]));

  function machine(b, level) {
    const r = b.recipeId && R[b.recipeId];
    if (!r || !r.out || !r.time || b.itemId === 2314) return null;
    const inc = Math.max(0, Math.min(3, level || 0)), mode = accMode(b);
    const speed = ((M[b.itemId] && M[b.itemId].speed) || 1) * (mode === 'speed' ? 1 + INC.speed[inc] : 1);
    const cycle = r.time / speed, k = 60 / cycle, extra = mode === 'extra' ? 1 + INC.extra[inc] : 1;
    return { recipe: b.recipeId, speed, base: r.time, cycle, inc, mode, in: r.in.map(([i, n]) => [i, n * k]), out: r.out.map(([i, n]) => [i, n * k * extra]) };
  }

  function power(b, level) {
    const m = M[b.itemId];
    if (!m || (m.work === undefined && m.idle === undefined)) return null;
    let work = m.work || 0;
    if (work > 0 && level) work *= 1 + INC.power[Math.max(0, Math.min(3, level))];
    // estaciones y distribuidor: lo que gastan trabajando es su potencia de carga configurada
    const p = P && (P.STATION_SLOTS[b.itemId] || b.itemId === 2107) ? P.read(b) : null;
    if (p && p.chargeMW) work = p.chargeMW * 1000;
    return { work, idle: m.idle || 0 };
  }

  function totals(list, levelOf) {
    const lv = levelOf || (() => 0);
    const items = new Map(), notes = [];
    let machines = 0, work = 0, idle = 0, gen = 0, fract = 0, noRecipe = 0;
    const add = (id, inn, out) => { const e = items.get(id) || [0, 0]; e[0] += inn; e[1] += out; items.set(id, e); };
    for (const b of list) {
      const m = machine(b, lv(b));
      if (m) { machines++; m.in.forEach(([i, v]) => add(i, v, 0)); m.out.forEach(([i, v]) => add(i, 0, v)); }
      else if (b.itemId === 2314) fract++;
      else if (R && root.DSPItems && root.DSPItems.RECIPE_GROUP[b.itemId] && !b.recipeId) noRecipe++;
      const p = power(b, lv(b));
      if (p) { if (p.work < 0) gen -= p.work; else { work += p.work; idle += p.idle; } }
    }
    const t = (k, v) => (root.DSPI18n ? root.DSPI18n.t(k, v) : k);
    if (fract) notes.push(t('rates.fract', { n: fract }));
    if (noRecipe) notes.push(t('rates.noRecipe', { n: noRecipe }));
    const rows = [...items].map(([id, [i, o]]) => [id, i, o]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]));
    return { items: rows, machines, work, idle, gen, notes };
  }

  root.DSPRates = { machine, power, totals, sorter, SORTER_SPEED, INC, PROLIF, NO_EXTRA, canExtra, accMode, accForced, sprays };
  if (typeof module !== 'undefined') module.exports = root.DSPRates;
})(typeof window !== 'undefined' ? window : globalThis);
