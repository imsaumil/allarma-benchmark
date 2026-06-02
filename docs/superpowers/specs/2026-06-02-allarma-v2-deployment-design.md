# aLLarMa v2 Dashboard Deployment — Design

**Date:** 2026-06-02
**Status:** Design pre-implementation; spec written after end-to-end verification of project state.
**Repo (dashboard):** `imsaumil/allarma-benchmark` (default branch `feat/v2-dashboard-rebuild`, HEAD `68ced95`)
**Companion to:** [2026-05-24 dashboard build design](2026-05-24-allarma-v2-dashboard-design.md) — that spec covered building the dashboard (now complete); this spec covers shipping it.

---

## 1. Goal

Ship the v2 (Applied Energy) dashboard and its companion InspectAI eval-log viewer so the URLs already advertised in the HF dataset README go from 404/503 to live, and every "Open in InspectAI viewer" link from the dashboard resolves to the correct eval. Constraint: stay within HF free `cpu-basic` and not incur recurring cost.

## 2. Current state (verified 2026-06-02)

**Dashboard build:** complete. 7 pre-extracted JSONs in `data/` (regenerated 2026-05-25); 6 JS modules; index.html, css/style.css, scripts/extract_data_full.py. The May 24 Phase A–F plan is executed (commit messages closely match the task list; Phases B–F visible in the most recent 20 commits, Phase A's `feat(extract)`/`fix(extract)` commits earlier). Working tree clean, in sync with origin.

**GitHub repo `imsaumil/allarma-benchmark`:** exists; default branch `feat/v2-dashboard-rebuild`; `has_pages: false`; `repos/.../pages` → 404.

**HF dataset `imsaumil/allarma-benchmark`:** complete and public. 548 `.eval` files (274 SKORGE + 274 DGX), 72.66 GB, last modified 2026-06-01. Layout `{skorge,dgx_spark}/{modifier,retriever}/<model_or_baseline>/*.eval`. README publicly references both deployment URLs as if they were live.

**HF Space `imsaumil/allarma-benchmark`:** Docker SDK selected; only `.gitattributes` (1.5 KB) and `README.md` (201 B frontmatter-only); `runtime.stage: NO_APP_FILE`; hardware `cpu-basic`; hostname `imsaumil-allarma-benchmark.hf.space` reserved.

**Three problems block launch:**
1. The Space has no app — the InspectAI viewer never starts.
2. GitHub Pages is not enabled — the static dashboard isn't served.
3. The dashboard's `buildLogUrl` (in `js/shared-utils.js:69`) omits the `machine` segment, but the dataset (and therefore the Space's mounted log tree) is laid out as `<machine>/<category>/<model>/<file>`. Eight call sites would produce 404 deep links once the Space is up.

## 3. Design principles

1. **Free-tier first.** No persistent storage charge; no compute upgrade.
2. **No download at boot.** The 67 GB dataset stays where it is; the Space mounts it as a read-only volume rather than snapshot-copying it into ephemeral disk.
3. **Stay within `cpu-basic` limits** (2 vCPU, 16 GB RAM, 50 GB ephemeral disk). 50 GB is not enough for snapshot — that drove the choice in (2).
4. **Touch only what shipping requires.** Dashboard internals are already feature-complete; this spec adds Space files, enables Pages, and fixes the one deep-link bug.
5. **Verify, don't trust.** Each gate in §7 runs against the live service and reports the observed result before the next step proceeds.

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  reader's browser                                                │
│                                                                  │
│   GET imsaumil.github.io/allarma-benchmark        ┌─────────┐    │
│   loads index.html + 6 JS + 7 JSONs ─────────────►│ GitHub  │    │
│                                                   │  Pages  │    │
│   click "Open in InspectAI viewer ↗"              └─────────┘    │
│   → imsaumil-allarma-benchmark.hf.space/                         │
│        #/logs/<machine>/<category>/<model>/<file>                │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  HF Space  imsaumil/allarma-benchmark   (Docker, cpu-basic)      │
│  python:3.11-slim                                                │
│   pip install inspect-ai                                         │
│   CMD inspect view start --log-dir /data --host 0.0.0.0          │
│                                            --port 7860           │
│  read-only mount:  /data                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────────────┐
                │  HF Dataset                  │
                │  imsaumil/allarma-benchmark  │
                │  548 .eval files, 67 GB      │
                │  skorge/  +  dgx_spark/      │
                └──────────────────────────────┘
