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
import math
from datetime import datetime


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


def extract_retrieval_llm_row(eval_path: str, *, machine: str, model_folder: str) -> dict:
    """Extract one row of retrieval-LLM data from a single .eval file."""
    h = read_eval_header(eval_path)
    eval_info = h["eval"]
    stats = h["stats"]
    scores_block = h["results"]["scores"][0]
    metrics = scores_block["metrics"]

    n_samples = eval_info["dataset"]["samples"]
    accuracy = metrics["accuracy"]["value"]
    se = math.sqrt(accuracy * (1 - accuracy) / n_samples) if n_samples > 0 else 0.0

    started = datetime.fromisoformat(stats["started_at"])
    completed = datetime.fromisoformat(stats["completed_at"])
    total_runtime_s = (completed - started).total_seconds()

    mt = (eval_info.get("model_generate_config") or {}).get("max_tokens")

    row = {
        "benchmark": "retriever-llm",
        "machine": machine,
        "model": eval_info["model"].split("/")[-1],
        "model_folder": model_folder,
        "eval_file": os.path.basename(eval_path),
        "strategy": eval_info["task"],
        "samples": n_samples,
        "metrics": {
            "accuracy": round(accuracy, 6),
            "accuracy_se": round(se, 6),
            "accuracy_in_scope": round(metrics.get("accuracy_in_scope", {}).get("value", 0.0), 6),
            "accuracy_oos": round(metrics.get("accuracy_oos", {}).get("value", 0.0), 6),
            "avg_llm_call_count": round(metrics.get("avg_llm_call_count", {}).get("value", 0.0), 4),
            "avg_llm_token_usage": round(metrics.get("avg_llm_token_usage", {}).get("value", 0.0), 2),
        },
        "total_runtime": round(total_runtime_s, 1),
        "avg_time_per_sample": round(total_runtime_s / n_samples, 4) if n_samples > 0 else 0.0,
        "max_tokens": mt,
        "truncation_count": truncation_count_for_eval(eval_path),
        "truncation_rate": 0.0,  # filled below
    }
    row["truncation_rate"] = round(row["truncation_count"] / n_samples, 6) if n_samples > 0 else 0.0
    return row


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
