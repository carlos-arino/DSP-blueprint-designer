# DSP Blueprint Designer

**English** · [Español](README.es.md)

Web editor for **Dyson Sphere Program** blueprints. No dependencies, no build step.

**Use it online: https://carlos-arino.github.io/DSP-blueprint-designer/** (Chrome or Edge to open and save straight into the game's folder).

The editor is in English and Spanish: it follows your browser language, and the selector in the top right corner changes it (the choice is remembered).

## API for AIs and scripts

See **[API.md](API.md)**: `window.DSP` in the editor (place buildings, draw belts, sorters, recipes, move, export…) and `tools/bp.js` on the command line (blueprint ↔ JSON, collision and supply checks, flow simulation).

## Usage

Open `index.html` in Chrome or Edge (double click), or serve the folder:

```bash
python tools/serve.py
```

- **Open folder**: choose `Documents\Dyson Sphere Program\Blueprint`. Then you can open and save straight into the game's folder.
- **Paste code**, or press Ctrl+V with a `BLUEPRINT:` code in the clipboard.
- **Copy code**: copies the result to paste it in the game.

### Shortcuts

| Key | Action |
|---|---|
| Click / Ctrl+click / drag on empty space | Select / add / box select |
| Shift+click on a building (and drag without releasing) | Copy it with its recipe and sorters; dragging places copies in a row (the ones that collide are skipped) |
| Drag the selection, arrow keys (Shift = 5) | Move. Attached sorters go with their building. Belts don't stretch: connections to what doesn't move are cut, and dropping a belt on another one at the same level replaces the one below (not allowed if they run in opposite directions). Free ends that face each other are connected again |
| Double click | The whole belt line; on a production building, choose its recipe; on a logistics distributor, its item; on others, all identical buildings |
| R | Rotate 90° (selection, or the ghost while placing). With the belt tool: the diagonal bend starts on the other side |
| + / − | Belt height (also halfway through drawing: it goes up or down in that cell) |
| E | Choose the recipe of the selection |
| Del | Delete the selection |
| X+click | Delete what is under the cursor |
| Shift+X+click | Delete the whole connected belt of the same type |
| Ctrl+C / X / V / D | Copy / cut / paste / duplicate |
| Ctrl+Z / Y | Undo / redo |
| Ctrl+S | Save |
| F | Fit to view |
| Right click | Same as Esc (cancel the tool / deselect) |
| Drag with the right/middle button or Space, wheel | Pan, zoom |

The palette follows the groups of the game's build menu (Power, Collecting, Logistics, Storage, Production, Transportation, Defense, Research & Dyson Sphere) with the wiki icon of each building (`icons/buildings/`). Click on a group to fold or unfold it; the search box accepts the name or the item number. Assembling machines Mk.I/II/III are drawn in yellow, green and blue, like belts and sorters; the pile sorter in white. Re-composing assembler, plane and negentropy smelters, quantum chemical plant and self-evolution lab use the geometry of their equivalent (models from `huww98/dsp_blueprint_editor`).

In the palette, belts start the drawing tool (drag to make an L-shaped line; it connects to existing belts). Other buildings are placed with a click.

The right panel shows what matters for each thing:

- **Production buildings**: recipe (with its icon), inputs and outputs per cycle and per minute, cycle time with the machine's speed multiplier (assembler Mk.I x0.75, Mk.II x1, Mk.III x1.5…), and power use while working and idle.
- **Supply check**: whether each machine gets what its recipe needs through labelled belts, station outputs, depots, other machines' outputs or traffic monitors generating in sandbox mode; whether a belt mixes products; and whether the sorters can keep up (a Mk.I moves 90/min over 1 cell, 45 over 2 and 30 over 3). Problems are also marked with «!» on the map.
- **Flow simulation** in steady state: how much passes along each belt and sorter, at what percentage each machine works and why, and what goes in and out of the blueprint, with traffic monitors in sandbox mode as generators and consumers. The percentage is shown on the map.
- With nothing selected, or several buildings: the **balance** per minute (what goes in, comes out, and what is left over or missing for each item) and total power.
- Belts: tier Mk.I/II/III and icon. Sorters: tier, filter, source, destination and length. Splitters: variant, priorities and filter. Stations: products, output ports and settings. Depots: slots and filters. Logistics distributor and ray receiver: mode. Sorters and ports in use.

