// overview-hero.js — Render the Overview hero: abstract paragraph + pipeline figure + key stats.

function initOverviewHero() {
  const container = document.getElementById('overview-hero-container');
  if (!container) return;

  container.innerHTML = `
    <div class="overview-hero">
      <p class="overview-abstract">
        Cross-machine reproducibility evaluation of two LLM-augmented stages of the aLLarMa pipeline
        — <strong>template retrieval</strong> (Stage 1) and <strong>template modification</strong> (Stage 2) —
        across <strong>9 open-weight models</strong> served on two heterogeneous machines:
        a SKORGE workstation GPU and an NVIDIA DGX_Spark edge device.
        Mean cross-machine accuracy delta is <strong>±0.55 pp</strong> across 207 model-strategy pairs;
        4 retrieval pairs and 3 modifier cells diverge beyond the audit's callout threshold and are documented
        in the §1.3 and §2.3 anomaly cards below.
      </p>

      <figure class="pipeline-figure">
        <img src="assets/pipeline.svg" alt="aLLarMa pipeline. Stage 1 (Template retriever + Library of predefined queries, in green) and Stage 2 (Template modifier, in orange) are the two LLM-augmented stages benchmarked. The remaining components (Query verifier, Query executor, Knowledge graph DB, and result outputs) are deterministic and not evaluated here." />
        <figcaption class="pipeline-caption">
          <span class="figtag">Figure 1.</span>
          The aLLarMa system pipeline. <span class="stage-1">Stage 1</span> (template retrieval) and
          <span class="stage-2">Stage 2</span> (template modification) are the two LLM-augmented stages
          benchmarked in this dashboard. Downstream verification, execution, and rendering are
          deterministic and out of scope.
        </figcaption>
      </figure>

      <div class="stat-strip" role="group" aria-label="Headline statistics">
        <div class="stat-cell">
          <div class="stat-label">Audited evaluations</div>
          <div class="stat-value">548<span class="stat-unit">.eval files</span></div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Coverage</div>
          <div class="stat-value">9 × 2<span class="stat-unit">models · machines</span></div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Mean cross-machine Δ</div>
          <div class="stat-value">±0.55<span class="stat-unit">pp</span></div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Documented anomalies</div>
          <div class="stat-value">7<span class="stat-unit">4 retrieval · 3 modifier</span></div>
        </div>
      </div>
    </div>
  `;
}
