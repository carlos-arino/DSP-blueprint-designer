# DSP Blueprint Designer

Editor web de blueprints de **Dyson Sphere Program**. Sin dependencias ni compilación.

## Uso

Abre `index.html` en Chrome o Edge (doble clic), o sirve la carpeta:

```bash
python tools/serve.py
```

- **Abrir carpeta**: elige `Documentos\Dyson Sphere Program\Blueprint`. Así puedes abrir y guardar directamente en la carpeta del juego.
- **Pegar código** o pulsar Ctrl+V con un código `BLUEPRINT:` en el portapapeles.
- **Copiar código**: copia el resultado para pegarlo en el juego.

### Atajos

| Tecla | Acción |
|---|---|
| Clic / Ctrl+clic / arrastrar en vacío | Seleccionar / añadir / selección por caja |
| Mayús+clic en un edificio (y arrastrar sin soltar) | Copiarlo con su receta y sus clasificadores; arrastrando se ponen copias en fila (las que chocan se saltan) |
| Arrastrar selección, flechas (Mayús = 5) | Mover (los clasificadores enganchados van con el edificio; si su otro extremo no se mueve, quedan sueltos) |
| Doble clic | Toda la línea de cinta, o todos los edificios iguales |
| R | Girar 90° (selección o fantasma al colocar). Con la herramienta de cinta: el codo en diagonal empieza por el otro lado |
| + / − | Altura de la cinta (también a mitad de trazado: sube o baja en esa casilla) |
| E | Elegir receta de lo seleccionado |
| Supr | Borrar |
| Ctrl+C / X / V / D | Copiar / cortar / pegar / duplicar |
| Ctrl+Z / Y | Deshacer / rehacer |
| Ctrl+S | Guardar |
| F | Encuadrar |
| Botón derecho/central o Espacio+arrastrar, rueda | Desplazar, zoom |

La paleta sigue los grupos del menú de construcción del juego (Power, Collecting, Logistics, Storage, Production, Transportation, Defense, Research & Dyson Sphere) con el nombre en inglés y el icono de la wiki (`icons/buildings/`). Clic en un grupo para plegarlo o desplegarlo; el buscador acepta inglés, español o número. Las ensambladoras Mk.I/II/III se pintan en amarillo, verde y azul, como cintas y clasificadores; el clasificador apilador, en blanco. Recompositora, hornos de plano y negentropía, planta química cuántica y laboratorio autoevolutivo usan la geometría de su equivalente (modelos de `huww98/dsp_blueprint_editor`).

En la paleta, las cintas activan la herramienta de trazado (arrastra para hacer una línea en L, se conecta a cintas existentes). El resto de edificios se colocan con clic.

El botón **🧹 Limpiar** borra los clasificadores a los que les falta el inicio o el fin.

## Sprites y geometría

- `js/geometry.js`: huella y huecos de clasificador de cada edificio, medidos en tus blueprints (cientos de clasificadores) y en `Ejemplos/pruebas`.
- `sprites/` + `js/sprites.js`: imágenes recortadas de capturas del juego. Para sacarlas de una captura nueva:

```bash
python tools/sprites_from_screenshot.py Ejemplos/pruebas/edificios.txt Ejemplos/pruebas/edificios.png Ejemplos/pruebas/edificios.points.json
```

El `.points.json` tiene al menos 4 puntos a ras de suelo (torres Tesla, divisores…) con su posición en el blueprint y su píxel en la captura. Con ellos se endereza la captura a vista cenital y se recorta cada edificio.

## Alturas

- Las cintas tienen nivel (`z`): 0 suelo, 1 elevada… Las elevadas se dibujan encima, más estrechas y con borde claro. Una subida o bajada son dos cintas en la misma casilla, marcadas con ▲/▼ y el nivel de destino.
- El selector **Altura** de la barra (o RePág/AvPág) elige el nivel: las cintas nuevas se trazan a ese nivel y lo demás se atenúa. Con "todas" se trazan en el suelo.
- **Subir o bajar:** mientras arrastras una cinta, pulsa **+** para subir un nivel o **−** para bajar (también RePág/AvPág), y sigue arrastrando. En esa casilla quedan dos cintas, una por nivel, como en el juego. También vale empezar una cinta sobre el final de otra de distinto nivel, o terminarla sobre su principio.

## Divisor

Ocupa 1 casilla y tiene 3 variantes (modelo), con Tab al colocarlo o con el desplegable del inspector:

| Modelo | Puertos (hueco: lado, nivel) |
|---|---|
| 38 | 0 N, 1 E, 2 S, 3 O, todos en el suelo |
| 39 | 0 N suelo, 1 N elevado, 2 S suelo, 3 S elevado |
| 40 | 0 N elevado, 1 E suelo, 2 S elevado, 3 O suelo |

Los puertos 1 y 3 del 38 y el 0 del 40 están deducidos, no medidos.

## Puertos de cinta

