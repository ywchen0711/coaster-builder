import * as THREE from 'three';
import { build, tryNext, autoComplete, STATION, TYPES, BOUNDS } from './track.js?v=1';
import { simulate, sampleAt, SUPER, BADGES } from './sim.js?v=1';
import { PRESETS } from './presets.js?v=1';
import { t, L, getLang, setLang } from './i18n.js?v=1';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');

// ------------------------------------------------------------------ save
const SAVE = 'coaster.save.v1';
const store = (() => { try { return JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch (e) { return {}; } })();
store.badges = store.badges || {};
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(store)); } catch (e) { /* private mode */ } };

const COLORS = ['#ff5a5a', '#3a7aff', '#2ec85a', '#ffb02a', '#9a4ad8', '#20c4c4', '#ff6ab0', '#444b5a'];
const S = {
  pieces: store.current ? store.current.pieces : PRESETS[0].pieces.slice(0, 6),
  color: store.current ? store.current.color : COLORS[0],
  chain: false, layout: null, res: null, mode: 'build', view: 'orbit', ride: null, hover: null,
};

// ------------------------------------------------------------------ three.js
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a5a, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(60, 120, 40); sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function ctex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  if (rep) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rep, rep); }
  return tx;
}
// sky
scene.background = ctex(8, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4a9aff'); g.addColorStop(0.6, '#bfe6ff'); g.addColorStop(1, '#e8f6ff'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
scene.fog = new THREE.Fog(0xd8f0ff, 220, 600);
// ground
const grassTex = ctex(128, 128, (x, w, h) => { x.fillStyle = '#7ac85a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(40,90,20,.14)' : 'rgba(255,255,200,.12)'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 60);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// park area (paths) and grid shown while building
const parkTex = ctex(64, 64, (x) => { x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(120,90,50,.12)'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } }, 4);
const plaza = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }));
plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 8); plaza.receiveShadow = true; scene.add(plaza);
const grid = new THREE.GridHelper(BOUNDS.xz * 2, (BOUNDS.xz * 2) / 4, 0xffffff, 0xffffff);
grid.position.set(2, 0.03, 2);   // lines on tile edges (tile centres sit on multiples of 4)
grid.material.transparent = true; grid.material.opacity = 0.22; scene.add(grid);
// trees around the park
{
  const trunk = new THREE.MeshStandardMaterial({ color: 0x8a5a2a }), leaf = new THREE.MeshStandardMaterial({ color: 0x3a9a3a, roughness: 0.9 });
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 112 + Math.random() * 80;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const h = 4 + Math.random() * 4;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 6), trunk); tr.position.y = h / 2; g.add(tr);
    const lf = new THREE.Mesh(new THREE.ConeGeometry(2.6 + Math.random(), 6 + Math.random() * 3, 8), leaf); lf.position.y = h + 2.5; lf.castShadow = true; g.add(lf);
    scene.add(g);
  }
}
// station
const stationG = new THREE.Group(); scene.add(stationG);
{
  const plat = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 4), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 }));
  plat.position.set(0, 0.5, 3.4); plat.receiveShadow = plat.castShadow = true; stationG.add(plat);
  const roofM = new THREE.MeshStandardMaterial({ color: 0x3a7aff });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 9), roofM); roof.position.set(0, 6.2, 1); roof.castShadow = true; stationG.add(roof);
  for (const x of [-6.5, 6.5]) for (const z of [-3, 5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); p.position.set(x, 3, z); stationG.add(p); }
  const sign = ctex(512, 96, (x, w, h) => { x.fillStyle = '#ffd23a'; x.fillRect(0, 0, w, h); x.fillStyle = '#1f2440'; x.font = '900 60px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🎢 STATION 車站', w / 2, h / 2 + 4); });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0, 7.5, 5.4); stationG.add(sg);
  // entrance arrow (where the track must come back)
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 4), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  arrow.rotation.z = -Math.PI / 2; arrow.position.set(STATION.x0 - 2, STATION.y + 1.4, STATION.z);
  stationG.add(arrow); stationG.userData.arrow = arrow;
}

