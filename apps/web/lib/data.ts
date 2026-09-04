export const INDEX_KINDS = ["mixed", "agentic", "chat"] as const;

export type IndexKind = (typeof INDEX_KINDS)[number];
export type SourceKind = "independent" | "mirror" | "self-reported";

export interface IndexScore {
  score: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  rank: number | null;
  rankLow: number | null;
  rankHigh: number | null;
  coverage: number;
  robustScore: number;
  provisional: boolean;
  flags: string[];
  /** P(this model's capability > keyed model) over joint valid draws. */
  pairwise: Record<string, number>;
}

export interface PriceRecord {
  provider: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number | null;
}

export interface SpeedRecord {
  provider: string;
  tokensPerSecond: number;
  ttftSeconds: number;
  workload: string;
  observedOn?: string;
  sourceUrl?: string;
  redistributable: false;
}

export interface ModelRecord {
  id: string;
  slug: string;
  name: string;
  /** Registry aliases retained only for exact display-overlay matching. */
  aliases: string[];
  organization: string;
  family: string;
  releasedOn: string | null;
  openWeights: boolean;
  license: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  reasoning: string;
  paramsTotalB?: number | null;
  paramsActiveB?: number | null;
  modality?: string;
  sizeClass?: string;
  indexes: Partial<Record<IndexKind, IndexScore>>;
  pricing: PriceRecord[];
  speed: SpeedRecord | null;
}

export interface WeightFactors {
  discrimination: number | null;
  saturation: number | null;
  source: number | null;
  holdout: number | null;
}

export interface BenchmarkRecord {
  id: string;
  slug: string;
  name: string;
  version: string;
  tags: ("agentic" | "chat")[];
  categories: string[];
  holdout: "public" | "semi-private" | "private" | "rolling";
  nItems: number | null;
  difficulty: number | null;
  slope: number | null;
  weight: number | null;
  saturation: number | null;
  weightFactors: WeightFactors;
  categoryShares?: Record<string, number>;
  transform: string;
  harnessUrl: string | null;
  sourceNames: string[];
  description: string;
}

export interface ResultRecord {
  id: string;
  modelSlug: string;
  benchmarkSlug: string;
  rawScore: number;
  score: number;
  scoreUnit: "fraction" | "percent" | "elo" | "minutes" | "hours" | "currency" | "raw";
  predicted: number | null;
  standardError: number | null;
  residualZ: number | null;
  sourceKind: SourceKind;
  sourceName: string;
  sourceUrl: string;
  harness: string | null;
  config: Record<string, unknown>;
  nItems: number | null;
  observedOn: string;
  used: boolean;
  displayOnly?: boolean;
  sourceLicense?: string | null;
}

export interface HistoryPoint {
  modelSlug: string;
  kind: IndexKind;
  runId: string;
  createdAt: string;
  score: number;
}

export interface RunRecord {
  id: string;
  kind: IndexKind;
  methodVersion: string;
  createdAt: string;
  published: boolean;
  note: string;
}

export interface SiteData {
  status: DataStatus;
  models: ModelRecord[];
  benchmarks: BenchmarkRecord[];
  results: ResultRecord[];
  history: HistoryPoint[];
  runs: RunRecord[];
}

export interface DataStatus {
  mode: "fixture" | "snapshot";
  label: string;
  snapshotDate: string | null;
  published: boolean;
  methodVersion: string | null;
  disclaimer: string;
}

export const DATA_STATUS: DataStatus = {
  mode: "fixture" as const,
  label: "Demo fixture",
  snapshotDate: null,
  published: false,
  methodVersion: null,
  disclaimer:
    "No published snapshot is active for this response. Every numeric value is synthetic fixture data for interface and API validation; it is not a claim about any real model or benchmark.",
};

const score = (
  value: number,
  rank: number,
  coverage: number,
  spread = 3.2,
  provisional = false,
  flags: string[] = [],
): IndexScore => ({
  score: value,
  ciLow: value - spread,
  ciHigh: value + spread,
  rank,
  rankLow: Math.max(1, rank - 1),
  rankHigh: Math.min(5, rank + 1),
  coverage,
  robustScore: value - 0.8,
  provisional,
  flags,
  pairwise: {},
});

