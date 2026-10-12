import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { buildLayers, dissolve, parseWorld, toCsv } from "../src/index.js";
import { signedArea } from "../src/dissolve.js";

// square cells on an n×n lattice, enough topology for the boundary walk
function squareWorld(n) {
  const vid = (x, y) => y * (n + 1) + x;
  const vertices = { p: [], c: [] };
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      vertices.p[vid(x, y)] = [x, y];
      vertices.c[vid(x, y)] = [];
    }
  const cells = { v: [] };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      cells.v[i] = [vid(x, y), vid(x + 1, y), vid(x + 1, y + 1), vid(x, y + 1)];
      for (const v of cells.v[i]) vertices.c[v].push(i);
    }
  return { cells, vertices };
}

test("dissolves an L-shape into one ring with its true area", () => {
  const world = squareWorld(2);
  const region = new Set([0, 1, 2]);
  const polygons = dissolve(world, region, c => region.has(c));
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].length, 1);
  assert.equal(Math.abs(signedArea(polygons[0][0])), 3);
});

test("keeps a hole for an enclave and splits separate parts", () => {
  const world = squareWorld(5);
  const ring = new Set([6, 7, 8, 11, 13, 16, 17, 18]); // 3×3 block around cell 12
  const [donut] = dissolve(world, ring, c => ring.has(c));
  assert.equal(donut.length, 2);
  assert.equal(Math.abs(signedArea(donut[0])) - Math.abs(signedArea(donut[1])), 8);

  const parts = new Set([0, 24]);
  assert.equal(dissolve(world, parts, c => parts.has(c)).length, 2);
});

test("CSV escapes text and adds point coordinates", () => {
  const csv = toCsv({
    features: [
      { properties: { name: 'Say "hi", world' }, geometry: { type: "Point", coordinates: [1, 2] } }
    ]
  });
  assert.equal(csv, 'name,x,y\n"Say ""hi"", world",1,2\n');
});

const fixture = process.env.FMG_FIXTURE ?? new URL("../../../tests/fixtures/1.154.0.map", import.meta.url).pathname;

test("converts a real .map file (plain and gzip) and its Full JSON form", { skip: !existsSync(fixture) }, () => {
  const raw = readFileSync(fixture);
  const world = parseWorld(raw);
  assert.equal(parseWorld(gzipSync(raw)).cells.v.length, world.cells.v.length);

  const layers = buildLayers(world, { layers: ["states", "provinces", "burgs", "rivers"] });
  const liveStates = world.states.filter(s => s.i && !s.removed && s.cells);
  assert.equal(layers.states.features.length, liveStates.length);
  for (const feature of layers.states.features) {
    for (const polygon of feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) {
      const [outer, ...holes] = polygon;
      assert.ok(signedArea(outer) < 0, "exterior ring is counter-clockwise");
      for (const hole of holes) assert.ok(signedArea(hole) > 0, "holes are clockwise");
      for (const [lon, lat] of outer) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
    }
  }

  // the same world written the way FMG's "Export to JSON → Full" lays it out
  const { cells, vertices } = world;
  const full = {
    info: { version: world.version, mapName: world.name, width: world.width, height: world.height },
    mapCoordinates: world.coordinates,
    pack: {
      cells: cells.v.map((v, i) => ({
        i, v, c: cells.c[i], p: cells.p[i], h: cells.h[i], state: cells.state[i], province: cells.province[i],
        culture: cells.culture[i], religion: cells.religion[i], biome: cells.biome[i], pop: cells.pop[i]
      })),
      vertices: vertices.p.map((p, i) => ({ i, p, c: vertices.c[i] })),
      states: world.states,
      cultures: world.cultures,
      provinces: world.provinces,
      burgs: world.burgs,
      rivers: world.rivers
    }
  };
  const fromJson = buildLayers(parseWorld(Buffer.from(JSON.stringify(full))), { layers: ["states"] });
  assert.deepEqual(fromJson.states.features, layers.states.features);
});
