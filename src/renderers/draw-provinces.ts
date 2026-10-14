import { ensureEl, getIsolines } from "@/utils";
import { buildFillPaths } from "./isoline-fills";

/** Lines between provinces of one state that lie in different regions */
export function getRegionBorders(): string {
  const { cells, vertices, provinces } = pack;
  const regionOf = (cell: number) => provinces[cells.province[cell]]?.region ?? 0;
  let d = "";
  for (const cell of cells.i) {
    if (!cells.province[cell]) continue;
    for (const neighbor of cells.c[cell]) {
      if (neighbor < cell || !cells.province[neighbor] || cells.state[neighbor] !== cells.state[cell]) continue;
      if (regionOf(cell) === regionOf(neighbor)) continue;
      const shared = cells.v[cell].filter(v => cells.v[neighbor].includes(v));
      if (shared.length < 2) continue;
      const [p, q] = [vertices.p[shared[0]], vertices.p[shared[1]]];
      d += `M${p[0]},${p[1]}L${q[0]},${q[1]}`;
    }
  }
  return d;
}

export function drawProvinces(): void {
  TIME && console.time("drawProvinces");
  const { cells, provinces, states } = pack;

  const isolines = getIsolines(pack, cellId => cells.province[cellId], { fill: true, waterGap: true });
  const bodyPaths = buildFillPaths("province", isolines, index => provinces[index].color!);

  // occupied provinces are hatched in the occupier's color
  const occupier = (cellId: number) => {
    const province = provinces[cells.province[cellId]];
    return province?.controller && !province.removed ? province.controller : 0;
  };
  const occupation = getIsolines(pack, occupier, { fill: true });
  const patterns = Object.keys(occupation)
    .map(
      id => /* html */ `<pattern id="occupation${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="2.5" height="6" fill="${states[+id]?.color ?? "#000"}" />
      </pattern>`
    )
    .join("");
  const occupationPaths = Object.entries(occupation)
    .map(
      ([id, { fill }]) => /* html */ `<path d="${fill}" fill="url(#occupation${id})" id="provinceOccupation${id}" />`
    )
    .join("");

  const regions = getRegionBorders();
  const regionPaths = regions
    ? /* html */ `<path d="${regions}" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" />
      <path d="${regions}" stroke="#2b2b2b" stroke-opacity=".7" stroke-width="1.1" />`
    : "";

  ensureEl("provs").innerHTML = /* html */ `<g id="provincesBody">${bodyPaths}</g>
    <g id="provincesOccupation"><defs>${patterns}</defs>${occupationPaths}</g>
    <g id="provincesRegionLines" fill="none" stroke-linecap="round">${regionPaths}</g>`;

  TIME && console.timeEnd("drawProvinces");
}
