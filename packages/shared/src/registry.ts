import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { AliasResolver } from "./aliases.js";
import { BenchmarkSchema, type Benchmark } from "./schemas/benchmark.js";
import { IndexConfigSchema, type IndexConfig } from "./schemas/index-config.js";
import { ModelSchema, type Model } from "./schemas/model.js";
import { ResultFileSchema, ResultSchema, SpeedFileSchema, type Result } from "./schemas/result.js";
import { SourceSchema, type Source } from "./schemas/source.js";

export class RegistryValidationError extends Error {
  constructor(public readonly filename: string, public readonly cause: unknown) {
    const detail = cause instanceof z.ZodError ? cause.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") : String(cause);
    super(`Invalid registry file ${filename}: ${detail}`);
    this.name = "RegistryValidationError";
  }
}

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export async function readYamlFile<TSchema extends z.ZodTypeAny>(filename: string, schema: TSchema): Promise<z.output<TSchema>> {
  try {
    const contents = await readFile(filename, "utf8");
    return schema.parse(parse(contents));
  } catch (error) {
    throw new RegistryValidationError(filename, error);
  }
}

async function readRegistryDirectory<TSchema extends z.ZodTypeAny>(directory: string, schema: TSchema): Promise<Array<z.output<TSchema>>> {
  const files = await yamlFiles(directory);
  return Promise.all(files.map((filename) => readYamlFile(filename, schema)));
}

function assertUniqueIds(kind: string, entries: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error(`Duplicate ${kind} id: ${entry.id}`);
    seen.add(entry.id);
  }
}

function assertReferences(
  models: readonly Model[],
  benchmarks: readonly Benchmark[],
  sources: readonly Source[],
  config: IndexConfig,
  results: readonly Result[],
  manualSpeed: z.output<typeof SpeedFileSchema>,
): void {
  const modelIds = new Set(models.map(({ id }) => id));
  const benchmarkIds = new Set(benchmarks.map(({ id }) => id));
  const benchmarksById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const sourceIds = new Set(sources.map(({ id }) => id));
  const protocolIds = new Set<string>();

  for (const benchmark of benchmarks) {
    for (const sourceId of benchmark.source_ids) {
      if (!sourceIds.has(sourceId)) throw new Error(`Benchmark ${benchmark.id} references unknown source ${sourceId}`);
    }
    if (benchmark.status === "active") {
      const missing = [
        ["grader_version", benchmark.grader_version],
        ["family_id", benchmark.family_id],
        ["domains", benchmark.domains],
        ["obs_type", benchmark.obs_type],
        ["public_release_date", benchmark.public_release_date],
        ["tool_policy", benchmark.tool_policy],
      ].filter(([, value]) => value === undefined);
      if (benchmark.metadata_sources.length === 0) missing.push(["metadata_sources", undefined]);
      if (benchmark.obs_type === "count" && benchmark.default_k === undefined) missing.push(["default_k", undefined]);
      if (missing.length) {
        throw new Error(`Active benchmark ${benchmark.id} is missing ACI 1.2 admission metadata: ${missing.map(([field]) => field).join(", ")}`);
      }
    }
  }
  for (const source of sources) {
    for (const protocol of source.protocols ?? []) {
      if (protocolIds.has(protocol.protocol_id)) throw new Error(`Duplicate source protocol id: ${protocol.protocol_id}`);
      protocolIds.add(protocol.protocol_id);
      for (const benchmarkId of protocol.benchmark_ids) {
        if (!benchmarkIds.has(benchmarkId)) throw new Error(`Source protocol ${protocol.protocol_id} references unknown benchmark ${benchmarkId}`);
      }
      for (const benchmarkId of [...Object.keys(protocol.benchmark_versions), ...Object.keys(protocol.grader_versions)]) {
        if (!protocol.benchmark_ids.includes(benchmarkId)) {
          throw new Error(`Source protocol ${protocol.protocol_id} declares a version for undeclared benchmark ${benchmarkId}`);
        }
      }
      for (const modelId of protocol.model_ids ?? []) {
        if (!modelIds.has(modelId)) throw new Error(`Source protocol ${protocol.protocol_id} references unknown model ${modelId}`);
      }
    }
    for (const benchmarkId of source.redistributable_benchmark_ids ?? []) {
      const benchmark = benchmarksById.get(benchmarkId);
      if (!benchmark) {
        throw new Error(`Source ${source.id} allows redistribution for unknown benchmark ${benchmarkId}`);
      }
      if (!benchmark.source_ids.includes(source.id)) {
        throw new Error(`Source ${source.id} allows redistribution for benchmark ${benchmarkId}, which does not declare that source`);
      }
    }
    for (const benchmarkId of source.runner_benchmark_ids ?? []) {
      const benchmark = benchmarksById.get(benchmarkId);
      if (!benchmark) throw new Error(`Source ${source.id} runs unknown benchmark ${benchmarkId}`);
      if (!benchmark.source_ids.includes(source.id)) {
        throw new Error(`Source ${source.id} runs benchmark ${benchmarkId}, which does not declare that source`);
      }
    }
  }
  for (const benchmark of benchmarks.filter((entry) => entry.status === "active")) {
    const hasProtocol = sources.some((source) => source.protocols?.some((protocol) => protocol.benchmark_ids.includes(benchmark.id)));
    if (!hasProtocol) throw new Error(`Active benchmark ${benchmark.id} has no declared source protocol`);
  }
  if (config.reference_benchmark) {
    if (!benchmarkIds.has(config.reference_benchmark)) {
      throw new Error(`ACI reference benchmark ${config.reference_benchmark} is unknown`);
    }
    const declaredReferences = benchmarks.filter((benchmark) => benchmark.is_reference).map((benchmark) => benchmark.id);
    if (declaredReferences.length > 0 && (declaredReferences.length !== 1 || declaredReferences[0] !== config.reference_benchmark)) {
      throw new Error(`ACI reference declaration must identify only ${config.reference_benchmark}; found ${declaredReferences.join(", ") || "none"}`);
    }
  }
  for (const systemId of config.calibration_panel) {
    const separatorIndex = systemId.lastIndexOf("@");
    const modelId = separatorIndex >= 0 ? systemId.slice(0, separatorIndex) : systemId;
    const profile = separatorIndex >= 0 ? systemId.slice(separatorIndex + 1) : "";
    if (!modelId || !modelIds.has(modelId)) throw new Error(`Calibration panel references unknown model ${modelId ?? systemId}`);
    if (config.method_version === "1.2.2") {
      if (profile !== "max-common" && profile !== "std-common" && profile !== "std" && profile !== "max") {
        throw new Error(`Calibration panel system ${systemId} must use an allowed class`);
      }
    } else if (profile !== "std") {
      throw new Error(`Calibration panel system ${systemId} must use the std profile`);
    }
  }
  for (const [profileName, profile] of Object.entries(config.profiles)) {
    for (const [domain, basket] of Object.entries(profile.baskets)) {
      for (const benchmarkId of basket) {
        if (!benchmarkIds.has(benchmarkId)) throw new Error(`Profile ${profileName}/${domain} references unknown benchmark ${benchmarkId}`);
      }
    }
  }
  for (const result of results) {
    if (!modelIds.has(result.model_id)) throw new Error(`Result references unknown model ${result.model_id}`);
    if (!benchmarkIds.has(result.benchmark_id)) throw new Error(`Result references unknown benchmark ${result.benchmark_id}`);
    if (!sourceIds.has(result.source_id)) throw new Error(`Result references unknown source ${result.source_id}`);
  }
  for (const observation of manualSpeed.observations) {
    if (!modelIds.has(observation.model_id)) throw new Error(`Speed observation references unknown model ${observation.model_id}`);
  }
}

