// strategy-info-modal.js — per-family info buttons next to each sub-family
// heading (Non-LLM baselines / LLM-augmented / Pure-LLM) inside the Retrieval
// section. Each button opens a modal scoped to that one family with strategy
// definitions sourced from data/strategy-descriptions.json.
//
// Event delegation is used because the buttons are rendered dynamically by
// js/retrieval-section.js after DASHBOARD_DATA loads (not in static HTML).

(function () {
  'use strict';

  // Map retrieval-section.js's family keys (base/aug/pure) to the JSON's
  // family ids (non-llm / llm-augmented / pure-llm). The data-family attribute
  // on the trigger button may use either form; we resolve both.
  const FAM_KEY_TO_JSON = {
    base: 'non-llm',
    aug: 'llm-augmented',
    pure: 'pure-llm',
    'non-llm': 'non-llm',
    'llm-augmented': 'llm-augmented',
    'pure-llm': 'pure-llm',
  };

  const FAMILY_META = {
    'non-llm': {
      title: 'Non-LLM Baselines',
      blurb:
        'Retrieve and rank without any LLM call — pure vector, lexical, or rank-fusion approaches.',
    },
    'llm-augmented': {
      title: 'LLM-Augmented',
      blurb:
        'A retriever (BM25, dense, sparse, hybrid, RRF) produces candidates, and an LLM then reranks them, filters them, or is selectively invoked based on retriever confidence.',
    },
    'pure-llm': {
      title: 'Pure-LLM',
      blurb:
        'No retriever at all — the LLM is shown all candidate templates in one prompt and picks the best match directly.',
    },
  };

  let descriptions = null;
  let modal = null;
  let scrim = null;
  let isOpen = false;
  let lastFocus = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  async function loadDescriptions() {
    if (descriptions) return descriptions;
    const res = await fetch('data/strategy-descriptions.json');
    if (!res.ok) throw new Error('Failed to load strategy-descriptions.json: ' + res.status);
    descriptions = await res.json();
    return descriptions;
  }

  function buildModalDOM() {
    scrim = document.createElement('div');
    scrim.id = 'sim-scrim';
    scrim.addEventListener('click', close);

    modal = document.createElement('div');
    modal.id = 'sim-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sim-title');
    modal.setAttribute('hidden', '');
    modal.innerHTML = [
      '<div class="sim-dh">',
      '  <h3 id="sim-title"></h3>',
      '  <button class="sim-x" type="button" aria-label="Close">×</button>',
      '</div>',
      '<div class="sim-db"></div>',
    ].join('\n');

    document.body.appendChild(scrim);
    document.body.appendChild(modal);

    modal.querySelector('.sim-x').addEventListener('click', close);
  }

  function renderForFamily(jsonFamily) {
    const meta = FAMILY_META[jsonFamily];
    const entries = descriptions.filter(function (d) { return d.family === jsonFamily; });
    modal.querySelector('#sim-title').textContent =
      meta.title + ' — Strategy Reference (' + entries.length + ')';
    const items = entries.map(function (d) {
      return (
        '<dt><code>' + escapeHtml(d.name) + '</code></dt>' +
        '<dd>' + escapeHtml(d.description) + '</dd>'
      );
    }).join('\n');
    modal.querySelector('.sim-db').innerHTML = [
      '<p class="sim-family-blurb">' + escapeHtml(meta.blurb) + '</p>',
      '<dl>' + items + '</dl>',
    ].join('\n');
  }

  function onKey(e) {
    if (e.key === 'Escape' && isOpen) close();
  }

  async function open(triggerEl, jsonFamily) {
    if (!FAMILY_META[jsonFamily]) {
      console.warn('strategy-info-modal: unknown family', jsonFamily);
      return;
    }
    lastFocus = triggerEl || document.activeElement;
    try {
      await loadDescriptions();
      renderForFamily(jsonFamily);
    } catch (err) {
      console.error('strategy-info-modal:', err);
      modal.querySelector('#sim-title').textContent = 'Strategy Reference';
      modal.querySelector('.sim-db').innerHTML =
        '<p style="color:#900;">Failed to load strategy descriptions. Please refresh the page.</p>';
    }
    modal.removeAttribute('hidden');
    scrim.classList.add('on');
    modal.classList.add('open');
    document.body.classList.add('sim-locked');
    isOpen = true;
    // Focus the close button so Esc/Enter both work intuitively from keyboard.
    const x = modal.querySelector('.sim-x');
    if (x) x.focus();
    document.addEventListener('keydown', onKey);
  }

  function close() {
    if (!isOpen) return;
    modal.setAttribute('hidden', '');
    scrim.classList.remove('on');
    modal.classList.remove('open');
    document.body.classList.remove('sim-locked');
    isOpen = false;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function init() {
    buildModalDOM();
    // Event delegation — handles buttons rendered dynamically by retrieval-section.js
    // after DASHBOARD_DATA loads (no need to re-bind after each re-render).
    document.addEventListener('click', function (e) {
      const btn = e.target.closest && e.target.closest('.info-btn[data-family]');
      if (!btn) return;
      const raw = btn.getAttribute('data-family');
      const jsonFamily = FAM_KEY_TO_JSON[raw];
      if (!jsonFamily) {
        console.warn('strategy-info-modal: unrecognised data-family', raw);
        return;
      }
      e.preventDefault();
      open(btn, jsonFamily);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
