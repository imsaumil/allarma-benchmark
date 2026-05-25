# aLLarMa v2 Cross-Machine Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the v2-full dashboard front-end in EPRI/CIGRE styling with a per-section control model (Machine/Compare · Families · View + LLM legend), multi-model grouped-bar charts, comprehensive sortable tables, a cross-machine Compare view, and a per-row log drawer — backed by the existing extractor (extended to capture `completed_samples`).

**Architecture:** Static single-page site (no build step). Six JSONs produced by `scripts/extract_data_full.py` are fetched client-side and rendered with **Plotly** (charts — its native legend gives model toggling for free) and **DataTables** (tables), reusing the CIGRE stylesheet and helpers (`buildLogUrl`, `exportJSONToCSV`, `formatRuntime`). State is per-section.

**Tech Stack:** Python 3.11 + pytest (extractor); vanilla JS, Plotly 2.35, DataTables 2.1, jQuery 3.7, Manrope; Python `http.server` for local serving.

**Design source of truth:** `docs/superpowers/specs/2026-05-24-allarma-v2-dashboard-design.md`.
**Validated UI prototypes (real data, syntax-clean) — read these for exact render logic:**
- `/Users/imsaumil/Desktop/EPRI_RESEARCH/ALLARMA_PAPER_WRITING_FILES/.superpowers/brainstorm/37154-1779671256/content/epri-toggle-real.html` (sections, machine toggle, chart/table, Compare scatter, drawer, real numbers)
- `…/content/retrieval-multimodel.html` (family checkboxes, LLM legend, multi-model grouped bars, strategy-on-y-axis)
**CIGRE reference (idiom to inherit):** `CIGRE_WRITEUP/log_files/allarma-benchmark-eval-dashboard/` (`js/retrieval-charts.js`, `js/modifier-charts.js`, `js/data-loader.js`, `css/style.css`).

**Verification strategy:** Python tasks use pytest (existing `scripts/tests/`). JS/HTML follow the existing no-JS-unit-test pattern; each front-end task is verified by (a) `node --check` on the script, (b) `python -m http.server` + `curl` 200 on the page and each JSON, and (c) a stated visual checklist + spot-checking ≥1 rendered number against the source JSON. Accuracy gate: every displayed value must trace to the JSON/eval logs.

---

## Phase A — Data layer: capture `completed_samples` (accuracy-critical)

### Task A1: Add `completed_samples` to retrieval-LLM rows

**Files:**
- Modify: `scripts/extract_data_full.py` (`extract_retrieval_llm_row`, ~lines 61-102)
- Test: `scripts/tests/test_extract_data_full.py`

- [ ] **Step 1: Write the failing test** (uses the real DGX short run as fixture if available, else the header field directly)

```python
def test_retrieval_llm_row_captures_completed_samples(dgx_gpt_oss_direct_match_eval):
    # 2026-04-13...llm-direct-match-all....eval : total_samples=9789, completed_samples=9715
    row = extract_retrieval_llm_row(dgx_gpt_oss_direct_match_eval,
                                    machine="dgx_spark", model_folder="gpt-oss-20b")
    assert row["samples"] == 9789            # total (unchanged)
    assert row["completed_samples"] == 9715  # NEW: short run surfaced
```

- [ ] **Step 2: Run test, verify it fails** — `pytest scripts/tests/test_extract_data_full.py::test_retrieval_llm_row_captures_completed_samples -v` → FAIL (KeyError `completed_samples`).

- [ ] **Step 3: Implement** — in `extract_retrieval_llm_row`, after reading `h`, add:

```python
    completed = h["results"].get("completed_samples", n_samples)
    # ...in the returned dict, alongside "samples": n_samples,
    "completed_samples": completed,
```

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(extract): capture completed_samples on retrieval-LLM rows"`

### Task A2: Add `completed_samples` to modifier + allarma rows

