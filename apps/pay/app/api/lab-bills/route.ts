import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { createLabBill, deleteLabBill, listLabBills, updateLabBill } from "@/lib/pay-service";
import { errorResponse } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const { searchParams } = new URL(req.url);
    const dentistId = searchParams.get("dentistId") ?? undefined;
    const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
    const labBills = await listLabBills(session.practiceId, { dentistId, year, month });
    return NextResponse.json({ labBills });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const body = await req.json();
    const labBill = await createLabBill(session.practiceId, {
      dentistId: body.dentistId ?? body.dentist_id ?? null,
      savedLabId: body.savedLabId ?? null,
      labName: body.labName ?? body.lab_name ?? null,
      amountPence: Number(body.amountPence ?? Math.round(Number(body.amount) * 100)),
      description: body.description ?? null,
      fileUrl: body.fileUrl ?? body.file_url ?? null,
      billDate: body.billDate ?? body.date ?? null,
    });
    return NextResponse.json({ labBill }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
