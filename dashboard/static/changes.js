// Night City Office: AUTOPILOT button and the CHANGES timeline (Claude's plain-words, timestamped summary of what the crew changed).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = $('ap-btn'), line = $('ap-line'), list = $('chg-list'), msg = $('chg-msg');
  if (!btn || !list) return;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${r.status}`);
    return data;
  }
  let enabled = false;
  function paint(a) {
    enabled = a.enabled;
    const needs = a.enabled && a.state === 'needs_you';
    btn.textContent = needs ? 'AUTOPILOT: NEEDS YOU' : `AUTOPILOT: ${a.enabled ? 'ON' : 'OFF'}`;
    btn.classList.toggle('on', a.enabled && !needs);
    btn.classList.toggle('need', needs);
    btn.setAttribute('aria-pressed', String(a.enabled));
    line.textContent = `${a.enabled ? 'Autopilot is on: Claude applies finished work and queues the next project from your roadmap.' : 'Autopilot is off.'} ${a.note || ''} (${a.today}/${a.cap} autopilot projects today. Roadmap: ${a.roadmap})`;
  }
  async function poll() {
    try {
      paint(await api('/api/autopilot'));
      const d = await api('/api/changes');
      list.textContent = '';
      if (!d.changes.length) list.append(el('p', 'hint', 'Nothing yet. Each finished project gets an entry here.'));
      for (const c of d.changes) {
        const row = el('div', 'chg');
        row.append(el('time', null, new Date(c.ts * 1000).toLocaleString()), el('strong', null, `#${c.project} ${c.title}`), el('p', null, c.summary));
        list.append(row);
      }
    } catch (e) { /* quiet: the board shows connection problems */ }
  }
  btn.addEventListener('click', async () => {
    try { paint(await api('/api/autopilot', { enabled: !enabled })); } catch (e) { line.textContent = e.message; }
  });
  $('chg-sync').addEventListener('click', async () => {
    msg.textContent = 'Asking Claude...';
    try { const r = await api('/api/changes/sync', {}); msg.textContent = r.error ? `Not now: ${r.error}` : r.wrote ? 'Added an entry.' : 'Everything is already summarized.'; poll(); } catch (e) { msg.textContent = e.message; }
  });
  poll(); setInterval(poll, 8000);
})();
