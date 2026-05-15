"""Tests for extract_data_full.py against actual .eval files."""
import os
import sys

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
