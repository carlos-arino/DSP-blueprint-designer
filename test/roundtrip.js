// Prueba de ida y vuelta con todos los blueprints de Ejemplos/
// Uso: node test/roundtrip.js [carpeta]
const fs = require('fs');
const path = require('path');
const BP = require('../js/codec.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.txt') ? [path.join(dir, e.name)] : []);
}

(async () => {
  const dir = process.argv[2] || path.join(__dirname, '..', 'Ejemplos');
  let fail = 0;
  for (const f of walk(dir)) {
    const text = fs.readFileSync(f, 'utf8');
    try {
      const bp = await BP.parse(text);
      const bin = BP.encodeBinary(bp);
      const same = Buffer.compare(Buffer.from(bin), Buffer.from(bp.rawBinary)) === 0;
      const out = await BP.stringify(bp);
      const bp2 = await BP.parse(out);
      const headerSame = out.split('"')[0] === text.trim().split('"')[0];
      const ok = bp.hashOk && same && bp2.hashOk && headerSame &&
        Buffer.compare(Buffer.from(bp2.rawBinary), Buffer.from(bp.rawBinary)) === 0;
      if (!ok) fail++;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${path.relative(dir, f)}  edificios=${bp.buildings.length} hash=${bp.hashOk} binIgual=${same} cabeceraIgual=${headerSame} reHash=${bp2.hashOk}`);
    } catch (e) {
      fail++;
      console.log(`ERR  ${f}: ${e.message}`);
    }
  }
  process.exit(fail ? 1 : 0);
})();
