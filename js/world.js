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
    // ------------------------------------------------------------- driving
    // Towns and roads are too far apart to walk, so road exits need the
    // rental truck. Your truck follows you: wherever you drive, it's parked.
    const hasKeys = (g) => g.inInv('truck_keys') || g.itemAt('truck_keys', 'truck_cab');
    const truckLoc = (g) => g.itemState('truck').loc;

    // Turning the key. The first start of the trip is the memorable one.
    function startLine(g) {
      if (!g.flag('started_once')) {
        g.flag('started_once', true);
        return 'You turn the key. The engine coughs, thinks about it, catches on the second try and settles into a rattle.';
      }
      // A little variety, chosen by turn so it doesn't repeat back to back.
      const lines = [
        'You turn the key and the engine rattles to life.',
        'The engine turns over on the first try, for once.',
        'You turn the key. The old six grumbles, shakes off the damp and settles into an idle.',
        'The starter whines a moment, then the engine catches with a cough of blue smoke.',
        'You crank it. The truck starts, and the wipers start too, whether you asked them to or not.',
        'The engine catches. Somewhere under the dash, something rattles in sympathy.'
      ];
      const pick = g.state.flags.last_start_line;
      let n = g.state.turns % lines.length;
      if (n === pick) n = (n + 1) % lines.length;
      g.state.flags.last_start_line = n;
      return lines[n];
    }

    function startEngine(g) {
      // Standing next to the truck: get in, then start it.
      if (g.state.loc !== 'truck_cab' && truckLoc(g) === g.state.loc && hasKeys(g)) {
        const block = getInTruck(g);
        if (typeof block === 'string') return block;
      }
      if (g.state.loc !== 'truck_cab') return truckLoc(g) === g.state.loc ? "You'd need the keys for that." : `Your truck is parked back at ${g.rooms[truckLoc(g)].name}.`;
      if (!hasKeys(g)) return "You'd need the keys for that.";
      if (g.flag('engine_on')) return "It's already running. Where to? Try DRIVE WEST (or any direction the road goes), or DRIVE TO a place you've been.";
      g.flag('engine_on', true);
      g.pendingAnswer = { template: 'drive to %', places: true }; // "Where to?" "Klawock."
      return startLine(g) + " Where to? Try DRIVE WEST (or any direction the road goes), or DRIVE TO a place you've been.";
    }

    function stopEngine(g) {
      if (g.state.loc !== 'truck_cab') return "It isn't running.";
      if (!g.flag('engine_on')) return "The engine's already off.";
      g.flag('engine_on', false);
      return 'You turn the key back. The engine shudders and quits. Rain fills in the quiet.';
    }

    // Stepping out of the cab, on foot, from wherever the truck is parked.
    function leaveCab(g) {
      if (g.flag('engine_on')) {
        g.flag('engine_on', false);
        g.print('You kill the engine and climb out.', 'travel');
      } else {
        g.print('You climb out of the pickup.', 'travel');
      }
      return null;
    }

    // Leaving the Sweetwater cabin by skiff. Forgot Hazel's oars? The Forest Service pair is by the door.
    function pushOff(g) {
      if (!g.inInv('oars')) {
        g.flag('fs_oars_taken', true);
        g.print("You don't have Hazel's oars, so you take the Forest Service pair from beside the door. Dale watches you go and doesn't say a word. You climb into the skiff and push off.", 'travel');
      } else {
        g.print('You climb back into the skiff and push off from the float.', 'travel');
      }
      return null;
    }

    // Getting into the truck: unlock it on the way if you have the keys.
    function truckDoor(g) {
      if (g.flag('truck_unlocked')) return null;
      if (!hasKeys(g)) return "The truck's locked. Rental companies are trusting, but not that trusting. The keys must be around here somewhere.";
      g.flag('truck_unlocked', true);
      g.print('(You thumb the key fob. The locks clunk open.)');
      return null;
    }

    // PUSH FOB: unlocks the truck if it's in sight, locks it if it's already open.
    function pressFob(g) {
      if (!hasKeys(g)) return "You'd need the keys in your hand first.";
      if (g.state.loc === 'truck_cab') return 'You press the fob from the driver\'s seat. The locks clunk down and pop back up. Deeply satisfying.';
      if (truckLoc(g) !== g.state.loc) return 'You press the fob. Somewhere out of sight, your truck probably chirps.';
      if (!g.flag('truck_unlocked')) {
        g.flag('truck_unlocked', true);
        return 'You press the fob. The locks clunk open and the lights blink. Your chariot awaits.';
      }
      g.flag('truck_unlocked', false);
      return "You press the fob. The locks clunk shut and the horn gives a little chirp. Locked, which on this island makes you look like a tourist. (It'll unlock again when you get in.)";
    }

    function getInTruck(g) {
      const block = truckDoor(g);
      if (block) return block;
      g.moveTo('truck_cab');
      return true;
    }

    // A road you drive. text is the drive itself; stop is why you pull over at the end and climb out.
    // On a multi-stop DRIVE TO, the stop is only told where the trip ends or you go on foot.
    function road(to, text, stop) {
      return {
        to,
        drive: true,
        guard: (g) => {
          const inCab = g.state.loc === 'truck_cab';
          if (!inCab && truckLoc(g) !== g.state.loc) {
            return `That's a drive, not a walk, and your truck is parked back at ${g.rooms[truckLoc(g)].name}.`;
          }
          if (!hasKeys(g)) {
            return g.state.loc === 'ferry'
              ? "It's nearly thirty miles of muskeg and mountains to Klawock, and the rain is coming in sideways. You're not walking. Your rental pickup is right there in the lot. You just need the keys."
              : "You'd need the truck keys for that.";
          }
          if (!g.flag('truck_unlocked')) g.flag('truck_unlocked', true);
          // Narrate getting in and starting up only when it actually happens: not when you're
          // already behind the wheel with the engine running, and not mid-trip.
          let lead = '';
          if (!g.drivingNow) {
            if (!inCab) lead += 'You climb into the pickup. ';
            if (!g.flag('engine_on')) lead += startLine(g) + ' ';
          }
          let tail = '';
          if (g.isWorn('waders') && !g.flag('waders_drive_joke')) {
            g.flag('waders_drive_joke', true);
            tail = " You are driving in chest waders. On this island, nobody will look twice.";
          }
          g.drivingNow = true;
          g.moveItem('truck', to);
          // You arrive parked, with the engine off and ticking.
          g.flag('engine_on', false);
          g.state.flags.parked_turn = g.state.turns;
          if (g.passingThrough) {
            g.print(lead + text + tail, 'travel');
            g.pendingStop = stop;
          } else {
            g.print(lead + text + tail + ' ' + stop, 'travel');
          }
          return null;
        }
      };
    }

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
      rick_note: {
        points: 5,
        title: 'Rick moved him to Sweetwater',
        note: "Note left in the empty Thorne River cabin, signed R: Walt's nephew got nosy, so Rick moved 'D' to the Forest Service cabin on Sweetwater Lake, near Coffman Cove, and took the skiff's oars so nobody else could row over."
      },
      hazel_tip: {
        points: 5,
        title: 'Groceries for two, and borrowed oars',
        note: "Hazel at the Coffman Cove store: Rick has been buying groceries for two twice a week, paying cash. Last week he borrowed her spare oars 'for the Sweetwater skiff' and never brought them back."
      },
      found_dale: {
        points: 10,
        title: 'Dale Haugen is alive',
        note: "Found Dale Haugen alive and well in the Forest Service cabin on Sweetwater Lake, with the missing Forest Service oars by the door and his '52 Winston in the corner."
      },
      solved: {
        points: 10,
        title: 'Case closed',
        note: 'Reported the fraud to Sgt. Reyes.'
      }
    };

    // Clues Dale can't talk his way around.
    const HARD_EVIDENCE = ['calm_night', 'lanyard', 'rod_missing', 'foreclosure', 'napkin', 'receipt', 'rick_note', 'hazel_tip'];
    const evidenceCount = (g) => HARD_EVIDENCE.filter((c) => g.has(c)).length;

    // ---------------------------------------------------------------- rooms
    const rooms = {
      ferry: {
        map: { at: [-132.6223, 55.4915], site: 'hollis' },
        name: 'Hollis Ferry Terminal',
        aliases: ['ferry', 'hollis', 'ferry terminal', 'hollis ferry'],
        dial: (g, nums) => {
          const st = g.itemState('lockbox');
          const code = nums.join('');
          if (!g.flag('seen_keypad')) {
            if (!g.flag('read_case_file')) return "Enter it into what? You haven't seen anything around here with a keypad.";
            // The case file told you where to look.
            g.flag('seen_keypad', true);
            g.print("(The case file said the keys are in a lockbox on the terminal wall. There it is: a gray steel box by the door, with a four-digit keypad.)");
          }
          if (!st.locked) return 'The lockbox is already open.';
          if (code === '1187') {
            st.locked = false;
            st.open = true;
            return 'You punch in 1-1-8-7. The lockbox beeps twice and its little door pops open.\n' + g.contentsLine('lockbox');
          }
          return `You punch in ${code}. The keypad gives an unhappy beep and blinks red.`;
        },
        desc: (g) => (g.state.visited.hwy || g.state.turns > 3
          ? 'The Hollis ferry dock, empty and gray, with Clarence Strait chopping away beyond it. Spruce and hemlock crowd the hill above the small terminal building and the gravel lot. The road runs west into the trees.'
          : 'The inter-island ferry groans away from the dock behind you, back across Clarence Strait toward Ketchikan. Rain blows in sideways off the water, fine as mist and twice as wet. Spruce and hemlock crowd the hill above a small gray terminal building and a gravel lot. The only road out runs west into the trees.'),
        exits: {
          west: road('hwy', "You pull out of the ferry lot and head west, wipers slapping, into a tunnel of dripping spruce. Eleven miles in, your tires drum across a bridge over a fast, high river.",
            "On the far side a road forks off to the left, and its sign is too peppered with birdshot to read at speed. You pull onto the shoulder for a closer look, kill the engine and climb out into the rain.")
        },
        exitNotes: { east: 'East is Clarence Strait, three hours of it, and then Ketchikan. The ferry just left.' }
      },

      truck_cab: {
        name: 'In Your Rental Pickup',
        aliases: ['truck', 'pickup', 'cab', 'car', 'rental truck', 'rental'],
        mapAs: (g) => truckLoc(g),
        desc: (g) => "You're in the driver's seat of your rental pickup: cracked vinyl, a windshield with a star-shaped crack, and a salmon-shaped air freshener that smells like neither pine nor salmon. The glovebox is in front of the passenger seat, and an AM/FM radio with one working knob sits in the dash. Rain drums on the roof. Through the windshield: " + g.rooms[truckLoc(g)].name + ".\n\nYou can DRIVE any direction the road goes, DRIVE TO a place you've been, or get OUT.",
        // From the cab you can drive (or step out and walk) anywhere the parking spot leads.
        exitsFn: (g) => {
          const ex = {};
          for (const [dir, exit] of Object.entries(g.rooms[truckLoc(g)].exits)) {
            if (dir === 'in' || dir === 'out') continue;
            // Roads you drive. Anything else, you get out and walk.
            ex[dir] = typeof exit === 'object' && exit.drive
              ? exit
              : { to: typeof exit === 'string' ? exit : exit.to, guard: (gg) => leaveCab(gg) };
          }
          ex.out = { to: (gg) => truckLoc(gg), guard: (gg) => leaveCab(gg) };
          return ex;
        },
        exits: { out: { to: (g) => truckLoc(g), guard: (g) => leaveCab(g) } },
        noExit: "The road doesn't go that way.",
        sit: "You're already sitting. It's the best part of the job.",
        listen: (g) => (g.flag('engine_on') ? 'The engine rattling along, one cylinder not quite convinced. Rain drumming on the roof.' : 'Rain drumming on the roof. The engine ticking as it cools.'),
        smell: 'Old coffee, wet dog (there is no dog) and air freshener.',
        scenery: {
          'windshield, crack, window, glass': (g) => `A star-shaped crack in the lower corner, slowly working its way across. Through the glass: ${g.rooms[truckLoc(g)].name}.`,
          'seat, seats, vinyl, drivers seat, passenger seat': 'Cracked vinyl patched with duct tape. Out here, duct tape is basically a structural material.',
          'air freshener, freshener, salmon freshener': { desc: 'A cardboard air freshener shaped like a salmon. It smells like neither pine nor salmon. It smells like regret.', smell: 'Regret, with notes of pine.' },
          'radio, stereo': {
            desc: 'An AM/FM radio with one working knob.',
            turnon: "You find the one station that comes in: a call-in swap show. 'Got a forty-horse Evinrude, runs great, will trade for a chest freezer or a good dog.' You turn it back off.",
            push: "You find the one station that comes in: a call-in swap show. 'Lost: one brown dog, answers to Halibut.' You turn it back off.",
            listen: 'Static, then a swap show, then static.'
          },
          'ignition, engine, steering wheel, wheel, dashboard, dash, gauges, key': {
            desc: (g) => 'The steering wheel is worn smooth at ten and two. The gas gauge says three-quarters, which on this island means "enough, probably." ' + (g.flag('engine_on') ? 'The engine is running.' : 'The engine is off.'),
            turnon: (g) => startEngine(g),
            turnoff: (g) => stopEngine(g),
            push: (g) => startEngine(g)
          },
          'cup holder, old cup, coffee cup': { desc: "Someone's old coffee cup, abandoned. There's a fuzzy island growing in it. You leave it alone.", drink: 'No. Absolutely not.' },
          'rearview mirror, mirror': 'You look tired. Rental-car tired.',
          'floor, floor mat, mats, ticket stub, stub': 'Gravel, a ferry ticket stub and a single Cheerio.',
          'truck, pickup, rental, cab': {
            desc: "Your home away from home: a rental pickup that smells like old coffee and has opinions about second gear.",
            turnon: (g) => startEngine(g),
            turnoff: (g) => stopEngine(g)
          },
          'roof, rain': 'Rain drumming on the roof, steady as a snare drum. It is oddly cozy in here.'
        }
      },

      hwy: {
        map: { at: [-132.8361, 55.4479], site: 'harris' },
        name: 'Hollis–Klawock Highway',
        aliases: ['highway', 'hwy', 'road', 'bridge', 'harris river', 'harris river bridge'],
        desc: "The two-lane highway winds through muskeg and second-growth forest, past old clearcuts filling back in with alder. Here it crosses the Harris River on a concrete bridge. Below, the river runs high and tea-colored from the fall rain, and you'd swear a steelhead just rolled in the tailout. Just past the bridge a green sign, shot full of holes but readable up close, points south down the Hydaburg Highway: HYDABURG 40. East goes back to the Hollis ferry. West, the highway climbs over the hills to Klawock Lake and Klawock.",
        exits: {
          east: road('ferry', "You drive back east down the Harris River valley, eleven miles of muskeg and old clearcuts, until the gray water of Clark Bay opens up ahead.",
            "You pull into the ferry lot, park and climb out."),
          west: road('klawock', "West on the highway, over the hills and down along Klawock Lake, shining like hammered tin through the alders for miles. A school bus passes going the other way and the driver lifts two fingers off the wheel. Everybody waves here. Fourteen miles from the bridge, you roll down into Klawock.",
            "You park in the middle of town and climb out.")
        },
        exitNotes: { south: "That's the Hydaburg Highway, forty miles of it down to Hydaburg, the Kaigani Haida town on Sukkwan Strait. Haida families from the old villages of Howkan, Sukkwan and Klinkwan came together there in 1911, and they raised their totem park in 1939. It's a beautiful drive. Your case is the other way." },
        fish: "No rod, no license and no time. The steelhead will have to wait. They're good at that."
      },

      thorne_road: {
        map: { at: [-132.8775, 55.6959], site: 'control' },
        name: 'Control Lake Junction',
        aliases: ['control lake junction', 'control lake', 'junction', 'big salt road', 'thorne bay road'],
        desc: 'Big Salt Road ends at a T in the trees beside Control Lake, which is as still as poured pewter. Old logging spurs branch off into the hills, most of them gated and all of them muddy. The Thorne Bay Road runs east along the Thorne River valley. The North Prince of Wales Road heads north, the long way to Sweetwater Lake and Coffman Cove. Big Salt Road runs back southwest to Klawock.',
        exits: {
          southwest: road('klawock', "Back down Big Salt Road, sixteen miles past muskeg and the tide flats of Big Salt Lake, into Klawock.",
            "You park in the middle of town and climb out."),
          east: road('trailhead', "East toward Thorne Bay, eight miles of gravel and potholes down the Thorne River valley. The river shows through the trees on your left now and then, big and tea-colored.",
            "Just past where it swings close to the road, you spot a pullout and the words THORNE RIVER TRAIL. You pull in, kill the engine and climb out. It's very quiet."),
          north: road('sweetwater_turnoff', "North on the North Prince of Wales Road, then east on the Coffman Tie: twenty-eight miles of gravel, clearcuts and second growth, with a doe in the ditch every few miles. Finally a big, dark lake opens up through the trees beside the road.",
            "You pull over at the turnoff for it, kill the engine and climb out to have a look.")
        },
        exitNotes: { northwest: "The North Prince of Wales Road keeps going north to Naukati, Whale Pass and the limestone country of the north end, where El Capitan Cave runs two miles into the mountain. It's the biggest known cave in Alaska. Not today." }
      },

      trailhead: {
        map: { at: [-132.7001, 55.6831], site: 'thorne' },
        name: 'Thorne River Trailhead',
        aliases: ['trailhead', 'pullout', 'thorne river trailhead'],
        desc: "A gravel pullout off the Thorne Bay Road, at the edge of serious forest. A brown Forest Service sign, bullet-pocked in one corner, marks a trail heading northeast into the old growth toward the Thorne River. The mud here is churned up with tire tracks, and one set is a lot fresher than the rest. The Thorne Bay Road runs back west to the Control Lake junction.",
        exits: {
          west: road('thorne_road', "You bump back out of the pullout and head west, eight miles of gravel and potholes back to the junction at Control Lake.",
            "Roads run off three ways from here, so you pull over to get your bearings and climb out."),
          northeast: 'river_trail'
        },
        exitNotes: { east: "The road goes on to Thorne Bay, which was the biggest logging camp in North America once. On the way, the Kasaan Highway branches south to Kasaan, where Naay I'waans, the Great House, has stood since 1880. It's the last Haida clan house left in Alaska. Neither one is your case today." }
      },

      river_trail: {
        map: { at: [-132.6907, 55.6893], site: 'thorne' },
        name: 'Old-Growth Trail',
        aliases: ['trail', 'old growth', 'forest', 'old-growth trail'],
        dark: true,
        darkExits: ['southwest'],
        darkMove: "You take two steps into the black, get a face full of devil's club and think better of it. You need a light.",
        desc: "Under the old growth it's dusk at noon. Sitka spruce as big around as your truck and moss-draped hemlocks wall in the trail, and the ground is a sponge of devil's club and deer fern. Your flashlight picks out the path, and in the mud, a heavy boot print pointing northeast. The rush of the river gets louder ahead to the northeast. The trailhead is back to the southwest.",
        exits: { southwest: 'trailhead', northeast: 'ford' }
      },

      ford: {
        map: { at: [-132.6812, 55.6955], site: 'thorne' },
        name: 'Thorne River Crossing',
        aliases: ['river', 'ford', 'crossing', 'thorne river', 'river ford'],
        desc: "The trail ends at a gravel bar on the Thorne River. The river is big here, running high and cold and the color of strong tea, pushing hard over a riffle that crosses to the far bank to the northeast. Through the trees on the other side you can make out a cabin roof. No smoke from the chimney. The trail runs back southwest into the forest.",
        exits: {
          southwest: 'river_trail',
          northeast: {
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
        fish: "Even without a rod you can read it: the seam along the far bank, the soft water behind that boulder. Whoever picked that cabin picked it for the water."
      },

      cabin: {
        map: { at: [-132.6795, 55.6968], site: 'thorne' },
        name: 'Thorne River Cabin',
        aliases: ['thorne cabin', 'thorne river cabin', 'cabin'],
        desc: 'A one-room cabin of weathered spruce logs. The Forest Service rents it out in summer, and nobody uses it this late in the year. Somebody did, though, and not long ago. Two propane cylinders stand next to a cold propane heater, a cardboard box is full of empty cans, and the bunk has been stripped to bare planks. A bright orange survival suit hangs from a nail by the door. Whoever was here left in a hurry, maybe a few days back. The door leads southwest, back across the river.',
        exits: { southwest: 'ford', out: 'ford' }
      },

      // ----- the north end: Coffman Cove country
      dog_creek: {
        map: { at: [-132.8131, 55.9907], site: 'dog' },
        name: 'Dog Creek',
        aliases: ['dog creek'],
        desc: "South of Coffman Cove, the road runs right alongside Dog Creek. The creek is clear and quick over clean gravel, and the bank is trampled flat where the bears come down to fish. Just downstream, a black bear sow and her cub are working the shallows and ignoring you completely. Down the valley to the north you can see rooftops and the gray water beyond the town. A gravel side road signed HALF DOG ROAD climbs off to the east. The road goes north into town and south over the hill toward Luck Lake.",
        exits: {
          north: road('coffman_cove', "You follow the creek two miles downhill until the trees open up on salt water and gulls.",
            "You park in town and climb out."),
          south: road('luck_lake', "South over the hill on the Coffman Cove Loop, seven or eight miles of it. Then a lake shows through the trees on your left, so still it looks painted.",
            "You turn down the access road, park by the water and climb out.")
        },
        fish: 'Coho fry are flicking in the shallows along the road. The sow is fishing. The cub is supervising. You, sadly, are only watching.'
      },

      luck_lake: {
        map: { at: [-132.7680, 55.9520], site: 'luck' },
        name: 'Luck Lake',
        aliases: ['luck lake', 'luck'],
        desc: "A gravel access road leads down to the Luck Lake day-use area at the north end of the lake: a rock beach, a covered picnic shelter and an outhouse with a crescent moon on the door. Eagle Creek slips out of the lake right beside the beach, headed for the strait. The lake stretches away to the south, long and narrow and dark, with the clouds sitting low on the hills on either side. A loon calls from somewhere out on the water. The road runs back north over the hill to Dog Creek and Coffman Cove.",
        exits: {
          north: road('dog_creek', "Back up the access road and north over the hill on the Coffman Cove Loop. A doe and twin fawns stand in the ditch and watch you pass with no particular concern. The road tips downhill and picks up Dog Creek.",
            "Where the creek bends close to the road, something big and black moves on the gravel bar. You pull over to watch, then ease out of the cab, keeping the pickup between you and the creek.")
        },
        fish: "Cutthroat are rising off the mouth of Eagle Creek, one after another, like they know. You do not have a rod. This should be illegal."
      },

      sweetwater_turnoff: {
        map: { at: [-132.9294, 55.9560], site: 'sweetwater' },
        name: 'Sweetwater Pullout',
        aliases: ['sweetwater pullout', 'sweetwater turnoff', 'pullout', 'turnoff'],
        desc: 'A muddy pullout on the Coffman Cove Loop, where the road runs along the east shore of Sweetwater Lake. A brown Forest Service sign points down a short trail to the west: SWEETWATER LAKE. You can see the water through the trees, close enough to hear it. The road runs northeast to Coffman Cove and back south, the long way, to Control Lake.',
        exits: {
          west: {
            to: 'sweetwater_landing',
            guard: (g) => { g.print('You follow the trail down: two hundred feet of roots, puddles and slick spruce needles.', 'travel'); return null; }
          },
          northeast: road('coffman_cove', "Northeast toward town, seven miles of gravel, across Coffman Creek where it spills into the lagoon behind town. Then the road tips downhill and the cove opens up below you, gray and wide.",
            "You park in town and climb out."),
          south: road('thorne_road', "Back south: the Coffman Tie, then the long road down the middle of the island, twenty-eight miles of gravel to the junction at Control Lake.",
            "Roads run off three ways from here, so you pull over to get your bearings and climb out.")
        }
      },

      sweetwater_landing: {
        map: { at: [-132.9305, 55.9566], site: 'sweetwater' },
        name: 'Sweetwater Lake Landing',
        aliases: ['sweetwater landing', 'landing', 'sweetwater', 'boat landing'],
        desc: (g) => 'A gravel landing on the east shore of Sweetwater Lake, at the bottom of the short trail from the road. ' + (g.flag('skiff_used') ? 'The Forest Service skiff is pulled up on the gravel, right side up, where you left it.' : 'A Forest Service skiff lies upside down on the bank.') + ' Half a mile up the shore to the north, smoke rises from the stovepipe of a small log cabin. The trail climbs back east to the road.',
        exits: {
          east: { to: 'sweetwater_turnoff', guard: (g) => { g.print('You climb back up the trail to the road.', 'travel'); return null; } },
          north: {
            to: 'sweetwater_lake',
            guard: (g) => {
              if (!g.inInv('oars')) {
                return "You could flip the skiff, but somebody has taken the oars. Paddling half a mile of October lake with your hands is a good way to end up in Joe Kitka's next incident report.";
              }
              g.print(g.flag('skiff_used')
                ? 'You push the skiff back into the shallows, drop the oars into the oarlocks and push off.'
                : 'You flip the skiff, drag it into the shallows, drop the oars into the oarlocks and push off. The lake is black and glassy, and every stroke sounds enormous.', 'travel');
              g.flag('skiff_used', true);
              return null;
            }
          }
        },
        row: (g) => { g.go('north'); return true; }
      },

      sweetwater_lake: {
        map: { at: [-132.9345, 55.9600], site: 'sweetwater' },
        name: 'Sweetwater Lake',
        aliases: ['sweetwater lake', 'middle of the lake', 'lake'],
        desc: "You're in the Forest Service skiff on Sweetwater Lake, a short way off the east shore, oars dripping. The water is dark as coffee and so still that the clouds hang in it upside down. The lake runs on for miles to the southwest. Back to the south is the landing. Ahead to the north, a small cedar log cabin sits above a little float on the shore, smoke curling from its stovepipe.",
        exits: {
          south: { to: 'sweetwater_landing', guard: (g) => { g.print('You row back to the landing and drag the skiff up onto the gravel.', 'travel'); return null; } },
          north: { to: 'sweetwater_cabin', guard: (g) => { g.print("You row the last stretch and bump up against the cabin's little float. You tie off, climb out and walk up to the door.", 'travel'); return null; } }
        },
        row: () => 'Which way? Row NORTH to the cabin or SOUTH back to the landing.',
        noExit: 'The lake runs on for miles, but the cabin is north and the landing is south.',
        fish: 'A trout rises ten feet from the boat. Then another. No rod. Life is cruel and specific.'
      },

      sweetwater_cabin: {
        map: { at: [-132.9326, 55.9631], site: 'sweetwater' },
        name: 'Sweetwater Lake Cabin',
        aliases: ['sweetwater cabin', 'sweetwater lake cabin'],
        desc: (g) => "A twelve-by-fourteen cabin of pre-cut cedar logs above the east shore of the lake, with wooden bunks, a table and benches, and a woodstove ticking with heat. Somebody has moved in for the long haul: a sleeping bag on the lower bunk, groceries stacked under the table and paperbacks on the windowsill. " + (g.flag('fs_oars_taken') ? '' : 'A pair of oars leans by the door. ') +
          (g.itemAt('winston', 'sweetwater_cabin') ? 'In the corner, in a place of honor, stands a bamboo fly rod. ' : '') +
          'The float and the skiff are back down the path to the south.',
        exits: {
          south: { to: 'sweetwater_lake', guard: (g) => pushOff(g) },
          out: { to: 'sweetwater_lake', guard: (g) => pushOff(g) }
        },
        row: (g) => { g.go('south'); return true; },
        onEnter: (g) => { g.clue('found_dale'); }
      },

      coffman_cove: {
        map: { at: [-132.8278, 56.0139], site: 'coffman' },
        name: 'Coffman Cove',
        aliases: ['coffman cove', 'coffman'],
        desc: "The road ends where the trees give up and Clarence Strait begins. Coffman Cove started out as a logging camp and has never quite stopped looking like one: houses and trailers scattered along the cove, woodpiles under blue tarps, a school, a community hall, and more skiffs parked in yards than trucks. Dog Creek comes down its valley and runs out onto the beach just east of town. The general store is up the street to the north, and the harbor is down Harbor Avenue to the west, on the cove. The Coffman Cove Road heads southwest toward Sweetwater Lake, and the loop road runs south up the Dog Creek valley.",
        exits: {
          in: 'cove_store',
          south: road('dog_creek', "You head south out of town and up the valley, the creek flashing through the alders.",
            "At a bend, something big and black moves on the gravel bar. You pull over to watch, then ease out of the cab, keeping the pickup between you and the creek."),
          southwest: road('sweetwater_turnoff', "Southwest out of town, across Coffman Creek where it runs into the lagoon, then seven miles of gravel until a big, dark lake opens up through the trees.",
            "You pull over at the turnoff for it, kill the engine and climb out to have a look."),
          north: 'cove_store',
          west: 'cove_harbor'
        }
      },

      cove_store: {
        map: { at: [-132.8285, 56.016], site: 'coffman' },
        name: 'Cove General Store',
        aliases: ['store', 'general store', 'cove store', 'shop'],
        desc: "A low building with a covered porch, a woodstove going in the middle of the floor, and narrow aisles of everything: canned goods, chainsaw chain, ammunition, birthday candles, rain gear and fishing tackle, plus a cooler of bait next to a cooler of milk. A coffee pot sits on the woodstove for anyone who wants it. By the register, a hand-lettered sign: COFFMAN COVE. POP.: ENOUGH. The door is south.",
        exits: { south: 'coffman_cove', out: 'coffman_cove' },
        buy: (g, what) => {
          if (/coffee|cup/.test(what)) return "Hazel waves at the pot on the woodstove. 'Help yourself. Coffee's free. Advice costs extra.' You pour a cup. It's good.";
          if (/oar/.test(what)) return g.inInv('oars') ? "You've already got her spare pair." : "'Not for sale,' Hazel says. 'Talk to me first.'";
          if (/bait|herring|tackle|lure|fly|flies/.test(what)) return "'You got a rod?' Hazel asks. You do not have a rod. 'Then no.'";
          return "Hazel rings it up in her head, decides you don't need it, and goes back to her crossword.";
        }
      },

      cove_harbor: {
        map: { at: [-132.8298, 56.0119], site: 'coffman' },
        name: 'Coffman Cove Harbor',
        aliases: ['cove harbor', 'coffman harbor', 'coffman cove harbor', 'boat harbor'],
        desc: "A small boat harbor tucked behind a rock breakwater: a few dozen slips of skiffs and crabbers, and one old seiner that hasn't left the dock in a decade. Up the shore to the north is the old ferry terminal where the inter-island ferry used to come in, now mostly a concrete apron and a gull convention. Beyond the breakwater the cove opens out flat and sheltered toward the strait. A black lab trots along the floats like he's the harbormaster. Harbor Avenue climbs back east into town.",
        exits: { east: 'coffman_cove' },
        fish: "A kid on the old ferry ramp hauls in a pink salmon and holds it up for you to see. You give him a thumbs up. You are jealous of a twelve-year-old."
      },

      klawock: {
        map: { at: [-133.0848, 55.5522], site: 'klawock' },
        name: 'Klawock',
        aliases: ['klawock', 'town'],
        desc: "A small town on a wide inlet, where woodsmoke mixes with the smell of low tide. Klawock, Lawáak in Tlingit, is one of the oldest communities on the island and home of the Heinyaa Ḵwáan, whose people have fished these waters for longer than anyone has written anything down. This is the heart of town, where Big Salt Road comes down to meet the highway, with a grocery store, a few businesses and houses strung along the road. Down by the water, rotting pilings mark where one of Alaska's first salmon canneries stood. The Alaska State Troopers post is a low building just across the highway to the northwest. The totem park is a short walk west along the highway and up the hill above the harbor. The highway runs east back toward Hollis and, the other way, over the bridge and south to Craig, and Big Salt Road heads northeast toward Control Lake and the Thorne River.",
        exits: {
          in: 'trooper',
          east: road('hwy', "You head east out of Klawock along Klawock Lake and over the hills. Twenty-five minutes of curves and muskeg later, you're back at the river.",
            "You pull onto the shoulder at the fork to get your bearings and climb out to stretch your legs."),
          west: 'totem_park',
          northwest: 'trooper',
          south: road('craig', "South along the water. Bald eagles sit on the light poles like they are waiting for a bus. Six miles later, the road drops down into Craig.",
            "You park on Front Street and climb out."),
          northeast: road('thorne_road', "You head north out of Klawock past the wide tide flats of Big Salt Lake, then climb northeast through second growth and old clearcuts. Sixteen miles later the road runs out at a junction in the trees.",
            "Roads run off three ways from here and none of the signs are worth reading, so you pull over to get your bearings and climb out.")
        }
      },

      totem_park: {
        map: { at: [-133.0977, 55.5538], site: 'klawock' },
        name: 'Klawock Totem Park',
        aliases: ['totem park', 'park', 'totems', 'poles'],
        desc: "Totem poles line the hillside above the town and the inlet, more than twenty of them, red cedar weathered to silver-gray. Their figures watch the water: Raven, Eagle, Killer Whale, Wolf, Bear. The poles came from Tuxekan, the old winter village up the coast, and some have been recarved by Klawock hands as the old ones gave out. A wooden plaque stands at the foot of the path. Next to a carving shed at the edge of the park, a fresh cedar log rests on sawhorses, halfway to becoming something with wings. The path leads down the hill to the highway, and east along it back to the middle of town.",
        listen: 'Rain ticking on the cedar. The scrape of an adze. Down below, a raven says something long and complicated, and another one answers.',
        smell: 'Fresh-cut red cedar, sweet and sharp, over the salt of the inlet.',
        exits: { east: 'klawock', down: 'klawock' }
      },

      trooper: {
        map: { at: [-133.0864, 55.5529], site: 'klawock' },
        name: 'Alaska State Troopers Post',
        aliases: ['troopers', 'trooper post', 'post', 'trooper', 'police'],
        desc: "A small, overheated office with a coffee maker that has seen things, a wall map of Prince of Wales Island stuck full of pins and an empty holding cell. The door out to the highway is southeast.",
        exits: { southeast: 'klawock', out: 'klawock' },
        accuse: (g, names) => accuse(g, names)
      },

      craig: {
        map: { at: [-133.1507, 55.4773], site: 'craig' },
        name: 'Craig — Front Street',
        aliases: ['craig', 'front street', 'downtown'],
        desc: "Craig is the biggest town on Prince of Wales, a working fishing town of about a thousand people, and the boats are the first thing you notice: seiners, trollers and skiffs filling the harbors, nets piled on the floats, gulls working every one of them. Its old Tlingit name is Shaan Seet. People came here to gather herring eggs off Fish Egg Island, just offshore, long before there was a town. Front Street sits on Craig Island, the old part of town, joined to the big island by a causeway: a few blocks of shops and tidy houses facing the water, with mountains behind the bay when the clouds lift. East along Main Street and over the causeway is South Cove Harbor. The neon OPEN sign of the Riptide Tavern glows just up the street to the west. The highway heads out over the causeway and north to Klawock, and the road south past Shelter Cove leads toward the Harbor Light Lodge.",
        exits: {
          in: 'tavern',
          north: road('klawock', "North out of Craig with the water on your left and the hills on your right. Fifteen minutes later you coast into Klawock.",
            "You park in the middle of town and climb out."),
          east: 'harbor',
          west: 'tavern',
          south: road('lodge_road', "You head out of town past the last houses, spray flying from the potholes.",
            "A mile and a half along, a carved sign swings in the wind: HARBOR LIGHT LODGE. You park on the shoulder by the sign and climb out.")
        }
      },

      harbor: {
        map: { at: [-133.1429, 55.4761], site: 'craig' },
        name: 'South Cove Harbor',
        aliases: ['harbor', 'docks', 'floats', 'south cove'],
        desc: 'Seiners, trollers and skiffs rock gently in their slips along the floats and finger piers. One slip near the ramp sits empty. Gulls argue on the pilings. North, at the head of the ramp where the highway crosses the causeway, is the harbormaster\'s office. The fuel dock is north of town, out J.T. Brown Drive. Front Street is back west on Craig Island.',
        exits: { west: 'craig', north: 'harbormaster' }
      },

      harbormaster: {
        map: { at: [-133.1432, 55.4771], site: 'craig' },
        name: "Harbormaster's Office",
        aliases: ['harbormaster', 'office', "harbormaster's office"],
        desc: 'A cramped office. A VHF radio crackles on the shelf and tide tables are taped to the window. A chart of the waters around Craig covers the desk, with a coffee ring right on Fish Egg Island. The door opens south onto the harbor ramp. Out front, the highway runs north toward the fuel dock and Klawock.',
        exits: {
          south: 'harbor',
          out: 'harbor',
          north: { to: 'fuel_dock', guard: (g) => { g.print('A good half hour on foot: north along the highway around Crab Bay, then out J.T. Brown Drive past the seafood plant, in a steady rain.', 'travel'); return null; } }
        }
      },

      fuel_dock: {
        map: { at: [-133.1405, 55.4886], site: 'craig' },
        name: 'Fuel Dock',
        aliases: ['fuel dock', 'fuel', 'gas dock'],
        desc: 'A fuel float at the end of J.T. Brown Drive, north of downtown, tucked behind a seafood plant: two fuel pumps, a caged rack of propane cylinders and a tiny shack selling ice, bait and chips. A rusty trash barrel stands next to the shack. J.T. Brown Drive leads back south to the highway and the harbormaster\'s office.',
        exits: {
          south: { to: 'harbormaster', guard: (g) => { g.print('You walk back out J.T. Brown Drive and the half hour south along the highway, around Crab Bay, to the harbormaster\'s office.', 'travel'); return null; } }
        }
      },

      tavern: {
        map: { at: [-133.1526, 55.4769], site: 'craig' },
        name: 'Riptide Tavern',
        aliases: ['tavern', 'riptide', 'bar', 'riptide tavern'],
        desc: 'Dim and warm, smelling of fryer oil and wet wool. Glass fishing floats hang from the ceiling, stools line a long cedar bar, a jukebox glows in the corner under a muted TV, and the bulletin board by the door is buried in flyers for skiff sales and lost dogs. Front Street is out the door to the east.',
        exits: { east: 'craig', out: 'craig' },
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
        map: { at: [-133.1220, 55.4660], site: 'lodge' },
        name: 'Lodge Road',
        aliases: ['lodge road', 'shore road'],
        desc: "A gravel road hugs the shore southeast of town. Back across the water to the northwest, the dark hump of Fish Egg Island sits low under the clouds, ringed with kelp. Somewhere out there, the Kittiwake was found drifting. The road leads north back to Craig and south to the Harbor Light Lodge.",
        exits: {
          in: 'harbormaster',
          in: 'lodge',
          north: road('craig', "You head back north along the shore and into Craig.",
            "You park on Front Street between a crab-pot trailer and a truck with a bumper sticker that says MY OTHER CAR IS A SKIFF, and climb out."),
          south: 'lodge'
        }
      },

      lodge: {
        map: { at: [-133.122, 55.4652], site: 'lodge' },
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
        map: { at: [-133.1214, 55.4652], site: 'lodge' },
        name: 'Lodge Kitchen',
        aliases: ['kitchen'],
        desc: 'A big working kitchen with steel counters, a six-burner range and a walk-in cooler humming in the corner. It smells like bread and coffee. The window over the sink looks out at Fish Egg Island. The great room is back west.',
        exits: { west: 'lodge', out: 'lodge' }
      },

      office: {
        map: { at: [-133.1226, 55.4652], site: 'lodge' },
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
        map: { at: [-133.122, 55.4647], site: 'lodge' },
        name: 'Boathouse',
        aliases: ['boathouse', 'boat house'],
        desc: 'A drafty boathouse on pilings over the water, smelling of two-stroke oil and seaweed. Life jackets and crab pots hang from the rafters, and survival suits hang on a row of pegs by the door. An 18-foot aluminum skiff sits on a trailer in the middle of the floor, KITTIWAKE stenciled on her bow. A path leads north back up to the lodge.',
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
          'TRAVEL: Rental pickup (Island Auto Rental) is waiting in the Hollis',
          'ferry lot. Keys are in the Island Auto lockbox on the terminal wall.',
          'Lockbox code: the last four digits of this claim number.',
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
        name: 'rental truck', short: 'your rental pickup', loc: 'ferry', fixed: true, listed: true,
        names: ['truck', 'pickup', 'rental', 'rental truck', 'pickup truck', 'car', 'vehicle', 'truck door', 'tailgate', 'bed', 'truck bed', 'truckbed', 'pickup bed'],
        roomDesc: (g) => {
          if (!g.flag('started_once')) return 'Your rental pickup sits in the gravel lot, beaded with rain.';
          return g.state.flags.parked_turn === g.state.turns
            ? 'Your rental pickup is parked right behind you, its engine ticking as it cools.'
            : 'Your rental pickup is parked here, beaded with rain.';
        },
        desc: (g) => "A white pickup with a cracked windshield, mud up to the door handles and 140,000 miles of island gravel on it. A faded ISLAND AUTO RENTAL sticker is peeling off the tailgate, and the bed holds a spare tire, a tangle of ratchet straps and an inch of rainwater. " +
          (g.flag('truck_unlocked') ? "It's unlocked. GET IN to drive." : 'The doors are locked. Through the window you can see a glovebox and a salmon-shaped air freshener.'),
        fixedMsg: "It's a truck. You drive it, you don't carry it.",
        verbs: {
          enter: (g) => getInTruck(g),
          open: (g) => getInTruck(g),
          unlock: (g) => {
            if (g.flag('truck_unlocked')) return "It's already unlocked.";
            if (!hasKeys(g)) return "You'll need the keys. Rental companies are trusting, but not that trusting.";
            g.flag('truck_unlocked', true);
            return 'You thumb the fob. The locks clunk open and the lights blink.';
          },
          turnon: (g) => startEngine(g),
          turnoff: (g) => stopEngine(g),
          push: 'You give the tire a kick. Solid. The tire, not your foot.',
          knock: 'You knock on the door. Nobody is home. You are the person who would be home.',
          touch: 'Wet. Cold. Mud.'
        }
      },
      truck_keys: {
        name: 'truck keys', short: 'a set of truck keys', loc: 'lockbox',
        names: ['keys', 'truck keys', 'truck key', 'key fob', 'fob', 'car keys', 'car key', 'rental keys'],
        desc: 'A Ford key on a plastic ISLAND AUTO RENTAL fob, plus a bottle opener shaped like a halibut. Island priorities.',
        verbs: {
          use: (g) => pressFob(g),
          push: (g) => pressFob(g),
          turnon: (g) => pressFob(g),
          drop: (g) => {
            if (g.state.loc !== 'truck_cab') return false;
            g.moveItem('truck_keys', 'truck_cab');
            return 'You leave the keys in the ignition. On this island, that is practically a tradition.';
          }
        }
      },
      lockbox: {
        name: 'lockbox', short: 'a lockbox', loc: 'ferry', fixed: true,
        names: ['lockbox', 'lock box', 'key box', 'keybox', 'keypad', 'gray box', 'box'],
        container: true, openable: true, open: false, locked: true,
        desc: (g) => { g.flag('seen_keypad', true); return 'A gray steel lockbox screwed to the terminal wall, with ISLAND AUTO RENTAL stenciled on it and a four-digit keypad on the front. ' + (g.itemState('lockbox').open ? 'Its little door is open.' : "It's shut tight."); },
        lockedMsg: (g) => { g.flag('seen_keypad', true); return "It's locked. There's a four-digit keypad on the front. (Type ENTER and the code, like ENTER 1234.)"; },
        verbs: {
          unlock: () => 'It has a keypad, not a keyhole. (Type ENTER and the code.)',
          push: (g) => { g.flag('seen_keypad', true); return 'You press a few keys at random. The keypad beeps unhappily.'; }
        }
      },
      glovebox: {
        name: 'glovebox', short: 'a glovebox', loc: 'truck_cab', fixed: true,
        names: ['glovebox', 'glove box', 'glove compartment', 'compartment'],
        container: true, openable: true, open: false,
        desc: (g) => "The truck's glovebox, held shut by a latch and a strip of duct tape. It's " + (g.itemState('glovebox').open ? 'open.' : 'closed.')
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
        desc: "Wide truck tires with an aggressive tread. The freshest tracks run over yesterday's, and yesterday's run over the day before's. Somebody comes out here a lot. And lately, the freshest set doesn't stop here at all. It keeps going north up the road."
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
        desc: 'Thigh-deep across the riffle and moving like it has somewhere to be. The cabin on the far bank is more interesting than the water. For once.'
      },
      smoke: {
        name: 'cabin roof', loc: 'ford', fixed: true,
        names: ['cabin roof', 'roof', 'chimney', 'smoke', 'cabin'],
        desc: "A mossy cabin roof through the spruce on the far bank. No smoke from the chimney. Either nobody's home, or somebody's being careful."
      },
      heater: {
        name: 'propane heater', loc: 'cabin', fixed: true,
        names: ['heater', 'propane heater', 'stove'],
        desc: 'A portable propane heater, cold to the touch. Somebody kept this cabin warm for a while, then stopped.'
      },
      cylinders: {
        name: 'propane cylinders', loc: 'cabin', fixed: true,
        names: ['cylinders', 'propane cylinders', 'propane', 'tanks', 'cylinder', 'tank'],
        desc: 'Two 20-pound propane cylinders, both empty. One still has the price sticker on it: CRAIG FUEL DOCK.'
      },
      bunk: {
        name: 'bunk', loc: 'cabin', fixed: true,
        names: ['bunk', 'bed', 'planks'],
        desc: 'Bare planks. Somebody rolled up their sleeping bag and took it with them.'
      },
      rick_note: {
        name: 'folded note', short: 'a folded note', loc: 'cabin',
        names: ['note', 'folded note', 'paper', 'ricks note', 'rick note', 'coffee can'],
        roomDesc: 'A folded piece of paper sits on the table, weighted down with a coffee can.',
        desc: 'A sheet of lined paper, folded in quarters. Try reading it.',
        text: "In neat block capitals. Not Dale's hand:\n  'D — Walt's nephew was up here with a spotlight. Too many eyes\n   on the Thorne. Thursday I'll move you to the Sweetwater cabin.\n   Different road, and nobody goes up there in October. I'll take\n   the Forest Service oars across so nobody else can row over.\n   Bring the rod if you have to. Leave the rest. BURN THIS. — R'\n\nNobody in this case burns anything.",
        onRead: (g) => { g.clue('rick_note'); g.flag('knows_sweetwater', true); }
      },
      oars: {
        name: 'oars', short: 'a pair of oars', loc: null,
        names: ['oars', 'oar', 'pair of oars', 'spare oars', 'hazels oars'],
        desc: 'A pair of spruce oars, worn pale at the grips, with HAZEL burned into each blade.',
        verbs: {
          use: (g) => (g.state.loc === 'sweetwater_landing' ? (g.go('west'), true) : "There's nothing here to row."),
          drop: (g) => (g.state.loc === 'sweetwater_lake' ? 'You are not letting go of your only oars in the middle of a lake.' : false)
        }
      },
      fs_skiff: {
        name: 'Forest Service skiff', loc: 'sweetwater_landing', fixed: true,
        names: ['skiff', 'forest service skiff', 'boat', 'oarlocks', 'chain', 'padlock'],
        desc: (g) => 'A 14-foot aluminum Forest Service skiff, ' + (g.flag('skiff_used') ? 'pulled up on the gravel where you left it, its chain trailing to a tree and an open padlock.' : 'upside down on two logs and chained to a tree with an open padlock.') + ' A sign screwed to the transom: USDA FOREST SERVICE — PFDs NOT PROVIDED. The oarlocks are there. ' + (g.inInv('oars') ? "The oars weren't, but you brought Hazel's." : 'The oars are not.'),
        fixedMsg: "It's a boat. You row it. (Try ROW or WEST.)",
        verbs: { enter: (g) => { g.go('west'); return true; }, push: (g) => { g.go('west'); return true; } }
      },
      winston: {
        name: "'52 Winston bamboo rod", short: 'a bamboo fly rod', loc: 'sweetwater_cabin', fixed: true,
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
        desc: "Up close, the figures are bigger than you expected: a killer whale with a raven for its dorsal fin, an eagle with its wings folded, a wolf, a bear, a frog tucked at the base. The paint has gone soft with eighty years of rain, black and red and blue-green. You know enough to know you can't read them. Each one is a record, someone's crests and history set in cedar, and the stories behind them belong to the clans who own them. You stand there longer than you meant to.",
        verbs: {
          touch: (g) => (g.npcHere('walt')
            ? "You reach out, then stop. Walt hasn't said anything, but he's watching. You put your hand down.\n\n'Gunalchéesh,' he says. 'People mean well. But old cedar doesn't like hands, and these aren't ours to handle. They belong to the families.'"
            : 'You reach out, then think better of it and put your hand in your pocket. The plaque asked nicely.'),
          climb: "You don't even finish the thought. Those poles are somebody's grandparents, more or less, and you were raised better than that.",
          take: "That's someone's history. You keep your hands to yourself.",
          push: "You keep your hands to yourself. These have stood eighty years in Klawock and a lot longer before that, and they don't need your help."
        }
      },
      wall_map: {
        name: 'wall map', loc: 'trooper', fixed: true,
        names: ['map', 'wall map', 'pins'],
        desc: 'Prince of Wales Island, stuck full of colored pins. A red one sits just off Fish Egg Island.'
      },
      coffee_maker: {
        name: 'coffee maker', loc: 'trooper', fixed: true,
        names: ['coffee', 'coffee maker', 'pot'],
        desc: "Brewing something that smells like burnt tires and determination.",
        verbs: {
          drink: "You pour a cup into a styrofoam cup. It tastes like it was brewed during the last election. You drink all of it anyway.",
          smell: 'Burnt tires. Determination.'
        }
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
        desc: "Channel 16, crackling. Somebody named Lyle wants everyone to know the halibut aren't biting.",
        verbs: { listen: "'...Craig harbor, this is the Marlene, coming in with a bent prop and a bad attitude, over.'" }
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
        names: ['desk', 'oak desk'],
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
        text: "A neat pencil circle surrounds a tiny black square on the far bank of the Thorne River, northeast of a trailhead on the Thorne Bay Road. It's labeled CABIN. In the margin, in Dale's blocky hand:\n  'propane x2. groceries. Rick every 3 days.'",
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
        names: ['napkin', 'folded napkin', 'bar napkin'],
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
        hiddenUntil: (g) => g.has('lanyard'),
        names: ['lanyard', 'kill switch', 'kill-switch', 'killswitch', 'console', 'kill-switch lanyard', 'cord'],
        desc: "A coiled red cord clipped to the console's kill switch. If someone's wearing it and goes overboard, the engine stops. It's clipped to the boat, not to a person.",
        onExamine: (g) => { g.clue('lanyard'); }
      },
      drain_plug: {
        name: 'drain hole', loc: 'boathouse', fixed: true,
        hiddenUntil: (g) => g.has('lanyard'),
        names: ['plug', 'drain', 'drain plug', 'drain hole', 'chain', 'transom', 'keeper chain'],
        desc: "A clean, undamaged threaded drain hole. The keeper chain hangs empty. Plugs don't unscrew themselves.",
        onExamine: (g) => { g.clue('lanyard'); }
      },
      crab_pots: {
        name: 'crab pots', loc: 'boathouse', fixed: true,
        names: ['pots', 'crab pots', 'crab pot', 'life jackets', 'life jacket', 'jackets', 'jacket', 'pfd', 'rafters'],
        desc: 'Crab pots, life jackets and a lifetime of gear, all hung with care. The life jackets are faded HARBOR LIGHT LODGE orange.',
        fixedMsg: "You leave the lodge's gear where it hangs. Marnie would notice. Marnie notices everything.",
        verbs: { wear: "You leave the lodge's gear where it hangs. Marnie would notice. Marnie notices everything." }
      },
      fish_egg: {
        name: 'Fish Egg Island', loc: 'lodge_road', fixed: true,
        names: ['island', 'fish egg island', 'fish egg', 'kelp', 'water'],
        desc: 'Low, dark and close, maybe a half mile offshore. People lived there long before there was a Craig; the shell middens are still in the banks, and every spring the herring come in to spawn along its shores and families go out for the eggs. A strong swimmer in a survival suit could make it in a flat calm. Interesting thought.'
      }
    };

    // ----------------------------------------------------------------- npcs
    const npcs = {
      marnie: {
        name: 'Marnie Haugen', loc: 'kitchen',
        role: "Dale's wife. Cooks at the lodge.",
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
          { k: ['suit', 'survival', 'immersion'], r: "'His survival suit? He hated that thing. Said it made him look like a traffic cone. He only wore it crossing to Ketchikan in winter.' She frowns. 'Why?'" },
          { k: ['bread', 'coffee', 'kitchen', 'food'], r: "'Bread doesn't care what kind of week you're having. That's why I like it.'" },
          { k: ['weather', 'rain', 'night', 'calm'], r: "'That night was dead calm. I stood at that window and watched the water go pink at sunset. Pretty as anything.'" },
          { k: ['cal', 'brenner', 'guide'], r: "'Cal guided for us for six seasons. He and Dale fought about wages at the end of the summer. Cal drinks, but he's no liar. He's probably at the Riptide.'" },
          { k: ['money', 'bank', 'debt', 'foreclosure', 'loan', 'notice'], r: "'Dale did the books. I did everything else.' She stops kneading. 'Why? What's wrong with the money?'" },
          { k: ['office', 'key', 'safe', 'desk'], r: "'He kept the important things in that safe. I never knew the combination. He said I'd remember it if I ever needed it. I never needed it.'" },
          { k: ['cabin', 'thorne', 'river'], r: "'Dale fished the Thorne every spring. Steelhead. He'd come home soaked and smiling.'" },
          { k: ['coffman', 'cove', 'luck', 'hazel', 'sweetwater', 'wedding'], r: "'We started out in Coffman Cove. Dale set chokers for the logging camp and I cooked for the crew. We got married on the beach at Luck Lake.' For the first time, she smiles. 'It rained.'" }
        ],
        askDefault: "Marnie shakes her head. 'I don't know anything about that.'",
        show: {
          napkin: "Marnie reads it, then reads it again. She sets it down on the counter very gently, the way you set down something that might go off. 'That's his handwriting.' She doesn't cry. That would be easier to watch.",
          foreclosure: "Marnie reads the bank notice and goes pale under the flour. 'December? He never... he never said anything.'",
          photo: "'Thorne River, three springs ago. Fourteen pounds. He talked about that fish like it was a grandchild.'",
          receipt: "'Rick bought propane? We heat this place with oil.'",
          badge: "'Yes, I know who you are.'",
          office_key: "'Keep it until you're done,' Marnie says. 'I don't want it back in my pocket yet.'"
        }
      },

      rick: {
        name: 'Rick Sorensen', loc: 'lodge',
        role: "Dale's business partner, and the new beneficiary.",
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
          { k: ['suit', 'survival', 'immersion'], r: "'His survival suit? I... wouldn't know anything about that.' Rick looks at the fire very hard." },
          { k: ['belize', 'caribbean', 'warm'], r: "Rick laughs a little too loudly. 'Belize? Who said anything about Belize?'" },
          { k: ['sweetwater', 'coffman', 'hazel', 'oars', 'luck'], r: "Rick's left eye twitches. 'Coffman Cove? Never been. Long drive. Bad road.' Rick has a lot of opinions about a road he's never driven." },
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
        role: 'Craig harbormaster. Found the skiff.',
        names: ['joe', 'joe kitka', 'kitka', 'harbormaster', 'harbor master'],
        here: 'Joe Kitka, the harbormaster, a broad man in faded rain gear, is drinking coffee out of a mug that says WORLD\'S OKAYEST GRANDPA.',
        desc: 'Sixty, steady, and weathered by fifty winters on the water. He looks at you like he looks at the sky: checking for trouble. There is a silver bracelet on his wrist, engraved with an eagle.',
        thanks: (g, lang) => {
          if (lang === 'haida') return "Joe's eyebrows go up, and then he laughs, a big one that rattles the window. 'Háw'aa! Where'd you pick that up? My granny would have fed you till you couldn't stand.'";
          if (lang === 'tlingit') return "'Gunalchéesh. That's Tlingit. Walt up in Klawock would be proud of you.' Joe grins. 'Me, I'm Haida on my mom's side, and we go by the mother's side. We say háw'aa. Either way, you're welcome.'";
          return "Joe raises the mug an inch. 'Don't thank me yet. Thank me when you've found him.'";
        },
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
          { k: ['suit', 'survival', 'immersion'], r: "'Survival suit? Not for crab pots in Bucareli Bay. Not in October on a flat calm. That's what you'd wear to swim.' He looks at you over his mug. 'Why do you ask?'" },
          { k: ['tide', 'tides', 'slack'], r: "'High tide 9:42 that night. Slack around ten. Not that it matters to a man in a boat.'" },
          { k: ['mug', 'grandpa', 'grandkids'], r: "'Grandkids gave it to me. Okayest. I'll take it.'" },
          { k: ['island', 'fish egg'], r: "'Half a mile off the Craig shore. Strong swimmer in a survival suit could make it on a calm night. Not that anybody would.' He sips. 'There was a village on Fish Egg, long before Craig. You can still see the shell middens. Herring spawn all along there in the spring, and people have been coming for the eggs since forever. That's why it's called that.'" },
          { k: ['haida', 'kaigani', 'family', 'mom', 'mother', 'bracelet', 'eagle'], r: "'My dad was Tlingit, from Sitka. My mom's people are Kaigani Haida, from Howkan, before everybody moved to Hydaburg.' He turns the bracelet on his wrist. 'Eagle side. We go by the mother, so I'm Haida. The Kaigani came north from Haida Gwaii, three hundred years ago, give or take, and made a home on the south end. Smallpox came through twice and took most of them. We're still here.'" },
          { k: ['hydaburg', 'howkan', 'sukkwan', 'klinkwan'], r: "'Hydaburg. Nineteen eleven, Howkan and Sukkwan and Klinkwan all moved to one place, so the kids could have a school. My grandma never stopped calling Howkan home. Good totem park down there now. And the kids are learning the language again. Xaad Kíl. Better than I ever spoke it.'" },
          { k: ['kasaan', 'longhouse', 'naay', 'great house', 'son-i-hat'], r: "'Kasaan. Chief Son-i-Hat built Naay I'waans in 1880, the Great House. It's the last Haida clan house left in Alaska. It was falling down for years. Then they fixed it, the right way, with Stormy Hamar carving, and in 2016 they opened it again.' He looks into his mug. 'I drove the grandkids over for it. Best day I've had in a long time. You go, sometime. Ask before you take pictures.'" },
          { k: ['craig', 'town', 'shaan seet', 'history'], r: "'Shaan Seet, the old name. A man named Craig Millar put up a saltery out on Fish Egg in 1907, with a Haida crew, and the town got named for him. Funny how that goes.'" }
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
        role: 'Runs the Craig fuel dock. Notices things.',
        names: ['kenzie', 'attendant', 'teenager', 'girl', 'kid'],
        here: 'A teenage attendant in an oversized float coat is scrolling her phone in the shack doorway. Her name tag says KENZIE.',
        desc: 'Sixteen, bored and wearing a float coat three sizes too big. Paying more attention than she lets on.',
        talk: () => "Kenzie looks up from her phone. 'Gas, propane or bait?'",
        topics: [
          { k: ['rick', 'sorensen'], r: "'Mr. Sorensen? He came by the day after Mr. Haugen... you know. The twelfth, real early. Bought two propane tanks and a bunch of gas in cans and paid cash, which was weird because the lodge has an account.' She jerks her chin at the barrel. 'He threw the receipt in there. Nobody ever empties that barrel.'" },
          { k: ['dale', 'haugen'], r: "'He used to tip me in smoked salmon. Best tips on the dock.'" },
          { k: ['propane', 'gas', 'fuel', 'tanks'], r: "'Twenty-pound exchange is thirty bucks. Gas is eleven and change a gallon. Welcome to the island.'" },
          { k: ['receipt', 'barrel', 'trash'], r: "'Knock yourself out. Watch for herring.'" },
          { k: ['herring', 'eggs', 'roe', 'spring', 'kelp', 'hemlock', 'grandma', 'fish egg', 'island'], r: "For the first time she puts the phone down. 'Every spring, when the herring come in to spawn, me and my grandma go out to Fish Egg. You sink hemlock branches, or you find the good kelp, and the herring lay their eggs all over it, thick as frosting. Then you pick it and dry it and give most of it away. Elders first.' She grins. 'Herring eggs with a little seal oil. Best food on earth. Fight me.'" },
          { k: ['shaan seet', 'craig', 'town'], r: "'Shaan Seet's the old name. My grandma only ever calls it that. Craig is some guy who had a fish saltery.'" },
          { k: ['school', 'phone'], r: "'School's fine. We're doing Haida and Tlingit this year, both. I'm better at the songs than the grammar.' She goes back to the phone. 'Don't tell anyone I said school's fine.'" }
        ],
        thanks: (g, lang) => (lang
          ? "Kenzie looks up, surprised, and actually smiles. 'Hey. Not bad. Most people who come off the ferry can't even say Klawock.'"
          : "'Mm-hm.' She doesn't look up, but she does wave."),
        askDefault: "Kenzie shrugs without looking up.",
        show: {
          receipt: "'Yep. That's the one. Told you nobody empties that barrel.'"
        }
      },

      cal: {
        name: 'Cal Brenner', loc: 'tavern',
        role: 'Fishing guide at the Riptide. Knows the rivers.',
        names: ['cal', 'cal brenner', 'brenner', 'guide', 'fisherman'],
        here: (g) => (g.flag('cal_talked')
          ? 'At the end of the bar, Cal Brenner is working slowly through the beer you bought him, looking marginally less put-upon.'
          : 'At the end of the bar, a sunburned fishing guide named Cal Brenner is nursing the last inch of a beer, a battered duffel at his feet.'),
        desc: 'Wiry, sun-wrecked and missing the tip of one finger. His hands have tied ten thousand knots.',
        talk: (g) => {
          if (!g.flag('cal_talked')) {
            return "Cal doesn't look up. 'Insurance. Great.' He tips his empty bottle at you. 'My throat's too dry to talk to insurance.'";
          }
          return "'Go up the Thorne,' Cal says. 'And don't drown in my waders.'";
        },
        topics: [
          { k: ['dale', 'haugen', 'rick', 'sorensen', 'thorne', 'wages', 'fight', 'marnie', 'boat', 'skiff'], r: (g) => g.flag('cal_talked') ? "'Told you what I know. Rick, Thorne Bay Road, every few days. Go look.'" : "Cal taps his empty bottle meaningfully." },
          { k: ['fishing', 'fish', 'steelhead', 'trout', 'cutthroat', 'river', 'rivers', 'fly', 'flies'], r: (g) => g.flag('cal_talked') ? "Cal's whole face changes. 'Now you're talking. This island's got some of the best steelhead water in Alaska. The Thorne, the Karta, Klawock, Staney Creek, the Harris. Fall fish come in with the rain and sit in there all winter, and spring brings the big push.' He holds his hands apart, then, being an honest man, moves them closer together. 'Cutthroat in every lake that isn't too deep to fish. Swing a fly, keep 'em wet, let 'em go. They were here before us. Act like it.'" : 'Cal taps his empty bottle meaningfully.' },
          { k: ['bear', 'bears', 'grizzly', 'brown'], r: "'Black bears. Every bear on this island's a black bear. The brown bears are on the mainland and the ABC islands, not here. Not since the ice age, anyway. They found grizzly bones up in the caves on the north end.' He drinks. 'Plenty of black ones, though. Make noise on the trail. Don't get between a sow and her cub, and don't keep salmon in your tent.'" },
          { k: ['wolf', 'wolves'], r: "'Alexander Archipelago wolves. Only in Southeast. Little, dark, smart as hell. You'll hear them before you ever see one. The count on this island went from two hundred something to under a hundred in one year, back around 2014. Too many roads, too much trapping. Better now, I hear.' He's quiet a second. 'Heard a pack up the Thorne last week. Best sound there is.'" },
          { k: ['deer', 'hunting', 'hunt'], r: "'Sitka blacktail. Little deer, good meat. Half the freezers on this island are full of it. Rick couldn't hit one with his truck, which is my point.'" }
        ],
        askDefault: (g) => g.flag('cal_talked') ? "'No idea. Ask me about fishing sometime.'" : 'Cal taps his empty bottle meaningfully.',
        thanks: "Cal grunts. 'Thank me by bringing my waders back dry.'",
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
        role: 'Bartender at the Riptide Tavern.',
        names: ['bonnie', 'bartender', 'barkeep', 'barmaid'],
        here: 'Bonnie the bartender polishes a glass that was clean ten minutes ago.',
        desc: 'Sixty, silver bob, forearms like a deckhand. She has heard every story twice.',
        talk: () => "'What'll it be, hon? We've got beer and we've got beer.' (Try BUY BEER.)",
        topics: [
          { k: ['dale'], r: "'Dale and Rick sat right there back in September, heads together over a napkin like they were planning D-Day. Then they tipped big. Dale never tips big.'" },
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
        role: 'Tlingit carver at the Klawock Totem Park.',
        names: ['walt', 'walter', 'carver', 'old man', 'elder'],
        here: 'An older man in a canvas apron is shaping the cedar log with an adze, curls of red wood piling up around his boots.',
        desc: "Seventy-something, with a carver's forearms and a fisherman's squint. Tlingit, Klawock born and raised. He knows this island the way you know your own kitchen.",
        thanks: (g, lang) => {
          if (lang === 'tlingit') {
            g.flag('said_gunalcheesh', true);
            return "Walt stops carving. For a second he just looks at you. Then he smiles, all the way to his eyes. 'Gunalchéesh to you, too. Not bad. Most people say it like a sneeze.' He goes back to work, but now he's humming.";
          }
          if (lang === 'haida') return "'Háw'aa. That's Haida. Joe Kitka down at the harbor would like that.' He taps the log. 'Up here we say gunalchéesh.'";
          return "Walt lifts the adze an inch off the cedar, which from him is a speech.";
        },
        talk: (g) => {
          g.flag('knows_cabin', true);
          return "Walt sets down the adze and looks you over. 'The insurance investigator. Small island. Everybody knows by now.' He nods toward the water. 'Dale Haugen ran boats out of Craig for forty years. I don't believe the water took him.'\n\nHe goes back to work, then adds without looking up: 'My nephew was hunting up off Thorne Bay Road last week. Says he saw a light in the old Forest Service cabin up the Thorne. Nobody rents that cabin in October.'";
        },
        topics: [
          { k: ['klawock river', 'klawock lake', 'hatchery'], r: "'Our river. The sockeye run up it to the lake every summer. The hatchery helps the coho now. When I was a kid you could walk across their backs, my uncle said. He also said he caught a halibut the size of a door, so.'" },
          { k: ['cabin', 'thorne', 'river', 'light', 'nephew'], r: (g) => { g.flag('knows_cabin', true); return "'Take Big Salt Road out of Klawock to Control Lake, then east on the Thorne Bay Road to the trailhead. The trail goes northeast through the big trees to the river. The cabin's on the far bank. River's high this time of year. Don't try it in street clothes, and bring a light. It's dark under those trees.'"; } },
          { k: ['dale', 'haugen'], r: "'Good fisherman. Stubborn. The kind of man who'd rather lose everything than lose his pride. That's not always a good thing.'" },
          { k: ['rick', 'sorensen'], r: "'He's been driving up the Thorne road a lot. Not hunting. You don't hunt in loafers.'" },
          { k: ['coffman', 'cove', 'hazel', 'sweetwater', 'north'], r: "'Hazel at the store in Coffman Cove knows everything that happens north of the Thorne. Long drive. Up the North Prince of Wales Road from Control Lake, past Sweetwater.'" },
          { k: ['carving', 'log', 'cedar', 'adze', 'school'], r: "'This one's for the school. Raven. It'll take me most of a year if I do it right, and I do it right.' He runs a thumb along the grain. 'Red cedar. Tree of life, the old people called it. Gave us houses, canoes, clothes, baskets, and the poles. You thank the tree when you take it. That's not superstition. That's manners.'" },
          { k: ['totem', 'totems', 'pole', 'poles', 'story', 'stories', 'figures', 'crest', 'crests', 'meaning'], r: "'Everybody wants to know what a pole means.' Walt sets the adze down. 'First you ask whose it is. Every figure up there is a crest. It belongs to a clan, along with the stories and the songs that go with it. We call that at.óow. Owned things. Sacred, some of them.' He nods up the hill. 'I can tell you that one's a killer whale with a raven for a fin. The story behind it belongs to the family that owns it, and it's not mine to hand to a stranger in the rain. No offense meant.'\n\nHe picks the adze back up. 'And they're not idols. Nobody ever prayed to a pole. They're more like a library, if you know how to read it.'" },
          { k: ['tuxekan', 'ccc', 'grandfather', 'moved', 'park', 'history'], r: "'Tuxekan. Our winter village, up the coast. When the people moved down here for the cannery and the school, the poles stayed behind, falling down in the rain. In '38 the government sent the CCC, and the families said yes, bring them. My grandfather was on that crew. A dollar a day, he said, and worth every penny.' Walt smiles. 'Some of these are his work. When they rot, we carve them again. That's the job. A pole's supposed to go back to the forest someday. The story's what you keep.'" },
          { k: ['raven', 'eagle', 'wolf', 'clan', 'clans', 'moiety', 'side', 'sides'], r: "'Two sides. Raven, and Eagle, or Wolf, depending who you ask. You're born to your mother's side and your mother's clan. You marry the other side. When somebody dies, the other side takes care of everything, and a year or so later the family holds a koo.éex', a memorial party, and pays them back. Feeds them, gives gifts, sings the songs.' He shrugs. 'Each side holds the other one up. Keeps things in balance. I'm Raven. My wife was Eagle. Fifty-one years. Balance.'" },
          { k: ['shuka', 'kaa', 'ancient', 'skeleton', 'bones', 'dna', 'oldest', 'ice', 'ice age'], r: "Walt is quiet for a bit. 'Shuká Káa. Man Ahead of Us. That's the name the elders gave him.' He keeps his voice low, like you would in a church. 'They found him in 1996, in a cave on the north end. Ten thousand years old, more. The scientists asked the tribes first, before they did anything. That's how it should be done, and it mostly isn't. When the DNA came back, it said he's related to us. Tlingit, Haida, Tsimshian. Our grandparents always said we'd been here since the ice. Now it's on paper.' He looks out at the water. 'We put him back in the ground in 2008, with the songs. He's home.'" },
          { k: ['tlingit', 'lingit', 'language', 'words', 'gunalcheesh', 'speak'], r: "'Lingít. Not many first speakers left, and every year a few less. But my granddaughter's learning it in school, and now she corrects me at dinner.' He laughs. 'You want one word? Gunalchéesh. Thank you. Say it to somebody and mean it.'" },
          { k: ['cannery', 'canneries', 'salmon', 'sockeye', 'fish', 'traps'], r: "'Eighteen seventy-eight, they built the cannery here. One of the first in Alaska. Brought in Chinese crews to work the line. Our people fished for them, worked for them. Then came the fish traps, and the runs nearly went.' He shrugs. 'Statehood got rid of the traps. The sockeye came back some. The river remembers.'" },
          { k: ['bear', 'bears'], r: "'Black bears. Lots of them. There were brown bears too, back in the ice time. They found the bones in the caves up north. Now it's just the black ones, and that's plenty.'" },
          { k: ['island', 'prince of wales', 'klawock', 'lawaak', 'lawa', 'name', 'village', 'town', 'heinyaa', 'henya'], r: "'Lawáak. That's our name for this place. It's said it comes from Lawá, who started the village. We're Heinyaa Ḵwáan, the people of this part of the coast.' He nods at the inlet. 'People have lived here a very long time. Everything on this island remembers things. People forget that.'" }
        ],
        askDefault: "Walt keeps carving. 'Can't help you there.'",
        show: {
          topo_map: "Walt taps the pencil circle. 'That's the cabin. Like I said.'",
          photo: "'Thorne River steelhead. Dale always did love that river.'"
        }
      },

      hazel: {
        name: 'Hazel', loc: 'cove_store',
        role: 'Runs the Coffman Cove store. Knows the north end.',
        names: ['hazel', 'storekeeper', 'clerk', 'owner', 'shopkeeper'],
        here: 'Hazel, who has run this store for thirty years and knows everything that happens north of the Thorne, is doing a crossword behind the counter with a pencil she sharpens with a pocketknife.',
        desc: 'Seventies, sharp-eyed, wool vest, reading glasses on a beaded chain. She has been watching you since before you came in.',
        talk: (g) => {
          if (!g.flag('hazel_talked')) {
            g.flag('hazel_talked', true);
            g.flag('knows_sweetwater', true);
            g.clue('hazel_tip');
            g.moveItem('oars', 'inv');
            return "'You're the insurance one.' Hazel doesn't look up from her crossword. 'Seven letters. A man who isn't where he's supposed to be.' She fills it in.\n\n'Rick Sorensen has been in twice a week since the middle of the month, buying groceries for two. Chili, coffee, saltines, eggs. Pays cash. Says he's deer hunting out of a Forest Service cabin.' Now she looks up. 'Then last Thursday he borrowed my spare oars. Said the Sweetwater skiff was missing a pair. Never brought them back.'\n\nShe reaches under the counter and sets a second pair of oars across it. 'If you're going out there yourself, take these. I keep two of everything. Bring them back.'\n\nYou take the oars.";
          }
          return "'Sweetwater's seven miles southwest on the Coffman Cove Road. Pullout on the lakeshore, short trail down to the water,' Hazel says. 'The cabin's half a mile up the shore. Row north. Bring my oars back.'";
        },
        topics: [
          { k: ['rick', 'sorensen'], r: "'Buys for two, pays cash, tips like a man who wants you to remember he was friendly. I remember.'" },
          { k: ['dale', 'haugen'], r: "'Dale set chokers for the camp up here when he was young. Married Marnie on the beach at Luck Lake. Rained like the end of the world. Best wedding I ever went to.'" },
          { k: ['marnie'], r: "'Marnie cooked for the logging crews up here. Best bread on the north end. Still is, I hear, down in Craig.'" },
          { k: ['sweetwater', 'cabin', 'lake', 'skiff', 'boat'], r: "'Southwest on the Coffman Cove Road, seven miles, past Coffman Creek. There's a pullout on the east shore with a Forest Service sign. Two hundred feet of trail to the water, and the cabin's half a mile up the shore. The Forest Service leaves a skiff there. Usually with oars.'" },
          { k: ['eagle'], r: "'Eagle Creek runs out of Luck Lake right by the beach. Best cutthroat fishing on the north end, and I didn't tell you that.'" },
          { k: ['oars', 'oar'], r: (g) => g.inInv('oars') ? "'You've got my good ones. Bring them back.'" : "'Talk to me first, then we'll see about oars.'" },
          { k: ['coffman', 'cove', 'town', 'camp', 'logging', 'history'], r: "'Named for some Navy lieutenant back in 1886, Dewitt Coffman. Nobody up here could tell you a thing about him.' She sharpens her pencil. 'Logging camp in the fifties. Big timber, big money, a hundred and some men in the bunkhouses. When the timber sales dried up, so did the jobs. School got down to ten kids one year. Ten.' She shrugs. 'Now it's fishermen, retirees and people who like it quiet. It's a town that still thinks it's a logging camp. Best place on the island, if you like rain and minding your own business.'" },
          { k: ['thorne bay', 'ketchikan pulp', 'kpc', 'pulp', 'timber'], r: "'Thorne Bay was the biggest logging camp in North America, once. Ketchikan Pulp floated the whole camp over from Hollis in the sixties. Pulp mill closed in '97, and that was the end of that.' She doesn't look up. 'You can still see the clearcuts from the air. You can see them from the moon, my husband used to say. He set chokers for thirty years, so he was allowed to say it.'" },
          { k: ['cave', 'caves', 'el capitan', 'whale pass', 'shuka', 'kaa', 'north end'], r: "'El Capitan, up past Whale Pass. Biggest cave in Alaska, two miles of it. Forest Service gives tours in the summer. They found bear bones in there older than the ice, black and brown both.' She sets her pencil down. 'And there's the other cave up north, where they found the man the tribes named Shuká Káa. Ten thousand years. That's not my story to tell. If you're ever in Klawock, ask Walt.'" },
          { k: ['luck'], r: "'Prettiest lake on the island. Don't tell anybody.'" },
          { k: ['half dog', 'half'], r: "'Half Dog Road? Don't ask me. Some logger with a sense of humor, fifty years ago. The name stuck. Names do, up here.'" },
          { k: ['dog', 'creek', 'bears', 'bear'], r: "'The sow and her cub have been fishing Dog Creek since August, right down to the edge of town. Make noise and don't get between them.'" },
          { k: ['weather', 'rain'], r: "'It's not raining. It's Coffman Cove.'" },
          { k: ['crossword', 'puzzle'], r: "'Seven letters, a man who isn't where he's supposed to be.' She taps the page. 'ABSCOND. I already got it.'" }
        ],
        askDefault: "'Couldn't tell you. And I can tell you most things.'",
        show: {
          receipt: "Hazel squints at it. 'Craig prices. Highway robbery.' Then she reads the name. 'Same Rick, though.'",
          napkin: "Hazel reads it and lets out a breath through her nose. 'Sixty-forty. Dale always did think he was the smart one.'",
          photo: "'That's Dale, all right. With a fish, of course. You'd never catch him without one.'",
          topo_map: "'That's the Thorne cabin. Whoever was in it, Rick moved last week. Sweetwater now, I'd bet.' She shrugs. 'Small island.'",
          rick_note: "Hazel reads it twice. 'Burn this.' She snorts. 'Nobody on this island has ever burned anything they were told to.'",
          oars: "'Those are mine, all right. My initials and everything.'"
        },
        give: {
          oars: (g) => {
            if (!g.has('found_dale')) return "'Keep them till you're done out there,' Hazel says. 'Then bring them back.'";
            g.moveItem('oars', null);
            return "Hazel takes the oars, checks both blades like she's counting fingers, and slides them back under the counter. 'Two of everything,' she says, satisfied. 'Go on. Go finish it.'";
          }
        }
      },

      reyes: {
        name: 'Sgt. Anna Reyes', loc: 'trooper',
        role: 'Alaska State Trooper, Klawock post.',
        names: ['reyes', 'anna reyes', 'sergeant', 'sgt', 'sgt reyes', 'sergeant reyes', 'trooper', 'anna', 'officer'],
        here: 'Sergeant Anna Reyes sits behind the front desk, reading a report as though it personally offended her.',
        desc: "Fifty, compact and still in the way of someone who has been lied to by experts.",
        talk: () => "'Northbound Mutual,' she says, reading your badge without seeming to look at it. 'Coast Guard suspended the search on the thirteenth. Officially, Dale Haugen is missing and presumed drowned. Unofficially I've got a feeling, and feelings don't hold up in court.' She taps the desk. 'When you know who's behind this and can back it up, come back and tell me.' (When you're ready, type ACCUSE and the person's name.)",
        topics: [
          { k: ['dale', 'haugen'], r: "'Missing, presumed drowned. Unless you know something I don't.'" },
          { k: ['rick', 'sorensen'], r: "'Filed the claim four days after his partner vanished. Fast grief.'" },
          { k: ['marnie'], r: "'Lost her husband and her spot on the policy in the same season. If she's a suspect, she's the worst one I've ever seen.'" },
          { k: ['cal', 'brenner'], r: "'Cal's got two DUIs and a heart of gold. Not a killer.'" },
          { k: ['accuse', 'evidence', 'case', 'proof'], r: "'You tell me who did what, and you show me why. ACCUSE and the name. Or names.'" },
          { k: ['search', 'coast guard'], r: "'Helicopter out of Sitka flew it for two days. Nothing. Not a boot, not a hat.'" },
          { k: ['sweetwater', 'coffman', 'luck', 'hazel'], r: "'Sweetwater Lake? Way up north, off the Coffman Cove Loop. Forest Service cabin out there. Nobody goes there in October.' She looks at you a beat longer. 'Why?'" }
        ],
        askDefault: "'Not my problem today.'",
        show: {
          napkin: "Reyes reads it twice. 'This is interesting. It isn't proof Dale's alive, though. Just proof he and Rick were planning something.'",
          receipt: "'Propane in October, the morning after. Cash. Interesting.'",
          report: "'I've read it. Flat calm. That bugged me too.'",
          foreclosure: "'Motive. Doesn't tell me who did what.'",
          topo_map: "'Thorne River cabin. Have you been up there?'",
          rick_note: "Reyes reads it and goes very still. 'Sweetwater.' She reaches for her radio, then stops. 'Is he there? Did you see him? Because a note's a note.'",
          oars: "'Hazel's oars.' Reyes almost smiles. 'She lent you those? She must like you.'",
          badge: "'I know who you are.'"
        }
      },

      dale: {
        name: 'Dale Haugen', loc: 'sweetwater_cabin',
        role: 'The insured. Very much not drowned.',
        names: ['dale', 'dale haugen', 'haugen', 'man', 'bill', 'stranger'],
        here: (g) => g.flag('dale_confessed')
          ? 'Dale Haugen sits at the plank table with both hands around a cold cup of coffee, looking like a man who has finally put down something heavy.'
          : "A man with a week of gray stubble sits at the plank table, a cup of coffee halfway to his mouth. If you've seen even one photo on the walls of the Harbor Light Lodge, you know exactly who he is. He looks very well for a drowned man.",
        desc: "Sixty-one, fit, sunburned and very much alive. He keeps glancing at the bamboo rod in the corner, like a man checking on a sleeping kid.",
        talk: (g) => daleTalk(g, false),
        topics: [
          { k: ['marnie', 'wife'], r: (g) => g.flag('dale_confessed') ? "'Forty years in June.' His voice cracks. 'She'd have stopped me. That's why I didn't tell her.'" : "'Don't know any Marnie.' He says it to his coffee." },
          { k: ['rick', 'sorensen'], r: (g) => g.flag('dale_confessed') ? "'Rick's idea. Rick's plan. My boat, though. And my hand on the plug.' He shakes his head. 'Don't let him tell you different.'" : "'Never heard of him.'" },
          { k: ['rod', 'winston', 'bamboo'], r: "'My father's. He bought it in 1952 with his first season's crab money.' A long pause. 'Rick told me to leave it. I couldn't do it.'" },
          { k: ['suit', 'survival', 'immersion', 'swim'], r: (g) => g.flag('dale_confessed') ? "'Half a mile in that suit at slack water. Coldest twenty minutes of my life.'" : "'Found it,' he says. 'On the beach.' Nobody finds a survival suit with their own name on it." },
          { k: ['belize', 'caribbean', 'book', 'books', 'bonefish'], r: "'Always wanted to chase bonefish.' He almost smiles. 'Guess I still do.'" },
          { k: ['oars', 'hazel', 'sweetwater', 'lake', 'thorne'], r: "'Rick took the Forest Service oars so nobody could row out here.' He looks at Hazel's oars and shakes his head. 'Never figured on Hazel. She keeps two of everything.'" },
          { k: ['coffman', 'luck', 'cove'], r: "'Marnie and I started out up here. I set chokers for the logging camp, she cooked for the crew. Married her on the beach at Luck Lake.' He looks out the window. 'Rained the whole time.'" },
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
        return "Dale looks at you for a long time. Then he puts down the coffee.\n\n'The lodge was going under,' he says. 'The bank was going to take everything. Marnie's kitchen, the boats, forty years. Rick said it would be clean. One flat night, pull the plug off Fish Egg, swim for the island in a survival suit, and he picks me up on the back side. I hid out in the Thorne cabin until Walt's nephew came around with a spotlight, and then Rick moved me out here. Nobody comes to Sweetwater in October. We wait for the money, and then we start over somewhere warm.'\n\nHe looks at the bamboo rod in the corner. 'Rick told me to leave that. Said a dead man doesn't take his rod with him.' He rubs his face with both hands. 'I couldn't leave it. Stupid.'\n\n'I'll come in,' he says finally. 'Go tell Reyes. Tell her it was my boat and my hand on the plug. And tell her it was Rick's idea.'";
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

    // What you tell Reyes, in the order the evidence usually turns up.
    function recap(g) {
      const said = {
        calm_night: 'the flat calm', lanyard: 'the pulled plug and the unworn kill switch', rod_missing: 'the empty slot on the rod rack',
        foreclosure: "the bank's notice", napkin: 'the napkin', receipt: 'the propane', cal_tip: "Rick's trips up the Thorne road",
        rick_note: 'the note in the empty Thorne cabin', hazel_tip: "Hazel's borrowed oars"
      };
      const parts = Object.keys(said).filter((c) => g.has(c)).map((c) => said[c]);
      parts.push('finally, Dale himself, alive and well in the cabin on Sweetwater Lake');
      if (parts.length === 1) return parts[0];
      return parts.slice(0, -1).join(', ') + ' and, ' + parts[parts.length - 1];
    }

    function endingBest(g) {
      return [
        `Reyes listens to all of it: ${recap(g)}. When you finish, she's quiet for a moment. Then she picks up the phone.`,
        "By dark, Dale Haugen is sitting in the holding cell, sheepish and very much alive. He keeps his word and tells it straight. Rick Sorensen is picked up at the Klawock airstrip trying to catch the last floatplane to Ketchikan, with a duffel bag and a story that falls apart in about four minutes.",
        'Claim #NM-1187 is denied. The fraud referral goes to the state. Your supervisor writes back: "Told you to look hard. Did you fall in a river?" You did not.',
        "Three weeks later a postcard shows up on your desk with a photo of the Harbor Light Lodge. 'Bank gave me until spring to refinance. Kitchen's still mine. — M.' And underneath, in smaller letters: 'The Winston is back on the rack. He asked me to keep it for him.'",
        '*** THE CASE IS CLOSED ***'
      ].join('\n\n');
    }

    function endingWarrant(g) {
      return [
        "Reyes reads the napkin, then the receipt, then the napkin again. 'Sixty-forty after the payout. Propane the morning after a drowning.' She picks up the phone. 'That'll get me a warrant for Rick's truck and a helicopter over the north end.'",
        "The next afternoon, after checking an empty cabin on the Thorne and borrowing a pair of oars from Hazel in Coffman Cove, troopers find Dale Haugen in the Forest Service cabin on Sweetwater Lake, alive, warm and holding his '52 Winston like a life jacket. Rick Sorensen gets picked up at the Klawock airstrip with a duffel bag and a story that doesn't hold.",
        'Claim #NM-1187 is denied. Your supervisor\'s email says "Good work!" with only one exclamation point. Reyes got the collar. You get the paperwork. (Next time, try finding Dale yourself.)',
        '*** THE CASE IS CLOSED ***'
      ].join('\n\n');
    }

    // ------------------------------------------------------------- details
    // Every noun a room description mentions, plus a few things worth
    // finding on your own. Shorthand: { 'name, alias': desc | { desc, text, take, <verb>: reply } }.
    const OUTDOOR = {
      'rain, drizzle, mist': { desc: 'Not so much falling as hanging in the air, waiting for you to walk into it. Locals call this a nice day.', touch: 'Wet. Shockingly, wet.' },
      'sky, clouds, cloud, overcast': 'Low and gray, the color of a wet sidewalk. Somewhere above it, allegedly, there is a sun.',
      'puddle, puddles, ground': 'Every low spot is a puddle, and every puddle is deeper than it looks.',
      'ravens, raven': 'Big, glossy and loud, and they seem to be discussing you.'
    };
    const OUTDOOR_ROOMS = ['ferry', 'hwy', 'thorne_road', 'trailhead', 'ford', 'klawock', 'totem_park', 'craig', 'harbor', 'fuel_dock', 'lodge_road',
      'dog_creek', 'luck_lake', 'sweetwater_turnoff', 'sweetwater_landing', 'sweetwater_lake', 'coffman_cove', 'cove_harbor'];

    const SCENERY = {
      ferry: {
        'terminal, terminal building, building, waiting area, wall': {
          desc: "A small gray building with a covered waiting area, a wet bench and a vending machine that's been out of order since the Clinton administration. It's locked up; it only opens when a ferry is in. Screwed to the wall next to the door is a gray lockbox.",
          enter: 'Locked. The terminal only opens when a ferry is in, and the ferry just left.',
          open: 'Locked. A sign on the door says OPEN 1 HR BEFORE SAILINGS.',
          knock: 'You knock. Rain answers.'
        },
        'terminal door, door, front door': { desc: 'Steel and glass, locked. A sign: OPEN 1 HR BEFORE SAILINGS.', open: "Locked. The ferry's gone, so the terminal's closed.", knock: 'Nobody. Just your reflection, looking damp.' },
        'ferry, inter-island ferry, boat, ship, vessel': "A white shape fading into the rain, already halfway to the point. Your ride back is in two days, assuming you've closed the case by then.",
        'dock, ramp, steel ramp, pier, slip, bollard': 'A steel ramp and a concrete dock, wet and empty. A gull stands on a bollard, looking at you like you owe it money.',
        'gull, seagull': { desc: 'It stares. You stare. The gull wins.', touch: 'The gull makes it clear that would be a mistake.' },
        'strait, clarence strait, water, sea, ketchikan': 'Clarence Strait: gray, wide and choppy, with Ketchikan out there somewhere under the clouds.',
        'lot, gravel lot, parking lot, gravel': 'Gravel, room for a dozen cars, and a puddle the size of a hot tub. Just you and your rental pickup.',
        'trees, spruce, hemlock, hill, forest, woods': 'Sitka spruce and western hemlock, dark and dripping, crowding right down to the high-tide line.',
        'road': 'One road out. It goes west.',
        'bench': { desc: 'A wooden bench under the overhang, somehow wet anyway.', sit: 'You sit on the bench. The wet soaks through immediately. You stand back up, wiser.' },
        'vending machine, machine': { desc: 'A vending machine with one sad bag of pretzels and a handwritten sign taped to the glass: NO.', push: 'You press the button. The machine hums, considers your request, and declines.' },
        'brochure, brochures, rack, brochure rack, pamphlet, visitor guide, guide': {
          desc: 'A wire rack of soggy visitor brochures under the overhang. One has survived the weather better than the rest: WELCOME TO PRINCE OF WALES ISLAND.',
          text: "WELCOME TO PRINCE OF WALES ISLAND\n\nThe fourth-largest island in the United States: about 2,577 square miles of mountains, muskeg, old-growth rain forest and salt water, roughly 135 miles from end to end. Around 6,000 people live here, in a dozen small towns joined by the longest road system in Southeast Alaska.\n\nThis has always been Native land. Native people have lived on these islands for more than ten thousand years; Lawáak (Klawock) is home of the Heinyaa Ḵwáan. Kaigani Haida people came north from Haida Gwaii about three hundred years ago and made their homes in the south and east, at Kasaan and Hydaburg. Please respect village lands, cultural sites and subsistence camps. Ask before you photograph people, poles or ceremonies.\n\nGUNALCHÉESH (Tlingit) — HÁW'AA (Haida) — THANK YOU for visiting.",
          take: "You take a brochure. Then you put it back, because the next person off the ferry should get one too. You've already read it."
        },
        'historical marker, marker, plaque, hollis, history': {
          desc: 'A weathered wooden marker at the edge of the lot, its letters gone soft with moss.',
          text: "HOLLIS\nIn 1899 prospectors staked gold claims up the Harris River, and for a while Hollis was a busy mining camp. The Dawson Mine produced nearly 10,000 ounces of gold before the mines played out in the 1920s.\nIn 1953 Ketchikan Pulp Company made Hollis its main logging camp. In 1962 the camp moved to Thorne Bay.\nSince 2002 the Inter-Island Ferry has linked Hollis to Ketchikan.\n(Someone has scratched underneath: AND IT'S STILL RAINING.)"
        },
        'schedule, ferry schedule, sign, notice': { desc: 'A ferry schedule in a scratched plastic case.', text: 'INTER-ISLAND FERRY — HOLLIS / KETCHIKAN\nDaily departures 8:00 AM and 3:30 PM, weather permitting.\n(Someone has added in pen: "it usually doesn\'t")' }
      },
      hwy: {
        'bridge, concrete bridge, railing, guardrail': "A plain concrete bridge with a rusting guardrail. Someone has written CATCH & RELEASE YOUR EGO on it in paint marker. It's good advice.",
        'muskeg, bog, shore pines, pines': "Open muskeg: spongy, wet and dotted with stunted shore pines, all bonsai'd by the wind. Step in the wrong spot and you'll lose a boot.",
        'clearcuts, clearcut, alder, alders, stumps, second growth, forest, trees': 'Old clearcuts from the big logging days, the stumps gone silver, the hillsides grown back thick with alder and young spruce.',
        'hydaburg sign, sign, green sign, hydaburg highway': 'A green highway sign: HYDABURG 40, with an arrow pointing south. Riddled with what you hope is birdshot.',
        'gold, mine, mines, mining, tailings': "A hundred-odd years ago this valley was full of prospectors. They found gold up the Harris River, and Hollis boomed and then went bust. These days the river's gold is the steelhead.",
        'highway, road, pavement, two-lane': 'Two lanes, no shoulder, no traffic. A pickup passes and the driver waves. You wave back. That is the whole social scene.'
      },
      thorne_road: {
        'spur roads, spur, spurs, gates, gate': 'Old logging spurs climb into the hills, most of them behind steel gates hung with signs: ROAD CLOSED. One gate has a bullet hole through the O.',
        'signs, road signs, junction': 'A cluster of road signs at the T: THORNE BAY 16 → (east). COFFMAN COVE 35, NAUKATI, WHALE PASS ↑ (north). KLAWOCK 16 (southwest).',
        'potholes, pothole, gravel, road, washboard': 'Gravel, potholes and washboard. Your fillings rattle just looking at it.',
        'logging country, hills, hillside, hillsides': 'Hills of second-growth and old clearcuts, a patchwork of greens going gray in the rain.'
      },
      trailhead: {
        'road, gravel road, thorne bay road': 'The Thorne Bay Road: gravel, potholes, and the river valley. West to Control Lake, east to Thorne Bay.',
        'pullout, gravel pullout': "Room for three trucks. Right now there's yours, and a whole lot of tire tracks.",
        'forest, old growth, trees, woods, trail': "The old growth starts at the edge of the gravel like a wall. The trail goes in. The light doesn't.",
        'bullet holes, bullet hole, bullet pocks': 'Small caliber. Someone was bored in the most Alaskan way possible.',
        'river, thorne river': "You can't see it from here, but you can hear it off to the east, big and busy." 
      },
      river_trail: {
        'spruce, sitka spruce, hemlock, hemlocks, trees, old growth, trunks': 'Trees that were already old when Captain Vancouver sailed past. The trunks are wider than your truck and furred with moss.',
        'moss': { desc: 'Thick, green and wet. It covers everything that holds still long enough. You keep moving.', touch: 'Like a soaked sponge. Your hand comes away green.' },
        'devils club, devil club': { desc: 'Broad, maple-shaped leaves on stalks covered in spines. Every inch of it wants to hurt you.', touch: 'You touch it. It touches you back. Ow.', take: 'You grab it. It wins. Ow.' },
        'ferns, fern, deer fern': 'Glossy deer fern, dripping.',
        'path, trail, roots, ground, sponge': 'Black mud crossed with roots like knuckles, soft as a sponge underfoot. The boot print points east.',
        'river, rush': 'Somewhere ahead to the east, loud and getting louder.'
      },
      ford: {
        'gravel bar, bar, stones, gravel': 'Round river stones, gray and rust and green. Spawned-out salmon lie along the waterline, picked over by eagles.',
        'salmon, carcasses, carcass, dead fish': { desc: 'Spawned-out pinks and chums, gray and ragged. The circle of life is mostly smell.', take: 'Absolutely not.', smell: 'You regret this immediately.' },
        'far bank, bank, other side, building': 'Through the spruce on the far bank: the dark shape of a small cabin. No smoke, no light, no sound.',
        'trail, forest, trees': 'The trail runs back west into the dark old growth.',
        'boulder, rock': "A big mossy boulder with soft water behind it. If you had a rod, you'd swing a fly right through there. You don't, so you just look at it longingly."
      },
      cabin: {
        'table, plank table, initials': 'A heavy plank table carved with decades of initials. On it: a coffee can and a Craig tide table.',
        'empty cans, cans, box, cardboard box, groceries': 'Empty cans of chili and beans, rinsed out, the way a tidy man camps. Enough for a week or two of hiding.',
        'tide table, tides, tide chart': { desc: 'A tide table for Craig, folded and refolded.', text: 'OCTOBER, CRAIG AK\n  Oct 11  HIGH 9:42 PM  14.1 ft\nSomeone has circled the 11th twice and written: "slack ~10. GO."\nSlack water. The one hour a man could swim half a mile without the current fighting him.' },
        'window': 'Grimy glass. The river flashing through the trees.',
        'cabin, logs, spruce logs, walls, wall': 'Weathered spruce logs, chinked with moss and old rope. A Forest Service plaque by the door reads PUBLIC USE CABIN — RESERVE ONLINE. Nobody reserved it.',
        'door': 'Rough planks on iron hinges. The way back, west.',
        'survival suit, suit, orange suit, immersion suit': "Hanging from a nail by the door: a bright orange survival suit, the kind that keeps you alive in cold water. Salt has dried in white lines on the sleeves. The name tag on the chest says HAUGEN. He left it behind when he moved. He wasn't planning on swimming again."
      },
      dog_creek: {
        'creek, dog creek, water, shallows, gravel': 'Clear, quick water over clean gravel. Spawned-out pink salmon drift in the eddies, and coho fry flick away from your shadow.',
        'half dog road, side road, sign': 'A gravel side road climbing off to the east into the trees, with a sign that says HALF DOG ROAD. Somebody up here has a sense of humor about names.',
        'rooftops, town, cove': 'Down the valley to the north: rooftops, woodsmoke and the gray water of the cove where Dog Creek runs out.',
        'bears, bear, sow, cub, black bear, black bears': { desc: 'A glossy black bear sow, fat for winter, pinning a salmon in the shallows while her cub splashes after the leftovers. She looks up once, decides you are not interesting, and goes back to work.', touch: 'No. Absolutely not. Not even a little.' },
        'bank, trampled bank': "Mud packed flat by paws, salmon skins and one very clear message: this is somebody else's kitchen.",
        'tracks, tire tracks, road, gravel road, nf-3030': 'NF-3030, gravel, running beside the creek. Fresh tire tracks head north toward town and the store. Wide tires, aggressive tread. The same tracks as at the Thorne trailhead.'
      },
      luck_lake: {
        'lake, luck lake, water, drop-off, drop off': 'Long, narrow, deep and still, stretching away south between the hills for three miles. Cutthroat dimple the surface along the drop-off. Locals swear there is a thirty-inch Dolly Varden in here somewhere.',
        'eagle creek, creek, outlet': 'Eagle Creek slips out of the lake right beside the beach, clear over gravel, headed east for Clarence Strait. Every cutthroat in the lake hangs around the outlet.',
        'rock beach, beach, rocks, stones, stone': { desc: 'Flat gray stones, perfect for skipping.', take: 'You pick out a flat stone and skip it across the lake. Six skips. You have a feeling somebody around here could do seven.' },
        'picnic shelter, shelter, picnic table, table, bench, carving, initials, heart': { desc: 'A covered picnic shelter with a heavy plank table, carved over the years with initials. One set is old and deep, inside a crooked heart: D.H. + M.H. 1986.', sit: 'You sit at the picnic table under the shelter. Rain ticks on the roof. Somebody carved D.H. + M.H. 1986 into the plank next to your hand.' },
        'outhouse, crescent moon, door': { desc: 'A Forest Service outhouse with a crescent moon cut in the door. Surprisingly clean, for an outhouse.', open: 'You open the door. Somebody has left a 1997 issue of Field & Stream in there. You close the door and leave the magazine for the next guy.', enter: 'You have a case to solve. You can hold it.' },
        'loon, common loon': { desc: 'A common loon, checkerboard black and white, riding low out in the middle of the lake. It lets out that long, wavering call that makes the whole lake sound lonely.', listen: 'That call. It goes right through you.' },
        'hills, clouds': 'The clouds sit right down on the hills around the lake. Somewhere up there it is already snowing.'
      },
      sweetwater_turnoff: {
        'sign, forest service sign, brown sign, arrow': { desc: 'A brown Forest Service sign with a white arrow pointing west down the trail.', text: 'SWEETWATER LAKE ←\nPUBLIC USE CABIN\nBoat at end of trail. PFDs NOT PROVIDED.' },
        'pullout, mud, tracks, tire tracks': "Fresh tire tracks in the mud of the pullout. Wide tires, aggressive tread. You're starting to know this tread personally.",
        'road, coffman cove loop, main road': 'The Coffman Cove Loop: gravel, potholes and the occasional deer, running along the east shore of the lake.',
        'lake, sweetwater lake, water': 'Through the trees to the west: dark, still water, running away for miles to the southwest.',
        'trail': 'Two hundred feet of roots and puddles down to the water.'
      },
      sweetwater_landing: {
        'trail, roots, puddles, path': 'Two hundred feet of roots, puddles and slick spruce needles from the turnaround down to the water. The Forest Service calls it a trail. Your ankles call it something else.',
        'lake, sweetwater lake, water': 'Still, dark water, a half mile across, with low green hills all around and the clouds hanging close. It looks like a place nobody would ever find you. That is the idea.',
        'cabin, smoke, stovepipe, shore, chimney': "A small log cabin half a mile up the shore, with a float out front and smoke curling from the stovepipe. Somebody's home.",
        'boot prints, prints, tracks': 'Boot prints in the gravel, going to the water and coming back. Big lug soles. Every few days, by the look of it.',
        'trail, road': 'The short trail climbs back east to the pullout on the road.',
        'logs, tree': 'Two logs the skiff rests on, and a spruce it is chained to. The padlock hangs open.'
      },
      sweetwater_lake: {
        'water, lake, reflection, clouds': { desc: 'Dark as coffee, and so still the clouds float in it upside down.', touch: 'You trail a hand in the lake. It is cold enough to ache. You think about Dale swimming half a mile of salt water in October and feel a strange, grudging respect.' },
        'cabin, float, smoke': 'Closer now: a cedar log cabin with a little float out front and smoke from the stovepipe. A shape moves past the window.',
        'landing, shore': 'The landing is back to the south, your truck hidden in the trees above it.',
        'skiff, boat, oarlocks': "The Forest Service skiff. It's sturdy, and it leaks a little. Not like the Kittiwake. Not on purpose."
      },
      sweetwater_cabin: {
        'woodstove, stove, wood stove': { desc: 'A small woodstove, ticking with heat, with a kettle on top.', touch: 'Hot. You knew that. You touched it anyway.' },
        'table, benches, bench': { desc: 'A table and benches of rough planks. On the table: a HARBOR LIGHT LODGE coffee mug and a game of solitaire.', sit: 'You sit on the bench across from Dale. Neither of you says anything for a while.' },
        'coffee mug, mug, coffee, kettle': { desc: 'A HARBOR LIGHT LODGE mug. Not even subtle.', drink: "It's his coffee. You don't drink a man's coffee before you've decided whether to report him.", take: "'That's mine,' Dale says." },
        'cards, solitaire, deck, deck of cards': 'A game of solitaire, stuck. The red seven has nowhere to go. You know the feeling.',
        'paperbacks, books, book, paperback, field guide, windowsill': { desc: "Louis L'Amour, a Ken Follett and a well-thumbed Field Guide to Caribbean Reef Fishes. Somebody is planning a move somewhere warm.", text: 'A Field Guide to Caribbean Reef Fishes. Dog-eared at BONEFISH. Somebody has underlined "Belize."' },
        'groceries, food, canned chili, chili, saltines, eggs': "Canned chili, coffee, saltines and a carton of eggs from the Coffman Cove store. Enough for a few more days. Rick's due back with more.",
        'bunks, bunk, sleeping bag, bag': 'Wooden bunks, no mattresses. A good down sleeping bag on the bottom one, with a wool blanket folded on top. A man settling in.',
        'forest service oars, door, oars by the door': (g) => (g.flag('fs_oars_taken') ? 'The rough plank door. The Forest Service oars are down in the skiff now.' : "A pair of oars stenciled USDA FOREST SERVICE, leaning by the door. So that's where they went."),
        'window': 'Rain on the glass, the lake beyond, and the landing too far away to see clearly. Which was the whole idea.',
        'float': 'A little float of planks and barrels at the bottom of the path. The skiff is tied to it.',
        'cabin, walls, logs, cedar': 'Pre-cut cedar logs, tight and fragrant, twelve by fourteen. A Forest Service plaque: SWEETWATER LAKE CABIN. RESERVE ONLINE. Nobody did.'
      },
      coffman_cove: {
        'houses, trailers, house, trailer, yards': 'Houses and trailers along the shore, painted whatever color was on sale, with smoke from every stovepipe. There are skiffs in the yards, crab pots on the porches and a trampoline with a deer standing next to it.',
        'woodpiles, woodpile, tarps, blue tarps, firewood': 'Firewood stacked under blue tarps, enough to get a family through a winter. Out here, a good woodpile is a love letter.',
        'school': 'A small school with a playground and a basketball hoop. Somebody has painted a very good salmon on the wall by the door.',
        'community hall, hall, bulletin board, board': { desc: 'The community hall, with a bulletin board out front under a little roof.', text: 'POTLUCK FRIDAY — bring a dish, bring a fork, bring your own chair.\nFOR SALE: firewood, $250 a cord, you haul.\nFOUND: one bear-proof garbage can lid. The bear has not claimed it.\nCHURCH SUNDAY 10 AM — coffee after, and also before.' },
        'cove, water, strait, clarence strait, mountains': 'The cove opens out onto Clarence Strait, gray and wide, with the mountains on the far side already wearing snow up top.',
        'deer, doe': { desc: "A Sitka black-tailed doe standing next to a trampoline in somebody's yard, eating their flowers like she pays rent.", touch: 'She lets you get closer than she should, then decides that is enough.' },
        'road, gravel road, nf-3030, coffman cove road': 'NF-3030: south up the Dog Creek valley toward Luck Lake, or southwest on the Coffman Cove Road toward Sweetwater Lake.',
        'lagoon, coffman creek': 'The lagoon behind town, where Coffman Creek runs in, tea-dark. Calm, shallow and full of birds.',
        'heron, great blue heron': 'A great blue heron in the shallows of the lagoon, pretending to be a stick. It has been standing there since before you arrived, and it will be standing there after you leave.',
        'dog creek, creek, mouth, creek mouth': 'Dog Creek runs out just east of town and fans across the gravel onto the beach. At low tide the gulls stand in the riffle like they are waiting for a delivery. In the fall, they get one.'
      },
      cove_store: {
        'aisles, shelves, shelf, canned goods, chainsaw chain, ammunition, candles, birthday candles': 'Everything a person might need when the nearest town is an hour away on gravel: chainsaw chain next to birthday candles, ammunition next to oatmeal. There is a system. Hazel is the system.',
        'woodstove, stove, wood stove, barrel stove': { desc: 'A barrel stove in the middle of the floor, pumping out heat, with a coffee pot on top.', touch: 'Hot. Very hot. You warm your hands instead, like a person with sense.' },
        'coffee, coffee pot, pot, percolator': { desc: 'A dented percolator on the woodstove, with a stack of foam cups next to it.', drink: "You pour a cup. Hazel doesn't look up. 'Free. Advice costs extra.' The coffee is excellent.", take: "You pour a cup. Hazel doesn't look up. 'Free. Advice costs extra.' The coffee is excellent." },
        'sign, register, cash register': 'A brass cash register older than the town, and a hand-lettered sign: COFFMAN COVE. POP.: ENOUGH.',
        'coolers, cooler, bait, milk': 'A cooler of herring next to a cooler of milk, both labeled in marker so nobody makes the mistake twice.',
        'tackle, fishing tackle, lures, flies, fly, pegboard': { desc: 'A pegboard of spoons and spinners, and a little box of hand-tied flies: olive Woolly Buggers and egg-sucking leeches. Somebody local ties good flies.', take: "'You got a rod?' Hazel asks without looking up. You don't. You put the flies back." },
        'rain gear, raingear': 'Rubber rain gear in two colors: orange, and also orange.',
        'crossword, pencil, pocketknife': "Hazel's crossword, nearly done, in pencil. She sharpens the pencil with a pocketknife between clues.",
        'porch, door': 'The porch and the door, south, back out to the road.'
      },
      cove_harbor: {
        'boats, skiffs, crabbers, slips, floats': 'Skiffs and crabbers in their slips, crab pots stacked on the floats, and every boat tied up with the kind of knots that come from knowing exactly what the wind can do.',
        'seiner, old seiner': "An old wooden seiner, its green paint gone chalky, that hasn't left the dock in a decade. Somebody still pumps its bilge every week. Somebody can't let it go.",
        'ferry ramp, old ferry ramp, ramp, apron, kid': 'The old ferry ramp. The inter-island ferry used to run a northern route in here, years ago. Now the ramp mostly hosts gulls and a kid with a spinning rod.',
        'breakwater, rocks': 'A breakwater of big gray rocks, with gulls standing on every one of them like it is assigned seating.',
        'strait, clarence strait, water, mountains': 'Out past the mouth of the cove, Clarence Strait runs gray and wide, with snow on the mountains of Etolin Island on the far side. On a clear day you can see forever. This is not a clear day.',
        'black lab, lab, dog': { desc: 'A black lab in a red bandana, trotting the floats with the air of a dog who meets every boat. He sniffs your hand, approves of the truck smell, and goes back to work.', touch: 'He leans his whole weight into your leg and closes his eyes. You have made a friend for life, or at least until the next boat comes in.' },
        'gulls, gull': 'Gulls on the breakwater, the ramp, the pilings and the seiner. Coffman Cove has a lot of gulls, and they all have opinions.'
      },
      klawock: {
        'inlet, klawock inlet, water, tide flats, mudflats': 'A wide, sheltered inlet. At low tide the mudflats shine and herons stalk the edges like they own the place.',
        'town, houses, house': 'Houses painted bright against the gray, smoke curling from woodstove pipes and skiffs parked in the front yards. A big dog is asleep in the middle of a side street, confident nobody is in a hurry.',
        'dog, mutt, yellow dog': { desc: 'A big yellow mutt asleep in the road. It opens one eye at you, then closes it. You have been evaluated.', touch: 'The dog thumps its tail twice without waking up. A high honor.' },
        'troopers post, post, low building': 'A low building with an Alaska State Troopers shield on the sign out front and two blue-and-gold cruisers parked a little crooked.',
        'totem park, hill': 'The carved poles stand on the hillside to the west, above the harbor, facing the water.',
        'woodsmoke, smoke, stovepipes': 'Woodsmoke from a dozen stovepipes, hanging low over the town in the wet air.',
        'school, hoop, basketball hoop': 'The school, with an outdoor basketball hoop that has clearly survived a lot of rain-delayed games. A banner over the door says WELCOME in English, and underneath it in Lingít.',
        'cannery, pilings, old pilings, cannery site': "Black stubs of pilings march out into the inlet, all that's left of the cannery. It opened in 1878, one of the first in Alaska, and ran for about fifty years. Chinese crews worked the lines. The salmon that filled the cans were the same runs the Heinyaa people had lived on for thousands of years, and the canneries and fish traps came close to emptying the rivers. These days the hatchery up the Klawock River helps the sockeye and coho along.",
        'river, klawock river, klawock lake, hatchery': 'The Klawock River runs out of Klawock Lake into the inlet. A hatchery upriver helps the sockeye and coho runs, which used to feed the whole village and still feed a lot of it.'
      },
      totem_park: {
        'shed, carving shed': 'An open-sided shed full of cedar chips, with adzes and knives hung neatly along the back wall in order of size.',
        'adze, adzes, tools, knives, knife': { desc: 'Hand-forged blades, the handles worn dark and smooth from years of use.', take: 'Walt looks at you without saying a word. You put your hands in your pockets.' },
        'chips, cedar chips, shavings, curls': { desc: 'Curls of red cedar, fragrant as the inside of a hope chest.', smell: 'Cedar. You could stand here all day.', take: 'You pocket a curl of cedar for luck. Walt pretends not to notice.' },
        'view, town, inlet, water': 'From up here you can see the whole inlet, the town, and the hills fading off into the rain.',
        'path, hillside, park': 'A gravel path winds between the poles down the hill to town.',
        'sawhorses, sawhorse': 'Heavy, paint-spattered sawhorses. They have held up a lot of history.',
        'plaque, marker, wooden plaque, park sign': {
          desc: 'A cedar plaque at the foot of the path, carved and painted, with a row of small images along the bottom: raven, eagle, killer whale, wolf, frog.',
          text: "KLAWOCK TOTEM PARK\n\nThese poles were carved for the clan houses of Tuxekan, the winter village of the Heinyaa Ḵwáan, north of here. When Tuxekan's people moved to Klawock, the poles stayed behind in the rain.\n\nFrom 1938 to 1940, with the agreement of the families who owned them, the Civilian Conservation Corps and Native carvers brought 21 poles here, restoring the ones they could and recarving the ones they could not.\n\nAmong them: the Sockeye Salmon Pole, the Raven-Finned Blackfish Pole, the Eagle and Wolf Pole, the Giant Clam Pole and the pole of Gonaqadate, who brings wealth from the sea.\n\nA pole tells who a clan is: its crests, its history, its rights. Each pole belongs to the clan whose story it carries. Please do not touch or climb the poles.\n\nGUNALCHÉESH."
        },
        'tuxekan': 'Somewhere up the coast to the north, past Big Salt Lake. The old village is quiet now. The poles here are what it sent ahead.',
        'raven, ravens': "A pair of ravens on the roof of the carving shed, talking it over. In the old stories Raven brought the light into the world, mostly by accident and entirely for his own reasons. These two look like they're planning something similar."
      },
      trooper: {
        'desk, front desk, nameplate': 'Neat stacks of paper, a nameplate that reads SGT. A. REYES, and a framed photo of a very large halibut.',
        'halibut, halibut photo, framed photo of halibut': 'Reyes and a halibut roughly her size. The halibut looks more surprised than she does.',
        'files, stacks, paperwork': { desc: 'Case files. Reyes moves them two inches farther from you without looking up.', take: "'Nope,' Reyes says." },
        'wanted poster, poster, posters, bulletin board': 'WANTED: information on a stolen skiff, a stolen ATV and, for some reason, a stolen garden gnome. The island crime wave.',
        'chair, chairs, visitor chair, plastic chair': { desc: 'A plastic chair for visitors, designed for short visits.', sit: 'You sit. It is exactly as uncomfortable as it looks. Reyes seems to approve.' },
        'cruisers, cruiser, patrol car': 'Two blue-and-gold Troopers cruisers outside, mud to the bumpers.'
      },
      craig: {
        'cannery, old cannery': 'A long wooden cannery on pilings. Half of it still works. The other half is slowly going back to the sea.',
        'bait shop, bait shops, shops, stores, grocery, store': 'Bait, tackle, ammunition, groceries and espresso, sometimes all under one roof.',
        'boats': 'Boats everywhere: on trailers, in yards, on the water. Some of them even float.',
        'street, front street, pickups': 'Wet, potholed and lined with pickups, every one of them muddier than yours.',
        'neon sign, open sign, neon': 'OPEN, in buzzing red neon. The P flickers, so mostly it says O EN.',
        'bars, bar': 'Three bars for a town this size. The Riptide, just west of here, is the one with its sign lit.',
        'water, waterfront': 'The water along Front Street is crowded with boats and loud with gulls.',
        'eagles, eagle, bald eagle, light pole': 'Two bald eagles on a light pole, looking down on Craig like a pair of disappointed parents.'
      },
      harbor: {
        'boats, seiners, trollers, skiffs, boat': "Seiners with big net drums, trollers bristling with poles, and dozens of aluminum skiffs, each named after somebody's wife, daughter or bad decision.",
        'empty slip, slip, flower, cleat': "One slip near the ramp is empty. A coil of line sits on the float with a hand-lettered tag: KITTIWAKE. Somebody has tucked a single plastic flower under the cleat.",
        'gulls, gull, pilings, piling': 'Gulls fight over a herring on the pilings with the intensity of a custody hearing.',
        'ramp': 'Steep at low tide, nearly flat at high. Right now it is somewhere in between, like everything else.',
        'floats, finger piers, float, planks': 'Weathered planks on foam floats. They shift under you just enough to remind you that you are standing on water.',
        'harbormaster office, office door': "The harbormaster's office, up the ramp to the north."
      },
      harbormaster: {
        'mug, grandpa mug': "WORLD'S OKAYEST GRANDPA. Joe drinks out of it with no irony whatsoever.",
        'tide tables, tide table, tables': { desc: 'Tide tables taped to the glass, with notes in Joe\'s handwriting.', text: 'CRAIG — OCTOBER\nJoe has circled the 11th: "HIGH 9:42 PM. FLAT CALM."' },
        'window': 'Through the rain-streaked glass you can see the whole harbor and, past the breakwater, the low dark hump of Fish Egg Island.',
        'desk': 'Buried under the chart.',
        'shelf': 'The radio, a box of flares, a jar of pens and three empty mugs.',
        'door, office door': 'The door out to the harbor ramp, south.',
        'rain gear': "Faded orange, patched with Aquaseal. It's older than Kenzie."
      },
      fuel_dock: {
        'shack, bait shack': 'A plywood shack the size of a closet, selling ice, bait and chips. A sign over the window: NO SHOES, NO SHIRT, NO PROBLEM.',
        'bait, herring, bait boxes': { desc: 'Frozen herring in blue boxes.', take: "Kenzie looks up. 'You gotta pay for that.' You put it back." },
        'chips, bag of chips': { desc: 'Island-priced: eight dollars a bag.', take: "Eight dollars? You'll pass.", eat: "Eight dollars? You'll pass." },
        'ice, bags of ice': 'Bags of ice for sale. Plenty of free water falling from the sky too.',
        'float, floats, harbor floats': 'The fuel float bobs gently, slick with rain and a rainbow sheen of gas.',
        'float coat': 'Bright orange and three sizes too big. It probably belonged to her dad.'
      },
      tavern: {
        'bar, counter, slab': 'A long bar made from a single slab of yellow cedar, scarred with forty years of bottle rings.',
        'stools, stool, barstool': { desc: 'Red vinyl and duct tape.', sit: 'You take a stool at the bar. Bonnie gives you a look that says you had better order something.' },
        'glass floats, floats, fishing floats, buoys, ceiling': 'Old Japanese glass fishing floats, green and blue, hanging in nets from the ceiling. Some of them drifted across the whole Pacific to get here.',
        'jukebox': {
          desc: 'A jukebox stocked entirely with Johnny Cash and one Enya album nobody will admit to.',
          push: 'You press a button. Johnny Cash starts in on "Ring of Fire." Cal raises his bottle in salute without looking up.',
          listen: "Johnny Cash, low and steady."
        },
        'tv, television': 'Mounted in the corner, playing a fishing show on mute. A man in Florida is very excited about a bass.',
        'glass': 'The glass Bonnie is polishing. It was clean ten minutes ago.',
        'napkins, stack of napkins, napkin stack': 'A stack of cocktail napkins printed RIPTIDE TAVERN, CRAIG AK. Same as the one in Dale\'s handwriting.',
        'door, front door': 'A heavy door with a porthole window, west onto Front Street.',
        'duffel, duffel bag': "Cal's duffel, slumped at his feet. Rain gear, a fly box, a thermos and a paperback with no cover."
      },
      lodge_road: {
        'road, gravel road': 'Gravel, puddles and the occasional slug.',
        'shore, beach, rocks, boulders': 'A rocky beach and kelp-slick boulders. The tide is coming in.',
        'lodge sign, sign, carved sign': 'A carved wooden sign: HARBOR LIGHT LODGE, GUIDED FISHING, EST. 1990. Under it are two empty screw holes, as if another sign hung there and was taken down.',
        'slug, slugs, banana slug': { desc: 'A banana slug the length of a hot dog, going nowhere slowly. Relatable.', touch: 'Slime. Lots of it. Why did you do that?' }
      },
      lodge: {
        'couches, couch, sofa, leather couches': { desc: 'Leather couches gone soft and shiny with use. The kind you sink into and lose a whole afternoon.', sit: 'You sink into a couch. It is dangerously comfortable. Rick shifts in his chair and watches you.' },
        'guestbook, guest book, book, stand': { desc: 'A leather guestbook on a stand by the door.', text: 'Thirty-five years of guests. "Best trip of my life!" — the Hendersons, Ohio. "Dale is a FISH WHISPERER." "Came for the kings, stayed for Marnie\'s bread."\nThe entries thin out over the last few years. The last one is from August. Nobody has signed since.' },
        'photos, pictures, wall photos, guests': 'Framed photos line the wall: grinning guests holding up kings, silvers and halibut, with Dale in the background of most of them, sunburned and pleased. The newest ones are a few years old.',
        'mantel': 'River rock and a cedar beam. The king salmon presides.',
        'chair, armchair': "Rick's in it.",
        'windows, window': 'Big windows facing across the water to Fish Egg Island.',
        'room, timber frame, beams, timber, ceiling': 'Big hand-hewn timbers overhead, dark with years of woodsmoke. Dale built this room himself, the plaque by the fireplace says, in 1990.',
        'kitchen door, front door, doors, path': 'The kitchen is through the door to the east, the boathouse is down the path to the south, and the front door opens north onto the road.'
      },
      kitchen: {
        'counters, counter, steel counters': 'Stainless steel, scrubbed until it shines.',
        'range, stove, burners, six-burner range': 'A big six-burner range with a pot of coffee keeping warm on the back.',
        'coffee, coffee pot, pot': { desc: 'A big dented pot of coffee on the back burner.', drink: "Marnie pours you a cup without being asked. It's strong enough to strip paint, and it's the best thing that's happened to you all day.", take: "Marnie pours you a cup without being asked. It's strong enough to strip paint, and it's the best thing that's happened to you all day." },
        'cooler, walk-in, walk-in cooler, walk in cooler': { desc: 'A walk-in cooler, humming.', open: "You crack the door. Vacuum-packed salmon, halibut cheeks and a whole shelf of Marnie's smoked salmon in jars. 'Shut that,' Marnie says. 'You're letting the cold out.'", listen: 'Hmmmmmmmm.' },
        'window, sink': 'The window over the sink looks straight out at Fish Egg Island. There are two coffee rings on the sill from someone standing here a lot this week.',
        'apron': 'Flour-dusted, with HARBOR LIGHT stitched on the bib.'
      },
      office: {
        'window': 'Rain on the glass, and the gray water beyond.',
        'lamp, green lamp, bankers lamp': { desc: "A banker's lamp with a green glass shade.", turnon: 'Warm green light. The office somehow looks emptier.', turnoff: 'Click. Gray again.' },
        'chair, desk chair, leather chair': { desc: "A cracked leather desk chair, worn into the shape of the man who used to sit in it.", sit: "You sit in Dale's chair. It's too big for you in all the wrong ways." },
        'nameplate': 'D. HAUGEN, in brass.',
        'walls, wall, door': 'Wood paneling covered in charts and the calendar. The door is east, back to the great room.'
      },
      boathouse: {
        'survival suit hooks, hooks, hook, pegs, peg, survival suits, suits': "Four pegs by the door for survival suits, the orange full-body kind that keep you alive in cold water. Three suits hang there. The fourth peg is empty, and the tag above it reads DALE. A man going out to check crab pots on a calm night doesn't take his survival suit. A man planning to swim does.",
        'workbench, bench, tools, coffee can': 'A workbench with outboard parts, a coffee can of nuts and bolts, and a brand-new brass drain plug, still in the package. Dale kept spares of everything.',
        'path, door': 'The path climbs north back up to the lodge.',
        'water, pilings, gaps, floor': 'Black water slapping at the pilings, visible through gaps in the floorboards.'
      }
    };

    const SENSES = {
      ferry: { listen: "The ferry's engine fading away across the water. Rain ticking on the gravel. A raven making a noise like a dripping faucet.", smell: 'Salt water, diesel and wet spruce.' },
      hwy: { listen: 'The Harris River, loud with rain, rushing under the bridge.', smell: 'Wet alder and river.', sit: 'You lean on the guardrail and watch the water for a minute. A steelhead rolls in the tailout. Of course it does.' },
      thorne_road: { listen: 'Just rain, and a varied thrush whistling one long note somewhere in the trees.', smell: 'Wet gravel and spruce.' },
      trailhead: { listen: 'Ravens. The river, far off to the east. Something big snaps a branch, once. Then nothing.', smell: 'Spruce and mud. No woodsmoke. Nobody is cooking anything out here.' },
      river_trail: { listen: 'Water dripping off a thousand branches. The river, closer now, to the east.', smell: 'Rot and green. The whole forest is composting itself.' },
      ford: { listen: 'The river, loud enough to drown out your own thoughts.', smell: 'Cold water and salmon rot.', sit: 'You sit on a log on the gravel bar and watch the cabin across the river. Nothing moves over there.' },
      cabin: { listen: 'Nothing. The river outside, and the drip from the eaves. A cabin nobody is in anymore.', smell: 'Old propane and cold coffee.' },
      dog_creek: { listen: 'The creek chattering over gravel beside the road. A salmon slapping in the shallows. The cub, complaining about something. Somewhere ahead, a dog barks in town.', smell: 'Creek water, dead salmon and wet bear. Bear country.' },
      luck_lake: { listen: 'The loon, long and wavering, from out in the middle of the lake. Eagle Creek chattering out of the lake beside the beach. Rain on the shelter roof.', smell: 'Cold lake water and wet cedar.', sit: 'You sit at the picnic table under the shelter. Rain ticks on the roof. Somebody carved D.H. + M.H. 1986 into the plank next to your hand.' },
      sweetwater_turnoff: { listen: 'Rain in the alders. The lake lapping at the shore below. Far off, a logging truck downshifting on a hill.', smell: 'Mud, wet alder and lake water.' },
      sweetwater_landing: { listen: 'Water lapping at the gravel. Up the shore, very faintly, someone splitting wood.', smell: 'Lake water and, from up the shore, woodsmoke.' },
      sweetwater_lake: { listen: 'Oar drips. Your own breathing. Somewhere far off, a loon.', smell: 'Clean cold water and woodsmoke.', sit: "You're already sitting, in a small aluminum boat, in the middle of a lake. Life comes at you fast." },
      sweetwater_cabin: { sit: 'You sit on the bench across from Dale. Neither of you says anything for a while.', listen: 'The woodstove ticking. The kettle starting to sing. Dale breathing like a man trying very hard to seem relaxed.', smell: 'Woodsmoke, coffee and wool socks.' },
      coffman_cove: { listen: 'Gulls, a chainsaw somewhere up the hill, and a screen door slapping shut.', smell: 'Woodsmoke, salt water and somebody frying bacon.' },
      cove_store: { listen: "The woodstove ticking. Hazel's pencil scratching. A radio playing the swap show out of Ketchikan.", smell: 'Woodsmoke, coffee, bait and new rubber boots.', sit: "You sit on the bench by the woodstove. Hazel looks at you over her glasses. 'Take your time.' It's the nicest thing anyone has said to you all week." },
      cove_harbor: { listen: "Halyards, gulls, and the lab's tags jingling as he trots the floats.", smell: 'Salt, diesel and crab bait.' },
      klawock: { listen: 'Ravens arguing over a dumpster. A skiff outboard droning out on the inlet.', smell: 'Woodsmoke and low tide.' },
      totem_park: { listen: 'The adze biting cedar, steady as a heartbeat.', smell: 'Fresh-cut cedar.', sit: 'You sit on the low wall at the edge of the park and look out over the inlet. The poles look out with you. It is very peaceful.' },
      trooper: { sit: 'You sit in the plastic visitor chair. It is exactly as uncomfortable as it looks. Reyes seems to approve.', listen: "Fluorescent hum. A police scanner muttering about a deer on the Hydaburg road.", smell: 'Burnt coffee and floor wax.' },
      craig: { listen: "Gulls, a forklift beeping at the cannery, and somebody's truck stereo playing country.", smell: 'Fish, diesel, and frying oil from somewhere.' },
      harbor: { listen: 'Halyards slapping masts. Gulls. A bilge pump kicking on and off.', smell: 'Salt, fish and two-stroke exhaust.' },
      harbormaster: { listen: "The VHF: '...Craig harbor, this is the Marlene, coming in with a bent prop and a bad attitude, over.'", smell: 'Coffee and wet rain gear.' },
      fuel_dock: { listen: "The fuel pump ticking. Something tinny playing on Kenzie's phone.", smell: 'Gasoline and herring.' },
      tavern: { sit: 'You take a stool at the bar. Bonnie gives you a look that says you had better order something.', listen: 'Johnny Cash, low. Ice rattling. Cal sighing at his empty bottle.', smell: 'Fryer oil, beer and wet wool.' },
      lodge_road: { listen: 'Waves on the rocks. A raven doing an impression of a car alarm.', smell: 'Kelp and salt.' },
      lodge: { sit: 'You sink into a couch. It is dangerously comfortable. Rick shifts in his chair and watches you.', listen: 'The fire popping. Rick clearing his throat a lot.', smell: 'Woodsmoke, leather and old fish stories.' },
      kitchen: { sit: "You pull a stool up to the steel counter. Marnie slides a heel of warm bread in front of you without a word.", listen: 'The cooler humming. Dough slapping the counter.', smell: 'Fresh bread and coffee. For a second you forget why you are here.' },
      office: { sit: "You sit in Dale's chair. It's too big for you in all the wrong ways.", listen: 'Rain on the window. The house settling.', smell: 'Pipe tobacco and old paper.' },
      boathouse: { listen: 'Water slapping the pilings. The whole building creaking like a ship.', smell: 'Two-stroke oil, seaweed and wet rope.' }
    };

    for (const [id, sc] of Object.entries(SCENERY)) rooms[id].scenery = Object.assign({}, rooms[id].scenery, sc);
    for (const id of OUTDOOR_ROOMS) rooms[id].scenery = Object.assign({}, OUTDOOR, rooms[id].scenery);
    for (const [id, se] of Object.entries(SENSES)) Object.assign(rooms[id], se);

    // ------------------------------------------------------------- the map
    // Every room has real coordinates (map.at = [longitude, latitude]) and
    // belongs to a site: one pin on the map. Towns hold several rooms, listed
    // under their pin as you discover them. The island itself (coastline,
    // lakes, rivers, roads) is in js/geodata.js, built from USGS data by
    // tools/build_geodata.py.
    const mapSites = {
      hollis: { name: 'Hollis Ferry', label: [-14, -12, 'end'] },
      harris: { name: 'Harris River Bridge', label: [0, 26, 'middle'] },
      klawock: { name: 'Klawock', label: [12, -6, 'start'] },
      craig: { name: 'Craig', label: [-12, -6, 'end'] },
      lodge: { name: 'Harbor Light Lodge', label: [12, 18, 'start'] },
      control: { name: 'Control Lake Junction', label: [-12, -8, 'end'] },
      thorne: { name: 'Thorne River', label: [-12, 22, 'end'] },
      sweetwater: { name: 'Sweetwater Lake', label: [16, 30, 'start'] },
      coffman: { name: 'Coffman Cove', label: [12, -10, 'start'] },
      dog: { name: 'Dog Creek', label: [12, 4, 'start'] },
      luck: { name: 'Luck Lake', label: [14, 4, 'start'] }
    };
    // How each room is listed under its site's pin.
    const mapSubLabels = {
      klawock: 'Downtown', totem_park: 'Totem Park', trooper: 'Troopers Post',
      craig: 'Front Street', harbor: 'South Cove Harbor', harbormaster: 'Harbormaster', fuel_dock: 'Fuel Dock', tavern: 'Riptide Tavern',
      lodge_road: 'Lodge Road', lodge: 'Great Room', kitchen: 'Kitchen', office: "Dale's Office", boathouse: 'Boathouse',
      trailhead: 'Trailhead', river_trail: 'Old-Growth Trail', ford: 'River Crossing', cabin: 'Thorne Cabin',
      sweetwater_turnoff: 'Pullout', sweetwater_landing: 'Landing', sweetwater_lake: 'On the Lake', sweetwater_cabin: 'Sweetwater Cabin',
      coffman_cove: 'Town', cove_store: 'General Store', cove_harbor: 'Cove Harbor'
    };
    for (const [id, label] of Object.entries(mapSubLabels)) rooms[id].map.label = label;

    // Names printed on the map, at real positions.
    // Towns printed on the map (GNIS coordinates), so you can see where everything is before you go.
    const mapTowns = [
      { name: 'Hollis', at: [-132.645, 55.484] },
      { name: 'Klawock', at: [-133.0848, 55.5522], label: [12, -6, 'start'] },
      { name: 'Craig', at: [-133.1483, 55.4764], label: [-12, -6, 'end'] },
      { name: 'Thorne Bay', at: [-132.5222, 55.6878] },
      { name: 'Kasaan', at: [-132.4008, 55.5389] },
      { name: 'Hydaburg', at: [-132.8267, 55.2081] },
      { name: 'Coffman Cove', at: [-132.8278, 56.0139], label: [12, -10, 'start'] },
      { name: 'Naukati Bay', at: [-133.1847, 55.8736] },
      { name: 'Whale Pass', at: [-133.1208, 56.1153] },
      { name: 'Point Baker', at: [-133.6211, 56.3528], label: [10, -6, 'start'] },
      { name: 'Port Protection', at: [-133.5981, 56.3172] },
      { name: 'Edna Bay', at: [-133.6622, 55.9489] },
      { name: 'Waterfall', at: [-133.2406, 55.2972], label: [-10, 6, 'end'] }
    ];
    // Road names, placed along the real road (a story route and how far along it, or a spot to snap to).
    const mapRoads = [
      { text: 'Hollis–Klawock Hwy', route: 'ferry|hwy', t: 0.55 },
      { text: 'Hollis–Klawock Hwy', route: 'hwy|klawock', t: 0.5 },
      { text: 'Craig–Klawock Hwy', route: 'craig|klawock', t: 0.45 },
      { text: 'Big Salt Rd', route: 'klawock|thorne_road', t: 0.6 },
      { text: 'Thorne Bay Rd', route: 'thorne_road|trailhead', t: 0.5 },
      { text: 'N. Prince of Wales Rd', route: 'sweetwater_turnoff|thorne_road', t: 0.25 },
      { text: 'Coffman Cove Rd', route: 'coffman_cove|sweetwater_turnoff', t: 0.5 },
      { text: 'Coffman Cove Loop', route: 'dog_creek|luck_lake', t: 0.5 },
      { text: 'Hydaburg Hwy', at: [-132.859, 55.326] },
      { text: 'Kasaan Hwy', at: [-132.501, 55.632] },
      { text: 'N. Prince of Wales Rd', at: [-133.06, 55.80] }
    ];

    const mapLabels = [
      { text: 'PRINCE OF WALES ISLAND', at: [-132.98, 55.76], size: 34, rotate: -62, cls: 'island' },
      { text: 'CLARENCE STRAIT', at: [-132.60, 55.86], size: 22, rotate: -58, cls: 'water' },
      { text: 'Klawock Inlet', at: [-133.168, 55.530], size: 17, rotate: -62, cls: 'water' },
      { text: 'San Alberto Bay', at: [-133.215, 55.505], size: 17, rotate: -75, cls: 'water' },
      { text: 'Twelvemile Arm', at: [-132.700, 55.468], size: 17, rotate: 0, cls: 'water' },
      { text: 'Clark Bay', at: [-132.595, 55.500], size: 16, rotate: 0, cls: 'water' },
      { text: 'Thorne Bay', at: [-132.600, 55.655], size: 17, rotate: 0, cls: 'water' },
      { text: 'Coffman Cove', at: [-132.840, 56.030], size: 17, rotate: 0, cls: 'water' },
      { text: 'Big Salt Lake', at: [-133.020, 55.615], size: 16, rotate: -35, cls: 'water' },
      { text: 'Fish Egg Island', at: [-133.1703, 55.4922], size: 14, rotate: 0, cls: 'isle' }
    ];

    // ---------------------------------------------------------------- the case notebook
    // Leads show up in the notebook once you'd know about them, and tick themselves off when they're done.
    const leads = [
      { id: 'case_file', text: 'Read the case file.', show: () => true, done: (g) => g.flag('read_case_file') },
      { id: 'keys', text: 'Get the rental truck keys from the lockbox at the Hollis ferry terminal.', show: (g) => g.flag('read_case_file'), done: (g) => hasKeys(g) },
      { id: 'joe', text: 'See the harbormaster in Craig. He found the skiff.', show: (g) => g.flag('read_case_file'), done: (g) => g.has('calm_night') },
      { id: 'marnie', text: "Talk to Dale's wife, Marnie, at the Harbor Light Lodge south of Craig.", show: (g) => g.flag('read_case_file') && (g.has('calm_night') || g.state.visited.lodge), done: (g) => g.flag('got_key') },
      { id: 'skiff', text: 'Look over the Kittiwake in the lodge boathouse.', show: (g) => g.flag('got_report') || g.state.visited.lodge, done: (g) => g.has('lanyard') },
      { id: 'office', text: "Go through Dale's office at the lodge.", show: (g) => g.flag('got_key'), done: (g) => g.has('photo') && g.has('topo_map') },
      { id: 'safe', text: "Open Dale's office safe. It has a three-number dial.", show: (g) => g.state.visited.office || g.has('photo'), done: (g) => !g.itemState('safe').locked },
      { id: 'propane', text: 'Who bought propane and groceries? Try the Craig fuel dock.', show: (g) => g.has('topo_map'), done: (g) => g.has('receipt') },
      { id: 'cal', text: 'Get Cal Brenner at the Riptide to talk. He looks thirsty.', show: (g) => g.state.visited.tavern, done: (g) => g.has('cal_tip') },
      { id: 'thorne', text: 'Check the cabin on the Thorne River: Big Salt Road to Control Lake, then the Thorne Bay Road.', show: (g) => g.has('topo_map') || g.flag('knows_cabin') || g.has('cal_tip'), done: (g) => g.state.visited.cabin || g.has('rick_note') || g.has('found_dale') },
      { id: 'light', text: "Find a light. It's black as night under the old growth.", show: (g) => g.state.visited.river_trail, done: (g) => g.isOwned('flashlight') },
      { id: 'waders', text: 'The Thorne is running high. Find some waders.', show: (g) => g.state.visited.ford, done: (g) => g.isOwned('waders') || g.state.visited.cabin },
      { id: 'sweetwater', text: 'Get to the Forest Service cabin on Sweetwater Lake, near Coffman Cove.', show: (g) => g.has('rick_note') || g.flag('knows_sweetwater'), done: (g) => g.has('found_dale') },
      { id: 'hazel', text: 'Talk to Hazel at the Coffman Cove store.', show: (g) => g.state.visited.coffman_cove, done: (g) => g.flag('hazel_talked') },
      { id: 'oars', text: 'Find oars for the Sweetwater skiff.', show: (g) => g.state.visited.sweetwater_landing || g.has('rick_note'), done: (g) => g.inInv('oars') || g.has('found_dale') },
      { id: 'dale', text: 'Get the whole story out of Dale.', show: (g) => g.has('found_dale'), done: (g) => g.flag('dale_confessed') },
      { id: 'report', text: 'Report it to Sgt. Reyes at the Troopers post in Klawock.', show: (g) => g.flag('dale_confessed'), done: (g) => g.has('solved') }
    ];

    // Your working theory, rewritten as the evidence comes in.
    function theory(g) {
      if (g.has('solved')) return 'Case closed. Dale Haugen faked his own drowning, and Rick Sorensen helped him do it, for a $1.5 million payout.';
      if (g.has('found_dale')) return "Dale Haugen is alive. He faked his own death, and Rick's been hiding him. Now prove it to the Troopers.";
      if (g.has('rick_note') || g.has('hazel_tip')) return "Somebody is alive out there, and Rick Sorensen is keeping them fed. Odds are it's Dale.";
      if (g.has('napkin')) return "Insurance fraud. Dale and Rick planned to split 'the payout' 60/40. So where is Dale?";
      if (g.has('lanyard') || g.has('rod_missing')) return 'This was no accident. Somebody staged that skiff.';
      if (g.has('calm_night')) return "A forty-year boatman, a flat calm night and no body. It doesn't add up.";
      return "Dale Haugen went out in his skiff and never came back. Accident? That's what you're here to find out.";
    }

    // What you know so far, one line per thing you've learned, in story order.
    function summary(g) {
      const lines = [];
      lines.push("Dale Haugen, 61, vanished off Fish Egg Island on October 11. His skiff was found swamped; no body. Three months ago he changed his life insurance beneficiary from his wife, Marnie, to his partner, Rick Sorensen. Payout: $1.5 million.");
      if (g.has('calm_night')) lines.push('The night he vanished was flat calm. Dale had run boats for forty years.');
      if (g.has('lanyard')) lines.push("The skiff's drain plug was unscrewed, and his kill switch wasn't on his wrist. Staged.");
      if (g.has('rod_missing')) lines.push("His father's 1952 Winston is gone from the rack. Dead men don't pack their favorite rod.");
      if (g.has('foreclosure')) lines.push('The lodge is $214,000 behind. The bank forecloses December 1.');
      if (g.has('napkin')) lines.push("A napkin in Dale's hand: 'R — 60/40 after the payout.'");
      if (g.has('receipt')) lines.push('Rick bought propane and gas in cash the morning after Dale drowned.');
      if (g.has('cal_tip') || g.has('topo_map')) lines.push("Rick keeps driving up the Thorne Bay Road, and Dale's topo map has a cabin circled on the Thorne.");
      if (g.has('rick_note')) lines.push("Rick moved 'D' from the Thorne cabin to Sweetwater Lake.");
      if (g.has('hazel_tip')) lines.push('Rick buys groceries for two in Coffman Cove, and he borrowed oars for the Sweetwater skiff.');
      if (g.has('found_dale')) lines.push('Found Dale Haugen alive in the Sweetwater cabin.');
      if (g.has('solved')) lines.push('Reported the whole thing to Sgt. Reyes.');
      return lines;
    }

    // ---------------------------------------------------------------- hints
    // Turn-by-turn directions from wherever you are now, so a hint never assumes where you're standing.
    function directions(g, to) {
      const from = g.state.loc === 'truck_cab' ? truckLoc(g) : g.state.loc;
      if (from === to) return '';
      const prev = { [from]: null };
      const queue = [from];
      while (queue.length) {
        const here = queue.shift();
        if (here === to) break;
        for (const [dir, exit] of Object.entries(g.rooms[here].exits || {})) {
          const next = typeof exit === 'string' ? exit : exit.to;
          if (typeof next !== 'string' || next === 'truck_cab' || dir === 'in' || dir === 'out' || next in prev) continue;
          prev[next] = { here, dir };
          queue.push(next);
        }
      }
      if (!(to in prev)) return '';
      const steps = [];
      for (let r = to; prev[r]; r = prev[r].here) steps.unshift(`${prev[r].dir.toUpperCase()} to ${g.rooms[r].name}`);
      return `From here: ${steps.join(', then ')}.`;
    }

    // Why to go, how to get there from here, then what to do there.
    const goDo = (g, to, text) => {
      const dirs = directions(g, to);
      if (!dirs) return text;
      const cut = text.indexOf('. ');
      return cut < 0 ? `${text} ${dirs}` : `${text.slice(0, cut + 1)} ${dirs} ${text.slice(cut + 2)}`;
    };

    function hint(g) {
      const st = g.state;
      if (!st.flags.read_case_file) return 'Start by reading your case file: READ FILE.';
      if (!hasKeys(g)) return goDo(g, 'ferry', "Your truck keys are in the Island Auto lockbox on the Hollis ferry terminal wall. The code is the last four digits of your claim number (it's on the case file). Try ENTER and the code.");
      if (!g.has('calm_night')) return goDo(g, 'harbormaster', 'The harbormaster in Craig found the skiff. TALK TO JOE, then read what he gives you or ASK JOE ABOUT WEATHER.');
      if (!g.flag('got_key')) return goDo(g, 'kitchen', 'Visit the Harbor Light Lodge, south of Craig, and TALK TO MARNIE in the kitchen.');
      if (!g.has('lanyard')) return goDo(g, 'boathouse', 'The Kittiwake is in the lodge boathouse. EXAMINE SKIFF.');
      if (!g.has('rod_missing')) return goDo(g, 'lodge', 'Take a careful look at the rod rack in the lodge great room.');
      if (!g.has('photo')) return goDo(g, 'office', "Something on Dale's desk might be more than decoration. Try READ PHOTO.");
      if (g.itemState('safe').locked) return goDo(g, 'office', "The back of the photo has three numbers on it, and the safe in Dale's office has a three-number dial. Try DIAL followed by those numbers.");
      if (!g.has('napkin') || !g.has('foreclosure')) return goDo(g, 'office', "Read everything in Dale's safe.");
      if (!g.has('topo_map')) return goDo(g, 'office', "Open the desk drawer in Dale's office and read what you find.");
      if (!g.has('receipt')) return goDo(g, 'fuel_dock', 'Ask the fuel dock attendant in Craig about Rick, and search the trash barrel.');
      if (!g.isOwned('waders')) return goDo(g, 'tavern', 'Cal at the Riptide Tavern in Craig knows the rivers. He looks thirsty. BUY BEER, then GIVE BEER TO CAL.');
      if (!g.isOwned('flashlight')) {
        return g.state.loc === 'truck_cab' ? 'Check the glovebox: OPEN GLOVEBOX.'
          : goDo(g, truckLoc(g), 'Check the glovebox of your rental truck. GET IN TRUCK, then OPEN GLOVEBOX.');
      }
      if (!g.has('found_dale')) {
        if (!g.has('rick_note') && !g.flag('knows_sweetwater')) {
          if (g.state.loc === 'cabin') return 'Somebody left in a hurry. Read what they left on the table.';
          if (!g.itemState('flashlight').on && ['trailhead', 'river_trail'].includes(g.state.loc)) return 'Turn on the flashlight before you head under the old growth: TURN ON FLASHLIGHT.';
          if (!g.isWorn('waders') && g.state.loc === 'ford') return 'You will need to WEAR WADERS to cross the Thorne.';
          return goDo(g, 'cabin', "The cabin on the topo map is across the Thorne River. You'll want your flashlight on under the old growth and your waders on at the river.");
        }
        if (!g.inInv('oars')) return goDo(g, 'cove_store', 'Rick took the oars from the Sweetwater skiff. Hazel at the general store in Coffman Cove might have another pair. TALK TO HAZEL.');
        return goDo(g, 'sweetwater_cabin', 'The cabin is up the shore of Sweetwater Lake. You row the last stretch.');
      }
      if (!g.flag('dale_confessed')) return goDo(g, 'sweetwater_cabin', 'Talk to Dale. Show him the napkin if he stonewalls you.');
      return goDo(g, 'trooper', 'Go to the State Troopers post in Klawock and ACCUSE whoever is responsible. Maybe more than one person.');
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
      intro, clues, rooms, items, npcs, hint, mapSites, mapLabels, mapTowns, mapRoads, leads, theory, summary,
      // "in" from wherever your truck is parked.
      // IN gets you into your truck, wherever it's parked, unless the place has a building you'd walk into.
      extraExits: (g, room) => {
        if (room.id === 'truck_cab' || truckLoc(g) !== room.id || room.exits.in) return null;
        return { in: { to: 'truck_cab', guard: (gg) => truckDoor(gg) } };
      },
      // START TRUCK, or a bare DRIVE.
      driveHelp: (g) => (g.state.loc === 'truck_cab' || truckLoc(g) === g.state.loc
        ? startEngine(g)
        : "Your truck isn't here. Say where you want to go: DRIVE WEST, or DRIVE TO a place you've been."),
      stopEngine: (g) => stopEngine(g),
      timeText: 'Late afternoon, late October. The light goes early this time of year, and it was never really here to begin with.',
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
