// shared-utils.js — constants and helpers shared across all sections.
// Keyed by the exact JSON `model` strings emitted by scripts/extract_data_full.py.

// 9-model color palette (from the validated UI prototype).
const MODEL_COLORS = {
  'gpt-oss-20b':                    '#1565c0',
  'NVIDIA-Nemotron-Nano-12B-v2':   '#00897b',
  'NVIDIA-Nemotron-Nano-9B-v2':    '#43a047',
  'Ministral-3-14B-Instruct-2512': '#6d4c41',
  'Ministral-3-8B-Instruct-2512':  '#8e24aa',
  'Ministral-3-3B-Instruct-2512':  '#c0ca33',
  'gemma-4-E2B-it':                '#f4511e',
  'Qwen3.5-2B':                    '#fb8c00',
  'Qwen3.5-0.8B':                  '#e53935',
};

// Short display labels for the legend / axes.
const MODEL_DISPLAY = {
  'gpt-oss-20b':                    'gpt-oss-20b',
  'NVIDIA-Nemotron-Nano-12B-v2':   'nemotron-12b',
  'NVIDIA-Nemotron-Nano-9B-v2':    'nemotron-9b',
  'Ministral-3-14B-Instruct-2512': 'ministral-14b',
  'Ministral-3-8B-Instruct-2512':  'ministral-8b',
  'Ministral-3-3B-Instruct-2512':  'ministral-3b',
  'gemma-4-E2B-it':                'gemma-e2b',
  'Qwen3.5-2B':                    'qwen-2b',
  'Qwen3.5-0.8B':                  'qwen-0.8b',
};

// The 3 reasoning models (✦ in the legend).
const REASONING_MODELS = new Set([
  'gpt-oss-20b',
  'NVIDIA-Nemotron-Nano-12B-v2',
  'NVIDIA-Nemotron-Nano-9B-v2',
]);

// Paper-vocabulary metric labels (single source of truth — design §7.2).
const METRIC_LABELS = {
  // Modifier
  Modification_Accuracy:    'Modification Accuracy',
  Neo4j_Syntactic_Validity: 'Execution Success (Syntactic)',
  Neo4j_Semantic_Validity:  'Answer Yield (non-empty)',
  // Retrieval
  accuracy:            'Accuracy',
  accuracy_in_scope:   'In-Scope Accuracy',
  accuracy_oos:        'OOS Accuracy',
  avg_llm_call_count:  'Avg LLM Calls/Sample',
  avg_llm_token_usage: 'Avg Tokens/Sample',
};

// Strategy family classification → 'base' | 'aug' | 'pure'.
//   retriever-allarma rows are always the non-LLM baselines → 'base'.
//   The two direct-match strategies are pure-LLM → 'pure'.
//   Everything else (LLM-augmented retrieval strategies) → 'aug'.
const PURE_LLM_STRATEGIES = new Set([
  'llm_direct_match_all',
  'llm_direct_match_candidate',
]);

function STRATEGY_FAMILY(strategy, benchmark) {
  if (benchmark === 'retriever-allarma') return 'base';
  if (PURE_LLM_STRATEGIES.has(strategy)) return 'pure';
  return 'aug';
}

// Deep-link to the exact eval in the full-corpus InspectAI viewer Space.
//   category = 'modifier' when benchmark === 'modifier', else 'retriever'.
//   '+' in the eval filename must be percent-encoded as %2B.
function buildLogUrl(modelFolder, evalFile, benchmark) {
  const category = benchmark === 'modifier' ? 'modifier' : 'retriever';
  const encodedFile = String(evalFile).replace(/\+/g, '%2B');
  return 'https://imsaumil-allarma-benchmark-logs-full.hf.space/#/logs/' +
    category + '/' + modelFolder + '/' + encodedFile;
}

// Human-readable runtime (copied verbatim from the CIGRE dashboard idiom).
function formatRuntime(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

// Generic JSON → CSV download (copied verbatim from the CIGRE dashboard idiom).
function exportJSONToCSV(data, columns, filename) {
  var header = columns.map(function (c) { return '"' + c.label + '"'; }).join(',');
  var rows = data.map(function (row) {
    return columns.map(function (c) {
      var val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
      return '"' + val + '"';
    }).join(',');
  });
  var csv = [header].concat(rows).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Expose on window for cross-file use (and for node-based assertions).
if (typeof window !== 'undefined') {
  window.MODEL_COLORS = MODEL_COLORS;
  window.MODEL_DISPLAY = MODEL_DISPLAY;
  window.REASONING_MODELS = REASONING_MODELS;
  window.METRIC_LABELS = METRIC_LABELS;
  window.STRATEGY_FAMILY = STRATEGY_FAMILY;
  window.buildLogUrl = buildLogUrl;
  window.formatRuntime = formatRuntime;
  window.exportJSONToCSV = exportJSONToCSV;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MODEL_COLORS, MODEL_DISPLAY, REASONING_MODELS, METRIC_LABELS,
    STRATEGY_FAMILY, buildLogUrl, formatRuntime, exportJSONToCSV,
  };
}
