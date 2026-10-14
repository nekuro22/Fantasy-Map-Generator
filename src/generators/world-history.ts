// The chronicle of a world: saved versions of the map, each dated by the map's calendar, and what changed
// from one version to the next. The pure part: summaries of the map and the differences between them
export interface StateSummary {
  i: number;
  name: string;
  form: string;
  capital: string;
  provinces: number;
  area: number;
}

export interface WorldSummary {
  states: StateSummary[];
  /** province id -> state id that owns it */
  owners: Record<number, number>;
  /** province id -> state id that holds it by occupation */
  holders: Record<number, number>;
  provinceNames: Record<number, string>;
  /** pairs of state ids at war, smaller id first */
  wars: [number, number][];
}

export interface WorldVersion {
  id: string;
  /** the world it belongs to: the map's seed */
  world: string;
  title: string;
  note: string;
  year: number;
  era: string;
  savedAt: number;
  summary: WorldSummary;
}

export type ChangeKind =
  | "founded"
  | "gone"
  | "renamed"
  | "form"
  | "capital"
  | "gained"
  | "lost"
  | "occupied"
  | "liberated"
  | "war"
  | "peace";

export interface Change {
  kind: ChangeKind;
  state: string;
  other?: string;
  count?: number;
  provinces?: string[];
}

/** What the map looks like now, in the few numbers a chronicle needs */
export function summarize(): WorldSummary {
  const { states, provinces, burgs } = pack;
  const living = states.filter(s => s.i && !s.removed);
  const summary: WorldSummary = { states: [], owners: {}, holders: {}, provinceNames: {}, wars: [] };
  for (const state of living) {
    summary.states.push({
      i: state.i,
      name: state.name,
      form: state.formName || state.form || "",
      capital: burgs[state.capital]?.name ?? "",
      provinces: provinces.filter(p => p?.i && !p.removed && p.state === state.i).length,
      area: state.area ?? 0
    });
  }
  for (const province of provinces) {
    if (!province?.i || province.removed) continue;
    summary.owners[province.i] = province.state;
    summary.provinceNames[province.i] = province.name;
    if (province.controller && province.controller !== province.state)
      summary.holders[province.i] = province.controller;
  }
  for (const a of living)
    for (const b of living)
      if (a.i < b.i && (a.diplomacy?.[b.i] === "Enemy" || b.diplomacy?.[a.i] === "Enemy"))
        summary.wars.push([a.i, b.i]);
  return summary;
}

/** Versions in the order of the world's history: by year, saved earlier first */
export function sortVersions(versions: WorldVersion[]): WorldVersion[] {
  return [...versions].sort((a, b) => a.year - b.year || a.savedAt - b.savedAt);
}

/** What happened to the states and their land between two versions */
export function diffWorlds(before: WorldSummary, after: WorldSummary): Change[] {
  const changes: Change[] = [];
  const old = new Map(before.states.map(s => [s.i, s]));
  const now = new Map(after.states.map(s => [s.i, s]));
  const name = (id: number) => now.get(id)?.name ?? old.get(id)?.name ?? `#${id}`;

  for (const state of after.states) {
    const was = old.get(state.i);
    if (!was) {
      changes.push({ kind: "founded", state: state.name });
      continue;
    }
    if (was.name !== state.name) changes.push({ kind: "renamed", state: state.name, other: was.name });
    if (was.form !== state.form && state.form) changes.push({ kind: "form", state: state.name, other: state.form });
    if (was.capital !== state.capital && state.capital)
      changes.push({ kind: "capital", state: state.name, other: state.capital });
  }
  for (const state of before.states) if (!now.has(state.i)) changes.push({ kind: "gone", state: state.name });

  // land changing hands: grouped by receiving and losing state
  const moved = new Map<string, { to: number; from: number; names: string[] }>();
  for (const [id, owner] of Object.entries(after.owners)) {
    const was = before.owners[+id];
    if (was === undefined || was === owner) continue;
    const key = `${owner}:${was}`;
    const entry = moved.get(key) ?? { to: owner, from: was, names: [] };
    entry.names.push(after.provinceNames[+id]);
    moved.set(key, entry);
  }
  for (const { to, from, names } of moved.values()) {
    changes.push({ kind: "gained", state: name(to), other: name(from), count: names.length, provinces: names });
    changes.push({ kind: "lost", state: name(from), other: name(to), count: names.length, provinces: names });
  }

  const held = new Map<string, { by: number; of: number; names: string[] }>();
  const freed = new Map<string, { by: number; of: number; names: string[] }>();
  const note = (map: Map<string, { by: number; of: number; names: string[] }>, by: number, of: number, id: number) => {
    const key = `${by}:${of}`;
    const entry = map.get(key) ?? { by, of, names: [] };
    entry.names.push(after.provinceNames[id] ?? before.provinceNames[id]);
    map.set(key, entry);
  };
  for (const id of new Set([...Object.keys(before.holders), ...Object.keys(after.holders)].map(Number))) {
    const was = before.holders[id];
    const is = after.holders[id];
    if (was === is) continue;
    if (is !== undefined) note(held, is, after.owners[id] ?? before.owners[id], id);
    else if (was !== undefined) note(freed, was, before.owners[id] ?? after.owners[id], id);
  }
  for (const { by, of, names } of held.values())
    changes.push({ kind: "occupied", state: name(by), other: name(of), count: names.length, provinces: names });
  for (const { by, of, names } of freed.values())
    changes.push({ kind: "liberated", state: name(of), other: name(by), count: names.length, provinces: names });

  const key = (pair: [number, number]) => `${pair[0]}-${pair[1]}`;
  const wasWar = new Set(before.wars.map(key));
  const isWar = new Set(after.wars.map(key));
  for (const pair of after.wars)
    if (!wasWar.has(key(pair))) changes.push({ kind: "war", state: name(pair[0]), other: name(pair[1]) });
  for (const pair of before.wars)
    if (!isWar.has(key(pair))) changes.push({ kind: "peace", state: name(pair[0]), other: name(pair[1]) });
  return changes;
}

/** Territory of every state over the versions in order: state name -> province counts, null before it existed */
export function territoryTable(versions: WorldVersion[]): { name: string; counts: (number | null)[] }[] {
  const rows = new Map<number, { name: string; counts: (number | null)[] }>();
  versions.forEach((version, index) => {
    for (const state of version.summary.states) {
      const row = rows.get(state.i) ?? { name: state.name, counts: versions.map(() => null) };
      row.name = state.name;
      row.counts[index] = state.provinces;
      rows.set(state.i, row);
    }
  });
  return [...rows.values()];
}
