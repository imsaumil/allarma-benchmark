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
import statistics
from collections import defaultdict


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


def _sample_latency(s: dict) -> float:
    """Per-sample latency = `working_time` (model+tool time), falling back to
    `total_time` when absent. Verified 1-to-1 against paper v3 T_sample on all 22
    quoted timing cells (working_time matches exactly; total_time is inflated by
    scoring/overhead on some cells)."""
    wt = s.get("working_time")
    return wt if wt is not None else s["total_time"]


def per_sample_timing(eval_path: str) -> dict:
    """Per-sample latency (s) from summaries.json — the paper's T_sample column.
    Distinct from `avg_time_per_sample` (= total wall / N), which is deflated ~5x by
    concurrent sample execution and is NOT comparable to the paper's per-query latency."""
    with zipfile.ZipFile(eval_path) as zf:
        summaries = json.load(zf.open("summaries.json"))
    times = [_sample_latency(s) for s in summaries]
    n = len(times)
    return {
        "median": round(statistics.median(times), 2) if times else 0.0,
        "mean": round(sum(times) / n, 2) if n else 0.0,
        "max": round(max(times), 2) if times else 0.0,
    }


def extract_retrieval_llm_row(eval_path: str, *, machine: str, model_folder: str) -> dict:
    """Extract one row of retrieval-LLM data from a single .eval file."""
    h = read_eval_header(eval_path)
    eval_info = h["eval"]
    stats = h["stats"]
    scores_block = h["results"]["scores"][0]
    metrics = scores_block["metrics"]

    n_samples = eval_info["dataset"]["samples"]
    completed_samples = h["results"].get("completed_samples", n_samples)
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
        "completed_samples": completed_samples,
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
        "timing": per_sample_timing(eval_path),  # paper T_sample (working_time)
        "max_tokens": mt,
        "truncation_count": truncation_count_for_eval(eval_path),
        "truncation_rate": 0.0,  # filled below
    }
    row["truncation_rate"] = round(row["truncation_count"] / n_samples, 6) if n_samples > 0 else 0.0
    return row


_LLM_MODEL_FOLDERS = (
    "gemma-4-e2b-it",
    "gpt-oss-20b",
    "ministral-3-3b",
    "ministral-3-8b",
    "ministral-3-14b",
    "nemotron-nano-9b-v2",
    "nemotron-nano-12b-v2",
    "qwen3.5-0.8b",
    "qwen3.5-2b",
)


def walk_retrieval_llm(skorge_dir: str, dgx_dir: str) -> list[dict]:
    """Walk skorge/retriever/<model>/ and dgx/retriever/<model>/ trees,
    extracting one row per .eval. Skips the allarma-retriever-benchmark folder."""
    rows: list[dict] = []
    for machine, root in (("skorge", skorge_dir), ("dgx_spark", dgx_dir)):
        retriever_dir = os.path.join(root, "retriever")
        for model_folder in sorted(os.listdir(retriever_dir)):
            if model_folder not in _LLM_MODEL_FOLDERS:
                continue  # skip allarma-retriever-benchmark and any others
            model_dir = os.path.join(retriever_dir, model_folder)
            for fn in sorted(os.listdir(model_dir)):
                if fn.endswith(".eval"):
                    rows.append(
                        extract_retrieval_llm_row(
                            os.path.join(model_dir, fn),
                            machine=machine, model_folder=model_folder,
                        )
                    )
    return rows


def extract_retrieval_allarma_row(eval_path: str, *, machine: str) -> dict:
    """Extract one allarma-baseline row. No model dimension (no LLM)."""
    h = read_eval_header(eval_path)
    eval_info = h["eval"]
    stats = h["stats"]
    scores_block = h["results"]["scores"][0]
    metrics = scores_block["metrics"]

    n_samples = eval_info["dataset"]["samples"]
    completed_samples = h["results"].get("completed_samples", n_samples)
    accuracy = metrics.get("accuracy", {}).get("value", 0.0)
    se = math.sqrt(accuracy * (1 - accuracy) / n_samples) if n_samples > 0 else 0.0

    started = datetime.fromisoformat(stats["started_at"])
    completed = datetime.fromisoformat(stats["completed_at"])
    total_runtime_s = (completed - started).total_seconds()

    return {
        "benchmark": "retriever-allarma",
        "machine": machine,
        "model": None,
        "model_folder": "allarma-retriever-benchmark",
        "eval_file": os.path.basename(eval_path),
        "strategy": eval_info["task"],
        "scorer": scores_block["name"],
        "samples": n_samples,
        "completed_samples": completed_samples,
        "metrics": {
            "accuracy": round(accuracy, 6),
            "accuracy_se": round(se, 6),
            "accuracy_in_scope": round(metrics.get("accuracy_in_scope", {}).get("value", 0.0), 6),
            "accuracy_oos": round(metrics.get("accuracy_oos", {}).get("value", 0.0), 6),
        },
        "total_runtime": round(total_runtime_s, 1),
        "avg_time_per_sample": round(total_runtime_s / n_samples, 4) if n_samples > 0 else 0.0,
        "timing": per_sample_timing(eval_path),  # paper T_sample (working_time)
        "max_tokens": None,
        "truncation_count": 0,
        "truncation_rate": 0.0,
    }


