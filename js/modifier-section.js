// modifier-section.js — Modification section (Phase D).
// Mirrors retrieval-section.js (Phase C) for the single-task modifier benchmark:
// per-section control model (Machine · View + LLM legend, NO Families — single
// task), multi-model Plotly bars, comprehensive DataTable, cross-machine
// Compare Δ (computed client-side), a per-template heatmap, and per-row
// log-drawer wiring.
//
// Data (window.DASHBOARD_DATA, populated by data-loader.js):
//   modifier          — modifier-summary.json    (18 = 9 models × 2 machines)
//   modifierTemplates — modifier-templates.json  (378 = 9 × 2 × 21 templates)
//
// CRITICAL data facts:
//   - Machine field values: 'skorge' | 'dgx_spark'.
//   - The 3 quality scorers are stored as fractions in metrics{}: Modification_
//     Accuracy, Neo4j_Syntactic_Validity (= "Execution Success"), Neo4j_Semantic_
//     Validity (= "Answer Yield"). presence_score / removal_score are top-level
//     fractions. All ×100 for % display.
//   - "Median/Avg time" come from the `timing` block (working_time): median/mean/max.
//   - Tokens live under `tokens` (avg_total etc.); throughput tok/s; truncation_rate.
//   - Compare Δ is NOT pre-computed (cross-machine-deltas.json is retrieval-only):
//     join SK + DGX summary rows per model and compute Δ = (dgx − sk) × 100 pp
//     per scorer client-side. Color: green ≤1 / amber ≤1.5 / red >1.5.
//
// Shared helpers (window): MODEL_COLORS, MODEL_DISPLAY, REASONING_MODELS,
//   METRIC_LABELS, buildLogUrl, formatRuntime, exportJSONToCSV, openLogDrawer.

