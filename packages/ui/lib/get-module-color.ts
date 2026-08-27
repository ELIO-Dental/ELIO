/**
 * Module Color System — THEME_GUIDELINE.md §8.
 * ONE formula (§8.2), applied identically to all 9 modules — never hand-pick
 * per-module tints. Consumers (launcher tiles, command palette, sidebar
 * active-item accent, module page top-border) call `getModuleColor(id)` and
 * use the returned tokens; nobody computes rgba()/opacity math inline.
 */

export type ModuleId =
  | "flow"
  | "pay"
  | "plans"
  | "cqc"
  | "hr"
  | "care"
  | "bookings"
  | "marketing"
  | "analytics";

export interface ModuleColorInfo {
  id: ModuleId;
  name: string;
  /** Full-saturation hex, §8.1 — used for the accent border/ring, never darkened. */
  hex: string;
  status: "built" | "reserved";
  /** rgb triplet (of `hex`), used to build rgba() strings at any opacity on demand. */
  rgb: [number, number, number];
  /** Icon badge — light mode: ~12% tint bg over white, icon/text darkened just enough to clear 4.5:1 (§8.2's contrast rule). */
  badgeLight: { bg: string; fg: string };
  /** Icon badge — dark mode: ~18% tint bg over near-black, icon/text lightened ~10% off the base hue. */
  badgeDark: { bg: string; fg: string };
  /** Module page top-accent / active launcher-tile ring — full saturation, 2px. */
  accentBorder: string;
  /** Module-tinted dashboard card glow — ~6% opacity radial tint. */
  cardGlow: string;
}

const MODULES: Record<ModuleId, { name: string; hex: string; status: "built" | "reserved" }> = {
  flow: { name: "ElioFlow", hex: "#8b5cf6", status: "built" },
  pay: { name: "ElioPay", hex: "#3b82f6", status: "built" },
  plans: { name: "ElioPlans", hex: "#6366f1", status: "built" },
  cqc: { name: "ElioCQC", hex: "#10b981", status: "reserved" },
  hr: { name: "ElioHR", hex: "#f59e0b", status: "reserved" },
  care: { name: "ElioCare", hex: "#f43f5e", status: "reserved" },
  bookings: { name: "ElioBookings", hex: "#0ea5e9", status: "reserved" },
  marketing: { name: "ElioMarketing", hex: "#d946ef", status: "reserved" },
  analytics: { name: "ElioAnalytics", hex: "#14b8a6", status: "reserved" },
};

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgba([r, g, b]: Rgb, a: number) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Move an RGB triplet toward white (amount > 0) or black (amount < 0) by `amount` (-1..1). */
function shade([r, g, b]: Rgb, amount: number): Rgb {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return [r + (target - r) * t, g + (target - g) * t, b + (target - b) * t];
}

/** WCAG relative luminance + contrast ratio — used to enforce §8.2/§2.6's 4.5:1 rule. */
function relativeLuminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite `fg` at `alpha` over `bg` (both opaque RGB) — for computing a tint's apparent solid color. */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

/**
 * §8.2's contrast rule, applied as ONE mechanical step for all 9 colors (not
 * hand-tuned per module): darken the base hue in fixed 4% steps against the
 * given background until it clears 4.5:1, or bail after a sane number of
 * steps. Never lightens — §8.2 is explicit that failures must be darkened.
 */
function darkenUntilAccessible(rgb: Rgb, backgroundRgb: Rgb, minRatio = 4.5): Rgb {
  let candidate = rgb;
  for (let step = 0; step <= 20; step++) {
    if (contrastRatio(candidate, backgroundRgb) >= minRatio) return candidate;
    candidate = shade(rgb, -0.04 * step);
  }
  return candidate;
}

const WHITE: Rgb = [255, 255, 255];
const DARK_BG: Rgb = hexToRgb("#0b0b0f"); // --color-bg, dark mode

const cache = new Map<ModuleId, ModuleColorInfo>();

export function getModuleColor(moduleId: ModuleId): ModuleColorInfo {
  const cached = cache.get(moduleId);
  if (cached) return cached;

  const def = MODULES[moduleId];
  const rgb = hexToRgb(def.hex);

  // Light badge: ~12% tint of the hue over white (§8.2's badge-bg formula).
  const badgeLightBgRgb = composite(rgb, 0.12, WHITE);
  // Icon/text must clear 4.5:1 against that near-white badge bg — darken only if needed.
  const badgeLightFgRgb = darkenUntilAccessible(rgb, badgeLightBgRgb);

  // Dark badge: ~18% tint over the dark surface, icon lightened ~10% off the base hue.
  const badgeDarkBgRgb = composite(rgb, 0.18, DARK_BG);
  const badgeDarkFgRgb = shade(rgb, 0.1);

  const info: ModuleColorInfo = {
    id: moduleId,
    name: def.name,
    hex: def.hex,
    status: def.status,
    rgb,
    badgeLight: { bg: rgba(rgb, 0.12), fg: rgbToHex(badgeLightFgRgb) },
    badgeDark: { bg: rgba(rgb, 0.18), fg: rgbToHex(badgeDarkFgRgb) },
    accentBorder: def.hex,
    cardGlow: rgba(rgb, 0.06),
  };

  cache.set(moduleId, info);
  return info;
}

export function listModuleColors(): ModuleColorInfo[] {
  return (Object.keys(MODULES) as ModuleId[]).map(getModuleColor);
}
