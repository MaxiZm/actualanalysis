"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/command-palette";
import { MenuIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import type { BenchmarkRecord, DataStatus, ModelRecord } from "@/lib/data";

const NAV_LINKS = [
  { href: "/", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/changelog", label: "Changelog" },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function SiteHeader({
  models,
  benchmarks,
  status,
}: {
  models: Array<Pick<ModelRecord, "name" | "slug">>;
  benchmarks: Array<Pick<BenchmarkRecord, "name" | "slug">>;
  status: DataStatus;
}) {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="ActualAnalysis home">
          <span className="brand-mark" aria-hidden="true" />
          ActualAnalysis
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <Link
              className="nav-link"
              href={link.href}
              key={link.href}
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <CommandPalette models={models} benchmarks={benchmarks} />

        <div className="nav-actions">
          <span className={`snapshot-pill ${status.mode === "fixture" ? "is-fixture" : ""}`} title={status.disclaimer}><i />{status.snapshotDate ? `${status.snapshotDate} · method ${status.methodVersion ?? "—"}` : "Fixture data"}</span>
          <Link className="nav-link" href="/download" aria-current={pathname === "/download" ? "page" : undefined}>
            Download
          </Link>
          <ThemeToggle />
        </div>

        <details className="mobile-menu">
          <summary aria-label="Open navigation menu">
            <MenuIcon />
          </summary>
          <nav className="mobile-menu-panel" aria-label="Mobile navigation">
            {NAV_LINKS.map((link) => (
              <Link href={link.href} key={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
            <Link href="/download">Download</Link>
            <ThemeToggle />
          </nav>
        </details>
      </div>
    </header>
  );
}
