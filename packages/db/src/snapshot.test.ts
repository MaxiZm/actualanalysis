import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  excludeRetiredBenchmarks,
  publishSnapshotFilesAtomically,
  selectSnapshotRuns,
  serializeSnapshotCsv,
  type SnapshotRunIds,
} from "./snapshot.js";

const temporaryRoots: string[] = [];

function snapshotFiles(snapshot = "{\"ok\":true}\n"): Parameters<typeof publishSnapshotFilesAtomically>[1] {
  return {
    "snapshot.json": snapshot,
    "index-scores.csv": "score\n100\n",
    "benchmark-params.csv": "weight\n1\n",
    "cells.csv": "",
    "results.csv": "score\n0.8\n",
    "models.csv": "id\nmodel-a\n",
    "benchmarks.csv": "id\nbenchmark-a\n",
    "sources.csv": "id\nsource-a\n",
    "pricing.csv": "",
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "actualanalysis-snapshot-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("snapshot CSV serialization", () => {
  it("serializes Date values as bare ISO timestamps", () => {
    expect(serializeSnapshotCsv([{
      id: "result-a",
      createdAt: new Date("2026-09-04T00:28:16.500Z"),
    }])).toBe("id,createdAt\nresult-a,2026-09-04T00:28:16.500Z\n");
  });
});

describe("atomic snapshot publication", () => {
  it("reveals the dated directory only after every asset is staged", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "2026-09-04");

    await publishSnapshotFilesAtomically(output, snapshotFiles());

    expect(await readFile(path.join(output, "snapshot.json"), "utf8")).toBe("{\"ok\":true}\n");
    expect((await readdir(output)).sort()).toEqual([
      "benchmark-params.csv",
      "benchmarks.csv",
      "cells.csv",
      "index-scores.csv",
      "models.csv",
      "pricing.csv",
      "results.csv",
      "snapshot.json",
      "sources.csv",
    ]);
    expect(await readdir(root)).toEqual(["2026-09-04"]);
  });

  it("leaves an existing dated snapshot intact and cleans staging on failure", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "2026-09-04");
    await mkdir(output);
    await writeFile(path.join(output, "snapshot.json"), "old snapshot\n");

    await expect(publishSnapshotFilesAtomically(output, snapshotFiles("new snapshot\n"))).rejects.toThrow();

    expect(await readFile(path.join(output, "snapshot.json"), "utf8")).toBe("old snapshot\n");
    expect(await readdir(root)).toEqual(["2026-09-04"]);
  });

  it("refuses to replace an existing empty dated directory", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "2026-09-04");
    await mkdir(output);

    await expect(publishSnapshotFilesAtomically(output, snapshotFiles())).rejects.toThrow(
      "Refusing to overwrite existing snapshot directory",
    );

    expect(await readdir(output)).toEqual([]);
    expect(await readdir(root)).toEqual(["2026-09-04"]);
  });
});

function run(id: string, kind: "mixed" | "agentic" | "chat", createdAt: string) {
  return {
    id,
    kind,
    methodVersion: "1.0.0-test",
    params: {},
    createdAt: new Date(createdAt),
  };
}

