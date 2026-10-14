# fmg-cli

Kommandozeilen-Tool für Karten aus [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator):
abfragen, gezielt bearbeiten, zwei Kartenstände vergleichen und in GIS-Formate umwandeln. Es ist so gebaut,
dass KI-Agenten (Claude Code, Codex, Cursor …) damit selbstständig an deinen Karten arbeiten können:
jede Ausgabe gibt es als JSON, Fehler sind eindeutig, und es wird nie stillschweigend über deine Datei geschrieben.

- **Lesen:** `.map` (auch gzip) ab FMG 1.100 und JSON-Exporte „Full“ / „Pack cells“
- **Bearbeiten:** nur `.map`
- Node.js 18 oder neuer, eine einzige Abhängigkeit (`delaunator`)

## Installation

```sh
cd tools/fmg-cli
npm install
npm install -g .        # macht die Befehle fmg und fmg-convert überall verfügbar
fmg --help
```

## Einem KI-Agenten das Tool beibringen

`fmg guide` gibt eine Anleitung für Agenten aus (dieselbe wie in `AGENTS.md`). Am einfachsten:

- **Claude Code / Codex:** `AGENTS.md` in den Ordner mit deinen Karten kopieren (für Claude Code als `CLAUDE.md`
  oder mit einem Verweis darin) — der Agent liest sie automatisch.
- **Andere Agenten:** zu Beginn sagen: „Führe `fmg guide` aus und arbeite danach mit `fmg`.“

Dann reichen Aufträge wie:
- „Welche Staaten haben seit der letzten Kartenversion Land verloren?“ → `fmg diff alt.json neu.json`
- „Mach aus Mingia eine Volksrepublik und lass sie die Provinz Ostmark besetzen.“
- „Liste alle Städte von Juwalda über 20.000 Einwohnern für das Handbuch.“

## Befehle

### Lesen

```sh
fmg info Aurelia.map                                   # Überblick: Jahr, Einheiten, Anzahl Staaten, Provinzen …
fmg list Aurelia.map states --sort population --desc --limit 10
fmg list Aurelia.map provinces --where state=Juwalda --fields id,name,controller,cores,claims
fmg list Aurelia.map burgs --where "population>20000" --where state~juw
fmg get  Aurelia.map state Friededenia                  # Provinzen, Nachbarn, Diplomatie, Besatzungen, Ansprüche, größte Städte
fmg search Aurelia.map tunnel                           # Namen und Notizen aller Typen
fmg list Aurelia.map factions                           # Bündnisse: Anführer, Mitglieder, Gründungsjahr
fmg list Aurelia.map regions                            # Herzogtümer, Bundesländer: Provinzgruppen je Staat
fmg get Aurelia.map region Friededenia/Nordmark         # Regionen heißen „Staat/Region“ (ihre IDs wiederholen sich je Staat)
```

Typen: `states`, `provinces`, `burgs`, `cultures`, `religions`, `rivers`, `routes`, `markers`, `zones`,
`features`, `biomes`, `factions`, `regions` (Einzahl geht auch). Filter: `=`, `!=`, `~` (enthält), `>`, `<`, `>=`, `<=`.
Einwohner sind echte Einwohnerzahlen, Flächen in der Einheit der Karte. `--json` liefert alles maschinenlesbar.

### Bearbeiten

Jede Änderung braucht ein Ziel: `-o neu.map` (neue Datei), `--in-place` (überschreibt, legt `.bak` an)
oder `--dry-run` (nur anzeigen). Vor dem Schreiben lädt das Tool das Ergebnis zur Probe und schreibt nichts,
wenn die Karte danach nicht mehr laden würde.

