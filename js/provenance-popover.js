// provenance-popover.js — Click-to-open popover for any cell with data-prov="...".
// data-prov is a JSON string with: source, audit, config, truncations.

let _provInstance = null;

document.body.addEventListener('click', (e) => {
  const cell = e.target.closest('[data-prov]');
  if (!cell) {
    closeProv();
    return;
  }
  let payload;
  try { payload = JSON.parse(cell.dataset.prov); } catch { return; }
  showProv(cell, payload);
});

function showProv(anchor, p) {
  closeProv();
  const tip = document.createElement('div');
  tip.className = 'prov-popover';
  tip.innerHTML = `
    <div class="prov-source"><strong>Source:</strong> ${p.source ?? '—'}</div>
    <div class="prov-audit"><strong>Audit:</strong> ${p.audit ?? '—'}</div>
    <div class="prov-config"><strong>Config:</strong> ${p.config ?? '—'}</div>
    <div class="prov-trunc"><strong>Trunc:</strong> ${p.truncations ?? '—'}</div>
    ${p.eval_url ? `<a class="prov-link" href="${p.eval_url}" target="_blank">Open in InspectAI viewer</a>` : ''}
  `;
  document.body.appendChild(tip);
  _provInstance = Popper.createPopper(anchor, tip, {
    placement: 'top',
    modifiers: [{ name: 'offset', options: { offset: [0, 8] } }],
  });
}

function closeProv() {
  document.querySelectorAll('.prov-popover').forEach(t => t.remove());
  if (_provInstance) { _provInstance.destroy(); _provInstance = null; }
}
