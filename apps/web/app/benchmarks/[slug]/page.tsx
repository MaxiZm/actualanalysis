import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Disclosure } from "@/components/ui/disclosure";
import { uniqueUsedResultPairs } from "@/lib/result-pairs";
import { OrganizationLogo } from "@/components/organization-logo";
import { RankedBars, ResidualPlot } from "@/components/charts";
import { EvidenceConfig, InfoTip } from "@/components/evidence-config";
import { getBenchmark, getResultsForBenchmark } from "@/lib/data";
import {
  comparisonValue,
  comparisonUnit,
  formatDate,
  formatLogit,
  formatNative,
  formatPercent,
  formatScore,
  titleCase,
} from "@/lib/format";
import { loadDisplaySiteData, loadSiteData } from "@/lib/server/snapshot";

interface BenchmarkPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const data = await loadSiteData();
  return data.benchmarks.map((benchmark) => ({ slug: benchmark.slug }));
}

export async function generateMetadata({
  params,
}: BenchmarkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSiteData();
  const benchmark = getBenchmark(slug, data.benchmarks);
  return benchmark
    ? {
        title: benchmark.name,
        description: `${benchmark.name} fitted parameters, sources, and model results.`,
      }
    : { title: "Benchmark not found" };
}

export default async function BenchmarkPage({ params }: BenchmarkPageProps) {
  const { slug } = await params;
  const data = await loadDisplaySiteData();
  const benchmark = getBenchmark(slug, data.benchmarks);
  if (!benchmark) notFound();

  const results = getResultsForBenchmark(benchmark.slug, data.results);
  const kept = uniqueUsedResultPairs(results);
  const extraRows = results.length - kept.length;
  const fitted = benchmark.difficulty !== null && benchmark.slope !== null;
  const axisUnit = comparisonUnit(kept[0]?.scoreUnit ?? "raw");
  const axisSuffix =
    axisUnit === "percent"
      ? " · %"
      : axisUnit === "hours"
        ? " · hours"
        : axisUnit === "elo"
          ? " · Elo"
          : axisUnit === "currency"
            ? " · USD"
            : "";
  const rankedPoints = kept
    .filter((result) => Number.isFinite(result.score))
    .map((result, index) => ({
      id: result.id,
      label:
        data.models.find((model) => model.slug === result.modelSlug)?.name ??
        result.modelSlug,
      x: index + 1,
      y: comparisonValue(result.rawScore, result.scoreUnit),
      group:
        data.models.find((model) => model.slug === result.modelSlug)
          ?.organization ?? "unknown",
      striped: result.sourceKind === "self-reported",
    }));

  return (
    <div className="page-shell">
      <header className="page-header compact-page-header">
        <div>
          <h1>{benchmark.name}</h1>
          <div className="page-meta">
            <span className="badge">{benchmark.version}</span>
            <span className="badge">
              {titleCase(benchmark.holdout)} holdout
            </span>
            {benchmark.tags.map((tag) => (
              <span className="badge badge-accent" key={tag}>
                {titleCase(tag)}
              </span>
            ))}
            {fitted ? null : (
              <span
                className="badge badge-accent"
                title="No benchmark parameters were published for this benchmark in the newest run"
              >
                Not fitted in the newest run
              </span>
            )}
          </div>
        </div>
        <p className="page-lede">{benchmark.description}</p>
      </header>

      <p className="benchmark-fit-note">
        {fitted
          ? "The model estimates a shared capability trend. Individual benchmark results can depart from that trend; agreement is diagnostic, not enforced."
          : benchmark.slug === "critpt"
            ? "Research-level physics: mean pass@1 over five repeats of 70 challenges, without code or web tools. Artificial Analysis results are attributed display data and do not enter this index. Repeated questions are not additional independent tasks."
            : benchmark.slug === "arc-agi-3"
              ? "ARC-AGI-3 reports Relative Human Action Efficiency, a continuous score. Its observed results are retained, but it is excluded from the index until an appropriate uncertainty model is available."
              : benchmark.slug === "terminal-bench-science-0.1"
                ? "Science workflows evaluated with native agents, 70 tasks and three trials per task. These results remain separate from common-harness capability scores."
                : benchmark.slug === "benchcad"
                  ? "With-tools voxel IoU on a vendor-reported 1,000-file subset. These values are not the full 17,900-part benchmark and do not enter the index."
                  : benchmark.slug === "healthbench-professional"
                    ? "Length-adjusted rubric scores on 525 clinician tasks. These are not binary accuracy; source uncertainty and grader pins are needed before fitting."
                    : "Source results are available for inspection. This condition has no parameters in the latest fit."}
      </p>
      <section className="score-strip" aria-label="Benchmark summary">
        <div>
          <span className="mono-label">Models evaluated</span>
          <span className="metric-value">{kept.length}</span>
          <span className="cell-note">unique model results</span>
        </div>
        <div>
          <span className="mono-label">Tasks</span>
          <span className="metric-value">
            {benchmark.nItems?.toLocaleString("en-US") ?? "Not reported"}
          </span>
          <span className="cell-note">{benchmark.version}</span>
        </div>
        <div>
          <span className="mono-label">Evidence</span>
          <span className="metric-value">
            {fitted ? "In fit" : "Observed only"}
          </span>
          <span className="cell-note">
            {titleCase(benchmark.status ?? "registered")}
          </span>
        </div>
        <div>
          <span className="mono-label">Source</span>
          <a
            className="text-link"
            href={benchmark.harnessUrl ?? "#results-heading"}
          >
            Official benchmark ↗
          </a>
          <span className="cell-note">{benchmark.sourceNames.join(" · ")}</span>
        </div>
      </section>
      <Disclosure title="How this benchmark is modelled">
        <section
          className="score-strip"
          aria-label="Benchmark parameter summary"
        >
          <div>
            <span className="mono-label">
              Difficulty{" "}
              <InfoTip label="Difficulty">
                The location at which the benchmark predictor reaches zero,
                measured in panel standard deviations along its weighted
                capability direction. This is −β/α after calibration, not the
                raw intercept.
              </InfoTip>
            </span>
            <span className="metric-value">
              {formatScore(benchmark.difficulty)}
            </span>
            <span className="cell-note">Panel sd · median</span>
          </div>
          <div>
            <span className="mono-label">
              Discrimination{" "}
              <InfoTip label="Discrimination">
                Change in the benchmark predictor per panel standard deviation
                along its weighted capability direction. Higher values indicate
                stronger discrimination.
              </InfoTip>
            </span>
            <span className="metric-value">{formatScore(benchmark.slope)}</span>
            <span className="cell-note">Slope per panel sd</span>
          </div>
          <div>
            <span className="mono-label">
              Cell-misfit sd{" "}
              <InfoTip label="Cell-misfit sd">
                Standard deviation of the per-cell misfit term for this
                benchmark; residual z values divide by it.
              </InfoTip>
            </span>
            <span className="metric-value">
              {benchmark.misfitSd === null
                ? "—"
                : benchmark.misfitSd.toFixed(2)}
            </span>
            <span className="cell-note">σ_b on the logit scale</span>
          </div>
          <div>
            <span className="mono-label">Fitted cells</span>
            <span className="metric-value">
              {
                new Set(
                  kept
                    .filter((result) => result.residualZ !== null)
                    .map((result) => result.modelSlug),
                ).size
              }
            </span>
            <span className="cell-note">systems with a used cell</span>
          </div>
        </section>

        <section
          className="content-section"
          aria-labelledby="parameters-heading"
        >
          <div className="section-heading">
            <h2 id="parameters-heading">Benchmark parameters</h2>
            <p>
              Parameters come from the newest published run. Active conditions
              are fitted jointly using their declared domain loadings. Slopes
              are diagnostic parameters, not leaderboard weights.
            </p>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Items</dt>
              <dd>
                {benchmark.nItems?.toLocaleString("en-US") ?? "Not reported"}
              </dd>
            </div>
            <div>
              <dt>Transform</dt>
              <dd>{benchmark.transform}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{benchmark.tags.map(titleCase).join(" · ") || "None"}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{benchmark.categories.map(titleCase).join(" · ")}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>
                {benchmark.sourceNames.join(" · ") ||
                  "No source rows in this snapshot"}
              </dd>
            </div>
            <div>
              <dt>Registry harness</dt>
              <dd>
                {benchmark.harnessUrl ? (
                  <a
                    className="text-link"
                    href={benchmark.harnessUrl}
                    rel="noreferrer"
                  >
                    Open benchmark or harness ↗
                  </a>
                ) : (
                  "Not registered"
                )}
              </dd>
            </div>
          </dl>
        </section>
      </Disclosure>
      {kept.length ? (
        <div className={fitted ? "chart-grid" : "single-chart"}>
          <RankedBars
            title={`Observed model scores${axisSuffix}`}
            points={rankedPoints}
          />
          {fitted ? (
            <ResidualPlot
              title={`Observed vs expected${axisSuffix}`}
              points={kept
                .filter((result) => result.predictedNative !== null)
                .map((result) => ({
                  id: result.id,
                  label:
                    data.models.find((model) => model.slug === result.modelSlug)
                      ?.name ?? result.modelSlug,
                  x: comparisonValue(result.rawScore, result.scoreUnit),
                  y: comparisonValue(
                    result.predictedNative ?? 0,
                    result.scoreUnit,
                  ),
                  group:
                    data.models.find((model) => model.slug === result.modelSlug)
                      ?.organization ?? "Unknown",
                  outlier: Math.abs(result.residualZ ?? 0) > 2,
                }))}
            />
          ) : null}
        </div>
      ) : null}

      <section className="content-section" aria-labelledby="results-heading">
        <div className="section-heading">
          <h2 id="results-heading">Model results</h2>
          <p>
            One current result per model, in the source’s original unit.
            Expected values exclude cell misfit and source-specific offsets.
          </p>
        </div>
        {results.length ? (
          <div className="data-table-wrap">
            <table className="data-table benchmark-results-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Observed</th>
                  {fitted ? (
                    <>
                      <th>Expected</th>
                      <th>Residual z</th>
                    </>
                  ) : null}
                  <th>Observed on</th>
                  <th>Source evidence</th>
                </tr>
              </thead>
              <tbody>
                {kept.map((result) => {
                  const model = data.models.find(
                    (item) => item.slug === result.modelSlug,
                  );
                  return (
                    <tr
                      key={result.id}
                      className={result.used ? "" : "is-superseded"}
                    >
                      <td className="model-cell">
                        <span className="model-name-row">
                          <OrganizationLogo
                            organization={model?.organization ?? "Unknown"}
                          />
                          <Link
                            className="model-link"
                            href={`/models/${result.modelSlug}`}
                          >
                            {model?.name ?? result.modelSlug}
                          </Link>
                        </span>
                      </td>
                      <td data-label="Observed">
                        <span>
                          {formatNative(result.rawScore, result.scoreUnit)}
                        </span>
                        <span className="cell-note">
                          {result.standardError !== null
                            ? `SE ${result.scoreUnit === "fraction" || result.scoreUnit === "percent" ? formatPercent(result.standardError, 1) : result.standardError.toFixed(2)}`
                            : "SE not reported"}
                        </span>
                      </td>
                      {fitted ? (
                        <>
                          <td data-label="Expected">
                            {result.predictedNative !== null
                              ? formatNative(
                                  result.predictedNative,
                                  result.scoreUnit,
                                )
                              : result.predictedLogit !== null
                                ? `logit ${formatLogit(result.predictedLogit)}`
                                : "—"}
                          </td>
                          <td data-label="Residual z">
                            {result.residualZ?.toFixed(2) ?? "—"}
                          </td>
                        </>
                      ) : null}
                      <td data-label="Observed on">
                        {formatDate(result.observedOn)}
                      </td>
                      <td
                        data-label="Source evidence"
                        className="evidence-source"
                      >
                        <a
                          className="text-link"
                          href={result.sourceUrl}
                          rel="noreferrer"
                        >
                          {result.sourceName}
                        </a>
                        <span
                          className={`badge ${result.sourceKind === "self-reported" ? "badge-accent" : ""}`}
                        >
                          {result.sourceKind === "self-reported"
                            ? "Self-report"
                            : titleCase(result.sourceKind)}
                        </span>
                        {result.displayOnly ? (
                          <span className="badge badge-accent">
                            Display-only · not redistributable
                          </span>
                        ) : null}
                        <span className="cell-note">
                          {result.harness ?? "Harness not reported"} ·{" "}
                          {result.nItems?.toLocaleString("en-US") ??
                            "item count not reported"}
                        </span>
                        <EvidenceConfig config={result.config} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" role="status">
            <strong>No result rows for this benchmark.</strong>
            <span>
              The benchmark metadata and harness link above remain available for
              audit.
            </span>
          </div>
        )}
      </section>
      {extraRows > 0 ? (
        <p className="source-line">
          {extraRows} additional historical or configuration rows are retained
          in the downloadable snapshot.
        </p>
      ) : null}
    </div>
  );
}
