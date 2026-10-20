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
| People | `talk to marnie`, `ask joe about weather`, `show napkin to rick`, `give beer to cal` |
| The case | `notes` (your clue journal), `score`, `hint`, `accuse <name>` (at the trooper post) |
| Game | `map`, `save`, `load`, `restart` |

**The map.** Type `map` or hit the **Map** button to unfold your graph-paper map of the island.
Like the old Zork days, it only shows places you've actually been. Paths you've walked are
penciled in, exits you haven't tried get a dashed `?` stub, and a red circle marks where you are.
Keep typing with it open and it fills in as you go. `Esc` folds it back up.

Chain commands with periods (`open glovebox. take flashlight`). Up/down arrows recall
earlier commands. The **Theme** button switches between amber and green.

## Map

```
                    Trailhead ── Old-Growth Trail ── River Crossing ── Cabin
                        │           (dark!)          (deep!)
                 Thorne Bay Road
                        │
  Totem Park      Hollis–Klawock Hwy ──────────── Hollis Ferry (start)
       │                │
   Klawock ─────────────┘
   │     └─ Trooper Post (west)
   │
 Craig (Front St) ── Riptide Tavern (east)
   │  └─ Harbor (west) ── Fuel Dock (west)
   │        └─ Harbormaster (north)
 Lodge Road
   │
 Harbor Light Lodge ── Kitchen (east)
   │  └─ Dale's Office (west, locked)
 Boathouse (south)
```

(Spoiler-light. There's more to find than the map shows.)

## Project layout

```
index.html                  page shell
css/style.css               CRT terminal styling (amber/green themes)
js/world.js                 THE STORY: rooms, items, people, clues, hints, endings
js/engine.js                parser + game engine (story-agnostic)
js/map.js                   graph-paper map renderer (SVG)
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
