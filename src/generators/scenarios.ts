// Real-world border scenarios for the Earth heightmap: states, colonies and capitals taken from border data
// Data in public/scenarios: a region index per 10' pixel of the globe (run-length rows), regions grouped into states
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import { Emblems } from "@/generators/emblems-generator";
import type { Province } from "@/generators/provinces-generator";
import type { State } from "@/generators/states-generator";
import { getMixedColor } from "@/utils/colorUtils";

interface ScenarioState {
  name: string;
  form?: string; // government, when the data knows it
  capital?: { name: string; lon: number; lat: number };
}
interface ScenarioRegion {
  name: string;
  state: number; // 1-based index into states
  colony: boolean;
}
export interface ScenarioData {
  id: string;
  label: string;
  source: string;
  width: number;
  height: number;
  states: ScenarioState[];
  regions: ScenarioRegion[];
  rows: number[][];
}

// government by words in the name; the rest keep the generated form
const GOVERNMENTS: [RegExp, string][] = [
  [
    /soviet|sowjet|people's republic|volksrepublik|ussr|socialist|sozialistisch|demokratische volksrepublik/i,
    "Socialist"
  ],
  [/caliphate|kalifat|papal|vatikan|vatican|holy see|bishopric|patriarchate|theocracy/i, "Theocracy"],
  [/union|federation|föderation|vereinigte|united|commonwealth|confedera|bund\b|league/i, "Union"],
  [/republic|republik|free state|freistaat/i, "Republic"],
  [
    /kingdom|königreich|empire|kaiserreich|reich|sultanate|sultanat|emirate|emirat|khanate|khanat|principality|fürstentum|duchy|herzogtum|tsardom|zarentum|shogunate|dynasty|monarchy/i,
    "Monarchy"
  ]
];

class ScenariosModule {
  private active: ScenarioData | null = null;
  private grid: Uint16Array | null = null;
  private regionOfCell: Uint16Array | null = null;
  private stateOf = new Map<number, number>(); // scenario state → pack state
  private sourceOf = new Map<number, ScenarioState>(); // pack state → scenario state

  /** Load the border scenario of the selected template; false when the template has none */
  async prepare(template: string = options.generation.template): Promise<boolean> {
    this.active = this.grid = this.regionOfCell = null;
    this.stateOf.clear();
    this.sourceOf.clear();
    const id = precreatedHeightmaps[template]?.scenario;
    if (!id) return false;
    const response = await fetch(`./scenarios/${id}.json`);
    if (!response.ok) throw new Error(`Cannot load the border scenario ${id}`);
    this.active = (await response.json()) as ScenarioData;
    return true;
  }

  get label(): string | undefined {
    return this.active?.label;
  }

  private regionAt(lon: number, lat: number): number {
    const data = this.active!;
    if (!this.grid) {
      this.grid = new Uint16Array(data.width * data.height);
      data.rows.forEach((runs, y) => {
        let x = y * data.width;
        for (let k = 0; k < runs.length; k += 2) {
          this.grid!.fill(runs[k], x, x + runs[k + 1]);
          x += runs[k + 1];
        }
      });
    }
    const x = Math.min(Math.floor(((lon + 180) / 360) * data.width), data.width - 1);
    const y = Math.min(Math.floor(((90 - lat) / 180) * data.height), data.height - 1);
    return x < 0 || y < 0 ? 0 : this.grid[y * data.width + x];
  }

  private toLonLat([x, y]: [number, number]): [number, number] {
    const { lonW, lonT, latN, latT } = options.map.geography.coordinates;
    const { width, height } = options.map.graph;
    return [lonW + (x / width) * lonT, latN - (y / height) * latT];
  }

  private toPoint(lon: number, lat: number): [number, number] {
    const { lonW, lonT, latN, latT } = options.map.geography.coordinates;
    const { width, height } = options.map.graph;
    return [((lon - lonW) / lonT) * width, ((latN - lat) / latT) * height];
  }

