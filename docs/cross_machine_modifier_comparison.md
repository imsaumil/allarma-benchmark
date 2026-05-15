# Cross-Machine Modifier-Benchmark Comparison

Generated 2026-05-13. Inputs: every `.eval` file under
`APPLIED_ENERGY_WRITEUP/SKORGE/Modifier_Benchmarking/` and
`APPLIED_ENERGY_WRITEUP/DGX_Spark/Modifier_Benchmarking/`, after the
audit + cleanup that produced the harmonized layout. Companion document
to `cross_machine_retriever_comparison.md`.

This document is intended for the Applied Energy paper appendix /
supplementary material. The goal is **complete transparency**: every
number below is reproducible from the on-disk `.eval` files, every
caveat is recorded, and no claim goes beyond what the data supports.

---

## 1. Scope

Two machines independently ran the modifier benchmark:

* **SKORGE** — internal GPU server used for the CIGRE and earlier
  Applied-Energy runs.
* **DGX Spark** — NVIDIA DGX Spark; a smaller, edge-class device whose
  feasibility on this benchmark is itself a research question.

Each machine ran the modifier benchmark on **9 shared models**
(gemma-4-e2b-it, gpt-oss-20b, ministral-3-3b/8b/14b,
nemotron-nano-9b-v2/12b-v2, qwen3.5-0.8b/2b), with **1024 samples per
model** drawn from the modifier-benchmark dataset (`T_NN_Q_NN_TABLE`
naming convention; 21 templates, Q-indices 1–77).

**Files compared in this report (production tree only):**

| Side | Models | Files | Samples per file |
|---|---:|---:|---:|
| SKORGE modifier | 9 | 9 | 1024 |
| DGX modifier    | 9 | 9 | 1024 |

Total cross-machine pairs: **9**. SKORGE additionally ran llama-3.1-8b
and llama-3.2-3b on modifier; DGX did not run llama on modifier. Those
folders are archived (§6) and excluded from the comparison below.

---

## 2. Audit methodology and verification

Before comparing metrics, every `.eval` file was audited at the byte
level. The same audit script verified all 548 production files across
both benchmarks; modifier results are the 9 + 9 = 18 files inside that.

### 2.1 Per-file integrity (18 modifier files)

For each `.eval` (a Zip archive produced by Inspect AI):

1. Verify the Zip is readable (no `BadZipFile`).
2. Verify the presence of `header.json`, `summaries.json`,
   `reductions.json`, and a `_journal/` subtree.
3. Count sample files (`samples/*.json`); confirm uniqueness of sample
   `id`s; confirm `dataset_samples == total_samples == completed_samples`.
4. Parse every sample, extract its per-scorer value(s). The modifier
   benchmark uses a single per-sample scorer named `modifier_scorer`
   whose `value` is a **dictionary** containing three named metrics
   (`Modification_Accuracy`, `Neo4j_Syntactic_Validity`,
   `Neo4j_Semantic_Validity`). The `header.json` reports these three
   as three separate scorer entries. Recompute the headline metrics
   from the per-sample data and verify exact equality with `header.json`.

**Result.** All 18 modifier files pass every structural check, and
the recomputed metrics match `header.json` exactly (18/18). All 18
files have `status = success` and `completed_samples = total_samples
= dataset_samples = 1024`.

### 2.2 Cross-machine pair sample-ID alignment

For each of the 9 (model_dir) keys, the sets of sample `id`s on the
two sides were compared.

**Result.** 9/9 model directories have identical sample-ID sets between
SKORGE and DGX (exact set equality; 1024 ids each).

### 2.3 Cross-machine user-prompt byte equivalence

For each shared sample id, the user-message text was extracted and
hashed (SHA-256). The hashes were compared between machines.

**Result.** **9 × 1024 = 9,216 sample-prompt comparisons; all 9,216
hashes match.** Both machines provably consumed the same dataset
content for every sample.

