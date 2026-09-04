import { describe, expect, it } from "vitest";

import {
  DATA_STATUS,
  INDEX_KINDS,
  MODELS,
  fixtureEnvelope,
  getLeaderboard,
  getStatisticalTieLabels,
  isIndexKind,
} from "./data";

describe("fixture data contract", () => {
  it("never represents fixture values as published", () => {
    expect(DATA_STATUS.mode).toBe("fixture");
    expect(DATA_STATUS.published).toBe(false);
    expect(DATA_STATUS.snapshotDate).toBeNull();
    expect(fixtureEnvelope(MODELS).meta.published).toBe(false);
    expect(fixtureEnvelope(MODELS).meta.disclaimer).toContain("synthetic fixture data");
  });

  it("keeps every leaderboard ordered by its selected rank", () => {
    for (const kind of INDEX_KINDS) {
      const ranks = getLeaderboard(kind).map((model) => model.indexes[kind]?.rank);
      expect(ranks).not.toContain(null);
      expect(ranks).not.toContain(undefined);
      expect(ranks).toEqual([...ranks].sort((a, b) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER)));
    }
  });

  it("returns every model scored for the requested index without requiring other indexes", () => {
    const mixed = MODELS[0]!.indexes.mixed;
    const chat = MODELS[0]!.indexes.chat;
    if (!mixed || !chat) throw new Error("fixture model must provide mixed and chat scores");
    const mixedOnly = { ...MODELS[0]!, id: "mixed-only", indexes: { mixed } };
    const chatOnly = { ...MODELS[0]!, id: "chat-only", indexes: { chat } };

    expect(getLeaderboard("mixed", [mixedOnly, chatOnly]).map((model) => model.id)).toEqual(["mixed-only"]);
    expect(getLeaderboard("chat", [mixedOnly, chatOnly]).map((model) => model.id)).toEqual(["chat-only"]);
  });

  it("accepts only public index kinds", () => {
    expect(isIndexKind("agentic")).toBe(true);
    expect(isIndexKind("overall")).toBe(false);
  });

  it("marks only adjacent ranked models below the pairwise ordering threshold as tied", () => {
    const first = MODELS[0];
    const second = MODELS[1];
    const third = MODELS[2];
    if (!first?.indexes.mixed || !second?.indexes.mixed || !third?.indexes.mixed) {
      throw new Error("fixture models must provide mixed scores");
    }
    const models = [
      { ...first, indexes: { mixed: { ...first.indexes.mixed, pairwise: { [second.id]: 0.89, [third.id]: 0.5 } } } },
      { ...second, indexes: { mixed: { ...second.indexes.mixed, pairwise: { [third.id]: 0.91 } } } },
      { ...third, indexes: { mixed: { ...third.indexes.mixed, pairwise: {} } } },
    ];

    expect(getStatisticalTieLabels("mixed", models)).toEqual({
      [first.id]: [second.name],
      [second.id]: [first.name],
    });
  });
});
