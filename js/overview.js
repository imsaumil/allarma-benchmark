// overview.js — Overview section (Phase E1).
// Machine-agnostic, NO control bar: pipeline diagram + one-sentence brief +
// a caveats callout built ONLY from the verified facts in the design spec §2
// (audit docs cross_machine_retriever_comparison.md / _modifier_comparison.md
// and paper main_ieee_v3.tex). The mean-vs-spread distinction is stated first.

function initOverview() {
  const root = document.getElementById('overview-container');
  if (!root) return;

  const RETR_DOC = 'docs/cross_machine_retriever_comparison.md';
  const MOD_DOC = 'docs/cross_machine_modifier_comparison.md';

  root.innerHTML = `
    <figure class="overview-diagram">
      <img src="assets/process_diagram.png"
           alt="aLLarMa two-stage pipeline: user question to Stage 1 template retriever (with library of predefined queries), Stage 2 template modifier, query executor over the knowledge graph database, and results."
           width="1600" height="661" loading="lazy">
    </figure>

    <p class="section-desc">
      aLLarMa is a two-stage constrained GraphRAG framework: Stage 1 retrieves a
      pre-validated query template, Stage 2 modifies it within marked boundaries.
      This dashboard benchmarks both stages across 9 open-weight LLMs on two
      machines (a consumer workstation with an RTX 4090 and an NVIDIA DGX Spark
      edge appliance).
    </p>

    <p class="section-desc" style="font-weight:600;color:#1C1C1C">
      548 audited production eval logs &middot; 9 LLMs (0.8B&ndash;20B) &middot; 2 machines.
    </p>

    <div class="caveat">
      <h3 style="margin:0 0 .5rem;color:#6b541d;font-size:1rem">Read the numbers with these caveats</h3>

      <p style="margin:0 0 .7rem">
        <strong>Read the spread, not just the mean.</strong> Per-model retriever
        <em>means</em> are reproducible across machines (every per-model mean
        &Delta;accuracy within &plusmn;0.55&nbsp;pp), but a few individual
        (model,&nbsp;strategy) cells diverge far more than the mean suggests.
        The points below list what the averages hide.
      </p>

      <ul style="margin:0;padding-left:1.2rem;line-height:1.5">
        <li>
          <strong>4 retriever (model,&nbsp;strategy) cells exceed &plusmn;3&nbsp;pp</strong>,
          and none is explained by <code>max_tokens</code>:
          qwen3.5-0.8b / rrf-llm-rerank-k15-all <strong>+12.38&nbsp;pp</strong> and
          qwen3.5-2b / rrf-llm-rerank-k15-all <strong>+8.43&nbsp;pp</strong>
          (identical caps, zero truncation on both machines);
          gpt-oss-20b / llm-direct-match-all <strong>+3.46&nbsp;pp</strong>
          (SK 91.86 / DGX 95.32, both unbounded);
          nemotron-12b / llm-listwise-rerank-dense-candidate <strong>+3.16&nbsp;pp</strong>.
          <a href="${RETR_DOC}">Retriever audit &rarr;</a>
        </li>
        <li>
          <strong>Modifier: 7 of 9 models within &plusmn;1.5&nbsp;pp</strong> on all
          three scorers; the two Nemotron reasoning models diverge up to
          <strong>&plusmn;3.12&nbsp;pp</strong> on Execution Success / Answer Yield.
          <a href="${MOD_DOC}">Modifier audit &rarr;</a>
        </li>
        <li>
          <strong>qwen3.5-0.8b repetition loops</strong> on
          <strong>21.78%</strong> of modifier samples (223/1024) on
          <em>both</em> machines &mdash; a model failure at 0.8B scale, not a
          machine difference.
        </li>
        <li>
          <strong>Short / timed-out runs are surfaced, not hidden:</strong>
          DGX gpt-oss-20b / llm-direct-match-all completed
          <strong>9715 / 9789</strong> samples; DGX nemotron-9b-v2 had
          4 modifier samples time out at 600&nbsp;s (scored with a fallback answer).
        </li>
        <li>
          <strong>Hardware/timing confound:</strong> the DGX Spark is slower in
          aggregate wall time &mdash; <strong>retriever 3.07&times;</strong>,
          <strong>modifier 3.94&times;</strong> &mdash; reflecting its 240&nbsp;W
          edge envelope, not generalizing beyond this dataset / vLLM setup.
        </li>
        <li>
          llama-3.1-8b ran on the DGX only and is excluded from cross-machine comparisons.
        </li>
      </ul>

      <p style="margin:.7rem 0 0;font-size:.8rem;color:#6b541d">
        Authoritative full lists:
        <a href="${RETR_DOC}">retriever comparison</a> &middot;
        <a href="${MOD_DOC}">modifier comparison</a>.
      </p>
    </div>
  `;
}

if (typeof window !== 'undefined') window.initOverview = initOverview;
