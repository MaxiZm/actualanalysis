"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  isFixture?: boolean;
  statusText: string;
  pulse?: boolean;
}

export function StatusPill({
  isFixture = false,
  statusText,
  pulse = true,
  className,
  title,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "snapshot-pill inline-flex items-center gap-2 px-2.5 py-1 text-xs font-mono rounded-full border transition-colors",
        isFixture
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 is-fixture"
          : "border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] text-[var(--color-ink-2)]",
        className
      )}
      title={title}
      {...props}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <motion.span
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.7, 0, 0.7],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              isFixture ? "bg-amber-500" : "bg-[var(--color-accent)]"
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            isFixture ? "bg-amber-500" : "bg-[var(--color-accent)]"
          )}
        />
      </span>
      <span>{statusText}</span>
    </span>
  );
}
