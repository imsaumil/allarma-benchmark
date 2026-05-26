# EPRI - aLLarMa Benchmark Eval Dashboard (v2-full)

Interactive benchmark results for the aLLarMa Applied Energy paper —
9 models × 2 machines × {modifier, retrieval-LLM, retrieval-allarma-baseline}.
548 audited .eval files + 1 CIGRE-March unbounded-tokens variant for the
gpt-oss-20b/llm_direct_match_all max_tokens comparison.

## Setup

1. Extract data from local .eval trees:
   ```bash
   python scripts/extract_data_full.py \
     --skorge-dir /path/to/APPLIED_ENERGY_WRITEUP/skorge \
     --dgx-dir /path/to/APPLIED_ENERGY_WRITEUP/dgx_spark \
     --unbounded-variant /path/to/CIGRE_WRITEUP/log_files/retriever/gpt_oss_20b_reasoning_low/2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval \
     --output-dir data/
   ```

2. Serve locally:
   ```bash
   python -m http.server 8000
   # Open http://localhost:8000
   ```

## Deployment

- **Dashboard:** Push to GitHub, enable GitHub Pages on `master` branch.
- **Eval logs (InspectAI viewer):** HuggingFace Docker space `imsaumil/allarma-benchmark` snapshot-downloads from HF dataset `imsaumil/allarma-benchmark` on cold start.

Predecessor (CIGRE 2026, 3-model subset): https://imsaumil.github.io/allarma-benchmark-eval-dashboard/
