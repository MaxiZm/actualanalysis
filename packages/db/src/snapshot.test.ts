import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
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
});
