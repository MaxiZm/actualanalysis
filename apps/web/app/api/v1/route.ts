import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { SNAPSHOT_ASSETS } from "@/lib/snapshot-assets";
import { loadLatestCommittedSnapshot } from "@/lib/server/snapshot";

export async function GET(request: Request) {
  const snapshot = await loadLatestCommittedSnapshot();
  return rateLimitedFixtureJson(request, {
    name: "ActualAnalysis API",
    version: "v1",
    activeDataSource: snapshot ? "published snapshot" : "synthetic fixture",
    rateLimit: { requests: 120, windowSeconds: 60 },
    resources: [
      "/api/v1/models",
      "/api/v1/benchmarks",
      "/api/v1/results",
      "/api/v1/download/{file}",
      "/api/v1/index/mixed",
      "/api/v1/index/agentic",
      "/api/v1/index/chat",
      "/api/v1/runs",
    ],
    downloads: snapshot
      ? SNAPSHOT_ASSETS.map((asset) => ({
          file: asset.name,
          format: asset.format,
          href: `/api/v1/download/${asset.name}`,
        }))
      : [],
  }, snapshot ? { dataStatus: snapshot.status } : undefined);
}

export function OPTIONS() {
  return optionsResponse();
}
