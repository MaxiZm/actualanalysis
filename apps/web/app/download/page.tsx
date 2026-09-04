import type { Metadata } from "next";

import { SNAPSHOT_ASSETS } from "@/lib/snapshot-assets";
import { loadSiteData } from "@/lib/server/snapshot";

/* eslint-disable @next/next/no-html-link-for-pages -- API resources require full document navigation so the browser renders their raw JSON responses. */

export const metadata: Metadata = {
  title: "Download",
  description: "Download versioned ActualAnalysis datasets and inspect the public, keyless JSON API.",
};

export default async function DownloadPage() {
  const data = await loadSiteData();
  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>Take the data. Check the work.</h1>
          <div className="page-meta"><span className="badge badge-accent">Source-aware snapshots</span><span className="badge">No API key</span></div>
        </div>
        <p className="page-lede">Snapshots include observations, fitted cells, index scores, parameters, and run diagnostics. Source licenses travel with the data; speed is excluded.</p>
      </header>

      <aside className="callout">
        <strong>{data.status.mode === "snapshot" ? `${data.status.snapshotDate} snapshot active.` : "No published snapshot yet."}</strong>
        <span>{data.status.mode === "snapshot"
          ? "The site and keyless API are serving the newest complete, validated committed export."
          : "The app is currently rendering synthetic fixture data. The production pipeline must commit and register a dated snapshot before published downloads become active."}</span>
      </aside>

      <section className="download-list" aria-label="Data downloads and API">
        <article className="download-row">
          <div><h2>Latest versioned snapshot</h2><p>Dated CSV and JSON files with a manifest, method version, and source provenance.</p></div>
          <div className="download-actions">{data.status.mode === "snapshot"
            ? <><a className="primary-button" href="/api/v1/download/index-scores.csv">Index CSV</a><a className="secondary-button" href="/api/v1/download/snapshot.json">Snapshot JSON</a></>
            : <><button className="secondary-button" type="button" disabled>CSV unavailable</button><button className="secondary-button" type="button" disabled>JSON unavailable</button></>}</div>
        </article>
        {data.status.mode === "snapshot" ? (
          <article className="download-row">
            <div><h2>Audit CSV tables</h2><p>Download observations, fitted cells, parameters, registry rows, and pricing from the same validated snapshot. Check each source’s <code>redistributable</code> flag before reuse; restricted evidence is display-only.</p></div>
            <div className="download-actions">
              {SNAPSHOT_ASSETS.filter((asset) => asset.format === "csv" && asset.name !== "index-scores.csv").map((asset) => (
                <a className="secondary-button" href={`/api/v1/download/${asset.name}`} key={asset.name}>{asset.label}</a>
              ))}
            </div>
          </article>
        ) : null}
        <article className="download-row">
          <div><h2>{data.status.mode === "snapshot" ? "Public API" : "Fixture API"}</h2><p>{data.status.mode === "snapshot"
            ? "Inspect the published response envelope. Every response identifies its snapshot date and source-aware licensing status."
            : <>Inspect the response envelope and integration shape. Every response declares <code>published: false</code> and repeats the fixture disclaimer.</>}</p></div>
          <div className="download-actions"><a className="primary-button" href="/api/v1/models">Open model JSON</a><a className="secondary-button" href="/api/v1/runs">Open run JSON</a></div>
        </article>
        <article className="download-row">
          <div><h2>Index endpoints</h2><p>One resource per index kind, with CORS open and no authentication.</p></div>
          <div className="download-actions"><a className="secondary-button" href="/api/v1/index/mixed">Mixed</a><a className="secondary-button" href="/api/v1/index/agentic">Agentic</a><a className="secondary-button" href="/api/v1/index/chat">Chat</a></div>
        </article>
      </section>
    </div>
  );
}
