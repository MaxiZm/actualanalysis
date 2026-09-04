import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { loadSiteData } from "@/lib/server/snapshot";

export async function GET(request: Request) {
  const data = await loadSiteData();
  const url = new URL(request.url);
  const model = url.searchParams.get("model");
  const benchmark = url.searchParams.get("benchmark");
  const filtered = data.results.filter((result) => !model || result.modelSlug === model).filter(
    (result) => !benchmark || result.benchmarkSlug === benchmark,
  );
  return rateLimitedFixtureJson(request, filtered, { dataStatus: data.status });
}

export function OPTIONS() {
  return optionsResponse();
}
