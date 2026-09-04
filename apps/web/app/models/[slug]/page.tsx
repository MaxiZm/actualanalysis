import { CostPerTaskValue } from "@/components/cost-per-task-value";
import { VENDOR_DISPLAY } from "@/lib/display-economics";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResidualPlot } from "@/components/charts";
import { ScoreValue } from "@/components/score-value";
import { Disclosure } from "@/components/ui/disclosure";
import { BasketTable, DomainPanel } from "@/components/domain-panel";
import { EvidenceConfig, InfoTip } from "@/components/evidence-config";
import { TierBadge, tierLabel } from "@/components/tier-badge";
import {
  getModel,
  getResultsForModel,
  getStatisticalTieLabels,
  INDEX_KINDS,
  type EvidenceSummary,
  type ResultRecord,
} from "@/lib/data";
import {
  formatDate,
  formatLogit,
  formatNative,
  formatPercent,
  formatPrice,
  formatScore,
  formatTokens,
  titleCase,
} from "@/lib/format";
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

export async function generateMetadata({
  params,
}: ModelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSiteData();
  const model = getModel(slug, data.models);
  return model
    ? {
        title: model.name,
        description: `${model.name} capability indexes, domain scores, benchmark evidence, pricing, and history.`,
      }
    : { title: "Model not found" };
}

const NOT_COMPUTED = "not computed";

function evidenceNumber(value: number | null, digits = 2): string {
  return value === null
    ? NOT_COMPUTED
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(digits);
}

