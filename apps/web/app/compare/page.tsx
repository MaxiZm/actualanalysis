import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareWorkbench } from "@/components/compare-workbench";
import { loadDisplaySiteData } from "@/lib/server/snapshot";

export const metadata: Metadata = { title: "Compare", description: "Compare model capability, price, release timing, and benchmark shape." };

export default async function ComparePage() {
  const data=await loadDisplaySiteData();
  const targetMethodVersion = "1.2.2";
  const activeMethodVersion = data.status.methodVersion ?? "not published";
  const isActiveAci122 = data.status.mode === "snapshot" && activeMethodVersion === targetMethodVersion;
  const isLegacySnapshot = data.status.mode === "snapshot" && !isActiveAci122;
  return <div className="page-shell"><header className="page-header compact-page-header"><div><span className="eyebrow">{isActiveAci122 ? "Validated methodology" : "Methodology target"}</span><h1>Compare models</h1><p className="page-lede">Active methodology: ACI {activeMethodVersion}</p><div className="page-meta"><span className={`badge ${isActiveAci122 ? "badge-accent" : ""}`}>{isActiveAci122 ? "ACI 1.2.2 · publication passed" : `Target ACI ${targetMethodVersion}`}</span>{data.status.snapshotDate ? <span className="badge">Snapshot {data.status.snapshotDate}</span> : null}</div></div></header>{isActiveAci122 ? <aside className="method-proof" role="status"><strong>ACI 1.2.2 is the active scoring method.</strong><span>These comparisons use the published joint posterior after the per-domain calibration-panel coverage audit, LKJ(2) correlated trait estimation, and zero-divergence NUTS convergence gates. Intervals and evidence tiers remain visible for every model.</span></aside> : null}{isLegacySnapshot ? <aside className="method-warning" role="status"><strong>Legacy published snapshot.</strong> These charts use method {activeMethodVersion}, not ACI 1.2.2. The 1.2.2 result is withheld until its source protocols, per-domain calibration panel, and convergence pass the publication gates.</aside> : null}<Suspense fallback={<div className="empty-state" role="status">Loading comparison…</div>}><CompareWorkbench models={data.models} benchmarks={data.benchmarks} results={data.results}/></Suspense></div>;
}
