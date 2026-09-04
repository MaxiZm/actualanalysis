"use client";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { TextureButton } from "@/components/ui/texture-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Menu } from "lucide-react";
import type { BenchmarkRecord, DataStatus, ModelRecord } from "@/lib/data";
const links = [
  { href: "/", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/changelog", label: "Changelog" },
  { href: "/download", label: "Data" },
];
export function SiteHeader({
  models,
  benchmarks,
}: {
  models: Array<Pick<ModelRecord, "name" | "slug">>;
  benchmarks: Array<Pick<BenchmarkRecord, "name" | "slug">>;
  status: DataStatus;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = links.map((link) => (
    <Link
      onClick={() => setMenuOpen(false)}
      className="nav-link"
      href={link.href}
      key={link.href}
      aria-current={pathname === link.href ? "page" : undefined}
    >
      {link.label}
    </Link>
  ));
  return (
    <header className="site-header">
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="ActualAnalysis home">
          <BrandMark />
          ActualAnalysis
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          {navigation}
        </nav>
        <div className="nav-actions">
          <CommandPalette models={models} benchmarks={benchmarks} />
          <ThemeToggle />
          <div className="mobile-navigation">
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <TextureButton
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation menu"
                >
                  <Menu size={20} />
                </TextureButton>
              </PopoverTrigger>
              <PopoverContent align="end" className="cult-mobile-nav">
                <nav aria-label="Mobile navigation">{navigation}</nav>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </header>
  );
}
