# aLLarMa v2 Dashboard Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the v2 (Applied Energy) dashboard and InspectAI viewer Space live on the already-advertised URLs, on HF free `cpu-basic`, with all "Open in viewer" deep-links resolving correctly.

**Architecture:** The HF Space mounts the existing `imsaumil/allarma-benchmark` dataset (67 GB, 548 `.eval`) as a read-only volume at `/data` and runs `inspect view start --log-dir /data` — no snapshot download, no recurring storage cost. The static dashboard is served via GitHub Pages on the existing `feat/v2-dashboard-rebuild` branch. The dashboard's `buildLogUrl` is extended with a `machine` segment so deep-links match the dataset layout.

**Tech Stack:** Python 3.11 (Docker base), `inspect-ai` (viewer), `huggingface_hub` ≥ 1.16 (volume mounts), `hf` CLI, `gh` CLI, vanilla JS + Node 20 for testing the deep-link fix.

**Design source of truth:** `docs/superpowers/specs/2026-06-02-allarma-v2-deployment-design.md`.

**Working directories:**
- Dashboard repo (already cloned, this directory): `/Users/imsaumil/Desktop/EPRI_RESEARCH/ALLARMA_PAPER_WRITING_FILES/imsaumil/allarma-benchmark-eval-dashboard-full`
- Space repo (will be cloned in Task 2.1): `/tmp/allarma-benchmark-space`

**Push policy (per session rule):** Any task whose step pushes to a remote (`git push`, `hf upload`, `hf spaces volumes set`, `gh api ... -X POST`) prompts the user for explicit go-ahead before running. The plan flags those steps with **🔐 user-authorize**.

---

## Phase 1 — Local prep and deep-link fix (TDD-able)

### Task 1.1: Capture v1 (CIGRE) artifact baselines

Records the `lastModified` of the v1 dataset and v1 Space, plus the v1 GH Pages HTTP status, so Gate 8 (no-regression check on frozen CIGRE artifacts) has something concrete to compare against later.

**Files:**
- Create: `docs/superpowers/verification/2026-06-02-v1-baseline.txt`

- [ ] **Step 1:** Run the baseline capture and tee to disk.

```bash
mkdir -p docs/superpowers/verification
{
  echo "=== captured: $(date -u +%FT%TZ) ==="
  echo "--- v1 dataset imsaumil/allarma-benchmark-eval-logs ---"
  curl -s https://huggingface.co/api/datasets/imsaumil/allarma-benchmark-eval-logs \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('lastModified:', d['lastModified']); print('private:', d['private'])"
  echo "--- v1 space imsaumil/allarma-benchmark-logs ---"
  curl -s https://huggingface.co/api/spaces/imsaumil/allarma-benchmark-logs \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('lastModified:', d['lastModified']); print('stage:', d['runtime']['stage'])"
  echo "--- v1 GH Pages dashboard ---"
  curl -sI https://imsaumil.github.io/allarma-benchmark-eval-dashboard/ \
    | head -1
} | tee docs/superpowers/verification/2026-06-02-v1-baseline.txt
```

Expected output (approximately):
```
=== captured: 2026-06-02T... ===
--- v1 dataset imsaumil/allarma-benchmark-eval-logs ---
lastModified: 2026-04-...
private: False
--- v1 space imsaumil/allarma-benchmark-logs ---
lastModified: 2026-04-12T19:45:53.000Z
stage: RUNNING
--- v1 GH Pages dashboard ---
HTTP/2 200
```

- [ ] **Step 2:** Commit.

```bash
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "chore(verification): capture v1 CIGRE artifact baselines for Gate 8"
```

---

### Task 1.2: TDD — fix `buildLogUrl` signature

Adds a Node-runnable assertion that covers the four shapes the spec promises (retriever single, modifier single, Compare-Δ literals, `+` percent-encoding), then makes it pass.

**Files:**
- Create: `scripts/tests/test_build_log_url.js`
- Modify: `js/shared-utils.js:69-74`

- [ ] **Step 1:** Create the failing test.

```bash
mkdir -p scripts/tests
```

Write `scripts/tests/test_build_log_url.js`:

```js
// Test buildLogUrl produces the {machine}/{category}/{model}/{file} path
// against the v2 InspectAI viewer Space hostname. Pre-fix this fails because
// the function has no `machine` parameter and the URL omits the segment.

const assert = require('node:assert');
const path = require('node:path');
const { buildLogUrl } = require(path.join(__dirname, '..', '..', 'js', 'shared-utils.js'));

const SPACE = 'https://imsaumil-allarma-benchmark.hf.space/#/logs';

// 1) Canonical SKORGE gpt-oss-20b/llm_direct_match_all (retriever-llm)
{
  const url = buildLogUrl(
    'gpt-oss-20b',
    '2026-03-09T20-47-38+00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval',
    'retriever-llm',
    'skorge',
  );
  const expected = SPACE +
    '/skorge/retriever/gpt-oss-20b' +
    '/2026-03-09T20-47-38%2B00-00_llm-direct-match-all_4nMPiCbiFLqLNLwBCZHSs2.eval';
  assert.strictEqual(url, expected, '1) SKORGE direct-match-all URL');
}

// 2) DGX modifier row
{
  const url = buildLogUrl(
    'qwen3.5-0.8b',
    '2026-04-27T18-20-07+00-00_modifier-benchmark-task_abc.eval',
    'modifier',
    'dgx_spark',
  );
  const expected = SPACE +
    '/dgx_spark/modifier/qwen3.5-0.8b' +
    '/2026-04-27T18-20-07%2B00-00_modifier-benchmark-task_abc.eval';
  assert.strictEqual(url, expected, '2) DGX modifier URL');
}

// 3) Compare-Δ SKORGE side (allarma baseline retriever, model_folder = allarma-retriever-benchmark)
{
  const url = buildLogUrl(
    'allarma-retriever-benchmark',
    '2026-03-04T06-01-44+00-00_baseline-dense-candidate_hDCxoeyAGRGWsPMWkJdQ8i.eval',
    'retriever-allarma',
    'skorge',
  );
  const expected = SPACE +
    '/skorge/retriever/allarma-retriever-benchmark' +
    '/2026-03-04T06-01-44%2B00-00_baseline-dense-candidate_hDCxoeyAGRGWsPMWkJdQ8i.eval';
  assert.strictEqual(url, expected, '3) SKORGE allarma baseline URL');
}

// 4) Multiple '+' encoded
{
  const url = buildLogUrl('m', 'a+b+c.eval', 'modifier', 'dgx_spark');
  assert.ok(url.endsWith('/dgx_spark/modifier/m/a%2Bb%2Bc.eval'), '4) multi-plus encoding');
}

console.log('PASS: 4/4 buildLogUrl assertions');
```

