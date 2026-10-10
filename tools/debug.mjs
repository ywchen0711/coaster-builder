// node tools/debug.mjs "S U* S* ..." : auto-complete a prefix, ride it, print stats and where the forces peak
import { build, autoComplete } from '../js/track.js';
import { simulate } from '../js/sim.js';

const P = (str) => str.trim().split(/\s+/).map((w) => ({ t: w.replace(/[*^]/g, ''), chain: w.includes('*'), bank: w.includes('^') }));
const p = P(process.argv[2]);
const L = build(p);
if (L.error) { console.log('error', L.error); process.exit(1); }
const tail = autoComplete(L, 80000) || [];
const full = p.concat(tail);
const r = simulate(build(full));
console.log('tail:', tail.map((t) => t.t).join(' '));
console.log(JSON.stringify(r.stats, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
console.log(JSON.stringify(r.ratings, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)), r.reviews.map((v) => v.id + v.stars).join(' '), r.stalled ? 'STALL seg ' + r.stalled.seg : '');
// peak forces per piece type
const G = 9.81, per = {};
const { P: PP, ds } = r.path;
for (const f of r.trace) {
  const p2 = PP[Math.min(PP.length - 1, Math.round(f.s / ds))];
  const fv = [p2.k[0] * f.v * f.v, p2.k[1] * f.v * f.v + G, p2.k[2] * f.v * f.v];
  const gl = Math.abs(fv[0] * p2.right[0] + fv[1] * p2.right[1] + fv[2] * p2.right[2]) / G;
  const seg = p2.seg, t = seg < 0 ? 'station' : full[seg].t + (full[seg].bank ? '^' : '');
  const e = per[t] || (per[t] = { maxG: 0, minG: 9, lat: 0 });
  e.maxG = Math.max(e.maxG, f.g); e.minG = Math.min(e.minG, f.g); e.lat = Math.max(e.lat, gl);
}
for (const [k, e] of Object.entries(per)) console.log(k.padEnd(8), 'G', e.maxG.toFixed(2), e.minG.toFixed(2), 'lat', e.lat.toFixed(2));
if (process.argv[3] === 'where') {
  for (const f of r.trace) {
    const p2 = PP[Math.min(PP.length - 1, Math.round(f.s / ds))];
    const fv = [p2.k[0] * f.v * f.v, p2.k[1] * f.v * f.v + G, p2.k[2] * f.v * f.v];
    const gl = Math.abs(fv[0] * p2.right[0] + fv[1] * p2.right[1] + fv[2] * p2.right[2]) / G;
    if (gl > 3 && p2.seg >= 0 && full[p2.seg].t === (process.argv[4] || 'S')) { console.log('s', f.s.toFixed(1), 'seg', p2.seg, 'bank', p2.bank.toFixed(2), 'up', p2.up.map((x) => x.toFixed(2)).join(','), 'k', p2.k.map((x) => x.toFixed(3)).join(','), 'v', f.v.toFixed(1)); break; }
  }
}
