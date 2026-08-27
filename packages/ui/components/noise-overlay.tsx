/**
 * §2.7 — near-invisible grain/noise texture layered over large gradient/hero
 * surfaces. A tiny inline SVG feTurbulence, generated once, reused everywhere
 * (marketing hero, empty-state gradient backdrops) — never a heavy image asset.
 */
export function NoiseOverlay({ opacity = 0.03, className }: { opacity?: number; className?: string }) {
  return (
    <svg
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none" }}
      aria-hidden
    >
      <filter id="elio-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#elio-noise)" />
    </svg>
  );
}
