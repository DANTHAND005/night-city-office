// Night City Office extras: the stats strip, the agent card, the vault notes window, per-agent skills, ambient sound and the
// LIGHT switch. Runs after office.js and board.js and talks to them only through window.Office. No outside requests.
(() => {
  'use strict';
  const Office = window.Office;
  if (!Office) return;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const LOCAL = ['coder', 'planner', 'vision', 'memory', 'trimmer'];
  const MODEL = {
    coder: ['qwen3:8b', 'this PC, GPU'], planner: ['qwen3:8b', 'this PC, GPU'], vision: ['qwen3-vl:4b', 'laptop'],
    memory: ['memory-cpu (Llama 3.2)', 'laptop'], trimmer: ['trimmer-cpu (Qwen3 1.7B)', 'laptop'],
    'claude-code': ['Claude, in the cloud', 'orchestrator'],
  };
  const fmtDur = s => s == null ? '--' : s < 60 ? `${s.toFixed(1)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${r.status}`);
    return data;
  }

  // ---- what office.js and board.js feed in: keep the latest roles and tasks for the card
  let roles = {}, columns = null, stats = null;
  const busyMap = () => Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, !!v.busy]));
  const colors = Object.fromEntries(Object.entries(Office.crew).map(([r, c]) => [r, c.color]));
  const origRoles = Office.applyRoles, origTasks = Office.applyTasks;
  Office.applyRoles = data => { for (const r of (data && data.roles) || []) roles[r.role] = r; origRoles(data); publish(); renderCard(); };
  Office.applyTasks = cols => { columns = cols; origTasks(cols); renderCard(); };
  function publish() { if (stats) Office.stats = { ...stats, busy: busyMap(), colors }; }

  // ---- stats strip (top of the page)
  const strip = $('stats');
  const cells = {};
  function cell(key, label, cls) {
    const c = el('div', `stat ${cls || ''}`); c.append(el('span', 'v', '--'), el('span', 'l', label));
    strip.append(c); cells[key] = c.firstChild; return c;
  }
  cell('queued', 'QUEUED', 'q'); cell('running', 'RUNNING', 'r'); cell('done', 'DONE', 'd'); cell('failed', 'FAILED', 'f');
  const succ = cell('success', 'SUCCESS RATE', 'wide'); const bar = el('i', 'bar'); bar.append(el('b')); succ.append(bar);
  cell('avg', 'AVG TIME'); cell('day', 'LAST 24 HOURS');
  const flow = el('div', 'stat spark'); const sp = el('div', 'spark-bars'); for (let i = 0; i < 12; i++) sp.append(el('b'));
  flow.append(sp, el('span', 'l', 'FINISHED PER 5 MIN, LAST HOUR')); strip.append(flow);
  const crewCell = el('div', 'stat crewcell'); const dots = el('div', 'dots');
  for (const r of LOCAL) { const d = el('i'); d.title = Office.crew[r].name; d.style.setProperty('--c', colors[r]); d.dataset.role = r; dots.append(d); }
  const clock = el('span', 'v clock', '--:--'); crewCell.append(dots, el('span', 'l', 'AGENTS BUSY'), clock);
  strip.append(crewCell);
  function renderStats() {
    if (!stats) return;
    const s = stats.by_status;
    cells.queued.textContent = s.queued; cells.running.textContent = s.running; cells.done.textContent = s.done; cells.failed.textContent = s.failed;
    cells.success.textContent = stats.success == null ? '--' : `${Math.round(stats.success * 100)}%`;
    succ.querySelector('b').style.width = stats.success == null ? '0%' : `${stats.success * 100}%`;
    cells.avg.textContent = fmtDur(stats.avg_s); cells.day.textContent = stats.last_24h;
    const m = Math.max(1, ...stats.per_5min);
    [...sp.children].forEach((b, i) => { b.style.height = `${8 + stats.per_5min[i] / m * 92}%`; });
    const busy = busyMap();
    dots.querySelectorAll('i').forEach(d => d.classList.toggle('on', !!busy[d.dataset.role]));
    crewCell.querySelector('.l').textContent = `AGENTS BUSY ${LOCAL.filter(r => busy[r]).length}/${LOCAL.length}`;
  }
  let last = { done: null, failed: null };
  async function pollStats() {
    try {
      stats = await api('/api/stats');
      if (last.done != null && stats.by_status.done > last.done) sound.chime();
      if (last.failed != null && stats.by_status.failed > last.failed) sound.buzz();
      last = { done: stats.by_status.done, failed: stats.by_status.failed };
      publish(); renderStats(); renderCard();
    } catch (_) { /* the page's own mode badge already says the server is down */ }
  }
  setInterval(() => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);

  // ---- agent card
  const card = $('agent-card');
  let cardRole = null, skills = null;
  const closeCard = () => { cardRole = null; card.hidden = true; };
  Office.onSelectRole = role => { if (role === cardRole && !card.hidden) { closeCard(); return; } cardRole = role; renderCard(true); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden && !document.querySelector('dialog[open]')) closeCard(); });
  async function loadSkills() { try { skills = await api('/api/skills'); renderCard(); } catch (_) { skills = null; } }
  function renderCard(open) {
    if (!cardRole) return;
    if (card.contains(document.activeElement) && !open && document.activeElement.tagName !== 'BUTTON') return;  // do not rebuild under the user's cursor
    const who = Office.crew[cardRole]; if (!who) return;
    const info = MODEL[cardRole] || ['', ''], r = roles[cardRole] || {}, st = stats && stats.roles[cardRole];
    const x = parseFloat((document.querySelector(`.station[data-role="${cardRole}"]`) || {}).style?.left) || 50;
    card.classList.toggle('right', x < 50);  // sit on the side away from the agent so it never covers them
    card.style.setProperty('--c', who.color);
    const head = el('div', 'ac-head'); const sw = el('span', 'sw');
    const titles = el('div'); titles.append(el('strong', null, who.name), el('span', 'sub2', `${cardRole} on ${info[1]}`));
    const x1 = el('button', 'small-btn', 'CLOSE'); x1.type = 'button'; x1.addEventListener('click', closeCard);
    const btns = el('div', 'ac-btns');
    if (LOCAL.includes(cardRole)) {
      const go = el('button', 'small-btn assign', 'ASSIGN TASK'); go.type = 'button';
      go.addEventListener('click', () => { $('task-form').closest('details').open = true; $('task-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('f-input').focus({ preventScroll: true }); });
      btns.append(go);
    }
    btns.append(x1);
    head.append(sw, titles, btns);
    const state = cardRole === 'claude-code' ? (r.busy ? 'LEADING' : 'ON CALL') : r.busy ? 'WORKING' : r.last_status === 'failed' ? 'LAST TASK FAILED' : 'IDLE';
    const rows = el('dl', 'ac-grid');
    const row = (k, v) => { const g = el('div'); g.append(el('dt', null, k), el('dd', null, v)); rows.append(g); };
    row('MODEL', info[0]); row('STATUS', state);
    if (st) { row('DONE', String(st.done)); row('FAILED', String(st.failed)); row('AVG TIME', fmtDur(st.avg_s)); row('LAST RUN', fmtDur(r.last_duration_s)); }
    const parts = [head, rows];
    if (r.busy) parts.push(el('p', 'ac-line', `Now: #${r.task_id} ${r.task_title}`));
    const recent = columns ? ['running', 'done', 'failed'].flatMap(k => columns[k].tasks).filter(t => t.role === cardRole).sort((a, b) => b.id - a.id).slice(0, 3) : [];
    if (recent.length) {
      const ul = el('ul', 'ac-recent');
      for (const t of recent) {
        const b = el('button', `ac-task s-${t.status}`, `#${t.id} ${t.title}`); b.type = 'button';
        b.addEventListener('click', () => document.querySelector(`.task[data-id="${t.id}"]`)?.click());
        const li = el('li'); li.append(b); ul.append(li);
      }
      parts.push(el('h4', null, 'RECENT'), ul);
    }
    if (LOCAL.includes(cardRole)) {
      parts.push(el('h4', null, 'SKILLS'));
      if (skills && skills.skills.length) {
        const on = new Set(skills.assigned[cardRole] || []), box = el('div', 'chips');
        for (const s of skills.skills) {
          const c = el('button', `chip${on.has(s.name) ? ' on' : ''}`, s.name); c.type = 'button'; c.title = s.description; c.setAttribute('aria-pressed', on.has(s.name));
          c.addEventListener('click', async () => {
            const next = new Set(skills.assigned[cardRole] || []); next.has(s.name) ? next.delete(s.name) : next.add(s.name);
            try { skills.assigned = (await api('/api/skills', { role: cardRole, skills: [...next] })).assigned; } catch (e) { msg.textContent = e.message; }
            renderCard(true);
          });
          box.append(c);
        }
        parts.push(box, el('p', 'hint', 'Switched-on skills are put in front of this role\'s next tasks.'));
      } else parts.push(el('p', 'hint', skills ? 'No skills found in C:\\Vault\\skills.' : 'Skills are not available.'));
    }
    const msg = el('p', 'msg');
    parts.push(msg);
    card.replaceChildren(...parts); card.hidden = false;
  }

  // ---- vault notes window (the bookshelf)
  const vd = $('vault'), vList = $('v-list'), vText = $('v-text'), vTitle = $('v-title');
  const ago = ts => { const s = Date.now() / 1000 - ts; return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  $('vault-btn').addEventListener('click', async () => {
    vList.replaceChildren(el('p', 'hint', 'Loading...')); vText.textContent = 'Pick a note on the left.'; vTitle.textContent = 'VAULT';
    if (!vd.open) vd.showModal();
    try {
      const { notes } = await api('/api/vault');
      vList.replaceChildren(...(notes.length ? notes.map(n => {
        const b = el('button', 'note'); b.type = 'button';
        b.append(el('strong', null, n.title), el('span', 'p', `${n.path} - ${ago(n.mtime)}`), el('span', 's', n.snippet));
        b.addEventListener('click', async () => {
          vList.querySelectorAll('.note.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
          vTitle.textContent = n.path; vText.textContent = 'Loading...';
          try { vText.textContent = (await api(`/api/vault/note?path=${encodeURIComponent(n.path)}`)).text; } catch (e) { vText.textContent = e.message; }
        });
        return b;
      }) : [el('p', 'hint', 'No notes yet.')]));
    } catch (e) { vList.replaceChildren(el('p', 'msg err', e.message)); }
  });
  $('v-close').addEventListener('click', () => vd.close());

  // ---- LIGHT: AUTO follows the clock, NIGHT and DAY force the city lighting
  const lightBtn = $('light-btn'), LIGHTS = ['auto', 'night', 'day'];
  let li = 0;
  try { li = Math.max(0, LIGHTS.indexOf(localStorage.getItem('nco-light'))); } catch (_) { /* storage blocked */ }
  const setLight = () => { Office.lightMode = LIGHTS[li]; lightBtn.textContent = `LIGHT: ${LIGHTS[li].toUpperCase()}`; try { localStorage.setItem('nco-light', LIGHTS[li]); } catch (_) { /* ok */ } };
  lightBtn.addEventListener('click', () => { li = (li + 1) % LIGHTS.length; setLight(); });
  setLight();

  // ---- sound: rain, a low city hum, keyboard clatter while agents work, a chime when a task finishes. All synthesized; off until clicked.
  const sound = (() => {
    let ac = null, master = null, on = false, clatter = 0;
    const burst = (freq, dur, vol, type = 'bandpass') => {
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start();
    };
    const tone = (freq, at, dur, vol, type = 'sine', to) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
      o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    };
    function build() {
      ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const rain = ac.createBufferSource(), rf = ac.createBiquadFilter(), rg = ac.createGain();
      rain.buffer = buf; rain.loop = true; rf.type = 'bandpass'; rf.frequency.value = 1400; rf.Q.value = 0.4; rg.gain.value = 0.045; rain.connect(rf); rf.connect(rg); rg.connect(master); rain.start();
      for (const f of [55, 82.5]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = 0.018; o.connect(g); g.connect(master); o.start(); }
      clatter = setInterval(() => { if (on && Object.values(busyMap()).some(Boolean) && Math.random() < 0.7) burst(2600 + Math.random() * 1800, 0.025, 0.05); }, 130);
    }
    let seen = new Set();
    setInterval(() => {  // a soft blip each time a result starts travelling between two agents
      const ids = new Set(((Office.packets && Office.packets()) || []).map(p => p.id));
      if (on) for (const id of ids) if (!seen.has(id)) tone(520, 0, 0.35, 0.08, 'sine', 1040);
      seen = ids;
    }, 400);
    return {
      get on() { return on; },
      async toggle() {
        if (!ac) build();
        on = !on;
        if (on) await ac.resume(); else await ac.suspend();
        return on;
      },
      chime() { if (on) { tone(659, 0, 0.5, 0.1); tone(988, 0.12, 0.6, 0.1); } },
      buzz() { if (on) tone(140, 0, 0.35, 0.12, 'sawtooth', 70); },
    };
  })();
  const soundBtn = $('sound-btn');
  soundBtn.addEventListener('click', async () => {
    const on = await sound.toggle(); soundBtn.setAttribute('aria-pressed', on); soundBtn.textContent = `SOUND: ${on ? 'ON' : 'OFF'}`;
  });

  pollStats(); loadSkills();
  setInterval(pollStats, 3000);
})();
