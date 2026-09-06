import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requireAnyPermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { filterPayslipsForScope, resolvePayPractitionerScope } from "@/lib/pay-scope";

/** Step 30 — period detail; clinicians receive only their own payslip entries. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnyPermission(
      "pay:view",
      "pay:view:readonly",
      "pay:view-own-payslip"
    );
    const { id } = await params;
    const scope = await resolvePayPractitionerScope(session.practiceId, session);
    if (!scope.viewAll && !scope.dentistId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = scopedDb(session.practiceId);
    const payPeriod = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: { include: { dentist: true, privateRevenueLineItems: true } },
        compassStatements: scope.viewAll
          ? { include: { lines: { include: { dentist: true } } } }
          : false,
      },
    });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payslipEntries = filterPayslipsForScope(payPeriod.payslipEntries, scope);
    return NextResponse.json({
      payPeriod: {
        ...payPeriod,
        payslipEntries,
        compassStatements: scope.viewAll ? payPeriod.compassStatements : [],
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
