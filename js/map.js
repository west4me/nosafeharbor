/*
 * No Safe Harbor: graph-paper map.
 *
 * renderMap(game) returns an SVG string drawn the way you'd map Zork on
 * graph paper: the island outline is printed on the sheet, and only the
 * places you've actually been are penciled in. Paths you've walked are
 * drawn as lines, exits you haven't tried get a short "?" stub, and a red
 * circle marks where you are.
 *
 * Pure string-building with no DOM, so it also runs under Node for tests.
 */
(function (root) {
  'use strict';

  const SX = 120;            // px per grid step, east-west
  const SY = 100;            // px per grid step, north-south
  const GRID = 20;           // graph-paper square size (divides SX and SY)
  const BOX_W = 96;
  const BOX_H = 52;
  const STUB = 16;
  const COMPASS = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
    northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1]
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const r1 = (n) => Math.round(n * 10) / 10;

  // Catmull-Rom spline through points -> smooth cubic Bezier path.
  function smoothPath(pts, closed) {
    const n = pts.length;
    const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(p2[0])},${r1(p2[1])}`;
    }
    return closed ? d + ' Z' : d;
  }

  function exitTarget(exit) {
    return typeof exit === 'string' ? exit : exit.to;
  }

  // Everything the map needs to know, separate from drawing so tests can check it.
  function mapModel(game) {
    const st = game.state;
    const visited = st.visited || {};
    const lit = st.lit || null;
    const rooms = Object.values(game.rooms).filter((r) => r.map && visited[r.id]);
    // Some places (the truck cab) aren't on the map; they show up as wherever they are.
    const cur = game.rooms[st.loc];
    const hereId = cur.mapAs ? (typeof cur.mapAs === 'function' ? cur.mapAs(game) : cur.mapAs) : st.loc;
    const edges = [];
    const stubs = [];
    const seen = new Set();
    for (const r of rooms) {
      for (const [dir, exit] of Object.entries(r.exits)) {
        if (!COMPASS[dir]) continue; // up/down/in/out duplicate a compass exit in this world
        const to = exitTarget(exit);
        if (visited[to] && game.rooms[to].map) {
          const key = [r.id, to].sort().join('|');
          if (!seen.has(key)) { seen.add(key); edges.push([r.id, to]); }
        } else {
          stubs.push({ from: r.id, dir });
        }
      }
    }
    return {
      rooms: rooms.map((r) => ({
        id: r.id,
        x: r.map.x,
        y: r.map.y,
        label: r.dark && lit && !lit[r.id] ? ['Dark!'] : (r.map.label || [r.name]),
        here: r.id === hereId
      })),
      edges,
      stubs,
      total: Object.values(game.rooms).filter((r) => r.map).length
    };
  }

  function renderMap(game) {
    const geo = game.world.mapGeo;
    const v = geo.view;
    const W = Math.round((v.x1 - v.x0) * SX);
    const H = Math.round((v.y1 - v.y0) * SY);
    // Snap so grid lines land on room centers.
    const ox = Math.round(-v.x0 * SX / GRID) * GRID;
    const oy = Math.round(-v.y0 * SY / GRID) * GRID;
    const X = (x) => ox + x * SX;
    const Y = (y) => oy + y * SY;
    const P = (p) => [X(p[0]), Y(p[1])];

    const model = mapModel(game);
    const pos = {};
    for (const r of model.rooms) pos[r.id] = [X(r.x), Y(r.y)];
    const here = model.rooms.find((r) => r.here);
    const hereName = here ? game.status().location : '';

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="map-svg" role="img" aria-label="${esc('Map of Prince of Wales Island. You are at ' + hereName + '.')}">`);
    out.push(`<defs>
  <pattern id="map-grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse" x="${ox % GRID}" y="${oy % GRID}">
    <path d="M${GRID},0 L0,0 0,${GRID}" fill="none" stroke="#bcd3ea" stroke-width="1"/>
  </pattern>
  <pattern id="map-grid-major" width="${GRID * 5}" height="${GRID * 5}" patternUnits="userSpaceOnUse" x="${ox % (GRID * 5)}" y="${oy % (GRID * 5)}">
    <path d="M${GRID * 5},0 L0,0 0,${GRID * 5}" fill="none" stroke="#9dbbdc" stroke-width="1.4"/>
  </pattern>
  <pattern id="map-water" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <line x1="0" y1="0" x2="0" y2="10" stroke="#8fb0d4" stroke-width="1.6"/>
  </pattern>
  <filter id="map-pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/>
    <feDisplacementMap in="SourceGraphic" scale="3.2"/>
  </filter>
</defs>`);

    // Paper, water hatching, the island, then graph lines over everything.
    out.push(`<rect width="${W}" height="${H}" fill="#fbf8ef"/>`);
    out.push(`<rect width="${W}" height="${H}" fill="url(#map-water)" opacity="0.55"/>`);
    out.push(`<path d="${smoothPath(geo.coast.map(P), true)}" fill="#fbf8ef"/>`);
    for (const isl of geo.islets) {
      out.push(`<ellipse cx="${X(isl.x)}" cy="${Y(isl.y)}" rx="${isl.rx * SX}" ry="${isl.ry * SY}" fill="#fbf8ef"/>`);
    }
    out.push(`<rect width="${W}" height="${H}" fill="url(#map-grid)"/>`);
    out.push(`<rect width="${W}" height="${H}" fill="url(#map-grid-major)"/>`);

    // Coastline and rivers, in pencil.
    out.push(`<g filter="url(#map-pencil)" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    out.push(`<path d="${smoothPath(geo.coast.map(P), true)}" stroke="#3d4a5c" stroke-width="3"/>`);
    for (const isl of geo.islets) {
      out.push(`<ellipse cx="${X(isl.x)}" cy="${Y(isl.y)}" rx="${isl.rx * SX}" ry="${isl.ry * SY}" stroke="#3d4a5c" stroke-width="2.5"/>`);
    }
    for (const rv of geo.rivers) {
      out.push(`<path d="${smoothPath(rv.pts.map(P), false)}" stroke="#5b8fc7" stroke-width="3.5"/>`);
    }
    out.push('</g>');

    // Scenery labels.
    for (const l of geo.labels) {
      out.push(`<text class="map-label map-label-${esc(l.cls)}" x="${X(l.x)}" y="${Y(l.y)}" font-size="${l.size}" text-anchor="middle" transform="rotate(${l.rotate || 0} ${X(l.x)} ${Y(l.y)})">${esc(l.text)}</text>`);
    }
    for (const isl of geo.islets) {
      out.push(`<text class="map-label map-label-water" x="${X(isl.x)}" y="${Y(isl.y + isl.ry) + 18}" font-size="14" text-anchor="middle">${esc(isl.label)}</text>`);
    }
    for (const rv of geo.rivers) {
      out.push(`<text class="map-label map-label-river" x="${X(rv.lx)}" y="${Y(rv.ly)}" font-size="14" text-anchor="middle">${esc(rv.label)}</text>`);
    }

    // Paths between places you've been, then "?" stubs for untried exits.
    out.push(`<g filter="url(#map-pencil)" stroke="#2f2f2f" stroke-width="2.6" stroke-linecap="round" fill="none">`);
    for (const [a, b] of model.edges) {
      out.push(`<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/>`);
    }
    for (const s of model.stubs) {
      const [dx, dy] = COMPASS[s.dir];
      const [cx, cy] = pos[s.from];
      const sx = cx + dx * BOX_W / 2, sy = cy + dy * BOX_H / 2;
      out.push(`<line x1="${sx}" y1="${sy}" x2="${sx + dx * STUB}" y2="${sy + dy * STUB}" stroke-dasharray="4 4"/>`);
    }
    out.push('</g>');
    for (const s of model.stubs) {
      const [dx, dy] = COMPASS[s.dir];
      const [cx, cy] = pos[s.from];
      const qx = cx + dx * (BOX_W / 2 + STUB + 7);
      const qy = cy + dy * (BOX_H / 2 + STUB + 7) + 5;
      out.push(`<text class="map-q" x="${qx}" y="${qy}" font-size="16" text-anchor="middle">?</text>`);
    }

    // Room boxes.
    for (const r of model.rooms) {
      const [cx, cy] = pos[r.id];
      out.push(`<g class="map-room${r.here ? ' map-here' : ''}"${r.here ? ' id="map-you-are-here"' : ''}>`);
      out.push(`<rect x="${cx - BOX_W / 2}" y="${cy - BOX_H / 2}" width="${BOX_W}" height="${BOX_H}" rx="4" fill="#fffdf6" stroke="#2f2f2f" stroke-width="2.2" filter="url(#map-pencil)"/>`);
      const lines = r.label;
      const lh = 18;
      const top = cy - ((lines.length - 1) * lh) / 2 + 6;
      lines.forEach((line, i) => {
        out.push(`<text class="map-room-label" x="${cx}" y="${top + i * lh}" font-size="17" text-anchor="middle">${esc(line)}</text>`);
      });
      out.push('</g>');
    }

    // You are here: a red pencil circle and an X.
    if (here) {
      const [cx, cy] = pos[here.id];
      out.push(`<g filter="url(#map-pencil)" fill="none" stroke="#c0392b" stroke-linecap="round">`);
      out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${BOX_W / 2 + 12}" ry="${BOX_H / 2 + 11}" stroke-width="3.2"/>`);
      out.push(`<path d="M${cx + BOX_W / 2 - 4},${cy - BOX_H / 2 - 16} l12,12 m0,-12 l-12,12" stroke-width="3"/>`);
      out.push('</g>');
    }

    // Compass rose and legend.
    const kx = X(5.6), ky = Y(7.1);
    out.push(`<g class="map-compass" stroke="#2f2f2f" stroke-width="2.2" fill="none" filter="url(#map-pencil)">
  <line x1="${kx}" y1="${ky + 34}" x2="${kx}" y2="${ky - 34}"/><line x1="${kx - 26}" y1="${ky}" x2="${kx + 26}" y2="${ky}"/>
  <path d="M${kx - 8},${ky - 22} L${kx},${ky - 36} L${kx + 8},${ky - 22}"/>
</g>
<text class="map-label" x="${kx}" y="${ky - 42}" font-size="18" text-anchor="middle">N</text>`);

    const lx = X(-2.05), ly = Y(6.55);
    out.push(`<g class="map-legend">
  <rect x="${lx - 6}" y="${ly - 22}" width="218" height="104" fill="#fffdf6" stroke="#2f2f2f" stroke-width="1.5" filter="url(#map-pencil)"/>
  <ellipse cx="${lx + 18}" cy="${ly}" rx="14" ry="9" fill="none" stroke="#c0392b" stroke-width="2.6"/>
  <text class="map-legend-text" x="${lx + 42}" y="${ly + 5}" font-size="15">you are here</text>
  <rect x="${lx + 6}" y="${ly + 20}" width="24" height="16" rx="2" fill="none" stroke="#2f2f2f" stroke-width="2"/>
  <text class="map-legend-text" x="${lx + 42}" y="${ly + 33}" font-size="15">been there</text>
  <line x1="${lx + 6}" y1="${ly + 56}" x2="${lx + 22}" y2="${ly + 56}" stroke="#2f2f2f" stroke-width="2" stroke-dasharray="4 4"/>
  <text class="map-q" x="${lx + 28}" y="${ly + 61}" font-size="15">?</text>
  <text class="map-legend-text" x="${lx + 42}" y="${ly + 61}" font-size="15">not explored</text>
</g>`);

    out.push(`<text class="map-label map-title" x="${X(-2.05)}" y="${Y(-0.75)}" font-size="16">Claim NM-1187 · field map · explored ${model.rooms.length} of ${model.total}</text>`);
    out.push('</svg>');
    return out.join('\n');
  }

  root.NSH = root.NSH || {};
  root.NSH.renderMap = renderMap;
  root.NSH.mapModel = mapModel;
  if (typeof module === 'object' && module.exports) module.exports = { renderMap, mapModel };
})(typeof window !== 'undefined' ? window : globalThis);
