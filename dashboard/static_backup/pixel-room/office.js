// Night City Office: the crew's room (pixel art), live bubbles and hand-off packets.
// board.js feeds it live data via window.Office; crew.js supplies the character art.
(() => {
  'use strict';
  const W = 240, H = 100;
  const Art = window.CrewArt;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fixed spots. feet = where the sprite stands, cut = rows hidden by furniture, anchor = bubble side.
  const CREW = [
    { role: 'coder', name: 'Lucy', model: 'qwen2.5-coder:7b', color: '#ff8fd8', sprite: 'lucy', x: 24, feet: 79, cut: 5, anchor: 'r' },
    { role: 'vision', name: 'Rebecca', model: 'qwen3-vl:4b', color: '#8fff6a', sprite: 'rebecca', x: 64, feet: 78, cut: 2, anchor: 'r' },
    { role: 'claude-code', name: 'David', model: 'Claude', color: '#f5d300', sprite: 'david', boss: true, x: 100, feet: 95, cut: 0, anchor: 'c' },
    { role: 'memory', name: 'Kiwi', model: 'memory-cpu', color: '#ff6b7a', sprite: 'kiwi', x: 141, feet: 82, cut: 5, anchor: 'c' },
    { role: 'planner', name: 'Maine', model: 'qwen3:8b', color: '#ff9a4c', sprite: 'maine', x: 178, feet: 83, cut: 6, anchor: 'c' },
    { role: 'trimmer', name: 'Falco', model: 'trimmer-cpu', color: '#d9a066', sprite: 'falco', x: 216, feet: 82, cut: 5, anchor: 'l' },
    { role: 'hermes', name: 'Hermes', model: 'not configured', color: '#9a8fbf', offline: true, x: 219, top: 24, anchor: 'l' },
  ];
  const byRole = Object.fromEntries(CREW.map(m => [m.role, m]));
  const isLocal = m => !m.boss && !m.offline;
  for (const m of CREW) if (m.sprite) m.top = m.feet - Art.SPRITES[m.sprite].rows.length;

  // ---- static room, drawn once into an offscreen canvas
  const R = (c, color, x, y, w, h, a = 1) => { c.globalAlpha = a; c.fillStyle = color; c.fillRect(x, y, w, h); c.globalAlpha = 1; };
  // Light pool: an ellipse of added colour in 4 hard steps, so it stays pixel-crisp instead of a smooth blur.
  function glow(c, cx, cy, rx, ry, color, maxA) {
    c.globalCompositeOperation = 'lighter'; c.fillStyle = color;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      c.globalAlpha = maxA * Math.ceil((1 - d) * 4) / 4;
      c.fillRect(x, y, 1, 1);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  // Soft shadow: the same stepped ellipse, darkening.
  function shade(c, cx, cy, rx, ry, maxA) {
    c.fillStyle = '#000';
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      c.globalAlpha = maxA * Math.ceil((1 - d) * 3) / 3;
      c.fillRect(x, y, 1, 1);
    }
    c.globalAlpha = 1;
  }
  const WIN = { x: 5, y: 14, w: 64, h: 36 };
  const HOLO = { x: 128, y: 3, w: 54, h: 28 };
  const lights = [];
  const room = document.createElement('canvas'); room.width = W; room.height = H;
  (function drawRoom(c) {
    R(c, '#0c0f26', 0, 0, W, 8); R(c, '#161c42', 0, 8, W, 48); R(c, '#10142f', 0, 56, W, 44);
    for (let x = 76; x < W; x += 26) R(c, '#121738', x, 8, 1, 48);  // wall panel seams, behind everything on the wall
    for (let y = 62; y < H; y += 8) R(c, '#171d46', 0, y, W, 1);
    for (let x = 0; x < W; x += 16) R(c, '#171d46', x, 56, 1, 44);
    for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2; R(c, '#d8e83a', Math.round(50 + Math.cos(t) * 9), Math.round(4 + Math.sin(t) * 2), 1, 1); }
    // window onto the city
    R(c, '#2a3266', 3, 12, 68, 40); R(c, '#0a1030', WIN.x, WIN.y, WIN.w, WIN.h);
    [[6, 32, 7], [13, 24, 8], [22, 34, 6], [28, 20, 9], [38, 29, 7], [46, 18, 8], [55, 27, 7], [63, 23, 6]].forEach(([x, y, w], i) => {
      R(c, i % 2 ? '#141c4c' : '#1b2560', x, y, w, 50 - y);
      for (let wy = y + 3; wy < 48; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3)
        if ((wx * 7 + wy * 3 + i) % 5 === 0) lights.push({ x: wx, y: wy, c: ['#05d9e8', '#f5d300', '#ff4fd8'][(wx + wy) % 3], tw: (wx + wy * 5) % 9 === 0 });
    });
    for (const l of lights) R(c, l.c, l.x, l.y, 1, 1);
    // magenta alcove with the bed
    R(c, '#4a1656', 84, 15, 38, 41); R(c, '#7a2486', 86, 17, 34, 39); R(c, '#ff4fd8', 94, 19, 12, 1); R(c, '#c04ab0', 87, 48, 32, 8);
    // hanging holo screen (the lanes are written on it), door, Hermes' rack
    R(c, '#3a4280', 155, 0, 1, HOLO.y); R(c, '#0aa8e8', HOLO.x, HOLO.y, HOLO.w, HOLO.h, .14);
    R(c, '#05d9e8', HOLO.x, HOLO.y, HOLO.w, 1, .6); R(c, '#05d9e8', HOLO.x, HOLO.y + HOLO.h - 1, HOLO.w, 1, .6);
    R(c, '#2fa8ff', 188, 15, 15, 1); R(c, '#1a2250', 188, 19, 15, 37); R(c, '#0f1438', 195, 32, 2, 4);
    R(c, '#12152e', 210, 24, 18, 32); for (let y = 27; y < 54; y += 4) { R(c, '#1e2244', 212, y, 14, 2); R(c, '#3a3f5a', 225, y, 1, 1); }
    // a glowing baseboard where wall meets floor
    R(c, '#05d9e8', 0, 55, W, 1, .35);
    // floor darkens towards the viewer
    R(c, '#05060f', 0, 84, W, 16, .25); R(c, '#05060f', 0, 92, W, 8, .3);
    // light from each source: window (cyan), alcove (magenta), ceiling ring (yellow), holo screen (cyan), rack (dim red)
    glow(c, 36, 58, 44, 12, '#05d9e8', .07); glow(c, 36, 32, 40, 24, '#2a6cff', .05);
    glow(c, 103, 36, 30, 28, '#ff4fd8', .09); glow(c, 103, 62, 34, 10, '#ff4fd8', .12);
    glow(c, 50, 10, 30, 10, '#f5e83a', .07); glow(c, 50, 68, 26, 6, '#f5e83a', .04);
    glow(c, 155, 34, 36, 14, '#05d9e8', .08); glow(c, 155, 64, 30, 7, '#05d9e8', .07);
    glow(c, 219, 60, 14, 4, '#ff3a5c', .05);
    // glass reflections on the window and a sill
    for (let i = 0; i < 3; i++) for (let s = 0; s < 14; s++) R(c, '#ffffff', 12 + i * 22 + s, 44 - s * 2, 1, 1, .06);
    R(c, '#3a4280', 3, 51, 68, 2);
    // couch back and arms with cushion seams (the seat is drawn in front of Lucy every frame)
    R(c, '#2b3a8a', 4, 58, 52, 12); R(c, '#3a4cad', 4, 58, 52, 1); R(c, '#222f72', 21, 59, 1, 11); R(c, '#222f72', 38, 59, 1, 11);
    R(c, '#2b3a8a', 1, 62, 5, 18); R(c, '#3a4cad', 1, 62, 5, 1); R(c, '#24327a', 56, 62, 6, 18); R(c, '#3a4cad', 56, 62, 6, 1);
    // egg chair back
    R(c, '#8a90b8', 129, 60, 24, 2); R(c, '#2a2f5a', 130, 62, 22, 14); R(c, '#3a4070', 131, 62, 1, 13);
    // contact shadows under furniture and David
    shade(c, 32, 92, 22, 2, .35); shade(c, 141, 89, 14, 2, .35); shade(c, 178, 87, 20, 2, .35); shade(c, 218, 87, 22, 2, .35);
    shade(c, 100, 96, 9, 2, .45);
    // edge vignette
    for (let i = 0; i < 4; i++) { R(c, '#000', i * 4, 0, 4, H, .22 - i * .05); R(c, '#000', W - 4 - i * 4, 0, 4, H, .22 - i * .05); }
  })(room.getContext('2d'));

  // ---- state
  const state = { roles: {}, selected: null, packets: [], queued: {} };
  for (const m of CREW) if (isLocal(m))
    state.roles[m.role] = { busy: false, task_id: null, task_title: '', started: null, last_duration_s: null, last_status: null,
                            last_task_id: null, lane: null };
  for (const m of CREW) m.nextBlink = performance.now() + 1000 + Math.random() * 4000;
  const busy = m => m.boss || !!state.roles[m.role]?.busy;

  // ---- per-frame drawing
  const ctx = document.getElementById('scene').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rain = Array.from({ length: 26 }, (_, i) => ({ x: WIN.x + (i * 37) % WIN.w, y: WIN.y + (i * 17) % WIN.h }));

  function person(m, t) {
    let blink = false;
    if (!reduceMotion) {
      if (t > m.nextBlink + 140) m.nextBlink = t + 2000 + Math.random() * 4000;
      blink = t > m.nextBlink && t < m.nextBlink + 140;
    }
    const bob = !reduceMotion && m.cut === 0 && !busy(m) ? Math.floor(t / 900) % 2 : 0;
    return Art.draw(ctx, m.sprite, m.x, m.feet, { cut: m.cut, blink, bob });
  }

  function frame(t) {
    ctx.drawImage(room, 0, 0);
    if (!reduceMotion) {
      for (const l of lights) if (l.tw && Math.floor(t / 700 + l.x) % 3 === 0) R(ctx, '#0a1030', l.x, l.y, 1, 1);
      ctx.fillStyle = 'rgba(5, 217, 232, .35)';
      for (const d of rain) {
        d.y += 3; d.x -= 1;
        if (d.y > WIN.y + WIN.h - 3) { d.y = WIN.y; d.x = WIN.x + Math.random() * WIN.w; }
        if (d.x >= WIN.x) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2);
      }
    }
    const pulse = reduceMotion ? .55 : .35 + .3 * Math.abs(Math.sin(t / 400));
    const flick = m => reduceMotion || busy(m) && Math.floor(t / 150 + m.x) % 5 !== 0;
    const m = byRole;
    // couch: Lucy, Rebecca on the arm, then the seat in front of them and the coffee table with Lucy's deck
    const lucy = person(m.coder, t);
    person(m.vision, t); Art.laptop(ctx, 64, 77, '#9cff4a', busy(m.vision) && flick(m.vision));
    R(ctx, '#3a4cad', 6, 73, 50, 1); R(ctx, '#33449c', 6, 74, 50, 2); R(ctx, '#22306f', 6, 76, 50, 4); R(ctx, '#ff4fd8', 1, 80, 61, 1);
    R(ctx, '#2a3266', 26, 84, 26, 2); R(ctx, '#1a2048', 28, 86, 2, 6); R(ctx, '#1a2048', 48, 86, 2, 6); R(ctx, '#3a4280', 43, 81, 6, 3);
    Art.jackIn(ctx, lucy, { x: 45, y: 81 }, '#05d9e8', busy(m.coder) ? pulse : 0);
    // David, always on call, laptop held at his waist
    person(m['claude-code'], t); Art.laptop(ctx, 100, 92, '#05d9e8', flick(m['claude-code']));
    // Kiwi in the egg chair
    const kiwi = person(m.memory, t);
    R(ctx, '#3a4070', 129, 75, 24, 1); R(ctx, '#2a2f5a', 129, 76, 24, 5); R(ctx, '#8a90b8', 129, 81, 24, 1); R(ctx, '#1a1d38', 132, 82, 2, 6); R(ctx, '#1a1d38', 148, 82, 2, 6);
    R(ctx, '#3a4280', 156, 86, 6, 3); Art.jackIn(ctx, kiwi, { x: 158, y: 86 }, '#ff3a5c', busy(m.memory) ? pulse : 0);
    // Maine at the holo table: the hologram brightens while he plans
    person(m.planner, t);
    R(ctx, '#05d9e8', 164, 70, 28, 3, busy(m.planner) ? pulse * .7 : .12);
    R(ctx, '#4a5296', 160, 75, 36, 1); R(ctx, '#2a3266', 160, 76, 36, 2); R(ctx, '#1a2048', 162, 78, 32, 8);
    // Falco at the workbench, laptop beside him so his face stays clear
    person(m.trimmer, t);
    R(ctx, '#6a5444', 198, 75, 40, 1); R(ctx, '#4a3a30', 198, 76, 40, 2); R(ctx, '#2a2228', 200, 78, 36, 8);
    Art.laptop(ctx, 230, 75, '#05d9e8', busy(m.trimmer) && flick(m.trimmer));
  }

  let lastDraw = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (t - lastDraw < 100) return;
    lastDraw = t;
    frame(t);
  }

  // ---- bubbles, hit areas and packets (all text set with textContent)
  const fmtDur = s => s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const pct = (v, total) => `${v / total * 100}%`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svgEl = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);

  // Working: a full speech bubble with the task and timer. Everyone else: a one-line name tag in their colour.
  function bubbleOf(m) {
    const name = m.name.toUpperCase();
    if (m.boss) return { cls: 'chip', who: name, main: 'on call' };
    if (m.offline) return { cls: 'chip off', who: name, main: 'offline' };
    const s = state.roles[m.role];
    if (s.busy) {
      const dur = s.started ? fmtDur(Math.max(0, Date.now() / 1000 - s.started)) : '';
      return { cls: 'busy', who: `${name} · ${m.role.toUpperCase()}${m.jack ? ' · JACKED IN' : ''}`,
               main: `#${s.task_id ?? '?'} ${clip(s.task_title || 'working', 28)}`, n: dur };
    }
    if (s.last_status === 'failed') return { cls: 'chip', who: name, main: 'idle · ', fail: `#${s.last_task_id ?? '?'} failed` };
    return { cls: 'chip', who: name, main: s.last_duration_s != null ? `idle ${fmtDur(s.last_duration_s)}` : 'idle' };
  }

  const layer = document.getElementById('layer'), links = document.getElementById('links');
  // the hanging holo screen shows each machine's lane: who is working and how much is queued
  const holo = el('div', 'holo');
  holo.style.left = pct(HOLO.x, W); holo.style.top = pct(HOLO.y, H); holo.style.width = pct(HOLO.w, W); holo.style.height = pct(HOLO.h, H);
  layer.append(holo);
  function renderHolo() {
    const lanes = {};
    for (const [role, s] of Object.entries(state.roles)) if (s.lane) (lanes[s.lane] ||= []).push(role);
    const rows = [el('div', 'hd', 'LANES')];
    for (const lane of Object.keys(lanes).sort((a, b) => (a === 'pc' ? -1 : b === 'pc' ? 1 : a.localeCompare(b)))) {
      const working = lanes[lane].find(r => state.roles[r].busy);
      const row = el('div', 'row' + (working ? ' on' : ''));
      row.append(el('span', null, lane.toUpperCase()), el('span', null, working ? `${byRole[working].name} working` : 'free'));
      const q = el('div', 'row q');
      q.append(el('span', null, 'queued'), el('span', null, String(state.queued[lane] || 0)));
      rows.push(row, q);
    }
    holo.replaceChildren(...rows);
  }
  for (const m of CREW) {
    m.bubble = el('div', 'bub');
    m.bubble.style.left = pct(m.x, W);
    m.bubble.style.top = pct(m.top - 2, H);
    layer.append(m.bubble);
    const hit = el('button', 'hit');
    hit.type = 'button';
    hit.setAttribute('aria-label', isLocal(m) ? `Assign a task to ${m.name}, ${m.role}` : `${m.name}, ${m.boss ? 'Claude Code' : m.role}`);
    const hw = m.offline ? 18 : 20, hh = m.offline ? 32 : m.feet - m.top - m.cut;
    hit.style.left = pct(m.x - hw / 2, W); hit.style.top = pct(m.top, H);
    hit.style.width = pct(hw, W); hit.style.height = pct(hh, H);
    hit.addEventListener('click', () => choose(m));
    layer.append(hit);
  }

  function render() {
    for (const m of CREW) {
      const b = bubbleOf(m);
      m.bubble.className = `bub ${b.cls} a-${m.anchor}${m.role === state.selected ? ' selected' : ''}`;
      const who = el('span', 'who', b.who);
      if (b.cls.startsWith('chip')) who.style.color = m.color;
      const parts = [who, document.createTextNode(b.main)];
      if (b.fail) parts.push(el('span', 'fail', b.fail));
      if (b.n) parts.push(el('span', 'n', b.n));
      m.bubble.replaceChildren(...parts);
    }
    unstack();
    renderHolo();
    renderPackets();
  }

  // Lift any bubble that would overlap an earlier bubble or anyone's head; a stem keeps it attached to its owner.
  function unstack() {
    const box = layer.getBoundingClientRect(), sx = box.width / W, sy = box.height / H;
    const heads = CREW.filter(m => m.sprite).map(m => ({ owner: m, left: box.left + (m.x - 8) * sx, right: box.left + (m.x + 8) * sx,
                                                        top: box.top + m.top * sy, bottom: box.top + (m.top + 11) * sy }));
    const placed = [];
    for (const m of [...CREW].sort((a, b) => a.x - b.x)) {
      const b = m.bubble;
      b.style.setProperty('--lift', '0px');
      let lift = 0, r = b.getBoundingClientRect();
      const blockers = [...placed, ...heads.filter(h => h.owner !== m)];
      for (let guard = 0; guard < 6; guard++) {
        const hit = blockers.find(p => r.left < p.right + 4 && r.right > p.left - 4 && r.top - lift < p.bottom + 4 && r.bottom - lift > p.top - 4);
        if (!hit) break;
        lift = r.bottom - hit.top + 6;
      }
      b.style.setProperty('--lift', `${lift}px`);
      placed.push({ left: r.left, right: r.right, top: r.top - lift, bottom: r.bottom - lift });
    }
  }

  // Arcs run between the tops of the two bubbles, so the packet rides above them rather than across them.
  function renderPackets() {
    const box = layer.getBoundingClientRect();
    const bubbleTop = m => box.height ? Math.round((m.bubble.getBoundingClientRect().top - box.top) / box.height * H) : m.top - 2;
    const arcs = state.packets.map(({ from, to, id, role }) => {
      const a = { x: from.x, y: bubbleTop(from) }, b = { x: to.x, y: bubbleTop(to) };
      const c = { x: (a.x + b.x) / 2, y: Math.max(3, Math.min(a.y, b.y) - 16) };
      return { d: `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`, text: `#${id} → ${role}`,
               lx: (a.x + 2 * c.x + b.x) / 4, ly: (a.y + 2 * c.y + b.y) / 4 };
    });
    const key = arcs.map(p => p.d + p.text).join('|');
    if (key === state.packetKey) return;  // unchanged: leave the dashes marching
    state.packetKey = key;
    links.replaceChildren();
    for (const p of layer.querySelectorAll('.packet')) p.remove();
    for (const p of arcs) {
      const path = svgEl('path');
      path.setAttribute('d', p.d);
      path.setAttribute('class', 'arc');
      links.append(path);
      const label = el('div', 'packet', p.text);
      label.style.left = pct(p.lx, W);
      label.style.top = pct(p.ly, H);
      layer.append(label);
    }
  }

  function choose(m) {
    if (!isLocal(m)) return;
    highlight(m.role);
    if (typeof window.Office.onSelectRole === 'function') window.Office.onSelectRole(m.role);
  }
  function highlight(role) { state.selected = role; render(); }

  function applyRoles(data) {
    for (const item of (data && data.roles) || []) {
      const s = state.roles[item.role];
      if (!s) continue;
      s.busy = !!item.busy;
      s.task_id = item.task_id ?? null;
      s.task_title = item.task_title || '';
      s.started = item.started ?? null;
      s.last_duration_s = item.last_duration_s ?? null;
      s.last_status = item.last_status || null;
      s.last_task_id = item.last_task_id ?? null;
      s.lane = item.lane || null;
    }
    render();
    if (reduceMotion) frame(0);
  }

  // A handed-off task travels from the parent's role to its own as a packet, while it waits in the queue
  // and for PACKET_S seconds after the hand-off, so it is seen even when the next role starts at once.
  const PACKET_S = 12;
  function applyTasks(columns) {
    const all = new Map();
    for (const col of Object.values(columns || {})) for (const t of col.tasks || []) all.set(t.id, t);
    const packets = [], queued = {}, now = Date.now() / 1000;
    for (const t of columns?.queued?.tasks || []) {
      const lane = state.roles[t.role]?.lane;
      if (lane) queued[lane] = (queued[lane] || 0) + 1;
    }
    const fresh = t => t.status === 'queued' || now - t.created < PACKET_S;
    for (const t of [...(columns?.queued?.tasks || []), ...(columns?.running?.tasks || []), ...(columns?.done?.tasks || [])]) {
      if (!t.parent_task_id || !fresh(t)) continue;
      const parent = all.get(t.parent_task_id);
      const from = parent && byRole[parent.role], to = byRole[t.role];
      if (from && to && from !== to && packets.length < 3) packets.push({ from, to, id: t.id, role: t.role });
    }
    state.packets = packets;
    renderPackets();
    state.queued = queued;
    renderHolo();
  }

  function setMode(mode) {
    const badge = document.getElementById('mode');
    badge.textContent = mode === 'live' ? 'LIVE' : 'DISCONNECTED';
    badge.className = `mode ${mode === 'live' ? 'live' : 'down'}`;
  }

  const bad = Art.problems();
  if (bad.length) console.warn('crew art:', bad.join('; '));
  window.Office = {
    crew: Object.fromEntries(CREW.map(m => [m.role, { name: m.name, color: m.color }])),
    applyRoles, applyTasks, setMode, highlight, onSelectRole: null,
  };
  render();
  setInterval(render, 1000);  // keeps the busy timers ticking between polls
  if (reduceMotion) frame(0); else requestAnimationFrame(loop);
})();
