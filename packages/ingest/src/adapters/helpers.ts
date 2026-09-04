import { parse as parseYaml } from "yaml";
import { RawBenchmarkResultSchema, type AdapterContext, type RawBenchmarkResult } from "../types.js";
import { parseCsv, rowsFromUnknown, type TabularRow } from "../lib/tabular.js";

export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseTabularPayload(text: string, url = ""): TabularRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (url.endsWith(".csv") || (!trimmed.startsWith("{") && !trimmed.startsWith("[") && /,/.test(trimmed.split(/\r?\n/, 1)[0] ?? ""))) {
    return parseCsv(trimmed);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return rowsFromUnknown(JSON.parse(trimmed) as unknown);
  return rowsFromUnknown(parseYaml(trimmed) as unknown);
}

export function percentAwareScore(value: number, rawValue?: unknown): { score: number; score_unit: "fraction" | "percent" } {
  const percentMarked = typeof rawValue === "string" && rawValue.includes("%");
  return percentMarked || value > 1 ? { score: value, score_unit: "percent" } : { score: value, score_unit: "fraction" };
}

export function benchmarkResult(input: zInput): RawBenchmarkResult {
  return RawBenchmarkResultSchema.parse({
    record_type: "benchmark_result",
    config: {},
    metadata: {},
    ...input,
  });
}

type zInput = Omit<RawBenchmarkResult, "record_type" | "config" | "metadata"> & {
  config?: RawBenchmarkResult["config"];
  metadata?: RawBenchmarkResult["metadata"];
};

export function sourceUrl(context: AdapterContext, envName: string, fallback: string): string {
  return context.env[envName] || fallback;
}

