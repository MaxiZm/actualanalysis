export type IndexKind = "mixed" | "agentic" | "chat";

export type BenchmarkTag = "agentic" | "chat" | (string & {});

export type HoldoutKind = "public" | "semi_private" | "private" | "rolling";

export type ProvenanceKind =
  | "independent"
  | "runner"
  | "scrape"
  | "mirror"
  | "self_report"
  | "manual";

export interface AccuracyTransform {
  kind: "accuracy";
  /** Input scores and reported standard errors are fractions unless set to percent. */
  inputScale?: "fraction" | "percent";
  chanceLevel?: number;
  epsilon?: number;
}

export interface EloTransform {
  kind: "elo";
  eloRef: number;
  scale?: number;
  epsilon?: number;
}

export interface MetrTransform {
  kind: "metr";
  inputUnit?: "minutes" | "hours";
  centerLog2Minutes?: number;
  scale?: number;
  epsilon?: number;
}

export interface VendingTransform {
  kind: "vending";
  humanBaseline: number;
  floor?: number;
  /**
   * fraction_of_human maps non-negative log1p distance from floor to the human result.
   * logistic_ratio puts the human result at p=.5 and permits scores above human.
   */
  mode?: "fraction_of_human" | "logistic_ratio";
  logScale?: number;
  logBase?: number;
  epsilon?: number;
}

export type BenchmarkTransform =
  | AccuracyTransform
  | EloTransform
  | MetrTransform
  | VendingTransform;

export interface BenchmarkDefinition {
  id: string;
  name?: string;
  tags: BenchmarkTag[];
  holdout: HoldoutKind;
  transform: BenchmarkTransform;
  nItems?: number;
  /** Explicit domain metadata used by the coverage gate. Missing metadata counts as no category. */
  category?: string;
  categories?: string[];
  independentSources?: number | string[];
  sourceIds?: string[];
  status?: "active" | "watchlist" | "conditional";
  weightCap?: number;
  reference?: boolean;
}

export interface SourceDescriptor {
  id: string;
  kind: ProvenanceKind;
  /** Override the inference from kind when a manual/scraped result is independent. */
  independent?: boolean;
  observedOn?: string;
}

export interface RawScoreResult {
  id?: string;
  modelId: string;
  benchmarkId: string;
  source: SourceDescriptor;
  score: number;
  scoreUnit?: "fraction" | "percent" | "elo" | "minutes" | "hours" | "currency" | "raw";
  /** Standard error on the raw input scale unless seOnNormalizedScale is true. */
  se?: number;
  seOnNormalizedScale?: boolean;
  nItems?: number;
  config?: unknown;
  family?: string;
}

export interface NormalizedObservation {
  result: RawScoreResult;
  p: number;
  y: number;
  normalizedSe: number;
  samplingVariance: number;
}

export interface PreparedCell {
  id: string;
  modelId: string;
  benchmarkId: string;
  configKey: string;
  p: number;
  y: number;
  /** Standard deviation on the logit scale. */
  tau: number;
  samplingVariance: number;
  harnessVariance: number;
  provenanceTier: number;
  keptResultIds: string[];
  excludedResultIds: string[];
  sourceIds: string[];
  independentSourceIds: string[];
  weightMultiplier: number;
}

export interface PreparationResult {
  cells: PreparedCell[];
  observations: NormalizedObservation[];
  harnessVariance: number;
  harnessPairCount: number;
}

export interface ModelDefinition {
  id: string;
  name?: string;
  family?: string;
}

export interface AnchorDefinition {
  modelId: string;
  value: number;
}

export interface IdentificationOptions {
  referenceBenchmarkId: string;
  referenceDiscrimination?: number;
  referenceDifficulty?: number;
}

export interface FitOptions {
  identification: IdentificationOptions;
  benchmarkWeights?: Record<string, number>;
  modelIds?: string[];
  benchmarkIds?: string[];
  lambdaAlpha?: number;
  lambdaCapability?: number;
  lambdaDifficulty?: number;
  huberDelta?: number;
  loss?: "huber" | "squared";
  /** Set false for ECI-compatible unweighted, unstandardized residuals. */
  useCellNoise?: boolean;
  learningRate?: number;
  maxIterations?: number;
  tolerance?: number;
  minIterations?: number;
  initial?: Partial<Pick<FitResult, "capabilities" | "difficulties" | "discriminations">>;
}

export interface CellFit {
  cellId: string;
  modelId: string;
  benchmarkId: string;
  y: number;
  predicted: number;
  residual: number;
  z: number;
  weight: number;
}

export interface FitResult {
  capabilities: Record<string, number>;
  difficulties: Record<string, number>;
  discriminations: Record<string, number>;
  cells: CellFit[];
  objective: number;
  iterations: number;
  converged: boolean;
  gradientNorm: number;
  maximumUpdate: number;
  referenceBenchmarkId: string;
}

export interface AnchorTransform {
  scale: number;
  offset: number;
}

export interface WeightFactors {
  discrimination: number;
  saturation: number;
  sources: number;
  privacy: number;
  categoryBalance: number;
}

export interface BenchmarkWeight {
  benchmarkId: string;
  weight: number;
  uncappedWeight: number;
  cap: number;
  factors: WeightFactors;
  topModelCount: number;
  saturatedTopModelCount: number;
  independentSourceCount: number;
  categoryShares: Record<string, number>;
}

