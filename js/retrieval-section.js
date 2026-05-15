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

function renderRetPareto(area) {
  if (retState.subbench === 'allarma-baseline') {
    area.innerHTML = '<p class="placeholder">Not applicable for Allarma baseline (no LLM tokens; cost axis is 0).</p>';
    return;
  }
  area.innerHTML = '<div id="ret-pareto"></div>';
  const data = getFilteredRetRows();
  const groups = [...new Set(data.map(r => `${r.model}|${r.machine}`))];
  const traces = groups.map(g => {
    const [model, machine] = g.split('|');
    const subset = data.filter(r => r.model === model && r.machine === machine);
    return {
      name: `${MODEL_DISPLAY[model] || model} (${MACHINE_DISPLAY[machine]})`,
      type: 'scatter', mode: 'markers',
      x: subset.map(r => r.metrics.avg_llm_token_usage),
      y: subset.map(r => r.metrics.accuracy),
      text: subset.map(r => r.strategy),
      marker: { color: MODEL_COLORS[model] || '#999', size: 10,
                symbol: machine === 'skorge' ? 'circle' : 'diamond' },
      hovertemplate: '<b>%{text}</b><br>'+`${MODEL_DISPLAY[model] || model} · ${MACHINE_DISPLAY[machine]}`+'<br>Acc: %{y:.4f}<br>Tokens: %{x:.1f}<extra></extra>',
    };
  });
  Plotly.react('ret-pareto', traces,
    { xaxis: {title:'Avg Token Usage'}, yaxis:{title:'Accuracy'}, height: 450 },
    { responsive: true });
}

function renderRetTier(area) {
  if (retState.subbench === 'allarma-baseline') {
    area.innerHTML = '<p class="placeholder">Tier view is not available for Allarma baseline (samples lack tier metadata).</p>';
    return;
  }
  area.innerHTML = `
    <div class="control-group">
      <label>Strategy:</label>
      <select id="ret-tier-strat"></select>
    </div>
    <div id="ret-tier"></div>
  `;
  const tiers = DASHBOARD_DATA.retrievalLlmTiers;
  let pool = tiers;
  if (retState.machine !== 'both') pool = pool.filter(r => r.machine === retState.machine);
  if (retState.models !== 'all') {
    const wanted = new Set(retState.models.split(','));
    pool = pool.filter(r => wanted.has(r.model_folder));
  }
  const strats = [...new Set(pool.map(r => r.strategy))].sort();
  const sel = document.getElementById('ret-tier-strat');
  strats.forEach(s => { const o = document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
  const draw = () => {
    const strategy = sel.value;
    const subset = pool.filter(r => r.strategy === strategy);
    const tierNames = ['easy','medium','hard','expert'];
    const tierLabels = ['T1 Easy','T2 Medium','T3 Hard','T4 Expert'];
    const groups = [...new Set(subset.map(r => `${r.model}|${r.machine}`))];
    const traces = groups.map(g => {
      const [model, machine] = g.split('|');
      const r = subset.find(x => x.model === model && x.machine === machine);
      return {
        name: `${MODEL_DISPLAY[model] || model} (${MACHINE_DISPLAY[machine]})`,
        type: 'bar', x: tierLabels,
        y: tierNames.map(t => r.tiers[t]?.accuracy ?? 0),
        marker: { color: MODEL_COLORS[model] || '#999' },
      };
    });
    Plotly.react('ret-tier', traces,
      { barmode: 'group', yaxis:{title:'Accuracy', range:[0,1.05]}, height: 400 },
      { responsive: true });
  };
  sel.addEventListener('change', draw); draw();
}

function renderRetCrossMachineDelta(area) {
  area.innerHTML = `
    <h4>Per-model summary</h4>
    <table id="ret-delta-summary" class="display"></table>
    <h4>Per-strategy detail</h4>
    <table id="ret-delta-detail" class="display"></table>
  `;
  const deltas = DASHBOARD_DATA.crossMachineDeltas;
  // Per-model: aggregate over each model's strategies
  const byModel = {};
  for (const d of deltas) {
    const k = d.model_folder;
    (byModel[k] = byModel[k] || []).push(d);
  }
  const summary = Object.entries(byModel).map(([model_folder, ds]) => {
    const meanDelta = ds.reduce((a,d)=>a+d.delta_pp,0) / ds.length;
    const maxAbs = Math.max(...ds.map(d=>Math.abs(d.delta_pp)));
    return {
      model: MODEL_DISPLAY[ds[0].model] || ds[0].model,
      n_strategies: ds.length,
      mean_delta_pp: meanDelta.toFixed(3),
      max_abs_pp: maxAbs.toFixed(2),
    };
  });
  new DataTable('#ret-delta-summary', {
    data: summary,
    columns: [
      { title:'Model', data:'model' },
      { title:'# strategies', data:'n_strategies' },
      { title:'Mean Δ pp', data:'mean_delta_pp' },
      { title:'Max |Δ| pp', data:'max_abs_pp' },
    ],
    pageLength: 10,
  });
  new DataTable('#ret-delta-detail', {
    data: deltas,
    columns: [
      { title:'Model', data: r => MODEL_DISPLAY[r.model] || r.model },
      { title:'Strategy', data:'strategy' },
      { title:'SK acc', data: r => (r.sk_acc*100).toFixed(2)+'%' },
      { title:'DGX acc', data: r => (r.dgx_acc*100).toFixed(2)+'%' },
      { title:'Δ pp', data: r => `<span class="${Math.abs(r.delta_pp)>3 ? 'delta-bad' : ''}">${r.delta_pp.toFixed(2)}</span>` },
      { title:'SK trunc', data:'sk_truncation_count' },
      { title:'DGX trunc', data:'dgx_truncation_count' },
    ],
    pageLength: 25, order: [[4,'desc']],
  });
}

function renderRetTruncation(area) {
  if (retState.subbench === 'allarma-baseline') {
    area.innerHTML = '<p class="placeholder">Allarma baseline has zero LLM calls, hence zero truncations.</p>';
    return;
  }
  area.innerHTML = '<div id="ret-trunc"></div>';
  const data = getFilteredRetRows();
  const groups = [...new Set(data.map(r => `${r.model}|${r.machine}`))];
  const strats = [...new Set(data.map(d => d.strategy))].sort();
  const traces = groups.map(g => {
    const [model, machine] = g.split('|');
    const subset = data.filter(r => r.model === model && r.machine === machine);
    return {
      name: `${MODEL_DISPLAY[model] || model} (${MACHINE_DISPLAY[machine]})`,
      type: 'bar', x: strats,
      y: strats.map(s => {
        const r = subset.find(x => x.strategy === s);
        return r ? r.truncation_rate * 100 : 0;
      }),
      marker: { color: MODEL_COLORS[model] || '#999' },
    };
  });
  Plotly.react('ret-trunc', traces,
    { barmode:'group', xaxis:{title:'Strategy', tickangle:-45, automargin:true},
      yaxis:{title:'Truncation %'}, height: 500, margin: { b: 150 } },
    { responsive: true });
}
