import type { SpeedRecord } from "@/lib/data";
import { Hint } from "@/components/ui/hint";
export function RuntimeValue({
  speed,
  metric,
}: {
  speed: SpeedRecord | null;
  metric: "speed" | "ttft";
}) {
  if (
    !speed ||
    (metric === "speed" ? speed.tokensPerSecond : speed.ttftSeconds) === null
  )
    return <span className="cell-note">Not measured</span>;
  const text = `${speed.configuration ?? speed.provider}\n${speed.workload} · checked ${speed.observedOn ?? "unknown date"}\n${metric === "ttft" ? "Latency to first output chunk; may include reasoning time." : "Median output token rate."}`;
  return (
    <Hint text={text}>
      <a
        className="runtime-value"
        href={speed.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        {metric === "speed"
          ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
              speed.tokensPerSecond!,
            )
          : `${speed.ttftSeconds!.toFixed(2)}s`}
      </a>
    </Hint>
  );
}
