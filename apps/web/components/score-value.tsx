import type { IndexScore } from "@/lib/data";
import { formatScore } from "@/lib/format";
import { Hint } from "@/components/ui/hint";
export function ScoreValue({
  index,
  uncertainty = false,
}: {
  index: IndexScore | undefined;
  uncertainty?: boolean;
}) {
  if (!index) return <span className="cell-note">Not scored</span>;
  const value = index.score ?? index.robustScore;
  const margin =
    index.ciLow !== null && index.ciHigh !== null
      ? Math.max(Math.abs(value - index.ciLow), Math.abs(index.ciHigh - value))
      : null;
  const explanation = `${index.provisional ? "Preliminary estimate; ordered by its value alongside all models. " : "Posterior estimate. "}90% credible interval: ${formatScore(index.ciLow)}–${formatScore(index.ciHigh)}. ${uncertainty ? "± is the larger distance from the estimate to either endpoint, rounded up." : ""}`;
  return (
    <Hint text={explanation}>
      <span
        className={`score-value${index.provisional ? " score-estimated" : ""}`}
        tabIndex={0}
      >
        <strong>{formatScore(value)}</strong>
        {uncertainty && margin !== null ? (
          <span className="score-error">
            {" "}
            ±{(Math.ceil(margin * 10) / 10).toFixed(1)}
          </span>
        ) : null}
        {index.provisional ? (
          <span className="estimate-mark" aria-label="Estimated">
            *
          </span>
        ) : null}
      </span>
    </Hint>
  );
}
