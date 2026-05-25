// data-loader.js — fetch the 6 dashboard JSONs and dispatch section initialization.

const DASHBOARD_DATA = {
  retrievalLlm: null,        // retrieval-llm-summary.json     (414)
  retrievalAllarma: null,    // retrieval-allarma-summary.json (116, model:null)
  retrievalLlmTiers: null,   // retrieval-llm-tiers.json       (414)
  modifier: null,            // modifier-summary.json          (18)
  modifierTemplates: null,   // modifier-templates.json        (378)
  crossMachineDeltas: null,  // cross-machine-deltas.json      (207)
  loaded: false,
};

async function loadAllData() {
  try {
    const [
      retrievalLlm,
      retrievalAllarma,
      retrievalLlmTiers,
      modifier,
      modifierTemplates,
      crossMachineDeltas,
    ] = await Promise.all([
      fetch('data/retrieval-llm-summary.json').then(r => r.json()),
      fetch('data/retrieval-allarma-summary.json').then(r => r.json()),
      fetch('data/retrieval-llm-tiers.json').then(r => r.json()),
      fetch('data/modifier-summary.json').then(r => r.json()),
      fetch('data/modifier-templates.json').then(r => r.json()),
      fetch('data/cross-machine-deltas.json').then(r => r.json()),
    ]);

    DASHBOARD_DATA.retrievalLlm = retrievalLlm;
    DASHBOARD_DATA.retrievalAllarma = retrievalAllarma;
    DASHBOARD_DATA.retrievalLlmTiers = retrievalLlmTiers;
    DASHBOARD_DATA.modifier = modifier;
    DASHBOARD_DATA.modifierTemplates = modifierTemplates;
    DASHBOARD_DATA.crossMachineDeltas = crossMachineDeltas;
    DASHBOARD_DATA.loaded = true;

    // Dispatch to each section initializer (defined in their respective .js files).
    if (typeof initOverview === 'function') initOverview();
    if (typeof initRetrievalSection === 'function') initRetrievalSection();
    if (typeof initModifierSection === 'function') initModifierSection();
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fee;color:#900;padding:1rem;text-align:center;">' +
      'Error loading data. Run scripts/extract_data_full.py first.</div>');
  }
}

if (typeof window !== 'undefined') window.DASHBOARD_DATA = DASHBOARD_DATA;
document.addEventListener('DOMContentLoaded', loadAllData);
