import type { Database, DatabaseWriter } from "./client.js";
import { benchmarkParams, cells, indexRuns, indexScores } from "./schema.js";
import type { RunArtifact } from "./run-artifact.js";

export async function persistRun(db: Database, artifact: RunArtifact): Promise<string> {
  return db.transaction((tx) => persistRunInTransaction(tx, artifact));
}

/** Persists a run using an existing transaction owned by the caller. */
export async function persistRunInTransaction(
  db: DatabaseWriter,
  artifact: RunArtifact,
): Promise<string> {
    const [created] = await db.insert(indexRuns).values({
      kind: artifact.kind,
      methodVersion: artifact.method_version,
      params: artifact.params,
      ...(artifact.created_at ? { createdAt: new Date(artifact.created_at) } : {})
    }).returning({ id: indexRuns.id });
    if (!created) throw new Error("Database did not return an index run id.");

    if (artifact.scores.length) {
      await db.insert(indexScores).values(artifact.scores.map((score) => ({
        runId: created.id,
        modelId: score.model_id,
        systemId: score.system_id ?? `${score.model_id}@legacy`,
        profile: score.profile ?? "legacy",
        tier: score.tier ?? (score.provisional ? "provisional" : "ranked"),
        score: score.score,
        ciLow: score.ci_low,
        ciHigh: score.ci_high,
        rank: score.rank,
        rankLow: score.rank_low,
        rankHigh: score.rank_high,
        coverage: score.coverage,
        nPrivate: score.n_private,
        robustScore: score.robust_score,
        flags: score.flags,
        provisional: score.provisional,
        pairwise: score.pairwise
        ,rankCdf: score.rank_cdf ?? []
        ,topK: score.top_k ?? {}
        ,evidence: score.evidence ?? {}
      })));
    }
    if (artifact.benchmark_params.length) {
      await db.insert(benchmarkParams).values(artifact.benchmark_params.map((item) => ({
        runId: created.id,
        benchmarkId: item.benchmark_id,
        difficulty: item.difficulty,
        slope: item.slope,
        weight: item.weight,
        weightFactors: item.weight_factors,
        residualVar: item.residual_var
      })));
    }
    if (artifact.cells.length) {
      await db.insert(cells).values(artifact.cells.map((cell) => ({
        runId: created.id,
        modelId: cell.model_id,
        systemId: cell.system_id ?? `${cell.model_id}@legacy`,
        profile: cell.profile ?? "legacy",
        benchmarkId: cell.benchmark_id,
        y: cell.y,
        yHat: cell.y_hat,
        z: cell.z,
        used: cell.used
      })));
    }
    return created.id;
}
