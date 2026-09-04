import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { dataPath, staticSite } from "@/lib/site-path";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-brand">
          <BrandMark size={24} />
          ActualAnalysis
        </span>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link className="footer-link" href="/methodology">
            Methodology
          </Link>
          <Link className="footer-link" href="/download">
            Data
          </Link>
          <a className="footer-link" href={dataPath("/api/v1/models")}>
            API
          </a>
        </nav>
        <span className="footer-meta">
          Apache-2.0 code · source licenses apply ·{" "}
          {staticSite
            ? "Prices captured at publication"
            : "OpenRouter live values are display-only"}
        </span>
      </div>
    </footer>
  );
}
