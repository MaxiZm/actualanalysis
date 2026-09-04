import type {
  BenchmarkDefinition,
  BootstrapResult,
  CoverageResult,
  ModelDefinition,
  PreparedCell,
  ProvisionalEstimate,
} from "./types.js";

export interface CoverageOptions {
  minBenchmarks?: number;
  minCategories?: number;
  benchmarkWeights?: Record<string, number>;
}

function benchmarkCategories(benchmark: BenchmarkDefinition): string[] {
  if (benchmark.categories !== undefined && benchmark.categories.length > 0) return benchmark.categories;
  if (benchmark.category !== undefined) return [benchmark.category];
  return [];
}

export function computeCoverage(
  cells: readonly PreparedCell[],
  benchmarks: readonly BenchmarkDefinition[],
  modelIds: readonly string[],
  options: CoverageOptions = {},
): Record<string, CoverageResult> {
  const minBenchmarks = options.minBenchmarks ?? 4;
  const minCategories = options.minCategories ?? 2;
  const benchmarkById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const totalBenchmarks = benchmarks.filter((benchmark) => (options.benchmarkWeights?.[benchmark.id] ?? 1) > 0).length;
  const result: Record<string, CoverageResult> = {};
  for (const modelId of modelIds) {
    const ids = new Set(
      cells
        .filter(
          (cell) =>
            cell.modelId === modelId &&
            cell.weightMultiplier > 0 &&
            (options.benchmarkWeights?.[cell.benchmarkId] ?? 1) > 0,
        )
        .map((cell) => cell.benchmarkId),
    );
    const categories = new Set<string>();
    let privateCount = 0;
    for (const benchmarkId of ids) {
      const benchmark = benchmarkById.get(benchmarkId);
      if (benchmark === undefined) continue;
      benchmarkCategories(benchmark).forEach((category) => categories.add(category));
      if (benchmark.holdout === "private" || benchmark.holdout === "rolling") privateCount += 1;
    }
    const benchmarkCount = ids.size;
    const categoryCount = categories.size;
    result[modelId] = {
      modelId,
      benchmarkCount,
      categoryCount,
      privateCount,
      coverage: totalBenchmarks === 0 ? 0 : benchmarkCount / totalBenchmarks,
      provisional: benchmarkCount < minBenchmarks || categoryCount < minCategories,
    };
  }
  return result;
}

export interface ProvisionalShrinkageOptions {
  priorStrength?: number;
  anchorModelIds?: string[];
  ciMultiplier?: number;
}

export function applyProvisionalShrinkage(
  capabilities: Record<string, number>,
  coverage: Record<string, CoverageResult>,
  models: readonly ModelDefinition[],
  bootstrap: BootstrapResult,
  options: ProvisionalShrinkageOptions = {},
): Record<string, ProvisionalEstimate> {
  void coverage;
  void models;
  void options;

  const estimates: Record<string, ProvisionalEstimate> = {};
  for (const [modelId, originalScore] of Object.entries(capabilities)) {
    const summary = bootstrap.models[modelId];
    estimates[modelId] = {
      modelId,
      score: originalScore,
      ciLow: summary?.ciLow ?? null,
      ciHigh: summary?.ciHigh ?? null,
      shrinkageWeight: 1,
      priorMean: originalScore,
    };
  }
  return estimates;
}
