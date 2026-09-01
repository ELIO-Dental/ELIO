import { NextResponse } from "next/server";
import {
  createSavedEntity,
  deleteSavedEntity,
  listSavedEntities,
  updateSavedEntity,
} from "@/lib/saved-entities";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Saved labs/suppliers with bank details (legacy /api/bills/saved-entities, Y3.2). */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const entities = await listSavedEntities(session.practiceId);
    return NextResponse.json(entities);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const body = (await req.json()) as Record<string, unknown>;
    const type = body.type === "supplier" ? "supplier" : body.type === "lab" ? "lab" : null;
    if (!type) return NextResponse.json({ error: "type must be lab or supplier" }, { status: 400 });

    const result = await createSavedEntity(session.practiceId, type, body as { name: string });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Name already exists") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const body = (await req.json()) as Record<string, unknown>;
    const type = body.type === "supplier" ? "supplier" : body.type === "lab" ? "lab" : null;
    const id = typeof body.id === "string" ? body.id : "";
    if (!type || !id) return NextResponse.json({ error: "type and id are required" }, { status: 400 });

    const result = await updateSavedEntity(session.practiceId, type, id, body as { name: string });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && (err.message === "Saved lab not found" || err.message === "Saved supplier not found")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") === "supplier" ? "supplier" : searchParams.get("type") === "lab" ? "lab" : null;
    const id = searchParams.get("id");
    if (!type || !id) return NextResponse.json({ error: "type and id are required" }, { status: 400 });

    await deleteSavedEntity(session.practiceId, type, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && (err.message === "Saved lab not found" || err.message === "Saved supplier not found")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
