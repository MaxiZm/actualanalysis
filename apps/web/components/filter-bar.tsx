"use client";

import { IndexProfileControl } from "@/components/index-profile-control";
import { TextureButton } from "@/components/ui/texture-button";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SlidersHorizontal, X } from "lucide-react";
import { type BenchmarkRecord, type ModelRecord } from "@/lib/data";
import { DEFAULT_FILTERS, type ExplorerFilters } from "@/lib/filters";
import { titleCase } from "@/lib/format";

export function FilterBar({
  models,
  benchmarks = [],
  value,
  onChange,
  showIndex = true,
  showBenchmarks = true,
}: {
  showIndex?: boolean;
  showBenchmarks?: boolean;
  models: ModelRecord[];
  benchmarks?: Array<Pick<BenchmarkRecord, "name" | "slug">>;
  value: ExplorerFilters;
  onChange: (filters: ExplorerFilters) => void;
}) {
  const set = <K extends keyof ExplorerFilters>(
    key: K,
    next: ExplorerFilters[K],
  ) => onChange({ ...value, [key]: next });
  const toggle = (
    key: "organizations" | "benchmarks" | "highlight",
    item: string,
  ) =>
    set(
      key,
      value[key].includes(item)
        ? value[key].filter((v) => v !== item)
        : [...value[key], item].slice(0, key === "highlight" ? 8 : Infinity),
    );
  const hasFilters =
    value.organizations.length ||
    value.benchmarks.length ||
    value.highlight.length ||
    value.openWeights ||
    value.reasoning !== "all" ||
    value.sizeClass !== "all" ||
    value.modality !== "all" ||
    value.release !== "all" ||
    value.maxPrice !== null ||
    value.priceBasis !== "blended";
  const choices = (items: string[]) =>
    [...new Set(items)]
      .sort()
      .map((item) => ({ value: item, label: titleCase(item) }));
  const select = (
    key: "reasoning" | "sizeClass" | "modality" | "release" | "priceBasis",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label className="compact-field">
      {label}
      <Combobox
        label={label}
        value={value[key]}
        options={options}
        onChange={(item) => set(key, item as (typeof value)[typeof key])}
      />
    </label>
  );
  return (
    <div className="filter-bar" aria-label="Model filters">
      {showIndex ? (
        <IndexProfileControl
          value={value.index}
          onChange={(item) => set("index", item)}
        />
      ) : null}
      <Combobox
        label="Organizations"
        multiple
        value={value.organizations}
        options={choices(models.map((m) => m.organization))}
        onChange={(item) => toggle("organizations", item)}
      />
      {showBenchmarks ? (
        <Combobox
          label="Benchmarks"
          multiple
          value={value.benchmarks}
          options={benchmarks.map((b) => ({ value: b.slug, label: b.name }))}
          onChange={(item) => toggle("benchmarks", item)}
        />
      ) : null}
      <label className="checkbox-label">
        <Checkbox
          checked={value.openWeights}
          onCheckedChange={(checked) => set("openWeights", checked === true)}
        />
        Open weights
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <TextureButton variant="secondary" className="filter-more">
            <SlidersHorizontal size={14} />
            More filters
          </TextureButton>
        </PopoverTrigger>
        <PopoverContent align="end" className="cult-filter-panel">
          {select("reasoning", "Reasoning", [
            { value: "all", label: "All" },
            ...choices(models.map((m) => m.reasoning)),
          ])}
          {select("sizeClass", "Size", [
            { value: "all", label: "All" },
            ...choices(
              models.flatMap((m) => (m.sizeClass ? [m.sizeClass] : [])),
            ),
          ])}
          {select("modality", "Modality", [
            { value: "all", label: "All" },
            ...choices(models.flatMap((m) => (m.modality ? [m.modality] : []))),
          ])}
          {select("release", "Released", [
            { value: "all", label: "Any date" },
            ...["2026", "2025", "2024"].map((y) => ({
              value: y,
              label: `${y}+`,
            })),
          ])}
          <label className="compact-field">
            Max $/M
            <Input
              aria-label="Max $/M"
              inputMode="decimal"
              value={value.maxPrice ?? ""}
              placeholder="Any price"
              onChange={(event) =>
                set(
                  "maxPrice",
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            />
          </label>
          {select(
            "priceBasis",
            "Price basis",
            choices(["blended", "input", "output"]),
          )}
        </PopoverContent>
      </Popover>
      <div className="highlight-picker">
        <Combobox
          label="Highlight models"
          placeholder="Highlight models"
          multiple
          value={value.highlight}
          options={models.map((m) => ({ value: m.slug, label: m.name }))}
          onChange={(item) => toggle("highlight", item)}
        />
      </div>
      {hasFilters ? (
        <TextureButton
          variant="ghost"
          onClick={() => onChange({ ...DEFAULT_FILTERS, index: value.index })}
        >
          Clear
        </TextureButton>
      ) : null}
      {value.highlight.length ? (
        <div className="selected-models">
          {value.highlight.map((slug) => (
            <TextureButton
              size="sm"
              variant="minimal"
              key={slug}
              onClick={() => toggle("highlight", slug)}
            >
              {models.find((m) => m.slug === slug)?.name ?? slug}
              <X size={12} />
            </TextureButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
