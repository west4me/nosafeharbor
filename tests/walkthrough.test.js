/*
 * Automated playthrough tests for No Safe Harbor.
 * Run with:  node tests/walkthrough.test.js   (or: npm test)
 *
 * No dependencies. Each test spins up a fresh game, feeds it commands,
 * and checks the output and state.
 */
'use strict';

const assert = require('node:assert/strict');
const { buildWorld } = require('../js/world.js');
const { Game } = require('../js/engine.js');
const { renderMap, mapModel } = require('../js/map.js');
const { renderNotebook, notebookModel } = require('../js/notebook.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function newGame() {
  const g = new Game(buildWorld);
  g.start();
  return g;
}

// Run a command and return its output as one string.
function run(g, cmd) {
  return g.command(cmd).map((b) => b.text).join('\n');
}

function runAll(g, cmds) {
  let last = '';
  for (const c of cmds) last = run(g, c);
  return last;
}

// Get the truck keys out of the lockbox at the ferry terminal.
const KEYS = ['read case file', 'enter 1187', 'take keys'];

// The optimal route through the whole game.
const WALKTHROUGH = [
  'read case file',
  // Hollis: keys, then the flashlight from the glovebox
  ...KEYS, 'get in truck', 'open glovebox', 'take flashlight',
  // To Craig harbormaster
  'w', 'w', 's', 'w', 'n',
  'talk to joe', 'read report', 'ask joe about weather',
  // Fuel dock
  's', 'w', 'ask kenzie about rick', 'search barrel', 'take receipt', 'read receipt',
  // Tavern
  'e', 'e', 'e', 'buy beer', 'give beer to cal',
  // Lodge
  'w', 's', 's', 'talk to rick', 'examine rod rack',
  'e', 'talk to marnie', 'ask marnie about rod', 'w',
  's', 'examine skiff', 'n',
  'w', 'take photo', 'read photo', 'dial 14 3 28',
  'take all', 'read notice', 'read napkin',
  'open drawer', 'take map', 'read map',
  // Back up through Craig to Klawock, Big Salt Road to Control Lake, then east to the Thorne trailhead
  'e', 'n', 'n', 'n', 'ne', 'e',
  'turn on flashlight', 'ne', 'ne', 'wear waders', 'ne',
  // The Thorne cabin is empty, but Rick left a note
  'read note',
  // Back to Control Lake, then the long road north past Sweetwater to Coffman Cove and Hazel's store
  'sw', 'sw', 'sw', 'w', 'n', 'ne',
  'n', 'talk to hazel', 's',
  // Sweetwater: back southwest to the pullout, down the trail to the landing, row north to the cabin
  'sw', 'w', 'n', 'n',
  'talk to dale',
  // Over to the troopers in Klawock
  'drive to klawock', 'w',
  'accuse dale and rick'
];

// ------------------------------------------------------------------ tests

test('starts at the Hollis ferry terminal with the intro', () => {
  const g = new Game(buildWorld);
  const out = g.start().map((b) => b.text).join('\n');
  assert.match(out, /NO SAFE HARBOR/);
  assert.match(out, /Hollis Ferry Terminal/);
  assert.equal(g.state.loc, 'ferry');
});

test('full walkthrough wins with a perfect score', () => {
  const g = newGame();
  const out = runAll(g, WALKTHROUGH);
  assert.match(out, /THE CASE IS CLOSED/);
  assert.equal(g.state.over, true);
  assert.equal(g.state.score, g.world.maxScore);
  assert.equal(g.world.maxScore, 100);
  assert.match(out, /Master Investigator/);
});

test('every clue is reachable during the walkthrough', () => {
  const g = newGame();
  runAll(g, WALKTHROUGH);
  for (const id of Object.keys(g.world.clues)) {
    assert.ok(g.has(id), `clue "${id}" was never found`);
  }
});

test('every room exit points at a real room', () => {
  const g = newGame();
  for (const [id, r] of Object.entries(g.rooms)) {
    for (const [dir, exit] of Object.entries(r.exits)) {
      const to = g.exitTo(exit);
      assert.ok(g.rooms[to], `${id} --${dir}--> ${to} is not a room`);
    }
  }
});

test('every item starts in a valid location', () => {
  const g = newGame();
  for (const [id, st] of Object.entries(g.state.items)) {
    const loc = st.loc;
    const ok = loc === null || loc === 'inv' || g.rooms[loc] || g.items[loc];
    assert.ok(ok, `item ${id} has unknown location ${loc}`);
  }
});

test('the old-growth trail is pitch dark without a light', () => {
  const g = newGame();
  const out = runAll(g, [...KEYS, 'w', 'w', 'ne', 'e', 'ne']);
  assert.match(out, /pitch dark/);
  assert.match(run(g, 'ne'), /need a light/);
  assert.equal(g.state.loc, 'river_trail');
  // Retreating back the way you came is always allowed.
  run(g, 'sw');
  assert.equal(g.state.loc, 'trailhead');
});

test('turning on the flashlight in the dark reveals the room', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'w', 'w', 'ne', 'e', 'ne']);
  const out = run(g, 'turn on flashlight');
  assert.match(out, /Old-Growth Trail/);
});

test('the Thorne cannot be forded without wearing waders', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'w', 'ne', 'e', 'ne', 'ne']);
  assert.equal(g.state.loc, 'ford');
  assert.match(run(g, 'ne'), /You need waders/);
  assert.equal(g.state.loc, 'ford');
});

test('the office is locked until Marnie hands over the key', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 's', 's']);
  assert.equal(g.state.loc, 'lodge');
  assert.match(run(g, 'w'), /locked/);
  runAll(g, ['e', 'talk to marnie', 'w']);
  assert.match(run(g, 'w'), /unlock the office door/);
  assert.equal(g.state.loc, 'office');
});

test('wrong safe combination keeps it shut', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 's', 's', 'e', 'talk to marnie', 'w', 'w']);
  assert.match(run(g, 'dial 1 2 3'), /stays shut/);
  assert.match(run(g, 'open safe'), /will not budge/);
  assert.match(run(g, 'turn dial to 14-3-28'), /swings open/);
});

