# Per-family strategy-info modal — Design

**Date:** 2026-06-03
**Scope:** New UI feature on the Retrieval section of the live v2 dashboard.

## Goal

Make every retriever strategy name in the Retrieval section self-documenting
without cluttering the chart/table cells. Reader clicks an info button next
to a sub-family heading and sees a popup with the definitions of every
strategy in that sub-family.

## User-visible behavior

Three info buttons rendered inline at each sub-family `<h3>` heading inside
the Retrieval section:

| Heading | Button opens modal scoped to | Strategy count |
|---|---|---|
| Non-LLM baselines (N) | Non-LLM Baselines | 58 |
| LLM-augmented (N) | LLM-Augmented | 21 |
| Pure-LLM (N) | Pure-LLM | 2 |

Modal opens centered with a dimmed scrim; closes via X button, Esc key, or
scrim click. Focus returns to the originating button on close.

## Source of truth

Strategy descriptions are derived from
`~/Desktop/EPRI_RESEARCH/aLLarMa_benchmark_testing/aLLarMa_multiple_retriever_testing/test_all_retrievers_combined.py`
— every description must be defensible against a specific @task implementation
in that file. No "fast LLM" / "general LLM" qualifiers (the dashboard reader
does not need to see the code-internal model split). No comparative claims
not stated in code.

## Files

- **Create:** `data/strategy-descriptions.json` — 81 entries
  (2 pure-llm + 21 llm-augmented + 58 non-llm), schema:
  `{name, family, category, description}`
- **Create:** `js/strategy-info-modal.js` — self-contained module; builds
  modal DOM, fetches descriptions, wires click via event delegation on
  `.info-btn[data-family]`, family-scoped render
- **Modify:** `js/retrieval-section.js` — add ⓘ button next to each
  `<h3>${FAM_LABEL[fam]} (${n})</h3>` in both `.fam-sub-head` locations
  (chart view ~L304 + table view ~L708). Button has `data-family="${fam}"`
  where fam ∈ {base, aug, pure}.
- **Modify:** `index.html` — add script tag for `js/strategy-info-modal.js`,
  bump cache-bust `?v=100 → ?v=103` across all 7 referenced JS/CSS assets.
- **Modify:** `css/style.css` — modal + scrim styles (matching the existing
  `#log-drawer` aesthetic), `.info-btn` inline button style, and
  `html { scrollbar-gutter: stable; }` to prevent layout shift when the
  modal toggles `body.sim-locked { overflow: hidden }`.

## Architectural choices

- **Event delegation** (document-level click listener) — buttons are rendered
  dynamically by `retrieval-section.js` after data loads, so static
  `getElementById` would miss them.
- **Family-key mapping** `{base→non-llm, aug→llm-augmented, pure→pure-llm}`
  inside the modal — retrieval-section's existing keys differ from the JSON's
  family ids, so the modal accepts either.
- **No formal spec for each individual strategy** — every description
  references concrete `k=N` parameters, model names, and stage order taken
  directly from the implementation; no speculation about why a strategy was
  designed that way.

## Verification

- `data/strategy-descriptions.json` parses, has exactly 81 entries, family
  counts match (2 + 21 + 58), and every strategy name in the dashboard's
  data files (`data/retrieval-llm-summary.json`,
  `data/retrieval-allarma-summary.json`) appears exactly once.
- No "fast LLM" / "general LLM" / "a fast" / "the fast" anywhere in the JSON.
- `node --check` clean on both JS files.
- Live preview: 3 buttons visible inline next to each sub-family heading;
  each opens a modal scoped to that family with the right strategy count in
  the title; modal closes via X / Esc / scrim click; no background layout
  shift when toggling.

## Out of scope

- Modifier section gets no info button (only 1 strategy — covered by the
  Overview caveat instead).
- No tooltip-on-hover per strategy name in tables/charts (rejected for
  visual clutter — section-level button covers discovery without 80+ icons
  on screen at once).
