/*
 * No Safe Harbor: the field map.
 *
 * renderMap(game) returns an SVG string: a true-scale map of Prince of Wales
 * Island on graph paper (one square = one kilometer), built from USGS data in
 * js/geodata.js. The coastline, lakes, rivers and roads are printed on the
 * sheet. Your own pencil work goes on top: a pin for every place you've been
 * (towns list the spots inside them), the real road routes you've driven, the
 * trails you've walked and rowed, a "?" for every way you haven't tried, and a
 * red circle where you are now.
 *
 * Pure string-building with no DOM, so it also runs under Node for tests.
 */
(function (root) {
  'use strict';

  const geo = root.NSH && root.NSH.geo ? root.NSH.geo
    : (typeof require === 'function' ? require('./geodata.js').geo : null);

  const STUB_PX = 70; // how far a "?" stub runs along an unexplored road

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
    for (const l of geo.roads.forest) out.push(`<path d="${pathOf(l)}" stroke="#c9c2b4" stroke-width="0.8" stroke-dasharray="3 3"/>`);
    for (const l of geo.roads.road) out.push(`<path d="${pathOf(l)}" stroke="#b9b1a2" stroke-width="1.4"/>`);
    for (const l of geo.roads.highway) out.push(`<path d="${pathOf(l)}" stroke="#a89f8e" stroke-width="2.6"/>`);
    out.push('</g>');
    for (const l of game.world.mapLabels || []) {
      const [x, y] = project(l.at);
      out.push(`<text class="map-label map-label-${esc(l.cls)}" x="${x}" y="${y}" font-size="${l.size}" text-anchor="middle" transform="rotate(${l.rotate || 0} ${x} ${y})">${esc(l.text)}</text>`);
    }
    baseCache = { labels: game.world.mapLabels, svg: out.join('\n') };
    return baseCache.svg;
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
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="map-svg" role="img" aria-label="${esc('Map of Prince of Wales Island. You are at ' + hereName + '.')}">`);
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
    for (const s of model.stubs) {
      const from = P(s.from);
      let pts;
      const route = s.road && geo.routes[s.key];
      if (route) pts = lead(route.line, from, STUB_PX);
      else {
        const to = P(s.to);
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const f = Math.min(1, Math.min(STUB_PX * 0.6, len * 0.6) / (len || 1));
        pts = [from, [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]];
      }
      out.push(`<path d="${pathOf(pts.flat())}" stroke-width="2.2" stroke-dasharray="5 5"/>`);
      marks.push(pts[pts.length - 1]);
    }
    out.push('</g>');
    for (const [x, y] of marks) {
      out.push(`<circle cx="${x}" cy="${y}" r="9" fill="#fbf8ef" opacity="0.85"/><text class="map-q" x="${x}" y="${y + 6}" font-size="17" text-anchor="middle">?</text>`);
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
      out.push(`<rect x="${x0 - 2}" y="${ay + dy - 18}" width="${wMax}" height="${lines.length * lh + 6}" rx="4" fill="#fbf8ef" opacity="0.92"/>`);
      lines.forEach((l, i) => {
        const tx = anchor === 'end' ? ax + dx - 6 : anchor === 'middle' ? ax + dx : ax + dx + 4;
        const prefix = i === 0 ? '' : (l.here ? '◉ ' : '· ');
        out.push(`<text class="${l.cls}${l.here ? ' map-here-text' : ''}" x="${tx}" y="${ay + dy + i * lh}" font-size="${i === 0 ? 18 : 15}" text-anchor="${anchor}">${esc(prefix + l.text)}</text>`);
      });
    }

    // You are here.
    if (model.hereId && byId[model.hereId]) {
      const [x, y] = P(model.hereId);
      out.push(`<g id="map-you-are-here" filter="url(#map-pencil)" fill="none" stroke="#c0392b" stroke-linecap="round">
  <circle cx="${x}" cy="${y}" r="17" stroke-width="3.2"/>
  <path d="M${x + 12},${y - 25} l10,10 m0,-10 l-10,10" stroke-width="3"/>
</g>`);
    }

    // Compass, scale bar, legend and title.
    // Legend, compass and scale sit in the empty country east of Thorne Lake, clear of every town.
    const kx = W - 60;
    const ky = 930;
    out.push(`<g stroke="#2f2f2f" stroke-width="2" fill="none" filter="url(#map-pencil)">
  <line x1="${kx}" y1="${ky + 34}" x2="${kx}" y2="${ky - 34}"/><line x1="${kx - 24}" y1="${ky}" x2="${kx + 24}" y2="${ky}"/>
  <path d="M${kx - 8},${ky - 22} L${kx},${ky - 36} L${kx + 8},${ky - 22}"/>
</g>
<text class="map-label" x="${kx}" y="${ky - 42}" font-size="18" text-anchor="middle">N</text>`);
    const sx = W - 236;
    const sy = 862;
    out.push(`<g stroke="#2f2f2f" stroke-width="2" fill="none">
  <path d="M${sx},${sy - 6} V${sy} H${sx + G * 5} V${sy - 6} M${sx + G * 2.5},${sy} v-4"/>
</g>
<text class="map-legend-text" x="${sx}" y="${sy - 12}" font-size="13">0</text>
<text class="map-legend-text" x="${sx + G * 5}" y="${sy - 12}" font-size="13" text-anchor="middle">5 km (3 mi)</text>`);
    const lx = W - 236;
    const ly = 700;
    out.push(`<g class="map-legend">
  <rect x="${lx - 6}" y="${ly - 24}" width="236" height="140" rx="4" fill="#fffdf6" stroke="#2f2f2f" stroke-width="1.3"/>
  <circle cx="${lx + 16}" cy="${ly}" r="9" fill="none" stroke="#c0392b" stroke-width="2.6"/>
  <text class="map-legend-text" x="${lx + 40}" y="${ly + 5}" font-size="14">you are here</text>
  <circle cx="${lx + 16}" cy="${ly + 26}" r="5" fill="#2f2f2f"/>
  <text class="map-legend-text" x="${lx + 40}" y="${ly + 31}" font-size="14">been there</text>
  <line x1="${lx + 2}" y1="${ly + 52}" x2="${lx + 30}" y2="${ly + 52}" stroke="#2f2f2f" stroke-width="3.2"/>
  <text class="map-legend-text" x="${lx + 40}" y="${ly + 57}" font-size="14">driven</text>
  <line x1="${lx + 2}" y1="${ly + 78}" x2="${lx + 30}" y2="${ly + 78}" stroke="#2f2f2f" stroke-width="2.2" stroke-dasharray="5 5"/>
  <text class="map-q" x="${lx + 40}" y="${ly + 83}" font-size="14">?</text>
  <text class="map-legend-text" x="${lx + 54}" y="${ly + 83}" font-size="14">not explored yet</text>
  <text class="map-legend-text" x="${lx + 2}" y="${ly + 106}" font-size="11.5">1 square = 1 km · USGS map data</text>
</g>`);
    out.push(`<rect x="10" y="10" width="420" height="30" rx="4" fill="#fbf8ef" opacity="0.88"/>`);
    out.push(`<text class="map-label map-title" x="18" y="31" font-size="17">Claim NM-1187 · field map · explored ${model.rooms.length} of ${model.total}</text>`);
    out.push('</svg>');
    return out.join('\n');
  }

  root.NSH = root.NSH || {};
  root.NSH.renderMap = renderMap;
  root.NSH.mapModel = mapModel;
  root.NSH.project = project;
  if (typeof module === 'object' && module.exports) module.exports = { renderMap, mapModel, project };
})(typeof window !== 'undefined' ? window : globalThis);
