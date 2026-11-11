"""Recorta sprites de edificios de una captura del juego, usando su blueprint para calibrar.

Uso:
  python tools/sprites_from_screenshot.py BLUEPRINT.txt CAPTURA.png PUNTOS.json [ITEM_ID ...]

PUNTOS.json: {"points": [{"world": [x, y], "px": [u, v]}, ...]}, al menos 4 puntos a ras de suelo
(torres Tesla, divisores, cintas...) con su posición en el blueprint y su píxel en la captura.

Con esos puntos se calcula una homografía, se endereza la captura a vista cenital
(norte arriba) y se recorta la huella de cada tipo de edificio definida en js/geometry.js
(o en js/items.js si no tiene geometría), girada para que quede con yaw 0.
Genera sprites/ITEM_ID.png y actualiza js/sprites.js. Si no se indican ITEM_ID, recorta todos.
"""
import json, math, os, re, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PX_PER_CELL = 32


def load_js_object(path, name):
    """Lee un objeto JS sencillo (geometry.js / items.js) evaluándolo con node."""
    code = f"require('{path.replace(os.sep, '/')}'); process.stdout.write(JSON.stringify(globalThis.{name}))"
    return json.loads(subprocess.check_output(['node', '-e', code], text=True, encoding='utf-8'))


def homography(points):
    A, B = [], []
    for p in points:
        (x, y), (u, v) = p['world'], p['px']
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    h = np.linalg.lstsq(np.array(A, float), np.array(B, float), rcond=None)[0]
    return np.append(h, 1).reshape(3, 3)


def main():
    bp_path, shot_path, pts_path, *only = sys.argv[1:]
    only = {int(i) for i in only}
    buildings = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'dump.js'), bp_path], text=True, encoding='utf-8'))
    points = json.load(open(pts_path, encoding='utf-8'))['points']
    H = homography(points)
    err = []
    for p in points:
        q = H @ [*p['world'], 1]
        err.append(math.hypot(q[0] / q[2] - p['px'][0], q[1] / q[2] - p['px'][1]))
    print(f'calibración: error máx {max(err):.1f}px, medio {sum(err) / len(err):.1f}px')

    geo = load_js_object(os.path.join(ROOT, 'js', 'geometry.js'), 'DSPGeometry')
    items = load_js_object(os.path.join(ROOT, 'js', 'items.js'), 'DSPItems')['BUILDINGS']

    # captura enderezada: mundo -> píxel de salida (norte arriba)
    xs = [b['x'] for b in buildings]; ys = [b['y'] for b in buildings]
    x0, x1, y0, y1 = math.floor(min(xs)) - 6, math.ceil(max(xs)) + 6, math.floor(min(ys)) - 6, math.ceil(max(ys)) + 6
    k = PX_PER_CELL
    M = np.array([[1 / k, 0, x0], [0, -1 / k, y1], [0, 0, 1]])
    T = H @ M; T = T / T[2, 2]
    shot = Image.open(shot_path).convert('RGBA')
    rect = shot.transform((int((x1 - x0) * k), int((y1 - y0) * k)), Image.PERSPECTIVE, tuple(T.flatten()[:8]), Image.BICUBIC)

    sprites_js = os.path.join(ROOT, 'js', 'sprites.js')
    data = {}
    if os.path.exists(sprites_js):
        m = re.search(r'=\s*(\{.*\});', open(sprites_js, encoding='utf-8').read(), re.S)
        if m: data = json.loads(m.group(1))

    done = set()
    for b in buildings:
        bid = b['id']
        if bid in done or (only and bid not in only) or bid < 2020 or bid in (2201, 2202):
            continue
        g = geo.get(str(bid)) or items.get(str(bid))
        if not g:
            continue
        w, h, ox, oy = g['w'], g['h'], g.get('ox', 0), g.get('oy', 0)
        a = math.radians(b['yaw'])
        # centro de la huella en el mundo (el desplazamiento local gira con el edificio)
        cx = b['x'] + ox * math.cos(a) + oy * math.sin(a)
        cy = b['y'] - ox * math.sin(a) + oy * math.cos(a)
        px, py = (cx - x0) * k, (y1 - cy) * k
        r = math.hypot(w, h) * k / 2 + 2
        big = rect.crop((round(px - r), round(py - r), round(px + r), round(py + r)))
        big = big.rotate(b['yaw'], resample=Image.BICUBIC)  # deja el edificio con yaw 0
        c = big.width / 2
        sprite = big.crop((round(c - w * k / 2), round(c - h * k / 2), round(c + w * k / 2), round(c + h * k / 2)))
        out = os.path.join(ROOT, 'sprites', f'{bid}.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sprite.save(out)
        data[str(bid)] = {'src': f'sprites/{bid}.png', 'w': w, 'h': h, 'ox': ox, 'oy': oy}
        done.add(bid)
        print(f'  {bid} {items.get(str(bid), {}).get("name", "")}: {sprite.width}x{sprite.height}')

    with open(sprites_js, 'w', encoding='utf-8') as f:
        f.write('/* Sprites de edificios recortados de capturas del juego (tools/sprites_from_screenshot.py). Medidas en casillas. */\n')
        f.write('window.DSPSprites = ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n')


if __name__ == '__main__':
    main()
