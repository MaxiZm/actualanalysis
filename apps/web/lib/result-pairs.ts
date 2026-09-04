import type { ResultRecord } from "./data";

const sourcePriority: Record<ResultRecord["sourceKind"], number> = {
  independent: 3,
  mirror: 2,
  "self-reported": 1,
};

function effortPriority(result: ResultRecord): number {
  const value = result.config.reasoning_effort ?? result.config.effort_tier ?? result.config.evaluation_profile;
  if (typeof value !== "string") return -1;
  const tier = value.toLowerCase().replace(/[\s_-]+/g, "").trim();
  const ranks: Record<string, number> = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
  return ranks[tier] ?? -1;
}

function compareEvidence(left: ResultRecord, right: ResultRecord): number {
  return sourcePriority[right.sourceKind] - sourcePriority[left.sourceKind]
    || effortPriority(right) - effortPriority(left)
    || (right.observedOn ?? "").localeCompare(left.observedOn ?? "")
    || left.id.localeCompare(right.id);
}

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

    // Keep the complete chosen measurement. Borrowing a smaller SE from another
    // configuration incorrectly narrows its uncertainty.
    pairs.set(key, compareEvidence(result, current) < 0 ? result : current);
  }

  return [...pairs.values()];
}
