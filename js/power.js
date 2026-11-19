// Cobertura eléctrica: qué edificios quedan dentro del área de suministro de alguna torre.
//
//   DSPPower.NODES            { edificio: { cover, conn, est } } en metros, como los da el juego
//   DSPPower.radius(itemId)   → { cover, conn, est } en casillas, o null si el edificio no reparte energía
//   DSPPower.analyze(buildings) → {
//     nodes:     [{ i, cover, conn }]   torres del blueprint (radios en casillas)
//     consumers: nº de edificios que necesitan energía
//     unpowered: Set(índice)            consumidores fuera de toda área de suministro
//     links:     [[i, j]]               torres enlazadas (índices de edificio)
//     networks:  nº de redes separadas
//     loose:     Set(índice)            torres que no están en la red más grande
//   }
//
// Modelo (como en el juego): un edificio tiene energía si el área de suministro de alguna torre llega a su centro;
// un clasificador, si llega a su inicio (el extremo del que coge). Un blueprint sin ninguna torre no se comprueba:
// la energía le llegará de fuera. Los generadores y las propias torres no cuentan como consumidores (se enlazan
// por longitud de conexión). Las cintas no gastan.
//
// Enlaces: dos torres se unen si su distancia no pasa de la longitud de conexión de la que más alcanza (en el
// juego una Tesla lejana se engancha a una subestación satélite). Las casillas se cuentan como en el ecuador,
// donde son más anchas (1,2566 m): es el peor caso. Hacia los polos las casillas se estrechan de este a oeste y
// las mismas torres llegan a más casillas (hay blueprints tuyos con Teslas a 20–22 casillas en horizontal).
//
// Valores: la ficha del juego da Tesla 22 m / 10 m, torre inalámbrica 45 m / 6 m y subestación satélite 53 m / 26 m
// (conexión / cobertura). La ficha quita el medio metro: en tus blueprints hay hornos a 8,06 casillas (10,1 m) de
// una Tesla, más de 10 m, así que el valor real es el de la ficha + 0,5.
// est: true = valor de memoria, sin comprobar con datos del juego (turbina eólica).
(function (root) {
  const M = root.DSPMachines || {};
  const CELL = 1.2566;   // metros por casilla: planeta de radio 200 m, 1000 casillas en el ecuador
  const NODES = {
    2201: { cover: 10.5, conn: 22.5 },              // torre Tesla
    2202: { cover: 6.5, conn: 45.5 },               // torre de energía inalámbrica
    2212: { cover: 26.5, conn: 53.5 },              // subestación satélite
    2203: { cover: 14.5, conn: 30.5, est: true },   // turbina eólica (genera y reparte)
  };
  const radius = (id) => (NODES[id] ? { cover: NODES[id].cover / CELL, conn: NODES[id].conn / CELL, est: !!NODES[id].est } : null);
  const consumes = (b) => { const m = M[b.itemId]; return !!m && !NODES[b.itemId] && ((m.work || 0) > 0 || (m.idle || 0) > 0); };

  function analyze(bs) {
    const nodes = [];
    bs.forEach((b, i) => { const r = radius(b.itemId); if (r) nodes.push({ i, x: b.x, y: b.y, cover: r.cover, conn: r.conn }); });
    const unpowered = new Set();
    let consumers = 0;
    bs.forEach((b, i) => {
      if (!consumes(b)) return;
      consumers++;
      if (!nodes.length) return;
      // b.x, b.y es el centro del edificio y, en un clasificador, su inicio
      for (const n of nodes) {
        const dx = n.x - b.x, dy = n.y - b.y, r = n.cover + 0.05;
        if (dx * dx + dy * dy <= r * r) return;
      }
      unpowered.add(i);
    });
    // redes: torres enlazadas entre sí
    const parent = nodes.map((_, k) => k), find = (k) => { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
    const links = [];
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
      const r = Math.max(nodes[a].conn, nodes[b].conn) + 0.05, dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y;
      if (Math.abs(dx) > r || Math.abs(dy) > r || dx * dx + dy * dy > r * r) continue;
      links.push([nodes[a].i, nodes[b].i]); parent[find(a)] = find(b);
    }
    const size = new Map();
    nodes.forEach((_, k) => size.set(find(k), (size.get(find(k)) || 0) + 1));
    let main = -1; for (const [k, n] of size) if (main < 0 || n > size.get(main)) main = k;
    const loose = new Set(nodes.filter((_, k) => find(k) !== main).map((n) => n.i));
    return { nodes, consumers, unpowered, links, networks: size.size, loose };
  }

  root.DSPPower = { NODES, CELL, radius, consumes, analyze };
  if (typeof module !== 'undefined') module.exports = root.DSPPower;
})(typeof window !== 'undefined' ? window : globalThis);
