"""Border scenarios for the Earth heightmap: one region index per 10' pixel, run-length encoded per row.

States are sovereign powers; regions are the source polygons (a colony is a region of its colonial power).
Sources: Natural Earth admin-0 + populated places (public domain) for today, aourednik/historical-basemaps
(GPL-3.0) for the past. Land pixels left between polygons take the nearest region within ~110 km.
"""
import json
import re
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

src, earth_png, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 2160, 1080
land = np.asarray(Image.open(earth_png)) >= 51

HISTORICAL = "aourednik/historical-basemaps (GPL-3.0), https://github.com/aourednik/historical-basemaps"
SCENARIOS = [
    ("2026", "Earth 2026", "ne", "Natural Earth 1:50m admin-0 countries and populated places (public domain)"),
    ("1945", "Earth 1945", "world_1945", HISTORICAL),
    ("1938", "Earth 1938", "world_1938", HISTORICAL),
    ("1930", "Earth 1930", "world_1930", HISTORICAL),
    ("1914", "Earth 1914", "world_1914", HISTORICAL),
    ("1200", "Earth 1200 (Middle Ages)", "world_1200", HISTORICAL),
    ("100", "Earth 100 AD (Antiquity)", "world_100", HISTORICAL),
]


def polygons(geometry):
    if not geometry:
        return []
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [(p[0], p[1:]) for p in polys]


def px(ring):
    return [((x + 180) / 360 * W, (90 - y) / 180 * H) for x, y in ring]


def rasterize(features):
    """features: [(region index, geometry)] → int32 grid"""
    image = Image.new("I", (W, H), 0)
    draw = ImageDraw.Draw(image)
    for index, geometry in features:
        for outer, holes in polygons(geometry):
            draw.polygon(px(outer), fill=int(index))
            for hole in holes:
                draw.polygon(px(hole), fill=0)
    grid = np.asarray(image, dtype=np.int32).copy()
    gap = land & (grid == 0)
    if gap.any():
        distance, (iy, ix) = ndimage.distance_transform_edt(grid == 0, return_indices=True)
        fill = gap & (distance <= 6)
        grid[fill] = grid[iy[fill], ix[fill]]
    grid[~land] = 0
    return grid


def rle(grid):
    rows = []
    for row in grid:
        runs, start = [], 0
        changes = np.flatnonzero(np.diff(row)) + 1
        for end in list(changes) + [len(row)]:
            runs += [int(row[start]), int(end - start)]
            start = end
        rows.append(runs)
    return rows


# governments in 2026 by Natural Earth sovereign name; every other state is a republic
MONARCHIES = ["United Kingdom", "Spain", "Netherlands", "Belgium", "Denmark", "Norway", "Sweden", "Luxembourg",
    "Liechtenstein", "Monaco", "Andorra", "Japan", "Thailand", "Cambodia", "Malaysia", "Brunei", "Bhutan",
    "Saudi Arabia", "Jordan", "Morocco", "Oman", "Qatar", "Kuwait", "Bahrain", "United Arab Emirates", "eSwatini",
    "Lesotho", "Tonga", "Canada", "Australia", "New Zealand", "Jamaica", "Papua New Guinea", "Solomon Islands",
    "The Bahamas", "Belize", "Antigua and Barbuda", "Grenada", "Saint Lucia", "Saint Vincent and the Grenadines",
    "Saint Kitts and Nevis", "Tuvalu"]
FORMS_2026 = {**{name: "Monarchy" for name in MONARCHIES},
    **{name: "Socialist" for name in ["China", "Vietnam", "Laos", "Cuba", "North Korea"]},
    **{name: "Theocracy" for name in ["Vatican", "Iran", "Afghanistan"]}}


