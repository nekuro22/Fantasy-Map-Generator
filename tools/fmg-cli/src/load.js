// Reads a .map file (plain or gzip) or a "Full" / "Pack cells" JSON export into one normalized world object
import { applyVertexOverrides, buildPack } from "./graph.js";
import { decode } from "./mapfile.js";

const nums = (line, Type = Array) => (line ? Type.from(line.split(","), Number) : null);
const json = (line, fallback) => (line ? JSON.parse(line) : fallback);

export function parseWorld(buffer) {
  const { text } = decode(buffer);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return fromJson(JSON.parse(trimmed));
  return fromMap(text);
}

function fromMap(text) {
  const data = text.split("\r\n");
  const params = data[0].split("|");
  if (!/^\d+\.\d+/.test(params[0]) || data.length < 32) throw new Error("Not a Fantasy Map Generator .map file");
  const version = params[0];
  const [major, minor] = version.split(".").map(Number);
  if (major === 1 && minor < 100)
    throw new Error(`Map version ${version} is too old: open and re-save it in the current Fantasy Map Generator`);

  const settings = readSettings(data);
  const grid = JSON.parse(data[6]);
  grid.cells = { h: nums(data[7]), t: nums(data[10]) , f: nums(data[9]) };
  const { cells, vertices, pointsN } = buildPack(grid);

  const stored = nums(data[25]);
  if (stored && stored.length !== pointsN)
    throw new Error(`Graph rebuild mismatch: ${pointsN} cells rebuilt, ${stored.length} stored. Unsupported map version ${version}?`);

  const override = json(data[51], {});
  const movedVertices = applyVertexOverrides(vertices, override?.pack?.vertices?.p);
  const zeros = () => new Array(pointsN).fill(0);

  Object.assign(cells, {
    h: cells.g.map(i => grid.cells.h[i]),
    biome: nums(data[16]) ?? zeros(),
    burg: nums(data[17]) ?? zeros(),
    culture: nums(data[19]) ?? zeros(),
    fl: nums(data[20]) ?? zeros(),
    pop: nums(data[21]) ?? zeros(),
    r: nums(data[22]) ?? zeros(),
    state: stored ?? zeros(),
    religion: nums(data[26]) ?? zeros(),
    province: nums(data[27]) ?? zeros()
  });

  return {
    format: "map",
    version,
    name: settings?.lore?.name || "",
    lore: settings?.lore,
    seed: params[3],
    width: +params[4] || settings?.graph?.width,
    height: +params[5] || settings?.graph?.height,
    coordinates: settings?.geography?.coordinates,
    units: unitsFrom(settings?.units),
    cells,
    vertices,
    features: json(data[12], []),
    biomes: readBiomes(data[3]),
    cultures: json(data[13], []),
    states: json(data[14], []),
    burgs: json(data[15], []),
    religions: json(data[29], []),
    provinces: json(data[30], []),
    rivers: json(data[32], []),
    markers: json(data[35], []),
    routes: json(data[37], []),
    zones: json(data[38], []),
    factions: json(data[53], []),
    movedVertices
  };
}

// v1.152 replaced the pipe-delimited settings and the separate coordinates slot with one JSON object
function readSettings(data) {
  if (data[1]?.trimStart().startsWith("{")) return JSON.parse(data[1]);
  const old = (data[1] || "").split("|");
  const coordinates = data[2]?.startsWith("{") ? JSON.parse(data[2]) : undefined;
  return {
    geography: { coordinates },
    lore: { name: old[20] || "" },
    units: {
      distance: { unit: old[0] || "km", scale: +old[1] || 1 },
      population: { scale: +old[12] || 1000, urbanization: { rate: +old[13] || 1 } }
    }
  };
}

// before v1.139 biomes were "colors|habitability|names"
function readBiomes(line) {
  if (!line) return [];
  if (line.startsWith("[")) return JSON.parse(line);
  const [colors = "", , names = ""] = line.split("|");
  const colorList = colors.split(",");
  return names.split(",").map((name, i) => ({ i, name, color: colorList[i] }));
}

function fromJson(doc) {
  const pack = doc.pack ?? doc.cells;
  if (!pack?.cells?.[0]?.v || !pack.vertices)
    throw new Error('JSON has no cell geometry: use "Export to JSON → Full" or "Pack cells" in Fantasy Map Generator');
  const rows = pack.cells;
  const col = key => rows.map(c => c[key] ?? 0);
  const cells = {
    v: col("v"),
    c: col("c"),
    p: col("p"),
    h: col("h"),
    f: col("f"),
    biome: col("biome"),
    burg: col("burg"),
    culture: col("culture"),
    fl: col("fl"),
    pop: col("pop"),
    r: col("r"),
    state: col("state"),
    religion: col("religion"),
    province: col("province")
  };
  const vertices = { p: pack.vertices.map(v => v.p), c: pack.vertices.map(v => v.c) };
  const options = doc.settings?.options?.map;
  const info = doc.info ?? {};
  return {
    format: "json",
    version: info.version,
    name: info.mapName || doc.settings?.mapName || "",
    lore: options?.lore,
    seed: info.seed,
    width: info.width,
    height: info.height,
    coordinates: doc.mapCoordinates ?? options?.geography?.coordinates,
    units: unitsFrom(options?.units, doc.settings),
    cells,
    vertices,
    pointsLimit: rows.length,
    features: pack.features ?? [],
    biomes: pack.biomes ?? [],
    cultures: pack.cultures ?? [],
    states: pack.states ?? [],
    burgs: pack.burgs ?? [],
    religions: pack.religions ?? [],
    provinces: pack.provinces ?? [],
    rivers: pack.rivers ?? [],
    markers: pack.markers ?? [],
    routes: pack.routes ?? [],
    zones: pack.zones ?? [],
    factions: pack.factions ?? [],
    movedVertices: 0
  };
}

function unitsFrom(units, flat = {}) {
  const distanceUnit = units?.distance?.unit ?? flat.distanceUnit ?? "mi";
  const area = units?.area?.unit ?? flat.areaUnit ?? "square";
  return {
    areaUnit: area === "square" ? `${distanceUnit}²` : area,
    populationRate: units?.population?.scale ?? flat.populationRate ?? 1000,
    urbanization: units?.population?.urbanization?.rate ?? flat.urbanization ?? 1,
    distanceUnit: units?.distance?.unit ?? flat.distanceUnit ?? "mi",
    distanceScale: units?.distance?.scale ?? flat.distanceScale ?? 1
  };
}
