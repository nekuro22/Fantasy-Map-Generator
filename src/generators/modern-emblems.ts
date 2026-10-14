// Modern state emblems: flags and a socialist seal drawn as pictures, for the modern setting
import Alea from "alea";
import { CustomIcons, type IconPicture } from "@/components/icons";
import { Emblems } from "./emblems-generator";

const W = 300;
const H = 200;
const FRAME = `0 0 ${W} ${H}`;

const COLORS = {
  red: "#c8202f",
  blue: "#1f3f99",
  navy: "#14285e",
  sky: "#5fa8d3",
  green: "#1d8348",
  yellow: "#f2c200",
  orange: "#e8751a",
  white: "#ffffff",
  black: "#1a1a1a"
};
const PALETTE = [COLORS.red, COLORS.blue, COLORS.green, COLORS.yellow, COLORS.sky, COLORS.orange, COLORS.black];
const LIGHT = new Set([COLORS.white, COLORS.yellow, COLORS.sky]);

type Random = () => number;
const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)];

function star(cx: number, cy: number, r: number, fill: string, points = 5): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? r * (points === 5 ? 0.382 : 0.5) : r;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `<polygon points="${coords.join(" ")}" fill="${fill}"/>`;
}

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** a gold hammer crossed with a sickle, centred on 0,0 */
function hammerAndSickle(fill: string): string {
  const sickle = `<path d="M-20,16 A26,26 0 1 1 18,-14 L14,-8 A19,19 0 1 0 -14,10 Z" fill="${fill}"/><path d="M16,-16 L25,-23 L24,-11 Z" fill="${fill}"/>`;
  const hammer = `<g transform="rotate(-40)"><rect x="-2.6" y="-18" width="5.2" height="42" fill="${fill}"/><rect x="-11" y="-24" width="22" height="9" fill="${fill}"/></g>`;
  return `${sickle}${hammer}`;
}

