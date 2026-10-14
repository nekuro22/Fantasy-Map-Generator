// What changed between two versions of the same map: states, territory, provinces, burgs, diplomacy
import { entities, Index, SEA_LEVEL } from "./query.js";

const pct = (a, b) => (a ? Math.round(((b - a) / a) * 1000) / 10 : null);

export function diffWorlds(before, after, { limit = 40 } = {}) {
  const sameGraph =
    before.cells.v.length === after.cells.v.length &&
    String(before.seed) === String(after.seed) &&
    before.cells.p.slice(0, 50).every((p, i) => String(p) === String(after.cells.p[i]));
  const [ia, ib] = [new Index(before), new Index(after)];
  const result = { sameGraph, notes: [] };
  if (String(before.seed) !== String(after.seed))
    result.notes.push(`Different seeds (${before.seed} vs ${after.seed}): these look like two different maps, not two versions of one`);
  if (!sameGraph)
    result.notes.push("The maps have different cell graphs (another seed or regenerated): states are matched by name and cell transfers are skipped");

  // states
  const sa = new Map(entities(before, "states").map(s => [s.i, s]));
  const sb = new Map(entities(after, "states").map(s => [s.i, s]));
  const key = s => (sameGraph ? s.i : s.name.toLowerCase());
  const ka = new Map([...sa.values()].map(s => [key(s), s]));
  const kb = new Map([...sb.values()].map(s => [key(s), s]));
  const statA = ia.of("states");
  const statB = ib.of("states");
  const stat = (st, s) => st.get(s.i) ?? { cells: 0, area: 0, population: 0 };

  result.states = {
    added: [...kb].filter(([k]) => !ka.has(k)).map(([, s]) => ({ id: s.i, name: s.name, fullName: s.fullName, ...pick(stat(statB, s)) })),
    removed: [...ka].filter(([k]) => !kb.has(k)).map(([, s]) => ({ id: s.i, name: s.name, fullName: s.fullName, ...pick(stat(statA, s)) })),
    changed: [],
    territory: []
  };
  for (const [k, a] of ka) {
    const b = kb.get(k);
    if (!b) continue;
    const fields = {};
    for (const f of ["name", "fullName", "form", "formName"]) if ((a[f] ?? "") !== (b[f] ?? "")) fields[f] = [a[f], b[f]];
    const capA = before.burgs[a.capital]?.name;
    const capB = after.burgs[b.capital]?.name;
    if (capA !== capB) fields.capital = [capA, capB];
    if (Object.keys(fields).length) result.states.changed.push({ id: b.i, name: b.name, ...fields });
    const [x, y] = [stat(statA, a), stat(statB, b)];
    if (x.cells !== y.cells || Math.abs(x.population - y.population) > 0.005 * (x.population || 1))
      result.states.territory.push({
        id: b.i,
        name: b.name,
        cells: [x.cells, y.cells],
        area: [x.area, y.area],
        areaChange: pct(x.area, y.area),
        population: [x.population, y.population],
        populationChange: pct(x.population, y.population)
      });
  }
  result.states.territory.sort((p, q) => Math.abs(q.area[1] - q.area[0]) - Math.abs(p.area[1] - p.area[0]));
  const counts = { added: result.states.added.length, removed: result.states.removed.length, changed: result.states.changed.length, territory: result.states.territory.length };
  result.states = trimAll(result.states, limit);

  // land changing hands, cell by cell
  if (sameGraph) {
    const transfers = new Map();
    const areas = ib.cellArea();
    const scale = after.units.distanceScale ** 2;
    for (let c = 0; c < after.cells.v.length; c++) {
      if (after.cells.h[c] < SEA_LEVEL) continue;
      const from = before.cells.state[c];
      const to = after.cells.state[c];
      if (from === to) continue;
      const k = `${from}>${to}`;
      const t = transfers.get(k) ?? { from, to, cells: 0, area: 0, population: 0 };
      t.cells++;
      t.area += areas[c] * scale;
      t.population += (after.cells.pop[c] ?? 0) * after.units.populationRate;
      transfers.set(k, t);
    }
    const name = (world, id) => (id ? (world.states[id]?.name ?? `#${id}`) : "neutral lands");
    result.transfers = [...transfers.values()]
      .sort((p, q) => q.area - p.area)
      .map(t => ({
        from: name(before, t.from),
        to: name(after, t.to),
        cells: t.cells,
        area: Math.round(t.area),
        ruralPopulation: Math.round(t.population)
      }));
    if (result.transfers.length > limit) result.transfersTotal = result.transfers.length;
    result.transfers = result.transfers.slice(0, limit);
  }

  // provinces
  const pa = new Map(entities(before, "provinces").map(p => [p.i, p]));
  const pb = new Map(entities(after, "provinces").map(p => [p.i, p]));
  const stateName = (world, id) => (id ? world.states[id]?.name : undefined);
  const names = (world, ids) => (ids ?? []).map(id => stateName(world, id)).filter(Boolean).sort().join(", ");
  const provinces = { added: [], removed: [], ownerChanged: [], occupationChanged: [], claimsChanged: [], renamed: [] };
  if (sameGraph) {
    for (const [id, b] of pb) {
      const a = pa.get(id);
      if (!a) {
        provinces.added.push({ id, name: b.name, state: stateName(after, b.state) });
        continue;
      }
      if (a.name !== b.name) provinces.renamed.push({ id, from: a.name, to: b.name });
      if (stateName(before, a.state) !== stateName(after, b.state))
        provinces.ownerChanged.push({ id, name: b.name, from: stateName(before, a.state), to: stateName(after, b.state) });
      const ca = stateName(before, a.controller || a.state);
      const cb = stateName(after, b.controller || b.state);
      if (ca !== cb) provinces.occupationChanged.push({ id, name: b.name, from: ca, to: cb });
      const [coresA, coresB, claimsA, claimsB] = [names(before, a.cores), names(after, b.cores), names(before, a.claims), names(after, b.claims)];
      if (coresA !== coresB || claimsA !== claimsB)
        provinces.claimsChanged.push({ id, name: b.name, cores: [coresA, coresB], claims: [claimsA, claimsB] });
    }
    for (const [id, a] of pa) if (!pb.has(id)) provinces.removed.push({ id, name: a.name, state: stateName(before, a.state) });
  } else {
    const byName = m => new Map([...m.values()].map(p => [p.name.toLowerCase(), p]));
    const [na, nb] = [byName(pa), byName(pb)];
    for (const [n, b] of nb) {
      const a = na.get(n);
      if (!a) provinces.added.push({ id: b.i, name: b.name, state: stateName(after, b.state) });
      else if (stateName(before, a.state) !== stateName(after, b.state))
        provinces.ownerChanged.push({ id: b.i, name: b.name, from: stateName(before, a.state), to: stateName(after, b.state) });
    }
    for (const [n, a] of na) if (!nb.has(n)) provinces.removed.push({ id: a.i, name: a.name, state: stateName(before, a.state) });
  }
  result.provinces = trimAll(provinces, limit);

  // burgs
  const burgs = { added: [], removed: [], renamed: [], stateChanged: [] };
  const ba = new Map(entities(before, "burgs").map(b => [sameGraph ? b.i : b.name.toLowerCase(), b]));
  const bb = new Map(entities(after, "burgs").map(b => [sameGraph ? b.i : b.name.toLowerCase(), b]));
  for (const [k, b] of bb) {
    const a = ba.get(k);
    if (!a) burgs.added.push({ id: b.i, name: b.name, state: stateName(after, b.state) });
    else {
      if (a.name !== b.name) burgs.renamed.push({ id: b.i, from: a.name, to: b.name });
      if (stateName(before, a.state) !== stateName(after, b.state))
        burgs.stateChanged.push({ id: b.i, name: b.name, from: stateName(before, a.state) ?? "neutral", to: stateName(after, b.state) ?? "neutral" });
    }
  }
  for (const [k, a] of ba) if (!bb.has(k)) burgs.removed.push({ id: a.i, name: a.name, state: stateName(before, a.state) });
  result.burgs = trimAll(burgs, limit);

  // diplomacy between states present in both
  const relations = [];
  const pairs = [...ka].filter(([k]) => kb.has(k)).map(([k, a]) => [a, kb.get(k)]);
  for (let x = 0; x < pairs.length; x++)
    for (let y = x + 1; y < pairs.length; y++) {
      const [a1, b1] = pairs[x];
      const [a2, b2] = pairs[y];
      const ra = a1.diplomacy?.[a2.i];
      const rb = b1.diplomacy?.[b2.i];
      if (ra && rb && ra !== rb) relations.push({ state: b1.name, other: b2.name, from: ra, to: rb });
    }
  result.diplomacy = relations.slice(0, limit);
  if (relations.length > limit) result.diplomacyTotal = relations.length;

  // factions: founded, ended, members joined or left (maps from before factions have none)
  const factionsA = new Map((before.factions ?? []).filter(f => !f.removed).map(f => [f.i, f]));
  const factionsB = new Map((after.factions ?? []).filter(f => !f.removed).map(f => [f.i, f]));
  const sname = (w, id) => w.states[id]?.name ?? `#${id}`;
  const factionRows = [];
  for (const [i, f] of factionsB) {
    const was = factionsA.get(i);
    if (!was) factionRows.push({ faction: f.name, change: "founded", state: sname(after, f.leader) });
    for (const m of f.members) if (was && !was.members.includes(m)) factionRows.push({ faction: f.name, change: "joined", state: sname(after, m) });
    for (const m of was?.members ?? []) if (!f.members.includes(m)) factionRows.push({ faction: f.name, change: "left", state: sname(after, m) });
  }
  for (const [i, f] of factionsA) if (!factionsB.has(i)) factionRows.push({ faction: f.name, change: "ended", state: sname(before, f.leader) });
  result.factions = factionRows.slice(0, limit);
  if (factionRows.length > limit) result.factionsTotal = factionRows.length;

  const newChronicle = (after.states[0]?.diplomacy ?? []).slice((before.states[0]?.diplomacy ?? []).length);
  if (Array.isArray(newChronicle) && newChronicle.length) result.chronicle = newChronicle.map(e => (Array.isArray(e) ? e.join(": ") : String(e)));

  result.summary = {
    statesAdded: counts.added,
    statesRemoved: counts.removed,
    statesChanged: counts.changed,
    statesWithTerritoryChange: counts.territory,
    provincesChangedOwner: provinces.ownerChanged.length,
    burgsChangedState: burgs.stateChanged.length,
    relationsChanged: relations.length,
    factionChanges: factionRows.length
  };
  return result;
}

const pick = ({ cells, area, population }) => ({ cells, area, population });

function trimAll(groups, limit) {
  const out = {};
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue;
    out[k] = list.slice(0, limit);
    if (list.length > limit) out[`${k}Total`] = list.length;
  }
  return out;
}
