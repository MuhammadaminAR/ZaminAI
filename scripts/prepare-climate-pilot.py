"""Offline four-location pilot. Requires xarray, numpy, netCDF4; no network or credentials.

python scripts/prepare-climate-pilot.py --chirps '/staging/chirps*.nc' \
  --temperature '/staging/era5*.nc' --output /staging/climate-pilot.jsonl

Reads genuine local files, rejects unexpected units/grids/time axes, preserves nulls.
Outputs importable rows only; it does not claim hosted import or nationwide coverage.
"""
import argparse
import calendar
import glob
import hashlib
import json
from pathlib import Path

import numpy as np
import xarray as xr

POINTS = [(41.20, 69.10), (39.70, 66.75), (41.38, 60.36), (42.55, 59.65)]
VARS = ["precipitation_sum", "rain_sum", "temperature_2m_mean", "temperature_2m_min", "temperature_2m_max", "et0_fao_evapotranspiration"]
START, END = "2016-01-01", "2025-12-31"


def number(value):
    return round(float(value), 3) if np.isfinite(value) else None


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def axis(ds, candidates):
    names = [n for n in candidates if n in ds.coords]
    if len(names) != 1:
        raise ValueError(f"Expected one coordinate from {candidates}; inspect source schema")
    return names[0]


def cell_axis(values, point, spacing):
    a = np.asarray(values, dtype=float)
    if a.ndim != 1 or len(a) < 2 or not np.allclose(np.abs(np.diff(a)), spacing, atol=1e-6):
        raise ValueError("Not the expected regular source grid")
    matches = np.flatnonzero((point >= a - spacing / 2) & (point < a + spacing / 2))
    if len(matches) != 1:
        raise ValueError("Point not uniquely inside a source cell; request a larger source area")
    i = int(matches[0])
    return i, float(a[i]), float(a[i] - spacing / 2), float(a[i] + spacing / 2)


def read_files(pattern, dataset):
    files = sorted(glob.glob(pattern))
    if not files:
        raise ValueError(f"No files match {pattern}")
    spacing = .05 if dataset == "chirps_v3" else .1
    groups = {}
    for path in files:
        checksum = digest(path)
        with xr.open_dataset(path, decode_times=True, mask_and_scale=True) as ds:
            lat = axis(ds, ["latitude", "lat"])
            lon = axis(ds, ["longitude", "lon"])
            time = axis(ds, ["time", "valid_time"])
            candidates = [v for v in (["precip", "precipitation"] if dataset == "chirps_v3" else ["t2m", "2m_temperature"]) if v in ds]
            if len(candidates) != 1:
                raise ValueError("Unknown variable: inspect NetCDF and explicitly configure its real variable")
            v = candidates[0]
            units = str(ds[v].attrs.get("units", "")).lower()
            if dataset == "chirps_v3" and units not in ["mm", "mm/month", "mm month-1"]:
                raise ValueError(f"Unexpected CHIRPS units {units}")
            if dataset != "chirps_v3" and units not in ["k", "kelvin"]:
                raise ValueError(f"Unexpected temperature units {units}")
            for latitude, longitude in POINTS:
                yi, yc, south, north = cell_axis(ds[lat].values, latitude, spacing)
                xi, xc, west, east = cell_axis(ds[lon].values, longitude, spacing)
                cell_id = f"lat={yc:.6f};lon={xc:.6f}"
                selected = ds[v].isel({lat: yi, lon: xi})
                if selected.dims != (time,):
                    raise ValueError("Unexpected extra dimensions: resolve source product explicitly")
                values = np.asarray(selected.values, dtype=float)
                if dataset != "chirps_v3":
                    values = values - 273.15
                values[~np.isfinite(values)] = np.nan
                if dataset == "chirps_v3" and np.any(values[np.isfinite(values)] < 0):
                    raise ValueError("Negative precipitation: inspect fill-value decoding")
                entry = groups.setdefault(cell_id, {"bounds": (west, east, south, north, yc, xc), "series": [], "files": []})
                if not np.allclose(entry["bounds"], (west, east, south, north, yc, xc)):
                    raise ValueError("Grid changed across files")
                entry["series"].append(selected.copy(data=values).rename({time: "time"}).load())
                entry["files"].append({"filename": Path(path).name, "sha256": checksum})
    return groups


