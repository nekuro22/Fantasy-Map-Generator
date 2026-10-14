// Factions as in Hearts of Iron: alliances and blocs of states under a leader. A state is in one faction at most,
// the members are allies of each other, and the leader's wars can be called on the others. See docs/domain/glossary.md
import { States } from "@/generators/states-generator";
import { requireName } from "@/utils/validationUtils";

export interface Faction {
  i: number;
  name: string;
  color: string;
  type: string;
  /** state id of the leader, always a member */
  leader: number;
  members: number[];
  /** the calendar year it was founded in, when the map has one */
  founded?: number;
  removed?: boolean;
}

/** Kinds of faction a person picks from; any other text works too */
export const FACTION_TYPES = [
  "Alliance",
  "League",
  "Pact",
  "Bloc",
  "Commonwealth",
  "Holy League",
  "Coalition",
  "Union"
];

const isLiving = (stateId: number) => !!stateId && !!pack.states[stateId] && !pack.states[stateId].removed;
const areaOf = (stateId: number) => pack.states[stateId]?.area ?? 0;

class FactionModule {
  /** The living factions */
  all(): Faction[] {
    return (pack.factions ?? []).filter(f => !f.removed);
  }

  get(id: number): Faction {
    const faction = this.all().find(f => f.i === id);
    if (!faction) throw new Error(`Faction ${id} does not exist`);
    return faction;
  }

  /** The faction a state belongs to */
  of(stateId: number): Faction | undefined {
    return this.all().find(f => f.members.includes(stateId));
  }

  /** The state with the most land of those given */
  private strongest(ids: number[]): number {
    return ids.reduce((best, id) => (areaOf(id) > areaOf(best) ? id : best), ids[0]);
  }

  /** Found a faction around a leader. Returns its id */
  create(name: string, leaderId: number, type = "Alliance", color?: string): number {
    if (!isLiving(leaderId)) throw new Error(`State ${leaderId} does not exist`);
    const taken = this.of(leaderId);
    if (taken) throw new Error(`${pack.states[leaderId].name} is already in ${taken.name}`);
    pack.factions ??= [];
    const i = Math.max(0, ...pack.factions.map(f => f.i)) + 1;
    const calendar = options?.map?.lore?.calendar;
    pack.factions.push({
      i,
      name: requireName(name),
      color: color ?? pack.states[leaderId].color ?? "#888888",
      type: requireName(type),
      leader: leaderId,
      members: [leaderId],
      ...(calendar ? { founded: calendar.year } : {})
    });
    return i;
  }

  rename(id: number, name: string, type?: string): void {
    const faction = this.get(id);
    faction.name = requireName(name);
    if (type !== undefined) faction.type = requireName(type);
  }

  recolor(id: number, color: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("The color must be a hex code such as #aa3322");
    this.get(id).color = color;
  }

  /** A state joins a faction and becomes an ally of every member; it cannot be at war with one of them */
  join(id: number, stateId: number): void {
    const faction = this.get(id);
    if (!isLiving(stateId)) throw new Error(`State ${stateId} does not exist`);
    const state = pack.states[stateId];
    const other = this.of(stateId);
    if (other) throw new Error(`${state.name} is already in ${other.name}; it must leave first`);
    for (const member of faction.members) {
      if (state.diplomacy?.[member] === "Enemy")
        throw new Error(`${state.name} is at war with ${pack.states[member].name}, a member of ${faction.name}`);
    }
    for (const member of faction.members) States.setRelation(stateId, member, "Ally");
    faction.members.push(stateId);
  }

  /** A state leaves its faction; the former allies are friends now. The leader leaving hands the lead to the strongest member; a faction left empty ends */
  leave(stateId: number): void {
    const faction = this.of(stateId);
    if (!faction) throw new Error(`${pack.states[stateId]?.name ?? stateId} is in no faction`);
    faction.members = faction.members.filter(m => m !== stateId);
    for (const member of faction.members)
      if (pack.states[stateId]?.diplomacy?.[member] === "Ally") States.setRelation(stateId, member, "Friendly");
    if (!faction.members.length) faction.removed = true;
    else if (faction.leader === stateId) faction.leader = this.strongest(faction.members);
  }

  /** End a faction: the members stay allies */
  dissolve(id: number): void {
    this.get(id).removed = true;
  }

  setLeader(id: number, stateId: number): void {
    const faction = this.get(id);
    if (!faction.members.includes(stateId)) throw new Error("The leader must be a member of the faction");
    faction.leader = stateId;
  }

  /** The members join every war of the leader, as in Hearts of Iron. Returns how many declarations that took */
  callToArms(id: number): number {
    const faction = this.get(id);
    const leader = pack.states[faction.leader];
    let declared = 0;
    for (const enemy of pack.states) {
      if (!enemy?.i || enemy.removed || leader.diplomacy?.[enemy.i] !== "Enemy" || faction.members.includes(enemy.i))
        continue;
      for (const member of faction.members) {
        if (member === faction.leader || pack.states[member].diplomacy?.[enemy.i] === "Enemy") continue;
        States.setRelation(member, enemy.i, "Enemy");
        declared++;
      }
    }
    return declared;
  }

  /** Factions from the alliances the map already has: states linked by alliances form one, led by the biggest. Socialist
   * states left over form a bloc of their own. Replaces all factions. Returns their number */
  generate(): number {
    pack.factions = [];
    const living = pack.states.filter(s => s.i && !s.removed);
    const parent = new Map(living.map(s => [s.i, s.i]));
    const root = (i: number): number => {
      const up = parent.get(i)!;
      if (up === i) return i;
      const top = root(up);
      parent.set(i, top);
      return top;
    };
    for (const a of living)
      for (const b of living)
        if (a.i < b.i && (a.diplomacy?.[b.i] === "Ally" || b.diplomacy?.[a.i] === "Ally"))
          parent.set(root(a.i), root(b.i));
    const groups = new Map<number, number[]>();
    for (const s of living) groups.set(root(s.i), [...(groups.get(root(s.i)) ?? []), s.i]);
    const clusters = [...groups.values()].filter(g => g.length > 1);
    const free = living.filter(s => s.form === "Socialist" && !clusters.some(g => g.includes(s.i))).map(s => s.i);
    if (free.length > 1) clusters.push(free);

    for (const members of clusters) {
      const leader = this.strongest(members);
      const forms = members.map(m => pack.states[m].form);
      const type = forms.every(f => f === "Socialist")
        ? "Bloc"
        : forms.filter(f => f === "Theocracy").length > members.length / 2
          ? "Holy League"
          : forms.filter(f => f === "Monarchy").length > members.length / 2
            ? "League"
            : "Alliance";
      const id = this.create(`${pack.states[leader].name} ${type}`, leader, type);
      const faction = this.get(id);
      faction.members = members.sort((a, b) => (a === leader ? -1 : b === leader ? 1 : a - b));
    }
    return pack.factions.length;
  }

  /** Drop members that no longer exist, and factions left without any; call after states are removed or merged */
  tidy(): void {
    for (const faction of this.all()) {
      faction.members = faction.members.filter(isLiving);
      if (!faction.members.length) faction.removed = true;
      else if (!faction.members.includes(faction.leader)) faction.leader = this.strongest(faction.members);
    }
  }
}

declare global {
  var Factions: FactionModule;
}

// biome-ignore lint/suspicious/noRedeclare: legacy seam
export const Factions = new FactionModule();
window.Factions = Factions;
