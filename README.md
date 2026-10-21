# No Safe Harbor

*A Prince of Wales Island Mystery*: a Zork-style text adventure that runs in your browser.

> Late October, Southeast Alaska. Dale Haugen, a lodge owner who's run boats for forty years,
> went out in his skiff on a flat-calm night and never came back. His business partner is now
> in line for a $1.5 million life insurance payout. You're the investigator Northbound Mutual
> sent to find out why.

## Play it

**Option 1: just open it.** Download the repo (green **Code** button → **Download ZIP**), unzip it, and
double-click `index.html`. No install, no server, no internet needed.

**Option 2: GitHub Pages.** In the repo, go to **Settings → Pages**, set **Source** to
"Deploy from a branch", pick the branch and `/ (root)`, and save. A minute later the game
is live at `https://<your-username>.github.io/nosafeharbor/`.

## How to play

Type commands in plain English:

| | |
|---|---|
| Move | `north` `south` `east` `west` (or `n` `s` `e` `w`), `up`, `down`, `in`, `out` |
| Look | `look`, `examine rack` (`x rack`), `read photo`, `search barrel` |
| Things | `take`, `drop`, `open`, `close`, `unlock`, `wear`, `remove`, `turn on`, `inventory` (`i`) |
| Senses | `listen`, `smell`, `touch moss`, `sit on couch`, `knock on door`, `play jukebox` |
| Driving | `get in truck`, `get out`, `drive west`, `drive to craig` (anywhere you've been) |
| People | `talk to marnie`, `ask joe about weather`, `show napkin to rick`, `give beer to cal` |
| The case | `notes` (your clue journal), `score`, `hint`, `accuse <name>` (at the trooper post) |
| Game | `map`, `save`, `load`, `restart` |

**Look at everything.** If a room description mentions it, you can examine it, and most
places have their own sounds and smells. Some small details only turn up if you go poking around.

**The map.** Type `map` or hit the **Map** button to unfold your field map: a true-scale map of
Prince of Wales Island on graph paper (one square = one kilometer), drawn from real USGS data with the
actual coastline, lakes, rivers and roads. Like mapping Zork on graph paper, your own pencil work goes on
top. Every place you've been gets a pin (towns list the spots inside them), the real road routes you've
driven are inked in, trails and rowing are dotted, unexplored roads trail off into a `?`, and a red
circle marks where you are. It opens framed around where you've been; drag to move, scroll (or + / −) to
zoom, **Fit** to re-center on your travels, **Whole island** to see it all. Keep typing with it open and it
fills in as you go. `Esc` folds it back up.

Chain commands with periods (`open glovebox. take flashlight`). Up/down arrows recall
earlier commands. The **Theme** button switches between amber and green.

## Map

The game follows the island's real roads:

```
                     Coffman Cove ── General Store (north), Cove Harbor (east)
                      │        └── Dog Creek (south) ── Luck Lake (south)
   Sweetwater Pullout (southwest)
      └── Landing (west, short trail) ~~row north~~ Lake ~~ Sweetwater Cabin
      │
      │  28 miles: North Prince of Wales Road + Coffman Tie
      │
 Control Lake Junction ── Thorne Bay Road (east, 8 mi) ── Thorne River Trailhead
      │                                         └── Old-Growth Trail (NE, dark!) ── Ford (NE, deep!) ── Thorne Cabin
      │  Big Salt Road (16 mi, northeast from Klawock)
      │
  Klawock ── Troopers (west), Totem Park (north)
   │   └── Hollis–Klawock Highway (east, 14 mi) ── Harris River Bridge ── Hollis Ferry (east, 11 mi; start)
   │
 Craig (south) ── Harbor, Harbormaster, Fuel Dock (west), Riptide Tavern (east)
   └── Harbor Light Lodge (south): Kitchen, Dale's Office, Boathouse
```

Real places: Hollis, Klawock, Craig, Control Lake, the Thorne River, Sweetwater Lake, Coffman Cove,
Dog Creek, Luck Lake and every road between them. Made up: the people, the Harbor Light Lodge,
the businesses, and the cabin on the Thorne.

### The island's people and history

Prince of Wales is Tlingit and Kaigani Haida country, and the game tries to treat it that way. The
history in the signs, the brochure and what people tell you is real: Lawáak (Klawock) and the
Heinyaa Ḵwáan, the 1878 cannery, the Tuxekan poles the CCC and Native carvers brought to the Klawock
totem park in 1938–40, Shuká Káa ("Man Ahead of Us," found in a north-end cave in 1996 and reburied
in 2008), Kasaan's Naay I'waans clan house (1880, rededicated 2016), Hydaburg's founding in 1911,
herring eggs at Fish Egg Island, Hollis gold, and the logging camps at Hollis, Thorne Bay and Coffman
Cove. The island has only black bears today. Clan stories (at.óow) belong to the clans that own them,
so the game never makes one up: Walt will tell you what a pole is, not whose story it carries.
Try THANK, GUNALCHÉESH (Tlingit) or HÁW'AA (Haida).

## Project layout

```
index.html                  page shell
css/style.css               CRT terminal styling (amber/green themes)
js/world.js                 THE STORY: rooms, items, people, clues, hints, endings
js/engine.js                parser + game engine (story-agnostic)
js/map.js                   field map renderer (SVG)
js/geodata.js               the real island (GENERATED by tools/build_geodata.py)
tools/build_geodata.py      builds geodata.js from USGS data (see below)
js/ui.js                    browser glue: input, history, status bar
tests/walkthrough.test.js   automated playthrough + regression tests
```

Want to add a room, a suspect or a red herring? Everything lives in `js/world.js`.
Text can be a string or a function `(g) => string` when it depends on game state.

## Tests

```
npm test
```

No dependencies, just Node. The suite plays the full game start to finish (it must end with
100/100), checks every exit and item location, and covers the puzzle gates (the dark trail,
the river crossing, the locked office, the safe and the accusations), plus save/load and parser
synonyms. It runs on every push via GitHub Actions.

## Map data

The island in `js/geodata.js` comes from the USGS National Map (public domain): the National
Hydrography Dataset for Prince of Wales Island (HU8 19010103) for the coastline, lakes and rivers;
the National Transportation Dataset for Alaska for the roads; and GNIS for place coordinates. Driving
routes are the real shortest routes along that road network. To rebuild it (say, after adding a place):

```
pip install pyogrio shapely networkx
# download and unzip the two GeoPackages linked at the top of tools/build_geodata.py, then:
python3 tools/build_geodata.py NHD_H_19010103_HU8_GPKG.gpkg TRAN_Alaska_State_GPKG.gpkg
```
