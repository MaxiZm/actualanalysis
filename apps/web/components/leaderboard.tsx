"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { CiBar, IndexScatter, RankedBars } from "@/components/charts";
import { DATA_STATUS, MODELS, blendedPrice, compareIndexRank, type BenchmarkRecord, type DataStatus, type ModelRecord, type ResultRecord } from "@/lib/data";
import { matchesFilters } from "@/lib/filters";
import { formatPrice, formatScore, formatTokens } from "@/lib/format";
import { useExplorerFilters } from "@/lib/use-explorer-filters";
import { blendedOpenRouterPrice, type OpenRouterDisplayOverlay } from "@/lib/openrouter-display";
import { orgColor } from "@/lib/charts/org-color";

type SortKey = "rank" | "score" | "coverage" | "price" | "release";

function FlagIcons({ flags }: { flags: string[] }) {
  const types = [{ key: "public", icon: "△" }, { key: "Removing", icon: "↔" }, { key: "outlier", icon: "!" }, { key: "rank", icon: "≠" }];
  return <span className="flag-icons">{types.flatMap(({ key, icon }) => { const flag = flags.find((item) => item.includes(key)); return flag ? [<span className="icon-flag" title={flag} key={key}>{icon}</span>] : []; }).slice(0, 4)}</span>;
}

