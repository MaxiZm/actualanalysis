import { describe, expect, it } from "vitest";

import { SNAPSHOT_ASSETS, isSnapshotAssetName, snapshotAssetContentType } from "./snapshot-assets";

describe("snapshot download allowlist", () => {
  it("contains only redistributable database exports", () => {
    expect(SNAPSHOT_ASSETS.map((asset) => asset.name)).toEqual([
      "snapshot.json",
      "index-scores.csv",
      "results.csv",
      "benchmark-params.csv",
      "cells.csv",
      "models.csv",
      "benchmarks.csv",
      "sources.csv",
      "pricing.csv",
    ]);
    expect(SNAPSHOT_ASSETS.some((asset) => asset.name.includes("speed"))).toBe(false);
    expect(SNAPSHOT_ASSETS.find((asset) => asset.name === "cells.csv")?.label).toContain("policy-empty");
  });

  it("rejects traversal, suffix tricks, and speed files", () => {
    for (const value of ["../snapshot.json", "speed.csv", "snapshot.json.csv", "results.csv/extra", "RESULTS.CSV"]) {
      expect(isSnapshotAssetName(value)).toBe(false);
    }
    expect(isSnapshotAssetName("results.csv")).toBe(true);
    expect(snapshotAssetContentType("results.csv")).toContain("text/csv");
    expect(snapshotAssetContentType("snapshot.json")).toContain("application/json");
  });
});
