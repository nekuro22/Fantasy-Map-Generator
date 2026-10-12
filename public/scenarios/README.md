# Real-world Earth data

## Heightmap `public/heightmaps/earth.png`

2160 × 1080 px, equirectangular, 10 arc-minutes per pixel. Grey values follow the generator's own conversion,
so heights shown in the generator match real elevations (exponent 2).

- Relief and bathymetry: ETOPO1 ice surface (NOAA, public domain), as the 10 arc-minute grid by Fatiando a Terra,
  [earth-topography-10arcmin](https://github.com/fatiando-data/earth-topography-10arcmin), CC-BY 4.0.
- Coastlines, islands and the largest lakes: [Natural Earth](https://www.naturalearthdata.com) 1:10m, public domain.

Built by `scripts/build-earth-heightmap.py`.

## Border scenarios `public/scenarios/<year>.json`

A region index per pixel of the same grid (run-length encoded rows), regions grouped into states; colonies are regions
of their colonial power. Built by `scripts/build-border-scenarios.py`.

| File | Source | License |
| --- | --- | --- |
| `2026.json` | Natural Earth 1:50m admin-0 countries and populated places (capitals) | public domain |
| `1945.json`, `1938.json`, `1930.json`, `1914.json`, `1200.json`, `100.json` | [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) by André Ourednik and contributors | GPL-3.0, see `LICENSE-historical-basemaps.txt` |

The historical scenarios are derived from GPL-3.0 data and are therefore distributed under GPL-3.0 as well; the rest of
this repository stays under its own license. Capitals and governments of past states were added from general
historical knowledge (see the tables in the build script); the source data is a work in progress and meant for
world-scale maps — check it against other sources before relying on details.
