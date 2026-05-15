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