def walk_retrieval_allarma(skorge_dir: str, dgx_dir: str) -> list[dict]:
    """Walk skorge/retriever/allarma-retriever-benchmark/ + dgx counterpart."""
    rows: list[dict] = []
    for machine, root in (("skorge", skorge_dir), ("dgx_spark", dgx_dir)):
        allarma_dir = os.path.join(root, "retriever", "allarma-retriever-benchmark")
        if not os.path.isdir(allarma_dir):
            continue
        for fn in sorted(os.listdir(allarma_dir)):
            if fn.endswith(".eval"):
                rows.append(extract_retrieval_allarma_row(
                    os.path.join(allarma_dir, fn), machine=machine,
                ))
    return rows


def _modifier_aggregate_metrics(header: dict) -> dict:
    """Pull the 3 named modifier scorers from header['results']['scores']."""
    out = {}
    for sg in header["results"]["scores"]:
        name = sg["name"]
        m = sg["metrics"]
        if "mean" in m:
            out[name] = {"value": round(m["mean"]["value"], 4), "se": round(m["stderr"]["value"], 4)}
        elif "accuracy" in m:
            out[name] = {"value": round(m["accuracy"]["value"], 4), "se": round(m["stderr"]["value"], 4)}
    return out


def extract_modifier_row(eval_path: str, *, machine: str, model_folder: str) -> dict:
    h = read_eval_header(eval_path)
    eval_info = h["eval"]
    stats = h["stats"]
    started = datetime.fromisoformat(stats["started_at"])
    completed = datetime.fromisoformat(stats["completed_at"])
    total_runtime_s = (completed - started).total_seconds()

    # walk samples for per-sample timing/tokens/scores
    times: list[float] = []
    input_toks: list[int] = []
    output_toks: list[int] = []
    total_toks: list[int] = []
    presence_scores: list[float] = []
    removal_scores: list[float] = []
    with zipfile.ZipFile(eval_path) as zf:
        with zf.open("summaries.json") as f:
            summaries = json.load(f)
        for s in summaries:
            times.append(_sample_latency(s))  # working_time — matches paper T_sample
            # A handful of samples (timeouts at 600s) record an empty model_usage
            # dict. Keep timing/score data but skip token accounting for those.
            mu = s.get("model_usage") or {}
            if mu:
                usage = list(mu.values())[0]
                input_toks.append(usage["input_tokens"])
                output_toks.append(usage["output_tokens"])
                total_toks.append(usage["total_tokens"])
            meta = s["scores"]["modifier_scorer"]["metadata"]
            presence_scores.append(meta["presence_score"])
            removal_scores.append(meta["removal_score"])

    n = len(times)
    n_tok = len(input_toks)
    # Pair throughputs only with samples that have both timing and token usage.
    paired_times = [t for s, t in zip(summaries, times) if s.get("model_usage")]
    throughputs = [o / t for o, t in zip(output_toks, paired_times) if t > 0]
    mt = (eval_info.get("model_generate_config") or {}).get("max_tokens")

    return {
        "benchmark": "modifier",
        "machine": machine,
        "model": eval_info["model"].split("/")[-1],
        "model_folder": model_folder,
        "eval_file": os.path.basename(eval_path),
        "strategy": eval_info["task"],
        "samples": n,
        "completed_samples": h["results"].get("completed_samples", n),
        "metrics": _modifier_aggregate_metrics(h),
        "presence_score": round(sum(presence_scores) / n, 4) if n else 0.0,
        "removal_score": round(sum(removal_scores) / n, 4) if n else 0.0,
        "timing": {
            "median": round(statistics.median(times), 2) if times else 0.0,
            "mean": round(sum(times) / n, 2) if n else 0.0,
            "max": round(max(times), 2) if times else 0.0,
        },
        "tokens": {
            "avg_input": round(sum(input_toks) / n_tok) if n_tok else 0,
            "avg_output": round(sum(output_toks) / n_tok) if n_tok else 0,
            "avg_total": round(sum(total_toks) / n_tok) if n_tok else 0,
            "total_input": sum(input_toks),
            "total_output": sum(output_toks),
        },
        "throughput": round(sum(throughputs) / len(throughputs)) if throughputs else 0,
        "total_runtime": round(total_runtime_s, 1),
        "max_tokens": mt,
        "truncation_count": truncation_count_for_eval(eval_path),
        "truncation_rate": 0.0,  # filled below
    }


