import type { NextConfig } from "next";

// Multi-zone integration (Step 1.6): apps/shell owns the top-level domain and
// rewrites everything under /pay/* to this app (see apps/shell/next.config.ts),
// so ElioPay renders "inside the shared shell" — same origin, same NextAuth
// session cookie, shared sidebar/header — without a separate login. This app
// therefore serves all its own routes under the /pay basePath so links generated
// here (Link/router.push/redirect) automatically match what the shell rewrites.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: "/pay",
  transpilePackages: ["@elio/ui", "@elio/pwa"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  // pdfkit ships .afm font files it reads from disk at runtime by relative path;
  // Next's bundler otherwise rewrites its module path and breaks that lookup
  // (ENOENT for Helvetica.afm). Keep it external/un-bundled instead.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
