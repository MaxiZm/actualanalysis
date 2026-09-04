import { InfoTip } from "@/components/evidence-config";
import { ACI_BASKETS, ACI_DOMAINS, type BasketScore, type DomainScore, type SystemSummary } from "@/lib/data";
import { formatPercent, formatScore, titleCase } from "@/lib/format";

export const DOMAIN_TITLES: Record<(typeof ACI_DOMAINS)[number], string> = {
  agentic: "Agentic",
  "software-code": "Software & code",
  reasoning: "Reasoning",
  "knowledge-information": "Knowledge & information",
  "communication-professional": "Communication & professional",
};

const SCALE_MIN = 0;
const SCALE_MAX = 100;

function position(value: number): number {
  return Math.max(0, Math.min(100, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

function DomainRow({ domain, score }: { domain: (typeof ACI_DOMAINS)[number]; score: DomainScore | undefined }) {
  if (!score) {
    return <div className="domain-row is-missing" role="listitem"><span className="domain-name">{DOMAIN_TITLES[domain]}</span><span className="domain-track" aria-hidden="true" /><span className="domain-value">not fitted</span></div>;
  }
  const extrapolated = score.extrapolated || !score.published;
  const left = position(score.low);
  const width = Math.max(0.5, position(score.high) - left);
  const label = extrapolated
    ? `${DOMAIN_TITLES[domain]}: extrapolated interval ${formatScore(score.low)} to ${formatScore(score.high)}`
    : `${DOMAIN_TITLES[domain]}: ${formatScore(score.median)}, 90% interval ${formatScore(score.low)} to ${formatScore(score.high)}`;
  return <div className={`domain-row${extrapolated ? " is-extrapolated" : ""}`} role="listitem" aria-label={label} title={label}>
    <span className="domain-name">{DOMAIN_TITLES[domain]}<span className="cell-note">{score.fittedCells ?? 0} cells{score.ownDataReduction !== null ? ` · R ${score.ownDataReduction.toFixed(2)}` : ""}</span></span>
    <span className="domain-track" aria-hidden="true">
      <span className="domain-interval" style={{ insetInlineStart: `${left}%`, inlineSize: `${width}%` }} />
      {extrapolated ? null : <span className="domain-point" style={{ insetInlineStart: `${position(score.median)}%` }} />}
    </span>
    <span className="domain-value">{extrapolated ? <span className="badge domain-extrapolated">extrapolated</span> : <strong>{formatScore(score.median)}</strong>}<span className="cell-note">{formatScore(score.low)}–{formatScore(score.high)}</span></span>
  </div>;
}

export function DomainPanel({ system, unit }: { system: SystemSummary; unit?: string | null }) {
  return <section className="domain-panel" aria-labelledby="domain-heading">
    <div className="section-heading">
      <h2 id="domain-heading">ACI-Domain scores <InfoTip label="ACI-Domain">Standardized domain traits, mean 50 and sd 10 over the calibration panel. Extrapolated domains publish an interval only: they lack two own-profile cells, a width of at most 20, or own-data variance reduction of 0.5.</InfoTip></h2>
      <p>{unit ?? "Relative domain index, mean 50, sd 10 over the calibration panel."} Bars show the 90% interval; a tick marks the published median.</p>
    </div>
    <div className="domain-rows" role="list">
      <div className="domain-axis" aria-hidden="true"><span className="domain-axis-ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></span></div>
      {ACI_DOMAINS.map((domain) => <DomainRow key={domain} domain={domain} score={system.domains[domain]} />)}
    </div>
  </section>;
}

function BasketRow({ basket, score }: { basket: (typeof ACI_BASKETS)[number]; score: BasketScore | undefined }) {
  if (!score || score.missingBenchmarks.length) return <tr><th scope="row">{titleCase(basket)}</th><td colSpan={3}>Not available · incomplete utility-compatible evidence</td></tr>;
  return <tr className={score.published ? "" : "is-unpublished"}>
    <th scope="row">{titleCase(basket)}</th>
    <td data-label="Expected utility">{score.published ? <strong>{formatPercent(score.median / 100, 1)}</strong> : <span className="range-only">{formatPercent(score.low / 100, 0)}–{formatPercent(score.high / 100, 0)}</span>}</td>
    <td data-label="Status">{score.published ? <span className="badge">Published</span> : <span className="badge badge-accent" title={score.missingBenchmarks.length ? `Missing: ${score.missingBenchmarks.join(", ")}` : "A weighted domain has no published point score"}>Unpublished</span>}</td>
    <td data-label="Missing evidence" className="basket-missing">{score.missingBenchmarks.length ? score.missingBenchmarks.join(", ") : "—"}</td>
  </tr>;
}

export function BasketTable({ system, unit }: { system: SystemSummary; unit?: string | null }) {
  return <section className="basket-panel" aria-labelledby="basket-heading">
    <div className="section-heading">
      <h2 id="basket-heading">Task-profile baskets <InfoTip label="ACI-Basket">Expected normalized utility across the benchmarks in each declared task basket. A basket is published only when every domain carrying at least 15% of its weight has a published point score.</InfoTip></h2>
      <p>{unit ?? "Expected normalized utility % on utility-eligible conditions."} Incomplete baskets are withheld.</p>
    </div>
    <div className="data-table-wrap">
      <table className="data-table basket-table">
        <thead><tr><th>Basket</th><th>Expected utility</th><th>Status</th><th>Missing benchmarks</th></tr></thead>
        <tbody>{ACI_BASKETS.map((basket) => <BasketRow key={basket} basket={basket} score={system.baskets[basket]} />)}</tbody>
      </table>
    </div>
  </section>;
}
