import { type IndexKind, type ModelRecord } from "./data";

export type LeaderboardSortKey = "rank" | "score" | "coverage" | "price" | "taskCost" | "release";

export interface LeaderboardSortOptions {
  kind: IndexKind;
  sort: LeaderboardSortKey;
  descending: boolean;
  prices: ReadonlyMap<string, number | null>;
}

/**
 * Orders two nullable numbers. Nulls always sort last, whichever direction is
 * requested, so unavailable measurements stay below measured values.
 */
export function compareNullable(
  left: number | null | undefined,
  right: number | null | undefined,
  descending: boolean,
): number {
  const leftMissing = left === null || left === undefined || Number.isNaN(left);
  const rightMissing = right === null || right === undefined || Number.isNaN(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return descending ? right - left : left - right;
}

function coverageFraction(model: ModelRecord, kind: IndexKind): number | null {
  const index = model.indexes[kind];
  if (!index) return null;
  if (index.coverageCount !== null && index.coverageTotal) return index.coverageCount / index.coverageTotal;
  return index.coverage;
}

function releaseTime(model: ModelRecord): number | null {
  if (!model.releasedOn) return null;
  const time = Date.parse(model.releasedOn);
  return Number.isFinite(time) ? time : null;
}

/** Leaderboard comparator: "rank" follows the displayed estimate order; every other key sorts nulls last. */
export function compareLeaderboardModels(left: ModelRecord, right: ModelRecord, options: LeaderboardSortOptions): number {
  const { kind, sort, descending, prices } = options;
  switch (sort) {
    case "rank":
    case "score":
      // Default direction for score is high-to-low.
      return compareNullable(left.indexes[kind]?.score ?? left.indexes[kind]?.robustScore, right.indexes[kind]?.score ?? right.indexes[kind]?.robustScore, !descending);
    case "coverage":
      return compareNullable(coverageFraction(left, kind), coverageFraction(right, kind), !descending);
    case "taskCost":
      return compareNullable(left.costPerTask?.usdPerTask, right.costPerTask?.usdPerTask, descending);
    case "price":
      return compareNullable(prices.get(left.id), prices.get(right.id), descending);
    case "release":
      return compareNullable(releaseTime(left), releaseTime(right), !descending);
    default:
      return 0;
  }
}

export function sortLeaderboardModels(models: readonly ModelRecord[], options: LeaderboardSortOptions): ModelRecord[] {
  return [...models].sort((left, right) => compareLeaderboardModels(left, right, options) || left.name.localeCompare(right.name));
}
