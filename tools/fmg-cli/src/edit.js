// Edits on a .map file's records, mirroring the generator's own model edits
import { alive, byId, entities, kindOf, regionOwner, resolve, stripHtml } from "./query.js";

export const STATE_FORMS = {
  Monarchy: ["Beylik", "Despotate", "Dominion", "Duchy", "Emirate", "Empire", "Horde", "Grand Duchy", "Heptarchy", "Khaganate", "Khanate", "Kingdom", "Marches", "Principality", "Satrapy", "Shogunate", "Sultanate", "Tsardom", "Ulus", "Viceroyalty"],
  Republic: ["Chancellery", "City-state", "Democratic Republic", "Diarchy", "Federal Republic", "Federation", "Free City", "Junta", "Most Serene Republic", "Oligarchy", "Protectorate", "Republic", "Tetrarchy", "Trade Company", "Triumvirate"],
  Union: ["Confederacy", "Confederation", "Conglomerate", "Commonwealth", "League", "Union", "United Hordes", "United Kingdom", "United Provinces", "United Republic", "United States", "United Tribes"],
  Theocracy: ["Bishopric", "Brotherhood", "Caliphate", "Diocese", "Divine Duchy", "Divine Grand Duchy", "Divine Principality", "Divine Kingdom", "Divine Empire", "Eparchy", "Exarchate", "Holy State", "Imamah", "Patriarchate", "See", "Thearchy", "Theocracy"],
  Anarchy: ["Commune", "Community", "Council", "Free Territory", "Tribes"],
  Socialist: ["Commissariat", "People's Democratic Republic", "People's Republic", "Socialist Federation", "Socialist Republic", "Soviet Republic", "Soviet Union", "Workers' Republic"]
};
export const GOVERNMENTS = Object.keys(STATE_FORMS);
// only in the fork with the Socialist government; the upstream generator keeps the value but has no rules for it
const FORK_ONLY = new Set(["Socialist"]);
// "Aurelian Empire" rather than "Empire of Aurelia"
const ADJECTIVE_FORMS = new Set(["Empire", "Sultanate", "Khaganate", "Shogunate", "Caliphate", "Despotate", "Theocracy", "Oligarchy", "Union", "Confederation", "Trade Company", "League", "Tetrarchy", "Triumvirate", "Diarchy", "Horde", "Marches", "Soviet Union", "Socialist Federation"]);

export const RELATIONS = ["Ally", "Friendly", "Neutral", "Suspicion", "Enemy", "Unknown", "Rival", "Vassal", "Suzerain"];
const inverse = r => (r === "Vassal" ? "Suzerain" : r === "Suzerain" ? "Vassal" : r);
const RELATION_EVENTS = {
  Ally: ["Defence pact", (a, b) => `${a} entered into defensive pact with ${b}`],
  Enemy: ["War declaration", (a, b) => `${a} declared a war on its enemy ${b}`],
  Unknown: ["Relations severance", (a, b) => `${a} recalled their ambassadors and wiped all the records about ${b}`],
  Rival: ["Rivalization", (a, b) => `${a} and ${b} became rivals`],
  Vassal: ["Vassalization", (a, b) => `${a} became a vassal of ${b}`],
  Suzerain: ["Vassalization", (a, b) => `${a} vassalized ${b}`]
};

export const CLAIM_KINDS = ["core", "claim", "none"];
export const FACTION_TYPES = ["Alliance", "League", "Pact", "Bloc", "Commonwealth", "Holy League", "Coalition", "Union"];
export const FACTION_ACTIONS = ["create", "join", "leave", "dissolve", "leader", "arms"];

// "Duchy of Nordmark", "Land Nordmark": the generator's naming of regions
const regionFullName = (name, formName) => (!formName ? name : formName === "Land" ? `${formName} ${name}` : `${formName} of ${name}`);

/** Editable fields per type */
export const FIELDS = {
  states: ["name", "fullName", "formName", "form", "color", "note", "history", "lore"],
  provinces: ["name", "fullName", "formName", "color", "note", "history"],
  burgs: ["name", "population", "note"],
  cultures: ["name", "color", "note"],
  religions: ["name", "color", "deity", "note"],
  rivers: ["name", "note"],
  routes: ["name", "note"],
  markers: ["name", "note"],
  zones: ["name", "color", "note"],
  features: ["name", "note"],
  biomes: ["name", "color"],
  regions: ["name", "formName", "color", "lore", "history"],
  factions: ["name", "type", "color"]
};
const ALIAS = { fullname: "fullName", formname: "formName", government: "form", pop: "population" };

