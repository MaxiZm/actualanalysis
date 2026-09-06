import { Hint } from "@/components/ui/hint";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TextureButton } from "@/components/ui/texture-button";

function compactValue(value: unknown): string {
  if (value === null) return "none";
  if (["string", "number", "boolean"].includes(typeof value))
    return String(value);
  return JSON.stringify(value);
}

export function EvidenceConfig({
  config,
}: {
  config: Record<string, unknown>;
}) {
  const entries = Object.entries(config).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (!entries.length)
    return <span className="cell-note">Default configuration</span>;
  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <TextureButton
            variant="ghost"
            size="sm"
            className="configuration-trigger"
            aria-label={`Evaluation configuration: ${entries.length} settings`}
          >
            {entries.length} {entries.length === 1 ? "setting" : "settings"} ↗
          </TextureButton>
        </PopoverTrigger>
        <PopoverContent align="start" className="configuration-popover">
          <h3>Evaluation configuration</h3>
          <dl>
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>{compactValue(value)}</dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
      {config.index_effort_assumption === "maximum" ? (
        <span
          className="cell-note"
          title="The source did not report effort. Maximum effort is assumed if this result enters the index; its configuration uncertainty is retained."
        >
          Max assumed
        </span>
      ) : null}
    </div>
  );
}

export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <Hint text={`${label}: ${children}`}>
      <span tabIndex={0} className="info-tip" aria-label={label}>
        i
      </span>
    </Hint>
  );
}
