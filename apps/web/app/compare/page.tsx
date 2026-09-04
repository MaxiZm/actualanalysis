import type { Metadata } from "next";
import { Suspense } from "react";
import { displayModels } from "@/lib/display-economics";
import { loadOpenRouterDisplay } from "@/lib/server/openrouter-display";
import { CompareWorkbench } from "@/components/compare-workbench";
import { loadDisplaySiteData } from "@/lib/server/snapshot";

export const metadata: Metadata = {
  title: "Compare",
  description:
    "Compare model capability, price, release timing, and benchmark shape.",
};

export default async function ComparePage() {
  const data = await loadDisplaySiteData();
  const openRouter =
    data.status.mode === "snapshot"
      ? await loadOpenRouterDisplay(
          data.models.map((model) => ({
            modelId: model.id,
            aliases: model.aliases,
          })),
        )
      : null;
  const models = displayModels(data.models, openRouter);
  const methodVersion = data.status.methodVersion ?? "fixture";
  return (
    <div className="page-shell">
      <header className="page-header compact-page-header">
        <div>
          <h1>Compare models</h1>
          <p className="page-lede">
            Compare capability, cost and the evidence behind each score.
          </p>
          <p className="compare-page-meta">{models.length} models · ACI {methodVersion} · {data.status.snapshotDate ?? "Fixture data"}</p>
        </div>
      </header>
      <Suspense
        fallback={
          <div className="empty-state" role="status">
            Loading comparison…
          </div>
        }
      >
        <CompareWorkbench
          models={models}
          openRouter={openRouter}
          benchmarks={data.benchmarks}
          results={data.results}
        />
      </Suspense>
    </div>
  );
}
