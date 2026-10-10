// Track pieces on a grid, collision checks and an auto-complete search. Pure logic (no three.js): tools/test.mjs runs it in Node.
// Units: metres. A tile is 4 m. The cursor sits on a tile edge (where the next piece starts).

export const T = 4;
export const RATE = { '-2': -1.5, '-1': -0.5, 0: 0, 1: 0.5, 2: 1.5 };       // rise per metre for each slope state
export const STATION = { x0: -6, x1: 6, z: 0, y: 1 };
export const BOUNDS = { xz: 96, yMax: 70, yMin: 0.4 };
const FWD = [[1, 0], [0, 1], [-1, 0], [0, -1]];                                 // dir 0 east, 1 south, 2 west, 3 north; dir + 1 = right

export const startCursor = () => ({ x: STATION.x1, z: STATION.z, y: STATION.y, dir: 0, slope: 0 });
export const TARGET = { x: STATION.x0, z: STATION.z, y: STATION.y, dir: 0, slope: 0 };

// piece types the player can place. U / D pitch the track one step up or down from the current slope.
export const TYPES = ['S', 'U', 'D', 'L', 'R', 'LL', 'RR', 'O', 'B', 'K'];
export const FLAT_ONLY = new Set(['L', 'R', 'LL', 'RR', 'O', 'B', 'K']);

const sq = (u) => u * u;
const line = (n, fn) => { const a = []; for (let i = 0; i <= n; i++) a.push(fn(i / n)); return a; };

// returns { to: slope after, pts: [{ f, s, h, bank }] in the piece's local frame, turn } or null if not allowed here
export function resolve(type, slope) {
  if (FLAT_ONLY.has(type) && slope !== 0) return null;
  switch (type) {
    case 'S': case 'B': case 'K': {
      const r = RATE[slope];
      return { to: slope, turn: 0, pts: line(slope ? 10 : 6, (u) => ({ f: T * u, s: 0, h: r * T * u, bank: 0 })) };
    }
    case 'U': {
      // transitions are 2 tiles long so the curve is gentle (Hermite curves matching the slopes at both ends)
      const H = { 0: [1, (u) => 2 * sq(u)], 1: [2, (u) => 4 * u + 4 * u * u], '-1': [0, (u) => -(4 * u - 2 * u * u)], '-2': [-1, (u) => -(12 * u - 4 * u * u)] }[slope];
      if (!H) return null;
      return { to: H[0], turn: 0, pts: line(24, (u) => ({ f: 2 * T * u, s: 0, h: H[1](u), bank: 0 })) };
    }
    case 'D': {
      const H = { 0: [-1, (u) => -2 * sq(u)], '-1': [-2, (u) => -(4 * u + 4 * u * u)], 1: [0, (u) => 4 * u - 2 * u * u], 2: [1, (u) => 12 * u - 4 * u * u] }[slope];
      if (!H) return null;
      return { to: H[0], turn: 0, pts: line(24, (u) => ({ f: 2 * T * u, s: 0, h: H[1](u), bank: 0 })) };
    }
    case 'L': case 'R': case 'LL': case 'RR': {
      const R = type.length === 1 ? 1.5 * T : 2.5 * T, side = type[0] === 'R' ? 1 : -1;
      // a quarter superellipse (|x|^3 + |y|^3 = R^3): same ends as a circle, but the curve eases in and out, so the bank can follow it
      const e = 2 / 3;
      return { to: 0, turn: side, radius: R * 0.82, pts: line(type.length === 1 ? 24 : 32, (u) => { const a = (u * Math.PI) / 2; return { f: R * Math.pow(Math.sin(a), e), s: side * R * (1 - Math.pow(Math.cos(a), e)), h: 0, bank: side * Math.sin(Math.PI * u) }; }) };
    }
    case 'O': {   // vertical loop: 12 m forward, 14 m tall; a small sideways weave so the way out passes beside the way in
      const L = 3 * T, R = 7, W = 1.2;
      // forward L*u plus a circular swing (moving backwards over the top), height up and around, sideways weave
      return { to: 0, turn: 0, loop: true, pts: line(90, (u) => ({ f: L * u + R * Math.sin(2 * Math.PI * u), s: W * Math.sin(2 * Math.PI * u) * sq(Math.sin(Math.PI * u)), h: R * (1 - Math.cos(2 * Math.PI * u)), bank: 0 })) };
    }
    default: return null;
  }
}