describe("exact snapshot run selection", () => {
  const exactIds: SnapshotRunIds = {
    mixed: "00000000-0000-4000-8000-000000000001",
    agentic: "00000000-0000-4000-8000-000000000002",
    chat: "00000000-0000-4000-8000-000000000003",
  };
  const exactRuns = [
    run(exactIds.mixed, "mixed", "2026-09-04T03:00:00.000Z"),
    run(exactIds.agentic, "agentic", "2026-09-04T03:00:01.000Z"),
    run(exactIds.chat, "chat", "2026-09-04T03:00:02.000Z"),
  ];

  it("keeps selected IDs latest while retaining earlier history", () => {
    const laterMixed = run("00000000-0000-4000-8000-000000000004", "mixed", "2026-09-04T04:00:00.000Z");
    const earlierChat = run("00000000-0000-4000-8000-000000000005", "chat", "2026-09-03T03:00:00.000Z");

    const selected = selectSnapshotRuns([laterMixed, ...exactRuns, earlierChat], exactIds);

    expect(selected.chosen.map(({ id }) => id)).toEqual([exactIds.mixed, exactIds.agentic, exactIds.chat]);
    expect(selected.history.map(({ id }) => id)).not.toContain(laterMixed.id);
    expect(selected.history.map(({ id }) => id)).toContain(earlierChat.id);
  });

  it("rejects missing, mismatched, and duplicate exact IDs", () => {
    expect(() => selectSnapshotRuns(exactRuns, { ...exactIds, mixed: "missing" })).toThrow(
      "Exact mixed snapshot run does not exist",
    );
    expect(() => selectSnapshotRuns(exactRuns, {
      ...exactIds,
      mixed: exactIds.agentic,
      agentic: exactIds.mixed,
    })).toThrow("has kind agentic");
    expect(() => selectSnapshotRuns(exactRuns, { ...exactIds, chat: exactIds.mixed })).toThrow(
      "must be distinct",
    );
  });

  it("keeps rejected experiments out of latest selection and public history", () => {
    const rejected = {
      ...run("rejected-experiment", "mixed", "2026-09-05T03:00:00.000Z"),
      params: { publication_status: "rejected" },
    };
    const all = [rejected, ...exactRuns];
    expect(selectSnapshotRuns(all).chosen).toEqual(exactRuns);
    expect(selectSnapshotRuns(all, exactIds).history).toEqual(exactRuns);
    expect(() => selectSnapshotRuns(all, { ...exactIds, mixed: rejected.id })).toThrow("rejected for publication");
  });

  it("archives an existing dated directory when replaceExisting is requested", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "snapshot-replace-"));
    const output = path.join(root, "2026-09-04");
    await publishSnapshotFilesAtomically(output, snapshotFiles("old\n"));
    await publishSnapshotFilesAtomically(output, snapshotFiles("new\n"), { replaceExisting: true });
    expect(await readFile(path.join(output, "snapshot.json"), "utf8")).toBe("new\n");
    const archived = await readdir(path.join(root, ".archive"));
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatch(/^2026-09-04-/);
  });
});

it("removes retired benchmark metadata and all dependent exported rows together", () => {
  const live = { benchmarkId: "matharena-composite" };
  const retired = { benchmarkId: "swe-bench-pro-public" };
  const watchlist = { benchmarkId: "arc-agi-3" };
  const output = excludeRetiredBenchmarks({
    benchmarks: [{ id: live.benchmarkId, status: "active" }, { id: retired.benchmarkId, status: "retired" }, { id: watchlist.benchmarkId, status: "watchlist" }],
    results: [live, retired, watchlist], params: [retired, live], cells: [live, retired],
  });
  expect(output.benchmarks.map((b) => b.id)).toEqual([live.benchmarkId, watchlist.benchmarkId]);
  expect(output.results).toEqual([live, watchlist]);
  expect(output.params).toEqual([live]);
  expect(output.cells).toEqual([live]);
});

describe("current publication evidence", () => {
  it("excludes stale corrected rows without deleting the stored historical input", async () => {
    const { selectCurrentEvidence } = await import("./snapshot.js");
    const history = [{ observationKey: "wrong-v1" }, { observationKey: "valid-v2" }, { observationKey: "old-copy" }];
    const runs = [{ params: { current_evidence_observation_keys: ["valid-v2"] } }];
    expect(selectCurrentEvidence(history, runs)).toEqual([{ observationKey: "valid-v2" }]);
    expect(history).toHaveLength(3);
  });
  it("keeps legacy exports compatible when no exact observation inventory exists", async () => {
    const { selectCurrentEvidence } = await import("./snapshot.js");
    const rows = [{ observationKey: "legacy" }];
    expect(selectCurrentEvidence(rows, [{ params: {} }])).toEqual(rows);
  });
});
