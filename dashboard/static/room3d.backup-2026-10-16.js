// Night City Office: the room as a real-time 3D scene (three.js 0.169.0, vendored in static/vendor/three).
// A fixed camera looks into a night apartment; furniture is placed by projecting the stations' screen
// positions into the room, so the portraits (office.js) sit on their furniture. Everything is generated
// here: no images, no outside requests. Falls back to the room's CSS gradient when WebGL is unavailable.
import * as THREE from './vendor/three/three.module.min.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';

const FPS = 30;
// Station screen positions (% of the room) that furniture is built around: the starting layout.
const ST = { lucy: [20, 60], rebecca: [9, 58], kiwi: [58, 64], maine: [68, 52], falco: [76, 62], david: [45, 86], hermes: [92, 48] };

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
  scene.fog = new THREE.FogExp2(0x070a1c, 0.022);
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 60);
  camera.position.set(0.4, 3.0, 7.6);  // high and back, looking down into the room like the reference
  camera.lookAt(0.6, 0.7, -4);
  camera.updateMatrixWorld();

  // ---- helpers
  const ray = new THREE.Raycaster();
  function onPlane(xp, yp, normal, constant) {
    ray.setFromCamera(new THREE.Vector2(xp / 50 - 1, 1 - yp / 50), camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(normal, constant), p) ? p : null;
  }
  const atHeight = (xp, yp, y) => onPlane(xp, yp, new THREE.Vector3(0, 1, 0), -y);   // point on the horizontal plane at height y
  const atDepth = (xp, yp, z) => onPlane(xp, yp, new THREE.Vector3(0, 0, 1), -z);    // point on the vertical plane at depth z
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, ...o });
  const neon = (color, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
  function box(w, h, d, material, x, y, z, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); parent.add(m); return m;
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
  let seed = 2077;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---- room shell: floor, back wall, side walls, ceiling
  const BACK = -6, LEFT = -7.5, RIGHT = 7.5, TOP = 3.6;
  const wallMat = mat(0x1a2150), darkWall = mat(0x121838);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), mat(0x10142e, { roughness: 0.55, metalness: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); scene.add(floor);
  for (let x = -9; x <= 9; x += 1.5) box(0.015, 0.002, 14, mat(0x1b2148), x, 0.002, -1);  // floor tile seams
  for (let z = -6; z <= 6; z += 1.5) box(20, 0.002, 0.015, mat(0x1b2148), 0, 0.002, z);
  box(20, TOP, 0.2, wallMat, 0, TOP / 2, BACK - 0.1);
  box(0.2, TOP, 14, darkWall, LEFT - 0.1, TOP / 2, -1);
  box(0.2, TOP, 14, darkWall, RIGHT + 0.1, TOP / 2, -1);
  box(20, 0.2, 14, mat(0x0b0e22), 0, TOP + 0.1, -1);
  for (const x of [-4.5, 0.5, 4.5]) box(0.5, 0.35, 14, mat(0x0e1230), x, TOP - 0.17, -1);  // ceiling beams
  strip([-8, 0.05, BACK + 0.06], [8, 0.05, BACK + 0.06], 0x05d9e8, 1.6, 0.02);             // cyan baseboard

  // ---- big window on the left of the back wall, with a generated night skyline
  const WIN = { x0: LEFT + 0.2, x1: -2.4, y0: 0.75, y1: 2.85 };
  const sky = canvasTexture(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#03061a'); grad.addColorStop(0.55, '#0a1d4a'); grad.addColorStop(1, '#1b6c9a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // two layers of towers: far ones hazy with few lights, near ones darker with lit floors, signs and beacons
    for (const [shade, minH, maxH, lit, near] of [['#13285a', 0.3, 0.7, 0.05, false], ['#060d26', 0.3, 0.9, 0.09, true]]) {
      for (let x = -10; x < w;) {
        const bw = 40 + rnd() * 90, bh = h * (minH + rnd() * (maxH - minH)), top = h - bh;
        g.fillStyle = shade; g.fillRect(x, top, bw, bh);
        for (let wy = top + 10; wy < h - 6; wy += 11) {
          if (rnd() < 0.12) { g.fillStyle = 'rgba(120,220,255,.55)'; g.fillRect(x + 4, wy, bw - 8, 2); continue; }  // a lit floor band
          for (let wx = x + 6; wx < x + bw - 6; wx += 10)
            if (rnd() < lit) { g.fillStyle = ['#59e8ff', '#ffd84a', '#ff5ad8', '#bfe9ff'][Math.floor(rnd() * 4)]; g.fillRect(wx, wy, 4, 5); }
        }
        if (near && rnd() < 0.35) { g.fillStyle = rnd() < 0.5 ? '#ff3a9a' : '#2af0ff'; g.fillRect(x + bw * 0.15, top + 18 + rnd() * 40, bw * 0.7, 12); }
        if (near && rnd() < 0.5) { g.fillStyle = '#ff4040'; g.fillRect(x + bw / 2 - 2, top - 12, 3, 12); g.fillRect(x + bw / 2 - 3, top - 14, 5, 4); }
        x += bw + rnd() * 10;
      }
    }
  });
  const winW = WIN.x1 - WIN.x0, winH = WIN.y1 - WIN.y0;
  const city = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ map: sky.tex, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false }));
  city.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, BACK + 0.02); scene.add(city);
  const frameMat = mat(0x2a3270, { metalness: 0.5, roughness: 0.4 });
  box(winW + 0.2, 0.12, 0.2, frameMat, city.position.x, WIN.y1 + 0.06, BACK + 0.08);
  box(winW + 0.2, 0.16, 0.35, frameMat, city.position.x, WIN.y0 - 0.08, BACK + 0.15);           // sill
  box(0.12, winH, 0.2, frameMat, WIN.x1 + 0.06, city.position.y, BACK + 0.08);
  strip([WIN.x0, WIN.y0 - 0.17, BACK + 0.33], [WIN.x1, WIN.y0 - 0.17, BACK + 0.33], 0xffd23a, 2.2, 0.02);
  const winLight = new THREE.PointLight(0x3a8cff, 18, 9, 2); winLight.position.set(city.position.x, 1.8, BACK + 1.2); scene.add(winLight);

  // ---- magenta alcove with a bed, centre-left of the back wall
  const AL = { x: -0.6, w: 2.6, h: 2.5, d: 1.4 };
  box(AL.w + 0.3, AL.h + 0.25, 0.25, mat(0x2a1450), AL.x, (AL.h + 0.25) / 2, BACK + 0.15);      // frame
  const alcove = new THREE.Group(); alcove.position.set(AL.x, 0, BACK + 0.3); scene.add(alcove);
  box(AL.w, AL.h, 0.05, mat(0x5a1a7a, { emissive: 0x6a1a8a, emissiveIntensity: 0.6 }), 0, AL.h / 2, -0.02, alcove);
  box(AL.w * 0.85, 0.35, 0.9, mat(0xc04ab0, { emissive: 0x7a2070, emissiveIntensity: 0.5 }), 0, 0.2, 0.5, alcove);  // bed
  const alcoveTube = box(AL.w * 0.45, 0.04, 0.04, neon(0xff4fd8, 3.5), -0.3, AL.h - 0.25, 0.1, alcove);
  box(AL.w * 0.9, 0.03, 0.03, neon(0xffd23a, 2.4), 0, 0.04, 0.95, alcove);
  const alcoveLight = new THREE.PointLight(0xff3ad0, 30, 7, 2); alcoveLight.position.set(AL.x, 1.5, BACK + 1.2); scene.add(alcoveLight);

  // ---- dark doorway in the right wall where Hermes' station projects, server rack beside it
  const doorHit = onPlane(...ST.hermes, new THREE.Vector3(1, 0, 0), -(RIGHT - 0.05));
  const door = { z: Math.max(BACK + 1.2, Math.min(1.5, doorHit ? doorHit.z : -2)), w: 1.3, h: 2.45 };
  const doorG = new THREE.Group(); doorG.position.set(RIGHT, 0, door.z); doorG.rotation.y = -Math.PI / 2; scene.add(doorG);
  box(door.w, door.h, 0.1, new THREE.MeshBasicMaterial({ color: 0x020308 }), 0, door.h / 2, 0.02, doorG);
  box(door.w + 0.3, 0.15, 0.3, frameMat, 0, door.h + 0.07, 0.1, doorG);
  box(0.15, door.h, 0.3, frameMat, -door.w / 2 - 0.07, door.h / 2, 0.1, doorG);
  box(0.15, door.h, 0.3, frameMat, door.w / 2 + 0.07, door.h / 2, 0.1, doorG);
  box(0.9, 0.05, 0.05, neon(0x2a8cff, 3.2), 0, door.h + 0.28, 0.25, doorG);
  const rack = new THREE.Group(); rack.position.set(RIGHT - 0.5, 0, door.z - door.w / 2 - 0.75); rack.rotation.y = -Math.PI / 2; scene.add(rack);
  box(0.9, 2.0, 0.7, mat(0x0d1026, { metalness: 0.6, roughness: 0.4 }), 0, 1.0, 0, rack);
  const leds = [];
  for (let i = 0; i < 9; i++) {
    box(0.78, 0.14, 0.02, mat(0x171b3a), 0, 0.3 + i * 0.19, 0.36, rack);
    leds.push(box(0.03, 0.03, 0.01, neon(0xff3a4a, 1.5), 0.3, 0.3 + i * 0.19, 0.38, rack));
  }

  // ---- curved holographic screens hanging above the middle
  const holoAt = atHeight(60, 62, 0) || new THREE.Vector3(2, 0, -2.5);
  const holo = new THREE.Group(); holo.position.set(holoAt.x, 2.85, holoAt.z - 0.6); scene.add(holo);
  box(0.25, 0.7, 0.25, mat(0x1a2050, { metalness: 0.6 }), 0, 0.45, 0, holo);  // hub to the ceiling
  const screenTex = [];
  function screenImage(g, w, h, k) {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0b4fd6'); grad.addColorStop(1, '#1aa8ff'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,240,255,.35)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#e8fbff'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * 0.55 + Math.sin(x / 22 + k) * h * 0.16 * Math.sin(x / 90 + k * 2));
    g.stroke();
    g.fillStyle = 'rgba(232,251,255,.85)';
    for (let i = 0; i < 9; i++) g.fillRect(14 + i * 22, h - 14 - (8 + ((i * 37 + k * 11) % 40)), 12, 8 + ((i * 37 + k * 11) % 40));
    g.strokeStyle = 'rgba(232,251,255,.9)'; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
  }
  [[1.9, 1.0, -0.3, 2.3, 0, 3], [2.35, 0.8, 2.3, 1.7, -0.75, 7], [1.5, 0.75, 4.2, 1.5, -0.55, 11]].forEach(([r, hgt, start, len, dy, k]) => {
    const t = canvasTexture(512, 160, (g, w, h) => screenImage(g, w, h, k));
    t.tex.wrapS = THREE.RepeatWrapping;
    screenTex.push(t.tex);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 48, 1, true, start, len),
      new THREE.MeshBasicMaterial({ map: t.tex, color: new THREE.Color(1.4, 1.4, 1.6), side: THREE.DoubleSide, transparent: true,
                                    opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.y = dy; holo.add(m);
  });
  const holoLight = new THREE.PointLight(0x2a8cff, 30, 8, 2); holoLight.position.set(holo.position.x, 2.2, holo.position.z); scene.add(holoLight);

  // ---- sunken lounge with the sofa (Rebecca at the left end, Lucy in the middle) and a low table
  const sofaL = atHeight(ST.rebecca[0] - 3, ST.rebecca[1] + 7, 0.45), sofaR = atHeight(ST.lucy[0] + 11, ST.lucy[1] + 7, 0.45);
  const sofa = new THREE.Group(); scene.add(sofa);
  const sz = (sofaL.z + sofaR.z) / 2, sx0 = Math.max(LEFT + 0.3, sofaL.x), sx1 = sofaR.x, slen = sx1 - sx0;
  sofa.position.set(sx0 + slen / 2, 0, sz);
  const sofaMat = mat(0x232f72, { roughness: 0.7 }), cushionMat = mat(0x2d3c8e, { roughness: 0.65 });
  box(slen + 0.4, 0.3, 1.0, sofaMat, 0, 0.15, 0, sofa);                                   // base
  box(slen + 0.4, 0.75, 0.3, sofaMat, 0, 0.55, -0.5, sofa);                               // back
  const n = Math.max(3, Math.round(slen / 0.75));
  for (let i = 0; i < n; i++) {
    box(slen / n - 0.05, 0.16, 0.85, cushionMat, -slen / 2 + slen / n * (i + 0.5), 0.38, 0.05, sofa);
    box(slen / n - 0.05, 0.5, 0.18, cushionMat, -slen / 2 + slen / n * (i + 0.5), 0.72, -0.32, sofa);
  }
  box(0.3, 0.55, 1.0, sofaMat, -slen / 2 - 0.2, 0.42, 0, sofa); box(0.3, 0.55, 1.0, sofaMat, slen / 2 + 0.2, 0.42, 0, sofa);
  strip([sx0, 0.03, sz + 0.55], [sx1, 0.03, sz + 0.55], 0xff4fd8, 2, 0.025);             // magenta glow under the sofa
  const tableAt = atHeight(ST.lucy[0] + 6, ST.lucy[1] + 18, 0.3);
  if (tableAt) {
    box(1.5, 0.06, 0.7, mat(0x2a3266, { metalness: 0.6, roughness: 0.35 }), tableAt.x, 0.36, tableAt.z);
    for (const [dx, dz] of [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]]) box(0.04, 0.33, 0.04, mat(0x151a38), tableAt.x + dx, 0.17, tableAt.z + dz);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 10), mat(0x9fdcff, { transparent: true, opacity: 0.6, roughness: 0.1 }));
      b.position.set(tableAt.x - 0.4 + i * 0.18, 0.5, tableAt.z); scene.add(b);
    }
    // the lounge floor step, edged with light
    const lx0 = LEFT + 0.2, lx1 = tableAt.x + 1.6, lz1 = tableAt.z + 1.1;
    box(lx1 - lx0, 0.12, 0.25, mat(0x161c40), (lx0 + lx1) / 2, 0.06, lz1);
    strip([lx0, 0.13, lz1 + 0.13], [lx1, 0.13, lz1 + 0.13], 0x05d9e8, 1.6, 0.015);
  }

  // ---- egg chair (Kiwi)
  const eggAt = atHeight(ST.kiwi[0], ST.kiwi[1] + 6, 0.55);
  // a shell open towards the camera: the gap in the sphere is centred on +z (phi = pi/2), then turned to face the camera
  const egg = new THREE.Group(); egg.position.set(eggAt.x, 0, eggAt.z); scene.add(egg);
  egg.rotation.y = Math.atan2(camera.position.x - eggAt.x, camera.position.z - eggAt.z);
  const GAP = Math.PI * 0.8;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20, Math.PI / 2 + GAP / 2, Math.PI * 2 - GAP, 0, Math.PI * 0.66),
    mat(0xc9cde6, { side: THREE.DoubleSide, roughness: 0.4 }));
  shell.scale.set(1, 1.2, 1); shell.position.y = 0.9; egg.add(shell);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.12, 24), mat(0x2a2f5a)); seat.position.y = 0.52; egg.add(seat);
  for (const a of [0.4, 2.5, 4.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), mat(0x8a90b8, { metalness: 0.7 }));
    leg.position.set(Math.cos(a) * 0.32, 0.25, Math.sin(a) * 0.32); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); egg.add(leg);
  }

  // ---- workbench with gear (Falco)
  const benchAt = atHeight(ST.falco[0], ST.falco[1] + 7, 0.9);
  const bench = new THREE.Group(); bench.position.set(benchAt.x, 0, benchAt.z); bench.rotation.y = -0.25; scene.add(bench);
  box(2.0, 0.08, 0.8, mat(0x4a3a30, { roughness: 0.6 }), 0, 0.9, 0, bench);
  box(1.9, 0.82, 0.05, mat(0x2a2228), 0, 0.45, -0.37, bench);
  for (const dx of [-0.9, 0.9]) box(0.08, 0.86, 0.75, mat(0x2a2228), dx, 0.43, 0, bench);
  box(0.5, 0.3, 0.35, mat(0x3a4054), -0.6, 1.09, -0.1, bench);
  box(0.42, 0.22, 0.02, neon(0x05d9e8, 0.9), -0.6, 1.1, 0.08, bench);
  box(0.35, 0.18, 0.3, mat(0x2b2f44), 0.55, 1.03, -0.05, bench);
  box(0.04, 0.04, 0.04, neon(0xffd23a, 1.6), 0.75, 1.15, 0.1, bench);
  for (let i = 0; i < 4; i++) box(0.25, 0.25 + i * 0.05, 0.25, mat(0x22273e), -1.4 + (i % 2) * 0.3, 0.13 + i * 0.02, -0.6 + i * 0.25, bench);  // crates

  // ---- ceiling ring light and neon strips (yellow and cyan, like the reference)
  const ringAt = new THREE.Vector3(-3.4, TOP - 0.2, -3.4);  // over the lounge, well behind the camera's near ceiling
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 64), neon(0xe8f03a, 2.4));
  ring.rotation.x = Math.PI / 2; ring.position.copy(ringAt); scene.add(ring);
  const ringLight = new THREE.PointLight(0xfff07a, 3, 5, 2); ringLight.position.copy(ringAt).add(new THREE.Vector3(0, -0.3, 0)); scene.add(ringLight);
  strip([RIGHT - 0.05, TOP - 0.1, -3.6], [RIGHT - 0.05, TOP - 0.55, 1.6], 0xe8f03a, 2.2, 0.025);
  strip([LEFT + 0.05, 0.05, -5.8], [LEFT + 0.05, 0.05, 3], 0x05d9e8, 1.2, 0.02);

  // ---- light: a dim cool fill, the coloured sources above, a rim from the city
  scene.add(new THREE.AmbientLight(0x3a4aa0, 0.18));
  scene.add(new THREE.HemisphereLight(0x5a78ff, 0x05050f, 0.25));
  const rim = new THREE.DirectionalLight(0x6aa8ff, 0.35); rim.position.set(-6, 3, -4); scene.add(rim);

  // ---- post-processing: bloom only on the brightest parts (neon, screens)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.82);
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

  // ---- animation: a slow scroll on the holo screens, flicker on the alcove tube and rack LEDs, city twinkle
  let lastT = 0;
  function animate(t) {
    screenTex.forEach((tx, i) => { tx.offset.x = (t * 0.02 * (i % 2 ? -1 : 1)) % 1; });
    alcoveTube.material.color.setScalar(1).multiply(new THREE.Color(0xff4fd8)).multiplyScalar(Math.sin(t * 13) > 0.97 ? 1.2 : 3.5);
    leds.forEach((l, i) => { l.visible = Math.floor(t * 1.5 + i * 0.7) % 3 !== 0; });
    holoLight.intensity = 28 + Math.sin(t * 2.1) * 3;
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
