import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { siteUrl, sitePath } from "@/lib/site-path";

import "../tokens.css";
import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadSiteData } from "@/lib/server/snapshot";

export const metadata: Metadata = {
  metadataBase: new URL(new URL(siteUrl).origin),
  title: {
    default: "ActualAnalysis — open model capability indexes",
    template: "%s · ActualAnalysis",
  },
  description:
    "Open model rankings with uncertainty, benchmark provenance, and separate Mixed, Agentic, and Chat capability indexes.",
  icons: {
    icon: [
      { url: sitePath("/icon.svg"), type: "image/svg+xml", sizes: "any" },
      { url: sitePath("/favicon.ico"), sizes: "16x16 32x32 48x48" },
    ],
    shortcut: sitePath("/favicon.ico"),
    apple: sitePath("/brand/apple-touch-icon.png"),
  },
  applicationName: "ActualAnalysis",
  openGraph: {
    type: "website",
    siteName: "ActualAnalysis",
    title: "ActualAnalysis — open model capability indexes",
    description:
      "Open model rankings with uncertainty, benchmark provenance, and reproducible Mixed, Agentic, and Chat indexes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ActualAnalysis — open model capability indexes",
    description:
      "Open model rankings with uncertainty, benchmark provenance, and reproducible capability indexes.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

const themeScript = `
  try {
    const saved = localStorage.getItem("actualanalysis-theme");
    const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : preferred;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const data = await loadSiteData();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="app-shell">
          <SiteHeader
            models={data.models}
            benchmarks={data.benchmarks}
            status={data.status}
          />
          {data.status.mode === "fixture" ? (
            <aside className="fixture-banner">
              <strong>Fixture data.</strong> {data.status.disclaimer}
            </aside>
          ) : null}
          <main className="site-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
