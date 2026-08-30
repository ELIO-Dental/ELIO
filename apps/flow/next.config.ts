import type { NextConfig } from "next";

// Multi-zone integration (Step 1.8, mirroring apps/pay's Step 1.6 and
// apps/plans' Step 1.7 pattern): apps/shell owns the top-level domain and
// rewrites everything under /flow/* to this app (see apps/shell/next.config.ts),
// so ElioFlow renders "inside the shared shell" — same origin, same NextAuth
// session cookie, shared sidebar/header — without a separate login. This app
// therefore serves all its own routes under the /flow basePath so links
// generated here (Link/router.push/redirect) automatically match what the
// shell rewrites. Any client-side fetch() call must be manually prefixed
// with "/flow" too — Next's basePath does NOT auto-prefix raw fetch() calls,
// only Link/router navigation (a real bug found and fixed the hard way in
// Step 1.7's public signup flow — see PROJECT_STATE.md's 1.7 closeout entry).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: "/flow",
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
