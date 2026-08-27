"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "../lib/cn";
import { duration, easing } from "../tokens/motion";

export interface CardProps extends HTMLMotionProps<"div"> {
  interactive?: boolean;
  /** Optional module accent — full-saturation hex used as a 2px top border (§8.3). */
  accentColor?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, accentColor, style, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        "rounded-[--radius-lg] border border-[--color-border-subtle] bg-[--color-surface] p-4 shadow-[--shadow-xs] md:p-6",
        interactive && "cursor-pointer",
        className
      )}
      style={accentColor ? { borderTop: `2px solid ${accentColor}`, ...style } : style}
      whileHover={interactive ? { y: -2, boxShadow: "var(--shadow-md)" } : undefined}
      transition={{ duration: duration.base / 1000, ease: easing.out }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
Card.displayName = "Card";

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-h3 text-[--color-text-primary]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex items-center gap-2", className)} {...props} />;
}
