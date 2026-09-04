import {
  optionsResponse,
  rateLimitedFixtureJson,
  rateLimitedResponse,
} from "@/lib/api";
import { isSnapshotAssetName } from "@/lib/snapshot-assets";
import { loadLatestSnapshotAsset, loadSiteData } from "@/lib/server/snapshot";

interface DownloadRouteProps {
  params: Promise<{ file: string }>;
}

export async function GET(request: Request, { params }: DownloadRouteProps) {
  const { file } = await params;
  if (!isSnapshotAssetName(file)) {
    const data = await loadSiteData();
    return rateLimitedFixtureJson(
      request,
      { error: "Snapshot file is not available." },
      { status: 404, dataStatus: data.status },
    );
  }

  const asset = await loadLatestSnapshotAsset(file);
  if (!asset) {
    const data = await loadSiteData();
    return rateLimitedFixtureJson(
      request,
      { error: "No validated committed snapshot provides this file." },
      { status: 404, dataStatus: data.status },
    );
  }

  return rateLimitedResponse(request, asset.contents, {
    dataStatus: asset.snapshot.status,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": `attachment; filename="${asset.downloadName}"`,
      "X-ActualAnalysis-Snapshot": asset.snapshot.snapshotDate,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function OPTIONS() {
  return optionsResponse();
}
