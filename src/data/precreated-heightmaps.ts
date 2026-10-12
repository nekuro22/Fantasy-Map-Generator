// Pre-created heightmaps: each key matches a grayscale image in public/heightmaps/<key>.png

export type PrecreatedHeightmap = {
  id: number;
  name: string;
  /** the image is the whole globe in equirectangular projection: the map shows the part its coordinates cover */
  globe?: boolean;
  /** image in public/heightmaps to use instead of <key>.png */
  image?: string;
  /** real-world borders from public/scenarios/<scenario>.json replace the generated states */
  scenario?: string;
};

export const precreatedHeightmaps: Record<string, PrecreatedHeightmap> = {
  "africa-centric": { id: 0, name: "Africa Centric" },
  arabia: { id: 1, name: "Arabia" },
  atlantics: { id: 2, name: "Atlantics" },
  britain: { id: 3, name: "Britain" },
  caribbean: { id: 4, name: "Caribbean" },
  "east-asia": { id: 5, name: "East Asia" },
  eurasia: { id: 6, name: "Eurasia" },
  europe: { id: 7, name: "Europe" },
  "europe-accented": { id: 8, name: "Europe Accented" },
  "europe-and-central-asia": { id: 9, name: "Europe and Central Asia" },
  "europe-central": { id: 10, name: "Europe Central" },
  "europe-north": { id: 11, name: "Europe North" },
  greenland: { id: 12, name: "Greenland" },
  hellenica: { id: 13, name: "Hellenica" },
  iceland: { id: 14, name: "Iceland" },
  "indian-ocean": { id: 15, name: "Indian Ocean" },
  "mediterranean-sea": { id: 16, name: "Mediterranean Sea" },
  "middle-east": { id: 17, name: "Middle East" },
  "north-america": { id: 18, name: "North America" },
  "us-centric": { id: 19, name: "US-centric" },
  "us-mainland": { id: 20, name: "US Mainland" },
  world: { id: 21, name: "World" },
  "world-from-pacific": { id: 22, name: "World from Pacific" },
  earth: { id: 23, name: "Earth (accurate)", globe: true },
  "earth-2026": { id: 24, name: "Earth 2026 (borders)", globe: true, image: "earth", scenario: "2026" },
  "earth-1945": { id: 25, name: "Earth 1945 (borders)", globe: true, image: "earth", scenario: "1945" },
  "earth-1938": { id: 26, name: "Earth 1938 (borders)", globe: true, image: "earth", scenario: "1938" },
  "earth-1930": { id: 27, name: "Earth 1930 (borders)", globe: true, image: "earth", scenario: "1930" },
  "earth-1914": { id: 28, name: "Earth 1914 (borders)", globe: true, image: "earth", scenario: "1914" },
  "earth-1200": { id: 29, name: "Earth 1200 – Middle Ages (borders)", globe: true, image: "earth", scenario: "1200" },
  "earth-100": { id: 30, name: "Earth 100 AD – Antiquity (borders)", globe: true, image: "earth", scenario: "100" }
};

declare global {
  // biome-ignore lint/suspicious/noRedeclare: exposed on window for legacy JS
  var precreatedHeightmaps: Record<string, PrecreatedHeightmap>;
}

// temp legacy compatibility
window.precreatedHeightmaps = precreatedHeightmaps;