export function Leaderboard({ models = MODELS, results = [], benchmarks = [], status = DATA_STATUS, openRouter = null }: { models?: ModelRecord[]; results?: ResultRecord[]; benchmarks?: BenchmarkRecord[]; status?: DataStatus; openRouter?: OpenRouterDisplayOverlay | null }) {
  const { filters, update } = useExplorerFilters();
  const [sort, setSort] = useState<SortKey>("rank");
  const [descending, setDescending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const prices = useMemo(() => new Map(models.map((model) => [model.id, openRouter?.matches[model.id] ? blendedOpenRouterPrice(openRouter.matches[model.id]!) : blendedPrice(model)])), [models, openRouter]);
  const visible = useMemo(() => models.filter((model) => matchesFilters(model, filters, prices.get(model.id) ?? null) && (!filters.benchmarks.length || results.some((result) => result.modelSlug === model.slug && result.used && filters.benchmarks.includes(result.benchmarkSlug)))).sort((a, b) => {
    const ai = a.indexes[filters.index]!;
    const bi = b.indexes[filters.index]!;
    const value = sort === "rank" ? compareIndexRank(a, b, filters.index) : sort === "score" ? (bi.score ?? -Infinity) - (ai.score ?? -Infinity) : sort === "coverage" ? bi.coverage - ai.coverage : sort === "price" ? (prices.get(a.id) ?? Infinity) - (prices.get(b.id) ?? Infinity) : Date.parse(b.releasedOn ?? "0") - Date.parse(a.releasedOn ?? "0");
    return descending ? -value : value;
  }), [descending, filters, models, prices, results, sort]);
  const sortBy = (next: SortKey) => { if (next === sort) setDescending((value) => !value); else { setSort(next); setDescending(false); } };
  const toggleHighlight = (model: ModelRecord) => update({ ...filters, highlight: filters.highlight.includes(model.slug) ? filters.highlight.filter((slug) => slug !== model.slug) : [...filters.highlight, model.slug].slice(0, 8) });
  const chartPoints = visible.flatMap((model) => { const index = model.indexes[filters.index]; return index?.score != null ? [{ id: model.id, label: model.name, x: prices.get(model.id) ?? 0, y: index.score, low: index.ciLow, high: index.ciHigh, highlighted: filters.highlight.includes(model.slug), group: model.organization }] : []; });

  return <section className="workbench" aria-labelledby="leaderboard-heading"><h2 className="sr-only" id="leaderboard-heading">Model leaderboard</h2><FilterBar models={models} benchmarks={benchmarks} value={filters} onChange={update} /><div className="results-summary" aria-live="polite"><span>{visible.length} models</span><span>{filters.index[0]?.toUpperCase()}{filters.index.slice(1)} index</span></div>
    <div className="data-table-wrap" id="leaderboard-table"><table className="data-table leaderboard-table"><thead><tr><th><button onClick={() => sortBy("rank")}>#</button></th><th>Model</th><th><button onClick={() => sortBy("score")}>Index</button></th><th>Rank range</th><th>Agentic</th><th>Chat</th><th><button onClick={() => sortBy("coverage")}>Coverage</button></th><th><button onClick={() => sortBy("price")}>$/M</button></th><th>tok/s</th><th>TTFT</th><th>Context</th><th>Flags</th></tr></thead><tbody>{visible.map((model) => {
      const index = model.indexes[filters.index]!;
      const modelResults = results.filter((result) => result.modelSlug === model.slug && result.used);
      return <Fragment key={model.id}><tr className={`${filters.highlight.includes(model.slug) ? "is-highlighted " : ""}${index.provisional ? "is-provisional" : ""}`} onDoubleClick={() => toggleHighlight(model)}><td className="rank-cell">{index.rank === null ? "—" : index.rank}</td><td className="model-cell"><Link className="model-link" href={`/models/${model.slug}`}>{model.name}</Link><span className="model-org"><i className="org-dot" style={{ background: orgColor(model.organization) }} />{model.organization}{model.openWeights ? " · ◇" : ""}</span></td><td><span className="score-main">{formatScore(index.score)}</span><CiBar value={index.score} low={index.ciLow} high={index.ciHigh} /></td><td>{index.rankLow == null || index.rankHigh == null ? "—" : `${index.rankLow}–${index.rankHigh}`}</td><td>{formatScore(model.indexes.agentic?.score ?? null)}</td><td>{formatScore(model.indexes.chat?.score ?? null)}</td><td><span className="coverage-dots" title={`${modelResults.length} observed benchmarks`}>{modelResults.length}/{benchmarks.length}</span></td><td>{formatPrice(prices.get(model.id) ?? null)}</td><td>{model.speed?.tokensPerSecond ?? "—"}</td><td>{model.speed ? `${model.speed.ttftSeconds.toFixed(2)}s` : "—"}</td><td>{formatTokens(model.contextWindow)}</td><td><FlagIcons flags={index.flags} /><button className="row-toggle" type="button" aria-label={`Inspect ${model.name}`} aria-expanded={expanded === model.id} onClick={() => setExpanded(expanded === model.id ? null : model.id)}>›</button></td></tr>
        {expanded === model.id ? <tr className="evidence-strip"><td colSpan={12}><div><strong>Benchmark evidence</strong>{modelResults.slice(0, 12).map((result) => <span key={result.id}><Link href={`/benchmarks/${result.benchmarkSlug}`}>{benchmarks.find((item) => item.slug === result.benchmarkSlug)?.name ?? result.benchmarkSlug}</Link> {(result.score * 100).toFixed(1)}{result.residualZ == null ? "" : ` · z ${result.residualZ.toFixed(1)}`}</span>)}</div></td></tr> : null}</Fragment>;
    })}</tbody></table></div>
    {!visible.length ? <div className="empty-state" role="status"><strong>No models match.</strong><span>Clear one or more filters.</span></div> : null}
    {chartPoints.length ? <div className="overview-charts"><RankedBars title={`${filters.index} index`} points={chartPoints} onSelect={(id) => { const model = models.find((item) => item.id === id); if (model) toggleHighlight(model); }} /><IndexScatter title="Capability vs blended price" points={chartPoints.filter((point) => point.x > 0)} logX showPareto onSelect={(id) => { const model = models.find((item) => item.id === id); if (model) toggleHighlight(model); }} /></div> : null}
    <p className="source-line">{status.snapshotDate ?? "Fixture"} · source-linked evidence · speed excluded from export</p>
  </section>;
}
