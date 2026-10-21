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

  // localStorage can throw (private mode, blocked storage), so wrap it.
  const storage = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  const game = new window.NSH.Game(window.NSH.buildWorld, { storage });
  const history = [];
  let histPos = 0;

  function render(blocks) {
    for (const b of blocks) {
      if (b.cls === 'event') {
        if (b.event === 'map') toggleMap();
        continue;
      }
      const p = document.createElement('p');
      p.className = b.cls + ' new';
      p.textContent = b.text;
      out.appendChild(p);
    }
    out.scrollTop = out.scrollHeight;
    updateStatus();
    if (!mapPanel.hidden) drawMap();
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
    mapPanel.hidden = !open;
    mapToggle.setAttribute('aria-pressed', String(open));
    if (open) { followMe = true; drawMap(); }
    input.focus();
  }

  mapToggle.addEventListener('click', () => toggleMap());
  document.getElementById('map-close').addEventListener('click', () => toggleMap(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mapPanel.hidden) toggleMap(false);
  });

  function echo(cmd) {
    const p = document.createElement('p');
    p.className = 'echo';
    p.textContent = '> ' + cmd;
    out.appendChild(p);
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

  render(game.start());
  input.focus();
})();