const escapeHtml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const toNote = text =>
  text.trim()
    ? text
        .split(/\n+/)
        .map(p => `<p>${escapeHtml(p)}</p>`)
        .join("")
    : "";
const requireName = v => {
  const name = String(v).trim();
  if (!name) throw new Error("The name must not be empty");
  return name;
};
const requireColor = v => {
  const c = String(v).trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) throw new Error(`"${v}" is not a HEX color like #a1b2c3`);
  return c.toLowerCase();
};
const replaceWholeWord = (text, word, by) => {
  if (!text || !word) return undefined;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "gu");
  return re.test(text) ? text.replace(re, (_, pre) => pre + by) : undefined;
};

/** Applies operations to a MapFile; every op returns what it changed */
export class Editor {
  constructor(file) {
    this.file = file;
    this.data = file.data;
    this.changes = [];
    this.warnings = [];
  }

  apply(op) {
    const { op: name, ...args } = op;
    const handler = {
      set: () => this.set(args.type, args.ref, args.field, args.value),
      relation: () => this.relation(args.state, args.other, args.relation),
      claim: () => this.claim(args.province, args.state, args.claim),
      occupy: () => this.occupy(args.province, args.state),
      "owner-cores": () => this.ownerCores(),
      faction: () => this.faction(args.action, args),
      "region-add": () => this.regionAdd(args.state, args.name, args.formName, args.color),
      "region-remove": () => this.regionRemove(args.region),
      "assign-region": () => this.assignRegion(args.province, args.region)
    }[name];
    if (!handler)
      throw new Error(`Unknown op "${name}". Ops: set, relation, claim, occupy, owner-cores, faction, region-add, region-remove, assign-region`);
    handler();
  }

  record(kind, e, field, from, to) {
    if (JSON.stringify(from) === JSON.stringify(to)) return;
    this.file.touch(kind === "regions" ? "states" : kind);
    this.changes.push({ type: kind, id: e.i, name: e.name, field, from: this.readable(field, from), to: this.readable(field, to) });
  }

  // stored ids and population points as the user sees them
  readable(field, value) {
    if (value === undefined || value === null) return value;
    const state = id => this.data.states[id]?.name ?? `#${id}`;
    if (field === "controller") return state(value);
    if (field === "cores" || field === "claims") return value.map(state);
    if (field === "population") {
      const u = this.units();
      return Math.round(value * u.populationRate * u.urbanization);
    }
    if (field === "note") return stripHtml(value);
    return value;
  }

  set(type, ref, fieldName, value) {
    const kind = kindOf(type);
    const field = ALIAS[String(fieldName).toLowerCase()] ?? fieldName;
    if (!FIELDS[kind].includes(field))
      throw new Error(`${kind} field "${fieldName}" cannot be set here. Editable: ${FIELDS[kind].join(", ")}`);
    const e = this.target(kind, ref);
    const assign = (key, next) => {
      const prev = e[key];
      if (next === undefined || next === "") delete e[key];
      else e[key] = next;
      this.record(kind, e, key, prev, e[key]);
    };

    if (field === "note") return assign("note", toNote(String(value)) || undefined);
    if (field === "history") return assign("history", String(value).replace(/\s+$/, "") || undefined);
    if (field === "lore") return assign("lore", String(value).replace(/\s+$/, "") || undefined);
    if (kind === "regions" && (field === "name" || field === "formName")) {
      const name = field === "name" ? requireName(value) : e.name;
      const formName = field === "formName" ? String(value).trim() : e.formName;
      assign(field, field === "name" ? name : formName);
      return assign("fullName", regionFullName(name, formName));
    }
    if (kind === "factions" && (field === "name" || field === "type")) return assign(field, requireName(value));
    if (field === "color") return assign("color", requireColor(value));
    if (field === "deity") return assign("deity", String(value).trim() || null);
    if (field === "population") {
      const people = Number(value);
      if (!Number.isFinite(people) || people < 0) throw new Error("The population must be a non-negative number of people");
      const units = this.units();
      return assign("population", Math.round((people / units.populationRate / units.urbanization) * 1e4) / 1e4);
    }
    if (kind === "states" && ["name", "fullName", "formName"].includes(field)) this.resetLabel(e);
    if (field === "fullName") return assign("fullName", requireName(value));

    if (field === "name") {
      const old = e.name;
      const name = requireName(value);
      assign("name", name);
      if (kind === "states" || kind === "provinces") {
        const rebuilt = kind === "provinces" && e.formName ? `${name} ${e.formName}` : name;
        assign("fullName", replaceWholeWord(e.fullName, old, name) ?? (kind === "states" ? this.fullName(e) : rebuilt));
      }
      if (kind !== "states" && e.label?.text !== undefined) {
        const text = kind === "burgs" ? name : (replaceWholeWord(e.label.text, old, name) ?? e.label.text);
        if (text !== e.label.text) {
          const label = { ...e.label, text };
          assign("label", label);
        }
      }
      return;
    }

    if (kind === "provinces" && field === "formName") {
      const formName = String(value).trim();
      assign("formName", formName);
      return assign("fullName", formName ? `${e.name} ${formName}` : e.name);
    }

    if (kind === "states" && field === "form") {
      const government = GOVERNMENTS.find(g => g.toLowerCase() === String(value).trim().toLowerCase());
      if (!government)
        throw new Error(`"${value}" is not a government. Use one of ${GOVERNMENTS.join(", ")}; for names like "People's Republic" set formName`);
      this.forkWarning(government);
      return assign("form", government);
    }

    if (kind === "states" && field === "formName") {
      const formName = String(value).trim();
      const government = GOVERNMENTS.find(g => STATE_FORMS[g].some(f => f.toLowerCase() === formName.toLowerCase()));
      const canonical = government ? STATE_FORMS[government].find(f => f.toLowerCase() === formName.toLowerCase()) : formName;
      const oldForm = e.formName;
      assign("formName", canonical || undefined);
      if (government) {
        this.forkWarning(government);
        assign("form", government);
      } else if (canonical)
        this.warnings.push(`"${canonical}" is a custom form name: the government stays ${e.form ?? "unset"} (set form=… to change it)`);
      return assign("fullName", this.fullName(e, oldForm));
    }
  }

