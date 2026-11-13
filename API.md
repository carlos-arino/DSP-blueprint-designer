# DSP Blueprint Designer API

**English** · [Español](API.es.md)

Two ways for an AI (or a script) to create and modify **Dyson Sphere Program** blueprints:

1. **`window.DSP` in the web editor.** The most complete one: it uses the same logic as the editor (collisions, slots, belt ports, stacking, undo) and you see the result on screen. For AIs that drive a browser.
2. **`tools/bp.js` on the command line.** Converts a blueprint to readable JSON and back. For AIs that edit files.

---

## 1. `window.DSP` (browser)

Open the editor (https://carlos-arino.github.io/DSP-blueprint-designer/ or `python tools/serve.py`) and run JavaScript in the page, for example from the console or with your automated browser's JavaScript tool:

```js
DSP.help()                       // summary of every method
DSP.newBlueprint('Motors')
const a = DSP.place(2303, 0, 0, { recipe: 97 })          // assembling machine making Electric Motor → { ok: true, i: 0 }
DSP.place(2201, 2, 0)                                       // Tesla tower
DSP.belt([[-3, 3], [7, 3]], { tier: 2002 })                 // Mk.II belt from west to east at y = 3
const inBelt = DSP.list({ kind: 'belt', near: [0, 3, 0.5] })[0].i
DSP.sorter({ belt: inBelt }, { building: a.i, slot: 1 })    // from the belt to slot 1 of the assembler
const code = await DSP.export()                             // BLUEPRINT:... text ready to paste in the game
```

### Conventions

- **Coordinates in cells.** `x` grows to the east, `y` to the north. Buildings go on integers.
- **`yaw`** in degrees, clockwise from north: 0 = north, 90 = east, 180 = south, 270 = west.
- **Buildings by index `i`**, their position in the list. Indices **change when you delete**, so query again with `list()` after `remove()`.
- **Belt levels:** 0 is the ground, 1 raised, and so on. A ramp up or down is two belts in the same cell.
- **Results.** Methods that change something return `{ ok: true, ... }` or `{ ok: false, error: 'reason' }` and never throw. If an action collides, it is not applied and the error explains why.
- **Undo.** Everything can be undone with `DSP.undo()`, and also with Ctrl+Z in the editor.
- **Language.** Names (`recipeName`, issue messages) follow the editor language. `DSP.setLang('en')` or `DSP.setLang('es')` changes it. `name` in `list()`, `catalog()` and `recipes()` is always the English game name.

### Query

| Method | Returns |
|---|---|
| `info()` | `{ name, desc, buildings, belts, sorters, collisions, hashOk, dirty }` |
| `list({ kind, itemId, near: [x, y, r], recipe })` | Buildings that match the filter (all optional). `kind`: `'building'`, `'belt'` or `'sorter'`. `itemId` can be a list |
| `get(i)` | Description of building `i` and `raw`, with all its blueprint fields |
| `catalog(text)` | Available buildings: `{ itemId, name, nameEs, canPlace, recipes }`. `canPlace: false` means its model is missing; open a blueprint that contains it |
| `recipes(itemId)` | Recipes that building accepts: `{ id, name, nameEs, product }` |
| `slots(i)` | Sorter slots of the building: `{ slot, x, y, used }` |
| `ports(i)` | Belt ports (splitter, stations, energy exchanger…): `{ slot, x, y, dir, level }` |
| `props(i)` | Readable properties of the building (see «Properties» below), or `null` if it has none |
| `simulate({ openEnds })` | Steady-state flow simulation (see «Flow simulation») |
| `checks()` | Supply check: `{ issues, carries(i), supplied(i) }`. `issues` are `{ level: 'error' \| 'warn', kind, i, msg, items }` (`missing`: the machine lacks something its recipe needs; `noout`: nothing takes out what it makes; `sorter`: its sorters can't keep up; `mix`: a belt mixes products; `station`: it receives something it doesn't hold; `port`: output port without a product; `monitor`: traffic monitor not on a belt or without a product). `kind` and `items` are for programs; `msg` is the text in the editor language. `carries(i)` tells what a belt or depot carries and `supplied(i)` what reaches a machine |
| `balance(indices)` | Balance per minute of those buildings (or the whole blueprint): `{ items: [[item, in, out]], machines, work, idle, gen, notes }`, with power in kW. See «Rates and power» |
| `collisions()` | Colliding pairs in the current blueprint |

In `list()` and `get()` each building has `i, itemId, name, kind, x, y, z, yaw` and also:
- **belts:** `level`, `next` (index of the next one or −1) and `label`;
- **sorters:** `from`, `fromSlot`, `to`, `toSlot`, `filter`, `length` and `x2, y2`;
- **production:** `recipe` and `recipeName`;
- **splitters:** `model`;
- **stacked:** `stackedOn`.

### Build

| Method | Notes |
|---|---|
| `place(itemId, x, y, { yaw, recipe, model })` | Places a building. If there is a compatible one in that cell, it **stacks** on top (depots, tanks, labs, distributor on a depot). `model` is for the splitter: 38 (4 sides), 39 (two levels N-S), 40 (crossing) |
| `belt([[x, y], ...], { tier, level })` | Draws a belt through those points. Between points it goes in an L: the longer axis first. `tier`: 2001, 2002 or 2003. It attaches by itself to belts at the same level at its ends, to belts at another level in the same cell (ramp up or down) and to belt ports. Returns `created` with the new indices |
| `sorter(from, to, { tier, filter })` | Sorter of 1 to 3 cells. `from` and `to` can be `{ belt: i }`, `{ building: i, slot: n }` or `[x, y]`, in which case it looks for the nearest slot or belt. `tier`: 2011, 2012, 2013 or 2014 (pile sorter). The offset along the belt is computed automatically |
| `duplicate(indices, dx, dy)` | Copies those buildings, with their recipe and sorters, shifted by `dx, dy` |

### Change

| Method | Notes |
|---|---|
| `setRecipe(indices, recipeId)` | `0` removes it |
| `setFilter(indices, itemId)` | Sorters. `0` removes the filter |
| `setTier(indices, itemId)` | Changes the Mk.I/II/III tier of belts or sorters |
| `setModel(i, model)` | Splitter variant |
| `setLabel(indices, itemId)` | Icon shown on a belt |
| `setProps(indices, changes)` | Changes properties (see «Properties»). Only the fields you pass are touched |
| `move(indices, dx, dy)` | Attached sorters move with their building. Belts don't stretch: if you drop a belt on another one at the same level, it replaces it |
| `rotate(indices, times)` | 90° clockwise each time, around the center of the group |
| `remove(indices)` · `removeBeltLine(i)` | Delete. `removeBeltLine` deletes the whole connected belt of the same type |
| `clean()` | Deletes loose sorters (without a start or an end) |
| `setInfo({ name, desc })` | Blueprint name and description |

### File and editor

| Method | Notes |
|---|---|
| `newBlueprint(name)` | Empty blueprint, without asking |
| `await load(text)` | Opens a `BLUEPRINT:...` code |
| `await export()` | Returns the `BLUEPRINT:...` code |
| `select(indices)` · `selection()` · `fit()` · `undo()` · `redo()` | Selection, fit to view and undo in the view |
| `setLang('en' \| 'es')` | Editor language |

### Properties

`props(i)` and `setProps(indices, changes)` translate `parameters` into readable fields (code in `js/props.js`). In lists you can give only the positions that change, for example `{ slots: [, { local: 1 }] }` or `{ priority: [false, false, true] }`.

| Building | Fields |
|---|---|
| Ray Receiver (2208) | `mode`: `'power'` or `'photon'` (critical photons) |
| Logistics Distributor (2107) | `item` (product), `icarus` (2 give and take, 1 give only, 3 take only, 0 no; 1 and 3 not checked in the game), `distributors` (0 no, 1 supply, 2 demand), `chargeMW`, `autoBots` |
| Depot Mk.I/II (2101, 2102) | `usable` (slots that can be used; the rest are locked), `filters` (filter of each slot, 0 = free) |
| Stations (2103, 2104) | `slots`: `[{ item, local, remote, max }]` with 0 storage, 1 supply, 2 demand (when you put a product in an empty slot, the limit is 5000 on the PLS and 10000 on the ILS unless `max` is given) · `ports`: 12 ports `{ dir, storage }` (dir 1 out, 2 in; storage = product number 1…n that goes out through that port) · `chargeMW`, `droneRange` (degrees), `droneMinLoad`, `vesselRangeLY` (100 = ∞), `vesselMinLoad`, `warpAU`, `warpersRequired`, `orbitalCollector`, `outgoingCount` (0 = tech limit), `autoDrones`, `autoVessels` |
| Traffic Monitor (2030) | `mode`: `'none'`, `'generate'` or `'consume'` (game sandbox) · `item`: product it generates, or consumes (0 = all) · `cycle` (s) and `target` (items per cycle) of the measurement. It sits on top of a belt, without a connection |
| Splitter (2020) | `priority`: 4 booleans, one per port (0 N, 1 E, 2 S, 3 W on the 4-sided one); `filter`: product that goes out through the priority output |

### Supply check

`js/flow.js` propagates which products are on each belt. They come in through **labelled belts** (assumed to carry that product), **station output ports** (the chosen product), **machine outputs** (their recipe's products), **depots** (what goes into them and their filters) and **generating traffic monitors** (sandbox mode). A consuming monitor removes from its belt the filtered product (or everything). Products travel along belts, splitters (with their filter and priority) and sorters (with their filter; towards a machine they only take what its recipe needs). With that it tells which machines lack something, which belts mix products and whether each machine's sorters can keep up: a sorter makes 1.5 (Mk.I), 3 (Mk.II), 6 (Mk.III) or 12 (pile sorter, unchecked) trips per second and cell, so a Mk.I moves 90/min if it is 1 cell long, 45 if 2 and 30 if 3. The editor shows it in the panel (✓/✗ on each recipe input, «Carries» on belts, the blueprint's «Supply check» list) and with «!» on the map; `node tools/bp.js check` prints it.

### Flow simulation

`DSP.simulate({ openEnds })` (and `node tools/bp.js sim BP.txt [--open]`) computes the steady state with `js/sim.js`: how much passes along each belt and sorter and at what percentage each machine works. It returns `machines` (`{ r, rIn, rOut, limit, need, prod, got }`; `r` from 0 to 1 and `limit.kind`: `input` something is missing, `sorter` its sorters can't keep up, `output` nothing takes out what it makes), `belts`, `sorters` (items/min), `sources` and `sinks` (what goes in and out of the blueprint), `jams` (mixed belts that jam), `iterations` and `converged`.

- **Belts:** Mk.I 360/min, Mk.II 720, Mk.III 1800. Each cell is a step, so sorters further upstream take first; what comes from behind has priority over what enters from a side.
- **Inputs:** station output ports (a full belt of the chosen product), generating monitors, and labelled belts when nothing comes in before and no machine further on outputs that product (a label on an output belt doesn't create product).
- **Outputs:** consuming monitors, station input ports and depots without output sorters. Without outputs, belts fill up and everything stops, as in the game; `openEnds` makes the end of belts with no exit remove what reaches them.
- **Back pressure:** only what is consumed comes in. Each machine runs at the speed of its scarcest input and of what can be taken out of it.
- No proliferator and no stacking on the belt; the fractionator is approximate.

### Rates and power

`get(i)` also includes, for machines with a recipe, `rates`: `{ speed, base, cycle, in, out }` (recipe time, building speed multiplier, seconds per cycle and items per minute), and for buildings that use or generate electricity, `power`: `{ work, idle }` in kW (negative = generates). On stations and distributor, `work` is their configured charging power.

The calculations (`js/rates.js`) assume machines working non-stop with no proliferator; fractionators are left out because their rate depends on the belt. Data: recipe times and amounts in `js/recipes.js` (`time`, `in`, `out`), speed and power of each building in `js/machines.js` (from [factoriolab](https://github.com/factoriolab/factoriolab), `node tools/gen_machines.js`). Example: the Assembling Machine Mk.I has `speed: 0.75`, so a gear (1 s) takes 1.33 s and makes 45/min.

### Rules it applies (same as the editor)

- **Collisions.** Nothing that collides can be placed.
  - Belts don't collide with each other if they are at different levels.
  - A belt only goes through a building along its lanes: station and energy exchanger ports, the turrets' ammo row, the spray coater lanes (product at level 0 along the center, proliferator at level 1).
  - Two assembling machines need a free cell between them; a Tesla tower fits there.
- **Sorter slots.** Smelter and assembler have 8 (0, 1, 2 on the north side, 4 on the east, 6, 7, 8 on the south and 10 on the west). Always query them with `slots(i)`.
- **Recipes.** Each building only accepts those of its group: smelters, assemblers, refinery, chemical plant, collider, fractionator or lab. Query them with `recipes(itemId)`.

### Most used buildings

| itemId | Building | itemId | Building |
|---|---|---|---|
| 2001–2003 | Conveyor Belt Mk.I–III | 2011–2014 | Sorter Mk.I–III, Pile Sorter |
| 2020 | Splitter | 2101, 2102 | Depot Mk.I, Mk.II |
| 2103, 2104 | Planetary / Interstellar Logistics Station | 2107 | Logistics Distributor |
| 2201 | Tesla Tower | 2302 | Arc Smelter |
| 2303–2305 | Assembling Machine Mk.I–III | 2308 | Oil Refinery |
| 2309 | Chemical Plant | 2310 | Miniature Particle Collider |
| 2313 | Spray Coater | 2314 | Fractionator |
| 2901 | Matrix Lab | | |

The full list is in `DSP.catalog()`.

---

## 2. `tools/bp.js` (command line)

```bash
node tools/bp.js decode BP.txt  bp.json     # blueprint → JSON
node tools/bp.js encode bp.json BP.txt      # JSON → blueprint (hash recalculated)
node tools/bp.js check  BP.txt              # hash, collisions, loose sorters (exit code 2 if there are problems) and supply
node tools/bp.js info   BP.txt              # count per building type, balance per minute and power
node tools/bp.js sim    BP.txt [--open]     # flow simulation: machines below 100 %, inputs and outputs
```

Output is in English; with the environment variable `DSPBP_LANG=es`, item names and supply messages come out in Spanish.

The JSON is the full blueprint. Each building carries `_name` and, if it has them, `_props` (readable properties, see «Properties»); both are informative only and ignored when encoding. To change properties without touching `parameters`, add `"props": { ... }` to a building with the fields that change: they are applied when encoding. Main fields of each building:

| Field | Meaning |
|---|---|
| `itemId`, `modelIndex` | Building type and 3D model. Copy the `modelIndex` from another building of the same type (or from `js/templates.js`) |
| `x, y, z, yaw` | Position and rotation. Sorters also have `x2, y2, z2, yaw2`: the far end |
| `outputObjIdx`, `inputObjIdx` | Indices of the connected buildings (−1 if none) |
| `outputToSlot`, `inputFromSlot` | Slot or port of the connected building. On belts, `outputToSlot` is 1 when linking to another belt |
| `outputOffset`, `inputOffset` | Offset of the sorter along the belt: `floor(20 × distance in the direction of travel)` |
| `recipeId`, `filterId` | Recipe (production) and filter (sorters) |
| `parameters` | Sorter: `[length]`. Belt: `[icon, 0]` or `[]`. Depots and stations: their configuration |

If you delete or reorder buildings in the JSON, fix the connection indices (or set −1). Then run `check` to make sure there are no collisions or loose sorters.
