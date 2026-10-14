// Saved versions of the world in the browser's storage: the whole map per version plus its summary in an index

import { sortVersions, summarize, type WorldVersion } from "@/generators/world-history";
import { Save } from "@/services/io/save";

const INDEX_KEY = "worldHistory:index";
const mapKey = (id: string) => `worldHistory:map:${id}`;

async function readIndex(): Promise<WorldVersion[]> {
  const stored = await ldb.get<string>(INDEX_KEY).catch(() => null);
  if (typeof stored !== "string") return [];
  try {
    const list = JSON.parse(stored);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const writeIndex = (list: WorldVersion[]) => ldb.set(INDEX_KEY, JSON.stringify(list));

/** The saved versions of this world, in the order of its history */
export async function listVersions(): Promise<WorldVersion[]> {
  const world = options.map.seed;
  return sortVersions((await readIndex()).filter(v => v.world === world));
}

/** Save the world as it is now, dated by the map's calendar */
export async function saveVersion(title: string, note: string): Promise<WorldVersion> {
  const { calendar } = options.map.lore;
  const version: WorldVersion = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    world: options.map.seed,
    title: title.trim() || `${calendar.eraShort ?? ""} ${calendar.year}`.trim(),
    note: note.trim(),
    year: calendar.year,
    era: calendar.eraShort || calendar.era || "",
    savedAt: Date.now(),
    summary: summarize()
  };
  await ldb.set(mapKey(version.id), new Blob([Save.prepareMapData()], { type: "text/plain" }));
  await writeIndex([...(await readIndex()), version]);
  return version;
}

export async function versionMap(id: string): Promise<Blob | null> {
  return (await ldb.get<Blob>(mapKey(id))) || null;
}

export async function removeVersion(id: string): Promise<void> {
  await writeIndex((await readIndex()).filter(v => v.id !== id));
  await ldb.set(mapKey(id), ""); // the store has no delete: an empty value frees the space
}
