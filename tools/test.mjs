// node tools/test.mjs : layout building, collisions, auto-complete and the ride physics
import { build, tryNext, autoComplete } from '../js/track.js';
import { simulate } from '../js/sim.js';
import { PRESETS } from '../js/presets.js';

let fail = 0;
const ok = (name, c, info = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!c) fail++; };
const P = (str) => str.trim().split(/\s+/).map((w) => ({ t: w.replace(/[*^]/g, ''), chain: w.includes('*'), bank: w.includes('^') }));
const fmt = (r) => { const s = r.stats, q = r.ratings; return `len ${s.length.toFixed(0)}m  top ${s.maxSpeedKmh.toFixed(0)}km/h  h ${s.maxHeight.toFixed(0)}  drop ${s.maxDrop.toFixed(0)}  inv ${s.inversions}  air ${s.airtime.toFixed(1)}s  G ${s.maxPosG.toFixed(1)}/${s.minG.toFixed(1)}/lat ${s.maxLatG.toFixed(1)}  E ${q.excitement.toFixed(1)} I ${q.intensity.toFixed(1)} N ${q.nausea.toFixed(1)}  ${r.reviews.map((v) => v.id[0] + v.stars).join(' ')}`; };

// 1 a simple flat oval closes
{
  const L = build(P('S R R S S S S S R R S'));
  ok('flat oval layout', !L.error, JSON.stringify(L.error) + ' cursor ' + JSON.stringify(L.cursor) + ' closed ' + L.closed);
}
// 2 collisions are refused
{
  const L = build(P('R R R R'));
  ok('track cannot cross itself', L.error && L.error.key === 'collide', JSON.stringify(L.error));
  const L2 = build(P('D'));
  ok('track cannot go below ground', L2.error && L2.error.key === 'ground', JSON.stringify(L2.error));
}
// 3 auto-complete from a few starts
for (const start of ['', 'U* S* S* U* S* S* S*', 'R S S L', 'S S O S', 'U* S* S* D S S R R']) {
  const base = P(start || 'S');
  const L = build(base);
  const t0 = Date.now();
  const tail = L.error ? null : autoComplete(L);
  const full = tail ? build(base.concat(tail)) : null;
  ok(`auto-complete after "${start || 'S'}"`, full && full.closed && !full.error, `${tail ? tail.length + ' pieces' : 'none'} in ${Date.now() - t0} ms`);
}
// 4 a no-chain hill stalls
{
  const L = build(P('U S S U S D S D'));
  const tail = autoComplete(L);
  const r = simulate(build(P('U S S U S D S D').concat(tail || [])));
  ok('hill without chain lift stalls', !!r.stalled, r.stalled ? `stalled at y ${r.stalled.y.toFixed(1)}` : 'no stall');
}
// 5 presets close and ride
for (const pr of PRESETS) {
  const L = build(pr.pieces);
  const r = simulate(L);
  ok(`preset ${pr.id}`, L.closed && !L.error && r.complete, (L.error ? JSON.stringify(L.error) + ' ' : '') + fmt(r));
}
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
