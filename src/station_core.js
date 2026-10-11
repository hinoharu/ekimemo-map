// ---------------------------------------------------------------------------
// R_k(s): the area where station s is among the k nearest stations.
// Every metric is reduced to a plane centered at s, in which
//   "x is closer to t than to s"  <=>  a_t · x > c_t   (a half-plane not containing s)
// The boundary of R_k(s) is the k-level of these lines, traced CCW around s,
// switching to the crossing line at every vertex (and following the clip box
// where the region reaches it).
//
// Metrics:
//   "flat"  : (lng, lat) treated as plane coordinates as-is
//   "cos"   : plane with longitude scaled by a fixed cos(36°)
//   "sphere": great-circle distance; gnomonic projection centered at s maps
//             bisecting great circles to straight lines, so the same tracer is exact.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const COS36 = Math.cos(36 * DEG);

function makeIndex(lat, lng) {
  const n = lat.length;
  // uniform grid in degrees over the data bbox
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (let i = 0; i < n; i++) {
    la0 = Math.min(la0, lat[i]); la1 = Math.max(la1, lat[i]);
    lo0 = Math.min(lo0, lng[i]); lo1 = Math.max(lo1, lng[i]);
  }
  const cell = 0.05; // degrees
  const GX = Math.ceil((lo1 - lo0) / cell) + 1, GY = Math.ceil((la1 - la0) / cell) + 1;
  const head = new Int32Array(GX * GY).fill(-1), next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = (((lat[i] - la0) / cell) | 0) * GX + (((lng[i] - lo0) / cell) | 0);
    next[i] = head[c]; head[c] = i;
  }
  // unit vectors for the sphere metric
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = lat[i] * DEG, l = lng[i] * DEG;
    X[i] = Math.cos(p) * Math.cos(l); Y[i] = Math.cos(p) * Math.sin(l); Z[i] = Math.sin(p);
  }
  return { n, lat, lng, la0, la1, lo0, lo1, cell, GX, GY, head, next, X, Y, Z };
}

// Local frame for station s under a metric: maps stations to lines and points back to lat/lng.
// clipDeg: half-width of the square clip window around s (degrees); 0 = whole-Japan window
function frameOf(idx, s, metric, clipDeg = 3) {
  const { lat, lng, X, Y, Z } = idx;
  if (metric === "sphere") {
    const sx = X[s], sy = Y[s], sz = Z[s];
    const l = lng[s] * DEG, p = lat[s] * DEG;
    const e1 = [-Math.sin(l), Math.cos(l), 0];                                   // east
    const e2 = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)]; // north
    const H = Math.tan((clipDeg > 0 ? clipDeg : 30) * DEG); // clip: gnomonic square
    return {
      box: [-H, H, -H, H],
      line(t) { // closer to t: x·(t − s) > 0 with x ∝ s + u e1 + v e2
        const tx = X[t], ty = Y[t], tz = Z[t];
        return [e1[0] * tx + e1[1] * ty, e2[0] * tx + e2[1] * ty + e2[2] * tz, 1 - (sx * tx + sy * ty + sz * tz)];
      },
      toLatLng(u, v) {
        const x = sx + u * e1[0] + v * e2[0], y = sy + u * e1[1] + v * e2[1], z = sz + v * e2[2];
        const r = Math.hypot(x, y, z);
        return [Math.asin(z / r) / DEG, Math.atan2(y, x) / DEG];
      },
      toLocal(la, lo) { // inverse of toLatLng (gnomonic projection centered at s)
        const p = la * DEG, l = lo * DEG;
        const x = Math.cos(p) * Math.cos(l), y = Math.cos(p) * Math.sin(l), z = Math.sin(p);
        const w = x * sx + y * sy + z * sz;
        return [(x * e1[0] + y * e1[1]) / w, (x * e2[0] + y * e2[1] + z * e2[2]) / w];
      },
      // line distance from s in local units -> half angular distance; reach in degrees for lookup
      lookupDeg(delta) { return 2 * Math.atan(delta) / DEG; },
      edgeStep: 0.0015,
    };
  }
  const fx = metric === "cos" ? COS36 : 1;
  const s0 = lng[s], s1 = lat[s];
  return {
    box: clipDeg > 0 ? [-clipDeg, clipDeg, -clipDeg, clipDeg]
                     : [118 * fx - s0 * fx, 154 * fx - s0 * fx, 18 - s1, 50 - s1],
    line(t) {
      const ax = (lng[t] - s0) * fx, ay = lat[t] - s1;
      return [ax, ay, 0.5 * (ax * ax + ay * ay)];
    },
    toLatLng(u, v) { return [s1 + v, s0 + u / fx]; },
    toLocal(la, lo) { return [(lo - s0) * fx, la - s1]; },
    lookupDeg(delta) { return 2 * delta; }, // |t − s| = 2·delta (in plane units ≥ degrees of lat)
    edgeStep: 0.05,
    fx,
  };
}

