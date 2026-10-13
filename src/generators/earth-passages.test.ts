import { describe, expect, it } from "vitest";
import { getCoordinatesBox } from "./coordinates";
import { EARTH_STRAITS, keepEarthPassages, rasterizePath } from "./earth-passages";

const box = getCoordinatesBox(100, 50, 50, 200, 100); // whole globe, 2:1

describe("rasterizePath", () => {
  it("steps only between edge neighbours, so the passage is continuous", () => {
    for (const [cellsX, cellsY] of [
      [100, 50],
      [141, 71],
      [447, 223]
    ]) {
      for (const path of Object.values(EARTH_STRAITS)) {
        const cells = rasterizePath(path, cellsX, cellsY, box);
        for (let k = 1; k < cells.length; k++) {
          const [a, b] = [cells[k - 1], cells[k]];
          const d = Math.abs((a % cellsX) - (b % cellsX)) + Math.abs(Math.floor(a / cellsX) - Math.floor(b / cellsX));
          expect(d).toBe(1);
        }
      }
    }
  });
});

describe("keepEarthPassages", () => {
  it("opens Gibraltar even on a coarse all-land grid", () => {
    const [cellsX, cellsY] = [100, 50];
    const heights = new Uint8Array(cellsX * cellsY).fill(40);
    keepEarthPassages(heights, cellsX, cellsY, box);
    for (const i of rasterizePath(EARTH_STRAITS.gibraltar, cellsX, cellsY, box)) expect(heights[i]).toBeLessThan(20);
  });
});