- [ ] **Step 2:** Run the test, verify it fails.

```bash
node scripts/tests/test_build_log_url.js
```

Expected: throws `AssertionError` on assertion 1 — the produced URL will be `…/#/logs/retriever/gpt-oss-20b/…` (no machine segment) instead of `…/#/logs/skorge/retriever/gpt-oss-20b/…`.

- [ ] **Step 3:** Edit `js/shared-utils.js` lines 69-74 to add the `machine` parameter and put it in the path.

Find this block (lines 69-74 verbatim):
```js
function buildLogUrl(modelFolder, evalFile, benchmark) {
  const category = benchmark === 'modifier' ? 'modifier' : 'retriever';
  const encodedFile = String(evalFile).replace(/\+/g, '%2B');
  return 'https://imsaumil-allarma-benchmark.hf.space/#/logs/' +
    category + '/' + modelFolder + '/' + encodedFile;
}
```

Replace with:
```js
function buildLogUrl(modelFolder, evalFile, benchmark, machine) {
  const category = benchmark === 'modifier' ? 'modifier' : 'retriever';
  const encodedFile = String(evalFile).replace(/\+/g, '%2B');
  return 'https://imsaumil-allarma-benchmark.hf.space/#/logs/' +
    machine + '/' + category + '/' + modelFolder + '/' + encodedFile;
}
```

Also update the JSDoc-style comment block immediately above (lines 66-68) so the documented signature matches:

Find:
```js
// Deep-link to the exact eval in the full-corpus InspectAI viewer Space.
//   category = 'modifier' when benchmark === 'modifier', else 'retriever'.
//   '+' in the eval filename must be percent-encoded as %2B.
```

Replace with:
```js
// Deep-link to the exact eval in the full-corpus InspectAI viewer Space.
//   path = /<machine>/<category>/<modelFolder>/<evalFile>
//   category = 'modifier' when benchmark === 'modifier', else 'retriever'.
//   machine = 'skorge' | 'dgx_spark' (matches the HF dataset top-level layout).
//   '+' in the eval filename must be percent-encoded as %2B.
```

- [ ] **Step 4:** Re-run the test, verify it passes.

```bash
node scripts/tests/test_build_log_url.js
```

Expected output: `PASS: 4/4 buildLogUrl assertions` (exit 0).

- [ ] **Step 5:** Verify the file's CommonJS export still works (it's depended on by the test) and the IIFE-style window guard is intact.

```bash
node --check js/shared-utils.js
node -e "const u=require('./js/shared-utils.js'); console.log(Object.keys(u).sort().join(','))"
```

Expected second command output exactly: `CHART_FONTS,CHART_MARGINS,CHART_RANGE_PCT,METRIC_LABELS,MODEL_COLORS,MODEL_DISPLAY,REASONING_MODELS,STRATEGY_FAMILY,buildLogUrl,exportJSONToCSV,formatRuntime`

- [ ] **Step 6:** Commit (test + fix together — atomic).

```bash
git add scripts/tests/test_build_log_url.js js/shared-utils.js
git commit -m "fix(deep-link): buildLogUrl prepends machine segment + node test"
```

---

### Task 1.3: Update the 8 `buildLogUrl` call sites to pass `machine`

The call sites currently invoke `buildLogUrl` with 3 args; the new signature needs a 4th. Per spec §5.3, four sites read `machine` from the row data and four sites pass machine literals.

**Files:**
- Modify: `js/retrieval-section.js` (lines 604, 658, 862, 863)
- Modify: `js/modifier-section.js` (lines 371, 404, 604, 605)

- [ ] **Step 1:** Update the four retrieval call sites.

In `js/retrieval-section.js`, find each line and apply the change.

Line 604, find:
```js
      logUrl: buildLogUrl(row.model_folder, row.eval_file, row.benchmark),
```
Replace with:
```js
      logUrl: buildLogUrl(row.model_folder, row.eval_file, row.benchmark, row.machine),
```

Line 658, find:
```js
    const url = buildLogUrl(r.model_folder, r.eval_file, r.benchmark);
```
Replace with:
```js
    const url = buildLogUrl(r.model_folder, r.eval_file, r.benchmark, r.machine);
```

Line 862, find:
```js
      const skUrl = buildLogUrl(d.model_folder, d.sk_eval_file, d.benchmark);
```
Replace with:
```js
      const skUrl = buildLogUrl(d.model_folder, d.sk_eval_file, d.benchmark, 'skorge');
```

Line 863, find:
```js
      const dgxUrl = buildLogUrl(d.model_folder, d.dgx_eval_file, d.benchmark);
```
Replace with:
```js
      const dgxUrl = buildLogUrl(d.model_folder, d.dgx_eval_file, d.benchmark, 'dgx_spark');
```

- [ ] **Step 2:** Update the four modifier call sites.

In `js/modifier-section.js`, apply the same pattern.

Line 371, find:
```js
      logUrl: buildLogUrl(row.model_folder, row.eval_file, 'modifier'),
```
Replace with:
```js
      logUrl: buildLogUrl(row.model_folder, row.eval_file, 'modifier', row.machine),
```