export interface BootstrapOptions {
  iterations?: number;
  confidenceLevel?: number;
  seed?: number | string;
  anchors?: AnchorDefinition[];
  fitOptions: FitOptions;
  eligibleModelIds?: string[];
  /** Minimum valid-attempt fraction before the bootstrap is rejected. */
  minimumSuccessFraction?: number;
}

export interface ModelBootstrapSummary {
  modelId: string;
  samples: number[];
  standardError: number;
  ciLow: number | null;
  ciHigh: number | null;
  rankLow: number | null;
  rankHigh: number | null;
  /** rankCdf[r - 1] is P(rank <= r). */
  rankCdf: number[];
}

export interface BootstrapResult {
  requestedIterations: number;
  attemptedIterations: number;
  completedIterations: number;
  failedIterations: number;
  failureReasons: Record<string, number>;
  confidenceLevel: number;
  models: Record<string, ModelBootstrapSummary>;
  /** pairwise[i][j] is P(C_i > C_j). */
  pairwise: Record<string, Record<string, number>>;
  ties: string[][];
}

export type DiagnosticFlagKind =
  | "public_private_gap"
  | "loo_sensitive"
  | "public_outlier"
  | "ordinal_disagreement"
  | "provisional";

export interface DiagnosticFlag {
  kind: DiagnosticFlagKind;
  modelId: string;
  benchmarkId?: string;
  value?: number;
  threshold?: number;
  detail: string;
}

export interface PublicPrivateGap {
  modelId: string;
  publicMeanZ: number | null;
  privateMeanZ: number | null;
  gap: number | null;
  publicCount: number;
  privateCount: number;
  flagged: boolean;
}

export interface LeaveOneOutModel {
  modelId: string;
  headlineScore: number;
  robustScore: number;
  maxAbsShift: number;
  mostInfluentialBenchmarkId: string | null;
  shifts: Record<string, number>;
  flagged: boolean;
}

export interface LeaveOneOutResult {
  fits: Record<string, FitResult>;
  models: Record<string, LeaveOneOutModel>;
}

export interface MeanWinRateEntry {
  modelId: string;
  meanWinRate: number;
  benchmarksCompared: number;
  rank: number;
  cardinalRank: number | null;
  rankDifference: number | null;
  flagged: boolean;
}

export interface CoverageResult {
  modelId: string;
  benchmarkCount: number;
  categoryCount: number;
  privateCount: number;
  coverage: number;
  provisional: boolean;
}

export interface ProvisionalEstimate {
  modelId: string;
  score: number;
  ciLow: number | null;
  ciHigh: number | null;
  shrinkageWeight: number;
  priorMean: number;
}

export interface IndexScore {
  modelId: string;
  score: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  rank: number | null;
  rankLow: number | null;
  rankHigh: number | null;
  coverage: number;
  benchmarkCount: number;
  privateCount: number;
  robustScore: number;
  provisional: boolean;
  flags: DiagnosticFlag[];
}

export interface ScoringConfig {
  kind: IndexKind;
  methodVersion?: string;
  identification: IdentificationOptions;
  anchors?: AnchorDefinition[];
  huberDelta?: number;
  lambdaAlpha?: number;
  lambdaCapability?: number;
  lambdaDifficulty?: number;
  learningRate?: number;
  maxIterations?: number;
  tolerance?: number;
  bootstrapIterations?: number;
  bootstrapConfidenceLevel?: number;
  bootstrapMinimumSuccessFraction?: number;
  bootstrapSeed?: number | string;
  topModelCount?: number;
  saturationThreshold?: number;
  minBenchmarks?: number;
  minCategories?: number;
  minLogitSe?: number;
  harnessVariancePrior?: number;
  provisionalPriorStrength?: number;
  provisionalCiMultiplier?: number;
  maxDiscrimination?: number;
  sourceTargetCount?: number;
  publicStaticFactor?: number;
  privateRollingFactor?: number;
  publicOutlierWeightFactor?: number;
  publicOutlierZThreshold?: number;
  publicPrivateGapThreshold?: number;
  looSeMultiplier?: number;
  ordinalRankGap?: number;
  benchmarkWeightCaps?: Record<string, number>;
  maxBenchmarkShare?: number;
  fitMode?: "aci" | "eci_compatible";
}

export interface ScoringInput {
  benchmarks: BenchmarkDefinition[];
  results: RawScoreResult[];
  /** Pre-supersession evidence used only to estimate cross-harness variance. */
  harnessResults?: RawScoreResult[];
  models?: ModelDefinition[];
  config: ScoringConfig;
}

export interface ScoringRun {
  kind: IndexKind;
  methodVersion: string;
  harnessVariance: number;
  harnessPairCount: number;
  fit: FitResult;
  anchorTransform: AnchorTransform;
  benchmarkWeights: Record<string, BenchmarkWeight>;
  bootstrap: BootstrapResult;
  coverage: Record<string, CoverageResult>;
  publicPrivateGaps: Record<string, PublicPrivateGap>;
  leaveOneOut: LeaveOneOutResult;
  meanWinRates: Record<string, MeanWinRateEntry>;
  outlierCells: CellFit[];
  scores: IndexScore[];
  preparedCells: PreparedCell[];
}

export interface FixedCalibrationOptions {
  huberDelta?: number;
  lambdaAlpha?: number;
  lambdaDifficulty?: number;
  learningRate?: number;
  maxIterations?: number;
  tolerance?: number;
  initialDifficulty?: number;
  initialDiscrimination?: number;
}

export interface FixedCalibrationResult {
  benchmarkId: string;
  difficulty: number;
  discrimination: number;
  objective: number;
  iterations: number;
  converged: boolean;
  cells: CellFit[];
}