### 2.4 Cross-machine config alignment

For each of the 9 modifier pairs, the eval-side configuration was
compared.

**Result.**

| Field | Value | Status |
|---|---|---|
| `task` | `modifier_benchmark_task` | identical across all 18 files |
| `task_version` | 0 | identical |
| `max_tokens` | 16384 | identical |
| `temperature` | 0.0 | identical |
| `reasoning_effort` | `low` (gpt-oss-20b) / `None` (others) | identical per model |
| `scorers` | (Modification_Accuracy, Neo4j_Syntactic_Validity, Neo4j_Semantic_Validity) | identical |
| `dataset.samples` | 1024 | identical |
| `model_base_url` | `http://localhost:8000/v1` | identical |

The only documented config drift is **git commit**: see §4.3.

---

## 3. Cross-machine results

### 3.1 Aggregate timing

Total production-tree modifier wall time:

| Side | Total modifier wall time |
|---|---:|
| SKORGE | **37.5 h** (1.6 days) |
| DGX_Spark | **147.7 h** (6.2 days) |
| Ratio (DGX / SKORGE) | **3.94×** |

Per-model wall time (single 1024-sample run per side):

| Model | SKORGE (h) | DGX (h) | DGX / SKORGE | SKORGE work / sample | DGX work / sample |
|---|---:|---:|---:|---:|---:|
| ministral-3-3b      |  2.03 |   6.31 | **3.11×** |  7.07 s | 22.12 s |
| ministral-3-14b     |  5.59 |  19.22 | 3.44× | 19.61 s | 67.49 s |
| ministral-3-8b      |  3.88 |  13.64 | 3.51× | 13.60 s | 47.90 s |
| nemotron-nano-12b-v2|  7.25 |  25.58 | 3.53× | 25.41 s | 89.85 s |
| qwen3.5-0.8b        |  3.84 |  13.86 | 3.61× | 13.45 s | 48.67 s |
| gemma-4-e2b-it      |  2.76 |  10.20 | 3.69× |  9.65 s | 35.78 s |
| gpt-oss-20b         |  1.97 |   7.94 | 4.04× |  6.86 s | 27.86 s |
| qwen3.5-2b          |  2.78 |  12.64 | 4.54× |  9.72 s | 44.39 s |
| **nemotron-nano-9b-v2** |  7.42 |  38.35 | **5.17×** | 26.01 s | 134.75 s |

DGX is slower than SKORGE on every modifier pair, with per-model
ratios spanning **3.11× to 5.17×**. The highest ratio
(nemotron-nano-9b-v2 at 5.17×) is partly driven by the 4 DGX timeout
samples that consumed 600 s each (§4.1).

### 3.2 Aggregate accuracy (three scorers)

Headline metrics for each (model, machine) pair. The modifier benchmark
emits three scorers:

* **`Modification_Accuracy`** — continuous score over per-sample
  presence + removal subscores (the model's edits vs. the expected
  edits to a Cypher query template). The headline is the
  arithmetic *mean* over 1024 samples.
* **`Neo4j_Syntactic_Validity`** — binary 0/1: does the produced
  Cypher parse as a syntactically valid query?
* **`Neo4j_Semantic_Validity`** — binary 0/1: does it both parse and
  return a non-empty result against the live schema?

