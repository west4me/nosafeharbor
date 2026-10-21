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

  // ---- graph-paper map
  function drawMap() {
    mapScroll.innerHTML = window.NSH.renderMap(game);
    mapWhere.textContent = '';
    mapWhere.append('You are here: ');
    const strong = document.createElement('strong');
    strong.textContent = game.status().location;
    mapWhere.append(strong);
    const here = mapScroll.querySelector('#map-you-are-here');
    // The sheet can be taller (and on phones wider) than the panel; keep your room in view.
    if (here && (mapScroll.scrollWidth > mapScroll.clientWidth + 4 || mapScroll.scrollHeight > mapScroll.clientHeight + 4)) {
      const box = here.getBoundingClientRect();
      const panel = mapScroll.getBoundingClientRect();
      mapScroll.scrollLeft += box.left + box.width / 2 - (panel.left + panel.width / 2);
      mapScroll.scrollTop += box.top + box.height / 2 - (panel.top + panel.height / 2);
    }
  }

  function toggleMap(force) {
    const open = force === undefined ? mapPanel.hidden : force;
    mapPanel.hidden = !open;
    mapToggle.setAttribute('aria-pressed', String(open));
    if (open) drawMap();
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
