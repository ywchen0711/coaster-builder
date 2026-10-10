// Ride simulation: resample the layout, build track frames, run the train with energy physics,
// then compute stats, ratings, the super users' reviews and badges. Pure logic (no three.js).
import { stationPoints, STATION, place } from './track.js?v=1';

export const DS = 0.25;           // resample step (m)
const G = 9.81;

// one continuous path: station, then every placed piece. flags per sample: chain / booster / brakes / station
export function buildPath(layout) {
  const raw = [];
  const push = (pts, flag) => pts.forEach((p, i) => { if (raw.length && i === 0) return; raw.push({ ...p, ...flag }); });
  push(stationPoints(), { station: true, seg: -1 });
  layout.segs.forEach((s) => push(s.pts, { chain: !!s.chain, booster: s.t === 'B', brakes: s.t === 'K', seg: s.i, loop: s.loop }));
  // cumulative length
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y, raw[i].z - raw[i - 1].z));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / DS));
  const P = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * L;
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const a = raw[j], b = raw[j + 1], t = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const src = t < 0.5 ? a : b;
    P.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, bank: a.bank + (b.bank - a.bank) * t,
      chain: src.chain, booster: src.booster, brakes: src.brakes, station: src.station, seg: src.seg, loop: src.loop });
  }
  // tangents
  const N = P.length;
  for (let i = 0; i < N; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z, m = Math.hypot(tx, ty, tz) || 1;
    P[i].t = [tx / m, ty / m, tz / m];
  }
  // rotation-minimising frames (double reflection), starting upright, then bank roll
  // outside loops the track's 'up' is simply as upright as possible; inside a loop the frame is carried along
  // (rotation-minimising) so it turns upside down at the top and comes back upright
  let up = [0, 1, 0];
  for (let i = 0; i < N; i++) {
    if (!P[i].loop) {
      const t = P[i].t;
      up = norm(sub([0, 1, 0], mul(t, t[1])));
    } else if (i > 0) {
      const x0 = [P[i - 1].x, P[i - 1].y, P[i - 1].z], x1 = [P[i].x, P[i].y, P[i].z], t0 = P[i - 1].t, t1 = P[i].t;
      const v1 = sub(x1, x0), c1 = dot(v1, v1) || 1e-9;
      const rL = sub(up, mul(v1, (2 / c1) * dot(v1, up))), tL = sub(t0, mul(v1, (2 / c1) * dot(v1, t0)));
      const v2 = sub(t1, tL), c2 = dot(v2, v2) || 1e-9;
      up = norm(sub(rL, mul(v2, (2 / c2) * dot(v2, rL))));
    }
    P[i].up0 = up;
    const right = norm(cross(P[i].t, up));
    const b = P[i].bank || 0;
    P[i].up = norm(add(mul(up, Math.cos(b)), mul(right, Math.sin(b))));
    P[i].right = norm(cross(P[i].t, P[i].up));
  }
  // curvature vector dT/ds over +-4 samples (about a metre: what a whole car feels)
  for (let i = 0; i < N; i++) {
    const a = P[Math.max(0, i - 4)].t, b = P[Math.min(N - 1, i + 4)].t, span = (Math.min(N - 1, i + 4) - Math.max(0, i - 4)) * (L / n);
    P[i].k = mul(sub(b, a), 1 / Math.max(1e-6, span));
  }
  return { P, L, ds: L / n };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

export function sampleAt(path, s) {
  const { P, ds } = path;
  const f = Math.max(0, Math.min(P.length - 1.001, s / ds)), i = Math.floor(f), t = f - i;
  const a = P[i], b = P[i + 1];
  const lerp = (u, v) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, t: norm(lerp(a.t, b.t)), up: norm(lerp(a.up, b.up)), right: norm(lerp(a.right, b.right)), p: t < 0.5 ? a : b };
}

// ------------------------------------------------------------------ the ride
// two passes: ride once to learn the speed in every turn, bank each turn so riders are pushed into their seats
// (tan(bank) = v^2 / (r g)), then ride again for real
export function simulate(layout) {
  const first = ride(layout);
  const speed = {};
  const { P, ds } = first.path;
  for (const f of first.trace) { const p = P[Math.min(P.length - 1, Math.round(f.s / ds))]; if (p.seg >= 0) (speed[p.seg] = speed[p.seg] || []).push(f.v); }
  const segs = layout.segs.map((s) => {
    if (!s.radius) return s;
    const vs = speed[s.i], v = vs ? vs.reduce((a, b) => a + b, 0) / vs.length : 8;
    const bankAngle = Math.min(1.35, Math.atan((v * v) / (s.radius * G)));
    return { ...s, bankAngle, pts: place(s.start, { t: s.t, bankAngle }).pts };
  });
  return ride({ ...layout, segs });
}

