import type { Metadata } from "next";
import { Suspense } from "react";

import { Leaderboard } from "@/components/leaderboard";
import { loadOpenRouterDisplay } from "@/lib/server/openrouter-display";
import { loadDisplaySiteData } from "@/lib/server/snapshot";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Compare Mixed, Agentic, and Chat capability indexes beside price, speed, context, and diagnostics.",
};

export default async function LeaderboardPage() {
  const data = await loadDisplaySiteData();
  const openRouter = data.status.mode === "snapshot"
    ? await loadOpenRouterDisplay(data.models.map((model) => ({ modelId: model.id, aliases: model.aliases })))
    : null;
  const modelsForClient = data.models.map((model) => ({ ...model, aliases: [] }));
  return (
    <div className="page-shell">
      <header className="page-header compact-page-header"><div><h1>Model leaderboard</h1></div></header>
      <section className="kpi-strip" aria-label="Snapshot summary"><div><span>Ranked models</span><strong>{data.models.filter(model=>model.indexes.mixed?.rank!=null).length}</strong></div><div><span>Benchmarks</span><strong>{data.benchmarks.length}</strong></div><div><span>Snapshot</span><strong>{data.status.snapshotDate ?? "Fixture"}</strong></div><div><span>Method</span><strong>{data.status.methodVersion ?? "Fixture"}</strong></div></section>
      <Suspense fallback={<div className="empty-state" role="status">Loading leaderboard…</div>}><Leaderboard models={modelsForClient} results={data.results} benchmarks={data.benchmarks} status={data.status} openRouter={openRouter} /></Suspense>
    </div>
  );
}
