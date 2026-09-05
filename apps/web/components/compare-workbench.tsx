"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IndexScatter } from "@/components/charts";
import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { TextureButton } from "@/components/ui/texture-button";
import { FilterBar } from "@/components/filter-bar";
import { IndexProfileControl } from "@/components/index-profile-control";
import { ModelCompareInspector } from "@/components/model-compare-inspector";
import { OrganizationLogo } from "@/components/organization-logo";
import { ScoreValue } from "@/components/score-value";
import { CostPerTaskValue } from "@/components/cost-per-task-value";
import { RuntimeValue } from "@/components/runtime-value";
import { EvidenceConfig } from "@/components/evidence-config";
import { DOMAIN_TITLES } from "@/components/domain-panel";
import {
  ACI_DOMAINS,
  INDEX_KINDS,
  compareIndexRank,
  costPerTaskSuiteLabel,
  type AciDomain,
  type BenchmarkRecord,
  type ModelRecord,
  type ResultRecord,
} from "@/lib/data";
import { displayPrice } from "@/lib/display-economics";
import type { OpenRouterDisplayOverlay } from "@/lib/openrouter-display";
import {
  comparisonValue,
  formatNative,
  formatPrice,
  formatTokens,
  titleCase,
} from "@/lib/format";
import { matchesFilters } from "@/lib/filters";
import { compareNullable } from "@/lib/leaderboard-sort";
import { uniqueUsedResultPairs } from "@/lib/result-pairs";
import { useExplorerFilters } from "@/lib/use-explorer-filters";

type RuntimeMetric = "taskCost" | "price" | "speed" | "ttft" | "context";
const RUNTIME_METRICS = [
  { value: "taskCost", label: "AA cost per task · USD" },
  { value: "price", label: "Price · $/M tokens" },
  { value: "speed", label: "Output speed · tok/s" },
  { value: "ttft", label: "Time to first token · seconds" },
  { value: "context", label: "Context window · k tokens" },
];
const VIEWS = [
  { id: "head-to-head", label: "Head-to-head" },
  { id: "capability", label: "Capability" },
  { id: "runtime", label: "Price & speed" },
  { id: "benchmarks", label: "Benchmarks" },
];

function ModelCell({
  model,
  highlighted,
  onHighlight,
}: {
  model: ModelRecord;
  highlighted: boolean;
  onHighlight: () => void;
}) {
  return (
    <th scope="row" className="compare-model-cell">
      <div className="compare-model-identity">
        <TextureButton
          variant="ghost"
          size="icon"
          className="model-highlight-button"
          aria-label={`Highlight ${model.name}`}
          aria-pressed={highlighted}
          onClick={onHighlight}
        >
          <OrganizationLogo organization={model.organization} />
        </TextureButton>
        <div>
          <Link className="model-link" href={`/models/${model.slug}`}>
            {model.name}
          </Link>
          <span className="cell-note">{model.organization}</span>
        </div>
      </div>
    </th>
  );
}

