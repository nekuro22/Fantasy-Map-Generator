// Layers built on the claims data: regions of a state, fronts of its wars, and where the tension is
import { Factions } from "@/generators/factions-generator";
import { drawControl, drawTension } from "@/renderers/overlays/claims";
import { ensureEl, getIsolines } from "@/utils";
import { getRegionBorders } from "./draw-provinces";
import { buildFillPaths } from "./isoline-fills";

const REGION_KEY = 1000; // state * KEY + region numbers a region in one isoline pass

/** Each region tinted in its own shade, with the lines between regions */
export function drawRegionLands(): void {
  const { cells, provinces, states } = pack;
  const keyOf = (cellId: number) => {
    const province = provinces[cells.province[cellId]];
    return province?.region ? province.state * REGION_KEY + province.region : 0;
  };
  const isolines = getIsolines(pack, keyOf, { fill: true, waterGap: true });
  const color = (key: number) => {
    const region = states[Math.floor(key / REGION_KEY)]?.regions?.find(r => r.i === key % REGION_KEY);
    return region?.color ?? "#888888";
  };
  const fills = buildFillPaths("regionLand", isolines, color);
  const borders = getRegionBorders();
  const lines = borders
    ? `<path d="${borders}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round" />
       <path d="${borders}" fill="none" stroke="#2b2b2b" stroke-opacity=".8" stroke-width="1.2" stroke-linecap="round" />`
    : "";
  ensureEl("regionLands").innerHTML = `<g opacity=".55">${fills}</g>${lines}`;
}

/** Each faction's states tinted in the faction's color, with the leader's capital ringed */
export function drawFactionLands(): void {
  const { cells, states, burgs } = pack;
  const factionOf = new Map<number, number>();
  for (const faction of Factions.all()) for (const member of faction.members) factionOf.set(member, faction.i);
  const isolines = getIsolines(pack, cellId => factionOf.get(cells.state[cellId]) ?? 0, { fill: true, waterGap: true });
  const fills = buildFillPaths(
    "factionLand",
    isolines,
    key => Factions.all().find(f => f.i === key)?.color ?? "#888888"
  );
  const rings = Factions.all()
    .map(faction => {
      const burg = burgs[states[faction.leader]?.capital];
      return burg?.i
        ? `<circle cx="${burg.x}" cy="${burg.y}" r="3.2" fill="none" stroke="#000" stroke-width="1.4" />`
        : "";
    })
    .join("");
  ensureEl("factionLands").innerHTML = `<g opacity=".6">${fills}</g>${rings}`;
}

export function drawFronts(): void {
  ensureEl("frontsMap").innerHTML = drawControl();
}

export function drawTensionMap(): void {
  ensureEl("tensionMap").innerHTML = drawTension();
}
