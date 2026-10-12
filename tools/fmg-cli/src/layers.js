// Builds GeoJSON FeatureCollections for every map layer
import { dissolve, signedArea } from "./dissolve.js";

const SEA_LEVEL = 20;
const rn = (v, d) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};
const alive = entity => entity && typeof entity === "object" && !entity.removed;
const clean = props => Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== null));
const stripHtml = html => (typeof html === "string" ? html.replace(/<[^>]+>/g, "").trim() || undefined : undefined);

export const LAYERS = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "biomes",
  "land",
  "lakes",
  "zones",
  "burgs",
  "markers",
  "rivers",
  "routes",
  "cells"
];
export const DEFAULT_LAYERS = LAYERS.filter(name => name !== "cells");

/** crs "geo": longitude/latitude from the map's world settings; "pixel": map pixels with y flipped up */
export function makeProjection(world, crs = "geo") {
  const { width, height, coordinates: c } = world;
  const clampX = x => Math.min(Math.max(x, 0), width);
  const clampY = y => Math.min(Math.max(y, 0), height);
  if (crs === "pixel") return ([x, y]) => [rn(clampX(x), 2), rn(-clampY(y), 2)];
  if (!c) throw new Error("Map has no world coordinates, use --crs pixel");
  return ([x, y]) => [rn(c.lonW + (clampX(x) / width) * c.lonT, 5), rn(c.latN - (clampY(y) / height) * c.latT, 5)];
}

export function buildLayers(world, { layers = DEFAULT_LAYERS, crs = "geo" } = {}) {
  const project = makeProjection(world, crs);
  const ctx = { world, project, cellCount: world.cells.v.length };
  const builders = { states, provinces, cultures, religions, biomes, land, lakes, zones, burgs, markers, rivers, routes, cells };
  const result = {};
  for (const name of layers) {
    if (!builders[name]) throw new Error(`Unknown layer "${name}". Available: ${LAYERS.join(", ")}`);
    result[name] = { type: "FeatureCollection", name, features: builders[name](ctx) };
  }
  return result;
}

