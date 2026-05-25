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

  // Stubs filled by D2/D3 so D1 renders cleanly on its own.
  function renderChart(body) { body.innerHTML = '<p class="hint" style="padding:1rem">Chart — D2.</p>'; }
  function renderTable(body) { body.innerHTML = '<p class="hint" style="padding:1rem">Table — D2.</p>'; }
  function renderCompareScatter(body) { body.innerHTML = '<p class="hint" style="padding:1rem">Compare scatter — D3.</p>'; }
  function renderCompareTable(body) { body.innerHTML = '<p class="hint" style="padding:1rem">Compare table — D3.</p>'; }
  function renderSubcharts() { /* heatmap — D3 */ }

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
