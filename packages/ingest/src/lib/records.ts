import { createHash } from "node:crypto";
import type { Registry } from "@actualanalysis/shared";
import { RawResultSchema, type RawResult } from "../types.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stable(value));
}

/** Key mirrors the natural uniqueness constraints used by persistence. */
export function idempotencyKey(record: RawResult): string {
  const identity = record.record_type === "benchmark_result"
    ? {
        type: record.record_type,
        model: record.model_id ?? record.model,
        benchmark: record.benchmark_id ?? record.benchmark,
        source: record.source_id,
        config: record.config,
      }
    : {
        type: record.record_type,
        model: record.model_id ?? record.model,
        provider: record.provider,
      };
  return createHash("sha256").update(stableStringify(identity)).digest("hex");
}

export function deduplicateRecords(records: readonly RawResult[]): RawResult[] {
  const unique = new Map<string, RawResult>();
  for (const candidate of records) {
    const record = RawResultSchema.parse(candidate);
    unique.set(idempotencyKey(record), record);
  }
  return [...unique.values()].sort((left, right) => idempotencyKey(left).localeCompare(idempotencyKey(right)));
}

const provenanceRank = {
  self_report: 1,
  // `manual` describes how an observation was captured, not stronger
  // evidence. It must never outrank a mirror merely because a human entered it.
  manual: 1,
  mirror: 3,
  independent: 4,
} as const;

export interface ProvenanceSelection {
  kept: RawResult[];
  superseded: RawResult[];
}

/**
 * Applies the published evidence policy without destroying auditability: provenance
 * is resolved for the model/benchmark before any canonical configuration is chosen.
 * All records in the strongest available tier are kept; lower tiers remain available
 * for persistence and model-page display through `superseded`.
 */
export function selectPreferredResults(records: readonly RawResult[]): ProvenanceSelection {
  const passthrough = records.filter((record) => record.record_type === "pricing");
  const groups = new Map<string, Extract<RawResult, { record_type: "benchmark_result" }>[]>();
  for (const record of records) {
    if (record.record_type !== "benchmark_result") continue;
    const key = stableStringify({
      model: record.model_id ?? record.model,
      benchmark: record.benchmark_id ?? record.benchmark,
    });
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const kept: RawResult[] = [...passthrough];
  const superseded: RawResult[] = [];
  for (const group of groups.values()) {
    const best = Math.max(...group.map((record) => provenanceRank[record.provenance]));
    const strongest = group.filter((record) => provenanceRank[record.provenance] === best);
    const liveSources = new Set(strongest
      .filter((record) => typeof record.metadata.manual_file !== "string")
      .map((record) => record.source_id));
    for (const record of group) {
      if (provenanceRank[record.provenance] !== best) {
        superseded.push(record);
      } else if (typeof record.metadata.manual_file === "string" && liveSources.has(record.source_id)) {
        // A manual registry row is a fallback capture of the same upstream source,
        // not a second independent observation or a competing configuration.
        superseded.push(record);
      } else {
        kept.push(record);
      }
    }
  }
  return { kept: deduplicateRecords(kept), superseded: deduplicateRecords(superseded) };
}

export interface UnmappedName {
  kind: "model" | "benchmark";
  value: string;
  source_id: string;
  occurrences: number;
}

export interface ResolvedRecords {
  records: RawResult[];
  unmapped: UnmappedName[];
}

export function resolveRecordAliases(records: readonly RawResult[], registry: Registry): ResolvedRecords {
  const unmapped = new Map<string, UnmappedName>();
  const increment = (kind: UnmappedName["kind"], value: string, sourceId: string): void => {
    const key = `${kind}\0${sourceId}\0${value}`;
    const existing = unmapped.get(key);
    if (existing) existing.occurrences += 1;
    else unmapped.set(key, { kind, value, source_id: sourceId, occurrences: 1 });
  };

  const resolved = records.map((record): RawResult => {
    if (record.record_type === "pricing") {
      const modelId = record.model_id ?? registry.modelAliases.resolveId(record.model);
      // A provider catalog is intentionally much broader than the ranked suite.
      // Keep unmatched price rows for audit/export without turning every listing
      // into a model-registry review item.
      return RawResultSchema.parse({ ...record, ...(modelId ? { model_id: modelId } : {}) });
    }

    const benchmarkId = record.benchmark_id ?? registry.benchmarkAliases.resolveId(record.benchmark);
    if (!benchmarkId) increment("benchmark", record.benchmark, record.source_id);
    const modelId = record.model_id ?? registry.modelAliases.resolveId(record.model);
    // Only models observed on an in-suite benchmark belong in the alias queue.
    if (benchmarkId && !modelId) increment("model", record.model, record.source_id);
    return RawResultSchema.parse({
      ...record,
      ...(modelId ? { model_id: modelId } : {}),
      ...(benchmarkId ? { benchmark_id: benchmarkId } : {}),
    });
  });

  return {
    records: deduplicateRecords(resolved),
    unmapped: [...unmapped.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value)),
  };
}
