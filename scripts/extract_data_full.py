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
