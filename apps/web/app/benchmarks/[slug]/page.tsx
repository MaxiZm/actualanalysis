import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RankedBars, ResidualPlot, WeightFactors } from "@/components/charts";
import { EvidenceConfig, InfoTip } from "@/components/evidence-config";
import { getBenchmark, getResultsForBenchmark } from "@/lib/data";
import { formatDate, formatPercent, formatScore, titleCase } from "@/lib/format";
import { loadSiteData } from "@/lib/server/snapshot";

interface BenchmarkPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const data = await loadSiteData();
  return data.benchmarks.map((benchmark) => ({ slug: benchmark.slug }));
}

export async function generateMetadata({ params }: BenchmarkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSiteData();
  const benchmark = getBenchmark(slug, data.benchmarks);
  return benchmark
    ? { title: benchmark.name, description: `${benchmark.name} parameters, quality weights, sources, and model results.` }
    : { title: "Benchmark not found" };
}

export default async function BenchmarkPage({ params }: BenchmarkPageProps) {
  const { slug } = await params;
  const data = await loadSiteData();
  const benchmark = getBenchmark(slug, data.benchmarks);
  if (!benchmark) notFound();

  const results = getResultsForBenchmark(benchmark.slug, data.results);

  return (
    <div className="page-shell">
      <header className="page-header compact-page-header">
        <div>
          <h1>{benchmark.name}</h1>
          <div className="page-meta">
            <span className="badge">{benchmark.version}</span>
            <span className="badge">{titleCase(benchmark.holdout)} holdout</span>
            {benchmark.tags.map((tag) => <span className="badge badge-accent" key={tag}>{titleCase(tag)}</span>)}
          </div>
        </div>
        <p className="page-lede">{benchmark.description}</p>
      </header>

      <section className="score-strip" aria-label="Benchmark parameter summary">
        <div><span className="mono-label">Difficulty <InfoTip label="Difficulty">Location of the benchmark on the latent capability scale.</InfoTip></span><span className="metric-value">{formatScore(benchmark.difficulty)}</span><span className="cell-note">D parameter</span></div>
        <div><span className="mono-label">Slope <InfoTip label="Slope">Fitted discrimination parameter; larger values separate nearby capabilities more strongly.</InfoTip></span><span className="metric-value">{formatScore(benchmark.slope)}</span><span className="cell-note">α discrimination</span></div>
        <div><span className="mono-label">Final weight</span><span className="metric-value">{formatScore(benchmark.weight)}</span><span className="cell-note">Product of published factors</span></div>
        <div><span className="mono-label">Top-10 saturation</span><span className="metric-value">{formatPercent(benchmark.saturation)}</span><span className="cell-note">Share above 90%</span></div>
      </section>

      <section className="content-section" aria-labelledby="weight-heading">
        <div className="section-heading"><h2 id="weight-heading">Weight construction</h2></div>
        <div className="detail-grid">
          <WeightFactors factors={{ ...benchmark.weightFactors }}/>
          <dl className="definition-list">
            <div><dt>Items</dt><dd>{benchmark.nItems?.toLocaleString("en-US") ?? "Not reported"}</dd></div>
            <div><dt>Transform</dt><dd>{benchmark.transform}</dd></div>
            <div><dt>Tags</dt><dd>{benchmark.tags.map(titleCase).join(" · ")}</dd></div>
            <div><dt>Categories</dt><dd>{benchmark.categories.map(titleCase).join(" · ")}</dd></div>
            <div><dt>Category share</dt><dd>{Object.entries(benchmark.categoryShares ?? {}).length
              ? Object.entries(benchmark.categoryShares ?? {}).map(([category, share]) => `${titleCase(category)} ${(share * 100).toFixed(0)}%`).join(" · ")
              : "Not present in this snapshot"}</dd></div>
            <div><dt>Sources</dt><dd>{benchmark.sourceNames.join(" · ") || "No source rows in this snapshot"}</dd></div>
            <div><dt>Registry harness</dt><dd>{benchmark.harnessUrl
              ? <a className="text-link" href={benchmark.harnessUrl} rel="noreferrer">Open benchmark or harness ↗</a>
              : "Not registered"}</dd></div>
          </dl>
        </div>
      </section>

      {results.length ? <div className="chart-grid"><RankedBars title="Observed model scores" points={results.slice(0,20).map((result,index)=>({id:result.id,label:data.models.find(model=>model.slug===result.modelSlug)?.name??result.modelSlug,x:index+1,y:result.score*100}))}/><ResidualPlot title="Observed vs predicted" points={results.filter(result=>result.predicted!==null).map(result=>({id:result.id,label:data.models.find(model=>model.slug===result.modelSlug)?.name??result.modelSlug,x:result.score*100,y:(result.predicted??0)*100,outlier:Math.abs(result.residualZ??0)>2}))}/></div> : null}

      <section className="content-section" aria-labelledby="results-heading">
        <div className="section-heading"><h2 id="results-heading">Model results</h2></div>
        {results.length ? <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Model</th><th>Observed</th><th>Predicted</th><th>Residual z</th><th>Observed on</th><th>Source evidence</th><th>Provenance</th></tr></thead>
            <tbody>
              {results.map((result) => {
                const model = data.models.find((item) => item.slug === result.modelSlug);
                return (
                  <tr key={result.id}>
                    <td className="model-cell"><Link className="model-link" href={`/models/${result.modelSlug}`}>{model?.name ?? result.modelSlug}</Link></td>
                    <td data-label="Observed">
                      <span>{formatPercent(result.score, 1)}</span>
                      <span className="cell-note">Raw {result.rawScore.toLocaleString("en-US")} {result.scoreUnit}</span>
                    </td>
                    <td data-label="Predicted">{formatPercent(result.predicted, 1)}</td>
                    <td data-label="Residual z">{result.residualZ?.toFixed(2) ?? "—"}</td>
                    <td data-label="Observed on">{formatDate(result.observedOn)}</td>
                    <td data-label="Source evidence" className="evidence-source">
                      <a className="text-link" href={result.sourceUrl} rel="noreferrer">{result.sourceName}</a>
                      <span className={`badge ${result.sourceKind === "self-reported" ? "badge-accent" : ""}`}>{titleCase(result.sourceKind)}</span>
                      {result.displayOnly ? <span className="badge badge-accent">Display-only</span> : null}
                      <span className="cell-note">{result.harness ?? "Harness not reported"} · {result.nItems?.toLocaleString("en-US") ?? "item count not reported"}</span>
                      <EvidenceConfig config={result.config} />
                    </td>
                    <td data-label="Provenance">{result.used ? "Kept" : "Superseded"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div> : <div className="empty-state" role="status">
          <strong>No result rows for this benchmark.</strong>
          <span>The benchmark metadata and harness link above remain available for audit.</span>
        </div>}
      </section>
    </div>
  );
}
