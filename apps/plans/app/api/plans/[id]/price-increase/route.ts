import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { formatMoneyGBP } from "@elio/ui";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { increasePlanPrice } from "@/lib/plans-service";
import { sendPriceIncreaseEmail } from "@/lib/email";
import { logPlanEmail } from "@/lib/patient-correspondence";

type RouteParams = { params: Promise<{ id: string }> };

/** Plan price increase with versioning + patient emails (P4.2). */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const { id } = await params;
    const body = await req.json();

    const newMonthlyPricePence =
      typeof body?.newMonthlyPricePence === "number"
        ? body.newMonthlyPricePence
        : Math.round(Number(body?.newPrice) * 100);

    const effectiveDate = typeof body?.effectiveDate === "string" ? body.effectiveDate : undefined;

    const result = await increasePlanPrice(session.practiceId, id, {
      newMonthlyPricePence,
      effectiveDate,
    });

    const db = scopedDb(session.practiceId);
    const plan = await db.planModel.findUnique({ where: { id: result.newPlanId } });
    const practice = await db.practice.findUnique({ where: { id: session.practiceId } });
    const practiceName = practice?.name ?? "your practice";
    const planName = plan?.name ?? "membership plan";
    const oldPriceFormatted = formatMoneyGBP(result.oldMonthlyPricePence);
    const newPriceFormatted = formatMoneyGBP(result.newMonthlyPricePence);

    const errors: string[] = [];
    let emailsSent = 0;
    for (const patient of result.patients) {
      if (!patient.email) continue;
      const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Member";
      const subject = `Changes to your ${planName} membership — ${practiceName}`;
      const sendResult = await sendPriceIncreaseEmail({
        to: patient.email,
        patientName: name,
        planName,
        practiceName,
        oldPriceFormatted,
        newPriceFormatted,
        effectiveDate: result.effectiveDate,
      });
      if (sendResult.success) emailsSent++;
      else errors.push(`Email failed for ${patient.email}`);
      if (patient.planPatientId) {
        await logPlanEmail({
          practiceId: session.practiceId,
          planPatientId: patient.planPatientId,
          to: patient.email,
          subject,
          type: "price_increase",
          status: sendResult.success ? "sent" : "failed",
          messageId: sendResult.messageId ?? null,
          sentById: session.userId,
          error: sendResult.error ?? null,
        }).catch((e) => console.error("[plans] failed to log price increase email:", e));
      }
    }

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.plan.price_increase",
      targetType: "PlanModel",
      targetId: result.newPlanId,
      metadata: {
        oldPlanId: result.oldPlanId,
        oldMonthlyPricePence: result.oldMonthlyPricePence,
        newMonthlyPricePence: result.newMonthlyPricePence,
        effectiveDate: result.effectiveDate,
        emailsSent,
        totalPatients: result.totalPatients,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Plan price updated from ${oldPriceFormatted} to ${newPriceFormatted}`,
      newPlanId: result.newPlanId,
      totalPatients: result.totalPatients,
      emailsSent,
      subscriptionsUpdated: 0,
      errors,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
