import { NextResponse } from "next/server";
import type { PlanRedeemItemType } from "@elio/db";
import { resolveAuditActor } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { createRedeem } from "@/lib/plans-service";

const ITEM_TYPES: PlanRedeemItemType[] = ["EXAMINATION", "HYGIENE", "DISCOUNT", "OTHER"];

/**
 * List redeems is server-rendered on the page; POST creates from Dentally
 * appointment (P4.6). Gated on `plans:resolve-mismatch`, the same
 * permission the sibling approve/reject route (redeems/[id]/route.ts) uses
 * for "issue redeems" per PERMISSIONS_MATRIX.md §4 — this route previously
 * only checked the PLANS module licence, not role, so any authenticated
 * STAFF/AUDITOR user with Plans access could create a redeem record with no
 * server-side role check at all (found in a security review, 2026-09-12).
 */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:resolve-mismatch");
    const body = await req.json().catch(() => ({}));
    const {
      planPatientId,
      patientPlanEnrolmentId,
      itemType,
      itemName,
      description,
      appointmentDate,
      appointmentRef,
      dentallyAppointmentId,
    } = body ?? {};

    if (typeof planPatientId !== "string" || !planPatientId) {
      return NextResponse.json({ error: "planPatientId is required" }, { status: 400 });
    }
    if (typeof itemType !== "string" || !ITEM_TYPES.includes(itemType as PlanRedeemItemType)) {
      return NextResponse.json({ error: "Invalid itemType" }, { status: 400 });
    }
    if (typeof itemName !== "string" || !itemName.trim()) {
      return NextResponse.json({ error: "itemName is required" }, { status: 400 });
    }

    const redeem = await createRedeem(session.practiceId, resolveAuditActor(session), {
      planPatientId,
      patientPlanEnrolmentId: typeof patientPlanEnrolmentId === "string" ? patientPlanEnrolmentId : undefined,
      itemType: itemType as PlanRedeemItemType,
      itemName,
      description: typeof description === "string" ? description : undefined,
      appointmentDate: typeof appointmentDate === "string" ? appointmentDate : undefined,
      appointmentRef: typeof appointmentRef === "string" ? appointmentRef : undefined,
      dentallyAppointmentId: typeof dentallyAppointmentId === "string" ? dentallyAppointmentId : undefined,
    });

    return NextResponse.json({ redeem }, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      const msg = e.message;
      if (
        msg.includes("already been redeemed") ||
        msg.includes("not active") ||
        msg.startsWith("Maximum") ||
        msg.startsWith("Cooldown")
      ) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    return errorResponse(e);
  }
}
