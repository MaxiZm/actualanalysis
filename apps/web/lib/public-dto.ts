import { INDEX_KINDS, type IndexKind, type IndexScore, type ModelRecord } from "./data";

function toPublicIndexScore(score: IndexScore) {
  return {
    score: score.score,
    ciLow: score.ciLow,
    ciHigh: score.ciHigh,
    rank: score.rank,
    rankLow: score.rankLow,
    rankHigh: score.rankHigh,
    coverage: score.coverage,
    robustScore: score.robustScore,
    provisional: score.provisional,
    flags: [...score.flags],
    pairwise: { ...score.pairwise },
  };
}

/**
 * Public model responses use an allowlist so display-only overlays and private
 * registries cannot become API fields through object spreading.
 */
export function toPublicModelDto(model: ModelRecord) {
  const indexes = Object.fromEntries(
    INDEX_KINDS.flatMap((kind) => {
      const score = model.indexes[kind];
      return score ? [[kind, toPublicIndexScore(score)] as const] : [];
    }),
  ) as Partial<Record<IndexKind, ReturnType<typeof toPublicIndexScore>>>;

  return {
    id: model.id,
    slug: model.slug,
    name: model.name,
    organization: model.organization,
    family: model.family,
    releasedOn: model.releasedOn,
    openWeights: model.openWeights,
    license: model.license,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    reasoning: model.reasoning,
    indexes,
    pricing: model.pricing.map((price) => ({
      provider: price.provider,
      inputPerMillion: price.inputPerMillion,
      outputPerMillion: price.outputPerMillion,
      cacheReadPerMillion: price.cacheReadPerMillion,
    })),
  };
}
