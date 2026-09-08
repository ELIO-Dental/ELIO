import type { ModuleId } from "./get-module-color";

export type BrandModuleId = Extract<ModuleId, "pay" | "plans" | "flow">;

export interface ResolvedModuleBrandLogos {
  /** Light (or only) logo URL for the sidebar. */
  logoUrl: string;
  /** Dark-theme wordmark; omitted for practice uploads. */
  logoDarkUrl?: string;
  /** Collapsed sidebar mark — ELIO mark for defaults, custom logo when uploaded. */
  collapsedLogoUrl?: string;
  /** True when showing the built-in ELIO product wordmark (or a full clinic upload). */
  logoOnly: boolean;
  /** True when the practice uploaded their own logo. */
  usingCustom: boolean;
}

const DEFAULT_COLLAPSED = {
  pay: "/pay/brand/elio-pay.png",
  plans: "/plans/brand/elio-plans.png",
  flow: "/flow/brand/elio-flow.png",
} as const;

/**
 * Practice upload wins; otherwise the ELIO product wordmark (not legacy app icons).
 * Paths include each app's Next `basePath` so zones serve their own `/brand` assets.
 */
export function resolveModuleBrandLogos(
  moduleId: BrandModuleId,
  customLogoUrl?: string | null
): ResolvedModuleBrandLogos {
  const custom = customLogoUrl?.trim() ?? "";
  if (custom) {
    return {
      logoUrl: custom,
      logoDarkUrl: undefined,
      collapsedLogoUrl: custom,
      logoOnly: true,
      usingCustom: true,
    };
  }

  return {
    logoUrl: `/${moduleId}/brand/elio-${moduleId}.png`,
    logoDarkUrl: `/${moduleId}/brand/elio-${moduleId}-dark.png`,
    collapsedLogoUrl: DEFAULT_COLLAPSED[moduleId],
    logoOnly: true,
    usingCustom: false,
  };
}

/** True when `logoUrl` is a built-in ELIO product wordmark (not a practice upload). */
export function isDefaultModuleBrandLogo(logoUrl: string | null | undefined): boolean {
  if (!logoUrl) return false;
  return /\/brand\/elio-(pay|plans|flow)(-dark)?\.png(?:\?|$)/.test(logoUrl);
}