On the canvas you see, with their icons, belt labels, sorter and splitter filters, and what comes out of each station port. When you draw a belt out of a station, the editor asks which product comes out (like the game's selector: «None», #1…#5, or keys 0–5). The same happens when you pull a sorter out of a building whose recipe gives several products (refinery, chemical plant, collider): you choose which one it takes, or «All». The raw blueprint data (model, position, slots, parameters) is folded under «Advanced».

The **🧹 Clean up** button deletes the sorters that are missing their start or end.

## Sprites and geometry

- `js/geometry.js`: footprint and sorter slots of each building, measured in real blueprints (hundreds of sorters) and in `Ejemplos/pruebas`.
- `sprites/` + `js/sprites.js`: images cut out from game screenshots. To get them from a new screenshot:

```bash
python tools/sprites_from_screenshot.py Ejemplos/pruebas/edificios.txt Ejemplos/pruebas/edificios.png Ejemplos/pruebas/edificios.points.json
```

The `.points.json` has at least 4 ground-level points (Tesla towers, splitters…) with their position in the blueprint and their pixel in the screenshot. With them the screenshot is straightened to a top-down view and each building is cut out.

## Heights

- Belts have a level (`z`): 0 ground, 1 raised… Raised belts are drawn on top, narrower and with a light border. A ramp up or down is two belts in the same cell, marked with ▲/▼ and the target level.
- The **Level** selector in the toolbar (or PgUp/PgDn) chooses the level: new belts are drawn at that level and the rest is dimmed. With "all" they are drawn on the ground.
- **Going up or down:** while dragging a belt, press **+** to go up one level or **−** to go down (also PgUp/PgDn), and keep dragging. That cell ends up with two belts, one per level, as in the game. You can also start a belt on the end of another one at a different level, or end it on its start.

## Splitter

It takes 1 cell and has 3 variants (model), switched with Tab while placing it or with the inspector:

| Model | Ports (slot: side, level) |
|---|---|
| 38 | 0 N, 1 E, 2 S, 3 W, all on the ground |
| 39 | 0 N ground, 1 N raised, 2 S ground, 3 S raised |
| 40 | 0 N raised, 1 E ground, 2 S raised, 3 W ground |

Ports 1 and 3 of model 38 and port 0 of model 40 are deduced, not measured.

## Belt ports

Belt input/output points are always shown (faint; highlighted with the belt tool): arrows on the ports and a dashed strip on turret lanes (the ammo row). With the belt tool, ports are shown as arrows (blue on the ground, white when raised; dimmed if they are not on the current level). A belt that starts or ends on a port's cell, in its direction, attaches to it, and its last segment sits at the exact port position (`js/geometry.js`, `DSPBeltPorts`):

| Building | Ports |
|---|---|
| Splitter, automatic piler | 0.2 from the center |
| Planetary / interstellar logistics station | 12, 2.15 from the center (3 per side, at −1, 0, +1) |
| Fractionator | north, east and west, at 1.1 |
| Energy exchanger | 4, at 2.3 |
| Ray receiver | north and south, at 1.12 |

## Stacking

When you place a depot, tank, lab or logistics distributor on top of a compatible building, it stacks automatically (`DSPStack`): depot Mk.I on a depot or splitter (+2), Mk.II (+3), tank (+3), lab (+3) and distributor on a depot (+1.87). The upper one points to the lower one as its input. Stacks carry a ×N badge.

## Exact shapes

`node tools/gen_shapes.js --show` extracts the shape of each building that is surrounded by a ring of belts in `Ejemplos/pruebas/especiales.txt` (cells that can't be reached from outside) and saves it in `js/shapes.js`. Those shapes are used for drawing and for collisions (the shield generator's diamond, the signal tower's cross, the 4×7 of the power plants…). If the ring has a gap, the building keeps its rectangle.

## Templates

`node tools/gen_templates.js` regenerates `js/templates.js` (default model, parameters and slots of each building) from `Ejemplos/`. The variants (assemblers Mk.II/III and re-composing assembler, plane and negentropy smelters, quantum chemical plant, self-evolution lab, belt Mk.III and pile sorter) copy their equivalent with their own model.

## Recipes

The inspector's recipe picker shows each recipe's icon, filtered by building; the search box accepts the English or Spanish name. The data is in `js/recipes.js` and the icons in `icons/recipes/` (from the Fandom wiki). Item icons (filters, belt labels, station products) are in `icons/items/`, taken from the wiki's [Components](https://dyson-sphere-program.fandom.com/wiki/Components) page. They are generated with `python tools/gen_recipes.py`. The wiki doesn't allow downloading icons from a script: missing ones are listed in `tools/missing_icons.json` and have to be downloaded from the browser.

## Collisions

`js/collision.js` gives each building a rectangle and doesn't let you place, move, paste or draw anything that collides (the action is undone with a warning; the ghost turns red before that). If the opened blueprint already has collisions, they are marked but don't block you. It is approximate:

- sorters don't collide; belts don't collide with each other;
- splitter, traffic monitor, automatic piler and logistics distributor allow belts underneath;
- buildings are tall: a raised belt also collides with them, except along a lane at its level;
- spray coater: the product belt runs through it at level 0 along the center (entering through the narrow sides) and the proliferator belt crosses it at level 1 along a single row, one cell from the center; nowhere else;
- on stations, energy exchanger, fractionator, ray receiver, turrets (including the SR plasma turret) and jammer tower, belts can only enter through their input/output lanes (on turrets, the central row where ammo goes in);
- pieces at different heights (a depot on a splitter) don't collide;
- two assembling machines need a gap of 1 between them (a Tesla tower fits);
- stations: 7×7 base with cut corners (a Tesla tower fits in each corner); belts only enter through the port lanes.

`node test/collisions.js` checks that no example in `Ejemplos/` gives warnings, plus some synthetic cases.

## Sorters

Pick a sorter in the palette and drag from the source (a belt or a slot) to the destination. Slots are shown as dots (filled = taken). Smelter and assembler have 8: 3 on the north side, 3 on the south, 1 on the east and 1 on the west. The slot, the length (1–3) and the offset along the belt (`floor(20 × distance along the belt)`) are filled in automatically.

## Format (summary)

```
BLUEPRINT:<header>"<base64(gzip(binary))>"<MD5F>
```

- **MD5F**: MD5 with initial state `B=0xEFDCAB89`, `D=0x10325746` and 7 modified K constants (`js/codec.js`). It is computed over the whole text up to the last quote.
- **Header** (0.10.x): `1,layout,icon×5,0,ticks,version,name,,,,description` (texts urlencoded).
- **Binary**: meta (7×int32), areas, buildings. In 0.10.x each building starts with `-102` and the number of position floats depends on the type: belts 5 (x,y,z,yaw,tilt), sorters 12 (two full positions), the rest 4 (x,y,z,yaw). Then: connections, slots, recipe, filter, parameters and an extra int32. The binary ends with 5 bytes (`01 00000000`).

`node test/roundtrip.js` checks that every example in `Ejemplos/` decodes and encodes back byte for byte.

## Translations

Interface texts are in `js/i18n.js` (an `en` and an `es` dictionary with the same keys). Building, item and recipe names come from `js/items.js` and `js/recipes.js`, which keep both languages. To add a language, add a dictionary with the same keys (missing keys fall back to English) and the names.
