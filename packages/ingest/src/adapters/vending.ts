import { createHash } from "node:crypto";
import { parse } from "acorn";
import type { AdapterContext, AdapterWarning, IngestAdapter, RawResult } from "../types.js";
import { output } from "../lib/adapter.js";
import { fetchText } from "../lib/http.js";
import { isRow } from "../lib/tabular.js";
import { benchmarkResult, dateOnly } from "./helpers.js";

export const VENDING_BENCH_URL = "https://andonlabs.com/evals/vending-bench-2";

type SyntaxNode = Record<string, unknown>;
function astNode(value: unknown): SyntaxNode {
  if (!isRow(value) || typeof value.type !== "string") throw new Error("Expected a JavaScript syntax node");
  return value;
}
function propertyName(property: unknown): string | undefined {
  const p = astNode(property);
  if (p.type !== "Property" || p.computed || p.method || p.kind !== "init") return undefined;
  const key = astNode(p.key);
  return typeof key.name === "string" ? key.name : typeof key.value === "string" ? key.value : undefined;
}
function literal(value: unknown): unknown {
  const node = astNode(value);
  if (node.type === "Literal") return node.value;
  if (node.type === "ArrayExpression" && Array.isArray(node.elements)) return node.elements.map(literal);
  if (node.type === "ObjectExpression" && Array.isArray(node.properties)) return Object.fromEntries(node.properties.map((p) => {
    const key = propertyName(p);
    if (key === undefined) throw new Error("Vending source data contains a non-literal property");
    return [key, literal(astNode(p).value)];
  }));
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const number = literal(node.argument);
    if (typeof number === "number") return -number;
  }
  if (node.type === "UnaryExpression" && node.operator === "!") return !literal(node.argument);
  throw new Error(`Vending source data is not a static literal: ${String(node.type)}`);
}
function statements(source: string): SyntaxNode[] {
  return parse(source, { ecmaVersion: "latest", sourceType: "module" }).body as unknown as SyntaxNode[];
}

/** Parse the public bundle's vb2 object without executing JavaScript or importing Arena data. */
export function extractVendingRuns(source: string): Record<string, unknown> {
  for (const statement of statements(source)) {
    if (statement.type !== "VariableDeclaration" || !Array.isArray(statement.declarations)) continue;
    for (const declaration of statement.declarations) {
      const init = astNode(declaration).init;
      if (!isRow(init) || init.type !== "ObjectExpression" || !Array.isArray(init.properties)) continue;
      const vb2 = init.properties.find((property) => propertyName(property) === "vb2");
      if (!vb2) continue;
      const data = literal(astNode(vb2).value);
      if (!isRow(data)) throw new Error("Vending vb2 data is not an object");
      return data;
    }
  }
  throw new Error("Vending source bundle has no static vb2 run table");
}

function sameOriginUrl(path: string, base: string): string {
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin || !["https:", "http:"].includes(url.protocol)) throw new Error("Vending source asset is outside its public site origin");
  return url.href;
}

function modelIdentity(label: string) {
  const effort = / - (High|Low|Medium|Max|None)$/.exec(label)?.[1]?.toLowerCase();
  const provider = / \((Fireworks|Moonshot)\)$/.exec(label)?.[1];
  const customTools = label.endsWith(" Custom Tools");
  const model = label.replace(/ - (High|Low|Medium|Max|None)$/, "").replace(/ \((Fireworks|Moonshot)\)$/, "").replace(/ Custom Tools$/, "");
  return { model, effort, provider, customTools };
}

/** Full Vending-Bench 2 native data, rather than the ten initially rendered HTML rows. */
export class VendingBenchAdapter implements IngestAdapter {
  readonly id = "andonlabs";
  readonly failSoft = true;

  constructor(private readonly url = VENDING_BENCH_URL) {}

