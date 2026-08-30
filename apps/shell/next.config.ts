import type { NextConfig } from "next";

const PAY_APP_ORIGIN = process.env.PAY_APP_ORIGIN ?? "http://localhost:3001";
const PLANS_APP_ORIGIN = process.env.PLANS_APP_ORIGIN ?? "http://localhost:3002";
const FLOW_APP_ORIGIN = process.env.FLOW_APP_ORIGIN ?? "http://localhost:3003";
const ADMIN_APP_ORIGIN = process.env.ADMIN_APP_ORIGIN ?? "https://admin.elioportal.co.uk";

// Step 1.9 (MASTER_BUILD_GUIDE.md §1.9, line 940/950) — path-preserving 301
// redirects from the 3 retired Aura/ElioFlow domains to the equivalent path
// on app.elioportal.co.uk. Host-matched via Next's `has: [{ type: "host" }]`
// redirect condition, so this is completely inert until (and unless) DNS for
// one of these old domains is actually pointed at this Vercel project — it
// does nothing to any currently-live app on those domains today. Do NOT
// point real DNS at this until Hisham has confirmed the cutover plan,
// especially for auraplans.co.uk (live GoCardless webhook, see PROJECT_STATE.md).
const OLD_DOMAINS = ["aurapayments.co.uk", "auraplans.co.uk", "elioflow.co.uk"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@elio/ui", "@elio/pwa"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/admin", destination: ADMIN_APP_ORIGIN, permanent: false },
      { source: "/admin/:path*", destination: `${ADMIN_APP_ORIGIN}/:path*`, permanent: false },
      ...OLD_DOMAINS.flatMap((domain) => [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: domain }],
        destination: "https://app.elioportal.co.uk/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: `www.${domain}` }],
        destination: "https://app.elioportal.co.uk/:path*",
        permanent: true,
      },
    ]),
    ];
  },
  // Multi-zone integration (Step 1.6, MASTER_BUILD_GUIDE.md): ElioPay renders
  // "inside the shared shell" (shared sidebar/header, single NextAuth session,
  // no separate login) by living at the same origin as the shell and being
  // proxied here via rewrites to its own Next.js app/port, per Next.js's
  // documented multi-zone pattern. apps/pay sets basePath: "/pay" so every
  // route/asset it emits already matches this prefix.
  //
  // On Vercel, vercel.json's own top-level `rewrites` array (platform-level,
  // handled at the edge before the request reaches this app at all) takes
  // over instead — found live (2026-08-28): this app-level version, run
  // through Next.js's own server-side fetch, consistently failed with
  // Vercel's DNS_HOSTNAME_RESOLVED_PRIVATE error when proxying to another
  // Vercel project (both a *.vercel.app alias and a real custom subdomain),
  // even though the destination was directly reachable and DNS resolved
  // correctly every time it was checked independently. This config stays
  // ONLY so `next dev`/`next start` still proxy correctly locally, where
  // vercel.json's rewrites are never honored.
  async rewrites() {
    return [
      { source: "/pay", destination: `${PAY_APP_ORIGIN}/pay` },
      { source: "/pay/:path*", destination: `${PAY_APP_ORIGIN}/pay/:path*` },
      // Step 1.7 — same multi-zone pattern for ElioPlans.
      { source: "/plans", destination: `${PLANS_APP_ORIGIN}/plans` },
      { source: "/plans/:path*", destination: `${PLANS_APP_ORIGIN}/plans/:path*` },
      // Step 1.8 — same multi-zone pattern for ElioFlow.
      { source: "/flow", destination: `${FLOW_APP_ORIGIN}/flow` },
      { source: "/flow/:path*", destination: `${FLOW_APP_ORIGIN}/flow/:path*` },
    ];
  },
};

export default nextConfig;
