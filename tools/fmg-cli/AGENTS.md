# fmg — guide for AI agents

`fmg` reads, edits, compares and converts maps from Azgaar's Fantasy Map Generator (FMG).
Run `fmg --help` for the command list. Add `--json` to get machine-readable output;
errors then come back as `{"error": "..."}` with exit code 1 (bad data) or 2 (bad usage).

## Files

- `.map` — the generator's save file (plain or gzip). Read **and** edit.
- `*_Full_*.json` — "Export to JSON → Full". Read, diff and convert only; edits need the `.map`.
- Ids are stable inside one map. Names work too (exact name, full name, then a unique prefix);
  an ambiguous name fails with the candidates and their ids — retry with the id.

## Reading

```sh
fmg info world.map --json                                   # name, year, units, counts
fmg list world.map states --sort population --desc --limit 10 --json
fmg list world.map provinces --where state=Aurelia --fields id,name,controller,cores,claims --json
fmg list world.map burgs --where population>50000 --where state~juw --json
fmg get world.map state Aurelia --json                       # provinces, neighbors, diplomacy, occupations, claims, largest burgs, note
fmg get world.map province 12 --json
fmg search world.map "river" --json                          # names, full names and notes of every type
fmg list world.map factions --json                           # alliances: leader, members, founding year
fmg list world.map regions --json                            # duchies, federal lands: groups of provinces per state
fmg get world.map region Aurelia/Nordmark --json             # regions are written "State/Region" (their ids repeat per state)
```

Types: states, provinces, burgs, cultures, religions, rivers, routes, markers, zones, features, biomes, factions, regions
(singular and "city" work too). Filters: `key=value`, `key!=value`, `key~text` (contains), `key>n`, `key<n`, `key>=n`, `key<=n`.
Populations are people, areas are in the map's area unit (see `fmg info`).

## Editing

Every edit command needs a destination:
- `-o new.map` — write a new file (**prefer this**; never overwrite the user's map unless they asked)
- `--in-place` — replace the file, keeping `<map>.bak`
- `--dry-run` — show the changes, write nothing

Before writing, `fmg` reparses the result and refuses to write a map that would not load.

```sh
fmg set world.map state Aurelia formName="People's Republic" -o world-2.map
fmg set world.map state 7 name=Neuland fullName="Freistaat Neuland" note="Gegründet 1268" -o world-2.map
fmg set world.map province Ostmark formName=Oblast color=#aa3300 -o world-2.map
fmg set world.map state Aurelia history="1268 – Revolution\n1270 – Frieden von Grim" -o world-2.map   # plain-text history
fmg set world.map burg Grim name=Neu-Grim population=250000 -o world-2.map
fmg relation world.map Aurelia Mingia Enemy -o world-2.map   # sets both sides, logs the chronicle
fmg relation world.map Taisa Aurelia Vassal -o world-2.map   # Taisa becomes a vassal of Aurelia
fmg claim world.map Ostmark Aurelia core -o world-2.map      # core | claim | none
fmg occupy world.map Ostmark Mingia -o world-2.map           # occupier; "none" ends the occupation
fmg owner-cores world.map -o world-2.map                     # each owner gets a core on its provinces
fmg set world.map state Aurelia lore="Proud herders of the steppe" -o world-2.map   # lore: what the nation is like
fmg faction world.map create Aurelia "Northern Pact" --type Pact -o world-2.map     # leader, name, kind
fmg faction world.map join "Northern Pact" Mingia -o world-2.map                    # becomes an ally of every member
fmg faction world.map leave Mingia -o world-2.map                                   # lead passes on, an empty faction ends
fmg faction world.map leader "Northern Pact" Mingia -o world-2.map
fmg faction world.map arms "Northern Pact" -o world-2.map                           # members join every war of the leader
fmg faction world.map dissolve "Northern Pact" -o world-2.map
fmg region world.map add Aurelia Nordmark Duchy -o world-2.map                      # a group of provinces of a state
fmg region world.map assign Ostmark Aurelia/Nordmark -o world-2.map                 # "none" takes a province out
fmg set world.map region Aurelia/Nordmark lore="Cold and green" history="1200 – Founded" -o world-2.map
fmg region world.map remove Aurelia/Nordmark -o world-2.map
```

Factions follow the generator's rules: a state is in one faction, members are allies of each other, a state at
war with a member cannot join, and the leader is always a member.

Several edits at once — all succeed or nothing is written:

```sh
fmg apply world.map ops.json -o world-2.map     # or pipe the JSON with "-" as the file
```
```json
[
  { "op": "set", "type": "state", "ref": "Aurelia", "field": "formName", "value": "Federal Republic" },
  { "op": "relation", "state": "Aurelia", "other": "Mingia", "relation": "Ally" },
  { "op": "claim", "province": "Ostmark", "state": "Mingia", "claim": "claim" },
  { "op": "occupy", "province": "Ostmark", "state": "none" },
  { "op": "owner-cores" },
  { "op": "faction", "action": "create", "leader": "Aurelia", "name": "Northern Pact", "type": "Pact" },
  { "op": "faction", "action": "join", "faction": "Northern Pact", "state": "Mingia" },
  { "op": "region-add", "state": "Aurelia", "name": "Nordmark", "formName": "Duchy" },
  { "op": "assign-region", "province": "Ostmark", "region": "Aurelia/Nordmark" }
]
```

`fmg forms --json` lists governments with their form names, relations and the editable fields per type.
Setting a listed `formName` also sets the government (`form`) and rebuilds `fullName`; the stored map label
is reset so the generator fits the new name. Check the full name afterwards for forms the generator writes
with an adjective ("Aurelian Empire") — set `fullName=` yourself if it reads wrong.

### What `fmg` cannot edit

Borders, cells, capitals moving between states, new states or provinces, regeneration. These need the
generator's own tools (e.g. the state/province paint brush). Say so and describe the steps instead.

New maps get owner cores and war occupation automatically in the generator fork; `fmg` does not regenerate them.

### Fork-only data

`Socialist` government forms, province `cores` / `claims` / `controller`, regions, `lore` and factions come from a generator fork.
The standard generator loads such maps and keeps the values, but shows neither. `fmg` prints a note when an
edit relies on them — pass that on to the user.

## Comparing versions

```sh
fmg diff before.map after.map --json
```
States added/removed/changed, land and population per state, land changing hands (cell by cell),
province owners, occupations and claims, burgs changing state, diplomacy and new chronicle entries.
Works on `.map` and Full JSON exports. Maps of different seeds are matched by name only (a note says so).

## Converting

```sh
fmg convert world.map -o out --csv               # GeoJSON per layer (+ CSV), lon/lat from the map settings
fmg convert world.map -l states,provinces --single
```

## Remote server

If the maps live on a server (`FMG_URL` and `FMG_TOKEN` are set), use `fmg remote …` instead of file paths:
`remote maps`, `remote push <file> [name]`, `remote pull <name> [file]`, `remote info|list|get|search|diff <name> …`,
and `remote apply <name> <ops.json|-> [--dry-run]` (all or nothing, the server keeps `<name>.bak`).
The token is a secret: never print it, commit it or put it in a map. `fmg serve` starts the server, `fmg token` shows the token.

## Good practice

1. Read first (`info`, `get`, `list`) and quote ids in your plan.
2. Write to a new file with `-o`, or use `--dry-run` and show the user the change list before `--in-place`.
3. After editing, run `fmg diff old.map new.map` and report what changed.
4. Pass on every `Note:` / `warnings` entry; they describe limits the user should know about.