```sh
fmg set Aurelia.map state Mingia formName="People's Republic" -o Aurelia-2.map
fmg set Aurelia.map state 7 name=Neuland note="Gegründet nach der Separierung" -o Aurelia-2.map
fmg set Aurelia.map burg Grim name=Neu-Grim population=250000 -o Aurelia-2.map
fmg relation Aurelia.map Friededenia Boignia Enemy -o Aurelia-2.map    # beide Seiten + Chronik
fmg claim  Aurelia.map Ostmark Friededenia core -o Aurelia-2.map       # core | claim | none
fmg occupy Aurelia.map Ostmark Boignia -o Aurelia-2.map                # none beendet die Besatzung
fmg owner-cores Aurelia.map -o Aurelia-2.map                           # Kernanspruch für jeden Besitzer
fmg set Aurelia.map state Mingia lore="Stolze Steppenhirten" -o Aurelia-2.map   # Lore einer Nation (auch history)
fmg faction Aurelia.map create Friededenia "Nordpakt" --type Pact -o Aurelia-2.map
fmg faction Aurelia.map join Nordpakt Boignia -o Aurelia-2.map         # wird Verbündeter aller Mitglieder
fmg faction Aurelia.map leave Boignia -o Aurelia-2.map                 # leader <fraktion> <staat> | dissolve | arms
fmg region Aurelia.map add Friededenia Nordmark Duchy -o Aurelia-2.map
fmg region Aurelia.map assign Ostmark Friededenia/Nordmark -o Aurelia-2.map   # none nimmt die Provinz heraus
fmg set Aurelia.map region Friededenia/Nordmark lore="Kalt und grün" -o Aurelia-2.map
fmg apply Aurelia.map aenderungen.json -o Aurelia-2.map                # mehrere Änderungen, alles oder nichts
fmg forms                                                              # Staatsformen, Beziehungen, änderbare Felder
```

Änderbar sind Namen, Staatsform, vollständiger Name, Farben, Notizen, Stadt-Einwohner, Diplomatie sowie
Kern-/Anspruchs- und Besatzungsdaten. **Nicht** änderbar sind Grenzen und Zellen, neue Staaten oder Provinzen
und Neugenerierung — das geht weiter im Generator (z. B. mit dem Pinsel im Staaten-Editor).

Eine Staatsform aus der Liste (z. B. „People's Republic“) setzt auch die Regierungsart und baut den vollen
Namen neu; das gespeicherte Kartenlabel wird zurückgesetzt, damit der Generator den neuen Namen einpasst.
`Socialist`-Formen und Kern-/Anspruchs-/Besatzungsdaten zeigt nur dein Generator-Fork an. Der normale
Generator lädt solche Karten trotzdem und behält die Werte, zeigt sie aber nicht an.

### Vergleichen

```sh
fmg diff Aurelia_2026-08-27.json Aurelia_2026-08-28.json
```

Zeigt neue und verschwundene Staaten, Fraktionen (gegründet, beigetreten, verlassen, aufgelöst), geänderte Namen, Formen und Hauptstädte, Fläche und Einwohner je Staat,
welches Land von wem an wen ging (Zelle für Zelle), Provinzen mit neuem Besitzer, Besatzungen, Ansprüche,
Städte, die den Staat gewechselt haben, Diplomatie und neue Chronik-Einträge. Funktioniert mit `.map` und
JSON-Exporten. Karten mit anderem Seed werden nur über Namen verglichen (mit Hinweis).

### Umwandeln

```sh
fmg convert Aurelia.map --csv                 # GeoJSON je Ebene + CSV, Längen-/Breitengrade nach den Karteneinstellungen
fmg convert Aurelia.map -l states,provinces --single
fmg-convert Aurelia.map                       # Kurzform
```

Ebenen: states, provinces, cultures, religions, biomes, land, lakes, zones, burgs, markers, rivers, routes,
cells. Weiter nach GeoPackage, Shapefile oder KML mit GDAL, z. B.
`ogr2ogr -f GPKG aurelia.gpkg Aurelia_geojson/states.geojson`.

## Als Bibliothek

```js
import { readFileSync } from "node:fs";
import { parseWorld, buildLayers } from "fmg-cli";

const world = parseWorld(readFileSync("Aurelia.map"));
const { states } = buildLayers(world, { layers: ["states"] });
```

## Wie es funktioniert

Eine `.map`-Datei speichert nur das Ausgangsgitter. Das Tool baut das Voronoi-Diagramm genauso neu auf wie der
Generator beim Laden und prüft die Zellzahl gegen die gespeicherten Daten. Bearbeitungen ändern nur die
betroffenen Datensätze (Zeilen) der Datei; alles andere bleibt Byte für Byte gleich.

## Tests

```sh
npm test                                  # nutzt die Test-Karten aus tests/fixtures des Generators
FMG_FIXTURE=/pfad/zu/karte.map npm test
```

## Lizenz

MIT. `src/graph.js` portiert den Voronoi- und Pack-Aufbau aus Azgaar's Fantasy Map Generator (MIT, © Azgaar).
