"use client";

import { useMemo, useState } from "react";
import { BenchmarkHeatmap, IndexScatter, RankedBars, Timeline } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { blendedPrice, type BenchmarkRecord, type ModelRecord, type ResultRecord } from "@/lib/data";
import { matchesFilters } from "@/lib/filters";
import { uniqueUsedResultPairs } from "@/lib/result-pairs";
import { useExplorerFilters } from "@/lib/use-explorer-filters";

function selectedPrice(model: ModelRecord, basis: "blended" | "input" | "output"): number | null {
  if (basis === "input") return model.pricing[0]?.inputPerMillion ?? null;
  if (basis === "output") return model.pricing[0]?.outputPerMillion ?? null;
  return blendedPrice(model);
}

export function CompareWorkbench({ models, benchmarks, results }: { models: ModelRecord[]; benchmarks: BenchmarkRecord[]; results: ResultRecord[] }) {
  const { filters, update } = useExplorerFilters();
  const [benchmark, setBenchmark] = useState(results.find((result) => result.used)?.benchmarkSlug ?? "");
  const prices = useMemo(
    () => new Map(models.map((model) => [model.id, selectedPrice(model, filters.priceBasis)])),
    [filters.priceBasis, models],
  );
  const resultPairs = useMemo(() => uniqueUsedResultPairs(results), [results]);
  const visible = models.filter((model) => matchesFilters(model, filters, prices.get(model.id) ?? null) && (!filters.benchmarks.length || resultPairs.some((result) => result.modelSlug === model.slug && filters.benchmarks.includes(result.benchmarkSlug))));
  const toggleHighlight = (id: string) => {
    const model = models.find((item) => item.id === id);
    if (!model) return;
    update({ ...filters, highlight: filters.highlight.includes(model.slug) ? filters.highlight.filter((slug) => slug !== model.slug) : [...filters.highlight, model.slug].slice(0, 8) });
  };
  const highlighted = (model: ModelRecord) => filters.highlight.includes(model.slug);
  const indexPoints = visible.flatMap((model) => {
    const index = model.indexes[filters.index];
    if (index?.score === null || index?.score === undefined) return [];
    return [{ id: model.id, label: model.name, x: prices.get(model.id) ?? 0, y: index.score, low: index.ciLow, high: index.ciHigh, date: model.releasedOn ?? undefined, group: model.organization, highlighted: highlighted(model), provisional: index.provisional }];
  });
  const economics = visible.flatMap((model) => {
    const value = prices.get(model.id);
    return value == null ? [] : [{ id: model.id, label: model.name, x: 0, y: value, group: model.organization, highlighted: highlighted(model) }];
  });
  const agenticChat = visible.flatMap((model) => {
    const agentic = model.indexes.agentic?.score;
    const chat = model.indexes.chat?.score;
    return agentic == null || chat == null ? [] : [{ id: model.id, label: model.name, x: agentic, y: chat, group: model.organization, highlighted: highlighted(model) }];
  });
  const benchmarkSlugs = [...new Set(resultPairs.filter((result) => visible.some((model) => model.slug === result.modelSlug)).map((result) => result.benchmarkSlug))];
  const modelSlugs = visible.slice(0, 30).map((model) => model.slug);
  const values = Object.fromEntries(resultPairs.map((result) => [`${result.modelSlug}\0${result.benchmarkSlug}`, result.score]));
  const benchmarkPoints = resultPairs.filter((result) => result.benchmarkSlug === benchmark).flatMap((result) => {
    const model = models.find((item) => item.slug === result.modelSlug);
    return model ? [{ id: model.id, label: model.name, x: 0, y: result.score * 100, low: result.standardError == null ? null : (result.score - result.standardError) * 100, high: result.standardError == null ? null : (result.score + result.standardError) * 100, group: model.organization, highlighted: highlighted(model), striped: result.sourceKind === "self-reported" }] : [];
  });
  const speed = visible.flatMap((model) => model.speed ? [{ id: model.id, label: model.name, x: 0, y: model.speed.tokensPerSecond, group: model.organization, highlighted: highlighted(model) }] : []);
  const ttft = visible.flatMap((model) => model.speed ? [{ id: model.id, label: model.name, x: 0, y: model.speed.ttftSeconds, group: model.organization, highlighted: highlighted(model) }] : []);
  const context = visible.flatMap((model) => model.contextWindow ? [{ id: model.id, label: model.name, x: 0, y: model.contextWindow / 1000, group: model.organization, highlighted: highlighted(model) }] : []);

  return <div className="compare-stack"><div className="sticky-filter"><FilterBar models={models} benchmarks={benchmarks} value={filters} onChange={update} /></div>
    <RankedBars title={`${filters.index} index`} points={indexPoints} onSelect={toggleHighlight} />
    <IndexScatter title={`Index vs ${filters.priceBasis} price`} points={indexPoints.filter((point) => point.x > 0)} logX showPareto onSelect={toggleHighlight} />
    <IndexScatter title="Agentic vs Chat" points={agenticChat} onSelect={toggleHighlight} />
    <Timeline title="Capability by release date" points={indexPoints} />
    <RankedBars title={`${filters.priceBasis} price · $/M`} points={economics} onSelect={toggleHighlight} />
    {speed.length ? <RankedBars title="Output speed · tok/s" points={speed} onSelect={toggleHighlight} /> : null}
    {ttft.length ? <RankedBars title="Time to first token · seconds" points={ttft} onSelect={toggleHighlight} /> : null}
    <RankedBars title="Context · thousand tokens" points={context} onSelect={toggleHighlight} />
    <section className="content-section single-column"><div className="section-heading"><h2>Benchmark matrix</h2><p>Observed score; blank means no source row.</p></div><BenchmarkHeatmap models={modelSlugs} benchmarks={benchmarkSlugs.slice(0, 12)} values={values} /></section>
    <section className="content-section single-column"><div className="section-heading"><h2>Benchmark ranking</h2><label className="compact-field">Benchmark<select value={benchmark} onChange={(event) => setBenchmark(event.target.value)}>{benchmarkSlugs.map((slug) => <option value={slug} key={slug}>{slug}</option>)}</select></label></div><RankedBars title={benchmark || "Benchmark"} points={benchmarkPoints} onSelect={toggleHighlight} /></section>
  </div>;
}
