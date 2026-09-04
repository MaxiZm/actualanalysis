import { optionsResponse, rateLimitedFixtureJson } from "@/lib/api";
import { toPublicModelDto } from "@/lib/public-dto";
import { loadSiteData } from "@/lib/server/snapshot";

export async function GET(request: Request) {
  const data = await loadSiteData();
  const redistributableFields = data.models.map(toPublicModelDto);
  return rateLimitedFixtureJson(request, redistributableFields, { dataStatus: data.status });
}

export function OPTIONS() {
  return optionsResponse();
}