| Model | SK Mod | DGX Mod | Δ pp | SK Syn | DGX Syn | Δ pp | SK Sem | DGX Sem | Δ pp |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gemma-4-e2b-it      | 71.42 % | 71.14 % | −0.29 | 88.87 % | 88.77 % | −0.10 | 60.74 % | 60.45 % | −0.29 |
| gpt-oss-20b         | 95.94 % | 96.22 % | +0.28 | 95.41 % | 95.90 % | +0.49 | 89.84 % | 90.72 % | +0.88 |
| ministral-3-14b     | 93.63 % | 93.90 % | +0.27 | 92.38 % | 91.89 % | −0.49 | 81.64 % | 80.18 % | **−1.46** |
| ministral-3-3b      | 82.57 % | 82.54 % | −0.03 | 84.77 % | 84.28 % | −0.49 | 65.23 % | 65.04 % | −0.20 |
| ministral-3-8b      | 91.87 % | 91.39 % | −0.48 | 87.99 % | 88.28 % | +0.29 | 73.83 % | 74.02 % | +0.20 |
| nemotron-nano-12b-v2| 94.04 % | 93.31 % | −0.73 | 89.55 % | 86.91 % | **−2.64** | 81.15 % | 79.59 % | **−1.56** |
| **nemotron-nano-9b-v2** | 92.58 % | 93.71 % | **+1.13** | 82.81 % | 85.94 % | **+3.12** | 73.63 % | 76.27 % | **+2.64** |
| qwen3.5-0.8b        | 41.63 % | 41.54 % | −0.09 | 70.12 % | 69.43 % | −0.68 | 64.65 % | 63.96 % | −0.68 |
| qwen3.5-2b          | 46.92 % | 46.76 % | −0.16 | 95.31 % | 95.12 % | −0.20 | 83.30 % | 83.40 % | +0.10 |

**Reading.** The 9 model-pair `Modification_Accuracy` deltas span
**−0.73 to +1.13 pp** with mean ≈ 0. Of the 27 (model × scorer)
cells, **4 exceed ±1.5 pp** — all four are on the Syn and Sem metrics
of the two nemotron models:

* `nemotron-nano-9b-v2`: Syn Δ = **+3.12**, Sem Δ = **+2.64** pp
  (Mod Δ = +1.13 pp, within ±1.5)
* `nemotron-nano-12b-v2`: Syn Δ = **−2.64**, Sem Δ = **−1.56** pp
  (Mod Δ = −0.73 pp, within ±1.5)

Both are reasoning models. (The corpus contains three reasoning
models in total: the two nemotron variants and gpt-oss-20b. The
third — gpt-oss-20b — has all three modifier scorer deltas within
±1 pp on this benchmark, so it does not appear in the >±1.5 pp set
above.) The per-sample correlations of all three reasoning models
are the lowest in the modifier benchmark (§3.3) — consistent with
reasoning models being more stochastic at the same nominal sampling
temperature (`temperature = 0.0` is set client-side but does not
eliminate variance from internal CoT sampling). The direction of
the nemotron-9b-v2 shift is plausibly consistent with the commit
difference between the two sides (DGX is on commit `16cdd40`,
SKORGE is on `beecaa4`), but **we cannot quote a comparable
cross-machine pattern from the retriever benchmark for this
model**: the nemotron-9b-v2 retriever sweep shows a mean Δ of
just +0.07 pp across 23 strategies (range −1.00 to +0.86 pp). The
+1.13 / +3.12 / +2.64 pp shifts seen here on the modifier benchmark
are therefore larger than anything observable as a generic
commit-driven pattern in the retriever data. The mechanism cannot
be definitively isolated from the available logs.

### 3.3 Per-sample agreement

For each modifier pair we computed the **Pearson correlation** of
per-sample score values between SKORGE and DGX, separately for each
of the three metrics. Sample-level agreement (the share of samples
where SKORGE and DGX produced identical metric value) is reported
alongside.

