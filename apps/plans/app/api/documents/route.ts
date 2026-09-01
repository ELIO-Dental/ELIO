import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import type { PlanDocumentType } from "@elio/db";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { createDocument, listDocuments } from "@/lib/documents-service";

const DOCUMENT_TYPES: PlanDocumentType[] = ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY", "PLAN_AGREEMENT"];

function parseDocumentBody(body: unknown) {
  const b = body as Record<string, unknown>;
  const type = typeof b?.type === "string" ? b.type : "";
  if (!DOCUMENT_TYPES.includes(type as PlanDocumentType)) {
    throw new Error("Invalid document type");
  }
  if (typeof b?.title !== "string" || !b.title.trim()) throw new Error("title is required");
  if (typeof b?.content !== "string" || !b.content.trim()) throw new Error("content is required");
  if (typeof b?.version !== "string" || !b.version.trim()) throw new Error("version is required");
  if (typeof b?.effectiveDate !== "string" || !b.effectiveDate) throw new Error("effectiveDate is required");

  return {
    type: type as PlanDocumentType,
    title: b.title,
    content: b.content,
    version: b.version,
    effectiveDate: b.effectiveDate,
    isActive: b.isActive !== false,
  };
}

export async function GET() {
  try {
    const session = await requireLicensedSession();
    const documents = await listDocuments(session.practiceId);
    return NextResponse.json({ documents });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const input = parseDocumentBody(await req.json());
    const document = await createDocument(session.practiceId, input);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.document.created",
      targetType: "PlanDocument",
      targetId: document.id,
      metadata: { type: document.type, version: document.version },
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
