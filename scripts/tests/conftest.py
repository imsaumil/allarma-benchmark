"""Pytest fixtures for extract_data_full.py tests.

Tests run against actual .eval files in APPLIED_ENERGY_WRITEUP/. Adjust paths
via env vars ALLARMA_SKORGE_DIR / ALLARMA_DGX_DIR / ALLARMA_UNBOUNDED_VARIANT
if your trees live elsewhere.
"""
import os
import pytest

_DEFAULT_ROOT = os.path.expanduser("~/Desktop/EPRI_RESEARCH/ALLARMA_PAPER_WRITING_FILES")


@pytest.fixture(scope="session")
def skorge_dir():
    p = os.environ.get(
        "ALLARMA_SKORGE_DIR",
        os.path.join(_DEFAULT_ROOT, "APPLIED_ENERGY_WRITEUP", "skorge"),
    )
    if not os.path.isdir(p):
        pytest.skip(f"skorge dir not found: {p}")
    return p


@pytest.fixture(scope="session")
def dgx_dir():
    p = os.environ.get(
        "ALLARMA_DGX_DIR",
        os.path.join(_DEFAULT_ROOT, "APPLIED_ENERGY_WRITEUP", "dgx_spark"),
    )
    if not os.path.isdir(p):
        pytest.skip(f"dgx dir not found: {p}")
    return p


@pytest.fixture(scope="session")
def unbounded_variant():
    p = os.environ.get(
        "ALLARMA_UNBOUNDED_VARIANT",
        os.path.join(
            _DEFAULT_ROOT,
            "CIGRE_WRITEUP",
            "log_files",
            "retriever",
            "gpt_oss_20b_reasoning_low",
            "2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval",
        ),
    )
    if not os.path.isfile(p):
        pytest.skip(f"unbounded variant not found: {p}")
    return p