test('Dale stonewalls without enough evidence', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'w', 's', 'e', 'buy beer', 'give beer to cal',
    'w', 'n', 'ne', 'n', 'ne', 'n', 'talk to hazel', 's', 'sw', 'w', 'n', 'n']);
  assert.equal(g.state.loc, 'sweetwater_cabin');
  assert.match(run(g, 'talk to dale'), /Name's Bill/);
  assert.equal(g.flag('dale_confessed'), false);
});

test('accusing the wrong person does not end the game', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 'w']);
  assert.equal(g.state.loc, 'trooper');
  assert.match(run(g, 'accuse marnie'), /Try again/);
  assert.equal(g.state.over, false);
  assert.match(run(g, 'accuse dale and rick'), /Theories don't get warrants/);
  assert.equal(g.state.over, false);
});

test('accusing outside the trooper post is redirected', () => {
  const g = newGame();
  assert.match(run(g, 'accuse rick'), /Reyes/);
});

test('warrant ending is reachable without finding Dale', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'w', 'w', 'take receipt', 'read receipt', 'e', 'e', 's', 's', 'e', 'talk to marnie', 'w', 'w',
    'take photo', 'read photo', 'dial 14 3 28', 'take napkin', 'read napkin', 'e', 'n', 'n', 'n', 'w']);
  const out = run(g, 'accuse rick and dale');
  assert.match(out, /warrant/);
  assert.equal(g.state.over, true);
  assert.ok(g.state.score < g.world.maxScore);
});

test('save and load round-trips state', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'w']);
  run(g, 'save');
  runAll(g, [...KEYS, 'w', 's']);
  assert.equal(g.state.loc, 'craig');
  assert.match(run(g, 'load'), /Game restored/);
  assert.equal(g.state.loc, 'hwy');
  assert.ok(g.inInv('flashlight'));
});

test('parser handles synonyms and multi-commands', () => {
  const g = newGame();
  assert.match(run(g, 'x truck'), /ISLAND AUTO RENTAL/);
  assert.match(run(g, 'look at the terminal building'), /lockbox/);
  run(g, 'read file. punch in 1187. get keys. climb into the pickup');
  assert.equal(g.state.loc, 'truck_cab');
  assert.match(run(g, 'look at the glovebox'), /glovebox/);
  run(g, 'open glove box. get torch');
  assert.ok(g.inInv('flashlight'));
  assert.match(run(g, 'i'), /flashlight/);
  assert.match(run(g, 'go west'), /Highway/);
  assert.match(run(g, 'blorf'), /I don't know how/);
});

test('game refuses commands after the case is closed, except restart', () => {
  const g = newGame();
  runAll(g, WALKTHROUGH);
  assert.match(run(g, 'n'), /case is closed/);
  run(g, 'restart');
  assert.equal(g.state.over, false);
  assert.equal(g.state.loc, 'ferry');
  assert.equal(g.state.score, 0);
});

test('hint directions start from where you are, and get you there', () => {
  // Before you've seen the harbormaster, the hint leads to his office. Try it from every place on the island.
  const probe = newGame();
  for (const rid of Object.keys(probe.rooms)) {
    if (rid === 'truck_cab') continue;
    const g = newGame();
    runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'get out']);
    g.moveItem('waders', 'inv'); g.state.items.waders.worn = true;
    g.moveItem('oars', 'inv');
    g.state.loc = rid;
    g.moveItem('truck', ['river_trail', 'ford', 'cabin'].includes(rid) ? 'trailhead'
      : ['sweetwater_landing', 'sweetwater_lake', 'sweetwater_cabin'].includes(rid) ? 'sweetwater_turnoff'
      : ['lodge', 'kitchen', 'office', 'boathouse'].includes(rid) ? 'lodge_road'
      : ['harbor', 'harbormaster', 'fuel_dock', 'tavern'].includes(rid) ? 'craig'
      : ['trooper', 'totem_park'].includes(rid) ? 'klawock'
      : ['cove_store', 'cove_harbor'].includes(rid) ? 'coffman_cove' : rid);
    const h = run(g, 'hint');
    const m = h.match(/From here: (.*?)\. /);
    if (rid === 'harbormaster') { assert.ok(!m, h); continue; }
    assert.ok(m, `${rid}: ${h}`);
    for (const step of m[1].split(', then ')) run(g, step.split(' ')[0].toLowerCase());
    assert.equal(g.state.loc, 'harbormaster', `${rid}: ${h}`);
  }
});

test('when the game asks "did you mean...?", YES, NO or a pick answers it', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'w', 'n']);
  assert.match(run(g, 'talk to jow'), /Did you mean Joe Kitka\?/);
  assert.match(run(g, 'yes'), /insurance investigator/);
  assert.ok(g.state.met.joe);
  assert.match(run(g, 'yes'), /Nobody asked you anything/);
  assert.match(run(g, 'x jow'), /Did you mean Joe Kitka\?/);
  assert.match(run(g, 'no'), /never mind/);
  assert.match(run(g, 'lok'), /Did you mean LOOK\?/);
  assert.match(run(g, 'y'), /Harbormaster's Office/);
  assert.match(run(g, 'taek report'), /TAKE or TALK/);
  assert.match(run(g, 'take'), /already have/);
  // Any other command just moves on.
  run(g, 'x jow');
  assert.match(run(g, 'look'), /Harbormaster's Office/);
  assert.match(run(g, 'yes'), /Nobody asked/);
  // Picking from "Which do you mean"
  const h = newGame();
  runAll(h, [...KEYS, 'get in truck', 'open glovebox']);
  const which = run(h, 'take the');
  if (/Which do you mean/.test(which)) assert.ok(h.pendingAnswer);
  assert.match(run(h, 'get out'), /climb out/);
  runAll(h, ['w', 'w', 's', 'w', 'n']);
  assert.match(run(h, 'get in truck'), /parked back at Craig/);
});

test('"Talk to whom?", "Accuse whom?" and "Where to?" take a name or a place as the answer', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'e']);
  assert.match(run(g, 'talk'), /Talk to whom\?/);
  assert.match(run(g, 'cal'), /Insurance\. Great/);
  assert.match(run(g, 'thanks'), /Thank whom\?/);
  assert.match(run(g, 'bonnie'), /.+/);
  assert.match(run(g, 'accuse'), /Accuse whom\?/);
  assert.match(run(g, 'rick'), /not a cop/);
  runAll(g, ['w', 'get in truck']);
  assert.match(run(g, 'start truck'), /Where to\?/);
  run(g, 'klawock');
  assert.equal(g.state.loc, 'klawock');
});

