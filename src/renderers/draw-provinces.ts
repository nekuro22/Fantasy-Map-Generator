import { ensureEl, getIsolines } from "@/utils";
import { buildFillPaths } from "./isoline-fills";

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

  ensureEl("provs").innerHTML = /* html */ `<g id="provincesBody">${bodyPaths}</g>
    <g id="provincesOccupation"><defs>${patterns}</defs>${occupationPaths}</g>`;

  TIME && console.timeEnd("drawProvinces");
}
