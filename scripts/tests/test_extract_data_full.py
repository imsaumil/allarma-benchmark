"""Tests for extract_data_full.py against actual .eval files."""
import json
import os
import sys
import statistics

# Make scripts/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import extract_data_full as edf


def test_read_eval_header_returns_dict_with_expected_keys(skorge_dir):
    eval_path = os.path.join(
        skorge_dir, "modifier", "qwen3.5-0.8b",
        "2026-04-03T06-50-28+00-00_modifier-benchmark-task_Za5WaLosEZGf57UhtTQfWN.eval",
    )
    h = edf.read_eval_header(eval_path)
    assert "eval" in h
    assert h["eval"]["task"] == "modifier_benchmark_task"
    assert h["eval"]["model"].endswith("Qwen3.5-0.8B")
    assert h["eval"]["dataset"]["samples"] == 1024


def test_truncation_count_matches_audit_doc(skorge_dir):
    """Audit doc §7.1 says skorge gpt-oss-20b/llm_direct_match_all = 1137 truncated."""
    eval_path = os.path.join(
        skorge_dir, "retriever", "gpt-oss-20b",
        "2026-04-14T02-46-14+00-00_llm-direct-match-all_ZvDdPL6t2i8CcHguiYijHV.eval",
    )
    n_trunc = edf.truncation_count_for_eval(eval_path)
    assert n_trunc == 1137, f"expected 1137 (audit §7.1), got {n_trunc}"


def test_truncation_count_zero_on_clean_strategy(skorge_dir):
    """Audit §7.1 says skorge gpt-oss-20b/llm_listwise_rerank_dense_all = 0 truncated."""
    eval_path = os.path.join(
        skorge_dir, "retriever", "gpt-oss-20b",
        "2026-04-13T21-44-59+00-00_llm-listwise-rerank-dense-all_dbmnkj9TST69vREDendoKo.eval",
    )
    assert edf.truncation_count_for_eval(eval_path) == 0


def test_extract_retrieval_llm_row_for_skorge_qwen_one_strategy(skorge_dir):
    eval_path = os.path.join(
        skorge_dir, "retriever", "qwen3.5-0.8b",
        "2026-04-02T06-39-31+00-00_llm-listwise-rerank-dense-candidate_ccPypunqUoi3ft9CJnHrEn.eval",
    )
    row = edf.extract_retrieval_llm_row(eval_path, machine="skorge", model_folder="qwen3.5-0.8b")
    assert row["benchmark"] == "retriever-llm"
    assert row["machine"] == "skorge"
    assert row["model"] == "Qwen3.5-0.8B"
    assert row["model_folder"] == "qwen3.5-0.8b"
    assert row["strategy"] == "llm_listwise_rerank_dense_candidate"
    assert row["samples"] == 9789
    assert "accuracy" in row["metrics"]
    assert isinstance(row["truncation_count"], int)
    assert row["max_tokens"] == 8192


def test_extract_retrieval_llm_walker_yields_414_rows(skorge_dir, dgx_dir):
    """9 models × 23 strategies × 2 machines = 414 LLM-augmented rows.
    The unbounded variant is added separately (Task 11) so this walker yields 414."""
    rows = edf.walk_retrieval_llm(skorge_dir, dgx_dir)
    assert len(rows) == 414, f"expected 414, got {len(rows)}"
    # Spot check: gpt-oss-20b on skorge has 23 unique strategies
    sk_gpt_strats = {r["strategy"] for r in rows
                     if r["machine"] == "skorge" and r["model_folder"] == "gpt-oss-20b"}
    assert len(sk_gpt_strats) == 23
    # Same on dgx
    dgx_gpt_strats = {r["strategy"] for r in rows
                      if r["machine"] == "dgx_spark" and r["model_folder"] == "gpt-oss-20b"}
    assert len(dgx_gpt_strats) == 23
    # Unique sets match (all 9 models, both machines)
    machines = {r["machine"] for r in rows}
    assert machines == {"skorge", "dgx_spark"}
    models = {r["model_folder"] for r in rows}
    expected_models = {
        "gemma-4-e2b-it", "gpt-oss-20b", "ministral-3-3b", "ministral-3-8b",
        "ministral-3-14b", "nemotron-nano-9b-v2", "nemotron-nano-12b-v2",
        "qwen3.5-0.8b", "qwen3.5-2b",
    }
    assert models == expected_models


def test_walk_retrieval_allarma_yields_116_rows(skorge_dir, dgx_dir):
    """58 strategies × 2 machines = 116 allarma rows."""
    rows = edf.walk_retrieval_allarma(skorge_dir, dgx_dir)
    assert len(rows) == 116, f"expected 116, got {len(rows)}"
    for r in rows:
        assert r["benchmark"] == "retriever-allarma"
        assert r["model"] is None  # no model dimension
        assert r["model_folder"] == "allarma-retriever-benchmark"
        assert r["truncation_count"] == 0  # no LLM
        assert r["max_tokens"] is None
    # 58 unique strategies on each machine
    sk_strats = {r["strategy"] for r in rows if r["machine"] == "skorge"}
    assert len(sk_strats) == 58