/** a wreath of wheat around a star: the seal a socialist state puts on its papers */
function seal(red: string, gold: string): string {
  let ears = "";
  for (const side of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const angle = (-60 + i * 17) * (Math.PI / 180);
      const x = side * 52 * Math.cos(angle + 0.25);
      const y = 52 * Math.sin(angle + 0.25) + 18;
      const turn = (side * (angle * 180)) / Math.PI + 20 * side;
      ears += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.2" ry="10" transform="rotate(${turn.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${gold}"/>`;
    }
  const ribbon = `<path d="M-48,66 Q0,86 48,66 L52,76 Q0,98 -52,76 Z" fill="${red}" stroke="${gold}" stroke-width="2"/>`;
  return `<g transform="translate(150 96)"><circle cx="0" cy="0" r="38" fill="${red}" stroke="${gold}" stroke-width="3"/>${star(0, 0, 28, gold)}${ears}${ribbon}</g>`;
}

function stripes(count: number, a: string, b: string): string {
  const h = H / count;
  let out = rect(0, 0, W, H, b);
  for (let i = 0; i < count; i += 2) out += rect(0, +(i * h).toFixed(2), W, +h.toFixed(2), a);
  return out;
}

function starGrid(x: number, y: number, w: number, h: number, rows: number, cols: number, fill: string): string {
  let out = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out += star(x + ((c + 0.5) * w) / cols, y + ((r + 0.5) * h) / rows, Math.min(w / cols, h / rows) * 0.38, fill);
  return out;
}

function disc(cx: number, cy: number, r: number, fill: string, stroke = ""): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="3"` : ""}/>`;
}

const contrast = (color: string, a: string, b: string) => (LIGHT.has(color) ? a : b);

type Mark = "star" | "hammer" | "seal" | "ring";

/** one socialist symbol, centred on x,y and sized by scale (1 = about 60 px) */
function mark(kind: Mark, x: number, y: number, scale: number, field: string, accent: string): string {
  const at = (inner: string) => `<g transform="translate(${x} ${y}) scale(${scale})">${inner}</g>`;
  if (kind === "star") return at(star(0, 0, 30, accent));
  if (kind === "ring") return at(`${disc(0, 0, 34, field, accent)}${star(0, 0, 24, accent)}`);
  if (kind === "hammer") return at(`<g transform="scale(1.1)">${hammerAndSickle(accent)}</g>`);
  return at(`<g transform="scale(.45) translate(-150 -96)">${seal(field, accent)}</g>`);
}

/** a socialist flag: field, accent colour, layout and symbol all vary, so neighbours differ */
function socialist(random: Random, flag: FlagStyle, own: string): string {
  const fields = [COLORS.red, COLORS.red, COLORS.red, own, COLORS.green, COLORS.blue, COLORS.black, COLORS.orange];
  const field = pick(random, fields);
  const accent = LIGHT.has(field) ? COLORS.black : random() < 0.65 ? COLORS.yellow : COLORS.white;
  const band = pick(
    random,
    [COLORS.white, COLORS.yellow, COLORS.red, COLORS.green, COLORS.black, COLORS.blue].filter(c => c !== field)
  );
  const bandText = LIGHT.has(band) ? COLORS.black : accent === band ? COLORS.white : accent;
  const symbol: Mark =
    flag === "socialistHammer"
      ? "hammer"
      : flag === "socialistSeal"
        ? "seal"
        : pick(random, ["star", "star", "ring", "hammer"] as Mark[]);
  const layout = Math.floor(random() * 6);
  const base = rect(0, 0, W, H, field);
  if (flag === "socialistStripes" || layout === 5) {
    const thin = rect(0, H * 0.4, W, H * 0.2, band);
    const edge = random() < 0.5 ? rect(0, 0, W, 14, band) + rect(0, H - 14, W, 14, band) : "";
    return base + thin + edge + mark(symbol, W * 0.2, H * 0.2, 0.7, field, accent);
  }
  switch (layout) {
    case 0:
      return base + mark(symbol, 56, 52, 0.9, field, accent);
    case 1:
      return base + mark(symbol, W / 2, H / 2, 2, field, accent);
    case 2:
      return base + rect(0, 0, W * 0.3, H, band) + mark(symbol, W * 0.15, H / 2, 0.9, band, bandText);
    case 3:
      return (
        base +
        rect(0, 0, W, H * 0.12, band) +
        rect(0, H * 0.88, W, H * 0.12, band) +
        mark(symbol, W / 2, H / 2, 1.6, field, accent)
      );
    default:
      return `${base}<polygon points="0,0 ${W * 0.4},0 0,${H * 0.6}" fill="${band}"/>${mark(symbol, W * 0.62, H / 2, 1.7, field, accent)}`;
  }
}

export type FlagStyle =
  | "tricolor"
  | "tricolorVertical"
  | "bicolor"
  | "stripesCanton"
  | "nordic"
  | "emblem"
  | "bend"
  | "chevron"
  | "disc"
  | "cross"
  | "socialistStar"
  | "socialistHammer"
  | "socialistStripes"
  | "socialistSeal"
  | "black";

const FLAGS_BY_FORM: Record<string, Partial<Record<FlagStyle, number>>> = {
  Monarchy: { tricolor: 4, tricolorVertical: 2, nordic: 3, emblem: 3, bicolor: 2, cross: 2, disc: 1 },
  Republic: { tricolor: 6, tricolorVertical: 6, bend: 2, chevron: 2, disc: 2, emblem: 2, bicolor: 2 },
  Union: { stripesCanton: 2, tricolor: 4, nordic: 3, emblem: 2, chevron: 2 },
  Theocracy: { emblem: 4, tricolor: 2, cross: 2, disc: 2 },
  Anarchy: { black: 1 },
  Socialist: { socialistStar: 4, socialistHammer: 4, socialistStripes: 2, socialistSeal: 2 }
};

/** The flag styles a form of government draws from, with their weights */
export function flagStyles(form: string): Partial<Record<FlagStyle, number>> {
  return FLAGS_BY_FORM[form] ?? FLAGS_BY_FORM.Republic;
}

/** A flag as svg content in a 300 x 200 frame; the state's colour is one of its colours */
export function drawFlag(seed: string, form: string, stateColor = "", style?: FlagStyle): string {
  const random = Alea(seed);
  const weights = Object.entries(flagStyles(form)) as [FlagStyle, number][];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  let chosen = weights[0][0];
  for (const [name, weight] of weights) {
    roll -= weight;
    if (roll < 0) {
      chosen = name;
      break;
    }
  }
  const flag = style ?? chosen;

  const colors = [...PALETTE];
  const own = /^#[0-9a-f]{6}$/i.test(stateColor) ? stateColor : pick(random, PALETTE);
  const main = random() < 0.6 ? own : pick(random, colors);
  const second = pick(
    random,
    colors.filter(c => c !== main)
  );
  const third = pick(
    random,
    [COLORS.white, ...colors].filter(c => c !== second)
  );
  const mid = random() < 0.6 ? COLORS.white : pick(random, [COLORS.yellow, COLORS.white, COLORS.sky]);
  const gold = COLORS.yellow;
  const red = COLORS.red;
  let art = "";

  switch (flag) {
    case "tricolor": {
      art = rect(0, 0, W, H / 3 + 1, main) + rect(0, H / 3, W, H / 3 + 1, mid) + rect(0, (H * 2) / 3, W, H / 3, third);
      if (random() < 0.4) art += star(W / 2, H / 2, 26, contrast(mid, second, gold));
      break;
    }
    case "tricolorVertical": {
      art = rect(0, 0, W / 3 + 1, H, main) + rect(W / 3, 0, W / 3 + 1, H, mid) + rect((W * 2) / 3, 0, W / 3, H, third);
      if (random() < 0.4) art += disc(W / 2, H / 2, 28, contrast(mid, second, main));
      break;
    }
    case "bicolor": {
      const vertical = random() < 0.3;
      art = vertical
        ? rect(0, 0, W / 2, H, main) + rect(W / 2, 0, W / 2, H, second)
        : rect(0, 0, W, H / 2, main) + rect(0, H / 2, W, H / 2, second);
      if (random() < 0.5) art += star(W / 2, H / 2, 30, COLORS.white);
      break;
    }
    case "stripesCanton": {
      const count = pick(random, [7, 9, 11, 13]);
      const field = pick(random, [COLORS.blue, COLORS.navy, COLORS.green, main]);
      const stripe = pick(random, [COLORS.red, COLORS.red, COLORS.green, COLORS.blue]);
      art = stripes(count, stripe === field ? COLORS.black : stripe, COLORS.white);
      const [cw, ch] = [W * 0.42, (H / count) * Math.ceil(count * 0.55)];
      art +=
        rect(0, 0, cw, ch, field) +
        starGrid(4, 4, cw - 8, ch - 8, pick(random, [3, 4, 5]), pick(random, [4, 5, 6]), COLORS.white);
      break;
    }
    case "nordic": {
      art = rect(0, 0, W, H, main) + rect(0, 78, W, 44, second) + rect(86, 0, 44, H, second);
      art += rect(0, 88, W, 24, mid) + rect(96, 0, 24, H, mid);
      break;
    }
    case "emblem": {
      art = rect(0, 0, W, H / 3 + 1, main) + rect(0, H / 3, W, H / 3 + 1, mid) + rect(0, (H * 2) / 3, W, H / 3, main);
      art += pick(random, [
        disc(W / 2, H / 2, 34, second, COLORS.black),
        star(W / 2, H / 2, 40, second),
        `${disc(W / 2, H / 2, 36, second)}${star(W / 2, H / 2, 24, COLORS.white)}`
      ]);
      break;
    }
    case "bend": {
      art = `${rect(0, 0, W, H, main)}<polygon points="0,${H} ${W},0 ${W},${H}" fill="${second}"/>`;
      art += `<polygon points="0,${H - 40} ${W - 60},0 ${W},0 ${W},40 60,${H} 0,${H}" fill="${mid}"/>`;
      art += `<polygon points="0,${H - 26} ${W - 40},0 ${W},0 ${W},26 40,${H} 0,${H}" fill="${third}"/>`;
      break;
    }
    case "chevron": {
      art = rect(0, 0, W, H, main) + rect(0, 0, W, H / 2, second) + rect(0, H / 2, W, H / 2, third);
      art += `<polygon points="0,0 ${W * 0.45},${H / 2} 0,${H}" fill="${mid}"/>`;
      art += star(W * 0.15, H / 2, 20, contrast(mid, second, main));
      break;
    }
    case "disc": {
      art = rect(0, 0, W, H, main) + disc(W / 2, H / 2, 58, contrast(main, second, mid));
      break;
    }
    case "cross": {
      art =
        rect(0, 0, W, H, main) +
        rect(0, 82, W, 36, mid) +
        rect(132, 0, 36, H, mid) +
        rect(0, 92, W, 16, second) +
        rect(142, 0, 16, H, second);
      break;
    }
    case "socialistStar":
    case "socialistHammer":
    case "socialistStripes":
    case "socialistSeal": {
      art = socialist(random, flag, own);
      break;
    }
    case "black": {
      art = `${rect(0, 0, W, H, COLORS.black)}<polygon points="0,${H} ${W},0 ${W},${H}" fill="${red}"/>`;
      break;
    }
  }
  return `${art}<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>`;
}

const iconId = (type: string, id: number) => `custom-flag-${type}-${id}`;

/** Give a state, province or burg a modern flag as its emblem; the art is kept as a custom icon of the map */
export function applyFlag(
  type: "state" | "province" | "burg",
  id: number,
  form: string,
  color = "",
  style?: FlagStyle
): void {
  const seed = `${options.map.seed}-flag-${type}-${id}-${Math.floor(Math.random() * 1e6)}`;
  const art: IconPicture = { kind: "svg", content: `<g>${drawFlag(seed, form, color, style)}</g>`, viewBox: FRAME };
  const icon = iconId(type, id);
  if (CustomIcons.get(icon)) CustomIcons.update(icon, art);
  else CustomIcons.add({ id: icon, ...art });
  Emblems.set(`${type}:${id}`, { icon });
}

/** Flags for every state of a modern map; its seed picks them, so the same map gets the same flags */
export function applyFlagsToStates(): void {
  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    const seed = `${options.map.seed}-flag-${state.i}`;
    const art: IconPicture = {
      kind: "svg",
      content: `<g>${drawFlag(seed, state.form ?? "Republic", state.color)}</g>`,
      viewBox: FRAME
    };
    const icon = iconId("state", state.i);
    if (CustomIcons.get(icon)) CustomIcons.update(icon, art);
    else CustomIcons.add({ id: icon, ...art });
    Emblems.set(`state:${state.i}`, { icon });
  }
  // flags of states that no longer exist go
  for (const icon of CustomIcons.all) {
    const match = /^custom-flag-state-(\d+)$/.exec(icon.id);
    if (match && !pack.states[+match[1]]?.i) CustomIcons.remove(icon.id);
  }
}

/** every flag style a person can pick by hand */
export const FLAG_STYLES: [FlagStyle, string][] = [
  ["tricolor", "Tricolor (horizontal)"],
  ["tricolorVertical", "Tricolor (vertical)"],
  ["bicolor", "Two stripes"],
  ["stripesCanton", "Stripes and stars (USA-like)"],
  ["nordic", "Nordic cross"],
  ["cross", "Cross"],
  ["emblem", "Emblem on field"],
  ["bend", "Diagonal band"],
  ["chevron", "Chevron"],
  ["disc", "Disc"],
  ["socialistStar", "Socialist: star"],
  ["socialistHammer", "Socialist: hammer"],
  ["socialistStripes", "Socialist: stripes"],
  ["socialistSeal", "Socialist: seal"],
  ["black", "Black"]
];

export const ModernEmblems = { FLAG_STYLES, drawFlag, applyFlag, applyFlagsToStates, flagStyles };
