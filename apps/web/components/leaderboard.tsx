"use client";
import { CostPerTaskValue } from "@/components/cost-per-task-value";
import { Combobox } from "@/components/ui/combobox";
import { RuntimeValue } from "@/components/runtime-value";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { IndexScatter, RankedBars } from "@/components/charts";
import {
  DATA_STATUS,
  MODELS,
  type BenchmarkRecord,
  type DataStatus,
  type IndexScore,
  type ModelRecord,
  type ResultRecord,
} from "@/lib/data";
import { matchesFilters } from "@/lib/filters";
import { formatPrice, formatTokens } from "@/lib/format";
import {
  sortLeaderboardModels,
  type LeaderboardSortKey,
} from "@/lib/leaderboard-sort";
import { useExplorerFilters } from "@/lib/use-explorer-filters";
import { type OpenRouterDisplayOverlay } from "@/lib/openrouter-display";
import { displayPrice } from "@/lib/display-economics";
import { OrganizationLogo } from "@/components/organization-logo";
import { ScoreValue } from "@/components/score-value";
import { TextureButton } from "@/components/ui/texture-button";

function CoverageCell({
  index,
  fallback,
}: {
  index: IndexScore | undefined;
  fallback: number;
}) {
  if (!index || index.coverageCount === null || index.coverageTotal === null) {
    return (
      <span className="coverage-dots" title={`${fallback} observed benchmarks`}>
        {fallback}
      </span>
    );
  }
  return (
    <span
      className="coverage-dots"
      title={`${index.coverageCount} of ${index.coverageTotal} benchmarks fitted in this run have a used cell for this system`}
    >
      {index.coverageCount}/{index.coverageTotal}
    </span>
  );
}