def natural_earth():
    countries = json.load(open(f"{src}/ne_50m_admin_0_countries.geojson"))["features"]
    places = json.load(open(f"{src}/ne_50m_populated_places.geojson"))["features"]
    by_admin = {f["properties"]["ADMIN"]: f["properties"] for f in countries}
    german = lambda p: p.get("NAME_DE") or p["NAME"]
    states, state_ids, regions, features = [], {}, [], []
    for f in sorted(countries, key=lambda f: f["properties"]["ADMIN"]):
        p = f["properties"]
        sovereign = p["SOVEREIGNT"]
        if sovereign in ("Antarctica", "Siachen Glacier"):
            continue
        if sovereign not in state_ids:
            home = by_admin.get(sovereign, p)
            caps = [c["properties"] for c in places if c["properties"].get("ADM0CAP") == 1
                    and c["properties"].get("ADM0_A3") == home.get("ADM0_A3")]
            caps.sort(key=lambda c: (c.get("FEATURECLA") != "Admin-0 capital", -(c.get("POP_MAX") or 0)))
            capital = caps[0] if caps else None
            if capital:
                capital = {**capital, "NAME_DE": " ".join(german(capital).split())}
            states.append({"name": german(home), "form": FORMS_2026.get(sovereign, "Republic"), **({"capital": {"name": german(capital), "lon": capital["LONGITUDE"], "lat": capital["LATITUDE"]}} if capital else {})})
            state_ids[sovereign] = len(states)
        regions.append({"name": german(p), "state": state_ids[sovereign], "colony": p["ADMIN"] != sovereign})
        features.append((len(regions), f["geometry"]))
    return states, regions, features


# the data names one power several ways in a year; the first name is kept
ALIASES = {
    "all": {"USA": "United States", "S. Xiongnu": "Southern Xiongnu"},
    "world_1914": {"Russia": "Russian Empire", "Italy": "Kingdom of Italy", "United Kingdom": "United Kingdom of Great Britain and Ireland"},
    "world_1930": {"White Russia": "USSR", "Far Eastern SSR": "USSR", "United Kingdom of Great Britain and Ireland": "United Kingdom"},
    "world_1938": {"United Kingdom of Great Britain and Ireland": "United Kingdom"},
    "world_1200": {"France": "Kingdom of France"},
}
# peoples and cultural areas without a state
STATELESS = re.compile(r"hunter|gatherer|farmers|herders|peoples|tribes|culture|complex|nomad|foraging|fishers|focus|chiefdoms|"
                       r"city-states|paleo|papuans|polynesians|malays|khoisan|ainu|sámi|saami|thule|dorset|innu|athabaskan|"
                       r"arawaks|taino|guanahatabeyes|guanches|berber|tuareg|warlords|scythians|alans|blemmyes", re.I)