  // like the State name editor's "update label": a stored label text is dropped so the generator fits the new name
  resetLabel(state) {
    if (state.label?.text === undefined) return;
    const { text, ...rest } = state.label;
    this.record("states", state, "label text", text, undefined);
    if (Object.keys(rest).length) state.label = rest;
    else delete state.label;
  }

  /** Full name from name and form name, as the generator builds it */
  fullName(state, oldForm) {
    if (!state.formName) return state.name;
    if (!state.name) return `The ${state.formName}`;
    if (!ADJECTIVE_FORMS.has(state.formName) || /-| /.test(state.name)) return `${state.formName} of ${state.name}`;
    // keep the adjective an adjective-form full name already had ("Aurelian Empire" → "Aurelian Union")
    const prefix = oldForm && state.fullName?.endsWith(` ${oldForm}`) && !state.fullName.includes(" of ") ? state.fullName.slice(0, -oldForm.length - 1) : null;
    if (prefix) return `${prefix} ${state.formName}`;
    this.warnings.push(`Check the full name of ${state.name}: the generator writes "${state.formName}" forms with an adjective (set fullName=…)`);
    return `${state.formName} of ${state.name}`;
  }

  relation(stateRef, otherRef, relationName) {
    const relation = RELATIONS.find(r => r.toLowerCase() === String(relationName).trim().toLowerCase());
    if (!relation) throw new Error(`"${relationName}" is not a relation. Use one of ${RELATIONS.join(", ")}`);
    const a = this.target("states", stateRef);
    const b = this.target("states", otherRef);
    if (a === b) throw new Error("Relations are between two different states");
    const old = a.diplomacy?.[b.i];
    const setSide = (s, other, value) => {
      const before = s.diplomacy?.[other.i];
      if (!Array.isArray(s.diplomacy)) s.diplomacy = [];
      s.diplomacy[other.i] = value;
      for (let i = 0; i < s.diplomacy.length; i++) if (s.diplomacy[i] == null) s.diplomacy[i] = i === s.i || i === 0 ? "x" : "Unknown";
      this.record("states", s, `diplomacy → ${other.name}`, before, value);
    };
    setSide(a, b, relation);
    setSide(b, a, inverse(relation));
    if (old === relation) return;
    const chronicle = this.data.states[0]?.diplomacy;
    if (Array.isArray(chronicle)) {
      const [title, text] = RELATION_EVENTS[relation] ?? ["Relations change", (x, y) => `${x}-${y} relations changed to ${relation.toLowerCase()}`];
      const entry = old === "Enemy" ? ["War termination", `${a.name} and ${b.name} agreed to cease fire and signed a peace treaty`, text(a.name, b.name)] : [title, text(a.name, b.name)];
      chronicle.push(entry);
      this.file.touch("states");
    }
  }

