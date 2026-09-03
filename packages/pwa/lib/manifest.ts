import type { PwaAppConfig } from "./config";

export interface WebManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

export interface WebManifestShortcut {
  name: string;
  short_name?: string;
  url: string;
  icons?: WebManifestIcon[];
}

export interface WebManifest {
  id?: string;
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope?: string;
  display?: "standalone" | "browser" | "fullscreen" | "minimal-ui";
  display_override?: ("window-controls-overlay" | "standalone" | "browser" | "fullscreen" | "minimal-ui")[];
  orientation?: string;
  theme_color?: string;
  background_color?: string;
  categories?: string[];
  prefer_related_applications?: boolean;
  icons: WebManifestIcon[];
  shortcuts?: WebManifestShortcut[];
}

/** Build a web app manifest for the given ELIO app zone. */
export function buildWebManifest(config: PwaAppConfig): WebManifest {
  const iconBase = config.scope === "/" ? "/icons" : `${config.scope.replace(/\/$/, "")}/icons`;

  return {
    id: config.id,
    name: config.name,
    short_name: config.shortName,
    description: config.description,
    start_url: config.startUrl,
    scope: config.scope,
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    theme_color: config.themeColor,
    background_color: config.backgroundColor,
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: `${iconBase}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconBase}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconBase}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: buildShortcuts(config),
  };
}

function buildShortcuts(config: PwaAppConfig): WebManifestShortcut[] | undefined {
  if (config.id === "portal") {
    return [
      { name: "Dashboard", short_name: "Home", url: "/launcher", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ElioPay", url: "/pay", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ElioPlans", url: "/plans", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ElioFlow", url: "/flow", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ];
  }

  if (config.id === "pay") {
    return [{ name: "Pay periods", url: "/pay/pay-periods", icons: [{ src: "/pay/icons/icon-192.png", sizes: "192x192" }] }];
  }
  if (config.id === "plans") {
    return [{ name: "Patients", url: "/plans/patients", icons: [{ src: "/plans/icons/icon-192.png", sizes: "192x192" }] }];
  }
  if (config.id === "flow") {
    return [{ name: "Pipeline", url: "/flow/pipeline", icons: [{ src: "/flow/icons/icon-192.png", sizes: "192x192" }] }];
  }

  return undefined;
}
