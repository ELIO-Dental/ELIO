import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { processNhsStatement } from "@/lib/process-nhs-statement";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
  if (message === "Pay period not found") return NextResponse.json({ error: message }, { status: 404 });
  if (message === "No NHS dentists configured" || message.startsWith("No UDAs found")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return errorResponse(err);
}

/** NHS statement upload / manual UDA entry (legacy Y2.8). Coexists with Compass upload. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:upload-statement");
    const { id: payPeriodId } = await params;
    const form = await req.formData();

    const pdfFile = form.get("pdf_file") ?? form.get("file");
    const manualUdasRaw = form.get("manual_udas");
    const nhsPeriodStart = form.get("nhs_period_start");
    const nhsPeriodEnd = form.get("nhs_period_end");

    let manualUdas: Record<string, number> | undefined;
    if (typeof manualUdasRaw === "string" && manualUdasRaw.trim()) {
      manualUdas = JSON.parse(manualUdasRaw) as Record<string, number>;
    }

    const result = await processNhsStatement(session.practiceId, payPeriodId, {
      pdfBuffer: pdfFile instanceof File && pdfFile.size > 0 ? Buffer.from(await pdfFile.arrayBuffer()) : undefined,
      manualUdas,
      nhsPeriodStart: typeof nhsPeriodStart === "string" ? nhsPeriodStart : undefined,
      nhsPeriodEnd: typeof nhsPeriodEnd === "string" ? nhsPeriodEnd : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return handleError(err);
  }
}

/** NHS dentist configuration for the statement panel. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:view");
    const { id: payPeriodId } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({
      where: { id: payPeriodId },
      select: { nhsPeriodStart: true, nhsPeriodEnd: true, status: true },
    });
    if (!payPeriod) return NextResponse.json({ error: "Pay period not found" }, { status: 404 });

    const nhsDentists = await db.dentist.findMany({
      where: { nhsPerformerNumber: { not: null } },
      select: { id: true, name: true, nhsPerformerNumber: true, udaRatePence: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      locked: payPeriod.status === "LOCKED",
      nhsPeriodStart: payPeriod.nhsPeriodStart?.toISOString().slice(0, 10) ?? null,
      nhsPeriodEnd: payPeriod.nhsPeriodEnd?.toISOString().slice(0, 10) ?? null,
      nhsDentists: nhsDentists.map((d) => ({
        id: d.id,
        name: d.name,
        performerNumber: d.nhsPerformerNumber,
        udaRatePence: d.udaRatePence,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}