  claim(provinceRef, stateRef, claimName) {
    const kind = String(claimName).trim().toLowerCase();
    if (!CLAIM_KINDS.includes(kind)) throw new Error(`"${claimName}" is not a claim. Use core, claim or none`);
    const p = this.target("provinces", provinceRef);
    const s = this.target("states", stateRef);
    const before = { cores: p.cores, claims: p.claims };
    const cores = (p.cores ?? []).filter(id => id !== s.i);
    const claims = (p.claims ?? []).filter(id => id !== s.i);
    if (kind === "core") cores.push(s.i);
    if (kind === "claim") claims.push(s.i);
    if (cores.length) p.cores = cores;
    else delete p.cores;
    if (claims.length) p.claims = claims;
    else delete p.claims;
    this.record("provinces", p, "cores", before.cores, p.cores);
    this.record("provinces", p, "claims", before.claims, p.claims);
    this.claimsWarning();
  }

  occupy(provinceRef, stateRef) {
    const p = this.target("provinces", provinceRef);
    const none = stateRef === null || stateRef === undefined || ["none", "0", "owner", ""].includes(String(stateRef).toLowerCase());
    const s = none ? null : this.target("states", stateRef);
    const before = p.controller;
    if (!s || s.i === p.state) delete p.controller;
    else p.controller = s.i;
    this.record("provinces", p, "controller", before, p.controller);
    this.claimsWarning();
  }

  ownerCores() {
    for (const p of this.data.provinces) {
      if (!alive(p) || !p.i || !p.state || p.cores?.includes(p.state)) continue;
      if (!alive(this.data.states[p.state])) continue;
      const before = p.cores;
      p.cores = [...(p.cores ?? []), p.state];
      this.record("provinces", p, "cores", before, p.cores);
    }
    this.claimsWarning();
  }

  // ---- regions: groups of provinces inside a state's record ----

  regionAdd(stateRef, name, formName = "Region", color) {
    const state = this.target("states", stateRef);
    const regionName = requireName(name);
    state.regions ??= [];
    const i = Math.max(0, ...state.regions.map(r => r.i)) + 1;
    const region = { i, name: regionName, formName, fullName: regionFullName(regionName, formName), color: color ? requireColor(color) : state.color ?? "#888888" };
    state.regions.push(region);
    this.file.touch("states");
    this.changes.push({ type: "regions", id: i, name: region.fullName, field: "created in", from: undefined, to: state.name });
    this.regionsWarning();
  }

  regionRemove(regionRef) {
    const region = this.target("regions", regionRef);
    const state = regionOwner(region);
    state.regions = state.regions.filter(r => r.i !== region.i);
    if (!state.regions.length) delete state.regions;
    for (const p of this.data.provinces) if (alive(p) && p.state === state.i && p.region === region.i) delete p.region;
    this.file.touch("states");
    this.file.touch("provinces");
    this.changes.push({ type: "regions", id: region.i, name: region.fullName, field: "removed", from: state.name, to: undefined });
  }

  assignRegion(provinceRef, regionRef) {
    const p = this.target("provinces", provinceRef);
    const none = regionRef === null || regionRef === undefined || ["none", "0", ""].includes(String(regionRef).toLowerCase());
    let id;
    if (!none) {
      const region = this.target("regions", String(regionRef).includes("/") ? regionRef : `${this.data.states[p.state]?.name}/${regionRef}`);
      if (regionOwner(region).i !== p.state) throw new Error(`${p.name} belongs to ${this.data.states[p.state]?.name}; the region belongs to ${regionOwner(region).name}`);
      id = region.i;
    }
    const before = p.region;
    if (id === undefined) delete p.region;
    else p.region = id;
    this.record("provinces", p, "region", before, p.region);
    this.regionsWarning();
  }

  // ---- factions: pack-level list in its own record ----

  factions() {
    return this.data.factions;
  }

  factionOf(stateId) {
    return this.factions().find(f => alive(f) && f.members.includes(stateId));
  }

