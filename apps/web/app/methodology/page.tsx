import { sitePath } from "@/lib/site-path";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax/svg";
import YAML from "yaml";
import { Disclosure } from "@/components/ui/disclosure";
import { readProjectDocument } from "@/lib/server/documentation";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "The normative ActualAnalysis Capability Index methodology, rendered directly from the repository documentation.",
};

async function readLiveConfig(): Promise<Record<string, unknown>> {
  for (const candidate of [
    path.resolve(
      process.env.ACTUALANALYSIS_PROJECT_DIR ?? process.cwd(),
      "data/index-config.yaml",
    ),
    path.resolve(process.cwd(), "../../data/index-config.yaml"),
  ]) {
    try {
      return YAML.parse(
        await readFile(/* turbopackIgnore: true */ candidate, "utf8"),
      ) as Record<string, unknown>;
    } catch {
      /* try workspace root */
    }
  }
  return {};
}

export default async function MethodologyPage() {
  const methodology = await readProjectDocument("methodology.md");
  const config = await readLiveConfig();
  const headings = [...methodology.matchAll(/^## (.+)$/gmu)].map(
    (match) => match[1] ?? "",
  );
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "");
  const inference = config.inference as Record<string, unknown> | undefined;
  const priors = config.priors as Record<string, unknown> | undefined;
  const tiers = config.tiers as Record<string, unknown> | undefined;
  const panel = Array.isArray(config.calibration_panel)
    ? (config.calibration_panel as unknown[])
    : [];
  const tierRow = (name: string) => {
    const tier = tiers?.[name] as Record<string, unknown> | undefined;
    if (!tier) return "—";
    return `width ≤ ${String(tier.max_width ?? "—")} · domains ≥ ${String(tier.min_domains ?? "—")} · safe cells ≥ ${String(tier.min_safe_cells ?? "—")} · family share ≤ ${String(tier.max_family_share ?? "—")} · own-data reduction ≥ ${String(tier.min_own_data_reduction ?? "—")} · concentration ≤ ${String(tier.max_concentration ?? "—")}`;
  };
  const rows: Array<[string, string]> = [
    ["Method version", String(config.method_version ?? "—")],
    ["Taxonomy edition", String(config.taxonomy_edition ?? "—")],
    ["Calibration edition", String(config.calibration_edition ?? "—")],
    ["Calibration panel", panel.length ? `${panel.length} systems` : "—"],
    ["Default profile", String(config.default_profile ?? "—")],
    ["Data cutoff", String(config.data_cutoff ?? "—")],
    ["Inference engine", String(inference?.engine ?? "—")],
    ["Chains", String(inference?.chains ?? "—")],
    ["Warmup / chain", String(inference?.warmup ?? "—")],
    ["Samples / chain", String(inference?.samples ?? "—")],
    ["Target accept", String(inference?.target_accept ?? "—")],
    [
      "Convergence gates",
      inference
        ? `R̂ ≤ ${String(inference.max_rhat ?? "—")} · ESS ≥ ${String(inference.min_ess ?? "—")} · E-BFMI ≥ ${String(inference.min_ebfmi ?? "—")} · divergences ≤ ${String(inference.max_divergence_fraction ?? "—")}`
        : "—",
    ],
    ["Verified tier", tierRow("verified")],
    ["Ranked tier", tierRow("ranked")],
    [
      "Domain point score",
      tiers
        ? `width ≤ ${String(tiers.domain_max_width ?? "—")} · own-data reduction ≥ ${String(tiers.domain_min_own_data_reduction ?? "—")}`
        : "—",
    ],
    ["Practical margin", String(tiers?.practical_margin ?? "—")],
    ["Cell residual df", String(priors?.cell_df ?? "—")],
  ];

  return (
    <div className="page-shell methodology-layout">
      <aside className="method-toc">
        <span className="mono-label">On this page</span>
        <nav>
          {headings.map((heading) => (
            <a href={`#${slug(heading)}`} key={heading}>
              {heading}
            </a>
          ))}
        </nav>
        <a className="secondary-button" href={sitePath("/download/")}>
          Download data
        </a>
      </aside>
      <article className="prose methodology-document">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeMathjax]}
          components={{
            table: ({ children }) => (
              <div className="data-table-wrap">
                <table>{children}</table>
              </div>
            ),
            h2: ({ children }) => {
              const label = String(children);
              return <h2 id={slug(label)}>{children}</h2>;
            },
          }}
        >
          {methodology}
        </ReactMarkdown>
        <Disclosure title="Configuration & thresholds">
          <div className="data-table-wrap">
            <table className="data-table live-config-table">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </article>
    </div>
  );
}