  async ingest(context: AdapterContext) {
    const html = await fetchText(context, this.url);
    const appPath = /import\(["']([^"']*\/entry\/app\.[^"']+\.js)["']\)/.exec(html)?.[1];
    const nodeIds = /node_ids\s*:\s*\[([\d,\s]+)\]/.exec(html)?.[1]?.split(",").map((id) => Number(id.trim()));
    const pageNode = nodeIds?.at(-1);
    if (!appPath || pageNode === undefined) throw new Error("Vending page has no recognizable Svelte application and route metadata");
    const appUrl = sameOriginUrl(appPath, this.url);
    const app = await fetchText(context, appUrl);
    const nodePath = new RegExp(`["']([^"']*/nodes/${pageNode}\\.[^"']+\\.js)["']`).exec(app)?.[1];
    if (!nodePath) throw new Error("Vending application manifest has no matching page module");
    const nodeUrl = sameOriginUrl(nodePath, appUrl);
    const page = await fetchText(context, nodeUrl);
    const runBinding = /([A-Za-z_$][\w$]*)\.runs\.vb2\b/.exec(page)?.[1];
    if (!runBinding) throw new Error("Vending page module does not reference the vb2 dataset");
    const imported = statements(page).find((statement) => statement.type === "ImportDeclaration"
      && Array.isArray(statement.specifiers)
      && statement.specifiers.some((specifier) => astNode(astNode(specifier).local).name === runBinding));
    const sourcePath = imported ? astNode(imported.source).value : undefined;
    if (typeof sourcePath !== "string") throw new Error("Vending page dataset import could not be resolved");
    const dataUrl = sameOriginUrl(sourcePath, nodeUrl);
    const dataText = await fetchText(context, dataUrl);
    const runs = extractVendingRuns(dataText);
    const records: RawResult[] = [], warnings: AdapterWarning[] = [];
    const sourceHash = createHash("sha256").update(dataText).digest("hex");
    for (const [label, run] of Object.entries(runs)) {
      if (!isRow(run)) continue;
      const score = run.final_value, se = run.final_value_sem, n = run.num_final_values ?? run.num_epochs;
      if (typeof score !== "number" || !Number.isFinite(score) || typeof se !== "number" || !Number.isFinite(se) || se < 0 || typeof n !== "number" || !Number.isInteger(n) || n < 1) {
        warnings.push({ code: "partial", message: `Vending configuration ${label} has incomplete final-balance/run/SEM data`, url: dataUrl });
        continue;
      }
      const identity = modelIdentity(label);
      records.push(benchmarkResult({
        model: identity.model, benchmark: "Vending-Bench 2", benchmark_id: "vending-bench-2", source_id: "andonlabs",
        benchmark_version: "2", evaluation_run_id: `vb2:${label}`, lineage_id: `andonlabs:vb2:${label}`,
        metadata_incomplete: true, score, score_unit: "currency", se, uncertainty_type: "se", uncertainty_value: se, uncertainty_unit: "run",
        n_runs: n, k_trials: n, ...(identity.effort ? { effort_tier: identity.effort } : {}),
        harness: identity.customTools ? "Vending-Bench 2 custom tools" : "Vending-Bench 2", harness_class: "common",
        observed_on: dateOnly(context.now()), source_url: this.url, provenance: "independent", origin_provenance: "independent", host_source: "andonlabs",
        config: { source_model_configuration: label, custom_tools: identity.customTools, ...(identity.effort ? { reasoning_effort: identity.effort } : {}), ...(identity.provider ? { provider: identity.provider } : {}) },
        metadata: {
          source_configuration: label, source_data_url: dataUrl, source_data_sha256: sourceHash,
          reported_num_epochs: typeof run.num_epochs === "number" ? run.num_epochs : null,
          reported_num_final_values: typeof run.num_final_values === "number" ? run.num_final_values : null,
          reported_final_value_std: typeof run.final_value_std === "number" ? run.final_value_std : null,
          reported_final_value_ci95_half_width: typeof run.final_value_ci95 === "number" ? run.final_value_ci95 : null,
          uncertainty_note: "Native final_value_sem is standard error across num_final_values (or num_epochs when absent).",
          score_definition: "Arithmetic mean final money balance; losses retained. Excludes Arena and geometric mean.",
        },
      }));
    }
    return output(this.id, context, records, warnings);
  }
}
