// Night City Office: the crew as stylized anime-style 3D characters (three.js, vendored in static/vendor/three).
// Each character is built from toon-shaded primitives with a painted face, an ink outline, and a small skeleton of pivots
// that update() animates: breathing, looking around, blinking, typing, hand-offs, the boss on a call, a bad day, powered down.
// Everything is generated here: no images, no models, no outside requests. Characters face +z and stand on y = 0.
import * as THREE from './vendor/three/three.module.min.js';

const HR = 0.19;  // head radius (a big anime head)
const JP = '"Yu Gothic UI","Yu Gothic","Meiryo",sans-serif';
// body poses: hips height, thigh and shin angles (about x), leg spread, torso lean
export const POSE = {
  stand: { hipsY: 0.88, thigh: 0, shin: 0, spread: 0.03, lean: 0 },
  sit: { hipsY: 0.12, thigh: -1.7, shin: 1.7, spread: 0.1, lean: -0.12 },   // on the sofa, knees up
  perch: { hipsY: 0.12, thigh: -1.5, shin: 1.5, spread: 0.1, lean: -0.04 },  // sitting on the edge of a desk, legs dangling
  egg: { hipsY: 0.12, thigh: -1.9, shin: 2.5, spread: 0.2, lean: -0.2 },   // curled up in the egg chair
};
const toonGrad = (() => { const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
function pushed(geom, d) {  // a copy of the geometry pushed out along its normals: the inked outline (drawn back-faces only)
  const g = geom.clone(), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  return g;
}
function paintFace(S, expr) {  // the front of the head sphere (u = 0.25 is straight ahead)
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), w = 512, h = 256, x0 = w * 0.25, ey = h * 0.53, L = '#1a0d33';
  const sk = g.createLinearGradient(0, 0, 0, h); sk.addColorStop(0, S.skinHi || S.skin); sk.addColorStop(1, S.skin); g.fillStyle = sk; g.fillRect(0, 0, w, h);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const sx of [-1, 1]) {
    const ex = x0 + sx * w * 0.078, by = ey - 38;
    g.fillStyle = 'rgba(255,110,140,.32)'; g.beginPath(); g.ellipse(ex + sx * 2, ey + 36, 15, 8, 0, 0, 7); g.fill();
    g.strokeStyle = S.hair; g.lineWidth = S.brow || 4; g.beginPath();  // brow
    if (expr === 'sad') { g.moveTo(ex - sx * 15, by - 6); g.lineTo(ex + sx * 15, by + 4); }
    else if (expr === 'focus') { g.moveTo(ex - sx * 15, by + 4); g.lineTo(ex + sx * 15, by - 3); }
    else { g.moveTo(ex - 15, by + 3); g.quadraticCurveTo(ex, by - 4, ex + 15, by + 3); }
    g.stroke();
    if (expr === 'blink' || expr === 'off') { g.strokeStyle = L; g.lineWidth = 4; g.beginPath(); g.arc(ex, ey - 6, 15, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
    else if (expr === 'happy') { g.strokeStyle = L; g.lineWidth = 4.5; g.beginPath(); g.arc(ex, ey + 8, 15, 1.1 * Math.PI, 1.9 * Math.PI); g.stroke(); }
    else {
      const rh = expr === 'focus' ? 17 : 26;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 18, rh, 0, 0, 7); g.fill();
      const ir = g.createLinearGradient(0, ey - rh, 0, ey + rh); ir.addColorStop(0, S.eye2); ir.addColorStop(1, S.eye);
      g.fillStyle = ir; g.beginPath(); g.ellipse(ex, ey + 3, 13.5, rh * 0.9, 0, 0, 7); g.fill();
      g.fillStyle = '#12102c'; g.beginPath(); g.ellipse(ex, ey + 4, 6, rh * 0.5, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 5, ey - rh * 0.35, 5, 0, 7); g.fill(); g.beginPath(); g.arc(ex + 5, ey + rh * 0.35, 2.5, 0, 7); g.fill();
      g.strokeStyle = L; g.lineWidth = 6; g.beginPath(); g.ellipse(ex, ey, 19, rh, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(ex + sx * 18, ey - rh * 0.2); g.lineTo(ex + sx * 28, ey - rh * 0.6); g.stroke();
      if (expr === 'sad') { g.fillStyle = 'rgba(120,220,255,.85)'; g.beginPath(); g.ellipse(ex, ey + rh + 7, 3, 6, 0, 0, 7); g.fill(); }
    }
  }
  g.strokeStyle = '#c0707a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0 + 2, h * 0.62); g.lineTo(x0 - 1, h * 0.645); g.stroke();
  g.strokeStyle = L; g.lineWidth = 3.5; g.beginPath();
  if (expr === 'happy') { g.arc(x0, h * 0.67, 11, 0.05 * Math.PI, 0.95 * Math.PI); g.fillStyle = '#c0405a'; g.fill(); g.stroke(); }
  else if (expr === 'sad') { g.arc(x0, h * 0.75, 9, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
  else if (expr === 'focus' || expr === 'off') { g.moveTo(x0 - 8, h * 0.71); g.lineTo(x0 + 8, h * 0.71); g.stroke(); }
  else { g.moveTo(x0 - 10, h * 0.69); g.quadraticCurveTo(x0, h * 0.735, x0 + 10, h * 0.69); g.stroke(); }
  if (S.hood) { const sh = g.createLinearGradient(0, 0, 0, h * 0.7); sh.addColorStop(0, 'rgba(10,6,24,.85)'); sh.addColorStop(1, 'rgba(10,6,24,0)'); g.fillStyle = sh; g.fillRect(0, 0, w, h); }
  if (expr === 'off') { g.fillStyle = 'rgba(20,20,40,.35)'; g.fillRect(0, 0, w, h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let codeTex = null;
function workTexture() {
  if (codeTex) return codeTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(8,40,90,.8)'; g.fillRect(0, 0, 128, 80);
  for (let y = 8, i = 0; y < 74; y += 8, i++) { let x = 8 + (i % 3) * 8; for (let k = 0; k < 3; k++) { const l = 10 + ((i * 29 + k * 17) % 34); g.fillStyle = ['#7affff', '#ff9af0', '#ffe27a'][(i + k) % 3]; g.fillRect(x, y, l, 3); x += l + 5; } }
  g.strokeStyle = '#bfffff'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 78);
  codeTex = new THREE.CanvasTexture(c); codeTex.colorSpace = THREE.SRGBColorSpace; return codeTex;
}

export function buildCharacter(S) {
  const ol = new THREE.MeshBasicMaterial({ color: 0x140a28, side: THREE.BackSide });
  const toons = [], accents = [], sway = [], faces = {};
  const root = new THREE.Group(); root.scale.setScalar(S.scale || 1);
  const tn = (color, o = {}) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGrad, emissive: new THREE.Color(color).multiplyScalar(o.glow ?? 0.5), ...(o.m || {}) });
    toons.push({ m, e: m.emissive.clone(), c: m.color.clone() }); return m;
  };
  const acc = (color, k = 1.5) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); accents.push({ m, base: new THREE.Color(color), k }); return m; };
  const mk = (parent, geom, material, pos = [0, 0, 0], o = {}) => {
    const m = new THREE.Mesh(geom, material); m.position.set(...pos);
    if (o.scale) m.scale.set(...o.scale);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.ol !== 0) m.add(new THREE.Mesh(pushed(geom, o.ol ?? 0.011), ol));
    parent.add(m); return m;
  };
  const skinM = tn(S.skin), skin2M = tn(S.skin2 || S.skin), topM = tn(S.top), top2M = tn(S.top2 || S.top), pantsM = tn(S.pants), bootM = tn(S.boots), darkM = tn(S.dark || '#1a1f3d');
  const hairM = tn(S.hair, { m: { side: THREE.DoubleSide } }), tipM = tn(S.tip || S.hair, { m: { side: THREE.DoubleSide } });
  const accM = acc(S.accent), skirtM = tn(S.skirt || S.pants, { m: { side: THREE.DoubleSide } });

  const hips = new THREE.Group(); root.add(hips);
  mk(hips, new THREE.SphereGeometry(0.15, 16, 12), pantsM, [0, 0, 0], { scale: [1.15, 0.8, 0.85] });
  const torso = new THREE.Group(); torso.position.y = 0.02; hips.add(torso);
  const W = S.wide || 1.15;
  mk(torso, new THREE.CapsuleGeometry(0.115, 0.24, 6, 14), topM, [0, 0.3, 0], { scale: [W, 1, 0.8] });
  mk(torso, new THREE.TorusGeometry(0.085, 0.03, 8, 18), accM, [0, 0.53, 0], { rot: [Math.PI / 2, 0, 0], ol: 0 });  // neon collar
  mk(torso, new THREE.TorusGeometry(0.125 * W, 0.012, 6, 24), accM, [0, 0.08, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], ol: 0 });  // neon hem
  if (S.skirt) mk(hips, new THREE.CylinderGeometry(0.15, 0.24, 0.2, 18, 1, true), skirtM, [0, -0.1, 0], { ol: 0.008 });
  if (S.hoodie) mk(torso, new THREE.SphereGeometry(0.1, 14, 10), top2M, [0, 0.54, -0.1], { scale: [1.3, 0.9, 0.9] });
  if (S.cloak) mk(torso, new THREE.CylinderGeometry(0.17, 0.33, 1.0, 18, 1, true), top2M, [0, 0.0, -0.01], { ol: 0.01 });
  if (S.belt) { mk(hips, new THREE.TorusGeometry(0.13, 0.025, 8, 20), tn('#5a3a22'), [0, 0.07, 0], { rot: [Math.PI / 2, 0, 0], scale: [1.1, 0.85, 1] });
    for (const sx of [-1, 1]) mk(hips, new THREE.SphereGeometry(0.045, 10, 8), tn('#7a5a3a'), [sx * 0.14, 0.03, 0.06]); }
  if (S.pads) for (const sx of [-1, 1]) mk(torso, new THREE.SphereGeometry(0.085, 12, 10), tn(S.pads), [sx * 0.2 * W, 0.47, 0], { scale: [1.1, 0.8, 1.1] });
  const neck = new THREE.Group(); neck.position.y = 0.52; torso.add(neck);
  mk(neck, new THREE.CylinderGeometry(0.04, 0.045, 0.1, 10), skin2M, [0, 0.02, 0], { ol: 0.008 });
  const headP = new THREE.Group(); headP.position.y = 0.09; neck.add(headP);
  const faceM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad, emissive: new THREE.Color(0xffffff).multiplyScalar(0.55) });
  const setExpr = (e) => {
    if (faceM.userData.e === e) return;
    faceM.userData.e = e;
    const t = faces[e] || (faces[e] = paintFace(S, e));
    faceM.map = t; faceM.emissiveMap = t; faceM.needsUpdate = true;
  };
  setExpr('open');
  mk(headP, new THREE.SphereGeometry(HR, 40, 28), faceM, [0, HR, 0], { scale: [1, 1.06, 1], ol: 0.009 });

  // hair: a back cap, a front cap, a fringe of cones, side locks, then the style
  const Rh = HR * 1.07, hy = HR;
  const cap = (ps, pl, tl, ol_ = 0.008) => mk(headP, new THREE.SphereGeometry(Rh, 32, 20, ps, pl, 0, tl), hairM, [0, hy, 0], { scale: [1, 1.06, 1], ol: ol_ });
  if (S.style === 'hood') {
    mk(headP, new THREE.SphereGeometry(HR * 1.3, 32, 20, Math.PI / 2 + 1.15, Math.PI * 2 - 2.3, 0, 2.15), top2M, [0, hy - 0.01, -0.02], { scale: [1, 1.05, 1.05], ol: 0.01 });
    mk(headP, new THREE.TorusGeometry(HR * 1.12, 0.035, 8, 26, Math.PI * 1.1), top2M, [0, hy + 0.04, 0.02], { rot: [0.35, 0, Math.PI * 0.95], ol: 0.008 });
  } else {
    cap(Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, S.hairBack === 'bob' ? 2.1 : S.hairBack === 'short' ? 1.75 : 1.9);
    cap(Math.PI / 2 - 1.12, 2.24, 1.04);
    const nb = S.bangs || 7, sph = (th, ph) => new THREE.Vector3(-Rh * Math.cos(ph) * Math.sin(th), Rh * Math.cos(th) * 1.06, Rh * Math.sin(ph) * Math.sin(th));
    for (let i = 0; i < nb; i++) {
      const ph = Math.PI / 2 + (i - (nb - 1) / 2) * (1.7 / Math.max(1, nb - 1)), th0 = 1.02;
      const P = sph(th0, ph), T = new THREE.Vector3(-Math.cos(ph) * Math.cos(th0), -Math.sin(th0) * 1.06, Math.sin(ph) * Math.cos(th0)).normalize();
      const len = (0.1 + 0.07 * Math.abs(Math.sin(i * 1.9))) * (S.bangLen || 1);
      const m = mk(headP, new THREE.ConeGeometry(0.037, len, 6), i % 3 === 2 ? tipM : hairM, [0, 0, 0], { ol: 0.007 });
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), T);
      m.position.copy(P).addScaledVector(T, len / 2 - 0.01).add(new THREE.Vector3(0, hy, 0));
    }
    if (S.style !== 'cap') for (const sx of [-1, 1]) mk(headP, new THREE.CapsuleGeometry(0.03, S.style === 'long' || S.style === 'bob' ? 0.2 : 0.12, 5, 8), hairM, [sx * HR * 1.0, hy - 0.07, 0.035], { rot: [0, 0, sx * 0.05] });
    if (S.style === 'long') mk(headP, new THREE.CapsuleGeometry(0.17, 0.46, 6, 14), hairM, [0, hy - 0.34, -0.08], { scale: [1.15, 1, 0.65] });
    if (S.style === 'twin') for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * 0.17, hy + 0.1, -0.04); headP.add(g);
      mk(g, new THREE.CapsuleGeometry(0.055, S.tailLen || 0.34, 6, 12), hairM, [0, -0.2, 0]);
      mk(g, new THREE.SphereGeometry(0.045, 10, 8), accM, [0, 0, 0], { ol: 0 });
      sway.push({ g, base: sx * 0.28, amp: 0.07, ph: sx });
    }
    if (S.style === 'buns') for (const sx of [-1, 1]) { mk(headP, new THREE.SphereGeometry(0.075, 14, 10), hairM, [sx * 0.125, hy + 0.2, -0.03]); mk(headP, new THREE.TorusGeometry(0.06, 0.012, 6, 14), accM, [sx * 0.125, hy + 0.2, -0.03], { rot: [Math.PI / 2, 0, 0], ol: 0 }); }
    if (S.style === 'ponytail') { const g = new THREE.Group(); g.position.set(0, hy + 0.1, -0.17); g.rotation.x = 0.7; headP.add(g); mk(g, new THREE.CapsuleGeometry(0.05, 0.4, 6, 12), hairM, [0, -0.22, 0]); mk(g, new THREE.SphereGeometry(0.04, 10, 8), accM, [0, 0, 0], { ol: 0 }); sway.push({ g, base: 0.7, amp: 0.1, ph: 0, axis: 'x' }); }
    if (S.style === 'spiky') for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, d = new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5 - 0.45).normalize();
      const m = mk(headP, new THREE.ConeGeometry(0.05, 0.2 + (i % 3) * 0.04, 6), i % 3 === 0 ? tipM : hairM, [0, 0, 0], { ol: 0.007 });
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.position.set(Math.cos(a) * 0.09, hy * 2 + 0.0, Math.sin(a) * 0.09).addScaledVector(d, 0.09);
    }
    if (S.cap) {  // a cap worn backwards
      const cm = tn(S.cap);
      mk(headP, new THREE.SphereGeometry(HR * 1.12, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), cm, [0, hy + 0.06, -0.01], { scale: [1, 1.0, 1.05], ol: 0.009 });
      mk(headP, new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16, 1, false, -0.9, 1.8), cm, [0, hy + 0.12, -0.2], { rot: [0.2, Math.PI, 0] });
      mk(headP, new THREE.SphereGeometry(0.03, 8, 6), accM, [0, hy + 0.3, 0.08], { ol: 0 });
    }
  }
  if (S.headset) {
    mk(headP, new THREE.TorusGeometry(HR * 1.14, 0.016, 8, 28, Math.PI), darkM, [0, hy, 0], { ol: 0.006 });
    for (const sx of [-1, 1]) {
      mk(headP, new THREE.CylinderGeometry(0.065, 0.065, 0.045, 14), darkM, [sx * HR * 1.12, hy - 0.01, 0], { rot: [0, 0, Math.PI / 2] });
      mk(headP, new THREE.TorusGeometry(0.045, 0.008, 6, 16), accM, [sx * (HR * 1.12 + 0.025), hy - 0.01, 0], { rot: [0, Math.PI / 2, 0], ol: 0 });
    }
  }
  if (S.goggles) {
    mk(headP, new THREE.TorusGeometry(HR * 1.1, 0.014, 6, 30), darkM, [0, hy + 0.1, 0], { rot: [Math.PI / 2, 0, 0], ol: 0.005 });
    for (const sx of [-1, 1]) {
      mk(headP, new THREE.CylinderGeometry(0.052, 0.052, 0.035, 14), accM, [sx * 0.075, hy + 0.15, HR * 1.0], { rot: [Math.PI / 2 - 0.35, 0, 0], ol: 0 });
      mk(headP, new THREE.TorusGeometry(0.055, 0.01, 6, 16), darkM, [sx * 0.075, hy + 0.15, HR * 1.02], { rot: [-0.35, 0, 0], ol: 0 });
    }
  }
  if (S.visor) mk(headP, new THREE.CapsuleGeometry(0.012, 0.22, 4, 8), accM, [0, hy + 0.12, HR * 1.08], { rot: [0, 0, Math.PI / 2], ol: 0 });
  if (S.antenna) for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * 0.1, hy * 2 - 0.01, -0.03); g.rotation.z = -sx * 0.45; headP.add(g); mk(g, new THREE.CylinderGeometry(0.008, 0.012, 0.24, 6), darkM, [0, 0.12, 0], { ol: 0.004 }); mk(g, new THREE.SphereGeometry(0.022, 8, 6), accM, [0, 0.25, 0], { ol: 0 }); }
  if (S.clips) for (const sx of [-1, 1]) mk(headP, new THREE.BoxGeometry(0.05, 0.012, 0.012), accM, [sx * 0.12, hy + 0.14, HR * 0.95], { rot: [0, 0, sx * 0.5], ol: 0 });

  const arms = {}, legs = {};
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.17 * W, 0.45, 0); torso.add(sh);
    mk(sh, new THREE.SphereGeometry(0.058, 12, 10), topM);
    mk(sh, new THREE.CapsuleGeometry(0.047, 0.17, 5, 10), S.bareArms ? skinM : topM, [0, -0.13, 0]);
    const el = new THREE.Group(); el.position.y = -0.27; sh.add(el);
    mk(el, new THREE.CapsuleGeometry(0.041, 0.17, 5, 10), S.bareArms ? skinM : top2M, [0, -0.12, 0]);
    if (S.armBand && sx === 1) mk(el, new THREE.TorusGeometry(0.048, 0.012, 6, 14), accM, [0, -0.1, 0], { rot: [Math.PI / 2, 0, 0], ol: 0 });
    mk(el, new THREE.SphereGeometry(0.05, 12, 10), S.gloves ? darkM : skinM, [0, -0.27, 0]);
    arms[sx] = { sh, el };
    const hp = new THREE.Group(); hp.position.set(sx * 0.09, -0.02, 0); hips.add(hp);
    mk(hp, new THREE.CapsuleGeometry(0.068, 0.26, 5, 12), pantsM, [0, -0.19, 0]);
    const kn = new THREE.Group(); kn.position.y = -0.39; hp.add(kn);
    mk(kn, new THREE.CapsuleGeometry(0.056, 0.27, 5, 12), S.tallBoots ? bootM : pantsM, [0, -0.19, 0]);
    mk(kn, new THREE.CapsuleGeometry(0.052, 0.12, 5, 10), bootM, [0, -0.42, 0.05], { rot: [Math.PI / 2, 0, 0] });
    mk(kn, new THREE.TorusGeometry(0.053, 0.008, 6, 14), accM, [0, -0.39, 0], { rot: [Math.PI / 2, 0, 0], ol: 0 });
    legs[sx] = { hp, kn };
  }
  // signature pieces: one invented accessory per agent, tied to their role
  const extras = [], glowM = (col, op = 0.55) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  if (S.sig === 'cable') {  // Lucy: a data cable that trails from the back of her head and ends in a plug
    const g = new THREE.Group(); g.position.set(0, HR * 1.3, -HR * 0.9); g.rotation.x = 0.35; headP.add(g);
    mk(g, new THREE.CapsuleGeometry(0.014, 0.62, 4, 8), accM, [0, -0.32, 0], { ol: 0 });
    mk(g, new THREE.BoxGeometry(0.05, 0.08, 0.03), darkM, [0, -0.68, 0], { ol: 0.004 });
    mk(g, new THREE.BoxGeometry(0.02, 0.05, 0.015), accM, [0, -0.74, 0], { ol: 0 });
    extras.push((t, o) => { g.rotation.x = 0.35 + 0.12 * Math.sin(1.5 * t) + (o.mode === 'busy' ? 0.1 * Math.sin(9 * t) : 0); g.rotation.z = 0.1 * Math.sin(1.1 * t + 1); });
  }
  if (S.sig === 'scan') {  // Rebecca: her visor throws a scanning beam that sweeps the room
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 20, 1, true), glowM(S.accent, 0.16)); b.geometry.translate(0, -0.55, 0); b.rotation.x = -Math.PI / 2 + 0.15; b.position.set(0, HR + 0.12, HR * 1.05); headP.add(b);
    extras.push((t, o) => { b.rotation.y = 0.9 + 0.5 * Math.sin(1.3 * t); b.material.opacity = (o.mode === 'busy' ? 0.1 : o.mode === 'off' ? 0 : 0.045) + 0.04 * Math.sin(5 * t); });
  }
  if (S.sig === 'shards') {  // Kiwi: memory shards orbiting her
    const orb = new THREE.Group(); orb.position.y = 0.35; torso.add(orb);
    for (let i = 0; i < 5; i++) { const m = mk(orb, new THREE.OctahedronGeometry(0.045 + (i % 2) * 0.015), accM, [0, 0, 0], { ol: 0 }); m.userData.i = i; }
    extras.push((t, o) => { orb.children.forEach((m) => { const a = t * (o.mode === 'busy' ? 2.4 : 0.8) + (m.userData.i / 5) * Math.PI * 2; m.position.set(Math.cos(a) * 0.4, 0.28 * Math.sin(a * 1.3 + m.userData.i) + 0.2, Math.sin(a) * 0.4); m.rotation.set(a, a * 0.7, 0); }); });
  }
  if (S.sig === 'map') {  // Maine: a holographic map panel floating over her forearm
    const el = arms[-1].el, p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ map: workTexture(), color: new THREE.Color(1.3, 1.3, 1.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    p.position.set(-0.05, -0.2, 0.17); p.rotation.set(-1.2, 0.2, 0); el.add(p);
    mk(el, new THREE.TorusGeometry(0.1, 0.007, 6, 24), accM, [-0.03, -0.18, 0.1], { rot: [Math.PI / 2, 0, 0], ol: 0 });
    extras.push((t) => { p.position.y = -0.2 + 0.015 * Math.sin(2 * t); });
  }
  if (S.sig === 'harness') {  // Falco: crossed tool harness with cutters standing up over his shoulders
    for (const sx of [-1, 1]) {
      mk(torso, new THREE.TorusGeometry(0.13 * W, 0.016, 6, 24, Math.PI * 0.9), tn('#5a3a22'), [0, 0.3, 0.01], { rot: [0, 0, sx > 0 ? 0.9 : Math.PI - 0.9 - Math.PI * 0.9 + Math.PI * 0.9] , scale: [1, 1.8, 1] });
      mk(torso, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), darkM, [sx * 0.1, 0.62, -0.13], { rot: [0.1, 0, sx * 0.25], ol: 0.004 });
      mk(torso, new THREE.BoxGeometry(0.07, 0.035, 0.015), accM, [sx * 0.13, 0.77, -0.13], { rot: [0, 0, sx * 0.25], ol: 0 });
      mk(torso, new THREE.BoxGeometry(0.07, 0.09, 0.05), tn('#4a3a2c'), [sx * 0.08, 0.14, 0.12]);
    }
  }
  if (S.sig === 'halo') {  // David: a command halo with a status gem floating above his head, and gold trim on the coat
    const hg = new THREE.Group(); headP.add(hg);
    hg.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 40), accM));
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), accM); gem.position.set(0.2, 0, 0); hg.add(gem);
    mk(torso, new THREE.TorusGeometry(0.2, 0.012, 6, 28), accM, [0, -0.5, 0], { rot: [Math.PI / 2, 0, 0], scale: [1.2, 1.2, 1], ol: 0 });
    extras.push((t) => { hg.position.y = HR * 2 + 0.15 + 0.02 * Math.sin(2 * t); hg.rotation.y = t * 0.9; hg.rotation.x = 0.12; });
  }
  if (S.sig === 'crest') {  // Hermes: wings on his antenna crest that light up when he comes online
    const wm = glowM(S.accent, 0.7), wings = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * 0.1, HR * 2 + 0.1, -0.03); headP.add(g);
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), wm); w.rotation.z = -sx * 1.2; w.position.set(sx * 0.14, 0.04, 0); g.add(w);
      const w2 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 4), wm); w2.rotation.z = -sx * 1.5; w2.position.set(sx * 0.11, -0.03, 0); g.add(w2);
      wings.push({ g, sx });
    }
    extras.push((t, o) => { wm.opacity = o.mode === 'off' ? 0.12 : 0.8; for (const w of wings) w.g.rotation.z = w.sx * (0.1 + (o.mode === 'off' ? 0.3 : 0.12 * Math.sin(3 * t))); });
  }
  if (S.offlineLed) { var led = mk(torso, new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.2).multiplyScalar(2.5), toneMapped: false }), [0.07, 0.36, 0.1 * 0.9], { ol: 0 }); }

  // the work hologram: a ring and three orbiting panels in front of the chest, visible while the agent works
  const work = new THREE.Group(); work.visible = false; root.add(work);
  const holoM = new THREE.MeshBasicMaterial({ map: workTexture(), color: new THREE.Color(1.3, 1.3, 1.5), side: THREE.DoubleSide, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), holoM); const a = i / 3 * Math.PI * 2; p.position.set(Math.sin(a) * 0.5, 0.05 * (i - 1), Math.cos(a) * 0.5); p.rotation.y = a; work.add(p); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 1.8), toneMapped: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = Math.PI / 2; work.add(ring);

  const headLocal = (pose) => (POSE[pose].hipsY + 0.02 + 0.52 + 0.09 + HR) * (S.scale || 1);
  const chestLocal = (pose) => (POSE[pose].hipsY + 0.02 + 0.3) * (S.scale || 1);
  const blinkAt = { next: 1 + Math.random() * 3, until: 0 };
  // idle life: now and then an idle agent stretches, waves, sips a drink, thinks, or looks around
  const ACT = { stretch: { r: [-3.0, 0.3, -0.2], l: [-3.0, -0.3, -0.2] }, wave: { r: [-2.7, 0.35, -0.9], wave: true }, sip: { r: [-1.3, 0, -2.35] }, think: { r: [-1.15, 0, -2.5] }, look: {} };
  const ACTS = Object.keys(ACT);
  let act = null, actNext = 3 + Math.random() * 10;
  let curMode = '', curSel = null;
  const CY = new THREE.Color(0.2, 1, 1), RD = new THREE.Color(1, 0.2, 0.25), GY = new THREE.Color(0.5, 0.5, 0.6);

  function update(t, o) {
    const ph = S.phase || 0, s = Math.sin, mode = o.mode, P = POSE[o.pose] || POSE.stand, seated = o.pose !== 'stand';
    if (mode !== curMode) {  // powered-down characters go dim and grey
      curMode = mode;
      for (const q of toons) { q.m.emissive.copy(q.e).multiplyScalar(mode === 'off' ? 0.6 : 1); q.m.color.copy(q.c).multiplyScalar(mode === 'off' ? 0.8 : 1); }
    }
    if (o.selected !== curSel) { curSel = o.selected; ol.color.set(o.selected ? 0x4fd0e0 : 0x140a28); }
    if (mode === 'idle') {
      if (!act && t > actNext) act = { n: ACTS[Math.floor(Math.random() * ACTS.length)], t0: t, d: 2.4 + Math.random() };
      if (act && t > act.t0 + act.d) { act = null; actNext = t + 8 + Math.random() * 17; }
    } else if (act) { act = null; actNext = t + 6; }
    const ae = act ? Math.min(1, s(Math.PI * (t - act.t0) / act.d) * 2.2) : 0;
    const pace = mode === 'boss' && o.pose === 'stand' && root.userData.base;  // the boss paces slowly on his pad while on the call
    if (pace) root.position.x = root.userData.base.x + 0.35 * s(0.3 * t + ph);
    const walk = pace ? Math.abs(Math.cos(0.3 * t + ph)) : 0;
    hips.position.y = P.hipsY + 0.004 * s(1.7 * t + ph);
    hips.rotation.z = seated ? 0 : 0.025 * s(0.6 * t + ph);
    for (const sx of [-1, 1]) { legs[sx].hp.rotation.set(P.thigh + walk * 0.32 * s(3.4 * t + (sx > 0 ? 0 : Math.PI)), 0, sx * P.spread); legs[sx].kn.rotation.x = P.shin + (o.pose === 'perch' ? 0.28 * s(2.1 * t + sx * 1.6 + ph) + 0.25 : 0); }
    torso.scale.set(1, 1 + 0.015 * s(1.7 * t + ph), 1 + 0.01 * s(1.7 * t + ph));
    torso.rotation.x = P.lean + (mode === 'fail' ? 0.18 : mode === 'busy' ? 0.08 : 0);
    torso.rotation.y = 0.05 * s(0.4 * t + ph);
    neck.rotation.x = (mode === 'busy' ? 0.18 : mode === 'fail' ? 0.4 : mode === 'off' ? 0.5 : 0) + 0.03 * s(1.1 * t + ph) + (o.receiving ? 0.12 * s(6 * t) : 0);
    headP.rotation.y = mode === 'busy' ? 0.06 * s(2 * t + ph) : mode === 'off' ? 0 : 0.3 * s(0.35 * t + ph) * s(0.13 * t + 2 * ph);
    headP.rotation.z = 0.04 * s(0.5 * t + ph);
    if (ae > 0) headP.rotation.y += (act.n === 'look' ? 0.8 * Math.sign(s(act.t0 * 7)) : act.n === 'think' ? 0.25 : 0) * ae;
    for (const sx of [-1, 1]) {
      const a = arms[sx];
      let shx = 0, shz = sx * 0.1, elx = -0.25;
      if (seated) { shx = -0.35; elx = -0.9; shz = sx * 0.12; }
      if (mode === 'busy') { shx = seated ? -0.85 : -0.95; elx = (seated ? -1.05 : -0.85) + s(t * 19 + sx * 2 + ph) * 0.07; shz = sx * 0.12; shx += s(t * 11 + sx) * 0.04; }
      if (mode === 'boss' && sx === 1) { shx = -0.5; shz = 0.7; elx = -2.2; }
      if (mode === 'boss' && sx === -1) { shx = -0.4 + 0.25 * s(1.3 * t); elx = -0.9 + 0.3 * s(1.7 * t + 1); shz = -0.2; }
      if (mode === 'fail' && sx === 1) { shx = -1.9; shz = -0.15; elx = -2.0; }
      if (mode === 'off') { shx = 0.05; elx = -0.1; shz = sx * 0.06; }
      if (o.giving && sx === 1) { shx = -1.45; elx = -0.2 + 0.1 * s(5 * t); shz = 0.05; }
      if (o.receiving && sx === -1) { shx = -1.2; elx = -0.5 + 0.12 * s(5 * t); shz = -0.1; }
      shx += 0.04 * s(1.3 * t + ph + sx);
      if (ae > 0) {
        const A = ACT[act.n], g = sx === 1 ? A.r : A.l;
        if (g) { shx += (g[0] - shx) * ae; shz += (g[1] - shz) * ae; elx += (g[2] + (A.wave ? 0.5 * s(9 * t) : 0) - elx) * ae; }
      }
      a.sh.rotation.set(shx, 0, shz); a.el.rotation.x = elx;
    }
    for (const w of sway) { const v = w.base + w.amp * s(1.4 * t + w.ph + ph); if (w.axis === 'x') w.g.rotation.x = v; else w.g.rotation.z = v; }
    // expression, with a blink every few seconds
    let e = mode === 'off' ? 'off' : mode === 'fail' ? 'sad' : mode === 'busy' ? 'focus' : (o.giving || o.receiving || (act && act.n === 'wave' && ae > 0.3)) ? 'happy' : mode === 'boss' ? (Math.floor(t * 0.9 + ph) % 3 ? 'happy' : 'open') : 'open';
    if (t > blinkAt.next) { blinkAt.until = t + 0.13; blinkAt.next = t + 2.5 + Math.random() * 3.5; }
    if (e === 'open' && t < blinkAt.until) e = 'blink';
    setExpr(e);
    const tgt = mode === 'busy' ? CY : mode === 'fail' ? RD : mode === 'off' ? GY : null, pulse = mode === 'busy' ? 0.8 + 0.4 * s(6 * t) : mode === 'fail' ? 0.8 + 0.5 * s(9 * t) : 1;
    for (const q of accents) q.m.color.copy(tgt || q.base).multiplyScalar((mode === 'off' ? 0.5 : q.k) * pulse);
    if (mode === 'off' && (t + ph) % 7 < 0.6) {  // powered down, but now and then it flickers like it is trying to boot
      for (const q of accents) q.m.color.copy(CY).multiplyScalar(1.4 + 0.5 * s(40 * t));
      headP.rotation.z += 0.15 * s(30 * t);
    }
    for (const f of extras) f(t, o);
    work.visible = mode === 'busy';
    if (work.visible) { work.position.y = chestLocal(o.pose) / (S.scale || 1) + 0.05; work.rotation.y = t * 1.1; ring.position.y = 0.12 * s(2 * t); work.position.z = 0.02; }
    if (led) led.visible = Math.floor(t * 0.8) % 2 === 0;
  }
  return { root, update, headLocal, chestLocal };
}
