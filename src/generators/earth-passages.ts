// Real straits and isthmuses narrower than a cell: drawn into the Earth heightmap so seas stay seas and
// continents stay joined at any cell count. Paths run [lat, lon] from one side to the other

type Path = [number, number][];
type Box = { latN: number; latT: number; lonW: number; lonT: number };

export const EARTH_STRAITS: Record<string, Path> = {
  gibraltar: [
    [36.0, -7.0],
    [35.95, -5.6],
    [36.2, -4.5]
  ],
  dardanellesBosporus: [
    [39.9, 25.9],
    [40.2, 26.35],
    [40.45, 26.75],
    [40.75, 27.8],
    [40.95, 28.9],
    [41.2, 29.1],
    [41.5, 29.3]
  ],
  kerch: [
    [44.9, 36.4],
    [45.3, 36.55],
    [45.6, 36.7]
  ],
  otranto: [
    [39.6, 19.2],
    [40.3, 19.0],
    [41.2, 18.4]
  ],
  babElMandeb: [
    [13.4, 42.7],
    [12.6, 43.35],
    [12.2, 44.0]
  ],
  hormuz: [
    [26.3, 55.8],
    [26.55, 56.4],
    [26.0, 56.8],
    [25.3, 57.3]
  ],
  oresund: [
    [56.8, 11.8],
    [56.0, 12.65],
    [55.6, 12.75],
    [55.0, 13.2]
  ],
  kvarken: [
    [63.0, 20.8],
    [63.6, 21.0],
    [64.0, 21.6]
  ],
  dover: [
    [51.4, 2.0],
    [51.0, 1.45],
    [50.6, 0.8]
  ],
  bering: [
    [66.6, -168.9],
    [65.8, -168.9],
    [64.8, -169.0]
  ],
  malaccaSingapore: [
    [5.5, 98.5],
    [3.5, 100.5],
    [2.0, 102.0],
    [1.25, 103.6],
    [1.25, 104.2],
    [1.6, 104.8]
  ],
  sunda: [
    [-5.5, 105.0],
    [-6.0, 105.8],
    [-6.5, 106.0]
  ]
};

export const EARTH_ISTHMUSES: Record<string, Path> = {
  panama: [
    [10.0, -84.0],
    [9.0, -82.0],
    [8.9, -80.5],
    [9.1, -79.5],
    [8.6, -78.3],
    [8.0, -77.4],
    [7.0, -76.8]
  ],
  suez: [
    [31.0, 32.3],
    [30.5, 32.3],
    [30.0, 32.5],
    [29.6, 32.6]
  ]
};

const STRAIT_HEIGHT = 15;
const ISTHMUS_HEIGHT = 22;

/** Grid cells under a path, 4-connected so the passage is continuous between Voronoi neighbours */
export function rasterizePath(path: Path, cellsX: number, cellsY: number, box: Box): number[] {
  const cells: number[] = [];
  const toXY = ([lat, lon]: [number, number]) => [
    ((lon - box.lonW) / box.lonT) * cellsX,
    ((box.latN - lat) / box.latT) * cellsY
  ];
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cellsX || y >= cellsY) return;
    const i = x + y * cellsX;
    if (cells.at(-1) !== i) cells.push(i);
  };

  let prev: [number, number] | null = null;
  for (let p = 1; p < path.length; p++) {
    const [x0, y0] = toXY(path[p - 1]);
    const [x1, y1] = toXY(path[p]);
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
    for (let s = 0; s <= steps; s++) {
      const x = Math.floor(x0 + ((x1 - x0) * s) / steps);
      const y = Math.floor(y0 + ((y1 - y0) * s) / steps);
      if (prev && prev[0] !== x && prev[1] !== y) add(x, prev[1]); // no diagonal steps
      add(x, y);
      prev = [x, y];
    }
  }
  return cells;
}

/** Open the straits and close the isthmuses the cell grid is too coarse to keep */
export function keepEarthPassages(heights: Uint8Array, cellsX: number, cellsY: number, box: Box): void {
  for (const path of Object.values(EARTH_STRAITS)) {
    for (const i of rasterizePath(path, cellsX, cellsY, box)) heights[i] = Math.min(heights[i], STRAIT_HEIGHT);
  }
  for (const path of Object.values(EARTH_ISTHMUSES)) {
    for (const i of rasterizePath(path, cellsX, cellsY, box)) heights[i] = Math.max(heights[i], ISTHMUS_HEIGHT);
  }
}