function ride(layout) {
  const path = buildPath(layout);
  const { P, L, ds } = path;
  const dt = 1 / 120, frame = 1 / 30;
  let s = (STATION.x1 - STATION.x0) / 2, v = 0, time = 0, nextFrame = 0;
  const trace = [];
  const st = { maxSpeed: 0, maxPosG: 1, minG: 1, maxLatG: 0, airtime: 0, inversions: 0, drops: 0, maxDrop: 0, maxHeight: 0, length: L, duration: 0, turns: 0 };
  const events = [];
  let inverted = false, dropStart = null, lastY = P[0].y, airRun = 0, inStation = true, stalled = null, highG = 0;
  for (const p of P) st.maxHeight = Math.max(st.maxHeight, p.y);
  const segTypes = new Set(layout.segs.filter((x) => x.t === 'L' || x.t === 'R' || x.t === 'LL' || x.t === 'RR').map((x) => x.i));
  st.turns = segTypes.size;
  while (time < 400) {
    const i = Math.min(P.length - 1, Math.max(0, Math.round(s / ds)));
    const p = P[i];
    if (inStation && !p.station) inStation = false;
    let a = -G * p.t[1] - Math.sign(v || 1) * (0.0011 * v * v + 0.12);
    if (p.station) { if (v < 2.5) { v = 2.5; a = Math.max(a, 0); } }
    if (p.chain && v < 3.2) { v = 3.2; a = Math.max(0, a); }
    if (p.booster && v < 27) a += 11;
    if (p.brakes && v > 6) a = Math.min(a, -(v * v - 36) / 8);   // magnetic brakes: down to 6 m/s within one 4 m piece
    v += a * dt; s += v * dt; time += dt;
    if (v <= 0.05 && !p.chain && !p.station) { stalled = { s, x: p.x, y: p.y, z: p.z, seg: p.seg, rollback: true }; break; }
    if (s >= L) { s = L; break; }
    // forces felt by the riders
    const f = add(mul(p.k, v * v), [0, G, 0]);
    const gv = dot(f, p.up) / G, gl = Math.abs(dot(f, p.right) / G);
    if (!p.station) {
      st.maxSpeed = Math.max(st.maxSpeed, v);
      st.maxPosG = Math.max(st.maxPosG, gv); st.minG = Math.min(st.minG, gv); st.maxLatG = Math.max(st.maxLatG, gl);
      if (gv < 0.15) { st.airtime += dt; airRun += dt; if (airRun > 0.35 && !events.some((e) => e.who === 'jeff' && time - e.t < 3)) events.push({ t: time, who: 'jeff', key: 'air' }); } else airRun = 0;
      if (gv > 4 || gl > 1.8) { highG += dt; if (highG > 0.2 && !events.some((e) => e.who === 'erin' && time - e.t < 4)) events.push({ t: time, who: 'erin', key: 'intense' }); } else highG = 0;
    }
    const inv = p.up[1] < -0.3;
    if (inv && !inverted) { st.inversions++; events.push({ t: time, who: 'jasper', key: 'flip' }); }
    inverted = inv;
    // drops: a run of falling track
    if (p.y < lastY - 1e-4) { if (dropStart === null) dropStart = lastY; }
    else if (p.y > lastY + 1e-4 || p.station) {
      if (dropStart !== null) { const d = dropStart - lastY; if (d > 4) { st.drops++; st.maxDrop = Math.max(st.maxDrop, d); } dropStart = null; }
    }
    if (dropStart !== null && dropStart - p.y > 8 && !events.some((e) => e.who === 'josh' && time - e.t < 4)) events.push({ t: time, who: 'josh', key: 'drop' });
    lastY = p.y;
    if (time >= nextFrame) { trace.push({ t: time, s, v, g: gv }); nextFrame += frame; }
  }
  if (dropStart !== null) { const d = dropStart - lastY; if (d > 4) { st.drops++; st.maxDrop = Math.max(st.maxDrop, d); } }
  trace.push({ t: time, s, v, g: 1 });
  st.duration = time;
  st.maxSpeedKmh = st.maxSpeed * 3.6;
  const result = { path, trace, events: events.sort((a, b) => a.t - b.t), stats: st, stalled, complete: !stalled && layout.closed };
  result.ratings = rate(st, result.complete);
  result.reviews = review(st, result.ratings, result.complete);
  return result;
}

