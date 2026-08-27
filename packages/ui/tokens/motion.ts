/**
 * ELIO motion tokens — THEME_GUIDELINE.md §6.2.
 * These are the ONLY timing/easing values allowed in the product (§6.7 Motion
 * Consistency Contract). Never define an ad-hoc duration/spring in a component —
 * add it here first if a genuinely new pattern is needed.
 */
import type { Transition, Variants } from "framer-motion";

export const duration = {
  instant: 100,
  fast: 150,
  base: 200,
  slow: 300,
  slower: 500,
  slowest: 800,
} as const;

export const easing = {
  out: [0.16, 1, 0.3, 1] as const, // ease-out-expo — default for entrances
  inOut: [0.65, 0, 0.35, 1] as const,
  spring: { type: "spring", stiffness: 300, damping: 30 } as Transition, // buttons, toggles, nav pill
  springSoft: { type: "spring", stiffness: 220, damping: 26 } as Transition, // cards, larger surfaces
  springSnappy: { type: "spring", stiffness: 420, damping: 32 } as Transition, // magnetic buttons, drag
} as const;

/** Seconds, for Framer Motion's `transition.duration` which expects seconds not ms. */
const s = (ms: number) => ms / 1000;

/** §6.3 — page/route transition inside the shell. */
export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: s(duration.base), ease: easing.out },
  },
  exit: {
    opacity: 0,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
};

/** §6.3 — list/table row stagger. Container + item pair. Cap total stagger ~320ms. */
export const listStaggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0,
    },
  },
};

export const listStaggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: s(duration.base), ease: easing.out },
  },
};

/** §6.3 — button tap/hover micro-interaction. Spread onto a `motion.button`. */
export const buttonTapHover = {
  whileTap: { scale: 0.97 },
  whileHover: { scale: 1.01 },
  transition: easing.spring,
};

/** §6.3 — count-up number. Duration scales with magnitude by the caller;
 * this is the spring config to drive a useSpring/useMotionValue count-up. */
export const countUpSpring: Transition = { type: "spring", stiffness: 90, damping: 20 };

/** §5.7 — modal/dialog entrance. */
export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: s(duration.base), ease: easing.out },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
};

/** §5.9 — command palette entrance (glass surface). */
export const commandPaletteVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 8,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
};

/** §5.10 — empty state entrance. */
export const emptyStateVariants: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: s(duration.base), ease: easing.out },
  },
};

/** §5.3 — clickable card hover lift. */
export const cardHover = {
  whileHover: { y: -2, boxShadow: "var(--shadow-md)" },
  transition: { duration: s(duration.base), ease: easing.out },
};

/** §5.17 — dropdown/popover entrance. */
export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: s(duration.fast), ease: easing.out },
  },
};
