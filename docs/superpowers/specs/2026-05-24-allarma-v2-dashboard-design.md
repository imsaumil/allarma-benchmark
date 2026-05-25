# aLLarMa v2 Cross-Machine Benchmark Dashboard — Design

**Date:** 2026-05-24 (updated after interactive mockup rounds)
**Status:** Design validated via interactive mockups; pre-implementation
**Repo:** `allarma-benchmark-eval-dashboard-full`
**Predecessor:** CIGRE 2026 dashboard — https://imsaumil.github.io/allarma-benchmark-eval-dashboard/
**Companion to:** aLLarMa Applied Energy paper (`APPLIED_ENERGY_WRITEUP/current_paper/main_ieee_v3.pdf`)
**Audit sources (authoritative):** `docs/cross_machine_retriever_comparison.md`, `docs/cross_machine_modifier_comparison.md`

---

## 1. Goal

Public dashboard for the **full cross-machine benchmark corpus** of the Applied
Energy paper, reusing the CIGRE dashboard's look/feel/idiom, extended for the new
dimensions:

- **2 machines** — SKORGE (RTX 4090 workstation) and NVIDIA DGX Spark (edge appliance)
- **9 open-weight LLMs** (0.8B–20B), up from 3
- The paper's headline contribution: **cross-machine reproducibility**

North star: **simple, transparent, intuitive.** Every number is reproducible from
the on-disk `.eval` files; the reader can always drill from a chart to the raw log.

## 2. Audience and the story (verified numbers)

Readers are reviewers/researchers verifying and exploring the paper's claims.

**Reproducibility (positive):**
- Retriever: every per-model *mean* Δaccuracy within **±0.55 pp** (10 sweeps incl.
  baseline; −0.55 ministral-3-3b … +0.49 gpt-oss-20b).
- Modifier: Modification-Accuracy Δ within **−0.73 … +1.13 pp** for all 9 models;
  **7 of 9 within ±1.5 pp on all three scorers** (6 within ±1 pp; ministral-3-14b
  is the ±1–1.5 case, Answer-Yield Δ −1.46).
- Internal consistency: all 548 production headline metrics reproduce from per-sample data.

**⚠ Canonical-data decisions (verified 2026-05-25, 1-to-1 vs logs & paper v3):**
- SKORGE `gpt-oss-20b / llm_direct_match_all` = the **unbounded** run (91.86%,
  max_tokens=None). The earlier capped run (85.51%, 8192-cap, 1137 truncated, the old
  +9.80 pp anomaly) was intentionally archived as `_archived_max_tokens_drift_2026-04-14`
  and is NOT in the dashboard data. The paper already reflects this.