# capitals of the past: (city, lon, lat); a year's own list wins over the common one
CAPITALS = {
    "all": {
        "Russian Empire": ("Saint Petersburg", 30.32, 59.94), "United Kingdom of Great Britain and Ireland": ("London", -0.13, 51.51), "USSR": ("Moscow", 37.62, 55.75),
        "Kingdom of Italy": ("Rome", 12.48, 41.89), "German Empire": ("Berlin", 13.40, 52.52),
        "Austro-Hungarian Empire": ("Vienna", 16.37, 48.21), "Ottoman Empire": ("Constantinople", 28.98, 41.01),
        "Empire of Japan": ("Tokyo", 139.69, 35.69), "Manchu Empire": ("Beijing", 116.40, 39.90),
        "Persia": ("Tehran", 51.39, 35.69), "Abyssinia": ("Addis Ababa", 38.75, 9.03),
        "Rattanakosin Kingdom": ("Bangkok", 100.50, 13.75), "Siam": ("Bangkok", 100.50, 13.75),
        "Hejaz": ("Mecca", 39.83, 21.42), "Arabia (Nejd)": ("Riyadh", 46.72, 24.69), "Manchuria": ("Hsinking", 125.32, 43.88),
        "Union of South Africa": ("Pretoria", 28.19, -25.75), "Dominion of Newfoundland": ("St. John's", -52.71, 47.56),
        "Tibet": ("Lhasa", 91.13, 29.65), "Xinjiang": ("Ürümqi", 87.62, 43.83), "Montenegro": ("Cetinje", 18.92, 42.39),
        "Serbia": ("Belgrade", 20.46, 44.82), "Yugoslavia": ("Belgrade", 20.46, 44.82), "Czechoslovakia": ("Prague", 14.42, 50.09),
        "Republic of Turkey": ("Ankara", 32.86, 39.93), "Burma": ("Rangoon", 96.16, 16.80), "Zaire": ("Kinshasa", 15.31, -4.32),
        "Brazil": ("Rio de Janeiro", -43.20, -22.91), "Ceylon": ("Colombo", 79.86, 6.93),
    },
    "world_1914": {"China": ("Beijing", 116.40, 39.90), "Australia": ("Melbourne", 144.96, -37.81), "Mexico": ("Mexico City", -99.13, 19.43)},
    "world_1930": {"China": ("Nanjing", 118.80, 32.06), "Turkey": ("Ankara", 32.86, 39.93)},
    "world_1938": {"China": ("Nanjing", 118.80, 32.06)},
    "world_1945": {"China": ("Chongqing", 106.55, 29.56)},
    "world_1200": {
        # Middle Ages
        "Byzantine Empire": ("Constantinople", 28.98, 41.01), "Holy Roman Empire": ("Aachen", 6.08, 50.78),
        "Kingdom of France": ("Paris", 2.35, 48.86), "Angevin Empire": ("London", -0.13, 51.51), "Scotland": ("Scone", -3.40, 56.42),
        "Castilla": ("Toledo", -4.02, 39.86), "León": ("León", -5.57, 42.60), "Aragón": ("Zaragoza", -0.89, 41.65),
        "Navarre": ("Pamplona", -1.64, 42.82), "Portugal": ("Coimbra", -8.42, 40.21), "Venice": ("Venice", 12.33, 45.44),
        "Papal States": ("Rome", 12.48, 41.89), "Hungary": ("Esztergom", 18.74, 47.79), "Poland": ("Kraków", 19.94, 50.06),
        "Denmark": ("Roskilde", 12.08, 55.64), "Norway": ("Bergen", 5.32, 60.39), "Sweden": ("Sigtuna", 17.72, 59.62),
        "Principality of Kyiv": ("Kyiv", 30.52, 50.45), "Principality of Novgorod": ("Novgorod", 31.27, 58.52),
        "Principality of Vladimir-Suzdal": ("Vladimir", 40.40, 56.13), "Principality of Galicia-Volhynia": ("Halych", 24.72, 49.12),
        "Georgia": ("Tbilisi", 44.79, 41.72), "Fatimid Caliphate": ("Cairo", 31.24, 30.04), "Almohad Caliphate": ("Marrakesh", -7.99, 31.63),
        "Mongol Empire": ("Karakorum", 102.84, 47.20), "Song Empire": ("Lin'an", 120.16, 30.27), "Liao": ("Zhongdu", 116.40, 39.90),
        "Xixia": ("Xingqing", 106.23, 38.49), "Goryeo": ("Kaesong", 126.55, 37.97), "Imperial Japan (Fujiwara)": ("Heian-kyō", 135.76, 35.01),
        "Khmer Empire": ("Yasodharapura", 103.87, 13.41), "Đại Việt": ("Thăng Long", 105.85, 21.03), "Chola Empire": ("Thanjavur", 79.14, 10.79),
        "Sultanate of Delhi": ("Delhi", 77.21, 28.66), "Ghaznavid Emirate": ("Ghazni", 68.42, 33.55), "Khwarazmian dynasty": ("Gurganj", 59.15, 42.33),
        "Kara Khitai Khaganate": ("Balasagun", 75.20, 42.75), "Srivijaya Empire": ("Palembang", 104.76, -2.99), "Bagan": ("Bagan", 94.86, 21.17),
        "Ghana": ("Koumbi Saleh", -7.98, 15.77), "Toltec Empire": ("Tollan", -99.34, 20.06), "Chimú Empire": ("Chan Chan", -79.07, -8.11),
        "Tiahuanaco Empire": ("Tiwanaku", -68.67, -16.55), "Huari Empire": ("Wari", -74.21, -13.06), "Bulgar Khanate": ("Tarnovo", 25.63, 43.08),
        "Volga Bulgars": ("Bilär", 50.39, 54.98), "Makkura": ("Dongola", 30.48, 18.22), "Alwa": ("Soba", 32.68, 15.52), "Cyprus": ("Nicosia", 33.36, 35.17),
        "Buyid dynasty": ("Baghdad", 44.37, 33.31), "Buwayhid Emirates": ("Shiraz", 52.53, 29.59), "Great Zimbabwe": ("Great Zimbabwe", 30.93, -20.27),
    },
    "world_100": {
        # Antiquity
        "Roman Empire": ("Roma", 12.48, 41.89), "Han": ("Luoyang", 112.45, 34.62), "Parthian Empire": ("Ctesiphon", 44.58, 33.09),
        "Kushan Empire": ("Purushapura", 71.57, 34.01), "Axum": ("Aksum", 38.72, 14.13), "Meroe": ("Meroë", 33.75, 16.94),
        "Dacia": ("Sarmizegetusa", 23.31, 45.62), "Armenia": ("Artaxata", 44.55, 39.95), "Nabatean Kingdom": ("Petra", 35.44, 30.33),
        "Himyarite Kingdom": ("Zafar", 44.40, 14.21), "Satavahanihara": ("Pratishthana", 75.38, 19.48), "Teotihuacan": ("Teotihuacan", -98.84, 19.69),
        "Moche": ("Huacas de Moche", -79.00, -8.15), "Nazca": ("Cahuachi", -75.12, -14.82), "Monte Albán": ("Monte Albán", -96.77, 17.04),
        "Koguryo": ("Gungnae", 126.18, 41.13), "Silla": ("Gyeongju", 129.21, 35.86), "Paekche": ("Wiryeseong", 127.12, 37.52),
        "Saka Kingdom": ("Ujjain", 75.78, 23.18), "Simhala": ("Anuradhapura", 80.40, 8.31), "Kalinga": ("Sisupalgarh", 85.86, 20.23),
    },
}
# governments of the 20th century; any other state of that time counts as a republic, earlier ones as monarchies
COMMON_MONARCHIES = ["United Kingdom", "United Kingdom of Great Britain and Ireland", "Netherlands", "Belgium", "Denmark",
    "Norway", "Sweden", "Luxembourg", "Liechtenstein", "Monaco", "Empire of Japan", "Japan", "Siam", "Rattanakosin Kingdom",
    "Thailand", "Abyssinia", "Ethiopia", "Egypt", "Iraq", "Saudi Arabia", "Hejaz", "Arabia (Nejd)", "Yemen", "Afghanistan",
    "Persia", "Iran", "Nepal", "Bhutan", "Kuwait", "Qatar", "Oman", "Muscat", "Brunei", "Tonga", "Jordan", "Hail",
    "Emirate of Bin Shal'an", "Trucial Oman", "Canada", "Australia", "New Zealand", "Union of South Africa", "South Africa",
    "Dominion of Newfoundland", "India", "Malaysia", "Malaya", "Morocco", "Tunisia", "Libya", "Laos", "Cambodia", "Manchuria"]
