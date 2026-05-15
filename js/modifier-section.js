// modifier-section.js — §2 Modifier Benchmarking. Controls + 3 views + §2.3 Anomalies.

const MOD_DEFAULTS = { machine: 'both', models: 'all', view: 'hallucination' };
let modState = { ...MOD_DEFAULTS };

function initModifierSection() {
  if (!DASHBOARD_DATA.loaded) return;
  modState = { ...MOD_DEFAULTS, ...URL_STATE.read('mod') };
  const container = document.getElementById('modifier-section-container');
  if (!container) return;
  container.innerHTML = `
    <div class="controls-bar" id="mod-controls">
      <div class="control-group"><label>Machine:</label>
        <select id="mod-machine"><option value="skorge">SKORGE</option><option value="dgx_spark">DGX_Spark</option><option value="both">Both side-by-side</option></select></div>
      <div class="control-group"><label>Models:</label><select id="mod-models" multiple></select></div>
      <div class="control-group"><label>View:</label>
        <select id="mod-view">
          <option value="hallucination">Hallucination metrics</option>
          <option value="heatmap">Per-template heatmap</option>
          <option value="cross-machine-delta">Cross-machine Δ</option>
        </select></div>
      <div class="control-group"><button id="mod-reset" class="btn btn-small">Reset filters</button></div>
    </div>
    <div id="mod-view-area"></div>
    <div id="mod-anomalies"></div>
  `;
  // Populate models
  Object.keys(MODEL_DISPLAY).sort().forEach(m => {
    const o = document.createElement('option'); o.value = m;
    o.textContent = MODEL_DISPLAY[m] || m;
    document.getElementById('mod-models').appendChild(o);
  });
  applyModState();
  ['mod-machine','mod-view','mod-models'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => {
      modState.machine = document.getElementById('mod-machine').value;
      modState.view = document.getElementById('mod-view').value;
      const sel = [...document.getElementById('mod-models').selectedOptions].map(o => o.value);
      modState.models = sel.length === 0 ? 'all' : sel.join(',');
      URL_STATE.write('mod', modState);
      applyModState();
      renderModView();
    }));
  document.getElementById('mod-reset').addEventListener('click', () => {
    modState = { ...MOD_DEFAULTS };
    URL_STATE.write('mod', modState);
    applyModState();
    renderModView();
  });
  renderModView();
  renderModAnomalies();
}

function applyModState() {
  document.getElementById('mod-machine').value = modState.machine;
  document.getElementById('mod-view').value = modState.view;
  const wanted = modState.models === 'all' ? [] : modState.models.split(',');
  [...document.getElementById('mod-models').options].forEach(o => o.selected = wanted.includes(o.value));
}

function getFilteredModRows() {
  let rows = DASHBOARD_DATA.modifier;
  if (modState.machine !== 'both') rows = rows.filter(r => r.machine === modState.machine);
  if (modState.models !== 'all') {
    const wanted = new Set(modState.models.split(','));
    rows = rows.filter(r => wanted.has(r.model_folder));
  }
  return rows;
}

function renderModView() {
  const area = document.getElementById('mod-view-area');
  area.innerHTML = '';
  switch (modState.view) {
    case 'hallucination': renderModHallucination(area); break;
    case 'heatmap': renderModHeatmap(area); break;
    case 'cross-machine-delta': renderModCrossMachineDelta(area); break;
  }
}

function renderModHallucination(area) {
  area.innerHTML = '<div id="mod-bar"></div>';
  const data = getFilteredModRows();
  const metrics = ['Modification_Accuracy', 'Neo4j_Syntactic_Validity', 'Neo4j_Semantic_Validity'];
  const groups = [...new Set(data.map(r => `${r.model}|${r.machine}`))];
  const traces = groups.map(g => {
    const [model, machine] = g.split('|');
    const r = data.find(x => x.model === model && x.machine === machine);
    return {
      name: `${MODEL_DISPLAY[model] || model} (${MACHINE_DISPLAY[machine]})`,
      type: 'bar', x: metrics.map(m => m.replace(/_/g, ' ')),
      y: metrics.map(m => r.metrics[m].value),
      error_y: { type:'data', array: metrics.map(m => r.metrics[m].se) },
      marker: { color: MODEL_COLORS[model] || '#999' },
    };
  });
  Plotly.react('mod-bar', traces,
    { barmode:'group', yaxis:{title:'Score', range:[0,1.05]}, height: 400 },
    { responsive: true });
}

function renderModHeatmap(area) {
  area.innerHTML = '<div id="mod-heatmap"></div>';
  const data = DASHBOARD_DATA.modifierTemplates.filter(r => {
    if (modState.machine !== 'both' && r.machine !== modState.machine) return false;
    if (modState.models !== 'all') {
      const w = new Set(modState.models.split(','));
      if (!w.has(r.model_folder)) return false;
    }
    return true;
  });
  const templates = [...new Set(data.map(d => d.template_id))].sort();
  const rowKeys = [...new Set(data.map(d => `${d.model}|${d.machine}`))];
  const z = rowKeys.map(k => {
    const [model, machine] = k.split('|');
    return templates.map(t => {
      const r = data.find(x => x.model === model && x.machine === machine && x.template_id === t);
      return r ? r.Modification_Accuracy : null;
    });
  });
  Plotly.react('mod-heatmap', [{
    type: 'heatmap', z, x: templates,
    y: rowKeys.map(k => { const [m,mc] = k.split('|'); return `${MODEL_DISPLAY[m] || m} (${MACHINE_DISPLAY[mc]})`; }),
    colorscale: [[0,'#d32f2f'],[0.5,'#ffeb3b'],[1,'#4CAF50']], zmin:0, zmax:1,
  }],
  { xaxis:{title:'Template', tickangle:-45}, height: 400, margin:{b:80,l:200} },
  { responsive: true });
}

