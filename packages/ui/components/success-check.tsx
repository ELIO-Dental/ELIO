"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/cn";
import { duration, easing } from "../tokens/motion";

/**
 * The completion "delight" moment — THEME_GUIDELINE.md §6.3: a checkmark that
 * morphs in via SVG path draw with a soft shadow-glow-success pulse.
 * Explicitly NOT confetti/emoji (wrong register for a healthcare-fintech
 * product). Reserve for genuine task-completion milestones only — signup
 * complete, pay run locked, reconciliation with zero mismatches.
 */
export function SuccessCheck({ className, size = 72 }: { className?: string; size?: number }) {
  return (
    <motion.div
      className={cn("relative flex items-center justify-center rounded-full", className)}
      style={{ width: size, height: size }}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: duration.slow / 1000, ease: easing.out }}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-[--color-success]/15"
        animate={{ boxShadow: ["0 0 0 0 var(--color-success)", "0 0 0 14px transparent"] }}
        transition={{ duration: duration.slower / 1000, ease: easing.out, repeat: 1, repeatDelay: 0.15 }}
        aria-hidden
      />
      <svg viewBox="0 0 72 72" width={size} height={size} className="relative" aria-hidden>
        <circle cx="36" cy="36" r="34" fill="none" stroke="var(--color-success)" strokeWidth="2" opacity="0.25" />
        <motion.path
          d="M20 37 L31 48 L52 25"
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration.slow / 1000, ease: easing.out, delay: 0.1 }}
        />
      </svg>
      <span className="sr-only">Complete</span>
    </motion.div>
  );
}
