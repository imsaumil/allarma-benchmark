# Cross-Machine Retriever-Benchmark Comparison

Generated 2026-05-13. Inputs: every `.eval` file under
`APPLIED_ENERGY_WRITEUP/SKORGE/Retriever_Benchmarking/` and
`APPLIED_ENERGY_WRITEUP/DGX_Spark/Retriever_Benchmarking/`, after the
audit + cleanup described in §2. Companion document:
`cross_machine_modifier_comparison.md` (same machines, modifier
benchmark instead of retriever).

This document is intended for the Applied Energy paper appendix /
supplementary material. The goal is **complete transparency**: every
number below is reproducible from the on-disk `.eval` files, every
caveat is recorded, and no claim goes beyond what the data supports.

---

## 1. Scope

Two machines independently produced the same retrieval benchmark:

* **SKORGE** — internal GPU server used for the CIGRE and earlier
  Applied-Energy runs.
* **DGX Spark** — NVIDIA DGX Spark; a smaller, edge-class device
  whose feasibility on this benchmark is itself a research question.

Each machine ran:

* a **baseline retrieval suite** (`allarma-retriever-benchmark`,
  58 retrieval strategies without LLM in the loop), and
* an **LLM-augmented retrieval sweep** of **23 strategies** per model
  on **9 shared models** (gemma-4-e2b-it, gpt-oss-20b,
  ministral-3-3b/8b/14b, nemotron-nano-9b-v2/12b-v2, qwen3.5-0.8b/2b).

DGX additionally ran `llama-3.1-8b`; SKORGE did not. That folder is
documented in §6 and excluded from cross-machine comparison.

**Files compared in this report (production tree only):**

| Side | Allarma baseline | LLM-augmented | Total |
|---|---:|---:|---:|
| SKORGE retriever | 58 | 9 × 23 = 207 | 265 |
| DGX retriever    | 58 | 9 × 23 = 207 | 265 |

Total cross-machine pairs: **265** (58 baseline + 207 LLM-augmented).

---

## 2. Audit methodology and verification

Before comparing metrics, every `.eval` file was audited at the byte
level. The audit is reproducible by re-running the scripts saved in
`/tmp/full_audit_*.pkl`; the procedure is:

### 2.1 Per-file integrity (548 production files, both benchmarks)

For each `.eval` (a Zip archive produced by Inspect AI):

1. Verify the Zip is readable (no `BadZipFile`).
2. Verify the presence of `header.json`, `summaries.json`,
   `reductions.json`, and a `_journal/` subtree.
3. Count sample files (`samples/*.json`); confirm uniqueness of sample
   `id`s; confirm `dataset_samples == total_samples == completed_samples`
   (one documented exception in §4.2).
4. Parse every sample, extract its per-scorer value(s) and the user
   prompt text. Recompute the headline metric directly from these
   per-sample values, using the correct subset for each metric name
   (`accuracy` over all samples, `accuracy_in_scope` over samples with
   `metadata.is_oos_target == False`, `accuracy_oos` over samples with
   `metadata.is_oos_target == True`, etc.). Verify that the recomputed
   value matches the corresponding entry in `header.json["results"]`
   within 1e-6.

**Result.** All 548 production files pass every structural check, and
the recomputed metrics match `header.json` exactly (548/548).
The only deviation from the "1024/1024 or 9789/9789" pattern is the
single sample-count gap recorded in §4.2.

### 2.2 Cross-machine pair sample-ID alignment

For each `(benchmark, model_dir, strategy)` key present on both
machines, the sets of sample `id`s on the two sides were compared.

**Result.** 274 keys total (9 modifier + 207 LLM-augmented retriever +
58 baseline retriever). All 274 keys are present on both machines.
For every key, the sample-ID sets are identical (set equality).
No orphan IDs in either direction.

### 2.3 Cross-machine user-prompt byte equivalence

For each shared sample id, the user-message text was extracted and
hashed (SHA-256). The hashes were compared between machines.

**Result.** **2,603,301 sample-prompt comparisons across 274 pairs;
all 2,603,301 hashes match.** Both machines provably consumed the same
dataset content for every sample.

### 2.4 Cross-machine config alignment per strategy

For each retriever strategy, the `task`, `scorers`, `temperature`,
`reasoning_effort`, `max_tokens`, and `model_base_url` fields were
compared across machines.

**Result.** `task`, `scorers`, `temperature`, and `reasoning_effort`
agree across machines for every strategy. The only documented
divergence is `max_tokens`, which is itself a configuration choice
(see §4.1).

---

## 3. Cross-machine results

### 3.1 Aggregate timing

The total production-tree retriever wall time was:

| Side | Total retriever wall time |
|---|---:|
| SKORGE | **105.6 h** (4.4 days) |
| DGX_Spark | **414.2 h** (17.3 days) |
| Ratio (DGX / SKORGE) | **3.92×** |

Per-model aggregate (sum over 23 LLM-augmented strategies, or 58
baselines for `allarma-retriever-benchmark`):