export const MODELS: ModelRecord[] = [
  {
    id: "fixture-model-orion",
    slug: "fixture-orion",
    name: "Fixture Orion",
    aliases: [],
    organization: "Demo Research",
    family: "Orion",
    releasedOn: "2026-07-18",
    openWeights: false,
    license: null,
    contextWindow: 262_144,
    maxOutput: 32_768,
    reasoning: "high",
    indexes: {
      mixed: score(118.4, 1, 0.86, 2.4),
      agentic: score(121.7, 1, 0.91, 2.8),
      chat: score(114.2, 2, 0.82, 2.7),
    },
    pricing: [
      { provider: "Demo Cloud", inputPerMillion: 4.2, outputPerMillion: 16.8, cacheReadPerMillion: 0.42 },
      { provider: "Example Gateway", inputPerMillion: 4.5, outputPerMillion: 17.1, cacheReadPerMillion: null },
    ],
    speed: { provider: "Manual fixture", tokensPerSecond: 71, ttftSeconds: 0.74, workload: "10k input", redistributable: false },
  },
  {
    id: "fixture-model-lattice",
    slug: "fixture-lattice",
    name: "Fixture Lattice",
    aliases: [],
    organization: "Open Demo Lab",
    family: "Lattice",
    releasedOn: "2026-05-02",
    openWeights: true,
    license: "Apache-2.0 (fixture label)",
    contextWindow: 131_072,
    maxOutput: 16_384,
    reasoning: "standard",
    indexes: {
      mixed: score(115.1, 2, 0.79, 3.1, false, ["public–private gap"]),
      agentic: score(116.3, 2, 0.84, 3.4),
      chat: score(113.8, 3, 0.75, 3.0),
    },
    pricing: [{ provider: "Demo Host", inputPerMillion: 0.9, outputPerMillion: 3.6, cacheReadPerMillion: 0.18 }],
    speed: { provider: "Manual fixture", tokensPerSecond: 118, ttftSeconds: 0.41, workload: "10k input", redistributable: false },
  },
  {
    id: "fixture-model-meridian",
    slug: "fixture-meridian",
    name: "Fixture Meridian",
    aliases: [],
    organization: "Demo Research",
    family: "Meridian",
    releasedOn: "2026-03-14",
    openWeights: false,
    license: null,
    contextWindow: 1_000_000,
    maxOutput: 65_536,
    reasoning: "adaptive",
    indexes: {
      mixed: score(113.8, 3, 0.88, 2.6),
      agentic: score(108.9, 4, 0.82, 3.1),
      chat: score(119.6, 1, 0.93, 2.2),
    },
    pricing: [{ provider: "Demo Cloud", inputPerMillion: 2.1, outputPerMillion: 10.5, cacheReadPerMillion: 0.21 }],
    speed: { provider: "Manual fixture", tokensPerSecond: 92, ttftSeconds: 0.52, workload: "10k input", redistributable: false },
  },
  {
    id: "fixture-model-forge",
    slug: "fixture-forge",
    name: "Fixture Forge",
    aliases: [],
    organization: "Community Compute",
    family: "Forge",
    releasedOn: "2025-12-09",
    openWeights: true,
    license: "MIT (fixture label)",
    contextWindow: 65_536,
    maxOutput: 16_384,
    reasoning: "standard",
    indexes: {
      mixed: score(108.6, 4, 0.72, 3.6, false, ["LOO sensitivity"]),
      agentic: score(112.5, 3, 0.78, 3.9),
      chat: score(104.1, 5, 0.67, 3.8),
    },
    pricing: [{ provider: "Demo Host", inputPerMillion: 0.28, outputPerMillion: 1.1, cacheReadPerMillion: null }],
    speed: { provider: "Manual fixture", tokensPerSecond: 164, ttftSeconds: 0.28, workload: "10k input", redistributable: false },
  },
  {
    id: "fixture-model-sparrow",
    slug: "fixture-sparrow",
    name: "Fixture Sparrow",
    aliases: [],
    organization: "Small Demo Co.",
    family: "Sparrow",
    releasedOn: "2026-08-22",
    openWeights: true,
    license: "Apache-2.0 (fixture label)",
    contextWindow: 32_768,
    maxOutput: 8_192,
    reasoning: "standard",
    indexes: {
      mixed: score(102.9, 5, 0.43, 7.2, true, ["provisional coverage"]),
      agentic: score(101.2, 5, 0.39, 8.4, true, ["provisional coverage"]),
      chat: score(105.4, 4, 0.48, 6.8, true, ["provisional coverage"]),
    },
    pricing: [{ provider: "Demo Host", inputPerMillion: 0.08, outputPerMillion: 0.32, cacheReadPerMillion: null }],
    speed: null,
  },
];

