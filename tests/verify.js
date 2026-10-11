// Correctness + speed check for src/station_core.js against brute-force ranking.
// Run after `python3 scripts/build.py` (which writes build/stations.json).
//   node tests/verify.js            # standard run (~30 s)
//   node tests/verify.js --quick    # fewer samples
//   node tests/verify.js --seed=123  # different random stations/points
const path = require("path");
const C = require(path.join(__dirname, "..", "src", "station_core.js"));
const rows = require(path.join(__dirname, "..", "build", "stations.json"));

const quick = process.argv.includes("--quick");
const lat = Float64Array.from(rows.map(r => r[4])), lng = Float64Array.from(rows.map(r => r[5]));
const idx = C.makeIndex(lat, lng), n = rows.length;

function inPoly(x, y, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const seedArg = process.argv.find(a => a.startsWith("--seed="));
let seed = seedArg ? +seedArg.slice(7) : 20261009;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const STATIONS = quick ? 40 : 120, POINTS = quick ? 30 : 60;
let failed = 0;
for (const metric of ["flat", "cos", "sphere"]) {
  for (const k of [1, 18, 50]) {
    let bad = 0, tot = 0, ms = 0, worst = 0;
    for (let q = 0; q < STATIONS; q++) {
      const s = (rnd() * n) | 0;
      const R = C.regionOf(idx, s, k, metric, 3);
      ms += R.ms; worst = Math.max(worst, R.ms);
      // test in the local plane, where the traced polygon is exact (edges are straight there)
      const F = C.frameOf(idx, s, metric, 3), P = R.local;
      for (let w = 0; w < POINTS; w++) {
        const span = k === 1 ? 0.1 : 0.6;
        const la = lat[s] + (rnd() - 0.5) * span, lo = lng[s] + (rnd() - 0.5) * span;
        const ds = C.distKey(idx, metric, la, lo, s);
        let closer = 0;
        for (let t = 0; t < n; t++) if (t !== s && C.distKey(idx, metric, la, lo, t) < ds) closer++;
        tot++;
        const [u, v] = F.toLocal(la, lo);
        if ((closer <= k - 1) !== inPoly(u, v, P)) bad++;
      }
    }
    const ok = bad === 0;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${metric.padEnd(6)} k=${String(k).padEnd(3)} mismatches ${bad}/${tot}  avg ${(ms / STATIONS).toFixed(2)} ms  max ${worst.toFixed(1)} ms`);
  }
}
// voronoiCells (all order-1 regions at once from a Delaunay triangulation) must equal regionOf(…, k = 1)
// wherever it gives a cell: same vertex count, every vertex within 1e-9 (every station; --quick: every 10th)
const Delaunator = require(path.join(__dirname, "..", "src", "vendor", "delaunator.min.js"));
for (const metric of ["flat", "cos"]) {
  const V = C.voronoiCells(Delaunator, idx, metric, 3);
  let tot = 0, same = 0, worst = 0;
  for (let s = 0; s < n; s += quick ? 10 : 1) {
    const cell = V.cells[s]; if (!cell) continue;
    tot++;
    const A = C.regionOf(idx, s, 1, metric, 3).local;
    let d = A.length === cell.length ? 0 : Infinity;
    for (const [u, v] of A) { let m = Infinity; for (const [x, y] of cell) m = Math.min(m, Math.hypot(u - x, v - y)); d = Math.max(d, m); }
    if (d < 1e-9) { same++; worst = Math.max(worst, d); } else if (tot - same <= 3) console.error(`  cell of ${rows[s][2]} (${metric}) differs from regionOf: ${A.length} vs ${cell.length} vertices, ${d}`);
  }
  const ok = same === tot && V.used > n * 0.98;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${metric.padEnd(6)} cells  same as regionOf ${same}/${tot}  (cells for ${V.used}/${n} stations, built in ${V.ms.toFixed(0)} ms, max diff ${worst.toExponential(1)})`);
}

if (failed) { console.error(`${failed} case(s) failed`); process.exit(1); }
console.log("all checks passed");
