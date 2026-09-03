// Inngest's Next.js App Router handler — wires up every background function
// registered in packages/dentally (and any future module's background jobs)
// so Inngest can invoke them. See packages/dentally/src/inngest.ts for the
// background-job tooling decision (Inngest over Trigger.dev) and why.
import { serve } from "inngest/next";
import { inngest } from "@elio/dentally";
import { dentallyFullSyncFunction } from "@/lib/dentally-full-sync";

// Each Inngest step is one serverless invocation. Resource phases (esp.
// invoices+treatments) need headroom beyond the default 60s.
export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dentallyFullSyncFunction],
});
