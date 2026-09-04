import * as React from "react";
import { cn } from "@/lib/utils";

export interface MinimalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "bordered";
}

export const MinimalCard = React.forwardRef<HTMLDivElement, MinimalCardProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-4 text-[var(--color-ink-2)] transition-all duration-200",
          variant === "subtle" && "bg-[var(--color-paper)] border-[var(--color-rule-strong)]",
          variant === "bordered" && "border-2 border-[var(--color-rule-strong)]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
MinimalCard.displayName = "MinimalCard";

export const MinimalCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]",
      className
    )}
    {...props}
  />
));
MinimalCardTitle.displayName = "MinimalCardTitle";

export const MinimalCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--color-muted)]", className)}
    {...props}
  />
));
MinimalCardDescription.displayName = "MinimalCardDescription";

export const MinimalCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mt-2", className)} {...props} />
));
MinimalCardContent.displayName = "MinimalCardContent";
