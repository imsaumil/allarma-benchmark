#!/usr/bin/env python3
"""Extract benchmark metrics from InspectAI .eval logs into compact JSON files.

Walks skorge + dgx_spark .eval trees and emits 6 JSON files used by the
v2-full dashboard:
  - retrieval-llm-summary.json
  - retrieval-allarma-summary.json
  - retrieval-llm-tiers.json
  - modifier-summary.json
  - modifier-templates.json
  - cross-machine-deltas.json

See docs/superpowers/specs/2026-05-14-allarma-v2-dashboard-design.md §9.
"""
import argparse
import json
import os
import zipfile


def read_eval_header(eval_path: str) -> dict:
    """Read header.json from inside an InspectAI .eval (Zip) archive."""
    with zipfile.ZipFile(eval_path) as zf:
        with zf.open("header.json") as f:
            return json.load(f)


def truncation_count_for_eval(eval_path: str) -> int:
    """Count samples where any model call's stop_reason was 'length' or 'max_tokens'.

    One truncation per sample regardless of how many model calls; matches
    audit doc §7.1 figures within 0 samples on the 23 skorge gpt-oss
    strategies (verified during spec drafting).
    """
    n_trunc = 0
    with zipfile.ZipFile(eval_path) as zf:
        sample_files = [
            n for n in zf.namelist() if n.startswith("samples/") and n.endswith(".json")
        ]
        for sf in sample_files:
            sample = json.load(zf.open(sf))
            for evt in sample.get("events", []):
                if evt.get("event") != "model":
                    continue
                out = evt.get("output")
                if not isinstance(out, dict):
                    continue
                if any(
                    isinstance(ch, dict) and ch.get("stop_reason") in ("length", "max_tokens")
                    for ch in out.get("choices", []) or []
                ):
                    n_trunc += 1
                    break  # one truncation per sample
    return n_trunc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skorge-dir", required=True, help="Path to APPLIED_ENERGY_WRITEUP/skorge")
    parser.add_argument("--dgx-dir", required=True, help="Path to APPLIED_ENERGY_WRITEUP/dgx_spark")
    parser.add_argument(
        "--unbounded-variant",
        required=True,
        help="Path to the CIGRE-March unbounded-tokens .eval file for gpt-oss-20b/llm_direct_match_all",
    )
    parser.add_argument("--output-dir", required=True, help="Path to output data/ directory")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    print("extract_data_full.py CLI scaffold OK — extraction logic to follow.")


if __name__ == "__main__":
    main()
