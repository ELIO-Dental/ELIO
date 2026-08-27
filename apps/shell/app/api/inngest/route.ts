// Inngest's Next.js App Router handler — wires up every background function
// registered in packages/dentally (and any future module's background jobs)
// so Inngest can invoke them. See packages/dentally/src/inngest.ts for the
// background-job tooling decision (Inngest over Trigger.dev) and why.
import { serve } from "inngest/next";
import { inngest, dentallySyncFunction } from "@elio/dentally";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dentallySyncFunction],
});
