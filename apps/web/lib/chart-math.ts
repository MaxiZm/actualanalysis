export interface ParetoPoint { id: string; x: number; y: number }

export function paretoFrontier<T extends ParetoPoint>(points: readonly T[]): T[] {
  return points
    .filter((point) => !points.some((other) => other.x <= point.x && other.y >= point.y && (other.x < point.x || other.y > point.y)))
    .sort((left, right) => left.x - right.x);
}

export function organizationColorIndex(organization: string, paletteSize = 5): number {
  let hash = 0;
  for (const character of organization) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return paletteSize > 0 ? hash % paletteSize : 0;
}
