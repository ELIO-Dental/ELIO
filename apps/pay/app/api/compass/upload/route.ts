import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { uploadAndParseCompassStatement } from "@/lib/pay-service";

/**
 * §6.2 — Compass statement upload -> parse -> persist PayLine rows.
 *
 * NOTE: real blob storage (@vercel/blob, per DATA_MODEL §3's `fileUrl`) is
 * not wired into this app yet — not installed as a dependency in this
 * session. The uploaded PDF bytes are parsed directly in-memory (the real
 * @elio/pay-engine parser, not a stub) and `fileUrl` is recorded as a
 * placeholder `local://<filename>` reference so the flow is provably
 * end-to-end for parsing/DB-persistence; swapping in real blob upload is a
 * follow-up, flagged in the final report, not silently faked.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:upload-statement");
    const form = await req.formData();
    const file = form.get("file");
    const payPeriodId = form.get("payPeriodId");

    if (!(file instanceof File) || typeof payPeriodId !== "string") {
      return NextResponse.json({ error: "file and payPeriodId are required" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndParseCompassStatement(session.practiceId, payPeriodId, `local://${file.name}`, buf);
    return NextResponse.json({ result }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
