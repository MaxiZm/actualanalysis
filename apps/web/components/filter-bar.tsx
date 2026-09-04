"use client";

import { useState } from "react";
import { INDEX_KINDS, type BenchmarkRecord, type ModelRecord } from "@/lib/data";
import { DEFAULT_FILTERS, type ExplorerFilters } from "@/lib/filters";
import { titleCase } from "@/lib/format";

export function FilterBar({ models, benchmarks = [], value, onChange }: {
  models: ModelRecord[];
  benchmarks?: Array<Pick<BenchmarkRecord, "name" | "slug">>;
  value: ExplorerFilters;
  onChange: (filters: ExplorerFilters) => void;
}) {
  const organizations = [...new Set(models.map((model) => model.organization))].sort();
  const reasoning = [...new Set(models.map((model) => model.reasoning))].sort();
  const sizes = [...new Set(models.map((model) => model.sizeClass).filter(Boolean))].sort() as string[];
  const modalities = [...new Set(models.map((model) => model.modality).filter(Boolean))].sort() as string[];
  const [highlightQuery, setHighlightQuery] = useState("");
  const set = <K extends keyof ExplorerFilters>(key: K, next: ExplorerFilters[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="filter-bar" aria-label="Model filters">
      <div className="segmented-control compact-segments" aria-label="Capability index">
        {INDEX_KINDS.map((kind) => <button type="button" className="segment-button" aria-pressed={value.index === kind} onClick={() => set("index", kind)} key={kind}>{titleCase(kind)}</button>)}
      </div>
      <details className="facet-menu"><summary>Organizations{value.organizations.length ? ` · ${value.organizations.length}` : ""}</summary><div className="facet-popover">{organizations.map((org)=><button type="button" className="chip" aria-pressed={value.organizations.includes(org)} key={org} onClick={()=>set("organizations",value.organizations.includes(org)?value.organizations.filter(item=>item!==org):[...value.organizations,org])}><i style={{background:`var(--org-${org.toLowerCase().replace(/[^a-z0-9]+/gu,"-")}, var(--color-org-1))`}}/>{org}</button>)}</div></details>
      {benchmarks.length ? <details className="facet-menu"><summary>Benchmarks{value.benchmarks.length ? ` · ${value.benchmarks.length}` : ""}</summary><div className="facet-popover">{benchmarks.map((benchmark)=><button type="button" className="chip" aria-pressed={value.benchmarks.includes(benchmark.slug)} key={benchmark.slug} onClick={()=>set("benchmarks",value.benchmarks.includes(benchmark.slug)?value.benchmarks.filter(item=>item!==benchmark.slug):[...value.benchmarks,benchmark.slug])}>{benchmark.name}</button>)}</div></details> : null}
      <label className="checkbox-label"><input type="checkbox" checked={value.openWeights} onChange={(event) => set("openWeights", event.target.checked)} /> Open weights</label>
      <label className="checkbox-label"><input type="checkbox" checked={value.provisional} onChange={(event) => set("provisional", event.target.checked)} /> Provisional</label>
      <details className="advanced-filters">
        <summary>More filters</summary>
        <div className="advanced-filter-panel">
          <label className="compact-field">Reasoning<select value={value.reasoning} onChange={(event) => set("reasoning", event.target.value)}><option value="all">All</option>{reasoning.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
          <label className="compact-field">Size<select value={value.sizeClass} onChange={(event) => set("sizeClass", event.target.value)}><option value="all">All</option>{sizes.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
          <label className="compact-field">Modality<select value={value.modality} onChange={(event) => set("modality", event.target.value)}><option value="all">All</option>{modalities.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
          <label className="compact-field">Released<select value={value.release} onChange={(event) => set("release", event.target.value)}><option value="all">Any date</option><option value="2026">2026+</option><option value="2025">2025+</option><option value="2024">2024+</option></select></label>
          <label className="compact-field">Max $/M<input inputMode="decimal" value={value.maxPrice ?? ""} placeholder="Any" onChange={(event) => set("maxPrice", event.target.value ? Number(event.target.value) : null)} /></label>
          <label className="compact-field">Price basis<select value={value.priceBasis} onChange={(event)=>set("priceBasis",event.target.value as ExplorerFilters["priceBasis"])}><option value="blended">Blended</option><option value="input">Input</option><option value="output">Output</option></select></label>
        </div>
      </details>
      <div className="highlight-picker"><label className="sr-only" htmlFor="highlight-model">Highlight models</label><input id="highlight-model" list="highlight-options" placeholder="Highlight models" value={highlightQuery} onChange={(event)=>setHighlightQuery(event.target.value)} onKeyDown={(event)=>{if(event.key!=="Enter")return;const model=models.find(item=>item.name.toLowerCase()===highlightQuery.toLowerCase()||item.slug===highlightQuery);if(model&&!value.highlight.includes(model.slug)&&value.highlight.length<8)set("highlight",[...value.highlight,model.slug]);setHighlightQuery("");}}/><datalist id="highlight-options">{models.map(model=><option value={model.name} key={model.slug}/>)}</datalist>{value.highlight.map(slug=><button className="chip" type="button" key={slug} onClick={()=>set("highlight",value.highlight.filter(item=>item!==slug))}>{models.find(model=>model.slug===slug)?.name??slug} ×</button>)}</div>
      <button className="filter-reset" type="button" onClick={() => onChange({ ...DEFAULT_FILTERS, index: value.index })}>Clear</button>
    </div>
  );
}