FORMS_BY_YEAR = {
    "world_1914": {"Monarchy": COMMON_MONARCHIES + ["Russian Empire", "German Empire", "Austro-Hungarian Empire",
        "Kingdom of Italy", "Spain", "Ottoman Empire", "Romania", "Bulgaria", "Serbia", "Montenegro", "Greece", "Albania",
        "Manchu Empire", "Korea", "Mongolia"], "Theocracy": ["Tibet"]},
    "world_1930": {"Monarchy": COMMON_MONARCHIES + ["Italy", "Spain", "Romania", "Bulgaria", "Yugoslavia", "Albania",
        "Hungary"], "Socialist": ["USSR", "Mongolia"], "Theocracy": ["Tibet"]},
    "world_1938": {"Monarchy": COMMON_MONARCHIES + ["Italy", "Romania", "Bulgaria", "Yugoslavia", "Albania", "Hungary",
        "Greece"], "Socialist": ["USSR", "Mongolia"], "Theocracy": ["Tibet"]},
    "world_1945": {"Monarchy": COMMON_MONARCHIES + ["Italy", "Romania", "Bulgaria", "Greece"],
        "Socialist": ["USSR", "Mongolia", "Yugoslavia"], "Theocracy": ["Tibet"]},
    "world_1200": {"Republic": ["Venice"], "Theocracy": ["Papal States", "Fatimid Caliphate", "Almohad Caliphate", "Tibet"]},
    "world_100": {},
}