  /** States from the scenario instead of generated ones: each country's cells, its capital at the real place where known */
  createStates(): void {
    const data = this.active!;
    const { cells, burgs } = pack;
    const region = new Uint16Array(cells.i.length);
    const cellsOf = new Map<number, number[]>();
    for (const cell of cells.i) {
      if (cells.h[cell] < 20) continue;
      const r = this.regionAt(...this.toLonLat(cells.p[cell] as [number, number]));
      if (!r) continue;
      region[cell] = r;
      const owner = data.regions[r - 1].state;
      cellsOf.set(owner, [...(cellsOf.get(owner) ?? []), cell]);
    }
    this.regionOfCell = region;

    for (const burg of burgs) if (burg?.i) burg.capital = 0; // generated capitals become towns
    const states: State[] = [{ i: 0, name: "Neutrals", salesTax: 0, pollTax: 0, treasury: 0 } as State];
    const owners = [...cellsOf.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [owner, ownCells] of owners) {
      const info = data.states[owner - 1];
      const capitalCell = this.pickCapitalCell(info, ownCells);
      let burgId = cells.burg[capitalCell];
      if (!burgId) {
        burgId = burgs.length;
        const [x, y] = cells.p[capitalCell];
        const culture = cells.culture[capitalCell];
        burgs.push({
          cell: capitalCell,
          x,
          y,
          i: burgId,
          state: 0,
          culture,
          name: "",
          feature: cells.f[capitalCell],
          capital: 0
        });
        cells.burg[capitalCell] = burgId;
      }
      const burg = burgs[burgId];
      if (info.capital) burg.name = info.capital.name;
      else if (!burg.name) burg.name = Names.getCultureShort(burg.culture!);
      burg.capital = 1;

      const i = states.length;
      const culture = burg.culture ?? cells.culture[capitalCell];
      const type = pack.cultures[culture]?.type ?? "Generic";
      const coa = Emblems.generate(null, null, null, type);
      coa.shield = Emblems.getShield(culture);
      states.push({
        i,
        name: info.name,
        expansionism: 1,
        capital: burgId,
        type,
        center: capitalCell,
        culture,
        coa,
        salesTax: 0,
        pollTax: 0,
        treasury: 0
      });
      this.stateOf.set(owner, i);
      this.sourceOf.set(i, info);
    }

    pack.states = states;
    cells.state = new Uint16Array(cells.i.length);
    for (const cell of cells.i) {
      const r = region[cell];
      if (r) cells.state[cell] = this.stateOf.get(data.regions[r - 1].state) ?? 0;
    }
    for (const burg of burgs) if (burg?.i) burg.state = cells.state[burg.cell];

    States.getPoles();
    States.findNeighbors();
    States.assignColors();
    for (const state of states)
      state.diplomacy = state.i ? states.map(other => (!other.i || other.i === state.i ? "x" : "Neutral")) : [];
    const year = Number(data.id);
    if (Number.isFinite(year)) Object.assign(options.map.lore.calendar, { year, era: "Anno Domini", eraShort: "AD" });
    States.generateCampaigns();
  }

  /** The real capital's cell when it lies in the country, otherwise the country's best-populated cell */
  private pickCapitalCell(info: ScenarioState, ownCells: number[]): number {
    const { cells, burgs } = pack;
    if (info.capital) {
      const [x, y] = this.toPoint(info.capital.lon, info.capital.lat);
      const own = new Set(ownCells);
      const nearest = ownCells.reduce(
        (best, cell) => {
          const d = (cells.p[cell][0] - x) ** 2 + (cells.p[cell][1] - y) ** 2;
          return d < best.d ? { cell, d } : best;
        },
        { cell: -1, d: Infinity }
      );
      const spacing = grid.spacing * 3;
      if (own.has(nearest.cell) && nearest.d < spacing ** 2) return nearest.cell;
    }
    const withBurg = ownCells.filter(cell => cells.burg[cell] && !burgs[cells.burg[cell]].capital);
    const pool = withBurg.length ? withBurg : ownCells;
    return pool.reduce((best, cell) => (cells.s[cell] > cells.s[best] ? cell : best), pool[0]);
  }

  /** Real names after the generated forms: the full name is the name; the government follows it where it says */
  applyForms(): void {
    if (!this.active) return;
    for (const state of pack.states) {
      if (!state.i || state.removed) continue;
      state.fullName = state.name;
      state.formName = ""; // the real name says it all
      const government =
        this.sourceOf.get(state.i)?.form ?? GOVERNMENTS.find(([pattern]) => pattern.test(state.name))?.[1];
      if (government && government !== state.form) {
        state.form = government;
        Object.assign(state, States.defineTaxRates(state));
      }
    }
  }

  /** Colonies become provinces of their colonial power, named after the colony and without its core */
  applyColonies(): void {
    const data = this.active;
    const region = this.regionOfCell;
    if (!data || !region) return;
    const { cells, provinces, states, burgs } = pack;

    data.regions.forEach((info, index) => {
      if (!info.colony) return;
      const stateId = this.stateOf.get(info.state);
      if (!stateId) return;
      const own = cells.i.filter(cell => region[cell] === index + 1 && cells.state[cell] === stateId);
      if (!own.length) return;
      const withBurg = own.filter(cell => cells.burg[cell]);
      const pool = withBurg.length ? withBurg : own;
      const center = pool.reduce((best, cell) => (cells.s[cell] > cells.s[best] ? cell : best), pool[0]);
      const state = states[stateId];
      const i = provinces.length;
      const coa = Emblems.generate(state.coa, 0.4, null, state.type);
      coa.shield = Emblems.getShield(cells.culture[center], stateId);
      provinces.push({
        i,
        state: stateId,
        center,
        burg: cells.burg[center] && !burgs[cells.burg[center]].capital ? cells.burg[center] : 0,
        name: info.name,
        formName: Number(data.id) >= 1960 ? "Territory" : "Colony",
        fullName: info.name,
        color: getMixedColor(state.color!),
        coa
      } as Province);
      for (const cell of own) cells.province[cell] = i;
      state.provinces = [...(state.provinces ?? []), i];
    });

    // provinces the colonies took over completely are gone
    const used = new Set(cells.province);
    for (const province of provinces) {
      if (!province?.i || province.removed || used.has(province.i)) continue;
      provinces[province.i] = { i: province.i, removed: true } as Province;
      const state = states[province.state];
      if (state?.provinces) state.provinces = state.provinces.filter(id => id !== province.i);
    }
  }
}

export const Scenarios = new ScenariosModule();