// ------------------------------------------------------------------ track mesh
let trackG = null;
function tube(P, step, off, r, mat, radial = 7) {
  const pos = [], idx = [], n = Math.floor((P.length - 1) / step) + 1;
  for (let k = 0; k < n; k++) {
    const p = P[Math.min(P.length - 1, k * step)], c = off(p);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      pos.push(c[0] + p.right[0] * ca + p.up[0] * sa, c[1] + p.right[1] * ca + p.up[1] * sa, c[2] + p.right[2] * ca + p.up[2] * sa);
    }
  }
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < radial; j++) {
    const a = k * radial + j, b = k * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
const m4 = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
function basis(p, pos) {
  vx.set(-p.right[0], -p.right[1], -p.right[2]); vy.set(p.up[0], p.up[1], p.up[2]); vz.set(p.t[0], p.t[1], p.t[2]);
  m4.makeBasis(vx, vy, vz); m4.setPosition(pos[0], pos[1], pos[2]);
  return m4;
}
function buildTrackMesh() {
  if (trackG) { scene.remove(trackG); trackG.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  trackG = new THREE.Group(); scene.add(trackG);
  if (!S.res) return;
  const P = S.res.path.P, col = new THREE.Color(S.color);
  const railM = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.3 });
  const spineM = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.7), roughness: 0.5, metalness: 0.2 });
  const add = (p, a) => [p.x + a[0], p.y + a[1], p.z + a[2]];
  trackG.add(tube(P, 2, (p) => add(p, [p.right[0] * 0.55, p.right[1] * 0.55, p.right[2] * 0.55]), 0.11, railM));
  trackG.add(tube(P, 2, (p) => add(p, [-p.right[0] * 0.55, -p.right[1] * 0.55, -p.right[2] * 0.55]), 0.11, railM));
  trackG.add(tube(P, 2, (p) => add(p, [-p.up[0] * 0.45, -p.up[1] * 0.45, -p.up[2] * 0.45]), 0.26, spineM, 8));
  // ties / chain / booster / brake fins
  const tieGeo = new THREE.BoxGeometry(1.3, 0.12, 0.22);
  const kinds = { tie: [0xd8dce4], chain: [0x30343c], booster: [0x2ee86a], brakes: [0xe8322c] };
  const lists = { tie: [], chain: [], booster: [], brakes: [] };
  for (let i = 0; i < P.length; i += 5) {
    const p = P[i];
    if (p.station) continue;
    const k = p.chain ? 'chain' : p.booster ? 'booster' : p.brakes ? 'brakes' : 'tie';
    lists[k].push(p);
  }
  for (const [k, arr] of Object.entries(lists)) {
    if (!arr.length) continue;
    const im = new THREE.InstancedMesh(tieGeo, new THREE.MeshStandardMaterial({ color: kinds[k][0], emissive: k === 'booster' ? 0x0a5a2a : k === 'brakes' ? 0x4a0a0a : 0 }), arr.length);
    arr.forEach((p, j) => { const o = [p.x - p.up[0] * 0.2, p.y - p.up[1] * 0.2, p.z - p.up[2] * 0.2]; im.setMatrixAt(j, basis(p, o)); });
    im.castShadow = true; trackG.add(im);
  }
  // supports: every ~3 m, from under the track down to the ground
  const sup = [];
  for (let i = 0; i < P.length; i += 12) {
    const p = P[i];
    if (p.station || p.y < 1.6) continue;
    if (p.up[1] < 0.3) continue;          // not under upside-down parts
    const top = p.y - 0.7;
    sup.push([p.x - p.up[0] * 0.5, top, p.z - p.up[2] * 0.5]);
  }
  if (sup.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), sup.length);
    sup.forEach((s, j) => { m4.makeScale(1, s[1], 1); m4.setPosition(s[0], s[1] / 2, s[2]); im.setMatrixAt(j, m4); });
    im.castShadow = true; trackG.add(im);
  }
}

