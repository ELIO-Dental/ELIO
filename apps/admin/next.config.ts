import type { NextConfig } from "next";

// Step 2.3 — apps/admin is a genuinely standalone app (admin.elioportal.co.uk),
// NOT a multi-zone module proxied through apps/shell like pay/plans/flow —
// so no basePath, no rewrites. See PERFORMANCE_SCALABILITY.md §7: this is its
// own Vercel project and its own domain, deliberately isolated from the
// clinic-facing shell.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@elio/ui"],
  // See apps/shell/next.config.ts's identical comment — Next's file tracer
  // doesn't reliably include Prisma's native engine binary from a custom
  // `output` path, causing every deployed DB query to crash on Vercel.
  outputFileTracingIncludes: {
    "/**": [
      "../../packages/db/generated/client/**",
      "packages/db/generated/client/**",
    ],
  },
};

export default nextConfig;
