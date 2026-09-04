import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import YAML from "yaml";

export const metadata: Metadata = {
  title: "Methodology",
  description: "The normative ActualAnalysis Capability Index methodology, rendered directly from the repository documentation.",
};

async function readMethodology(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "docs/methodology.md"),
    path.resolve(process.cwd(), "../../docs/methodology.md"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(/* turbopackIgnore: true */ candidate, "utf8");
    } catch {
      // npm workspaces and direct Next invocations use different working directories.
    }
  }
  throw new Error("Could not locate docs/methodology.md from the application working directory.");
}

async function readLiveConfig(): Promise<Record<string, unknown>> {
  for (const candidate of [path.resolve(process.cwd(), "data/index-config.yaml"), path.resolve(process.cwd(), "../../data/index-config.yaml")]) {
    try { return YAML.parse(await readFile(/* turbopackIgnore: true */ candidate, "utf8")) as Record<string, unknown>; } catch { /* try workspace root */ }
  }
  return {};
}

export default async function MethodologyPage() {
  const methodology = await readMethodology();
  const config = await readLiveConfig();
  const headings = [...methodology.matchAll(/^## (.+)$/gmu)].map((match) => match[1] ?? "");
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const inference = config.inference as Record<string, unknown> | undefined;
  const priors = config.priors as Record<string, unknown> | undefined;

  return (
    <div className="page-shell methodology-layout">
      <aside className="method-toc"><span className="mono-label">On this page</span><nav>{headings.map((heading)=><a href={`#${slug(heading)}`} key={heading}>{heading}</a>)}</nav><a className="secondary-button" href="/download">Download data</a></aside>
      <article className="prose methodology-document">
        <section aria-labelledby="live-config"><h2 id="live-config">Live method config</h2><div className="data-table-wrap"><table className="data-table"><tbody><tr><th>Version</th><td>{String(config.method_version ?? "—")}</td></tr><tr><th>Taxonomy</th><td>{String(config.taxonomy_edition ?? "—")}</td></tr><tr><th>Calibration</th><td>{String(config.calibration_edition ?? "—")}</td></tr><tr><th>Reference benchmark</th><td>{String(config.reference_benchmark ?? "None (unpinned 1.2.2, panel-identified)")}</td></tr><tr><th>Inference</th><td>{String(inference?.engine ?? "—")}</td></tr><tr><th>Chains</th><td>{String(inference?.chains ?? "—")}</td></tr><tr><th>Samples / chain</th><td>{String(inference?.samples ?? "—")}</td></tr><tr><th>Cell residual df</th><td>{String(priors?.cell_df ?? "—")}</td></tr></tbody></table></div></section>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{h2:({children})=>{const label=String(children); return <h2 id={slug(label)}>{children}</h2>;}}}>{methodology}</ReactMarkdown>
      </article>
    </div>
  );
}