Line 404, find:
```js
      const url = buildLogUrl(r.model_folder, r.eval_file, 'modifier');
```
Replace with:
```js
      const url = buildLogUrl(r.model_folder, r.eval_file, 'modifier', r.machine);
```

Line 604, find:
```js
      const skUrl = buildLogUrl(d.p.sk.model_folder, d.p.sk.eval_file, 'modifier');
```
Replace with:
```js
      const skUrl = buildLogUrl(d.p.sk.model_folder, d.p.sk.eval_file, 'modifier', 'skorge');
```

Line 605, find:
```js
      const dgxUrl = buildLogUrl(d.p.dg.model_folder, d.p.dg.eval_file, 'modifier');
```
Replace with:
```js
      const dgxUrl = buildLogUrl(d.p.dg.model_folder, d.p.dg.eval_file, 'modifier', 'dgx_spark');
```

- [ ] **Step 3:** Verify no stale 3-arg calls remain.

```bash
# Every buildLogUrl( call in section JS should have exactly 4 args (3 commas inside the parens)
grep -nE 'buildLogUrl\([^)]*\)' js/retrieval-section.js js/modifier-section.js \
  | awk -F'buildLogUrl' '{print $2}' | head -20
echo "---"
# A 4-arg call has exactly 3 top-level commas between buildLogUrl( and the matching )
# Quick proxy: count commas in each call
grep -nE 'buildLogUrl\(' js/retrieval-section.js js/modifier-section.js \
  | python3 -c "
import re, sys
for ln in sys.stdin:
    m = re.search(r'buildLogUrl\(([^)]*)\)', ln)
    if not m: print('NO MATCH:', ln.rstrip()); continue
    args = m.group(1)
    n = args.count(',')
    status = 'OK' if n == 3 else 'WRONG ('+str(n+1)+' args)'
    print(status, '|', ln.rstrip())
"
```

Expected: every line ends with `OK | …`. If any reports `WRONG`, locate and fix before continuing.

- [ ] **Step 4:** Re-run the unit test (still passes — the test only exercises the function itself, but this confirms no regression).

```bash
node scripts/tests/test_build_log_url.js
```

Expected: `PASS: 4/4 buildLogUrl assertions`.

- [ ] **Step 5:** `node --check` both edited files.

```bash
node --check js/retrieval-section.js
node --check js/modifier-section.js
```

Expected: both silent (no syntax errors).

- [ ] **Step 6:** Commit.

```bash
git add js/retrieval-section.js js/modifier-section.js
git commit -m "fix(deep-link): pass machine to buildLogUrl at all 8 call sites"
```

---

### Task 1.4: Bump cache-bust to `?v=100` in `index.html`

Without this, returning visitors keep the v=99 cache of the broken `shared-utils.js` and see 404s on every drilldown.

**Files:**
- Modify: `index.html` (lines 11, 73–78)

- [ ] **Step 1:** Replace `?v=99` everywhere in `index.html`.

```bash
# In-place sed (BSD sed on macOS needs '' as the in-place suffix)
sed -i '' 's/?v=99/?v=100/g' index.html
```

- [ ] **Step 2:** Verify replacement count is exactly 6 (style + 5 scripts).

```bash
grep -cE '\?v=100' index.html
grep -cE '\?v=99'  index.html
```

Expected: first command prints `6`, second prints `0`.

- [ ] **Step 3:** Commit.

```bash
git add index.html
git commit -m "chore(html): cache-bust ?v=99 -> ?v=100 (shared-utils.js signature change)"
```

---

### Task 1.5: Gate 1 — local end-to-end smoke test of deep-link fix

Verifies the dashboard renders and the produced URLs (in the table cells and the drawer) include the `machine` segment.

- [ ] **Step 1:** Start a local server in a backgrounded shell.

```bash
python3 -m http.server 8765 > /tmp/dashboard-server.log 2>&1 &
SERVER_PID=$!
sleep 1
curl -sI -o /dev/null -w "index.html status: %{http_code}\n" http://localhost:8765/
for j in retrieval-llm-summary retrieval-allarma-summary retrieval-llm-tiers modifier-summary modifier-templates modifier-deltas cross-machine-deltas; do
  code=$(curl -sI -o /dev/null -w '%{http_code}' "http://localhost:8765/data/${j}.json")
  echo "data/${j}.json: ${code}"
done
echo "SERVER_PID=${SERVER_PID}" > /tmp/dashboard-server.pid
```

Expected: `index.html status: 200` and all seven `data/*.json` 200.

- [ ] **Step 2:** Run a Node script that loads the JSON, calls `buildLogUrl` against one row from each of the four scenarios, and asserts the output URL contains a recognised machine segment. This is the programmatic stand-in for clicking around the UI; faster and reproducible.

Create `scripts/tests/test_smoke_local.js` (temporary verification file; we delete it after the gate passes):

```js
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { buildLogUrl } = require(path.join(__dirname, '..', '..', 'js', 'shared-utils.js'));

const data = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', rel), 'utf8'));

const retLlm   = data('retrieval-llm-summary.json');
const retAll   = data('retrieval-allarma-summary.json');
const mod      = data('modifier-summary.json');
const xMachine = data('cross-machine-deltas.json');

function check(label, url) {
  assert.ok(
    url.includes('/skorge/') || url.includes('/dgx_spark/'),
    `${label}: missing machine segment — got ${url}`,
  );
  assert.ok(
    url.startsWith('https://imsaumil-allarma-benchmark.hf.space/#/logs/'),
    `${label}: wrong host — got ${url}`,
  );
  console.log(`OK ${label}: ${url}`);
}

// retrieval single (table cell)
const r1 = retLlm[0];
check('retrieval-single', buildLogUrl(r1.model_folder, r1.eval_file, r1.benchmark, r1.machine));

// retrieval allarma single
const r2 = retAll[0];
check('retrieval-allarma', buildLogUrl(r2.model_folder, r2.eval_file, r2.benchmark, r2.machine));

// modifier single
const r3 = mod[0];
check('modifier-single', buildLogUrl(r3.model_folder, r3.eval_file, 'modifier', r3.machine));

// retrieval Compare-Δ
const c1 = xMachine[0];
check('retrieval-compare-sk',  buildLogUrl(c1.model_folder, c1.sk_eval_file,  c1.benchmark, 'skorge'));
check('retrieval-compare-dgx', buildLogUrl(c1.model_folder, c1.dgx_eval_file, c1.benchmark, 'dgx_spark'));

console.log('PASS: 5/5 smoke assertions');
```