export interface Registry {
  dataDir: string;
  models: Model[];
  benchmarks: Benchmark[];
  sources: Source[];
  results: Result[];
  indexConfig: IndexConfig;
  /** Deliberately isolated and never part of redistributable snapshots. */
  manualSpeed: z.output<typeof SpeedFileSchema>;
  modelAliases: AliasResolver<Model>;
  benchmarkAliases: AliasResolver<Benchmark>;
}

export interface LoadRegistryOptions {
  includeManualResults?: boolean;
}

export async function loadRegistry(dataDir: string, options: LoadRegistryOptions = {}): Promise<Registry> {
  const [models, benchmarks, sources, indexConfig, manualSpeed] = await Promise.all([
    readRegistryDirectory(path.join(dataDir, "models"), ModelSchema),
    readRegistryDirectory(path.join(dataDir, "benchmarks"), BenchmarkSchema),
    readRegistryDirectory(path.join(dataDir, "sources"), SourceSchema),
    readYamlFile(path.join(dataDir, "index-config.yaml"), IndexConfigSchema),
    readYamlFile(path.join(dataDir, "manual", "speed-aa.yaml"), SpeedFileSchema),
  ]);

  const results: Result[] = [];
  if (options.includeManualResults ?? true) {
    const files = await yamlFiles(path.join(dataDir, "manual", "results"));
    for (const filename of files) {
      const parsed = parse(await readFile(filename, "utf8")) as unknown;
      try {
        if (Array.isArray(parsed)) results.push(...z.array(ResultSchema).parse(parsed));
        else if (parsed && typeof parsed === "object" && "results" in parsed) results.push(...ResultFileSchema.parse(parsed).results);
        else results.push(ResultSchema.parse(parsed));
      } catch (error) {
        throw new RegistryValidationError(filename, error);
      }
    }
  }

  assertUniqueIds("model", models);
  assertUniqueIds("benchmark", benchmarks);
  assertUniqueIds("source", sources);
  assertReferences(models, benchmarks, sources, indexConfig, results, manualSpeed);

  return {
    dataDir,
    models,
    benchmarks,
    sources,
    results,
    indexConfig,
    manualSpeed,
    modelAliases: new AliasResolver<Model>(models),
    benchmarkAliases: new AliasResolver<Benchmark>(benchmarks),
  };
}
