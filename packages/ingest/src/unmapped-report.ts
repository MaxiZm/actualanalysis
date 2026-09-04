import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import type { UnmappedName } from "./lib/records.js";

const NOTE = "Add aliases to data/models or data/benchmarks, then rerun ingestion.";

function compareUnmapped(left: UnmappedName, right: UnmappedName): number {
  return left.kind.localeCompare(right.kind)
    || left.source_id.localeCompare(right.source_id)
    || left.value.localeCompare(right.value)
    || left.occurrences - right.occurrences;
}

/** Stable, reviewable representation: no run timestamp and no input-order churn. */
export function formatUnmappedReport(entries: readonly UnmappedName[]): string {
  return stringify({
    note: NOTE,
    entries: [...entries].sort(compareUnmapped),
  }, { lineWidth: 0 });
}

/** Writes only when content changes so scheduled ingestion does not create timestamp-only diffs. */
export async function writeUnmappedReportIfChanged(
  filename: string,
  entries: readonly UnmappedName[],
): Promise<boolean> {
  const next = formatUnmappedReport(entries);
  let previous: string | undefined;
  try {
    previous = await readFile(filename, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (previous === next) return false;
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, next, "utf8");
  return true;
}
