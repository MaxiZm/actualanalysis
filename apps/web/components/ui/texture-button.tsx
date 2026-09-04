import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface TextureButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "accent" | "minimal" | "ghost";
  size?: "default" | "sm" | "icon";
}

export const TextureButton = React.forwardRef<HTMLButtonElement, TextureButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    const variantClasses = {
      primary:
        "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border border-[var(--color-accent)] hover:brightness-105 active:translate-y-[1px]",
      secondary:
        "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-rule-strong)] hover:bg-[var(--color-paper-2)] active:translate-y-[1px]",
      accent:
        "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border border-[var(--color-accent-hover)] shadow-sm hover:bg-[var(--color-accent-hover)] active:translate-y-[1px]",
      minimal:
        "bg-transparent text-[var(--color-ink-2)] border border-[var(--color-rule)] hover:border-[var(--color-rule-strong)] hover:bg-[var(--color-paper-2)] active:translate-y-[1px]",
      ghost:
        "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-2)] border-transparent",
    };

    const sizeClasses = {
      default: "min-h-[var(--control-height)] px-4 py-2 text-sm font-semibold",
      sm: "min-h-[var(--control-height-compact)] px-3 py-1 text-xs font-medium",
      icon: "h-[var(--control-height)] w-[var(--control-height)] p-0 inline-grid place-items-center",
    };

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] transition-all select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
TextureButton.displayName = "TextureButton";
