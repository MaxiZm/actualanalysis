"use client";

import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs";
import { INDEX_KINDS, type IndexKind } from "@/lib/data";
import { titleCase } from "@/lib/format";

export const PROFILE_DESCRIPTIONS: Record<IndexKind, string> = {
  mixed: "Balanced across all five capability areas, with 20% weight each.",
  agentic: "60% agentic tasks · 30% software & code · 10% reasoning.",
  chat: "40% communication · 30% knowledge · 20% reasoning · 10% code.",
};

export function IndexProfileControl({
  value,
  onChange,
}: {
  value: IndexKind;
  onChange: (value: IndexKind) => void;
}) {
  return (
    <div className="index-profile-control">
      <div className="profile-switch">
        <span className="control-label">Score profile</span>
        <DirectionAwareTabs
          aria-label="Capability index"
          value={value}
          onChange={(kind) => onChange(kind as IndexKind)}
          tabs={INDEX_KINDS.map((kind) => ({
            id: kind,
            label: titleCase(kind),
          }))}
        />
      </div>
      <p className="profile-description" aria-live="polite">
        {PROFILE_DESCRIPTIONS[value]}{" "}
        <span>The same models stay available.</span>
      </p>
    </div>
  );
}
