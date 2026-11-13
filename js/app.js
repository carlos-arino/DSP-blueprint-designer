/* Editor de blueprints de Dyson Sphere Program */
(function () {
  'use strict';
  const BP = window.DSPBP;
  const IT = window.DSPItems;
  const PR = window.DSPProps;   // propiedades de edificios (js/props.js)
  const RT = window.DSPRates;   // ritmos de producción y potencia (js/rates.js)
  const FL = window.DSPFlow;    // qué productos llegan a cada sitio (js/flow.js)
  const SM = window.DSPSim;     // simulación de flujo en régimen estable (js/sim.js)
  const I18N = window.DSPI18n;  // idiomas (js/i18n.js)
  const t = I18N.t;
  const $ = (id) => document.getElementById(id);

  // Colores por nivel, iguales para cintas y clasificadores (Mk.I amarillo, Mk.II verde, Mk.III azul)
  const BELT_COLORS = {
    2001: '#d1b13e', 2002: '#58c46a', 2003: '#4f9dff',
    2011: '#d1b13e', 2012: '#58c46a', 2013: '#4f9dff', 2014: '#e6ecf5',
  };
  const PRODUCTION = new Set(['smelt', 'assembly', 'chem', 'research']);
  const isBelt = (b) => BP.BELTS.has(b.itemId);
  const isSorter = (b) => BP.SORTERS.has(b.itemId);

  // ------------------------------------------------------------------ estado
  const S = {
    bp: null, name: '', fileHandle: null, dirHandle: null, library: [],
    sel: new Set(), view: { cx: 0, cy: 0, scale: 20 },
    tool: 'select', placeItem: null, ghostRot: 0,
    clip: null, undo: [], redo: [], dirty: false,
    mouse: { sx: 0, sy: 0, wx: 0, wy: 0, inside: false }, drag: null, space: false,
    templates: {}, showLabels: true,
    showChecks: (() => { try { return localStorage.getItem('dspShowChecks') !== '0'; } catch (e) { return true; } })(),
    openEnds: (() => { try { return localStorage.getItem('dspOpenEnds') === '1'; } catch (e) { return false; } })(),
    fillDepots: (() => { try { return localStorage.getItem('dspFillDepots') !== '0'; } catch (e) { return true; } })(),
    level: 'all', splitModel: 39, beltFlip: false,
  };

  // ------------------------------------------------------------------ plantillas
  function loadTemplates() {
    // las aprendidas en el navegador solo cubren edificios que no están en js/templates.js
    S.templates = {};
    try { Object.assign(S.templates, JSON.parse(localStorage.getItem('dspbp.templates') || '{}')); } catch (e) { /* sin almacenamiento */ }
    Object.assign(S.templates, window.DSPDefaultTemplates || {});
  }
  function learnTemplates(bp) {
    let changed = false;
    for (const b of bp.buildings) {
      if (S.templates[b.itemId]) continue;
      const belt = isBelt(b);
      const loose = !belt && !isSorter(b) && b.inputObjIdx < 0 && b.outputObjIdx < 0;
      S.templates[b.itemId] = {
        modelIndex: b.modelIndex,
        parameters: belt ? [] : b.parameters.slice(),
        outputToSlot: loose ? b.outputToSlot : 0, inputFromSlot: loose ? b.inputFromSlot : 0,
        outputFromSlot: loose ? b.outputFromSlot : 0, inputToSlot: belt ? 1 : loose ? b.inputToSlot : 0,
      };
      changed = true;
    }
    if (changed) {
      try { localStorage.setItem('dspbp.templates', JSON.stringify(S.templates)); } catch (e) { /* ignorar */ }
      renderPalette();
    }
  }

  // ------------------------------------------------------------------ utilidades
  function toast(msg, err) {
    S.lastMsg = { msg, err: !!err };
    const t = $('toast');
    t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, err ? 5000 : 2500);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r2 = (v) => Math.round(v * 100) / 100;
  const normYaw = (y) => { y = Math.round(y * 1000) / 1000 % 360; return y < 0 ? y + 360 : y; };

  function snapshot() {
    const { rawBinary, ...rest } = S.bp;
    return JSON.stringify(rest);
  }
  function pushUndo() {
    S.undo.push(snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.edits = (S.edits || 0) + 1;   // contador de cambios (la simulación se recalcula si cambia)
    S.redo = [];
    setDirty(true);
  }
  function restore(snap) {
    S.bp = JSON.parse(snap);
    S.edits = (S.edits || 0) + 1;
    S.sel.clear();
    setDirty(true);
    refresh();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }

  function setDirty(d) {
    S.dirty = d;
    $('docTitle').textContent = (S.dirty ? '● ' : '') + (S.bp ? (S.bp.header.shortDesc || t('bp.unnamed')) : '') + (S.name ? '  —  ' + S.name : '');
  }

  // ------------------------------------------------------------------ carga / guardado
  async function loadText(text, name, handle) {
    let bp;
    try { bp = await BP.parse(text); } catch (e) { toast(t('load.fail', { e: e.message }), true); return false; }
    delete bp.rawBinary;
    S.bp = bp; S.name = name || ''; S.fileHandle = handle || null; S.hits = null;
    S.sel.clear(); S.undo = []; S.redo = [];
    learnTemplates(bp);
    setDirty(false);
    fitView();
    refresh();
    if (!bp.hashOk) toast(t('load.hash'), true);
    else toast(t('load.ok', { name: bp.header.shortDesc || name, n: bp.buildings.length }));
    highlightLibrary();
    return true;
  }

  function newBlueprint() {
    if (S.dirty && !confirm(t('confirm.discard'))) return;
    S.bp = BP.createEmpty(t('bp.newName')); S.hits = null;
    S.name = ''; S.fileHandle = null; S.sel.clear(); S.undo = []; S.redo = [];
    S.view = { cx: 10, cy: 5, scale: 24 };
    setDirty(false); refresh(); highlightLibrary();
  }

  async function exportString() {
    const c = JSON.parse(snapshot());
    c.header.time = BP.nowTicks();
    BP.normalize(c);
    return BP.stringify(c);
  }

  async function copyCode() {
    if (!S.bp) return;
    const s = await exportString();
    try {
      await navigator.clipboard.writeText(s);
      toast(t('copy.ok', { n: s.length }));
    } catch (e) {
      $('codeText').value = s; $('dlgCode').showModal(); $('codeText').select();
    }
  }

  function safeName(n) { return (n || 'blueprint').replace(/[\\/:*?"<>|]/g, '_').trim() || 'blueprint'; }

  async function download() {
    if (!S.bp) return;
    const s = await exportString();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], { type: 'text/plain' }));
    a.download = (S.name ? S.name.split('/').pop().replace(/\.txt$/i, '') : safeName(S.bp.header.shortDesc)) + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function writeHandle(handle, text) {
    const w = await handle.createWritable();
    await w.write(text); await w.close();
  }

  async function save() {
    if (!S.bp) return;
    if (S.fileHandle && S.fileHandle.createWritable) {
      try {
        await writeHandle(S.fileHandle, await exportString());
        setDirty(false); toast(t('save.ok', { name: S.name }));
        return;
      } catch (e) { toast(t('save.fail', { e: e.message }), true); return; }
    }
    return saveAs();
  }

  async function saveAs() {
    if (!S.bp) return;
    const text = await exportString();
    if (S.dirHandle) {
      let name = prompt(t('save.prompt'), safeName(S.bp.header.shortDesc));
      if (!name) return;
      name = safeName(name).replace(/\.txt$/i, '') + '.txt';
      try {
        let exists = true;
        try { await S.dirHandle.getFileHandle(name); } catch (e) { exists = false; }
        if (exists && !confirm(t('save.exists', { name }))) return;
        const h = await S.dirHandle.getFileHandle(name, { create: true });
        await writeHandle(h, text);
        S.fileHandle = h; S.name = name; setDirty(false);
        toast(t('save.as', { name }));
        await scanDir();
      } catch (e) { toast(t('save.fail', { e: e.message }), true); }
      return;
    }
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({
          suggestedName: safeName(S.bp.header.shortDesc) + '.txt',
          types: [{ description: t('file.type'), accept: { 'text/plain': ['.txt'] } }],
        });
        await writeHandle(h, text);
        S.fileHandle = h; S.name = h.name; setDirty(false); toast(t('save.as', { name: h.name }));
      } catch (e) { if (e.name !== 'AbortError') toast(t('save.fail', { e: e.message }), true); }
      return;
    }
    download();
  }

  // El selector de archivos tiene que abrirse directamente con el clic: si antes sale un confirm(),
  // el navegador ya no lo permite. Por eso se pregunta por los cambios sin guardar después de elegir.
  async function openFile() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: [{ description: t('file.type'), accept: { 'text/plain': ['.txt'] } }] });
        const f = await h.getFile();
        if (S.dirty && !confirm(t('confirm.discard'))) return;
        await loadText(await f.text(), f.name, h);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        // sin permiso para el selector moderno: se usa el clásico
      }
    }
    $('fileInput').click();
  }

  // ------------------------------------------------------------------ biblioteca (carpeta)
  async function openDir() {
    if (window.showDirectoryPicker) {
      try {
        S.dirHandle = await window.showDirectoryPicker({ id: 'dspbp', mode: 'readwrite' });
        await scanDir();
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        // sin permiso para el selector moderno: se usa el clásico (solo lectura)
      }
    }
    $('dirInput').click();
  }

  async function scanDir() {
    const out = [];
    async function walk(dir, prefix) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') await walk(h, prefix + name + '/');
        else if (/\.txt$/i.test(name)) out.push({ path: prefix + name, handle: h });
      }
    }
    await walk(S.dirHandle, '');
    out.sort((a, b) => a.path.localeCompare(b.path));
    S.library = out;
    $('libPath').textContent = '(' + S.dirHandle.name + ')';
    renderLibrary();
    learnFromLibrary();
  }

  async function learnFromLibrary() {
    for (const e of S.library) {
      try {
        const text = e.file ? await e.file.text() : await (await e.handle.getFile()).text();
        learnTemplates(await BP.parse(text));
      } catch (err) { /* archivo no válido */ }
    }
  }

  function renderLibrary() {
    const el = $('library');
    if (!S.library.length) { el.innerHTML = `<p class="muted small">${esc(t('lib.empty'))}</p>`; return; }
    let html = '', lastDir = null;
    for (let i = 0; i < S.library.length; i++) {
      const p = S.library[i].path;
      const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      if (dir !== lastDir) { if (dir) html += `<div class="lib-dir">📁 ${esc(dir)}</div>`; lastDir = dir; }
      html += `<div class="lib-item" data-i="${i}" title="${esc(p)}" style="padding-left:${dir ? 16 : 6}px">${esc(p.split('/').pop().replace(/\.txt$/i, ''))}</div>`;
    }
    el.innerHTML = html;
    highlightLibrary();
  }
  function highlightLibrary() {
    document.querySelectorAll('.lib-item').forEach((d) => {
      const e = S.library[+d.dataset.i];
      d.classList.toggle('active', !!e && (e.handle ? e.handle === S.fileHandle : e.path === S.name));
    });
  }
  $('library').addEventListener('click', async (ev) => {
    const d = ev.target.closest('.lib-item'); if (!d) return;
    if (S.dirty && !confirm(t('confirm.discard'))) return;
    const e = S.library[+d.dataset.i];
    const text = e.file ? await e.file.text() : await (await e.handle.getFile()).text();
    await loadText(text, e.path, e.handle || null);
  });

  // ------------------------------------------------------------------ paleta
  // Paleta: grupos del menú de construcción del juego, plegables (se recuerda cuáles están cerrados)
  let palClosed = new Set();
  try { palClosed = new Set(JSON.parse(localStorage.getItem('dspbp.palClosed') || '[]')); } catch (e) { /* sin almacenamiento */ }
  function renderPalette() {
    const q = $('paletteSearch').value.trim().toLowerCase();
    let html = '';
    for (const g of IT.MENU) {
      const list = g.ids.map((id) => IT.BUILDINGS[id]).filter((b) => b &&
        (!q || b.name.toLowerCase().includes(q) || b.en.toLowerCase().includes(q) || String(b.id).includes(q)));
      if (!list.length) continue;
      const open = q || !palClosed.has(g.key);
      html += `<div class="pal-cat${open ? ' open' : ''}" data-group="${g.key}"><span class="caret">${open ? '▾' : '▸'}</span>${esc(g.name)}<span class="n">${list.length}</span></div>`;
      if (!open) continue;
      for (const b of list) {
        const ok = !!S.templates[b.id];
        const active = S.placeItem === b.id && S.tool !== 'select' && S.tool !== 'paste';
        const icon = b.icon ? `<img class="pal-icon" src="${b.icon}" alt="">` : `<span class="pal-swatch" style="background:${BELT_COLORS[b.id] || (IT.CATS[b.cat] || {}).color}"></span>`;
        html += `<div class="pal-item${ok ? '' : ' disabled'}${active ? ' active' : ''}" data-id="${b.id}"
          title="${esc(b.name)}${I18N.lang === 'en' ? '' : ' / ' + esc(b.en)} (${b.id})${ok ? '' : ' · ' + esc(t('pal.unknown'))}">
          ${icon}<span class="pal-name">${esc(b.name)}</span></div>`;
      }
    }
    $('palette').innerHTML = html || `<p class="muted small">${esc(t('pal.none'))}</p>`;
  }

  $('paletteSearch').addEventListener('input', renderPalette);
  $('palette').addEventListener('click', (ev) => {
    const cat = ev.target.closest('.pal-cat');
    if (cat) {
      const k = cat.dataset.group;
      palClosed.has(k) ? palClosed.delete(k) : palClosed.add(k);
      try { localStorage.setItem('dspbp.palClosed', JSON.stringify([...palClosed])); } catch (e) { /* ignorar */ }
      renderPalette(); return;
    }
    const d = ev.target.closest('.pal-item'); if (!d || d.classList.contains('disabled')) return;
    const id = +d.dataset.id;
    if (!S.bp) newBlueprint();
    setTool(BP.BELTS.has(id) ? 'belt' : BP.SORTERS.has(id) ? 'sorter' : 'place', id);
  });

  function setTool(tool, item) {
    S.tool = tool; S.placeItem = item || null; S.drag = null;
    document.querySelectorAll('#toolbar .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    const hints = {
      select: t('hint.select'),
      place: t('hint.place', { name: IT.itemName(item), variant: item === 2020 ? t('hint.place.variant', { name: (SPLIT[S.splitModel] || {}).name }) : '' }),
      belt: t('hint.belt', { name: IT.itemName(item), level: curLevel() }),
      paste: t('hint.paste'),
      sorter: t('hint.sorter', { name: IT.itemName(item) }),
    };
    $('toolHint').textContent = hints[tool] || '';
    $('canvas').style.cursor = tool === 'select' ? 'default' : 'crosshair';
    renderPalette();
    requestDraw();
  }
  document.querySelectorAll('#toolbar .tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  // ------------------------------------------------------------------ lienzo
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, drawPending = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    requestDraw();
  }
  new ResizeObserver(resize).observe($('canvasWrap'));

  const w2s = (x, y) => [(x - S.view.cx) * S.view.scale + W / 2, H / 2 - (y - S.view.cy) * S.view.scale];
  const s2w = (px, py) => [(px - W / 2) / S.view.scale + S.view.cx, (H / 2 - py) / S.view.scale + S.view.cy];

  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; draw(); });
  }

  function bounds(list) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of list) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
    }
    return { minX, minY, maxX, maxY };
  }

  function fitView() {
    if (!S.bp || !S.bp.buildings.length) { S.view = { cx: 10, cy: 5, scale: 24 }; requestDraw(); return; }
    const bb = bounds(S.bp.buildings);
    const w = bb.maxX - bb.minX + 6, h = bb.maxY - bb.minY + 6;
    S.view.cx = (bb.minX + bb.maxX) / 2; S.view.cy = (bb.minY + bb.maxY) / 2;
    S.view.scale = Math.max(2, Math.min(60, Math.min(W / w, H / h)));
    requestDraw();
  }

  const GEO = window.DSPGeometry || {};
  const COL = window.DSPCollision.make(GEO, IT);
  const SPLIT = window.DSPSplitter || {};

  // ------------------------------------------------------------------ alturas
  // z de las cintas en niveles (0 suelo, 1 elevada…). Los edificios apilados (distribuidor sobre almacén) usan z real.
  const levelOf = (b) => Math.max(0, Math.round(b.z || 0));
  const curLevel = () => (S.level === 'all' ? 0 : S.level);
  const dimmed = (b) => S.level !== 'all' && (isBelt(b) || b.z > 0.5 || S.level > 0) && levelOf(b) !== S.level;
  function setLevel(l) {
    S.level = l;
    $('levelSel').value = String(l);
    if (S.tool === 'belt') setTool('belt', S.placeItem); else requestDraw();
  }

  // ------------------------------------------------------------------ divisor
  const SIDE = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
  const BELT_PORTS = window.DSPBeltPorts || {};
  const STACK = window.DSPStack || {};
  // Puertos de cinta de un edificio en el mundo: { slot, pos:[x,y], dir:[dx,dy] hacia fuera, level }
  function beltPorts(b) {
    let list = BELT_PORTS[b.itemId];
    if (b.itemId === 2020) {
      const v = SPLIT[b.modelIndex];
      list = v ? v.ports.map(([slot, side, level]) => [slot, SIDE[side][0] * 0.2, SIDE[side][1] * 0.2, side, level]) : null;
    }
    if (!list) return [];
    const base = Math.round(b.z || 0);
    return list.map(([slot, lx, ly, side, level]) => {
      const [sx, sy] = SIDE[side];
      const w = toWorld(b, sx, sy);
      return { b, slot, pos: toWorld(b, lx, ly), dir: [Math.round(w[0] - b.x), Math.round(w[1] - b.y)], level: base + level };
    });
  }
  // Puerto en la casilla `cell` al nivel L: de salida si la cinta avanza en `dir` hacia fuera,
  // de entrada si avanza hacia dentro (dir opuesto al lado del puerto).
  function portAt(cell, dir, entering, L) {
    for (const b of S.bp.buildings) {
      if (isBelt(b) || isSorter(b) || Math.abs(b.x - cell[0]) > 4 || Math.abs(b.y - cell[1]) > 4) continue;
      for (const p of beltPorts(b)) {
        if (p.level !== L || Math.round(p.pos[0]) !== cell[0] || Math.round(p.pos[1]) !== cell[1]) continue;
        const k = entering ? -1 : 1;
        if (p.dir[0] === dir[0] * k && p.dir[1] === dir[1] * k) return p;
      }
    }
    return null;
  }
  // ¿Hay algún puerto en esta casilla (en cualquier sentido)? Para cortar el camino ahí.
  const portCell = (cell, L) => S.bp.buildings.some((b) => !isBelt(b) && !isSorter(b) &&
    Math.abs(b.x - cell[0]) <= 4 && Math.abs(b.y - cell[1]) <= 4 &&
    beltPorts(b).some((p) => p.level === L && Math.round(p.pos[0]) === cell[0] && Math.round(p.pos[1]) === cell[1]));

  // ------------------------------------------------------------------ apilado
  // Edificio más alto en la posición (x, y) sobre el que se puede apilar itemId, o null
  function stackBase(itemId, x, y) {
    const rule = STACK[itemId]; if (!rule) return null;
    let top = null;
    for (const b of S.bp.buildings) {
      if (isBelt(b) || isSorter(b) || Math.abs(b.x - x) > 0.3 || Math.abs(b.y - y) > 0.3) continue;
      if (!top || b.z > top.z) top = b;
    }
    return top && rule.on.includes(top.itemId) ? top : null;
  }
  function applyStack(nb) {
    const base = stackBase(nb.itemId, nb.x, nb.y);
    if (!base) return false;
    nb.z = nb.z2 = Math.round((base.z + STACK[nb.itemId].h) * 100) / 100;
    nb.inputObjIdx = S.bp.buildings.indexOf(base);
    return true;
  }

  // Formas exactas por casillas (js/shapes.js): su rectángulo envolvente hace de huella
  const SHAPES = window.DSPShapes || {};
  const SHAPE_FP = {};
  for (const [id, sh] of Object.entries(SHAPES)) {
    const xs = sh.cells.map((c) => c[0]), ys = sh.cells.map((c) => c[1]);
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
    SHAPE_FP[id] = { w: x1 - x0, h: y1 - y0, ox: (x0 + x1) / 2, oy: (y0 + y1) / 2, cut: 0, cells: sh.cells };
  }
  function footprint(b) {
    if (SHAPE_FP[b.itemId]) return SHAPE_FP[b.itemId];
    const g = GEO[b.itemId];
    if (g) return { w: g.w, h: g.h, ox: g.ox || 0, oy: g.oy || 0, cut: g.cut || 0 };
    const info = IT.buildingInfo(b.itemId);
    return { w: info.w, h: info.h, ox: 0, oy: 0 };
  }
  // local (yaw 0, +y norte) -> mundo. El yaw gira en sentido horario.
  function toWorld(b, lx, ly) {
    const a = b.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [b.x + lx * c + ly * s, b.y - lx * s + ly * c];
  }
  function toLocal(b, wx, wy) {
    const a = b.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = wx - b.x, dy = wy - b.y;
    return [dx * c - dy * s, dx * s + dy * c];
  }
  // Huecos de clasificador de un edificio en coordenadas de mundo
  function slotsOf(b) {
    const g = GEO[b.itemId];
    if (!g || !g.slots) return [];
    return g.slots.map((p, i) => (p ? { slot: i, pos: toWorld(b, p[0], p[1]) } : null)).filter(Boolean);
  }

  // Dibuja un edificio. get(idx) resuelve el destino de conexiones.
  function drawBuilding(b, o) {
    const s = S.view.scale;
    const ox = o.ox || 0, oy = o.oy || 0;
    const [px, py] = w2s(b.x + ox, b.y + oy);
    const info = IT.buildingInfo(b.itemId);
    const cat = IT.CATS[info.cat] || IT.CATS.assembly;
    ctx.globalAlpha = o.alpha || 1;

    if (isBelt(b)) {
      const color = BELT_COLORS[b.itemId] || cat.color;
      let t = b.outputObjIdx >= 0 ? o.get(b.outputObjIdx) : null;
      // mientras se arrastra, una conexión con un extremo quieto no se dibuja estirada (se va a cortar)
      if (t && o.offsetOf) { const [tx, ty] = o.offsetOf(t); if (tx !== ox || ty !== oy) t = null; }
      // dos pasadas: primero todos los tramos, luego flechas (si no, el tramo siguiente tapa la flecha)
      const pass = o.pass || 'all';
      const up = levelOf(b) > 0;
      if (pass !== 'arrow') {
      const path = () => {
        ctx.beginPath(); ctx.moveTo(px, py);
        if (t && isBelt(t)) {
          const tm = o.offsetOf(t);
          const [tx, ty] = w2s(t.x + tm[0], t.y + tm[1]);
          ctx.lineTo(tx, ty);
        } else {
          const a = b.yaw * Math.PI / 180;
          ctx.lineTo(px + Math.sin(a) * s * 0.45, py - Math.cos(a) * s * 0.45);
        }
      };
      ctx.lineCap = 'round';
      if (up) {
        // cinta elevada: funda oscura con borde claro y más estrecha, para que se vea pasar por encima.
        // En el lienzo cada capa va en su pasada (todos los bordes, luego todas las fundas, luego el color):
        // si no, el borde redondeado de cada tramo asoma sobre el anterior y la cinta parece una cadena.
        if (pass === 'all' || pass === 'edge') { ctx.strokeStyle = 'rgba(230,236,245,.85)'; ctx.lineWidth = Math.max(3, s * 0.5 + 3); path(); ctx.stroke(); }
        if (pass === 'all' || pass === 'case') { ctx.strokeStyle = '#0f1218'; ctx.lineWidth = Math.max(2.5, s * 0.5 + 1); path(); ctx.stroke(); }
        if (pass === 'edge' || pass === 'case') { ctx.globalAlpha = 1; return; }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = up ? Math.max(1.2, s * 0.32) : Math.max(1.5, s * 0.5);
      path(); ctx.stroke();
      }
      if (pass === 'line') { ctx.globalAlpha = 1; return; }
      // subida / bajada: dos cintas en la misma casilla a distinta altura
      if (t && isBelt(t) && Math.hypot(t.x - b.x, t.y - b.y) < 0.15 && levelOf(t) !== levelOf(b)) {
        const k = Math.max(5, s * 0.36), goingUp = levelOf(t) > levelOf(b);
        ctx.fillStyle = '#0f1218'; ctx.strokeStyle = '#e6ecf5'; ctx.lineWidth = 1.5;
        ctx.fillRect(px - k, py - k, k * 2, k * 2); ctx.strokeRect(px - k, py - k, k * 2, k * 2);
        ctx.fillStyle = color; ctx.font = `bold ${Math.round(k * 1.1)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${goingUp ? '▲' : '▼'}${levelOf(t)}`, px, py + 1);
        ctx.globalAlpha = 1; return;
      }
      // Flecha de dirección: hacia la cinta siguiente si está al lado; si no, según la orientación
      let dx, dy;
      const tm = t ? o.offsetOf(t) : null;
      const vx = t ? t.x + tm[0] - b.x - ox : 0, vy = t ? t.y + tm[1] - b.y - oy : 0;
      if (t && isBelt(t) && Math.hypot(vx, vy) > 0.1 && Math.hypot(vx, vy) < 2.5) {
        const l = Math.hypot(vx, vy); dx = vx / l; dy = -vy / l;
      } else {
        const a = b.yaw * Math.PI / 180; dx = Math.sin(a); dy = -Math.cos(a);
      }
      // a poco zoom, solo una flecha de cada pocas cintas para no saturar
      const every = s > 8 ? 1 : s > 4 ? 3 : 6;
      const isEnd = !t || !isBelt(t);
      if (s > 2.5 && (isEnd || (Math.round(b.x) + Math.round(b.y)) % every === 0)) {
        const k = Math.max(2.5, s * 0.2);
        const cx = px + dx * k * 0.3, cy = py + dy * k * 0.3;
        ctx.strokeStyle = 'rgba(15,18,24,.85)'; ctx.lineWidth = Math.max(1.2, s * 0.1);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - dx * k - dy * k, cy - dy * k + dx * k);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - dx * k + dy * k, cy - dy * k - dx * k);
        ctx.stroke();
      }
      if (o.selected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeRect(px - s * 0.45, py - s * 0.45, s * 0.9, s * 0.9);
      }
      if (S.showLabels && b.parameters.length && b.parameters[0] > 0 && s > 5) drawItemBadge(b.parameters[0], px, py, Math.max(10, s * 0.75));
    } else if (isSorter(b)) {
      const [qx, qy] = w2s(b.x2 + ox, b.y2 + oy);
      const sc = o.selected ? '#fff' : (BELT_COLORS[b.itemId] || cat.color);
      // contorno oscuro para que se distinga sobre cintas del mismo color
      ctx.strokeStyle = 'rgba(15,18,24,.8)'; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2.5, s * 0.13 + 2);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
      ctx.strokeStyle = sc;
      ctx.lineWidth = Math.max(1.5, s * 0.13);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
      const ang = Math.atan2(qy - py, qx - px), k = Math.max(4, s * 0.3);
      ctx.fillStyle = sc;
      ctx.beginPath();
      ctx.moveTo(qx + Math.cos(ang) * k * 0.4, qy + Math.sin(ang) * k * 0.4);
      ctx.lineTo(qx - Math.cos(ang - 0.6) * k, qy - Math.sin(ang - 0.6) * k);
      ctx.lineTo(qx - Math.cos(ang + 0.6) * k, qy - Math.sin(ang + 0.6) * k);
      ctx.fill();
      // filtro: icono pequeño en el centro del clasificador
      if (S.showLabels && b.filterId && s > 5) drawItemBadge(b.filterId, (px + qx) / 2, (py + qy) / 2, Math.max(9, s * 0.5));
    } else {
      const fp = footprint(b);
      // el icono del edificio (wiki) sustituye a los sprites recortados de capturas
      const hasIcon = !!info.icon;
      const sprite = hasIcon ? null : spriteFor(b.itemId);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(b.yaw * Math.PI / 180);
      const w = fp.w * s, h = fp.h * s;
      ctx.translate(fp.ox * s, -fp.oy * s); // centro de la huella (puede no coincidir con la posición)
      if (b.itemId === 2020 && SPLIT[b.modelIndex]) {
        drawSplitter(SPLIT[b.modelIndex], s, o.selected);
      } else if (sprite && s > 3) {
        const sw = sprite.w * s, sh = sprite.h * s;
        ctx.translate((sprite.ox - fp.ox) * s, -(sprite.oy - fp.oy) * s);
        ctx.drawImage(sprite.img, -sw / 2, -sh / 2, sw, sh);
        if (TIER[b.itemId] && !o.selected) {
          ctx.strokeStyle = TIER[b.itemId]; ctx.lineWidth = Math.max(1.5, s * 0.1);
          roundRect(-sw / 2, -sh / 2, sw, sh, Math.min(sw, sh) * 0.11); ctx.stroke();
        }
        if (o.selected) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
          roundRect(-sw / 2, -sh / 2, sw, sh, Math.min(sw, sh) * 0.11); ctx.stroke();
        }
      } else if (b.itemId === 2201 && !hasIcon) {
        drawTesla(s, cat.color, o.selected);
      } else {
        // cuerpo oscuro con borde del color de la categoría (o del nivel, en ensambladoras)
        const col = TIER[b.itemId] || cat.color;
        const r = Math.min(w, h) * 0.14;
        ctx.fillStyle = '#222935';
        const body = () => (fp.cells ? cellsPath(fp, s) : fp.cut ? octagon(w, h, fp.cut * s) : roundRect(-w / 2, -h / 2, w, h, r));
        body(); ctx.fill();
        ctx.fillStyle = col + '40';
        if (!fp.cells) { roundRect(-w / 2 + s * 0.25, -h / 2 + s * 0.25, w - s * 0.5, h - s * 0.5, r * 0.7); ctx.fill(); }
        else { body(); ctx.fill(); }
        ctx.strokeStyle = o.selected ? '#fff' : col;
        ctx.lineWidth = o.selected ? 2.5 : Math.max(1, s * 0.08);
        if (fp.cells) cellsEdges(fp, s); else body();
        ctx.stroke();
        // marca de orientación (lado frontal)
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -h / 2 + s * 0.05); ctx.lineTo(s * 0.3, -h / 2 + s * 0.05); ctx.lineTo(0, -h / 2 + s * 0.35);
        ctx.fill();
      }
      ctx.restore();
      // icono del edificio en el centro (sin girar) y el de la receta pequeño abajo a la derecha
      const [cx, cy] = w2s(...toWorld(b, fp.ox, fp.oy).map((v, i) => v + (i ? oy : ox)));
      const iconDrawn = hasIcon && b.itemId !== 2020 && drawIcons(b, fp, cx, cy, s);
      if (!iconDrawn && S.showLabels && s > 7 && b.itemId !== 2201 && b.itemId !== 2020) {
        const [lx, ly] = w2s(...toWorld(b, fp.ox, fp.oy).map((v, i) => v + (i ? oy : ox)));
        drawLabel(b, info, lx, ly, s, !!sprite);
      }
    }
    ctx.globalAlpha = 1;
  }
  // Sprites recortados de capturas del juego (js/sprites.js)
  const SPRITES = {};
  for (const [id, d] of Object.entries(window.DSPSprites || {})) {
    const img = new Image();
    img.onload = () => {
      SPRITES[id] = { img, w: d.w || d.size, h: d.h || d.size, ox: d.ox || 0, oy: d.oy || 0 };
      requestDraw();
    };
    img.src = d.src;
  }
  // Ensambladoras: misma forma, color por nivel (amarillo, verde, azul), como cintas y clasificadores
  const TIER = { 2303: '#d1b13e', 2304: '#58c46a', 2305: '#4f9dff' };
  const SPRITE_ALIAS = { 2304: 2303, 2305: 2303, 2318: 2303 };
  function tint(img, color) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'color'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
    return c;
  }
  function spriteFor(id) {
    if (SPRITES[id]) return SPRITES[id];
    const base = SPRITES[SPRITE_ALIAS[id]];
    if (!base) return null;
    SPRITES[id] = { ...base, img: TIER[id] ? tint(base.img, TIER[id]) : base.img };
    return SPRITES[id];
  }
  // Iconos de edificio (wiki): para los que no tienen sprite y en la paleta
  const BICON = {};
  function buildingIcon(id) {
    const src = IT.buildingInfo(id).icon; if (!src) return null;
    if (!BICON[id]) { const im = new Image(); im.onload = requestDraw; im.src = src; BICON[id] = im; }
    return BICON[id].complete && BICON[id].naturalWidth ? BICON[id] : null;
  }

  // Divisor (en coordenadas locales ya giradas): cuerpo de 1 casilla y sus puertos.
  // Puerto de suelo: muesca del color del divisor. Puerto elevado: círculo blanco con borde.
  function drawSplitter(v, s, selected) {
    const h = s * 0.45, col = IT.CATS.logistics.color;
    ctx.fillStyle = '#222935'; ctx.strokeStyle = selected ? '#fff' : col; ctx.lineWidth = selected ? 2.5 : Math.max(1, s * 0.07);
    roundRect(-h, -h, h * 2, h * 2, h * 0.25); ctx.fill(); ctx.stroke();
    for (const [, side, level] of v.ports) {
      const [lx, ly] = SIDE[side], dx = lx, dy = -ly;
      if (level === 0) {
        ctx.fillStyle = col;
        const cx = dx * h * 0.78, cy = dy * h * 0.78, a = h * 0.42, b = h * 0.16;
        ctx.fillRect(cx - (dx ? b : a), cy - (dy ? b : a), (dx ? b : a) * 2, (dy ? b : a) * 2);
      } else {
        ctx.beginPath(); ctx.arc(dx * h * 0.55, dy * h * 0.55, Math.max(2, h * 0.24), 0, Math.PI * 2);
        ctx.fillStyle = '#e6ecf5'; ctx.fill(); ctx.strokeStyle = '#0f1218'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (s > 16) {
      ctx.fillStyle = '#e6ecf5'; ctx.font = `bold ${Math.round(s * 0.32)}px Segoe UI`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v.short, 0, 1);
    }
  }

  function drawTesla(s, color, selected) {
    const r = s * 0.42;
    ctx.fillStyle = '#222935';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = selected ? '#fff' : color; ctx.lineWidth = selected ? 2.5 : Math.max(1, s * 0.08);
    ctx.stroke();
    if (s > 10) {
      ctx.fillStyle = '#f4d35e';
      ctx.beginPath();
      ctx.moveTo(r * 0.15, -r * 0.7); ctx.lineTo(-r * 0.35, r * 0.1); ctx.lineTo(0, r * 0.1);
      ctx.lineTo(-r * 0.15, r * 0.7); ctx.lineTo(r * 0.35, -r * 0.1); ctx.lineTo(0, -r * 0.1);
      ctx.closePath(); ctx.fill();
    }
  }

  // Etiqueta: abreviatura del edificio y receta. Con sprite, solo la receta en una pastilla.
  // Tamaño del icono respecto a la huella (por defecto 0,85)
  const ICON_SCALE = { 2201: 1.1, 2312: 0.4 };   // Tesla más grande; silo (huella enorme) más pequeño
  // Icono del edificio ajustado a su huella y, si tiene receta, el dibujo de la receta en la esquina inferior derecha
  function drawIcons(b, fp, cx, cy, s) {
    const img = buildingIcon(b.itemId);
    if (!img || s < 3) return false;
    const side = Math.min(fp.w, fp.h) * s;
    const k = side * (ICON_SCALE[b.itemId] || 0.85);
    ctx.drawImage(img, cx - k / 2, cy - k / 2, k, k);
    const rimg = b.recipeId ? iconImg(b.recipeId) : null;
    if (rimg && s > 4) {
      const r = Math.max(10, side * 0.42), rx = cx + side / 2 - r * 0.62, ry = cy + side / 2 - r * 0.62;
      ctx.fillStyle = 'rgba(10,12,18,.75)';
      ctx.beginPath(); ctx.arc(rx, ry, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(rimg, rx - r / 2, ry - r / 2, r, r);
    }
    return true;
  }

  function drawLabel(b, info, px, py, s, hasSprite) {
    const fs = Math.max(8, Math.min(s * 0.42, 15));
    const rec = b.recipeId ? shortName(IT.RECIPES[b.recipeId] || '#' + b.recipeId) : '';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // dibujo de la receta sobre el edificio
    const img = b.recipeId && s > 4 ? iconImg(b.recipeId) : null;
    if (img) {
      const k = Math.max(12, Math.min(s * 1.3, 56));
      ctx.fillStyle = 'rgba(10,12,18,.72)';
      ctx.beginPath(); ctx.arc(px, py, k * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(img, px - k / 2, py - k / 2, k, k);
      if (!hasSprite && s > 10) { ctx.fillStyle = '#fff'; ctx.font = `600 ${fs * 0.85}px Segoe UI`; ctx.fillText(info.short, px, py - k * 0.6 - fs * 0.5); }
      return;
    }
    if (hasSprite) {
      if (!rec || s < 10) return;
      ctx.font = `600 ${fs * 0.85}px Segoe UI`;
      const tw = ctx.measureText(rec).width + 8, th = fs * 1.15, y = py + s * 0.85;
      ctx.fillStyle = 'rgba(10,12,18,.8)';
      roundRect(px - tw / 2, y - th / 2, tw, th, th / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(rec, px, y);
      return;
    }
    const bimg = !hasSprite && s > 6 ? buildingIcon(b.itemId) : null;
    if (bimg && !rec) {
      const fpb = footprint(b), k = Math.max(12, Math.min(Math.min(fpb.w, fpb.h) * s * 0.6, 64));
      ctx.drawImage(bimg, px - k / 2, py - k / 2, k, k);
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${fs}px Segoe UI`;
    if (rec && s > 10) {
      ctx.fillText(info.short, px, py - fs * 0.6);
      ctx.font = `${fs * 0.85}px Segoe UI`;
      ctx.fillStyle = '#cfd6e4';
      ctx.fillText(rec, px, py + fs * 0.55);
    } else ctx.fillText(info.short, px, py);
  }

  // Forma por casillas (en local, centrada en la huella): relleno con todas las casillas…
  function cellsPath(fp, s) {
    ctx.beginPath();
    for (const [x, y] of fp.cells) ctx.rect((x - 0.5 - fp.ox) * s, -(y + 0.5 - fp.oy) * s, s, s);
  }
  // …y borde solo por los lados exteriores
  function cellsEdges(fp, s) {
    const set = new Set(fp.cells.map(([x, y]) => x + ',' + y));
    const X = (x) => (x - fp.ox) * s, Y = (y) => -(y - fp.oy) * s;
    const seg = (x1, y1, x2, y2) => { ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); };
    ctx.beginPath();
    for (const [x, y] of fp.cells) {
      if (!set.has(x + ',' + (y + 1))) seg(x - 0.5, y + 0.5, x + 0.5, y + 0.5);
      if (!set.has(x + ',' + (y - 1))) seg(x - 0.5, y - 0.5, x + 0.5, y - 0.5);
      if (!set.has((x - 1) + ',' + y)) seg(x - 0.5, y - 0.5, x - 0.5, y + 0.5);
      if (!set.has((x + 1) + ',' + y)) seg(x + 0.5, y - 0.5, x + 0.5, y + 0.5);
    }
  }
  // Rectángulo con las esquinas recortadas (base de las estaciones)
  function octagon(w, h, c) {
    const x = w / 2, y = h / 2;
    ctx.beginPath();
    ctx.moveTo(-x + c, -y); ctx.lineTo(x - c, -y); ctx.lineTo(x - c, -y + c); ctx.lineTo(x, -y + c);
    ctx.lineTo(x, y - c); ctx.lineTo(x - c, y - c); ctx.lineTo(x - c, y); ctx.lineTo(-x + c, y);
    ctx.lineTo(-x + c, y - c); ctx.lineTo(-x, y - c); ctx.lineTo(-x, -y + c); ctx.lineTo(-x + c, -y + c);
    ctx.closePath();
  }
  function shortName(n) { return n.length > 12 ? n.slice(0, 11) + '…' : n; }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function order(b) { return isSorter(b) ? 2 : isBelt(b) ? 1 : 0; }

  // Simulación: porcentaje de las máquinas que no van al 100 % (abajo a la izquierda)
  function drawSimMarks(list, offsetOf) {
    const s = S.view.scale;
    if (!S.sim || s < 6) return;
    const bs = S.bp.buildings;
    for (const b of list) {
      const m = S.sim.machines.get(bs.indexOf(b));
      if (!m || m.r > 0.995) continue;
      const [ox, oy] = offsetOf(b), fp = footprint(b), pct = Math.floor(m.r * 100) + '%';
      const [x, y] = w2s(b.x - fp.w / 2 + 0.15 + ox, b.y - fp.h / 2 + 0.15 + oy), fs = Math.max(9, Math.min(s * 0.4, 14));
      ctx.font = `bold ${fs}px Segoe UI`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const w = ctx.measureText(pct).width + 6;
      ctx.fillStyle = m.r < 0.01 ? '#e05555' : '#f0a030';
      roundRect(x, y - fs * 1.25, w, fs * 1.25, 3); ctx.fill();
      ctx.fillStyle = '#0f1218'; ctx.fillText(pct, x + 3, y - 1);
    }
  }

  // Avisos de la comprobación: «!» rojo (le falta algo) o naranja (mezcla, sin salida…) en la esquina noroeste
  function drawFlowMarks(list, offsetOf) {
    const s = S.view.scale, marks = S.flowMarks;
    if (!marks || !marks.size || s < 2) return;
    const bs = S.bp.buildings;
    for (const b of list) {
      const lv = marks.get(bs.indexOf(b)); if (!lv || (lv === 'warn' && s < 6)) continue;
      const [ox, oy] = offsetOf(b), fp = isBelt(b) ? { w: 0.6, h: 0.6 } : footprint(b);
      const [x, y] = w2s(b.x - fp.w / 2 + 0.3 + ox, b.y + fp.h / 2 - 0.3 + oy), k = Math.max(7, Math.min(s * 0.45, 14));
      ctx.fillStyle = lv === 'error' ? '#e05555' : '#f0a030';
      ctx.beginPath(); ctx.arc(x, y, k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f1218'; ctx.font = `bold ${Math.round(k * 1.4)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 1);
    }
  }

  // Iconos de lo que sale por cada puerto de estación y del filtro de los divisores
  function drawOutputIcons(list, offsetOf) {
    const s = S.view.scale;
    if (s < 5) return;
    for (const b of list) {
      const [ox, oy] = offsetOf(b);
      if (PR.STATION_SLOTS[b.itemId]) {
        const p = PR.read(b);
        for (const q of beltPorts(b)) {
          const port = p.ports[q.slot], slot = port && port.storage ? p.slots[port.storage - 1] : null;
          if (!slot || !slot.item || port.dir === 2) continue;
          // un poco hacia dentro de la estación, para no tapar la cinta
          const [x, y] = w2s(q.pos[0] - q.dir[0] * 0.75 + ox, q.pos[1] - q.dir[1] * 0.75 + oy);
          drawItemBadge(slot.item, x, y, Math.max(9, s * 0.6));
        }
      } else if (b.itemId === 2030) {
        // monitor en sandbox: «+» verde si genera, «−» rojo si consume, con el producto
        const p = PR.read(b); if (p.mode === 'none') continue;
        const [x, y] = w2s(b.x + ox, b.y + oy), k = Math.max(11, s * 0.7), gen = p.mode === 'generate';
        if (p.item) drawItemBadge(p.item, x, y, k);
        const [tx, ty] = [x + k * 0.55, y - k * 0.55], r = Math.max(6, k * 0.32);
        ctx.fillStyle = gen ? '#5fcf7f' : '#e05555';
        ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f1218'; ctx.font = `bold ${Math.round(r * 1.8)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gen ? '+' : '−', tx, ty + 1);
      } else if (b.itemId === 2107 && b.filterId) {
        // producto del distribuidor logístico, en su esquina noroeste (la noreste es para la insignia ×N de la pila)
        const [x, y] = w2s(b.x - 0.7 + ox, b.y + 0.7 + oy);
        drawItemBadge(b.filterId, x, y, Math.max(11, s * 0.8));
      } else if (b.itemId === 2020 && b.filterId) {
        // en la esquina noreste, para no tapar la cruz del divisor
        const [x, y] = w2s(b.x + 0.42 + ox, b.y + 0.42 + oy);
        drawItemBadge(b.filterId, x, y, Math.max(11, s * 0.6));
      }
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0f1218'; ctx.fillRect(0, 0, W, H);
    drawGrid();
    if (!S.bp) {
      ctx.fillStyle = '#8892a6'; ctx.font = '16px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText(t('canvas.empty'), W / 2, H / 2);
      return;
    }
    const bs = S.bp.buildings;
    const moving = S.drag && S.drag.type === 'move' ? S.drag : null;
    const offsetOf = (b) => (moving && (S.sel.has(b) || moving.carry.has(b)) ? [moving.dx, moving.dy] : [0, 0]);
    const get = (i) => bs[i];

    // contorno del área exportada
    if (bs.length) {
      const bb = bounds(bs);
      const [x0, y0] = w2s(Math.round(bb.minX) - 0.5, Math.round(bb.maxY) + 0.5);
      const [x1, y1] = w2s(Math.round(bb.maxX) + 0.5, Math.round(bb.minY) - 0.5);
      ctx.strokeStyle = 'rgba(240,160,48,.35)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
    }

    const margin = 8;
    const [vx0, vy1] = s2w(0, 0), [vx1, vy0] = s2w(W, H);
    const visible = bs.filter((b) => !(b.x < vx0 - margin || b.x > vx1 + margin || b.y < vy0 - margin || b.y > vy1 + margin));
    const drawList = (list, pass) => list.forEach((b) => {
      const [ox, oy] = offsetOf(b);
      drawBuilding(b, { ox, oy, selected: S.sel.has(b), get, offsetOf, pass, alpha: dimmed(b) ? 0.22 : 1 });
    });
    // de abajo arriba: cintas del suelo, edificios, cintas elevadas (por nivel), edificios apilados, clasificadores
    const belts = visible.filter(isBelt);
    const maxLevel = belts.reduce((m, b) => Math.max(m, levelOf(b)), 0);
    const ground = belts.filter((b) => levelOf(b) === 0);
    drawList(ground, 'line'); drawList(ground, 'arrow');
    drawList(visible.filter((b) => order(b) === 0 && b.z <= 0.5));
    for (let l = 1; l <= maxLevel; l++) {
      const lv = belts.filter((b) => levelOf(b) === l);
      drawList(lv, 'edge'); drawList(lv, 'case'); drawList(lv, 'line'); drawList(lv, 'arrow');
    }
    drawList(visible.filter((b) => order(b) === 0 && b.z > 0.5));
    drawList(visible.filter(isSorter));
    if (S.showLabels) drawOutputIcons(visible, offsetOf);
    if (S.showChecks) { drawFlowMarks(visible, offsetOf); drawSimMarks(visible, offsetOf); }

    // choques: los del blueprint (salvo lo que se está moviendo) y los de los fantasmas
    if (moving && (moving.dx || moving.dy)) {
      const moved = [...S.sel].map((b) => ({ ...b, x: b.x + moving.dx, y: b.y + moving.dy }));
      drawHits(COL.find(moved, bs.filter((b) => !S.sel.has(b) && !moving.carry.has(b))));
    } else if (S.hits) {
      drawHits(S.hits);
    }

    // fantasmas
    const gx = Math.round(S.mouse.wx), gy = Math.round(S.mouse.wy);
    if (S.mouse.inside && S.tool === 'place' && S.placeItem) {
      const g = makeBuilding(S.placeItem, gx, gy, S.ghostRot * 90);
      if (g && g.itemId === 2020) g.modelIndex = S.splitModel;
      if (g) applyStack(g);
      if (g) { drawBuilding(g, { alpha: 0.55, get: () => null, offsetOf: () => [0, 0] }); drawHits(COL.find([g], bs)); }
    }
    if (S.tool === 'belt' && S.placeItem) {
      const cells = S.drag && S.drag.type === 'belt' ? beltPath(S.drag.start, [gx, gy]) : (S.mouse.inside ? [[gx, gy]] : []);
      const ghosts = beltsFor(cells, S.placeItem);
      for (const pass of ['line', 'arrow']) ghosts.forEach((g) => drawBuilding(g, { alpha: 0.6, get: (i) => ghosts[i], offsetOf: () => [0, 0], pass }));
      drawHits(COL.find(ghosts, bs.filter((b) => !ghosts.some((g) => g.x === b.x && g.y === b.y))));
    }
    if (S.mouse.inside && S.tool === 'paste' && S.clip) {
      const row = S.drag && S.drag.type === 'pasteRow' ? rowPositions(S.drag.start, [gx, gy]) : [[gx, gy]];
      for (const [rx, ry] of row) {
      const list = clipPlaced(rx, ry);
      const sortedGhosts = [...list.filter((b) => order(b) === 0), ...list.filter(isBelt), ...list.filter(isSorter)];
      for (const pass of ['line', 'arrow']) sortedGhosts.forEach((g) => {
        if (pass === 'arrow' && !isBelt(g)) return;
        drawBuilding(g, { alpha: 0.5, get: (i) => list[i], offsetOf: () => [0, 0], pass: isBelt(g) ? pass : undefined });
      });
      drawHits(COL.find(list, bs));
      }
    }
    // marcas que acompañan al edificio mientras se arrastra (se dibujan desplazadas)
    const shifted = (b, fn) => {
      const [ox, oy] = offsetOf(b);
      if (!ox && !oy) { fn(); return; }
      ctx.save(); ctx.translate(ox * S.view.scale, -oy * S.view.scale); fn(); ctx.restore();
    };
    if (S.tool === 'belt') visible.forEach((b) => drawBeltPorts(b, true));
    else if (S.view.scale > 6) visible.forEach((b) => { if (!isBelt(b) && !isSorter(b)) shifted(b, () => drawBeltPorts(b, false)); });
    drawStacks(visible);
    // huecos: todos los visibles con la herramienta de clasificador, o los del edificio seleccionado
    if (S.tool === 'sorter') {
      visible.forEach((b) => drawSlots(b, false));
      const hover = S.mouse.inside ? findAnchor(S.mouse.wx, S.mouse.wy, S.drag && S.drag.type === 'sorter' ? S.drag.start : null) : null;
      if (S.drag && S.drag.type === 'sorter') {
        const g = sorterGeometry(S.drag.start, hover || { kind: 'free', pos: [S.mouse.wx, S.mouse.wy] });
        drawSorterPreview(g, !!hover);
      }
      if (hover) drawAnchor(hover);
    } else if (S.tool === 'select' && S.sel.size === 1) {
      const one = [...S.sel][0];
      shifted(one, () => drawSlots(one, false));
    }
    if (S.drag && S.drag.type === 'box') {
      const d = S.drag;
      ctx.fillStyle = 'rgba(79,195,247,.12)'; ctx.strokeStyle = 'rgba(79,195,247,.8)'; ctx.lineWidth = 1;
      ctx.fillRect(d.sx0, d.sy0, S.mouse.sx - d.sx0, S.mouse.sy - d.sy0);
      ctx.strokeRect(d.sx0, d.sy0, S.mouse.sx - d.sx0, S.mouse.sy - d.sy0);
    }
  }

  // Puertos de cinta: flecha hacia fuera; brillante si están al nivel actual
  // Dónde se engancha o entra la cinta: flechas en los puertos (divisor, estación, intercambiador…) y,
  // en los edificios sin puertos pero con carril (torretas: fila de munición), una franja discontinua.
  // Siempre visibles (tenues); resaltadas con la herramienta de cinta.
  const LANES = (window.DSPCollision && window.DSPCollision.LANES) || {};
  function drawBeltPorts(b, strong) {
    const ports = beltPorts(b), lanes = LANES[b.itemId];
    if (!ports.length && !lanes) return;
    const s = S.view.scale, k = Math.max(3, s * 0.18), L = curLevel(), base = strong ? 1 : 0.5;
    for (const p of ports) {
      const [px, py] = w2s(p.pos[0], p.pos[1]), dx = p.dir[0], dy = -p.dir[1];
      ctx.globalAlpha = base * (p.level === L || !strong ? 1 : 0.35);
      ctx.fillStyle = p.level > 0 ? '#e6ecf5' : '#4fc3f7'; ctx.strokeStyle = '#0f1218'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + dx * k, py + dy * k);
      ctx.lineTo(px - dx * k * 0.6 - dy * k, py - dy * k * 0.6 + dx * k);
      ctx.lineTo(px - dx * k * 0.6 + dy * k, py - dy * k * 0.6 - dx * k);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (lanes && !ports.length) {
      const fp = footprint(b);
      ctx.globalAlpha = base;
      ctx.lineWidth = Math.max(2, s * 0.35); ctx.setLineDash([Math.max(3, s * 0.3), Math.max(3, s * 0.3)]);
      for (const [axis, v, lv = 0] of lanes) {
        ctx.strokeStyle = lv > 0 ? '#e6ecf5' : '#4fc3f7';   // blanco: carril elevado
        const a1 = axis === 'y' ? toWorld(b, fp.ox - fp.w / 2 - 0.3, v) : toWorld(b, v, fp.oy - fp.h / 2 - 0.3);
        const a2 = axis === 'y' ? toWorld(b, fp.ox + fp.w / 2 + 0.3, v) : toWorld(b, v, fp.oy + fp.h / 2 + 0.3);
        const [x1, y1] = w2s(...a1), [x2, y2] = w2s(...a2);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  // Pilas (almacenes, tanques, laboratorios…): insignia ×N sobre el de arriba
  function drawStacks(list) {
    const s = S.view.scale; if (s < 6) return;
    const groups = new Map();
    for (const b of list) {
      if (isBelt(b) || isSorter(b)) continue;
      const k = Math.round(b.x * 5) + ',' + Math.round(b.y * 5);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const top = g.reduce((a, b) => (b.z > a.z ? b : a));
      const fp = footprint(top);
      const [px, py] = w2s(top.x + fp.w / 2 - 0.3, top.y + fp.h / 2 - 0.3);
      const txt = '×' + g.length, fs = Math.max(10, Math.min(s * 0.4, 16));
      ctx.font = `bold ${fs}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 8;
      ctx.fillStyle = '#f0a030'; roundRect(px - w / 2, py - fs * 0.65, w, fs * 1.3, fs * 0.4); ctx.fill();
      ctx.fillStyle = '#0f1218'; ctx.fillText(txt, px, py + 1);
    }
  }

  // Marca en rojo los cuerpos de colisión de cada pareja que choca
  function drawHits(pairs) {
    if (!pairs.length) return;
    const seen = new Set();
    ctx.fillStyle = 'rgba(224,85,85,.28)'; ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 2;
    for (const pair of pairs) for (const b of pair) {
      if (seen.has(b)) continue; seen.add(b);
      const k = COL.body(b); if (!k) continue;
      ctx.beginPath();
      if (k.r) {
        const [cx, cy] = w2s(k.cx, k.cy);
        ctx.arc(cx, cy, k.r * S.view.scale, 0, Math.PI * 2);
      } else if (k.cells) {
        for (const [x, y] of k.cells) { const [x0, y0] = w2s(x - 0.5, y + 0.5); ctx.rect(x0, y0, S.view.scale, S.view.scale); }
      } else {
        const [x0, y0] = w2s(k.cx - k.hw, k.cy + k.hh), [x1, y1] = w2s(k.cx + k.hw, k.cy - k.hh);
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.fill(); ctx.stroke();
    }
  }

  function drawGrid() {
    const s = S.view.scale;
    const [x0, y1] = s2w(0, 0), [x1, y0] = s2w(W, H);
    const lines = (step, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        const [px] = w2s(x - 0.5, 0); ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, H);
      }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
        const [, py] = w2s(0, y - 0.5); ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(W, Math.round(py) + 0.5);
      }
      ctx.stroke();
    };
    if (s >= 6) lines(1, '#171c25');
    lines(10, '#202734');
    const [ox, oy] = w2s(0, 0);
    ctx.fillStyle = '#3a4560'; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ------------------------------------------------------------------ selección por clic
  function pick(wx, wy) {
    if (!S.bp) return null;
    const bs = S.bp.buildings;
    let best = null, bestOrder = -1, bestD = Infinity;
    for (const b of bs) {
      let hit = false, d = 0;
      if (isSorter(b)) {
        d = segDist(wx, wy, b.x, b.y, b.x2, b.y2); hit = d < 0.3;
      } else if (isBelt(b)) {
        d = Math.max(Math.abs(wx - b.x), Math.abs(wy - b.y)); hit = d < 0.5;
      } else {
        const fp = footprint(b);
        const [lx, ly] = toLocal(b, wx, wy);
        hit = Math.abs(lx - fp.ox) <= fp.w / 2 && Math.abs(ly - fp.oy) <= fp.h / 2;
        d = Math.hypot(wx - b.x, wy - b.y);
      }
      if (!hit || dimmed(b)) continue;
      // el divisor ocupa la misma casilla que el final de sus cintas: dentro de su casilla gana él
      const o = b.itemId === 2020 ? 1.5 : order(b) + (b.z > 0.5 ? 0.5 : 0);
      if (o > bestOrder || (o === bestOrder && d < bestD)) { best = b; bestOrder = o; bestD = d; }
    }
    return best;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - t * vx, py - ay - t * vy);
  }

  // Selecciona la línea de cinta completa (siguiendo conexiones entre cintas)
  // Esc (o clic derecho): cerrar el selector, cancelar la herramienta o, si no hay, deseleccionar
  function escapeAction() {
    if ($('recipePop')) { closeRecipePicker(); return; }
    if (S.drag && S.drag.type !== 'pan') { S.drag = null; requestDraw(); return; }
    if (S.tool !== 'select') setTool('select'); else { S.sel.clear(); refresh(); }
  }
  // X+clic: borrar lo que hay bajo el cursor; con Mayús, si es una cinta, toda la cinta conectada del mismo tipo
  function eraseAt(line) {
    const h = pick(S.mouse.wx, S.mouse.wy);
    if (!h) return;
    const rm = line && isBelt(h) ? beltLine(h, true) : new Set([h]);
    pushUndo();
    removeBuildings(rm);
    S.sel.clear();
    refresh();
    toast(rm.size > 1 ? t('del.belts', { n: rm.size }) : t('del.one', { name: IT.itemName(h.itemId) }));
  }
  function selectBeltLine(b) { beltLine(b).forEach((x) => S.sel.add(x)); }
  // Cintas conectadas a b (hacia delante y hacia atrás); sameType: solo las del mismo tipo (Mk.I/II/III)
  function beltLine(b, sameType) {
    const bs = S.bp.buildings, ok = (x) => isBelt(x) && (!sameType || x.itemId === b.itemId);
    const prev = new Map();
    bs.forEach((x) => { if (ok(x) && x.outputObjIdx >= 0) { const t = bs[x.outputObjIdx]; if (t && ok(t)) { if (!prev.has(t)) prev.set(t, []); prev.get(t).push(x); } } });
    const stack = [b], seen = new Set();
    while (stack.length) {
      const x = stack.pop(); if (seen.has(x)) continue; seen.add(x);
      const t = x.outputObjIdx >= 0 ? bs[x.outputObjIdx] : null;
      if (t && ok(t)) stack.push(t);
      (prev.get(x) || []).forEach((p) => stack.push(p));
    }
    return seen;
  }

  // ------------------------------------------------------------------ creación de edificios
  function newMagic() {
    const b = S.bp && S.bp.buildings[0];
    return b ? b.magic : -102;
  }
  function makeBuilding(itemId, x, y, yaw) {
    const t = S.templates[itemId]; if (!t) return null;
    const b = BP.newBuilding({
      magic: newMagic(), itemId, modelIndex: t.modelIndex,
      x, y, z: 0, yaw: normYaw(yaw), x2: x, y2: y, z2: 0, yaw2: normYaw(yaw),
      parameters: (t.parameters || []).slice(),
      outputToSlot: t.outputToSlot || 0, inputFromSlot: t.inputFromSlot || 0,
      outputFromSlot: t.outputFromSlot || 0, inputToSlot: t.inputToSlot || 0,
    });
    if (BP.SORTERS.has(itemId)) {
      const a = yaw * Math.PI / 180;
      b.x2 = r2(x + Math.sin(a)); b.y2 = r2(y + Math.cos(a));
    }
    return b;
  }

  function placeBuilding(x, y) {
    const b = makeBuilding(S.placeItem, x, y, S.ghostRot * 90);
    if (!b) return;
    if (b.itemId === 2020) b.modelIndex = S.splitModel;
    const stacked = applyStack(b);
    pushUndo();
    b.index = S.bp.buildings.length;
    S.bp.buildings.push(b);
    S.sel.clear(); S.sel.add(b);
    refresh();
    if (stacked && S.bp.buildings.includes(b)) toast(t('stack.on', { name: IT.itemName(S.bp.buildings[b.inputObjIdx].itemId), z: I18N.num(b.z) }));
  }

  // Camino en L entre dos celdas
  function beltPath(a, b) {
    const cells = [];
    let [x, y] = a;
    const [tx, ty] = b;
    cells.push([x, y]);
    const horizFirst = (Math.abs(tx - x) >= Math.abs(ty - y)) !== S.beltFlip;
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); cells.push([x, y]); } };
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); cells.push([x, y]); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    return cells;
  }
  const dirYaw = (dx, dy) => (dx > 0 ? 90 : dx < 0 ? 270 : dy > 0 ? 0 : 180);

  // Genera cintas (fantasma) encadenadas por índice local
  function beltsFor(cells, itemId) {
    const list = [];
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i];
      let yaw;
      if (i + 1 < cells.length) yaw = dirYaw(cells[i + 1][0] - x, cells[i + 1][1] - y);
      else if (i > 0) yaw = dirYaw(x - cells[i - 1][0], y - cells[i - 1][1]);
      else yaw = S.ghostRot * 90;
      const b = makeBuilding(itemId, x, y, yaw);
      if (!b) return [];
      list.push(b);
    }
    list.forEach((b, i) => {
      b.z = b.z2 = curLevel();
      b.inputToSlot = 1;
      if (i + 1 < list.length) { b.outputObjIdx = i + 1; b.outputToSlot = 1; }
    });
    return list;
  }

  // Cinta en la casilla a ese nivel; level = null -> a cualquier nivel salvo notLevel
  function beltAt(x, y, level = 0, notLevel) {
    for (const b of S.bp.buildings) {
      if (!isBelt(b) || Math.abs(b.x - x) > 0.3 || Math.abs(b.y - y) > 0.3) continue;
      if (level === null ? levelOf(b) !== notLevel : levelOf(b) === level) return b;
    }
    return null;
  }
  const hasInput = (t) => S.bp.buildings.some((b) => isBelt(b) && S.bp.buildings[b.outputObjIdx] === t);

  // Crea una línea de cintas al nivel actual. Se engancha a:
  //  - cintas del mismo nivel al principio y al final;
  //  - cintas de otro nivel en la misma casilla (subida/bajada: dos cintas en la casilla, como en el juego);
  //  - puertos de divisor (la cinta entra o sale a 0,2 del centro, al nivel del puerto).
  // Las cintas de otro nivel en medio del camino se cruzan sin conectar.
  function createBeltLine(cells) {
    const itemId = S.placeItem, L = curLevel();
    const bs = S.bp.buildings;
    // salida desde un puerto (divisor, estación…) en la primera casilla
    const startPort = cells.length > 1 ? portAt(cells[0], [cells[1][0] - cells[0][0], cells[1][1] - cells[0][1]], false, L) : null;
    // un puerto más adelante corta el camino ahí y la cinta entra por él
    let endPort = null;
    for (let i = 1; i < cells.length; i++) {
      if (!portCell(cells[i], L)) continue;
      endPort = portAt(cells[i], [cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]], true, L);
      if (!endPort) { toast(t('belt.noIn'), true); return; }
      cells = cells.slice(0, i + 1); break;
    }
    if (cells.length > 1 && !startPort && portCell(cells[0], L)) { toast(t('belt.noOut'), true); return; }
    const created = [];
    const add = (x, y, yaw) => {
      const nb = makeBuilding(itemId, x, y, yaw);
      nb.z = nb.z2 = L; nb.inputToSlot = 1;
      nb.index = bs.length; bs.push(nb); created.push(nb);
      return nb;
    };
    const link = (a, t) => {
      a.outputObjIdx = bs.indexOf(t); a.outputToSlot = 1; a.inputToSlot = 1;
      const dx = Math.round(t.x - a.x), dy = Math.round(t.y - a.y);
      if (dx || dy) a.yaw = a.yaw2 = dirYaw(dx, dy);
    };
    const yawAt = (i) => {
      const [x, y] = cells[i];
      if (i + 1 < cells.length) return dirYaw(cells[i + 1][0] - x, cells[i + 1][1] - y);
      if (i > 0) return dirYaw(x - cells[i - 1][0], y - cells[i - 1][1]);
      return S.ghostRot * 90;
    };
    pushUndo();
    let prev = null, msg = '';
    const first = startPort ? 1 : 0, last = endPort ? cells.length - 2 : cells.length - 1;
    if (startPort) {
      prev = add(r2(startPort.pos[0]), r2(startPort.pos[1]), dirYaw(...startPort.dir));
      prev.inputObjIdx = bs.indexOf(startPort.b); prev.inputFromSlot = startPort.slot;
    }
    for (let i = first; i <= last; i++) {
      const [x, y] = cells[i];
      const ex = beltAt(x, y, L);
      if (ex) {
        if (i === first && !prev) { prev = ex.outputObjIdx < 0 ? ex : null; continue; }
        if (prev) link(prev, ex);
        prev = null; break;
      }
      const other = beltAt(x, y, null, L);
      if (i === first && !prev && other && other.outputObjIdx < 0) {
        // subida/bajada al empezar sobre el final de una cinta de otro nivel
        const nb = add(x, y, yawAt(i));
        other.outputObjIdx = bs.indexOf(nb); other.outputToSlot = 1;
        prev = nb; msg = levelOf(other) < L ? t('belt.up') : t('belt.down');
        continue;
      }
      const nb = add(x, y, yawAt(i));
      if (prev) link(prev, nb);
      prev = nb;
      if (i === last && !endPort && other && !hasInput(other)) {
        // terminar sobre el principio de una cinta de otro nivel
        prev.outputObjIdx = bs.indexOf(other); prev.outputToSlot = 1;
        msg = levelOf(other) > L ? t('belt.up') : t('belt.down');
        prev = null;
      }
    }
    if (endPort && prev) {
      // entrada por un puerto
      const node = add(r2(endPort.pos[0]), r2(endPort.pos[1]), dirYaw(-endPort.dir[0], -endPort.dir[1]));
      link(prev, node);
      node.yaw = node.yaw2 = dirYaw(-endPort.dir[0], -endPort.dir[1]);
      node.outputObjIdx = bs.indexOf(endPort.b); node.outputToSlot = endPort.slot;
      msg = ` (a ${IT.itemName(endPort.b.itemId)})`;
      prev = null;
    } else if (prev && created.includes(prev)) {
      // ¿hay una cinta del mismo nivel justo después del final? conectar
      const a = prev.yaw * Math.PI / 180;
      const nxt = beltAt(Math.round(prev.x + Math.sin(a)), Math.round(prev.y + Math.cos(a)), L);
      if (nxt && nxt !== prev) { prev.outputObjIdx = bs.indexOf(nxt); prev.outputToSlot = 1; }
    }
    if (!created.length) { S.undo.pop(); return; }
    // puertos de estación: el sentido lo marca la cinta; en las salidas se pregunta qué producto sale
    const outSt = startPort && PR.STATION_SLOTS[startPort.b.itemId] ? startPort : null;
    if (endPort && PR.STATION_SLOTS[endPort.b.itemId]) PR.write(endPort.b, { ports: Object.assign([], { [endPort.slot]: { dir: 2, storage: 0 } }) });
    if (outSt) PR.write(outSt.b, { ports: Object.assign([], { [outSt.slot]: { dir: 1 } }) });
    S.sel = new Set(created);
    refresh();
    toast(t('belt.added', { n: created.length, level: L, extra: msg }));
    if (outSt) openPortChooser(outSt.b, outSt.slot);
  }

  // ------------------------------------------------------------------ producto de salida de una estación
  // Botones como el selector del juego: «Nada», y #1…#n con el icono del producto (o el número si está vacío)
  function portChoices(st, k) {
    const p = PR.read(st), cur = p.ports[k] ? p.ports[k].storage : 0;
    const tile = (v, inner, title) => `<button type="button" class="otile${v === cur ? ' on' : ''}" data-act="portOut" data-st="${S.bp.buildings.indexOf(st)}" data-k="${k}" data-v="${v}" title="${esc(title)}">${inner}</button>`;
    return `<div class="otiles">${tile(0, `<span class="onone">${esc(t('port.nothing'))}</span>`, t('port.nothing.tip'))}${p.slots.map((sl, i) => tile(i + 1,
      sl.item ? `${itemIcon(sl.item, 30)}<sup>#${i + 1}</sup>` : `<span class="onum">#${i + 1}</span>`,
      sl.item ? `#${i + 1} ${IT.itemName(sl.item)}` : t('port.empty', { n: i + 1 }))).join('')}</div>`;
  }
  function setPortOut(st, k, v) {
    pushUndo(); PR.write(st, { ports: Object.assign([], { [k]: { dir: 1, storage: v } }) }); refresh();
  }
  // Ventana flotante junto al cursor con botones data-v (como el selector de filtro del juego).
  // La elección va con lo que se acaba de colocar (mismo paso de deshacer). keyVal(n) traduce la tecla n a un data-v.
  let chooserKey = null;
  function closePortChooser() { const p = $('portPop'); if (p) p.remove(); chooserKey = null; }
  function openChooser(title, tiles, sub, onPick, keyVal) {
    closePortChooser();
    const pop = document.createElement('div');
    pop.id = 'portPop';
    pop.innerHTML = `<div class="ptitle">${esc(title)}</div>${tiles}<div class="muted small">${sub}</div>`;
    $('canvasWrap').appendChild(pop);
    const wr = $('canvasWrap').getBoundingClientRect();
    pop.style.left = Math.max(4, Math.min(S.mouse.sx + 12, wr.width - pop.offsetWidth - 4)) + 'px';
    pop.style.top = Math.max(4, Math.min(S.mouse.sy + 12, wr.height - pop.offsetHeight - 4)) + 'px';
    pop.addEventListener('mousedown', (ev) => ev.stopPropagation());
    pop.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-v]'); if (!t) return;
      onPick(+t.dataset.v, t); closePortChooser(); refresh();
    });
    chooserKey = keyVal || ((n) => n);
  }
  function openPortChooser(st, k) {
    openChooser(t('port.ask'), portChoices(st, k), esc(t('port.sub', { name: IT.itemName(st.itemId), k })),
      (v) => PR.write(st, { ports: Object.assign([], { [k]: { dir: 1, storage: v } }) }));
  }
  document.addEventListener('mousedown', (ev) => { const p = $('portPop'); if (p && !p.contains(ev.target)) closePortChooser(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('portPop')) { ev.stopPropagation(); closePortChooser(); } }, true);
  // Teclas 0…5 con el selector abierto: elegir sin ratón
  document.addEventListener('keydown', (ev) => {
    const p = $('portPop'); if (!p || !/^[0-9]$/.test(ev.key)) return;
    const v = chooserKey ? chooserKey(+ev.key) : +ev.key, t = v === undefined ? null : p.querySelector(`[data-v="${v}"]`);
    if (t) { ev.preventDefault(); ev.stopPropagation(); t.click(); }
  }, true);

  // ------------------------------------------------------------------ clasificadores
  function usedSlots(b) {
    const bs = S.bp.buildings, idx = bs.indexOf(b), used = new Set();
    for (const s of bs) {
      if (!isSorter(s)) continue;
      if (s.inputObjIdx === idx && s.inputFromSlot >= 0) used.add(s.inputFromSlot);
      if (s.outputObjIdx === idx && s.outputToSlot >= 0) used.add(s.outputToSlot);
    }
    return used;
  }

  function drawSlots(b, labels) {
    const list = slotsOf(b); if (!list.length) return;
    const s = S.view.scale, used = usedSlots(b), r = Math.max(2, s * 0.12);
    for (const { slot, pos } of list) {
      const [px, py] = w2s(pos[0], pos[1]);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = used.has(slot) ? '#4fc3f7' : 'rgba(15,18,24,.85)';
      ctx.fill();
      ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5; ctx.stroke();
      if (labels && s > 18) {
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(9, s * 0.25)}px Segoe UI`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(slot, px, py - r - 1);
      }
    }
  }

  function drawAnchor(a) {
    const [px, py] = w2s(a.pos[0], a.pos[1]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, Math.max(5, S.view.scale * 0.25), 0, Math.PI * 2); ctx.stroke();
  }

  // Punto de enganche bajo el cursor: hueco de edificio (prioridad) o cinta
  function findAnchor(wx, wy, exclude) {
    let best = null, bd = 0.45;
    for (const b of S.bp.buildings) {
      if (isBelt(b) || isSorter(b)) continue;
      if (Math.abs(b.x - wx) > 5 || Math.abs(b.y - wy) > 5) continue;
      for (const sl of slotsOf(b)) {
        const d = Math.hypot(sl.pos[0] - wx, sl.pos[1] - wy);
        if (d < bd) { bd = d; best = { kind: 'slot', b, slot: sl.slot, pos: sl.pos }; }
      }
    }
    if (best) return exclude && exclude.b === best.b ? null : best;
    let belt = null; bd = 0.55;
    for (const b of S.bp.buildings) {
      if (!isBelt(b)) continue;
      const d = Math.max(Math.abs(b.x - wx), Math.abs(b.y - wy));
      if (d < bd) { bd = d; belt = b; }
    }
    if (!belt || (exclude && exclude.b === belt)) return null;
    return { kind: 'belt', b: belt, pos: [belt.x, belt.y] };
  }

  const beltHorizontal = (b) => Math.abs(Math.sin(b.yaw * Math.PI / 180)) > 0.7;
  // El extremo sobre la cinta queda en la perpendicular desde el otro extremo
  function projectOnBelt(belt, p) {
    return beltHorizontal(belt) ? [p[0], belt.y] : [belt.x, p[1]];
  }
  function nearestBelt(p, fallback) {
    let best = fallback, bd = Infinity;
    for (const b of S.bp.buildings) {
      if (!isBelt(b)) continue;
      const d = Math.hypot(b.x - p[0], b.y - p[1]);
      if (d < bd && d < 0.75) { bd = d; best = b; }
    }
    return best;
  }

  function sorterGeometry(a, c) {
    let P = a.pos, Q = c.pos;
    if (a.kind === 'slot' && c.kind === 'belt') Q = projectOnBelt(c.b, P);
    else if (a.kind === 'belt' && c.kind === 'slot') P = projectOnBelt(a.b, Q);
    else if (a.kind === 'belt' && c.kind === 'belt') Q = projectOnBelt(c.b, P);
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    return { P, Q, len, ok: c.kind !== 'free' && len >= 0.6 && len <= 3.45 };
  }

  function drawSorterPreview(g, snapped) {
    const [ax, ay] = w2s(g.P[0], g.P[1]), [bx, by] = w2s(g.Q[0], g.Q[1]);
    ctx.strokeStyle = g.ok ? (BELT_COLORS[S.placeItem] || '#7fb3ff') : (snapped ? '#e05555' : 'rgba(255,255,255,.5)');
    ctx.lineWidth = Math.max(2, S.view.scale * 0.13); ctx.setLineDash(g.ok ? [] : [6, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    if (snapped && !g.ok) {
      ctx.fillStyle = '#e05555'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'left';
      ctx.fillText(t('canvas.sorterLen', { len: I18N.num(Math.round(g.len * 10) / 10) }), bx + 10, by);
    }
  }

  // Desplazamiento sobre la cinta: floor(20 × distancia a lo largo del sentido de avance)
  // (deducido de tus blueprints: 0,2 → 4 ; -0,2 → -5 ; 0,4 → 8 ; -0,14 → -3 ; centro → 0)
  function beltOffset(belt, p) {
    const a = belt.yaw * Math.PI / 180;
    const d = (p[0] - belt.x) * Math.sin(a) + (p[1] - belt.y) * Math.cos(a);
    if (Math.abs(d) < 1e-3) return 0;
    const v = d * 20, r = Math.round(v);
    // en valores exactos (0,2 → 4,0) el juego cae a un lado u otro por redondeo de float
    if (Math.abs(v - r) < 0.05) return v > 0 ? r : r - 1;
    return Math.floor(v);
  }

  // Lado hacia el que mira un hueco (normal hacia fuera, en local)
  function slotNormal(b, i) {
    const g = GEO[b.itemId], p = g.slots[i];
    if (g.slots.length === 12) return SIDE[(g.sides || 'NESW')[Math.floor(i / 3)]];
    const rx = Math.abs(p[0] - (g.ox || 0)) / (g.w / 2), ry = Math.abs(p[1] - (g.oy || 0)) / (g.h / 2);
    return rx > ry ? [Math.sign(p[0]), 0] : [0, Math.sign(p[1])];
  }
  // En las esquinas hay dos huecos casi en el mismo punto (uno por lado):
  // se elige el que mira hacia el otro extremo del clasificador.
  function resolveSlot(anchor, other) {
    if (anchor.kind !== 'slot') return anchor;
    const b = anchor.b, a = b.yaw * Math.PI / 180;
    let best = anchor, bestDot = -Infinity;
    for (const sl of slotsOf(b)) {
      if (Math.hypot(sl.pos[0] - anchor.pos[0], sl.pos[1] - anchor.pos[1]) > 0.2) continue;
      const [nx, ny] = slotNormal(b, sl.slot);
      const wx = nx * Math.cos(a) + ny * Math.sin(a), wy = -nx * Math.sin(a) + ny * Math.cos(a);
      const dx = other[0] - sl.pos[0], dy = other[1] - sl.pos[1], l = Math.hypot(dx, dy) || 1;
      const dot = (wx * dx + wy * dy) / l;
      if (dot > bestDot) { bestDot = dot; best = { kind: 'slot', b, slot: sl.slot, pos: sl.pos }; }
    }
    return best;
  }

  function createSorter(a, c) {
    a = resolveSlot(a, c.pos);
    c = resolveSlot(c, a.pos);
    const g = sorterGeometry(a, c);
    if (!g.ok) { toast(t('sorter.badLen', { len: I18N.num(Math.round(g.len * 10) / 10) }), true); return; }
    const bs = S.bp.buildings;
    const ia = a.kind === 'belt' ? nearestBelt(g.P, a.b) : a.b;
    const ic = c.kind === 'belt' ? nearestBelt(g.Q, c.b) : c.b;
    const yaw = normYaw(Math.atan2(g.Q[0] - g.P[0], g.Q[1] - g.P[1]) * 180 / Math.PI);
    const s = makeBuilding(S.placeItem, g.P[0], g.P[1], yaw);
    if (!s) return;
    pushUndo();
    Object.assign(s, {
      x: g.P[0], y: g.P[1], z: 0, x2: g.Q[0], y2: g.Q[1], z2: 0, yaw, yaw2: yaw,
      tilt: 0, pitch: 0, tilt2: 0, pitch2: 0,
      parameters: [Math.max(1, Math.min(3, Math.round(g.len)))],
      inputObjIdx: bs.indexOf(ia), inputFromSlot: a.kind === 'slot' ? a.slot : -1,
      outputObjIdx: bs.indexOf(ic), outputToSlot: c.kind === 'slot' ? c.slot : -1,
      outputFromSlot: 0, inputToSlot: 1,
      inputOffset: a.kind === 'belt' ? beltOffset(ia, g.P) : 0,
      outputOffset: c.kind === 'belt' ? beltOffset(ic, g.Q) : 0,
    });
    s.index = bs.length; bs.push(s);
    S.sel = new Set([s]);
    refresh();
    // sale de un edificio cuya receta da varios productos (refinería, planta química…): ¿cuál coge?
    const rec = a.kind === 'slot' && ia.recipeId ? IT.RECIPE_INFO[ia.recipeId] : null;
    if (rec && rec.products && rec.products.length > 1) openFilterChooser(s, ia, rec.products);
  }
  function openFilterChooser(sorter, from, products) {
    const tile = (v, inner, title) => `<button type="button" class="otile" data-v="${v}" title="${esc(title)}">${inner}</button>`;
    const tiles = `<div class="otiles">${tile(0, `<span class="onone">${esc(t('sorter.all'))}</span>`, t('sorter.all.tip'))}${products.map((p, i) =>
      tile(p, `${itemIcon(p, 30)}<sup>#${i + 1}</sup>`, `#${i + 1} ${IT.itemName(p)}`)).join('')}</div>`;
    openChooser(t('sorter.ask'), tiles, esc(t('sorter.sub', { name: IT.itemName(from.itemId), recipe: IT.RECIPE_INFO[from.recipeId].name })),
      (v, t) => { sorter.filterId = v; }, (i) => (i === 0 ? 0 : products[i - 1]));
  }

  // ------------------------------------------------------------------ transformaciones
  function rotPoint(dx, dy, times) {
    for (let i = 0; i < times; i++) [dx, dy] = [dy, -dx];
    return [dx, dy];
  }
  function rotateBuilding(b, cx, cy, times) {
    [b.x, b.y] = ((d) => [cx + d[0], cy + d[1]])(rotPoint(b.x - cx, b.y - cy, times));
    [b.x2, b.y2] = ((d) => [cx + d[0], cy + d[1]])(rotPoint(b.x2 - cx, b.y2 - cy, times));
    b.yaw = normYaw(b.yaw + 90 * times);
    b.yaw2 = normYaw(b.yaw2 + 90 * times);
  }
  function centroid(list) {
    let x = 0, y = 0;
    for (const b of list) { x += b.x; y += b.y; }
    return [Math.round(x / list.length), Math.round(y / list.length)];
  }

  function rotateSelection() {
    if (S.tool === 'place' || S.tool === 'belt' || S.tool === 'paste') { S.ghostRot = (S.ghostRot + 1) % 4; requestDraw(); return; }
    if (!S.sel.size) return;
    pushUndo();
    const list = [...S.sel];
    const [cx, cy] = centroid(list);
    list.forEach((b) => rotateBuilding(b, cx, cy, 1));
    refresh();
  }

  // Clasificadores enganchados a los edificios de `set` que no están en él
  function attachedSorters(set) {
    const bs = S.bp.buildings, idx = new Set();
    for (const b of set) if (!isSorter(b)) idx.add(bs.indexOf(b));
    return new Set(bs.filter((b) => isSorter(b) && !set.has(b) && (idx.has(b.inputObjIdx) || idx.has(b.outputObjIdx))));
  }
  // Mueve la selección y los clasificadores enganchados a ella. Si el otro extremo de un clasificador
  // no se mueve (la cinta), esa conexión se suelta: queda suelto y se puede borrar con "Limpiar".
  function moveSelection(dx, dy) {
    if (!S.sel.size || (!dx && !dy)) return;
    const bs = S.bp.buildings, carry = attachedSorters(S.sel);
    const moved = new Set([...S.sel, ...carry]);
    for (const b of moved) { b.x += dx; b.x2 += dx; b.y += dy; b.y2 += dy; }
    for (const b of carry) {
      if (b.inputObjIdx >= 0 && !moved.has(bs[b.inputObjIdx])) { b.inputObjIdx = -1; }
      if (b.outputObjIdx >= 0 && !moved.has(bs[b.outputObjIdx])) { b.outputObjIdx = -1; }
    }
    // Las cintas no se estiran: si un extremo de una conexión de cinta se mueve y el otro no, se corta
    let cut = 0;
    for (const b of bs) {
      if (!isBelt(b)) continue;
      const t = bs[b.outputObjIdx], f = bs[b.inputObjIdx];
      if (t && moved.has(b) !== moved.has(t)) { b.outputObjIdx = -1; b.outputToSlot = 0; cut++; }
      if (f && !isBelt(f) && moved.has(b) !== moved.has(f)) { b.inputObjIdx = -1; b.inputFromSlot = 0; cut++; }
    }
    // Cinta soltada sobre otra (misma casilla y nivel): la de debajo desaparece y la movida ocupa su sitio
    const merged = mergeDroppedBelts(moved);
    if (merged === false) {
      // no encajan: se deshace el movimiento
      S.bp = JSON.parse(S.undo.pop()); S.sel.clear();
      toast(t('move.badBelt'), true);
      return;
    }
    const joined = joinBeltEnds(new Set([...moved].filter((b) => S.bp.buildings.includes(b))));
    relinkSorters([...moved].filter((b) => S.bp.buildings.includes(b)));
    if (merged) toast(t('move.merged', { n: merged }));
    else if (joined) toast(t('move.joined', { n: joined }));
    else if (cut) toast(t('move.cut', { n: cut }));
  }

  // Engancha extremos libres que se miran: una cinta sin salida cuya casilla de delante tiene otra cinta del
  // mismo nivel (entre lo movido y lo quieto; con all, en todo el blueprint, como hace el juego al construir).
  // Devuelve cuántas conexiones ha hecho.
  function joinBeltEnds(moved, all) {
    const bs = S.bp.buildings;
    let n = 0;
    const ahead = (b) => {
      const a = b.yaw * Math.PI / 180, x = Math.round(b.x + Math.sin(a)), y = Math.round(b.y + Math.cos(a));
      return bs.find((t) => isBelt(t) && t !== b && Math.abs(t.x - x) < 0.3 && Math.abs(t.y - y) < 0.3 && levelOf(t) === levelOf(b));
    };
    for (const b of bs) {
      if (!isBelt(b) || b.outputObjIdx >= 0) continue;
      const t = ahead(b);
      if (!t || (!all && moved.has(b) === moved.has(t))) continue;
      // no enganchar contra el frente de t (flujo contrario)
      if (bs[t.outputObjIdx] === b || ahead(t) === b) continue;
      b.outputObjIdx = bs.indexOf(t); b.outputToSlot = 1; n++;
    }
    return n;
  }

  // Fusiona cada cinta movida con la cinta quieta que tenga debajo. Devuelve cuántas, o false si alguna no encaja
  // (la que llegaba a la de debajo vendría desde la casilla a la que sale la movida: flujo contrario).
  function mergeDroppedBelts(moved) {
    const bs = S.bp.buildings, pairs = [];
    for (const m of moved) {
      if (!isBelt(m)) continue;
      const e = bs.find((x) => isBelt(x) && !moved.has(x) && Math.abs(x.x - m.x) < 0.3 && Math.abs(x.y - m.y) < 0.3 && levelOf(x) === levelOf(m));
      if (e) pairs.push([m, e]);
    }
    if (!pairs.length) return 0;
    const cellOf = (b) => `${Math.round(b.x)},${Math.round(b.y)},${levelOf(b)}`;
    for (const [m, e] of pairs) {
      const out = bs[m.outputObjIdx] || bs[e.outputObjIdx];
      const preds = bs.filter((x) => (isBelt(x) || isSorter(x)) && x !== m && bs[x.outputObjIdx] === e && isBelt(x));
      if (out && preds.some((p) => cellOf(p) === cellOf(out))) return false;
    }
    for (const [m, e] of pairs) {
      const mi = bs.indexOf(m), ei = bs.indexOf(e);
      if (m.outputObjIdx < 0 && e.outputObjIdx >= 0) {
        m.outputObjIdx = e.outputObjIdx; m.outputToSlot = e.outputToSlot;
        const t = bs[m.outputObjIdx];
        if (t && isBelt(t)) { const dx = Math.round(t.x - m.x), dy = Math.round(t.y - m.y); if (dx || dy) m.yaw = m.yaw2 = dirYaw(dx, dy); }
      }
      if (m.inputObjIdx < 0 && e.inputObjIdx >= 0) { m.inputObjIdx = e.inputObjIdx; m.inputFromSlot = e.inputFromSlot; }
      // lo que apuntaba a la de debajo (cintas, clasificadores) pasa a apuntar a la movida
      for (const x of bs) {
        if (x === m) continue;
        if (x.outputObjIdx === ei) x.outputObjIdx = mi;
        if (x.inputObjIdx === ei) x.inputObjIdx = mi;
      }
      if (m.parameters.length === 0 && e.parameters.length) m.parameters = e.parameters.slice();
    }
    removeBuildings(new Set(pairs.map((p) => p[1])));
    return pairs.length;
  }
  // Engancha los extremos sueltos de los clasificadores de `list` a lo que tengan debajo: una cinta del mismo
  // nivel (con su desplazamiento) o un hueco de edificio. Al pegar o mover un edificio con sus clasificadores,
  // el extremo que iba a la cinta original se queda sin enlace aunque caiga sobre otra cinta.
  function relinkSorters(list) {
    const bs = S.bp.buildings;
    let n = 0;
    const at = (s, p) => {
      for (const b of bs) {
        if (b === s || isBelt(b) || isSorter(b) || Math.abs(b.x - p[0]) > 6 || Math.abs(b.y - p[1]) > 6) continue;
        for (const sl of slotsOf(b)) if (Math.hypot(sl.pos[0] - p[0], sl.pos[1] - p[1]) < 0.15) return { kind: 'slot', b, slot: sl.slot, pos: sl.pos };
      }
      let best = null, bd = 0.55;
      for (const b of bs) {
        if (!isBelt(b) || levelOf(b) !== levelOf(s)) continue;
        // la cinta debe pasar por el punto: dentro de su casilla y casi sobre su eje
        const along = beltHorizontal(b) ? Math.abs(b.y - p[1]) : Math.abs(b.x - p[0]);
        const d = Math.max(Math.abs(b.x - p[0]), Math.abs(b.y - p[1]));
        if (along < 0.15 && d < bd) { bd = d; best = b; }
      }
      return best && { kind: 'belt', b: best };
    };
    for (const s of list) {
      if (!isSorter(s)) continue;
      if (!bs[s.inputObjIdx]) {
        const a = at(s, [s.x, s.y]) && resolveSlot(at(s, [s.x, s.y]), [s.x2, s.y2]);
        if (a) { s.inputObjIdx = bs.indexOf(a.b); s.inputFromSlot = a.kind === 'slot' ? a.slot : -1; s.inputOffset = a.kind === 'belt' ? beltOffset(a.b, [s.x, s.y]) : 0; n++; }
      }
      if (!bs[s.outputObjIdx]) {
        const a = at(s, [s.x2, s.y2]) && resolveSlot(at(s, [s.x2, s.y2]), [s.x, s.y]);
        if (a) { s.outputObjIdx = bs.indexOf(a.b); s.outputToSlot = a.kind === 'slot' ? a.slot : -1; s.outputOffset = a.kind === 'belt' ? beltOffset(a.b, [s.x2, s.y2]) : 0; n++; }
      }
    }
    return n;
  }

  // Cintas repetidas: dos o más en la misma casilla y nivel (salen de pegar cintas encima de otras con versiones
  // anteriores del editor). El juego las funde en una al construir; aquí se funden igual, pasando a la que queda
  // las conexiones y los clasificadores de la otra. Devuelve cuántas se han quitado.
  function dupBelts() {
    const bs = S.bp.buildings, cells = new Map(), extra = new Set();
    for (const b of bs) {
      if (!isBelt(b)) continue;
      const k = `${Math.round(b.x)},${Math.round(b.y)},${levelOf(b)}`;
      const l = cells.get(k) || cells.set(k, []).get(k);
      if (l.some((a) => !extra.has(a) && Math.abs(a.x - b.x) < 0.3 && Math.abs(a.y - b.y) < 0.3)) extra.add(b);
      else l.push(b);
    }
    return extra;
  }
  function mergeDuplicateBelts() {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const extra = dupBelts();
      if (!extra.size) break;
      const m = mergeDroppedBelts(extra);
      if (!m) break;
      n += m;
    }
    return n;
  }
  // Funde las cintas repetidas y borra los clasificadores a los que les falta el inicio o el fin
  function cleanSorters() {
    if (!S.bp) return;
    const dups = dupBelts().size;
    const bs0 = S.bp.buildings;
    const loose0 = bs0.filter((b) => isSorter(b) && (!bs0[b.inputObjIdx] || !bs0[b.outputObjIdx])).length;
    pushUndo();
    const merged = dups ? mergeDuplicateBelts() : 0;
    const joined = joinBeltEnds(new Set(), true);
    if (!merged && !joined && !loose0) { S.undo.pop(); toast(t('clean.none')); return; }
    if (merged) relinkSorters(S.bp.buildings.filter(isSorter));
    const bs = S.bp.buildings;
    const loose = new Set(bs.filter((b) => isSorter(b) && (!bs[b.inputObjIdx] || !bs[b.outputObjIdx])));
    removeBuildings(loose);
    S.sel.clear();
    refresh();
    const left = dupBelts().size;
    toast([merged ? t('clean.dups', { n: merged }) : '', joined ? t('clean.joined', { n: joined }) : '', loose.size ? t('clean.done', { n: loose.size }) : '',
      left ? t('clean.dupsLeft', { n: left }) : ''].filter(Boolean).join(' · ') || t('clean.none'), !!left);
  }

  function deleteSelection() {
    if (!S.sel.size) return;
    pushUndo();
    const n = S.sel.size;
    removeBuildings(S.sel);
    S.sel.clear();
    refresh();
    toast(t('del.n', { n }));
  }

  function removeBuildings(rm) {
    const old = S.bp.buildings, map = new Map(), nb = [];
    old.forEach((b, i) => { if (!rm.has(b)) { map.set(i, nb.length); nb.push(b); } });
    for (const b of nb) {
      if (b.outputObjIdx >= 0) {
        if (map.has(b.outputObjIdx)) b.outputObjIdx = map.get(b.outputObjIdx);
        else { b.outputObjIdx = -1; if (isBelt(b)) b.outputToSlot = 0; }
      }
      if (b.inputObjIdx >= 0) {
        if (map.has(b.inputObjIdx)) b.inputObjIdx = map.get(b.inputObjIdx);
        else { b.inputObjIdx = -1; if (isBelt(b)) b.inputFromSlot = 0; }
      }
    }
    nb.forEach((b, i) => { b.index = i; });
    S.bp.buildings = nb;
  }

  // ------------------------------------------------------------------ portapapeles interno
  // withSorters: añade los clasificadores enganchados a lo seleccionado (Mayús, como en el juego)
  function copySelection(cut, withSorters) {
    if (!S.sel.size) return;
    const bs = S.bp.buildings;
    const picked = new Set(S.sel);
    if (withSorters) {
      const idx = new Set([...S.sel].map((b) => bs.indexOf(b)));
      for (const b of bs) if (isSorter(b) && (idx.has(b.inputObjIdx) || idx.has(b.outputObjIdx))) picked.add(b);
    }
    const list = bs.filter((b) => picked.has(b));
    const local = new Map(list.map((b, i) => [bs.indexOf(b), i]));
    const main = list.filter((b) => !isSorter(b));
    const [cx, cy] = centroid(main.length ? main : list);
    const items = list.map((b) => {
      const c = JSON.parse(JSON.stringify(b));
      c.x -= cx; c.x2 -= cx; c.y -= cy; c.y2 -= cy;
      c.outputObjIdx = local.has(b.outputObjIdx) ? local.get(b.outputObjIdx) : -1;
      c.inputObjIdx = local.has(b.inputObjIdx) ? local.get(b.inputObjIdx) : -1;
      if (c.outputObjIdx < 0 && isBelt(c)) c.outputToSlot = 0;
      if (c.inputObjIdx < 0 && isBelt(c)) c.inputFromSlot = 0;
      return c;
    });
    S.clip = { items };
    try { localStorage.setItem('dspbp.clip', JSON.stringify(S.clip)); } catch (e) { /* ignorar */ }
    if (cut) deleteSelection();
    else toast(t('copy.n', { n: items.length }));
  }

  function clipPlaced(gx, gy) {
    return S.clip.items.map((c) => {
      const b = JSON.parse(JSON.stringify(c));
      rotateBuilding(b, 0, 0, S.ghostRot);
      b.x += gx; b.x2 += gx; b.y += gy; b.y2 += gy;
      return b;
    });
  }

  function startPaste() {
    if (!S.clip) {
      try { S.clip = JSON.parse(localStorage.getItem('dspbp.clip') || 'null'); } catch (e) { /* ignorar */ }
    }
    if (!S.clip || !S.bp) return;
    S.ghostRot = 0;
    setTool('paste');
  }

  // Posiciones de una fila de copias de start a end: por el eje largo, separadas lo que mide el portapapeles
  function rowPositions(start, end) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    if (!dx && !dy) return [start];
    const horiz = Math.abs(dx) >= Math.abs(dy);
    let lo = Infinity, hi = -Infinity;
    for (const b of clipPlaced(0, 0)) {
      const k = COL.body(b); if (!k || isBelt(b)) continue;
      lo = Math.min(lo, horiz ? k.cx - k.hw : k.cy - k.hh); hi = Math.max(hi, horiz ? k.cx + k.hw : k.cy + k.hh);
    }
    const step = Math.max(1, Math.ceil((hi - lo) - 0.06)) || 1, len = horiz ? dx : dy, n = Math.floor(Math.abs(len) / step);
    const out = [];
    for (let i = 0; i <= n; i++) out.push(horiz ? [start[0] + Math.sign(len) * i * step, start[1]] : [start[0], start[1] + Math.sign(len) * i * step]);
    return out;
  }
  function addClip(gx, gy) {
    const base = S.bp.buildings.length;
    const list = clipPlaced(gx, gy);
    list.forEach((b, i) => {
      b.index = base + i;
      if (b.outputObjIdx >= 0) b.outputObjIdx += base;
      if (b.inputObjIdx >= 0) b.inputObjIdx += base;
      if (b.magic !== newMagic() && S.bp.buildings.length) b.magic = newMagic();
      S.bp.buildings.push(b);
    });
    // las cintas pegadas encima de otras las sustituyen (como al soltar al mover; el juego tampoco deja dos
    // cintas en la misma casilla). Si no encajan (sentido contrario), esta copia no se pega.
    if (mergeDroppedBelts(new Set(list)) === false) { removeBuildings(new Set(list)); return null; }
    joinBeltEnds(new Set(list.filter((b) => S.bp.buildings.includes(b))));
    relinkSorters(list);
    return list;
  }
  function placeRow(start, end) {
    const pos = rowPositions(start, end);
    pushUndo();
    const placed = [];
    let skipped = 0;
    for (const [x, y] of pos) {
      const got = COL.find(clipPlaced(x, y), S.bp.buildings).length ? null : addClip(x, y);
      if (!got) { skipped++; continue; }
      placed.push(...got);
    }
    if (!placed.length) { S.undo.pop(); if (pos.length > 1 || skipped) toast(t('paste.noRoom'), true); return; }
    S.sel = new Set(placed);
    learnTemplates(S.bp);
    refresh();
    if (pos.length > 1) toast(t('paste.n', { n: pos.length - skipped, skipped }));
  }

  function placeClip(gx, gy) {
    pushUndo();
    const list = addClip(gx, gy);
    if (!list) { S.undo.pop(); toast(t('move.badBelt'), true); return; }
    S.sel = new Set(list);
    learnTemplates(S.bp);
    refresh();
  }

  // ------------------------------------------------------------------ eventos del ratón
  function updateMouse(ev) {
    const r = canvas.getBoundingClientRect();
    S.mouse.sx = ev.clientX - r.left; S.mouse.sy = ev.clientY - r.top;
    [S.mouse.wx, S.mouse.wy] = s2w(S.mouse.sx, S.mouse.sy);
    $('stCursor').textContent = `x ${Math.round(S.mouse.wx)}  y ${Math.round(S.mouse.wy)}`;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mouseenter', () => { S.mouse.inside = true; });
  canvas.addEventListener('mouseleave', () => { S.mouse.inside = false; requestDraw(); });

  canvas.addEventListener('mousedown', (ev) => {
    updateMouse(ev);
    if (ev.button === 1 || ev.button === 2 || S.space) {
      S.drag = { type: 'pan', sx: ev.clientX, sy: ev.clientY, cx: S.view.cx, cy: S.view.cy, right: ev.button === 2 };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (ev.button !== 0 || !S.bp) return;
    if (S.xHeld) { eraseAt(ev.shiftKey); return; }
    const gx = Math.round(S.mouse.wx), gy = Math.round(S.mouse.wy);
    if (S.tool === 'place') { placeBuilding(gx, gy); return; }
    if (S.tool === 'belt') { S.drag = { type: 'belt', start: [gx, gy] }; requestDraw(); return; }
    if (S.tool === 'sorter') {
      const a = findAnchor(S.mouse.wx, S.mouse.wy);
      if (!a) { toast(t('sorter.start'), true); return; }
      S.drag = { type: 'sorter', start: a }; requestDraw(); return;
    }
    if (S.tool === 'paste') {
      S.drag = { type: 'pasteRow', start: [gx, gy], keep: ev.shiftKey };
      requestDraw(); return;
    }
    const hit = pick(S.mouse.wx, S.mouse.wy);
    // Mayús+clic en un edificio: copiarlo (con receta y clasificadores) y, sin soltar, arrastrar para poner copias en fila
    if (hit && ev.shiftKey && !isBelt(hit) && !isSorter(hit)) {
      S.sel = new Set([hit]);
      copySelection(false, true);
      startPaste();
      S.drag = { type: 'pasteRow', start: [Math.round(hit.x), Math.round(hit.y)], keep: true };
      requestDraw(); return;
    }
    if (hit) {
      if (ev.ctrlKey) {
        if (S.sel.has(hit)) S.sel.delete(hit); else S.sel.add(hit);
        refresh();
        return;
      }
      if (!S.sel.has(hit)) { S.sel.clear(); S.sel.add(hit); refresh(); }
      S.drag = { type: 'move', wx0: S.mouse.wx, wy0: S.mouse.wy, dx: 0, dy: 0, carry: attachedSorters(S.sel) };
    } else {
      if (!ev.ctrlKey) { S.sel.clear(); refresh(); }
      S.drag = { type: 'box', sx0: S.mouse.sx, sy0: S.mouse.sy, add: ev.ctrlKey };
    }
  });

  window.addEventListener('mousemove', (ev) => {
    updateMouse(ev);
    const d = S.drag;
    if (d && d.type === 'pan') {
      S.view.cx = d.cx - (ev.clientX - d.sx) / S.view.scale;
      S.view.cy = d.cy + (ev.clientY - d.sy) / S.view.scale;
    } else if (d && d.type === 'move') {
      d.dx = Math.round(S.mouse.wx - d.wx0); d.dy = Math.round(S.mouse.wy - d.wy0);
    }
    if (d || S.tool !== 'select') requestDraw();
  });

  window.addEventListener('mouseup', (ev) => {
    const d = S.drag; if (!d) return;
    S.drag = null;
    if (d.type === 'pan') {
      canvas.style.cursor = S.tool === 'select' ? 'default' : 'crosshair';
      // botón derecho sin arrastrar: igual que Esc (arrastrando, desplaza la vista)
      if (d.right && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) escapeAction();
      return;
    }
    if (d.type === 'move') {
      if (d.dx || d.dy) { pushUndo(); moveSelection(d.dx, d.dy); refresh(); }
      requestDraw();
    } else if (d.type === 'box') {
      const [ax, ay] = s2w(d.sx0, d.sy0), [bx, by] = s2w(S.mouse.sx, S.mouse.sy);
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      if (Math.abs(d.sx0 - S.mouse.sx) > 3 || Math.abs(d.sy0 - S.mouse.sy) > 3) {
        for (const b of S.bp.buildings) if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) S.sel.add(b);
      }
      refresh();
    } else if (d.type === 'pasteRow') {
      placeRow(d.start, [Math.round(S.mouse.wx), Math.round(S.mouse.wy)]);
      if (!d.keep) setTool('select');
    } else if (d.type === 'belt') {
      createBeltLine(beltPath(d.start, [Math.round(S.mouse.wx), Math.round(S.mouse.wy)]));
    } else if (d.type === 'sorter') {
      const end = findAnchor(S.mouse.wx, S.mouse.wy, d.start);
      if (end) createSorter(d.start, end);
      requestDraw();
    }
  });

  canvas.addEventListener('dblclick', (ev) => {
    updateMouse(ev);
    if (S.tool !== 'select' || !S.bp) return;
    const hit = pick(S.mouse.wx, S.mouse.wy);
    if (hit && isBelt(hit)) { selectBeltLine(hit); refresh(); }
    else if (hit) { S.bp.buildings.forEach((b) => { if (b.itemId === hit.itemId && b.recipeId === hit.recipeId) S.sel.add(b); }); refresh(); }
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    updateMouse(ev);
    const [wx, wy] = [S.mouse.wx, S.mouse.wy];
    const f = Math.exp(-ev.deltaY * 0.0015);
    S.view.scale = Math.max(1.5, Math.min(120, S.view.scale * f));
    // mantener el punto bajo el cursor
    S.view.cx = wx - (S.mouse.sx - W / 2) / S.view.scale;
    S.view.cy = wy + (S.mouse.sy - H / 2) / S.view.scale;
    requestDraw(); updateStatus();
  }, { passive: false });

  // ------------------------------------------------------------------ teclado
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.querySelector('dialog[open]')) return;
    const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && k === 's') { ev.preventDefault(); save(); return; }
    if (ctrl && k === 'o') { ev.preventDefault(); openFile(); return; }
    if (!S.bp) return;
    if (ctrl && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (ctrl && k === 'y') { ev.preventDefault(); redo(); return; }
    if (ctrl && k === 'c') { copySelection(false); return; }
    if (ctrl && k === 'x') { copySelection(true); return; }
    if (ctrl && k === 'v') { startPaste(); return; }
    if (ctrl && k === 'd') { ev.preventDefault(); copySelection(false); startPaste(); return; }
    if (ctrl && k === 'a') { ev.preventDefault(); S.sel = new Set(S.bp.buildings); refresh(); return; }
    if (k === ' ') { S.space = true; canvas.style.cursor = 'grab'; ev.preventDefault(); return; }
    if (k === 'delete' || k === 'backspace') { deleteSelection(); return; }
    // X mantenida: modo borrar (X+clic borra; Mayús+X+clic borra toda la cinta conectada del mismo tipo)
    if (k === 'x' && !ctrl) {
      if (!S.xHeld) { S.xHeld = true; canvas.style.cursor = 'not-allowed'; }
      return;
    }
    if (k === 'escape') { escapeAction(); return; }
    if (k === 'r' && S.tool === 'belt') {
      // en diagonal: alterna entre empezar en horizontal o en vertical
      S.beltFlip = !S.beltFlip; requestDraw();
      toast(t(S.beltFlip ? 'belt.bendFlip' : 'belt.bendLong')); return;
    }
    if (k === 'r') { rotateSelection(); return; }
    // +/- (como en el juego) o RePág/AvPág: altura de la cinta
    if (k === '+' || k === '-' || k === 'pageup' || k === 'pagedown') {
      ev.preventDefault();
      const up = k === '+' || k === 'pageup';
      const l = Math.max(0, Math.min(4, curLevel() + (up ? 1 : -1)));
      if (l === curLevel()) return;
      const d = S.drag;
      if (S.tool === 'belt' && d && d.type === 'belt') {
        // a mitad de trazado: se crea el tramo hasta aquí y se sigue desde esta casilla al nuevo nivel
        // (la casilla queda con dos cintas, una por nivel: la subida o bajada)
        const here = [Math.round(S.mouse.wx), Math.round(S.mouse.wy)];
        createBeltLine(beltPath(d.start, here));
        setLevel(l);
        S.drag = { type: 'belt', start: here };
        toast(t('level.change', { up, level: l }));
        requestDraw(); return;
      }
      setLevel(l); toast(t('level.now', { level: S.level })); return;
    }
    // E: elegir receta de lo seleccionado
    if (k === 'e') {
      const btn = $('recipeBtn');
      if (btn) { ev.preventDefault(); if (!$('recipePop')) openRecipePicker(btn); }
      else toast(t('recipe.needSel'), true);
      return;
    }
    if (k === 'tab') {
      ev.preventDefault();
      const models = Object.keys(SPLIT).map(Number);
      const sel = [...S.sel].filter((b) => b.itemId === 2020);
      if (S.tool === 'place' && S.placeItem === 2020) {
        S.splitModel = models[(models.indexOf(S.splitModel) + 1) % models.length];
        toast(t('split.now', { name: SPLIT[S.splitModel].name })); setTool('place', 2020);
      } else if (sel.length) {
        pushUndo();
        const m = models[(models.indexOf(sel[0].modelIndex) + 1) % models.length];
        sel.forEach((b) => { b.modelIndex = m; });
        toast(t('split.now', { name: SPLIT[m].name })); refresh();
      }
      return;
    }
    if (k === 'f') { fitView(); return; }
    if (k === 'v') { setTool('select'); return; }
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };
    if (arrows[k] && S.sel.size) {
      ev.preventDefault();
      const m = ev.shiftKey ? 5 : 1;
      pushUndo(); moveSelection(arrows[k][0] * m, arrows[k][1] * m); refresh();
    }
  });
  window.addEventListener('blur', () => { if (S.xHeld) { S.xHeld = false; canvas.style.cursor = S.tool === 'select' ? 'default' : 'crosshair'; } });
  window.addEventListener('keyup', (ev) => {
    if (ev.key.toLowerCase() === 'x' && S.xHeld) { S.xHeld = false; canvas.style.cursor = S.tool === 'select' ? 'default' : 'crosshair'; }
    if (ev.key === ' ') { S.space = false; canvas.style.cursor = S.tool === 'select' ? 'default' : 'crosshair'; }
  });

  // ------------------------------------------------------------------ inspector
  // Comprobación de suministro: se recalcula en cada cambio (unos milisegundos)
  // Se recalculan solo si cambia el blueprint (S.edits cuenta los cambios), la opción de la simulación o el idioma
  function updateFlow() {
    const k = S.bp ? [S.edits || 0, S.bp.buildings.length, S.openEnds, S.fillDepots, I18N.lang].join(':') : '';   // los avisos llevan texto
    if (S.bp && S.flowBp === S.bp && S.flowKey === k) return;
    S.flowBp = S.bp; S.flowKey = k;
    S.flow = S.bp ? FL.analyze(S.bp.buildings) : null;
    S.sim = S.bp ? SM.run(S.bp.buildings, { openEnds: S.openEnds, fillDepots: S.fillDepots }) : null;
    S.flowMarks = new Map();
    if (S.flow) for (const x of S.flow.issues) if (x.level === 'error' || !S.flowMarks.has(x.i)) S.flowMarks.set(x.i, x.level);
  }
  function refresh() {
    updateHits();
    updateFlow();
    requestDraw();
    renderInspector();
    updateStatus();
  }

  function updateStatus() {
    if (!S.bp) { $('stInfo').textContent = ''; return; }
    const n = S.hits ? S.hits.length : 0;
    $('stInfo').textContent = t('status', { n: S.bp.buildings.length, sel: S.sel.size, zoom: I18N.num(Math.round(S.view.scale * 10) / 10), hits: n });
  }

  // Recalcula los choques; avisa si la última acción ha creado alguno nuevo
  function updateHits() {
    if (!S.bp) { S.hits = null; return; }
    const prev = S.hits ? S.hits.length : null;
    S.hits = COL.find(S.bp.buildings);
    if (prev !== null && S.hits.length > prev && S.undo.length) {
      // la última acción ha creado un choque: se deshace (sin dejarla para rehacer)
      const [a, b] = S.hits[S.hits.length - 1];
      S.bp = JSON.parse(S.undo.pop());
      S.sel.clear();
      S.hits = COL.find(S.bp.buildings);
      toast(t('collide', { a: IT.itemName(a.itemId), b: IT.itemName(b.itemId) }), true);
    }
  }

  function field(label, inner) { return `<div class="field"><label>${label}</label><div>${inner}</div></div>`; }

  function renderInspector() {
    const el = $('inspector');
    if (!S.bp) { el.innerHTML = `<p class="muted">${esc(t('insp.none'))}</p>`; return; }
    if (S.sel.size === 0) el.innerHTML = inspectorBlueprint();
    else if (S.sel.size === 1) el.innerHTML = inspectorSingle([...S.sel][0]);
    else el.innerHTML = inspectorMulti();
  }

  function countTable(list, attr) {
    const counts = new Map();
    for (const b of list) counts.set(b.itemId, (counts.get(b.itemId) || 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `<tr><td><span class="link" data-${attr}="${id}">${esc(IT.itemName(id))}</span></td><td class="num">${n}</td></tr>`).join('');
    return `<table>${rows}</table>`;
  }

  function inspectorBlueprint() {
    const h = S.bp.header;
    const date = BP.ticksToDate(h.time);
    const icons = h.icons.map((v, i) => `<input type="number" data-icon="${i}" value="${v}" title="${esc(IT.itemName(v))}">`).join('');
    const iconNames = h.icons.filter((v) => v).map((v) => esc(IT.itemName(v))).join(', ') || '—';
    return `<h3>${t('bp.title')}</h3>
      ${field(t('bp.name'), `<input id="hName" value="${esc(h.shortDesc)}">`)}
      ${field(t('bp.desc'), `<textarea id="hDesc" rows="3">${esc(h.desc)}</textarea>`)}
      <div class="field"><label>${t('bp.icons')}</label><div class="icons-row">${icons}</div></div>
      <p class="muted small" style="margin:0 0 4px 101px">${iconNames}</p>
      ${field(t('bp.layout'), `<input type="number" id="hLayout" value="${h.layout}" title="${esc(t('bp.layout.tip'))}">`)}
      ${field(t('bp.version'), `<span class="muted">${esc(h.gameVersion)}</span>`)}
      ${field(t('bp.date'), `<span class="muted">${date ? date.toLocaleString(I18N.lang) : '—'}</span>`)}
      ${field(t('bp.hash'), S.bp.hashOk ? `<span class="badge ok">${t('bp.hashOk')}</span>` : `<span class="badge bad">${t('bp.hashBad')}</span>`)}
      ${field(t('bp.size'), `<span class="muted">${S.bp.areas[0] ? S.bp.areas[0].size.x + ' × ' + S.bp.areas[0].size.y : '—'} (${t('bp.areas', { n: S.bp.areas.length })})</span>`)}
      ${checksHTML()}
      ${simHTML()}
      ${totalsHTML(S.bp.buildings, t('bp.totals'))}
      <hr class="sep">
      <h3>${t('bp.buildings', { n: S.bp.buildings.length })}</h3>
      <p class="muted small">${t('bp.clickType')}</p>
      ${countTable(S.bp.buildings, 'selitem')}`;
  }

  function connLabel(idx) {
    if (idx < 0) return `<span class="muted">${t('conn.none')}</span>`;
    const b = S.bp.buildings[idx];
    if (!b) return `#${idx} <span class="muted">${t('conn.missing')}</span>`;
    return `<span class="link" data-goto="${idx}">#${idx} ${esc(IT.itemName(b.itemId))}</span>`;
  }

  // ------------------------------------------------------------------ inspector por tipo de edificio
  const BELT_TIERS = [[2001, 'Mk.I'], [2002, 'Mk.II'], [2003, 'Mk.III']];
  const SORTER_TIERS = [[2011, 'Mk.I'], [2012, 'Mk.II'], [2013, 'Mk.III'], [2014, () => t('tier.pile')]];

  function inspHead(b, sub) {
    const info = IT.buildingInfo(b.itemId);
    const icon = info.icon ? `<img class="insp-icon" src="${info.icon}" alt="">` : '';
    // en español, el nombre del juego en inglés arriba (el de la wiki) y el español debajo
    const top = I18N.lang === 'en' ? info.name : info.en || info.name;
    const second = [I18N.lang === 'en' ? '' : esc(info.name), sub].filter(Boolean).join(' · ');
    return `<div class="insp-head">${icon}<div><div class="insp-name">${esc(top)}</div>
      <div class="muted small">${second}</div></div></div>`;
  }
  function chips(tiers, isOn, act) {
    return `<div class="chips">${tiers.map(([id, label]) => `<button type="button" class="chip${isOn(id) ? ' on' : ''}" data-act="${act}" data-id="${id}"
      style="--c:${BELT_COLORS[id] || '#8892a6'}"${S.templates[id] ? '' : ` disabled title="${esc(t('tier.noModel'))}"`}>${typeof label === 'function' ? label() : label}</button>`).join('')}</div>`;
  }
  function itemButton(act, id, empty) {
    const name = id ? IT.itemName(id) : empty;
    return `<button type="button" class="rbtn pick-btn" data-act="${act}">${itemIcon(id, 24)}<span>${esc(name)}</span><span class="muted">▾</span></button>`;
  }
  // "Cinta #12" / "Ensamblador Mk.I #3, hueco 7"
  function endLabel(idx, slot) {
    const b = S.bp.buildings[idx];
    if (!b) return `<span class="bad-text">${t('end.loose')}</span>`;
    const sl = !isBelt(b) && slot >= 0 ? t('end.slot', { slot }) : '';
    return `<span class="link" data-goto="${idx}">${esc(IT.buildingInfo(b.itemId).name || IT.itemName(b.itemId))} #${idx}</span>${sl}`;
  }
  function advanced(b) {
    const slots = [b.outputToSlot, b.inputFromSlot, b.outputFromSlot, b.inputToSlot, b.outputOffset, b.inputOffset].join(', ');
    const big = b.parameters.length > 64;
    let html = `<details class="adv"><summary>${t('adv.title')}</summary>
      ${field(t('adv.model'), `<input type="number" data-f="modelIndex" value="${b.modelIndex}">`)}
      <div class="field"><label>${t('adv.pos')}</label><div class="xyz">
        <input type="number" step="0.5" data-f="x" value="${r2(b.x)}" title="x">
        <input type="number" step="0.5" data-f="y" value="${r2(b.y)}" title="y">
        <input type="number" step="0.5" data-f="z" value="${r2(b.z)}" title="${esc(t('adv.height'))}"></div></div>`;
    if (isSorter(b)) {
      html += `<div class="field"><label>${t('adv.pos2')}</label><div class="xyz">
        <input type="number" step="0.1" data-f="x2" value="${r2(b.x2)}"><input type="number" step="0.1" data-f="y2" value="${r2(b.y2)}">
        <input type="number" step="0.1" data-f="z2" value="${r2(b.z2)}"></div></div>`;
    }
    html += `${field(t('adv.yaw'), `<input type="number" step="90" data-f="yaw" value="${r2(b.yaw)}" title="${esc(t('adv.yaw.tip'))}">`)}
      ${field(t('adv.out'), connLabel(b.outputObjIdx))}
      ${field(t('adv.in'), connLabel(b.inputObjIdx))}
      ${field(t('adv.slots'), `<input id="slots" value="${slots}" title="${esc(t('adv.slots.tip'))}">`)}
      ${field(t('adv.params', { n: b.parameters.length }), `<textarea id="params" rows="${big ? 6 : 2}">${b.parameters.join(', ')}</textarea>`)}
      <div class="row end"><button id="btnApplyParams">${t('adv.apply')}</button></div>
    </details>`;
    return html;
  }

  function inspectorSingle(b) {
    const idx = S.bp.buildings.indexOf(b);
    const bs = S.bp.buildings;
    let html = '';
    if (isBelt(b)) {
      const line = beltLine(b, true);
      html += inspHead(b, t('belt.sub', { i: idx, level: levelOf(b) }));
      html += `<h4>${t('h.type')}</h4>${chips(BELT_TIERS, (id) => id === b.itemId, 'tier')}
        <p class="muted small">${t('belt.this')} <span class="link" data-act="lineSel">${t('belt.selLine', { n: line.size })}</span> ${t('belt.toChange')}</p>
        <h4>${t('belt.label')}</h4>${itemButton('pickLabel', b.parameters[0] || 0, t('belt.noLabel'))}
        ${carriesHTML(idx)}${simBeltHTML(b, idx)}
        <h4>${t('belt.route')}</h4>
        ${field(t('belt.from'), bs.some((x) => isBelt(x) && bs[x.outputObjIdx] === b) ? t('belt.otherBelt') : (b.inputObjIdx >= 0 ? endLabel(b.inputObjIdx, b.inputFromSlot) : `<span class="muted">${t('belt.start')}</span>`))}
        ${field(t('belt.to'), b.outputObjIdx >= 0 ? endLabel(b.outputObjIdx, b.outputToSlot) : `<span class="muted">${t('belt.end')}</span>`)}`;
      // Cinta que sale de una estación: qué producto saca
      const st = bs[b.inputObjIdx];
      if (st && PR.STATION_SLOTS[st.itemId] && b.inputFromSlot >= 0 && b.inputFromSlot < 12) {
        html += `<h4>${t('belt.stationOut')}</h4>${portChoices(st, b.inputFromSlot)}`;
      }
    } else if (isSorter(b)) {
      const len = b.parameters[0] || 1;
      html += inspHead(b, `#${idx}`);
      html += `<h4>${t('h.type')}</h4>${chips(SORTER_TIERS, (id) => id === b.itemId, 'tier')}
        <h4>${t('sorter.filter')}</h4>${itemButton('pickFilter', b.filterId, t('sorter.noFilter'))}
        <h4>${t('sorter.conn')}</h4>
        ${field(t('sorter.from'), endLabel(b.inputObjIdx, b.inputFromSlot))}
        ${field(t('sorter.to'), endLabel(b.outputObjIdx, b.outputToSlot))}
        ${field(t('sorter.len'), t('sorter.cells', { n: len }))}
        ${field(t('sorter.cap'), `<b>${fmtRate(RT.sorter(b))}/min</b> <span class="muted small">(${t('sorter.capNote', { speed: I18N.num(RT.SORTER_SPEED[b.itemId] || 0), len })})</span>`)}
        ${simSorterHTML(b, idx)}
        ${(() => { const mv = S.flow && S.flow.moves.get(idx); return mv && mv.size ? field(t('sorter.carry'), [...mv].map((id) => `<span class="carry" title="${esc(IT.itemName(id))}">${itemIcon(id, 20)}<span>${esc(IT.itemName(id))}</span></span>`).join(' ')) : ''; })()}`;
    } else {
      const g = IT.RECIPE_GROUP[b.itemId];
      const below = b.inputObjIdx >= 0 && bs[b.inputObjIdx] && !isBelt(bs[b.inputObjIdx]) && !isSorter(bs[b.inputObjIdx]) &&
        Math.abs(bs[b.inputObjIdx].x - b.x) < 0.3 && Math.abs(bs[b.inputObjIdx].y - b.y) < 0.3 ? bs[b.inputObjIdx] : null;
      html += inspHead(b, `#${idx}${b.z > 0.5 ? ' · ' + t('b.height', { z: I18N.num(r2(b.z)) }) : ''}`);
      html += issuesOf(idx);
      if (g || b.recipeId) html += `<h4>${t('h.recipe')} <span class="muted small">(E)</span></h4><div class="wide">${recipeButton(b.recipeId)}</div>${rateHTML(b)}${simMachineHTML(idx)}`;
      html += powerHTML(b);
      if (b.itemId === 2020 && SPLIT[b.modelIndex]) {
        html += `<h4>${t('h.variant')} <span class="muted small">(Tab)</span></h4><div class="chips col">${Object.entries(SPLIT).map(([m, v]) =>
          `<button type="button" class="chip${+m === b.modelIndex ? ' on' : ''}" data-act="split" data-id="${m}">${esc(v.short)} ${esc(v.name)}</button>`).join('')}</div>`;
      }
      html += propsHTML(b);
      if (below) html += `<p class="muted small">${t('b.stackedOn', { what: endLabel(bs.indexOf(below), -1) })}</p>`;
      const att = attachedSorters(new Set([b]));
      const ports = beltPorts(b);
      if (att.size || slotsOf(b).length || ports.length) {
        html += `<h4>${t('h.conn')}</h4>`;
        const ofSlots = t('b.ofSlots', { slots: slotsOf(b).length });
        if (slotsOf(b).length) html += field(t('b.sorters'), att.size ? `<span class="link" data-act="selSorters">${t('b.sortersOn', { n: att.size })}</span>${ofSlots}` : `0${ofSlots}`);
        if (ports.length) {
          const used = ports.filter((p) => bs.some((x) => isBelt(x) && ((x.outputObjIdx === idx && x.outputToSlot === p.slot) || (x.inputObjIdx === idx && x.inputFromSlot === p.slot))));
          html += field(t('b.beltPorts'), t('b.portsUsed', { used: used.length, n: ports.length }));
        }
      }
    }
    html += `<div class="row wrap">
        <button id="btnRotSel" title="R">${t('btn.rotate')}</button>
        <button data-act="copyWith" title="${esc(t('btn.copy.tip'))}">${t('btn.copy')}</button>
        <button id="btnSelSame">${t('btn.selSame')}</button>
        <button class="danger" id="btnDelOne" title="${esc(t('btn.delete.tip'))}">${t('btn.delete')}</button></div>`;
    html += advanced(b);
    return html;
  }

  function inspectorMulti() {
    const list = [...S.sel];
    const prodList = list.filter((b) => IT.RECIPE_GROUP[b.itemId]);
    const belts = list.filter(isBelt), sorters = list.filter(isSorter);
    const counts = new Map();
    for (const b of list) counts.set(b.itemId, (counts.get(b.itemId) || 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
      const info = IT.buildingInfo(id);
      return `<div class="type-row" data-keepitem="${id}">${info.icon ? `<img src="${info.icon}" alt="">` : '<span></span>'}<span class="link" data-keepitem="${id}">${esc(info.name)}</span><span class="num">${n}</span></div>`;
    }).join('');
    let html = `<h3>${t('multi.title', { n: list.length })}</h3><p class="muted small">${t('multi.clickType')}</p>${rows}`;
    if (prodList.length) {
      const recipes = new Set(prodList.map((b) => b.recipeId));
      html += `<h4>${t('multi.recipe', { n: prodList.length })} <span class="muted small">(E)</span></h4><div class="wide">${recipeButton(recipes.size === 1 ? [...recipes][0] : null)}</div>`;
    }
    if (belts.length) {
      const tiers = new Set(belts.map((b) => b.itemId));
      html += `<h4>${t('multi.belts', { n: belts.length })}</h4>${chips(BELT_TIERS, (id) => tiers.size === 1 && tiers.has(id), 'tier')}`;
    }
    if (sorters.length) {
      const tiers = new Set(sorters.map((b) => b.itemId)), filters = new Set(sorters.map((b) => b.filterId));
      html += `<h4>${t('multi.sorters', { n: sorters.length })}</h4>${chips(SORTER_TIERS, (id) => tiers.size === 1 && tiers.has(id), 'tier')}
        ${itemButton('pickFilter', filters.size === 1 ? [...filters][0] : 0, filters.size === 1 ? t('sorter.noFilter') : t('sorter.mixed'))}`;
    }
    const same = new Set(list.map((b) => b.itemId));
    if (same.size === 1 && PR.read(list[0])) html += propsHTML(list[0], true);
    html += totalsHTML(list, t('multi.totals'));
    html += `<div class="row wrap"><button id="btnRotSel">${t('btn.rotate')}</button><button id="btnCopySel">${t('btn.copy')}</button><button class="danger" id="btnDelSel">${t('btn.delete')}</button></div>`;
    return html;
  }

  // ------------------------------------------------------------------ recetas, ritmos y potencia (js/rates.js)
  const fmtRate = (v) => I18N.num(v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
  const fmtTime = (v) => `${I18N.num(Math.round(v * 1000) / 1000)} s`;
  const fmtPower = (kw) => (Math.abs(kw) >= 1000 ? `${I18N.num(Math.round(kw / 10) / 100)} MW` : `${I18N.num(Math.round(kw * 10) / 10)} kW`);
  const gotOf = (b) => (S.flow && S.flow.supplied.get(S.bp.buildings.indexOf(b))) || new Set();
  const ioRow = (id, n, perMin, ok) => `<div class="io">${ok === undefined ? '' : `<span class="${ok ? 'okmark' : 'badmark'}">${ok ? '✓' : '✗'}</span>`}<span class="ioi">${itemIcon(id, 22)}</span><span class="ion">${esc(IT.itemName(id))}</span>${n !== null ? `<span class="muted">×${n}</span>` : ''}<span class="ior">${fmtRate(perMin)}/min</span></div>`;
  // Receta de una máquina: tiempo con su multiplicador, entradas y salidas por ciclo y por minuto
  function rateHTML(b) {
    const m = RT.machine(b);
    if (!m) return b.itemId === 2314 && b.recipeId ? `<p class="muted small">${t('rate.fract')}</p>` : '';
    const r = IT.RECIPE_INFO[b.recipeId] || {}, src = window.DSPRecipes[b.recipeId];
    const sp = m.speed !== 1 ? `${fmtTime(m.base)} × 1/${I18N.num(m.speed)} = <b>${fmtTime(m.cycle)}</b>` : `<b>${fmtTime(m.cycle)}</b>`;
    return `<div class="recipe-io">
      ${field(t('rate.cycle'), `${sp} <span class="muted small">(${t('rate.speed', { speed: I18N.num(m.speed) })})</span>`)}
      <div class="muted small">${t('rate.inputs')} <span class="small">${t('rate.inputsNote')}</span></div>${src.in.map(([id, n], i) => ioRow(id, n, m.in[i][1], gotOf(b).has(id))).join('')}
      <div class="muted small">${t('rate.outputs')}</div>${src.out.map(([id, n], i) => ioRow(id, n, m.out[i][1])).join('')}
    </div>`;
  }
  function powerHTML(b) {
    const p = RT.power(b);
    if (!p) return '';
    if (p.work < 0) return `<h4>${t('power.title')}</h4>${field(t('power.gen'), fmtPower(-p.work))}`;
    return `<h4>${t('power.use')}</h4>${field(t('power.work'), fmtPower(p.work))}${field(t('power.idle'), fmtPower(p.idle))}`;
  }
  // Comprobación de suministro (js/flow.js)
  const LEVEL = { error: '✗', warn: '!' };
  function issueRow(x) {
    const b = S.bp.buildings[x.i], info = b ? IT.buildingInfo(b.itemId) : { name: '?' };
    return `<div class="issue ${x.level}"><span class="lv">${LEVEL[x.level]}</span><span><span class="link" data-goto="${x.i}">${esc(info.name)} #${x.i}</span>: ${esc(x.msg)}</span></div>`;
  }
  function issuesOf(i) {
    const l = S.flow ? S.flow.issues.filter((x) => x.i === i) : [];
    return l.length ? `<div class="issues">${l.map((x) => `<div class="issue ${x.level}"><span class="lv">${LEVEL[x.level]}</span><span>${esc(x.msg)}</span></div>`).join('')}</div>` : '';
  }
  function checksHTML() {
    if (!S.flow) return '';
    const l = S.flow.issues, err = l.filter((x) => x.level === 'error'), warn = l.filter((x) => x.level === 'warn');
    const MAX = 40, rows = [...err, ...warn].slice(0, MAX).map(issueRow).join('');
    return `<hr class="sep"><h3>${t('checks.title')}</h3>
      <p class="muted small">${t('checks.note')}</p>
      ${l.length ? `<p class="small">${t('checks.count', { err: err.length, warn: warn.length, max: l.length > MAX ? MAX : 0 })}</p>${rows}` : `<p class="ok-text small">${t('checks.ok')}</p>`}`;
  }
  function carriesHTML(i) {
    const s = S.flow && S.flow.items.get(i);
    const list = s && s.size ? [...s].map((id) => `<span class="carry" title="${esc(IT.itemName(id))}">${itemIcon(id, 22)}<span>${esc(IT.itemName(id))}</span></span>`).join('') : `<span class="muted small">${t('carries.none')}</span>`;
    return `<h4>${t('carries.title')}</h4><div class="carries">${list}</div>${issuesOf(i)}`;
  }

  // ------------------------------------------------------------------ simulación (js/sim.js)
  const pctOf = (r) => `${Math.floor(r * 100 + 1e-6)} %`;
  const itemList = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<div class="io"><span class="ioi">${itemIcon(+id, 20)}</span><span class="ion">${esc(IT.itemName(+id))}</span><span class="ior">${fmtRate(v)}/min</span></div>`).join('');
  function reasonOf(m) {
    if (m.r > 0.995) return t('sim.full');
    const l = m.limit || {};
    return l.kind && l.kind !== 'none' ? t('sim.limit.' + l.kind, { item: IT.itemName(l.item) }) : t('sim.slowed');
  }
  function simMachineHTML(i) {
    const m = S.sim && S.sim.machines.get(i);
    if (!m) return '';
    const row = (x, a, b) => `<div class="io"><span class="ioi">${itemIcon(+x, 20)}</span><span class="ion">${esc(IT.itemName(+x))}</span><span class="muted">${fmtRate(a)} ${t('sim.of')}</span><span class="ior">${fmtRate(b)}/min</span></div>`;
    const rows = Object.keys(m.need).map((x) => row(x, m.got[x] || 0, m.need[x])).join('');
    const outs = Object.keys(m.prod).map((x) => row(x, m.prod[x] * m.r, m.prod[x])).join('');
    const cls = m.r > 0.995 ? 'full' : m.r < 0.01 ? 'zero' : '';
    return `<h4>${t('sim.title')}</h4>
      <div class="simbar"><span style="width:${Math.round(m.r * 100)}%" class="${cls}"></span><b>${pctOf(m.r)}</b></div>
      <p class="small ${m.r > 0.995 ? 'ok-text' : 'warn-text'}">${esc(reasonOf(m))}</p>
      <div class="muted small">${t('sim.receives')}</div>${rows}<div class="muted small">${t('sim.makes')}</div>${outs}`;
  }
  function simBeltHTML(b, i) {
    const f = S.sim && S.sim.belts.get(i);
    if (!f) return '';
    const tot = Object.values(f).reduce((a, v) => a + v, 0), cap = SM.BELT_CAP[b.itemId];
    return `<h4>${t('sim.title')}</h4>${field(t('sim.passes'), `<b>${fmtRate(tot)}/min</b> <span class="muted small">${t('sim.ofCap', { cap: fmtRate(cap), pct: pctOf(tot / cap) })}</span>`)}${itemList(f)}`;
  }
  function simSorterHTML(b, i) {
    const f = S.sim && S.sim.sorters.get(i);
    if (!f) return '';
    const tot = Object.values(f).reduce((a, v) => a + v, 0), cap = RT.sorter(b);
    return `${field(t('sim.moves'), `<b>${fmtRate(tot)}/min</b> <span class="muted small">${t('sim.ofCap', { cap: fmtRate(cap), pct: pctOf(tot / cap) })}</span>`)}${itemList(f)}`;
  }
  function simHTML() {
    if (!S.sim) return '';
    const sm = S.sim, bs = S.bp.buildings, ms = [...sm.machines];
    const sumUp = (map) => { const o = {}; for (const v of map.values()) for (const k in v) o[k] = (o[k] || 0) + v[k]; return o; };
    const inn = sumUp(sm.sources), out = sumUp(sm.sinks);
    const slow = ms.filter(([, m]) => m.r <= 0.995).sort((a, b) => a[1].r - b[1].r);
    const full = ms.length - slow.length;
    const rows = slow.slice(0, 40).map(([i, m]) => `<div class="issue ${m.r < 0.01 ? 'error' : 'warn'}"><span class="lv">${Math.floor(m.r * 100)}%</span><span><span class="link" data-goto="${i}">${esc(IT.buildingInfo(bs[i].itemId).name)} #${i}</span>: ${esc(reasonOf(m))}</span></div>`).join('');
    const jams = sm.jams.slice(0, 10).map((j) => `<div class="issue warn"><span class="lv">!</span><span><span class="link" data-goto="${j.i}">${t('sim.jam', { i: j.i })}</span>: ${esc(t('sim.jamMsg', { rate: fmtRate(j.rate), item: IT.itemName(j.item) }))}</span></div>`).join('');
    // distribuidores que ofrecen pero a los que nunca les sobra nada en el almacén
    const idle = (sm.offers || []).filter((o) => o.rate < 0.01).slice(0, 10).map((o) => `<div class="issue warn"><span class="lv">!</span><span><span class="link" data-goto="${o.i}">${esc(IT.buildingInfo(bs[o.i].itemId).name)} #${o.i}</span>: ${esc(t(o.inflow > 0.01 ? 'sim.offerIdle' : 'sim.offerEmpty', { item: IT.itemName(o.item), rate: fmtRate(o.inflow) }))}</span></div>`).join('');
    const none = (txt) => `<p class="muted small">${txt}</p>`;
    return `<hr class="sep"><h3>${t('sim.title')}</h3>
      <p class="muted small">${t('sim.note')}</p>
      <label class="pcheck"><input type="checkbox" id="fillDepots"${S.fillDepots ? ' checked' : ''}> ${t('sim.fillDepots')}</label>
      <label class="pcheck"><input type="checkbox" id="openEnds"${S.openEnds ? ' checked' : ''}> ${t('sim.openEnds')}</label>
      ${ms.length ? `<p class="small"><span class="ok-text">${t('sim.machines', { full, n: ms.length })}</span>${slow.length ? ` · <span class="warn-text">${t('sim.below', { n: slow.length })}</span>` : ''}</p>${rows}` : ''}
      ${jams}${idle}
      ${Object.keys(inn).length ? `<div class="muted small">${t('sim.in')}</div>${itemList(inn)}` : none(t('sim.noIn'))}
      ${Object.keys(out).length ? `<div class="muted small">${t('sim.out')}</div>${itemList(out)}` : none(t('sim.noOut'))}
      ${sm.converged ? '' : `<p class="warn-text small">${t('sim.notConverged', { n: sm.iterations })}</p>`}`;
  }

  // Balance de un grupo de edificios: lo que se produce y consume por minuto y la potencia
  function totalsHTML(list, what) {
    const tt = RT.totals(list);
    if (!tt.machines && !tt.work && !tt.gen) return '';
    const rows = tt.items.map(([id, i, o]) => {
      const net = o - i, cls = Math.abs(net) < 1e-6 ? 'muted' : net > 0 ? 'pos' : 'neg';
      return `<tr><td>${itemIcon(id, 18)}</td><td>${esc(IT.itemName(id))}</td><td class="num muted">${i ? fmtRate(i) : ''}</td><td class="num muted">${o ? fmtRate(o) : ''}</td><td class="num ${cls}">${net > 0 ? '+' : ''}${fmtRate(net)}</td></tr>`;
    }).join('');
    return `<hr class="sep"><h3>${t('totals.title', { what })}</h3>
      <p class="muted small">${t('totals.note')}</p>
      ${tt.items.length ? `<table class="rates"><tr class="muted small"><td></td><td>${t('totals.machines', { n: tt.machines })}</td><td class="num">${t('totals.in')}</td><td class="num">${t('totals.out')}</td><td class="num">${t('totals.net')}</td></tr>${rows}</table>` : ''}
      ${field(t('power.use'), t('totals.power', { work: fmtPower(tt.work), idle: fmtPower(tt.idle) }))}
      ${tt.gen ? field(t('power.gen'), fmtPower(tt.gen)) : ''}
      ${tt.notes.length ? `<p class="muted small">${esc(tt.notes.join(' · '))}.</p>` : ''}`;
  }

  // ------------------------------------------------------------------ propiedades (js/props.js)
  // Los controles llevan data-p con la ruta del campo ("chargeMW", "slots.2.local", "priority.1"…).
  // Se aplica a todos los seleccionados del mismo tipo que el primero.
  const LOGIC = () => [[0, t('logic.storage')], [1, t('logic.supply')], [2, t('logic.demand')]];
  const SIDE_NAME = (k) => t('side.' + k);
  // Icarus en el distribuidor: el 2 («dar y recoger») está comprobado en el juego; 1 y 3 son deducidos.
  const ICARUS = () => [[2, t('icarus.both')], [1, t('icarus.give')], [3, t('icarus.take')], [0, t('no')]];
  const DISTR = () => [[0, t('no')], [1, t('logic.supply')], [2, t('logic.demand')]];

  function pathObj(path, v) {
    const keys = path.split('.'), root = {};
    let o = root;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1, nextIsIdx = !last && /^\d+$/.test(keys[i + 1]);
      if (last) o[k] = v;
      else { o[k] = o[k] || (nextIsIdx ? [] : {}); o = o[k]; }
    });
    return root;
  }
  function applyProp(path, v) {
    const first = [...S.sel][0]; if (!first) return;
    const list = [...S.sel].filter((b) => b.itemId === first.itemId);
    pushUndo();
    let changes = pathObj(path, v);
    if (path === 'filtersAll') changes = { filters: Array(PR.DEPOT_SLOTS[first.itemId]).fill(v) };
    for (const b of list) PR.write(b, changes);
    refresh();
  }
  const pChips = (path, opts, cur) => `<div class="chips">${opts.map(([v, label]) =>
    `<button type="button" class="chip${v === cur ? ' on' : ''}" data-act="setProp" data-p="${path}" data-v="${v}">${esc(label)}</button>`).join('')}</div>`;
  const pSelect = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, label]) =>
    `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  const pNum = (path, v, attrs = '') => `<input type="number" data-p="${path}" value="${v}" ${attrs}>`;
  const pCheck = (path, v, label) => `<label class="pcheck"><input type="checkbox" data-p="${path}"${v ? ' checked' : ''}> ${esc(label)}</label>`;
  const pItem = (path, id, empty, cls = '') => `<button type="button" class="rbtn pick-btn ${cls}" data-act="pickProp" data-p="${path}" data-cur="${id}" data-empty="${esc(empty)}">${itemIcon(id, 22)}<span>${esc(id ? IT.itemName(id) : empty)}</span><span class="muted">▾</span></button>`;

  // Cinta bajo un monitor de tráfico (misma casilla y nivel), o null
  function monitorBelt(m) {
    const i = S.bp.buildings.findIndex((x) => isBelt(x) && Math.abs(x.x - m.x) < 0.5 && Math.abs(x.y - m.y) < 0.5 && Math.abs(x.z - m.z) < 0.5);
    return i < 0 ? null : i;
  }
  // Cintas enganchadas a cada puerto: { slot: { belt, dir: 'in' | 'out' } } (in = la cinta entra en el edificio)
  function portBelts(b) {
    const idx = S.bp.buildings.indexOf(b), out = {};
    S.bp.buildings.forEach((x, i) => {
      if (!isBelt(x)) return;
      if (x.outputObjIdx === idx && x.outputToSlot >= 0) out[x.outputToSlot] = { belt: i, dir: 'in' };
      else if (x.inputObjIdx === idx && x.inputFromSlot >= 0) out[x.inputFromSlot] = { belt: i, dir: 'out' };
    });
    return out;
  }

  function propsHTML(b, multi) {
    const p = PR.read(b); if (!p) return '';
    const id = b.itemId;
    let h = '';
    if (id === 2208) {
      h += `<h4>${t('ray.mode')}</h4>${pChips('mode', [['power', t('ray.power')], ['photon', t('ray.photon')]], p.mode)}
        <p class="muted small">${p.mode === 'photon' ? t('ray.photonNote') : t('ray.powerNote')}</p>`;
    } else if (id === 2107) {
      h += `<h4>${t('p.product')}</h4>${pItem('item', p.item, t('p.noProduct'))}
        <h4>${t('dist.title')}</h4>
        ${field(t('dist.icarus'), pSelect('icarus', ICARUS(), p.icarus))}
        ${field(t('dist.others'), pChips('distributors', DISTR(), p.distributors))}
        ${field(t('p.chargeMW'), pNum('chargeMW', p.chargeMW, 'step="0.3" min="0.3"'))}
        ${pCheck('autoBots', p.autoBots, t('dist.autoBots'))}`;
    } else if (PR.DEPOT_SLOTS[id]) {
      const anyF = p.filters.some(Boolean);
      h += `<h4>${t('depot.cap')}</h4>${field(t('depot.usable'), `<div class="row">${pNum('usable', p.usable, `min="0" max="${p.slots}" style="width:70px"`)}<span class="muted small">${t('depot.of', { n: p.slots })}</span></div>`)}
        <h4>${t('depot.filters')} <span class="muted small">${t('depot.filtersNote')}</span></h4>
        <div class="wide"><div class="fgrid">${p.filters.map((f, i) =>
          `<button type="button" class="ftile pick-btn${i >= p.usable ? ' banned' : ''}" data-act="pickProp" data-p="filters.${i}" data-cur="${f}" data-empty="${esc(t('depot.noFilter'))}" title="${esc(t('depot.slot', { n: i + 1, what: f ? IT.itemName(f) : t('depot.noFilter') }))}">${f ? itemIcon(f, 20) : ''}</button>`).join('')}</div></div>
        <div class="row wrap"><div class="wide grow">${pItem('filtersAll', 0, t('depot.filterAll'))}</div>${anyF ? `<button type="button" data-act="setProp" data-p="filtersAll" data-v="0">${t('depot.clear')}</button>` : ''}</div>`;
    } else if (PR.STATION_SLOTS[id]) {
      h += `<h4>${t('st.products')}</h4>`;
      p.slots.forEach((s, i) => {
        h += `<div class="slotrow"><div class="wide">${pItem(`slots.${i}.item`, s.item, t('st.empty'))}</div>${s.item ? `<div class="slotcfg">
          <label>${p.interstellar ? t('st.local') : t('st.mode')} ${pSelect(`slots.${i}.local`, LOGIC(), s.local)}</label>
          ${p.interstellar ? `<label>${t('st.remote')} ${pSelect(`slots.${i}.remote`, LOGIC(), s.remote)}</label>` : ''}
          <label>${t('st.max')} ${pNum(`slots.${i}.max`, s.max, 'min="0" step="100"')}</label></div>` : ''}</div>`;
      });
      if (!multi) {
        const pb = portBelts(b), used = Object.keys(pb).map(Number).filter((k) => k < 12).sort((x, y) => x - y);
        const side = (slot) => { const pt = (BELT_PORTS[id] || []).find((q) => q[0] === slot); return pt ? SIDE_NAME(pt[3]) : ''; };
        if (used.length) {
          h += `<h4>${t('st.ports')}</h4>${used.map((k) => {
            const c = pb[k], label = `${t('st.port', { k })} <span class="muted small">${side(k)}</span>`;
            if (c.dir === 'in') return field(label, `<span class="muted">${t('st.in')} · <span class="link" data-goto="${c.belt}">${t('st.belt', { i: c.belt })}</span></span>`);
            return `<div class="portrow"><div class="row"><span>${label}</span><span class="link small" data-goto="${c.belt}">${t('st.belt', { i: c.belt })}</span></div>${portChoices(b, k)}</div>`;
          }).join('')}<p class="muted small">${t('st.portsNote')}</p>`;
        }
      }
      h += `<h4>${t('st.settings')}</h4>
        ${field(t('p.chargeMW'), pNum('chargeMW', p.chargeMW, 'step="1" min="0"'))}
        ${field(t('st.droneRange'), pNum('droneRange', p.droneRange, 'min="20" max="180" step="1"'))}
        ${field(t('st.droneMin'), pNum('droneMinLoad', p.droneMinLoad, 'min="1" max="100"'))}`;
      if (p.interstellar) {
        h += `${field(t('st.vesselRange'), `<div class="row">${pNum('vesselRangeLY', p.vesselRangeLY, 'min="1" step="1" style="width:70px"')}<span class="muted small">${p.vesselRangeLY >= 100 ? '∞' : '100 = ∞'}</span></div>`)}
        ${field(t('st.vesselMin'), pNum('vesselMinLoad', p.vesselMinLoad, 'min="1" max="100"'))}
        ${field(t('st.warp'), pNum('warpAU', p.warpAU, 'min="0.5" step="0.5"'))}
        ${pCheck('warpersRequired', p.warpersRequired, t('st.warpers'))}
        ${pCheck('orbitalCollector', p.orbitalCollector, t('st.collector'))}`;
      }
      h += `${field(t('st.stack'), `<div class="row">${pNum('outgoingCount', p.outgoingCount, 'min="0" max="4" style="width:60px"')}<span class="muted small">${t('st.stackNote')}</span></div>`)}
        ${pCheck('autoDrones', p.autoDrones, t('st.autoDrones'))}
        ${p.interstellar ? pCheck('autoVessels', p.autoVessels, t('st.autoVessels')) : ''}`;
    } else if (id === 2030) {
      const belt = monitorBelt(b);
      h += `<h4>Sandbox</h4>${pChips('mode', [['none', t('mon.measure')], ['generate', t('mon.generate')], ['consume', t('mon.consume')]], p.mode)}
        ${field(t('p.product'), pItem('item', p.item, p.mode === 'consume' ? t('mon.all') : t('mon.none')))}
        <p class="muted small">${p.mode === 'generate' ? (p.item ? t('mon.genNote') : t('mon.genPick'))
          : p.mode === 'consume' ? t('mon.conNote', { item: p.item }) : t('mon.measureNote')}</p>
        ${belt === null ? `<p class="bad-text small">${t('mon.noBelt')}</p>` : `<p class="muted small">${t('mon.onBelt', { i: belt })}</p>`}
        <h4>${t('mon.measureH')}</h4>
        ${field(t('mon.cycle'), pNum('cycle', p.cycle, 'min="0.1" step="1"'))}
        ${field(t('mon.target'), pNum('target', p.target, 'min="0" step="1"'))}`;
    } else if (id === 2020 && !multi) {
      const pb = portBelts(b), v = SPLIT[b.modelIndex];
      const ports = v ? v.ports : [[0, 'N', 0], [1, 'E', 0], [2, 'S', 0], [3, 'W', 0]];
      const conn = ports.filter(([slot]) => pb[slot]);
      h += `<h4>${t('split.prio')}</h4>`;
      if (!conn.length) h += `<p class="muted small">${t('split.noBelts')}</p>`;
      for (const [slot, sideK, lv] of conn) {
        const c = pb[slot];
        h += field(`${c.dir === 'in' ? t('split.in') : t('split.out')} ${SIDE_NAME(sideK)}${lv ? ' ↑' : ''}`,
          `<div class="row">${pCheck(`priority.${slot}`, p.priority[slot], t('split.prio'))}<span class="link small" data-goto="${c.belt}">#${c.belt}</span></div>`);
      }
      const prioOut = conn.some(([slot]) => pb[slot].dir === 'out' && p.priority[slot]);
      h += `<h4>${t('split.filter')}</h4>${pItem('filter', p.filter, t('depot.noFilter'))}
        <p class="muted small">${prioOut ? t('split.prioOut') : (p.filter ? t('split.needPrio') : t('split.filterNote'))}</p>`;
    }
    return h;
  }
  function propAction(t) {
    const path = t.dataset.p, b = [...S.sel][0];
    if (t.dataset.act === 'setProp') {
      const raw = t.dataset.v;
      applyProp(path, /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw);
    } else if (t.dataset.act === 'pickProp') {
      openItemPicker(t, +t.dataset.cur || 0, t.dataset.empty || I18N.t('pick.nothing'), (id) => applyProp(path, id));
    }
    return b;
  }
  // Prioridad del divisor: una sola entrada y una sola salida con prioridad
  function splitterPriority(b, slot, on) {
    const pb = portBelts(b), pr = PR.read(b).priority;
    const dir = pb[slot] && pb[slot].dir;
    for (let i = 0; i < 4; i++) if (on && i !== slot && pb[i] && pb[i].dir === dir) pr[i] = false;
    pr[slot] = on;
    return pr;
  }
  function propChange(t) {
    const path = t.dataset.p, b = [...S.sel][0];
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') { v = parseFloat(v); if (!Number.isFinite(v)) { renderInspector(); return; } }
    else if (t.tagName === 'SELECT' && /^-?\d+$/.test(v)) v = +v;
    if (b.itemId === 2020 && path.startsWith('priority.')) {
      pushUndo(); PR.write(b, { priority: splitterPriority(b, +path.split('.')[1], v) }); refresh(); return;
    }
    if (PR.STATION_SLOTS[b.itemId] && path.startsWith('ports.')) {
      const k = +path.split('.')[1], c = portBelts(b)[k];
      pushUndo(); PR.write(b, { ports: Object.assign([], { [k]: { dir: c && c.dir === 'in' ? 2 : 1, storage: v } }) }); refresh(); return;
    }
    applyProp(path, v);
  }

  // ------------------------------------------------------------------ objetos (filtros, iconos de cinta)
  // Lista de objetos con dibujo: el producto de cada receta usa el icono de su receta
  const ITEM_LIST = (() => {
    const m = new Map();
    // name: en el idioma actual (si el objeto no tiene nombre propio, el de su receta)
    const entry = (id, fallback, en) => ({ id, en, icon: null, get name() { const n = IT.itemName(id); return n.startsWith('#') ? fallback() : n; } });
    for (const r of Object.values(IT.RECIPE_INFO).sort((a, b) => a.id - b.id)) {
      if (!r.product || m.has(r.product)) continue;
      m.set(r.product, Object.assign(entry(r.product, () => r.name, r.en || ''), { icon: r.icon || null }));
    }
    for (const [id, n] of Object.entries(IT.MATERIALS)) if (!m.has(+id)) m.set(+id, entry(+id, () => n, ''));
    for (const [id, en] of Object.entries(IT.ITEM_EN)) if (!m.has(+id) && !IT.BUILDINGS[id]) m.set(+id, entry(+id, () => en, en));
    // el icono propio del objeto (icons/items) manda sobre el de su receta
    for (const it of m.values()) { const ic = IT.itemIcon(it.id); if (ic) { it.icon = ic; it.en = it.en || IT.ITEM_EN[it.id]; } }
    return [...m.values()].sort((a, b) => a.id - b.id);
  })();
  // Imagen del icono de un objeto para dibujar en el lienzo (null mientras carga o si no hay)
  const ITEM_IMG = {};
  function itemImg(id) {
    const it = ITEM_BY_ID.get(id), src = (it && it.icon) || IT.itemIcon(id);
    if (!src) return null;
    if (!ITEM_IMG[id]) { const im = new Image(); im.onload = requestDraw; im.src = src; ITEM_IMG[id] = im; }
    return ITEM_IMG[id].complete && ITEM_IMG[id].naturalWidth ? ITEM_IMG[id] : null;
  }
  // Icono de objeto pequeño sobre un círculo oscuro, centrado en (x, y) con lado k
  function drawItemBadge(id, x, y, k) {
    const img = itemImg(id);
    ctx.fillStyle = 'rgba(10,12,18,.8)';
    ctx.beginPath(); ctx.arc(x, y, k * 0.62, 0, Math.PI * 2); ctx.fill();
    if (img) ctx.drawImage(img, x - k / 2, y - k / 2, k, k);
    else { ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.max(7, k * 0.4)}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initials(IT.itemName(id).replace(/^#/, '')), x, y); }
  }
  const ITEM_BY_ID = new Map(ITEM_LIST.map((i) => [i.id, i]));
  function itemIcon(id, size) {
    const it = ITEM_BY_ID.get(id);
    if (it && it.icon) return `<img class="ricon" src="${it.icon}" width="${size}" height="${size}" alt="">`;
    const txt = !id ? '—' : initials(IT.itemName(id).replace(/^#/, '') || String(id));
    return `<span class="ricon badge g-x" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(txt)}</span>`;
  }
  function openItemPicker(btn, current, emptyLabel, onPick) {
    const grid = window.DSPItemGrid || {};
    openGridPicker({
      title: t('pick.titleItem'), search: t('pick.searchItem'), none: emptyLabel, onPick,
      entries: ITEM_LIST.map((i) => ({
        key: i.id, grid: grid[i.id] || null, cur: i.id === current, html: itemIcon(i.id, 40),
        title: `${i.name}${i.en && i.en !== i.name ? ' / ' + i.en : ''} (${i.id})`,
      })),
    });
  }

  // ------------------------------------------------------------------ ventana de cuadrícula (como en el juego)
  // Pestañas Objetos / Edificios, filas I–VIII y 14 columnas: cada entrada va en su sitio del juego
  // (grid: [página, fila, columna], de js/recipes.js). Lo que no tiene sitio sale debajo, en "Otros".
  // o: { title, search, none, entries: [{ key, grid, html, title, cur }], footer, onPick(key) }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  function openGridPicker(o) {
    closeRecipePicker();
    const pages = { 1: [], 2: [] }, extra = [];
    for (const e of o.entries) (e.grid && pages[e.grid[0]] ? pages[e.grid[0]] : extra).push(e);
    const cur = o.entries.find((e) => e.cur);
    let page = cur && cur.grid && pages[cur.grid[0]] ? cur.grid[0] : pages[1].length ? 1 : 2;
    const cell = (e, pos) => `<button type="button" class="gcell${e.cur ? ' cur' : ''}" data-k="${e.key}" data-s="${esc(e.title.toLowerCase())}" title="${esc(e.title)}"${pos ? ` style="grid-row:${e.grid[1]};grid-column:${e.grid[2] + 1}"` : ''}>${e.html}</button>`;
    const sheet = (p) => {
      let h = '';
      for (let r = 1; r <= 8; r++) {
        h += `<div class="glabel" style="grid-row:${r};grid-column:1">${ROMAN[r - 1]}</div>`;
        for (let c = 1; c <= 14; c++) h += `<div class="gslot" style="grid-row:${r};grid-column:${c + 1}"></div>`;
      }
      return `<div class="gsheet" data-page="${p}"${p === page ? '' : ' hidden'}>${h}${pages[p].map((e) => cell(e, true)).join('')}</div>`;
    };
    const tab = (p, icon, label) => `<button type="button" class="gtab${p === page ? ' on' : ''}" data-page="${p}"${pages[p].length ? '' : ' disabled'}><span>${icon}</span><span>${esc(label)}</span></button>`;
    const pop = document.createElement('div');
    pop.id = 'recipePop';
    pop.className = 'gpick';
    pop.innerHTML = `<div class="ghead">
        ${tab(1, '⚙', t('pick.items'))}${tab(2, '🏭', t('pick.buildings'))}
        <div class="gtitle">${esc(o.title || '')}</div>
        <input type="search" class="gsearch" placeholder="${esc(o.search || '')}">
        <button type="button" class="gnone${cur ? '' : ' cur'}" data-k="0">${esc(o.none)}</button>
        <button type="button" class="gclose" title="Esc">✕</button>
      </div>
      ${sheet(1)}${sheet(2)}
      ${extra.length ? `<div class="gextra"><span class="muted small">${esc(t('pick.other'))}</span><div>${extra.map((e) => cell(e, false)).join('')}</div></div>` : ''}
      <div class="gfoot"><span class="gname"></span>${o.footer || ''}</div>`;
    document.body.appendChild(pop);
    const showPage = (p) => {
      page = p;
      pop.querySelectorAll('.gtab').forEach((x) => x.classList.toggle('on', +x.dataset.page === p));
      pop.querySelectorAll('.gsheet').forEach((x) => { x.hidden = +x.dataset.page !== p; });
    };
    const search = pop.querySelector('.gsearch');
    const matches = () => [...pop.querySelectorAll('.gcell:not(.dim)')];
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      pop.querySelectorAll('.gcell').forEach((x) => x.classList.toggle('dim', !!q && !x.dataset.s.includes(q) && x.dataset.k !== q));
      // si en la pestaña actual no hay nada y en la otra sí, se cambia
      if (q && !pop.querySelector(`.gsheet[data-page="${page}"] .gcell:not(.dim)`)) {
        const other = pop.querySelector('.gsheet .gcell:not(.dim)');
        if (other) showPage(+other.closest('.gsheet').dataset.page);
      }
      const m = matches();
      pop.querySelector('.gname').textContent = q ? (m.length === 1 ? m[0].title : t('pick.found', { n: m.length })) : '';
    });
    const pick = (k) => { closeRecipePicker(); o.onPick(k); };
    pop.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeRecipePicker(); }
      else if (ev.key === 'Enter' && ev.target === search) {
        // Intro: la primera coincidencia de la pestaña visible (o de cualquiera)
        const m = pop.querySelector(`.gsheet[data-page="${page}"] .gcell:not(.dim)`) || matches()[0];
        if (m && search.value.trim()) { ev.preventDefault(); pick(+m.dataset.k); }
      }
    });
    pop.addEventListener('mouseover', (ev) => {
      const c = ev.target.closest('.gcell'); if (c) pop.querySelector('.gname').textContent = c.title;
    });
    pop.addEventListener('click', (ev) => {
      const tb = ev.target.closest('.gtab'); if (tb) { showPage(+tb.dataset.page); return; }
      if (ev.target.closest('.gclose')) { closeRecipePicker(); return; }
      const c = ev.target.closest('[data-k]'); if (c) pick(+c.dataset.k);
    });
    search.focus();
    return pop;
  }
  // Cambiar el tipo (Mk.I/II/III…) de cintas o clasificadores de la selección
  function setTier(id) {
    const tpl = S.templates[id]; if (!tpl) return;
    const fam = BP.BELTS.has(id) ? isBelt : isSorter;
    const list = [...S.sel].filter(fam);
    if (!list.length) return;
    pushUndo();
    for (const b of list) { b.itemId = id; b.modelIndex = tpl.modelIndex; }
    refresh();
  }
  function inspectorAction(t) {
    const act = t.dataset.act, b = [...S.sel][0];
    if (act === 'setProp' || act === 'pickProp') { propAction(t); return; }
    if (act === 'portOut') { setPortOut(S.bp.buildings[+t.dataset.st], +t.dataset.k, +t.dataset.v); return; }
    if (act === 'tier') setTier(+t.dataset.id);
    else if (act === 'lineSel') { S.sel = beltLine(b, true); refresh(); }
    else if (act === 'split') { pushUndo(); for (const x of S.sel) if (x.itemId === 2020) x.modelIndex = +t.dataset.id; refresh(); }
    else if (act === 'selSorters') { S.sel = attachedSorters(new Set([b])); refresh(); }
    else if (act === 'copyWith') { copySelection(false, true); startPaste(); }
    else if (act === 'pickFilter') {
      const cur = [...S.sel].filter(isSorter)[0];
      openItemPicker(t, cur ? cur.filterId : 0, I18N.t('sorter.noFilter'), (id) => {
        pushUndo(); for (const x of S.sel) if (isSorter(x)) x.filterId = id; refresh();
      });
    } else if (act === 'pickLabel') {
      openItemPicker(t, b.parameters[0] || 0, I18N.t('belt.noLabel'), (id) => {
        pushUndo(); for (const x of S.sel) if (isBelt(x)) x.parameters = id ? [id, 0] : []; refresh();
      });
    }
  }

  // ------------------------------------------------------------------ selector de recetas
  // Dibujos: icons/recipes/ID.webp (de la wiki, tools/gen_recipes.py). Sin dibujo, insignia con iniciales.
  const ICONS = {};
  for (const r of Object.values(IT.RECIPE_INFO)) if (r.icon) ICONS[r.id] = r.icon;
  const ICON_IMG = {};
  function iconImg(id) {
    if (!ICONS[id]) return null;
    if (!ICON_IMG[id]) { const im = new Image(); im.onload = requestDraw; im.src = ICONS[id]; ICON_IMG[id] = im; }
    return ICON_IMG[id].complete && ICON_IMG[id].naturalWidth ? ICON_IMG[id] : null;
  }
  function initials(name) {
    const w = name.replace(/\(.*\)/, '').split(/\s+/).filter((x) => x && !/^(de|del|la|el|y|por|of|the|and)$/i.test(x));
    const mk = name.match(/Mk\.(I+)/);
    if (mk) return w[0][0].toUpperCase() + mk[1].length;
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  }
  function recipeIcon(id, size) {
    if (ICONS[id]) return `<img class="ricon" src="${ICONS[id]}" width="${size}" height="${size}" alt="">`;
    const info = IT.RECIPE_INFO[id];
    const txt = !id ? '—' : info && info.known ? initials(info.name) : '#' + id;
    return `<span class="ricon badge g-${info ? info.group : 'x'}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * (txt.length > 3 ? 0.3 : 0.38))}px">${esc(txt)}</span>`;
  }
  function recipeButton(current) {
    const label = current === null ? t('recipe.mixed') : current ? (IT.RECIPE_INFO[current] || { name: t('recipe.n', { id: current }) }).name : t('recipe.none');
    return `<button type="button" class="rbtn" id="recipeBtn">${recipeIcon(current || 0, 28)}<span>${esc(label)}</span><span class="muted">▾</span></button>`;
  }
  // Recetas posibles para la selección (unión de los grupos de sus edificios)
  function recipeChoices() {
    const seen = new Set(), out = [];
    for (const b of S.sel) for (const r of IT.recipesFor(b.itemId)) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    return out;
  }
  function openRecipePicker(btn) {
    const list = recipeChoices();
    const cur = [...S.sel].find((b) => b.recipeId)?.recipeId;
    const kinds = [...new Set([...S.sel].filter((b) => IT.RECIPE_GROUP[b.itemId]).map((b) => IT.itemName(b.itemId)))];
    const pop = openGridPicker({
      title: kinds.join(', '), search: t('pick.searchRecipe'), none: t('recipe.none'), onPick: applyRecipe,
      entries: list.map((r) => ({
        key: r.id, grid: r.grid, cur: r.id === cur, html: recipeIcon(r.id, 40),
        title: `${r.name}${r.en && r.en !== r.name ? ' / ' + r.en : ''} (#${r.id})`,
      })),
      footer: `<label class="small muted">${t('recipe.other')}</label><input type="number" class="gother" min="0" style="width:80px">`,
    });
    pop.querySelector('.gother').addEventListener('change', (ev) => {
      const v = parseInt(ev.target.value, 10); if (Number.isFinite(v) && v >= 0) applyRecipe(v);
    });
  }
  function closeRecipePicker() { const p = $('recipePop'); if (p) p.remove(); }
  function applyRecipe(id) {
    closeRecipePicker();
    const group = IT.RECIPE_INFO[id] && IT.RECIPE_INFO[id].group;
    const targets = [...S.sel].filter((b) => {
      const g = IT.RECIPE_GROUP[b.itemId];
      return g ? (!id || !group || g === group) : PRODUCTION.has(IT.buildingInfo(b.itemId).cat);
    });
    if (!targets.length) { toast(t('recipe.bad'), true); return; }
    pushUndo();
    for (const b of targets) b.recipeId = id;
    refresh();
    if (targets.length < S.sel.size && S.sel.size > 1) toast(t('recipe.applied', { n: targets.length }));
  }
  document.addEventListener('mousedown', (ev) => {
    const p = $('recipePop');
    if (p && !p.contains(ev.target) && !ev.target.closest('#recipeBtn') && !ev.target.closest('.pick-btn')) closeRecipePicker();
  });

  // Delegación de eventos del inspector
  const insp = $('inspector');
  insp.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]') && !ev.target.closest('#recipePop') ? ev.target.closest('[data-act]') : ev.target;
    if (t.dataset.act) { inspectorAction(t); return; }
    if (t.dataset.selitem) { S.sel = new Set(S.bp.buildings.filter((b) => b.itemId === +t.dataset.selitem)); refresh(); }
    else if (t.dataset.keepitem || t.closest('[data-keepitem]')) {
      const id = +(t.dataset.keepitem || t.closest('[data-keepitem]').dataset.keepitem);
      S.sel = new Set([...S.sel].filter((b) => b.itemId === id)); refresh();
    } else if (t.dataset.goto) {
      const b = S.bp.buildings[+t.dataset.goto];
      if (b) { S.sel = new Set([b]); S.view.cx = b.x; S.view.cy = b.y; refresh(); }
    } else if (t.id === 'btnDelOne' || t.id === 'btnDelSel') deleteSelection();
    else if (t.closest('#recipeBtn')) { if ($('recipePop')) closeRecipePicker(); else openRecipePicker(t.closest('#recipeBtn')); }
    else if (t.id === 'btnRotSel') rotateSelection();
    else if (t.id === 'btnCopySel') copySelection(false);
    else if (t.id === 'btnSelSame') {
      const b = [...S.sel][0];
      S.sel = new Set(S.bp.buildings.filter((x) => x.itemId === b.itemId && x.recipeId === b.recipeId)); refresh();
    } else if (t.id === 'btnApplyParams') {
      const b = [...S.sel][0];
      const vals = $('params').value.split(/[\s,;]+/).filter((v) => v !== '').map((v) => parseInt(v, 10));
      if (vals.some((v) => !Number.isFinite(v))) { toast(I18N.t('params.bad'), true); return; }
      pushUndo(); b.parameters = vals; refresh(); toast(I18N.t('params.ok'));
    }
  });

  insp.addEventListener('change', (ev) => {
    const t = ev.target;
    const h = S.bp.header;
    if (t.id === 'hName') { pushUndo(); h.shortDesc = t.value; setDirty(true); return; }
    if (t.id === 'hDesc') { pushUndo(); h.desc = t.value; return; }
    if (t.id === 'hLayout') { pushUndo(); h.layout = parseInt(t.value, 10) || 10; return; }
    if (t.dataset.icon !== undefined) { pushUndo(); h.icons[+t.dataset.icon] = parseInt(t.value, 10) || 0; renderInspector(); return; }
    if (t.dataset.p) { propChange(t); return; }
    if (t.id === 'fillDepots') { S.fillDepots = t.checked; try { localStorage.setItem('dspFillDepots', t.checked ? '1' : '0'); } catch (e) { /* sin almacenamiento */ } refresh(); return; }
    if (t.id === 'openEnds') { S.openEnds = t.checked; try { localStorage.setItem('dspOpenEnds', t.checked ? '1' : '0'); } catch (e) { /* sin almacenamiento */ } refresh(); return; }
    if (t.dataset.f) {
      const b = [...S.sel][0], f = t.dataset.f, v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      pushUndo();
      if (f === 'x' || f === 'y' || f === 'z') { const d = v - b[f]; b[f] = v; b[f + '2'] += d; }
      else if (f === 'yaw') { const d = v - b.yaw; b.yaw = normYaw(v); b.yaw2 = normYaw(b.yaw2 + d); }
      else b[f] = Math.round(v);
      refresh(); return;
    }
    if (t.id === 'beltLabel') {
      const b = [...S.sel][0], v = parseInt(t.value, 10) || 0;
      pushUndo(); b.parameters = v ? [v, 0] : []; refresh(); return;
    }
    if (t.id === 'slots') {
      const b = [...S.sel][0], v = t.value.split(/[\s,;]+/).map((x) => parseInt(x, 10));
      if (v.length !== 6 || v.some((x) => !Number.isFinite(x))) { toast(I18N.t('slots.bad'), true); return; }
      pushUndo();
      [b.outputToSlot, b.inputFromSlot, b.outputFromSlot, b.inputToSlot, b.outputOffset, b.inputOffset] = v;
      refresh(); return;
    }
    if (t.id === 'splitModel') {
      pushUndo(); for (const b of S.sel) if (b.itemId === 2020) b.modelIndex = +t.value;
      refresh(); return;
    }
    if (t.id === 'beltTier' && t.value) {
      const id = +t.value, tpl = S.templates[id];
      pushUndo();
      for (const b of S.sel) if (isBelt(b)) { b.itemId = id; b.modelIndex = tpl.modelIndex; }
      refresh();
    }
  });

  // ------------------------------------------------------------------ botones superiores
  $('btnNew').onclick = newBlueprint;
  $('btnOpenFile').onclick = openFile;
  $('btnOpenDir').onclick = openDir;
  $('btnPaste').onclick = () => { $('pasteText').value = ''; $('dlgPaste').showModal(); $('pasteText').focus(); };
  $('dlgPaste').addEventListener('close', async () => {
    if ($('dlgPaste').returnValue !== 'ok') return;
    const text = $('pasteText').value.trim(); if (!text) return;
    if (S.dirty && !confirm(t('confirm.discard'))) return;
    await loadText(text, '', null);
  });
  $('btnCopy').onclick = copyCode;
  $('btnSave').onclick = save;
  $('btnSaveAs').onclick = saveAs;
  $('btnDownload').onclick = download;
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnRotate').onclick = rotateSelection;
  $('btnDup').onclick = () => { copySelection(false); startPaste(); };
  $('btnDelete').onclick = deleteSelection;
  $('btnFit').onclick = fitView;
  $('btnCleanSorters').onclick = cleanSorters;
  $('levelSel').onchange = (e) => { setLevel(e.target.value === 'all' ? 'all' : +e.target.value); e.target.blur(); };
  $('chkLabels').onchange = (e) => { S.showLabels = e.target.checked; requestDraw(); };
  $('chkChecks').checked = S.showChecks;
  $('chkChecks').onchange = (e) => {
    S.showChecks = e.target.checked;
    try { localStorage.setItem('dspShowChecks', e.target.checked ? '1' : '0'); } catch (err) { /* sin almacenamiento */ }
    requestDraw();
  };

  $('fileInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    if (S.dirty && !confirm(t('confirm.discard'))) { ev.target.value = ''; return; }
    await loadText(await f.text(), f.name, null);
    ev.target.value = '';
  });
  $('dirInput').addEventListener('change', (ev) => {
    const files = [...ev.target.files].filter((f) => /\.txt$/i.test(f.name));
    S.dirHandle = null;
    S.library = files.map((f) => ({ path: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, file: f }))
      .sort((a, b) => a.path.localeCompare(b.path));
    $('libPath').textContent = t('lib.readonly');
    renderLibrary(); learnFromLibrary();
  });

  // arrastrar y soltar
  const wrap = $('canvasWrap');
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); $('dropHint').classList.remove('hidden'); });
  wrap.addEventListener('dragleave', () => $('dropHint').classList.add('hidden'));
  wrap.addEventListener('drop', async (e) => {
    e.preventDefault(); $('dropHint').classList.add('hidden');
    const f = e.dataTransfer.files[0];
    if (f) { await loadText(await f.text(), f.name, null); return; }
    const text = e.dataTransfer.getData('text');
    if (text) await loadText(text, '', null);
  });

  // pegar código directamente con Ctrl+V si el portapapeles contiene un blueprint
  window.addEventListener('paste', async (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (text.trim().startsWith('BLUEPRINT:')) {
      e.preventDefault();
      if (S.dirty && !confirm(t('confirm.discardPaste'))) return;
      if (S.tool === 'paste') setTool('select');
      await loadText(text, '', null);
    }
  });

  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ------------------------------------------------------------------ API para IA y scripts: window.DSP
  // Documentada en API.md. Usa la misma lógica que el editor (choques, puertos, apilado, deshacer).
  // Las operaciones que cambian algo devuelven { ok: true, ... } o { ok: false, error } y no lanzan excepciones.
  // Los edificios se identifican por su índice (i); los índices cambian al borrar.
  const DSP = (() => {
    const bsx = () => S.bp.buildings;
    const get = (i) => { const b = bsx()[i]; if (!b) throw new Error(`Building ${i} does not exist`); return b; };
    const arr = (v) => (Array.isArray(v) ? v : [v]);
    const kind = (b) => (isBelt(b) ? 'belt' : isSorter(b) ? 'sorter' : 'building');
    function describe(b) {
      const i = bsx().indexOf(b), info = IT.buildingInfo(b.itemId);
      const d = { i, itemId: b.itemId, name: info.en || info.name, kind: kind(b), x: r2(b.x), y: r2(b.y), z: r2(b.z), yaw: r2(b.yaw) };
      if (isBelt(b)) Object.assign(d, { level: levelOf(b), next: b.outputObjIdx, label: b.parameters[0] || 0 });
      else if (isSorter(b)) Object.assign(d, { x2: r2(b.x2), y2: r2(b.y2), from: b.inputObjIdx, fromSlot: b.inputFromSlot, to: b.outputObjIdx, toSlot: b.outputToSlot, filter: b.filterId, length: b.parameters[0] || 1 });
      else {
        if (IT.RECIPE_GROUP[b.itemId] || b.recipeId) Object.assign(d, { recipe: b.recipeId, recipeName: b.recipeId ? IT.recipeName(b.recipeId) : null });
        if (b.itemId === 2020) d.model = b.modelIndex;
        if (b.inputObjIdx >= 0 && !isBelt(bsx()[b.inputObjIdx] || {})) d.stackedOn = b.inputObjIdx;
      }
      return d;
    }
    // Ejecuta una operación que cambia el blueprint. Sabe si ha funcionado porque deja una entrada para deshacer
    // (si choca, el editor la deshace y la quita).
    function act(fn) {
      try {
        if (!S.bp) newBlueprint();
        const u0 = S.undo.length; S.lastMsg = null;
        const extra = fn() || {};
        if (extra.error) return { ok: false, error: extra.error };
        if (S.undo.length <= u0) return { ok: false, error: (S.lastMsg && S.lastMsg.msg) || 'Nothing changed' };
        return { ok: true, ...extra };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    function withTool(item, level, fn) {
      const old = { placeItem: S.placeItem, level: S.level, flip: S.beltFlip };
      S.placeItem = item; if (level !== undefined) S.level = level; S.beltFlip = false;
      try { return fn(); } finally { S.placeItem = old.placeItem; S.level = old.level; S.beltFlip = old.flip; }
    }
    const newIdx = (n0) => bsx().slice(n0).map((b) => bsx().indexOf(b));
    function anchor(spec) {
      if (Array.isArray(spec)) { const a = findAnchor(spec[0], spec[1]); if (!a) throw new Error(`Nothing to attach to at ${spec}`); return a; }
      if (spec.belt !== undefined) { const b = get(spec.belt); if (!isBelt(b)) throw new Error(`${spec.belt} is not a belt`); return { kind: 'belt', b, pos: [b.x, b.y] }; }
      if (spec.building !== undefined) {
        const b = get(spec.building), sl = slotsOf(b).find((s) => s.slot === spec.slot);
        if (!sl) throw new Error(`Building ${spec.building} has no slot ${spec.slot} (slots: ${slotsOf(b).map((s) => s.slot).join(', ') || 'none'})`);
        return { kind: 'slot', b, slot: sl.slot, pos: sl.pos };
      }
      throw new Error('From/to: [x, y], { belt: i } or { building: i, slot: n }');
    }

    const api = {
      version: 1,
      help() {
        return `DSP Blueprint Designer API (window.DSP) — see API.md
Query:  info() · list({kind,itemId,near:[x,y,r],recipe}) · get(i) · catalog(text) · recipes(itemId) · slots(i) · ports(i) · props(i) · balance([indices]) · checks() · simulate({openEnds,fillDepots}) · collisions()
File:   load(text) (async) · export() (async) · newBlueprint(name) · setInfo({name,desc})
Build:  place(itemId,x,y,{yaw,recipe,model}) · belt([[x,y],...],{tier,level}) · sorter(from,to,{tier,filter})
        duplicate(indices,dx,dy)
Change: setRecipe(indices,id) · setFilter(indices,itemId) · setTier(indices,itemId) · setModel(i,model) · setLabel(indices,itemId)
        setProps(indices,{...}) (stations, depots, distributor, ray receiver, splitter)
        move(indices,dx,dy) · rotate(indices,times) · remove(indices) · removeBeltLine(i) · clean()
Editor: select(indices) · selection() · undo() · redo() · fit() · setLang('en'|'es')`;
      },
      info() {
        if (!S.bp) return null;
        const h = S.bp.header, bs = bsx();
        return { name: h.shortDesc, desc: h.desc, buildings: bs.length, belts: bs.filter(isBelt).length, sorters: bs.filter(isSorter).length,
          collisions: (S.hits || []).length, hashOk: S.bp.hashOk, dirty: S.dirty, level: S.level };
      },
      newBlueprint(name) {
        const c = window.confirm; window.confirm = () => true;
        try { newBlueprint(); } finally { window.confirm = c; }
        if (name) { S.bp.header.shortDesc = name; setDirty(false); }
        return { ok: true };
      },
      async load(text, name) { return { ok: !!(await loadText(String(text).trim(), name || '', null)) }; },
      async export() { return S.bp ? exportString() : null; },
      setInfo({ name, desc } = {}) {
        return act(() => { pushUndo(); if (name !== undefined) S.bp.header.shortDesc = name; if (desc !== undefined) S.bp.header.desc = desc; setDirty(true); refresh(); });
      },
      list(f = {}) {
        if (!S.bp) return [];
        return bsx().filter((b) => (!f.kind || kind(b) === f.kind) && (!f.itemId || arr(f.itemId).includes(b.itemId)) &&
          (f.recipe === undefined || b.recipeId === f.recipe) &&
          (!f.near || Math.hypot(b.x - f.near[0], b.y - f.near[1]) <= (f.near[2] || 3))).map(describe);
      },
      get(i) {
        const b = get(i), p = PR.read(b), m = RT.machine(b), w = RT.power(b);
        return { ...describe(b), ...(p ? { props: p } : {}), ...(m ? { rates: m } : {}), ...(w ? { power: w } : {}), raw: JSON.parse(JSON.stringify(b)) };
      },
      balance(indices) { return S.bp ? RT.totals(indices === undefined ? bsx() : arr(indices).map(get)) : null; },
      simulate(opts) {
        if (!S.bp) return null;
        const r = SM.run(bsx(), opts || { openEnds: S.openEnds, fillDepots: S.fillDepots }), obj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, v]));
        return { machines: obj(r.machines), belts: obj(r.belts), sorters: obj(r.sorters), sources: obj(r.sources), sinks: obj(r.sinks), jams: r.jams, iterations: r.iterations, converged: r.converged };
      },
      checks() {
        if (!S.bp) return null;
        const f = FL.analyze(bsx()), set = (m, i) => [...(m.get(i) || [])];
        return { issues: f.issues, carries: (i) => set(f.items, i), supplied: (i) => set(f.supplied, i) };
      },
      props(i) { return PR.read(get(i)); },
      setProps(indices, changes) {
        return act(() => {
          const l = arr(indices).map(get).filter((b) => PR.read(b));
          if (!l.length) return { error: 'None of those buildings has editable properties' };
          pushUndo(); l.forEach((b) => PR.write(b, changes || {})); refresh();
          return { props: l.map((b) => PR.read(b)) };
        });
      },
      catalog(q) {
        const s = (q || '').toLowerCase();
        return Object.values(IT.BUILDINGS).filter((b) => !s || b.en.toLowerCase().includes(s) || b.name.toLowerCase().includes(s) || String(b.id) === s)
          .map((b) => ({ itemId: b.id, name: b.en, nameEs: b.es, canPlace: !!S.templates[b.id], recipes: !!IT.RECIPE_GROUP[b.id] }));
      },
      recipes(itemId) { return IT.recipesFor(itemId).map((r) => ({ id: r.id, name: r.en || r.es, nameEs: r.es || r.en, product: r.product || null })); },
      slots(i) {
        const b = get(i), used = usedSlots(b);
        return slotsOf(b).map((s) => ({ slot: s.slot, x: r2(s.pos[0]), y: r2(s.pos[1]), used: used.has(s.slot) }));
      },
      ports(i) { return beltPorts(get(i)).map((p) => ({ slot: p.slot, x: r2(p.pos[0]), y: r2(p.pos[1]), dir: p.dir, level: p.level })); },
      collisions() { return (S.hits || []).map(([a, b]) => ({ a: bsx().indexOf(a), b: bsx().indexOf(b), aName: IT.buildingInfo(a.itemId).en, bName: IT.buildingInfo(b.itemId).en })); },

      place(itemId, x, y, o = {}) {
        return act(() => {
          if (!S.templates[itemId]) return { error: `No model for ${itemId} (catalog() says which ones can be placed)` };
          if (isBeltId(itemId)) return { error: 'Use belt() for belts' };
          if (BP.SORTERS.has(itemId)) return { error: 'Use sorter() for sorters' };
          const b = makeBuilding(itemId, x, y, o.yaw || 0);
          if (itemId === 2020) b.modelIndex = o.model || S.splitModel;
          if (o.recipe !== undefined) b.recipeId = o.recipe;
          pushUndo();
          applyStack(b);
          b.index = bsx().length; bsx().push(b);
          S.sel = new Set([b]);
          refresh();
          return { i: bsx().indexOf(b) };
        });
      },
      belt(points, o = {}) {
        return act(() => {
          const pts = points.map((p) => [Math.round(p[0]), Math.round(p[1])]);
          if (pts.length < 1) return { error: 'Points are needed' };
          let cells = [pts[0]];
          for (let k = 1; k < pts.length; k++) cells = cells.concat(beltPath(pts[k - 1], pts[k]).slice(1));
          const n0 = bsx().length;
          withTool(o.tier || 2001, o.level || 0, () => createBeltLine(cells));
          return { created: newIdx(n0) };
        });
      },
      sorter(from, to, o = {}) {
        return act(() => {
          const a = anchor(from), c = anchor(to), n0 = bsx().length;
          withTool(o.tier || 2011, undefined, () => createSorter(a, c));
          const s = bsx()[n0];
          if (s && o.filter) s.filterId = o.filter;
          return s ? { i: n0 } : {};
        });
      },
      duplicate(indices, dx, dy) {
        return act(() => {
          S.sel = new Set(arr(indices).map(get));
          copySelection(false, true);
          const main = [...S.sel].filter((b) => !isSorter(b));
          const [cx, cy] = centroid(main.length ? main : [...S.sel]);
          const n0 = bsx().length;
          placeRow([cx + dx, cy + dy], [cx + dx, cy + dy]);
          return { created: newIdx(n0) };
        });
      },
      setRecipe(indices, id) { return act(() => { S.sel = new Set(arr(indices).map(get)); applyRecipe(id); }); },
      setFilter(indices, itemId) {
        return act(() => { const l = arr(indices).map(get).filter(isSorter); if (!l.length) return { error: 'No sorter' }; pushUndo(); l.forEach((b) => { b.filterId = itemId || 0; }); refresh(); });
      },
      setTier(indices, itemId) { return act(() => { S.sel = new Set(arr(indices).map(get)); setTier(itemId); }); },
      setModel(i, model) {
        return act(() => { const b = get(i); if (b.itemId === 2020 && !SPLIT[model]) return { error: `Splitter models: ${Object.keys(SPLIT).join(', ')}` }; pushUndo(); b.modelIndex = model; refresh(); });
      },
      setLabel(indices, itemId) {
        return act(() => { const l = arr(indices).map(get).filter(isBelt); if (!l.length) return { error: 'No belt' }; pushUndo(); l.forEach((b) => { b.parameters = itemId ? [itemId, 0] : []; }); refresh(); });
      },
      move(indices, dx, dy) { return act(() => { S.sel = new Set(arr(indices).map(get)); pushUndo(); moveSelection(Math.round(dx), Math.round(dy)); refresh(); }); },
      rotate(indices, times = 1) {
        return act(() => {
          const list = arr(indices).map(get); pushUndo();
          const [cx, cy] = centroid(list.filter((b) => !isSorter(b)).length ? list.filter((b) => !isSorter(b)) : list);
          list.forEach((b) => rotateBuilding(b, cx, cy, ((times % 4) + 4) % 4));
          S.sel = new Set(list); refresh();
        });
      },
      remove(indices) { return act(() => { const set = new Set(arr(indices).map(get)); pushUndo(); removeBuildings(set); S.sel.clear(); refresh(); return { removed: set.size }; }); },
      removeBeltLine(i) { return act(() => { const b = get(i); if (!isBelt(b)) return { error: `${i} is not a belt` }; const set = beltLine(b, true); pushUndo(); removeBuildings(set); S.sel.clear(); refresh(); return { removed: set.size }; }); },
      clean() { return act(() => { cleanSorters(); }); },
      select(indices) { S.sel = new Set(arr(indices).map(get)); refresh(); return { ok: true }; },
      selection() { return [...S.sel].map((b) => bsx().indexOf(b)); },
      undo() { undo(); return { ok: true }; },
      redo() { redo(); return { ok: true }; },
      fit() { fitView(); return { ok: true }; },
      setLang(l) { I18N.setLang(l); return { ok: I18N.lang === l, lang: I18N.lang }; },
    };
    return api;
  })();
  const isBeltId = (id) => BP.BELTS.has(id);
  window.DSP = DSP;

  // ------------------------------------------------------------------ idioma (js/i18n.js)
  $('langSel').value = I18N.lang;
  $('langSel').onchange = (e) => { I18N.setLang(e.target.value); e.target.blur(); };
  I18N.onChange((l) => {
    $('langSel').value = l;
    closeRecipePicker(); closePortChooser();
    if (S.library.length) renderLibrary(); else if (S.dirHandle) $('library').innerHTML = `<p class="muted small">${esc(t('lib.empty'))}</p>`;
    if (S.library.length && !S.dirHandle) $('libPath').textContent = t('lib.readonly');
    setDirty(S.dirty);
    setTool(S.tool, S.placeItem);   // texto de ayuda y paleta
    refresh();                      // inspector, avisos, barra de estado
  });
  I18N.apply(document);

  // ------------------------------------------------------------------ inicio
  loadTemplates();
  renderPalette();
  setTool('select');
  resize();
  refresh();
  window.__dspbp = S; // para depuración
})();
