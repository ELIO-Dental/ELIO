import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { seedDefaultTerms } from "@/lib/documents-service";

/** Generate default Terms &amp; Conditions (P4.3). */
export async function POST() {
  try {
    const session = await requirePermission("plans:edit-settings");
    const document = await seedDefaultTerms(session.practiceId);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.document.seed_terms",
      targetType: "PlanDocument",
      targetId: document.id,
      metadata: { version: document.version },
    });
    return NextResponse.json({ success: true, document });
  } catch (e) {
    return errorResponse(e);
  }
}