export const BENCHMARKS: BenchmarkRecord[] = [
  {
    id: "fixture-benchmark-terminal",
    slug: "terminal-bench-4",
    name: "Terminal-Bench 4.0",
    version: "4.0",
    tags: ["agentic"],
    categories: ["terminal-use"],
    holdout: "public",
    nItems: 66,
    difficulty: 0,
    slope: 1,
    weight: 0.42,
    saturation: 0.21,
    weightFactors: { discrimination: 0.68, saturation: 0.79, source: 0.67, holdout: 0.7 },
    transform: "Chance correction → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture independent runner", "Fixture mirror"],
    description: "Agentic terminal tasks. Parameters and results shown here are synthetic UI fixtures.",
  },
  {
    id: "fixture-benchmark-swe-rebench",
    slug: "swe-rebench",
    name: "SWE-rebench",
    version: "rolling",
    tags: ["agentic"],
    categories: ["software-engineering"],
    holdout: "rolling",
    nItems: 300,
    difficulty: 0.44,
    slope: 1.36,
    weight: 0.83,
    saturation: 0.08,
    weightFactors: { discrimination: 0.82, saturation: 0.92, source: 0.67, holdout: 1 },
    transform: "Chance correction → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture independent runner"],
    description: "Rolling decontaminated software-engineering tasks. Values are synthetic fixtures.",
  },
  {
    id: "fixture-benchmark-osworld",
    slug: "osworld-2",
    name: "OSWorld 2.0",
    version: "2.0",
    tags: ["agentic"],
    categories: ["computer-use"],
    holdout: "public",
    nItems: 369,
    difficulty: 0.82,
    slope: 1.18,
    weight: 0.51,
    saturation: 0.17,
    weightFactors: { discrimination: 0.74, saturation: 0.83, source: 1, holdout: 0.7 },
    transform: "Chance correction → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture mirror"],
    description: "Computer-use tasks in desktop environments. Values are synthetic fixtures.",
  },
  {
    id: "fixture-benchmark-arc",
    slug: "arc-agi-3",
    name: "ARC-AGI-3",
    version: "3",
    tags: ["agentic", "chat"],
    categories: ["abstract-reasoning", "tool-use"],
    holdout: "private",
    nItems: 120,
    difficulty: 1.74,
    slope: 1.62,
    weight: 0.96,
    saturation: 0.03,
    weightFactors: { discrimination: 0.95, saturation: 0.97, source: 1, holdout: 1 },
    transform: "Chance correction → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture independent runner"],
    description: "Interactive abstract-reasoning environments. Values are synthetic fixtures.",
  },
  {
    id: "fixture-benchmark-hle",
    slug: "hle-no-tools",
    name: "Humanity’s Last Exam",
    version: "verified, no tools",
    tags: ["chat"],
    categories: ["knowledge", "reasoning"],
    holdout: "private",
    nItems: 2_500,
    difficulty: 1.21,
    slope: 1.48,
    weight: 0.89,
    saturation: 0.05,
    weightFactors: { discrimination: 0.91, saturation: 0.95, source: 1, holdout: 1 },
    transform: "Chance correction → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture independent runner", "Fixture mirror"],
    description: "Broad expert-level knowledge without tool use. Values are synthetic fixtures.",
  },
  {
    id: "fixture-benchmark-matharena",
    slug: "matharena-composite",
    name: "MathArena composite",
    version: "rolling",
    tags: ["chat"],
    categories: ["mathematics"],
    holdout: "rolling",
    nItems: 180,
    difficulty: 0.96,
    slope: 1.25,
    weight: 0.76,
    saturation: 0.1,
    weightFactors: { discrimination: 0.78, saturation: 0.9, source: 1, holdout: 1 },
    transform: "Expected performance → clipped logit",
    harnessUrl: null,
    sourceNames: ["Fixture self-report", "Fixture independent runner"],
    description: "Fresh competition-math results. Values are synthetic fixtures.",
  },
];

