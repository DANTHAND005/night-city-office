// Night City Office: the "Talk to the lead" panel. One idea in, Claude Code plans and runs the crew. No outside requests.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const idea = $('lead-idea'), go = $('lead-go'), msg = $('lead-msg'), run = $('lead-run'), past = $('lead-past');
  if (!idea) return;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${r.status}`);
    return data;
  }
  const LABEL = { paused: 'PAUSED, CLAUDE CODE OUT OF USAGE, RETRYING', queued: 'QUEUED', planning: 'PLANNING', waiting: 'WAITING FOR YOU, CONTINUES ON ITS OWN', running: 'CREW WORKING', reviewing: 'REVIEWING',
    done: 'DONE', failed: 'FAILED', cancelled: 'CANCELLED' };
  const APPLY = { proposed: 'WAITING FOR YOUR OK', applying: 'APPLYING NOW', applied: 'APPLIED', skipped: 'SKIPPED', failed: 'FAILED', blocked: 'BLOCKED, NOTHING CHANGED' };
  const TOOL_LABEL = { roblox: 'Roblox Studio', blender: 'Blender', figma: 'Figma' };
  const ACTIVE = new Set(['paused', 'queued', 'planning', 'waiting', 'running', 'reviewing']);
  const tools = $('lead-apply');
  let shown = null, sig = '', typed = {}, lastStatus = '', pinned = false;

  function render(p) {
    run.hidden = false;
    run.textContent = '';
    const head = el('div', 'lead-head');
    head.append(el('span', `lead-st st-${p.status}`, LABEL[p.status] || p.status), el('strong', null, `#${p.id} ${p.title || p.idea.slice(0, 50)}`));
    run.append(head);
    const total = p.tasks.length, done = p.tasks.filter(t => t.status === 'done' || t.status === 'failed').length;
    if (total) {
      const bar = el('div', 'lead-bar'), fill = el('i'); fill.style.width = `${Math.round(100 * done / total)}%`; bar.append(fill);
      run.append(bar, el('p', 'hint', `${done}/${total} crew tasks finished`));
    }
    const answered = p.notes.filter(n => n.kind === 'question' && n.answer != null);
    if (answered.length) {
      const qa = el('details', 'lead-qa'); qa.append(el('summary', null, `${answered.length} question${answered.length > 1 ? 's' : ''} answered`));
      for (const n of answered) { const box = el('div', 'lead-q'); box.append(el('p', null, n.text), el('p', 'hint', `You: ${n.answer}`)); qa.append(box); }
      run.append(qa);
    }
    for (const n of p.notes.filter(n => n.kind === 'question' && n.answer == null)) {
      const box = el('div', 'lead-q');
      box.append(el('p', null, n.text));
      if (n.answer != null) box.append(el('p', 'hint', `You: ${n.answer}`));
      else {
        const inp = el('input'); inp.placeholder = `Default: ${n.default_answer}`; inp.maxLength = 2000; inp.value = typed[n.id] || '';
        inp.addEventListener('input', () => { typed[n.id] = inp.value; });
        const b = el('button', 'small-btn', 'ANSWER'); b.type = 'button';
        b.addEventListener('click', async () => {
          if (!inp.value.trim()) return;
          try { await api(`/api/lead/${p.id}/answer`, { note_id: n.id, answer: inp.value }); delete typed[n.id]; poll(); } catch (e) { msg.textContent = e.message; }
        });
        box.append(inp, b);
      }
      run.append(box);
    }
    const log = el('ul', 'lead-log');
    for (const n of p.notes.filter(n => n.kind === 'log').slice(-6)) log.append(el('li', null, n.text));
    run.append(log);
    if (p.summary && !ACTIVE.has(p.status)) run.append(el('pre', 'lead-sum', p.summary));
    if (p.apply_status) {
      const box = el('div', 'lead-q');
      box.append(el('p', null, `Apply to ${JSON.parse(p.apply || '[]').map(k => TOOL_LABEL[k] || k).join(', ')}: ${APPLY[p.apply_status] || p.apply_status}`));
      if (p.apply_plan) box.append(el('pre', 'lead-sum', p.apply_plan));
      if (p.apply_report && p.apply_status !== 'proposed') box.append(el('pre', 'lead-sum', p.apply_report));
      if (['proposed', 'failed', 'blocked'].includes(p.apply_status) && p.status === 'done') {
        box.append(el('p', 'hint', 'Before pressing: the tool must be open and ready. It makes no changes unless it is certain it has everything.'));
        for (const [label, ok] of [['APPLY', true], ['SKIP', false]]) {
          const b = el('button', 'small-btn', label); b.type = 'button';
          b.addEventListener('click', async () => { try { await api(`/api/lead/${p.id}/apply`, { approve: ok }); sig = ''; poll(); } catch (e) { msg.textContent = e.message; } });
          box.append(b);
        }
      }
      run.append(box);
    }
    if (ACTIVE.has(p.status)) {
      const c = el('button', 'small-btn', 'CANCEL PROJECT'); c.type = 'button';
      c.addEventListener('click', async () => { try { await api(`/api/lead/${p.id}/cancel`, {}); poll(); } catch (e) { msg.textContent = e.message; } });
      run.append(c);
    } else if (p.status === 'done') {
      run.append(el('p', 'hint', `Report: C:\\Vault\\projects\\lead-${p.id}.md. Retro: C:\\Vault\\journal\\lead-${p.id}-retro.md`));
      if (p.meets) run.append(el('p', 'hint', `Lead says it meets your intent: ${p.meets}`));
      if (p.verdict) run.append(el('p', 'hint', `You rated it: ${p.verdict === 'good' ? 'GOOD' : 'NEEDS WORK'}${p.verdict_note ? ' - ' + p.verdict_note : ''}`));
      else {
        const box = el('div', 'lead-q'); box.append(el('p', null, 'Is this what you wanted?'));
        const inp = el('input'); inp.placeholder = 'Optional note: what was good or wrong'; inp.maxLength = 1000; box.append(inp);
        for (const [label, ok] of [['GOOD', true], ['NEEDS WORK', false]]) {
          const b = el('button', 'small-btn', label); b.type = 'button';
          b.addEventListener('click', async () => { try { await api(`/api/lead/${p.id}/verdict`, { ok, note: inp.value }); sig = ''; poll(); } catch (e) { msg.textContent = e.message; } });
          box.append(b);
        }
        run.append(box);
      }
    }
  }

  async function poll() {
    try {
      const list = await api('/api/lead');
      const ap = list.active ? await api(`/api/lead/${list.active.id}`) : null;
      // the back hologram shows the running project's checklist
      if (window.Office) window.Office.project = ap ? { status: ap.status, title: ap.title || ap.idea.slice(0, 30), plan: ap.plan } : null;
      if (list.active && !pinned) shown = list.active.id; else if (shown == null && list.projects.length) shown = list.projects[0].id;
      go.textContent = list.active ? 'ADD TO QUEUE' : 'START PROJECT';
      past.textContent = '';
      for (const p of list.projects.filter(p => p.id !== shown).slice(0, 4)) {
        const b = el('button', 'lead-past-btn', `#${p.id} ${(p.title || p.idea).slice(0, 40)} - ${(LABEL[p.status] || p.status).split(',')[0]}${p.status === 'done' && !p.verdict ? ' (RATE IT)' : ''}`); b.type = 'button';
        b.addEventListener('click', () => { shown = p.id; pinned = true; sig = ''; poll(); });
        past.append(b);
      }
      if (shown != null) {
        const p = ap && ap.id === shown ? ap : await api(`/api/lead/${shown}`);
        lastStatus = p.status;
        const s = JSON.stringify([p.status, p.title, p.summary, p.apply_status, p.apply_report, p.notes.map(n => [n.id, n.answer]), p.notes.length, p.tasks.map(t => t.status)]);
        if (s !== sig && !run.contains(document.activeElement)) { sig = s; render(p); }  // don't wipe an answer being typed
      }
    } catch (e) { /* the board shows connection problems; stay quiet here */ }
  }

  async function start() {
    if (go.disabled || idea.value.trim().length < 3) return;
    go.disabled = true; msg.textContent = '';
    try { const r = await api('/api/lead', { idea: idea.value, research: $('lead-research').checked, apply: [...tools.querySelectorAll('input:checked')].map(i => i.value), auto_apply: $('lead-auto').checked }); pinned = false; if (shown == null || !ACTIVE.has(lastStatus)) shown = r.id; sig = ''; idea.value = ''; msg.textContent = 'Queued. The lead starts as soon as it is free.'; poll(); }
    catch (e) { msg.textContent = e.message; }
    go.disabled = false;
  }
  api('/api/apply/tools').then(d => {
    const avail = d.tools.filter(t => t.available), note = el('p', 'hint');
    if (!avail.length) return;
    tools.className = 'chips'; tools.append(el('span', 'hint', 'Apply at the end to:'));
    for (const t of avail) {
      const l = el('label', 'chip pick'), i = el('input'); i.type = 'checkbox'; i.value = t.key;
      i.addEventListener('change', () => {
        const on = avail.filter(a => tools.querySelector(`input[value=${a.key}]`).checked);
        $('lead-auto-row').hidden = !on.length; note.textContent = on.length ? 'Needs: ' + on.map(a => `${a.label}: ${a.needs}`).join('. ') + '.' : '';
      });
      l.append(i, t.label); tools.append(l);
    }
    tools.after(note);
  }).catch(() => {});
  go.addEventListener('click', start);
  idea.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); start(); } });
  // scorecard: how each model fares in the crew's checks and the lead's review
  const dlg = $('score'), sb = $('s-body');
  const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '--';
  async function openScore() {
    sb.textContent = 'Loading...';
    if (!dlg.open) dlg.showModal();
    try {
      const data = await api('/api/scorecard');
      const t = el('table', 'score-t'), head = el('tr');
      for (const h of ['AGENT', 'MODEL', 'CHECKED', 'PEER PASS 1ST TRY', 'AVG FIXES', 'CODE SYNTAX OK', 'LEAD REJECTED', 'TASKS DONE', 'FAILED', 'AVG TIME']) head.append(el('th', null, h));
      t.append(head);
      for (const r of data.roles) {
        const tr = el('tr');
        for (const v of [r.role, r.model, r.checked, pct(r.peer_pass, r.checked), r.avg_fixes, pct(r.code_ok, r.code_n), pct(r.rejected, r.checked), r.done, r.failed, r.avg_s == null ? '--' : `${r.avg_s.toFixed(1)}s`]) tr.append(el('td', null, String(v)));
        t.append(tr);
      }
      sb.textContent = ''; sb.append(t, el('p', 'hint', 'Checked = tasks from lead projects. Peer pass: another model accepted the work first time. Lead rejected: Claude sent it back at review. Fills in as projects run.'));
    } catch (e) { sb.textContent = e.message; }
  }
  $('score-btn').addEventListener('click', openScore);
  $('s-close').addEventListener('click', () => dlg.close());
  // model switch and MCP link status
  const seg = $('model-seg'), mline = $('model-line'), chips = $('mcp-chips');
  const MODEL_TEXT = { auto: 'Opus 5.5 for research, review and apply. Sonnet 5.5 for planning and drafts. Drops to Sonnet if Opus runs out of usage.',
    sonnet: 'Everything on Sonnet 5.5. Uses the least.', opus: 'Everything on Opus 5.5. Uses the most.' };
  function showModel(m) {
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.m === m.mode));
    mline.textContent = MODEL_TEXT[m.mode] + (m.last ? ` Last call: ${m.last.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2')}.` : '');
  }
  seg.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    try { showModel(await api('/api/model', { mode: b.dataset.m })); } catch (err) { msg.textContent = err.message; }
  });
  const DOT = { connected: 'ok', auth: 'warn', disconnected: 'bad', failed: 'bad' };
  async function loadSide() {
    try { showModel(await api('/api/model')); } catch (e) { /* offline: leave as is */ }
    try {
      const d = await api('/api/mcp/status');
      if (window.Office) window.Office.mcp = d;
      chips.textContent = '';
      for (const i of d.items.filter(i => i.ours)) { const c = el('span', `chip ${DOT[i.state] || 'bad'}`, i.label); c.title = `${i.state}: ${i.detail}`; chips.append(c); }
      const o = d.items.filter(i => !i.ours);
      if (o.length) { const c = el('span', 'chip dim', `+${o.filter(i => i.state === 'connected').length}/${o.length} others`); c.title = o.map(i => `${i.label}: ${i.state}`).join('\n'); chips.append(c); }
    } catch (e) { /* offline */ }
  }
  loadSide(); setInterval(loadSide, 15000);
  poll(); setInterval(poll, 3000);
})();
