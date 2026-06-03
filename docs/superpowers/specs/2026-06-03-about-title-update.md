# About-section paper title update — Design

**Date:** 2026-06-03
**Scope:** Single-line content edit; live dashboard.

## Goal

Update the paper title shown in the dashboard's About → Citation block to match
the paper's current title.

## Current state (verified 2026-06-03)

End-to-end grep across `*.html`, `*.js`, `*.css`, `*.md`, `*.json`:

- `index.html:53` — the canonical Citation line containing the full title
  (currently `Benchmarking aLLarMa: A Constrained Two-Stage GraphRAG Framework
  for Power System Alarm, Network and Operational Data Analytics`)
- `js/overview.js:17` — Figure 1 caption uses the descriptive lowercase phrase
  `aLLarMa two-stage constrained GraphRAG pipeline`. This already matches the
  new title's word order (`Two-Stage Constrained` → `two-stage constrained` when
  lowercased), so **no change**.
- `index.html:6` — browser tab title is `EPRI - aLLarMa benchmarking efforts`
  (generic; no framework name). No change.
- `docs/superpowers/plans/2026-06-02-allarma-v2-deployment.md:660` and
  `docs/superpowers/specs/2026-05-24-allarma-v2-dashboard-design.md:137`
  reference the old title. These are frozen historical records (the plan task
  that referenced this was already executed with the user's explicit decision
  to omit the paper line entirely from the Space README). **No change.**

## Change

In `index.html`, replace exactly the line at `:53`:

```html
-<p><em>Benchmarking aLLarMa: A Constrained Two-Stage GraphRAG Framework for Power System Alarm, Network and Operational Data Analytics</em></p>
+<p><em>aLLarMa: A Two-Stage Constrained GraphRAG Framework for Power System Alarm, Network and Operational Data Analytics</em></p>
```

Three differences: (1) drop `Benchmarking ` prefix, (2) swap
`Constrained Two-Stage` → `Two-Stage Constrained`, (3) no trailing period
(matches existing HTML title-style).

## Out of scope

- No cache-bust bump (index.html is unversioned; HTML is fetched fresh; no
  JS/CSS changed).
- No retroactive edit of the two historical doc references — they are frozen
  records of what was true when written.
- No edit to `js/overview.js:17` — its lowercase descriptive phrase already
  matches the new title's word order.

## Verification

1. Local: render `http://localhost:8765/#about` and visually confirm the new
   citation line in the About → Citation block.
2. Post-push: `curl -s https://imsaumil.github.io/allarma-benchmark/ | grep -F
   "A Two-Stage Constrained GraphRAG"` returns exactly one match within ~30s
   of push (GH Pages rebuild).
