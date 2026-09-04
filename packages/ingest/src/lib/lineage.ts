import { createHash } from "node:crypto";
import type { RawBenchmarkResult, RawResult } from "../types.js";
import { stableStringify } from "./records.js";

const digest = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const isManual = (row: RawBenchmarkResult) => typeof row.metadata.manual_file === "string";
const normalized = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/[\s_-]+/g, "").trim() : value;
function effort(row: RawBenchmarkResult): unknown {
  return normalized(row.effort_tier ?? row.config.reasoning_effort ?? row.config.evaluation_profile ?? row.config.effort_tier);
}
function host(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}
function compatible(a: RawBenchmarkResult, b: RawBenchmarkResult): boolean {
  const ae = effort(a), be = effort(b);
  if (ae != null && be != null && ae !== be) return false;
  for (const key of ["benchmark_version", "grader_version", "tool_policy", "evaluation_run_id"] as const) {
    if (a[key] && b[key] && a[key] !== b[key]) return false;
  }
  // These values change the evaluation itself, unlike source bookkeeping keys.
  for (const key of ["tools", "context_bin", "needle_count", "provider_adapter", "data_subset", "metric", "dataset", "task_version"] as const) {
    if (a.config[key] != null && b.config[key] != null && stableStringify(a.config[key]) !== stableStringify(b.config[key])) return false;
  }
  if (a.harness_class && b.harness_class && a.harness_class !== "unknown" && b.harness_class !== "unknown" && a.harness_class !== b.harness_class) return false;
  return true;
}
function matchingScore(a: RawBenchmarkResult, b: RawBenchmarkResult): boolean {
  const accuracy = (r: RawBenchmarkResult) => r.score_unit === "percent" || r.score_unit === "fraction";
  if (accuracy(a) && accuracy(b)) {
    const fraction = (r: RawBenchmarkResult) => r.score_unit === "percent" ? r.score / 100 : r.score;
    // A manually transcribed display often rounds to one decimal percent.
    const tolerance = isManual(a) || isManual(b) ? 0.00051 : 1e-9;
    return Math.abs(fraction(a)-fraction(b)) <= tolerance;
  }
  return a.score_unit === b.score_unit && Math.abs(a.score-b.score) <= 1e-9;
}
function originMatches(copy: RawBenchmarkResult, origin: RawBenchmarkResult): boolean {
  if (copy.source_id === origin.source_id) return isManual(copy);
  if (copy.provenance !== "mirror") return false;
  const upstream = host(copy.metadata.origin_source);
  if (upstream && upstream === host(origin.source_url)) return true;
  // Epoch's ARC-AGI-2 export sometimes omits the source URL. ARC Prize is the
  // owner of this exact semi-private test; match only one exact native score.
  return copy.source_id === "epoch" && copy.benchmark_id === "arc-agi-2-semi-private" && origin.source_id === "arcprize";
}

function nativeLineage(row: RawBenchmarkResult): string {
  if (row.lineage_id) return row.lineage_id;
  if (row.evaluation_run_id) return `${row.source_id}:${row.evaluation_run_id}`;
  // ARC's exact model ID already encodes effort. Do not collapse low/high rows
  // that happen to receive the same score.
  const sourceEvaluation = row.config.arc_model_id ?? row.metadata.arc_model_id;
  if (typeof sourceEvaluation === "string") return `${row.source_id}:${digest({ model: row.model_id ?? row.model, benchmark: row.benchmark_id ?? row.benchmark, evaluation: sourceEvaluation })}`;
  return `${row.source_id}:${digest({ model: row.model_id ?? row.model, benchmark: row.benchmark_id ?? row.benchmark,
    config: row.config, observed_on: row.observed_on, score: row.score, unit: row.score_unit })}`;
}

/** Attach copies to one unambiguous origin observation without inventing effort.
 * Unknown-config mirrors stay separate when several native configs could match.
 * Independent evaluations from other sources are never collapsed by score alone.
 */
export function harmonizeObservationLineages(records: readonly RawResult[]): RawResult[] {
  const natives = records.filter((r): r is RawBenchmarkResult => r.record_type === "benchmark_result" && !isManual(r) && r.provenance === "independent");
  const assigned = new Map<RawBenchmarkResult, { lineage: string; host: string; copied: boolean }>();
  for (const native of natives) if (native.evaluation_run_id || native.config.arc_model_id || native.metadata.arc_model_id) {
    assigned.set(native, { lineage: nativeLineage(native), host: native.source_id, copied: false });
  }
  for (const copy of records) {
    if (copy.record_type !== "benchmark_result" || (!isManual(copy) && copy.provenance !== "mirror")) continue;
    const candidates = natives.filter(origin => origin !== copy
      && (copy.model_id ?? copy.model) === (origin.model_id ?? origin.model)
      && (copy.benchmark_id ?? copy.benchmark) === (origin.benchmark_id ?? origin.benchmark)
      && originMatches(copy, origin) && compatible(copy, origin) && matchingScore(copy, origin));
    const identities = new Set(candidates.map(nativeLineage));
    if (identities.size !== 1) continue;
    const origin = candidates.sort((a,b) => b.observed_on.localeCompare(a.observed_on))[0]!;
    const lineage = nativeLineage(origin);
    assigned.set(copy, { lineage, host: origin.source_id, copied: true });
    for (const candidate of candidates) assigned.set(candidate, { lineage, host: origin.source_id, copied: false });
  }
  return records.map(row => {
    if (row.record_type !== "benchmark_result") return row;
    const match = assigned.get(row);
    if (!match) return row;
    return { ...row, lineage_id: match.lineage, host_source: match.host,
      metadata: { ...row.metadata, source_lineage: { origin_source_id: match.host, copied: match.copied, match_policy: "unique compatible origin observation" } } };
  });
}

export function selectLineageObservations(records: readonly RawResult[]): { kept: RawResult[]; superseded: RawBenchmarkResult[] } {
  const groups = new Map<string, RawBenchmarkResult[]>();
  for (const row of records) if (row.record_type === "benchmark_result" && row.lineage_id) {
    const group = groups.get(row.lineage_id) ?? []; group.push(row); groups.set(row.lineage_id, group);
  }
  const rejected = new Set<RawBenchmarkResult>();
  const priority = (r: RawBenchmarkResult) => Number(r.source_id === r.host_source)*4 + Number(!isManual(r))*2 + Number(r.provenance === "independent");
  for (const group of groups.values()) {
    group.sort((a,b) => priority(b)-priority(a) || b.observed_on.localeCompare(a.observed_on) || stableStringify(a.config).localeCompare(stableStringify(b.config)));
    group.slice(1).forEach(row => rejected.add(row));
  }
  return { kept: records.filter(r => r.record_type !== "benchmark_result" || !rejected.has(r)), superseded: [...rejected] };
}
