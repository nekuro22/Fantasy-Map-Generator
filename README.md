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
- Eine Provinz hat höchstens **einen** Core-Staat; jeder weitere Anspruch ist ein Claim.
- Spalte **Region** und Knopf „Regionen“: Provinzen zu Regionen (Herzogtümer, Bundesländer) eines Staates gruppieren.
- **Claims & Fronts** (Shift+I oder Tools → Claims): pro Staat Cores, besetzte Gebiete und Ansprüche, dazu Frontlinien und Pulverfass-Karte.
- Im **Diplomacy Overview** hat jeder Untertan eine Art (Vassal, Dominion, Protectorate, Puppet, Satellite, Mandate …), die zur Staatsform des Oberherrn passt.
- Der CSV-Export der Provinzen enthält Controller, Cores und Claims.

**Alles wird automatisch vergeben:**
- Jede neue Karte gibt jedem Staat einen Kernanspruch auf seine Provinzen; ältere Karten bekommen ihn beim Laden.
- Aus den Kriegen der Diplomatie entstehen Besatzungen: Die stärkere Seite hält Grenzprovinzen des Gegners —
  je größer ihr Vorsprung, desto mehr; Hauptstädte bleiben beim Besitzer. Der Knopf mit dem Geschütz im
  Provinz-Editor berechnet die Fronten neu.
- Wechselt eine Provinz den Besitzer, behält sie ihre Kernansprüche — der frühere Besitzer beansprucht sie also weiter.
- Friedensschluss (Beziehung weg von „Enemy“) beendet die Besatzungen zwischen den beiden Staaten.
- Wird ein Staat gelöscht, verschwinden seine Ansprüche; wird er eingegliedert, gehen sie auf den neuen Herrn über.

### 3. Geschichte pro Staat und Provinz

Im Staaten- und im Provinz-Editor gibt es pro Zeile ein Uhr-Symbol. Es öffnet ein Fenster, in das du einfach
die Geschichte des Staates oder der Provinz schreibst — am besten ein Ereignis pro Zeile, z. B.
`1268 – Revolution, die Monarchie fällt`. Wird eine Provinz unabhängig, nimmt der neue Staat ihre Geschichte mit;
werden Provinzen zusammengelegt, bleiben alle Einträge erhalten.

### 4. Die echte Erde – heute und in der Geschichte

Unter *Heightmap auswählen → Precreated heightmaps* gibt es eine genaue Weltkarte und sieben Fassungen mit echten
Ländergrenzen:

| Vorlage | Inhalt |
| --- | --- |
| **Earth (accurate)** | echte Höhen und Meerestiefen (ETOPO1) und Küsten (Natural Earth 1:10 Mio.), Staaten wie gewohnt erfunden |
| **Earth 2026** | heutige Länder mit deutschen Namen, echten Hauptstädten (Berlin, Paris …) und Regierungsformen |
| **Earth 1945 / 1938 / 1930 / 1914** | Grenzen dieser Jahre; Kolonien sind Provinzen ihrer Kolonialmacht (ohne Kernanspruch) |
| **Earth 1200** (Mittelalter), **Earth 100 AD** (Antike) | Reiche und Völker dieser Zeit; staatenlose Völker als „Anarchie“ |

- Die Karte zeigt so viel vom Globus, wie das Seitenverhältnis erlaubt, ohne zu verzerren — bei **2:1**
  (z. B. 2000 × 1000) die ganze Erde. Maßstab, Koordinaten, Höhen und das Kalenderjahr stimmen.
- Die Erd-Presets nutzen immer mindestens **100.000 Zellen**, sonst verschwimmen Küsten und kleine Länder.
  Meerengen wie Gibraltar, Bosporus, Kertsch, Øresund, Bab al-Mandab, Hormus, Malakka und Bering bleiben offen,
  Panama und Suez bleiben Land – auch wenn eine Zelle breiter ist als die Meerenge.
- Für 1936, 1942 und 1946 gibt es keine eigenen Grenzdaten; am nächsten liegen 1930, 1938 und 1945.
- Städte außer den Hauptstädten, Kulturen und Religionen erzeugt der Generator weiterhin selbst.
- Quellen und Lizenzen: [public/scenarios/README.md](public/scenarios/README.md). Die historischen Grenzen stammen aus
  [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0) und stehen deshalb ebenfalls unter GPL-3.0.

