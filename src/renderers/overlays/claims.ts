// Claims view: cores, claims, occupation and front lines drawn over the map, as in Hearts of Iron
import { interpolateYlOrRd } from "d3";
import { getIsolines, getVertexPath } from "@/utils";

export type ClaimsMode = "focus" | "control" | "tension";

const GROUP_ID = "claimsMap";

export const FOCUS_LEGEND = {
  core: { color: "#3f9b4a", label: "Core, held" },
  nonCore: { color: "#e2c044", label: "Owned, not a core" },
  lost: { color: "#c0392b", label: "Own land occupied by an enemy" },
  held: { color: "#f08a24", label: "Foreign land it occupies" },
  irredenta: { color: "#7b1fa2", label: "Lost core (irredenta)" },
  claim: { color: "#ff6f61", label: "Claimed by it" },
  claimed: { color: "#2e86de", label: "Its land claimed by others" }
} as const;
type FocusKind = keyof typeof FOCUS_LEGEND;

export const isAtWar = (a: number, b: number): boolean =>
  Boolean(a && b && a !== b && pack.states[a]?.diplomacy?.[b] === "Enemy");

/** The state holding a cell: its province's occupier, otherwise its owner */
export function cellController(cellId: number): number {
  const province = pack.provinces[pack.cells.province[cellId]];
  if (province?.i && !province.removed) return province.controller || province.state;
  return pack.cells.state[cellId];
}

/** How much a province is fought over: foreign cores count double, an occupation adds two */
export function provinceTension(provinceId: number): number {
  const province = pack.provinces[provinceId];
  if (!province?.i || province.removed) return 0;
  const foreignCores = (province.cores ?? []).filter(id => id !== province.state).length;
  return foreignCores * 2 + (province.claims?.length ?? 0) + (province.controller ? 2 : 0);
}

function focusKind(provinceId: number, stateId: number): FocusKind | null {
  const province = pack.provinces[provinceId];
  if (!province?.i || province.removed) return null;
  const owned = province.state === stateId;
  if (province.controller === stateId) return "held";
  if (owned && province.controller) return "lost";
  if (owned) return province.cores?.includes(stateId) ? "core" : "nonCore";
  if (province.cores?.includes(stateId)) return "irredenta";
  if (province.claims?.includes(stateId)) return "claim";
  return null;
}

const stripes = (id: string, color: string, base: string) => /* html */ `
  <pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="7" height="7" fill="${base}" /><rect width="3" height="7" fill="${color}" />
  </pattern>`;

function drawFocus(stateId: number): string {
  const { cells, states } = pack;
  const kindOf = (cellId: number) => (cells.province[cellId] ? focusKind(cells.province[cellId], stateId) : null);
  const isolines = getIsolines(pack, kindOf, { fill: true });

  let defs = "";
  let fills = "";
  for (const [kind, { fill }] of Object.entries(isolines)) {
    const { color } = FOCUS_LEGEND[kind as FocusKind];
    let paint: string = color;
    if (kind === "held" || kind === "lost") {
      paint = `url(#claims-${kind})`;
      const other = kind === "held" ? states[stateId].color! : "#5a1010";
      defs += stripes(`claims-${kind}`, other, color);
    }
    fills += `<path d="${fill}" fill="${paint}" fill-opacity=".62" />`;
  }

  // other states' claims on its land, and its own claims, as outlines
  const claimedCells = Array.from(cells.i).filter(cell => {
    const province = pack.provinces[cells.province[cell]];
    if (!province?.i || province.state !== stateId) return false;
    return province.claims?.length || province.cores?.some(id => id !== stateId);
  });
  const claimCells = Array.from(cells.i).filter(cell => {
    const kind = kindOf(cell);
    return kind === "claim" || kind === "irredenta";
  });
  const ownCells = Array.from(cells.i).filter(cell => cells.state[cell] === stateId);
  const ownPath = ownCells.length ? getVertexPath(ownCells, pack) : "";
  const outline = (cellIds: number[], color: string, dash: string, width: number) => {
    const d = cellIds.length ? getVertexPath(cellIds, pack) : "";
    return d
      ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dash}" />`
      : "";
  };

  return /* html */ `<defs>${defs}</defs>${fills}
    ${outline(claimedCells, FOCUS_LEGEND.claimed.color, "4 3", 2)}
    ${outline(claimCells, "#b71c1c", "6 4", 1.6)}
    <path d="${ownPath}" fill="none" stroke="#fff" stroke-width="3" stroke-opacity=".8" />
    <path d="${ownPath}" fill="none" stroke="#000" stroke-width="1.6" stroke-dasharray="8 6">
      <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="0.7s" repeatCount="indefinite" />
    </path>`;
}

/** Segments between neighboring cells held by states at war */
export function getFrontLines(): string {
  const { cells, vertices } = pack;
  const controller = cells.i.map(cell => (cells.h[cell] >= 20 ? cellController(cell) : 0));
  let d = "";
  for (const cell of cells.i) {
    const a = controller[cell];
    if (!a) continue;
    for (const neighbor of cells.c[cell]) {
      if (neighbor < cell || !isAtWar(a, controller[neighbor])) continue;
      const shared = cells.v[cell].filter(v => cells.v[neighbor].includes(v));
      if (shared.length < 2) continue;
      const [p, q] = [vertices.p[shared[0]], vertices.p[shared[1]]];
      d += `M${p[0]},${p[1]}L${q[0]},${q[1]}`;
    }
  }
  return d;
}

export function drawControl(): string {
  const { cells, states } = pack;
  const occupier = (cellId: number) => {
    const province = pack.provinces[cells.province[cellId]];
    return province?.controller && !province.removed ? province.controller : 0;
  };
  const isolines = getIsolines(pack, occupier, { fill: true });
  let defs = "";
  let fills = "";
  for (const [id, { fill }] of Object.entries(isolines)) {
    defs += stripes(`claims-occ${id}`, states[+id]?.color ?? "#000", "transparent");
    fills += `<path d="${fill}" fill="url(#claims-occ${id})" />`;
  }
  const front = getFrontLines();
  return /* html */ `<defs>${defs}</defs>${fills}
    ${
      front
        ? `<path d="${front}" fill="none" stroke="#fff" stroke-width="5" stroke-opacity=".7" stroke-linecap="round" />
    <path d="${front}" fill="none" stroke="#c0141c" stroke-width="2.6" stroke-linecap="round" />`
        : ""
    }`;
}

export function drawTension(): string {
  const { cells } = pack;
  const level = (cellId: number) => {
    const score = provinceTension(cells.province[cellId]);
    return score ? Math.min(score, 8) : null;
  };
  const isolines = getIsolines(pack, level, { fill: true });
  return Object.entries(isolines)
    .map(
      ([score, { fill }]) =>
        `<path d="${fill}" fill="${interpolateYlOrRd(0.15 + (+score / 8) * 0.85)}" fill-opacity=".7" />`
    )
    .join("");
}

export function showClaimsMap(mode: ClaimsMode, stateId: number): void {
  removeClaimsMap();
  const content = mode === "focus" ? drawFocus(stateId) : mode === "control" ? drawControl() : drawTension();
  document
    .getElementById("debug")
    ?.insertAdjacentHTML("beforeend", `<g id="${GROUP_ID}" pointer-events="none">${content}</g>`);
}

export function removeClaimsMap(): void {
  document.getElementById(GROUP_ID)?.remove();
}
