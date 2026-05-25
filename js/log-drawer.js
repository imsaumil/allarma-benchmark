// log-drawer.js — per-row log drawer (Phase C6).
// Fills #log-drawer with an EPRI header + grouped key/value rows + an
// "Open in InspectAI viewer ↗" deep link; slides in over #log-scrim.
//
// openLogDrawer({ title, machine, groups, logUrl })
//   title   — string (e.g. "rrf_llm_rerank_k5_all — gpt-oss-20b")
//   machine — human label (e.g. "SKORGE" | "DGX Spark")
//   groups  — [{ group: 'Quality', rows: [{label, value}, ...] }, ...]
//   logUrl  — InspectAI viewer deep link (from buildLogUrl)
// closeLogDrawer() — hides the drawer + scrim.

(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function kvRow(label, value) {
    return `<div class="kv"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  }

  function openLogDrawer(payload) {
    const drawer = el('log-drawer');
    const scrim = el('log-scrim');
    if (!drawer || !scrim) return;

    const title = payload.title || 'Eval log';
    const machine = payload.machine || '';
    const groups = payload.groups || [];
    const logUrl = payload.logUrl || '#';

    const bodyHTML = groups.map((g) => {
      const rows = (g.rows || []).map((r) => kvRow(r.label, r.value)).join('');
      return `<div class="sub">${esc(g.group)}</div>${rows}`;
    }).join('');

    drawer.innerHTML =
      `<div class="dh"><h4>${esc(title)}</h4><span class="x" role="button" aria-label="Close">&times;</span></div>` +
      `<div class="db">` +
        (machine ? `<div style="font-size:.8rem;color:#495057;margin-bottom:.6rem">Machine: <b style="color:#1C1C1C">${esc(machine)}</b></div>` : '') +
        bodyHTML +
        `<p style="font-size:.78rem;color:#979797;margin-top:1rem">Every metric is computed from this run's per-sample data.</p>` +
        `<a class="go" href="${esc(logUrl)}" target="_blank" rel="noopener">Open in InspectAI viewer ↗</a>` +
      `</div>`;

    // Wire close affordances.
    const x = drawer.querySelector('.dh .x');
    if (x) x.addEventListener('click', closeLogDrawer);
    scrim.addEventListener('click', closeLogDrawer);

    drawer.classList.add('open');
    scrim.classList.add('on');
  }

  function closeLogDrawer() {
    const drawer = el('log-drawer');
    const scrim = el('log-scrim');
    if (drawer) drawer.classList.remove('open');
    if (scrim) scrim.classList.remove('on');
  }

  // Close on Escape.
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLogDrawer(); });
  }

  if (typeof window !== 'undefined') {
    window.openLogDrawer = openLogDrawer;
    window.closeLogDrawer = closeLogDrawer;
  }
})();
