export const DEFAULT_EPSILON = 0.005;

export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Expected a finite number, received ${String(value)}`);
  }
  return Math.min(high, Math.max(low, value));
}

export function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

export function logit(probability: number): number {
  if (!(probability > 0 && probability < 1)) {
    throw new Error(`logit requires 0 < p < 1, received ${probability}`);
  }
  return Math.log(probability / (1 - probability));
}

export function huber(value: number, delta: number): number {
  const absolute = Math.abs(value);
  return absolute <= delta
    ? 0.5 * value * value
    : delta * (absolute - 0.5 * delta);
}

export function huberDerivative(value: number, delta: number): number {
  return Math.abs(value) <= delta ? value : delta * Math.sign(value);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp(probability, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return Number.NaN;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const sumSquares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashSeed(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG suitable for reproducible statistical tests. */
export function createRandom(seed: number | string = 0x5eed): () => number {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomNormal(random: () => number): number {
  let first = random();
  const second = random();
  if (first <= Number.EPSILON) first = Number.EPSILON;
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

export function rankDescending(values: Record<string, number>): Record<string, number> {
  const ordered = Object.entries(values).sort((left, right) => {
    const difference = right[1] - left[1];
    return difference === 0 ? left[0].localeCompare(right[0]) : difference;
  });
  const ranks: Record<string, number> = {};
  let previousValue: number | undefined;
  let previousRank = 0;
  ordered.forEach(([id, value], index) => {
    if (previousValue === undefined || value !== previousValue) previousRank = index + 1;
    ranks[id] = previousRank;
    previousValue = value;
  });
  return ranks;
}

function averageRanks(values: Record<string, number>, ids: readonly string[]): Record<string, number> {
  const ordered = [...ids].sort((left, right) => {
    const leftValue = values[left];
    const rightValue = values[right];
    if (leftValue === undefined || rightValue === undefined) return left.localeCompare(right);
    return leftValue - rightValue || left.localeCompare(right);
  });
  const result: Record<string, number> = {};
  let index = 0;
  while (index < ordered.length) {
    const id = ordered[index];
    if (id === undefined) break;
    const value = values[id];
    let end = index + 1;
    while (end < ordered.length) {
      const nextId = ordered[end];
      if (nextId === undefined || values[nextId] !== value) break;
      end += 1;
    }
    const averageRank = (index + 1 + end) / 2;
    for (let tiedIndex = index; tiedIndex < end; tiedIndex += 1) {
      const tiedId = ordered[tiedIndex];
      if (tiedId !== undefined) result[tiedId] = averageRank;
    }
    index = end;
  }
  return result;
}

export function spearmanRankCorrelation(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  const ids = Object.keys(left).filter((id) => right[id] !== undefined).sort();
  if (ids.length < 3) throw new Error("Spearman correlation requires at least three overlapping ids");
  const leftRanks = averageRanks(left, ids);
  const rightRanks = averageRanks(right, ids);
  const leftMean = mean(ids.map((id) => leftRanks[id] ?? 0));
  const rightMean = mean(ids.map((id) => rightRanks[id] ?? 0));
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (const id of ids) {
    const leftDifference = (leftRanks[id] ?? 0) - leftMean;
    const rightDifference = (rightRanks[id] ?? 0) - rightMean;
    covariance += leftDifference * rightDifference;
    leftVariance += leftDifference * leftDifference;
    rightVariance += rightDifference * rightDifference;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 1 : covariance / denominator;
}

export function assertPositive(value: number, label: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a positive finite number, received ${value}`);
  }
}
