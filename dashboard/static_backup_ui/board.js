// Task board: assign form, four status columns, task detail dialog. Polls the API every 2 seconds.
(() => {
  'use strict';
  const ROLES = ['coder', 'planner', 'vision', 'memory', 'trimmer'];
  const STATUSES = ['queued', 'running', 'done', 'failed'];
  const EMPTY = { queued: 'Nothing waiting.', running: 'Nobody is working.', done: 'No finished tasks yet.', failed: 'No failures.' };
  const MAX_STEPS = 3;
  const Office = window.Office;
  const crew = Office.crew;

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmtDur = s => s == null ? '—' : s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleString() : '—';
  const label = role => `${crew[role]?.name ?? role} — ${role}`;
  const nowS = () => Date.now() / 1000;

  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    let data = null;
    try { data = await r.json(); } catch (_) { /* no JSON body */ }
    if (!r.ok) throw new Error(errText(data) || `HTTP ${r.status}`);
    return data;
  }
  function errText(data) {
    const d = data && data.detail;
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map(x => `${(x.loc || []).filter(p => p !== 'body').join('.')}: ${x.msg}`).join('; ');
    return JSON.stringify(d);
  }
  function roleSelect(value) {
    const s = el('select');
    for (const r of ROLES) { const o = el('option', null, label(r)); o.value = r; s.append(o); }
    if (value) s.value = value;
    return s;
  }

  // ---- assign form
  const form = $('task-form'), fRole = $('f-role'), fTitle = $('f-title'), fInput = $('f-input');
  const fImage = $('f-image'), fImageWrap = $('f-image-wrap'), fTimeout = $('f-timeout');
  const fSteps = $('f-steps'), addStepBtn = $('add-step'), submitBtn = $('f-submit'), msg = $('form-msg');
  for (const r of ROLES) { const o = el('option', null, label(r)); o.value = r; fRole.append(o); }

  function showMsg(kind, text) { msg.className = `msg ${kind}`; msg.textContent = text; }
  function syncRole() { fImageWrap.hidden = fRole.value !== 'vision'; Office.highlight(fRole.value); }
  fRole.addEventListener('change', syncRole);
  Office.onSelectRole = role => {
    fRole.value = role;
    syncRole();
  };

  function renumber() {
    [...fSteps.children].forEach((li, i) => { li.querySelector('.n').textContent = `${i + 1}.`; });
    addStepBtn.disabled = fSteps.children.length >= MAX_STEPS;
  }
  function addStep() {
    if (fSteps.children.length >= MAX_STEPS) return;
    const prev = fSteps.lastElementChild?.querySelector('select').value ?? fRole.value;
    const next = { trimmer: 'planner', planner: 'coder', vision: 'planner', memory: 'trimmer' }[prev] || 'planner';
    const li = el('li', 'step');
    const sel = roleSelect(next); sel.setAttribute('aria-label', 'Follow-up role');
    const ins = el('input'); ins.maxLength = 4000; ins.autocomplete = 'off';
    ins.placeholder = 'instruction (optional), e.g. Implement this plan:';
    ins.setAttribute('aria-label', 'Instruction for this step');
    const rm = el('button', 'small-btn', '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove this step');
    rm.addEventListener('click', () => { li.remove(); renumber(); });
    li.append(el('span', 'n'), sel, ins, rm);
    fSteps.append(li);
    renumber();
    sel.focus();
  }
  addStepBtn.addEventListener('click', addStep);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!fInput.value.trim()) { showMsg('err', 'Input is empty: tell the role what to do.'); fInput.focus(); return; }
    const timeout = Number(fTimeout.value);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
      showMsg('err', 'Timeout must be a whole number from 1 to 3600 seconds.'); fTimeout.focus(); return;
    }
    const body = {
      role: fRole.value, title: fTitle.value.trim(), input: fInput.value, timeout_s: timeout,
      next_steps: [...fSteps.children].map(li => ({ role: li.querySelector('select').value, instruction: li.querySelector('input').value })),
    };
    if (fRole.value === 'vision' && fImage.value.trim()) body.image_path = fImage.value.trim();
    submitBtn.disabled = true;
    try {
      const { id } = await api('/api/tasks', body);
      const chain = body.next_steps.length ? `, then ${body.next_steps.map(s => s.role).join(' → ')}` : '';
      showMsg('ok', `Queued #${id} for ${label(body.role)}${chain}.`);
      fTitle.value = ''; fInput.value = ''; fImage.value = '';
      fSteps.replaceChildren(); renumber();
      flashId = id;
      refresh();
      fInput.focus();
    } catch (err) {
      showMsg('err', err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  // ---- board
  let flashId = null;
  const cols = Object.fromEntries(STATUSES.map(s => [s, document.querySelector(`.col[data-status="${s}"]`)]));

  function timeText(t, now) {
    if (t.status === 'queued') return `waiting ${fmtDur(Math.max(0, now - t.created))}`;
    if (t.status === 'running') return `${fmtDur(Math.max(0, now - t.started))} / ${t.timeout_s}s`;
    return fmtDur(t.duration);
  }
  function taskCard(t, now) {
    const b = el('button', `task s-${t.status}`);
    b.type = 'button';
    b.dataset.id = t.id;
    const who = crew[t.role];
    const top = el('div', 't-top');
    const name = el('span', 't-who', (who?.name ?? t.role).toUpperCase());
    if (who) name.style.color = who.color;
    top.append(el('span', 't-id', `#${t.id}`), name, el('span', 't-role', t.role), el('span', 't-time', timeText(t, now)));
    b.append(top, el('div', 't-title', t.title));
    const chain = [t.parent_task_id ? `↳ from #${t.parent_task_id}` : '', t.next_roles.length ? `then ${t.next_roles.join(' → ')}` : '']
      .filter(Boolean).join(' · ');
    if (chain) b.append(el('div', 't-chain', chain));
    if (t.status === 'failed' && t.error_preview) b.append(el('div', 't-err', t.error_preview));
    b.addEventListener('click', () => openDetail(t.id));
    return b;
  }
  function renderBoard(columns) {
    const now = nowS();
    const focusedId = document.activeElement?.classList.contains('task') ? document.activeElement.dataset.id : null;
    for (const s of STATUSES) {
      const { total, tasks } = columns[s];
      const col = cols[s];
      col.querySelector('.count').textContent = tasks.length < total ? `${tasks.length}/${total}` : `${total}`;
      const box = col.querySelector('.cards');
      box.replaceChildren(...(tasks.length ? tasks.map(t => taskCard(t, now)) : [el('div', 'empty', EMPTY[s])]));
    }
    if (focusedId) document.querySelector(`.task[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
    if (flashId != null) {
      const card = document.querySelector(`.task[data-id="${flashId}"]`);
      if (card) { card.classList.add('flash'); flashId = null; }
    }
  }

  // ---- task detail dialog
  const dlg = $('detail'), dTitle = $('d-title'), dBody = $('d-body'), dActions = $('d-actions');
  let openId = null, lastSig = null, dElapsed = null, dMsg = null;
  $('d-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { openId = null; lastSig = null; });

  async function openDetail(id) {
    openId = id; lastSig = null;
    await loadDetail();
    if (!dlg.open) dlg.showModal();
  }
  async function loadDetail() {
    if (openId == null) return;
    const id = openId;
    let t;
    try { t = await api(`/api/tasks/${id}`); }
    catch (e) {
      if (id !== openId) return;
      dTitle.textContent = `#${id}`; dBody.replaceChildren(el('p', 'msg err', e.message)); dActions.replaceChildren(); lastSig = null;
      return;
    }
    if (id !== openId) return;
    const sig = `${t.id}|${t.status}|${t.finished}|${t.children.length}`;
    if (sig !== lastSig) { lastSig = sig; renderDetail(t); }
    if (dElapsed && t.status === 'running') dElapsed.textContent = `${fmtDur(nowS() - t.started)} (running)`;
  }
  function linkTo(id, text) {
    const b = el('button', 'linkbtn', text); b.type = 'button';
    b.addEventListener('click', () => openDetail(id));
    return b;
  }
  function section(title, content, extra) {
    const h = el('h3', null, title);
    if (extra) h.append(extra);
    return [h, content];
  }
  function renderDetail(t) {
    const who = crew[t.role];
    dTitle.textContent = `#${t.id} ${t.title}`;
    const dl = el('dl', 'meta-grid');
    const add = (k, v) => { const g = el('div'); const dd = el('dd'); dd.append(v); g.append(el('dt', null, k), dd); dl.append(g); return dd; };
    const roleSpan = el('span', null, label(t.role)); if (who) roleSpan.style.color = who.color;
    add('Role', roleSpan);
    add('Status', el('span', `st ${({ queued: 'idle', running: 'busy', done: 'busy', failed: 'fail' })[t.status]}`, t.status.toUpperCase()));
    add('From', t.created_by);
    add('Created', fmtTime(t.created));
    add('Started', fmtTime(t.started));
    add('Finished', fmtTime(t.finished));
    const durDd = add('Duration', t.status === 'running' ? '' : fmtDur(t.duration));
    dElapsed = t.status === 'running' ? durDd : null;
    add('Timeout', `${t.timeout_s}s`);
    if (t.parent_task_id) add('Handed over from', linkTo(t.parent_task_id, `#${t.parent_task_id}`));
    if (t.children.length) {
      const span = el('span');
      t.children.forEach((c, i) => { if (i) span.append(', '); span.append(linkTo(c.id, `#${c.id} ${c.role} (${c.status})`)); });
      add('Follow-ups', span);
    }
    if (t.next_steps.length) add('Chain still to run', t.next_steps.map(s => s.role).join(' → '));

    const parts = [dl, ...section('INPUT', el('pre', null, t.input))];
    if (t.image_path) parts.push(...section('IMAGE', el('pre', null, t.image_path)));
    if (t.result != null) {
      const copy = el('button', 'small-btn', 'copy'); copy.type = 'button';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(t.result); copy.textContent = 'copied'; }
        catch (_) { copy.textContent = 'copy failed'; }
      });
      parts.push(...section('RESULT', el('pre', null, t.result), copy));
    }
    if (t.error) parts.push(...section('ERROR', el('pre', 'err', t.error)));
    if (t.status === 'queued' || t.status === 'running')
      parts.push(el('p', 'hint', 'Waiting for the result. This view updates by itself.'));
    dBody.replaceChildren(...parts);

    // keep anything typed into the hand-off controls across re-renders
    const keepRole = dActions.querySelector('[data-k="role"]')?.value;
    const keepIns = dActions.querySelector('[data-k="ins"]')?.value;
    dMsg = el('p', 'msg');
    const actions = [];
    if (t.status === 'done') {
      const sel = roleSelect(keepRole || ({ trimmer: 'planner', planner: 'coder', vision: 'planner' })[t.role] || 'planner');
      sel.dataset.k = 'role'; sel.setAttribute('aria-label', 'Hand off to role');
      const ins = el('input'); ins.dataset.k = 'ins'; ins.maxLength = 4000; ins.autocomplete = 'off';
      ins.placeholder = 'instruction (optional), e.g. Implement this plan:'; ins.setAttribute('aria-label', 'Hand-off instruction');
      if (keepIns) ins.value = keepIns;
      const go = el('button', 'small-btn', 'HAND OFF'); go.type = 'button';
      go.addEventListener('click', () => act(go, async () => {
        const { id } = await api(`/api/tasks/${t.id}/handoff`, { role: sel.value, instruction: ins.value });
        ins.value = '';
        doneMsg(id, `Handed off as #${id} to ${label(sel.value)}.`);
      }));
      actions.push(el('span', 'hint', 'Hand off to'), sel, ins, go);
    }
    if (t.status === 'failed') {
      const retry = el('button', 'small-btn', 'RETRY'); retry.type = 'button';
      retry.addEventListener('click', () => act(retry, async () => {
        const { id } = await api(`/api/tasks/${t.id}/retry`, {});
        doneMsg(id, `Queued again as #${id}.`);
      }));
      actions.push(retry);
    }
    if (t.status === 'queued') {
      const cancel = el('button', 'small-btn danger', 'CANCEL TASK'); cancel.type = 'button';
      cancel.addEventListener('click', () => act(cancel, async () => {
        await api(`/api/tasks/${t.id}/cancel`, {});
        lastSig = null; await loadDetail(); refresh();
      }));
      actions.push(cancel);
    }
    dActions.replaceChildren(...actions, dMsg);
  }
  function doneMsg(id, text) {
    dMsg.className = 'msg ok'; dMsg.replaceChildren(text + ' ', linkTo(id, 'open it'));
    flashId = id; refresh();
  }
  async function act(btn, fn) {
    btn.disabled = true;
    try { await fn(); }
    catch (e) { dMsg.className = 'msg err'; dMsg.textContent = e.message; }
    finally { btn.disabled = false; }
  }

  // ---- polling
  let polling = false;
  async function refresh() {
    if (polling) return;
    polling = true;
    try {
      const [roles, tasks] = await Promise.all([api('/api/roles'), api('/api/tasks')]);
      Office.applyRoles(roles);
      Office.applyTasks(tasks.columns);
      Office.setMode('live');
      renderBoard(tasks.columns);
      if (dlg.open) await loadDetail();
    } catch (_) {
      Office.setMode('down');
    } finally {
      polling = false;
    }
  }

  syncRole();
  renumber();
  refresh();
  setInterval(refresh, 2000);
})();
