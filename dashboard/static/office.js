// Night City Office: the crew's room as a picture, with round portraits at fixed stations, live bubbles,
// jack-in cables and hand-off packets. Background, portraits and layout come from C:\Vault\assets\office
// through /api/office; board.js feeds live data through window.Office.
(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG = 'http://www.w3.org/2000/svg';

  // jack = where a netrunner's cable runs to, as an offset in % of the room from their station.
  const CREW = [
    { id: 'lucy', role: 'coder', name: 'Qwen3 Coder', color: '#ff8fd8', jack: { dx: 6, dy: 8 } },
    { id: 'rebecca', role: 'vision', name: 'Qwen3-VL', color: '#8fff6a' },
    { id: 'kiwi', role: 'memory', name: 'Llama 3.2', color: '#ff6b7a', jack: { dx: 6, dy: 9 } },
    { id: 'maine', role: 'planner', name: 'Qwen3', color: '#ff9a4c' },
    { id: 'falco', role: 'trimmer', name: 'Qwen3 1.7B', color: '#d9a066' },
    { id: 'david', role: 'claude-code', name: 'Claude Code', color: '#f5d300', boss: true },
  ];
  const DEFAULT_LAYOUT = { lucy: [20, 60], rebecca: [9, 58], kiwi: [58, 64], maine: [68, 52], falco: [76, 62], david: [45, 86] };
  for (const m of CREW) [m.x, m.y] = DEFAULT_LAYOUT[m.id];
  const byRole = Object.fromEntries(CREW.map(m => [m.role, m]));
  const isLocal = m => !m.boss && !m.offline;

  const state = { roles: {}, selected: null, packets: [], queued: {}, editing: false };
  for (const m of CREW) if (isLocal(m))
    state.roles[m.role] = { busy: false, task_id: null, task_title: '', started: null, last_duration_s: null,
                            last_status: null, last_task_id: null, lane: null };
  const busy = m => !!state.roles[m.role]?.busy;

  const fmtDur = s => s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

  const roomEl = document.getElementById('office'), layer = document.getElementById('layer'), links = document.getElementById('links');
  const editBtn = document.getElementById('edit-layout'), layoutMsg = document.getElementById('layout-msg');

  // ---- stations: a round portrait (picture if one exists, else a silhouette) in a ring of the character's colour
  function silhouette() {
    const s = svgEl('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', class: 'sil' });
    s.append(svgEl('circle', { cx: 20, cy: 15, r: 7.5 }), svgEl('path', { d: 'M6 40c0-9 6-15 14-15s14 6 14 15z' }));
    return s;
  }
  for (const m of CREW) {
    m.station = el('button', 'station');
    m.station.type = 'button'; m.station.dataset.role = m.role;
    m.station.style.setProperty('--c', m.color);
    m.portrait = el('span', 'portrait');
    m.portrait.append(silhouette());
    m.station.append(el('span', 'halo'), m.portrait);
    m.station.setAttribute('aria-label', isLocal(m) ? `${m.name}, ${m.role}: assign a task` : `${m.name}, ${m.boss ? 'Claude Code' : m.role}`);
    m.bubble = el('div', 'bub');
    layer.append(m.station, m.bubble);
    m.station.addEventListener('click', () => { if (!state.editing) choose(m); });
    wireDrag(m);
  }
  function place(m) {
    m.station.style.left = `${m.x}%`; m.station.style.top = `${m.y}%`;
    m.bubble.style.left = `${m.x}%`; m.bubble.style.top = `${m.y}%`;
  }

  // ---- the lanes screen, set on the hanging holo screens
  const holo = el('div', 'holo');
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

  // ---- bubbles: working = speech bubble with task and timer; everyone else = a one-line name tag
  function bubbleOf(m) {
    const name = m.name.toUpperCase();
    if (m.boss) return { cls: 'chip', who: name, main: 'on call' };
    if (m.offline) return { cls: 'chip off', who: name, main: 'offline' };
    const s = state.roles[m.role];
    if (s.busy) {
      const dur = s.started ? fmtDur(Math.max(0, Date.now() / 1000 - s.started)) : '';
      return { cls: 'busy', who: `${name} · ${m.role.toUpperCase()}${m.jack ? ' · JACKED IN' : ''}`,
               main: `#${s.task_id ?? '?'} ${clip(s.task_title || 'working', 30)}`, n: dur };
    }
    if (s.last_status === 'failed') return { cls: 'chip', who: name, main: 'idle · ', fail: `#${s.last_task_id ?? '?'} failed` };
    return { cls: 'chip', who: name, main: s.last_duration_s != null ? `idle ${fmtDur(s.last_duration_s)}` : 'idle' };
  }
  function statusClass(m) {
    if (m.offline) return 's-off';
    if (m.boss) return 's-boss';
    const s = state.roles[m.role];
    return s.busy ? 's-busy' : s.last_status === 'failed' ? 's-fail' : 's-idle';
  }

  function render() {
    for (const m of CREW) {
      place(m);
      m.station.className = `station ${statusClass(m)}${m.jack && busy(m) ? ' jacked' : ''}${m.role === state.selected ? ' selected' : ''}`;
      const b = bubbleOf(m);
      m.bubble.className = `bub ${b.cls}`;
      const who = el('span', 'who', b.who);
      if (b.cls.startsWith('chip')) who.style.color = m.color;
      const parts = [who, document.createTextNode(b.main)];
      if (b.fail) parts.push(el('span', 'fail', b.fail));
      if (b.n) parts.push(el('span', 'n', b.n));
      m.bubble.replaceChildren(...parts);
    }
    unstack();
    renderHolo();
    renderLinks();
  }

  // Lift any bubble that would overlap an earlier bubble or another portrait; a stem keeps it attached.
  function unstack() {
    const rects = new Map(CREW.map(m => [m, m.station.getBoundingClientRect()]));
    const placed = [];
    for (const m of [...CREW].sort((a, b) => a.x - b.x)) {
      const b = m.bubble;
      b.style.setProperty('--lift', '0px');
      let lift = 0;
      const r = b.getBoundingClientRect();
      const blockers = [...placed, ...CREW.filter(o => o !== m).map(o => rects.get(o))];
      for (let guard = 0; guard < 8; guard++) {
        const hit = blockers.find(p => r.left < p.right + 4 && r.right > p.left - 4 && r.top - lift < p.bottom + 4 && r.bottom - lift > p.top - 4);
        if (!hit) break;
        lift = r.bottom - hit.top + 6;
      }
      b.style.setProperty('--lift', `${lift}px`);
      placed.push({ left: r.left, right: r.right, top: r.top - lift, bottom: r.bottom - lift });
    }
  }

  // ---- cables and packets, drawn in room pixels so lines keep their weight at any size
  function renderLinks() {
    const box = roomEl.getBoundingClientRect();
    if (!box.width) return;
    const px = (xp, yp) => ({ x: xp / 100 * box.width, y: yp / 100 * box.height });
    const parts = [];
    for (const m of CREW) if (m.jack && busy(m)) {
      const r = m.station.getBoundingClientRect();
      const a = { x: r.left + r.width / 2 - box.left, y: r.bottom - box.top - 4 }, b = px(m.x + m.jack.dx, m.y + m.jack.dy);
      parts.push({ kind: 'cable', color: m.color, d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(a.x + 10).toFixed(1)} ${(b.y + 6).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, end: b });
    }
    const labels = [];
    for (const { from, to, id, role } of state.packets) {
      const ra = from.bubble.getBoundingClientRect(), rb = to.bubble.getBoundingClientRect();
      const a = { x: ra.left + ra.width / 2 - box.left, y: ra.top - box.top - 2 }, b = { x: rb.left + rb.width / 2 - box.left, y: rb.top - box.top - 2 };
      const c = { x: (a.x + b.x) / 2, y: Math.max(8, Math.min(a.y, b.y) - 70) };
      const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      parts.push({ kind: 'packet', d });
      labels.push({ text: `#${id} → ${role}`, x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 });
    }
    const key = `${Math.round(box.width)}x${Math.round(box.height)}|` + parts.map(p => p.kind + p.d).join('|') + labels.map(l => l.text).join();
    if (key === state.linkKey) return;  // unchanged: leave the animations running
    state.linkKey = key;
    links.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    links.replaceChildren();
    for (const p of layer.querySelectorAll('.packet-label')) p.remove();
    for (const p of parts) {
      if (p.kind === 'cable') {
        links.append(svgEl('path', { d: p.d, class: 'cable-base', stroke: p.color }), svgEl('path', { d: p.d, class: 'cable-flow', stroke: p.color }),
                     svgEl('rect', { x: p.end.x - 7, y: p.end.y - 4, width: 14, height: 8, rx: 2, class: 'deck', stroke: p.color }));
      } else {
        const path = svgEl('path', { d: p.d, class: 'route' });
        const dot = svgEl('circle', { r: 5, class: 'packet-dot' });
        if (reduceMotion) {  // a still packet at the middle of its route
          links.append(path, dot);
          const len = path.getTotalLength(), pt = path.getPointAtLength(len / 2);
          dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        } else {
          dot.append(svgEl('animateMotion', { dur: '1.8s', repeatCount: 'indefinite', path: p.d }));
          links.append(path, dot);
        }
      }
    }
    for (const l of labels) {
      const lab = el('div', 'packet-label', l.text);
      lab.style.left = `${l.x}px`; lab.style.top = `${l.y}px`;
      layer.append(lab);
    }
  }

  // ---- edit layout: drag a portrait (or focus it and use the arrow keys) and the new spot is saved to layout.json
  let saveTimer = null;
  function say(text, kind) { layoutMsg.textContent = text; layoutMsg.className = `layout-msg ${kind || ''}`; }
  async function saveLayout() {
    const stations = Object.fromEntries(CREW.map(m => [m.id, { x: +m.x.toFixed(2), y: +m.y.toFixed(2) }]));
    try {
      const r = await fetch('/api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stations }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
      say('saved to layout.json', 'ok');
    } catch (e) { say(`not saved: ${e.message}`, 'err'); }
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveLayout, 400); };
  function wireDrag(m) {
    let drag = null;
    m.station.addEventListener('pointerdown', e => {
      if (!state.editing) return;
      e.preventDefault();
      m.station.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId };
    });
    m.station.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const box = roomEl.getBoundingClientRect();
      m.x = Math.min(100, Math.max(0, (e.clientX - box.left) / box.width * 100));
      m.y = Math.min(100, Math.max(0, (e.clientY - box.top) / box.height * 100));
      place(m);
      say(`${m.name}: x ${m.x.toFixed(1)} · y ${m.y.toFixed(1)}`);
    });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; render(); saveLayout(); } };
    m.station.addEventListener('pointerup', end);
    m.station.addEventListener('pointercancel', end);
    m.station.addEventListener('keydown', e => {
      if (!state.editing) return;
      const step = e.shiftKey ? 2 : 0.5, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      m.x = Math.min(100, Math.max(0, m.x + d[0])); m.y = Math.min(100, Math.max(0, m.y + d[1]));
      render();
      say(`${m.name}: x ${m.x.toFixed(1)} · y ${m.y.toFixed(1)}`);
      saveSoon();
    });
  }
  editBtn.addEventListener('click', () => {
    state.editing = !state.editing;
    editBtn.setAttribute('aria-pressed', String(state.editing));
    editBtn.textContent = state.editing ? 'DONE EDITING' : 'EDIT LAYOUT';
    roomEl.classList.toggle('editing', state.editing);
    say(state.editing ? 'drag a portrait, or focus one and use the arrow keys' : '');
  });

  // ---- background, portraits and saved layout
  async function loadOffice() {
    let data;
    try { const r = await fetch('/api/office', { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); data = await r.json(); }
    catch (e) { say(`room assets not loaded: ${e.message}`, 'err'); return; }
    // The room itself is drawn by room3d.js; room.jpg is reference art only and is not shown.
    for (const m of CREW) {
      const spot = data.layout?.[m.id];
      if (spot) { m.x = spot.x; m.y = spot.y; }
      const src = data.portraits?.[m.id];
      if (src) {
        const pic = el('img'); pic.alt = ''; pic.src = src;
        pic.addEventListener('error', () => m.portrait.replaceChildren(silhouette()));
        m.portrait.replaceChildren(pic);
      }
    }
    render();
  }

  // ---- interface used by board.js
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
  }
  // A handed-off task travels from the parent's station to its own while it waits, and for PACKET_S seconds after.
  const PACKET_S = 12;
  function applyTasks(columns) {
    const all = new Map();
    for (const col of Object.values(columns || {})) for (const t of col.tasks || []) all.set(t.id, t);
    const packets = [], queued = {}, now = Date.now() / 1000;
    for (const t of columns?.queued?.tasks || []) {
      const lane = state.roles[t.role]?.lane;
      if (lane) queued[lane] = (queued[lane] || 0) + 1;
    }
    for (const t of [...(columns?.queued?.tasks || []), ...(columns?.running?.tasks || []), ...(columns?.done?.tasks || [])]) {
      if (!t.parent_task_id || !(t.status === 'queued' || now - t.created < PACKET_S)) continue;
      const parent = all.get(t.parent_task_id);
      const from = parent && byRole[parent.role], to = byRole[t.role];
      if (from && to && from !== to && packets.length < 3) packets.push({ from, to, id: t.id, role: t.role });
    }
    state.packets = packets; state.queued = queued;
    render();
  }
  function setMode(mode) {
    const badge = document.getElementById('mode');
    badge.textContent = mode === 'live' ? 'LIVE' : 'DISCONNECTED';
    badge.className = `mode ${mode === 'live' ? 'live' : 'down'}`;
  }

  window.Office = {
    crew: Object.fromEntries(CREW.map(m => [m.role, { name: m.name, color: m.color }])),
    applyRoles, applyTasks, setMode, highlight, onSelectRole: null, packets: () => state.packets,
  };
  render();
  loadOffice();
  setInterval(render, 1000);  // keeps busy timers ticking between polls
  if (window.ResizeObserver) new ResizeObserver(() => render()).observe(roomEl);
})();
