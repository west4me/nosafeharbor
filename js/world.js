/*
 * No Safe Harbor — world data.
 *
 * Everything that makes up the game world lives here: rooms, items, people,
 * clues, hints and endings. The engine (engine.js) knows nothing about the
 * story; it just runs whatever buildWorld() returns.
 *
 * Text fields can be plain strings or functions of the game (g) => string.
 * Item/NPC verb handlers return a string (printed), true (handled, already
 * printed), or false/undefined (fall through to the engine default).
 */
(function (root) {
  'use strict';

  function buildWorld() {
    // ---------------------------------------------------------------- clues
    const clues = {
      calm_night: {
        points: 10,
        title: 'The night was flat calm',
        note: "Harbormaster Joe Kitka's report: the night Dale vanished, wind was calm and seas were flat off Fish Egg Island. Dale had run boats for forty years. Men like that don't fall out of skiffs on a glassy night."
      },
      lanyard: {
        points: 10,
        title: 'Plug pulled, kill switch unworn',
        note: "The Kittiwake's drain plug was unscrewed, not broken. Somebody let the sea in on purpose. The kill-switch lanyard was clipped to the console instead of a wrist; if Dale had gone overboard wearing it, the engine would have died with him."
      },
      rod_missing: {
        points: 10,
        title: "Dale's '52 Winston is gone",
        note: "The place of honor on the lodge rod rack is empty: Dale's 1952 Winston bamboo rod, his father's. Nobody takes a rod like that out on salt water. Nobody takes it anywhere unless they plan to keep fishing."
      },
      photo: {
        points: 5,
        title: 'Numbers on the back of a photo',
        note: "Back of the steelhead photo on Dale's desk: 'THORNE R. — 14 lb — 3/28.' Three numbers. Dale's office safe has a three-number dial."
      },
      foreclosure: {
        points: 5,
        title: 'The lodge is going under',
        note: 'Notice of default from First Tidewater Bank: Harbor Light Lodge LLC is 120 days behind, more than $214,000. Foreclosure starts December 1. Owners: Dale Haugen and Rick Sorensen.'
      },
      napkin: {
        points: 10,
        title: "A napkin in Dale's handwriting",
        note: "Riptide Tavern napkin, in Dale's hand: 'R — 60/40 after the payout, like we said. Nobody else knows. Not M. Burn this. — D.' Nobody burned it."
      },
      topo_map: {
        points: 5,
        title: 'A circled cabin on the Thorne',
        note: "Topo map from Dale's desk. A pencil circle marks a Forest Service cabin on the east bank of the Thorne River, reached by the trail off Thorne Bay Road. Margin note: 'propane x2. groceries. Rick every 3 days.'"
      },
      receipt: {
        points: 10,
        title: 'Propane, the morning after',
        note: "Fuel dock receipt, 10/12 at 7:14 AM, the morning after Dale 'drowned': two propane cylinders, ten gallons of gas in cans, ice. Paid cash, even though the lodge has an account. Customer: R. Sorensen."
      },
      cal_tip: {
        points: 5,
        title: 'Rick keeps driving up the Thorne road',
        note: "Cal Brenner: Rick has been driving up Thorne Bay Road every few days since Dale went missing. Says he's scouting deer. According to Cal, Rick 'couldn't hit a deer with his truck.'"
      },
      found_dale: {
        points: 20,
        title: 'Dale Haugen is alive',
        note: "Found Dale Haugen alive and well in the Forest Service cabin up the Thorne River, with two fresh propane cylinders from the Craig fuel dock and his '52 Winston in the corner."
      },
      solved: {
        points: 10,
        title: 'Case closed',
        note: 'Reported the fraud to Sgt. Reyes.'
      }
    };

    // Clues Dale can't talk his way around.
    const HARD_EVIDENCE = ['calm_night', 'lanyard', 'rod_missing', 'foreclosure', 'napkin', 'receipt'];
    const evidenceCount = (g) => HARD_EVIDENCE.filter((c) => g.has(c)).length;

    // ---------------------------------------------------------------- rooms
    const rooms = {
      ferry: {
        map: { x: 6, y: 2, label: ['Hollis', 'Ferry'] },
        name: 'Hollis Ferry Terminal',
        aliases: ['ferry', 'hollis', 'terminal', 'ferry terminal'],
        desc: "The inter-island ferry groans away from the dock behind you, back across Clarence Strait toward Ketchikan. Rain blows in sideways off the water, fine as mist and twice as wet. Spruce and hemlock crowd the hill above a gravel lot where your rental pickup sits, beaded with rain. The only road out runs west into the trees.",
        exits: { west: 'hwy' }
      },

      hwy: {
        map: { x: 4, y: 2, label: ['Harris R.', 'Bridge'] },
        name: 'Hollis–Klawock Highway',
        aliases: ['highway', 'hwy', 'road', 'bridge', 'harris river'],
        desc: "The two-lane highway winds through muskeg and second-growth forest, past old clearcuts filling back in with alder. Here it crosses the Harris River on a concrete bridge. Below, the river runs high and tea-colored from the fall rain, and you'd swear a steelhead just rolled in the tailout. East goes back to the Hollis ferry. West, the highway continues on to Klawock. A gravel road branches north at a sign: THORNE BAY.",
        exits: { east: 'ferry', west: 'klawock', north: 'thorne_road' },
        fish: "No rod, no license and no time. The steelhead will have to wait. They're good at that."
      },

      thorne_road: {
        map: { x: 4, y: 1, label: ['Thorne', 'Bay Rd'] },
        name: 'Thorne Bay Road',
        aliases: ['thorne bay road', 'thorne road', 'gravel road', 'thorne bay'],
        desc: 'Gravel and potholes wind north through logging country, past a lake as still as poured pewter. Old spur roads branch off into the hills, most of them gated and all of them muddy. The road keeps going north toward the Thorne River. South takes you back to the highway.',
        exits: { south: 'hwy', north: 'trailhead' }
      },

      trailhead: {
        map: { x: 4, y: 0, label: ['Trailhead'] },
        name: 'Thorne River Trailhead',
        aliases: ['trailhead', 'pullout'],
        desc: "A gravel pullout at the edge of serious forest. A brown Forest Service sign, bullet-pocked in one corner, marks a trail heading east into the old growth toward the Thorne River. The mud here is churned up with tire tracks, and one set is a lot fresher than the rest. Thorne Bay Road heads back south.",
        exits: { south: 'thorne_road', east: 'river_trail' }
      },

      river_trail: {
        map: { x: 5, y: 0, label: ['Old', 'Growth'] },
        name: 'Old-Growth Trail',
        aliases: ['trail', 'old growth', 'forest'],
        dark: true,
        darkExits: ['west'],
        darkMove: "You take two steps into the black, get a face full of devil's club and think better of it. You need a light.",
        desc: "Under the old growth it's dusk at noon. Sitka spruce as big around as your truck and moss-draped hemlocks wall in the trail, and the ground is a sponge of devil's club and deer fern. Your flashlight picks out the path, and in the mud, a heavy boot print pointing east. The rush of the river gets louder to the east. The trailhead is back to the west.",
        exits: { west: 'trailhead', east: 'ford' }
      },

      ford: {
        map: { x: 6, y: 0, label: ['River', 'Ford'] },
        name: 'Thorne River Crossing',
        aliases: ['river', 'ford', 'crossing', 'thorne river'],
        desc: "The trail ends at a gravel bar on the Thorne River. The river is big here, running high and cold and the color of strong tea, pushing hard over a riffle that crosses to the far bank. Through the trees on the other side, a thin line of woodsmoke rises. The trail runs back west into the forest.",
        exits: {
          west: 'river_trail',
          east: {
            to: 'cabin',
            guard: (g) => {
              if (!g.isWorn('waders')) {
                return "You put one foot in the Thorne and the cold goes straight through your boot and up your spine. Wading this river in jeans in late October is how people end up in somebody else's incident report. You need waders.";
              }
              g.print('You lean into the current and shuffle across the riffle, the river shoving at your legs like a crowd leaving a ballgame. You climb out on the far bank, dripping but upright.');
              return null;
            }
          }
        },
        fish: "Even without a rod you can read it: the seam along the far bank, the soft water behind that boulder. Dale picked a hiding spot with good water. Of course he did."
      },

      cabin: {
        map: { x: 7, y: 0, label: ['USFS', 'Cabin'] },
        name: 'Forest Service Cabin',
        aliases: ['cabin'],
        desc: (g) => 'A one-room cabin of weathered spruce logs. The Forest Service rents it out in summer, and nobody uses it this late in the year. Somebody is using it now. A propane heater hisses in the corner next to two fresh propane cylinders, and a sleeping bag is unrolled on the plank bunk. ' +
          (g.itemAt('winston', 'cabin') ? 'In the corner, leaning in a place of honor, is a bamboo fly rod. ' : '') +
          'The door leads west, back to the river.',
        exits: { west: 'ford', out: 'ford' },
        onEnter: (g) => { g.clue('found_dale'); }
      },

      klawock: {
        map: { x: 1, y: 2, label: ['Klawock'] },
        name: 'Klawock',
        aliases: ['klawock', 'town'],
        desc: "The highway comes down out of the hills into Klawock, a small town on a wide inlet where woodsmoke mixes with the smell of low tide. Klawock is one of the oldest communities on the island. Up the hill to the north stand the carved poles of the totem park. The Alaska State Troopers post is a low building to the west. The highway runs east back toward Hollis and south to Craig.",
        exits: { east: 'hwy', north: 'totem_park', west: 'trooper', south: 'craig' }
      },

      totem_park: {
        map: { x: 1, y: 1, label: ['Totem', 'Park'] },
        name: 'Klawock Totem Park',
        aliases: ['totem park', 'park', 'totems', 'poles'],
        desc: 'Totem poles line the hillside above the town and the inlet. They are carved from red cedar, weathered to silver-gray, and their figures watch the water the way they have for generations. Next to a carving shed at the edge of the park, a fresh cedar log rests on sawhorses, halfway to becoming something with wings. The path leads south back down into town.',
        exits: { south: 'klawock' }
      },

      trooper: {
        map: { x: 0, y: 2, label: ['Troopers'] },
        name: 'Alaska State Troopers Post',
        aliases: ['troopers', 'trooper post', 'post', 'trooper', 'police'],
        desc: "A small, overheated office with a coffee maker that has seen things, a wall map of Prince of Wales Island stuck full of pins and an empty holding cell. The exit is east.",
        exits: { east: 'klawock', out: 'klawock' },
        accuse: (g, names) => accuse(g, names)
      },

      craig: {
        map: { x: 1, y: 4, label: ['Craig'] },
        name: 'Craig — Front Street',
        aliases: ['craig', 'front street', 'downtown'],
        desc: "Craig is the biggest town on the island, which means two grocery stores, three bars and a lot of boats. Front Street runs along the water past bait shops and a cannery that's seen better decades. The harbor is to the west. The neon OPEN sign of the Riptide Tavern buzzes to the east. The road climbs north back to Klawock, and a gravel road heads south along the shore toward the Harbor Light Lodge.",
        exits: { north: 'klawock', west: 'harbor', east: 'tavern', south: 'lodge_road' }
      },

      harbor: {
        map: { x: 0, y: 4, label: ['Harbor'] },
        name: 'South Cove Harbor',
        aliases: ['harbor', 'docks', 'floats', 'south cove'],
        desc: 'Seiners, trollers and skiffs rock gently in their slips along the floats and finger piers. Gulls argue on the pilings. North, at the head of the ramp, is a small office with HARBORMASTER painted on the door. The fuel dock is farther west along the floats. Front Street is back east.',
        exits: { east: 'craig', north: 'harbormaster', west: 'fuel_dock' }
      },

      harbormaster: {
        map: { x: 0, y: 3, label: ['Harbor-', 'master'] },
        name: "Harbormaster's Office",
        aliases: ['harbormaster', 'office', "harbormaster's office"],
        desc: 'A cramped office. A VHF radio crackles on the shelf and tide tables are taped to the window. A chart of the waters around Craig covers the desk, with a coffee ring right on Fish Egg Island. The door is south.',
        exits: { south: 'harbor', out: 'harbor' }
      },

      fuel_dock: {
        map: { x: -1, y: 4, label: ['Fuel', 'Dock'] },
        name: 'Fuel Dock',
        aliases: ['fuel dock', 'fuel', 'gas dock'],
        desc: 'A float at the end of the harbor with two fuel pumps, a caged rack of propane cylinders and a tiny shack selling ice, bait and chips. A rusty trash barrel stands next to the shack. The harbor floats lead back east.',
        exits: { east: 'harbor' }
      },

      tavern: {
        map: { x: 2, y: 4, label: ['Riptide', 'Tavern'] },
        name: 'Riptide Tavern',
        aliases: ['tavern', 'riptide', 'bar', 'riptide tavern'],
        desc: 'Dim and warm, smelling of fryer oil and wet wool. Glass fishing floats hang from the ceiling, and the bulletin board by the door is buried in flyers for skiff sales and lost dogs. Front Street is out the door to the west.',
        exits: { west: 'craig', out: 'craig' },
        buy: (g, what) => {
          if (!/beer|ale|drink|round|bottle|amber|pint/.test(what)) {
            return "Bonnie looks at you. 'We've got beer. We've also got beer.'";
          }
          if (g.inInv('beer')) return "You've already got one sweating in your hand.";
          if (g.flag('cal_talked')) return "Bonnie raises an eyebrow. 'You're on the clock, hon. I can tell.'";
          g.moveItem('beer', 'inv');
          return "Bonnie slides a cold bottle of Muskeg Amber across the bar and waves off your expense-report face. 'It's on the house. For Dale.'";
        }
      },

      lodge_road: {
        map: { x: 1, y: 5, label: ['Lodge', 'Road'] },
        name: 'Lodge Road',
        aliases: ['lodge road', 'shore road'],
        desc: "A gravel road hugs the shore south of town. Across the water, the dark hump of Fish Egg Island sits low under the clouds, ringed with kelp. Somewhere out there, the Kittiwake was found drifting. The road leads north back to Craig and south to the Harbor Light Lodge.",
        exits: { north: 'craig', south: 'lodge' }
      },

      lodge: {
        map: { x: 1, y: 6, label: ['Lodge'] },
        name: 'Harbor Light Lodge — Great Room',
        aliases: ['lodge', 'great room', 'harbor light lodge', 'harbor light'],
        desc: "A big timber-frame room with a river-rock fireplace, leather couches gone soft with use and a mounted king salmon over the mantel that looks surprised about the whole arrangement. A long wooden rod rack hangs on the wall near the door. Doors lead east to the kitchen and west to an office. A path runs south down to the boathouse, and the front door opens north onto the road.",
        exits: {
          north: 'lodge_road',
          out: 'lodge_road',
          east: 'kitchen',
          south: 'boathouse',
          down: 'boathouse',
          west: {
            to: 'office',
            guard: (g) => {
              if (g.flag('office_unlocked')) return null;
              if (g.inInv('office_key')) {
                g.flag('office_unlocked', true);
                g.print('(You unlock the office door with the brass key.)');
                return null;
              }
              return 'The office door is locked. A brass nameplate on it reads D. HAUGEN.';
            }
          }
        }
      },

      kitchen: {
        map: { x: 2, y: 6, label: ['Kitchen'] },
        name: 'Lodge Kitchen',
        aliases: ['kitchen'],
        desc: 'A big working kitchen with steel counters, a six-burner range and a walk-in cooler humming in the corner. It smells like bread and coffee. The window over the sink looks out at Fish Egg Island. The great room is back west.',
        exits: { west: 'lodge', out: 'lodge' }
      },

      office: {
        map: { x: 0, y: 6, label: ["Dale's", 'Office'] },
        name: "Dale's Office",
        aliases: ['office', "dale's office", 'dales office'],
        desc: (g) => 'A small wood-paneled office with a window onto the water. A heavy oak desk sits under a green-shaded lamp' +
          (g.itemAt('photo', 'office') ? ', with a framed photo propped on it' : '') +
          ". Charts of the Craig area and a marine-supply calendar cover the walls. A squat black safe with a combination dial sits in the corner. The door is east.",
        exits: { east: 'lodge', out: 'lodge' },
        dial: (g, nums) => {
          const st = g.itemState('safe');
          if (!st.locked) return 'The safe is already unlocked.';
          if (nums[0] === 14 && nums[1] === 3 && nums[2] === 28) {
            st.locked = false;
            st.open = true;
            return "You spin the dial: right to 14, left to 3, right to 28. Something inside clunks. The handle turns, and the heavy door swings open.\n" + g.contentsLine('safe');
          }
          return `You spin the dial to ${nums.join('-')} and pull the handle. Nothing. The safe stays shut.`;
        }
      },

      boathouse: {
        map: { x: 1, y: 7, label: ['Boat-', 'house'] },
        name: 'Boathouse',
        aliases: ['boathouse', 'boat house'],
        desc: 'A drafty boathouse on pilings over the water, smelling of two-stroke oil and seaweed. Life jackets and crab pots hang from the rafters. An 18-foot aluminum skiff sits on a trailer in the middle of the floor, KITTIWAKE stenciled on her bow. A path leads north back up to the lodge.',
        exits: { north: 'lodge', up: 'lodge' }
      }
    };

    // ---------------------------------------------------------------- items
    // loc: a room id, 'inv', another item id (inside a container), or null (nowhere yet).
    const items = {
      // --- starting inventory
      case_file: {
        name: 'case file', short: 'a case file', loc: 'inv',
        names: ['case file', 'file', 'folder', 'case', 'briefing'],
        desc: "A manila folder stamped NORTHBOUND MUTUAL — SPECIAL INVESTIGATIONS. Try reading it.",
        text: [
          'NORTHBOUND MUTUAL LIFE — SPECIAL INVESTIGATIONS UNIT',
          'Claim #NM-1187    Assigned to: you',
          '',
          'INSURED: Dale Haugen, 61. Co-owner, Harbor Light Lodge, Craig, Alaska.',
          'POLICY: $1,500,000 term life.',
          'BENEFICIARY: Richard "Rick" Sorensen, business partner.',
          '   (Changed from Marnie Haugen, spouse, 3 months ago.)',
          '',
          "LOSS: Insured's skiff KITTIWAKE was found adrift and swamped off",
          'Fish Egg Island at first light on Oct 11. No body recovered.',
          'Coast Guard suspended its search Oct 13.',
          'Claim filed Oct 15 by the beneficiary.',
          '',
          'ASSIGNMENT: Verify the loss or find out what really happened.',
          'Start with the harbormaster in Craig. Then the family.',
          '',
          '(Handwritten on a sticky note from your supervisor: "New beneficiary + no body = look hard. Don\'t fall in a river.")'
        ].join('\n'),
        onRead: (g) => { g.flag('read_case_file', true); }
      },
      badge: {
        name: 'ID badge', short: 'your ID badge', loc: 'inv',
        names: ['badge', 'id', 'id badge', 'id card', 'card', 'credentials'],
        desc: 'NORTHBOUND MUTUAL — SPECIAL INVESTIGATIONS. Your photo makes you look like you are being arrested.'
      },
      phone: {
        name: 'phone', short: 'a phone', loc: 'inv',
        names: ['phone', 'cell phone', 'cellphone', 'cell', 'smartphone'],
        desc: 'One bar. Then none. Then one again, mockingly.',
        verbs: {
          use: () => 'No service. Welcome to the Tongass.',
          turnon: () => "It's on. It just isn't doing anything useful."
        }
      },

      // --- Hollis
      truck: {
        name: 'rental truck', short: 'a rental pickup', loc: 'ferry', fixed: true,
        names: ['truck', 'pickup', 'rental', 'rental truck', 'pickup truck', 'car', 'vehicle'],
        desc: (g) => 'A white rental pickup with a cracked windshield and 140,000 miles of island gravel on it. The glovebox is ' + (g.itemState('glovebox').open ? 'open.' : 'closed.'),
        fixedMsg: "It's a truck. You drive it, you don't carry it.",
        verbs: { open: (g) => g.doVerb('open', 'glovebox') }
      },
      glovebox: {
        name: 'glovebox', short: 'a glovebox', loc: 'ferry', fixed: true,
        names: ['glovebox', 'glove box', 'glove compartment', 'compartment'],
        container: true, openable: true, open: false,
        desc: "The truck's glovebox."
      },
      flashlight: {
        name: 'flashlight', short: 'a flashlight', loc: 'glovebox',
        names: ['flashlight', 'torch', 'light', 'lamp', 'maglite'],
        switchable: true, on: false,
        desc: (g) => 'A heavy black flashlight, the kind that doubles as a club. It is ' + (g.itemState('flashlight').on ? 'on.' : 'off.')
      },
      rental_agreement: {
        name: 'rental agreement', short: 'a rental agreement', loc: 'glovebox',
        names: ['rental agreement', 'agreement', 'contract', 'paperwork'],
        desc: 'Three pages of carbon paper. Try reading it.',
        text: 'ISLAND AUTO RENTAL — Craig & Hollis\nCollision damage waiver: DECLINED.\nDeer strikes are not covered. Neither are bears.\nReturn with a full tank or a very good story.'
      },

      // --- Highway
      harris_river: {
        name: 'Harris River', loc: 'hwy', fixed: true,
        names: ['river', 'harris river', 'harris', 'water', 'tailout', 'steelhead'],
        desc: "High, tea-stained and fast with fall rain. The tailout below the bridge is the kind of water that makes you late for things."
      },

      // --- Thorne Bay Road / trailhead / trail / river / cabin
      lake: {
        name: 'lake', loc: 'thorne_road', fixed: true,
        names: ['lake', 'control lake', 'water'],
        desc: 'Flat, gray and dimpled by rain. Probably full of cutthroat, which you are professionally obligated to ignore.'
      },
      sign: {
        name: 'Forest Service sign', loc: 'trailhead', fixed: true,
        names: ['sign', 'forest service sign', 'trail sign'],
        desc: 'A routed wooden sign. Try reading it.',
        text: 'THORNE RIVER TRAIL — CABIN 2.5 MI.\nBEARS FREQUENT THIS AREA. MAKE NOISE.\n(Someone has scratched underneath: "NO KIDDING.")'
      },
      tracks: {
        name: 'tire tracks', loc: 'trailhead', fixed: true,
        names: ['tracks', 'tire tracks', 'tire', 'mud', 'tread'],
        desc: "Wide truck tires with an aggressive tread. The freshest tracks run over yesterday's, and yesterday's run over the day before's. Somebody comes out here a lot."
      },
      propane_cap: {
        name: 'red plastic cap', short: 'a red plastic cap', loc: 'trailhead',
        names: ['cap', 'red cap', 'plastic cap', 'red plastic cap'],
        desc: 'The protective cap off a propane cylinder valve. Somebody is heating or cooking with propane somewhere up that trail.'
      },
      scat: {
        name: 'bear scat', loc: 'river_trail', fixed: true,
        names: ['scat', 'bear scat', 'poop', 'droppings'],
        desc: 'A pile of bear scat full of salmon bones, fresh enough to make you start humming loudly.',
        fixedMsg: 'Absolutely not.'
      },
      bootprint: {
        name: 'boot print', loc: 'river_trail', fixed: true,
        names: ['print', 'boot print', 'footprint', 'boot', 'prints'],
        desc: 'A big lug-soled boot print pointing east toward the river. Not a hiker. Hikers come in pairs, in July.'
      },
      thorne_river: {
        name: 'Thorne River', loc: 'ford', fixed: true,
        names: ['river', 'thorne', 'thorne river', 'water', 'riffle', 'current'],
        desc: 'Thigh-deep across the riffle and moving like it has somewhere to be. The smoke on the far bank is more interesting than the water. For once.'
      },
      smoke: {
        name: 'smoke', loc: 'ford', fixed: true,
        names: ['smoke', 'woodsmoke'],
        desc: 'A thin gray line rising through the spruce on the far bank. Somebody is home.'
      },
      heater: {
        name: 'propane heater', loc: 'cabin', fixed: true,
        names: ['heater', 'propane heater', 'stove'],
        desc: 'A portable propane heater hissing away and keeping the cabin warmer than any Forest Service cabin has a right to be.'
      },
      cylinders: {
        name: 'propane cylinders', loc: 'cabin', fixed: true,
        names: ['cylinders', 'propane cylinders', 'propane', 'tanks', 'cylinder', 'tank'],
        desc: 'Two 20-pound propane cylinders. One still has the price sticker on it: CRAIG FUEL DOCK.'
      },
      bunk: {
        name: 'bunk', loc: 'cabin', fixed: true,
        names: ['bunk', 'sleeping bag', 'bag', 'bed'],
        desc: 'A good down sleeping bag on a plank bunk, plus a stack of paperbacks and a box of groceries. Somebody is set up for a long stay.'
      },
      winston: {
        name: "'52 Winston bamboo rod", short: 'a bamboo fly rod', loc: 'cabin', fixed: true,
        names: ['rod', 'fly rod', 'bamboo rod', 'winston', 'bamboo', 'fishing rod', 'winston rod'],
        desc: "A 1952 Winston bamboo rod, 8'6\" for a five-weight, its varnish gone the color of clover honey and its wraps a deep burgundy. This is the rod from the empty slot on the lodge rack. It's the kind of rod a man would come back from the dead for.",
        fixedMsg: (g) => g.npcHere('dale')
          ? "'Put a hand on that rod,' Dale says quietly, 'and we're going to have a real problem.'"
          : 'You leave it be. It deserves better than being stuffed in an evidence bag.'
      },

      // --- Klawock
      cedar_log: {
        name: 'cedar log', loc: 'totem_park', fixed: true,
        names: ['log', 'cedar', 'cedar log', 'carving', 'pole'],
        desc: "Red cedar, the grain tight and fragrant. A raven's head is starting to come out of one end."
      },
      totems: {
        name: 'totem poles', loc: 'totem_park', fixed: true,
        names: ['totems', 'totem poles', 'totem', 'poles', 'figures'],
        desc: "Eagle, raven, bear and killer whale, carved and recarved by generations of hands. You stand there longer than you meant to."
      },
      wall_map: {
        name: 'wall map', loc: 'trooper', fixed: true,
        names: ['map', 'wall map', 'pins'],
        desc: 'Prince of Wales Island, stuck full of colored pins. A red one sits just off Fish Egg Island.'
      },
      coffee_maker: {
        name: 'coffee maker', loc: 'trooper', fixed: true,
        names: ['coffee', 'coffee maker', 'pot'],
        desc: "Brewing something that smells like burnt tires and determination."
      },
      cell: {
        name: 'holding cell', loc: 'trooper', fixed: true,
        names: ['cell', 'holding cell', 'jail'],
        desc: 'Empty, for now.'
      },

      // --- Craig: harbormaster
      chart: {
        name: 'chart', loc: 'harbormaster', fixed: true,
        names: ['chart', 'nautical chart', 'coffee ring', 'fish egg'],
        desc: "A nautical chart of the Craig area. Someone has penciled an X a half mile west of Fish Egg Island and written next to it: 'KITTIWAKE 0650.'"
      },
      radio: {
        name: 'VHF radio', loc: 'harbormaster', fixed: true,
        names: ['radio', 'vhf', 'vhf radio'],
        desc: "Channel 16, crackling. Somebody named Lyle wants everyone to know the halibut aren't biting."
      },
      report: {
        name: 'incident report', short: 'an incident report', loc: null,
        names: ['report', 'incident report', 'sheet', 'copy'],
        desc: 'A photocopied incident report from the Craig harbor department. Try reading it.',
        text: [
          'CITY OF CRAIG — HARBOR DEPARTMENT — INCIDENT REPORT',
          'Date: Oct 11    Reported by: J. Kitka, Harbormaster',
          'Vessel: KITTIWAKE, 18 ft aluminum skiff. Owner: Dale Haugen.',
          'Found adrift 0650 hrs, approx 0.5 nm W of Fish Egg Island.',
          'Condition: swamped, engine off, no persons aboard.',
          'Weather overnight: WIND CALM. SEAS FLAT. VISIBILITY GOOD.',
          'Remarks: Owner is an experienced operator (40+ yrs local waters).',
          'Vessel towed to Harbor Light Lodge boathouse at family request.'
        ].join('\n'),
        onRead: (g) => { g.clue('calm_night'); }
      },

      // --- Craig: fuel dock
      barrel: {
        name: 'trash barrel', loc: 'fuel_dock', fixed: true,
        names: ['barrel', 'trash barrel', 'trash', 'garbage', 'drum', 'trash can', 'can'],
        container: true, open: true,
        desc: 'A rusted 55-gallon drum serving as a trash can, mostly full of bait boxes and chip bags.',
        fixedMsg: "It's bolted to the float, and honestly, you don't want to know why."
      },
      receipt: {
        name: 'crumpled receipt', short: 'a crumpled receipt', loc: 'barrel',
        names: ['receipt', 'crumpled receipt', 'slip'],
        desc: 'A fuel dock receipt, crumpled and a little damp. Try reading it.',
        text: [
          'PRINCE OF WALES FUEL & BAIT — CRAIG, AK',
          '10/12   07:14',
          '  2 x PROPANE CYL 20LB EXCH ..... $ 61.90',
          '  10 GAL REG UNLEADED (CANS) .... $112.50',
          '  1 x ICE, BAG .................. $ 13.00',
          '  TOTAL ......................... $187.40',
          '  PAID: CASH',
          '  Acct name (handwritten): R. SORENSEN'
        ].join('\n'),
        onRead: (g) => { g.clue('receipt'); }
      },
      propane_rack: {
        name: 'propane rack', loc: 'fuel_dock', fixed: true,
        names: ['rack', 'propane rack', 'cage', 'propane', 'cylinders', 'pumps', 'pump'],
        desc: 'A padlocked cage of 20-pound propane cylinders with orange CRAIG FUEL DOCK price stickers.'
      },

      // --- Craig: tavern
      bulletin: {
        name: 'bulletin board', loc: 'tavern', fixed: true,
        names: ['board', 'bulletin board', 'flyers', 'flyer', 'bulletin'],
        desc: 'A cork board buried in flyers. Try reading it.',
        text: "FOR SALE: 16' skiff, runs great, ignore the hole.\nLOST: brown dog, answers to 'Halibut.'\nCAL BRENNER GUIDE SERVICE — Steelhead, Silvers, Cutthroat. Sober Since Tuesday.\nCOMMUNITY POTLUCK — Klawock — bring a dish, not a ukulele."
      },
      beer: {
        name: 'bottle of beer', short: 'a bottle of Muskeg Amber', loc: null,
        names: ['beer', 'bottle', 'ale', 'amber', 'muskeg amber', 'drink', 'bottle of beer'],
        desc: 'A cold bottle of Muskeg Amber, sweating a little.',
        verbs: {
          drink: () => "You're on the clock. And anyway, this one has someone else's name on it."
        }
      },
      waders: {
        name: 'waders', short: 'a pair of chest waders', loc: null,
        names: ['waders', 'wader', 'chest waders', 'boots'],
        wearable: true,
        desc: (g) => "Breathable chest waders with neoprene booties, patched twice at the knee. They're Cal's spares and they smell like a river." + (g.isWorn('waders') ? " You're wearing them." : '')
      },

      // --- Lodge
      rod_rack: {
        name: 'rod rack', loc: 'lodge', fixed: true,
        names: ['rack', 'rod rack', 'rods', 'tag', 'brass tag', 'slot', 'empty slot'],
        desc: "A handsome rack of varnished alder holding a row of fly rods, mostly workaday graphite for the guests, each labeled with masking tape. The place of honor in the middle is empty. A small brass tag under the empty slot reads: D.H. — '52 WINSTON — HANDS OFF.",
        onExamine: (g) => { g.clue('rod_missing'); }
      },
      fireplace: {
        name: 'fireplace', loc: 'lodge', fixed: true,
        names: ['fireplace', 'fire', 'hearth', 'rocks', 'river rock'],
        desc: 'River rock and a good fire. Rick has claimed the closest chair.'
      },
      salmon_mount: {
        name: 'king salmon', loc: 'lodge', fixed: true,
        names: ['salmon', 'king salmon', 'mount', 'king', 'fish'],
        desc: "A forty-pound king, mouth open in permanent outrage. The plaque reads: D. HAUGEN — 1998 — 'I TOLD YOU SO.'"
      },
      office_door: {
        name: 'office door', loc: 'lodge', fixed: true,
        names: ['door', 'office door', 'nameplate'],
        desc: (g) => 'A solid fir door with a brass nameplate: D. HAUGEN. It is ' + (g.flag('office_unlocked') ? 'unlocked.' : 'locked.'),
        verbs: {
          unlock: (g) => {
            if (g.flag('office_unlocked')) return "It's already unlocked.";
            if (!g.inInv('office_key')) return "You don't have a key that fits.";
            g.flag('office_unlocked', true);
            return 'The brass key turns smoothly. The office door is unlocked.';
          },
          open: (g) => {
            if (!g.flag('office_unlocked')) {
              if (!g.inInv('office_key')) return "It's locked.";
              g.flag('office_unlocked', true);
              return '(You unlock it with the brass key first.) The office door swings open. The office is to the west.';
            }
            return 'The office door is open. The office is to the west.';
          }
        }
      },
      office_key: {
        name: 'office key', short: 'a brass office key', loc: null,
        names: ['key', 'brass key', 'office key'],
        desc: 'A brass key on a cork-float keychain stamped HARBOR LIGHT LODGE — OFFICE.'
      },
      bread: {
        name: 'bread dough', loc: 'kitchen', fixed: true,
        names: ['bread', 'dough', 'bread dough'],
        desc: 'Kneaded within an inch of its life.',
        fixedMsg: "Marnie gives you a look that could stop a tide. You leave the dough alone."
      },
      // office
      desk: {
        name: 'oak desk', loc: 'office', fixed: true,
        names: ['desk', 'oak desk', 'lamp'],
        desc: (g) => 'A heavy oak desk, tidy the way a desk gets when somebody has cleaned it on purpose. It has one drawer, which is ' + (g.itemState('drawer').open ? 'open.' : 'closed.'),
        verbs: { open: (g) => g.doVerb('open', 'drawer'), close: (g) => g.doVerb('close', 'drawer') }
      },
      drawer: {
        name: 'desk drawer', loc: 'office', fixed: true,
        names: ['drawer', 'desk drawer'],
        container: true, openable: true, open: false,
        desc: "The desk's only drawer."
      },
      topo_map: {
        name: 'topo map', short: 'a topo map', loc: 'drawer',
        names: ['map', 'topo map', 'topo', 'topographic map', 'usgs map'],
        desc: 'A USGS topographic map of the Thorne River drainage, soft from handling. Something is marked on it in pencil. Try reading it.',
        text: "A neat pencil circle surrounds a tiny black square on the east bank of the Thorne River, east of the trailhead off Thorne Bay Road. It's labeled CABIN. In the margin, in Dale's blocky hand:\n  'propane x2. groceries. Rick every 3 days.'",
        onRead: (g) => { g.clue('topo_map'); g.flag('knows_cabin', true); }
      },
      photo: {
        name: 'framed photo', short: 'a framed photo', loc: 'office',
        // The office description already mentions the photo while it's on the desk.
        roomDesc: (g) => (g.state.loc === 'office' ? '' : 'There is a framed photo here.'),
        names: ['photo', 'photograph', 'picture', 'framed photo', 'frame', 'back of photo'],
        desc: "Dale Haugen, grinning on a gravel bar, holding up a huge chrome-bright steelhead. A bamboo rod rests on his shoulder. Something is written in pencil on the back of the photo.",
        text: "On the back, in blocky pencil:\n  'THORNE R. — 14 lb — 3/28'",
        onRead: (g) => { g.clue('photo'); }
      },
      calendar: {
        name: 'calendar', loc: 'office', fixed: true,
        names: ['calendar', 'wall calendar'],
        desc: "A marine-supply calendar turned to October. The 11th, the day Dale disappeared, is circled hard enough to dent the paper. Written inside the circle is a single word: GO."
      },
      charts: {
        name: 'charts', loc: 'office', fixed: true,
        names: ['charts', 'wall charts'],
        desc: 'Nautical charts of Bucareli Bay and the Craig approaches, annotated by someone who knew every rock by its first name.'
      },
      safe: {
        name: 'safe', loc: 'office', fixed: true,
        names: ['safe', 'black safe', 'dial', 'combination', 'combination dial', 'handle'],
        container: true, openable: true, open: false, locked: true,
        desc: (g) => 'A squat black safe with a brass combination dial. Three numbers, by the look of it. The door is ' + (g.itemState('safe').open ? 'open.' : 'closed.'),
        lockedMsg: 'The handle will not budge. The safe has a three-number combination dial. (To try a combination, type something like DIAL 1 2 3.)',
        verbs: {
          unlock: () => 'There is no keyhole, only a combination dial. (Try DIAL followed by three numbers.)'
        }
      },
      foreclosure: {
        name: 'bank notice', short: 'a bank notice', loc: 'safe',
        names: ['notice', 'bank notice', 'letter', 'foreclosure', 'default notice', 'bank letter'],
        desc: 'An official letter from First Tidewater Bank. Try reading it.',
        text: [
          'FIRST TIDEWATER BANK — NOTICE OF DEFAULT',
          'Borrower: Harbor Light Lodge LLC',
          '  Members: D. Haugen, R. Sorensen',
          'Your loan is 120 days past due. Amount required to cure: $214,880.12.',
          'Absent cure, the Bank will commence foreclosure on or after DECEMBER 1.'
        ].join('\n'),
        onRead: (g) => { g.clue('foreclosure'); }
      },
      napkin: {
        name: 'napkin', short: 'a folded napkin', loc: 'safe',
        names: ['napkin', 'folded napkin', 'bar napkin', 'note'],
        desc: 'A bar napkin from the Riptide Tavern, folded small. There is writing on it. Try reading it.',
        text: "In blocky pencil, the same hand as the back of the photo:\n  'R — 60/40 after the payout, like we said.\n   Nobody else knows. Not M.\n   Burn this.   — D'",
        onRead: (g) => { g.clue('napkin'); }
      },
      // boathouse
      skiff: {
        name: 'skiff', loc: 'boathouse', fixed: true,
        names: ['skiff', 'kittiwake', 'boat', 'hull', 'trailer', 'outboard', 'engine', 'motor'],
        desc: "The Kittiwake is a workboat: dented, scrubbed clean, every line coiled. There's no damage to the hull. Two things jump out at you. First, the transom drain plug is gone. It wasn't snapped off; it was unscrewed, and its little brass keeper chain hangs empty. Somebody let the sea in on purpose. Second, the outboard's kill-switch lanyard is clipped neatly to the console. Every old boatman wears that lanyard on his wrist so the engine dies if he goes over. This one was never on anybody's wrist.",
        onExamine: (g) => { g.clue('lanyard'); }
      },
      lanyard: {
        name: 'kill-switch lanyard', loc: 'boathouse', fixed: true,
        names: ['lanyard', 'kill switch', 'kill-switch', 'killswitch', 'console', 'kill-switch lanyard', 'cord'],
        desc: "A coiled red cord clipped to the console's kill switch. If someone's wearing it and goes overboard, the engine stops. It's clipped to the boat, not to a person.",
        onExamine: (g) => { g.clue('lanyard'); }
      },
      drain_plug: {
        name: 'drain hole', loc: 'boathouse', fixed: true,
        names: ['plug', 'drain', 'drain plug', 'drain hole', 'chain', 'transom', 'keeper chain'],
        desc: "A clean, undamaged threaded drain hole. The keeper chain hangs empty. Plugs don't unscrew themselves.",
        onExamine: (g) => { g.clue('lanyard'); }
      },
      crab_pots: {
        name: 'crab pots', loc: 'boathouse', fixed: true,
        names: ['pots', 'crab pots', 'life jackets', 'jackets', 'rafters'],
        desc: 'Crab pots, life jackets and a lifetime of gear, all hung with care.'
      },
      fish_egg: {
        name: 'Fish Egg Island', loc: 'lodge_road', fixed: true,
        names: ['island', 'fish egg island', 'fish egg', 'kelp', 'water'],
        desc: 'Low, dark and close, maybe a half mile offshore. A strong swimmer in a survival suit could make that in a flat calm. Interesting thought.'
      }
    };

    // ----------------------------------------------------------------- npcs
    const npcs = {
      marnie: {
        name: 'Marnie Haugen', loc: 'kitchen',
        names: ['marnie', 'marnie haugen', 'mrs haugen', 'wife', 'woman'],
        here: 'Marnie Haugen is kneading bread dough like she would rather do anything than think.',
        desc: "Dale's wife of forty years. Gray braid, flour to the elbows and red eyes she'd deny if you mentioned them.",
        talk: (g) => {
          if (!g.flag('got_key')) {
            g.flag('got_key', true);
            g.moveItem('office_key', 'inv');
            return "Marnie wipes her hands on her apron and studies you. 'The insurance investigator.' Her voice is flat. 'Did you know he took me off the policy? Three months ago. Put Rick on it. Said it was \"for the business.\" Forty years and he never said a word to me.'\n\nShe digs in her apron pocket and sets a brass key on the counter. 'His office. I can't make myself go in there. You do it.'\n\nYou take the key.";
          }
          return "'Find out what happened to him,' Marnie says, without looking up from the dough. 'That's all I want. Ask me whatever you need.'";
        },
        topics: [
          { k: ['dale', 'husband', 'him'], r: "'He's been a fisherman longer than I've known him. He could run a skiff through Bucareli Bay at midnight with his eyes shut. Don't tell me the water took him. Not on a calm night.'" },
          { k: ['rick', 'sorensen', 'partner'], r: "'Rick came up from Seattle five years ago with money and ideas. The money's gone. He still has the ideas.' She pounds the dough. 'He's been sadder this week than I've ever seen him. Seems like a lot of work.'" },
          { k: ['policy', 'insurance', 'beneficiary', 'claim'], r: "'Dale said Rick needed to be on it so the bank would keep lending. Said I'd be fine. I didn't argue. Maybe I should have.'" },
          { k: ['rod', 'winston', 'bamboo', 'rack', 'fishing'], r: "'That '52 Winston was his father's. He'd sooner have taken me dancing than take that rod out on salt water. If it's not on the rack, something's very wrong.'" },
          { k: ['boat', 'skiff', 'kittiwake', 'boathouse'], r: "'He kept that skiff like a church. Joe towed it to our boathouse. I haven't been down there.'" },
          { k: ['cal', 'brenner', 'guide'], r: "'Cal guided for us for six seasons. He and Dale fought about wages at the end of the summer. Cal drinks, but he's no liar. He's probably at the Riptide.'" },
          { k: ['money', 'bank', 'debt', 'foreclosure', 'loan', 'notice'], r: "'Dale did the books. I did everything else.' She stops kneading. 'Why? What's wrong with the money?'" },
          { k: ['office', 'key', 'safe', 'desk'], r: "'He kept the important things in that safe. I never knew the combination. He said I'd remember it if I ever needed it. I never needed it.'" },
          { k: ['cabin', 'thorne', 'river'], r: "'Dale fished the Thorne every spring. Steelhead. He'd come home soaked and smiling.'" }
        ],
        askDefault: "Marnie shakes her head. 'I don't know anything about that.'",
        show: {
          napkin: "Marnie reads it, then reads it again. She sets it down on the counter very gently, the way you set down something that might go off. 'That's his handwriting.' She doesn't cry. That would be easier to watch.",
          foreclosure: "Marnie reads the bank notice and goes pale under the flour. 'December? He never... he never said anything.'",
          photo: "'Thorne River, three springs ago. Fourteen pounds. He talked about that fish like it was a grandchild.'",
          receipt: "'Rick bought propane? We heat this place with oil.'",
          badge: "'Yes, I know who you are.'"
        }
      },

      rick: {
        name: 'Rick Sorensen', loc: 'lodge',
        names: ['rick', 'rick sorensen', 'sorensen', 'richard', 'partner', 'man'],
        here: "Rick Sorensen, Dale's business partner, sits by the fire in a too-new flannel shirt, staring into the flames with the expression of a man who rehearsed it in the mirror.",
        desc: "Fifty-ish, good teeth, expensive haircut, mud-spattered boots. His hands won't stay still.",
        talk: () => "Rick stands and grips your hand a little too long. 'Terrible thing. Terrible. Dale was like a brother to me. Whatever you need. Although I can't imagine what's left to investigate. The sea took him. It happens up here.'",
        topics: [
          { k: ['dale', 'brother', 'friend'], r: "'Best man I ever knew. Forty years on the water. Just goes to show you.' He doesn't say what it goes to show you." },
          { k: ['policy', 'insurance', 'beneficiary', 'claim', 'payout', 'money'], r: "'Dale insisted I be on it. Keep the lodge going, take care of Marnie through the business. It was his idea, ask anybody.' Nobody you could ask would know." },
          { k: ['bank', 'debt', 'foreclosure', 'loan', 'notice'], r: "'Lodges have rough seasons. That's business.' He smiles. It doesn't stay long." },
          { k: ['marnie', 'wife'], r: "'Marnie's a rock. A rock. We're going to look after her.'" },
          { k: ['cal', 'brenner', 'guide'], r: "'Cal's a drunk with a grudge. Whatever he tells you, check it twice.'" },
          { k: ['boat', 'skiff', 'kittiwake', 'night', 'weather'], r: "'He went out to check his crab pots. Said he'd be back by ten. He wasn't.'" },
          { k: ['thorne', 'cabin', 'river', 'trail', 'road', 'deer', 'hunting'], r: "Rick's hands find his pockets. 'Thorne? I don't get up that way much. Deer scouting, once or twice. Why?'" },
          { k: ['propane', 'receipt', 'fuel', 'gas'], r: "'I buy gas sometimes. I have a truck.'" },
          { k: ['rod', 'winston', 'rack'], r: "Rick glances at the empty slot on the rack and quickly looks away. 'Dale must have... I don't know. I don't fish.'" }
        ],
        askDefault: "Rick spreads his hands. 'No idea, friend.'",
        show: {
          napkin: "Rick reads it. A muscle in his jaw jumps. 'That's Dale's handwriting, sure. Could be about anything. A tournament. A bet.' He hands it back and doesn't look at you again.",
          receipt: "'So I bought propane. I... hunt. Deer camp.' Rick does not look like he's ever field-dressed anything bigger than a sandwich.",
          foreclosure: "'Rough couple of seasons. Every lodge has them.' He's sweating, and the fire isn't that warm.",
          topo_map: "Rick's face goes very still. 'Never seen it.' He says it too fast.",
          photo: "'Dale and his fish.' He laughs. It comes out wrong."
        }
      },

      joe: {
        name: 'Joe Kitka', loc: 'harbormaster',
        names: ['joe', 'joe kitka', 'kitka', 'harbormaster', 'harbor master'],
        here: 'Joe Kitka, the harbormaster, a broad man in faded rain gear, is drinking coffee out of a mug that says WORLD\'S OKAYEST GRANDPA.',
        desc: 'Sixty, steady, and weathered by fifty winters on the water. He looks at you like he looks at the sky: checking for trouble.',
        talk: (g) => {
          if (!g.flag('got_report')) {
            g.flag('got_report', true);
            g.moveItem('report', 'inv');
            return "'You'd be the insurance investigator.' Joe slides a photocopy across the desk. 'My incident report. I found her myself at first light on the eleventh, wallowing off Fish Egg with her gunwales almost under. No Dale.' He sips his coffee. 'Read it. Then ask me about the weather.'";
          }
          return "'Read the report,' Joe says. 'Then go take a look at that skiff. She's in the lodge boathouse, south of town.'";
        },
        topics: [
          { k: ['weather', 'night', 'wind', 'seas', 'calm', 'storm', 'water'], r: (g) => { g.clue('calm_night'); return "'Flat calm. Glass. You could have water-skied behind a kayak out there.' Joe sets down his mug. 'I've known Dale forty years. That man doesn't fall out of a boat on a night like that.'"; } },
          { k: ['dale', 'haugen'], r: "'Good boatman. Careful. Wore his kill-switch lanyard every time he left the dock. I used to give him grief about it.'" },
          { k: ['skiff', 'boat', 'kittiwake'], r: "'Towed her to the Harbor Light boathouse myself. Haven't touched her since. You should look her over.'" },
          { k: ['rick', 'sorensen'], r: "Joe's face doesn't change, which says plenty. 'Rick was on the dock at six that morning, before I even called it in. Early riser, I guess.'" },
          { k: ['marnie'], r: "'Marnie's tough as cedar. Go easy on her anyway.'" },
          { k: ['lanyard', 'kill', 'switch'], r: "'Every time. Forty years. Clipped to his wrist.'" },
          { k: ['island', 'fish egg'], r: "'Half a mile off the Craig shore. Strong swimmer in a survival suit could make it on a calm night. Not that anybody would.'" }
        ],
        askDefault: "Joe shrugs. 'Not my department.'",
        show: {
          report: "'That's my report. Read it.'",
          receipt: "Joe reads it, and his eyebrows go up a sixteenth of an inch. 'Morning after. Huh.'",
          napkin: "Joe reads it twice and hands it back. 'I didn't see that,' he says. 'And you should go see the troopers in Klawock.'"
        }
      },

      kenzie: {
        name: 'Kenzie', loc: 'fuel_dock',
        names: ['kenzie', 'attendant', 'teenager', 'girl', 'kid'],
        here: 'A teenage attendant in an oversized float coat is scrolling her phone in the shack doorway. Her name tag says KENZIE.',
        desc: 'Sixteen, bored and wearing a float coat three sizes too big. Paying more attention than she lets on.',
        talk: () => "Kenzie looks up from her phone. 'Gas, propane or bait?'",
        topics: [
          { k: ['rick', 'sorensen'], r: "'Mr. Sorensen? He came by the day after Mr. Haugen... you know. The twelfth, real early. Bought two propane tanks and a bunch of gas in cans and paid cash, which was weird because the lodge has an account.' She jerks her chin at the barrel. 'He threw the receipt in there. Nobody ever empties that barrel.'" },
          { k: ['dale', 'haugen'], r: "'He used to tip me in smoked salmon. Best tips on the dock.'" },
          { k: ['propane', 'gas', 'fuel', 'tanks'], r: "'Twenty-pound exchange is thirty bucks. Gas is eleven and change a gallon. Welcome to the island.'" },
          { k: ['receipt', 'barrel', 'trash'], r: "'Knock yourself out. Watch for herring.'" }
        ],
        askDefault: "Kenzie shrugs without looking up.",
        show: {
          receipt: "'Yep. That's the one. Told you nobody empties that barrel.'"
        }
      },

      cal: {
        name: 'Cal Brenner', loc: 'tavern',
        names: ['cal', 'cal brenner', 'brenner', 'guide', 'fisherman'],
        here: 'At the end of the bar, a sunburned fishing guide named Cal Brenner is nursing the last inch of a beer.',
        desc: 'Wiry, sun-wrecked and missing the tip of one finger. His hands have tied ten thousand knots.',
        talk: (g) => {
          if (!g.flag('cal_talked')) {
            return "Cal doesn't look up. 'Insurance. Great.' He tips his empty bottle at you. 'My throat's too dry to talk to insurance.'";
          }
          return "'Go up the Thorne,' Cal says. 'And don't drown in my waders.'";
        },
        topics: [
          { k: ['dale', 'haugen', 'rick', 'sorensen', 'thorne', 'wages', 'fight', 'marnie', 'boat', 'skiff'], r: (g) => g.flag('cal_talked') ? "'Told you what I know. Rick, Thorne Bay Road, every few days. Go look.'" : "Cal taps his empty bottle meaningfully." }
        ],
        askDefault: (g) => g.flag('cal_talked') ? "'No idea. Ask me about fishing sometime.'" : 'Cal taps his empty bottle meaningfully.',
        give: {
          beer: (g) => {
            g.moveItem('beer', null);
            g.flag('cal_talked', true);
            g.moveItem('waders', 'inv');
            g.clue('cal_tip');
            return "Cal takes the bottle, looks at it, looks at you. 'All right.' He drinks. 'Me and Dale had words about my wages. I wanted to deck him. But Dale Haugen didn't fall off a skiff on a flat calm night. He's run boats for forty years.'\n\nHe leans in. 'Funny thing. Rick's been driving up Thorne Bay Road every couple days since. Says he's scouting deer. Rick couldn't hit a deer with his truck.'\n\nHe looks you over. 'If you're going up the Thorne this time of year, the river's up. You'll want these.' He pulls a pair of patched chest waders from the duffel at his feet and pushes them at you.";
          }
        },
        show: {
          beer: "'Showing it to me is just cruel. GIVE it to me.'",
          napkin: "Cal reads it and lets out a long, low whistle. 'Sixty-forty. Dale always did drive a hard bargain.'"
        }
      },

      bonnie: {
        name: 'Bonnie', loc: 'tavern',
        names: ['bonnie', 'bartender', 'barkeep', 'barmaid'],
        here: 'Bonnie the bartender polishes a glass that was clean ten minutes ago.',
        desc: 'Sixty, silver bob, forearms like a deckhand. She has heard every story twice.',
        talk: () => "'What'll it be, hon? We've got beer and we've got beer.' (Try BUY BEER.)",
        topics: [
          { k: ['dale'], r: "'Dale and Rick sat right there two weeks back, heads together over a napkin like they were planning D-Day. Then they tipped big. Dale never tips big.'" },
          { k: ['rick'], r: "'Rick tips like a tourist. Lately he tips like a tourist who knows something.'" },
          { k: ['cal'], r: "'Cal's good people when he's dry. Buy him one and he'll tell you anything.'" },
          { k: ['napkin', 'napkins'], r: "'We've got a whole stack of them. Why?'" }
        ],
        askDefault: "'Couldn't tell you, hon.'",
        show: {
          napkin: "'That's one of ours, all right.' Bonnie squints at the handwriting. 'And that's what they were scribbling on. Huh.'"
        }
      },

      walt: {
        name: 'Walt', loc: 'totem_park',
        names: ['walt', 'walter', 'carver', 'old man', 'elder'],
        here: 'An older man in a canvas apron is shaping the cedar log with an adze, curls of red wood piling up around his boots.',
        desc: "Seventy-something, with a carver's forearms and a fisherman's squint. He knows this island the way you know your own kitchen.",
        talk: (g) => {
          g.flag('knows_cabin', true);
          return "Walt sets down the adze and looks you over. 'The insurance investigator. Small island. Everybody knows by now.' He nods toward the water. 'Dale Haugen ran boats out of Craig for forty years. I don't believe the water took him.'\n\nHe goes back to work, then adds without looking up: 'My nephew was hunting up off Thorne Bay Road last week. Says he saw a light in the old Forest Service cabin up the Thorne. Nobody rents that cabin in October.'";
        },
        topics: [
          { k: ['cabin', 'thorne', 'river', 'light', 'nephew'], r: (g) => { g.flag('knows_cabin', true); return "'Take Thorne Bay Road north off the highway to the trailhead. The trail goes east through the big trees to the river. The cabin's on the far bank. River's high this time of year. Don't try it in street clothes, and bring a light. It's dark under those trees.'"; } },
          { k: ['dale', 'haugen'], r: "'Good fisherman. Stubborn. The kind of man who'd rather lose everything than lose his pride. That's not always a good thing.'" },
          { k: ['rick', 'sorensen'], r: "'He's been driving up the Thorne road a lot. Not hunting. You don't hunt in loafers.'" },
          { k: ['totem', 'totems', 'pole', 'poles', 'carving', 'log', 'cedar', 'raven'], r: "'This one's for the school. Raven. It'll take me most of a year if I do it right, and I do it right.'" },
          { k: ['island', 'prince of wales', 'klawock'], r: "'People have lived here a very long time. Everything on this island remembers things. People forget that.'" }
        ],
        askDefault: "Walt keeps carving. 'Can't help you there.'",
        show: {
          topo_map: "Walt taps the pencil circle. 'That's the cabin. Like I said.'",
          photo: "'Thorne River steelhead. Dale always did love that river.'"
        }
      },

      reyes: {
        name: 'Sgt. Anna Reyes', loc: 'trooper',
        names: ['reyes', 'anna reyes', 'sergeant', 'sgt', 'sgt reyes', 'sergeant reyes', 'trooper', 'anna', 'officer'],
        here: 'Sergeant Anna Reyes sits behind the front desk, reading a report as though it personally offended her.',
        desc: "Fifty, compact and still in the way of someone who has been lied to by experts.",
        talk: () => "'Northbound Mutual,' she says, reading your badge without seeming to look at it. 'Coast Guard suspended the search on the thirteenth. Officially, Dale Haugen is missing and presumed drowned. Unofficially I've got a feeling, and feelings don't hold up in court.' She taps the desk. 'When you've got something real, come tell me who. ACCUSE and a name. Make it count.'",
        topics: [
          { k: ['dale', 'haugen'], r: "'Missing, presumed drowned. Unless you know something I don't.'" },
          { k: ['rick', 'sorensen'], r: "'Filed the claim four days after his partner vanished. Fast grief.'" },
          { k: ['marnie'], r: "'Lost her husband and her spot on the policy in the same season. If she's a suspect, she's the worst one I've ever seen.'" },
          { k: ['cal', 'brenner'], r: "'Cal's got two DUIs and a heart of gold. Not a killer.'" },
          { k: ['accuse', 'evidence', 'case', 'proof'], r: "'You tell me who did what, and you show me why. ACCUSE and the name. Or names.'" },
          { k: ['search', 'coast guard'], r: "'Helicopter out of Sitka flew it for two days. Nothing. Not a boot, not a hat.'" }
        ],
        askDefault: "'Not my problem today.'",
        show: {
          napkin: "Reyes reads it twice. 'This is interesting. It isn't proof Dale's alive, though. Just proof he and Rick were planning something.'",
          receipt: "'Propane in October, the morning after. Cash. Interesting.'",
          report: "'I've read it. Flat calm. That bugged me too.'",
          foreclosure: "'Motive. Doesn't tell me who did what.'",
          topo_map: "'Thorne River cabin. Have you been up there?'",
          badge: "'I know who you are.'"
        }
      },

      dale: {
        name: 'Dale Haugen', loc: 'cabin',
        names: ['dale', 'dale haugen', 'haugen', 'man', 'bill', 'stranger'],
        here: "A man with a week of gray stubble sits at the plank table, a cup of coffee halfway to his mouth. He looks exactly like the photo in your case file, minus the drowning.",
        desc: "Sixty-one, fit, sunburned and very much alive. He keeps glancing at the bamboo rod in the corner, like a man checking on a sleeping kid.",
        talk: (g) => daleTalk(g, false),
        topics: [
          { k: ['marnie', 'wife'], r: (g) => g.flag('dale_confessed') ? "'Forty years in June.' His voice cracks. 'She'd have stopped me. That's why I didn't tell her.'" : "'Don't know any Marnie.' He says it to his coffee." },
          { k: ['rick', 'sorensen'], r: (g) => g.flag('dale_confessed') ? "'Rick's idea. Rick's plan. My boat, though. And my hand on the plug.' He shakes his head. 'Don't let him tell you different.'" : "'Never heard of him.'" },
          { k: ['rod', 'winston', 'bamboo'], r: "'My father's. He bought it in 1952 with his first season's crab money.' A long pause. 'Rick told me to leave it. I couldn't do it.'" },
          { k: ['boat', 'skiff', 'kittiwake', 'plug', 'lanyard'], r: (g) => g.flag('dale_confessed') ? "'Pulled the plug off Fish Egg, swam for the island in a survival suit, and Rick picked me up on the back side. Forty years on the water and the hardest part was leaving that lanyard clipped to the console.'" : "'I don't know anything about boats.' A forty-year boatman, lying badly." }
        ],
        askDefault: (g) => g.flag('dale_confessed') ? "Dale just looks tired." : "'I'm just here for the fishing.'",
        show: {
          napkin: (g) => daleTalk(g, true),
          photo: (g) => g.flag('dale_confessed') ? "'Fourteen pounds. Best fish of my life.'" : "'Nice fish,' he says, too fast.",
          receipt: (g) => g.flag('dale_confessed') ? "'Rick's run. Every three days, like clockwork.'" : "He glances at the cylinders in the corner, then away.",
          badge: "He looks at the badge and closes his eyes for a second. 'Northbound Mutual. Of course.'"
        }
      }
    };

    function daleTalk(g, napkinShown) {
      if (g.flag('dale_confessed')) {
        return "'Just tell me Marnie's all right,' Dale says. 'I won't run. I'll be at the trooper post in Klawock by morning. You go tell Reyes.'";
      }
      if (napkinShown || evidenceCount(g) >= 3) {
        g.flag('dale_confessed', true);
        return "Dale looks at you for a long time. Then he puts down the coffee.\n\n'The lodge was going under,' he says. 'The bank was going to take everything. Marnie's kitchen, the boats, forty years. Rick said it would be clean. One flat night, pull the plug off Fish Egg, swim for the island in a survival suit, and he picks me up on the back side. I hole up here until the money comes through, and then we start over somewhere warm.'\n\nHe looks at the bamboo rod in the corner. 'Rick told me to leave that. Said a dead man doesn't take his rod with him.' He rubs his face with both hands. 'I couldn't leave it. Stupid.'\n\n'I'll come in,' he says finally. 'Go tell Reyes. Tell her it was my boat and my hand on the plug. And tell her it was Rick's idea.'";
      }
      return "'Name's Bill,' the man says. 'From Ketchikan. Just here for the fishing.' His eyes go to the bamboo rod in the corner and back to you. He's lying, and you both know it, but you don't have enough to make him stop. (You might want more evidence before you press him.)";
    }

    // ------------------------------------------------------------- accusing
    function accuse(g, names) {
      const who = new Set();
      const map = {
        dale: ['dale', 'haugen', 'bill'], rick: ['rick', 'sorensen', 'richard'], marnie: ['marnie', 'wife'],
        cal: ['cal', 'brenner'], joe: ['joe', 'kitka', 'harbormaster'], walt: ['walt', 'walter', 'carver'],
        kenzie: ['kenzie', 'attendant'], bonnie: ['bonnie', 'bartender'], reyes: ['reyes', 'sergeant', 'anna'],
        me: ['me', 'myself', 'self']
      };
      const words = names.split(/\s+/);
      for (const [id, keys] of Object.entries(map)) {
        if (keys.some((k) => words.includes(k))) who.add(id);
      }
      // "marnie haugen" shouldn't count as Dale.
      if (who.has('marnie') && words.includes('haugen') && !words.includes('dale')) who.delete('dale');

      if (who.size === 0) return "Reyes waits. 'Accuse who?'";
      if (who.has('me')) return "Reyes looks at you over her reading glasses. 'Go get some sleep.'";
      if (who.has('reyes')) return "'Bold,' Reyes says. 'Wrong, but bold.'";

      const others = [...who].filter((w) => w !== 'dale' && w !== 'rick');
      if (others.length) {
        const lines = {
          marnie: "'Marnie Haugen lost her husband and her spot on the policy in the same season. She's the one person in this whole mess who gets nothing.' Reyes shakes her head. 'Try again.'",
          cal: "'Cal's a lot of things, mostly hungover. He's not in this.'",
          joe: "'Joe found the boat and filed the report the same morning. He's the most honest man in Craig. Try again.'",
          walt: "Reyes stares at you. 'Walt? Walt is carving a raven for the elementary school. Try again.'",
          kenzie: "'She's sixteen and she pumps gas.' Reyes sighs. 'Try again.'",
          bonnie: "'Bonnie? Bonnie's the only reason half this island gets home at night. No.'"
        };
        return lines[others[0]];
      }

      const both = who.has('dale') && who.has('rick');
      if (both && g.has('found_dale')) {
        g.clue('solved');
        g.end(endingBest(g));
        return true;
      }
      if (both && g.has('napkin') && g.has('receipt')) {
        g.clue('solved');
        g.end(endingWarrant(g));
        return true;
      }
      if (both) {
        return "Reyes leans back. 'A dead man and his grieving partner. You've got a theory. Theories don't get warrants. Bring me something in writing, or bring me Dale.'";
      }
      if (who.has('dale')) {
        return g.has('found_dale')
          ? "'Dale didn't buy his own propane at the Craig fuel dock the morning after he drowned,' Reyes says. 'Somebody's keeping that cabin stocked. Who else are you naming?'"
          : "'Dale Haugen is legally missing and presumed drowned. Accusing a dead man of insurance fraud is a big swing. Prove he's alive.'";
      }
      // Rick alone
      return (g.has('napkin') || g.has('receipt') || g.has('found_dale'))
        ? "'Rick's in it up to his loafers, I'll give you that,' Reyes says. 'But he didn't pull this off alone. Who's his partner?'"
        : "'Rick's the beneficiary. That makes him lucky, not guilty. Bring me something solid.'";
    }

    function endingBest(g) {
      return [
        "Reyes listens to all of it: the flat calm, the pulled plug, the unworn kill switch, the empty slot on the rod rack, the napkin, the propane and the cabin up the Thorne. When you finish, she's quiet for a moment. Then she picks up the phone.",
        "By dark, Dale Haugen is sitting in the holding cell, sheepish and very much alive. He keeps his word and tells it straight. Rick Sorensen is picked up at the Klawock airstrip trying to catch the morning floatplane to Ketchikan, with a duffel bag and a story that falls apart in about four minutes.",
        'Claim #NM-1187 is denied. The fraud referral goes to the state. Your supervisor writes back: "Told you to look hard. Did you fall in a river?" You did not.',
        "Three weeks later a postcard shows up on your desk with a photo of the Harbor Light Lodge. 'Bank gave me until spring to refinance. Kitchen's still mine. — M.' And underneath, in smaller letters: 'The Winston is back on the rack. He asked me to keep it for him.'",
        '*** THE CASE IS CLOSED ***'
      ].join('\n\n');
    }

    function endingWarrant(g) {
      return [
        "Reyes reads the napkin, then the receipt, then the napkin again. 'Sixty-forty after the payout. Propane the morning after a drowning.' She picks up the phone. 'That'll get me a warrant for Rick's truck and a helicopter up the Thorne.'",
        "The next afternoon, troopers find Dale Haugen in the Forest Service cabin up the Thorne River, alive, warm and holding his '52 Winston like a life jacket. Rick Sorensen gets picked up at the Klawock airstrip with a duffel bag and a story that doesn't hold.",
        'Claim #NM-1187 is denied. Your supervisor\'s email says "Good work!" with only one exclamation point. Reyes got the collar. You get the paperwork. (Next time, try finding Dale yourself.)',
        '*** THE CASE IS CLOSED ***'
      ].join('\n\n');
    }

    // ------------------------------------------------------------- the map
    // Room positions live on each room (map: { x, y, label }) in grid units:
    // x grows east, y grows south, one step per exit. This is the scenery
    // drawn underneath them, in the same units.
    const mapGeo = {
      view: { x0: -2.2, y0: -1.1, x1: 8.7, y1: 8.1 },
      // Prince of Wales Island is huge; this is the middle of it, so the
      // outline runs off the top and bottom of the sheet.
      coast: [
        [-0.3, -2.2], [3.5, -2.4], [7.6, -2.0], [8.0, -1.2], [7.85, -0.4], [8.0, 0.5],
        [7.5, 1.2], [6.8, 1.7], [6.75, 2.4], [7.2, 3.0], [7.6, 4.0], [7.3, 5.0],
        [7.7, 6.0], [7.4, 7.0], [7.7, 8.0], [7.4, 9.2], [3.5, 9.6], [-0.4, 9.2],
        [-0.65, 8.0], [-0.45, 7.2], [-0.6, 6.4], [-0.55, 5.2], [-0.55, 4.4], [-0.55, 3.6],
        [-0.85, 3.0], [-0.7, 2.4], [-0.9, 1.6], [-0.5, 0.8], [-0.6, 0.0], [-0.3, -0.8]
      ],
      islets: [
        { x: -1.35, y: 5.55, rx: 0.32, ry: 0.28, label: 'Fish Egg I.' }
      ],
      rivers: [
        { label: 'Thorne R.', lx: 5.55, ly: 1.05, pts: [[5.3, 1.6], [5.9, 1.25], [6.4, 0.6], [6.5, 0.0], [6.75, -0.5], [7.3, -0.6], [7.95, -0.55]] },
        { label: 'Harris R.', lx: 5.6, ly: 3.75, pts: [[4.8, 1.35], [4.6, 2.0], [4.75, 2.7], [5.4, 3.25], [6.3, 3.5], [7.25, 3.2]] }
      ],
      labels: [
        { text: 'PRINCE OF WALES ISLAND', x: 5.0, y: 5.95, size: 30, rotate: -8, cls: 'island' },
        { text: 'CLARENCE STRAIT', x: 8.25, y: 4.6, size: 18, rotate: 90, cls: 'water' },
        { text: 'BUCARELI BAY', x: -1.75, y: 2.4, size: 18, rotate: -90, cls: 'water' },
        { text: 'Thorne Bay', x: 8.3, y: -0.2, size: 14, rotate: 90, cls: 'water' }
      ]
    };

    // ---------------------------------------------------------------- hints
    function hint(g) {
      const st = g.state;
      if (!st.flags.read_case_file) return 'Start by reading your case file: READ FILE.';
      if (!g.has('calm_night')) return "The harbormaster in Craig found the skiff. From the ferry, head west, west, then south to Craig, then west to the harbor and north to his office. TALK TO JOE, then read what he gives you or ASK JOE ABOUT WEATHER.";
      if (!g.flag('got_key')) return 'Visit the Harbor Light Lodge, south of Craig. Talk to Marnie in the kitchen.';
      if (!g.has('lanyard')) return 'The Kittiwake is in the lodge boathouse, south of the great room. Examine the skiff.';
      if (!g.has('rod_missing')) return 'Take a careful look at the rod rack in the lodge great room.';
      if (!g.has('photo')) return "Something on Dale's desk might be more than decoration. Try READ PHOTO.";
      if (g.itemState('safe').locked) return "The back of the photo has three numbers on it, and the safe has a three-number dial. Try DIAL followed by those numbers.";
      if (!g.has('napkin') || !g.has('foreclosure')) return 'Read everything in the safe.';
      if (!g.has('topo_map')) return "Open the desk drawer in Dale's office and read what you find.";
      if (!g.has('receipt')) return 'The fuel dock is west of the Craig harbor. Ask the attendant about Rick, and search the trash barrel.';
      if (!g.isOwned('waders')) return 'Cal at the Riptide Tavern (east of Front Street in Craig) knows the rivers. He looks thirsty. BUY BEER, then GIVE BEER TO CAL.';
      if (!g.isOwned('flashlight')) return 'The glovebox of your rental truck, back at the Hollis ferry terminal. OPEN GLOVEBOX.';
      if (!g.has('found_dale')) {
        if (!g.itemState('flashlight').on) return 'Turn on the flashlight before you head under the old growth: TURN ON FLASHLIGHT.';
        if (!g.isWorn('waders')) return 'You will need to WEAR WADERS to cross the Thorne.';
        return 'From the highway, take Thorne Bay Road north to the trailhead, then go east along the trail and across the river.';
      }
      if (!g.flag('dale_confessed')) return 'Talk to Dale. Show him the napkin if he stonewalls you.';
      return 'Go to the State Troopers post in Klawock and ACCUSE whoever is responsible. Maybe more than one person.';
    }

    // ------------------------------------------------------------ intro etc.
    const intro = [
      'NO SAFE HARBOR',
      'A Prince of Wales Island Mystery',
      '',
      'Late October. Southeast Alaska.',
      '',
      "Dale Haugen, a fishing-lodge owner who's run boats for forty years, went out in his skiff on a calm night and never came back. His business partner is now in line for a $1.5 million life insurance payout.",
      '',
      "You're the investigator Northbound Mutual sent to find out why.",
      '',
      'Type HELP for instructions or HINT if you get stuck.'
    ].join('\n');

    return {
      title: 'No Safe Harbor',
      start: 'ferry',
      maxScore: Object.values(clues).reduce((s, c) => s + c.points, 0),
      intro, clues, rooms, items, npcs, hint, mapGeo,
      ranks: [
        [100, 'Master Investigator of the Tongass'],
        [80, 'Special Investigations Ace'],
        [60, 'Senior Investigator'],
        [40, 'Field Adjuster'],
        [20, 'Desk Jockey'],
        [0, 'Fresh Off the Ferry']
      ]
    };
  }

  root.NSH = root.NSH || {};
  root.NSH.buildWorld = buildWorld;
  if (typeof module === 'object' && module.exports) module.exports = { buildWorld };
})(typeof window !== 'undefined' ? window : globalThis);