def form_of(name, year_file, stateless):
    if stateless:
        return "Anarchy"
    for form, names in FORMS_BY_YEAR.get(year_file, {}).items():
        if name in names:
            return form
    return "Republic" if int(year_file.split("_")[1]) >= 1900 else "Monarchy"



def modern_capitals():
    """English country name → today's capital, for states of the 20th century that kept theirs"""
    countries = json.load(open(f"{src}/ne_50m_admin_0_countries.geojson"))["features"]
    places = json.load(open(f"{src}/ne_50m_populated_places.geojson"))["features"]
    result = {}
    for f in countries:
        p = f["properties"]
        caps = [c["properties"] for c in places if c["properties"].get("ADM0CAP") == 1 and c["properties"].get("ADM0_A3") == p.get("ADM0_A3")]
        caps.sort(key=lambda c: (c.get("FEATURECLA") != "Admin-0 capital", -(c.get("POP_MAX") or 0)))
        if caps:
            for key in (p["ADMIN"], p["NAME"], p.get("NAME_LONG")):
                if key:
                    result.setdefault(key, (caps[0].get("NAME_EN") or caps[0]["NAME"], caps[0]["LONGITUDE"], caps[0]["LATITUDE"]))
    return result


def historical(name):
    data = json.load(open(f"{src}/{name}.geojson"))["features"]
    aliases = {**ALIASES["all"], **ALIASES.get(name, {})}
    canon = lambda n: aliases.get(n, n)
    capitals = {**CAPITALS["all"], **CAPITALS.get(name, {})}
    modern = modern_capitals() if int(name.split("_")[1]) >= 1900 else {}
    states, state_ids, regions, region_ids, features = [], {}, [], {}, []
    for f in data:
        p = f["properties"]
        if not p.get("NAME") or "antarctic" in p["NAME"].lower():
            continue
        region = canon(p["NAME"])
        owner = canon(p.get("SUBJECTO") or p["NAME"])
        if owner not in state_ids:
            state = {"name": owner, "form": form_of(owner, name, bool(STATELESS.search(owner)))}
            capital = capitals.get(owner) or modern.get(owner)
            if capital:
                state["capital"] = {"name": " ".join(capital[0].split()), "lon": capital[1], "lat": capital[2]}
            states.append(state)
            state_ids[owner] = len(states)
        key = (region, owner)
        if key not in region_ids:
            regions.append({"name": region, "state": state_ids[owner], "colony": region != owner})
            region_ids[key] = len(regions)
        features.append((region_ids[key], f["geometry"]))
    return states, regions, features


index = []
for sid, label, source, credit in SCENARIOS:
    states, regions, features = natural_earth() if source == "ne" else historical(source)
    grid = rasterize(features)
    present = set(np.unique(grid)) - {0}
    cells = np.bincount(grid.ravel(), minlength=len(regions) + 1)
    doc = {"id": sid, "label": label, "source": credit, "width": W, "height": H,
           "states": states, "regions": regions, "rows": rle(grid)}
    path = f"{out_dir}/{sid}.json"
    json.dump(doc, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    covered = (grid > 0).sum() / land.sum()
    print(f"{sid}: {len(states)} states, {len(regions)} regions ({len(present)} on land), land covered {covered:.0%}")
    index.append({"id": sid, "label": label, "source": credit})
json.dump(index, open(f"{out_dir}/index.json", "w"), ensure_ascii=False, indent=1)