- Per-sample timing = **mean of per-sample `working_time`** (the paper's `T_sample`);
  `avg_time_per_sample` = wall/N is deflated ~5× by concurrency and is NOT displayed.
- 414 retrieval-LLM rows (no separate "unbounded variant"; 548 production logs total).
- **Audit docs `cross_machine_*_comparison.md` are stale on this one cell** (they still
  describe the capped +9.80 pp run); the paper supersedes them. Flag for the user.

**Spread the mean hides (do NOT understate):**
- **4 retriever (model,strategy) cells exceed ±3 pp**, up to **+12.38 pp**, and *none*
  is explained by max_tokens (the capped gpt-oss run is archived):
  qwen3.5-0.8b/rrf-llm-rerank-k15-all **+12.38**, qwen3.5-2b/rrf-llm-rerank-k15-all
  **+8.43** (both: identical caps, zero truncation — genuine run differences, not noise),
  gpt-oss-20b/llm-direct-match-all **+3.46** (SK 91.86 / DGX 95.32, both unbounded;
  consistent with reasoning-model stochasticity — paper C2),
  nemotron-12b/llm-listwise-rerank-dense-candidate **+3.16** (mechanism unidentified).
- Modifier: the two Nemotron reasoning models exceed ±1.5 pp on Syn/Sem
  (nemotron-9b Exec-Success +3.12, Answer-Yield +2.64; nemotron-12b −2.64 / −1.56).

**Honest caveats (paper §results_xmachine.3; full detail in audit docs):**
- **C1** — qwen3.5-0.8b hits the 16,384-token cap on **223/1024 (21.78%)** modifier
  samples on *both* machines (200 shared IDs; deterministic prompt repetition); its
  ~41% Mod-Acc reflects 0.8B capability, not a benchmark artifact.
- **C2** — the two qwen k15 divergences (+12.38, +8.43) and the +3.46 gpt-oss
  direct-match delta (above); causes not isolated, both machine values reported.
- DGX gpt-oss-20b/llm-direct-match-all **9715/9789 completed (74 short)**; DGX
  nemotron-9b-v2 4 modifier samples timed out at 600 s; gpt-oss +2 input tokens/sample
  on DGX (inert); differing git commits per side; llama-3.1-8b DGX-only (excluded).
- Hardware/timing confound — aggregate wall **retriever 3.07× · modifier 3.94×**
  (DGX/SKORGE), not generalizing beyond this dataset/vLLM setup.

## 3. Design principles

1. **Inherit, don't reinvent.** Reuse CIGRE's stylesheet (EPRI blue `#1565c0`,
   Manrope, white section cards, blue `table.summary-table` headers, `.btn-small`,
   `.control-group`, `#e3f2fd` row hover). The dashboard must read as the same EPRI
   family, extended.
2. **Comparison is the contribution** — first-class, and it shows the *spread*
   (the outlier cells), not just the reassuring mean.
3. **Transparency over polish** — caveats surfaced; every number one click from its
   raw InspectAI log.
4. **Match the paper's vocabulary** (§7.2).
5. **Claim only what the data supports** — no per-sample correlation in v1 (§7.4).

## 4. Information architecture

Single page, deep-linkable section anchors (stable for paper citation), Cmd-F works.

**Nav:** `Overview · Retrieval · Modification · Logs · About` (Overview is the only
structural addition over CIGRE).

### 4.1 Per-section control model (validated in mockups)

State is **per-section and independent**. Each of §1/§2 carries a **sticky control
area** with two parts:

**Main bar (always visible):**

| Control | Retrieval | Modification |
|---|---|---|
| **Machine** (segmented) | `SKORGE \| DGX Spark \| Compare Δ` | same |
| **Families** (checkboxes) | `☑ Non-LLM baselines (58) ☑ LLM-augmented (21) ☑ Pure-LLM (2)` | — (single task) |
| **View** (segmented, right-aligned) | `Chart \| Table` | same |

**LLM legend row (own row):** 9 clickable color chips (✦ marks the 3 reasoning
models) that are both the **color key and a model filter**. Governs LLM rows only.

**Metric selector — lives inside the Chart container, ONLY in Chart view.** Because
the Table already shows every metric, the metric dropdown is meaningless there;
it appears only when View = Chart, grouped Quality / Cost & efficiency / Reliability.

Ordering rationale (broad data scope → presentation): Machine → Families → View; the
wide legend gets its own row. On narrow screens the bar wraps / collapses to a
"Filters" disclosure.

### 4.2 Chart vs Table vs Drawer (where each metric view lives)

- **Chart (one metric, all models):** multi-model **grouped horizontal bars** —
  **strategy on the y-axis**, one colored bar per selected model, **% value at
  right**. Model identity comes from color + legend (no repeated per-bar labels).
  Grouped, **not stacked** (accuracy % is non-additive). **Non-LLM baselines have no
  model axis** → render as a single neutral "no-LLM" bar.
- **Table (all metrics):** comprehensive, sortable. Retrieval rows =
  (strategy × model) for LLM families, single row for baselines; Modifier rows = the
  9 models. Columns = all metrics grouped Quality / Cost / Reliability. Filtered by
  Families + legend. No metric selector (it's all here).
- **Drawer (one cell, all detail):** clicking any bar / table cell / row opens a
  right-side drawer with **every metric for that (model, strategy, machine)** plus
  **`Open in InspectAI viewer ↗`** deep-linked to that exact eval. This is how full
  per-cell detail coexists with a one-metric chart.

## 5. Section-by-section

### §0 Overview (new; machine-agnostic, no control bar)

1. **Pipeline diagram + one-sentence brief** — render `assets/process_diagram.pdf`
   (User question → ① Template retriever → ② Template modifier → Query executor →
   Results) as inline SVG/PNG, with: *"aLLarMa is a two-stage constrained GraphRAG
   framework: Stage 1 retrieves a pre-validated query template, Stage 2 modifies it
   within marked boundaries. This dashboard benchmarks both stages across 9
   open-weight LLMs on two machines."*
2. **Caveats callout** — the §2 transparency items (must state the mean-vs-spread
   distinction explicitly), each deep-linking to the relevant log; link to both
   audit docs for the authoritative full list. No stat cards.

### §1 Retrieval (control model per §4) — mirrors CIGRE Part 1

Section description: *"81 retrieval strategies (58 LLM-free · 21 LLM-augmented ·
2 pure-LLM) on 9,789 difficulty-tiered samples; the 23 LLM strategies run across all
9 models."*

- **1.1 Strategy comparison** — the multi-model Chart / comprehensive Table of §4.2,
  Families-filtered. (gpt-oss-20b/llm_direct_match_all is the unbounded run; there is
  no separate "unbounded variant" row.)
- **1.2 Tier-stratified accuracy** — per-tier accuracy for a chosen strategy.
- **1.3 Pareto efficiency** — accuracy vs token cost.
- Baselines (1.4 in CIGRE) are folded into the Families filter of 1.1 (the "Non-LLM
  baselines" family) rather than a separate sub-section.

### §2 Modification (control model per §4, no Families) — mirrors CIGRE Part 2

Section description: *"1,024 constrained-modification samples across 9 LLMs; scored
on Modification Accuracy, Execution Success (Syntactic), Answer Yield (non-empty)."*
Chart = 9-model bars for the selected metric; Table = 9 models × all metrics
(Mod/Exec/Yield, Presence, Removal, tokens, timing, throughput, truncation);
per-template heatmap retained as a sub-view.

### §3 Logs / §4 About

Logs → full-corpus HF Space (`imsaumil/allarma-benchmark-logs-full`), cold-start note.
About → Applied Energy citation (PES author order; link to CIGRE predecessor); **both
machines' hardware** — SKORGE: AMD Ryzen 9 7950X · RTX 4090 24 GB · 128 GB DDR5 ·
2 TB NVMe · vLLM (OS to confirm); **DGX Spark: spec line = TODO (user to supply)**;
links to HF dataset/Space/repo/audit docs; methodology line (548 audited production logs).

## 6. Compare-mode behavior

Machine = **Compare Δ** keeps Families + legend + metric active; only the rendering changes:

| View | Compare rendering | Δ source |
|---|---|---|
| **Chart** | **SKORGE-vs-DGX scatter** with the y=x line; points off the diagonal by >3 pp drawn red (the outlier cells) | per-machine summaries / `cross-machine-deltas.json` |
| **Table** | color-coded **delta table/matrix** (green ≤1 · amber ≤1.5/3 · red beyond) | `cross-machine-deltas.json` (retriever-LLM, 207 rows); modifier & baseline deltas computed client-side from per-machine summaries |

## 7. Data and vocabulary

### 7.1 Data sources (verified row counts)
`retrieval-llm-summary.json` 414 · `retrieval-allarma-summary.json` 116 ·
`retrieval-llm-tiers.json` 414 · `modifier-summary.json` 18 ·
`modifier-templates.json` 378 (9×2×21) · `cross-machine-deltas.json` 207
(retriever-LLM only). Total audited production files **548 = 18 + 414 + 116**.
Retrieval + allarma + modifier rows each carry a `timing` block (median/mean/max of
per-sample `working_time`) and `completed_samples`.

### 7.2 Metric vocabulary (match the paper)
`Modification_Accuracy` → **Modification Accuracy**; `Neo4j_Syntactic_Validity` →
**Execution Success (Syntactic)**; `Neo4j_Semantic_Validity` → **Answer Yield
(non-empty executions)**. Single source of truth: a label map in `js/shared-utils.js`.

### 7.3 Full metric catalog (grouped; ✅ extracted, ➕ needs extractor addition)

| Group | Retrieval | Modification |
|---|---|---|
| **Quality** | ✅ Accuracy, In-Scope, OOS | ✅ Mod Accuracy, Execution Success, Answer Yield, Presence, Removal · ➕ neo4j_result_count, neo4j error rate, combined_score |
| **Cost & efficiency** | ✅ avg LLM calls/sample, avg tokens/sample, **per-sample timing median/mean/max (working_time = paper T_sample)**, total runtime · ➕ input/output token split, throughput | ✅ avg_total tokens, timing median/mean/max (working_time), throughput, total runtime · ➕ input/output split |
| **Reliability** | ✅ truncation count/rate, max_tokens, **completed/total samples** | ✅ truncation count/rate, max_tokens, **completed/total samples** · ➕ error_retries |
| **Stratifiers (retrieval)** | ✅ difficulty tier · ➕ template_name, query_type, agent_persona, in/out-of-scope | per-template heatmap ✅ |

### 7.4 Data status & remaining gaps (verified against raw `.eval` 2026-05-25)
1. ✅ **DONE — `completed_samples`** now stored on all rows (e.g. DGX
   gpt-oss-20b/llm-direct-match-all = **9715/9789**). Dashboard must show "9715 / 9789"
   / flag short runs (avoids overstating completeness).
2. ✅ **DONE — per-sample `timing`** (median/mean/max of `working_time`) on retrieval +
   allarma + modifier; matches the paper's `T_sample` on all 22 quoted cells. The
   dashboard's "avg time/sample" uses `timing.mean`, NOT `avg_time_per_sample` (wall/N).
3. ➕ Remaining (post-v1): input/output token split, neo4j_result_count, throughput
   where missing, retrieval stratifiers (template/query_type/persona).
4. **Per-sample Pearson r / agreement %** — in the audit docs & paper modifier table,
   not the JSONs; omitted from v1. The paper says "full results on the dashboard," so
   this is a likely fast-follow (needs per-sample vectors + cross-machine join).
5. Modifier/baseline cross-machine deltas computed client-side (both machines present).

## 8. Build approach
Work in the existing repo. **Keep** `scripts/`+`data/` (extend the extractor for §7.4
items); **rebuild** `index.html`/`css`/`js` inheriting CIGRE's stylesheet + the
control model of §4. The current uncommitted WIP and old v2 JS are *reference* for the
hard logic (cross-machine Δ, Pareto, tiers, provenance/log drawer) — re-authored to
CIGRE styling. **Add** `assets/process_diagram.{svg,png}`, the multi-model grouped-bar
chart, family checkboxes, LLM legend, chart/table toggle, metric-in-chart, log drawer.

## 9. Deployment
GitHub Pages (default branch); Logs via HF Docker Space from HF dataset. CIGRE
artifacts stay frozen (this is the v2 set).

## 10. Non-goals (YAGNI)
No Reviewer/Explorer dual-mode or sticky-TOC; no stat cards; no stacked bars for
non-additive metrics; no per-sample correlation in v1; no re-running evals; no live
inference.

## 11. Open items
- **DGX Spark hardware spec line** — user to supply (SKORGE block known).
- **SKORGE OS** — confirm (CIGRE listed Windows 11).
- **Full-scale chart density** (21 LLM-aug × 9 models) — managed by Families filter +
  legend toggle; sort strategies by best-model accuracy; consider a heatmap alt view.
- **HF Space/dataset** existence — verify created/populated before launch.
- **Per-sample r** — extractor extension if reviewers want it (§7.4).
