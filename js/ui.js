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
  const storage = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  const game = new window.NSH.Game(window.NSH.buildWorld, { storage });
  const history = [];
  let histPos = 0;

  // The transcript is saved with the autosave, so CONTINUE brings back what was on screen.
  const TRANSCRIPT_KEY = 'nosafeharbor-transcript-v2';
  const TRANSCRIPT_KEEP = 200;
  let transcript = [];

  function addLine(text, cls, fresh) {
    const p = document.createElement('p');
    p.className = fresh ? cls + ' new' : cls;
    p.textContent = text;
    out.appendChild(p);
    transcript.push({ text, cls });
  }

  function saveTranscript() {
    if (transcript.length > TRANSCRIPT_KEEP) transcript = transcript.slice(-TRANSCRIPT_KEEP);
    storage.set(TRANSCRIPT_KEY, JSON.stringify(transcript));
  }

  function render(blocks) {
    for (const b of blocks) {
      if (b.cls === 'event') {
        if (b.event === 'map') toggleMap();
        if (b.event === 'notebook') toggleNotebook();
        continue;
      }
      addLine(b.text, b.cls, true);
    }
    saveTranscript();
    out.scrollTop = out.scrollHeight;
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

  function panelAspect() {
    return Math.max(0.3, mapScroll.clientWidth / Math.max(1, mapScroll.clientHeight));
  }

  function applyView() {
    const svg = mapScroll.querySelector('svg');
    if (svg && mapViewBox) svg.setAttribute('viewBox', mapViewBox.join(' '));
  }

  function drawMap() {
    mapScroll.innerHTML = window.NSH.renderMap(game);
    mapWhere.textContent = '';
    mapWhere.append('You are here: ');
    const strong = document.createElement('strong');
    strong.textContent = game.status().location;
    mapWhere.append(strong);
    if (followMe || !mapViewBox) mapViewBox = window.NSH.mapView(game, panelAspect());
    applyView();
  }

  // Zoom by a factor around a point on the sheet (defaults to the middle of the view).
  function zoomBy(f, cx, cy) {
    const [x, y, w, h] = mapViewBox;
    const whole = window.NSH.wholeView(panelAspect());
    const nw = Math.min(Math.max(w * f, 160), whole[2]);
    const k = nw / w;
    const px = cx === undefined ? x + w / 2 : cx;
    const py = cy === undefined ? y + h / 2 : cy;
    mapViewBox = [px - (px - x) * k, py - (py - y) * k, nw, h * k];
    followMe = false;
    applyView();
  }

  document.getElementById('map-tools').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    const z = btn.dataset.zoom;
    if (z === 'in') zoomBy(1 / 1.5);
    else if (z === 'out') zoomBy(1.5);
    else if (z === 'fit') { followMe = true; mapViewBox = window.NSH.mapView(game, panelAspect()); applyView(); }
    else if (z === 'all') { followMe = false; mapViewBox = window.NSH.wholeView(panelAspect()); applyView(); }
    input.focus();
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

  mapScroll.addEventListener('wheel', (e) => {
    if (!mapViewBox) return;
    e.preventDefault();
    const [px, py] = sheetPoint(e.clientX, e.clientY);
    zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2, px, py);
  }, { passive: false });

  let drag = null;
  mapScroll.addEventListener('pointerdown', (e) => {
    if (!mapViewBox) return;
    drag = { x: e.clientX, y: e.clientY, box: mapViewBox.slice(), scale: sheetPoint(e.clientX, e.clientY)[2] };
    mapScroll.setPointerCapture(e.pointerId);
    const svg = mapScroll.querySelector('svg');
    if (svg) svg.classList.add('dragging');
  });
  mapScroll.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) * drag.scale;
    const dy = (e.clientY - drag.y) * drag.scale;
    if (Math.abs(dx) + Math.abs(dy) > 2) followMe = false;
    mapViewBox = [drag.box[0] - dx, drag.box[1] - dy, drag.box[2], drag.box[3]];
    applyView();
  });
  const endDrag = () => {
    drag = null;
    const svg = mapScroll.querySelector('svg');
    if (svg) svg.classList.remove('dragging');
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
    input.focus();
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
    input.focus();
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
    addLine('> ' + cmd, 'echo', false);
  }

  function updateStatus() {
    const s = game.status();
    statusLoc.textContent = s.location;
    statusScore.textContent = `Score: ${s.score}/${s.maxScore}`;
    statusTurns.textContent = `Turns: ${s.turns}`;
    document.title = s.over ? 'No Safe Harbor: Case Closed' : `No Safe Harbor: ${s.location}`;
  }

  function submit(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;
    history.push(cmd);
    histPos = history.length;
    echo(cmd);
    render(game.command(cmd));
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
    input.focus();
  });

  // Clicking the transcript puts the cursor back in the input, unless the user is selecting text.
  out.addEventListener('click', () => {
    if (!window.getSelection || String(window.getSelection()) === '') input.focus();
  });

  // Theme: amber (default) or green, remembered per browser.
  function setTheme(t) {
    if (t === 'green') document.documentElement.setAttribute('data-theme', 'green');
    else document.documentElement.removeAttribute('data-theme');
    storage.set('nosafeharbor-theme', t);
  }
  setTheme(storage.get('nosafeharbor-theme') || 'amber');
  themeBtn.addEventListener('click', () => {
    const now = document.documentElement.getAttribute('data-theme') === 'green' ? 'amber' : 'green';
    setTheme(now);
    input.focus();
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
    input.focus();
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
