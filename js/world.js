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

    function road(to, text) {
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
          // Mention climbing in unless you're already behind the wheel (in the cab, or mid-trip).
          const climb = !inCab && !g.drivingNow ? 'You climb into the pickup and turn the key. ' : '';
          g.drivingNow = true;
          g.moveItem('truck', to);
          g.print(climb + text, 'travel');
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
        map: { x: 6, y: 2, label: ['Hollis', 'Ferry'] },
        name: 'Hollis Ferry Terminal',
        aliases: ['ferry', 'hollis', 'ferry terminal', 'hollis ferry'],
        dial: (g, nums) => {
          const st = g.itemState('lockbox');
          if (!st.locked) return 'The lockbox is already open.';
          const code = nums.join('');
          if (code === '1187') {
            st.locked = false;
            st.open = true;
            return 'You punch in 1-1-8-7. The lockbox beeps twice and its little door pops open.\n' + g.contentsLine('lockbox');
          }
          return `You punch in ${code}. The keypad gives an unhappy beep and blinks red.`;
        },
        desc: (g) => (g.state.visited.hwy
          ? 'The Hollis ferry dock, empty and gray, with Clarence Strait chopping away beyond it. Spruce and hemlock crowd the hill above the small terminal building and the gravel lot. The road runs west into the trees.'
          : 'The inter-island ferry groans away from the dock behind you, back across Clarence Strait toward Ketchikan. Rain blows in sideways off the water, fine as mist and twice as wet. Spruce and hemlock crowd the hill above a small gray terminal building and a gravel lot. The only road out runs west into the trees.'),
        exits: {
          west: road('hwy', "The engine catches on the second try. You pull out of the ferry lot and head west, wipers slapping, into a tunnel of dripping spruce. A few miles in, the road crosses the Harris River, and you pull onto the shoulder by the bridge.")
        }
      },

      truck_cab: {
        name: 'In Your Rental Pickup',
        aliases: ['truck', 'pickup', 'cab', 'car', 'rental truck', 'rental'],
        mapAs: (g) => truckLoc(g),
        desc: (g) => "You're in the driver's seat of your rental pickup: cracked vinyl, a windshield with a star-shaped crack, and a salmon-shaped air freshener that smells like neither pine nor salmon. The glovebox is in front of the passenger seat. Rain drums on the roof. Through the windshield: " + g.rooms[truckLoc(g)].name + ".\n\nYou can DRIVE any direction the road goes, DRIVE TO a place you've been, or get OUT.",
        // From the cab you can drive (or step out and walk) anywhere the parking spot leads.
        exitsFn: (g) => {
          const ex = Object.assign({}, g.rooms[truckLoc(g)].exits);
          delete ex.in;
          ex.out = { to: (gg) => truckLoc(gg) };
          return ex;
        },
        exits: { out: { to: (g) => truckLoc(g) } },
        noExit: "The road doesn't go that way.",
        sit: "You're already sitting. It's the best part of the job.",
        listen: 'Rain drumming on the roof. The engine ticking as it cools.',
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
          'ignition, engine, steering wheel, wheel, dashboard, dash, gauges': 'The steering wheel is worn smooth at ten and two. The gas gauge says three-quarters, which on this island means "enough, probably."',
          'cup holder, old cup, coffee cup': { desc: "Someone's old coffee cup, abandoned. There's a fuzzy island growing in it. You leave it alone.", drink: 'No. Absolutely not.' },
          'rearview mirror, mirror': 'You look tired. Rental-car tired.',
          'floor, floor mat, mats, ticket stub, stub': 'Gravel, a ferry ticket stub and a single Cheerio.',
          'truck, pickup, rental, cab': "Your home away from home: a rental pickup that smells like old coffee and has opinions about second gear.",
          'roof, rain': 'Rain drumming on the roof, steady as a snare drum. It is oddly cozy in here.'
        }
      },

      hwy: {
        map: { x: 4, y: 2, label: ['Harris R.', 'Bridge'] },
        name: 'Hollis–Klawock Highway',
        aliases: ['highway', 'hwy', 'road', 'bridge', 'harris river'],
        desc: "The two-lane highway winds through muskeg and second-growth forest, past old clearcuts filling back in with alder. Here it crosses the Harris River on a concrete bridge. Below, the river runs high and tea-colored from the fall rain, and you'd swear a steelhead just rolled in the tailout. East goes back to the Hollis ferry. West, the highway continues on to Klawock. A gravel road branches north at a sign: THORNE BAY.",
        exits: {
          east: road('ferry', 'You drive back east toward Hollis. The road dips through muskeg and old clearcuts until the gray water of the strait opens up ahead, and you pull into the ferry lot.'),
          west: road('klawock', 'West on the highway, past Klawock Lake shining like hammered tin through the alders. A school bus passes going the other way and the driver lifts two fingers off the wheel. Everybody waves here. You roll down the hill into Klawock and park.'),
          north: road('thorne_road', "You turn north onto the gravel at the THORNE BAY sign. The pavement gives up almost immediately. Potholes the size of bathtubs. The truck's suspension files a formal complaint.")
        },
        fish: "No rod, no license and no time. The steelhead will have to wait. They're good at that."
      },

      thorne_road: {
        map: { x: 4, y: 1, label: ['Thorne', 'Bay Rd'] },
        name: 'Thorne Bay Road',
        aliases: ['thorne bay road', 'thorne road', 'gravel road', 'thorne bay'],
        desc: 'Gravel and potholes wind north through logging country, past a lake as still as poured pewter. Old spur roads branch off into the hills, most of them gated and all of them muddy. The road keeps going north toward the Thorne River. South takes you back to the highway.',
        exits: {
          south: road('hwy', 'You rattle back south down the gravel until the pavement picks up again at the highway, and pull over by the bridge.'),
          north: road('trailhead', "The road narrows. Alder slaps at the mirrors. You nearly miss the pullout: just a wide spot in the gravel and a brown Forest Service sign. You park and kill the engine. It's very quiet.")
        }
      },

      trailhead: {
        map: { x: 4, y: 0, label: ['Trailhead'] },
        name: 'Thorne River Trailhead',
        aliases: ['trailhead', 'pullout'],
        desc: "A gravel pullout at the edge of serious forest. A brown Forest Service sign, bullet-pocked in one corner, marks a trail heading east into the old growth toward the Thorne River. The mud here is churned up with tire tracks, and one set is a lot fresher than the rest. The gravel road keeps going north toward Coffman Cove, and Thorne Bay Road heads back south.",
        exits: {
          south: road('thorne_road', 'You bump back out of the pullout and head south on the gravel.'),
          north: road('luck_lake', 'North past the trailhead the road gets narrower and the trees get bigger. A grouse explodes out of the ditch and nearly gives you a heart attack. Then a long, narrow lake shows through the trees on your right. At its north end you turn down a gravel spur to the beach and park.'),
          east: 'river_trail'
        }
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
        desc: "The trail ends at a gravel bar on the Thorne River. The river is big here, running high and cold and the color of strong tea, pushing hard over a riffle that crosses to the far bank. Through the trees on the other side you can make out a cabin roof. No smoke from the chimney. The trail runs back west into the forest.",
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
        fish: "Even without a rod you can read it: the seam along the far bank, the soft water behind that boulder. Whoever picked that cabin picked it for the water."
      },

      cabin: {
        map: { x: 7, y: 0, label: ['Thorne', 'Cabin'] },
        name: 'Thorne River Cabin',
        aliases: ['thorne cabin', 'thorne river cabin', 'cabin'],
        desc: 'A one-room cabin of weathered spruce logs. The Forest Service rents it out in summer, and nobody uses it this late in the year. Somebody did, though, and not long ago. Two propane cylinders stand next to a cold propane heater, a cardboard box is full of empty cans, and the bunk has been stripped to bare planks. Whoever was here left in a hurry, maybe a few days back. The door leads west, back to the river.',
        exits: { west: 'ford', out: 'ford' }
      },

      // ----- the north end: Coffman Cove country
      dog_creek: {
        map: { x: 4, y: -2, label: ['Dog Creek'] },
        name: 'Dog Creek',
        aliases: ['dog creek'],
        desc: "For the last mile into Coffman Cove, the road runs right alongside Dog Creek. The creek is clear and quick over clean gravel, and the bank is trampled flat where the bears come down to fish. Just downstream, a black bear sow and her cub are working the shallows and ignoring you completely. Ahead, through the trees, you can see the first rooftops and the gray water beyond the town. A gravel side road signed HALF DOG ROAD climbs off to the east. The road goes north into town and south toward Luck Lake.",
        exits: {
          north: road('coffman_cove', 'You follow the creek the last stretch down into town: houses, woodpiles and skiffs, gray water and gulls. You park by the community hall.'),
          south: road('luck_lake', 'South along the creek, then up into the hills. At the north end of Luck Lake, you turn down the spur to the beach and park.')
        },
        fish: 'Coho fry are flicking in the shallows along the road. The sow is fishing. The cub is supervising. You, sadly, are only watching.'
      },

      luck_lake: {
        map: { x: 4, y: -1, label: ['Luck Lake'] },
        name: 'Luck Lake',
        aliases: ['luck lake', 'luck'],
        desc: "A gravel spur leads down to the Luck Lake day-use area at the north end of the lake: a rock beach, a covered picnic shelter and an outhouse with a crescent moon on the door. Eagle Creek comes in right beside the beach. The lake stretches away to the south, long and narrow and dark, with the clouds sitting right down on the hills on either side. A loon calls from somewhere out on the water. The road runs north toward Coffman Cove and south toward the Thorne River trailhead.",
        exits: {
          south: road('trailhead', 'Back up the spur and south down the hill to the Thorne River trailhead.'),
          north: road('dog_creek', 'North on NF-3030. A doe and twin fawns stand in the ditch and watch you pass with no particular concern. The road tips downhill and picks up Dog Creek, running right alongside it toward town. You pull over where the creek bends close to the road.')
        },
        fish: "Cutthroat are rising off the mouth of Eagle Creek, one after another, like they know. You do not have a rod. This should be illegal."
      },

      sweetwater_turnoff: {
        map: { x: 3, y: -3, label: ['Sweetwater', 'Turnoff'] },
        name: 'Sweetwater Turnoff',
        aliases: ['sweetwater turnoff', 'turnoff', 'junction', 'coffman creek'],
        desc: 'West of town, NF-3030 crosses Coffman Creek where it spills out into the lagoon behind Coffman Cove, then climbs into the trees. Just past the creek, a brown Forest Service sign points down a muddy spur to the south: SWEETWATER LAKE. The road runs back east into town.',
        exits: {
          east: road('coffman_cove', 'Back east across Coffman Creek and into town. You park by the community hall.'),
          south: road('sweetwater_landing', 'The spur is one lane of mud and potholes, with alder brushing both sides of the truck. Fresh tire tracks run ahead of you the whole way. It dead-ends in a muddy turnaround in the trees, and you park next to the tracks.')
        }
      },

      sweetwater_landing: {
        map: { x: 3, y: -2, label: ['Sweetwater', 'Landing'] },
        name: 'Sweetwater Lake Landing',
        aliases: ['sweetwater landing', 'landing', 'sweetwater', 'boat landing'],
        desc: "The spur ends in a muddy turnaround. A short trail, maybe two hundred feet of roots and puddles, drops through the trees to a gravel landing on Sweetwater Lake. A Forest Service skiff lies upside down on the bank. Across a half mile of still water to the west, smoke rises from the stovepipe of a small log cabin. The spur leads back north to the road.",
        exits: {
          north: road('sweetwater_turnoff', 'You climb back up the trail, turn the truck around in the mud on the fourth try, and bounce back up the spur to NF-3030.'),
          west: {
            to: 'sweetwater_lake',
            guard: (g) => {
              if (!g.inInv('oars')) {
                return "You could flip the skiff, but somebody has taken the oars. Paddling half a mile of October lake with your hands is a good way to end up in Joe Kitka's next incident report.";
              }
              g.print('You flip the skiff, drag it into the shallows, drop the oars into the oarlocks and push off. The lake is black and glassy, and every stroke sounds enormous.', 'travel');
              return null;
            }
          }
        },
        row: (g) => { g.go('west'); return true; }
      },

      sweetwater_lake: {
        map: { x: 2, y: -2, label: ['Sweetwater', 'Lake'] },
        name: 'Sweetwater Lake',
        aliases: ['sweetwater lake', 'middle of the lake'],
        desc: "You're in the Forest Service skiff out on Sweetwater Lake, oars dripping. The water is dark as coffee and so still that the clouds float in it upside down. Back to the east is the landing. Ahead to the west, a small cedar log cabin sits above a little float, smoke curling from its stovepipe.",
        exits: {
          east: { to: 'sweetwater_landing', guard: (g) => { g.print('You row back to the landing and drag the skiff up onto the gravel.', 'travel'); return null; } },
          west: { to: 'sweetwater_cabin', guard: (g) => { g.print("You row the last stretch and bump up against the cabin's little float. You tie off, climb out and walk up to the door.", 'travel'); return null; } }
        },
        row: () => 'Which way? Row WEST to the cabin or EAST back to the landing.',
        noExit: 'The lake is big, but the cabin is west and the landing is east.',
        fish: 'A trout rises ten feet from the boat. Then another. No rod. Life is cruel and specific.'
      },

      sweetwater_cabin: {
        map: { x: 1, y: -2, label: ['Sweetwater', 'Cabin'] },
        name: 'Sweetwater Lake Cabin',
        aliases: ['sweetwater cabin', 'sweetwater lake cabin'],
        desc: (g) => "A twelve-by-fourteen cabin of pre-cut cedar logs above the lake, with wooden bunks, a table and benches, and a woodstove ticking with heat. Somebody has moved in for the long haul: a sleeping bag on the lower bunk, groceries stacked under the table and paperbacks on the windowsill. A pair of oars leans by the door. " +
          (g.itemAt('winston', 'sweetwater_cabin') ? 'In the corner, leaning in a place of honor, is a bamboo fly rod. ' : '') +
          'The float and the skiff are back down to the east.',
        exits: {
          east: { to: 'sweetwater_lake', guard: (g) => { g.print('You climb back into the skiff and push off from the float.', 'travel'); return null; } },
          out: { to: 'sweetwater_lake', guard: (g) => { g.print('You climb back into the skiff and push off from the float.', 'travel'); return null; } }
        },
        row: (g) => { g.go('east'); return true; },
        onEnter: (g) => { g.clue('found_dale'); }
      },

      coffman_cove: {
        map: { x: 4, y: -3, label: ['Coffman', 'Cove'] },
        name: 'Coffman Cove',
        aliases: ['coffman cove', 'coffman'],
        desc: "The road ends where the trees give up and Clarence Strait begins. Coffman Cove started out as a logging camp and has never quite stopped looking like one: houses and trailers scattered along the cove, woodpiles under blue tarps, a school, a community hall, and more skiffs parked in yards than trucks. Dog Creek runs out through the middle of town into the cove. The general store is down by the water to the north, and the harbor is down the hill to the east. NF-3030 heads west out of town toward Sweetwater Lake, and back south along Dog Creek.",
        exits: {
          south: road('dog_creek', 'You head south out of town along Dog Creek and pull over where the road runs right beside the water.'),
          west: road('sweetwater_turnoff', 'You head west out of town on NF-3030, across Coffman Creek where it runs into the lagoon, and pull over at a brown Forest Service sign.'),
          north: 'cove_store',
          east: 'cove_harbor'
        }
      },

      cove_store: {
        map: { x: 4, y: -4, label: ['General', 'Store'] },
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
        map: { x: 5, y: -3, label: ['Cove', 'Harbor'] },
        name: 'Coffman Cove Harbor',
        aliases: ['cove harbor', 'coffman harbor', 'coffman cove harbor', 'boat harbor'],
        desc: "A small boat harbor tucked behind a rock breakwater: a few dozen slips of skiffs and crabbers, and one old seiner that hasn't left the dock in a decade. Up the shore is the old ferry ramp where the inter-island ferry used to come in, now just a concrete apron and a gull convention. Beyond the breakwater, Clarence Strait runs gray all the way to the mountains on the far side. A black lab trots along the floats like he's the harbormaster. The road climbs back west into town.",
        exits: { west: 'coffman_cove' },
        fish: "A kid on the old ferry ramp hauls in a pink salmon and holds it up for you to see. You give him a thumbs up. You are jealous of a twelve-year-old."
      },

      klawock: {
        map: { x: 1, y: 2, label: ['Klawock'] },
        name: 'Klawock',
        aliases: ['klawock', 'town'],
        desc: "The highway comes down out of the hills into Klawock, a small town on a wide inlet where woodsmoke mixes with the smell of low tide. Klawock is one of the oldest communities on the island. Up the hill to the north stand the carved poles of the totem park. The Alaska State Troopers post is a low building to the west. The highway runs east back toward Hollis and south to Craig.",
        exits: {
          east: road('hwy', 'You head east out of Klawock and back into the hills. Twenty minutes of curves and muskeg later, you pull over at the Harris River bridge.'),
          north: 'totem_park',
          west: 'trooper',
          south: road('craig', 'South along the water. Bald eagles sit on the light poles like they are waiting for a bus. Seven miles later, the road drops down into Craig and you park on Front Street.')
        }
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
        exits: {
          north: road('klawock', 'North out of Craig with the water on your left and the hills on your right. Fifteen minutes later you coast into Klawock.'),
          west: 'harbor',
          east: 'tavern',
          south: road('lodge_road', 'You turn south onto the gravel shore road, spray flying from the potholes. At the end, a carved sign swings in the wind: HARBOR LIGHT LODGE. You park on the shoulder.')
        }
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
        exits: {
          north: road('craig', 'You head back north along the shore and into Craig, parking on Front Street between a crab-pot trailer and a truck with a bumper sticker that says MY OTHER CAR IS A SKIFF.'),
          south: 'lodge'
        }
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
        names: ['truck', 'pickup', 'rental', 'rental truck', 'pickup truck', 'car', 'vehicle', 'truck door', 'tailgate'],
        roomDesc: (g) => (g.state.loc === 'ferry' && !g.flag('truck_unlocked')
          ? 'Your rental pickup sits in the gravel lot, beaded with rain.'
          : 'Your rental pickup is parked here, ticking as it cools.'),
        desc: (g) => "A white pickup with a cracked windshield, mud up to the door handles and 140,000 miles of island gravel on it. A faded ISLAND AUTO RENTAL sticker is peeling off the tailgate. " +
          (g.flag('truck_unlocked') ? "It's unlocked. GET IN to drive." : 'The doors are locked. Through the window you can see a glovebox and a salmon-shaped air freshener.'),
        fixedMsg: "It's a truck. You drive it, you don't carry it.",
        verbs: {
          enter: (g) => { g.go('in'); return true; },
          open: (g) => { g.go('in'); return true; },
          unlock: (g) => {
            if (g.flag('truck_unlocked')) return "It's already unlocked.";
            if (!hasKeys(g)) return "You'll need the keys. Rental companies are trusting, but not that trusting.";
            g.flag('truck_unlocked', true);
            return 'You thumb the fob. The locks clunk open and the lights blink.';
          },
          turnon: (g) => (g.state.loc === 'truck_cab'
            ? "The engine turns over, coughs and settles into a rattle. Where to? (Try DRIVE WEST, or DRIVE TO a place you've been.)"
            : 'Get in first.'),
          push: 'You give the tire a kick. Solid. The tire, not your foot.',
          knock: 'You knock on the door. Nobody is home. You are the person who would be home.',
          touch: 'Wet. Cold. Mud.'
        }
      },
      truck_keys: {
        name: 'truck keys', short: 'a set of truck keys', loc: 'lockbox',
        names: ['keys', 'truck keys', 'truck key', 'key fob', 'fob', 'car keys', 'car key', 'rental keys'],
        desc: 'A Ford key on a plastic ISLAND AUTO RENTAL fob, plus a bottle opener shaped like a halibut. Island priorities.',
        verbs: { use: (g) => g.doVerb('unlock', 'truck') }
      },
      lockbox: {
        name: 'lockbox', short: 'a lockbox', loc: 'ferry', fixed: true,
        names: ['lockbox', 'lock box', 'key box', 'keybox', 'keypad', 'gray box', 'box'],
        container: true, openable: true, open: false, locked: true,
        desc: (g) => 'A gray steel lockbox screwed to the terminal wall, with ISLAND AUTO RENTAL stenciled on it and a four-digit keypad on the front. ' + (g.itemState('lockbox').open ? 'Its little door is open.' : "It's shut tight."),
        lockedMsg: "It's locked. There's a four-digit keypad on the front. (Type ENTER and the code, like ENTER 1234.)",
        verbs: {
          unlock: () => 'It has a keypad, not a keyhole. (Type ENTER and the code.)',
          push: 'You press a few keys at random. The keypad beeps unhappily.'
        }
      },
      glovebox: {
        name: 'glovebox', short: 'a glovebox', loc: 'truck_cab', fixed: true,
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
        verbs: { use: (g) => (g.state.loc === 'sweetwater_landing' ? (g.go('west'), true) : "There's nothing here to row.") }
      },
      fs_skiff: {
        name: 'Forest Service skiff', loc: 'sweetwater_landing', fixed: true,
        names: ['skiff', 'forest service skiff', 'boat', 'oarlocks', 'chain', 'padlock'],
        desc: (g) => 'A 14-foot aluminum Forest Service skiff, upside down on two logs and chained to a tree with an open padlock. A sign screwed to the transom: USDA FOREST SERVICE — PFDs NOT PROVIDED. The oarlocks are there. ' + (g.inInv('oars') ? "The oars weren't, but you brought Hazel's." : 'The oars are not.'),
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
          { k: ['suit', 'survival', 'immersion'], r: "'Survival suit? Not for crab pots in Bucareli Bay. Not in October on a flat calm. That's what you'd wear to swim.' He looks at you over his mug. 'Why do you ask?'" },
          { k: ['tide', 'tides', 'slack'], r: "'High tide 9:42 that night. Slack around ten. Not that it matters to a man in a boat.'" },
          { k: ['mug', 'grandpa'], r: "'Grandkids gave it to me. Okayest. I'll take it.'" },
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
          { k: ['coffman', 'cove', 'hazel', 'sweetwater', 'north'], r: "'Hazel at the store in Coffman Cove knows everything that happens north of the Thorne. Up past Luck Lake, where the road follows Dog Creek into town.'" },
          { k: ['totem', 'totems', 'pole', 'poles', 'carving', 'log', 'cedar', 'raven'], r: "'This one's for the school. Raven. It'll take me most of a year if I do it right, and I do it right.'" },
          { k: ['island', 'prince of wales', 'klawock'], r: "'People have lived here a very long time. Everything on this island remembers things. People forget that.'" }
        ],
        askDefault: "Walt keeps carving. 'Can't help you there.'",
        show: {
          topo_map: "Walt taps the pencil circle. 'That's the cabin. Like I said.'",
          photo: "'Thorne River steelhead. Dale always did love that river.'"
        }
      },

      hazel: {
        name: 'Hazel', loc: 'cove_store',
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
          return "'Sweetwater's west of town on 3030, then down the spur at the sign. Short trail to the lake,' Hazel says. 'Row west. Bring my oars back.'";
        },
        topics: [
          { k: ['rick', 'sorensen'], r: "'Buys for two, pays cash, tips like a man who wants you to remember he was friendly. I remember.'" },
          { k: ['dale', 'haugen'], r: "'Dale set chokers for the camp up here when he was young. Married Marnie on the beach at Luck Lake. Rained like the end of the world. Best wedding I ever went to.'" },
          { k: ['marnie'], r: "'Marnie cooked for the logging crews up here. Best bread on the north end. Still is, I hear, down in Craig.'" },
          { k: ['sweetwater', 'cabin', 'lake', 'skiff', 'boat'], r: "'West out of town on 3030, past Coffman Creek, then down the spur at the Sweetwater sign. Two hundred feet of trail to the lake. The Forest Service leaves a skiff there. Usually with oars.'" },
          { k: ['eagle'], r: "'Eagle Creek comes into Luck Lake right by the beach. Best cutthroat fishing on the north end, and I didn't tell you that.'" },
          { k: ['oars', 'oar'], r: (g) => g.inInv('oars') ? "'You've got my good ones. Bring them back.'" : "'Talk to me first, then we'll see about oars.'" },
          { k: ['coffman', 'cove', 'town', 'camp', 'logging'], r: "'Used to be a logging camp. Now it's a town that still thinks it's a logging camp. Best place on the island, if you like rain and minding your own business.'" },
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
          rick_note: "Hazel reads it twice. 'Burn this.' She snorts. 'Nobody on this island has ever burned anything they were told to.'"
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
          { k: ['search', 'coast guard'], r: "'Helicopter out of Sitka flew it for two days. Nothing. Not a boot, not a hat.'" },
          { k: ['sweetwater', 'coffman', 'luck', 'hazel'], r: "'Sweetwater Lake? West of Coffman Cove on 3030. Forest Service cabin out there. Nobody goes there in October.' She looks at you a beat longer. 'Why?'" }
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
        names: ['dale', 'dale haugen', 'haugen', 'man', 'bill', 'stranger'],
        here: "A man with a week of gray stubble sits at the plank table, a cup of coffee halfway to his mouth. He looks exactly like the photo in your case file, minus the drowning.",
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

    function endingBest(g) {
      return [
        "Reyes listens to all of it: the flat calm, the pulled plug, the unworn kill switch, the empty slot on the rod rack, the napkin, the propane, the empty cabin on the Thorne and, finally, the cabin on Sweetwater Lake. When you finish, she's quiet for a moment. Then she picks up the phone.",
        "By dark, Dale Haugen is sitting in the holding cell, sheepish and very much alive. He keeps his word and tells it straight. Rick Sorensen is picked up at the Klawock airstrip trying to catch the morning floatplane to Ketchikan, with a duffel bag and a story that falls apart in about four minutes.",
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
        'schedule, ferry schedule, sign, notice': { desc: 'A ferry schedule in a scratched plastic case.', text: 'INTER-ISLAND FERRY — HOLLIS / KETCHIKAN\nDaily departures 8:00 AM and 3:30 PM, weather permitting.\n(Someone has added in pen: "it usually doesn\'t")' }
      },
      hwy: {
        'bridge, concrete bridge, railing, guardrail': "A plain concrete bridge with a rusting guardrail. Someone has written CATCH & RELEASE YOUR EGO on it in paint marker. It's good advice.",
        'muskeg, bog, shore pines, pines': "Open muskeg: spongy, wet and dotted with stunted shore pines, all bonsai'd by the wind. Step in the wrong spot and you'll lose a boot.",
        'clearcuts, clearcut, alder, alders, stumps, second growth, forest, trees': 'Old clearcuts from the big logging days, the stumps gone silver, the hillsides grown back thick with alder and young spruce.',
        'thorne bay sign, sign, green sign': 'A green highway sign, THORNE BAY 34, with an arrow pointing north. Riddled with what you hope is birdshot.',
        'gravel road, thorne bay road': 'The Thorne Bay road, gravel, heading north into the hills.',
        'highway, road, pavement, two-lane': 'Two lanes, no shoulder, no traffic. A pickup passes and the driver waves. You wave back. That is the whole social scene.'
      },
      thorne_road: {
        'spur roads, spur, spurs, gates, gate': 'Old logging spurs climb into the hills, most of them behind steel gates hung with signs: ROAD CLOSED. One gate has a bullet hole through the O.',
        'potholes, pothole, gravel, road, washboard': 'Gravel, potholes and washboard. Your fillings rattle just looking at it.',
        'logging country, hills, hillside, hillsides': 'Hills of second-growth and old clearcuts, a patchwork of greens going gray in the rain.'
      },
      trailhead: {
        'road, gravel road, north': 'The gravel keeps going north past the pullout, toward Luck Lake, the Sweetwater turnoff and, eventually, Coffman Cove.',
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
        'rooftops, town, cove': 'Through the trees ahead: rooftops, woodsmoke and the gray water of the cove where Dog Creek runs out.',
        'bears, bear, sow, cub, black bear, black bears': { desc: 'A glossy black bear sow, fat for winter, pinning a salmon in the shallows while her cub splashes after the leftovers. She looks up once, decides you are not interesting, and goes back to work.', touch: 'No. Absolutely not. Not even a little.' },
        'bank, trampled bank': "Mud packed flat by paws, salmon skins and one very clear message: this is somebody else's kitchen.",
        'tracks, tire tracks, road, gravel road, nf-3030': 'NF-3030, gravel, running beside the creek. Fresh tire tracks head north toward town and the store. Wide tires, aggressive tread. The same tracks as at the Thorne trailhead.'
      },
      luck_lake: {
        'lake, luck lake, water, drop-off, drop off': 'Long, narrow, deep and still, stretching away south between the hills. Cutthroat dimple the surface along the drop-off. Locals swear there is a thirty-inch Dolly Varden in here somewhere.',
        'eagle creek, creek, mouth': 'Eagle Creek slides into the lake right beside the beach, clear over gravel, with a fan of sand at its mouth. Every cutthroat in the lake knows where the food comes from.',
        'rock beach, beach, rocks, stones, stone': { desc: 'Flat gray stones, perfect for skipping.', take: 'You pick out a flat stone and skip it across the lake. Six skips. You have a feeling somebody around here could do seven.' },
        'picnic shelter, shelter, picnic table, table, bench, carving, initials, heart': { desc: 'A covered picnic shelter with a heavy plank table, carved over the years with initials. One set is old and deep, inside a crooked heart: D.H. + M.H. 1979.', sit: 'You sit at the picnic table under the shelter. Rain ticks on the roof. Somebody carved D.H. + M.H. 1979 into the plank next to your hand.' },
        'outhouse, crescent moon, door': { desc: 'A Forest Service outhouse with a crescent moon cut in the door. Surprisingly clean, for an outhouse.', open: 'You open the door. Somebody has left a 1997 issue of Field & Stream in there. You close the door and leave the magazine for the next guy.', enter: 'You have a case to solve. You can hold it.' },
        'loon, common loon': { desc: 'A common loon, checkerboard black and white, riding low out in the middle of the lake. It lets out that long, wavering call that makes the whole lake sound lonely.', listen: 'That call. It goes right through you.' },
        'hills, clouds': 'The clouds sit right down on the hills around the lake. Somewhere up there it is already snowing.'
      },
      sweetwater_turnoff: {
        'sign, forest service sign, brown sign, arrow': { desc: 'A brown Forest Service sign with a white arrow pointing south down the spur.', text: 'SWEETWATER LAKE ↓\nPUBLIC USE CABIN\nBoat at end of trail. PFDs NOT PROVIDED.' },
        'spur, mud, tracks, tire tracks': "Fresh tire tracks turn off NF-3030 here and head south down the spur. Wide tires, aggressive tread. You're starting to know this tread personally.",
        'road, nf-3030, main road': 'NF-3030: gravel, potholes and the occasional deer, heading back east into town.',
        'coffman creek, creek, lagoon': 'Coffman Creek, tea-dark, sliding under the road and out into the lagoon behind town. At the creek mouth, a great blue heron stands perfectly still, pretending to be a stick.',
        'heron, great blue heron': 'A great blue heron in the shallows at the creek mouth. It has been standing there since before you arrived, and it will be standing there after you leave.'
      },
      sweetwater_landing: {
        'trail, roots, puddles, path': 'Two hundred feet of roots, puddles and slick spruce needles from the turnaround down to the water. The Forest Service calls it a trail. Your ankles call it something else.',
        'lake, sweetwater lake, water': 'Still, dark water, a half mile across, with low green hills all around and the clouds hanging close. It looks like a place nobody would ever find you. That is the idea.',
        'cabin, smoke, stovepipe, far shore, chimney': "A small log cabin on the far shore, with a float out front and smoke curling from the stovepipe. Somebody's home.",
        'turnaround, truck tracks, tracks': 'Two sets of tire tracks in the mud: yours, and the wide, aggressive tread you have been following across the island.',
        'spur': 'The muddy spur climbs back north to NF-3030.',
        'logs, tree': 'Two logs the skiff rests on, and a spruce it is chained to. The padlock hangs open.'
      },
      sweetwater_lake: {
        'water, lake, reflection, clouds': { desc: 'Dark as coffee, and so still the clouds float in it upside down.', touch: 'You trail a hand in the lake. It is cold enough to ache. You think about Dale swimming half a mile of salt water in October and feel a strange, grudging respect.' },
        'cabin, float, smoke': 'Closer now: a cedar log cabin with a little float out front and smoke from the stovepipe. A shape moves past the window.',
        'landing, shore': 'The landing is back to the east, your truck hidden in the trees above it.',
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
        'forest service oars, door, oars by the door': "A pair of oars stenciled USDA FOREST SERVICE, leaning by the door. So that's where they went.",
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
        'road, gravel road, nf-3030': 'NF-3030: south along Dog Creek toward Luck Lake, or west out of town toward Sweetwater Lake.',
        'lagoon': 'The lagoon behind town, west of the main road, where Coffman Creek runs in. Calm, shallow and full of birds.',
        'dog creek, creek, mouth, creek mouth': 'Dog Creek runs out right through the middle of town and fans across the gravel into the cove. At low tide the gulls stand in the riffle like they are waiting for a delivery. In the fall, they get one.'
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
        'strait, clarence strait, water, mountains': 'Clarence Strait, gray and wide, with snow on the mountains on the far side. On a clear day you can see forever. This is not a clear day.',
        'black lab, lab, dog': { desc: 'A black lab in a red bandana, trotting the floats with the air of a dog who meets every boat. He sniffs your hand, approves of the truck smell, and goes back to work.', touch: 'He leans his whole weight into your leg and closes his eyes. You have made a friend for life, or at least until the next boat comes in.' },
        'gulls, gull': 'Gulls on the breakwater, the ramp, the pilings and the seiner. Coffman Cove has a lot of gulls, and they all have opinions.'
      },
      klawock: {
        'inlet, klawock inlet, water, tide flats, mudflats': 'A wide, sheltered inlet. At low tide the mudflats shine and herons stalk the edges like they own the place.',
        'town, houses, house': 'Houses painted bright against the gray, smoke curling from woodstove pipes and skiffs parked in the front yards. A big dog is asleep in the middle of a side street, confident nobody is in a hurry.',
        'dog, mutt, yellow dog': { desc: 'A big yellow mutt asleep in the road. It opens one eye at you, then closes it. You have been evaluated.', touch: 'The dog thumps its tail twice without waking up. A high honor.' },
        'troopers post, post, low building': 'A low building with an Alaska State Troopers shield on the sign out front and two blue-and-gold cruisers parked a little crooked.',
        'totem park, hill': 'The carved poles stand along the hillside to the north, facing the water.',
        'woodsmoke, smoke, stovepipes': 'Woodsmoke from a dozen stovepipes, hanging low over the town in the wet air.',
        'school, hoop, basketball hoop': 'The school, with an outdoor basketball hoop that has clearly survived a lot of rain-delayed games.'
      },
      totem_park: {
        'shed, carving shed': 'An open-sided shed full of cedar chips, with adzes and knives hung neatly along the back wall in order of size.',
        'adze, adzes, tools, knives, knife': { desc: 'Hand-forged blades, the handles worn dark and smooth from years of use.', take: 'Walt looks at you without saying a word. You put your hands in your pockets.' },
        'chips, cedar chips, shavings, curls': { desc: 'Curls of red cedar, fragrant as the inside of a hope chest.', smell: 'Cedar. You could stand here all day.', take: 'You pocket a curl of cedar for luck. Walt pretends not to notice.' },
        'view, town, inlet, water': 'From up here you can see the whole inlet, the town, and the hills fading off into the rain.',
        'path, hillside, park': 'A gravel path winds between the poles down the hill to town.',
        'sawhorses, sawhorse': 'Heavy, paint-spattered sawhorses. They have held up a lot of history.'
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
        'bars, bar': 'Three bars for a town this size. The Riptide, east of here, is the one with its sign lit.',
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
        'lodge sign, sign, carved sign': 'A carved wooden sign: HARBOR LIGHT LODGE, GUIDED FISHING, EST. 1984. Under it are two empty screw holes, as if another sign hung there and was taken down.',
        'slug, slugs, banana slug': { desc: 'A banana slug the length of a hot dog, going nowhere slowly. Relatable.', touch: 'Slime. Lots of it. Why did you do that?' }
      },
      lodge: {
        'couches, couch, sofa, leather couches': { desc: 'Leather couches gone soft and shiny with use. The kind you sink into and lose a whole afternoon.', sit: 'You sink into a couch. It is dangerously comfortable. Rick shifts in his chair and watches you.' },
        'guestbook, guest book, book, stand': { desc: 'A leather guestbook on a stand by the door.', text: 'Forty years of guests. "Best trip of my life!" — the Hendersons, Ohio. "Dale is a FISH WHISPERER." "Came for the kings, stayed for Marnie\'s bread."\nThe entries thin out over the last few years. The last one is from August. Nobody has signed since.' },
        'photos, pictures, wall photos, guests': 'Framed photos line the wall: grinning guests holding up kings, silvers and halibut, with Dale in the background of most of them, sunburned and pleased. The newest ones are a few years old.',
        'mantel': 'River rock and a cedar beam. The king salmon presides.',
        'chair, armchair': "Rick's in it.",
        'windows, window': 'Big windows facing across the water to Fish Egg Island.',
        'room, timber frame, beams, timber, ceiling': 'Big hand-hewn timbers overhead, dark with years of woodsmoke. Dale built this room himself, the plaque by the fireplace says, in 1984.',
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
      luck_lake: { listen: 'The loon, long and wavering, from out in the middle of the lake. Eagle Creek chattering into the lake beside the beach. Rain on the shelter roof.', smell: 'Cold lake water and wet cedar.', sit: 'You sit at the picnic table under the shelter. Rain ticks on the roof. Somebody carved D.H. + M.H. 1979 into the plank next to your hand.' },
      sweetwater_turnoff: { listen: 'Coffman Creek under the road. Rain in the alders. Far off, a logging truck downshifting on a hill.', smell: 'Mud, wet alder and the tide flats in the lagoon.' },
      sweetwater_landing: { listen: 'Water lapping at the gravel. Across the lake, very faintly, someone splitting wood.', smell: 'Lake water and, from the far shore, woodsmoke.' },
      sweetwater_lake: { listen: 'Oar drips. Your own breathing. Somewhere far off, a loon.', smell: 'Clean cold water and woodsmoke.', sit: "You're already sitting, in a small aluminum boat, in the middle of a lake. Life comes at you fast." },
      sweetwater_cabin: { listen: 'The woodstove ticking. The kettle starting to sing. Dale breathing like a man trying very hard to seem relaxed.', smell: 'Woodsmoke, coffee and wool socks.' },
      coffman_cove: { listen: 'Gulls, a chainsaw somewhere up the hill, and a screen door slapping shut.', smell: 'Woodsmoke, salt water and somebody frying bacon.' },
      cove_store: { listen: "The woodstove ticking. Hazel's pencil scratching. A radio playing the swap show out of Ketchikan.", smell: 'Woodsmoke, coffee, bait and new rubber boots.', sit: "You sit on the bench by the woodstove. Hazel looks at you over her glasses. 'Take your time.' It's the nicest thing anyone has said to you all week." },
      cove_harbor: { listen: "Halyards, gulls, and the lab's tags jingling as he trots the floats.", smell: 'Salt, diesel and crab bait.' },
      klawock: { listen: 'Ravens arguing over a dumpster. A skiff outboard droning out on the inlet.', smell: 'Woodsmoke and low tide.' },
      totem_park: { listen: 'The adze biting cedar, steady as a heartbeat.', smell: 'Fresh-cut cedar.', sit: 'You sit on the low wall at the edge of the park and look out over the inlet. The poles look out with you. It is very peaceful.' },
      trooper: { listen: "Fluorescent hum. A police scanner muttering about a deer on the Hydaburg road.", smell: 'Burnt coffee and floor wax.' },
      craig: { listen: "Gulls, a forklift beeping at the cannery, and somebody's truck stereo playing country.", smell: 'Fish, diesel, and frying oil from somewhere.' },
      harbor: { listen: 'Halyards slapping masts. Gulls. A bilge pump kicking on and off.', smell: 'Salt, fish and two-stroke exhaust.' },
      harbormaster: { listen: "The VHF: '...Craig harbor, this is the Marlene, coming in with a bent prop and a bad attitude, over.'", smell: 'Coffee and wet rain gear.' },
      fuel_dock: { listen: "The fuel pump ticking. Something tinny playing on Kenzie's phone.", smell: 'Gasoline and herring.' },
      tavern: { listen: 'Johnny Cash, low. Ice rattling. Cal sighing at his empty bottle.', smell: 'Fryer oil, beer and wet wool.' },
      lodge_road: { listen: 'Waves on the rocks. A raven doing an impression of a car alarm.', smell: 'Kelp and salt.' },
      lodge: { listen: 'The fire popping. Rick clearing his throat a lot.', smell: 'Woodsmoke, leather and old fish stories.' },
      kitchen: { listen: 'The cooler humming. Dough slapping the counter.', smell: 'Fresh bread and coffee. For a second you forget why you are here.' },
      office: { listen: 'Rain on the window. The house settling.', smell: 'Pipe tobacco and old paper.' },
      boathouse: { listen: 'Water slapping the pilings. The whole building creaking like a ship.', smell: 'Two-stroke oil, seaweed and wet rope.' }
    };

    for (const [id, sc] of Object.entries(SCENERY)) rooms[id].scenery = Object.assign({}, rooms[id].scenery, sc);
    for (const id of OUTDOOR_ROOMS) rooms[id].scenery = Object.assign({}, OUTDOOR, rooms[id].scenery);
    for (const [id, se] of Object.entries(SENSES)) Object.assign(rooms[id], se);

    // ------------------------------------------------------------- the map
    // Room positions live on each room (map: { x, y, label }) in grid units:
    // x grows east, y grows south, one step per exit. This is the scenery
    // drawn underneath them, in the same units.
    const mapGeo = {
      view: { x0: -2.2, y0: -4.9, x1: 8.7, y1: 8.1 },
      // Prince of Wales Island is huge; this is the middle of it, so the
      // outline runs off the top and bottom of the sheet.
      coast: [
        [-0.7, -5.6], [1.5, -5.4], [2.6, -4.8], [3.5, -4.6], [4.5, -4.5], [5.6, -3.65], [6.6, -2.85],
        [7.6, -2.35], [8.1, -1.7], [8.0, -1.2], [7.85, -0.4], [8.0, 0.5],
        [7.5, 1.2], [6.8, 1.7], [6.75, 2.4], [7.2, 3.0], [7.6, 4.0], [7.3, 5.0],
        [7.7, 6.0], [7.4, 7.0], [7.7, 8.0], [7.4, 9.2], [3.5, 9.6], [-0.4, 9.2],
        [-0.65, 8.0], [-0.45, 7.2], [-0.6, 6.4], [-0.55, 5.2], [-0.55, 4.4], [-0.55, 3.6],
        [-0.85, 3.0], [-0.7, 2.4], [-0.9, 1.6], [-0.5, 0.8], [-0.6, 0.0], [-0.3, -0.8],
        [-0.55, -1.8], [-0.4, -2.9], [-0.75, -4.0], [-0.6, -5.2]
      ],
      lakes: [
        { x: 4.78, y: -0.92, rx: 0.17, ry: 0.42, rotate: 18, label: 'Luck L.', lx: 5.25, ly: -0.82 },
        { x: 2.0, y: -2.05, rx: 0.78, ry: 0.45, rotate: 0, label: 'Sweetwater L.', lx: 2.0, ly: -1.42 }
      ],
      islets: [
        { x: -1.35, y: 5.55, rx: 0.32, ry: 0.28, label: 'Fish Egg I.' }
      ],
      rivers: [
        { label: 'Thorne R.', lx: 5.55, ly: 1.05, pts: [[5.3, 1.6], [5.9, 1.25], [6.4, 0.6], [6.5, 0.0], [6.75, -0.5], [7.3, -0.6], [7.95, -0.55]] },
        { label: 'Dog Cr.', lx: 4.85, ly: -2.45, pts: [[4.6, -1.55], [4.5, -2.1], [4.5, -2.7], [4.52, -3.6], [4.48, -4.5]] },
        { label: 'Eagle Cr.', lx: 5.6, ly: -1.5, pts: [[5.7, -1.85], [5.2, -1.55], [4.85, -1.35]] },
        { label: 'Harris R.', lx: 5.6, ly: 3.75, pts: [[4.8, 1.35], [4.6, 2.0], [4.75, 2.7], [5.4, 3.25], [6.3, 3.5], [7.25, 3.2]] }
      ],
      labels: [
        { text: 'PRINCE OF WALES ISLAND', x: 5.0, y: 5.95, size: 30, rotate: -8, cls: 'island' },
        { text: 'CLARENCE STRAIT', x: 8.25, y: 4.6, size: 18, rotate: 90, cls: 'water' },
        { text: 'BUCARELI BAY', x: -1.75, y: 2.4, size: 18, rotate: -90, cls: 'water' },
        { text: 'Thorne Bay', x: 8.3, y: -0.2, size: 14, rotate: 90, cls: 'water' },
        { text: 'Coffman Cove', x: 5.5, y: -4.35, size: 14, rotate: -38, cls: 'water' }
      ]
    };

    // ---------------------------------------------------------------- hints
    function hint(g) {
      const st = g.state;
      if (!st.flags.read_case_file) return 'Start by reading your case file: READ FILE.';
      if (!hasKeys(g)) return "Your truck keys are in the Island Auto lockbox on the terminal wall at the Hollis ferry. The code is the last four digits of your claim number (it's on the case file). Try ENTER and the code.";
      if (!g.has('calm_night')) return "The harbormaster in Craig found the skiff. Drive west, west, then south to Craig, then walk west to the harbor and north to his office. TALK TO JOE, then read what he gives you or ASK JOE ABOUT WEATHER.";
      if (!g.flag('got_key')) return 'Visit the Harbor Light Lodge, south of Craig. Talk to Marnie in the kitchen.';
      if (!g.has('lanyard')) return 'The Kittiwake is in the lodge boathouse, south of the great room. Examine the skiff.';
      if (!g.has('rod_missing')) return 'Take a careful look at the rod rack in the lodge great room.';
      if (!g.has('photo')) return "Something on Dale's desk might be more than decoration. Try READ PHOTO.";
      if (g.itemState('safe').locked) return "The back of the photo has three numbers on it, and the safe has a three-number dial. Try DIAL followed by those numbers.";
      if (!g.has('napkin') || !g.has('foreclosure')) return 'Read everything in the safe.';
      if (!g.has('topo_map')) return "Open the desk drawer in Dale's office and read what you find.";
      if (!g.has('receipt')) return 'The fuel dock is west of the Craig harbor. Ask the attendant about Rick, and search the trash barrel.';
      if (!g.isOwned('waders')) return 'Cal at the Riptide Tavern (east of Front Street in Craig) knows the rivers. He looks thirsty. BUY BEER, then GIVE BEER TO CAL.';
      if (!g.isOwned('flashlight')) return 'Check the glovebox of your rental truck. GET IN TRUCK, then OPEN GLOVEBOX.';
      if (!g.has('found_dale')) {
        if (!g.has('rick_note') && !g.flag('knows_sweetwater')) {
          if (!g.itemState('flashlight').on) return 'Turn on the flashlight before you head under the old growth: TURN ON FLASHLIGHT.';
          if (!g.isWorn('waders')) return 'You will need to WEAR WADERS to cross the Thorne.';
          if (g.state.loc === 'cabin') return 'Somebody left in a hurry. Read what they left on the table.';
          return 'The cabin on the topo map is on the Thorne. From the highway, take Thorne Bay Road north to the trailhead, then go east along the trail and across the river.';
        }
        if (!g.inInv('oars')) return 'Rick took the oars from the Sweetwater skiff. Hazel at the general store in Coffman Cove (north past Luck Lake and down along Dog Creek, then north from the middle of town) might have another pair. TALK TO HAZEL.';
        return 'Take NF-3030 west out of Coffman Cove to the Sweetwater sign, go down the spur to the landing, and ROW WEST across the lake to the cabin.';
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
      // "in" from wherever your truck is parked.
      extraExits: (g, room) => {
        if (room.id === 'truck_cab' || truckLoc(g) !== room.id) return null;
        return {
          in: {
            to: 'truck_cab',
            guard: (gg) => {
              if (gg.flag('truck_unlocked')) return null;
              if (!hasKeys(gg)) return "The truck's locked. Rental companies are trusting, but not that trusting. The keys must be around here somewhere.";
              gg.flag('truck_unlocked', true);
              gg.print('(You thumb the key fob. The locks clunk open.)');
              return null;
            }
          }
        };
      },
      driveHelp: (g) => (g.state.loc === 'truck_cab'
        ? "The engine rattles. Where to? Try DRIVE WEST (or any direction the road goes), or DRIVE TO a place you've already been, like DRIVE TO CRAIG."
        : "Get in the truck first (GET IN TRUCK), or just say where: DRIVE WEST, or DRIVE TO a place you've been."),
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
