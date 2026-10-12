# Fantasy Map Generator — Fork mit sozialistischen Staatsformen, Gebietsansprüchen und KI-Tool

> **Original:** Dies ist ein Fork von **[Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator)**
> von **Max Haniyeu (Azgaar)** und allen [Mitwirkenden des Originalprojekts](https://github.com/Azgaar/Fantasy-Map-Generator/graphs/contributors).
> Der Generator selbst — Kartenerzeugung, Editoren, Darstellung und fast der gesamte Code hier — stammt von ihnen.
> Die Online-Version des Originals: [azgaar.github.io/Fantasy-Map-Generator](https://azgaar.github.io/Fantasy-Map-Generator).
> Wer das Projekt unterstützen möchte, kann das über Azgaars [Patreon](https://www.patreon.com/azgaar) tun.
>
> Dieser Fork ist kein offizieller Teil des Originalprojekts und wird nicht von Azgaar betreut.
> Er basiert auf dem Original-Stand vom 11.10.2026 (Commit `b069bcb`, Version 1.154.0).
> Die ursprüngliche README steht in [README.original.md](README.original.md).

## Was dieser Fork hinzufügt

### 1. Staatsform „Socialist“

Eine neue Regierungsart neben Monarchie, Republik, Union, Theokratie und Anarchie:

- **Formnamen:** People's Republic, People's Democratic Republic, Socialist Republic, Soviet Republic,
  Soviet Union, Socialist Federation, Workers' Republic, Commissariat
- **Eigene Regeln:** Steuern (hohe Verkaufs-, niedrige Kopfsteuer), Provinzformen (Oblast, Krai, Okrug,
  Autonomous Republic …) und Rekrutierung (Minderheiten werden wie in einer Union eingezogen, Religion zählt weniger)
- Zusätzlich bei den Republiken: **Federal Republic** (Bundesrepublik) und **Democratic Republic**

Der Generator würfelt diese Form nie selbst aus — bestehende Seeds erzeugen also exakt dieselben Karten wie im Original.
Du stellst sie im Staaten-Editor ein: *Tools → States → auf den Staatsnamen klicken → Form name*.

### 2. Kern- und Gebietsansprüche wie in Hearts of Iron

Jede Provinz kann jetzt speichern,
- welche Staaten einen **Kernanspruch** (Core) haben — Land, das sie als ihr eigenes ansehen,
- welche Staaten einen einfachen **Anspruch** (Claim) erheben,
- und ob sie von einem anderen Staat **besetzt** ist (Controller).

Im Provinz-Editor (*Tools → Provinces*):
- Spalte **Controller:** einen anderen Staat wählen, um die Provinz als besetzt zu markieren.
  Besetzte Provinzen werden auf der Ebene „Provinces“ in der Farbe des Besatzers schraffiert.
- Spalte **Claims:** Klick auf das Fahnen-Symbol öffnet einen Dialog, in dem du für jeden Staat Core, Claim oder nichts setzt.
- **Schild-Knopf** unten: gibt jedem Staat einen Kernanspruch auf alle Provinzen, die er besitzt.
- Der CSV-Export der Provinzen enthält Controller, Cores und Claims.

Ansprüche bleiben sauber: Wird ein Staat gelöscht, verschwinden seine Ansprüche; wird er in einen anderen
eingegliedert, gehen sie auf diesen über; übernimmt der Besatzer die Provinz, endet die Besatzung.

### 3. `fmg` — Kommandozeilen-Tool, auch für KI-Agenten

In [`tools/fmg-cli`](tools/fmg-cli): Karten abfragen, gezielt bearbeiten, zwei Kartenstände vergleichen und in
GeoJSON/CSV umwandeln — direkt aus `.map`-Dateien und JSON-Exporten, ohne Browser. Mit
[`AGENTS.md`](tools/fmg-cli/AGENTS.md) als Anleitung für KI-Agenten (Claude Code, Codex …).

```sh
fmg list Aurelia.map states --sort population --desc --limit 10
fmg set Aurelia.map state Mingia formName="People's Republic" -o Aurelia-2.map
fmg occupy Aurelia.map Ostmark Boignia -o Aurelia-2.map
fmg diff Aurelia_alt.json Aurelia_neu.json
fmg convert Aurelia.map --csv
```

Details in der [README des Tools](tools/fmg-cli/README.md).

## Benutzung

Du brauchst [Git](https://git-scm.com) und [Node.js](https://nodejs.org) 18 oder neuer.

```sh
git clone <URL dieses Repos>
cd Fantasy-Map-Generator
npm install
npm run dev          # dann http://localhost:5173/Fantasy-Map-Generator/ öffnen
npm run electron     # oder als Desktop-App
```

Karten lädst du wie gewohnt über das Menü (► oben links) als `.map`-Datei.

Kommandozeilen-Tool:

```sh
cd tools/fmg-cli
npm install
npm install -g .     # danach überall als fmg verfügbar
fmg --help
```

## Kompatibilität mit dem Original

- Karten aus dem Original lassen sich hier ohne Änderung öffnen.
- Karten aus diesem Fork lassen sich im Original öffnen. Das Original behält die neuen Werte in der Datei,
  zeigt Ansprüche und Besatzungen aber nicht an und behandelt die Staatsform „Socialist“ wie eine Monarchie.
- Das Dateiformat ist unverändert; neu sind nur die optionalen Provinzfelder `cores`, `claims` und `controller`
  (beschrieben in [docs/architecture/data-model.md](docs/architecture/data-model.md)).

## Lizenz und Urheber

- **Fantasy Map Generator:** © 2017–2024 Max Haniyeu (Azgaar), [MIT-Lizenz](LICENSE). Der Lizenz- und Urheberhinweis
  des Originals bleibt in [LICENSE](LICENSE) unverändert erhalten.
- **Änderungen in diesem Fork** (Staatsform „Socialist“, Ansprüche/Besatzung, `tools/fmg-cli`): © 2026 Niklas,
  ebenfalls unter der MIT-Lizenz. Das Tool enthält einen Nachbau des Voronoi-Aufbaus aus dem Original (siehe
  [tools/fmg-cli/LICENSE](tools/fmg-cli/LICENSE)).
- Die Änderungen wurden mit Unterstützung von Claude (Anthropic) geschrieben.

Fehler im Generator selbst, die nicht mit den Änderungen dieses Forks zu tun haben, meldest du am besten
[beim Original](https://github.com/Azgaar/Fantasy-Map-Generator/issues).
