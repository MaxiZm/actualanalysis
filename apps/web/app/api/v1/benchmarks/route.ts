import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { loadSiteData } from "@/lib/server/snapshot";

export async function GET(request: Request) {
  const data = await loadSiteData();
  return rateLimitedFixtureJson(request, data.benchmarks, { dataStatus: data.status });
}

export function OPTIONS() {
  return optionsResponse();
}
