// Night City Office: pixel-art scene and crew strip. board.js feeds it live data via window.Office.
(() => {
  'use strict';
  const W = 320, H = 180;

  // ---- sprites: 16x20 grids. K skin, k skin shade, J jacket, A arm, P collar, S shirt, C/c chrome,
  //      H hair, h/g hair tips, B beard, X cyberware, T tattoo
  const E = '................';
  const HEAD = [E, E,
    '....KKKKKKKK....', '....KKKKKKKK....', '....KKKKKKKK....',
    '...kKKKKKKKKk...', '...kKKKKKKKKk...', '....KKKKKKKK....',
    '.....KKKKKK.....', '......KKKK......', '.......kk.......'];
  const TORSO = ['...AJJPSSPJJA...', '..AAJJPSSPJJAA..', ...Array(7).fill('..AAJJJSSJJJAA..')];
  const TORSO_BIG = ['..CJJJPSSPJJJC..', '.CcJJJPSSPJJJcC.', ...Array(7).fill('.CcJJJJSSJJJJcC.')];
  const HAIR = {
    david:   ['......H..H......', '.....HHHHHHH....', '....HHHHHHHHH...', '....HHHHHHHH....', '....H.HH...H....'],
    lucy:    [E, '.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHHHHHH...',
              '...HH......HH...', '...HH......HH...', '...HH......HH...', '...hH......Hh...',
              '...hg......gh...', '...g........g...'],
    rebecca: [E, '.....HHHHHH.....', 'HH..HHHHHHHH..HH', 'HHHHHHHHHHHHHHHH', 'HH..HH.HH.HH..HH',
              'H..............H', 'H..............H', '.H............H.'],
    maine:   [E, E, '....HHHHHHHH....', '....H......H....'],
    kiwi:    [E, '.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHHH.HH...',
              '...HHHH....HH...', ...Array(6).fill('...HH......HH...')],
    falco:   [E, '.....HHHHHH.....', '....HHHHHHHH....', '....HH....HH....', '....H......H....'],
    none:    [],
  };
  const EXTRA = {
    maine:   [E, E, E, E, E, E, E, E, '.....BBBBBB.....', '......BBBB......'],
    kiwi:    [E, E, E, E, E, E, E, E, '.....X....X.....', '......X..X......'],
    falco:   [E, E, E, E, E, E, E, E, '......B..B......', '......BBBB......'],
    rebecca: [E, E, E, E, E, E, E, '....T......T....'],
  };

  const CREW = [
    { role: 'planner', name: 'Maine', model: 'qwen3:8b', where: 'PC GPU', x: 64, deskY: 100, color: '#ff6b3d',
      hair: 'maine', look: { skin: '#8a5536', shade: '#6a3e26', hair: '#151515', beard: '#1d1512', jacket: '#2b2f3a',
      arm: '#2b2f3a', chrome: '#9aa6b5', chromeHi: '#dfe7f0', shirt: '#6b2236', collar: '#1d2028', glow: '#ff6b3d', big: true } },
    { role: 'coder', name: 'Lucy', model: 'qwen2.5-coder:7b', where: 'PC GPU', x: 160, deskY: 100, color: '#ff8fd8',
      hair: 'lucy', look: { skin: '#f0d2c2', shade: '#cfa996', hair: '#d9dcf0', tip1: '#ff8fd8', tip2: '#7ff0ff',
      jacket: '#ebe8f3', arm: '#c9c4da', shirt: '#141019', collar: '#141019', glow: '#ff4fd8' } },
    { role: 'vision', name: 'Rebecca', model: 'qwen3-vl:4b', where: 'laptop', x: 256, deskY: 100, color: '#6fff6a',
      hair: 'rebecca', look: { skin: '#f2d3c8', shade: '#d0aa9c', hair: '#62f55c', jacket: '#36c9c1', arm: '#279a94',
      shirt: '#ff4fa0', collar: '#1a2a2a', tattoo: '#ff4fa0', glow: '#39ff88', small: true } },
    { role: 'memory', name: 'Kiwi', model: 'memory-cpu', where: 'laptop', x: 56, deskY: 152, color: '#e6d3a1',
      hair: 'kiwi', look: { skin: '#f1dccb', shade: '#cdb3a0', hair: '#e6d3a1', jacket: '#3b2e52', arm: '#2b2140',
      shirt: '#e9e3d5', collar: '#2b2140', cyber: '#8a95ab', glow: '#b48cff' } },
    { role: 'claude-code', name: 'David', model: 'Claude', where: 'cloud', x: 160, deskY: 152, color: '#f5d300', boss: true,
      hair: 'david', look: { skin: '#c98d5e', shade: '#9a6342', hair: '#2a1c17', jacket: '#f2cf1d', arm: '#c7a512',
      shirt: '#17131f', collar: '#17131f', glow: '#05d9e8' } },
    { role: 'trimmer', name: 'Falco', model: 'trimmer-cpu', where: 'laptop', x: 264, deskY: 152, color: '#d9a066',
      hair: 'falco', look: { skin: '#c48b62', shade: '#9b6a49', hair: '#b9b9b9', beard: '#9c9c9c', jacket: '#6b3f26',
      arm: '#53301d', shirt: '#262626', collar: '#3e2416', glow: '#ffb347' } },
    { role: 'hermes', name: 'Hermes', model: 'not configured', where: 'server rack', x: 301, deskY: 62, color: '#9a8fbf',
      offline: true, hair: 'none', look: { skin: '#241838', shade: '#1b1230', hair: '#241838', jacket: '#1b1230',
      arm: '#160f28', shirt: '#241838', collar: '#160f28', glow: '#4a1a1a' } },
  ];
  const STATIONS = CREW.filter(m => !m.offline);
  const isLocal = m => !m.boss && !m.offline;

  function colorFor(ch, L) {
    switch (ch) {
      case 'K': return L.skin;   case 'k': return L.shade;
      case 'J': return L.jacket; case 'A': return L.arm;   case 'P': return L.collar || L.jacket;
      case 'S': return L.shirt;  case 'C': return L.chrome || L.arm; case 'c': return L.chromeHi || L.chrome || L.arm;
      case 'H': return L.hair;   case 'h': return L.tip1 || L.hair; case 'g': return L.tip2 || L.tip1 || L.hair;
      case 'B': return L.beard || L.hair; case 'X': return L.cyber || '#8a95ab'; case 'T': return L.tattoo || '#ff4fa0';
    }
    return null;
  }
  function drawGrid(ctx, grid, ox, oy, L, rowOffset = 0) {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const col = colorFor(row[c], L);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + c, oy + r + rowOffset, 1, 1);
      }
    }
  }
  function drawPerson(ctx, m, ox, oy, opts = {}) {
    const L = m.look;
    drawGrid(ctx, L.big ? TORSO_BIG : TORSO, ox, oy, L, 11);
    drawGrid(ctx, HEAD, ox, oy, L);
    if (EXTRA[m.hair]) drawGrid(ctx, EXTRA[m.hair], ox, oy, L);
    ctx.fillStyle = opts.blink ? L.shade : (opts.glow ? L.glow : '#1a1020');
    ctx.fillRect(ox + 6, oy + 6, 1, 1);
    ctx.fillRect(ox + 9, oy + 6, 1, 1);
    ctx.fillStyle = m.offline ? L.shade : '#5a2a2a';
    ctx.fillRect(ox + 7, oy + 8, 2, 1);
    drawGrid(ctx, HAIR[m.hair], ox, oy, L);
  }

  // ---- scene background (precomputed skyline, rain)
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const rand = mulberry32(2077);
  const WIN = { x: 16, y: 10, w: 266, h: 60 };
  const far = [], near = [];
  for (let x = WIN.x; x < WIN.x + WIN.w;) { const w = 8 + Math.floor(rand() * 14); far.push({ x, w, h: 18 + Math.floor(rand() * 30) }); x += w; }
  for (let x = WIN.x; x < WIN.x + WIN.w;) {
    const w = 10 + Math.floor(rand() * 16), h = 10 + Math.floor(rand() * 28), lights = [];
    for (let wy = WIN.y + WIN.h - h + 3; wy < WIN.y + WIN.h - 2; wy += 3)
      for (let wx = x + 2; wx < x + w - 1; wx += 3)
        if (rand() < .33) lights.push({ x: wx, y: wy, c: ['#f5d300', '#05d9e8', '#ff2a6d', '#ffe9a8'][Math.floor(rand() * 4)], tw: rand() < .12 });
    near.push({ x, w, h, lights });
    x += w + Math.floor(rand() * 3);
  }
  const signB = near.find(b => b.w >= 14 && b.h >= 22) || near[0];
  const rain = Array.from({ length: 55 }, () => ({ x: WIN.x + rand() * WIN.w, y: WIN.y + rand() * WIN.h }));

  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function drawBackground(ctx, t) {
    px(ctx, 0, 0, W, 110, '#140a24');
    const sky = ctx.createLinearGradient(0, WIN.y, 0, WIN.y + WIN.h);
    sky.addColorStop(0, '#12052a'); sky.addColorStop(.6, '#3a0d52'); sky.addColorStop(1, '#a3195b');
    ctx.fillStyle = sky; ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    for (const b of far) px(ctx, b.x, WIN.y + WIN.h - b.h, b.w, b.h, '#2a1245');
    for (const b of near) {
      px(ctx, b.x, WIN.y + WIN.h - b.h, b.w, b.h, '#170a2b');
      for (const l of b.lights) {
        if (l.tw && Math.floor(t / 700 + l.x) % 3 === 0) continue;
        px(ctx, l.x, l.y, 1, 1, l.c);
      }
    }
    if (Math.floor(t / 120) % 23 !== 0) {
      ctx.strokeStyle = '#ff2a6d'; ctx.lineWidth = 1;
      ctx.strokeRect(signB.x + 2.5, WIN.y + WIN.h - signB.h + 3.5, signB.w - 5, 6);
      px(ctx, signB.x + 4, WIN.y + WIN.h - signB.h + 6, signB.w - 8, 1, '#ff8fb1');
    }
    ctx.save(); ctx.beginPath(); ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h); ctx.clip();
    ctx.fillStyle = 'rgba(5, 217, 232, .35)';
    for (const d of rain) {
      d.y += 4; d.x -= 1;
      if (d.y > WIN.y + WIN.h) { d.y = WIN.y - 3; d.x = WIN.x + Math.random() * (WIN.w + 20); }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
    }
    ctx.restore();
    const F = '#2a1640';
    px(ctx, WIN.x - 2, WIN.y - 2, WIN.w + 4, 2, F); px(ctx, WIN.x - 2, WIN.y + WIN.h, WIN.w + 4, 2, F);
    px(ctx, WIN.x - 2, WIN.y, 2, WIN.h, F); px(ctx, WIN.x + WIN.w, WIN.y, 2, WIN.h, F);
    for (let i = 1; i < 4; i++) px(ctx, WIN.x + Math.round(WIN.w / 4 * i) - 1, WIN.y, 2, WIN.h, F);
    px(ctx, 0, 0, W, 2, '#ff2a6d'); px(ctx, 0, 2, W, 3, 'rgba(255, 42, 109, .15)');
    px(ctx, 0, 108, W, 2, '#05d9e8'); px(ctx, 0, 104, W, 4, 'rgba(5, 217, 232, .08)');
    px(ctx, 0, 110, W, 70, '#0b0614');
    ctx.fillStyle = '#1c1030';
    for (const y of [114, 120, 128, 138, 150, 165]) ctx.fillRect(0, y, W, 1);
    for (let i = -12; i <= 12; i++)
      for (let y = 110; y < H; y++) ctx.fillRect(Math.round(160 + i * (10 + (y - 110) / 70 * 26)), y, 1, 1);
    px(ctx, 3, 98, 9, 12, '#2a1d45'); px(ctx, 3, 98, 9, 1, '#05d9e8');
    for (const [x, y] of [[7, 90], [6, 92], [8, 92], [5, 94], [9, 94], [4, 96], [10, 96], [7, 94], [7, 96], [6, 88]])
      px(ctx, x, y, 1, 2, '#39ff88');
    px(ctx, 290, 62, 22, 48, '#1b1530'); ctx.strokeStyle = '#2a1640'; ctx.strokeRect(290.5, 62.5, 21, 47);
    for (let s = 0; s < 6; s++) {
      px(ctx, 292, 66 + s * 7, 18, 5, '#24183a');
      px(ctx, 294, 68 + s * 7, 1, 1, Math.floor(t / 900 + s) % 2 ? '#ff4f4f' : '#4a1a1a');
      px(ctx, 297, 68 + s * 7, 10, 1, '#160f28');
    }
  }

  // ---- state
  const state = { roles: {}, selected: null };
  for (const m of CREW) if (isLocal(m))
    state.roles[m.role] = { busy: false, task_id: null, task_title: '', started: null, last_duration_s: null, last_status: null };

  for (const m of STATIONS) { m.phase = Math.floor(Math.random() * 2); m.nextBlink = performance.now() + 1000 + Math.random() * 4000; }

  function isTyping(m) {
    if (m.boss) return Object.values(state.roles).some(s => s.busy);
    return !!state.roles[m.role]?.busy;
  }

  function drawStation(ctx, m, t, frame) {
    const cx = m.x, dy = m.deskY, typing = isTyping(m);
    const bob = typing ? 0 : (Math.floor(t / 900) + m.phase) % 2;
    const ox = cx - 8, oy = dy - 20 + (m.look.small ? 2 : 0) + bob;
    if (t > m.nextBlink + 140) m.nextBlink = t + 2000 + Math.random() * 4000;
    const blink = t > m.nextBlink && t < m.nextBlink + 140;
    const chairTop = dy - (m.boss ? 19 : 16);
    px(ctx, cx - 8, chairTop, 16, dy - chairTop, '#221636');
    px(ctx, cx - 1, chairTop + 1, 2, dy - chairTop - 1, m.boss ? '#5a4a10' : '#2f1f4a');
    drawPerson(ctx, m, ox, oy, { blink, glow: typing });
    const w = m.boss ? 60 : 44, left = cx - w / 2;
    px(ctx, left, dy, w, 3, '#2a1d45');
    px(ctx, left, dy, w, 1, m.boss ? '#f5d300' : '#ff2a6d');
    px(ctx, left + 1, dy + 3, w - 2, 12, '#130b22');
    px(ctx, left + 1, dy + 15, w - 2, 1, '#05d9e8');
    px(ctx, cx - 6, dy - 4, 12, 4, '#1d1433');
    px(ctx, cx, dy - 3, 1, 1, m.color);
    const hx = cx + (m.boss ? 14 : 9), hy = dy - 13;
    px(ctx, hx + 5, dy - 4, 2, 4, '#2a1d45');
    ctx.globalAlpha = typing ? .35 : .12; px(ctx, hx, hy, 12, 9, m.look.glow);
    ctx.globalAlpha = typing ? .95 : .4;
    ctx.strokeStyle = m.look.glow; ctx.strokeRect(hx + .5, hy + .5, 11, 8);
    if (typing) for (let i = 0; i < 3; i++) px(ctx, hx + 2, hy + 2 + i * 2, 2 + ((frame + i * 3 + m.x) % 7), 1, m.look.glow);
    ctx.globalAlpha = 1;
    const lift = typing ? frame % 2 : -1;
    px(ctx, cx - 9, dy - 1 - (lift === 0 ? 1 : 0), 2, 1, m.look.skin);
    px(ctx, cx + 7, dy - 1 - (lift === 1 ? 1 : 0), 2, 1, m.look.skin);
  }

  const ctx = document.getElementById('scene').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const drawOrder = [...STATIONS].sort((a, b) => a.deskY - b.deskY);
  let frame = 0, lastDraw = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (t - lastDraw < 100) return;
    lastDraw = t; frame++;
    drawBackground(ctx, t);
    for (const m of drawOrder) drawStation(ctx, m, t, frame);
  }

  // ---- overlays and crew strip (all text set with textContent)
  const fmtDur = s => s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const pct = (v, total) => `${v / total * 100}%`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function statusOf(m) {
    if (m.boss) return { cls: 'online', l1: 'ONLINE', l2: 'cloud · on call', chip: 'ONLINE · cloud' };
    if (m.offline) return { cls: 'off', l1: 'HERMES · OFFLINE', l2: 'no runner', chip: 'OFFLINE · not configured' };
    const s = state.roles[m.role];
    if (s.busy) {
      const elapsed = s.started ? ` · ${fmtDur(Math.max(0, Date.now() / 1000 - s.started))}` : '';
      return { cls: 'busy', l1: `BUSY #${s.task_id ?? '?'}`, l2: clip(s.task_title || 'working', 18),
               chip: `BUSY #${s.task_id ?? '?'}${elapsed}` };
    }
    const failed = s.last_status === 'failed';
    const last = s.last_duration_s != null ? `last ${fmtDur(s.last_duration_s)}${failed ? ' · failed' : ''}` : 'no runs yet';
    return { cls: failed ? 'fail' : 'idle', l1: 'IDLE', l2: last, chip: `IDLE · ${last}` };
  }

  const layer = document.getElementById('layer'), crewEl = document.getElementById('crew');
  for (const m of CREW) {
    const headTop = m.offline ? m.deskY - 3 : m.deskY - 22 + (m.look.small ? 2 : 0);
    m.bubble = el('div', 'bubble');
    m.bubble.style.left = pct(m.offline ? 312 : m.x, W);
    m.bubble.style.top = pct(headTop, H);
    m.bubble.append(el('div', 'l1'), el('div', 'l2'));
    layer.append(m.bubble);
    if (!m.offline) {
      const plate = el('div', 'plate');
      plate.style.left = pct(m.x, W); plate.style.top = pct(m.deskY + 5, H);
      const n = el('span', null, m.name.toUpperCase()); n.style.color = m.color;
      plate.append(n, el('span', 'r', ` · ${m.role}`));
      layer.append(plate);
    }
    const hit = el('button', 'hit');
    hit.type = 'button';
    hit.setAttribute('aria-label', isLocal(m) ? `Assign a task to ${m.name} (${m.role})` : `${m.name}, ${m.role}`);
    const hh = m.offline ? 48 : 22;
    hit.style.left = pct(m.x - 11, W); hit.style.top = pct(m.offline ? m.deskY : m.deskY - 21, H);
    hit.style.width = pct(22, W); hit.style.height = pct(hh, H);
    hit.addEventListener('click', () => choose(m));
    layer.append(hit);

    m.chip = el('button', 'chip' + (isLocal(m) ? '' : ' static'));
    m.chip.type = 'button';
    if (isLocal(m)) m.chip.title = `Assign a task to ${m.name}`;
    const av = document.createElement('canvas'); av.width = 16; av.height = 20;
    drawPerson(av.getContext('2d'), m, 0, 0);
    const txt = el('span', 'txt');
    const nm = el('span', 'nm', m.name.toUpperCase()); nm.style.color = m.color;
    m.chipSt = el('span', 'st');
    txt.append(nm, el('span', 'rl', `${m.role} · ${m.model}`), m.chipSt);
    m.chip.append(av, txt);
    m.chip.addEventListener('click', () => choose(m));
    crewEl.append(m.chip);
  }

  function choose(m) {
    if (!isLocal(m)) return;
    highlight(m.role);
    if (typeof window.Office.onSelectRole === 'function') window.Office.onSelectRole(m.role);
  }
  function highlight(role) {
    state.selected = role;
    for (const m of CREW) {
      m.chip.classList.toggle('selected', m.role === role);
      m.bubble.classList.toggle('selected', m.role === role);
    }
  }
  function render() {
    for (const m of CREW) {
      const st = statusOf(m);
      m.bubble.className = `bubble ${st.cls}${m.offline ? ' right' : ''}${m.role === state.selected ? ' selected' : ''}`;
      m.bubble.children[0].textContent = st.l1;
      m.bubble.children[1].textContent = st.l2;
      m.chipSt.className = `st ${st.cls}`;
      m.chipSt.textContent = st.chip;
    }
  }
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
    }
    render();
  }
  function setMode(mode) {
    const badge = document.getElementById('mode');
    badge.textContent = mode === 'live' ? 'LIVE' : 'DISCONNECTED';
    badge.className = `mode ${mode === 'live' ? 'live' : 'down'}`;
  }

  window.Office = {
    crew: Object.fromEntries(CREW.map(m => [m.role, { name: m.name, color: m.color }])),
    applyRoles, setMode, highlight, onSelectRole: null,
  };
  render();
  requestAnimationFrame(loop);
})();