test('hint is always available and never empty', () => {
  const g = newGame();
  for (const c of WALKTHROUGH.slice(0, -1)) {
    const h = run(g, 'hint');
    assert.ok(h.length > 10, `empty hint before "${c}"`);
    run(g, c);
  }
});

// ------------------------------------------------------------------ map

const { geo } = require('../js/geodata.js');
const { project } = require('../js/map.js');

// Even-odd point-in-polygon over the map's sea rings (in map pixels).
function inSea([x, y]) {
  let inside = false;
  for (const poly of geo.sea) {
    for (const r of poly) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

test('every room is pinned at real coordinates on the map', () => {
  const g = newGame();
  for (const [id, r] of Object.entries(g.rooms)) {
    if (r.mapAs) continue; // the truck cab shows up wherever the truck is parked
    assert.ok(r.map && r.map.at, `${id} has no coordinates`);
    const [x, y] = project(r.map.at);
    assert.ok(x > 0 && x < geo.width && y > 0 && y < geo.height, `${id} is off the map`);
    assert.ok(g.world.mapSites[r.map.site], `${id} is in unknown site ${r.map.site}`);
  }
});

test('every place is on land, not out in the ocean', () => {
  const g = newGame();
  for (const [id, r] of Object.entries(g.rooms)) {
    if (!r.map || !r.map.at) continue;
    assert.equal(inSea(project(r.map.at)), false, `${id} is in the sea`);
  }
});

test('exit directions agree with real geography', () => {
  const g = newGame();
  const BEARING = { north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315 };
  for (const [id, r] of Object.entries(g.rooms)) {
    if (!r.map || !r.map.at) continue;
    for (const [dir, exit] of Object.entries(r.exits)) {
      if (!(dir in BEARING)) continue;
      const to = g.rooms[g.exitTo(exit)];
      const [ax, ay] = project(r.map.at);
      const [bx, by] = project(to.map.at);
      if (ax === bx && ay === by) continue; // rooms inside the same town
      const real = (Math.atan2(bx - ax, ay - by) * 180 / Math.PI + 360) % 360;
      const off = Math.abs(((real - BEARING[dir]) + 540) % 360 - 180);
      assert.ok(off <= 67.5, `${id} --${dir}--> ${to.id} really lies at bearing ${Math.round(real)}°`);
    }
  }
});

test('every road in the game follows a real route on the road network', () => {
  const g = newGame();
  for (const [id, r] of Object.entries(g.rooms)) {
    for (const exit of Object.values(r.exits)) {
      if (typeof exit !== 'object' || !exit.drive) continue;
      const key = [id, exit.to].sort().join('|');
      assert.ok(geo.routes[key], `no real route for ${key}`);
      assert.ok(geo.routes[key].line.length >= 4, `route ${key} is empty`);
    }
  }
  // Sanity-check a couple of real distances (km) against the driving text.
  assert.ok(Math.abs(geo.routes['klawock|thorne_road'].km - 26.6) < 2, 'Big Salt Road should be about 16 miles');
  assert.ok(Math.abs(geo.routes['sweetwater_turnoff|thorne_road'].km - 45.5) < 3, 'Control Lake to Sweetwater should be about 28 miles');
});

test('map starts with only the ferry dock, marked as you are here', () => {
  const g = newGame();
  const m = mapModel(g);
  assert.deepEqual(m.rooms.map((r) => r.id), ['ferry']);
  assert.ok(m.rooms[0].here);
  assert.deepEqual(m.stubs.map((s) => `${s.from}>${s.dir}>${s.to}`), ['ferry>west>hwy']);
  assert.deepEqual(m.sites.map((s) => s.id), ['hollis']);
  const svg = renderMap(g);
  assert.match(svg, /^<svg/);
  assert.match(svg, /id="map-you-are-here"/);
  assert.match(svg, /Hollis Ferry/);
  assert.doesNotMatch(svg, /Harris River Bridge|Coffman Cove<\/text>\n<text class="map-site/);
  assert.match(svg, /explored 1 of 29/);
});

test('map pencils in visited places and the real roads between them', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's']);
  const m = mapModel(g);
  assert.deepEqual(m.rooms.map((r) => r.id).sort(), ['craig', 'ferry', 'hwy', 'klawock']);
  assert.equal(m.rooms.find((r) => r.here).id, 'craig');
  assert.deepEqual(m.edges.map((e) => e.key).sort(), ['craig|klawock', 'ferry|hwy', 'hwy|klawock']);
  assert.ok(m.edges.every((e) => e.road));
  // Unexplored roads out of places you've been show up as stubs; rooms inside a town don't.
  assert.ok(m.stubs.some((s) => s.from === 'klawock' && s.dir === 'northeast'));
  assert.ok(m.stubs.some((s) => s.from === 'craig' && s.dir === 'south'));
  assert.ok(!m.stubs.some((s) => s.to === 'harbor' || s.to === 'totem_park'));
  // A town lists the spots inside it you've seen, with a "?" for the rest.
  const svg = renderMap(g);
  assert.match(svg, /Front Street/);
  assert.doesNotMatch(svg, /Riptide Tavern/);
});

test('a trail only ever seen in the dark is labeled Dark!', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 'ne', 'e', 'ne']);
  const trail = mapModel(g).rooms.find((r) => r.id === 'river_trail');
  assert.equal(trail.label, 'Dark!');
  // Back out to the truck and all the way to Hollis for the flashlight, then return.
  runAll(g, ['sw', 'w', 'sw', 'e', 'e', 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'w', 'ne', 'e', 'ne']);
  assert.equal(mapModel(g).rooms.find((r) => r.id === 'river_trail').label, 'Old-Growth Trail');
});

