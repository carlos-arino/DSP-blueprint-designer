// Vuelca los edificios de un blueprint como JSON (lo usa tools/sprites_from_screenshot.py)
const fs = require('fs');
const BP = require('../js/codec.js');
BP.parse(fs.readFileSync(process.argv[2], 'utf8')).then((bp) => {
  process.stdout.write(JSON.stringify(bp.buildings.map((b) => ({
    id: b.itemId, model: b.modelIndex, x: b.x, y: b.y, yaw: b.yaw, recipe: b.recipeId,
  }))));
});
