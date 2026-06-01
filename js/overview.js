// overview.js — Overview section (Phase E1).
// Machine-agnostic, NO control bar: pipeline diagram + one-sentence brief +
// a caveats callout built ONLY from the verified facts in the design spec §2
// (audit docs cross_machine_retriever_comparison.md / _modifier_comparison.md
// and paper main_ieee_v3.tex). The mean-vs-spread distinction is stated first.

function initOverview() {
  const root = document.getElementById('overview-container');
  if (!root) return;

  root.innerHTML = `
    <figure class="overview-diagram">
      <img src="assets/process_diagram.png"
           alt="aLLarMa two-stage pipeline: user question to Stage 1 template retriever (with library of predefined queries), Stage 2 template modifier, query executor over the knowledge graph database, and results."
           width="1600" height="661" loading="lazy">
      <figcaption class="fig-cap">
        <strong>Figure 1.</strong> The aLLarMa two-stage constrained GraphRAG pipeline:
        <span class="stage1">Stage 1</span> retrieves a pre-validated query template;<br>
        <span class="stage2">Stage 2</span> modifies it within marked boundaries.
      </figcaption>
    </figure>

    <details class="caveat">
      <summary>Read the numbers with these caveats</summary>
      <div class="caveat-body">
      <p>
        <strong>Read the spread, not just the mean.</strong> Retriever accuracy
        reproduces across machines at the per-model level: every per-model
        mean &Delta;accuracy sits within &plusmn;0.55&nbsp;pp. But that <u>mean</u> hides
        a handful of individual (model,&nbsp;strategy) cells whose machine-to-machine
        divergence is much larger; those outliers are listed below:
      </p>

      <ul>
        <li>
          <strong>4 retriever (model,&nbsp;strategy) cells exceed &plusmn;3&nbsp;pp</strong>,
          and none is explained by <code>max_tokens</code>:
          qwen3.5-0.8b / rrf-llm-rerank-k15-all <strong>+12.38&nbsp;pp</strong> and
          qwen3.5-2b / rrf-llm-rerank-k15-all <strong>+8.43&nbsp;pp</strong>
          (identical caps, zero truncation on both machines);
          gpt-oss-20b / llm-direct-match-all <strong>+3.46&nbsp;pp</strong>
          (SK 91.86 / DGX 95.32, both unbounded);
          nemotron-12b / llm-listwise-rerank-dense-candidate <strong>+3.16&nbsp;pp</strong>.
          This pattern is consistent with model-internal variance rather than a
          machine difference: the qwen3.5 cells (0.8B and 2B) reflect small-scale
          stochasticity, while the gpt-oss-20b and nemotron-12b cells reflect
          non-deterministic reasoning traces.
        </li>
        <li>
          <strong>Modifier: 7 of 9 models within &plusmn;1.5&nbsp;pp</strong> on all
          three scorers; the two Nemotron reasoning models diverge up to
          <strong>&plusmn;3.12&nbsp;pp</strong> on Execution Success / Answer Yield.
        </li>
        <li>
          <strong>qwen3.5-0.8b repetition loops</strong> on
          <strong>21.78%</strong> of modifier samples (223/1024) on
          <u>both</u> machines. This is a model failure at 0.8B scale, not a
          machine difference.
        </li>
        <li>
          <strong>Short / timed-out runs are surfaced, not hidden:</strong>
          DGX gpt-oss-20b / llm-direct-match-all completed
          <strong>9715 / 9789</strong> samples; DGX nemotron-9b-v2 had
          4 modifier samples time out at 600&nbsp;s.
        </li>
        <li>
          <strong>Hardware/timing confound:</strong> the DGX Spark is slower in
          aggregate wall time (<strong>retriever 3.07&times;</strong>,
          <strong>modifier 3.94&times;</strong>), reflecting its 240&nbsp;W
          edge envelope, not generalizing beyond this dataset / vLLM setup.
        </li>
      </ul>
      </div>
    </details>
  `;
}

if (typeof window !== 'undefined') window.initOverview = initOverview;
