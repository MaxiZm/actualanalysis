"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  content?: React.ReactNode;
}

export interface DirectionAwareTabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  "aria-label"?: string;
  layoutId?: string;
}

export function DirectionAwareTabs({
  tabs,
  value,
  onChange,
  className,
  buttonClassName,
  "aria-label": ariaLabel,
  layoutId,
}: DirectionAwareTabsProps) {
  const instanceId = React.useId();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "segmented-control relative flex items-center p-0.5 overflow-hidden bg-[var(--color-paper)]",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="button"
            aria-pressed={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "segment-button relative flex-1 px-3 py-1.5 text-center font-medium transition-colors select-none !bg-transparent",
              isActive
                ? "!text-[var(--color-paper)] font-semibold"
                : "!text-[var(--color-muted)] hover:!text-[var(--color-ink)]",
              buttonClassName
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId ?? instanceId}
                transition={{
                  type: "spring",
                  bounce: 0.15,
                  duration: 0.22,
                }}
                className="absolute inset-0 rounded-[var(--radius-xs)] bg-[var(--color-ink)]"
              />
            )}
            <span className="relative z-10 pointer-events-none">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