| Model | # pairs | SKORGE dur. (h) | DGX dur. (h) | DGX / SKORGE |
|---|---:|---:|---:|---:|
| allarma-retriever-benchmark (no LLM) | 58 | 1.81 | 2.97 | **1.64×** |
| ministral-3-3b      | 23 |  3.87 |   7.86 | 2.03× |
| qwen3.5-0.8b        | 23 |  2.08 |   4.44 | 2.13× |
| ministral-3-14b     | 23 | 11.16 |  24.49 | 2.19× |
| qwen3.5-2b          | 23 |  2.82 |   6.56 | 2.33× |
| gemma-4-e2b-it      | 23 |  3.44 |   8.16 | 2.37× |
| nemotron-nano-9b-v2 | 23 | 10.43 |  27.32 | 2.62× |
| ministral-3-8b      | 23 |  7.85 |  20.75 | 2.64× |
| nemotron-nano-12b-v2| 23 | 10.68 |  41.35 | 3.87× |
| **gpt-oss-20b**     | 23 | **51.46** | **270.24** | **5.25×** |

The gpt-oss-20b ratio of 5.25× is dominated by one strategy
(`llm-direct-match-all`, see §3.3); the per-strategy ratio on the
other 22 gpt-oss-20b strategies is ~3.2–4.2×.

**DGX is slower on most pairs but not all.** Per-pair ratios range
from **0.48× to 11.90×** across all 265 retriever pairs. DGX is
actually *faster* than SKORGE on 4 specific pairs:

| Pair | DGX / SKORGE |
|---|---:|
| `nemotron-nano-9b-v2 / query-expand-rrf-all` | **0.48×** |
| `allarma / bm25-candidate` | 0.68× |
| `allarma / minicoil-all` | 0.73× |
| `allarma / minicoil-candidate` | 0.73× |

The three allarma cases are SIMD/IO-bound rather than GPU-bound, so
DGX's CPU keeps up. The `nemotron-9b query-expand-rrf-all` case is
the only LLM-augmented pair where DGX wins; this single result
warrants follow-up but is reported as observed.

### 3.2 Aggregate accuracy

For each (model, strategy) pair we computed `Δaccuracy_pp = DGX − SKORGE`,
where `accuracy` is the scorer's primary metric (per-sample value is
an integer 0/1). The retriever benchmark uses **six distinct scorer
names** across its 265 pairs — `langchain_document_scorer` (207
pairs), `rrf_llm_oos_scorer` (27), `llm_matching_scorer` (18),
`llm_selective_oos_scorer` (9), `colbert_scorer` (2),
`minicoil_scorer` (2). Each strategy uses the same scorer on both
machines (verified 0 mismatches across 265 pairs in §2.4). The mean
across all 23 strategies (or 58 for allarma) is:

| Model | Mean Δ accuracy (pp) | Mean per-sample Pearson r |
|---|---:|---:|
| gemma-4-e2b-it       | −0.00 | 0.914 |
| allarma (baseline)   | −0.02 | 0.948 |
| ministral-3-14b      | −0.04 | 0.876 |
| nemotron-nano-9b-v2  | +0.07 | 0.905 |
| ministral-3-8b       | −0.14 | 0.880 |
| nemotron-nano-12b-v2 | +0.19 | 0.908 |
| qwen3.5-2b           | +0.26 | 0.852 |
| qwen3.5-0.8b         | +0.29 | 0.840 |
| **gpt-oss-20b**      | **+0.49** | **0.847** |
| ministral-3-3b       | −0.55 | 0.806 |

**Reading.** All 10 model-sweep means are within **±0.55 pp** of zero.
However, the mean masks large per-strategy spread: see §3.3 for the
material per-strategy divergences. The mean per-strategy Pearson r
ranges from **0.806 (ministral-3-3b)** to **0.948 (allarma baseline)**.
Note these are means across each model's 23 (or 58) strategies; the
per-pair r values themselves span a wider range, from **0.430**
(gpt-oss-20b / llm-direct-match-all) to **1.000** (several
deterministic allarma baselines). Allarma is on average higher r than
the LLM-augmented sweeps, but several allarma strategies that include
sampling-based tie-breaking (e.g. `baseline-hybrid-all`,
`bm25-hybrid-all-w30-70`) have r as low as 0.64.

### 3.3 Material per-strategy divergences

Although the per-model **mean** Δ is small everywhere (§3.2), several
**individual** (model, strategy) cells diverge by more than ±3 pp.
The cells with |Δ accuracy| > 3 pp are:

| Pair | SKORGE acc | DGX acc | Δ pp | Same `max_tokens`? | Truncation (SK / DG) | Per-sample r |
|---|---:|---:|---:|:-:|:-:|---:|
| **gpt-oss-20b / llm-direct-match-all** | 85.51 % | 95.32 % | **+9.80** | No (8192 vs None) | 1137 / 0 | 0.430 |
| **qwen3.5-0.8b / rrf-llm-rerank-k15-all** | 75.55 % | 87.94 % | **+12.38** | **Yes (8192 on both)** | 0 / 0 | 0.459 |
| **qwen3.5-2b / rrf-llm-rerank-k15-all** | 79.81 % | 88.24 % | **+8.43** | **Yes (8192 on both)** | 0 / 0 | 0.526 |
| **nemotron-nano-12b-v2 / llm-listwise-rerank-dense-candidate** | 37.91 % | 41.07 % | **+3.16** | No (8192 vs None) | 0 / 0 | 0.845 |

