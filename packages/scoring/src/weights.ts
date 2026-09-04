import { assertPositive, mean } from "./math.js";
import type { BenchmarkDefinition, BenchmarkWeight, FitResult, PreparedCell } from "./types.js";

export interface BenchmarkWeightOptions {
  topModelCount?: number;
  saturationThreshold?: number;
  publicStaticFactor?: number;
  privateRollingFactor?: number;
  weightCaps?: Record<string, number>;
  maxShare?: number;
}

function categoriesOf(benchmark: BenchmarkDefinition): string[] {
  if (benchmark.categories?.length) return [...new Set(benchmark.categories)];
  return benchmark.category ? [benchmark.category] : ["uncategorized"];
}

function applyShareCap(raw: Record<string, number>, targetTotal: number, maxShare: number): Record<string, number> {
  const ids = Object.keys(raw);
  if (ids.length === 0) return {};
  const maximum = targetTotal * maxShare;
  if (maximum * ids.length + 1e-12 < targetTotal) {
    throw new Error(`weighting.max_share ${maxShare} is infeasible for ${ids.length} active benchmarks`);
  }
  const result: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let remaining = new Set(ids);
  let remainingTotal = targetTotal;
  while (remaining.size > 0) {
    const rawTotal = [...remaining].reduce((sum, id) => sum + (raw[id] ?? 0), 0);
    if (!(rawTotal > 0)) {
      const equal = remainingTotal / remaining.size;
      for (const id of remaining) result[id] = equal;
      break;
    }
    const capped = [...remaining].filter((id) => remainingTotal * (raw[id] ?? 0) / rawTotal > maximum);
    if (capped.length === 0) {
      for (const id of remaining) result[id] = remainingTotal * (raw[id] ?? 0) / rawTotal;
      break;
    }
    for (const id of capped) {
      result[id] = maximum;
      remaining.delete(id);
      remainingTotal -= maximum;
    }
  }
  return result;
}

/** Category-balanced benchmark weights. Discrimination is intentionally not a weight factor. */
export function computeBenchmarkWeights(
  benchmarks: readonly BenchmarkDefinition[],
  cells: readonly PreparedCell[],
  fit: FitResult,
  options: BenchmarkWeightOptions = {},
): Record<string, BenchmarkWeight> {
  const topCount = options.topModelCount ?? 10;
  const saturationThreshold = options.saturationThreshold ?? 0.9;
  const publicStaticFactor = options.publicStaticFactor ?? 0.7;
  const privateRollingFactor = options.privateRollingFactor ?? 1;
  const maxShare = options.maxShare ?? 1;
  assertPositive(topCount, "Top-model count");
  if (!(maxShare > 0 && maxShare <= 1)) throw new Error("Maximum benchmark share must be in (0, 1]");

  const active = benchmarks.filter((benchmark) => cells.some((cell) => cell.benchmarkId === benchmark.id));
  const categoryCounts = new Map<string, number>();
  for (const benchmark of active) {
    for (const category of categoriesOf(benchmark)) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const targetTotal = Math.max(1, categoryCounts.size);
  const topModelSet = new Set(Object.entries(fit.capabilities)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topCount)
    .map(([id]) => id));

  const drafts: Record<string, Omit<BenchmarkWeight, "weight">> = {};
  const rawWeights: Record<string, number> = {};
  for (const benchmark of active) {
    const benchmarkCells = cells.filter((cell) => cell.benchmarkId === benchmark.id);
    const probabilities = new Map<string, number[]>();
    for (const cell of benchmarkCells) {
      if (!topModelSet.has(cell.modelId)) continue;
      const values = probabilities.get(cell.modelId) ?? [];
      values.push(cell.p);
      probabilities.set(cell.modelId, values);
    }
    const topProbabilities = [...probabilities.values()].map(mean);
    const saturatedTopModelCount = topProbabilities.filter((p) => p > saturationThreshold).length;
    const saturation = topProbabilities.length === 0 ? 1 : 1 - saturatedTopModelCount / topProbabilities.length;
    const independentIds = new Set(benchmarkCells.flatMap((cell) => cell.independentSourceIds));
    const anyIds = new Set(benchmarkCells.flatMap((cell) => cell.sourceIds));
    const sources = independentIds.size > 0 ? 1 : 0.5;
    const privacy = benchmark.holdout === "public" ? publicStaticFactor : privateRollingFactor;
    const categories = categoriesOf(benchmark);
    const categoryShares = Object.fromEntries(categories.map((category) => [category, 1 / categories.length]));
    const categoryBalance = categories.reduce(
      (sum, category) => sum + 1 / categories.length / (categoryCounts.get(category) ?? 1),
      0,
    );
    const uncappedWeight = saturation * sources * privacy * categoryBalance;
    const cap = benchmark.weightCap ?? options.weightCaps?.[benchmark.id] ?? Number.POSITIVE_INFINITY;
    if (!(cap >= 0)) throw new Error(`Invalid weight cap for ${benchmark.id}`);
    rawWeights[benchmark.id] = Math.min(uncappedWeight, cap);
    drafts[benchmark.id] = {
      benchmarkId: benchmark.id,
      uncappedWeight,
      cap,
      factors: { discrimination: 1, saturation, sources, privacy, categoryBalance },
      topModelCount: topProbabilities.length,
      saturatedTopModelCount,
      independentSourceCount: independentIds.size > 0 ? independentIds.size : anyIds.size,
      categoryShares,
    };
  }
  const normalized = applyShareCap(rawWeights, targetTotal, maxShare);
  return Object.fromEntries(active.map((benchmark) => {
    const draft = drafts[benchmark.id]!;
    return [benchmark.id, { ...draft, weight: normalized[benchmark.id] ?? 0 }];
  }));
}

export function weightMap(weights: Record<string, BenchmarkWeight>): Record<string, number> {
  return Object.fromEntries(Object.values(weights).map((entry) => [entry.benchmarkId, entry.weight]));
}
