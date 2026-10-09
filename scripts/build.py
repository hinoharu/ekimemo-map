#!/usr/bin/env python3
"""Build dist/index.html from src/ and the station data.

Usage:
  python3 scripts/build.py            # use data/station.csv and data/lines.json as-is (offline, reproducible)
  python3 scripts/build.py --fetch    # download the latest main-dataset stations and lines first, then build
                                      # (falls back to the files in data/ if a download fails)

Outputs: dist/index.html (stations embedded) and dist/lines.json (railway lines, loaded by the page
only when the railways are drawn), plus build/stations.json for the tests.

Only the Python standard library is used.
"""
import csv
import io
import json
import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DATA = ROOT / "data"
DIST = ROOT / "dist"

RAW = "https://raw.githubusercontent.com/Seo-4d696b75/station_database/main"
CSV_URL = f"{RAW}/out/main/station.csv"
INFO_URL = f"{RAW}/latest_info.json"
LINE_URL = f"{RAW}/out/main/line.csv"
POLYLINE_URL = RAW + "/out/main/polyline/{code}.json"
SIMPLIFY_DEG = 1e-4  # max deviation when simplifying line shapes (~10 m)


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


def simplify(pts, tol):
    """Douglas-Peucker (iterative); pts = [(lng, lat), ...] in degrees."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        dx, dy = pts[b][0] - ax, pts[b][1] - ay
        l2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
            d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2
            if d > best:
                best, bi = d, i
        if best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def fetch_lines(version) -> bool:
    """data/lines.json: {"version", "lines": [[code, name, color or null, [segment, ...]], ...]}
    Each segment is delta-encoded integers in 1e-5 degrees: [lng0, lat0, dlng1, dlat1, ...]."""
    try:
        with urllib.request.urlopen(LINE_URL, timeout=60) as r:
            meta = list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
        if len(meta) < 100:
            raise ValueError(f"only {len(meta)} lines")

        def get(code):
            try:
                with urllib.request.urlopen(POLYLINE_URL.format(code=code), timeout=60) as r:
                    return code, json.load(r)
            except Exception:
                return code, None  # some lines have no shape

        with ThreadPoolExecutor(8) as ex:
            shapes = dict(ex.map(get, [m["code"] for m in meta]))
        lines, missing = [], 0
        for m in meta:
            g = shapes.get(m["code"])
            if not g:
                missing += 1
                continue
            segs = []
            for f in g.get("features", []):
                geom = f.get("geometry") or {}
                parts = [geom["coordinates"]] if geom.get("type") == "LineString" else geom.get("coordinates", []) if geom.get("type") == "MultiLineString" else []
                for part in parts:
                    enc, px, py = [], 0, 0
                    for x, y in simplify([(p[0], p[1]) for p in part], SIMPLIFY_DEG):
                        X, Y = round(x * 1e5), round(y * 1e5)
                        enc += [X - px, Y - py]
                        px, py = X, Y
                    if len(enc) >= 4:
                        segs.append(enc)
            color = m.get("color") or ""
            lines.append([int(m["code"]), m["name"], color if color.startswith("#") else None, segs])
        if len(lines) < 100:
            raise ValueError(f"only {len(lines)} lines with shapes")
        text = json.dumps({"version": version, "lines": lines}, ensure_ascii=False, separators=(",", ":"))
        (DATA / "lines.json").write_text(text, encoding="utf-8")
        print(f"fetched lines version {version} ({len(lines)} lines, {missing} without shape, {len(text):,} bytes)")
        return True
    except Exception as e:  # network errors, format changes
        print(f"WARNING: could not fetch line shapes ({e}); using data/lines.json", file=sys.stderr)
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
    if "--fetch" in sys.argv:
        fetch_lines(version)
    template = (SRC / "index.template.html").read_text(encoding="utf-8")
    core = (SRC / "station_core.js").read_text(encoding="utf-8")
    for ph in ("/*CORE*/", "/*DATA*/", "/*VERSION*/"):
        if template.count(ph) != 1:
            sys.exit(f"template must contain exactly one {ph}")
    data = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    html = template.replace("/*CORE*/", core).replace("/*VERSION*/", version).replace("/*DATA*/", data)
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    if (DATA / "lines.json").exists():
        shutil.copyfile(DATA / "lines.json", DIST / "lines.json")
    else:
        print("WARNING: data/lines.json not found; railways cannot be drawn (run with --fetch)", file=sys.stderr)
    # rows as JSON for tests (not deployed)
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "stations.json").write_text(data, encoding="utf-8")
    print(f"built dist/index.html ({len(html):,} bytes, {len(rows):,} stations, data {version})")


if __name__ == "__main__":
    main()