And cells with 2 pp ≤ |Δ| ≤ 3 pp (smaller but worth noting):

| Pair | SKORGE acc | DGX acc | Δ pp |
|---|---:|---:|---:|
| qwen3.5-0.8b / persona-filter-rrf-all | 71.17 % | 68.49 % | −2.69 |
| allarma / baseline-sparse-candidate | 49.25 % | 47.15 % | −2.09 |
| allarma / bm25-sparse-candidate-w30-70 | 49.58 % | 47.48 % | −2.09 |

**Notes on each of the four divergences:**

1. **`gpt-oss-20b / llm-direct-match-all` (Δ = +9.80 pp) is explained
   by the `max_tokens` configuration difference.** Of the 1137 SKORGE
   samples that hit the 8192-token cap, **1 of 1137 (0.09 %)** scored
   correctly versus **8370 of 8652 (96.74 %)** on clean (non-truncated)
   SKORGE samples — i.e. truncation effectively zeroes out the score
   on this strategy. DGX with `max_tokens=None` produced full outputs
   and avoided that channel. The DGX number also carries a 74-sample
   shortfall (§4.2).

2. **The two `rrf-llm-rerank-k15-all` qwen divergences (+12.38 and
   +8.43 pp) cannot be explained by `max_tokens` — both machines
   used 8192 for qwen models and both produced 0 truncated samples.**
   Confounders that remain: a different git commit on each side
   (SKORGE `beecaa4`, DGX `16cdd40`), and the fact that some scorer
   subcalls use `temperature = 1.0` (sampling — observed earlier in
   the per-strategy config audit). The k=15 variant uses the largest
   candidate pool of the rrf-llm-rerank-k* family on these models;
   the four smaller-k siblings (k=3, 5, 7, 10) on both qwen models
   show much smaller deltas (max |Δ| = 0.46 pp). This warrants
   follow-up before quoting an exact number in the paper; reporting
   both machines' values side-by-side is the conservative choice.

3. **`nemotron-12b / llm-listwise-rerank-dense-candidate` (Δ = +3.16 pp).**
   The `max_tokens` setting differs on the two sides (8192 vs None)
   but DGX did not produce any truncated sample for this cell, so
   we cannot attribute the gap to the cap. The mechanism for this
   particular divergence is not yet identified.

**Full detail on `gpt-oss-20b / llm-direct-match-all` (the
best-understood divergence):**

| Metric | SKORGE | DGX | Δ |
|---|---:|---:|---:|
| `accuracy` | 85.51 % | **95.32 %** | **+9.80 pp** |
| `completed_samples / total_samples` | 9789 / 9789 | 9715 / 9789 | DGX 74 short |
| `max_tokens` | 8192 | None (unbounded) | — |
| Truncated samples (`finish_reason == "length"`) | **1137 / 9789 (11.6 %)** | 0 / 9789 (0 %) | — |
| Wall time | 15.93 h | 140.46 h | 8.81× |
| Per-sample agreement | 89.0 % | — | — |
| Pearson r (per-sample) | 0.430 | — | — |

Mechanism: `llm-direct-match-all` enumerates every candidate match in
its output, so its natural output length runs into the thousands of
tokens. SKORGE's `max_tokens = 8192` cap was hit on 1137 samples;
virtually all of those truncated outputs failed scoring (the Cypher
answer was incomplete). DGX's `max_tokens = None` allowed full
outputs, so the truncation channel is absent there. The DGX number
is in turn slightly biased upward because 74 of the hardest samples
did not complete in the 140-hour run (§4.2).

**No claim is made about which machine yields the "correct" number
for `llm-direct-match-all`.** Both values reflect defensible
configuration choices; the divergence should be acknowledged in the
paper rather than averaged away.

For every other gpt-oss-20b strategy, Δ is between **−0.23 and
+0.38 pp** (full table in §7.1).

---

## 4. Caveats — known limitations

These items affect interpretation. None invalidates the audit; each
should be acknowledged in any quoted number.

### 4.1 `max_tokens` configuration is not uniform across DGX models

On SKORGE, all 9 LLM-augmented retriever model sweeps used
`max_tokens = 8192` uniformly.

On DGX, the per-model `max_tokens` is:

| DGX retriever model | `max_tokens` |
|---|---|
| gemma-4-e2b-it       | None (unbounded) |
| gpt-oss-20b          | None |
| ministral-3-3b       | None |
| ministral-3-8b       | None |
| ministral-3-14b      | None |
| nemotron-nano-9b-v2  | None |
| nemotron-nano-12b-v2 | None |
| qwen3.5-0.8b         | 8192 |
| qwen3.5-2b           | 8192 |

`allarma-retriever-benchmark` uses `max_tokens = None` on both
machines (it does not invoke an LLM).