function EvidencePanel({
  evidence,
  tier,
}: {
  evidence: EvidenceSummary | null;
  tier: string;
}) {
  const rows: Array<[string, string, string]> = evidence
    ? [
        [
          "Fitted cells",
          evidenceNumber(evidence.fittedCells),
          "Own-profile benchmark cells used in the fit.",
        ],
        [
          "Domains covered",
          evidenceNumber(evidence.domains),
          "Domains with at least one fitted cell.",
        ],
        [
          "Safe independent cells",
          evidenceNumber(evidence.safeIndependentCells),
          "Cells from independent sources on contamination-safe benchmarks.",
        ],
        [
          "Max family share",
          evidence.maxFamilyShare === null
            ? NOT_COMPUTED
            : formatPercent(evidence.maxFamilyShare, 0),
          "Largest share of information from one benchmark family.",
        ],
        [
          "Own-data reduction R",
          evidenceNumber(evidence.ownDataReduction),
          "Proxy based on posterior variance against a reference variance of 100; not an own-data ablation.",
        ],
        [
          "Concentration c",
          evidenceNumber(evidence.concentration),
          "Analytic precision drop when the most influential family is removed.",
        ],
        [
          "Exposure gap",
          evidence.exposureGap === null
            ? NOT_COMPUTED
            : formatScore(evidence.exposureGap),
          "Mean residual on exposed minus safe benchmarks.",
        ],
        [
          "LOO max delta",
          evidence.looMaxDelta === null
            ? NOT_COMPUTED
            : formatScore(evidence.looMaxDelta),
          "Largest leave-one-benchmark-out shift; not computed in 1.3.0.",
        ],
        [
          "Adversarial shift",
          evidence.adversarialShift === null
            ? NOT_COMPUTED
            : formatScore(evidence.adversarialShift),
          "Shift under non-negative self-report bias; not computed in 1.3.0.",
        ],
      ]
    : [];
  return (
    <section className="evidence-panel" aria-labelledby="evidence-tier-heading">
      <div className="section-heading">
        <h2 id="evidence-tier-heading">
          Evidence tier{" "}
          <InfoTip label="Evidence tier">
            Verified and Ranked publish a score, rank and pairwise comparisons;
            Preliminary estimates carry an asterisk and no published rank. Gates
            are listed in methodology.
          </InfoTip>
        </h2>
        <p>
          Publication tier: <strong>{tier}</strong>. The numbers below are the
          gate inputs behind that decision.
        </p>
      </div>
      {rows.length ? (
        <dl className="evidence-grid">
          {rows.map(([label, value, help]) => (
            <div key={label} title={help}>
              <dt>{label}</dt>
              <dd className={value === NOT_COMPUTED ? "is-muted" : ""}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="cell-note">
          No evidence summary published for this system.
        </p>
      )}
    </section>
  );
}

function ZChip({ value }: { value: number | null }) {
  if (value === null) return <span className="cell-note">not fitted</span>;
  const magnitude = Math.abs(value);
  const severity =
    magnitude >= 3 ? "is-outlier" : magnitude >= 2 ? "is-warn" : "";
  return (
    <span
      className={`z-chip ${severity}`}
      title={`Misfit divided by the benchmark misfit sd: ${value.toFixed(2)}`}
    >
      z {value >= 0 ? "+" : "−"}
      {magnitude.toFixed(2)}
    </span>
  );
}

function resultOrder(left: ResultRecord, right: ResultRecord): number {
  return (
    left.benchmarkSlug.localeCompare(right.benchmarkSlug) ||
    Number(right.used) - Number(left.used) ||
    right.observedOn.localeCompare(left.observedOn)
  );
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { slug } = await params;
  const data = await loadDisplaySiteData();
  const model = getModel(slug, data.models);
  if (!model) notFound();
  const openRouter =
    data.status.mode === "snapshot"
      ? await loadOpenRouterDisplay(
          data.models.map((candidate) => ({
            modelId: candidate.id,
            aliases: candidate.aliases,
          })),
        )
      : null;
  const liveEconomics = openRouter?.matches[model.id];
  const vendorEconomics = VENDOR_DISPLAY[model.id];
  const limits = resolveDisplayLimits({
    vendorOverride: VENDOR_DISPLAY[model.id] ?? null,
    openRouter: liveEconomics ?? null,
    snapshot: {
      contextWindow: model.contextWindow,
      maxOutput: model.maxOutput,
    },
  });
  const fallbackState =
    openRouter?.status === "available"
      ? "No exact declared OpenRouter alias matched; showing authorized public snapshot fallback."
      : openRouter?.status === "unavailable"
        ? "Live OpenRouter economics are unavailable; showing authorized public snapshot fallback."
        : "Synthetic fixture value.";
  const limitSourceLabel = (source: typeof limits.contextWindowSource) => {
    if (source === "openrouter") return "Live OpenRouter · display-only";
    if (source === "vendor") return "Explicit vendor registry override";
    if (source === "snapshot")
      return liveEconomics
        ? "Public snapshot fallback · live catalog limit unavailable"
        : fallbackState;
    return openRouter?.status === "available"
      ? "Unavailable · no exact alias or snapshot fallback"
      : "Unavailable · no live or snapshot fallback";
  };

  const results = [...getResultsForModel(model.slug, data.results)].sort(
    resultOrder,
  );
  const history = data.history.filter(
    (point) => point.modelSlug === model.slug,
  );
  const mixed = model.indexes.mixed;
  const system = model.system;
  const tier = mixed?.tier ?? system?.tier ?? null;
  const evidence = system?.evidence ?? null;
  const fittedBenchmarks = new Set(
    results
      .filter((result) => result.residualZ !== null)
      .map((result) => result.benchmarkSlug),
  ).size;
  const diagnosticSummary = INDEX_KINDS.map((kind) => {
    const index = model.indexes[kind];
    if (!index) return `${titleCase(kind)}: not scored in the latest run.`;
    const flags = index.flags.length
      ? index.flags.join("; ")
      : "no diagnostic flags";
    const coverage =
      index.coverageCount !== null && index.coverageTotal !== null
        ? `${index.coverageCount}/${index.coverageTotal} benchmarks`
        : formatPercent(index.coverage);
    return `${titleCase(kind)}: ${tierLabel(index.tier).toLowerCase()}; ${flags}; coverage ${coverage}.`;
  }).join(" ");

  return (
    <div className="page-shell">
      <header className="page-header compact-page-header model-titlebar">
        <div>
          <h1>{model.name}</h1>
          <div className="page-meta">
            <TierBadge tier={tier} />
            <span className="badge">{model.organization}</span>
            <span className="badge">
              {model.openWeights ? "Open weights" : "Closed weights"}
            </span>
            {system ? (
              <span
                className="badge system-badge"
                title="Scored system: model at the runtime profile used for all published indexes"
              >
                <code>{system.id}</code>
              </span>
            ) : null}
            {system ? (
              <span className="badge">{system.profile} profile</span>
            ) : null}
          </div>
        </div>
        <p className="page-lede">
          {model.family} · {formatDate(model.releasedOn)} · {model.reasoning}{" "}
          reasoning
        </p>
      </header>

      <section
        className="score-strip model-index-summary"
        aria-label="Capability index summary"
      >
        {INDEX_KINDS.map((kind) => {
          const index = model.indexes[kind];
          const tiedWith =
            getStatisticalTieLabels(kind, data.models)[model.id] ?? [];
          if (!index) {
            return (
              <div key={kind}>
                <span className="mono-label">{titleCase(kind)} ACI</span>
                <span className="metric-value">—</span>
                <span className="cell-note">Not scored in the latest run</span>
              </div>
            );
          }
          return (
            <div key={kind}>
              <span className="mono-label">
                {titleCase(kind)} ACI{kind === "mixed" ? "-G" : ""}
              </span>
              <span className="metric-value">
                <ScoreValue index={index} uncertainty />
              </span>
              {index.provisional ? (
                <span className="badge badge-accent">Preliminary estimate</span>
              ) : null}
              {tiedWith.length ? (
                <span
                  className="badge badge-accent"
                  aria-label={`Statistical tie with ${tiedWith.join(" and ")}`}
                  title={`Pairwise ordering probability below 0.9 with ${tiedWith.join(" and ")}`}
                >
                  Statistical tie
                </span>
              ) : null}
              <span className="cell-note">
                90% CI {formatScore(index.ciLow)}–{formatScore(index.ciHigh)} ·
                rank {index.rankLow ?? "—"}–{index.rankHigh ?? "—"}
                {index.coverageCount !== null && index.coverageTotal !== null
                  ? ` · coverage ${index.coverageCount}/${index.coverageTotal}`
                  : ""}
              </span>
            </div>
          );
        })}
      </section>

      <EvidencePanel evidence={evidence} tier={tierLabel(tier)} />

      {system ? (
        <DomainPanel system={system} />
      ) : (
        <aside className="callout">
          <strong>No system summary</strong>
          <span>
            This snapshot does not publish per-domain scores for this model.
          </span>
        </aside>
      )}
      {system ? (
        <Disclosure title="Task utility baskets · experimental">
          <BasketTable system={system} />
        </Disclosure>
      ) : null}

      <div className="model-fit-chart">
        <ResidualPlot
          title="Normalized observed vs expected"
          points={results
            .filter((result) => result.predicted !== null && result.used)
            .map((result) => ({
              id: result.id,
              label:
                data.benchmarks.find(
                  (benchmark) => benchmark.slug === result.benchmarkSlug,
                )?.name ?? result.benchmarkSlug,
              x: result.score * 100,
              y: (result.predicted ?? 0) * 100,
              outlier: Math.abs(result.residualZ ?? 0) > 2,
            }))}
        />
      </div>

      <section className="content-section" aria-labelledby="evidence-heading">
        <div className="section-heading">
          <h2 id="evidence-heading">Benchmark evidence</h2>
          <p>
            {results.length} observations · {fittedBenchmarks} fitted benchmark
            cells{system ? ` for ${system.id}` : ""}. Observed values are shown
            in the unit the source reported; predictions are the fitted logit
            mapped back through the benchmark transform.
          </p>
        </div>
        <div className="data-table-wrap">
          <table className="data-table evidence-table">
            <thead>
              <tr>
                <th>Benchmark</th>
                <th>Observed</th>
                <th>
                  Predicted{" "}
                  <InfoTip label="Predicted">
                    Fitted logit without the cell-misfit term, converted back to
                    the native unit of the benchmark.
                  </InfoTip>
                </th>
                <th>
                  Misfit{" "}
                  <InfoTip label="Residual z">
                    Posterior median cell misfit divided by the benchmark misfit
                    sd.
                  </InfoTip>
                </th>
                <th>Config</th>
                <th>Observed on</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const benchmark = data.benchmarks.find(
                  (item) => item.slug === result.benchmarkSlug,
                );
                const predictedNative = result.predictedNative;
                return (
                  <tr
                    key={result.id}
                    className={result.used ? "" : "is-superseded"}
                  >
                    <td className="model-cell">
                      <Link
                        className="model-link"
                        href={`/benchmarks/${result.benchmarkSlug}`}
                      >
                        {benchmark?.name ?? result.benchmarkSlug}
                      </Link>
                      <span className="cell-note">
                        {result.used
                          ? "Kept provenance"
                          : "Superseded provenance"}
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
                        {result.observedLogit !== null
                          ? ` · logit ${formatLogit(result.observedLogit)}`
                          : ""}
                      </span>
                    </td>
                    <td data-label="Predicted">
                      {predictedNative !== null ? (
                        <>
                          <span>
                            {formatNative(predictedNative, result.scoreUnit)}
                          </span>
                          <span className="cell-note">
                            logit {formatLogit(result.predictedLogit)}
                          </span>
                        </>
                      ) : result.predictedLogit !== null ? (
                        <>
                          <span>
                            logit {formatLogit(result.predictedLogit)}
                          </span>
                          <span className="cell-note">
                            transform not invertible
                          </span>
                        </>
                      ) : (
                        <span className="cell-note">no fitted cell</span>
                      )}
                    </td>
                    <td data-label="Misfit">
                      <ZChip value={result.residualZ} />
                    </td>
                    <td data-label="Config">
                      <EvidenceConfig config={result.config} />
                    </td>
                    <td data-label="Observed on">
                      {formatDate(result.observedOn)}
                    </td>
                    <td data-label="Source" className="evidence-source">
                      <a
                        className="text-link"
                        href={result.sourceUrl}
                        rel="noreferrer"
                      >
                        {result.sourceName} ↗
                      </a>
                      <span
                        className={`badge source-badge ${result.sourceKind === "self-reported" ? "badge-accent" : ""}`}
                      >
                        {result.sourceKind === "self-reported"
                          ? "Self-report"
                          : titleCase(result.sourceKind)}
                      </span>
                      {result.displayOnly ? (
                        <span
                          className="badge badge-accent"
                          title={
                            result.sourceLicense ??
                            "Source forbids redistribution"
                          }
                        >
                          Display-only · not redistributable
                        </span>
                      ) : null}
                      <span className="cell-note">
                        {result.harness ?? "Harness not reported"}
                        {result.nItems
                          ? ` · ${result.nItems.toLocaleString("en-US")} items`
                          : ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-section" aria-labelledby="economics-heading">
        <div className="section-heading">
          <h2 id="economics-heading">Economics and runtime</h2>
        </div>
        <div className="detail-grid">
          <div>
            <h3>Providers</h3>
            <dl className="definition-list">
              {liveEconomics ? (
                <div>
                  <dt>
                    <a
                      className="text-link"
                      href={OPENROUTER_MODELS_URL}
                      rel="noreferrer"
                    >
                      OpenRouter ↗
                    </a>
                  </dt>
                  <dd>
                    {formatPrice(liveEconomics.inputPerMillion)} input ·{" "}
                    {formatPrice(liveEconomics.outputPerMillion)} output ·{" "}
                    {liveEconomics.cacheReadPerMillion === null
                      ? "cache read not listed"
                      : `${formatPrice(liveEconomics.cacheReadPerMillion)} cache read`}{" "}
                    / M
                    <span className="cell-note economics-source-note">
                      Live catalog id {liveEconomics.openRouterId} ·
                      display-only
                    </span>
                  </dd>
                </div>
              ) : vendorEconomics ? (
                <div>
                  <dt>
                    <a
                      className="text-link"
                      href={vendorEconomics.sourceUrl}
                      rel="noreferrer"
                    >
                      {model.organization} ↗
                    </a>
                  </dt>
                  <dd>
                    {formatPrice(vendorEconomics.input)} input ·{" "}
                    {formatPrice(vendorEconomics.output)} output / M
                    <span className="cell-note economics-source-note">
                      Standard processing · checked 2026-09-04
                    </span>
                  </dd>
                </div>
              ) : (
                model.pricing.map((price) => (
                  <div key={price.provider}>
                    <dt>{price.provider}</dt>
                    <dd>
                      {formatPrice(price.inputPerMillion)} input ·{" "}
                      {formatPrice(price.outputPerMillion)} output / M
                      <span className="cell-note economics-source-note">
                        {fallbackState}
                      </span>
                    </dd>
                  </div>
                ))
              )}
              {!liveEconomics && !vendorEconomics && !model.pricing.length ? (
                <div>
                  <dt>Pricing</dt>
                  <dd>
                    {openRouter?.status === "available"
                      ? "Unavailable · no exact declared alias and no public snapshot fallback"
                      : openRouter?.status === "unavailable"
                        ? "Unavailable · live request failed and no public snapshot fallback"
                        : "No synthetic fixture provider record"}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div>
            <h3>Limits and speed</h3>
            <dl className="definition-list">
              <div>
                <dt>Context</dt>
                <dd>
                  {limits.contextWindow === null
                    ? "Unavailable"
                    : `${formatTokens(limits.contextWindow)} tokens`}
                  <span className="cell-note economics-source-note">
                    {limitSourceLabel(limits.contextWindowSource)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Max output</dt>
                <dd>
                  {limits.maxOutput === null
                    ? "Unavailable"
                    : `${formatTokens(limits.maxOutput)} tokens`}
                  <span className="cell-note economics-source-note">
                    {limitSourceLabel(limits.maxOutputSource)}
                  </span>
                </dd>
              </div>
              <div><dt>AA cost per task</dt><dd><CostPerTaskValue cost={model.costPerTask} /></dd></div>
              <div>
                <dt>Output speed</dt>
                <dd>
                  {model.speed?.tokensPerSecond != null
                    ? `${model.speed.tokensPerSecond.toFixed(1)} tok/s`
                    : "No observation"}
                </dd>
              </div>
              <div>
                <dt>TTFT</dt>
                <dd>
                  {model.speed?.ttftSeconds != null
                    ? `${model.speed.ttftSeconds.toFixed(2)} seconds`
                    : "No observation"}
                </dd>
              </div>
              {model.speed ? (
                <div>
                  <dt>Runtime source</dt>
                  <dd>
                    {model.speed.sourceUrl ? (
                      <a
                        className="text-link"
                        href={model.speed.sourceUrl}
                        rel="noreferrer"
                      >
                        {model.speed.provider}
                      </a>
                    ) : (
                      model.speed.provider
                    )}{" "}
                    · {model.speed.workload}
                    {model.speed.observedOn
                      ? ` · ${formatDate(model.speed.observedOn)}`
                      : ""}{" "}
                    · not redistributable
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </section>

      <section className="content-section" aria-labelledby="history-heading">
        <div className="section-heading">
          <h2 id="history-heading">Index history</h2>
          <p>
            Each row retains its methodology version. Scores across different
            versions are not directly comparable.
          </p>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Index</th>
                <th>Date</th>
                <th>ACI</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((point) => (
                <tr key={`${point.kind}-${point.runId}`}>
                  <td className="model-cell">
                    <span className="score-main">
                      {data.runs.find((run) => run.id === point.runId)
                        ?.methodVersion ?? "Published fit"}
                    </span>
                  </td>
                  <td data-label="Index">{titleCase(point.kind)}</td>
                  <td data-label="Date">{formatDate(point.createdAt)}</td>
                  <td data-label="ACI">{formatScore(point.score)}</td>
                  <td data-label="Status">
                    <span className="badge">
                      {data.status.mode === "snapshot"
                        ? "Published"
                        : "Fixture only"}
                    </span>
                  </td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No published point score yet: every run so far published an
                    interval only for this model.
                  </td>
                </tr>
              ) : null}
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
