/*
 * Geometría de edificios medida en tus blueprints y capturas (coordenadas locales, yaw 0, +y = norte).
 *   w, h    tamaño de la huella en casillas
 *   ox, oy  desplazamiento del centro de la huella respecto a la posición del edificio
 *   slots   posición de cada hueco de clasificador (índice = número de hueco); null = desconocido
 *
 * Horno y ensambladora: 6 conectores, 3 al norte y 3 al sur (enfrentados).
 * El juego los numera en sentido horario desde el noroeste: norte 0(O) 1 2(E) · sur 6(E) 7 8(O).
 * Los números 3-5 (este) y 9-11 (oeste) existen en el formato pero no se usan aquí.
 */
(function (root) {
  const ASM = [
    [-0.81, 0.87], [0, 0.87], [0.8, 0.87],        // 0 1 2  norte
    null, null, null,                             // 3 4 5  este: sin conectores
    [0.8, -0.87], [0, -0.87], [-0.8, -0.87],      // 6 7 8  sur
    null, null, null,                             // 9 10 11  oeste: sin conectores
  ];
  const SMELTER = [
    [-0.8, 0.79], [0, 0.79], [0.8, 0.8],          // 0 1 2  norte
    null, null, null,                             // 3 4 5  este: sin conectores
    [0.84, -0.8], [0, -0.79], [-0.84, -0.8],      // 6 7 8  sur
    null, null, null,                             // 9 10 11  oeste: sin conectores
  ];
  // Divisor: 3 variantes (modelo) con distintos puertos. [hueco, lado local, nivel (0 suelo, 1 elevado)]
  // Medido en tus blueprints; los marcados "sup" no aparecen conectados en ninguno todavía.
  root.DSPSplitter = {
    38: { name: '4 lados (suelo)', short: '+', ports: [[0, 'N', 0], [1, 'E', 0] /* sup */, [2, 'S', 0], [3, 'W', 0] /* sup */] },
    39: { name: 'Doble altura N-S', short: '⇅', ports: [[0, 'N', 0], [1, 'N', 1], [2, 'S', 0], [3, 'S', 1]] },
    40: { name: 'Cruce: E-O suelo, N-S elevado', short: '╋', ports: [[0, 'N', 1] /* sup */, [1, 'E', 0], [2, 'S', 1], [3, 'W', 0]] },
  };
  // Puertos de cinta: [hueco, x, y, lado, nivel] en local. La última cinta queda justo en (x, y).
  // Medidos en Ejemplos/pruebas/Almacenes.txt. El divisor está en DSPSplitter (depende del modelo).
  const STATION = [
    [0, 1, 2.15, 'N'], [1, 0, 2.15, 'N'], [2, -1, 2.15, 'N'], [3, -2.15, 1, 'W'], [4, -2.15, 0, 'W'], [5, -2.15, -1, 'W'],
    [6, -1, -2.15, 'S'], [7, 0, -2.15, 'S'], [8, 1, -2.15, 'S'], [9, 2.15, -1, 'E'], [10, 2.15, 0, 'E'], [11, 2.15, 1, 'E'],
  ].map((p) => [...p, 0]);
  root.DSPBeltPorts = {
    2103: STATION, 2104: STATION,
    2314: [[0, 0, 1.11, 'N', 0], [1, 1.13, 0, 'E', 0], [2, -1.13, 0, 'W', 0]],          // fraccionador
    2040: [[0, 0, 0.2, 'N', 0], [1, 0, -0.2, 'S', 0]],                                    // apilador
    2209: [[0, 0, 2.27, 'N', 0], [1, 2.3, 0, 'E', 0], [2, 0, -2.27, 'S', 0], [3, -2.3, 0, 'W', 0]], // intercambiador
    2208: [[0, 0, 1.12, 'N', 0], [1, 0, -1.12, 'S', 0]],                                  // receptor de rayos
  };
  // Apilado: qué puede ir encima de qué y a cuánta altura sobre el de abajo
  root.DSPStack = {
    2101: { on: [2101, 2020], h: 2 },
    2102: { on: [2102], h: 3 },
    2106: { on: [2106], h: 3 },
    2901: { on: [2901], h: 3 },
    2902: { on: [2902], h: 3 },
    2107: { on: [2101, 2102], h: 1.87 },   // distribuidor logístico sobre almacén
  };

  const G = root.DSPGeometry = {
    2302: { w: 2.6, h: 2.6, slots: SMELTER },
    2315: { w: 2.6, h: 2.6, slots: SMELTER },   // horno de plano: igual que el de arco
    2319: { w: 2.6, h: 2.6, slots: SMELTER },   // horno de negentropía: igual que el de arco
    2303: { w: 3.2, h: 3.2, slots: ASM },
    2304: { w: 3.2, h: 3.2, slots: ASM },
    2305: { w: 3.2, h: 3.2, slots: ASM },
    2318: { w: 3.2, h: 3.2, slots: ASM },
    // Almacén Mk.I: 12 huecos a ±0,8 (sentido horario desde el noroeste, como la ensambladora)
    2101: {
      w: 2.8, h: 2.8,
      slots: [[-0.8, 0.79], [0, 0.79], [0.8, 0.79], [0.8, 0.79], [0.8, 0], [0.8, -0.8],
        [0.8, -0.8], [0, -0.79], [-0.8, -0.8], [-0.8, -0.8], [-0.8, 0], [-0.8, 0.79]],
    },
    // Almacén Mk.II: más ancho de este a oeste (huecos laterales a 1,83)
    2102: {
      w: 4.0, h: 3.0,
      slots: [[-0.8, 0.87], [0, 0.87], [0.8, 0.87], [1.83, 0.79], [1.83, 0], [1.83, -0.8],
        [0.8, -0.87], [0, -0.87], [-0.8, -0.87], [-1.83, -0.8], [-1.83, 0], [-1.83, 0.79]],
    },
    // Laboratorio: 12 huecos a 1,83, en sentido ANTIhorario desde el noreste (norte, oeste, sur, este)
    2901: {
      w: 4.4, h: 4.4, sides: 'NWSE',
      slots: [[0.8, 1.83], [0, 1.83], [-0.8, 1.83], [-1.83, 0.79], [-1.83, 0], [-1.83, -0.8],
        [-0.8, -1.83], [0, -1.83], [0.8, -1.83], [1.83, -0.8], [1.83, 0], [1.83, 0.79]],
    },
    // Colisionador de partículas: largo, con el centro desplazado hacia un extremo (Ejemplos/pruebas/recetas.txt)
    2310: {
      w: 6.6, h: 4.0, ox: -0.9,
      slots: [[-0.8, 1.83], [-1.59, 1.83], [-2.39, 1.83], [-3.82, 0.8], [-3.82, 0], [-3.82, -0.8],
        [-2.39, -1.83], [-1.59, -1.83], [-0.8, -1.83]],
    },
    // Central térmica y de fusión: 3 huecos al oeste y 2 al este (Ejemplos/pruebas/especiales.txt)
    2204: { w: 4, h: 7, ox: -0.5, slots: [[-1.85, 0.79], [-1.85, 0], [-1.84, -0.8], [0.76, 0], [0.76, 0.79]] },
    2211: { w: 4, h: 7, ox: -0.5, slots: [[-1.85, 0.79], [-1.85, 0], [-1.84, -0.8], [0.76, 0], [0.76, 0.79]] },
    // Estrella artificial: 4 huecos (0 norte, 1 este, 2 sur, 3 oeste)
    2210: { w: 5, h: 5, slots: [[0, 1.79], [1.88, 0], [0, -1.79], [-1.88, 0]] },
    // Silo de lanzamiento vertical: 0 norte, 1 este, 2 oeste
    2312: { w: 9, h: 8, oy: 0.5, slots: [[0, 3.9], [4.08, 0], [-4.08, 0]] },
    // Base de análisis de batalla: 3 huecos al este, 3 al sur, 3 al oeste
    3009: {
      w: 5, h: 6, oy: 0.5,
      slots: [[1.88, 0.79], [1.88, 0], [1.88, -0.8], [0.85, -1.83], [0, -1.83], [-0.85, -1.83],
        [-1.88, -0.8], [-1.88, 0], [-1.88, 0.79]],
    },
    // Tamaños medidos con el anillo de cintas que rodea cada edificio en Ejemplos/pruebas/especiales.txt
    2202: { w: 1, h: 1 }, 2212: { w: 3, h: 3 }, 2203: { w: 3, h: 3 }, 2205: { w: 3, h: 3 }, 2206: { w: 3, h: 3 },
    2207: { w: 3, h: 3 },
    3001: { w: 3, h: 4, oy: -0.5 },        // torreta Gauss
    3002: { w: 3, h: 3 },                  // láser
    3003: { w: 5, h: 5 },                  // cañón de implosión (anillo abierto: aproximado)
    3004: { w: 8, h: 7, ox: 0.5 },         // plasma
    3005: { w: 5, h: 5 },                  // misiles
    3006: { w: 5, h: 5 },                  // torre de interferencias
    3007: { w: 3, h: 3 },                  // torre de señal
    3008: { w: 3, h: 3 },                  // generador de escudo (base en rombo de radio 2: se usa el cuadrado central)
    3010: { w: 3, h: 3 },                  // plasma SR
    // Catapulta electromagnética: 4 huecos (0 este, 1 oeste, 2 norte, 3 sur)
    2311: { w: 4.6, h: 4.6, slots: [[1.79, 0], [-1.79, 0], [0, 1.79], [0, -1.79]] },
    // Refinería: alargada hacia el sur; huecos a los lados (0-2 este, 3-5 oeste) y en el extremo sur (6-8)
    2308: {
      w: 3.2, h: 6.0, ox: 0, oy: -0.6,
      slots: [[0.87, -0.87], [0.87, 0], [0.87, 0.87], [-0.88, 0.88], [-0.87, 0], [-0.87, -0.8],
        [-0.79, -2.88], [0, -2.87], [0.8, -2.87]],
    },
    // Planta química: alargada en este-oeste, tanque al oeste; 4 huecos al norte y 4 al sur
    2309: {
      w: 7.0, h: 3.2, ox: 0.2, oy: 0.5,
      slots: [[-0.8, 1.67], [0, 1.67], [0.8, 1.67], [1.6, -0.72], [0.8, -0.72], [0, -0.72], [-0.8, -0.72], [1.6, 1.67]],
    },
    2314: { w: 3.0, h: 3.0 },
    // Estaciones: base de 7×7 con las esquinas recortadas (marcada con cintas en Almacenes.txt);
    // las cintas entran por los carriles de los puertos hasta 2,15 del centro
    2103: { w: 7, h: 7, cut: 1 },
    2104: { w: 7, h: 7, cut: 1 },
    2040: { w: 1.0, h: 1.0 },
    // Divisor: ocupa 1 casilla; las cintas se enganchan a 0,2 del centro (ver SPLITTER_PORTS)
    2020: { w: 1.0, h: 1.0 },
    2030: { w: 1.4, h: 1.4 },
  };
  G[2317] = G[2309];   // planta química cuántica: igual que la planta química
  G[2902] = G[2901];   // laboratorio autoevolutivo: igual que el de matrices
})(typeof window !== 'undefined' ? window : globalThis);