// cursor arrow + preview of the next piece
const cursorArrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 12), new THREE.MeshBasicMaterial({ color: 0x2ee86a }));
scene.add(cursorArrow);
let ghost = null;
function updateCursor() {
  const c = S.layout.cursor;
  cursorArrow.visible = !S.layout.closed && S.mode === 'build';
  cursorArrow.position.set(c.x, c.y + 1.6, c.z);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]][c.dir];
  cursorArrow.rotation.set(0, 0, 0);
  cursorArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dirs[0], RATE_DY(c.slope), dirs[1]).normalize());
  stationG.userData.arrow.visible = !S.layout.closed && S.mode === 'build';
}
const RATE_DY = (s) => ({ '-2': -1.5, '-1': -0.5, 0: 0, 1: 0.5, 2: 1.5 })[s];
function showGhost(type) {
  if (ghost) { scene.remove(ghost); ghost.geometry.dispose(); ghost = null; }
  if (!type || S.mode !== 'build') return;
  const r = tryNext(S.layout, { t: type });
  if (!r.pl) return;
  const pts = r.pl.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  ghost = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.5, 8), new THREE.MeshBasicMaterial({ color: r.ok ? 0x2ee86a : 0xff3a3a, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(ghost);
}

// ------------------------------------------------------------------ train with riders (the four super users ride in front)
const train = new THREE.Group(); scene.add(train);
const CARS = 5, GAP = 2.7;
const cars = [];
function chibi(u) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: u.color })); body.position.y = 0.3; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), skin); head.position.y = 0.9; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: u.hair })); hair.position.y = 0.94; g.add(hair);
  if (u.cap) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.15, 14), new THREE.MeshStandardMaterial({ color: u.cap })); c.position.y = 1.12; g.add(c); }
  if (u.long) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.15), hair.material); l.position.set(0, 0.7, -0.28); g.add(l); }
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), skin); arm.position.set(s * 0.32, 1.0, 0); arm.rotation.z = s * 0.35; g.add(arm); g.userData.arms = (g.userData.arms || []).concat(arm); }
  return g;
}
{
  const guests = [{ color: '#ff8a3a', hair: '#3a2a1a' }, { color: '#3ac0c0', hair: '#d8a040' }, { color: '#e8d040', hair: '#2a1a10' }, { color: '#c04a8a', hair: '#141414' }, { color: '#6a8aff', hair: '#8a4a1a' }, { color: '#5ac85a', hair: '#2a1a10' }];
  const riders = [SUPER[0], SUPER[1], SUPER[2], SUPER[3], ...guests];
  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2 });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.3), bodyM); shell.position.y = 0.35; shell.castShadow = true; car.add(shell);
    if (i === 0) { const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 16, 1, false, 0, Math.PI), bodyM); nose.rotation.z = Math.PI / 2; nose.rotation.y = 0; nose.position.set(0, 0.35, 1.15); nose.scale.set(1, 1, 0.6); car.add(nose); }
    const seatM = new THREE.MeshStandardMaterial({ color: 0x2a2e3a });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.6), seatM); seat.position.y = 0.72; car.add(seat);
    for (const s of [-1, 1]) { const r = riders[i * 2 + (s < 0 ? 0 : 1)]; if (!r) continue; const c = chibi(r); c.position.set(s * 0.4, 0.72, -0.1); car.add(c); }
    car.userData.body = bodyM;
    train.add(car); cars.push(car);
  }
}
function placeTrain(s) {
  const path = S.res.path;
  cars.forEach((car, i) => {
    const q = sampleAt(path, Math.max(0, s - i * GAP));
    car.matrixAutoUpdate = false;
    car.matrix.copy(basis({ right: q.right, up: q.up, t: q.t }, [q.x + q.up[0] * 0.15, q.y + q.up[1] * 0.15, q.z + q.up[2] * 0.15]));
    car.matrixWorldNeedsUpdate = true;
  });
}

