// shared-utils.js — constants and helpers shared across all sections.

// Note: 9 model colors. Picked to be distinguishable in both light and dark modes.
const MODEL_COLORS = {
  'gemma-4-e2b-it':         '#9C27B0',
  'gpt-oss-20b':            '#4CAF50',
  'Ministral-3-3B-Instruct-2512':  '#FFC107',
  'Ministral-3-8B-Instruct-2512':  '#FF9800',
  'Ministral-3-14B-Instruct-2512': '#FF5722',
  'nemotron-nano-9b-v2':    '#00BCD4',
  'nemotron-nano-12b-v2':   '#0097A7',
  'Qwen3.5-0.8B':           '#2196F3',
  'Qwen3.5-2B':             '#1976D2',
};

const MODEL_DISPLAY = {
  'gemma-4-e2b-it':         'Gemma-4-e2b-it',
  'gpt-oss-20b':            'gpt-oss-20B',
  'Ministral-3-3B-Instruct-2512':  'Ministral-3-3B',
  'Ministral-3-8B-Instruct-2512':  'Ministral-3-8B',
  'Ministral-3-14B-Instruct-2512': 'Ministral-3-14B',
  'nemotron-nano-9b-v2':    'Nemotron-Nano-9B-v2',
  'nemotron-nano-12b-v2':   'Nemotron-Nano-12B-v2',
  'Qwen3.5-0.8B':           'Qwen3.5-0.8B',
  'Qwen3.5-2B':             'Qwen3.5-2B',
};

const MACHINE_COLORS = { skorge: '#3F51B5', dgx_spark: '#E91E63' };
const MACHINE_DISPLAY = { skorge: 'SKORGE', dgx_spark: 'DGX_Spark' };

// The 3 reasoning models per audit doc; not currently used (reasoning toggle deferred to v1.1)
// but kept as a constant for v1.1.
const REASONING_MODELS = new Set(['gpt-oss-20b', 'nemotron-nano-9b-v2', 'nemotron-nano-12b-v2']);

function formatRuntime(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function exportJSONToCSV(data, columns, filename) {
  const header = columns.map(c => '"' + c.label + '"').join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
      return '"' + (val === null || val === undefined ? '' : String(val).replace(/"/g, '""')) + '"';
    }).join(',')
  );
  const csv = [header].concat(rows).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
