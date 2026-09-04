import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { getLeaderboard, isIndexKind } from "@/lib/data";
import { latestRunForKind, loadLatestCommittedSnapshot, scoresForRun } from "@/lib/server/snapshot";

interface IndexRouteProps {
  params: Promise<{ kind: string }>;
}

export async function GET(_request: Request, { params }: IndexRouteProps) {
  const { kind } = await params;
  if (!isIndexKind(kind)) {
    return rateLimitedFixtureJson(
      _request,
      { error: "Unknown index kind.", allowed: ["mixed", "agentic", "chat"] },
      { status: 404 },
    );
  }

  const snapshot = await loadLatestCommittedSnapshot();
  const snapshotRun = snapshot ? latestRunForKind(snapshot, kind) : undefined;
  if (snapshot && snapshotRun) {
    return rateLimitedFixtureJson(
      _request,
      {
        kind,
        methodVersion: snapshotRun.methodVersion,
        runId: snapshotRun.id,
        generatedAt: snapshot.generatedAt,
        rows: scoresForRun(snapshot, snapshotRun.id),
      },
      { dataStatus: snapshot.status },
    );
  }

  const rows = getLeaderboard(kind).flatMap((model) => {
    const score = model.indexes[kind];
    return score ? [{
      modelId: model.id,
      modelSlug: model.slug,
      modelName: model.name,
      organization: model.organization,
      ...score,
    }] : [];
  });

  return rateLimitedFixtureJson(_request, { kind, methodVersion: "demo-fixture", runId: null, rows });
}

export function OPTIONS() {
  return optionsResponse();
}
