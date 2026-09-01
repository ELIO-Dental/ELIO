import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { buildPlanPatientListWhere, derivePatientDisplayStatus } from "@/lib/patient-list-filters";

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Export filtered patients list as CSV (P2.5). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireViewPayments();
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const where = buildPlanPatientListWhere(session.practiceId, { q, status });

    const rows = await prisma.planPatient.findMany({
      where,
      include: {
        patient: true,
        planModel: { select: { name: true, monthlyPricePence: true } },
        mandates: { select: { status: true } },
        documentAcceptances: { take: 1, select: { id: true } },
        patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const headers = ["Name", "Email", "Phone", "Plan", "Status", "T&Cs Signed", "Joined", "Dentally ID", "Has Active Mandate"];
    const lines = rows.map((pp) => {
      const name = [pp.patient.firstName, pp.patient.lastName].filter(Boolean).join(" ") || "";
      const planName = pp.patientPlans[0]?.plan.name ?? pp.planModel?.name ?? "";
      const displayStatus = derivePatientDisplayStatus(pp);
      const hasActiveMandate = pp.mandates.some((m) => m.status === "ACTIVE");
      return [
        name,
        pp.patient.email ?? "",
        pp.patient.phone ?? "",
        planName,
        displayStatus,
        pp.documentAcceptances.length > 0 ? "Yes" : "No",
        pp.createdAt.toISOString().slice(0, 10),
        pp.patient.dentallyId,
        hasActiveMandate ? "Yes" : "No",
      ].map(csvEscape);
    });

    const csvBody = [headers.map(csvEscape).join(","), ...lines.map((l) => l.join(","))].join("\n");
    const csv = `\uFEFF${csvBody}`;
    const filename = `patients-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
