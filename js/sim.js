// Simulación de flujo en régimen estable: cuántos objetos por minuto pasan por cada cinta, clasificador y
// máquina una vez estabilizado el blueprint.
//
//   DSPSim.run(buildings, { openEnds }) → {
//     belts:    Map(cinta → { objeto: /min })            lo que pasa por la casilla (antes de que cojan de ella)
//     sorters:  Map(clasificador → { objeto: /min })
//     machines: Map(máquina → { r, rIn, rOut, limit, need, prod, got, made })
//               r = fracción de su velocidad máxima (0…1); limit = { kind, item }: 'input' (no le llega bastante),
//               'sorter' (llega, pero sus clasificadores no dan abasto), 'output' (no le sacan lo que fabrica) o 'none'
//     sources:  Map(edificio o cinta → { objeto: /min })   sinks: Map(edificio → { objeto: /min })
//     jams:     [{ i, item, rate }]  cintas con mezcla en las que sobra un producto que nadie recoge (se atascan)
//     iterations, converged
//   }
//
// Modelo:
//   · Cintas: Mk.I 360/min, Mk.II 720, Mk.III 1800. Cada casilla es un nodo, así que los clasificadores de más
//     arriba cogen primero. Lo que llega por detrás tiene prioridad sobre lo que entra por un lado.
//   · Fuentes (meten lo que quepa y se consuma): puertos de salida de estaciones (cinta llena del producto elegido),
//     monitores de tráfico que generan y cintas con etiqueta sin nada antes.
//   · Sumideros: monitores que consumen, puertos de entrada de estaciones (lo que tengan en sus casillas) y
//     almacenes sin clasificadores de salida. Con openEnds, también el final de las cintas sin salida (para probar
//     sin poner consumidores); sin él, una cinta sin salida se llena y se para, como en el juego.
//   · Contrapresión: lo que no se consume no entra. Una máquina va a la velocidad que le permiten su entrada más
//     escasa y lo que le pueden sacar (si se le llena una salida, se para).
//   · Clasificadores: capacidad de js/rates.js (Mk.I 90/min con 1 casilla, 45 con 2, 30 con 3).
//   · Sin proliferador ni apilado en la cinta. El fraccionador se aproxima (1 % del hidrógeno que pasa).
// Se resuelve por iteraciones: demanda hacia atrás, suministro hacia delante y velocidad de cada máquina.
(function (root) {
  const R = root.DSPRecipes || {}, P = root.DSPProps, RT = root.DSPRates;
  const BELT_CAP = { 2001: 360, 2002: 720, 2003: 1800 };
  const isBelt = (b) => !!b && BELT_CAP[b.itemId] !== undefined;
  const isSorter = (b) => !!b && b.itemId >= 2011 && b.itemId <= 2014;
  const DEPOT = new Set([2101, 2102, 2106]);
  const EPS = 1e-6;
  const total = (o) => { let s = 0; for (const k in o) s += o[k]; return s; };
  const add = (o, k, v) => { if (v > EPS) o[k] = (o[k] || 0) + v; };
  const bag = (m, k) => { if (!m.has(k)) m.set(k, {}); return m.get(k); };

  function run(bs, opts = {}) {
    const N = bs.length, maxIt = opts.iterations || 400;
    const isStation = (b) => !!b && !!P && !!P.STATION_SLOTS[b.itemId];
    const recipeOK = (b) => b && !isBelt(b) && !isSorter(b) && !isStation(b) && b.itemId !== 2314 && b.recipeId && R[b.recipeId] && R[b.recipeId].in;

    // ---------------------------------------------------------------- grafo
    const key = (b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.z)}`;
    const beltAt = new Map();
    const preds = Array.from({ length: N }, () => []);
    const portIn = new Map(), portOut = new Map();          // edificio → [[slot, cinta]]
    const list = (m, k) => { if (!m.has(k)) m.set(k, []); return m.get(k); };
    bs.forEach((b, i) => {
      if (!isBelt(b)) return;
      beltAt.set(key(b), i);
      const o = bs[b.outputObjIdx], f = bs[b.inputObjIdx];
      if (isBelt(o)) preds[b.outputObjIdx].push(i);
      else if (o) list(portIn, b.outputObjIdx).push([b.outputToSlot, i]);
      if (f && !isBelt(f)) list(portOut, b.inputObjIdx).push([b.inputFromSlot, i]);
    });
    const next = (i) => (isBelt(bs[bs[i].outputObjIdx]) ? bs[i].outputObjIdx : -1);
    // la cinta principal es la que llega por detrás, en línea con la dirección de avance
    const mainPred = new Int32Array(N).fill(-1);
    bs.forEach((b, i) => {
      if (!isBelt(b) || !preds[i].length) return;
      const a = b.yaw * Math.PI / 180, bx = b.x - Math.sin(a), by = b.y - Math.cos(a);
      let best = preds[i][0], bd = Infinity;
      for (const p of preds[i]) { const d = Math.hypot(bs[p].x - bx, bs[p].y - by) + Math.abs(bs[p].z - b.z); if (d < bd) { bd = d; best = p; } }
      mainPred[i] = best;
    });
    const pickAt = Array.from({ length: N }, () => []), dropAt = Array.from({ length: N }, () => []);
    const sOut = new Map();                                  // edificio → clasificadores que sacan de él
    bs.forEach((s, i) => {
      if (!isSorter(s)) return;
      const src = bs[s.inputObjIdx], dst = bs[s.outputObjIdx];
      if (!src || !dst) return;
      if (isBelt(src)) pickAt[s.inputObjIdx].push(i); else list(sOut, s.inputObjIdx).push(i);
      if (isBelt(dst)) dropAt[s.outputObjIdx].push(i);
    });
    const cap = (i) => (isSorter(bs[i]) ? RT.sorter(bs[i]) : BELT_CAP[bs[i].itemId] || 0);
    const filterOk = (s, x) => !bs[s].filterId || bs[s].filterId === +x;
    const base = (i) => { let n = 0; while (bs[i] && DEPOT.has(bs[i].itemId) && bs[bs[i].inputObjIdx] && DEPOT.has(bs[bs[i].inputObjIdx].itemId) && n++ < 20) i = bs[i].inputObjIdx; return i; };
    const depotOuts = new Map();
    bs.forEach((b, i) => { if (DEPOT.has(b.itemId)) for (const s of sOut.get(i) || []) list(depotOuts, base(i)).push(s); });
    const stationAccepts = (st, x) => P.read(st).slots.some((s) => s.item === +x);
    const isJunction = (j) => !!bs[j] && !isBelt(bs[j]) && !isStation(bs[j]) && (portOut.get(j) || []).length > 0;

    // fuentes y sumideros fijos en cintas
    const offer = Array.from({ length: N }, () => null), offerBy = new Int32Array(N).fill(-1);
    const sinkAt = new Map();                                // cinta → [monitor, objeto (0 = todo)]
    bs.forEach((b, i) => {
      if (b.itemId === 2030 && P) {
        const p = P.read(b), bi = beltAt.get(key(b));
        if (bi === undefined) return;
        if (p.mode === 'generate' && p.item) { offer[bi] = { [p.item]: cap(bi) }; offerBy[bi] = i; }
        if (p.mode === 'consume') sinkAt.set(bi, [i, p.item || 0]);
      } else if (isStation(b)) {
        const p = P.read(b);
        for (const [slot, bi] of portOut.get(i) || []) {
          const st = p.ports[slot] && p.ports[slot].storage, it = st && p.slots[st - 1] ? p.slots[st - 1].item : 0;
          if (it) { offer[bi] = { [it]: cap(bi) }; offerBy[bi] = i; }
        }
      }
    });
    // Cinta con etiqueta como fuente: si antes de ella no entra nada en la cinta (ni cintas por un lado, ni
    // edificios, ni clasificadores, ni monitores) y después ninguna máquina deja ese producto en ella. Así una
    // etiqueta en una cinta de salida (lingotes que dejan los hornos) no se inventa producto.
    const fed = (i) => offer[i] || dropAt[i].length || (bs[bs[i].inputObjIdx] && !isBelt(bs[bs[i].inputObjIdx]));
    const headClean = (i) => { const seen = new Set(); const st = [...preds[i]]; while (st.length) { const p = st.pop(); if (seen.has(p)) continue; seen.add(p); if (fed(p)) return false; st.push(...preds[p]); } return true; };
    const producedAfter = (i, x) => {
      for (let k = i, n = 0; k >= 0 && n < 5000; k = next(k), n++) {
        for (const s of dropAt[k]) { const src = bs[bs[s].inputObjIdx]; if (src && !isBelt(src) && filterOk(s, x)) { const r = recipeOK(src) && R[src.recipeId]; if (!r || r.out.some(([id]) => id === x)) return true; } }
        if (k !== i && offer[k] && offer[k][x]) return true;
      }
      return false;
    };
    bs.forEach((b, i) => {
      const x = isBelt(b) && b.parameters && b.parameters[0];
      if (x > 0 && !offer[i] && !(bs[b.inputObjIdx] && !isBelt(bs[b.inputObjIdx])) && !dropAt[i].length && headClean(i) && !producedAfter(i, x)) {
        offer[i] = { [x]: cap(i) }; offerBy[i] = i;
      }
    });

    // orden: de las fuentes hacia el final (los ciclos se resuelven iterando)
    const order = [], state = new Uint8Array(N);
    const visit = (i) => {
      if (state[i]) return; state[i] = 1;
      for (const p of preds[i]) visit(p);
      const j = bs[i].inputObjIdx;
      if (isJunction(j)) for (const [, bi] of portIn.get(j) || []) visit(bi);
      for (const s of dropAt[i]) if (isBelt(bs[bs[s].inputObjIdx])) visit(bs[s].inputObjIdx);
      order.push(i);
    };
    bs.forEach((b, i) => { if (isBelt(b)) visit(i); });

    // ---------------------------------------------------------------- estado
    const machines = new Map();
    bs.forEach((b, i) => {
      const m = recipeOK(b) && RT.machine(b);
      if (m) machines.set(i, { need: Object.fromEntries(m.in), prod: Object.fromEntries(m.out), r: 1, rIn: 1, rOut: 1, bound: 1, got: {}, gotBy: {}, limit: { kind: 'none', item: 0 } });
    });
    let flow = Array.from({ length: N }, () => ({}));       // lo que pasa por cada cinta (antes de que cojan)
    let pass = Array.from({ length: N }, () => ({}));       // lo que sigue hacia delante
    let moved = Array.from({ length: N }, () => ({}));
    let mainIn = Array.from({ length: N }, () => ({}));     // lo que llegó por detrás
    let depotIn = new Map();
    let sinks = new Map(), sources = new Map(), jams = [];

    // Lo que pide una máquina de x. Hacia atrás (demanda) se pide como si las demás entradas llegasen (si no, una
    // máquina que recibe poco pediría poco y nunca saldría de ahí); al repartir, solo lo que puede gastar.
    // En la pasada final, lo que gasta de verdad.
    let phase = 'dem', final = false;
    const want = (m, x) => (m.need[x] ? m.need[x] * (final ? m.r : phase === 'dem' ? m.rOut : Math.min(m.rOut, m.bound)) : 0);
    // cuánto de x querría llevar el clasificador s a su destino (dem: demanda de las cintas)
    function sorterWant(s, x, dem, got) {
      if (!filterOk(s, x)) return 0;
      const d = bs[s].outputObjIdx, dst = bs[d];
      let w = 0;
      if (isBelt(dst)) w = (dem[d] || {})[x] || 0;
      else if (machines.has(d)) { const m = machines.get(d), g = got(d); w = Math.max(0, want(m, x) - ((g.got[x] || 0) - ((g.gotBy[s] || {})[x] || 0))); }
      else if (DEPOT.has(dst.itemId)) { const outs = depotOuts.get(base(d)) || []; w = outs.length ? outs.reduce((a, o) => a + sorterWant(o, x, dem, got), 0) : Infinity; }
      else if (isStation(dst)) w = stationAccepts(dst, x) ? Infinity : 0;
      return Math.min(cap(s), w);
    }

    let it = 0, converged = false;
    for (; it < maxIt + 1; it++) {
      if (converged || it === maxIt) final = true;   // última vuelta: flujos con lo que gasta cada máquina
      // objetos que pueden aparecer
      const items = new Set();
      for (const o of offer) if (o) for (const k in o) items.add(+k);
      for (const m of machines.values()) for (const k in m.prod) items.add(+k);
      for (const f of flow) for (const k in f) items.add(+k);

      // 1. demanda hacia atrás: cuánto de cada objeto se llevarían desde cada casilla en adelante
      phase = 'dem';
      const prevGot = (d) => machines.get(d);
      const dem = Array.from({ length: N }, () => null);
      const junctionDem = (j, x, from) => {
        const b = bs[j], outs = portOut.get(j) || [], pr = b.itemId === 2020 && P ? P.read(b).priority : [];
        let d = 0;
        for (const [slot, o] of outs) if (!(b.filterId && pr[slot] && +x !== b.filterId)) d += (dem[o] || {})[x] || 0;
        // entrada con prioridad: las demás se quedan con lo que no llene ella
        const pin = (portIn.get(j) || []).find(([slot]) => pr[slot]);
        if (pin && pin[1] !== from) d = Math.max(0, d - ((pass[pin[1]] || {})[x] || 0));
        return d;
      };
      for (let k = order.length - 1; k >= 0; k--) {
        const i = order[k], d = {};
        const sink = sinkAt.get(i);
        for (const x of items) {
          let v = 0;
          if (sink && (sink[1] === 0 || sink[1] === x)) v = Infinity;
          for (const s of pickAt[i]) v += sorterWant(s, x, dem, prevGot);
          const n = next(i);
          if (n >= 0) v += mainPred[n] === i ? (dem[n] || {})[x] || 0 : Math.max(0, ((dem[n] || {})[x] || 0) - (mainIn[n][x] || 0));
          else {
            const j = bs[i].outputObjIdx, o = bs[j];
            if (isStation(o)) v += stationAccepts(o, x) ? Infinity : 0;
            else if (isJunction(j)) v += junctionDem(j, x, i);
            else if (opts.openEnds) v = Infinity;
          }
          v = Math.min(cap(i), v);
          if (v > EPS) d[x] = v;
        }
        dem[i] = d;
      }

      // 2. suministro hacia delante
      phase = 'sup';
      const nflow = Array.from({ length: N }, () => ({})), npass = Array.from({ length: N }, () => ({}));
      const nmoved = Array.from({ length: N }, () => ({})), nmain = Array.from({ length: N }, () => ({}));
      const ndepot = new Map(), nsinks = new Map(), nsources = new Map(), rejected = Array.from({ length: N }, () => ({}));
      const drops = Array.from({ length: N }, () => ({}));   // cinta → lo que le dejan clasificadores desde otra cinta
      const jIn = new Map(), jOut = new Map();
      const cur = new Map();                                 // máquina → lo recibido en esta vuelta
      for (const [mi, m] of machines) { cur.set(mi, { got: {}, gotBy: {}, pot: {}, avail: {}, scap: {} }); m.left = {}; m.outCap = {}; m.made = {}; for (const x in m.prod) m.left[x] = m.prod[x] * m.r; }
      const curGot = (d) => cur.get(d);
      const depotLeft = new Map([...depotIn].map(([k, v]) => [k, { ...v }]));
      const sorterRoom = (s) => cap(s) - total(nmoved[s]);

      // de una máquina o almacén: entrega como mucho room
      const takeFrom = (s, x, room) => {
        const si = bs[s].inputObjIdx;
        let avail = 0;
        if (machines.has(si)) { const m = machines.get(si); avail = m.left[x] || 0; m.outCap[x] = (m.outCap[x] || 0) + Math.max(0, Math.min(room, sorterRoom(s))); }
        else if (DEPOT.has(bs[si].itemId)) avail = (depotLeft.get(base(si)) || {})[x] || 0;
        const t = Math.max(0, Math.min(avail, room, sorterRoom(s)));
        if (t > EPS) {
          add(nmoved[s], x, t);
          if (machines.has(si)) { const m = machines.get(si); m.left[x] -= t; add(m.made, x, t); } else depotLeft.get(base(si))[x] -= t;
        }
        return t;
      };
      // al destino de un clasificador (que no sea una cinta)
      const deliver = (s, x, t) => {
        const d = bs[s].outputObjIdx, dst = bs[d];
        if (t <= EPS) return;
        if (machines.has(d)) { const g = cur.get(d); add(g.got, x, t); add(g.gotBy[s] || (g.gotBy[s] = {}), x, t); }
        else if (DEPOT.has(dst.itemId)) { const k = base(d); add(bag(ndepot, k), x, t); if (!(depotOuts.get(k) || []).length) add(bag(nsinks, k), x, t); }
        else if (isStation(dst)) add(bag(nsinks, d), x, t);
      };
      // lo que podría llegarle a una máquina por el clasificador s (v: lo que hay en origen)
    const potential = (s, x, v) => { const d = bs[s].outputObjIdx; if (machines.has(d) && machines.get(d).need[x]) { const g = cur.get(d); add(g.pot, x, Math.min(v, cap(s))); add(g.avail, x, v); add(g.scap, x, cap(s)); } };

      // a. de edificio a edificio (máquina → máquina, → almacén, almacén → máquina)
      bs.forEach((s, i) => {
        if (!isSorter(s)) return;
        const si = s.inputObjIdx, src = bs[si], dst = bs[s.outputObjIdx];
        if (!src || !dst || isBelt(src) || isBelt(dst)) return;
        const xs = machines.has(si) ? Object.keys(machines.get(si).prod) : DEPOT.has(src.itemId) ? Object.keys(depotIn.get(base(si)) || {}) : [];
        for (const x of xs) {
          if (!filterOk(i, x)) continue;
          potential(i, x, machines.has(si) ? machines.get(si).prod[x] : (depotIn.get(base(si)) || {})[x] || 0);
          deliver(i, +x, takeFrom(i, x, sorterWant(i, x, dem, curGot)));
        }
      });

      // b. cintas en orden
      for (const i of order) {
        const b = bs[i], c = cap(i), d = dem[i] || {}, f = {};
        const room = () => Math.max(0, c - total(f));
        const fits = (x, v) => Math.max(0, Math.min(v, room(), (d[x] || 0) - (f[x] || 0)));
        // lo que llega por detrás, y luego por los lados
        const ins = mainPred[i] >= 0 ? [mainPred[i], ...preds[i].filter((p) => p !== mainPred[i])] : preds[i];
        for (const p of ins) for (const k in npass[p]) {
          const v = npass[p][k], t = Math.min(v, room());
          add(f, k, t); if (p === mainPred[i]) add(nmain[i], k, t);
          if (v - t > EPS) add(rejected[p], k, v - t);
        }
        // sale de un divisor u otro edificio con puertos
        const j = b.inputObjIdx;
        if (isJunction(j)) {
          if (!jOut.has(j)) jOut.set(j, distribute(j, jIn.get(j) || {}, dem, rejected));
          for (const [k, v] of Object.entries(jOut.get(j).get(i) || {})) add(f, k, Math.min(v, room()));
        }
        // fuentes: estación, monitor que genera, cinta con etiqueta
        if (offer[i]) for (const [k, v] of Object.entries(offer[i])) { const t = fits(k, v); add(f, k, t); add(bag(nsources, offerBy[i]), k, t); }
        // lo que dejan clasificadores que vienen de otra cinta (ya cogido arriba)
        for (const k in drops[i]) add(f, k, Math.min(drops[i][k], room()));
        // lo que dejan clasificadores que vienen de máquinas o almacenes
        for (const s of dropAt[i]) {
          const si = bs[s].inputObjIdx, src = bs[si];
          if (isBelt(src)) continue;
          const xs = machines.has(si) ? Object.keys(machines.get(si).prod) : DEPOT.has(src.itemId) ? Object.keys(depotIn.get(base(si)) || {}) : [];
          for (const x of xs) if (filterOk(s, x)) add(f, x, takeFrom(s, x, Math.max(0, Math.min(room(), (d[x] || 0) - (f[x] || 0)))));
        }
        nflow[i] = { ...f };
        // los clasificadores que cogen de aquí
        const out = { ...f };
        for (const s of pickAt[i]) {
          for (const k in out) {
            if (!filterOk(s, k)) continue;
            potential(s, k, out[k]);
            const dst = bs[s].outputObjIdx;
            const w = sorterWant(s, +k, isBelt(bs[dst]) ? dem : dem, curGot);
            const t = Math.max(0, Math.min(out[k], w, sorterRoom(s)));
            if (t <= EPS) continue;
            out[k] -= t; add(nmoved[s], k, t);
            if (isBelt(bs[dst])) add(drops[dst], k, t); else deliver(s, +k, t);
          }
        }
        // monitor que consume en esta casilla
        const sink = sinkAt.get(i);
        if (sink) for (const k in out) if (sink[1] === 0 || sink[1] === +k) { add(bag(nsinks, sink[0]), k, out[k]); out[k] = 0; }
        for (const k in out) if (out[k] <= EPS) delete out[k];
        npass[i] = out;
        // final de la cinta
        if (next(i) < 0) {
          const jj = b.outputObjIdx, o = bs[jj];
          if (isStation(o)) { for (const k in out) { if (stationAccepts(o, k)) add(bag(nsinks, jj), k, out[k]); else add(rejected[i], k, out[k]); } }
          else if (isJunction(jj)) { const acc = jIn.get(jj) || {}; for (const k in out) add(acc, k, out[k]); jIn.set(jj, acc); }
          else if (opts.openEnds) for (const k in out) add(bag(nsinks, i), k, out[k]);
          else for (const k in out) add(rejected[i], k, out[k]);
        }
      }

      // 3. velocidad de cada máquina
      let delta = 0;
      for (const [mi, m] of machines) {
        const g = cur.get(mi);
        let rIn = 1, bound = 1, lim = { kind: 'none', item: 0 };
        // la entrada que frena es la más escasa en origen (lo que podría llegarle), no la que menos recibe:
        // si falta una, de las demás solo coge lo que puede gastar
        let scarce = 1;
        for (const x in m.need) {
          rIn = Math.min(rIn, (g.got[x] || 0) / m.need[x]);
          const p = (g.pot[x] || 0) / m.need[x];
          bound = Math.min(bound, p);
          if (p < scarce - EPS) { scarce = p; lim = { kind: (g.scap[x] || 0) < (g.avail[x] || 0) - EPS ? 'sorter' : 'input', item: +x }; }
        }
        let rOut = 1, outItem = 0;
        for (const x in m.prod) { const r = (m.outCap[x] || 0) / m.prod[x]; if (r < rOut) { rOut = r; outItem = +x; } }
        if (rOut < scarce - EPS) lim = { kind: 'output', item: outItem };
        rIn = Math.min(1, rIn); rOut = Math.max(0, Math.min(1, rOut));
        if (final) { m.got = g.got; continue; }
        const r = Math.min(rIn, rOut);
        delta = Math.max(delta, Math.abs(r - m.r), Math.abs(rOut - m.rOut));
        m.r = r; m.rIn = rIn; m.rOut = rOut; m.bound = Math.max(Math.min(1, bound), 0.001); m.limit = lim; m.got = g.got; m.gotBy = g.gotBy;
      }
      for (let i = 0; i < N; i++) {
        if (!isBelt(bs[i])) continue;
        for (const k in nflow[i]) delta = Math.max(delta, Math.abs(nflow[i][k] - (flow[i][k] || 0)));
        for (const k in flow[i]) if (!(k in nflow[i])) delta = Math.max(delta, flow[i][k]);
      }
      flow = nflow; pass = npass; moved = nmoved; mainIn = nmain; depotIn = ndepot; sinks = nsinks; sources = nsources;
      // atascos: en una cinta con mezcla sobra un producto que nadie recoge
      jams = [];
      for (let i = 0; i < N; i++) for (const k in rejected[i]) if (rejected[i][k] > 0.5 && Object.keys(flow[i]).length > 1) jams.push({ i, item: +k, rate: rejected[i][k] });
      if (final) break;
      converged = it > 2 && delta < 0.01;
    }

    // reparto de un divisor (u otro edificio con puertos de cinta): prioridad y filtro primero, el resto a partes iguales
    function distribute(j, acc, dem, rejected) {
      const b = bs[j], outs = portOut.get(j) || [], pr = b.itemId === 2020 && P ? P.read(b).priority : [];
      const res = new Map(outs.map(([, o]) => [o, {}]));
      const items = { ...acc };
      if (b.itemId === 2314 && items[1120]) items[1121] = (items[1121] || 0) + items[1120] * 0.01;   // fraccionador
      const roomOf = (o, k) => Math.max(0, ((dem[o] || {})[k] || 0) - (res.get(o)[k] || 0));
      for (const k in items) {
        let v = items[k];
        for (const [slot, o] of outs) if (pr[slot] && (!b.filterId || b.filterId === +k)) { const t = Math.min(v, roomOf(o, k)); add(res.get(o), k, t); v -= t; }
        let open = outs.filter(([slot, o]) => !pr[slot] && !(b.filterId && pr[slot]) && roomOf(o, k) > EPS);
        if (b.filterId && b.filterId !== +k) open = open.concat([]);
        while (v > EPS && open.length) {
          const share = v / open.length, keep = [];
          for (const [slot, o] of open) { const t = Math.min(share, roomOf(o, k)); add(res.get(o), k, t); v -= t; if (roomOf(o, k) > EPS) keep.push([slot, o]); }
          if (keep.length === open.length && share * open.length - v < EPS) break;
          open = keep;
        }
        if (v > EPS) { const ins = portIn.get(j) || []; for (const [, bi] of ins) add(rejected[bi], k, v / ins.length); }
      }
      return res;
    }

    return {
      belts: new Map(flow.map((f, i) => [i, f]).filter(([i]) => isBelt(bs[i]))),
      sorters: new Map(moved.map((f, i) => [i, f]).filter(([i]) => isSorter(bs[i]))),
      machines: new Map([...machines].map(([i, m]) => [i, { r: m.r, rIn: m.rIn, rOut: m.rOut, limit: m.limit, need: m.need, prod: m.prod, got: m.got, made: m.made }])),
      sources: new Map([...sources].filter(([, v]) => Object.keys(v).length)), sinks: new Map([...sinks].filter(([, v]) => Object.keys(v).length)),
      jams, iterations: it, converged,
    };
  }

  root.DSPSim = { run, BELT_CAP };
  if (typeof module !== 'undefined') module.exports = root.DSPSim;
})(typeof window !== 'undefined' ? window : globalThis);
