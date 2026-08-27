import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, processWebhookEvent, type GoCardlessEvent } from "@/lib/plans-service";

// Runs in the Node.js runtime (see apps/plans/middleware.ts's comment for
// why: @elio/db's generated Prisma client and Node's `crypto`, used by
// verifyWebhookSignature, don't load under Next's Edge Runtime).
export const runtime = "nodejs";

/**
 * POST /api/webhooks/gocardless — the highest-risk route in the platform
 * (MASTER_BUILD_GUIDE.md §1.7). Verifies the HMAC-SHA256 signature GoCardless
 * sends in the `Webhook-Signature` header before touching the body at all,
 * then processes every event in the batch idempotently via
 * processWebhookEvent() (packages/plans-engine's idempotentCreate, guarded at
 * both the event-replay level and BUG-1's PlanPayment unique-constraint
 * level) — matches ElioPlans' real production handler
 * (D:\WEB DEV\Hish\ElioPlans\src\app\api\webhooks\gocardless\route.ts)
 * functionally.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("Webhook-Signature") || "";

    if (!verifyWebhookSignature(body, signature)) {
      console.error("[GoCardless Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body) as { events?: GoCardlessEvent[] };
    const events = payload.events ?? [];

    for (const event of events) {
      await processWebhookEvent(event);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GoCardless Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