Consequence: 7 of the 9 cross-machine LLM-augmented model pairs are
not run under identical caps. On `gpt-oss-20b` the cap dominates
one strategy (`llm-direct-match-all`, see §3.3), where 1137/9789
SKORGE samples hit it. The other 22 gpt-oss-20b strategies show
truncation counts ranging from **0 to 39** SKORGE samples per cell
(20 of those 22 have non-zero counts; 2 strategies —
`llm-listwise-rerank-dense-all` and
`llm-listwise-rerank-dense-candidate` — have exactly zero), but
the accuracy impact is small: |Δ| ≤ 0.38 pp for all 22.
Models other than gpt-oss-20b show essentially no SKORGE
truncation: ministral-3-14b and ministral-3-8b each have exactly
1 truncated sample across their 23 strategies (both in their
respective `llm-direct-match-all` runs); the remaining 6
LLM-augmented models (gemma-4-e2b-it, ministral-3-3b,
nemotron-nano-9b-v2, nemotron-nano-12b-v2, qwen3.5-0.8b,
qwen3.5-2b) have **zero** truncated samples on the SKORGE side.
DGX truncates zero samples for every LLM-augmented model
because its `max_tokens` is either `None` or 8192 — and where it
is 8192 (qwen3.5-0.8b/2b), the model's natural output stays
below the cap in this dataset.

### 4.2 DGX `gpt-oss-20b / llm-direct-match-all` is 74 samples short

The single DGX run for that cell completed 9715 of 9789 samples in a
140.5-hour wall-clock run, then was terminated rather than continued.
The headline `accuracy = 95.32 %` is therefore an average over 9715
samples, not 9789. The 74 missing samples are unknown to that run's
metrics but were processed successfully on SKORGE; the SKORGE
prompts for those IDs are present and were scored normally.

### 4.3 Different git commits per side

| Machine | Commit | Note |
|---|---|---|
| DGX | `16cdd40` | uniform across all retriever files |
| SKORGE | `beecaa4` | for 8 models / all retriever strategies |
| SKORGE | `12dbfe3` | for one strategy of one model: `ministral-3-14b / llm-listwise-rerank-dense-candidate` (the very first run in that sweep; the codebase was updated between that strategy and the rest) |

For the prior CIGRE work the commit was `cf9c1fe`; commits are
documented for completeness. Note that the 100 % prompt-hash
equivalence in §2.3 directly verifies only that the on-disk
**dataset content** is identical across all sides; it does not
itself prove that scoring code paths are unchanged across commits.
Any code-path drift between commits is bounded indirectly by the
per-sample score agreement reported in §3.2–§3.3, which absorbs
both that drift and model-sampling stochasticity.

### 4.4 Asymmetric model coverage: llama-3.1-8b is DGX-only

DGX ran a `llama-3.1-8b` retriever sweep (23 strategies, fp4
quantization, fully complete); SKORGE did not run a llama model on
the retriever benchmark. The folder is preserved at
`APPLIED_ENERGY_WRITEUP/_archive/DGX_Spark/Retriever_Benchmarking/llama-3.1-8b/`
and is excluded from the cross-machine comparison above.

### 4.5 Hardware difference is a confound for timing

DGX Spark is intrinsically slower per sample than the SKORGE GPU
server for these workloads. Per-model aggregate ratios in this
report span **1.64× (allarma baseline, no LLM) to 5.25× (gpt-oss-20b)**
with the 9 LLM-augmented sweeps falling in 2.03–5.25× (§3.1).
Those ratios should **not** be read as a claim about model serving
efficiency in general; both machines used vLLM through
`http://localhost:8000/v1` with comparable settings. The benchmark
addresses whether DGX Spark can produce comparable *accuracy* on
this task within a tractable wall-clock budget — and within the
caveats of §3.3 and §4.1–§4.4, the per-strategy accuracy answer is
"yes" for the great majority of pairs, while wall time is the price.

---

## 5. Per-machine retriever summary (every metric, every model)

The full per-(model, strategy) table is in `cross_machine_pairs.pkl`
(274 rows). The aggregated view appears in §3.1 + §3.2. The two
detailed views below are reproduced in full because they are likely
to be cited in the paper.

### 5.1 Allarma baseline (no LLM in the loop)

All 58 retrieval strategies, run on both machines.

* **All 58 strategies have |Δ accuracy| ≤ 2.09 pp**, with the
  largest deltas coming from `baseline-sparse-candidate` and
  `bm25-sparse-candidate-w30-70` (both −2.09 pp DGX vs SKORGE).
* **Mean Δ across the 58 strategies: −0.02 pp.**
* **Mean Pearson r across the 58 strategies: 0.948.**
* DGX is **1.64×** slower in aggregate.
* `minicoil-all`, `minicoil-candidate`, and `bm25-candidate` are
  the three strategies where DGX is actually **faster** than
  SKORGE (0.68–0.73× ratio); all are SIMD/IO-bound rather than
  GPU-bound.

The full 58-row table appears in §7.2.

### 5.2 LLM-augmented retriever — per-model snapshot

The `max |Δacc|` column is the **single worst per-strategy accuracy
gap** within each model's 23 strategies. The cells where this exceeds
3 pp are listed in §3.3.

