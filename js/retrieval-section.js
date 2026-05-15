// retrieval-section.js — §1 Retrieval Benchmarking.
// Controls bar (§1.1), View area (§1.2 with 6 views), Anomalies sub-section (§1.3).

const RET_DEFAULTS = {
  subbench: 'llm-augmented',
  machine: 'both',
  models: 'all',
  strategies: 'all',
  view: 'bar-chart',
  metric: 'accuracy',
};

let retState = { ...RET_DEFAULTS };

function initRetrievalSection() {
  if (!DASHBOARD_DATA.loaded) return;
  // Restore from URL
  const fromUrl = URL_STATE.read('ret');
  retState = { ...RET_DEFAULTS, ...fromUrl };

  const container = document.getElementById('retrieval-section-container');
  if (!container) return;

  container.innerHTML = `
    <div class="controls-bar" id="ret-controls">
      <div class="control-group">
        <label>Sub-benchmark:</label>
        <select id="ret-subbench"><option value="llm-augmented">LLM-augmented</option><option value="allarma-baseline">Allarma-baseline</option></select>
      </div>
      <div class="control-group">
        <label>Machine:</label>
        <select id="ret-machine"><option value="skorge">SKORGE</option><option value="dgx_spark">DGX_Spark</option><option value="both">Both side-by-side</option></select>
      </div>
      <div class="control-group">
        <label>Models:</label>
        <select id="ret-models" multiple></select>
      </div>
      <div class="control-group">
        <label>View:</label>
        <select id="ret-view">
          <option value="bar-chart">Bar chart</option>
          <option value="table">Table</option>
          <option value="pareto">Pareto</option>
          <option value="tier">Tier</option>
          <option value="cross-machine-delta">Cross-machine Δ</option>
          <option value="truncation">Truncation</option>
        </select>
      </div>
      <div class="control-group" id="ret-metric-group" style="display:none;">
        <label>Metric:</label>
        <select id="ret-metric">
          <option value="accuracy">Accuracy</option>
          <option value="accuracy_in_scope">In-Scope Acc</option>
          <option value="accuracy_oos">OOS Acc</option>
          <option value="avg_llm_call_count">Avg LLM Calls</option>
          <option value="avg_llm_token_usage">Avg Tokens</option>
          <option value="total_runtime">Total Runtime</option>
          <option value="avg_time_per_sample">Avg Time/Sample</option>
          <option value="truncation_rate">Truncation Rate</option>
        </select>
      </div>
      <div class="control-group">
        <button id="ret-reset" class="btn btn-small">Reset filters</button>
        <button id="ret-export" class="btn btn-small">Export CSV</button>
      </div>
    </div>
    <div id="ret-view-area"></div>
    <div id="ret-anomalies"></div>
  `;
  populateModelSelect();
  bindRetControls();
  applyRetState();
  renderRetView();
  renderRetAnomalies();
}

function populateModelSelect() {
  const sel = document.getElementById('ret-models');
  const models = Object.keys(MODEL_DISPLAY).sort();
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = MODEL_DISPLAY[m] || m;
    sel.appendChild(opt);
  });
}

function applyRetState() {
  document.getElementById('ret-subbench').value = retState.subbench;
  document.getElementById('ret-machine').value = retState.machine;
  document.getElementById('ret-view').value = retState.view;
  document.getElementById('ret-metric').value = retState.metric;
  // Models multi-select: 'all' = none selected; others = comma-list
  const sel = document.getElementById('ret-models');
  const wanted = retState.models === 'all' ? [] : retState.models.split(',');
  [...sel.options].forEach(o => o.selected = wanted.includes(o.value));
  // Show/hide metric dropdown based on view
  document.getElementById('ret-metric-group').style.display =
    (retState.view === 'bar-chart' ? 'flex' : 'none');
  // Models filter greyed out for Allarma sub-bench
  sel.disabled = (retState.subbench === 'allarma-baseline');
  sel.title = sel.disabled ? 'Allarma baseline strategies do not use an LLM; no model dimension.' : '';
}

function bindRetControls() {
  const onChange = () => {
    retState.subbench = document.getElementById('ret-subbench').value;
    retState.machine = document.getElementById('ret-machine').value;
    retState.view = document.getElementById('ret-view').value;
    retState.metric = document.getElementById('ret-metric').value;
    const selected = [...document.getElementById('ret-models').selectedOptions].map(o => o.value);
    retState.models = selected.length === 0 ? 'all' : selected.join(',');
    URL_STATE.write('ret', retState);
    applyRetState();
    renderRetView();
  };
  ['ret-subbench','ret-machine','ret-view','ret-metric','ret-models'].forEach(id =>
    document.getElementById(id).addEventListener('change', onChange));
  document.getElementById('ret-reset').addEventListener('click', () => {
    retState = { ...RET_DEFAULTS };
    URL_STATE.write('ret', retState);
    applyRetState();
    renderRetView();
  });
  document.getElementById('ret-export').addEventListener('click', exportRetCSV);
}

function getFilteredRetRows() {
  const isLlm = retState.subbench === 'llm-augmented';
  let rows = isLlm ? DASHBOARD_DATA.retrievalLlm : DASHBOARD_DATA.retrievalAllarma;
  if (retState.machine !== 'both') rows = rows.filter(r => r.machine === retState.machine);
  if (isLlm && retState.models !== 'all') {
    const wanted = new Set(retState.models.split(','));
    rows = rows.filter(r => wanted.has(r.model_folder));
  }
  return rows;
}