// place one piece at a cursor -> world points + new cursor
export function place(cur, piece) {
  const r = resolve(piece.t, cur.slope);
  if (!r) return null;
  const [fx, fz] = FWD[cur.dir], [rx, rz] = FWD[(cur.dir + 1) % 4];
  const bankMax = r.loop ? 0 : piece.bankAngle !== undefined ? piece.bankAngle : r.turn ? 0.6 : 0;   // turns are banked; the ride sets the angle from the speed
  const pts = r.pts.map((p) => ({ x: cur.x + fx * p.f + rx * p.s, z: cur.z + fz * p.f + rz * p.s, y: cur.y + p.h, bank: p.bank * bankMax }));
  const e = pts[pts.length - 1];
  const rnd = (v) => Math.round(v * 1e4) / 1e4;
  const end = { x: rnd(e.x), z: rnd(e.z), y: rnd(e.y), dir: (cur.dir + r.turn + 4) % 4, slope: r.to };
  return { pts, end, loop: !!r.loop, radius: r.radius || 0, turn: r.turn };
}

const same = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01 && Math.abs(a.y - b.y) < 0.01 && a.dir === b.dir && a.slope === b.slope;

// dense samples (about every metre) used for collision checks
function dense(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.8));
    for (let k = 0; k < n; k++) { const t = k / n; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const cellKey = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
const CLEAR = 4;

export class Occupancy {
  constructor() { this.m = new Map(); }
  add(samples, seg) { for (const p of samples) { const k = cellKey(p.x, p.z); if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push({ y: p.y, seg }); } }
  // first sample hitting another segment (ignoring the given segment ids), else null
  hit(samples, ignore) {
    for (const p of samples) {
      const a = this.m.get(cellKey(p.x, p.z));
      if (!a) continue;
      for (const q of a) if (!ignore.has(q.seg) && Math.abs(q.y - p.y) < CLEAR) return p;
    }
    return null;
  }
}

export function stationPoints() { return line(12, (u) => ({ x: STATION.x0 + (STATION.x1 - STATION.x0) * u, z: STATION.z, y: STATION.y, bank: 0 })); }

// check one placement against bounds / ground / existing track. Returns an error key or null.
function problem(pl, occ, ignore) {
  for (const p of pl.pts) {
    if (Math.abs(p.x) > BOUNDS.xz || Math.abs(p.z) > BOUNDS.xz) return 'bounds';
    if (p.y < BOUNDS.yMin - 1e-6) return 'ground';
    if (p.y > BOUNDS.yMax) return 'high';
  }
  const hit = occ.hit(dense(pl.pts).filter((p) => !nearStationEnds(p)), ignore);
  return hit ? 'collide' : null;
}
const nearStationEnds = (p) => Math.abs(p.z - STATION.z) < 2.5 && Math.abs(p.y - STATION.y) < 3 && (Math.abs(p.x - STATION.x0) < 2.5 || Math.abs(p.x - STATION.x1) < 2.5);

// build a whole layout. pieces: [{ t, chain, bank }]. Stops at the first piece that cannot be placed.
export function build(pieces) {
  const occ = new Occupancy();
  occ.add(dense(stationPoints()), -1);
  const segs = [];
  let cur = startCursor(), closed = false, error = null;
  for (let i = 0; i < pieces.length; i++) {
    const pc = pieces[i];
    if (closed) { error = { i, key: 'closed' }; break; }
    const pl = place(cur, pc);
    if (!pl) { error = { i, key: 'slope' }; break; }
    const err = problem(pl, occ, new Set([i - 1]));
    if (err) { error = { i, key: err }; break; }
    occ.add(dense(pl.pts), i);
    segs.push({ ...pc, i, pts: pl.pts, start: cur, end: pl.end, loop: pl.loop, radius: pl.radius });
    cur = pl.end;
    if (same(cur, TARGET)) closed = true;
  }
  return { segs, cursor: cur, closed, error, occ };
}

// would this piece fit next? (for greying out buttons and the preview)
export function tryNext(layout, piece) {
  if (layout.closed) return { ok: false, key: 'closed' };
  const pl = place(layout.cursor, piece);
  if (!pl) return { ok: false, key: 'slope' };
  const err = problem(pl, layout.occ, new Set([layout.segs.length - 1]));
  return { ok: !err, key: err, pl };
}

// ------------------------------------------------------------------ auto-complete: weighted A* back to the station
const AUTO_TYPES = ['S', 'U', 'D', 'L', 'R', 'LL', 'RR'];
export function autoComplete(layout, maxExpand = 40000) {
  if (layout.closed) return [];
  // when level: start with brakes so the train comes home gently, and then never climb again (a slow train cannot)
  const lead = [];
  let base = layout;
  if (layout.cursor.slope === 0 && layout.segs.length && !layout.segs.slice(-2).every((s) => s.t === 'K')) {
    for (const t of ['K', 'K']) { const tn = tryNext(base, { t }); if (!tn.ok) break; lead.push({ t }); base = build(layout.segs.map((s) => ({ t: s.t, chain: s.chain })).concat(lead)); }
  }
  const rest = search(base, maxExpand, lead.length > 0);
  return rest ? lead.concat(rest) : lead.length ? search(layout, maxExpand, false) : null;
}

function search(layout, maxExpand, noClimb) {
  const start = layout.cursor;
  const key = (c) => `${Math.round(c.x * 10)},${Math.round(c.z * 10)},${Math.round(c.y * 10)},${c.dir},${c.slope}`;
  const hfn = (c) => Math.abs(c.x - TARGET.x) + Math.abs(c.z - TARGET.z) + Math.abs(c.y - TARGET.y) * 1.3 + (c.slope ? 3 : 0)
    + (c.dir !== TARGET.dir ? 6 : 0);
  const open = [{ c: start, g: 0, f: hfn(start), parent: null, t: null, dense: null }];
  const seen = new Map([[key(start), 0]]);
  let n = 0;
  const lastSeg = layout.segs.length - 1;
  while (open.length && n < maxExpand) {
    // pop best (binary heap would be faster; the open list stays small enough with a weighted heuristic)
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const node = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    n++;
    if (same(node.c, TARGET)) {
      const out = []; for (let x = node; x.parent; x = x.parent) out.unshift({ t: x.t });
      return out;
    }
    for (const t of AUTO_TYPES) {
      if (noClimb && t === 'U' && node.c.slope >= 0) continue;
      const pl = place(node.c, { t });
      if (!pl) continue;
      // bounds / ground / existing track
      let bad = false;
      for (const p of pl.pts) if (Math.abs(p.x) > BOUNDS.xz || Math.abs(p.z) > BOUNDS.xz || p.y < BOUNDS.yMin - 1e-6 || p.y > BOUNDS.yMax) { bad = true; break; }
      if (bad) continue;
      const d = dense(pl.pts).filter((p) => !nearStationEnds(p));
      if (layout.occ.hit(d, new Set(node.parent ? [] : [lastSeg]))) continue;
      // our own new path (skip the parent piece we join)
      let selfHit = false;
      for (let a = node.parent; a && !selfHit; a = a.parent) {
        if (!a.dense) continue;
        for (const p of d) { for (const q of a.dense) if (Math.abs(p.x - q.x) < 1.6 && Math.abs(p.z - q.z) < 1.6 && Math.abs(p.y - q.y) < CLEAR) { selfHit = true; break; } if (selfHit) break; }
      }
      if (selfHit) continue;
      const len = pl.pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pl.pts[i - 1].x, p.y - pl.pts[i - 1].y, p.z - pl.pts[i - 1].z) : 0), 0);
      const g = node.g + len + (t === 'L' || t === 'R' ? 10 : 0);   // prefer wide turns: kinder at speed
      const k = key(pl.end);
      if (seen.has(k) && seen.get(k) <= g) continue;
      seen.set(k, g);
      open.push({ c: pl.end, g, f: g + 1.6 * hfn(pl.end), parent: node, t, dense: node === null ? null : dense(pl.pts) });
    }
  }
  return null;
}