const clamp = (v, a = 0, b = 10) => Math.max(a, Math.min(b, v));
export function rate(st, ok) {
  if (!ok) return { excitement: 0, intensity: 0, nausea: 0 };
  const intensity = clamp((st.maxPosG - 1) * 0.6 + st.maxLatG * 0.8 + Math.max(0, -st.minG) * 1.4 + st.inversions * 0.45 + st.maxSpeedKmh / 50);
  let excitement = clamp(st.maxSpeedKmh / 22 + st.drops * 0.35 + st.inversions * 0.9 + Math.min(st.airtime, 6) * 0.45 + Math.min(st.length / 250, 2.5) + st.maxDrop / 18);
  if (intensity > 8) excitement *= 0.75;
  if (st.maxPosG > 5.5 || st.maxLatG > 2.8) excitement *= 0.6;
  const nausea = clamp(st.maxLatG * 1.2 + st.inversions * 0.7 + intensity * 0.25 + st.turns * 0.06);
  return { excitement, intensity, nausea };
}

// ------------------------------------------------------------------ the super users
export const SUPER = [
  { id: 'josh', name: 'Josh Chen', color: '#2f6fe0', hair: '#2a1a10', likes: { zh: '速度狂', en: 'Speed freak' } },
  { id: 'jasper', name: 'Jasper Chen', color: '#2ec85a', hair: '#5a3a1a', cap: '#d83a3a', likes: { zh: '翻轉王', en: 'Loop lover' } },
  { id: 'jeff', name: 'Jeff Chen', color: '#e8452c', hair: '#141414', glasses: true, likes: { zh: '失重派', en: 'Airtime hunter' } },
  { id: 'erin', name: 'Erin Lai', color: '#9a4ad8', hair: '#6a3a1a', long: true, likes: { zh: '舒服派', en: 'Smooth rider' } },
];

function review(st, r, ok) {
  if (!ok) return SUPER.map((u) => ({ id: u.id, stars: 0, key: 'none' }));
  const out = [];
  const kmh = st.maxSpeedKmh;
  // Josh: speed and big drops
  let j = kmh < 40 ? 1 : kmh < 60 ? 2 : kmh < 80 ? 3 : kmh < 100 ? 4 : 5;
  if (st.maxDrop > 30 && j < 5) j++;
  out.push({ id: 'josh', stars: j, key: j >= 4 ? 'fast' : j >= 3 ? 'ok' : 'slow' });
  // Jasper: inversions
  let p = st.inversions === 0 ? 1 : st.inversions === 1 ? 3 : st.inversions === 2 ? 4 : 5;
  if (r.intensity < 3 && p > 1) p--;
  out.push({ id: 'jasper', stars: p, key: st.inversions === 0 ? 'noflip' : p >= 4 ? 'flips' : 'oneflip' });
  // Jeff: airtime
  const a = st.airtime;
  let f = a < 0.5 ? 1 : a < 1.5 ? 2 : a < 3 ? 3 : a < 5 ? 4 : 5;
  out.push({ id: 'jeff', stars: f, key: f >= 4 ? 'floaty' : f >= 2 ? 'someair' : 'noair' });
  // Erin: a long, smooth ride
  let e = 3;
  if (st.length > 350) e++;
  if (st.length > 600) e++;
  if (r.nausea > 4) e--;
  if (r.nausea > 6) e--;
  if (r.intensity > 7) e--;
  if (st.maxLatG > 1.8) e--;
  if (r.excitement < 2) e--;
  e = Math.max(1, Math.min(5, e));
  out.push({ id: 'erin', stars: e, key: e >= 4 ? 'smooth' : r.nausea > 4 || r.intensity > 7 || st.maxLatG > 1.8 ? 'rough' : 'short' });
  return out;
}

// ------------------------------------------------------------------ badges
export const BADGES = [
  { id: 'first', icon: '🎢', test: (res) => res.complete },
  { id: 'josh', icon: '⚡', test: (res) => res.complete && res.stats.maxSpeedKmh >= 100 },
  { id: 'jasper', icon: '🔄', test: (res) => res.complete && res.stats.inversions >= 3 },
  { id: 'jeff', icon: '🪶', test: (res) => res.complete && res.stats.airtime >= 4 },
  { id: 'erin', icon: '🌸', test: (res) => res.complete && res.ratings.excitement >= 6 && res.ratings.nausea <= 3 },
  { id: 'dream', icon: '🏆', test: (res) => res.complete && res.reviews.every((r) => r.stars >= 4) },
  { id: 'tall', icon: '🗼', test: (res) => res.complete && res.stats.maxHeight >= 50 },
  { id: 'thrill', icon: '🔥', test: (res) => res.complete && res.ratings.excitement >= 8 },
];