**Files:** Modify `extract_modifier_row` (~206) and `extract_retrieval_allarma_row` (~139); same test file.

- [ ] **Step 1: Test** — assert `row["completed_samples"]` present and equals `header["results"]["completed_samples"]` for one modifier and one allarma fixture (both expected == total for complete runs).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — modifier: `completed_samples = read header results.completed_samples` (note modifier `samples` currently = `len(times)` from summaries; set `completed_samples` from header `results.completed_samples`, keep `samples` as-is). allarma: same pattern as A1.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** — `feat(extract): capture completed_samples on modifier + allarma rows`

### Task A3: Re-emit JSONs and verify the corpus

**Files:** regenerate `data/*.json`.

- [ ] **Step 1: Run** the extractor:
```bash
python scripts/extract_data_full.py \
  --skorge-dir ../../APPLIED_ENERGY_WRITEUP/skorge \
  --dgx-dir ../../APPLIED_ENERGY_WRITEUP/dgx_spark \
  --unbounded-variant ../../CIGRE_WRITEUP/log_files/retriever/gpt_oss_20b_reasoning_low/2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval \
  --output-dir data/
```
- [ ] **Step 2: Verify counts + the short run** — expected: `retrieval-llm-summary.json` 415, `retrieval-allarma-summary.json` 116, `retrieval-llm-tiers.json` 414, `modifier-summary.json` 18, `modifier-templates.json` 378, `cross-machine-deltas.json` 207. Assert DGX gpt-oss-20b `llm_direct_match_all` row has `completed_samples==9715, samples==9789`.
- [ ] **Step 3: Commit** — `chore(data): regenerate JSONs with completed_samples`

---

## Phase B — Front-end scaffolding

### Task B1: `index.html` shell (inherit CIGRE structure)

**Files:** Modify `index.html`.

- [ ] **Step 1:** Replace body with: EPRI `<nav>` (brand "EPRI · aLLarMa Benchmarks" + "v2 · cross-machine" pill; links Overview/Retrieval/Modification/Logs/About) and five `<section id="…">` containers: `#overview` (`#overview-container`), `#retrieval` (`#retrieval-container`), `#modification` (`#modification-container`), `#logs`, `#about`. Keep CIGRE `<head>` CDN links (Manrope, DataTables CSS, jQuery, DataTables JS, Plotly 2.35) + `css/style.css`. Script includes: `shared-utils.js`, `data-loader.js`, `retrieval-section.js`, `modifier-section.js`, `overview.js`, `log-drawer.js`. Add an empty `<div id="log-drawer">` + `<div id="log-scrim">`.
- [ ] **Step 2: Verify** — `node` not needed; `python3 -m http.server 8000` then `curl -s -o /dev/null -w "%{http_code}" localhost:8000/` == 200; page has all 5 section ids (`grep`).
- [ ] **Step 3: Commit** — `feat(html): v2 shell — nav + 5 sections + drawer mounts`

### Task B2: `css/style.css` — inherit CIGRE + add new components

**Files:** Modify `css/style.css`.

