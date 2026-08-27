import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { scopedDb } from "@elio/db";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const db = scopedDb(session.practiceId);
    const practice = await db.practice.findUniqueOrThrow({
      where: { id: session.practiceId },
      select: { cosmeticConsultationTreatmentCode: true },
    });
    return NextResponse.json(practice);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const body = await req.json();
    const cosmeticConsultationTreatmentCode: string | null =
      typeof body.cosmeticConsultationTreatmentCode === "string" && body.cosmeticConsultationTreatmentCode.length > 0
        ? body.cosmeticConsultationTreatmentCode
        : null;

    const db = scopedDb(session.practiceId);
    const practice = await db.practice.update({
      where: { id: session.practiceId },
      data: { cosmeticConsultationTreatmentCode },
      select: { cosmeticConsultationTreatmentCode: true },
    });
    return NextResponse.json(practice);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
