"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SearchIcon } from "@/components/icons";
import type { BenchmarkRecord, ModelRecord } from "@/lib/data";

interface CommandItem {
  label: string;
  href: string;
  group: "Pages" | "Models" | "Benchmarks";
  shortcut?: string;
}

const PAGE_ITEMS: CommandItem[] = [
  { label: "Leaderboard", href: "/", group: "Pages", shortcut: "G L" },
  { label: "Charts", href: "/charts", group: "Pages", shortcut: "G C" },
  { label: "Methodology", href: "/methodology", group: "Pages", shortcut: "G M" },
  { label: "Changelog", href: "/changelog", group: "Pages" },
  { label: "Download data", href: "/download", group: "Pages" },
];

const GROUPS: CommandItem["group"][] = ["Pages", "Models", "Benchmarks"];

export function CommandPalette({
  models,
  benchmarks,
}: {
  models: Array<Pick<ModelRecord, "name" | "slug">>;
  benchmarks: Array<Pick<BenchmarkRecord, "name" | "slug">>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const commandItems = useMemo<CommandItem[]>(() => [
    ...PAGE_ITEMS,
    ...models.map((model) => ({
      label: model.name,
      href: `/models/${model.slug}`,
      group: "Models" as const,
    })),
    ...benchmarks.map((benchmark) => ({
      label: benchmark.name,
      href: `/benchmarks/${benchmark.slug}`,
      group: "Benchmarks" as const,
    })),
  ], [benchmarks, models]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return commandItems;
    return commandItems.filter((item) =>
      `${item.group} ${item.label}`.toLocaleLowerCase().includes(normalized),
    );
  }, [commandItems, query]);

  function openPalette() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closePalette() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setIsOpen(false);
  }

  function chooseItem(item: CommandItem) {
    closePalette();
    router.push(item.href);
  }

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (dialogRef.current?.open) closePalette();
        else openPalette();
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (!filteredItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % filteredItems.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + filteredItems.length) % filteredItems.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = filteredItems[activeIndex];
      if (item) chooseItem(item);
    }
  }

  return (
    <>
      <button
        className="search-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Search pages, models, and benchmarks"
        onClick={openPalette}
      >
        <SearchIcon />
        <span className="search-trigger-label">Search data</span>
        <span className="search-trigger-shortcut" aria-hidden="true">
          ⌘K
        </span>
      </button>

      <dialog
        className="command-dialog"
        ref={dialogRef}
        aria-label="Command palette"
        onCancel={() => setIsOpen(false)}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) closePalette();
        }}
        onKeyDown={onDialogKeyDown}
      >
        <div className="command-search-row">
          <SearchIcon />
          <input
            className="command-input"
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search pages, models, benchmarks…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={filteredItems[activeIndex] ? `command-${activeIndex}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="command-results" id="command-results" role="listbox" aria-label="Search results">
          {filteredItems.length ? (
            GROUPS.map((group) => {
              const items = filteredItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div key={group} role="group" aria-label={group}>
                  <p className="command-group-label">{group}</p>
                  {items.map((item) => {
                    const index = filteredItems.indexOf(item);
                    return (
                      <button
                        className="command-item"
                        id={`command-${index}`}
                        key={item.href}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        data-active={activeIndex === index}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => chooseItem(item)}
                      >
                        <span>{item.label}</span>
                        {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <p className="command-empty" role="status">
              No matching page, model, or benchmark.
            </p>
          )}
        </div>

        <footer className="command-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </dialog>
    </>
  );
}
