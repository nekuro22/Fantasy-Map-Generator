// Rebuilds the packed Voronoi graph the same way Fantasy Map Generator does on load.
// Ported from Azgaar's Fantasy-Map-Generator (MIT): src/generators/voronoi.ts and pack-generator.ts
import Delaunator from "delaunator";

const SEA_LEVEL = 20;
const rn = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

export function calculateVoronoi(points, boundary) {
  const all = points.concat(boundary);
  const delaunay = Delaunator.from(all);
  const n = points.length;
  const { triangles, halfedges } = delaunay;
  const cells = { v: [], c: [], b: [] };
  const vertices = { p: [], v: [], c: [] };

  const next = e => (e % 3 === 2 ? e - 2 : e + 1);
  const triOf = e => Math.floor(e / 3);
  const pointsOfTri = t => [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
  const around = start => {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      incoming = halfedges[next(incoming)];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result;
  };
  const circumcenter = ([ax, ay], [bx, by], [cx, cy]) => {
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    return [
      (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
      (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
    ];
  };

  for (let e = 0; e < triangles.length; e++) {
    const p = triangles[next(e)];
    if (p < n && !cells.c[p]) {
      const edges = around(e);
      cells.v[p] = edges.map(triOf);
      cells.c[p] = edges.map(edge => triangles[edge]).filter(c => c < n);
      cells.b[p] = edges.length > cells.c[p].length ? 1 : 0;
    }
    const t = triOf(e);
    if (!vertices.p[t]) {
      const corners = pointsOfTri(t);
      vertices.p[t] = circumcenter(...corners.map(i => all[i]));
      vertices.v[t] = [3 * t, 3 * t + 1, 3 * t + 2].map(edge => triOf(halfedges[edge]));
      vertices.c[t] = corners;
    }
  }
  return { cells, vertices, n };
}

/** Grid record (spacing, points, boundary, features) + grid cell heights/types -> packed graph */
export function buildPack(grid) {
  const { points, boundary, spacing, features } = grid;
  const g = calculateVoronoi(points, boundary);
  const { h, t, f } = grid.cells;
  const spacing2 = spacing ** 2;
  const p = [];
  const parent = [];
  const add = (i, x, y) => {
    p.push([x, y]);
    parent.push(i);
  };

  for (let i = 0; i < points.length; i++) {
    const type = t[i];
    if (h[i] < SEA_LEVEL && type !== -1 && type !== -2) continue;
    if (type === -2 && (i % 4 === 0 || features[f[i]]?.type === "lake")) continue;
    const [x, y] = points[i];
    add(i, x, y);
    if (type === 1 || type === -1) {
      if (g.cells.b[i]) continue;
      for (const e of g.cells.c[i]) {
        if (i > e || t[e] !== type) continue;
        const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
        if (dist2 < spacing2) continue;
        add(i, rn((x + points[e][0]) / 2, 1), rn((y + points[e][1]) / 2, 1));
      }
    }
  }

  const { cells, vertices } = calculateVoronoi(p, boundary);
  cells.p = p;
  cells.g = parent;
  return { cells, vertices, pointsN: p.length };
}

/** Wrap Tool edits: { [vertexId]: [originalPoint, editedPoint] } */
export function applyVertexOverrides(vertices, moved = {}) {
  let applied = 0;
  for (const [id, [from, to]] of Object.entries(moved)) {
    const current = vertices.p[+id];
    if (!current || String(current) !== String(from)) continue;
    vertices.p[+id] = to;
    applied++;
  }
  return applied;
}
