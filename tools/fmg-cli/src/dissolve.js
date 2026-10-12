// Merges Voronoi cells into (multi)polygon rings by walking the region boundary

/** Rings of the cells for which `inside(cell)` is true: [[outer, ...holes], ...] in graph coordinates */
export function dissolve(world, cellIds, inside) {
  const { cells, vertices } = world;
  const n = cells.v.length;
  const nextVertex = new Map();

  for (const cell of cellIds) {
    const ring = cells.v[cell];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      const across = vertices.c[a].find(c => c !== cell && vertices.c[b].includes(c));
      if (across !== undefined && across < n && inside(across)) continue;
      nextVertex.set(a, b);
    }
  }

  const rings = [];
  for (const start of nextVertex.keys()) {
    if (!nextVertex.has(start)) continue;
    const ring = [];
    let v = start;
    while (nextVertex.has(v)) {
      ring.push(v);
      const following = nextVertex.get(v);
      nextVertex.delete(v);
      v = following;
    }
    if (ring.length >= 3) rings.push(ring.map(id => vertices.p[id]));
  }
  return groupRings(rings, orientation(world));
}

// sign of a single cell ring: region outlines run the same way, holes the other way
const orientationCache = new WeakMap();
function orientation(world) {
  if (!orientationCache.has(world)) {
    const ring = world.cells.v.find(r => r.length >= 3).map(id => world.vertices.p[id]);
    orientationCache.set(world, Math.sign(signedArea(ring)));
  }
  return orientationCache.get(world);
}

export function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return sum / 2;
}

function groupRings(rings, sign) {
  const outers = [];
  const holes = [];
  for (const ring of rings) (Math.sign(signedArea(ring)) === sign ? outers : holes).push(ring);
  const polygons = outers.map(outer => [outer]);
  const areas = outers.map(outer => Math.abs(signedArea(outer)));

  for (const hole of holes) {
    let best = -1;
    for (let i = 0; i < outers.length; i++) {
      if (!contains(outers[i], hole[0])) continue;
      if (best === -1 || areas[i] < areas[best]) best = i;
    }
    if (best !== -1) polygons[best].push(hole);
  }
  return polygons;
}

function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