| Model | mean Δacc (pp) | max \|Δacc\| (pp) | mean r | SK trunc | DG trunc |
|---|---:|---:|---:|---:|---:|
| gemma-4-e2b-it       | −0.00 | 0.21 | 0.914 | 0 | 0 |
| gpt-oss-20b *(see §3.3)* | +0.49 | **9.80** | 0.847 | **1358** | 0 |
| ministral-3-14b      | −0.04 | 1.30 | 0.876 | 1 | 0 |
| ministral-3-3b       | −0.55 | 1.98 | 0.806 | 0 | 0 |
| ministral-3-8b       | −0.14 | 1.20 | 0.880 | 1 | 0 |
| nemotron-nano-9b-v2  | +0.07 | 1.00 | 0.905 | 0 | 0 |
| nemotron-nano-12b-v2 | +0.19 | **3.16** | 0.908 | 0 | 0 |
| qwen3.5-0.8b         | +0.29 | **12.38** | 0.840 | 0 | 0 |
| qwen3.5-2b           | +0.26 | **8.43** | 0.852 | 0 | 0 |

DGX's `max_tokens=None` setting (for 7 of 9 models) means DGX truncates
**zero** samples on every LLM-augmented retriever pair. SKORGE
truncation is concentrated on `gpt-oss-20b`: 1358 truncated samples
across its 23 strategies, of which 1137 (84%) come from
`llm-direct-match-all` alone (§3.3).

---

## 6. Excluded from comparison

| Path | Reason |
|---|---|
| `_archive/DGX_Spark/Retriever_Benchmarking/llama-3.1-8b/` (23 files) | DGX-only model; no SKORGE counterpart. |
| `_archive/DGX_Spark/Retriever_Benchmarking/gpt-oss-20b/` (2 files) | Aborted (May 2 — no `header.json`) and a deliberate 74-sample re-run subset (May 3). |
| `_archive/SKORGE/Retriever_Benchmarking/_logs/` (12 `.log` files) | stdout/stderr text from runs; not eval data. |

All archived items are reversible; see `_archive/` for the on-disk
locations. The cross-machine comparison in §3–§5 uses only the
548 production files.

---

## 7. Full per-strategy tables

### 7.1 gpt-oss-20b — all 23 strategies

| strategy | SK acc | DG acc | Δpp | SK h | DG h | ratio | SK trunc | DG trunc | agree % | r |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25-llm-rerank-all | 88.83 % | 88.73 % | −0.10 | 1.83 | 7.09 | 3.88× | 23 | 0 | 98.6 | 0.930 |
| cascade-rrf-ce-llm-all | 93.08 % | 93.21 % | +0.12 | 1.92 | 7.05 | 3.67× | 22 | 0 | 98.3 | 0.869 |
| dense-llm-rerank-all | 94.96 % | 95.11 % | +0.14 | 1.74 | 6.57 | 3.76× | 5 | 0 | 99.0 | 0.890 |
| fast-selective-dense-all | 94.28 % | 94.34 % | +0.06 | 1.31 | 5.22 | 3.97× | 13 | 0 | 99.2 | 0.930 |
| **llm-direct-match-all** | **85.51 %** | **95.32 %** | **+9.80** | **15.93** | **140.46** | **8.81×** | **1137** | **0** | **89.0** | **0.430** |
| llm-direct-match-candidate | 64.57 % | 64.78 % | +0.20 | 2.65 | 9.21 | 3.48× | 7 | 0 | 93.3 | 0.854 |
| llm-listwise-rerank-dense-all | 93.88 % | 93.88 % | +0.00 | 2.36 | 7.72 | 3.27× | 0 | 0 | 98.9 | 0.902 |
| llm-listwise-rerank-dense-candidate | 57.41 % | 57.53 % | +0.12 | 2.85 | 9.06 | 3.18× | 0 | 0 | 91.5 | 0.825 |
| persona-filter-rrf-all | 77.72 % | 78.10 % | +0.38 | 0.99 | 3.42 | 3.46× | 6 | 0 | 95.6 | 0.873 |
| query-expand-rrf-all | 92.47 % | 92.59 % | +0.12 | 1.34 | 5.37 | 4.00× | 18 | 0 | 97.3 | 0.803 |
| rrf-llm-oos-k10-candidate | 62.99 % | 63.05 % | +0.06 | 1.51 | 5.32 | 3.53× | 7 | 0 | 93.9 | 0.869 |
| rrf-llm-oos-k3-candidate | 59.54 % | 59.88 % | +0.35 | 1.17 | 4.88 | 4.16× | 6 | 0 | 95.5 | 0.907 |
| rrf-llm-oos-k7-candidate | 62.52 % | 62.77 % | +0.26 | 1.45 | 5.24 | 3.62× | 11 | 0 | 94.8 | 0.888 |
| rrf-llm-rerank-k10-all | 95.43 % | 95.35 % | −0.08 | 1.79 | 6.69 | 3.74× | 7 | 0 | 98.5 | 0.833 |
| rrf-llm-rerank-k15-all | 95.57 % | 95.58 % | +0.01 | 2.13 | 7.79 | 3.66× | 10 | 0 | 98.6 | 0.839 |
| rrf-llm-rerank-k3-all | 94.32 % | 94.44 % | +0.12 | 1.03 | 3.96 | 3.83× | 4 | 0 | 98.6 | 0.871 |
| rrf-llm-rerank-k5-all | 95.11 % | 95.13 % | +0.02 | 1.33 | 4.97 | 3.75× | 9 | 0 | 98.9 | 0.886 |
| rrf-llm-rerank-k7-all | 95.45 % | 95.22 % | −0.23 | 1.51 | 5.69 | 3.78× | 5 | 0 | 98.7 | 0.857 |
| rrf-selective-llm-agree2-all | 94.82 % | 94.80 % | −0.02 | 0.60 | 2.33 | 3.88× | 2 | 0 | 98.6 | 0.861 |
| rrf-selective-llm-agree3-all | 95.47 % | 95.40 % | −0.07 | 1.12 | 4.24 | 3.77× | 9 | 0 | 98.6 | 0.844 |
| rrf-selective-llm-agree3-oos-all | 95.41 % | 95.59 % | +0.17 | 1.07 | 4.36 | 4.08× | 12 | 0 | 98.7 | 0.844 |
| rrf-selective-llm-scoregap-all | 93.12 % | 93.20 % | +0.07 | 2.09 | 7.17 | 3.43× | 39 | 0 | 98.5 | 0.881 |
| sparse-llm-rerank-all | 94.21 % | 94.02 % | −0.18 | 1.73 | 6.44 | 3.72× | 6 | 0 | 97.8 | 0.799 |

