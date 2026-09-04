export function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 2 : 1,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTokens(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  return `${Math.round(value / 1_000)}k`;
}

export function formatDate(value: string | null): string {
  if (value === null) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function titleCase(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type NativeUnit =
  | "fraction"
  | "percent"
  | "elo"
  | "minutes"
  | "hours"
  | "currency"
  | "raw";

/** Formats a benchmark observation in the unit the source reported it in. */
export function formatNative(value: number | null, unit: NativeUnit): string {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "fraction":
      return formatPercent(value, 1);
    case "percent":
      return formatPercent(value / 100, 1);
    case "elo":
      return `${Math.round(value).toLocaleString("en-US")} Elo`;
    case "minutes":
      return value >= 120
        ? `${(value / 60).toFixed(1)} h`
        : `${value.toFixed(value < 10 ? 1 : 0)} min`;
    case "hours":
      return `${value.toFixed(1)} h`;
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    default:
      return value.toFixed(2);
  }
}

export function formatLogit(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

export function formatSigned(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

/** One axis must use one unit even when sources encode percentages or time differently. */
export function comparisonUnit(unit: NativeUnit): NativeUnit {
  return unit === "fraction" ? "percent" : unit === "minutes" ? "hours" : unit;
}
export function comparisonValue(value: number, unit: NativeUnit): number {
  return unit === "fraction"
    ? value * 100
    : unit === "minutes"
      ? value / 60
      : value;
}