// Sutherland–Hodgman against the map rectangle: border cells reach past the canvas edge
function clipRing(ring, width, height) {
  const edges = [
    [p => p[0] >= 0, (a, b) => lerp(a, b, (0 - a[0]) / (b[0] - a[0]))],
    [p => p[0] <= width, (a, b) => lerp(a, b, (width - a[0]) / (b[0] - a[0]))],
    [p => p[1] >= 0, (a, b) => lerp(a, b, (0 - a[1]) / (b[1] - a[1]))],
    [p => p[1] <= height, (a, b) => lerp(a, b, (height - a[1]) / (b[1] - a[1]))]
  ];
  let out = ring;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) out.push(cross(previous, current));
        out.push(current);
      } else if (inside(previous)) out.push(cross(previous, current));
    }
    if (!out.length) break;
  }
  return out;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function polygonGeometry(ctx, polygons) {
  const { width, height } = ctx.world;
  const coordinates = polygons
    .map(rings => rings.map(ring => clipRing(ring, width, height)).filter(ring => ring.length >= 3))
    .filter(rings => rings.length)
    .map(rings =>
      rings.map((ring, index) => {
        const projected = ring.map(ctx.project).filter((p, i, all) => i === 0 || String(p) !== String(all[i - 1]));
        projected.push(projected[0]);
        const ccw = signedArea(projected) < 0; // y-up: exterior counter-clockwise (RFC 7946)
        return ccw === (index === 0) ? projected : projected.reverse();
      })
    )
    .filter(rings => Math.abs(signedArea(rings[0])) > 0);
  if (!coordinates.length) return null;
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

/** One feature per entity: cells grouped by `cells[key]` */
function regions(ctx, key, entities, props, accept = () => true) {
  const values = ctx.world.cells[key];
  const groups = new Map();
  for (let cell = 0; cell < ctx.cellCount; cell++) {
    const id = values[cell];
    if (!id || !accept(cell)) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(cell);
  }
  const features = [];
  for (const [id, cellIds] of groups) {
    const entity = entities[id];
    if (!alive(entity)) continue;
    const geometry = polygonGeometry(
      ctx,
      dissolve(ctx.world, cellIds, cell => values[cell] === id && accept(cell))
    );
    if (geometry) features.push({ type: "Feature", id, properties: clean(props(entity, cellIds)), geometry });
  }
  return features.sort((a, b) => a.id - b.id);
}

const population = (ctx, rural = 0, urban = 0) => {
  const { populationRate, urbanization } = ctx.world.units;
  return Math.round((rural + urban * urbanization) * populationRate);
};
const isLand = ctx => cell => ctx.world.cells.h[cell] >= SEA_LEVEL;
const nameOf = (list, id) => (alive(list[id]) ? list[id].name : undefined);

function states(ctx) {
  const { states: list, burgs: burgList, cultures } = ctx.world;
  const relations = s => {
    if (!Array.isArray(s.diplomacy)) return undefined;
    const out = {};
    s.diplomacy.forEach((relation, other) => {
      if (other && other !== s.i && alive(list[other]) && relation !== "x") out[list[other].name] = relation;
    });
    return JSON.stringify(out);
  };
  return regions(ctx, "state", list, s => ({
    id: s.i,
    name: s.name,
    fullName: s.fullName,
    form: s.form,
    formName: s.formName,
    color: s.color,
    capital: nameOf(burgList, s.capital),
    culture: nameOf(cultures, s.culture),
    type: s.type,
    population: population(ctx, s.rural, s.urban),
    burgs: s.burgs,
    cells: s.cells,
    neighbors: Array.isArray(s.neighbors) ? s.neighbors.filter(n => alive(list[n])).map(n => list[n].name).join(", ") : undefined,
    diplomacy: relations(s),
    note: stripHtml(s.note)
  }));
}

function provinces(ctx) {
  const { provinces: list, states: stateList, burgs: burgList } = ctx.world;
  const names = ids => (Array.isArray(ids) ? ids.filter(i => alive(stateList[i])).map(i => stateList[i].name) : []);
  return regions(ctx, "province", list, p => {
    const controller = p.controller && p.controller !== p.state ? p.controller : p.state;
    return {
      id: p.i,
      name: p.name,
      fullName: p.fullName,
      formName: p.formName,
      color: p.color,
      state: nameOf(stateList, p.state),
      stateId: p.state,
      controller: nameOf(stateList, controller),
      controllerId: controller,
      occupied: controller !== p.state,
      cores: names(p.cores).join(", ") || undefined,
      claims: names(p.claims).join(", ") || undefined,
      capital: nameOf(burgList, p.burg),
      population: population(ctx, p.rural, p.urban),
      note: stripHtml(p.note)
    };
  });
}

function cultures(ctx) {
  return regions(ctx, "culture", ctx.world.cultures, c => ({
    id: c.i,
    name: c.name,
    type: c.type,
    color: c.color,
    code: c.code,
    population: population(ctx, c.rural, c.urban),
    note: stripHtml(c.note)
  }));
}

function religions(ctx) {
  return regions(ctx, "religion", ctx.world.religions, r => ({
    id: r.i,
    name: r.name,
    type: r.type,
    form: r.form,
    deity: r.deity,
    color: r.color,
    population: population(ctx, r.rural, r.urban),
    note: stripHtml(r.note)
  }));
}

function biomes(ctx) {
  const list = ctx.world.biomes.map((b, i) => (b && typeof b === "object" ? { i, ...b } : b));
  return regions(ctx, "biome", list, b => ({ id: b.i, name: b.name, color: b.color }), isLand(ctx));
}

function land(ctx) {
  const list = ctx.world.features.map(f => (f && f.land ? f : null));
  ensureFeatureCells(ctx.world);
  return regions(ctx, "f", list, f => ({ id: f.i, name: f.name, type: f.subtype ?? f.type, note: stripHtml(f.note) }));
}

function lakes(ctx) {
  const list = ctx.world.features.map(f => (f && f.type === "lake" ? f : null));
  ensureFeatureCells(ctx.world);
  return regions(ctx, "f", list, f => ({ id: f.i, name: f.name, type: f.subtype, note: stripHtml(f.note) }));
}

// .map files don't store packed feature ids: flood-fill each island and lake from its first cell
function ensureFeatureCells(world) {
  const { cells, features } = world;
  if (cells.f) return;
  const n = cells.v.length;
  cells.f = new Array(n).fill(0);
  for (const feature of features) {
    if (!feature || typeof feature !== "object" || feature.type === "ocean") continue;
    const start = feature.firstCell;
    if (start === undefined || start >= n || cells.f[start]) continue;
    const land = cells.h[start] >= SEA_LEVEL;
    const queue = [start];
    cells.f[start] = feature.i;
    while (queue.length) {
      const cell = queue.pop();
      for (const next of cells.c[cell]) {
        if (cells.f[next] || cells.h[next] >= SEA_LEVEL !== land) continue;
        cells.f[next] = feature.i;
        queue.push(next);
      }
    }
  }
}

function zones(ctx) {
  const features = [];
  for (const zone of ctx.world.zones) {
    if (!alive(zone) || !zone.cells?.length) continue;
    const members = new Set(zone.cells.filter(c => c < ctx.cellCount));
    const geometry = polygonGeometry(ctx, dissolve(ctx.world, members, cell => members.has(cell)));
    if (!geometry) continue;
    const properties = clean({ id: zone.i, name: zone.name, type: zone.type, color: zone.color, hidden: zone.hidden });
    features.push({ type: "Feature", id: zone.i, properties, geometry });
  }
  return features;
}

function point(ctx, id, x, y, properties) {
  return { type: "Feature", id, properties: clean(properties), geometry: { type: "Point", coordinates: ctx.project([x, y]) } };
}

function burgs(ctx) {
  const { burgs: list, states: stateList, provinces: provinceList, cultures, religions: religionList, cells } = ctx.world;
  const { populationRate, urbanization } = ctx.world.units;
  return list.filter(alive).map(b =>
    point(ctx, b.i, b.x, b.y, {
      id: b.i,
      name: b.name,
      state: nameOf(stateList, b.state),
      province: nameOf(provinceList, cells.province[b.cell]),
      culture: nameOf(cultures, b.culture),
      religion: nameOf(religionList, cells.religion[b.cell]),
      group: b.group,
      type: b.type,
      population: Math.round((b.population ?? 0) * populationRate * urbanization),
      capital: !!b.capital,
      port: !!b.port,
      citadel: !!b.citadel,
      walls: !!b.walls,
      temple: !!b.temple,
      plaza: !!b.plaza,
      shanty: !!b.shanty,
      note: stripHtml(b.note)
    })
  );
}

function markers(ctx) {
  return ctx.world.markers
    .filter(alive)
    .map(m => point(ctx, m.i, m.x, m.y, { id: m.i, name: m.name, type: m.type, icon: m.icon, note: stripHtml(m.note) }));
}

function line(ctx, id, points, properties) {
  if (points.length < 2) return null;
  return { type: "Feature", id, properties: clean(properties), geometry: { type: "LineString", coordinates: points.map(ctx.project) } };
}

function rivers(ctx) {
  const centers = ctx.world.cells.p;
  return ctx.world.rivers
    .filter(alive)
    .map(r => {
      const points = r.points?.length ? r.points : riverCells(ctx, r).map(c => centers[c]);
      return line(ctx, r.i, points, {
        id: r.i,
        name: r.name,
        type: r.type,
        parent: r.parent && r.parent !== r.i ? r.parent : undefined,
        basin: r.basin,
        discharge: r.discharge,
        length: r.length,
        width: r.width,
        note: stripHtml(r.note)
      });
    })
    .filter(Boolean);
}

// very old maps keep no river path: order the river's cells by water flux, source to mouth
function riverCells(ctx, river) {
  const { r, fl } = ctx.world.cells;
  if (river.cells?.length) return river.cells.filter(c => c >= 0 && c < ctx.cellCount);
  const own = [];
  for (let c = 0; c < ctx.cellCount; c++) if (r[c] === river.i) own.push(c);
  return own.sort((a, b) => fl[a] - fl[b]);
}

function routes(ctx) {
  return ctx.world.routes
    .filter(alive)
    .map(r => line(ctx, r.i, (r.points ?? []).map(([x, y]) => [x, y]), { id: r.i, name: r.name, group: r.group, length: r.length }))
    .filter(Boolean);
}

function cells(ctx) {
  const { cells: c, vertices } = ctx.world;
  const features = [];
  for (let i = 0; i < ctx.cellCount; i++) {
    const ring = c.v[i].map(v => vertices.p[v]);
    const geometry = polygonGeometry(ctx, [[ring]]);
    if (!geometry) continue;
    features.push({
      type: "Feature",
      id: i,
      properties: {
        id: i,
        height: c.h[i],
        biome: c.biome[i],
        state: c.state[i],
        province: c.province[i],
        culture: c.culture[i],
        religion: c.religion[i],
        burg: c.burg[i],
        river: c.r[i],
        population: Math.round(c.pop[i] * ctx.world.units.populationRate)
      },
      geometry
    });
  }
  return features;
}
