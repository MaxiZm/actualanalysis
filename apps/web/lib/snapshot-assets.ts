export const SNAPSHOT_ASSETS = [
  { name: "snapshot.json", label: "Snapshot JSON", format: "json" },
  { name: "index-scores.csv", label: "Index scores", format: "csv" },
  { name: "results.csv", label: "Results", format: "csv" },
  { name: "benchmark-params.csv", label: "Benchmark parameters", format: "csv" },
  { name: "cells.csv", label: "Cells (policy-empty)", format: "csv" },
  { name: "models.csv", label: "Models", format: "csv" },
  { name: "benchmarks.csv", label: "Benchmarks", format: "csv" },
  { name: "sources.csv", label: "Sources", format: "csv" },
  { name: "pricing.csv", label: "Pricing", format: "csv" },
] as const;

export type SnapshotAssetName = (typeof SNAPSHOT_ASSETS)[number]["name"];

const snapshotAssetNames = new Set<string>(SNAPSHOT_ASSETS.map((asset) => asset.name));

export function isSnapshotAssetName(value: string): value is SnapshotAssetName {
  return snapshotAssetNames.has(value);
}

export function snapshotAssetContentType(name: SnapshotAssetName): string {
  return name.endsWith(".json")
    ? "application/json; charset=utf-8"
    : "text/csv; charset=utf-8";
}