(function () {
  'use strict';

  // ---- Canonical model order (matches the validated prototype legend order) ----
  const MODEL_ORDER = [
    'gpt-oss-20b',
    'NVIDIA-Nemotron-Nano-12B-v2',
    'NVIDIA-Nemotron-Nano-9B-v2',
    'Ministral-3-14B-Instruct-2512',
    'Ministral-3-8B-Instruct-2512',
    'Ministral-3-3B-Instruct-2512',
    'gemma-4-E2B-it',
    'Qwen3.5-2B',
    'Qwen3.5-0.8B',
  ];

  // Machine value → (a) JSON `machine` field, (b) human label.
  const MACHINE_JSON = { skorge: 'skorge', dgx: 'dgx_spark' };
  const MACHINE_LABEL = { skorge: 'SKORGE', dgx: 'DGX Spark', cmp: 'Compare Δ' };

  // ---- Per-section state (independent of retrieval, per design §4.1) ----
  const state = {
    machine: 'skorge',                 // 'skorge' | 'dgx' | 'cmp'
    view: 'chart',                     // 'chart' | 'table'
    metric: 'Modification_Accuracy',   // chart metric key (see METRICS)
    models: {},                        // model -> bool (legend toggles)
  };
  MODEL_ORDER.forEach((m) => { state.models[m] = true; });

  // ---- Chart metric catalog (Chart view only; grouped per design §7.3) ----
  // get(row) reads a modifier-summary row; `pct` values are stored as fractions
  // and multiplied by 100 for display.
  const METRICS = {
    Modification_Accuracy:    { label: 'Modification Accuracy (%)',     pct: true,  get: (r) => r.metrics.Modification_Accuracy.value },
    Neo4j_Syntactic_Validity: { label: 'Execution Success (%)',         pct: true,  get: (r) => r.metrics.Neo4j_Syntactic_Validity.value },
    Neo4j_Semantic_Validity:  { label: 'Answer Yield (%)',              pct: true,  get: (r) => r.metrics.Neo4j_Semantic_Validity.value },
    presence_score:           { label: 'Presence (%)',                  pct: true,  get: (r) => r.presence_score },
    removal_score:            { label: 'Removal (%)',                   pct: true,  get: (r) => r.removal_score },
    avg_total:                { label: 'Avg Tokens/Sample',             pct: false, get: (r) => (r.tokens ? r.tokens.avg_total : null) },
    timing_median:            { label: 'Median Time/Sample (s)',        pct: false, get: (r) => (r.timing ? r.timing.median : null) },
    throughput:               { label: 'Throughput (tok/s)',            pct: false, get: (r) => r.throughput },
    truncation_rate:          { label: 'Truncation Rate (%)',           pct: true,  get: (r) => r.truncation_rate },
  };
  const METRIC_GROUPS = [
    { group: 'Quality',           keys: ['Modification_Accuracy', 'Neo4j_Syntactic_Validity', 'Neo4j_Semantic_Validity', 'presence_score', 'removal_score'] },
    { group: 'Cost & efficiency', keys: ['avg_total', 'timing_median', 'throughput'] },
    { group: 'Reliability',       keys: ['truncation_rate'] },
  ];
  const LOWER_BETTER = new Set(['avg_total', 'timing_median', 'truncation_rate']);

  // The 3 quality scorers used in Compare Δ + heatmap (paper labels).
  const SCORERS = [
    { key: 'Modification_Accuracy',    label: 'Modification Accuracy' },
    { key: 'Neo4j_Syntactic_Validity', label: 'Execution Success' },
    { key: 'Neo4j_Semantic_Validity',  label: 'Answer Yield' },
  ];

  // ---- Data accessors -------------------------------------------------------
  function rows(machineJson) {
    return (DASHBOARD_DATA.modifier || []).filter((r) => r.machine === machineJson);
  }
  function rowFor(machineJson, model) {
    return (DASHBOARD_DATA.modifier || []).find((r) => r.machine === machineJson && r.model === model);
  }
  function modelDisplay(model) { return (MODEL_DISPLAY[model] || model); }
  function modelColor(model) { return (MODEL_COLORS[model] || '#90a4ae'); }
  function isReasoning(model) { return REASONING_MODELS.has(model); }
  function activeModels() { return MODEL_ORDER.filter((m) => state.models[m]); }

  // =========================================================================
  // D1 — Control bar + state + LLM legend
  // =========================================================================
  function renderControls() {
    const container = document.getElementById('modification-container');
    if (!container) return;

    container.innerHTML = `
      <p class="section-desc">A single graph-modification task scored on 1,024 samples across 21 query
        templates; all 9 models run on both machines. Quality = Modification Accuracy, Execution Success
        (syntactic validity), Answer Yield (non-empty result), plus Presence &amp; Removal sub-scores.</p>

      <div class="filterbar" id="mod-filterbar">
        <div class="fg">
          <span class="lbl">Machine</span>
          <div class="seg" id="mod-machine">
            <button data-m="skorge">SKORGE</button>
            <button data-m="dgx">DGX Spark</button>
            <button data-m="cmp">Compare Δ</button>
          </div>
        </div>
        <div class="fg" style="margin-left:auto">
          <span class="lbl">View</span>
          <div class="seg alt" id="mod-view">
            <button data-v="chart">Chart</button>
            <button data-v="table">Table</button>
          </div>
        </div>
      </div>

      <div class="fg" style="align-items:flex-start">
        <span class="lbl" style="padding-top:4px">LLMs</span>
        <div class="legend" id="mod-legend"></div>
      </div>

      <div id="mod-body" style="margin-top:1rem"></div>
      <p class="hint" id="mod-foot" style="font-size:.74rem;color:#979797;font-weight:600;margin-top:.6rem"></p>

      <div id="mod-subcharts" style="margin-top:1.6rem"></div>
    `;

    container.querySelectorAll('#mod-machine button').forEach((b) => {
      b.addEventListener('click', () => { state.machine = b.dataset.m; syncControls(); renderModifier(); });
    });
    container.querySelectorAll('#mod-view button').forEach((b) => {
      b.addEventListener('click', () => { state.view = b.dataset.v; syncControls(); renderModifier(); });
    });

    renderLegend();
    syncControls();
  }

  function renderLegend() {
    const leg = document.getElementById('mod-legend');
    if (!leg) return;
    leg.innerHTML = MODEL_ORDER.map((m) => {
      const off = state.models[m] ? '' : ' off';
      const rz = isReasoning(m) ? '<span class="rz" title="reasoning model">✦</span>' : '';
      return `<span class="lgbox${off}" data-model="${m}">` +
        `<span class="sw" style="background:${modelColor(m)}"></span>${modelDisplay(m)}${rz}</span>`;
    }).join('');
    leg.querySelectorAll('.lgbox').forEach((chip) => {
      chip.addEventListener('click', () => {
        const m = chip.dataset.model;
        state.models[m] = !state.models[m];
        chip.classList.toggle('off', !state.models[m]);
        renderModifier();
      });
    });
  }

  function syncControls() {
    const container = document.getElementById('modification-container');
    if (!container) return;
    container.querySelectorAll('#mod-machine button').forEach((b) =>
      b.classList.toggle('on', b.dataset.m === state.machine));
    container.querySelectorAll('#mod-view button').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === state.view));
  }

  // =========================================================================
  // renderModifier — dispatch on machine + view.
  // =========================================================================
  function renderModifier() {
    const body = document.getElementById('mod-body');
    if (!body) return;
    if (state.machine === 'cmp') {
      if (state.view === 'chart') renderCompareScatter(body);
      else renderCompareTable(body);
    } else if (state.view === 'chart') {
      renderChart(body);
    } else {
      renderTable(body);
    }
    renderSubcharts();
    updateFoot();
  }

  function updateFoot() {
    const foot = document.getElementById('mod-foot');
    if (!foot) return;
    const nMod = activeModels().length;
    if (state.machine === 'cmp') {
      foot.innerHTML = 'Compare Δ = DGX − SKORGE (pp) per scorer. Cells |Δ|&gt;1.5 pp drawn red, ≤1.5 amber, ≤1 green. ' +
        'Legend filters models. <b>logs ↗</b> per row opens the eval in the InspectAI viewer.';
    } else {
      foot.innerHTML = `Machine <b>${MACHINE_LABEL[state.machine]}</b> · <b>${nMod}</b> of 9 LLMs · ` +
        'grouped bars, one per model; the metric selector (Chart view) switches the plotted scorer. ' +
        '<b>logs ↗</b> per row in Table view; click any bar to open the drawer.';
    }
  }

  // =========================================================================
  // D2 — Chart view: Plotly 9-model bars + in-chart metric selector
  // =========================================================================
  // The metric <select> lives ATOP the chart and ONLY in Chart view (design §4.1).
  function metricSelectHTML() {
    const opts = METRIC_GROUPS.map((g) => {
      const inner = g.keys.map((k) =>
        `<option value="${k}"${k === state.metric ? ' selected' : ''}>${METRICS[k].label}</option>`).join('');
      return `<optgroup label="${g.group}">${inner}</optgroup>`;
    }).join('');
    return `<div class="fg" style="margin-bottom:.6rem"><span class="lbl">Metric</span>` +
      `<select class="ctl" id="mod-metric">${opts}</select></div>`;
  }

  // Value for a summary row under the selected metric; pct metrics scaled ×100.
  function metricVal(row, key) {
    const def = METRICS[key];
    const v = def.get(row);
    if (v === null || v === undefined) return null;
    return def.pct ? v * 100 : v;
  }

  function renderChart(body) {
    body.innerHTML = metricSelectHTML() + '<div id="modifier-chart" style="min-height:420px"></div>';
    const sel = document.getElementById('mod-metric');
    if (sel) sel.addEventListener('change', () => { state.metric = sel.value; renderChart(body); });

    const machineJson = MACHINE_JSON[state.machine];
    const key = state.metric;
    const def = METRICS[key];
    const chartDiv = document.getElementById('modifier-chart');

    const models = activeModels();
    if (!models.length) {
      chartDiv.innerHTML = '<p class="hint" style="padding:1rem">No models selected — enable a legend chip.</p>';
      return;
    }

    const lower = LOWER_BETTER.has(key);
    const fmt = (v) => (v === null ? '' : (def.pct ? v.toFixed(2) + '%' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2))));

    // One vertical bar per active model, ordered best→worst on the selected metric.
    const scored = models.map((m) => {
      const row = rowFor(machineJson, m);
      return { model: m, row, v: row ? metricVal(row, key) : null };
    });
    scored.sort((a, b) => {
      const av = a.v === null ? (lower ? Infinity : -Infinity) : a.v;
      const bv = b.v === null ? (lower ? Infinity : -Infinity) : b.v;
      return lower ? av - bv : bv - av;
    });

    const xs = scored.map((s) => modelDisplay(s.model) + (isReasoning(s.model) ? ' ✦' : ''));
    const ys = scored.map((s) => s.v);
    const colors = scored.map((s) => modelColor(s.model));
    const texts = scored.map((s) => fmt(s.v));
    const hovers = scored.map((s) => s.row
      ? `<b>${modelDisplay(s.model)}</b><br>${def.label}: ${fmt(s.v)}` : '');

    const trace = {
      type: 'bar', x: xs, y: ys, marker: { color: colors },
      text: texts, textposition: 'outside', textfont: { size: 10 },
      hovertext: hovers, hoverinfo: 'text', cliponaxis: false,
    };
    const layout = {
      height: 460, margin: { l: 60, r: 30, t: 30, b: 90 },
      xaxis: { tickangle: -35, automargin: true },
      yaxis: { title: def.label, automargin: true, zeroline: true, rangemode: 'tozero' },
      font: { family: 'Manrope, sans-serif' },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('modifier-chart', [trace], layout, { responsive: true, displayModeBar: false });

    // Bar click → log drawer (all metrics for that model×machine).
    chartDiv.removeAllListeners && chartDiv.removeAllListeners('plotly_click');
    chartDiv.on && chartDiv.on('plotly_click', (ev) => {
      const pt = ev.points && ev.points[0]; if (!pt) return;
      const s = scored[pt.pointNumber];
      if (s && s.row) openDrawerForRow(s.row, s.model);
    });
  }

  // =========================================================================
  // Drawer payload builder (all metrics for a model × machine row)
  // =========================================================================
  function openDrawerForRow(row, model) {
    if (!row || typeof window.openLogDrawer !== 'function') return;
    const me = row.metrics || {};
    const machineLabel = row.machine === 'dgx_spark' ? 'DGX Spark' : 'SKORGE';
    const pctSE = (mv) => (mv && mv.value != null
      ? (mv.value * 100).toFixed(2) + '%' + (mv.se != null ? ' ± ' + (mv.se * 100).toFixed(2) : '') : '—');
    const pctv = (v) => (v === null || v === undefined ? '—' : (Number(v) * 100).toFixed(2) + '%');

    const quality = [
      { label: 'Modification Accuracy', value: pctSE(me.Modification_Accuracy) },
      { label: 'Execution Success (Syntactic)', value: pctSE(me.Neo4j_Syntactic_Validity) },
      { label: 'Answer Yield (non-empty)', value: pctSE(me.Neo4j_Semantic_Validity) },
      { label: 'Presence', value: pctv(row.presence_score) },
      { label: 'Removal', value: pctv(row.removal_score) },
    ];
    const tk = row.tokens || {};
    const cost = [
      { label: 'Avg Tokens/Sample', value: tk.avg_total != null ? Math.round(tk.avg_total).toLocaleString() : '—' },
      { label: 'Avg Input / Output Tokens', value: (tk.avg_input != null && tk.avg_output != null)
        ? Math.round(tk.avg_input).toLocaleString() + ' / ' + Math.round(tk.avg_output).toLocaleString() : '—' },
      { label: 'Median / Mean / Max Time', value: row.timing
        ? `${row.timing.median.toFixed(2)} / ${row.timing.mean.toFixed(2)} / ${row.timing.max.toFixed(2)} s` : '—' },
      { label: 'Throughput', value: row.throughput != null ? row.throughput + ' tok/s' : '—' },
      { label: 'Total Runtime', value: row.total_runtime != null ? formatRuntime(row.total_runtime) : '—' },
    ];
    const completed = (row.completed_samples != null ? row.completed_samples : row.samples);
    const reliability = [
      { label: 'Truncation Rate', value: row.truncation_rate != null ? (row.truncation_rate * 100).toFixed(2) + '%' : '—' },
      { label: 'Truncation Count', value: row.truncation_count != null ? row.truncation_count : '—' },
      { label: 'max_tokens', value: row.max_tokens == null ? 'None (unbounded)' : row.max_tokens },
      { label: 'Completed / Total', value: `${completed.toLocaleString()} / ${row.samples.toLocaleString()}` + (completed < row.samples ? ' (short run)' : '') },
    ];

    window.openLogDrawer({
      title: modelDisplay(model) + (isReasoning(model) ? ' ✦' : '') + ' — modification benchmark',
      machine: machineLabel,
      groups: [
        { group: 'Quality', rows: quality },
        { group: 'Cost & efficiency', rows: cost },
        { group: 'Reliability', rows: reliability },
      ],
      logUrl: buildLogUrl(row.model_folder, row.eval_file, 'modifier'),
    });
  }

  // =========================================================================
  // D2 — Table view: comprehensive sortable DataTable + CSV + completed/total
  // =========================================================================
  let modDataTable = null;

  function num(v, d) { return (v === null || v === undefined) ? '—' : Number(v).toFixed(d); }
  function pct(v, d) { return (v === null || v === undefined) ? '—' : (Number(v) * 100).toFixed(d); }

  // Active-model summary rows for the selected machine, ordered by Mod Accuracy.
  function tableEntries() {
    const machineJson = MACHINE_JSON[state.machine];
    return activeModels()
      .map((m) => ({ model: m, src: rowFor(machineJson, m) }))
      .filter((e) => e.src)
      .sort((a, b) => b.src.metrics.Modification_Accuracy.value - a.src.metrics.Modification_Accuracy.value);
  }

  function renderTable(body) {
    if (modDataTable) { try { modDataTable.destroy(); } catch (e) {} modDataTable = null; }
    body.innerHTML =
      '<div style="margin-bottom:.6rem"><button class="btn-small" id="mod-csv">Export CSV</button></div>' +
      '<div class="tablewrap"><table id="modifier-table" class="display" style="width:100%"></table></div>';

    const entries = tableEntries();
    const dataset = entries.map((entry) => {
      const r = entry.src;
      const me = r.metrics || {};
      const tk = r.tokens || {};
      const url = buildLogUrl(r.model_folder, r.eval_file, 'modifier');
      const modelCell = `<a href="${url}" target="_blank" rel="noopener" title="Open eval in InspectAI viewer">${modelDisplay(entry.model)}</a>` +
        (isReasoning(entry.model) ? ' ✦' : '');
      const ma = me.Modification_Accuracy || {};
      const accSE = `${pct(ma.value, 2)} ± ${ma.se != null ? (ma.se * 100).toFixed(2) : '—'}`;
      const tok = tk.avg_total != null ? Math.round(tk.avg_total).toLocaleString() : '—';
      const tmean = r.timing && r.timing.mean != null ? r.timing.mean.toFixed(2) : '—';
      const thr = r.throughput != null ? r.throughput : '—';
      const trunc = num(r.truncation_rate != null ? r.truncation_rate * 100 : null, 2);
      const completedVal = (r.completed_samples != null ? r.completed_samples : r.samples);
      const completed = `${completedVal.toLocaleString()} / ${r.samples.toLocaleString()}`;
      const shortRun = (r.completed_samples != null && r.completed_samples < r.samples);
      return [
        modelCell,
        accSE,
        pct(me.Neo4j_Syntactic_Validity ? me.Neo4j_Syntactic_Validity.value : null, 2),
        pct(me.Neo4j_Semantic_Validity ? me.Neo4j_Semantic_Validity.value : null, 2),
        pct(r.presence_score, 2),
        pct(r.removal_score, 2),
        tok, tmean, thr,
        trunc,
        shortRun ? `<b style="color:#c5384a" title="short run">${completed}</b>` : completed,
        `<span class="logbtn" data-ridx="${entries.indexOf(entry)}">logs ↗</span>`,
      ];
    });

    modDataTable = new DataTable('#modifier-table', {
      data: dataset,
      columns: [
        { title: 'Model' },
        { title: 'Mod Accuracy ± SE' }, { title: 'Exec Success' }, { title: 'Answer Yield' },
        { title: 'Presence' }, { title: 'Removal' },
        { title: 'Avg Tokens' }, { title: 'Avg Time/Sample (s)' }, { title: 'Throughput (tok/s)' },
        { title: 'Trunc %' }, { title: 'Completed / Total' }, { title: '', orderable: false },
      ],
      order: [[1, 'desc']],
      pageLength: 25,
      scrollX: true,
      deferRender: true,
    });

    document.querySelector('#modifier-table').addEventListener('click', (ev) => {
      const btn = ev.target.closest('.logbtn');
      if (!btn) return;
      const idx = Number(btn.dataset.ridx);
      const entry = entries[idx];
      if (entry) openDrawerForRow(entry.src, entry.model);
    });

    const csvBtn = document.getElementById('mod-csv');
    if (csvBtn) csvBtn.addEventListener('click', () => exportTableCSV(entries));
  }

  function exportTableCSV(entries) {
    const data = entries.map((e) => Object.assign({ __model: e.model }, e.src));
    exportJSONToCSV(data, [
      { label: 'Machine', accessor: 'machine' },
      { label: 'Model', accessor: (r) => modelDisplay(r.__model) },
      { label: 'Modification_Accuracy', accessor: (r) => (r.metrics.Modification_Accuracy.value * 100).toFixed(4) },
      { label: 'Modification_Accuracy_SE', accessor: (r) => (r.metrics.Modification_Accuracy.se * 100).toFixed(4) },
      { label: 'Execution_Success', accessor: (r) => (r.metrics.Neo4j_Syntactic_Validity.value * 100).toFixed(4) },
      { label: 'Answer_Yield', accessor: (r) => (r.metrics.Neo4j_Semantic_Validity.value * 100).toFixed(4) },
      { label: 'Presence', accessor: (r) => (r.presence_score * 100).toFixed(4) },
      { label: 'Removal', accessor: (r) => (r.removal_score * 100).toFixed(4) },
      { label: 'Avg_Total_Tokens', accessor: (r) => (r.tokens ? r.tokens.avg_total : '') },
      { label: 'Median_Time_s', accessor: (r) => (r.timing ? r.timing.median.toFixed(2) : '') },
      { label: 'Mean_Time_s', accessor: (r) => (r.timing ? r.timing.mean.toFixed(2) : '') },
      { label: 'Throughput_tok_s', accessor: (r) => (r.throughput != null ? r.throughput : '') },
      { label: 'Total_Runtime_s', accessor: (r) => (r.total_runtime != null ? r.total_runtime.toFixed(1) : '') },
      { label: 'Truncation_Rate_pct', accessor: (r) => (r.truncation_rate != null ? (r.truncation_rate * 100).toFixed(4) : '') },
      { label: 'Completed', accessor: (r) => (r.completed_samples != null ? r.completed_samples : r.samples) },
      { label: 'Total_Samples', accessor: 'samples' },
    ], `modifier-${state.machine}.csv`);
  }

  // =========================================================================
  // D3 — Compare Δ view (scatter + delta table), computed client-side
  // =========================================================================
  // cross-machine-deltas.json is retrieval-only, so modifier deltas are joined
  // here: for each active model, pair its SKORGE + DGX summary rows. Δ for a
  // scorer = (dgx − sk) × 100 pp. Color: green ≤1 / amber ≤1.5 / red >1.5.
  function deltaClass(d) { const x = Math.abs(d); return x <= 1 ? 'good' : x <= 1.5 ? 'warn' : 'bad'; }

  // Per-model joined rows (only models present on BOTH machines + legend-active).
  function comparePairs() {
    return activeModels().map((m) => {
      const sk = rowFor('skorge', m);
      const dg = rowFor('dgx_spark', m);
      if (!sk || !dg) return null;
      return { model: m, sk, dg };
    }).filter(Boolean);
  }

  function scorerVal(row, key) { return row.metrics[key].value * 100; }

  function renderCompareScatter(body) {
    body.innerHTML = '<div id="modifier-chart" style="min-height:480px"></div>';
    const pairs = comparePairs();
    const div = document.getElementById('modifier-chart');
    if (!pairs.length) {
      div.innerHTML = '<p class="hint" style="padding:1rem">No models selected — enable a legend chip.</p>';
      return;
    }

    // Scatter on Modification Accuracy (SK x, DGX y); points |Δ|>1.5 red+labeled.
    const key = 'Modification_Accuracy';
    const withDelta = pairs.map((p) => {
      const sk = scorerVal(p.sk, key), dgx = scorerVal(p.dg, key);
      return { p, sk, dgx, delta: dgx - sk };
    });
    const onDiag = withDelta.filter((d) => Math.abs(d.delta) <= 1.5);
    const off = withDelta.filter((d) => Math.abs(d.delta) > 1.5);
    const hover = (d) => `<b>${modelDisplay(d.p.model)}</b><br>` +
      `SK ${d.sk.toFixed(2)}% · DGX ${d.dgx.toFixed(2)}%<br>Δ ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)} pp`;

    const allv = withDelta.flatMap((d) => [d.sk, d.dgx]);
    const lo = Math.max(0, Math.floor(Math.min(...allv) - 3));
    const hi = Math.min(100, Math.ceil(Math.max(...allv) + 3));

    const traces = [
      { name: 'y = x (identical)', type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi],
        line: { color: '#1565c0', dash: 'dash', width: 1.5 }, hoverinfo: 'skip' },
      { name: '|Δ| ≤ 1.5 pp', type: 'scatter', mode: 'markers',
        x: onDiag.map((d) => d.sk), y: onDiag.map((d) => d.dgx),
        marker: { color: onDiag.map((d) => modelColor(d.p.model)), size: 11, opacity: 0.85, line: { color: '#37474f', width: 0.5 } },
        text: onDiag.map(hover), hoverinfo: 'text' },
      { name: '|Δ| > 1.5 pp', type: 'scatter', mode: 'markers+text',
        x: off.map((d) => d.sk), y: off.map((d) => d.dgx),
        marker: { color: '#c5384a', size: 13, opacity: 0.9, line: { color: '#7a1f2b', width: 1 } },
        text: off.map((d) => `${modelDisplay(d.p.model)} (${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)})`),
        textposition: 'top center', textfont: { color: '#c5384a', size: 9 },
        hovertext: off.map(hover), hoverinfo: 'text' },
    ];
    const layout = {
      height: 520, margin: { l: 60, r: 40, t: 30, b: 55 },
      title: { text: 'Modification Accuracy — SKORGE vs DGX Spark', font: { size: 13 } },
      xaxis: { title: 'SKORGE Modification Accuracy (%)', range: [lo, hi], zeroline: false },
      yaxis: { title: 'DGX Spark Modification Accuracy (%)', range: [lo, hi], zeroline: false, scaleanchor: 'x', scaleratio: 1 },
      legend: { orientation: 'h', y: 1.08, font: { size: 10 } },
      font: { family: 'Manrope, sans-serif' },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('modifier-chart', traces, layout, { responsive: true, displayModeBar: false });

    div.removeAllListeners && div.removeAllListeners('plotly_click');
    div.on && div.on('plotly_click', (ev) => {
      const pt = ev.points && ev.points[0]; if (!pt || pt.curveNumber === 0) return;
      const set = pt.curveNumber === 1 ? onDiag : off;
      const d = set[pt.pointNumber];
      if (d) openDrawerForRow(d.p.dg, d.p.model); // DGX side detail
    });
  }

  function renderCompareTable(body) {
    if (modDataTable) { try { modDataTable.destroy(); } catch (e) {} modDataTable = null; }
    body.innerHTML =
      '<div style="margin-bottom:.6rem"><button class="btn-small" id="mod-csv">Export CSV</button>' +
      '<span style="margin-left:1rem;font-size:.78rem"><span class="d good">|Δ|≤1</span> <span class="d warn">≤1.5</span> <span class="d bad">&gt;1.5 pp</span></span></div>' +
      '<div class="tablewrap"><table id="modifier-table" class="display" style="width:100%"></table></div>';

    const pairs = comparePairs();
    // One row per (model × scorer): SK / DGX / Δpp color-coded.
    const flat = [];
    pairs.forEach((p) => {
      SCORERS.forEach((s) => {
        const sk = scorerVal(p.sk, s.key), dgx = scorerVal(p.dg, s.key);
        flat.push({ p, scorer: s, sk, dgx, delta: dgx - sk });
      });
    });
    const sorted = [...flat].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const dataset = sorted.map((d) => {
      const skUrl = buildLogUrl(d.p.sk.model_folder, d.p.sk.eval_file, 'modifier');
      const dgxUrl = buildLogUrl(d.p.dg.model_folder, d.p.dg.eval_file, 'modifier');
      const dCell = `<span class="d ${deltaClass(d.delta)}">${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)}</span>`;
      const modelCell = `${modelDisplay(d.p.model)}${isReasoning(d.p.model) ? ' ✦' : ''} ` +
        `<a href="${skUrl}" target="_blank" rel="noopener" title="SKORGE eval" style="font-size:.7rem">[sk ↗]</a> ` +
        `<a href="${dgxUrl}" target="_blank" rel="noopener" title="DGX eval" style="font-size:.7rem">[dgx ↗]</a>`;
      return [modelCell, d.scorer.label, d.sk.toFixed(2), d.dgx.toFixed(2),
        { html: dCell, abs: Math.abs(d.delta), raw: d.delta }];
    });

    modDataTable = new DataTable('#modifier-table', {
      data: dataset,
      columns: [
        { title: 'Model' }, { title: 'Scorer' }, { title: 'SK' }, { title: 'DGX' },
        {
          title: 'Δ pp',
          render: function (data, type) {
            if (type === 'sort' || type === 'type') return data.abs;
            if (type === 'filter') return data.raw.toFixed(2);
            return data.html;
          },
        },
      ],
      order: [[4, 'desc']],
      pageLength: 27, scrollX: true, deferRender: true,
    });

    const csvBtn = document.getElementById('mod-csv');
    if (csvBtn) csvBtn.addEventListener('click', () => exportCompareCSV(sorted));
  }

  function exportCompareCSV(sorted) {
    exportJSONToCSV(sorted, [
      { label: 'Model', accessor: (d) => modelDisplay(d.p.model) },
      { label: 'Scorer', accessor: (d) => d.scorer.label },
      { label: 'SK', accessor: (d) => d.sk.toFixed(4) },
      { label: 'DGX', accessor: (d) => d.dgx.toFixed(4) },
      { label: 'Delta_pp', accessor: (d) => d.delta.toFixed(4) },
    ], 'modifier-cross-machine-deltas.csv');
  }

  // =========================================================================
  // D3 — Per-template breakdown heatmap (models × template_id, metric-selectable)
  // =========================================================================
  // Shown in non-Compare views as the "2.4" sub-block. Uses modifier-templates
  // (378 = 9 × 2 × 21). In Compare, falls back to SKORGE (templates are per-machine).
  const HEATMAP_METRICS = [
    { key: 'Modification_Accuracy',    label: 'Modification Accuracy' },
    { key: 'Neo4j_Syntactic_Validity', label: 'Execution Success' },
    { key: 'Neo4j_Semantic_Validity',  label: 'Answer Yield' },
  ];
  let heatMetric = 'Modification_Accuracy';
  let subchartsBuilt = false;

  function subMachineJson() { return state.machine === 'cmp' ? 'skorge' : MACHINE_JSON[state.machine]; }

  function renderSubcharts() {
    const host = document.getElementById('mod-subcharts');
    if (!host) return;
    if (!subchartsBuilt) {
      const opts = HEATMAP_METRICS.map((m) =>
        `<option value="${m.key}"${m.key === heatMetric ? ' selected' : ''}>${m.label}</option>`).join('');
      host.innerHTML = `
        <h3 style="color:#1565c0">2.4 · Per-template breakdown</h3>
        <div class="fg" style="margin:.3rem 0 .6rem"><span class="lbl">Metric</span>
          <select class="ctl" id="mod-heat-metric">${opts}</select>
          <span class="hint" id="mod-heat-note" style="margin-left:.6rem"></span>
        </div>
        <div id="mod-heat-chart" style="min-height:420px"></div>`;
      const sel = document.getElementById('mod-heat-metric');
      if (sel) sel.addEventListener('change', () => { heatMetric = sel.value; renderHeatmap(); });
      subchartsBuilt = true;
    }
    const note = document.getElementById('mod-heat-note');
    if (note) note.textContent = 'Per-template score for each model across the 21 query templates' +
      (state.machine === 'cmp' ? ' · showing SKORGE (templates are per-machine).' : '.');
    renderHeatmap();
  }

  function renderHeatmap() {
    const machineJson = subMachineJson();
    const tmpl = (DASHBOARD_DATA.modifierTemplates || []).filter((r) => r.machine === machineJson);
    const templateIds = [...new Set(tmpl.map((r) => r.template_id))].sort();
    const models = activeModels(); // legend filters rows
    const def = HEATMAP_METRICS.find((m) => m.key === heatMetric);

    // z[modelRow][templateCol] = value × 100 (null if missing).
    const z = [], hovertext = [];
    models.forEach((m) => {
      const zr = [], hr = [];
      templateIds.forEach((tid) => {
        const row = tmpl.find((r) => r.model === m && r.template_id === tid);
        const v = row ? row[heatMetric] : null;
        zr.push(v === null || v === undefined ? null : v * 100);
        hr.push(row
          ? `<b>${modelDisplay(m)}</b><br>${tid} (n=${row.count})<br>${def.label}: ${(v * 100).toFixed(2)}%`
          : `${modelDisplay(m)}<br>${tid}: —`);
      });
      z.push(zr); hovertext.push(hr);
    });

    const trace = {
      type: 'heatmap', x: templateIds,
      y: models.map((m) => modelDisplay(m) + (isReasoning(m) ? ' ✦' : '')),
      z, hovertext, hoverinfo: 'text',
      colorscale: [[0, '#c5384a'], [0.5, '#ffd166'], [1, '#1a8c5a']],
      zmin: 0, zmax: 100, colorbar: { title: '%', titleside: 'right' },
      xgap: 1, ygap: 1,
    };
    const layout = {
      height: Math.max(320, models.length * 34 + 140),
      margin: { l: 110, r: 30, t: 20, b: 60 },
      xaxis: { title: 'Query template', tickangle: -45, automargin: true },
      yaxis: { automargin: true },
      font: { family: 'Manrope, sans-serif' },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('mod-heat-chart', [trace], layout, { responsive: true, displayModeBar: false });
  }

  // ---- Entry point ----------------------------------------------------------
  function initModifierSection() {
    if (!window.DASHBOARD_DATA || !DASHBOARD_DATA.loaded) return;
    renderControls();
    renderModifier();
  }

  if (typeof window !== 'undefined') {
    window.initModifierSection = initModifierSection;
  }
})();