def walk_modifier(skorge_dir: str, dgx_dir: str) -> list[dict]:
    rows: list[dict] = []
    for machine, root in (("skorge", skorge_dir), ("dgx_spark", dgx_dir)):
        mod_dir = os.path.join(root, "modifier")
        for model_folder in sorted(os.listdir(mod_dir)):
            if model_folder not in _LLM_MODEL_FOLDERS:
                continue
            d = os.path.join(mod_dir, model_folder)
            for fn in sorted(os.listdir(d)):
                if fn.endswith(".eval"):
                    row = extract_modifier_row(
                        os.path.join(d, fn), machine=machine, model_folder=model_folder,
                    )
                    n = row["samples"]
                    row["truncation_rate"] = round(row["truncation_count"] / n, 6) if n else 0.0
                    rows.append(row)
    return rows


def walk_modifier_templates(skorge_dir: str, dgx_dir: str) -> list[dict]:
    """Per-template aggregate scores for the heatmap."""
    out: list[dict] = []
    for machine, root in (("skorge", skorge_dir), ("dgx_spark", dgx_dir)):
        mod_dir = os.path.join(root, "modifier")
        for model_folder in sorted(os.listdir(mod_dir)):
            if model_folder not in _LLM_MODEL_FOLDERS:
                continue
            d = os.path.join(mod_dir, model_folder)
            for fn in sorted(os.listdir(d)):
                if not fn.endswith(".eval"):
                    continue
                eval_path = os.path.join(d, fn)
                with zipfile.ZipFile(eval_path) as zf:
                    summaries = json.load(zf.open("summaries.json"))
                model_name = read_eval_header(eval_path)["eval"]["model"].split("/")[-1]
                buckets: dict[str, dict] = defaultdict(
                    lambda: {"Modification_Accuracy": [], "Neo4j_Syntactic_Validity": [],
                             "Neo4j_Semantic_Validity": [], "count": 0}
                )
                for s in summaries:
                    tid = s["metadata"]["template_id"]
                    sc = s["scores"]["modifier_scorer"]["value"]
                    buckets[tid]["Modification_Accuracy"].append(sc["Modification_Accuracy"])
                    buckets[tid]["Neo4j_Syntactic_Validity"].append(sc["Neo4j_Syntactic_Validity"])
                    buckets[tid]["Neo4j_Semantic_Validity"].append(sc["Neo4j_Semantic_Validity"])
                    buckets[tid]["count"] += 1
                for tid in sorted(buckets.keys()):
                    b = buckets[tid]
                    n = b["count"]
                    row = {
                        "benchmark": "modifier",
                        "machine": machine,
                        "model": model_name,
                        "model_folder": model_folder,
                        "template_id": tid,
                        "count": n,
                    }
                    for metric in ("Modification_Accuracy", "Neo4j_Syntactic_Validity", "Neo4j_Semantic_Validity"):
                        vals = b[metric]
                        mean_val = sum(vals) / n
                        if metric == "Modification_Accuracy" and n > 1:
                            variance = sum((v - mean_val) ** 2 for v in vals) / (n - 1)
                            se_val = math.sqrt(variance / n)
                        else:
                            se_val = math.sqrt(mean_val * (1 - mean_val) / n) if n > 0 else 0.0
                        row[metric] = round(mean_val, 4)
                        row[f"{metric}_se"] = round(se_val, 4)
                    out.append(row)
    return out


