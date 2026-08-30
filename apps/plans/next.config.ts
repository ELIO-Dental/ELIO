import type { NextConfig } from "next";

// Multi-zone integration (Step 1.7, mirroring apps/pay's Step 1.6 pattern):
// apps/shell owns the top-level domain and rewrites everything under
// /plans/* to this app (see apps/shell/next.config.ts), so ElioPlans renders
// "inside the shared shell" — same origin, same NextAuth session cookie,
// shared sidebar/header — without a separate login. This app therefore
// serves all its own routes under the /plans basePath so links generated
// here (Link/router.push/redirect) automatically match what the shell
// rewrites.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: "/plans",
  transpilePackages: ["@elio/ui", "@elio/pwa"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
