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

// Get the truck keys out of the lockbox at the ferry terminal.
const KEYS = ['enter 1187', 'take keys'];

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
  // Back to the highway, up Thorne Bay Road
  'e', 'n', 'n', 'n', 'e', 'n', 'n',
  'turn on flashlight', 'e', 'e', 'wear waders', 'e',
  // The Thorne cabin is empty, but Rick left a note
  'read note',
  // North to Coffman Cove: Luck Lake, Dog Creek, town, and Hazel's store
  'w', 'w', 'w', 'n', 'n', 'n',
  'n', 'talk to hazel', 's',
  // Sweetwater: west out of town to the turnoff, down to the landing, row across to the cabin
  'w', 's', 'w', 'w',
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
  const out = runAll(g, [...KEYS, 'w', 'n', 'n', 'e']);
  assert.match(out, /pitch dark/);
  assert.match(run(g, 'e'), /need a light/);
  assert.equal(g.state.loc, 'river_trail');
  // Retreating west is always allowed.
  run(g, 'w');
  assert.equal(g.state.loc, 'trailhead');
});

test('turning on the flashlight in the dark reveals the room', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'w', 'n', 'n', 'e']);
  const out = run(g, 'turn on flashlight');
  assert.match(out, /Old-Growth Trail/);
});

test('the Thorne cannot be forded without wearing waders', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'n', 'n', 'e', 'e']);
  assert.equal(g.state.loc, 'ford');
  assert.match(run(g, 'e'), /You need waders/);
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
    'w', 'n', 'e', 'drive to hwy', 'n', 'n', 'n', 'n', 'n', 'n', 'talk to hazel', 's', 'w', 's', 'w', 'w']);
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
    'dial 14 3 28', 'take napkin', 'read napkin', 'e', 'n', 'n', 'n', 'w']);
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
  run(g, 'punch in 1187. get keys. climb into the pickup');
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
    if (r.mapAs) continue; // e.g. the truck cab shows up wherever the truck is
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
    if (!r.map) continue;
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
  assert.match(svg, /explored 1 of 29/);
});

test('map pencils in visited places and the paths between them', () => {
  const g = newGame();
  runAll(g, [...KEYS, 'w', 'w', 's']);
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
  runAll(g, [...KEYS, 'w', 'n', 'n', 'e']);
  const trail = mapModel(g).rooms.find((r) => r.id === 'river_trail');
  assert.deepEqual(trail.label, ['Dark!']);
  runAll(g, ['w', 's', 's', 'e', 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight', 'w', 'n', 'n', 'e']);
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

test('full walkthrough plus a few detours fills in the whole map', () => {
  const g = newGame();
  // The fastest route skips the totem park and the Coffman Cove harbor, so detour before accusing.
  runAll(g, [...WALKTHROUGH.slice(0, -1), 'drive to coffman cove', 'e', 'drive to klawock', 'n', 's', 'w', WALKTHROUGH[WALKTHROUGH.length - 1]]);
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

test('the lockbox wants the right code', () => {
  const g = newGame();
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

// Keys, flashlight and waders, then up to the Thorne trailhead.
const TO_TRAILHEAD = [...KEYS, 'get in truck', 'open glovebox', 'take flashlight', 'turn on flashlight',
  'w', 'w', 's', 'e', 'buy beer', 'give beer to cal', 'w', 'drive to hollis', 'w', 'n', 'n'];

test('the Thorne cabin is empty, with a note pointing to Sweetwater', () => {
  const g = newGame();
  runAll(g, [...TO_TRAILHEAD, 'e', 'e', 'wear waders', 'e']);
  assert.equal(g.state.loc, 'cabin');
  const look = run(g, 'look');
  assert.match(look, /left in a hurry/);
  assert.doesNotMatch(look, /Dale Haugen/);
  assert.equal(g.has('found_dale'), false);
  assert.match(run(g, 'read note'), /Sweetwater/);
  assert.ok(g.has('rick_note'));
});

test('the road runs north to Coffman Cove, and Sweetwater is west of town', () => {
  const g = newGame();
  runAll(g, TO_TRAILHEAD);
  assert.match(run(g, 'n'), /Luck Lake/);
  assert.match(run(g, 'n'), /Dog Creek/);
  assert.match(run(g, 'n'), /Dog Creek runs out through the middle of town/);
  assert.match(run(g, 'w'), /SWEETWATER LAKE/);
  assert.equal(g.itemState('truck').loc, 'sweetwater_turnoff');
});

test('no rowing to Sweetwater without oars, and Hazel has a spare pair', () => {
  const g = newGame();
  runAll(g, [...TO_TRAILHEAD, 'n', 'n', 'n', 'w', 's']);
  assert.equal(g.state.loc, 'sweetwater_landing');
  assert.match(run(g, 'row'), /taken the oars/);
  assert.equal(g.state.loc, 'sweetwater_landing');
  runAll(g, ['n', 'e', 'n']);
  assert.match(run(g, 'talk to hazel'), /two of everything/);
  assert.ok(g.inInv('oars'));
  assert.ok(g.has('hazel_tip'));
  // You've seen the turnoff, so you can drive to the landing by name even before visiting it.
  runAll(g, ['s', 'drive to sweetwater landing']);
  assert.equal(g.state.loc, 'sweetwater_landing');
  assert.match(run(g, 'row west'), /push off/);
  assert.equal(g.state.loc, 'sweetwater_lake');
  assert.match(run(g, 'w'), /Dale Haugen/);
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
  run(g, 'w');
  assert.equal(g.state.loc, 'sweetwater_cabin');
  run(g, 'drop oars');
  assert.match(run(g, 'look'), /oars leans by the door/);
  assert.match(run(g, 'e'), /Forest Service pair/);
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
  runAll(g, [...KEYS, 'w', 'n', 'n', 'n', 'n', 'n', 'n', 'talk to hazel', 's', 'w', 's', 'w', 'w', 'drive to klawock', 'w']);
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
