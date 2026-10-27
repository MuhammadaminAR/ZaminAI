"""Private offline CHIRPS extraction; HTTP ranges, resumable yearly caches, no DB credentials.

python scripts/import-chirps-points.py --cache /staging/chirps --output /staging/rows.jsonl
Only the five explicitly requested Uzbekistan points are extracted, not nationwide coverage.
"""
import argparse
import calendar
import hashlib
import json
from pathlib import Path

import fsspec
import numpy as np
import xarray as xr

POINTS = [(41.20, 69.10), (39.70, 66.75), (41.38, 60.36), (42.55, 59.65),
          (40.2160204261477, 66.7438373174406)]
BASE = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/netcdf/by_year/"
METRICS = ["temperature_2m_mean", "temperature_2m_min", "temperature_2m_max",
           "precipitation_sum", "rain_sum", "et0_fao_evapotranspiration"]


def source_index(axis, point, origin):
    # Validate the published lattice, including float32 encoding tolerance. Do not
    # derive edges from imprecise float32 centres or round arbitrary farm coordinates.
    values = np.asarray(axis, dtype=float)
    expected = origin + .025 + np.arange(len(values)) * .05
    if not np.allclose(values, expected, atol=2e-5, rtol=0):
        raise ValueError("Unexpected CHIRPS source lattice")
    edges = np.round(origin + np.arange(len(values) + 1) * .05, 8)
    indices = np.flatnonzero((point >= edges[:-1]) & (point < edges[1:]))
    if len(indices) != 1:
        raise ValueError("Coordinate outside unique source cell")
    i = int(indices[0])
    return i, float(values[i]), float(edges[i]), float(edges[i + 1])


def extract(year):
    url = BASE + f"chirps-v3.0.{year}.monthly.nc"
    result = {"year": year, "url": url, "cells": []}
    with fsspec.open(url, block_size=262144, cache_type="blockcache") as handle:
        with xr.open_dataset(handle, engine="h5netcdf", mask_and_scale=True) as ds:
            if ds.attrs.get("title") != "CHIRPS Version 3.0" or ds.precip.attrs.get("units") != "mm/month":
                raise ValueError("Source version/units mismatch")
            times = ds.time.dt.strftime("%Y-%m").values.tolist()
            if times != [f"{year}-{m:02}" for m in range(1, 13)]:
                raise ValueError("Source must contain all 12 unique baseline months")
            for lat, lon in POINTS:
                yi, yc, south, north = source_index(ds.latitude.values, lat, -60)
                xi, xc, west, east = source_index(ds.longitude.values, lon, -180)
                a = ds.precip.isel(latitude=yi, longitude=xi).values.astype(float)
                if np.any(a[np.isfinite(a)] < 0):
                    raise ValueError("Negative precipitation; check source mask")
                values = [float(v) if np.isfinite(v) else None for v in a]
                result["cells"].append(dict(cell_id=f"row={yi};col={xi}", west=west, east=east,
                    south=south, north=north, center_latitude=yc, center_longitude=xc,
                    values=values, times=times))
    return result


def rows_from_cache(cache):
    years = [json.loads((cache / f"{y}.json").read_text()) for y in range(2016, 2026)]
    rows = []
    for position in range(len(POINTS)):
        cell = years[0]["cells"][position]
        annual, monthly = [], []
        for y in years:
            c = y["cells"][position]
            if any(c[k] != cell[k] for k in ["cell_id", "west", "east", "south", "north"]):
                raise ValueError("Source grid changed between years")
            valid = [v for v in c["values"] if v is not None]
            annual.append(dict(year=y["year"], days_in_year=366 if calendar.isleap(y["year"]) else 365,
                precipitation_total_mm=round(sum(valid), 3) if len(valid) == 12 else None,
                rain_total_mm=None, temperature_mean_c=None, temperature_min_avg_c=None,
                temperature_max_avg_c=None, et0_total_mm=None, valid_days=dict.fromkeys(METRICS, 0),
                valid_months={"precipitation_sum": len(valid)}, reliable=len(valid) == 12,
                flags=[] if len(valid) == 12 else [f"{len(valid)}/12 valid monthly observations"]))
        for m in range(12):
            valid = [y["cells"][position]["values"][m] for y in years if y["cells"][position]["values"][m] is not None]
            counts = dict.fromkeys(METRICS, 0)
            counts["precipitation_sum"] = len(valid)
            monthly.append(dict(month=m+1, precipitation_avg_total_mm=round(sum(valid)/len(valid), 3) if valid else None,
                rain_avg_total_mm=None, temperature_mean_avg_c=None, temperature_min_avg_c=None,
                temperature_max_avg_c=None, et0_avg_total_mm=None, valid_years=counts))
        source = dict(model="chirps_v3", dataset="CHIRPS v3 / Climate Hazards Center", spatial_resolution="0.05°",
            variables=["precipitation_sum"], status="success" if all(a["reliable"] for a in annual) else "partial",
            attribution_url="https://chc.ucsb.edu/data/chirps3", licence="CC BY 4.0; CHIRPS v3 DOI 10.15780/G2JQ0P",
            period={"start":"2016-01-01", "end":"2025-12-31"},
            aggregation="Monthly source totals; annual totals require 12 valid months. Daily counts remain zero.",
            source_urls=[y["url"] for y in years],
            extracted_samples_sha256=hashlib.sha256(json.dumps([y["cells"][position]["values"] for y in years]).encode()).hexdigest())
        rows.append(dict(dataset="chirps_v3", grid_version="chirps-v3.0-monthly-native-0.05-v1",
            **{k:cell[k] for k in cell if k not in ["values","times"]}, start_date="2016-01-01", end_date="2025-12-31",
            payload=dict(source=source, annual=annual, monthly=monthly)))
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--years", nargs="+", type=int, default=list(range(2016, 2026)))
    args = p.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    for y in args.years:
        if y not in range(2016,2026):
            raise ValueError("Only the 2016–2025 baseline is supported")
        target = args.cache / f"{y}.json"
        if target.exists():
            print(f"{y}: reused extracted samples", flush=True)
            continue
        try:
            result = extract(y)
            staging = target.with_suffix(".tmp")
            staging.write_text(json.dumps(result, allow_nan=False))
            staging.replace(target)
            print(f"{y}: extracted five genuine cells", flush=True)
        except Exception as e:
            (args.cache / f"{y}.error.txt").write_text(str(e))
            raise
    if all((args.cache / f"{y}.json").exists() for y in range(2016,2026)):
        rows = rows_from_cache(args.cache)
        args.output.write_text("".join(json.dumps(r, allow_nan=False)+"\n" for r in rows))
        print(f"Prepared {len(rows)} rainfall cells only. Hosted import has NOT been performed.", flush=True)


if __name__ == "__main__":
    main()