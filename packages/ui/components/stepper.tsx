"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "../lib/cn";
import { duration, easing } from "../tokens/motion";

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Zero-based index of the current (active) step. */
  currentIndex: number;
  className?: string;
}

/**
 * Horizontal progress / stepper — THEME_GUIDELINE.md §5.12.
 * Completed = filled primary-500 circle + checkmark morph-in (icon crossfade).
 * Current = primary-500 outline + pulse. Future = neutral border outline.
 * Connecting line animates fill left-to-right as steps complete.
 */
export function Stepper({ steps, currentIndex, className }: StepperProps) {
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Signup progress">
      {steps.map((step, index) => {
        const status = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        const isLast = index === steps.length - 1;

        return (
          <li key={step.id} className={cn("flex flex-1 items-center", isLast && "flex-none")}>
            <div className="flex flex-col items-center gap-2">
              <span className="relative flex size-8 items-center justify-center">
                {status === "current" && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-(--color-primary-500)/30"
                    animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: duration.slowest / 1000, repeat: Infinity, ease: easing.inOut }}
                    aria-hidden
                  />
                )}
                <motion.span
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full border-2 text-body-sm font-medium",
                    status === "complete" && "border-(--color-primary-500) bg-(--color-primary-500) text-white",
                    status === "current" && "border-(--color-primary-500) bg-(--color-surface) text-(--color-primary-600)",
                    status === "upcoming" && "border-(--color-border) bg-(--color-surface) text-(--color-text-tertiary)"
                  )}
                  animate={{ scale: status === "current" ? 1.05 : 1 }}
                  transition={easing.spring}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {status === "complete" ? (
                      <motion.span
                        key="check"
                        initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: duration.slow / 1000, ease: easing.out }}
                      >
                        <Check className="size-4" aria-hidden />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="index"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: duration.fast / 1000 }}
                      >
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
              </span>
              <span
                className={cn(
                  "text-caption text-center whitespace-nowrap",
                  status === "upcoming" ? "text-(--color-text-tertiary)" : "text-(--color-text-secondary)"
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div className="relative -mt-6 mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-(--color-border-subtle)">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-(--color-primary-500)"
                  initial={false}
                  animate={{ width: status === "complete" ? "100%" : "0%" }}
                  transition={{ duration: duration.slow / 1000, ease: easing.out }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
