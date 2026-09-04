function compactValue(value: unknown): string {
  if (value === null) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function EvidenceConfig({ config }: { config: Record<string, unknown> }) {
  const entries = Object.entries(config).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return <span className="cell-note">Default configuration</span>;
  return <span className="config-chips" aria-label="Evaluation configuration">
    {entries.map(([key, value]) => <span className="config-chip" key={key} title={`${key}: ${compactValue(value)}`}><b>{key.replaceAll("_", " ")}</b> {compactValue(value)}</span>)}
  </span>;
}

export function InfoTip({ label, children }: { label: string; children: string }) {
  return <abbr className="info-tip" aria-label={`${label}: ${children}`} title={children}>i</abbr>;
}
