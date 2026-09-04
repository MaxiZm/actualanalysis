export type TabularRow = Record<string, unknown>;

export function flattenRow(row: TabularRow): TabularRow {
  const flattened: TabularRow = { ...row };
  const visit = (value: TabularRow, prefix: string, depth: number): void => {
    if (depth > 6) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      if (isRow(child)) visit(child, childPath, depth + 1);
      else flattened[childPath] = child;
    }
  };
  visit(row, "", 0);
  return flattened;
}

export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? "";
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.length > 0)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim().replace(/^\uFEFF/, "")) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function valueAt(row: TabularRow, candidates: readonly string[]): unknown {
  const values = new Map(Object.entries(row).map(([key, value]) => [normalizedKey(key), value]));
  for (const candidate of candidates) {
    const key = normalizedKey(candidate);
    if (values.has(key)) return values.get(key);
  }
  return undefined;
}

export function stringAt(row: TabularRow, candidates: readonly string[]): string | undefined {
  const value = valueAt(row, candidates);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function numberAt(row: TabularRow, candidates: readonly string[]): number | undefined {
  const value = valueAt(row, candidates);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[$,%]/g, "").replace(/,/g, "");
  if (!normalized) return undefined;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : undefined;
}

export function booleanAt(row: TabularRow, candidates: readonly string[]): boolean | undefined {
  const value = valueAt(row, candidates);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  if (/^(?:true|yes|pass|passed|resolved|1)$/i.test(value.trim())) return true;
  if (/^(?:false|no|fail|failed|unresolved|0)$/i.test(value.trim())) return false;
  return undefined;
}

export function rowsFromUnknown(payload: unknown): TabularRow[] {
  if (Array.isArray(payload)) return payload.filter(isRow);
  if (!isRow(payload)) return [];
  for (const key of ["data", "results", "leaderboard", "models", "entries"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRow);
  }
  if (Array.isArray(payload.rows)) {
    return payload.rows
      .map((entry) => isRow(entry) && isRow(entry.row) ? entry.row : entry)
      .filter(isRow);
  }
  return [payload];
}

export function isRow(value: unknown): value is TabularRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