Run it:
```bash
node scripts/tests/test_smoke_local.js
```

Expected output (last line): `PASS: 5/5 smoke assertions`.

- [ ] **Step 3:** Stop the server and clean up the temporary smoke script (keep the unit test from 1.2 — it's a regression test).

```bash
kill "$(cat /tmp/dashboard-server.pid | cut -d= -f2)" 2>/dev/null
rm scripts/tests/test_smoke_local.js
```

- [ ] **Step 4:** Record Gate 1 result.

Append to `docs/superpowers/verification/2026-06-02-v1-baseline.txt`:
```bash
{
  echo ""
  echo "=== Gate 1 (local smoke test) — $(date -u +%FT%TZ) ==="
  echo "PASS: index 200, 7/7 JSONs 200, 5/5 deep-link URLs include machine segment"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-1): local smoke test of deep-link fix — PASS"
```

---

## Phase 2 — HF Space build, mount, and viewer verification

### Task 2.1: Clone the HF Space repo locally

The Space is a separate git repo from the dashboard. We work on it in a sibling working directory.

- [ ] **Step 1:** Confirm `hf` CLI is authenticated as `imsaumil` (per [HF account memory](../../../../../.claude/projects/-Users-imsaumil-Desktop-EPRI-RESEARCH-ALLARMA-PAPER-WRITING-FILES/memory/reference_hf_account.md)).

```bash
hf auth whoami
```

Expected: prints `user: imsaumil` (or the active profile `allarma-benchmarking` resolving to that user).

- [ ] **Step 2:** Clone the Space repo to `/tmp/allarma-benchmark-space`.

```bash
rm -rf /tmp/allarma-benchmark-space
git clone https://huggingface.co/spaces/imsaumil/allarma-benchmark /tmp/allarma-benchmark-space
ls -la /tmp/allarma-benchmark-space
```

Expected: directory contains `.git/`, `.gitattributes`, `README.md` (and nothing else, per the spec's verified state).

- [ ] **Step 3:** Set the Space repo's git author to Saumil (per [no-Claude-coauthor rule](../../../../../.claude/projects/-Users-imsaumil-Desktop-EPRI-RESEARCH-ALLARMA-PAPER-WRITING-FILES/memory/feedback_no_claude_coauthor.md)).

```bash
cd /tmp/allarma-benchmark-space
git config user.name "imsaumil"
git config user.email "sashah8@ncsu.edu"
git log --oneline -5
```

Expected: shows the initial Space commit history.

---

### Task 2.2: Write the Space `Dockerfile`

Single-purpose image: install `inspect-ai`, expose 7860, run the start script.

**Files:**
- Create: `/tmp/allarma-benchmark-space/Dockerfile`

- [ ] **Step 1:** Write the file.

```bash
cat > /tmp/allarma-benchmark-space/Dockerfile <<'EOF'
FROM python:3.11-slim

# inspect-ai bundles the InspectAI eval viewer (`inspect view`).
RUN pip install --no-cache-dir inspect-ai

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 7860
CMD ["/app/start.sh"]
EOF
```

- [ ] **Step 2:** Verify the file is well-formed and pip-install line resolves a real package.

```bash
cat /tmp/allarma-benchmark-space/Dockerfile
pip index versions inspect-ai 2>&1 | head -2
```

Expected: file content as written; `inspect-ai` package exists on PyPI with versions listed.

- [ ] **Step 3:** Do not commit yet — we commit `Dockerfile` + `start.sh` + `README.md` together in Task 2.5 so the Space build only triggers once.

---

### Task 2.3: Write the Space `start.sh`

One-line entrypoint: launch the viewer against the mounted dataset path on 0.0.0.0:7860.

**Files:**
- Create: `/tmp/allarma-benchmark-space/start.sh`

- [ ] **Step 1:** Write the script.

```bash
cat > /tmp/allarma-benchmark-space/start.sh <<'EOF'
#!/bin/sh
# /data is the read-only mount of the imsaumil/allarma-benchmark dataset.
# The InspectAI viewer serves whatever is under --log-dir.
exec inspect view start --log-dir /data --host 0.0.0.0 --port 7860
EOF
```

- [ ] **Step 2:** Verify shebang and that the script is what's expected.

```bash
cat /tmp/allarma-benchmark-space/start.sh
file /tmp/allarma-benchmark-space/start.sh
```

Expected: prints the script; `file` says "POSIX shell script" or similar.

- [ ] **Step 3:** Make sure the chmod in the Dockerfile will succeed by setting executable bit locally too (defensive — some HF Spaces preserve the file mode from git).

```bash
chmod +x /tmp/allarma-benchmark-space/start.sh
ls -l /tmp/allarma-benchmark-space/start.sh
```

Expected: mode line shows `-rwxr-xr-x` or equivalent.

- [ ] **Step 4:** Do not commit yet (bundled commit in Task 2.5).

---

### Task 2.4: Replace the Space `README.md` with a real body (keep frontmatter)

The existing README is 201 bytes of YAML frontmatter plus the boilerplate comment. We preserve the frontmatter exactly and add a body that describes what the Space is for and links to its companions.

**Files:**
- Modify: `/tmp/allarma-benchmark-space/README.md`

- [ ] **Step 1:** Inspect the current frontmatter so we can preserve it byte-for-byte.

```bash
head -10 /tmp/allarma-benchmark-space/README.md
```

Expected (from the spec's verified state):
```
---
title: Allarma Benchmark
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
```

- [ ] **Step 2:** Overwrite the file with the same frontmatter plus a body.

```bash
cat > /tmp/allarma-benchmark-space/README.md <<'EOF'
---
title: Allarma Benchmark
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---

# aLLarMa Benchmark — InspectAI Eval Log Viewer

InspectAI viewer for the 548 `.eval` files of the aLLarMa cross-machine
benchmark corpus. The dataset [imsaumil/allarma-benchmark](https://huggingface.co/datasets/imsaumil/allarma-benchmark)
is mounted read-only at `/data` and served by `inspect view start --log-dir /data`.

Every chart cell on the [dashboard](https://imsaumil.github.io/allarma-benchmark)
deep-links to a specific eval here at
`#/logs/<machine>/<category>/<model>/<file>`.

## Companions

- **Dashboard:** https://imsaumil.github.io/allarma-benchmark
- **Dataset:** https://huggingface.co/datasets/imsaumil/allarma-benchmark
- **Source repo:** https://github.com/imsaumil/allarma-benchmark
- **Paper:** Shah, Kelly, Tang. *Benchmarking aLLarMa: A Constrained Two-Stage GraphRAG Framework for Power System Alarm, Network and Operational Data Analytics.* Applied Energy (under review), 2026.
EOF
```

Note: `app_port: 7860` was *not* in the original frontmatter the spec recorded. Add it explicitly so HF routes the public hostname to the right port — otherwise HF defaults to 7860 anyway but the explicit declaration removes ambiguity for future readers. This is the only frontmatter delta.

- [ ] **Step 3:** Verify the YAML frontmatter parses.

```bash
python3 -c "
import yaml, pathlib
text = pathlib.Path('/tmp/allarma-benchmark-space/README.md').read_text()
fm = text.split('---', 2)[1]
print(yaml.safe_load(fm))
"
```

Expected: a dict with all the original keys plus `app_port: 7860`.

- [ ] **Step 4:** Do not commit yet (bundled commit in Task 2.5).

---

### Task 2.5: Commit and push the Space repo  🔐 user-authorize

This is the first remote-mutating step. It triggers the HF Space build pipeline.

- [ ] **Step 1:** Stage and review the diff.

```bash
cd /tmp/allarma-benchmark-space
git add Dockerfile start.sh README.md
git status
git diff --staged | head -60
```

Expected: 3 new files (`Dockerfile`, `start.sh`) plus README body addition.

- [ ] **Step 2:** **🔐 Ask the user for explicit go-ahead before pushing.** Phrase: "About to push Dockerfile + start.sh + README to the HF Space `imsaumil/allarma-benchmark`. This triggers the Space build. Proceed?"

- [ ] **Step 3:** Commit and push only after authorization.

```bash
git commit -m "feat: dockerfile + start.sh + readme — InspectAI viewer over mounted dataset"
git push origin main
```

Expected: push succeeds; HF starts the build.

---

### Task 2.6: Watch the Space build (Gate 2)

The build pulls `python:3.11-slim`, `pip install inspect-ai`, copies the start script. Typically 2–5 min.

- [ ] **Step 1:** Poll the build status.

```bash
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  stage=$(curl -s https://huggingface.co/api/spaces/imsaumil/allarma-benchmark \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['runtime']['stage'])")
  echo "[$(date -u +%H:%M:%S)] stage=${stage}"
  if [ "${stage}" = "RUNNING" ] || [ "${stage}" = "BUILD_ERROR" ] || [ "${stage}" = "RUNTIME_ERROR" ]; then
    break
  fi
  sleep 30
done
```

Expected: `stage=RUNNING` within ~6 minutes.

- [ ] **Step 2:** If the build fails (`BUILD_ERROR` or stays in `BUILDING` > 10 minutes), pull build logs and diagnose.

```bash
hf spaces logs imsaumil/allarma-benchmark --build | tail -80
```

Common failure modes: pip resolver fails (network / version pin), Docker layer COPY fails (file mode). Fix locally, force-push, re-poll.

- [ ] **Step 3:** Record Gate 2 result.

```bash
cd /Users/imsaumil/Desktop/EPRI_RESEARCH/ALLARMA_PAPER_WRITING_FILES/imsaumil/allarma-benchmark-eval-dashboard-full
{
  echo ""
  echo "=== Gate 2 (Space build) — $(date -u +%FT%TZ) ==="
  echo "stage=$(curl -s https://huggingface.co/api/spaces/imsaumil/allarma-benchmark | python3 -c "import sys,json; print(json.load(sys.stdin)['runtime']['stage'])")"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-2): Space build reached RUNNING"
```

---

### Task 2.7: Mount the HF dataset as a read-only volume on the Space (Gate 3)  🔐 user-authorize

Configuration call against the live Space — survives across builds and restarts.

- [ ] **Step 1:** **🔐 Ask the user for go-ahead before issuing the mount call.** Phrase: "About to attach `hf://datasets/imsaumil/allarma-benchmark` read-only at `/data` on the Space. This restarts the Space. Proceed?"

- [ ] **Step 2:** Issue the mount call via the CLI.

```bash
hf spaces volumes set imsaumil/allarma-benchmark \
  -v hf://datasets/imsaumil/allarma-benchmark:/data
```

Expected: command exits 0 and confirms the volume is set.

- [ ] **Step 3:** Confirm the mount via the Python API (definitive — the CLI may print success on async-accepted requests).

```bash
python3 -c "
from huggingface_hub import HfApi
rt = HfApi().get_space_runtime('imsaumil/allarma-benchmark')
print('stage:', rt.stage)
print('volumes:')
for v in (getattr(rt, 'volumes', None) or []):
    print(' ', v)
"
```

Expected: lists one volume with `type='dataset'`, `source='imsaumil/allarma-benchmark'`, `mount_path='/data'`, `read_only=True`.

- [ ] **Step 4:** Poll until the Space is back to `RUNNING` after the restart.

```bash
for i in 1 2 3 4 5 6; do
  stage=$(curl -s https://huggingface.co/api/spaces/imsaumil/allarma-benchmark \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['runtime']['stage'])")
  echo "[$(date -u +%H:%M:%S)] stage=${stage}"
  [ "${stage}" = "RUNNING" ] && break
  sleep 20
done
```

Expected: `stage=RUNNING` within ~2 minutes (no rebuild, just restart).

- [ ] **Step 5:** Record Gate 3.

```bash
{
  echo ""
  echo "=== Gate 3 (volume mounted) — $(date -u +%FT%TZ) ==="
  python3 -c "
from huggingface_hub import HfApi
rt = HfApi().get_space_runtime('imsaumil/allarma-benchmark')
print('stage:', rt.stage)
for v in (getattr(rt, 'volumes', None) or []):
    print('volume:', v)
"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-3): dataset volume mounted read-only at /data"
```

---

### Task 2.8: Verify the viewer responds (Gate 4)

HTTP-level liveness on the public hostname.

- [ ] **Step 1:** Request the root.

```bash
curl -sI https://imsaumil-allarma-benchmark.hf.space/ | head -5
curl -s  https://imsaumil-allarma-benchmark.hf.space/ | head -c 400; echo
```

Expected: first command prints `HTTP/2 200`; second prints the InspectAI viewer's HTML shell (look for "Inspect" or a `<title>` referencing it).

- [ ] **Step 2:** Record Gate 4.

```bash
{
  echo ""
  echo "=== Gate 4 (viewer responds) — $(date -u +%FT%TZ) ==="
  echo "HTTP status: $(curl -sI -o /dev/null -w '%{http_code}' https://imsaumil-allarma-benchmark.hf.space/)"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-4): viewer root returns 200"
```

---

### Task 2.9: Verify the viewer sees the corpus (Gate 5)

Per spec §10, the exact log-index endpoint isn't pre-verified. Probe two reasonable paths the InspectAI viewer typically exposes (`/api/logs`, `/logs`), fall back to UI inspection if neither responds.

- [ ] **Step 1:** Probe likely endpoints.

```bash
for ep in /api/logs /api/log-files /logs /api/logs/_dir; do
  code=$(curl -sI -o /dev/null -w '%{http_code}' "https://imsaumil-allarma-benchmark.hf.space${ep}")
  echo "${ep}: ${code}"
done
```

If any returns 200, fetch and count entries:
```bash
curl -s https://imsaumil-allarma-benchmark.hf.space/api/logs \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('entries:', len(d) if isinstance(d, list) else 'shape=' + str(type(d).__name__))" 2>&1
```

Expected (if endpoint works): entries ≥ 548 (or a JSON structure that enumerates skorge + dgx_spark + their model subfolders).

- [ ] **Step 2:** If no HTTP endpoint enumerates logs, fall back to UI inspection per spec §10. Open the viewer in a browser and confirm both `skorge/` and `dgx_spark/` directories are listed under the root log tree, each with their 11 model subfolders (9 LLM model folders + `allarma-retriever-benchmark` baseline + `modifier`-prefixed entries via category split).

Browser URL: `https://imsaumil-allarma-benchmark.hf.space/`. Record what you see.

- [ ] **Step 3:** Record Gate 5 result (HTTP count or UI confirmation).

```bash
{
  echo ""
  echo "=== Gate 5 (viewer sees corpus) — $(date -u +%FT%TZ) ==="
  echo "Result: (paste HTTP entry count OR UI confirmation here)"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
# Edit the file to fill in the actual result, then:
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-5): viewer enumerates the 548-eval corpus"
```

---

## Phase 3 — GitHub Pages enable

### Task 3.1: Add `.nojekyll` and push the dashboard branch  🔐 user-authorize

Without `.nojekyll`, GitHub Pages would route through Jekyll and could rewrite future asset paths. The repo also has unpushed commits from Phase 1 (deep-link fix + cache-bust + verification).

**Files:**
- Create: `.nojekyll` (dashboard repo root)

- [ ] **Step 1:** Create the file (empty, by convention).

```bash
touch .nojekyll
git add .nojekyll
git commit -m "chore: add .nojekyll to disable Jekyll on GH Pages"
```

- [ ] **Step 2:** Review what's about to be pushed.

```bash
git log origin/feat/v2-dashboard-rebuild..HEAD --oneline
```

Expected: 6 commits, in order — spec, baselines, deep-link fix, 8 call sites, cache-bust, Gate 1, `.nojekyll`. (Adjust expected count if any task added a commit beyond the planned set.)

- [ ] **Step 3:** **🔐 Ask the user for go-ahead before pushing.** Phrase: "About to push 6 local commits to `origin/feat/v2-dashboard-rebuild` (spec + deep-link fix + cache-bust + gate logs + .nojekyll). After push I'll enable Pages on this branch. Proceed?"

- [ ] **Step 4:** Push only after authorization.

```bash
git push origin feat/v2-dashboard-rebuild
```

Expected: push succeeds.

---

### Task 3.2: Enable GitHub Pages on the branch  🔐 user-authorize

- [ ] **Step 1:** **🔐 Confirm go-ahead** (likely already granted with the previous step, but the API call is a separate remote mutation).

- [ ] **Step 2:** Enable Pages via `gh`.

```bash
gh api repos/imsaumil/allarma-benchmark/pages -X POST \
  -f 'source[branch]=feat/v2-dashboard-rebuild' \
  -f 'source[path]=/'
```

Expected: returns a JSON blob with `"status": "queued"` (or `"building"`) and a URL.

- [ ] **Step 3:** Poll until the build completes.

```bash
for i in 1 2 3 4 5 6 7 8; do
  status=$(gh api repos/imsaumil/allarma-benchmark/pages --jq '.status')
  echo "[$(date -u +%H:%M:%S)] pages status=${status}"
  [ "${status}" = "built" ] && break
  sleep 30
done
```

Expected: `pages status=built` within ~4 minutes.

---

### Task 3.3: Verify Pages live (Gate 6)

- [ ] **Step 1:** Check root + every JSON.

```bash
echo "--- root ---"
curl -sI https://imsaumil.github.io/allarma-benchmark/ | head -1
echo "--- data/*.json ---"
for j in retrieval-llm-summary retrieval-allarma-summary retrieval-llm-tiers modifier-summary modifier-templates modifier-deltas cross-machine-deltas; do
  code=$(curl -sI -o /dev/null -w '%{http_code}' "https://imsaumil.github.io/allarma-benchmark/data/${j}.json")
  echo "data/${j}.json: ${code}"
done
echo "--- js/*.js ---"
for s in shared-utils data-loader retrieval-section modifier-section overview log-drawer; do
  code=$(curl -sI -o /dev/null -w '%{http_code}' "https://imsaumil.github.io/allarma-benchmark/js/${s}.js?v=100")
  echo "js/${s}.js?v=100: ${code}"
done
```

Expected: all 200.

- [ ] **Step 2:** Confirm the served `shared-utils.js` is the fixed version.

```bash
curl -s "https://imsaumil.github.io/allarma-benchmark/js/shared-utils.js?v=100" \
  | grep -E "function buildLogUrl\(modelFolder, evalFile, benchmark, machine\)"
```

Expected: one line of output (the fixed signature). Empty output means GitHub Pages cached the old version — wait a few minutes and re-poll.

- [ ] **Step 3:** Record Gate 6.

```bash
{
  echo ""
  echo "=== Gate 6 (Pages live with fix) — $(date -u +%FT%TZ) ==="
  echo "root: $(curl -sI -o /dev/null -w '%{http_code}' https://imsaumil.github.io/allarma-benchmark/)"
  echo "shared-utils signature present: $(curl -s "https://imsaumil.github.io/allarma-benchmark/js/shared-utils.js?v=100" | grep -cE "function buildLogUrl\(modelFolder, evalFile, benchmark, machine\)")"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-6): Pages live + fixed shared-utils.js served"
git push origin feat/v2-dashboard-rebuild   # pushes Gate 6 record
```

---

## Phase 4 — End-to-end and regression

### Task 4.1: Click-through deep-link test (Gate 7)

Open the live dashboard in a browser and verify each section's drilldown opens the right eval in the live viewer.

- [ ] **Step 1:** Open `https://imsaumil.github.io/allarma-benchmark/` and from each of the four sections, click one drilldown link. Capture for each:
  - source row (machine, model, strategy, eval_file)
  - produced URL (browser tab)
  - viewer outcome (eval loaded vs 404)

  Sections to cover:
  1. Retrieval, single machine: SKORGE → table → click any LLM strategy row → viewer.
  2. Retrieval, Compare-Δ: open Compare → click any point off-diagonal → viewer (twice, once per side).
  3. Modifier, single machine: DGX → table → click any model row → viewer.
  4. Modifier, Compare-Δ: open Compare → click any delta cell → viewer.

- [ ] **Step 2:** Record outcomes.

```bash
{
  echo ""
  echo "=== Gate 7 (end-to-end deep links) — $(date -u +%FT%TZ) ==="
  echo "1) retrieval-single: (paste outcome)"
  echo "2) retrieval-compare-sk: (paste outcome)"
  echo "   retrieval-compare-dgx: (paste outcome)"
  echo "3) modifier-single: (paste outcome)"
  echo "4) modifier-compare-sk: (paste outcome)"
  echo "   modifier-compare-dgx: (paste outcome)"
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
# Edit to fill outcomes
```

- [ ] **Step 3:** If any link fails, do NOT proceed to Gate 8. Diagnose: re-check the URL produced by the dashboard vs the actual file path inside the viewer; check whether the viewer's hash router accepts the `#/logs/...` shape (it should — same shape as v1's working pattern).

- [ ] **Step 4:** Commit the Gate 7 record.

```bash
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-7): end-to-end deep links — 6/6 PASS"
```

---

### Task 4.2: Regression check on v1 (CIGRE) artifacts (Gate 8)

Compares current state of v1 artifacts to the baseline captured in Task 1.1.

- [ ] **Step 1:** Re-fetch the four fields using **the same section headers as Task 1.1** so step 2's diff can match them.

```bash
{
  echo ""
  echo "=== Gate 8 (v1 regression check) — $(date -u +%FT%TZ) ==="
  echo "--- v1 dataset imsaumil/allarma-benchmark-eval-logs ---"
  curl -s https://huggingface.co/api/datasets/imsaumil/allarma-benchmark-eval-logs \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('lastModified:', d['lastModified']); print('private:', d['private'])"
  echo "--- v1 space imsaumil/allarma-benchmark-logs ---"
  curl -s https://huggingface.co/api/spaces/imsaumil/allarma-benchmark-logs \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('lastModified:', d['lastModified']); print('stage:', d['runtime']['stage'])"
  echo "--- v1 GH Pages dashboard ---"
  curl -sI https://imsaumil.github.io/allarma-benchmark-eval-dashboard/ | head -1
} >> docs/superpowers/verification/2026-06-02-v1-baseline.txt
```

- [ ] **Step 2:** Side-by-side compare of every captured value. The file now has the baseline section (captured Task 1.1) and the Gate 8 section (captured above), with identical headers; print each diffable line so a drift is obvious.

```bash
echo "--- baseline (Task 1.1) ---"
awk '/^=== captured:/{p=1; next} /^=== /{p=0} p' docs/superpowers/verification/2026-06-02-v1-baseline.txt \
  | grep -E "^(lastModified|stage|private|HTTP/)"
echo ""
echo "--- gate 8 (now) ---"
awk '/^=== Gate 8 \(/{p=1; next} /^=== /{p=0} p' docs/superpowers/verification/2026-06-02-v1-baseline.txt \
  | grep -E "^(lastModified|stage|private|HTTP/)"
```

Expected: the two blocks print identical lines (same `lastModified` × 2, same `stage`, same `private`, same `HTTP/2 200`).

- [ ] **Step 3:** If any line differs between the two blocks, **stop and surface the change to the user before commit.** A drift means a CIGRE artifact was touched, which violates the artifact-integrity rule.

- [ ] **Step 4:** Commit the Gate 8 record.

```bash
git add docs/superpowers/verification/2026-06-02-v1-baseline.txt
git commit -m "test(gate-8): v1 CIGRE artifacts unchanged — regression clear"
```

---

### Task 4.3: Final deployment readme update + push

The dashboard's `README.md` currently says "Push to GitHub, enable GitHub Pages on `master` branch." — both inaccurate now. Update to reflect what actually happened.

**Files:**
- Modify: `README.md` (lines 25-30)

- [ ] **Step 1:** Read the current README to see the exact text.

```bash
sed -n '25,32p' README.md
```

- [ ] **Step 2:** Replace the "Deployment" section. Find:
```markdown
## Deployment

- **Dashboard:** Push to GitHub, enable GitHub Pages on `master` branch.
- **Eval logs (InspectAI viewer):** HuggingFace Docker space `imsaumil/allarma-benchmark` snapshot-downloads from HF dataset `imsaumil/allarma-benchmark` on cold start.

Predecessor (CIGRE 2026, 3-model subset): https://imsaumil.github.io/allarma-benchmark-eval-dashboard/
```

Replace with:
```markdown
## Deployment

- **Dashboard:** Live at https://imsaumil.github.io/allarma-benchmark — GitHub Pages on the `feat/v2-dashboard-rebuild` branch of `imsaumil/allarma-benchmark`.
- **Eval logs (InspectAI viewer):** Live at https://imsaumil-allarma-benchmark.hf.space — HuggingFace Docker Space `imsaumil/allarma-benchmark` with the `imsaumil/allarma-benchmark` dataset mounted read-only at `/data` (no snapshot download — see `docs/superpowers/specs/2026-06-02-allarma-v2-deployment-design.md`).

Predecessor (CIGRE 2026, 3-model subset): https://imsaumil.github.io/allarma-benchmark-eval-dashboard/
```

- [ ] **Step 3:** Commit and push.

```bash
git add README.md
git commit -m "docs: update README deployment section to match v2 reality"
```

- [ ] **Step 4:** **🔐 Confirm with user before final push**, then:

```bash
git push origin feat/v2-dashboard-rebuild
```

- [ ] **Step 5:** Final state check — print a one-screen summary the user can paste/share.

```bash
{
  echo "=== aLLarMa v2 deployment — done $(date -u +%FT%TZ) ==="
  echo "Dashboard:  https://imsaumil.github.io/allarma-benchmark  (HTTP $(curl -sI -o /dev/null -w '%{http_code}' https://imsaumil.github.io/allarma-benchmark/))"
  echo "Viewer:     https://imsaumil-allarma-benchmark.hf.space  (HTTP $(curl -sI -o /dev/null -w '%{http_code}' https://imsaumil-allarma-benchmark.hf.space/))"
  echo "Dataset:    https://huggingface.co/datasets/imsaumil/allarma-benchmark"
  echo "Repo:       https://github.com/imsaumil/allarma-benchmark"
  echo "Gates 1-8:  all PASS (see docs/superpowers/verification/2026-06-02-v1-baseline.txt)"
} | tee docs/superpowers/verification/2026-06-02-final.txt
git add docs/superpowers/verification/2026-06-02-final.txt
git commit -m "docs(verification): final deployment state"
```

---

## Deferred (post-deployment, not blocking)

- Update the HF dataset README's "Browse and visualise" links if any wording drifts (currently accurate).
- Add an entry to the project memory recording the deployment date and the dataset-volume-mount approach (so future sessions know v1 pattern was superseded).
- Reset the dashboard README's `scripts/extract_data_full.py` instructions — the `--unbounded-variant` flag is now vestigial (the canonical SKORGE direct-match file lives in the SKORGE tree as well; verified in Task 1.5 fixture data). Out of scope for deployment; flag for a follow-up commit.

---

## Self-review notes (per spec coverage)

- §3 design principles 1-4 → enforced throughout (free tier, no snapshot, scope-limited).
- §3 principle 5 (verify don't trust) → Gates 1-8 (Tasks 1.5, 2.6, 2.7, 2.8, 2.9, 3.3, 4.1, 4.2).
- §4 architecture → realised in Tasks 2.2-2.5 (Dockerfile/start.sh) + 2.7 (mount).
- §5.1 Space files → Tasks 2.2/2.3/2.4/2.5.
- §5.2 volume mount → Task 2.7.
- §5.3 deep-link fix → Tasks 1.2-1.4 (TDD; all 8 sites + cache-bust).
- §5.4 Pages enable → Tasks 3.1-3.2.
- §6 data flow example → covered by Task 1.2 fixture (canonical SKORGE direct-match file) + Task 4.1 click test.
- §7 gates 1-8 → Tasks 1.5, 2.6, 2.7, 2.8, 2.9, 3.3, 4.1, 4.2.
- §8 failure modes → reflected in conditional steps (Task 2.6 step 2, Task 2.9 step 2, Task 3.3 step 2, Task 4.1 step 3).
- §9 not-doing items → none of the deferred tasks touch CIGRE, paper, or extractor.
- §10 InspectAI endpoint TBD → Task 2.9 step 2 fallback to UI inspection.
- §11 predecessor → captured in deferred memory-update item.