- [ ] **Step 1:** Start from the CIGRE `css/style.css` verbatim (body Manrope/#F3F3F3, `#main-nav` `#1565c0`, `section` white cards, `h2` blue + underline, `table.summary-table` blue header + `#e3f2fd` hover, `.btn-small`, `select`, `label`). Append new component classes (port from the two prototype files): `.filterbar`, `.seg`/`.seg button.on` (machine + view toggles, EPRI blue active), `.fam`/`.fam.on` (family checkboxes), `.legend`/`.lgbox`/`.lgbox.off` (LLM chips), `.chartbox`, the `#log-drawer`/`#log-scrim` drawer, delta cell colors `.d.good/.warn/.bad` (green `#1a8c5a` / amber `#b7791f` / red `#c5384a`).
- [ ] **Step 2: Verify** — page still 200; nav bar renders EPRI blue (visual).
- [ ] **Step 3: Commit** — `feat(css): inherit CIGRE stylesheet + v2 control/legend/drawer styles`

### Task B3: `js/shared-utils.js` — colors, labels, log URLs, CSV, family map

**Files:** Modify `js/shared-utils.js`.

- [ ] **Step 1:** Define and `window`-expose:
  - `MODEL_COLORS` (9 models → the prototype palette: gpt-oss `#1565c0`, nemotron-12b `#00897b`, nemotron-9b `#43a047`, ministral-14b `#6d4c41`, ministral-8b `#8e24aa`, ministral-3b `#c0ca33`, gemma-e2b `#f4511e`, qwen-2b `#fb8c00`, qwen-0.8b `#e53935`), keyed by the JSON `model` strings (e.g. `"gpt-oss-20b"`, `"NVIDIA-Nemotron-Nano-12B-v2"`, …).
  - `MODEL_DISPLAY` (short labels) and `REASONING_MODELS` set (gpt-oss-20b, both nemotrons).
  - `METRIC_LABELS` (paper vocabulary): `Modification_Accuracy`→"Modification Accuracy", `Neo4j_Syntactic_Validity`→"Execution Success (Syntactic)", `Neo4j_Semantic_Validity`→"Answer Yield (non-empty)", plus retrieval metric labels.
  - `STRATEGY_FAMILY(strategy, benchmark)` → `'base'|'aug'|'pure'`: `benchmark==='retriever-allarma'`→`base`; strategy in `{llm_direct_match_all, llm_direct_match_candidate, *_unbounded_tokens}`→`pure`; else `aug`.
  - `buildLogUrl(modelFolder, evalFile, benchmark)` — adapt CIGRE's (`js/retrieval-charts.js:162`) to the full-corpus space `https://imsaumil-allarma-benchmark-logs-full.hf.space/#/logs/<category>/<modelFolder>/<encodedFile>`, category from `benchmark` (`modifier`|`retriever`), `+`→`%2B`.
  - `formatRuntime(s)` and `exportJSONToCSV(data, columns, filename)` — copy verbatim from CIGRE.
- [ ] **Step 2: Verify** — `node --check js/shared-utils.js`; in a quick node stub, assert `STRATEGY_FAMILY('llm_direct_match_all','retriever-llm')==='pure'` and `STRATEGY_FAMILY('rrf_llm_rerank_k5_all','retriever-llm')==='aug'` and family of an allarma row is `base`.
- [ ] **Step 3: Commit** — `feat(js): shared-utils — 9-model colors, paper metric labels, family map, log URLs`

### Task B4: `js/data-loader.js` — fetch 6 JSONs, dispatch init

**Files:** Modify `js/data-loader.js` (the file already does this for 6 JSONs — confirm keys match and add overview/drawer dispatch).

- [ ] **Step 1:** Keep the 6-fetch `Promise.all`; after load call `initOverview()`, `initRetrievalSection()`, `initModifierSection()` (guarded by `typeof === 'function'`). Keep the error banner.
- [ ] **Step 2: Verify** — `node --check js/data-loader.js`; serve + `curl` each `data/*.json` == 200.
- [ ] **Step 3: Commit** — `feat(js): data-loader dispatches overview/retrieval/modifier init`

---

## Phase C — Retrieval section (`js/retrieval-section.js`)

> Read `…/content/retrieval-multimodel.html` (families, legend, grouped bars, strategy-on-y-axis) and `epri-toggle-real.html` (machine toggle, Compare scatter, drawer) for the exact, real-data render logic. Convert the prototype's CSS bars to **Plotly horizontal grouped bars** (`type:'bar', orientation:'h', barmode:'group'`), one trace per model using `MODEL_COLORS`; Plotly's legend then doubles as the model toggle (keep the custom legend chips too for parity, syncing `visible` on traces).

### Task C1: Control bar + state + LLM legend
**Files:** Create `js/retrieval-section.js`.
- [ ] **Step 1:** Render into `#retrieval-container`: section `<h2>`/desc; main bar = Machine `seg` (`SKORGE|DGX Spark|Compare Δ`), Families checkboxes (`baselines 58 / LLM-augmented 21 / pure-LLM 2`), View `seg` (`Chart|Table`, right); legend row of 9 `MODEL_COLORS` chips. State object `{machine:'skorge', fams:{base:true,aug:true,pure:true}, view:'chart', metric:'accuracy', models:{<all true>}}`. Each control mutates state then calls `renderRetrieval()`.
- [ ] **Step 2: Verify** `node --check`; serve, controls render, clicking toggles `.on` classes (visual).
- [ ] **Step 3: Commit** — `feat(retrieval): control bar + family/machine/view state + LLM legend`

### Task C2: Chart view — Plotly multi-model grouped bars + in-chart metric selector
- [ ] **Step 1:** When `view==='chart'`, render a metric `<select>` (grouped Quality/Cost/Reliability per spec §7.3) atop a `#retrieval-chart` div. Build strategies = those in selected families (from `retrieval-llm-summary.json` + `retrieval-allarma-summary.json`), filtered; y-axis = strategy. For LLM/pure families: one Plotly bar trace per selected model (value = `metrics[state.metric]` for `machine`), `marker.color=MODEL_COLORS[model]`. For `base` family rows: a single grey trace (no model axis). `barmode:'group'`, horizontal. Text labels = `%` at bar end.
- [ ] **Step 2: Verify** `node --check`; serve, toggling families changes strategy count, legend chips toggle model traces, metric select changes values; spot-check gpt-oss-20b `rrf_llm_rerank_k5_all` accuracy bar == `95.11` (matches JSON).
- [ ] **Step 3: Commit** — `feat(retrieval): multi-model grouped-bar chart + in-chart metric selector`

### Task C3: Table view — comprehensive DataTable
- [ ] **Step 1:** When `view==='table'`, build a DataTable in `#retrieval-table`: rows = (strategy × selected model) for LLM/pure families + single rows for baselines (model col blank); columns grouped Quality (Accuracy±SE, In-Scope, OOS) / Cost (LLM calls, tokens, time/sample, runtime) / Reliability (truncation %, completed/total). Strategy cell links via `buildLogUrl`. Respect families + legend filters. Add `Export CSV` (reuse `exportJSONToCSV`).
- [ ] **Step 2: Verify** `node --check`; serve, table lists filtered rows, CSV downloads; spot-check a cell vs JSON; the DGX `llm_direct_match_all` row shows `9715 / 9789`.
- [ ] **Step 3: Commit** — `feat(retrieval): comprehensive sortable table + CSV + completed/total`

### Task C4: Compare Δ view (scatter + delta table)
- [ ] **Step 1:** When `machine==='cmp'`: Chart→Plotly scatter, x=`sk_acc`, y=`dgx_acc` per (model,strategy) from `cross-machine-deltas.json` (+ baseline/modifier computed client-side), y=x dashed line, points with `|delta_pp|>3` colored red + labeled; Table→DataTable of `cross-machine-deltas.json` (sk, dgx, Δpp color-coded, max_tokens SK→DGX, truncation), sortable by |Δ|. Families + legend still filter.
- [ ] **Step 2: Verify** `node --check`; serve, Compare scatter shows the `llm_direct_match_all` point +9.80 off-diagonal in red; delta table top row by |Δ| is qwen3.5-0.8b/rrf-llm-rerank-k15-all +12.38.
- [ ] **Step 3: Commit** — `feat(retrieval): Compare Δ scatter + delta table`

### Task C5: Tier-stratified + Pareto sub-charts (port CIGRE → 9 models)
- [ ] **Step 1:** Port `renderTierChart`/`populateTierStrategyDropdown`/`renderParetoScatter` from CIGRE `js/retrieval-charts.js` into the section, generalized to 9 models via `getModels(data)` and `MODEL_COLORS`; tiers from `retrieval-llm-tiers.json`, Pareto from `retrieval-llm-summary.json` (acc vs `avg_llm_token_usage`), both honoring the machine + legend filters.
- [ ] **Step 2: Verify** `node --check`; serve, tier chart 4 tiers × selected models; Pareto scatter renders frontiers.
- [ ] **Step 3: Commit** — `feat(retrieval): tier-stratified + Pareto sub-charts (9 models)`

### Task C6: Log drawer wiring
**Files:** Create `js/log-drawer.js`; retrieval rows/bars call `openLogDrawer(payload)`.
- [ ] **Step 1:** `openLogDrawer({title, machine, rows:[{label,value}], logUrl})` fills `#log-drawer` (EPRI header, grouped Quality/Cost/Reliability kv rows, `Open in InspectAI viewer ↗` = `logUrl`), slides in, shows scrim; `closeLogDrawer()` on scrim/✕. Retrieval table cell + bar click build payload (all metrics for that model×strategy×machine) + `buildLogUrl`.
- [ ] **Step 2: Verify** `node --check js/log-drawer.js`; serve, clicking `logs ↗` opens drawer with that row's metrics; link href targets the full-corpus space.
- [ ] **Step 3: Commit** — `feat(js): log drawer + retrieval per-row drilldown`

---

## Phase D — Modification section (`js/modifier-section.js`)

> Mirror Phase C minus Families. Read `epri-toggle-real.html` modifier logic. Data: `modifier-summary.json` (18 rows), `modifier-templates.json` (378).

### Task D1: Control bar + state (Machine, View, legend; no Families)
- [ ] **Step 1:** Into `#modification-container`: `<h2>`/desc; Machine seg, View seg, metric `<select>` (in chart), 9-model legend. State `{machine:'skorge', view:'chart', metric:'Modification_Accuracy', models:{all true}}`.
- [ ] **Step 2: Verify** `node --check`; controls render.
- [ ] **Step 3: Commit** — `feat(modifier): control bar + state + legend`

### Task D2: Chart (9-model bars) + comprehensive Table
- [ ] **Step 1:** Chart: Plotly bars, x=models (or horizontal), value=selected metric for machine, `MODEL_COLORS`. Table: DataTable, rows=9 models, columns grouped Quality (Mod Acc±SE, Exec Success, Answer Yield, Presence, Removal) / Cost (avg tokens, median/mean/max time, throughput) / Reliability (truncation %, completed/total); model cell links via `buildLogUrl(model_folder, eval_file, 'modifier')`.
- [ ] **Step 2: Verify** `node --check`; serve; spot-check gpt-oss-20b SKORGE Mod Acc `95.94`, Exec Success `95.41`, Answer Yield `89.84`, presence `96.81`, removal `95.17` vs JSON; qwen3.5-0.8b truncation `21.78`.
- [ ] **Step 3: Commit** — `feat(modifier): 9-model chart + comprehensive table`

### Task D3: Compare Δ (scatter + delta table) + per-template heatmap
- [ ] **Step 1:** Compare: scatter SK vs DGX Mod Acc (9 points, y=x) + delta DataTable (9 models × 3 scorers SK/DGX/Δ, color-coded; the 2 Nemotron Syn/Sem cells red >1.5). Heatmap (`2.4`): Plotly heatmap models × `template_id` from `modifier-templates.json`, metric-selectable. Drawer wired like C6.
- [ ] **Step 2: Verify** `node --check`; serve; Compare delta table shows nemotron-9b Exec-Success Δ `+3.12`; heatmap 9×21.
- [ ] **Step 3: Commit** — `feat(modifier): Compare Δ + per-template heatmap + drawer`

---

## Phase E — Overview, Logs, About

### Task E1: `assets/process_diagram.svg` + `js/overview.js`
**Files:** Create `assets/process_diagram.svg` (export from `assets/process_diagram.pdf`), `js/overview.js`.
- [ ] **Step 1:** Export the PDF to web SVG: `python -c "import subprocess" ` → use `pdf2svg assets/process_diagram.pdf assets/process_diagram.svg` (or `sips`/`rsvg`); if no converter available, render PNG at 2x. `initOverview()` injects the diagram `<img>` + the one-sentence brief (spec §5 §0) + a **caveats callout** listing the §2 transparency items (mean-vs-spread sentence first), each linking to the relevant audit doc/log.
- [ ] **Step 2: Verify** `node --check js/overview.js`; serve; diagram + brief + caveats render; caveats text contains "±0.55" and "21.78%" and the 9715/9789 note.
- [ ] **Step 3: Commit** — `feat(overview): pipeline diagram + brief + caveats callout`

### Task E2: Logs + About static content
**Files:** Modify `index.html` (`#logs`, `#about`).
- [ ] **Step 1:** Logs: `btn-large` → `https://imsaumil-allarma-benchmark-logs-full.hf.space` + cold-start note. About: Applied Energy citation (authors in PES order), CIGRE predecessor link; **SKORGE** hardware (Ryzen 9 7950X · RTX 4090 24GB · 128GB DDR5 · 2TB NVMe · vLLM; OS to confirm) and **DGX Spark: `<!-- TODO: exact spec line from user -->`**; links (HF dataset/Space/repo, audit docs); methodology line (548 + 1 variant).
- [ ] **Step 2: Verify** serve; links present; About shows both machines (DGX as visible TODO).
- [ ] **Step 3: Commit** — `feat(about/logs): citation, both-machine hardware (DGX TODO), full-corpus logs link`

---

## Phase F — Integration, verification, deploy

### Task F1: Full-page verification pass
- [ ] **Step 1:** `for f in js/*.js; do node --check "$f"; done` all clean. Serve; `curl` 200 on `/` and all 6 `data/*.json`. Walk the spec §4–§6 checklist: per-section control bar; metric selector only in Chart view; families change strategy count; legend toggles models; Compare scatter + delta; drawer opens with InspectAI link; EPRI styling.
- [ ] **Step 2:** Accuracy spot-checks against JSON: retrieval gpt-oss-20b SKORGE `rrf_llm_rerank_k5_all`=95.11 / DGX=95.13; the +12.38, +9.80, +8.43, +3.16 cells appear as the only >3pp in Compare; modifier gpt-oss 95.94/95.41/89.84; 7/9 within ±1.5; DGX direct-match shows 9715/9789.
- [ ] **Step 3: Commit** — `test: full-page verification pass`

### Task F2: README + deploy notes
- [ ] **Step 1:** Update `README.md` setup/serve/deploy (GitHub Pages default branch; HF Space). Note the per-machine all-9-model data is fully wired (no SKORGE-only limitation from the prototypes).
- [ ] **Step 2: Commit** — `docs: README setup + deploy`

### Deferred (post-v1, not blocking) — spec §7.3 ➕ items
Input/output token split (retrieval), neo4j_result_count + error rate, query_type/persona stratifiers, per-sample Pearson r. Each = an extractor addition + a column/filter; schedule after v1 ships.

---

## Self-review notes
- **Spec coverage:** §3 styling→B2; §4 control model→C1/D1; §4.2 chart/table/drawer→C2/C3/C6/D2; §5 sections→C/D/E; §6 Compare→C4/D3; §7.1 data→A3; §7.2 vocab→B3; §7.3 catalog→C2/D2 (+ deferred ➕); §7.4 completed_samples→A1/A2. All covered.
- **Open items** (spec §11): DGX hardware = visible TODO in E2; SKORGE OS to confirm; HF Space/dataset existence verified at deploy (F2).