const resultSeeds = [
  ["fixture-orion", "terminal-bench-4", 0.68, 0.64, 0.025, 0.72, "independent"],
  ["fixture-orion", "swe-rebench", 0.61, 0.58, 0.021, 0.66, "mirror"],
  ["fixture-orion", "arc-agi-3", 0.34, 0.31, 0.018, 0.58, "independent"],
  ["fixture-orion", "hle-no-tools", 0.39, 0.42, 0.012, -0.63, "independent"],
  ["fixture-lattice", "terminal-bench-4", 0.62, 0.59, 0.027, 0.54, "self-reported"],
  ["fixture-lattice", "swe-rebench", 0.57, 0.54, 0.022, 0.61, "independent"],
  ["fixture-lattice", "osworld-2", 0.52, 0.48, 0.026, 0.82, "mirror"],
  ["fixture-lattice", "hle-no-tools", 0.37, 0.39, 0.013, -0.41, "independent"],
  ["fixture-meridian", "arc-agi-3", 0.36, 0.34, 0.019, 0.43, "independent"],
  ["fixture-meridian", "hle-no-tools", 0.46, 0.43, 0.014, 0.62, "mirror"],
  ["fixture-meridian", "matharena-composite", 0.72, 0.67, 0.024, 1.01, "self-reported"],
  ["fixture-meridian", "osworld-2", 0.43, 0.46, 0.025, -0.64, "independent"],
  ["fixture-forge", "terminal-bench-4", 0.59, 0.54, 0.028, 0.91, "independent"],
  ["fixture-forge", "swe-rebench", 0.56, 0.49, 0.023, 1.42, "self-reported"],
  ["fixture-forge", "arc-agi-3", 0.26, 0.29, 0.018, -0.62, "mirror"],
  ["fixture-sparrow", "hle-no-tools", 0.31, 0.33, 0.015, -0.39, "self-reported"],
  ["fixture-sparrow", "matharena-composite", 0.55, 0.51, 0.027, 0.73, "self-reported"],
] as const satisfies readonly (readonly [string, string, number, number, number, number, SourceKind])[];

export const RESULTS: ResultRecord[] = resultSeeds.map((seed, index) => ({
  id: `fixture-result-${index + 1}`,
  modelSlug: seed[0],
  benchmarkSlug: seed[1],
  rawScore: seed[2],
  score: seed[2],
  scoreUnit: "fraction",
  predicted: seed[3],
  standardError: seed[4],
  residualZ: seed[5],
  sourceKind: seed[6],
  sourceName: `Fixture ${seed[6]} source`,
  sourceUrl: `https://example.com/fixture-result-${index + 1}`,
  harness: "Synthetic fixture harness",
  config: { fixture: true },
  nItems: 100,
  observedOn: `2026-0${(index % 8) + 1}-15`,
  used: true,
}));

export const HISTORY: HistoryPoint[] = MODELS.flatMap((model, modelIndex) =>
  INDEX_KINDS.flatMap((kind) => {
    const current = model.indexes[kind]?.score;
    if (current === undefined || current === null) return [];
    return [
      { modelSlug: model.slug, kind, runId: `fixture-${kind}-001`, createdAt: "2026-06-01T00:00:00.000Z", score: current - 2.4 - modelIndex * 0.1 },
      { modelSlug: model.slug, kind, runId: `fixture-${kind}-002`, createdAt: "2026-07-01T00:00:00.000Z", score: current - 1.1 },
      { modelSlug: model.slug, kind, runId: `fixture-${kind}-003`, createdAt: "2026-08-01T00:00:00.000Z", score: current },
    ];
  }),
);

