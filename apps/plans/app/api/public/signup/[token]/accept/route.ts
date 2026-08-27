import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { acceptSigningRequestByToken } from "@/lib/plans-service";

/** PUBLIC, UNAUTHENTICATED — signup step 2, T&Cs e-sign. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json();
    if (typeof body?.signatureData !== "string" || !body.signatureData.trim()) {
      return NextResponse.json({ error: "A signature (typed full name) is required" }, { status: 400 });
    }
    const forwardedFor = req.headers.get("x-forwarded-for");
    const signatureIp = forwardedFor ? forwardedFor.split(",")[0]?.trim() : undefined;

    const result = await acceptSigningRequestByToken(token, {
      signatureData: body.signatureData.trim(),
      signatureIp,
    });
    return NextResponse.json({ signed: true, signedAt: result.signingRequest.signedAt });
  } catch (e) {
    return errorResponse(e);
  }
}
