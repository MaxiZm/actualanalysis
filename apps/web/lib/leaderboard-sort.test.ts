import { describe, expect, it } from "vitest";

import { MODELS, type IndexScore, type ModelRecord } from "./data";
import { compareNullable, sortLeaderboardModels } from "./leaderboard-sort";

function withIndex(model: ModelRecord, overrides: Partial<IndexScore>, name = model.name): ModelRecord {
  const base = model.indexes.mixed!;
  return { ...model, id: `${model.id}-${name}`, name, indexes: { ...model.indexes, mixed: { ...base, ...overrides } } };
}

const base = MODELS[0]!;
const ranked = withIndex(base, { score: 61.2, rank: 1, ciLow: 58, ciHigh: 64, provisional: false, tier: "ranked", coverageCount: 12, coverageTotal: 20 }, "Ranked");
const verified = withIndex(base, { score: 55.4, rank: 2, ciLow: 52, ciHigh: 58, provisional: false, tier: "verified", coverageCount: 18, coverageTotal: 20 }, "Verified");
const wideInterval = withIndex(base, { score: null, rank: null, rankLow: null, rankHigh: null, robustScore: 67, ciLow: 60, ciHigh: 74, provisional: true, tier: "provisional", coverageCount: 13, coverageTotal: 20 }, "Wide");
const narrowInterval = withIndex(base, { score: null, rank: null, rankLow: null, rankHigh: null, robustScore: 37, ciLow: 30, ciHigh: 44, provisional: true, tier: "provisional", coverage: 0.2, coverageCount: null, coverageTotal: null }, "Narrow");
const prices = new Map<string, number | null>([[ranked.id, 3], [verified.id, null], [wideInterval.id, 1], [narrowInterval.id, 2]]);
const models = [narrowInterval, verified, wideInterval, ranked];

describe("leaderboard sorting", () => {
  it("keeps null values last in both directions", () => {
    expect(compareNullable(null, 1, false)).toBeGreaterThan(0);
    expect(compareNullable(null, 1, true)).toBeGreaterThan(0);
    expect(compareNullable(1, null, true)).toBeLessThan(0);
    expect(compareNullable(null, null, true)).toBe(0);
    expect(compareNullable(2, 1, false)).toBeGreaterThan(0);
    expect(compareNullable(2, 1, true)).toBeLessThan(0);
  });

  it("orders by the displayed median, including preliminary estimates", () => {
    const highFirst = sortLeaderboardModels(models, { kind: "mixed", sort: "score", descending: false, prices }).map((model) => model.name);
    expect(highFirst).toEqual(["Wide", "Ranked", "Verified", "Narrow"]);
    const lowFirst = sortLeaderboardModels(models, { kind: "mixed", sort: "score", descending: true, prices }).map((model) => model.name);
    expect(lowFirst).toEqual(["Narrow", "Verified", "Ranked", "Wide"]);
  });

  it("uses the same median order for default positions regardless of publication tier", () => {
    const order = sortLeaderboardModels(models, { kind: "mixed", sort: "rank", descending: false, prices }).map((model) => model.name);
    expect(order).toEqual(["Wide", "Ranked", "Verified", "Narrow"]);
  });

  it("sorts coverage by fitted-cell counts and puts missing coverage last", () => {
    const order = sortLeaderboardModels(models, { kind: "mixed", sort: "coverage", descending: false, prices }).map((model) => model.name);
    expect(order).toEqual(["Verified", "Wide", "Ranked", "Narrow"]);
  });

  it("sorts price ascending by default with unpriced models last", () => {
    const order = sortLeaderboardModels(models, { kind: "mixed", sort: "price", descending: false, prices }).map((model) => model.name);
    expect(order).toEqual(["Wide", "Narrow", "Ranked", "Verified"]);
    const reversed = sortLeaderboardModels(models, { kind: "mixed", sort: "price", descending: true, prices }).map((model) => model.name);
    expect(reversed).toEqual(["Ranked", "Narrow", "Wide", "Verified"]);
  });
});
