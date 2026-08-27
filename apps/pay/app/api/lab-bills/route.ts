import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listLabBills, createLabBill } from "@/lib/pay-service";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const { searchParams } = new URL(req.url);
    const dentistId = searchParams.get("dentistId") ?? undefined;
    const labBills = await listLabBills(session.practiceId, dentistId);
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
    const labBill = await createLabBill(session.practiceId, body);
    return NextResponse.json({ labBill }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
