import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPaySettings } from "@/lib/pay-settings-service";
import {
  PayslipEmailConfigError,
  sendAllPayslipEmails,
  summarizePayslipEmailBatch,
} from "@/lib/payslip-email";

/** Email all payslip PDFs for a period (legacy send-all-emails, Y3.8). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:download-payslip");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            payPeriod: true,
            privateRevenueLineItems: { include: { treatment: true } },
          },
        },
      },
    });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.payslipEntries.length === 0) {
      return NextResponse.json({ error: "No payslips for this period" }, { status: 404 });
    }

    const withEmail = payPeriod.payslipEntries.filter((e) => e.dentist.email?.trim());
    if (withEmail.length === 0) {
      return NextResponse.json(
        { error: "No dentists have email addresses configured" },
        { status: 400 }
      );
    }

    const settings = await getPaySettings(session.practiceId);
    const results = await sendAllPayslipEmails({
      payslips: payPeriod.payslipEntries,
      settings,
    });

    const sent = results.filter((r) => r.status === "sent").length;
    if (sent === 0 && results.some((r) => r.status === "failed")) {
      const firstError = results.find((r) => r.error)?.error ?? "Failed to send emails";
      return NextResponse.json({ error: firstError, results }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: summarizePayslipEmailBatch(results),
      results,
    });
  } catch (err) {
    if (err instanceof PayslipEmailConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
