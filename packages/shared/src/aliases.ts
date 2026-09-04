export interface AliasEntry {
  id: string;
  aliases?: readonly string[];
  name?: string;
}

/**
 * Normalizes spelling and punctuation without guessing vendor/model semantics.
 * Every lossy alias still has to be declared in the registry.
 */
export function normalizeAlias(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export class AliasCollisionError extends Error {
  constructor(
    public readonly alias: string,
    public readonly existingId: string,
    public readonly incomingId: string,
  ) {
    super(`Alias ${JSON.stringify(alias)} resolves to both ${existingId} and ${incomingId}`);
    this.name = "AliasCollisionError";
  }
}

export class AliasResolver<T extends AliasEntry> {
  readonly #entries: ReadonlyMap<string, T>;
  readonly #aliases: ReadonlyMap<string, string>;

  constructor(entries: readonly T[]) {
    const byId = new Map<string, T>();
    const aliases = new Map<string, string>();

    for (const entry of entries) {
      if (byId.has(entry.id)) throw new Error(`Duplicate registry id: ${entry.id}`);
      byId.set(entry.id, entry);

      for (const candidate of [entry.id, entry.name, ...(entry.aliases ?? [])]) {
        if (!candidate) continue;
        const normalized = normalizeAlias(candidate);
        if (!normalized) continue;
        const existing = aliases.get(normalized);
        if (existing && existing !== entry.id) {
          throw new AliasCollisionError(candidate, existing, entry.id);
        }
        aliases.set(normalized, entry.id);
      }
    }

    this.#entries = byId;
    this.#aliases = aliases;
  }

  resolveId(value: string): string | undefined {
    return this.#aliases.get(normalizeAlias(value));
  }

  resolve(value: string): T | undefined {
    const id = this.resolveId(value);
    return id ? this.#entries.get(id) : undefined;
  }

  require(value: string): T {
    const entry = this.resolve(value);
    if (!entry) throw new Error(`Unknown registry alias: ${value}`);
    return entry;
  }

  has(value: string): boolean {
    return this.resolveId(value) !== undefined;
  }

  ids(): string[] {
    return [...this.#entries.keys()];
  }
}

