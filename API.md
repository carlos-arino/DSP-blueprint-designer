# API de DSP Blueprint Designer

Dos formas de que una IA (o un script) cree y modifique blueprints de **Dyson Sphere Program**:

1. **`window.DSP` en el editor web.** La más completa: usa la misma lógica que el editor (choques, huecos, puertos de cinta, apilado, deshacer) y el resultado se ve en pantalla. Para IAs que controlan un navegador.
2. **`tools/bp.js` en la línea de comandos.** Convierte un blueprint a JSON legible y de vuelta. Para IAs que editan archivos.

---

## 1. `window.DSP` (navegador)

Abre el editor (https://carlos-arino.github.io/DSP-blueprint-designer/ o `python tools/serve.py`) y ejecuta JavaScript en la página. Por ejemplo, desde la consola o con la herramienta de JavaScript de tu navegador automatizado:

```js
DSP.help()                       // resumen de todos los métodos
DSP.newBlueprint('Motores')
const a = DSP.place(2303, 0, 0, { recipe: 97 })          // ensambladora con Motor eléctrico → { ok: true, i: 0 }
DSP.place(2201, 2, 0)                                       // torre Tesla
DSP.belt([[-3, 3], [7, 3]], { tier: 2002 })                 // cinta Mk.II de oeste a este en y = 3
const inBelt = DSP.list({ kind: 'belt', near: [0, 3, 0.5] })[0].i
DSP.sorter({ belt: inBelt }, { building: a.i, slot: 1 })    // de la cinta al hueco 1 de la ensambladora
const code = await DSP.export()                             // texto BLUEPRINT:... listo para pegar en el juego
```

### Convenciones

- **Coordenadas en casillas.** `x` crece hacia el este, `y` hacia el norte. Los edificios van en enteros.
- **`yaw`** en grados, en sentido horario desde el norte: 0 = norte, 90 = este, 180 = sur, 270 = oeste.
- **Edificios por índice `i`**, que es su posición en la lista. Los índices **cambian al borrar**, así que vuelve a consultar con `list()` después de `remove()`.
- **Niveles de cinta:** 0 es el suelo, 1 elevada, etc. Una subida o bajada son dos cintas en la misma casilla.
- **Resultados.** Los métodos que cambian algo devuelven `{ ok: true, ... }` o `{ ok: false, error: 'motivo' }`, y nunca lanzan excepciones. Si una acción choca, no se aplica y el error lo explica.
- **Deshacer.** Todo se puede deshacer con `DSP.undo()`, y también con Ctrl+Z en el editor.

### Consultar

| Método | Devuelve |
|---|---|
| `info()` | `{ name, desc, buildings, belts, sorters, collisions, hashOk, dirty }` |
| `list({ kind, itemId, near: [x, y, r], recipe })` | Edificios que cumplen el filtro (todos opcionales). `kind`: `'building'`, `'belt'` o `'sorter'`. `itemId` puede ser una lista |
| `get(i)` | Descripción del edificio `i` y `raw`, con todos sus campos del blueprint |
| `catalog(texto)` | Edificios disponibles: `{ itemId, name, nameEs, canPlace, recipes }`. `canPlace: false` significa que falta su modelo; abre un blueprint que lo contenga |
| `recipes(itemId)` | Recetas que admite ese edificio: `{ id, name, nameEs, product }` |
| `slots(i)` | Huecos de clasificador del edificio: `{ slot, x, y, used }` |
| `ports(i)` | Puertos de cinta (divisor, estaciones, intercambiador…): `{ slot, x, y, dir, level }` |
| `props(i)` | Propiedades legibles del edificio (ver «Propiedades» más abajo), o `null` si no tiene |
| `checks()` | Comprobación de suministro: `{ issues, carries(i), supplied(i) }`. `issues` son `{ level: 'error' \| 'warn', kind, i, msg, items }` (`missing`: a la máquina le falta algo de su receta; `noout`: nadie saca lo que fabrica; `mix`: mezcla en una cinta; `station`: le entra algo que no tiene; `port`: puerto de salida sin producto). `carries(i)` dice qué lleva una cinta o almacén y `supplied(i)` qué le llega a una máquina |
| `balance(indices)` | Balance por minuto de esos edificios (o de todo el blueprint): `{ items: [[objeto, entra, sale]], machines, work, idle, gen, notes }`, con la potencia en kW. Ver «Ritmos y potencia» |
| `collisions()` | Pares que chocan en el blueprint actual |

En `list()` y `get()` cada edificio trae `i, itemId, name, kind, x, y, z, yaw` y además:
- **cintas:** `level`, `next` (índice de la siguiente o −1) y `label`;
- **clasificadores:** `from`, `fromSlot`, `to`, `toSlot`, `filter`, `length` y `x2, y2`;
- **producción:** `recipe` y `recipeName`;
- **divisores:** `model`;
- **apilados:** `stackedOn`.

### Construir

| Método | Notas |
|---|---|
| `place(itemId, x, y, { yaw, recipe, model })` | Coloca un edificio. Si en esa casilla hay uno compatible, **se apila** encima (almacenes, tanques, laboratorios, distribuidor sobre almacén). `model` sirve para el divisor: 38 (4 lados), 39 (doble altura N-S), 40 (cruce) |
| `belt([[x, y], ...], { tier, level })` | Traza una cinta por esos puntos. Entre puntos va en L: primero el eje más largo. `tier`: 2001, 2002 o 2003. Se engancha sola a cintas del mismo nivel en los extremos, a cintas de otro nivel en la misma casilla (subida o bajada) y a puertos de cinta. Devuelve `created` con los índices nuevos |
| `sorter(desde, hasta, { tier, filter })` | Clasificador de 1 a 3 casillas. `desde` y `hasta` pueden ser `{ belt: i }`, `{ building: i, slot: n }` o `[x, y]`, en cuyo caso busca el hueco o la cinta más cercana. `tier`: 2011, 2012, 2013 o 2014 (apilador). El desplazamiento sobre la cinta se calcula solo |
| `duplicate(indices, dx, dy)` | Copia esos edificios, con su receta y sus clasificadores, desplazados `dx, dy` |

### Cambiar

| Método | Notas |
|---|---|
| `setRecipe(indices, recipeId)` | `0` para quitarla |
| `setFilter(indices, itemId)` | Clasificadores. `0` para quitar el filtro |
| `setTier(indices, itemId)` | Cambia el nivel Mk.I/II/III de cintas o clasificadores |
| `setModel(i, modelo)` | Variante del divisor |
| `setLabel(indices, itemId)` | Icono que muestra una cinta |
| `setProps(indices, cambios)` | Cambia propiedades (ver «Propiedades»). Solo se tocan los campos que pases |
| `move(indices, dx, dy)` | Los clasificadores enganchados se mueven con su edificio. Las cintas no se estiran: si sueltas una cinta encima de otra del mismo nivel, la sustituye |
| `rotate(indices, veces)` | 90° en sentido horario por vez, alrededor del centro del grupo |
| `remove(indices)` · `removeBeltLine(i)` | Borrar. `removeBeltLine` borra toda la cinta conectada del mismo tipo |
| `clean()` | Borra los clasificadores sueltos (sin inicio o sin fin) |
| `setInfo({ name, desc })` | Nombre y descripción del blueprint |

### Archivo y editor

| Método | Notas |
|---|---|
| `newBlueprint(nombre)` | Blueprint vacío, sin preguntar |
| `await load(texto)` | Abre un código `BLUEPRINT:...` |
| `await export()` | Devuelve el código `BLUEPRINT:...` |
| `select(indices)` · `selection()` · `fit()` · `undo()` · `redo()` | Selección, encuadre y deshacer en la vista |

### Propiedades

`props(i)` y `setProps(indices, cambios)` traducen `parameters` a campos legibles (código en `js/props.js`). En las listas puedes dar solo las posiciones que cambian, por ejemplo `{ slots: [, { local: 1 }] }` o `{ priority: [false, false, true] }`.

| Edificio | Campos |
|---|---|
| Receptor de rayos (2208) | `mode`: `'power'` (energía) o `'photon'` (fotones críticos) |
| Distribuidor logístico (2107) | `item` (producto), `icarus` (2 dar y recoger, 1 solo dar, 3 solo recoger, 0 no; 1 y 3 sin comprobar en el juego), `distributors` (0 no, 1 ofrecer, 2 pedir), `chargeMW`, `autoBots` |
| Almacén Mk.I/II (2101, 2102) | `usable` (casillas que se pueden usar; el resto quedan bloqueadas), `filters` (filtro de cada casilla, 0 = libre) |
| Estaciones (2103, 2104) | `slots`: `[{ item, local, remote, max }]` con 0 almacén, 1 ofrecer, 2 pedir (al poner un producto en una casilla vacía, el límite es 5000 en la PLS y 10000 en la ILS si no se da `max`) · `ports`: 12 puertos `{ dir, storage }` (dir 1 sale, 2 entra; storage = nº de producto 1…n que sale por ese puerto) · `chargeMW`, `droneRange` (grados), `droneMinLoad`, `vesselRangeLY` (100 = ∞), `vesselMinLoad`, `warpAU`, `warpersRequired`, `orbitalCollector`, `outgoingCount` (0 = límite de tecnología), `autoDrones`, `autoVessels` |
| Monitor de tráfico (2030) | `mode`: `'none'`, `'generate'` o `'consume'` (sandbox del juego) · `item`: producto que genera, o que consume (0 = todo) · `cycle` (s) y `target` (objetos por ciclo) de la medida. Va encima de una cinta, sin conexión |
| Divisor (2020) | `priority`: 4 booleanos por puerto (0 N, 1 E, 2 S, 3 O en el de 4 lados); `filter`: producto que sale por la salida con prioridad |

### Comprobación de suministro

`js/flow.js` propaga qué productos hay en cada cinta: entran por **cintas con etiqueta** (se supone que traen ese producto), **puertos de salida de estaciones** (el producto elegido), **salidas de máquinas** (los productos de su receta) **almacenes** (lo que les entra y sus filtros) y **monitores de tráfico que generan** (modo sandbox). Un monitor que consume retira de su cinta lo filtrado (o todo). Siguen por cintas, divisores (con su filtro y prioridad) y clasificadores (con su filtro; hacia una máquina solo cogen lo que pide su receta). Con eso dice a qué máquinas les falta algo y qué cintas mezclan productos. El editor lo muestra en el panel (✓/✗ en cada entrada de la receta, «Lleva» en las cintas, lista «Comprobación» del blueprint) y con «!» en el plano; `node tools/bp.js check` lo imprime.

### Ritmos y potencia

`get(i)` trae además, en las máquinas con receta, `rates`: `{ speed, base, cycle, in, out }` (tiempo de la receta, multiplicador de velocidad del edificio, segundos por ciclo y objetos por minuto), y en los edificios que gastan o generan electricidad, `power`: `{ work, idle }` en kW (negativo = genera). En estaciones y distribuidor, `work` es su potencia de carga configurada.

Los cálculos (`js/rates.js`) suponen las máquinas trabajando sin parar y sin proliferador; los fraccionadores no entran porque su ritmo depende de la cinta. Datos: tiempos y cantidades de las recetas en `js/recipes.js` (`time`, `in`, `out`), velocidad y consumo de cada edificio en `js/machines.js` (de [factoriolab](https://github.com/factoriolab/factoriolab), `node tools/gen_machines.js`). Ejemplo: la ensambladora Mk.I tiene `speed: 0.75`, así que un engranaje (1 s) tarda 1,33 s y hace 45/min.

### Reglas que aplica (igual que el editor)

- **Choques.** No se puede colocar nada que choque.
  - Las cintas no chocan entre sí si van a distinto nivel.
  - Una cinta solo atraviesa un edificio por sus carriles: puertos de estaciones e intercambiador, fila de munición de las torretas, carriles del pulverizador (producto a nivel 0 por el centro, proliferador a nivel 1).
  - Dos ensambladoras necesitan una casilla libre entre ellas; ahí cabe una Tesla.
- **Huecos de clasificador.** Horno y ensambladora tienen 6 (0, 1, 2 al norte y 6, 7, 8 al sur). Consúltalos siempre con `slots(i)`.
- **Recetas.** Cada edificio solo admite las de su grupo: hornos, ensambladoras, refinería, planta química, colisionador, fraccionador o laboratorio. Consúltalas con `recipes(itemId)`.

### Edificios más usados

| itemId | Edificio | itemId | Edificio |
|---|---|---|---|
| 2001–2003 | Conveyor Belt Mk.I–III | 2011–2014 | Sorter Mk.I–III, Pile Sorter |
| 2020 | Splitter | 2101, 2102 | Depot Mk.I, Mk.II |
| 2103, 2104 | Planetary / Interstellar Logistics Station | 2107 | Logistics Distributor |
| 2201 | Tesla Tower | 2302 | Arc Smelter |
| 2303–2305 | Assembling Machine Mk.I–III | 2308 | Oil Refinery |
| 2309 | Chemical Plant | 2310 | Miniature Particle Collider |
| 2313 | Spray Coater | 2314 | Fractionator |
| 2901 | Matrix Lab | | |

La lista completa está en `DSP.catalog()`.

---

## 2. `tools/bp.js` (línea de comandos)

```bash
node tools/bp.js decode BP.txt  bp.json     # blueprint → JSON
node tools/bp.js encode bp.json BP.txt      # JSON → blueprint (hash recalculado)
node tools/bp.js check  BP.txt              # hash, choques, clasificadores sueltos (código de salida 2 si hay problemas) y suministro
node tools/bp.js info   BP.txt              # resumen por tipo de edificio, balance por minuto y potencia
```

El JSON es el blueprint completo. Cada edificio lleva `_name` y, si tiene, `_props` (propiedades legibles, ver «Propiedades»); los dos son solo informativos y se ignoran al codificar. Para cambiar propiedades sin tocar `parameters`, añade a un edificio `"props": { ... }` con los campos que cambian: se aplican al codificar. Campos principales de cada edificio:

| Campo | Significado |
|---|---|
| `itemId`, `modelIndex` | Tipo de edificio y modelo 3D. Copia el `modelIndex` de otro edificio igual (o de `js/templates.js`) |
| `x, y, z, yaw` | Posición y giro. Los clasificadores tienen además `x2, y2, z2, yaw2`: el extremo final |
| `outputObjIdx`, `inputObjIdx` | Índices de los edificios conectados (−1 si no hay) |
| `outputToSlot`, `inputFromSlot` | Hueco o puerto del edificio conectado. En las cintas, `outputToSlot` es 1 al enlazar con otra cinta |
| `outputOffset`, `inputOffset` | Desplazamiento del clasificador sobre la cinta: `floor(20 × distancia en el sentido de avance)` |
| `recipeId`, `filterId` | Receta (producción) y filtro (clasificadores) |
| `parameters` | Clasificador: `[longitud]`. Cinta: `[icono, 0]` o `[]`. Almacenes y estaciones: su configuración |

Si borras o reordenas edificios en el JSON, ajusta los índices de conexión (o pon −1). Después pasa `check` para comprobar que no hay choques ni clasificadores sueltos.