// candidates t ≠ s whose line lies within distance dMax of s, sorted by that distance
function candidates(idx, s, F, dMax, metric) {
  const { lat, lng, la0, lo0, cell, GX, GY, head, next } = idx;
  const R = F.lookupDeg(dMax);
  const cosLat = Math.cos(Math.min(89, Math.abs(lat[s]) + R) * DEG);
  const Rlng = metric === "sphere" ? R / Math.max(0.05, cosLat) : R / (F.fx || 1);
  const y0 = Math.max(0, Math.floor((lat[s] - R - la0) / cell)), y1 = Math.min(GY - 1, Math.floor((lat[s] + R - la0) / cell));
  const x0 = Math.max(0, Math.floor((lng[s] - Rlng - lo0) / cell)), x1 = Math.min(GX - 1, Math.floor((lng[s] + Rlng - lo0) / cell));
  const out = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    for (let t = head[cy * GX + cx]; t !== -1; t = next[t]) {
      if (t === s) continue;
      const L = F.line(t);
      const nrm = Math.hypot(L[0], L[1]);
      if (!(L[2] > 0) || nrm === 0) continue; // same position or antipodal side: ignore
      const d = L[2] / nrm;
      if (d <= dMax) out.push([d, t, L[0], L[1], L[2]]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

// k-level tracer in the local plane (origin = s). lines: array of [d, t, ax, ay, c]
// Near-degenerate vertices (3+ lines through almost one point, e.g. 4 nearly cocircular
// stations) can send the walk off the level. traceOnce gives up (returns null) when
//   - two crossings along an edge are closer than TIE (an ambiguous vertex), or
//   - the polar angle decreases / exceeds one turn (impossible for a star-shaped region),
//   - or the walk does not close.
// We then retry with every line shifted by a tiny random distance (in local plane units,
// ~degrees: 1e-9° ≈ 0.1 mm on the ground), which breaks the ties.
const TIE = 1e-11;
function traceLevel(lines, m, k, box) {
  for (const jitter of [0, 1e-9, 1e-8, 1e-7, 1e-6]) {
    const r = traceOnce(lines, m, k, box, jitter);
    if (r) return r;
  }
  return traceOnce(lines, m, k, box, 1e-6, true);
}

function traceOnce(lines, m, k, box, jitter, force) {
  const ax = new Float64Array(m), ay = new Float64Array(m), c = new Float64Array(m);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
  for (let q = 0; q < m; q++) {
    ax[q] = lines[q][2]; ay[q] = lines[q][3];
    c[q] = lines[q][4] + (jitter ? jitter * Math.hypot(ax[q], ay[q]) * rnd() : 0); // shift by ~jitter distance
  }
  const [xmin, xmax, ymin, ymax] = box;
  const WD = { "-1": [1, 0], "-2": [0, 1], "-3": [-1, 0], "-4": [0, -1] };
  const NW = { "-1": -2, "-2": -3, "-3": -4, "-4": -1 };
  const EPS = 1e-13;
  function wallExit(px, py, dx, dy) {
    let t = Infinity, w = 0;
    if (dx > 0) { const tt = (xmax - px) / dx; if (tt < t) { t = tt; w = -2; } }
    if (dx < 0) { const tt = (xmin - px) / dx; if (tt < t) { t = tt; w = -4; } }
    if (dy > 0) { const tt = (ymax - py) / dy; if (tt < t) { t = tt; w = -3; } }
    if (dy < 0) { const tt = (ymin - py) / dy; if (tt < t) { t = tt; w = -1; } }
    return [t, w];
  }
  const ts = [];
  for (let q = 0; q < m; q++) if (ax[q] > 0) ts.push([c[q] / ax[q], q]);
  ts.sort((a, b) => a[0] - b[0]);
  let px, py, edge, count;
  if (ts.length >= k && ts[k - 1][0] < xmax) { px = ts[k - 1][0]; py = 0; edge = ts[k - 1][1]; count = k - 1; }
  else { px = xmax; py = 0; edge = -2; count = 0; while (count < ts.length && ts[count][0] < xmax) count++; }
  const sX = px, sY = py, sE = edge;
  const verts = [[px, py]];
  const maxSteps = 20 * m + 2000;
  // The line we just left passes through the current vertex; rounding can make it reappear
  // at t ≈ +1e-12 and cause a bogus zero-length edge, so it is always excluded explicitly.
  let from = -999;
  let closed = false;
  // R_k(s) is star-shaped from s, so the polar angle must only increase along a correct walk.
  let ang = Math.atan2(py, px), turned = 0;
  for (let step = 0; step < maxSteps; step++) {
    let dx, dy;
    if (edge >= 0) { dx = -ay[edge]; dy = ax[edge]; } else { [dx, dy] = WD[edge]; }
    const dd = dx * dx + dy * dy;
    const closes = (tN) => {
      if (step === 0 || edge !== sE) return false;
      const t0 = ((sX - px) * dx + (sY - py) * dy) / dd;
      return t0 > -1e-12 && t0 <= tN + 1e-12;
    };
    if (edge >= 0) {
      let tB = Infinity, tB2 = Infinity, lB = -1;
      for (let q = 0; q < m; q++) {
        if (q === edge || q === from) continue;
        const den = ax[q] * dx + ay[q] * dy;
        if (den === 0) continue;
        const t = (c[q] - ax[q] * px - ay[q] * py) / den;
        if (t > EPS && t < tB2) { if (t < tB) { tB2 = tB; tB = t; lB = q; } else tB2 = t; }
      }
      const [tw, w] = wallExit(px, py, dx, dy);
      if (!force && tB < tw && (tB2 - tB) * Math.sqrt(dd) < TIE) return null; // ambiguous vertex
      if (closes(Math.min(tB, tw))) { closed = true; break; }
      from = edge;
      if (tw <= tB) { px += tw * dx; py += tw * dy; edge = w; count = k - 1; }
      else { px += tB * dx; py += tB * dy; edge = lB; }
    } else {
      const [tc] = wallExit(px, py, dx, dy);
      const cr = [];
      for (let q = 0; q < m; q++) {
        if (q === from) continue;
        const den = ax[q] * dx + ay[q] * dy;
        if (den === 0) continue;
        const t = (c[q] - ax[q] * px - ay[q] * py) / den;
        if (t > EPS && t < tc) cr.push([t, q, den > 0 ? 1 : -1]);
      }
      cr.sort((a, b) => a[0] - b[0]);
      let ne = NW[edge], tS = tc, cnt = count;
      for (let j = 0; j < cr.length; j++) {
        const [t, q, sg] = cr[j];
        cnt += sg;
        if (cnt >= k) {
          if (!force && j + 1 < cr.length && (cr[j + 1][0] - t) * Math.sqrt(dd) < TIE) return null; // ambiguous
          tS = t; ne = q; break;
        }
      }
      if (closes(tS)) { closed = true; break; }
      count = cnt; px += tS * dx; py += tS * dy; from = ne >= 0 ? -999 : edge; edge = ne;
    }
    verts.push([px, py]);
    const a2 = Math.atan2(py, px);
    let da = a2 - ang; if (da > Math.PI) da -= 2 * Math.PI; if (da <= -Math.PI) da += 2 * Math.PI;
    ang = a2; turned += da;
    if (!force && (da < -1e-9 || turned > 2 * Math.PI + 1e-6)) return null;
  }
  return closed || force ? verts : null;
}

// Main entry: region of station s for order k under a metric.
// Returns { latlng: [[lat,lng],...] (densified), local, lines, rounds, ms }
function regionOf(idx, s, k, metric, clipDeg = 3) {
  const t0 = (typeof performance !== "undefined" ? performance : Date).now();
  const F = frameOf(idx, s, metric, clipDeg);
  // initial lookup radius: grow until we have about 8k candidates
  let dMax = metric === "sphere" ? 0.002 : 0.1, cand;
  for (;;) {
    cand = candidates(idx, s, F, dMax, metric);
    if (cand.length >= 8 * k + 8 || cand.length >= idx.n - 1 || dMax > 5) break;
    dMax *= 2;
  }
  // Start with the ~8k nearest lines, then add only lines that actually cut the current region.
  // The current region contains the true one, and a line can matter only if its half-plane
  // contains a point of the region, hence a vertex of the region's convex hull.
  let used = cand.slice(0, Math.min(cand.length, 8 * k + 8));
  const inUse = new Set(used.map(r => r[1]));
  let poly, rounds = 0;
  for (;;) {
    rounds++;
    poly = traceLevel(used, used.length, k, F.box);
    let rho = 0;
    for (const [u, v] of poly) rho = Math.max(rho, Math.hypot(u, v));
    if (rho > dMax) { dMax = rho * 1.02; cand = candidates(idx, s, F, dMax, metric); }
    const hull = convexHull(poly);
    const add = [];
    for (const r of cand) {
      if (r[0] > rho) break;
      if (inUse.has(r[1])) continue;
      const ax = r[2], ay = r[3], c = r[4];
      for (let h = 0; h < hull.length; h++) {
        if (ax * hull[h][0] + ay * hull[h][1] > c) { add.push(r); break; }
      }
    }
    if (!add.length) break;
    for (const r of add) { used.push(r); inUse.add(r[1]); }
  }
  const m = used.length;
  // The walk starts where the k-th line crosses the +x ray: a point inside an edge, not a vertex
  // (it showed up as one extra vertex). Drop it when it is collinear with its neighbours.
  if (poly.length > 3) {
    const n = poly.length, [x0, y0] = poly[0], [xa, ya] = poly[n - 1], [xb, yb] = poly[1];
    const cr = (xa - x0) * (yb - y0) - (ya - y0) * (xb - x0);
    if (Math.abs(cr) <= 1e-9 * Math.hypot(xa - x0, ya - y0) * Math.hypot(xb - x0, yb - y0)) poly = poly.slice(1);
  }
  // densify edges (straight in the local plane) and map back to lat/lng
  const out = [];
  for (let q = 0; q < poly.length; q++) {
    const [u0, v0] = poly[q], [u1, v1] = poly[(q + 1) % poly.length];
    const segs = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / F.edgeStep));
    for (let j = 0; j < segs; j++) out.push(F.toLatLng(u0 + (u1 - u0) * j / segs, v0 + (v1 - v0) * j / segs));
  }
  const t1 = (typeof performance !== "undefined" ? performance : Date).now();
  return { latlng: out, local: poly, lines: m, rounds, ms: t1 - t0, used: used.map(r => r[1]) };
}

function convexHull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// distance used for ranking (monotone in the metric's true distance)
function distKey(idx, metric, la, lo, t) {
  if (metric === "sphere") {
    const p = la * DEG, l = lo * DEG;
    const x = Math.cos(p) * Math.cos(l), y = Math.cos(p) * Math.sin(l), z = Math.sin(p);
    return -(x * idx.X[t] + y * idx.Y[t] + z * idx.Z[t]);
  }
  const fx = metric === "cos" ? COS36 : 1;
  const dx = (idx.lng[t] - lo) * fx, dy = idx.lat[t] - la;
  return dx * dx + dy * dy;
}

if (typeof module !== "undefined") module.exports = { makeIndex, regionOf, distKey, frameOf, candidates, traceLevel };
