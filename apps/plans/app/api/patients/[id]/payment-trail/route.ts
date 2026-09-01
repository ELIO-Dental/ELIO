import { NextResponse } from "next/server";
import { fetchLivePatientPanel, DentallySyncConfigError } from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPlanPatientDetail } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** GoCardless + Dentally payment trail for a plan patient (P2.3a). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:view-payments");
    const { id } = await params;
    const detail = await getPlanPatientDetail(session.practiceId, id);
    if (!detail) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const goCardlessPayments = detail.payments.map((p) => ({
      id: p.id,
      source: "gocardless" as const,
      paidAt: p.createdAt.toISOString(),
      amountPence: p.amountPence,
      status: p.status,
      billingPeriod: p.billingPeriod,
      gocardlessPaymentId: p.gocardlessPaymentId,
    }));

    let dentallyPayments: Array<{
      id: string;
      source: "dentally";
      paidAt: string | null;
      amountPence: number;
      method: string | null;
    }> = [];
    let dentallyConfigured = true;

    try {
      const panel = await fetchLivePatientPanel(session.practiceId, detail.patientId);
      dentallyPayments = panel.payments.map((p) => ({
        id: p.id,
        source: "dentally" as const,
        paidAt: p.paidAt,
        amountPence: p.amountPence,
        method: p.method,
      }));
    } catch (e) {
      if (e instanceof DentallySyncConfigError) {
        dentallyConfigured = false;
      } else if (!(e instanceof Error && e.message === "Patient not found")) {
        throw e;
      }
    }

    return NextResponse.json({
      goCardlessPayments,
      dentallyPayments,
      dentallyConfigured,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