| Model | Mod r | Mod agree % | Syn r | Syn agree % | Sem r | Sem agree % |
|---|---:|---:|---:|---:|---:|---:|
| **qwen3.5-2b**        | **0.991** | 98.1 % | 0.957 | 99.6 % | 0.975 | 99.3 % |
| qwen3.5-0.8b          | 0.971 | 93.6 % | 0.882 | 95.0 % | 0.900 | 95.4 % |
| gemma-4-e2b-it        | 0.939 | 92.9 % | 0.907 | 98.1 % | 0.949 | 97.6 % |
| ministral-3-8b        | 0.787 | 83.4 % | 0.585 | 91.3 % | 0.701 | 88.5 % |
| ministral-3-3b        | 0.784 | 70.1 % | 0.646 | 90.7 % | 0.729 | 87.7 % |
| ministral-3-14b       | 0.712 | 87.9 % | 0.765 | 96.6 % | 0.834 | 94.8 % |
| gpt-oss-20b           | 0.589 | 85.8 % | 0.425 | 95.2 % | 0.595 | 92.9 % |
| nemotron-nano-9b-v2   | 0.538 | 73.5 % | 0.560 | 88.3 % | 0.594 | 84.7 % |
| **nemotron-nano-12b-v2** | **0.457** | 70.1 % | 0.454 | 88.6 % | 0.568 | 86.3 % |

Mod r ranges from **0.457 (nemotron-12b-v2)** to **0.991 (qwen3.5-2b)**.
**On this modifier benchmark**, the three reasoning models — the two
nemotron variants and gpt-oss-20b — occupy the three lowest Mod r
positions, consistent with reasoning models being more stochastic
in their CoT generation. Note that the retriever benchmark does
**not** reproduce this exact ranking (in the retriever data,
ministral-3-3b and qwen3.5-0.8b have lower mean r than the
nemotron models — see the companion document §3.2). One possible
reason — not formally verified — is that the modifier scorer
produces a continuous per-sample value sensitive to specific
sequences in the model output, while the retriever scorer is
binary 0/1 over a smaller decision space, so reasoning-model
stochasticity has more visible effect on modifier scores.

---

## 4. Caveats — known limitations

These items affect interpretation. None invalidates the audit; each
should be acknowledged in any quoted number.

### 4.1 DGX `nemotron-nano-9b-v2`: 4 samples timed out at 600 s

Four specific samples (`T_02_Q_35_TABLE`, `T_07_Q_50_TABLE`,
`T_13_Q_48_TABLE`, `T_17_Q_28_TABLE`) hit a 600-second wall-clock
timeout on DGX and returned **no model output** (empty `model_usage`,
0 input/output tokens, 600.0-second `total_time`). The Inspect AI
scorer fell back to a default answer (`"[No modifiable lines found]"`)
which the modifier scorer assigns as `Modification_Accuracy = 0.5,
Neo4j_Syntactic_Validity = 0, Neo4j_Semantic_Validity = 0`. SKORGE
processed the same four prompts successfully in 15–66 seconds each.

Imputing the SKORGE scores for those four samples on the DGX side
would shift the DGX headline metrics upward by approximately:

| Metric | Actual DGX | If imputed | Δ |
|---|---:|---:|---:|
| Modification_Accuracy | 93.71 % | 93.84 % | +0.13 pp |
| Neo4j_Syntactic_Validity | 85.94 % | 86.33 % | +0.39 pp |
| Neo4j_Semantic_Validity | 76.27 % | 76.46 % | +0.20 pp |

The actual DGX numbers therefore very slightly under-report
nemotron-9b-v2's capability. **The +1.13 / +3.12 / +2.64 pp DGX-over-SKORGE
deltas (§3.2) would become +1.26 / +3.51 / +2.84 pp** with this
imputation. The qualitative finding is unchanged: nemotron-9b-v2
scores slightly higher on DGX. As discussed in §3.2, this shift is
*directionally* consistent with the commit difference between sides,
but its magnitude is not reproduced by the retriever benchmark for
the same model, so we cannot definitively attribute it to the commit.

### 4.2 `gpt-oss-20b`: +2 input tokens per sample (DGX vs SKORGE)