  faction(action, a) {
    if (!FACTION_ACTIONS.includes(action)) throw new Error(`Unknown faction action "${action}". Use ${FACTION_ACTIONS.join(", ")}`);
    const touch = () => this.file.touch("factions");
    const log = (f, field, from, to) => {
      touch();
      this.changes.push({ type: "factions", id: f.i, name: f.name, field, from, to });
    };
    const stateName = id => this.data.states[id]?.name ?? `#${id}`;
    const size = id => this.data.states[id]?.area ?? 0;
    const strongest = ids => ids.reduce((best, id) => (size(id) > size(best) ? id : best), ids[0]);
    this.factionsWarning();

    if (action === "create") {
      const leader = this.target("states", a.leader);
      const taken = this.factionOf(leader.i);
      if (taken) throw new Error(`${leader.name} is already in ${taken.name}`);
      const list = this.factions();
      const i = Math.max(0, ...list.map(f => f.i)) + 1;
      const year = this.settings().lore?.calendar?.year;
      const type = requireName(a.type ?? "Alliance");
      const faction = { i, name: requireName(a.name ?? `${leader.name} ${type}`), color: a.color ? requireColor(a.color) : leader.color ?? "#888888", type, leader: leader.i, members: [leader.i], ...(year === undefined ? {} : { founded: year }) };
      list.push(faction);
      return log(faction, "created, led by", undefined, leader.name);
    }
    if (action === "leave") {
      const state = this.target("states", a.state);
      const faction = this.factionOf(state.i);
      if (!faction) throw new Error(`${state.name} is in no faction`);
      faction.members = faction.members.filter(m => m !== state.i);
      for (const m of faction.members) if (state.diplomacy?.[m] === "Ally") this.relation(state.i, m, "Friendly");
      log(faction, "member left", state.name, undefined);
      if (!faction.members.length) {
        faction.removed = true;
        log(faction, "removed (no members left)", undefined, undefined);
      } else if (faction.leader === state.i) {
        faction.leader = strongest(faction.members);
        log(faction, "leader", state.name, stateName(faction.leader));
      }
      return;
    }
    const faction = this.target("factions", a.faction);
    if (action === "dissolve") {
      faction.removed = true;
      return log(faction, "removed", undefined, undefined);
    }
    if (action === "join") {
      const state = this.target("states", a.state);
      const other = this.factionOf(state.i);
      if (other) throw new Error(`${state.name} is already in ${other.name}; it must leave first`);
      for (const m of faction.members)
        if (state.diplomacy?.[m] === "Enemy") throw new Error(`${state.name} is at war with ${stateName(m)}, a member of ${faction.name}`);
      for (const m of faction.members) this.relation(state.i, m, "Ally");
      faction.members.push(state.i);
      return log(faction, "member joined", undefined, state.name);
    }
    if (action === "leader") {
      const state = this.target("states", a.state);
      if (!faction.members.includes(state.i)) throw new Error("The leader must be a member of the faction");
      const before = stateName(faction.leader);
      faction.leader = state.i;
      return log(faction, "leader", before, state.name);
    }
    // arms: the members join every war of the leader
    const leader = this.data.states[faction.leader];
    let declared = 0;
    for (const enemy of entities(this.data, "states")) {
      if (leader.diplomacy?.[enemy.i] !== "Enemy" || faction.members.includes(enemy.i)) continue;
      for (const m of faction.members) {
        if (m === faction.leader || this.data.states[m].diplomacy?.[enemy.i] === "Enemy") continue;
        this.relation(m, enemy.i, "Enemy");
        declared++;
      }
    }
    if (!declared) this.warnings.push("The leader has no war the members are not already in");
  }

  settings() {
    return this.file.lines[1]?.startsWith("{") ? JSON.parse(this.file.lines[1]) : {};
  }

  regionsWarning() {
    const message = "Regions show in the generator fork with regions; the standard generator keeps them in the file but does not display them";
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  factionsWarning() {
    const message = "Factions show in the generator fork with factions; the standard generator keeps them in the file but does not display them";
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  target(kind, ref) {
    const e = typeof ref === "number" ? byId(this.data, kind, ref) : resolve(this.data, kind, ref);
    if (!e) throw new Error(`No ${kind.replace(/s$/, "")} ${ref}`);
    if (kind === "biomes") return this.data.biomes[e.i];
    return e;
  }

  units() {
    const settings = this.file.lines[1]?.startsWith("{") ? JSON.parse(this.file.lines[1]) : {};
    const p = settings.units?.population;
    return { populationRate: p?.scale ?? 1000, urbanization: p?.urbanization?.rate ?? 1 };
  }

  forkWarning(government) {
    if (FORK_ONLY.has(government))
      this.warnings.push(`The ${government} government needs the generator fork with the Socialist form; the standard generator keeps the value but treats it like a Monarchy`);
  }

  claimsWarning() {
    const message = "Cores, claims and occupation show in the generator fork with province claims; the standard generator keeps them in the file but does not display them";
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }
}

export { stripHtml };
