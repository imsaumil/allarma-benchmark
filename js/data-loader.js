// data-loader.js — fetch all 6 dashboard JSONs and dispatch initialization.

const DASHBOARD_DATA = {
  retrievalLlm: null,
  retrievalAllarma: null,
  retrievalLlmTiers: null,
  modifier: null,
  modifierTemplates: null,
  crossMachineDeltas: null,
  loaded: false,
};

async function loadAllData() {
  try {
    const fetches = await Promise.all([
      fetch('data/retrieval-llm-summary.json').then(r => r.json()),
      fetch('data/retrieval-allarma-summary.json').then(r => r.json()),
      fetch('data/retrieval-llm-tiers.json').then(r => r.json()),
      fetch('data/modifier-summary.json').then(r => r.json()),
      fetch('data/modifier-templates.json').then(r => r.json()),
      fetch('data/cross-machine-deltas.json').then(r => r.json()),
    ]);
    [
      DASHBOARD_DATA.retrievalLlm,
      DASHBOARD_DATA.retrievalAllarma,
      DASHBOARD_DATA.retrievalLlmTiers,
      DASHBOARD_DATA.modifier,
      DASHBOARD_DATA.modifierTemplates,
      DASHBOARD_DATA.crossMachineDeltas,
    ] = fetches;
    DASHBOARD_DATA.loaded = true;
    // Dispatch to each section initializer (defined in their respective .js files)
    if (typeof initOverviewHero === 'function') initOverviewHero();
    if (typeof initRetrievalSection === 'function') initRetrievalSection();
    if (typeof initModifierSection === 'function') initModifierSection();
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fee;color:#900;padding:1rem;text-align:center;">' +
      'Error loading data. Run scripts/extract_data_full.py first.</div>');
  }
}

document.addEventListener('DOMContentLoaded', loadAllData);
