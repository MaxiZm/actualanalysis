import type {
  AnchorDefinition,
  BenchmarkDefinition,
  BenchmarkTransform,
  HoldoutKind,
  IndexKind,
  ModelDefinition,
  ProvenanceKind,
  RawScoreResult,
  ScoringInput,
} from "./types.js";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function stringValue(record: Record<string, unknown>, keys: string[], label: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(`${label} must be a non-empty string`);
}

function optionalString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function optionalNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function optionalBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function coerceTransform(record: Record<string, unknown>, benchmarkId: string): BenchmarkTransform {
  const raw = record.transform;
  const transform = typeof raw === "string" ? { kind: raw } : asRecord(raw ?? { kind: "accuracy" }, `transform for ${benchmarkId}`);
  const declaredKind = stringValue(transform, ["kind", "type"], `transform kind for ${benchmarkId}`);
  const kind =
    declaredKind === "metr_horizon"
      ? "metr"
      : declaredKind === "log_relative"
        ? "vending"
        : declaredKind;
  const epsilon = optionalNumber(transform, ["epsilon"]);
  if (kind === "accuracy") {
    const inputScale = optionalString(transform, ["inputScale", "input_scale", "scale"]);
    const chanceLevel =
      optionalNumber(transform, ["chanceLevel", "chance_level"]) ??
      optionalNumber(record, ["chanceLevel", "chance_level"]);
    return {
      kind,
      ...(inputScale === "percent" || inputScale === "fraction" ? { inputScale } : {}),
      ...(chanceLevel === undefined ? {} : { chanceLevel }),
      ...(epsilon === undefined ? {} : { epsilon }),
    };
  }
  if (kind === "elo") {
    const eloRef = optionalNumber(transform, ["eloRef", "elo_ref", "reference", "reference_elo"]);
    if (eloRef === undefined) throw new Error(`eloRef is required for ${benchmarkId}`);
    const scale = optionalNumber(transform, ["scale"]);
    return {
      kind,
      eloRef,
      ...(scale === undefined ? {} : { scale }),
      ...(epsilon === undefined ? {} : { epsilon }),
    };
  }
  if (kind === "metr") {
    const center = optionalNumber(transform, [
      "centerLog2Minutes",
      "center_log2_minutes",
      "midpoint_log2_minutes",
      "center",
    ]);
    const scale = optionalNumber(transform, ["scale"]);
    const declaredUnit = optionalString(transform, ["inputUnit", "input_unit"]);
    return {
      kind,
      ...(declaredUnit === "minutes" || declaredUnit === "hours" ? { inputUnit: declaredUnit } : {}),
      ...(center === undefined ? {} : { centerLog2Minutes: center }),
      ...(scale === undefined ? {} : { scale }),
      ...(epsilon === undefined ? {} : { epsilon }),
    };
  }
  if (kind === "vending") {
    const mode =
      declaredKind === "log_relative" ? "logistic_ratio" : optionalString(transform, ["mode"]);
    const humanBaseline = optionalNumber(transform, [
      "humanBaseline",
      "human_baseline",
      "reference_value",
    ]);
    if (humanBaseline === undefined) throw new Error(`humanBaseline is required for ${benchmarkId}`);
    const floor = optionalNumber(transform, ["floor"]);
    const logScale = optionalNumber(transform, ["logScale", "log_scale", "scale"]);
    const logBase = optionalNumber(transform, ["logBase", "log_base", "base"]);
    return {
      kind,
      humanBaseline,
      ...(floor === undefined ? {} : { floor }),
      ...(mode === "fraction_of_human" || mode === "logistic_ratio" ? { mode } : {}),
      ...(logScale === undefined ? {} : { logScale }),
      ...(logBase === undefined ? {} : { logBase }),
      ...(epsilon === undefined ? {} : { epsilon }),
    };
  }
  throw new Error(`Unsupported transform ${kind} for ${benchmarkId}`);
}

