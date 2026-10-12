"""Earth heightmap for Fantasy Map Generator.

Land/sea from Natural Earth 1:10m coastlines (land + minor islands, minus the largest lakes),
relief and bathymetry from ETOPO1 ice surface at 10 arc-minutes. Grey values follow the generator's
own conversion (heightmap-generator.ts) and its metre formula (unitUtils.getHeight, exponent 2),
so heights shown in the generator match real elevations.
"""
import json
import sys

import h5py
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import RegularGridInterpolator

src, out = sys.argv[1], sys.argv[2]
W, H = 2160, 1080  # 10 arc-minutes, equirectangular, pixel centres at -180+(i+0.5)/6
SS = 4  # supersampling for the coastline mask

f = h5py.File(f"{src}/topo.nc", "r")
topo = f["topography"][:].astype(float)
lat, lon = f["latitude"][:], f["longitude"][:]
interp = RegularGridInterpolator((lat, lon), topo)
lons = -180 + (np.arange(W) + 0.5) / 6
lats = 90 - (np.arange(H) + 0.5) / 6
LAT, LON = np.meshgrid(lats, lons, indexing="ij")
elev = interp(np.stack([LAT, LON], axis=-1))


def rings(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    for poly in polys:
        yield poly[0], poly[1:]


def to_px(ring):
    return [((x + 180) / 360 * W * SS, (90 - y) / 180 * H * SS) for x, y in ring]


mask = Image.new("L", (W * SS, H * SS), 0)
draw = ImageDraw.Draw(mask)


def paint(path, value, keep=lambda p: True):
    for feature in json.load(open(path))["features"]:
        if not keep(feature["properties"]):
            continue
        for outer, holes in rings(feature["geometry"]):
            draw.polygon(to_px(outer), fill=value)
            for hole in holes:
                draw.polygon(to_px(hole), fill=255 - value)


paint(f"{src}/ne_10m_land.geojson", 255)
paint(f"{src}/ne_10m_minor_islands.geojson", 255)
paint(f"{src}/ne_10m_lakes.geojson", 0, lambda p: (p.get("scalerank") if p.get("scalerank") is not None else 99) <= 2)
coverage = np.asarray(mask.resize((W, H), Image.BOX), dtype=float) / 255
land = coverage >= 0.5

# generator heights: land h = 18 + sqrt(m), water h = 1000 / (50 - m)  (inverse of unitUtils.getHeight)
land_m = np.clip(elev, 16, None)  # the lowest land sits just above the coast threshold
water_m = np.clip(elev, None, -10)
h = np.where(land, np.minimum(18 + np.sqrt(land_m), 100), 1000 / (50 - water_m))

# grey value from h (inverse of getHeightsFromImageData: L<0.2 → h=L*100, else h=20+100*(L-0.2)^0.8)
grey_land = 0.2 + ((h - 20).clip(0) / 100) ** 1.25
grey_water = h / 100
grey = np.where(land, np.ceil(grey_land * 255), np.round(grey_water * 255))
# keep the coast threshold (51) between neighbours so a half-land cell resolves fairly when scaled down
grey = np.where(land, np.maximum(grey, 53), np.minimum(grey, 49)).astype(np.uint8)

Image.fromarray(grey, "L").save(out, optimize=True)
weights = np.cos(np.radians(lats))[:, None] * np.ones((1, W))
print(f"saved {out}: {W}x{H}, land {(land * weights).sum() / weights.sum():.3f} of the surface")
