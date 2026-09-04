"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { TextureButton } from "./ui/texture-button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "./ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { BenchmarkRecord, ModelRecord } from "@/lib/data";
export function CommandPalette({
  models,
  benchmarks,
}: {
  models: Array<Pick<ModelRecord, "name" | "slug">>;
  benchmarks: Array<Pick<BenchmarkRecord, "name" | "slug">>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const groups = [
    {
      name: "Pages",
      items: [
        { name: "Leaderboard", slug: "/" },
        { name: "Compare", slug: "/compare" },
        { name: "Methodology", slug: "/methodology" },
        { name: "Changelog", slug: "/changelog" },
        { name: "Download data", slug: "/download" },
      ],
    },
    {
      name: "Models",
      items: models.map((m) => ({ name: m.name, slug: `/models/${m.slug}` })),
    },
    {
      name: "Benchmarks",
      items: benchmarks.map((b) => ({
        name: b.name,
        slug: `/benchmarks/${b.slug}`,
      })),
    },
  ];
  return (
    <>
      <TextureButton
        variant="ghost"
        className="command-trigger"
        aria-label="Search data"
        onClick={() => setOpen(true)}
      >
        <Search size={18} />
        <span>Search</span>
        <kbd>⌘ K</kbd>
      </TextureButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="cult-command-dialog">
          <DialogTitle className="sr-only">Search data</DialogTitle>
          <DialogDescription className="sr-only">
            Find a model, benchmark or page.
          </DialogDescription>
          <Command>
            <CommandInput placeholder="Search models, benchmarks, pages…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.name} heading={group.name}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.slug}
                      value={`${item.name} ${item.slug}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(item.slug);
                      }}
                    >
                      {item.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