function coerceBenchmark(value: unknown, index: number): BenchmarkDefinition {
  const record = asRecord(value, `benchmarks[${index}]`);
  const id = stringValue(record, ["id", "slug"], `benchmark id at index ${index}`);
  const tags = asArray(record.tags ?? [], `tags for ${id}`).filter(
    (tag): tag is string => typeof tag === "string",
  );
  const rawHoldout = stringValue(record, ["holdout"], `holdout for ${id}`).replaceAll("-", "_");
  if (!["public", "semi_private", "private", "rolling"].includes(rawHoldout)) {
    throw new Error(`Unsupported holdout ${rawHoldout} for ${id}`);
  }
  const independentSourcesValue = record.independentSources ?? record.independent_sources;
  const independentSources =
    typeof independentSourcesValue === "number"
      ? independentSourcesValue
      : Array.isArray(independentSourcesValue)
        ? independentSourcesValue.filter((item): item is string => typeof item === "string")
        : undefined;
  const name = optionalString(record, ["name"]);
  const nItems = optionalNumber(record, ["nItems", "n_items"]);
  const category = optionalString(record, ["category"]);
  const sourceIds = Array.isArray(record.source_ids)
    ? record.source_ids.filter((item): item is string => typeof item === "string")
    : undefined;
  const status = optionalString(record, ["status"]);
  const weightCap = optionalNumber(record, ["weightCap", "weight_cap"]);
  return {
    id,
    ...(name === undefined ? {} : { name }),
    tags,
    holdout: rawHoldout as HoldoutKind,
    transform: coerceTransform(record, id),
    ...(nItems === undefined ? {} : { nItems }),
    ...(category === undefined ? {} : { category }),
    ...(Array.isArray(record.categories)
      ? { categories: record.categories.filter((item): item is string => typeof item === "string") }
      : {}),
    ...(independentSources === undefined ? {} : { independentSources }),
    ...(sourceIds === undefined ? {} : { sourceIds }),
    ...(status === "active" || status === "watchlist" || status === "conditional" ? { status } : {}),
    ...(weightCap === undefined ? {} : { weightCap }),
    ...(typeof record.reference === "boolean" ? { reference: record.reference } : {}),
  };
}

function coerceResult(value: unknown, index: number): RawScoreResult {
  const record = asRecord(value, `results[${index}]`);
  const sourceValue = record.source;
  const source =
    sourceValue !== null && typeof sourceValue === "object" && !Array.isArray(sourceValue)
      ? asRecord(sourceValue, `source for result ${index}`)
      : record;
  const hasNestedSource = source !== record;
  const sourceKind =
    optionalString(source, ["kind", "sourceKind", "source_kind", "provenance"]) ??
    optionalString(record, ["sourceKind", "source_kind", "provenance"]) ??
    "manual";
  const validKinds = ["independent", "runner", "scrape", "mirror", "self_report", "manual"];
  if (!validKinds.includes(sourceKind)) throw new Error(`Unsupported source kind ${sourceKind}`);
  const score = optionalNumber(record, ["score", "performance", "value"]);
  if (score === undefined) throw new Error(`score is required for result ${index}`);
  const id = optionalString(record, ["id"]);
  const se = optionalNumber(record, ["se", "standardError", "standard_error"]);
  const nItems = optionalNumber(record, ["nItems", "n_items"]);
  const independent = optionalBoolean(source, ["independent"]);
  const observedOn =
    optionalString(source, ["observedOn", "observed_on"]) ??
    optionalString(record, ["observedOn", "observed_on"]);
  const scoreUnit = optionalString(record, ["scoreUnit", "score_unit"]);
  const validScoreUnits = ["fraction", "percent", "elo", "minutes", "hours", "currency", "raw"];
  if (scoreUnit !== undefined && !validScoreUnits.includes(scoreUnit)) {
    throw new Error(`Unsupported score unit ${scoreUnit}`);
  }
  const seOnNormalizedScale = optionalBoolean(record, [
    "seOnNormalizedScale",
    "se_on_normalized_scale",
  ]);
  const family = optionalString(record, ["family"]);
  return {
    ...(id === undefined ? {} : { id }),
    modelId: stringValue(record, ["modelId", "model_id"], `model id for result ${index}`),
    benchmarkId: stringValue(
      record,
      ["benchmarkId", "benchmark_id"],
      `benchmark id for result ${index}`,
    ),
    source: {
      id:
        optionalString(source, hasNestedSource ? ["id", "sourceId", "source_id"] : ["sourceId", "source_id"]) ??
        optionalString(record, ["sourceId", "source_id"]) ??
        `source-${index}`,
      kind: sourceKind as ProvenanceKind,
      ...(independent === undefined ? {} : { independent }),
      ...(observedOn === undefined ? {} : { observedOn }),
    },
    score,
    ...(scoreUnit === undefined
      ? {}
      : { scoreUnit: scoreUnit as NonNullable<RawScoreResult["scoreUnit"]> }),
    ...(se === undefined ? {} : { se }),
    ...(seOnNormalizedScale === undefined ? {} : { seOnNormalizedScale }),
    ...(nItems === undefined ? {} : { nItems }),
    ...(record.config === undefined ? {} : { config: record.config }),
    ...(family === undefined ? {} : { family }),
  };
}