def test_walk_modifier_yields_18_rows_with_three_scorers(skorge_dir, dgx_dir):
    rows = edf.walk_modifier(skorge_dir, dgx_dir)
    assert len(rows) == 18  # 9 models × 2 machines
    expected_scorers = {"Modification_Accuracy", "Neo4j_Syntactic_Validity", "Neo4j_Semantic_Validity"}
    for r in rows:
        assert r["benchmark"] == "modifier"
        assert set(r["metrics"].keys()) == expected_scorers
        assert r["samples"] == 1024
        assert r["max_tokens"] == 16384


def test_walk_modifier_templates_per_template_breakdown(skorge_dir, dgx_dir):
    """qwen3.5-0.8b modifier on skorge: ~63 templates × 1 model × 1 machine."""
    rows = edf.walk_modifier_templates(skorge_dir, dgx_dir)
    qwen_sk = [r for r in rows if r["machine"] == "skorge" and r["model_folder"] == "qwen3.5-0.8b"]
    assert len(qwen_sk) > 0
    # Each row has the 3 modifier scorers
    for r in qwen_sk[:3]:
        assert "Modification_Accuracy" in r
        assert "Neo4j_Syntactic_Validity" in r
        assert "Neo4j_Semantic_Validity" in r


def test_walk_retrieval_llm_tiers_one_row_per_eval(skorge_dir, dgx_dir):
    rows = edf.walk_retrieval_llm_tiers(skorge_dir, dgx_dir)
    assert len(rows) == 414  # one row per (model, strategy, machine)
    # Every row has the 4 tiers
    for r in rows[:5]:
        assert set(r["tiers"].keys()) == {"easy", "medium", "hard", "expert"}
        for t in ("easy", "medium", "hard", "expert"):
            assert "accuracy" in r["tiers"][t]
            assert "se" in r["tiers"][t]
            assert "correct" in r["tiers"][t]
            assert "total" in r["tiers"][t]


def test_unbounded_variant_appears_with_distinct_strategy_label(unbounded_variant):
    """The CIGRE-March file has task='llm_direct_match_all' inside, but the dashboard
    must label it 'llm_direct_match_all_unbounded_tokens' to distinguish it."""
    row = edf.extract_unbounded_variant_row(unbounded_variant)
    assert row["strategy"] == "llm_direct_match_all_unbounded_tokens"
    assert row["machine"] == "skorge"
    assert row["model_folder"] == "gpt-oss-20b"
    assert row["max_tokens"] is None  # unbounded
    # Spec says accuracy ~0.9186 (verified during spec drafting)
    assert abs(row["metrics"]["accuracy"] - 0.9186) < 0.0005


def test_cross_machine_deltas_reproduce_audit_anomaly_1(skorge_dir, dgx_dir):
    """Audit §3.3: gpt-oss-20b/llm_direct_match_all SK 85.51% → DGX 95.32%, Δ = +9.80 pp."""
    llm_rows = edf.walk_retrieval_llm(skorge_dir, dgx_dir)
    deltas = edf.compute_cross_machine_deltas(llm_rows)
    # find the gpt-oss/direct-match cell
    target = next(d for d in deltas
                  if d["model_folder"] == "gpt-oss-20b" and d["strategy"] == "llm_direct_match_all")
    delta_pp = (target["dgx_acc"] - target["sk_acc"]) * 100
    assert 9.5 < delta_pp < 10.0, f"audit says +9.80 pp; got {delta_pp:.2f}"


def test_main_e2e_writes_six_json_files_with_expected_counts(tmp_path, skorge_dir, dgx_dir, unbounded_variant):
    import subprocess, sys
    out = str(tmp_path)
    result = subprocess.run([
        sys.executable, "extract_data_full.py",
        "--skorge-dir", skorge_dir,
        "--dgx-dir", dgx_dir,
        "--unbounded-variant", unbounded_variant,
        "--output-dir", out,
    ], cwd=os.path.dirname(__file__) + "/..", check=True, capture_output=True, text=True)
    assert "Done." in result.stdout
    counts = {fn: len(json.load(open(os.path.join(out, fn)))) for fn in (
        "retrieval-llm-summary.json", "retrieval-allarma-summary.json",
        "retrieval-llm-tiers.json", "modifier-summary.json",
        "modifier-templates.json", "cross-machine-deltas.json",
    )}
    assert counts["retrieval-llm-summary.json"] == 415
    assert counts["retrieval-allarma-summary.json"] == 116
    assert counts["retrieval-llm-tiers.json"] == 414
    assert counts["modifier-summary.json"] == 18
    assert counts["cross-machine-deltas.json"] == 207