### 7.2 Allarma baseline (no LLM) — all 58 strategies

Only the columns that vary meaningfully are shown.

| strategy | SK acc | DG acc | Δpp | SK h | DG h | ratio | agree % | r |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline-dense-all | 91.30 % | 91.33 % | +0.03 | 0.02 | 0.04 | 1.75× | 100.0 | 0.998 |
| baseline-dense-candidate | 51.50 % | 51.50 % | +0.00 | 0.02 | 0.04 | 1.75× | 100.0 | 1.000 |
| baseline-hybrid-all | 89.32 % | 89.22 % | −0.10 | 0.03 | 0.04 | 1.74× | 93.2 | 0.644 |
| baseline-hybrid-candidate | 49.76 % | 50.45 % | +0.69 | 0.02 | 0.04 | 1.75× | 86.5 | 0.730 |
| baseline-sparse-all | 86.45 % | 86.47 % | +0.02 | 0.01 | 0.01 | 1.19× | 98.8 | 0.948 |
| baseline-sparse-candidate | 49.25 % | 47.15 % | **−2.09** | 0.01 | 0.01 | 1.07× | 96.6 | 0.932 |
| bm25-all | 71.35 % | 71.37 % | +0.02 | 0.01 | 0.01 | 1.32× | 99.6 | 0.991 |
| bm25-candidate | 33.97 % | 34.05 % | +0.08 | 0.01 | 0.00 | 0.68× | 99.8 | 0.996 |
| bm25-dense-all-w30-70 | 91.32 % | 91.33 % | +0.01 | 0.03 | 0.05 | 1.74× | 100.0 | 0.998 |
| bm25-dense-all-w50-50 | 71.35 % | 71.37 % | +0.02 | 0.03 | 0.05 | 1.71× | 99.6 | 0.991 |
| bm25-dense-all-w70-30 | 71.35 % | 71.37 % | +0.02 | 0.03 | 0.05 | 1.77× | 99.6 | 0.991 |
| bm25-dense-candidate-w30-70 | 51.50 % | 51.50 % | +0.00 | 0.02 | 0.04 | 1.76× | 100.0 | 1.000 |
| bm25-dense-candidate-w50-50 | 33.97 % | 34.05 % | +0.08 | 0.02 | 0.04 | 1.75× | 99.8 | 0.996 |
| bm25-dense-candidate-w70-30 | 33.97 % | 34.05 % | +0.08 | 0.02 | 0.04 | 1.75× | 99.8 | 0.996 |
| bm25-hybrid-all-w30-70 | 88.90 % | 89.08 % | +0.18 | 0.03 | 0.05 | 1.70× | 93.3 | 0.657 |
| bm25-hybrid-all-w50-50 | 71.35 % | 71.37 % | +0.02 | 0.03 | 0.05 | 1.73× | 99.6 | 0.991 |
| bm25-hybrid-all-w70-30 | 71.35 % | 71.37 % | +0.02 | 0.03 | 0.05 | 1.72× | 99.6 | 0.991 |
| bm25-hybrid-candidate-w30-70 | 50.37 % | 50.45 % | +0.08 | 0.03 | 0.04 | 1.70× | 86.7 | 0.735 |
| bm25-hybrid-candidate-w50-50 | 33.97 % | 34.05 % | +0.08 | 0.03 | 0.04 | 1.71× | 99.8 | 0.996 |
| bm25-hybrid-candidate-w70-30 | 33.97 % | 34.05 % | +0.08 | 0.03 | 0.04 | 1.73× | 99.8 | 0.996 |
| bm25-sparse-all-w30-70 | 86.43 % | 86.47 % | +0.04 | 0.01 | 0.02 | 1.30× | 98.8 | 0.947 |
| bm25-sparse-all-w50-50 | 71.35 % | 71.37 % | +0.02 | 0.01 | 0.02 | 1.30× | 99.6 | 0.991 |
| bm25-sparse-all-w70-30 | 71.35 % | 71.37 % | +0.02 | 0.01 | 0.02 | 1.31× | 99.6 | 0.991 |
| bm25-sparse-candidate-w30-70 | 49.58 % | 47.48 % | **−2.09** | 0.01 | 0.01 | 1.20× | 96.6 | 0.932 |
| bm25-sparse-candidate-w50-50 | 33.97 % | 34.05 % | +0.08 | 0.01 | 0.01 | 1.17× | 99.8 | 0.996 |
| bm25-sparse-candidate-w70-30 | 33.97 % | 34.05 % | +0.08 | 0.01 | 0.01 | 1.23× | 99.8 | 0.996 |
| ce-rerank-bge-base-dense-all | 87.38 % | 87.40 % | +0.02 | 0.04 | 0.07 | 1.67× | 99.8 | 0.993 |
| ce-rerank-bge-base-dense-candidate | 38.72 % | 38.72 % | +0.00 | 0.04 | 0.08 | 1.73× | 100.0 | 1.000 |
| ce-rerank-bge-base-hybrid-candidate | 38.72 % | 38.50 % | −0.21 | 0.05 | 0.08 | 1.69× | 99.4 | 0.988 |
| ce-rerank-bge-v2m3-dense-candidate | 51.92 % | 51.92 % | +0.00 | 0.06 | 0.12 | 1.94× | 100.0 | 1.000 |
| ce-rerank-bge-v2m3-hybrid-candidate | 52.57 % | 52.51 % | −0.06 | 0.06 | 0.12 | 1.87× | 99.6 | 0.991 |
| colbert-all | 91.49 % | 91.52 % | +0.03 | 0.02 | 0.06 | 2.63× | 100.0 | 0.998 |
| colbert-candidate | 49.72 % | 49.74 % | +0.02 | 0.02 | 0.05 | 2.28× | 99.9 | 0.998 |
| minicoil-all | 92.88 % | 92.81 % | −0.07 | 0.10 | 0.08 | **0.73×** | 99.9 | 0.995 |
| minicoil-candidate | 52.78 % | 52.78 % | +0.00 | 0.10 | 0.08 | **0.73×** | 100.0 | 1.000 |
| multivector-dense | 90.84 % | 90.85 % | +0.01 | 0.03 | 0.05 | 1.77× | 100.0 | 0.999 |
| multivector-hybrid | 90.52 % | 90.68 % | +0.16 | 0.03 | 0.05 | 1.74× | 97.5 | 0.854 |
| multivector-sparse | 86.31 % | 86.13 % | −0.18 | 0.01 | 0.01 | 1.12× | 97.8 | 0.906 |
| parentchild-ce-rerank-gte-dense | 91.75 % | 91.83 % | +0.08 | 0.04 | 0.08 | 1.78× | 99.9 | 0.993 |
| parentchild-ce-rerank-gte-hybrid | 92.25 % | 92.30 % | +0.05 | 0.04 | 0.08 | 1.77× | 99.3 | 0.949 |
| parentchild-ce-rerank-gte-sparse | 89.68 % | 89.84 % | +0.15 | 0.03 | 0.05 | 1.70× | 99.0 | 0.946 |
| parentchild-manual-dense | 90.84 % | 90.85 % | +0.01 | 0.03 | 0.04 | 1.68× | 100.0 | 0.999 |
| parentchild-manual-hybrid | 90.41 % | 90.79 % | +0.38 | 0.03 | 0.05 | 1.74× | 96.7 | 0.807 |
| parentchild-manual-sparse | 86.19 % | 86.36 % | +0.17 | 0.01 | 0.01 | 1.14× | 97.8 | 0.909 |
| parentdoc-dense | 90.84 % | 90.85 % | +0.01 | 0.03 | 0.04 | 1.73× | 100.0 | 0.999 |
| parentdoc-hybrid | 90.31 % | 90.30 % | −0.01 | 0.03 | 0.05 | 1.70× | 96.2 | 0.782 |
| parentdoc-sparse | 86.25 % | 86.28 % | +0.03 | 0.01 | 0.01 | 1.15× | 98.4 | 0.931 |
| rrf-ce-rerank-bge-base-all | 86.61 % | 86.58 % | −0.03 | 0.05 | 0.09 | 1.74× | 99.2 | 0.964 |
| rrf-ce-rerank-bge-base-candidate | 38.68 % | 38.59 % | −0.08 | 0.06 | 0.11 | 1.77× | 99.6 | 0.991 |
| rrf-ce-rerank-bge-large-all | 91.01 % | 91.01 % | +0.00 | 0.07 | 0.13 | 1.97× | 99.6 | 0.976 |
| rrf-ce-rerank-bge-v2m3-all | 92.62 % | 92.71 % | +0.08 | 0.07 | 0.13 | 1.90× | 99.8 | 0.988 |
| rrf-dense-sparse-all | 91.73 % | 91.86 % | +0.13 | 0.03 | 0.05 | 1.67× | 99.2 | 0.945 |
| rrf-dense-sparse-bm25-all | 91.38 % | 91.33 % | −0.05 | 0.03 | 0.05 | 1.72× | 99.0 | 0.939 |
| rrf-dense-sparse-bm25-candidate | 51.16 % | 51.17 % | +0.01 | 0.03 | 0.05 | 1.75× | 97.6 | 0.952 |
| rrf-dense-sparse-candidate | 53.05 % | 52.87 % | −0.18 | 0.03 | 0.05 | 1.68× | 98.4 | 0.968 |
| setfit-classifier | 88.55 % | 89.23 % | +0.68 | 0.03 | 0.06 | 1.97× | 95.9 | 0.792 |
| two-stage-dense-colbert-all | 91.68 % | 91.70 % | +0.02 | 0.05 | 0.09 | 1.93× | 100.0 | 0.997 |
| two-stage-dense-colbert-candidate | 49.63 % | 49.66 % | +0.03 | 0.05 | 0.09 | 1.93× | 100.0 | 0.999 |

