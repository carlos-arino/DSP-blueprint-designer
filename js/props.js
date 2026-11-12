// Propiedades de los edificios guardadas en `parameters` del blueprint, en un formato legible.
// Medidas con Ejemplos/pruebas/propiedades.txt y las capturas de esa carpeta (juego 0.10.35).
//
//   DSPProps.read(b)        → objeto con las propiedades del edificio (o null si no tiene)
//   DSPProps.write(b, cambios) aplica solo los campos dados (el resto queda como estaba)
//
// Formatos (índices dentro de parameters):
//   Receptor de rayos (2208): [0] = 0 energía · 1208 (fotón crítico) fotones
//   Distribuidor logístico (2107): [0] Icarus · [1] con otros distribuidores (0 no, 1 ofrecer, 2 pedir)
//      · [2] potencia de carga en J por tick (×60 = W) · [3] reponer drones solos. El producto va en filterId.
//   Almacén (2101: 30 casillas, 2102: 60): [0] casillas bloqueadas desde el final · [1] 9 si hay filtros
//      · [10 + n] filtro de la casilla n
//   Estaciones (2103: 4 productos, 2104: 5): producto n en [6n .. 6n+5] = objeto, local, remoto, límite, ?, ?
//      (0 almacén, 1 ofrecer, 2 pedir) · puerto de cinta p en [192 + 4p] = sentido (1 sale, 2 entra), producto (1..n)
//      · [320] potencia de carga (J/tick) · [321] alcance de drones (cos × 1e8) · [322] alcance de naves (m)
//      · [323] colector orbital · [324] distancia de curvatura (m) · [325] exigir curvadores
//      · [326] carga mínima drones % · [327] carga mínima naves % · [328] apilado de salida (0 = límite de tecnología)
//      · [330] reponer drones solos · [331] reponer naves solas
//   Divisor (2020): [hueco 0..3] = 1 si ese puerto tiene prioridad. El filtro (filterId) va a la salida con prioridad.
(function (root) {
  const AU = 40000, LY = 60 * AU;
  const STATION_SLOTS = { 2103: 4, 2104: 5 };
  const DEPOT_SLOTS = { 2101: 30, 2102: 60 };
  const PORT0 = 192, SET0 = 320;
  const r2 = (v) => Math.round(v * 100) / 100;

  function ensure(b, n) {
    if (!Array.isArray(b.parameters)) b.parameters = [];
    while (b.parameters.length < n) b.parameters.push(0);
    return b.parameters;
  }
  const flag = (v) => (v ? 1 : 0);

  function read(b) {
    const p = b.parameters || [], id = b.itemId, g = (i) => p[i] || 0;
    if (id === 2208) return { mode: g(0) ? 'photon' : 'power' };
    if (id === 2107) {
      return { item: b.filterId || 0, icarus: g(0), distributors: g(1), chargeMW: r2(g(2) * 60 / 1e6), autoBots: !!g(3) };
    }
    if (DEPOT_SLOTS[id]) {
      const n = DEPOT_SLOTS[id];
      return { slots: n, usable: n - Math.min(n, g(0)), filters: Array.from({ length: n }, (_, i) => g(10 + i)) };
    }
    if (STATION_SLOTS[id]) {
      const n = STATION_SLOTS[id], s = (k) => g(SET0 + k);
      const cos = Math.max(-1, Math.min(1, s(1) / 1e8));
      return {
        interstellar: id === 2104,
        slots: Array.from({ length: n }, (_, i) => ({ item: g(6 * i), local: g(6 * i + 1), remote: g(6 * i + 2), max: g(6 * i + 3) })),
        ports: Array.from({ length: 12 }, (_, i) => ({ dir: g(PORT0 + 4 * i), storage: g(PORT0 + 4 * i + 1) })),
        chargeMW: r2(s(0) * 60 / 1e6),
        droneRange: Math.round(Math.acos(cos) * 180 / Math.PI),
        vesselRangeLY: r2(s(2) / LY),
        orbitalCollector: !!s(3),
        warpAU: r2(s(4) / AU),
        warpersRequired: !!s(5),
        droneMinLoad: s(6),
        vesselMinLoad: s(7),
        outgoingCount: s(8),
        autoDrones: !!s(10),
        autoVessels: !!s(11),
      };
    }
    if (id === 2020) return { priority: [0, 1, 2, 3].map((i) => !!g(i)), filter: b.filterId || 0 };
    return null;
  }

  function write(b, o) {
    const id = b.itemId;
    if (id === 2208) {
      if ('mode' in o) b.parameters = [o.mode === 'photon' || o.mode === 1208 ? 1208 : 0];
      return true;
    }
    if (id === 2107) {
      const p = ensure(b, 128);
      if ('item' in o) b.filterId = o.item | 0;
      if ('icarus' in o) p[0] = o.icarus | 0;
      if ('distributors' in o) p[1] = o.distributors | 0;
      if ('chargeMW' in o) p[2] = Math.round(o.chargeMW * 1e6 / 60);
      if ('autoBots' in o) p[3] = flag(o.autoBots);
      return true;
    }
    if (DEPOT_SLOTS[id]) {
      const n = DEPOT_SLOTS[id], p = ensure(b, 110);
      if ('usable' in o) p[0] = n - Math.max(0, Math.min(n, o.usable | 0));
      if (o.filters) o.filters.forEach((f, i) => { if (i < n && f !== undefined && f !== null) p[10 + i] = f | 0; });
      if (p.slice(10, 10 + n).some(Boolean)) p[1] = 9;
      else if (p[1] === 9) p[1] = 0;
      return true;
    }
    if (STATION_SLOTS[id]) {
      const n = STATION_SLOTS[id], p = ensure(b, 2048), set = (k, v) => { p[SET0 + k] = v; };
      if (o.slots) {
        o.slots.forEach((s, i) => {
          if (!s || i >= n) return;
          const k = 6 * i;
          if ('item' in s) p[k] = s.item | 0;
          if ('local' in s) p[k + 1] = s.local | 0;
          if ('remote' in s) p[k + 2] = s.remote | 0;
          if ('max' in s) p[k + 3] = Math.max(0, s.max | 0);
          if (!p[k]) for (let j = 0; j < 6; j++) p[k + j] = 0;
        });
        // los puertos que sacaban un producto que ya no está, no sacan nada
        for (let i = 0; i < 12; i++) { const st = p[PORT0 + 4 * i + 1]; if (st && !p[6 * (st - 1)]) p[PORT0 + 4 * i + 1] = 0; }
      }
      if (o.ports) {
        o.ports.forEach((q, i) => {
          if (!q || i >= 12) return;
          if ('dir' in q) p[PORT0 + 4 * i] = q.dir | 0;
          if ('storage' in q) p[PORT0 + 4 * i + 1] = Math.max(0, Math.min(n, q.storage | 0));
        });
      }
      if ('chargeMW' in o) set(0, Math.round(o.chargeMW * 1e6 / 60));
      if ('droneRange' in o) set(1, Math.round(Math.cos(Math.max(1, Math.min(180, o.droneRange)) * Math.PI / 180) * 1e8));
      if ('vesselRangeLY' in o) set(2, Math.round(o.vesselRangeLY * LY));
      if ('orbitalCollector' in o) set(3, flag(o.orbitalCollector));
      if ('warpAU' in o) set(4, Math.round(o.warpAU * AU));
      if ('warpersRequired' in o) set(5, flag(o.warpersRequired));
      if ('droneMinLoad' in o) set(6, Math.max(1, Math.min(100, o.droneMinLoad | 0)));
      if ('vesselMinLoad' in o) set(7, Math.max(1, Math.min(100, o.vesselMinLoad | 0)));
      if ('outgoingCount' in o) set(8, Math.max(0, o.outgoingCount | 0));
      if ('autoDrones' in o) set(10, flag(o.autoDrones));
      if ('autoVessels' in o) set(11, flag(o.autoVessels));
      return true;
    }
    if (id === 2020) {
      const p = ensure(b, 6);
      if (o.priority) o.priority.forEach((v, i) => { if (i < 4 && v !== undefined && v !== null) p[i] = flag(v); });
      if ('filter' in o) b.filterId = o.filter | 0;
      return true;
    }
    return false;
  }

  root.DSPProps = { read, write, STATION_SLOTS, DEPOT_SLOTS, AU, LY };
  if (typeof module !== 'undefined') module.exports = root.DSPProps;
})(typeof window !== 'undefined' ? window : globalThis);
