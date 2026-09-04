export interface LabelPoint { x: number; y: number; label: string }

/** Deterministic vertical nudge for close labels; keeps SSR and client output identical. */
export function placeLabels<T extends LabelPoint>(points: readonly T[], minimumGap = 12): Array<T & { labelY: number }> {
  const sorted = [...points].sort((a,b)=>a.y-b.y || a.x-b.x || a.label.localeCompare(b.label));
  let previous = Number.NEGATIVE_INFINITY;
  return sorted.map((point)=>{const labelY=Math.max(point.y,previous+minimumGap);previous=labelY;return {...point,labelY};});
}
