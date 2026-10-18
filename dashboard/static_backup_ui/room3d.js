// Night City Office: the room as a real-time 3D scene (three.js 0.169.0, vendored in static/vendor/three).
// A double-height loft with a floor-to-ceiling glass wall onto a neon megacity (flashing lights, moving traffic and
// animated anime-girl billboards). A fixed camera looks in from high up; furniture is placed by projecting the stations'
// screen positions into the room, so the portraits (office.js) sit on their furniture. Everything is generated here
// (canvas textures, no images, no outside requests). Falls back to the room's CSS gradient when WebGL is unavailable.
// The previous room is kept as room3d.backup-2026-10-16.js.
import * as THREE from './vendor/three/three.module.min.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';
import { buildCharacter } from './crew3d.js';

const FPS = 30;
// Station screen positions (% of the room) that furniture is built around: the starting layout.
const ST = { lucy: [20, 60], rebecca: [9, 58], kiwi: [58, 64], maine: [68, 52], falco: [76, 62], david: [45, 86], door: [92, 48] };
const JP = '"Yu Gothic UI","Yu Gothic","Meiryo","MS Gothic",sans-serif';

function main() {
  const room = document.getElementById('office'), canvas = document.getElementById('room3d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    canvas.remove();  // the room keeps its dark CSS gradient
    console.warn('room: WebGL is not available, showing the plain background');
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x0a0c24, 0.017);
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 60);
  camera.position.set(0.4, 3.0, 7.6);  // high and back, looking down into the room
  camera.lookAt(0.6, 0.7, -4);
  camera.updateMatrixWorld();

  // ---- helpers
  const ray = new THREE.Raycaster();
  function onPlane(xp, yp, normal, constant) {
    ray.setFromCamera(new THREE.Vector2(xp / 50 - 1, 1 - yp / 50), camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(normal, constant), p) ? p : null;
  }
  const atHeight = (xp, yp, y) => onPlane(xp, yp, new THREE.Vector3(0, 1, 0), -y) || new THREE.Vector3((xp - 50) / 5, y, -3);  // point on the horizontal plane at height y
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, ...o });
  const neon = (color, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
  function box(w, h, d, material, x, y, z, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function rbox(w, h, d, r, material, x, y, z, parent = scene) {  // box with rounded edges
    r = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const hw = w / 2 - r, hh = h / 2 - r;
    const shape = new THREE.Shape().moveTo(-hw, -hh).lineTo(hw, -hh).lineTo(hw, hh).lineTo(-hw, hh).closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.002, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    const m = new THREE.Mesh(g, material); m.position.set(x, y, z); parent.add(m); return m;
  }
  function strip(from, to, color, k = 3, thick = 0.04) {  // a neon tube between two points
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 8), neon(color, k));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    scene.add(m); return m;
  }
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { tex: t, g, c };
  }
  const tiled = (t, rx, ry) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
  const tickers = [];  // per-frame callbacks for the things that move (drone, cat, arcade screen, clock...)
  const every = (period, fn) => { let next = 0; return (t) => { if (t >= next) { next = t + period; fn(t); } }; };
  let seed = 2077;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // a soft additive light pool (floor spill, halos behind signs)
  const glowTex = canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }).tex;
  function glow(color, x, y, z, w, d, op = 0.5, rotX = -Math.PI / 2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(color), transparent: true,
      opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    m.rotation.x = rotX; m.position.set(x, y, z); scene.add(m); return m;
  }

  // ---- room shell: a double-height loft. Glass wall at the back, concrete side walls, planked floor
  const BACK = -6, LEFT = -7.5, RIGHT = 7.5, TOP = 6.8, WY0 = 0.12, WY1 = 6.5, WW = RIGHT - LEFT, WH = WY1 - WY0;
  const floorTex = tiled(canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#12142a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {  // planks running toward the camera
      const x = i * 64, l = 22 + Math.floor(rnd() * 14);
      g.fillStyle = `rgb(${l},${l + 4},${l + 28})`; g.fillRect(x, 0, 63, h);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.02})`; g.fillRect(x + rnd() * 60, rnd() * h, 1 + rnd(), 20 + rnd() * 80); }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + 63, 0, 1, h); g.fillRect(x, Math.floor(rnd() * h), 63, 1);
    }
  }).tex, 7, 5);
  // the floor is see-through near the glass wall (strong reflection of the city) and solid towards the camera
  const floorAlpha = canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [p, a] of [[0, 0.62], [0.143, 0.66], [0.3, 0.85], [0.43, 0.94], [0.6, 0.98], [1, 0.99]]) gr.addColorStop(p, `rgb(${Math.round(a * 255)},${Math.round(a * 255)},${Math.round(a * 255)})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }).tex;
  floorAlpha.colorSpace = THREE.NoColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), mat(0xffffff, { map: floorTex, roughness: 0.34, metalness: 0.3, transparent: true, alphaMap: floorAlpha }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); floor.renderOrder = -1; scene.add(floor);  // slightly see-through: the mirrored city below it is the wet-floor reflection
  const wallMat = (base) => mat(0xffffff, { roughness: 0.9, map: tiled(canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},255,${rnd() * 0.035})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(120,150,255,.10)'; g.fillRect(3, 3, w, 2); g.fillRect(3, 3, 2, h);
  }).tex, 4, 2) });
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(14, TOP), wallMat('#161c44')); wl.rotation.y = Math.PI / 2; wl.position.set(LEFT, TOP / 2, 1); scene.add(wl);
  const wr = new THREE.Mesh(new THREE.PlaneGeometry(14, TOP), wallMat('#131840')); wr.rotation.y = -Math.PI / 2; wr.position.set(RIGHT, TOP / 2, 1); scene.add(wr);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), mat(0x080a1c)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, TOP, -1); scene.add(ceil);
  for (const x of [LEFT + 0.07, RIGHT - 0.07]) box(0.14, 0.22, 14, mat(0x0c1030), x, 0.11, 1);  // skirting
  const steel = mat(0x1a1f3d, { metalness: 0.7, roughness: 0.35 }), dark = mat(0x0d1026, { metalness: 0.5, roughness: 0.45 });

  // ---- the glass wall: steel frame over the city
  const WMID = (WY0 + WY1) / 2;
  box(WW, 0.3, 0.4, steel, 0, TOP - 0.15, BACK + 0.12);                               // header beam
  box(WW, 0.14, 0.5, steel, 0, 0.07, BACK + 0.2);                                     // kick plate
  box(WW, 0.09, 0.2, steel, 0, 1.0, BACK + 0.1);                                      // transom
  for (const x of [-4.5, -1.5, 1.5, 4.5]) box(0.11, WH, 0.22, steel, x, WMID, BACK + 0.1);  // mullions
  strip([LEFT, 0.17, BACK + 0.46], [RIGHT, 0.17, BACK + 0.46], 0x05d9e8, 1.6, 0.02);  // cyan line along the sill
  strip([LEFT, TOP - 0.34, BACK + 0.33], [RIGHT, TOP - 0.34, BACK + 0.33], 0xff4fd8, 1.8, 0.02);  // magenta line under the header

  // ---- the city behind the glass: three painted layers, a blinking-lights layer and moving traffic
  const CW = 2048, CH = Math.round(CW * WH / WW), DW = CW / 2, DH = CH / 2;
  const px = x => (x - LEFT) / WW * CW, py = y => (WY1 - y) / WH * CH;
  const litColors = ['#59e8ff', '#ffd84a', '#ff5ad8', '#bfe9ff', '#ff8a3a'];
  const blink = [];  // things the lights layer redraws: windows, beacons, signs, cars (coordinates in that layer's half-size canvas)
  function tower(g, x, w, top, o) {
    g.fillStyle = o.shade; g.fillRect(x, top, w, CH - top);
    if (o.edge) { g.fillStyle = o.edge; g.fillRect(x, top, 3, CH - top); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, top, w, 2); }
    const cw = o.cell || 12, chh = o.cellH || 16, base = rnd() < 0.6 ? '#ffe9b0' : litColors[Math.floor(rnd() * litColors.length)];  // each tower has a dominant window colour
    for (let wy = top + 14; wy < CH - 8; wy += chh) {
      if (rnd() < (o.band || 0)) { g.fillStyle = 'rgba(120,220,255,.5)'; g.fillRect(x + 5, wy, w - 10, 3); continue; }  // a lit floor band
      for (let wx = x + 8; wx < x + w - 8; wx += cw) {
        const r = rnd(), c = rnd() < 0.8 ? base : litColors[Math.floor(rnd() * litColors.length)];
        if (r < o.lit) { g.fillStyle = c; g.fillRect(wx, wy, cw - 5, chh - 8); }
        else if (r < o.lit + (o.twinkle || 0)) blink.push({ k: 'win', x: wx / 2, y: wy / 2, c, ph: rnd() * 20, rate: 0.5 + rnd() * 2.5 });
      }
    }
    if (o.roof && rnd() < 0.6) {  // antenna with a red beacon
      g.fillStyle = o.shade; g.fillRect(x + w / 2 - 2, top - 34, 4, 34);
      blink.push({ k: 'beacon', x: (x + w / 2) / 2, y: (top - 36) / 2, ph: rnd() });
    }
  }
  function towers(g, o) {
    for (let x = -20; x < CW;) {
      const w = o.minW + rnd() * (o.maxW - o.minW), top = CH * (1 - (o.minF + rnd() * (o.maxF - o.minF)));
      tower(g, x, w, top, o); x += w + rnd() * 6;
    }
  }
  const cityPlane = (tex, dz, k = 1.4, additive = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false,
      fog: false, color: new THREE.Color(k, k, k), blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.set(0, WMID, BACK + dz); scene.add(m);
    const mm = m.clone(); mm.position.y = -WMID; mm.scale.y = -1; mm.renderOrder = -2; scene.add(mm);  // its reflection in the floor
    return m;
  };
  const haze = (g, from, to, a) => { const gr = g.createLinearGradient(0, CH * from, 0, CH * to); gr.addColorStop(0, 'rgba(230,60,170,0)'); gr.addColorStop(1, `rgba(230,60,170,${a})`); g.fillStyle = gr; g.fillRect(0, CH * from, CW, CH * (to - from)); };
  cityPlane(canvasTexture(CW, CH, (g) => {  // layer 0: sky and far, hazy towers
    const gr = g.createLinearGradient(0, 0, 0, CH);
    gr.addColorStop(0, '#02030e'); gr.addColorStop(0.35, '#0a1244'); gr.addColorStop(0.72, '#3b1c78'); gr.addColorStop(1, '#d03a8c');
    g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.fillRect(rnd() * CW, rnd() * CH * 0.45, 2, 2); }
    const mg = g.createRadialGradient(CW * 0.84, CH * 0.13, 0, CW * 0.84, CH * 0.13, 110);
    mg.addColorStop(0, 'rgba(255,200,240,.95)'); mg.addColorStop(0.25, 'rgba(255,150,220,.35)'); mg.addColorStop(1, 'rgba(255,100,200,0)');
    g.fillStyle = mg; g.fillRect(CW * 0.84 - 110, CH * 0.13 - 110, 220, 220);
    towers(g, { shade: '#25307f', edge: null, minW: 40, maxW: 110, minF: 0.28, maxF: 0.62, lit: 0.05, twinkle: 0.01, cell: 10, cellH: 14 });
    haze(g, 0.45, 1, 0.3);
  }).tex, 0.010, 1.25);
  cityPlane(canvasTexture(CW, CH, (g) => {  // layer 1: mid towers with neon edges and a skyway
    towers(g, { shade: '#0f1855', edge: '#2f6dff', minW: 70, maxW: 170, minF: 0.32, maxF: 0.74, lit: 0.14, twinkle: 0.04, band: 0.06, cell: 11, cellH: 15, roof: true });
    g.fillStyle = '#070b2a'; g.fillRect(0, CH * 0.74, CW, 9); g.fillStyle = '#ff4fd8'; g.fillRect(0, CH * 0.74 + 9, CW, 2);
    for (let x = 0; x < CW; x += 120) { g.fillStyle = '#070b2a'; g.fillRect(x, CH * 0.74, 5, CH * 0.26); }
    haze(g, 0.6, 1, 0.22);
  }).tex, 0.012, 1.35);
  const MEGA = [{ cx: -3, w: 2.8, top: 6.4 }, { cx: 3, w: 2.8, top: 6.4 }, { cx: 6, w: 2.0, top: 5.8 }, { cx: 0, w: 1.9, top: 6.3 }, { cx: -6, w: 1.6, top: 6.0 }];  // towers that carry the billboards
  cityPlane(canvasTexture(CW, CH, (g) => {  // layer 2: near towers
    const o = { shade: '#050922', edge: '#ff3ad0', minW: 90, maxW: 230, minF: 0.34, maxF: 0.9, lit: 0.2, twinkle: 0.06, band: 0.08, cell: 13, cellH: 17, roof: true };
    towers(g, o);
    for (const m of MEGA) tower(g, px(m.cx) - m.w / WW * CW / 2, m.w / WW * CW, py(m.top), { ...o, edge: m.cx % 2 ? '#25e6ff' : '#ff3ad0', roof: false, lit: 0.12, twinkle: 0.03 });
    g.fillStyle = '#04061a'; g.fillRect(0, CH * 0.87, CW, 12); g.fillStyle = '#25e6ff'; g.fillRect(0, CH * 0.87 + 12, CW, 2);
    haze(g, 0.7, 1, 0.3);
  }).tex, 0.014, 1.4);
  // blinking neon signs on the towers, and traffic on the skyways
  const signs = [['ネオン', '#ff3ad0', '#25e6ff'], ['サイバー', '#25e6ff', '#ffd23a'], ['ラーメン', '#ffd23a', '#ff3ad0'], ['酒', '#ff4a4a', '#ffd23a'], ['カフェ', '#7affc0', '#25e6ff'],
    ['電脳', '#9a5bff', '#ff3ad0'], ['ホテル', '#25e6ff', '#ff3ad0'], ['未来', '#ffd23a', '#25e6ff'], ['ナイト', '#ff3ad0', '#ffd23a'], ['カラオケ', '#25e6ff', '#ff4a4a']];
  signs.forEach(([text, c, c2], i) => blink.push({ k: 'sign', text, c, c2, x: 70 + i * (DW - 140) / (signs.length - 1) + (rnd() - 0.5) * 30, y: DH * (0.66 + (i % 3) * 0.1), ph: rnd() * 20, rate: 3 + rnd() * 6 }));
  for (const [y, dir, sp, n] of [[0.74, 1, 60, 7], [0.745, -1, 48, 6], [0.87, 1, 105, 6], [0.875, -1, 85, 5], [0.62, 1, 38, 4]])
    for (let i = 0; i < n; i++) blink.push({ k: 'car', x0: rnd() * DW, y: DH * y - 2, dir, sp: sp * (0.8 + rnd() * 0.4) });
  const dyn = canvasTexture(DW, DH, () => {});
  const dynMesh = cityPlane(dyn.tex, 0.016, 1.7, true);
  // daylight: a pale sky veil over the city (strength and tint follow the clock, see sunLevel/applySun)
  const skyVeil = cityPlane(canvasTexture(CW, CH, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, CH); gr.addColorStop(0, '#5fa8ff'); gr.addColorStop(0.55, '#bfdcff'); gr.addColorStop(1, '#ffd2a8');
    g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
  }).tex, 0.017, 1, false);
  skyVeil.material.opacity = 0;
  function drawCity(t) {
    const g = dyn.g; g.clearRect(0, 0, DW, DH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const b of blink) {
      if (b.k === 'win') { if (Math.sin(t * b.rate + b.ph) > 0.15) { g.fillStyle = b.c; g.fillRect(b.x, b.y, 3, 3); } }
      else if (b.k === 'beacon') { if ((t * 0.9 + b.ph) % 1 < 0.35) { g.fillStyle = '#ff3030'; g.fillRect(b.x - 1.5, b.y - 1.5, 4, 4); } }
      else if (b.k === 'car') {
        const x = (((b.x0 + b.dir * b.sp * t) % (DW + 40)) + DW + 40) % (DW + 40) - 20;
        g.fillStyle = b.dir > 0 ? '#fff4c0' : '#ff5060'; g.fillRect(x, b.y, 3, 2);
        g.fillStyle = b.dir > 0 ? '#ff5060' : '#fff4c0'; g.fillRect(x - b.dir * 5, b.y, 2, 2);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + b.dir * 3, b.y + 0.5, b.dir * 7, 1);
      } else if (Math.sin(t * b.rate + b.ph) > -0.88) {  // a sign: flickers off now and then, swaps colour
        const c = Math.floor(t * 0.5 + b.ph) % 2 ? b.c2 : b.c;
        g.font = `bold 15px ${JP}`; g.shadowColor = c; g.shadowBlur = 7; g.fillStyle = c; g.fillText(b.text, b.x, b.y); g.shadowBlur = 0;
      }
    }
    dyn.tex.needsUpdate = true;
  }
  // faint reflections on the glass
  cityPlane(canvasTexture(512, 256, (g, w, h) => {
    for (const [x, wd, a] of [[60, 70, 0.07], [150, 22, 0.1], [300, 90, 0.05], [420, 30, 0.08]]) {
      const gr = g.createLinearGradient(x, 0, x + wd, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(180,220,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.transform(1, 0, -0.5, 1, h * 0.25, 0); g.fillStyle = gr; g.fillRect(x, 0, wd, h); g.restore();
    }
  }).tex, 0.25, 1, true);
  // rain running down the glass: fast thin streaks plus a few slow, fat drops
  const rainDrops = Array.from({ length: 150 }, (_, i) => ({ x: rnd() * DW, y0: rnd() * DH, sp: i < 110 ? 150 + rnd() * 90 : 18 + rnd() * 22, len: i < 110 ? 7 : 15, a: i < 110 ? 0.22 : 0.4 }));
  const rainC = canvasTexture(DW, DH, () => {});
  cityPlane(rainC.tex, 0.27, 1.3, true);
  function drawRain(t) {
    const g = rainC.g; g.clearRect(0, 0, DW, DH); g.lineWidth = 1;
    for (const d of rainDrops) { const y = (d.y0 + d.sp * t) % (DH + 20) - 10; g.strokeStyle = `rgba(190,230,255,${d.a})`; g.beginPath(); g.moveTo(d.x, y); g.lineTo(d.x - d.len * 0.12, y + d.len); g.stroke(); }
    rainC.tex.needsUpdate = true;
  }

  // ---- an original anime-style girl, drawn with paths (face half-width = s, face centre at cx, cy)
  function animeGirl(g, cx, cy, s, P, blinkK, t) {
    const L = '#1a0d33';
    g.save(); g.translate(cx, cy); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
    const fill = (c) => { g.fillStyle = c; g.fill(); g.strokeStyle = L; g.lineWidth = 0.05; g.stroke(); };
    g.beginPath(); g.moveTo(-1.25, -0.2);  // hair behind the head
    g.bezierCurveTo(-1.55, -1.3, -0.6, -1.95, 0, -1.95); g.bezierCurveTo(0.6, -1.95, 1.55, -1.3, 1.25, -0.2);
    if (P.style === 'long') { g.bezierCurveTo(1.55, 0.8, 1.3, 2.0, 1.7, 3.1); g.lineTo(-1.7, 3.1); g.bezierCurveTo(-1.3, 2.0, -1.55, 0.8, -1.25, -0.2); }
    else if (P.style === 'bob') { g.bezierCurveTo(1.5, 0.5, 1.35, 1.0, 1.15, 1.5); g.lineTo(-1.15, 1.5); g.bezierCurveTo(-1.35, 1.0, -1.5, 0.5, -1.25, -0.2); }
    else { g.bezierCurveTo(1.3, 0.3, 1.2, 0.6, 1.1, 0.8); g.lineTo(-1.1, 0.8); g.bezierCurveTo(-1.2, 0.6, -1.3, 0.3, -1.25, -0.2); }
    fill(P.hairDark);
    if (P.style === 'twin') for (const sx of [-1, 1]) {  // twin tails with hair ties
      g.beginPath(); g.moveTo(sx * 1.15, -0.8); g.bezierCurveTo(sx * 2.3, -0.3, sx * 2.5, 1.7, sx * 2.0, 3.3);
      g.bezierCurveTo(sx * 1.6, 1.9, sx * 1.35, 0.8, sx * 1.0, 0.2); g.closePath(); fill(P.hair);
      g.beginPath(); g.arc(sx * 1.3, -0.65, 0.17, 0, 7); fill(P.accent);
    }
    g.beginPath(); g.rect(-0.28, 0.9, 0.56, 0.8); fill(P.skin2);  // neck
    g.beginPath(); g.moveTo(-2.4, 3.4); g.lineTo(-1.9, 2.0); g.quadraticCurveTo(0, 1.35, 1.9, 2.0); g.lineTo(2.4, 3.4); g.closePath(); fill(P.jacket);
    g.beginPath(); g.moveTo(-0.55, 1.45); g.lineTo(0, 2.6); g.lineTo(0.55, 1.45); g.closePath(); fill('#f4f6ff');
    g.strokeStyle = P.accent; g.lineWidth = 0.09; g.beginPath(); g.moveTo(-1.9, 2.0); g.quadraticCurveTo(0, 1.35, 1.9, 2.0); g.stroke();  // neon collar
    g.beginPath(); g.moveTo(-1, -0.3); g.bezierCurveTo(-1.02, 0.55, -0.6, 1.15, 0, 1.3); g.bezierCurveTo(0.6, 1.15, 1.02, 0.55, 1, -0.3);  // face
    g.bezierCurveTo(0.95, -1.0, -0.95, -1.0, -1, -0.3); g.closePath(); fill(P.skin);
    g.fillStyle = 'rgba(255,110,140,.35)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 0.62, 0.68, 0.2, 0.1, 0, 0, 7); g.fill(); }
    const k = Math.max(0.06, blinkK);
    for (const sx of [-1, 1]) {  // big eyes
      const ex = sx * 0.48, ey = 0.22;
      g.save(); g.translate(ex, ey); g.scale(1, k);
      g.beginPath(); g.ellipse(0, 0, 0.3, 0.37, 0, 0, 7); g.fillStyle = '#fff'; g.fill();
      const ir = g.createLinearGradient(0, -0.3, 0, 0.35); ir.addColorStop(0, P.eye2); ir.addColorStop(1, P.eye);
      g.beginPath(); g.ellipse(0, 0.03, 0.22, 0.31, 0, 0, 7); g.fillStyle = ir; g.fill();
      g.beginPath(); g.ellipse(0, 0.06, 0.09, 0.16, 0, 0, 7); g.fillStyle = '#12102c'; g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-0.08, -0.1, 0.07, 0, 7); g.fill(); g.beginPath(); g.arc(0.09, 0.14, 0.035, 0, 7); g.fill();
      g.restore();
      g.strokeStyle = L; g.lineWidth = 0.08; g.beginPath(); g.ellipse(ex, ey, 0.31, 0.37 * k, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
      g.lineWidth = 0.06; g.beginPath(); g.moveTo(ex + sx * 0.3, ey - 0.06 * k - 0.02); g.lineTo(ex + sx * 0.45, ey - 0.14); g.stroke();
      g.strokeStyle = P.hairDark; g.lineWidth = 0.05; g.beginPath(); g.moveTo(ex - sx * 0.25, ey - 0.55); g.quadraticCurveTo(ex, ey - 0.65, ex + sx * 0.3, ey - 0.5); g.stroke();
    }
    g.strokeStyle = '#c0707a'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.03, 0.62); g.lineTo(-0.02, 0.68); g.stroke();  // nose
    g.strokeStyle = L; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-0.16, 0.93); g.quadraticCurveTo(0, 1.07 + Math.sin(t * 2) * 0.02, 0.16, 0.93); g.stroke();  // smile
    g.beginPath(); g.moveTo(-1.12, -0.1); g.bezierCurveTo(-1.3, -1.6, 1.3, -1.6, 1.12, -0.1);  // fringe
    for (const [x, y] of [[1.02, 0.4], [0.8, -0.3], [0.62, 0.1], [0.38, -0.5], [0.16, -0.02], [-0.1, -0.58], [-0.32, -0.05], [-0.62, -0.42], [-0.78, 0.12], [-1.02, 0.42]]) g.lineTo(x, y);
    g.closePath(); fill(P.hair);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 1.0, -0.2); g.bezierCurveTo(sx * 1.15, 0.5, sx * 1.0, 1.1, sx * 0.86, 1.6); g.bezierCurveTo(sx * 0.82, 0.9, sx * 0.8, 0.4, sx * 0.72, 0.15); g.closePath(); fill(P.hair); }
    g.strokeStyle = P.hairHi; g.globalAlpha = 0.75; g.lineWidth = 0.1; g.beginPath(); g.moveTo(-0.85, -0.95); g.quadraticCurveTo(0, -1.45, 0.85, -0.95); g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = P.hair; g.lineWidth = 0.09; g.beginPath(); g.moveTo(0, -1.4); g.quadraticCurveTo(-0.2, -1.9, 0.15, -2.05); g.stroke();  // ahoge
    if (P.headset) {
      g.strokeStyle = '#1a1f3d'; g.lineWidth = 0.14; g.beginPath(); g.arc(0, -0.1, 1.38, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      for (const sx of [-1, 1]) {
        g.beginPath(); g.ellipse(sx * 1.32, 0.15, 0.26, 0.34, 0, 0, 7); fill('#1a1f3d');
        g.strokeStyle = P.accent; g.lineWidth = 0.06; g.beginPath(); g.ellipse(sx * 1.32, 0.15, 0.16, 0.24, 0, 0, 7); g.stroke();
      }
    }
    g.save(); g.translate(0.8, -0.78); g.rotate(0.5); g.fillStyle = P.accent; g.fillRect(-0.14, -0.04, 0.28, 0.08); g.restore();  // hair clip
    g.restore();
  }
  const GIRLS = {
    pink: { hair: '#ff4fb8', hairHi: '#ffb0e6', hairDark: '#b81a84', eye: '#2a6bff', eye2: '#8ae0ff', skin: '#ffe4d8', skin2: '#f2c4b4', jacket: '#1b1f4a', accent: '#05d9e8', style: 'twin', bg0: '#2a0a5a', bg1: '#e0308a', title: 'ネオン★ガール', vert: '電脳少女' },
    cyan: { hair: '#27d8ff', hairHi: '#c0f8ff', hairDark: '#0d86b0', eye: '#ff3aa8', eye2: '#ffc0e4', skin: '#ffe8de', skin2: '#f2c8b8', jacket: '#2a1450', accent: '#ff4fd8', style: 'bob', headset: true, bg0: '#06265a', bg1: '#1ab0d8', title: 'サイバー', vert: '未来都市' },
    violet: { hair: '#a060ff', hairHi: '#dcc0ff', hairDark: '#5a28b8', eye: '#ffc01a', eye2: '#fff2a0', skin: '#ffe2d6', skin2: '#f0c2b2', jacket: '#0e2038', accent: '#ffd23a', style: 'long', bg0: '#20084a', bg1: '#7a2ad8', title: '夜の街', vert: '夜想曲' },
  };
  function girlBoard(g, w, h, P, t, id) {
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, P.bg0); bg.addColorStop(1, P.bg1); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h * 0.42);  // sunburst
    for (let i = 0; i < 22; i += 2) { g.rotate(Math.PI * 4 / 22); g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 1.3, -16); g.lineTo(w * 1.3, 16); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.40, 0, 7); g.fill();
    g.strokeStyle = P.accent; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.40, 0, 7); g.stroke();
    const ph = (t + id * 1.7) % 4.2, b = ph > 4.0 ? Math.abs(ph - 4.1) * 10 : 1;  // blinks every few seconds
    animeGirl(g, w / 2, h * 0.40 + Math.sin(t * 1.3 + id) * 2, w * 0.19, P, b, t);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, h - 48, w, 48);
    g.textAlign = 'center'; g.font = `bold ${Math.round(w * 0.12)}px ${JP}`; g.fillStyle = P.accent; g.shadowColor = P.accent; g.shadowBlur = 10; g.fillText(P.title, w / 2, h - 15); g.shadowBlur = 0;
    g.font = `bold 15px ${JP}`; g.fillStyle = 'rgba(255,255,255,.9)';
    [...P.vert].forEach((c, i) => g.fillText(c, w - 16, 70 + i * 20));
    if (Math.floor(t * 1.6) % 2 === 0) { g.fillStyle = '#ff2a3a'; g.beginPath(); g.arc(18, 20, 5, 0, 7); g.fill(); }
    g.font = 'bold 13px monospace'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText('LIVE', 28, 25);
    g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = (t * 20) % 4; y < h; y += 4) g.fillRect(0, y, w, 1.5);  // scanlines
    g.strokeStyle = P.accent; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5);
    if (Math.floor(t * 2.5 + id * 3) % 9 === 0) { const y = (h * 0.2 + ((t * 977) % 1) * h * 0.5) | 0; g.drawImage(g.canvas, 0, y, w, 14, (((t * 31) % 1) - 0.5) * 24, y, w, 14); }  // glitch
  }
  function adBoard(g, w, h, t) {
    const bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(0, '#12062e'); bg.addColorStop(1, '#4a0e6e'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,210,58,${0.08 + (i % 2) * 0.1})`; g.fillRect(0, 20 + i * 24, w * 0.62, 10); }
    g.save(); g.beginPath(); g.rect(0, h - 70, w * 0.62, 40); g.clip();
    g.font = `bold 34px ${JP}`; g.textAlign = 'left'; g.fillStyle = '#ffd23a'; g.shadowColor = '#ffd23a'; g.shadowBlur = 8;
    g.fillText('ネオンラーメン　二十四時間営業　サイバー酒場　', -((t * 90) % 560), h - 38); g.fillText('ネオンラーメン　二十四時間営業　サイバー酒場　', 560 - ((t * 90) % 560), h - 38);
    g.restore(); g.shadowBlur = 0;
    g.font = `bold 46px ${JP}`; g.textAlign = 'left'; g.fillStyle = '#25e6ff'; g.shadowColor = '#25e6ff'; g.shadowBlur = 12; g.fillText('夜明け前', 20, 64); g.shadowBlur = 0;
    g.save(); g.beginPath(); g.rect(w * 0.62, 0, w * 0.38, h); g.clip();
    g.fillStyle = '#e0308a'; g.fillRect(w * 0.62, 0, w * 0.38, h);
    const ph = (t + 2.2) % 3.6; animeGirl(g, w * 0.81, h * 0.38, h * 0.2, GIRLS.cyan, ph > 3.4 ? Math.abs(ph - 3.5) * 10 : 1, t);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = (t * 20) % 4; y < h; y += 4) g.fillRect(0, y, w, 1.5);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5);
  }
  function vSign(g, w, h, t) {
    g.fillStyle = '#07051a'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 92px ${JP}`;
    [...'ネオン街'].forEach((c, i) => {
      const on = Math.sin(t * (3 + i) + i * 2) > -0.75, col = i % 2 ? '#25e6ff' : '#ff3ad0';
      g.fillStyle = on ? col : 'rgba(255,255,255,.12)'; g.shadowColor = col; g.shadowBlur = on ? 16 : 0; g.fillText(c, w / 2, 70 + i * 112);
    });
    g.shadowBlur = 0; g.textBaseline = 'alphabetic';
    g.strokeStyle = '#ff3ad0'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }
  // billboards on the towers: each its own animated canvas, redrawn a few times a second
  const boards = [];
  function mkBoard(cx, cy, bw, bh, cw, ch, draw, accent, period) {
    const c = canvasTexture(cw, ch, () => {});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: c.tex, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false, fog: false }));
    mesh.position.set(cx, cy, BACK + 0.06); scene.add(mesh);
    const mm = mesh.clone(); mm.position.y = -cy; mm.scale.y = -1; scene.add(mm);  // reflection in the floor
    box(bw + 0.18, bh + 0.18, 0.05, mat(0x0a0d22), cx, cy, BACK + 0.03);
    for (const [w, h, x, y] of [[bw + 0.22, 0.05, 0, bh / 2 + 0.1], [bw + 0.22, 0.05, 0, -bh / 2 - 0.1], [0.05, bh + 0.22, -bw / 2 - 0.1, 0], [0.05, bh + 0.22, bw / 2 + 0.1, 0]])
      box(w, h, 0.05, neon(accent, 2.2), cx + x, cy + y, BACK + 0.07);
    glow(accent, cx, cy, BACK + 0.045, bw * 2.4, bh * 1.7, 0.4, 0);
    boards.push({ c, draw: (t) => draw(c.g, cw, ch, t), period, next: 0 });
  }
  mkBoard(-3, 4.5, 2.2, 3.4, 256, 396, (g, w, h, t) => girlBoard(g, w, h, GIRLS.pink, t, 0), '#ff3ad0', 0.28);
  mkBoard(3, 4.5, 2.2, 3.4, 256, 396, (g, w, h, t) => girlBoard(g, w, h, GIRLS.cyan, t, 1), '#25e6ff', 0.3);
  mkBoard(6, 4.15, 1.8, 2.8, 256, 396, (g, w, h, t) => girlBoard(g, w, h, GIRLS.violet, t, 2), '#ffd23a', 0.33);
  mkBoard(0, 5.2, 2.4, 1.5, 512, 320, adBoard, '#ffd23a', 0.2);
  mkBoard(-6, 4.2, 0.85, 3.2, 128, 480, vSign, '#ff3ad0', 0.15);
  // floor spill from the signs, so the glass wall lights the floor
  for (const [x, c, w] of [[-3, '#ff3ad0', 4.4], [3, '#25e6ff', 4.8], [6, '#ffd23a', 3.4], [0, '#ff8a3a', 3], [-6, '#ff3ad0', 2.4]]) glow(c, x, 0.015, BACK + 1.4, w, 3.2, 0.5);

  // light shafts from the billboards slanting down onto the floor
  const beamTex = canvasTexture(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  }).tex;
  for (const [x, c, w] of [[-3, '#ff3ad0', 1.8], [3, '#25e6ff', 1.8], [6, '#ffd23a', 1.3], [0, '#ff8a3a', 1.4], [-6, '#ff3ad0', 1.0]]) {
    const top = new THREE.Vector3(x, 3.2, BACK + 0.15), low = new THREE.Vector3(x + 0.8, 0, BACK + 3.6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, top.distanceTo(low)), new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(c), transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    m.position.copy(top).add(low).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(low).normalize());  // bright end at the window
    scene.add(m);
  }

  // ---- hanging holographic screens: three separate curved panels on cables, side by side with clear gaps
  // live numbers on the three holograms (office.js / extras.js keep window.Office.stats current); big type, since the panels are small on screen
  // while the lead has a project running, the middle panel shows its checklist instead of the success rate
  const holoProject = (g, w, h, P) => {
    // same look as the other panels: small label, big number, then the current task and one square per task
    g.textAlign = 'left'; g.fillStyle = '#e8fbff'; g.font = 'bold 30px monospace';
    g.fillText(String(P.title || 'PROJECT').toUpperCase().slice(0, 17), 20, 40);
    const plan = P.plan || [], done = plan.filter((i) => i.state === 'done').length;
    g.font = 'bold 118px monospace'; g.shadowColor = '#bfefff'; g.shadowBlur = 14;
    if (!plan.length) { g.font = 'bold 56px monospace'; g.fillText(P.status === 'reviewing' ? 'REVIEWING' : 'PLANNING', 20, 130); g.shadowBlur = 0; return; }
    g.fillText(`${done}/${plan.length}`, 20, 150);
    g.shadowBlur = 0; g.font = 'bold 27px monospace';
    const now = plan.find((i) => i.state === 'working') || plan.find((i) => i.state === 'waiting');
    g.fillText(now ? now.title.slice(0, 22) : (P.status === 'reviewing' ? 'LEAD REVIEWING' : 'ALL DONE'), 20, 192);
    const sq = Math.min(24, Math.floor(200 / plan.length));
    plan.forEach((it, i) => {
      g.fillStyle = it.state === 'done' ? '#7dffa0' : it.state === 'working' ? '#ffe34d' : it.state === 'failed' ? '#ff7a8a' : 'rgba(232,251,255,.25)';
      g.fillRect(300 + (i % 8) * (sq + 4), 100 + Math.floor(i / 8) * (sq + 4), sq, sq);
    });
    g.fillStyle = '#e8fbff';
  };
  // the fourth panel: which MCP servers are linked (lead.js keeps window.Office.mcp current)
  const holoMcp = (g, w, h) => {
    const M = window.Office && window.Office.mcp;
    g.textAlign = 'left'; g.fillStyle = '#e8fbff'; g.font = 'bold 30px monospace'; g.fillText('MCP LINKS', 20, 40);
    if (!M || !M.items.length) { g.font = 'bold 44px monospace'; g.fillText('CHECKING', 20, 140); return; }
    g.font = 'bold 104px monospace'; g.shadowColor = '#bfefff'; g.shadowBlur = 14; g.fillText(`${M.up}/${M.total}`, 20, 150);
    g.shadowBlur = 0; g.font = 'bold 27px monospace'; g.fillText(M.up === M.total ? 'ALL LINKED' : `${M.total - M.up} NOT LINKED`, 20, 192);
    const col = { connected: '#7dffa0', auth: '#ffe34d', disconnected: '#ff7a8a', failed: '#ff7a8a' };
    const rows = M.items.filter((i) => i.ours), others = M.items.filter((i) => !i.ours);
    rows.forEach((it, i) => {
      g.fillStyle = col[it.state] || '#ff7a8a'; g.beginPath(); g.arc(316, 76 + i * 36, 11, 0, 7); g.fill();
      g.fillStyle = '#e8fbff'; g.font = 'bold 30px monospace'; g.fillText(it.label.toUpperCase().replace(' STUDIO', '').slice(0, 8), 340, 87 + i * 36);
    });
    g.fillStyle = 'rgba(232,251,255,.7)'; g.font = 'bold 20px monospace';
    g.fillText(`+${others.filter((i) => i.state === 'connected').length}/${others.length} OTHERS`, 306, 90 + rows.length * 36);
    g.fillStyle = '#e8fbff';
  };
  const holoStats = (g, w, h, kind) => {
    const S = window.Office && window.Office.stats;
    g.fillStyle = 'rgba(3,14,70,.9)'; g.fillRect(0, 0, w, h);
    if (kind === 'mcp') { holoMcp(g, w, h); return; }
    if (kind === 'bars' && window.Office && window.Office.project) { holoProject(g, w, h, window.Office.project); return; }
    g.textAlign = 'left'; g.fillStyle = '#e8fbff'; g.font = 'bold 30px monospace';
    g.fillText({ wave: 'QUEUE', bars: 'SUCCESS', ring: 'AGENTS BUSY' }[kind], 20, 40);
    if (!S) { g.font = 'bold 44px monospace'; g.fillText('OFFLINE', 20, 140); return; }
    const st = S.by_status, local = ['coder', 'planner', 'vision', 'memory', 'trimmer'];
    g.font = 'bold 118px monospace'; g.shadowColor = '#bfefff'; g.shadowBlur = 14;
    if (kind === 'wave') {
      g.fillText(String(st.queued + st.running), 20, 150);
      g.shadowBlur = 0; g.font = 'bold 27px monospace';
      g.fillText(`RUN ${st.running}   DONE ${st.done}   FAIL ${st.failed}`, 20, 192);
    } else if (kind === 'bars') {
      g.fillText(S.success == null ? '--' : `${Math.round(S.success * 100)}%`, 20, 150);
      g.shadowBlur = 0; g.font = 'bold 27px monospace'; g.fillText(S.avg_s == null ? 'AVG --' : `AVG ${S.avg_s.toFixed(1)}s`, 20, 192);
      const m = Math.max(1, ...S.per_5min);
      S.per_5min.forEach((v, i) => { const bh = 8 + (v / m) * 90; g.fillRect(300 + i * 16, 168 - bh, 10, bh); });
      g.font = 'bold 18px monospace'; g.fillText('LAST HOUR', 300, 192);
    } else {
      const n = local.filter((r) => S.busy && S.busy[r]).length;
      g.fillText(`${n}/${local.length}`, 20, 150);
      g.shadowBlur = 0;
      local.forEach((r, i) => { const on = S.busy && S.busy[r]; g.fillStyle = on ? (S.colors[r] || '#fff') : 'rgba(232,251,255,.25)'; g.beginPath(); g.arc(34 + i * 52, 178, on ? 17 : 12, 0, 7); g.fill(); });
    }
    g.shadowBlur = 0; g.fillStyle = '#e8fbff';
  };
  const holoDraw = (kind) => (g, w, h, t) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0b4fd6'); gr.addColorStop(1, '#1aa8ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,240,255,.28)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#e8fbff'; g.fillStyle = 'rgba(232,251,255,.85)'; g.lineWidth = 3;
    if (kind === 'wave') {
      for (const [o, a] of [[0, 1], [2.1, 0.6]]) { g.beginPath(); for (let x = 0; x <= w; x += 6) g.lineTo(x, h * 0.5 + Math.sin(x / 24 + t * 2 + o) * h * 0.2 * a * Math.sin(x / 90 + t * 0.6 + o)); g.stroke(); }
    } else if (kind === 'bars') {
      for (let i = 0; i < 16; i++) { const v = 14 + (Math.sin(t * 1.8 + i * 0.9) * 0.5 + 0.5) * (h - 60); g.fillRect(16 + i * 30, h - 16 - v, 18, v); }
    } else {
      g.translate(w / 2, h / 2);
      for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(0, 0, h * 0.14 * i, t * (i % 2 ? 1 : -1) * 0.8, t * (i % 2 ? 1 : -1) * 0.8 + Math.PI * 1.4); g.stroke(); }
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(t * 2) * h * 0.42, Math.sin(t * 2) * h * 0.42); g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    holoStats(g, w, h, kind);
    g.strokeStyle = 'rgba(232,251,255,.9)'; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
  };
  const holos = [];
  for (const [x, ry, kind] of [[-4.3, 0.42, 'mcp'], [-1.5, 0.14, 'wave'], [1.3, -0.14, 'bars'], [4.1, -0.42, 'ring']]) {
    const R = 4.2, pw = 2.3, ph = 0.95, len = pw / R;
    const c = canvasTexture(512, 212, () => {});
    const hg = new THREE.Group(); hg.position.set(x, 2.3, -3.4); hg.rotation.y = ry; scene.add(hg);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, ph, 40, 1, true, -len / 2, len),
      new THREE.MeshBasicMaterial({ map: c.tex, color: new THREE.Color(1.4, 1.4, 1.6), side: THREE.DoubleSide, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    m.position.z = -R; hg.add(m);
    for (const dx of [-0.9, 0.9]) box(0.02, TOP - 2.3 - 0.475, 0.02, dark, dx, 0.475 + (TOP - 2.3 - 0.475) / 2, 0, hg);  // the cables up to the ceiling
    holos.push({ c, draw: holoDraw(kind), next: 0 });
  }
  const holoLight = new THREE.PointLight(0x2a8cff, 26, 9, 2); holoLight.position.set(1, 2.4, -2.4); scene.add(holoLight);

  // ---- wall neon: corner tubes, a cyan line on the left wall, a yellow line on the right wall, pendant lamps
  strip([LEFT + 0.05, 0.4, BACK + 0.15], [LEFT + 0.05, TOP - 0.4, BACK + 0.15], 0xff4fd8, 2, 0.03);
  strip([RIGHT - 0.05, 0.4, BACK + 0.15], [RIGHT - 0.05, TOP - 0.4, BACK + 0.15], 0xe8f03a, 2.2, 0.03);
  strip([LEFT + 0.05, 2.6, BACK + 0.3], [LEFT + 0.05, 2.6, 3], 0x05d9e8, 1.2, 0.02);
  strip([RIGHT - 0.05, 3.6, BACK + 0.3], [RIGHT - 0.05, 3.6, 2], 0xe8f03a, 1.6, 0.025);
  const signMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, color: new THREE.Color(1.5, 1.5, 1.5), map: canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = 'rgba(8,4,24,.75)'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 84px "Brush Script MT","Segoe Script",cursive';
    g.shadowColor = '#ff3ad0'; g.shadowBlur = 20; g.fillStyle = '#ff7ae8'; g.fillText('Night Shift', w / 2, h / 2); g.shadowBlur = 0;
    g.strokeStyle = '#25e6ff'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
  }).tex });
  const wallSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.81), signMat); wallSign.rotation.y = Math.PI / 2; wallSign.position.set(LEFT + 0.04, 3.4, -4.3); scene.add(wallSign);

  // ---- props
  function plant(x, z, s = 1, y = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 16), mat(0x1c2250, { roughness: 0.5 })); pot.position.y = 0.25; g.add(pot);
    const leafM = mat(0x1fb38a, { emissive: 0x0a4a40, emissiveIntensity: 0.5, roughness: 0.6 });
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9 + (i % 3) * 0.25, 6), leafM);
      leaf.position.set(Math.cos(a) * 0.18, 0.95 + (i % 3) * 0.1, Math.sin(a) * 0.18);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(leaf);
    }
  }
  plant(LEFT + 0.7, BACK + 0.9, 1.4); plant(RIGHT - 0.8, BACK + 0.9, 1.2);
  const bookMats = [0xc03a8a, 0x2a8cc8, 0xd8a82a, 0x5a3ab8, 0x2aa888, 0xc84a3a].map(c => mat(c, { roughness: 0.8 }));
  (function shelf(z) {  // a bookshelf against the left wall
    const g = new THREE.Group(); g.position.set(LEFT + 0.25, 0, z); scene.add(g);
    const wood = mat(0x2a2236, { roughness: 0.6 });
    box(0.4, 2.7, 0.06, wood, 0, 1.35, -1.0, g); box(0.4, 2.7, 0.06, wood, 0, 1.35, 1.0, g);
    for (let i = 0; i < 6; i++) {
      box(0.4, 0.05, 2.0, wood, 0, 0.03 + i * 0.5, 0, g);
      for (let zz = -0.92; zz < 0.85;) {
        const bw = 0.05 + rnd() * 0.05, bh = 0.25 + rnd() * 0.15;
        box(0.28, bh, bw, bookMats[Math.floor(rnd() * bookMats.length)], 0, 0.06 + i * 0.5 + bh / 2, zz + bw / 2, g); zz += bw + 0.008;
      }
    }
    box(0.03, 2.7, 0.03, neon(0x05d9e8, 1.8), 0.2, 1.35, 1.03, g);
  })(BACK + 1.7);

  // ---- lounge: sofa (Rebecca at the left end, Lucy in the middle), rug, low table, floor lamp
  const sofaL = atHeight(ST.rebecca[0] - 3, ST.rebecca[1] + 7, 0.45), sofaR = atHeight(ST.lucy[0] + 11, ST.lucy[1] + 7, 0.45);
  const sz = (sofaL.z + sofaR.z) / 2, sx0 = Math.max(LEFT + 0.7, sofaL.x), sx1 = sofaR.x, slen = sx1 - sx0;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(slen + 2.4, 4.0), new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#1a1038'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { g.strokeStyle = ['#ff3ad0', '#25e6ff', '#7a2ad8'][i % 3]; g.globalAlpha = 0.55; g.lineWidth = 3; g.strokeRect(14 + i * 16, 14 + i * 16, w - 28 - i * 32, h - 28 - i * 32); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(255,210,58,.25)';
    for (let x = 60; x < w - 40; x += 70) { g.beginPath(); g.moveTo(x, h / 2 - 20); g.lineTo(x + 20, h / 2); g.lineTo(x, h / 2 + 20); g.lineTo(x - 20, h / 2); g.fill(); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }).tex }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(sx0 + slen / 2 + 0.2, 0.012, sz + 1.5); scene.add(rug);
  const sofa = new THREE.Group(); sofa.position.set(sx0 + slen / 2, 0, sz); scene.add(sofa);
  const fabric = mat(0x2b3a7e, { roughness: 0.75 }), cush = mat(0x3a4aa0, { roughness: 0.7 });
  rbox(slen + 0.5, 0.28, 1.05, 0.05, fabric, 0, 0.28, 0, sofa);
  rbox(slen + 0.5, 0.8, 0.28, 0.1, fabric, 0, 0.8, -0.5, sofa);
  for (const sx of [-1, 1]) rbox(0.28, 0.62, 1.05, 0.1, fabric, sx * (slen / 2 + 0.11), 0.55, 0, sofa);
  const nCush = Math.max(3, Math.round(slen / 0.9));
  for (let i = 0; i < nCush; i++) {
    const cw = slen / nCush - 0.04, x = -slen / 2 + slen / nCush * (i + 0.5);
    rbox(cw, 0.2, 0.8, 0.08, cush, x, 0.54, 0.08, sofa);
    const bk = rbox(cw, 0.5, 0.2, 0.08, cush, x, 0.9, -0.3, sofa); bk.rotation.x = -0.15;
  }
  for (const [x, c, r] of [[-slen / 2 + 0.45, 0xe0308a, 0.3], [slen / 2 - 0.5, 0x25c8e8, -0.25], [0.1, 0xe8b82a, 0.1]]) { const p = rbox(0.42, 0.42, 0.14, 0.06, mat(c, { roughness: 0.8 }), x, 0.88, -0.12, sofa); p.rotation.set(-0.2, 0, r); }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, 0.14, 0.05, steel, x * (slen / 2 + 0.1), 0.07, z * 0.45, sofa);
  strip([sx0 - 0.2, 0.05, sz + 0.6], [sx1 + 0.2, 0.05, sz + 0.6], 0xff4fd8, 2, 0.025);
  const tableAt = atHeight(ST.lucy[0] + 6, ST.lucy[1] + 18, 0.3);
  const tbl = new THREE.Group(); tbl.position.set(tableAt.x, 0, tableAt.z); scene.add(tbl);
  rbox(1.5, 0.05, 0.75, 0.02, mat(0x9fdcff, { transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 }), 0, 0.4, 0, tbl);
  rbox(1.5, 0.04, 0.75, 0.015, steel, 0, 0.18, 0, tbl);
  for (const [dx, dz] of [[-0.68, -0.3], [0.68, -0.3], [-0.68, 0.3], [0.68, 0.3]]) box(0.04, 0.4, 0.04, steel, dx, 0.2, dz, tbl);
  strip([tableAt.x - 0.75, 0.38, tableAt.z + 0.38], [tableAt.x + 0.75, 0.38, tableAt.z + 0.38], 0x05d9e8, 1.8, 0.012);
  [0, 1, 2].forEach(i => rbox(0.3 - i * 0.03, 0.04, 0.22, 0.01, bookMats[i * 2], -0.58, 0.45 + i * 0.045, 0.12, tbl));
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 12), mat(0xf0f0ff, { roughness: 0.3 })); mug.position.set(0.4, 0.48, 0.2); tbl.add(mug);
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1.2, 1.6), wireframe: true, toneMapped: false }));  // a spinning holo globe
  globe.position.set(0.6, 0.62, -0.05); tbl.add(globe);
  const globeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 14), neon(0x25e6ff, 1.6)); globeBase.position.set(0.6, 0.45, -0.05); tbl.add(globeBase);
  const lampAt = new THREE.Vector3(sx1 + 1.0, 0, sz - 0.25);
  const lampG = new THREE.Group(); lampG.position.copy(lampAt); scene.add(lampG);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 20), steel); disc.position.y = 0.02; lampG.add(disc);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 8), steel); pole.position.y = 0.87; lampG.add(pole);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.7), side: THREE.DoubleSide, toneMapped: false })); shade.position.y = 1.78; lampG.add(shade);
  const lampLight = new THREE.PointLight(0xffa860, 9, 6, 2); lampLight.position.set(lampAt.x, 1.5, lampAt.z + 0.3); scene.add(lampLight);
  glow(0xffa860, lampAt.x, 0.02, lampAt.z, 2.2, 2.2, 0.35);

  // ---- egg chair (Kiwi) on a round rug, with a side table
  const eggAt = atHeight(ST.kiwi[0], ST.kiwi[1] + 6, 0.55);
  const eggRug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat(0x251448, { roughness: 1 })); eggRug.rotation.x = -Math.PI / 2; eggRug.position.set(eggAt.x, 0.012, eggAt.z + 0.1); scene.add(eggRug);
    // a shell open towards the camera: the gap in the sphere is centred on +z (phi = pi/2), then turned to face the camera
  const egg = new THREE.Group(); egg.position.set(eggAt.x, 0, eggAt.z); scene.add(egg);
  egg.rotation.y = Math.atan2(camera.position.x - eggAt.x, camera.position.z - eggAt.z);
  const GAP = Math.PI * 0.8;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20, Math.PI / 2 + GAP / 2, Math.PI * 2 - GAP, 0, Math.PI * 0.66), mat(0xc9cde6, { side: THREE.DoubleSide, roughness: 0.4 }));
  shell.scale.set(1, 1.2, 1); shell.position.y = 0.9; egg.add(shell);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.14, 24), mat(0xc0408a, { roughness: 0.8 })); seat.position.y = 0.52; egg.add(seat);
  for (const a of [0.4, 2.5, 4.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), mat(0x8a90b8, { metalness: 0.7 }));
    leg.position.set(Math.cos(a) * 0.32, 0.25, Math.sin(a) * 0.32); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); egg.add(leg);
  }
  const side = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 20), mat(0x2a3266, { metalness: 0.6, roughness: 0.35 })); side.position.set(eggAt.x + 1.0, 0.25, eggAt.z + 0.2); scene.add(side);
  const sideLamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), neon(0xff7ae8, 1.8)); sideLamp.position.set(eggAt.x + 1.0, 0.62, eggAt.z + 0.2); scene.add(sideLamp);

  // ---- command console (Maine): a standing desk with three monitors facing the room
  const mAt = atHeight(ST.maine[0], ST.maine[1] + 7, 0);
  const consoleG = new THREE.Group(); consoleG.position.set(mAt.x, 0, mAt.z); consoleG.rotation.y = -0.12; scene.add(consoleG);
  const deskMat = mat(0x232a58, { metalness: 0.4, roughness: 0.4 });
  rbox(2.3, 0.06, 0.8, 0.02, deskMat, 0, 0.95, 0, consoleG);
  for (const dx of [-1.1, 1.1]) rbox(0.06, 0.93, 0.76, 0.02, deskMat, dx, 0.47, 0, consoleG);
  box(2.2, 0.8, 0.04, dark, 0, 0.5, -0.36, consoleG);
  const codeTex = canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = '#04122a'; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 6; y += 9) { let x = 10 + Math.floor(rnd() * 3) * 10; const n = 2 + Math.floor(rnd() * 4); for (let i = 0; i < n; i++) { const l = 14 + rnd() * 50; g.fillStyle = ['#25e6ff', '#ff7ae8', '#ffd23a', '#7affc0'][Math.floor(rnd() * 4)]; g.fillRect(x, y, l, 4); x += l + 6; } }
  }).tex;
  for (const [dx, ry] of [[-0.78, 0.42], [0, 0], [0.78, -0.42]]) {
    const mon = new THREE.Group(); mon.position.set(dx, 1.28, 0.05); mon.rotation.y = ry; consoleG.add(mon);
    rbox(0.72, 0.44, 0.04, 0.015, dark, 0, 0, 0, mon); box(0.04, 0.2, 0.04, steel, 0, -0.3, -0.02, mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.38), new THREE.MeshBasicMaterial({ map: codeTex, color: new THREE.Color(1.4, 1.4, 1.4), toneMapped: false })); scr.position.z = 0.025; mon.add(scr);
  }
  box(0.5, 0.015, 0.16, dark, 0, 0.99, 0.22, consoleG);
  strip([mAt.x - 1.1, 0.04, mAt.z + 0.42], [mAt.x + 1.1, 0.04, mAt.z + 0.42], 0x25e6ff, 1.8, 0.02);

  // ---- workbench with gear (Falco)
  const benchAt = atHeight(ST.falco[0], ST.falco[1] + 7, 0.9);
  const bench = new THREE.Group(); bench.position.set(benchAt.x, 0, benchAt.z); bench.rotation.y = -0.25; scene.add(bench);
  rbox(2.0, 0.08, 0.8, 0.02, mat(0x4a3a30, { roughness: 0.6 }), 0, 0.9, 0, bench);
  box(1.9, 0.82, 0.05, mat(0x2a2228), 0, 0.45, -0.37, bench);
  for (const dx of [-0.9, 0.9]) box(0.08, 0.86, 0.75, mat(0x2a2228), dx, 0.43, 0, bench);
  rbox(0.5, 0.3, 0.35, 0.03, mat(0x3a4054), -0.6, 1.09, -0.1, bench);
  box(0.42, 0.22, 0.02, neon(0x05d9e8, 0.9), -0.6, 1.1, 0.08, bench);
  rbox(0.35, 0.18, 0.3, 0.03, mat(0x2b2f44), 0.55, 1.03, -0.05, bench);
  box(0.04, 0.04, 0.04, neon(0xffd23a, 1.6), 0.75, 1.15, 0.1, bench);
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 16), mat(0x2a3266)); stool.position.set(0.1, 0.62, 0.7); bench.add(stool);
  box(0.04, 0.6, 0.04, steel, 0.1, 0.3, 0.7, bench);
  for (let i = 0; i < 4; i++) box(0.25, 0.25 + i * 0.05, 0.25, mat(0x22273e), -1.4 + (i % 2) * 0.3, 0.13 + i * 0.02, -0.6 + i * 0.25, bench);  // crates

  // ---- dark doorway in the right wall, server rack beside it
  const doorHit = onPlane(...ST.door, new THREE.Vector3(1, 0, 0), -(RIGHT - 0.05));
  const door = { z: Math.max(BACK + 1.6, Math.min(1.5, doorHit ? doorHit.z : -2)), w: 1.3, h: 2.45 };
  const doorG = new THREE.Group(); doorG.position.set(RIGHT, 0, door.z); doorG.rotation.y = -Math.PI / 2; scene.add(doorG);
  box(door.w, door.h, 0.1, new THREE.MeshBasicMaterial({ color: 0x020308 }), 0, door.h / 2, 0.02, doorG);
  box(door.w + 0.3, 0.15, 0.3, steel, 0, door.h + 0.07, 0.1, doorG);
  box(0.15, door.h, 0.3, steel, -door.w / 2 - 0.07, door.h / 2, 0.1, doorG);
  box(0.15, door.h, 0.3, steel, door.w / 2 + 0.07, door.h / 2, 0.1, doorG);
  box(0.9, 0.05, 0.05, neon(0x2a8cff, 3.2), 0, door.h + 0.28, 0.25, doorG);
  const offline = box(0.14, 0.05, 0.05, neon(0xff3a4a, 2), door.w / 2 + 0.3, door.h - 0.2, 0.25, doorG);
  const rack = new THREE.Group(); rack.position.set(RIGHT - 0.5, 0, door.z - door.w / 2 - 0.75); rack.rotation.y = -Math.PI / 2; scene.add(rack);
  box(0.9, 2.0, 0.7, mat(0x0d1026, { metalness: 0.6, roughness: 0.4 }), 0, 1.0, 0, rack);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    box(0.78, 0.14, 0.02, mat(0x171b3a), 0, 0.3 + i * 0.19, 0.36, rack);
    leds.push(box(0.03, 0.03, 0.01, neon(i % 3 ? 0x3aff8a : 0xff3a4a, 1.5), 0.3, 0.3 + i * 0.19, 0.38, rack));
    leds.push(box(0.03, 0.03, 0.01, neon(0x25e6ff, 1.2), 0.22, 0.3 + i * 0.19, 0.38, rack));
  }

  // ---- David's command pad: a lit disc on the floor under his station
  const dAt = atHeight(ST.david[0], ST.david[1] + 4, 0);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), mat(0x120d30, { metalness: 0.6, roughness: 0.3 })); pad.rotation.x = -Math.PI / 2; pad.position.set(dAt.x, 0.014, dAt.z); scene.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.88, 48), neon(0xffd23a, 1.8)); padRing.rotation.x = -Math.PI / 2; padRing.position.set(dAt.x, 0.02, dAt.z); scene.add(padRing);
  glow(0xffd23a, dAt.x, 0.02, dAt.z, 2.8, 2.8, 0.4);

  // ---- a lived-in room: back-wall furniture, a laptop, a cat, wall decor, and machines that move
  const credWood = mat(0x3a2c3c, { roughness: 0.55 });
  (function vendingMachine() {
    const g = new THREE.Group(); g.position.set(-5.5, 0, BACK + 0.55); scene.add(g);
    rbox(1.0, 1.95, 0.78, 0.04, mat(0x1c2358, { metalness: 0.5, roughness: 0.4 }), 0, 0.98, 0, g);
    const tex = canvasTexture(256, 480, (c, w, h) => {
      c.fillStyle = '#0a0f2c'; c.fillRect(0, 0, w, h);
      const cols = ['#ff3ad0', '#25e6ff', '#ffd23a', '#7affc0', '#ff6a3a', '#9a5bff'];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
        const x = 18 + k * 52, y = 60 + r * 62, col = cols[(r * 3 + k * 2) % cols.length];
        c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x - 4, y - 4, 48, 58);
        c.fillStyle = col; c.fillRect(x + 8, y + 4, 24, 42); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 11, y + 6, 4, 36);
        c.fillStyle = '#e8f6ff'; c.fillRect(x + 8, y + 18, 24, 8);
      }
      c.fillStyle = '#ff3ad0'; c.fillRect(0, 0, w, 40); c.fillStyle = '#fff'; c.font = `bold 26px ${JP}`; c.textAlign = 'center'; c.fillText('ドリンク', w / 2, 29);
      c.fillStyle = '#04061a'; c.fillRect(30, h - 70, 130, 54); c.fillStyle = '#25e6ff'; c.fillRect(190, h - 70, 40, 54);
    }).tex;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.65), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false }));
    front.position.set(0, 1.0, 0.395); g.add(front);
    for (const sx of [-1, 1]) box(0.04, 1.9, 0.04, neon(0x25e6ff, 2), sx * 0.52, 0.98, 0.39, g);
    glow(0x25e6ff, -5.5, 0.015, BACK + 1.5, 2.4, 2.0, 0.35);
  })();
  (function arcadeCabinet() {
    const g = new THREE.Group(); g.position.set(-4.3, 0, BACK + 0.55); scene.add(g);
    const body = mat(0x22103e, { roughness: 0.5, metalness: 0.3 });
    rbox(0.72, 1.0, 0.62, 0.03, body, 0, 0.5, 0, g);
    rbox(0.72, 0.8, 0.5, 0.03, body, 0, 1.4, -0.06, g);
    const panel = rbox(0.72, 0.08, 0.4, 0.02, mat(0x3a1a6a), 0, 1.02, 0.28, g); panel.rotation.x = 0.18;
    const marquee = canvasTexture(256, 64, (c, w) => { c.fillStyle = '#10062a'; c.fillRect(0, 0, w, 64); c.fillStyle = '#ffd23a'; c.shadowColor = '#ffd23a'; c.shadowBlur = 12; c.font = 'bold 40px "Courier New",monospace'; c.textAlign = 'center'; c.fillText('STAR RUN', w / 2, 46); }).tex;
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.16), new THREE.MeshBasicMaterial({ map: marquee, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false })); mq.position.set(0, 1.74, 0.2); g.add(mq);
    const scr = canvasTexture(128, 96, () => {});
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ map: scr.tex, color: new THREE.Color(1.4, 1.4, 1.4), toneMapped: false })); sm.position.set(0, 1.4, 0.195); sm.rotation.x = -0.1; g.add(sm);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), steel); stick.position.set(-0.15, 1.1, 0.3); g.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), neon(0xff3a4a, 1.6)); ball.position.set(-0.15, 1.16, 0.3); g.add(ball);
    [0x25e6ff, 0xffd23a, 0xff3ad0].forEach((c, i) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), neon(c, 1.5)); b.position.set(0.02 + i * 0.1, 1.085, 0.31); g.add(b); });
    for (const sx of [-1, 1]) box(0.03, 1.7, 0.03, neon(0xff3ad0, 2), sx * 0.37, 0.9, 0.3, g);
    glow(0xff3ad0, -4.3, 0.015, BACK + 1.5, 2.0, 1.8, 0.3);
    tickers.push(every(0.16, (t) => {
      const c = scr.g; c.fillStyle = '#02030c'; c.fillRect(0, 0, 128, 96);
      for (let i = 0; i < 18; i++) { c.fillStyle = '#fff'; c.fillRect((i * 37 + t * 20) % 128, (i * 53) % 96, 1, 1); }
      const sx = Math.sin(t * 0.8) * 16, step = Math.floor(t * 2) % 2;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { const x = 14 + sx + k * 14, y = 18 + r * 12 + step * 2; c.fillStyle = ['#ff3ad0', '#25e6ff', '#ffd23a'][r]; c.fillRect(x, y, 9, 6); c.fillStyle = '#02030c'; c.fillRect(x + 2, y + 2, 1, 1); c.fillRect(x + 6, y + 2, 1, 1); }
      const px2 = 64 + Math.sin(t * 1.9) * 40; c.fillStyle = '#7affc0'; c.fillRect(px2 - 5, 84, 10, 4); c.fillRect(px2 - 1, 80, 2, 4);
      c.fillStyle = '#fff'; c.fillRect(px2, 80 - ((t * 70) % 60), 1, 4);
      c.fillStyle = '#ffd23a'; c.font = '8px monospace'; c.textAlign = 'left'; c.fillText('SCORE ' + String(Math.floor(t * 13) * 10).padStart(6, '0'), 4, 9);
      scr.tex.needsUpdate = true;
    }));
  })();
  (function credenza() {  // a low sideboard under the glass: record player, speakers, plants
    const g = new THREE.Group(); g.position.set(1.0, 0, BACK + 0.55); scene.add(g);
    rbox(3.6, 0.5, 0.56, 0.03, credWood, 0, 0.32, 0, g);
    for (const dx of [-1.6, 1.6]) box(0.05, 0.1, 0.05, steel, dx, 0.05, 0, g);
    for (let i = 0; i < 3; i++) box(1.1, 0.38, 0.02, mat(0x2c2040), -1.2 + i * 1.2, 0.33, 0.285, g);
    box(3.5, 0.02, 0.02, neon(0xff3ad0, 1.6), 0, 0.08, 0.29, g);
    rbox(0.55, 0.06, 0.42, 0.015, dark, -1.1, 0.6, 0, g);
    const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 28), mat(0x050510, { metalness: 0.5, roughness: 0.3 })); rec.position.set(-1.12, 0.64, 0); g.add(rec);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 12), neon(0xff3ad0, 1.5)); dot.position.set(0.08, 0.008, 0); rec.add(dot);
    tickers.push((t) => { rec.rotation.y = t * 3.5; });
    for (const dx of [-0.4, 0.75]) {
      rbox(0.34, 0.56, 0.32, 0.02, dark, dx, 0.85, 0, g);
      const wf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), neon(0x25e6ff, 0.5)); wf.position.set(dx, 0.76, 0.165); g.add(wf);
      const tw = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), neon(0xff3ad0, 0.8)); tw.position.set(dx, 0.98, 0.165); g.add(tw);
    }
    plant(1.0 + 1.55, BACK + 0.55, 0.55, 0.57); plant(1.0 + 0.2, BACK + 0.55, 0.4, 0.57);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 14, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.2, 0.7), side: THREE.DoubleSide, toneMapped: false })); lamp.position.set(1.2, 0.88, 0); g.add(lamp);
    box(0.015, 0.25, 0.015, steel, 1.2, 0.7, 0, g);
  })();
  // laptop on the coffee table
  rbox(0.38, 0.015, 0.26, 0.005, dark, -0.05, 0.44, 0.1, tbl);
  const lapScr = rbox(0.38, 0.24, 0.012, 0.004, dark, -0.05, 0.55, -0.04, tbl); lapScr.rotation.x = -0.3;
  const lapFace = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshBasicMaterial({ map: codeTex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false })); lapFace.position.z = 0.008; lapScr.add(lapFace);
  for (const [dx, dz, c] of [[-1.35, -0.1, 0xe0308a], [-1.0, -0.65, 0x25c8e8]]) {  // floor poufs next to the egg chair
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 20), mat(c, { roughness: 0.9 })); p.position.set(eggAt.x + dx, 0.15, eggAt.z + dz); scene.add(p);
  }
  (function sleepingCat() {
    const g = new THREE.Group(); g.position.set(slen / 2 - 1.25, 0.64, 0.12); g.rotation.y = 0.4; sofa.add(g);
    const fur = mat(0x303660, { roughness: 0.95, emissive: 0x0a0e30, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur); body.scale.set(0.24, 0.12, 0.14); body.position.y = 0.1; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), fur); head.position.set(0.22, 0.11, 0); g.add(head);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), fur); ear.position.set(0.23, 0.2, s * 0.05); g.add(ear); }
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, 0.08, 0.05), new THREE.Vector3(-0.32, 0.07, 0.12), new THREE.Vector3(-0.38, 0.1, 0.2), new THREE.Vector3(-0.3, 0.12, 0.27)]), 12, 0.02, 6), fur); g.add(tail);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), neon(0x25e6ff, 2)); collar.position.set(0.16, 0.1, 0); collar.rotation.y = Math.PI / 2; g.add(collar);
    tickers.push((t) => { body.scale.y = 0.12 * (1 + 0.05 * Math.sin(t * 1.6)); });
  })();
  // wall decor: posters on the left wall, a live clock and a sign over the server-room door
  [[-5.1, 'violet', 1], [-3.7, 'pink', 2]].forEach(([z, k, id]) => {
    const tex = canvasTexture(192, 288, (g, w, h) => girlBoard(g, w, h, GIRLS[k], 0.5, id)).tex;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.2, 1.2, 1.2), toneMapped: false }));
    p.rotation.y = Math.PI / 2; p.position.set(LEFT + 0.09, 4.95, z); scene.add(p);
    box(0.05, 1.62, 1.12, mat(0x0a0d22), LEFT + 0.03, 4.95, z);
  });
  const clockC = canvasTexture(256, 96, () => {});
  const clockMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), new THREE.MeshBasicMaterial({ map: clockC.tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false }));
  clockMesh.rotation.y = -Math.PI / 2; clockMesh.position.set(RIGHT - 0.04, 4.5, door.z - 1.3); scene.add(clockMesh);
  tickers.push(every(1, () => {
    const g = clockC.g, d = new Date(); g.fillStyle = '#050a1c'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#25e6ff'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 90);
    g.textAlign = 'center'; g.fillStyle = '#25e6ff'; g.shadowColor = '#25e6ff'; g.shadowBlur = 12; g.font = 'bold 50px "Courier New",monospace'; g.fillText(d.toLocaleTimeString('en-GB'), 128, 56);
    g.shadowBlur = 0; g.font = '16px monospace'; g.fillStyle = '#ff7ae8'; g.fillText(d.toDateString().toUpperCase(), 128, 82); clockC.tex.needsUpdate = true;
  }));
  const srv = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), toneMapped: false, map: canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#10051c'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff5a6a'; g.shadowColor = '#ff3a4a'; g.shadowBlur = 10; g.font = `bold 38px ${JP}`; g.textAlign = 'center'; g.fillText('サーバー室', w / 2, 46);
    g.shadowBlur = 0; g.strokeStyle = '#ff3a4a'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  }).tex }));
  srv.position.set(0, door.h + 0.62, 0.14); doorG.add(srv);
  // a robot vacuum that wanders the front of the room, and a patrol drone
  const robo = new THREE.Group(); scene.add(robo);
  const roboBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 24), mat(0x2a2f55, { metalness: 0.5, roughness: 0.4 })); roboBody.position.y = 0.04; robo.add(roboBody);
  const roboRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.01, 6, 28), neon(0x25e6ff, 2)); roboRing.rotation.x = Math.PI / 2; roboRing.position.y = 0.08; robo.add(roboRing);
  box(0.07, 0.02, 0.04, neon(0xff3ad0, 2), 0, 0.085, 0.14, robo);
  const RX = (sx0 + sx1) / 2 + 0.6, RZ = tableAt.z + 0.75;
  tickers.push((t) => {
    const u = t * 0.22; robo.position.set(RX + Math.sin(u) * 2.6, 0, RZ + Math.sin(u * 2) * 0.3);
    robo.rotation.y = Math.atan2(Math.cos(u) * 2.6, Math.cos(u * 2) * 0.6); globe.rotation.y = t * 0.8; globe.rotation.x = t * 0.3;
  });
  const drone = new THREE.Group(); drone.scale.setScalar(2.2); scene.add(drone);
  const dm = mat(0x1a1f3d, { metalness: 0.6, roughness: 0.4 });
  const dBody = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), dm); dBody.scale.y = 0.55; drone.add(dBody);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = box(0.2, 0.015, 0.02, dm, dx * 0.1, 0, dz * 0.1, drone); arm.rotation.y = dx * dz > 0 ? -Math.PI / 4 : Math.PI / 4;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.006, 16), new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.28 })); r.position.set(dx * 0.2, 0.03, dz * 0.2); drone.add(r);
  }
  const dLedA = box(0.04, 0.04, 0.04, neon(0xff3a4a, 2.5), 0, -0.07, 0.08, drone), dLedB = box(0.04, 0.04, 0.04, neon(0x25e6ff, 2.5), 0, -0.07, -0.08, drone);
  tickers.push((t) => {
    drone.position.set(0.5 + Math.sin(t * 0.3) * 4.2, 2.9 + Math.sin(t * 1.3) * 0.12, -1.8 + Math.sin(t * 0.6) * 0.7); drone.rotation.z = -Math.cos(t * 0.3) * 0.15;
    dLedA.visible = Math.floor(t * 2) % 2 === 0; dLedB.visible = !dLedA.visible;
  });

  // ---- light: a dim cool fill, coloured light from the billboards, a warm lamp, the blue holo glow
  const ambient = new THREE.AmbientLight(0x3a4aa0, 0.22), hemi = new THREE.HemisphereLight(0x5a78ff, 0x05050f, 0.3);
  scene.add(ambient, hemi);
  const rim = new THREE.DirectionalLight(0x6aa8ff, 0.3); rim.position.set(-6, 3, -4); scene.add(rim);
  const pinkLight = new THREE.PointLight(0xff3ab8, 30, 11, 2); pinkLight.position.set(-3, 2.4, BACK + 2.2); scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x25d8ff, 26, 11, 2); cyanLight.position.set(3, 2.4, BACK + 2.2); scene.add(cyanLight);
  const goldLight = new THREE.PointLight(0xffc23a, 12, 8, 2); goldLight.position.set(6, 2.2, BACK + 2); scene.add(goldLight);

  // ---- post-processing: bloom only on the brightest parts (neon, screens, the city)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = room.clientWidth, h = room.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    draw(lastT);
  }

  // ---- the crew: stylized 3D characters, placed from each station's live screen position and driven by its live status
  const SK = '#ffdcc8', SPECS = {
    lucy: { style: 'twin', hair: '#ff7ac8', tip: '#ffb0e8', eye: '#ff3fb0', eye2: '#ffc8f0', skin: SK, top: '#2b1d4d', top2: '#ff8fd8', pants: '#1c1838', boots: '#ff8fd8', accent: '#ff8fd8', goggles: true, hoodie: true, bareArms: false, sig: 'cable', phase: 0.4 },
    rebecca: { style: 'bob', hair: '#37d98a', tip: '#8fff6a', eye: '#1fd070', eye2: '#d6ffd0', skin: SK, top: '#16363a', top2: '#2a5a52', pants: '#14283a', boots: '#8fff6a', accent: '#8fff6a', visor: true, clips: true, sig: 'scan', phase: 1.7 },
    kiwi: { style: 'buns', hair: '#ff6b7a', tip: '#ffb0a8', eye: '#ff4f6e', eye2: '#ffd8dc', skin: SK, top: '#3a1f44', top2: '#5a2f5a', pants: '#22172e', boots: '#ff6b7a', accent: '#ff6b7a', clips: true, sig: 'shards', skirt: '#3a1f44', phase: 2.9 },
    maine: { style: 'long', hair: '#ff9a4c', tip: '#ffd08a', eye: '#ff8a2a', eye2: '#fff0c0', skin: SK, top: '#3a2a26', top2: '#2a1d1a', pants: '#1f1a22', boots: '#ff9a4c', accent: '#ff9a4c', pads: '#ff9a4c', armBand: true, sig: 'map', phase: 3.6 },
    falco: { style: 'spiky', hair: '#5b3d24', tip: '#d9a066', eye: '#d9902a', eye2: '#ffe6b0', skin: '#f2c8a6', top: '#2f2a30', top2: '#4a3a2c', pants: '#2a2428', boots: '#3a2c24', accent: '#d9a066', bareArms: true, gloves: true, belt: true, tallBoots: true, goggles: true, wide: 1.3, sig: 'harness', phase: 4.4 },
    david: { style: 'cap', hair: '#23232e', tip: '#f5d300', eye: '#e8c000', eye2: '#fff4a0', skin: '#f4d2b8', top: '#1b1b26', top2: '#2a2a38', pants: '#16161f', boots: '#f5d300', accent: '#f5d300', headset: true, cloak: true, pads: '#f5d300', wide: 1.3, scale: 1.05, sig: 'halo', phase: 5.1 },
  };
  // pose, seat height, and how far below the station point (in screen %) the character's feet or seat sit
  const SPOT = { lucy: ['sit', 0.58, 7], rebecca: ['sit', 0.58, 7], kiwi: ['egg', 0.64, 6, 0.55, 0.05], maine: ['perch', 0.98, 7, 0, 0.32], falco: ['perch', 0.95, 7, 0.9, 0.3], david: ['stand', 0, 5] };
  const ROLE = { lucy: 'coder', rebecca: 'vision', kiwi: 'memory', maine: 'planner', falco: 'trimmer', david: 'claude-code' };  // station data-role (office.js)
  const crew = [];
  for (const [role, S] of Object.entries(SPECS)) {
    const ch = buildCharacter({ scale: 1.2, ...S }), [pose, h, dy, ray = h, dz = 0] = SPOT[role];
    scene.add(ch.root);
    crew.push({ role, ch, pose, h, dy, ray, dz, el: null, key: '', seen: false });
  }
  // hand-offs: a glowing data orb with a short trail flies in an arc from the sender's hands to the receiver while a result is passed on
  const orbs = new Map(), byRole = Object.fromEntries(crew.map((c) => [ROLE[c.role], c]));
  const orbMat = (col) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), toneMapped: false, transparent: true, depthWrite: false });
  const handPos = (c, v) => v.set(c.ch.root.position.x, c.ch.root.position.y + c.ch.chestLocal(c.pose) + 0.05, c.ch.root.position.z + 0.25);
  function orbsTick(t, packets) {
    const live = new Set();
    for (const q of packets) {
      const a = byRole[q.from], b = byRole[q.to];
      if (!a || !b || !a.el || !b.el) continue;
      live.add(q.id);
      let o = orbs.get(q.id);
      if (!o) {
        const g = new THREE.Group(), col = SPECS[a.role].accent, parts = [];
        for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 - i * 0.01, 10, 8), orbMat(col)); m.material.opacity = 1 - i * 0.16; g.add(m); parts.push(m); }
        scene.add(g); o = { g, parts, t0: t }; orbs.set(q.id, o);
      }
      const A = handPos(a, new THREE.Vector3()), B = handPos(b, new THREE.Vector3());
      o.parts.forEach((m, i) => {
        const u = (((t - o.t0) / 3.2 - i * 0.025) % 1 + 1) % 1;
        m.position.lerpVectors(A, B, u); m.position.y += 0.6 * Math.sin(Math.PI * u);
      });
    }
    for (const [id, o] of orbs) if (!live.has(id)) { scene.remove(o.g); orbs.delete(id); }
  }
  const crewTick = (t) => {
    const pk = (window.Office && window.Office.packets && window.Office.packets()) || [];
    for (const c of crew) {
      c.el = c.el || document.querySelector(`.station[data-role="${ROLE[c.role]}"]`);
      if (!c.el) { c.ch.root.visible = false; continue; }
      c.ch.root.visible = true;
      const key = c.el.style.left + c.el.style.top;
      if (key !== c.key) {  // the station was placed or dragged: stand where it points
        c.key = key;
        const p = atHeight(parseFloat(c.el.style.left) || 50, (parseFloat(c.el.style.top) || 60) + c.dy, c.ray);
        p.y = c.h; p.z += c.dz;
        p.x = Math.min(RIGHT - 1.7, Math.max(LEFT + 0.6, p.x));  // keep everyone inside the room
        c.ch.root.position.copy(p); c.ch.root.userData.base = p.clone();
        c.ch.root.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z) * 0.7;
      }
      const bub = c.el.nextElementSibling;  // the live bubble rides above the character's head, not the station point
      if (bub && bub.classList.contains('bub')) {
        const hv = new THREE.Vector3(c.ch.root.position.x, c.ch.root.position.y + c.ch.headLocal(c.pose) + 0.16, c.ch.root.position.z).project(camera);
        const rh = room.clientHeight, st = parseFloat(c.el.style.top) / 100 * rh, hy = (1 - hv.y) / 2 * rh;
        bub.style.marginTop = `${(hy - st + c.el.offsetHeight / 2 + 16).toFixed(0)}px`;
      }
      const cl = c.el.classList;
      const mode = cl.contains('s-busy') ? 'busy' : cl.contains('s-fail') ? 'fail' : cl.contains('s-off') ? 'off' : cl.contains('s-boss') ? 'boss' : 'idle';
      c.ch.update(t, { mode, pose: c.pose, selected: cl.contains('selected'), giving: pk.some((q) => q.from === ROLE[c.role]), receiving: pk.some((q) => q.to === ROLE[c.role]) });
    }
    orbsTick(t, pk);
  };

  // ---- animation: city lights and traffic, billboards, holo panels, flickering neon, rack LEDs
  let lastT = 0, lastCity = -1, sun = -1, hourAt = 0, hour = 0;
  // 0 = night, 1 = full day. Follows the clock (dawn 5:30-8:00, dusk 17:30-20:30) unless the LIGHT button forces night or day.
  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  function sunLevel() {
    const mode = (window.Office && window.Office.lightMode) || 'auto';
    if (mode === 'night') return 0;
    if (mode === 'day') return 1;
    if (performance.now() - hourAt > 20000) { const d = new Date(); hour = d.getHours() + d.getMinutes() / 60; hourAt = performance.now(); }
    return smooth(5.5, 8, hour) * (1 - smooth(17.5, 20.5, hour));
  }
  const DUSK = new THREE.Color(1, 0.55, 0.45), WHITE = new THREE.Color(1, 1, 1);
  function applySun(k) {
    skyVeil.material.opacity = 0.74 * k;
    skyVeil.material.color.copy(DUSK).lerp(WHITE, smooth(0.45, 0.95, k));
    dynMesh.material.opacity = 1 - 0.85 * k;
    ambient.intensity = 0.22 + 0.5 * k; hemi.intensity = 0.3 + 0.55 * k;
    bloom.strength = 0.6 - 0.28 * k;
  }
  function animate(t) {
    const k = sunLevel(); if (Math.abs(k - sun) > 0.004) { sun = k; applySun(k); }
    if (t - lastCity > 0.085) { lastCity = t; drawCity(t); drawRain(t); }
    for (const f of tickers) f(t);
    crewTick(t);
    for (const b of boards) if (t >= b.next) { b.next = t + b.period; b.draw(t); b.c.tex.needsUpdate = true; }
    for (const h of holos) if (t >= h.next) { h.next = t + 0.16; h.draw(h.c.g, 512, 212, t); h.c.tex.needsUpdate = true; }
    leds.forEach((l, i) => { l.visible = Math.floor(t * 1.5 + i * 0.7) % 3 !== 0; });
    offline.visible = Math.floor(t * 0.8) % 2 === 0;
    signMat.color.setScalar(Math.sin(t * 9) > 0.96 ? 0.5 : 1.5);
    const dim = 1 - 0.45 * sun;  // the coloured lights matter less in daylight
    holoLight.intensity = (24 + Math.sin(t * 2.1) * 3) * dim;
    pinkLight.intensity = (28 + Math.sin(t * 1.3) * 3) * dim; cyanLight.intensity = (24 + Math.sin(t * 1.7 + 1) * 3) * dim;
  }
  function draw(t) { animate(t); composer.render(); }

  if (reduceMotion) {  // one still frame, redrawn only on resize
    new ResizeObserver(resize).observe(room);
    resize();
    return;
  }
  let running = false, last = 0;
  const t0 = performance.now();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS - 1) return;  // cap at 30 fps
    last = now; lastT = (now - t0) / 1000;
    draw(lastT);
  }
  function start() { if (!running && !document.hidden) { running = true; requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else start(); });
  new ResizeObserver(resize).observe(room);
  resize();
  start();
}

main();
