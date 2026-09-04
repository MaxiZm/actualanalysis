import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-brand">ActualAnalysis</span>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link className="footer-link" href="/methodology">Methodology</Link>
          <Link className="footer-link" href="/download">Data</Link>
          <a className="footer-link" href="/api/v1/models">API</a>
        </nav>
        <span className="footer-meta">Apache-2.0 code · source licenses apply · OpenRouter live values are display-only</span>
      </div>
    </footer>
  );
}