```

## 5. Components

### 5.1 HF Space (`imsaumil/allarma-benchmark`)

Three files at repo root replacing the current empty shell:

**`Dockerfile`**
```dockerfile
FROM python:3.11-slim
RUN pip install --no-cache-dir inspect-ai
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
EXPOSE 7860
CMD ["/app/start.sh"]
```

**`start.sh`**
```sh
#!/bin/sh
exec inspect view start --log-dir /data --host 0.0.0.0 --port 7860
```

**`README.md`** — preserve existing frontmatter (`sdk: docker`, `app_port: 7860`, title, emoji, colors), append a short body that links to the dataset, dashboard, and paper.

### 5.2 Volume mount (configuration, not in repo)

```bash
hf spaces volumes set imsaumil/allarma-benchmark \
  -v hf://datasets/imsaumil/allarma-benchmark:/data
```
or equivalent Python (`HfApi.set_space_volumes` with `Volume(type="dataset", source="imsaumil/allarma-benchmark", mount_path="/data", read_only=True)`).

Mount is read-only by HF policy for dataset volumes — that matches our needs.

### 5.3 Dashboard deep-link fix

Single function, eight call sites.

**`js/shared-utils.js:69`** — extend signature with `machine`:
```js
function buildLogUrl(modelFolder, evalFile, benchmark, machine) {
  const category = benchmark === 'modifier' ? 'modifier' : 'retriever';
  const encodedFile = String(evalFile).replace(/\+/g, '%2B');
  return 'https://imsaumil-allarma-benchmark.hf.space/#/logs/' +
    machine + '/' + category + '/' + modelFolder + '/' + encodedFile;
}
```

**Call sites** (verified count of 8, confirmed by `grep -rn "buildLogUrl(" js/` on 2026-06-02 against `HEAD=68ced95`):
| File | Line | Caller | `machine` source |
|---|---|---|---|
| `js/retrieval-section.js` | 604 | per-row table cell payload | `row.machine` |
| `js/retrieval-section.js` | 658 | bar / drawer payload build | `r.machine` |
| `js/retrieval-section.js` | 862 | Compare-Δ scatter, SKORGE side | literal `'skorge'` |
| `js/retrieval-section.js` | 863 | Compare-Δ scatter, DGX side | literal `'dgx_spark'` |
| `js/modifier-section.js` | 371 | per-row table cell payload | `row.machine` |
| `js/modifier-section.js` | 404 | bar / drawer payload build | `r.machine` |
| `js/modifier-section.js` | 604 | Compare-Δ scatter, SKORGE side | literal `'skorge'` |
| `js/modifier-section.js` | 605 | Compare-Δ scatter, DGX side | literal `'dgx_spark'` |

Cache-bust by bumping the existing `?v=99` query string in `index.html` (lines 11, 73–78) to `?v=100`.

### 5.4 GitHub Pages enable

```bash
gh api repos/imsaumil/allarma-benchmark/pages -X POST \
  -f 'source[branch]=feat/v2-dashboard-rebuild' \
  -f 'source[path]=/'
```
No branch rename. Add a `.nojekyll` file at repo root to prevent Jekyll from rewriting any future `_`-prefixed paths (safe even though the current tree has none).

## 6. Data flow — verifying one deep link end-to-end

Using the canonical SKORGE gpt-oss-20b `llm_direct_match_all` row (verified 2026-06-02 from `data/retrieval-llm-summary.json`):

1. Dashboard JSON row:
   ```json
   {
     "machine": "skorge",
     "model_folder": "gpt-oss-20b",
     "eval_file": "2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval",
     "benchmark": "retriever-llm",
     "max_tokens": null,
     "metrics": { "accuracy": 0.918582 },
     "completed_samples": 9789, "samples": 9789
   }
   ```
2. Fixed `buildLogUrl(model_folder, eval_file, benchmark, machine)` produces:
   `https://imsaumil-allarma-benchmark.hf.space/#/logs/skorge/retriever/gpt-oss-20b/2026-03-09T20-47-38%2B00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval`
   (the `+` in the ISO timestamp is percent-encoded as `%2B` by the existing replace).
3. The Space's viewer is launched with `--log-dir /data`; `/data` is the dataset mount → the eval lives at `/data/skorge/retriever/gpt-oss-20b/2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval` (exactly the dataset path).
4. Viewer loads the eval; the URL fragment `#/logs/skorge/retriever/...` is what InspectAI's client-side router uses to resolve which file to display from its log index. ✓

## 7. Verification gates (run in order; do not skip)

