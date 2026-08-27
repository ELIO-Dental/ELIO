import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-(--radius-full) px-2.5 py-0.5 text-caption font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-(--color-bg-subtle) text-(--color-text-secondary)",
        success: "bg-(--color-success-bg) text-(--color-success)",
        warning: "bg-(--color-warning-bg) text-(--color-warning)",
        danger: "bg-(--color-danger-bg) text-(--color-danger)",
        info: "bg-(--color-info-bg) text-(--color-info)",
        primary: "bg-(--color-primary-100) text-(--color-primary-700)",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Renders the §5.6 pulsing dot for live/processing status — the one other acceptable infinite loop. */
  pulse?: boolean;
}

export function Badge({ className, variant, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse && (
        <span
          className="size-1.5 rounded-full bg-current"
          style={{ animation: "statusPulse 1.5s ease-in-out infinite" }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
