import type { NextConfig } from "next";

const PAY_APP_ORIGIN = process.env.PAY_APP_ORIGIN ?? "http://localhost:3001";
const PLANS_APP_ORIGIN = process.env.PLANS_APP_ORIGIN ?? "http://localhost:3002";
const FLOW_APP_ORIGIN = process.env.FLOW_APP_ORIGIN ?? "http://localhost:3003";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@elio/ui"],
  // Multi-zone integration (Step 1.6, MASTER_BUILD_GUIDE.md): ElioPay renders
  // "inside the shared shell" (shared sidebar/header, single NextAuth session,
  // no separate login) by living at the same origin as the shell and being
  // proxied here via rewrites to its own Next.js app/port, per Next.js's
  // documented multi-zone pattern. apps/pay sets basePath: "/pay" so every
  // route/asset it emits already matches this prefix.
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