1. **Local smoke test of deep-link fix.** Serve dashboard locally; click one row in each of {retrieval single, retrieval compare, modifier single, modifier compare}; observed URLs contain the machine segment.
2. **Space builds.** `hf spaces logs imsaumil/allarma-benchmark --build` ends in successful image push; `runtime.stage` transitions `BUILDING → RUNNING`.
3. **Volume mounted.** `HfApi().get_space_runtime("imsaumil/allarma-benchmark").volumes` includes the dataset volume at `/data` with `read_only=True`.
4. **Viewer responds.** `curl -sI https://imsaumil-allarma-benchmark.hf.space/` → 200.
5. **Viewer sees the corpus.** From the container (or via the viewer's HTTP API once it's known), the log count visible is ≥ 548. If the InspectAI viewer doesn't expose a count endpoint, fallback: `curl https://imsaumil-allarma-benchmark.hf.space/` and confirm the log-list UI shows at least the expected top-level `skorge/` and `dgx_spark/` entries.
6. **Pages live.** `curl -sI https://imsaumil.github.io/allarma-benchmark/` → 200; page loads with all 7 `data/*.json` fetches at 200; no console errors.
7. **End-to-end deep link.** Open the live Pages dashboard; click one row in each of the 4 sections; each link opens the right eval in the live viewer.
8. **No regressions on the v1 (CIGRE) artifacts** — these are frozen and must not be touched. Concretely: (a) v1 GH Pages dashboard `https://imsaumil.github.io/allarma-benchmark-eval-dashboard/` returns HTTP 200; (b) v1 Space `imsaumil/allarma-benchmark-logs` has `runtime.stage` unchanged from baseline (currently `RUNNING`, though the HTTP endpoint was returning 500 on 2026-06-02 — that's its pre-existing state, *not* introduced by this work, and out of scope to fix per the artifact-integrity rule); (c) v1 Space `lastModified` is still `2026-04-12T19:45:53Z` (i.e., I never pushed to it); (d) v1 dataset `imsaumil/allarma-benchmark-eval-logs` `lastModified` unchanged. Capture these four values *before* starting Phase 1 and re-check after every push.

## 8. Failure modes and fallbacks

| Risk | Detection | Fallback |
|---|---|---|
| `inspect view start` doesn't read mounted path transparently | Gate 4 or 5 fails (viewer doesn't start, or starts but reports zero / wrong-structured logs) | Switch to v1 pattern with paid persistent storage: add HF persistent storage (≈ $0.80/mo for 67 GB at $12/TB public), edit `start.sh` to `snapshot_download` from the dataset into the persistent path on first boot, restart Space. No other code changes. |
| Volume mount latency makes large evals slow | Manual timed open of a 200-MB eval | Same fallback as above. |
| Dataset-volume mount silently incurs cost | Billing review one week after go-live | If non-trivial, switch to paid persistent storage (cost is bounded — same as the fallback above). |
| Deep-link fix breaks a path I didn't notice | Local serve + click each section's drilldown (Gate 1) before push | Revert the JS commit; deep links revert to old broken behavior — fail-safe. |
| Pages enable triggers Jekyll that mangles assets | First fetch shows incorrect page | `.nojekyll` already at root prevents this. |

## 9. What I'm explicitly *not* doing

- No re-extraction of `data/*.json`. The 2026-05-25 outputs match the current extractor on the current source tree; redoing would burn ~30 min and surface zero changes. (If §7 reveals a number mismatch with the JSON, that's a separate finding to surface, not silently re-extract.)
- No CIGRE-side changes. Frozen artifact rule.
- No new dashboard features. Build is feature-complete per the May 24 plan; only the deep-link bug is touched.
- No paper changes. This is dashboard/space deployment only.
- No branch rename (default stays `feat/v2-dashboard-rebuild`).
- No private-duplicate-Space smoke test; the production Space is currently `NO_APP_FILE` so there is no traffic to disrupt.

## 10. Open items / TBD

- Confirm InspectAI viewer's exact log-count or log-index HTTP endpoint for Gate 5. The viewer's client-side router parses `#/logs/...` URLs, but I have not verified what server-side endpoint enumerates available logs. If no such endpoint exists, Gate 5 falls back to UI inspection (open the viewer root and confirm both `skorge/` and `dgx_spark/` directories are listed with their model subfolders) — that's a sufficient bar but is a manual step rather than `curl`-scriptable.

## 11. Predecessor reference

The May 24 spec covered Phases A–F (build the dashboard); this spec covers what was left open in that spec's §11 ("HF Space/dataset existence — verify created/populated before launch") and in the `project_v2_dashboard_deployment` memory ("HF Space still NO_APP_FILE; needs Dockerfile + start.sh + README frontmatter").

## 12. Documents

- This design: `docs/superpowers/specs/2026-06-02-allarma-v2-deployment-design.md`
- Implementation plan (next, after this spec is approved): `docs/superpowers/plans/2026-06-02-allarma-v2-deployment.md`