def walk_retrieval_llm_tiers(skorge_dir: str, dgx_dir: str) -> list[dict]:
    """Per-tier accuracy breakdown for each (model, strategy, machine)."""
    out: list[dict] = []
    for machine, root in (("skorge", skorge_dir), ("dgx_spark", dgx_dir)):
        retriever_dir = os.path.join(root, "retriever")
        for model_folder in sorted(os.listdir(retriever_dir)):
            if model_folder not in _LLM_MODEL_FOLDERS:
                continue
            d = os.path.join(retriever_dir, model_folder)
            for fn in sorted(os.listdir(d)):
                if not fn.endswith(".eval"):
                    continue
                eval_path = os.path.join(d, fn)
                with zipfile.ZipFile(eval_path) as zf:
                    summaries = json.load(zf.open("summaries.json"))
                h = read_eval_header(eval_path)
                strategy = h["eval"]["task"]
                model_name = h["eval"]["model"].split("/")[-1]

                buckets: dict[str, dict] = defaultdict(lambda: {"correct": 0, "total": 0})
                for s in summaries:
                    # Skip samples with empty scores — matches InspectAI's own
                    # aggregation (verified: header accuracy reproduces exactly
                    # when these are excluded from the denominator).
                    if not s.get("scores"):
                        continue
                    tier = s["metadata"].get("tier_name", "unknown")
                    scorer_key = list(s["scores"].keys())[0]
                    correct = s["scores"][scorer_key]["value"]
                    buckets[tier]["total"] += 1
                    buckets[tier]["correct"] += correct

                tier_row = {
                    "benchmark": "retriever-llm",
                    "machine": machine,
                    "model": model_name,
                    "model_folder": model_folder,
                    "strategy": strategy,
                    "tiers": {},
                }
                for tname in ("easy", "medium", "hard", "expert"):
                    b = buckets.get(tname, {"correct": 0, "total": 0})
                    acc = b["correct"] / b["total"] if b["total"] else 0.0
                    se = math.sqrt(acc * (1 - acc) / b["total"]) if b["total"] else 0.0
                    tier_row["tiers"][tname] = {
                        "accuracy": round(acc, 6),
                        "se": round(se, 6),
                        "correct": b["correct"],
                        "total": b["total"],
                    }
                out.append(tier_row)
    return out


def compute_cross_machine_deltas(llm_rows: list[dict]) -> list[dict]:
    """Pair (model, strategy) cells across SK and DGX → one Δ row per pair."""
    by_key: dict[tuple, dict[str, dict]] = defaultdict(dict)
    for r in llm_rows:
        by_key[(r["model_folder"], r["strategy"])][r["machine"]] = r

    deltas: list[dict] = []
    for (model_folder, strategy), pair in sorted(by_key.items()):
        sk = pair.get("skorge")
        dgx = pair.get("dgx_spark")
        if sk is None or dgx is None:
            continue  # asymmetric pair (shouldn't happen for the 207 LLM-augmented pairs)
        sk_acc = sk["metrics"]["accuracy"]
        dgx_acc = dgx["metrics"]["accuracy"]
        deltas.append({
            "benchmark": "retriever-llm",
            "model_folder": model_folder,
            "model": sk["model"],
            "strategy": strategy,
            "sk_acc": sk_acc,
            "dgx_acc": dgx_acc,
            "delta_pp": round((dgx_acc - sk_acc) * 100, 4),
            "sk_eval_file": sk["eval_file"],
            "dgx_eval_file": dgx["eval_file"],
            "sk_truncation_count": sk["truncation_count"],
            "dgx_truncation_count": dgx["truncation_count"],
            "sk_max_tokens": sk["max_tokens"],
            "dgx_max_tokens": dgx["max_tokens"],
        })
    return deltas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skorge-dir", required=True)
    parser.add_argument("--dgx-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print("Extracting retrieval-LLM (414 rows)...")
    llm_rows = walk_retrieval_llm(args.skorge_dir, args.dgx_dir)
    _write_json(args.output_dir, "retrieval-llm-summary.json", llm_rows)

    print("Extracting retrieval-Allarma (116 rows)...")
    allarma_rows = walk_retrieval_allarma(args.skorge_dir, args.dgx_dir)
    _write_json(args.output_dir, "retrieval-allarma-summary.json", allarma_rows)

    print("Extracting retrieval-LLM tiers (414 rows)...")
    tier_rows = walk_retrieval_llm_tiers(args.skorge_dir, args.dgx_dir)
    _write_json(args.output_dir, "retrieval-llm-tiers.json", tier_rows)

    print("Extracting modifier (18 rows)...")
    mod_rows = walk_modifier(args.skorge_dir, args.dgx_dir)
    _write_json(args.output_dir, "modifier-summary.json", mod_rows)

    print("Extracting modifier templates (per-template heatmap rows)...")
    tpl_rows = walk_modifier_templates(args.skorge_dir, args.dgx_dir)
    _write_json(args.output_dir, "modifier-templates.json", tpl_rows)

    print("Computing cross-machine deltas (207 retrieval-LLM pairs)...")
    deltas = compute_cross_machine_deltas(llm_rows)
    _write_json(args.output_dir, "cross-machine-deltas.json", deltas)

    print("Done.")


def _write_json(out_dir: str, name: str, payload) -> None:
    path = os.path.join(out_dir, name)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"  → {len(payload)} rows in {path}")


if __name__ == "__main__":
    main()