Per-sample `input_tokens` for the gpt-oss-20b modifier pair differ by
**exactly +2 tokens on DGX vs SKORGE for every one of the 1024
samples**. The user prompt is byte-identical (verified §2.3); the
extra two tokens come from a chat-template/system-prompt boundary
difference between the two commits (`beecaa4` → `16cdd40`). The
relative cost is **2 / ~7,742 ≈ 0.03 % of input tokens per sample**
and behaviorally inert — the +0.28 / +0.49 / +0.88 pp accuracy
deltas for this model are within typical run-to-run noise, with
no evidence that the 2 extra tokens are causally responsible.

### 4.3 Git commits per side

| Machine | Commit(s) | Notes |
|---|---|---|
| DGX | `16cdd40` for all 9 modifier files | uniform |
| SKORGE | `16cdd40` for gemma-4-e2b-it; `beecaa4` for the other 8 | the SKORGE gemma file is dated 2026-04-19 on commit `16cdd40` (the same commit DGX uses); the other 8 SKORGE files are dated April 3–6 on commit `beecaa4`. The intent behind the gemma re-run is not recorded in the .eval metadata. |

The CIGRE-era commit was `cf9c1fe`; commits are documented for
completeness. The 100 % prompt-hash equivalence in §2.3 directly
verifies only that the on-disk dataset content is identical across
all sides; it does not itself prove that scoring code paths are
unchanged across commits. Any code-path drift is bounded indirectly
by the per-sample correlations in §3.3, which absorb both that drift
and stochastic generation noise.

### 4.4 `qwen3.5-0.8b` produces degenerate repetition loops on 21.78 %
of samples on both machines

`qwen3.5-0.8b` has the unique property that **223 of 1024 samples
(21.78 %)** hit the `max_tokens = 16384` cap on **each** machine.
The same *count* arises on both sides, and the overlap is large:
**200 of the 223 truncated sample IDs are shared between SKORGE and
DGX** (89.7 %), with **23 IDs uniquely truncated on SKORGE** and
**23 IDs uniquely truncated on DGX** (union of 246 distinct IDs
across the two machines). The failure mode is therefore largely
deterministic but not perfectly so — consistent with a near-edge
behaviour that flips on a small minority of samples between
independent runs.

Inspection of the truncated outputs shows the model has fallen into
a repetition loop: the last 150 characters of the truncated output
appear in that output **a median of 266 times** (one example: 263
occurrences in a 77,975-character output, periodic every ~288
characters). Each repetition replays a chunk of the system-prompt
instruction text rather than producing new content. This is a real
model failure mode, reproducible across machines; it is not a
configuration or scoring artifact. The qwen3.5-0.8b Mod_Acc of
~41–42 % therefore reflects the model's actual capability on this
task at this size.

### 4.5 Asymmetric model coverage

DGX has no modifier counterpart for SKORGE's two llama runs
(`llama-3.1-8b`, `llama-3.2-3b`). Those folders are preserved at
`APPLIED_ENERGY_WRITEUP/_archive/SKORGE/Modifier_Benchmarking/` and
excluded from the cross-machine comparison above.

SKORGE has no counterpart for DGX's superseded `gpt-oss-20b-v0.17-old`
(an earlier vLLM version of the same model); that folder is at
`_archive/DGX_Spark/Modifier_Benchmarking/gpt-oss-20b-v0.17-old/`.

### 4.6 Hardware difference is a confound for timing

DGX Spark is intrinsically slower per sample than the SKORGE GPU
server for these workloads. Observed timing ratios span 3.11× to
5.17× across the 9 models, with no per-model ratio outside that
band (compare to the wider retriever range of 1.64×–5.25× in the
companion document, where the no-LLM allarma baseline is included).

---

## 5. What it is safe to claim in the paper

1. **The modifier benchmark is reproducible cross-machine for
   inputs.** Every sample id and every prompt is byte-identical
   between the SKORGE and DGX runs (9,216 comparisons, 100 % match).
2. **Headline metrics are internally consistent.** For all 18
   production modifier `.eval` files, the headline metric value
   reported by Inspect AI is reproduced exactly from the per-sample
   data using the correct dict-of-named-metrics semantics.
