import type { CostPerTaskRecord } from "@/lib/data";
import { Hint } from "@/components/ui/hint";

export function formatTaskCost(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 0.01 ? 4 : value < 1 ? 3 : 2,
  }).format(value);
}
export function CostPerTaskValue({
  cost,
}: {
  cost: CostPerTaskRecord | null | undefined;
}) {
  if (!cost) return <span className="cell-note">Not measured</span>;
  return (
    <Hint
      text={`${cost.configuration}\n${cost.definition}\n${cost.workload} · checked ${cost.observedOn}`}
    >
      <a
        className="runtime-value"
        href={cost.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        {formatTaskCost(cost.usdPerTask)}
      </a>
    </Hint>
  );
}
