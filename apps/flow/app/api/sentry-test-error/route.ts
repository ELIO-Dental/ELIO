// Dev-only route to verify Sentry wiring: hit /api/sentry-test-error and
// confirm the error appears in the Sentry dashboard once SENTRY_DSN is set
// (project-docs/MASTER_BUILD_GUIDE.md Step 0.6 Testing checklist).
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not available in production", { status: 404 });
  }
  throw new Error("Sentry wiring test error (apps/flow) — expected, not a bug");
}
