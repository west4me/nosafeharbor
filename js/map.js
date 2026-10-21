/*
 * No Safe Harbor: the field map.
 *
 * renderMap(game) returns an SVG string: a true-scale map of Prince of Wales
 * Island on graph paper (one square = one kilometer), built from USGS data in
 * js/geodata.js. The coastline, lakes, rivers, towns and roads are printed on
 * the sheet, with the main roads and every road in the story drawn like a road
 * map and named. Your own pencil work goes on top: a pin for every place you've
 * been (towns list the spots inside them), the real road routes you've driven,
 * the trails you've walked and rowed, a "?" for every way you haven't tried, and
 * a red pin where you are now. The key and scale bar live in the page, so they
 * stay on screen however you pan and zoom.
 *
 * Pure string-building with no DOM, so it also runs under Node for tests.
 */
(function (root) {
  'use strict';

  const geo = root.NSH && root.NSH.geo ? root.NSH.geo
    : (typeof require === 'function' ? require('./geodata.js').geo : null);

  const STUB_PX = 140; // how far a "?" stub runs along an unexplored road (about 5 km)

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Longitude/latitude to map pixels (the same projection tools/build_geodata.py used).
  function project(at) {
    const v = geo.view;
    return [
      Math.round((at[0] - v.lon0) * v.kmX * v.pxPerKm * 10) / 10,
      Math.round((v.lat1 - at[1]) * v.kmY * v.pxPerKm * 10) / 10
    ];
  }

  // Flat [x0, y0, x1, y1, ...] to an SVG path.
  function pathOf(flat, closed) {
    let d = 'M' + flat[0] + ',' + flat[1];
    for (let i = 2; i < flat.length; i += 2) d += 'L' + flat[i] + ',' + flat[i + 1];
    return closed ? d + 'Z' : d;
  }

  function polyPath(polys) {
    return polys.map((rings) => rings.map((r) => pathOf(r, true)).join('')).join('');
  }

  // The first `len` pixels of a polyline, starting from whichever end is nearer `from`.
  function lead(flat, from, len) {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    const d0 = Math.hypot(pts[0][0] - from[0], pts[0][1] - from[1]);
    const d1 = Math.hypot(pts[pts.length - 1][0] - from[0], pts[pts.length - 1][1] - from[1]);
    if (d1 < d0) pts.reverse();
    const out = [pts[0]];
    let left = len;
    for (let i = 1; i < pts.length && left > 0; i++) {
      const [ax, ay] = out[out.length - 1];
      const [bx, by] = pts[i];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg >= left) {
        out.push([ax + (bx - ax) * (left / seg), ay + (by - ay) * (left / seg)]);
        left = 0;
      } else {
        out.push(pts[i]);
        left -= seg;
      }
    }
    return out.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }

  function exitTarget(exit) {
    return typeof exit === 'string' ? exit : exit.to;
  }

  function hereRoomId(game) {
    const cur = game.rooms[game.state.loc];
    if (!cur.mapAs) return game.state.loc;
    return typeof cur.mapAs === 'function' ? cur.mapAs(game) : cur.mapAs;
  }

  // Everything the map shows, separate from drawing so tests can check it.
  function mapModel(game) {
    const st = game.state;
    const visited = st.visited || {};
    const lit = st.lit || null;
    const hereId = hereRoomId(game);
    const onMap = Object.values(game.rooms).filter((r) => r.map && r.map.at);
    const rooms = onMap.filter((r) => visited[r.id]);
    const edges = [];
    const stubs = [];
    const seen = new Set();
    for (const r of rooms) {
      for (const [dir, exit] of Object.entries(r.exits)) {
        if (typeof exit === 'object' && typeof exit.to === 'function') continue;
        const to = game.rooms[exitTarget(exit)];
        if (!to || !to.map || !to.map.at) continue;
        const sameSpot = to.map.at[0] === r.map.at[0] && to.map.at[1] === r.map.at[1];
        if (sameSpot) continue; // rooms inside one town: listed under its pin, not drawn
        const road = typeof exit === 'object' && !!exit.drive;
        if (visited[to.id]) {
          const key = [r.id, to.id].sort().join('|');
          if (!seen.has(key)) { seen.add(key); edges.push({ a: r.id, b: to.id, road, key }); }
        } else {
          stubs.push({ from: r.id, dir, to: to.id, road, key: [r.id, to.id].sort().join('|') });
        }
      }
    }
    const sites = {};
    for (const r of rooms) {
      const s = sites[r.map.site] || (sites[r.map.site] = { id: r.map.site, rooms: [] });
      s.rooms.push(r.id);
    }
    return {
      rooms: rooms.map((r) => ({
        id: r.id,
        at: r.map.at,
        site: r.map.site,
        label: r.dark && lit && !lit[r.id] ? 'Dark!' : (r.map.label || r.name),
        here: r.id === hereId
      })),
      sites: Object.values(sites),
      edges,
      stubs,
      hereId,
      total: onMap.length
    };
  }

  // The printed layers (water, lakes, rivers, roads, names) are the same every turn; build them once.
  let baseCache = null;
  function printedSheet(game) {
    if (baseCache && baseCache.labels === game.world.mapLabels) return baseCache.svg;
    const W = geo.width;
    const H = geo.height;
    const out = [];
    const sea = polyPath(geo.sea);
    const lakes = polyPath(geo.lakes);
    out.push(`<rect width="${W}" height="${H}" fill="#fbf8ef"/>`);
    out.push(`<path d="${sea}" fill="#e3edf7" fill-rule="evenodd"/>`);
    out.push(`<path d="${sea}" fill="url(#map-water)" fill-rule="evenodd" opacity="0.55"/>`);
    out.push(`<path d="${lakes}" fill="#e3edf7" fill-rule="evenodd"/>`);
    out.push(`<path d="${lakes}" fill="url(#map-water)" fill-rule="evenodd" opacity="0.5"/>`);
    out.push(`<rect width="${W}" height="${H}" fill="url(#map-grid)"/>`);
    out.push(`<rect width="${W}" height="${H}" fill="url(#map-grid-major)"/>`);
    out.push(`<path d="${sea}" fill="none" stroke="#3d4a5c" stroke-width="1.6" stroke-linejoin="round" fill-rule="evenodd"/>`);
    out.push(`<path d="${lakes}" fill="none" stroke="#3f74ad" stroke-width="1.2" stroke-linejoin="round"/>`);
    out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    for (const s of geo.streams) out.push(`<path d="${pathOf(s)}" stroke="#9ec0e4" stroke-width="0.9"/>`);
    for (const rv of geo.rivers) for (const l of rv.lines) out.push(`<path d="${pathOf(l)}" stroke="#4f86c2" stroke-width="2.2"/>`);
    out.push(`<path d="${geo.roads.forest.map((l) => pathOf(l)).join('')}" stroke="#cfc8ba" stroke-width="0.8" stroke-dasharray="3 3"/>`);
    out.push(`<path d="${geo.roads.road.map((l) => pathOf(l)).join('')}" stroke="#b9b1a2" stroke-width="1.3"/>`);
    // Main roads, and every road the story drives, printed like a road map: a dark casing with a yellow fill.
    const main = geo.roads.highway.concat(Object.values(geo.routes).map((r) => r.line));
    const mainPath = main.map((l) => pathOf(l)).join('');
    out.push(`<path d="${mainPath}" stroke="#7a5a2b" stroke-width="5.6"/>`);
    out.push(`<path d="${mainPath}" stroke="#f3cf6b" stroke-width="3.2"/>`);
    out.push('</g>');
    out.push(roadNames(game, main));
    for (const l of game.world.mapLabels || []) {
      const [x, y] = project(l.at);
      out.push(`<text class="map-label map-label-${esc(l.cls)}" x="${x}" y="${y}" font-size="${l.size}" text-anchor="middle" transform="rotate(${l.rotate || 0} ${x} ${y})">${esc(l.text)}</text>`);
    }
    baseCache = { labels: game.world.mapLabels, svg: out.join('\n') };
    return baseCache.svg;
  }

  // Road names along the printed roads, turned to run with the road.
  function roadNames(game, main) {
    const out = [];
    for (const r of game.world.mapRoads || []) {
      let pts = null;
      if (r.route && geo.routes[r.route]) pts = alongLine(geo.routes[r.route].line, r.t === undefined ? 0.5 : r.t);
      else if (r.at) pts = nearestOnLines(main, project(r.at));
      if (!pts) continue;
      const [[x, y], [x2, y2]] = pts;
      let angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const rx = Math.round(x);
      const ry = Math.round(y);
      out.push(`<text class="map-label map-label-road" x="${rx}" y="${ry - 7}" font-size="13" text-anchor="middle" transform="rotate(${Math.round(angle)} ${rx} ${ry})">${esc(r.text)}</text>`);
    }
    return out.join('\n');
  }

  // The point a fraction t of the way along a polyline, and the next vertex after it (for direction).
  function alongLine(flat, t) {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let goal = total * t;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (seg >= goal && seg > 0) {
        const f = goal / seg;
        return [[pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f], pts[i]];
      }
      goal -= seg;
    }
    return null;
  }

  // The nearest stretch of road to a point (within a couple of km).
  function nearestOnLines(lines, p) {
    let best = null;
    for (const l of lines) {
      for (let i = 0; i + 3 < l.length; i += 2) {
        const d = Math.hypot(l[i] - p[0], l[i + 1] - p[1]);
        if (!best || d < best.d) best = { d, pts: [[l[i], l[i + 1]], [l[i + 2], l[i + 3]]] };
      }
    }
    return best && best.d < 60 ? best.pts : null;
  }

  // Printed town names, except where your own pin already names the place.
  function townNames(game, model) {
    const sitesInfo = game.world.mapSites || {};
    const pinned = model.sites.map((s) => (sitesInfo[s.id] || {}).name || '');
    const out = [];
    for (const t of game.world.mapTowns || []) {
      if (pinned.some((n) => n.startsWith(t.name))) continue;
      const [x, y] = project(t.at);
      const [dx, dy, anchor] = t.label || [10, 6, 'start'];
      out.push(`<rect x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" fill="#2f2f2f" stroke="#fbf8ef" stroke-width="1.5"/>`);
      out.push(`<text class="map-label map-label-town" x="${x + dx}" y="${y + dy}" font-size="18" text-anchor="${anchor}">${esc(t.name)}</text>`);
    }
    return out.join('\n');
  }

  // The pencil line for each unexplored exit: a stretch of the real road, or a short dash toward the place.
  function stubLines(game, model) {
    const P = (id) => project(game.rooms[id].map.at);
    return model.stubs.map((s) => {
      const from = P(s.from);
      const route = s.road && geo.routes[s.key];
      if (route) return lead(route.line, from, STUB_PX);
      const to = P(s.to);
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const f = Math.min(1, Math.min(STUB_PX * 0.6, len * 0.6) / (len || 1));
      return [from, [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]];
    });
  }

  // The part of the sheet worth looking at: everywhere you've been, where you are, and where
  // the unexplored roads lead off, with some margin. Returned as an SVG viewBox [x, y, w, h]
  // shaped to the panel (aspect = width / height), never smaller than about 20 km across.
  function mapView(game, aspect) {
    const model = mapModel(game);
    const pts = model.rooms.map((r) => project(r.at));
    for (const line of stubLines(game, model)) pts.push(line[line.length - 1]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const PAD = 110;
    const MIN = 20 * geo.view.pxPerKm;
    let [x0, x1, y0, y1] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD, Math.min(...ys) - PAD, Math.max(...ys) + PAD];
    let w = Math.max(x1 - x0, MIN);
    let h = Math.max(y1 - y0, MIN / Math.max(aspect, 0.4));
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    // Never wider or taller than the sheet; then keep the frame on the sheet.
    const fit = Math.min(geo.width / w, geo.height / h, 1);
    w *= fit; h *= fit;
    // If everything won't fit (the island is tall, screens are wide), keep you in the middle.
    const here = model.hereId ? project(game.rooms[model.hereId].map.at) : null;
    let x = fit < 1 && here ? here[0] - w / 2 : (x0 + x1) / 2 - w / 2;
    let y = fit < 1 && here ? here[1] - h / 2 : (y0 + y1) / 2 - h / 2;
    x = Math.max(0, Math.min(x, geo.width - w));
    y = Math.max(0, Math.min(y, geo.height - h));
    return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
  }

  // The whole sheet, shaped to the panel.
  function wholeView(aspect) {
    let w = geo.width;
    let h = geo.height;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    return [Math.round((geo.width - w) / 2), Math.round((geo.height - h) / 2), Math.round(w), Math.round(h)];
  }

  // Lake and river names from the USGS data. Skip any that would land on another name,
  // and any that just repeat the name of a place you've already pinned.
  function featureNames(game, model) {
    const pinned = new Set(model.sites.map((s) => ((game.world.mapSites || {})[s.id] || {}).name));
    const boxes = [];
    const out = [];
    for (const l of geo.labels) {
      if (pinned.has(l.text)) continue;
      const size = l.cls === 'lake' ? 15 : 14;
      const w = l.text.length * size * 0.5;
      // Try the spot itself, then a line below or above, before giving up on the name.
      let placed = null;
      for (const dy of [0, size + 4, -(size + 4)]) {
        const y = l.at[1] + dy;
        const box = [l.at[0] - w / 2, y - size, l.at[0] + w / 2, y + 4];
        if (!boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { placed = { box, y }; break; }
      }
      if (!placed) continue;
      boxes.push(placed.box);
      out.push(`<text class="map-label map-label-${l.cls === 'lake' ? 'lake' : 'river'}" x="${l.at[0]}" y="${placed.y}" font-size="${size}" text-anchor="middle">${esc(l.text)}</text>`);
    }
    return out.join('\n');
  }

  function renderMap(game) {
    const W = geo.width;
    const H = geo.height;
    const G = geo.view.pxPerKm; // one graph-paper square = 1 km
    const model = mapModel(game);
    const byId = {};
    for (const r of model.rooms) byId[r.id] = r;
    const P = (id) => project(game.rooms[id].map.at);
    const hereName = game.status().location;

    const out = [];
    const explored = `explored ${model.rooms.length} of ${model.total}`;
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="map-svg" role="img" data-explored="${explored}" aria-label="${esc('Map of Prince of Wales Island. You are at ' + hereName + '. You have ' + explored + ' places.')}">`);
    out.push(`<defs>
  <pattern id="map-grid" width="${G}" height="${G}" patternUnits="userSpaceOnUse">
    <path d="M${G},0 L0,0 0,${G}" fill="none" stroke="#c4d7ec" stroke-width="0.8"/>
  </pattern>
  <pattern id="map-grid-major" width="${G * 5}" height="${G * 5}" patternUnits="userSpaceOnUse">
    <path d="M${G * 5},0 L0,0 0,${G * 5}" fill="none" stroke="#9dbbdc" stroke-width="1.3"/>
  </pattern>
  <pattern id="map-water" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <line x1="0" y1="0" x2="0" y2="9" stroke="#8fb0d4" stroke-width="1.4"/>
  </pattern>
  <filter id="map-pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7"/>
    <feDisplacementMap in="SourceGraphic" scale="2.4"/>
  </filter>
</defs>`);

    // The printed sheet, then your pencil on top.
    out.push(printedSheet(game));
    out.push(featureNames(game, model));
    out.push(townNames(game, model));

    // Your pencil: roads you've driven, trails you've walked, water you've rowed.
    out.push(`<g filter="url(#map-pencil)" fill="none" stroke="#2f2f2f" stroke-linecap="round" stroke-linejoin="round">`);
    for (const e of model.edges) {
      const route = e.road && geo.routes[e.key];
      if (route) out.push(`<path d="${pathOf(route.line)}" stroke-width="3.4"/>`);
      else {
        const [ax, ay] = P(e.a);
        const [bx, by] = P(e.b);
        out.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke-width="2.4" stroke-dasharray="1 5"/>`);
      }
    }
    // Ways you haven't tried: a dashed start down the road, and a question mark.
    const marks = [];
    for (const pts of stubLines(game, model)) {
      out.push(`<path d="${pathOf(pts.flat())}" stroke-width="3" stroke-dasharray="7 5"/>`);
      marks.push(pts[pts.length - 1]);
    }
    out.push('</g>');
    for (const [x, y] of marks) {
      out.push(`<circle cx="${x}" cy="${y}" r="12" fill="#fffdf6" stroke="#2f2f2f" stroke-width="1.6"/><text class="map-q" x="${x}" y="${y + 7}" font-size="20" text-anchor="middle">?</text>`);
    }

    // Pins: one pencil dot per spot you've stood, then a label block per site.
    const dots = new Set();
    for (const r of model.rooms) {
      const [x, y] = project(r.at);
      const k = x + ',' + y;
      if (dots.has(k)) continue;
      dots.add(k);
      out.push(`<circle cx="${x}" cy="${y}" r="5" fill="#2f2f2f" filter="url(#map-pencil)"/>`);
    }
    const sitesInfo = game.world.mapSites || {};
    for (const site of model.sites) {
      const info = sitesInfo[site.id] || { name: site.id, label: [10, 4, 'start'] };
      const all = Object.values(game.rooms).filter((r) => r.map && r.map.site === site.id);
      const [ax, ay] = project(all[0].map.at);
      const [dx, dy, anchor] = info.label || [10, 4, 'start'];
      const lines = [{ text: info.name, cls: 'map-site-name', here: false }];
      if (all.length > 1) {
        for (const r of all) {
          if (!byId[r.id]) continue;
          lines.push({ text: byId[r.id].label, cls: 'map-site-room', here: byId[r.id].here });
        }
        const unseen = all.filter((r) => !byId[r.id]).length;
        if (unseen) lines.push({ text: '?', cls: 'map-q', here: false });
      } else if (byId[all[0].id].label === 'Dark!') {
        lines.push({ text: 'Dark!', cls: 'map-site-room', here: false });
      }
      const lh = 19;
      // Handwriting fonts run wide (Segoe Print on Windows especially), so size the note card generously.
      const wMax = Math.max(...lines.map((l, i) => l.text.length * (i === 0 ? 11 : 9))) + 16;
      const x0 = anchor === 'end' ? ax + dx - wMax : anchor === 'middle' ? ax + dx - wMax / 2 : ax + dx;
      out.push(`<rect class="map-site-card" x="${x0 - 2}" y="${ay + dy - 18}" width="${wMax}" height="${lines.length * lh + 6}" rx="4" fill="#fbf8ef" opacity="0.92"/>`);
      lines.forEach((l, i) => {
        const tx = anchor === 'end' ? ax + dx - 6 : anchor === 'middle' ? ax + dx : ax + dx + 4;
        const prefix = i === 0 ? '' : (l.here ? '◉ ' : '· ');
        out.push(`<text class="${l.cls}${l.here ? ' map-here-text' : ''}" x="${tx}" y="${ay + dy + i * lh}" font-size="${i === 0 ? 18 : 15}" text-anchor="${anchor}">${esc(prefix + l.text)}</text>`);
      });
    }

    // You are here.
    if (model.hereId && byId[model.hereId]) {
      const [x, y] = P(model.hereId);
      // A red pin with its point on the spot and a tag above it, plus a ring that pulses so you can
      // find it at any zoom. The pin group grows when you zoom out (see ui.js), anchored at its point.
      out.push(`<g id="map-you-are-here">
  <circle class="map-you-ring" cx="${x}" cy="${y}" r="16" fill="none" stroke="#c0392b" stroke-width="3"/>
  <g class="map-pin">
    <g class="map-you-tag">
      <rect x="${x - 58}" y="${y - 70}" width="116" height="22" rx="4" fill="#c0392b"/>
      <text class="map-you-text" x="${x}" y="${y - 54}" font-size="14" text-anchor="middle">YOU ARE HERE</text>
    </g>
    <path d="M${x},${y} C${x - 5},${y - 9} ${x - 14},${y - 17} ${x - 14},${y - 27} A14,14 0 1 1 ${x + 14},${y - 27} C${x + 14},${y - 17} ${x + 5},${y - 9} ${x},${y} Z" fill="#c0392b" stroke="#fffdf6" stroke-width="2"/>
    <circle cx="${x}" cy="${y - 27}" r="5.5" fill="#fffdf6"/>
  </g>
</g>`);
    }

    out.push('</svg>');
    return out.join('\n');
  }

  root.NSH = root.NSH || {};
  root.NSH.renderMap = renderMap;
  root.NSH.mapModel = mapModel;
  root.NSH.project = project;
  root.NSH.mapView = mapView;
  root.NSH.wholeView = wholeView;
  if (typeof module === 'object' && module.exports) module.exports = { renderMap, mapModel, project, mapView, wholeView };
})(typeof window !== 'undefined' ? window : globalThis);