test('the map frames where you are and where the roads lead, not the whole sheet', () => {
  const { mapView, wholeView } = require('../js/map.js');
  const g = newGame();
  const inside = (v, [x, y]) => x >= v[0] && x <= v[0] + v[2] && y >= v[1] && y <= v[1] + v[3];
  const start = mapView(g, 1.3);
  assert.ok(inside(start, project(g.rooms.ferry.map.at)), 'you are in the frame');
  assert.ok(start[2] < geo.width * 0.75, 'the opening view is zoomed in, not the whole island');
  assert.ok(Math.abs(start[2] / start[3] - 1.3) < 0.02, 'shaped to the panel');
  assert.ok(start[0] >= 0 && start[1] >= 0 && start[0] + start[2] <= geo.width + 1 && start[1] + start[3] <= geo.height + 1, 'on the sheet');
  runAll(g, [...KEYS, 'w', 'w', 'ne', 'n']);
  // On a tall panel the whole trip fits; on a wide one there's no room, so the frame keeps you in view.
  const tall = mapView(g, 0.6);
  for (const id of ['ferry', 'klawock', 'sweetwater_turnoff']) assert.ok(inside(tall, project(g.rooms[id].map.at)), `${id} is in the frame`);
  assert.ok(inside(mapView(g, 1.8), project(g.rooms.sweetwater_turnoff.map.at)), 'you stay in the frame on a wide panel');
  assert.ok(wholeView(1.3)[2] >= geo.width);
  // In a town, the frame closes in on the town's street sketch.
  run(g, 'ne');
  const town = mapView(g, 1.3);
  assert.ok(inside(town, project(g.rooms.coffman_cove.map.at)));
  assert.ok(town[2] < 16 * geo.view.pxPerKm, 'close enough to read the sketch');
});

test("in town, the map sketches the streets and shows where the truck is; the text says too", () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'w', 'n']);
  const svg = renderMap(g);
  assert.match(svg, /class="map-town-plan"/);
  for (const name of ['Front Street', 'South Cove Harbor', 'Harbormaster']) assert.match(svg, new RegExp(`>${name}<`));
  assert.match(svg, /class="map-truck"/);
  const look = run(g, 'look');
  assert.match(look, /Ways out: SOUTH to South Cove Harbor/);
  assert.match(look, /Your truck is parked at Craig — Front Street \(SOUTH, then EAST\)/);
  assert.match(run(g, 'where is my truck'), /SOUTH, then EAST/);
  run(g, 'walk to truck');
  assert.equal(g.state.loc, 'craig');
  assert.match(run(g, 'walk to truck'), /right here/);
});

test('MAP command signals the UI without using a turn', () => {
  const g = newGame();
  const blocks = g.command('map');
  assert.deepEqual(blocks.map((b) => b.event), ['map']);
  assert.equal(g.state.turns, 0);
  // Reading the topo map is still a different thing.
  assert.match(run(g, 'read map'), /don't see any map/);
});

test('full walkthrough plus a few detours fills in the whole map', () => {
  const g = newGame();
  // The fastest route skips the totem park, the Coffman Cove harbor, Dog Creek and Luck Lake, so detour before accusing.
  runAll(g, [...WALKTHROUGH.slice(0, -1), 'drive to coffman cove', 'e', 'w', 's', 's', 'drive to klawock', 'n', 's', 'w', WALKTHROUGH[WALKTHROUGH.length - 1]]);
  assert.equal(g.state.over, true);
  assert.match(renderMap(g), /explored 29 of 29/);
  assert.equal(mapModel(g).stubs.length, 0);
});

// ------------------------------------------------------------------ the truck and the details

test('you cannot leave Hollis without the truck keys', () => {
  const g = newGame();
  assert.match(run(g, 'w'), /You just need the keys/);
  assert.match(run(g, 'get in truck'), /truck's locked/);
  assert.equal(g.state.loc, 'ferry');
});

test('you need to know about the keypad before you can use it', () => {
  // Never looked at the lockbox, never read the case file: what keypad?
  let g = newGame();
  run(g, 'look at terminal');
  assert.match(run(g, 'enter 1187 into keypad'), /Enter it into what\?/);
  assert.ok(g.itemState('lockbox').locked);
  // Once you've seen the keypad, you can try any code, and a lucky guess works.
  assert.match(run(g, 'x lockbox'), /four-digit keypad/);
  assert.match(run(g, 'enter 1234'), /unhappy beep/);
  assert.match(run(g, 'enter 1187'), /truck keys/);
  // Read the case file first: it tells you where the lockbox is and how to get the code.
  g = newGame();
  run(g, 'read case file');
  assert.match(run(g, 'enter 1187'), /There it is[\s\S]*truck keys/);
});

test('the skiff has to be looked at before its details are', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 's', 's', 's']);
  assert.equal(g.state.loc, 'boathouse');
  assert.match(run(g, 'x lanyard'), /don't see any lanyard/);
  assert.ok(!g.has('lanyard'));
  run(g, 'x skiff');
  assert.ok(g.has('lanyard'));
  assert.match(run(g, 'x lanyard'), /clipped to the boat/);
  assert.match(run(g, 'x plug'), /keeper chain/);
});

test('the lockbox wants the right code', () => {
  const g = newGame();
  run(g, 'read case file');
  assert.match(run(g, 'open lockbox'), /four-digit keypad/);
  assert.match(run(g, 'enter 1234'), /unhappy beep/);
  assert.match(run(g, 'enter 1187'), /truck keys/);
  run(g, 'take keys');
  assert.ok(g.inInv('truck_keys'));
});

test('the glovebox is only reachable from inside the truck', () => {
  const g = newGame();
  assert.match(run(g, 'open glovebox'), /don't see any glovebox/);
  runAll(g, KEYS);
  run(g, 'get in truck');
  assert.equal(g.state.loc, 'truck_cab');
  assert.match(run(g, 'open glovebox'), /flashlight/);
  run(g, 'get out');
  assert.equal(g.state.loc, 'ferry');
});

test('the truck follows you by road and stays put when you walk', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's']);
  assert.equal(g.itemState('truck').loc, 'craig');
  run(g, 'w'); // walk to the harbor
  assert.equal(g.itemState('truck').loc, 'craig');
  assert.match(run(g, 'look'), /South Cove Harbor/);
  assert.doesNotMatch(run(g, 'look'), /rental pickup is parked/);
});

