"""Convert the official GHS-POP 2020 ZIP to the game's global population grid.

Requires rasterio and numpy, only for rebuilding data, not for running the game.
Usage: python scripts/generate-population-grid.py SOURCE.zip public/population-2020-v1.bin
"""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import shutil
import zipfile
import zlib

import numpy as np
import rasterio
from rasterio.windows import Window

archive, output = map(Path, sys.argv[1:3])
with zipfile.ZipFile(archive) as package:
    rasters = [name for name in package.namelist() if name.endswith(".tif")]
    if len(rasters) != 1 or "E2020" not in rasters[0]:
        raise ValueError("Expected exactly one GHS-POP E2020 raster")
    raster_name = rasters[0]

width, height = 4320, 2160
population = np.zeros((height, width), dtype="float32")
with tempfile.TemporaryDirectory(prefix="losy-ghsl-") as temporary:
  # TIFF already uses internal compression. Extract once to avoid repeated
  # decompression of the enclosing ZIP on every random raster window read.
  extracted = Path(temporary) / "population.tif"
  with zipfile.ZipFile(archive) as package, package.open(raster_name) as src, extracted.open("wb") as dst:
    shutil.copyfileobj(src, dst)
  print("Source extracted; aggregating population counts", flush=True)
  with rasterio.open(extracted) as source:
    if source.crs.to_epsg() != 4326:
        raise ValueError("Expected official WGS84 population counts")
    # Assign each source cell by its geographic centre, preserving its count.
    # The official raster has a small fractional-cell origin offset.
    transform = source.transform
    if (abs(transform.a - 1 / 120) > 1e-10 or abs(transform.e + 1 / 120) > 1e-10
        or transform.b != 0 or transform.d != 0):
        raise ValueError("Expected an unrotated global 30ss grid")
    first_column = int(np.ceil((-180 - transform.c) / transform.a - .5))
    if first_column < 0 or first_column + width * 10 > source.width:
        raise ValueError("Source does not cover all longitudes")
    longitudes = transform.c + (np.arange(first_column, first_column + width * 10) + .5) * transform.a
    target_columns = np.floor((longitudes + 180) * 12).astype(int)
    if not np.array_equal(target_columns, np.repeat(np.arange(width), 10)):
        raise ValueError("Unexpected column mapping; cannot aggregate in groups of ten")
    for start in range(0, source.height, 256):
        rows = min(256, source.height - start)
        values = source.read(1, window=Window(first_column, start, width * 10, rows))
        if not np.isfinite(values).all() or (values < 0).any():
            raise ValueError("Source contains invalid population counts")
        row_sums = values.reshape(rows, width, 10).sum(axis=2)
        latitudes = transform.f + (np.arange(start, start + rows) + .5) * transform.e
        target_rows = np.floor((90 - latitudes) * 12).astype(int)
        valid = (target_rows >= 0) & (target_rows < height)
        np.add.at(population, target_rows[valid], row_sums[valid])
        if start % 4096 == 0:
            print(f"Processed {start + rows}/{source.height} source rows", flush=True)
if not np.isfinite(population).all() or (population < 0).any():
    raise ValueError("Invalid population values")
total = float(population.sum(dtype="float64"))
if not 7e9 < total < 9e9:
    raise ValueError(f"Unexpected world population: {total}")
payload = zlib.compress(population.astype("<f4").tobytes(), level=9)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(payload)
source_hash = hashlib.sha256()
with archive.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        source_hash.update(chunk)
metadata = {
    "dataset": "GHS-POP R2023A", "epoch": 2020, "width": width, "height": height,
    "encoding": "zlib-compressed little-endian float32, persons per cell, north to south",
    "aggregation": "sum by source cell centre, WGS84, global extent [-180,-90,180,90]",
    "source": "https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe",
    "archive_sha256": source_hash.hexdigest(), "payload_sha256": hashlib.sha256(payload).hexdigest(),
    "world_population": total, "compressed_bytes": len(payload),
}
output.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata, indent=2))