Los puntos de entrada/salida de cinta se ven siempre (tenues; resaltados con la herramienta de cinta): flechas en los puertos y una franja discontinua en los carriles de las torretas (fila de munición). Con la herramienta de cinta, los puertos se ven como flechas (azules en el suelo, blancas elevadas; atenuadas si no son del nivel actual). Una cinta que empieza o acaba en la casilla de un puerto, en su sentido, se engancha a él y su último tramo queda en la posición exacta del puerto (`js/geometry.js`, `DSPBeltPorts`):

| Edificio | Puertos |
|---|---|
| Divisor, apilador | a 0,2 del centro |
| Estación planetaria / interestelar | 12, a 2,15 del centro (3 por lado, a −1, 0, +1) |
| Fraccionador | norte, este y oeste, a 1,1 |
| Intercambiador de energía | 4, a 2,3 |
| Receptor de rayos | norte y sur, a 1,12 |

## Apilado

Al colocar un almacén, tanque, laboratorio o distribuidor encima de otro compatible, se apila solo (`DSPStack`): almacén Mk.I sobre almacén o divisor (+2), Mk.II (+3), tanque (+3), laboratorio (+3) y distribuidor sobre almacén (+1,87). El de arriba apunta al de abajo como entrada. Las pilas llevan una insignia ×N.

## Plantillas

`node tools/gen_templates.js` regenera `js/templates.js` (modelo, parámetros y huecos por defecto de cada edificio) a partir de `Ejemplos/`. Las variantes (ensambladoras Mk.II/III y recompositora, hornos de plano y negentropía, planta química cuántica, laboratorio autoevolutivo, cinta Mk.III y clasificador apilador) copian a su equivalente con su propio modelo.

## Recetas

El selector de receta del inspector muestra el dibujo de cada una, filtrado por edificio; el buscador acepta el nombre en español o en inglés. Los datos están en `js/recipes.js` y los dibujos en `icons/recipes/` (de la wiki de Fandom). Se generan con `python tools/gen_recipes.py`. La wiki no deja descargar los iconos por script: los que falten se listan en `tools/missing_icons.json` y hay que bajarlos desde el navegador.

## Choques

`js/collision.js` da a cada edificio un rectángulo y no deja colocar, mover, pegar ni trazar nada que choque (la acción se deshace y avisa; el fantasma sale en rojo antes). Si el blueprint abierto ya trae choques, se marcan pero no impiden seguir. Es aproximado:

- los clasificadores no chocan; las cintas no chocan entre sí;
- divisor, monitor, apilador y distribuidor admiten cintas debajo;
- los edificios son altos: una cinta elevada también choca con ellos, salvo por un carril de su nivel;
- pulverizador: la cinta del producto lo recorre a nivel 0 por el centro (entra por los lados estrechos) y la del proliferador lo cruza a nivel 1 por una sola fila, a una casilla del centro; por ningún otro sitio;
- en estaciones, intercambiador de energía, fraccionador, receptor de rayos, torretas (también la de plasma SR) y torre de interferencias la cinta solo puede entrar por sus carriles de entrada/salida (en las torretas, la fila central, por donde entra la munición);
- piezas a distinta altura (almacén sobre divisor) no chocan;
- dos ensambladoras necesitan un hueco de 1 entre ellas (cabe una Tesla);
- estaciones: base de 7×7 con las esquinas recortadas (cabe una Tesla en cada esquina); las cintas solo entran por los carriles de los puertos.

`node test/collisions.js` comprueba que ningún ejemplo de `Ejemplos/` da avisos, más unos casos sintéticos.

## Clasificadores

Elige un clasificador en la paleta y arrastra desde el origen (una cinta o un hueco) hasta el destino. Los huecos se ven como puntos (rellenos = ocupados). Horno y ensambladora tienen 6: 3 al norte y 3 al sur. Se rellenan solos el hueco, la longitud (1–3) y el desplazamiento sobre la cinta (`floor(20 × distancia a lo largo de la cinta)`).

## Formato (resumen)

```
BLUEPRINT:<cabecera>"<base64(gzip(binario))>"<MD5F>
```

- **MD5F**: MD5 con estado inicial `B=0xEFDCAB89`, `D=0x10325746` y 7 constantes K modificadas (`js/codec.js`). Se calcula sobre todo el texto hasta la última comilla.
- **Cabecera** (0.10.x): `1,layout,icono×5,0,ticks,versión,nombre,,,,descripción` (textos urlencoded).
- **Binario**: meta (7×int32), áreas, edificios. En 0.10.x cada edificio empieza por `-102` y el número de floats de posición depende del tipo: cintas 5 (x,y,z,yaw,tilt), clasificadores 12 (dos posiciones completas), resto 4 (x,y,z,yaw). Después: conexiones, huecos, receta, filtro, parámetros y un int32 extra. Al final del binario van 5 bytes (`01 00000000`).

`node test/roundtrip.js` comprueba que todos los ejemplos de `Ejemplos/` se decodifican y se vuelven a codificar byte a byte.
