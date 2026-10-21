// Prints every room's real coordinates and its exits as JSON, for tools/build_geodata.py.
'use strict';
const { buildWorld } = require('../js/world.js');
const w = buildWorld();
const out = { rooms: {}, sites: w.mapSites };
for (const [id, r] of Object.entries(w.rooms)) {
  if (!r.map || !r.map.at) continue;
  const exits = [];
  for (const [dir, exit] of Object.entries(r.exits)) {
    if (typeof exit === 'object' && typeof exit.to === 'function') continue;
    const to = typeof exit === 'string' ? exit : exit.to;
    exits.push({ dir, to, road: !!(typeof exit === 'object' && exit.drive) });
  }
  out.rooms[id] = { at: r.map.at, site: r.map.site, exits };
}
process.stdout.write(JSON.stringify(out));