---

## 8. What it is safe to claim in the paper

1. **The retriever benchmark is reproducible cross-machine for
   inputs.** Every sample id, every prompt, every dataset row is
   byte-identical between the SKORGE and DGX runs (2.6 M comparisons,
   100 % match).
2. **Headline metrics are internally consistent.** For all 548
   production `.eval` files, the headline metric value reported by
   Inspect AI can be reproduced exactly from the per-sample data,
   using the correct subset semantics for `accuracy_in_scope` and
   `accuracy_oos`.
3. **Aggregate cross-machine accuracy is close.** The mean Δ
   accuracy across each model's strategies is within ±0.55 pp for
   all 10 model sweeps (range −0.55 pp on ministral-3-3b to
   +0.49 pp on gpt-oss-20b). However, this **per-model mean
   conceals per-strategy spread**: §3.3 lists 4 individual
   (model, strategy) cells with |Δ| > 3 pp, of which exactly one
   (`gpt-oss-20b / llm-direct-match-all`, +9.80 pp) is fully
   explained by the `max_tokens` configuration difference. The
   other three large divergences
   (`qwen3.5-0.8b / rrf-llm-rerank-k15-all` +12.38 pp,
   `qwen3.5-2b / rrf-llm-rerank-k15-all` +8.43 pp,
   `nemotron-nano-12b-v2 / llm-listwise-rerank-dense-candidate`
   +3.16 pp) are not eliminated by max_tokens parity (the qwen
   pair used 8192 on both sides and produced zero truncated
   samples on either side) and are reported as observed.
