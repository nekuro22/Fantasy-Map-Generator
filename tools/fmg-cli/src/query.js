// Read-only views of a world: entity summaries with resolved names, full records, search
import { makeProjection } from "./layers.js";

export const KINDS = ["states", "provinces", "burgs", "cultures", "religions", "rivers", "routes", "markers", "zones", "features", "biomes"];
const ALIASES = {
  state: "states",
  province: "provinces",
  burg: "burgs",
  city: "burgs",
  cities: "burgs",
  town: "burgs",
  culture: "cultures",
  religion: "religions",
  river: "rivers",
  route: "routes",
  marker: "markers",
  zone: "zones",
  feature: "features",
  biome: "biomes"
};
// lists stored by array index; the rest are unordered with their own `i`
const INDEXED = new Set(["states", "provinces", "burgs", "cultures", "religions", "features", "biomes"]);
// the cell array an entity is painted in
const CELL_KEY = { states: "state", provinces: "province", cultures: "culture", religions: "religion", biomes: "biome" };

export const SEA_LEVEL = 20;
export const alive = e => e && typeof e === "object" && !e.removed;
export const stripHtml = html =>
  typeof html === "string"
    ? html
        .replace(/<\/p>\s*<p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .trim()
    : undefined;
const round = (v, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);

export function kindOf(input) {
  const kind = ALIASES[input?.toLowerCase()] ?? input?.toLowerCase();
  if (!KINDS.includes(kind)) throw new Error(`Unknown type "${input}". Types: ${KINDS.join(", ")}`);
  return kind;
}

/** Living entities of a kind; neutrals, "no religion" and wildlands (id 0) are left out */
export function entities(data, kind) {
  const list = data[kind] ?? [];
  const withIds = kind === "biomes" ? list.map((b, i) => (alive(b) ? { i, ...b } : b)) : list;
  return withIds.filter(e => alive(e) && (!INDEXED.has(kind) || kind === "biomes" || e.i));
}

export function byId(data, kind, id) {
  if (kind === "biomes") return alive(data.biomes?.[id]) ? { i: id, ...data.biomes[id] } : undefined;
  const e = INDEXED.has(kind) ? data[kind]?.[id] : data[kind]?.find(x => x?.i === id);
  return alive(e) && (e.i === id || kind === "biomes") ? e : undefined;
}

/** Entity by id or name: exact name, then full name, then a unique prefix */
export function resolve(data, kind, ref) {
  const list = entities(data, kind);
  const text = String(ref ?? "").trim();
  if (/^\d+$/.test(text)) {
    const found = byId(data, kind, +text);
    if (found && (found.i || kind === "biomes" || kind === "rivers" || kind === "routes" || kind === "markers" || kind === "zones"))
      return found;
  }
  const lower = text.toLowerCase();
  const tries = [e => e.name?.toLowerCase() === lower, e => e.fullName?.toLowerCase() === lower];
  for (const test of tries) {
    const hits = list.filter(test);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw ambiguous(kind, text, hits);
  }
  const prefix = list.filter(e => e.name?.toLowerCase().startsWith(lower) || e.fullName?.toLowerCase().startsWith(lower));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) throw ambiguous(kind, text, prefix);
  const near = list.filter(e => e.name?.toLowerCase().includes(lower)).slice(0, 5);
  const hint = near.length ? ` Did you mean: ${near.map(e => `${e.name} (${e.i})`).join(", ")}?` : "";
  throw new Error(`No ${kind.replace(/s$/, "")} "${text}".${hint}`);
}

const ambiguous = (kind, text, hits) =>
  new Error(
    `"${text}" matches several ${kind}: ${hits
      .slice(0, 8)
      .map(e => `${e.name} (${e.i})`)
      .join(", ")}. Use the id`
  );

/** Per-entity cell statistics: cells, area, rural population; urban population from burgs */
export class Index {
  constructor(world) {
    this.world = world;
    this.stats = {};
  }

  cellArea() {
    if (!this.areas) {
      const { cells, vertices } = this.world;
      this.areas = cells.v.map(ring => {
        let sum = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xj, yj] = vertices.p[ring[j]];
          const [xi, yi] = vertices.p[ring[i]];
          sum += (xj - xi) * (yj + yi);
        }
        return Math.abs(sum / 2);
      });
    }
    return this.areas;
  }

  of(kind) {
    if (this.stats[kind]) return this.stats[kind];
    const { cells, burgs, units } = this.world;
    const stats = new Map();
    const get = id => {
      if (!stats.has(id)) stats.set(id, { cells: 0, area: 0, rural: 0, urban: 0, burgs: 0 });
      return stats.get(id);
    };
    const key = CELL_KEY[kind];
    if (key) {
      const values = cells[key];
      const areas = this.cellArea();
      for (let c = 0; c < values.length; c++) {
        if (cells.h[c] < SEA_LEVEL) continue;
        const s = get(values[c]);
        s.cells++;
        s.area += areas[c];
        s.rural += cells.pop[c] ?? 0;
      }
      for (const burg of burgs) {
        if (!alive(burg) || !burg.i) continue;
        const s = get(values[burg.cell] ?? 0);
        s.burgs++;
        s.urban += burg.population ?? 0;
      }
    }
    const scale = units.distanceScale ** 2;
    for (const s of stats.values()) {
      s.area = round(s.area * scale);
      s.population = round((s.rural + s.urban * units.urbanization) * units.populationRate);
    }
    this.stats[kind] = stats;
    return stats;
  }
}