function renderModCrossMachineDelta(area) {
  area.innerHTML = '<table id="mod-delta" class="display"></table>';
  // Pair each model's modifier row across machines
  const rows = DASHBOARD_DATA.modifier;
  const byModel = {};
  for (const r of rows) (byModel[r.model_folder] = byModel[r.model_folder] || {})[r.machine] = r;
  const tableData = Object.entries(byModel).map(([mf, pair]) => {
    const sk = pair.skorge, dgx = pair.dgx_spark;
    if (!sk || !dgx) return null;
    return {
      model: MODEL_DISPLAY[sk.model] || sk.model,
      mod_sk: (sk.metrics.Modification_Accuracy.value*100).toFixed(2),
      mod_dgx: (dgx.metrics.Modification_Accuracy.value*100).toFixed(2),
      mod_delta: ((dgx.metrics.Modification_Accuracy.value - sk.metrics.Modification_Accuracy.value)*100).toFixed(2),
      syn_sk: (sk.metrics.Neo4j_Syntactic_Validity.value*100).toFixed(2),
      syn_dgx: (dgx.metrics.Neo4j_Syntactic_Validity.value*100).toFixed(2),
      syn_delta: ((dgx.metrics.Neo4j_Syntactic_Validity.value - sk.metrics.Neo4j_Syntactic_Validity.value)*100).toFixed(2),
      sem_sk: (sk.metrics.Neo4j_Semantic_Validity.value*100).toFixed(2),
      sem_dgx: (dgx.metrics.Neo4j_Semantic_Validity.value*100).toFixed(2),
      sem_delta: ((dgx.metrics.Neo4j_Semantic_Validity.value - sk.metrics.Neo4j_Semantic_Validity.value)*100).toFixed(2),
    };
  }).filter(Boolean);
  new DataTable('#mod-delta', {
    data: tableData,
    columns: [
      {title:'Model', data:'model'},
      {title:'Mod SK', data:'mod_sk'}, {title:'Mod DGX', data:'mod_dgx'},
      {title:'Mod Δ pp', data: r => `<span class="${Math.abs(parseFloat(r.mod_delta)) > 1.5 ? 'delta-warn' : ''}">${r.mod_delta}</span>`},
      {title:'Syn SK', data:'syn_sk'}, {title:'Syn DGX', data:'syn_dgx'},
      {title:'Syn Δ pp', data: r => `<span class="${Math.abs(parseFloat(r.syn_delta)) > 1.5 ? 'delta-warn' : ''}">${r.syn_delta}</span>`},
      {title:'Sem SK', data:'sem_sk'}, {title:'Sem DGX', data:'sem_dgx'},
      {title:'Sem Δ pp', data: r => `<span class="${Math.abs(parseFloat(r.sem_delta)) > 1.5 ? 'delta-warn' : ''}">${r.sem_delta}</span>`},
    ],
    pageLength: 10,
  });
}

const MOD_ANOMALIES = [
  { id: 'anomaly-modifier-nemo-9b', model_folder: 'nemotron-nano-9b-v2',
    title: 'nemotron-nano-9b-v2 reasoning-model deltas',
    detail: 'Modifier Syn Δ +3.12 pp · Sem Δ +2.64 pp',
    mechanism: 'Audit §3.2 + §4.1: 4 DGX samples timed out at 600s (no model output); imputing SK scores would shift DGX up by ~0.13–0.39 pp.' },
  { id: 'anomaly-modifier-nemo-12b', model_folder: 'nemotron-nano-12b-v2',
    title: 'nemotron-nano-12b-v2 reasoning-model deltas',
    detail: 'Modifier Syn Δ −2.64 pp · Sem Δ −1.56 pp',
    mechanism: 'Audit §3.2: reasoning-model stochasticity; consistent with sibling nemotron-9b pattern but opposite direction.' },
  { id: 'anomaly-modifier-qwen-loops', model_folder: 'qwen3.5-0.8b',
    title: 'qwen3.5-0.8b repetition-loop failure (BOTH machines)',
    detail: '223/1024 = 21.78% truncated on each machine; 200 sample IDs shared between SK and DGX',
    mechanism: 'Audit §4.4: real model deficiency at the 0.8B-parameter scale; not a benchmarking artifact. Model falls into a repetition loop, replaying chunks of the system prompt.' },
];

function renderModAnomalies() {
  const container = document.getElementById('mod-anomalies');
  const rows = DASHBOARD_DATA.modifier;
  container.innerHTML = `
    <h3>§2.3 Anomalies (3 cards)</h3>
    <div class="anomaly-cards">
      ${MOD_ANOMALIES.map(a => {
        const sk = rows.find(r => r.model_folder === a.model_folder && r.machine === 'skorge');
        const dgx = rows.find(r => r.model_folder === a.model_folder && r.machine === 'dgx_spark');
        const skUrl = buildLogUrl('modifier', 'skorge', a.model_folder, sk?.eval_file);
        const dgxUrl = buildLogUrl('modifier', 'dgx_spark', a.model_folder, dgx?.eval_file);
        return `
          <div class="anomaly-card" id="${a.id}">
            <div class="anomaly-card-header">
              <strong>${a.title}</strong>
            </div>
            <div class="anomaly-card-body">${a.detail}</div>
            <div class="anomaly-card-mechanism">${a.mechanism}</div>
            <div class="anomaly-card-actions">
              <a href="${skUrl}" target="_blank">Open SK eval</a>
              <a href="${dgxUrl}" target="_blank">Open DGX eval</a>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
