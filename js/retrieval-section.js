// retrieval-section.js — Retrieval section (Phase C).
// Control model (Machine · Families · View + LLM legend), multi-model Plotly
// grouped bars, comprehensive DataTable, cross-machine Compare, tier + Pareto
// sub-charts, and per-row log-drawer wiring. Retrieval only (modifier = Phase D).
//
// Data (window.DASHBOARD_DATA, populated by data-loader.js):
//   retrievalLlm       — retrieval-llm-summary.json     (414: 207/machine)
//   retrievalAllarma   — retrieval-allarma-summary.json (116: 58/machine, model:null)
//   retrievalLlmTiers  — retrieval-llm-tiers.json        (414)
//   crossMachineDeltas — cross-machine-deltas.json       (207, retriever-llm only)
//
// Shared helpers (window): MODEL_COLORS, MODEL_DISPLAY, REASONING_MODELS,
//   METRIC_LABELS, STRATEGY_FAMILY, buildLogUrl, formatRuntime, exportJSONToCSV.

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

  const FAM_LABEL = {
    base: 'Non-LLM baselines',
    aug: 'LLM-augmented',
    pure: 'Pure-LLM',
  };

  // Machine value → (a) JSON `machine` field, (b) human label.
  const MACHINE_JSON = { skorge: 'skorge', dgx: 'dgx_spark' };
  const MACHINE_LABEL = { skorge: 'SKORGE', dgx: 'DGX Spark', cmp: 'Compare Δ' };

  // ---- Per-section state (independent, per design §4.1) ----
  const state = {
    machine: 'skorge',                 // 'skorge' | 'dgx' | 'cmp'
    fams: { base: true, aug: true, pure: true },
    view: 'chart',                     // 'chart' | 'table'
    metric: 'accuracy',                // chart metric key (see METRICS)
    models: {},                        // model -> bool (legend toggles)
  };
  MODEL_ORDER.forEach((m) => { state.models[m] = true; });

  // ---- Chart metric catalog (Chart view only; grouped per design §7.3) ----
  // get(row) reads a retrieval-llm summary row; `pct` values are stored as
  // fractions/rates and multiplied by 100 for display.
  const METRICS = {
    accuracy:            { label: 'Accuracy (%)',          pct: true,  get: (r) => r.metrics.accuracy },
    accuracy_in_scope:   { label: 'In-Scope Accuracy (%)', pct: true,  get: (r) => r.metrics.accuracy_in_scope },
    accuracy_oos:        { label: 'OOS Accuracy (%)',      pct: true,  get: (r) => r.metrics.accuracy_oos },
    avg_llm_call_count:  { label: 'Avg LLM Calls/Sample',  pct: false, get: (r) => r.metrics.avg_llm_call_count },
    avg_llm_token_usage: { label: 'Avg Tokens/Sample',     pct: false, get: (r) => r.metrics.avg_llm_token_usage },
    timing_mean:         { label: 'Avg Time/Sample (s)',   pct: false, get: (r) => (r.timing ? r.timing.mean : null) },
    total_runtime:       { label: 'Total Runtime (s)',     pct: false, get: (r) => r.total_runtime },
    truncation_rate:     { label: 'Truncation Rate (%)',   pct: true,  get: (r) => r.truncation_rate },
  };
  const METRIC_GROUPS = [
    { group: 'Quality',            keys: ['accuracy', 'accuracy_in_scope', 'accuracy_oos'] },
    { group: 'Cost & efficiency',  keys: ['avg_llm_call_count', 'avg_llm_token_usage', 'timing_mean', 'total_runtime'] },
    { group: 'Reliability',        keys: ['truncation_rate'] },
  ];
  const LOWER_BETTER = new Set(['avg_llm_call_count', 'avg_llm_token_usage', 'timing_mean', 'total_runtime', 'truncation_rate']);

  // ---- Data accessors -------------------------------------------------------
  function llmRows(machineJson) {
    return (DASHBOARD_DATA.retrievalLlm || []).filter((r) => r.machine === machineJson);
  }
  function allarmaRows(machineJson) {
    return (DASHBOARD_DATA.retrievalAllarma || []).filter((r) => r.machine === machineJson);
  }
  function familyOf(row) { return STRATEGY_FAMILY(row.strategy, row.benchmark); }
  function modelDisplay(model) { return (MODEL_DISPLAY[model] || model); }
  function modelColor(model) { return (MODEL_COLORS[model] || '#90a4ae'); }
  function isReasoning(model) { return REASONING_MODELS.has(model); }
  function activeModels() { return MODEL_ORDER.filter((m) => state.models[m]); }

  // =========================================================================
  // C1 — Control bar + state + LLM legend
  // =========================================================================
  function renderControls() {
    const container = document.getElementById('retrieval-container');
    if (!container) return;

    const sk = llmRows('skorge');
    const al = allarmaRows('skorge');
    const augCount = new Set(sk.filter((r) => familyOf(r) === 'aug').map((r) => r.strategy)).size;
    const pureCount = new Set(sk.filter((r) => familyOf(r) === 'pure').map((r) => r.strategy)).size;
    const baseCount = new Set(al.map((r) => r.strategy)).size;

    container.innerHTML = `
      <p class="section-desc">81 retrieval strategies (${baseCount} LLM-free · ${augCount} LLM-augmented ·
        ${pureCount} pure-LLM) on 9,789 difficulty-tiered samples; the 23 LLM strategies run across all 9 models.</p>

      <div class="filterbar" id="ret-filterbar">
        <div class="fg">
          <span class="lbl">Machine</span>
          <div class="seg" id="ret-machine">
            <button data-m="skorge">SKORGE</button>
            <button data-m="dgx">DGX Spark</button>
            <button data-m="cmp">Compare Δ</button>
          </div>
        </div>
        <div class="fg" id="ret-families">
          <span class="lbl">Families</span>
          <label class="fam" data-f="base"><input type="checkbox" data-f="base"> Non-LLM baselines <span class="cnt">(${baseCount})</span></label>
          <label class="fam" data-f="aug"><input type="checkbox" data-f="aug"> LLM-augmented <span class="cnt">(${augCount})</span></label>
          <label class="fam" data-f="pure"><input type="checkbox" data-f="pure"> Pure-LLM <span class="cnt">(${pureCount})</span></label>
        </div>
        <div class="fg" style="margin-left:auto">
          <span class="lbl">View</span>
          <div class="seg alt" id="ret-view">
            <button data-v="chart">Chart</button>
            <button data-v="table">Table</button>
          </div>
        </div>
      </div>

      <div class="fg" style="align-items:flex-start">
        <span class="lbl" style="padding-top:4px">LLMs</span>
        <div class="legend" id="ret-legend"></div>
      </div>

      <div id="ret-body" style="margin-top:1rem"></div>
      <p class="hint" id="ret-foot" style="font-size:.74rem;color:#979797;font-weight:600;margin-top:.6rem"></p>

      <div id="ret-subcharts" style="margin-top:1.6rem"></div>
    `;

    container.querySelectorAll('#ret-machine button').forEach((b) => {
      b.addEventListener('click', () => { state.machine = b.dataset.m; syncControls(); renderRetrieval(); });
    });
    container.querySelectorAll('#ret-view button').forEach((b) => {
      b.addEventListener('click', () => { state.view = b.dataset.v; syncControls(); renderRetrieval(); });
    });
    container.querySelectorAll('#ret-families input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => { state.fams[cb.dataset.f] = cb.checked; syncControls(); renderRetrieval(); });
    });

    renderLegend();
    syncControls();
  }

  function renderLegend() {
    const leg = document.getElementById('ret-legend');
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
        renderRetrieval();
      });
    });
  }

  function syncControls() {
    const container = document.getElementById('retrieval-container');
    if (!container) return;
    container.querySelectorAll('#ret-machine button').forEach((b) =>
      b.classList.toggle('on', b.dataset.m === state.machine));
    container.querySelectorAll('#ret-view button').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === state.view));
    container.querySelectorAll('#ret-families label.fam').forEach((lab) => {
      const on = state.fams[lab.dataset.f];
      lab.classList.toggle('on', on);
      const cb = lab.querySelector('input');
      if (cb) cb.checked = on;
    });
  }

  // =========================================================================
  // renderRetrieval — dispatch on machine + view (C2/C3/C4 fill the body).
  // =========================================================================
  function renderRetrieval() {
    const body = document.getElementById('ret-body');
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
    const foot = document.getElementById('ret-foot');
    if (!foot) return;
    const nMod = activeModels().length;
    if (state.machine === 'cmp') {
      foot.innerHTML = 'Compare Δ = DGX − SKORGE accuracy (pp). Cells off the diagonal by &gt;3 pp drawn red. ' +
        'Families + legend still filter. <b>logs ↗</b> per row opens the eval in the InspectAI viewer.';
    } else {
      const fams = Object.keys(state.fams).filter((f) => state.fams[f]).map((f) => FAM_LABEL[f]).join(', ') || 'none';
      foot.innerHTML = `Machine <b>${MACHINE_LABEL[state.machine]}</b> · families: ${fams} · ` +
        `<b>${nMod}</b> of 9 LLMs · grouped bars (accuracy can’t be stacked); baselines have no LLM axis → single grey bar. ` +
        '<b>logs ↗</b> per row in Table view.';
    }
  }

  // =========================================================================
  // C2 — Chart view: Plotly multi-model grouped horizontal bars + metric select
  // =========================================================================
  // The metric <select> lives ATOP the chart and ONLY in Chart view (design §4.1).
  function metricSelectHTML() {
    const opts = METRIC_GROUPS.map((g) => {
      const inner = g.keys.map((k) =>
        `<option value="${k}"${k === state.metric ? ' selected' : ''}>${METRICS[k].label}</option>`).join('');
      return `<optgroup label="${g.group}">${inner}</optgroup>`;
    }).join('');
    return `<div class="fg" style="margin-bottom:.6rem"><span class="lbl">Metric</span>` +
      `<select class="ctl" id="ret-metric">${opts}</select></div>`;
  }

  // Value for (strategy, model, machine); pct metrics scaled ×100. null if missing.
  function metricVal(row, key) {
    const def = METRICS[key];
    const v = def.get(row);
    if (v === null || v === undefined) return null;
    return def.pct ? v * 100 : v;
  }

  // Strategies in selected families, ordered by best active-model value (desc for
  // higher-better, asc for lower-better), family-grouped (aug, pure, base) so the
  // y-axis reads coherently. Returns [{strategy, fam}].
  function orderedStrategies(machineJson, key) {
    const llm = llmRows(machineJson);
    const al = allarmaRows(machineJson);
    const lower = LOWER_BETTER.has(key);
    const out = [];

    ['aug', 'pure'].forEach((fam) => {
      if (!state.fams[fam]) return;
      const strats = [...new Set(llm.filter((r) => familyOf(r) === fam).map((r) => r.strategy))];
      const scored = strats.map((s) => {
        const vals = activeModels()
          .map((m) => llm.find((r) => r.strategy === s && r.model === m))
          .filter(Boolean).map((r) => metricVal(r, key)).filter((v) => v !== null);
        const score = vals.length ? (lower ? Math.min(...vals) : Math.max(...vals)) : (lower ? Infinity : -Infinity);
        return { strategy: s, fam, score };
      });
      scored.sort((a, b) => (lower ? a.score - b.score : b.score - a.score));
      out.push(...scored);
    });

    if (state.fams.base) {
      const strats = [...new Set(al.map((r) => r.strategy))];
      const scored = strats.map((s) => {
        const r = al.find((x) => x.strategy === s);
        return { strategy: s, fam: 'base', score: r ? metricVal(r, key) : null };
      });
      scored.sort((a, b) => (lower ? (a.score ?? Infinity) - (b.score ?? Infinity) : (b.score ?? -Infinity) - (a.score ?? -Infinity)));
      out.push(...scored);
    }
    return out;
  }

  function renderChart(body) {
    body.innerHTML = metricSelectHTML() + '<div id="retrieval-chart" style="min-height:480px"></div>';
    const sel = document.getElementById('ret-metric');
    if (sel) sel.addEventListener('change', () => { state.metric = sel.value; renderChart(body); });

    const machineJson = MACHINE_JSON[state.machine];
    const key = state.metric;
    const ordered = orderedStrategies(machineJson, key);
    const chartDiv = document.getElementById('retrieval-chart');

    if (!ordered.length) {
      chartDiv.innerHTML = '<p class="hint" style="padding:1rem">No strategies selected — enable a family.</p>';
      return;
    }

    // Plotly draws horizontal bars bottom-up; reverse so the best is at the top.
    const yCats = ordered.map((o) => o.strategy).reverse();
    const llm = llmRows(machineJson);
    const al = allarmaRows(machineJson);
    const def = METRICS[key];
    const fmt = (v) => (v === null ? '' : (def.pct ? v.toFixed(2) + '%' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2))));

    const traces = [];
    // One trace per active model for aug+pure strategies.
    activeModels().forEach((model) => {
      const xs = [], texts = [], hovers = [];
      yCats.forEach((strategy) => {
        const o = ordered.find((x) => x.strategy === strategy);
        if (!o || o.fam === 'base') { xs.push(null); texts.push(''); hovers.push(''); return; }
        const row = llm.find((r) => r.strategy === strategy && r.model === model);
        const v = row ? metricVal(row, key) : null;
        xs.push(v);
        texts.push(fmt(v));
        hovers.push(row ? `<b>${strategy}</b><br>${modelDisplay(model)}<br>${def.label}: ${fmt(v)}` : '');
      });
      traces.push({
        name: modelDisplay(model), type: 'bar', orientation: 'h',
        x: xs, y: yCats, marker: { color: modelColor(model) },
        text: texts, textposition: 'outside', textfont: { size: 9 },
        hovertext: hovers, hoverinfo: 'text', cliponaxis: false,
      });
    });
    // Single grey trace for baselines (no model axis).
    if (state.fams.base) {
      const xs = [], texts = [], hovers = [];
      yCats.forEach((strategy) => {
        const o = ordered.find((x) => x.strategy === strategy);
        if (!o || o.fam !== 'base') { xs.push(null); texts.push(''); hovers.push(''); return; }
        const row = al.find((r) => r.strategy === strategy);
        const v = row ? metricVal(row, key) : null;
        xs.push(v); texts.push(fmt(v));
        hovers.push(row ? `<b>${strategy}</b><br>no LLM (baseline)<br>${def.label}: ${fmt(v)}` : '');
      });
      traces.push({
        name: 'Non-LLM baseline', type: 'bar', orientation: 'h',
        x: xs, y: yCats, marker: { color: '#90a4ae' },
        text: texts, textposition: 'outside', textfont: { size: 9 },
        hovertext: hovers, hoverinfo: 'text', cliponaxis: false,
      });
    }

    const layout = {
      barmode: 'group', bargap: 0.25, bargroupgap: 0.05,
      height: Math.max(360, yCats.length * Math.max(activeModels().length, 1) * 9 + 120),
      margin: { l: 230, r: 70, t: 30, b: 40 },
      xaxis: { title: def.label, automargin: true, zeroline: true },
      yaxis: { automargin: true, tickfont: { family: 'ui-monospace, monospace', size: 10 } },
      legend: { orientation: 'h', y: 1.04, font: { size: 10 } },
      font: { family: 'Manrope, sans-serif' },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('retrieval-chart', traces, layout, { responsive: true, displayModeBar: false });

    // Bar click → log drawer (C6 wires openLogDrawer).
    chartDiv.removeAllListeners && chartDiv.removeAllListeners('plotly_click');
    chartDiv.on && chartDiv.on('plotly_click', (ev) => {
      const pt = ev.points && ev.points[0]; if (!pt) return;
      const strategy = pt.y;
      const o = ordered.find((x) => x.strategy === strategy);
      if (!o) return;
      if (o.fam === 'base') {
        const row = al.find((r) => r.strategy === strategy);
        if (row) openDrawerForRow(row, null);
      } else {
        const model = Object.keys(MODEL_DISPLAY).find((m) => modelDisplay(m) === pt.data.name);
        const row = llm.find((r) => r.strategy === strategy && r.model === model);
        if (row) openDrawerForRow(row, model);
      }
    });
  }

  // Drawer payload builder — wired to window.openLogDrawer in C6. Stubbed safe.
  function openDrawerForRow(row, model) {
    if (typeof buildDrawerPayloadAndOpen === 'function') buildDrawerPayloadAndOpen(row, model);
  }
  let buildDrawerPayloadAndOpen = null; // set in C6

  // =========================================================================
  // C3 — Table view: comprehensive sortable DataTable + CSV + completed/total
  // =========================================================================
  let retDataTable = null;

  // Build the flat row list (respecting families + legend), aug/pure expanded
  // per active model, baselines single-row. Each entry carries the source row
  // so CSV + drawer can read every metric.
  function tableRows() {
    const machineJson = MACHINE_JSON[state.machine];
    const llm = llmRows(machineJson);
    const al = allarmaRows(machineJson);
    const ordered = orderedStrategies(machineJson, 'accuracy'); // family-grouped order
    const rows = [];
    ordered.forEach((o) => {
      if (o.fam === 'base') {
        const r = al.find((x) => x.strategy === o.strategy);
        if (r) rows.push({ src: r, model: null, fam: 'base' });
      } else {
        activeModels().forEach((m) => {
          const r = llm.find((x) => x.strategy === o.strategy && x.model === m);
          if (r) rows.push({ src: r, model: m, fam: o.fam });
        });
      }
    });
    return rows;
  }

  function num(v, d) { return (v === null || v === undefined) ? '—' : Number(v).toFixed(d); }
  function pct(v, d) { return (v === null || v === undefined) ? '—' : (Number(v) * 100).toFixed(d); }

  function renderTable(body) {
    if (retDataTable) { try { retDataTable.destroy(); } catch (e) {} retDataTable = null; }
    body.innerHTML =
      '<div style="margin-bottom:.6rem"><button class="btn-small" id="ret-csv">Export CSV</button></div>' +
      '<div class="tablewrap"><table id="retrieval-table" class="display" style="width:100%"></table></div>';

    const rows = tableRows();
    const m = state.machine; // for buildLogUrl benchmark/category
    const dataset = rows.map((entry) => {
      const r = entry.src;
      const me = r.metrics || {};
      const url = buildLogUrl(r.model_folder, r.eval_file, r.benchmark);
      const stratCell = `<a href="${url}" target="_blank" rel="noopener" title="Open eval in InspectAI viewer">${r.strategy}</a>`;
      const modelCell = entry.model ? modelDisplay(entry.model) + (isReasoning(entry.model) ? ' ✦' : '')
        : '<span style="color:#607d8b;font-style:italic">no LLM</span>';
      const isBase = entry.fam === 'base';
      const accSE = `${pct(me.accuracy, 2)} ± ${me.accuracy_se != null ? (me.accuracy_se * 100).toFixed(2) : '—'}`;
      const calls = isBase ? '—' : num(me.avg_llm_call_count, 2);
      const tok = isBase ? '—' : (me.avg_llm_token_usage != null ? Math.round(me.avg_llm_token_usage).toLocaleString() : '—');
      const tmean = r.timing && r.timing.mean != null ? r.timing.mean.toFixed(2) : '—';
      const runtime = r.total_runtime != null ? formatRuntime(r.total_runtime) : '—';
      const trunc = num(r.truncation_rate != null ? r.truncation_rate * 100 : null, 2);
      const completed = `${(r.completed_samples != null ? r.completed_samples : r.samples).toLocaleString()} / ${r.samples.toLocaleString()}`;
      const shortRun = (r.completed_samples != null && r.completed_samples < r.samples);
      return [
        stratCell, modelCell,
        accSE, pct(me.accuracy_in_scope, 2), pct(me.accuracy_oos, 2),
        calls, tok, tmean, runtime,
        trunc,
        shortRun ? `<b style="color:#c5384a" title="short run">${completed}</b>` : completed,
      ];
    });

    retDataTable = new DataTable('#retrieval-table', {
      data: dataset,
      columns: [
        { title: 'Strategy' }, { title: 'Model' },
        { title: 'Accuracy ± SE' }, { title: 'In-Scope' }, { title: 'OOS' },
        { title: 'LLM Calls' }, { title: 'Avg Tokens' }, { title: 'Avg Time/Sample (s)' }, { title: 'Total Runtime' },
        { title: 'Trunc %' }, { title: 'Completed / Total' },
      ],
      order: [[2, 'desc']],
      pageLength: 25,
      scrollX: true,
      deferRender: true,
    });

    const csvBtn = document.getElementById('ret-csv');
    if (csvBtn) csvBtn.addEventListener('click', () => exportTableCSV(rows));
  }

  function exportTableCSV(rows) {
    const data = rows.map((e) => e.src && Object.assign({ __model: e.model, __fam: e.fam }, e.src));
    exportJSONToCSV(data, [
      { label: 'Machine', accessor: 'machine' },
      { label: 'Strategy', accessor: 'strategy' },
      { label: 'Model', accessor: (r) => (r.__model ? modelDisplay(r.__model) : 'no-LLM-baseline') },
      { label: 'Accuracy', accessor: (r) => (r.metrics.accuracy != null ? (r.metrics.accuracy * 100).toFixed(4) : '') },
      { label: 'Accuracy_SE', accessor: (r) => (r.metrics.accuracy_se != null ? (r.metrics.accuracy_se * 100).toFixed(4) : '') },
      { label: 'In_Scope', accessor: (r) => (r.metrics.accuracy_in_scope != null ? (r.metrics.accuracy_in_scope * 100).toFixed(4) : '') },
      { label: 'OOS', accessor: (r) => (r.metrics.accuracy_oos != null ? (r.metrics.accuracy_oos * 100).toFixed(4) : '') },
      { label: 'Avg_LLM_Calls', accessor: (r) => (r.metrics.avg_llm_call_count != null ? r.metrics.avg_llm_call_count.toFixed(4) : '') },
      { label: 'Avg_Tokens', accessor: (r) => (r.metrics.avg_llm_token_usage != null ? r.metrics.avg_llm_token_usage.toFixed(2) : '') },
      { label: 'Avg_Time_Per_Sample_s', accessor: (r) => (r.timing && r.timing.mean != null ? r.timing.mean.toFixed(4) : '') },
      { label: 'Total_Runtime_s', accessor: (r) => (r.total_runtime != null ? r.total_runtime.toFixed(1) : '') },
      { label: 'Truncation_Rate_pct', accessor: (r) => (r.truncation_rate != null ? (r.truncation_rate * 100).toFixed(4) : '') },
      { label: 'Completed', accessor: (r) => (r.completed_samples != null ? r.completed_samples : r.samples) },
      { label: 'Total_Samples', accessor: 'samples' },
    ], `retrieval-${state.machine}.csv`);
  }
  function renderCompareScatter(body) { body.innerHTML = '<div class="chartbox">Compare scatter (C4).</div>'; }
  function renderCompareTable(body) { body.innerHTML = '<div class="chartbox">Compare table (C4).</div>'; }
  function renderSubcharts() { /* C5 */ }

  // ---- Entry point ----------------------------------------------------------
  function initRetrievalSection() {
    if (!window.DASHBOARD_DATA || !DASHBOARD_DATA.loaded) return;
    renderControls();
    renderRetrieval();
  }

  if (typeof window !== 'undefined') {
    window.initRetrievalSection = initRetrievalSection;
  }
})();