const nameOf = (data, kind, id) => (id ? byId(data, kind, id)?.name : undefined);
const namesOf = (data, kind, ids) => (Array.isArray(ids) ? ids.map(id => nameOf(data, kind, id)).filter(Boolean) : []);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** One flat row per entity, names resolved: what `list` prints and filters on */
export function summary(world, index, kind, e) {
  const stat = CELL_KEY[kind] ? (index.of(kind).get(e.i) ?? { cells: 0, area: 0, population: 0, burgs: 0 }) : {};
  const cellStats = { cells: stat.cells, area: stat.area, population: stat.population };
  switch (kind) {
    case "states":
      return clean({
        id: e.i,
        name: e.name,
        fullName: e.fullName,
        form: e.form,
        formName: e.formName,
        capital: nameOf(world, "burgs", e.capital),
        culture: nameOf(world, "cultures", e.culture),
        provinces: entities(world, "provinces").filter(p => p.state === e.i).length,
        burgs: stat.burgs,
        ...cellStats,
        color: e.color
      });
    case "provinces": {
      const controller = e.controller && e.controller !== e.state ? e.controller : e.state;
      return clean({
        id: e.i,
        name: e.name,
        fullName: e.fullName,
        formName: e.formName,
        state: nameOf(world, "states", e.state),
        controller: nameOf(world, "states", controller),
        occupied: controller !== e.state,
        cores: namesOf(world, "states", e.cores).join(", "),
        claims: namesOf(world, "states", e.claims).join(", "),
        capital: nameOf(world, "burgs", e.burg),
        burgs: stat.burgs,
        ...cellStats
      });
    }
    case "burgs": {
      const { cells, units } = world;
      const [lon, lat] = makeProjection(world)([e.x, e.y]);
      return clean({
        id: e.i,
        name: e.name,
        state: nameOf(world, "states", e.state),
        province: nameOf(world, "provinces", cells.province[e.cell]),
        culture: nameOf(world, "cultures", e.culture),
        religion: nameOf(world, "religions", cells.religion[e.cell]),
        population: round((e.population ?? 0) * units.populationRate * units.urbanization),
        group: e.group,
        type: e.type,
        capital: !!e.capital,
        port: !!e.port,
        lon,
        lat
      });
    }
    case "cultures":
      return clean({ id: e.i, name: e.name, type: e.type, code: e.code, ...cellStats, color: e.color });
    case "religions":
      return clean({
        id: e.i,
        name: e.name,
        type: e.type,
        form: e.form,
        deity: e.deity,
        culture: nameOf(world, "cultures", e.culture),
        ...cellStats,
        color: e.color
      });
    case "rivers":
      return clean({
        id: e.i,
        name: e.name,
        type: e.type,
        length: round(e.length, 1),
        discharge: e.discharge,
        width: e.width,
        parent: e.parent && e.parent !== e.i ? nameOf(world, "rivers", e.parent) : undefined
      });
    case "routes":
      return clean({ id: e.i, name: e.name, group: e.group, length: round(e.length, 1) });
    case "markers":
      return clean({ id: e.i, name: e.name, type: e.type, note: stripHtml(e.note)?.slice(0, 80) });
    case "zones":
      return clean({ id: e.i, name: e.name, type: e.type, cells: e.cells?.length, hidden: e.hidden });
    case "features":
      return clean({
        id: e.i,
        name: e.name,
        type: e.type,
        subtype: e.subtype,
        cells: e.cells,
        area: round((e.area ?? 0) * world.units.distanceScale ** 2)
      });
    case "biomes":
      return clean({ id: e.i, name: e.name, ...cellStats, color: e.color });
  }
}

const HEAVY = ["coa", "production", "military", "diplomacy", "label", "campaigns", "neighbors", "pole", "vertices", "cells", "points"];

