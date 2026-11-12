/* Catálogo de objetos/edificios de DSP (nombres en español, tamaños aproximados para dibujar). */
(function (root) {
  'use strict';

  // Categorías de edificios y su color en el lienzo
  const CATS = {
    belt: { name: 'Cintas', color: '#c9b24a' },
    sorter: { name: 'Clasificadores', color: '#7fb3ff' },
    logistics: { name: 'Logística', color: '#4fa3a5' },
    storage: { name: 'Almacenamiento', color: '#8a7a5c' },
    power: { name: 'Energía', color: '#6aa84f' },
    mining: { name: 'Extracción', color: '#a0703c' },
    smelt: { name: 'Fundición', color: '#d9773a' },
    assembly: { name: 'Ensamblaje', color: '#6f7fd9' },
    chem: { name: 'Química', color: '#b05fb0' },
    research: { name: 'Investigación', color: '#3fbfbf' },
    space: { name: 'Espacio', color: '#9a9ab0' },
    defense: { name: 'Defensa', color: '#c04848' },
  };

  // id: [nombre, categoría, ancho, alto, abreviatura]
  const B = {
    2001: ['Cinta transportadora Mk.I', 'belt', 1, 1, 'C1'],
    2002: ['Cinta transportadora Mk.II', 'belt', 1, 1, 'C2'],
    2003: ['Cinta transportadora Mk.III', 'belt', 1, 1, 'C3'],
    2011: ['Clasificador Mk.I', 'sorter', 1, 1, 'S1'],
    2012: ['Clasificador Mk.II', 'sorter', 1, 1, 'S2'],
    2013: ['Clasificador Mk.III', 'sorter', 1, 1, 'S3'],
    2014: ['Clasificador apilador', 'sorter', 1, 1, 'SA'],
    2020: ['Divisor', 'logistics', 2, 2, 'Div'],
    2040: ['Apilador automático', 'logistics', 1.6, 1.6, 'Api'],
    2030: ['Monitor de tráfico', 'logistics', 1, 1, 'Mon'],
    2313: ['Pulverizador', 'logistics', 1.6, 3.4, 'Pul'],
    2101: ['Almacén Mk.I', 'storage', 2.8, 2.8, 'Alm1'],
    2102: ['Almacén Mk.II', 'storage', 3.4, 3.4, 'Alm2'],
    2106: ['Tanque de almacenamiento', 'storage', 3, 3, 'Tanq'],
    2103: ['Estación logística planetaria', 'logistics', 8, 8, 'PLS'],
    2104: ['Estación logística interestelar', 'logistics', 8, 8, 'ILS'],
    2105: ['Colector orbital', 'logistics', 8, 8, 'Col'],
    2107: ['Distribuidor logístico', 'logistics', 2.6, 2.6, 'Dist'],
    2201: ['Torre Tesla', 'power', 1, 1, 'T'],
    2202: ['Torre de energía inalámbrica', 'power', 2, 2, 'Inal'],
    2212: ['Subestación satélite', 'power', 3.6, 3.6, 'Sub'],
    2203: ['Turbina eólica', 'power', 3, 3, 'Eól'],
    2204: ['Central térmica', 'power', 4.4, 4.4, 'Térm'],
    2211: ['Central de fusión', 'power', 4.6, 4.6, 'Fus'],
    2213: ['Central geotérmica', 'power', 4, 4, 'Geo'],
    2205: ['Panel solar', 'power', 3, 3, 'Sol'],
    2206: ['Acumulador', 'power', 2.4, 2, 'Acu'],
    2207: ['Acumulador (lleno)', 'power', 2.4, 2, 'Acu+'],
    2208: ['Receptor de rayos', 'power', 6, 6, 'Rayo'],
    2209: ['Intercambiador de energía', 'power', 5, 5, 'Int'],
    2210: ['Estrella artificial', 'power', 7, 7, 'Estr'],
    2301: ['Minero', 'mining', 3, 3, 'Min'],
    2316: ['Minero avanzado', 'mining', 3.6, 3.6, 'Min+'],
    2306: ['Bomba de agua', 'mining', 2.6, 2.6, 'Bom'],
    2307: ['Extractor de petróleo', 'mining', 3.6, 3.6, 'Petr'],
    2302: ['Horno de arco', 'smelt', 2.6, 2.6, 'Horno'],
    2315: ['Horno de plano', 'smelt', 2.8, 2.8, 'Plano'],
    2319: ['Horno de negentropía', 'smelt', 3, 3, 'Neg'],
    2303: ['Ensamblador Mk.I', 'assembly', 3, 3, 'Ens1'],
    2304: ['Ensamblador Mk.II', 'assembly', 3, 3, 'Ens2'],
    2305: ['Ensamblador Mk.III', 'assembly', 3, 3, 'Ens3'],
    2318: ['Ensamblador recompositor', 'assembly', 3, 3, 'Reco'],
    2308: ['Refinería de petróleo', 'chem', 3.2, 6, 'Refi'],
    2309: ['Planta química', 'chem', 7, 3.2, 'Quím'],
    2317: ['Planta química cuántica', 'chem', 7, 3.2, 'QCuá'],
    2314: ['Fraccionador', 'chem', 3, 3, 'Frac'],
    2310: ['Colisionador de partículas', 'chem', 7, 3.6, 'Colis'],
    2901: ['Laboratorio de matrices', 'research', 4.4, 4.4, 'Lab'],
    2902: ['Laboratorio autoevolutivo', 'research', 4.4, 4.4, 'Lab+'],
    2311: ['Catapulta electromagnética', 'space', 4.6, 4.6, 'Cat'],
    2312: ['Silo de lanzamiento vertical', 'space', 6.4, 6.4, 'Silo'],
    3001: ['Torreta Gauss', 'defense', 2.6, 2.6, 'Gaus'],
    3002: ['Torreta láser', 'defense', 2.6, 2.6, 'Lás'],
    3003: ['Cañón de implosión', 'defense', 3.4, 3.4, 'Impl'],
    3004: ['Torreta de plasma', 'defense', 3.4, 3.4, 'Plas'],
    3005: ['Torreta de misiles', 'defense', 3.4, 3.4, 'Misi'],
    3006: ['Torre de interferencias', 'defense', 2.4, 2.4, 'Interf'],
    3007: ['Torre de señal', 'defense', 2.4, 2.4, 'Señal'],
    3008: ['Generador de escudo planetario', 'defense', 4, 4, 'Escu'],
    3009: ['Base de análisis de batalla', 'defense', 4, 4, 'Base'],
    3010: ['Torreta de plasma SR', 'defense', 3.4, 3.4, 'SR'],
  };

  // Nombre en el juego (inglés), que es también el del icono en icons/buildings/ID.webp (wiki de Fandom)
  const EN = {
    2001: 'Conveyor Belt MK.I', 2002: 'Conveyor Belt MK.II', 2003: 'Conveyor Belt MK.III', 2011: 'Sorter MK.I',
    2012: 'Sorter MK.II', 2013: 'Sorter MK.III', 2014: 'Pile Sorter', 2020: 'Splitter', 2040: 'Automatic Piler',
    2030: 'Traffic Monitor', 2313: 'Spray Coater', 2101: 'Depot MK.I', 2102: 'Depot MK.II', 2106: 'Storage Tank',
    2103: 'Planetary Logistics Station', 2104: 'Interstellar Logistics Station', 2105: 'Orbital Collector',
    2107: 'Logistics Distributor', 2201: 'Tesla Tower', 2202: 'Wireless Power Tower', 2212: 'Satellite Substation',
    2203: 'Wind Turbine', 2204: 'Thermal Power Plant', 2211: 'Mini Fusion Power Plant', 2213: 'Geothermal Power Station',
    2205: 'Solar Panel', 2206: 'Accumulator', 2207: 'Accumulator (Full)', 2208: 'Ray Receiver', 2209: 'Energy Exchanger',
    2210: 'Artificial Star', 2301: 'Mining Machine', 2316: 'Advanced Mining Machine', 2306: 'Water Pump',
    2307: 'Oil Extractor', 2302: 'Arc Smelter', 2315: 'Plane Smelter', 2319: 'Negentropy Smelter',
    2303: 'Assembling Machine Mk.I', 2304: 'Assembling Machine Mk.II', 2305: 'Assembling Machine Mk.III',
    2318: 'Re-Composing Assembler', 2308: 'Oil Refinery', 2309: 'Chemical Plant', 2317: 'Quantum Chemical Plant',
    2314: 'Fractionator', 2310: 'Miniature Particle Collider', 2901: 'Matrix Lab', 2902: 'Self-Evolution Lab',
    2311: 'EM-Rail Ejector', 2312: 'Vertical Launching Silo', 3001: 'Gauss Turret', 3002: 'Laser Turret',
    3003: 'Implosion Cannon', 3004: 'Plasma Turret', 3005: 'Missile Turret', 3006: 'Jammer Tower', 3007: 'Signal Tower',
    3008: 'Planetary Shield Generator', 3009: 'Battlefield Analysis Base', 3010: 'SR Plasma Turret',
  };

  // Grupos del menú de construcción del juego (wiki: Buildings → Groupings), en su orden
  const MENU = [
    { key: 'power', name: 'Power', ids: [2201, 2202, 2212, 2203, 2204, 2205, 2213, 2211, 2210, 2206, 2207] },
    { key: 'collecting', name: 'Collecting', ids: [2301, 2316, 2306, 2307, 2105] },
    { key: 'logistics', name: 'Logistics', ids: [2001, 2002, 2003, 2011, 2012, 2013, 2014, 2020, 2040, 2030, 2313] },
    { key: 'storage', name: 'Storage', ids: [2101, 2102, 2106] },
    { key: 'production', name: 'Production', ids: [2302, 2315, 2319, 2303, 2304, 2305, 2318, 2308, 2309, 2317, 2314, 2310] },
    { key: 'transportation', name: 'Transportation', ids: [2107, 2103, 2104, 2209] },
    { key: 'defense', name: 'Defense', ids: [3001, 3002, 3003, 3004, 3010, 3005, 3006, 3007, 3008, 3009] },
    { key: 'cosmo', name: 'Research & Dyson Sphere', ids: [2901, 2902, 2311, 2312, 2208] },
  ];

  // Otros objetos (para iconos, filtros, etiquetas de cinta)
  const MATERIALS = {
    1000: 'Agua', 1001: 'Mena de hierro', 1002: 'Mena de cobre', 1003: 'Mena de silicio', 1004: 'Mena de titanio',
    1005: 'Piedra', 1006: 'Carbón', 1007: 'Petróleo crudo', 1011: 'Hielo inflamable', 1012: 'Kimberlita',
    1013: 'Silicio fractal', 1014: 'Cristal de rejilla óptica', 1015: 'Estalagmita espiniforme', 1016: 'Imán unipolar',
    1101: 'Lingote de hierro', 1102: 'Imán', 1103: 'Acero', 1104: 'Lingote de cobre', 1105: 'Silicio de alta pureza',
    1106: 'Lingote de titanio', 1107: 'Aleación de titanio', 1108: 'Ladrillo de piedra', 1109: 'Grafito energético',
    1110: 'Vidrio', 1112: 'Diamante', 1113: 'Silicio cristalino', 1114: 'Petróleo refinado', 1115: 'Plástico',
    1116: 'Ácido sulfúrico', 1117: 'Cristal orgánico', 1118: 'Cristal de titanio', 1119: 'Vidrio de titanio',
    1120: 'Hidrógeno', 1121: 'Deuterio', 1122: 'Antimateria', 1123: 'Grafeno', 1124: 'Nanotubo de carbono',
    1125: 'Material de estructura', 1126: 'Cristal de Casimir', 1127: 'Materia extraña', 1131: 'Cimentación',
    1141: 'Proliferador Mk.I', 1142: 'Proliferador Mk.II', 1143: 'Proliferador Mk.III',
    1201: 'Engranaje', 1202: 'Bobina magnética', 1203: 'Motor eléctrico', 1204: 'Turbina electromagnética',
    1205: 'Anillo supermagnético', 1206: 'Contenedor de partículas', 1208: 'Fotón crítico', 1209: 'Lente de gravitón',
    1210: 'Deformador espacial', 1301: 'Placa de circuito', 1302: 'Componente microcristalino', 1303: 'Procesador',
    1304: 'Filtro plano', 1305: 'Chip cuántico', 1401: 'Excitador de plasma', 1402: 'Banda ancha de partículas',
    1403: 'Esfera de restricción de aniquilación', 1404: 'Combinador de fotones', 1405: 'Propulsor',
    1406: 'Propulsor reforzado', 1501: 'Vela solar', 1502: 'Componente de estructura', 1503: 'Cohete portador',
    1801: 'Barra de combustible de hidrógeno', 1802: 'Barra de combustible de deuterio', 1803: 'Barra de antimateria',
    5001: 'Dron logístico', 5002: 'Nave logística', 5003: 'Bot logístico',
    1030: 'Tronco', 1031: 'Combustible vegetal', 1111: 'Prisma', 1128: 'Unidad de combustible', 1129: 'Unidad explosiva',
    1130: 'Unidad explosiva de cristal', 1407: 'Motor', 1804: 'Barra de aniquilación extraña',
    1601: 'Caja de munición Magnum', 1602: 'Caja de munición de titanio', 1603: 'Caja de munición de superaleación',
    1604: 'Set de proyectiles', 1605: 'Set de proyectiles explosivos', 1606: 'Set de proyectiles de cristal',
    1607: 'Cápsula de plasma', 1608: 'Cápsula de antimateria', 1609: 'Set de misiles', 1610: 'Set de misiles supersónicos',
    1611: 'Set de misiles gravitatorios', 1612: 'Cápsula de interferencia', 1613: 'Cápsula supresora',
    5101: 'Prototipo', 5102: 'Dron de precisión', 5103: 'Dron de ataque', 5111: 'Corbeta', 5112: 'Destructor',
    5201: 'Matriz de la Niebla Oscura', 5202: 'Neurona de silicio', 5203: 'Recombinador de materia',
    5204: 'Singularidad de negentropía', 5205: 'Elemento núcleo', 5206: 'Fragmento de energía',
    6001: 'Matriz electromagnética', 6002: 'Matriz de energía', 6003: 'Matriz estructural',
    6004: 'Matriz de información', 6005: 'Matriz de gravedad', 6006: 'Matriz universal',
  };

  // Objetos con icono propio en icons/items/ID.webp (página Components de la wiki de Fandom): nombre en inglés
  const ITEM_EN = {"1000": "Water", "1001": "Iron Ore", "1002": "Copper Ore", "1003": "Silicon Ore", "1004": "Titanium Ore", "1005": "Stone", "1006": "Coal", "1007": "Crude Oil", "1011": "Fire Ice", "1012": "Kimberlite Ore", "1013": "Fractal Silicon", "1014": "Grating Crystal", "1015": "Stalagmite Crystal", "1016": "Unipolar Magnet", "1030": "Log", "1031": "Plant Fuel", "1101": "Iron Ingot", "1102": "Magnet", "1103": "Steel", "1104": "Copper Ingot", "1105": "High-purity Silicon", "1106": "Titanium Ingot", "1107": "Titanium Alloy", "1108": "Stone Brick", "1109": "Energetic Graphite", "1110": "Glass", "1111": "Prism", "1112": "Diamond", "1113": "Crystal Silicon", "1114": "Refined Oil", "1115": "Plastic", "1116": "Sulfuric Acid", "1117": "Organic Crystal", "1118": "Titanium Crystal", "1119": "Titanium Glass", "1120": "Hydrogen", "1121": "Deuterium", "1122": "Antimatter", "1123": "Graphene", "1124": "Carbon Nanotube", "1125": "Frame Material", "1126": "Casimir Crystal", "1127": "Strange Matter", "1128": "Combustible Unit", "1129": "Explosive Unit", "1130": "Crystal Explosive Unit", "1131": "Foundation", "1141": "Proliferator Mk.I", "1142": "Proliferator Mk.II", "1143": "Proliferator Mk.III", "1201": "Gear", "1202": "Magnetic Coil", "1203": "Electric Motor", "1204": "Electromagnetic Turbine", "1205": "Super-magnetic Ring", "1206": "Particle Container", "1208": "Critical Photon", "1209": "Graviton Lens", "1210": "Space Warper", "1301": "Circuit Board", "1302": "Microcrystalline Component", "1303": "Processor", "1304": "Plane Filter", "1305": "Quantum Chip", "1401": "Plasma Exciter", "1402": "Particle Broadband", "1403": "Annihilation Constraint Sphere", "1404": "Photon Combiner", "1405": "Thruster", "1406": "Reinforced Thruster", "1407": "Engine", "1501": "Solar Sail", "1502": "Dyson Sphere Component", "1503": "Small Carrier Rocket", "1601": "Magnum Ammo Box", "1602": "Titanium Ammo Box", "1603": "Superalloy Ammo Box", "1604": "Shell Set", "1605": "High-Explosive Shell Set", "1606": "Crystal Shell Set", "1607": "Plasma Capsule", "1608": "Antimatter Capsule", "1609": "Missile Set", "1610": "Supersonic Missile Set", "1611": "Gravity Missile Set", "1612": "Jamming Capsule", "1613": "Suppressing Capsule", "1801": "Hydrogen Fuel Rod", "1802": "Deuteron Fuel Rod", "1803": "Antimatter Fuel Rod", "1804": "Strange Annihilation Fuel Rod", "5001": "Logistics Drone", "5002": "Interstellar Logistics Vessel", "5003": "Logistics Bot", "5101": "Prototype", "5102": "Precision Drone", "5103": "Attack Drone", "5111": "Corvette", "5112": "Destroyer", "5201": "Dark Fog Matrix", "5202": "Silicon-based Neuron", "5203": "Matter Recombinator", "5204": "Negentropy Singularity", "5205": "Core Element", "5206": "Energy Shard", "6001": "Electromagnetic Matrix", "6002": "Energy Matrix", "6003": "Structure Matrix", "6004": "Information Matrix", "6005": "Gravity Matrix", "6006": "Universe Matrix"};
  const itemIcon = (id) => (ITEM_EN[id] ? `icons/items/${id}.webp` : null);

  // Recetas: id -> [nombre, grupo de edificio]. Grupos: smelt (hornos), asm (ensambladoras),
  // refine (refinería), chem (planta química), collider (colisionador). Comprobadas con
  // Ejemplos/pruebas/recetas.txt (una de cada en su edificio); las desconocidas salen como "Receta #id".
  const R = {
    smelt: {
      1: 'Lingote de hierro', 2: 'Imán', 3: 'Lingote de cobre', 4: 'Ladrillo de piedra', 17: 'Grafito energético',
      34: 'Mena de silicio', 37: 'Silicio cristalino', 57: 'Vidrio', 59: 'Silicio de alta pureza', 60: 'Diamante',
      61: 'Diamante (kimberlita)', 63: 'Acero', 65: 'Lingote de titanio', 66: 'Aleación de titanio',
    },
    asm: {
      5: 'Engranaje', 6: 'Bobina magnética', 11: 'Prisma', 12: 'Excitador de plasma', 19: 'Barra de combustible de hidrógeno',
      20: 'Propulsor', 21: 'Propulsor reforzado', 26: 'Cristal de titanio', 28: 'Cristal de Casimir',
      29: 'Cristal de Casimir (rejilla óptica)', 30: 'Vidrio de titanio', 36: 'Banda ancha de partículas', 38: 'Filtro plano',
      41: 'Barra de combustible de deuterio', 42: 'Esfera de restricción de aniquilación', 44: 'Barra de antimateria',
      50: 'Placa de circuito', 51: 'Procesador', 52: 'Chip cuántico', 53: 'Componente microcristalino',
      54: 'Cristal orgánico (original)', 62: 'Silicio cristalino (fractal)', 68: 'Combinador de fotones', 70: 'Vela solar',
      80: 'Material de estructura', 81: 'Componente de esfera Dyson', 83: 'Cohete portador', 97: 'Motor eléctrico',
      98: 'Turbina electromagnética', 99: 'Contenedor de partículas', 100: 'Contenedor de partículas (imán unipolar)',
      101: 'Lente de gravitón', 103: 'Anillo supermagnético', 106: 'Proliferador Mk.I', 107: 'Proliferador Mk.II',
      108: 'Proliferador Mk.III',
      // presentes en recetas.txt pero sin nombre conocido todavía
      94: null, 96: null, 105: null, 112: null, 123: null, 133: null, 136: null, 138: null, 139: null, 140: null,
      141: null, 142: null, 143: null, 144: null, 145: null, 146: null, 158: null, 159: null,
      // edificios fabricados en tus blueprints de inicio (sin nombre confirmado)
      7: null, 8: null, 10: null, 14: null, 15: null, 22: null, 45: null, 48: null, 56: null, 64: null,
      84: null, 85: null, 86: null, 87: null, 114: null, 125: null,
    },
    refine: { 16: 'Refinado de plasma', 58: 'Craqueo por rayos X', 121: 'Refinado por reformado' },
    chem: {
      23: 'Plástico', 24: 'Ácido sulfúrico', 25: 'Cristal orgánico', 31: 'Grafeno', 32: 'Grafeno (hielo inflamable)',
      33: 'Nanotubo de carbono', 35: 'Nanotubo de carbono (estalagmita)', 134: null, 135: null,
    },
    collider: { 40: 'Deuterio', 74: 'Antimateria', 104: 'Materia extraña' },
  };
  // edificio -> grupo de recetas
  const RECIPE_GROUP = {
    2302: 'smelt', 2315: 'smelt', 2319: 'smelt', 2303: 'asm', 2304: 'asm', 2305: 'asm', 2318: 'asm',
    2308: 'refine', 2309: 'chem', 2317: 'chem', 2310: 'collider', 2314: 'fract', 2901: 'lab', 2902: 'lab',
  };
  const RECIPES = {}, RECIPE_INFO = {};
  for (const [group, list] of Object.entries(R)) {
    for (const [id, name] of Object.entries(list)) {
      RECIPE_INFO[id] = { id: +id, name: name || `Receta #${id}`, known: !!name, group };
      if (name) RECIPES[id] = name;
    }
  }
  // Tabla completa generada (js/recipes.js, tools/gen_recipes.py): completa nombres, grupos e iconos.
  // Los nombres en español de arriba tienen prioridad.
  const GEN = root.DSPRecipes || {};
  for (const [id, r] of Object.entries(GEN)) {
    const cur = RECIPE_INFO[id];
    RECIPE_INFO[id] = {
      id: +id, name: cur && cur.known ? cur.name : r.name, known: true,
      group: cur ? cur.group : r.group, en: r.en, product: r.product, icon: r.icon || null,
      products: r.products || (r.product ? [r.product] : []),
    };
    RECIPES[id] = RECIPE_INFO[id].name;
  }
  // Recetas de un edificio: primero las de la lista de arriba (orden de uso), luego el resto por número
  function recipesFor(itemId) {
    const g = RECIPE_GROUP[itemId];
    if (!g) return [];
    const first = Object.keys(R[g] || {});
    const rest = Object.values(RECIPE_INFO).filter((r) => r.group === g && !first.includes(String(r.id))).map((r) => String(r.id));
    return [...first, ...rest].map((id) => RECIPE_INFO[id]);
  }

  const BUILDINGS = {};
  for (const [id, v] of Object.entries(B)) {
    BUILDINGS[id] = {
      id: +id, name: v[0], cat: v[1], w: v[2], h: v[3], short: v[4],
      en: EN[id] || v[0], icon: EN[id] ? `icons/buildings/${id}.webp` : null,
    };
  }

  function itemName(id) {
    if (!id) return '—';
    if (BUILDINGS[id]) return BUILDINGS[id].name;
    if (MATERIALS[id]) return MATERIALS[id];
    return '#' + id;
  }
  function recipeName(id) {
    if (!id) return 'Sin receta';
    return RECIPES[id] ? `${RECIPES[id]} (#${id})` : `Receta #${id}`;
  }
  function buildingInfo(id) {
    return BUILDINGS[id] || { id, name: '#' + id, cat: 'assembly', w: 2, h: 2, short: String(id) };
  }

  root.DSPItems = { CATS, MENU, BUILDINGS, MATERIALS, RECIPES, RECIPE_INFO, RECIPE_GROUP, ITEM_EN, itemIcon, recipesFor, itemName, recipeName, buildingInfo };
})(typeof window !== 'undefined' ? window : globalThis);
