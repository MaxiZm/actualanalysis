import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { isIndexKind } from "@/lib/data";
import { loadSiteData } from "@/lib/server/snapshot";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind && !isIndexKind(kind)) {
    return rateLimitedFixtureJson(
      request,
      { error: "Unknown index kind.", allowed: ["mixed", "agentic", "chat"] },
      { status: 400 },
    );
  }
  const data = await loadSiteData();
  const runs = kind ? data.runs.filter((run) => run.kind === kind) : data.runs;
  return rateLimitedFixtureJson(request, runs, { dataStatus: data.status });
}

export function OPTIONS() {
  return optionsResponse();
}
