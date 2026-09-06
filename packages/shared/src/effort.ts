const UNREPORTED_EFFORT = new Set(["", "unknown", "unreported", "unspecified", "not reported", "not specified", "n/a", "na", "—", "-"]);

/** Preserve source settings; missing markers never override an explicit config value. */
export function readReportedEffort(result: {
  effort_tier?: string | null | undefined;
  config?: Record<string, unknown> | undefined;
}): string | undefined {
  for (const value of [result.effort_tier, ...["reasoning_effort", "thinking_level", "effort_tier", "compute_effort", "evaluation_profile"].map(key => result.config?.[key])]) {
    const text = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
    if (text !== undefined && !UNREPORTED_EFFORT.has(text.toLowerCase().replace(/[_\s]+/g, " "))) return text;
  }
  return undefined;
}
