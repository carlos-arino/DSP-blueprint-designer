/* Velocidad y consumo de los edificios (tools/gen_machines.js, datos de factoriolab).
   speed: multiplicador de la velocidad de la receta · work: kW trabajando (negativo = genera) · idle: kW en reposo */
(typeof window !== 'undefined' ? window : globalThis).DSPMachines = {
  2011: {speed: 1, work: 18, idle: 9},   // Sorter MK.I
  2012: {speed: 1, work: 36, idle: 9},   // Sorter MK.II
  2013: {speed: 1, work: 72, idle: 9},   // Sorter MK.III
  2014: {speed: 1, work: 144, idle: 9},   // Pile Sorter
  2030: {work: 36, idle: 9},   // Traffic Monitor
  2040: {speed: 1, work: 144, idle: 9},   // Automatic Piler
  2103: {speed: 1, work: 60000, idle: 60},   // Planetary Logistics Station
  2104: {speed: 1, work: 300000, idle: 60},   // Interstellar Logistics Station
  2105: {speed: 1},   // Orbital Collector
  2107: {speed: 1, work: 9000, idle: 18},   // Logistics Distributor
  2202: {work: 4800, idle: 90},   // Wireless Power Tower
  2203: {speed: 1, work: -300},   // Wind Turbine
  2204: {speed: 1, work: -2160},   // Thermal Power Plant
  2205: {speed: 1, work: -360},   // Solar Panel
  2208: {speed: 1},   // Ray Receiver
  2209: {speed: 1, work: 54000},   // Energy Exchanger
  2210: {speed: 1, work: -72000},   // Artificial Star
  2211: {speed: 1, work: -9000},   // Mini Fusion Power Plant
  2212: {work: 0, idle: 720},   // Satellite Substation
  2213: {speed: 1, work: -4800},   // Geothermal Power Station
  2301: {speed: 1},   // Mining Machine
  2302: {speed: 1, work: 360, idle: 12},   // Arc Smelter
  2303: {speed: 0.75, work: 270, idle: 12},   // Assembling Machine Mk.I
  2304: {speed: 1, work: 540, idle: 18},   // Assembling Machine Mk.II
  2305: {speed: 1.5, work: 1080, idle: 24},   // Assembling Machine Mk.III
  2306: {speed: 1, work: 300, idle: 12},   // Water Pump
  2307: {speed: 1, work: 840, idle: 24},   // Oil Extractor
  2308: {speed: 1, work: 960, idle: 24},   // Oil Refinery
  2309: {speed: 1, work: 720, idle: 24},   // Chemical Plant
  2310: {speed: 1, work: 12000, idle: 120},   // Miniature Particle Collider
  2311: {speed: 1, work: 1800, idle: 60},   // EM-Rail Ejector
  2312: {speed: 1, work: 18000, idle: 60},   // Vertical Launching Silo
  2313: {speed: 1, work: 90, idle: 4.5},   // Spray Coater
  2314: {work: 720, idle: 18},   // Fractionator
  2315: {speed: 2, work: 1440, idle: 48},   // Plane Smelter
  2316: {speed: 2},   // Advanced Mining Machine
  2317: {speed: 2, work: 2160, idle: 36},   // Quantum Chemical Plant
  2318: {speed: 3, work: 2700, idle: 54},   // Re-Composing Assembler
  2319: {speed: 3, work: 2880, idle: 96},   // Negentropy Smelter
  2901: {speed: 1, work: 480, idle: 12},   // Matrix Lab
  2902: {speed: 3, work: 1920, idle: 48},   // Self-Evolution Lab
  3001: {work: 210, idle: 9},   // Gauss Turret
  3002: {work: 3000, idle: 120},   // Laser Turret
  3003: {work: 750, idle: 30},   // Implosion Cannon
  3004: {work: 1680, idle: 84},   // Plasma Turret
  3005: {work: 600, idle: 18},   // Missile Turret
  3006: {work: 1200, idle: 90},   // Jammer Tower
  3007: {work: 9600, idle: 1350},   // Signal Tower
  3008: {work: 24000, idle: 12000},   // Planetary Shield Generator
  3009: {work: 2400, idle: 60},   // Battlefield Analysis Base
  3010: {work: 4200, idle: 2100},   // SR Plasma Turret
};