function coerceAnchors(value: unknown): AnchorDefinition[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const record = asRecord(item, `anchors[${index}]`);
      const anchorValue = optionalNumber(record, ["value", "score"]);
      if (anchorValue === undefined) throw new Error(`Anchor value is required at index ${index}`);
      return {
        modelId: stringValue(record, ["modelId", "model_id", "id"], `anchor model at index ${index}`),
        value: anchorValue,
      };
    });
  }
  const record = asRecord(value, "anchors");
  return Object.entries(record).map(([modelId, anchorValue]) => {
    if (typeof anchorValue !== "number") throw new Error(`Anchor ${modelId} must be numeric`);
    return { modelId, value: anchorValue };
  });
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstNumber(
  candidates: Array<[Record<string, unknown> | undefined, string[]]>,
): number | undefined {
  for (const [record, aliases] of candidates) {
    if (record === undefined) continue;
    const value = optionalNumber(record, aliases);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Normalize camelCase payloads or the shared package's registry/index-config
 * snake_case payloads into the self-contained scoring API.
 */
export function coerceScoringInput(value: unknown, requestedKind?: IndexKind): ScoringInput {
  const root = asRecord(value, "scoring input");
  const configRecord = asRecord(root.config, "config");
  const configuredKind =
    optionalString(configRecord, ["kind", "index"]) ?? optionalString(root, ["kind", "index"]);
  const inferredKind = requestedKind ?? configuredKind ?? (optionalRecord(configRecord.indices) ? "mixed" : undefined);
  if (inferredKind !== "mixed" && inferredKind !== "agentic" && inferredKind !== "chat") {
    throw new Error(`Unsupported or missing index kind ${String(inferredKind)}`);
  }
  const rawKind: IndexKind = inferredKind;
  const indices = optionalRecord(configRecord.indices);
  const indexDefinition = optionalRecord(indices?.[rawKind]);
  const identification = optionalRecord(configRecord.identification) ?? indexDefinition ?? configRecord;
  const regularization = optionalRecord(configRecord.regularization);
  const optimizer = optionalRecord(configRecord.optimizer);
  const bootstrap = optionalRecord(configRecord.bootstrap);
  const coverage = optionalRecord(configRecord.coverage);
  const weighting = optionalRecord(configRecord.weighting);
  const diagnostics = optionalRecord(configRecord.diagnostics);

  const models: ModelDefinition[] = Array.isArray(root.models)
    ? root.models.map((value, index) => {
        const record = asRecord(value, `models[${index}]`);
        const name = optionalString(record, ["name"]);
        const family = optionalString(record, ["family"]);
        return {
          id: stringValue(record, ["id", "slug"], `model id at index ${index}`),
          ...(name === undefined ? {} : { name }),
          ...(family === undefined ? {} : { family }),
        };
      })
    : [];

  const referenceDiscrimination = optionalNumber(identification, [
    "referenceDiscrimination",
    "reference_discrimination",
  ]);
  const referenceDifficulty = optionalNumber(identification, [
    "referenceDifficulty",
    "reference_difficulty",
  ]);
  const config: ScoringInput["config"] = {
    kind: rawKind,
    identification: {
      referenceBenchmarkId: stringValue(
        identification,
        ["referenceBenchmarkId", "reference_benchmark_id", "referenceBenchmark", "reference_benchmark"],
        "reference benchmark",
      ),
      ...(referenceDiscrimination === undefined ? {} : { referenceDiscrimination }),
      ...(referenceDifficulty === undefined ? {} : { referenceDifficulty }),
    },
    anchors: coerceAnchors(configRecord.anchors ?? indexDefinition?.anchors),
  };
  const fitMode = optionalString(configRecord, ["fitMode", "fit_mode"]);
  if (fitMode === "aci" || fitMode === "eci_compatible") config.fitMode = fitMode;

  const numericConfig: Array<[
    keyof ScoringInput["config"],
    Array<[Record<string, unknown> | undefined, string[]]>,
  ]> = [
    ["huberDelta", [[configRecord, ["huberDelta", "huber_delta", "delta"]]]],
    ["lambdaAlpha", [[configRecord, ["lambdaAlpha", "lambda_alpha"]], [regularization, ["alpha"]]]],
    [
      "lambdaCapability",
      [[configRecord, ["lambdaCapability", "lambda_capability", "lambda_c"]], [regularization, ["capability"]]],
    ],
    [
      "lambdaDifficulty",
      [[configRecord, ["lambdaDifficulty", "lambda_difficulty", "lambda_d"]], [regularization, ["difficulty"]]],
    ],
    ["learningRate", [[configRecord, ["learningRate", "learning_rate"]], [optimizer, ["learning_rate"]]]],
    ["maxIterations", [[configRecord, ["maxIterations", "max_iterations"]], [optimizer, ["max_iterations"]]]],
    ["tolerance", [[configRecord, ["tolerance"]], [optimizer, ["tolerance"]]]],
    [
      "bootstrapIterations",
      [[configRecord, ["bootstrapIterations", "bootstrap_iterations"]], [bootstrap, ["iterations"]]],
    ],
    [
      "bootstrapConfidenceLevel",
      [[configRecord, ["bootstrapConfidenceLevel", "bootstrap_confidence_level"]], [bootstrap, ["confidence"]]],
    ],
    [
      "bootstrapMinimumSuccessFraction",
      [
        [configRecord, ["bootstrapMinimumSuccessFraction", "bootstrap_minimum_success_fraction"]],
        [bootstrap, ["minimum_success_fraction"]],
      ],
    ],
    ["topModelCount", [[configRecord, ["topModelCount", "top_model_count"]]]],
    ["saturationThreshold", [[configRecord, ["saturationThreshold", "saturation_threshold"]]]],
    ["minBenchmarks", [[configRecord, ["minBenchmarks", "min_benchmarks"]], [coverage, ["min_benchmarks"]]]],
    ["minCategories", [[configRecord, ["minCategories", "min_categories"]], [coverage, ["min_categories"]]]],
    ["minLogitSe", [[configRecord, ["minLogitSe", "min_logit_se"]], [optionalRecord(configRecord.noise), ["min_logit_se"]]]],
    ["harnessVariancePrior", [[configRecord, ["harnessVariancePrior", "harness_variance_prior"]], [optionalRecord(configRecord.noise), ["harness_variance_prior"]]]],
    [
      "provisionalPriorStrength",
      [[configRecord, ["provisionalPriorStrength", "provisional_prior_strength"]]],
    ],
    ["provisionalCiMultiplier", [[configRecord, ["provisionalCiMultiplier"]], [coverage, ["provisional_ci_multiplier"]]]],
    ["maxDiscrimination", [[configRecord, ["maxDiscrimination"]], [weighting, ["max_discriminability"]]]],
    ["sourceTargetCount", [[configRecord, ["sourceTargetCount"]], [weighting, ["source_target_count"]]]],
    ["maxBenchmarkShare", [[configRecord, ["maxBenchmarkShare", "max_benchmark_share"]], [weighting, ["max_share"]]]],
    ["publicStaticFactor", [[configRecord, ["publicStaticFactor"]], [weighting, ["public_static_factor"],]]],
    ["privateRollingFactor", [[configRecord, ["privateRollingFactor"]], [weighting, ["private_rolling_factor"]]]],
    [
      "publicOutlierWeightFactor",
      [[configRecord, ["publicOutlierWeightFactor"]], [weighting, ["public_outlier_next_fit_factor"]]],
    ],
    [
      "publicOutlierZThreshold",
      [[configRecord, ["publicOutlierZThreshold"]], [diagnostics, ["hubris_z_threshold"]]],
    ],
    [
      "publicPrivateGapThreshold",
      [[configRecord, ["publicPrivateGapThreshold"]], [diagnostics, ["public_private_gap_threshold"]]],
    ],
    ["looSeMultiplier", [[configRecord, ["looSeMultiplier"]], [diagnostics, ["loo_se_multiplier"]]]],
    ["ordinalRankGap", [[configRecord, ["ordinalRankGap"]], [diagnostics, ["ordinal_rank_gap"]]]],
  ];
  for (const [key, candidates] of numericConfig) {
    const number = firstNumber(candidates);
    if (number !== undefined) (config as unknown as Record<string, unknown>)[key] = number;
  }
  const methodVersion = optionalString(configRecord, ["methodVersion", "method_version"]);
  if (methodVersion !== undefined) config.methodVersion = methodVersion;
  const bootstrapSeed =
    configRecord.bootstrapSeed ?? configRecord.bootstrap_seed ?? bootstrap?.seed;
  if (typeof bootstrapSeed === "number" || typeof bootstrapSeed === "string") {
    config.bootstrapSeed = bootstrapSeed;
  }
  const explicitWeightCaps = optionalRecord(configRecord.benchmarkWeightCaps ?? configRecord.benchmark_weight_caps);
  const weightCaps = Object.fromEntries(
    Object.entries(explicitWeightCaps ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
  const lmarenaCap = optionalNumber(weighting ?? {}, ["lmarena_cap"]);
  if (lmarenaCap !== undefined) weightCaps["lmarena-text-style-controlled"] = lmarenaCap;
  if (Object.keys(weightCaps).length > 0) config.benchmarkWeightCaps = weightCaps;

  const globalEpsilon = optionalNumber(configRecord, ["epsilon"]);
  const benchmarks = asArray(root.benchmarks, "benchmarks").map(coerceBenchmark).map((benchmark) =>
    globalEpsilon === undefined || benchmark.transform.epsilon !== undefined
      ? benchmark
      : { ...benchmark, transform: { ...benchmark.transform, epsilon: globalEpsilon } },
  );
  const rawResults = asArray(root.results ?? root.records, "results").filter((value) => {
    const record = optionalRecord(value);
    return record?.record_type !== "pricing";
  });
  return {
    benchmarks,
    results: rawResults.map(coerceResult),
    ...(Array.isArray(root.harnessResults ?? root.harness_results)
      ? { harnessResults: asArray(root.harnessResults ?? root.harness_results, "harness results").map(coerceResult) }
      : {}),
    ...(models.length === 0 ? {} : { models }),
    config,
  };
}
