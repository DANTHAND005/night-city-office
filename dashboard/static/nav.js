// Night City Office: top tabs (drawers for FREE TIME and RESEARCH) and the "answer these questions" button.
(() => {
  'use strict';
  const drawers = { free: document.getElementById('drawer-free'), research: document.getElementById('drawer-research'), changes: document.getElementById('drawer-changes') };
  const tabs = [...document.querySelectorAll('.tab[data-drawer]')];
  const qbtn = document.getElementById('q-btn'), lead = document.getElementById('lead');
  function show(name) {
    for (const [k, d] of Object.entries(drawers)) if (d) d.hidden = k !== name;
    for (const t of tabs) t.setAttribute('aria-pressed', String(t.dataset.drawer === name));
  }
  for (const t of tabs) t.addEventListener('click', () => show(drawers[t.dataset.drawer] && !drawers[t.dataset.drawer].hidden ? null : t.dataset.drawer));
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => show(null));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') show(null); });
  window.addEventListener('lead:needs', e => {
    const { questions, apply } = e.detail;
    qbtn.hidden = !(questions || apply);
    qbtn.textContent = questions ? `ANSWER THESE QUESTIONS (${questions})` : 'REVIEW AND APPLY';
  });
  qbtn.addEventListener('click', () => {
    show(null);
    const q = lead.querySelector('.lead-q.open') || document.getElementById('lead-run');
    if (!q) return;
    q.scrollIntoView({ behavior: 'smooth', block: 'center' });
    q.classList.remove('flash'); void q.offsetWidth; q.classList.add('flash');
    const inp = q.querySelector('input'); if (inp) inp.focus({ preventScroll: true });
  });
})();
