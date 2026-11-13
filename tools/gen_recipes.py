"""Genera js/recipes.js y descarga los iconos de recetas (icons/recipes/ID.png).

Fuentes:
  - Recetas (id -> productos) y objetos: huww98/dsp_blueprint_editor (src/data/recipesData.ts, itemsData.ts),
    nombres en inglés en src/locales/en.json. Se descargan con `gh api` a una carpeta temporal.
  - Iconos: wiki de Fandom (https://dyson-sphere-program.fandom.com), por nombre en inglés del producto.

Uso:
  python tools/gen_recipes.py
  Los iconos van en icons/recipes/ID.png|webp. La wiki no deja descargarlos por script, así que los que faltan
  se listan en tools/missing_icons.json y se bajan desde el navegador (ver README).

El nombre en español sale de js/items.js (recetas con nombre, materiales y edificios); si no lo hay, en inglés.
"""
import base64, json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'huww98/dsp_blueprint_editor'
WIKI = 'https://dyson-sphere-program.fandom.com/wiki/Special:FilePath/'

# Grupo de edificio de cada receta. Lo que no está aquí ni es matriz/fraccionamiento va a ensambladora.
SMELT = {1, 2, 3, 4, 17, 34, 37, 57, 59, 60, 61, 63, 65, 66}
REFINE = {16, 58, 121}
CHEM = {23, 24, 25, 31, 32, 33, 35, 134, 135}
COLLIDER = {40, 74, 104}


def gh_file(path):
    out = subprocess.check_output(['gh', 'api', f'repos/{REPO}/contents/{path}', '--jq', '.content'], text=True)
    return base64.b64decode(out).decode('utf-8')


def load_js(path, name):
    code = f"require('{path.replace(os.sep, '/')}'); process.stdout.write(JSON.stringify(globalThis.{name}))"
    return json.loads(subprocess.check_output(['node', '-e', code], text=True, encoding='utf-8'))


def main():
    recipes_ts = gh_file('src/data/recipesData.ts')
    items_ts = gh_file('src/data/itemsData.ts')
    en = json.loads(gh_file('src/locales/en.json'))

    item_zh = {int(i): n for i, n in re.findall(r"id: (\d+), models: \[[^\]]*\], grid: \[[^\]]*\],\s*name: '([^']*)'", items_ts)}
    blocks = re.findall(r"id: (\d+), name: '([^']*)', time: (\d+),\s*from: \[(.*?)\],\s*to: \[(.*?)\]", recipes_ts, re.S)
    # posición en la ventana de recetas del juego: [página, fila, columna] (página 1 objetos, 2 edificios)
    grid = {int(i): [int(a), int(b), int(c)] for i, a, b, c in
            re.findall(r"id: (\d+), name: '[^']*', time: \d+,.*?grid: \[(\d+), (\d+), (\d+)\]", recipes_ts, re.S)}
    item_grid = {int(i): [int(a), int(b), int(c)] for i, a, b, c in
                 re.findall(r"id: (\d+), models: \[[^\]]*\], grid: \[(\d+), (\d+), (\d+)\]", items_ts)}
    counts = lambda txt: [[int(i), int(n)] for i, n in re.findall(r'itemsMap\.get\((\d+)\)!?, count: (\d+)', txt)]

    items = load_js(os.path.join(ROOT, 'js', 'items.js'), 'DSPItems')
    es_item = {**{int(k): v for k, v in items['MATERIALS'].items()}, **{int(k): v['name'] for k, v in items['BUILDINGS'].items()}}
    es_recipe = {int(k): v for k, v in items['RECIPES'].items()}

    out, missing = {}, []
    for rid, zh, ticks, frm, to in blocks:
        rid = int(rid)
        products = [int(x) for x in re.findall(r'itemsMap\.get\((\d+)\)', to)]
        p = products[0] if products else 0
        en_name = en.get(zh, zh)
        en_prod = en.get(item_zh.get(p, ''), en_name)
        if p in (6001, 6002, 6003, 6004, 6005, 6006): group = 'lab'
        elif rid == 115: group = 'fract'
        elif rid in SMELT: group = 'smelt'
        elif rid in REFINE: group = 'refine'
        elif rid in CHEM: group = 'chem'
        elif rid in COLLIDER: group = 'collider'
        else: group = 'asm'
        # nombre: el de la receta si lo conocemos en español; si es la receta normal del producto, el del producto
        name = es_recipe.get(rid) or (es_item.get(p) if en_name == en_prod else None) or en_name
        entry = {'name': name, 'en': en_name, 'group': group, 'product': p}
        if len(products) > 1: entry['products'] = products   # varios productos (refinería, planta química…)
        # tiempo en segundos a velocidad x1 y cantidades de entrada y salida: [[objeto, cantidad], ...]
        entry['time'] = int(ticks) / 60
        entry['in'] = counts(frm)
        entry['out'] = counts(to)
        if rid in grid: entry['grid'] = grid[rid]
        icon = next((f'icons/recipes/{rid}.{e}' for e in ('png', 'webp') if os.path.exists(os.path.join(ROOT, 'icons', 'recipes', f'{rid}.{e}'))), None)
        if icon: entry['icon'] = icon
        else: missing.append({'id': rid, 'names': list(dict.fromkeys([en_name.strip(' -'), en_prod]))})
        out[rid] = entry

    with open(os.path.join(ROOT, 'js', 'recipes.js'), 'w', encoding='utf-8') as f:
        f.write('/* Recetas de DSP (tools/gen_recipes.py). id: nombre, nombre en inglés, grupo de edificio, producto\n'
                '   (products: todos, si hay más de uno), icono, time (segundos a velocidad x1), in/out ([[objeto, cantidad], ...]),\n'
                '   grid: [página, fila, columna] en la ventana de recetas del juego. DSPItemGrid: lo mismo para objetos. */\n')
        text = json.dumps(out, ensure_ascii=False, indent=0)
        # listas en una sola línea: "in": [[1001,1],[1002,2]], "products": [1120,1114]
        flat = lambda m: '[' + m.group(1).replace('\n', '') + ']'
        text = re.sub(r'\[\n([^\[\]{}]*?)\n\]', flat, text)
        text = re.sub(r'\[\n((?:\[[^\]]*\],?\n?)+?)\n?\]', flat, text)
        f.write("(typeof window !== 'undefined' ? window : globalThis).DSPRecipes = " + text + ';\n')
        # posición de cada objeto en la ventana de objetos del juego (selector de filtros, distribuidor…)
        f.write("(typeof window !== 'undefined' ? window : globalThis).DSPItemGrid = "
                + json.dumps({str(k): v for k, v in sorted(item_grid.items())}, separators=(',', ':')) + ';\n')
    print(f'{len(out)} recetas, {sum("icon" in e for e in out.values())} con icono')
    if missing:
        # La wiki bloquea descargas automáticas: los iconos que faltan se bajan desde el navegador
        # (tools/fetch_icons.js) con esta lista.
        json.dump(missing, open(os.path.join(ROOT, 'tools', 'missing_icons.json'), 'w', encoding='utf-8'))
        print(f'{len(missing)} sin icono -> tools/missing_icons.json')


if __name__ == '__main__':
    main()
