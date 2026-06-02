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