function renderRetView() {
  const area = document.getElementById('ret-view-area');
  area.innerHTML = '';
  switch (retState.view) {
    case 'bar-chart': renderRetBarChart(area); break;
    case 'table': renderRetTable(area); break;
    case 'pareto': renderRetPareto(area); break;
    case 'tier': renderRetTier(area); break;
    case 'cross-machine-delta': renderRetCrossMachineDelta(area); break;
    case 'truncation': renderRetTruncation(area); break;
    default: area.innerHTML = '<p>Unknown view.</p>';
  }
}

function renderRetBarChart(area) {
  area.innerHTML = '<div id="ret-bar"></div>';
  const data = getFilteredRetRows();
  const metric = retState.metric;
  const isLlm = retState.subbench === 'llm-augmented';

  const strategies = [...new Set(data.map(d => d.strategy))].sort();

  const groupKey = isLlm ? 'model' : 'machine';
  const groups = [...new Set(data.map(d => d[groupKey]))];
  const traces = groups.map(g => {
    const subset = data.filter(d => d[groupKey] === g);
    return {
      name: isLlm ? (MODEL_DISPLAY[g] || g) : MACHINE_DISPLAY[g],
      type: 'bar',
      x: strategies,
      y: strategies.map(s => {
        const r = subset.find(d => d.strategy === s);
        return r ? (metric in r ? r[metric] : (r.metrics ? r.metrics[metric] : null)) : null;
      }),
      marker: { color: isLlm ? (MODEL_COLORS[g] || '#999') : MACHINE_COLORS[g] },
    };
  });
  Plotly.react('ret-bar', traces, {
    barmode: 'group',
    xaxis: { title: 'Strategy', tickangle: -45, automargin: true },
    yaxis: { title: metric },
    legend: { orientation: 'h', y: 1.12 },
    margin: { b: 150, t: 40 }, height: 500,
  }, { responsive: true });
}

let _retDataTable = null;

function renderRetTable(area) {
  if (_retDataTable) { _retDataTable.destroy(); _retDataTable = null; }
  area.innerHTML = '<table id="ret-table" class="display" style="width:100%;"></table>';
  const data = getFilteredRetRows();
  const isLlm = retState.subbench === 'llm-augmented';
  const cols = isLlm
    ? [
        { title: 'Strategy', data: 'strategy' },
        { title: 'Model', data: r => MODEL_DISPLAY[r.model] || r.model },
        { title: 'Machine', data: r => MACHINE_DISPLAY[r.machine] },
        { title: 'Acc ± SE', data: r => `${(r.metrics.accuracy*100).toFixed(2)} ± ${(r.metrics.accuracy_se*100).toFixed(2)}%` },
        { title: 'In-Scope', data: r => (r.metrics.accuracy_in_scope*100).toFixed(2)+'%' },
        { title: 'OOS', data: r => (r.metrics.accuracy_oos*100).toFixed(2)+'%' },
        { title: 'Avg Calls', data: r => r.metrics.avg_llm_call_count },
        { title: 'Avg Tokens', data: r => r.metrics.avg_llm_token_usage.toFixed(1) },
        { title: 'Runtime', data: r => formatRuntime(r.total_runtime) },
        { title: 'Avg Time/Sample (s)', data: r => r.avg_time_per_sample.toFixed(4) },
        { title: 'Trunc', data: r => `${r.truncation_count} (${(r.truncation_rate*100).toFixed(2)}%)` },
        { title: 'max_tokens', data: r => r.max_tokens === null ? 'unbounded' : r.max_tokens },
      ]
    : [
        { title: 'Strategy', data: 'strategy' },
        { title: 'Machine', data: r => MACHINE_DISPLAY[r.machine] },
        { title: 'Acc ± SE', data: r => `${(r.metrics.accuracy*100).toFixed(2)} ± ${(r.metrics.accuracy_se*100).toFixed(2)}%` },
        { title: 'In-Scope', data: r => (r.metrics.accuracy_in_scope*100).toFixed(2)+'%' },
        { title: 'OOS', data: r => (r.metrics.accuracy_oos*100).toFixed(2)+'%' },
        { title: 'Runtime', data: r => formatRuntime(r.total_runtime) },
        { title: 'Avg Time/Sample (s)', data: r => r.avg_time_per_sample.toFixed(4) },
      ];
  _retDataTable = new DataTable('#ret-table', { data, columns: cols, pageLength: 25, order: [[0,'asc']] });
}

function exportRetCSV() {
  // Use the column accessors we defined for table view, but reduced
  const data = getFilteredRetRows();
  const isLlm = retState.subbench === 'llm-augmented';
  const cols = isLlm
    ? [
        {label:'strategy', accessor:'strategy'},
        {label:'model', accessor: r => MODEL_DISPLAY[r.model] || r.model},
        {label:'machine', accessor:'machine'},
        {label:'accuracy', accessor: r => r.metrics.accuracy.toFixed(6)},
        {label:'accuracy_se', accessor: r => r.metrics.accuracy_se.toFixed(6)},
        {label:'truncation_count', accessor:'truncation_count'},
        {label:'max_tokens', accessor: r => r.max_tokens ?? 'unbounded'},
      ]
    : [
        {label:'strategy', accessor:'strategy'},
        {label:'machine', accessor:'machine'},
        {label:'accuracy', accessor: r => r.metrics.accuracy.toFixed(6)},
      ];
  exportJSONToCSV(data, cols, `retrieval-${retState.subbench}.csv`);
}