// ------------------------------------------------------------------ camera
const orbit = { yaw: -0.6, pitch: 0.55, dist: 95, tx: 0, ty: 4, tz: 10, spin: 0, zoom: 0 };
let drag = null;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; });
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  if (pointers.size === 2) {               // pinch to zoom
    const [a, b] = [...pointers.values()];
    const d0 = Math.hypot(a.x - b.x, a.y - b.y);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c, d] = [...pointers.values()];
    const d1 = Math.hypot(c.x - d.x, c.y - d.y);
    if (d0 > 0) orbit.dist = Math.min(260, Math.max(8, orbit.dist * (d0 / d1)));
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  if (drag && drag.pan) {
    const k = orbit.dist * 0.0016;
    orbit.tx -= (Math.cos(orbit.yaw) * dx - Math.sin(orbit.yaw) * dy) * k;
    orbit.tz -= (-Math.sin(orbit.yaw) * dx - Math.cos(orbit.yaw) * dy) * k;
  } else { orbit.yaw -= dx * 0.006; orbit.pitch = Math.min(1.45, Math.max(0.05, orbit.pitch + dy * 0.005)); }
});
const endP = (e) => { pointers.delete(e.pointerId); if (!pointers.size) drag = null; };
canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { orbit.dist = Math.min(260, Math.max(8, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
for (const [id, k, v] of [['camL', 'spin', 1], ['camR', 'spin', -1], ['zoomIn', 'zoom', -1], ['zoomOut', 'zoom', 1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); orbit[k] = v; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { orbit[k] = 0; b.classList.remove('on'); });
}
function frameTrack() {
  if (!S.res) return;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = 0;
  for (const p of S.res.path.P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y1 = Math.max(y1, p.y); }
  orbit.tx = (x0 + x1) / 2; orbit.tz = (z0 + z1) / 2; orbit.ty = Math.min(12, y1 / 3);
  orbit.dist = Math.max(40, Math.min(200, Math.max(x1 - x0, z1 - z0, y1 * 1.5) * 1.15 + 20));
}

const look = new THREE.Vector3();
function updateCamera(dt) {
  orbit.yaw += orbit.spin * dt * 1.6;
  if (orbit.zoom) orbit.dist = Math.min(260, Math.max(8, orbit.dist * (1 + orbit.zoom * dt * 1.4)));
  if (S.mode === 'ride' && S.view !== 'orbit' && S.ride) {
    const q = sampleAt(S.res.path, S.ride.s);
    const up = new THREE.Vector3(...q.up);
    if (S.view === 'pov') {
      camera.position.set(q.x + q.up[0] * 1.9 + q.t[0] * 0.6, q.y + q.up[1] * 1.9 + q.t[1] * 0.6, q.z + q.up[2] * 1.9 + q.t[2] * 0.6);
      const ahead = sampleAt(S.res.path, S.ride.s + 6);
      look.set(ahead.x + ahead.up[0] * 1.2, ahead.y + ahead.up[1] * 1.2, ahead.z + ahead.up[2] * 1.2);
      camera.up.copy(up);
    } else {
      const back = sampleAt(S.res.path, Math.max(0, S.ride.s - 16));
      camera.position.set(back.x, back.y + 7, back.z);
      look.set(q.x, q.y + 1, q.z);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(look);
    return;
  }
  camera.up.set(0, 1, 0);
  camera.position.set(orbit.tx + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist, orbit.ty + Math.sin(orbit.pitch) * orbit.dist, orbit.tz + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist);
  camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
}

// ------------------------------------------------------------------ editing
function rebuild(keepView) {
  S.layout = build(S.pieces);
  if (S.layout.error) { S.pieces = S.pieces.slice(0, S.layout.error.i); S.layout = build(S.pieces); }
  S.res = simulate(S.layout);
  buildTrackMesh();
  updateCursor();
  placeTrain((STATION.x1 - STATION.x0) / 2);
  paintPalette();
  store.current = { pieces: S.pieces, color: S.color }; persist();
  if (!keepView) frameTrack();
}
function addPiece(type) {
  if (S.mode !== 'build') return;
  const r = tryNext(S.layout, { t: type });
  if (!r.ok) { toast(t('err_' + r.key)); return; }
  const pc = { t: type };
  if (S.chain && (type === 'S' || type === 'U' || type === 'D')) pc.chain = true;
  S.pieces = S.pieces.concat(pc);
  rebuild(true);
  showGhost(S.hover);
  if (S.layout.closed) toast(t('closedOk', S.pieces.length), 2600);
}
const ICONS = {
  S: '<path d="M16 28V6M9 13l7-7 7 7"/>', U: '<path d="M6 26h8l12-16M19 10h7v7"/>', D: '<path d="M6 8h8l12 16M19 24h7v-7"/>',
  L: '<path d="M24 28V18a8 8 0 0 0-8-8H6M11 5l-5 5 5 5"/>', R: '<path d="M8 28V18a8 8 0 0 1 8-8h10M21 5l5 5-5 5"/>',
  LL: '<path d="M27 28v-6A14 14 0 0 0 13 8H4M9 3 4 8l5 5"/>', RR: '<path d="M5 28v-6A14 14 0 0 1 19 8h9M23 3l5 5-5 5"/>',
  O: '<path d="M3 26h9a7 7 0 1 0 1-6c-1 3-1 6 0 6h16"/>', B: '<path d="M18 3 8 18h8l-2 11 10-15h-8z"/>', K: '<path d="M6 16h20M10 10v12M16 10v12M22 10v12"/>',
};
function paletteHTML() {
  $('pieceBtns').innerHTML = TYPES.map((k) => `<button data-t="${k}" title="${t('tip' + k)}"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg><span>${t(k)}</span></button>`).join('');
  $('pieceBtns').querySelectorAll('button').forEach((b) => {
    b.onclick = () => addPiece(b.dataset.t);
    b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { S.hover = b.dataset.t; showGhost(S.hover); } };
    b.onpointerleave = () => { S.hover = null; showGhost(null); };
  });
}
function paintPalette() {
  $('pieceBtns').querySelectorAll('button').forEach((b) => { const r = tryNext(S.layout, { t: b.dataset.t }); b.disabled = !r.ok; b.title = t('tip' + b.dataset.t) + (r.ok ? '' : '\n' + t('err_' + r.key)); });
  const st = $('status');
  if (S.layout.closed) { st.textContent = t('closedOk', S.pieces.length); st.style.color = '#1a8a3a'; }
  else { st.textContent = t('open', S.pieces.length); st.style.color = '#7a5a10'; }
  $('bRide').disabled = false;
}
$('chain').onchange = (e) => { S.chain = e.target.checked; $('chainLbl').classList.toggle('on', S.chain); };
$('bUndo').onclick = () => { if (S.mode !== 'build' || !S.pieces.length) return; S.pieces = S.pieces.slice(0, -1); rebuild(true); };
$('bClear').onclick = () => { if (S.mode !== 'build') return; if (S.pieces.length && !confirm(t('clearQ'))) return; S.pieces = []; rebuild(); };
$('bAuto').onclick = () => {
  if (S.mode !== 'build' || S.layout.closed) return;
  $('bAuto').disabled = true;
  setTimeout(() => {
    const tail = autoComplete(S.layout, 60000);
    $('bAuto').disabled = false;
    if (!tail) { toast(t('autoFail'), 3000); return; }
    S.pieces = S.pieces.concat(tail); rebuild(true); toast(t('autoDone', tail.length), 2200);
  }, 30);
};
function paintColors() {
  $('colors').innerHTML = COLORS.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === S.color ? 'sel' : ''}" title="${t('color')}"></button>`).join('');
  $('colors').querySelectorAll('button').forEach((b) => b.onclick = () => { S.color = b.dataset.c; paintColors(); buildTrackMesh(); store.current = { pieces: S.pieces, color: S.color }; persist(); });
}
function paintExamples() {
  $('examples').innerHTML = `<option value="">${t('pickExample')}</option>` + PRESETS.map((p) => `<option value="${p.id}">${L(p.name)}</option>`).join('');
}
$('examples').onchange = (e) => {
  const p = PRESETS.find((x) => x.id === e.target.value);
  e.target.value = '';
  if (!p || S.mode !== 'build') return;
  S.pieces = p.pieces.map((x) => ({ ...x })); S.color = p.color; paintColors(); rebuild();
  toast(L(p.name), 1500);
};
$('bSave').onclick = () => { store.saved = { pieces: S.pieces, color: S.color }; persist(); toast(t('saved')); };
$('bLoad').onclick = () => {
  if (!store.saved) { toast(t('nothingSaved')); return; }
  if (S.mode !== 'build') stopRide();
  S.pieces = store.saved.pieces.map((x) => ({ ...x })); S.color = store.saved.color; paintColors(); rebuild(); toast(t('loaded'));
};

// ------------------------------------------------------------------ riding
function startRide() {
  if (!S.layout.closed) { toast(t('needClosed'), 2600); return; }
  $('results').hidden = true;
  S.res = simulate(S.layout);
  S.mode = 'ride'; S.ride = { time: 0, s: S.res.trace[0].s, k: 0, ev: 0, done: false };
  document.body.classList.add('riding');
  $('hud').hidden = false;
  $('bRide').textContent = t('stop'); $('bRide').classList.add('stop');
  cursorArrow.visible = false; stationG.userData.arrow.visible = false; showGhost(null);
  if (S.view === 'orbit') toast(t('rideHint'), 1800);
  paintViews();
}
function stopRide() {
  S.mode = 'build'; S.ride = null;
  document.body.classList.remove('riding');
  $('hud').hidden = true;
  $('bRide').textContent = t('ride'); $('bRide').classList.remove('stop');
  updateCursor();
  placeTrain((STATION.x1 - STATION.x0) / 2);
}
$('bRide').onclick = () => (S.mode === 'ride' ? stopRide() : startRide());
$('bAgain').onclick = () => { $('results').hidden = true; startRide(); };
$('resClose').onclick = () => { $('results').hidden = true; };
function paintViews() { $('views').querySelectorAll('button').forEach((b) => { b.textContent = t('view_' + b.dataset.v); b.classList.toggle('sel', b.dataset.v === S.view); b.onclick = () => { S.view = b.dataset.v; paintViews(); }; }); }

function tickRide(dt) {
  const R = S.ride, tr = S.res.trace;
  R.time += dt;
  while (R.k < tr.length - 2 && tr[R.k + 1].t < R.time) R.k++;
  const a = tr[R.k], b = tr[Math.min(tr.length - 1, R.k + 1)], u = b.t > a.t ? Math.min(1, (R.time - a.t) / (b.t - a.t)) : 1;
  R.s = a.s + (b.s - a.s) * u;
  const v = a.v + (b.v - a.v) * u, g = a.g + (b.g - a.g) * u;
  placeTrain(R.s);
  const q = sampleAt(S.res.path, R.s);
  $('vSpeed').textContent = Math.round(v * 3.6);
  $('vHeight').textContent = Math.round(q.y);
  $('vG').textContent = g.toFixed(1);
  $('vTime').textContent = Math.floor(R.time);
  // riders' arms go up on drops and in the air
  const excited = g < 0.6 || v > 15;
  cars.forEach((c) => c.traverse((o) => { if (o.userData.arms) o.userData.arms.forEach((arm, i) => { arm.rotation.z += ((excited ? (i ? -2.6 : 2.6) : (i ? -0.35 : 0.35)) - arm.rotation.z) * Math.min(1, dt * 6); }); }));
  // shouts
  while (R.ev < S.res.events.length && S.res.events[R.ev].t <= R.time) { shout(S.res.events[R.ev]); R.ev++; }
  if (R.time >= tr[tr.length - 1].t && !R.done) { R.done = true; setTimeout(() => finishRide(), S.res.stalled ? 900 : 300); }
}
function shout(e) {
  const u = SUPER.find((x) => x.id === e.who);
  const el = document.createElement('div'); el.className = 'shout';
  el.innerHTML = `<img src="${portrait(u)}" alt="">${t('shout')[e.who][e.key]}`;
  $('shouts').appendChild(el); setTimeout(() => el.remove(), 2300);
}

function finishRide() {
  const res = S.res;
  stopRide();
  if (res.stalled) placeTrain(res.stalled.s);
  showResults(res);
}
function stars(n) { return '★'.repeat(n) + `<i>${'★'.repeat(5 - n)}</i>`; }
function showResults(res) {
  S.lastRes = res;
  const st = res.stats, r = res.ratings;
  $('resTitle').textContent = t('results');
  $('resStall').textContent = res.stalled ? t('stall', Math.round(res.stalled.y)) : '';
  const bar = (k, v, c) => `<div class="rate"><span>${t(k)}</span><span class="bar"><i style="width:${v * 10}%;background:${c}"></i></span><b>${v.toFixed(1)}</b></div>`;
  $('ratings').innerHTML = bar('excitement', r.excitement, '#ffb02a') + bar('intensity', r.intensity, '#ff5a5a') + bar('nausea', r.nausea, '#2ec85a');
  const m = t('unit_m'), s = t('unit_s');
  const rows = [['st_len', st.length.toFixed(0) + ' ' + m], ['st_top', st.maxSpeedKmh.toFixed(0) + ' ' + t('unit_kmh')], ['st_h', st.maxHeight.toFixed(0) + ' ' + m], ['st_drop', st.maxDrop.toFixed(0) + ' ' + m],
    ['st_inv', st.inversions], ['st_air', st.airtime.toFixed(1) + ' ' + s], ['st_g', st.maxPosG.toFixed(1)], ['st_neg', st.minG.toFixed(1)], ['st_lat', st.maxLatG.toFixed(1)], ['st_time', st.duration.toFixed(0) + ' ' + s]];
  $('statsGrid').innerHTML = rows.map(([k, v]) => `<div><span>${t(k)}</span><b>${v}</b></div>`).join('');
  $('hSuper').textContent = t('superUsers');
  $('reviews').innerHTML = res.reviews.map((rv) => {
    const u = SUPER.find((x) => x.id === rv.id);
    return `<div class="rev"><img src="${portrait(u)}" alt=""><div><div class="who">${u.name}<small>${t('likes')[u.id]}</small></div><div class="stars">${stars(rv.stars)}</div><p>${t('rev')[u.id][rv.key]}</p></div></div>`;
  }).join('');
  // badges
  const fresh = [];
  for (const b of BADGES) if (!store.badges[b.id] && b.test(res)) { store.badges[b.id] = Date.now(); fresh.push(b); }
  persist();
  paintBadges();
  $('bAgain').textContent = t('again');
  $('results').hidden = false;
  fresh.forEach((b, i) => setTimeout(() => toast(`${b.icon} ${t('badgeGot')} ${t('badge')[b.id]}`, 3000), 600 + i * 3200));
}
function paintBadges() {
  $('hChal').textContent = t('challenges');
  $('badges').innerHTML = BADGES.map((b) => `<div class="${store.badges[b.id] ? 'got' : ''}"><span>${store.badges[b.id] ? b.icon : '🔒'}</span>${t('badge')[b.id]}</div>`).join('');
}

// portraits of the super users (drawn once)
const portraits = {};
function portrait(u) {
  if (portraits[u.id]) return portraits[u.id];
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  x.fillStyle = u.color; x.beginPath(); x.ellipse(48, 100, 36, 26, 0, 0, 7); x.fill();
  if (u.long) { x.fillStyle = u.hair; x.fillRect(22, 40, 52, 46); }
  x.fillStyle = '#f2c9a0'; x.beginPath(); x.arc(48, 46, 27, 0, 7); x.fill();
  x.fillStyle = u.hair; x.beginPath(); x.arc(48, 40, 28, Math.PI * 1.05, Math.PI * 1.95); x.fill(); x.fillRect(20, 30, 56, 9);
  if (u.cap) { x.fillStyle = u.cap; x.beginPath(); x.arc(48, 34, 28, Math.PI, 0); x.fill(); x.fillRect(48, 28, 36, 8); }
  x.fillStyle = '#1a1a1a'; for (const ex of [38, 58]) { x.beginPath(); x.ellipse(ex, 49, 3.5, 5, 0, 0, 7); x.fill(); }
  if (u.glasses) { x.strokeStyle = '#222'; x.lineWidth = 2.5; for (const ex of [38, 58]) x.strokeRect(ex - 8, 42, 16, 13); x.beginPath(); x.moveTo(46, 47); x.lineTo(50, 47); x.stroke(); }
  x.strokeStyle = '#a0402a'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.arc(48, 58, 8, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
  x.fillStyle = 'rgba(255,120,130,.45)'; for (const ex of [30, 66]) { x.beginPath(); x.arc(ex, 58, 5, 0, 7); x.fill(); }
  return (portraits[u.id] = c.toDataURL());
}

// ------------------------------------------------------------------ text, help, keys
let toastT = 0;
function toast(msg, ms = 1800) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }
function paintText() {
  document.title = t('title') + ' · ' + t('sub');
  $('tTitle').textContent = t('title'); $('tSub').textContent = t('sub');
  $('bSave').textContent = t('save'); $('bLoad').textContent = t('load');
  $('bLang').textContent = getLang() === 'zh' ? 'EN' : '中文';
  $('hPieces').textContent = t('pieces'); $('hTools').textContent = t('tools');
  $('tChain').textContent = t('chain'); $('chainLbl').title = t('chainTip');
  $('bUndo').textContent = t('undo'); $('bClear').textContent = t('clear'); $('bAuto').textContent = t('auto');
  $('bRide').textContent = S.mode === 'ride' ? t('stop') : t('ride');
  $('hSpeed').textContent = t('speed') + ' km/h'; $('hHeight').textContent = t('height') + ' m'; $('hG').textContent = t('gforce'); $('hTime').textContent = t('time') + ' s';
  paletteHTML(); paintExamples(); paintColors(); paintViews(); paintBadges();
  if (S.layout) paintPalette();
  if (!$('results').hidden && S.lastRes) showResults(S.lastRes);
}
$('bLang').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); paintText(); };
$('bHelp').onclick = () => { $('helpTitle').textContent = t('help'); $('helpBody').innerHTML = t('helpBody').map((p) => `<p>${p}</p>`).join(''); $('help').hidden = false; };
$('helpClose').onclick = () => { $('help').hidden = true; };
$('help').addEventListener('pointerdown', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Backspace' && S.mode === 'build') { $('bUndo').onclick(); e.preventDefault(); }
  if (e.key === 'Enter') $('bRide').onclick();
  if (e.key === 'Escape') { if (S.mode === 'ride') stopRide(); $('help').hidden = true; }
});

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  if (S.mode === 'ride' && S.ride) tickRide(dt);
  cursorArrow.position.y = S.layout.cursor.y + 1.6 + Math.sin(now / 250) * 0.3;
  updateCamera(dt);
  renderer.render(scene, camera);
}
setLang(getLang());
paintText();
rebuild();
if (params.get('example')) { const p = PRESETS.find((x) => x.id === params.get('example')); if (p) { S.pieces = p.pieces.map((x) => ({ ...x })); S.color = p.color; paintColors(); rebuild(); } }
if (params.has('clean')) document.body.classList.add('clean');
if (params.has('cam')) { const [y, p, d] = params.get('cam').split(',').map(Number); orbit.yaw = y; orbit.pitch = p; orbit.dist = d; }
if (params.has('ride')) {           // screenshots: ?example=loops&ride=pov&rt=12 (or rt=end for the results)
  S.view = params.get('ride') || 'pov'; startRide();
  const rt = params.get('rt');
  for (let i = 0; i < 60 * (rt === 'end' ? 400 : Number(rt || 0)) && S.mode === 'ride' && !S.ride.done; i++) tickRide(1 / 60);
}
requestAnimationFrame(frame);
window.CB = { S, startRide, stopRide, addPiece, rebuild, orbit, tick: (dt) => { if (S.mode === 'ride' && S.ride) tickRide(dt); }, finishRide };
