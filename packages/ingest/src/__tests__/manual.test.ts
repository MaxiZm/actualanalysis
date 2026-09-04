import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ManualAdapter } from "../adapters/manual.js";
import { createAdapterContext } from "../types.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("manual observation admission", () => {
  it("excludes quarantined revisions and preserves admitted protocol and uncertainty metadata", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "actualanalysis-manual-"));
    directories.push(directory);
    await mkdir(path.join(directory, "manual", "results"), { recursive: true });
    const base = {
      model_id: "test-model", source_id: "vendor-model-cards", score: 48.8,
      score_unit: "percent", observed_on: "2026-09-05", url: "https://example.test/model-card",
      provenance: "self_report", config: {},
    };
    await writeFile(path.join(directory, "manual", "results", "review.yaml"), stringify({
      results: [
        { ...base, benchmark_id: "automationbench-public", benchmark_version: "1.0.6", sample_only: true },
        {
          ...base, benchmark_id: "gpqa-diamond", benchmark_version: "diamond-198",
          protocol_id: "gpqa-publisher-run", version_inferred: false, metadata_incomplete: true,
          n_items: 198, k_samples: 3,
        },
      ],
    }));
    const result = await new ManualAdapter().ingest(createAdapterContext({ dataDir: directory }));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      benchmark_id: "gpqa-diamond", protocol_id: "gpqa-publisher-run", version_inferred: false,
      metadata_incomplete: true, n_items: 198, k_samples: 3,
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "partial", message: expect.stringContaining("Skipped 1 review-only result"),
    }));
  });
});
