import type { ResultRecord } from "./data";

const sourcePriority: Record<ResultRecord["sourceKind"], number> = {
  independent: 3,
  mirror: 2,
  "self-reported": 1,
};

/**
 * Comparison charts operate on fitted model/benchmark cells, while the public
 * result list retains every accepted source/configuration row. Collapse those
 * evidence rows to one stable representative per fitted cell before rendering.
 */
export function uniqueUsedResultPairs(results: ResultRecord[]): ResultRecord[] {
  const pairs = new Map<string, ResultRecord>();

  for (const result of results) {
    if (!result.used) continue;
    const key = `${result.modelSlug}\0${result.benchmarkSlug}`;
    const current = pairs.get(key);
    if (!current) {
      pairs.set(key, result);
      continue;
    }

    const preferred = sourcePriority[result.sourceKind] > sourcePriority[current.sourceKind]
      ? result
      : current;
    const standardErrors = [current.standardError, result.standardError]
      .filter((value): value is number => value !== null && Number.isFinite(value));
    pairs.set(key, {
      ...preferred,
      standardError: standardErrors.length ? Math.min(...standardErrors) : null,
    });
  }

  return [...pairs.values()];
}
