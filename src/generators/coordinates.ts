// Where the map sits on the globe: its share of the world and the resulting lat/lon box
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import { getKmInDistanceUnit } from "@/utils/unitUtils";
import { gauss, P, rn } from "../utils";

declare global {
  var Coordinates: CoordinatesModule;
}

type SizeAndPosition = [size: number, latitude: number, longitude: number];

// [size in % of the world, North-South shift in %, West-East shift in %] per real-world template
const TEMPLATE_POSITIONS: Record<string, SizeAndPosition> = {
  "africa-centric": [45, 53, 38],
  arabia: [20, 35, 35],
  atlantics: [42, 23, 65],
  britain: [7, 20, 51.3],
  caribbean: [15, 40, 74.8],
  "east-asia": [11, 28, 9.4],
  eurasia: [38, 19, 27],
  europe: [20, 16, 44.8],
  "europe-accented": [14, 22, 44.8],
  "europe-and-central-asia": [25, 10, 39.5],
  "europe-central": [11, 22, 46.4],
  "europe-north": [7, 18, 48.9],
  greenland: [22, 7, 55.8],
  hellenica: [8, 27, 43.5],
  iceland: [2, 15, 55.3],
  "indian-ocean": [45, 55, 14],
  "mediterranean-sea": [10, 29, 45.8],
  "middle-east": [8, 31, 34.4],
  "north-america": [37, 17, 87],
  "us-centric": [66, 27, 100],
  "us-mainland": [16, 30, 77.5],
  world: [78, 27, 40],
  "world-from-pacific": [75, 32, 30] // longitude doesn't fit
};

// chance for a random template to cover the whole world, if the land does not go over the map borders
const WHOLE_WORLD_CHANCE: Record<string, number> = {
  pangea: 1,
  manyContinents: 0.8,
  fourContinents: 0.8,
  shattered: 0.7,
  continents: 0.5,
  archipelago: 0.35,
  highIsland: 0.25,
  lowIsland: 0.1
};

// size distribution [expected, deviation, min, max] for a random template
const RANDOM_SIZE: Record<string, [number, number, number, number]> = {
  pangea: [70, 20, 30, 100],
  volcano: [20, 20, 10, 100],
  mediterranean: [25, 30, 15, 80],
  peninsula: [15, 15, 5, 80],
  isthmus: [15, 20, 3, 80],
  atoll: [3, 2, 1, 5]
};

/** Size and position that show as much of the globe as the canvas allows without distortion */
export function getGlobeView(width: number, height: number): SizeAndPosition {
  return [Math.min(100, 200 / (width / height)), 50, 50];
}

/** The lat/lon box a size and position cover on a canvas */
export function getCoordinatesBox(size: number, latitude: number, longitude: number, width: number, height: number) {
  const latT = rn((size / 100) * 180, 1);
  const latN = rn(90 - (180 - latT) * (latitude / 100), 1);
  const latS = rn(latN - latT, 1);
  const lonT = rn(Math.min((width / height) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * (longitude / 100), 1);
  const lonW = rn(lonE - lonT, 1);
  return { latT, latN, latS, lonT, lonW, lonE };
}

class CoordinatesModule {
  generate(): void {
    const partial = grid.features.some(feature => feature.land && feature.border);
    const [mapSize, latitude, longitude] = this.getSizeAndPosition(options.generation.template, partial);
    const requested = options.generation.geography;
    const geography = options.map.geography;
    geography.mapSize = requested.mapSize ?? mapSize;
    geography.latitude = requested.latitude ?? latitude;
    geography.longitude = requested.longitude ?? longitude;
    this.calculate();
    if (precreatedHeightmaps[options.generation.template]?.globe) this.setEarthScale();
  }

  /** Distance scale of the real Earth: a meridian from pole to pole is 20 004 km */
  private setEarthScale(): void {
    const kmInUnit = getKmInDistanceUnit();
    if (!kmInUnit) return; // a custom unit has no real-world length
    const meridianPixels = (options.map.graph.height * 100) / options.map.geography.mapSize;
    options.map.units.distance.scale = rn(20004 / meridianPixels / kmInUnit, 2);
  }

  /** calculate the map lat/lon box from its size and position */
  calculate(): void {
    const { mapSize, latitude, longitude } = options.map.geography;
    const { width, height } = options.map.graph;
    options.map.geography.coordinates = getCoordinatesBox(mapSize, latitude, longitude, width, height);
  }

  private getSizeAndPosition(template: string, isPartial: boolean): SizeAndPosition {
    if (precreatedHeightmaps[template]?.globe) return getGlobeView(options.map.graph.width, options.map.graph.height);
    const realWorldPosition = TEMPLATE_POSITIONS[template];
    if (realWorldPosition) return realWorldPosition;

    if (!isPartial && P(WHOLE_WORLD_CHANCE[template] ?? 0)) return [100, 50, 50];

    const maxSize = isPartial ? 80 : 100;
    // Continents, Archipelago, High Island and Low Island fall back to the default distribution
    const [expected, deviation, min, max] = RANDOM_SIZE[template] ?? [30, 20, 15, maxSize];
    const round = template === "atoll" ? 1 : 0;

    const size = gauss(expected, deviation, min, Math.min(max, maxSize), round);
    const latitude = gauss(P(0.5) ? 40 : 60, 20, 25, 75); // latitude shift
    return [size, latitude, 50];
  }
}

// biome-ignore lint/suspicious/noRedeclare: legacy global and module export
export const Coordinates = new CoordinatesModule();
window.Coordinates = Coordinates;