### 5. Größere Welten mit mehreren Kontinenten

- **Punkte-Regler bis 300.000 Zellen** (vorher 100.000) — mehr Platz für viele Länder. Große Werte brauchen spürbar
  länger und mehr Arbeitsspeicher.
- Neue Vorlagen **Many Continents** (meist 4–6 Kontinente) und **Four Continents** (meist 3–5), getrennt durch Meere.
  Die Welt wird dafür größer statt die Kontinente kleiner: Four Continents hat die 4-fache, Many Continents die 6-fache
  Fläche einer normalen Karte (mit entsprechend mehr Zellen, Staaten, Kulturen und Religionen), sodass jeder Kontinent so
  groß ist wie ein Kontinent auf einer normalen Karte. Die Karte öffnet herausgezoomt; zum Erkunden einfach hineinzoomen.
- Weitere Mehr-Kontinent-Vorlagen: **Two Continents** (2×), **Three Continents** (3×), **Six Continents** (6, Gitter aus Meeren), **Continents and Islands** (3×, viele Inseln) und **Mediterranean World** (3×, großes Binnenmeer). Wie bei den anderen wird die Welt größer statt die Kontinente kleiner; bei sehr hoher Zellzahl (Dichte 6) schrumpft das Land bei Six und Many Continents.
- Neue Option **Setting** (Optionen → Generation, unter „States number“): **Medieval** (Königreiche, Herzogtümer, Vasallen) oder **Modern** (Republiken, Föderationen, sozialistische Staaten, Puppets, Protektorate, Mandate).
- Neues Vorlagen-Werkzeug **Channel** (C im Vorlagen-Editor): zieht eine Meeresstraße von Start- zu Endpunkt der
  X- und Y-Bereiche, z. B. `Channel 4 80-90 33-33 0-100` trennt die Karte bei einem Drittel von oben nach unten.

### 6. Deutsche Oberfläche

Unter *Optionen → Oberfläche* lässt sich die Sprache auf **Deutsch** stellen; die Wahl wird im Browser gespeichert.
Übersetzt werden Menüs, Editoren, Dialoge, Hinweise und Meldungen (rund 3.000 Texte, in
[`src/data/i18n/de.json`](src/data/i18n/de.json)). Kartennamen, Beschriftungen, Notizen und alles, was du selbst
eingibst, bleiben unverändert. Zurück auf *English* stellt die Originaltexte sofort wieder her.

Fehlt irgendwo eine Übersetzung, bleibt dort der englische Text stehen — Ergänzungen sind einfach ein weiterer
Eintrag `"Englischer Text": "Deutscher Text"` in `de.json`; Zahlen schreibt man als `{n}`.

### 7. `fmg` — Kommandozeilen-Tool, auch für KI-Agenten

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
git clone https://github.com/nekuro22/Fantasy-Map-Generator.git
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
- Das Dateiformat ist unverändert; neu sind nur die optionalen Felder `cores`, `claims`, `controller`, `history`, `region` (Provinz) sowie `regions` und `subject` (Staat)
  (beschrieben in [docs/architecture/data-model.md](docs/architecture/data-model.md)).

## Lizenz und Urheber

- **Fantasy Map Generator:** © 2017–2024 Max Haniyeu (Azgaar), [MIT-Lizenz](LICENSE). Der Lizenz- und Urheberhinweis
  des Originals bleibt in [LICENSE](LICENSE) unverändert erhalten.
- **Änderungen in diesem Fork** (Staatsform „Socialist“, Ansprüche/Besatzung, Geschichte, Erdkarte, Kontinent-Vorlagen,
  deutsche Übersetzung, `tools/fmg-cli`): © 2026 Niklas,
  ebenfalls unter der MIT-Lizenz — außer den historischen Grenzdaten in `public/scenarios` (GPL-3.0, siehe dort).
  Das Tool enthält einen Nachbau des Voronoi-Aufbaus aus dem Original (siehe
  [tools/fmg-cli/LICENSE](tools/fmg-cli/LICENSE)).
- Die Änderungen wurden mit Unterstützung von Claude (Anthropic) geschrieben.

Fehler im Generator selbst, die nicht mit den Änderungen dieses Forks zu tun haben, meldest du am besten
[beim Original](https://github.com/Azgaar/Fantasy-Map-Generator/issues).
