"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SwapIcon } from "@/components/icons";
import {
  MinimalCard,
  MinimalCardContent,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { TextureButton } from "@/components/ui/texture-button";
import {
  type BenchmarkRecord,
  type IndexKind,
  type ModelRecord,
  type ResultRecord,
} from "@/lib/data";
import {
  comparisonValue,
  comparisonUnit,
  formatPercent,
  formatPrice,
  formatNative,
  formatTokens,
  titleCase,
} from "@/lib/format";

export const PROFILE_DOMAIN_WEIGHTS: Record<
  IndexKind,
  Record<string, number>
> = {
  mixed: {
    agentic: 0.2,
    "software-code": 0.2,
    reasoning: 0.2,
    "knowledge-information": 0.2,
    "communication-professional": 0.2,
  },
  agentic: {
    agentic: 0.6,
    "software-code": 0.3,
    reasoning: 0.1,
    "knowledge-information": 0,
    "communication-professional": 0,
  },
  chat: {
    "communication-professional": 0.4,
    "knowledge-information": 0.3,
    reasoning: 0.2,
    "software-code": 0.1,
    agentic: 0,
  },
};

export const DOMAIN_LABELS: Record<string, string> = {
  agentic: "Agentic",
  "software-code": "Software & Code",
  reasoning: "Reasoning",
  "knowledge-information": "Knowledge",
  "communication-professional": "Communication",
};

export function getBenchmarkDomain(benchmark: BenchmarkRecord): string {
  const cats = benchmark.categories || [];
  if (
    cats.some((c) =>
      [
        "terminal-use",
        "computer-use",
        "tool-use",
        "long-horizon",
        "customer-service",
      ].includes(c),
    )
  )
    return "agentic";
  if (cats.some((c) => ["software-engineering", "coding"].includes(c)))
    return "software-code";
  if (
    cats.some((c) =>
      ["mathematics", "science", "reasoning", "abstract-reasoning"].includes(c),
    )
  )
    return "reasoning";
  if (cats.some((c) => ["knowledge", "factuality", "long-context"].includes(c)))
    return "knowledge-information";
  if (cats.some((c) => ["human-preference", "professional-tasks"].includes(c)))
    return "communication-professional";
  return benchmark.tags.includes("agentic")
    ? "agentic"
    : "communication-professional";
}

export function getPairwiseWinProb(
  modelA: ModelRecord,
  modelB: ModelRecord,
  kind: IndexKind,
): number | null {
  const systemB = modelB.indexes[kind]?.systemId ?? modelB.id;
  const systemA = modelA.indexes[kind]?.systemId ?? modelA.id;
  const pA =
    modelA.indexes[kind]?.pairwise?.[systemB] ??
    modelA.indexes[kind]?.pairwise?.[
      modelA.id === modelB.id ? modelB.id : modelB.slug
    ] ??
    modelA.indexes[kind]?.pairwise?.[modelB.id];
  if (pA !== undefined && pA !== null) return pA;
  const pB =
    modelB.indexes[kind]?.pairwise?.[systemA] ??
    modelB.indexes[kind]?.pairwise?.[
      modelB.id === modelA.id ? modelA.id : modelA.slug
    ] ??
    modelB.indexes[kind]?.pairwise?.[modelA.id];
  if (pB !== undefined && pB !== null) return 1 - pB;
  return null;
}

interface ModelCompareInspectorProps {
  openRouter?: OpenRouterDisplayOverlay | null;
  models: ModelRecord[];
  benchmarks: BenchmarkRecord[];
  results: ResultRecord[];
  index: IndexKind;
  priceBasis: "blended" | "input" | "output";
  highlightedSlugs: string[];
  onToggleHighlight: (idOrSlug: string) => void;
}

import { displayPrice } from "@/lib/display-economics";
import type { OpenRouterDisplayOverlay } from "@/lib/openrouter-display";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { OrganizationLogo } from "@/components/organization-logo";
import { RuntimeValue } from "@/components/runtime-value";
import { CostPerTaskValue } from "@/components/cost-per-task-value";
import { ScoreValue } from "@/components/score-value";
import { uniqueUsedResultPairs } from "@/lib/result-pairs";

export function ModelCompareInspector({
  models,
  benchmarks,
  results,
  index,
  priceBasis,
  highlightedSlugs,
  openRouter,
}: ModelCompareInspectorProps) {
  const sorted = useMemo(
    () =>
      [...models].sort(
        (a, b) =>
          (b.indexes[index]?.robustScore ?? -Infinity) -
          (a.indexes[index]?.robustScore ?? -Infinity),
      ),
    [models, index],
  );
  const [aSlug, setA] = useState(highlightedSlugs[0] ?? sorted[0]?.slug ?? "");
  const [bSlug, setB] = useState(
    highlightedSlugs[1] ??
      sorted.find((m) => m.slug !== (highlightedSlugs[0] ?? sorted[0]?.slug))
        ?.slug ??
      "",
  );
  const [query, setQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(true);
  const [domain, setDomain] = useState("all");
  const a = models.find((m) => m.slug === aSlug) ?? sorted[0];
  const b =
    models.find((m) => m.slug === bSlug) ??
    sorted.find((m) => m.slug !== a?.slug) ??
    sorted[0];
  const pairs = useMemo(() => uniqueUsedResultPairs(results), [results]);
  if (!a || !b) return null;
  const p = getPairwiseWinProb(a, b, index);
  const rows = benchmarks
    .map((benchmark) => ({
      benchmark,
      a: pairs.find(
        (r) => r.modelSlug === a.slug && r.benchmarkSlug === benchmark.slug,
      ),
      b: pairs.find(
        (r) => r.modelSlug === b.slug && r.benchmarkSlug === benchmark.slug,
      ),
    }))
    .filter((row) => row.a || row.b);
  const common = rows.filter((row) => row.a && row.b).length;
  const shown = rows.filter(
    (row) =>
      (!commonOnly || (row.a && row.b)) &&
      (domain === "all" || getBenchmarkDomain(row.benchmark) === domain) &&
      row.benchmark.name.toLowerCase().includes(query.toLowerCase()),
  );
  const options = sorted.map((m) => ({ value: m.slug, label: m.name }));
  const price = (m: ModelRecord) => displayPrice(m, priceBasis, openRouter);
  return (
    <section className="model-compare-section" aria-labelledby="h2h-heading">
      <div className="section-heading">
        <h2 id="h2h-heading">Compare two models</h2>
        <p>
          Choose two models. Compare capability estimates, runtime and
          source-backed results.
        </p>
      </div>
      <div className="comparison-pickers">
        <label className="comparison-picker">
          <span>First model</span>
          <Combobox
            label="First model"
            value={a.slug}
            options={options}
            onChange={setA}
          />
          <span className="comparison-org">
            <OrganizationLogo organization={a.organization} />
            {a.organization}
            <Link href={`/models/${a.slug}`}>Model details ↗</Link>
          </span>
        </label>
        <TextureButton
          variant="secondary"
          aria-label="Swap models"
          onClick={() => {
            setA(b.slug);
            setB(a.slug);
          }}
        >
          <SwapIcon />
        </TextureButton>
        <label className="comparison-picker">
          <span>Second model</span>
          <Combobox
            label="Second model"
            value={b.slug}
            options={options}
            onChange={setB}
          />
          <span className="comparison-org">
            <OrganizationLogo organization={b.organization} />
            {b.organization}
            <Link href={`/models/${b.slug}`}>Model details ↗</Link>
          </span>
        </label>
      </div>
      <MinimalCard className="comparison-summary">
        <MinimalCardTitle>At a glance</MinimalCardTitle>
        <MinimalCardContent>
          <div className="data-table-wrap">
            <table className="data-table comparison-metrics">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>{a.name}</th>
                  <th>{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {(["mixed", "agentic", "chat"] as const).map((kind) => (
                  <tr
                    key={kind}
                    className={
                      index === kind ? "active-profile-row" : undefined
                    }
                  >
                    <th scope="row">{titleCase(kind)} index</th>
                    <td>
                      <ScoreValue index={a.indexes[kind]} uncertainty />
                    </td>
                    <td>
                      <ScoreValue index={b.indexes[kind]} uncertainty />
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">AA cost per task</th>
                  <td>
                    <CostPerTaskValue cost={a.costPerTask} />
                  </td>
                  <td>
                    <CostPerTaskValue cost={b.costPerTask} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">{titleCase(priceBasis)} price / M</th>
                  <td>{formatPrice(price(a))}</td>
                  <td>{formatPrice(price(b))}</td>
                </tr>
                <tr>
                  <th scope="row">Output speed · tok/s</th>
                  <td>
                    <RuntimeValue speed={a.speed} metric="speed" />
                  </td>
                  <td>
                    <RuntimeValue speed={b.speed} metric="speed" />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Time to first token</th>
                  <td>
                    <RuntimeValue speed={a.speed} metric="ttft" />
                  </td>
                  <td>
                    <RuntimeValue speed={b.speed} metric="ttft" />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Context</th>
                  <td>{formatTokens(a.contextWindow)}</td>
                  <td>{formatTokens(b.contextWindow)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="comparison-verdict">
            {p === null
              ? "Pairwise probability is unavailable for this pair. Compare the uncertainty intervals and shared tests; a small median gap alone does not establish an ordering."
              : p >= 0.9
                ? `${a.name} has ${formatPercent(p, 0)} posterior probability of a higher ${index} index.`
                : p <= 0.1
                  ? `${b.name} has ${formatPercent(1 - p, 0)} posterior probability of a higher ${index} index.`
                  : "The posterior does not establish a clear ordering for this pair."}{" "}
            <span>{common} shared benchmarks.</span>
          </p>
        </MinimalCardContent>
      </MinimalCard>
      <div className="section-heading">
        <h2>Benchmark results</h2>
        <p>
          Native source scores. Different harnesses and settings may affect
          comparisons; each result links to its evidence.
        </p>
      </div>
      <div className="comparison-toolbar">
        <Input
          aria-label="Search benchmarks"
          placeholder="Search benchmarks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Combobox
          label="Domain"
          value={domain}
          onChange={setDomain}
          options={[
            { value: "all", label: "All domains" },
            ...Object.entries(DOMAIN_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <label className="checkbox-label">
          <Checkbox
            checked={commonOnly}
            onCheckedChange={(v) => setCommonOnly(v === true)}
          />
          Shared results only
        </label>
      </div>
      <p className="table-scroll-hint">
        Swipe the results table to see both models and their difference →
      </p>
      <div className="data-table-wrap">
        <table className="data-table comparison-evidence">
          <thead>
            <tr>
              <th>Benchmark</th>
              <th>{a.name}</th>
              <th>{b.name}</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const delta =
                row.a &&
                row.b &&
                comparisonUnit(row.a.scoreUnit) ===
                  comparisonUnit(row.b.scoreUnit)
                  ? comparisonValue(row.a.rawScore, row.a.scoreUnit) -
                    comparisonValue(row.b.rawScore, row.b.scoreUnit)
                  : null;
              return (
                <tr key={row.benchmark.slug}>
                  <th scope="row">
                    <Link href={`/benchmarks/${row.benchmark.slug}`}>
                      {row.benchmark.name}
                    </Link>
                    <span className="cell-note">
                      {DOMAIN_LABELS[getBenchmarkDomain(row.benchmark)]}
                    </span>
                  </th>
                  {[row.a, row.b].map((result, i) => (
                    <td key={i}>
                      {result ? (
                        <>
                          <a
                            className="result-value"
                            href={result.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {formatNative(result.rawScore, result.scoreUnit)} ↗
                          </a>
                          <span className="cell-note">
                            {result.sourceKind === "self-reported"
                              ? "Vendor report"
                              : result.sourceName}
                          </span>
                        </>
                      ) : (
                        <span className="cell-note">Not reported</span>
                      )}
                    </td>
                  ))}
                  <td>
                    {delta === null ? (
                      <span className="cell-note">No paired result</span>
                    ) : (
                      <span className="mono-val">
                        {delta > 0 ? "+" : ""}
                        {comparisonUnit(row.a!.scoreUnit) === "percent"
                          ? `${delta.toFixed(1)} pp`
                          : formatNative(
                              delta,
                              comparisonUnit(row.a!.scoreUnit),
                            )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No benchmarks match. Try all domains or include unpaired
                  results.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="source-line">
        * Preliminary posterior estimate. Differences above describe observed
        benchmark results, not contributions to the index.{" "}
        <Link href="/methodology">How scores are calculated ↗</Link>
      </p>
    </section>
  );
}
