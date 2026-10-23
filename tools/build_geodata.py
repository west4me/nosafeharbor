"""Build js/geodata.js: the real Prince of Wales Island under the game's map.

Sources (all public domain, from the USGS National Map, https://apps.nationalmap.gov/downloader/):
  - National Hydrography Dataset, HU8 19010103 (Prince of Wales Island), GeoPackage:
      https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/HU8/GPKG/NHD_H_19010103_HU8_GPKG.zip
  - National Transportation Dataset, Alaska, GeoPackage:
      https://prd-tnm.s3.amazonaws.com/StagedProducts/Tran/GPKG/TRAN_Alaska_State_GPKG.zip
  - Place coordinates in js/world.js come from GNIS (DomesticNames_AK) and the two datasets above.

Usage:
  pip install pyogrio shapely networkx
  python3 tools/build_geodata.py path/to/NHD_H_19010103_HU8_GPKG.gpkg path/to/TRAN_Alaska_State_GPKG.gpkg

Everything is projected to map pixels (PX_PER_KM pixels per kilometer, north up) and
simplified, so the browser only has to draw it.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import networkx as nx
import pyogrio.raw as raw
import shapely

ROOT = Path(__file__).resolve().parent.parent
NHD, TRAN = sys.argv[1], sys.argv[2]

# The whole island, Cape Chacon to Point Baker, with Dall and Kosciusko islands along the west side.
LON0, LON1, LAT0, LAT1 = -133.72, -131.95, 54.66, 56.38
MID_LAT = (LAT0 + LAT1) / 2
KM_X = 111.32 * math.cos(math.radians(MID_LAT))  # km per degree of longitude here
KM_Y = 110.57                                     # km per degree of latitude
PX_PER_KM = 26
WIDTH = round((LON1 - LON0) * KM_X * PX_PER_KM)
HEIGHT = round((LAT1 - LAT0) * KM_Y * PX_PER_KM)
VIEW = shapely.box(LON0 - 0.03, LAT0 - 0.02, LON1 + 0.03, LAT1 + 0.02)
BBOX = VIEW.bounds


def px(lon, lat):
    return [round((lon - LON0) * KM_X * PX_PER_KM, 1), round((LAT1 - lat) * KM_Y * PX_PER_KM, 1)]


def km(a, b):
    return math.hypot((a[0] - b[0]) * KM_X, (a[1] - b[1]) * KM_Y)


def read(path, layer, cols):
    meta, _, geoms, fields = raw.read(path, layer=layer, columns=cols, bbox=BBOX, return_fids=True)
    names = list(meta['fields'])
    return [dict(zip(names, [f[i] for f in fields]), geom=shapely.force_2d(shapely.from_wkb(geoms[i])))
            for i in range(len(geoms))]


def parts(g):
    return [] if g.is_empty else list(getattr(g, 'geoms', [g]))


def flat(coords, step=1):
    """[[x, y], ...] in pixels, rounded; drops consecutive duplicates."""
    out = []
    for lon, lat in coords:
        p = [round(v) for v in px(lon, lat)]
        if not out or p != out[-1]:
            out.append(p)
    return [v for p in out for v in p]


def lines(geoms, tol):
    merged = shapely.line_merge(shapely.union_all(geoms)) if geoms else shapely.GeometryCollection()
    out = []
    for ln in parts(shapely.simplify(merged.intersection(VIEW), tol)):
        if ln.geom_type == 'LineString' and len(ln.coords) > 1:
            out.append(flat(ln.coords))
    return out


def polys(geom, tol, min_km2):
    out = []
    for poly in parts(shapely.simplify(geom.intersection(VIEW), tol, preserve_topology=True)):
        if poly.geom_type != 'Polygon':
            continue
        rings = [flat(poly.exterior.coords)]
        for hole in poly.interiors:
            if shapely.Polygon(hole).area * KM_X * KM_Y >= min_km2:
                rings.append(flat(hole.coords))
        out.append(rings)
    return out


# ------------------------------------------------------------------ water
area = read(NHD, 'NHDArea', ['ftype'])
sea = shapely.union_all([a['geom'] for a in area if a['ftype'] == 445])  # FType 445 = Sea/Ocean
sea_out = polys(sea, 0.0006, 0.02)

lakes_out, labels = [], []
for w in read(NHD, 'NHDWaterbody', ['gnis_name', 'areasqkm']):
    if (w['areasqkm'] or 0) < 0.08 or not w['geom'].intersects(VIEW):
        continue
    lakes_out += polys(w['geom'], 0.0003, 0.05)
    if w['gnis_name'] and w['areasqkm'] > 0.3:
        p = w['geom'].representative_point()
        if VIEW.contains(p):
            labels.append({'text': w['gnis_name'], 'at': px(p.x, p.y), 'cls': 'lake'})

RIVERS = ['Thorne River', 'Harris River', 'Klawock River', 'Dog Creek', 'Eagle Creek', 'Coffman Creek']
flows = read(NHD, 'NHDFlowline', ['gnis_name'])
rivers_out = []
for name in RIVERS:
    geoms = [f['geom'] for f in flows if f['gnis_name'] == name]
    segs = lines(geoms, 0.0002)
    if segs:
        rivers_out.append({'name': name, 'lines': segs})
        longest = max(parts(shapely.line_merge(shapely.union_all(geoms)).intersection(VIEW)), key=lambda g: g.length)
        mid = longest.interpolate(0.5, normalized=True)
        labels.append({'text': name.replace('River', 'R.').replace('Creek', 'Cr.'), 'at': px(mid.x, mid.y), 'cls': 'river'})
streams_out = lines([f['geom'] for f in flows if f['gnis_name'] and f['gnis_name'] not in RIVERS], 0.0004)

# ------------------------------------------------------------------ roads
roads = read(TRAN, 'Trans_RoadSegment', ['mtfcc_code', 'name'])
# The island's main roads: the paved highways, plus the big gravel roads everyone drives between towns.
MAIN_NAMES = {'Kasaan Highway', 'KASAAN ROAD', 'COFFMAN COVE LOOP', 'Coffman Cove Road', 'COFFMAN TIE',
              'NORTH PRINCE OF WALES ROAD', 'North Prince of Wales Road', 'NORTH PRINCE OF WALES', 'Thorne Bay Road',
              'Naukati Road', 'South Whale Pass Road', 'NFD 3030 ROAD', 'Sandy Beach Road'}
is_main = lambda r: r['mtfcc_code'] in ('S1100', 'S1200') or r['name'] in MAIN_NAMES
roads_out = {
    'highway': lines([r['geom'] for r in roads if is_main(r)], 0.0003),
    'road': lines([r['geom'] for r in roads if r['mtfcc_code'] == 'S1400' and not is_main(r)], 0.0003),
    'forest': lines([r['geom'] for r in roads if r['mtfcc_code'] == 'S1500'], 0.0006),
}

# The road network, to trace the real route of every drive in the game.
G = nx.Graph()
for r in roads:
    for ln in parts(r['geom']):
        c = [(round(x, 5), round(y, 5)) for x, y in ln.coords]
        for a, b in zip(c, c[1:]):
            G.add_edge(a, b, w=km(a, b))
G = G.subgraph(max(nx.connected_components(G), key=len)).copy()
nodes = list(G.nodes)


def snap(p):
    return min(nodes, key=lambda n: km(n, p))


places = json.loads(subprocess.check_output(['node', str(ROOT / 'tools' / 'dump_places.js')]))
routes = {}
for rid, room in places['rooms'].items():
    for ex in room['exits']:
        key = '|'.join(sorted([rid, ex['to']]))
        if key in routes:
            continue
        a, b = room['at'], places['rooms'][ex['to']]['at']
        sa, sb = snap(tuple(a)), snap(tuple(b))
        if not ex['road']:
            # A walk in town follows the streets, when both ends are right on one (not trails, rivers or lakes).
            if a == b or km(sa, tuple(a)) > 0.12 or km(sb, tuple(b)) > 0.12:
                continue
        path = nx.shortest_path(G, sa, sb, weight='w')
        length = sum(G[u][v]['w'] for u, v in zip(path, path[1:]))
        # Skip walks the street network can't explain: no distance at all, or far longer than the straight line.
        if not ex['road'] and (length < 0.05 or length > 3 * km(tuple(a), tuple(b)) + 0.3):
            continue
        line = shapely.simplify(shapely.LineString([tuple(a)] + path + [tuple(b)]), 0.0002 if ex['road'] else 0.00003)
        routes[key] = {'km': round(length, 1), 'line': flat(line.coords), **({} if ex['road'] else {'walk': True})}
        print(f'  {"route" if ex["road"] else "walk "} {key:34s} {length:5.1f} km', file=sys.stderr)

# ------------------------------------------------------------------ town detail
# Street-level maps of the towns the story walks around in: the real shoreline, every named street and
# the creeks, barely simplified. The game shows these when you zoom in close.
TOWNS = {
    'craig': (-133.200, 55.452, -133.095, 55.502),
    'klawock': (-133.130, 55.530, -133.050, 55.578),
    'coffman': (-132.870, 55.990, -132.795, 56.032),
}
STREET_ABBR = [(' Street', ' St'), (' Avenue', ' Ave'), (' Drive', ' Dr'), (' Road', ' Rd'), (' Boulevard', ' Blvd'),
               (' Court', ' Ct'), (' Lane', ' Ln'), (' Place', ' Pl')]


def street_name(n):
    if not n or n.startswith('Unnamed') or n.upper() == n and len(n) > 4 and 'NFD' not in n:
        n = n.title() if n else n
    if not n or n.startswith('Unnamed'):
        return None
    n = n.replace('Craig/Klawock/Hollis Highway', 'Craig–Klawock Hwy')
    if n.upper().startswith('NFD 3030'):
        return 'NF-3030'
    for a, b in STREET_ABBR:
        if n.endswith(a):
            n = n[: -len(a)] + b
    return n


detail = []
for town, bb in TOWNS.items():
    box = shapely.box(*bb)
    def clip_lines(geoms, tol):
        out = []
        merged = shapely.line_merge(shapely.union_all(geoms)) if geoms else shapely.GeometryCollection()
        for ln in parts(shapely.simplify(merged.intersection(box), tol)):
            if ln.geom_type == 'LineString' and len(ln.coords) > 1:
                out.append(flat(ln.coords))
        return out
    sea_t = []
    for poly in parts(shapely.simplify(sea.intersection(box), 0.00002, preserve_topology=True)):
        if poly.geom_type == 'Polygon':
            sea_t.append([flat(poly.exterior.coords)] + [flat(h.coords) for h in poly.interiors])
    t_roads = [r for r in roads if r['geom'].intersects(box)]
    by_name = {}
    for r in t_roads:
        by_name.setdefault((street_name(r['name']), is_main(r)), []).append(r['geom'])
    streets = []
    for (name, main), geoms in by_name.items():
        for line in clip_lines(geoms, 0.00002):
            streets.append({'name': name, 'main': main, 'line': line})
    creeks = clip_lines([f['geom'] for f in flows if f['geom'].intersects(box)], 0.00002)
    x0, y1 = px(bb[0], bb[1])
    x1, y0 = px(bb[2], bb[3])
    detail.append({'town': town, 'box': [x0, y0, x1, y1], 'sea': sea_t, 'streets': streets, 'creeks': creeks})
    print(f'  detail {town}: {len(streets)} street lines, {sum(len(r) for p in sea_t for r in p) // 2} shore pts', file=sys.stderr)

geo = {
    'source': 'USGS National Map: NHD HU8 19010103, National Transportation Dataset (Alaska), GNIS.',
    'view': {'lon0': LON0, 'lon1': LON1, 'lat0': LAT0, 'lat1': LAT1, 'kmX': round(KM_X, 4), 'kmY': KM_Y, 'pxPerKm': PX_PER_KM},
    'width': WIDTH, 'height': HEIGHT,
    'sea': sea_out, 'lakes': lakes_out, 'rivers': rivers_out, 'streams': streams_out,
    'roads': roads_out, 'routes': routes, 'labels': labels, 'detail': detail,
}
body = json.dumps(geo, separators=(',', ':'))
js = ("/*\n * No Safe Harbor: the real island, for the map. GENERATED by tools/build_geodata.py; don't edit by hand.\n"
      " * " + geo['source'] + "\n */\n"
      "(function (root) {\n  'use strict';\n  const geo = " + body + ";\n"
      "  root.NSH = root.NSH || {};\n  root.NSH.geo = geo;\n"
      "  if (typeof module === 'object' && module.exports) module.exports = { geo };\n"
      "})(typeof window !== 'undefined' ? window : globalThis);\n")
(ROOT / 'js' / 'geodata.js').write_text(js)
count = lambda rings: sum(len(r) // 2 for poly in rings for r in poly)
print(f'wrote js/geodata.js: {len(js) / 1024:.0f} KB, {WIDTH}x{HEIGHT}px, sea {count(sea_out)} pts, '
      f'lakes {count(lakes_out)} pts, {len(routes)} routes', file=sys.stderr)
