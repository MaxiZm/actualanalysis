import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResidualPlot, Timeline } from "@/components/charts";
import { EvidenceConfig, InfoTip } from "@/components/evidence-config";
import { getModel, getResultsForModel, getStatisticalTieLabels, INDEX_KINDS } from "@/lib/data";
import { formatDate, formatPercent, formatPrice, formatScore, formatTokens, titleCase } from "@/lib/format";
import {
  OPENROUTER_MODELS_URL,
  resolveDisplayLimits,
} from "@/lib/openrouter-display";
import { loadOpenRouterDisplay } from "@/lib/server/openrouter-display";
import { loadDisplaySiteData, loadSiteData } from "@/lib/server/snapshot";

interface ModelPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const data = await loadSiteData();
  return data.models.map((model) => ({ slug: model.slug }));
}

export async function generateMetadata({ params }: ModelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSiteData();
  const model = getModel(slug, data.models);
  return model
    ? { title: model.name, description: `${model.name} capability indexes, benchmark residuals, pricing, speed, and history.` }
    : { title: "Model not found" };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { slug } = await params;
  const data = await loadDisplaySiteData();
  const model = getModel(slug, data.models);
  if (!model) notFound();
  const openRouter = data.status.mode === "snapshot"
    ? await loadOpenRouterDisplay(data.models.map((candidate) => ({ modelId: candidate.id, aliases: candidate.aliases })))
    : null;
  const liveEconomics = openRouter?.matches[model.id];
  const limits = resolveDisplayLimits({
    openRouter: liveEconomics ?? null,
    snapshot: { contextWindow: model.contextWindow, maxOutput: model.maxOutput },
  });
  const fallbackState = openRouter?.status === "available"
    ? "No exact declared OpenRouter alias matched; showing authorized public snapshot fallback."
    : openRouter?.status === "unavailable"
      ? "Live OpenRouter economics are unavailable; showing authorized public snapshot fallback."
      : "Synthetic fixture value.";
  const limitSourceLabel = (source: typeof limits.contextWindowSource) => {
    if (source === "openrouter") return "Live OpenRouter · display-only";
    if (source === "vendor") return "Explicit vendor registry override";
    if (source === "snapshot") return liveEconomics
      ? "Public snapshot fallback · live catalog limit unavailable"
      : fallbackState;
    return openRouter?.status === "available"
      ? "Unavailable · no exact alias or snapshot fallback"
      : "Unavailable · no live or snapshot fallback";
  };

  const results = getResultsForModel(model.slug, data.results);
  const history = data.history.filter((point) => point.modelSlug === model.slug);
  const mixed = model.indexes.mixed;
  const diagnosticSummary = INDEX_KINDS.map((kind) => {
    const index = model.indexes[kind];
    if (!index) return `${titleCase(kind)}: not scored in the latest run.`;
    const flags = index.flags.length ? index.flags.join("; ") : "no diagnostic flags";
    return `${titleCase(kind)}: ${flags}; coverage ${formatPercent(index.coverage)}.`;
  }).join(" ");

  return (
    <div className="page-shell">
      <header className="page-header compact-page-header model-titlebar">
        <div>
          <h1>{model.name}</h1>
          <div className="page-meta">
            <span className="badge">{model.organization}</span>
            <span className="badge">{model.openWeights ? "Open weights" : "Closed weights"}</span>
          </div>
        </div>
        <p className="page-lede">{model.family} · {formatDate(model.releasedOn)} · {model.reasoning} reasoning</p>
      </header>

      <section className="score-strip" aria-label="Capability index summary">
        {INDEX_KINDS.map((kind) => {
          const index = model.indexes[kind];
          const tiedWith = getStatisticalTieLabels(kind, data.models)[model.id] ?? [];
          if (!index) {
            return (
              <div key={kind}>
                <span className="mono-label">{titleCase(kind)} ACI</span>
                <span className="metric-value">—</span>
                <span className="cell-note">Not ranked · 0 of 4 coverage checks</span>
              </div>
            );
          }
          return (
            <div key={kind}>
              <span className="mono-label">{titleCase(kind)} ACI</span>
              <span className="metric-value">{formatScore(index.score)}</span>
              {index.provisional ? <span className="badge badge-accent">Not ranked · {Math.round(index.coverage * 4)} of 4</span> : null}
              {tiedWith.length ? <span
                className="badge badge-accent"
                aria-label={`Statistical tie with ${tiedWith.join(" and ")}`}
                title={`Pairwise ordering probability below 0.9 with ${tiedWith.join(" and ")}`}
              >Statistical tie</span> : null}
              <span className="cell-note">90% CI {formatScore(index.ciLow)}–{formatScore(index.ciHigh)} · rank {index.rankLow ?? "—"}–{index.rankHigh ?? "—"}</span>
            </div>
          );
        })}
        {mixed ? <div>
          <span className="mono-label">Robust mixed score</span>
          <span className="metric-value">{formatScore(mixed.robustScore)}</span>
          <span className="cell-note">Median leave-one-benchmark-out fit</span>
        </div> : null}
      </section>

      <div className="chart-grid"><ResidualPlot title="Observed vs predicted" points={results.filter(result=>result.predicted!==null).map(result=>({id:result.id,label:data.benchmarks.find(benchmark=>benchmark.slug===result.benchmarkSlug)?.name??result.benchmarkSlug,x:result.score*100,y:(result.predicted??0)*100,outlier:Math.abs(result.residualZ??0)>2}))}/><Timeline title="Index history" points={history.map((point)=>({id:`${point.kind}-${point.createdAt}`,label:titleCase(point.kind),x:Date.parse(point.createdAt),date:point.createdAt,y:point.score}))}/></div>

      <section className="content-section" aria-labelledby="evidence-heading">
        <div className="section-heading"><h2 id="evidence-heading">Benchmark evidence</h2></div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Benchmark</th><th>Observed</th><th>Predicted</th><th>SE <InfoTip label="Standard error">Reported sampling uncertainty before the logit noise floor.</InfoTip></th><th>Residual z <InfoTip label="Residual z">Residual divided by cell and leave-one-out benchmark variance.</InfoTip></th><th>Observed on</th><th>Source evidence</th></tr></thead>
            <tbody>
              {results.map((result) => {
                const benchmark = data.benchmarks.find((item) => item.slug === result.benchmarkSlug);
                return (
                  <tr key={result.id}>
                    <td className="model-cell"><Link className="model-link" href={`/benchmarks/${result.benchmarkSlug}`}>{benchmark?.name ?? result.benchmarkSlug}</Link></td>
                    <td data-label="Observed">
                      <span>{formatPercent(result.score, 1)}</span>
                      <span className="cell-note">Raw {result.rawScore.toLocaleString("en-US")} {result.scoreUnit}</span>
                    </td>
                    <td data-label="Predicted">{formatPercent(result.predicted, 1)}</td>
                    <td data-label="SE">{result.standardError === null
                      ? "—"
                      : result.scoreUnit === "fraction" || result.scoreUnit === "percent"
                        ? formatPercent(result.standardError, 1)
                        : formatScore(result.standardError)}</td>
                    <td data-label="Residual z">{result.residualZ?.toFixed(2) ?? "—"}</td>
                    <td data-label="Observed on">{formatDate(result.observedOn)}</td>
                    <td data-label="Source evidence" className="evidence-source">
                      <a className="text-link" href={result.sourceUrl} rel="noreferrer">{result.sourceName}</a>
                      <span className={`badge ${result.sourceKind === "self-reported" ? "badge-accent" : ""}`}>{titleCase(result.sourceKind)}</span>
                      {result.displayOnly ? <span className="badge badge-accent">Display-only</span> : null}
                      <span className="cell-note">{result.used ? "Kept provenance" : "Superseded provenance"} · {result.harness ?? "Harness not reported"}</span>
                      <EvidenceConfig config={result.config} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section" aria-labelledby="economics-heading">
        <div className="section-heading"><h2 id="economics-heading">Economics and runtime</h2></div>
        <div className="detail-grid">
          <div>
            <h3>Providers</h3>
            <dl className="definition-list">
              {liveEconomics ? <div>
                <dt><a className="text-link" href={OPENROUTER_MODELS_URL} rel="noreferrer">OpenRouter ↗</a></dt>
                <dd>
                  {formatPrice(liveEconomics.inputPerMillion)} input · {formatPrice(liveEconomics.outputPerMillion)} output · {liveEconomics.cacheReadPerMillion === null ? "cache read not listed" : `${formatPrice(liveEconomics.cacheReadPerMillion)} cache read`} / M
                  <span className="cell-note economics-source-note">Live catalog id {liveEconomics.openRouterId} · display-only</span>
                </dd>
              </div> : model.pricing.map((price) => (
                <div key={price.provider}>
                  <dt>{price.provider}</dt>
                  <dd>
                    {formatPrice(price.inputPerMillion)} input · {formatPrice(price.outputPerMillion)} output / M
                    <span className="cell-note economics-source-note">{fallbackState}</span>
                  </dd>
                </div>
              ))}
              {!liveEconomics && !model.pricing.length ? <div><dt>Pricing</dt><dd>{openRouter?.status === "available"
                ? "Unavailable · no exact declared alias and no public snapshot fallback"
                : openRouter?.status === "unavailable"
                  ? "Unavailable · live request failed and no public snapshot fallback"
                  : "No synthetic fixture provider record"}</dd></div> : null}
            </dl>
          </div>
          <div>
            <h3>Limits and speed</h3>
            <dl className="definition-list">
              <div><dt>Context</dt><dd>{limits.contextWindow === null ? "Unavailable" : `${formatTokens(limits.contextWindow)} tokens`}<span className="cell-note economics-source-note">{limitSourceLabel(limits.contextWindowSource)}</span></dd></div>
              <div><dt>Max output</dt><dd>{limits.maxOutput === null ? "Unavailable" : `${formatTokens(limits.maxOutput)} tokens`}<span className="cell-note economics-source-note">{limitSourceLabel(limits.maxOutputSource)}</span></dd></div>
              <div><dt>Output speed</dt><dd>{model.speed ? `${model.speed.tokensPerSecond} tok/s` : "No observation"}</dd></div>
              <div><dt>TTFT</dt><dd>{model.speed ? `${model.speed.ttftSeconds.toFixed(2)} seconds` : "No observation"}</dd></div>
              {model.speed ? <div><dt>Runtime source</dt><dd>
                {model.speed.sourceUrl
                  ? <a className="text-link" href={model.speed.sourceUrl} rel="noreferrer">{model.speed.provider}</a>
                  : model.speed.provider} · {model.speed.workload}{model.speed.observedOn ? ` · ${formatDate(model.speed.observedOn)}` : ""} · not redistributable
              </dd></div> : null}
            </dl>
          </div>
        </div>
      </section>

      <section className="content-section" aria-labelledby="history-heading">
        <div className="section-heading"><h2 id="history-heading">Index history</h2></div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Run</th><th>Index</th><th>Date</th><th>ACI</th><th>Status</th></tr></thead>
            <tbody>
              {history.map((point) => (
                <tr key={`${point.kind}-${point.runId}`}>
                  <td className="model-cell"><span className="score-main">{data.runs.find(run=>run.id===point.runId)?.methodVersion ?? "Published fit"}</span></td>
                  <td data-label="Index">{titleCase(point.kind)}</td>
                  <td data-label="Date">{formatDate(point.createdAt)}</td>
                  <td data-label="ACI">{formatScore(point.score)}</td>
                  <td data-label="Status"><span className="badge">{data.status.mode === "snapshot" ? "Published" : "Fixture only"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="callout">
        <strong>Diagnostics by index</strong>
        <span>{diagnosticSummary}</span>
      </aside>
    </div>
  );
}
