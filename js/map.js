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
    // Line widths are screen pixels (vector-effect, see the CSS), so lines stay crisp at any zoom.
    out.push(`<path d="${sea}" fill="none" stroke="#3d4a5c" stroke-width="1.2" stroke-linejoin="round" fill-rule="evenodd"/>`);
    out.push(`<path d="${lakes}" fill="none" stroke="#3f74ad" stroke-width="0.9" stroke-linejoin="round"/>`);
    out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    out.push(`<path class="map-streams" d="${geo.streams.map((l) => pathOf(l)).join('')}" stroke="#9ec0e4" stroke-width="0.7"/>`);
    for (const rv of geo.rivers) for (const l of rv.lines) out.push(`<path d="${pathOf(l)}" stroke="#4f86c2" stroke-width="1.6"/>`);
    out.push('</g>');
    // The island-wide roads. Zoomed in on a town, its street map is drawn over them.
    out.push(`<g class="map-coarse" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    out.push(`<path class="map-forest" d="${geo.roads.forest.map((l) => pathOf(l)).join('')}" stroke="#cfc8ba" stroke-width="0.7" stroke-dasharray="3 3"/>`);
    out.push(`<path d="${geo.roads.road.map((l) => pathOf(l)).join('')}" stroke="#b9b1a2" stroke-width="1"/>`);
    // Main roads, and every road the story drives, printed like a road map: a dark casing with a yellow fill.
    const main = geo.roads.highway.concat(Object.values(geo.routes).map((r) => r.line));
    const mainPath = main.map((l) => pathOf(l)).join('');
    out.push(`<path d="${mainPath}" stroke="#7a5a2b" stroke-width="4.2"/>`);
    out.push(`<path d="${mainPath}" stroke="#f3cf6b" stroke-width="2.4"/>`);
    out.push('</g>');
    out.push(townDetail());
    out.push(roadNames(game, main));
    for (const l of game.world.mapLabels || []) {
      const [x, y] = project(l.at);
      out.push(`<g transform="translate(${x} ${y}) rotate(${l.rotate || 0})"><g class="map-k"><text class="map-label map-label-${esc(l.cls)}" font-size="${l.size}" text-anchor="middle">${esc(l.text)}</text></g></g>`);
    }
    baseCache = { labels: game.world.mapLabels, svg: out.join('\n') };
    return baseCache.svg;
  }

  // Street maps of the towns, from the same USGS data at full detail: shoreline, creeks, every street,
  // named. Hidden until you zoom in close (CSS: .near), when they replace the island-wide roads there.
  function townDetail() {
    const out = ['<g class="map-detail">'];
    for (const t of geo.detail || []) {
      const [x0, y0, x1, y1] = t.box;
      const clip = `map-clip-${t.town}`;
      out.push(`<clipPath id="${clip}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath>`);
      out.push(`<g clip-path="url(#${clip})">`);
      out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fbf8ef"/>`);
      const sea = polyPath(t.sea);
      out.push(`<path d="${sea}" fill="#e3edf7" fill-rule="evenodd"/>`);
      out.push(`<path d="${sea}" fill="url(#map-water)" fill-rule="evenodd" opacity="0.55"/>`);
      if (t.flats && t.flats.length) out.push(`<path d="${polyPath(t.flats)}" fill="#cfe0d6" fill-rule="evenodd" opacity="0.85"/>`);
      out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#map-grid)"/>`);
      out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#map-grid-major)"/>`);
      out.push(`<path d="${sea}" fill="none" stroke="#3d4a5c" stroke-width="1.2" fill-rule="evenodd"/>`);
      out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
      out.push(`<path d="${t.creeks.map((l) => pathOf(l)).join('')}" stroke="#7fa9d6" stroke-width="1.2"/>`);
      const side = t.streets.filter((r) => !r.main).map((r) => pathOf(r.line)).join('');
      const main = t.streets.filter((r) => r.main).map((r) => pathOf(r.line)).join('');
      out.push(`<path d="${side}" stroke="#a79f8e" stroke-width="4"/><path d="${side}" stroke="#fffdf6" stroke-width="2.4"/>`);
      out.push(`<path d="${main}" stroke="#7a5a2b" stroke-width="6"/><path d="${main}" stroke="#f3cf6b" stroke-width="3.8"/>`);
      out.push('</g>');
      // One name per street, on its longest stretch, turned to run with it.
      const longest = {};
      for (const r of t.streets) {
        if (!r.name) continue;
        const len = lineLength(r.line);
        if (!longest[r.name] || len > longest[r.name].len) longest[r.name] = { len, line: r.line };
      }
      // Longest streets first, so when names crowd, the main streets keep theirs (see fitStreetNames in ui.js).
      const named = Object.entries(longest).sort((a, b) => b[1].len - a[1].len);
      for (const [name, { line, len }] of named) {
        const pts = alongLine(line, 0.5);
        if (!pts) continue;
        const [[x, y], [xb, yb]] = pts;
        let angle = Math.atan2(yb - y, xb - x) * 180 / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        out.push(`<g class="map-street-name" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-a="${Math.round(angle)}" data-len="${len.toFixed(1)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${Math.round(angle)})"><g class="map-k"><text class="map-label map-label-street" y="-4" text-anchor="middle">${esc(name)}</text></g></g>`);
      }
      out.push('</g>');
    }
    out.push('</g>');
    return out.join('\n');
  }

  function lineLength(flat) {
    let total = 0;
    for (let i = 2; i < flat.length; i += 2) total += Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
    return total;
  }

  // The town street map a room sits in, if any.
  function detailAt(at) {
    const [x, y] = project(at);
    return (geo.detail || []).find((t) => x >= t.box[0] && x <= t.box[2] && y >= t.box[1] && y <= t.box[3]) || null;
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
      out.push(`<g transform="translate(${rx} ${ry}) rotate(${Math.round(angle)})"><g class="map-k"><text class="map-label map-label-road" y="-7" font-size="13" text-anchor="middle">${esc(r.text)}</text></g></g>`);
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

  // A little pickup, drawn where you parked.
  function truckIcon(x, y, scale) {
    const k = scale || 1;
    return `<g class="map-truck" transform="translate(${x} ${y}) scale(${k})">
  <rect x="0" y="4" width="20" height="8" rx="1.5" fill="#2f5b8c" stroke="#fbf8ef" stroke-width="1.2"/>
  <path d="M11,4 L13,0 H18 L20,4 Z" fill="#2f5b8c" stroke="#fbf8ef" stroke-width="1.2"/>
  <circle cx="5" cy="12.5" r="2.6" fill="#2f2f2f" stroke="#fbf8ef" stroke-width="1"/>
  <circle cx="16" cy="12.5" r="2.6" fill="#2f2f2f" stroke="#fbf8ef" stroke-width="1"/>
</g>`;
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
      out.push(`<g transform="translate(${x} ${y})"><g class="map-k"><rect x="-4" y="-4" width="8" height="8" fill="#2f2f2f" stroke="#fbf8ef" stroke-width="1.5"/>` +
        `<text class="map-label map-label-town" x="${dx}" y="${dy}" font-size="17" text-anchor="${anchor}">${esc(t.name)}</text></g></g>`);
    }
    return out.join('\n');
  }

  // The pencil line for each unexplored exit: a stretch of the real road, or a short dash toward the place.
  function stubLines(game, model) {
    const P = (id) => project(game.rooms[id].map.at);
    return model.stubs.map((s) => {
      const from = P(s.from);
      const route = geo.routes[s.key];
      if (route) return lead(route.line, from, s.road ? STUB_PX : Math.min(STUB_PX, lineLength(route.line) * 0.6));
      const to = P(s.to);
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const f = Math.min(1, Math.min(STUB_PX * 0.6, len * 0.6) / (len || 1));
      return [from, [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]];
    });
  }

  // The part of the sheet worth looking at: everywhere you've been, where you are, and where
  // the unexplored roads lead off, with some margin. Returned as an SVG viewBox [x, y, w, h]
  // shaped to the panel (aspect = width / height), never smaller than about 20 km across.
  function mapView(game, aspect, keyFrac) {
    const model = mapModel(game);
    const pts = model.rooms.map((r) => project(r.at));
    for (const line of stubLines(game, model)) pts.push(line[line.length - 1]);
    // In a town, frame its street map up close instead, so you can see the streets and where you can walk.
    const hereMap = model.hereId && game.rooms[model.hereId].map;
    const town = hereMap ? detailAt(hereMap.at) : null;
    if (town) {
      pts.length = 0;
      for (const r of model.rooms) if (r.site === hereMap.site) pts.push(project(r.at));
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const PAD = town ? 26 : 110;
    const MIN = (town ? 2.5 : 20) * geo.view.pxPerKm;
    let [x0, x1, y0, y1] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD, Math.min(...ys) - PAD, Math.max(...ys) + PAD];
    // The key covers the left side of the panel: widen the frame to the left so nothing hides under it.
    const k = Math.min(Math.max(keyFrac || 0, 0), 0.3);
    if (k) x0 -= (x1 - x0) * k / (1 - k);
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
      out.push(`<g transform="translate(${l.at[0]} ${placed.y})"><g class="map-k"><text class="map-label map-label-${l.cls === 'lake' ? 'lake' : 'river'}" font-size="${size}" text-anchor="middle">${esc(l.text)}</text></g></g>`);
    }
    return out.join('\n');
  }

  // Patterns for the printed sheet: the graph-paper grid and water hatching. The hatching's spacing is
  // reset for each zoom (see applyView in ui.js) so it stays the same on screen, in town and out.
  function sheetDefs() {
    const G = geo.view.pxPerKm; // one graph-paper square = 1 km
    return `<pattern id="map-grid" width="${G}" height="${G}" patternUnits="userSpaceOnUse">
    <path d="M${G},0 L0,0 0,${G}" fill="none" stroke="#c4d7ec" stroke-width="0.8"/>
  </pattern>
  <pattern id="map-grid-major" width="${G * 5}" height="${G * 5}" patternUnits="userSpaceOnUse">
    <path d="M${G * 5},0 L0,0 0,${G * 5}" fill="none" stroke="#9dbbdc" stroke-width="1.3"/>
  </pattern>
  <pattern id="map-water" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <line x1="0" y1="0" x2="0" y2="9" stroke="#8fb0d4" stroke-width="1.4"/>
  </pattern>`;
  }

  const PENCIL_DEFS = `<filter id="map-pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7"/>
    <feDisplacementMap in="SourceGraphic" scale="2.4"/>
  </filter>`;

  function svgOpen(cls, extra) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.width} ${geo.height}" class="map-svg${cls ? ' ' + cls : ''}" ${extra}>`;
  }

  function pencilAttrs(game, model) {
    const explored = `explored ${model.rooms.length} of ${model.total}`;
    return `role="img" data-explored="${explored}" aria-label="${esc('Map of Prince of Wales Island. You are at ' + game.status().location + '. You have ' + explored + ' places.')}"`;
  }

  // The whole map as one SVG (tests, or anything that wants a single picture).
  function renderMap(game) {
    const model = mapModel(game);
    return svgOpen('', pencilAttrs(game, model)) + `<defs>${sheetDefs()}${PENCIL_DEFS}</defs>` +
      printedSheet(game) + pencilLayer(game, model) + '</svg>';
  }

  // The page stacks two layers: the big printed sheet, built once and left alone, and your pencil
  // work, redrawn after every move. Redrawing only the pencil keeps moves quick on a big map.
  function renderSheet(game) {
    return svgOpen('map-sheet', 'aria-hidden="true"') + `<defs>${sheetDefs()}</defs>` + printedSheet(game) + '</svg>';
  }

  function renderPencil(game) {
    const model = mapModel(game);
    return svgOpen('map-pencil-layer', pencilAttrs(game, model)) + `<defs>${PENCIL_DEFS}</defs>` + pencilLayer(game, model) + '</svg>';
  }

  // Everything that changes as you play: names, your pencil lines, pins and where you are.
  function pencilLayer(game, model) {
    const byId = {};
    for (const r of model.rooms) byId[r.id] = r;
    const P = (id) => project(game.rooms[id].map.at);

    const out = [];
    out.push(featureNames(game, model));
    out.push(townNames(game, model));

    // Your pencil: roads you've driven, trails you've walked, water you've rowed.
    out.push(`<g filter="url(#map-pencil)" fill="none" stroke="#2f2f2f" stroke-linecap="round" stroke-linejoin="round">`);
    for (const e of model.edges) {
      const route = geo.routes[e.key];
      if (route) out.push(`<path d="${pathOf(route.line)}" stroke-width="${e.road ? 2.6 : 2.2}"${e.road ? '' : ' stroke-dasharray="1 5"'}/>`);
      else {
        const [ax, ay] = P(e.a);
        const [bx, by] = P(e.b);
        out.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke-width="2.2" stroke-dasharray="1 5"/>`);
      }
    }
    // Ways you haven't tried: a dashed start down the road, and a question mark.
    const marks = [];
    for (const pts of stubLines(game, model)) {
      out.push(`<path d="${pathOf(pts.flat())}" stroke-width="2.2" stroke-dasharray="7 5"/>`);
      marks.push(pts[pts.length - 1]);
    }
    out.push('</g>');
    // Marks drawn at a fixed size on screen: placed at the spot, scaled by the zoom (.map-k, see ui.js).
    for (const [x, y] of marks) {
      out.push(`<g transform="translate(${x} ${y})"><g class="map-k"><circle r="9" fill="#fffdf6" stroke="#2f2f2f" stroke-width="1.4"/><text class="map-q" y="5.5" font-size="15" text-anchor="middle">?</text></g></g>`);
    }

    // Pins: one pencil dot per spot you've stood, then a label block per site.
    const dots = new Set();
    for (const r of model.rooms) {
      const [x, y] = project(r.at);
      const k = x + ',' + y;
      if (dots.has(k)) continue;
      dots.add(k);
      out.push(`<g transform="translate(${x} ${y})"><g class="map-k"><circle r="4" fill="#2f2f2f"/></g></g>`);
    }
    // Zoomed in close: each place you've been labeled at its own spot.
    for (const r of model.rooms) {
      const [x, y] = project(r.at);
      out.push(`<g class="map-room-tag" transform="translate(${x} ${y})"><g class="map-k"><text class="map-site-room${r.here ? ' map-here-text' : ''}" x="7" y="4" font-size="13">${esc(r.label)}</text></g></g>`);
    }
    const sitesInfo = game.world.mapSites || {};
    const truckAt = game.state.items.truck && game.state.items.truck.loc;
    for (const site of model.sites) {
      const info = sitesInfo[site.id] || { name: site.id, label: [10, 4, 'start'] };
      const all = Object.values(game.rooms).filter((r) => r.map && r.map.site === site.id);
      const [ax, ay] = project(all[0].map.at);
      const [dx, dy, anchor] = info.label || [10, 4, 'start'];
      // A town whose stops all share one spot on the map gets a little street sketch instead of a list.
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
      // The note card stays the same size on screen at every zoom (map-k), pinned to the town.
      const x0 = anchor === 'end' ? dx - wMax : anchor === 'middle' ? dx - wMax / 2 : dx;
      out.push(`<g class="map-site-note" transform="translate(${ax} ${ay})"><g class="map-k">`);
      out.push(`<rect class="map-site-card" x="${x0 - 2}" y="${dy - 18}" width="${wMax}" height="${lines.length * lh + 6}" rx="4" fill="#fbf8ef" opacity="0.92"/>`);
      lines.forEach((l, i) => {
        const tx = anchor === 'end' ? dx - 6 : anchor === 'middle' ? dx : dx + 4;
        const prefix = i === 0 ? '' : (l.here ? '◉ ' : '· ');
        out.push(`<text class="${l.cls}${l.here ? ' map-here-text' : ''}" x="${tx}" y="${dy + i * lh}" font-size="${i === 0 ? 18 : 15}" text-anchor="${anchor}">${esc(prefix + l.text)}</text>`);
      });
      out.push('</g></g>');
      // Your truck, parked at one of this site's spots out in the country.
      const parked = all.find((r) => r.id === truckAt && byId[r.id]);
      if (parked) {
        const [tx, ty] = project(parked.map.at);
        out.push(`<g transform="translate(${tx} ${ty})"><g class="map-k">${truckIcon(6, 4)}</g></g>`);
      }
    }

    // You are here.
    if (model.hereId && byId[model.hereId]) {
      const [x, y] = P(model.hereId);
      // A red pin with its point on the spot and a tag above it, plus a ring that pulses so you can
      // find it at any zoom. The pin group grows when you zoom out (see ui.js), anchored at its point.
      out.push(`<g id="map-you-are-here">
  <g transform="translate(${x} ${y})"><g class="map-k"><circle class="map-you-ring" r="14" fill="none" stroke="#c0392b" stroke-width="3"/></g></g>
  <g class="map-pin">
    <g class="map-you-tag">
      <rect x="${x - 62}" y="${y - 70}" width="124" height="22" rx="4" fill="#c0392b"/>
      <text class="map-you-text" x="${x}" y="${y - 54}" font-size="14" text-anchor="middle" textLength="108" lengthAdjust="spacingAndGlyphs">YOU ARE HERE</text>
    </g>
    <path d="M${x},${y} C${x - 5},${y - 9} ${x - 14},${y - 17} ${x - 14},${y - 27} A14,14 0 1 1 ${x + 14},${y - 27} C${x + 14},${y - 17} ${x + 5},${y - 9} ${x},${y} Z" fill="#c0392b" stroke="#fffdf6" stroke-width="2"/>
    <circle cx="${x}" cy="${y - 27}" r="5.5" fill="#fffdf6"/>
  </g>
</g>`);
    }

    return out.join('\n');
  }

  root.NSH = root.NSH || {};
  root.NSH.renderMap = renderMap;
  root.NSH.renderSheet = renderSheet;
  root.NSH.renderPencil = renderPencil;
  root.NSH.mapModel = mapModel;
  root.NSH.project = project;
  root.NSH.mapView = mapView;
  root.NSH.wholeView = wholeView;
  if (typeof module === 'object' && module.exports) module.exports = { renderMap, renderSheet, renderPencil, mapModel, project, mapView, wholeView };
})(typeof window !== 'undefined' ? window : globalThis);