4. **DGX is slower per sample than SKORGE on 261 of 265 retriever
   pairs.** Per-pair ratios span **0.48× to 11.90×**. Aggregating
   by model, the 9 LLM-augmented sweeps fall in the **2.03×–5.25×**
   range while the no-LLM `allarma-retriever-benchmark` is 1.64×;
   four specific pairs (three allarma + one nemotron-9b LLM-
   augmented strategy) are *faster* on DGX (§3.1).
5. **Per-sample agreement is high but not perfect.** The
   *per-model mean* Pearson r ranges from **0.806** (ministral-3-3b)
   to **0.948** (allarma baseline); individual (model, strategy)
   pair r values span a wider range, **0.430** to **1.000**. The
   lowest r is `gpt-oss-20b / llm-direct-match-all` (the
   max_tokens-affected pair). Some residual disagreement is
   sampling noise at `temperature = 1.0` that Inspect AI applies
   to specific scorer subcalls.

## What it is **not** safe to claim

1. That DGX yields a "better" or "worse" model. Mean per-model
   accuracy deltas are within ±0.55 pp, which is below the
   typical run-to-run variation we would expect on a single
   machine. However, **four individual (model, strategy) cells do
   diverge by 3 pp or more** between the two machines (§3.3) —
   one explainable by configuration, three not yet fully
   explained. Any quoted single-cell number from one machine
   should not be presented as the other machine's expected value.
2. That the `gpt-oss-20b / llm-direct-match-all` DGX accuracy is
   the "true" model capability. It is the value obtained without
   `max_tokens` capping and with 74 missing samples; the SKORGE
   value is the value with `max_tokens = 8192` and full sample
   coverage. Both are defensible, neither is canonical.
3. That the unexplained qwen3.5-{0.8b,2b} divergences on
   `rrf-llm-rerank-k15-all` are noise. Both reach Δ > 8 pp with
   identical `max_tokens` and zero truncation; the lower
   per-sample correlations (0.459 and 0.526) suggest these are
   genuine model-behavior differences across the two runs
   (different commit, possibly different vLLM build), not just
   sampling noise.
4. That the timing ratios generalize to other workloads. They
   reflect this specific dataset, vLLM serving setup, and Inspect
   AI batching parameters at the time of the runs.

---

## 9. Reproducing this report

* Input directory tree: `APPLIED_ENERGY_WRITEUP/{SKORGE,DGX_Spark}/Retriever_Benchmarking/`.
* All cached pickles used to produce these numbers:
  * `/tmp/deep_audit_results.pkl` — per-file deep parse of all 548 files.
  * `/tmp/full_audit_augmented.pkl` — adds token totals and full
    headline-metrics maps.
  * `/tmp/cross_machine_pairs.pkl` — 274 paired records.
  * `/tmp/model_summaries.pkl` — 10 per-model aggregates.
* Archive (excluded items): `APPLIED_ENERGY_WRITEUP/_archive/`.
* No `.eval` files were modified during the audit; only directory
  renames and folder moves were performed, and each is reversible
  by an inverse `mv`.
