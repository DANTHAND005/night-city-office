// Night City Office: the FREE TIME panel. What the crew drafts on its own when no project needs it. No outside requests.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const list = $('free-list'), line = $('free-line'), msg = $('free-msg'), tog = $('free-toggle'), idea = $('free-idea');
  if (!list) return;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${r.status}`);
    return data;
  }
  const LABEL = { todo: 'WAITING', working: 'WORKING', review: 'DRAFTED, AWAITS LEAD', accepted: 'ACCEPTED', rejected: 'REJECTED', failed: 'FAILED' };
  let enabled = true;
  async function poll() {
    try {
      const d = await api('/api/backlog');
      enabled = d.enabled; tog.textContent = enabled ? 'ON' : 'OFF';
      const c = d.counts, n = k => c[k] || 0;
      line.textContent = !enabled ? 'Free-time work is off.'
        : d.current ? `Working on: ${d.current}`
        : d.crew_needed ? 'A project has the crew. Free-time work resumes when it is idle or paused.'
        : `${n('todo')} waiting, ${n('review')} drafted, ${n('accepted')} accepted, ${n('rejected')} rejected. Drafts are in C:\\Vault\\inbox.`;
      list.textContent = '';
      for (const it of d.items.filter(i => i.status !== 'rejected' || i.note !== 'removed by you').slice(0, 6)) {
        const row = el('div', 'free-row');
        row.append(el('span', `free-st fs-${it.status}`, LABEL[it.status] || it.status), el('span', null, ` ${it.title}`));
        if (it.status === 'todo') {
          const x = el('button', 'small-btn', 'X'); x.type = 'button'; x.title = 'Remove';
          x.addEventListener('click', async () => { try { await api(`/api/backlog/${it.id}/remove`, {}); poll(); } catch (e) { msg.textContent = e.message; } });
          row.append(x);
        }
        list.append(row);
      }
    } catch (e) { /* quiet: the board shows connection problems */ }
  }
  tog.addEventListener('click', async () => { try { await api('/api/backlog/toggle', { enabled: !enabled }); poll(); } catch (e) { msg.textContent = e.message; } });
  async function add() {
    if (idea.value.trim().length < 3) return;
    try { await api('/api/backlog', { idea: idea.value }); idea.value = ''; msg.textContent = 'Added.'; poll(); } catch (e) { msg.textContent = e.message; }
  }
  $('free-add').addEventListener('click', add);
  idea.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  poll(); setInterval(poll, 5000);
})();
