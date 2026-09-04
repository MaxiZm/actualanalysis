import { isRow, type TabularRow } from "./tabular.js";

const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function textFromHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
      if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return entities[entity.toLowerCase()] ?? `&${entity};`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHtmlTables(html: string): TabularRow[] {
  const output: TabularRow[] = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1] ?? "";
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? "");
    if (rows.length < 2) continue;
    const cells = (row: string) => [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((match) => textFromHtml(match[1] ?? ""));
    const headers = cells(rows[0] ?? "");
    if (headers.length < 2) continue;
    for (const row of rows.slice(1)) {
      const values = cells(row);
      if (values.length === 0) continue;
      output.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    }
  }
  return output;
}

function collectRows(value: unknown, output: TabularRow[], seen: Set<unknown>, depth = 0): void {
  if (depth > 12 || value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    const objectValues = value.filter(isRow);
    if (objectValues.length > 1 && objectValues.some((row) => Object.keys(row).some((key) => /model|score|rating|accuracy/i.test(key)))) {
      output.push(...objectValues);
    }
    for (const child of value) collectRows(child, output, seen, depth + 1);
    return;
  }
  for (const child of Object.values(value)) collectRows(child, output, seen, depth + 1);
}

export function extractEmbeddedJsonRows(html: string): TabularRow[] {
  const rows: TabularRow[] = [];
  const scripts = html.matchAll(/<script\b[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/(?:ld\+)?json["'])[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      collectRows(JSON.parse(match[1] ?? "null") as unknown, rows, new Set());
    } catch {
      // One malformed analytics script must not suppress usable table data.
    }
  }
  return rows;
}

export function extractHtmlRows(html: string): TabularRow[] {
  return [...extractHtmlTables(html), ...extractEmbeddedJsonRows(html)];
}

function balancedJsonArray(value: string, start: number): unknown[] | undefined {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(value.slice(start, index + 1)) as unknown;
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/** Extracts named object arrays embedded in Next.js Flight script string chunks. */
export function extractNextFlightArrayRows(html: string, key: string): TabularRow[] {
  const rows: TabularRow[] = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = script[1] ?? "";
    const push = /self\.__next_f\.push\((\[[\s\S]*\])\)\s*$/.exec(body)?.[1];
    if (!push) continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(push) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(decoded) || typeof decoded[1] !== "string") continue;
    const marker = `"${key}":`;
    let cursor = 0;
    while ((cursor = decoded[1].indexOf(marker, cursor)) >= 0) {
      const arrayStart = decoded[1].indexOf("[", cursor + marker.length);
      if (arrayStart < 0) break;
      const values = balancedJsonArray(decoded[1], arrayStart);
      if (values) rows.push(...values.filter(isRow));
      cursor = arrayStart + 1;
    }
  }
  return rows;
}
