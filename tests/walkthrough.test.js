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

// The optimal route through the whole game.
const WALKTHROUGH = [
  'read case file',
  // Hollis: grab the flashlight
  'open glovebox', 'take flashlight',
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
  // Back to the highway, up Thorne Bay Road
  'e', 'n', 'n', 'n', 'e', 'n', 'n',
  'turn on flashlight', 'e', 'e', 'wear waders', 'e',
  'talk to dale',
  // Out and over to Klawock
  'w', 'w', 'w', 'w', 's', 's', 'w', 'w',
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
      const to = typeof exit === 'string' ? exit : exit.to;
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
  const out = runAll(g, ['w', 'n', 'n', 'e']);
  assert.match(out, /pitch dark/);
  assert.match(run(g, 'e'), /need a light/);
  assert.equal(g.state.loc, 'river_trail');
  // Retreating west is always allowed.
  run(g, 'w');
  assert.equal(g.state.loc, 'trailhead');
});

test('turning on the flashlight in the dark reveals the room', () => {
  const g = newGame();
  runAll(g, ['open glovebox', 'take flashlight', 'w', 'n', 'n', 'e']);
  const out = run(g, 'turn on flashlight');
  assert.match(out, /Old-Growth Trail/);
});

test('the Thorne cannot be forded without wearing waders', () => {
  const g = newGame();
  runAll(g, ['open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'n', 'n', 'e', 'e']);
  assert.equal(g.state.loc, 'ford');
  assert.match(run(g, 'e'), /You need waders/);
  assert.equal(g.state.loc, 'ford');
});

test('the office is locked until Marnie hands over the key', () => {
  const g = newGame();
  runAll(g, ['w', 'w', 's', 's', 's']);
  assert.equal(g.state.loc, 'lodge');
  assert.match(run(g, 'w'), /locked/);
  runAll(g, ['e', 'talk to marnie', 'w']);
  assert.match(run(g, 'w'), /unlock the office door/);
  assert.equal(g.state.loc, 'office');
});

test('wrong safe combination keeps it shut', () => {
  const g = newGame();
  runAll(g, ['w', 'w', 's', 's', 's', 'e', 'talk to marnie', 'w', 'w']);
  assert.match(run(g, 'dial 1 2 3'), /stays shut/);
  assert.match(run(g, 'open safe'), /will not budge/);
  assert.match(run(g, 'turn dial to 14-3-28'), /swings open/);
});

test('Dale stonewalls without enough evidence', () => {
  const g = newGame();
  runAll(g, ['open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'w', 's', 'e', 'buy beer', 'give beer to cal',
    'w', 'n', 'e', 'n', 'n', 'e', 'e', 'wear waders', 'e']);
  assert.equal(g.state.loc, 'cabin');
  assert.match(run(g, 'talk to dale'), /Name's Bill/);
  assert.equal(g.flag('dale_confessed'), false);
});

test('accusing the wrong person does not end the game', () => {
  const g = newGame();
  runAll(g, ['w', 'w', 'w']);
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
  runAll(g, ['w', 'w', 's', 'w', 'w', 'take receipt', 'read receipt', 'e', 'e', 's', 's', 'e', 'talk to marnie', 'w', 'w',
    'dial 14 3 28', 'take napkin', 'read napkin', 'e', 'n', 'n', 'n', 'w']);
  const out = run(g, 'accuse rick and dale');
  assert.match(out, /warrant/);
  assert.equal(g.state.over, true);
  assert.ok(g.state.score < g.world.maxScore);
});

test('save and load round-trips state', () => {
  const g = newGame();
  runAll(g, ['open glovebox', 'take flashlight', 'w']);
  run(g, 'save');
  runAll(g, ['w', 's']);
  assert.equal(g.state.loc, 'craig');
  assert.match(run(g, 'load'), /Game restored/);
  assert.equal(g.state.loc, 'hwy');
  assert.ok(g.inInv('flashlight'));
});

test('parser handles synonyms and multi-commands', () => {
  const g = newGame();
  assert.match(run(g, 'x truck'), /rental pickup/);
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

test('hint is always available and never empty', () => {
  const g = newGame();
  for (const c of WALKTHROUGH.slice(0, -1)) {
    const h = run(g, 'hint');
    assert.ok(h.length > 10, `empty hint before "${c}"`);
    run(g, c);
  }
});

// ------------------------------------------------------------------ map

test('every room has a unique map position', () => {
  const g = newGame();
  const seen = {};
  for (const [id, r] of Object.entries(g.rooms)) {
    assert.ok(r.map, `${id} has no map position`);
    const key = `${r.map.x},${r.map.y}`;
    assert.ok(!seen[key], `${id} and ${seen[key]} share map square ${key}`);
    seen[key] = id;
  }
});

test('map positions agree with exit directions', () => {
  const g = newGame();
  const sign = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  for (const [id, r] of Object.entries(g.rooms)) {
    for (const [dir, exit] of Object.entries(r.exits)) {
      if (!sign[dir]) continue;
      const to = g.rooms[typeof exit === 'string' ? exit : exit.to];
      const dx = Math.sign(to.map.x - r.map.x);
      const dy = Math.sign(to.map.y - r.map.y);
      assert.deepEqual([dx, dy], sign[dir], `${id} --${dir}--> ${to.id} points the wrong way on the map`);
    }
  }
});

test('map starts with only the ferry dock, marked as you are here', () => {
  const g = newGame();
  const m = mapModel(g);
  assert.deepEqual(m.rooms.map((r) => r.id), ['ferry']);
  assert.ok(m.rooms[0].here);
  assert.deepEqual(m.stubs, [{ from: 'ferry', dir: 'west' }]);
  const svg = renderMap(g);
  assert.match(svg, /^<svg/);
  assert.match(svg, /id="map-you-are-here"/);
  assert.match(svg, /Hollis/);
  assert.doesNotMatch(svg, /Klawock/);
  assert.match(svg, /explored 1 of 20/);
});

test('map pencils in visited places and the paths between them', () => {
  const g = newGame();
  runAll(g, ['w', 'w', 's']);
  const m = mapModel(g);
  assert.deepEqual(m.rooms.map((r) => r.id).sort(), ['craig', 'ferry', 'hwy', 'klawock']);
  assert.equal(m.rooms.find((r) => r.here).id, 'craig');
  const edges = m.edges.map((e) => e.slice().sort().join('-')).sort();
  assert.deepEqual(edges, ['craig-klawock', 'ferry-hwy', 'hwy-klawock']);
  // Unexplored exits from visited rooms show up as stubs.
  assert.ok(m.stubs.some((s) => s.from === 'hwy' && s.dir === 'north'));
  assert.ok(m.stubs.some((s) => s.from === 'craig' && s.dir === 'west'));
});

test('a trail only ever seen in the dark is labeled Dark!', () => {
  const g = newGame();
  runAll(g, ['w', 'n', 'n', 'e']);
  const trail = mapModel(g).rooms.find((r) => r.id === 'river_trail');
  assert.deepEqual(trail.label, ['Dark!']);
  runAll(g, ['w', 's', 's', 'e', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'n', 'n', 'e']);
  assert.deepEqual(mapModel(g).rooms.find((r) => r.id === 'river_trail').label, ['Old', 'Growth']);
});

test('MAP command signals the UI without using a turn', () => {
  const g = newGame();
  const blocks = g.command('map');
  assert.deepEqual(blocks.map((b) => b.event), ['map']);
  assert.equal(g.state.turns, 0);
  // Reading the topo map is still a different thing.
  assert.match(run(g, 'read map'), /don't see any map/);
});

test('full walkthrough plus the totem park fills in the whole map', () => {
  const g = newGame();
  // The fastest route skips the totem park, so detour there before accusing.
  runAll(g, [...WALKTHROUGH.slice(0, -1), 'e', 'n', 's', 'w', WALKTHROUGH[WALKTHROUGH.length - 1]]);
  assert.equal(g.state.over, true);
  assert.match(renderMap(g), /explored 20 of 20/);
  assert.equal(mapModel(g).stubs.length, 0);
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
