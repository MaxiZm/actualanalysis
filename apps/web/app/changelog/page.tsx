import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Versioned changes to the ActualAnalysis method, benchmark suite, and data pipeline.",
};

const changes = [
  {
    version: "1.2.2",
    date: "2026-09-04",
    status: "Current method",
    items: [
      "Replaced pinned reference benchmark with fully unpinned condition intercepts and discriminations identified on the calibration panel.",
      "Correlated latent capability traits using LKJ(2) across all five capability domains.",
      "Implemented single-system rule for models with fixed effort, carrying both class labels with delta_m = 0.",
      "Enforced per-domain coverage rule on calibration panel with metadata unblock table.",
      "Published three distinct score scales with explicit units: ACI-G, ACI-Domain, and ACI-Basket utility percentage.",
      "Added analytic Gaussian concentration gate and PSIS-LOO PIT residuals diagnostics suite.",
      "Added practical margin delta = 1.0 in pairwise comparisons with unresolved state.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-09-04",
    status: "Superseded",
    items: [
      "Inherit provenance, effort, harness, tools, and benchmark/grader versions from dated source protocols before profile assignment.",
      "Flag inferred or missing protocol metadata and inflate its run noise instead of introducing non-normative rejection reasons.",
      "Choose and record the calibration reference by independent, version-matched panel coverage.",
      "Keep publication fail-closed until the coverage-selected reference and frozen panel pass their gates.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-04",
    status: "Superseded",
    items: [
      "Replace three weighted robust fits with one five-domain Bayesian model over declared std and max systems.",
      "Use likelihoods matched to counts, judge scores, Elo, time horizons, and repeated money runs.",
      "Replace anchors and bootstrap intervals with a draw-wise frozen-panel scale and NUTS posterior uncertainty.",
      "Gate publication as Verified, Ranked, or Provisional using interval width, domain breadth, safe cells, and family information concentration.",
      "Fail closed until registry profile metadata covers the frozen calibration panel.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-04",
    status: "Superseded",
    items: [
      "Floor logit noise and estimate cross-harness variance with a conservative prior.",
      "Balance benchmark categories, cap any benchmark at 15%, and remove discrimination double-weighting.",
      "Keep provisional fitted ranges visible while withholding scores, ranks, and pairwise comparisons.",
      "Anchor all indexes at GPT-4.1 = 40 and Claude Opus 5 = 100 after coverage and separation guards.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-04",
    status: "Production method",
    items: [
      "Fit the robust two-parameter latent model on source-selected, uncertainty-eligible results.",
      "Publish 500-valid-replicate hierarchical-bootstrap confidence intervals and rank probabilities.",
      "Use Gemini 2.5 Pro = 100 and Claude Opus 5 = 110 as the cross-index presentation anchors.",
      "Publish exact-run, atomic snapshots with source-level reuse policy and display-only evidence labels.",
    ],
  },
  {
    version: "0.1.0-demo",
    date: "2026-09-04",
    status: "Interface fixture",
    items: [
      "Added separate Mixed, Agentic, and Chat leaderboard views.",
      "Added model, benchmark, chart, methodology, download, and public API surfaces.",
      "Marked every bundled number as synthetic fixture data; no published snapshot is implied.",
    ],
  },
] as const;

export default function ChangelogPage() {
  return (
    <div className="page-shell">
      <header className="page-header compact-page-header"><div><h1>Changelog</h1></div></header>

      <section className="change-list" aria-label="Method changelog">
        {changes.map((change) => (
          <article className="change-entry" key={change.version}>
            <div>
              <h2>{change.version}</h2>
              <time>{change.date}</time>
              <p><span className="badge">{change.status}</span></p>
            </div>
            <ul>{change.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </section>
    </div>
  );
}
