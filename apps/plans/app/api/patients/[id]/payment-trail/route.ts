import { NextResponse } from "next/server";
import { fetchLivePatientPanel, DentallySyncConfigError } from "@elio/dentally";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPlanPatientDetail } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

type TrailEntry = {
  id: string;
  source: "gocardless" | "dentally";
  paidAt: string | null;
  amountPence: number;
  status?: string;
  billingPeriod?: string | null;
  method?: string | null;
  description?: string;
};

/** GoCardless + Dentally payment trail merged chronologically (P2.3a). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireViewPayments();
    const { id } = await params;
    const detail = await getPlanPatientDetail(session.practiceId, id);
    if (!detail) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const trail: TrailEntry[] = detail.payments.map((p) => ({
      id: p.id,
      source: "gocardless" as const,
      paidAt: p.createdAt.toISOString(),
      amountPence: p.amountPence,
      status: p.status,
      billingPeriod: p.billingPeriod,
      description: p.gocardlessPaymentId ? `GC ${p.gocardlessPaymentId}` : "Membership charge",
    }));

    let dentallyConfigured = true;

    try {
      const panel = await fetchLivePatientPanel(session.practiceId, detail.patientId);
      for (const p of panel.payments) {
        trail.push({
          id: `dentally-${p.id}`,
          source: "dentally",
          paidAt: p.paidAt,
          amountPence: p.amountPence,
          method: p.method,
          description: p.method ? `Dentally ${p.method}` : "Dentally payment",
        });
      }
    } catch (e) {
      if (e instanceof DentallySyncConfigError) {
        dentallyConfigured = false;
      } else if (!(e instanceof Error && e.message === "Patient not found")) {
        throw e;
      }
    }

    trail.sort((a, b) => {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({
      trail,
      goCardlessPayments: trail.filter((t) => t.source === "gocardless"),
      dentallyPayments: trail.filter((t) => t.source === "dentally"),
      dentallyConfigured,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
