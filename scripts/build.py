#!/usr/bin/env python3
"""Build dist/index.html from src/ and the station data.

Usage:
  python3 scripts/build.py            # use data/station.csv as-is (offline, reproducible)
  python3 scripts/build.py --fetch    # download the latest main-dataset CSV first, then build
                                      # (falls back to data/station.csv if the download fails)

Only the Python standard library is used.
"""
import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DATA = ROOT / "data"
DIST = ROOT / "dist"

RAW = "https://raw.githubusercontent.com/Seo-4d696b75/station_database/main"
CSV_URL = f"{RAW}/out/main/station.csv"
INFO_URL = f"{RAW}/latest_info.json"


def fetch_latest() -> bool:
    try:
        with urllib.request.urlopen(INFO_URL, timeout=30) as r:
            version = str(json.load(r)["version"])
        with urllib.request.urlopen(CSV_URL, timeout=60) as r:
            text = r.read().decode("utf-8")
        rows = list(csv.DictReader(io.StringIO(text)))
        if len(rows) < 1000:
            raise ValueError(f"only {len(rows)} rows")
        (DATA / "station.csv").write_text(text, encoding="utf-8")
        (DATA / "VERSION").write_text(version + "\n", encoding="utf-8")
        print(f"fetched station.csv version {version} ({len(rows)} stations)")
        return True
    except Exception as e:  # network errors, format changes
        print(f"WARNING: could not fetch latest data ({e}); using data/station.csv", file=sys.stderr)
        return False


def load_rows():
    """Embedded row format: [id, code, name, name_kana, lat, lng, closed(0/1), prefecture]"""
    rows = []
    with open(DATA / "station.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            rows.append([
                int(r["id"]), int(r["code"]), r["name"], r.get("name_kana", ""),
                float(r["lat"]), float(r["lng"]),
                1 if r["closed"] in ("1", "true", "True") else 0,
                int(r["prefecture"]),
            ])
    return rows


def main():
    if "--fetch" in sys.argv:
        fetch_latest()
    rows = load_rows()
    version = (DATA / "VERSION").read_text(encoding="utf-8").strip()
    template = (SRC / "index.template.html").read_text(encoding="utf-8")
    core = (SRC / "station_core.js").read_text(encoding="utf-8")
    for ph in ("/*CORE*/", "/*DATA*/", "/*VERSION*/"):
        if template.count(ph) != 1:
            sys.exit(f"template must contain exactly one {ph}")
    data = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    html = template.replace("/*CORE*/", core).replace("/*VERSION*/", version).replace("/*DATA*/", data)
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    # rows as JSON for tests (not deployed)
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "stations.json").write_text(data, encoding="utf-8")
    print(f"built dist/index.html ({len(html):,} bytes, {len(rows):,} stations, data {version})")


if __name__ == "__main__":
    main()
