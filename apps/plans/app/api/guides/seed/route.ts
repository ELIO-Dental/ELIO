import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { seedDefaultGuides } from "@/lib/guides-service";

/** Seed default guide articles (P4.5). */
export async function POST() {
  try {
    const session = await requirePermission("plans:edit-settings");
    const result = await seedDefaultGuides(session.practiceId);

    if (result.created > 0) {
      await writeAuditLog({
        ...resolveAuditActor(session),
        practiceId: session.practiceId,
        action: "plans.guide.seed",
        targetType: "PlanGuideArticle",
        targetId: session.practiceId,
        metadata: { created: result.created },
      });
    }

    return NextResponse.json({
      message: result.created > 0 ? "Default guides created" : "Guides already exist",
      ...result,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