def summarize(entry, dataset):
    data = xr.concat(entry["series"], dim="time").sortby("time")
    if len(np.unique(data.time.values)) != len(data.time):
        raise ValueError("Duplicate timestamps: do not import overlapping files")
    data = data.sel(time=slice(START, END))
    if dataset == "chirps_v3":
        month_keys = data.time.dt.strftime("%Y-%m").values
        if len(np.unique(month_keys)) != len(month_keys):
            raise ValueError("CHIRPS input is not one sample per month")
        # Keep an absent month as NaN; never let an empty resample bucket become 0.
        monthly = data.resample(time="MS").sum(skipna=False).where(data.resample(time="MS").count() == 1)
        daily = None
    else:
        times = data.time.values.astype("datetime64[m]").astype(np.int64)
        if len(times) < 2 or np.any(np.diff(times) < 60) or np.any(times % 60):
            raise ValueError("ERA5-Land input must contain hourly samples on the hour")
        counts = data.resample(time="1D").count()
        daily = {"mean": data.resample(time="1D").mean().where(counts >= 22),
                 "min": data.resample(time="1D").min().where(counts >= 22),
                 "max": data.resample(time="1D").max().where(counts >= 22)}
        monthly = None
    annual, per_month = [], {m: {"p": [], "mean": [], "min": [], "max": []} for m in range(1, 13)}
    for year in range(2016, 2026):
        valid = dict.fromkeys(VARS, 0)
        row = dict(year=year, days_in_year=366 if calendar.isleap(year) else 365,
                   precipitation_total_mm=None, rain_total_mm=None, temperature_mean_c=None,
                   temperature_min_avg_c=None, temperature_max_avg_c=None, et0_total_mm=None,
                   valid_days=valid, reliable=False, flags=[])
        if monthly is not None:
            y = monthly.where(monthly.time.dt.year == year, drop=True)
            valid_months = int(y.count())
            row["valid_months"] = {"precipitation_sum": valid_months}
            row["precipitation_total_mm"] = number(y.sum()) if valid_months == 12 else None
            row["reliable"] = valid_months == 12
            if valid_months != 12:
                row["flags"].append(f"precipitation_sum: {valid_months}/12 valid monthly samples; no extrapolation")
            for month in range(1, 13):
                a = y.where(y.time.dt.month == month, drop=True)
                if int(a.count()) == 1:
                    per_month[month]["p"].append(float(a.values[0]))
        else:
            for key, var, field in [("mean", "temperature_2m_mean", "temperature_mean_c"), ("min", "temperature_2m_min", "temperature_min_avg_c"), ("max", "temperature_2m_max", "temperature_max_avg_c")]:
                y = daily[key].where(daily[key].time.dt.year == year, drop=True)
                valid[var] = int(y.count())
                if valid[var] >= row["days_in_year"] * .9:
                    row[field] = number(y.mean())
                else:
                    row["flags"].append(f"{var}: {valid[var]}/{row['days_in_year']} valid UTC days")
                for month in range(1, 13):
                    a = y.where(y.time.dt.month == month, drop=True)
                    if int(a.count()) >= calendar.monthrange(year, month)[1] * .9:
                        per_month[month][key].append(float(a.mean()))
            row["reliable"] = row["temperature_mean_c"] is not None
        annual.append(row)
    climatology = []
    for month, v in per_month.items():
        climatology.append(dict(month=month, precipitation_avg_total_mm=number(np.mean(v["p"])) if v["p"] else None,
            rain_avg_total_mm=None, et0_avg_total_mm=None,
            temperature_mean_avg_c=number(np.mean(v["mean"])) if v["mean"] else None,
            temperature_min_avg_c=number(np.mean(v["min"])) if v["min"] else None,
            temperature_max_avg_c=number(np.mean(v["max"])) if v["max"] else None,
            valid_years=dict(precipitation_sum=len(v["p"]), rain_sum=0, et0_fao_evapotranspiration=0,
                temperature_2m_mean=len(v["mean"]), temperature_2m_min=len(v["min"]), temperature_2m_max=len(v["max"]))))
    return annual, climatology


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chirps", required=True)
    parser.add_argument("--temperature", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    rows = []
    for dataset, pattern in [("chirps_v3", args.chirps), ("era5_land_cds", args.temperature)]:
        for cell_id, entry in read_files(pattern, dataset).items():
            annual, monthly = summarize(entry, dataset)
            west, east, south, north, yc, xc = entry["bounds"]
            is_rain = dataset == "chirps_v3"
            source = dict(model=dataset, dataset="CHIRPS v3 / Climate Hazards Center" if is_rain else "Copernicus ERA5-Land / ECMWF",
                spatial_resolution="0.05°" if is_rain else "0.1° (CDS regular download grid; native ~9 km)",
                variables=["precipitation_sum"] if is_rain else ["temperature_2m_mean", "temperature_2m_min", "temperature_2m_max"],
                status="success" if all(a["reliable"] for a in annual) else "partial",
                attribution_url="https://chc.ucsb.edu/data/chirps3" if is_rain else "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land",
                licence="CC BY 4.0; retain source citation and applicable accepted terms", period=dict(start=START, end=END),
                aggregation="Monthly precipitation totals; valid_months are observed samples, not days" if is_rain else "Hourly 2m temperature; UTC daily mean/min/max, >=22 hours; monthly/annual >=90% days",
                input_files=entry["files"])
            rows.append(dict(dataset=dataset, grid_version=f"{dataset}-native-local-files-v1", cell_id=cell_id,
                start_date=START, end_date=END, west=west, east=east, south=south, north=north,
                center_latitude=yc, center_longitude=xc, payload=dict(source=source, annual=annual, monthly=monthly)))
    with open(args.output, "w") as f:
        for row in rows:
            f.write(json.dumps(row, allow_nan=False) + "\n")
    print(f"Prepared {len(rows)} real-file cell summaries locally. Hosted import has NOT been performed.")


if __name__ == "__main__":
    main()