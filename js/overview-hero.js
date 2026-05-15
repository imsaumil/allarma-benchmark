// overview-hero.js — Render the Overview hero block (4 finding cards + 7-anomaly summary).

const FINDING_CARDS = [
  { icon: '✓', label: 'Cross-machine ±0.55 pp mean Δ',
    href: '#retrieval', view: 'cross-machine-delta',
    detail: 'Across 10 model-sweeps; 2.6 M sample-prompt hashes match 100%' },
  { icon: '⚠', label: '4 cells diverge >3 pp',
    href: '#anomaly-1', view: null,
    detail: 'Documented anomalies — see callouts in §1.3' },
  { icon: '⚠', label: 'qwen3.5-0.8b modifier 21.78% repetition loops',
    href: '#anomaly-modifier-qwen-loops', view: null,
    detail: '223/1024 samples on both machines; real model deficiency' },
  { icon: '⏱', label: 'DGX 3.92× slower than SKORGE',
    href: '#retrieval', view: 'bar-chart-runtime',
    detail: 'Range 1.64×–5.25× per model; 414h vs 105h aggregate' },
];

const ANOMALY_LIST = [
  { id: 'anomaly-1', section: 'retrieval', label: 'gpt-oss/direct-match +9.80 pp' },
  { id: 'anomaly-2', section: 'retrieval', label: 'qwen-0.8b/k15 +12.38 pp' },
  { id: 'anomaly-3', section: 'retrieval', label: 'qwen-2b/k15 +8.43 pp' },
  { id: 'anomaly-4', section: 'retrieval', label: 'nemo-12b/listwise +3.16 pp' },
  { id: 'anomaly-modifier-nemo-9b', section: 'modifier', label: 'nemo-9b modifier Syn/Sem +3.12/+2.64 pp' },
  { id: 'anomaly-modifier-nemo-12b', section: 'modifier', label: 'nemo-12b modifier Syn/Sem −2.64/−1.56 pp' },
  { id: 'anomaly-modifier-qwen-loops', section: 'modifier', label: 'qwen-0.8b modifier 21.78% repetition (both machines)' },
];

function initOverviewHero() {
  const container = document.getElementById('overview-hero-container');
  if (!container) return;
  const totalEvals = 548;  // production count from spec §1
  const html = `
    <div class="overview-summary">
      <div class="overview-meta">9 models · 2 machines · ${totalEvals} audited evaluations · 2.6 M sample-prompt comparisons</div>
      <div class="finding-cards">
        ${FINDING_CARDS.map(c => `
          <a class="finding-card" href="${c.href}" data-target-view="${c.view ?? ''}">
            <div class="finding-icon">${c.icon}</div>
            <div class="finding-label">${c.label}</div>
            <div class="finding-detail">${c.detail}</div>
          </a>
        `).join('')}
      </div>
      <div class="anomaly-summary">
        <div class="anomaly-summary-header">⚠ 7 known anomalies (4 retrieval + 3 modifier) — jump:</div>
        <div class="anomaly-summary-list">
          ${ANOMALY_LIST.map(a => `<a href="#${a.id}" class="anomaly-jump">${a.label}</a>`).join(' · ')}
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;

  // For finding cards that target a specific view, set the URL param before navigation
  container.querySelectorAll('.finding-card[data-target-view]').forEach(a => {
    const view = a.dataset.targetView;
    if (!view) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      const href = a.getAttribute('href');
      // Determine which section's prefix
      const prefix = href.startsWith('#retrieval') ? 'ret' : 'mod';
      // For 'bar-chart-runtime', encode as { view: 'bar-chart', metric: 'total_runtime' }
      if (view === 'bar-chart-runtime') {
        URL_STATE.write(prefix, { view: 'bar-chart', metric: 'total_runtime' });
      } else {
        URL_STATE.write(prefix, { view });
      }
      // Trigger re-render (the section initializers re-read URL state when called)
      if (prefix === 'ret' && typeof initRetrievalSection === 'function') initRetrievalSection();
      if (prefix === 'mod' && typeof initModifierSection === 'function') initModifierSection();
      // Then navigate
      location.hash = href;
    });
  });
}
