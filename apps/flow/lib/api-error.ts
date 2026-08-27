import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "./session";

/** Shared route-handler error -> NextResponse mapping (ENGINEERING_CONVENTIONS.md),
 * mirrors apps/plans/lib/api-error.ts. */
export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
}
