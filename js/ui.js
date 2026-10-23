/*
 * No Safe Harbor: browser front end.
 * Wires the engine to the page: prints output, reads commands,
 * keeps command history, the status bar and the color theme.
 */
(function () {
  'use strict';

  const out = document.getElementById('output');
  const form = document.getElementById('cmd-form');
  const input = document.getElementById('cmd');
  const statusLoc = document.getElementById('status-loc');
  const statusScore = document.getElementById('status-score');
  const statusTurns = document.getElementById('status-turns');
  const themeBtn = document.getElementById('theme-toggle');
  const mapPanel = document.getElementById('map-panel');
  const mapScroll = document.getElementById('map-scroll');
  const mapWhere = document.getElementById('map-where');
  const mapToggle = document.getElementById('map-toggle');
  const nbPanel = document.getElementById('notebook-panel');
  const nbBody = document.getElementById('notebook-body');
  const nbToggle = document.getElementById('notebook-toggle');

  // localStorage can throw (private mode, blocked storage), so wrap it.
  // The development copy lives at /dev/ on the same site, so it keeps its own saves.
  const isDev = /\/dev(\/|$)/.test(window.location.pathname);
  const keyOf = (k) => (isDev ? 'dev:' + k : k);
  const storage = {
    get(k) { try { return window.localStorage.getItem(keyOf(k)); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(keyOf(k), v); return true; } catch (e) { return false; } }
  };
  if (isDev) {
    document.documentElement.classList.add('is-dev');
    document.title = 'DEV · ' + document.title;
  }

  // Where the page is running, attached to each BUG note.
  const bugContext = () => ({
    site: isDev ? 'dev' : 'production',
    screen: `${window.innerWidth}x${window.innerHeight}`,
    theme: (document.getElementById('theme-toggle') || {}).textContent || ''
  });
  const game = new window.NSH.Game(window.NSH.buildWorld, { storage, context: bugContext });

  // On phones and tablets, focusing the input pops up the on-screen keyboard and hides half the
  // game, so only do it for you on a computer. On a touchscreen you tap the input when you're ready.
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function focusInput() {
    if (!touch) input.focus();
  }
  if (touch) input.placeholder = 'Tap here to type a command';

  // Fit the game to the part of the screen you can actually see. On a phone the keyboard covers
  // the bottom of the page; keep the status bar, the story and the input all on screen above it.
  const appEl = document.getElementById('app');
  function fitViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    appEl.style.setProperty('--app-h', vv.height + 'px');
    appEl.style.setProperty('--app-top', vv.offsetTop + 'px');
    out.scrollTop = out.scrollHeight;
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
    fitViewport();
  }
  const history = [];
  let histPos = 0;

  // The transcript is saved with the autosave, so CONTINUE brings back what was on screen.
  const TRANSCRIPT_KEY = 'nosafeharbor-transcript-v2';
  const TRANSCRIPT_KEEP = 200;
  let transcript = [];

  // BUGS COPY: put the bug notes on the clipboard (with an old-browser fallback).
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  function addLine(text, cls, fresh) {
    const p = document.createElement('p');
    p.className = fresh ? cls + ' new' : cls;
    p.textContent = text;
    out.appendChild(p);
    transcript.push({ text, cls });
    return p;
  }

  // Show the newest reply from its start: if it's taller than the screen (a long room description
  // on a phone), line its first line up with the top, so you read down instead of landing mid-way.
  function scrollToReply(first) {
    const top = first ? first.offsetTop - out.offsetTop : 0;
    if (first && out.scrollHeight - top > out.clientHeight) {
      out.scrollTop = top - 8;
    } else {
      out.scrollTop = out.scrollHeight;
    }
  }

  function saveTranscript() {
    if (transcript.length > TRANSCRIPT_KEEP) transcript = transcript.slice(-TRANSCRIPT_KEEP);
    storage.set(TRANSCRIPT_KEY, JSON.stringify(transcript));
  }

  function render(blocks, first) {
    for (const b of blocks) {
      if (b.cls === 'event') {
        if (b.event === 'map') toggleMap();
        if (b.event === 'notebook') toggleNotebook();
        if (b.event === 'copy') copyText(b.payload);
        continue;
      }
      const p = addLine(b.text, b.cls, true);
      if (!first) first = p;
    }
    saveTranscript();
    scrollToReply(first);
    updateStatus();
    if (!mapPanel.hidden) drawMap();
    if (!nbPanel.hidden) drawNotebook();
    updateNotebookBadge();
  }

  // ---- the field map
  // The SVG is the whole sheet; the viewBox picks which part shows. Until you pan or zoom,
  // the map frames itself around where you've been ("follow" mode). FIT goes back to that.
  let mapViewBox = null;
  let followMe = true;

  // How much of the panel's width the open key covers, so Fit can keep things out from under it.
  function keyFrac() {
    const key = document.getElementById('map-legend');
    const body = document.getElementById('map-legend-body');
    if (!key || !body || body.hidden || !mapScroll.clientWidth) return 0;
    return (key.offsetWidth + 16) / mapScroll.clientWidth;
  }

  function panelAspect() {
    return Math.max(0.3, mapScroll.clientWidth / Math.max(1, mapScroll.clientHeight));
  }

  // shownBox is the viewBox the layers are actually drawn at. While you drag or spin the wheel, the
  // drawn map just slides and scales (cheap), and it's redrawn at the new view once you stop.
  let shownBox = null;
  let commitTimer = null;

  function applyView() {
    if (!mapViewBox) return;
    clearTimeout(commitTimer);
    mapScroll.classList.remove('moving');
    // Zoomed out, names and the pin grow so they stay readable, and the small print steps aside.
    const s = Math.max(mapViewBox[2] / (mapScroll.clientWidth || 1), mapViewBox[3] / (mapScroll.clientHeight || 1));
    for (const svg of mapScroll.querySelectorAll('svg')) {
      svg.style.transform = '';
      svg.setAttribute('viewBox', mapViewBox.join(' '));
      // --k keeps names and the pin a steady size on screen; --px is one screen pixel in map units.
      svg.style.setProperty('--k', Math.min(5, Math.max(0.02, s / 1.4)).toFixed(4));
      svg.style.setProperty('--px', s.toFixed(4));
      svg.classList.toggle('far', s > 2.2);
      // Zoomed in close: the towns' street maps come out.
      svg.classList.toggle('near', s < 0.45);
    }
    if (s < 0.45) fitStreetNames(s);
    // Water hatching: about 9 screen pixels between lines at every zoom.
    const hatch = mapScroll.querySelector('#map-water');
    if (hatch) {
      const gap = (9 * s).toFixed(3);
      hatch.setAttribute('width', gap);
      hatch.setAttribute('height', gap);
      hatch.firstElementChild.setAttribute('y2', gap);
    }
    shownBox = mapViewBox.slice();
    updateScale();
  }

  // A street keeps its name only if the street is long enough on screen to hold it and the name
  // won't run into one already placed. Names come longest street first, so main streets win.
  function fitStreetNames(s) {
    const placed = [];
    for (const g of mapScroll.querySelectorAll('.map-street-name')) {
      const name = g.textContent;
      const w = name.length * 6 + 10; // screen px, at the 11px label size
      const h = 14;
      const len = Number(g.dataset.len) / s;
      let show = len >= w;
      if (show) {
        // Screen-space box around the turned name.
        const a = Number(g.dataset.a) * Math.PI / 180;
        const cx = Number(g.dataset.x) / s;
        const cy = Number(g.dataset.y) / s;
        const hw = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2;
        const hh = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * h) / 2;
        const box = [cx - hw, cy - hh, cx + hw, cy + hh];
        show = !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
        if (show) placed.push(box);
      }
      g.style.display = show ? '' : 'none';
    }
  }

  // How a viewBox lands on screen: sheet units per pixel, and the letterbox offsets.
  function screenFit(box) {
    const rw = mapScroll.clientWidth || 1;
    const rh = mapScroll.clientHeight || 1;
    const s = Math.max(box[2] / rw, box[3] / rh);
    return { s, ox: (rw - box[2] / s) / 2, oy: (rh - box[3] / s) / 2 };
  }

  // Show mapViewBox by moving the already-drawn layers, then redraw properly after a pause.
  function previewView(delay) {
    if (!shownBox) { applyView(); return; }
    const A = screenFit(shownBox);
    const B = screenFit(mapViewBox);
    const a = A.s / B.s;
    const bx = (shownBox[0] - mapViewBox[0] - A.ox * A.s) / B.s + B.ox;
    const by = (shownBox[1] - mapViewBox[1] - A.oy * A.s) / B.s + B.oy;
    mapScroll.classList.add('moving');
    for (const svg of mapScroll.querySelectorAll('svg')) svg.style.transform = `translate(${bx}px, ${by}px) scale(${a})`;
    updateScale();
    clearTimeout(commitTimer);
    if (delay !== undefined) commitTimer = setTimeout(applyView, delay);
  }

  // The scale bar follows the zoom: pick a round distance that draws 60 to 150 pixels long.
  const scaleBar = document.getElementById('map-scale-bar');
  const scaleText = document.getElementById('map-scale-text');
  function updateScale() {
    if (!mapViewBox || !mapScroll.clientWidth) return;
    const s = Math.max(mapViewBox[2] / mapScroll.clientWidth, mapViewBox[3] / mapScroll.clientHeight);
    const pxPerKm = window.NSH.geo.view.pxPerKm / s;
    const km = [0.5, 1, 2, 5, 10, 20, 50].find((k) => k * pxPerKm >= 60) || 50;
    scaleBar.style.width = Math.round(km * pxPerKm) + 'px';
    scaleText.textContent = `${km} km (${(km * 0.621).toFixed(km < 2 ? 1 : 0)} mi)`;
  }

  const legendToggle = document.getElementById('map-legend-toggle');
  const legendBody = document.getElementById('map-legend-body');
  function setLegend(open) {
    legendBody.hidden = !open;
    legendToggle.setAttribute('aria-expanded', String(open));
    legendToggle.textContent = open ? 'Key ▾' : 'Key ▸';
    storage.set('nosafeharbor-map-key', open ? 'open' : 'closed');
  }
  // Open by default on a big screen; folded up on a phone, where it would cover too much map.
  const keyPref = storage.get('nosafeharbor-map-key');
  setLegend(keyPref ? keyPref === 'open' : window.innerWidth >= 700);
  legendToggle.addEventListener('click', () => { setLegend(legendBody.hidden); focusInput(); });

  // Two stacked layers: the printed sheet (drawn once) and your pencil work (redrawn every move).
  function drawMap() {
    if (!mapScroll.querySelector('.map-sheet')) mapScroll.innerHTML = window.NSH.renderSheet(game);
    const old = mapScroll.querySelector('.map-pencil-layer');
    if (old) old.remove();
    mapScroll.insertAdjacentHTML('beforeend', window.NSH.renderPencil(game));
    mapWhere.textContent = '';
    mapWhere.append('You are here: ');
    const strong = document.createElement('strong');
    strong.textContent = game.status().location;
    mapWhere.append(strong);
    const pencil = mapScroll.querySelector('.map-pencil-layer');
    if (pencil && pencil.dataset.explored) mapWhere.append(` · ${pencil.dataset.explored}`);
    if (followMe || !mapViewBox) mapViewBox = window.NSH.mapView(game, panelAspect(), keyFrac());
    applyView();
  }

  // Zoom by a factor around a point on the sheet (defaults to the middle of the view).
  function zoomBy(f, cx, cy, smooth) {
    const [x, y, w, h] = mapViewBox;
    const whole = window.NSH.wholeView(panelAspect());
    const nw = Math.min(Math.max(w * f, 30), whole[2]); // close enough to read a town's street names
    const k = nw / w;
    const px = cx === undefined ? x + w / 2 : cx;
    const py = cy === undefined ? y + h / 2 : cy;
    mapViewBox = [px - (px - x) * k, py - (py - y) * k, nw, h * k];
    followMe = false;
    if (smooth) previewView(150); else applyView();
  }

  document.getElementById('map-tools').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    const z = btn.dataset.zoom;
    if (z === 'in') zoomBy(1 / 1.5);
    else if (z === 'out') zoomBy(1.5);
    else if (z === 'fit') { followMe = true; mapViewBox = window.NSH.mapView(game, panelAspect(), keyFrac()); applyView(); }
    else if (z === 'all') { followMe = false; mapViewBox = window.NSH.wholeView(panelAspect()); applyView(); }
    focusInput();
  });

  // Scroll to zoom around the pointer; drag to pan.
  function sheetPoint(clientX, clientY) {
    const r = mapScroll.getBoundingClientRect();
    const [x, y, w, h] = mapViewBox;
    const s = Math.max(w / r.width, h / r.height); // the SVG letterboxes ("meet"), so use the larger scale
    const ox = (r.width - w / s) / 2;
    const oy = (r.height - h / s) / 2;
    return [x + (clientX - r.left - ox) * s, y + (clientY - r.top - oy) * s, s];
  }

  // Zoom in proportion to how far the wheel turned: about 12% per notch, however the browser
  // splits a notch into events (Edge and Chrome on Windows send several small ones).
  mapScroll.addEventListener('wheel', (e) => {
    if (!mapViewBox) return;
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dy = Math.max(-300, Math.min(300, e.deltaY * lines));
    const [px, py] = sheetPoint(e.clientX, e.clientY);
    zoomBy(Math.exp(dy * 0.0012), px, py, true);
  }, { passive: false });

  // One finger (or the mouse) drags; two fingers pinch to zoom and pan together.
  let drag = null;
  let pinch = null;
  const fingers = new Map();
  const pairOf = () => {
    const [a, b] = [...fingers.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };
  function startDrag(x, y) {
    drag = { x, y, box: mapViewBox.slice(), scale: sheetPoint(x, y)[2] };
  }
  function startPinch() {
    const p = pairOf();
    const [sx, sy] = sheetPoint(p.mx, p.my);
    pinch = { d: p.d, sx, sy, box: mapViewBox.slice() };
    drag = null;
  }
  mapScroll.addEventListener('pointerdown', (e) => {
    if (!mapViewBox) return;
    e.preventDefault(); // no text selection while dragging the map
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mapScroll.setPointerCapture(e.pointerId);
    mapScroll.classList.add('dragging');
    if (fingers.size === 2) startPinch();
    else if (fingers.size === 1) startDrag(e.clientX, e.clientY);
  });
  mapScroll.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size >= 2) {
      // Scale by how far the fingers spread, and keep the spot that was between them under them.
      const p = pairOf();
      const whole = window.NSH.wholeView(panelAspect());
      const nw = Math.min(Math.max(pinch.box[2] * pinch.d / p.d, 30), whole[2]);
      const k = nw / pinch.box[2];
      const nh = pinch.box[3] * k;
      const r = mapScroll.getBoundingClientRect();
      const s = Math.max(nw / r.width, nh / r.height);
      const ox = (r.width - nw / s) / 2;
      const oy = (r.height - nh / s) / 2;
      mapViewBox = [pinch.sx - (p.mx - r.left - ox) * s, pinch.sy - (p.my - r.top - oy) * s, nw, nh];
      followMe = false;
    } else if (drag) {
      const dx = (e.clientX - drag.x) * drag.scale;
      const dy = (e.clientY - drag.y) * drag.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) followMe = false;
      mapViewBox = [drag.box[0] - dx, drag.box[1] - dy, drag.box[2], drag.box[3]];
    } else return;
    // Move the drawn map at most once a frame, however fast the pointer reports.
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; if (drag || pinch) previewView(); });
  });
  let dragFrame = 0;
  const endDrag = (e) => {
    if (!fingers.delete(e.pointerId)) return;
    if (pinch && fingers.size === 1) {
      // Lifting one finger of a pinch: carry on dragging with the other.
      pinch = null;
      const [f] = fingers.values();
      startDrag(f.x, f.y);
      return;
    }
    if (fingers.size) return;
    if (drag || pinch) applyView();
    drag = null;
    pinch = null;
    mapScroll.classList.remove('dragging');
  };
  mapScroll.addEventListener('pointerup', endDrag);
  mapScroll.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { if (!mapPanel.hidden && followMe) drawMap(); });

  function toggleMap(force) {
    const open = force === undefined ? mapPanel.hidden : force;
    if (open) toggleNotebook(false);
    mapPanel.hidden = !open;
    mapToggle.setAttribute('aria-pressed', String(open));
    if (open) { followMe = true; drawMap(); }
    rememberSide();
    focusInput();
  }

  // On a wide screen the map or notebook docks beside the story. Remember which one you had open
  // (or that you closed both), and bring it back next time.
  const wideScreen = () => !!(window.matchMedia && window.matchMedia('(min-width: 1200px)').matches);
  function rememberSide() {
    if (!wideScreen() || !document.getElementById('start-screen').hidden) return;
    storage.set('nosafeharbor-side', !mapPanel.hidden ? 'map' : !nbPanel.hidden ? 'notebook' : 'none');
    out.scrollTop = out.scrollHeight;
  }
  function restoreSide() {
    if (!wideScreen()) return;
    const side = storage.get('nosafeharbor-side') || 'map';
    if (side === 'map') toggleMap(true);
    else if (side === 'notebook') toggleNotebook(true);
  }

  // ---- the case notebook
  // The button shows how many entries you haven't looked at yet.
  let nbSeen = 0;
  const logLength = () => (game.state.log || []).length;

  function drawNotebook() {
    const top = nbBody.scrollTop;
    nbBody.innerHTML = window.NSH.renderNotebook(game);
    nbBody.scrollTop = top;
    nbSeen = logLength();
  }

  function updateNotebookBadge() {
    if (nbSeen > logLength()) nbSeen = logLength(); // after a restart or a load
    const fresh = nbPanel.hidden ? logLength() - nbSeen : 0;
    nbToggle.textContent = fresh > 0 ? `Notebook (${fresh} new)` : 'Notebook';
    nbToggle.classList.toggle('has-new', fresh > 0);
  }

  function toggleNotebook(force) {
    const open = force === undefined ? nbPanel.hidden : force;
    if (open === !nbPanel.hidden) return;
    if (open) toggleMap(false);
    nbPanel.hidden = !open;
    nbToggle.setAttribute('aria-pressed', String(open));
    if (open) { drawNotebook(); nbBody.scrollTop = 0; }
    updateNotebookBadge();
    rememberSide();
    focusInput();
  }

  nbToggle.addEventListener('click', () => toggleNotebook());
  document.getElementById('notebook-close').addEventListener('click', () => toggleNotebook(false));

  mapToggle.addEventListener('click', () => toggleMap());
  document.getElementById('map-close').addEventListener('click', () => toggleMap(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mapPanel.hidden) toggleMap(false);
    if (e.key === 'Escape' && !nbPanel.hidden) toggleNotebook(false);
  });

  function echo(cmd) {
    return addLine('> ' + cmd, 'echo', false);
  }

  function updateStatus() {
    const s = game.status();
    statusLoc.textContent = s.location;
    // The labels fold away on a phone (CSS), leaving "45/100 · 12".
    statusScore.innerHTML = `<span class="lbl">Score: </span>${s.score}/${s.maxScore}`;
    statusTurns.innerHTML = `<span class="lbl">Turns: </span>${s.turns}`;
    document.title = (isDev ? 'DEV · ' : '') + (s.over ? 'No Safe Harbor: Case Closed' : `No Safe Harbor: ${s.location}`);
  }

  function submit(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;
    history.push(cmd);
    histPos = history.length;
    render(game.command(cmd), echo(cmd));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cmd = input.value;
    input.value = '';
    submit(cmd);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (histPos > 0) histPos--;
      input.value = history[histPos] || '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histPos < history.length) histPos++;
      input.value = history[histPos] || '';
      e.preventDefault();
    }
  });

  document.getElementById('quick').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    submit(btn.dataset.cmd);
    focusInput();
  });

  // Clicking the transcript puts the cursor back in the input, unless the user is selecting text.
  out.addEventListener('click', () => {
    if (!window.getSelection || String(window.getSelection()) === '') focusInput();
  });

  // Themes in Southeast Alaska colors; the button cycles them and remembers your pick.
  const THEMES = [
    { id: 'rainforest', name: 'Rainforest' },
    { id: 'strait', name: 'Clarence Strait' },
    { id: 'sockeye', name: 'Sockeye' },
    { id: 'fog', name: 'Fog' }
  ];
  function setTheme(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    if (t.id === 'rainforest') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t.id);
    themeBtn.textContent = t.name;
    themeBtn.title = `Color theme: ${t.name}. Click for the next one.`;
    storage.set('nosafeharbor-theme', t.id);
  }
  setTheme(storage.get('nosafeharbor-theme'));
  themeBtn.addEventListener('click', () => {
    const cur = THEMES.findIndex((x) => x.id === (document.documentElement.getAttribute('data-theme') || 'rainforest'));
    setTheme(THEMES[(cur + 1) % THEMES.length].id);
    focusInput();
  });

  // ---- start screen: continue the autosaved case, or open a new one
  const startScreen = document.getElementById('start-screen');
  const startContinue = document.getElementById('start-continue');
  const btnContinue = document.getElementById('btn-continue');
  const btnNew = document.getElementById('btn-new');

  function ago(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (!(min >= 1)) return 'just now';
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const d = Math.round(hr / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  function closeStart() {
    startScreen.hidden = true;
    restoreSide();
    focusInput();
  }

  function newCase() {
    out.innerHTML = '';
    transcript = [];
    game.newGame();
    render(game.start());
    game.autosave(); // a fresh case replaces the old autosave right away
    closeStart();
  }

  function continueCase() {
    let saved = [];
    try { saved = JSON.parse(storage.get(TRANSCRIPT_KEY)) || []; } catch (e) { saved = []; }
    out.innerHTML = '';
    transcript = [];
    for (const b of saved) if (b && typeof b.text === 'string') addLine(b.text, b.cls || 'text', false);
    if (saved.length) addLine('— — —', 'meta', false);
    render(game.continueGame());
    nbSeen = logLength(); // what happened before the break isn't news
    updateNotebookBadge();
    closeStart();
  }

  const info = game.autosaveInfo();
  if (info) {
    startContinue.hidden = false;
    document.getElementById('start-info').textContent =
      `${info.location} · turn ${info.turns} · ${info.score}/${info.maxScore} points · ${info.evidence} piece${info.evidence === 1 ? '' : 's'} of evidence · last played ${ago(info.savedAt)}`;
    btnNew.textContent = 'Start a new case';
  }
  let confirmNew = false;
  btnContinue.addEventListener('click', continueCase);
  btnNew.addEventListener('click', () => {
    if (info && !confirmNew) {
      confirmNew = true;
      btnNew.textContent = 'Sure? This replaces the case in progress. Click again.';
      return;
    }
    newCase();
  });
  startScreen.hidden = false;
  (info ? btnContinue : btnNew).focus();
})();