export const RUNS: RunRecord[] = INDEX_KINDS.flatMap((kind) =>
  ["001", "002", "003"].map((sequence, index) => ({
    id: `fixture-${kind}-${sequence}`,
    kind,
    methodVersion: "demo-fixture",
    createdAt: `2026-0${index + 6}-01T00:00:00.000Z`,
    published: false,
    note: "Synthetic run retained only to exercise history views.",
  })),
);

export const FIXTURE_SITE_DATA: SiteData = {
  status: DATA_STATUS,
  models: MODELS,
  benchmarks: BENCHMARKS,
  results: RESULTS,
  history: HISTORY,
  runs: RUNS,
};

export function isIndexKind(value: string): value is IndexKind {
  return INDEX_KINDS.includes(value as IndexKind);
}

export function getModel(slug: string, models: readonly ModelRecord[] = MODELS): ModelRecord | undefined {
  return models.find((model) => model.slug === slug);
}

export function getBenchmark(
  slug: string,
  benchmarks: readonly BenchmarkRecord[] = BENCHMARKS,
): BenchmarkRecord | undefined {
  return benchmarks.find((benchmark) => benchmark.slug === slug);
}

export function compareIndexRank(left: ModelRecord, right: ModelRecord, kind: IndexKind): number {
  const leftIndex = left.indexes[kind];
  const rightIndex = right.indexes[kind];
  if (!leftIndex) return rightIndex ? 1 : 0;
  if (!rightIndex) return -1;
  return (leftIndex.rank ?? Number.MAX_SAFE_INTEGER)
    - (rightIndex.rank ?? Number.MAX_SAFE_INTEGER)
    || (rightIndex.score ?? Number.NEGATIVE_INFINITY) - (leftIndex.score ?? Number.NEGATIVE_INFINITY);
}

export function getLeaderboard(kind: IndexKind, models: readonly ModelRecord[] = MODELS): ModelRecord[] {
  return models.filter((model) => model.indexes[kind] !== undefined)
    .sort((left, right) => compareIndexRank(left, right, kind));
}

export function getStatisticalTieLabels(
  kind: IndexKind,
  models: readonly ModelRecord[] = MODELS,
): Record<string, string[]> {
  const sorted = getLeaderboard(kind, models);
  const ties: Record<string, string[]> = {};
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const higher = sorted[index];
    const lower = sorted[index + 1];
    if (!higher || !lower) continue;
    const probability = higher.indexes[kind]?.pairwise[lower.id];
    if (probability === undefined || probability >= 0.9) continue;
    (ties[higher.id] ??= []).push(lower.name);
    (ties[lower.id] ??= []).push(higher.name);
  }
  return ties;
}

export function getResultsForModel(
  slug: string,
  results: readonly ResultRecord[] = RESULTS,
): ResultRecord[] {
  return results.filter((result) => result.modelSlug === slug);
}

export function getResultsForBenchmark(
  slug: string,
  results: readonly ResultRecord[] = RESULTS,
): ResultRecord[] {
  return results.filter((result) => result.benchmarkSlug === slug).sort((a, b) => b.score - a.score);
}

export function blendedPrice(model: ModelRecord): number | null {
  const price = model.pricing[0];
  if (!price) return null;
  return (price.inputPerMillion * 3 + price.outputPerMillion) / 4;
}

export function cacheAwarePrice(model: ModelRecord): number | null {
  const price = model.pricing[0];
  if (!price) return null;
  const cache = price.cacheReadPerMillion ?? price.inputPerMillion;
  return (cache * 7 + price.inputPerMillion * 2 + price.outputPerMillion) / 10;
}

export function dataEnvelope<T>(data: T, status: DataStatus = DATA_STATUS) {
  return {
    meta: {
      status: status.mode,
      published: status.published,
      snapshotDate: status.snapshotDate,
      disclaimer: status.disclaimer,
      license: status.published
        ? "Mixed; inspect source-level license and redistributable fields"
        : "CC-BY-4.0 applies to published snapshots; this payload is synthetic fixture data.",
    },
    data,
  };
}

export function fixtureEnvelope<T>(data: T) {
  return dataEnvelope(data);
}
