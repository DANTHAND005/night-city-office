// Night City Office: the RESEARCH panel. The lead's research, your links/notes, and reference images turned into design specs.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const list = $('res-list'), imgs = $('res-imgs'), msg = $('res-msg'), topic = $('res-topic'), text = $('res-text'), file = $('res-file'), run = $('res-run');
  if (!list) return;
  async function api(path, body) {
    const opts = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${r.status}`);
    return data;
  }
  const KIND = { lead: 'PROJECT', topic: 'RESEARCH', note: 'NOTE', link: 'LINK' };
  async function poll() {
    try {
      const d = await api('/api/research');
      run.disabled = !!d.running;
      if (d.running) msg.textContent = `Researching: ${d.running}`;
      else if (d.error) msg.textContent = `Last research failed: ${d.error}`;
      else if (/^Researching/.test(msg.textContent)) msg.textContent = 'Research finished.';
      imgs.textContent = '';
      for (const i of d.images.slice(0, 4)) {
        const row = el('details', 'lead-qa');
        row.append(el('summary', null, `${i.status === 'done' ? 'SPEC' : i.status.toUpperCase()}: ${i.name}`), el('p', 'hint', i.spec || 'The vision model is working on it.'));
        imgs.append(row);
      }
      list.textContent = '';
      for (const it of d.items.slice(0, 10)) {
        const row = el('details', 'lead-qa');
        row.append(el('summary', null, `${KIND[it.kind] || it.kind.toUpperCase()}: ${it.title}`));
        const body = el('p', 'hint', it.text.slice(0, 1800));
        body.style.whiteSpace = 'pre-wrap';
        row.append(body);
        list.append(row);
      }
    } catch (e) { /* quiet: the board shows connection problems */ }
  }
  run.addEventListener('click', async () => {
    if (topic.value.trim().length < 3) return;
    try { await api('/api/research/run', { topic: topic.value }); topic.value = ''; msg.textContent = 'Research started. This uses Claude usage.'; poll(); } catch (e) { msg.textContent = e.message; }
  });
  async function add() {
    const t = text.value.trim();
    if (t.length < 2) return;
    try { await api('/api/research/add', { kind: /^https?:\/\//i.test(t) ? 'link' : 'note', text: t }); text.value = ''; msg.textContent = 'Saved. It goes into the next plan.'; poll(); } catch (e) { msg.textContent = e.message; }
  }
  $('res-add').addEventListener('click', add);
  text.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  file.addEventListener('change', () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    if (f.size > 6e6) { msg.textContent = 'Image is over 6 MB.'; return; }
    const fr = new FileReader();
    fr.onload = async () => {
      try { await api('/api/research/image', { name: f.name, data: fr.result }); msg.textContent = 'Image queued. The vision model will describe it.'; poll(); } catch (e) { msg.textContent = e.message; }
    };
    fr.readAsDataURL(f);
  });
  poll(); setInterval(poll, 6000);
})();