test('DRIVE TO takes you to places you have been, by the shortest route', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'w']);
  assert.match(run(g, 'drive to lodge'), /don't know the way/);
  const out = run(g, 'drive to hollis');
  assert.equal(g.state.loc, 'ferry');
  assert.equal(g.itemState('truck').loc, 'ferry');
  assert.match(out, /climb into the pickup/);
  assert.match(out, /Hollis Ferry Terminal/);
  assert.doesNotMatch(out, /Klawock\n/); // passes through without a full description
});

test('the map circles the parked truck while you sit in it', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'get in truck']);
  assert.equal(mapModel(g).rooms.find((r) => r.here).id, 'hwy');
});

test('rooms answer to the senses', () => {
  const g = newGame();
  assert.match(run(g, 'listen'), /ferry's engine/);
  assert.match(run(g, 'smell'), /diesel/);
  assert.match(run(g, 'sit on bench'), /wet soaks through/);
  assert.match(run(g, 'look at the terminal'), /lockbox/);
  assert.match(run(g, 'x rain'), /nice day/);
  assert.match(run(g, 'get out'), /not in anything/);
});

test('every room has sounds and smells, and something to look at', () => {
  const g = newGame();
  for (const [id, r] of Object.entries(g.rooms)) {
    assert.ok(r.listen, `${id} has no LISTEN text`);
    assert.ok(r.smell, `${id} has no SMELL text`);
    const scenery = Object.values(g.items).filter((it) => it.loc === id && it.fixed);
    assert.ok(scenery.length >= 3, `${id} only has ${scenery.length} things to examine`);
  }
});

test('the boathouse and cabin hold the survival-suit detail', () => {
  const g = newGame();
  g.state.loc = 'boathouse';
  assert.match(run(g, 'x hooks'), /DALE/);
  g.state.loc = 'cabin';
  assert.match(run(g, 'x survival suit'), /HAUGEN/);
});

// ------------------------------------------------------------------ Coffman Cove country

// Keys, flashlight and waders (from Cal in Craig), then Big Salt Road to Control Lake and east to the Thorne trailhead.
const TO_TRAILHEAD = [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight',
  'w', 'w', 's', 'e', 'buy beer', 'give beer to cal', 'w', 'n', 'ne', 'e'];

test('the Thorne cabin is empty, with a note pointing to Sweetwater', () => {
  const g = newGame();
  runAll(g, [...TO_TRAILHEAD, 'ne', 'ne', 'wear waders', 'ne']);
  assert.equal(g.state.loc, 'cabin');
  const look = run(g, 'look');
  assert.match(look, /left in a hurry/);
  assert.doesNotMatch(look, /Dale Haugen/);
  assert.equal(g.has('found_dale'), false);
  assert.match(run(g, 'read note'), /Sweetwater/);
  assert.ok(g.has('rick_note'));
});

test('the real road north: Control Lake to Sweetwater to Coffman Cove, then Dog Creek and Luck Lake', () => {
  const g = newGame();
  runAll(g, TO_TRAILHEAD);
  assert.match(run(g, 'n'), /can't go that way/); // the road north starts back at the junction
  assert.match(run(g, 'w'), /The North Prince of Wales Road heads north/);
  assert.match(run(g, 'n'), /twenty-eight miles/);
  assert.match(run(g, 'ne'), /Dog Creek runs out through the middle of town/);
  assert.match(run(g, 's'), /Dog Creek/);
  assert.match(run(g, 's'), /Luck Lake/);
  assert.equal(g.itemState('truck').loc, 'luck_lake');
});

test('real roads that are not part of the case get a real answer', () => {
  const g = newGame();
  g.state.loc = 'hwy';
  assert.match(run(g, 's'), /Hydaburg/);
  g.state.loc = 'thorne_road';
  assert.match(run(g, 'nw'), /Naukati, Whale Pass/);
});

test('the island has only black bears', () => {
  const g = newGame();
  g.state.loc = 'river_trail';
  const dark = run(g, 'look');
  assert.match(dark, /black bear/);
  assert.doesNotMatch(dark, /brown bear/);
});

test('thank-yous in English, Tlingit and Haida, accents optional', () => {
  const g = newGame();
  g.state.loc = 'totem_park';
  assert.match(run(g, 'say gunalchéesh to walt'), /Most people say it like a sneeze/);
  assert.match(run(g, 'gunalcheesh'), /Most people say it like a sneeze/);
  assert.match(run(g, 'thank you walt'), /adze an inch/);
  assert.match(run(g, "háw’aa"), /That's Haida/);
  g.state.loc = 'harbormaster';
  assert.match(run(g, "haw'aa joe"), /Where'd you pick that up/);
  assert.match(run(g, 'tell joe thanks'), /Thank me when you've found him/);
  g.state.loc = 'ferry';
  assert.match(run(g, 'thanks'), /trees/);
  assert.match(run(g, 'say hello'), /out loud/);
});

test('the poles are treated with respect, and their stories stay with their clans', () => {
  const g = newGame();
  g.state.loc = 'totem_park';
  assert.match(run(g, 'touch poles'), /belong to the families/);
  assert.match(run(g, 'climb totem'), /don't even finish the thought/);
  assert.match(run(g, 'take poles'), /someone's history/);
  assert.match(run(g, 'read plaque'), /Tuxekan/);
  assert.match(run(g, 'ask walt about poles'), /not mine to hand to a stranger/);
  assert.match(run(g, 'ask walt about shuka kaa'), /Man Ahead of Us/);
  assert.match(run(g, 'ask walt about klawock river'), /sockeye/);
  assert.match(run(g, 'ask walt about thorne river'), /trailhead/);
});

test('history and people of the island show up where they belong', () => {
  const g = newGame();
  assert.match(run(g, 'read brochure'), /fourth-largest island/);
  assert.match(run(g, 'read marker'), /Dawson Mine/);
  g.state.loc = 'trailhead';
  assert.match(run(g, 'e'), /Naay I'waans/);
  g.state.loc = 'klawock';
  assert.match(run(g, 'look'), /Heinyaa Ḵwáan/);
  assert.match(run(g, 'x cannery'), /1878/);
  g.state.loc = 'harbormaster';
  assert.match(run(g, 'ask joe about kasaan'), /2016/);
  g.state.loc = 'fuel_dock';
  assert.match(run(g, 'ask kenzie about herring'), /Elders first/);
  g.state.loc = 'cove_store';
  assert.match(run(g, 'ask hazel about thorne bay'), /biggest logging camp/);
  g.state.loc = 'tavern';
  g.flag('cal_talked', true);
  assert.match(run(g, 'ask cal about wolves'), /Alexander Archipelago/);
  assert.match(run(g, 'ask cal about bears'), /black bear/);
});

test('the notebook logs what you do and keeps leads up to date', () => {
  const g = newGame();
  let m = notebookModel(g);
  assert.deepEqual(m.openLeads, ['Read the case file.']);
  assert.match(run(g, 'read case file'), /New lead in your notebook: See the harbormaster/);
  m = notebookModel(g);
  assert.ok(m.doneLeads.includes('Read the case file.'));
  assert.ok(m.openLeads.some((t) => /harbormaster/.test(t)));
  runAll(g, [...KEYS, 'w', 'w', 's', 'w', 'n', 'talk to joe', 'ask joe about weather']);
  m = notebookModel(g);
  assert.ok(m.people.some((p) => p.name === 'Joe Kitka' && /harbormaster/i.test(p.role)));
  assert.ok(m.places.includes('Klawock'));
  const ev = m.log.find((e) => e.kind === 'evidence');
  assert.match(ev.text, /flat calm/);
  assert.match(m.theory, /doesn't add up/);
  assert.ok(m.summary.some((l) => /flat calm/.test(l)));
  assert.ok(!m.openLeads.some((t) => /harbormaster/.test(t)));
  // Turn numbers in the log match the status bar.
  assert.equal(ev.turn, g.state.turns);
  assert.match(run(g, 'notes'), /OPEN LEADS/);
});

test('the notebook renders, and every lead is closed by the end', () => {
  const g = newGame();
  const html0 = renderNotebook(g);
  assert.match(html0, /CASE NOTEBOOK/);
  assert.equal((html0.match(/nb-missing/g) || []).length, 12);
  runAll(g, WALKTHROUGH);
  const m = notebookModel(g);
  assert.deepEqual(m.openLeads, []);
  assert.equal(m.evidence.length, m.evidenceTotal);
  assert.match(m.theory, /Case closed/);
  assert.doesNotMatch(renderNotebook(g), /nb-missing|undefined|NaN/);
  // Opening the notebook is a UI event, not a turn.
  const t = g.state.turns;
  g.command('notebook');
  assert.equal(g.state.turns, t);
});

test('old saves without a notebook still load and get their leads', () => {
  const g = newGame();
  runAll(g, ['read case file', ...KEYS]);
  const saved = JSON.parse(JSON.stringify(g.state));
  delete saved.log; delete saved.met; delete saved.leads;
  g.storage.set('nosafeharbor-save-v2', JSON.stringify(saved));
  run(g, 'load');
  assert.deepEqual(g.state.log, []);
  assert.equal(g.state.leads.keys, 'done');
  assert.equal(g.state.leads.joe, 'open');
});

test('the game autosaves every move, and Continue picks up where you left off', () => {
  const g = newGame();
  assert.equal(g.autosaveInfo(), null);
  runAll(g, ['read case file', ...KEYS, 'w', 'w']);
  const info = g.autosaveInfo();
  assert.equal(info.location, 'Klawock');
  assert.equal(info.turns, g.state.turns);
  // A fresh page load, sharing the same storage.
  const g2 = new Game(buildWorld, { storage: g.storage });
  const out = g2.continueGame().map((b) => b.text).join('\n');
  assert.match(out, /Back on the case/);
  assert.match(out, /Klawock/);
  assert.equal(g2.state.loc, 'klawock');
  assert.ok(g2.inInv('truck_keys') || g2.state.items.truck_keys.loc !== 'lockbox');
  assert.deepEqual(g2.state.log, g.state.log);
  // The autosave is its own slot: it doesn't touch a manual SAVE.
  assert.match(run(g2, 'load'), /No saved game/);
  // A finished case isn't offered to continue.
  g2.state.over = true;
  g2.autosave();
  assert.equal(g2.autosaveInfo(), null);
});

test('the key fob unlocks the truck, and locks it again', () => {
  const g = newGame();
  assert.match(run(g, 'push fob'), /don't see any fob/);
  runAll(g, KEYS);
  assert.match(run(g, 'push fob'), /locks clunk open/);
  assert.ok(g.flag('truck_unlocked'));
  assert.match(run(g, 'press fob'), /locks clunk shut/);
  assert.ok(!g.flag('truck_unlocked'));
  assert.match(run(g, 'get in truck'), /locks clunk open/);
  assert.equal(g.state.loc, 'truck_cab');
  run(g, 'out'); run(g, 'w');
  assert.equal(g.state.loc, 'hwy');
  run(g, 'e');
});

test('typos get fixed when it is clear, and suggested when it is not', () => {
  const g = newGame();
  runAll(g, KEYS);
  assert.match(run(g, 'push pub'), /Did you mean the fob\?/);
  assert.match(run(g, 'x truk'), /The truck, I assume[\s\S]*white pickup/);
  assert.match(run(g, 'sit on bnech'), /The bench, I assume[\s\S]*soaks through/);
  assert.match(run(g, 'raed file'), /Taking that as "read file"[\s\S]*NORTHBOUND/);
  assert.match(run(g, 'taek keys'), /Did you mean TAKE or TALK\?/);
  assert.match(run(g, 'lok'), /Did you mean LOOK\?/);
  assert.match(run(g, 'x zebra'), /You don't see any zebra here\.$/);
  const t = g.state.turns;
  run(g, 'sotuh');
  assert.equal(g.state.loc, 'ferry');
  assert.ok(g.state.turns > t);
});

test('every drive says why you stopped and that you got out, exactly once', () => {
  const probe = newGame();
  for (const [rid, room] of Object.entries(probe.rooms)) {
    for (const [dir, exit] of Object.entries(room.exits || {})) {
      if (!(exit && exit.drive)) continue;
      const g = newGame();
      runAll(g, KEYS);
      g.state.loc = rid;
      g.moveItem('truck', rid);
      const out = run(g, dir);
      assert.equal(g.state.loc, exit.to, `${rid} ${dir}`);
      const outs = out.match(/climb out|ease out of the cab/g) || [];
      assert.equal(outs.length, 1, `${rid} ${dir}: ${out}`);
      assert.match(out, /parked right behind you/, `${rid} ${dir}`);
    }
  }
  // A long DRIVE TO only pulls over once, at the end.
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 'drive to ferry']);
  const out = run(g, 'drive to craig');
  assert.equal(g.state.loc, 'craig');
  assert.equal((out.match(/climb out/g) || []).length, 1, out);
  assert.doesNotMatch(out, /get your bearings/);
});

test("a drive doesn't repeat the description of the place you arrive", () => {
  // No run of four words shared between the drive and the room you pull up in.
  const grams = (t) => {
    const w = t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
    const out = new Set();
    for (let i = 0; i + 3 < w.length; i++) out.add(w.slice(i, i + 4).join(' '));
    return out;
  };
  const probe = newGame();
  for (const [rid, room] of Object.entries(probe.rooms)) {
    for (const [dir, exit] of Object.entries(room.exits || {})) {
      if (!(exit && exit.drive)) continue;
      const g = newGame();
      runAll(g, KEYS);
      g.state.loc = rid;
      g.moveItem('truck', rid);
      const [drive, , roomText] = g.command(dir).map((b) => b.text);
      const shared = [...grams(drive)].filter((x) => grams(roomText).has(x));
      assert.deepEqual(shared, [], `${rid} ${dir}`);
    }
  }
});

test('START TRUCK next to the truck gets you in and starts it; DRIVE to a footpath walks', () => {
  const g = newGame();
  runAll(g, KEYS);
  const out = run(g, 'start truck');
  assert.equal(g.state.loc, 'truck_cab');
  assert.match(out, /engine/);
  assert.ok(g.flag('engine_on'));
  runAll(g, ['w', 'w', 's', 's']);
  assert.equal(g.state.loc, 'lodge_road');
  assert.match(run(g, 'drive south'), /just a short walk/);
  assert.equal(g.state.loc, 'lodge');
});

test('the map always shows the towns and main roads, named, with one clear pin', () => {
  const g = newGame();
  const svg = renderMap(g);
  // Every town is printed from the start, including Craig, before you've been there.
  for (const t of ['Craig', 'Klawock', 'Thorne Bay', 'Coffman Cove', 'Kasaan', 'Hydaburg', 'Naukati Bay', 'Whale Pass']) {
    assert.match(svg, new RegExp(`map-label-town[^>]*>${t}<`), t);
  }
  for (const r of ['Hollis–Klawock Hwy', 'Craig–Klawock Hwy', 'Big Salt Rd', 'Thorne Bay Rd', 'N. Prince of Wales Rd', 'Coffman Cove Rd', 'Hydaburg Hwy', 'Kasaan Hwy']) {
    assert.match(svg, new RegExp(`map-label-road[^>]*>${r}<`), r);
  }
  // Every road in the story is on the sheet, and lies inside it.
  for (const [key, route] of Object.entries(geo.routes)) {
    for (let i = 0; i < route.line.length; i += 2) {
      assert.ok(route.line[i] >= 0 && route.line[i] <= geo.width && route.line[i + 1] >= 0 && route.line[i + 1] <= geo.height, key);
    }
  }
  // One pin, no old circle-and-X, and the key lives in the page instead of the sheet.
  assert.equal((svg.match(/class="map-pin"/g) || []).length, 1);
  assert.doesNotMatch(svg, /map-legend/);
  // Once you've pinned a town yourself, the printed name steps aside for yours.
  runAll(g, [...KEYS, 'w', 'w']);
  assert.doesNotMatch(renderMap(g), /map-label-town[^>]*>Klawock</);
});

test('no rowing to Sweetwater without oars, and Hazel has a spare pair', () => {
  const g = newGame();
  runAll(g, [...TO_TRAILHEAD, 'w', 'n', 'w']);
  assert.equal(g.state.loc, 'sweetwater_landing');
  assert.match(run(g, 'row'), /taken the oars/);
  assert.equal(g.state.loc, 'sweetwater_landing');
  runAll(g, ['e', 'ne', 'n']);
  assert.match(run(g, 'talk to hazel'), /two of everything/);
  assert.ok(g.inInv('oars'));
  assert.ok(g.has('hazel_tip'));
  // You've seen the turnoff, so you can drive to the landing by name even before visiting it.
  runAll(g, ['s', 'drive to sweetwater landing']);
  assert.equal(g.state.loc, 'sweetwater_landing');
  assert.match(run(g, 'row north'), /push off/);
  assert.equal(g.state.loc, 'sweetwater_lake');
  assert.match(run(g, 'n'), /Dale Haugen/);
  assert.ok(g.has('found_dale'));
});

test('Luck Lake remembers Dale and Marnie', () => {
  const g = newGame();
  g.state.loc = 'luck_lake';
  assert.match(run(g, 'x picnic table'), /D\.H\. \+ M\.H\. 1986/);
  g.state.loc = 'kitchen';
  assert.match(run(g, 'ask marnie about luck lake'), /married on the beach at Luck Lake/);
});

// ------------------------------------------------------------------ continuity

const BAD_TEXT = /undefined|\[object|NaN|null\b/;

// Run a command and fail on garbled output. Documents are allowed their aligned columns;
// everything else shouldn't have doubled spaces mid-sentence (a sign of a missing word).
function runClean(g, cmd, where = '') {
  const blocks = g.command(cmd);
  const out = blocks.map((b) => b.text).join('\n');
  assert.ok(out.length > 0 || blocks.some((b) => b.event), `no response to "${cmd}"${where}`);
  assert.doesNotMatch(out, BAD_TEXT, `"${cmd}"${where}: ${out}`);
  for (const b of blocks) {
    if (b.cls === 'document' || b.cls === 'journal' || b.cls === 'help' || b.cls === 'intro') continue;
    assert.doesNotMatch(b.text, /\S  \S/, `doubled space after "${cmd}"${where}: ${b.text}`);
  }
  return out;
}

test('starting the truck is narrated once, not again when you drive', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck']);
  assert.match(run(g, 'start truck'), /second try/);
  assert.match(run(g, 'start truck'), /already running/);
  const drive = run(g, 'drive west');
  assert.doesNotMatch(drive, /turn the key|second try|climb into/);
  assert.match(drive, /ticking as it cools/);
  assert.match(run(g, 'look'), /parked here, beaded with rain/); // a turn later, it has cooled
  const again = run(g, 'drive east');
  assert.match(again, /climb into the pickup\. You turn the key and the engine rattles to life\./);
  assert.doesNotMatch(again, /second try/); // the first start only happens once
});

test('getting out kills the engine, and a running engine is noticed', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'start truck']);
  assert.match(run(g, 'listen'), /engine rattling/);
  assert.match(run(g, 'get out'), /kill the engine and climb out/);
  assert.equal(g.flag('engine_on'), false);
  runAll(g, ['get in truck', 'start truck']);
  assert.match(run(g, 'turn off engine'), /shudders and quits/);
  assert.match(run(g, 'get out'), /You climb out of the pickup/);
});

test('keys left in the cab stay in the ignition and still work', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck']);
  assert.match(run(g, 'drop keys'), /ignition/);
  run(g, 'get out');
  assert.match(run(g, 'w'), /Harris River/);
});

test('the ferry only pulls away at the very start', () => {
  const g = newGame();
  assert.match(run(g, 'look'), /groans away/);
  runAll(g, ['x badge', 'x phone', 'listen', 'smell']);
  assert.doesNotMatch(run(g, 'look'), /groans away/);
});

test('life jackets in the boathouse can be looked at', () => {
  const g = newGame();
  g.state.loc = 'boathouse';
  assert.match(run(g, 'x life jacket'), /HARBOR LIGHT LODGE orange/);
  assert.match(run(g, 'wear life jacket'), /Marnie notices everything/);
});

test('oars: no dropping them mid-lake, a spare pair at the cabin, and Hazel gets hers back', () => {
  const g = newGame();
  g.state.loc = 'cove_store';
  run(g, 'talk to hazel');
  assert.match(run(g, 'give oars to hazel'), /till you're done/);
  assert.ok(g.inInv('oars'));
  g.state.loc = 'sweetwater_lake';
  assert.match(run(g, 'drop oars'), /not letting go/);
  run(g, 'n');
  assert.equal(g.state.loc, 'sweetwater_cabin');
  run(g, 'drop oars');
  assert.match(run(g, 'look'), /oars leans by the door/);
  assert.match(run(g, 's'), /Forest Service pair/);
  g.state.loc = 'sweetwater_cabin';
  assert.doesNotMatch(run(g, 'look'), /oars leans by the door/);
  run(g, 'take oars');
  g.state.loc = 'cove_store';
  assert.match(run(g, 'give oars to hazel'), /Two of everything/);
  assert.equal(g.inInv('oars'), false);
});

test('the ending only recaps evidence you actually found', () => {
  const g = newGame();
  // Skip the Thorne trail entirely: Hazel, Sweetwater, then Reyes.
  runAll(g, [...KEYS, 'w', 'w', 'ne', 'n', 'ne', 'n', 'talk to hazel', 's', 'sw', 'w', 'n', 'n', 'drive to klawock', 'w']);
  const out = run(g, 'accuse dale and rick');
  assert.match(out, /THE CASE IS CLOSED/);
  assert.match(out, /Hazel's borrowed oars/);
  assert.doesNotMatch(out, /Thorne cabin|rod rack|napkin, /);
});

test('IN walks into the obvious building, and GET IN TRUCK still means the truck', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's', 's']);
  assert.equal(g.state.loc, 'lodge_road');
  run(g, 'get in truck');
  assert.equal(g.state.loc, 'truck_cab');
  run(g, 'get out');
  run(g, 'in');
  assert.equal(g.state.loc, 'lodge');
  g.state.loc = 'tavern';
  assert.match(run(g, 'sit'), /stool at the bar/);
});

test('no garbled text anywhere in a full playthrough', () => {
  const g = newGame();
  for (const c of [...WALKTHROUGH.slice(0, -1), 'drive to coffman cove', 'e', 'drive to klawock', 'n', 's', 'w', WALKTHROUGH[WALKTHROUGH.length - 1]]) {
    runClean(g, c);
  }
});

test('fuzz: every common verb on every thing in every room behaves', () => {
  const VERBS = ['x', 'take', 'read', 'open', 'close', 'touch', 'smell', 'listen to', 'sit on', 'eat', 'drink', 'push', 'climb', 'wear', 'turn on', 'turn off', 'knock on', 'enter', 'use', 'unlock'];
  const ROOM_VERBS = ['look', 'listen', 'smell', 'sit', 'wait', 'fish', 'row', 'drive', 'start truck', 'get out', 'hint', 'time', 'weather', 'n', 's', 'e', 'w', 'in', 'out'];
  let tried = 0;
  for (const roomId of Object.keys(newGame().rooms)) {
    for (const v of [...ROOM_VERBS, ...VERBS.map((verb) => verb + ' *')]) {
      if (!v.endsWith(' *')) {
        const g = newGame();
        g.state.loc = roomId;
        g.state.items.flashlight.loc = 'inv';
        g.state.items.flashlight.on = true;
        runClean(g, v, ` in ${roomId}`);
        tried++;
        continue;
      }
      const probe = newGame();
      probe.state.loc = roomId;
      probe.state.items.flashlight.loc = 'inv';
      probe.state.items.flashlight.on = true;
      const things = [...probe.visibleItems(), ...probe.visibleNpcs()];
      for (const thing of things) {
        const g = newGame();
        g.state.loc = roomId;
        g.state.items.flashlight.loc = 'inv';
        g.state.items.flashlight.on = true;
        const cmd = v.replace('*', thing.names[0]);
        runClean(g, cmd, ` in ${roomId}`);
        tried++;
      }
    }
  }
  assert.ok(tried > 5000, `only ${tried} combinations tried`);
});

// ------------------------------------------------------------------ runner
let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message.split('\n').join('\n       ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
