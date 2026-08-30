export type PwaAppId = "portal" | "pay" | "plans" | "flow" | "admin";

export interface PwaAppConfig {
  id: PwaAppId;
  name: string;
  shortName: string;
  description: string;
  /** Path from site root, including basePath when applicable. */
  startUrl: string;
  /** Service worker scope — trailing slash required. */
  scope: string;
  /** Public path to sw.js from site root (includes basePath). */
  serviceWorkerPath: string;
  /** Offline fallback page path from site root. */
  offlineUrl: string;
  themeColor: string;
  backgroundColor: string;
}

const SHARED = {
  themeColor: "#6d3ef5",
  backgroundColor: "#0b0b0f",
} as const;

/** Desktop-first PWA configs — one installable app per Next.js zone. */
export const PWA_APP_CONFIGS: Record<PwaAppId, PwaAppConfig> = {
  portal: {
    id: "portal",
    name: "ELIO Portal",
    shortName: "ELIO",
    description: "ELIO — one platform for your whole dental practice.",
    startUrl: "/launcher",
    scope: "/",
    serviceWorkerPath: "/sw.js",
    offlineUrl: "/offline.html",
    ...SHARED,
  },
  pay: {
    id: "pay",
    name: "ElioPay",
    shortName: "ElioPay",
    description: "Payroll, pay periods, and dentist pay for your practice.",
    startUrl: "/pay",
    scope: "/pay/",
    serviceWorkerPath: "/pay/sw.js",
    offlineUrl: "/pay/offline.html",
    ...SHARED,
  },
  plans: {
    id: "plans",
    name: "ElioPlans",
    shortName: "ElioPlans",
    description: "Patient membership plans and billing for your practice.",
    startUrl: "/plans",
    scope: "/plans/",
    serviceWorkerPath: "/plans/sw.js",
    offlineUrl: "/plans/offline.html",
    ...SHARED,
  },
  flow: {
    id: "flow",
    name: "ElioFlow",
    shortName: "ElioFlow",
    description: "Consult workflow, pipeline, and practice operations.",
    startUrl: "/flow",
    scope: "/flow/",
    serviceWorkerPath: "/flow/sw.js",
    offlineUrl: "/flow/offline.html",
    ...SHARED,
  },
  admin: {
    id: "admin",
    name: "ELIO Admin",
    shortName: "Admin",
    description: "ELIO platform control centre — internal staff only.",
    startUrl: "/",
    scope: "/",
    serviceWorkerPath: "/sw.js",
    offlineUrl: "/offline.html",
    ...SHARED,
  },
};

export function getPwaConfig(id: PwaAppId): PwaAppConfig {
  return PWA_APP_CONFIGS[id];
}
