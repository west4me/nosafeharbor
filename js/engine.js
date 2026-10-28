/*
 * No Safe Harbor — text adventure engine.
 *
 * A small Zork-style engine: a plain-English parser, rooms/items/NPCs,
 * containers, light and darkness, wearables, a clue/score journal and
 * save/load. Story content comes from buildWorld() in world.js.
 *
 * Usage:
 *   const game = new NSH.Game(NSH.buildWorld, { storage });
 *   game.start();              // -> [{ text, cls }, ...]
 *   game.command('look');      // -> [{ text, cls }, ...]
 */
(function (root) {
  'use strict';

  const DIRS = {
    n: 'north', north: 'north', s: 'south', south: 'south',
    e: 'east', east: 'east', w: 'west', west: 'west',
    ne: 'northeast', northeast: 'northeast', nw: 'northwest', northwest: 'northwest',
    se: 'southeast', southeast: 'southeast', sw: 'southwest', southwest: 'southwest',
    u: 'up', up: 'up', d: 'down', down: 'down',
    in: 'in', inside: 'in', out: 'out', outside: 'out', exit: 'out', leave: 'out'
  };

  const STOP_WORDS = new Set(['the', 'a', 'an', 'some', 'my', 'your', 'that', 'this', 'of', 'at', 'his', 'her']);
  const SAVE_KEY = 'nosafeharbor-save-v2';
  const OLD_SAVE_KEYS = ['nosafeharbor-save-v1'];
  // The autosave is its own slot, written after every command, so SAVE/LOAD stay a separate bookmark.
  const AUTO_KEY = 'nosafeharbor-autosave-v2';
  // Bug notes from playtesting live in their own slot: they survive RESTART, LOAD and new cases.
  const BUGS_KEY = 'nosafeharbor-bugs-v1';
  const RECENT_KEPT = 3;
  const COMPASS_DIRS = new Set(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']);
  // A place can have a walk and a drive the same way (WEST on foot to the totem park, WEST in the truck
  // to Craig). The drive is stored as "west_drive"; these turn that back into what you'd type.
  const baseDir = (d) => d.replace(/_drive$/, '');
  const dirLabel = (d, drive) => baseDir(d).toUpperCase() + (drive || /_drive$/.test(d) ? ' (drive)' : '');

  function clean(phrase) {
    return String(phrase || '').split(/\s+/).filter((w) => w && !STOP_WORDS.has(w)).join(' ');
  }

  // Typo distance: insertions, deletions, substitutions and swapped neighbors each cost 1.
  function typoDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    const d = [];
    for (let i = 0; i <= a.length; i++) d.push([i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  // How far off a typo can be and still be fixed without asking: short words have to be close.
  const autoFixLimit = (word) => (word.length <= 3 ? 0 : word.length <= 5 ? 1 : 2);

  // First words of commands, for fixing typos like TAEK KEYS or NROTH.
  const VERB_WORDS = ['look', 'examine', 'read', 'take', 'grab', 'drop', 'open', 'close', 'unlock', 'push', 'pull', 'press',
    'talk', 'ask', 'give', 'show', 'wear', 'remove', 'enter', 'drive', 'north', 'south', 'east', 'west', 'northeast',
    'northwest', 'southeast', 'southwest', 'inventory', 'help', 'hint', 'notes', 'notebook', 'search', 'listen', 'smell',
    'touch', 'turn', 'start', 'stop', 'buy', 'accuse', 'climb', 'sit', 'knock', 'fish', 'row', 'wait', 'save', 'load',
    'restart', 'score', 'thank', 'cross', 'wade', 'switch', 'light', 'dial', 'eat', 'drink', 'travel', 'walk', 'go'];

  // The short version of a room on a return visit: the sentences that tell you where things are and
  // which way to go. The scenery you've already read stays out of the way.
  const WAY_WORDS = /\b(north|south|east|west|northeast|northwest|southeast|southwest|upstairs|downstairs)\b/i;
  function briefOf(desc) {
    const sentences = String(desc).match(/[^.!?]+[.!?]+['"]?(\s+|$)/g) || [String(desc)];
    const keep = sentences.filter((x) => WAY_WORDS.test(x));
    return (keep.length ? keep : sentences.slice(0, 1)).join('').trim();
  }

  // "the glovebox", but just "Joe Kitka".
  function theName(e) {
    return e.kind === 'npc' ? e.name : 'the ' + e.name;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Thank you, in English, Tlingit (gunalchéesh) and Haida (háw'aa), after accents and apostrophes are folded away.
  const THANK_WORDS = /^(?:thank you|thanks|thank|gunalcheesh|haw ?aa)(?: (?:you|very much|a lot|so much))?$/;
  const THANKS = /^(thank you|thanks|thank|gunalcheesh|haw ?aa)(?: (?:you|very much|a lot|so much))?(?: (?:to )?(.+))?$/;

  function listJoin(arr) {
    if (arr.length <= 1) return arr.join('');
    if (arr.length === 2) return arr[0] + ' and ' + arr[1];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function memoryStorage() {
    const data = {};
    return { get: (k) => (k in data ? data[k] : null), set: (k, v) => { data[k] = v; return true; } };
  }

  class Game {
    constructor(buildWorld, opts = {}) {
      this.buildWorld = buildWorld;
      this.storage = opts.storage || memoryStorage();
      this.context = opts.context || (() => ({})); // where the page is running, for bug reports
      this.recent = []; // the last few commands and what the game said, for bug reports
      this.buf = [];
      this.pending = [];
      this.newGame();
    }

    // ------------------------------------------------------------ lifecycle
    newGame() {
      const w = this.buildWorld();
      this.world = w;
      this.rooms = w.rooms;
      this.items = w.items;
      this.npcs = w.npcs;
      this.clues = w.clues;
      // Room scenery shorthand: { 'name, alias, alias': description | { desc, text, take, <verb>: response } }.
      // Every noun a room description mentions should be in here, so players can look at it.
      const SCENERY_FIELDS = ['desc', 'text', 'onExamine', 'onRead'];
      for (const [rid, r] of Object.entries(this.rooms)) {
        for (const [key, val] of Object.entries(r.scenery || {})) {
          const names = key.split(',').map((x) => x.trim()).filter(Boolean);
          const spec = typeof val === 'object' ? val : { desc: val };
          const it = { name: names[0], names, fixed: true, loc: rid, verbs: {} };
          for (const [k, v] of Object.entries(spec)) {
            if (SCENERY_FIELDS.includes(k)) it[k] = v;
            else if (k === 'take') it.fixedMsg = v;
            else it.verbs[k] = typeof v === 'function' ? v : () => v;
          }
          this.items[`${rid}:${names[0]}`] = it;
        }
      }
      const items = {};
      for (const [id, it] of Object.entries(this.items)) {
        it.id = id;
        it.kind = 'item';
        it.names = (it.names || [it.name]).map((n) => n.toLowerCase());
        items[id] = { loc: it.loc === undefined ? null : it.loc, open: !!it.open, locked: !!it.locked, on: !!it.on, worn: false };
      }
      for (const [id, r] of Object.entries(this.rooms)) r.id = id;
      for (const [id, n] of Object.entries(this.npcs)) {
        n.id = id;
        n.kind = 'npc';
        n.names = n.names.map((x) => x.toLowerCase());
      }
      // visited = rooms you've stood in; lit = rooms you've actually seen (for the map).
      // log, met and leads feed the case notebook.
      this.state = { version: 2, loc: w.start, items, flags: {}, found: [], score: 0, turns: 0, visited: { [w.start]: true }, lit: {}, over: false, log: [], met: {}, leads: {} };
      this.updateLeads(true);
    }

    start() {
      this.print(this.world.intro, 'intro');
      this.describe(true);
      return this.flush();
    }

    // ------------------------------------------------------------ output
    print(text, cls = 'text') {
      if (text === null || text === undefined || text === '') return;
      this.buf.push({ text: String(text), cls });
    }

    // Signals for the UI (e.g. toggling the map). No text, so they're invisible to tests and logs.
    emit(event) {
      this.buf.push({ text: '', cls: 'event', event });
    }

    flush() {
      const out = this.buf;
      this.buf = [];
      return out;
    }

    t(x) {
      return typeof x === 'function' ? x(this) : x;
    }

    status() {
      const room = this.rooms[this.state.loc];
      const name = this.isDark() ? 'Darkness' : room.name;
      return { location: name, score: this.state.score, maxScore: this.world.maxScore, turns: this.state.turns, over: this.state.over };
    }

    // ------------------------------------------------------------ state helpers (used by world.js)
    flag(key, value) {
      if (value === undefined) return !!this.state.flags[key];
      this.state.flags[key] = value;
      return value;
    }

    has(clueId) {
      return this.state.found.includes(clueId);
    }

    clue(clueId) {
      if (this.has(clueId)) return false;
      const c = this.clues[clueId];
      if (!c) throw new Error('Unknown clue: ' + clueId);
      this.state.found.push(clueId);
      this.state.score += c.points;
      this.logEvent('evidence', c.title);
      this.pending.push(`[Journal updated: ${c.title}. +${c.points} points]`);
      return true;
    }

    // ------------------------------------------------------------ the case notebook
    // A running log of what you've done, newest last. Turn numbers match the status bar after the move.
    logEvent(kind, text) {
      const log = this.state.log || (this.state.log = []);
      log.push({ turn: this.state.turns + 1, kind, text });
      if (log.length > 300) log.splice(0, log.length - 300);
    }

    meet(npc) {
      const met = this.state.met || (this.state.met = {});
      if (met[npc.id]) return;
      met[npc.id] = true;
      this.logEvent('person', npc.role ? `${npc.name}: ${npc.role}` : npc.name);
    }

    // Open new leads and close finished ones. Silent when setting up a game or restoring a save.
    updateLeads(silent) {
      const st = this.state.leads || (this.state.leads = {});
      for (const lead of this.world.leads || []) {
        if (st[lead.id] === 'done') continue;
        const now = lead.done(this) ? 'done' : lead.show(this) ? 'open' : null;
        if (!now || now === st[lead.id]) continue;
        const wasOpen = st[lead.id] === 'open';
        st[lead.id] = now;
        // A lead you finished before you ever heard of it just quietly counts as done.
        if (silent || (now === 'done' && !wasOpen)) continue;
        if (now === 'open') {
          this.pending.push(`[New lead in your notebook: ${lead.text}]`);
          this.logEvent('lead', lead.text);
        } else {
          this.logEvent('done', lead.text);
        }
      }
    }

    openLeads() {
      const st = this.state.leads || {};
      return (this.world.leads || []).filter((l) => st[l.id] === 'open');
    }

    itemState(id) {
      return this.state.items[id];
    }

    itemAt(id, loc) {
      return this.state.items[id].loc === loc;
    }

    inInv(id) {
      return this.state.items[id].loc === 'inv';
    }

    // Owned = carried, or worn (worn items stay in inventory).
    isOwned(id) {
      return this.inInv(id);
    }

    isWorn(id) {
      const st = this.state.items[id];
      return st.loc === 'inv' && st.worn;
    }

    moveItem(id, loc) {
      const st = this.state.items[id];
      st.loc = loc;
      if (loc !== 'inv') st.worn = false;
    }

    npcHere(id) {
      return this.npcs[id].loc === this.state.loc;
    }

    hasLight() {
      const st = this.state.items.flashlight;
      return !!(st && st.loc === 'inv' && st.on);
    }

    isDark() {
      return !!this.rooms[this.state.loc].dark && !this.hasLight();
    }

    contentsOf(containerId) {
      return Object.keys(this.state.items).filter((id) => this.state.items[id].loc === containerId);
    }

    contentsLine(containerId) {
      const ids = this.contentsOf(containerId);
      const c = this.items[containerId];
      if (!ids.length) return `The ${c.name} is empty.`;
      return `Inside the ${c.name} you see ${listJoin(ids.map((id) => this.items[id].short || this.items[id].name))}.`;
    }

    end(text) {
      // Journal notes earned on the last move go above the ending, not after it.
      for (const p of this.pending) this.print(p, 'clue');
      this.pending = [];
      this.print(text, 'ending');
      this.state.over = true;
      this.print(this.scoreLine(), 'meta');
      this.print('Type RESTART to play again.', 'meta');
    }

    rank() {
      for (const [min, title] of this.world.ranks) if (this.state.score >= min) return title;
      return '';
    }

    scoreLine() {
      return `Your score is ${this.state.score} of a possible ${this.world.maxScore}, in ${this.state.turns} turn${this.state.turns === 1 ? '' : 's'}. That gives you the rank of ${this.rank()}.`;
    }

    // ------------------------------------------------------------ scope / matching
    visibleItems() {
      const loc = this.state.loc;
      const lit = !this.isDark();
      const ids = Object.keys(this.state.items).filter((id) => {
        const l = this.state.items[id].loc;
        if (l === 'inv') return true;
        // Some things only come into view once something else shows them to you (the lanyard on the skiff).
        const hidden = this.items[id].hiddenUntil;
        return lit && l === loc && (!hidden || hidden(this));
      });
      // Contents of open containers that are in scope (one level deep is all this world needs).
      for (const cid of [...ids]) {
        const c = this.items[cid];
        if (c.container && this.state.items[cid].open) ids.push(...this.contentsOf(cid));
      }
      return ids.map((id) => this.items[id]);
    }

    visibleNpcs() {
      if (this.isDark()) return [];
      return Object.values(this.npcs).filter((n) => n.loc === this.state.loc);
    }

    match(phrase, ents) {
      const p = clean(phrase);
      if (!p) return null;
      const pw = p.split(' ');
      const exact = [];
      const partial = [];
      for (const e of ents) {
        let hit = null;
        for (const n of e.names) {
          if (n === p) { hit = 'exact'; break; }
          const nw = n.split(' ');
          if (pw.every((x) => nw.includes(x)) || nw.every((x) => pw.includes(x))) hit = hit || 'partial';
        }
        if (hit === 'exact') exact.push(e);
        else if (hit === 'partial') partial.push(e);
      }
      const pick = exact.length ? exact : partial;
      if (pick.length === 1) return pick[0];
      if (pick.length > 1) {
        // Prefer things you're carrying, then portable things.
        const carried = pick.filter((e) => e.kind === 'item' && this.inInv(e.id));
        if (carried.length === 1) return carried[0];
        return { ambiguous: pick };
      }
      return null;
    }

    // Resolve a noun phrase to something in scope; prints an error and returns null on failure.
    find(phrase, { npcs = true, items = true } = {}) {
      // Answering "did you mean...?": the thing you said yes to (or picked) stands in for what you typed.
      if (this.forced && this.forced.phrase === phrase) {
        const e = this.forced.ent;
        this.forced = null;
        return e;
      }
      const scope = [].concat(items ? this.visibleItems() : [], npcs ? this.visibleNpcs() : []);
      const m = this.match(phrase, scope);
      if (m && m.ambiguous) {
        this.print(`Which do you mean: ${listJoin(m.ambiguous.map((e) => theName(e)))}?`);
        this.pendingAnswer = { cmd: this.currentCmd, phrase, ents: m.ambiguous };
        return null;
      }
      if (!m) {
        if (this.isDark()) { this.print("It's too dark to see anything like that."); return null; }
        const p = clean(phrase);
        const guess = this.guessName(p, scope);
        const called = guess && (guess.ent.kind === 'npc' ? guess.ent.name : 'the ' + guess.name);
        if (guess && guess.sure) {
          this.print(`(${capitalize(called)}, I assume.)`, 'meta');
          return guess.ent;
        }
        this.print(`You don't see any ${p || 'such thing'} here.` + (guess ? ` Did you mean ${called}?` : ''));
        if (guess) this.pendingAnswer = { cmd: this.currentCmd, phrase, ent: guess.ent };
        return null;
      }
      return m;
    }

    // An answer to the game's last question: { result } once handled, or null if this is just a new command.
    answer(asked, cmd) {
      const handled = this.answerInner(asked, cmd);
      return handled === null ? null : { result: handled };
    }

    answerInner(asked, cmd) {
      // "Talk to whom?" / "Accuse whom?" / "Where to?": a name or place fills in the blank.
      if (asked.template) {
        const who = cmd.replace(/^(to|at) /, '').replace(/^(the|that|this) /, '');
        let fits = false;
        if (asked.places) fits = !!this.roomByName(clean(who));
        else {
          const m = this.match(who, asked.everyone ? Object.values(this.npcs) : this.visibleNpcs());
          fits = !!m && !m.ambiguous;
        }
        if (!fits) return null;
        return this.dispatch(asked.template.replace('%', who));
      }
      const yes = /^(y|yes|yeah|yep|yup|sure|ok|okay|correct|right|uh huh|yes please|thats right|i did)$/.test(cmd);
      if (/^(no|nope|nah|never ?mind|cancel|neither|none|not really)$/.test(cmd)) {
        this.print('Okay, never mind.');
        return false;
      }
      if (asked.verbs) {
        const pick = yes && asked.verbs.length === 1 ? asked.verbs[0] : asked.verbs.find((v) => v === cmd);
        if (pick) return this.dispatch([pick, asked.rest].filter(Boolean).join(' '));
        if (!yes) return null;
        this.print(`Which one: ${asked.verbs.map((v) => v.toUpperCase()).join(' or ')}?`);
        this.pendingAnswer = asked;
        return false;
      }
      let ent = null;
      if (asked.ent && yes) ent = asked.ent;
      else if (asked.ents) {
        if (yes) {
          this.print('Which one?');
          this.pendingAnswer = asked;
          return false;
        }
        const m = this.match(cmd.replace(/^(the|that|this) /, ''), asked.ents);
        if (m && !m.ambiguous) ent = m;
      }
      if (!ent) return null;
      this.forced = { phrase: asked.phrase, ent };
      const r = this.dispatch(asked.cmd);
      this.forced = null;
      return r;
    }

    // Best near-miss for a mistyped noun among what's in reach. sure = close enough to just go with it.
    guessName(p, scope) {
      if (!p || p.length < 3) return null;
      let best = null;
      let tie = false;
      for (const e of scope) {
        for (const n of e.names) {
          const d = typoDistance(p, n);
          if (d > 2) continue;
          if (!best || d < best.d) { best = { ent: e, name: n, d }; tie = false; }
          else if (d === best.d && best.ent !== e) tie = true;
        }
      }
      if (!best || tie) return null;
      best.sure = best.d <= autoFixLimit(p);
      return best;
    }

    // ------------------------------------------------------------ commands
    command(raw) {
      const input = String(raw || '').trim();
      if (!input) {
        this.print('Beg pardon?');
        return this.flush();
      }
      // BUG takes the rest of the line exactly as typed, periods and all.
      const bug = input.match(/^(bug|bugs|clear bugs|bugs clear|copy bugs|bugs copy)\b\s*(.*)$/i);
      if (bug) {
        this.bugCommand(bug[1].toLowerCase(), bug[2]);
        return this.flush();
      }
      const parts = input.toLowerCase().split(/\s*(?:\.(?!\d)|;|\bthen\b)\s*/).filter(Boolean);
      for (const part of parts) {
        if (this.state.over && !/^(restart|load|restore|score|notes|journal|help|map)\b/.test(part)) {
          this.print('The case is closed. Type RESTART to play again, or LOAD to restore a saved game.');
          break;
        }
        const counted = this.dispatch(part);
        this.updateLeads();
        if (counted !== false) this.state.turns++;
        if (this.pending.length) {
          for (const p of this.pending) this.print(p, 'clue');
          this.pending = [];
        }
      }
      this.autosave();
      const out = this.flush();
      this.recent.push({ cmd: input, out: out.filter((b) => b.cls !== 'event').map((b) => b.text).join('\n') });
      if (this.recent.length > RECENT_KEPT) this.recent.shift();
      return out;
    }

    // ------------------------------------------------------------ playtest bug notes
    readBugs() {
      try { return JSON.parse(this.storage.get(BUGS_KEY)) || []; } catch (e) { return []; }
    }

    writeBugs(list) {
      try { this.storage.set(BUGS_KEY, JSON.stringify(list)); } catch (e) { /* storage full or blocked */ }
    }

    bugCommand(verb, note) {
      const list = this.readBugs();
      if (verb === 'clear bugs' || verb === 'bugs clear') {
        this.writeBugs([]);
        this.print(list.length ? `Cleared ${list.length} bug note${list.length === 1 ? '' : 's'}.` : 'There are no bug notes to clear.', 'meta');
        return;
      }
      if (verb === 'copy bugs' || verb === 'bugs copy' || (verb === 'bugs' && /^copy$/i.test(note.trim()))) {
        if (!list.length) { this.print('No bug notes yet. Type BUG and what went wrong.', 'meta'); return; }
        this.buf.push({ text: '', cls: 'event', event: 'copy', payload: this.bugReport(list) });
        this.print(`Copied ${list.length} bug note${list.length === 1 ? '' : 's'}. Paste them into a message to me.`, 'meta');
        return;
      }
      if (verb === 'bugs') {
        if (!list.length) { this.print('No bug notes yet. Type BUG and what went wrong, like: BUG the ferry sign is misspelled', 'meta'); return; }
        this.print(this.bugReport(list) + '\n\nBUGS COPY copies them all for you; CLEAR BUGS empties the list.', 'document');
        return;
      }
      if (!note.trim()) {
        this.print("What went wrong? Type BUG and a quick note, like: BUG Joe didn't answer when I asked about the tide", 'meta');
        return;
      }
      const room = this.rooms[this.state.loc];
      list.push({
        at: new Date().toISOString(),
        note: note.trim(),
        place: room ? room.name : this.state.loc,
        turn: this.state.turns,
        score: this.state.score,
        recent: this.recent.slice(),
        ...this.context()
      });
      this.writeBugs(list);
      this.print(`Bug #${list.length} noted, along with where you are and your last ${Math.min(this.recent.length, RECENT_KEPT) || 'few'} command${this.recent.length === 1 ? '' : 's'}. Keep playing. (BUGS lists them, BUGS COPY copies them all.)`, 'meta');
    }

    // All the notes as plain text, ready to paste into a message.
    bugReport(list) {
      const lines = [`NO SAFE HARBOR: BUG NOTES (${list.length})`];
      list.forEach((b, i) => {
        const when = new Date(b.at);
        const stamp = isNaN(when) ? b.at : when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const extra = [b.site, b.screen, b.theme].filter(Boolean).join(' · ');
        lines.push('', `#${i + 1}  ${stamp} · ${b.place} · turn ${b.turn} · score ${b.score}${extra ? ' · ' + extra : ''}`, `Note: ${b.note}`);
        if (b.recent && b.recent.length) {
          lines.push('Just before:');
          for (const r of b.recent) {
            lines.push(`  > ${r.cmd}`);
            const said = r.out.length > 400 ? r.out.slice(0, 400) + '…' : r.out;
            for (const l of said.split('\n')) if (l.trim()) lines.push('    ' + l);
          }
        }
      });
      return lines.join('\n');
    }

    // Returns false for meta commands that shouldn't use up a turn.
    dispatch(input) {
      this.drivingNow = false; // set by world road exits while a trip is under way
      // Fold accents and curly quotes first, so GUNALCHÉESH and HÁW’AA read the same as typed plain.
      const cmd = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'")
        .replace(/[^a-z0-9\s'-]/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
      if (!cmd) { this.print('Beg pardon?'); return false; }
      // The game asked you something last turn ("Did you mean Joe Kitka?"): take YES, NO or a pick as the answer.
      const asked = this.pendingAnswer;
      this.pendingAnswer = null;
      if (asked) {
        const answered = this.answer(asked, cmd);
        if (answered) return answered.result;
      }
      this.currentCmd = cmd;
      const words = cmd.split(' ');
      let m;

      // --- meta
      if (/^(look|l)( around)?$/.test(cmd)) return this.describe(true);
      if (/^(verbose|brief|superbrief)$/.test(cmd)) {
        this.flag('verbose', cmd === 'verbose');
        this.print(cmd === 'verbose'
          ? 'Verbose: places are described in full every time you arrive.'
          : 'Brief: places you have been before get a short description. (LOOK shows the full one.)', 'meta');
        return false;
      }
      if (/^(i|inv|inventory|invent)$/.test(cmd)) return this.inventory();
      if (/^(map|m|show map|open map|view map|close map|hide map|fold map|unfold map)$/.test(cmd)) { this.emit('map'); return false; }
      if (/^(score|points)$/.test(cmd)) { this.print(this.scoreLine()); return false; }
      if (/^(notebook|open notebook|case notebook|close notebook|j)$/.test(cmd)) { this.emit('notebook'); return false; }
      if (/^(notes|journal|clues|evidence|case notes|read notes|read journal|leads)$/.test(cmd)) return this.notes();
      if (/^(help|h|\?|commands|instructions)$/.test(cmd)) return this.help();
      if (/^(hint|hints|clue)$/.test(cmd)) { this.print(this.world.hint(this), 'hint'); return false; }
      if (/^save( game)?$/.test(cmd)) return this.save();
      if (/^(load|restore)( game)?$/.test(cmd)) return this.load();
      if (/^(restart|new game|reset)$/.test(cmd)) return this.restart();
      if (/^(wait|z|rest)$/.test(cmd)) { this.print('Time passes. Somewhere, it rains harder.'); return; }
      if (/^(quit|q|exit game)$/.test(cmd)) { this.print("There's no quitting on the job. (Close the tab whenever you like. Type SAVE first if you want to keep your progress.)"); return false; }
      if (/^(?:where is|wheres|where s|where did i (?:park|leave)|find|locate)(?: the| my)? ?(?:truck|pickup|car|rental)?(?: truck)?$/.test(cmd) && /truck|pickup|car|rental|park|leave/.test(cmd)) return this.whereIsTruck();
      if (/^(exits|ways out|where can i go|directions)$/.test(cmd)) { this.print(this.waysOut() || "There's no obvious way out from here.", 'exits'); return false; }
      if (/^(y|yes|yeah|yep|no|nope|nah|maybe)$/.test(cmd)) { this.print('Nobody asked you anything just now. (Try a command, like LOOK.)'); return false; }
      if (/^(xyzzy|plugh)$/.test(cmd)) { this.print('A hollow voice says, "Wrong game, investigator."'); return; }
      if (/^(diagnose|health)$/.test(cmd)) { this.print('Damp, underpaid and in excellent health.'); return false; }

      // --- keypads and dials (before movement and "turn ...", so ENTER 1187 isn't read as a direction)
      if (/^(?:dial|enter|set|spin|turn|try|input|type|punch|punch in|key in|press|code|use code|use combination|combination|open safe with)\b\D*\d/.test(cmd) || /^\d[\d\s-]*$/.test(cmd)) {
        return this.dial(cmd.match(/\d+/g).map(Number));
      }

      // --- movement
      if (words.length === 1 && DIRS[words[0]]) return this.go(DIRS[words[0]]);
      if ((m = cmd.match(/^(go|walk|run|drive|head|travel|move|hike|climb|row|paddle)(?: to| toward| towards)? (\w+)$/)) && DIRS[m[2]]) {
        const exits = this.exitsOf(this.rooms[this.state.loc]);
        if (m[1] === 'drive' && this.state.loc !== 'truck_cab') {
          // DRIVE WEST where there's both a walk and a drive west: the drive.
          if (exits[`${DIRS[m[2]]}_drive`]) return this.go(`${DIRS[m[2]]}_drive`);
          // DRIVE somewhere you can only walk: say so, then walk.
          const exit = exits[DIRS[m[2]]];
          if (exit && !(typeof exit === 'object' && exit.drive) && this.exitTo(exit) !== 'truck_cab') this.print("(No road that way, just a short walk. You leave the truck where it is.)", 'meta');
        }
        // WALK WEST where the only way west is a drive: say so.
        if (m[1] === 'walk' && !exits[DIRS[m[2]]] && exits[`${DIRS[m[2]]}_drive`]) {
          this.print(`That's a drive, not a walk. (DRIVE ${DIRS[m[2]].toUpperCase()})`);
          return false;
        }
        return this.go(DIRS[m[2]]);
      }
      if (/^(row|paddle|launch(?: .+)?|push off|row (?:across|out|over)(?: .+)?|use (?:skiff|boat))$/.test(cmd)) return this.row();
      if ((m = cmd.match(/^(?:go|walk|run|drive|head|travel|hike|row|paddle) (?:to |into |toward |towards |back to )?(.+)$/))) return this.goByName(m[1]);
      if (/^(get out|climb out|step out|hop out|get out of .+|climb out of .+|exit (?:truck|pickup|car|cab|vehicle)|leave (?:truck|pickup|car|cab))$/.test(cmd)) {
        if (!this.exitsOf(this.rooms[this.state.loc]).out) { this.print("You're not in anything. You're already out here in the weather."); return false; }
        return this.go('out');
      }
      if ((m = cmd.match(/^(?:enter|go in|go into|go inside|get in|get into|climb in|climb into|hop in|hop into|sit in) (.+)$/))) return this.enter(m[1]);
      if (/^(enter|go in|get in|climb in|hop in)$/.test(cmd)) return this.go('in');
      if (/^(drive|start|start (?:the )?(?:truck|engine|car|pickup)|start up(?: (?:truck|car|pickup))?|start it|drive (?:truck|car|pickup)|turn (?:the )?key)$/.test(cmd)) {
        this.print(this.t(this.world.driveHelp) || 'Drive where?');
        return;
      }
      if (/^(stop|stop (?:the )?(?:truck|engine|car)|kill (?:the )?(?:engine|truck|motor)|shut off (?:the )?(?:engine|truck)|park)$/.test(cmd) && this.world.stopEngine) {
        this.print(this.world.stopEngine(this));
        return;
      }
      if ((m = cmd.match(/^(?:cross|ford|wade)(?: across)?(?: the)?(?: (.+))?$/))) return this.crossRiver();

      // --- clothing
      if ((m = cmd.match(/^(?:take off|remove|unwear|doff) (.+)$/)) || (m = cmd.match(/^take (.+) off$/))) return this.remove(m[1]);
      if ((m = cmd.match(/^(?:put on|wear|don|pull on) (.+)$/)) || (m = cmd.match(/^put (.+) on$/))) return this.wear(m[1]);

      // --- switches
      if ((m = cmd.match(/^(?:turn on|switch on|light|activate|power on|click on) (.+)$/)) || (m = cmd.match(/^(?:turn|switch|click) (.+) on$/))) return this.switchItem(m[1], true);
      if ((m = cmd.match(/^(?:turn off|switch off|extinguish|deactivate|power off|click off) (.+)$/)) || (m = cmd.match(/^(?:turn|switch|click) (.+) off$/))) return this.switchItem(m[1], false);

      // --- inventory manipulation
      if (/^(take|get|grab) (all|everything)$/.test(cmd)) return this.takeAll();
      if ((m = cmd.match(/^(?:take|get|grab|pick up|collect|steal|snag|pocket) (.+?)(?: (?:from|out of|off) .+)?$/)) || (m = cmd.match(/^pick (.+) up$/))) return this.take(m[1]);
      if ((m = cmd.match(/^(?:drop|discard|put down|leave|toss|throw away) (.+)$/)) || (m = cmd.match(/^put (.+) down$/))) return this.drop(m[1]);

      // --- looking
      if ((m = cmd.match(/^(?:read back of|look at back of|flip|flip over|turn over|look on back of) (.+)$/)) || (m = cmd.match(/^(?:flip|turn) (.+) over$/))) return this.read(m[1]);
      if ((m = cmd.match(/^(?:look|l) (?:at|in|inside|into|under|behind|on|through) (.+)$/)) ||
          (m = cmd.match(/^(?:x|examine|inspect|check|study|search|investigate|describe|look over|check out|exam|ex) (.+)$/))) return this.examine(m[1]);
      if ((m = cmd.match(/^(?:look|l) (.+)$/))) {
        if (DIRS[m[1]]) { this.print('You see nothing special in that direction. Try going there.'); return; }
        return this.examine(m[1]);
      }
      if (/^search$/.test(cmd)) return this.describe(true);
      if ((m = cmd.match(/^(?:read|skim|peruse) (.+)$/))) return this.read(m[1]);

      // --- open / close / lock
      if ((m = cmd.match(/^(?:unlock) (.+?)(?: with (.+))?$/))) return this.unlock(m[1]);
      if ((m = cmd.match(/^(?:open|pry open) (.+)$/))) return this.doVerb('open', m[1]);
      if ((m = cmd.match(/^(?:close|shut) (.+)$/))) return this.doVerb('close', m[1]);
      if ((m = cmd.match(/^lock (.+)$/))) { this.print("You'd rather leave things the way you found them."); return; }

      // --- people
      if ((m = cmd.match(THANKS))) return this.thank(m[2], m[1]);
      if ((m = cmd.match(/^say (.+?)(?: to (.+))?$/)) && THANK_WORDS.test(m[1])) return this.thank(m[2], m[1]);
      if ((m = cmd.match(/^tell (\S+(?: \S+)?) (.+)$/)) && THANK_WORDS.test(m[2])) return this.thank(m[1], m[2]);
      if ((m = cmd.match(/^(?:say|whisper|mutter) (.+)$/))) { this.print(`You say "${m[1]}" out loud. The rain keeps its opinion to itself.`); return; }
      // "tell me about the weather", "ask about Dale": a question for whoever is here.
      if ((m = cmd.match(/^(?:tell (?:me|us) about|ask about|what about|talk about) (.+)$/))) return this.askHere(m[1]);
      if ((m = cmd.match(/^(?:ask|question|quiz) (.+?) (?:about|regarding|re) (.+)$/))) return this.ask(m[1], m[2]);
      if ((m = cmd.match(/^(?:tell) (.+?) about (.+)$/))) return this.ask(m[1], m[2]);
      // "ask joe what happened to dale", "ask joe for coffee": a name, then the question.
      if ((m = cmd.match(/^(?:ask|question) (.+)$/))) {
        const split = this.npcAndRest(m[1]);
        if (split && split.rest) return this.ask(split.name, split.rest);
      }
      if ((m = cmd.match(/^(?:talk|speak|chat|converse)(?: to| with)? (.+?)(?: about (.+))?$/))) return m[2] ? this.ask(m[1], m[2]) : this.talk(m[1]);
      if ((m = cmd.match(/^(?:greet|hi|hello|hey|interview|question|ask|interrogate|wave to|wave at) (.+)$/))) return this.talk(m[1]);
      if (/^(talk|speak|chat|hello|hi|hey)$/.test(cmd)) return this.talkToOnly();
      if ((m = cmd.match(/^(show|give|hand|offer|present) (.+)$/))) return this.showGive(m[1] === 'show' || m[1] === 'present' ? 'show' : 'give', m[2]);

      // --- case
      if ((m = cmd.match(/^(?:accuse|arrest|blame|report|name|charge) (.+)$/))) return this.accuse(m[1]);
      if (/^(accuse|arrest|blame|solve)$/.test(cmd)) {
        this.print('Accuse whom? (Example: ACCUSE RICK)');
        this.pendingAnswer = { template: 'accuse %', everyone: true };
        return false;
      }

      // --- shopping
      if ((m = cmd.match(/^(?:buy|order|purchase|get me) (.+)$/))) return this.buy(m[1]);

      // --- misc
      if ((m = cmd.match(/^use (.+)$/))) return this.use(m[1]);
      if ((m = cmd.match(/^(?:drink|sip|chug) (.+)$/))) return this.itemVerb('drink', m[1], "That's not something you can drink.");
      if ((m = cmd.match(/^(?:eat|taste|lick|bite) (.+)$/))) return this.itemVerb('eat', m[1], "You're not that hungry. Not for that.");
      if (/^(fish|cast|go fishing|fly fish|flyfish)( .*)?$/.test(cmd)) return this.fish();
      if (/^(swim|dive|jump in)( .*)?$/.test(cmd)) { this.print("The water up here is cold enough to stop your heart. Hard pass."); return; }
      if ((m = cmd.match(/^(?:listen|hear)(?: to| for)?(?: (.+))?$/))) return this.sense('listen', m[1], 'Rain. Ravens. Somewhere, a boat engine, then nothing.', 'You hear nothing unusual.');
      if ((m = cmd.match(/^(?:smell|sniff)(?: at)?(?: (.+))?$/))) return this.sense('smell', m[1], 'Spruce, salt and wet everything.', 'It smells about how you would expect.');
      if ((m = cmd.match(/^(?:sit|sit down|have a seat|take a seat|lie down|lie|rest)(?: (?:on|in|at|down on|down in) (.+))?$/))) return this.sense('sit', m[1], "You'd rather stay on your feet. There's work to do.", "That doesn't look like it would hold you.");
      if ((m = cmd.match(/^knock(?: on| at)?(?: (.+))?$/))) return this.sense('knock', m[1], 'Knock on what?', 'Knock knock. Nobody answers.');
      if ((m = cmd.match(/^(?:climb|scale)(?: up| on| onto| over)? (.+)$/))) return this.itemVerb('climb', m[1], "You'd break your neck, and that's not covered either.");
      if ((m = cmd.match(/^(?:play|press|push button on|punch button on) (.+)$/))) return this.itemVerb('push', m[1], "You can't play that.");
      if ((m = cmd.match(/^(?:pet|pat|scratch) (.+)$/))) return this.itemVerb('touch', m[1], "It doesn't seem to want that.");
      if (/^(time|what time is it|check time|check watch|look at watch|watch)$/.test(cmd)) { this.print(this.t(this.world.timeText) || "Late afternoon. The light goes early this time of year."); return false; }
      if (/^(weather|check weather|forecast)$/.test(cmd)) { this.print(this.t(this.rooms[this.state.loc].weather) || 'Rain. Light, steady, eternal. A nice day, by local standards.'); return false; }
      if (/^(sleep|nap)$/.test(cmd)) { this.print("You can sleep when the claim's closed."); return; }
      if (/^(yell|shout|scream|sing|hum|make noise|clap)( .*)?$/.test(cmd)) { this.print('You make some noise. Any bears within earshot politely decide to be somewhere else.'); return; }
      if (/^(jump|dance)$/.test(cmd)) { this.print('Wheee.'); return; }
      if (/^(curse|damn|swear)( .*)?$/.test(cmd)) { this.print('Such language from an insurance professional.'); return; }
      if ((m = cmd.match(/^(?:call|phone|text|dial) (.+)$/))) { this.print('No service. Welcome to the Tongass. You will have to talk to people face to face, like it is 1952.'); return; }
      if ((m = cmd.match(/^(?:hit|kill|attack|punch|kick|break|smash|fight) (.+)$/))) { this.print('Violence is not covered under your policy.'); return; }
      if ((m = cmd.match(/^(?:touch|feel|rub|stroke|poke) (.+)$/))) return this.itemVerb('touch', m[1], 'It feels about how it looks.');
      if ((m = cmd.match(/^(?:push|pull|move|shake|lift|tug|turn) (.+)$/))) return this.itemVerb('push', m[1], 'Nothing happens.');

      // A question asked out loud ("how's the weather?", "what happened to Dale?") goes to whoever is here.
      if (/^(?:how|hows|what|whats|where|wheres|who|whos|why|when|whose|which|did|does|do you|is|was|were|are|can you|could you|any|have you|has)\b/.test(cmd)) return this.askHere(cmd);

      // One typo in the first word (TAEK KEYS, NROTH): fix it and try again, once.
      if (!this.fixingTypo) {
        const first = words[0];
        let bestD = 99;
        let best = [];
        for (const v of VERB_WORDS) {
          const d = typoDistance(first, v);
          if (d === 0 || d > Math.max(1, autoFixLimit(first))) continue;
          if (d < bestD) { bestD = d; best = [v]; } else if (d === bestD) best.push(v);
        }
        if (best.length === 1 && bestD <= autoFixLimit(first)) {
          const fixed = [best[0]].concat(words.slice(1)).join(' ');
          this.print(`(Taking that as "${fixed}".)`, 'meta');
          this.fixingTypo = true;
          try { return this.dispatch(fixed); } finally { this.fixingTypo = false; }
        }
        if (best.length && best.length <= 3) {
          this.print(`I don't know how to "${cmd}". Did you mean ${best.map((v) => v.toUpperCase()).join(' or ')}?`);
          this.pendingAnswer = { verbs: best, rest: words.slice(1).join(' ') };
          return false;
        }
      }
      this.print(`I don't know how to "${cmd}". (Type HELP for a list of commands.)`);
      return false;
    }

    // ------------------------------------------------------------ verbs
    describe(full) {
      const room = this.rooms[this.state.loc];
      // Coming back to a place you've already seen: just the way around (LOOK shows it all again).
      const brief = full === 'arrive' && this.state.lit[room.id] && !this.state.flags.verbose;
      if (this.isDark()) {
        this.print('Darkness', 'room-title');
        this.print('It is pitch dark under the canopy. You can hear the river somewhere ahead and something large moving through the brush nearby. You are likely to be eaten by a black bear.');
        return;
      }
      this.state.lit[room.id] = true;
      this.print(room.name, 'room-title');
      if (brief) this.print(briefOf(this.t(room.desc)));
      else if (full) this.print(this.t(room.desc));
      const loose = this.contentsOf(room.id).filter((id) => !this.items[id].fixed || this.items[id].listed);
      for (const id of loose) {
        const it = this.items[id];
        this.print(it.roomDesc !== undefined ? this.t(it.roomDesc) : `There is ${it.short || 'a ' + it.name} here.`);
      }
      for (const n of this.visibleNpcs()) this.print(this.t(n.here), 'npc');
      if (full) this.print(this.waysOut(), 'exits');
    }

    // "Ways out: north to the Harbormaster's Office, ..." plus where your truck is if it's not here,
    // so you never have to guess where you can go.
    waysOut() {
      const room = this.rooms[this.state.loc];
      if (room.id === 'truck_cab') return '';
      const seen = new Set();
      const ways = [];
      for (const [dir, exit] of Object.entries(this.exitsOf(room))) {
        const to = this.exitTo(exit);
        if (!to || to === 'truck_cab' || !this.rooms[to] || seen.has(to)) continue;
        if ((dir === 'in' || dir === 'out') && Object.entries(this.exitsOf(room)).some(([d, e]) => d !== dir && COMPASS_DIRS.has(baseDir(d)) && this.exitTo(e) === to)) continue;
        seen.add(to);
        const drive = typeof exit === 'object' && exit.drive;
        ways.push(`${dirLabel(dir, drive)} to ${this.rooms[to].name}`);
      }
      let line = ways.length ? `Ways out: ${ways.join(', ')}.` : '';
      const truck = this.state.items.truck;
      if (truck && truck.loc && truck.loc !== room.id && this.rooms[truck.loc] && this.state.flags.read_case_file) {
        const path = this.route(truck.loc);
        line += ` Your truck is parked at ${this.rooms[truck.loc].name}` +
          (path && path.length ? ` (${path.map((d) => dirLabel(d)).join(', then ')}).` : '.');
      }
      return line.trim();
    }

    whereIsTruck() {
      const truck = this.state.items.truck;
      if (this.state.loc === 'truck_cab') { this.print("You're sitting in it."); return false; }
      if (truck.loc === this.state.loc) { this.print("It's parked right here. (GET IN TRUCK to get in.)"); return false; }
      const path = this.route(truck.loc);
      this.print(`Your truck is parked at ${this.rooms[truck.loc].name}.` +
        (path ? ` From here: ${path.map((d) => dirLabel(d)).join(', then ')}. (Or just type WALK TO TRUCK.)` : ''));
      return false;
    }

    // A room's exits, including computed ones (a room's exitsFn, or the world's extraExits, e.g. "in" to a parked truck).
    exitsOf(room) {
      const base = room.exitsFn ? room.exitsFn(this) : room.exits;
      const extra = this.world.extraExits ? this.world.extraExits(this, room) : null;
      return extra ? Object.assign({}, base, extra) : base;
    }

    exitTo(exit) {
      return typeof exit === 'string' ? exit : this.t(exit.to);
    }

    go(dir, quiet) {
      const room = this.rooms[this.state.loc];
      if (this.isDark() && !(room.darkExits || []).includes(dir)) {
        this.print(room.darkMove || 'You stumble around in the dark and get nowhere.');
        return;
      }
      const all = this.exitsOf(room);
      if (!all[dir] && all[`${dir}_drive`]) dir = `${dir}_drive`;
      const exit = all[dir];
      if (!exit && room.exitNotes && room.exitNotes[dir]) {
        // A real road or place that exists but isn't part of the case.
        this.print(this.t(room.exitNotes[dir]));
        return;
      }
      if (!exit) {
        this.print(this.t(room.noExit) || (dir === 'in' || dir === 'out' ? "You're not sure where you're trying to go. Try a compass direction." : "You can't go that way."));
        return;
      }
      const to = this.exitTo(exit);
      if (typeof exit === 'object' && exit.guard) {
        this.passingThrough = !!quiet; // tells a road it's one leg of a longer trip
        const block = exit.guard(this);
        this.passingThrough = false;
        if (block) { this.print(block); return; }
      }
      this.moveTo(to, quiet);
    }

    roomByName(p) {
      return Object.values(this.rooms).find((r) => (r.aliases || []).includes(p) || r.name.toLowerCase() === p);
    }

    goByName(phrase, fallbackDir) {
      const p = clean(phrase);
      if (DIRS[p]) return this.go(DIRS[p]);
      const room = this.rooms[this.state.loc];
      if (room.aliases && room.aliases.includes(p)) { this.print("You're already here."); return; }
      const exits = this.exitsOf(room);
      for (const [dir, exit] of Object.entries(exits)) {
        const dest = this.rooms[this.exitTo(exit)];
        if ((dest.aliases || []).includes(p) || dest.name.toLowerCase() === p) {
          if (this.isDark() && !(room.darkExits || []).includes(dir)) {
            this.print(room.darkMove || 'You stumble around in the dark and get nowhere.');
            return;
          }
          return this.go(dir);
        }
      }
      if (fallbackDir && exits[fallbackDir]) return this.go(fallbackDir);
      // WALK TO TRUCK / GO BACK TO THE TRUCK: find your way to wherever you parked it.
      const truck = this.items.truck;
      if (truck && this.match(p, [truck])) {
        const at = this.state.items.truck.loc;
        if (this.state.loc === 'truck_cab') { this.print("You're sitting in it."); return false; }
        if (at === this.state.loc) { this.print("It's right here. (GET IN TRUCK to get in.)"); return false; }
        const path = this.route(at);
        if (!path) { this.print(`Your truck is parked at ${this.rooms[at].name}, and you can't find a way there from here.`); return false; }
        return this.travel(path);
      }
      // Farther away: if you've been there before, find the way.
      const target = this.roomByName(p);
      if (target) {
        const path = this.route(target.id);
        if (!path) {
          this.print(this.state.visited[target.id] ? "You can't find a way there from here." : "You don't know the way there yet. Explore a little first.");
          return false;
        }
        return this.travel(path);
      }
      this.print("You can't get there directly from here. Use compass directions: NORTH, SOUTH, EAST, WEST (or N, S, E, W).");
      return false;
    }

    // Shortest list of compass moves to a room, through places you've already been.
    // The destination itself may be new, as long as you've seen a way leading to it.
    route(targetId, opts) {
      const steps = this.routeSteps(targetId, opts);
      return steps && steps.map((st) => st.dir);
    }

    // The steps themselves ({dir, to}), minding the truck: a drive only starts from wherever the truck
    // is parked (or with you in it), and the truck only moves when you drive it. opts.anywhere lets the
    // way lead through places you haven't been yet (for hints).
    routeSteps(targetId, opts) {
      const anywhere = opts && opts.anywhere;
      const truck = this.state.items.truck;
      const startTruck = truck ? truck.loc : null;
      const startKey = `${this.state.loc}|${startTruck}`;
      const prev = { [startKey]: null };
      const queue = [[this.state.loc, startTruck]];
      let found = null;
      while (queue.length) {
        const [cur, truckAt] = queue.shift();
        if (cur === targetId) { found = `${cur}|${truckAt}`; break; }
        for (const [dir, exit] of Object.entries(this.exitsOf(this.rooms[cur]))) {
          if (!COMPASS_DIRS.has(baseDir(dir))) continue;
          const to = this.exitTo(exit);
          if (!to || to === 'truck_cab' || !this.rooms[to]) continue;
          if (!anywhere && !this.state.visited[to] && to !== targetId) continue;
          const drive = typeof exit === 'object' && exit.drive;
          if (drive && !(cur === truckAt || cur === 'truck_cab')) continue;
          const nextTruck = drive ? to : truckAt;
          const key = `${to}|${nextTruck}`;
          if (key in prev) continue;
          prev[key] = [`${cur}|${truckAt}`, dir, to];
          queue.push([to, nextTruck]);
        }
      }
      if (!found) return null;
      const steps = [];
      for (let at = found; prev[at]; at = prev[at][0]) steps.unshift({ dir: prev[at][1], to: prev[at][2] });
      return steps;
    }

    // Take several steps in one command; only the last stop gets a full description.
    travel(dirs) {
      for (let i = 0; i < dirs.length; i++) {
        const before = this.state.loc;
        this.go(dirs[i], i < dirs.length - 1);
        if (this.state.loc === before) break;
        // Mid-trip you only pull over and get out if the next leg is on foot.
        if (this.pendingStop) {
          const next = i < dirs.length - 1 ? this.exitsOf(this.rooms[this.state.loc])[dirs[i + 1]] : null;
          if (!(next && typeof next === 'object' && next.drive)) this.print(this.pendingStop, 'travel');
          this.pendingStop = null;
        }
      }
      if (this.pendingStop) { this.print(this.pendingStop, 'travel'); this.pendingStop = null; }
    }

    crossRiver() {
      if (this.state.loc === 'ford') return this.go('east');
      if (this.state.loc === 'cabin') return this.go('west');
      this.print("There's nothing here to cross.");
      return false;
    }

    moveTo(roomId, quiet) {
      this.state.loc = roomId;
      const first = !this.state.visited[roomId];
      this.state.visited[roomId] = true;
      if (first && this.rooms[roomId].map) this.logEvent('place', this.rooms[roomId].name);
      if (quiet) {
        if (!this.isDark()) this.state.lit[roomId] = true;
      } else {
        this.describe('arrive');
      }
      const room = this.rooms[roomId];
      if (room.onEnter && !this.isDark()) room.onEnter(this, first);
    }

    inventory() {
      const ids = this.contentsOf('inv');
      if (!ids.length) { this.print('You are empty-handed.'); return false; }
      const lines = ids.map((id) => {
        const it = this.items[id];
        const st = this.state.items[id];
        let s = '  ' + (it.short || it.name);
        if (st.worn) s += ' (being worn)';
        if (it.switchable && st.on) s += ' (on)';
        return s;
      });
      this.print('You are carrying:\n' + lines.join('\n'));
      return false;
    }

    notes() {
      const leads = this.openLeads().map((l) => '  [ ] ' + l.text);
      const leadText = leads.length ? '\n\nOPEN LEADS\n' + leads.join('\n') : '';
      if (!this.state.found.length) {
        this.print('Your journal is empty. Get to work.' + leadText);
        return false;
      }
      const lines = this.state.found
        .filter((id) => id !== 'solved')
        .map((id, i) => `${i + 1}. ${this.clues[id].title}\n   ${this.clues[id].note}`);
      this.print('CASE JOURNAL — Claim #NM-1187\n\n' + lines.join('\n\n') + leadText, 'journal');
      return false;
    }

    help() {
      this.print([
        "You're an insurance investigator on Prince of Wales Island, Alaska. Type commands in plain English, the old-school way.",
        '',
        'MOVING      NORTH, SOUTH, EAST, WEST (or N, S, E, W), UP, DOWN, IN, OUT',
        'LOOKING     LOOK (L), EXAMINE thing (X thing), READ thing, SEARCH thing',
        '            Places you return to get a short description; LOOK shows it all.',
        '            VERBOSE always shows the full one, BRIEF goes back to short.',
        'THINGS      TAKE, DROP, OPEN, CLOSE, UNLOCK, WEAR, REMOVE,',
        '            TURN ON / TURN OFF, ENTER code, INVENTORY (I)',
        'SENSES      LISTEN, SMELL, TOUCH thing, SIT (on thing), KNOCK',
        'DRIVING     GET IN TRUCK, GET OUT, DRIVE TO a place you\'ve been',
        'PEOPLE      TALK TO person, ASK person ABOUT topic,',
        '            SHOW thing TO person, GIVE thing TO person',
        "            THANK person (or GUNALCHÉESH in Tlingit, HÁW'AA in Haida)",
        'THE CASE    NOTES (your journal), SCORE, HINT,',
        '            ACCUSE person (at the State Troopers post)',
        'GAME        MAP (your graph-paper map), NOTEBOOK (progress, leads, evidence),',
        '            NOTES (the same, in text), SAVE, LOAD, RESTART',
        '            The game autosaves after every move. SAVE keeps a separate bookmark.',
        'TESTING     BUG and a note (BUG the sign is misspelled) saves it with where you are;',
        '            BUGS lists them, BUGS COPY copies them all, CLEAR BUGS empties the list',
        '',
        'You can chain commands with periods: TAKE PHOTO. READ IT.',
        'Press the up and down arrow keys to recall earlier commands.'
      ].join('\n'), 'help');
      return false;
    }

    // Shared logic: if an item defines a custom handler for this verb, run it.
    runHandler(it, verb, ...args) {
      const h = it.verbs && it.verbs[verb];
      if (!h) return false;
      const r = typeof h === 'function' ? h(this, ...args) : h;
      if (typeof r === 'string') { this.print(r); return true; }
      return r === true;
    }

    examine(phrase) {
      if (/^(around|room|here|area)$/.test(clean(phrase))) return this.describe(true);
      if (/^(me|myself|self)$/.test(clean(phrase))) {
        this.print(this.isWorn('waders') ? 'Damp investigator, chest waders, a look of grim purpose.' : 'Damp investigator. Sensible shoes, for a city.');
        return;
      }
      const e = this.find(phrase);
      if (!e) return;
      if (e.kind === 'npc') { this.print(this.t(e.desc)); return; }
      if (this.runHandler(e, 'examine')) return;
      this.print(this.t(e.desc) || `You see nothing special about the ${e.name}.`);
      const st = this.state.items[e.id];
      if (e.container && st.open) this.print(this.contentsLine(e.id));
      if (e.onExamine) e.onExamine(this);
    }

    read(phrase) {
      const p = clean(phrase);
      if (p === 'it' && this.lastItem) phrase = this.lastItem;
      const e = this.find(phrase);
      if (!e) return;
      if (e.kind === 'npc') { this.print(`${e.name} is hard to read.`); return; }
      if (this.runHandler(e, 'read')) return;
      if (!e.text) {
        this.print(`There's nothing to read on the ${e.name}.`);
        return;
      }
      this.print(this.t(e.text), 'document');
      if (e.onRead) e.onRead(this);
      if (e.onExamine) e.onExamine(this);
    }

    take(phrase) {
      const e = this.find(phrase);
      if (!e) return;
      if (e.kind === 'npc') { this.print(`I don't think ${e.name} would appreciate that.`); return; }
      if (this.runHandler(e, 'take')) return;
      if (this.inInv(e.id)) { this.print('You already have that.'); return; }
      if (e.fixed) { this.print(this.t(e.fixedMsg) || "That's not going anywhere."); return; }
      this.moveItem(e.id, 'inv');
      this.lastItem = e.names[0];
      this.print('Taken.');
      if (e.onTake) e.onTake(this);
    }

    takeAll() {
      const loose = this.visibleItems().filter((it) => !it.fixed && !this.inInv(it.id));
      if (!loose.length) { this.print("There's nothing here you can take."); return; }
      for (const it of loose) {
        this.moveItem(it.id, 'inv');
        this.print(`${capitalize(it.name)}: Taken.`);
        if (it.onTake) it.onTake(this);
      }
    }

    drop(phrase) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      if (!this.inInv(e.id)) { this.print("You're not carrying that."); return; }
      if (this.runHandler(e, 'drop')) return;
      if (this.state.items[e.id].worn) { this.print("You'll have to take them off first."); return; }
      if (e.id === 'case_file' || e.id === 'badge') { this.print("Your supervisor would have words. You hang on to it."); return; }
      this.moveItem(e.id, this.state.loc);
      this.print('Dropped.');
    }

    wear(phrase) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      if (this.runHandler(e, 'wear')) return;
      if (!e.wearable) { this.print("That's not something you can wear."); return; }
      const st = this.state.items[e.id];
      if (st.worn) { this.print("You're already wearing them."); return; }
      if (!this.inInv(e.id)) {
        if (e.fixed) { this.print("You can't."); return; }
        this.moveItem(e.id, 'inv');
        this.print(`(first taking the ${e.name})`);
      }
      st.worn = true;
      this.print(`You wrestle your way into the ${e.name} and cinch the belt. You are now dressed for the river and nowhere else.`);
    }

    remove(phrase) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      const st = this.state.items[e.id];
      if (!st.worn) { this.print("You're not wearing that."); return; }
      st.worn = false;
      this.print(`You peel off the ${e.name}.`);
    }

    switchItem(phrase, on) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      if (this.runHandler(e, on ? 'turnon' : 'turnoff')) return;
      if (!e.switchable) { this.print("That's not something you can switch on or off."); return; }
      const st = this.state.items[e.id];
      if (st.on === on) { this.print(`It's already ${on ? 'on' : 'off'}.`); return; }
      if (!this.inInv(e.id)) {
        this.moveItem(e.id, 'inv');
        this.print(`(first taking the ${e.name})`);
      }
      const wasDark = this.isDark();
      st.on = on;
      this.print(on ? `The ${e.name} is now on. A good strong beam.` : `The ${e.name} is now off.`);
      if (wasDark && !this.isDark()) this.describe(true);
      else if (!wasDark && this.isDark()) this.describe(true);
    }

    doVerb(verb, phraseOrId) {
      // World code may pass an item id; players' words always go through scope.
      const direct = this.items[phraseOrId];
      const e = direct && this.visibleItems().includes(direct) ? direct : this.find(phraseOrId, { npcs: false });
      if (!e) return;
      if (this.runHandler(e, verb)) return true;
      const st = this.state.items[e.id];
      if (verb === 'open') {
        if (!e.openable) { this.print(`The ${e.name} isn't something you can open.`); return true; }
        if (st.open) { this.print("It's already open."); return true; }
        if (st.locked) { this.print(this.t(e.lockedMsg) || "It's locked."); return true; }
        st.open = true;
        const inside = this.contentsOf(e.id);
        this.print(inside.length
          ? `You open the ${e.name}. Inside you find ${listJoin(inside.map((id) => this.items[id].short || this.items[id].name))}.`
          : `You open the ${e.name}. It's empty.`);
        return true;
      }
      if (verb === 'close') {
        if (!e.openable) { this.print(`The ${e.name} isn't something you can close.`); return true; }
        if (!st.open) { this.print("It's already closed."); return true; }
        st.open = false;
        this.print('Closed.');
        return true;
      }
      return true;
    }

    unlock(phrase) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      if (this.runHandler(e, 'unlock')) return;
      if (!this.state.items[e.id].locked) { this.print("It isn't locked."); return; }
      this.print("You don't have anything that would unlock it.");
    }

    dial(nums) {
      const room = this.rooms[this.state.loc];
      if (!room.dial) { this.print("There's nothing here with a keypad or a dial."); return; }
      const r = room.dial(this, nums);
      if (typeof r === 'string') this.print(r);
    }

    talk(phrase) {
      const p = clean(phrase);
      if (/^(me|myself|self)$/.test(p)) { this.print('You mutter to yourself. Your self agrees this case stinks.'); return; }
      const e = this.find(phrase);
      if (!e) return;
      if (e.kind !== 'npc') { this.print(`You talk to the ${e.name}. It's a good listener.`); return; }
      this.meet(e);
      this.print(this.varied(`${e.id}_talk`, this.t(e.talk)), 'speech');
    }

    // THANK WALT, or GUNALCHEESH / HAWAA, Tlingit and Haida for thank you. Each person can answer in their own way.
    thank(phrase, word) {
      let npc;
      if (phrase) {
        npc = this.find(phrase, { items: false });
        if (!npc) return;
      } else {
        const here = this.visibleNpcs();
        if (!here.length) { this.print('You say it to the trees. The trees, being polite, say nothing back.'); return; }
        if (here.length > 1) {
          this.print(`Thank whom? ${listJoin(here.map((n) => n.name))} are here.`);
          this.pendingAnswer = { template: `${word} %` };
          return false;
        }
        npc = here[0];
      }
      this.meet(npc);
      const lang = /gunalcheesh/.test(word) ? 'tlingit' : /^haw ?aa/.test(word) ? 'haida' : null;
      const r = typeof npc.thanks === 'function' ? npc.thanks(this, lang) : npc.thanks;
      this.print(r || `${npc.name} nods. 'Sure thing.'`, 'speech');
    }

    talkToOnly() {
      const here = this.visibleNpcs();
      if (here.length === 1) return this.talk(here[0].names[0]);
      if (!here.length) { this.print("There's no one here to talk to."); return false; }
      this.print(`Talk to whom? ${listJoin(here.map((n) => n.name))} ${here.length > 1 ? 'are' : 'is'} here.`);
      this.pendingAnswer = { template: 'talk to %' };
      return false;
    }

    ask(personPhrase, topicPhrase) {
      const npc = this.find(personPhrase, { items: false });
      if (!npc) return;
      if (npc.kind === 'npc') this.meet(npc);
      const topic = ` ${clean(topicPhrase.replace(/'s\b/g, '').replace(/[?!.,']/g, ''))} `;
      (npc.topics || []).forEach((entry, i) => {
        if (this.answered) return;
        // A key matches a whole word or phrase anywhere in the question.
        if (entry.k.some((k) => topic.includes(` ${k} `))) {
          this.answered = true;
          this.print(this.varied(`${npc.id}_topic_${i}`, this.t(entry.r)), 'speech');
        }
      });
      if (this.answered) { this.answered = false; return; }
      this.print(this.varied(`${npc.id}_default`, this.t(npc.askDefault)) || `${npc.name} doesn't have much to say about that.`, 'speech');
    }

    // A question for whoever is here: the one person, or ask which one.
    askHere(topicPhrase) {
      const here = this.visibleNpcs();
      if (here.length === 1) return this.ask(here[0].names[0], topicPhrase);
      if (!here.length) { this.print("There's nobody here to ask. The rain has no comment."); return false; }
      this.print(`Ask whom? ${listJoin(here.map((n) => n.name))} are here.`);
      this.pendingAnswer = { template: `ask % about ${topicPhrase}` };
      return false;
    }

    // "ask joe what happened to dale": the longest run of opening words that names someone here, and the rest.
    npcAndRest(phrase) {
      const words = phrase.split(' ');
      const here = this.visibleNpcs();
      for (let i = words.length - 1; i >= 1; i--) {
        const head = words.slice(0, i).join(' ');
        const npc = here.find((n) => n.names.includes(head));
        if (npc) return { name: head, rest: words.slice(i).join(' ').replace(/^(?:for|if|whether|to tell me|to)\s+/, '') };
      }
      return null;
    }

    // A line that can come in several versions (an array) is said in turn, so repeats don't sound canned.
    varied(key, said) {
      if (!Array.isArray(said)) return said;
      const n = this.state.flags[`said_${key}`] || 0;
      this.state.flags[`said_${key}`] = n + 1;
      return said[n % said.length];
    }

    showGive(verb, rest) {
      let itemPhrase;
      let npcPhrase;
      const m = rest.match(/^(.+?) to (.+)$/);
      if (m) {
        itemPhrase = m[1];
        npcPhrase = m[2];
      } else {
        // "show reyes the napkin" / "give cal beer"
        const here = this.visibleNpcs();
        const words = rest.split(' ');
        for (let i = 1; i < words.length; i++) {
          const head = words.slice(0, i).join(' ');
          const npc = this.match(head, here);
          if (npc && !npc.ambiguous) { npcPhrase = head; itemPhrase = words.slice(i).join(' '); break; }
        }
        if (!npcPhrase) {
          const people = this.visibleNpcs();
          if (people.length === 1) { npcPhrase = people[0].names[0]; itemPhrase = rest; }
          else {
            this.print(`${capitalize(verb)} it to whom?`);
            this.pendingAnswer = { template: `${verb} ${rest} to %` };
            return false;
          }
        }
      }
      const it = this.find(itemPhrase, { npcs: false });
      if (!it) return;
      if (!this.inInv(it.id)) { this.print(`You'd need to be holding the ${it.name} first.`); return; }
      const npc = this.find(npcPhrase, { items: false });
      if (!npc) return;
      if (npc.kind !== 'npc') { this.print("That isn't a person."); return; }
      this.meet(npc);
      if (verb === 'give' && npc.give && npc.give[it.id]) { this.print(this.t(npc.give[it.id]), 'speech'); return; }
      const resp = npc.show && npc.show[it.id];
      if (resp) {
        this.print(this.t(resp), 'speech');
        if (verb === 'give') this.print('You take it back.');
        return;
      }
      this.print(`${npc.name} glances at the ${it.name}${verb === 'give' ? ' and hands it back' : ''}. ${['No reaction.', 'Nothing.', 'A shrug.'][this.state.turns % 3]}`);
    }

    accuse(phrase) {
      const room = this.rooms[this.state.loc];
      if (!room.accuse) {
        this.print("You can't arrest anyone yourself. You're an insurance investigator, not a cop. Take it to Sgt. Reyes at the State Troopers post in Klawock and ACCUSE there.");
        return false;
      }
      const r = room.accuse(this, clean(phrase));
      if (typeof r === 'string') this.print(r, 'speech');
    }

    buy(phrase) {
      const room = this.rooms[this.state.loc];
      if (!room.buy) { this.print("There's nothing for sale here."); return; }
      this.print(this.t(room.buy(this, clean(phrase))));
    }

    use(phrase) {
      const e = this.find(phrase, { npcs: false });
      if (!e) return;
      if (this.runHandler(e, 'use')) return;
      if (e.switchable) return this.switchItem(phrase, !this.state.items[e.id].on);
      if (e.wearable) return this.wear(phrase);
      if (e.id === 'office_key' && this.state.loc === 'lodge') return this.unlock('door');
      if (e.text) return this.read(phrase);
      this.print(`You'll need to be more specific about how you want to use the ${e.name}.`);
    }

    itemVerb(verb, phrase, fallback) {
      const e = this.find(phrase);
      if (!e) return;
      if (e.kind === 'item' && this.runHandler(e, verb)) return;
      if (e.kind === 'npc' && e[verb]) { this.print(this.t(e[verb])); return; }
      this.print(fallback);
    }

    // Senses and postures: with no object, the room answers; with one, the thing does.
    sense(verb, phrase, roomFallback, itemFallback) {
      const room = this.rooms[this.state.loc];
      if (!phrase || /^(around|here|room|air|down)$/.test(clean(phrase))) {
        this.print(this.t(room[verb]) || roomFallback);
        return;
      }
      return this.itemVerb(verb, phrase, itemFallback);
    }

    // ENTER X: things you can get into (a truck) first, then places.
    enter(phrase) {
      const scope = [].concat(this.visibleItems(), this.visibleNpcs());
      const e = this.match(phrase, scope);
      if (e && !e.ambiguous && e.kind === 'item' && e.verbs && e.verbs.enter) {
        this.runHandler(e, 'enter');
        return;
      }
      // GET IN TRUCK when the truck is parked somewhere else.
      const truck = this.items.truck;
      if (truck && !scope.includes(truck) && this.match(phrase, [truck]) && this.state.loc !== 'truck_cab') {
        const at = this.rooms[this.state.items.truck.loc];
        this.print(at ? `Your truck is parked back at ${at.name}.` : "Your truck isn't here.");
        return false;
      }
      return this.goByName(phrase, 'in');
    }

    row() {
      const room = this.rooms[this.state.loc];
      if (!room.row) { this.print("There's nothing here to row."); return false; }
      const r = room.row(this);
      if (typeof r === 'string') this.print(r);
    }

    fish() {
      const room = this.rooms[this.state.loc];
      this.print(room.fish ? this.t(room.fish) : "You don't have a rod, and you're on the clock. Two good reasons, and you hate both of them.");
    }

    // ------------------------------------------------------------ save / load
    save() {
      const ok = this.storage.set(SAVE_KEY, JSON.stringify(this.state));
      this.print(ok === false ? "Couldn't save. Your browser may be blocking storage." : 'Game saved.', 'meta');
      return false;
    }

    load() {
      let raw = null;
      try { raw = this.storage.get(SAVE_KEY); } catch (e) { raw = null; }
      if (!raw) {
        const old = OLD_SAVE_KEYS.some((k) => { try { return !!this.storage.get(k); } catch (e) { return false; } });
        this.print(old ? 'Your saved game is from an older version of the island and won\'t load in this one. Sorry! Start fresh and SAVE again.' : 'No saved game found.', 'meta');
        return false;
      }
      let saved;
      try { saved = JSON.parse(raw); } catch (e) { this.print('That save file is corrupted.', 'meta'); return false; }
      this.restoreState(saved);
      this.print('Game restored.', 'meta');
      this.describe(true);
      return false;
    }

    // Rebuild a game from saved state (a SAVE, or the autosave).
    restoreState(saved) {
      this.newGame();
      // Merge so saves keep working if new items get added to the world later.
      for (const id of Object.keys(saved.items || {})) {
        if (this.state.items[id]) this.state.items[id] = saved.items[id];
      }
      const { items, ...rest } = saved;
      Object.assign(this.state, rest);
      // Saves from before the map existed: treat every visited room as seen.
      if (!saved.lit) this.state.lit = Object.assign({}, this.state.visited);
      // Saves from before the notebook: start its log fresh and work out the leads from the evidence.
      if (!saved.log) this.state.log = [];
      if (!saved.met) this.state.met = {};
      if (!saved.leads) this.state.leads = {};
      this.updateLeads(true);
    }

    autosave() {
      try { this.storage.set(AUTO_KEY, JSON.stringify({ savedAt: Date.now(), state: this.state })); } catch (e) { /* storage full or blocked */ }
    }

    readAutosave() {
      try {
        const data = JSON.parse(this.storage.get(AUTO_KEY));
        return data && data.state && data.state.items ? data : null;
      } catch (e) {
        return null;
      }
    }

    // What the start screen shows about the case in progress, or null if there isn't one.
    autosaveInfo() {
      const data = this.readAutosave();
      if (!data || data.state.over || !data.state.turns) return null;
      const room = this.rooms[data.state.loc];
      return {
        savedAt: data.savedAt,
        turns: data.state.turns,
        score: data.state.score,
        maxScore: this.world.maxScore,
        location: room ? room.name : '',
        evidence: (data.state.found || []).filter((id) => id !== 'solved').length
      };
    }

    // Pick up the autosaved case where you left it.
    continueGame() {
      const data = this.readAutosave();
      if (!data) return this.start();
      this.restoreState(data.state);
      const open = this.openLeads().length;
      this.print(`Back on the case. Score ${this.state.score} of ${this.world.maxScore}, turn ${this.state.turns}${open ? `, ${open} open lead${open === 1 ? '' : 's'} in your notebook` : ''}.`, 'meta');
      this.describe(true);
      return this.flush();
    }

    restart() {
      this.newGame();
      this.print('You start the case over from the ferry dock.', 'meta');
      this.print(this.world.intro, 'intro');
      this.describe(true);
      return false;
    }
  }

  root.NSH = root.NSH || {};
  root.NSH.Game = Game;
  if (typeof module === 'object' && module.exports) module.exports = { Game };
})(typeof window !== 'undefined' ? window : globalThis);
