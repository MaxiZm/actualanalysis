import "server-only";

import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import {
  FIXTURE_SITE_DATA,
  compareIndexRank,
  type IndexKind,
  type SiteData,
} from "../data";
import { mapCommittedSnapshot, type PublishedSiteData } from "../snapshot-data";
import {
  isSnapshotAssetName,
  snapshotAssetContentType,
} from "../snapshot-assets";
import {
  DisplaySpeedFileSchema,
  withDisplaySpeed,
  DisplayCostFileSchema,
  withDisplayCost,
  DisplayBenchmarkFileSchema,
  withDisplayBenchmarks,
} from "../display-data";
import type { z } from "zod";

export type PublishedSnapshot = PublishedSiteData;

interface LoadedSnapshot {
  directory: string;
  snapshot: PublishedSnapshot;
}

export interface SnapshotAsset {
  contents: string;
  contentType: string;
  downloadName: string;
  snapshot: PublishedSnapshot;
}

let loadedSnapshotPromise: Promise<LoadedSnapshot | null> | undefined;
let displaySpeedPromise: ReturnType<typeof readDisplaySpeed> | undefined;
let displayCostPromise: ReturnType<typeof readDisplayCost> | undefined;
let displayBenchmarkPromise:
  | ReturnType<typeof readDisplayBenchmarks>
  | undefined;

function candidateSnapshotRoots(): string[] {
  const configured = process.env.ACTUALANALYSIS_SNAPSHOT_DIR;
  return [
    ...new Set([
      ...(configured ? [path.resolve(configured)] : []),
      path.resolve(process.cwd(), "data/snapshots"),
      path.resolve(process.cwd(), "../../data/snapshots"),
    ]),
  ];
}

function candidateDataRoots(): string[] {
  const configured = process.env.ACTUALANALYSIS_DATA_DIR;
  return [
    ...new Set([
      ...(configured ? [path.resolve(configured)] : []),
      path.resolve(process.cwd(), "data"),
      path.resolve(process.cwd(), "../../data"),
    ]),
  ];
}

async function readDisplaySpeed() {
  for (const root of candidateDataRoots()) {
    try {
      const parsed = DisplaySpeedFileSchema.parse(
        parse(
          await readFile(path.join(root, "manual", "speed-aa.yaml"), "utf8"),
        ),
      );
      return parsed.observations;
    } catch {
      // A missing private registry is valid for clean deploys and forks.
    }
  }
  return [];
}

async function readDisplayRegistry<T extends z.ZodTypeAny>(
  filename: string,
  schema: T,
): Promise<z.infer<T> | null> {
  for (const root of candidateDataRoots()) {
    try {
      return schema.parse(
        parse(await readFile(path.join(root, "manual", filename), "utf8")),
      );
    } catch {
      /* Private display registries are optional in clean checkouts. */
    }
  }
  return null;
}
const readDisplayCost = () =>
  readDisplayRegistry("cost-aa.yaml", DisplayCostFileSchema);
const readDisplayBenchmarks = () =>
  readDisplayRegistry("benchmarks-aa.yaml", DisplayBenchmarkFileSchema);

async function candidateSnapshotFiles(): Promise<
  Array<{ file: string; date: string; priority: number }>
> {
  const candidates: Array<{ file: string; date: string; priority: number }> =
    [];
  const roots = candidateSnapshotRoots();
  await Promise.all(
    roots.map(async (root, priority) => {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/u.test(entry.name)) {
            candidates.push({
              file: path.join(root, entry.name, "snapshot.json"),
              date: entry.name,
              priority,
            });
          }
        }
      } catch {
        // Missing snapshot roots are expected in a fresh checkout and in package-local builds.
      }
    }),
  );
  return candidates.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.priority - right.priority,
  );
}

async function readLatestSnapshot(): Promise<LoadedSnapshot | null> {
  for (const candidate of await candidateSnapshotFiles()) {
    try {
      const raw: unknown = JSON.parse(
        await readFile(/* turbopackIgnore: true */ candidate.file, "utf8"),
      );
      const mapped = mapCommittedSnapshot(raw, candidate.date);
      if (mapped)
        return { directory: path.dirname(candidate.file), snapshot: mapped };
    } catch {
      // A malformed or partial export never becomes public; continue to the next dated candidate.
    }
  }
  return null;
}

export function loadLatestCommittedSnapshot(): Promise<PublishedSnapshot | null> {
  if (process.env.NODE_ENV === "development") {
    return readLatestSnapshot().then((loaded) => loaded?.snapshot ?? null);
  }
  loadedSnapshotPromise ??= readLatestSnapshot();
  return loadedSnapshotPromise.then((loaded) => loaded?.snapshot ?? null);
}

export async function loadLatestSnapshotAsset(
  name: string,
): Promise<SnapshotAsset | null> {
  if (!isSnapshotAssetName(name)) return null;
  const loaded =
    process.env.NODE_ENV === "development"
      ? await readLatestSnapshot()
      : ((loadedSnapshotPromise ??= readLatestSnapshot()),
        await loadedSnapshotPromise);
  if (!loaded) return null;
  try {
    const [directoryPath, assetPath] = await Promise.all([
      realpath(loaded.directory),
      realpath(path.join(loaded.directory, name)),
    ]);
    if (path.dirname(assetPath) !== directoryPath) return null;
    const contents = await readFile(assetPath, "utf8");
    return {
      contents,
      contentType: snapshotAssetContentType(name),
      downloadName: `actualanalysis-${loaded.snapshot.snapshotDate}-${name}`,
      snapshot: loaded.snapshot,
    };
  } catch {
    return null;
  }
}

export async function loadSiteData(): Promise<SiteData> {
  return (await loadLatestCommittedSnapshot()) ?? FIXTURE_SITE_DATA;
}

/** UI-only view that overlays the isolated, non-redistributable speed registry. */
export async function loadDisplaySiteData(): Promise<SiteData> {
  const development = process.env.NODE_ENV === "development";
  const [data, observations, cost, benchmarks] = await Promise.all([
    loadSiteData(),
    development
      ? readDisplaySpeed()
      : (displaySpeedPromise ??= readDisplaySpeed()),
    development
      ? readDisplayCost()
      : (displayCostPromise ??= readDisplayCost()),
    development
      ? readDisplayBenchmarks()
      : (displayBenchmarkPromise ??= readDisplayBenchmarks()),
  ]);
  return withDisplayBenchmarks(
    withDisplayCost(withDisplaySpeed(data, observations), cost),
    benchmarks,
  );
}

export function latestRunForKind(snapshot: PublishedSnapshot, kind: IndexKind) {
  return snapshot.runs
    .filter((run) => run.kind === kind)
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )[0];
}

export function scoresForRun(snapshot: PublishedSnapshot, runId: string) {
  const run = snapshot.runs.find((candidate) => candidate.id === runId);
  if (!run || latestRunForKind(snapshot, run.kind)?.id !== runId) return [];
  return [...snapshot.models]
    .filter((model) => model.indexes[run.kind] !== undefined)
    .sort((left, right) => compareIndexRank(left, right, run.kind))
    .flatMap((model) => {
      const score = model.indexes[run.kind];
      return score
        ? [
            {
              runId,
              modelId: model.id,
              modelSlug: model.slug,
              modelName: model.name,
              organization: model.organization,
              ...score,
            },
          ]
        : [];
    });
}
