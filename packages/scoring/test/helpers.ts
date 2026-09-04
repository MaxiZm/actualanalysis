import { sigmoid } from "../src/math.js";
import type {
  BenchmarkDefinition,
  PreparedCell,
  RawScoreResult,
  ScoringInput,
} from "../src/types.js";

export function cell(
  modelId: string,
  benchmarkId: string,
  y: number,
  tau = 0.12,
): PreparedCell {
  return {
    id: `${modelId}:${benchmarkId}`,
    modelId,
    benchmarkId,
    configKey: "{}",
    p: sigmoid(y),
    y,
    tau,
    samplingVariance: tau * tau,
    harnessVariance: 0,
    provenanceTier: 3,
    keptResultIds: [`${modelId}:${benchmarkId}:runner`],
    excludedResultIds: [],
    sourceIds: [`runner-${benchmarkId}`],
    independentSourceIds: [`runner-${benchmarkId}`],
    weightMultiplier: 1,
  };
}

export const trueCapabilities: Record<string, number> = {
  m0: -1.5,
  m1: -1,
  m2: -0.5,
  m3: 0,
  m4: 0.5,
  m5: 1,
  m6: 1.5,
  m7: 2,
};

export const trueBenchmarks: Record<string, { difficulty: number; discrimination: number }> = {
  ref: { difficulty: 0, discrimination: 1 },
  coding: { difficulty: -0.4, discrimination: 0.8 },
  science: { difficulty: 0.7, discrimination: 1.4 },
  agents: { difficulty: -1, discrimination: 1.8 },
  math: { difficulty: 0.3, discrimination: 0.6 },
  knowledge: { difficulty: 0.1, discrimination: 1.1 },
};

export function syntheticCells(noise: (modelIndex: number, benchmarkIndex: number) => number = () => 0): PreparedCell[] {
  return Object.entries(trueCapabilities).flatMap(([modelId, capability], modelIndex) =>
    Object.entries(trueBenchmarks).map(([benchmarkId, benchmark], benchmarkIndex) =>
      cell(
        modelId,
        benchmarkId,
        benchmark.discrimination * (capability - benchmark.difficulty) + noise(modelIndex, benchmarkIndex),
        0.1,
      ),
    ),
  );
}

export function pipelineFixture(): ScoringInput {
  const benchmarks: BenchmarkDefinition[] = Object.keys(trueBenchmarks).map((id, index) => ({
    id,
    name: id,
    tags: index % 2 === 0 ? ["agentic", "chat"] : ["agentic"],
    holdout: index < 2 ? "public" : index === 2 ? "rolling" : "private",
    transform: { kind: "accuracy" },
    nItems: 200,
    category: index % 2 === 0 ? "reasoning" : "coding",
    independentSources: 3,
  }));
  const results: RawScoreResult[] = syntheticCells((modelIndex, benchmarkIndex) =>
    0.015 * Math.sin(modelIndex * 7 + benchmarkIndex * 3),
  ).map((prepared) => ({
    id: prepared.id,
    modelId: prepared.modelId,
    benchmarkId: prepared.benchmarkId,
    source: { id: `runner-${prepared.benchmarkId}`, kind: "runner" },
    score: prepared.p,
    se: 0.025,
    seOnNormalizedScale: true,
  }));
  return {
    benchmarks,
    results,
    models: Object.keys(trueCapabilities).map((id) => ({ id, family: id < "m4" ? "older" : "newer" })),
    config: {
      kind: "mixed",
      methodVersion: "1.2.3-test",
      identification: { referenceBenchmarkId: "ref" },
      anchors: [
        { modelId: "m0", value: 40 },
        { modelId: "m7", value: 100 },
      ],
      lambdaAlpha: 0.001,
      lambdaCapability: 0.001,
      lambdaDifficulty: 0.001,
      maxIterations: 1_500,
      tolerance: 1e-5,
      bootstrapIterations: 16,
      bootstrapSeed: "pipeline-test",
      minBenchmarks: 4,
      minCategories: 2,
    },
  };
}