export function CompareWorkbench({
  models,
  benchmarks,
  results,
  openRouter = null,
}: {
  models: ModelRecord[];
  benchmarks: BenchmarkRecord[];
  results: ResultRecord[];
  openRouter?: OpenRouterDisplayOverlay | null;
}) {
  const { filters, update } = useExplorerFilters();
  const [view, setView] = useState("head-to-head");
  const [domain, setDomain] = useState<AciDomain>("reasoning");
  const [metric, setMetric] = useState<RuntimeMetric>("taskCost");
  const [benchmark, setBenchmark] = useState(
    benchmarks.find((b) => b.slug === "deepswe")?.slug ??
      benchmarks[0]?.slug ??
      "",
  );
  const [query, setQuery] = useState("");
  const [runtimeSort, setRuntimeSort] = useState<"index" | RuntimeMetric>(
    "index",
  );
  const [runtimeDescending, setRuntimeDescending] = useState(true);
  const prices = useMemo(
    () =>
      new Map(
        models.map((model) => [
          model.id,
          displayPrice(model, filters.priceBasis, openRouter),
        ]),
      ),
    [models, filters.priceBasis, openRouter],
  );
  const pairs = useMemo(() => uniqueUsedResultPairs(results), [results]);
  const visible = models.filter((model) =>
    matchesFilters(model, filters, prices.get(model.id) ?? null),
  );
  const shown = visible
    .filter((model) =>
      `${model.name} ${model.organization}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => compareIndexRank(a, b, filters.index));
  const highlighted = (model: ModelRecord) =>
    filters.highlight.includes(model.slug);
  const toggleHighlight = (idOrSlug: string) => {
    const model = models.find((m) => m.id === idOrSlug || m.slug === idOrSlug);
    if (model)
      update({
        ...filters,
        highlight: highlighted(model)
          ? filters.highlight.filter((slug) => slug !== model.slug)
          : [...filters.highlight, model.slug].slice(0, 8),
      });
  };
  const valueFor = (model: ModelRecord, key: "index" | RuntimeMetric) => {
    if (key === "index")
      return (
        model.indexes[filters.index]?.score ??
        model.indexes[filters.index]?.robustScore ??
        null
      );
    if (key === "taskCost") return model.costPerTask?.usdPerTask ?? null;
    if (key === "price") return prices.get(model.id) ?? null;
    if (key === "speed") return model.speed?.tokensPerSecond ?? null;
    if (key === "ttft") return model.speed?.ttftSeconds ?? null;
    return model.contextWindow === null ? null : model.contextWindow / 1000;
  };
  const capabilityPoints = shown.flatMap((model) => {
    const index = model.indexes[filters.index];
    const trait = model.system?.domains[domain];
    return index && trait
      ? [
          {
            id: model.id,
            label: model.name,
            group: model.organization,
            x: trait.median,
            y: index.score ?? index.robustScore,
            low: index.ciLow,
            high: index.ciHigh,
            highlighted: highlighted(model),
            provisional:
              index.provisional || trait.extrapolated || !trait.published,
          },
        ]
      : [];
  });
  const runtimePoints = shown.flatMap((model) => {
    const index = model.indexes[filters.index];
    const value = valueFor(model, metric);
    return index && value !== null
      ? [
          {
            id: model.id,
            label: model.name,
            group: model.organization,
            x: value,
            y: index.score ?? index.robustScore,
            low: index.ciLow,
            high: index.ciHigh,
            highlighted: highlighted(model),
            provisional: index.provisional,
          },
        ]
      : [];
  });
  const selectedBenchmark = benchmarks.find((item) => item.slug === benchmark);
  const benchmarkResults = new Map(
    pairs
      .filter((r) => r.benchmarkSlug === benchmark)
      .map((r) => [r.modelSlug, r]),
  );
  const benchmarkRows = [...shown].sort((a, b) => {
    const left = benchmarkResults.get(a.slug),
      right = benchmarkResults.get(b.slug);
    return (
      compareNullable(
        left ? comparisonValue(left.rawScore, left.scoreUnit) : null,
        right ? comparisonValue(right.rawScore, right.scoreUnit) : null,
        true,
      ) || a.name.localeCompare(b.name)
    );
  });
  const reported = shown.filter((model) =>
    benchmarkResults.has(model.slug),
  ).length;
  const maxResult = Math.max(
    1,
    ...[...benchmarkResults.values()].map((r) =>
      comparisonValue(r.rawScore, r.scoreUnit),
    ),
  );
  const runtimeRows = [...shown].sort(
    (a, b) =>
      compareNullable(
        valueFor(a, runtimeSort),
        valueFor(b, runtimeSort),
        runtimeDescending,
      ) || compareIndexRank(a, b, filters.index),
  );
  const taskCostSuite = costPerTaskSuiteLabel(models);
  const runtimeMetrics = RUNTIME_METRICS.map((item) =>
    item.value === "taskCost"
      ? { ...item, label: `${taskCostSuite} cost per task · USD` }
      : item,
  );
  const metricLabel = runtimeMetrics.find(
    (item) => item.value === metric,
  )!.label;
  const sortRuntime = (key: "index" | RuntimeMetric) => {
    if (key === runtimeSort) setRuntimeDescending(!runtimeDescending);
    else {
      setRuntimeSort(key);
      setRuntimeDescending(
        key !== "price" && key !== "ttft" && key !== "taskCost",
      );
    }
  };
  const runtimeHeading = (key: "index" | RuntimeMetric, label: string) => (
    <th
      aria-sort={
        runtimeSort === key
          ? runtimeDescending
            ? "descending"
            : "ascending"
          : "none"
      }
    >
      <TextureButton variant="ghost" size="sm" onClick={() => sortRuntime(key)}>
        {label}
        {runtimeSort === key ? (runtimeDescending ? " ↓" : " ↑") : ""}
      </TextureButton>
    </th>
  );
  const modelCell = (model: ModelRecord) => (
    <ModelCell
      model={model}
      highlighted={highlighted(model)}
      onHighlight={() => toggleHighlight(model.slug)}
    />
  );
  const search = (
    <Input
      type="search"
      aria-label="Search compared models"
      placeholder="Search models or organizations…"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );

  return (
    <div className="compare-workspace">
      <DirectionAwareTabs
        aria-label="Comparison view"
        className="compare-view-tabs"
        value={view}
        onChange={setView}
        tabs={VIEWS}
      />
      <div className="compare-controls">
        {view !== "benchmarks" ? (
          <IndexProfileControl
            value={filters.index}
            onChange={(index) => update({ ...filters, index })}
          />
        ) : (
          <p className="benchmark-mode-note">
            Benchmark results are source-reported scores. Mixed, Agentic and
            Chat weights do not change them.
          </p>
        )}
        <FilterBar
          models={models}
          benchmarks={benchmarks}
          value={filters}
          onChange={update}
          showIndex={false}
          showBenchmarks={false}
        />
      </div>
      {view === "head-to-head" ? (
        <>
          <p className="compare-context-note">
            The profile changes the overall comparison below. Your selected pair
            stays the same; all three indexes remain visible.
          </p>
          {visible.length ? (
            <ModelCompareInspector
              models={visible}
              benchmarks={benchmarks}
              results={results}
              index={filters.index}
              priceBasis={filters.priceBasis}
              highlightedSlugs={filters.highlight}
              onToggleHighlight={toggleHighlight}
              openRouter={openRouter}
            />
          ) : (
            <div className="empty-state">No models match these filters.</div>
          )}
        </>
      ) : null}
      {view === "capability" ? (
        <section
          className="compare-analysis"
          aria-label="Capability comparison"
        >
          <div className="compare-section-heading">
            <div>
              <h2>Capability across models</h2>
              <p>
                Ordered by the {titleCase(filters.index)} estimate, including
                preliminary scores.
              </p>
            </div>
            {search}
          </div>
          <div className="compare-analysis-grid">
            <div className="compare-plot-panel">
              <label className="compact-field">
                Compare a capability area
                <Combobox
                  label="Capability area"
                  value={domain}
                  onChange={(value) => setDomain(value as AciDomain)}
                  options={ACI_DOMAINS.map((value) => ({
                    value,
                    label: DOMAIN_TITLES[value],
                  }))}
                />
              </label>
              <IndexScatter
                title={`${DOMAIN_TITLES[domain]} & ${titleCase(filters.index)}`}
                points={capabilityPoints}
                xLabel={DOMAIN_TITLES[domain]}
                yLabel={`${titleCase(filters.index)} index`}
                onSelect={toggleHighlight}
              />
              <p className="compare-footnote">
                Select a point or a model logo to highlight it in both views.
                Outlined points include preliminary estimates.
              </p>
            </div>
            <div className="compare-table-panel">
              <div className="compare-table-caption">
                <strong>{shown.length} models</strong>
                <span>* preliminary · ± 90% interval</span>
              </div>
              <p className="table-scroll-hint">
                Swipe the table to see all columns →
              </p>
              <div className="data-table-wrap compare-table-scroll">
                <table
                  className="data-table compare-score-table"
                  aria-label="Model capability scores"
                >
                  <thead>
                    <tr>
                      <th>Model</th>
                      {INDEX_KINDS.map((kind) => (
                        <th
                          key={kind}
                          className={
                            filters.index === kind
                              ? "active-profile-column"
                              : undefined
                          }
                        >
                          {titleCase(kind)}
                          {filters.index === kind ? " ↓" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((model) => (
                      <tr
                        key={model.id}
                        className={
                          highlighted(model) ? "is-highlighted" : undefined
                        }
                      >
                        {modelCell(model)}
                        {INDEX_KINDS.map((kind) => (
                          <td
                            key={kind}
                            className={
                              filters.index === kind
                                ? "active-profile-column"
                                : undefined
                            }
                          >
                            <ScoreValue
                              index={model.indexes[kind]}
                              uncertainty
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {view === "runtime" ? (
        <section
          className="compare-analysis"
          aria-label="Price and speed comparison"
        >
          <div className="compare-section-heading">
            <div>
              <h2>Capability for your budget</h2>
              <p>
                Compare cost, latency and context alongside the selected index.
              </p>
            </div>
            {search}
          </div>
          <div className="compare-analysis-grid runtime-analysis-grid">
            <div className="compare-plot-panel">
              <label className="compact-field">
                Compare against
                <Combobox
                  label="Runtime metric"
                  value={metric}
                  onChange={(value) => setMetric(value as RuntimeMetric)}
                  options={runtimeMetrics}
                />
              </label>
              {metric === "price" ? (
                <label className="compact-field">
                  Price basis
                  <Combobox
                    label="Runtime price basis"
                    value={filters.priceBasis}
                    onChange={(value) =>
                      update({
                        ...filters,
                        priceBasis: value as typeof filters.priceBasis,
                      })
                    }
                    options={[
                      {
                        value: "blended",
                        label: "Blended · 3 input : 1 output",
                      },
                      { value: "input", label: "Input tokens" },
                      { value: "output", label: "Output tokens" },
                    ]}
                  />
                </label>
              ) : null}
              <IndexScatter
                title={`${titleCase(filters.index)} vs ${metric === "taskCost" ? `${taskCostSuite} cost per task` : metric === "price" ? `${filters.priceBasis} price` : metric === "ttft" ? "first token" : metric}`}
                points={runtimePoints}
                xLabel={
                  metric === "price"
                    ? `${titleCase(filters.priceBasis)} price · $/M`
                    : metricLabel
                }
                yLabel={`${titleCase(filters.index)} index`}
                logX={metric === "price" || metric === "taskCost"}
                showPareto={metric === "price" || metric === "taskCost"}
                onSelect={toggleHighlight}
              />
              <p className="compare-footnote">
                {runtimePoints.length} of {shown.length} models have values for
                this chart. All models remain in the table. Speed and latency
                link to the measured configuration.
                {metric === "taskCost"
                  ? ` ${taskCostSuite} cost includes reasoning tokens and uses one shared Intelligence Index task suite.`
                  : ""}
              </p>
            </div>
            <div className="compare-table-panel">
              <div className="compare-table-caption">
                <strong>{shown.length} models</strong>
                <span>Click a column to sort</span>
              </div>
              <p className="table-scroll-hint">
                Swipe the table to see all columns →
              </p>
              <div className="data-table-wrap compare-table-scroll">
                <table
                  className="data-table compare-runtime-table"
                  aria-label="Model pricing and runtime"
                >
                  <thead>
                    <tr>
                      <th>Model</th>
                      {runtimeHeading("index", titleCase(filters.index))}
                      {runtimeHeading("taskCost", `${taskCostSuite} $/task`)}
                      {runtimeHeading("price", "$/M")}
                      {runtimeHeading("speed", "tok/s")}
                      {runtimeHeading("ttft", "TTFT")}
                      {runtimeHeading("context", "Context")}
                    </tr>
                  </thead>
                  <tbody>
                    {runtimeRows.map((model) => (
                      <tr
                        key={model.id}
                        className={
                          highlighted(model) ? "is-highlighted" : undefined
                        }
                      >
                        {modelCell(model)}
                        <td>
                          <ScoreValue index={model.indexes[filters.index]} />
                        </td>
                        <td>
                          <CostPerTaskValue cost={model.costPerTask} />
                        </td>
                        <td>
                          {prices.get(model.id) == null ? (
                            <span className="cell-note">Not listed</span>
                          ) : (
                            formatPrice(prices.get(model.id)!)
                          )}
                        </td>
                        <td>
                          <RuntimeValue speed={model.speed} metric="speed" />
                        </td>
                        <td>
                          <RuntimeValue speed={model.speed} metric="ttft" />
                        </td>
                        <td>
                          {model.contextWindow === null ? (
                            <span className="cell-note">Not listed</span>
                          ) : (
                            formatTokens(model.contextWindow)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {view === "benchmarks" ? (
        <section className="compare-analysis" aria-label="Benchmark comparison">
          <div className="compare-section-heading">
            <div>
              <h2>Benchmark results</h2>
              <p>
                One representative source result per model; open the source or
                configuration for details.
              </p>
            </div>
            {search}
          </div>
          <div className="benchmark-selection-row">
            <label className="compact-field">
              Benchmark
              <Combobox
                label="Explore benchmark"
                value={benchmark}
                onChange={setBenchmark}
                options={benchmarks.map((b) => ({
                  value: b.slug,
                  label: b.name,
                }))}
              />
            </label>
            <div className="benchmark-selection-summary">
              <strong>
                {reported} / {shown.length} models reported
              </strong>
              <span>
                {selectedBenchmark?.status === "watchlist"
                  ? "Watchlist · does not affect the index"
                  : "Source scores, sorted high to low"}
              </span>
            </div>
            {selectedBenchmark ? (
              <Link
                className="benchmark-details-link"
                href={`/benchmarks/${selectedBenchmark.slug}`}
              >
                Benchmark details ↗
              </Link>
            ) : null}
          </div>
          <p className="table-scroll-hint">
            Swipe the table for sources and dates →
          </p>
          <div className="data-table-wrap compare-table-scroll benchmark-comparison-scroll">
            <table
              className="data-table compare-benchmark-table"
              aria-label="Reported benchmark results"
            >
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Reported result ↓</th>
                  <th>Source & configuration</th>
                  <th>Observed</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkRows.map((model) => {
                  const result = benchmarkResults.get(model.slug);
                  return (
                    <tr
                      key={model.id}
                      className={
                        highlighted(model) ? "is-highlighted" : undefined
                      }
                    >
                      {modelCell(model)}
                      <td>
                        {result ? (
                          <div className="benchmark-result-cell">
                            <strong>
                              {formatNative(result.rawScore, result.scoreUnit)}
                            </strong>
                            <span
                              className="benchmark-result-track"
                              aria-hidden="true"
                            >
                              <span
                                style={{
                                  width: `${Math.max(0, (comparisonValue(result.rawScore, result.scoreUnit) / maxResult) * 100)}%`,
                                }}
                              />
                            </span>
                          </div>
                        ) : (
                          <span className="cell-note">Not reported</span>
                        )}
                      </td>
                      <td>
                        {result ? (
                          <>
                            <a
                              className="result-value"
                              href={result.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {result.sourceName} ↗
                            </a>
                            <span className="cell-note">
                              {titleCase(result.sourceKind)}
                            </span>
                            <EvidenceConfig config={result.config} />
                          </>
                        ) : null}
                      </td>
                      <td>
                        {result?.observedOn ?? (
                          <span className="cell-note">Not reported</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {view !== "head-to-head" && !shown.length ? (
        <div className="empty-state" role="status">
          No models match. Clear the search or model filters.
        </div>
      ) : null}
    </div>
  );
}