export function Leaderboard({
  models = MODELS,
  results = [],
  benchmarks = [],
  status = DATA_STATUS,
  openRouter = null,
}: {
  models?: ModelRecord[];
  results?: ResultRecord[];
  benchmarks?: BenchmarkRecord[];
  status?: DataStatus;
  openRouter?: OpenRouterDisplayOverlay | null;
}) {
  const { filters, update } = useExplorerFilters();
  const [chartCost, setChartCost] = useState("taskCost");
  const [sort, setSort] = useState<LeaderboardSortKey>("score");
  const [descending, setDescending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const prices = useMemo(
    () =>
      new Map(
        models.map((model) => [
          model.id,
          displayPrice(model, filters.priceBasis, openRouter),
        ]),
      ),
    [models, openRouter, filters.priceBasis],
  );
  const visible = useMemo(
    () =>
      sortLeaderboardModels(
        models.filter(
          (model) =>
            matchesFilters(model, filters, prices.get(model.id) ?? null) &&
            (!filters.benchmarks.length ||
              results.some(
                (result) =>
                  result.modelSlug === model.slug &&
                  result.used &&
                  filters.benchmarks.includes(result.benchmarkSlug),
              )),
        ),
        { kind: filters.index, sort, descending, prices },
      ),
    [descending, filters, models, prices, results, sort],
  );
  const sortBy = (next: LeaderboardSortKey) => {
    if (next === sort) setDescending((value) => !value);
    else {
      setSort(next);
      setDescending(false);
    }
  };
  const sortState = (
    key: LeaderboardSortKey,
  ): "ascending" | "descending" | "none" => {
    if (sort !== key) return "none";
    const highFirst = key !== "price" && key !== "rank" && key !== "taskCost";
    return highFirst !== descending ? "descending" : "ascending";
  };
  const toggleHighlight = (model: ModelRecord) =>
    update({
      ...filters,
      highlight: filters.highlight.includes(model.slug)
        ? filters.highlight.filter((slug) => slug !== model.slug)
        : [...filters.highlight, model.slug].slice(0, 8),
    });
  const chartPoints = visible.flatMap((model) => {
    const index = model.indexes[filters.index];
    return index
      ? [
          {
            id: model.id,
            label: model.name,
            x:
              chartCost === "taskCost"
                ? (model.costPerTask?.usdPerTask ?? 0)
                : (prices.get(model.id) ?? 0),
            y: index.score ?? index.robustScore,
            low: index.ciLow,
            high: index.ciHigh,
            highlighted: filters.highlight.includes(model.slug),
            group: model.organization,
            provisional: index.provisional,
          },
        ]
      : [];
  });
  const indexLabel = `${filters.index[0]?.toUpperCase()}${filters.index.slice(1)} index`;

  return (
    <section className="workbench" aria-labelledby="leaderboard-heading">
      <h2 className="sr-only" id="leaderboard-heading">
        Model leaderboard
      </h2>
      <FilterBar
        models={models}
        benchmarks={benchmarks}
        value={filters}
        onChange={update}
      />
      <div className="results-summary" aria-live="polite">
        <span>{visible.length} models</span>
        <span>{indexLabel}</span>
        <span className="results-note">
          All estimates share one order · * preliminary · ± 90% interval
        </span>
      </div>
      <div className="data-table-wrap" id="leaderboard-table">
        <table className="data-table leaderboard-table">
          <thead>
            <tr>
              <th title="Position in the current view">#</th>
              <th>Model</th>
              <th aria-sort={sortState("score")}>
                <TextureButton
                  variant="ghost"
                  size="sm"
                  onClick={() => sortBy("score")}
                  title="ACI-G median with 90% interval"
                >
                  Index
                </TextureButton>
              </th>
              <th>Agentic</th>
              <th>Chat</th>
              <th aria-sort={sortState("coverage")}>
                <TextureButton
                  variant="ghost"
                  size="sm"
                  onClick={() => sortBy("coverage")}
                  title="Benchmarks with a used fitted cell / benchmarks fitted in the run"
                >
                  Coverage
                </TextureButton>
              </th>
              <th aria-sort={sortState("taskCost")}>
                <TextureButton
                  variant="ghost"
                  size="sm"
                  onClick={() => sortBy("taskCost")}
                  title="Artificial Analysis weighted cost per Intelligence Index task"
                >
                  AA $/task
                </TextureButton>
              </th>
              <th aria-sort={sortState("price")}>
                <TextureButton
                  variant="ghost"
                  size="sm"
                  onClick={() => sortBy("price")}
                >
                  $/M
                </TextureButton>
              </th>
              <th>tok/s</th>
              <th>TTFT</th>
              <th>Context</th>
              <th>
                <span className="sr-only">Inspect</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((model, position) => {
              const index = model.indexes[filters.index];
              const modelResults = results.filter(
                (result) => result.modelSlug === model.slug && result.used,
              );
              const observedBenchmarks = new Set(
                modelResults.map((result) => result.benchmarkSlug),
              ).size;
              return (
                <Fragment key={model.id}>
                  <tr
                    className={`${filters.highlight.includes(model.slug) ? "is-highlighted " : ""}${index?.provisional ? "is-provisional" : ""}`}
                    onDoubleClick={() => toggleHighlight(model)}
                  >
                    <td className="rank-cell">{position + 1}</td>
                    <td className="model-cell">
                      <span className="model-name-row">
                        <Link
                          className="model-link"
                          href={`/models/${model.slug}`}
                        >
                          {model.name}
                        </Link>
                      </span>
                      <span className="model-org">
                        <OrganizationLogo organization={model.organization} />
                        {model.organization}
                        {model.openWeights ? " · ◇" : ""}
                      </span>
                    </td>
                    <td>
                      <ScoreValue index={index} uncertainty />
                    </td>
                    <td>
                      <ScoreValue index={model.indexes.agentic} />
                    </td>
                    <td>
                      <ScoreValue index={model.indexes.chat} />
                    </td>
                    <td>
                      <CoverageCell
                        index={index}
                        fallback={observedBenchmarks}
                      />
                    </td>
                    <td>
                      <CostPerTaskValue cost={model.costPerTask} />
                    </td>
                    <td>{formatPrice(prices.get(model.id) ?? null)}</td>
                    <td>
                      <RuntimeValue speed={model.speed} metric="speed" />
                    </td>
                    <td>
                      <RuntimeValue speed={model.speed} metric="ttft" />
                    </td>
                    <td>{formatTokens(model.contextWindow)}</td>
                    <td>
                      <TextureButton
                        variant="ghost"
                        size="sm"
                        className="row-toggle"
                        type="button"
                        aria-label={`Inspect ${model.name}`}
                        aria-expanded={expanded === model.id}
                        onClick={() =>
                          setExpanded(expanded === model.id ? null : model.id)
                        }
                      >
                        ›
                      </TextureButton>
                    </td>
                  </tr>
                  {expanded === model.id ? (
                    <tr className="evidence-strip">
                      <td colSpan={12}>
                        <div>
                          <strong>
                            Benchmark evidence
                            {index?.systemId ? (
                              <em> · {index?.systemId}</em>
                            ) : null}
                          </strong>
                          {modelResults.slice(0, 12).map((result) => (
                            <span key={result.id}>
                              <Link
                                href={`/benchmarks/${result.benchmarkSlug}`}
                              >
                                {benchmarks.find(
                                  (item) => item.slug === result.benchmarkSlug,
                                )?.name ?? result.benchmarkSlug}
                              </Link>{" "}
                              {(result.score * 100).toFixed(1)}
                              {result.residualZ == null
                                ? ""
                                : ` · z ${result.residualZ.toFixed(1)}`}
                            </span>
                          ))}
                          {index?.flags.length ? (
                            <span className="evidence-flags">
                              Flags: {index.flags.join("; ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visible.length ? (
        <div className="empty-state" role="status">
          <strong>No models match.</strong>
          <span>Clear one or more filters.</span>
        </div>
      ) : null}
      {chartPoints.length ? (
        <div className="leaderboard-chart-controls">
          <label className="compact-field">
            Compare capability against
            <Combobox
              label="Chart cost metric"
              value={chartCost}
              onChange={setChartCost}
              options={[
                { value: "taskCost", label: "AA cost per task · USD" },
                { value: "price", label: "Token price · $/M" },
              ]}
            />
          </label>
          <p>
            AA task cost includes reasoning tokens and follows its own
            Intelligence Index task weights.
          </p>
        </div>
      ) : null}
      {chartPoints.length ? (
        <div className="overview-charts">
          <RankedBars
            title={`${filters.index} index`}
            points={chartPoints}
            onSelect={(id) => {
              const model = models.find((item) => item.id === id);
              if (model) toggleHighlight(model);
            }}
          />
          <IndexScatter
            title={
              chartCost === "taskCost"
                ? "Capability vs AA cost per task"
                : `Capability vs ${filters.priceBasis} price`
            }
            xLabel={
              chartCost === "taskCost"
                ? "AA cost per task · USD"
                : `${filters.priceBasis} price · $/M`
            }
            points={chartPoints.filter((point) => point.x > 0)}
            logX
            showPareto
            onSelect={(id) => {
              const model = models.find((item) => item.id === id);
              if (model) toggleHighlight(model);
            }}
          />
        </div>
      ) : null}
      <p className="source-line">
        * Preliminary estimate · ± encloses the 90% credible interval.{" "}
        {status.snapshotDate ?? "Fixture"} · source-linked evidence · AA runtime
        and cost are display-only
      </p>
    </section>
  );
}
