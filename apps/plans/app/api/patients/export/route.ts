import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Export filtered patients list as CSV (P2.5). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireViewPayments();
    const q = req.nextUrl.searchParams.get("q");
    const status = req.nextUrl.searchParams.get("status");

    const where = {
      practiceId: session.practiceId,
      ...(status ? { status: status as "INVITED" | "SIGNED" | "ACTIVE" | "PAUSED" | "CANCELLED" } : {}),
      ...(q
        ? {
            patient: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" as const } },
                { lastName: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const rows = await prisma.planPatient.findMany({
      where,
      include: {
        patient: true,
        planModel: { select: { name: true, monthlyPricePence: true } },
        mandates: { where: { status: "ACTIVE" }, take: 1 },
        patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const headers = ["Name", "Email", "Phone", "Plan", "Status", "Dentally ID", "Enrolled", "Has Active Mandate"];
    const lines = rows.map((pp) => {
      const name = [pp.patient.firstName, pp.patient.lastName].filter(Boolean).join(" ") || "";
      const planName = pp.patientPlans[0]?.plan.name ?? pp.planModel?.name ?? "";
      const pendingDd =
        pp.status === "ACTIVE" && pp.mandates.length === 0 && (pp.planModel?.monthlyPricePence ?? 0) > 0;
      const displayStatus = pendingDd ? "PENDING_DD" : pp.status;
      return [
        name,
        pp.patient.email ?? "",
        pp.patient.phone ?? "",
        planName,
        displayStatus,
        pp.patient.dentallyId,
        pp.createdAt.toISOString().slice(0, 10),
        pp.mandates.length > 0 ? "Yes" : "No",
      ].map(csvEscape);
    });

    const csv = [headers.map(csvEscape).join(","), ...lines.map((l) => l.join(","))].join("\n");
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
