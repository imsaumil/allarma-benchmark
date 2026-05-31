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
    expanded: { aug: false, pure: false, base: false }, // per-family expand toggle (single-machine views)
  };
  MODEL_ORDER.forEach((m) => { state.models[m] = true; });

  // Display order of family subsections (LLM-augmented, Pure-LLM, then baselines last).
  const FAM_ORDER = ['base', 'aug', 'pure'];   // order matches the Families checkboxes

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
          <span class="lbl">View</span>
          <div class="seg alt" id="ret-view">
            <button data-v="chart">Chart</button>
            <button data-v="table">Table</button>
          </div>
        </div>
        <div class="fg" style="margin:0 auto">
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
      </div>

      <div class="fg" style="align-items:flex-start">
        <span class="lbl" style="padding-top:4px">LLMs</span>
        <div class="legend" id="ret-legend"></div>
      </div>

      <div id="ret-body" style="margin-top:1rem"></div>
      <p class="hint" id="ret-foot" style="font-size:.8rem;color:#979797;font-weight:600;margin-top:.6rem"></p>

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
        'Families + legend still filter. Click any strategy name to open the eval in the InspectAI viewer.';
    } else {
      const fams = Object.keys(state.fams).filter((f) => state.fams[f]).map((f) => FAM_LABEL[f]).join(', ') || 'none';
      foot.innerHTML = `Machine <b>${MACHINE_LABEL[state.machine]}</b> · families: ${fams} · ` +
        `<b>${nMod}</b> of 9 LLMs · grouped bars (accuracy can’t be stacked); baselines have no LLM axis → single grey bar. ` +
        'Click any strategy name in Table view to open its eval in the InspectAI viewer.';
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
    return `<div class="fg" style="margin-bottom:.7rem"><span class="lbl">View metric</span>` +
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
    const out = [];
    ['aug', 'pure', 'base'].forEach((fam) => {
      if (!state.fams[fam]) return;
      out.push(...orderedStrategiesForFamily(machineJson, key, fam));
    });
    return out;
  }

  // Sorted [{strategy, fam, score}] for ONE family (same logic as orderedStrategies),
  // used by the per-family subsections so each scroll container is ranked by metric.
  function orderedStrategiesForFamily(machineJson, key, fam) {
    const lower = LOWER_BETTER.has(key);
    if (fam === 'base') {
      const al = allarmaRows(machineJson);
      const strats = [...new Set(al.map((r) => r.strategy))];
      const scored = strats.map((s) => {
        const r = al.find((x) => x.strategy === s);
        return { strategy: s, fam: 'base', score: r ? metricVal(r, key) : null };
      });
      scored.sort((a, b) => (lower ? (a.score ?? Infinity) - (b.score ?? Infinity) : (b.score ?? -Infinity) - (a.score ?? -Infinity)));
      return scored;
    }
    const llm = llmRows(machineJson);
    const strats = [...new Set(llm.filter((r) => familyOf(r) === fam).map((r) => r.strategy))];
    const scored = strats.map((s) => {
      const vals = activeModels()
        .map((m) => llm.find((r) => r.strategy === s && r.model === m))
        .filter(Boolean).map((r) => metricVal(r, key)).filter((v) => v !== null);
      const score = vals.length ? (lower ? Math.min(...vals) : Math.max(...vals)) : (lower ? Infinity : -Infinity);
      return { strategy: s, fam, score };
    });
    scored.sort((a, b) => (lower ? a.score - b.score : b.score - a.score));
    return scored;
  }

  // Bar value-label / hover formatter shared across family charts:
  // pct → 2 dp (e.g. '95.11'), counts & tokens → thousands separators,
  // time/other floats → 2 dp. (Requirement: per-bar value labels, item 2.)
  function fmtMetric(v, def) {
    if (v === null || v === undefined) return '';
    if (def.pct) return v.toFixed(2);
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
    return v.toFixed(2);
  }

  // ---- Chart view: shared metric dropdown atop three per-family subsections ----
  function renderChart(body) {
    const machineJson = MACHINE_JSON[state.machine];
    const key = state.metric;
    const fams = FAM_ORDER.filter((f) => state.fams[f]);

    // Subsection scaffold: one .fam-sub per active family.
    let html = metricSelectHTML();
    if (!fams.length) {
      html += '<p class="hint" style="padding:1rem">No strategies selected — enable a family.</p>';
      body.innerHTML = html;
      bindMetricSelect(body);
      return;
    }
    fams.forEach((fam) => {
      const n = orderedStrategiesForFamily(machineJson, key, fam).length;
      const expCls = state.expanded[fam] ? ' expanded' : '';
      const btn = state.expanded[fam] ? 'Collapse' : 'Expand';
      html += `<div class="fam-sub" data-fam="${fam}">
        <div class="fam-sub-head">
          <h3>${FAM_LABEL[fam]} (${n})</h3>
          <button class="expand-btn" data-expfam="${fam}">${btn}</button>
        </div>
        <div class="fam-scroll chart-scroll${expCls}" data-famscroll="${fam}">
          <div class="fam-chart" id="ret-chart-${fam}"></div>
        </div>
      </div>`;
    });
    body.innerHTML = html;
    bindMetricSelect(body);

    fams.forEach((fam) => renderFamilyChart(machineJson, key, fam));

    // Expand / collapse toggles (re-render so the cap re-applies cleanly).
    body.querySelectorAll('.expand-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const f = b.dataset.expfam;
        state.expanded[f] = !state.expanded[f];
        renderChart(body);
      });
    });
  }

  function bindMetricSelect(body) {
    const sel = document.getElementById('ret-metric');
    if (sel) sel.addEventListener('change', () => { state.metric = sel.value; renderChart(body); });
  }

  // One family's horizontal grouped-bar chart. aug/pure → one trace per active
  // model; base → single grey trace. Height scales so ALL strategies are drawn
  // (the .fam-scroll cap reveals ~5 then scrolls).
  function renderFamilyChart(machineJson, key, fam) {
    const chartDiv = document.getElementById('ret-chart-' + fam);
    if (!chartDiv) return;
    const ordered = orderedStrategiesForFamily(machineJson, key, fam);
    const def = METRICS[key];
    const fmt = (v) => fmtMetric(v, def);

    // ---- Rich hover tooltip ----
    // Layout: <strategy> / <model · machine · family> / <selected metric (bold)> / <context: 2-3 key alternate metrics> / <samples>
    // Context metrics are skipped when they ARE the selected metric (no redundancy).
    const machineLabel = MACHINE_LABEL[state.machine] || machineJson;
    const famLabel = FAM_LABEL[fam] || fam;
    const cleanLabel = def.label.replace(/ ?\(%\)$/, '');                 // 'Accuracy (%)' → 'Accuracy'
    const buildHover = (row, val, modelLabel) => {
      const valStr = def.pct ? `${fmt(val)}%` : fmt(val);
      const ctx = [];
      // Context-line items at the very end (Tokens last, per user). Acc only if not the selected metric.
      if (row.metrics && row.metrics.accuracy != null && key !== 'accuracy') {
        ctx.push(`<b>Acc:</b> ${(row.metrics.accuracy * 100).toFixed(2)}%`);
      }
      if (row.truncation_rate != null && row.truncation_rate > 0 && key !== 'truncation_rate') {
        ctx.push(`<b>Trunc:</b> ${(row.truncation_rate * 100).toFixed(2)}%`);
      }
      if (row.metrics && row.metrics.avg_llm_token_usage != null && key !== 'avg_llm_token_usage') {
        ctx.push(`<b>Tokens:</b> ${Math.round(row.metrics.avg_llm_token_usage).toLocaleString()}`);
      }
      const shortRun = (row.completed_samples != null && row.samples != null && row.completed_samples !== row.samples)
        ? `${row.completed_samples.toLocaleString()} / ${row.samples.toLocaleString()} completed`
        : '';
      // Shared labeled-row order across all 3 families: Strategy / Family / [Model] / Machine / <selected metric> / Latency.
      // Family sits right after Strategy on every family (matching baseline); Model slots in only for LLM/Pure.
      // LLM/Pure additionally append a context line at the end (Tokens, optional Trunc/Acc).
      const isBase = fam === 'base';
      const latencyRow = (row.timing && row.timing.mean != null && key !== 'timing_mean')
        ? `<b>Latency:</b> ${row.timing.mean.toFixed(2)} s` : null;
      const lines = [
        `<b>Strategy:</b> ${row.strategy}`,
        `<b>Family:</b> ${famLabel}`,
        isBase ? null : `<b>Model:</b> ${modelLabel}`,
        `<b>Machine:</b> ${machineLabel}`,
        `<b>${cleanLabel}:</b> <b>${valStr}</b>`,
        latencyRow,
      ];
      if (ctx.length) lines.push(ctx.join(' · '));
      if (shortRun) lines.push(`<i>${shortRun}</i>`);
      return lines.filter(Boolean).join('<br>');
    };

    if (!ordered.length) {
      chartDiv.innerHTML = '<p class="hint" style="padding:1rem">No strategies in this family.</p>';
      return;
    }

    // Plotly draws horizontal bars bottom-up; reverse so the best is at the top.
    const yCatsAll = ordered.map((o) => o.strategy).reverse();
    const llm = llmRows(machineJson);
    const al = allarmaRows(machineJson);
    const models = activeModels();
    const isBase = fam === 'base';

    // ---- Skip-zero rule (per user, 2026-05-31) -------------------------------------
    // (a) Drop strategy rows where every (active-model) bar would be 0 or null on the selected metric.
    // (b) Within surviving rows, hide individual 0/null bars (set x=null so Plotly draws nothing).
    // (c) If the family collapses to zero rows, show a diagnostic message panel instead of an empty plot.
    const yCats = yCatsAll.filter((strategy) => {
      if (isBase) {
        const row = al.find((r) => r.strategy === strategy);
        const v = row ? metricVal(row, key) : null;
        return v != null && v !== 0;
      }
      return models.some((m) => {
        const row = llm.find((r) => r.strategy === strategy && r.model === m);
        const v = row ? metricVal(row, key) : null;
        return v != null && v !== 0;
      });
    });

    if (yCats.length === 0) {
      const subject = isBase ? 'Non-LLM baselines'
        : (fam === 'aug' ? 'LLM-augmented strategies' : 'pure-LLM strategies');
      const baseHints = {
        accuracy_oos: 'baselines do not perform OOS detection; they always retrieve from the in-scope corpus.',
        truncation_rate: 'baselines do not generate text with an LLM, so nothing can truncate.',
        avg_llm_token_usage: 'baselines do not call an LLM, so token usage is zero.',
        avg_llm_call_count: 'baselines do not call an LLM, so the call count is zero.',
      };
      const llmHints = {
        accuracy_oos: 'no active model measured above zero on OOS for any strategy in this family. Try enabling more models or selecting a different metric.',
      };
      const cause = (isBase ? baseHints : llmHints)[key];
      const msg = `No ${subject} have non-zero ${cleanLabel} for the current selection`
        + (cause ? ` — ${cause}` : '.');
      chartDiv.innerHTML =
        `<div style="padding:1.25rem 1.5rem;margin:.4rem 0;color:#555;font-style:italic;`
        + `border:1px dashed #CBD5E1;border-radius:.5rem;background:#fafbfc;text-align:center;line-height:1.55">`
        + msg + '</div>';
      return;
    }

    // (d) LLM-only refinement of the skip-zero rule: also drop *entire* model traces that have
    // zero non-null bars across every surviving row. Without this, models that score 0 across
    // the whole chart still reserve slot height — the strategy y-label centers on a band sized
    // for 9 bars while only ~5 are drawn, pushing the label off-centre relative to the visible
    // bars and inflating row gap. Defaults are unchanged: if every active model has ≥1 non-zero
    // bar on the selected metric, keptModels === models.
    const keptModels = isBase ? null : models.filter((m) =>
      yCats.some((strategy) => {
        const row = llm.find((r) => r.strategy === strategy && r.model === m);
        const v = row ? metricVal(row, key) : null;
        return v != null && v !== 0;
      }),
    );

    const traces = [];
    let nSeries;
    if (isBase) {
      nSeries = 1;
      const xs = [], texts = [], hovers = [];
      yCats.forEach((strategy) => {
        const row = al.find((r) => r.strategy === strategy);
        let v = row ? metricVal(row, key) : null;
        if (v === 0) v = null;                                                // per-bar skip
        xs.push(v); texts.push(v == null ? '' : fmt(v));
        hovers.push((v != null && row) ? buildHover(row, v, 'Non-LLM baseline') : '');
      });
      traces.push({
        name: 'Non-LLM baseline', type: 'bar', orientation: 'h',
        x: xs, y: yCats, marker: { color: '#90a4ae' },
        text: texts, textposition: 'outside', textfont: { size: 15, family: 'Manrope', color: '#1C1C1C' },
        hovertext: hovers, hoverinfo: 'text', cliponaxis: false, constraintext: 'none',
      });
    } else {
      // ---- Tight-pack rewrite (per user, 2026-05-31) ----------------------------------
      // Replaces barmode='group' (which reserves a slot per kept-model in EVERY row,
      // leaving a visible blank when that model is 0% on this particular row) with
      // barmode='overlay' + custom y positions. Each row owns a y-band [i - 0.4, i + 0.4];
      // only the non-zero bars for that row are positioned within the band, stacked
      // top-to-bottom in MODEL_ORDER (= chip order). No blanks, no data loss — a model
      // absent from a row corresponds to a measured 0% (confirmable via hover on the
      // same model in another row, or via the log drawer).
      const perRow = yCats.map((strategy, i) => {
        const bars = [];
        models.forEach((m) => {
          const row = llm.find((r) => r.strategy === strategy && r.model === m);
          const v = row ? metricVal(row, key) : null;
          if (v != null && v !== 0) bars.push({ model: m, row, v });
        });
        return { strategy, i, bars };
      });

      const maxBarsPerRow = perRow.reduce((mx, r) => Math.max(mx, r.bars.length), 1);
      nSeries = maxBarsPerRow;                                              // used for height scaling below

      const bandHalf = 0.4;                                                 // row band y ∈ [i-0.4, i+0.4]; 0.2 inter-row gap
      keptModels.forEach((model) => {
        const xs = [], ys = [], widths = [], texts = [], hovers = [], customs = [];
        perRow.forEach(({ strategy, i, bars }) => {
          const idx = bars.findIndex((b) => b.model === model);
          if (idx === -1) return;                                            // model is 0/null in this row → no bar
          const k = bars.length;
          const slotH = (2 * bandHalf) / k;
          // MODEL_ORDER[0] (gpt-oss-20b) sits at the TOP of the band: idx=0 → highest y.
          const y = i + bandHalf - (idx + 0.5) * slotH;
          const b = bars[idx];
          xs.push(b.v); ys.push(y); widths.push(slotH * 0.9);                /* 10% intra-row gap */
          texts.push(fmt(b.v));
          hovers.push(buildHover(b.row, b.v, modelDisplay(model)));
          customs.push(strategy);                                            // for click → log drawer
        });
        if (xs.length) {
          traces.push({
            name: modelDisplay(model), type: 'bar', orientation: 'h',
            x: xs, y: ys, width: widths,
            marker: { color: modelColor(model) },
            customdata: customs,
            text: texts, textposition: 'outside', textfont: { size: 15, family: 'Manrope', color: '#1C1C1C' },
            hovertext: hovers, hoverinfo: 'text', cliponaxis: false, constraintext: 'none',
          });
        }
      });
    }

    const layout = {
      barmode: isBase ? 'group' : 'overlay',                                /* LLM/Pure use overlay so tight-pack y-positions render adjacently */
      bargap: 0.25, bargroupgap: 0.18,                                      /* group params still affect baseline single-trace spacing */
      height: Math.max(180, yCats.length * nSeries * 20 + 120),             /* 20px/bar slot ≥ 15px label height → no vertical overlap */
      margin: { l: 300, r: 100, t: 20, b: 40 },                             /* fixed l/r: align y-axes across family charts + room for outside % labels */
      xaxis: { title: def.label, automargin: true, zeroline: true },
      yaxis: isBase ? {
        automargin: false,
        tickmode: 'array', tickvals: yCats, ticktext: yCats,                /* force EVERY strategy name to render (no Plotly auto-thinning) */
        tickfont: { family: 'ui-monospace, monospace', size: 13 },
      } : {
        automargin: false,
        tickmode: 'array',
        tickvals: yCats.map((_, i) => i),                                   /* tight-pack uses numeric y-positions */
        ticktext: yCats,
        range: [-0.5, yCats.length - 0.5],                                  /* keep all rows visible with half-band padding */
        tickfont: { family: 'ui-monospace, monospace', size: 13 },
      },
      showlegend: false,   /* model color key is the LLM legend chips above (no redundant chart legend) */
      font: { family: 'Manrope, sans-serif' },
      hoverlabel: {                                                          /* white tooltip card, consistent Manrope */
        bgcolor: '#ffffff', bordercolor: '#CBD5E1',
        font: { family: 'Manrope, sans-serif', size: 13, color: '#1C1C1C' },
        align: 'left',
      },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react(chartDiv, traces, layout, { responsive: true, displayModeBar: false });

    // Bar click → log drawer (C6 wires openLogDrawer).
    chartDiv.removeAllListeners && chartDiv.removeAllListeners('plotly_click');
    chartDiv.on && chartDiv.on('plotly_click', (ev) => {
      const pt = ev.points && ev.points[0]; if (!pt) return;
      // Baseline uses categorical y (pt.y = strategy name); LLM tight-pack uses
      // numeric y + customdata (pt.customdata = strategy name).
      const strategy = (pt.customdata != null) ? pt.customdata : pt.y;
      if (fam === 'base') {
        const row = al.find((r) => r.strategy === strategy);
        if (row) openDrawerForRow(row, null);
      } else {
        const model = Object.keys(MODEL_DISPLAY).find((m) => modelDisplay(m) === pt.data.name);
        const row = llm.find((r) => r.strategy === strategy && r.model === model);
        if (row) openDrawerForRow(row, model);
      }
    });
  }

  // =========================================================================
  // C6 — Drawer payload builder (all metrics for a model×strategy×machine row)
  // =========================================================================
  function openDrawerForRow(row, model) {
    if (!row || typeof window.openLogDrawer !== 'function') return;
    const me = row.metrics || {};
    const isBase = STRATEGY_FAMILY(row.strategy, row.benchmark) === 'base';
    const machineLabel = row.machine === 'dgx_spark' ? 'DGX Spark' : 'SKORGE';
    const f2 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
    const pctv = (v) => (v === null || v === undefined ? '—' : (Number(v) * 100).toFixed(2) + '%');

    const quality = [
      { label: 'Accuracy', value: `${pctv(me.accuracy)}${me.accuracy_se != null ? ' ± ' + (me.accuracy_se * 100).toFixed(2) : ''}` },
      { label: 'In-Scope Accuracy', value: pctv(me.accuracy_in_scope) },
      { label: 'OOS Accuracy', value: pctv(me.accuracy_oos) },
    ];
    const cost = [];
    if (!isBase) {
      cost.push({ label: 'Avg LLM Calls/Sample', value: f2(me.avg_llm_call_count) });
      cost.push({ label: 'Avg Tokens/Sample', value: me.avg_llm_token_usage != null ? Math.round(me.avg_llm_token_usage).toLocaleString() : '—' });
    }
    cost.push({ label: 'Avg Time/Sample', value: (row.timing && row.timing.mean != null ? row.timing.mean.toFixed(2) + ' s' : '—') });
    cost.push({ label: 'Total Runtime', value: row.total_runtime != null ? formatRuntime(row.total_runtime) : '—' });

    const completed = (row.completed_samples != null ? row.completed_samples : row.samples);
    const reliability = [
      { label: 'Truncation Rate', value: row.truncation_rate != null ? (row.truncation_rate * 100).toFixed(2) + '%' : '—' },
      { label: 'max_tokens', value: row.max_tokens == null ? 'None (unbounded)' : row.max_tokens },
      { label: 'Completed / Total', value: `${completed.toLocaleString()} / ${row.samples.toLocaleString()}` + (completed < row.samples ? ' (short run)' : '') },
    ];

    window.openLogDrawer({
      title: row.strategy + (model ? ' — ' + modelDisplay(model) : ' — no-LLM baseline'),
      machine: machineLabel,
      groups: [
        { group: 'Quality', rows: quality },
        { group: 'Cost & efficiency', rows: cost },
        { group: 'Reliability', rows: reliability },
      ],
      logUrl: buildLogUrl(row.model_folder, row.eval_file, row.benchmark),
    });
  }

  // =========================================================================
  // C3 — Table view: comprehensive sortable DataTable + CSV + completed/total
  // =========================================================================
  let retDataTables = [];
  function destroyTables() {
    retDataTables.forEach((t) => { try { t.destroy(); } catch (e) {} });
    retDataTables = [];
  }

  // Build the flat row list (respecting families + legend), aug/pure expanded
  // per active model, baselines single-row. Each entry carries the source row
  // so CSV + drawer can read every metric. `metric` drives the per-family sort
  // (defaults to accuracy, matching the prior table order).
  function tableRows(metric) {
    const machineJson = MACHINE_JSON[state.machine];
    const key = metric || 'accuracy';
    const llm = llmRows(machineJson);
    const al = allarmaRows(machineJson);
    const ordered = orderedStrategies(machineJson, key); // family-grouped order
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

  // Comprehensive-table column definitions (shared by every family table).
  const TABLE_COLUMNS = [
    { title: 'Strategy' }, { title: 'Model' },
    { title: 'Accuracy ± SE' }, { title: 'In-Scope' }, { title: 'OOS' },
    { title: 'LLM Calls' }, { title: 'Avg Tokens' }, { title: 'Avg Time/Sample (s)' }, { title: 'Total Runtime' },
    { title: 'Trunc %' }, { title: 'Completed / Total' },
  ];

  // One comprehensive table row (array of cells). The strategy name column is
  // already hyperlinked to the InspectAI viewer — no separate "logs" column needed.
  function tableRowCells(entry) {
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
  }

  // Table view: one comprehensive table per active family, each in a .fam-scroll
  // (default ~5 rows + scroll; Expand removes the cap). One shared Export CSV.
  function renderTable(body) {
    destroyTables();
    const fams = FAM_ORDER.filter((f) => state.fams[f]);

    // Single shared row list sorted by the chart metric for consistency with chart view.
    const rows = tableRows(state.metric);

    let html = '<div style="margin-bottom:.6rem"><button class="btn-small" id="ret-csv">Export CSV</button></div>';
    if (!fams.length) {
      html += '<p class="hint" style="padding:1rem">No strategies selected — enable a family.</p>';
      body.innerHTML = html;
      const csvBtn0 = document.getElementById('ret-csv');
      if (csvBtn0) csvBtn0.addEventListener('click', () => exportTableCSV(rows));
      return;
    }
    fams.forEach((fam) => {
      const n = rows.filter((e) => e.fam === fam).length;
      const expCls = state.expanded[fam] ? ' expanded' : '';
      const btn = state.expanded[fam] ? 'Collapse' : 'Expand';
      html += `<div class="fam-sub" data-fam="${fam}">
        <div class="fam-sub-head">
          <h3>${FAM_LABEL[fam]} (${n})</h3>
          <button class="expand-btn" data-expfam="${fam}">${btn}</button>
        </div>
        <div class="fam-scroll table-scroll${expCls}" data-famscroll="${fam}">
          <div class="tablewrap"><table id="retrieval-table-${fam}" class="display" style="width:100%"></table></div>
        </div>
      </div>`;
    });
    body.innerHTML = html;

    fams.forEach((fam) => {
      const dataset = rows.filter((e) => e.fam === fam).map(tableRowCells);
      const dt = new DataTable('#retrieval-table-' + fam, {
        data: dataset,
        columns: TABLE_COLUMNS,
        order: [[2, 'desc']],
        paging: false,
        info: false,
        searching: false,
        scrollX: true,
        deferRender: true,
      });
      retDataTables.push(dt);
      // Strategy-name hyperlink in column 0 opens the InspectAI viewer directly —
      // no drilldown logbtn needed (the previous trailing column was redundant).
    });

    // Expand / collapse toggles (re-render to re-apply the cap cleanly).
    body.querySelectorAll('.expand-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const f = b.dataset.expfam;
        state.expanded[f] = !state.expanded[f];
        renderTable(body);
      });
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
  // =========================================================================
  // C4 — Compare Δ view (scatter + delta table)
  // =========================================================================
  // cross-machine-deltas.json is retriever-LLM only (23 strategies × 9 models =
  // 207 rows). Δ = dgx_acc − sk_acc (pp). Families (aug/pure) + legend filter;
  // the base family has no per-machine LLM delta, so baselines are not shown here.
  function compareRows() {
    const all = DASHBOARD_DATA.crossMachineDeltas || [];
    return all.filter((d) => {
      const fam = STRATEGY_FAMILY(d.strategy, d.benchmark); // 'aug' | 'pure'
      if (!state.fams[fam]) return false;
      return state.models[d.model];
    });
  }

  function renderCompareScatter(body) {
    body.innerHTML = '<div id="retrieval-chart" style="min-height:480px"></div>';
    const rows = compareRows();
    const div = document.getElementById('retrieval-chart');
    if (!rows.length) {
      div.innerHTML = '<p class="hint" style="padding:1rem">No LLM cells selected — enable the LLM-augmented or Pure-LLM family and at least one model. (Baselines have no cross-machine LLM delta.)</p>';
      return;
    }

    const onDiag = rows.filter((d) => Math.abs(d.delta_pp) <= 3);
    const off = rows.filter((d) => Math.abs(d.delta_pp) > 3);
    const mk = (d) => ({ x: d.sk_acc * 100, y: d.dgx_acc * 100 });
    // Labeled key-value hover, matching the rest of the dashboard. Δ value bolded for emphasis.
    const hover = (d) => {
      const sign = d.delta_pp >= 0 ? '+' : '';
      const fam = STRATEGY_FAMILY(d.strategy, d.benchmark);
      return [
        `<b>Strategy:</b> ${d.strategy}`,
        `<b>Family:</b> ${FAM_LABEL[fam] || fam}`,
        `<b>Model:</b> ${modelDisplay(d.model)}${isReasoning(d.model) ? ' ✦' : ''}`,
        `<b>Metric:</b> Accuracy`,
        `<b>SKORGE:</b> ${(d.sk_acc * 100).toFixed(2)}%`,
        `<b>DGX Spark:</b> ${(d.dgx_acc * 100).toFixed(2)}%`,
        `<b>Δ:</b> <b>${sign}${d.delta_pp.toFixed(2)} pp</b>`,
      ].join('<br>');
    };

    const xs = rows.map((d) => d.sk_acc * 100).concat(rows.map((d) => d.dgx_acc * 100));
    const lo = Math.max(0, Math.floor(Math.min(...xs) - 2));
    const hi = Math.min(100, Math.ceil(Math.max(...xs) + 2));

    const traces = [
      { name: 'y = x (identical)', type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi],
        line: { color: '#1565c0', dash: 'dash', width: 1.5 }, hoverinfo: 'skip' },
      { name: '|Δ| ≤ 3 pp', type: 'scatter', mode: 'markers', x: onDiag.map((d) => mk(d).x), y: onDiag.map((d) => mk(d).y),
        marker: { color: '#1565c0', size: 8, opacity: 0.7 }, text: onDiag.map(hover), hoverinfo: 'text' },
      { name: '|Δ| > 3 pp', type: 'scatter', mode: 'markers+text', x: off.map((d) => mk(d).x), y: off.map((d) => mk(d).y),
        marker: { color: '#c5384a', size: 11, opacity: 0.9, line: { color: '#7a1f2b', width: 1 } },
        text: off.map((d) => `${modelDisplay(d.model)}/${d.strategy.replace(/_all$|_candidate$/, '')} (${d.delta_pp >= 0 ? '+' : ''}${d.delta_pp.toFixed(2)})`),
        textposition: 'middle right', textfont: { color: '#c5384a', size: 9 },
        hovertext: off.map(hover), hoverinfo: 'text' },
    ];
    const layout = {
      height: 520, margin: { l: 60, r: 40, t: 30, b: 55 },
      xaxis: { title: 'SKORGE Accuracy (%)', range: [lo, hi], zeroline: false },
      yaxis: { title: 'DGX Spark Accuracy (%)', range: [lo, hi], zeroline: false, scaleanchor: 'x', scaleratio: 1 },
      legend: { orientation: 'h', y: 1.06, font: { size: 10 } },
      font: { family: 'Manrope, sans-serif' },
      hoverlabel: {                                                          /* white tooltip card, consistent Manrope */
        bgcolor: '#ffffff', bordercolor: '#CBD5E1',
        font: { family: 'Manrope, sans-serif', size: 13, color: '#1C1C1C' },
        align: 'left',
      },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('retrieval-chart', traces, layout, { responsive: true, displayModeBar: false });
  }

  function deltaClass(d) { const x = Math.abs(d); return x <= 1 ? 'good' : x <= 3 ? 'warn' : 'bad'; }

  function renderCompareTable(body) {
    destroyTables();
    body.innerHTML =
      '<div style="margin-bottom:.6rem"><button class="btn-small" id="ret-csv">Export CSV</button>' +
      '<span style="margin-left:1rem;font-size:.8rem"><span class="d good">|Δ|≤1</span> <span class="d warn">≤3</span> <span class="d bad">&gt;3 pp</span></span></div>' +
      '<div class="tablewrap"><table id="retrieval-table" class="display" style="width:100%"></table></div>';

    const rows = compareRows();
    // Sort by descending |Δ| so the largest divergences surface first.
    const sorted = [...rows].sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp));
    const dataset = sorted.map((d) => {
      const skUrl = buildLogUrl(d.model_folder, d.sk_eval_file, d.benchmark);
      const dgxUrl = buildLogUrl(d.model_folder, d.dgx_eval_file, d.benchmark);
      const dCell = `<span class="d ${deltaClass(d.delta_pp)}">${d.delta_pp >= 0 ? '+' : ''}${d.delta_pp.toFixed(2)}</span>`;
      const mt = `${d.sk_max_tokens == null ? 'None' : d.sk_max_tokens} → ${d.dgx_max_tokens == null ? 'None' : d.dgx_max_tokens}`;
      const tr = `${d.sk_truncation_count} → ${d.dgx_truncation_count}`;
      const stratCell = `${modelDisplay(d.model)}${isReasoning(d.model) ? ' ✦' : ''} / ` +
        `<a href="${skUrl}" target="_blank" rel="noopener" title="SKORGE eval">${d.strategy}</a> ` +
        `<a href="${dgxUrl}" target="_blank" rel="noopener" title="DGX eval" style="font-size:.8rem">[dgx ↗]</a>`;
      // Column 3 carries the colored cell HTML plus the raw delta; a render fn
      // (below) shows the cell for display but sorts/filters on |Δ| so the table
      // is "sortable by |Δ|" via the built-in numeric sort.
      return [stratCell, (d.sk_acc * 100).toFixed(2), (d.dgx_acc * 100).toFixed(2),
        { html: dCell, abs: Math.abs(d.delta_pp), raw: d.delta_pp }, mt, tr];
    });

    retDataTables.push(new DataTable('#retrieval-table', {
      data: dataset,
      columns: [
        { title: 'Model / Strategy' }, { title: 'SK Acc' }, { title: 'DGX Acc' },
        {
          title: 'Δ pp',
          render: function (data, type) {
            if (type === 'sort' || type === 'type') return data.abs;
            if (type === 'filter') return data.raw.toFixed(2);
            return data.html;
          },
        },
        { title: 'max_tokens SK→DGX' }, { title: 'Trunc count SK→DGX' },
      ],
      order: [[3, 'desc']], // sort by |Δ| descending
      pageLength: 25, scrollX: true, deferRender: true,
    }));

    const csvBtn = document.getElementById('ret-csv');
    if (csvBtn) csvBtn.addEventListener('click', () => exportCompareCSV(sorted));
  }

  function exportCompareCSV(sorted) {
    exportJSONToCSV(sorted, [
      { label: 'Model', accessor: (d) => modelDisplay(d.model) },
      { label: 'Strategy', accessor: 'strategy' },
      { label: 'SK_Accuracy', accessor: (d) => (d.sk_acc * 100).toFixed(4) },
      { label: 'DGX_Accuracy', accessor: (d) => (d.dgx_acc * 100).toFixed(4) },
      { label: 'Delta_pp', accessor: (d) => d.delta_pp.toFixed(4) },
      { label: 'SK_max_tokens', accessor: (d) => (d.sk_max_tokens == null ? 'None' : d.sk_max_tokens) },
      { label: 'DGX_max_tokens', accessor: (d) => (d.dgx_max_tokens == null ? 'None' : d.dgx_max_tokens) },
      { label: 'SK_truncation_count', accessor: 'sk_truncation_count' },
      { label: 'DGX_truncation_count', accessor: 'dgx_truncation_count' },
    ], 'retrieval-cross-machine-deltas.csv');
  }
  // =========================================================================
  // C5 — Tier-stratified accuracy + Pareto efficiency (ported from CIGRE → 9 models)
  // =========================================================================
  const TIER_NAMES = ['easy', 'medium', 'hard', 'expert'];
  const TIER_LABELS = ['T1 Easy (5,098)', 'T2 Medium (4,561)', 'T3 Hard (108)', 'T4 Expert (22)'];
  // Per-section sub-chart state (machine in Compare falls back to SKORGE).
  let tierStrategy = 'rrf_llm_rerank_k5_all';
  let subchartsBuilt = false;

  function subMachineJson() { return state.machine === 'cmp' ? 'skorge' : MACHINE_JSON[state.machine]; }

  function renderSubcharts() {
    const host = document.getElementById('ret-subcharts');
    if (!host) return;
    if (!subchartsBuilt) {
      host.innerHTML = `
        <h3 style="color:#1565c0">1.2 · Tier-stratified accuracy</h3>
        <div class="fg" style="margin:.3rem 0 .6rem"><span class="lbl">Strategy</span>
          <select class="ctl" id="ret-tier-strat"></select>
          <span class="hint" style="margin-left:.6rem">Per-difficulty-tier accuracy for the chosen strategy${state.machine === 'cmp' ? ' · showing SKORGE (tiers are per-machine)' : ''}.</span>
        </div>
        <div id="ret-tier-chart" style="min-height:380px"></div>
        <h3 style="color:#1565c0;margin-top:1.4rem">1.3 · Pareto efficiency — accuracy vs token cost</h3>
        <p class="hint" style="margin-bottom:.4rem">Accuracy vs avg tokens/sample (cost proxy); dotted line = per-model Pareto frontier.</p>
        <div id="ret-pareto-chart" style="min-height:440px"></div>`;
      populateTierDropdown();
      subchartsBuilt = true;
    } else {
      // Update the per-machine note when machine changes.
      const note = host.querySelector('#ret-tier-strat')?.parentElement?.querySelector('.hint');
      if (note) note.textContent = 'Per-difficulty-tier accuracy for the chosen strategy' +
        (state.machine === 'cmp' ? ' · showing SKORGE (tiers are per-machine).' : '.');
    }
    renderTierChart();
    renderParetoScatter();
  }

  function populateTierDropdown() {
    const sel = document.getElementById('ret-tier-strat');
    if (!sel) return;
    const tiers = DASHBOARD_DATA.retrievalLlmTiers || [];
    const strategies = [...new Set(tiers.map((r) => r.strategy))].sort();
    sel.innerHTML = strategies.map((s) =>
      `<option value="${s}"${s === tierStrategy ? ' selected' : ''}>${s}</option>`).join('');
    sel.addEventListener('change', () => { tierStrategy = sel.value; renderTierChart(); });
  }

  function renderTierChart() {
    const machineJson = subMachineJson();
    const tiers = (DASHBOARD_DATA.retrievalLlmTiers || []).filter((r) => r.machine === machineJson);
    const traces = activeModels().map((model) => {
      const row = tiers.find((r) => r.strategy === tierStrategy && r.model === model);
      if (!row) return null;
      const y = TIER_NAMES.map((t) => (row.tiers[t] ? row.tiers[t].accuracy * 100 : 0));
      const se = TIER_NAMES.map((t) => (row.tiers[t] ? row.tiers[t].se * 100 : 0));
      // Labeled key-value hover, matching the rest of the dashboard.
      const fam = STRATEGY_FAMILY(tierStrategy, row.benchmark);
      const hover = TIER_NAMES.map((t, ti) => {
        const td = row.tiers[t]; if (!td) return '';
        return [
          `<b>Strategy:</b> ${tierStrategy}`,
          `<b>Family:</b> ${FAM_LABEL[fam] || fam}`,
          `<b>Model:</b> ${modelDisplay(model)}${isReasoning(model) ? ' ✦' : ''}`,
          `<b>Tier:</b> ${TIER_LABELS[ti]}`,
          `<b>Accuracy:</b> <b>${(td.accuracy * 100).toFixed(2)}%</b> ± ${(td.se * 100).toFixed(2)}`,
          `<b>Samples:</b> ${td.correct}/${td.total}`,
        ].join('<br>');
      });
      return {
        name: modelDisplay(model), type: 'bar', x: TIER_LABELS, y,
        marker: { color: modelColor(model) }, hovertext: hover, hoverinfo: 'text',
        error_y: { type: 'data', array: se, visible: true, thickness: 1 },
      };
    }).filter(Boolean);

    const layout = {
      barmode: 'group', height: 380, margin: { t: 30, b: 50, l: 50, r: 20 },
      yaxis: { title: 'Accuracy (%)', range: [0, 105], tickfont: { size: 13 } },
      showlegend: false,   /* models keyed by the LLM legend chips */
      font: { family: 'Manrope, sans-serif' },
      hoverlabel: {                                                          /* white tooltip card, consistent Manrope */
        bgcolor: '#ffffff', bordercolor: '#CBD5E1',
        font: { family: 'Manrope, sans-serif', size: 13, color: '#1C1C1C' },
        align: 'left',
      },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('ret-tier-chart', traces, layout, { responsive: true, displayModeBar: false });
  }

  function renderParetoScatter() {
    const machineJson = subMachineJson();
    const llm = llmRows(machineJson);
    const traces = [];
    activeModels().forEach((model) => {
      const rows = llm.filter((r) => r.model === model && r.metrics.avg_llm_token_usage != null);
      if (!rows.length) return;
      // Labeled key-value hover, matching the rest of the dashboard.
      const paretoHover = (r) => {
        const fam = STRATEGY_FAMILY(r.strategy, r.benchmark);
        return [
          `<b>Strategy:</b> ${r.strategy}`,
          `<b>Family:</b> ${FAM_LABEL[fam] || fam}`,
          `<b>Model:</b> ${modelDisplay(model)}${isReasoning(model) ? ' ✦' : ''}`,
          `<b>Accuracy:</b> <b>${(r.metrics.accuracy * 100).toFixed(2)}%</b>`,
          `<b>Tokens:</b> ${Math.round(r.metrics.avg_llm_token_usage).toLocaleString()}`,
        ].join('<br>');
      };
      traces.push({
        name: modelDisplay(model), type: 'scatter', mode: 'markers',
        x: rows.map((r) => r.metrics.avg_llm_token_usage),
        y: rows.map((r) => r.metrics.accuracy * 100),
        marker: { color: modelColor(model), size: 9, opacity: 0.8 },
        hovertext: rows.map(paretoHover), hoverinfo: 'text',
      });
      // Per-model Pareto frontier: walk lowest cost → keep accuracy improvers.
      const sorted = [...rows].sort((a, b) => a.metrics.avg_llm_token_usage - b.metrics.avg_llm_token_usage);
      const frontier = []; let maxAcc = -1;
      sorted.forEach((r) => { if (r.metrics.accuracy > maxAcc) { frontier.push(r); maxAcc = r.metrics.accuracy; } });
      if (frontier.length > 1) {
        traces.push({
          name: modelDisplay(model) + ' frontier', type: 'scatter', mode: 'lines',
          x: frontier.map((r) => r.metrics.avg_llm_token_usage), y: frontier.map((r) => r.metrics.accuracy * 100),
          line: { color: modelColor(model), width: 1, dash: 'dot' }, showlegend: false, hoverinfo: 'skip',
        });
      }
    });
    const layout = {
      height: 440, margin: { t: 30, b: 50, l: 50, r: 20 },
      xaxis: { title: 'Avg Tokens/Sample (cost proxy)' }, yaxis: { title: 'Accuracy (%)' },
      showlegend: false,   /* models keyed by the LLM legend chips */
      font: { family: 'Manrope, sans-serif' },
      hoverlabel: {                                                          /* white tooltip card, consistent Manrope */
        bgcolor: '#ffffff', bordercolor: '#CBD5E1',
        font: { family: 'Manrope, sans-serif', size: 13, color: '#1C1C1C' },
        align: 'left',
      },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    };
    Plotly.react('ret-pareto-chart', traces, layout, { responsive: true, displayModeBar: false });
  }

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