/** Everything about one entity: its summary, related entities and its stored record */
export function details(world, index, kind, e, { raw = false } = {}) {
  const result = { ...summary(world, index, kind, e) };
  const states = entities(world, "states");
  const provinces = entities(world, "provinces");
  const burgs = entities(world, "burgs");
  const ref = x => ({ id: x.i, name: x.name });

  if (kind === "states") {
    const own = provinces.filter(p => p.state === e.i);
    result.provinces = own.map(p => ({ ...ref(p), controller: nameOf(world, "states", p.controller || p.state) }));
    result.neighbors = namesOf(world, "states", e.neighbors);
    if (Array.isArray(e.diplomacy))
      result.diplomacy = Object.fromEntries(
        states.filter(s => s.i !== e.i && e.diplomacy[s.i] && e.diplomacy[s.i] !== "x").map(s => [s.name, e.diplomacy[s.i]])
      );
    const theirs = provinces.filter(p => p.state !== e.i);
    result.occupies = theirs.filter(p => p.controller === e.i).map(ref);
    result.occupiedBy = own
      .filter(p => p.controller && p.controller !== e.i)
      .map(p => ({ ...ref(p), by: nameOf(world, "states", p.controller) }));
    result.coresAbroad = theirs.filter(p => p.cores?.includes(e.i)).map(ref);
    result.claimsAbroad = theirs.filter(p => p.claims?.includes(e.i)).map(ref);
    result.largestBurgs = burgs
      .filter(b => b.state === e.i)
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .slice(0, 10)
      .map(b => summary(world, index, "burgs", b))
      .map(({ id, name, population, capital }) => clean({ id, name, population, capital: capital || undefined }));
    result.regiments = e.military?.length ?? 0;
    if (e.campaigns?.length) result.campaigns = e.campaigns.map(c => `${c.name} (${c.start}–${c.end ?? ""})`);
  }
  if (kind === "provinces")
    result.burgList = burgs.filter(b => world.cells.province[b.cell] === e.i).map(b => b.name);
  if (kind === "cultures" || kind === "religions") {
    const key = CELL_KEY[kind];
    const perState = new Map();
    world.cells[key].forEach((v, c) => {
      if (v !== e.i || !world.cells.state[c]) return;
      perState.set(world.cells.state[c], (perState.get(world.cells.state[c]) ?? 0) + 1);
    });
    result.states = [...perState]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, cells]) => ({ name: nameOf(world, "states", id), cells }));
  }
  if (e.note) result.note = stripHtml(e.note);

  const record = Object.fromEntries(Object.entries(e).filter(([k]) => raw || !HEAVY.includes(k)));
  if (record.note) record.note = stripHtml(record.note);
  result.record = record;
  return result;
}

/** Name matches across all kinds */
export function search(world, text, kinds = KINDS) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const kind of kinds)
    for (const e of entities(world, kind)) {
      const fields = [e.name, e.fullName, stripHtml(e.note)].filter(Boolean);
      const field = fields.find(f => f.toLowerCase().includes(lower));
      if (!field) continue;
      const exact = e.name?.toLowerCase() === lower;
      hits.push({ kind, id: e.i, name: e.name, fullName: e.fullName, match: field === e.name || field === e.fullName ? "name" : "note", exact });
    }
  return hits.sort((a, b) => b.exact - a.exact || (a.match === "name" ? -1 : 1) - (b.match === "name" ? -1 : 1)).map(({ exact, ...h }) => clean(h));
}

/** Rows filtered by `key=value`, `key>n`, `key<n`, `key~text`, sorted and trimmed */
export function filterRows(rows, { where = [], sort, limit, fields } = {}) {
  let out = rows;
  for (const condition of where) {
    const m = condition.match(/^([\w.]+)\s*(!=|>=|<=|=|>|<|~)\s*(.*)$/);
    if (!m) throw new Error(`Bad filter "${condition}". Use key=value, key!=value, key>n, key<n or key~text`);
    const [, key, op, value] = m;
    const num = Number(value);
    out = out.filter(row => {
      const v = row[key];
      const s = String(v ?? "").toLowerCase();
      const t = value.toLowerCase();
      if (op === "=") return s === t;
      if (op === "!=") return s !== t;
      if (op === "~") return s.includes(t);
      if (!Number.isFinite(num) || typeof v !== "number") return false;
      return op === ">" ? v > num : op === "<" ? v < num : op === ">=" ? v >= num : v <= num;
    });
  }
  if (sort) {
    const desc = sort.startsWith("-");
    const key = sort.replace(/^[-+]/, "");
    out = [...out].sort((a, b) => {
      const [x, y] = [a[key], b[key]];
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return desc ? -cmp : cmp;
    });
  }
  if (limit) out = out.slice(0, limit);
  if (fields?.length) out = out.map(row => Object.fromEntries(fields.map(f => [f, row[f]])));
  return out;
}

export function mapInfo(world, index) {
  const count = kind => entities(world, kind).length;
  const land = world.cells.h.filter(h => h >= SEA_LEVEL).length;
  const states = index.of("states");
  const neutral = states.get(0)?.cells ?? 0;
  const occupied = entities(world, "provinces").filter(p => p.controller && p.controller !== p.state).length;
  const claimed = entities(world, "provinces").filter(p => p.cores?.length || p.claims?.length).length;
  const population = [...states.values()].reduce((sum, s) => sum + s.population, 0);
  return clean({
    name: world.name,
    format: world.format,
    version: world.version,
    seed: world.seed,
    size: `${world.width}×${world.height}`,
    year: world.lore?.calendar ? `${world.lore.calendar.year} ${world.lore.calendar.eraShort ?? ""}`.trim() : undefined,
    cells: world.cells.v.length,
    landCells: land,
    neutralLandCells: neutral,
    population,
    units: `${world.units.distanceUnit}, area ${world.units.areaUnit}, 1 population point = ${world.units.populationRate} people`,
    counts: Object.fromEntries(KINDS.map(k => [k, count(k)])),
    occupiedProvinces: occupied || undefined,
    provincesWithClaims: claimed || undefined
  });
}