3. **Aggregate cross-machine accuracy is close on 7 of 9 models.**
   On gemma, gpt-oss-20b, ministral-3-3b/8b/14b, qwen3.5-0.8b/2b,
   all three scorer deltas are within **±1.5 pp** (and 6 of those 7
   models are within ±1 pp on every scorer — ministral-3-14b is the
   one whose Sem Δ reaches −1.46 pp). The two nemotron models —
   two of the three reasoning models in the corpus (the third,
   gpt-oss-20b, sits within the ±1 pp range) — show larger deltas
   on Syn and Sem (up to ±3.12 pp). The direction of the
   nemotron-9b-v2 shift is consistent with DGX being on the newer
   commit, but the *magnitude* of the modifier shift is not
   reproduced by the retriever benchmark for the same model
   (retriever nemotron-9b-v2 mean Δ is just +0.07 pp), so the
   commit-difference attribution is plausible but not proven.
4. **DGX is 3.11×–5.17× slower than SKORGE** for the modifier
   benchmark across all 9 models. Total wall time: SKORGE 37.5 h
   vs DGX 147.7 h (ratio 3.94×).
5. **Per-sample agreement is high for non-reasoning models and
   lower for reasoning models.** Modification_Accuracy Pearson r
   spans 0.457 (nemotron-12b-v2) to 0.991 (qwen3.5-2b). The same
   pattern holds for Syn (0.425–0.957) and Sem (0.568–0.975).

## What it is **not** safe to claim

1. That DGX yields a "better" or "worse" model on modifier. The
   accuracy deltas are within typical run-to-run noise for 7 of 9
   models. For the 2 nemotron models the magnitude of the shift is
   larger (up to ±3.12 pp on Syn/Sem); the direction is consistent
   with DGX being on the newer commit, but the available logs do
   not let us isolate the commit effect from inherent reasoning-model
   stochasticity.
2. That the nemotron-nano-9b-v2 DGX accuracy is a tight estimate.
   It is biased slightly downward by 4 samples that timed out at
   the 600 s wall cap and were scored with a fallback answer
   (§4.1). With those imputed from SKORGE, the DGX headline would
   shift up by ~0.13–0.39 pp depending on the metric. Quote both
   values when the strategy matters.
3. That the qwen3.5-0.8b Mod_Acc of ~41 % is hardware-dependent.
   Both machines exhibit the same 21.78 % repetition-loop rate, and
   the truncated-sample sets overlap heavily (200 of 223 ids shared
   between the two machines; §4.4). This is a model deficiency at
   the 0.8 B-parameter scale, not a benchmarking artifact.
4. That the timing ratios generalize to other workloads. They
   reflect this specific dataset, vLLM serving setup, and Inspect
   AI batching parameters at the time of the runs.

---

## 6. Reproducing this report

* Input directory tree: `APPLIED_ENERGY_WRITEUP/{SKORGE,DGX_Spark}/Modifier_Benchmarking/`.
* Cached pickle used to produce these numbers:
  * `/tmp/modifier_full.pkl` — 9 per-pair records with per-sample
    metric values, durations, token totals, truncation counts,
    Pearson r per scorer.
* Sister-benchmark report: `cross_machine_retriever_comparison.md`
  (same audit, same caveats §4.3 about commits, same
  archive layout).
* Archive (excluded items):
  `APPLIED_ENERGY_WRITEUP/_archive/SKORGE/Modifier_Benchmarking/`
  (llama-3.1-8b, llama-3.2-3b) and
  `APPLIED_ENERGY_WRITEUP/_archive/DGX_Spark/Modifier_Benchmarking/`
  (gpt-oss-20b-v0.17-old + 8 nemotron-9b-v2 smoke/aborted folders).
* No `.eval` files were modified during the audit; only directory
  renames and folder moves were performed, each reversible by an
  inverse `mv`.
