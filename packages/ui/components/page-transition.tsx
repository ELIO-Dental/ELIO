"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { pageTransitionVariants } from "../tokens/motion";

/**
 * THEME_GUIDELINE.md §6.3/§6.7 — every route change inside the shell must use
 * this fade+8px-translateY transition, never a hard cut. Implemented ONCE here
 * and mounted in every app's root layout so it's automatic per module, not
 * re-implemented per page (§6.7's Motion Consistency Contract point 3).
 *
 * `usePathname()` as the AnimatePresence key is what makes App Router treat a
 * navigation as an exit+enter pair instead of an in-place content swap.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    // §6.4 — reduced motion falls back to an instant, opacity-only (effectively
    // no) transition rather than skipping the pattern's structure entirely.
    return <div key={pathname}>{children}</div>;
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={pathname}
        variants={pageTransitionVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
